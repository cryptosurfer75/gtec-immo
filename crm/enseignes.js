/* ==========================================================================
   GTEC IMMOBILIER — Module « Enseignes » (prospection développeurs immobiliers)
   Expose window.GTEC_ENSEIGNES. Réutilise les helpers globaux de index.html
   (sb, esc, C, charge, panel, vide, erreur, ME_AGENT, modal-root/modal-root2,
   classes CSS .modal-bg/.modal/.modal-h/.modal-f/.modal-foot/.form-grid/.f).
   Patron calqué sur facture.js (liste + indicateurs + éditeur modale).
   Suivi des contacts « développeurs » (responsables expansion / développement
   immobilier / asset managers / franchisés / partenaires) démarchés pour le
   compte de GTEC.

   Une même enseigne peut avoir plusieurs personnes rattachées (responsable
   développement, responsable immobilier, franchisé, partenaire...). La table
   `enseigne_contacts` reste une ligne par personne (pas de nouvelle table :
   aucune migration de données), mais l'écran regroupe les personnes par nom
   d'enseigne (normalisé, insensible à la casse) et affiche UNE fiche par
   enseigne, dans laquelle on voit/ajoute toutes ses personnes.
   ========================================================================== */
(function(){
  'use strict';

  let LISTE = [];
  let ECHANGES = [];          // historique de la personne actuellement ouverte dans l'éditeur
  let FILTRE_STATUT = '';     // '' = tous
  let SEULEMENT_RELANCES = false;
  let RECHERCHE = '';
  let ED = { id: null, enseigneVerrouillee: null };
  let FICHE_ENSEIGNE = null;  // clé (normalisée) de l'enseigne actuellement ouverte en fiche détaillée

  const STATUT_LABEL = {
    a_contacter:      'À contacter',
    demande_envoyee:  'Demande envoyée',
    en_attente:       'En attente (invitation)',
    connecte:         'Connecté',
    message_envoye:   'Message envoyé',
    reponse_recue:    'Réponse reçue',
    relance_prevue:   'Relance prévue',
    rdv_prevu:        'RDV prévu',
    sans_besoin:      'Sans besoin actuel',
    sans_suite:       'Sans suite',
    client:           'Devenu client'
  };
  // Ordre de priorité d'affichage (le plus "avancé"/urgent en premier) pour résumer
  // le statut d'une enseigne à partir de ses différentes personnes.
  const STATUT_PRIORITE = ['rdv_prevu','reponse_recue','relance_prevue','message_envoye','connecte',
    'demande_envoyee','en_attente','a_contacter','client','sans_besoin','sans_suite'];
  const TEMP_LABEL = { chaud:['🔥','Chaud'], tiede:['🌤️','Tiède'], froid:['❄️','Froid'], inconnu:['—','Inconnu'] };
  const TEMP_PRIORITE = ['chaud','tiede','inconnu','froid'];
  const TYPE_ACTION_LABEL = {
    connexion_envoyee: 'Demande de connexion envoyée', connexion_acceptee: 'Connexion acceptée',
    message_envoye: 'Message envoyé', reponse_recue: 'Réponse reçue', relance: 'Relance',
    appel: 'Appel téléphonique', email: 'E-mail', rdv: 'Rendez-vous', note: 'Note'
  };
  const CANAL_LABEL = { connexion:'Demande de connexion', message_direct:'Message direct (déjà relation)', email_direct:'Coordonnées directes (annuaire)' };
  // Placeholder du champ « échange » adapté au type choisi : pour une réponse reçue,
  // on veut le texte exact (copier-coller LinkedIn/e-mail), pas un résumé paraphrasé.
  const PLACEHOLDER_ECHANGE = {
    reponse_recue: "Collez ici le texte exact de la réponse reçue (copier-coller depuis LinkedIn ou l'e-mail)…",
    email: "Texte de l'e-mail envoyé, ou résumé…"
  };
  const placeholderEchange = type => PLACEHOLDER_ECHANGE[type] || "Résumé de l'échange…";

  const today = () => new Date().toISOString().slice(0,10);
  const fmtDate = d => { if(!d) return '—'; const [y,m,j] = String(d).slice(0,10).split('-'); return `${j}/${m}/${y}`; };
  const enRetard = c => c.prochaine_relance_date && c.prochaine_relance_date <= today()
    && !['sans_suite','client'].includes(c.statut);
  const normEnseigne = s => (s||'').trim().toLowerCase();

  function statutBadge(s){
    const map = {
      a_contacter:      ['#eceff1','#546e7a'],
      demande_envoyee:  ['rgba(30,80,140,.14)','#1e508c'],
      en_attente:       ['rgba(30,80,140,.14)','#1e508c'],
      connecte:         ['#f3e5d8','#9a6a2c'],
      message_envoye:   ['#f3e5d8','#9a6a2c'],
      reponse_recue:    ['rgba(46,125,50,.15)','#2e7d32'],
      relance_prevue:   ['rgba(232,145,45,.22)','#e8912d'],
      rdv_prevu:        ['rgba(46,125,50,.15)','#2e7d32'],
      sans_besoin:      ['#eceff1','#90a4ae'],
      sans_suite:       ['#eceff1','#90a4ae'],
      client:           ['rgba(61,128,116,.18)','#2E6357']
    };
    const [bg,c] = map[s] || ['#eceff1','#546e7a'];
    return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:.78rem;font-weight:700;background:${bg};color:${c}">${STATUT_LABEL[s]||s}</span>`;
  }
  function tempIcon(t){
    const [ic,lib] = TEMP_LABEL[t] || TEMP_LABEL.inconnu;
    return `<span title="${lib}">${ic}</span>`;
  }

  /* ==================================================================
     REGROUPEMENT PAR ENSEIGNE (couche d'affichage uniquement — la base
     reste une ligne par personne dans enseigne_contacts).
     ================================================================== */
  function grouperParEnseigne(liste){
    const map = new Map();
    liste.forEach(c=>{
      const k = normEnseigne(c.enseigne);
      if(!map.has(k)) map.set(k, { cle:k, enseigne:c.enseigne, personnes:[] });
      const g = map.get(k);
      g.personnes.push(c);
      // Le libellé affiché = celui de la personne la plus récemment créée (on garde une casse cohérente).
      if(new Date(c.created_at) > new Date((g._plusRecent||c).created_at)) { g.enseigne = c.enseigne; g._plusRecent = c; }
    });
    return [...map.values()];
  }
  function meilleurStatut(personnes){
    let best = null, bestIdx = Infinity;
    personnes.forEach(p=>{
      const i = STATUT_PRIORITE.indexOf(p.statut);
      const idx = i<0 ? STATUT_PRIORITE.length : i;
      if(idx < bestIdx){ bestIdx = idx; best = p.statut; }
    });
    return best;
  }
  function meilleureTemp(personnes){
    let best = 'inconnu', bestIdx = TEMP_PRIORITE.indexOf('inconnu');
    personnes.forEach(p=>{
      const idx = TEMP_PRIORITE.indexOf(p.temperature||'inconnu');
      if(idx >= 0 && idx < bestIdx){ bestIdx = idx; best = p.temperature; }
    });
    return best;
  }
  function prochaineRelanceGroupe(personnes){
    const dates = personnes.map(p=>p.prochaine_relance_date).filter(Boolean).sort();
    return dates[0] || null;
  }
  function groupeEnRetard(personnes){ return personnes.some(enRetard); }

  /* ==================================================================
     VUE LISTE (groupée par enseigne) + INDICATEURS
     ================================================================== */
  async function vueEnseignes(){
    charge();
    const { data, error } = await sb.from('enseigne_contacts').select('*').order('created_at',{ascending:false});
    if(error) return erreur(error);
    LISTE = data||[];

    const groupesTous = grouperParEnseigne(LISTE);
    const enAttente = LISTE.filter(c=>['demande_envoyee','en_attente'].includes(c.statut)).length;
    const messages   = LISTE.filter(c=>['message_envoye','reponse_recue','relance_prevue','rdv_prevu'].includes(c.statut)).length;
    const chauds     = LISTE.filter(c=>c.temperature==='chaud').length;
    const relances   = LISTE.filter(enRetard).length;

    const stats = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;padding:16px 16px 4px">
      ${carte('Enseignes suivies', groupesTous.length, `${LISTE.length} personne(s) au total`)}
      ${carte('En attente', enAttente, 'connexion pas encore acceptée')}
      ${carte('Messages envoyés', messages, 'prise de contact faite')}
      ${carte('🔥 Prospects chauds', chauds, 'à suivre en priorité', chauds?'#e8912d':null)}
      ${carte('⏰ Relances dues', relances, relances?'à traiter maintenant':'rien en retard', relances?'#b3261e':null)}
    </div>`;

    const filtres = `<div style="padding:12px 16px;border-bottom:1px solid var(--gris-clair);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button class="btn btn-sm ${SEULEMENT_RELANCES?'':'btn-ghost'}" style="padding:8px 14px" onclick="GTEC_ENSEIGNES._toggleRelances()">⏰ À relancer</button>
      <select onchange="GTEC_ENSEIGNES._statut(this.value)" style="padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
        <option value="">Tous les statuts</option>
        ${Object.entries(STATUT_LABEL).map(([k,v])=>`<option value="${k}" ${FILTRE_STATUT===k?'selected':''}>${v}</option>`).join('')}
      </select>
      <input id="en-search" type="search" autocomplete="off" placeholder="🔎 Enseigne, contact, poste…" value="${esc(RECHERCHE)}"
        oninput="GTEC_ENSEIGNES._search(this.value)"
        style="flex:1;min-width:200px;max-width:380px;padding:9px 12px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
    </div>`;

    const groupes = filtrerGroupes();
    const corps = stats + filtres + (groupes.length
      ? `<div class="tscroll"><table><thead><tr>
           <th>Enseigne</th><th>Personnes</th><th>Statut</th><th style="text-align:center">🌡️</th>
           <th>Prochaine relance</th><th>Actions</th>
         </tr></thead><tbody id="en-tbody">${groupes.map(ligneGroupe).join('')}</tbody></table></div>`
      : vide('Aucun contact enregistré. Ajoutez la première enseigne démarchée.'));

    C().innerHTML = panel('Enseignes', `${groupesTous.length} enseigne(s) · ${LISTE.length} personne(s)`, corps,
      `<button class="btn btn-sm" onclick="GTEC_ENSEIGNES.nouvelleEnseigne()">+ Nouvelle enseigne</button>`);

    datalistEnseignes();
  }

  function carte(libelle, valeur, sous, couleur){
    return `<div class="stat" style="${couleur?'border-left:4px solid '+couleur:''}">
      <div class="n" style="${couleur?'color:'+couleur:''}">${esc(String(valeur))}</div>
      <div class="l">${esc(libelle)}</div>
      <div style="font-size:.72rem;color:var(--gris-fonce);margin-top:2px">${esc(sous||'')}</div></div>`;
  }

  /* Filtre au niveau « personne » (statut / recherche / relances), puis ne garde
     que les groupes-enseigne ayant au moins une personne qui matche — mais chaque
     groupe affiché montre TOUTES ses personnes (pas seulement celles qui matchent),
     pour ne jamais perdre de vue qui d'autre est rattaché à l'enseigne. */
  function filtrerGroupes(){
    const q = (RECHERCHE||'').toLowerCase().trim();
    const matchPersonne = c => {
      if(FILTRE_STATUT && c.statut!==FILTRE_STATUT) return false;
      if(SEULEMENT_RELANCES && !enRetard(c)) return false;
      if(q && !([(c.enseigne||''),(c.nom||''),(c.poste||'')].join(' ').toLowerCase().includes(q))) return false;
      return true;
    };
    const groupes = grouperParEnseigne(LISTE).filter(g => g.personnes.some(matchPersonne));
    return groupes.sort((a,b)=>{
      const ra = groupeEnRetard(a.personnes)?0:1, rb = groupeEnRetard(b.personnes)?0:1;
      if(ra!==rb) return ra-rb;
      const ta = meilleureTemp(a.personnes)==='chaud'?0:1, tb = meilleureTemp(b.personnes)==='chaud'?0:1;
      if(ta!==tb) return ta-tb;
      const da = Math.max(...a.personnes.map(p=>new Date(p.created_at).getTime()));
      const db = Math.max(...b.personnes.map(p=>new Date(p.created_at).getTime()));
      return db-da;
    });
  }
  function rafraichirTbody(){
    const tb = document.getElementById('en-tbody'); if(!tb) return;
    const groupes = filtrerGroupes();
    tb.innerHTML = groupes.length ? groupes.map(ligneGroupe).join('') : `<tr><td colspan="6">${vide('Aucun résultat.')}</td></tr>`;
  }

  function ligneGroupe(g){
    const retard = groupeEnRetard(g.personnes);
    const prochaine = prochaineRelanceGroupe(g.personnes);
    const relanceTxt = prochaine
      ? `<span style="${retard?'color:#b3261e;font-weight:700':''}">${retard?'⏰ ':''}${fmtDate(prochaine)}</span>`
      : '<span style="color:#90a4ae">—</span>';
    const noms = g.personnes.map(p=>esc(p.nom)).join(', ');
    return `<tr style="cursor:pointer" onclick="GTEC_ENSEIGNES.ficheEnseigne('${esc(g.cle)}')">
      <td><b>${esc(g.enseigne)}</b></td>
      <td><span title="${noms}">${g.personnes.length} personne${g.personnes.length>1?'s':''}</span>
        <div style="font-size:.78rem;color:var(--gris-fonce)">${noms.length>60?noms.slice(0,60)+'…':noms}</div></td>
      <td>${statutBadge(meilleurStatut(g.personnes))}${g.personnes.length>1?` <span style="font-size:.72rem;color:var(--gris-fonce)">(meilleur des ${g.personnes.length})</span>`:''}</td>
      <td style="text-align:center">${tempIcon(meilleureTemp(g.personnes))}</td>
      <td>${relanceTxt}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" title="Voir la fiche" onclick="GTEC_ENSEIGNES.ficheEnseigne('${esc(g.cle)}')">👁️</button>
      </td></tr>`;
  }

  /* ==================================================================
     FICHE ENSEIGNE (liste des personnes rattachées)
     ================================================================== */
  function ficheEnseigne(cle){
    FICHE_ENSEIGNE = cle;
    const groupe = grouperParEnseigne(LISTE).find(g=>g.cle===cle);
    if(!groupe){ FICHE_ENSEIGNE=null; return; }
    const personnes = [...groupe.personnes].sort((a,b)=>{
      const ra = enRetard(a)?0:1, rb = enRetard(b)?0:1;
      if(ra!==rb) return ra-rb;
      return new Date(b.created_at)-new Date(a.created_at);
    });
    document.getElementById('modal-root').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)GTEC_ENSEIGNES._fermerFiche()"><div class="modal" style="max-width:760px">
      <div class="modal-h"><h3>🏢 ${esc(groupe.enseigne)}</h3><button class="x" onclick="GTEC_ENSEIGNES._fermerFiche()">×</button></div>
      <div class="modal-f">
        <p style="font-size:.85rem;color:var(--gris-fonce);margin-top:-6px">${personnes.length} personne${personnes.length>1?'s':''} rattachée${personnes.length>1?'s':''} à cette enseigne (développement, immobilier, franchisé, partenaire…).</p>
        <div id="en-fiche-personnes">${personnes.map(rowPersonne).join('')}</div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="GTEC_ENSEIGNES.ajouterPersonne('${esc(groupe.enseigne)}')">＋ Ajouter une personne à cette enseigne</button>
      </div>
      <div class="modal-foot"><span></span><button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_ENSEIGNES._fermerFiche()">Fermer</button></div>
    </div></div>`;
  }
  function rowPersonne(c){
    const coord = [
      c.telephone ? `<a href="tel:${esc(c.telephone)}" onclick="event.stopPropagation()" title="Appeler">📞</a>` : '',
      c.email ? `<a href="mailto:${esc(c.email)}" onclick="event.stopPropagation()" title="${esc(c.email)}">✉️</a>` : '',
      c.linkedin_url ? `<a href="${esc(c.linkedin_url)}" target="_blank" onclick="event.stopPropagation()" title="Profil LinkedIn">🔗</a>` : ''
    ].filter(Boolean).join(' ') || '<span style="color:#90a4ae">—</span>';
    const retard = enRetard(c);
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--gris-bg);cursor:pointer" onclick="GTEC_ENSEIGNES.editer('${c.id}')">
      <div style="flex:1;min-width:0">
        <b>${esc(c.nom)}</b>${c.poste?` <span style="font-size:.82rem;color:var(--gris-fonce)">— ${esc(c.poste)}</span>`:''}
        ${retard?' <span style="color:#b3261e;font-size:.8rem">⏰ relance due</span>':''}
        <div style="margin-top:3px">${statutBadge(c.statut)} ${tempIcon(c.temperature)} <span style="margin-left:6px">${coord}</span></div>
      </div>
      <div onclick="event.stopPropagation()" style="white-space:nowrap">
        <button class="btn btn-ghost btn-sm" title="Modifier" onclick="GTEC_ENSEIGNES.editer('${c.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" title="Supprimer" style="color:#b3261e" onclick="GTEC_ENSEIGNES.supprimer('${c.id}')">🗑</button>
      </div></div>`;
  }
  function fermerFiche(){ fermer(); FICHE_ENSEIGNE=null; }
  function ajouterPersonne(enseigne){ editer(null, enseigne); }
  function nouvelleEnseigne(){ editer(null, null); }

  /* Suggestions d'enseignes existantes, pour éviter de recréer "Boulanger" /
     "BOULANGER" / "boulanger" en plusieurs fiches distinctes par erreur de frappe. */
  function datalistEnseignes(){
    let dl = document.getElementById('en-datalist-enseignes');
    if(!dl){ dl = document.createElement('datalist'); dl.id='en-datalist-enseignes'; document.body.appendChild(dl); }
    const noms = [...new Set(LISTE.map(c=>c.enseigne).filter(Boolean))].sort();
    dl.innerHTML = noms.map(n=>`<option value="${esc(n)}">`).join('');
  }

  /* ==================================================================
     RELANCE RAPIDE (depuis la fiche, sans ouvrir l'éditeur complet)
     ================================================================== */
  async function relanceRapide(id){
    const c = LISTE.find(x=>String(x.id)===String(id)); if(!c) return;
    const note = prompt(`Relance — ${c.enseigne} (${c.nom})\nQu'avez-vous fait ? (ex : relancé par message, appelé, toujours sans réponse…)`);
    if(note==null || !note.trim()) return;
    await sb.from('enseigne_echanges').insert({ contact_id:id, date:today(), type_action:'relance', contenu:note.trim(), auteur:window.ME_AGENT||null });
    const prochaine = prompt('Prochaine relance le (JJ/MM/AAAA) — laisser vide si aucune relance à prévoir :');
    const payload = { derniere_action_date: today() };
    if(prochaine && prochaine.trim()){
      const m = prochaine.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if(m) payload.prochaine_relance_date = `${m[3]}-${m[2]}-${m[1]}`;
      payload.statut = 'relance_prevue';
    }
    await sb.from('enseigne_contacts').update(payload).eq('id', id);
    await vueEnseignes();
    if(FICHE_ENSEIGNE) ficheEnseigne(FICHE_ENSEIGNE);
  }

  /* ==================================================================
     ÉDITEUR (modale) + HISTORIQUE DES ÉCHANGES — une « personne »
     ================================================================== */
  async function chargerEchanges(contactId){
    if(!contactId){ ECHANGES = []; return; }
    const { data } = await sb.from('enseigne_echanges').select('*').eq('contact_id', contactId).order('date',{ascending:false}).order('created_at',{ascending:false});
    ECHANGES = data||[];
  }

  function rowHistorique(e){
    const estReponse = e.type_action === 'reponse_recue';
    const contenu = e.contenu ? (estReponse
      ? `<div style="font-size:.86rem;margin-top:5px;padding:9px 11px;background:rgba(46,125,50,.08);border-left:3px solid #2e7d32;border-radius:4px;font-style:italic;white-space:pre-wrap">💬 ${esc(e.contenu)}</div>`
      : `<div style="font-size:.86rem;margin-top:2px;white-space:pre-wrap">${esc(e.contenu)}</div>`
    ) : (estReponse ? `<div style="font-size:.8rem;color:#b3261e;margin-top:3px">⚠️ Aucun texte de réponse joint</div>` : '');
    return `<div style="padding:8px 0;border-bottom:1px solid var(--gris-bg)">
      <div style="font-size:.78rem;color:var(--gris-fonce);display:flex;justify-content:space-between">
        <b style="color:var(--bleu)">${esc(TYPE_ACTION_LABEL[e.type_action]||e.type_action)}</b><span>${fmtDate(e.date)}</span>
      </div>
      ${contenu}
    </div>`;
  }

  /* editer(id, enseigneVerrouillee) :
     - id fourni → modifie une personne existante.
     - id null + enseigneVerrouillee fourni → nouvelle personne rattachée à cette enseigne (champ verrouillé).
     - id null + enseigneVerrouillee absent → nouvelle enseigne + sa première personne (champ libre). */
  async function editer(id, enseigneVerrouillee){
    let c = id ? LISTE.find(x=>String(x.id)===String(id)) : null;
    c = c || { statut:'a_contacter', temperature:'inconnu', canal:'connexion', enseigne: enseigneVerrouillee||'' };
    ED = { id: id||null, enseigneVerrouillee: enseigneVerrouillee||null };
    await chargerEchanges(id);

    const enseigneChamp = ED.enseigneVerrouillee
      ? `<div class="f"><label>Enseigne</label><input id="en-enseigne" value="${esc(c.enseigne||'')}" readonly style="background:var(--gris-bg)"></div>`
      : `<div class="f"><label>Enseigne *</label><input id="en-enseigne" list="en-datalist-enseignes" value="${esc(c.enseigne||'')}" placeholder="Ex : Decathlon, Lidl, Franprix…"></div>`;

    document.getElementById('modal-root2').innerHTML = `<div class="modal-bg" style="z-index:200" onclick="if(event.target===this)GTEC_ENSEIGNES._fermer()"><div class="modal">
      <div class="modal-h"><h3>🤝 ${id?esc(c.enseigne)+' — '+esc(c.nom):(ED.enseigneVerrouillee?'Nouvelle personne — '+esc(ED.enseigneVerrouillee):'Nouvelle enseigne')}</h3>
        <button class="x" onclick="GTEC_ENSEIGNES._fermer()">×</button></div>
      <div class="modal-f">
        <div class="form-grid">
          ${enseigneChamp}
          <div class="f"><label>Nom du contact *</label><input id="en-nom" value="${esc(c.nom||'')}" placeholder="Prénom Nom"></div>
          <div class="f"><label>Poste</label><input id="en-poste" value="${esc(c.poste||'')}" placeholder="Responsable expansion, responsable immobilier, franchisé, partenaire…"></div>
          <div class="f"><label>Canal</label><select id="en-canal">
            ${Object.entries(CANAL_LABEL).map(([k,v])=>`<option value="${k}" ${c.canal===k?'selected':''}>${v}</option>`).join('')}
          </select></div>
          <div class="f"><label>Statut</label><select id="en-statut">
            ${Object.entries(STATUT_LABEL).map(([k,v])=>`<option value="${k}" ${c.statut===k?'selected':''}>${v}</option>`).join('')}
          </select></div>
          <div class="f"><label>Température</label><select id="en-temp">
            <option value="inconnu" ${c.temperature==='inconnu'?'selected':''}>— Inconnu</option>
            <option value="chaud" ${c.temperature==='chaud'?'selected':''}>🔥 Chaud (intérêt confirmé)</option>
            <option value="tiede" ${c.temperature==='tiede'?'selected':''}>🌤️ Tiède</option>
            <option value="froid" ${c.temperature==='froid'?'selected':''}>❄️ Froid (pas de besoin)</option>
          </select></div>
          <div class="f"><label>Téléphone</label><input id="en-tel" value="${esc(c.telephone||'')}" placeholder="06 …"></div>
          <div class="f"><label>E-mail</label><input id="en-email" type="email" value="${esc(c.email||'')}"></div>
          <div class="f full"><label>Profil LinkedIn</label><input id="en-linkedin" value="${esc(c.linkedin_url||'')}" placeholder="https://www.linkedin.com/in/…"></div>
          <div class="f"><label>Prochaine relance</label><input id="en-relance" type="date" value="${c.prochaine_relance_date||''}"></div>
          <div class="f full"><label>Notes</label><textarea id="en-notes" rows="3" placeholder="Contexte, ce qui a été dit, à qui s'adresser…">${esc(c.notes||'')}</textarea></div>
        </div>

        ${id ? `<div class="form-sep">Historique</div>
        <div id="en-hist">${ECHANGES.length ? ECHANGES.map(rowHistorique).join('') : '<div style="color:var(--gris-fonce);font-size:.86rem;padding:6px 0">Aucun échange enregistré pour l’instant.</div>'}</div>
        <div class="form-grid" style="margin-top:10px">
          <div class="f"><label>Ajouter un échange</label><select id="en-nvtype" onchange="GTEC_ENSEIGNES._majPlaceholderEchange(this.value)">
            ${Object.entries(TYPE_ACTION_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
          </select></div>
          <div class="f full"><textarea id="en-nvcontenu" rows="2" placeholder="${esc(placeholderEchange(''))}"></textarea></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_ENSEIGNES._ajouterEchange('${id}')">+ Ajouter à l'historique</button>`
        : `<div class="form-sep"></div><p style="font-size:.82rem;color:var(--gris-fonce)">L'historique des échanges se renseigne après le premier enregistrement.</p>`}
      </div>
      <div class="modal-foot">
        <span class="form-msg" id="en-msg"></span>
        <span style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-sm" onclick="GTEC_ENSEIGNES._fermer()">Fermer</button>
          ${id?`<button type="button" class="btn btn-danger btn-sm" onclick="GTEC_ENSEIGNES.supprimer('${id}')">🗑 Supprimer</button>`:''}
          <button type="button" class="btn btn-sm" onclick="GTEC_ENSEIGNES._save()">💾 Enregistrer</button>
        </span>
      </div>
    </div></div>`;
  }
  function fermer(){ const bg=document.querySelector('#modal-root2 .modal-bg'); if(bg) bg.remove(); const bg1=document.querySelector('#modal-root .modal-bg'); if(bg1 && !FICHE_ENSEIGNE) bg1.remove(); }

  async function sauvegarder(){
    const msg = document.getElementById('en-msg'); msg.className='form-msg'; msg.textContent='Enregistrement…';
    try{
      const enseigne = document.getElementById('en-enseigne').value.trim();
      const nom = document.getElementById('en-nom').value.trim();
      if(!enseigne || !nom) throw new Error('Enseigne et nom du contact sont obligatoires.');
      const payload = {
        enseigne, nom,
        poste: document.getElementById('en-poste').value.trim() || null,
        canal: document.getElementById('en-canal').value,
        statut: document.getElementById('en-statut').value,
        temperature: document.getElementById('en-temp').value,
        telephone: document.getElementById('en-tel').value.trim() || null,
        email: document.getElementById('en-email').value.trim().toLowerCase() || null,
        linkedin_url: document.getElementById('en-linkedin').value.trim() || null,
        prochaine_relance_date: document.getElementById('en-relance').value || null,
        notes: document.getElementById('en-notes').value.trim() || null,
        derniere_action_date: today(),
        agent: window.ME_AGENT || null
      };
      let idSauve = ED.id;
      if(ED.id){ const { error } = await sb.from('enseigne_contacts').update(payload).eq('id', ED.id); if(error) throw error; }
      else { const { data, error } = await sb.from('enseigne_contacts').insert(payload).select('id').single(); if(error) throw error; idSauve = data.id; }
      const retourFiche = FICHE_ENSEIGNE || normEnseigne(enseigne);
      document.querySelector('#modal-root2 .modal-bg')?.remove();
      await vueEnseignes();
      ficheEnseigne(retourFiche);
    }catch(e){ msg.className='form-msg err'; msg.textContent='Erreur : '+(e.message||e); }
  }

  async function ajouterEchange(contactId){
    const type_action = document.getElementById('en-nvtype').value;
    const contenu = document.getElementById('en-nvcontenu').value.trim();
    if(!contenu){
      alert(type_action==='reponse_recue' ? 'Collez le texte de la réponse reçue avant de l’ajouter.' : 'Décrivez brièvement l’échange avant de l’ajouter.');
      return;
    }
    const { error } = await sb.from('enseigne_echanges').insert({ contact_id:contactId, date:today(), type_action, contenu, auteur:window.ME_AGENT||null });
    if(error){ alert('Erreur : '+error.message); return; }
    await sb.from('enseigne_contacts').update({ derniere_action_date: today() }).eq('id', contactId);
    await chargerEchanges(contactId);
    document.getElementById('en-hist').innerHTML = ECHANGES.map(rowHistorique).join('');
    document.getElementById('en-nvcontenu').value = '';
  }

  async function supprimer(id){
    const c = LISTE.find(x=>String(x.id)===String(id));
    if(!confirm(`Supprimer définitivement le contact ${c?c.nom+' ('+c.enseigne+')':''} ainsi que son historique ?`)) return;
    const { error } = await sb.from('enseigne_contacts').delete().eq('id', id);
    if(error){ alert('Suppression impossible : '+error.message); return; }
    document.querySelector('#modal-root2 .modal-bg')?.remove();
    const retourFiche = FICHE_ENSEIGNE;
    await vueEnseignes();
    if(retourFiche && grouperParEnseigne(LISTE).some(g=>g.cle===retourFiche)) ficheEnseigne(retourFiche);
    else fermerFiche();
  }

  window.GTEC_ENSEIGNES = {
    vue: vueEnseignes, nouvelleEnseigne, ajouterPersonne, ficheEnseigne, editer, supprimer, relanceRapide,
    _statut(v){ FILTRE_STATUT=v; rafraichirTbody(); },
    _search(v){ RECHERCHE=v; rafraichirTbody(); },
    _toggleRelances(){ SEULEMENT_RELANCES=!SEULEMENT_RELANCES; vueEnseignes(); },
    _fermer: fermer,
    _fermerFiche: fermerFiche,
    _save: sauvegarder,
    _ajouterEchange: ajouterEchange,
    _majPlaceholderEchange(type){ const t = document.getElementById('en-nvcontenu'); if(t) t.placeholder = placeholderEchange(type); }
  };
})();
