// Relances d'impayés GTEC — envoie par e-mail (Resend) un rappel aux clients dont
// la facture est échue et non réglée. Escalade : J+1→J+7 rappel courtois (niveau 1),
// J+8→J+14 relance (niveau 2), J+15+ mise en demeure (niveau 3). On n'envoie un niveau
// que s'il est strictement supérieur au dernier niveau déjà envoyé pour cette facture.
//
// Deux modes :
//   - batch (body vide / cron quotidien) : parcourt toutes les factures en retard.
//   - ciblé (body {facture_id, niveau?}) : relance immédiate déclenchée depuis le CRM.
//
// Secrets attendus (Supabase → Settings → Edge Functions → Secrets) :
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (injectés d'office),
//   RESEND_API_KEY, RELANCE_FROM (ex. "GTEC Immobilier <compta@gtec-immobilier.fr>").

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const euro = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
const fmtDate = (d: string) => { const [y, m, j] = String(d).slice(0, 10).split("-"); return `${j}/${m}/${y}`; };
const niveauPour = (jours: number) => (jours >= 15 ? 3 : jours >= 8 ? 2 : 1);

const RAISON = "GTEC Immobilier";
const PENALITES = "3 fois le taux d'intérêt légal";

function corpsEmail(f: any, niveau: number, jours: number) {
  const reste = euro(Number(f.total_ttc) - Number(f.montant_paye || 0));
  const intro: Record<number, string> = {
    1: `Sauf erreur de notre part, la facture ${f.reference} d'un montant de ${reste}, échue le ${fmtDate(f.date_echeance)}, demeure impayée à ce jour.`,
    2: `Malgré notre précédent rappel, la facture ${f.reference} (${reste}), échue depuis ${jours} jours, reste impayée.`,
    3: `En l'absence de règlement de la facture ${f.reference} (${reste}), échue depuis ${jours} jours, nous vous mettons en demeure de procéder à son paiement sous 8 jours. À défaut, des pénalités de retard (${PENALITES}) et une indemnité forfaitaire de 40 € seront exigibles.`,
  };
  const sujet: Record<number, string> = {
    1: `Rappel — facture ${f.reference} en attente de règlement`,
    2: `Relance — facture ${f.reference} impayée`,
    3: `Mise en demeure — facture ${f.reference}`,
  };
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#2A3338;line-height:1.6">
    <p>Bonjour,</p><p>${intro[niveau]}</p>
    <p>Nous vous remercions de bien vouloir régulariser ce règlement dans les meilleurs délais.</p>
    <p>Bien cordialement,<br><b>${RAISON}</b></p></div>`;
  return { sujet: sujet[niveau], html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")!;
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const FROM = Deno.env.get("RELANCE_FROM") || "GTEC Immobilier <onboarding@resend.dev>";
    if (!RESEND) return json({ error: "RESEND_API_KEY non configurée." }, 500);

    const sb = createClient(SB_URL, SB_KEY);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const cible = body?.facture_id as string | undefined;

    // 1) Sélection des factures en retard, non payées.
    const today = new Date().toISOString().slice(0, 10);
    let q = sb.from("factures")
      .select("id,reference,date_echeance,total_ttc,montant_paye,statut,type,clients(email,nom,prenom,raison_sociale,type_client)")
      .eq("type", "facture")
      .in("statut", ["emise", "partiellement_payee"]);
    if (cible) q = q.eq("id", cible);
    else q = q.lt("date_echeance", today);
    const { data: factures, error } = await q;
    if (error) throw error;

    const resultats: any[] = [];
    for (const f of factures || []) {
      const reste = Number(f.total_ttc) - Number(f.montant_paye || 0);
      if (reste <= 0) continue;
      const jours = Math.floor((+new Date(today) - +new Date(f.date_echeance)) / 86400000);
      if (!cible && jours < 1) continue;
      const niveau = body?.niveau ? Number(body.niveau) : niveauPour(Math.max(jours, 1));

      // 2) Garde anti-doublon : dernier niveau déjà envoyé.
      const { data: dejaList } = await sb.from("relances")
        .select("niveau").eq("facture_id", f.id).eq("statut", "envoyee")
        .order("niveau", { ascending: false }).limit(1);
      const dernier = dejaList && dejaList.length ? dejaList[0].niveau : 0;
      if (!cible && niveau <= dernier) { resultats.push({ ref: f.reference, skip: "niveau déjà envoyé" }); continue; }

      // 3) Client sans e-mail → on journalise, pas d'envoi.
      const email = (f as any).clients?.email;
      if (!email) {
        await sb.from("relances").insert({ facture_id: f.id, niveau, canal: "email", statut: "ignore_sans_email" });
        resultats.push({ ref: f.reference, skip: "client sans e-mail" });
        continue;
      }

      // 4) Envoi via Resend.
      const { sujet, html } = corpsEmail(f, niveau, jours);
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [email], subject: sujet, html }),
      });
      const out = await r.json().catch(() => ({}));
      const ok = r.ok;
      await sb.from("relances").insert({
        facture_id: f.id, niveau, canal: "email", destinataire: email,
        statut: ok ? "envoyee" : "echec", message_id: out?.id || null,
      });
      resultats.push({ ref: f.reference, niveau, email, envoye: ok, erreur: ok ? null : out });
    }

    return json({ traitees: resultats.length, resultats });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
