/* ==========================================================================
   GTEC IMMOBILIER — Module « LOI » (Lettre d'offre)
   Deux variantes : proposition de prise à bail (location) / proposition
   d'achat (acquisition). Expose window.GTEC_LOI. Réutilise les helpers
   globaux de index.html (sb, esc, nomClient, panel, vide, erreur, charge, C,
   optClients, chargerClients, ME_AGENT, LABELS, CLIENTS).
   Patron calqué sur facture.js (modale d'édition, génération PDF, lien client).
   ========================================================================== */
(function(){
  'use strict';

  /* ------------------------------------------------------------------ *
   *  IDENTITÉ DE L'AGENCE — mêmes mentions légales que facture.js.
   * ------------------------------------------------------------------ */
  const AGENCE = {
    raison_sociale:  'GTEC Immobilier',
    forme_juridique: 'SAS',
    capital:         '1 000 €',
    adresse:         '2 rue Delambre, 80000 Amiens',
    ville:           'Amiens',
    siret:           '10061953500014',
    rcs:             'Amiens 100 619 535',
    tva_intra:       'FR49100619535',
    carte_pro:       'CPI 80012026000000003',
    mention_detention: 'Transaction sur immeubles et fonds de commerce – Non détention de fonds',
    telephone:       '',
    email:           '',
    site:            'gtec-immobilier.fr'
  };
  const LOGO = 'https://gtec-immobilier.fr/logo-gtec-vert.png?v=2';

  /* ------------------------------------------------------------------ *
   *  État
   * ------------------------------------------------------------------ */
  let LISTE = [];
  let OFFRES = [];
  let MANDATS = [];
  let FILTRE_TYPE = 'tous';       // tous | location | acquisition
  let FILTRE_STATUT = '';
  let RECHERCHE = '';
  let ED = { id:null, type:'location' };

  const TYPE_LABEL = { location:'Proposition de bail', acquisition:'Proposition d’achat' };
  const STATUT_LABEL = { brouillon:'Brouillon', envoyee:'Envoyée', acceptee:'Acceptée', refusee:'Refusée', caduque:'Caduque' };

  function vocab(type){
    return type==='acquisition'
      ? { client:'Acquéreur', clientMaj:'ACQUÉREUR', contrepartie:'Vendeur', contrepartieMaj:'VENDEUR',
          titreDoc:'PROPOSITION D’ACHAT', mandatMandant:'mandat de vente', mandatClient:'mandat d’acquérir' }
      : { client:'Preneur', clientMaj:'PRENEUR', contrepartie:'Bailleur', contrepartieMaj:'BAILLEUR',
          titreDoc:'PROPOSITION DE PRISE À BAIL', mandatMandant:'mandat de location', mandatClient:'mandat de recherche' };
  }

  function statutBadge(l){
    const map = {
      brouillon:['#eceff1','#546e7a'], envoyee:['rgba(30,80,140,.14)','#1e508c'],
      acceptee:['rgba(46,125,50,.15)','#2e7d32'], refusee:['#fbe9e9','#b3261e'], caduque:['#f3e5d8','#9a6a2c']
    };
    const [bg,c] = map[l.statut]||['#eceff1','#546e7a'];
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:700;background:${bg};color:${c}">${STATUT_LABEL[l.statut]||l.statut}</span>`;
  }
  function typeBadge(l){
    return l.type==='acquisition'
      ? `<span class="tag blue">🏷️ Achat</span>` : `<span class="tag green">🔑 Bail</span>`;
  }

  /* ------------------------------------------------------------------ *
   *  Petits utilitaires
   * ------------------------------------------------------------------ */
  const today = () => new Date().toISOString().slice(0,10);
  const euro2 = n => (n==null||n===''||isNaN(n)) ? '—' : new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' €';
  const fmtDate = d => { if(!d) return '—'; const [y,m,j]=String(d).slice(0,10).split('-'); return `${j}/${m}/${y}`; };

  /* Nombre → lettres (français), pour les mentions légales en toutes lettres. */
  function nombreEnLettres(n){
    n = Math.round(Number(n)||0);
    if(n===0) return 'zéro';
    const neg = n<0; n = Math.abs(n);
    const unites = ['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const dizaines = ['','dix','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
    function troisChiffres(v){
      const c = Math.floor(v/100), r = v%100;
      let out = '';
      if(c>0){ out += (c>1 ? unites[c]+' cent' : 'cent') + (c>1 && r===0 ? 's' : ''); if(r>0) out += ' '; }
      if(r>0){
        if(r<20) out += unites[r];
        else {
          const d = Math.floor(r/10), u = r%10;
          if(d===7||d===9) out += dizaines[d-1] + '-' + unites[10+u];
          else if(u===0) out += dizaines[d] + (d===8 ? 's' : '');
          else if(u===1 && d!==8) out += dizaines[d] + ' et un';
          else out += dizaines[d] + '-' + unites[u];
        }
      }
      return out;
    }
    const echelles = [['milliard',1e9],['million',1e6]];
    let parts = [], reste = n;
    for(const [nom, val] of echelles){
      const q = Math.floor(reste/val);
      if(q>0){ parts.push(troisChiffres(q)+' '+nom+(q>1?'s':'')); reste %= val; }
    }
    const mille = Math.floor(reste/1000);
    if(mille>0){ parts.push(mille===1 ? 'mille' : troisChiffres(mille)+' mille'); reste %= 1000; }
    if(reste>0 || parts.length===0) parts.push(troisChiffres(reste));
    return (neg?'moins ':'') + parts.filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
  }

  /* ------------------------------------------------------------------ *
   *  Chargement des listes annexes
   * ------------------------------------------------------------------ */
  async function chargerOffresLoi(){
    const { data } = await sb.from('offres').select(
      'id,reference,titre,type_bien,transaction,adresse,ville,code_postal,surface_m2,prix_vente,'+
      'loyer_annuel_m2,loyer_type,charges,taxe_fonciere,honoraires,honoraires_charge,depot_garantie,'+
      'bail,indexation,regime_fiscal,client_id'
    ).eq('archive', false).order('created_at',{ascending:false});
    OFFRES = data||[];
  }
  function optOffresLoi(sel, transaction){
    const list = OFFRES.filter(o=>!transaction || o.transaction===transaction || o.transaction==='les_deux');
    return [['','— Choisir un bien —'], ...list.map(o=>[o.id,(o.reference?o.reference+' · ':'')+(o.titre||LABELS[o.type_bien]||'Bien')+(o.ville?' — '+o.ville:'')])]
      .map(([v,t])=>`<option value="${v}" ${String(sel)===String(v)?'selected':''}>${esc(t)}</option>`).join('');
  }
  async function chargerMandatsLoi(){
    const { data } = await sb.from('mandats').select('id,numero,offre_id,client_id,type_mandat,date_debut').order('created_at',{ascending:false});
    MANDATS = data||[];
  }
  function optMandatsLoi(sel){
    return [['','— Aucun mandat —'], ...MANDATS.map(m=>[m.id, m.numero||('Mandat '+String(m.id).slice(0,8))])]
      .map(([v,t])=>`<option value="${v}" ${String(sel)===String(v)?'selected':''}>${esc(t)}</option>`).join('');
  }
  async function nextRef(){
    try{
      const { data } = await sb.from('lois').select('reference');
      let max=0; (data||[]).forEach(r=>{ const m=/LOI-(\d+)/.exec(r.reference||''); if(m) max=Math.max(max,+m[1]); });
      return 'LOI-'+String(max+1).padStart(4,'0');
    }catch(e){ return 'LOI-0001'; }
  }
  async function charger(id){
    const { data, error } = await sb.from('lois').select('*, clients(*)').eq('id', id).single();
    if(error) throw error;
    return data;
  }

  /* ==================================================================
     VUE LISTE
     ================================================================== */
  async function vueLoi(){
    charge();
    const [{ data, error }] = await Promise.all([
      sb.from('lois').select('*, clients(id,type_client,nom,prenom,raison_sociale)').order('created_at',{ascending:false}),
      chargerClients(), chargerOffresLoi(), chargerMandatsLoi()
    ]);
    if(error) return erreur(error);
    LISTE = data||[];

    const enCours = LISTE.filter(l=>['brouillon','envoyee'].includes(l.statut)).length;
    const acceptees = LISTE.filter(l=>l.statut==='acceptee').length;
    const stats = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;padding:16px 16px 4px">
      ${carte('Total', LISTE.length, 'propositions enregistrées')}
      ${carte('En cours', enCours, 'brouillon ou envoyée')}
      ${carte('Acceptées', acceptees, 'engagement du client obtenu')}
    </div>`;

    const filtres = `<div style="padding:12px 16px;border-bottom:1px solid var(--gris-clair);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;gap:6px">
        ${segBtn('tous','Toutes')} ${segBtn('location','🔑 Bail')} ${segBtn('acquisition','🏷️ Achat')}
      </div>
      <select onchange="GTEC_LOI._statut(this.value)" style="padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
        <option value="">Tous les statuts</option>
        ${Object.entries(STATUT_LABEL).map(([k,v])=>`<option value="${k}" ${FILTRE_STATUT===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <input id="loi-search" type="search" autocomplete="off" placeholder="🔎 Réf., client, bien…" value="${esc(RECHERCHE)}"
        oninput="GTEC_LOI._search(this.value)"
        style="flex:1;min-width:200px;max-width:380px;padding:9px 12px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
    </div>`;

    const rows = filtrer();
    const corps = stats + filtres + (rows.length
      ? `<div class="tscroll"><table><thead><tr>
           <th>Réf.</th><th>Type</th><th>Client</th><th>Bien</th><th>Date</th><th>Validité</th><th>Statut</th><th>Actions</th>
         </tr></thead><tbody id="loi-tbody">${rows.map(ligne).join('')}</tbody></table></div>`
      : vide('Aucune proposition. Créez votre première LOI.'));

    C().innerHTML = panel('LOI — Propositions de bail / d’achat', `${LISTE.length} document(s)`, corps,
      `<button class="btn btn-sm" onclick="GTEC_LOI.nouveau('location')">+ Proposition de bail</button>
       <button class="btn btn-sm" onclick="GTEC_LOI.nouveau('acquisition')">+ Proposition d’achat</button>`);
  }
  function carte(libelle, valeur, sous){
    return `<div class="stat"><div class="n">${esc(String(valeur))}</div><div class="l">${esc(libelle)}</div>
      <div style="font-size:.72rem;color:var(--gris-fonce);margin-top:2px">${esc(sous||'')}</div></div>`;
  }
  function segBtn(v,txt){
    const on = FILTRE_TYPE===v;
    return `<button onclick="GTEC_LOI._type('${v}')" class="btn btn-sm ${on?'':'btn-ghost'}" style="padding:8px 14px">${txt}</button>`;
  }
  function filtrer(){
    let r = LISTE;
    if(FILTRE_TYPE!=='tous') r = r.filter(l=>l.type===FILTRE_TYPE);
    if(FILTRE_STATUT) r = r.filter(l=>l.statut===FILTRE_STATUT);
    const q = (RECHERCHE||'').toLowerCase().trim();
    if(q) r = r.filter(l=>[(l.reference||''), nomClient(l.clients), ((l.contenu||{}).bien_adresse||'')].join(' ').toLowerCase().includes(q));
    return r;
  }
  function rafraichirTbody(){
    const tb = document.getElementById('loi-tbody'); if(!tb) return;
    const rows = filtrer();
    tb.innerHTML = rows.length ? rows.map(ligne).join('')
      : `<tr><td colspan="8" style="text-align:center;color:var(--gris-fonce);padding:24px">Aucune proposition ne correspond.</td></tr>`;
  }
  function ligne(l){
    const c = l.contenu||{};
    return `<tr style="cursor:pointer" onclick="GTEC_LOI.editer('${l.id}')">
      <td><b>${esc(l.reference||'—')}</b></td>
      <td>${typeBadge(l)}</td>
      <td>${esc(nomClient(l.clients))}</td>
      <td>${esc(c.bien_adresse||'—')}</td>
      <td>${fmtDate(l.date_offre)}</td>
      <td>${l.duree_validite_jours ? l.duree_validite_jours+' j' : '—'}</td>
      <td>${statutBadge(l)}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" title="Aperçu / imprimer" onclick="GTEC_LOI.generer('${l.id}')">📄</button>
        <button class="btn btn-ghost btn-sm" title="Lien client" onclick="GTEC_LOI.publierLien('${l.id}')">🔗</button>
        ${l.statut==='brouillon' ? `<button class="btn btn-ghost btn-sm" title="Supprimer ce brouillon" style="color:#b3261e" onclick="GTEC_LOI.supprimer('${l.id}')">🗑</button>` : ''}
      </td></tr>`;
  }

  /* ==================================================================
     ÉDITEUR
     ================================================================== */
  function injecterCss(){
    if(document.getElementById('loi-css')) return;
    const s = document.createElement('style'); s.id='loi-css';
    s.textContent = `
      #loi-ed-bg{position:fixed;inset:0;background:rgba(26,39,56,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;font-family:'Inter','Segoe UI',Arial,sans-serif}
      #loi-ed{background:#fff;border-radius:14px;width:min(980px,100%);box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden}
      #loi-ed .h{background:#1A2738;color:#fff;padding:15px 22px;display:flex;justify-content:space-between;align-items:center}
      #loi-ed .h h3{margin:0;font-size:1.05rem} #loi-ed .h .x{background:none;border:0;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1}
      #loi-ed .b{padding:20px 22px;max-height:calc(100vh - 200px);overflow:auto}
      #loi-ed .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      #loi-ed .f{display:flex;flex-direction:column;gap:5px} #loi-ed .f.full{grid-column:1/-1}
      #loi-ed label{font-size:.82rem;font-weight:600;color:var(--gris-fonce,#4A5A5E)}
      #loi-ed input,#loi-ed select,#loi-ed textarea{padding:9px 11px;border:1.5px solid #C9D0D3;border-radius:8px;font:inherit;width:100%;box-sizing:border-box}
      #loi-ed textarea{resize:vertical;min-height:60px}
      .loi-sep{font-weight:700;color:#1A2738;margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid #eceff1;grid-column:1/-1}
      #loi-ed .foot{padding:14px 22px;background:#f4f6f7;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .loi-msg{font-size:.85rem;color:var(--gris-fonce,#4A5A5E)} .loi-msg.err{color:#b3261e}
      .loi-check{display:flex;align-items:center;gap:8px;grid-column:1/-1} .loi-check input{width:auto}`;
    document.head.appendChild(s);
  }

  function defaultContenu(type){
    const base = {
      identite_complement:'', mandat_num:'', mandat_date:'', mandat_recherche_num:'', mandat_recherche_date:'',
      bien_nature:'', bien_adresse:'', bien_superficie:'', bien_destination:'',
      occupation:'libre', occ_nom:'', occ_activite:'', occ_enseigne:'', occ_bail_date:'', occ_loyer:'', occ_charges:'',
      proprietaire_nom:'',
      financement_type:'pret', fin_montant_min:null, fin_montant_max:null, fin_taux_min:null, fin_taux_max:null, fin_apport:null,
      conditions_particulieres:'', date_limite_pret:'',
      honoraires_type:'pourcentage', honoraires_pourcentage:null, honoraires_forfait:null, honoraires_charge:'preneur_acquereur'
    };
    if(type==='acquisition') return { ...base, prix_offre:null,
      entree_jouissance_type:'libre', loc_nom:'', loc_bail_date:'',
      notaire_nom:'', notaire_adresse:'', delai_reiteration:'3 mois', date_limite_promesse:'', date_limite_acte:'' };
    return { ...base, bail_type:'Commercial 3/6/9 ans', bail_duree:'9 ans avec préavis de 6 mois à chaque période triennale',
      loyer_annuel:null, paiement:'Trimestriel d’avance', depot_garantie:'3 mois de loyer hors-taxes, hors charges',
      provision_charges:null, provision_charges_detail:'Comprenant entretien et éclairage des espaces verts, nettoyage annuel de la toiture, assurance propriétaire non occupant, gestion administrative de l’ensemble immobilier.',
      taxe_fonciere:null, indexation:'ILC', franchise_loyer:'', regime_fiscal:'TVA', date_entree:'', delai_signature_bail:'1 mois' };
  }

  const champ = (label, inner, full) => `<div class="f${full?' full':''}"><label>${esc(label)}</label>${inner}</div>`;
  const iTxt = (id,v) => `<input id="${id}" value="${esc(v||'')}">`;
  const iNum = (id,v) => `<input id="${id}" type="number" step="0.01" value="${v==null?'':v}">`;
  const iDate = (id,v) => `<input id="${id}" type="date" value="${v||''}">`;
  const iTa = (id,v,rows) => `<textarea id="${id}" rows="${rows||3}">${esc(v||'')}</textarea>`;
  const iSel = (id,v,opts) => `<select id="${id}">${opts.map(([o,t])=>`<option value="${esc(o)}" ${String(v)===String(o)?'selected':''}>${esc(t)}</option>`).join('')}</select>`;

  async function editer(id){
    injecterCss();
    let l;
    if(id){ try{ l = await charger(id); }catch(e){ alert('Chargement impossible : '+(e.message||e)); return; } }
    else l = { type:ED.type, statut:'brouillon', date_offre:today(), duree_validite_jours:15, lieu_signature:AGENCE.ville, contenu:defaultContenu(ED.type) };
    ED = { id:id||null, type:l.type };
    const c = { ...defaultContenu(l.type), ...(l.contenu||{}) };
    const voc = vocab(l.type);
    const titre = id ? (l.reference||'Brouillon') : (l.type==='acquisition' ? 'Nouvelle proposition d’achat' : 'Nouvelle proposition de bail');

    const blocLocation = `
      ${champ('Type de bail', iSel('loi-bail-type', c.bail_type, [['Commercial 3/6/9 ans','Commercial 3/6/9 ans'],['Dérogatoire (précaire)','Dérogatoire (précaire)'],['Professionnel','Professionnel']]))}
      ${champ('Durée du bail', iTxt('loi-bail-duree', c.bail_duree))}
      ${champ('Loyer annuel HT/an', iNum('loi-loyer', c.loyer_annuel))}
      ${champ('Paiement du loyer', iSel('loi-paiement', c.paiement, [['Trimestriel d’avance','Trimestriel d’avance'],['Trimestriel à terme échu','Trimestriel à terme échu'],['Mensuel d’avance','Mensuel d’avance'],['Annuel d’avance','Annuel d’avance']]))}
      ${champ('Dépôt de garantie', iSel('loi-depot', c.depot_garantie, [['1 mois de loyer hors-taxes, hors charges','1 mois de loyer HT HC'],['2 mois de loyer hors-taxes, hors charges','2 mois de loyer HT HC'],['3 mois de loyer hors-taxes, hors charges','3 mois de loyer HT HC']]))}
      ${champ('Provision pour charges (€ HT/an)', iNum('loi-provision', c.provision_charges))}
      ${champ('Détail des charges', iTxt('loi-provision-detail', c.provision_charges_detail), true)}
      ${champ('Taxe foncière (€ HT/an)', iNum('loi-tf', c.taxe_fonciere))}
      ${champ('Indexation annuelle', iSel('loi-indexation', c.indexation, [['ILC','ILC'],['ILAT','ILAT'],['ICC','ICC']]))}
      ${champ('Franchise de loyer', iTxt('loi-franchise', c.franchise_loyer))}
      ${champ('Régime fiscal', iSel('loi-regime', c.regime_fiscal, [['TVA','Assujetti TVA'],['Exonéré de TVA','Exonéré de TVA']]))}
      <div class="loi-sep">Entrée en jouissance</div>
      ${champ('Date d’entrée en jouissance', iDate('loi-date-entree', c.date_entree))}
      ${champ('Délai de signature du bail', iTxt('loi-delai-bail', c.delai_signature_bail))}
      ${champ('Date limite de dépôt de la demande de prêt', iDate('loi-date-pret', c.date_limite_pret))}`;

    const blocAcquisition = `
      ${champ('Prix de la proposition (€)', iNum('loi-prix', c.prix_offre))}
      <div class="loi-sep">Transfert de propriété</div>
      ${champ('Entrée en jouissance', iSel('loi-entree-type', c.entree_jouissance_type, [['libre','Immeuble libre'],['loue','Immeuble loué']]))}
      ${champ('Locataire en place (si loué)', iTxt('loi-loc-nom', c.loc_nom))}
      ${champ('Date du bail du locataire en place', iDate('loi-loc-date', c.loc_bail_date))}
      <div class="loi-sep">Réalisation de la vente</div>
      ${champ('Notaire du mandant — nom', iTxt('loi-notaire-nom', c.notaire_nom))}
      ${champ('Notaire du mandant — adresse', iTxt('loi-notaire-adr', c.notaire_adresse))}
      ${champ('Délai de réitération', iTxt('loi-delai-reit', c.delai_reiteration))}
      ${champ('Date limite de dépôt de la demande de prêt', iDate('loi-date-pret', c.date_limite_pret))}
      ${champ('Date limite de signature de la promesse', iDate('loi-date-promesse', c.date_limite_promesse))}
      ${champ('Date limite de signature de l’acte', iDate('loi-date-acte', c.date_limite_acte))}
      <div class="loi-check">${iSel('loi-fin-type', c.financement_type, [['pret','Financement par prêt bancaire'],['deniers_personnels','Deniers personnels (pas de recours à un prêt)']])} <label for="loi-fin-type" style="text-transform:none;font-weight:500">Mode de financement</label></div>`;

    document.getElementById('modal-root').innerHTML = `<div id="loi-ed-bg" onclick="if(event.target===this)GTEC_LOI._fermer()">
      <div id="loi-ed">
        <div class="h"><h3>${l.type==='acquisition'?'🏷️':'🔑'} ${esc(titre)}</h3><button class="x" onclick="GTEC_LOI._fermer()">×</button></div>
        <div class="b">
          <div class="grid">
            <div class="f full"><label>${voc.client}</label><select id="loi-client">${optClients(l.client_id)}</select></div>
            <div class="f full"><label>Bien concerné</label><select id="loi-offre" onchange="GTEC_LOI._pickOffre()">${optOffresLoi(l.offre_id, l.type==='acquisition'?'vente':'location')}</select></div>
            ${champ('Mandat lié (bailleur/vendeur)', `<select id="loi-mandat" onchange="GTEC_LOI._pickMandat()">${optMandatsLoi(l.mandat_id)}</select>`)}
            ${champ('Statut', iSel('loi-statut', l.statut||'brouillon', Object.entries(STATUT_LABEL)))}
            ${champ('Date de l’offre', iDate('loi-date-offre', l.date_offre||today()))}
            ${champ('Durée de validité (jours)', iNum('loi-duree', l.duree_validite_jours!=null?l.duree_validite_jours:15))}

            <div class="loi-sep">Identité du ${voc.client.toLowerCase()}</div>
            ${champ('Complément d’identité (né(e) le, à, nationalité…)', iTa('loi-identite', c.identite_complement, 2), true)}

            <div class="loi-sep">Désignation du bien</div>
            ${champ('Nature du bien', iTxt('loi-bien-nature', c.bien_nature))}
            ${champ('Superficie', iTxt('loi-bien-superficie', c.bien_superficie))}
            ${champ('Adresse du bien', iTxt('loi-bien-adresse', c.bien_adresse), true)}
            ${champ('Destination des locaux', iTxt('loi-bien-destination', c.bien_destination), true)}
            ${champ('Propriétaire du bien', iTxt('loi-proprietaire', c.proprietaire_nom))}
            ${champ('Occupation actuelle', iSel('loi-occupation', c.occupation, [['libre','Libre de toute occupation'],['occupee','Occupé']]))}
            ${champ('Occupant — nom', iTxt('loi-occ-nom', c.occ_nom))}
            ${champ('Occupant — activité', iTxt('loi-occ-activite', c.occ_activite))}
            ${champ('Occupant — date du bail', iDate('loi-occ-date', c.occ_bail_date))}
            ${champ('Occupant — loyer HT (€)', iNum('loi-occ-loyer', c.occ_loyer))}
            ${champ('Occupant — charges (€)', iNum('loi-occ-charges', c.occ_charges))}

            <div class="loi-sep">Conditions financières</div>
            ${l.type==='acquisition' ? blocAcquisition : blocLocation}

            <div class="loi-sep">Conditions suspensives — financement</div>
            ${champ('Montant du prêt — mini (€)', iNum('loi-fin-min', c.fin_montant_min))}
            ${champ('Montant du prêt — maxi (€)', iNum('loi-fin-max', c.fin_montant_max))}
            ${champ('Taux — mini (%)', iNum('loi-fin-taux-min', c.fin_taux_min))}
            ${champ('Taux — maxi (%)', iNum('loi-fin-taux-max', c.fin_taux_max))}
            ${champ('Apport (€, 0 = sans apport)', iNum('loi-fin-apport', c.fin_apport))}

            <div class="loi-sep">Conditions particulières</div>
            ${champ('Une par ligne', iTa('loi-particulieres', c.conditions_particulieres, 3), true)}

            <div class="loi-sep">Pouvoirs du mandataire</div>
            ${champ(voc.mandatMandant.charAt(0).toUpperCase()+voc.mandatMandant.slice(1)+' — n°', iTxt('loi-mandat-num', c.mandat_num))}
            ${champ(voc.mandatMandant.charAt(0).toUpperCase()+voc.mandatMandant.slice(1)+' — date', iDate('loi-mandat-date', c.mandat_date))}
            ${champ(voc.mandatClient.charAt(0).toUpperCase()+voc.mandatClient.slice(1)+' — n°', iTxt('loi-mandat-rech-num', c.mandat_recherche_num))}
            ${champ(voc.mandatClient.charAt(0).toUpperCase()+voc.mandatClient.slice(1)+' — date', iDate('loi-mandat-rech-date', c.mandat_recherche_date))}

            <div class="loi-sep">Rémunération du mandataire</div>
            ${champ('Honoraires', iTxt('loi-hono-texte', c.honoraires_texte), true)}
            ${champ('À la charge de', iSel('loi-hono-charge', c.honoraires_charge, [['preneur_acquereur',voc.client],['bailleur_vendeur',voc.contrepartie]]))}

            <div class="loi-sep">Signature</div>
            ${champ('Lieu de signature', iTxt('loi-lieu-signature', l.lieu_signature||AGENCE.ville))}
            ${champ('Date de signature (si déjà signée)', iDate('loi-date-signature', l.date_signature))}
          </div>
        </div>
        <div class="foot">
          <span class="loi-msg" id="loi-msg"></span>
          <span style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_LOI._fermer()">Fermer</button>
            <button type="button" class="btn btn-sm" onclick="GTEC_LOI._save()">💾 Enregistrer</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_LOI.generer('${id||''}','live')">📄 Aperçu</button>
          </span>
        </div>
      </div></div>`;
  }

  function pickOffre(){
    const id = document.getElementById('loi-offre').value;
    const o = OFFRES.find(x=>String(x.id)===String(id));
    if(!o) return;
    const set = (fid,v) => { const el=document.getElementById(fid); if(el && v!=null && v!=='') el.value=v; };
    set('loi-bien-nature', LABELS[o.type_bien]||'');
    set('loi-bien-adresse', [o.adresse, [o.code_postal,o.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '));
    set('loi-bien-superficie', o.surface_m2!=null ? o.surface_m2+' m²' : '');
    if(ED.type==='acquisition'){ set('loi-prix', o.prix_vente); }
    else {
      if(o.loyer_annuel_m2!=null) set('loi-loyer', Math.round(o.loyer_annuel_m2*12*100)/100);
      if(o.taxe_fonciere!=null) set('loi-tf', Math.round(o.taxe_fonciere*12*100)/100);
      set('loi-bail-type', o.bail);
      set('loi-indexation', o.indexation);
      set('loi-regime', o.regime_fiscal);
      set('loi-depot', o.depot_garantie);
    }
    set('loi-hono-texte', o.honoraires);
    set('loi-hono-charge', o.honoraires_charge);
    const proprio = (window.CLIENTS||CLIENTS||[]).find(c=>String(c.id)===String(o.client_id));
    if(proprio) set('loi-proprietaire', nomClient(proprio));
    const m = MANDATS.find(x=>String(x.offre_id)===String(o.id) && x.type_mandat===(ED.type==='acquisition'?'vente':'location'));
    if(m){
      const sel = document.getElementById('loi-mandat'); if(sel) sel.value = m.id;
      pickMandat();
    }
  }
  function pickMandat(){
    const id = document.getElementById('loi-mandat').value;
    const m = MANDATS.find(x=>String(x.id)===String(id));
    if(!m) return;
    const set = (fid,v) => { const el=document.getElementById(fid); if(el && v!=null && v!=='') el.value=v; };
    set('loi-mandat-num', m.numero);
    set('loi-mandat-date', m.date_debut);
  }

  async function sauvegarder(){
    const msg = document.getElementById('loi-msg'); msg.className='loi-msg'; msg.textContent='Enregistrement…';
    try{
      const clientId = document.getElementById('loi-client').value || null;
      if(!clientId) throw new Error('Choisis un client dans la liste.');
      const g = fid => { const el=document.getElementById(fid); return el ? el.value.trim() : ''; };
      const gn = fid => { const el=document.getElementById(fid); if(!el || el.value==='') return null; const n=Number(el.value); return isNaN(n)?null:n; };

      const contenu = {
        identite_complement: g('loi-identite'),
        bien_nature: g('loi-bien-nature'), bien_adresse: g('loi-bien-adresse'),
        bien_superficie: g('loi-bien-superficie'), bien_destination: g('loi-bien-destination'),
        proprietaire_nom: g('loi-proprietaire'),
        occupation: g('loi-occupation')||'libre', occ_nom: g('loi-occ-nom'), occ_activite: g('loi-occ-activite'),
        occ_enseigne:'', occ_bail_date: g('loi-occ-date'), occ_loyer: gn('loi-occ-loyer'), occ_charges: gn('loi-occ-charges'),
        financement_type: g('loi-fin-type')||'pret',
        fin_montant_min: gn('loi-fin-min'), fin_montant_max: gn('loi-fin-max'),
        fin_taux_min: gn('loi-fin-taux-min'), fin_taux_max: gn('loi-fin-taux-max'), fin_apport: gn('loi-fin-apport'),
        conditions_particulieres: g('loi-particulieres'),
        date_limite_pret: g('loi-date-pret'),
        mandat_num: g('loi-mandat-num'), mandat_date: g('loi-mandat-date'),
        mandat_recherche_num: g('loi-mandat-rech-num'), mandat_recherche_date: g('loi-mandat-rech-date'),
        honoraires_texte: g('loi-hono-texte'), honoraires_charge: g('loi-hono-charge')||'preneur_acquereur'
      };
      if(ED.type==='acquisition'){
        Object.assign(contenu, {
          prix_offre: gn('loi-prix'),
          entree_jouissance_type: g('loi-entree-type')||'libre', loc_nom: g('loi-loc-nom'), loc_bail_date: g('loi-loc-date'),
          notaire_nom: g('loi-notaire-nom'), notaire_adresse: g('loi-notaire-adr'),
          delai_reiteration: g('loi-delai-reit'), date_limite_promesse: g('loi-date-promesse'), date_limite_acte: g('loi-date-acte')
        });
      } else {
        Object.assign(contenu, {
          bail_type: g('loi-bail-type'), bail_duree: g('loi-bail-duree'), loyer_annuel: gn('loi-loyer'),
          paiement: g('loi-paiement'), depot_garantie: g('loi-depot'),
          provision_charges: gn('loi-provision'), provision_charges_detail: g('loi-provision-detail'),
          taxe_fonciere: gn('loi-tf'), indexation: g('loi-indexation'), franchise_loyer: g('loi-franchise'),
          regime_fiscal: g('loi-regime'), date_entree: g('loi-date-entree'), delai_signature_bail: g('loi-delai-bail')
        });
      }

      const payload = {
        type: ED.type, client_id: clientId,
        offre_id: document.getElementById('loi-offre').value || null,
        mandat_id: document.getElementById('loi-mandat').value || null,
        statut: g('loi-statut')||'brouillon',
        date_offre: g('loi-date-offre')||today(),
        duree_validite_jours: gn('loi-duree')||15,
        lieu_signature: g('loi-lieu-signature')||AGENCE.ville,
        date_signature: g('loi-date-signature')||null,
        contenu, agent: ME_AGENT||null
      };

      let id = ED.id;
      if(id){ const { error } = await sb.from('lois').update(payload).eq('id', id); if(error) throw error; }
      else {
        payload.reference = await nextRef();
        const { data, error } = await sb.from('lois').insert(payload).select('id').single(); if(error) throw error; id = data.id;
      }
      fermer();
      vueLoi();
    }catch(e){ msg.className='loi-msg err'; msg.textContent='Erreur : '+(e.message||e); }
  }
  function fermer(){ const bg=document.getElementById('loi-ed-bg'); if(bg) bg.remove(); }

  async function supprimer(id){
    const l = LISTE.find(x=>String(x.id)===String(id));
    if(l && l.statut!=='brouillon'){ alert('Cette proposition n’est plus au stade de brouillon : elle ne peut plus être supprimée.'); return; }
    if(!confirm('Supprimer définitivement ce brouillon ?')) return;
    const { error } = await sb.from('lois').delete().eq('id', id);
    if(error){ alert('Suppression impossible : '+error.message); return; }
    vueLoi();
  }

  /* ==================================================================
     GÉNÉRATION DU DOCUMENT (PDF imprimable)
     ================================================================== */
  function construireDocLoi(l, shared){
    const c = l.contenu||{};
    const voc = vocab(l.type);
    const cli = l.clients||{};
    const cliNom = nomClient(cli);
    const ag = AGENCE;
    const ref = l.reference || '(brouillon)';

    const toolbar = shared ? '' : `<div class="noprint" style="position:sticky;top:0;background:#1A2738;padding:10px 16px;display:flex;gap:10px;justify-content:center;z-index:9">
      <button onclick="window.print()" style="border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;background:#3D8074;color:#fff">📄 Enregistrer en PDF / Imprimer</button>
      <button onclick="window.close()" style="border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;background:#e3e8ea;color:#333">Fermer</button></div>`;

    const identiteCli = [cliNom, cli.type_client==='societe' && cli.siret ? 'SIRET '+cli.siret : null,
      cli.adresse, c.identite_complement].filter(Boolean).map(esc).join('<br>');

    const occupationHtml = c.occupation==='occupee'
      ? `<p>L’immeuble est actuellement occupé par <b>${esc(c.occ_nom||'—')}</b>, exploitant son activité${c.occ_activite?' de '+esc(c.occ_activite):''}, au terme d’un bail en date du ${fmtDate(c.occ_bail_date)}, moyennant un loyer de ${euro2(c.occ_loyer)} et des charges de ${euro2(c.occ_charges)}.</p>`
      : `<p>L’immeuble est actuellement libre de toute location ou occupation.</p>`;

    const clausesSuspensivesCommunes = l.type==='acquisition'
      ? `<li>Que le ou les vendeurs justifient de la propriété régulière du ou des biens désignés ci-avant.</li>
         <li>Que les titres de propriété antérieurs et les pièces d’urbanisme ne révèlent aucune servitude, charge ou vice pouvant grever l’immeuble et en diminuer la valeur ou le rendre impropre à sa destination.</li>
         <li>Qu’aucun droit de préemption pouvant exister ne soit exercé.</li>
         <li>Que l’état hypothécaire ne révèle l’existence d’aucune inscription dont la charge, augmentée du coût des radiations à effectuer, serait supérieure au prix de vente.</li>
         <li>Que les dispositions d’urbanisme et servitudes d’utilité publique ne portent pas atteinte à l’intégrité de l’immeuble ni à sa valeur, et ne mettent pas en cause le droit de propriété et de jouissance de l’acquéreur.</li>`
      : `<li>Que le ou les bailleurs justifient de la propriété régulière du ou des biens désignés ci-avant.</li>
         <li>Que les titres de propriété antérieurs et les pièces d’urbanisme ne révèlent aucune servitude, charge ou vice pouvant affecter la jouissance de l’immeuble et en diminuer ou le rendre impropre à sa destination.</li>
         <li>Qu’aucun droit de préemption pouvant exister ne soit exercé.</li>
         <li>Que les dispositions d’urbanisme et servitudes d’utilité publique ne mettent pas en cause, à plus ou moins long terme, le droit de jouissance du preneur ni ne le rendent impropre à la destination qu’il envisage de donner à l’immeuble.</li>`;

    const clauseFinancementPret = `<li>De l’obtention d’un ou plusieurs financements d’un montant minimal de ${euro2(c.fin_montant_min)} et maximal de ${euro2(c.fin_montant_max)}, au taux minimum de ${c.fin_taux_min!=null?c.fin_taux_min+' %':'—'} et maximum de ${c.fin_taux_max!=null?c.fin_taux_max+' %':'—'} hors assurances, ${c.fin_apport?'avec un apport de '+euro2(c.fin_apport):'sans apport'}.</li>`;

    const deniersPersonnelsHtml = `<p>${voc.client} déclare avoir l’intention de réaliser le financement du prix par le biais de ses deniers personnels ou assimilés, et ne vouloir recourir à aucun prêt pour le paiement du prix de l’acquisition (art. L313-40 et s. du Code de la consommation).</p>
       <p style="border:1px dashed #b9c3c8;border-radius:6px;padding:10px 12px;font-style:italic">Mention manuscrite à porter par l’acquéreur : « je reconnais avoir été informé que si, contrairement à la déclaration faite, je recours néanmoins à un prêt, je ne pourrai me prévaloir des dispositions du chapitre 3, du titre 1er, du livre III de la partie législative du Code de la consommation ».</p>`;

    const clausesBlock = (l.type==='acquisition' && c.financement_type==='deniers_personnels')
      ? `<ul class="loi-list">${clausesSuspensivesCommunes}</ul>${deniersPersonnelsHtml}`
      : `<ul class="loi-list">${clausesSuspensivesCommunes}${clauseFinancementPret}</ul>`;

    const conditionsFinancieres = l.type==='acquisition'
      ? `<ul class="loi-list">
          <li>Prix proposé : <b>${euro2(c.prix_offre)}</b> net vendeur (${nombreEnLettres(c.prix_offre).toUpperCase()} EUROS).</li>
          <li>En cas d’accord, ce prix sera payé intégralement au plus tard le jour de la signature de l’acte authentique de vente.</li>
        </ul>`
      : `<ul class="loi-list">
          <li>Type de bail : ${esc(c.bail_type||'—')}</li>
          <li>Durée du bail : ${esc(c.bail_duree||'—')}</li>
          <li>Loyer annuel : <b>${euro2(c.loyer_annuel)}</b> HT/an hors charges (${nombreEnLettres(c.loyer_annuel).toUpperCase()} EUROS HORS TAXES HORS CHARGES PAR AN)</li>
          <li>Paiement du loyer et charges : ${esc(c.paiement||'—')}</li>
          <li>Dépôt de garantie : ${esc(c.depot_garantie||'—')}</li>
          <li>Provision pour charges : ${euro2(c.provision_charges)} HT/an — ${esc(c.provision_charges_detail||'')}</li>
          <li>Taxe foncière : ${euro2(c.taxe_fonciere)} HT/an</li>
          <li>Indexation du loyer : indice ${esc(c.indexation||'—')}</li>
          ${c.franchise_loyer ? `<li>Franchise de loyer : ${esc(c.franchise_loyer)}</li>` : ''}
          <li>Régime fiscal : ${esc(c.regime_fiscal||'—')}</li>
        </ul>`;

    const entreeHtml = l.type==='acquisition'
      ? `<p>En application de l’article 1304-6 du Code civil, le transfert de propriété aura lieu le jour de la signature de l’acte authentique de vente.</p>
         ${c.entree_jouissance_type==='loue'
            ? `<p>Le bien sera, le jour de la signature de l’acte authentique, loué à ${esc(c.loc_nom||'—')}, suivant bail en date du ${fmtDate(c.loc_bail_date)}.</p>`
            : `<p>L’entrée en jouissance s’effectuera le jour même par la prise de possession réelle des lieux, le vendeur s’obligeant à rendre l’immeuble libre de toute location ou occupation.</p>`}
         <p>En cas d’acceptation, le projet de promesse de vente devra être transmis par ${esc(c.notaire_nom||'le notaire du mandant')}${c.notaire_adresse?', '+esc(c.notaire_adresse):''}, dans un délai de ${esc(c.delai_reiteration||'—')} à compter de l’expiration de la validité de la présente proposition.</p>
         <ul class="loi-list">
           <li>Date de dépôt de la demande de prêt au plus tard le : ${fmtDate(c.date_limite_pret)}</li>
           <li>Promesse de vente signée avant le : ${fmtDate(c.date_limite_promesse)}</li>
           <li>Acte de vente signé avant le : ${fmtDate(c.date_limite_acte)}</li>
         </ul>`
      : `<p>L’entrée en jouissance s’effectuera le ${fmtDate(c.date_entree)}, le ou les bailleurs s’obligeant, pour cette date, à rendre l’immeuble libre de toute location ou occupation.</p>
         <p>En cas d’acceptation de la proposition, la signature du bail devra intervenir dans un délai de ${esc(c.delai_signature_bail||'—')} à compter de l’expiration de la durée de validité de la présente proposition.</p>
         <p>Date de dépôt de la demande de prêt en banque au plus tard le : ${fmtDate(c.date_limite_pret)}</p>`;

    const dureeValidite = l.duree_validite_jours!=null ? l.duree_validite_jours : 15;
    const dateFinValidite = (() => { if(!l.date_offre) return null; const d=new Date(l.date_offre); d.setDate(d.getDate()+dureeValidite); return d.toISOString().slice(0,10); })();

    const remuneration = `<p>Sous réserve que le ou les ${voc.contrepartie.toLowerCase()}s acceptent la présente offre, ${esc(ag.raison_sociale)} aura droit, après réalisation des conditions suspensives, à une rémunération de <b>${esc(c.honoraires_texte||'—')}</b>, à la charge ${c.honoraires_charge==='bailleur_vendeur'?'du '+voc.contrepartie.toLowerCase():'du '+voc.client.toLowerCase()}. Cette rémunération sera payable le jour de la signature de l’acte constatant l’accord des parties.</p>`;

    const pouvoirs = `<ul class="loi-list">
        <li>D’un ${voc.mandatMandant} donné par le mandant, enregistré sous le numéro ${esc(c.mandat_num||'—')}, en date du ${fmtDate(c.mandat_date)}.</li>
        ${(c.mandat_recherche_num || c.mandat_recherche_date) ? `<li>D’un ${voc.mandatClient} donné par ${esc(cliNom)}, enregistré sous le numéro ${esc(c.mandat_recherche_num||'—')}, en date du ${fmtDate(c.mandat_recherche_date)}.</li>` : ''}
      </ul>
      <p>En vertu de ce ou de ces mandats, ${esc(ag.raison_sociale)} est autorisée à recevoir, pour le compte du mandant, la présente proposition ${l.type==='acquisition'?'d’achat':'de prise à bail'} du bien désigné ci-avant.</p>`;

    const particulieres = (c.conditions_particulieres||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

    const idLine = [ag.raison_sociale, ag.adresse, ag.rcs&&('RCS '+ag.rcs),
      ag.forme_juridique&&(ag.forme_juridique+(ag.capital?' au capital de '+ag.capital:'')),
      ag.siret&&('SIRET '+ag.siret), ag.tva_intra&&('TVA '+ag.tva_intra), ag.carte_pro&&('Carte pro '+ag.carte_pro+' — '+ag.mention_detention)
    ].filter(Boolean).map(esc).join(' — ');

    const montantSignature = l.type==='acquisition' ? c.prix_offre : c.loyer_annuel;
    const mentionSignature = mode => l.type==='acquisition'
      ? `Bon pour ${mode==='client'?'achat':'acceptation'} au prix de ${euro2(montantSignature)} (${nombreEnLettres(montantSignature).toUpperCase()} EUROS)`
      : `Bon pour ${mode==='client'?'prise à bail':'location'} au loyer annuel HT de ${euro2(montantSignature)} (${nombreEnLettres(montantSignature).toUpperCase()} EUROS)`;

    const styles = `
      :root{--navy:#1A2738;--teal:#3D8074}
      *{box-sizing:border-box} body{margin:0;font-family:'Inter','Segoe UI',Arial,sans-serif;color:#2A3338;background:#525659;font-size:12.5px}
      .sheet{position:relative;background:#fff;width:210mm;min-height:297mm;margin:16px auto;box-shadow:0 6px 30px rgba(0,0,0,.4);padding:16mm 16mm 22mm}
      .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid var(--navy);padding-bottom:12px}
      .head img{height:16mm}
      .head .titleblk{text-align:right}
      .head h1{margin:0;font-size:20px;color:var(--navy);letter-spacing:.5px}
      .head .ref{font-size:11px;color:#5a6b75;margin-top:4px}
      .adr-block{display:flex;justify-content:space-between;gap:24px;margin-top:16px;font-size:11.5px;line-height:1.6}
      .adr-block .who{color:var(--teal);font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
      h2{font-size:13.5px;color:var(--navy);border-bottom:1.5px solid #dbe2e4;padding-bottom:4px;margin:20px 0 8px}
      h3{font-size:12px;color:var(--teal);margin:12px 0 5px}
      p{margin:6px 0;line-height:1.55;text-align:justify}
      .loi-list{margin:6px 0;padding-left:20px} .loi-list li{margin:4px 0;line-height:1.5}
      .body-open{font-size:11.5px;line-height:1.6}
      .foot-legal{position:absolute;left:16mm;right:16mm;bottom:9mm;font-size:7.5px;color:#8a8a8a;line-height:1.5;text-align:center}
      .sign{display:flex;justify-content:space-between;gap:24px;margin-top:24px;page-break-inside:avoid}
      .sign .col{width:48%;text-align:center}
      .sign .fait{font-size:11px;color:#33414b;margin-bottom:10px}
      .sign .mention{font-size:9.5px;color:#44535c;font-style:italic;margin-bottom:10px;line-height:1.4}
      .sign .box{border:1.2px solid #b9c3c8;border-radius:6px;height:110px}
      .sign .who{font-weight:700;color:var(--navy);margin-top:6px}
      @media print{ body{background:#fff} .noprint{display:none!important} .sheet{margin:0;box-shadow:none;width:auto;min-height:0} @page{size:A4;margin:0} }
      @media screen and (max-width:760px){ body{background:#fff} .sheet{width:auto;margin:0;padding:16px;box-shadow:none} .adr-block{flex-direction:column;gap:10px} .sign{flex-direction:column} .sign .col{width:100%} }`;

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(voc.titreDoc+' '+ref)} — GTEC</title><style>${styles}</style></head>
      <body>${toolbar}<div class="sheet">
        <div class="head">
          <img src="${LOGO}" alt="${esc(ag.raison_sociale)}">
          <div class="titleblk"><h1>${voc.titreDoc}</h1><div class="ref">N° ${esc(ref)} · ${fmtDate(l.date_offre)}${dateFinValidite?' · valable jusqu’au '+fmtDate(dateFinValidite):''}</div></div>
        </div>

        <div class="adr-block">
          <div><div class="who">${voc.clientMaj}</div>${identiteCli}</div>
          <div style="text-align:right"><div class="who">À l’intention de</div>${esc(ag.raison_sociale)}<br>${esc(ag.forme_juridique)} au capital de ${esc(ag.capital)}<br>${esc(ag.adresse)}<br>RCS ${esc(ag.rcs)}<br>Carte pro ${esc(ag.carte_pro)}</div>
        </div>

        <p class="body-open" style="margin-top:16px">Je soussigné(e) <b>${esc(cliNom)}</b>, ci-après désigné « le ${voc.client} », déclare avoir visité, par l’intermédiaire de ${esc(ag.raison_sociale)}, le bien ci-après désigné, que je me propose de prendre ${l.type==='acquisition'?'en vue d’achat':'à bail'}, aux conditions arrêtées ci-après.</p>

        <h2>1. Désignation du bien</h2>
        <ul class="loi-list">
          <li>Nature du bien : ${esc(c.bien_nature||'—')}</li>
          <li>Adresse du bien : ${esc(c.bien_adresse||'—')}</li>
          <li>Superficie : ${esc(c.bien_superficie||'—')}</li>
          ${c.bien_destination?`<li>Destination des locaux : ${esc(c.bien_destination)}</li>`:''}
        </ul>
        ${occupationHtml}
        ${c.proprietaire_nom?`<p>Le bien désigné ci-avant appartient à <b>${esc(c.proprietaire_nom)}</b>.</p>`:''}

        <h2>2. Conditions ${l.type==='acquisition'?'de l’acquisition':'de la location'}</h2>
        <h3>2.1. Conditions financières</h3>
        ${conditionsFinancieres}

        <h3>2.2. Conditions suspensives</h3>
        ${clausesBlock}

        ${particulieres.length ? `<h3>2.3. Conditions particulières</h3><ul class="loi-list">${particulieres.map(p=>`<li>${esc(p)}</li>`).join('')}</ul>` : ''}

        <h3>2.4. ${l.type==='acquisition'?'Transfert de propriété et réalisation de la vente':'Entrée en jouissance'}</h3>
        ${entreeHtml}

        <h3>2.5. Faculté de substitution</h3>
        <p>La signature ${l.type==='acquisition'?'du compromis ou de l’acte authentique':'du bail'} pourra avoir lieu au profit de ${esc(cliNom)}, ou de toute personne physique ou morale qu’il entendrait s’y substituer, ce dernier restant solidairement tenu de toutes les obligations contractées.</p>

        <h2>3. Conditions de l’offre</h2>
        <p>La présente proposition est faite pour une durée de ${dureeValidite} jours à compter du ${fmtDate(l.date_offre)}. L’acceptation du ou des ${voc.contrepartie.toLowerCase()}s devra être portée sur le présent acte avant cette date ; passé ce délai et à défaut d’acceptation, l’offre sera caduque.</p>

        <h2>4. Pouvoirs et rémunération du mandataire</h2>
        <h3>4.1. Pouvoirs du mandataire</h3>
        ${pouvoirs}
        <h3>4.2. Rémunération du mandataire</h3>
        ${remuneration}

        <h2>5. RGPD</h2>
        <p style="font-size:10px;color:#55626b">${esc(ag.raison_sociale)} met en œuvre des traitements de données à caractère personnel pour assurer la gestion de sa relation contractuelle, le suivi de la transaction et la facturation, ainsi que le respect de ses obligations légales (lutte contre le blanchiment d’argent et le financement du terrorisme). Conformément à la loi n°78-17 du 6 janvier 1978 modifiée et au règlement (UE) 2016/679, ${esc(cliNom)||'l’offrant'} dispose d’un droit d’accès, de rectification, d’effacement, de limitation et de portabilité de ses données, ainsi que du droit de s’opposer au traitement, en s’adressant au responsable du traitement (${esc(ag.raison_sociale)}, ${esc(ag.adresse)}). Il dispose également de la faculté de réclamation auprès de la CNIL.</p>

        <div class="sign">
          <div class="col">
            <div class="fait">Fait à ${esc(l.lieu_signature||ag.ville)}, le ${l.date_signature?fmtDate(l.date_signature):'____________'}</div>
            <div class="mention">Signature précédée de la mention manuscrite :<br>« ${esc(mentionSignature('client'))} »</div>
            <div class="box"></div>
            <div class="who">LE ${voc.clientMaj}</div>
          </div>
          <div class="col">
            <div class="fait">En deux exemplaires</div>
            <div class="mention">Signature précédée de la mention manuscrite :<br>« ${esc(mentionSignature('contrepartie'))} »</div>
            <div class="box"></div>
            <div class="who">LE ${voc.contrepartieMaj}</div>
          </div>
        </div>

        <div class="foot-legal">${idLine}</div>
      </div></body></html>`;
  }

  async function generer(id, mode){
    let l;
    if(mode==='live'){
      const cid = document.getElementById('loi-client')?.value;
      let cliFull = {};
      if(cid){ try{ const {data}=await sb.from('clients').select('*').eq('id',cid).single(); if(data) cliFull=data; }catch(e){} }
      const g = gid => { const el=document.getElementById(gid); return el ? el.value.trim() : ''; };
      const gn = gid => { const el=document.getElementById(gid); if(!el || el.value==='') return null; const n=Number(el.value); return isNaN(n)?null:n; };
      const c = {
        identite_complement:g('loi-identite'), bien_nature:g('loi-bien-nature'), bien_adresse:g('loi-bien-adresse'),
        bien_superficie:g('loi-bien-superficie'), bien_destination:g('loi-bien-destination'), proprietaire_nom:g('loi-proprietaire'),
        occupation:g('loi-occupation'), occ_nom:g('loi-occ-nom'), occ_activite:g('loi-occ-activite'),
        occ_bail_date:g('loi-occ-date'), occ_loyer:gn('loi-occ-loyer'), occ_charges:gn('loi-occ-charges'),
        financement_type:g('loi-fin-type'), fin_montant_min:gn('loi-fin-min'), fin_montant_max:gn('loi-fin-max'),
        fin_taux_min:gn('loi-fin-taux-min'), fin_taux_max:gn('loi-fin-taux-max'), fin_apport:gn('loi-fin-apport'),
        conditions_particulieres:g('loi-particulieres'), date_limite_pret:g('loi-date-pret'),
        mandat_num:g('loi-mandat-num'), mandat_date:g('loi-mandat-date'),
        mandat_recherche_num:g('loi-mandat-rech-num'), mandat_recherche_date:g('loi-mandat-rech-date'),
        honoraires_texte:g('loi-hono-texte'), honoraires_charge:g('loi-hono-charge'),
        prix_offre:gn('loi-prix'), entree_jouissance_type:g('loi-entree-type'), loc_nom:g('loi-loc-nom'), loc_bail_date:g('loi-loc-date'),
        notaire_nom:g('loi-notaire-nom'), notaire_adresse:g('loi-notaire-adr'), delai_reiteration:g('loi-delai-reit'),
        date_limite_promesse:g('loi-date-promesse'), date_limite_acte:g('loi-date-acte'),
        bail_type:g('loi-bail-type'), bail_duree:g('loi-bail-duree'), loyer_annuel:gn('loi-loyer'), paiement:g('loi-paiement'),
        depot_garantie:g('loi-depot'), provision_charges:gn('loi-provision'), provision_charges_detail:g('loi-provision-detail'),
        taxe_fonciere:gn('loi-tf'), indexation:g('loi-indexation'), franchise_loyer:g('loi-franchise'), regime_fiscal:g('loi-regime'),
        date_entree:g('loi-date-entree'), delai_signature_bail:g('loi-delai-bail')
      };
      l = { type:ED.type, reference:(id? (LISTE.find(x=>x.id===id)||{}).reference : null),
        clients:cliFull, date_offre:g('loi-date-offre'), duree_validite_jours:gn('loi-duree'),
        lieu_signature:g('loi-lieu-signature'), date_signature:g('loi-date-signature'), contenu:c };
    } else {
      if(!id){ alert('Aucune proposition sélectionnée.'); return; }
      try{ l = await charger(id); }catch(e){ alert('Chargement impossible : '+(e.message||e)); return; }
    }
    const html = construireDocLoi(l, false);
    const w = window.open('', '_blank');
    if(!w){ alert('Fenêtre bloquée. Autorisez les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  async function publierLien(id){
    if(!id){ alert('Enregistrez d’abord le document.'); return; }
    let l; try{ l = await charger(id); }catch(e){ alert('Chargement impossible.'); return; }
    const html = construireDocLoi(l, true);
    try{
      const blob = new Blob([html], { type:'text/html; charset=utf-8' });
      const up = await sb.storage.from('offres').upload('lois-public/'+id+'.html', blob, { contentType:'text/html; charset=utf-8', upsert:true, cacheControl:'60' });
      if(up.error) throw up.error;
    }catch(e){ alert('Publication impossible : '+(e.message||e)); return; }
    afficherLien('https://gtec-immobilier.fr/l/?id=' + encodeURIComponent(id), id);
  }
  async function revoquerLien(id){
    if(!id) return;
    if(!confirm('Révoquer le lien de ce document ? Le client ne pourra plus l’ouvrir.')) return;
    try{ const { error } = await sb.storage.from('offres').remove(['lois-public/'+id+'.html']); if(error) throw error;
      const bg=document.getElementById('loi-lien-bg'); if(bg) bg.remove(); alert('Lien révoqué.');
    }catch(e){ alert('Révocation impossible : '+(e.message||e)); }
  }
  function afficherLien(url, id){
    try{ if(navigator.clipboard) navigator.clipboard.writeText(url); }catch(e){}
    const old=document.getElementById('loi-lien-bg'); if(old) old.remove();
    const bg=document.createElement('div'); bg.id='loi-lien-bg';
    bg.style.cssText='position:fixed;inset:0;background:rgba(26,39,56,.5);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,Arial,sans-serif';
    bg.innerHTML=`<div style="background:#fff;border-radius:14px;width:min(560px,92%);box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden">
      <div style="background:#1A2738;color:#fff;padding:14px 20px;font-weight:700">🔗 Lien du document à envoyer au client</div>
      <div style="padding:18px 20px"><p style="margin:0 0 10px;color:#4A5A5E;font-size:14px">Lien copié. Le client le verra en pleine page (et pourra l’enregistrer en PDF).</p>
        <input readonly value="${esc(url)}" onclick="this.select()" style="width:100%;padding:10px;border:1px solid #c9d0d3;border-radius:8px;font-size:13px;box-sizing:border-box"></div>
      <div style="padding:0 20px 18px;display:flex;gap:10px;align-items:center">
        <button onclick="GTEC_LOI.revoquerLien('${esc(id||'')}')" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#fbe9e9;color:#b3261e">🗑️ Révoquer</button>
        <span style="flex:1"></span>
        <a href="${esc(url)}" target="_blank" rel="noopener" style="border-radius:9px;padding:10px 16px;font-weight:600;background:#243A54;color:#fff;text-decoration:none">↗ Ouvrir</a>
        <button onclick="document.getElementById('loi-lien-bg').remove()" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#e3e8ea;color:#333">Fermer</button>
      </div></div>`;
    bg.addEventListener('click', e=>{ if(e.target===bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  /* ------------------------------------------------------------------ *
   *  API publique
   * ------------------------------------------------------------------ */
  window.vueLoi = vueLoi;
  window.GTEC_LOI = {
    nouveau:(type)=>{ ED.type=(type==='acquisition'?'acquisition':'location'); editer(null); },
    editer, generer, publierLien, revoquerLien, supprimer,
    _type:(v)=>{ FILTRE_TYPE=v; vueLoi(); },
    _statut:(v)=>{ FILTRE_STATUT=v; rafraichirTbody(); },
    _search:(v)=>{ RECHERCHE=v; rafraichirTbody(); },
    _pickOffre:pickOffre, _pickMandat:pickMandat,
    _save:sauvegarder, _fermer:fermer
  };
})();
