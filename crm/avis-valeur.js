/* ============================================================================
   GTEC IMMOBILIER — AVIS DE VALEUR (document autonome)
   ----------------------------------------------------------------------------
   Un avis de valeur est un document établi pour un prospect qui souhaite faire
   estimer son bâtiment — il n'est PAS rattaché à un bien du portefeuille.
   Les données vivent dans leur propre table `avis_valeur`.
     GTEC_AVIS.nouveau()       → formulaire vierge (nouvel avis)
     GTEC_AVIS.editer(id)      → rouvre un avis existant
     GTEC_AVIS.generer(id)     → ouvre l'aperçu (document 12 pages, PDF)
     GTEC_AVIS.resume(a)       → { valeur, m2 } pour l'affichage de la liste
   Calculs automatiques :
     Valeur locative annuelle = Σ (surface × loyer/m²/an)
     Net vendeur (HDHH)       = Valeur locative / taux de rendement
     Prix actes en mains      = Net vendeur × (1 + frais de mutation)
     Valeur au m²             = Valeur retenue / surface totale
   Dépend de la variable globale `sb` (client Supabase déjà initialisé).
   Fichier autonome : ne touche à rien d'autre dans le CRM.
   ========================================================================== */
(function(){
  'use strict';

  // -- Identité GTEC -----------------------------------------------------------
  const GMAPS_KEY = 'AIzaSyBvPpjWZpcGSgSIFmCiRC6pnPjzI332GRU';
  const LOGO = 'https://gtec-immobilier.fr/logo-gtec.png?v=2';
  const LOGO_CONTACT = 'https://gtec-immobilier.fr/logo-gtec-mark.png?v=1';
  const AGENTS = {
    FB:  { nom:'Florent BOURDIEC',     tel:'06 29 98 35 69', mail:'florent.bourdiec@gtec-immo.com' },
    VDM: { nom:'Valéry de Martelaere', tel:'06 11 51 16 91', mail:'val.dm@gtec-immo.com' }
  };
  const CONTACT_DEFAUT = AGENTS.FB;
  const SECTIONS = ['Présentation de l’actif','Analyse de localisation','Accessibilité & environnement',
                    'Données techniques','Valeur comparative','Valorisation & conclusion'];
  const logoBlock = (cls) => `<span class="logo-wrap ${cls}-wrap"><img class="${cls}" src="${LOGO}" alt="GTEC"><span class="logo-tag">Immobilier d’entreprise</span></span>`;

  // -- Petites aides -----------------------------------------------------------
  const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const nb  = v => (v==null||v==='') ? '' : new Intl.NumberFormat('fr-FR').format(Math.round(Number(v)));
  const eur = v => (v==null||v==='') ? '' : nb(v)+' €';
  const num = v => { if(v==null||v==='') return null; const n=Number(v); return isNaN(n)?null:n; };
  const enseigneDe = a => a.enseigne || a.proprietaire || '';
  const typeActifDe = a => a.type_actif || 'Actif immobilier';

  // -- Calcul financier --------------------------------------------------------
  // Somme des surfaces des lots (null si aucun lot chiffré) — sert de surface totale.
  function lotsSum(a){
    const ls = Array.isArray(a && a.lots) ? a.lots : [];
    const t = ls.reduce((x,l)=>x+(num(l && l.surface)||0),0);
    return t || null;
  }
  function finance(a){
    const lignes = Array.isArray(a.loyer_lignes) ? a.loyer_lignes : [];
    const detail = lignes.map(l=>{
      const s = num(l.surface), p = num(l.loyer_m2);
      return { designation:l.designation||'', surface:s, loyer_m2:p, min:num(l.min), max:num(l.max),
               total:(s!=null&&p!=null)?s*p:null };
    });
    const vlAnnuelle = detail.reduce((x,d)=>x+(d.total||0),0) || null;
    const taux = num(a.taux_rendement);
    const netVendeur = (vlAnnuelle!=null && taux) ? vlAnnuelle/(taux/100) : null;
    const fraisPct = num(a.frais_mutation_pct);
    const actesEnMains = (netVendeur!=null && fraisPct!=null) ? netVendeur*(1+fraisPct/100) : null;
    const valeurRetenue = num(a.valeur_estimee)!=null ? num(a.valeur_estimee) : netVendeur;
    const surfTot = lotsSum(a) || num(a.surface_totale);
    const valeurM2 = (valeurRetenue!=null && surfTot) ? valeurRetenue/surfTot : null;
    return { detail, vlAnnuelle, taux, netVendeur, fraisPct, actesEnMains, valeurRetenue, valeurM2, surfTot };
  }

  // -- Géocodage + carte -------------------------------------------------------
  function googleStaticUrl(geo, variant){
    if(!GMAPS_KEY || !geo) return null;
    // Satellite/hybride bloqués pour les comptes UE (Google Static Maps EEA) :
    // l'aérienne bascule sur l'imagerie Esri (Leaflet). Google ne sert que le plan.
    if(variant==='aerienne') return null;
    const center = geo.lat+','+geo.lon;
    return 'https://maps.googleapis.com/maps/api/staticmap?center='+center
      + '&zoom=14&size=640x400&scale=2&maptype=roadmap'
      + '&markers=color:0x3D8074%7C'+center+'&language=fr&key='+GMAPS_KEY;
  }
  async function geocoder(a){
    const q = [a.adresse, a.code_postal, a.ville].filter(Boolean).join(' ').trim();
    if(!q) return null;
    try{
      const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q='+encodeURIComponent(q));
      const j = await r.json();
      const f = (j.features||[])[0];
      if(!f || !f.geometry) return null;
      const [lon, lat] = f.geometry.coordinates;
      return { lat, lon };
    }catch(e){ return null; }
  }
  function carteHtml(geo, variant, n, vide){
    const g = googleStaticUrl(geo, variant);
    if(g)   return `<div class="av-map"><img src="${esc(g)}" alt=""></div>`;
    if(geo) return `<div class="av-map"><div id="avmap-${n}" class="av-leaflet" data-lat="${geo.lat}" data-lon="${geo.lon}" data-variant="${esc(variant)}"></div></div>`;
    return `<div class="av-map ph">${esc(vide)}<br><small>(renseignez l’adresse pour la carte automatique)</small></div>`;
  }

  // -- Gabarit de page ---------------------------------------------------------
  function page(titre, contenu, actif, numero){
    const nav = SECTIONS.map(s=>`<div class="navcell"><span>${esc(s)}</span><i class="${s===actif?'on':''}"></i></div>`).join('');
    return `<section class="pg">
      <header class="pg-h"><h1>${esc(titre)}</h1>${logoBlock('pg-logo')}</header>
      <div class="pg-body">${contenu}</div>
      <footer class="pg-f"><div class="nav">${nav}</div><div class="pg-num">${numero||''}</div></footer>
    </section>`;
  }

  // -- Pages -------------------------------------------------------------------
  function pageCouverture(a){
    const ens = enseigneDe(a);
    const villeCp = [a.ville, a.code_postal?`(${a.code_postal})`:''].filter(Boolean).join(' ');
    const photo = a.cover_url || '';
    return `<section class="pg av-cover">
      ${photo?`<img class="av-cv-bg" src="${esc(photo)}" alt="">`:'<div class="av-cv-bg av-cv-ph">Photo du bien à ajouter</div>'}
      <div class="av-cv-veil"></div>
      <div class="av-cover-left">
        ${logoBlock('av-cv-logo')}
        <div class="av-cv-titre">AVIS DE<br><span>VALEUR</span></div>
        <div class="av-cv-bien">
          <div class="av-cv-ens">${esc(ens || 'Enseigne')}${villeCp?' – '+esc(villeCp):''}</div>
          <div class="av-cv-adr">${esc(a.adresse || 'Adresse du bien')}</div>
        </div>
        <div class="av-cv-spacer"></div>
        <div class="av-cv-tag">
          <div class="t1">EXPERTISE ET CONSEIL</div>
          <div class="t2">EN IMMOBILIER D’ENTREPRISE</div>
          <div class="t3">BUREAUX <i>|</i> ACTIVITÉS <i>|</i> COMMERCE</div>
        </div>
      </div>
    </section>`;
  }

  function pageAvertissement(){
    const bloc = (t,c)=>`<div class="av-warn-bloc"><h3>${t}</h3><div>${c}</div></div>`;
    const body = `<div class="av-warn">
      ${bloc('Confidentialité du document',
        `<p>Cette présentation a été réalisée par GTEC Immobilier dans le cadre d’une étude de valorisation immobilière. Les informations qu’elle contient sont strictement confidentielles et réservées à son destinataire.</p>
         <p>Toute diffusion, reproduction ou transmission à un tiers sans autorisation préalable est interdite.</p>`)}
      ${bloc('Nature des informations communiquées',
        `<p>Les données et estimations présentées sont fournies à titre indicatif et ne constituent ni une offre contractuelle, ni une expertise immobilière au sens réglementaire. Les éléments communiqués reposent sur les informations disponibles à la date de réalisation de l’étude et restent susceptibles d’évoluer selon :</p>
         <ul><li>Les conditions du marché</li><li>Les éléments techniques et réglementaires</li><li>Les audits et vérifications complémentaires</li></ul>`)}
      ${bloc('Limitation de responsabilité',
        `<p>GTEC Immobilier ne pourra être tenu responsable d’une utilisation partielle des informations présentées dans ce document.</p>
         <p>Le propriétaire se réserve la possibilité de modifier, suspendre ou interrompre toute discussion relative à l’actif présenté.</p>`)}
    </div>`;
    return `<section class="pg">
      <header class="pg-h"><h1>Avertissement</h1>${logoBlock('pg-logo')}</header>
      <div class="pg-body">${body}</div>
      <footer class="pg-f"><div class="av-conf">GTEC Immobilier • Étude confidentielle</div><div class="pg-num"></div></footer>
    </section>`;
  }

  function pageGroupe(){
    const body = `<div class="av-groupe">
      <p>GTEC Immobilier, spécialiste de l’immobilier d’entreprise et commercial, vous accompagne à chaque étape de vos projets : transaction, vente, location, recherche de locaux et conseil en valorisation.</p>
      <p>Implantée à Amiens et Beauvais, notre équipe met son expertise du marché régional au service des propriétaires, investisseurs et utilisateurs, sur l’ensemble des Hauts-de-France.</p>
      <div class="av-groupe-tags"><span>Transaction</span><span>Vente</span><span>Location</span><span>Conseil & valorisation</span></div>
    </div>`;
    return `<section class="pg">
      <header class="pg-h"><h1>Le groupe</h1>${logoBlock('pg-logo')}</header>
      <div class="pg-body">${body}</div>
      <footer class="pg-f"><div class="av-conf">GTEC Immobilier • Étude confidentielle</div><div class="pg-num"></div></footer>
    </section>`;
  }

  function pageSommaire(){
    const items = SECTIONS.map((s,i)=>`<li><span class="num">${String(i+1).padStart(2,'0')}</span>${esc(s)}</li>`).join('');
    return `<section class="pg">
      <header class="pg-h"><h1>Sommaire</h1>${logoBlock('pg-logo')}</header>
      <div class="pg-body"><ol class="av-sommaire">${items}</ol></div>
      <footer class="pg-f"><div class="av-conf">GTEC Immobilier • Étude confidentielle</div><div class="pg-num"></div></footer>
    </section>`;
  }

  function pagePresentation(a){
    const ens = enseigneDe(a);
    const villeCp = [a.ville, a.code_postal?`(${a.code_postal})`:''].filter(Boolean).join(' ');
    const photo = a.cover_url || '';
    const body = `<div class="av-presit">
      <div class="av-presit-txt">
        <div class="av-pres-ens">${esc(ens||'—')}</div>
        <div class="av-pres-ville">${esc(villeCp||'')}</div>
        <div class="av-pres-adr">${esc(a.adresse||'')}</div>
        <table class="av-mini">
          <tr><th>Type d’actif</th><td>${esc(typeActifDe(a))}</td></tr>
          ${a.surface_totale?`<tr><th>Surface totale</th><td>${nb(a.surface_totale)} m²</td></tr>`:''}
          ${a.annee?`<tr><th>Année</th><td>${esc(a.annee)}</td></tr>`:''}
          ${a.proprietaire?`<tr><th>Propriétaire</th><td>${esc(a.proprietaire)}</td></tr>`:''}
        </table>
      </div>
      <div class="av-presit-img">${photo?`<img src="${esc(photo)}" alt="">`:'<div class="ph">Photo</div>'}</div>
    </div>`;
    return page('Présentation de l’actif', body, 'Présentation de l’actif', 1);
  }

  function pageLocalisation(a, geo){
    const note = (a.zone_chalandise||'').trim();
    const body = `<div class="av-loc">
      ${carteHtml(geo, 'plan', 1, 'Plan de localisation')}
      ${note?`<div class="av-loc-note"><h4>Zone de chalandise</h4><p>${esc(note).replace(/\n+/g,'</p><p>')}</p></div>`:''}
    </div>`;
    return page('Analyse de localisation', body, 'Analyse de localisation', 2);
  }

  function pageAcces(a, geo){
    const note = (a.accessibilite||'').trim();
    const body = `<div class="av-loc">
      ${carteHtml(geo, 'aerienne', 2, 'Vue aérienne')}
      ${note?`<div class="av-loc-note"><h4>Accessibilité & environnement</h4><p>${esc(note).replace(/\n+/g,'</p><p>')}</p></div>`:''}
    </div>`;
    return page('Accessibilité & environnement', body, 'Accessibilité & environnement', 3);
  }

  function pageTechnique(a){
    const lots = (Array.isArray(a.lots)?a.lots:[]).filter(l=>l && (l.batiment||l.niveau||l.designation||l.surface!=null));
    const tot = lots.reduce((x,l)=>x+(num(l.surface)||0),0);
    const fonc = num(a.surface_foncier);
    const proprio = a.copropriete ? 'en copropriété' : 'en pleine propriété';
    const lotsTable = lots.length
      ? `<table class="av-lots">
          <thead><tr><th>Bâtiment</th><th>Niveau</th><th>Désignation</th><th class="r">Surface</th></tr></thead>
          <tbody>${lots.map(l=>`<tr><td>${esc(l.batiment||'—')}</td><td>${esc(l.niveau||'—')}</td><td>${esc(l.designation||'—')}</td><td class="r">${l.surface!=null?nb(l.surface)+' m²':'—'}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="3">Surface totale</td><td class="r">${nb(tot)} m²</td></tr></tfoot>
        </table>`
      : (a.surface_totale ? `<table class="av-mini"><tr><th>Surface totale</th><td><b>${nb(a.surface_totale)} m²</b></td></tr></table>`
                          : '<p class="ph">Détail des lots non renseigné.</p>');
    const fonctable = (a.parcelle_cadastrale || fonc!=null)
      ? `<div class="av-tech-foncier"><table class="av-mini">
          ${a.parcelle_cadastrale?`<tr><th>Parcelle cadastrale</th><td>${esc(a.parcelle_cadastrale)}</td></tr>`:''}
          ${fonc!=null?`<tr><th>Surface du foncier</th><td>${nb(fonc)} m² environ ${proprio}</td></tr>`:''}
        </table></div>` : '';
    const body = `<div class="av-tech">
      <div class="av-tech-titre">${esc(typeActifDe(a))}</div>
      ${lotsTable}
      ${fonctable}
    </div>`;
    return page('Données techniques', body, 'Données techniques', 4);
  }

  function pageComparatif(a){
    const comps = Array.isArray(a.comparables) ? a.comparables : [];
    let body;
    if(comps.length){
      const rows = comps.map(c=>`<tr>
        <td>${esc(c.date||'')}</td><td>${esc(c.typologie||'')}</td><td>${esc(c.adresse||'')}</td>
        <td>${c.terrain!=null&&c.terrain!==''?nb(c.terrain)+' m²':''}</td>
        <td>${c.bati!=null&&c.bati!==''?nb(c.bati)+' m²':''}</td>
        <td>${c.vv!=null&&c.vv!==''?eur(c.vv):''}</td>
        <td>${(c.vv!=null&&c.bati)?eur(c.vv/c.bati)+'/m²':''}</td></tr>`).join('');
      body = `<table class="av-comp">
        <thead><tr><th>Date</th><th>Typologie</th><th>Adresse</th><th>Terrain</th><th>Bâti</th><th>Valeur vénale</th><th>Valeur vénale/m²</th></tr></thead>
        <tbody>${rows}</tbody></table>`;
    } else {
      body = '<p class="ph">Aucune transaction comparable renseignée.</p>';
    }
    return page('Valeur comparative du marché', body, 'Valeur comparative', 5);
  }

  function pageValorisation(a){
    const f = finance(a);
    const lignes = f.detail.length ? f.detail.map(d=>`<tr>
        <td>${esc(d.designation||'—')}</td>
        <td>${d.surface!=null?nb(d.surface)+' m²':''}</td>
        <td>${d.loyer_m2!=null?eur(d.loyer_m2)+'/m²/an':''}</td>
        <td>${d.total!=null?eur(d.total)+' HT/an':''}</td></tr>`).join('')
      : '<tr><td colspan="4" class="ph">Composantes de la valeur locative non renseignées.</td></tr>';
    const comm = (a.commentaire_marche||'').trim();
    const body = `<div class="av-val">
      <div class="av-val-sub">Valeur locative de marché</div>
      <table class="av-loyer"><thead><tr><th>Composante</th><th>Surface</th><th>Loyer de marché</th><th>Loyer annuel</th></tr></thead>
        <tbody>${lignes}</tbody></table>
      <div class="av-val-tot">VALEUR LOCATIVE TOTALE ANNUELLE : <b>${f.vlAnnuelle!=null?eur(f.vlAnnuelle)+' HT / AN HC':'—'}</b></div>
      ${comm?`<div class="av-val-comm"><p>${esc(comm).replace(/\n+/g,'</p><p>')}</p></div>`:''}
      <div class="av-val-cards">
        <div class="av-card"><div class="av-card-l">Taux de rendement retenu</div><div class="av-card-v">${f.taux!=null?nb(f.taux)+' %':'—'}</div></div>
        <div class="av-card teal"><div class="av-card-l">Valeur par capitalisation (net vendeur)</div><div class="av-card-v">${f.netVendeur!=null?eur(f.netVendeur)+' HDHH':'—'}</div></div>
        <div class="av-card"><div class="av-card-l">Frais de mutation (${f.fraisPct!=null?nb(f.fraisPct)+' %':'—'}) → prix actes en mains</div><div class="av-card-v">${f.actesEnMains!=null?eur(f.actesEnMains):'—'}</div></div>
      </div>
    </div>`;
    return page('Valorisation financière', body, 'Valorisation & conclusion', 6);
  }

  function pageConclusion(a){
    const f = finance(a);
    const note = (a.commentaire_conclusion||'').trim();
    const body = `<div class="av-ccl">
      <p class="av-ccl-intro">Notre analyse permet d’estimer la valeur de cet actif à :</p>
      <div class="av-ccl-val">${f.valeurRetenue!=null?eur(f.valeurRetenue)+' Hors Droits Hors Honoraires':'—'}</div>
      ${f.valeurM2!=null?`<div class="av-ccl-m2">soit environ ${eur(f.valeurM2)} / m²</div>`:''}
      <div class="av-ccl-note">
        ${note?`<p>${esc(note).replace(/\n+/g,'</p><p>')}</p>`:''}
        <p>Cette estimation est communiquée à titre indicatif et ne constitue pas une expertise immobilière. La valorisation retenue tient compte des caractéristiques de l’actif et des conditions de marché à la date de l’étude.</p>
        <p>Nous vous remercions pour votre confiance et restons à votre disposition pour tout complément d’information.</p>
      </div>
    </div>`;
    return page('Conclusion', body, 'Valorisation & conclusion', 7);
  }

  function pageContact(a){
    const c = AGENTS[a.agent] || CONTACT_DEFAUT;
    return `<section class="pg av-contact">
      <div class="av-ct-logo"><img src="${LOGO_CONTACT}" alt="GTEC"><div class="av-ct-sub">Immobilier d’entreprise</div></div>
      <div class="av-ct-sep"></div>
      <div class="av-ct-nom">${esc(c.nom)}</div>
      <div class="av-ct-tel">${esc(c.tel)}</div>
      <div class="av-ct-mail">${esc(c.mail)}</div>
    </section>`;
  }

  // -- Styles du document ------------------------------------------------------
  function styles(){
    return `
      :root{ --navy:#1A2738; --teal:#3D8074; --teal-d:#2f6359; --teal-l:#5FA08F; --ink:#1f2a37; }
      *{ box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      html,body{ margin:0; padding:0; background:#444; font-family:'Inter','Segoe UI',Arial,sans-serif; color:var(--ink); }
      .toolbar{ position:sticky; top:0; z-index:10; background:var(--navy); color:#fff; padding:12px 20px; display:flex; gap:12px; align-items:center; justify-content:space-between; }
      .toolbar b{ font-size:15px; } .toolbar .acts{ display:flex; gap:10px; }
      .toolbar button{ border:0; border-radius:8px; padding:9px 16px; font-size:14px; font-weight:600; cursor:pointer; }
      .btn-print{ background:var(--teal); color:#fff; } .btn-close{ background:#55606e; color:#fff; }
      .sheet{ padding:24px; display:flex; flex-direction:column; align-items:center; gap:20px; }
      .pg{ width:280mm; height:202mm; background:#fff; position:relative; overflow:hidden; box-shadow:0 6px 24px rgba(0,0,0,.35); display:flex; flex-direction:column; }
      .pg-h{ display:flex; align-items:center; justify-content:space-between; margin:0 14mm 5mm; padding:14mm 0 4mm; border-bottom:.8mm solid var(--teal); }
      .pg-h h1{ font-size:30pt; font-weight:600; margin:0; color:#222; }
      .pg-logo{ height:22mm; }
      .logo-wrap{ display:inline-flex; flex-direction:column; align-items:center; gap:1.5mm; }
      .logo-tag{ font-size:8pt; letter-spacing:.14em; text-transform:uppercase; color:var(--teal); font-weight:600; white-space:nowrap; }
      .pg-body{ flex:1; padding:2mm 14mm; }
      .pg-f{ display:flex; align-items:flex-end; justify-content:space-between; padding:0 12mm 7mm; }
      .pg-f .nav{ display:flex; gap:6px; flex:1; }
      .navcell{ flex:1; display:flex; flex-direction:column; justify-content:flex-end; }
      .navcell span{ font-size:7pt; color:#444; line-height:1.1; margin-bottom:3px; text-align:center; min-height:2.4em; display:flex; align-items:flex-end; justify-content:center; }
      .navcell i{ display:block; height:7px; background:#bdbdbd; border-radius:2px; }
      .navcell i.on{ background:var(--teal); }
      .pg-num{ font-size:11pt; color:#9aa0a6; padding-left:10px; }
      .av-conf{ font-size:9pt; color:#9aa0a6; }
      .ph{ color:#9aa0a6; font-style:italic; }
      .av-cover{ padding:0; display:block; position:relative; }
      .av-cv-bg{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
      .av-cv-ph{ display:flex; align-items:center; justify-content:center; background:#eef0f2; color:#9aa0a6; font-size:13pt; }
      .av-cv-veil{ position:absolute; inset:0; z-index:1; background:linear-gradient(90deg, rgba(26,39,56,.95) 0%, rgba(26,39,56,.88) 33%, rgba(26,39,56,.34) 60%, rgba(26,39,56,0) 100%); }
      .av-cover-left{ position:relative; z-index:2; width:64%; height:100%; color:#fff; padding:14mm 12mm; display:flex; flex-direction:column; }
      .av-cv-logo{ height:24mm; } .av-cv-logo-wrap{ align-items:flex-start; } .av-cv-logo-wrap .logo-tag{ color:var(--teal-l); }
      .av-cv-titre{ font-size:38pt; font-weight:700; line-height:1.04; margin-top:16mm; letter-spacing:.02em; }
      .av-cv-titre span{ color:var(--teal-l); }
      .av-cv-bien{ margin-top:12mm; } .av-cv-ens{ font-size:15pt; font-weight:600; } .av-cv-adr{ font-size:12pt; color:#c9d0d3; margin-top:2mm; }
      .av-cv-spacer{ flex:1; }
      .av-cv-tag{ border-top:.5mm solid rgba(255,255,255,.25); padding-top:6mm; }
      .av-cv-tag .t1{ font-size:13pt; font-weight:700; letter-spacing:.04em; }
      .av-cv-tag .t2{ font-size:11pt; color:var(--teal-l); font-weight:600; letter-spacing:.04em; }
      .av-cv-tag .t3{ font-size:10pt; margin-top:3mm; letter-spacing:.12em; color:#c9d0d3; }
      .av-cv-tag .t3 i{ color:var(--teal-l); font-style:normal; padding:0 2px; }
      .av-cover-right{ flex:1; background:#eef0f2; }
      .av-cover-right img{ width:100%; height:100%; object-fit:cover; display:block; }
      .av-cover-right .ph{ height:100%; display:flex; align-items:center; justify-content:center; }
      .av-warn{ columns:2; column-gap:12mm; padding-top:3mm; }
      .av-warn-bloc{ break-inside:avoid; margin-bottom:7mm; }
      .av-warn-bloc h3{ color:var(--teal-d); font-size:13pt; margin:0 0 2mm; text-transform:uppercase; letter-spacing:.04em; }
      .av-warn-bloc p, .av-warn-bloc li{ font-size:10.5pt; line-height:1.5; color:#333; margin:0 0 2mm; }
      .av-warn-bloc ul{ margin:0; padding-left:6mm; }
      .av-groupe{ font-size:14pt; line-height:1.65; color:#222; padding-top:6mm; } .av-groupe p{ margin:0 0 5mm; }
      .av-groupe-tags{ display:flex; flex-wrap:wrap; gap:4mm; margin-top:6mm; }
      .av-groupe-tags span{ background:#eef3f1; color:var(--teal-d); border:1px solid var(--teal-l); border-radius:20px; padding:2mm 6mm; font-size:11pt; font-weight:600; }
      .av-sommaire{ list-style:none; margin:6mm 0 0; padding:0 0 0 6mm; }
      .av-sommaire li{ display:flex; align-items:center; gap:10mm; font-size:19pt; margin:6mm 0; color:#222; }
      .av-sommaire .num{ width:14mm; height:14mm; border-radius:50%; background:var(--teal); color:#fff; display:flex; align-items:center; justify-content:center; font-size:14pt; font-weight:700; }
      .av-presit{ display:flex; gap:10mm; padding-top:4mm; height:100%; } .av-presit-txt{ flex:1; }
      .av-pres-ens{ font-size:24pt; font-weight:700; color:var(--navy); }
      .av-pres-ville{ font-size:15pt; color:var(--teal-d); font-weight:600; margin-top:1mm; }
      .av-pres-adr{ font-size:12pt; color:#555; margin:2mm 0 6mm; }
      .av-presit-img{ width:120mm; background:#eef0f2; border-radius:3px; overflow:hidden; }
      .av-presit-img img{ width:100%; height:130mm; object-fit:cover; } .av-presit-img .ph{ height:130mm; display:flex; align-items:center; justify-content:center; }
      table.av-mini{ width:100%; border-collapse:collapse; border-top:2px solid var(--navy); }
      table.av-mini th{ text-align:left; font-size:12pt; padding:3.5mm 2mm; width:46%; color:#222; border-bottom:1px solid #d7dadd; font-weight:600; }
      table.av-mini td{ font-size:12pt; padding:3.5mm 2mm; color:#333; border-bottom:1px solid #d7dadd; }
      .av-loc{ display:flex; flex-direction:column; gap:6mm; height:100%; padding-top:2mm; }
      .av-map{ position:relative; width:100%; flex:1; min-height:110mm; background:#e9ecef; border-radius:3px; overflow:hidden; }
      .av-map img{ width:100%; height:100%; object-fit:cover; } .av-leaflet{ width:100%; height:100%; }
      .av-map.ph{ display:flex; flex-direction:column; align-items:center; justify-content:center; color:#9aa0a6; font-size:13pt; text-align:center; }
      .av-loc-note h4{ margin:0 0 2mm; color:var(--teal-d); font-size:12pt; text-transform:uppercase; letter-spacing:.04em; }
      .av-loc-note p{ margin:0 0 2mm; font-size:11pt; line-height:1.5; color:#333; }
      .av-tech-titre{ font-size:17pt; font-weight:700; color:var(--navy); margin:2mm 0 5mm; }
      .av-tech-grid{ display:flex; gap:10mm; } .av-tech-col{ flex:1; }
      .av-tech-sub{ font-size:13pt; font-weight:700; color:var(--teal-d); margin-bottom:4mm; }
      .av-bars{ display:flex; flex-direction:column; gap:5mm; }
      .av-bar{ display:flex; align-items:center; gap:4mm; } .av-bar-l{ width:38mm; font-size:11pt; color:#333; }
      .av-bar-track{ flex:1; height:9mm; background:#eef0f2; border-radius:4px; overflow:hidden; } .av-bar-fill{ height:100%; border-radius:4px; }
      .av-bar-v{ width:34mm; text-align:right; font-size:11pt; font-weight:600; color:#222; } .av-bar-v small{ color:#888; font-weight:400; }
      table.av-lots{ width:100%; border-collapse:collapse; margin:2mm 0 4mm; }
      table.av-lots th{ font-size:10.5pt; text-transform:uppercase; letter-spacing:.04em; color:#fff; background:var(--navy); padding:3mm; text-align:left; }
      table.av-lots th.r, table.av-lots td.r{ text-align:right; }
      table.av-lots td{ font-size:12pt; padding:3mm; border-bottom:1px solid #e1e6e8; color:#222; }
      table.av-lots tbody tr:nth-child(even) td{ background:#f6f9f8; }
      table.av-lots tfoot td{ font-weight:700; color:var(--navy); border-top:2px solid var(--navy); border-bottom:none; font-size:12.5pt; }
      .av-tech-foncier{ margin-top:8mm; }
      table.av-comp{ width:100%; border-collapse:collapse; margin-top:6mm; }
      table.av-comp th{ background:var(--navy); color:#fff; font-size:10pt; padding:3.5mm 2mm; text-align:left; }
      table.av-comp td{ font-size:10.5pt; padding:3.5mm 2mm; border-bottom:1px solid #d7dadd; color:#333; }
      table.av-comp tbody tr:nth-child(even){ background:#f4f6f7; }
      .av-val-sub{ font-size:14pt; font-weight:700; color:var(--teal-d); margin:2mm 0 3mm; }
      table.av-loyer{ width:100%; border-collapse:collapse; }
      table.av-loyer th{ border-bottom:2px solid var(--navy); font-size:11pt; text-align:left; padding:3mm 2mm; color:#222; }
      table.av-loyer td{ font-size:11.5pt; padding:3mm 2mm; border-bottom:1px solid #d7dadd; color:#333; }
      .av-val-tot{ margin-top:4mm; background:var(--navy); color:#fff; padding:4mm 6mm; border-radius:4px; font-size:13pt; letter-spacing:.02em; }
      .av-val-tot b{ float:right; }
      .av-val-comm{ font-size:10.5pt; line-height:1.5; color:#444; margin-top:4mm; } .av-val-comm p{ margin:0 0 2mm; }
      .av-val-cards{ display:flex; gap:5mm; margin-top:5mm; }
      .av-card{ flex:1; border:1px solid #d7dadd; border-radius:6px; padding:4mm; }
      .av-card.teal{ background:var(--teal); border-color:var(--teal); color:#fff; }
      .av-card-l{ font-size:9.5pt; opacity:.85; min-height:3em; } .av-card-v{ font-size:15pt; font-weight:700; margin-top:2mm; }
      .av-ccl{ padding-top:8mm; text-align:center; } .av-ccl-intro{ font-size:15pt; color:#333; }
      .av-ccl-val{ font-size:30pt; font-weight:700; color:var(--navy); margin:5mm auto; padding:7mm 10mm; border:.8mm solid var(--teal); border-radius:8px; display:inline-block; }
      .av-ccl-m2{ font-size:16pt; color:var(--teal-d); font-weight:600; }
      .av-ccl-note{ max-width:200mm; margin:8mm auto 0; text-align:left; font-size:11pt; line-height:1.6; color:#444; } .av-ccl-note p{ margin:0 0 3mm; }
      .av-contact{ background:var(--navy); color:#fff; align-items:center; justify-content:flex-start; }
      .av-ct-logo{ display:flex; flex-direction:column; align-items:center; margin-top:30mm; } .av-ct-logo img{ height:50mm; }
      .av-ct-sub{ text-transform:uppercase; color:#fff; font-weight:300; letter-spacing:.42em; font-size:15pt; margin-top:5mm; padding-left:.42em; }
      .av-ct-sep{ width:55mm; height:.8mm; background:var(--teal); border-radius:2px; margin:20mm 0 14mm; }
      .av-ct-nom{ font-size:24pt; } .av-ct-tel,.av-ct-mail{ font-size:18pt; color:#7fc8bb; margin-top:2mm; }
      @media print{
        html,body{ background:#fff; } .toolbar{ display:none; } .sheet{ padding:0; gap:0; }
        .pg{ box-shadow:none; width:100%; height:100vh; page-break-after:always; break-after:page; }
        @page{ size:A4 landscape; margin:0; }
      }`;
  }

  function initCartesScript(){
    return `(function(){
      function tuiles(v){
        return v==='aerienne'
          ? { url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution:'Imagerie © Esri', zoom:18 }
          : { url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution:'© OpenStreetMap © CARTO', zoom:14, sub:['a','b','c','d'] };
      }
      function go(){
        if(typeof L==='undefined'){ setTimeout(go,150); return; }
        document.querySelectorAll('.av-leaflet').forEach(function(el){
          var lat=parseFloat(el.dataset.lat), lon=parseFloat(el.dataset.lon);
          if(isNaN(lat)||isNaN(lon)) return;
          var t=tuiles(el.dataset.variant);
          var map=L.map(el,{zoomControl:false,attributionControl:true,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,touchZoom:false}).setView([lat,lon],t.zoom);
          var opts={attribution:t.attribution,maxZoom:19}; if(t.sub) opts.subdomains=t.sub;
          L.tileLayer(t.url,opts).addTo(map);
          L.circleMarker([lat,lon],{radius:13,color:'#fff',weight:2,fillColor:'#3D8074',fillOpacity:.95}).addTo(map);
          setTimeout(function(){ map.invalidateSize(); },200);
        });
      }
      if(document.readyState==='complete') go(); else window.addEventListener('load',go);
    })();`;
  }

  // -- Données + génération ----------------------------------------------------
  async function charger(id){
    const { data, error } = await sb.from('avis_valeur').select('*').eq('id', id).single();
    if(error || !data) throw (error || new Error('Avis introuvable'));
    return data;
  }

  async function generer(id){
    if(!id){ alert('Aucun avis sélectionné.'); return; }
    let a;
    try{ a = await charger(id); }
    catch(e){ alert('Impossible de charger l’avis : '+(e.message||e)); return; }
    const geo = await geocoder(a);
    const pages = [
      pageCouverture(a), pageAvertissement(), pageGroupe(), pageSommaire(),
      pagePresentation(a), pageLocalisation(a, geo), pageAcces(a, geo),
      pageTechnique(a), pageComparatif(a), pageValorisation(a), pageConclusion(a),
      pageContact(a)
    ].join('');
    const titre = `Avis de valeur — ${enseigneDe(a) || typeActifDe(a)} ${a.ville||''}`.trim();
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <title>${esc(titre)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
      <style>${styles()}</style></head>
      <body>
        <div class="toolbar"><b>${esc(titre)}</b>
          <div class="acts">
            <button class="btn-print" onclick="window.print()">📄 Enregistrer en PDF / Imprimer</button>
            <button class="btn-close" onclick="window.close()">Fermer</button>
          </div></div>
        <div class="sheet">${pages}</div>
        <script>${initCartesScript()}<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if(!w){ alert('La fenêtre a été bloquée. Autorisez les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ==========================================================================
     FORMULAIRE — saisie / modification d'un avis de valeur
     ========================================================================== */
  let A = { id:null, cover_url:null, photoFile:null };

  function modalCss(){
    return `#av-ed-bg{position:fixed;inset:0;background:rgba(26,39,56,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;font-family:'Inter','Segoe UI',Arial,sans-serif}
      #av-ed{background:#fff;border-radius:14px;width:min(900px,100%);box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden}
      #av-ed .h{background:#1A2738;color:#fff;padding:16px 22px;display:flex;align-items:center;justify-content:space-between}
      #av-ed .h h3{margin:0;font-size:17px} #av-ed .h .x{background:none;border:0;color:#fff;font-size:24px;cursor:pointer;line-height:1}
      #av-ed .b{padding:18px 22px;max-height:66vh;overflow:auto}
      #av-ed .sep{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#3D8074;border-bottom:1px solid #e3e8ea;padding-bottom:5px;margin:18px 0 12px}
      #av-ed .sep:first-child{margin-top:0}
      #av-ed .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
      #av-ed .f{display:flex;flex-direction:column;gap:4px} #av-ed .f.full{grid-column:1/-1}
      #av-ed label{font-size:12.5px;color:#4A5A5E;font-weight:600}
      #av-ed input,#av-ed textarea,#av-ed select{border:1px solid #c9d0d3;border-radius:8px;padding:8px 10px;font-size:14px;font-family:inherit;width:100%}
      #av-ed textarea{min-height:60px;resize:vertical}
      #av-ed .check{flex-direction:row;align-items:center;gap:8px} #av-ed .check input{width:auto}
      #av-ed .rows{display:flex;flex-direction:column;gap:8px}
      #av-ed .row{display:grid;gap:8px;align-items:center}
      #av-ed .row.loyer{grid-template-columns:1.4fr .8fr .8fr .8fr .8fr 28px}
      #av-ed .row.comp{grid-template-columns:.8fr 1fr 1.3fr .8fr .8fr 1fr 28px}
      #av-ed .row.lot{grid-template-columns:1fr 1fr 1.6fr .9fr 28px}
      #av-ed .lots-tot{margin-top:10px;text-align:right;font-size:14px;color:#4A5A5E} #av-ed .lots-tot b{font-size:18px;color:#1A2738;margin-left:6px}
      #av-ed .row input{padding:6px 8px;font-size:13px}
      #av-ed .row .del{background:#fbe9e9;border:0;color:#b33;border-radius:6px;cursor:pointer;font-size:15px;height:30px}
      #av-ed .rowhead{font-size:11px;color:#8a9498;font-weight:600}
      #av-ed .addbtn{background:#eef3f1;border:1px dashed #5FA08F;color:#2f6359;border-radius:8px;padding:7px;cursor:pointer;font-size:13px;font-weight:600;margin-top:6px}
      #av-ed .calc{background:#eef3f1;border:1px solid #c9ddd6;border-radius:10px;padding:12px 14px;margin-top:6px;font-size:13.5px;color:#1A2738;line-height:1.9}
      #av-ed .calc b{color:#2f6359} #av-ed .calc .big{font-size:17px;font-weight:700}
      #av-ed .foot{padding:14px 22px;border-top:1px solid #e3e8ea;display:flex;gap:10px;justify-content:flex-end;background:#fafbfb;flex-wrap:wrap}
      #av-ed .foot button{border:0;border-radius:9px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}
      #av-ed .save{background:#3D8074;color:#fff} #av-ed .gen{background:#1A2738;color:#fff} #av-ed .cancel{background:#e3e8ea;color:#333}
      #av-ed .hint{font-size:11.5px;color:#8a9498;margin-top:3px}
      #av-ed .photo img{max-height:90px;border-radius:6px;margin-top:6px}`;
  }
  const I  = (id,label,v,o={}) => `<div class="f ${o.full?'full':''}"><label>${esc(label)}</label><input id="${id}" type="${o.type||'text'}" value="${v==null?'':esc(v)}" ${o.attr||''}></div>`;
  const TA = (id,label,v) => `<div class="f full"><label>${esc(label)}</label><textarea id="${id}">${v==null?'':esc(v)}</textarea></div>`;
  const CK = (id,label,v) => `<div class="f check full"><input id="${id}" type="checkbox" ${v?'checked':''}><label for="${id}" style="font-weight:500">${esc(label)}</label></div>`;
  const SELA = (v) => `<div class="f"><label>Négociateur GTEC</label><select id="av-agent">`+
    [['FB','Florent BOURDIEC'],['VDM','Valéry de Martelaere']].map(([k,n])=>`<option value="${k}" ${(v||'FB')===k?'selected':''}>${esc(n)}</option>`).join('')+`</select></div>`;
  // Menu déroulant des clients existants : rattache un client à l'avis et pré-remplit le propriétaire.
  // Réutilise les helpers globaux du CRM (chargerClients/optClients/nomClient).
  const SELC = (v) => `<div class="f full"><label>Client rattaché (remplit le propriétaire automatiquement)</label>`+
    `<select id="av-client" onchange="GTEC_AVIS._pickClient()">`+
    ((typeof optClients==='function') ? optClients(v) : `<option value="">— Aucun client —</option>`)+
    `</select></div>`;

  function lotRow(l){ l=l||{};
    return `<div class="row lot">
      <input data-k="batiment" value="${esc(l.batiment||'')}" placeholder="ex : Bât 1">
      <input data-k="niveau" value="${esc(l.niveau||'')}" placeholder="ex : Rdc, R+1">
      <input data-k="designation" value="${esc(l.designation||'')}" placeholder="ex : Commerce, Bureaux…">
      <input data-k="surface" type="number" value="${l.surface==null?'':esc(l.surface)}" placeholder="m²" oninput="GTEC_AVIS._calc()">
      <button type="button" class="del" onclick="GTEC_AVIS._delLot(this)">×</button></div>`;
  }
  function loyerRow(l){ l=l||{};
    return `<div class="row loyer">
      <input data-k="designation" value="${esc(l.designation||'')}" placeholder="ex : Bureaux">
      <input data-k="surface" type="number" value="${l.surface==null?'':esc(l.surface)}" placeholder="m²" oninput="GTEC_AVIS._calc()">
      <input data-k="loyer_m2" type="number" value="${l.loyer_m2==null?'':esc(l.loyer_m2)}" placeholder="€/m²/an" oninput="GTEC_AVIS._calc()">
      <input data-k="min" type="number" value="${l.min==null?'':esc(l.min)}" placeholder="marché min">
      <input data-k="max" type="number" value="${l.max==null?'':esc(l.max)}" placeholder="marché max">
      <button type="button" class="del" onclick="GTEC_AVIS._delLoyer(this)">×</button></div>`;
  }
  function compRow(c){ c=c||{};
    return `<div class="row comp">
      <input data-k="date" value="${esc(c.date||'')}" placeholder="Date">
      <input data-k="typologie" value="${esc(c.typologie||'')}" placeholder="Typologie">
      <input data-k="adresse" value="${esc(c.adresse||'')}" placeholder="Adresse / ville">
      <input data-k="terrain" type="number" value="${c.terrain==null?'':esc(c.terrain)}" placeholder="terrain m²">
      <input data-k="bati" type="number" value="${c.bati==null?'':esc(c.bati)}" placeholder="bâti m²">
      <input data-k="vv" type="number" value="${c.vv==null?'':esc(c.vv)}" placeholder="valeur vénale €">
      <button type="button" class="del" onclick="GTEC_AVIS._delComp(this)">×</button></div>`;
  }
  function collect(sel){
    return [...document.querySelectorAll(sel+' .row')].map(r=>{
      const obj={}; r.querySelectorAll('input').forEach(i=>{
        const k=i.dataset.k; if(!k) return;
        let v=i.value.trim(); if(v==='') v=null; else if(i.type==='number') v=Number(v);
        obj[k]=v;
      }); return obj;
    }).filter(o=>Object.values(o).some(v=>v!=null&&v!==''));
  }
  function _calc(){
    const lignes=collect('#av-loyer-rows');
    const vl=lignes.reduce((x,l)=>x+((l.surface!=null&&l.loyer_m2!=null)?l.surface*l.loyer_m2:0),0)||null;
    const taux=num((document.getElementById('av-taux')||{}).value);
    const frais=num((document.getElementById('av-frais')||{}).value);
    const lots=collect('#av-lots-rows');
    const surf=lots.reduce((x,l)=>x+(num(l.surface)||0),0)||null;
    const tEl=document.getElementById('av-lots-tot'); if(tEl) tEl.textContent = surf!=null ? nb(surf)+' m²' : '—';
    const net=(vl!=null&&taux)?vl/(taux/100):null;
    const aem=(net!=null&&frais!=null)?net*(1+frais/100):null;
    const over=num((document.getElementById('av-valest')||{}).value);
    const ret=over!=null?over:net;
    const m2=(ret!=null&&surf)?ret/surf:null;
    const el=document.getElementById('av-calc'); if(!el) return;
    el.innerHTML =
      `Valeur locative annuelle : <b>${vl!=null?eur(vl)+' HT/an HC':'—'}</b><br>`+
      `Net vendeur (capitalisation) : <b>${net!=null?eur(net)+' HDHH':'—'}</b><br>`+
      `Prix actes en mains : <b>${aem!=null?eur(aem):'—'}</b><br>`+
      `<span class="big">Valeur retenue : ${ret!=null?eur(ret)+' HDHH':'—'}${m2!=null?' &nbsp;(soit '+eur(m2)+'/m²)':''}</span>`;
  }
  function _addLot(){ document.getElementById('av-lots-rows').insertAdjacentHTML('beforeend', lotRow()); }
  function _delLot(b){ b.closest('.row').remove(); _calc(); }
  function _addLoyer(){ document.getElementById('av-loyer-rows').insertAdjacentHTML('beforeend', loyerRow()); }
  function _addComp(){ document.getElementById('av-comp-rows').insertAdjacentHTML('beforeend', compRow()); }
  function _delLoyer(b){ b.closest('.row').remove(); _calc(); }
  function _delComp(b){ b.closest('.row').remove(); }
  function _photo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.photoFile=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-photo-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function fermer(){ const e=document.getElementById('av-ed-bg'); if(e) e.remove(); }

  async function uploadPhoto(file){
    if(typeof convertHeic==='function'){ try{ file=await convertHeic(file); }catch(e){} }
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
    const path='avis_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)+'.'+ext;
    const up=await sb.storage.from('offres').upload(path, file, {cacheControl:'3600'});
    if(up.error) throw up.error;
    return sb.storage.from('offres').getPublicUrl(path).data.publicUrl;
  }
  async function nextRef(){
    try{
      const { data } = await sb.from('avis_valeur').select('reference');
      let max=0; (data||[]).forEach(r=>{ const m=/AV-(\d+)/.exec(r.reference||''); if(m) max=Math.max(max,+m[1]); });
      return 'AV-'+String(max+1).padStart(4,'0');
    }catch(e){ return 'AV-0001'; }
  }

  function nouveau(){ editer(null); }

  async function editer(id){
    let a={};
    if(id){ try{ a = await charger(id); }catch(e){ alert('Impossible de charger l’avis : '+(e.message||e)); return; } }
    // Rafraîchit la liste des clients pour alimenter le menu déroulant de rattachement.
    try{ if(typeof chargerClients==='function') await chargerClients(); }catch(e){}
    A = { id:id||null, cover_url:a.cover_url||null, photoFile:null, client_id:a.client_id||null };
    const loyer = Array.isArray(a.loyer_lignes) && a.loyer_lignes.length ? a.loyer_lignes : [{designation:'',surface:null,loyer_m2:null}];
    const comp  = Array.isArray(a.comparables) ? a.comparables : [];
    const lots  = Array.isArray(a.lots) && a.lots.length ? a.lots : [{}];
    const defAgent = (id ? a.agent : (window.ME_AGENT||'FB')) || 'FB';
    const titreModal = id ? `Avis de valeur ${a.reference?'— '+esc(a.reference):''}` : 'Nouvel avis de valeur';

    const html = `<div id="av-ed-bg" onclick="if(event.target===this)GTEC_AVIS._fermer()"><div id="av-ed">
      <div class="h"><h3>${titreModal}</h3><button class="x" onclick="GTEC_AVIS._fermer()">×</button></div>
      <div class="b">
        <div class="sep">Identité du bâtiment</div>
        <div class="grid">
          ${SELC(a.client_id)}
          ${SELA(defAgent)}
          ${I('av-proprietaire','Propriétaire / prospect', a.proprietaire)}
          ${I('av-enseigne','Enseigne / occupant', a.enseigne)}
          ${I('av-typeactif','Type d’actif (ex : Cellule commerciale en copropriété)', a.type_actif)}
          ${I('av-adresse','Adresse', a.adresse, {full:true})}
          ${I('av-ville','Ville', a.ville)}
          ${I('av-cp','Code postal', a.code_postal)}
          ${I('av-annee','Année de construction', a.annee, {type:'number'})}
        </div>
        <div class="f full" style="margin-top:12px"><label>Photo du bâtiment (couverture)</label>
          <input type="file" accept="image/*" onchange="GTEC_AVIS._photo(this)">
          <div class="photo" id="av-photo-prev">${a.cover_url?`<img src="${esc(a.cover_url)}" alt="">`:''}</div></div>

        <div class="sep">Détail des lots & surfaces</div>
        <div class="rowhead row lot"><span>Bâtiment</span><span>Niveau</span><span>Désignation (usage / occupant)</span><span>Surface m²</span><span></span></div>
        <div class="rows" id="av-lots-rows">${lots.map(lotRow).join('')}</div>
        <button type="button" class="addbtn" onclick="GTEC_AVIS._addLot()">＋ Ajouter un lot</button>
        <div class="lots-tot">Surface totale (somme automatique) :<b id="av-lots-tot">—</b></div>

        <div class="sep">Foncier & cadastre</div>
        <div class="grid">
          ${I('av-cadastre','Parcelle cadastrale', a.parcelle_cadastrale)}
          ${I('av-foncier','Surface du foncier (m²)', a.surface_foncier, {type:'number'})}
          ${CK('av-copro','Foncier en copropriété', a.copropriete)}
        </div>

        <div class="sep">Valeur locative de marché</div>
        <div class="rowhead row loyer"><span>Composante</span><span>Surface m²</span><span>Loyer €/m²/an</span><span>Marché min</span><span>Marché max</span><span></span></div>
        <div class="rows" id="av-loyer-rows">${loyer.map(loyerRow).join('')}</div>
        <button type="button" class="addbtn" onclick="GTEC_AVIS._addLoyer()">＋ Ajouter une composante (bureaux, stockage, vente…)</button>
        <div class="grid" style="margin-top:12px">
          ${I('av-taux','Taux de rendement (%)', a.taux_rendement, {type:'number', attr:'oninput="GTEC_AVIS._calc()"'})}
          ${I('av-frais','Frais de mutation (%)', a.frais_mutation_pct, {type:'number', attr:'oninput="GTEC_AVIS._calc()"'})}
          ${I('av-valest','Valeur retenue (€, vide = net vendeur calculé)', a.valeur_estimee, {type:'number', attr:'oninput="GTEC_AVIS._calc()"', full:true})}
        </div>
        <div class="calc" id="av-calc"></div>
        ${TA('av-commarche','Commentaire sur la valorisation (apparaît sous le tableau)', a.commentaire_marche)}

        <div class="sep">Transactions comparables</div>
        <div class="rowhead row comp"><span>Date</span><span>Typologie</span><span>Adresse</span><span>Terrain m²</span><span>Bâti m²</span><span>Valeur vénale €</span><span></span></div>
        <div class="rows" id="av-comp-rows">${comp.map(compRow).join('')}</div>
        <button type="button" class="addbtn" onclick="GTEC_AVIS._addComp()">＋ Ajouter une transaction comparable</button>

        <div class="sep">Textes des pages</div>
        ${TA('av-chalandise','Analyse de localisation / zone de chalandise', a.zone_chalandise)}
        ${TA('av-acces','Accessibilité & environnement', a.accessibilite)}
        ${TA('av-ccl','Commentaire de conclusion', a.commentaire_conclusion)}
      </div>
      <div class="foot">
        <button type="button" class="cancel" onclick="GTEC_AVIS._fermer()">Fermer</button>
        <button type="button" class="save" onclick="GTEC_AVIS._save(false)">💾 Enregistrer</button>
        <button type="button" class="gen" onclick="GTEC_AVIS._save(true)">📄 Enregistrer & générer l'aperçu</button>
      </div>
    </div></div>`;

    let st=document.getElementById('av-ed-style');
    if(!st){ st=document.createElement('style'); st.id='av-ed-style'; st.textContent=modalCss(); document.head.appendChild(st); }
    const root=document.createElement('div'); root.innerHTML=html; document.body.appendChild(root.firstElementChild);
    // Auto-complétion adresse → remplit adresse + ville + code postal d'un coup.
    try{ if(typeof brancherAdresseAuto==='function') brancherAdresseAuto(document.getElementById('av-adresse'),
        { getVille:()=>document.getElementById('av-ville'), getCp:()=>document.getElementById('av-cp') }); }catch(e){}
    // Auto-complétion ville → code postal (utile quand on ne saisit que la ville).
    try{ if(typeof brancherVilleAuto==='function') brancherVilleAuto(document.getElementById('av-ville'), ()=>document.getElementById('av-cp')); }catch(e){}
    _calc();
  }

  async function save(genApres){
    const g  = id => { const e=document.getElementById(id); return e?(e.value.trim()||null):null; };
    const gn = id => { const v=g(id); return v==null?null:Number(v); };
    let cover_url = A.cover_url || null;
    try{ if(A.photoFile) cover_url = await uploadPhoto(A.photoFile); }
    catch(e){ alert('Échec de l’envoi de la photo : '+(e.message||e)); return; }
    const lotsArr = collect('#av-lots-rows');
    const surfaceTot = lotsArr.reduce((x,l)=>x+(Number(l.surface)||0),0) || null;
    const payload = {
      client_id:A.client_id||null,
      agent:g('av-agent'), proprietaire:g('av-proprietaire'), enseigne:g('av-enseigne'),
      type_actif:g('av-typeactif'), adresse:g('av-adresse'), ville:g('av-ville'), code_postal:g('av-cp'),
      cover_url, annee:gn('av-annee'),
      lots:lotsArr, surface_totale:surfaceTot,
      parcelle_cadastrale:g('av-cadastre'), surface_foncier:gn('av-foncier'),
      copropriete:document.getElementById('av-copro').checked,
      loyer_lignes:collect('#av-loyer-rows'),
      taux_rendement:gn('av-taux'), frais_mutation_pct:gn('av-frais'), valeur_estimee:gn('av-valest'),
      comparables:collect('#av-comp-rows'),
      zone_chalandise:g('av-chalandise'), accessibilite:g('av-acces'),
      commentaire_marche:g('av-commarche'), commentaire_conclusion:g('av-ccl'),
      updated_at:new Date().toISOString()
    };
    let id = A.id;
    try{
      if(!id){
        payload.reference = await nextRef();
        const { data, error } = await sb.from('avis_valeur').insert(payload).select('id').single();
        if(error) throw error; id = data.id;
      } else {
        const { error } = await sb.from('avis_valeur').update(payload).eq('id', id);
        if(error) throw error;
      }
    }catch(e){ alert('Erreur d’enregistrement : '+(e.message||e)); return; }
    fermer();
    if(typeof vueAvis==='function') vueAvis();
    if(genApres) generer(id);
  }

  function resume(a){ const f = finance(a); return { valeur:f.valeurRetenue, m2:f.valeurM2 }; }

  // Au choix d'un client dans le menu : on retient son id et on pré-remplit le propriétaire.
  function pickClient(){
    const sel = document.getElementById('av-client'); if(!sel) return;
    const cid = sel.value || null;
    A.client_id = cid;
    if(!cid) return;
    const liste = (typeof CLIENTS!=='undefined' && Array.isArray(CLIENTS)) ? CLIENTS : [];
    const c = liste.find(x=>String(x.id)===String(cid));
    if(!c) return;
    const prop = document.getElementById('av-proprietaire');
    if(prop && typeof nomClient==='function') prop.value = nomClient(c);
  }

  window.GTEC_AVIS = { nouveau, editer, generer, resume,
    _calc, _addLot, _delLot, _addLoyer, _addComp, _delLoyer, _delComp, _photo, _fermer:fermer, _save:save, _pickClient:pickClient };
})();
