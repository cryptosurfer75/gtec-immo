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
  const LOGO = 'https://gtec-immobilier.fr/logo-gtec.png?v=2';
  // Marque « bâtiment + GTEC » fond transparent (sans wordmark) — dernière page ;
  // le sous-titre « IMMOBILIER D'ENTREPRISE » est rendu en texte juste en dessous.
  const LOGO_CONTACT = 'https://gtec-immobilier.fr/logo-gtec-mark.png?v=1';
  // Bloc logo + signature « Immobilier d'entreprise » (taille homogène partout)
  const logoBlock = (cls) => `<span class="logo-wrap ${cls}-wrap"><img class="${cls}" src="${LOGO}" alt="GTEC"><span class="logo-tag">Immobilier d’entreprise</span></span>`;
  // Signatures par agent (le bien porte une initiale FB / VDM)
  const AGENTS = {
    FB:  { nom:'Florent BOURDIEC',     tel:'06 29 98 35 69', mail:'florent.bourdiec@gtec-immo.com' },
    VDM: { nom:'Valéry de Martelaere', tel:'06 11 51 16 91', mail:'val.dm@gtec-immo.com' }
  };
  const CONTACT_DEFAUT = AGENTS.FB;   // anciens biens sans agent renseigné
  const SECTIONS_AVEC_PLANS = ['Localisation','Descriptif du bien','Équipements','Détail des surfaces',
                    'Photos','Conditions juridiques et financières','Plans'];
  // La page « Plans » n'apparaît que si une photo de plan est jointe au bien ;
  // SECTIONS (sommaire + navigation) est recalculé à chaque génération.
  let SECTIONS = SECTIONS_AVEC_PLANS.slice();

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

  // -- Rédaction automatique du descriptif (prose d'agent, sans IA) ------------
  const nbFr = v => new Intl.NumberFormat('fr-FR').format(v);
  function joinFr(arr){ if(arr.length<=1) return arr.join(''); return arr.slice(0,-1).join(', ')+' et '+arr[arr.length-1]; }
  function etagePhrase(e){
    if(!e) return '';
    if(/sous-sol/i.test(e)) return 'en sous-sol';
    if(/rez/i.test(e)) return 'en rez-de-chaussée';
    const m=/R\+(\d+)/i.exec(e); if(m){ const n=+m[1]; return `au ${n===1?'1er':n+'e'} étage`; }
    return 'à l’étage '+e;
  }
  function descType(t){
    const m = {
      'bureaux':           {np:'des bureaux',          ac:'s'},
      'commerce':          {np:'un local commercial',  ac:''},
      'local-activite':    {np:'un local d’activité',  ac:''},
      'entrepot':          {np:'un entrepôt',          ac:''},
      'terrain':           {np:'un terrain',           ac:''},
      'fonds-de-commerce': {np:'un fonds de commerce', ac:''}
    };
    return m[t] || {np:'un bien', ac:''};
  }
  function genererDescriptif(o){
    const ti = descType(o.type_bien);
    const terrain = o.type_bien==='terrain';
    const loc = o.secteur ? `${o.ville||''}${o.ville?' ':''}(secteur ${o.secteur})`.trim() : (o.ville||'');
    const vente = o.transaction==='vente' || (!o.transaction && o.prix_vente && !o.loyer_annuel_m2);
    const both  = o.transaction==='les_deux';
    const tx = both ? 'à la vente ou à la location' : vente ? 'à la vente' : 'à la location';

    const paras = [];
    // 1) Accroche + situation + surface (toujours annoncée comme approximative)
    const p1 = [];
    let s1 = `GTEC Immobilier vous propose, ${tx}, ${ti.np}`;
    if(loc) s1 += ` idéalement situé${ti.ac} à ${loc}`;
    p1.push(s1 + '.');
    if(o.surface_m2){
      let s = terrain ? `Le terrain présente une superficie approximative de ${nbFr(o.surface_m2)} m²`
                      : `L’ensemble développe une surface approximative de ${nbFr(o.surface_m2)} m²`;
      if(o.divisible && o.surface_min_m2) s += `, divisible à partir d’environ ${nbFr(o.surface_min_m2)} m²`;
      else if(o.surface_min_m2 && o.surface_max_m2 && o.surface_min_m2!==o.surface_max_m2) s += ` (surfaces modulables d’environ ${nbFr(o.surface_min_m2)} à ${nbFr(o.surface_max_m2)} m²)`;
      if(o.nb_lots>1) s += `, réparti en ${o.nb_lots} lots`;
      p1.push(s + '.');
    } else if(o.surface_min_m2 || o.surface_max_m2){
      const a=o.surface_min_m2, b=o.surface_max_m2;
      p1.push(`Les surfaces proposées, approximatives, s’échelonnent ${a&&b?`de ${nbFr(a)} à ${nbFr(b)} m²`:a?`à partir de ${nbFr(a)} m²`:`jusqu’à ${nbFr(b)} m²`}.`);
    }
    if(o.surface_m2 || o.surface_min_m2 || o.surface_max_m2) p1.push('Les surfaces sont communiquées à titre indicatif.');
    paras.push(p1.join(' '));

    // 2) Configuration, état, accessibilité (sans équipements ni conditions financières — détaillés dans le dossier)
    const p2 = [];
    if(!terrain){
      const cl = [];
      const ep = etagePhrase(o.etage); if(ep) cl.push(`se situe ${ep}`);
      if(o.nb_niveaux) cl.push(`se déploie sur ${o.nb_niveaux} niveau${o.nb_niveaux>1?'x':''}`);
      if(o.parkings) cl.push(`dispose de ${o.parkings} place${o.parkings>1?'s':''} de stationnement`);
      if(cl.length) p2.push('Le bien ' + joinFr(cl) + '.');
      const etatM = { neuf:'Il se présente en parfait état et ne nécessite aucuns travaux',
                      bon:'Il se présente en bon état général',
                      a_renover:'À rénover, il offre un beau potentiel pour un aménagement sur-mesure' };
      if(o.etat && etatM[o.etat]){ let e=etatM[o.etat]; if(o.annee) e+=` (construction de ${o.annee})`; p2.push(e+'.'); }
      else if(o.annee) p2.push(`Construction datant de ${o.annee}.`);
      const acc=[];
      if(o.norme_pmr) acc.push('accessible aux personnes à mobilité réduite');
      if(o.norme_erp) acc.push('conforme aux normes ERP (établissement recevant du public)');
      if(acc.length) p2.push('Le bien est ' + joinFr(acc) + '.');
    } else if(o.secteur || o.ville){
      p2.push('Terrain offrant de belles possibilités, à étudier selon votre projet.');
    }
    if(p2.length) paras.push(p2.join(' '));

    // 3) Environnement / ville / secteur
    const where = o.ville ? `au cœur de ${o.ville}${o.secteur?` (secteur ${o.secteur})`:''}` : (o.secteur ? `au sein du secteur ${o.secteur}` : '');
    paras.push(
      `Le bien bénéficie d’un environnement particulièrement porteur${where?`, ${where}`:''} : un secteur recherché et dynamique, animé par un tissu d’entreprises actif et facilement accessible. Un emplacement stratégique, idéal pour implanter ou développer votre activité.`
    );

    // 4) Disponibilité + appel à l’action (sans conditions financières — voir dossier)
    const p4 = [];
    if(o.disponibilite){ const d=o.disponibilite.trim(); p4.push(/^disponibilit/i.test(d) ? d+'.' : `Disponibilité : ${d}.`); }
    p4.push('Pour toute information complémentaire ou pour organiser une visite, l’équipe GTEC Immobilier se tient à votre entière disposition.');
    paras.push(p4.join(' '));

    return paras.filter(Boolean);
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
    // tri strict par rang choisi dans la fiche (photo 1, 2, 3, 4…), principale en cas d'égalité
    photos.sort((a,b)=>((a.ordre||0)-(b.ordre||0)) || ((b.est_principale?1:0)-(a.est_principale?1:0)));
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
        ${logoBlock('pg-logo')}
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
    const c = (o && AGENTS[o.agent]) || CONTACT_DEFAUT;
    return `<section class="pg cover">
      <div class="cover-top">
        <div class="cover-coord">
          <div class="cc-nom">${esc(c.nom)}</div>
          <div class="cc-tel">${esc(c.tel)}</div>
          <div class="cc-mail">${esc(c.mail)}</div>
        </div>
        ${logoBlock('cover-logo')}
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
      <header class="pg-h"><h1>Sommaire</h1>${logoBlock('pg-logo')}</header>
      <div class="pg-body"><ol class="sommaire">${items}</ol></div>
      <footer class="pg-f"><div class="pg-num">2</div></footer>
    </section>`;
  }

  // URL d'une carte statique Google (plan routier ou vue aérienne avec enseignes)
  function googleStaticUrl(geo, variant){
    if(!GMAPS_KEY || !geo) return null;
    // Les vues satellite / hybride des cartes statiques Google ne sont plus
    // disponibles pour les comptes de l'UE (restriction EEA, réponse 403).
    // → l'aérienne bascule sur l'imagerie Esri (rendue via Leaflet).
    //   Google ne sert plus que le plan (roadmap), qui reste autorisé.
    if(variant==='aerienne') return null;
    const center = geo.lat+','+geo.lon;
    const marker = 'color:0x3D8074%7C'+center;   // pin vert GTEC sur le bien
    return 'https://maps.googleapis.com/maps/api/staticmap?center='+center
      + '&zoom=15&size=640x400&scale=2&maptype=roadmap'
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
    // On n'affiche QUE la description de la fiche (générée via le bouton puis éventuellement corrigée)
    const body = txt
      ? txt.split(/\n+/).map(p=>`<p>${esc(p)}</p>`).join('')
      : '<p class="ph">Descriptif à renseigner dans la fiche du bien (bouton « Générer le descriptif »).</p>';
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
    return page('Conditions juridiques et financières', body, {actif:'Conditions juridiques et financières', num:9});
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
      // Mise en page automatique selon le nombre de plans : 1 = pleine page,
      // 2 = moitié/moitié, 3 = un grand + deux, 4 = quatre quadrants.
      // Les plans sont affichés ENTIERS (non rognés) pour rester lisibles.
      const n = Math.min(plans.length, 4);
      body = `<div class="plans-wrap plans-${n}">${plans.slice(0,4).map(u=>`<div class="gp2"><img src="${esc(u)}" alt=""></div>`).join('')}</div>`;
    } else if(o.plan_url){
      body = `<p class="ph">Plans disponibles sur demande.<br><small>${esc(o.plan_url)}</small></p>`;
    } else {
      body = '<p class="ph">Plans à ajouter à la fiche du bien.</p>';
    }
    return page('Plans', body, {actif:'Plans', num:10});
  }

  function pageContact(o){
    const c = (o && AGENTS[o.agent]) || CONTACT_DEFAUT;
    return `<section class="pg contact">
      <div class="contact-logo-block">
        <img class="contact-logo" src="${LOGO_CONTACT}" alt="GTEC">
        <div class="contact-logo-sub">Immobilier d’entreprise</div>
      </div>
      <div class="contact-sep"></div>
      <div class="contact-nom">${esc(c.nom)}</div>
      <div class="contact-tel">${esc(c.tel)}</div>
      <div class="contact-mail">${esc(c.mail)}</div>
    </section>`;
  }

  // -- Feuille de style du dossier (paysage, identité GTEC) --------------------
  function styles(){
    return `
      :root{ --navy:#1A2738; --teal:#3D8074; --teal-d:#2f6359; --ink:#1f2a37; }
      *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      html,body{ margin:0; padding:0; background:#444; font-family:'Inter','Segoe UI',Arial,sans-serif; color:var(--ink); }
      .toolbar{ position:sticky; top:0; z-index:10; background:var(--navy); color:#fff; padding:12px 20px;
        display:flex; gap:12px; align-items:center; justify-content:space-between; }
      .toolbar b{ font-size:15px; } .toolbar .acts{ display:flex; gap:10px; }
      .toolbar button{ border:0; border-radius:8px; padding:9px 16px; font-size:14px; font-weight:600; cursor:pointer; }
      .btn-print{ background:var(--teal); color:#fff; } .btn-close{ background:#55606e; color:#fff; }
      .sheet{ padding:24px; display:flex; flex-direction:column; align-items:center; gap:20px; }
      .pg{ width:280mm; height:202mm; background:#fff; position:relative; overflow:hidden;
        box-shadow:0 6px 24px rgba(0,0,0,.35); display:flex; flex-direction:column; }
      .pg-h{ display:flex; align-items:center; justify-content:space-between; margin:0 14mm 5mm; padding:14mm 0 4mm; border-bottom:0.8mm solid var(--teal); }
      .pg-h h1{ font-size:30pt; font-weight:600; margin:0; color:#222; }
      .pg-logo{ height:22mm; }
      .logo-wrap{ display:inline-flex; flex-direction:column; align-items:center; gap:1.5mm; }
      .logo-tag{ font-size:8pt; letter-spacing:.14em; text-transform:uppercase; color:var(--teal); font-weight:600; white-space:nowrap; }
      .pg-body{ flex:1; padding:2mm 14mm; }
      .pg-f{ display:flex; align-items:flex-end; justify-content:space-between; padding:0 12mm 7mm; }
      .pg-f .nav{ display:flex; gap:6px; flex:1; }
      .navcell{ flex:1; display:flex; flex-direction:column; justify-content:flex-end; }
      .navcell span{ font-size:7.5pt; color:#444; line-height:1.1; margin-bottom:3px; text-align:center;
        min-height:2.2em; display:flex; align-items:flex-end; justify-content:center; }
      .navcell i{ display:block; height:7px; background:#bdbdbd; border-radius:2px; }
      .navcell i.on{ background:var(--teal); }
      .pg-num{ font-size:11pt; color:#9aa0a6; padding-left:10px; }
      /* Couverture */
      .cover{ padding:0; }
      .cover-top{ display:flex; justify-content:space-between; align-items:center; padding:10mm 12mm 0; }
      .cover-coord{ line-height:1.35; color:#222; }
      .cover-coord .cc-nom{ font-size:15pt; font-weight:700; color:var(--navy); }
      .cover-coord .cc-tel{ font-size:13pt; font-weight:600; }
      .cover-coord .cc-mail{ font-size:12pt; color:var(--teal); }
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
      /* Page Plans : mise en page automatique selon le nombre (plans entiers, non rognés) */
      .plans-wrap{ display:grid; gap:6mm; height:100%; padding-top:2mm; }
      .plans-1{ grid-template-columns:1fr; }
      .plans-2{ grid-template-columns:1fr 1fr; }
      .plans-3{ grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
      .plans-3 .gp2:first-child{ grid-column:1 / -1; }
      .plans-4{ grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
      .gp2{ background:#eef0f2; border-radius:3px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
      .gp2 img{ width:100%; height:100%; object-fit:contain; }
      /* Contact */
      .contact{ background:var(--navy); color:#fff; align-items:center; justify-content:flex-start; gap:6mm; }
      .contact-logo-block{ display:flex; flex-direction:column; align-items:center; margin-top:26mm; }
      .contact-logo{ height:50mm; }
      .contact-logo-sub{ text-transform:uppercase; color:#fff; font-weight:300; letter-spacing:.42em; font-size:15pt; margin-top:5mm; padding-left:.42em; }
      .contact-sep{ width:55mm; height:0.8mm; background:var(--teal); border-radius:2px; margin:20mm 0 14mm; }
      .contact-nom{ font-size:24pt; margin-top:0; }
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
      // Accroche le départ de la flèche pile sur le bord du rectangle (mesuré, donc jamais détaché)
      function placerFleches(){
        document.querySelectorAll('.loc-img').forEach(function(box){
          var tag=box.querySelector('.loc-tag'), svg=box.querySelector('.loc-arrow');
          if(!tag||!svg) return;
          var line=svg.querySelector('line'); if(!line) return;
          var w=box.clientWidth, h=box.clientHeight; if(!w||!h) return;
          var ux=252/w, uy=135/h;
          // bord gauche du rectangle (on rentre de 6px dessous pour un raccord net), milieu vertical
          line.setAttribute('x1', ((tag.offsetLeft+6)*ux).toFixed(1));
          line.setAttribute('y1', ((tag.offsetTop+tag.offsetHeight/2)*uy).toFixed(1));
        });
      }
      function start(){ placerFleches(); go(); setTimeout(placerFleches,300); }
      if(document.readyState==='complete') start(); else window.addEventListener('load',start);
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

    // La page « Plans » n'est générée que si au moins une photo de plan est jointe au bien.
    const aDesPlans = Array.isArray(o.plans_urls) && o.plans_urls.filter(Boolean).length > 0;
    SECTIONS = aDesPlans ? SECTIONS_AVEC_PLANS.slice() : SECTIONS_AVEC_PLANS.filter(s=>s!=='Plans');

    const pages = [
      pageCouverture(o),
      pageSommaire(),
      pageLocalisation(o, o.carte_plan_url, 3, 'Plan de localisation', geo, 'plan'),
      pageLocalisation(o, o.carte_aerienne_url, 4, 'Vue aérienne', geo, 'aerienne'),
      pageDescriptif(o),
      pageEquipements(o),
      pageSurfaces(o),
      pagePhotos(o, photos),
      pageConditions(o),
      aDesPlans ? pagePlans(o, photos) : '',
      pageContact(o),
    ].join('');

    const titre = `Dossier — ${o.titre || typeLabel(o.type_bien)} ${o.ville||''}`.trim();
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <title>${esc(titre)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
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

  window.GTEC_DOSSIER = { generer, genererDescriptif };
})();
