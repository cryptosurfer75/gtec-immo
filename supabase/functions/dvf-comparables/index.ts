// Relais DVF — ventes comparables pour l'avis de valeur GTEC.
// Le navigateur ne peut pas lire les fichiers DVF (pas de CORS) : cette fonction
// les récupère côté serveur, filtre les ventes de locaux commerciaux/industriels,
// calcule le prix/m² et la distance au bien, puis renvoie la liste triée par proximité.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Index des colonnes du CSV geo-dvf (séparateur virgule, sans guillemets sur ces champs)
const C = { id: 0, date: 1, nature: 3, vv: 4, num: 5, suff: 6, voie: 7, cp: 9, commune: 11, type: 30, bati: 31, terrain: 37, lon: 38, lat: 39 };
const TYPE_COMM = "Local industriel. commercial ou assimilé";

function haversine(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, t = Math.PI / 180;
  const dLa = (la2 - la1) * t, dLo = (lo2 - lo1) * t;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dLo / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = new URL(req.url);
    const p: Record<string, string> = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : Object.fromEntries(url.searchParams);

    const insee = String(p.insee || "").trim();
    if (insee.length < 5) return json({ error: "Paramètre 'insee' (code commune) requis." }, 400);
    const dep = String(p.dep || insee.slice(0, 2));
    const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lon);
    const maxDist = parseInt(p.dist || "2000", 10);     // rayon en mètres
    const nYears = parseInt(p.years || "5", 10);

    // Fenêtre = n dernières années glissantes
    const now = new Date();
    const cutoff = new Date(now); cutoff.setFullYear(now.getFullYear() - nYears);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    const years: number[] = [];
    for (let y = now.getFullYear(); y >= cutoff.getFullYear(); y--) years.push(y);

    const byMut = new Map<string, any>();
    const fetched: number[] = [];
    await Promise.all(years.map(async (y) => {
      const u = `https://files.data.gouv.fr/geo-dvf/latest/csv/${y}/communes/${dep}/${insee}.csv`;
      const res = await fetch(u).catch(() => null);
      if (!res || !res.ok) return; // année absente -> on saute
      fetched.push(y);
      const txt = await res.text();
      const lines = txt.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const r = lines[i].split(",");
        if (r.length < 40) continue;
        if (r[C.nature] !== "Vente" || r[C.type] !== TYPE_COMM) continue;
        if (r[C.date] < cutoffISO) continue;
        const bati = parseFloat(r[C.bati]); if (!(bati > 0)) continue;
        const vv = parseFloat(r[C.vv]); if (!(vv > 0)) continue;
        const id = r[C.id];
        const prev = byMut.get(id);
        // une mutation = plusieurs lignes (lots) : on garde la ligne avec le plus de bâti
        if (!prev || bati > prev.bati) {
          byMut.set(id, {
            date: r[C.date],
            adresse: [r[C.num], r[C.suff], r[C.voie]].filter(Boolean).join(" ").trim(),
            commune: r[C.commune],
            code_postal: r[C.cp],
            bati,
            terrain: parseFloat(r[C.terrain]) || null,
            vv,
            prix_m2: Math.round(vv / bati),
            lat: parseFloat(r[C.lat]) || null,
            lon: parseFloat(r[C.lon]) || null,
          });
        }
      }
    }));

    let items = [...byMut.values()];
    for (const c of items) c.dist = (hasPoint && c.lat && c.lon) ? haversine(lat, lon, c.lat, c.lon) : null;
    if (hasPoint) items = items.filter((c) => c.dist == null || c.dist <= maxDist);
    items.sort((a, b) => {
      if (a.dist != null && b.dist != null) return a.dist - b.dist || b.date.localeCompare(a.date);
      return b.date.localeCompare(a.date);
    });
    items = items.slice(0, 40);

    return json({ count: items.length, annees: fetched.sort(), depuis: cutoffISO, items });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
