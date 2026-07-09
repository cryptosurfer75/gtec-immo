// Publication des annonces GTEC sur leboncoin.fr (Import API) — appelée par le CRM (session).
// Le contenu de l'annonce (titre, prix, adresse, photos...) est construit côté client
// (crm/leboncoin.js) : ce n'est pas une donnée sensible, elle est déjà visible par tout
// utilisateur connecté du CRM via la table `offres`. Cette fonction, elle, ne laisse JAMAIS
// sortir le jeton d'accès ni le user_id leboncoin vers le navigateur — elle les injecte
// elle-même dans la requête envoyée à leboncoin.
//
// Actions (POST { action, ... }) :
//   status          { offre_id }                    → lignes offre_leboncoin existantes
//   publish         { offre_id, ad_type, payload }   → crée ou met à jour l'annonce (vente/location)
//   delete          { offre_id, ad_type }            → retire l'annonce de leboncoin
//   check-status    { offre_id, ad_type }            → secours manuel si le webhook tarde
//   connexion-test  {}                               → force un rafraîchissement de jeton
//
// Secrets attendus (Supabase → Settings → Edge Functions → Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injectés d'office),
//   LEBONCOIN_ENV ("qa" ou "prod"),
//   LEBONCOIN_{QA|PROD}_API_BASE, LEBONCOIN_{QA|PROD}_COGNITO_BASE,
//   LEBONCOIN_{QA|PROD}_CLIENT_ID, LEBONCOIN_{QA|PROD}_CLIENT_SECRET.
// La ligne de jetons (user_id/refresh_token) vit dans la table leboncoin_tokens, une par
// environnement, amorcée manuellement (voir CADRAGE.md §8).
// verify_jwt=true (config.toml) : seul un agent connecté au CRM peut appeler cette fonction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function utilisateurAppelant(req: Request, sbAdmin: ReturnType<typeof createClient>) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await sbAdmin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

// Config de l'environnement courant (qa/prod), lue depuis les secrets.
function envConfig() {
  const env = (Deno.env.get("LEBONCOIN_ENV") || "qa").toLowerCase();
  const pfx = "LEBONCOIN_" + env.toUpperCase() + "_";
  const apiBase = Deno.env.get(pfx + "API_BASE");
  const cognitoBase = Deno.env.get(pfx + "COGNITO_BASE");
  const clientId = Deno.env.get(pfx + "CLIENT_ID");
  const clientSecret = Deno.env.get(pfx + "CLIENT_SECRET");
  return { env, apiBase, cognitoBase, clientId, clientSecret };
}

// Rafraîchit le jeton d'accès leboncoin si besoin (Cognito, grant refresh_token), met à jour
// la ligne leboncoin_tokens de l'environnement courant, renvoie { access_token, user_id }.
async function jetonValideLbc(sbAdmin: ReturnType<typeof createClient>, cfg: ReturnType<typeof envConfig>) {
  const { data: row } = await sbAdmin.from("leboncoin_tokens").select("*").eq("environnement", cfg.env).maybeSingle();
  if (!row) return null;
  const expireBientot = !row.expires_at || new Date(row.expires_at).getTime() < Date.now() + 60_000;
  if (!expireBientot) return { access_token: row.access_token as string, user_id: row.user_id as string };

  // Cognito exige le couple client_id/client_secret en Basic Auth quand le client en a un.
  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  const r = await fetch(`${cfg.cognitoBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
      client_id: cfg.clientId!,
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.access_token) { console.error("refresh leboncoin", cfg.env, out); return null; }
  const expires_at = new Date(Date.now() + (out.expires_in || 3600) * 1000).toISOString();
  await sbAdmin.from("leboncoin_tokens").update({ access_token: out.access_token, expires_at }).eq("environnement", cfg.env);
  return { access_token: out.access_token as string, user_id: row.user_id as string };
}

async function referenceOffre(sbAdmin: ReturnType<typeof createClient>, offreId: string) {
  const { data } = await sbAdmin.from("offres").select("reference").eq("id", offreId).maybeSingle();
  return (data?.reference as string) || null;
}

function suffixeRef(reference: string, adType: string) {
  return `${reference}-${adType === "vente" ? "V" : "L"}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbAdmin = createClient(SB_URL, SB_KEY);

    const user = await utilisateurAppelant(req, sbAdmin);
    if (!user) return json({ error: "Non authentifié." }, 401);

    const cfg = envConfig();
    if (!cfg.apiBase || !cfg.cognitoBase || !cfg.clientId || !cfg.clientSecret) {
      return json({ error: `Secrets LEBONCOIN_${cfg.env.toUpperCase()}_* non configurés.` }, 500);
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action as string;

    if (action === "status") {
      const { offre_id } = body;
      if (!offre_id) return json({ error: "offre_id manquant." }, 400);
      const { data, error } = await sbAdmin.from("offre_leboncoin").select("*").eq("offre_id", offre_id);
      if (error) throw error;
      return json({ lignes: data || [] });
    }

    if (action === "connexion-test") {
      const jeton = await jetonValideLbc(sbAdmin, cfg);
      return json({ connected: !!jeton, environnement: cfg.env });
    }

    if (action === "publish") {
      const { offre_id, ad_type, payload } = body;
      if (!offre_id || !["vente", "location"].includes(ad_type) || !payload) {
        return json({ error: "offre_id, ad_type (vente/location) et payload sont requis." }, 400);
      }
      const reference = await referenceOffre(sbAdmin, offre_id);
      if (!reference) return json({ error: "Bien introuvable." }, 404);
      const partnerRef = suffixeRef(reference, ad_type);

      const jeton = await jetonValideLbc(sbAdmin, cfg);
      if (!jeton) return json({ error: "leboncoin non connecté (jeton indisponible)." }, 500);

      const { data: existante } = await sbAdmin.from("offre_leboncoin")
        .select("id,statut").eq("offre_id", offre_id).eq("ad_type", ad_type).maybeSingle();

      const apiBody = {
        user_id: jeton.user_id,
        partner_unique_reference: partnerRef,
        site: ["leboncoin"],
        ad: { ...payload.ad, type: ad_type === "vente" ? "1" : "2" },
        ...(payload.ad_reply ? { ad_reply: payload.ad_reply } : {}),
        client: payload.client,
        location: payload.location,
        media: payload.media,
      };

      const url = existante
        ? `${cfg.apiBase}/api/ad/real_estate/${encodeURIComponent(partnerRef)}`
        : `${cfg.apiBase}/api/ad/real_estate`;
      const r = await fetch(url, {
        method: existante ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jeton.access_token}` },
        body: JSON.stringify(apiBody),
      });
      const out = await r.json().catch(() => ({}));

      if (!r.ok) {
        await sbAdmin.from("offre_leboncoin").upsert({
          offre_id, ad_type, partner_unique_reference: partnerRef, environnement: cfg.env,
          statut: "erreur", derniere_erreur: JSON.stringify(out).slice(0, 2000), dernier_payload: apiBody,
        }, { onConflict: "offre_id,ad_type" });
        console.error("publish leboncoin", cfg.env, r.status, out);
        return json({ error: "leboncoin a refusé la requête.", detail: out }, 502);
      }

      await sbAdmin.from("offre_leboncoin").upsert({
        offre_id, ad_type, partner_unique_reference: partnerRef, environnement: cfg.env,
        statut: existante ? "en_cours_maj" : "en_cours_publication",
        derniere_erreur: null, dernier_payload: apiBody, maj_le: new Date().toISOString(),
        ...(existante ? {} : { publie_le: new Date().toISOString() }),
      }, { onConflict: "offre_id,ad_type" });

      return json({ ok: true, partner_unique_reference: partnerRef });
    }

    if (action === "delete") {
      const { offre_id, ad_type } = body;
      if (!offre_id || !["vente", "location"].includes(ad_type)) {
        return json({ error: "offre_id et ad_type (vente/location) sont requis." }, 400);
      }
      const { data: existante } = await sbAdmin.from("offre_leboncoin")
        .select("*").eq("offre_id", offre_id).eq("ad_type", ad_type).maybeSingle();
      if (!existante) return json({ error: "Aucune annonce à retirer." }, 404);

      const jeton = await jetonValideLbc(sbAdmin, cfg);
      if (!jeton) return json({ error: "leboncoin non connecté (jeton indisponible)." }, 500);

      const url = `${cfg.apiBase}/api/ad/real_estate/user_id/${encodeURIComponent(jeton.user_id)}/${encodeURIComponent(existante.partner_unique_reference)}`;
      const r = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${jeton.access_token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("delete leboncoin", cfg.env, r.status, out);
        return json({ error: "leboncoin a refusé la suppression.", detail: out }, 502);
      }
      await sbAdmin.from("offre_leboncoin").update({
        statut: "en_cours_suppression", derniere_erreur: null, maj_le: new Date().toISOString(),
      }).eq("id", existante.id);
      return json({ ok: true });
    }

    if (action === "check-status") {
      // Secours manuel si le webhook tarde. Endpoint de suivi non entièrement vérifié dans la
      // doc au moment de l'écriture (api/common/broadcast_monitoring.html) — à confirmer/ajuster
      // lors des tests en bac à sable (Phase 8 du plan) si la réponse ne correspond pas.
      const { offre_id, ad_type } = body;
      const { data: existante } = await sbAdmin.from("offre_leboncoin")
        .select("*").eq("offre_id", offre_id).eq("ad_type", ad_type).maybeSingle();
      if (!existante) return json({ error: "Aucune annonce suivie pour ce bien." }, 404);

      const jeton = await jetonValideLbc(sbAdmin, cfg);
      if (!jeton) return json({ error: "leboncoin non connecté (jeton indisponible)." }, 500);

      const r = await fetch(`${cfg.apiBase}/api/ads?` + new URLSearchParams({ user_id: jeton.user_id, partner_unique_reference: existante.partner_unique_reference }), {
        headers: { Authorization: `Bearer ${jeton.access_token}` },
      });
      const out = await r.json().catch(() => ({}));
      return json({ ok: r.ok, detail: out });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
