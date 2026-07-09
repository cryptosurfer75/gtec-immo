/* ============================================================================
   GTEC IMMOBILIER — Publication des annonces sur leboncoin.fr (Import API)
   ----------------------------------------------------------------------------
   v1 branchée sur l'environnement de TEST (QA / bac à sable) uniquement — voir
   ~/.claude/plans (chantier « Intégration leboncoin.fr ») et Teams > MOT DE PASSE.
   Une offre en transaction "les_deux" peut avoir une annonce vente ET une annonce
   location en même temps (table offre_leboncoin, une ligne par (offre_id, ad_type)).
   Usage :  GTEC_LEBONCOIN.chargerLignes()  (une fois, dans vueOffres())
            GTEC_LEBONCOIN.badge(offre)     (dans ligneOffre())
            GTEC_LEBONCOIN.publier(offreId) (ouvre la modale de publication)
   Dépend de la variable globale `sb` et, pour le rafraîchissement de la liste
   après publication, de la fonction globale `filtrerOffres` (déjà utilisée par
   toggleVitrine/toggleMandat dans index.html).
   ========================================================================== */
(function(){
  'use strict';
  const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const eur = n => n==null ? '—' : new Intl.NumberFormat('fr-FR').format(Math.round(n))+' €';

  // Copie minimale de la liste AGENTS de crm/dossier.js (non exportée par ce module,
  // dupliquée ici par nécessité — à garder synchronisée si un agent change de coordonnées).
  const AGENTS = {
    FB:  { mail:'florent.bourdiec@gtec-immo.com', tel:'0629983569' },
    VDM: { mail:'val.dm@gtec-immo.com',           tel:'0611511691' }
  };

  // Type de bien GTEC → code leboncoin (real_estate_type). Confiance "haute" = confirmée sur
  // un exemple officiel leboncoin ou une énumération sans ambiguïté ; "basse" = à vérifier en
  // testant sur le bac à sable (voir Phase 8 du plan) avant de considérer le mapping fiable.
  const TYPE_MAP = {
    bureaux:             { real_estate_type:'19', confiance:'haute' },
    local_commercial:    { real_estate_type:'15', confiance:'haute' },
    entrepot_logistique: { real_estate_type:'15', confiance:'basse' },
    activite:            { real_estate_type:'16', confiance:'basse' },
    fonds_de_commerce:   { real_estate_type:'14', confiance:'basse' },
    terrain:             { real_estate_type:'3',  confiance:'haute' }
  };
  const STATUT_INFO = {
    non_publie:           { c:'#9aa3ab', bg:'transparent',            lib:'Non publié' },
    en_cours_publication: { c:'#e8912d', bg:'rgba(232,145,45,.20)',   lib:'Publication en cours…' },
    en_cours_maj:         { c:'#e8912d', bg:'rgba(232,145,45,.20)',   lib:'Mise à jour en cours…' },
    publie:                { c:'var(--teal)', bg:'rgba(61,128,116,.22)', lib:'En ligne sur leboncoin' },
    erreur:                { c:'#d23f3f', bg:'rgba(210,63,63,.20)',   lib:'Erreur' },
    en_cours_suppression:  { c:'#e8912d', bg:'rgba(232,145,45,.20)',  lib:'Retrait en cours…' },
    retire:                 { c:'#9aa3ab', bg:'rgba(154,163,171,.20)', lib:'Retiré de leboncoin' }
  };

  let CACHE = {};           // offre_id -> [lignes offre_leboncoin]
  let PUB_OFFRE = null, PUB_PHOTOS = [], PUB_MSG = '';

  async function chargerLignes(){
    const { data, error } = await sb.from('offre_leboncoin').select('*');
    if(error){ console.error('leboncoin chargerLignes', error); CACHE = {}; return; }
    CACHE = {};
    (data||[]).forEach(l=>{ (CACHE[l.offre_id] = CACHE[l.offre_id]||[]).push(l); });
  }

  function pastille(ligne){
    const info = STATUT_INFO[ligne.statut] || STATUT_INFO.non_publie;
    const lettre = ligne.ad_type==='vente' ? 'V' : 'L';
    const titre = `${ligne.ad_type==='vente'?'Vente':'Location'} — ${info.lib}${ligne.derniere_erreur?' : '+ligne.derniere_erreur:''}`;
    return `<span title="${esc(titre)}" style="display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${info.bg};color:${info.c};border:1.5px solid ${info.c};font-size:.68rem;font-weight:800;margin-right:3px">${lettre}</span>`;
  }

  function badge(offre){
    const lignes = CACHE[offre.id] || [];
    const contenu = lignes.length ? lignes.map(pastille).join('') : `<span title="Pas encore publié sur leboncoin" style="display:inline-block;width:13px;height:13px;border-radius:50%;background:#fff;border:1.5px solid var(--gris-clair)"></span>`;
    return `<span style="cursor:pointer" onclick="event.stopPropagation();GTEC_LEBONCOIN.publier('${offre.id}')">${contenu}</span>`;
  }

  function typesPossibles(offre){
    if(offre.transaction==='les_deux') return ['vente','location'];
    if(offre.transaction==='vente') return ['vente'];
    return ['location'];
  }

  // Construit le payload attendu par la fonction leboncoin-sync (le jeton et le user_id
  // leboncoin, eux, restent strictement côté serveur — voir supabase/functions/leboncoin-sync).
  function mapperOffre(offre, adType, photos){
    const map = TYPE_MAP[offre.type_bien] || {};
    const estTerrain = offre.type_bien === 'terrain';
    const prix = adType==='vente' ? offre.prix_vente : offre.loyer_annuel_m2;   // déjà le total MENSUEL pour une location
    const agent = AGENTS[offre.agent] || AGENTS.FB;
    const telDigits = (agent.tel||'').replace(/\D/g,'');

    const source = (photos && photos.length) ? photos.slice()
      : (offre.cover_url ? [{ url:offre.cover_url, est_principale:true, ordre:0 }] : []);
    source.sort((a,b)=> (b.est_principale?1:0)-(a.est_principale?1:0) || (a.ordre??0)-(b.ordre??0));
    const media = source.map(p=>({ is_principal: !!p.est_principale, type:1, url:p.url }));

    return {
      ad: {
        category: estTerrain ? (adType==='vente'?1:2) : 4,
        title: offre.titre || (typeof LABELS!=='undefined' && LABELS[offre.type_bien]) || 'Bien',
        body: offre.description || '',
        price: [Math.max(0, Math.round(prix||0))],
        client_reference: offre.reference || undefined,
        real_estate: {
          real_estate_type: map.real_estate_type,
          ...(offre.surface_m2 ? { surfaces: { surface: offre.surface_m2 } } : {}),
          // Nos loyers GTEC sont toujours "HT HC" ou "NET HC" (Hors Charges) : jamais charges comprises.
          ...(adType==='location' ? { price_details: { rent_has_charges_included: false } } : {})
        }
      },
      ad_reply: { email: agent.mail, ...(telDigits?{phone_number:telDigits}:{}), displayed_contact: 'GTEC Immobilier' },
      client: { contact: 'GTEC Immobilier', zip_code: offre.code_postal||'', city: offre.ville||'' },
      location: { zip_code: offre.code_postal||'', city: offre.ville||'', ...(offre.adresse?{address:offre.adresse}:{}) },
      media
    };
  }

  function validation(offre, photos){
    const manque = [];
    if(!offre.ville || !offre.code_postal) manque.push('ville / code postal');
    if(!offre.titre) manque.push('titre');
    if(!(photos&&photos.length) && !offre.cover_url) manque.push('au moins une photo');
    return manque;
  }

  async function publier(offreId){
    const offre = (typeof OFFRES!=='undefined' ? OFFRES : []).find(o=>String(o.id)===String(offreId));
    if(!offre){ alert('Bien introuvable.'); return; }
    PUB_OFFRE = offre; PUB_MSG = '';
    const { data } = await sb.from('offre_photos').select('id,url,ordre,est_principale').eq('offre_id',offreId).order('ordre');
    PUB_PHOTOS = data||[];
    const { data: lignes } = await sb.functions.invoke('leboncoin-sync', { body:{ action:'status', offre_id:offreId } });
    CACHE[offreId] = (lignes && lignes.lignes) || [];
    rendre();
  }

  function ligneCard(adType){
    const lignes = CACHE[PUB_OFFRE.id] || [];
    const ligne = lignes.find(l=>l.ad_type===adType);
    const info = STATUT_INFO[ligne ? ligne.statut : 'non_publie'];
    const manque = validation(PUB_OFFRE, PUB_PHOTOS);
    const prix = adType==='vente' ? PUB_OFFRE.prix_vente : PUB_OFFRE.loyer_annuel_m2;
    const map = TYPE_MAP[PUB_OFFRE.type_bien] || {};
    return `<div class="f full" style="border:1.5px solid var(--gris-clair);border-radius:10px;padding:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <b>${adType==='vente'?'Vente':'Location'}</b>
        <span style="font-size:.78rem;font-weight:700;color:${info.c};background:${info.bg};padding:3px 9px;border-radius:20px">${esc(info.lib)}</span>
      </div>
      <div style="font-size:.85rem;color:var(--gris-fonce);margin-top:6px">
        Prix envoyé : <b>${eur(prix)}${adType==='location'?'/mois':''}</b> ·
        Type leboncoin : <b>${esc(map.real_estate_type||'?')}</b>${map.confiance==='basse'?' <span style="color:#e8912d">(à confirmer en test)</span>':''}
      </div>
      ${ligne && ligne.derniere_erreur ? `<div style="font-size:.8rem;color:#d23f3f;margin-top:6px">${esc(ligne.derniere_erreur)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
        <button type="button" class="btn btn-sm" ${manque.length?'disabled title="Champs manquants : '+esc(manque.join(', '))+'"':''} onclick="GTEC_LEBONCOIN._publierType('${adType}')">${ligne?'🔄 Mettre à jour':'📢 Publier'}</button>
        ${ligne && ligne.statut!=='retire' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_LEBONCOIN._retirerType('${adType}')">🗑 Retirer</button>` : ''}
      </div>
    </div>`;
  }

  function rendre(){
    if(!PUB_OFFRE) return;
    const manque = validation(PUB_OFFRE, PUB_PHOTOS);
    document.getElementById('modal-root2').innerHTML = `<div class="modal-bg" style="z-index:200" onclick="if(event.target===this)GTEC_LEBONCOIN._fermer()"><div class="modal">
      <div class="modal-h"><h3>📢 Publier sur leboncoin — ${esc(PUB_OFFRE.reference||'')}</h3><button class="x" onclick="GTEC_LEBONCOIN._fermer()">×</button></div>
      <div class="modal-f">
        <div style="background:rgba(232,145,45,.15);color:#8a5a00;border-radius:8px;padding:8px 12px;font-size:.82rem;font-weight:700;margin-bottom:12px">
          ⚠️ Environnement de TEST (bac à sable) — cette annonce n'est pas visible sur le vrai leboncoin.fr.
        </div>
        <div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
          ${PUB_OFFRE.cover_url?`<img src="${esc(PUB_OFFRE.cover_url)}" style="width:72px;height:72px;object-fit:cover;border-radius:8px">`:''}
          <div>
            <b>${esc(PUB_OFFRE.titre||'—')}</b><br>
            <span style="font-size:.85rem;color:var(--gris-fonce)">${esc(PUB_OFFRE.ville||'—')} · ${PUB_PHOTOS.length} photo(s)</span>
          </div>
        </div>
        ${manque.length ? `<div style="color:#d23f3f;font-size:.82rem;margin-bottom:10px">Publication impossible tant que ces champs manquent : ${esc(manque.join(', '))}.</div>` : ''}
        <div class="form-grid">${typesPossibles(PUB_OFFRE).map(ligneCard).join('')}</div>
        <div style="font-size:.8rem;color:var(--gris-fonce);margin-top:10px">${esc(PUB_MSG)}</div>
      </div>
      <div class="modal-foot"><span></span><button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_LEBONCOIN._fermer()">Fermer</button></div>
    </div></div>`;
  }

  async function publierType(adType){
    PUB_MSG = 'Envoi en cours…'; rendre();
    const payload = mapperOffre(PUB_OFFRE, adType, PUB_PHOTOS);
    const { data, error } = await sb.functions.invoke('leboncoin-sync', { body:{ action:'publish', offre_id:PUB_OFFRE.id, ad_type:adType, payload } });
    if(error || (data&&data.error)){ PUB_MSG = 'Erreur : '+((data&&(data.error||JSON.stringify(data.detail)))||error.message); }
    else PUB_MSG = 'Envoyé — le statut se mettra à jour automatiquement (ou via retour manuel).';
    await rafraichir();
  }

  async function retirerType(adType){
    if(!confirm('Retirer cette annonce de leboncoin ?')) return;
    PUB_MSG = 'Retrait en cours…'; rendre();
    const { data, error } = await sb.functions.invoke('leboncoin-sync', { body:{ action:'delete', offre_id:PUB_OFFRE.id, ad_type:adType } });
    if(error || (data&&data.error)) PUB_MSG = 'Erreur : '+((data&&data.error)||error.message);
    else PUB_MSG = 'Annonce retirée.';
    await rafraichir();
  }

  async function rafraichir(){
    const { data } = await sb.functions.invoke('leboncoin-sync', { body:{ action:'status', offre_id:PUB_OFFRE.id } });
    CACHE[PUB_OFFRE.id] = (data && data.lignes) || [];
    rendre();
    if(typeof window.filtrerOffres === 'function'){
      window.filtrerOffres((document.getElementById('offres-search')||{}).value || '');
    }
  }

  function fermer(){ document.getElementById('modal-root2').innerHTML=''; PUB_OFFRE=null; PUB_PHOTOS=[]; PUB_MSG=''; }

  window.GTEC_LEBONCOIN = { chargerLignes, badge, publier, _publierType:publierType, _retirerType:retirerType, _fermer:fermer };
})();
