/* ============================================================================
   GTEC IMMOBILIER — Générateur de dossier de présentation
   ----------------------------------------------------------------------------
   Reproduit la trame PowerPoint GTEC (10 pages paysage) en HTML imprimable,
   auto-remplie depuis les données d'un bien du CRM.
   Usage :  GTEC_DOSSIER.generer(offreId)
   Dépend de la variable globale `sb` (client Supabase déjà initialisé).
   Fichier autonome : ne touche à rien d'autre dans le CRM.
   ========================================================================== */
(function(){
  'use strict';

  // -- Identité GTEC -----------------------------------------------------------
  // Clé Google Maps (Static Maps). Vide = on retombe sur les cartes libres.
  // À restreindre par référent HTTP au domaine gtec-immobilier.fr dans la console Google.
  const GMAPS_KEY = 'AIzaSyBvPpjWZpcGSgSIFmCiRC6pnPjzI332GRU';
  const LOGO = 'https://gtec-immobilier.fr/logo-gtec.png';
  const CONTACT = { nom:'Florent BOURDIEC', tel:'06 29 98 35 69', mail:'florent.bourdiec@gtec-immo.com' };
  const SECTIONS = ['Localisation','Descriptif du bien','Équipements','Détail des surfaces',
                    'Conditions juridiques et financières','Photos','Plans'];

  // -- Petites aides -----------------------------------------------------------
  const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const euroMois = v => (v==null||v==='') ? null : new Intl.NumberFormat('fr-FR').format(Math.round(v));
  const cap = s => !s ? '' : s.charAt(0).toUpperCase()+s.slice(1);

  function transactionLabel(t){
    if(t==='vente') return 'À VENDRE';
    return 'À LOUER';
  }
  function typeLabel(t){
    const m = { bureaux:'BUREAUX', commerce:'COMMERCE', 'local-activite':"LOCAL D'ACTIVITÉ",
                entrepot:'ENTREPÔT', terrain:'TERRAIN', 'fonds-de-commerce':'FONDS DE COMMERCE' };
    return (m[t] || (t||'BIEN')).toUpperCase();
  }

  // Met les équipements (objet {catégorie:[items]}) à plat en une liste simple
  function equipListe(equip){
    if(!equip || typeof equip!=='object') return [];
    const out=[];
    Object.values(equip).forEach(arr=>{ if(Array.isArray(arr)) arr.forEach(x=>out.push(x)); });
    return out;
  }

  // -- Récupération des données ------------------------------------------------
  async function charger(offreId){
    const { data:o, error } = await sb.from('offres').select('*').eq('id', offreId).single();
    if(error || !o) throw (error || new Error('Bien introuvable'));
    let photos=[];
    try{
      const { data } = await sb.from('offre_photos').select('*').eq('offre_id', offreId);
      photos = data || [];
    }catch(e){ photos=[]; }
    // tri : principale d'abord, puis ordre
    photos.sort((a,b)=>((b.est_principale?1:0)-(a.est_principale?1:0)) || ((a.ordre||0)-(b.ordre||0)));
    return { o, photos };
  }

  // -- Construction d'une page (gabarit commun) --------------------------------
  function page(titre, contenu, opts){
    opts = opts || {};
    const actif = opts.actif || titre;
    const num = opts.num || '';
    const nav = SECTIONS.map(s=>{
      const on = (s===actif) || (actif==='Localisation' && s==='Localisation');
      return `<div class="navcell"><span>${esc(s)}</span><i class="${on?'on':''}"></i></div>`;
    }).join('');
    return `<section class="pg">
      <header class="pg-h">
        <h1>${esc(titre)}</h1>
        <img class="pg-logo" src="${LOGO}" alt="GTEC">
      </header>
      <div class="pg-body">${contenu}</div>
      <footer class="pg-f">
        <div class="nav">${nav}</div>
        <div class="pg-num">${num}</div>
      </footer>
    </section>`;
  }

  // -- Les pages du dossier ----------------------------------------------------
  function pageCouverture(o){
    const photo = o.cover_url || '';
    const surf = o.surface_m2 ? `${o.surface_m2} m²` : '';
    const niv = o.etage ? ` en ${esc(o.etage)}` : '';
    return `<section class="pg cover">
      <div class="cover-top">
        <div class="cover-cat">${typeLabel(o.type_bien)}<br><b>${transactionLabel(o.transaction)}</b></div>
        <img class="cover-logo" src="${LOGO}" alt="GTEC">
      </div>
      <div class="cover-img">${photo?`<img src="${esc(photo)}" alt="">`:'<div class="ph">Photo de couverture à ajouter</div>'}</div>
      <div class="cover-band">
        <div class="cover-ville">${esc((o.ville||'').toUpperCase())}</div>
        <div class="cover-meta">${typeLabel(o.type_bien)} - ${transactionLabel(o.transaction)}<br>${esc(surf)}${niv}</div>
      </div>
    </section>`;
  }

  function pageSommaire(){
    const items = SECTIONS.map((s,i)=>`<li><span class="num">${i+1}</span>${esc(s)}</li>`).join('');
    return `<section class="pg">
      <header class="pg-h center"><h1>Sommaire</h1><img class="pg-logo" src="${LOGO}" alt="GTEC"></header>
      <div class="pg-body"><ol class="sommaire">${items}</ol></div>
      <footer class="pg-f"><div class="pg-num">2</div></footer>
    </section>`;
  }

  // URL d'une carte statique Google (plan routier ou vue aérienne avec enseignes)
  function googleStaticUrl(geo, variant){
    if(!GMAPS_KEY || !geo) return null;
    const isAir = variant==='aerienne';
    const type = isAir ? 'hybrid' : 'roadmap';   // hybrid = satellite + noms d'enseignes
    const zoom = isAir ? 16 : 15;                // un peu de hauteur tout en voyant les commerces voisins
    const center = geo.lat+','+geo.lon;
    const marker = 'color:0x3D8074%7C'+center;   // pin vert GTEC sur le bien
    return 'https://maps.googleapis.com/maps/api/staticmap?center='+center
      + '&zoom='+zoom+'&size=640x400&scale=2&maptype='+type
      + '&markers='+marker+'&language=fr&key='+GMAPS_KEY;
  }

  // Étiquette « Locaux disponibles » + flèche reliée au pointeur (centre de la carte).
  // Repère en mm : zone carte = 252 × 135, pointeur au centre (126 ; 67.5).
  function locOverlay(num){
    const id = 'ah-'+num;
    return `<svg class="loc-arrow" viewBox="0 0 252 135" preserveAspectRatio="none">`
      + `<defs><marker id="${id}" markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="5" refY="3.2" orient="auto">`
      + `<path d="M0,0 L7,3.2 L0,6.4 Z" fill="#3D8074"/></marker></defs>`
      + `<line x1="200" y1="60" x2="135" y2="66.5" stroke="#3D8074" stroke-width="1.5" marker-end="url(#${id})"/>`
      + `</svg><span class="loc-tag">Locaux disponibles</span>`;
  }

  function pageLocalisation(o, src, num, label, geo, variant){
    let inner;
    const gUrl = googleStaticUrl(geo, variant);
    const ov = locOverlay(num);
    if(src){
      // Capture importée à la main dans la fiche : elle reste prioritaire
      inner = `<div class="loc-img"><img src="${esc(src)}" alt="">${ov}</div>`;
    } else if(gUrl){
      // Carte Google générée depuis l'adresse (commerces / enseignes voisines visibles)
      inner = `<div class="loc-img"><img src="${esc(gUrl)}" alt="">${ov}</div>`;
    } else if(geo){
      // Secours sans clé : carte libre
      inner = `<div class="loc-img"><div id="locmap-${num}" class="loc-leaflet" data-lat="${geo.lat}" data-lon="${geo.lon}" data-variant="${esc(variant)}"></div>${ov}</div>`;
    } else {
      inner = `<div class="loc-img ph">${esc(label)}<br><small>(adresse à renseigner dans la fiche pour la carte automatique)</small></div>`;
    }
    return page('Localisation', inner, {actif:'Localisation', num});
  }

  // Géocodage gratuit et sans clé via la Base Adresse Nationale (déjà utilisée dans le CRM)
  async function geocoder(o){
    const q = [o.adresse, o.code_postal, o.ville].filter(Boolean).join(' ').trim();
    if(!q) return null;
    try{
      const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q='+encodeURIComponent(q));
      const j = await r.json();
      const f = (j.features||[])[0];
      if(!f || !f.geometry || !f.geometry.coordinates) return null;
      const [lon, lat] = f.geometry.coordinates; // BAN renvoie [longitude, latitude]
      return { lat, lon };
    }catch(e){ return null; }
  }

  function pageDescriptif(o){
    const txt = (o.description||'').trim();
    const body = txt
      ? txt.split(/\n+/).map(p=>`<p>${esc(p)}</p>`).join('')
      : '<p class="ph">Descriptif à renseigner dans la fiche du bien.</p>';
    return page('Descriptif du bien', `<div class="descr">${body}</div>`, {actif:'Descriptif du bien', num:5});
  }

  function pageEquipements(o){
    const liste = equipListe(o.equipements);
    let body;
    if(liste.length){
      const lignes = [];
      for(let i=0;i<liste.length;i+=2){
        lignes.push(`<div class="eq-row"><div class="eq-cell">${esc(liste[i])}</div><div class="eq-cell">${liste[i+1]?esc(liste[i+1]):''}</div></div>`);
      }
      body = `<div class="eq-title">ÉQUIPEMENTS</div><div class="eq-table">${lignes.join('')}</div>`;
    } else {
      body = '<p class="ph">Aucun équipement renseigné dans la fiche.</p>';
    }
    return page('Équipements', body, {actif:'Équipements', num:6});
  }

  function pageSurfaces(o){
    const dispo = o.disponibilite || 'Immédiate';
    const body = `<table class="surf">
      <thead><tr><th>ÉTAGE</th><th>SURFACE</th><th>TYPE DE BIEN</th><th>DISPONIBILITÉ</th></tr></thead>
      <tbody><tr>
        <td>${esc(o.etage||'—')}</td>
        <td>${o.surface_m2?esc(o.surface_m2)+' m²':'—'}</td>
        <td>${esc(cap(o.type_bien||'')||'—')}</td>
        <td>${esc(dispo)}</td>
      </tr></tbody></table>`;
    return page('Détail des surfaces', body, {actif:'Détail des surfaces', num:7});
  }

  function pageConditions(o){
    const sfx = (o.loyer_type==='NET HC') ? 'NET' : 'HT';
    const rows = [
      ['BAIL', o.bail || 'Commercial 3/6/9 ans'],
      ['Indexation annuelle', o.indexation || 'ILAT'],
      ['Régime fiscal', o.regime_fiscal || 'TVA'],
      ['Dépôt de garantie', o.depot_garantie || '—'],
      ['Périodicité paiement', o.periodicite_paiement || 'Trimestriellement ou mensuellement'],
      ['Loyer mensuel', euroMois(o.loyer_annuel_m2) ? `${euroMois(o.loyer_annuel_m2)} € ${sfx}/mois` : '—'],
      ['Provision taxe foncière', euroMois(o.taxe_fonciere) ? `${euroMois(o.taxe_fonciere)} € HT/mois` : '—'],
      ['Provisions pour charges', euroMois(o.charges) ? `${euroMois(o.charges)} € HT/mois` : '—'],
    ];
    if(o.honoraires) rows.push(['Honoraires preneur', o.honoraires]);
    const body = `<table class="cond">${rows.map(r=>`<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>`;
    return page('Conditions juridiques et financières', body, {actif:'Conditions juridiques et financières', num:10});
  }

  function pagePhotos(o, photos){
    const imgs = (photos||[]).map(p=>p.url).filter(Boolean);
    if(!imgs.length && o.cover_url) imgs.push(o.cover_url);
    let body;
    if(imgs.length){
      body = `<div class="grid-photos">${imgs.slice(0,4).map(u=>`<div class="gp"><img src="${esc(u)}" alt=""></div>`).join('')}</div>`;
    } else {
      body = '<p class="ph">Aucune photo dans la fiche. Ajoutez des photos au bien.</p>';
    }
    return page('Photos', body, {actif:'Photos', num:8});
  }

  function pagePlans(o, photos){
    const plans = Array.isArray(o.plans_urls) ? o.plans_urls.filter(Boolean) : [];
    let body;
    if(plans.length){
      body = `<div class="grid-photos">${plans.slice(0,4).map(u=>`<div class="gp"><img src="${esc(u)}" alt=""></div>`).join('')}</div>`;
    } else if(o.plan_url){
      body = `<p class="ph">Plans disponibles sur demande.<br><small>${esc(o.plan_url)}</small></p>`;
    } else {
      body = '<p class="ph">Plans à ajouter à la fiche du bien.</p>';
    }
    return page('Plans', body, {actif:'Plans', num:9});
  }

  function pageContact(){
    return `<section class="pg contact">
      <img class="contact-logo" src="${LOGO}" alt="GTEC">
      <div class="contact-nom">${esc(CONTACT.nom)}</div>
      <div class="contact-tel">${esc(CONTACT.tel)}</div>
      <div class="contact-mail">${esc(CONTACT.mail)}</div>
    </section>`;
  }

  // -- Feuille de style du dossier (paysage, identité GTEC) --------------------
  function styles(){
    return `
      :root{ --navy:#1A2738; --teal:#3D8074; --teal-d:#2f6359; --ink:#1f2a37; }
      *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      html,body{ margin:0; padding:0; background:#444; font-family:'Segoe UI',Arial,sans-serif; color:var(--ink); }
      .toolbar{ position:sticky; top:0; z-index:10; background:var(--navy); color:#fff; padding:12px 20px;
        display:flex; gap:12px; align-items:center; justify-content:space-between; }
      .toolbar b{ font-size:15px; } .toolbar .acts{ display:flex; gap:10px; }
      .toolbar button{ border:0; border-radius:8px; padding:9px 16px; font-size:14px; font-weight:600; cursor:pointer; }
      .btn-print{ background:var(--teal); color:#fff; } .btn-close{ background:#55606e; color:#fff; }
      .sheet{ padding:24px; display:flex; flex-direction:column; align-items:center; gap:20px; }
      .pg{ width:280mm; height:202mm; background:#fff; position:relative; overflow:hidden;
        box-shadow:0 6px 24px rgba(0,0,0,.35); display:flex; flex-direction:column; }
      .pg-h{ display:flex; align-items:center; justify-content:space-between; padding:14mm 14mm 4mm; }
      .pg-h.center{ justify-content:center; position:relative; }
      .pg-h.center .pg-logo{ position:absolute; right:14mm; top:10mm; }
      .pg-h h1{ font-size:30pt; font-weight:600; margin:0; color:#222; }
      .pg-logo{ height:16mm; }
      .pg-body{ flex:1; padding:2mm 14mm; }
      .pg-f{ display:flex; align-items:flex-end; justify-content:space-between; padding:0 12mm 7mm; }
      .pg-f .nav{ display:flex; gap:6px; flex:1; }
      .navcell{ flex:1; text-align:center; }
      .navcell span{ font-size:7.5pt; color:#444; display:block; margin-bottom:3px; line-height:1.1; }
      .navcell i{ display:block; height:7px; background:#bdbdbd; border-radius:2px; }
      .navcell i.on{ background:var(--teal); }
      .pg-num{ font-size:11pt; color:#9aa0a6; padding-left:10px; }
      /* Couverture */
      .cover{ padding:0; }
      .cover-top{ display:flex; justify-content:space-between; align-items:flex-start; padding:10mm 12mm 0; }
      .cover-cat{ font-size:20pt; color:#222; line-height:1.15; } .cover-cat b{ color:#222; }
      .cover-logo{ height:22mm; }
      .cover-img{ flex:1; margin:6mm 0 0; background:#eef0f2; }
      .cover-img img{ width:100%; height:120mm; object-fit:cover; display:block; }
      .cover-img .ph{ height:120mm; display:flex; align-items:center; justify-content:center; color:#9aa0a6; font-size:14pt; }
      .cover-band{ background:var(--teal); color:#fff; display:flex; justify-content:space-between;
        align-items:center; padding:8mm 12mm; }
      .cover-ville{ font-size:26pt; font-weight:700; }
      .cover-meta{ font-size:18pt; text-align:right; line-height:1.3; }
      /* Sommaire */
      .sommaire{ list-style:none; margin:6mm 0 0; padding:0 0 0 6mm; }
      .sommaire li{ display:flex; align-items:center; gap:10mm; font-size:20pt; margin:6mm 0; color:#222; }
      .sommaire .num{ width:13mm; height:13mm; border-radius:50%; background:var(--teal); color:#fff;
        display:flex; align-items:center; justify-content:center; font-size:16pt; font-weight:600; }
      /* Localisation */
      .loc-img{ position:relative; width:100%; height:135mm; background:#e9ecef; border-radius:3px; overflow:hidden; }
      .loc-img img{ width:100%; height:100%; object-fit:cover; }
      .loc-leaflet{ width:100%; height:100%; }
      .loc-leaflet .leaflet-control-attribution{ font-size:8pt; }
      .loc-img.ph{ display:flex; flex-direction:column; align-items:center; justify-content:center; color:#9aa0a6; font-size:13pt; text-align:center; }
      .loc-arrow{ position:absolute; inset:0; width:100%; height:100%; z-index:480; pointer-events:none; }
      .loc-tag{ position:absolute; right:10mm; top:38%; z-index:500; background:var(--teal); color:#fff; padding:6px 14px; border-radius:4px; font-size:12pt; }
      /* Descriptif */
      .descr{ font-size:15pt; line-height:1.6; color:#222; padding-top:6mm; }
      .descr p{ margin:0 0 5mm; }
      /* Équipements */
      .eq-title{ text-align:center; font-size:16pt; font-weight:700; letter-spacing:2px; color:#222; margin:8mm 0 4mm; }
      .eq-table{ border-top:2px solid var(--navy); }
      .eq-row{ display:flex; border-bottom:1px solid #d7dadd; }
      .eq-cell{ flex:1; text-align:center; padding:6mm 4mm; font-size:14pt; color:#222; }
      /* Surfaces & conditions */
      table.surf{ width:100%; border-collapse:collapse; margin-top:8mm; }
      table.surf th{ font-size:13pt; letter-spacing:1px; color:#222; padding:4mm; border-bottom:2px solid var(--navy); text-align:center; }
      table.surf td{ font-size:14pt; text-align:center; padding:6mm 4mm; border-bottom:1px solid #d7dadd; }
      table.cond{ width:100%; border-collapse:collapse; margin-top:4mm; border-top:2px solid var(--navy); }
      table.cond th{ text-align:left; font-size:13pt; padding:4.5mm 2mm; width:42%; color:#222; border-bottom:1px solid #d7dadd; }
      table.cond td{ font-size:13pt; padding:4.5mm 2mm; color:#333; border-bottom:1px solid #d7dadd; }
      /* Photos / plans */
      .grid-photos{ display:grid; grid-template-columns:1fr 1fr; gap:6mm; padding-top:4mm; }
      .gp{ height:62mm; background:#eef0f2; border-radius:3px; overflow:hidden; }
      .gp img{ width:100%; height:100%; object-fit:cover; }
      /* Contact */
      .contact{ background:var(--navy); color:#fff; align-items:center; justify-content:center; gap:6mm; }
      .contact-logo{ height:50mm; margin-top:30mm; }
      .contact-nom{ font-size:24pt; margin-top:6mm; }
      .contact-tel,.contact-mail{ font-size:18pt; color:#7fc8bb; }
      .ph{ color:#9aa0a6; font-style:italic; }
      @media print{
        html,body{ background:#fff; }
        .toolbar{ display:none; }
        .sheet{ padding:0; gap:0; }
        .pg{ box-shadow:none; width:100%; height:100vh; page-break-after:always; break-after:page; }
        @page{ size:A4 landscape; margin:0; }
      }`;
  }

  // Script exécuté dans la fenêtre du dossier : transforme chaque conteneur en carte
  function initCartesScript(){
    return `(function(){
      function tuiles(v){
        return v==='aerienne'
          ? { url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution:'Imagerie © Esri', zoom:18, sub:null }
          : { url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution:'© OpenStreetMap © CARTO', zoom:14, sub:['a','b','c','d'] };
      }
      function go(){
        if(typeof L==='undefined'){ setTimeout(go,150); return; }
        document.querySelectorAll('.loc-leaflet').forEach(function(el){
          var lat=parseFloat(el.dataset.lat), lon=parseFloat(el.dataset.lon);
          if(isNaN(lat)||isNaN(lon)) return;
          var t=tuiles(el.dataset.variant);
          var map=L.map(el,{zoomControl:false,attributionControl:true,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false}).setView([lat,lon],t.zoom);
          var opts={attribution:t.attribution,maxZoom:19};
          if(t.sub) opts.subdomains=t.sub;
          L.tileLayer(t.url,opts).addTo(map);
          L.circleMarker([lat,lon],{radius:13,color:'#fff',weight:2,fillColor:'#3D8074',fillOpacity:.95}).addTo(map);
          setTimeout(function(){ map.invalidateSize(); },200);
        });
      }
      if(document.readyState==='complete') go(); else window.addEventListener('load',go);
    })();`;
  }

  // -- Assemblage + ouverture --------------------------------------------------
  async function generer(offreId){
    if(!offreId){ alert('Aucun bien sélectionné.'); return; }
    let data;
    try{ data = await charger(offreId); }
    catch(e){ alert('Impossible de charger le bien : '+(e.message||e)); return; }
    const { o, photos } = data;

    // Coordonnées du bien (utilisées seulement si aucune carte n'a été importée à la main)
    let geo = null;
    if(!o.carte_plan_url || !o.carte_aerienne_url){ geo = await geocoder(o); }

    const pages = [
      pageCouverture(o),
      pageSommaire(),
      pageLocalisation(o, o.carte_plan_url, 3, 'Plan de localisation', geo, 'plan'),
      pageLocalisation(o, o.carte_aerienne_url, 4, 'Vue aérienne', geo, 'aerienne'),
      pageDescriptif(o),
      pageEquipements(o),
      pageSurfaces(o),
      pagePhotos(o, photos),
      pagePlans(o, photos),
      pageConditions(o),
      pageContact(),
    ].join('');

    const titre = `Dossier — ${o.titre || typeLabel(o.type_bien)} ${o.ville||''}`.trim();
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <title>${esc(titre)}</title>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
      <style>${styles()}</style></head>
      <body>
        <div class="toolbar">
          <b>${esc(titre)}</b>
          <div class="acts">
            <button class="btn-print" onclick="window.print()">📄 Enregistrer en PDF / Imprimer</button>
            <button class="btn-close" onclick="window.close()">Fermer</button>
          </div>
        </div>
        <div class="sheet">${pages}</div>
        <script>${initCartesScript()}<\/script>
      </body></html>`;

    const w = window.open('', '_blank');
    if(!w){ alert('La fenêtre a été bloquée. Autorisez les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  window.GTEC_DOSSIER = { generer };
})();
