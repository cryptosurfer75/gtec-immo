// Réception des statuts asynchrones envoyés par leboncoin (webhook "feedback" de leur Import
// API) : une requête à /api/ad/real_estate ne fait qu'accuser réception (HTTP 200 = accepté,
// pas publié) — le vrai statut (en ligne / erreur / modération / suppression...) arrive plus
// tard via cet endpoint, que leboncoin appelle directement (pas de session CRM).
//
// Le format exact du payload envoyé par leboncoin n'a pas été entièrement vérifié dans la doc
// au moment de l'écriture (voir https://doc-lbc.import.prod.advgo.net/api/feedback/index.html).
// Cette fonction journalise TOUJOURS le payload brut reçu (console.error, visible dans les logs
// Supabase) pour ajuster l'extraction ci-dessous lors des tests en bac à sable (Phase 8 du plan
// leboncoin) sans avoir à republier une nouvelle version en aveugle.
//
// Secrets attendus : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injectés d'office),
//   LEBONCOIN_WEBHOOK_SECRET (chaîne aléatoire, vérifiée en query string ?key=...).
// verify_jwt=false (config.toml) : appelée par leboncoin, pas par un agent connecté.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

// Statuts leboncoin observés en QA le 2026-07-15 : "ad_edited" (mise à jour appliquée avec
// succès) et "ad_deleted" (retrait). Valeurs plausibles pour la création ("ad_created") et le
// refus modération ("ad_refused") ajoutées par prudence, non encore observées dans un payload réel.
function mapperStatut(brut: string | undefined | null): string | null {
  const s = (brut || "").toLowerCase();
  if (!s) return null;
  if (["ok", "success", "online", "published", "active", "created", "edited"].some((v) => s.includes(v))) return "publie";
  if (["error", "failed", "failure", "rejected", "refused", "ko"].some((v) => s.includes(v))) return "erreur";
  if (["removed", "deleted", "offline", "inactive"].some((v) => s.includes(v))) return "retire";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const url = new URL(req.url);
    const secretAttendu = Deno.env.get("LEBONCOIN_WEBHOOK_SECRET");
    if (!secretAttendu || url.searchParams.get("key") !== secretAttendu) {
      // On répond 200 quand même côté transport pour ne pas révéler la validité de la clé,
      // mais on ne fait rien : à surveiller dans les logs si ça arrive de façon inattendue.
      console.error("leboncoin-webhook: clé invalide ou absente");
      return json({ ok: true });
    }

    const payload = await req.json().catch(() => null);
    console.error("leboncoin-webhook payload:", JSON.stringify(payload));
    if (!payload) return json({ ok: true });

    // Tentatives d'extraction sur plusieurs formes plausibles (liste d'événements ou objet unique).
    const evenements: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.events) ? payload.events : [payload];

    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbAdmin = createClient(SB_URL, SB_KEY);

    for (const ev of evenements) {
      const partnerRef: string | undefined =
        ev?.partner_unique_reference || ev?.partner_reference || ev?.reference || ev?.ad?.partner_unique_reference;
      if (!partnerRef) continue;

      const statutBrut: string | undefined = ev?.status || ev?.state || ev?.result?.status || ev?.type;
      const statut = mapperStatut(statutBrut);
      const erreur: string | undefined = ev?.error || ev?.message || ev?.result?.message;
      // Payload réel du 2026-07-15 : pas de champ ad_id direct, l'identifiant est dans l'URL
      // de l'annonce publiée (ex. https://www.qa3.bon-coin.net/vi/5002536710.htm).
      const adId: string | undefined =
        ev?.ad_id || ev?.leboncoin_ad_id || ev?.id ||
        (typeof ev?.url === "string" ? ev.url.match(/\/vi\/(\d+)\.htm/)?.[1] : undefined);

      const patch: Record<string, unknown> = { maj_le: new Date().toISOString() };
      if (statut) patch.statut = statut;
      if (erreur) patch.derniere_erreur = String(erreur).slice(0, 2000);
      else if (statut === "publie") patch.derniere_erreur = null;
      if (adId) patch.leboncoin_ad_id = String(adId);

      const { error } = await sbAdmin.from("offre_leboncoin").update(patch).eq("partner_unique_reference", partnerRef);
      if (error) console.error("leboncoin-webhook update", partnerRef, error.message);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("leboncoin-webhook erreur", e);
    return json({ ok: true }); // toujours 200 pour éviter les tentatives de renvoi côté leboncoin
  }
});
