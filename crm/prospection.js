/* ==========================================================================
   PROSPECTION — annonces concurrentes agrégées (réseau enterprise-immo-*.fr :
   Amiens, Lille, Oise, Aisne). Lecture seule, table `prospection_locaux`
   alimentée par un script de scraping externe (adresse déduite du point GPS
   des fiches). Expose window.H3C_PROSPECTION. Réutilise les helpers globaux
   de index.html (sb, C, esc, panel, vide, erreur, charge).
   ========================================================================== */
(function(){
  let LISTE = [];
  let FILTRE_OP = '', FILTRE_TYPE = '', FILTRE_SITE = '', RECHERCHE = '';

  const SITE_LABEL = {
    'enterprise-immo-amiens': 'Amiens',
    'enterprise-immo-lille': 'Lille',
    'enterprise-immo-oise': 'Oise',
    'enterprise-immo-aisne': 'Aisne (St-Quentin)',
  };

  function ligne(p){
    return `<tr>
      <td><b>${esc(p.ville||'—')}</b></td>
      <td>${esc(p.type||'—')}</td>
      <td><span class="tag ${p.operation==='Vente'?'blue':'green'}">${esc(p.operation||'—')}</span></td>
      <td>${esc(p.surface||'—')}</td>
      <td>${esc(p.adresse||'—')}</td>
      <td><span class="tag">${esc(SITE_LABEL[p.source_domaine]||p.source_domaine||'—')}</span></td>
      <td><a href="${esc(p.lien)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Voir l'annonce ↗</a></td>
    </tr>`;
  }

  function filtrer(){
    const q = (RECHERCHE||'').toLowerCase().trim();
    return LISTE.filter(p=>{
      if(FILTRE_OP && p.operation!==FILTRE_OP) return false;
      if(FILTRE_TYPE && p.type!==FILTRE_TYPE) return false;
      if(FILTRE_SITE && p.source_domaine!==FILTRE_SITE) return false;
      if(q && !([p.ville,p.adresse,p.reference].filter(Boolean).join(' ').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function rafraichirTbody(){
    const tb = document.getElementById('pr-tbody'); if(!tb) return;
    const liste = filtrer();
    tb.innerHTML = liste.length ? liste.map(ligne).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--gris-fonce);padding:20px">Aucune annonce ne correspond à ces filtres.</td></tr>`;
    const c = document.getElementById('pr-count'); if(c) c.textContent = `${liste.length} annonce${liste.length>1?'s':''}`;
  }

  async function vue(){
    charge();
    const { data, error } = await sb.from('prospection_locaux').select('*').order('ville',{ascending:true});
    if(error) return erreur(error);
    LISTE = data||[];

    const nbLoc = LISTE.filter(p=>p.operation==='Location').length;
    const nbVente = LISTE.filter(p=>p.operation==='Vente').length;
    const sites = [...new Set(LISTE.map(p=>p.source_domaine))];
    const types = [...new Set(LISTE.map(p=>p.type).filter(Boolean))].sort();

    const stats = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;padding:16px 16px 4px">
      <div class="stat"><div class="n">${LISTE.length}</div><div class="l">Annonces suivies</div></div>
      <div class="stat"><div class="n">${nbLoc}</div><div class="l">À louer</div></div>
      <div class="stat"><div class="n">${nbVente}</div><div class="l">À vendre</div></div>
      <div class="stat"><div class="n">${sites.length}</div><div class="l">Sites concurrents suivis</div></div>
    </div>`;

    const filtres = `<div style="padding:12px 16px;border-bottom:1px solid var(--gris-clair);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <select onchange="H3C_PROSPECTION._op(this.value)" style="padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
        <option value="">Location &amp; Vente</option>
        <option value="Location" ${FILTRE_OP==='Location'?'selected':''}>Location</option>
        <option value="Vente" ${FILTRE_OP==='Vente'?'selected':''}>Vente</option>
      </select>
      <select onchange="H3C_PROSPECTION._type(this.value)" style="padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
        <option value="">Tous les types</option>
        ${types.map(t=>`<option value="${esc(t)}" ${FILTRE_TYPE===t?'selected':''}>${esc(t)}</option>`).join('')}
      </select>
      <select onchange="H3C_PROSPECTION._site(this.value)" style="padding:9px 11px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
        <option value="">Tous les sites</option>
        ${sites.map(s=>`<option value="${esc(s)}" ${FILTRE_SITE===s?'selected':''}>${esc(SITE_LABEL[s]||s)}</option>`).join('')}
      </select>
      <input id="pr-search" type="search" autocomplete="off" placeholder="🔎 Ville, adresse, réf…" value="${esc(RECHERCHE)}"
        oninput="H3C_PROSPECTION._search(this.value)"
        style="flex:1;min-width:200px;max-width:380px;padding:9px 12px;border:1.5px solid var(--gris-clair);border-radius:9px;font:inherit">
      <span id="pr-count" style="font-size:.85rem;color:var(--gris-fonce);font-weight:600">${LISTE.length} annonces</span>
    </div>`;

    const liste = filtrer();
    const corps = stats + filtres + (liste.length
      ? `<div class="tscroll"><table><thead><tr>
           <th>Ville</th><th>Type</th><th>Transaction</th><th>Surface</th><th>Adresse</th><th>Site</th><th>Lien</th>
         </tr></thead><tbody id="pr-tbody">${liste.map(ligne).join('')}</tbody></table></div>`
      : vide('Aucune annonce trouvée.'));

    C().innerHTML = panel('Prospection — annonces concurrentes', `${LISTE.length} annonce(s) sur ${sites.length} site(s) concurrents`, corps);
  }

  window.H3C_PROSPECTION = {
    vue,
    _op(v){ FILTRE_OP=v; rafraichirTbody(); },
    _type(v){ FILTRE_TYPE=v; rafraichirTbody(); },
    _site(v){ FILTRE_SITE=v; rafraichirTbody(); },
    _search(v){ RECHERCHE=v; rafraichirTbody(); },
  };
})();
