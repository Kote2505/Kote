'use strict';

/* ════════════════════════════════════════════════════════
   kote-admin.js — Admin settings & configuration panel
   sheetSVG (imposition preview), ADMIN IIFE.
   Page: admin.html only
   Requires: config.js, kote-core.js, kote-catalog.js,
             kote-orders.js, kote-ops.js
   ════════════════════════════════════════════════════════ */


/* ════════════════════════════════════════════════════════
   ADMIN  — password guard + full configuration panel
   (sheetSVG, _delBtn, _addBtn, DRAG_HANDLE_SVG, _sbInlineConfig
    are defined in admin-imposition.js which loads before this file)
   ════════════════════════════════════════════════════════ */

const ADMIN = (() => {
  const PASS = 'mkbaich';
  const TABS = [
    { id:'pricing',       label:'Tarifs & Marges'  },
    { id:'livraison',     label:'Livraison & Délais'},
    { id:'papers',        label:'Papiers'           },
    { id:'finishes',      label:'Pelliculage'       },
    { id:'addons',        label:'Façonnage'         },
    { id:'gf',            label:'Grand Format'      },
    { id:'binding',       label:'Reliure'           },
    { id:'carnet',        label:'Carnet NCR'        },
    { id:'products',      label:'Produits'          },
    { id:'navigation',    label:'Navigation'        },
    { id:'identite',      label:'Identité'          },
    { id:'notifications', label:'Notifications'     },
    { id:'images',        label:'Documents'         },
    { id:'connexion',     label:'Connexion'         },
    { id:'auth',          label:'Authentification'  },
    { id:'edge_fn',       label:'Edge Functions'    },
    { id:'design',        label:'Conception'        },
  ];
  let activeTab = 'pricing';
  let authed    = false;
  let activeProd = null;
  let activeSec  = null;   // index of currently expanded section card
  let activeGroup    = null;  // index of currently expanded sidebar group card
  let _sgrpNewDraft  = null;  // { icon } while the creation form is open
  let _newProdMode = false;

  /* Icons available for navigation groups — subset of IC keys that make visual sense */
  const SGRP_ICON_KEYS = [
    'layout','image','book','book-open','file-text','tag','flag','scroll',
    'layers','pen-tool','credit-card','truck','printer','clock','mail',
    'alert','info','file-plus',
  ];
  let _newProdDraft = {};

  /* ── admin.html IS the admin — open/close are stubs ── */
  function open() { if (DB) _showContent(); }

  /* ── Toolbar nav ── */
  /* ── Mode: Dashboard ── */
  function goToDash() {
    _exitCatalogueMode();
    _hideSettings();
    closeNav();
    _setToolbarActive('admBtnDash');
    _setTitle('Tableau de bord');
    _hideAll();
    _hideSplit();
    const vDash = $('vDash');
    if (vDash) { vDash.style.display = 'flex'; vDash.style.flex = '1'; }
    DASHBOARD.refresh?.();
  }

  /* ── Mode: Paramètres ── */
  function toggleNav() {
    const isMobile = window.innerWidth <= 640;
    if (isMobile) {
      // On mobile: use the slide-in drawer (desktop sidebar is hidden via CSS)
      const drawer = $('admNavDrawer');
      const ov     = $('admNavOv');
      const isOpen = drawer?.classList.contains('open');
      if (isOpen) {
        closeNav();
      } else {
        _buildNav();
        drawer?.classList.add('open');
        ov?.classList.add('open');
        // Make sure settings content is visible behind the drawer
        if ($('admBody') && $('admBody').style.display === 'none') _openSettings();
      }
      return;
    }
    const sidebar = $('admSettingsSidebar');
    const isOpen  = sidebar && sidebar.style.display !== 'none';
    if (isOpen) {
      _hideSettings();
    } else {
      _openSettings();
    }
  }

  function _openSettings() {
    _exitCatalogueMode();
    _hideAll();
    _hideSplit();
    const sidebar = $('admSettingsSidebar');
    const body    = $('admBody');
    if (sidebar) sidebar.style.display = 'flex';
    if (body)    body.style.display    = 'block';
    $('admBtnSettings')?.classList.add('on');
    $('admBtnDash')?.classList.remove('on');
    $('admBtnCat')?.classList.remove('on');
    _buildSettingsNav();
    _renderTab(activeTab);
    _setTitle('Paramètres');
  }

  function _hideSettings() {
    const sidebar = $('admSettingsSidebar');
    const body    = $('admBody');
    if (sidebar) sidebar.style.display = 'none';
    if (body)    body.style.display    = 'none';
    $('admBtnSettings')?.classList.remove('on');
  }

  function closeNav() {
    $('admNavOv')?.classList.remove('open');
    $('admNavDrawer')?.classList.remove('open');
  }

  /* ── Mode: Catalogue ── */
  function goToProducts() {
    _hideAll();
    _hideSettings();
    _hideSplit();
    closeNav();
    _setToolbarActive('admBtnCat');
    _setTitle('Catalogue');
    _enterCatalogueMode();
  }

  let _catalogueMode = false;
  function _enterCatalogueMode() {
    _catalogueMode = true;
    const wrap = $('admCatWrap');
    if (wrap) wrap.style.display = 'flex';
    UI.buildSidebar();
    const vEmpty = $('vEmpty');
    if (vEmpty) { vEmpty.style.display = 'flex'; }
    document.body.classList.add('adm-cat-mode');
    detailOpen = true;
  }

  /* ── Mobile: product picker sheet ── */
  let _sheetOpen = false;

  function toggleCatSheet() {
    _sheetOpen ? closeCatSheet() : openCatSheet();
  }

  function openCatSheet() {
    _sheetOpen = true;
    _buildCatSheet();
    $('admCatSheetOv')?.classList.add('open');
    $('admCatSheet')?.classList.add('open');
    // Update banner chevron
    const chev = $('admCatBannerChev');
    if (chev) chev.style.transform = 'rotate(180deg)';
  }

  function closeCatSheet() {
    _sheetOpen = false;
    $('admCatSheetOv')?.classList.remove('open');
    $('admCatSheet')?.classList.remove('open');
    const chev = $('admCatBannerChev');
    if (chev) chev.style.transform = '';
  }

  function _buildCatSheet() {
    const body = $('admCatSheetBody');
    if (!body) return;
    body.innerHTML = '';
    let openGroup = null; // track which group list is open

    (DB.sidebar_groups || []).forEach(grp => {
      if (!grp.products?.length) return;
      const sec = document.createElement('div');
      sec.className = 'sb-sec';

      // Header row
      const hdr = document.createElement('div');
      hdr.className = 'sb-grp';
      hdr.innerHTML = `<span class="sb-grp-lbl">${grp.label}</span><span class="sb-chev">${IC['chev-r']}</span>`;

      // Product list
      const list = document.createElement('div');
      list.className = 'sb-list';

      grp.products.forEach(pid => {
        const p = (DB.products || []).find(x => x.id === pid);
        if (!p) return;
        const el = document.createElement('div');
        el.className = 'sb-item';
        el.id = 'sheet-sb-' + p.id;
        el.innerHTML = `<div class="sb-ico">${IC[p.icon] || IC.layout}</div><span class="sb-lbl">${p.name}</span>`;
        el.onclick = () => {
          loadProduct(p.id);
          closeCatSheet();
          // Update banner label
          const lbl = $('admCatBannerLabel');
          if (lbl) lbl.textContent = p.name;
        };
        list.appendChild(el);
      });

      // Toggle accordion
      hdr.onclick = () => {
        const isOpen = hdr.classList.contains('open');
        // Close all
        body.querySelectorAll('.sb-grp').forEach(h => h.classList.remove('open'));
        body.querySelectorAll('.sb-list').forEach(l => l.classList.remove('open'));
        if (!isOpen) { hdr.classList.add('open'); list.classList.add('open'); }
      };

      sec.appendChild(hdr);
      sec.appendChild(list);
      body.appendChild(sec);
    });

    // Open first group by default
    const firstHdr  = body.querySelector('.sb-grp');
    const firstList = body.querySelector('.sb-list');
    if (firstHdr)  firstHdr.classList.add('open');
    if (firstList) firstList.classList.add('open');
  }

  function _exitCatalogueMode() {
    if (!_catalogueMode) return;
    _catalogueMode = false;
    const wrap = $('admCatWrap');
    if (wrap) wrap.style.display = 'none';
    document.body.classList.remove('adm-cat-mode');
    detailOpen = false;
  }

  /* ── Settings nav (persistent sidebar) ── */
  function _buildSettingsNav() {
    const nav = $('admSettingsNav'); if (!nav) return;
    nav.innerHTML = NAV_GROUPS.map(g => `
      <div class="adm-nav-group">
        <span class="adm-nav-group-lbl">${g.label}</span>
        ${g.items.map(it => `
          <button class="adm-nav-item${activeTab===it.id?' on':''}" onclick="ADMIN._settingsSelectTab('${it.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${it.icon}</svg>
            <span>${it.label}</span>
          </button>`).join('')}
      </div>
    `).join('<div class="adm-nav-divider"></div>');
  }

  /* ── Tab builder dispatch — shared by _settingsSelectTab + _renderTab ── */
  const _TAB_BUILDERS = () => ({
    /* Boutique */
    identite:_bIdentite, contact:_bIdentite,
    images:_bImages,
    notifications:_bNotifications,
    /* Tarification */
    marge:_bMarge, pricing:_bMarge,
    livraison:_bLivraison, turnaround:_bLivraison,
    /* Production */
    papers:_bPapers,
    impression:_bImpression,
    grand_format:_bGrandFormat,
    gf_mat:_bGrandFormat, pancarte_mat:_bGrandFormat, gf:_bGrandFormat,
    finitions:_bFinitions,
    finishes:_bFinitions, addons:_bFinitions, binding:_bFinitions, carnet:_bFinitions,
    gadgets_mat:_bGadgetsMat,
    /* Services graphiques */
    design:_bDesign, conception:_bDesign,
    /* Catalogue */
    products:_bProducts, navigation:_bSidebar, sidebar:_bSidebar,
    /* Système */
    connexion:_bConnexion,
    auth:_bAuth,
    edge_fn:_bDeploy,
    export:_bExport,
  });

  function _settingsSelectTab(id) {
    if (activeProd) {
      activeProd = null; activeSec = null;
      _hideSplit();
    }
    activeTab = id;
    _buildSettingsNav();
    const body = $('admBody');
    if (body) { body.style.display = 'block'; body.innerHTML = _TAB_BUILDERS()[id]?.() || ''; }
    if (id === 'export') _initExportTab();
    _setTitle(NAV_GROUPS.flatMap(g => g.items).find(it => it.id === id)?.label || id);
  }

  /* ── Hide all main views ── */
  function _hideAll() {
    ['vDB','vDash','admBody','admSplit','admCatWrap'].forEach(id => {
      const el = $(id); if (el) el.style.display = 'none';
    });
  }

  /* ── Show admin content tab (legacy / internal) ── */
  function _showContent(id) {
    if (id) activeTab = id;
    _openSettings();
  }

  /* ── Save + feedback (replaces close() sync logic) ── */
  function close() {
    if (DB_MOD.getSource() === 'supabase') {
      const st = $('supaSyncSt');
      if (st) { st.style.display='block'; st.style.color='var(--t3)'; st.textContent='⏳ Syncing…'; }
      DB_MOD.pushToSupabase().then(res => {
        if (!st) return;
        if (res.ok)                   { st.style.color='#22c55e'; st.textContent='✓ Saved'; setTimeout(()=>{st.style.display='none';},3000); }
        else if (res.reason==='permission') { st.style.color='#f59e0b'; st.textContent='⚠ Missing write policy'; }
        else if (res.reason==='no_rows')    { st.style.color='#f59e0b'; st.textContent='⚠ Write blocked — check RLS'; }
        else                               { st.style.color='#ef4444'; st.textContent=`✗ Sync failed (${res.reason})`; }
      });
    }
    // Legacy: close modal stubs
    $('admOverlay')?.classList.remove('open');
    $('admPanel')?.classList.remove('open');
  }

  /* ── Split view helpers ── */
  function _hideSplit() {
    const s = $('admSplit'); if (s) s.style.display = 'none';
    _pvOpen = false;
    const bot = $('admSplitBottom'); if (bot) bot.style.display = 'none';
    _updatePvChev();
  }

  let _pvOpen = false;
  function togglePreview() {
    _pvOpen = !_pvOpen;
    const bot = $('admSplitBottom');
    if (bot) bot.style.display = _pvOpen ? 'flex' : 'none';
    _updatePvChev();
    if (_pvOpen) _renderPreview();
  }
  function _updatePvChev() {
    const chev = $('admPvChev');
    if (chev) chev.style.transform = _pvOpen ? 'rotate(180deg)' : '';
  }

  /* ── Live preview (mini configurator + sheetSVG) ── */
  let _pvSel = {};
  let _pvProdId = null;

  function _renderPreview() {
    const bot = $('admSplitBottom'); if (!bot) return;
    const selEl = $('admPvSelectors'), resEl = $('admPvResult');
    if (!selEl || !resEl) return;

    const p = DB?.products?.find(x => x.id === activeProd);
    if (!p) { selEl.innerHTML = '<div class="adm-pv-loading">Aucun produit sélectionné</div>'; resEl.innerHTML=''; return; }

    // Reset pv state if product changed
    if (_pvProdId !== activeProd) {
      _pvProdId = activeProd;
      _pvSel = {
        sizeId:       p.sizes?.[0]?.id || null,
        paperStockId: null,
        quantity:     p.quantities?.[0] || 100,
        sides:        p.sides?.[0] || 'single',
      };
    }

    const sizes  = p.sizes || [];
    const papers = (DB.paper_stocks||[]).filter(ps => !ps.special && !ps.envelope);
    const qtys   = p.quantities || [100,250,500,1000];
    // fmt comes from globals.js — no local shadow needed
    selEl.innerHTML = `
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Format</div>
        <div class="adm-pv-chips">
          ${sizes.map(sz=>`<button class="adm-pv-chip${_pvSel.sizeId===sz.id?' on':''}" onclick="ADMIN._pvSet('sizeId','${sz.id}')">${sz.label}</button>`).join('')}
        </div>
      </div>
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Papier</div>
        <div class="adm-pv-chips">
          ${papers.slice(0,8).map(ps=>`<button class="adm-pv-chip${_pvSel.paperStockId===ps.id?' on':''}" onclick="ADMIN._pvSet('paperStockId','${ps.id}')">${ps.label}</button>`).join('')}
        </div>
      </div>
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Quantité</div>
        <div class="adm-pv-chips">
          ${qtys.map(q=>`<button class="adm-pv-chip${_pvSel.quantity===q?' on':''}" onclick="ADMIN._pvSet('quantity',${q})">${q.toLocaleString('fr-FR')}</button>`).join('')}
        </div>
      </div>
      <div class="adm-pv-section">
        <div class="adm-pv-lbl">Impression</div>
        <div class="adm-pv-chips">
          <button class="adm-pv-chip${_pvSel.sides==='single'?' on':''}" onclick="ADMIN._pvSet('sides','single')">Recto</button>
          <button class="adm-pv-chip${_pvSel.sides==='double'?' on':''}" onclick="ADMIN._pvSet('sides','double')">R/V</button>
        </div>
      </div>`;

    // Compute result
    const sizeObj = sizes.find(s => s.id === _pvSel.sizeId);
    const paper   = (DB.paper_stocks||[]).find(ps => ps.id === _pvSel.paperStockId) || papers[0];
    const qty     = _pvSel.quantity;
    const sh      = DB.sheet || { w:700, h:1000, margin:10, bleed:3 };

    if (!sizeObj || !paper) {
      resEl.innerHTML = '<div class="adm-pv-loading">Sélectionnez un format et un papier</div>';
      return;
    }

    const fit    = CALC.sheetFit(sizeObj.w, sizeObj.h, sh);
    const sheets = Math.ceil(qty / fit.n);
    const dbl    = _pvSel.sides === 'double';
    const costBreakdown = (() => {
      const disc    = CALC.qtyDisc(qty, DB.pricing || {});
      const pCost   = sheets * (paper.cost_per_sheet || 0);
      const numProfs = DB.numerique_profiles || [];
      const numP     = numProfs[0] || {};
      const cpf      = numP.cost_per_face || (DB.pricing||{}).print_single || 2;
      const faces    = dbl ? 2 : 1;
      const prCost   = sheets * cpf * faces;
      return { paper: pCost, print: prCost, total: (pCost + prCost) * (1 - disc) };
    })();
    const rawCost  = costBreakdown.total;
    const margin   = DB.pricing?.profit_margin || 0.4;
    const selling  = rawCost / (1 - margin);

    const svg = sheetSVG(fit, sizeObj.w, sizeObj.h, sh);
    resEl.innerHTML = `
      <div class="adm-pv-sheet">${svg}</div>
      <div class="adm-pv-breakdown">
        <div class="adm-pv-bd-row"><span>${fit.cols}×${fit.rows} = ${fit.n} pièces/feuille</span><span>${sheets.toLocaleString('fr-FR')} feuilles</span></div>
        <div class="adm-pv-bd-row"><span>Papier ${paper.label}</span><span>${fmt(costBreakdown.paper)} DH</span></div>
        <div class="adm-pv-bd-row"><span>Impression (${dbl?'R/V':'Recto'})</span><span>${fmt(costBreakdown.print)} DH</span></div>
        <div class="adm-pv-bd-row adm-pv-bd-total"><span>Total HT (marge ${Math.round(margin*100)}%)</span><span>${fmt(selling)} DH</span></div>
        <div class="adm-pv-bd-row adm-pv-bd-unit"><span>Prix unitaire</span><span>${fmt(selling/qty)} DH/pce</span></div>
      </div>`;
  }

  function _pvSet(key, val) {
    _pvSel[key] = val;
    _renderPreview();
  }

  /* ── Toolbar state helpers ── */
  function _setToolbarActive(btnId) {
    ['admBtnDash','admBtnCat','admBtnSettings'].forEach(id => $(id)?.classList.remove('on'));
    if (btnId) $(btnId)?.classList.add('on');
    const map = { admBtnDash:'admBotDash', admBtnSettings:'admBotSettings', admBtnCat:'admBotCat' };
    ['admBotDash','admBotSettings','admBotCat'].forEach(id => $(id)?.classList.remove('on'));
    if (btnId && map[btnId]) $(map[btnId])?.classList.add('on');
  }

  /* ── Sync mobile dot indicator with real DB status dot ── */
  function syncDbDot() {
    const dot = $('dbDot'), ind = $('admDbDotIndicator');
    if (!dot || !ind) return;
    ind.className = 'adm-tb-dot-indicator';
    if      (dot.classList.contains('connected')) ind.classList.add('connected');
    else if (dot.classList.contains('error'))     ind.classList.add('error');
    else                                          ind.classList.add('pending');
  }

  /* ── Mobile DB dot dropdown ── */
  function toggleDbOverflow() {
    const dd = $('admDbDropdown');
    if (!dd) return;
    dd.classList.toggle('open');
    // Sync mobile status text
    const st = $('dbStatus');
    const stMob = $('dbStatusMob');
    if (st && stMob) stMob.textContent = st.textContent;
    // Sync mobile dot
    const dot = $('dbDot'), dotMob = $('dbDotMob');
    if (dot && dotMob) dotMob.className = dot.className;
    // Close on outside click
    if (dd.classList.contains('open')) {
      setTimeout(() => {
        const close = e => { if (!dd.contains(e.target) && e.target.id !== 'admDbDotBtn') { dd.classList.remove('open'); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
      }, 10);
    }
  }
  function closeDbOverflow() {
    $('admDbDropdown')?.classList.remove('open');
  }

  function _setTitle(t) {
    const el = $('admTbTitle'); if (el) el.textContent = t;
  }


  /* ── Nav ── */
  const NAV_GROUPS = [
    { label: 'Boutique', items: [
      { id:'identite',      label:'Identité',          icon:'<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
      { id:'images',        label:'Documents PDF',     icon:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' },
      { id:'notifications', label:'Notifications',     icon:'<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>' },
    ]},
    { label: 'Tarification', items: [
      { id:'marge',         label:'Marge & Remises',  icon:'<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>' },
      { id:'livraison',     label:'Livraison & Délais',icon:'<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
    ]},
    { label: 'Production', items: [
      { id:'papers',        label:'Papiers',           icon:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
      { id:'impression',    label:'Impression',        icon:'<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>' },
      { id:'grand_format',  label:'Grand Format',      icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>' },
      { id:'finitions',     label:'Finitions',         icon:'<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>' },
      { id:'gadgets_mat',   label:'Gadgets',           icon:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
    ]},
    { label: 'Services graphiques', items: [
      { id:'design',        label:'Conception',        icon:'<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>' },
    ]},
    { label: 'Catalogue', items: [
      { id:'products',      label:'Produits',          icon:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>' },
      { id:'navigation',    label:'Navigation',        icon:'<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>' },
    ]},
    { label: 'Système', items: [
      { id:'connexion',     label:'Connexion',         icon:'<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>' },
      { id:'auth',          label:'Authentification',  icon:'<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' },
      { id:'edge_fn',       label:'Edge Functions',    icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
      { id:'export',        label:'Export & Backup',   icon:'<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>' },
    ]},
  ];

  function _buildNav() {
    const nav = $('admNav'); if (!nav) return;
    nav.innerHTML = NAV_GROUPS.map(g => `
      <div class="adm-nav-group">
        <span class="adm-nav-group-lbl">${g.label}</span>
        ${g.items.map(it => `
          <button class="adm-nav-item${activeTab===it.id?' on':''}" onclick="ADMIN.selectTab('${it.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${it.icon}</svg>
            <span>${it.label}</span>
          </button>`).join('')}
      </div>
    `).join('<div class="adm-nav-divider"></div>');
  }

  function selectTab(id) {
    if (activeProd) {
      activeProd = null; activeSec = null;
      _hideSplit();
    }
    activeTab = id;
    _openSettings();
    _settingsSelectTab(id);
    if (id === 'export') _initExportTab();
  }

  function _renderTab(id) {
    const body = $('admBody'); if (!body) return;
    body.innerHTML = _TAB_BUILDERS()[id]?.() || '';
  }

  /* ── Re-render product editor into whichever container is active ── */
  function _renderProd() {
    _renderTab('products');
  }


  /* ── Delivery + Turnaround state ── */
  let _dcSearch = '';

  function _bLivraison() {
    /* ── Turnaround (DB.turnaround_options) ── */
    const ta = DB.turnaround_options || [];
    const taRows = ta.map((t, i) => `
      <div class="adm-dc-row">
        <input class="adm-inp-lbl adm-mat-flex1"
          value="${(t.label||'').replace(/"/g,'&quot;')}" placeholder="Libellé"
          oninput="ADMIN.set('turnaround_options.${i}.label',this.value)">
        <input class="adm-inp-lbl" style="width:72px"
          value="${(t.days||'').replace(/"/g,'&quot;')}" placeholder="J. ouvr."
          oninput="ADMIN.set('turnaround_options.${i}.days',this.value)">
        <div class="adm-num-wrap">
          <input type="number" class="adm-inp" min="0" max="200" step="1" value="${Math.round((t.sur||0)*100)}"
            oninput="ADMIN.set('turnaround_options.${i}.sur',+this.value/100)">
          <span class="adm-num-unit">%</span>
        </div>
        <label class="tog${t.enabled!==false?' on':''}"
          onclick="this.classList.toggle('on');ADMIN.set('turnaround_options.${i}.enabled',this.classList.contains('on'));ADMIN._renderTab('livraison')"></label>
        <button class="adm-del-btn" onclick="ADMIN.removeTaRow(${i})" title="Supprimer">${IC.trash}</button>
      </div>`).join('');

    /* ── Delivery cities (DB.delivery_cities) ── */
    if (!DB.delivery_cities || DB.delivery_cities.length === 0) {
      DB.delivery_cities = _getDefaultCities();
      _flash();
    }
    const allCities = DB.delivery_cities;
    const filtered = _dcSearch
      ? allCities.filter(c => (c.label||'').toLowerCase().includes(_dcSearch.toLowerCase()))
      : allCities;

    const cityRows = filtered.map(c => {
      const i = allCities.indexOf(c);
      return `<div class="adm-dc-row">
        <input class="adm-inp-lbl adm-dc-name adm-mat-flex1"
          value="${(c.label||'').replace(/"/g,'&quot;')}" placeholder="Ville"
          oninput="ADMIN.set('delivery_cities.${i}.label',this.value)">
        <div class="adm-num-wrap">
          <input type="number" class="adm-inp" min="0" step="1" value="${c.fee||0}"
            oninput="ADMIN.dcSetFee(${i},+this.value)">
          <span class="adm-num-unit">DH</span>
        </div>
        <input class="adm-inp-lbl" style="width:72px"
          value="${(c.days||'').replace(/"/g,'&quot;')}" placeholder="Délai"
          oninput="ADMIN.set('delivery_cities.${i}.days',this.value)">
        <button class="adm-del-btn" onclick="ADMIN.removeCityRow(${i})" title="Supprimer">${IC.trash}</button>
      </div>`;
    }).join('');

    const clkIco  = '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>';
    const truckIco = '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>';

    return `
      ${_pageHdr('Livraison & Délais','Délais de traitement et zones de livraison')}
      <div class="adm-grid adm-grid-1" style="gap:.75rem">

        <div class="adm-card adm-card-full">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(clkIco)}</div>
              <div>
                <div class="adm-card-title">Délais de traitement</div>
                <div class="adm-card-sub">${ta.length} option${ta.length!==1?'s':''}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:.6rem">
              <label class="tog${DB.pricing?.ta_enabled!==false?' on':''}" title="Activer les délais de traitement"
                onclick="this.classList.toggle('on');ADMIN.set('pricing.ta_enabled',this.classList.contains('on'));ADMIN._renderTab('livraison')"></label>
              ${ta.length < 3 ? `<button class="adm-action-btn" onclick="ADMIN.addTaRow()">${IC.plus} Délai</button>` : ''}
            </div>
          </div>
          ${DB.pricing?.ta_enabled !== false ? `<div class="adm-dc-list">
            ${ta.length < 3 ? `<div style="display:flex;flex-wrap:wrap;gap:.2rem;padding:.28rem .85rem;border-bottom:1px solid var(--bd);background:var(--s2)">
              <span class="adm-row-sub" style="display:flex;align-items:center;margin-right:.2rem">Rapide :</span>
              <button class="adm-action-btn adm-preset-btn" onclick="ADMIN.addTaPreset('Standard','3-5j',0)">Standard</button>
              <button class="adm-action-btn adm-preset-btn" onclick="ADMIN.addTaPreset('Express','J+1',0.25)">Express</button>
              <button class="adm-action-btn adm-preset-btn" onclick="ADMIN.addTaPreset('Urgent','24h',0.50)">Urgent</button>
            </div>` : ''}
            <div class="adm-dc-list-hdr">
              <span style="flex:1">Libellé</span>
              <span style="width:72px">Jours</span>
              <span style="width:80px">Majoration</span>
              <span style="width:36px">Actif</span>
              <span style="width:24px"></span>
            </div>
            ${taRows || '<div class="adm-empty">Aucun délai configuré</div>'}
          </div>` : ''}
        </div>

        <div class="adm-card adm-card-full">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg(truckIco)}</div>
              <div>
                <div class="adm-card-title">Zones de livraison</div>
                <div class="adm-card-sub">${allCities.length} ville${allCities.length!==1?'s':''}${_dcSearch?' · '+filtered.length+' résultat'+( filtered.length!==1?'s':''):''}</div>
              </div>
            </div>
            <div style="display:flex;gap:.4rem;align-items:center">
              <div style="position:relative">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                  style="position:absolute;left:.45rem;top:50%;transform:translateY(-50%);width:10px;height:10px;color:var(--t3);pointer-events:none">
                  <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                </svg>
                <input class="adm-inp-lbl" style="width:150px;padding-left:1.5rem"
                  placeholder="Rechercher…" value="${(_dcSearch||'').replace(/"/g,'&quot;')}"
                  oninput="ADMIN.dcSearch(this.value)">
              </div>
              <button class="adm-action-btn" onclick="ADMIN.addCityRow()">${IC.plus} Ville</button>
            </div>
          </div>
          <div class="adm-dc-list">
            <div class="adm-dc-list-hdr">
              <span style="flex:1">Ville</span>
              <span style="width:80px">Frais</span>
              <span style="width:72px">Délai</span>
              <span style="width:24px"></span>
            </div>
            ${cityRows || '<div class="adm-empty">Aucune ville trouvée</div>'}
          </div>
        </div>

      </div>`;
  }

  /* ── Turnaround CRUD ── */
  function addTaRow() {
    if (!DB.turnaround_options) DB.turnaround_options = [];
    if (DB.turnaround_options.length >= 3) return;
    DB.turnaround_options.unshift({ id:'ta-'+Date.now(), label:'', days:'3-5j', sur:0, enabled:true });
    _flash(); _renderTab(activeTab);
  }
  function removeTaRow(i) {
    if (DB.turnaround_options) DB.turnaround_options.splice(i,1);
    _flash(); _renderTab(activeTab);
  }
  function addTaPreset(label, days, sur) {
    if (!DB.turnaround_options) DB.turnaround_options = [];
    if (DB.turnaround_options.length >= 3) return;
    DB.turnaround_options.push({ id:'ta-'+Date.now(), label, days, sur, enabled:true });
    _flash(); _renderTab(activeTab);
  }

  /* ── Delivery city CRUD ── */
  function addCityRow() {
    if (!DB.delivery_cities || DB.delivery_cities.length===0) DB.delivery_cities = _getDefaultCities();
    DB.delivery_cities.unshift({ id:'city-'+Date.now(), label:'', fee:35, days:'24-48h' });
    _flash(); _renderTab(activeTab);
  }
  function removeCityRow(i) {
    DB.delivery_cities.splice(i,1);
    _flash(); _renderTab(activeTab);
  }
  function dcSetFee(i, val) {
    if (DB.delivery_cities[i]) DB.delivery_cities[i].fee = val;
    _flash();
  }
  function dcSearch(q) {
    _dcSearch = q; _renderTab(activeTab);
  }



  /* ══════════════════════════════════════════════════════
     SETTINGS TAB HELPERS  (private to ADMIN IIFE)
     These are standalone — they do NOT shadow any external
     helpers coming from companion files.
     ══════════════════════════════════════════════════════ */

  function _hdr(t, s) {
    return '<div class="adm-page-hdr"><div><div class="adm-page-title">' + t + '</div>'
      + (s ? '<div class="adm-page-sub">' + s + '</div>' : '') + '</div></div>';
  }
  function _cc(t, ico, inner, action) {
    action = action || '';
    return '<div class="adm-card adm-card-full"><div class="adm-card-hdr">'
      + '<div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">' + ico + '</svg>'
      + '</div><div class="adm-card-title">' + t + '</div></div>' + action
      + '</div><div class="adm-rows">' + inner + '</div></div>';
  }
  function _rr(lbl, sub, ctrl) {
    return '<div class="adm-row"><div><div class="adm-row-label">' + lbl + '</div>'
      + (sub ? '<div class="adm-row-sub">' + sub + '</div>' : '') + '</div>' + ctrl + '</div>';
  }
  function _ni(path, val, unit, step, after) {
    unit = unit || 'DH'; step = step || '1';
    const extra = after ? ';' + after : '';
    return '<div class="adm-num-wrap">'
      + '<input type="number" class="adm-inp" value="' + (+val || 0) + '" step="' + step + '"'
      + ' oninput="ADMIN.set(\'' + path + '\',+this.value)' + extra + '">'
      + '<span class="adm-num-unit">' + unit + '</span></div>';
  }
  function _ti(path, val, ph, w) {
    w = w || '190px';
    return '<input class="adm-inp-lbl" style="width:' + w + '"'
      + ' value="' + (val || '').replace(/"/g, '&quot;') + '" placeholder="' + (ph || '') + '"'
      + ' oninput="ADMIN.set(\'' + path + '\',this.value)">';
  }
  function _tog(path, on, lbl, sub, rerender) {
    const _onChange = 'ADMIN.set(\'' + path + '\',this.checked)' + (rerender ? ';ADMIN._renderTab(\'' + rerender + '\')' : '');
    return '<div class="adm-toggle-row"><div class="adm-toggle-lbl-wrap">'
      + '<div class="adm-toggle-lbl">' + lbl + '</div>'
      + (sub ? '<div class="adm-toggle-sub">' + sub + '</div>' : '')
      + '</div><label style="display:flex;align-items:center;gap:.4rem;cursor:pointer">'
      + '<span style="font-size:.63rem;font-weight:700;color:' + (on ? 'var(--gn)' : 'var(--t3)') + '">' + (on ? 'ON' : 'OFF') + '</span>'
      + '<span class="tog-wrap">'
      + '<input type="checkbox" ' + (on ? 'checked' : '') + ' class="tog-inp"'
      + ' onchange="' + _onChange + '">'
      + '<span style="position:absolute;inset:0;border-radius:9px;background:' + (on ? 'var(--bl)' : 'var(--bd)') + ';'
      + 'display:flex;align-items:center;' + (on ? 'justify-content:flex-end;padding-right:2px' : 'justify-content:flex-start;padding-left:2px') + '">'
      + '<span style="width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2)"></span>'
      + '</span></span></label></div>';
  }

  /* ── Identité & Contact ── */
  function _bIdentite() {
    if (!DB.shop)    DB.shop    = {};
    if (!DB.contact) DB.contact = {};
    const s = DB.shop, c = DB.contact;

    /* textarea row — matches 230px input width */
    const _ta = (path, val, ph, rows) => {
      rows = rows || 2;
      return '<div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:.3rem">'
        + '<div class="adm-row-label">' + ph.split('…')[0].trim() + '</div>'
        + '<textarea rows="' + rows + '" style="width:230px;border:1.5px solid var(--bd);border-radius:var(--r);'
        + 'padding:.35rem .55rem;font-size:.72rem;font-family:inherit;color:var(--t1);'
        + 'background:var(--sf);resize:vertical;line-height:1.45" placeholder="' + ph + '"'
        + ' oninput="ADMIN.set(\'' + path + '\',this.value)"'
        + ' onfocus="this.style.borderColor=\'var(--bl)\'" onblur="this.style.borderColor=\'var(--bd)\'">'
        + (val || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        + '</textarea></div>';
    };

    /* WA badge label helper */
    const _waLbl = (lbl) => lbl + ' <span style="font-size:.55rem;font-weight:700;padding:1px 5px;'
      + 'border-radius:8px;background:#dcfce7;color:#166534;vertical-align:middle">WA</span>';

    return _hdr('Identité & Contact', 'Informations de votre boutique et contacts internes')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'

      + _cc('Boutique',
          '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
          _rr('Nom',              '',                   _ti('shop.name',    s.name,    'Kote Print',        '230px'))
        + _rr('Téléphone fixe',   '',                   _ti('shop.tel',     s.tel,     '+212 5xx xx xx xx', '230px'))
        + _rr('Email',            '',                   _ti('shop.email',   s.email,   'contact@…',         '230px'))
        + _ta('shop.addr',        s.addr,               'Rue, Quartier, Ville, CP…', 2)
        + _rr('Site web',         '',                   _ti('shop.website', s.website, 'https://…',         '230px'))
        + _rr(_waLbl('Mobile'),   'Utilisé pour WhatsApp', _ti('shop.whatsapp', s.whatsapp, '+212 6xx xxx xxx', '230px'))
      )

      + _cc('Service commercial',
          '<path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
          _rr(_waLbl('Tél / Mobile'), 'Affiché sur la page client',  _ti('contact.whatsapp',  c.whatsapp,  '+212…',        '230px'))
        + _rr('Email',                'Pour devis et commandes',      _ti('contact.email',     c.email,     'commercial@…', '230px'))
      )

      + _cc('Créatif / Graphiste',
          '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>',
          _rr(_waLbl('Tél / Mobile'), 'Pour envoyer les briefs créatifs', _ti('contact.designer_whatsapp', c.designer_whatsapp, '+212…',   '230px'))
        + _rr('Email',                'Réception des briefs email',         _ti('contact.design_email',      c.design_email,      'crea@…',  '230px'))
      )

      + '</div>';
  }

  /* ── Notifications ── */
  function _bNotifications() {
    if (!DB.contact) DB.contact = {};
    const c   = DB.contact;
    const tgOn = !!c.tg_enabled;

    /* Instructional hint block */
    const _hint = (html) =>
      '<div style="margin:.3rem .85rem .5rem;padding:.5rem .7rem;background:var(--bl-lt);'
      + 'border-left:3px solid var(--bl);border-radius:0 var(--r) var(--r) 0;'
      + 'font-size:.65rem;color:#1e40af;line-height:1.6">' + html + '</div>';

    return _hdr('Notifications', 'Alertes automatiques à chaque nouvelle commande ou brief')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M21.7 4.3a1 1 0 00-1-.3L2.7 9.6a1 1 0 00.1 1.9l7.5 2.1 2.1 7.5a1 1 0 001.9.1l5.6-18a1 1 0 00-.2-1z"/>'
      + '</svg></div>'
      + '<div><div class="adm-card-title">Telegram</div>'
      + '<div class="adm-card-sub">Notification instantanée dans un channel ou groupe</div></div>'
      + '</div>'
      + '<button class="adm-action-btn" onclick="ADMIN.tgTest()" style="font-size:.62rem">'
      + IC.check + ' Test</button>'
      + '</div>'
      + '<div class="adm-rows">'
      + _tog('contact.tg_enabled', tgOn, 'Activer les notifications Telegram', 'Un message est envoyé à chaque nouvelle commande ou brief', 'notifications')
      + '</div>'
      + (!tgOn ? _hint(
          '① Ouvrez <strong>@BotFather</strong> sur Telegram → tapez <code>/newbot</code><br>'
          + '② Copiez le <strong>token</strong> fourni (format <code>123456:ABC-xyz…</code>)<br>'
          + '③ Ajoutez le bot à votre groupe, puis récupérez le <strong>Chat ID</strong> via '
          + '<code>@userinfobot</code> ou l\'API <code>getUpdates</code>'
        ) : '')
      + (tgOn
          ? '<div class="adm-rows">'
          + _rr('Bot Token',
              'Depuis BotFather — format 123456789:ABCDef…',
              _ti('contact.tg_token', c.tg_token, '123456789:ABCDef-xyz…', '260px'))
          + _rr('Chat ID',
              'ID de votre compte, channel ou groupe (ex: -100123456789)',
              _ti('contact.tg_chat_id', c.tg_chat_id, '-100123456789', '160px'))
          + '</div>'
          + _hint(
              'Pour obtenir votre Chat ID : ajoutez <strong>@userinfobot</strong> à votre groupe '
              + 'et tapez <code>/start</code> — il renvoie l\'ID du groupe.<br>'
              + 'Ou consultez : <code>api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>'
            )
          : '')
      + '</div>'

      + '</div>';
  }


  /* ── Marge & Remises ── */
  function _bMarge() {
    if (!DB.pricing) DB.pricing = {};
    const p       = DB.pricing;
    const margin  = +(p.profit_margin    || 0.33);
    const floor   = +(p.remise_min_marge ?? 0.15);
    const maxDisc = Math.max(0, margin - floor);
    const mode    = p.remise_mode || null;
    const enabled = p.remise_enabled !== false;

    /* ── Mode pill ── */
    const modePill = (id, lbl) => {
      const active = enabled && mode === id;
      return '<button onclick="ADMIN.setRemiseMode(\'' + id + '\')" class="opt pill' + (active ? ' on' : '') + '" style="font-size:.72rem">' + lbl + '</button>';
    };

    /* ── Curve pill — full re-render so .on state updates ── */
    const dg = p.remise_degressif || { qty_min:100, qty_max:5000, disc_min:0, disc_max:0.15, curve:'sqrt' };
    if (mode === 'degressif' && !p.remise_degressif) p.remise_degressif = dg;
    const l = p.remise_lineaire || { qty1:500, disc1:0.05, qty2:2500, disc2:0.15 };
    if (mode === 'lineaire' && !p.remise_lineaire) p.remise_lineaire = l;
    const curvePill = (val, lbl) =>
      '<button onclick="ADMIN.set(\'pricing.remise_degressif.curve\',\'' + val + '\');ADMIN._renderTab(\'marge\')" class="opt pill' + (dg.curve===val?' on':'') + '" style="font-size:.72rem">' + lbl + '</button>';

    /* ── Paliers config ── */
    const qd = p.qty_discounts || [];
    const paliersUI = '<div class="adm-dc-list" style="margin-top:.5rem">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">À partir de</span><span style="width:80px">Remise %</span><span style="width:24px"></span></div>'
      + (qd.map((d, i) =>
          '<div class="adm-dc-row">'
          + _ni('pricing.qty_discounts.' + i + '.min', d.min, 'pcs', '1', 'ADMIN._redrawMargeGraph()')
          + '<span class="micro-t3">→</span>'
          + '<div class="adm-num-wrap"><input type="number" class="adm-inp" value="' + +((d.disc||0)*100).toFixed(1) + '" step="0.1" min="0" max="100" oninput="ADMIN.set(\'pricing.qty_discounts.' + i + '.disc\',+this.value/100);ADMIN._redrawMargeGraph()"><span class="adm-num-unit">%</span></div>'
          + '<button class="adm-del-btn" onclick="ADMIN.removeQtyDiscount(' + i + ')">' + IC.trash + '</button>'
          + '</div>'
        ).join('') || '<div class="adm-empty">Aucun palier configuré</div>')
      + '</div>'
      + '<button class="adm-action-btn" style="margin-top:.5rem" onclick="ADMIN.addQtyDiscount()">' + IC.plus + ' Palier</button>';

    /* ── Linéaire config ── */
    const lineaireUI =
        _rr('Quantité de départ', 'Remise commence à cette quantité',
            _ni('pricing.remise_lineaire.qty1', l.qty1||500, 'pcs', '1', 'ADMIN._redrawMargeGraph()'))
      + _rr('Remise initiale', 'Taux appliqué à partir de qté 1',
            '<div class="adm-num-wrap"><input type="number" class="adm-inp" value="' + +((l.disc1||0)*100).toFixed(1) + '" step="0.1" min="0" max="100" oninput="ADMIN.set(\'pricing.remise_lineaire.disc1\',+this.value/100);ADMIN._redrawMargeGraph()"><span class="adm-num-unit">%</span></div>')
      + _rr('Quantité cible', 'Remise maximale atteinte à cette quantité',
            _ni('pricing.remise_lineaire.qty2', l.qty2||2500, 'pcs', '1', 'ADMIN._redrawMargeGraph()'))
      + _rr('Remise finale', 'Taux maximum (plafonné par marge protégée)',
            '<div class="adm-num-wrap"><input type="number" class="adm-inp" value="' + +((l.disc2||0)*100).toFixed(1) + '" step="0.1" min="0" max="100" oninput="ADMIN.set(\'pricing.remise_lineaire.disc2\',+this.value/100);ADMIN._redrawMargeGraph()"><span class="adm-num-unit">%</span></div>');

    /* ── Dégressif config ── */
    const degressifUI =
        '<div class="adm-tab-bar">'
      + '<div class="adm-tab-item">'
      + _rr('Quantité min', 'Début de la remise dégrèssive',
            _ni('pricing.remise_degressif.qty_min', dg.qty_min||100, 'pcs', '1', 'ADMIN._redrawMargeGraph()'))
      + '</div>'
      + '<div style="flex:1">'
      + _rr('Remise min', 'Taux à la quantité minimale',
            '<div class="adm-num-wrap"><input type="number" class="adm-inp" value="' + +((dg.disc_min||0)*100).toFixed(1) + '" step="0.1" min="0" max="100" oninput="ADMIN.set(\'pricing.remise_degressif.disc_min\',+this.value/100);ADMIN._redrawMargeGraph()"><span class="adm-num-unit">%</span></div>')
      + '</div>'
      + '</div>'
      + '<div class="adm-tab-bar">'
      + '<div class="adm-tab-item">'
      + _rr('Quantité max', 'Plafond au-delà duquel la remise ne croît plus',
            _ni('pricing.remise_degressif.qty_max', dg.qty_max||5000, 'pcs', '1', 'ADMIN._redrawMargeGraph()'))
      + '</div>'
      + '<div style="flex:1">'
      + _rr('Remise max', 'Taux plafond (limité par marge protégée)',
            '<div class="adm-num-wrap"><input type="number" class="adm-inp" value="' + +((dg.disc_max||0)*100).toFixed(1) + '" step="0.1" min="0" max="100" oninput="ADMIN.set(\'pricing.remise_degressif.disc_max\',+this.value/100);ADMIN._redrawMargeGraph()"><span class="adm-num-unit">%</span></div>')
      + '</div>'
      + '</div>'
      /* Curve pills — full-width row so they never stack/overflow */
      + '<div style="padding:.4rem .85rem;border-bottom:1px solid var(--bd)">'
      + '<div style="font-size:.71rem;color:var(--t1);font-weight:500;margin-bottom:.35rem">Courbe</div>'
      + '<div class="cat-flex-wrap">'
      + curvePill('linear', 'Linéaire')
      + curvePill('sqrt', '√ Racine')
      + curvePill('log', 'Logarithme')
      + curvePill('exp', 'e Naturel')
      + curvePill('fib', 'φ Fibonacci')
      + '<span style="margin-left:auto;font-size:.76rem;color:var(--t3);font-family:\'Georgia\',serif;font-style:italic;white-space:nowrap;background:var(--s2);border:1px dashed var(--bd);border-radius:5px;padding:.2rem .6rem">'
      + ({
          linear: 'y = x',
          sqrt:   'y = √x',
          log:    'y = log<sub>2</sub>(x)',
          exp:    'y = e<sup>x</sup>',
          fib:    'y = φ<sup>x</sup>'
        }[dg.curve || 'sqrt'] || 'y = f(x)')
      + '</span>'
      + '</div></div>';

    /* ── Active mode config block ── */
    const modeConfig = (!enabled || !mode) ? '' :
      '<div style="border-top:1px solid var(--bd);margin-top:.1rem">'
      + (mode==='paliers' ? paliersUI : (mode==='lineaire' ? lineaireUI : degressifUI))
      + '</div>';

    return _hdr('Marge & Remises', 'Taux de marge, coûts d\'impression et remises quantité')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'

      /* ── Paramètres généraux ── */
      + _cc('Paramètres généraux',
          '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem .85rem">'
          + '<div><div class="adm-toggle-lbl">Marge bénéficiaire</div><div class="adm-toggle-sub">Prix vente = Coût ÷ (1 − marge)</div></div>'
          + '<div style="display:flex;align-items:center;gap:.5rem">'
          + '<input type="number" class="adm-inp" min="0" max="100" step="1"'
          + ' value="' + Math.round(margin*100) + '"'
          + ' style="width:72px;font-size:1.45rem;font-weight:700;color:var(--bl);text-align:center;height:44px"'
          + ' oninput="ADMIN.set(\'pricing.profit_margin\',+this.value/100);ADMIN._redrawMargeGraph()"'
          + ' onchange="ADMIN._renderTab(\'marge\')">'
          + '<span style="font-size:1.35rem;font-weight:700;color:var(--bl)">%</span>'
          + '</div></div>'
      )

      /* ── Remises quantité ── */
      + '<div class="adm-card adm-card-full">'
      + '<div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></div>'
      + '<div class="adm-card-title">Remises quantité</div></div>'
      + _tog('pricing.remise_enabled', enabled, '', '', 'marge').replace('adm-toggle-row','').replace('<div class="adm-toggle-lbl-wrap"><div class="adm-toggle-lbl"></div></div>','')
      + '</div>'
      + '<div class="adm-rows">'

      /* Marge protégée */
      + _rr('Marge minimale protégée',
            'La remise ne descend jamais en dessous de ce seuil · max autorisé : <strong id="adm-max-disc-lbl">' + (maxDisc*100).toFixed(1) + '%</strong>',
            '<div class="adm-num-wrap"><input type="number" class="adm-inp" min="0" max="100" step="1" value="'
            + Math.round(floor*100) + '"'
            + ' oninput="ADMIN.set(\'pricing.remise_min_marge\',+this.value/100);ADMIN._redrawMargeGraph()"'
            + ' onchange="ADMIN._renderTab(\'marge\')"><span class="adm-num-unit">%</span></div>')

      /* Mode picker pills */
      + '<div class="adm-row"><div><div class="adm-row-label">Mode de remise</div><div class="adm-row-sub">Un seul mode actif à la fois</div></div>'
      + '<div style="display:flex;gap:.3rem;flex-wrap:wrap;justify-content:flex-end">'
      + modePill('paliers',   'Paliers')
      + modePill('degressif', 'Dégressif')
      + (mode ? '<button onclick="ADMIN.setRemiseMode(null)" class="opt pill" style="font-size:.72rem;color:var(--t3)">✕</button>' : '')
      + '</div></div>'

      + modeConfig

      /* Graph */
      + '<div id="adm-marge-graph" style="padding:.1rem .85rem .75rem">'
      + _svgMargeGraph(p)
      + '</div>'

      + '</div></div>'
      + '</div>';
  }

  function addQtyDiscount() {
    if (!DB.pricing) DB.pricing = {};
    if (!DB.pricing.qty_discounts) DB.pricing.qty_discounts = [];
    DB.pricing.qty_discounts.push({ min: 500, disc: 0.05 });
    _flash(); _renderTab(activeTab);
  }
  function removeQtyDiscount(i) {
    DB.pricing.qty_discounts.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }
  function toggleRemise() {
    if (!DB.pricing) DB.pricing = {};
    DB.pricing.remise_enabled = !(DB.pricing.remise_enabled !== false);
    _flash(); _renderTab(activeTab);
  }
  function setRemiseMode(mode) {
    if (!DB.pricing) DB.pricing = {};
    if (DB.pricing.remise_mode === mode) { DB.pricing.remise_mode = null; }
    else {
      DB.pricing.remise_mode = mode;
      DB.pricing.remise_enabled = true;
      if (mode === 'degressif' && !DB.pricing.remise_degressif)
        DB.pricing.remise_degressif = { qty_min:100, qty_max:5000, disc_min:0, disc_max:0.15, curve:'sqrt' };
      if (mode === 'lineaire' && !DB.pricing.remise_lineaire)
        DB.pricing.remise_lineaire = { qty1:500, disc1:0.05, qty2:2500, disc2:0.15 };
    }
    _flash(); _renderTab(activeTab);
  }

  /* ── Graph helpers (shared by _bMarge render + partial redraw) ── */
  function _svgMargeGraph(p) {
    const margin  = +(p.profit_margin    || 0.33);
    const floor   = +(p.remise_min_marge ?? 0.15);
    const maxDisc = Math.max(0, margin - floor);
    const mode    = p.remise_mode || null;
    const enabled = p.remise_enabled !== false;
    const qd = p.qty_discounts || [];
    const l  = p.remise_lineaire  || { qty1:500,  disc1:0.05, qty2:2500, disc2:0.15 };
    const dg = p.remise_degressif || { qty_min:100, qty_max:5000, disc_min:0, disc_max:0.15 };

    const svgW=380, svgH=140, padL=28, padB=32, padR=8, padT=12;
    const gW = svgW-padL-padR, gH = svgH-padT-padB;
    const qMax = qd.length
      ? Math.ceil(Math.max(...qd.map(d => d.min)) * 1.2 / 100) * 100
      : 10000;
    const dMax = Math.max(maxDisc, 0.01);
    const xS = q => padL + (q/qMax)*gW;
    const yS = d => padT + gH - (d/dMax)*gH;

    // X-axis ticks: follow palier quantities in paliers mode, fixed otherwise
    const xTickVals = qd.length
      ? [0, ...qd.map(d => d.min).filter(v => v > 0)].sort((a,b) => a-b)
      : [0,100,500,1000,2500,5000,10000];
    const xTicks = xTickVals.map(q => ({
      x: xS(q).toFixed(1),
      lbl: q >= 1000 ? (q/1000).toFixed(0)+'k' : q.toFixed(0)
    }));
    const yTicks = [0, maxDisc/2, maxDisc].map(d => ({
      y: yS(d).toFixed(1),
      lbl: (d*100).toFixed(0)+'%'
    }));

    const capY = yS(maxDisc).toFixed(1);

    // Helper: compute polyline points for a given curve override
    const _pts = (curveOverride) => Array.from({length:201}, (_,i) => {
      const q = i/200 * qMax;
      const pOverride = mode === 'degressif'
        ? Object.assign({}, p, { remise_degressif: Object.assign({}, dg, { curve: curveOverride }) })
        : p;
      return xS(q).toFixed(1)+','+yS(CALC.qtyDisc(q, pOverride)).toFixed(1);
    }).join(' ');

    // In degressif mode: render all 5 curves dimmed, then active on top in blue
    const allCurves = ['linear','sqrt','log','exp','fib'];
    const activeCurve = dg.curve || 'sqrt';
    const ghostCurves = (mode === 'degressif' && enabled)
      ? allCurves.filter(c => c !== activeCurve).map(c =>
          '<polyline points="'+_pts(c)+'" fill="none" stroke="#1a1a1a" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.1"/>'
        ).join('')
      : '';
    const activePts = _pts(activeCurve);

    return '<svg viewBox="0 0 '+svgW+' '+svgH+'" style="width:100%;display:block;margin-top:.5rem;border-radius:6px;background:var(--s2)">'
      // y grid + labels
      + yTicks.map(t =>
          '<line x1="'+padL+'" y1="'+t.y+'" x2="'+(svgW-padR)+'" y2="'+t.y+'" stroke="var(--bd)" stroke-width="0.5"/>'
          +'<text x="'+(padL-3)+'" y="'+(+t.y+2)+'" text-anchor="end" font-size="4" fill="var(--t3)">'+t.lbl+'</text>'
        ).join('')
      // x grid + labels — rotated -90° to avoid overlap on dense palier ticks
      + xTicks.map(t =>
          '<line x1="'+t.x+'" y1="'+padT+'" x2="'+t.x+'" y2="'+(svgH-padB)+'" stroke="var(--bd)" stroke-width="0.5"/>'
          +'<text transform="rotate(-90,'+t.x+','+(svgH-padB+4)+')" x="'+t.x+'" y="'+(svgH-padB+4)+'" text-anchor="end" font-size="4" fill="var(--t3)">'+t.lbl+'</text>'
        ).join('')
      // max cap line
      + '<line x1="'+padL+'" y1="'+capY+'" x2="'+(svgW-padR)+'" y2="'+capY+'" stroke="#ef4444" stroke-width="0.8" stroke-dasharray="3,3"/>'
      + '<text x="'+(svgW-padR-2)+'" y="'+(+capY-3)+'" text-anchor="end" font-size="4" fill="#ef4444">max '+(maxDisc*100).toFixed(0)+'%</text>'
      // ghost curves (inactive, dimmed)
      + ghostCurves
      // active curve in blue
      + (mode && enabled ? '<polyline points="'+activePts+'" fill="none" stroke="var(--bl)" stroke-width="0.6" stroke-linejoin="round" stroke-linecap="round"/>' : '')
      // axes
      + '<line x1="'+padL+'" y1="'+padT+'" x2="'+padL+'" y2="'+(svgH-padB)+'" stroke="var(--t3)" stroke-width="1"/>'
      + '<line x1="'+padL+'" y1="'+(svgH-padB)+'" x2="'+(svgW-padR)+'" y2="'+(svgH-padB)+'" stroke="var(--t3)" stroke-width="1"/>'
      + '</svg>';
  }

  function _redrawMargeGraph() {
    const el = document.getElementById('adm-marge-graph');
    if (!el || !DB.pricing) return;
    el.innerHTML = _svgMargeGraph(DB.pricing);
    // also update the "max autorisé" label if visible
    const lbl = document.getElementById('adm-max-disc-lbl');
    if (lbl) {
      const margin  = +(DB.pricing.profit_margin    || 0.33);
      const floor   = +(DB.pricing.remise_min_marge ?? 0.15);
      lbl.textContent = (Math.max(0, margin - floor)*100).toFixed(1)+'%';
    }
  }



  /* ── Papiers ── */
  function _bPapers() {
    const papers  = (DB.paper_stocks || []).filter(p => !p.envelope);
    const envs    = (DB.paper_stocks || []).filter(p =>  p.envelope);
    const formats = DB.envelope_formats || [];
    const types   = DB.envelope_types   || [];

    const paperRows = papers.map((p, _) => {
      const i = DB.paper_stocks.indexOf(p);
      return '<div class="adm-dc-row">'
        + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (p.label || '').replace(/"/g, '&quot;') + '" placeholder="Couché 135g"'
        + ' oninput="ADMIN.set(\'paper_stocks.' + i + '.label\',this.value)">'
        + _ni('paper_stocks.' + i + '.cost_per_sheet', p.cost_per_sheet ?? 0, 'DH', '0.1')
        + (p.special ? '<span style="font-size:.58rem;font-weight:700;padding:1px 6px;border-radius:10px;background:var(--pu-lt);color:var(--pu)">Spécial</span>' : '')
        + '<button class="adm-del-btn" onclick="ADMIN.removePaper(' + i + ')">' + IC.trash + '</button>'
        + '</div>';
    }).join('');

    const envRows = envs.map((p, _) => {
      const i = DB.paper_stocks.indexOf(p);
      return '<div class="adm-dc-row">'
        + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (p.label || '').replace(/"/g, '&quot;') + '" placeholder="DL"'
        + ' oninput="ADMIN.set(\'paper_stocks.' + i + '.label\',this.value)">'
        + _ni('paper_stocks.' + i + '.cost_per_sheet', p.cost_per_sheet ?? 0, 'DH/u', '0.01')
        + '<button class="adm-del-btn" onclick="ADMIN.removePaper(' + i + ')">' + IC.trash + '</button>'
        + '</div>';
    }).join('');

    const fmtRows = formats.map((f, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl" style="width:60px" value="' + (f.name || '').replace(/"/g, '&quot;') + '" placeholder="DL"'
      + ' oninput="ADMIN.set(\'envelope_formats.' + i + '.name\',this.value)">'
      + _ni('envelope_formats.' + i + '.w', f.w || 0, 'mm', '1')
      + _ni('envelope_formats.' + i + '.h', f.h || 0, 'mm', '1')
      + _ni('envelope_formats.' + i + '.cost', f.cost || 0, 'DH', '0.1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeEnvFormat(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    const typeRows = types.map((t, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (t.name || '').replace(/"/g, '&quot;') + '" placeholder="Autodex"'
      + ' oninput="ADMIN.set(\'envelope_types.' + i + '.name\',this.value)">'
      + _ni('envelope_types.' + i + '.cost_per_piece', t.cost_per_piece || 0, 'DH/u', '0.01')
      + _ni('envelope_types.' + i + '.cost_per_color', t.cost_per_color || 0, 'DH/cl', '0.01')
      + '<button class="adm-del-btn" onclick="ADMIN.removeEnvType(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    return _hdr('Papiers', 'Stocks papier et coût planche (feuille vide)')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>'
      + '</svg></div><div class="adm-card-title">Stocks papier</div></div>'
      + '<div style="display:flex;gap:.3rem">'
      + '<button class="adm-action-btn" onclick="ADMIN.addPaper()">' + IC.plus + ' Standard</button>'
      + '<button class="adm-action-btn" onclick="ADMIN.addPaper(true)">' + IC.plus + ' Spécial</button>'
      + '</div></div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Label</span><span style="width:80px">Prix planche A3+</span><span style="width:60px"></span><span style="width:24px"></span></div>'
      + (paperRows || '<div class="adm-empty">Aucun papier configuré</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.14 1.18 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>'
      + '</svg></div><div class="adm-card-title">Enveloppes — Stocks</div></div>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Label</span><span style="width:72px">DH/u</span><span style="width:24px"></span></div>'
      + (envRows || '<div class="adm-empty">Aucune enveloppe stock</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/>'
      + '</svg></div><div class="adm-card-title">Formats enveloppes</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addEnvFormat2()">' + IC.plus + ' Format</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="width:60px">Nom</span><span style="width:72px">L mm</span><span style="width:72px">H mm</span><span style="width:72px">DH</span><span style="width:24px"></span></div>'
      + (fmtRows || '<div class="adm-empty">Aucun format</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>'
      + '</svg></div><div class="adm-card-title">Types enveloppes</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addEnvType()">' + IC.plus + ' Type</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Type</span><span style="width:72px">DH/u</span><span style="width:72px">DH/cl</span><span style="width:24px"></span></div>'
      + (typeRows || '<div class="adm-empty">Aucun type</div>')
      + '</div></div>'

      + '</div>';
  }

  /* ── Impression ── */
  function _bImpression() {
    const sh          = DB.sheet || {};
    const numProfiles = DB.numerique_profiles || [];
    const offProfiles = DB.offset_profiles   || [];

    /* Fixed planche options — A3+ base, A2+=×2, A1+=×4 */
    var PLANCHES = ['A3+','A2+','A1+'];
    var PLANCHE_LABELS = { 'A3+':'A3+  480×320 mm  ×1', 'A2+':'A2+  650×480 mm  ×2', 'A1+':'A1+  900×650 mm  ×4' };

    function _plSel(path, val) {
      return '<select style="font-size:.65rem;font-weight:600;padding:3px 8px;border:1.5px solid var(--bd);'
        + 'border-radius:6px;background:var(--sf);color:var(--t1);cursor:pointer;font-family:inherit;min-width:145px"'
        + ' onchange="ADMIN.set(\'' + path + '\',this.value)">'
        + PLANCHES.map(function(p) {
            return '<option value="' + p + '"' + ((val||'A3+')===p?' selected':'') + '>' + PLANCHE_LABELS[p] + '</option>';
          }).join('')
        + '</select>';
    }

    var icoNum = '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';
    var icoOff = '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>';
    var icoPlq = '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>';

    var _svg11 = function(d) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">' + d + '</svg>';
    };

    var _colHdrStyle = 'display:grid;align-items:center;gap:.4rem;padding:4px .85rem;'
      + 'border-bottom:1px solid var(--bd);background:var(--s2)';
    var _cellStyle = 'font-size:.6rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.5px';
    var _rowStyle  = 'align-items:center;gap:.4rem;padding:5px .85rem;border-bottom:1px solid var(--bd)';

    /* ── Numérique column template ── */
    var numTpl = '150px 110px 1fr 26px';

    var numColHdr = '<div style="' + _colHdrStyle + ';grid-template-columns:' + numTpl + '">'
      + '<span style="' + _cellStyle + '">Nom</span>'
      + '<span style="' + _cellStyle + '">Px / face</span>'
      + '<span style="' + _cellStyle + '">Planche</span>'
      + '<span></span>'
      + '</div>';

    var numRows = numProfiles.length
      ? numProfiles.map(function(pr, i) {
          return '<div style="display:grid;grid-template-columns:' + numTpl + ';' + _rowStyle + '">'
            + _ti('numerique_profiles.' + i + '.label', pr.label, 'Nom du profil', '145px')
            + _ni('numerique_profiles.' + i + '.cost_per_face',  pr.cost_per_face  || 0, 'Dh/face')
            + _plSel('numerique_profiles.' + i + '.planche', pr.planche || 'A3+')
            + '<button class="adm-del-btn" onclick="ADMIN.removeNumProfile(' + i + ')">' + IC.trash + '</button>'
            + '</div>';
        }).join('')
      : '<div class="adm-empty adm-empty--p85">Aucun profil numérique — ajoutez-en un</div>';

    /* ── Offset column template ── */
    var offTpl = '150px 100px 100px 100px 1fr 26px';

    var offColHdr = '<div style="' + _colHdrStyle + ';grid-template-columns:' + offTpl + '">'
      + '<span style="' + _cellStyle + '">Nom</span>'
      + '<span style="' + _cellStyle + '">Calage</span>'
      + '<span style="' + _cellStyle + '">Plaques Dh/plq</span>'
      + '<span style="' + _cellStyle + '">Px tirage/face</span>'
      + '<span style="' + _cellStyle + '">Planche</span>'
      + '<span></span>'
      + '</div>';

    var offRows = offProfiles.length
      ? offProfiles.map(function(pr, i) {
          return '<div style="display:grid;grid-template-columns:' + offTpl + ';' + _rowStyle + '">'
            + _ti('offset_profiles.' + i + '.label', pr.label, 'Nom du profil', '145px')
            + _ni('offset_profiles.' + i + '.setup_cost',     pr.setup_cost     || 0, 'Dh',     '1')
            + _ni('offset_profiles.' + i + '.cost_per_plate', pr.cost_per_plate || 0, 'Dh/plq', '1')
            + _ni('offset_profiles.' + i + '.print_per_face', pr.print_per_face || 0, 'Dh/face')
            + _plSel('offset_profiles.' + i + '.planche', pr.planche || 'A3+')
            + '<button class="adm-del-btn" onclick="ADMIN.removeOffsetProfile(' + i + ')">' + IC.trash + '</button>'
            + '</div>';
        }).join('')
      : '<div class="adm-empty adm-empty--p85">Aucun profil offset — ajoutez-en un</div>';

    return _hdr('Impression', 'Profils numérique et offset — assignés par produit')

      /* ── NUMÉRIQUE card ── */
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'
      + '<div class="adm-card adm-card-full">'
      + '<div class="adm-card-hdr">'
      + '<div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico">' + _svg11(icoNum) + '</div>'
      + '<div class="adm-card-title">Numérique</div>'
      + '</div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addNumProfile()">' + IC.plus + ' Ajouter</button>'
      + '</div>'
      + numColHdr
      + numRows
      + '</div>'
      + '</div>'

      /* ── OFFSET card ── */
      + '<div class="adm-grid adm-grid-1 adm-grid-mt2">'
      + '<div class="adm-card adm-card-full">'
      + '<div class="adm-card-hdr">'
      + '<div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico">' + _svg11(icoOff) + '</div>'
      + '<div class="adm-card-title">Offset</div>'
      + '</div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addOffsetProfile()">' + IC.plus + ' Ajouter</button>'
      + '</div>'
      + offColHdr
      + offRows
      + '</div>'
      + '</div>'

      /* ── PRESS SETTINGS card ── */
      + '<div class="adm-grid adm-grid-1 adm-grid-mt2">'
      + '<div class="adm-card adm-card-full">'
      + '<div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico">' + _svg11(icoPlq) + '</div>'
      + '<div class="adm-card-title">Paramètres presse</div>'
      + '</div></div>'
      + '<div class="adm-rows">'
      + _rr('Marge',      'mm — entre les poses sur la feuille', _ni('sheet.margin', sh.margin, 'mm', '0.5'))
      + _rr('Fond perdu', 'mm — bleed autour de chaque pose',    _ni('sheet.bleed',  sh.bleed,  'mm', '0.5'))
      + '</div>'
      + '</div>'
      + '</div>';
  }

  /* ── Grand Format ── */
  function _bGrandFormat() {
    const mats     = DB.gf_materials      || [];
    const panMats  = DB.pancarte_materials || [];
    const supports = DB.rollup_supports   || [];

    const matRows = mats.map((m, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (m.label || '').replace(/"/g, '&quot;') + '" placeholder="Bâche 510g"'
      + ' oninput="ADMIN.set(\'gf_materials.' + i + '.label\',this.value)">'
      + _ni('gf_materials.' + i + '.cost_per_sqm', m.cost_per_sqm || 0, 'DH/m²', '0.5')
      + _ni('gf_materials.' + i + '.laize',        m.laize        || 1, 'm lz',   '0.1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeGfMat(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    const panRows = panMats.map((m, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (m.label || '').replace(/"/g, '&quot;') + '" placeholder="Dibond 3mm"'
      + ' oninput="ADMIN.set(\'pancarte_materials.' + i + '.label\',this.value)">'
      + _ni('pancarte_materials.' + i + '.cost_per_sqm', m.cost_per_sqm || 0, 'DH/m²', '1')
      + '<button class="adm-del-btn" onclick="ADMIN.removePancarteMat(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    const supRows = supports.map((s, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (s.label || '').replace(/"/g, '&quot;') + '" placeholder="Rollup 85×200"'
      + ' oninput="ADMIN.set(\'rollup_supports.' + i + '.label\',this.value)">'
      + _ni('rollup_supports.' + i + '.cost', s.cost || 0, 'DH', '1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeRuSupport(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    return _hdr('Grand Format', 'Matières, supports et mécanismes pour l\'impression grand format')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>'
      + '</svg></div><div class="adm-card-title">Matières GF (bâche, vinyle…)</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addGfMat()">' + IC.plus + ' Matière</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Matière</span><span style="width:80px">DH/m²</span><span style="width:64px">Laize</span><span style="width:24px"></span></div>'
      + (matRows || '<div class="adm-empty">Aucune matière</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'
      + '</svg></div><div class="adm-card-title">Supports pancartes (Dibond, PVC…)</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addPancarteMat()">' + IC.plus + ' Support</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Support</span><span style="width:80px">DH/m²</span><span style="width:24px"></span></div>'
      + (panRows || '<div class="adm-empty">Aucun support pancarte</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<line x1="12" y1="2" x2="12" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>'
      + '</svg></div><div class="adm-card-title">Supports rollup / X-banner</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addRuSupport()">' + IC.plus + ' Support</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Support</span><span style="width:72px">DH</span><span style="width:24px"></span></div>'
      + (supRows || '<div class="adm-empty">Aucun support rollup</div>')
      + '</div></div>'

      + '</div>';
  }

  /* ── Finitions ── */
  function _bFinitions() {
    const lams     = DB.finishes       || [];
    const addons   = DB.finishes_addon || [];
    const bindings = DB.binding_options || [];
    const gfFins   = DB.gf_finishes    || [];

    const lamRows = lams.map((l, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (l.label || '').replace(/"/g, '&quot;') + '" placeholder="Mat, Brillant…"'
      + ' oninput="ADMIN.set(\'finishes.' + i + '.label\',this.value)">'
      + _ni('finishes.' + i + '.cost_ps', l.cost_ps || 0, 'DH/f', '0.1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeLam(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    const addonRows = addons.map((a, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (a.label || '').replace(/"/g, '&quot;') + '" placeholder="Vernis sélectif…"'
      + ' oninput="ADMIN.set(\'finishes_addon.' + i + '.label\',this.value)">'
      + _ni('finishes_addon.' + i + '.cost_setup', a.cost_setup || 0, 'DH set.', '1')
      + _ni('finishes_addon.' + i + '.cost_pu',    a.cost_pu    || 0, 'DH/u',   '0.1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeAddon(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    const bindRows = bindings.map((b, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (b.label || '').replace(/"/g, '&quot;') + '" placeholder="Spirale, Agrafage…"'
      + ' oninput="ADMIN.set(\'binding_options.' + i + '.label\',this.value)">'
      + _ni('binding_options.' + i + '.cost_flat',     b.cost_flat     || 0, 'DH fix', '1')
      + _ni('binding_options.' + i + '.cost_per_copy', b.cost_per_copy || 0, 'DH/ex', '0.1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeBinding(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    const gfFinRows = gfFins.map((f, i) =>
      '<div class="adm-dc-row">'
      + '<input class="adm-inp-lbl adm-mat-flex1" value="' + (f.label || '').replace(/"/g, '&quot;') + '" placeholder="Œillets, Contrecollage…"'
      + ' oninput="ADMIN.set(\'gf_finishes.' + i + '.label\',this.value)">'
      + _ni('gf_finishes.' + i + '.cost_flat', f.cost_flat || 0, 'DH', '1')
      + '<button class="adm-del-btn" onclick="ADMIN.removeGfFinish(' + i + ')">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    return _hdr('Finitions', 'Pelliculage, façonnage, reliure et finitions Grand Format')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>'
      + '</svg></div><div class="adm-card-title">Pelliculage</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addLam()">' + IC.plus + ' Finition</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Type</span><span style="width:72px">DH/feuille</span><span style="width:24px"></span></div>'
      + (lamRows || '<div class="adm-empty">Aucun pelliculage</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
      + '</svg></div><div class="adm-card-title">Façonnage</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addAddon()">' + IC.plus + ' Option</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Finition</span><span style="width:80px">Setup</span><span style="width:72px">DH/u</span><span style="width:24px"></span></div>'
      + (addonRows || '<div class="adm-empty">Aucun façonnage</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>'
      + '</svg></div><div class="adm-card-title">Reliure</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addBinding()">' + IC.plus + ' Reliure</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Type</span><span style="width:72px">DH fixe</span><span style="width:72px">DH/ex</span><span style="width:24px"></span></div>'
      + (bindRows || '<div class="adm-empty">Aucune reliure</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>'
      + '</svg></div><div class="adm-card-title">Finitions Grand Format (œillets, lam, contrecollage…)</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addGfFinish()">' + IC.plus + ' Finition GF</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Finition</span><span style="width:72px">DH</span><span style="width:24px"></span></div>'
      + (gfFinRows || '<div class="adm-empty">Aucune finition GF</div>')
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>'
      + '</svg></div><div class="adm-card-title">Forme de découpe</div></div>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Sac shopping &amp; Packaging — coût unique par commande</span><span style="width:88px">Setup (DH)</span><span style="width:96px">Prix / cm²</span></div>'
      + '<div class="adm-dc-row">'
      + '<span style="flex:1;font-size:.72rem;color:var(--t2)">Surface format ouvert · indépendant de la quantité</span>'
      + _ni('pricing.forme_decoupe.setup',    (DB.pricing?.forme_decoupe?.setup    ?? DB.forme_decoupe?.setup    ?? 0), 'DH',     '0.01')
      + _ni('pricing.forme_decoupe.prix_cm2', (DB.pricing?.forme_decoupe?.prix_cm2 ?? DB.forme_decoupe?.prix_cm2 ?? 0), 'DH/cm²', '0.001')
      + '</div>'
      + '</div></div>'

      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>'
      + '</svg></div><div class="adm-card-title">Options Carnet NCR</div></div>'
      + '</div>'
      + '<div class="adm-rows">'
      + _rr('Agrafage',       'Coût par carnet — appliqué à tous les carnets NCR',
            _ni('pricing.carnet_options.stapling',    (DB.pricing?.carnet_options?.stapling    ?? 0), 'DH/carnet', '0.1'))
      + _rr('Numérotation',   'Coût par carnet quand l\'option est activée par le client',
            _ni('pricing.carnet_options.numbering',   (DB.pricing?.carnet_options?.numbering   ?? 0), 'DH/carnet', '0.1'))
      + _rr('Perforage',      'Coût par carnet quand l\'option est activée par le client',
            _ni('pricing.carnet_options.perforation', (DB.pricing?.carnet_options?.perforation ?? 0), 'DH/carnet', '0.1'))
      + '</div></div>'

      + '</div>';
  }

  /* ── Gadgets ── */
  function _bGadgetsMat() {
    const gadgets = (DB.products || []).filter(p => p.calc_engine === 'gadget');
    const rows = gadgets.map(g =>
      '<div class="adm-dc-row">'
      + '<span style="font-size:.72rem;font-weight:500;color:var(--t1);flex:1">' + (g.name || '').replace(/</g, '&lt;') + '</span>'
      + _ni('products.' + DB.products.indexOf(g) + '.unit_price',  g.unit_price  || 0, 'DH/u', '1')
      + _ni('products.' + DB.products.indexOf(g) + '.print_cost',  g.print_cost  || 0, 'DH imp', '0.5')
      + '<button class="adm-del-btn" onclick="ADMIN.deleteGadget(\'' + g.id + '\')" title="Supprimer">' + IC.trash + '</button>'
      + '</div>'
    ).join('');

    return _hdr('Gadgets & Objets publicitaires', 'Produits à prix unitaire simple')
      + '<div class="adm-grid adm-grid-1">'
      + '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
      + '<div class="adm-card-hdr-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">'
      + '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
      + '</svg></div><div class="adm-card-title">Gadgets · ' + gadgets.length + ' produit' + (gadgets.length !== 1 ? 's' : '') + '</div></div>'
      + '<button class="adm-action-btn" onclick="ADMIN.addGadget()">' + IC.plus + ' Gadget</button>'
      + '</div>'
      + '<div class="adm-dc-list">'
      + '<div class="adm-dc-list-hdr"><span style="flex:1">Produit</span><span style="width:72px">DH/u</span><span style="width:80px">Impression</span><span style="width:24px"></span></div>'
      + (rows || '<div class="adm-empty">Aucun gadget — cliquez + Gadget pour en créer un</div>')
      + '</div></div></div>';
  }

  /* ── Conception / Design tiers ── */
  function _bDesign() {
    if (!DB.design_tiers) DB.design_tiers = {};
    const tiers = DB.design_tiers;
    const designEmail = (DB.contact && DB.contact.design_email) || '';

    const tierCard = (tid) => {
      const t = tiers[tid] || {};
      const colors = { basic: 'var(--t2)', pro: 'var(--bl)', premium: 'var(--pu)' };
      const labels = { basic: 'Basic', pro: 'Pro', premium: 'Premium' };
      return '<div class="adm-card adm-card-full"><div class="adm-card-hdr"><div class="adm-card-hdr-l">'
        + '<div class="adm-card-hdr-ico" style="background:' + (tid === 'premium' ? 'var(--pu-lt)' : tid === 'pro' ? 'var(--bl-lt)' : 'var(--s2)') + '">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="' + colors[tid] + '" stroke-width="1.8" style="width:11px;height:11px">'
        + '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'
        + '</svg></div>'
        + '<div class="adm-card-title">' + labels[tid] + '</div></div></div>'
        + '<div class="adm-rows">'
        + _rr('Nom affiché',  '', _ti('design_tiers.' + tid + '.label', t.label, labels[tid]))
        + _rr('Description',  '', _ti('design_tiers.' + tid + '.desc',  t.desc,  'Inclut…', '280px'))
        + _rr('Prix HT',      '', _ni('design_tiers.' + tid + '.price', t.price || 0, 'DH'))
        + '</div></div>';
    };

    return _hdr('Conception graphique', 'Tarifs des forfaits de design proposés aux clients')
      + '<div class="adm-grid adm-grid-1" style="gap:.75rem">'
      + _cc('Réception des briefs',
          '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/>',
          _rr('Email créa', 'Destinataire des briefs envoyés par email',
            '<input class="adm-inp-lbl" style="width:230px"'
            + ' value="' + designEmail.replace(/"/g, '&quot;') + '" placeholder="crea@…"'
            + ' oninput="ADMIN.setDesignEmail(this.value)">')
        )
      + tierCard('basic')
      + tierCard('pro')
      + tierCard('premium')
      + '</div>';
  }

  function setDesignTier(tier, field, val) {
    if (!DB.design_tiers) DB.design_tiers = {};
    if (!DB.design_tiers[tier]) DB.design_tiers[tier] = {};
    DB.design_tiers[tier][field] = val;
    _flash();
  }
  function setDesignSectionTier(pi, ei, tier, val) {
    if (DB.products[pi]?.composition[ei]) {
      DB.products[pi].composition[ei]['design_tier_' + tier] = val;
      _flash();
    }
  }
  function setDesignEmail(val) {
    if (!DB.contact) DB.contact = {};
    DB.contact.design_email = val;
    _flash();
  }


  function _bProducts() {
    const ENGINE_LABELS = { sheet_fit:'Feuille presse', sqm:'Grand Format', gadget:'Gadget / Objet', carnet:'Carnet NCR', service:'Service / Design', packaging:'Packaging / Boîtes' };
    const _legacyToEngine = {standard:'sheet_fit',catalogue:'sheet_fit',grand_format:'sqm',rollup:'sqm',pancarte:'sqm',gadget:'gadget',carnet:'carnet',conception:'service'};
    const prods = (DB.products||[]).filter(p=>p.product_type!=='conception' && p.id!=='conception' && p.id!=='briefing');

    /* ── New product wizard ── */
    if (!activeProd && _newProdMode) {
      const iconKeys = ['layout','image','book','book-open','file-text','tag','flag','scroll','layers','pen-tool','credit-card','truck','printer','image','layers','flag'];
      const ENGINE_INFO = [
        {
          id: 'sheet_fit',
          svg: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
          label: 'Feuille presse',
          desc: 'Imposition A3+/A2+/A1+ — cartes, flyers, affiches, catalogues, sacs, adhésif'
        },
        {
          id: 'sqm',
          svg: '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>',
          label: 'Grand Format',
          desc: 'Calcul au m² avec laize — bâche, vinyl, rollup, kakémono, pancarte, forex'
        },
        {
          id: 'gadget',
          svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
          label: 'Gadget / Objet pub',
          desc: 'Prix unitaire + coût impression × quantité — stylos, mugs, enveloppes'
        },
        {
          id: 'carnet',
          svg: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="12" y1="8" x2="16" y2="8"/><line x1="12" y1="12" x2="16" y2="12"/>',
          label: 'Carnet NCR',
          desc: 'Offset uniquement — feuillets, souches, numérotage, perforage'
        },
        {
          id: 'service',
          svg: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>',
          label: 'Service / Design',
          desc: 'Tarif à la prestation — conception graphique, logo, mise en page'
        },
        {
          id: 'packaging',
          svg: '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
          label: 'Packaging / Boîtes',
          desc: 'Format ouvert L×H — boîtes, étuis, packaging avec forme de découpe'
        },
      ];
      const selEngine = _newProdDraft.calc_engine || 'sheet_fit';
      return `
        ${_pageHdr('Nouveau produit','Définissez le nom, l\'identifiant et le moteur de calcul')}
        <div class="adm-grid adm-grid-1">
          <div class="adm-card adm-card-full">
            <div class="adm-card-hdr">
              <div class="adm-card-hdr-l">
                <button class="adm-back-btn" onclick="ADMIN.cancelNewProd()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div class="adm-card-title">Informations du produit</div>
              </div>
            </div>
            <div class="adm-new-prod-form">
              <div class="adm-form-grid">
                <div class="adm-form-row">
                  <label class="adm-form-lbl">Nom du produit <span class="text-rd">*</span></label>
                  <input class="adm-form-inp" id="newProdName" placeholder="ex: Bâche publicitaire" value="${_newProdDraft.name||''}">
                </div>
                <div class="adm-form-row">
                  <label class="adm-form-lbl">Identifiant (slug)</label>
                  <input class="adm-form-inp" id="newProdId" placeholder="auto-généré" value="${_newProdDraft._rawId||''}">
                </div>
              </div>
              <div class="adm-form-row">
                <label class="adm-form-lbl">Icône</label>
                <select class="adm-form-inp" id="newProdIcon" style="cursor:pointer">
                  ${iconKeys.map(k=>`<option value="${k}"${(_newProdDraft.icon||'layout')===k?' selected':''}>${k}</option>`).join('')}
                </select>
              </div>
              <div class="adm-form-row">
                <label class="adm-form-lbl">Moteur de calcul <span class="text-rd">*</span></label>
                <div class="adm-type-grid">
                  ${ENGINE_INFO.map(t=>`
                    <div class="adm-type-opt${selEngine===t.id?' on':''}"
                      onclick="ADMIN.selectNewType('${t.id}');document.getElementById('newProdType').value='${t.id}'">
                      <span class="adm-type-ico" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0 auto .35rem">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" style="width:22px;height:22px">${t.svg}</svg>
                      </span>
                      <div style="font-size:.64rem;font-weight:700">${t.label}</div>
                      <div style="font-size:.56rem;color:var(--t3);line-height:1.3;margin-top:2px">${t.desc}</div>
                    </div>`).join('')}
                </div>
                <input type="hidden" id="newProdType" value="${selEngine}">
              </div>
            </div>
            <div style="padding:.75rem 1rem;display:flex;gap:.5rem;justify-content:flex-end;border-top:1px solid var(--bd)">
              <button class="adm-action-btn" onclick="ADMIN.cancelNewProd()">Annuler</button>
              <button class="adm-primary-btn" onclick="ADMIN.confirmNewProd()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><polyline points="20 6 9 17 4 12"/></svg>
                Créer le produit
              </button>
            </div>
          </div>
        </div>`;
    }

    /* ── Unified product list + inline accordion editor ── */
    const _q = (_prodSearch||'').toLowerCase();
    const filtered = prods.filter(p =>
      !_q || p.name.toLowerCase().includes(_q) || (p.id||'').toLowerCase().includes(_q)
    );

    const rows = filtered.map(p => {
      const pi      = DB.products.indexOf(p);
      const comp    = _getComposition(p);
      const engine  = p.calc_engine || _legacyToEngine[p.product_type] || 'sheet_fit';
      const engLbl  = ENGINE_LABELS[engine] || engine;
      const isOpen  = activeProd === p.id;

      /* ── Collapsed row ── */
      if (!isOpen) return `
        <div class="adm-prod-row" onclick="ADMIN.openProd('${p.id}')">
          <div class="adm-prod-ico">${IC[p.icon]||IC.layout}</div>
          <div class="adm-prod-info">
            <div class="adm-prod-name">${p.name} <span class="adm-prod-type-badge">${engLbl}</span></div>
            <div class="adm-row-sub">${comp.length} section${comp.length!==1?'s':''} · <code style="font-size:.58rem">${p.id}</code></div>
          </div>
          <div style="display:flex;gap:.3rem;align-items:center;flex-shrink:0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:13px;height:13px;color:var(--t3);transition:transform .2s">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </div>
        </div>`;

      /* ── Expanded accordion ── */
      const usedIds  = comp.map(e=>e.type_id);
      const catGroup = g => SECTION_CATALOG.filter(sc=>sc.group===g&&!usedIds.includes(sc.id));
      const sbGroups = ['structure','impression','materials','finish','booklet','packaging','envelope','order','design'];
      const sbLabel  = {'structure':'Structure','impression':'Impression','materials':'Matières','finish':'Finition','booklet':'Reliure & assemblage','packaging':'Emballage','envelope':'Enveloppe','order':'Commande','design':'Design'};

      const activeSections = comp.length ? comp.map((entry, ei) => {
        const sc    = SECTION_CATALOG.find(x=>x.id===entry.type_id) || {label:entry.type_id,icon:'layout',configurable:false};
        const isSec = activeSec === ei;
        return `
          <div class="sb-card${isSec?' open':''}"
            ondragover="ADMIN.secDragOver(event)" ondragleave="ADMIN.secDragLeave(event)"
            ondrop="ADMIN.secDrop(event,${pi},${ei})">
            <div class="sb-card-hdr">
              <span class="sb-drag-handle" draggable="true" title="Réordonner"
                ondragstart="ADMIN.secDragStart(event,${pi},${ei})" ondragend="ADMIN.secDragEnd(event)">
                ${DRAG_HANDLE_SVG}
              </span>
              <div class="sb-card-label" ${sc.configurable?`onclick="ADMIN.sbToggle(${ei})" style="cursor:pointer;flex:1"`:'style="flex:1"'}>
                <span class="sb-card-id">${sc.label}</span>
                <span class="sb-card-desc">${sc.desc||''}</span>
              </div>
              <div class="sb-card-actions">
                <button class="sb-del-btn" onclick="event.stopPropagation();ADMIN.sbRemove(${pi},${ei})" title="Supprimer">×</button>
              </div>
            </div>
            ${isSec && sc.configurable ? _sbInlineConfig(p, pi, entry, ei) : ''}
          </div>`;
      }).join('')
      : `<div class="sb-empty">Glissez ou ajoutez des modules depuis la palette →</div>`;

      const palette = sbGroups.map(g => {
        const items = catGroup(g);
        if (!items.length) return '';
        return `
          <div class="sb-pal-group">
            <div class="adm-sb-pal-lbl">${sbLabel[g]}</div>
            <div class="adm-sb-pal-chips">
              ${items.map(sc=>`<div class="adm-sb-pal-chip" onclick="ADMIN.sbAdd(${pi},'${sc.id}')" title="${sc.desc}">+ ${sc.label}</div>`).join('')}
            </div>
          </div>`;
      }).join('');

      const concRows = (p.conception_types||[]).map((ct,i) => {
        let priceInp='';
        if (ct.price)             priceInp=_numInp(`products.${pi}.conception_types.${i}.price`,ct.price,'DH');
        else if (ct.price_base)   priceInp=`${_numInp(`products.${pi}.conception_types.${i}.price_base`,ct.price_base,'DH base')}${_numInp(`products.${pi}.conception_types.${i}.price_per_page`,ct.price_per_page,'DH/p')}`;
        else if (ct.price_per_face) priceInp=_numInp(`products.${pi}.conception_types.${i}.price_per_face`,ct.price_per_face,'DH/face');
        return _row3(`<div>${_txtInp(`products.${pi}.conception_types.${i}.label`,ct.label)}<div class="adm-row-sub">${ct.id}</div></div>`,priceInp,_delBtn(`ADMIN.removeConcType(${pi},${i})`));
      }).join('');

      const engineDropdown = `
        <select style="font-size:.63rem;font-weight:600;padding:0 8px;border:1.5px solid var(--bd);
          border-radius:7px;background:var(--sf);color:var(--t1);cursor:pointer;height:28px;min-width:120px"
          onchange="ADMIN.changeEngine(${pi},this.value)" title="Changer le moteur de calcul">
          ${Object.entries(ENGINE_LABELS).map(([id,lbl])=>
            `<option value="${id}"${engine===id?' selected':''}>${lbl}</option>`
          ).join('')}
        </select>`;

      const extraCards = `
        ${p.conception_types?.length ? `
          <div class="adm-card adm-card-full adm-card-full--mt">
            <div class="adm-card-hdr">
              <div class="adm-card-hdr-l">
                <div class="adm-card-hdr-ico">${_svg('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>')}</div>
                <div class="adm-card-title">Prestations de conception</div>
              </div>
              <button class="adm-action-btn" onclick="ADMIN.addConcType(${pi})">${IC.plus} Ajouter</button>
            </div>
            <div class="adm-rows">${concRows}</div>
          </div>` : ''}
        ${(p.calc_engine==='gadget'||p.product_type==='gadget') ? `
          <div class="adm-card adm-card-full adm-card-full--mt">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>')}</div>
              <div><div class="adm-card-title">Tarif gadget / objet</div>
              <div class="adm-card-sub">Pour enveloppes : laisser à 0 et utiliser sections env-size / env-support</div></div></div></div>
            <div class="adm-rows">
              ${_row('Prix unitaire HT','Coût produit par unité avant marge',_numInp(`products.${pi}.unit_price`,p.unit_price||0,'DH/u'))}
              ${_row('Coût impression','Par unité',_numInp(`products.${pi}.print_cost`,p.print_cost||0,'DH/u'))}
              ${_row('Technique','Informatif',`<input class="adm-form-inp" style="max-width:160px;font-size:.7rem" placeholder="Sérigraphie, DTF, Laser…" value="${(p.print_technique||'').replace(/"/g,'&quot;')}" oninput="ADMIN.set('products.${pi}.print_technique',this.value)">`)}
            </div>
          </div>` : ''}
        ${p.product_type==='pancarte' ? `
          <div class="adm-card adm-card-full adm-card-full--mt">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>')}</div>
              <div><div class="adm-card-title">Configuration Pancarte</div></div></div></div>
            <div class="adm-rows">
              ${_row('Support par défaut','',`<select class="adm-form-inp" class="adm-lbl-200" onchange="ADMIN.set('products.${pi}.default_pancarte_mat',this.value)">
                <option value="">— Aucun (premier de la liste) —</option>
                ${(DB.pancarte_materials||[]).map(m=>`<option value="${m.id}"${p.default_pancarte_mat===m.id?' selected':''}>${m.label} — ${m.cost_per_sqm||0} DH/m²</option>`).join('')}
              </select>`)}
            </div>
          </div>` :
          (p.calc_engine==='sqm'||['grand_format','rollup'].includes(p.product_type)) ? `
          <div class="adm-card adm-card-full adm-card-full--mt">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/>')}</div>
              <div><div class="adm-card-title">Configuration Grand Format</div></div></div></div>
            <div class="adm-rows">
              ${_row('Matière par défaut','',`<select class="adm-form-inp" class="adm-lbl-200" onchange="ADMIN.set('products.${pi}.gf_material_id',this.value)">
                <option value="">— Premier de la liste —</option>
                ${(DB.gf_materials||[]).map(m=>`<option value="${m.id}"${p.gf_material_id===m.id?' selected':''}>${m.label}</option>`).join('')}
              </select>`)}
              ${_row('Support mécanique','',`<select class="adm-form-inp" class="adm-lbl-200" onchange="ADMIN.set('products.${pi}.support_id',this.value)">
                <option value="">— Aucun —</option>
                ${(DB.rollup_supports||[]).map(s=>`<option value="${s.id}"${p.support_id===s.id?' selected':''}>${s.label} (${s.cost} DH)</option>`).join('')}
              </select>`)}
            </div>
          </div>` : ''}
        ${p.id==='chemise-rabat' ? `
          <div class="adm-card adm-card-full adm-card-full--mt">
            <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>')}</div><div class="adm-card-title">Options rabat chemise</div></div></div>
            <div class="adm-rows">
              ${_row('Rabat collé','',_numInp(`products.${pi}.rabat_colle_cost`,p.rabat_colle_cost??0.8,'DH/u'))}
              ${_row('Rabat imprimé','',_numInp(`products.${pi}.rabat_imprime_cost`,p.rabat_imprime_cost??0.5,'DH/u'))}
            </div>
          </div>` : ''}
        ${(engine==='sheet_fit'||engine==='carnet'||engine==='packaging') ? (() => {
          const numProfs = DB.numerique_profiles || [];
          const offProfs = DB.offset_profiles   || [];
          const numOn    = p.num_enabled !== false && numProfs.length > 0;
          const offOn    = p.offset_enabled === true;
          const PMULT    = {'A3+':1,'A2+':2,'A1+':4};
          const _tog = (val, path, lbl, sub) =>
            `<div class="adm-toggle-row">
               <div class="adm-toggle-lbl-wrap">
                 <div class="adm-toggle-lbl">${lbl}</div>
                 ${sub?`<div class="adm-toggle-sub">${sub}</div>`:''}
               </div>
               <label class="tog${val?' on':''}"
                 onclick="this.classList.toggle('on');ADMIN.set('${path}',this.classList.contains('on'));ADMIN._renderTab('products')">
               </label>
             </div>`;
          const numCtrl = numOn && numProfs.length ? (() => {
            const np = numProfs.find(pr=>pr.id===(p.num_profile_id||numProfs[0]?.id)) || numProfs[0] || {};
            const mult = PMULT[np.planche||'A3+']||1;
            return `<div style="display:flex;align-items:center;gap:.5rem;padding:.35rem .85rem .45rem;
              border-top:1px solid var(--bd);background:var(--s2)">
              <span class="micro-t3">Profil :</span>
              <select style="font-size:.68rem;font-weight:600;padding:3px 8px;border:1.5px solid var(--bd);
                border-radius:6px;background:var(--sf);color:var(--t1);cursor:pointer;font-family:inherit"
                onchange="ADMIN.set('products.${pi}.num_profile_id',this.value);ADMIN._renderTab('products')">
                ${numProfs.map(pr=>`<option value="${pr.id}"${(p.num_profile_id||numProfs[0]?.id)===pr.id?' selected':''}>${pr.label||pr.id}</option>`).join('')}
              </select>
              <span class="adm-italic-t3">
                ${np.cost_per_sheet||0} Dh/f + ${np.cost_per_face||0} Dh/face${mult>1?' × '+mult:''} — planche ${np.planche||'A3+'}
              </span>
            </div>`;
          })() : '';
          const offCtrl = offOn && offProfs.length ? (() => {
            const op = offProfs.find(pr=>pr.id===(p.offset_profile_id||offProfs[0]?.id)) || offProfs[0] || {};
            const mult = PMULT[op.planche||'A3+']||1;
            return `<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;padding:.35rem .85rem .45rem;
              border-top:1px solid var(--bd);background:var(--s2)">
              <span class="micro-t3">Profil :</span>
              <select style="font-size:.68rem;font-weight:600;padding:3px 8px;border:1.5px solid var(--bd);
                border-radius:6px;background:var(--sf);color:var(--t1);cursor:pointer;font-family:inherit"
                onchange="ADMIN.set('products.${pi}.offset_profile_id',this.value);ADMIN._renderTab('products')">
                ${offProfs.map(pr=>`<option value="${pr.id}"${(p.offset_profile_id||offProfs[0]?.id)===pr.id?' selected':''}>${pr.label||pr.id}</option>`).join('')}
              </select>
              <span class="micro-t3">Seuil :</span>
              ${_numInp(`products.${pi}.offset_threshold`, p.offset_threshold||1000, 'f.', '100')}
              <span class="adm-italic-t3">
                cal. ${op.setup_cost||0} + ${op.cost_per_plate||0} Dh/plq + ${op.print_per_face||0} Dh/face${mult>1?' × '+mult:''} — planche ${op.planche||'A3+'}
              </span>
            </div>`;
          })() : '';
          const bothNote = (numOn && offOn) ?
            `<div style="font-size:.68rem;color:var(--bl);background:var(--bl-lt);padding:.3rem .85rem;
               border-top:1px solid var(--bl-md)">
               Numérique sous ${p.offset_threshold||1000} f. — offset au-dessus
             </div>` : '';
          return `
            <div class="adm-card adm-card-full adm-card-full--mt">
              <div class="adm-card-hdr">
                <div class="adm-card-hdr-l">
                  <div class="adm-card-hdr-ico">${_svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>')}</div>
                  <div class="adm-card-title">Profils d'impression</div>
                </div>
              </div>
              <div class="adm-rows">
                ${_tog(numOn, `products.${pi}.num_enabled`, 'Numérique', "Impression numérique — coût feuille + faces")}
                ${numCtrl}
                ${_tog(offOn, `products.${pi}.offset_enabled`, 'Offset', 'Déclenché si feuilles ≥ seuil')}
                ${offCtrl}
              </div>
              ${bothNote}
            </div>`;
        })() : ''}`;

      return `
        <div class="adm-prod-accord-wrap">
          <!-- Expanded header row -->
          <div class="adm-prod-row adm-prod-row-open" onclick="ADMIN.closeProd()">
            <div class="adm-prod-ico" style="background:var(--bl);color:#fff">${IC[p.icon]||IC.layout}</div>
            <div class="adm-prod-info" class="adm-mat-flex1">
              <div class="adm-prod-name">${p.name} <span class="adm-prod-type-badge">${engLbl}</span></div>
              <div class="adm-row-sub"><code style="font-size:.58rem">${p.id}</code></div>
            </div>
            <!-- Toolbar: engine, rename, delete -->
            <div style="display:flex;align-items:center;gap:.35rem;flex-shrink:0" onclick="event.stopPropagation()">
              ${engineDropdown}
              <button class="adm-action-btn" onclick="ADMIN.renameProd('${p.id}')"
                data-rename-id="${p.id}"
                class="adm-action-btn adm-offset-del" title="Renommer">
                ${IC.edit}
              </button>
              <button class="adm-action-btn danger" onclick="ADMIN.deleteProd('${p.id}')"
                class="adm-action-btn adm-offset-del" title="Supprimer">
                ${IC.trash}
              </button>
            </div>
            <!-- Collapse chevron -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:13px;height:13px;color:var(--bl);flex-shrink:0;margin-left:.2rem">
              <path d="M18 15l-6-6-6 6"/>
            </svg>
          </div>

          <!-- Accordion body -->
          <div class="adm-prod-accord-body">
            <div class="adm-card adm-card-full" style="border-radius:0 0 var(--r) var(--r);border-top:none">
              <div class="adm-card-hdr" style="border-top:1px solid var(--bd)">
                <div class="adm-card-hdr-l">
                  <div class="adm-card-hdr-ico">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px">
                      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                  </div>
                  <div>
                    <div class="adm-card-title">Section Builder</div>
                    <div class="adm-card-sub">Glissez pour réordonner</div>
                  </div>
                </div>
              </div>
              <div class="adm-sb-split">
                <div class="adm-sb-active">${activeSections}</div>
                <div class="adm-sb-palette">
                  <div class="adm-sb-pal-title">Modules disponibles</div>
                  ${palette||`<div style="font-size:.65rem;color:var(--t3);font-style:italic">Tous les modules sont utilisés</div>`}
                </div>
              </div>
            </div>
            ${extraCards}
          </div>
        </div>`;
    }).join('');

    const emptyMsg = _q
      ? `<div class="adm-empty adm-empty--p15">Aucun produit ne correspond à "<strong>${_q}</strong>"</div>`
      : `<div class="adm-empty adm-empty--p15"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;margin:0 auto .5rem;display:block;opacity:.35"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/></svg>Aucun produit dans le catalogue.</div>`;

    return `
      ${_pageHdr('Produits','Gérez le catalogue et les sections de formulaire par produit')}
      <div class="adm-grid adm-grid-1">
        <div class="adm-card adm-card-full">
          <div class="adm-card-hdr" style="gap:.5rem">
            <!-- Search -->
            <div style="flex:1;position:relative;min-width:0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="position:absolute;left:9px;top:50%;transform:translateY(-50%);width:12px;height:12px;color:var(--t3);pointer-events:none">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" placeholder="Rechercher un produit…"
                value="${(_prodSearch||'').replace(/"/g,'&quot;')}"
                oninput="ADMIN.prodSearch(this.value)"
                style="width:100%;padding:6px 9px 6px 28px;border:1.5px solid var(--bd);border-radius:7px;
                  font-size:.68rem;font-family:inherit;background:var(--s2);color:var(--t1);box-sizing:border-box">
            </div>
            <!-- Count -->
            <span style="font-size:.62rem;color:var(--t3);white-space:nowrap;flex-shrink:0">
              ${filtered.length} / ${prods.length}
            </span>
            <!-- New product -->
            <button class="adm-primary-btn" onclick="ADMIN.startNewProd()" style="flex-shrink:0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Nouveau
            </button>
          </div>
          <div>${rows || emptyMsg}</div>
        </div>
      </div>`;
  }

  /* ══ SIDEBAR BUILDER ══ */

  function _bSidebar() {
    const groups = DB.sidebar_groups || [];
    const assignedIds = new Set(groups.flatMap(g => g.products || []));
    const unassigned = (DB.products || []).filter(p => !assignedIds.has(p.id));

    const groupCards = groups.map((grp, gi) => {
      const isOpen = activeGroup === gi;
      const prods = (grp.products || []).map((pid, pi) => {
        const p = DB.products.find(x => x.id === pid);
        if (!p) return '';
        return `
          <div class="sgrp-prod-row sp-draggable" draggable="true"
            ondragstart="ADMIN.spDragStart(event,${gi},${pi})" ondragend="ADMIN.spDragEnd(event)"
            ondragover="ADMIN.spDragOver(event)" ondragleave="ADMIN.spDragLeave(event)"
            ondrop="ADMIN.spDrop(event,${gi},${pi})">
            <div class="sb-drag-handle" style="font-size:8px;color:var(--t3)">⠿</div>
            <div class="sgrp-prod-ico">${IC[p.icon]||IC.layout}</div>
            <span class="sgrp-prod-lbl">${p.name}</span>
            <span class="sgrp-prod-type">${p.product_type||'standard'}</span>
            <button class="adm-del-btn" onclick="ADMIN.sgrpRemoveProd(${gi},${pi})" title="Retirer">${IC.trash}</button>
          </div>`;
      }).join('');

      const grpSet = new Set(grp.products || []);
      const addable = (DB.products || []).filter(p => !grpSet.has(p.id));
      const picker = addable.length
        ? `<div class="sgrp-add-area">
            <select class="adm-inp-lbl" style="width:100%;font-size:.68rem" onchange="ADMIN.sgrpAddProd(${gi},this.value);this.value=''">
              <option value="">+ Ajouter un produit…</option>
              ${addable.map(p=>`<option value="${p.id}">${p.name} (${p.product_type||'standard'})</option>`).join('')}
            </select>
           </div>`
        : '';

      return `
        <div class="sgrp-card${isOpen?' open':''} sg-draggable" draggable="true"
          ondragstart="ADMIN.sgrpDragStart(event,${gi})" ondragend="ADMIN.sgrpDragEnd(event)"
          ondragover="ADMIN.sgrpDragOver(event)" ondragleave="ADMIN.sgrpDragLeave(event)"
          ondrop="ADMIN.sgrpDrop(event,${gi})">
          <div class="sgrp-hdr" onclick="ADMIN.sgrpToggle(${gi})">
            <span class="sgrp-drag sb-drag-handle" onclick="event.stopPropagation()">⠿</span>
            <button class="adm-del-btn sgrp-ic-btn" title="Choisir une icône" onclick="event.stopPropagation();ADMIN.sgrpPickIcon(${gi},this)">${IC[grp.icon] || IC.layout}</button>
            <input class="sgrp-name-inp" id="sgrp-inp-${gi}" readonly
              value="${(grp.label||'').replace(/"/g,'&quot;')}"
              onblur="this.readOnly=true;ADMIN.sgrpRename(${gi},this.value)"
              onkeydown="if(event.key==='Enter'){this.blur()}"
              placeholder="Nom du groupe">
            <span class="sgrp-count">${(grp.products||[]).length} produit${(grp.products||[]).length!==1?'s':''}</span>
            <span class="sgrp-chevron">${IC['chev-r']}</span>
            <button class="adm-del-btn" title="Renommer"
              onclick="event.stopPropagation();(function(){var i=document.getElementById('sgrp-inp-${gi}');i.readOnly=false;i.focus();i.select();})()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:11px;height:11px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
            </button>
            <button class="adm-del-btn" onclick="event.stopPropagation();ADMIN.sgrpRemove(${gi})" title="Supprimer">${IC.trash}</button>
          </div>
          ${isOpen ? `<div class="sgrp-body">
            <div class="sgrp-prods">${prods||`<div class="sgrp-empty">Aucun produit</div>`}</div>
            ${picker}
          </div>` : ''}
        </div>`;
    }).join('');

    const poolItems = unassigned.length
      ? unassigned.map(p => {
          const gi = (activeGroup !== null && activeGroup < groups.length) ? activeGroup : null;
          const canAssign = gi !== null;
          const groupName = canAssign ? groups[gi].label : '';
          return `
            <div class="sgrp-pool-item" style="justify-content:space-between">
              <div style="display:flex;align-items:center;gap:.4rem;min-width:0">
                <div class="sgrp-prod-ico" style="flex-shrink:0">${IC[p.icon]||IC.layout}</div>
                <div style="min-width:0">
                  <div style="font-size:.69rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
                  <div style="font-size:.57rem;color:var(--t3)">${p.product_type||'standard'}</div>
                </div>
              </div>
              ${canAssign
                ? `<button class="adm-action-btn" onclick="ADMIN.sgrpAddProd(${gi},'${p.id}')">+ ${groupName}</button>`
                : `<span style="font-size:.58rem;color:var(--t3);font-style:italic">Ouvrez un groupe →</span>`}
            </div>`;
        }).join('')
      : `<div style="padding:.75rem;font-size:.7rem;color:var(--gn);font-weight:600">✓ Tous les produits sont assignés</div>`;

    const icoSb = '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>';
    const icoPool = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>';

    /* Inject icon-picker CSS once */
    if (!document.getElementById('sgrp-ic-style')) {
      const st = document.createElement('style'); st.id = 'sgrp-ic-style';
      st.textContent = `
        .sgrp-ic-pop{position:fixed;z-index:9999;background:var(--sf);border:1.5px solid var(--bd);border-radius:8px;padding:6px;display:flex;flex-wrap:wrap;gap:4px;width:220px;box-shadow:0 4px 16px rgba(0,0,0,.12);}
        .sgrp-ic-opt,.sgrp-new-ic-opt{width:30px;height:30px;border-radius:5px;border:1.5px solid var(--bd);background:var(--sf);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--t2);transition:all .12s;}
        .sgrp-ic-opt:hover,.sgrp-new-ic-opt:hover{border-color:var(--bl);background:var(--bl-lt);color:var(--bl);}
        .sgrp-ic-opt.on,.sgrp-new-ic-opt.on{border-color:var(--bl);background:var(--bl-lt);color:var(--bl);}
        .sgrp-ic-opt svg,.sgrp-new-ic-opt svg{width:14px;height:14px;}
        .sgrp-new-ic-preview svg{width:16px;height:16px;}
        .sgrp-new-card{border:1.5px solid var(--bl)!important;background:var(--bl-lt)!important;}
        .sgrp-new-actions{display:flex;gap:6px;align-items:center;padding:.6rem .8rem;border-top:1px solid var(--bd);background:var(--s2);border-radius:0 0 6px 6px;}
      `;
      document.head.appendChild(st);
    }

    /* Creation card — shown when _sgrpNewDraft is set */
    const newCard = _sgrpNewDraft ? `
      <div class="sgrp-card open sgrp-new-card">
        <div class="sgrp-hdr" style="cursor:default;gap:.5rem">
          <div id="sgrp-new-ic-preview" style="width:24px;height:24px;flex-shrink:0;color:var(--bl);display:flex;align-items:center;justify-content:center">
            ${IC[_sgrpNewDraft.icon] || IC.layout}
          </div>
          <input id="sgrp-new-name" class="sgrp-name-inp" style="flex:1;pointer-events:auto"
            placeholder="Nom du groupe"
            onkeydown="if(event.key==='Enter')ADMIN.sgrpCreate();if(event.key==='Escape')ADMIN.sgrpCancelNew()">
          <button class="adm-action-btn" onclick="ADMIN.sgrpCreate()" style="flex-shrink:0">✓ Créer</button>
          <button class="adm-del-btn" onclick="ADMIN.sgrpCancelNew()" title="Annuler">${IC.trash.replace('polyline points="3 6','polyline points="3 6').replace('<polyline points="3 6 5 6 21 6"/>','')}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="sgrp-body">
          <div style="font-size:.63rem;color:var(--t2);font-weight:600;margin-bottom:.4rem">Choisir une icône</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${SGRP_ICON_KEYS.map(k => `
              <button class="sgrp-new-ic-opt${_sgrpNewDraft.icon===k?' on':''}" data-key="${k}"
                onclick="ADMIN.sgrpPickNewIcon('${k}')" title="${k}">
                ${IC[k]||''}
              </button>`).join('')}
          </div>
        </div>
      </div>` : '';

    return `
      ${_pageHdr('Sidebar','Gérez les groupes et l\'ordre des produits dans la navigation')}
      <div class="adm-grid adm-grid-1">
        ${_cardAct('Groupes de navigation',icoSb,
          `<button class="adm-action-btn" onclick="ADMIN.sgrpAdd()">${IC.plus} Nouveau groupe</button>`,
          `<div class="adm-sgrp-list">${groupCards||`<div class="adm-empty adm-empty--p15">Aucun groupe — créez-en un</div>`}</div>`,true)}
        ${_cardAct('Produits non assignés',icoPool,
          unassigned.length ? `<span style="font-size:.63rem;color:var(--am);font-weight:600">${unassigned.length} non assigné${unassigned.length>1?'s':''}</span>` : '',
          `<div class="sgrp-pool-wrap"><div class="sgrp-pool-grid">${poolItems}</div></div>`,true)}
      </div>`;
  }

  /* ── Sidebar group CRUD ── */
  function sgrpAdd() {
    if (!DB.sidebar_groups) DB.sidebar_groups = [];
    const newId = 'group-' + Date.now();
    DB.sidebar_groups.push({ id: newId, label: 'Nouveau groupe', products: [] });
    activeGroup = DB.sidebar_groups.length - 1;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpRemove(gi) {
    if (!confirm('Supprimer ce groupe ? Les produits ne seront pas supprimés.')) return;
    DB.sidebar_groups.splice(gi, 1);
    if (activeGroup === gi) activeGroup = null;
    else if (activeGroup > gi) activeGroup--;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpRename(gi, val) {
    DB.sidebar_groups[gi].label = val;
    _flash(); UI.buildSidebar();
  }
  function sgrpToggle(gi) {
    activeGroup = activeGroup === gi ? null : gi;
    _renderTab('sidebar');
  }
  function sgrpAddProd(gi, pid) {
    if (!pid) return;
    const grp = DB.sidebar_groups[gi];
    if (!grp.products) grp.products = [];
    if (!grp.products.includes(pid)) grp.products.push(pid);
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpRemoveProd(gi, pi) {
    DB.sidebar_groups[gi].products.splice(pi, 1);
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }
  function sgrpAssign(pid) {
    // Legacy fallback — pool now uses dropdown selectors directly
    if (DB.sidebar_groups.length === 0) {
      alert('Créez d\'abord un groupe (bouton "Nouveau groupe")'); return;
    }
    const gi = (activeGroup !== null && activeGroup < DB.sidebar_groups.length) ? activeGroup : null;
    if (gi === null) {
      alert('Sélectionnez un groupe dans la liste (cliquez sur un groupe pour l\'ouvrir) puis utilisez la liste déroulante pour assigner.'); return;
    }
    sgrpAddProd(gi, pid);
  }

  /* ── Sidebar group drag-to-reorder ── */
  let _sgrpDragFrom = null;
  function sgrpDragStart(e, gi) {
    _sgrpDragFrom = gi;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sg-draggable')?.classList.add('sg-dragging'), 0);
  }
  function sgrpDragEnd(e) {
    document.querySelectorAll('.sg-draggable').forEach(c => c.classList.remove('sg-dragging','sg-drag-over'));
  }
  function sgrpDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.sg-draggable');
    if (card) {
      document.querySelectorAll('.sg-draggable').forEach(c => c.classList.remove('sg-drag-over'));
      card.classList.add('sg-drag-over');
    }
  }
  function sgrpDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sg-draggable')?.classList.remove('sg-drag-over');
  }
  function sgrpDrop(e, toGi) {
    e.preventDefault();
    document.querySelectorAll('.sg-draggable').forEach(c => c.classList.remove('sg-dragging','sg-drag-over'));
    if (_sgrpDragFrom === null || _sgrpDragFrom === toGi) { _sgrpDragFrom = null; return; }
    const grp = DB.sidebar_groups.splice(_sgrpDragFrom, 1)[0];
    DB.sidebar_groups.splice(toGi, 0, grp);
    if (activeGroup === _sgrpDragFrom) activeGroup = toGi;
    _sgrpDragFrom = null;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }

  /* ── Product-within-group drag-to-reorder ── */
  let _spDragFrom = null, _spDragGi = null;
  function spDragStart(e, gi, pi) {
    _spDragFrom = pi; _spDragGi = gi;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sp-draggable')?.classList.add('sp-dragging'), 0);
  }
  function spDragEnd(e) {
    document.querySelectorAll('.sp-draggable').forEach(r => r.classList.remove('sp-dragging','sp-drag-over'));
  }
  function spDragOver(e) {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sp-draggable');
    if (row) {
      document.querySelectorAll('.sp-draggable').forEach(r => r.classList.remove('sp-drag-over'));
      row.classList.add('sp-drag-over');
    }
  }
  function spDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sp-draggable')?.classList.remove('sp-drag-over');
  }
  function spDrop(e, gi, toPi) {
    e.preventDefault();
    document.querySelectorAll('.sp-draggable').forEach(r => r.classList.remove('sp-dragging','sp-drag-over'));
    if (_spDragFrom === null || _spDragFrom === toPi || _spDragGi !== gi) { _spDragFrom = null; _spDragGi = null; return; }
    const prods = DB.sidebar_groups[gi].products;
    const item = prods.splice(_spDragFrom, 1)[0];
    prods.splice(toPi, 0, item);
    _spDragFrom = null; _spDragGi = null;
    _flash(); _renderTab('sidebar'); UI.buildSidebar();
  }

  /* ══ ACTIONS ══ */
  function openProd(id) {
    activeProd = id; activeSec = null;
    _renderTab('products');
    _setTitle('Produits');
    // Scroll the expanded row into view
    setTimeout(() => {
      document.querySelector('.adm-prod-row-open')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
  function closeProd() {
    activeProd = null; activeSec = null;
    _renderTab('products');
    _setTitle('Produits');
  }

  /* ── Delete product ── */
  function deleteProd(id) {
    const p = DB.products.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`Supprimer le produit "${p.name}" ?\nCette action est irréversible.`)) return;
    // Remove from all sidebar groups
    (DB.sidebar_groups || []).forEach(grp => {
      const pi = (grp.products || []).indexOf(id);
      if (pi >= 0) grp.products.splice(pi, 1);
    });
    const idx = DB.products.findIndex(x => x.id === id);
    if (idx >= 0) DB.products.splice(idx, 1);
    activeProd = null; activeSec = null;
    _flash(); _renderProd(); UI.buildSidebar();
  }

  /* ── Rename product — inline edit in place ── */
  function renameProd(id) {
    const p = DB.products.find(x => x.id === id);
    if (!p) return;

    // Find the name element and edit button in the DOM
    const btn = document.querySelector(`[data-rename-id="${id}"]`);
    if (!btn) return;
    const nameEl = btn.closest('[onclick*="stopPropagation"]')
                      .parentElement.querySelector('.adm-prod-name');
    if (!nameEl) return;

    // Already editing?
    if (nameEl.querySelector('input')) return;

    // Replace name text with input
    const badge = nameEl.querySelector('.adm-prod-type-badge');
    const badgeHTML = badge ? badge.outerHTML : '';
    const origName = p.name;

    nameEl.innerHTML =
      `<input id="adm-rename-inp" value="${origName.replace(/"/g,'&quot;')}"
        style="font:inherit;font-size:.82rem;font-weight:600;color:var(--t1);
               border:none;border-bottom:1.5px solid var(--bl);background:transparent;
               outline:none;width:${Math.max(origName.length,10)}ch;padding:0 2px"
        onclick="event.stopPropagation()"
        onkeydown="if(event.key==='Enter'){ADMIN._confirmRename('${id}')}else if(event.key==='Escape'){ADMIN._cancelRename('${id}','${origName.replace(/'/g,"\\'")}')}"
      /> ${badgeHTML}`;
    nameEl.querySelector('input').focus();
    nameEl.querySelector('input').select();

    // Swap edit btn → confirm btn
    btn.innerHTML = IC.check;
    btn.title = 'Confirmer';
    btn.style.color = 'var(--gn)';
    btn.setAttribute('onclick', `event.stopPropagation();ADMIN._confirmRename('${id}')`);
  }

  function _confirmRename(id) {
    const p = DB.products.find(x => x.id === id);
    if (!p) return;
    const inp = document.getElementById('adm-rename-inp');
    const newName = inp ? inp.value.trim() : '';
    if (newName && newName !== p.name) {
      p.name = newName;
      _flash();
    }
    _renderProd(); UI.buildSidebar();
  }

  function _cancelRename(id, origName) {
    // Re-render to restore original state cleanly
    _renderProd();
  }



  /* ── saveProd: kept for HTML onclick compatibility, now just triggers auto-save ── */
  function saveProd() { _flash(); }

  let _prodSearch = '';

  /* ── New product wizard ── */
  function selectNewType(t) {
    // Snapshot whatever the user has already typed before the re-render wipes the DOM
    const nameEl = document.getElementById('newProdName');
    const idEl   = document.getElementById('newProdId');
    const icoEl  = document.getElementById('newProdIcon');
    if (nameEl) _newProdDraft.name   = nameEl.value;
    if (idEl)   _newProdDraft._rawId = idEl.value;
    if (icoEl)  _newProdDraft.icon   = icoEl.value;
    _newProdDraft.calc_engine = t;
    _renderProd();
  }

  /* ── Product search filter ── */
  function prodSearch(q) {
    _prodSearch = q;
    const prev = document.querySelector('#admBody input[type="search"]');
    const ss = prev ? prev.selectionStart : q.length;
    const se = prev ? prev.selectionEnd   : q.length;
    _renderTab('products');
    requestAnimationFrame(() => {
      const inp = document.querySelector('#admBody input[type="search"]');
      if (inp) { inp.focus(); inp.setSelectionRange(ss, se); }
    });
  }

  /* ── Change engine on existing product ── */
  function changeEngine(pi, engine) {
    const _legacyMap = { sheet_fit:'standard', sqm:'grand_format', gadget:'gadget', carnet:'carnet', service:'conception', packaging:'packaging' };
    DB.products[pi].calc_engine  = engine;
    DB.products[pi].product_type = _legacyMap[engine] || 'standard';
    _flash(); _renderProd();
  }

  /* ── Offset profile CRUD ── */
  function addNumProfile() {
    if (!DB.numerique_profiles) DB.numerique_profiles = [];
    const n  = DB.numerique_profiles.length + 1;
    const id = 'num_' + Date.now().toString(36);
    DB.numerique_profiles.push({
      id, label: 'Numérique ' + n,
      cost_per_face: 2, planche: 'A3+',
    });
    _flash(); _renderTab(activeTab);
  }
  function removeNumProfile(idx) {
    const arr = DB.numerique_profiles || [];
    if (!arr.length) return;
    const removed = arr[idx];
    const usedBy = (DB.products||[]).filter(p => p.num_profile_id === removed.id).map(p => p.name);
    if (usedBy.length) {
      if (!confirm('Ce profil est utilisé par : ' + usedBy.join(', ') + '.\nSupprimer quand même ?')) return;
      (DB.products||[]).forEach(p => { if (p.num_profile_id === removed.id) delete p.num_profile_id; });
    }
    arr.splice(idx, 1);
    _flash(); _renderTab(activeTab);
  }
  function addOffsetProfile() {
    if (!DB.offset_profiles) DB.offset_profiles = [];
    const n  = DB.offset_profiles.length + 1;
    const id = 'offset_' + Date.now().toString(36);
    DB.offset_profiles.push({
      id, label: 'Offset ' + n,
      setup_cost: 0, cost_per_plate: 0, print_per_face: 1, planche: 'A3+',
    });
    DB.offset = DB.offset_profiles[0];
    _flash(); _renderTab(activeTab);
  }
  function removeOffsetProfile(idx) {
    if (!DB.offset_profiles || DB.offset_profiles.length <= 1) return;
    const removed = DB.offset_profiles[idx];
    const usedBy = (DB.products||[]).filter(p => p.offset_profile_id === removed.id).map(p => p.name);
    if (usedBy.length) {
      if (!confirm('Ce profil est utilisé par : ' + usedBy.join(', ') + '.\nSupprimer quand même ?')) return;
      (DB.products||[]).forEach(p => { if (p.offset_profile_id === removed.id) delete p.offset_profile_id; });
    } else {
      if (!confirm('Supprimer le profil "' + (removed.label||removed.id) + '" ?')) return;
    }
    DB.offset_profiles.splice(idx, 1);
    DB.offset = DB.offset_profiles[0];
    _flash(); _renderTab(activeTab);
  }

  function startNewProd()   { _newProdMode=true; _newProdDraft={}; activeProd=null; activeSec=null; _renderProd(); }
  function cancelNewProd()  { _newProdMode=false; _newProdDraft={}; _renderProd(); }
  function confirmNewProd() {
    const name   = document.getElementById('newProdName')?.value?.trim();
    const rawId  = document.getElementById('newProdId')?.value?.trim();
    const icon   = document.getElementById('newProdIcon')?.value || 'layout';
    const engine = document.getElementById('newProdType')?.value || 'sheet_fit';
    const _legacyType = { sheet_fit:'standard', sqm:'grand_format', gadget:'gadget', carnet:'carnet', service:'conception', packaging:'packaging' };
    if (!name) { alert('Le nom est obligatoire.'); return; }
    const id = rawId
      ? rawId.toLowerCase().replace(/[^a-z0-9-]/g,'-')
      : name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    if (DB.products.find(p=>p.id===id)) { alert(`L'identifiant "${id}" existe déjà.`); return; }
    const newProd = {
      id, name, icon,
      calc_engine:  engine,
      product_type: _legacyType[engine] || 'standard',
      sizes: [], paper_stocks: [], paper_stocks_special: [],
      finishes_lam: [], finishes_addon: [], sides: ['single','double'],
      quantities: [100, 250, 500], composition: [],
    };
    DB.products.push(newProd);
    _newProdMode = false; _newProdDraft = {};
    DB_MOD.persistCurrent(); // local persist — Supabase push happens via _flash on next interaction
    openProd(id);
    // Show a one-time tip about sidebar assignment
    setTimeout(() => {
      const tip = document.createElement('div');
      tip.style.cssText='position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:.5rem 1.1rem;border-radius:9px;font-size:.72rem;font-weight:500;z-index:9999;display:flex;align-items:center;gap:.5rem';
      tip.innerHTML='✓ Produit créé. Configurez ses sections puis allez dans <strong style="color:#60a5fa">Sidebar</strong> pour l\'assigner à un groupe.';
      document.body.appendChild(tip);
      setTimeout(()=>tip.remove(), 4500);
    }, 200);
  }

  /* ── Section Builder actions ── */

  /* Helper: get product by index and ensure composition is initialised.
     Replaces the repeated 2-line guard scattered across every sb* function. */
  function _getComp(pi) {
    const p = DB.products[pi];
    if (!p.composition) p.composition = _getComposition(p);
    return p;
  }

  function sbToggle(ei)  { activeSec = activeSec===ei ? null : ei; _renderProd(); }
  function sbAdd(pi, tid) {
    const p = _getComp(pi);
    p.composition.push({ type_id: tid, config: {} });
    activeSec = p.composition.length - 1;
    _flash(); _renderProd();
  }
  function sbRemove(pi, ei) {
    const p = _getComp(pi);
    p.composition.splice(ei, 1);
    if (activeSec >= p.composition.length) activeSec = null;
    _flash(); _renderProd();
  }
  function sbMove(pi, ei, dir) {
    const p = _getComp(pi);
    const arr = p.composition;
    const ni = ei + dir;
    if(ni < 0 || ni >= arr.length) return;
    [arr[ei], arr[ni]] = [arr[ni], arr[ei]];
    activeSec = ni;
    _flash(); _renderProd();
  }
  function sbTogglePaper(pi, ei, field, id, checked) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg[field] = cfg[field] || [];
    const idx = cfg[field].indexOf(id);
    if(checked && idx<0) cfg[field].push(id);
    if(!checked && idx>=0) cfg[field].splice(idx,1);
    _flash();
  }
  function sbSetCfg(pi, ei, key, val) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg[key] = val;
    _flash(); _renderProd();
  }

  function sbGetCfg(pi, ei, key) {
    const p = _getComp(pi);
    return p?.composition?.[ei]?.config?.[key];
  }

  function sbSetDefault(pi, ei, value, field) {
    field = field || 'default';
    const p   = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    // Toggle: clicking the active diamond clears it (null = no pre-selection)
    cfg[field] = cfg[field] === value ? null : value;
    _flash(); _renderProd();
  }

  function sbAddSize(pi, ei) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg.items = cfg.items || [...(p.sizes||[])];
    cfg.items.push({ id:'sz-'+Date.now(), label:'Nouveau', w:210, h:297, cost_base:0, dims:'210×297 mm' });
    _flash(); _renderProd();
  }
  function sbRemoveSize(pi, ei, i) {
    const p = DB.products[pi];
    p.composition[ei].config.items.splice(i,1);
    _flash(); _renderProd();
  }
  function sbSizeLabel(pi, ei, i, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if(!cfg.items) return;
    cfg.items[i].label = val; _flash();
  }
  function sbSizeDim(pi, ei, i, field, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if(!cfg.items) return;
    cfg.items[i][field] = val;
    // keep dims in sync so legacy field stays accurate
    if (field === 'w' || field === 'h') {
      const s = cfg.items[i];
      if (s.w && s.h) s.dims = `${s.w}×${s.h} mm`;
    }
    _flash();
    if(curProd && curProd.id===DB.products[pi].id) UI.renderFooter();
  }
  /* ── Sac-format preset CRUD ── */
  function sbSacPreset(pi, ei, i, field, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if (!cfg.presets) cfg.presets = [
      { label:'Petit',  l:240, h:320, souf:80  },
      { label:'Moyen',  l:320, h:420, souf:100 },
      { label:'Grand',  l:380, h:480, souf:120 },
    ];
    cfg.presets[i][field] = val;
    _flash();
  }
  function sbSacAddPreset(pi, ei) {
    const cfg = DB.products[pi].composition[ei].config;
    if (!cfg.presets) cfg.presets = [];
    cfg.presets.push({ label:'Nouveau', l:320, h:420, souf:100 });
    _flash(); _renderTab(activeTab);
  }
  function sbSacRemovePreset(pi, ei, i) {
    const cfg = DB.products[pi].composition[ei].config;
    if (cfg.presets) cfg.presets.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }
  function sbBoitePreset(pi, ei, i, field, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if (!cfg.presets) cfg.presets = [
      { label:'Petite',  l:150, h:100, prof:50  },
      { label:'Moyenne', l:250, h:150, prof:80  },
      { label:'Grande',  l:350, h:200, prof:100 },
    ];
    cfg.presets[i][field] = val;
    _flash();
  }
  function sbBoiteAddPreset(pi, ei) {
    const cfg = DB.products[pi].composition[ei].config;
    if (!cfg.presets) cfg.presets = [];
    cfg.presets.push({ label:'Nouveau', l:250, h:150, prof:80 });
    _flash(); _renderTab(activeTab);
  }
  function sbBoiteRemovePreset(pi, ei, i) {
    const cfg = DB.products[pi].composition[ei].config;
    if (cfg.presets) cfg.presets.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }
  /* ── Size drag-to-reorder ── */
  let _dragFrom    = null;
  let _secDragFrom = null;
  let _lDragFrom   = null;  // for check-row lists (paper, lam, addon, gf-options)

  /* ── List (check-row) drag-to-reorder ── */
  function sbLDragStart(e, i) {
    _lDragFrom = i;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sz-draggable')?.classList.add('dragging'), 0);
  }
  function sbLDragEnd(e) {
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
  }
  function sbLDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sz-draggable');
    if (row) {
      document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    }
  }
  function sbLDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sz-draggable')?.classList.remove('drag-over');
  }
  function sbLDrop(e, type, pi, ei, toIdx) {
    e.preventDefault();
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
    if (_lDragFrom === null || _lDragFrom === toIdx) { _lDragFrom = null; return; }

    // Helper: splice within a filtered view of a source array using filtered indices.
    // The drag indices (i) always come from the .map() over the (possibly filtered)
    // source array, so we must reorder that same source — not the cfg subset.
    function _reorderFiltered(src, filterFn, from, to) {
      const view = src.filter(filterFn);
      const a = src.indexOf(view[from]);
      const b = src.indexOf(view[to]);
      if (a < 0 || b < 0) return false;
      const [item] = src.splice(a, 1);
      src.splice(b, 0, item);
      return true;
    }

    let ok = false;
    if (type === 'papers') {
      // paper section: rows from DB.paper_stocks (unfiltered)
      const [item] = DB.paper_stocks.splice(_lDragFrom, 1);
      DB.paper_stocks.splice(toIdx, 0, item);
      ok = true;
    } else if (type === 'items') {
      // size / qty items live in cfg.items — indices match directly
      const cfg = DB.products[pi]?.composition?.[ei]?.config;
      if (cfg?.items) {
        const [item] = cfg.items.splice(_lDragFrom, 1);
        cfg.items.splice(toIdx, 0, item);
        ok = true;
      }
    } else {
      // 'allowed' and 'lam' — rows come from global DB arrays (finishes, finishes_addon…)
      // so we reorder those globals; cfg.allowed/lam (ID subsets) stay valid as-is.
      const entry = DB.products[pi]?.composition?.[ei];
      const tid   = typeof entry === 'string' ? entry : entry?.type_id;
      const noNone = f => f.id !== 'none';

      if (type === 'lam') {
        // cat-int / cat-cov lam rows: DB.finishes filtered by id!=='none'
        ok = _reorderFiltered(DB.finishes, noNone, _lDragFrom, toIdx);
      } else { // type === 'allowed'
        if (tid === 'lam') {
          // lam section: DB.finishes filtered by id!=='none'
          ok = _reorderFiltered(DB.finishes, noNone, _lDragFrom, toIdx);
        } else if (tid === 'cat-int') {
          // cat-int paper rows: DB.paper_stocks filtered by !special
          ok = _reorderFiltered(DB.paper_stocks, ps => !ps.special, _lDragFrom, toIdx);
        } else if (tid === 'cat-cov') {
          // cat-cov paper rows: DB.paper_stocks (unfiltered)
          const [item] = DB.paper_stocks.splice(_lDragFrom, 1);
          DB.paper_stocks.splice(toIdx, 0, item);
          ok = true;
        } else if (tid === 'addon') {
          // addon section: DB.finishes_addon (unfiltered)
          const src = DB.finishes_addon || [];
          const [item] = src.splice(_lDragFrom, 1);
          src.splice(toIdx, 0, item);
          ok = true;
        } else {
          // fallback for any cfg.allowed that genuinely stores ordered IDs (e.g. sizes in rollup)
          const cfg = DB.products[pi]?.composition?.[ei]?.config;
          if (cfg?.allowed) {
            const [item] = cfg.allowed.splice(_lDragFrom, 1);
            cfg.allowed.splice(toIdx, 0, item);
            ok = true;
          }
        }
      }
    }

    _lDragFrom = null;
    if (ok) { _flash(); _renderProd(); }
  }

  function sbDragStart(e, pi, ei, i) {
    _dragFrom = i;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sz-draggable')?.classList.add('dragging'), 0);
  }
  function sbDragEnd(e) {
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
  }
  function sbDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const row = e.target.closest('.sz-draggable');
    if (row) {
      document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
    }
  }
  function sbDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sz-draggable')?.classList.remove('drag-over');
  }
  function sbDrop(e, pi, ei, toIdx) {
    e.preventDefault();
    document.querySelectorAll('.sz-draggable').forEach(r => r.classList.remove('dragging','drag-over'));
    if (_dragFrom === null || _dragFrom === toIdx) { _dragFrom = null; return; }
    const cfg = DB.products[pi].composition[ei].config;
    if (!cfg.items) { _dragFrom = null; return; }
    const item = cfg.items.splice(_dragFrom, 1)[0];
    cfg.items.splice(toIdx, 0, item);
    _dragFrom = null;
    _flash(); _renderProd();
  }

  /* ── Section card drag-to-reorder ── */
  function secDragStart(e, pi, ei) {
    _secDragFrom = ei;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.closest('.sb-card')?.classList.add('sec-dragging'), 0);
  }
  function secDragEnd(e) {
    document.querySelectorAll('.sb-card').forEach(c => c.classList.remove('sec-dragging','sec-drag-over'));
  }
  function secDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.target.closest('.sb-card');
    if (card) {
      document.querySelectorAll('.sb-card').forEach(c => c.classList.remove('sec-drag-over'));
      card.classList.add('sec-drag-over');
    }
  }
  function secDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget))
      e.target.closest('.sb-card')?.classList.remove('sec-drag-over');
  }
  function secDrop(e, pi, toEi) {
    e.preventDefault();
    document.querySelectorAll('.sb-card').forEach(c => c.classList.remove('sec-dragging','sec-drag-over'));
    if (_secDragFrom === null || _secDragFrom === toEi) { _secDragFrom = null; return; }
    const p = _getComp(pi);
    const section = p.composition.splice(_secDragFrom, 1)[0];
    p.composition.splice(toEi, 0, section);
    if (activeSec === _secDragFrom) activeSec = toEi;
    _secDragFrom = null;
    _flash(); _renderProd();
  }

  function sbAddQty(pi, ei) {
    const p = _getComp(pi);
    const cfg = p.composition[ei].config = p.composition[ei].config || {};
    cfg.items = cfg.items || [...(p.quantities||p.page_options||[])];
    cfg.items.push(100);
    _flash(); _renderProd();
  }
  function sbRemoveQty(pi, ei, i) {
    DB.products[pi].composition[ei].config.items.splice(i,1);
    _flash(); _renderProd();
  }
  function sbQtyVal(pi, ei, i, val) {
    const cfg = DB.products[pi].composition[ei].config;
    if(!cfg.items) return;
    cfg.items[i] = val; _flash();
  }

  /* ── Deep path setter (DO NOT CHANGE) ── */
  function set(path, value) {
    const parts = path.split('.');
    let obj = DB;
    for (let i = 0; i < parts.length - 1; i++) {
      const k = isNaN(parts[i]) ? parts[i] : +parts[i];
      if (obj[k] == null) obj[k] = isNaN(parts[i + 1]) ? {} : [];
      obj = obj[k];
    }
    const last = parts[parts.length - 1];
    obj[isNaN(last) ? last : +last] = value;
    _flash();
    if (curProd) UI.renderFooter();
    if (path === 'shop.logo_svg') _syncLogo();
  }

  /* ── Fallback logo (original hardcoded SVG) ── */
  const _FALLBACK_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 394.5 116.2" style="height:20px;width:auto;display:block"><path fill="#2463EB" d="M115,0v24.1c0,7.9-6.4,14.2-14.2,14.2H76.7V0H115z M38.3,0H0v115h38.3V76.7h24.6c7.6,0,13.8-6.2,13.8-13.8V38.3H38.3V0z"/><path fill="#606060" d="M100.1,114.5H76.5v-38h38v23.6C114.5,108.1,108.1,114.5,100.1,114.5z M175.2,116.2c9.2,0,17.5-1.9,24.9-5.8c7.4-3.8,13.1-9.4,17.4-16.6c4.2-7.2,6.3-15.6,6.3-25.1c0-9.6-2.1-17.9-6.3-25c-4.2-7.1-10-12.6-17.3-16.5c-7.3-3.8-15.6-5.8-24.8-5.8c-9.2,0-17.5,1.9-24.8,5.8c-7.3,3.8-13.1,9.3-17.3,16.5c-4.2,7.1-6.3,15.5-6.3,25c0,9.7,2.1,18.1,6.3,25.2c4.2,7.1,9.9,12.6,17.2,16.5C157.7,114.3,165.9,116.2,175.2,116.2z M175.2,88.2c-4.5,0-8.2-1.6-11-4.9c-2.9-3.3-4.3-8.1-4.3-14.5c0-6.3,1.5-11,4.4-14.3s6.6-4.9,11-4.9c4.4,0,8.1,1.6,11.1,4.9c3,3.3,4.5,8.1,4.5,14.3c0,6.3-1.5,11.1-4.5,14.4C183.4,86.5,179.7,88.2,175.2,88.2z M282.1,87.5c-2.7,0-4.7-0.5-5.8-1.6c-1.2-1.1-1.7-2.9-1.7-5.4v-31h16.8V22.6h-16.8V0.2H242v22.4h-11.4v26.8H242v30.5c0,23.4,11.8,35.1,35.4,35.1h14V87.5H282.1z M394.5,67.8c0-9.4-2-17.6-5.9-24.6c-4-7-9.4-12.3-16.5-16.1c-7-3.7-15.1-5.6-24.2-5.6c-9.2,0-17.4,1.9-24.5,5.8c-7.1,3.8-12.6,9.3-16.6,16.4c-4,7.1-5.9,15.5-5.9,25.1c0,9.7,2,18.1,6,25.2c4,7.1,9.6,12.6,16.6,16.5c7.1,3.8,15.2,5.8,24.3,5.8c7.6,0,14.5-1.4,20.8-4.3c6.3-2.9,11.4-6.8,15.6-11.8c4.1-5,6.9-10.7,8.3-17h-34.4c-2.3,4.8-6.2,7.2-11.5,7.2c-3.8,0-7-1.2-9.5-3.7c-2.5-2.5-3.9-6.2-4.2-11.3h61.1C394.4,72.8,394.5,70.3,394.5,67.8z M333.1,59.7c0.8-4.2,2.4-7.3,4.9-9.5c2.5-2.1,5.8-3.2,9.7-3.2c4,0,7.2,1.1,9.9,3.4c2.6,2.3,4,5.4,4,9.3H333.1z"/></svg>`;

  /* ── Sync the toolbar logo slot with DB.shop.logo_svg (or fallback) ── */
  function _syncLogo() {
    const slot = $('admLogoSlot');
    if (!slot) return;
    const svg = (DB && DB.shop && DB.shop.logo_svg && DB.shop.logo_svg.trim()) || '';
    if (svg && svg.startsWith('<svg')) {
      // Strip width/height/style from root <svg> tag so toolbar sizing controls it
      const normalised = svg.replace(/<svg([^>]*)>/i, (m, attrs) => {
        const clean = attrs.replace(/\s*(width|height|style)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
        return `<svg${clean} style="height:20px;width:auto;display:block;max-width:140px">`;
      });
      slot.innerHTML = normalised;
    } else {
      slot.innerHTML = _FALLBACK_LOGO;
    }
  }

  /* ── Live preview while typing in the SVG textarea ── */
  function _logoPreview(val) {
    const el = $('logoSvgPreview');
    if (!el) return;
    const trimmed = val.trim();
    if (trimmed.startsWith('<svg')) {
      el.innerHTML = trimmed;
      const svg = el.querySelector('svg');
      if (svg) {
        svg.style.maxWidth  = '100px';
        svg.style.maxHeight = '50px';
        svg.style.width     = 'auto';
        svg.style.height    = 'auto';
      }
    } else {
      el.innerHTML = '<span style="font-size:.6rem;color:var(--t3)">' + (trimmed ? 'SVG invalide' : '—') + '</span>';
    }
  }

  /* ── Apply SVG from the textarea, save to DB, refresh tab ── */
  function _logoApply(val) {
    set('shop.logo_svg', val.trim());
    _renderTab('images');
  }
  /* ── Auth method toggle ── */
  function setAuthMethod(key, val) {
    if (!DB.auth_methods) DB.auth_methods = { magic_link: true, oauth_google: true, guest: true, email_no_confirm: false };
    DB.auth_methods[key] = val;
    _flash();
    _renderTab('auth');
  }

  /* setEmailMode kept for backward compat — auth methods are now individual toggles */
  function setEmailMode(mode) {
    if (!DB.auth_methods) DB.auth_methods = {};
    if (mode === 'magic_link')  { DB.auth_methods.magic_link = true;  DB.auth_methods.email_no_confirm = false; }
    else if (mode === 'password'){ DB.auth_methods.magic_link = false; DB.auth_methods.email_no_confirm = true; }
    else                         { DB.auth_methods.magic_link = false; DB.auth_methods.email_no_confirm = false; }
    _flash(); _renderTab('auth');
  }

  let _flashPushTimer = null;
  function _flash() {
    DB_MOD.persistCurrent();
    const el = $('admSaved');
    if (DB_MOD.getSource() === 'supabase') {
      el.textContent = '⏳ Enregistrement…';
      el.style.color = '';
      el.classList.add('on');
      clearTimeout(_flashPushTimer);
      _flashPushTimer = setTimeout(() => {
        DB_MOD.pushToSupabase().then(result => {
          if (result.ok) {
            el.textContent = '✓ Enregistré';
            el.style.color = 'var(--gn)';
          } else {
            el.textContent = '⚠ Erreur sauvegarde';
            el.style.color = 'var(--rd)';
          }
          clearTimeout(el._t);
          el._t = setTimeout(() => { el.classList.remove('on'); el.textContent = '✓ Enregistré'; el.style.color = ''; }, 2800);
        });
      }, 800);
    } else {
      el.textContent = '✓ Enregistré';
      el.style.color = '';
      el.classList.add('on');
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove('on'), 1800);
    }
  }

  /* ── Paper stocks ── */
  function removePaper(idx)    { DB.paper_stocks.splice(idx,1); _flash(); _renderTab(activeTab); }
  function addPaper(special)   { DB.paper_stocks.push({id:'paper-'+Date.now(),label:'Nouveau papier',desc:'',cost_per_sheet:0,...(special===true||special==='true'?{special:true}:{})}); _flash(); _renderTab(activeTab); }
  /* ── Envelope generator ── */
  function generateEnvelope() {
    const name    = $('envGenName')?.value?.trim();
    const size    = $('envGenSize')?.value?.trim();
    const type    = $('envGenType')?.value || 'normal';
    const cost    = parseFloat($('envGenCost')?.value) || 0;
    const print   = parseFloat($('envGenPrint')?.value) || 0;
    const thresh  = parseInt($('envGenThresh')?.value) || 500;
    if (!name) { alert('Renseignez le nom (ex: DL)'); return; }
    DB.paper_stocks.push({
      id: 'env-' + name.toLowerCase().replace(/\s/g,'-') + '-' + type + '-' + Date.now(),
      label: name, size: size || '',
      envelope: true, envelope_type: type,
      cost_per_sheet: cost,
      print_cost_per_color: print,
      print_threshold: thresh,
    });
    // Reset form
    if ($('envGenName')) $('envGenName').value = '';
    if ($('envGenSize')) $('envGenSize').value = '';
    if ($('envGenCost'))   $('envGenCost').value = '0';
    if ($('envGenPrint'))  $('envGenPrint').value = '0';
    if ($('envGenThresh')) $('envGenThresh').value = '500';
    _flash(); _renderTab(activeTab);
  }

  /* ── Envelope formats (new model) ── */
  function addEnvFormat2() {
    const name = $('efName')?.value?.trim().toUpperCase();
    const w    = parseFloat($('efW')?.value) || 0;
    const h    = parseFloat($('efH')?.value) || 0;
    const cost = parseFloat($('efCost')?.value) || 0;
    if (!name) { alert('Renseignez le nom (ex: DL)'); return; }
    if (!DB.envelope_formats) DB.envelope_formats = [];
    DB.envelope_formats.push({ id:'ef-'+Date.now(), name, w, h, size:`${w}×${h} mm`, cost });
    if ($('efName'))  $('efName').value  = '';
    if ($('efW'))     $('efW').value     = '';
    if ($('efH'))     $('efH').value     = '';
    if ($('efCost'))  $('efCost').value  = '0';
    _flash(); _renderTab(activeTab);
  }
  function addEnvFormatPreset(name, w, h) {
    if ($('efName')) $('efName').value = name;
    if ($('efW'))    $('efW').value    = w;
    if ($('efH'))    $('efH').value    = h;
  }
  function removeEnvFormat(i) {
    DB.envelope_formats.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }

  /* ── Envelope types (new model) ── */
  function addEnvType() {
    const name    = $('etName')?.value?.trim();
    const costPce = parseFloat($('etCostPce')?.value) || 0;
    const costCol = parseFloat($('etCost')?.value)    || 0;
    if (!name) { alert('Renseignez le nom du type (ex: Autodex)'); return; }
    if (!DB.envelope_types) DB.envelope_types = [];
    DB.envelope_types.push({ id:'et-'+Date.now(), name, cost_per_piece: costPce, cost_per_color: costCol });
    if ($('etName'))    $('etName').value    = '';
    if ($('etCostPce')) $('etCostPce').value = '0';
    if ($('etCost'))    $('etCost').value    = '0';
    _flash(); _renderTab(activeTab);
  }
  function removeEnvType(i) {
    DB.envelope_types.splice(i, 1);
    _flash(); _renderTab(activeTab);
  }

  /* ── Lam finishes ── */
  function removeLam(idx)      { DB.finishes.splice(idx,1); _flash(); _renderTab(activeTab); }
  function addLam()            { DB.finishes.push({id:'lam-'+Date.now(),label:'Nouveau pelliculage',group:'lam',cost_ps:1,per_side:true}); _flash(); _renderTab(activeTab); }
  /* ── Addon finishes ── */
  function removeAddon(idx)    { DB.finishes_addon.splice(idx,1); _flash(); _renderTab(activeTab); }
  function addAddon()          { DB.finishes_addon.push({id:'addon-'+Date.now(),label:'Nouvelle finition',group:'faconnage',pricing_model:'per_unit',cost_setup:0,cost_pu:0}); _flash(); _renderTab(activeTab); }
  /* ── Binding options ── */
  function addBinding()        { if (!DB.binding_options) DB.binding_options=[]; DB.binding_options.push({id:'bind-'+Date.now(),label:'Nouvelle reliure',cost_flat:0,cost_per_copy:0}); _flash(); _renderTab(activeTab); }
  function removeBinding(i)    { DB.binding_options.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── GF finishes ── */
  function addGfFinish()       { if (!DB.gf_finishes) DB.gf_finishes=[]; DB.gf_finishes.push({id:'gff-'+Date.now(),label:'Nouvelle finition GF',cost_flat:0}); _flash(); _renderTab(activeTab); }
  function removeGfFinish(i)   { if (DB.gf_finishes) DB.gf_finishes.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── GF global materials ── */
  function addGfMat()          { if (!DB.gf_materials) DB.gf_materials=[]; DB.gf_materials.push({id:'mat-'+Date.now(),label:'Nouvelle matière',cost_per_sqm:0,laize:1}); _flash(); _renderTab(activeTab); }
  function removeGfMat(i)      { if (DB.gf_materials) DB.gf_materials.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Rollup / X-banner supports ── */
  function addRuSupport()      { if (!DB.rollup_supports) DB.rollup_supports=[]; DB.rollup_supports.push({id:'sup-'+Date.now(),label:'Nouveau support',cost:0}); _flash(); _renderTab(activeTab); }
  function removeRuSupport(i)  { if (DB.rollup_supports) DB.rollup_supports.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── GF materials (global) ── */
  function addGfMaterial()     { if (!DB.gf_materials) DB.gf_materials=[]; DB.gf_materials.push({id:'gfm-'+Date.now(),label:'Nouvelle matière',cost_per_sqm:0,laize:1}); _flash(); _renderTab(activeTab); }
  function removeGfMaterial(i) { if (DB.gf_materials) DB.gf_materials.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Supports (global — rollup, xbanner…) ── */
  function addSupport()        { if (!DB.supports) DB.supports=[]; DB.supports.push({id:'sup-'+Date.now(),label:'Nouveau support',cost:0}); _flash(); _renderTab(activeTab); }
  function removeSupport(i)    { if (DB.supports) DB.supports.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Planche formats ── */
  function addGadget() {
    const id='gadget-'+Date.now();
    DB.products.push({id,name:'Nouveau gadget',icon:'tag',calc_engine:'gadget',product_type:'gadget',unit_price:0,print_cost:0,print_technique:'',quantities:[10,25,50,100],composition:[]});
    _flash(); _renderTab(activeTab);
  }
  function deleteGadget(id) {
    if (!confirm('Supprimer ce gadget ?')) return;
    const i=DB.products.findIndex(p=>p.id===id);
    if (i>=0){DB.products.splice(i,1);_flash();_renderTab(activeTab);}
  }
  function addPlanche()        { if (!DB.planches) DB.planches=[{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}]; DB.planches.push({id:'P'+Date.now(),w:480,h:320}); _flash(); _renderTab(activeTab); }
  /* ── SQM product helpers ── */
  function addSqmMat(pi)       { const p=DB.products[pi]; const arr=p.gf_materials?'gf_materials':'pancarte_materials'; if(!p[arr])p[arr]=[]; p[arr].push({id:'mat-'+Date.now(),label:'Nouvelle matière',cost_per_sqm:0,laize:1}); _flash(); _renderTab(activeTab); }
  function removeSqmMat(pi,mi) { const p=DB.products[pi]; const arr=p.gf_materials?'gf_materials':'pancarte_materials'; if(p[arr])p[arr].splice(mi,1); _flash(); _renderTab(activeTab); }
  function _activeTab()        { return activeTab; }
  /* ── Conception types ── */
  function removeConcType(pi,i){ DB.products[pi].conception_types.splice(i,1); _flash(); _renderTab(activeTab); }
  function addConcType(pi)     { (DB.products[pi].conception_types=DB.products[pi].conception_types||[]).push({id:'ct-'+Date.now(),label:'Nouvelle prestation',price:500,note:''}); _flash(); _renderTab(activeTab); }
  /* ── Pancarte materials ── */
  function removePanMat(pi,mi){ DB.products[pi].pancarte_materials.splice(mi,1); _flash(); _renderTab(activeTab); }
  function addPanMat(pi)      { (DB.products[pi].pancarte_materials=DB.products[pi].pancarte_materials||[]).push({id:'mat-'+Date.now(),label:'Nouveau support',cost_per_sqm:300}); _flash(); _renderTab(activeTab); }
  function addPancarteMat()   { if (!DB.pancarte_materials) DB.pancarte_materials=[]; DB.pancarte_materials.push({id:'pan-'+Date.now(),label:'Nouveau support',desc:'',cost_per_sqm:300}); _flash(); _renderTab(activeTab); }
  function removePancarteMat(i){ if (DB.pancarte_materials) DB.pancarte_materials.splice(i,1); _flash(); _renderTab(activeTab); }
  /* ── Export ── */
  /* ── Contact & Shop builder ── */
  function _bDeploy() {
    if (!DB.shop) DB.shop = {};
    const s          = DB.shop;
    const savedToken = localStorage.getItem('kote_supa_mgmt_token') || '';
    const savedRef   = (window.SUPABASE_URL || '').replace('https://','').split('.')[0] || '';

    const fnCards = _EDGE_FUNCTIONS.map(fn => `
      <div class="adm-card mb-6">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico" style="background:#f0fdf4">
              <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="1.8" style="width:11px;height:11px"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            </div>
            <div>
              <div class="adm-card-title">${fn.slug}</div>
              <div class="adm-card-sub">${fn.desc}</div>
            </div>
          </div>
        </div>
        <div class="adm-toolbar-wrap">
          <button class="adm-action-btn" style="background:#2463EB;color:#fff;border-color:#2463EB;padding:.35rem .9rem;font-size:.7rem"
            onclick="ADMIN.deployFn('${fn.slug}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Déployer
          </button>
          <span id="deployStatus-${fn.slug}" class="ops-micro-t3"></span>
        </div>
        ${fn.secrets?.length ? `<div style="padding:.4rem .85rem .6rem;font-size:.62rem;color:var(--t3);background:var(--s2)">
          Secrets requis : ${fn.secrets.map(s => `<code style="background:var(--bd);border-radius:3px;padding:1px 5px;font-size:.6rem">${s}</code>`).join(' ')}
        </div>` : ''}
      </div>`).join('');

    return `
      <div class="adm-page-hdr">
        <div>
          <div class="adm-page-title">Edge Functions</div>
          <div class="adm-page-sub">${_EDGE_FUNCTIONS.length} fonction${_EDGE_FUNCTIONS.length>1?'s':''} enregistrée${_EDGE_FUNCTIONS.length>1?'s':''} — déployables en un clic sur n'importe quel projet Supabase</div>
        </div>
      </div>
      <div class="adm-grid adm-grid-1">

        ${_card('Variables runtime',
          '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
          `<div class="adm-row">
            <div><div class="adm-row-label">URL de l'application</div>
            <div class="adm-row-sub">Domaine sans slash final — utilisé dans les liens email</div></div>
            <input class="adm-inp-lbl" class="adm-mono-inp"
              value="${(s.app_url||'').replace(/"/g,'&quot;')}"
              placeholder="https://appkote.netlify.app"
              oninput="ADMIN.set('shop.app_url',this.value)">
          </div>
          <div class="adm-row adm-border-0">
            <div><div class="adm-row-label">Email expéditeur Resend</div>
            <div class="adm-row-sub">Domaine vérifié sur Resend</div></div>
            <input class="adm-inp-lbl" class="adm-mono-inp"
              value="${(s.resend_from_email||'').replace(/"/g,'&quot;')}"
              placeholder="commandes@votre-domaine.ma"
              oninput="ADMIN.set('shop.resend_from_email',this.value)">
          </div>`
        )}

        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico" style="background:#eff6ff">
                <svg viewBox="0 0 24 24" fill="none" stroke="#2463EB" stroke-width="1.8" style="width:11px;height:11px"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <div>
                <div class="adm-card-title">Accès Supabase</div>
                <div class="adm-card-sub">Token stocké uniquement dans votre navigateur — jamais en base</div>
              </div>
            </div>
          </div>
          <div class="adm-rows">
            <div class="adm-row">
              <div><div class="adm-row-label">Project Ref</div>
              <div class="adm-row-sub">Extrait automatiquement de SUPABASE_URL</div></div>
              <input class="adm-inp-lbl" id="deployRef" style="width:160px;font-family:monospace;font-size:.65rem"
                value="${savedRef}" placeholder="abcdefghijklmnop" readonly>
            </div>
            <div class="adm-row adm-border-0">
              <div><div class="adm-row-label">Personal Access Token</div>
              <div class="adm-row-sub">supabase.com → Account → Access Tokens → Generate</div></div>
              <input class="adm-inp-lbl" id="deployToken" type="password"
                class="adm-mono-inp"
                value="${savedToken.replace(/"/g,'&quot;')}"
                placeholder="sbp_xxxxxxxxxxxxxxxxxxxx"
                oninput="localStorage.setItem('kote_supa_mgmt_token',this.value)">
            </div>
          </div>
          <div class="adm-toolbar-wrap">
            <button class="adm-action-btn" style="background:#0f172a;color:#fff;border-color:#0f172a;padding:.35rem .9rem;font-size:.7rem"
              onclick="ADMIN.deployAllFn()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Déployer toutes (${_EDGE_FUNCTIONS.length})
            </button>
            <span id="deployStatusAll" class="ops-micro-t3"></span>
          </div>
        </div>

        <div style="font-size:.62rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.7px;padding:.2rem 0">
          Fonctions enregistrées
        </div>
        ${fnCards}

      </div>`;
  }

  /* ── Deploy a single function by slug ── */
  async function deployFn(slug) {
    const fn    = _EDGE_FUNCTIONS.find(f => f.slug === slug);
    const ref   = ($('deployRef')?.value  || '').trim();
    const token = ($('deployToken')?.value || localStorage.getItem('kote_supa_mgmt_token') || '').trim();
    const st    = $(`deployStatus-${slug}`);
    if (!fn)    { if (st) { st.style.color='#dc2626'; st.textContent='Fonction introuvable dans le registre'; } return; }
    if (!ref)   { if (st) { st.style.color='#dc2626'; st.textContent='Project Ref manquant'; } return; }
    if (!token) { if (st) { st.style.color='#dc2626'; st.textContent='Personal Access Token requis'; } return; }
    if (st) { st.style.color='var(--t3)'; st.textContent='Déploiement…'; }
    try { await _saveConfig(); } catch(e) {}
    try {
      const hdrs = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
      const body = JSON.stringify({ slug: fn.slug, name: fn.slug, body: fn.source, verify_jwt: false });
      let res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions/${fn.slug}`, { method: 'PATCH', headers: hdrs, body });
      if (res.status === 404) res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, { method: 'POST', headers: hdrs, body });
      if (res.ok) {
        if (st) { st.style.color='#16a34a'; st.textContent='✅ Déployée'; }
      } else {
        const err = await res.text().catch(() => res.statusText);
        if (st) { st.style.color='#dc2626'; st.textContent=`❌ ${res.status}: ${err.slice(0,120)}`; }
      }
    } catch(e) {
      if (st) { st.style.color='#dc2626'; st.textContent='❌ ' + e.message; }
    }
  }

  /* ── Deploy all registered functions sequentially ── */
  async function deployAllFn() {
    const stAll = $('deployStatusAll');
    if (stAll) { stAll.style.color='var(--t3)'; stAll.textContent=`Déploiement de ${_EDGE_FUNCTIONS.length} fonctions…`; }
    let ok = 0, fail = 0;
    for (const fn of _EDGE_FUNCTIONS) {
      await deployFn(fn.slug);
      const st = $(`deployStatus-${fn.slug}`);
      if (st?.textContent?.startsWith('✅')) ok++; else fail++;
    }
    if (stAll) {
      stAll.style.color = fail === 0 ? '#16a34a' : '#dc2626';
      stAll.textContent = fail === 0
        ? `✅ ${ok} fonction${ok>1?'s':''} déployée${ok>1?'s':''} avec succès`
        : `⚠️ ${ok} ok — ${fail} échoué${fail>1?'s':''}`;
    }
  }

  /* kept for backward compat with any existing onclick="ADMIN.deployEdgeFunction()" */
  async function deployEdgeFunction() { return deployFn('kote-order-confirm'); }


  /* ── Connexion tab — Supabase credentials + Management API ── */
  function _bConnexion() {
    const supa_url   = window.SUPABASE_URL || '';
    const storedUrl  = localStorage.getItem('kote_supa_url') || '';
    const storedKey  = localStorage.getItem('kote_supa_key') || '';
    const isCustom   = !!storedUrl;
    const savedToken = localStorage.getItem('kote_supa_mgmt_token') || '';
    const savedRef   = supa_url.replace('https://','').split('.')[0] || '';

    /* ── Compact field row ── */
    const _frow = (label, id, val, ph, type='text') =>
      `<div class="adm-tog-row">
        <span class="adm-sec-hdr">${label}</span>
        <input id="${id}" type="${type}"
          style="border:1.5px solid var(--bd);border-radius:var(--r);padding:.44rem .65rem;
            font-size:.78rem;color:var(--t1);background:var(--sf);font-family:inherit;
            transition:border-color var(--ease);width:100%"
          placeholder="${ph}" value="${val}"
          onfocus="this.style.borderColor='var(--bl)'" onblur="this.style.borderColor='var(--bd)'">
      </div>`;

    return `
      ${_pageHdr('Connexion', 'Supabase — URL, clé anon, Management API')}
      <div class="adm-form-col">

        <!-- ① Connexion Supabase -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg('<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>')}</div>
              <div style="flex:1"><div class="adm-card-title">Connexion Supabase</div></div>
              <span style="font-size:.65rem;font-weight:700;padding:2px 9px;border-radius:20px;
                background:${isCustom?'#dcfce7':'#f1f5f9'};color:${isCustom?'#166534':'var(--t3)'}">
                ${isCustom ? '✓ Personnalisé' : 'Par défaut'}
              </span>
            </div>
          </div>
          ${_frow('URL du projet', 'supaUrlInp', storedUrl || supa_url, 'https://xxxx.supabase.co')}
          ${_frow('Clé anon publique', 'supaKeyInp', storedKey || SUPABASE_ANON_KEY, 'eyJhbGci…', 'password')}
          <div style="padding:.55rem 1rem;display:flex;gap:.35rem;flex-wrap:wrap;align-items:center">
            <button class="adm-primary-btn" style="height:32px;font-size:.72rem" onclick="ADMIN.saveSupaCreds()">
              ${_svg('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/>')}
              Enregistrer &amp; Reconnecter
            </button>
            <button class="adm-action-btn" style="height:32px" onclick="ADMIN.downloadConfigJs()">
              ${_svg('<polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>')}
              config.js
            </button>
            ${isCustom ? `<button class="adm-action-btn danger" style="height:32px" onclick="ADMIN.resetSupaCreds()">Réinitialiser</button>` : ''}
          </div>
        </div>

        <!-- ② Management API -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico" style="background:#eff6ff">
                ${_svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>','1.8')}
              </div>
              <div><div class="adm-card-title">Supabase Management API</div>
              <div class="adm-card-sub">Token stocké dans votre navigateur uniquement</div></div>
            </div>
          </div>
          <div class="adm-rows">
            <div class="adm-row">
              <div><div class="adm-row-label">Project Ref</div>
              <div class="adm-row-sub">Extrait automatiquement de l'URL Supabase</div></div>
              <input class="adm-inp-lbl" id="deployRef" style="width:150px;font-family:monospace;font-size:.65rem"
                value="${savedRef}" placeholder="abcdefghijklmnop" readonly>
            </div>
            <div class="adm-row adm-border-0">
              <div><div class="adm-row-label">Personal Access Token</div>
              <div class="adm-row-sub">supabase.com → Account → Access Tokens</div></div>
              <input class="adm-inp-lbl" id="deployToken" type="password"
                style="width:200px;font-family:monospace;font-size:.65rem"
                value="${savedToken.replace(/"/g,'&quot;')}"
                placeholder="sbp_xxxxxxxxxxxxxxxxxxxx"
                oninput="localStorage.setItem('kote_supa_mgmt_token',this.value)">
            </div>
          </div>
        </div>

      </div>`;
  }

  /* ── Authentification tab — methods + OAuth config only ── */
  function _bAuth() {
    if (!DB.contact) DB.contact = {};
    const c          = DB.contact;
    const supa_url   = window.SUPABASE_URL || '';
    const callback_url = supa_url ? supa_url + '/auth/v1/callback' : '—';
    const am = DB.auth_methods || { oauth_google: true, magic_link: true, email_no_confirm: false, guest: true };

    /* ── Toggle row ── */
    const _tog = (key, label, desc, hint) => {
      const on = !!am[key];
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;
        padding:.6rem 1rem;border-bottom:1px solid var(--bd)">
        <div style="min-width:0">
          <div style="font-size:.76rem;font-weight:600;color:var(--t1)">${label}</div>
          <div style="font-size:.65rem;color:var(--t3);margin-top:.1rem;line-height:1.4">${desc}</div>
          ${hint && on ? `<div style="margin-top:.35rem;padding:.38rem .55rem;background:#eff6ff;
            border-radius:5px;font-size:.63rem;color:#1e40af;line-height:1.5">${hint}</div>` : ''}
        </div>
        <label style="display:flex;align-items:center;gap:.45rem;cursor:pointer;user-select:none;flex-shrink:0">
          <span style="font-size:.64rem;font-weight:700;color:${on?'var(--gn)':'var(--t3)'};min-width:22px;text-align:right">${on?'ON':'OFF'}</span>
          <span class="tog-wrap">
            <input type="checkbox" ${on?'checked':''} class="tog-inp"
              onchange="ADMIN.setAuthMethod('${key}',this.checked)">
            <span style="position:absolute;inset:0;border-radius:9px;transition:background .18s;
              background:${on?'var(--bl)':'var(--bd)'};display:flex;align-items:center;
              ${on?'justify-content:flex-end;padding-right:2px':'justify-content:flex-start;padding-left:2px'}">
              <span style="width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.22)"></span>
            </span>
          </span>
        </label>
      </div>`;
    };

    /* ── Read-only row ── */
    const _info = (label, val) =>
      `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:1rem;
        padding:.5rem 1rem;border-bottom:1px solid var(--bd)">
        <span style="font-size:.71rem;color:var(--t2);white-space:nowrap;flex-shrink:0">${label}</span>
        <code style="font-size:.68rem;color:var(--bl);font-family:monospace;word-break:break-all;text-align:right">${val}</code>
      </div>`;

    /* ── Compact field row ── */
    const _frow = (label, id, val, ph, type='text') =>
      `<div class="adm-tog-row">
        <span class="adm-sec-hdr">${label}</span>
        <input id="${id}" type="${type}"
          style="border:1.5px solid var(--bd);border-radius:var(--r);padding:.44rem .65rem;
            font-size:.78rem;color:var(--t1);background:var(--sf);font-family:inherit;
            transition:border-color var(--ease);width:100%"
          placeholder="${ph}" value="${val}"
          onfocus="this.style.borderColor='var(--bl)'" onblur="this.style.borderColor='var(--bd)'">
      </div>`;

    return `
      ${_pageHdr('Authentification', 'Méthodes de connexion client · Configuration OAuth')}
      <div class="adm-form-col">

        <!-- ① Méthodes de connexion -->
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>')}</div>
              <div><div class="adm-card-title">Méthodes de connexion</div>
              <div class="adm-card-sub">Activez ce que vous proposez au checkout client</div></div>
            </div>
          </div>
          ${_tog('oauth_google',     'OAuth Google',             'Connexion via compte Google — nécessite une app Google Cloud', 'Supabase → Auth → Providers → Google → activer, puis coller Client ID &amp; Secret.')}
          ${_tog('magic_link',       'Magic Link',               'Un lien de connexion envoyé par email — aucun mot de passe', 'Supabase → Auth → Providers → Email → activer. "Confirm email" peut rester ON ou OFF.')}
          ${_tog('email_no_confirm', 'Email sans vérification',  'Email + mot de passe, sans étape de confirmation', 'Supabase → Auth → Providers → Email → activer <strong>et désactiver Confirm email</strong>.')}
          ${_tog('guest',            'Continuer sans compte',    'Accès direct sans authentification', '')}
        </div>

        <!-- ② Google OAuth config — shown only when enabled -->
        ${am.oauth_google ? `
        <div class="adm-card" style="overflow:hidden">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l">
              <div class="adm-card-hdr-ico">${_svg('<circle cx="12" cy="12" r="10"/><path d="M17.5 12H12v2.5h3.2c-.4 1.5-1.7 2.5-3.2 2.5-2 0-3.5-1.5-3.5-3.5s1.5-3.5 3.5-3.5c.9 0 1.7.3 2.3.8l1.8-1.8A6 6 0 1012 18a6 6 0 006-6h-.5z"/>')}</div>
              <div><div class="adm-card-title">Configuration Google OAuth</div></div>
            </div>
          </div>
          ${_frow('URL du site', 'authSiteUrlInp', c.site_url||'', 'https://votre-site.netlify.app')}
          ${_info('Callback URL (à coller dans Google Cloud)', callback_url)}
          <div style="padding:.45rem 1rem .55rem;font-size:.67rem;color:var(--t2);line-height:1.6;background:var(--s2);border-top:1px solid var(--bd)">
            <strong>Étapes :</strong> Google Cloud Console → Credentials → OAuth Client → Web → ajouter le Callback URL ci-dessus,
            copier Client ID + Secret → Supabase → Auth → Providers → Google.
          </div>
        </div>` : ''}

      </div>`;
  }
  /* ── Supabase credentials management ── */
  function saveSupaCreds() {
    const url = $('supaUrlInp')?.value?.trim();
    const key = $('supaKeyInp')?.value?.trim();
    if (!url || !key) { alert('URL et clé requis'); return; }
    if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
      alert('URL invalide — doit être https://xxxx.supabase.co'); return;
    }
    if (!key.startsWith('eyJ')) {
      alert('Clé invalide — doit commencer par eyJ...'); return;
    }
    localStorage.setItem('kote_supa_url', url);
    localStorage.setItem('kote_supa_key', key);
    // Clear session DB so it re-fetches from new account
    sessionStorage.removeItem('kote_db');
    sessionStorage.removeItem('kote_db_name');
    // Show feedback then reload
    const btn = document.querySelector('[onclick="ADMIN.saveSupaCreds()"]');
    if (btn) { btn.textContent = '✓ Enregistré — rechargement…'; btn.disabled = true; }
    setTimeout(() => location.reload(), 900);
  }

  function resetSupaCreds() {
    if (!confirm('Revenir aux identifiants par défaut (config.js) ?')) return;
    localStorage.removeItem('kote_supa_url');
    localStorage.removeItem('kote_supa_key');
    sessionStorage.removeItem('kote_db');
    setTimeout(() => location.reload(), 300);
  }

  function downloadConfigJs() {
    const url = $('supaUrlInp')?.value?.trim() || window.SUPABASE_URL || '';
    const key = $('supaKeyInp')?.value?.trim() || window.SUPABASE_ANON_KEY || '';
    if (!url || !key) { alert('Renseignez d\'abord l\'URL et la clé Supabase'); return; }

    const content = `
/* ════════════════════════════════════════════════════════
   DB_MOD  — database load / session persistence + source toggle
   ════════════════════════════════════════════════════════ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROLE — controls feature visibility across the app
   'provider' → full app: admin, PDF, cost breakdown, DB toggle
   'client'   → product catalog + cart + order form only
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
if (typeof ROLE === 'undefined') var ROLE = 'provider';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DB TOGGLE — change DEFAULT_SOURCE to switch boot mode
   'json'      → auto-fetch ./data.json on page load
   'supabase'  → connect to Supabase REST API on page load
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const DEFAULT_SOURCE = 'supabase'; /* ← CHANGE THIS LINE ONLY : supabase | json */

/* ── Supabase credentials — updated ${new Date().toLocaleDateString('fr-FR')} ─── */
const _storedUrl  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_url');
const _storedKey  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_key');

const SUPABASE_URL      = _storedUrl  || '${url}';
const SUPABASE_ANON_KEY = _storedKey  || '${key}';
/* expose to invoice.js (loaded as separate <script>) */
window.SUPABASE_URL      = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
/* ─────────────────────────────────────────────────────── */
`;

    const blob = new Blob([content], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config.js';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ============================================================================
  // DYNAMIC DATABASE EXPORT
  // ============================================================================
  async function exportDB() { return runExport('sql'); } // delegates to dynamic export

  /* ── Images tab ── */
  function _bImages() {
    const has = k => !!localStorage.getItem(`kote_img_${k}`);
    const badge = k => has(k)
      ? `<span style="font-size:.6rem;background:#dcfce7;color:#166534;padding:2px 7px;border-radius:20px;font-weight:700">✓ Chargée</span>`
      : `<span style="font-size:.6rem;background:#fef3c7;color:#92400e;padding:2px 7px;border-radius:20px;font-weight:700">Non chargée</span>`;

    const imgCard = (key, label, hint) => `
      <div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:8px">
        <div style="display:flex;align-items:center;width:100%;gap:8px">
          <div style="flex:1">
            <div class="adm-row-label">${label} ${badge(key)}</div>
            <div class="adm-row-sub">${hint}</div>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <label style="cursor:pointer;background:#2563EB;color:#fff;padding:5px 12px;border-radius:6px;font-size:.65rem;font-weight:700">
              Choisir fichier
              <input type="file" accept="image/*" class="hidden"
                onchange="ADMIN.uploadImg('${key}',this)">
            </label>
            ${has(key) ? `<button onclick="ADMIN.clearImg('${key}')" style="background:none;border:1px solid #e4eaf2;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:.62rem;color:#ef4444">Supprimer</button>` : ''}
          </div>
        </div>
        ${has(key) ? `<img src="${localStorage.getItem('kote_img_'+key)}" style="max-height:60px;max-width:100%;border-radius:4px;border:1px solid #e4eaf2;object-fit:contain">` : ''}
      </div>`;

    return `<div class="adm-page-hdr">
      <div><div class="adm-page-title">Images du document</div>
      <div class="adm-page-sub">Ces images apparaissent dans l'aperçu et le PDF généré. Elles sont stockées localement dans votre navigateur.</div></div>
    </div>
    <div class="adm-grid adm-grid-1">
      ${_card('En-tête (Letterhead)', '<rect x="3" y="3" width="18" height="5" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/>',
        imgCard('lh', 'Fond de page / En-tête', 'Format PNG recommandé — taille A4 (2480 × 3508 px)')
      )}
      ${_card('Cachet', '<circle cx="12" cy="8" r="4"/><path d="M6 20h12"/><path d="M8 16c0-2.21 1.79-4 4-4s4 1.79 4 4v1H8v-1z"/>',
        imgCard('stamp', 'Image du cachet', 'PNG avec fond transparent recommandé — environ 400 × 260 px')
      )}
      ${_card('Signature', '<path d="M3 18c3-6 5-9 7-9s2 3 4 3 4-4.5 7-10.5"/><path d="M3 21h18"/>',
        imgCard('sig', 'Image de la signature', 'PNG avec fond transparent recommandé — environ 400 × 200 px')
      )}
    </div>
    <div class="adm-grid adm-grid-1" style="margin-top:.75rem">
      ${_card('Logo SVG', '<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-5"/>',
        (() => {
          const val = (DB.shop||{}).logo_svg || '';
          const badge = `<span style="font-size:.6rem;background:${val?'#dcfce7':'#fef3c7'};color:${val?'#166534':'#92400e'};padding:2px 7px;border-radius:20px;font-weight:700">${val?'✓ Défini':'Non défini'}</span>`;
          const previewContent = val
            ? val
            : '<span style="font-size:.6rem;color:var(--t3)">—</span>';
          const deleteBtn = val
            ? `<button onclick="ADMIN.set('shop.logo_svg','');ADMIN._renderTab('images')"
                style="width:100%;background:none;border:1px solid var(--rd);color:var(--rd);border-radius:var(--r);padding:.28rem .5rem;font-size:.62rem;cursor:pointer">
                Supprimer
               </button>`
            : '';
          return `<div class="adm-row" style="flex-direction:column;align-items:flex-start;gap:.5rem;padding-bottom:.65rem">
            <div class="cat-flex-wrap">
              <div class="adm-row-label" style="margin:0">Code SVG du logo</div>
              ${badge}
            </div>
            <div class="adm-row-sub" style="margin:0">Collez le code SVG complet — utilisé dans la barre de navigation et les PDF</div>
            <div style="display:flex;gap:.75rem;width:100%;align-items:flex-start">
              <textarea id="logoSvgInput" rows="5"
                style="flex:1;min-width:0;border:1.5px solid var(--bd);border-radius:var(--r);padding:.35rem .55rem;font-size:.68rem;font-family:monospace;color:var(--t1);background:var(--sf);resize:vertical;line-height:1.45"
                placeholder="<svg xmlns=&quot;http://www.w3.org/2000/svg&quot;…>…</svg>"
                oninput="ADMIN._logoPreview(this.value)"
                onfocus="this.style.borderColor='var(--bl)'" onblur="this.style.borderColor='var(--bd)'"
              >${val.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
              <div style="display:flex;flex-direction:column;align-items:center;gap:.4rem;min-width:110px">
                <div style="font-size:.6rem;color:var(--t3);text-transform:uppercase;letter-spacing:.5px">Aperçu</div>
                <div id="logoSvgPreview"
                  style="width:110px;height:60px;border:1.5px solid var(--bd);border-radius:var(--r);display:flex;align-items:center;justify-content:center;padding:.4rem;background:var(--s2);overflow:hidden">
                  ${previewContent}
                </div>
                <button onclick="ADMIN._logoApply(document.getElementById('logoSvgInput').value)"
                  style="width:100%;background:var(--bl);color:#fff;border:none;border-radius:var(--r);padding:.32rem .5rem;font-size:.65rem;font-weight:600;cursor:pointer">
                  ✓ Appliquer
                </button>
                ${deleteBtn}
              </div>
            </div>
          </div>`;
        })()
      )}
    </div>`;
  }

  function uploadImg(key, input) {
    const file=input.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=e=>{
      const dataURL=e.target.result;
      localStorage.setItem(`kote_img_${key}`,dataURL);
      if(window.INVOICE?.setImage) INVOICE.setImage(key,dataURL);
      _renderTab('images');
    };
    reader.readAsDataURL(file);
  }

  function clearImg(key) {
    localStorage.removeItem(`kote_img_${key}`);
    if(window.INVOICE?.setImage) INVOICE.setImage(key,'');
    _renderTab('images');
  }

  /* ════════════════════════════════════════════════════════
     EXPORT & BACKUP + DB CLEANER
     ════════════════════════════════════════════════════════ */

  /* ── State ── */
  let _exportKey = '';
  let _expCounts = {};          // { table_name: count | '…' | 'err' }
  let _wipeArmed = null;        // { btnId, table, filter } — two-step confirm

  /* ── Table registry — single source of truth ── */
  const _EXP_TABLES = [
    { id:'kote_config',  label:'Configuration', desc:'Produits, tarifs, paramètres', noWipe:true,  noCount:true },
    { id:'kote_quotes',  label:'Devis',         desc:'Devis générés'                                            },
    { id:'kote_orders',  label:'Commandes',     desc:'Commandes reçues'                                         },
    { id:'kote_briefs',  label:'Briefs',        desc:'Briefs de conception graphique'                           },
    { id:'kote_clients', label:'Clients',       desc:'Répertoire clients'                                       },
  ];

  /* ── Supabase REST helpers ── */
  function _expHeaders() {
    const k = _exportKey.length > 20 ? _exportKey : SUPABASE_ANON_KEY;
    return { 'apikey': k, 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' };
  }

  async function _countRows(table) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, {
        method: 'GET',
        headers: { ..._expHeaders(), 'Prefer': 'count=exact' },
      });
      const cr = res.headers.get('content-range');    // e.g. "*/83"
      const n  = cr ? parseInt(cr.split('/')[1]) : null;
      return isNaN(n) ? '?' : n;
    } catch { return 'err'; }
  }

  /* ── Load counts async and patch DOM ── */
  async function _loadExportCounts() {
    for (const t of _EXP_TABLES) {
      if (t.noCount) { _expCounts[t.id] = 1; continue; }
      const el = $('expc-' + t.id);
      if (el) el.textContent = '…';
      const n = await _countRows(t.id);
      _expCounts[t.id] = n;
      if (el) el.textContent = typeof n === 'number' ? n + ' lignes' : n;
    }
    _refreshWipeButtons();
  }

  /* ── Refresh wipe button labels with live counts ── */
  function _refreshWipeButtons() {
    const hasKey = _exportKey.length > 20;
    document.querySelectorAll('.exp-wipe-btn').forEach(btn => {
      btn.disabled = !hasKey;
      btn.title    = hasKey ? '' : 'Clé secrète requise';
    });
  }

  /* ── Build _bExport UI ── */
  function _bExport() {
    const date = new Date().toISOString().slice(0,10);
    const dl   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/></svg>`;
    const hasKey = _exportKey.length > 20;

    /* Wipe buttons — disabled if no key */
    const wipeBtn = (id, label, table, filter) => `
      <button id="${id}" class="exp-wipe-btn"
        onclick="ADMIN.wipeArm('${id}','${table}','${filter}')"
        ${hasKey ? '' : 'disabled title="Clé secrète requise"'}
        style="padding:4px 9px;border-radius:5px;font-family:inherit;font-size:.62rem;
        font-weight:700;cursor:pointer;border:1.5px solid var(--bd);background:var(--s2);
        color:var(--t2);transition:all .15s;white-space:nowrap">
        ${label}
      </button>`;

    /* Order status options for select */
    const statusOpts = ['nouveau','en_cours','livre','annule']
      .map(s => `<option value="${s}">${{nouveau:'Nouveau',en_cours:'En cours',livre:'Livré',annule:'Annulé'}[s]}</option>`)
      .join('');

    return `
    <div class="adm-page-hdr" style="margin-bottom:.6rem">
      <div class="adm-page-title">Export &amp; Backup</div>
    </div>

    <div style="display:flex;flex-direction:column;gap:1.1rem;max-width:520px">

      <!-- ── Key ── -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
          <label style="font-size:.65rem;font-weight:700;color:var(--t2);
            text-transform:uppercase;letter-spacing:.6px">
            Service Role Key
            <span id="expKeyStatus" style="margin-left:5px;font-size:.58rem;
              font-weight:700;text-transform:none;letter-spacing:0"></span>
          </label>
          <button onclick="ADMIN.toggleExportHelp()" id="expHelpBtn"
            style="background:none;border:none;padding:0;font-size:.62rem;font-weight:600;
            color:var(--t3);cursor:pointer;display:flex;align-items:center;gap:3px;
            transition:color .15s;text-decoration:underline;text-underline-offset:2px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:10px;height:10px">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Comment obtenir la clé ?
          </button>
        </div>

        <!-- Help panel — hidden until needed -->
        <div id="expHelpPanel" style="display:none;margin-bottom:8px;padding:10px 12px 11px;
          background:#fffbeb;border:1px solid #fde68a;border-radius:7px">
          <div style="font-size:.65rem;color:#92400e;font-weight:700;margin-bottom:5px">
            📋 Guide rapide — Service Role Key
          </div>
          <ol style="font-size:.63rem;color:#78350f;line-height:1.75;padding-left:1.1rem;margin:0 0 7px">
            <li>Ouvrez votre projet sur <strong>supabase.com</strong></li>
            <li>Allez dans <strong>Project Settings → API</strong></li>
            <li>Cliquez l'onglet <strong>"Legacy anon, service_role API keys"</strong></li>
            <li>Copiez la clé <strong>service_role</strong> (commence par <code>eyJ…</code>)</li>
          </ol>
          <div style="font-size:.61rem;color:#b45309;background:#fef3c7;border:1px solid #fde68a;
            border-radius:5px;padding:5px 8px;display:flex;gap:5px;align-items:flex-start">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:10px;height:10px;flex-shrink:0;margin-top:1px;color:#d97706">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>Clé secrète — utilisée <strong>en mémoire uniquement</strong>, jamais stockée.</span>
          </div>
        </div>

        <div style="display:flex;gap:5px">
          <input type="password" id="expKeyInp"
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…"
            value="${_exportKey}"
            oninput="ADMIN.setExportKey(this.value)"
            style="flex:1;padding:7px 9px;border:1.5px solid var(--bd);border-radius:var(--r);
            font-family:monospace;font-size:.63rem;color:var(--t1);background:var(--s2);
            transition:border-color .15s;min-width:0">
          ${_exportKey ? `<button onclick="ADMIN.clearExportKey()" title="Effacer"
            style="background:none;border:1.5px solid var(--bd);border-radius:var(--r);
            padding:0 9px;cursor:pointer;font-size:.68rem;color:var(--t3)">✕</button>` : ''}
        </div>
      </div>

      <!-- ── Tables list ── -->
      <div>
        <div style="font-size:.58rem;font-weight:700;color:var(--t3);text-transform:uppercase;
          letter-spacing:.8px;margin-bottom:6px">Tables</div>
        <div style="border:1.5px solid var(--bd);border-radius:var(--r);overflow:hidden">
          ${_EXP_TABLES.map((t, i) => `
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;
              ${i < _EXP_TABLES.length-1 ? 'border-bottom:1px solid var(--bd);' : ''}
              background:var(--sf)">
              <div class="adm-mat-flex1">
                <div style="font-size:.68rem;font-weight:700;color:var(--t1)">${t.id}</div>
                <div class="micro-t3">${t.desc}</div>
              </div>
              <span id="expc-${t.id}" style="font-size:.62rem;color:var(--t3);
                font-variant-numeric:tabular-nums;min-width:50px;text-align:right">
                ${t.noCount ? '1 ligne' : (_expCounts[t.id] !== undefined ? _expCounts[t.id] + (typeof _expCounts[t.id]==='number'?' lignes':'') : '…')}
              </span>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;
                font-size:.65rem;color:var(--t2);font-weight:600;flex-shrink:0">
                <input type="checkbox" id="expInc-${t.id}" checked
                  style="width:13px;height:13px;accent-color:var(--bl);cursor:pointer">
              </label>
            </div>`).join('')}
        </div>
      </div>

      <!-- ── Export buttons ── -->
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button id="expSqlBtn" onclick="ADMIN.exportDB()"
          style="background:#0f172a;color:#fff;border:none;border-radius:var(--r);
          padding:8px 16px;font-family:inherit;font-size:.7rem;font-weight:700;
          cursor:pointer;display:flex;align-items:center;gap:5px">
          ${dl} SQL
        </button>
        <button id="expJsonBtn" onclick="ADMIN.runExport('json')"
          style="background:var(--bl);color:#fff;border:none;border-radius:var(--r);
          padding:8px 16px;font-family:inherit;font-size:.7rem;font-weight:700;
          cursor:pointer;display:flex;align-items:center;gap:5px">
          ${dl} JSON
        </button>
      </div>

      <!-- ── Divider ── -->
      <div style="height:1px;background:var(--bd);margin:.1rem 0"></div>

      <!-- ── DB Cleaner ── -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:.58rem;font-weight:700;color:var(--t3);
            text-transform:uppercase;letter-spacing:.8px">Nettoyage</div>
          ${!hasKey ? `<span style="font-size:.6rem;color:var(--am);font-weight:600">
            ⚠ Clé secrète requise pour les suppressions</span>` : ''}
        </div>

        <div style="display:flex;flex-direction:column;gap:6px">

          <!-- kote_quotes -->
          <div class="adm-wipe-row">
            <span class="adm-wipe-lbl">kote_quotes</span>
            ${wipeBtn('wp-qt-old', '&gt; 30 jours', 'kote_quotes', 'old30')}
            ${wipeBtn('wp-qt-all', 'Tout supprimer', 'kote_quotes', 'all')}
          </div>

          <!-- kote_orders by status + all -->
          <div class="adm-wipe-row">
            <span class="adm-wipe-lbl">kote_orders</span>
            <div style="display:flex;align-items:center;gap:5px">
              <select id="wipeOrderStatus"
                style="padding:4px 6px;border:1.5px solid var(--bd);border-radius:5px;
                font-family:inherit;font-size:.62rem;color:var(--t2);background:var(--s2)">
                ${statusOpts}
              </select>
              ${wipeBtn('wp-ord-st', 'Supprimer', 'kote_orders', 'status')}
            </div>
            ${wipeBtn('wp-ord-all', 'Tout supprimer', 'kote_orders', 'all')}
          </div>

          <!-- kote_briefs -->
          <div class="adm-wipe-row">
            <span class="adm-wipe-lbl">kote_briefs</span>
            ${wipeBtn('wp-brf-old', '&gt; 30 jours', 'kote_briefs', 'old30')}
            ${wipeBtn('wp-brf-all', 'Tout supprimer', 'kote_briefs', 'all')}
          </div>

          <!-- kote_clients -->
          <div class="adm-wipe-row">
            <span class="adm-wipe-lbl">kote_clients</span>
            ${wipeBtn('wp-cli-all', 'Tout supprimer', 'kote_clients', 'all')}
          </div>

          <!-- Full reset -->
          <div style="display:flex;align-items:center;gap:8px;padding-top:4px;
            border-top:1px dashed var(--bd);margin-top:2px;flex-wrap:wrap">
            <span class="adm-wipe-lbl">Réinitialiser</span>
            ${wipeBtn('wp-all', 'Tout effacer (quotes + orders + clients)', 'all', 'all')}
          </div>

        </div>
      </div>

      <!-- ── Status ── -->
      <div id="expStatus" style="display:none;padding:6px 10px;border-radius:6px;
        font-size:.65rem;font-weight:600;border:1px solid"></div>

    </div>`;
  }

  /* ── Called after render to load counts ── */
  function _initExportTab() {
    // Small delay to let DOM settle
    setTimeout(() => _loadExportCounts(), 80);
  }

  /* ── Wipe helpers ── */

  /* Reset a wipe button back to its neutral appearance */
  function _wipeResetBtn(btn) {
    if (!btn) return;
    btn.style.background  = 'var(--s2)';
    btn.style.color       = 'var(--t2)';
    btn.style.borderColor = 'var(--bd)';
    if (btn.dataset.origLabel) btn.textContent = btn.dataset.origLabel;
  }

  /* ── Wipe: arm → confirm two-step ── */
  function wipeArm(btnId, table, filter) {
    const btn = $(btnId);
    if (!btn) return;

    /* Already armed — execute */
    if (_wipeArmed && _wipeArmed.btnId === btnId) {
      wipeExecute(table, filter);
      return;
    }

    /* Disarm any previously armed button */
    if (_wipeArmed) {
      _wipeResetBtn($(_wipeArmed.btnId));
    }

    /* Count rows that will be affected */
    let affectedLabel = '?';
    if (filter === 'all') {
      const n = _expCounts[table];
      affectedLabel = typeof n === 'number' ? n + ' lignes' : 'toutes les lignes';
    } else if (filter === 'old30') {
      affectedLabel = '> 30 jours';
    } else if (filter === 'status') {
      const sel = $('wipeOrderStatus');
      affectedLabel = sel ? 'statut «' + sel.value + '»' : 'par statut';
    }

    /* Arm this button */
    btn.dataset.origLabel = btn.textContent;
    _wipeArmed = { btnId, table, filter };
    btn.textContent = '⚠ Confirmer ? (' + affectedLabel + ')';
    btn.style.background = '#fef2f2';
    btn.style.color = '#dc2626';
    btn.style.borderColor = '#fecaca';

    /* Auto-disarm after 5s if not confirmed */
    clearTimeout(btn._disarmTimer);
    btn._disarmTimer = setTimeout(() => {
      if (_wipeArmed?.btnId === btnId) {
        _wipeResetBtn(btn);
        _wipeArmed = null;
      }
    }, 5000);
  }

  /* ── Wipe: execute DELETE ── */
  async function wipeExecute(table, filter) {
    _wipeArmed = null;
    const status = $('expStatus');

    /* Build DELETE URLs — PostgREST requires a filter */
    const cutoff30 = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const tables = table === 'all'
      ? ['kote_quotes','kote_orders','kote_briefs','kote_clients']
      : [table];

    /* Button loading state */
    const armBtn = $(tables.map(t => `wp-${t.split('_')[1][0]}`)[0]);

    if (status) { status.style.display = 'none'; }

    let totalDeleted = 0;

    try {
      for (const tbl of tables) {
        let url;
        if (filter === 'old30' && (tbl === 'kote_quotes' || tbl === 'kote_briefs')) {
          url = `${SUPABASE_URL}/rest/v1/${tbl}?created_at=lt.${encodeURIComponent(cutoff30)}`;
        } else if (filter === 'status' && tbl === 'kote_orders') {
          const sel = $('wipeOrderStatus');
          const st  = sel ? sel.value : 'nouveau';
          url = `${SUPABASE_URL}/rest/v1/${tbl}?status=eq.${encodeURIComponent(st)}`;
        } else {
          /* Delete all — filter on created_at >= epoch to satisfy PostgREST */
          url = `${SUPABASE_URL}/rest/v1/${tbl}?created_at=gte.1970-01-01`;
        }

        const res = await fetch(url, {
          method: 'DELETE',
          headers: { ..._expHeaders(), 'Prefer': 'return=minimal,count=exact' },
        });

        if (!res.ok) {
          const body = await res.text().catch(()=>'');
          throw new Error(`${tbl}: HTTP ${res.status} — ${body}`);
        }

        /* Parse deleted count from Content-Range */
        const cr = res.headers.get('content-range');
        const n  = cr ? parseInt(cr.split('/')[1]) : 0;
        if (!isNaN(n)) totalDeleted += n;
      }

      /* Success */
      if (status) {
        status.style.display = 'flex';
        status.style.background = 'var(--gn-lt)';
        status.style.color = 'var(--gn)';
        status.style.borderColor = '#a7f3d0';
        status.innerHTML = `✓ Supprimé — ${totalDeleted} ligne${totalDeleted>1?'s':''} effacée${totalDeleted>1?'s':''}`;
        setTimeout(() => { if (status) status.style.display = 'none'; }, 5000);
      }

      /* Refresh counts */
      await _loadExportCounts();

    } catch(e) {
      console.error('[WIPE]', e);
      if (status) {
        status.style.display = 'flex';
        status.style.background = '#fef2f2';
        status.style.color = '#dc2626';
        status.style.borderColor = '#fecaca';
        status.innerHTML = `✗ Erreur : ${e.message}`;
      }
    }

    /* Reset all wipe buttons */
    document.querySelectorAll('.exp-wipe-btn').forEach(b => _wipeResetBtn(b));
  }

  /* ── Export key helpers ── */
  function toggleExportHelp() {
    const p = $('expHelpPanel');
    const b = $('expHelpBtn');
    if (!p) return;
    const open = p.style.display === 'none';
    p.style.display = open ? 'block' : 'none';
    if (b) b.style.color = open ? 'var(--am)' : 'var(--t3)';
  }

  function setExportKey(val) {
    _exportKey = val.trim();
    const st = $('expKeyStatus');
    if (st) {
      st.textContent = _exportKey.length > 20 ? '✓ Clé saisie' : '';
      st.style.color = 'var(--gn)';
    }
    _refreshWipeButtons();
  }

  function clearExportKey() {
    _exportKey = '';
    const inp = $('expKeyInp');
    if (inp) inp.value = '';
    const st = $('expKeyStatus');
    if (st) st.textContent = '';
    _refreshWipeButtons();
    selectTab('export'); // re-render to show/hide clear button
  }

  /* ══════════════════════════════════════════════════════
     DYNAMIC EXPORT — discovers tables/columns at runtime
     ══════════════════════════════════════════════════════ */

  /* Map OpenAPI property definition → PostgreSQL type */
  function _pgTypeFromProp(prop) {
    const fmt  = (prop.format || '').toLowerCase();
    const type = (prop.type   || 'string').toLowerCase();
    if (fmt === 'uuid')                                  return 'uuid';
    if (fmt === 'jsonb' || fmt === 'json')               return 'jsonb';
    if (fmt.includes('timestamp'))                       return 'timestamptz';
    if (fmt === 'numeric' || fmt === 'double precision') return 'numeric';
    if (fmt === 'int4'  || fmt === 'integer')            return 'int4';
    if (fmt === 'int8'  || fmt === 'bigint')             return 'int8';
    if (fmt === 'bool'  || type === 'boolean')           return 'boolean';
    return 'text';
  }

  /* Sensible DEFAULT per column name + type */
  function _colDefault(colName, pgType) {
    if (colName === 'id' && pgType === 'uuid') return ' default gen_random_uuid()';
    if (colName === 'id' && pgType === 'int4') return ' default 1';
    if (colName === 'created_at' || colName === 'updated_at') return ' default now()';
    if (colName === 'status')        return " default \'nouveau\'";
    if (colName === 'source')        return " default \'client\'";
    if (colName === 'montant_verse') return ' default 0';
    return '';
  }

  /* Quote a column identifier — protects reserved words (offset, order, user, etc.) */
  function _qCol(name) { return `"${name}"`; }

  /* Build CREATE TABLE from OpenAPI property map */
  function _buildCreateTable(tableName, props, requiredCols) {
    const cols = Object.entries(props).map(([name, prop]) => {
      const pgType  = _pgTypeFromProp(prop);
      const notNull = requiredCols?.includes(name) && name !== 'id' ? ' not null' : '';
      const def     = _colDefault(name, pgType);
      const pk      = name === 'id' ? ' primary key' : '';
      return `  ${_qCol(name).padEnd(24)} ${pgType}${pk}${def}${notNull}`;
    });
    return `create table if not exists ${tableName} (\n${cols.join(',\n')}\n);`;
  }

  /* Smart value escaper */
  function _escVal(val, isJsonb) {
    if (val === null || val === undefined) return 'NULL';
    if (isJsonb || typeof val === 'object') return `\'${JSON.stringify(val).replace(/\'/g, "\'\'")}\'::jsonb`;
    if (typeof val === 'number')  return String(val);
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    return `\'${String(val).replace(/\'/g, "\'\'")}\'`;
  }

  /* ── Schema inference from real row data (no PostgREST version dependency) ── */
  function _inferProp(val) {
    if (val === null || val === undefined)  return { type: 'string',  format: 'text' };
    if (typeof val === 'boolean')           return { type: 'boolean', format: 'bool' };
    if (typeof val === 'object')            return { type: 'object',  format: 'jsonb' };
    if (typeof val === 'number')
      return Number.isInteger(val) ? { type: 'integer', format: 'int4' } : { type: 'number', format: 'numeric' };
    if (typeof val === 'string') {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val))
        return { type: 'string', format: 'uuid' };
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(val))
        return { type: 'string', format: 'timestamp with time zone' };
    }
    return { type: 'string', format: 'text' };
  }

  function _inferSchema(rows) {
    const properties = {};
    if (!rows?.length) return { properties, required: [] };
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    cols.forEach(col => {
      const sample = rows.find(r => r[col] !== null && r[col] !== undefined)?.[col] ?? null;
      properties[col] = _inferProp(sample);
    });
    return { properties, required: [] };
  }

    /* ── Main export entry point (fully dynamic) ── */
  async function runExport(format) {
    const btnId    = format === 'sql' ? 'expSqlBtn' : 'expJsonBtn';
    const btn      = $(btnId);
    const status   = $('expStatus');
    const date     = new Date().toISOString().slice(0, 10);
    const origHTML = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ …'; }
    if (status) status.style.display = 'none';

    try {
      const headers  = _expHeaders();

      // 1. Table list from registry — no OpenAPI dependency
      const allTables = _EXP_TABLES.map(t => t.id);

      // 2. Fetch ALL rows — try created_at.desc order, fallback to plain select
      const tableData = {};
      await Promise.all(allTables.map(async table => {
        try {
          let r = await fetch(
            `${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.desc&limit=100000`,
            { headers }
          );
          if (!r.ok) r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=100000`, { headers });
          tableData[table] = r.ok ? await r.json() : [];
        } catch { tableData[table] = []; }
      }));

      // 3. Infer schema from actual data — works regardless of PostgREST version
      const tableSchemas = {};
      allTables.forEach(t => { tableSchemas[t] = _inferSchema(tableData[t]); });

      if (format === 'json') {
        _downloadJSON({ allTables, tableData, tableSchemas, date });
      } else {
        _downloadSQL({ allTables, tableData, tableSchemas, date });
      }

      const nRows = allTables.reduce((s, t) => s + (tableData[t]?.length || 0), 0);
      if (status) {
        status.style.display    = 'flex';
        status.style.background = 'var(--gn-lt)';
        status.style.color      = 'var(--gn)';
        status.style.borderColor = '#a7f3d0';
        status.innerHTML = `✓ Export réussi — ${allTables.length} tables, ${nRows} lignes (${date})`;
        setTimeout(() => { if (status) status.style.display = 'none'; }, 5000);
      }
    } catch(e) {
      console.error('[EXPORT]', e);
      if (status) {
        status.style.display    = 'flex';
        status.style.background = '#fef2f2';
        status.style.color      = '#dc2626';
        status.style.borderColor = '#fecaca';
        status.innerHTML = `✗ Erreur : ${e.message}`;
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origHTML; }
    }
  }

  /* ── JSON download (dynamic) ── */
  function _downloadJSON({ allTables, tableData, date }) {
    const out = { _meta: { exported_at: new Date().toISOString(), tables: allTables } };
    allTables.forEach(t => { out[t] = tableData[t] || []; });
    _triggerDownload(JSON.stringify(out, null, 2), `kote-backup-${date}.json`, 'application/json');
  }

  /* ── SQL download (fully dynamic) ── */
  function _downloadSQL({ allTables, tableData, tableSchemas, date }) {
    const ts = new Date().toISOString();

    // Identify jsonb columns per table from schema
    const jsonbCols = {};
    allTables.forEach(table => {
      const props = tableSchemas[table]?.properties || {};
      jsonbCols[table] = new Set(
        Object.entries(props)
          .filter(([, p]) => ['jsonb','json'].includes((p.format||'').toLowerCase()))
          .map(([name]) => name)
      );
    });

    // Dynamic INSERT block for a table
    function tableInserts(table) {
      const rows  = tableData[table] || [];
      if (!rows.length) return `-- (no rows in ${table})\n`;
      const jCols = jsonbCols[table] || new Set();
      return rows.map(row => {
        const safeRow = { ...row };
        if ('user_id' in safeRow) safeRow.user_id = null; // cannot transfer auth.users
        const cols = Object.keys(safeRow);
        const vals = cols.map(c => _escVal(safeRow[c], jCols.has(c)));
        return `INSERT INTO ${table} (${cols.map(_qCol).join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT (id) DO NOTHING;`;
      }).join('\n') + '\n';
    }

    // Dynamic CREATE TABLE from OpenAPI schema
    function createTable(table) {
      const props    = tableSchemas[table]?.properties || {};
      const required = tableSchemas[table]?.required   || [];
      return _buildCreateTable(table, props, required);
    }

    // Standard indexes based on discovered columns
    function tableIndexes(table) {
      const props = Object.keys(tableSchemas[table]?.properties || {});
      const lines = [];
      if (props.includes('created_at')) lines.push(`create index if not exists ${table}_created_at_idx on ${table} (created_at desc);`);
      if (props.includes('ref'))        lines.push(`create index if not exists ${table}_ref_idx        on ${table} (ref);`);
      if (props.includes('nom'))        lines.push(`create index if not exists ${table}_nom_idx        on ${table} (nom);`);
      if (props.includes('status'))     lines.push(`create index if not exists ${table}_status_idx     on ${table} (status);`);
      if (props.includes('user_id'))    lines.push(`create index if not exists ${table}_user_id_idx    on ${table} (user_id);`);
      if (props.includes('email'))      lines.push(`create index if not exists ${table}_email_idx      on ${table} (email);`);
      return lines.join('\n');
    }

    // updated_at trigger for tables that have the column
    function tableTrigger(table) {
      const props = Object.keys(tableSchemas[table]?.properties || {});
      if (!props.includes('updated_at')) return '';
      return `drop trigger if exists ${table}_updated_at on ${table};\ncreate trigger ${table}_updated_at\n  before update on ${table}\n  for each row execute function _set_updated_at();`;
    }

    // Extra per-table constraints
    function tableExtras(table) {
      const props = Object.keys(tableSchemas[table]?.properties || {});
      const lines = [];
      if (table === 'kote_clients' && props.includes('email'))
        lines.push(`DO $$ BEGIN ALTER TABLE kote_clients ADD CONSTRAINT kote_clients_email_unique UNIQUE (email); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      if (table === 'kote_orders' && !props.includes('montant_verse'))
        lines.push(`ALTER TABLE kote_orders ADD COLUMN IF NOT EXISTS montant_verse numeric DEFAULT 0;`);
      return lines.join('\n');
    }

    // RLS policies — anon full access for all kote_* tables
    function tableRLS(table) {
      const props = Object.keys(tableSchemas[table]?.properties || {});
      if (table === 'kote_config') {
        return [
          `create policy "anon can read ${table}"   on ${table} for select to anon using (true);`,
          `create policy "anon can update ${table}" on ${table} for update to anon using (true);`,
        ].join('\n');
      }
      const lines = [
        `create policy "anon can insert ${table}" on ${table} for insert to anon with check (true);`,
        `create policy "anon can read ${table}"   on ${table} for select to anon using (true);`,
        `create policy "anon can update ${table}" on ${table} for update to anon using (true);`,
      ];
      if (table === 'kote_orders' && props.includes('user_id'))
        lines.push(`create policy "users see own orders" on ${table} for select to public using (auth.uid() = user_id);`);
      return lines.join('\n');
    }

    // kote_config ALTER guards (safe to run on pre-existing DBs)
    function configAlters() {
      const props = tableSchemas['kote_config']?.properties || {};
      return Object.entries(props)
        .filter(([name]) => name !== 'id')
        .map(([name, prop]) => {
          const pgType = _pgTypeFromProp(prop);
          return `ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS ${_qCol(name)} ${pgType};`;
        }).join('\n');
    }

    // kote_config upsert — ON CONFLICT UPDATE all columns
    function configUpsert() {
      const row   = tableData['kote_config']?.[0];
      if (!row) return '-- kote_config: no data';
      const jCols = jsonbCols['kote_config'] || new Set();
      const cols  = Object.keys(row);
      const vals  = cols.map(c => _escVal(row[c], jCols.has(c)));
      const upd   = cols.filter(c => c !== 'id').map(c => `${_qCol(c)}=EXCLUDED.${_qCol(c)}`).join(', ');
      return `INSERT INTO kote_config (${cols.map(_qCol).join(', ')}) VALUES (${vals.join(', ')})\nON CONFLICT (id) DO UPDATE SET ${upd};`;
    }

    // Build full SQL
    const tablesBlock = allTables.map(table => `
-- ══════════════════════════════════════════════════════════
-- TABLE: ${table}
-- ══════════════════════════════════════════════════════════
${createTable(table)}
${tableIndexes(table)}
${tableTrigger(table)}
${tableExtras(table)}`).join('\n');

    const rlsBlock = `-- ══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════
${allTables.map(t => `alter table ${t} enable row level security;`).join('\n')}

-- Drop all existing policies before recreating
do $$ declare r record;
begin
  for r in select policyname, tablename from pg_policies
    where tablename in (${allTables.map(t => `'${t}'`).join(', ')})
  loop
    execute format(\'drop policy if exists %I on %I\', r.policyname, r.tablename);
  end loop;
end $$;

${allTables.map(tableRLS).join('\n\n')}`;

    const dataBlock = allTables.map(table => `
-- ══════════════════════════════════════════════════════════
-- DATA: ${table} (${(tableData[table]||[]).length} rows)
-- ══════════════════════════════════════════════════════════
${table === 'kote_config' ? configUpsert() : tableInserts(table)}`).join('\n');

    const sql = `-- ══════════════════════════════════════════════════════════
-- KOTE DATABASE BACKUP
-- Generated : ${ts}
-- Source    : ${SUPABASE_URL}
-- Tables    : ${allTables.join(', ')}
--
-- USAGE: Run in Supabase SQL Editor on a fresh project.
--   1. Create a new Supabase project
--   2. Open SQL Editor → New query
--   3. Paste this entire file and click Run
-- ══════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Helper: auto-update updated_at ───────────────────────
create or replace function _set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

${tablesBlock}

-- ── Column guards (safe on fresh + pre-existing DB) ──────
${allTables.includes('kote_config') ? configAlters() : ''}

${rlsBlock}

${dataBlock}

${_EDGE_FUNCTIONS.map(fn => `-- ══════════════════════════════════════════════════════════
-- EDGE FUNCTION: ${fn.slug}
-- ${fn.desc}
-- Required secrets: ${fn.secrets?.join(', ') || 'none'}
-- Deploy via Admin → Edge Functions, or paste in Supabase editor
-- ══════════════════════════════════════════════════════════
/*
${fn.source}
*/`).join('\n\n')}

-- ══════════════════════════════════════════════════════════
-- END OF BACKUP — ${ts}
-- ══════════════════════════════════════════════════════════
`;

    _triggerDownload(sql, `kote-backup-${date}.sql`, 'text/plain');
  }

    /* ── Trigger browser download ── */
  function _triggerDownload(content, filename, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return { open, close, selectTab,
           toggleNav, closeNav, goToDash, goToProducts, togglePreview, _pvSet,
           _settingsSelectTab, toggleDbOverflow, closeDbOverflow, syncDbDot,
           openCatSheet, closeCatSheet, toggleCatSheet,
           set, setAuthMethod, setEmailMode, exportDB, saveSupaCreds, resetSupaCreds, downloadConfigJs, deleteProd, renameProd, _confirmRename, _cancelRename, saveProd, selectNewType, changeEngine, _renderTab, prodSearch,
           removePaper, addPaper, addEnvFormat2, addEnvFormatPreset, removeEnvFormat, addEnvType, removeEnvType, removeLam, addLam, removeAddon, addAddon,
           addBinding, removeBinding, addGfFinish, removeGfFinish, addGfMat, removeGfMat, addRuSupport, removeRuSupport, addPancarteMat, removePancarteMat,
           addGfMaterial, removeGfMaterial, addSupport, removeSupport,
           addPlanche, addSqmMat, removeSqmMat, _activeTab,
           addCityRow, removeCityRow, dcSetFee, dcSearch, addTaRow, removeTaRow, addTaPreset,
           addQtyDiscount, removeQtyDiscount, toggleRemise, setRemiseMode,
           setDesignTier, setDesignSectionTier, setDesignEmail,
           removeConcType, addConcType, removePanMat, addPanMat, addSqmMat, removeSqmMat, addPlanche, _activeTab, addGadget, deleteGadget,
           sbAdd, sbRemove, sbMove, sbToggle, sbTogglePaper, sbSetCfg, sbGetCfg, sbSetDefault,
           sbAddSize, sbRemoveSize, sbSizeLabel, sbSizeDim,
           sbSacPreset, sbSacAddPreset, sbSacRemovePreset,
           sbBoitePreset, sbBoiteAddPreset, sbBoiteRemovePreset,
           sbDragStart, sbDragEnd, sbDragOver, sbDragLeave, sbDrop,
           secDragStart, secDragEnd, secDragOver, secDragLeave, secDrop,
           sbAddQty, sbRemoveQty, sbQtyVal,
           sbLDragStart, sbLDragEnd, sbLDragOver, sbLDragLeave, sbLDrop,
           openProd, closeProd,
           startNewProd, cancelNewProd, confirmNewProd,
           sgrpAdd, sgrpRemove, sgrpRename, sgrpToggle, sgrpAddProd, sgrpRemoveProd, sgrpAssign,
           sgrpDragStart, sgrpDragEnd, sgrpDragOver, sgrpDragLeave, sgrpDrop,
           spDragStart, spDragEnd, spDragOver, spDragLeave, spDrop,
           uploadImg, clearImg, _syncLogo, _logoPreview, _logoApply,
           toggleExportHelp, setExportKey, clearExportKey, runExport,
           wipeArm, wipeExecute, tgTest, deployEdgeFunction, deployFn, deployAllFn,
           addOffsetProfile, removeOffsetProfile, addNumProfile, removeNumProfile };
})();

/* ════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════ */
DB_MOD.tryRestore();
APP.whenReady(() => { ADMIN._syncLogo(); });

/* ── PWA: Service Worker registration ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          // New version available — show a subtle update nudge
          const bar = document.createElement('div');
          bar.className = 'update-bar';
          bar.innerHTML = `Nouvelle version disponible — <button onclick="location.reload()">Actualiser</button>`;
          document.body.appendChild(bar);
          nw.postMessage('SKIP_WAITING');
        }
      });
    });
  }).catch(e => console.warn('[SW] Registration failed:', e));
}

/* ── Offline / online indicator ── */
function _setOffline(isOffline) {
  const bar = $('offlineBar');
  if (bar) bar.style.display = isOffline ? 'flex' : 'none';
}
window.addEventListener('offline', () => _setOffline(true));
window.addEventListener('online',  () => _setOffline(false));
_setOffline(!navigator.onLine);
