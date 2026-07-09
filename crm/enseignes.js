/* ==========================================================================
   GTEC IMMOBILIER — Module « Enseignes » (prospection développeurs immobiliers)
   Expose window.GTEC_ENSEIGNES. Réutilise les helpers globaux de index.html
   (sb, esc, C, charge, panel, vide, erreur, ME_AGENT, modal-root/modal-root2,
   classes CSS .modal-bg/.modal/.modal-h/.modal-f/.modal-foot/.form-grid/.f).
   Patron calqué sur facture.js (liste + indicateurs + éditeur modale).
   Suivi des contacts « développeurs » (responsables expansion / développement
   immobilier / asset managers) démarchés sur LinkedIn pour le compte de GTEC :
   qui a été contacté, où ça en est, et quand relancer.
   ========================================================================== */
(function(){
  'use strict';

  let LISTE = [];
  let ECHANGES = [];          // historique du contact actuellement ouvert dans l'éditeur
  let FILTRE_STATUT = '';     // '' = tous
  let SEULEMENT_RELANCES = false;
  let RECHERCHE = '';
  let ED = { id: null };

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
  const TEMP_LABEL = { chaud:['🔥','Chaud'], tiede:['🌤️','Tiède'], froid:['❄️','Froid'], inconnu:['—','Inconnu'] };
  const TYPE_ACTION_LABEL = {
    connexion_envoyee: 'Demande de connexion envoyée', connexion_acceptee: 'Connexion acceptée',
    message_envoye: 'Message envoyé', reponse_recue: 'Réponse reçue', relance: 'Relance',
    appel: 'Appel téléphonique', email: 'E-mail', rdv: 'Rendez-vous', note: 'Note'
  };

  const today = () => new Date().toISOString().slice(0,10);
  const fmtDate = d => { if(!d) return '—'; const [y,m,j] = String(d).slice(0,10).split('-'); return `${j}/${m}/${y}`; };
  const enRetard = c => c.prochaine_relance_date && c.prochaine_relance_date <= today()
    && !['sans_suite','client'].includes(c.statut);

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
     VUE LISTE + INDICATEURS
     ================================================================== */
  async function vueEnseignes(){
    charge();
    const { data, error } = await sb.from('enseigne_contacts').select('*').order('created_at',{ascending:false});
    if(error) return erreur(error);
    LISTE = data||[];

    const enAttente = LISTE.filter(c=>['demande_envoyee','en_attente'].includes(c.statut)).length;
    const messages   = LISTE.filter(c=>['message_envoye','reponse_recue','relance_prevue','rdv_prevu'].includes(c.statut)).length;
    const chauds     = LISTE.filter(c=>c.temperature==='chaud').length;
    const relances    = LISTE.filter(enRetard).length;

    const stats = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;padding:16px 16px 4px">
      ${carte('Contacts suivis', LISTE.length, 'toutes enseignes')}
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

    const rows = filtrer();
    const corps = stats + filtres + (rows.length
      ? `<div class="tscroll"><table><thead><tr>
           <th>Enseigne</th><th>Contact</th><th>Statut</th><th style="text-align:center">🌡️</th>
           <th>Coordonnées</th><th>Prochaine relance</th><th>Actions</th>
         </tr></thead><tbody id="en-tbody">${rows.map(ligne).join('')}</tbody></table></div>`
      : vide('Aucun contact enregistré. Ajoutez le premier développeur immobilier démarché.'));

    C().innerHTML = panel('Enseignes', `${LISTE.length} contact(s)`, corps,
      `<button class="btn btn-sm" onclick="GTEC_ENSEIGNES.nouveau()">+ Nouveau contact</button>`);
  }

  function carte(libelle, valeur, sous, couleur){
    return `<div class="stat" style="${couleur?'border-left:4px solid '+couleur:''}">
      <div class="n" style="${couleur?'color:'+couleur:''}">${esc(String(valeur))}</div>
      <div class="l">${esc(libelle)}</div>
      <div style="font-size:.72rem;color:var(--gris-fonce);margin-top:2px">${esc(sous||'')}</div></div>`;
  }

  function filtrer(){
    let r = LISTE;
    if(FILTRE_STATUT) r = r.filter(c=>c.statut===FILTRE_STATUT);
    if(SEULEMENT_RELANCES) r = r.filter(enRetard);
    const q = (RECHERCHE||'').toLowerCase().trim();
    if(q) r = r.filter(c=>[(c.enseigne||''),(c.nom||''),(c.poste||'')].join(' ').toLowerCase().includes(q));
    // tri : relances en retard d'abord, puis prospects chauds, puis plus récent
    return [...r].sort((a,b)=>{
      const ra = enRetard(a)?0:1, rb = enRetard(b)?0:1;
      if(ra!==rb) return ra-rb;
      const ta = a.temperature==='chaud'?0:1, tb = b.temperature==='chaud'?0:1;
      if(ta!==tb) return ta-tb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }
  function rafraichirTbody(){
    const tb = document.getElementById('en-tbody'); if(!tb) return;
    const rows = filtrer();
    tb.innerHTML = rows.length ? rows.map(ligne).join('') : `<tr><td colspan="7">${vide('Aucun résultat.')}</td></tr>`;
  }

  function ligne(c){
    const coord = [
      c.telephone ? `<a href="tel:${esc(c.telephone)}" onclick="event.stopPropagation()" title="Appeler">📞</a>` : '',
      c.email ? `<a href="mailto:${esc(c.email)}" onclick="event.stopPropagation()" title="${esc(c.email)}">✉️</a>` : '',
      c.linkedin_url ? `<a href="${esc(c.linkedin_url)}" target="_blank" onclick="event.stopPropagation()" title="Profil LinkedIn">🔗</a>` : ''
    ].filter(Boolean).join(' ') || '<span style="color:#90a4ae">—</span>';
    const retard = enRetard(c);
    const relanceTxt = c.prochaine_relance_date
      ? `<span style="${retard?'color:#b3261e;font-weight:700':''}">${retard?'⏰ ':''}${fmtDate(c.prochaine_relance_date)}</span>`
      : '<span style="color:#90a4ae">—</span>';
    return `<tr style="cursor:pointer" onclick="GTEC_ENSEIGNES.editer('${c.id}')">
      <td><b>${esc(c.enseigne)}</b></td>
      <td>${esc(c.nom)}${c.poste?`<div style="font-size:.78rem;color:var(--gris-fonce)">${esc(c.poste)}</div>`:''}</td>
      <td>${statutBadge(c.statut)}</td>
      <td style="text-align:center">${tempIcon(c.temperature)}</td>
      <td>${coord}</td>
      <td>${relanceTxt}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap">
        ${retard ? `<button class="btn btn-ghost btn-sm" title="Logger une relance rapide" onclick="GTEC_ENSEIGNES.relanceRapide('${c.id}')">⏰</button>` : ''}
        <button class="btn btn-ghost btn-sm" title="Modifier" onclick="GTEC_ENSEIGNES.editer('${c.id}')">✏️</button>
        <button class="btn btn-ghost btn-sm" title="Supprimer" style="color:#b3261e" onclick="GTEC_ENSEIGNES.supprimer('${c.id}')">🗑</button>
      </td></tr>`;
  }

  /* ==================================================================
     RELANCE RAPIDE (depuis la liste, sans ouvrir l'éditeur complet)
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
    vueEnseignes();
  }

  /* ==================================================================
     ÉDITEUR (modale) + HISTORIQUE DES ÉCHANGES
     ================================================================== */
  async function chargerEchanges(contactId){
    if(!contactId){ ECHANGES = []; return; }
    const { data } = await sb.from('enseigne_echanges').select('*').eq('contact_id', contactId).order('date',{ascending:false}).order('created_at',{ascending:false});
    ECHANGES = data||[];
  }

  function rowHistorique(e){
    return `<div style="padding:8px 0;border-bottom:1px solid var(--gris-bg)">
      <div style="font-size:.78rem;color:var(--gris-fonce);display:flex;justify-content:space-between">
        <b style="color:var(--bleu)">${esc(TYPE_ACTION_LABEL[e.type_action]||e.type_action)}</b><span>${fmtDate(e.date)}</span>
      </div>
      ${e.contenu?`<div style="font-size:.86rem;margin-top:2px">${esc(e.contenu)}</div>`:''}
    </div>`;
  }

  async function editer(id){
    let c = id ? LISTE.find(x=>String(x.id)===String(id)) : null;
    c = c || { statut:'a_contacter', temperature:'inconnu', canal:'connexion' };
    ED = { id: id||null };
    await chargerEchanges(id);

    document.getElementById('modal-root').innerHTML = `<div class="modal-bg" onclick="if(event.target===this)GTEC_ENSEIGNES._fermer()"><div class="modal">
      <div class="modal-h"><h3>🤝 ${id?esc(c.enseigne)+' — '+esc(c.nom):'Nouveau contact'}</h3>
        <button class="x" onclick="GTEC_ENSEIGNES._fermer()">×</button></div>
      <div class="modal-f">
        <div class="form-grid">
          <div class="f"><label>Enseigne *</label><input id="en-enseigne" value="${esc(c.enseigne||'')}" placeholder="Ex : Decathlon, Lidl, Franprix…"></div>
          <div class="f"><label>Nom du contact *</label><input id="en-nom" value="${esc(c.nom||'')}" placeholder="Prénom Nom"></div>
          <div class="f"><label>Poste</label><input id="en-poste" value="${esc(c.poste||'')}" placeholder="Responsable expansion…"></div>
          <div class="f"><label>Canal</label><select id="en-canal">
            <option value="connexion" ${c.canal==='connexion'?'selected':''}>Demande de connexion</option>
            <option value="message_direct" ${c.canal==='message_direct'?'selected':''}>Message direct (déjà relation)</option>
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
          <div class="f"><label>Ajouter un échange</label><select id="en-nvtype">
            ${Object.entries(TYPE_ACTION_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
          </select></div>
          <div class="f full"><textarea id="en-nvcontenu" rows="2" placeholder="Résumé de l'échange…"></textarea></div>
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
  function nouveau(){ editer(null); }
  function fermer(){ const bg=document.querySelector('#modal-root .modal-bg'); if(bg) bg.remove(); }

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
      if(ED.id){ const { error } = await sb.from('enseigne_contacts').update(payload).eq('id', ED.id); if(error) throw error; }
      else { const { error } = await sb.from('enseigne_contacts').insert(payload); if(error) throw error; }
      fermer();
      vueEnseignes();
    }catch(e){ msg.className='form-msg err'; msg.textContent='Erreur : '+(e.message||e); }
  }

  async function ajouterEchange(contactId){
    const type_action = document.getElementById('en-nvtype').value;
    const contenu = document.getElementById('en-nvcontenu').value.trim();
    if(!contenu){ alert('Décrivez brièvement l’échange avant de l’ajouter.'); return; }
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
    fermer();
    vueEnseignes();
  }

  window.GTEC_ENSEIGNES = {
    vue: vueEnseignes, nouveau, editer, supprimer, relanceRapide,
    _statut(v){ FILTRE_STATUT=v; rafraichirTbody(); },
    _search(v){ RECHERCHE=v; rafraichirTbody(); },
    _toggleRelances(){ SEULEMENT_RELANCES=!SEULEMENT_RELANCES; vueEnseignes(); },
    _fermer: fermer,
    _save: sauvegarder,
    _ajouterEchange: ajouterEchange
  };
})();
