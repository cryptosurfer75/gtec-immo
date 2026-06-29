/* ==========================================================================
   GTEC IMMOBILIER — Module « Devis / Factures »
   Expose window.GTEC_FACTURE. Réutilise les helpers globaux de index.html
   (sb, esc, euro, nomClient, panel, vide, erreur, optClients, optOffres,
   chargerClients, chargerOffresListe, ME_AGENT).
   Patron calqué sur avis-valeur.js (génération PDF, lien client, modale).
   ========================================================================== */
(function(){
  'use strict';

  /* ------------------------------------------------------------------ *
   *  IDENTITÉ DE L'AGENCE — ⚠️ À COMPLÉTER avec les vraies valeurs.
   *  Ces mentions sont OBLIGATOIRES sur les factures/devis (loi Hoguet
   *  + Code de commerce). Tant qu'elles ne sont pas remplies, le document
   *  affiche « [à compléter] ».
   * ------------------------------------------------------------------ */
  const AGENCE = {
    raison_sociale:   'GTEC Immobilier',
    forme_juridique:  'SAS',         // ex. SAS, SARL…
    capital:          '1 000 €',     // ex. 10 000 €
    adresse:          '',            // siège complet
    ville:            'Amiens',      // ville de signature (« Fait à … »)
    siret:            '10061953500014',   // SIREN 100 619 535
    rcs:              'Amiens 100 619 535',
    tva_intra:        'FR49100619535',
    carte_pro:        'CPI 80012026000000003',   // n° CPI (transaction) — loi Hoguet
    garantie_fin:     '',            // organisme + montant (ou « Pas de maniement de fonds »)
    rcp:              '',            // assureur RC professionnelle
    mediateur:        '',            // médiateur de la consommation (nom + site)
    banque:           '',            // nom de la banque (coordonnées bancaires)
    iban:             '',
    bic:              '',
    email:            '',            // email comptabilité (relances)
    telephone:        '',
    site:             'gtec-immobilier.fr',   // site web (en-tête du document)
    taux_penalites:   '3 fois le taux d’intérêt légal',  // pénalités de retard
    echeance_jours:   30,            // délai de paiement par défaut
    validite_jours:   30             // durée de validité d'un devis
  };

  /* ------------------------------------------------------------------ *
   *  État & constantes
   * ------------------------------------------------------------------ */
  let LISTE = [];                    // toutes les factures+devis chargés
  let FILTRE_TYPE = 'tous';          // tous | devis | facture
  let FILTRE_STATUT = '';            // '' = tous
  let RECHERCHE = '';
  let MANDATS = [];                  // cache pour le sélecteur
  let ED = { id:null, type:'devis', gel:false };   // éditeur courant

  const TAUX_TVA = [['20','20 %'],['10','10 %'],['5.5','5,5 %'],['0','0 % / exonéré']];
  const MOYENS = [['virement','Virement'],['cheque','Chèque'],['cb','Carte bancaire'],['especes','Espèces'],['autre','Autre']];

  const STATUT_LABEL = {
    brouillon:'Brouillon', envoye:'Envoyé', accepte:'Accepté', refuse:'Refusé', expire:'Expiré',
    emise:'Émise', partiellement_payee:'Part. payée', payee:'Payée', annulee:'Annulée', en_retard:'En retard'
  };
  // classe de badge : .tag (gris), .tag.green, .tag.blue + couleurs custom inline
  function statutBadge(f){
    const st = statutEffectif(f);
    const map = {
      brouillon:['#eceff1','#546e7a'], envoye:['rgba(30,80,140,.14)','#1e508c'],
      accepte:['rgba(46,125,50,.15)','#2e7d32'], refuse:['#fbe9e9','#b3261e'], expire:['#f3e5d8','#9a6a2c'],
      emise:['rgba(30,80,140,.14)','#1e508c'], partiellement_payee:['#f3e5d8','#9a6a2c'],
      payee:['rgba(46,125,50,.15)','#2e7d32'], annulee:['#eceff1','#90a4ae'], en_retard:['#fbe9e9','#b3261e']
    };
    const [bg,c] = map[st]||['#eceff1','#546e7a'];
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:700;background:${bg};color:${c}">${STATUT_LABEL[st]||st}</span>`;
  }

  /* ------------------------------------------------------------------ *
   *  Petits utilitaires
   * ------------------------------------------------------------------ */
  const today = () => new Date().toISOString().slice(0,10);
  const euro2 = n => (n==null||isNaN(n)) ? '—' : new Intl.NumberFormat('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' €';
  const r2 = n => Math.round((Number(n)+Number.EPSILON)*100)/100;
  const fmtDate = d => { if(!d) return '—'; const [y,m,j]=String(d).slice(0,10).split('-'); return `${j}/${m}/${y}`; };
  const num = v => { const x=parseFloat(String(v==null?'':v).replace(',','.')); return isNaN(x)?0:x; };

  // Statut « réel » affiché (dérive en_retard / expire sans le stocker)
  function statutEffectif(f){
    const t = today();
    if(f.type==='devis'){
      if((f.statut==='envoye'||f.statut==='brouillon') && f.validite_date && f.validite_date < t) return 'expire';
      return f.statut;
    }
    if((f.statut==='emise'||f.statut==='partiellement_payee') && f.date_echeance && f.date_echeance < t && Number(f.montant_paye||0) < Number(f.total_ttc||0))
      return 'en_retard';
    return f.statut;
  }
  const resteDu = f => r2(Number(f.total_ttc||0) - Number(f.montant_paye||0));
  const enRetard = f => (f.type==='facture' && ['emise','partiellement_payee'].includes(f.statut)
                         && f.date_echeance && f.date_echeance < today() && resteDu(f) > 0);

  // Calcule les totaux à partir d'un tableau de lignes [{quantite,prix_unitaire_ht,taux_tva}]
  // TVA regroupée PAR TAUX sur le HT cumulé (évite le cumul d'arrondis ligne à ligne).
  function calculTotaux(lignes){
    const parTaux = {};
    let ht = 0;
    const out = lignes.map(l=>{
      const mht = r2(num(l.quantite) * num(l.prix_unitaire_ht));
      const taux = String(l.taux_tva==null?'20':l.taux_tva);
      ht += mht; parTaux[taux] = (parTaux[taux]||0) + mht;
      return {...l, montant_ht:mht};
    });
    let tva = 0; const detailTva = [];
    Object.keys(parTaux).sort((a,b)=>b-a).forEach(taux=>{
      const t = r2(parTaux[taux] * num(taux)/100);
      tva += t; if(num(taux)>0) detailTva.push({taux, base:r2(parTaux[taux]), montant:t});
    });
    ht = r2(ht); tva = r2(tva);
    return { lignes:out, total_ht:ht, total_tva:tva, total_ttc:r2(ht+tva), detailTva };
  }

  /* ------------------------------------------------------------------ *
   *  Chargement des listes annexes (mandats pour le sélecteur)
   * ------------------------------------------------------------------ */
  async function chargerMandats(){
    const { data } = await sb.from('mandats').select('id,numero,offre_id,client_id').order('created_at',{ascending:false});
    MANDATS = data||[];
  }
  function optMandats(sel){
    return [['','— Aucun mandat —'], ...MANDATS.map(m=>[m.id, m.numero||('Mandat '+String(m.id).slice(0,8))])]
      .map(([v,t])=>`<option value="${v}" ${String(sel)===String(v)?'selected':''}>${esc(t)}</option>`).join('');
  }

  async function charger(id){
    const { data, error } = await sb.from('factures').select('*, clients(*)').eq('id', id).single();
    if(error) throw error;
    return data;
  }

  /* ==================================================================
     VUE LISTE + TABLEAU DE BORD
     ================================================================== */
  async function vueFactures(){
    charge();
    const [{ data, error }] = await Promise.all([
      sb.from('factures').select('*, clients(id,type_client,nom,prenom,raison_sociale,email)').order('created_at',{ascending:false}),
      chargerClients(), chargerOffresListe(), chargerMandats()
    ]);
    if(error) return erreur(error);
    LISTE = data||[];

    // --- Indicateurs (façon logiciel de compta) ---
    const factures = LISTE.filter(f=>f.type==='facture');
    const encaisse = factures.reduce((s,f)=>s+Number(f.montant_paye||0),0);
    const ouvertes = factures.filter(f=>['emise','partiellement_payee'].includes(f.statut));
    const encours  = ouvertes.reduce((s,f)=>s+resteDu(f),0);
    const retard   = factures.filter(enRetard);
    const retardM  = retard.reduce((s,f)=>s+resteDu(f),0);
    const devisAtt = LISTE.filter(f=>f.type==='devis' && ['brouillon','envoye'].includes(f.statut)).length;

    const stats = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;padding:16px 16px 4px">
      ${carte('Encaissé', euro2(encaisse), 'factures payées (cumul)')}
      ${carte('Encours', euro2(encours), ouvertes.length+' facture(s) ouverte(s)')}
      ${carte('En retard', euro2(retardM), retard.length+' impayé(s)', retard.length?'#b3261e':null)}
      ${carte('Devis en attente', devisAtt, 'à transformer')}
    </div>`;

    // --- Filtres + recherche ---
    const filtres = `<div style="padding:12px 16px;border-bottom:1px solid var(--gris-clair);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="display:flex;gap:6px">
        ${segBtn('tous','Tous')} ${segBtn('devis','Devis')} ${segBtn('facture','Factures')}
      </div>
      <select onchange="GTEC_FACTURE._statut(this.value)" style="padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
        <option value="">Tous les statuts</option>
        ${Object.entries(STATUT_LABEL).map(([k,v])=>`<option value="${k}" ${FILTRE_STATUT===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <input id="fa-search" type="search" autocomplete="off" placeholder="🔎 Réf., client, objet…" value="${esc(RECHERCHE)}"
        oninput="GTEC_FACTURE._search(this.value)"
        style="flex:1;min-width:200px;max-width:380px;padding:9px 12px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
    </div>`;

    const rows = filtrer();
    const corps = stats + filtres + (rows.length
      ? `<div class="tscroll"><table><thead><tr>
           <th>Réf.</th><th>Type</th><th>Client</th><th>Objet</th><th>Émise le</th><th>Échéance</th>
           <th style="text-align:right">Total TTC</th><th style="text-align:right">Reste dû</th><th>Statut</th><th>Actions</th>
         </tr></thead><tbody id="fa-tbody">${rows.map(ligne).join('')}</tbody></table></div>`
      : vide('Aucun document. Créez votre premier devis ou votre première facture.'));

    C().innerHTML = panel('Devis / Factures', `${LISTE.length} document(s)`, corps,
      `<button class="btn btn-sm" onclick="GTEC_FACTURE.nouveau('devis')">+ Nouveau devis</button>
       <button class="btn btn-sm" onclick="GTEC_FACTURE.nouveau('facture')">+ Nouvelle facture</button>`);
  }

  function carte(libelle, valeur, sous, couleur){
    return `<div class="stat" style="${couleur?'border-left:4px solid '+couleur:''}">
      <div class="n" style="${couleur?'color:'+couleur:''}">${esc(String(valeur))}</div>
      <div class="l">${esc(libelle)}</div>
      <div style="font-size:.72rem;color:var(--gris-fonce);margin-top:2px">${esc(sous||'')}</div></div>`;
  }
  function segBtn(v,txt){
    const on = FILTRE_TYPE===v;
    return `<button onclick="GTEC_FACTURE._type('${v}')" class="btn btn-sm ${on?'':'btn-ghost'}" style="padding:8px 14px">${txt}</button>`;
  }

  function filtrer(){
    let r = LISTE;
    if(FILTRE_TYPE!=='tous') r = r.filter(f=>f.type===FILTRE_TYPE);
    if(FILTRE_STATUT) r = r.filter(f=>statutEffectif(f)===FILTRE_STATUT || f.statut===FILTRE_STATUT);
    const q = (RECHERCHE||'').toLowerCase().trim();
    if(q) r = r.filter(f=>[(f.reference||''), nomClient(f.clients), (f.objet||'')].join(' ').toLowerCase().includes(q));
    return r;
  }
  function rafraichirTbody(){
    const tb = document.getElementById('fa-tbody'); if(!tb) return;
    const rows = filtrer();
    tb.innerHTML = rows.length ? rows.map(ligne).join('')
      : `<tr><td colspan="10" style="text-align:center;color:var(--gris-fonce);padding:24px">Aucun document ne correspond.</td></tr>`;
  }

  function ligne(f){
    const sansMail = f.type==='facture' && (!f.clients || !f.clients.email);
    const ref = f.reference || `<span style="color:#90a4ae;font-style:italic">brouillon</span>`;
    const rd  = f.type==='facture' ? euro2(resteDu(f)) : '—';
    return `<tr style="cursor:pointer" onclick="GTEC_FACTURE.editer('${f.id}')">
      <td><b>${ref}</b></td>
      <td>${f.type==='devis'?'📝 Devis':f.type==='avoir'?'↩︎ Avoir':'🧾 Facture'}</td>
      <td>${esc(nomClient(f.clients))}${sansMail?' <span title="Client sans e-mail : relance impossible" style="color:#b3261e">⚠</span>':''}</td>
      <td>${esc(f.objet||'—')}</td>
      <td>${f.reference?fmtDate(f.date_emission):'—'}</td>
      <td>${f.type==='facture'?fmtDate(f.date_echeance):(f.validite_date?('val. '+fmtDate(f.validite_date)):'—')}</td>
      <td style="text-align:right">${euro2(f.total_ttc)}</td>
      <td style="text-align:right;${resteDu(f)>0&&f.type==='facture'?'font-weight:700':''}">${rd}</td>
      <td>${statutBadge(f)}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" title="Aperçu / imprimer" onclick="GTEC_FACTURE.generer('${f.id}')">📄</button>
        <button class="btn btn-ghost btn-sm" title="Lien client" onclick="GTEC_FACTURE.publierLien('${f.id}')">🔗</button>
        ${f.type==='facture' && f.reference && !['payee','annulee'].includes(f.statut)
          ? `<button class="btn btn-ghost btn-sm" title="Saisir un encaissement" onclick="GTEC_FACTURE.encaisser('${f.id}')">💶</button>` : ''}
        ${f.type==='facture' && enRetard(f)
          ? `<button class="btn btn-ghost btn-sm" title="Relancer le client" onclick="GTEC_FACTURE.relancer('${f.id}')">✉️</button>` : ''}
        ${f.type==='devis' && ['envoye','accepte','brouillon'].includes(f.statut)
          ? `<button class="btn btn-ghost btn-sm" title="Transformer en facture" onclick="GTEC_FACTURE.convertir('${f.id}')">➡️</button>` : ''}
      </td></tr>`;
  }

  /* ==================================================================
     ÉDITEUR (modale plein écran avec lignes dynamiques)
     ================================================================== */
  function injecterCss(){
    if(document.getElementById('fa-css')) return;
    const s = document.createElement('style'); s.id='fa-css';
    s.textContent = `
      #fa-ed-bg{position:fixed;inset:0;background:rgba(26,39,56,.55);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px;font-family:'Inter','Segoe UI',Arial,sans-serif}
      #fa-ed{background:#fff;border-radius:14px;width:min(960px,100%);box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden}
      #fa-ed .h{background:#1A2738;color:#fff;padding:15px 22px;display:flex;justify-content:space-between;align-items:center}
      #fa-ed .h h3{margin:0;font-size:1.05rem} #fa-ed .h .x{background:none;border:0;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1}
      #fa-ed .b{padding:20px 22px;max-height:calc(100vh - 200px);overflow:auto}
      #fa-ed .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
      #fa-ed .f{display:flex;flex-direction:column;gap:5px} #fa-ed .f.full{grid-column:1/-1}
      #fa-ed label{font-size:.82rem;font-weight:600;color:var(--gris-fonce,#4A5A5E)}
      #fa-ed input,#fa-ed select,#fa-ed textarea{padding:9px 11px;border:1.5px solid #C9D0D3;border-radius:8px;font:inherit;width:100%;box-sizing:border-box}
      #fa-ed input[readonly],#fa-ed select[disabled],#fa-ed textarea[readonly]{background:#f4f6f7;color:#607d8b}
      #fa-ed .cli-row{display:flex;gap:6px;align-items:center} #fa-ed .cli-row input,#fa-ed .cli-row select{flex:1;width:auto} #fa-ed .cli-row .btn{white-space:nowrap;width:auto}
      #fa-lignes{width:100%;border-collapse:collapse;margin-top:6px}
      #fa-lignes th{font-size:.72rem;text-transform:uppercase;color:var(--gris-fonce,#4A5A5E);text-align:left;padding:6px 8px;border-bottom:2px solid #eceff1}
      #fa-lignes td{padding:5px 6px;border-bottom:1px solid #f4f6f7;vertical-align:middle}
      #fa-lignes input,#fa-lignes select{padding:7px 8px}
      #fa-lignes .del{background:#fbe9e9;color:#b3261e;border:0;border-radius:7px;padding:7px 10px;cursor:pointer;font-weight:700}
      .fa-sep{font-weight:700;color:#1A2738;margin:18px 0 8px;padding-bottom:5px;border-bottom:1px solid #eceff1}
      .fa-totaux{margin-top:14px;display:flex;justify-content:flex-end}
      .fa-totaux table{min-width:280px} .fa-totaux td{padding:4px 10px} .fa-totaux .ttc td{font-weight:800;font-size:1.05rem;color:#1A2738;border-top:2px solid #1A2738}
      #fa-ed .foot{padding:14px 22px;background:#f4f6f7;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .fa-msg{font-size:.85rem;color:var(--gris-fonce,#4A5A5E)} .fa-msg.err{color:#b3261e}`;
    document.head.appendChild(s);
  }

  function ligneRow(l){
    l = l||{};
    return `<tr class="fa-l">
      <td><input class="l-des" placeholder="Désignation de la prestation" value="${esc(l.designation||'')}"></td>
      <td style="width:80px"><input class="l-qte" type="number" step="0.01" value="${l.quantite!=null?l.quantite:1}"></td>
      <td style="width:130px"><input class="l-pu" type="number" step="0.01" value="${l.prix_unitaire_ht!=null?l.prix_unitaire_ht:''}" placeholder="0,00"></td>
      <td style="width:120px"><select class="l-tva">${TAUX_TVA.map(([v,t])=>`<option value="${v}" ${String(l.taux_tva==null?'20':l.taux_tva)===v?'selected':''}>${t}</option>`).join('')}</select></td>
      <td style="width:120px;text-align:right" class="l-tot">—</td>
      <td style="width:44px"><button type="button" class="del" title="Retirer">✕</button></td>
    </tr>`;
  }

  async function editer(id){
    injecterCss();
    let f;
    if(id){ try{ f = await charger(id); }catch(e){ alert('Chargement impossible : '+(e.message||e)); return; } }
    else f = { type:ED.type, statut:'brouillon', date_emission:today(), lignes:[{}],
               date_echeance: ED.type==='facture'? plusJours(AGENCE.echeance_jours):null,
               validite_date: ED.type==='devis'? plusJours(AGENCE.validite_jours):null };
    ED = { id:id||null, type:f.type, gel:(f.type==='facture' && f.reference && f.statut!=='brouillon') };
    const lignes = (f.lignes && f.lignes.length) ? f.lignes : [{}];
    const ro = ED.gel ? 'readonly' : '';
    const dis = ED.gel ? 'disabled' : '';
    const OBJETS = ['Honoraires de location','Honoraires de vente'];
    const objetOpts = [['','— Choisir —'], ...OBJETS.map(o=>[o,o])]
      .concat(f.objet && !OBJETS.includes(f.objet) ? [[f.objet,f.objet]] : [])
      .map(([v,t])=>`<option value="${esc(v)}" ${f.objet===v?'selected':''}>${esc(t)}</option>`).join('');

    const titre = (id? (f.reference||'Brouillon') : (f.type==='devis'?'Nouveau devis':'Nouvelle facture'));
    document.getElementById('modal-root').innerHTML = `<div id="fa-ed-bg" onclick="if(event.target===this)GTEC_FACTURE._fermer()">
      <div id="fa-ed">
        <div class="h"><h3>${f.type==='devis'?'📝':'🧾'} ${esc(titre)}${ED.gel?' · <span style="opacity:.7;font-weight:400">document émis (lecture seule)</span>':''}</h3>
          <button class="x" onclick="GTEC_FACTURE._fermer()">×</button></div>
        <div class="b">
          <div class="grid">
            <div class="f"><label>Client</label><div class="cli-row"><select id="fa-client" ${dis}>${optClients(f.client_id)}</select>${ED.gel?'':`<button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_FACTURE._addClient()">+ Client</button>`}</div></div>
            <div class="f"><label>Objet</label><select id="fa-objet" ${dis}>${objetOpts}</select></div>
            <div class="f"><label>Bien lié (optionnel)</label><select id="fa-offre" ${dis}>${optOffres(f.offre_id)}</select></div>
            <div class="f"><label>Mandat lié (optionnel)</label><select id="fa-mandat" ${dis}>${optMandats(f.mandat_id)}</select></div>
            <div class="f"><label>Date d'émission</label><input id="fa-date" type="date" value="${f.date_emission||today()}" ${ro}></div>
            ${f.type==='facture'
              ? `<div class="f"><label>Échéance</label><input id="fa-echeance" type="date" value="${f.date_echeance||''}" ${ro}></div>`
              : `<div class="f"><label>Validité du devis</label><input id="fa-validite" type="date" value="${f.validite_date||''}" ${ro}></div>`}
          </div>

          <div class="fa-sep">Lignes</div>
          <table id="fa-lignes"><thead><tr><th>Désignation</th><th>Qté</th><th>PU HT</th><th>TVA</th><th style="text-align:right">Total HT</th><th></th></tr></thead>
            <tbody>${lignes.map(ligneRow).join('')}</tbody></table>
          ${ED.gel?'':`<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_FACTURE._addLigne('hono')">+ Honoraires de transaction</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_FACTURE._addLigne()">+ Prestation</button>
          </div>`}

          <div class="fa-totaux"><table id="fa-recap"></table></div>

          <div class="fa-sep">Conditions / notes</div>
          <div class="f full"><textarea id="fa-conditions" rows="2" placeholder="Conditions de règlement, mentions particulières…" ${ro}>${esc(f.conditions||'')}</textarea></div>
        </div>
        <div class="foot">
          <span class="fa-msg" id="fa-msg"></span>
          <span style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_FACTURE._fermer()">Fermer</button>
            ${ED.gel?'' : `<button type="button" class="btn btn-sm" onclick="GTEC_FACTURE._save(false)">💾 Enregistrer le brouillon</button>`}
            ${ED.gel?'' : `<button type="button" class="btn btn-sm" style="background:var(--teal-dark,#2E6357)" onclick="GTEC_FACTURE._save(true)">
                ${f.type==='devis'?'✓ Marquer envoyé':'✓ Émettre la facture'}</button>`}
            <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_FACTURE.generer('${id||''}','live')">📄 Aperçu</button>
            ${(id && f.type==='devis') ? `<button type="button" class="btn btn-sm" style="background:#1A2738" onclick="GTEC_FACTURE.convertir('${id}')">➡️ Transformer en facture</button>` : ''}
          </span>
        </div>
      </div></div>`;

    const tb = document.querySelector('#fa-lignes tbody');
    tb.addEventListener('input', recalc);
    tb.addEventListener('click', e=>{ if(e.target.classList.contains('del')){ e.target.closest('tr').remove(); recalc(); } });
    recalc();
  }
  const plusJours = n => { const d=new Date(); d.setDate(d.getDate()+(n||0)); return d.toISOString().slice(0,10); };

  function lireLignes(){
    return [...document.querySelectorAll('#fa-lignes tbody tr')].map(tr=>({
      designation: tr.querySelector('.l-des').value.trim(),
      quantite: num(tr.querySelector('.l-qte').value),
      prix_unitaire_ht: num(tr.querySelector('.l-pu').value),
      taux_tva: tr.querySelector('.l-tva').value
    }));
  }
  function recalc(){
    const t = calculTotaux(lireLignes());
    // total par ligne
    [...document.querySelectorAll('#fa-lignes tbody tr')].forEach((tr,i)=>{
      tr.querySelector('.l-tot').textContent = euro2(t.lignes[i].montant_ht);
    });
    const recap = document.getElementById('fa-recap'); if(!recap) return;
    recap.innerHTML = `
      <tr><td>Total HT</td><td style="text-align:right">${euro2(t.total_ht)}</td></tr>
      ${t.detailTva.map(d=>`<tr><td>TVA ${String(d.taux).replace('.',',')} %</td><td style="text-align:right">${euro2(d.montant)}</td></tr>`).join('')||'<tr><td>TVA</td><td style="text-align:right">0,00 €</td></tr>'}
      <tr class="ttc"><td>Total TTC</td><td style="text-align:right">${euro2(t.total_ttc)}</td></tr>`;
  }
  function addLigne(kind){
    const tb = document.querySelector('#fa-lignes tbody'); if(!tb) return;
    const l = {};
    if(kind==='hono'){ l.designation = 'Honoraires de transaction'; l.quantite=1; l.taux_tva='20'; }
    tb.insertAdjacentHTML('beforeend', ligneRow(l)); recalc();
  }

  async function sauvegarder(emettre){
    const msg = document.getElementById('fa-msg'); msg.className='fa-msg'; msg.textContent='Enregistrement…';
    try{
      const lignesRaw = lireLignes().filter(l=>l.designation || l.prix_unitaire_ht);
      if(!lignesRaw.length) throw new Error('Ajoutez au moins une ligne.');
      const clientId = document.getElementById('fa-client').value || null;
      if(!clientId) throw new Error('Choisis un client dans la liste, ou clique sur « + Client » pour l’ajouter.');
      const t = calculTotaux(lignesRaw);
      const payload = {
        type: ED.type,
        client_id: clientId,
        offre_id: document.getElementById('fa-offre').value || null,
        mandat_id: document.getElementById('fa-mandat').value || null,
        objet: document.getElementById('fa-objet').value.trim() || null,
        date_emission: document.getElementById('fa-date').value || today(),
        conditions: document.getElementById('fa-conditions').value.trim() || null,
        lignes: t.lignes,
        total_ht: t.total_ht, total_tva: t.total_tva, total_ttc: t.total_ttc,
        agent: window.ME_AGENT || null
      };
      if(ED.type==='facture') payload.date_echeance = document.getElementById('fa-echeance').value || null;
      else payload.validite_date = document.getElementById('fa-validite').value || null;

      // Statut : « émettre » fait passer hors brouillon → le trigger DB attribue le numéro
      if(emettre) payload.statut = ED.type==='devis' ? 'envoye' : 'emise';
      else if(!ED.id) payload.statut = 'brouillon';

      let id = ED.id;
      if(id){ const { error } = await sb.from('factures').update(payload).eq('id', id); if(error) throw error; }
      else { const { data, error } = await sb.from('factures').insert(payload).select('id').single(); if(error) throw error; id = data.id; }
      fermer();
      vueFactures();
    }catch(e){ msg.className='fa-msg err'; msg.textContent='Erreur : '+(e.message||e); }
  }
  function fermer(){ const bg=document.getElementById('fa-ed-bg'); if(bg) bg.remove(); }

  /* ==================================================================
     ENCAISSEMENTS
     ================================================================== */
  async function encaisser(id){
    let f; try{ f = await charger(id); }catch(e){ alert('Chargement impossible.'); return; }
    const reste = resteDu(f);
    document.getElementById('modal-root2').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)GTEC_FACTURE._fermerEnc()"><div class="modal" style="max-width:480px">
      <div class="modal-h"><h3>💶 Encaissement — ${esc(f.reference||'')}</h3><button class="x" onclick="GTEC_FACTURE._fermerEnc()">×</button></div>
      <div class="modal-f">
        <p style="margin:0 0 12px;color:var(--gris-fonce)">Total TTC : <b>${euro2(f.total_ttc)}</b> · Déjà réglé : ${euro2(f.montant_paye)} · <b>Reste dû : ${euro2(reste)}</b></p>
        <div class="f"><label>Date</label><input id="enc-date" type="date" value="${today()}"></div>
        <div class="f"><label>Montant (€)</label><input id="enc-montant" type="number" step="0.01" value="${reste>0?reste:''}"></div>
        <div class="f"><label>Moyen</label><select id="enc-moyen">${MOYENS.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></div>
        <div class="f"><label>Référence (n° chèque, virement…)</label><input id="enc-ref"></div>
      </div>
      <div class="modal-foot"><span class="form-msg" id="enc-msg"></span>
        <span><button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_FACTURE._fermerEnc()">Annuler</button>
        <button type="button" class="btn btn-sm" onclick="GTEC_FACTURE._saveEnc('${id}')">Enregistrer</button></span></div>
    </div></div>`;
  }
  async function saveEnc(id){
    const msg=document.getElementById('enc-msg'); msg.className='form-msg'; msg.textContent='Enregistrement…';
    const montant = num(document.getElementById('enc-montant').value);
    if(montant<=0){ msg.className='form-msg err'; msg.textContent='Montant invalide.'; return; }
    const { error } = await sb.from('encaissements').insert({
      facture_id:id, date_encaissement:document.getElementById('enc-date').value||today(),
      montant, moyen:document.getElementById('enc-moyen').value, reference_paiement:document.getElementById('enc-ref').value.trim()||null
    });
    if(error){ msg.className='form-msg err'; msg.textContent='Erreur : '+error.message; return; }
    document.getElementById('modal-root2').innerHTML=''; vueFactures();
  }

  /* ==================================================================
     CONVERSION DEVIS → FACTURE
     ================================================================== */
  async function convertir(id){
    if(!confirm('Transformer ce devis en facture ? Une facture en brouillon sera créée (vous l’émettrez après relecture).')) return;
    let d; try{ d = await charger(id); }catch(e){ alert('Chargement impossible.'); return; }
    const payload = {
      type:'facture', statut:'brouillon', client_id:d.client_id, offre_id:d.offre_id, mandat_id:d.mandat_id,
      objet:d.objet, lignes:d.lignes, total_ht:d.total_ht, total_tva:d.total_tva, total_ttc:d.total_ttc,
      date_emission:today(), date_echeance:plusJours(AGENCE.echeance_jours), conditions:d.conditions,
      devis_parent_id:d.id, agent:window.ME_AGENT||null
    };
    const { data, error } = await sb.from('factures').insert(payload).select('id').single();
    if(error){ alert('Conversion impossible : '+error.message); return; }
    await sb.from('factures').update({statut:'accepte'}).eq('id', id);
    editer(data.id);   // ouvre la facture pour relecture
  }

  /* ==================================================================
     RELANCE (manuelle — mailto + journal). L'auto par e-mail se branche
     plus tard via la fonction serveur relance-impayes (Resend).
     ================================================================== */
  async function relancer(id){
    let f; try{ f = await charger(id); }catch(e){ alert('Chargement impossible.'); return; }
    const email = f.clients && f.clients.email;
    if(!email){ alert('Ce client n’a pas d’adresse e-mail enregistrée. Ajoutez-la sur sa fiche pour pouvoir le relancer.'); return; }
    const jours = Math.floor((new Date(today()) - new Date(f.date_echeance))/86400000);
    const niveau = jours>=15?3:jours>=8?2:1;
    const objets = {1:`Rappel — facture ${f.reference} en attente de règlement`,2:`Relance — facture ${f.reference} impayée`,3:`Mise en demeure — facture ${f.reference}`};
    const corps = texteRelance(f, niveau, jours);
    // journal
    await sb.from('relances').insert({facture_id:id, niveau, canal:'email', destinataire:email, statut:'preparee'});
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(objets[niveau])}&body=${encodeURIComponent(corps)}`;
  }
  function texteRelance(f, niveau, jours){
    const reste = euro2(resteDu(f));
    const intro = {
      1:`Sauf erreur de notre part, la facture ${f.reference} d’un montant de ${reste}, échue le ${fmtDate(f.date_echeance)}, demeure impayée à ce jour.`,
      2:`Malgré notre précédent rappel, la facture ${f.reference} (${reste}), échue depuis ${jours} jours, reste impayée.`,
      3:`En l’absence de règlement de la facture ${f.reference} (${reste}), échue depuis ${jours} jours, nous vous mettons en demeure de procéder à son paiement sous 8 jours, des pénalités de retard (${AGENCE.taux_penalites}) et une indemnité forfaitaire de 40 € étant exigibles.`
    };
    return `Bonjour,\n\n${intro[niveau]}\n\nNous vous remercions de bien vouloir régulariser ce règlement dans les meilleurs délais${AGENCE.iban?` (IBAN : ${AGENCE.iban})`:''}.\n\nBien cordialement,\n${AGENCE.raison_sociale}`;
  }

  /* ==================================================================
     GÉNÉRATION DU DOCUMENT (PDF imprimable) — patron avis-valeur.js
     ================================================================== */
  function construireDocFacture(f, shared){
    const c = f.clients||{};
    const estDevis = f.type==='devis', estAvoir = f.type==='avoir';
    const t = calculTotaux(f.lignes||[]);
    const titreDoc = estDevis?'DEVIS':estAvoir?'AVOIR':'FACTURE';
    const ref = f.reference || (estDevis?'(brouillon)':'(non émise)');
    const cliNom = nomClient(c);
    const ag = AGENCE;
    const LOGO = 'https://gtec-immobilier.fr/logo-gtec-vert.png?v=2';

    const toolbar = shared ? '' : `<div class="noprint" style="position:sticky;top:0;background:#1A2738;padding:10px 16px;display:flex;gap:10px;justify-content:center;z-index:9">
      <button onclick="window.print()" style="border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;background:#3D8074;color:#fff">📄 Enregistrer en PDF / Imprimer</button>
      <button onclick="window.close()" style="border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;background:#e3e8ea;color:#333">Fermer</button></div>`;

    const brk = s => esc(s||'').replace(/\r?\n/g,'<br>');

    // Lignes du tableau (N° · Désignation · PU HT · Qté · Total HT)
    const lignesHtml = t.lignes.map((l,i)=>`<tr>
      <td class="no">${String(i+1).padStart(2,'0')}</td>
      <td>${brk(l.designation)||'<span style="color:#999">—</span>'}</td>
      <td class="r">${euro2(l.prix_unitaire_ht)}</td>
      <td class="c">${String(l.quantite).replace('.',',')}</td>
      <td class="r">${euro2(l.montant_ht)}</td></tr>`).join('');

    // Totaux : sous-total HT + une ligne par taux de TVA + total TTC
    const tvaLignes = (t.detailTva.length?t.detailTva:[{taux:0,montant:0}])
      .map(d=>`<div class="srow"><span>TVA ${String(d.taux).replace('.',',')} %</span><span>${euro2(d.montant)}</span></div>`).join('');

    // Coordonnées de l'agence (pictos)
    const contactHtml = [
      ag.adresse && ['⌖', esc(ag.adresse)],
      ag.telephone && ['✆', esc(ag.telephone)],
      ag.email && ['@', esc(ag.email)],
      ag.site && ['⌂', esc(ag.site)]
    ].filter(Boolean).map(([ic,tx])=>`<div class="ci"><span class="ic">${ic}</span>${tx}</div>`).join('');

    // Bloc bas-gauche : devis = validité ; facture = coordonnées bancaires + échéance
    const blocGauche = estDevis
      ? `<div class="h">VALIDITÉ</div>
         <div class="pay">Devis gratuit, valable ${ag.validite_jours} jours${f.validite_date?` (jusqu'au ${fmtDate(f.validite_date)})`:''}.</div>`
      : `${ag.iban?`<div class="h">COORDONNÉES BANCAIRES</div>
           <table class="paytbl">${ag.banque?`<tr><td class="k">Banque</td><td>${esc(ag.banque)}</td></tr>`:''}
           <tr><td class="k">IBAN</td><td>${esc(ag.iban)}</td></tr>
           ${ag.bic?`<tr><td class="k">BIC</td><td>${esc(ag.bic)}</td></tr>`:''}</table>`:''}
         ${f.date_echeance?`<div class="pay" style="margin-top:8px">Règlement par virement, échéance le <b>${fmtDate(f.date_echeance)}</b>.</div>`:''}`;

    // Conditions (facture = pénalités légales + conditions libres ; devis = conditions libres)
    const penalites = estDevis ? '' : `Pas d'escompte pour règlement anticipé. En cas de retard de paiement, une pénalité égale à ${esc(ag.taux_penalites)} sera exigible, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce).`;
    const condTxt = [penalites, f.conditions&&brk(f.conditions)].filter(Boolean).join('<br>');

    // Clause d'engagement (devis uniquement) : rémunération du travail accompli en amont
    const engagementDevis = estDevis ? `<div class="engage">
      <div class="eh">Engagement du client à la signature du devis</div>
      <p>En signant le présent devis, le client reconnaît la mission de ${esc(ag.raison_sociale)}. En conséquence, en cas de désistement ou de renonciation à la signature de l'acte par le client dès lors que toutes les conditions ont été validées, acceptées et signées entre les parties, ce dernier s'engage à régler une indemnité égale à <b>20 % du montant total des honoraires</b> figurant au présent devis. Ceci en contrepartie des diligences déjà accomplies&nbsp;: constitution et présentation du dossier de location ou de vente, visite du local, explications techniques, échanges entre le preneur et le bailleur, négociation des conditions du bail ou de vente et, plus généralement, toute démarche entreprise en amont de la signature définitive. Le solde des honoraires demeure exigible à la signature de l'acte définitif.</p>
    </div>` : '';

    // Pied de page légal (identité société)
    const idLine = [ag.raison_sociale, ag.adresse, ag.telephone&&('Tél. : '+ag.telephone), ag.email&&('Email : '+ag.email),
      ag.rcs&&('RCS '+ag.rcs), ag.forme_juridique&&(ag.forme_juridique+(ag.capital?' au capital de '+ag.capital:'')),
      ag.siret&&('SIRET '+ag.siret), ag.tva_intra&&('TVA '+ag.tva_intra), ag.carte_pro&&('Carte pro '+ag.carte_pro)
    ].filter(Boolean).map(esc).join(' — ');

    const styles = `
      :root{--navy:#1A2738;--teal:#3D8074;--row:#eef3f2;--row-alt:#dfeae8}
      *{box-sizing:border-box} body{margin:0;font-family:'Inter','Segoe UI',Arial,sans-serif;color:#2A3338;background:#525659;font-size:12px}
      .sheet{position:relative;background:#fff;width:210mm;min-height:297mm;margin:16px auto;box-shadow:0 6px 30px rgba(0,0,0,.4);overflow:hidden;padding:0 14mm 30mm}
      .deco{position:absolute;left:0;top:0;width:100%;height:90px;pointer-events:none;z-index:0}
      .deco-b{top:auto;bottom:0}
      .content{position:relative;z-index:1}
      .head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-left:24mm;padding-top:14mm}
      .brand{display:inline-flex;flex-direction:column;align-items:center;gap:2mm}
      .brand .logo{height:22mm;width:auto;display:block}
      .brand .tl{font-size:9pt;letter-spacing:.30em;text-transform:uppercase;color:var(--teal);font-weight:500;white-space:nowrap;padding-left:.30em}
      .title{text-align:right}
      .title h1{margin:0;font-size:48px;font-weight:800;color:var(--navy);letter-spacing:3px;line-height:1}
      .inv-meta{margin-top:12px;font-size:12.5px;line-height:1.85;color:#33414b}
      .inv-meta .lab{display:inline-block;min-width:64px;color:#5a6b75} .inv-meta b{color:var(--navy)}
      .midrow{display:flex;justify-content:space-between;align-items:flex-start;margin-top:10px;padding-left:26mm}
      .contact{font-size:12px;margin-top:-26px}
      .contact .ci{display:flex;align-items:center;gap:9px;margin:4px 0}
      .contact .ic{width:20px;height:20px;border-radius:50%;background:var(--teal);color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;flex:0 0 auto}
      .billto{font-size:12px;line-height:1.55;max-width:64mm;text-align:right}
      .billto .bl{color:var(--teal);font-weight:700;font-size:11px;letter-spacing:.04em}
      .billto .cn{color:var(--navy);font-weight:800;text-transform:uppercase;margin:3px 0;font-size:19px;line-height:1.15}
      .objet{font-size:14px;margin:18px 0 0}
      table.l{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}
      table.l thead th{background:var(--navy);color:#fff;padding:12px 14px;text-align:left;font-size:11.5px;letter-spacing:.05em;font-weight:700;text-transform:uppercase}
      table.l thead th.c,table.l td.c{text-align:center;white-space:nowrap;width:16mm}
      table.l thead th.r,table.l td.r{text-align:right;white-space:nowrap;width:28mm}
      table.l tbody td{padding:13px 14px;font-size:13px;color:#33414b;vertical-align:top;line-height:1.45}
      table.l tbody tr:nth-child(odd){background:var(--row)} table.l tbody tr:nth-child(even){background:var(--row-alt)}
      table.l .no{color:var(--navy);font-weight:700;width:42px;text-align:center}
      .sums{display:flex;justify-content:flex-end;margin-top:2px}
      .sums .box{width:66mm}
      .srow{display:flex;justify-content:space-between;padding:8px 14px;font-size:13px;background:var(--row)}
      .srow span:first-child{color:#5a6b75} .srow span:last-child{font-weight:600}
      .grand{display:flex;justify-content:space-between;background:var(--teal);color:#fff;font-weight:800;font-size:15px;padding:12px 14px;margin-top:2px}
      .foot{display:flex;justify-content:space-between;gap:30px;margin-top:26px}
      .foot .h{color:var(--teal);font-weight:800;font-size:13.5px;letter-spacing:.04em;margin:0 0 8px}
      .pay{font-size:12.5px;line-height:1.5;color:#33414b}
      table.paytbl{border-collapse:collapse} table.paytbl td{padding:3px 12px 3px 0;font-size:12.5px;vertical-align:top} table.paytbl .k{color:#5a6b75;white-space:nowrap}
      .cond{font-size:10.5px;line-height:1.6;color:#55626b;max-width:92mm;margin-top:18px}
      .sign{text-align:center;min-width:60mm;padding-top:24px}
      .sign .fait{font-size:12px;color:#33414b;margin-bottom:10px}
      .sign .fait .bl{display:inline-block;border-bottom:1px dotted #8a98a0;height:1em;vertical-align:baseline}
      .sign .fait .bl-ville{width:34mm} .sign .fait .bl-d{width:7mm} .sign .fait .bl-y{width:13mm}
      .sign .sign-space{height:90px}
      .sign .line{border-top:1.5px solid #b9c3c8;width:54mm;margin:0 auto 6px} .sign .sg{font-weight:700;color:var(--navy)}
      .sign .sg-note{font-size:12px;color:#33414b;font-weight:600;margin-top:4px;line-height:1.4}
      .thanks{margin-top:34px;font-weight:800;color:var(--navy);letter-spacing:.03em;font-size:15px}
      .engage{border:1.5px solid var(--teal);border-radius:8px;padding:11px 15px;margin-top:22px;background:#f4f8f7}
      .engage .eh{color:var(--teal);font-weight:800;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px}
      .engage p{margin:0;font-size:10px;line-height:1.6;color:#44535c;text-align:justify}
      .legal{position:absolute;left:14mm;right:14mm;bottom:13mm;font-size:8px;color:#8a8a8a;line-height:1.5;text-align:center;z-index:1}
      @media screen and (max-width:760px){
        body{background:#fff}
        .sheet{width:auto;min-height:0;margin:0;padding:0 14px 90px;box-shadow:none}
        .head,.midrow{padding-left:0;flex-direction:column;gap:14px} .title{text-align:left}
        .billto{text-align:left;max-width:100%}
        .sums .box{width:100%} .foot{flex-direction:column;gap:22px} .sign{text-align:left}
        .legal{position:static;margin-top:26px}
      }
      @media print{ body{background:#fff} .noprint{display:none!important} .sheet{margin:0;box-shadow:none;width:auto;min-height:0} @page{size:A4;margin:0} }`;

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titreDoc+' '+ref)} — GTEC</title><style>${styles}</style></head>
      <body>${toolbar}<div class="sheet">
        <svg class="deco" viewBox="0 0 800 300" preserveAspectRatio="none"><path d="M0,0 H470 C300,70 150,210 0,180 Z" fill="#1A2738"/><path d="M0,0 H360 C220,55 110,150 0,128 Z" fill="#3D8074" opacity=".9"/></svg>
        <svg class="deco deco-b" viewBox="0 0 800 300" preserveAspectRatio="none"><path d="M800,300 H330 C500,230 650,90 800,120 Z" fill="#1A2738"/><path d="M800,300 H440 C580,245 690,150 800,172 Z" fill="#3D8074" opacity=".9"/></svg>

        <div class="content">
          <div class="head">
            <div class="brand">
              <img class="logo" src="${LOGO}" alt="${esc(ag.raison_sociale)}">
              <div class="tl">Immobilier d’entreprise</div>
            </div>
            <div class="title">
              <h1>${titreDoc}</h1>
              <div class="inv-meta">
                <div><span class="lab">N°</span>: <b>${esc(ref)}</b></div>
                <div><span class="lab">Date</span>: ${fmtDate(f.date_emission)}</div>
                ${!estDevis && f.date_echeance?`<div><span class="lab">Échéance</span>: ${fmtDate(f.date_echeance)}</div>`:''}
                ${estDevis && f.validite_date?`<div><span class="lab">Validité</span>: ${fmtDate(f.validite_date)}</div>`:''}
              </div>
            </div>
          </div>

          <div class="midrow">
            <div class="contact">${contactHtml}</div>
            <div class="billto">
              <div class="bl">${estAvoir?'AVOIR AU PROFIT DE :':'FACTURÉ À :'}</div>
              <div class="cn">${esc(cliNom)||'—'}</div>
              <div>${[c.adresse, c.siret&&('SIRET : '+c.siret)].filter(Boolean).map(esc).join('<br>')}</div>
            </div>
          </div>

          ${f.objet?`<div class="objet"><b>Objet :</b> ${esc(f.objet)}</div>`:''}

          <table class="l">
            <thead><tr><th class="no">N°</th><th>Désignation</th><th class="r">PU HT</th><th class="c">Qté</th><th class="r">Total HT</th></tr></thead>
            <tbody>${lignesHtml||'<tr><td colspan="5" style="text-align:center;color:#999;padding:18px">Aucune ligne</td></tr>'}</tbody>
          </table>

          <div class="sums"><div class="box">
            <div class="srow"><span>Sous-total HT</span><span>${euro2(t.total_ht)}</span></div>
            ${tvaLignes}
            <div class="grand"><span>${estDevis?'Total TTC':'Net à payer TTC'}</span><span>${euro2(t.total_ttc)}</span></div>
          </div></div>

          <div class="foot">
            <div class="foot-l">
              ${blocGauche}
              ${condTxt?`<div class="cond"><span class="h" style="display:block">CONDITIONS</span>${condTxt}</div>`:''}
            </div>
            <div class="sign">
              <div class="fait">Fait à <span class="bl bl-ville"></span>, le <span class="bl bl-d"></span>/<span class="bl bl-d"></span>/<span class="bl bl-y"></span></div>
              <div class="sign-space"></div>
              <div class="line"></div>
              <div class="sg">Signature${estDevis?' du client':''}</div>
              ${estDevis?`<div class="sg-note">précédée de la mention manuscrite « Bon pour accord »</div>`:''}
              <div class="thanks">MERCI DE VOTRE CONFIANCE</div>
            </div>
          </div>

          ${engagementDevis}
        </div>

        <div class="legal">${idLine}</div>
      </div></body></html>`;
  }

  async function generer(id, mode){
    // mode 'live' = depuis l'éditeur (lignes non encore enregistrées) : on construit un objet à la volée
    let f;
    if(mode==='live'){
      const lignesRaw = lireLignes().filter(l=>l.designation || l.prix_unitaire_ht);
      const cid = document.getElementById('fa-client')?.value;
      const cli = (window.CLIENTS||[]).find(c=>c.id===cid) || {};
      // recharge le client complet pour l'adresse/siret si besoin
      let cliFull = cli;
      if(cid){ try{ const {data}=await sb.from('clients').select('*').eq('id',cid).single(); if(data) cliFull=data; }catch(e){} }
      f = {
        type:ED.type, reference:(id? (LISTE.find(x=>x.id===id)||{}).reference : null),
        clients:cliFull, objet:document.getElementById('fa-objet')?.value,
        date_emission:document.getElementById('fa-date')?.value,
        date_echeance:document.getElementById('fa-echeance')?.value,
        validite_date:document.getElementById('fa-validite')?.value,
        conditions:document.getElementById('fa-conditions')?.value, lignes:lignesRaw
      };
    } else {
      if(!id){ alert('Aucun document sélectionné.'); return; }
      try{ f = await charger(id); }catch(e){ alert('Chargement impossible : '+(e.message||e)); return; }
    }
    const html = construireDocFacture(f, false);
    const w = window.open('', '_blank');
    if(!w){ alert('Fenêtre bloquée. Autorisez les pop-ups pour ce site.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ----- Lien client (HTML déposé dans le stockage, servi sur /f/) ----- */
  async function publierLien(id){
    if(!id){ alert('Enregistrez d’abord le document.'); return; }
    let f; try{ f = await charger(id); }catch(e){ alert('Chargement impossible.'); return; }
    const html = construireDocFacture(f, true);
    try{
      const blob = new Blob([html], { type:'text/html; charset=utf-8' });
      const up = await sb.storage.from('offres').upload('factures-public/'+id+'.html', blob, { contentType:'text/html; charset=utf-8', upsert:true, cacheControl:'60' });
      if(up.error) throw up.error;
    }catch(e){ alert('Publication impossible : '+(e.message||e)); return; }
    afficherLien('https://gtec-immobilier.fr/f/?id=' + encodeURIComponent(id), id);
  }
  async function revoquerLien(id){
    if(!id) return;
    if(!confirm('Révoquer le lien de ce document ? Le client ne pourra plus l’ouvrir.')) return;
    try{ const { error } = await sb.storage.from('offres').remove(['factures-public/'+id+'.html']); if(error) throw error;
      const bg=document.getElementById('fa-lien-bg'); if(bg) bg.remove(); alert('Lien révoqué.');
    }catch(e){ alert('Révocation impossible : '+(e.message||e)); }
  }
  function afficherLien(url, id){
    try{ if(navigator.clipboard) navigator.clipboard.writeText(url); }catch(e){}
    const old=document.getElementById('fa-lien-bg'); if(old) old.remove();
    const bg=document.createElement('div'); bg.id='fa-lien-bg';
    bg.style.cssText='position:fixed;inset:0;background:rgba(26,39,56,.5);z-index:99999;display:flex;align-items:center;justify-content:center;font-family:Inter,Arial,sans-serif';
    bg.innerHTML=`<div style="background:#fff;border-radius:14px;width:min(560px,92%);box-shadow:0 18px 60px rgba(0,0,0,.4);overflow:hidden">
      <div style="background:#1A2738;color:#fff;padding:14px 20px;font-weight:700">🔗 Lien du document à envoyer au client</div>
      <div style="padding:18px 20px"><p style="margin:0 0 10px;color:#4A5A5E;font-size:14px">Lien copié. Le client le verra en pleine page (et pourra l’enregistrer en PDF).</p>
        <input readonly value="${esc(url)}" onclick="this.select()" style="width:100%;padding:10px;border:1px solid #c9d0d3;border-radius:8px;font-size:13px;box-sizing:border-box"></div>
      <div style="padding:0 20px 18px;display:flex;gap:10px;align-items:center">
        <button onclick="GTEC_FACTURE.revoquerLien('${esc(id||'')}')" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#fbe9e9;color:#b3261e">🗑️ Révoquer</button>
        <span style="flex:1"></span>
        <a href="${esc(url)}" target="_blank" rel="noopener" style="border-radius:9px;padding:10px 16px;font-weight:600;background:#243A54;color:#fff;text-decoration:none">↗ Ouvrir</a>
        <button onclick="document.getElementById('fa-lien-bg').remove()" style="border:0;border-radius:9px;padding:10px 16px;font-weight:600;cursor:pointer;background:#e3e8ea;color:#333">Fermer</button>
      </div></div>`;
    bg.addEventListener('click', e=>{ if(e.target===bg) bg.remove(); });
    document.body.appendChild(bg);
  }

  /* ------------------------------------------------------------------ *
   *  API publique
   * ------------------------------------------------------------------ */
  window.vueFactures = vueFactures;   // pour la map de dispatch de index.html
  window.GTEC_FACTURE = {
    nouveau:(type)=>{ ED.type=(type==='facture'?'facture':'devis'); editer(null); },
    editer, generer, publierLien, revoquerLien, convertir,
    encaisser, relancer,
    _type:(v)=>{ FILTRE_TYPE=v; vueFactures(); },   // re-render complet (boutons + indicateurs)
    _statut:(v)=>{ FILTRE_STATUT=v; rafraichirTbody(); },
    _search:(v)=>{ RECHERCHE=v; rafraichirTbody(); },
    _addLigne:addLigne, _save:sauvegarder, _fermer:fermer,
    _addClient: async ()=>{
      const sel = document.getElementById('fa-client'); if(!sel) return;
      const nom = (prompt('Nom du nouveau client :')||'').trim(); if(!nom) return;
      const exist = (window.CLIENTS||CLIENTS).find(c=>nomClient(c).toLowerCase()===nom.toLowerCase());
      if(exist){ sel.value = exist.id; alert('Ce client est déjà dans la base : il est maintenant sélectionné.'); return; }
      const { data, error } = await sb.from('clients').insert({ type_client:'particulier', nom:titleStr(nom) }).select('id').single();
      if(error){ alert('Erreur lors de la création du client : '+error.message); return; }
      await chargerClients();
      sel.innerHTML = optClients(data.id);
      const m=document.getElementById('fa-msg'); if(m){ m.className='fa-msg'; m.textContent='Nouveau client ajouté ✓'; }
    },
    _saveEnc:saveEnc, _fermerEnc:()=>{ document.getElementById('modal-root2').innerHTML=''; }
  };
})();
