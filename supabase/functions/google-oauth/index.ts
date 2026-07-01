// Connexion Google Contacts GTEC — permet à un agent de récupérer, depuis le CRM,
// le contact fraîchement scanné avec l'appli Google Contacts sur son téléphone.
// Le lecteur de carte de visite reste Google (gratuit, sans compte tiers à payer) ;
// cette fonction ne fait que relier ce contact au CRM via l'API officielle (People API).
//
// Actions (POST { action, ... }) :
//   authorize        → renvoie l'URL de connexion Google à ouvrir (aucune donnée sensible)
//   exchange          → { code } reçu au retour de Google, échangé contre les jetons, stockés
//   status            → { connected, email } pour l'utilisateur connecté (jamais les jetons)
//   deauthorize       → révoque le jeton côté Google puis supprime la ligne
//   contacts-recent   → renvoie les derniers contacts scannés (pas les jetons)
//
// Secrets attendus (Supabase → Settings → Edge Functions → Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injectés d'office),
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (projet Google Cloud "gtec-immo").
// verify_jwt=true (config.toml) : seul un agent connecté au CRM peut appeler cette fonction.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const REDIRECT_URI = "https://gtec-immobilier.fr/crm/";
const SCOPE = "https://www.googleapis.com/auth/contacts.readonly";

async function utilisateurAppelant(req: Request, sbAdmin: ReturnType<typeof createClient>) {
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await sbAdmin.auth.getUser(jwt);
  if (error || !data?.user) return null;
  return data.user;
}

// Rafraîchit le jeton d'accès si besoin, met à jour la ligne, renvoie un jeton d'accès valide.
async function jetonValide(sbAdmin: ReturnType<typeof createClient>, userId: string, CLIENT_ID: string, CLIENT_SECRET: string) {
  const { data: row } = await sbAdmin.from("user_google_tokens").select("*").eq("user_id", userId).maybeSingle();
  if (!row) return null;
  const expireBientot = !row.expires_at || new Date(row.expires_at).getTime() < Date.now() + 60_000;
  if (!expireBientot) return row.access_token as string;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: row.refresh_token, grant_type: "refresh_token",
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.access_token) return null;
  const expires_at = new Date(Date.now() + (out.expires_in || 3600) * 1000).toISOString();
  await sbAdmin.from("user_google_tokens").update({ access_token: out.access_token, expires_at }).eq("user_id", userId);
  return out.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!CLIENT_ID || !CLIENT_SECRET) return json({ error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurés." }, 500);

    const sbAdmin = createClient(SB_URL, SB_KEY);
    const user = await utilisateurAppelant(req, sbAdmin);
    if (!user) return json({ error: "Non authentifié." }, 401);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action as string;

    if (action === "authorize") {
      const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code",
        scope: SCOPE, access_type: "offline", prompt: "consent",
      });
      return json({ url });
    }

    if (action === "exchange") {
      const code = body?.code as string;
      if (!code) return json({ error: "Code manquant." }, 400);
      const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
        }),
      });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.access_token) { console.error("exchange", out); return json({ error: "Connexion Google refusée." }, 500); }

      // E-mail du compte connecté, juste pour l'affichage du statut.
      const info = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${out.access_token}` },
      }).then((r2) => r2.json()).catch(() => ({}));

      const expires_at = new Date(Date.now() + (out.expires_in || 3600) * 1000).toISOString();
      const { error: upErr } = await sbAdmin.from("user_google_tokens").upsert({
        user_id: user.id, google_email: info?.email || null,
        access_token: out.access_token, refresh_token: out.refresh_token, expires_at,
      });
      if (upErr) throw upErr;
      return json({ connected: true, email: info?.email || null });
    }

    if (action === "status") {
      const { data: row } = await sbAdmin.from("user_google_tokens").select("google_email").eq("user_id", user.id).maybeSingle();
      return json(row ? { connected: true, email: row.google_email } : { connected: false });
    }

    if (action === "deauthorize") {
      const token = await jetonValide(sbAdmin, user.id, CLIENT_ID, CLIENT_SECRET);
      if (token) {
        await fetch("https://oauth2.googleapis.com/revoke?" + new URLSearchParams({ token }), { method: "POST" }).catch(() => {});
      }
      await sbAdmin.from("user_google_tokens").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    if (action === "contacts-recent") {
      const token = await jetonValide(sbAdmin, user.id, CLIENT_ID, CLIENT_SECRET);
      if (!token) return json({ error: "Google non connecté." }, 400);
      const r = await fetch("https://people.googleapis.com/v1/people/me/connections?" + new URLSearchParams({
        personFields: "names,organizations,phoneNumbers,emailAddresses,addresses",
        sortOrder: "LAST_MODIFIED_DESCENDING", pageSize: "8",
      }), { headers: { Authorization: `Bearer ${token}` } });
      const out = await r.json().catch(() => ({}));
      if (!r.ok) { console.error("contacts-recent", out); return json({ error: "Lecture des contacts impossible." }, 500); }

      const contacts = (out.connections || []).map((p: any) => {
        const n = p.names?.[0] || {};
        const org = p.organizations?.[0] || {};
        return {
          nom: n.familyName || "", prenom: n.givenName || "",
          societe: org.name || "", fonction: org.title || "",
          telephone: p.phoneNumbers?.[0]?.value || "",
          email: p.emailAddresses?.[0]?.value || "",
          adresse: p.addresses?.[0]?.formattedValue || "",
        };
      }).filter((c: any) => c.nom || c.prenom || c.societe);
      return json({ contacts });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
