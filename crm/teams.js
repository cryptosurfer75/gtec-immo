/* ============================================================================
   GTEC IMMOBILIER — Espace TEAMS (notes partagées façon OneNote)
   ----------------------------------------------------------------------------
   Bloc-notes : sections (gauche) → pages (milieu) → éditeur de notes (droite),
   enregistrement automatique. Chaque page porte une DATE (cliquable) indiquant
   la date de la prise de notes. Partagé entre les collaborateurs.
   Tables : team_sections, team_pages (colonne date_note).
   Dépend de la variable globale `sb`. Expose window.vueTeams + window.GTEC_TEAMS.
   Fichier autonome : ne touche à rien d'autre dans le CRM.
   ========================================================================== */
(function(){
  'use strict';
  const $   = id => document.getElementById(id);
  const esc = s => (s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const PAL = ['#3D8074','#1A2738','#C2410C','#B91C1C','#7C3AED','#0E7490','#15803D','#A16207'];
  const T = { sections:[], pages:[], curSection:null, curPage:null, timer:null };
  const dateFr = d => d ? d.split('-').reverse().join('/') : '';

  function injectCss(){
    if($('team-css')) return;
    const s=document.createElement('style'); s.id='team-css';
    s.textContent=`
      .team-note-wrap{display:flex;height:calc(100vh - 210px);min-height:500px}
      .team-col{display:flex;flex-direction:column;border-right:1px solid var(--gris-clair);overflow:auto;min-height:0}
      .team-sections{width:215px;background:var(--gris-bg);flex:none}
      .team-pages{width:235px;flex:none}
      .team-editor{flex:1;border-right:none}
      .team-sec,.team-page{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--gris-clair);font-size:.9rem}
      .team-sec .dot{width:6px;height:22px;border-radius:3px;background:var(--c);flex:none}
      .team-sec .lbl,.team-page .lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--noir)}
      .team-page .lbl small{display:block;font-weight:500;font-size:.72rem;color:var(--gris-fonce)}
      .team-sec.on{background:#fff;box-shadow:inset 4px 0 0 var(--c)}
      .team-page.on{background:var(--gris-bg);box-shadow:inset 4px 0 0 var(--teal)}
      .team-sec .mini,.team-page .mini{border:none;background:none;color:var(--gris-fonce);cursor:pointer;font-size:.85rem;padding:2px 5px;border-radius:4px;opacity:.5}
      .team-sec .mini:hover,.team-page .mini:hover{opacity:1;background:rgba(0,0,0,.07)}
      .team-add{margin:10px;padding:8px;border:1px dashed var(--teal-light);background:#fff;color:var(--teal-dark);border-radius:8px;cursor:pointer;font-weight:600;font-size:.85rem;flex:none}
      .team-empty{color:var(--gris-fonce);font-style:italic;font-size:.85rem;padding:16px;text-align:center}
      #team-editor-wrap{display:flex;flex-direction:column;flex:1;min-height:0}
      .team-page-title{display:flex;align-items:center;gap:14px;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--gris-clair)}
      .team-page-title .ttl{font-size:1.05rem;font-weight:700;color:var(--bleu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .team-date{font-size:.85rem;color:var(--gris-fonce);font-weight:600;display:flex;align-items:center;gap:6px;flex:none}
      .team-date input{border:1px solid var(--gris-clair);border-radius:6px;padding:5px 8px;font:inherit;cursor:pointer;color:var(--teal-dark)}
      .team-tb{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--gris-clair);background:var(--gris-bg)}
      .team-tb button{border:1px solid var(--gris-clair);background:#fff;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:.85rem}
      .team-tb button:hover{background:var(--gris-bg)}
      .team-save{margin-left:auto;font-size:.75rem;color:var(--gris-fonce)}
      .team-ed{flex:1;padding:18px 22px;overflow:auto;outline:none;font-size:.95rem;line-height:1.6;color:var(--noir)}
      .team-ed h3{color:var(--teal-dark);margin:.6em 0 .3em}`;
    document.head.appendChild(s);
  }

  /* ---------------- données ---------------- */
  async function loadSections(){
    const { data } = await sb.from('team_sections').select('*').order('ordre').order('created_at');
    T.sections = data||[];
  }
  async function loadPages(sectionId){
    if(!sectionId){ T.pages=[]; return; }
    const { data } = await sb.from('team_pages').select('id,section_id,titre,date_note,ordre').eq('section_id',sectionId).order('ordre').order('created_at');
    T.pages = data||[];
  }

  /* ---------------- vue principale ---------------- */
  async function vue(){
    injectCss();
    const c = $('content'); if(!c) return;
    c.innerHTML = '<div class="loading">Chargement…</div>';
    await loadSections();
    if(!T.curSection && T.sections.length) T.curSection = T.sections[0].id;
    if(T.curSection) await loadPages(T.curSection);
    if((!T.curPage || !T.pages.some(p=>p.id===T.curPage)) && T.pages.length) T.curPage = T.pages[0].id;
    c.innerHTML = `
      <div class="panel">
        <div class="panel-h"><h3>🗒️ Notes de l'équipe</h3></div>
        <div class="team-note-wrap">
          <div class="team-col team-sections">
            <div id="team-sec-list" style="flex:1"></div>
            <button class="team-add" onclick="GTEC_TEAMS.addSection()">＋ Section</button>
          </div>
          <div class="team-col team-pages">
            <div id="team-page-list" style="flex:1"></div>
            <button class="team-add" onclick="GTEC_TEAMS.addPage()">＋ Page</button>
          </div>
          <div class="team-col team-editor"><div id="team-editor-wrap"></div></div>
        </div>
      </div>`;
    renderSections(); renderPages(); await renderEditor();
  }

  /* ---------------- sections ---------------- */
  function renderSections(){
    if(!$('team-sec-list')) return;
    $('team-sec-list').innerHTML = T.sections.length ? T.sections.map(s=>`
      <div class="team-sec${s.id===T.curSection?' on':''}" style="--c:${s.couleur||'#3D8074'}" onclick="GTEC_TEAMS.selSection('${s.id}')">
        <span class="dot"></span><span class="lbl">${esc(s.nom)}</span>
        <button class="mini" title="Renommer" onclick="event.stopPropagation();GTEC_TEAMS.renSection('${s.id}')">✎</button>
        <button class="mini" title="Supprimer" onclick="event.stopPropagation();GTEC_TEAMS.delSection('${s.id}')">×</button>
      </div>`).join('') : '<div class="team-empty">Aucune section.<br>Créez-en une ci-dessous.</div>';
  }
  async function addSection(){
    const nom = prompt('Nom de la section :'); if(nom==null || !nom.trim()) return;
    const couleur = PAL[T.sections.length % PAL.length];
    const { data, error } = await sb.from('team_sections').insert({nom:nom.trim(),couleur,ordre:T.sections.length}).select('id').single();
    if(error){ alert('Erreur : '+error.message); return; }
    await loadSections(); T.curSection = data?data.id:T.curSection;
    await loadPages(T.curSection); T.curPage = T.pages[0]?T.pages[0].id:null;
    renderSections(); renderPages(); await renderEditor();
  }
  async function renSection(id){
    const s=T.sections.find(x=>x.id===id); const nom=prompt('Renommer la section :', s?s.nom:''); if(nom==null||!nom.trim()) return;
    await sb.from('team_sections').update({nom:nom.trim()}).eq('id',id); await loadSections(); renderSections();
  }
  async function delSection(id){
    if(!confirm('Supprimer cette section et TOUTES ses pages ?')) return;
    await sb.from('team_sections').delete().eq('id',id);
    if(T.curSection===id){ T.curSection=null; T.curPage=null; T.pages=[]; }
    await loadSections();
    if(!T.curSection && T.sections.length){ T.curSection=T.sections[0].id; await loadPages(T.curSection); T.curPage=T.pages[0]?T.pages[0].id:null; }
    renderSections(); renderPages(); await renderEditor();
  }
  async function selSection(id){
    if(T.curSection!==id) await saveNote();
    T.curSection=id; await loadPages(id); T.curPage=T.pages[0]?T.pages[0].id:null;
    renderSections(); renderPages(); await renderEditor();
  }

  /* ---------------- pages ---------------- */
  function renderPages(){
    if(!$('team-page-list')) return;
    if(!T.curSection){ $('team-page-list').innerHTML='<div class="team-empty">Sélectionnez une section.</div>'; return; }
    $('team-page-list').innerHTML = T.pages.length ? T.pages.map(p=>`
      <div class="team-page${p.id===T.curPage?' on':''}" onclick="GTEC_TEAMS.selPage('${p.id}')">
        <span class="lbl">${esc(p.titre||'Sans titre')}${p.date_note?`<small>${esc(dateFr(p.date_note))}</small>`:''}</span>
        <button class="mini" title="Renommer" onclick="event.stopPropagation();GTEC_TEAMS.renPage('${p.id}')">✎</button>
        <button class="mini" title="Supprimer" onclick="event.stopPropagation();GTEC_TEAMS.delPage('${p.id}')">×</button>
      </div>`).join('') : '<div class="team-empty">Aucune page.<br>Créez-en une ci-dessous.</div>';
  }
  async function addPage(){
    if(!T.curSection){ alert('Créez d’abord une section.'); return; }
    const titre = prompt('Titre de la page :'); if(titre==null || !titre.trim()) return;
    const { data, error } = await sb.from('team_pages').insert({section_id:T.curSection, titre:titre.trim(), contenu:'', ordre:T.pages.length}).select('id').single();
    if(error){ alert('Erreur : '+error.message); return; }
    await loadPages(T.curSection); T.curPage = data?data.id:T.curPage;
    renderPages(); await renderEditor();
  }
  async function selPage(id){
    if(T.curPage!==id) await saveNote();
    T.curPage=id; renderPages(); await renderEditor();
  }
  async function renPage(id){
    const p=T.pages.find(x=>x.id===id); const t=prompt('Renommer la page :', p?p.titre:''); if(t==null||!t.trim()) return;
    await sb.from('team_pages').update({titre:t.trim()}).eq('id',id); await loadPages(T.curSection); renderPages(); await renderEditor();
  }
  async function delPage(id){
    if(!confirm('Supprimer cette page ?')) return;
    await sb.from('team_pages').delete().eq('id',id);
    if(T.curPage===id) T.curPage=null;
    await loadPages(T.curSection); if(!T.curPage && T.pages.length) T.curPage=T.pages[0].id;
    renderPages(); await renderEditor();
  }

  /* ---------------- éditeur de notes ---------------- */
  async function renderEditor(){
    const w = $('team-editor-wrap'); if(!w) return;
    if(!T.curPage){
      w.innerHTML = '<div class="team-empty" style="margin:auto">Sélectionnez ou créez une page pour prendre des notes.</div>';
      return;
    }
    const { data:page } = await sb.from('team_pages').select('*').eq('id',T.curPage).single();
    const dval = page&&page.date_note ? page.date_note : '';
    w.innerHTML = `
      <div class="team-page-title">
        <span class="ttl">${esc(page&&page.titre||'Sans titre')}</span>
        <label class="team-date">📅 Date : <input type="date" value="${dval}" onchange="GTEC_TEAMS.setDate(this.value)"></label>
      </div>
      <div class="team-tb">
        <button title="Gras" onclick="GTEC_TEAMS.fmt('bold')"><b>G</b></button>
        <button title="Italique" onclick="GTEC_TEAMS.fmt('italic')"><i>I</i></button>
        <button title="Souligné" onclick="GTEC_TEAMS.fmt('underline')"><u>S</u></button>
        <button title="Liste à puces" onclick="GTEC_TEAMS.fmt('insertUnorderedList')">• Liste</button>
        <button title="Titre" onclick="GTEC_TEAMS.fmt('formatBlock','H3')">Titre</button>
        <span id="team-save-state" class="team-save">enregistré</span>
      </div>
      <div id="team-editor" class="team-ed" contenteditable="true" oninput="GTEC_TEAMS.onInput()">${page&&page.contenu?page.contenu:''}</div>`;
  }
  function fmt(cmd,val){ document.execCommand(cmd,false,val||null); const e=$('team-editor'); if(e) e.focus(); onInput(); }
  function onInput(){ const st=$('team-save-state'); if(st) st.textContent='enregistrement…'; clearTimeout(T.timer); T.timer=setTimeout(saveNote,800); }
  async function saveNote(){
    if(!T.curPage) return;
    const ed = $('team-editor'); if(!ed) return;
    try{
      await sb.from('team_pages').update({contenu:ed.innerHTML, updated_at:new Date().toISOString()}).eq('id',T.curPage);
      const st=$('team-save-state'); if(st) st.textContent='enregistré';
    }catch(e){ const st=$('team-save-state'); if(st) st.textContent='échec d’enregistrement'; }
  }
  async function setDate(v){
    if(!T.curPage) return;
    await sb.from('team_pages').update({date_note: v||null}).eq('id',T.curPage);
    const p=T.pages.find(x=>x.id===T.curPage); if(p){ p.date_note=v||null; renderPages(); }
  }

  window.vueTeams = vue;
  window.GTEC_TEAMS = { vue, addSection, renSection, delSection, selSection,
    addPage, selPage, renPage, delPage, fmt, onInput, setDate };
})();
