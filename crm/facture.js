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
    forme_juridique:  '',            // ex. SAS, SARL…
    capital:          '',            // ex. 10 000 €
    adresse:          '',            // siège complet
    siret:            '',            // 14 chiffres
    rcs:              '',            // ex. Amiens 000 000 000
    tva_intra:        '',            // ex. FR00 000000000
    carte_pro:        '',            // n° CPI (transaction) — loi Hoguet
    garantie_fin:     '',            // organisme + montant (ou « Pas de maniement de fonds »)
    rcp:              '',            // assureur RC professionnelle
    mediateur:        '',            // médiateur de la consommation (nom + site)
    iban:             '',
    bic:              '',
    email:            '',            // email comptabilité (relances)
    telephone:        '',
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

    const titre = (id? (f.reference||'Brouillon') : (f.type==='devis'?'Nouveau devis':'Nouvelle facture'));
    document.getElementById('modal-root').innerHTML = `<div id="fa-ed-bg" onclick="if(event.target===this)GTEC_FACTURE._fermer()">
      <div id="fa-ed">
        <div class="h"><h3>${f.type==='devis'?'📝':'🧾'} ${esc(titre)}${ED.gel?' · <span style="opacity:.7;font-weight:400">document émis (lecture seule)</span>':''}</h3>
          <button class="x" onclick="GTEC_FACTURE._fermer()">×</button></div>
        <div class="b">
          <div class="grid">
            <div class="f"><label>Client</label><select id="fa-client" ${dis}>${optClients(f.client_id)}</select></div>
            <div class="f"><label>Objet</label><input id="fa-objet" value="${esc(f.objet||'')}" placeholder="Honoraires de transaction…" ${ro}></div>
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
      if(!clientId) throw new Error('Sélectionnez un client.');
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
    const cliLignes = [cliNom, c.adresse, c.siret?('SIRET : '+c.siret):''].filter(Boolean).map(esc).join('<br>');
    const ag = AGENCE;
    const champ = v => v || '<span style="color:#b3261e">[à compléter]</span>';

    const toolbar = shared ? '' : `<div class="noprint" style="position:sticky;top:0;background:#1A2738;padding:10px 16px;display:flex;gap:10px;justify-content:center;z-index:9">
      <button onclick="window.print()" style="border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;background:#3D8074;color:#fff">📄 Enregistrer en PDF / Imprimer</button>
      <button onclick="window.close()" style="border:0;border-radius:8px;padding:10px 18px;font-weight:700;cursor:pointer;background:#e3e8ea;color:#333">Fermer</button></div>`;

    const lignesHtml = t.lignes.map(l=>`<tr>
      <td>${esc(l.designation||'')}</td>
      <td style="text-align:center">${String(l.quantite).replace('.',',')}</td>
      <td style="text-align:right">${euro2(l.prix_unitaire_ht)}</td>
      <td style="text-align:center">${String(l.taux_tva).replace('.',',')} %</td>
      <td style="text-align:right">${euro2(l.montant_ht)}</td></tr>`).join('');

    const mentions = estDevis
      ? `<p><b>Devis gratuit</b>, valable ${ag.validite_jours} jours${f.validite_date?` (jusqu'au ${fmtDate(f.validite_date)})`:''}.</p>
         <div style="margin-top:30px;border:1px dashed #1A2738;border-radius:8px;padding:14px;width:60%">
           <b>Bon pour accord</b> — Date et signature précédées de la mention « Bon pour accord » :<br><br><br></div>`
      : `<p style="margin:2px 0">Règlement à réception${f.date_echeance?`, au plus tard le ${fmtDate(f.date_echeance)}`:''}. ${ag.iban?`Par virement — IBAN ${esc(ag.iban)}${ag.bic?' / BIC '+esc(ag.bic):''}.`:''}</p>
         <p style="margin:2px 0;font-size:9px;color:#555">En cas de retard de paiement : pénalités de retard au taux de ${esc(ag.taux_penalites)} et indemnité forfaitaire pour frais de recouvrement de 40 € (art. L441-10 et D441-5 du Code de commerce). Pas d'escompte pour paiement anticipé.</p>`;

    const styles = `
      *{box-sizing:border-box} body{margin:0;font-family:'Inter','Segoe UI',Arial,sans-serif;color:#2A3338;background:#525659}
      .sheet{background:#fff;width:210mm;min-height:297mm;margin:16px auto;padding:18mm 16mm;box-shadow:0 6px 30px rgba(0,0,0,.4)}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1A2738;padding-bottom:14px}
      .emet{font-size:11px;line-height:1.5} .emet .rs{font-size:17px;font-weight:800;color:#1A2738}
      .doc-titre{text-align:right} .doc-titre h1{margin:0;font-size:26px;color:#3D8074;letter-spacing:1px} .doc-titre .ref{font-size:14px;font-weight:700}
      .meta{display:flex;justify-content:space-between;margin:22px 0}
      .meta .bloc{font-size:12px;line-height:1.6} .meta .bloc .t{font-size:10px;text-transform:uppercase;color:#3D8074;font-weight:700;letter-spacing:.5px}
      table.l{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
      table.l th{background:#1A2738;color:#fff;padding:9px 10px;text-align:left;font-size:10px;text-transform:uppercase}
      table.l td{padding:8px 10px;border-bottom:1px solid #eceff1}
      .recap{display:flex;justify-content:flex-end;margin-top:12px} .recap table{min-width:240px;font-size:12px}
      .recap td{padding:5px 10px} .recap .ttc td{font-weight:800;font-size:14px;color:#1A2738;border-top:2px solid #1A2738}
      .cond{margin-top:24px;font-size:11px;line-height:1.5}
      .pied{margin-top:30px;border-top:1px solid #C9D0D3;padding-top:10px;font-size:8.5px;color:#666;line-height:1.5;text-align:center}
      @media screen and (max-width:760px){
        body{background:#fff}
        .sheet{width:auto;min-height:0;margin:0;padding:16px 13px;box-shadow:none}
        .top{flex-direction:column;gap:12px} .doc-titre{text-align:left}
        .meta{flex-direction:column;gap:14px} .meta .bloc{text-align:left!important}
        table.l th,table.l td{padding:6px 6px;font-size:11px}
        .recap table{min-width:0;width:100%}
      }
      @media print{ body{background:#fff} .noprint{display:none!important} .sheet{margin:0;box-shadow:none;width:auto} @page{size:A4;margin:12mm} }`;

    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(titreDoc+' '+ref)} — GTEC</title><style>${styles}</style></head>
      <body>${toolbar}<div class="sheet">
        <div class="top">
          <div class="emet"><div class="rs">${esc(ag.raison_sociale)}</div>
            ${[ag.forme_juridique && ('Société '+ag.forme_juridique+(ag.capital?' au capital de '+ag.capital:'')), ag.adresse, ag.telephone, ag.email].filter(Boolean).map(esc).join('<br>')}
            <br>SIRET ${champ(esc(ag.siret))}${ag.rcs?' · RCS '+esc(ag.rcs):''}<br>TVA ${champ(esc(ag.tva_intra))}
            ${ag.carte_pro?'<br>Carte professionnelle '+esc(ag.carte_pro):'<br>Carte pro '+champ('')}
          </div>
          <div class="doc-titre"><h1>${titreDoc}</h1><div class="ref">N° ${esc(ref)}</div>
            <div style="font-size:12px;margin-top:6px">Émis le ${fmtDate(f.date_emission)}</div>
            ${!estDevis && f.date_echeance?`<div style="font-size:12px">Échéance : ${fmtDate(f.date_echeance)}</div>`:''}
          </div>
        </div>

        <div class="meta">
          <div class="bloc"><span class="t">Émetteur</span><br>${esc(ag.raison_sociale)}</div>
          <div class="bloc" style="text-align:right"><span class="t">${estAvoir?'Avoir au profit de':'Facturé à'}</span><br>${cliLignes||'—'}</div>
        </div>

        ${f.objet?`<div style="font-size:13px;margin:6px 0 4px"><b>Objet :</b> ${esc(f.objet)}</div>`:''}

        <table class="l"><thead><tr><th>Désignation</th><th style="text-align:center">Qté</th><th style="text-align:right">PU HT</th><th style="text-align:center">TVA</th><th style="text-align:right">Total HT</th></tr></thead>
          <tbody>${lignesHtml||'<tr><td colspan="5" style="text-align:center;color:#999">Aucune ligne</td></tr>'}</tbody></table>

        <div class="recap"><table>
          <tr><td>Total HT</td><td style="text-align:right">${euro2(t.total_ht)}</td></tr>
          ${t.detailTva.map(d=>`<tr><td>TVA ${String(d.taux).replace('.',',')} % (base ${euro2(d.base)})</td><td style="text-align:right">${euro2(d.montant)}</td></tr>`).join('')}
          <tr class="ttc"><td>${estDevis?'Total TTC':'Net à payer TTC'}</td><td style="text-align:right">${euro2(t.total_ttc)}</td></tr>
        </table></div>

        <div class="cond">${mentions}${f.conditions?'<p style="margin-top:10px">'+esc(f.conditions)+'</p>':''}</div>

        <div class="pied">${esc(ag.raison_sociale)}${ag.carte_pro?' — Carte pro '+esc(ag.carte_pro):''}${ag.garantie_fin?' — Garantie financière : '+esc(ag.garantie_fin):''}${ag.rcp?' — RCP : '+esc(ag.rcp):''}${ag.mediateur?'<br>Médiateur de la consommation : '+esc(ag.mediateur):''}</div>
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
    _saveEnc:saveEnc, _fermerEnc:()=>{ document.getElementById('modal-root2').innerHTML=''; }
  };
})();
