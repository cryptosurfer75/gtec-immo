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
  const SECTIONS = ['Présentation du groupe','Cadre légal','Présentation de l’actif / photos','Localisation',
                    'Détail des surfaces','Valeur comparative','Analyse SWOT','Valorisation & conclusion'];
  const logoBlock = (cls) => `<span class="logo-wrap ${cls}-wrap"><img class="${cls}" src="${LOGO}" alt="GTEC"><span class="logo-tag">Immobilier d’entreprise</span></span>`;

  // -- Petites aides -----------------------------------------------------------
  const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const nb  = v => (v==null||v==='') ? '' : new Intl.NumberFormat('fr-FR').format(Math.round(Number(v)));
  const pct = v => (v==null||v==='') ? '' : new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(Number(v));
  // Montants en euros : séparateur de milliers en point (1.073.800 €). Les surfaces gardent l'espace via nb().
  const eur = v => (v==null||v==='') ? '' : new Intl.NumberFormat('de-DE').format(Math.round(Number(v)))+' €';
  const num = v => { if(v==null||v==='') return null; const n=Number(String(v).replace(',','.')); return isNaN(n)?null:n; };
  // Nom affiché en couverture / titre = le PROPRIÉTAIRE (SCI ou société du propriétaire),
  // pas les enseignes locataires (elles vont dans le cadre Occupants). Repli sur l'ancien
  // champ enseigne pour les avis déjà saisis, puis sur le type d'actif.
  const enseigneDe = a => a.proprietaire || a.enseigne || '';
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
  // Vue aérienne : image satellite UNIQUE exportée par Esri (pas de tuiles → pas de
  // quadrillage ni mention d'attribution), strictement identique au générateur de dossier.
  function esriAerialUrl(geo){
    if(!geo) return null;
    const R = 20037508.34;                 // demi-circonférence Web Mercator (m)
    const x = geo.lon*R/180;
    const y = Math.log(Math.tan((90+geo.lat)*Math.PI/360))/(Math.PI/180)*R/180;
    const dx = 350, dy = dx*800/1280;      // ~700 m de large, ratio image 1280×800
    const bbox = [x-dx, y-dy, x+dx, y+dy].join(',');
    return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'
      + '?bbox='+bbox+'&bboxSR=3857&imageSR=3857&size=1280,800&format=jpg&f=image';
  }
  function carteHtml(geo, variant, n, vide){
    // Plan = carte Google (roadmap) ; aérienne = image Esri unique (comme le dossier)
    const auto = (variant==='aerienne') ? esriAerialUrl(geo) : googleStaticUrl(geo, variant);
    if(auto) return `<div class="av-map"><img src="${esc(auto)}" alt=""></div>`;
    if(geo)  return `<div class="av-map"><div id="avmap-${n}" class="av-leaflet" data-lat="${geo.lat}" data-lon="${geo.lon}" data-variant="${esc(variant)}"></div></div>`;
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
  // -- Carte locator Picardie (Somme/Oise/Aisne) ------------------------------
  // Silhouette simplifiée (data IGN/DINUM) + projection linéaire ; pastille = ville du bien (géocodée),
  // + repères des villes principales de Picardie pour situer l'actif.
  const PIC_MAP = {
    viewBox:"0 0 1048 867", W:1048, H:867,
    lonMin:1.38065, latMax:50.36629, cosMid:0.6480818205327021, S:536.6915517341428, PAD:24,
    paths:[
      "M24 185L31 178L38 173L44 167L50 161L53 151L56 140L58 132L62 123L67 116L74 110L81 106L89 105L90 113L97 120L105 118L114 120L121 124L129 124L125 116L122 106L114 104L106 103L102 95L98 87L87 83L82 76L79 65L80 57L81 48L83 37L84 29L105 27L113 31L116 39L123 43L131 39L142 35L153 29L162 26L171 27L179 34L187 36L194 41L198 50L206 53L213 49L219 43L226 47L223 55L216 60L222 67L231 69L239 74L247 76L254 80L262 84L262 92L266 99L268 108L276 110L284 108L290 114L298 112L305 108L313 105L321 107L330 102L339 101L346 106L355 105L351 96L361 101L363 109L370 103L377 99L387 98L396 97L400 104L407 109L412 116L402 120L395 125L387 126L383 133L376 137L375 145L371 154L370 162L380 164L384 171L393 162L396 154L403 148L411 146L419 145L423 156L430 152L432 144L440 146L439 154L444 161L453 161L460 166L469 167L477 170L484 177L484 169L488 162L486 154L496 155L503 160L511 161L510 170L508 178L504 185L498 195L505 200L513 193L520 188L528 185L534 179L537 187L543 194L542 202L540 210L547 204L555 201L560 194L568 192L576 195L585 193L592 189L600 191L608 194L616 194L625 198L628 206L637 207L645 209L647 217L643 224L650 228L658 229L651 234L644 239L644 248L638 254L632 261L629 269L628 279L625 287L618 291L616 301L612 308L608 316L616 317L617 325L615 333L611 342L619 347L620 355L622 363L627 370L629 379L621 379L617 386L617 378L610 374L607 382L600 386L593 390L589 382L581 380L574 385L570 392L572 400L566 392L561 385L557 378L550 382L547 374L541 380L545 387L549 394L542 390L535 396L533 404L525 403L517 403L515 411L516 419L513 429L505 426L497 421L489 423L480 421L478 429L472 435L473 444L467 450L460 446L458 437L457 429L449 430L442 434L434 432L429 425L423 419L415 415L408 421L402 415L395 409L387 404L379 403L370 405L363 401L356 397L350 388L342 391L335 386L326 383L317 380L309 382L301 380L292 380L287 387L279 385L270 387L262 391L260 383L253 379L245 377L236 377L229 373L223 380L217 374L208 377L199 383L191 380L183 377L177 369L184 365L177 361L173 352L165 351L163 343L156 339L153 331L149 324L146 316L144 308L142 299L140 290L139 282L132 276L130 268L123 263L116 259L108 255L101 251L96 244L91 237L85 230L78 225L73 218L67 212L60 207L54 201L48 195L51 187L43 183L35 187L26 188Z",
      "M164 350L172 353L177 361L184 365L177 369L184 375L191 380L199 383L208 377L215 372L221 379L227 373L236 375L245 377L253 379L260 383L262 391L268 385L277 385L285 387L292 380L301 380L309 382L317 381L325 381L332 385L340 389L348 390L356 393L360 400L368 405L377 404L386 405L394 407L397 415L403 422L411 418L419 419L427 422L434 426L437 435L445 431L454 429L460 436L458 444L464 450L471 446L474 438L476 430L479 422L487 422L495 422L503 424L511 428L518 424L514 416L515 405L525 403L533 404L535 396L541 389L547 395L547 387L541 381L546 374L550 382L557 376L560 384L562 392L570 396L570 388L577 383L584 379L590 385L596 392L601 383L607 377L615 376L614 384L621 379L630 381L628 389L632 398L624 402L624 410L626 418L623 427L629 433L633 440L635 448L631 455L633 463L632 471L627 478L622 485L629 492L630 500L624 506L632 509L639 513L643 520L636 525L628 524L620 525L621 537L619 546L620 554L614 566L609 573L602 578L593 577L585 579L576 582L578 590L582 597L590 601L598 602L597 612L598 621L599 629L600 637L592 638L588 631L580 632L573 636L577 644L578 652L585 656L593 659L598 666L597 658L589 657L588 648L592 641L600 647L609 647L615 653L617 661L616 669L619 661L621 653L628 657L626 665L636 670L632 677L624 678L626 686L618 690L611 694L608 702L610 711L601 710L593 708L585 712L581 719L577 712L569 711L561 715L553 711L546 717L537 720L533 712L525 710L517 708L510 713L508 721L497 725L493 717L486 721L477 713L471 707L463 704L454 706L448 712L440 710L434 704L433 694L425 693L424 704L415 702L414 694L405 688L399 682L391 685L387 677L378 677L370 672L364 678L360 670L353 662L346 658L342 665L338 672L329 674L319 676L321 668L316 661L307 664L299 667L294 660L286 656L278 657L271 653L271 645L263 648L256 652L249 656L240 663L231 659L224 665L216 664L208 666L200 669L193 665L185 666L177 662L168 658L154 664L149 656L143 649L147 641L143 633L135 631L135 623L138 615L146 614L154 613L159 620L166 624L170 613L169 604L162 600L161 592L159 584L161 576L157 569L156 561L151 553L143 546L149 540L141 540L143 532L143 524L148 517L153 510L160 505L160 497L166 491L162 484L153 487L151 495L145 489L144 481L149 474L149 466L145 458L140 448L132 446L141 445L136 438L139 429L143 422L136 413L140 406L143 398L150 393L153 385L145 383L141 390L132 386L136 379L140 372L139 364L148 363L149 355L153 347L161 351Z",
      "M647 215L655 212L663 208L671 205L679 204L683 211L692 211L701 212L708 206L715 201L723 204L731 207L740 209L749 210L758 210L764 201L772 198L776 191L785 192L792 196L799 203L807 203L815 203L816 195L823 190L831 187L839 187L846 191L854 193L862 195L870 199L878 195L885 200L894 203L896 212L905 209L914 205L922 203L929 197L933 206L930 214L928 224L937 223L946 230L955 228L964 232L972 236L980 233L988 234L996 233L1004 238L1010 244L1013 252L1011 261L1012 269L1020 273L1023 281L1023 291L1020 300L1015 307L1012 315L1010 325L1014 332L1007 338L1014 342L1020 350L1015 357L1014 365L1007 369L1001 376L997 383L988 386L985 394L978 404L977 412L971 418L963 417L954 416L948 423L949 431L954 438L956 446L962 452L956 458L952 465L961 467L962 476L955 483L949 489L949 497L950 506L954 513L950 521L950 534L951 542L948 551L947 564L939 565L935 557L927 554L919 551L913 544L905 541L897 543L890 539L882 541L873 541L879 547L886 551L885 559L886 567L877 569L869 565L860 567L851 571L845 577L836 578L828 581L820 583L812 588L809 596L816 601L816 611L814 619L820 627L820 635L814 642L823 646L831 649L833 657L840 664L849 662L848 671L839 676L832 681L826 675L817 677L809 676L802 680L800 688L797 696L804 701L806 709L808 717L800 718L795 725L791 732L796 739L805 737L813 734L820 741L823 749L817 755L809 758L804 766L804 774L796 775L796 784L788 790L787 798L783 805L772 805L767 813L763 822L755 829L756 837L749 842L743 836L736 831L728 830L721 826L720 818L716 808L717 799L710 803L702 806L696 800L696 791L686 789L678 787L676 778L672 770L667 763L660 758L653 752L645 751L644 743L650 737L654 730L650 722L643 715L644 707L637 703L629 699L620 697L612 694L620 687L627 683L633 676L628 666L628 658L623 651L619 658L617 667L622 674L616 668L616 660L614 652L607 647L598 644L589 642L587 650L590 658L598 659L600 667L593 662L586 657L578 657L577 649L576 641L575 633L584 631L592 633L594 641L601 636L599 626L596 618L597 609L593 602L585 603L581 596L578 588L585 579L593 577L600 582L606 575L613 571L614 558L620 552L619 544L620 531L621 523L629 526L637 524L644 518L637 512L629 508L629 500L629 492L623 486L626 478L632 471L632 463L631 455L635 448L633 439L628 431L620 423L625 415L621 408L625 401L630 394L631 385L629 377L627 369L621 359L620 351L613 346L609 338L617 332L616 323L612 316L612 308L616 301L615 292L623 288L629 281L630 273L630 265L634 258L640 251L644 244L649 236L656 231L648 228L644 221Z"
    ]
  };
  const PIC_CITIES = [
    { n:'Amiens',        lon:2.2958, lat:49.8942, side:'R' },
    { n:'Saint-Quentin', lon:3.2876, lat:49.8489, side:'R' },
    { n:'Beauvais',      lon:2.0809, lat:49.4295, side:'R' },
    { n:'Compiègne',     lon:2.8261, lat:49.4179, side:'R' }
  ];
  function picProj(lon, lat){
    return [ ((lon-PIC_MAP.lonMin)*PIC_MAP.cosMid)*PIC_MAP.S + PIC_MAP.PAD,
             ((PIC_MAP.latMax-lat))*PIC_MAP.S + PIC_MAP.PAD ];
  }
  const PIC_REF_STYLE = 'font-family:Inter,Arial,sans-serif;font-size:43px;font-weight:600;fill:#eef5f2;paint-order:stroke;stroke:rgba(26,39,56,.8);stroke-width:8;stroke-linejoin:round';
  const PIC_NEAR_STYLE = 'font-family:Inter,Arial,sans-serif;font-size:43px;font-weight:700;fill:#5FC9A4;paint-order:stroke;stroke:rgba(26,39,56,.82);stroke-width:8;stroke-linejoin:round';
  function picardieMap(geo){
    const dPaths = PIC_MAP.paths.map(d=>'<path d="'+d+'" fill="rgba(255,255,255,.16)" stroke="#8fc0b4" stroke-width="5" stroke-linejoin="round"/>').join('');
    // Position de l'actif (géocodée) → uniquement pour repérer la ville la plus proche (nom en vert).
    let bx=null, by=null, nearIdx=-1;
    if(geo){
      const p = picProj(geo.lon, geo.lat);
      if(p[0]>=-20 && p[0]<=PIC_MAP.W+20 && p[1]>=-20 && p[1]<=PIC_MAP.H+20){ bx=p[0]; by=p[1]; }
    }
    if(bx!=null){
      let best=Infinity;
      PIC_CITIES.forEach((c,i)=>{ const [cx,cy]=picProj(c.lon,c.lat); const d=Math.hypot(cx-bx,cy-by); if(d<best){best=d;nearIdx=i;} });
    }
    const dot = (cx,cy)=>'<circle cx="'+cx.toFixed(0)+'" cy="'+cy.toFixed(0)+'" r="9" fill="#fff" stroke="#1A2738" stroke-width="3"/>';
    const refs = PIC_CITIES.map((c,i)=>{
      const [cx,cy] = picProj(c.lon, c.lat);
      const tx = c.side==='L' ? cx-17 : cx+17;
      const anchor = c.side==='L' ? 'end' : 'start';
      const style = (i===nearIdx) ? PIC_NEAR_STYLE : PIC_REF_STYLE; // ville la plus proche de l'actif = en vert
      return dot(cx,cy) + '<text x="'+tx.toFixed(0)+'" y="'+(cy+13).toFixed(0)+'" text-anchor="'+anchor+'" style="'+style+'">'+c.n+'</text>';
    }).join('');
    return '<div class="av-cv-map"><svg viewBox="0 -24 1048 968" preserveAspectRatio="xMidYMid meet">'+dPaths+refs+'</svg></div>';
  }

  function pageCouverture(a, geo){
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
        ${picardieMap(geo, a.ville)}
        <div class="av-cv-tag">
          <div class="t1">EXPERTISE ET CONSEIL</div>
          <div class="t2">EN IMMOBILIER D’ENTREPRISE</div>
          <div class="t3">BUREAUX <i>|</i> ACTIVITÉS <i>|</i> COMMERCE</div>
        </div>
      </div>
    </section>`;
  }

  function pageAvertissement(){
    const bloc = (t,c,full)=>`<div class="av-warn-bloc${full?' full':''}"><h3>${t}</h3><div>${c}</div></div>`;
    // Rangée du haut : Confidentialité (gauche) + Limitation (droite), alignées à la même hauteur.
    // Puis « Nature des informations » sur toute la largeur en dessous.
    const body = `<div class="av-warn">
      ${bloc('Confidentialité du document',
        `<p>Cette présentation a été réalisée par GTEC Immobilier dans le cadre d’une étude de valorisation immobilière. Les informations qu’elle contient sont strictement confidentielles et réservées à son destinataire.</p>
         <p>Toute diffusion, reproduction ou transmission à un tiers sans autorisation préalable est interdite.</p>`)}
      ${bloc('Limitation de responsabilité',
        `<p>GTEC Immobilier ne pourra être tenu responsable d’une utilisation partielle des informations présentées dans ce document.</p>
         <p>Le propriétaire se réserve la possibilité de modifier, suspendre ou interrompre toute discussion relative à l’actif présenté.</p>`)}
      ${bloc('Nature des informations communiquées',
        `<p>Les données et estimations présentées sont fournies à titre indicatif et ne constituent ni une offre contractuelle, ni une expertise immobilière au sens réglementaire. Les éléments communiqués reposent sur les informations disponibles à la date de réalisation de l’étude et restent susceptibles d’évoluer selon :</p>
         <ul><li>Les conditions du marché</li><li>Les éléments techniques et réglementaires</li><li>Les audits et vérifications complémentaires</li></ul>`, true)}
    </div>`;
    return page('Cadre légal', body, 'Cadre légal', 2);
  }

  function pageGroupe(){
    const body = `<div class="av-groupe">
      <p>GTEC Immobilier est un acteur spécialisé en immobilier d’entreprise et commercial, dédié à l’accompagnement des entreprises, investisseurs et propriétaires dans leurs projets de transaction, vente et location.</p>
      <p>La société s’appuie sur une équipe forte de plus de 10 ans d’expérience sur le marché des Hauts-de-France. Cette expertise permet d’offrir une parfaite connaissance des secteurs, des valeurs de marché et des opportunités locales afin de proposer un accompagnement sur mesure à chaque étape de votre projet.</p>
      <p>Notre ambition est simple : mettre notre savoir faire, notre proximité et notre réactivité au service de vos décisions immobilières.</p>
      <div class="av-groupe-tags"><span>Transaction</span><span>Vente</span><span>Location</span><span>Conseil & valorisation</span></div>
    </div>`;
    return page('Présentation du groupe', body, 'Présentation du groupe', 1);
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
    const photo = a.photo_presentation_url || a.cover_url || '';
    const occ = (Array.isArray(a.occupants)?a.occupants:[]).map(o=>o&&o.nom).filter(Boolean);
    const body = `<div class="av-presit">
      <div class="av-presit-txt">
        <div class="av-pres-ens">${esc(ens||'—')}</div>
        <div class="av-pres-ville">${esc(villeCp||'')}</div>
        <div class="av-pres-adr">${esc(a.adresse||'')}</div>
        <table class="av-mini">
          <tr><th>Type d’actif</th><td>${esc(typeActifDe(a))}</td></tr>
          ${occ.length?`<tr><th>Occupant${occ.length>1?'s':''}</th><td>${esc(occ.join(', '))}</td></tr>`:''}
          ${a.surface_totale?`<tr><th>Surface totale</th><td>${nb(a.surface_totale)} m²</td></tr>`:''}
          ${a.annee?`<tr><th>Année</th><td>${esc(a.annee)}</td></tr>`:''}
          ${a.structure_batiment?`<tr><th>Structure du bâtiment</th><td>${esc(a.structure_batiment)}</td></tr>`:''}
          ${a.toiture?`<tr><th>Toiture</th><td>${esc(a.toiture)}</td></tr>`:''}
          ${a.isolation?`<tr><th>Isolation</th><td>${esc(a.isolation)}</td></tr>`:''}
          ${a.chauffage?`<tr><th>Chauffage</th><td>${esc(a.chauffage)}</td></tr>`:''}
        </table>
      </div>
      <div class="av-presit-img">${photo?`<img src="${esc(photo)}" alt="">`:'<div class="ph">Photo</div>'}</div>
    </div>`;
    return page('Présentation de l’actif', body, 'Présentation de l’actif / photos', 3);
  }

  // Page « Vues de l'actif » : photos intérieures supplémentaires. N'apparaît que si au moins
  // une photo est fournie (page non numérotée, hors sommaire = pas de décalage des numéros).
  function pageVuesActif(a){
    const ph = [a.photo_int1_url, a.photo_int2_url, a.photo_int3_url, a.photo_int4_url].filter(Boolean);
    if(!ph.length) return '';
    const imgs = ph.map(u=>`<div class="av-vues-ph"><img src="${esc(u)}" alt="Vue de l’actif"></div>`).join('');
    return `<section class="pg">
      <header class="pg-h"><h1>Photo de l’actif</h1>${logoBlock('pg-logo')}</header>
      <div class="pg-body"><div class="av-vues av-vues-${ph.length}">${imgs}</div></div>
      <footer class="pg-f"><div class="av-conf">GTEC Immobilier • Étude confidentielle</div><div class="pg-num"></div></footer>
    </section>`;
  }

  // Page « Localisation » fusionnée : à gauche l'analyse de l'emplacement, à droite l'extrait
  // cadastral (ou la carte auto si aucun cadastre importé).
  function pageLocalisation(a, geo){
    const acc = (a.accessibilite||'').trim();
    const texte = acc
      ? `<div class="av-acc-bloc"><h4>Analyse de l’emplacement</h4><p>${esc(acc).replace(/\n+/g,'</p><p>')}</p></div>`
      : '<p class="ph">Analyse de l’emplacement non renseignée.</p>';
    const visuel = a.cadastre_url
      ? `<div class="av-cad-wrap"><img src="${esc(a.cadastre_url)}" alt="Extrait cadastral"></div>`
      : carteHtml(geo, 'plan', 1, 'Plan de localisation');
    const body = `<div class="av-locm"><div class="av-locm-txt">${texte}</div><div class="av-locm-img">${visuel}</div></div>`;
    return page('Localisation', body, 'Localisation', 4);
  }

  function pageTechnique(a){
    const lots = (Array.isArray(a.lots)?a.lots:[]).filter(l=>l && (l.batiment||l.niveau||l.designation||l.surface!=null));
    const tot = lots.reduce((x,l)=>x+(num(l.surface)||0),0);
    const fonc = num(a.surface_foncier);
    // On n'affirme jamais « en pleine propriété » (risqué). On ne précise « en copropriété » que si la case est cochée.
    const proprio = a.copropriete ? ' en copropriété' : '';
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
          ${fonc!=null?`<tr><th>Surface du foncier</th><td>${nb(fonc)} m² environ${proprio}</td></tr>`:''}
        </table></div>` : '';
    const body = `<div class="av-tech">
      <div class="av-tech-titre">${esc(typeActifDe(a))}</div>
      ${lotsTable}
      ${fonctable}
    </div>`;
    return page('Détail des surfaces', body, 'Détail des surfaces', 5);
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
    const note = (a.analyse_comparative||'').trim();
    if(note) body += `<div class="av-comp-note"><h4>Analyse comparative</h4><p>${esc(note).replace(/\n+/g,'</p><p>')}</p></div>`;
    return page('Valeur comparative du marché', body, 'Valeur comparative', 6);
  }

  // Pastilles rondes à icônes par quadrant (interne/externe · atout/vigilance)
  const SWOT_ICON = {
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 4.3 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/></svg>'
  };

  function pageSwot(a){
    const s = a.swot || {};
    const block = (cls, icon, titre, txt) => {
      const lines = (txt||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
      const corps = lines.length ? `<ul class="swB-ul">${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>` : '<p class="ph">Non renseigné</p>';
      return `<div class="swB-block ${cls}"><div class="swB-h"><span class="swB-sign">${icon}</span><b>${esc(titre)}</b></div>${corps}</div>`;
    };
    // Quadrillage 2×2 à quadrants égaux + croix centrée (indépendant du nb de lignes par quadrant).
    const body = `<div class="swB">
      <div class="swB-titles">
        <div class="swB-coltitle">Analyse interne — le bien</div>
        <div class="swB-coltitle">Analyse externe — le marché</div>
      </div>
      <div class="swB-grid">
        ${block('swB-f', SWOT_ICON.plus, 'Forces', s.forces)}
        ${block('swB-o', SWOT_ICON.up, 'Opportunités', s.opportunites)}
        ${block('swB-w', SWOT_ICON.minus, 'Faiblesses', s.faiblesses)}
        ${block('swB-t', SWOT_ICON.warn, 'Menaces', s.menaces)}
      </div>
    </div>`;
    return page('Analyse SWOT', body, 'Analyse SWOT', 7);
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
    </div>`;
    return page('Valorisation financière', body, 'Valorisation & conclusion', 8);
  }

  function pageConclusion(a){
    const f = finance(a);
    const note = (a.commentaire_conclusion||'').trim();
    const resp = (a.commentaire_responsabilite||'').trim();
    const body = `<div class="av-ccl">
      <p class="av-ccl-intro">Notre analyse permet d’estimer la valeur de cet actif à :</p>
      <div class="av-ccl-row">
        <div class="av-ccl-side">
          <div class="av-ccl-side-l">Taux de rendement retenu</div>
          <div class="av-ccl-side-v">${f.taux!=null?pct(f.taux)+' %':'—'}</div>
        </div>
        <div class="av-ccl-val">${f.valeurRetenue!=null?eur(f.valeurRetenue)+'<span class="av-ccl-hdhh">Hors Droits Hors Honoraires</span>':'—'}</div>
        <div class="av-ccl-side">
          <div class="av-ccl-side-l">Prix actes en mains<small>droits d’enregistrement ${f.fraisPct!=null?pct(f.fraisPct)+' %':''} inclus</small></div>
          <div class="av-ccl-side-v">${f.actesEnMains!=null?eur(f.actesEnMains):'—'}</div>
        </div>
      </div>
      ${f.valeurM2!=null?`<div class="av-ccl-m2">soit environ ${eur(f.valeurM2)} / m²</div>`:''}
      <div class="av-ccl-note">
        ${note?`<p>${esc(note).replace(/\n+/g,'</p><p>')}</p>`:''}
        <p>Nous vous remercions pour votre confiance et restons à votre disposition pour tout complément d’information.</p>
      </div>
      ${resp?`<div class="av-ccl-legal"><div class="av-ccl-legal-h">Mention légale</div><p>${esc(resp).replace(/\n+/g,'</p><p>')}</p></div>`:''}
    </div>`;
    return page('Conclusion', body, 'Valorisation & conclusion', 9);
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
      .pg-h{ flex-shrink:0; display:flex; align-items:center; justify-content:space-between; margin:0 14mm 5mm; padding:14mm 0 4mm; border-bottom:.8mm solid var(--teal); }
      .pg-h h1{ font-size:30pt; font-weight:600; margin:0; color:#222; }
      .pg-logo{ height:22mm; }
      .logo-wrap{ display:inline-flex; flex-direction:column; align-items:center; gap:.8mm; }
      .logo-tag{ font-size:9pt; letter-spacing:.30em; text-transform:uppercase; color:var(--teal); font-weight:500; white-space:nowrap; padding-left:.30em; }
      .pg-body{ flex:1; min-height:0; overflow:hidden; display:flex; flex-direction:column; padding:2mm 14mm; }
      .pg-f{ flex-shrink:0; display:flex; align-items:flex-end; justify-content:space-between; padding:0 12mm 7mm; }
      .pg-f .nav{ display:flex; gap:6px; flex:1; }
      .navcell{ flex:1; display:flex; flex-direction:column; justify-content:flex-end; }
      .navcell span{ font-size:7pt; color:#444; line-height:1.1; margin-bottom:3px; text-align:center; min-height:2.4em; display:flex; align-items:flex-end; justify-content:center; }
      .navcell i{ display:block; height:7px; background:#bdbdbd; border-radius:2px; }
      .navcell i.on{ background:var(--teal); }
      .pg-num{ font-size:11pt; font-weight:700; color:#111; padding-left:10px; }
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
      .av-cv-map{ width:48mm; margin:0 0 1mm; }
      .av-cv-map svg{ width:100%; height:auto; display:block; overflow:visible; filter:drop-shadow(0 1mm 2mm rgba(0,0,0,.4)); }
      .av-cv-tag{ border-top:.5mm solid rgba(255,255,255,.25); padding-top:6mm; }
      .av-cv-tag .t1{ font-size:13pt; font-weight:700; letter-spacing:.04em; }
      .av-cv-tag .t2{ font-size:11pt; color:var(--teal-l); font-weight:600; letter-spacing:.04em; }
      .av-cv-tag .t3{ font-size:10pt; margin-top:3mm; letter-spacing:.12em; color:#c9d0d3; }
      .av-cv-tag .t3 i{ color:var(--teal-l); font-style:normal; padding:0 2px; }
      .av-cover-right{ flex:1; background:#eef0f2; }
      .av-cover-right img{ width:100%; height:100%; object-fit:cover; display:block; }
      .av-cover-right .ph{ height:100%; display:flex; align-items:center; justify-content:center; }
      .av-warn{ display:grid; grid-template-columns:1fr 1fr; column-gap:12mm; row-gap:8mm; align-items:start; padding-top:3mm; }
      .av-warn-bloc{ break-inside:avoid; }
      .av-warn-bloc.full{ grid-column:1 / -1; }
      .av-warn-bloc h3{ color:var(--teal-d); font-size:13pt; margin:0 0 2mm; text-transform:uppercase; letter-spacing:.04em; }
      .av-warn-bloc p, .av-warn-bloc li{ font-size:10.5pt; line-height:1.5; color:#333; margin:0 0 2mm; }
      .av-warn-bloc ul{ margin:0; padding-left:6mm; }
      .av-groupe{ font-size:14pt; line-height:1.65; color:#222; padding-top:6mm; } .av-groupe p{ margin:0 0 5mm; }
      .av-groupe-tags{ display:flex; flex-wrap:wrap; gap:4mm; margin-top:6mm; }
      .av-groupe-tags span{ background:#eef3f1; color:var(--teal-d); border:1px solid var(--teal-l); border-radius:20px; padding:2mm 6mm; font-size:11pt; font-weight:600; }
      .swB{ flex:1; min-height:0; display:flex; flex-direction:column; margin-top:4mm; margin-bottom:3mm; }
      .swB-titles{ display:grid; grid-template-columns:1fr 1fr; flex-shrink:0; }
      .swB-coltitle{ font-size:10pt; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:#9aa0a6; padding:0 8mm 2.5mm; border-bottom:1px solid #e1e6e8; }
      /* Quadrillage 2×2 : quadrants strictement égaux + croix centrée (50%/50%) */
      .swB-grid{ flex:1; min-height:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; position:relative; }
      .swB-grid::before{ content:''; position:absolute; left:50%; top:0; bottom:0; width:1px; background:#b3bbbe; transform:translateX(-.5px); }
      .swB-grid::after{ content:''; position:absolute; top:50%; left:0; right:0; height:1px; background:#b3bbbe; transform:translateY(-.5px); }
      .swB-block{ display:flex; flex-direction:column; min-height:0; overflow:hidden; padding:5mm 8mm; }
      .swB-h{ display:flex; align-items:center; gap:3.5mm; margin-bottom:2mm; }
      .swB-sign{ width:9mm; height:9mm; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; flex-shrink:0; }
      .swB-sign svg{ width:5mm; height:5mm; }
      .swB-h b{ font-size:14pt; letter-spacing:.02em; color:#222; }
      .swB-ul{ margin:0; padding:0; list-style:none; font-size:11.5pt; color:#2a3340; }
      .swB-ul li{ position:relative; padding-left:5.5mm; margin:0 0 1.8mm; line-height:1.3; }
      .swB-ul li::before{ content:''; position:absolute; left:0; top:.45em; width:2mm; height:2mm; border-radius:50%; }
      .swB-f .swB-sign{ background:var(--teal); } .swB-f li::before{ background:var(--teal); }
      .swB-w .swB-sign{ background:#b5683f; } .swB-w li::before{ background:#b5683f; }
      .swB-o .swB-sign{ background:var(--navy); } .swB-o li::before{ background:var(--navy); }
      .swB-t .swB-sign{ background:#6b7480; } .swB-t li::before{ background:#6b7480; }
      .av-sommaire{ list-style:none; margin:0; padding:0 0 0 6mm; height:100%; display:flex; flex-direction:column; justify-content:space-evenly; }
      .av-sommaire li{ display:flex; align-items:center; gap:10mm; font-size:18pt; color:#222; }
      .av-sommaire .num{ flex-shrink:0; width:13mm; height:13mm; border-radius:50%; background:var(--teal); color:#fff; display:flex; align-items:center; justify-content:center; font-size:13pt; font-weight:700; }
      .av-presit{ display:flex; gap:10mm; padding-top:3mm; height:100%; } .av-presit-txt{ flex:1; min-width:0; }
      .av-pres-ens{ font-size:22pt; font-weight:700; color:var(--navy); line-height:1.1; }
      .av-pres-ville{ font-size:14pt; color:var(--teal-d); font-weight:600; margin-top:1mm; }
      .av-pres-adr{ font-size:11.5pt; color:#555; margin:1.5mm 0 4mm; }
      /* Cadre photo standard du dossier = carré 120 mm (présentation, localisation, page photos) */
      .av-presit-img{ width:120mm; height:120mm; align-self:flex-start; background:#eef0f2; border-radius:3px; overflow:hidden; flex-shrink:0; }
      .av-presit-img img{ width:100%; height:100%; object-fit:cover; } .av-presit-img .ph{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
      table.av-mini{ width:100%; border-collapse:collapse; border-top:2px solid var(--navy); }
      table.av-mini th{ text-align:left; font-size:12pt; padding:3.5mm 2mm; width:46%; color:#222; border-bottom:1px solid #d7dadd; font-weight:600; }
      table.av-mini td{ font-size:12pt; padding:3.5mm 2mm; color:#333; border-bottom:1px solid #d7dadd; }
      /* Page « Présentation de l'actif » : tableau resserré pour tenir sans toucher la barre du bas */
      .av-presit-txt table.av-mini th, .av-presit-txt table.av-mini td{ padding:2.1mm 2mm; font-size:11pt; }
      .av-loc{ display:flex; flex-direction:column; gap:6mm; height:100%; padding-top:2mm; }
      .av-locm{ display:flex; gap:10mm; height:100%; padding-top:2mm; align-items:flex-start; }
      .av-locm-txt{ flex:1; min-width:0; }
      .av-locm-img{ flex:0 0 120mm; display:flex; flex-direction:column; }
      .av-map{ position:relative; width:120mm; height:120mm; flex:0 0 120mm; background:#e9ecef; border-radius:3px; overflow:hidden; }
      .av-map img{ width:100%; height:100%; object-fit:cover; } .av-leaflet{ width:100%; height:100%; }
      .av-cad-wrap{ width:120mm; height:120mm; flex:0 0 120mm; display:flex; align-items:center; justify-content:center; background:#fff; border-radius:3px; overflow:hidden; }
      .av-cad-wrap img{ width:100%; height:100%; object-fit:contain; display:block; }
      .av-cad-cap{ flex-shrink:0; font-size:9pt; color:#777; font-style:italic; text-align:center; }
      .av-map.ph{ display:flex; flex-direction:column; align-items:center; justify-content:center; color:#9aa0a6; font-size:13pt; text-align:center; }
      .av-loc-note h4{ margin:0 0 2mm; color:var(--teal-d); font-size:12pt; text-transform:uppercase; letter-spacing:.04em; }
      .av-loc-note p{ margin:0 0 2mm; font-size:11pt; line-height:1.5; color:#333; }
      .av-vues{ display:flex; flex-direction:column; gap:6mm; height:100%; padding-top:2mm; align-items:center; justify-content:center; }
      .av-vues-ph{ border-radius:4px; overflow:hidden; background:#eef0f2; }
      .av-vues-ph img{ width:100%; height:100%; object-fit:cover; display:block; }
      /* 1 photo : un grand carré 120 mm centré (même cadre que présentation/localisation) */
      .av-vues-1 .av-vues-ph{ width:120mm; height:120mm; }
      /* 2 photos : deux carrés 120 mm identiques côte à côte */
      .av-vues-2{ flex-direction:row; gap:8mm; }
      .av-vues-2 .av-vues-ph{ width:120mm; height:120mm; }
      /* 3-4 photos : carrés réduits identiques en grille 2×2 (façon CRM des offres) */
      .av-vues-3, .av-vues-4{ display:grid; grid-template-columns:repeat(2,62mm); grid-auto-rows:62mm; gap:8mm; align-content:center; justify-content:center; }
      .av-vues-3 .av-vues-ph, .av-vues-4 .av-vues-ph{ width:62mm; height:62mm; }
      .av-acc{ display:flex; flex-direction:column; gap:9mm; padding-top:4mm; }
      .av-acc-bloc h4{ margin:0 0 3mm; color:var(--teal-d); font-size:14pt; text-transform:uppercase; letter-spacing:.04em; }
      .av-acc-bloc p{ margin:0 0 3mm; font-size:13pt; line-height:1.6; color:#222; }
      .av-tech-titre{ font-size:17pt; font-weight:700; color:var(--navy); margin:2mm 0 5mm; }
      .av-tech-grid{ display:flex; gap:10mm; } .av-tech-col{ flex:1; }
      .av-tech-sub{ font-size:13pt; font-weight:700; color:var(--teal-d); margin-bottom:4mm; }
      .av-bars{ display:flex; flex-direction:column; gap:5mm; }
      .av-bar{ display:flex; align-items:center; gap:4mm; } .av-bar-l{ width:38mm; font-size:11pt; color:#333; }
      .av-bar-track{ flex:1; height:9mm; background:#eef0f2; border-radius:4px; overflow:hidden; } .av-bar-fill{ height:100%; border-radius:4px; }
      .av-bar-v{ width:34mm; text-align:right; font-size:11pt; font-weight:600; color:#222; } .av-bar-v small{ color:#888; font-weight:400; }
      table.av-lots{ width:100%; border-collapse:collapse; margin:2mm 0 4mm; }
      table.av-lots th{ font-size:10.5pt; text-transform:uppercase; letter-spacing:.04em; color:#fff; background:var(--navy); padding:2mm 3mm; text-align:left; }
      table.av-lots th.r, table.av-lots td.r{ text-align:right; }
      table.av-lots td{ font-size:11pt; padding:1.7mm 3mm; border-bottom:1px solid #e1e6e8; color:#222; }
      table.av-lots tbody tr:nth-child(even) td{ background:#f6f9f8; }
      table.av-lots tfoot td{ font-weight:700; color:var(--navy); border-top:2px solid var(--navy); border-bottom:none; font-size:12pt; padding:2.5mm 3mm; }
      .av-tech-foncier{ margin-top:4mm; }
      .av-tech-foncier table.av-mini th, .av-tech-foncier table.av-mini td{ padding:2.2mm 2mm; font-size:11.5pt; }
      table.av-comp{ width:100%; border-collapse:collapse; margin-top:6mm; }
      table.av-comp th{ background:var(--navy); color:#fff; font-size:10pt; padding:3.5mm 2mm; text-align:left; }
      table.av-comp td{ font-size:10.5pt; padding:3.5mm 2mm; border-bottom:1px solid #d7dadd; color:#333; }
      table.av-comp tbody tr:nth-child(even){ background:#f4f6f7; }
      .av-comp-note{ margin-top:7mm; }
      .av-comp-note h4{ margin:0 0 2.5mm; color:var(--teal-d); font-size:12pt; text-transform:uppercase; letter-spacing:.04em; }
      .av-comp-note p{ font-size:10.5pt; line-height:1.55; color:#444; margin:0 0 2.5mm; }
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
      .av-ccl{ padding-top:3mm; text-align:center; display:flex; flex-direction:column; flex:1; min-height:0; } .av-ccl-intro{ font-size:15pt; color:#333; margin:2mm 0; }
      .av-ccl-row{ display:flex; align-items:center; justify-content:center; gap:6mm; margin:4mm 0; }
      .av-ccl-side{ flex:0 0 60mm; display:flex; flex-direction:column; justify-content:center; min-height:26mm; border:1px solid #d6dcde; border-radius:8px; padding:3mm 5mm; background:#fafbfb; }
      .av-ccl-side-l{ font-size:11pt; color:#555; line-height:1.3; } .av-ccl-side-l small{ display:block; font-size:8.5pt; color:#9aa0a6; margin-top:.5mm; }
      .av-ccl-side-v{ font-size:18pt; font-weight:700; color:var(--navy); margin-top:2.5mm; }
      .av-ccl-val{ font-size:29pt; font-weight:700; color:var(--navy); margin:0; padding:5mm 10mm; border:.8mm solid var(--teal); border-radius:8px; display:inline-block; line-height:1.1; background:linear-gradient(135deg,#f3f9f7 0%,#d9ede7 55%,#cbe6dd 100%); }
      .av-ccl-hdhh{ display:block; font-size:11pt; font-weight:500; letter-spacing:.06em; text-transform:uppercase; color:#8a9199; margin-top:2mm; }
      .av-ccl-m2{ font-size:15pt; color:var(--teal-d); font-weight:600; }
      .av-ccl-note{ max-width:200mm; margin:4mm auto 0; padding:0 6mm; text-align:left; font-size:10.5pt; line-height:1.45; color:#444; } .av-ccl-note p{ margin:0 0 2mm; }
      .av-ccl-legal{ max-width:200mm; margin:auto auto 0; border:1px solid #dce2e1; border-radius:4px; background:#fafbfb; padding:1.6mm 4mm; }
      .av-ccl-legal-h{ font-size:6pt; text-transform:uppercase; letter-spacing:.12em; color:#a6acb2; font-weight:700; margin-bottom:.5mm; }
      .av-ccl-legal p{ font-size:6.8pt; line-height:1.28; color:#9099a0; font-style:italic; margin:0; }
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

  // Construit le document HTML complet. shared=true → version « client » (barre simplifiée, pas de Fermer).
  function construireDocAvis(a, geo, shared){
    const pages = [
      pageCouverture(a, geo), pageSommaire(), pageGroupe(), pageAvertissement(),
      pagePresentation(a), pageVuesActif(a), pageLocalisation(a, geo),
      pageTechnique(a), pageComparatif(a), pageSwot(a), pageValorisation(a), pageConclusion(a),
      pageContact(a)
    ].join('');
    const titre = `Avis de valeur — ${enseigneDe(a) || typeActifDe(a)} ${a.ville||''}`.trim();
    const toolbar = shared
      ? `<div class="toolbar"><b>${esc(titre)}</b><div class="acts"><button class="btn-print" onclick="window.print()">⬇ Télécharger en PDF</button></div></div>`
      : `<div class="toolbar"><b>${esc(titre)}</b><div class="acts"><button class="btn-print" onclick="window.print()">📄 Enregistrer en PDF / Imprimer</button><button class="btn-close" onclick="window.close()">Fermer</button></div></div>`;
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${esc(titre)}</title>
      <link rel="icon" href="https://gtec-immobilier.fr/favicon.png">
      <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
      <style>${styles()}</style></head>
      <body>
        ${toolbar}
        <div class="sheet">${pages}</div>
        <script>${initCartesScript()}<\/script>
      </body></html>`;
    return { html, titre };
  }

  // Aperçu local (nouvelle fenêtre, avec Fermer).
  async function generer(id){
    if(!id){ alert('Aucun avis sélectionné.'); return; }
    let a;
    try{ a = await charger(id); }
    catch(e){ alert('Impossible de charger l’avis : '+(e.message||e)); return; }
    const geo = await geocoder(a);
    const { html } = construireDocAvis(a, geo, false);
    const w = window.open('', '_blank');
    if(!w){ alert('La fenêtre a été bloquée. Autorisez les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  // Publie l'avis en ligne (version client, pleine qualité) et copie le lien. Lien stable par avis.
  async function publierLien(id){
    if(!id){ alert('Aucun avis sélectionné.'); return; }
    let a;
    try{ a = await charger(id); }
    catch(e){ alert('Impossible de charger l’avis : '+(e.message||e)); return; }
    const geo = await geocoder(a);
    const { html } = construireDocAvis(a, geo, true);
    try{
      const blob = new Blob([html], { type:'text/html; charset=utf-8' });
      const up = await sb.storage.from('offres').upload('avis-public/'+id+'.html', blob, { contentType:'text/html; charset=utf-8', upsert:true, cacheControl:'60' });
      if(up.error) throw up.error;
    }catch(e){ alert('Impossible de publier l’avis : '+(e.message||e)); return; }
    afficherLien('https://gtec-immobilier.fr/a/?id=' + encodeURIComponent(id), id);
  }

  // Révoque le lien : supprime l'avis publié → le lien ne mène plus à rien.
  async function revoquerLien(id){
    if(!id) return;
    if(!confirm('Révoquer le lien de cet avis ? Le client qui l’ouvrira ne verra plus rien. (Vous pourrez toujours en regénérer un nouveau.)')) return;
    try{
      const { error } = await sb.storage.from('offres').remove(['avis-public/'+id+'.html']);
      if(error) throw error;
      const bg=document.getElementById('av-lien-bg'); if(bg) bg.remove();
      alert('Lien révoqué : l’avis en ligne a été supprimé.');
    }catch(e){ alert('Impossible de révoquer : '+(e.message||e)); }
  }

  // Petite fenêtre : lien copié, copier / ouvrir / révoquer.
  function afficherLien(url, id){
    try{ if(navigator.clipboard) navigator.clipboard.writeText(url); }catch(e){}
    const old = document.getElementById('av-lien-bg'); if(old) old.remove();
    const bg = document.createElement('div'); bg.id='av-lien-bg';
    bg.style.cssText='position:fixed;inset:0;background:rgba(26,39,56,.5);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,Arial,sans-serif';
    bg.innerHTML = `<div style="background:#fff;border-radius:14px;width:min(560px,92%);box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden">
      <div style="background:#1A2738;color:#fff;padding:14px 20px;font-weight:700">🔗 Lien de l’avis à envoyer au client</div>
      <div style="padding:18px 20px">
        <p style="margin:0 0 10px;color:#4A5A5E;font-size:14px">Le lien a été copié. Collez-le dans votre e-mail : le client verra l’avis en pleine qualité, sans téléchargement lourd (et pourra l’enregistrer en PDF s'il le souhaite).</p>
        <input id="av-lien-input" readonly value="${esc(url)}" onclick="this.select()" style="width:100%;padding:10px;border:1px solid #c9d0d3;border-radius:8px;font-size:13px;box-sizing:border-box">
      </div>
      <div style="padding:0 20px 18px;display:flex;gap:10px;align-items:center">
        <button onclick="GTEC_AVIS.revoquerLien('${esc(id||'')}')" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#fbe9e9;color:#b3261e">🗑️ Révoquer le lien</button>
        <span style="flex:1"></span>
        <button onclick="var i=document.getElementById('av-lien-input');i.select();document.execCommand('copy')" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#3D8074;color:#fff">📋 Copier</button>
        <a href="${esc(url)}" target="_blank" rel="noopener" style="border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#243A54;color:#fff;text-decoration:none">↗ Ouvrir</a>
        <button onclick="document.getElementById('av-lien-bg').remove()" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#e3e8ea;color:#333">Fermer</button>
      </div></div>`;
    bg.addEventListener('click', e=>{ if(e.target===bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  /* ==========================================================================
     FORMULAIRE — saisie / modification d'un avis de valeur
     ========================================================================== */
  let A = { id:null, cover_url:null, photoFile:null, photo_presentation_url:null, presFile:null };

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
      #av-ed .msel{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
      #av-ed .msel-chip{border:1px solid #c7d0d3;border-radius:16px;padding:4px 11px;font-size:12.5px;cursor:pointer;background:#fff;color:#333;user-select:none}
      #av-ed .msel-chip:hover{border-color:#3D8074}
      #av-ed .msel-chip.on{background:#3D8074;color:#fff;border-color:#3D8074}
      #av-ed label{font-size:12.5px;color:#4A5A5E;font-weight:600}
      #av-ed input,#av-ed textarea,#av-ed select{border:1px solid #c9d0d3;border-radius:8px;padding:8px 10px;font-size:14px;font-family:inherit;width:100%}
      #av-ed textarea{min-height:60px;resize:vertical}
      #av-ed .check{flex-direction:row;align-items:center;gap:8px} #av-ed .check input{width:auto}
      #av-ed .rows{display:flex;flex-direction:column;gap:8px}
      #av-ed .row{display:grid;gap:8px;align-items:center}
      #av-ed .row.loyer{grid-template-columns:1.4fr .8fr .8fr .8fr .8fr 28px}
      #av-ed .row.comp{grid-template-columns:.8fr 1fr 1.3fr .8fr .8fr 1fr 28px}
      #av-ed .row.lot{grid-template-columns:1fr 1fr 1.6fr .9fr 28px}
      #av-ed .row.occ{grid-template-columns:1fr 28px}
      #av-ed .occ-box{border:1px solid #d7dde0;border-radius:10px;padding:11px 13px;background:#fafcfb}
      #av-ed .occ-box>label{margin-bottom:7px}
      #av-ed .cad-row{display:flex;gap:8px;align-items:stretch}
      #av-ed .cad-row input{flex:1}
      #av-ed .cad-btn{white-space:nowrap;border:0;border-radius:8px;background:#eef3f1;color:#2f6359;font-weight:600;font-size:13px;padding:0 12px;cursor:pointer}
      #av-ed .cad-btn:hover{background:#dfeae6}
      #av-ed .swot-form{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}
      #av-ed .swot-form textarea{min-height:70px}
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
  // Menu déroulant simple — listes d'options alignées sur le CRM des offres (EQUIP_CAT).
  const SEL = (id,label,v,opts) => `<div class="f"><label>${esc(label)}</label><select id="${id}"><option value="">—</option>`+
    opts.map(o=>`<option value="${esc(o)}" ${(v||'')===o?'selected':''}>${esc(o)}</option>`).join('')+`</select></div>`;
  // Multi-sélection par étiquettes (plusieurs valeurs possibles, stockées séparées par des virgules).
  const MSEL = (id,label,v,opts) => {
    const sel = String(v||'').split(',').map(s=>s.trim()).filter(Boolean);
    const chips = opts.map(o=>`<span class="msel-chip${sel.includes(o)?' on':''}" data-v="${esc(o)}" onclick="GTEC_AVIS._mselToggle(this,'${id}')">${esc(o)}</span>`).join('');
    return `<div class="f full"><label>${esc(label)}</label>
      <input type="hidden" id="${id}" value="${esc(sel.join(', '))}">
      <div class="msel">${chips}</div></div>`;
  };
  const CK = (id,label,v) => `<div class="f check full"><input id="${id}" type="checkbox" ${v?'checked':''}><label for="${id}" style="font-weight:500">${esc(label)}</label></div>`;
  const SELA = (v) => `<div class="f full"><label>Négociateur GTEC</label><select id="av-agent">`+
    [['FB','Florent BOURDIEC'],['VDM','Valéry de Martelaere']].map(([k,n])=>`<option value="${k}" ${(v||'FB')===k?'selected':''}>${esc(n)}</option>`).join('')+`</select></div>`;
  // Cadre « Occupant(s) » : 1 à 3 enseignes / sociétés occupant le bien, juste sous le consultant.
  function occRow(o){ o=o||{};
    return `<div class="row occ">
      <input data-k="nom" value="${esc(o.nom||'')}" placeholder="Enseigne ou société de l'occupant">
      <button type="button" class="del" onclick="GTEC_AVIS._delOcc(this)">×</button></div>`;
  }
  const occBox = (list) => `<div class="f full occ-box">
      <label>Occupant(s) — enseigne / société</label>
      <div class="rows" id="av-occ-rows">${list.map(occRow).join('')}</div>
      <button type="button" class="addbtn" id="av-occ-add" onclick="GTEC_AVIS._addOcc()">＋ Ajouter un occupant</button>
    </div>`;
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
  function _occCap(){ const add=document.getElementById('av-occ-add'); if(!add) return; const n=document.querySelectorAll('#av-occ-rows .row').length; add.style.display = n>=3 ? 'none' : ''; }
  function _addOcc(){ const rows=document.getElementById('av-occ-rows'); if(!rows || rows.querySelectorAll('.row').length>=3) return; rows.insertAdjacentHTML('beforeend', occRow()); _occCap(); }
  function _delOcc(b){ b.closest('.row').remove(); _occCap(); }
  function _addLoyer(){ document.getElementById('av-loyer-rows').insertAdjacentHTML('beforeend', loyerRow()); }
  function _addComp(){ document.getElementById('av-comp-rows').insertAdjacentHTML('beforeend', compRow()); }
  function _delLoyer(b){ b.closest('.row').remove(); _calc(); }
  function _delComp(b){ b.closest('.row').remove(); }

  // ---- Import de ventes comparables (DVF) -----------------------------------
  let DVF_LAST = [];
  const gv = id => { const e=document.getElementById(id); return e?e.value.trim():''; };
  const _frDate = iso => (iso&&iso.includes('-')) ? iso.slice(0,10).split('-').reverse().join('/') : (iso||'');

  async function _geocode(){
    const q=[gv('av-adresse'), gv('av-cp'), gv('av-ville')].filter(Boolean).join(' ');
    if(!q){ alert('Renseigne d’abord l’adresse et la ville du bien.'); return null; }
    try{
      const r=await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q='+encodeURIComponent(q));
      const j=await r.json(); const f=j.features&&j.features[0];
      if(!f){ alert('Adresse introuvable pour le géocodage.'); return null; }
      return { lon:f.geometry.coordinates[0], lat:f.geometry.coordinates[1], insee:f.properties.citycode, label:f.properties.label };
    }catch(e){ alert('Échec du géocodage : '+(e.message||e)); return null; }
  }

  async function _dvfPick(){
    const geo=await _geocode(); if(!geo) return;
    _dvfOverlay('<div class="dvf-h"><b>Ventes comparables — DVF</b><button type="button" onclick="GTEC_AVIS._dvfClose()">×</button></div><div style="padding:34px;text-align:center;color:#555">Recherche des ventes autour de<br><b>'+esc(geo.label)+'</b>…</div>');
    try{
      const { data, error } = await sb.functions.invoke('dvf-comparables', { body:{ insee:geo.insee, lat:geo.lat, lon:geo.lon, dist:2000, years:5 } });
      if(error) throw error;
      if(data && data.error) throw new Error(data.error);
      DVF_LAST = (data&&data.items)||[];
      _dvfRender(data||{items:[]}, geo);
    }catch(e){ _dvfClose(); alert('Échec de la recherche DVF : '+(e.message||e)); }
  }

  function _dvfRender(data, geo){
    const items=data.items||[];
    const rows=items.map((c,i)=>`<label class="dvf-row">
      <input type="checkbox" data-i="${i}" ${i<5?'checked':''}>
      <span class="d">${_frDate(c.date)}</span>
      <span class="a">${esc(c.adresse||'')}${c.commune?(', '+esc(c.commune)):''}</span>
      <span class="b">${c.bati?nb(c.bati)+' m²':''}</span>
      <span class="p">${c.vv?eur(c.vv):''}</span>
      <span class="m">${c.prix_m2?nb(c.prix_m2)+' €/m²':''}</span>
      <span class="x">${c.dist!=null?c.dist+' m':''}</span></label>`).join('');
    const head=`<div class="dvf-h"><b>Ventes comparables — DVF</b><button type="button" onclick="GTEC_AVIS._dvfClose()">×</button></div>
      <div class="dvf-sub">${items.length} vente(s) trouvée(s) autour de ${esc(geo.label)} — rayon 2 km, années ${(data.annees||[]).join(', ')||'—'}. Les 5 plus proches sont pré-cochées.</div>`;
    const list = rows ? `<div class="dvf-list">${rows}</div>` : '<p style="padding:24px;text-align:center;color:#777">Aucune vente commerciale/industrielle trouvée à proximité.</p>';
    const foot=`<div class="dvf-f"><button type="button" class="cancel" onclick="GTEC_AVIS._dvfClose()">Annuler</button>
      <button type="button" class="ok" onclick="GTEC_AVIS._dvfInsert()">Insérer la sélection</button></div>`;
    _dvfSet(head+list+foot);
  }

  function _dvfInsert(){
    const checked=[...document.querySelectorAll('#dvf-ov .dvf-list input:checked')].map(i=>DVF_LAST[+i.dataset.i]).filter(Boolean);
    if(!checked.length){ alert('Coche au moins une vente à insérer.'); return; }
    const rowsEl=document.getElementById('av-comp-rows');
    checked.forEach(c=> rowsEl.insertAdjacentHTML('beforeend', compRow({
      date:_frDate(c.date), typologie:'Local commercial / activité',
      adresse:(c.adresse||'')+(c.commune?(', '+c.commune):''),
      terrain:c.terrain||'', bati:c.bati||'', vv:c.vv||''
    })));
    _dvfGenAnalyse(checked);
    _dvfClose();
  }

  // Génère l'analyse à partir des ventes fournies (insertion) ou du tableau (bouton Régénérer).
  function _dvfGenAnalyse(list){
    const fromList = Array.isArray(list);
    let comps = fromList
      ? list.map(c=>({prix_m2:c.prix_m2, bati:c.bati}))
      : collect('#av-comp-rows').map(c=>({prix_m2:(c.vv&&c.bati)?Math.round(c.vv/c.bati):null, bati:c.bati}));
    comps = comps.filter(c=>c.prix_m2>0);
    if(!comps.length){ alert('Aucune transaction exploitable pour générer l’analyse.'); return; }
    const ta=document.getElementById('av-analyse-comp'); if(!ta) return;
    if(!fromList && ta.value.trim() && !confirm('Remplacer l’analyse actuelle ?')) return;
    const r50=n=>Math.round(n/50)*50;
    const pm=comps.map(c=>c.prix_m2).sort((a,b)=>a-b);
    const med=pm[Math.floor(pm.length/2)];
    const surf=comps.map(c=>c.bati).filter(Boolean);
    const ville=gv('av-ville')||'la commune';
    const adr=gv('av-adresse');
    const sPart = surf.length ? `, portant sur des locaux de ${nb(Math.min(...surf))} à ${nb(Math.max(...surf))} m²,` : '';
    const t1=`Le bien${adr?(' situé '+adr):''} se trouve dans un secteur actif de l’immobilier d’entreprise de ${ville}. Les ${comps.length} ventes retenues à proximité immédiate${sPart} font ressortir une fourchette de valeur de l’ordre de ${nb(r50(pm[0]))} à ${nb(r50(pm[pm.length-1]))} €/m², avec une médiane proche de ${nb(r50(med))} €/m².`;
    const t2=`Au regard de ces références de voisinage direct, la valeur vénale du bien peut être appréciée sur une base d’environ ${nb(r50(med))} €/m² de surface utile, à ajuster selon l’état, la divisibilité et la qualité d’emplacement au sein de la zone.`;
    ta.value = t1+'\n\n'+t2;
  }

  function _dvfOverlay(inner){
    _dvfClose();
    if(!document.getElementById('dvf-ov-style')){
      const st=document.createElement('style'); st.id='dvf-ov-style'; st.textContent=`
        #dvf-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10010;display:flex;align-items:center;justify-content:center}
        #dvf-ov .box{background:#fff;border-radius:12px;width:min(900px,95vw);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font-family:inherit}
        #dvf-ov .dvf-h{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;background:#1A2738;color:#fff;font-size:16px}
        #dvf-ov .dvf-h button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}
        #dvf-ov .dvf-sub{padding:10px 18px;font-size:13px;color:#555;background:#f4f6f7;border-bottom:1px solid #e3e8ea}
        #dvf-ov .dvf-list{overflow:auto;padding:4px 10px}
        #dvf-ov .dvf-row{display:grid;grid-template-columns:24px 76px 1fr 78px 104px 92px 56px;align-items:center;gap:8px;padding:7px 8px;border-bottom:1px solid #eef0f2;font-size:13px;cursor:pointer}
        #dvf-ov .dvf-row:hover{background:#f7faf9}
        #dvf-ov .dvf-row .a{font-weight:600;color:#1A2738}
        #dvf-ov .dvf-row .m{font-weight:700;color:#2f6359;text-align:right}
        #dvf-ov .dvf-row .p,#dvf-ov .dvf-row .b{text-align:right;color:#444}
        #dvf-ov .dvf-row .x{text-align:right;color:#9aa0a6}
        #dvf-ov .dvf-f{display:flex;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid #e3e8ea}
        #dvf-ov .dvf-f button{border:0;border-radius:9px;padding:9px 16px;font-weight:600;cursor:pointer}
        #dvf-ov .dvf-f .ok{background:#3D8074;color:#fff} #dvf-ov .dvf-f .cancel{background:#e3e8ea;color:#333}`;
      document.head.appendChild(st);
    }
    const ov=document.createElement('div'); ov.id='dvf-ov';
    ov.innerHTML=`<div class="box">${inner}</div>`;
    ov.addEventListener('click',e=>{ if(e.target===ov) _dvfClose(); });
    document.body.appendChild(ov); return ov;
  }
  function _dvfSet(inner){ const b=document.querySelector('#dvf-ov .box'); if(b) b.innerHTML=inner; }
  function _dvfClose(){ const e=document.getElementById('dvf-ov'); if(e) e.remove(); }

  // Bascule une étiquette de multi-sélection et met à jour la valeur (champ caché).
  function _mselToggle(chip, id){
    chip.classList.toggle('on');
    const cont=chip.parentElement;
    const vals=[...cont.querySelectorAll('.msel-chip.on')].map(c=>c.dataset.v);
    const inp=document.getElementById(id); if(inp) inp.value=vals.join(', ');
  }
  function _photo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.photoFile=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-photo-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function _presPhoto(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.presFile=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-pres-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function _cadPhoto(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.cadFile=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-cad-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function _int1Photo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.int1File=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-int1-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function _int2Photo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.int2File=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-int2-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function _int3Photo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.int3File=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-int3-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
    r.readAsDataURL(f);
  }
  function _int4Photo(input){
    const f=input.files&&input.files[0]; if(!f) return;
    A.int4File=f;
    const r=new FileReader();
    r.onload=e=>{ const p=document.getElementById('av-int4-prev'); if(p) p.innerHTML=`<img src="${e.target.result}" alt="">`; };
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
    A = { id:id||null, cover_url:a.cover_url||null, photoFile:null, photo_presentation_url:a.photo_presentation_url||null, presFile:null, cadastre_url:a.cadastre_url||null, cadFile:null, photo_int1_url:a.photo_int1_url||null, int1File:null, photo_int2_url:a.photo_int2_url||null, int2File:null, photo_int3_url:a.photo_int3_url||null, int3File:null, photo_int4_url:a.photo_int4_url||null, int4File:null, client_id:a.client_id||null };
    const loyer = Array.isArray(a.loyer_lignes) && a.loyer_lignes.length ? a.loyer_lignes : [{designation:'',surface:null,loyer_m2:null}];
    const comp  = Array.isArray(a.comparables) ? a.comparables : [];
    const lots  = Array.isArray(a.lots) && a.lots.length ? a.lots : [{}];
    const occ   = Array.isArray(a.occupants) && a.occupants.length ? a.occupants : [{}];
    const sw    = a.swot || {};
    const defAgent = (id ? a.agent : (window.ME_AGENT||'FB')) || 'FB';
    const titreModal = id ? `Avis de valeur ${a.reference?'— '+esc(a.reference):''}` : 'Nouvel avis de valeur';

    const html = `<div id="av-ed-bg" onclick="if(event.target===this)GTEC_AVIS._fermer()"><div id="av-ed">
      <div class="h"><h3>${titreModal}</h3><button class="x" onclick="GTEC_AVIS._fermer()">×</button></div>
      <div class="b">
        <div class="sep">Identité du bâtiment</div>
        <div class="grid">
          ${SELC(a.client_id)}
          ${SELA(defAgent)}
          ${occBox(occ)}
          ${I('av-proprietaire','Propriétaire — SCI / société (nom de la couverture)', a.proprietaire, {full:true})}
          ${I('av-typeactif','Type d’actif (ex : Cellule commerciale en copropriété)', a.type_actif)}
          ${I('av-adresse','Adresse', a.adresse, {full:true})}
          ${I('av-ville','Ville', a.ville)}
          ${I('av-cp','Code postal', a.code_postal)}
          ${I('av-annee','Année de construction', a.annee, {type:'number'})}
          ${MSEL('av-structure','Structure du bâtiment', a.structure_batiment, ['Métallique','Béton','Brique'])}
          ${MSEL('av-toiture','Toiture', a.toiture, ['Bac acier','Tuiles','Toiture-terrasse','Photovoltaïque','Simple peau','Double peau','Fibrociment','Isolé'])}
          ${MSEL('av-isolation','Isolation', a.isolation, ['Simple peau','Double peau','RT 2012','RT 2005','RE2020'])}
          ${MSEL('av-chauffage','Chauffage', a.chauffage, ['Électrique','Gaz','Solaire','Pompe à chaleur','Fioul','Collectif','Aérothermes','Climatisation réversible','Climatisation centralisée'])}
        </div>
        <div class="f full" style="margin-top:12px"><label>Photo du bâtiment (couverture)</label>
          <input type="file" accept="image/*" onchange="GTEC_AVIS._photo(this)">
          <div class="photo" id="av-photo-prev">${a.cover_url?`<img src="${esc(a.cover_url)}" alt="">`:''}</div></div>
        <div class="f full" style="margin-top:12px"><label>Photo de présentation de l’actif <span style="font-weight:400;color:#6b7280">(facultatif — sinon la photo de couverture est reprise)</span></label>
          <input type="file" accept="image/*" onchange="GTEC_AVIS._presPhoto(this)">
          <div class="photo" id="av-pres-prev">${a.photo_presentation_url?`<img src="${esc(a.photo_presentation_url)}" alt="">`:''}</div></div>

        <div class="sep">Vues intérieures <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#6b7280">(facultatif — page « Vues de l’actif », n’apparaît que si au moins une photo)</span></div>
        <div class="grid">
          <div class="f"><label>Photo intérieure 1</label>
            <input type="file" accept="image/*" onchange="GTEC_AVIS._int1Photo(this)">
            <div class="photo" id="av-int1-prev">${a.photo_int1_url?`<img src="${esc(a.photo_int1_url)}" alt="">`:''}</div></div>
          <div class="f"><label>Photo intérieure 2</label>
            <input type="file" accept="image/*" onchange="GTEC_AVIS._int2Photo(this)">
            <div class="photo" id="av-int2-prev">${a.photo_int2_url?`<img src="${esc(a.photo_int2_url)}" alt="">`:''}</div></div>
          <div class="f"><label>Photo intérieure 3</label>
            <input type="file" accept="image/*" onchange="GTEC_AVIS._int3Photo(this)">
            <div class="photo" id="av-int3-prev">${a.photo_int3_url?`<img src="${esc(a.photo_int3_url)}" alt="">`:''}</div></div>
          <div class="f"><label>Photo intérieure 4</label>
            <input type="file" accept="image/*" onchange="GTEC_AVIS._int4Photo(this)">
            <div class="photo" id="av-int4-prev">${a.photo_int4_url?`<img src="${esc(a.photo_int4_url)}" alt="">`:''}</div></div>
        </div>

        <div class="sep">Détail des lots & surfaces</div>
        <div class="rowhead row lot"><span>Bâtiment</span><span>Niveau</span><span>Désignation (usage / occupant)</span><span>Surface m²</span><span></span></div>
        <div class="rows" id="av-lots-rows">${lots.map(lotRow).join('')}</div>
        <button type="button" class="addbtn" onclick="GTEC_AVIS._addLot()">＋ Ajouter un lot</button>
        <div class="lots-tot">Surface totale (somme automatique) :<b id="av-lots-tot">—</b></div>

        <div class="sep">Foncier & cadastre</div>
        <div class="grid">
          <div class="f"><label>Parcelle cadastrale</label>
            <div class="cad-row">
              <input id="av-cadastre" type="text" value="${a.parcelle_cadastrale==null?'':esc(a.parcelle_cadastrale)}" placeholder="ex : AB-123">
              <button type="button" class="cad-btn" onclick="GTEC_AVIS._cadastre()" title="Ouvrir le cadastre (vue aérienne) sur l'adresse du bien">🗺️ Cadastre</button>
            </div>
          </div>
          ${I('av-foncier','Surface du foncier (m²)', a.surface_foncier, {type:'number'})}
          ${CK('av-copro','Foncier en copropriété', a.copropriete)}
        </div>
        <div class="f full" style="margin-top:10px"><label>Extrait cadastral (capture du plan, parcelle surlignée)</label>
          <input type="file" accept="image/*" onchange="GTEC_AVIS._cadPhoto(this)">
          <div class="photo" id="av-cad-prev">${a.cadastre_url?`<img src="${esc(a.cadastre_url)}" alt="">`:''}</div>
          <p class="hint">Clique « 🗺️ Cadastre » ci-dessus, fais une capture de la parcelle, puis importe-la ici. Elle apparaîtra sur la page « Localisation » du document.</p></div>

        <div class="sep">Valeur locative de marché</div>
        <div class="rowhead row loyer"><span>Composante</span><span>Surface m²</span><span>Loyer €/m²/an</span><span>Marché min</span><span>Marché max</span><span></span></div>
        <div class="rows" id="av-loyer-rows">${loyer.map(loyerRow).join('')}</div>
        <button type="button" class="addbtn" onclick="GTEC_AVIS._addLoyer()">＋ Ajouter une composante (bureaux, stockage, vente…)</button>
        <div class="grid" style="margin-top:12px">
          ${I('av-taux','Taux de rendement (%) — décimales possibles (ex : 7,2)', a.taux_rendement==null?'':String(a.taux_rendement).replace('.',','), {attr:'inputmode="decimal" oninput="GTEC_AVIS._calc()"'})}
          ${I('av-frais','Frais de mutation (%)', a.frais_mutation_pct==null?'':String(a.frais_mutation_pct).replace('.',','), {attr:'inputmode="decimal" oninput="GTEC_AVIS._calc()"'})}
          ${I('av-valest','Valeur retenue (€, vide = net vendeur calculé)', a.valeur_estimee, {type:'number', attr:'oninput="GTEC_AVIS._calc()"', full:true})}
        </div>
        <div class="calc" id="av-calc"></div>
        ${TA('av-commarche','Commentaire sur la valorisation (apparaît sous le tableau)', a.commentaire_marche)}

        <div class="sep">Transactions comparables</div>
        <p class="hint" style="margin:-4px 0 8px">Recherche automatique des ventes DVF des 5 dernières années autour de l’adresse du bien, puis sélection à cocher.</p>
        <button type="button" class="addbtn" style="background:#1A2738;color:#fff;border-color:#1A2738" onclick="GTEC_AVIS._dvfPick()">🔍 Importer des ventes comparables (DVF)</button>
        <div class="rowhead row comp"><span>Date</span><span>Typologie</span><span>Adresse</span><span>Terrain m²</span><span>Bâti m²</span><span>Valeur vénale €</span><span></span></div>
        <div class="rows" id="av-comp-rows">${comp.map(compRow).join('')}</div>
        <button type="button" class="addbtn" onclick="GTEC_AVIS._addComp()">＋ Ajouter une transaction comparable</button>
        <div class="f full" style="margin-top:12px"><label>Analyse comparative <span style="font-weight:400;color:#6b7280">(générée automatiquement, librement modifiable — apparaît sous le tableau)</span> <button type="button" class="addbtn" style="display:inline-block;width:auto;padding:2px 10px;font-size:12px;margin-left:6px" onclick="GTEC_AVIS._dvfGenAnalyse()">↻ Régénérer</button></label>
          <textarea id="av-analyse-comp" style="min-height:120px">${a.analyse_comparative==null?'':esc(a.analyse_comparative)}</textarea></div>

        <div class="sep">Analyse SWOT</div>
        <p class="hint" style="margin:-4px 0 8px">Une ligne = un point (chaque ligne devient une puce dans le document).</p>
        <div class="swot-form">
          <div class="f"><label>Forces</label><textarea id="av-swot-f">${sw.forces==null?'':esc(sw.forces)}</textarea></div>
          <div class="f"><label>Faiblesses</label><textarea id="av-swot-w">${sw.faiblesses==null?'':esc(sw.faiblesses)}</textarea></div>
          <div class="f"><label>Opportunités</label><textarea id="av-swot-o">${sw.opportunites==null?'':esc(sw.opportunites)}</textarea></div>
          <div class="f"><label>Menaces</label><textarea id="av-swot-t">${sw.menaces==null?'':esc(sw.menaces)}</textarea></div>
        </div>

        <div class="sep">Textes des pages</div>
        ${TA('av-acces','Analyse de l’emplacement (page Localisation, à gauche du cadastre)', a.accessibilite)}
        ${TA('av-ccl','Commentaire de conclusion', a.commentaire_conclusion)}
        ${TA('av-resp','Mention de responsabilité (phrase type — page Conclusion)', a.commentaire_responsabilite)}
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
    _calc(); _occCap();
  }

  async function save(genApres){
    const g  = id => { const e=document.getElementById(id); return e?(e.value.trim()||null):null; };
    const gn = id => { const v=g(id); if(v==null) return null; const n=Number(String(v).replace(',','.')); return isNaN(n)?null:n; };
    let cover_url = A.cover_url || null;
    let photo_presentation_url = A.photo_presentation_url || null;
    let cadastre_url = A.cadastre_url || null;
    let photo_int1_url = A.photo_int1_url || null;
    let photo_int2_url = A.photo_int2_url || null;
    let photo_int3_url = A.photo_int3_url || null;
    let photo_int4_url = A.photo_int4_url || null;
    try{
      if(A.photoFile) cover_url = await uploadPhoto(A.photoFile);
      if(A.presFile)  photo_presentation_url = await uploadPhoto(A.presFile);
      if(A.cadFile)   cadastre_url = await uploadPhoto(A.cadFile);
      if(A.int1File)  photo_int1_url = await uploadPhoto(A.int1File);
      if(A.int2File)  photo_int2_url = await uploadPhoto(A.int2File);
      if(A.int3File)  photo_int3_url = await uploadPhoto(A.int3File);
      if(A.int4File)  photo_int4_url = await uploadPhoto(A.int4File);
    }
    catch(e){ alert('Échec de l’envoi de la photo : '+(e.message||e)); return; }
    const lotsArr = collect('#av-lots-rows');
    const surfaceTot = lotsArr.reduce((x,l)=>x+(Number(l.surface)||0),0) || null;
    const payload = {
      client_id:A.client_id||null,
      agent:g('av-agent'), proprietaire:g('av-proprietaire'),
      type_actif:g('av-typeactif'), adresse:g('av-adresse'), ville:g('av-ville'), code_postal:g('av-cp'),
      cover_url, photo_presentation_url, photo_int1_url, photo_int2_url, photo_int3_url, photo_int4_url, annee:gn('av-annee'),
      structure_batiment:g('av-structure'), toiture:g('av-toiture'), isolation:g('av-isolation'), chauffage:g('av-chauffage'),
      lots:lotsArr, surface_totale:surfaceTot, occupants:collect('#av-occ-rows'),
      swot:{ forces:g('av-swot-f'), faiblesses:g('av-swot-w'), opportunites:g('av-swot-o'), menaces:g('av-swot-t') },
      parcelle_cadastrale:g('av-cadastre'), surface_foncier:gn('av-foncier'), cadastre_url,
      copropriete:document.getElementById('av-copro').checked,
      loyer_lignes:collect('#av-loyer-rows'),
      taux_rendement:gn('av-taux'), frais_mutation_pct:gn('av-frais'), valeur_estimee:gn('av-valest'),
      comparables:collect('#av-comp-rows'),
      analyse_comparative:g('av-analyse-comp'),
      accessibilite:g('av-acces'),
      commentaire_marche:g('av-commarche'), commentaire_conclusion:g('av-ccl'),
      commentaire_responsabilite:g('av-resp'),
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

  // Ouvre le Géoportail (photo aérienne + couche cadastre) centré sur l'adresse saisie,
  // pour repérer la parcelle et recopier sa référence. Gain de temps + vérif visuelle.
  async function ouvrirCadastre(){
    const v = id => (document.getElementById(id)||{}).value || '';
    const q = [v('av-adresse'), v('av-cp'), v('av-ville')].filter(Boolean).join(' ').trim();
    if(!q){ alert("Renseignez d'abord l'adresse (ou au moins la ville) du bien."); return; }
    // Service dédié cadastre et pérenne (data.gouv.fr) : vue aérienne + parcelles.
    // Format du lien : ?style=ortho#<zoom>/<lat>/<lon>. À défaut de coordonnées,
    // on ouvre la carte avec sa barre « Rechercher une adresse ».
    let url = 'https://cadastre.data.gouv.fr/map';
    try{
      const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q='+encodeURIComponent(q));
      const j = await r.json();
      const c = ((j.features||[])[0]||{}).geometry;
      if(c && Array.isArray(c.coordinates)){
        const [lon,lat] = c.coordinates;
        url += '?style=ortho#18/'+lat+'/'+lon;
      }
    }catch(e){}
    window.open(url, '_blank', 'noopener');
  }

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

  window.GTEC_AVIS = { nouveau, editer, generer, resume, publierLien, revoquerLien,
    _calc, _addLot, _delLot, _addOcc, _delOcc, _addLoyer, _addComp, _delLoyer, _delComp, _photo, _presPhoto, _cadPhoto, _int1Photo, _int2Photo, _int3Photo, _int4Photo, _dvfPick, _dvfInsert, _dvfGenAnalyse, _dvfClose, _mselToggle, _fermer:fermer, _save:save, _pickClient:pickClient, _cadastre:ouvrirCadastre };
})();
