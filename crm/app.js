/* ============ icônes (SVG inline, style trait) ============ */
const P={
 home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
 building:'<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
 users:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.2a3.2 3.2 0 010 6M18 14.4c1.8.8 3 2.6 3 5.6"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
 check:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
 file:'<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', bell:'<path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 21a2 2 0 004 0"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 chat:'<path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z"/>',
 edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
 dots:'<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
 down:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
 filter:'<path d="M3 5h18l-7 8v6l-4-2v-4z"/>', tag:'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
 chevL:'<path d="M15 5l-7 7 7 7"/>', ok:'<path d="M5 12l5 5 9-10"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 link:'<path d="M10 14a4 4 0 005.6 0l3-3a4 4 0 00-5.6-5.6l-1 1"/><path d="M14 10a4 4 0 00-5.6 0l-3 3a4 4 0 005.6 5.6l1-1"/>',
 merge:'<path d="M6 3v6a6 6 0 006 6h6M18 15l-3-3M18 15l-3 3"/>', archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
 note:'<path d="M5 4h14v12l-5 5H5z"/><path d="M14 21v-5h5M8 9h8M8 13h4"/>', calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'
};
const ic=(n,s)=>`<svg viewBox="0 0 24 24"${s?` style="width:${s}px;height:${s}px"`:''}>${P[n]||''}</svg>`;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ============ données + état local (rien n'est envoyé nulle part) ============ */
const D=window.DATA;const ME=window.ME||{agent:'?'};
/* LS / SV : fournis par la page (index.html) → base Supabase */
let edits=LS('edits',{}), newC=LS('newc',[]), tasks=LS('tasks',[]), notes=LS('notes',[]), nedits=LS('nedits',{}), newO=LS('newo',[]), newD=LS('newd',[]);
D.o0=D.offres.slice(); D.d0=D.demandes.slice();
let oedits=LS('oedits',{}), dedits=LS('dedits',{}), props=LS('props',[]), files=LS('files',[]);
/* statuts d'un bien (cliquables sur la fiche) ; les anciennes valeurs sont converties à la lecture */
const BSTAT=[['attente','En attente'],['marche','Sur le marché'],['sous_offre','Sous offre'],['compromis','Sous compromis'],['vendu_loue','Vendu / loué'],['archive','Archivé']];
const statB=o=>({disponible:'marche',sous_compromis:'compromis',retire:'archive'}[o.statut]||o.statut||'marche');
const DSTEPS=['Reçue','Recherche','Propositions','Visite','Conclue'];
const PETATS=[['envoyee','Envoyée'],['visite_prevue','Visite prévue'],['visite_faite','Visite faite'],['interesse','Intéressé'],['refus','Refus'],['conclu','Conclu']];
/* les modifications (statut, édition, suppression) se superposent aux données d'origine, sans les altérer */
function refreshData(){const ov=(x,E)=>Object.assign({},x,E[x.id]||{});
  D.offres=[...newO,...D.o0].map(o=>ov(o,oedits)).filter(o=>!o.del);D.demandes=[...newD,...D.d0].map(d=>ov(d,dedits)).filter(d=>!d.del)}
refreshData();
const ETAPES=['À contacter','Contacté','Échange en cours','RDV','Client'];
const TYPES=['Enseigne','Entreprise locale','Preneur','Propriétaire','Développeur','Franchisé','Prestataire','Autre'];
const TYPEC={'Enseigne':'c-or','Entreprise locale':'c-bleu','Preneur':'c-teal','Propriétaire':'c-vert','Développeur':'c-gris','Franchisé':'c-gris','Prestataire':'c-gris','Autre':'c-gris'};
const COL=['#006962','#C68F3D','#2F5DA8','#8A4FA8','#2E8B57','#B5533C','#4A5A5E'];
const TL={location:'Location',vente:'Vente'};
const BL={bureaux:'Bureaux',local_commercial:'Local commercial',entrepot_logistique:'Entrepôt',activite:'Activité',fonds_de_commerce:'Fonds de commerce',terrain:'Terrain',invest:'Invest'};
const euro=n=>n==null?'—':new Intl.NumberFormat('fr-FR').format(Math.round(n))+' €';
const fdate=d=>d?new Date(d).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}):'—';
const today=()=>new Date().toISOString().slice(0,10);
const allContacts=()=>[...newC,...D.contacts].map(c=>Object.assign({},c,edits[c.id]||{})).filter(c=>!c.archive).sort((a,b)=>String(b.created||'').localeCompare(String(a.created||''))||String(a.nom).localeCompare(String(b.nom)));
const getC=id=>allContacts().find(c=>c.id===id);
const ini=n=>(n||'?').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const colOf=id=>COL[[...String(id)].reduce((a,c)=>a+c.charCodeAt(0),0)%COL.length];
const stLabel=c=>c.etape===-1?'Sans suite':ETAPES[c.etape]||'—';
const stChip=c=>c.etape===-1?'c-rouge':c.etape>=3?'c-vert':c.etape===0?'c-gris':'c-or';
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),2200)};
const demoMsg=n=>toast(n+' — pas encore disponible');

/* rapprochement offre <-> demande (règles simples, à affiner) */
function score(d,o){
  let s=0,max=0;
  max++; if((d.types_bien||[]).includes(o.type_bien)) s++;
  max++; { const dt=(d.transaction==='achat'||d.transaction==='cession')?'vente':d.transaction; if(dt==='les_deux'||o.transaction==='les_deux'||dt===o.transaction) s++; }
  if(d.surface_min_m2!=null||d.surface_max_m2!=null){max++; const lo=(d.surface_min_m2??0)*.85, hi=(d.surface_max_m2??1e9)*1.15; if(o.surface_m2>=lo&&o.surface_m2<=hi) s++;}
  if(d.budget_max!=null){max++; if((o.loyer_annuel_m2??0)<=d.budget_max*1.1) s++;}
  return {s,max,pct:Math.round(s/max*100)};
}
const demandesDe=cid=>D.demandes.filter(d=>d.client_id===cid);
const offresDe=cid=>D.offres.filter(o=>o.client_id===cid);
const tachesDe=cid=>tasks.filter(t=>t.contact===cid);
notes.forEach((n,i)=>{if(!n.id)n.id='n'+Date.now()+'-'+i});D.echanges.forEach((e,i)=>{e.id='e'+i});
const echAppl=e=>Object.assign({},e,nedits[e.id]||{});
const echDe=cid=>[...notes.filter(n=>n.contact===cid),...D.echanges.filter(e=>e.contact===cid)].map(echAppl).filter(e=>!e.del).sort((a,b)=>b.date.localeCompare(a.date));

/* ============ routage ============ */
const NAV=[['accueil','Accueil','home'],['biens','Biens','building'],['demandes','Demandes','search'],['contacts','Contacts','users'],['suivi','Suivi','check'],['documents','Documents','file']];
const TABS={biens:['Offres','Estimations','Prospection locaux','Gestion'],contacts:['Tous','Enseignes','Entreprises locales','Preneurs','Propriétaires'],demandes:['Actives','Archivées'],suivi:['Tâches','Agenda'],accueil:[],documents:[],parametres:[]};
let S={bf:{q:'',statut:'actifs',type:'',ville:'',agent:''},df:{q:'',statut:'actives',type:'',urgence:'',agent:''},contactSel:null,bienSel:null,demSel:null,fq:'',ftype:'',fetape:'',fsoc:'',fagent:'',fcat:'',ftemp:'',frel:'',tab:{},sel:new Set(),edit:false,taskf:'todo'};
function go(h){location.hash=h}
function route(){
  const [,page='accueil',id]=location.hash.split('/');
  if(page==='contacts'&&id) S.contactSel=decodeURIComponent(id);
  if(page==='biens'&&id) S.bienSel=decodeURIComponent(id);
  if(page==='demandes'&&id) S.demSel=decodeURIComponent(id);
  renderNav(page); renderTabs(page); (VIEWS[page]||VIEWS.accueil)();
  $('#view').scrollTop=0;
}
function lateCount(){const t=today();return allContacts().filter(c=>c.relance&&c.relance<=t).length+tasks.filter(x=>!x.done&&x.date<=t).length}
function renderNav(cur){
  const late=lateCount();
  $('#nav').innerHTML=NAV.map(([k,l,i])=>`<a href="#/${k}" class="${k===cur?'on':''}">${ic(i)}<span class="lbl">${l}</span>${k==='suivi'&&late?`<span class="badge">${late}</span>`:''}</a>`).join('');
  $('#beldot').style.display=late?'block':'none';
}
function renderTabs(page){
  const t=TABS[page]||[]; const cur=S.tab[page]||0;
  $('#tabs').innerHTML=t.map((x,i)=>{
    const live=(page==='contacts')||(page==='biens'&&i===0)||(page==='demandes'&&i===0)||(page==='suivi'&&i===0);
    return `<a href="javascript:void(0)" class="${i===cur?'on':''} ${live?'':'off'}" onclick="${live?`setTab('${page}',${i})`:`demoMsg('Onglet « ${x} »')`}">${x}</a>`}).join('');
}
function setTab(p,i){S.tab[p]=i; if(p==='contacts'){S.ftype=['','Enseigne','Entreprise locale','Preneur','Propriétaire'][i]; S.sel.clear()} route()}

/* ============ vues ============ */
const VIEWS={};
const kv=(k,v,extra='')=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span><span>${extra}</span></div>`;

/* ---- Accueil ---- */
VIEWS.accueil=()=>{
  const cs=allContacts(), t=today();
  const aContacter=cs.filter(c=>c.etape===0).length;
  const relances=cs.filter(c=>c.relance&&c.relance<=t);
  const tk=tasks.filter(x=>!x.done&&x.date<=t);
  const matches=[]; D.demandes.forEach(d=>D.offres.forEach(o=>{const m=score(d,o); if(m.pct>=75) matches.push({d,o,m})}));
  matches.sort((a,b)=>b.m.pct-a.m.pct);
  const feed=[...notes,...D.echanges].map(echAppl).filter(e=>!e.del).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6);
  $('#view').innerHTML=`
  <div class="ph"><h1>Bonjour 👋</h1></div>
  <div class="kpis">
    <div class="card kpi" onclick="go('#/biens')"><b>${D.offres.length}</b><span>Offres disponibles</span></div>
    <div class="card kpi" onclick="go('#/demandes')"><b>${D.demandes.length}</b><span>Demandes actives</span></div>
    <div class="card kpi" onclick="S.fetape='0';S.ftype='';go('#/contacts')"><b>${aContacter}</b><span>Contacts à contacter</span></div>
    <div class="card kpi" onclick="go('#/suivi')"><b>${relances.length+tk.length}</b><span>À faire aujourd'hui / en retard</span></div>
  </div>
  <div class="grid2">
    <div class="card"><h3>${ic('check',15)} À faire aujourd'hui</h3>
      ${[...tk.map(x=>`<div class="li" onclick="go('#/suivi')">${ic('calendar',16)}<b>${esc(x.titre)}</b><span class="sp">${fdate(x.date)}</span></div>`),
         ...relances.map(c=>`<div class="li" onclick="go('#/contacts/${c.id}')">${ic('phone',16)}<b>Relancer ${esc(c.nom)}</b><small>${esc(c.societe||'')}</small><span class="sp">${fdate(c.relance)}</span></div>`)].join('')
       ||`<div class="empty"><b>Rien d'urgent 🎉</b>Aucune relance ni tâche en retard.</div>`}
    </div>
    <div class="card"><h3>${ic('link',15)} Rapprochements demandes ↔ offres</h3>
      ${matches.slice(0,6).map(x=>`<div class="li" onclick="go('#/demandes/${x.d.id}')"><b>${esc(x.d.reference)}</b> ↔ <b>${esc(x.o.reference)}</b><small>${esc(x.o.ville)} · ${x.o.surface_m2} m²</small><span class="sp match"><span class="bar"><i style="width:${x.m.pct}%"></i></span>${x.m.pct}%</span></div>`).join('')||`<div class="empty"><b>Aucun rapprochement</b></div>`}
    </div>
  </div>
  <div class="card" style="margin-top:16px"><h3>${ic('clock',15)} Activité récente</h3>
    ${feed.map(e=>{const c=getC(e.contact);return `<div class="li" onclick="go('#/contacts/${e.contact}')">${ic(e.type==='appel'?'phone':e.type==='email'?'mail':'note',16)}<span><b>${esc(c?c.nom:'Contact')}</b> — ${esc(e.texte||e.type)}</span><span class="sp">${fdate(e.date)}</span></div>`}).join('')}
  </div>`;
};

/* ---- Contacts ---- */
function filteredContacts(){
  const q=S.fq.toLowerCase();
  return allContacts().filter(c=>
    (!q||[c.nom,c.societe,c.email,c.poste].join(' ').toLowerCase().includes(q))&&
    (!S.ftype||c.type===S.ftype)&&(S.fetape===''||String(c.etape)===S.fetape)&&
    (!S.fsoc||(c.societe||'')===S.fsoc)&&(!S.fagent||c.agent===S.fagent)&&
    (!S.fcat||c.categorie===S.fcat)&&(!S.ftemp||c.temp===S.ftemp)&&(!S.frel||(c.relance&&c.relance<=today())));
}
VIEWS.contacts=()=>{
  const all=allContacts(); const list=filteredContacts();
  if(!S.contactSel||!list.find(c=>c.id===S.contactSel)) S.contactSel=list[0]?.id||null;
  const socs=[...new Set(all.map(c=>c.societe).filter(Boolean))].sort();
  const nbSoc={}; all.forEach(c=>{if(c.societe)nbSoc[c.societe]=(nbSoc[c.societe]||0)+1});
  $('#view').innerHTML=`
  <div class="ph"><h1>Contacts</h1><div class="sp"><button class="btn sec" onclick="exportCSV()">${ic('down',16)}Exporter</button><button class="btn pri" onclick="openNew('contact')">${ic('plus',16)}Nouveau contact</button></div></div>
  <div class="filters">
    <label>Recherche<input id="fq" value="${esc(S.fq)}" placeholder="Nom, société, e-mail…" oninput="S.fq=this.value;lst()"></label>
    <label>Type<select onchange="S.ftype=this.value;S.tab.contacts=0;route()"><option value="">Tous</option>${TYPES.map(t=>`<option ${S.ftype===t?'selected':''}>${t}</option>`).join('')}</select></label>
    <label>Étape<select onchange="S.fetape=this.value;route()"><option value="">Toutes</option>${ETAPES.map((e,i)=>`<option value="${i}" ${S.fetape===String(i)?'selected':''}>${e}</option>`).join('')}<option value="-1" ${S.fetape==='-1'?'selected':''}>Sans suite</option></select></label>
    <label>Société / enseigne<select onchange="S.fsoc=this.value;route()"><option value="">Toutes (${socs.length})</option>${socs.map(s=>`<option ${S.fsoc===s?'selected':''} value="${esc(s)}">${esc(s)}${nbSoc[s]>1?' ('+nbSoc[s]+')':''}</option>`).join('')}</select></label>
    <button class="btn sec" style="margin-left:auto" onclick="openDrawer()">${ic('filter',16)}Filtres${(S.fcat||S.ftemp||S.frel||S.fagent)?' •':''}</button>
    ${(S.fq||S.ftype||S.fetape!==''||S.fsoc||S.fcat||S.ftemp||S.frel||S.fagent)?`<button class="btn sec" onclick="resetF()">${ic('x',15)}Effacer</button>`:''}
  </div>
  <div class="split">
    <div class="card" id="cl"></div>
    <div id="cf"></div>
  </div>`;
  lst();
};
function lst(){
  const list=filteredContacts();
  const nSel=[...S.sel].filter(id=>list.find(c=>c.id===id)).length;
  $('#cl').innerHTML=`
   <div class="tool"><input type="checkbox" ${list.length&&nSel===list.length?'checked':''} onchange="selAll(this.checked)" style="margin-right:6px">
     <button class="iconbtn" title="Exporter la sélection" onclick="exportCSV(true)">${ic('down',18)}</button>
     <button class="iconbtn" title="Envoyer un e-mail groupé" onclick="demoMsg('E-mail groupé')">${ic('mail',18)}</button>
     <button class="iconbtn" title="Ajouter une étiquette" onclick="demoMsg('Étiquette')">${ic('tag',18)}</button>
     <button class="iconbtn" title="Assigner à un collaborateur" onclick="demoMsg('Assigner')">${ic('user',18)}</button>
     <button class="iconbtn" title="Archiver la sélection" onclick="bulkArchive()">${ic('archive',18)}</button>
     <span class="cnt">${nSel?nSel+' sélectionné(s) · ':''}${list.length} contact${list.length>1?'s':''}</span></div>
   <div class="rows">${list.map(c=>`
     <div class="row ${c.id===S.contactSel?'sel':''}" onclick="pickC('${c.id}')">
       <input type="checkbox" ${S.sel.has(c.id)?'checked':''} onclick="event.stopPropagation()" onchange="togSel('${c.id}',this.checked)">
       <span class="ini" style="background:${colOf(c.id)}">${ini(c.nom)}</span>
       <div><div class="nm">${esc(c.nom)}</div><div class="sub">${esc([c.poste,c.societe].filter(Boolean).join(' · ')||'—')}</div></div>
       <div class="r"><span class="chip ${TYPEC[c.type]||'c-gris'}">${esc(c.type)}</span><span class="chip ${stChip(c)}">${stLabel(c)}</span></div>
     </div>`).join('')||`<div class="empty"><b>Aucun contact</b>Essayez de réduire le nombre de critères.</div>`}</div>`;
  fiche();
}
function pickC(id){S.contactSel=id;S.edit=false;history.replaceState(null,'','#/contacts/'+id);lst()}
function togSel(id,v){v?S.sel.add(id):S.sel.delete(id);lst()}
function selAll(v){filteredContacts().forEach(c=>v?S.sel.add(c.id):S.sel.delete(c.id));lst()}
function resetF(){S.fq=S.ftype=S.fetape=S.fsoc=S.fcat=S.ftemp=S.frel=S.fagent='';S.tab.contacts=0;route()}
function bulkArchive(){const ids=[...S.sel];if(!ids.length)return toast('Sélectionne au moins un contact');ids.forEach(id=>{edits[id]={...(edits[id]||{}),archive:true}});SV('edits',edits);S.sel.clear();toast(ids.length+' contact(s) archivé(s)');route()}
function exportCSV(onlySel){
  let list=filteredContacts(); if(onlySel&&S.sel.size) list=list.filter(c=>S.sel.has(c.id));
  const cols=['nom','societe','poste','type','email','tel','agent'];
  const csv=[cols.join(';'),...list.map(c=>cols.map(k=>'"'+String(c[k]??'').replace(/"/g,'""')+'"').join(';'))].join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));a.download='contacts-h3c.csv';a.click();toast(list.length+' contacts exportés');
}
function fiche(){
  const c=getC(S.contactSel); const box=$('#cf'); if(!box) return;
  if(!c){box.innerHTML=`<div class="card"><div class="empty"><b>Sélectionnez un contact</b>pour voir sa fiche.</div></div>`;return}
  const e=S.edit, dem=demandesDe(c.id), off=offresDe(c.id), tk=tachesDe(c.id), ech=echDe(c.id);
  const fld=(k,key,type)=>e?(type==='sel'?`<div class="kv"><span class="k">${k}</span><select id="e-${key}">${TYPES.map(t=>`<option ${c[key]===t?'selected':''}>${t}</option>`).join('')}</select><span></span></div>`
     :`<div class="kv"><span class="k">${k}</span><input id="e-${key}" value="${esc(c[key]||'')}"><span></span></div>`)
     :kv(k,esc(c[key]||'—'),key==='tel'&&c.tel?`<span class="acts"><a href="tel:${esc(c.tel)}" title="Appeler">${ic('phone',16)}</a><a href="https://wa.me/${esc((c.tel||'').replace(/\D/g,''))}" target="_blank" title="WhatsApp">${ic('chat',16)}</a></span>`:key==='email'&&c.email?`<span class="acts"><a href="mailto:${esc(c.email)}" title="Écrire">${ic('mail',16)}</a></span>`:'');
  const steps=ETAPES.map((s,i)=>`<div class="st ${c.etape>=0&&i<c.etape?'done':''} ${i===c.etape?'cur':''}" onclick="setEtape(${i})"><i>${c.etape>=0&&i<c.etape?ic('ok'):''}</i>${s}</div>`).join('');
  box.innerHTML=`
  <div class="card">
    <div class="fh"><span class="ini" style="background:${colOf(c.id)};width:46px;height:46px;font-size:15px">${ini(c.nom)}</span>
      <div><h2>${esc(c.nom)}</h2><div class="sub">${esc([c.poste,c.societe].filter(Boolean).join(' · ')||'—')}</div></div>
      <div class="sp">
        ${e?`<button class="btn pri" onclick="saveEdit()">${ic('ok',16)}Enregistrer</button><button class="btn sec" onclick="S.edit=false;fiche()">Annuler</button>`
          :`<button class="iconbtn" title="Modifier" onclick="S.edit=true;fiche()">${ic('edit',18)}</button>
            <button class="btn pri" id="actbtn">Actions ${ic('dots',16)}</button>
            <div class="menu" id="actmenu" style="display:none;top:42px;right:0">
              <button onclick="S.edit=true;fiche()">${ic('edit',16)}Éditer</button>
              <button onclick="openNew('tache','${c.id}')">${ic('calendar',16)}Planifier une tâche</button>
              <button onclick="document.getElementById('nt').focus()">${ic('note',16)}Ajouter une note</button>
              <button onclick="demoMsg('Partage par e-mail')">${ic('mail',16)}Partager par e-mail</button>
              <button onclick="demoMsg('Duplication')">${ic('link',16)}Dupliquer</button>
              <button onclick="demoMsg('Fusion de doublons')">${ic('merge',16)}Fusionner avec…</button>
              <div class="sep"></div>
              <button class="dng" onclick="archiveC('${c.id}')">${ic('archive',16)}Archiver</button>
            </div>`}
      </div></div>
    <div class="stepper">${steps}</div>
    ${c.etape===-1?`<div style="padding:0 16px 12px"><span class="chip c-rouge">Sans suite</span> <a href="javascript:void(0)" style="color:var(--teal);font-weight:600;font-size:12.5px" onclick="setEtape(0)">Réactiver</a></div>`:`<div style="padding:0 16px 12px"><a href="javascript:void(0)" style="color:var(--gris);font-size:12px" onclick="setEtape(-1)">Marquer « sans suite »</a></div>`}
  </div>
  <div class="card" style="margin-top:14px"><h3>${ic('user',15)} Coordonnées</h3><div class="cb">
    ${fld('Nom','nom')}${fld('Société / enseigne','societe')}${fld('Fonction','poste')}${fld('Type','type','sel')}${fld('E-mail','email')}${fld('Téléphone','tel')}
    ${kv('Suivi par',esc(c.agent||'—'))}${kv('Créé le',fdate(c.created))}${kv('Origine',esc(c.src==='clients'?'Carnet clients':c.src==='enseigne_contacts'?'Base enseignes':c.src==='entreprise_locale_contacts'?'Entreprises locales':'Saisie maquette'))}
  </div></div>
  <div class="card" style="margin-top:14px"><h3>${ic('link',15)} Éléments associés</h3>
    <div class="assoc">
      <button class="${dem.length?'':'z'}" onclick="${dem.length?`go('#/demandes/${dem[0].id}')`:`openWizard('demande',{client_id:'${c.id}'})`}"><b>${dem.length}</b><span>Demandes</span></button>
      <button class="${off.length?'':'z'}" onclick="${off.length?`go('#/biens/${off[0].id}')`:`openWizard('offre',{client_id:'${c.id}'})`}"><b>${off.length}</b><span>Offres</span></button>
      <button class="${tk.length?'':'z'}" onclick="openNew('tache','${c.id}')"><b>${tk.length}</b><span>Tâches</span></button>
      <button class="${ech.length?'':'z'}" onclick="document.getElementById('nt').focus()"><b>${ech.length}</b><span>Échanges</span></button>
      <button class="z" onclick="demoMsg('Documents')"><b>0</b><span>Documents</span></button>
    </div></div>
  <div class="card" style="margin-top:14px"><h3>${ic('clock',15)} Historique</h3>
    <div class="addnote"><select id="nty"><option value="appel">Appel</option><option value="email">E-mail</option><option value="rdv">RDV</option><option value="note">Note</option></select><input id="nt" placeholder="Ajouter une note…" onkeydown="if(event.key==='Enter')addNote()"><button class="btn pri" onclick="addNote()">${ic('plus',15)}</button></div>
    <div class="tl">${ech.map(x=>S.noteEdit===x.id?`<div class="it"><span class="ic">${ic('edit',15)}</span><div><select id="ne-type" style="margin-bottom:6px">${['appel','email','rdv','note'].concat(['appel','email','rdv','note'].includes(x.type)?[]:[x.type]).map(t=>`<option value="${esc(t)}" ${t===x.type?'selected':''}>${esc(t)}</option>`).join('')}</select><textarea id="ne-txt" rows="3" style="width:100%">${esc(x.texte||'')}</textarea><div style="display:flex;gap:8px;margin-top:6px"><button class="btn pri sm" onclick="saveNote('${x.id}')">${ic('ok',14)}Enregistrer</button><button class="btn sec sm" onclick="S.noteEdit=null;fiche()">Annuler</button></div></div></div>`
   :`<div class="it"><span class="ic">${ic(x.type==='appel'?'phone':x.type==='email'?'mail':'note',15)}</span><div><div style="display:flex;gap:8px;align-items:center"><span><b style="text-transform:capitalize">${esc(x.type)}</b> <small>· ${fdate(x.date)}${x.auteur?' · '+esc(x.auteur):''}${x.modif?' · modifié':''}</small></span><span class="sp" style="margin-left:auto;display:flex;gap:4px"><button class="iconbtn" title="Modifier" onclick="S.noteEdit='${x.id}';S.noteDel=null;fiche()">${ic('edit',15)}</button>${S.noteDel===x.id?`<button class="btn sm" style="color:#c0392b" onclick="delNote('${x.id}')">Supprimer ?</button><button class="btn sec sm" onclick="S.noteDel=null;fiche()">Non</button>`:`<button class="iconbtn" title="Supprimer" onclick="S.noteDel='${x.id}';fiche()">${ic('x',15)}</button>`}</span></div><div style="white-space:pre-wrap">${esc(x.texte||'')}</div></div></div>`).join('')||`<div class="empty" style="padding:14px"><b>Aucun échange</b>Ajoutez le premier ci-dessus.</div>`}</div>
  </div>
  ${e?`<div class="card" style="margin-top:14px"><h3>${ic('note',15)} Notes</h3><div class="cb" style="padding-top:12px"><textarea id="e-notes" rows="4" style="width:100%">${esc(c.notes||'')}</textarea></div></div>`:c.notes?`<div class="card" style="margin-top:14px"><h3 style="display:flex;align-items:center">${ic('note',15)} Notes<button class="iconbtn" style="margin-left:auto" title="Modifier" onclick="S.edit=true;fiche()">${ic('edit',15)}</button></h3><div class="cb" style="padding-top:12px;white-space:pre-wrap">${esc(c.notes)}</div></div>`:''}`;
  const ab=$('#actbtn'); if(ab) ab.onclick=ev=>{ev.stopPropagation();const m=$('#actmenu');m.style.display=m.style.display==='none'?'block':'none'};
}
function saveNote(id){const t=($('#ne-txt').value||'').trim();if(!t)return toast('Le texte est vide');nedits[id]={...(nedits[id]||{}),texte:t,type:$('#ne-type').value,modif:true};SV('nedits',nedits);S.noteEdit=null;toast('Note modifiée');lst()}
function delNote(id){nedits[id]={...(nedits[id]||{}),del:true};SV('nedits',nedits);S.noteDel=null;toast('Note supprimée');lst()}
function setEtape(i){const c=getC(S.contactSel);edits[c.id]={...(edits[c.id]||{}),etape:i,statut:i===-1?'sans_suite':c.statut};SV('edits',edits);toast('Étape : '+(i===-1?'Sans suite':ETAPES[i]));lst()}
function saveEdit(){const id=S.contactSel;const o={};['nom','societe','poste','type','email','tel','notes'].forEach(k=>{const el=$('#e-'+k);if(el)o[k]=el.value.trim()||null});edits[id]={...(edits[id]||{}),...o};SV('edits',edits);S.edit=false;toast('Fiche enregistrée');lst()}
function archiveC(id){edits[id]={...(edits[id]||{}),archive:true};SV('edits',edits);toast('Contact archivé');S.contactSel=null;route()}
function addNote(){const t=$('#nt').value.trim();if(!t)return;notes.unshift({id:'n'+Date.now(),contact:S.contactSel,date:today(),type:$('#nty').value,texte:t,auteur:ME.agent});SV('notes',notes);toast('Échange ajouté');lst()}

/* ---- Biens ---- */
const okB=o=>{const f=S.bf,q=f.q.trim().toLowerCase(),st=statB(o);return (!q||[o.reference,o.ville,o.adresse,o.titre,o.secteur].join(' ').toLowerCase().includes(q))&&(f.statut==='tous'||(f.statut==='actifs'?st!=='archive':st===f.statut))&&(!f.type||o.type_bien===f.type)&&(!f.ville||o.ville===f.ville)&&(!f.agent||o.agent===f.agent)};
const chipSt=st=>st==='marche'?'':`<span class="chip ${st==='archive'?'c-gris':'c-or'}">${esc((BSTAT.find(b=>b[0]===st)||[0,st])[1])}</span>`;
const rowB=o=>{const nd=D.demandes.filter(d=>d.statut!=='cloturee'&&score(d,o).pct>=75).length;return `<div class="row ${o.id===S.bienSel?'sel':''}" style="grid-template-columns:36px 1fr auto" onclick="S.bienSel='${o.id}';history.replaceState(null,'','#/biens/${o.id}');VIEWS.biens()">
     <span class="ini" style="background:var(--teal);border-radius:8px">${ic('building',17)}</span>
     <div><div class="nm">${esc(o.reference)} · ${esc(BL[o.type_bien]||o.type_bien)}</div><div class="sub">${esc(o.ville)} · ${o.surface_m2} m² · ${esc(o.adresse||'')}</div></div>
     <div class="r"><b style="color:var(--teal-dark)">${euro(o.loyer_annuel_m2||o.prix_vente)}${o.transaction==='location'?'<small style="font-weight:500;color:var(--gris)">/mois</small>':''}</b>${chipSt(statB(o))}${nd?`<span class="chip c-vert">${nd} demande${nd>1?'s':''}</span>`:''}</div></div>`};
function rowsB(){const L=D.offres.filter(okB),e=$('#bl');if(!e)return;$('#bcnt').textContent=L.length+' offre'+(L.length>1?'s':'')+(L.length!==D.offres.length?' sur '+D.offres.length:'');e.innerHTML=L.map(rowB).join('')||'<div class="empty"><b>Aucune offre</b>Modifiez les filtres.</div>'}
const optL=(arr,cur,all)=>`<option value="">${all}</option>`+arr.map(v=>`<option value="${esc(v[0])}" ${cur===v[0]?'selected':''}>${esc(v[1])}</option>`).join('');
const uniq=(L,k)=>[...new Set(L.map(x=>x[k]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),'fr')).map(v=>[v,v]);
VIEWS.biens=()=>{
  if(!D.offres.find(x=>x.id===S.bienSel)) S.bienSel=(D.offres.filter(okB)[0]||D.offres[0]||{}).id;
  const f=S.bf;
  $('#view').innerHTML=`
  <div class="ph"><h1>Biens</h1><div class="sp"><button class="btn pri" onclick="openWizard('offre')">${ic('plus',16)}Nouvelle offre</button></div></div>
  <div class="split"><div class="card"><div class="tool" style="flex-wrap:wrap;gap:6px;padding:10px 12px">
    <input placeholder="Rechercher (réf., ville, adresse…)" value="${esc(f.q)}" oninput="S.bf.q=this.value;rowsB()" style="flex:1;min-width:160px">
    <select onchange="S.bf.statut=this.value;rowsB()"><option value="actifs" ${f.statut==='actifs'?'selected':''}>Actifs</option><option value="tous" ${f.statut==='tous'?'selected':''}>Tous les statuts</option>${BSTAT.map(([k,l])=>`<option value="${k}" ${f.statut===k?'selected':''}>${l}</option>`).join('')}</select>
    <select onchange="S.bf.type=this.value;rowsB()">${optL(Object.entries(BL),f.type,'Tous types')}</select>
    <select onchange="S.bf.ville=this.value;rowsB()">${optL(uniq(D.offres,'ville'),f.ville,'Toutes villes')}</select>
    <select onchange="S.bf.agent=this.value;rowsB()">${optL(uniq(D.offres,'agent'),f.agent,'Suivi par')}</select>
    <span class="cnt" id="bcnt" style="margin-left:0"></span></div>
   <div id="bl"></div></div>
   <div id="bf"></div></div>`;
  rowsB();
  const o=D.offres.find(x=>x.id===S.bienSel);if(!o){$('#bf').innerHTML='<div class="card"><div class="empty"><b>Aucune offre</b>Créez-en une avec « Nouvelle offre ».</div></div>';return}
const prop=o.client_id?getC(o.client_id):null;
  const comp=D.demandes.filter(d=>d.statut!=='cloturee').map(d=>({d,m:score(d,o)})).filter(x=>x.m.pct>=50).sort((a,b)=>b.m.pct-a.m.pct);
  $('#bf').innerHTML=`
   <div class="card"><div class="fh" style="align-items:flex-start"><div><h2>${esc(o.reference)} — ${esc(o.titre||BL[o.type_bien])}</h2><div class="sub">${esc([o.adresse,[o.code_postal,o.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '))}${o.secteur?' · '+esc(o.secteur):''}</div></div>
     <div class="sp"><button class="btn sec" onclick="editFiche('offre','${o.id}')">${ic('edit',16)}Modifier</button>${S.delB===o.id?`<button class="btn sm" style="color:#c0392b" onclick="delFiche('offre','${o.id}')">Supprimer définitivement ?</button><button class="btn sec sm" onclick="S.delB=null;VIEWS.biens()">Non</button>`:`<button class="btn sec" title="Supprimer" onclick="S.delB='${o.id}';VIEWS.biens()">${ic('x',16)}Supprimer</button>`}<button class="btn sec" title="Lien web du dossier à envoyer au client" onclick="H3C_DOSSIER.publierLien('${o.id}')">${ic('link',16)}Lien client</button><button class="btn pri" title="Aperçu du dossier, à enregistrer en PDF" onclick="H3C_DOSSIER.generer('${o.id}')">${ic('file',16)}Dossier PDF</button></div></div>
     <div class="stepper">${BSTAT.map(([k,l],n)=>{const cur=BSTAT.findIndex(b=>b[0]===statB(o));return `<div class="st ${n<cur?'done':''} ${n===cur?'cur':''}" onclick="setStatB('${o.id}','${k}')"><i>${n<cur?ic('ok'):''}</i>${l}</div>`}).join('')}</div></div>
   <div id="bmedia"></div>
   <div class="card" style="margin-top:14px"><h3>${ic('building',15)} Caractéristiques</h3><div class="cb">
     ${kv('Type',esc(BL[o.type_bien]||o.type_bien))}${kv('Transaction',esc(TL[o.transaction]||o.transaction))}${kv('Surface',o.surface_m2+' m²')}
     ${o.transaction==='location'?kv('Loyer annuel',euro(o.loyer_annuel_m2==null?null:o.loyer_annuel_m2*12)+(o.loyer_type?' '+esc(o.loyer_type):'')+(o.loyer_annuel_m2?` <small style="color:var(--gris)">(${euro(o.loyer_annuel_m2)} / mois)</small>`:'')):kv('Prix',euro(o.prix_vente))}${kv('Charges annuelles',euro(o.charges==null?null:o.charges*12)+(o.charges?` <small style="color:var(--gris)">(${euro(o.charges)} / mois)</small>`:''))}${kv('DPE',esc((o.dpe||'—')+(o.dpe_conso?' · '+o.dpe_conso+' kWh/m²/an':'')))}${kv('Suivi par',esc(o.agent||'—'))}
     ${o.equip&&Object.keys(o.equip).length?kv('Équipements',esc(Object.values(o.equip).flat().join(', '))):''}${kv('Propriétaire',prop?`<a href="#/contacts/${prop.id}" style="color:var(--teal)">${esc(prop.nom)}</a>`:'<span style="color:var(--gris)">À renseigner</span>')}</div></div>
   ${(o.acces&&o.acces.length)||(o.env&&o.env.length)?`<div class="card" style="margin-top:14px"><h3>${ic('link',15)} Accès &amp; environnement</h3><div class="cb">${(o.acces||[]).length?kv('Accès',(o.acces).map(esc).join('<br>')):''}${(o.env||[]).length?kv('À moins de 500 m',(o.env).map(esc).join(', ')):''}</div></div>`:''}
   ${o.description?`<div class="card" style="margin-top:14px"><h3>${ic('note',15)} Description de l'annonce</h3><div class="cb" style="padding-top:12px;white-space:pre-wrap">${esc(o.description)}</div></div>`:''}
   <div class="card" style="margin-top:14px"><h3>${ic('link',15)} Demandes compatibles (${comp.length})</h3>
     ${comp.map(x=>{const c=getC(x.d.client_id);return `<div class="li" onclick="go('#/demandes/${x.d.id}')"><b>${esc(x.d.reference)}</b><small>${esc(c?c.nom:'—')}${c&&c.societe?' · '+esc(c.societe):''}</small><span class="sp match"><span class="bar"><i style="width:${x.m.pct}%"></i></span>${x.m.pct}%</span>${propCell(o.id,x.d.id)}</div>`}).join('')||`<div class="empty"><b>Aucune demande compatible</b></div>`}</div>${propCard('o',o.id)}`;
  renderMedia(o);
};

/* ---- Demandes ---- */
const okD=d=>{const f=S.df,q=f.q.trim().toLowerCase(),c=getC(d.client_id),cl=d.statut==='cloturee';return (!q||[d.reference,c&&c.nom,c&&c.societe,(d.localites||[]).join(' ')].join(' ').toLowerCase().includes(q))&&(f.statut==='toutes'||(f.statut==='actives'?!cl:cl))&&(!f.type||(d.types_bien||[]).includes(f.type))&&(!f.urgence||d.urgence===f.urgence)&&(!f.agent||d.agent===f.agent)};
const rowD=d=>{const c=getC(d.client_id);return `<div class="row ${d.id===S.demSel?'sel':''}" style="grid-template-columns:36px 1fr auto" onclick="S.demSel='${d.id}';history.replaceState(null,'','#/demandes/${d.id}');VIEWS.demandes()">
     <span class="ini" style="background:var(--or);border-radius:8px">${ic('search',17)}</span>
     <div><div class="nm">${esc(d.reference)} · ${esc((d.types_bien||[]).map(t=>BL[t]||t).join(', '))}</div><div class="sub">${esc(c?(c.societe||c.nom):'—')} · ${d.surface_min_m2??'?'}–${d.surface_max_m2??'?'} m²</div></div>
     <div class="r">${d.statut==='cloturee'?'<span class="chip c-gris">Clôturée</span>':`<span class="chip ${d.urgence==='fort'?'c-rouge':d.urgence==='moyen'?'c-or':'c-gris'}">${esc(d.urgence||'—')}</span>`}<small style="color:var(--gris)">${fdate(d.date_demande)}</small></div></div>`};
function rowsD(){const L=D.demandes.filter(okD),e=$('#dl');if(!e)return;$('#dcnt').textContent=L.length+' demande'+(L.length>1?'s':'')+(L.length!==D.demandes.length?' sur '+D.demandes.length:'');e.innerHTML=L.map(rowD).join('')||'<div class="empty"><b>Aucune demande</b>Modifiez les filtres.</div>'}
VIEWS.demandes=()=>{
  if(!D.demandes.find(x=>x.id===S.demSel)) S.demSel=(D.demandes.filter(okD)[0]||D.demandes[0]||{}).id;
  const f=S.df;
  $('#view').innerHTML=`
  <div class="ph"><h1>Demandes</h1><div class="sp"><button class="btn pri" onclick="openWizard('demande')">${ic('plus',16)}Nouvelle demande</button></div></div>
  <div class="split"><div class="card"><div class="tool" style="flex-wrap:wrap;gap:6px;padding:10px 12px">
    <input placeholder="Rechercher (réf., client, ville…)" value="${esc(f.q)}" oninput="S.df.q=this.value;rowsD()" style="flex:1;min-width:160px">
    <select onchange="S.df.statut=this.value;rowsD()"><option value="actives" ${f.statut==='actives'?'selected':''}>Actives</option><option value="cloturees" ${f.statut==='cloturees'?'selected':''}>Clôturées</option><option value="toutes" ${f.statut==='toutes'?'selected':''}>Toutes</option></select>
    <select onchange="S.df.type=this.value;rowsD()">${optL(Object.entries(BL),f.type,'Tous types')}</select>
    <select onchange="S.df.urgence=this.value;rowsD()">${optL([['fort','Fort'],['moyen','Moyen'],['faible','Faible']],f.urgence,'Urgence')}</select>
    <select onchange="S.df.agent=this.value;rowsD()">${optL(uniq(D.demandes,'agent'),f.agent,'Suivi par')}</select>
    <span class="cnt" id="dcnt" style="margin-left:0"></span></div>
   <div id="dl"></div></div>
   <div id="df"></div></div>`;
  rowsD();
  const d=D.demandes.find(x=>x.id===S.demSel);if(!d){$('#df').innerHTML='<div class="card"><div class="empty"><b>Aucune demande</b></div></div>';return}
  const c=getC(d.client_id);
  const comp=D.offres.filter(o=>statB(o)!=='archive').map(o=>({o,m:score(d,o)})).sort((a,b)=>b.m.pct-a.m.pct);
  $('#df').innerHTML=`
   <div class="card"><div class="fh"><div><h2>${esc(d.reference)}</h2><div class="sub">${esc(TL[d.transaction]||d.transaction)} · demandée le ${fdate(d.date_demande)} · suivi ${esc(d.agent||'—')}</div></div><div class="sp"><button class="btn sec" onclick="editFiche('demande','${d.id}')">${ic('edit',16)}Modifier</button><button class="btn sec" onclick="setDStatut('${d.id}','${d.statut==='cloturee'?'active':'cloturee'}')">${d.statut==='cloturee'?'Réactiver':'Clôturer'}</button>${S.delD===d.id?`<button class="btn sm" style="color:#c0392b" onclick="delFiche('demande','${d.id}')">Supprimer définitivement ?</button><button class="btn sec sm" onclick="S.delD=null;VIEWS.demandes()">Non</button>`:`<button class="btn sec" onclick="S.delD='${d.id}';VIEWS.demandes()">${ic('x',16)}Supprimer</button>`}</div></div>
     <div class="stepper">${DSTEPS.map((l,n)=>{const cur=d.etape??1;return `<div class="st ${n<cur?'done':''} ${n===cur?'cur':''}" onclick="setDEtape('${d.id}',${n})"><i>${n<cur?ic('ok'):''}</i>${l}</div>`}).join('')}</div></div>
   <div class="card" style="margin-top:14px"><h3>${ic('search',15)} Critères</h3><div class="cb">
     ${kv('Type de bien',esc((d.types_bien||[]).map(t=>BL[t]||t).join(', ')))}${kv('Surface',(d.surface_min_m2??'?')+' – '+(d.surface_max_m2??'?')+' m²')}${kv('Budget max',d.budget_max?(d.transaction==='location'?euro(d.budget_max*12)+' / an'+` <small style="color:var(--gris)">(${euro(d.budget_max)} / mois)</small>`:euro(d.budget_max)):'—')}${kv('Urgence',esc(d.urgence||'—'))}
     ${kv('Demandeur',c?`<a href="#/contacts/${c.id}" style="color:var(--teal)">${esc(c.nom)}${c.societe?' · '+esc(c.societe):''}</a>`:'—')}${d.localites&&d.localites.length?kv('Localités',esc(d.localites.join(', '))):''}${d.notes?kv('Notes',esc(d.notes)):''}</div></div>
   <div class="card" style="margin-top:14px"><h3>${ic('link',15)} Offres compatibles</h3>
     ${comp.map(x=>`<div class="li" onclick="go('#/biens/${x.o.id}')"><b>${esc(x.o.reference)}</b><small>${esc(BL[x.o.type_bien]||x.o.type_bien)} · ${esc(x.o.ville)} · ${x.o.surface_m2} m² · ${euro(x.o.loyer_annuel_m2||x.o.prix_vente)}</small><span class="sp match"><span class="bar"><i style="width:${x.m.pct}%"></i></span>${x.m.pct}%</span>${propCell(x.o.id,d.id)}</div>`).join('')}</div>${propCard('d',d.id)}`;
};

/* ---- Suivi ---- */
VIEWS.suivi=()=>{
  const t=today(); const f=S.taskf;
  const rel=allContacts().filter(c=>c.relance).map(c=>({id:'r'+c.id,titre:'Relancer '+c.nom+(c.societe?' ('+c.societe+')':''),date:c.relance,contact:c.id,done:false,auto:true}));
  const all=[...tasks,...rel].filter(x=>f==='done'?x.done:!x.done).sort((a,b)=>a.date.localeCompare(b.date));
  const grp={'En retard':all.filter(x=>x.date<t),"Aujourd'hui":all.filter(x=>x.date===t),'À venir':all.filter(x=>x.date>t)};
  const plan=allContacts().filter(c=>c.etape>=1&&c.etape<=2&&!c.relance).slice(0,6);
  $('#view').innerHTML=`
  <div class="ph"><h1>Suivi</h1><div class="sp"><button class="btn sec" onclick="S.taskf=S.taskf==='done'?'todo':'done';VIEWS.suivi()">${S.taskf==='done'?'Voir à faire':'Voir terminées'}</button><button class="btn pri" onclick="openNew('tache')">${ic('plus',16)}Nouvelle tâche</button></div></div>
  <div class="split">
  <div class="card">${Object.entries(grp).map(([k,v])=>v.length?`<h3>${k} <span class="chip c-gris">${v.length}</span></h3>${v.map(x=>{const c=getC(x.contact);return `<div class="li">${x.auto?ic('phone',16):`<input type="checkbox" ${x.done?'checked':''} onchange="doneTask('${x.id}',this.checked)">`}<span onclick="${x.contact?`go('#/contacts/${x.contact}')`:''}"><b>${esc(x.titre)}</b>${c&&!x.auto?`<small> · ${esc(c.nom)}</small>`:''}</span><span class="sp">${fdate(x.date)}</span></div>`}).join('')}`:'').join('')||`<div class="empty"><b>Aucune tâche ${S.taskf==='done'?'terminée':'à faire'}</b>Utilise « Nouvelle tâche » ou le bouton « Nouveau ».</div>`}</div>
  <div class="card"><h3>${ic('calendar',15)} À planifier — contacts en cours sans relance</h3>
   ${plan.map(c=>`<div class="li" onclick="go('#/contacts/${c.id}')"><span class="ini" style="background:${colOf(c.id)}">${ini(c.nom)}</span><span><b>${esc(c.nom)}</b><small> · ${esc(c.societe||'')}</small></span><span class="sp chip ${stChip(c)}">${stLabel(c)}</span></div>`).join('')||`<div class="empty"><b>Rien à planifier</b></div>`}</div></div>`;
};
function doneTask(id,v){const t=tasks.find(x=>x.id===id);if(t){t.done=v;SV('tasks',tasks);toast(v?'Tâche terminée':'Tâche rouverte');VIEWS.suivi();renderNav('suivi')}}

/* ---- Documents / Paramètres ---- */
VIEWS.documents=()=>{
  $('#view').innerHTML=`<div class="ph"><h1>Documents</h1></div>
  <div class="grid2" style="grid-template-columns:repeat(3,1fr)">
   ${[['Mandats','Registre, génération, suivi des échéances'],['Avis de valeur','Comparables DVF + analyse'],['LOI','Lettre d\'intention de location'],['Devis & Factures','Numérotation continue, relances'],['Dossier PDF','Fiche commerciale du bien (celle du CRM actuel)'],['Modèles','Courriers et e-mails types']].map(([a,b])=>`<div class="card doc" onclick="demoMsg('${a}')">${ic('file')}<b>${a}</b><span>${b}</span></div>`).join('')}
  </div><div class="banner" style="margin-top:16px">${ic('note',16)}<span>Ces modules restent disponibles dans l'ancien CRM (<a href="../crm-ancien/" style="color:var(--teal);font-weight:600">/crm-ancien/</a>) en attendant d'être repris ici.</span></div>`;
};
VIEWS.parametres=()=>{$('#view').innerHTML=`<div class="ph"><h1>Réglages</h1></div><div class="card"><div class="empty"><b>À définir ensemble</b>Types de contact, étapes du pipeline, origines, utilisateurs, modèles.</div></div>`};

/* ============ filtres avancés, création rapide, recherche ============ */
function openDrawer(){
  const all=allContacts(); const cats=[...new Set(all.map(c=>c.categorie).filter(Boolean))]; const ag=[...new Set(all.map(c=>c.agent).filter(Boolean))];
  $('#drawer').innerHTML=`<h2>Filtres <button class="iconbtn" style="margin-left:auto" onclick="closeDrawer()">${ic('x',18)}</button></h2>
   <label>Suivi par</label><select id="d-ag"><option value="">Tous</option>${ag.map(a=>`<option ${S.fagent===a?'selected':''}>${a}</option>`).join('')}</select>
   <label>Catégorie d'enseigne</label><select id="d-cat"><option value="">Toutes</option>${cats.map(a=>`<option ${S.fcat===a?'selected':''}>${a}</option>`).join('')}</select>
   <label>Température</label><select id="d-tp"><option value="">Toutes</option>${['chaud','tiede','froid'].map(a=>`<option ${S.ftemp===a?'selected':''}>${a}</option>`).join('')}</select>
   <label>Relance</label><select id="d-rl"><option value="">Toutes</option><option value="1" ${S.frel?'selected':''}>À relancer (aujourd'hui ou en retard)</option></select>
   <div style="display:flex;gap:8px;margin-top:22px"><button class="btn pri" onclick="applyDrawer()">Valider</button><button class="btn sec" onclick="resetF();closeDrawer()">Effacer les filtres</button></div>`;
  $('#drawer').classList.add('open');
}
function closeDrawer(){$('#drawer').classList.remove('open')}
function applyDrawer(){S.fagent=$('#d-ag').value;S.fcat=$('#d-cat').value;S.ftemp=$('#d-tp').value;S.frel=$('#d-rl').value;closeDrawer();route()}
function openNew(kind,cid){
  const m=$('#mbox'),cs=allContacts();
  if(kind==='contact') m.innerHTML=`<h2>Nouveau contact</h2><label>Nom *</label><input id="n-nom"><label>Société / enseigne</label><input id="n-soc"><label>Fonction</label><input id="n-poste"><label>Type</label><select id="n-type">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select><label>E-mail</label><input id="n-mail"><label>Téléphone</label><input id="n-tel"><div class="ft"><button class="btn sec" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="saveNew('contact')">Créer</button></div>`;
  else m.innerHTML=`<h2>Nouvelle tâche</h2><label>Titre *</label><input id="n-titre" placeholder="Ex. Appeler pour proposer REF-044"><label>Échéance</label><input id="n-date" type="date" value="${today()}"><label>Contact lié</label><select id="n-ct"><option value="">—</option>${cs.map(c=>`<option value="${c.id}" ${c.id===cid?'selected':''}>${esc(c.nom)}${c.societe?' · '+esc(c.societe):''}</option>`).join('')}</select><div class="ft"><button class="btn sec" onclick="closeModal()">Annuler</button><button class="btn pri" onclick="saveNew('tache')">Créer</button></div>`;
  $('#modal').classList.add('open');$('#plusmenu').style.display='none';
}
function closeModal(){$('#modal').classList.remove('open')}
function saveNew(kind){
  if(kind==='contact'){const nom=$('#n-nom').value.trim();if(!nom)return toast('Le nom est obligatoire');
    const c={id:'new-'+Date.now(),src:'crm',type:$('#n-type').value,societe:$('#n-soc').value.trim()||null,nom,poste:$('#n-poste').value.trim()||null,tel:$('#n-tel').value.trim()||null,email:$('#n-mail').value.trim()||null,etape:0,statut:'a_contacter',temp:null,last:null,relance:null,notes:null,categorie:null,agent:'FB',created:today()};
    newC.unshift(c);SV('newc',newC);S.contactSel=c.id;closeModal();toast('Contact créé');go('#/contacts/'+c.id);route();}
  else{const titre=$('#n-titre').value.trim();if(!titre)return toast('Le titre est obligatoire');
    tasks.unshift({id:'t'+Date.now(),titre,date:$('#n-date').value||today(),contact:$('#n-ct').value||null,done:false});SV('tasks',tasks);closeModal();toast('Tâche créée');route();}
}
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
$('#plus').onclick=e=>{e.stopPropagation();const m=$('#plusmenu');
  m.innerHTML=`<div class="mt">Nouveau</div><button onclick="openNew('contact')">${ic('user',16)}Contact</button><button onclick="openNew('tache')">${ic('calendar',16)}Tâche</button><button onclick="openWizard('offre')">${ic('building',16)}Offre</button><button onclick="openWizard('demande')">${ic('search',16)}Demande</button><button class="dis" onclick="demoMsg('Mandat')">${ic('file',16)}Mandat</button>`;
  m.style.display=m.style.display==='none'?'block':'none'};
$('#bell').onclick=()=>go('#/suivi');
document.addEventListener('click',()=>{$('#plusmenu').style.display='none';const a=$('#actmenu');if(a)a.style.display='none';$('#sres').style.display='none'});
$('#gs').addEventListener('input',function(){
  const q=this.value.trim().toLowerCase(),b=$('#sres'); if(q.length<2){b.style.display='none';return}
  const r=[];
  allContacts().filter(c=>[c.nom,c.societe,c.email].join(' ').toLowerCase().includes(q)).slice(0,5).forEach(c=>r.push([`#/contacts/${c.id}`,'user',c.nom,c.societe||c.type]));
  D.offres.filter(o=>[o.reference,o.ville,o.adresse].join(' ').toLowerCase().includes(q)).slice(0,3).forEach(o=>r.push([`#/biens/${o.id}`,'building',o.reference+' · '+(BL[o.type_bien]||''),o.ville]));
  D.demandes.filter(d=>[d.reference,d.notes].join(' ').toLowerCase().includes(q)).slice(0,3).forEach(d=>r.push([`#/demandes/${d.id}`,'search',d.reference,'Demande']));
  b.innerHTML=r.map(x=>`<div onclick="go('${x[0]}')">${ic(x[1],16)}<b>${esc(x[2])}</b><small>${esc(x[3])}</small></div>`).join('')||`<div style="color:var(--gris)">Aucun résultat</div>`;
  b.style.display='block'});
$('#gs').addEventListener('click',e=>e.stopPropagation());


/* =====================================================================
   ASSISTANT DE CRÉATION — offre & demande (même logique que le CRM actuel :
   des étapes, des listes prédéfinies, des cases à cocher, des valeurs par défaut)
   ===================================================================== */
/* zones commerciales par commune : le menu « Zone » n'affiche que celles de la ville choisie */
const ZONES={amiens:['Pôle Jules Verne','ZI Nord Amiens','Zac Intercampus','Zone Montières','Centre ville Amiens'],camon:['Blanche Tâche Camon'],cagny:['Grand Riez Cagny'],dury:['Village Oasis Dury','Bornes du Temps'],boves:['Vallée des Vignes'],saleux:['ZA le Capron Saleux'],'villers-bretonneux':['Zac Haute Borne']};
const _norm=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const zonesDe=v=>ZONES[_norm(v)]||[];
const secteurField=()=>{const v=(wzv('ville')||'').trim(),z=zonesDe(v),cur=wzv('secteur')||'';
  if(!v)return `<label>Zone commerciale</label><select disabled><option>Choisissez d'abord la ville</option></select>`;
  if(!z.length)return `<label>Zone commerciale</label><input placeholder="Aucune zone enregistrée pour ${esc(v)} — saisie libre" value="${esc(cur)}" oninput="wzSet('secteur',this.value)">`;
  return `<label>Zone commerciale</label><select onchange="wzSet('secteur',this.value)"><option value="">—</option>${z.map(x=>`<option ${cur===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`};
function wzMajSecteur(){const z=zonesDe(wzv('ville'));if(wzv('secteur')&&!z.includes(wzv('secteur'))){W.d.secteur='';wzSave()}const e=$('#wz-sect');if(e)e.innerHTML=secteurField()}

/* ===== Accès (route, SNCF) & environnement commercial (500 m) =====
   Sources gratuites sans clé : OpenStreetMap (Overpass) pour les points, OSRM pour les temps de trajet en voiture,
   geo.api.gouv.fr pour le centre-ville. Rien n'est figé : chaque ligne se supprime / s'ajoute à la main. */
const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter'];
async function overpass(q){const one=async u=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);try{const r=await fetch(u,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:c.signal});
    if(!r.ok)throw 0;const j=await r.json();if(!j||!j.elements)throw 0;return j.elements}finally{clearTimeout(t)}};
  try{return await Promise.any(OVERPASS.map(one))}catch(e){return null}}
const rad=x=>x*Math.PI/180;
function km(a,b,c,d){const R=6371,dl=rad(c-a),dn=rad(d-b),h=Math.sin(dl/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
const ptOf=e=>e.lat!=null?[e.lat,e.lon]:(e.center?[e.center.lat,e.center.lon]:null);
function nearestGeom(e,lat,lon){let best=1e9;(e.geometry||[]).forEach(g=>{const d=km(lat,lon,g.lat,g.lon);if(d<best)best=d});return best}
const fkm=n=>(n<10?String(Math.round(n*10)/10).replace('.',','):String(Math.round(n)))+' km';
async function trajet(lat,lon,lat2,lon2){try{const c=new AbortController(),t=setTimeout(()=>c.abort(),8000);
  const r=await (await fetch(`https://router.project-osrm.org/route/v1/driving/${lon},${lat};${lon2},${lat2}?overview=false`,{signal:c.signal})).json();clearTimeout(t);
  const R=r.routes&&r.routes[0];if(R)return {km:R.distance/1000,min:Math.max(1,Math.round(R.duration/60))}}catch(e){}return null}
const fmin=m=>m>=90?Math.floor(m/60)+' h '+String(m%60).padStart(2,'0'):m+' min';
async function ligne(label,lat,lon,lat2,lon2){const t=await trajet(lat,lon,lat2,lon2);
  return t?`${label} : ${fkm(t.km)} · ${fmin(t.min)} en voiture`:`${label} : ${fkm(km(lat,lon,lat2,lon2))} à vol d’oiseau`}
async function wzCoords(){if(W.d.lat&&W.d.lon)return [+W.d.lat,+W.d.lon];
  const q=[wzv('adresse'),wzv('cp'),wzv('ville')].filter(Boolean).join(' ');if(!q.trim())return null;
  try{const r=await (await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q='+encodeURIComponent(q))).json();const f=r.features&&r.features[0];
    if(f){W.d.lat=f.geometry.coordinates[1];W.d.lon=f.geometry.coordinates[0];wzSave();return [W.d.lat,W.d.lon]}}catch(e){}return null}
let accTok=0;
function wzAccMsg(t){const e=$('#wz-accmsg');if(e)e.textContent=t||''}
const NAF_COMMERCE='47.11B,47.11C,47.11D,47.11E,47.11F,47.19A,47.19B,47.21Z,47.22Z,47.24Z,47.25Z,47.26Z,47.29Z,47.41Z,47.42Z,47.43Z,47.51Z,47.52A,47.52B,47.53Z,47.54Z,47.59A,47.59B,47.61Z,47.62Z,47.63Z,47.64Z,47.65Z,47.71Z,47.72A,47.72B,47.73Z,47.74Z,47.75Z,47.76Z,47.77Z,47.78A,47.78B,47.78C,47.79Z,47.81Z,47.82Z,47.89Z,56.10A,56.10B,56.10C,56.21Z,56.30Z,64.19Z,96.02A,96.02B,93.13Z,45.11Z,45.32Z';
async function getJ(u,ms){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms||12000);try{const r=await fetch(u,{signal:c.signal});if(!r.ok)return null;return await r.json()}catch(e){return null}finally{clearTimeout(t)}}
async function wzAutoAcces(){const tok=++accTok;wzAccMsg('Recherche des accès et de l’environnement…');
  const c=await wzCoords();if(!c){wzAccMsg('Adresse introuvable : renseignez l’adresse (ou le code postal et la ville) puis relancez.');return}
  const [lat,lon]=c;
  const [CV,G,RR,E]=await Promise.all([
    getJ('https://geo.api.gouv.fr/communes?nom='+encodeURIComponent(wzv('ville'))+(wzv('cp')?'&codePostal='+wzv('cp'):'')+'&fields=nom,centre&limit=1'),
    getJ('https://data.sncf.com/api/explore/v2.1/catalog/datasets/liste-des-gares/records?limit=40&where='+encodeURIComponent(`voyageurs="O" and within_distance(geo_point_2d, geom'POINT(${lon} ${lat})', 25km)`)+'&select=libelle,geo_point_2d'),
    // autoroute / rocade : service public souvent saturé → tentative unique, ignorée si ça ne répond pas
    overpass(`[out:json][timeout:12];(node["highway"="motorway_junction"](around:20000,${lat},${lon});way["highway"="motorway"]["ref"](around:15000,${lat},${lon});way["highway"~"^(trunk|primary|motorway)$"]["name"~"[Rr]ocade"](around:10000,${lat},${lon}););out tags geom;`),
    (async()=>{const pages=await Promise.all([1,2,3,4].map(n=>getJ(`https://recherche-entreprises.api.gouv.fr/near_point?lat=${lat}&long=${lon}&radius=0.5&per_page=25&page=${n}&etat_administratif=A&activite_principale=${NAF_COMMERCE}`)));return pages.filter(Boolean).flatMap(p=>p.results||[])})()]);
  if(tok!==accTok)return;
  const jobs=[];
  const ville=(CV&&CV[0]&&CV[0].nom)||wzv('ville');
  if(CV&&CV[0]&&CV[0].centre)jobs.push([0,ligne(`Centre-ville (${ville})`,lat,lon,CV[0].centre.coordinates[1],CV[0].centre.coordinates[0])]);
  const gares=((G&&G.results)||[]).filter(x=>x.geo_point_2d).map(x=>({n:x.libelle,la:x.geo_point_2d.lat,lo:x.geo_point_2d.lon,d:km(lat,lon,x.geo_point_2d.lat,x.geo_point_2d.lon)})).sort((a,b)=>a.d-b.d);
  if(gares[0])jobs.push([1,ligne(`Gare SNCF « ${gares[0].n} »`,lat,lon,gares[0].la,gares[0].lo)]);
  let routier=false;
  if(RR){
    const el=RR.filter(e=>e.tags);
    const mw=el.filter(e=>e.tags.highway==='motorway'&&e.geometry).map(e=>({e,d:nearestGeom(e,lat,lon)})).sort((a,b)=>a.d-b.d)[0];
    const j=el.filter(e=>e.type==='node'&&e.tags.highway==='motorway_junction').map(e=>({e,d:km(lat,lon,e.lat,e.lon)})).sort((a,b)=>a.d-b.d)[0];
    if(j){routier=true;jobs.push([2,ligne('Échangeur autoroutier'+(mw?' '+String(mw.e.tags.ref).replace(/\s+/g,'').split(';')[0]:'')+(j.e.tags.name?' « '+j.e.tags.name+' »':(j.e.tags.ref?' (sortie '+j.e.tags.ref+')':'')),lat,lon,j.e.lat,j.e.lon)])}
    const r=el.filter(e=>/rocade/i.test(e.tags.name||'')&&e.geometry).map(e=>({e,d:nearestGeom(e,lat,lon)})).sort((a,b)=>a.d-b.d)[0];
    if(r){routier=true;jobs.push([3,Promise.resolve(`${r.e.tags.name} : ${fkm(r.d)} à vol d’oiseau`)])}
  }
  const res=await Promise.all(jobs.map(async([o,p])=>[o,await p]));if(tok!==accTok)return;
  W.d.acces=res.sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  {const GAL=/centre\s*(commercial|cial)|c\.?\s?cial|galerie|marchande|\bcc\b/i,m=new Map();
    E.forEach(x=>{(x.matching_etablissements||[]).forEach(et=>{if(et.etat_administratif&&et.etat_administratif!=='A')return;
      const nom=(et.liste_enseignes&&et.liste_enseignes[0])||et.nom_commercial;if(!nom)return;const k=nom.toLowerCase().trim();
      const gal=GAL.test((et.adresse||'')+' '+(et.complement_adresse||'')),poids=x.nombre_etablissements_ouverts||0;
      const cur=m.get(k);if(!cur||(cur.gal&&!gal))m.set(k,{nom:nom.trim(),gal,poids})})});
    // enseignes en pied de bâtiment / zone commerciale d'abord, puis les plus connues (nombre de points de vente) ; galerie marchande en dernier recours
    W.d.env=[...m.values()].sort((a,b)=>(a.gal-b.gal)||(b.poids-a.poids)).slice(0,10)
      .map(x=>x.nom.toLowerCase().replace(/(^|[\s\-'’(])([a-zà-ÿ])/g,(_,p,c)=>p+c.toUpperCase()))}
  wzSave();wzListsRender();
  wzAccMsg(`Accès mis à jour${routier?'':' — autoroute / rocade indisponibles pour l’instant (service saturé) : ajoutez-les à la main ou relancez'}. Supprimez ou ajoutez des lignes si besoin.`)}
function wzListsRender(){[['acces','wz-acces'],['env','wz-env']].forEach(([k,id])=>{const e=$('#'+id);if(e)e.innerHTML=(W.d[k]||[]).map((t,i)=>`<span class="pill on" onclick="wzDelLine('${k}',${i})">${esc(t)} ✕</span>`).join('')||'<span style="color:var(--gris);font-size:13px">Aucune ligne</span>'})}
function wzDelLine(k,i){(W.d[k]||[]).splice(i,1);wzSave();wzListsRender()}
function wzAddLine(k,inp){const e=$('#'+inp),v=(e.value||'').trim();if(!v)return;(W.d[k]||(W.d[k]=[])).push(v);e.value='';wzSave();wzListsRender()}
const accesBlock=()=>`${sep('Accès & desserte')}<div class="wf full"><div id="wz-acces">${(wzv('acces',[])).map((t,i)=>`<span class="pill on" onclick="wzDelLine('acces',${i})">${esc(t)} ✕</span>`).join('')||'<span style="color:var(--gris);font-size:13px">Aucune ligne</span>'}</div>
  <div class="cmb" style="margin-top:8px"><input id="wz-acc-add" placeholder="Ajouter une ligne (ex. Accès poids lourds direct)" onkeydown="if(event.key==='Enter')wzAddLine('acces','wz-acc-add')"><button class="btn sec sm" onclick="wzAddLine('acces','wz-acc-add')">${ic('plus',13)}Ajouter</button><button class="btn sec sm" onclick="wzAutoAcces()">↻ Calculer depuis l’adresse</button></div><div class="hint" id="wz-accmsg"></div></div>
 ${sep('Environnement commercial (≈ 500 m)')}<div class="wf full"><div id="wz-env">${(wzv('env',[])).map((t,i)=>`<span class="pill on" onclick="wzDelLine('env',${i})">${esc(t)} ✕</span>`).join('')||'<span style="color:var(--gris);font-size:13px">Aucune ligne</span>'}</div>
  <div class="cmb" style="margin-top:8px"><input id="wz-env-add" placeholder="Ajouter une enseigne" onkeydown="if(event.key==='Enter')wzAddLine('env','wz-env-add')"><button class="btn sec sm" onclick="wzAddLine('env','wz-env-add')">${ic('plus',13)}Ajouter</button></div><div class="hint">Données OpenStreetMap : liste indicative, pas exhaustive — à vérifier.</div></div>`;
/* adresses déjà enregistrées (offres existantes) : choisir une adresse remplit code postal, ville et zone */
const adressesConnues=()=>{const m=new Map();D.offres.forEach(o=>{if(o.adresse&&!m.has(o.adresse))m.set(o.adresse,o)});return [...m.values()]};
let adrTimer=null,adrTok=0,ADRRES=[];
function wzAdrIn(v){W.d.adresse=v;W.d.lat='';W.d.lon='';wzSave();clearTimeout(adrTimer);const box=$('#wz-adrres');if(!box)return;const q=v.trim().toLowerCase();
  if(q.length<3){box.style.display='none';return}
  const loc=adressesConnues().filter(o=>o.adresse.toLowerCase().includes(q)).slice(0,3).map(o=>({adresse:o.adresse,cp:o.code_postal||'',ville:o.ville||'',secteur:o.secteur||'',saved:1}));
  adrShow(loc);const tok=++adrTok;
  adrTimer=setTimeout(async()=>{try{const r=await (await fetch('https://api-adresse.data.gouv.fr/search/?limit=6&autocomplete=1&lat=49.894&lon=2.295&q='+encodeURIComponent(v))).json();
    if(tok!==adrTok)return;const api=(r.features||[]).map(f=>({adresse:f.properties.name,cp:f.properties.postcode,ville:f.properties.city,secteur:'',lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}))
      .filter(a=>!loc.some(l=>l.adresse.toLowerCase()===a.adresse.toLowerCase()&&l.cp===a.cp));adrShow(loc.concat(api))}catch(e){}},250)}
function adrShow(L){ADRRES=L;const box=$('#wz-adrres');if(!box)return;
  box.innerHTML=L.map((a,i)=>`<div onclick="wzPickAdr(${i})">${ic('building',15)}<span><b>${esc(a.adresse)}</b><br><small style="margin:0">${esc([a.cp,a.ville].filter(Boolean).join(' '))}</small></span>${a.saved?'<small>Adresse enregistrée</small>':''}</div>`).join('');
  box.style.display=L.length?'block':'none'}
function wzPickAdr(i){const a=ADRRES[i];if(!a)return;adrTok++;
  W.d.adresse=a.adresse;W.d.cp=a.cp;W.d.ville=a.ville;W.d.secteur='';W.d.lat=a.lat||'';W.d.lon=a.lon||'';
  const z=zonesDe(a.ville);if(a.secteur&&z.includes(a.secteur))W.d.secteur=a.secteur;else if(z.length===1)W.d.secteur=z[0];
  wzSave();const f={'wz-adr-in':a.adresse,'wz-cp':a.cp,'wz-ville':a.ville};Object.entries(f).forEach(([k,v])=>{const e=$('#'+k);if(e)e.value=v});
  const sb=$('#wz-sect');if(sb)sb.innerHTML=secteurField();$('#wz-adrres').style.display='none';wzAutoAcces()}
const AMIENS_METRO=[['Amiens','80000'],['Longueau','80330'],['Camon','80450'],['Dury','80480'],['Boves','80440'],['Cagny','80330'],['Saleux','80480'],['Salouël','80480'],['Pont-de-Metz','80480'],['Rivery','80136']];
const HDF={'Nord (59)':[['Lille','59000'],['Roubaix','59100'],['Tourcoing','59200'],['Dunkerque','59140'],['Valenciennes','59300'],['Douai','59500'],['Cambrai','59400'],['Maubeuge','59600']],
 'Pas-de-Calais (62)':[['Arras','62000'],['Calais','62100'],['Boulogne-sur-Mer','62200'],['Lens','62300'],['Béthune','62400'],['Saint-Omer','62500']],
 'Somme (80)':[['Abbeville','80100'],['Albert','80300'],['Péronne','80200'],['Doullens','80600'],['Montdidier','80500']],
 'Oise (60)':[['Beauvais','60000'],['Compiègne','60200'],['Creil','60100'],['Senlis','60300'],['Chantilly','60500']],
 'Aisne (02)':[['Saint-Quentin','02100'],['Laon','02000'],['Soissons','02200'],['Château-Thierry','02400']]};
const TITRES_LOUER=['Bureaux à louer',"Cellule d'activités à louer","Bâtiment d'activité à louer",'Cellule commerciale à louer','Entrepôts à louer','Bâtiment logistique à louer'];
const TITRES_VENDRE=['Bureaux à vendre',"Cellule d'activités à vendre","Bâtiment d'activité à vendre",'Cellule commerciale à vendre','Entrepôts à vendre','Bâtiment logistique à vendre'];
const TITRE_AUTO={bureaux:['Bureaux à louer','Bureaux à vendre'],local_commercial:['Cellule commerciale à louer','Cellule commerciale à vendre'],activite:["Cellule d'activités à louer","Cellule d'activités à vendre"],entrepot_logistique:['Entrepôts à louer','Entrepôts à vendre']};
const EQUIP_CAT={structure:['Structure du bâtiment',['Métallique','Béton','Brique']],toiture:['Toiture',['Bac acier','Tuiles','Toiture-terrasse','Photovoltaïque','Simple peau','Double peau','Fibrociment','Isolé']],isolation:['Isolation',['Simple peau','Double peau','RT 2012','RT 2005','RE2020']],sol:['Sol',['Dalle béton','Lino','Parquet','Carrelage','500 kg/m²','1 T/m²','1,5 T/m²','5 T/m²']],electricite:['Électricité',['RJ45','Vertical','Périphérique','Courant fort','Courant faible','Tarif bleu','Tarif jaune','Tarif vert']],chauffage:['Chauffage',['Électrique','Gaz','Solaire','Pompe à chaleur','Fioul','Collectif','Aérothermes']],climatisation:['Climatisation',['Réversible','Centralisée']],eclairage:['Éclairage',['Led','Néon','Lumière naturelle','Faux plafond']],ascenseur:['Ascenseur',['Ascenseur','Monte-charge','Accès PMR']],parking:['Parking',['Privatif','Couvert','Extérieur','Borne de recharge','Accès poids lourds']]};
const HONO={p10:'10 % HT du loyer annuel HT HC',p15:'15 % HT du loyer annuel HT HC',p20:'20 % HT du loyer annuel HT HC',p30:'30 % HT du loyer annuel HT HC',forfait:'Montant forfaitaire'};
const DEFAUTS={offre:{agent:ME.agent!=='?'?ME.agent:'HC',type_bien:'local_commercial',transaction:'location',statut:'marche',bail:'Commercial 3/6/9 ans',indexation:'ILAT',regime:'TVA',periodicite:'Trimestriellement ou mensuellement',loyer_type:'HT HC',dpe:'',equip:{}},
               demande:{agent:ME.agent!=='?'?ME.agent:'HC',transaction:'location',statut:'active',types:[],tolb:15,tols:15,urgence:'',loc:[],metro:false}};
const W={k:null,step:0,d:{},seen:{},msg:''};
const wzv=(k,def='')=>W.d[k]??def;
const nbf=n=>new Intl.NumberFormat('fr-FR').format(n);
function wzSave(){if(W.edit)return;localStorage.setItem('rf_draft_'+W.k,JSON.stringify(W.d));localStorage.setItem('rf_draftstep_'+W.k,W.step);localStorage.setItem('rf_wzopen',W.k)}
function wzSet(k,v,rr){W.d[k]=v;W.msg='';wzSave();if(rr)wzBody();}
function wzToggle(k,v){const a=W.d[k]||(W.d[k]=[]);const i=a.indexOf(v);i>=0?a.splice(i,1):a.push(v);wzSave();wzBody()}
function wzEq(cat,v){const e=W.d.equip||(W.d.equip={});const a=e[cat]||(e[cat]=[]);const i=a.indexOf(v);i>=0?a.splice(i,1):a.push(v);if(!a.length)delete e[cat];wzSave();wzBody()}
/* champs */
const fS=(label,k,opts,rr,full)=>`<div class="wf ${full?'full':''}"><label>${label}</label><select onchange="wzSet('${k}',this.value,${rr?1:0})">${opts.map(([v,t])=>`<option value="${esc(v)}" ${String(wzv(k))===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></div>`;
const fT=(label,k,o={})=>`<div class="wf ${o.full?'full':''}"><label>${label}</label><input ${o.type?`type="${o.type}"`:''} ${o.step?`step="${o.step}"`:''} placeholder="${esc(o.ph||'')}" value="${esc(wzv(k))}" oninput="wzSet('${k}',this.value);${o.hook||''}">${o.hint?`<div class="hint" id="${o.hint}"></div>`:''}</div>`;
const fC=(label,k)=>`<div class="tile ${wzv(k)?'on':''}" onclick="wzSet('${k}',${wzv(k)?'false':'true'},1)"><i>${wzv(k)?ic('ok'):''}</i>${label}</div>`;
const sep=t=>`<div class="wsep">${t}</div>`;
const AGENTS=[['VDM','VDM'],['HC','HC'],['','?']];
const fAgentW=()=>`<div class="wf"><label>Suivi par</label><div class="radio3">${AGENTS.map(([v,t])=>`<div class="tile ${wzv('agent')===v?'on':''}" onclick="wzSet('agent','${v}',1)"><i>${wzv('agent')===v?ic('ok'):''}</i>${t}</div>`).join('')}</div></div>`;
/* client (liste de recherche + création rapide) */
function fClient(){
  const id=wzv('client_id'); const c=id?getC(id):null;
  return `<div class="wf full"><label>Client${W.k==='offre'?' propriétaire':''} *</label>
   <div class="cmb"><input id="wz-cl" value="${esc(c?c.nom+(c.societe?' · '+c.societe:''):'')}" placeholder="Tapez un nom ou une société…" oninput="wzCl(this.value)" autocomplete="off">
   ${c?`<button class="btn sec sm" onclick="wzSet('client_id','',1)">${ic('x',13)}Changer</button>`:''}
   <button class="btn sec sm" onclick="wzSet('newcl',!wzv('newcl'),1)">${ic('plus',13)}Nouveau</button><div class="cres" id="wz-clres" style="display:none"></div></div>
   ${wzv('newcl')?`<div class="wgrid" style="margin-top:10px;padding:12px;border:1.5px dashed var(--teal-light);border-radius:10px">${fT('Nom *','nc_nom')}${fT('Prénom','nc_prenom')}${fT('Société / enseigne','nc_soc')}${fT('Fonction','nc_poste')}${fT('Téléphone','nc_tel',{type:'tel'})}${fT('E-mail','nc_mail',{type:'email'})}${fS('Type','nc_type',TYPES.map(t=>[t,t]))}<div class="wf" style="align-self:end"><button class="btn pri sm" onclick="wzMakeClient()">Créer le contact et le sélectionner</button></div></div>`:''}</div>`;
}
function wzCl(q){const b=$('#wz-clres');q=q.trim().toLowerCase();if(q.length<1){b.style.display='none';return}
  const r=allContacts().filter(c=>[c.nom,c.societe,c.email].join(' ').toLowerCase().includes(q)).slice(0,8);
  b.innerHTML=r.map(c=>`<div onclick="wzSet('client_id','${c.id}',1)"><b>${esc(c.nom)}</b><small>${esc(c.societe||c.type)}</small></div>`).join('')||'<div style="color:var(--gris)">Aucun contact — utilisez « Nouveau »</div>';b.style.display='block'}
function wzMakeClient(){const nom=(wzv('nc_nom')||'').trim();if(!nom)return toast('Le nom est obligatoire');
  const pre=(wzv('nc_prenom')||'').trim(),clean=k=>(wzv(k)||'').trim()||null;
  const c={id:'new-'+Date.now(),src:'crm',type:wzv('nc_type','Enseigne'),societe:clean('nc_soc'),nom:(pre?pre+' ':'')+nom,prenom:pre||null,nom_famille:nom,poste:clean('nc_poste'),tel:clean('nc_tel'),email:clean('nc_mail'),etape:0,statut:'a_contacter',temp:null,last:null,relance:null,notes:null,categorie:null,agent:'FB',created:today()};
  newC.unshift(c);SV('newc',newC);W.d.client_id=c.id;W.d.newcl=false;['nc_nom','nc_prenom','nc_soc','nc_poste','nc_tel','nc_mail'].forEach(k=>W.d[k]='');wzSave();toast('Contact créé dans le carnet et sélectionné');wzBody()}
/* ville <-> code postal automatiques (API officielle des communes) */
let cpTimer=null;
function wzCP(v){W.d.cp=v;wzSave();clearTimeout(cpTimer);if(!/^\d{5}$/.test(v))return;
  cpTimer=setTimeout(async()=>{try{const r=await (await fetch('https://geo.api.gouv.fr/communes?codePostal='+v+'&fields=nom&limit=5')).json();
    if(r.length){const m=AMIENS_METRO.find(x=>x[1]===v);const nom=(m&&r.find(x=>x.nom===m[0]))?m[0]:r[0].nom;W.d.ville=nom;wzSave();const el=$('#wz-ville');if(el)el.value=nom;wzMajSecteur();toast('Ville : '+nom)}}catch(e){}},250)}
function wzVille(v){W.d.ville=v;wzSave();wzMajSecteur();clearTimeout(cpTimer);if(v.length<3||/^\d{5}$/.test(wzv('cp')))return;
  cpTimer=setTimeout(async()=>{try{const r=await (await fetch('https://geo.api.gouv.fr/communes?nom='+encodeURIComponent(v)+'&fields=nom,codesPostaux&boost=population&limit=1')).json();
    if(r.length&&r[0].nom.toLowerCase()===v.trim().toLowerCase()&&r[0].codesPostaux.length){W.d.cp=r[0].codesPostaux[0];wzSave();const el=$('#wz-cp');if(el)el.value=W.d.cp}}catch(e){}},400)}
/* loyer, charges, taxe foncière : on saisit l'ANNUEL ; la fiche garde le mensuel (÷12) et l'affiche sous le champ */
const anDe=m=>{const n=parseFloat(m);return isFinite(n)?String(Math.round(n*1200)/100):''};
function hintMois(k){const e=$('#h-'+k);if(!e)return;const n=parseFloat(wzv(k));e.textContent=(isFinite(n)&&n>0)?'= '+nbf(Math.round(n*100)/100)+' € / mois'+(k==='loyer'?(wzv('loyer_type')==='NET HC'?' net hors charges':' hors-taxes, hors charges'):''):''}
function wzAn(k,v){const n=parseFloat(v);W.d[k]=(v!==''&&isFinite(n))?String(n/12):'';W.msg='';wzSave();hintMois(k)}
function majAnn(){hintMois('loyer');hintMois('charges');hintMois('tf');return}
function majBud(){if(wzv('transaction')==='location')hintMois('budget')}

/* ---- étapes OFFRE ---- */
const LBL_TITRES=(t)=>{const loue=t==='location';return t==='les_deux'?[['',' — Choisir —'],...TITRES_LOUER.map(x=>[x,x]),...TITRES_VENDRE.map(x=>[x,x])]:[['','— Choisir —'],...(loue?TITRES_LOUER:TITRES_VENDRE).map(x=>[x,x])]};
const STEPS_O=[
 {l:'Identité',h:()=>`<div class="wgrid">${sep('Identité')}${fAgentW()}${fS('Type de bien','type_bien',Object.entries(BL),1)}${fS('Transaction','transaction',[['vente','À vendre'],['location','À louer'],['les_deux','Les deux']],1)}${fS('Statut','statut',BSTAT)}${fClient()}</div>`,
   v:()=>!wzv('client_id')?'Sélectionnez le client propriétaire (ou créez-le avec « Nouveau »).':null},
 {l:'Localisation',h:()=>`<div class="wgrid">${sep('Localisation')}<div class="wf full"><label>Adresse complète</label><div class="cmb"><input id="wz-adr-in" value="${esc(wzv('adresse'))}" oninput="wzAdrIn(this.value)" onfocus="wzAdrIn(this.value)" placeholder="Commencez à taper l'adresse (ex. 9 rue des Corps Nuds…)" autocomplete="off"><div class="cres" id="wz-adrres" style="display:none;right:0"></div></div></div>
   <div class="wf"><label>Code postal</label><input id="wz-cp" value="${esc(wzv('cp'))}" maxlength="5" oninput="wzCP(this.value)" placeholder="80000"></div>
   <div class="wf"><label>Ville *</label><input id="wz-ville" value="${esc(wzv('ville'))}" oninput="wzVille(this.value)" placeholder="Remplie automatiquement depuis le code postal"></div>
   <div class="wf full" id="wz-sect">${secteurField()}</div>${accesBlock()}</div>`,
   v:()=>!(wzv('ville')||'').trim()?'La ville est obligatoire.':null},
 {l:'Surfaces',h:()=>`<div class="wgrid">${sep('Surfaces')}${fT('Surface (m²) *','surface',{type:'number'})}${fT('Surface mini (si divisible)','smin',{type:'number'})}${fT('Surface maxi','smax',{type:'number'})}${fT('Nombre de lots','lots',{type:'number'})}
   ${sep('Caractéristiques')}${fS('État','etat',[['','—'],['neuf','Neuf'],['etat_neuf','État neuf'],['bon','Bon état'],['brut_beton','Brut de béton'],['a_renover','À rénover']])}${fS('DPE','dpe',[['','Vierge'],...'ABCDEFG'.split('').map(x=>[x,'Classe '+x])])}${fT('Consommation énergétique (kWh/m²/an)','dpe_conso',{type:'number',full:true})}
   ${fS('Étage','etage',[['','—'],['Sous-sol','Sous-sol'],['Rez-de-chaussée','Rez-de-chaussée'],['R+1','R+1'],['R+2','R+2'],['R+3','R+3'],['R+4','R+4'],['R+5','R+5']])}${fS('Nombre de niveaux','niv',[['','—'],...[-1,0,1,2,3,4,5,6,7,8].map(n=>[String(n),(n>0?'+':'')+n])])}
   ${fT('Parkings (places)','park',{type:'number'})}${fS('Type de parking','park_type',[['','—'],['prive','Privé'],['foisonnement','Foisonnement']])}${fT('Année de construction','annee',{type:'number'})}${fT('Linéaire vitrine (ml)','lineaire',{type:'number',step:'0.01'})}${fT('Hauteur sous plafond (m)','hauteur',{type:'number',step:'0.01'})}
   <div class="wf full"><label>Options</label><div class="tiles">${fC('Divisible','divisible')}${fC('Accessible PMR','pmr')}${fC('Normes ERP','erp')}</div></div></div>`,
   v:()=>!(parseFloat(wzv('surface'))>0)?'La surface est obligatoire.':null},
 {l:'Conditions',h:()=>{const t=wzv('transaction'),loc=t==='location'||t==='les_deux',ven=t==='vente'||t==='les_deux';
   return `<div class="wgrid">${sep('Conditions financières')}
   ${ven?fT('Prix de vente (€)','prix',{type:'number'}):''}
   ${loc?`<div class="wf full"><label>Loyer annuel (€ / an) *</label><div style="display:flex;gap:10px"><input type="number" style="flex:1" value="${esc(anDe(wzv('loyer')))}" oninput="wzAn('loyer',this.value)"><select style="max-width:150px" onchange="wzSet('loyer_type',this.value);majAnn()"><option ${wzv('loyer_type')==='HT HC'?'selected':''}>HT HC</option><option ${wzv('loyer_type')==='NET HC'?'selected':''}>NET HC</option></select></div><div class="hint" id="h-loyer"></div></div>
   <div class="wf full"><label>Charges (€ / an)</label><div style="display:flex;gap:10px"><input type="number" style="flex:1" id="w-ch" value="${esc(anDe(wzv('charges')))}" ${wzv('charges_def')?'disabled':''} oninput="wzAn('charges',this.value)"><select style="max-width:150px" onchange="wzSet('charges_def',this.value==='1',1)"><option value="" ${!wzv('charges_def')?'selected':''}>Montant</option><option value="1" ${wzv('charges_def')?'selected':''}>À définir</option></select></div><div class="hint" id="h-charges"></div></div>`:''}
   <div class="wf"><label>Taxe foncière (€ / an)</label><input type="number" value="${esc(anDe(wzv('tf')))}" oninput="wzAn('tf',this.value)"><div class="hint" id="h-tf"></div></div>${fT('Droit au bail (€)','dab',{type:'number'})}
   ${sep('Honoraires')}${fS('Honoraires','hono',[['','—'],...Object.entries(HONO)],1)}${fS('À la charge de','hono_charge',[['','—'],['preneur_acquereur','Preneur / Acquéreur'],['bailleur_vendeur','Bailleur / Vendeur']])}
   ${wzv('hono')==='forfait'?fT('Montant forfaitaire (€)','hono_mt',{type:'number',full:true}):''}
   ${loc?`${sep('Bail')}${fS('Dépôt de garantie','depot',[['','—'],['1 mois de loyer HT HC','1 mois de loyer HT HC'],['2 mois de loyer HT HC','2 mois de loyer HT HC'],['3 mois de loyer HT HC','3 mois de loyer HT HC']])}${fS('Type de bail','bail',[['Commercial 3/6/9 ans','Commercial 3/6/9 ans'],['Dérogatoire (précaire)','Dérogatoire (précaire)'],['Professionnel','Professionnel']])}${fS('Indexation annuelle','indexation',[['ILAT','ILAT'],['ILC','ILC'],['ICC','ICC']])}${fS('Régime fiscal','regime',[['TVA','Assujetti TVA'],['Exonéré de TVA','Exonéré de TVA']])}${fS('Périodicité de paiement','periodicite',[['Trimestriellement ou mensuellement','Trimestriellement ou mensuellement'],['Mensuellement','Mensuellement'],['Trimestriellement','Trimestriellement']],0,1)}`:''}</div>`},
   v:()=>{const t=wzv('transaction');if((t==='location'||t==='les_deux')&&!(parseFloat(wzv('loyer'))>0))return 'Le loyer mensuel est obligatoire pour une location.';if((t==='vente'||t==='les_deux')&&!(parseFloat(wzv('prix'))>0)&&t==='vente')return 'Le prix de vente est obligatoire pour une vente.';return null},
   after:()=>majAnn()},
 {l:'Équipements',h:()=>`<div class="wgrid">${sep('Équipements du bien (repris dans l\'annonce)')}<div class="full">${Object.entries(EQUIP_CAT).map(([k,[lab,opts]])=>`<div class="eq"><b>${lab}${(wzv('equip',{})[k]||[]).length?` · ${(wzv('equip',{})[k]).length}`:''}</b>${opts.map(o=>`<span class="pill ${(wzv('equip',{})[k]||[]).includes(o)?'on':''}" onclick="wzEq('${k}','${esc(o)}')">${esc(o)}</span>`).join('')}</div>`).join('')}</div></div>`},
 {l:'Vitrine',h:()=>{if(!wzv('titre')){const a=TITRE_AUTO[wzv('type_bien')];if(a)W.d.titre=wzv('transaction')==='vente'?a[1]:a[0]}
   return `<div class="wgrid">${sep('Vitrine & annonce')}${fS('Titre (vitrine)','titre',LBL_TITRES(wzv('transaction')),0,1)}
   <div class="wf full"><label>Description</label><textarea id="w-desc" oninput="wzSet('desc',this.value)">${esc(wzv('desc'))}</textarea><div style="margin-top:6px"><button class="btn sec sm" onclick="wzGen()">✍️ Générer le descriptif</button> <span style="font-size:12px;color:var(--gris)">À partir des champs saisis — modifiable ensuite</span></div></div>
   ${fS('Disponibilité','dispo',[['','—'],['Disponibilité immédiate','Disponibilité immédiate'],['Nous consulter','Nous consulter']])}<div class="wf"><label>Publication</label><div class="tiles">${fC('Publier sur la vitrine','publie')}</div></div>
   <div class="wf full"><label>Photos, plans et cartes</label><div style="border:1.5px dashed var(--gris-clair);border-radius:10px;padding:14px;color:var(--gris);font-size:13px;text-align:center">Ajoutés après l'enregistrement depuis la fiche du bien (comme aujourd'hui) — photo de garde, cartes, plans, dossier PDF.</div></div></div>`}},
 {l:'Récapitulatif',h:()=>recapO()}
];
function wzGen(){
  const d=W.d,ti={bureaux:'des bureaux',local_commercial:'un local commercial',activite:'un local d’activités',entrepot_logistique:'un entrepôt',fonds_de_commerce:'un fonds de commerce',terrain:'un terrain',invest:'un investissement'}[d.type_bien]||'un bien';
  const tx=d.transaction==='vente'?'à la vente':d.transaction==='les_deux'?'à la vente ou à la location':'à la location';
  const loc=d.secteur?`${d.ville||''} (secteur ${d.secteur})`.trim():(d.ville||'');
  const P=[];let a=`Cabinet H3C vous propose, ${tx}, ${ti}`+(loc?` idéalement situé à ${loc}`:'')+'.';
  if(+d.surface){a+=` L’ensemble développe une surface approximative de ${nbf(+d.surface)} m²`+(d.divisible&&+d.smin?`, divisible à partir d’environ ${nbf(+d.smin)} m²`:'')+(+d.lots>1?`, réparti en ${d.lots} lots`:'')+'.'}
  P.push(a);
  const b=[],cl=[];if(d.etage)cl.push('se situe '+(d.etage==='Rez-de-chaussée'?'en rez-de-chaussée':d.etage==='Sous-sol'?'en sous-sol':'à l’étage '+d.etage));if(+d.niv>0)cl.push(`se déploie sur ${d.niv} niveau${d.niv>1?'x':''}`);if(+d.park)cl.push(`dispose de ${d.park} place${d.park>1?'s':''} de stationnement`);
  if(cl.length)b.push('Le bien '+cl.join(', ')+'.');
  const em={neuf:'Il s’agit d’une construction nouvelle',etat_neuf:'Bien existant en parfait état, comme neuf, il ne nécessite aucuns travaux',bon:'Il se présente en bon état général',a_renover:'À rénover, il offre un beau potentiel pour un aménagement sur-mesure',brut_beton:'Livré brut de béton, il s’adapte à un aménagement sur-mesure'};
  if(em[d.etat])b.push(em[d.etat]+(+d.annee?` (construction de ${d.annee})`:'')+'.');
  const ac=[];if(d.pmr)ac.push('accessible aux personnes à mobilité réduite');if(d.erp)ac.push('conforme aux normes ERP (établissement recevant du public)');if(ac.length)b.push('Le bien est '+ac.join(' et ')+'.');
  if(b.length)P.push(b.join(' '));
  if((d.acces||[]).length)P.push('Accès et desserte : '+d.acces.join(' ; ')+'.');
  if((d.env||[]).length)P.push('Dans un rayon d’environ 500 m : '+d.env.slice(0,12).join(', ')+'.');
  P.push(`Le bien bénéficie d’un environnement particulièrement porteur${d.ville?`, au cœur de ${d.ville}`:''} : un secteur recherché et dynamique, animé par un tissu d’entreprises actif et facilement accessible.`);
  P.push((d.dispo?(/^disponibilit/i.test(d.dispo)?d.dispo+'. ':'Disponibilité : '+d.dispo+'. '):'')+'Pour toute information complémentaire ou pour organiser une visite, l’équipe Cabinet H3C se tient à votre entière disposition.');
  const t=P.join('\n\n');W.d.desc=t;wzSave();const el=$('#w-desc');if(el)el.value=t;toast('Descriptif généré')}
function rr(l,v){return `<div class="rr"><span>${l}</span><b>${v||'<i style="color:var(--gris-clair);font-weight:400">—</i>'}</b></div>`}
function recapO(){const d=W.d,c=d.client_id?getC(d.client_id):null,loc=d.transaction!=='vente';
  const miss=STEPS_O.map((s,i)=>s.v&&i<STEPS_O.length-1?s.v():null).filter(Boolean);
  const o=buildOffre(true),comp=D.demandes.map(x=>({x,m:score(x,o)})).filter(z=>z.m.pct>=75).sort((a,b)=>b.m.pct-a.m.pct);
  return `${miss.length?`<div class="warn">À compléter avant d'enregistrer : ${miss.map(esc).join(' · ')}</div>`:`<div class="okbox">Tout est prêt — vérifiez puis enregistrez.</div>`}
  <div class="recap"><div class="rt">Bien</div>${rr('Référence',esc(o.reference)+' <small style="color:var(--gris)">(attribuée automatiquement)</small>')}${rr('Type',esc(BL[d.type_bien]||''))}${rr('Transaction',esc(TL[d.transaction]||'Les deux'))}${rr('Client',c?esc(c.nom)+(c.societe?' · '+esc(c.societe):''):'')}
  <div class="rt">Localisation</div>${rr('Adresse',esc([d.adresse,d.cp,d.ville].filter(Boolean).join(', ')))}${rr('Secteur',esc(d.secteur))}${rr('Accès',esc((d.acces||[]).join(' ; ')))}${rr('Environnement',esc((d.env||[]).join(', ')))}
  <div class="rt">Surfaces</div>${rr('Surface',d.surface?esc(d.surface)+' m²':'')}${rr('Parking',esc([d.park&&d.park+' place(s)',{prive:'Privé',foisonnement:'Foisonnement'}[d.park_type]].filter(Boolean).join(' · ')))}${rr('État / DPE',esc([{neuf:'Neuf',etat_neuf:'État neuf',bon:'Bon état',brut_beton:'Brut de béton',a_renover:'À rénover'}[d.etat],d.dpe&&'DPE '+d.dpe,d.dpe_conso&&d.dpe_conso+' kWh/m²/an'].filter(Boolean).join(' · ')))}
  <div class="rt">Conditions</div>${loc?rr('Loyer annuel',d.loyer?nbf(Math.round(d.loyer*12))+' € '+esc(d.loyer_type)+` <small style="color:var(--gris)">(${nbf(Math.round(d.loyer*100)/100)} €/mois)</small>`:''):''}${d.transaction!=='location'?rr('Prix de vente',d.prix?nbf(+d.prix)+' €':''):''}${rr('Honoraires',esc(HONO[d.hono]||''))}${loc?rr('Bail',esc(d.bail+' · '+d.indexation+' · '+d.regime)):''}
  <div class="rt">Vitrine</div>${rr('Titre',esc(d.titre))}${rr('Équipements',esc(Object.values(d.equip||{}).flat().join(', ')))}${rr('Description',d.desc?'<span style="font-weight:500">'+esc(d.desc.slice(0,110))+'…</span>':'')}</div>
  <div class="card" style="margin-top:12px"><h3>${ic('link',15)} Demandes compatibles dès l'enregistrement (${comp.length})</h3>${comp.slice(0,5).map(z=>{const cc=getC(z.x.client_id);return `<div class="li" style="cursor:default"><b>${esc(z.x.reference)}</b><small>${esc(cc?cc.nom:'—')}${cc&&cc.societe?' · '+esc(cc.societe):''}</small><span class="sp">${z.m.pct}%</span></div>`}).join('')||`<div class="empty" style="padding:14px"><b>Aucune demande compatible pour l'instant</b></div>`}</div>`}
function buildOffre(prev){const d=W.d;const nums=[...D.o0,...newO].map(o=>parseInt(String(o.reference).replace(/\D/g,''))||0);const ref='REF-'+String(Math.max(0,...nums)+1).padStart(3,'0');
  return {id:prev?'preview':'new-o-'+Date.now(),reference:ref,type_bien:d.type_bien,transaction:d.transaction,statut:d.statut,adresse:d.adresse||null,ville:d.ville||'',code_postal:d.cp||null,secteur:d.secteur||null,surface_m2:+d.surface||null,
   loyer_annuel_m2:d.transaction!=='vente'&&d.loyer?+d.loyer:null,prix_vente:d.transaction!=='location'&&d.prix?+d.prix:null,loyer_type:d.loyer_type,charges:d.charges_def?null:(+d.charges||null),titre:d.titre||null,dpe:d.dpe||null,dpe_conso:d.dpe_conso?+d.dpe_conso:null,agent:d.agent||null,client_id:d.client_id||null,created_at:today(),description:d.desc||null,bail:d.bail,indexation:d.indexation,equip:d.equip,acces:d.acces||[],env:d.env||[],_w:prev?undefined:JSON.parse(JSON.stringify(d))}}

/* ---- étapes DEMANDE ---- */
const STEPS_D=[
 {l:'Demandeur',h:()=>`<div class="wgrid">${sep('Demandeur')}${fAgentW()}${fS('Transaction','transaction',[['achat','Achat'],['location','Location'],['cession','Cession'],['les_deux','Les deux']],1)}${fClient()}</div>`,
   v:()=>!wzv('client_id')?'Sélectionnez le client (ou créez-le avec « Nouveau »).':null},
 {l:'Besoin',h:()=>`<div class="wgrid">${sep('Type(s) de bien recherché(s)')}<div class="wf full"><div class="tiles">${Object.entries(BL).map(([k,l])=>`<div class="tile ${(wzv('types',[])).includes(k)?'on':''}" onclick="wzToggle('types','${k}')"><i>${(wzv('types',[])).includes(k)?ic('ok'):''}</i>${l}</div>`).join('')}</div></div>
   ${sep('Surface & budget')}${fT('Surface mini (m²)','smin',{type:'number'})}${fT('Surface maxi (m²)','smax',{type:'number'})}
   <div class="wf full"><label>Budget max (${wzv('transaction')==='location'?'loyer annuel, € / an':'prix d’achat'})</label>${wzv('transaction')==='location'?`<input type="number" value="${esc(anDe(wzv('budget')))}" oninput="wzAn('budget',this.value)">`:`<input type="number" value="${esc(wzv('budget'))}" oninput="wzSet('budget',this.value)">`}<div class="hint" id="h-budget"></div></div>
   ${fT('Tolérance budget (%)','tolb',{type:'number'})}${fT('Tolérance surface (%)','tols',{type:'number'})}${fS('Urgence','urgence',[['','—'],['fort','Fort (0–3 mois)'],['moyen','Moyen (3–6 mois)'],['faible','Faible (6 mois et +)']],0,1)}
   ${sep('Critères')}<div class="wf full"><div class="tiles">${fC('Parking souhaité','parking')}${fC('Accessibilité PMR','pmr')}</div></div>${wzv('parking')?fT('Nombre de places souhaitées','parking_nb',{type:'number'}):''}</div>`,
   v:()=>!(wzv('types',[]).length)?'Cochez au moins un type de bien.':null,after:()=>majBud()},
 {l:'Localités',h:()=>{const L=wzv('loc',[]);const inM=AMIENS_METRO.every(([v])=>L.includes(v));
   return `<div class="wgrid">${sep('📍 Amiens Métropole')}<div class="full"><span class="pill all ${inM?'on':''}" onclick="wzMetro()">✓ Toute la métropole</span><span class="pill all" onclick="wzClearLoc()">✗ Tout enlever</span><br>${AMIENS_METRO.map(([v])=>`<span class="pill ${L.includes(v)?'on':''}" onclick="wzToggle('loc','${esc(v)}')">${esc(v)}</span>`).join('')}</div>
   ${sep('📍 Grandes villes des Hauts-de-France')}<div class="full">${Object.entries(HDF).map(([dep,vs])=>`<div style="margin-bottom:8px"><div style="font-size:11px;font-weight:800;color:var(--gris-fonce);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">${dep}</div>${vs.map(([v])=>`<span class="pill ${L.includes(v)?'on':''}" onclick="wzToggle('loc','${esc(v)}')">${esc(v)}</span>`).join('')}</div>`).join('')}</div>
   ${sep('Autre ville')}<div class="wf full"><div class="cmb"><input id="w-autre" placeholder="Tapez une ville puis Entrée" onkeydown="if(event.key==='Enter'){wzAddVille(this.value);this.value=''}"><button class="btn sec sm" onclick="wzAddVille($('#w-autre').value);$('#w-autre').value=''">${ic('plus',13)}Ajouter</button></div></div>
   <div class="wf full"><label>Sélection (${L.length})</label><div>${L.map(v=>`<span class="pill on" onclick="wzToggle('loc','${esc(v)}')">${esc(v)} ✕</span>`).join('')||'<span style="color:var(--gris);font-size:13px">Aucune localité — la demande portera sur toute zone.</span>'}</div></div></div>`}},
 {l:'Récapitulatif',h:()=>recapD()}
];
function wzMetro(){const L=W.d.loc||(W.d.loc=[]);AMIENS_METRO.forEach(([v])=>{if(!L.includes(v))L.push(v)});wzSave();wzBody()}
function wzClearLoc(){const m=AMIENS_METRO.map(x=>x[0]);W.d.loc=(W.d.loc||[]).filter(v=>!m.includes(v));wzSave();wzBody()}
function wzAddVille(v){v=(v||'').trim();if(!v)return;v=v.charAt(0).toUpperCase()+v.slice(1);const L=W.d.loc||(W.d.loc=[]);if(!L.includes(v))L.push(v);wzSave();wzBody()}
function buildDemande(prev){const d=W.d;const nums=[...D.d0,...newD].map(x=>parseInt(String(x.reference).replace(/\D/g,''))||0);const ref='DEM-'+String(Math.max(0,...nums)+1).padStart(3,'0');
  return {id:prev?'preview':'new-d-'+Date.now(),reference:ref,client_id:d.client_id||null,types_bien:d.types||[],transaction:d.transaction,surface_min_m2:+d.smin||null,surface_max_m2:+d.smax||null,budget_max:+d.budget||null,urgence:d.urgence||null,statut:d.statut,date_demande:today(),agent:d.agent||null,notes:d.notes||null,localites:d.loc||[],tolerance_budget_pct:+d.tolb||15,tolerance_surface_pct:+d.tols||15,_w:prev?undefined:JSON.parse(JSON.stringify(d))}}
function recapD(){const d=W.d,c=d.client_id?getC(d.client_id):null;
  const miss=STEPS_D.map((s,i)=>s.v&&i<STEPS_D.length-1?s.v():null).filter(Boolean);
  const dm=buildDemande(true),comp=D.offres.map(o=>({o,m:score(dm,o)})).filter(z=>z.m.pct>=75).sort((a,b)=>b.m.pct-a.m.pct);
  return `${miss.length?`<div class="warn">À compléter avant d'enregistrer : ${miss.map(esc).join(' · ')}</div>`:`<div class="okbox">Tout est prêt — vérifiez puis enregistrez.</div>`}
  <div class="recap"><div class="rt">Demande</div>${rr('Référence',esc(dm.reference)+' <small style="color:var(--gris)">(attribuée automatiquement)</small>')}${rr('Client',c?esc(c.nom)+(c.societe?' · '+esc(c.societe):''):'')}${rr('Transaction',esc({achat:'Achat',location:'Location',cession:'Cession',les_deux:'Les deux'}[d.transaction]))}
  <div class="rt">Besoin</div>${rr('Types de bien',esc((d.types||[]).map(t=>BL[t]).join(', ')))}${rr('Surface',(d.smin||d.smax)?esc((d.smin||'?')+' – '+(d.smax||'?')+' m²'):'')}${rr('Budget max',d.budget?(d.transaction==='location'?nbf(Math.round(d.budget*12))+' € / an <small style="color:var(--gris)">('+nbf(Math.round(d.budget*100)/100)+' € / mois)</small>':nbf(+d.budget)+' €'):'')}${rr('Urgence',esc(d.urgence))}${rr('Critères',esc([d.parking&&('Parking'+(d.parking_nb?' ('+d.parking_nb+' pl.)':'')),d.pmr&&'PMR'].filter(Boolean).join(' · ')))}
  <div class="rt">Localités</div>${rr('Zones',esc((d.loc||[]).join(', ')))}</div>
  <div class="wf" style="margin-top:12px"><label>Infos particulières</label><textarea id="w-notes" style="min-height:80px" oninput="wzSet('notes',this.value)">${esc(d.notes||'')}</textarea></div>
  <div class="card" style="margin-top:12px"><h3>${ic('link',15)} Offres compatibles dès l'enregistrement (${comp.length})</h3>${comp.slice(0,5).map(z=>`<div class="li" style="cursor:default"><b>${esc(z.o.reference)}</b><small>${esc(BL[z.o.type_bien]||'')} · ${esc(z.o.ville)} · ${z.o.surface_m2} m²</small><span class="sp">${z.m.pct}%</span></div>`).join('')||`<div class="empty" style="padding:14px"><b>Aucune offre compatible pour l'instant</b></div>`}</div>`}

/* ---- moteur ---- */
/* statut d'un bien / d'une demande, suppression */
function setStatB(id,k){oedits[id]={...(oedits[id]||{}),statut:k};SV('oedits',oedits);refreshData();toast('Statut : '+BSTAT.find(b=>b[0]===k)[1]);VIEWS.biens()}
function setDStatut(id,k){dedits[id]={...(dedits[id]||{}),statut:k};SV('dedits',dedits);refreshData();toast(k==='cloturee'?'Demande clôturée':'Demande réactivée');VIEWS.demandes()}
function setDEtape(id,n){dedits[id]={...(dedits[id]||{}),etape:n};SV('dedits',dedits);refreshData();VIEWS.demandes()}
function delFiche(kind,id){if(kind==='offre'){const fs=files.filter(f=>f.owner==='offre:'+id);if(fs.length){files=files.filter(f=>f.owner!=='offre:'+id);SV('files',files);sb.storage.from(BUCKET).remove(fs.map(f=>f.path))}}
  const E=kind==='offre'?oedits:dedits;E[id]={...(E[id]||{}),del:true};SV(kind==='offre'?'oedits':'dedits',E);props=props.filter(p=>p.offre!==id&&p.demande!==id);SV('props',props);
  S.delB=S.delD=null;if(kind==='offre')S.bienSel=null;else S.demSel=null;refreshData();toast(kind==='offre'?'Offre supprimée':'Demande supprimée');route()}
/* propositions d'un bien à un client (historique + état) */
const propOf=(o,d)=>props.find(p=>p.offre===o&&p.demande===d);
function propCell(o,d){const p=propOf(o,d);return p?`<select class="sm" onclick="event.stopPropagation()" onchange="setPropEtat('${p.id}',this.value)" style="margin-left:8px">${PETATS.map(([k,l])=>`<option value="${k}" ${p.etat===k?'selected':''}>${l}</option>`).join('')}</select>`
  :`<button class="btn sec sm" style="margin-left:8px" onclick="event.stopPropagation();propose('${o}','${d}')">Proposer</button>`}
function propose(oid,did){if(propOf(oid,did))return;const o=D.offres.find(x=>x.id===oid),d=D.demandes.find(x=>x.id===did);if(!o||!d)return;
  props.unshift({id:'p'+Date.now(),offre:oid,demande:did,date:today(),etat:'envoyee'});SV('props',props);
  if(d.client_id){notes.unshift({id:'n'+Date.now(),contact:d.client_id,date:today(),type:'email',texte:'Proposition du bien '+o.reference+' ('+(o.adresse||o.ville||'')+') à la demande '+d.reference,auteur:ME.agent});SV('notes',notes)}
  if((d.etape??1)<2){dedits[did]={...(dedits[did]||{}),etape:2};SV('dedits',dedits);refreshData()}
  toast('Proposition enregistrée : '+o.reference+' → '+d.reference);route()}
function setPropEtat(id,k){const p=props.find(x=>x.id===id);if(!p)return;p.etat=k;SV('props',props);
  if(k==='visite_prevue'||k==='visite_faite'){const d=D.demandes.find(x=>x.id===p.demande);if(d&&(d.etape??1)<3){dedits[d.id]={...(dedits[d.id]||{}),etape:3};SV('dedits',dedits);refreshData()}}
  if(k==='conclu'){const d=D.demandes.find(x=>x.id===p.demande);if(d){dedits[d.id]={...(dedits[d.id]||{}),etape:4};SV('dedits',dedits);refreshData()}}
  toast('État : '+PETATS.find(e=>e[0]===k)[1]);route()}
function delProp(id){props=props.filter(x=>x.id!==id);SV('props',props);route()}
function propCard(kind,id){const L=props.filter(p=>kind==='o'?p.offre===id:p.demande===id);
  return `<div class="card" style="margin-top:14px"><h3>${ic('mail',15)} Propositions (${L.length})</h3>${L.map(p=>{const o=D.offres.find(x=>x.id===p.offre),d=D.demandes.find(x=>x.id===p.demande);if(!o||!d)return '';const c=getC(d.client_id);
    return `<div class="li" onclick="go('${kind==='o'?'#/demandes/'+d.id:'#/biens/'+o.id}')"><b>${esc(kind==='o'?d.reference:o.reference)}</b><small>${esc(kind==='o'?(c?c.nom:'—'):(o.adresse||o.ville||''))} · ${fdate(p.date)}</small><span class="sp">${propCell(o.id,d.id)}<button class="iconbtn" title="Retirer" onclick="event.stopPropagation();delProp('${p.id}')">${ic('x',15)}</button></span></div>`}).join('')||`<div class="empty"><b>Aucune proposition</b>Utilisez « Proposer » dans la liste ci-dessus.</div>`}</div>`}

/* ===== Photos & documents d'un bien (stockage privé « crm-fichiers », rangé par référence) =====
   Une ligne « files » par fichier : {id, owner:'offre:<id>', kind:'photo|plan|mandat|dossier|autre', name, path, ord, principal, categorie}
   Rangement : offres/<REF>/photos/…  offres/<REF>/documents/… */
const BUCKET='crm-fichiers', KINDS=[['plan','Plan'],['mandat','Mandat'],['dossier','Dossier'],['autre','Autre']];
const URLS={};
const fOf=(owner,kind)=>files.filter(f=>f.owner===owner&&(kind?f.kind===kind:true)).sort((a,b)=>(a.ord||0)-(b.ord||0));
async function signed(paths){const need=paths.filter(p=>!URLS[p]||URLS[p].exp<Date.now());
  if(need.length){const {data}=await sb.storage.from(BUCKET).createSignedUrls(need,3600);(data||[]).forEach(d=>{if(d.signedUrl)URLS[d.path]={url:d.signedUrl,exp:Date.now()+3300000}})}
  return p=>URLS[p]&&URLS[p].url}
async function renderMedia(o){const el=$('#bmedia');if(!el)return;const owner='offre:'+o.id,ph=fOf(owner,'photo'),docs=files.filter(f=>f.owner===owner&&f.kind!=='photo');
  const url=await signed([...ph,...docs].map(f=>f.path));if(S.bienSel!==o.id||!$('#bmedia'))return;
  el.innerHTML=`<div class="card" style="margin-top:14px"><h3 style="display:flex;align-items:center">${ic('building',15)} Photos (${ph.length})<label class="btn sec sm" style="margin-left:auto;cursor:pointer">${ic('plus',13)}Ajouter<input type="file" accept="image/*" multiple hidden onchange="addFiles('${o.id}','photo',this)"></label></h3>
    <div class="cb" style="display:flex;flex-wrap:wrap;gap:10px;padding:12px 16px">${ph.map(f=>`<div style="width:150px"><div style="position:relative"><img src="${url(f.path)||''}" style="width:150px;height:105px;object-fit:cover;border-radius:8px;border:1.5px solid ${f.principal?'var(--teal)':'var(--gris-clair)'}" loading="lazy"><span class="chip ${f.principal?'c-vert':'c-gris'}" style="position:absolute;left:6px;top:6px;cursor:pointer" onclick="setCover('${f.id}')" title="Photo principale">${f.principal?'★ Principale':'☆'}</span><button class="iconbtn" style="position:absolute;right:4px;top:4px;background:#fff" title="Supprimer" onclick="delFile('${f.id}')">${ic('x',14)}</button></div><small style="color:var(--gris)">${esc(f.categorie||'')}</small></div>`).join('')||'<span style="color:var(--gris);font-size:13px">Aucune photo</span>'}</div></div>
   <div class="card" style="margin-top:14px"><h3 style="display:flex;align-items:center;gap:8px">${ic('file',15)} Documents (${docs.length})<span style="margin-left:auto;display:flex;gap:6px;align-items:center"><select id="dockind" class="sm">${KINDS.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select><label class="btn sec sm" style="cursor:pointer">${ic('plus',13)}Ajouter<input type="file" multiple hidden onchange="addFiles('${o.id}',$('#dockind').value,this)"></label></span></h3>
    <div class="cb">${docs.map(f=>`<div class="kv"><span class="k">${esc((KINDS.find(k=>k[0]===f.kind)||[0,f.kind])[1])}</span><span class="v"><a href="${url(f.path)||'#'}" target="_blank" style="color:var(--teal)">${esc(f.name)}</a></span><span><button class="iconbtn" title="Supprimer" onclick="delFile('${f.id}')">${ic('x',14)}</button></span></div>`).join('')||'<div class="empty" style="padding:12px"><b>Aucun document</b>Plans, mandat, dossier…</div>'}</div></div>`}
async function addFiles(oid,kind,inp){const o=D.offres.find(x=>x.id===oid);const list=[...inp.files];inp.value='';if(!o||!list.length)return;toast('Envoi de '+list.length+' fichier(s)…');let ok=0;
  for(const file of list){const safe=file.name.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9._-]+/g,'-');const n=fOf('offre:'+oid,kind==='photo'?'photo':null).length+1;
    const path=`offres/${o.reference}/${kind==='photo'?'photos':'documents'}/${String(Date.now()).slice(-6)}-${safe}`;
    const {error}=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(error){toast('Échec : '+file.name+' ('+error.message+')');continue}
    files.push({id:'f'+Date.now()+'-'+ok,owner:'offre:'+oid,kind,name:file.name,path,ord:n,principal:kind==='photo'&&!fOf('offre:'+oid,'photo').length,categorie:null,created:today()});ok++}
  SV('files',files);toast(ok+' fichier(s) ajouté(s)');renderMedia(o)}
function setCover(id){const f=files.find(x=>x.id===id);if(!f)return;files.filter(x=>x.owner===f.owner&&x.kind==='photo').forEach(x=>x.principal=x.id===id);SV('files',files);renderMedia(D.offres.find(x=>'offre:'+x.id===f.owner))}
async function delFile(id){const i=files.findIndex(x=>x.id===id);if(i<0)return;const f=files[i];files.splice(i,1);SV('files',files);await sb.storage.from(BUCKET).remove([f.path]);
  if(f.kind==='photo'&&f.principal){const n=fOf(f.owner,'photo')[0];if(n){n.principal=true;SV('files',files)}}toast('Fichier supprimé');renderMedia(D.offres.find(x=>'offre:'+x.id===f.owner))}
/* reconstitue les réponses de l'assistant à partir d'une fiche (offres / demandes d'origine, ou enregistrées avant l'ajout de l'historique complet) */
function wOffre(o){return Object.assign({},DEFAUTS.offre,{type_bien:o.type_bien,transaction:o.transaction,statut:statB(o),adresse:o.adresse||'',cp:o.code_postal||'',ville:o.ville||'',secteur:o.secteur||'',surface:o.surface_m2||'',loyer:o.loyer_annuel_m2||'',prix:o.prix_vente||'',loyer_type:o.loyer_type||'HT HC',charges:o.charges||'',titre:o.titre||'',dpe:o.dpe||'',dpe_conso:o.dpe_conso||'',agent:o.agent,client_id:o.client_id,desc:o.description||'',bail:o.bail||DEFAUTS.offre.bail,indexation:o.indexation||DEFAUTS.offre.indexation,equip:o.equip||{},acces:o.acces||[],env:o.env||[]})}
function wDemande(d){return Object.assign({},DEFAUTS.demande,{client_id:d.client_id,types:d.types_bien||[],transaction:d.transaction,smin:d.surface_min_m2||'',smax:d.surface_max_m2||'',budget:d.budget_max||'',urgence:d.urgence||'',statut:d.statut,agent:d.agent,notes:d.notes||'',loc:d.localites||[],tolb:d.tolerance_budget_pct||15,tols:d.tolerance_surface_pct||15})}
function editFiche(kind,id){const rec=(kind==='offre'?D.offres:D.demandes).find(x=>x.id===id);if(!rec)return;
  openWizard(kind,JSON.parse(JSON.stringify(rec._w||(kind==='offre'?wOffre(rec):wDemande(rec)))),id)}
function openWizard(kind,prefill,editId){
  $('#plusmenu').style.display='none';
  W.edit=editId||null;
  W.k=kind;W.step=0;W.seen={0:1};W.msg='';
  let draft=null;try{draft=JSON.parse(localStorage.getItem('rf_draft_'+kind)||'null')}catch(e){}
  W.d=Object.assign({},JSON.parse(JSON.stringify(DEFAUTS[kind])),draft&&!prefill?draft:{},prefill||{});
  if(editId)draft=null;
  W.drafted=!!(draft&&!prefill&&Object.keys(draft).length>2);
  if(W.drafted){const st=parseInt(localStorage.getItem('rf_draftstep_'+kind)||'0',10),n=(kind==='offre'?STEPS_O:STEPS_D).length;W.step=st>=0&&st<n?st:0;for(let i=0;i<=W.step;i++)W.seen[i]=1}
  $('#wz').classList.add('open');wzRender();
}
function wzClose(){$('#wz').classList.remove('open');W.k=null;W.edit=null;localStorage.removeItem('rf_wzopen')}
function wzDiscard(){localStorage.removeItem('rf_draft_'+W.k);W.d=JSON.parse(JSON.stringify(DEFAUTS[W.k]));W.drafted=false;W.step=0;localStorage.removeItem('rf_draftstep_'+W.k);wzRender();toast('Brouillon effacé')}
function wzRender(){
  const ST=W.k==='offre'?STEPS_O:STEPS_D;
  $('#wbox').innerHTML=`<div class="wh"><h2>${W.edit?(W.k==='offre'?'Modifier le bien':'Modifier la demande'):(W.k==='offre'?'Nouveau bien':'Nouvelle demande')}</h2><span class="ref">${W.edit?'Modification en cours':'Brouillon enregistré automatiquement'}</span><button class="iconbtn" onclick="wzClose()" title="Fermer">${ic('x',18)}</button></div>
   <div class="wsteps">${ST.map((s,i)=>`<div class="ws ${i<W.step?'done':''} ${i===W.step?'cur':''}" onclick="wzGo(${i})"><i>${i<W.step?ic('ok'):i+1}</i>${s.l}</div>`).join('')}</div>
   ${W.drafted?`<div class="dbanner">${ic('note',15)}Brouillon repris là où vous l'aviez laissé. <a onclick="wzDiscard()">Effacer et recommencer</a></div>`:''}
   <div class="wb" id="wb"></div>
   <div class="wfoot"><span class="msg" id="wmsg"></span><button class="btn sec" onclick="wzClose()">Annuler</button>
     ${W.step>0?`<button class="btn sec" onclick="wzPrev()">← Précédent</button>`:''}
     ${W.step<ST.length-1?`<button class="btn pri" onclick="wzNext()">Suivant →</button>`:`<button class="btn or" onclick="wzFinish()">${ic('ok',16)}${W.edit?'Enregistrer les modifications':'Enregistrer '+(W.k==='offre'?'le bien':'la demande')}</button>`}</div>`;
  wzBody();
}
function wzBody(){const ST=W.k==='offre'?STEPS_O:STEPS_D;const st=ST[W.step];$('#wb').innerHTML=st.h();if(st.after)st.after();const m=$('#wmsg');if(m)m.textContent=W.msg||''}
function wzGo(i){const ST=W.k==='offre'?STEPS_O:STEPS_D;if(i>W.step){for(let j=W.step;j<i;j++){const m=ST[j].v&&ST[j].v();if(m){W.msg=m;return wzBody()}}}W.step=i;W.msg='';wzSave();wzRender()}
function wzNext(){const ST=W.k==='offre'?STEPS_O:STEPS_D;const m=ST[W.step].v&&ST[W.step].v();if(m){W.msg=m;return wzBody()}W.step++;W.msg='';wzRender();$('#wb').scrollTop=0}
function wzPrev(){W.step--;W.msg='';wzRender()}
function wzFinish(){const ST=W.k==='offre'?STEPS_O:STEPS_D;
  for(let j=0;j<ST.length-1;j++){const m=ST[j].v&&ST[j].v();if(m){W.step=j;W.msg=m;wzRender();return}}
  if(W.edit){const isO=W.k==='offre',L=isO?newO:newD,cur=(isO?D.offres:D.demandes).find(x=>x.id===W.edit);
    if(cur){const n=isO?buildOffre(false):buildDemande(false);n.id=cur.id;n.reference=cur.reference;n.created_at=cur.created_at;n.date_demande=cur.date_demande;if(!isO){n.statut=cur.statut;n.etape=cur.etape}
      const i=L.findIndex(x=>x.id===cur.id);
      if(i>=0){L[i]=n;SV(isO?'newo':'newd',L);const E=isO?oedits:dedits;if(E[cur.id]){delete E[cur.id];SV(isO?'oedits':'dedits',E)}}
      else{const E=isO?oedits:dedits;E[cur.id]=n;SV(isO?'oedits':'dedits',E)}
      refreshData();const ref=n.reference,id=n.id,k=W.k;wzClose();toast('Modifications enregistrées ('+ref+')');go((k==='offre'?'#/biens/':'#/demandes/')+id);route();return}}
  if(W.k==='offre'){const o=buildOffre(false);newO.unshift(o);SV('newo',newO);S.bienSel=o.id;refreshData();localStorage.removeItem('rf_draft_offre');localStorage.removeItem('rf_draftstep_offre');wzClose();toast('Bien '+o.reference+' enregistré');go('#/biens/'+o.id);route()}
  else{const dm=buildDemande(false);newD.unshift(dm);SV('newd',newD);S.demSel=dm.id;refreshData();localStorage.removeItem('rf_draft_demande');localStorage.removeItem('rf_draftstep_demande');wzClose();toast('Demande '+dm.reference+' enregistrée');go('#/demandes/'+dm.id);route()}
}
$('#wz').addEventListener('mousedown',e=>{if(e.target.id==='wz')wzClose()});
document.addEventListener('click',e=>{if(!e.target.closest('.cmb')){const r=$('#wz-clres');if(r)r.style.display='none'}if(!e.target.closest('.cmb')){const a=$('#wz-adrres');if(a)a.style.display='none'}});

/* icônes statiques + démarrage */
$('#ic-set').innerHTML=ic('settings');$('#ic-col').innerHTML=ic('chevL');$('#ic-out').innerHTML=ic('x');$('#ic-s').innerHTML=ic('search',17);$('#ic-p').innerHTML=ic('plus',16);$('#ic-b').innerHTML=ic('bell',20);
/* fiches enregistrées avant l'ajout du bouton Modifier : on reconstruit ce qu'on peut des données de l'assistant */
{let ch=0;newO.forEach(o=>{if(!o._w){ch=1;o._w=wOffre(o)}});newD.forEach(d=>{if(!d._w){ch=1;d._w=wDemande(d)}});if(ch){SV('newo',newO);SV('newd',newD)}}
window.addEventListener('hashchange',route);route();
/* après un rechargement de la page, rouvrir l'assistant là où on l'avait laissé */
{const k=localStorage.getItem('rf_wzopen');if(k&&DEFAUTS[k])openWizard(k)}