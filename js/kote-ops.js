'use strict';

/* ════════════════════════════════════════════════════════
   kote-ops.js — Operations & document rendering layer
   File-level helpers: _cFields, _buildItemSnap.
   Modules: DASHBOARD (order/client/brief management).
   Pages: admin.html, client.html
   Requires: config.js, kote-core.js, kote-catalog.js,
             kote-orders.js
   ════════════════════════════════════════════════════════ */

const _cFields = d => [
  d.fields, d.address_block, d.headline, d.subheadline, d.cta,
  d.panel_content, d.page_structure, d.carnet_fields, d.bag_content,
  d.content_generic, d.label_content, d.gadget_content,
].filter(Boolean);

/* Build item spec parts array from a snap object + DB reference.
   Returns string[] — join with ' · ' for display or '\n  ' for text. */
function _buildItemSnap(s, _DB) {
  const parts = [];
  _DB = _DB || (typeof DB !== 'undefined' ? DB : {});
  if (s.sizeObj?.label || (s.sizeObj?.w && s.sizeObj?.h)) {
    let dims = '';
    if (s.sizeObj.w && s.sizeObj.h) {
      const souffletVal = (s.sacSoufflet > 0 ? s.sacSoufflet : null)
                       || (s.sizeObj?.soufflet > 0 ? s.sizeObj.soufflet : null)
                       || 0;
      const soufflet = souffletVal > 0 ? `×${souffletVal}` : '';
      dims = ` (${s.sizeObj.w}×${s.sizeObj.h}${soufflet} mm)`;
    }
    parts.push((s.sizeObj.label || 'Sur mesure') + dims);
  }
  if (s.gfW && s.gfH) {
    const area = (parseFloat(s.gfW)/100 * parseFloat(s.gfH)/100).toFixed(3);
    parts.push(`${s.gfW}×${s.gfH} cm (${area} m²)`);
  }
  const pObj = (_DB.paper_stocks||[]).find(p=>p.id===s.paper);
  if (pObj) parts.push(pObj.label);
  const pCovObj = (_DB.paper_stocks||[]).find(p=>p.id===s.paperCover);
  if (pCovObj) parts.push('Couv. '+pCovObj.label);
  if (s.sides==='double') parts.push('Recto-Verso');
  else if (s.sides==='single') parts.push('Recto');
  if (s.pages) {
    const interior = Math.max(0, s.pages - 4);
    parts.push(`${s.pages}p. (${interior}p. int. + 4p. couv.)`);
  }
  const lObj = (s.lam && s.lam!=='none') ? (_DB.finishes||[]).find(f=>f.id===s.lam) : null;
  if (lObj) parts.push(lObj.label+(lObj.per_side && s.sides==='double' ? ' 2f.' : ''));
  const lCovObj = (s.lamCover && s.lamCover!=='none') ? (_DB.finishes||[]).find(f=>f.id===s.lamCover) : null;
  if (lCovObj) parts.push('Pelliculage couv. '+lCovObj.label);
  const lIntObj = (s.lamInterior && s.lamInterior!=='none') ? (_DB.finishes||[]).find(f=>f.id===s.lamInterior) : null;
  if (lIntObj) parts.push('Pelliculage int. '+lIntObj.label);
  const bObj = (s.binding && s.binding!=='none') ? (_DB.binding_options||[]).find(b=>b.id===s.binding) : null;
  if (bObj) parts.push(bObj.label);
  if (s.fold) parts.push('Pliage '+s.fold);
  if (s.envFormatId || s.envTypeId) {
    const ef = (_DB.envelope_formats||[]).find(f=>f.id===s.envFormatId);
    const et = (_DB.envelope_types||[]).find(t=>t.id===s.envTypeId);
    if (ef) parts.push(ef.name+(ef.w&&ef.h ? ` ${ef.w}×${ef.h}mm` : ''));
    if (et) parts.push(et.name);
    parts.push(s.envFenetre ? 'Avec fenêtre' : 'Sans fenêtre');
    if (s.envColors) parts.push(`${s.envColors} coul. offset`);
  }
  if (s.carnetPages && s.carnetSouches) {
    const SC = ['Blanc','Jaune','Rose','Vert','Bleu'], n = s.carnetSouches;
    parts.push(`${s.carnetPages} f. × ${n} souches (${SC.slice(0,n).join('+')})`);
    parts.push(`Offset ${s.carnetColors||4} coul.`);
    if (s.carnetNumero) parts.push(`Numéroté dès n°${s.carnetNumStart||1}`);
    if (s.carnetPerfo) parts.push('Perforé');
    if (s.carnetCover) parts.push('Couv. imprimée');
  }
  const gfMObj = (_DB.gf_materials||[]).find(m=>m.id===s.gfMaterial);
  if (gfMObj) parts.push(gfMObj.label+(gfMObj.laize ? ` (laize ${gfMObj.laize}m)` : ''));
  const gfFins = (s.gfFinishes||[]).map(fid=>{const f=(_DB.gf_finishes||[]).find(x=>x.id===fid);return f?f.label:null;}).filter(Boolean);
  if (gfFins.length) parts.push(gfFins.join(', '));
  if (s.withSupport) {
    const sup = (_DB.rollup_supports||[]).find(x=>x.id===s.support_id);
    if (sup) parts.push('Support '+sup.label);
  }
  if (s.chemiseColle) parts.push('Rabat collé');
  if (s.chemiseImprime) parts.push('Rabat imprimé');
  if (s.sacSoufflet > 0 && !(s.sizeObj?.w && s.sizeObj?.h)) parts.push(`Soufflet ${s.sacSoufflet} mm`);
  (s.addons||[]).forEach(aid => {
    const f = (_DB.finishes_addon||[]).find(x=>x.id===aid);
    if (f) parts.push(f.label+((s.addonFaces||{})[aid]===2 ? ' 2f.' : ''));
  });
  const TIERS = {basic:'Basic',pro:'Pro',premium:'Premium'};
  if (s.designOption==='service' && s.designTier) parts.push('Conception '+(TIERS[s.designTier]||s.designTier));
  if (s.designOption==='file' && s.designFileName) parts.push('BAT: '+s.designFileName);
  // Remove standalone "Pellic." or "Pelliculage" — keep full entries like "Pelliculage mat 2f."
  return parts.filter(p => !/^(pellic\.|pelliculage)$/i.test(p.trim()));
}


/* ════════════════════════════════════════════════════════
   DASHBOARD  — provider home view
   Fetches kote_orders + kote_clients from Supabase.
   Renders into #vDash (tab: orders / clients).

   Public API:
     DASHBOARD.load()               — initial fetch + render
     DASHBOARD.switchTab(tab)       — 'orders' | 'clients'
     DASHBOARD.setStatus(id, val)   — patch order status in Supabase
     DASHBOARD.toggleOrder(id)      — expand/collapse order card
     DASHBOARD.openInvoice(id)      — open order in INVOICE preview
     DASHBOARD.refresh()            — re-fetch silently
   ════════════════════════════════════════════════════════ */
const DASHBOARD = (() => {

  let _orders      = [];
  let _clients     = [];
  let _quotes      = [];
  let _tab         = 'orders';
  let _loading     = false;
  let _briefs      = [];
  let _kpiPeriod   = 'today'; // 'today' | 'week' | 'month' | 'range'
  let _kpiFrom     = '';      // ISO date string for range start
  let _kpiTo       = '';      // ISO date string for range end
  let _searchQuery = '';
  let _errors      = {};      // { orders, clients, quotes, briefs } — per-tab error messages
  let _lastRefresh = null;    // timestamp of last successful _fetchAll

  /* ── Supabase GET helper ── */
  async function _get(path) {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000); // 12s timeout per request
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/${path}`, {
        headers: {
          'apikey':        window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  /* ── Supabase PATCH helper ── */
  async function _patch(table, id, body) {
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey':        window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  /* ── Status meta ── */
  const STATUS = {
    nouveau:       { label: 'Nouveau',        color: '#f59e0b', bg: '#fffbeb', bd: '#fde68a' },
    en_cours:      { label: 'En cours',       color: '#2563eb', bg: '#eff6ff', bd: '#bfdbfe' },
    conception:    { label: 'Conception',     color: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe' },
    en_impression: { label: 'Impression',     color: '#d946ef', bg: '#fdf4ff', bd: '#f0abfc' },
    finition:      { label: 'Finition',       color: '#f97316', bg: '#fff7ed', bd: '#fed7aa' },
    pret:          { label: 'Prêt à livrer',  color: '#16a34a', bg: '#f0fdf4', bd: '#bbf7d0' },
    livre:         { label: 'Livré',          color: '#0891b2', bg: '#ecfeff', bd: '#a5f3fc' },
    annule:        { label: 'Annulé',         color: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  };
  const _st = k => STATUS[k] || STATUS.nouveau;

  /* ── Relative time — "il y a 2 min", "il y a 1h", etc. ── */
  function _relTime(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 10)  return 'à l\'instant';
    if (s < 60)  return `il y a ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60)  return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `il y a ${h}h`;
    return _fmtDate(ts);
  }

  /* ── Shared label maps ── */
  const TIER_LABELS   = { basic: 'Basic', pro: 'Pro', premium: 'Premium' };
  const DEADLINE_MAP   = { urgent: 'Urgent', '1sem': 'Cette semaine', '2sem': '2 semaines', flexible: 'Flexible' };
  const DEADLINE_COLOR = { urgent: '#dc2626', '1sem': '#d97706', '2sem': '#059669', flexible: '#94a3b8' };

  /* ── Brief section/row builders (shared by _buildBriefSections + _briefCreaPDF) ── */
  const _bRow = (k, v) => (v != null && v !== '')
    ? `<div class="brf-row"><span class="brf-k">${k}</span><span class="brf-v">${v}</span></div>` : '';
  const _bSec = (title, accent, inner) => inner
    ? `<div class="brf-sec"><div class="brf-sec-hd" style="border-left-color:${accent};color:${accent}">${title}</div><div class="brf-sec-body">${inner}</div></div>`
    : '';

  /* ── Reusable mini-SVG helpers (10×10, color:var(--t3)) ── */
  const _sv = (p,sw=2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" style="width:10px;height:10px;color:var(--t3)">${p}</svg>`;
  const SV = {
    phone:  _sv('<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.1.86a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>'),
    mail:   _sv('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>'),
    pin:    _sv('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>'),
    home:   _sv('<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    orders: _sv('<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>'),
    ice:    _sv('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8"/>'),
    user:   _sv('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
  };

  /* ── Join array helper ── */
  const _jn = x => [].concat(x||[]).join(', ');

  /* ── Empty-state helper ── */
  const _emptyHTML = (iconPath, msg, sub='') =>
    `<div class="dash-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="width:32px;height:32px;opacity:.25">${iconPath}</svg><div>${msg}</div>${sub?`<div style="font-size:.65rem;color:var(--t3)">${sub}</div>`:''}</div>`;

  /* ── Shared fetch (used by load + refresh) ── */
  async function _fetchAll() {
    _errors = {}; // reset per-tab errors before each fetch
    const [ordRes, cliRes, qtRes, brfRes] = await Promise.allSettled([
      _get('kote_orders?select=*&order=created_at.desc&limit=100'),
      _get('kote_clients?select=*&order=nom.asc&limit=200'),
      _get('kote_quotes?select=*&order=created_at.desc&limit=100'),
      _get('kote_briefs?select=*&order=created_at.desc&limit=200'),
    ]);
    // Each table is independent — a failure only affects its own tab
    if (ordRes.status === 'fulfilled') { _orders  = ordRes.value  || []; }
    else { _errors.orders  = ordRes.reason?.message  || 'Erreur réseau'; console.warn('[DASHBOARD] orders fetch failed:', ordRes.reason); }
    if (cliRes.status === 'fulfilled') { _clients = cliRes.value  || []; }
    else { _errors.clients = cliRes.reason?.message  || 'Erreur réseau'; console.warn('[DASHBOARD] clients fetch failed:', cliRes.reason); }
    if (qtRes.status  === 'fulfilled') { _quotes  = qtRes.value   || []; }
    else { _errors.quotes  = qtRes.reason?.message   || 'Erreur réseau'; console.warn('[DASHBOARD] quotes fetch failed:', qtRes.reason); }
    if (brfRes.status === 'fulfilled') { _briefs  = brfRes.value  || []; }
    else { _errors.briefs  = brfRes.reason?.message  || 'Erreur réseau'; console.warn('[DASHBOARD] briefs fetch failed:', brfRes.reason); }
    // Only update timestamp if at least one table succeeded
    if (!ordRes.reason && !cliRes.reason && !qtRes.reason && !brfRes.reason) {
      _lastRefresh = Date.now();
    } else if (ordRes.status === 'fulfilled' || cliRes.status === 'fulfilled') {
      _lastRefresh = Date.now(); // partial success still counts
    }
  }

  /* ── Load both tables ── */
  async function load() {
    if (_loading) return;
    // Guard: only run after DB is confirmed ready
    if (typeof APP !== 'undefined' && !APP.isReady()) {
      APP.whenReady(() => load());
      return;
    }
    _loading = true;
    PERF.mark('dashboard_load_start');
    _renderSkeleton();
    if (typeof DB_MOD !== 'undefined' && DB_MOD.getSource() !== 'supabase') {
      _orders  = [];
      _clients = window._jsonClients || [];
      _quotes  = window._jsonQuotes  || [];
      _loading = false;
      _render();
      return;
    }
    try {
      await _fetchAll();
    } catch(e) {
      console.warn('[DASHBOARD] load failed:', e);
      _renderError(e.message);
      _loading = false;
      return;
    }
    _loading = false;
    PERF.mark('dashboard_load_done');
    _render();
  }

  /* ── Silent refresh ── */
  async function refresh() {
    if (typeof DB_MOD !== 'undefined' && DB_MOD.getSource() !== 'supabase') {
      _clients = window._jsonClients || [];
      _quotes  = window._jsonQuotes  || [];
      _render();
      return;
    }
    PERF.mark('dashboard_refresh_start');
    try { await _fetchAll(); _render(); }
    catch(e) { console.warn('[DASHBOARD] refresh failed:', e); }
    PERF.mark('dashboard_refresh_done');
  }

  /* ── Switch tab ── */
  function switchTab(tab) {
    _tab = tab;
    // Update tab buttons
    document.querySelectorAll('.dash-tab-btn').forEach(b => {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    _renderContent();
  }

  /* ── Toggle order expand ── */
  function toggleOrder(id) {
    const card = $('dord-' + id);
    if (card) card.classList.toggle('open');
  }

  /* ── Set status ── */
  async function setStatus(id, val) {
    // Optimistic UI: update pills immediately
    const card = $('dord-' + id);
    if (card) {
      card.querySelectorAll('.dash-st-pill').forEach(btn => {
        const isActive = btn.dataset.status === val;
        btn.classList.toggle('act', isActive);
        const v = STATUS[btn.dataset.status];
        if (v) {
          btn.style.background   = isActive ? v.bg  : '';
          btn.style.color        = isActive ? v.color : '';
          btn.style.borderColor  = isActive ? v.bd  : '';
        }
      });
      // Update header badge too
      const badge = card.querySelector('.dash-st-badge');
      if (badge) {
        const s = _st(val);
        badge.textContent = s.label;
        badge.style.background  = s.bg;
        badge.style.color       = s.color;
        badge.style.borderColor = s.bd;
      }
      // Update card left border
      card.style.borderLeftColor = _st(val).color;
    }
    try {
      await _patch('kote_orders', id, { status: val });
      const ord = _orders.find(o => o.id === id);
      if (ord) ord.status = val;
      _renderStats();
    } catch(e) {
      console.warn('[DASHBOARD] setStatus failed:', e);
      alert('Mise à jour échouée: ' + e.message);
      // Rollback on failure — re-render the card
      _renderContent();
    }
  }

  /* ── Open order in INVOICE preview ── */
  function openInvoice(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const p = JSON.parse(JSON.stringify(ord.payload || {}));

    /* ── Sync any linked brief prices into the payload items ── */
    const items = p.items || [];
    items.forEach(item => {
      const briefRef = item.snap?.brief_ref || null;
      if (!briefRef) return;
      const brief = _briefs.find(b => b.ref === briefRef);
      if (!brief || brief.price_ht == null) return;
      /* Update the item with the confirmed price */
      item.baseTotal = brief.price_ht;
      item.perUnit   = brief.price_ht;
      item.quantity  = item.quantity || 1;
    });
    /* Recalculate totals if any brief price was injected */
    const delAmt     = p.totals?.del   || 0;
    const surAmt     = p.totals?.surAmt|| 0;
    const itemsTotal = items.reduce((s, i) => s + (i.baseTotal || 0), 0);
    p.items  = items;
    p.totals = { ...p.totals, grand: itemsTotal + delAmt + surAmt };

    /* ── Attach client from order top-level if not already in payload ── */
    if (ord.client_nom && !p.client) {
      p.client = {
        nom:     ord.client_nom,
        tel:     ord.client_tel     || '',
        email:   ord.client_email   || '',
        adresse: ord.client_adresse || '',
        ville:   ord.client_ville   || '',
      };
    }
    if (typeof INVOICE !== 'undefined') {
      INVOICE.open(p, {
        dbId:    ord.id,
        docType: ord.status || 'devis',
        deposit: ord.montant_verse || 0,
      });
    }
  }

  /* ── WA notify for an order ── */
  function notifyWA(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const waPhone = (DB.contact?.whatsapp || '').replace(/\D/g, '');
    if (!waPhone) { alert('Numéro WhatsApp non configuré dans les réglages.'); return; }
    const p = ord.payload || {};
    const items = p.items || [];
    const trackingUrl = location.href.replace(/[^/]*$/, '') + 'tracking.html?ref=' + encodeURIComponent(ord.ref);
    const shopName = DB?.shop?.name || 'Kote Imprimerie';
    const lines = [
      `${shopName} — Confirmation de commande`,
      ``,
      `Ref : ${ord.ref}`,
      `Client : ${ord.client_nom || '—'}`,
      ord.client_tel ? `Tel : ${ord.client_tel}` : null,
      ``,
      `Produits`,
      `--------`,
      ...items.map(i => i.snap?.type === 'brief'
        ? `- Conception graphique${i.snap?.brief_ref ? ' ('+i.snap.brief_ref+')' : ''} — Prix en attente`
        : `- ${fmtN(i.quantity)} x ${i.prodName}${i.specs ? ' ('+i.specs+')' : ''}  ${fmt(i.baseTotal)} DH`),
      ``,
      `Total HT  : ${fmt(ord.total_ht)} DH`,
      ``,
      `Statut : ${STATUS[ord.status||'nouveau']?.label || 'Nouveau'}`,
      ``,
      `Suivre votre commande :`,
      trackingUrl,
    ].filter(l => l !== null).join('\n');
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(lines)}`, '_blank');
  }

  /* ── Mail notify for an order ── */
  function notifyEmail(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord || !ord.client_email) return;
    const p     = ord.payload || {};
    const items = p.items || [];
    const d     = ord.created_at
      ? _fmtDate(ord.created_at)
      : new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'});
    const trackingUrl = location.href.replace(/[^/]*$/, '') + 'tracking.html?ref=' + encodeURIComponent(ord.ref);

    const shopName  = DB?.shop?.name || 'Kote Imprimerie';
    const shopAddr  = DB?.shop?.address || DB?.contact?.adresse || '144, Bd de la Gironde — Casablanca';
    const shopTelN  = DB?.contact?.whatsapp || DB?.contact?.tel || '+212 6 44 50 20 90';
    const shopMail  = DB?.contact?.email || 'contact@kdigital.ma';
    const shopWeb   = DB?.shop?.website || DB?.contact?.website || 'www.kdigital.ma';

    const subject = `Commande ${ord.ref} — ${shopName}`;
    const body = [
      `Bonjour ${ord.client_nom || ''},`,
      ``,
      `Nous avons bien reçu votre commande du ${d}.`,
      ``,
      `RECAPITULATIF`,
      `=============`,
      `Reference : ${ord.ref}`,
      ``,
      ...items.map(i => i.snap?.type === 'brief'
        ? `  - Conception graphique${i.snap?.brief_ref ? ' ('+i.snap.brief_ref+')' : ''}\n    Montant : Prix en attente`
        : `  - ${fmtN(i.quantity)} x ${i.prodName}${i.specs ? ' ('+i.specs+')' : ''}`
          + `\n    Montant : ${fmt(i.baseTotal)} DH HT`),
      ``,
      `Total HT  : ${fmt(ord.total_ht)} DH`,
      ``,
      `Statut : ${STATUS[ord.status||'nouveau']?.label || 'Nouveau'}`,
      ``,
      `Suivez votre commande en temps réel :`,
      trackingUrl,
      ``,
      `Notre équipe vous contactera dès que votre commande sera prête.`,
      `Pour toute question, répondez à cet email ou appelez-nous.`,
      ``,
      `Cordialement,`,
      `L'équipe ${shopName}`,
      shopAddr,
      `Tel : ${shopTelN}`,
      `${shopMail}  |  ${shopWeb}`,
    ].join('\n');

    window.open(`mailto:${ord.client_email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
  }

  /* ── Render helpers ── */
  function _renderSkeleton() {
    const body = $('dashBody');
    if (!body) return;
    body.innerHTML = `
      <div class="dash-loading">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
          class="spin-loader">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        <span>Chargement du tableau de bord…</span>
      </div>`;
  }

  function _renderError(msg) {
    const body = $('dashBody');
    if (!body) return;
    body.innerHTML = `
      <div class="dash-loading text-rd">
        ${IC.alert}
        <span>Erreur de chargement — ${msg}</span>
        <button class="btn btn-outline" style="height:30px;font-size:.65rem;margin-top:.5rem"
          onclick="DASHBOARD.load()">Réessayer</button>
      </div>`;
  }

  function _render() {
    const wrap = $('dashWrap');
    if (!wrap) return;

    wrap.innerHTML = `
      <!-- KPI Panel -->
      <div class="dash-kpi" id="dashKpi"></div>

      <!-- Tabs + Search row -->
      <div class="dash-header-row">
        <div class="dash-tabs">
          <button class="dash-tab-btn${_tab==='orders'?' on':''}" data-tab="orders"
            onclick="DASHBOARD.switchTab('orders')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            Commandes <span class="dash-tab-count" id="dashOrdCount"></span>
          </button>
          <button class="dash-tab-btn${_tab==='clients'?' on':''}" data-tab="clients"
            onclick="DASHBOARD.switchTab('clients')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            Clients <span class="dash-tab-count" id="dashCliCount"></span>
          </button>
          <button class="dash-tab-btn${_tab==='quotes'?' on':''}" data-tab="quotes"
            onclick="DASHBOARD.switchTab('quotes')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Devis <span class="dash-tab-count" id="dashQtCount"></span>
          </button>
          <button class="dash-tab-btn${_tab==='briefs'?' on':''}" data-tab="briefs"
            onclick="DASHBOARD.switchTab('briefs')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Briefs <span class="dash-tab-count" id="dashBrfCount"></span>
          </button>
          <button class="dash-tab-btn${_tab==='docs'?' on':''}" data-tab="docs"
            onclick="DASHBOARD.switchTab('docs')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:12px;height:12px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Documents
          </button>
        </div>
        <div class="dash-tab-actions">
          <div class="dash-search-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="dash-search-ico"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input class="dash-search-inp" id="dashSearchInp" type="text"
              placeholder="Réf., client, tél…" autocomplete="off" spellcheck="false">
            <button class="dash-search-clear" id="dashSearchClear" class="hidden"
              onclick="DASHBOARD._clearSearch()">✕</button>
          </div>
          <div class="dash-refresh-row">
            ${_lastRefresh ? `<span class="dash-last-refresh" id="dashLastRefresh">
              Mis à jour ${_relTime(_lastRefresh)}</span>` : ''}
            <button class="dash-refresh-btn" onclick="DASHBOARD.refresh()" title="Actualiser">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="dash-content" id="dashContent"></div>`;

    // Persistent search listener — never loses focus
    const inp = $('dashSearchInp');
    const clr = $('dashSearchClear');
    if (inp) {
      inp.value = _searchQuery;
      inp.addEventListener('input', e => {
        _searchQuery = e.target.value.toLowerCase().trim();
        if (clr) clr.style.display = _searchQuery ? 'flex' : 'none';
        _renderContent();
      });
    }

    _renderStats();
    _renderContent();
  }

  function _clearSearch() {
    _searchQuery = '';
    const inp = $('dashSearchInp');
    const clr = $('dashSearchClear');
    if (inp) { inp.value = ''; inp.focus(); }
    if (clr) clr.style.display = 'none';
    _renderContent();
  }

  /* ── KPI period helpers ── */
  function setKpiPeriod(p) {
    _kpiPeriod = p;
    _renderStats();
  }
  function setKpiRange(from, to) {
    _kpiFrom = from; _kpiTo = to;
    if (from && to) { _kpiPeriod = 'range'; _renderStats(); }
  }

  /* Returns [startDate, endDate] for the current period */
  function _periodRange() {
    const now  = new Date();
    const sod  = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const eod  = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    if (_kpiPeriod === 'today') {
      return [sod(now), eod(now)];
    }
    if (_kpiPeriod === 'week') {
      const mon = new Date(now);
      mon.setDate(now.getDate() - ((now.getDay()+6)%7));
      return [sod(mon), eod(now)];
    }
    if (_kpiPeriod === 'month') {
      return [new Date(now.getFullYear(), now.getMonth(), 1), eod(now)];
    }
    if (_kpiPeriod === 'range' && _kpiFrom && _kpiTo) {
      return [sod(new Date(_kpiFrom)), eod(new Date(_kpiTo))];
    }
    return [sod(now), eod(now)];
  }

  function _renderStats() {
    const el = $('dashKpi');
    if (!el) return;

    const [periodStart, periodEnd] = _periodRange();
    const inPeriod = o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d >= periodStart && d <= periodEnd;
    };

    const periodOrders = _orders.filter(inPeriod);
    const total        = _orders.length;
    const pTotal       = periodOrders.length;
    const byStatus     = k => _orders.filter(o => (o.status||'nouveau') === k).length;

    const caPeriod  = periodOrders.reduce((s,o) => s + (o.total_ht||0), 0);
    const caTotal   = _orders.reduce((s,o) => s + (o.total_ht||0), 0);
    const avgVal    = pTotal ? caPeriod / pTotal : 0;
    const pending   = _orders.filter(o => !['livre','annule'].includes(o.status||'nouveau')).length;
    const delCount  = periodOrders.filter(o => (o.payload?.totals?.del||0) > 0).length;
    const delRate   = pTotal ? Math.round(100 * delCount / pTotal) : 0;

    // Previous-period comparison for trend
    const periodMs  = periodEnd - periodStart;
    const prevStart = new Date(periodStart - periodMs);
    const prevEnd   = new Date(periodStart - 1);
    const caPrev    = _orders.filter(o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d >= prevStart && d <= prevEnd;
    }).reduce((s,o) => s + (o.total_ht||0), 0);
    const trend     = caPrev > 0 ? Math.round(((caPeriod - caPrev) / caPrev) * 100) : null;
    const trendHtml = trend !== null
      ? `<span class="kpi-trend ${trend >= 0 ? 'up' : 'dn'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="9" height="9"><path d="${trend >= 0 ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'}"/></svg>${Math.abs(trend)}%</span>`
      : '';

    const periodLabels = { today:'Aujourd\'hui', week:'Cette semaine', month:'Ce mois', range:'Période' };
    const periodLabel  = periodLabels[_kpiPeriod] || '';

    // Pipeline: 8 evenly-distributed tiles
    const PIPE = [
      { k:'nouveau',       label:'Nouveau',     color:'#f59e0b', bg:'#fffbeb' },
      { k:'en_cours',      label:'En cours',    color:'#2563eb', bg:'#eff6ff' },
      { k:'conception',    label:'Conception',  color:'#7c3aed', bg:'#f5f3ff' },
      { k:'en_impression', label:'Impression',  color:'#d946ef', bg:'#fdf4ff' },
      { k:'finition',      label:'Finition',    color:'#f97316', bg:'#fff7ed' },
      { k:'pret',          label:'Prêt',        color:'#16a34a', bg:'#f0fdf4' },
      { k:'livre',         label:'Livré',       color:'#0891b2', bg:'#ecfeff' },
      { k:'annule',        label:'Annulé',      color:'#dc2626', bg:'#fef2f2' },
    ];

    // Proportional bar segments
    const pipeTotal    = PIPE.reduce((s,p) => s + byStatus(p.k), 0) || 1;
    const barSegs      = PIPE.map(p => {
      const n   = byStatus(p.k);
      const pct = Math.max(0, Math.round((n / pipeTotal) * 1000) / 10);
      if (!n) return '';
      return `<div class="kpi-bar-seg" style="width:${pct}%;background:${p.color}" title="${p.label}: ${n}" onclick="DASHBOARD.filterByStatus('${p.k}')"></div>`;
    }).join('');

    // Update tab counts
    const oc = $('dashOrdCount'), cc = $('dashCliCount'), qc = $('dashQtCount');
    if (oc) oc.textContent = total || '';
    if (cc) cc.textContent = _clients.length || '';
    if (qc) qc.textContent = _quotes.length || '';

    el.innerHTML = `
      <!-- Period selector -->
      <div class="kpi-period-row">
        <div class="kpi-period-pills">
          ${['today','week','month'].map(k => `
            <button class="kpi-pp${_kpiPeriod===k?' on':''}" onclick="DASHBOARD.setKpiPeriod('${k}')">
              ${ {today:'Aujourd\'hui', week:'7 jours', month:'Ce mois'}[k] }
            </button>`).join('')}
          <button class="kpi-pp${_kpiPeriod==='range'?' on':''}" onclick="DASHBOARD.setKpiPeriod('range')">
            Période
          </button>
        </div>
        ${_kpiPeriod === 'range' ? `
          <div class="kpi-range-row">
            <input type="date" class="kpi-date-inp" value="${_kpiFrom}"
              onchange="DASHBOARD.setKpiRange(this.value, document.getElementById('kpiRangeTo').value)">
            <span class="kpi-range-sep">→</span>
            <input type="date" class="kpi-date-inp" id="kpiRangeTo" value="${_kpiTo}"
              onchange="DASHBOARD.setKpiRange(document.querySelector('.kpi-date-inp').value, this.value)">
          </div>` : ''}
        <span class="kpi-period-lbl">${periodLabel} · ${pTotal} commande${pTotal!==1?'s':''}</span>
      </div>

      <!-- 4 metric cards -->
      <div class="kpi-cards">
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#eff6ff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.8" width="15" height="15"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${fmt(caPeriod)} <span class="kpi-unit">DH</span>${trendHtml}</div>
            <div class="kpi-card-lbl">Chiffre d'affaires</div>
            <div class="kpi-card-sub">Total cumulé : ${fmt(caTotal)} DH</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#f5f3ff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="1.8" width="15" height="15"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${pTotal}</div>
            <div class="kpi-card-lbl">Commandes</div>
            <div class="kpi-card-sub"><span style="color:#f59e0b;font-weight:700">${pending}</span> en production</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#ecfdf5">
            <svg viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.8" width="15" height="15"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${fmt(avgVal)} <span class="kpi-unit">DH</span></div>
            <div class="kpi-card-lbl">Panier moyen</div>
            <div class="kpi-card-sub">par commande HT</div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card-ico" style="background:#ecfeff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="1.8" width="15" height="15"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div class="kpi-card-body">
            <div class="kpi-card-val">${delRate}<span class="kpi-unit">%</span></div>
            <div class="kpi-card-lbl">Avec livraison</div>
            <div class="kpi-card-sub">${delCount} commande${delCount!==1?'s':''}</div>
          </div>
        </div>
      </div>

      <!-- Pipeline: 7 evenly-distributed tiles -->
      <div class="kpi-pipeline">
        <div class="kpi-pipe-tiles">
          ${PIPE.map(p => {
            const n = byStatus(p.k);
            return `<button class="kpi-tile" onclick="DASHBOARD.filterByStatus('${p.k}')">
              <span class="kpi-tile-dot" style="background:${p.color}"></span>
              <span class="kpi-tile-num" style="color:${p.color}">${n}</span>
              <span class="kpi-tile-lbl">${p.label}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="kpi-bar" style="margin-top:.45rem">${barSegs || '<div style="flex:1;background:var(--bd);border-radius:6px"></div>'}</div>
      </div>`;
  }

  /* ── Filter by status (click on pipeline stage) ── */
  function filterByStatus(status) {
    switchTab('orders');
    const el = $('dashContent');
    if (!el) return;
    const filtered = _orders.filter(o => (o.status||'nouveau') === status);
    if (!filtered.length) { el.innerHTML = `<div class="dash-empty"><div>Aucune commande avec ce statut</div></div>`; return; }
    const s = STATUS[status];
    el.innerHTML = `<div class="ops-note-am" style="color:var(--t3)">
      <span class="dash-st-badge" style="background:${s.bg};color:${s.color};border-color:${s.bd}">${s.label}</span>
      ${filtered.length} commande${filtered.length>1?'s':''} · <button class="btn-xs" onclick="DASHBOARD.refresh()" style="color:var(--bl)">Voir tout</button>
    </div>` + _buildOrderCards(filtered);
  }

  function _renderContent() {
    const el = $('dashContent');
    if (!el) return;
    // Per-tab error — show scoped retry instead of full-body takeover
    const tabKey = _tab === 'orders' ? 'orders'
                 : _tab === 'clients' ? 'clients'
                 : _tab === 'quotes'  ? 'quotes'
                 : _tab === 'briefs'  ? 'briefs' : null;
    if (tabKey && _errors[tabKey]) {
      el.innerHTML = `
        <div class="dash-tab-error">
          ${IC.alert}
          <span>${_errors[tabKey]}</span>
          <button class="btn btn-outline" style="height:28px;font-size:.63rem;margin-top:.4rem"
            onclick="DASHBOARD.load()">Réessayer</button>
        </div>`;
      return;
    }
    if (_tab === 'orders')       el.innerHTML = _ordersHTML();
    else if (_tab === 'clients') el.innerHTML = _clientsHTML();
    else if (_tab === 'quotes')  el.innerHTML = _quotesHTML();
    else if (_tab === 'briefs')  el.innerHTML = _briefsHTML();
    else if (_tab === 'docs')    el.innerHTML = _docsHTML();
    // Update briefs tab count badge
    const bbc = $('dashBrfCount');
    if (bbc) bbc.textContent = _briefs.length || '';
  }

  /* ── Client-side search (called externally only for programmatic clear) ── */
  function search(q) {
    _searchQuery = (q||'').toLowerCase().trim();
    const clr = $('dashSearchClear');
    if (clr) clr.style.display = _searchQuery ? 'flex' : 'none';
    _renderContent();
  }

  /* ── Orders tab ── */
  function _ordersHTML() {
    if (!_orders.length) return _emptyHTML(
      '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/>',
      'Aucune commande reçue', 'Les commandes client apparaîtront ici');

    const filtered = _searchQuery
      ? _orders.filter(o =>
          (o.ref||'').toLowerCase().includes(_searchQuery) ||
          (o.client_nom||'').toLowerCase().includes(_searchQuery) ||
          (o.client_tel||'').includes(_searchQuery) ||
          (o.client_email||'').toLowerCase().includes(_searchQuery))
      : _orders;

    if (_searchQuery && !filtered.length) return _emptyHTML(
      '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
      `Aucun résultat pour « ${_searchQuery} »`);

    const resultInfo = _searchQuery
      ? `<div class="dash-result-info">${filtered.length} résultat${filtered.length!==1?'s':''} sur ${_orders.length}</div>`
      : '';

    return resultInfo + _buildOrderCards(filtered);
  }

  function _buildOrderCards(orders) {
    return orders.map(o => {
      const p     = o.payload || {};
      const items = p.items || [];
      const s     = _st(o.status || 'nouveau');
      const d     = o.created_at
        ? _fmtDate(o.created_at)
        : '—';
      const t     = o.created_at
        ? _fmtTime(o.created_at)
        : '';
      const ttc   = o.total_ttc || Math.round((o.total_ht||0) * 1.20 * 100) / 100;
      const delAmt = p.totals?.del || 0;

      const itemsPreview = items.slice(0,2).map(i =>
        `<span class="dash-item-chip">${fmtN(i.quantity)}× ${i.prodName}</span>`
      ).join('') + (items.length > 2
        ? `<span class="dash-item-chip dash-item-more">+${items.length-2}</span>`
        : '');

      const deliveryChip = delAmt > 0
        ? `<span class="dash-item-chip" class="chip--cyan"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison</span>`
        : `<span class="dash-item-chip txt-t3">Retrait</span>`;

      // Conception chips — one per item that has a design request
      const conceptionChips = (p.items || []).flatMap(i => {
        if (!i.snap) return [];
        if (i.snap.designOption === 'service' && i.snap.designTier) {
          const tLabel = TIER_LABELS[i.snap.designTier] || i.snap.designTier;
          const hasBrief = i.snap.brief_ref;
          if (hasBrief) {
            // Clickable — navigates to Briefs tab and highlights the card
            return [`<span class="dash-item-chip dash-brief-link"
              style="color:#7c3aed;border-color:#c4b5fd;background:#f5f3ff;font-weight:700;cursor:pointer;
                     text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px"
              title="Voir le brief ${i.snap.brief_ref}"
              onclick="event.stopPropagation();DASHBOARD.goToBrief('${i.snap.brief_ref}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
              Conception ${tLabel} · ${i.snap.brief_ref}</span>`];
          }
          return [`<span class="dash-item-chip" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;font-weight:700">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            Conception ${tLabel}</span>`];
        }
        if (i.snap.designOption === 'file' && i.snap.designFileName) {
          return [`<span class="dash-item-chip" class="chip--cyan">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9" style="margin-right:2px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Fichier fourni</span>`];
        }
        return [];
      }).join('');

      const _orderBriefRef = items.find(x => x.snap?.brief_ref)?.snap?.brief_ref || null;
      const _bfSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" class="vam-mr2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></svg>';
      const _bfBadge = _orderBriefRef
        ? '<a style="display:inline;vertical-align:baseline;color:#7c3aed;font-weight:600;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;cursor:pointer" onclick="event.stopPropagation();DASHBOARD.goToBrief(\'' + _orderBriefRef + '\')" title="Voir le brief ' + _orderBriefRef + '">' + _bfSVG + 'Brief fourni</a>'
        : '<span class="pu-inline">' + _bfSVG + 'Brief fourni</span>';

      const itemsDetail = items.map(i => {
        const isBriefItem = i.snap?.type === 'brief' || (i.snap?.designOption === 'service' && i.snap?.brief_ref);
        const briefRef    = i.snap?.brief_ref || null;
        const specsHtml   = i.specs && !isBriefItem
          ? '<div class="dash-detail-spec">' + i.specs.replace(/📋\s*Brief fourni|Brief fourni/, _bfBadge) + '</div>'
          : '';
        return `
        <div class="dash-detail-row">
          <div class="adm-mat-flex1">
            <div class="dash-detail-name">${i.prodName}</div>
            ${specsHtml}
            ${i.notes ? `<div class="dash-detail-note">"${i.notes}"</div>` : ''}
            ${isBriefItem && briefRef ? `
            <div style="margin-top:3px">
              <span style="font-family:'Courier New',monospace;font-size:.6rem;font-weight:700;
                color:#7c3aed;background:#f5f3ff;border:1px solid #c4b5fd;border-radius:5px;
                padding:1px 7px;cursor:pointer;transition:background .12s"
                title="Voir le brief ${briefRef}"
                onclick="DASHBOARD.goToBrief('${briefRef}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                  width="8" height="8" style="margin-right:2px;vertical-align:middle">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>${briefRef}
              </span>
            </div>` : ''}
          </div>
          <div class="tr-sh0">
            <div class="ops-lbl-t1">${isBriefItem && !i.baseTotal ? '<span style="color:#d97706;font-size:.62rem">Prix en attente</span>' : fmt(i.baseTotal) + ' DH'}</div>
            ${!isBriefItem ? `<div class="micro-t3">${fmtN(i.quantity)} × ${fmt(i.perUnit)}</div>` : ''}
          </div>
        </div>`;
      }).join('');

      const clientNote = p.client?.note
        ? `<div class="dash-client-note">${IC.info} ${p.client.note}</div>` : '';

      // Detect if this order has a design service item
      const hasDesignService = (p.items || []).some(i =>
        i.snap?.designOption === 'service' && i.snap?.designTier
      );

      // Status pills — only show 'conception' status on orders that have design items
      const statusPills = Object.entries(STATUS)
        .filter(([k]) => k !== 'conception' || hasDesignService)
        .map(([k,v]) => {
          const active = (o.status||'nouveau') === k;
          return `<button class="dash-st-pill${active?' act':''}" data-status="${k}"
            style="${active ? `background:${v.bg};color:${v.color};border-color:${v.bd}` : ''}"
            onclick="DASHBOARD.setStatus('${o.id}','${k}')">${v.label}</button>`;
        }).join('');

      return `
        <div class="dash-ord-card" id="dord-${o.id}" style="border-left:3px solid ${s.color}">
          <div class="dash-ord-hdr" onclick="DASHBOARD.toggleOrder('${o.id}')">
            <div class="dash-ord-hdr-l">
              <div class="dash-ord-ref">
                ${o.ref}
                <span class="dash-st-badge" style="background:${s.bg};color:${s.color};border-color:${s.bd}">${s.label}</span>
              </div>
              <div class="dash-ord-client">
                ${o.client_nom || '<span class="txt-t3">—</span>'}
                ${o.client_tel ? `<span class="t3-400"> · ${o.client_tel}</span>` : ''}
              </div>
              <div class="dash-ord-chips">${itemsPreview}${deliveryChip}${conceptionChips}</div>
            </div>
            <div class="dash-ord-hdr-r">
              <div class="dash-ord-total">${fmt(o.total_ht)} DH</div>
              <div class="dash-ord-ttc">TTC ${fmt(ttc)} DH</div>
              <div class="dash-ord-date">${d} · ${t}</div>
            </div>
            <svg class="dash-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>

          <div class="dash-ord-body">
            <!-- Client info -->
            <div class="dash-section-lbl">Client</div>
            <div class="dash-client-grid">
              ${o.client_nom     ? `<div class="dash-client-item">${SV.user}${o.client_nom}</div>` : ''}
              ${o.client_tel     ? `<div class="dash-client-item">${SV.phone}${o.client_tel}</div>` : ''}
              ${o.client_email   ? `<div class="dash-client-item">${SV.mail}${o.client_email}</div>` : ''}
              ${delAmt > 0 && o.client_adresse ? `<div class="dash-client-item">${SV.pin}${o.client_adresse}${o.client_ville?', '+o.client_ville:''}</div>` : ''}
            </div>
            ${clientNote}

            <!-- Products -->
            <div class="dash-section-lbl" class="mt-8">Produits</div>
            <div class="dash-detail-items">${itemsDetail}</div>

            <!-- Totals -->
            <div class="dash-totals-wrap">
              ${delAmt > 0 ? `<div class="dash-totals-row"><span class="txt-t3">Livraison</span><span>+${fmt(delAmt)} DH</span></div>` : ''}
              <div class="dash-totals-row"><span class="txt-t2">Total HT</span><strong>${fmt(o.total_ht)} DH</strong></div>
              <div class="dash-totals-row"><span class="txt-t3">TVA 20%</span><span class="txt-t3">${fmt(ttc-(o.total_ht||0))} DH</span></div>
              <div class="dash-totals-row dash-totals-ttc"><span>Total TTC</span><strong class="txt-bl">${fmt(ttc)} DH</strong></div>

              <!-- Acompte versé -->
              <div class="dash-totals-row" style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--bd);align-items:center;flex-wrap:wrap;gap:.3rem">
                <span style="color:var(--t3);font-size:.65rem;font-weight:600">Acompte versé</span>
                <span style="margin-left:auto;display:flex;align-items:center;gap:.3rem" id="ord-dep-display-${o.id}">
                  ${(o.montant_verse > 0)
                    ? `<span style="font-size:.68rem;font-weight:700;color:var(--t2)">${fmt(o.montant_verse)} DH</span>
                       <button class="dash-act-btn" style="color:#64748b;border-color:#e2e8f0;padding:.18rem .35rem"
                         onclick="event.stopPropagation();DASHBOARD._showDepositInput('${o.id}')"
                         title="Modifier l'acompte">
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                       </button>`
                    : `<button class="dash-act-btn" style="color:#d97706;border-color:#fde68a;background:#fffbeb;font-weight:700;font-size:.62rem"
                         id="ord-dep-fix-btn-${o.id}"
                         onclick="event.stopPropagation();DASHBOARD._showDepositInput('${o.id}')"
                         title="Saisir un acompte">
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                         Acompte
                       </button>`
                  }
                </span>
                <span id="ord-dep-inline-${o.id}" style="display:none;align-items:center;gap:.3rem;width:100%;margin-top:2px">
                  <input type="number" min="0" step="1" id="ord-dep-inp-${o.id}"
                    placeholder="Montant DH"
                    value="${o.montant_verse || ''}"
                    style="border:1.5px solid #fbbf24;border-radius:6px;padding:.23rem .4rem;
                      font-size:.7rem;font-family:inherit;color:var(--t1);background:#fffbeb;
                      width:100px;box-sizing:border-box;flex-shrink:0"
                    onclick="event.stopPropagation()"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();DASHBOARD._saveDeposit('${o.id}');}
                               if(event.key==='Escape'){event.preventDefault();DASHBOARD._hideDepositInput('${o.id}');}"
                  >
                  <button class="dash-act-btn" style="color:#059669;border-color:#a7f3d0;background:#ecfdf5;padding:.2rem .4rem"
                    onclick="event.stopPropagation();DASHBOARD._saveDeposit('${o.id}')" title="Confirmer l'acompte">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <button class="dash-act-btn" style="color:#64748b;border-color:#e2e8f0;padding:.2rem .4rem"
                    onclick="event.stopPropagation();DASHBOARD._hideDepositInput('${o.id}')" title="Annuler">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  ${(o.montant_verse > 0)
                    ? `<span style="font-size:.62rem;color:var(--t3);margin-left:2px">Reste : ${fmt(Math.max(0, ttc - (o.montant_verse||0)))} DH</span>`
                    : ''}
                </span>
              </div>
            </div>

            <!-- Status + Actions -->
            <div class="dash-body-footer">
              <div>
                <div class="dash-section-lbl">Statut</div>
                <div class="dash-st-pills">${statusPills}</div>
              </div>
              <div class="dash-action-btns">
                <button class="dash-act-btn dash-act-pdf" onclick="DASHBOARD.openInvoice('${o.id}')">
                  ${IC.printer} Générer facture
                </button>
                <button class="dash-act-btn" class="chip--cyan" onclick="DASHBOARD.printLabel('${o.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                  Étiquette
                </button>
                <button class="dash-act-btn" class="chip--pu-sm" onclick="DASHBOARD.showDF('${o.id}')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  DF
                </button>
                <div class="dash-contact-wrap" id="dc-${o.id}">
                  <button class="dash-act-btn dash-act-contact" onclick="event.stopPropagation();DASHBOARD.toggleContact('${o.id}')" title="Contacter le client">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Contact client
                    <svg class="dc-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="8" height="8" style="transition:transform .18s"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                  <div class="dash-contact-pills" id="dc-pills-${o.id}">
                    <button class="dash-act-btn dash-act-mail${o.client_email?'':' disabled'}" onclick="event.stopPropagation();DASHBOARD.notifyEmail('${o.id}')" title="${o.client_email?'Email: '+o.client_email:'Aucun email'}">
                      ${IC.mail} Mail
                    </button>
                    <button class="dash-act-btn dash-act-wa" onclick="event.stopPropagation();DASHBOARD.notifyWA('${o.id}')">
                      ${IC.whatsapp} WA
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Clients tab ── */
  function _clientsHTML() {
    if (!_clients.length) return _emptyHTML(
      '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>',
      'Aucun client enregistré');

    // Build order count + last order date per client email
    const _ordCount = {};
    const _lastOrd  = {};
    _orders.forEach(o => {
      if (!o.client_email) return;
      _ordCount[o.client_email] = (_ordCount[o.client_email] || 0) + 1;
      if (!_lastOrd[o.client_email] || o.created_at > _lastOrd[o.client_email])
        _lastOrd[o.client_email] = o.created_at;
    });

    const svgThumbUp = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>`;
    const svgThumbDn = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17"/></svg>`;
    const svgX       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    const svgSave    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;

    return `<div class="dash-clients-list">` +
      _clients.map(c => {
        const cnt   = c.email ? (_ordCount[c.email] || 0) : 0;
        const last  = c.email && _lastOrd[c.email]
          ? _fmtDate(_lastOrd[c.email])
          : null;
        const since = c.created_at
          ? _fmtDate(c.created_at)
          : null;
        const rating = c.rating || null;

        // Border accent: green=good, red=bad, default blue
        const borderCol = rating === 'good' ? '#16a34a' : rating === 'bad' ? '#dc2626' : 'var(--bl)';

        // Rating badge — same class as order status badge
        const ratingBadge = rating === 'good'
          ? `<span class="dash-st-badge" style="background:#f0fdf4;color:#16a34a;border-color:#bbf7d0">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="8" height="8"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/></svg>
               Bon client</span>`
          : rating === 'bad'
          ? `<span class="dash-st-badge" style="background:#fef2f2;color:#dc2626;border-color:#fecaca">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="8" height="8"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3H10z"/></svg>
               Difficile</span>`
          : '';

        const noteBadge = c.note
          ? `<span class="dash-item-chip" class="chip--pu-sm">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="8" height="8" style="margin-right:2px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Note</span>`
          : '';

        return `
        <div class="dash-ord-card" id="cli-card-${c.id}" style="border-left:3px solid ${borderCol}">

          <!-- ── Header ── -->
          <div class="dash-ord-hdr" onclick="DASHBOARD.toggleClient('${c.id}')">
            <div class="dash-ord-hdr-l">
              <div class="dash-ord-ref">
                ${c.nom || '—'}
                ${ratingBadge}
              </div>
              <div class="dash-ord-client">
                ${c.tel || ''}${c.tel && c.email ? `<span class="t3-400"> · </span>` : ''}${c.email ? `<span class="t3-400">${c.email}</span>` : ''}
              </div>
              <div class="dash-ord-chips">
                ${c.ice
                  ? `<span class="dash-item-chip" style="color:var(--bl);border-color:#bfdbfe;background:#eff6ff">ICE ${c.ice}</span>`
                  : ''}
                ${cnt > 0
                  ? `<span class="dash-item-chip" style="color:var(--bl);border-color:#bfdbfe;background:#eff6ff;font-weight:600">${cnt} commande${cnt>1?'s':''}</span>`
                  : `<span class="dash-item-chip txt-t3">Aucune commande</span>`}
                ${noteBadge}
              </div>
            </div>
            <div class="dash-ord-hdr-r">
              <div class="dash-ord-total" style="font-variant-numeric:tabular-nums">
                ${cnt > 0 ? cnt + ' commande' + (cnt>1?'s':'') : '—'}
              </div>
              ${last  ? `<div class="dash-ord-ttc">Dernière : ${last}</div>` : ''}
              ${since ? `<div class="dash-ord-date">Depuis le ${since}</div>` : ''}
            </div>
            <svg class="dash-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>

          <!-- ── Body ── -->
          <div class="dash-ord-body" id="cli-body-${c.id}" class="hidden">

            <!-- Coordonnées -->
            <div class="dash-section-lbl">Coordonnées</div>
            <div class="dash-client-grid">
              ${c.tel             ? `<div class="dash-client-item">${SV.phone}${c.tel}</div>`                                     : ''}
              ${c.email           ? `<div class="dash-client-item">${SV.mail}${c.email}</div>`                                    : ''}
              ${c.ice             ? `<div class="dash-client-item">${SV.ice}ICE ${c.ice}</div>`                                   : ''}
              ${c.adresse         ? `<div class="dash-client-item">${SV.pin}${c.adresse}</div>`                                   : ''}
              ${c.adresse_facturation ? `<div class="dash-client-item" style="color:var(--t2)">${SV.home}Fact. ${c.adresse_facturation}</div>` : ''}
              <div class="dash-client-item">${SV.orders}<strong>${cnt}</strong>&nbsp;commande${cnt!==1?'s':''} au total${last ? ' · dernière le ' + last : ''}</div>
            </div>

            <!-- Actions -->
            <div class="dash-body-footer" class="mt-8">
              <div class="dash-action-btns">
                ${c.tel ? `
                <a class="dash-act-btn dash-act-wa" style="text-decoration:none"
                  href="https://wa.me/${c.tel.replace(/\D/g,'')}" target="_blank" rel="noopener"
                  onclick="event.stopPropagation()">
                  ${IC.whatsapp} WhatsApp
                </a>` : ''}
                ${c.email ? `
                <a class="dash-act-btn dash-act-mail" style="text-decoration:none"
                  href="mailto:${c.email}"
                  onclick="event.stopPropagation()">
                  ${IC.mail} Email
                </a>` : ''}
              </div>

              <!-- Rating -->
              <div class="dash-action-btns">
                <button class="dash-act-btn" onclick="event.stopPropagation();DASHBOARD.rateClient('${c.id}','good')"
                  style="${rating==='good' ? 'background:#f0fdf4;color:#16a34a;border-color:#bbf7d0;font-weight:700' : ''}">
                  ${svgThumbUp} Bon client
                </button>
                <button class="dash-act-btn" onclick="event.stopPropagation();DASHBOARD.rateClient('${c.id}','bad')"
                  style="${rating==='bad' ? 'background:#fef2f2;color:#dc2626;border-color:#fecaca;font-weight:700' : ''}">
                  ${svgThumbDn} Difficile
                </button>
                ${rating ? `
                <button class="dash-act-btn" onclick="event.stopPropagation();DASHBOARD.rateClient('${c.id}',null)"
                  style="color:var(--t3)">
                  ${svgX} Effacer
                </button>` : ''}
              </div>
            </div>

            <!-- Note interne -->
            <div class="mt-8">
              <div class="dash-section-lbl">Note interne</div>
              <textarea id="cli-note-${c.id}" rows="2" onclick="event.stopPropagation()"
                placeholder="Remarque, conditions particulières…"
                style="width:100%;box-sizing:border-box;margin-top:4px;
                  font-size:.68rem;font-family:inherit;color:var(--t1);
                  background:var(--bg2,#f8fafc);border:1px solid var(--br);
                  border-radius:6px;padding:.38rem .5rem;resize:vertical;outline:none;
                  transition:border-color .15s"
                onfocus="this.style.borderColor='var(--bl)'"
                onblur="this.style.borderColor='var(--br)'"
              >${c.note || ''}</textarea>
              <button class="dash-act-btn" id="cli-note-btn-${c.id}"
                style="margin-top:5px;background:var(--bl);color:#fff;border-color:var(--bl)"
                onclick="event.stopPropagation();DASHBOARD.saveClientNote('${c.id}')">
                ${svgSave} Enregistrer
              </button>
            </div>

          </div>
        </div>`;
      }).join('') +
    `</div>`;
  }

  /* ── Toggle client card expand / collapse ── */
  function toggleClient(id) {
    const body  = document.getElementById('cli-body-'  + id);
    const card  = document.getElementById('cli-card-'  + id);
    const chev  = card?.querySelector('.dash-chev');
    if (!body) return;
    const open  = body.style.display === 'none';
    body.style.display = open ? 'block' : 'none';
    if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
  }

  /* ── Save client note ── */
  async function saveClientNote(id) {
    const ta   = document.getElementById('cli-note-' + id);
    const btn  = document.getElementById('cli-note-btn-' + id);
    if (!ta) return;
    const note = ta.value.trim();
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await _patch('kote_clients', id, { note });
      const c = _clients.find(x => x.id === id);
      if (c) c.note = note;
      if (btn) {
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg> Enregistré';
        btn.style.background = '#16a34a'; btn.style.borderColor = '#16a34a';
        setTimeout(() => { if (btn) { btn.innerHTML = orig; btn.style.background = ''; btn.style.borderColor = ''; btn.disabled = false; } }, 1600);
      }
    } catch(e) {
      if (btn) {
        btn.textContent = 'Erreur';
        btn.style.background = '#dc2626'; btn.style.borderColor = '#dc2626';
        setTimeout(() => { if (btn) { btn.innerHTML = orig; btn.style.background = ''; btn.style.borderColor = ''; btn.disabled = false; } }, 2000);
      }
    }
  }

  /* ── Rate client (good / bad / null) ── */
  async function rateClient(id, rating) {
    try {
      await _patch('kote_clients', id, { rating: rating || null });
      const c = _clients.find(x => x.id === id);
      if (c) c.rating = rating || null;
      // Re-render the card in place — keep it open
      const card = document.getElementById('cli-card-' + id);
      if (card) {
        const wasOpen = document.getElementById('cli-body-' + id)?.style.display !== 'none';
        const tmp = document.createElement('div');
        tmp.innerHTML = _clientsHTML();
        const newCard = tmp.querySelector('#cli-card-' + id);
        if (newCard) {
          card.replaceWith(newCard);
          if (wasOpen) {
            const body = document.getElementById('cli-body-' + id);
            const chev = document.getElementById('cli-card-' + id)?.querySelector('.dash-chev');
            if (body) body.style.display = 'block';
            if (chev) chev.style.transform = 'rotate(180deg)';
          }
        }
      }
    } catch(e) { console.warn('[DASHBOARD] rateClient failed', e); }
  }

  /* ── Quotes (Devis) tab — mirrors kote_quotes ── */
  function _quotesHTML() {
    /* JSON mode fallback */
    const list = _quotes.length ? _quotes
      : (window._jsonQuotes || []);

    if (!list.length) return _emptyHTML(
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      'Aucun devis enregistré', 'Les devis générés via l\'app apparaîtront ici');

    return list.map(q => {
      const p     = q.payload || {};
      const items = Array.isArray(p.items) ? p.items
                  : Array.isArray(q.items) ? q.items : [];
      const d = q.created_at
        ? _fmtDate(q.created_at)
        : '—';
      const t = q.created_at
        ? _fmtTime(q.created_at)
        : '';
      const ttc  = q.total_ttc || Math.round((q.total_ht||0)*1.20*100)/100;
      const st   = { devis:'Devis', facture:'Facture', avoir:'Avoir' };
      const stColor = q.status==='facture' ? 'var(--bl)' : 'var(--t3)';

      const itemsChips = items.slice(0,3).map(i =>
        `<span class="dash-item-chip">${fmtN(i.quantity)}× ${i.prodName}</span>`
      ).join('') + (items.length>3
        ? `<span class="dash-item-chip dash-item-more">+${items.length-3}</span>` : '');

      const itemsDetail = items.map(i => `
        <div class="dash-detail-row">
          <div>
            <div class="dash-detail-name">${i.prodName}</div>
            ${i.specs ? `<div class="dash-detail-spec">${i.specs}</div>` : ''}
            ${i.notes ? `<div class="dash-detail-note">"${i.notes}"</div>` : ''}
          </div>
          <div class="tr-sh0">
            <div class="ops-lbl-t1">${fmt(i.baseTotal)} DH</div>
            <div class="micro-t3">${fmtN(i.quantity)} × ${fmt(i.perUnit)}</div>
          </div>
        </div>`).join('');

      const clientLine = q.client_nom
        ? `<div class="dash-ord-client">${q.client_nom}${q.client_ice?' · ICE '+q.client_ice:''}</div>`
        : '';

      return `
        <div class="dash-ord-card" id="dqt-${q.id}">
          <div class="dash-ord-hdr" onclick="document.getElementById('dqt-${q.id}').classList.toggle('open')">
            <div class="dash-ord-hdr-l">
              <div class="dash-ord-ref">
                ${q.ref}
                <span class="dash-st-badge" style="color:${stColor};background:var(--s2);border-color:var(--bd)">
                  ${st[q.status]||q.status||'devis'}
                </span>
              </div>
              ${clientLine}
              <div class="dash-ord-chips">${itemsChips}</div>
            </div>
            <div class="dash-ord-hdr-r">
              <div class="dash-ord-total">${fmt(q.total_ht)} DH HT</div>
              <div class="dash-ord-ttc">${fmt(ttc)} DH TTC</div>
              <div class="dash-ord-date">${d} · ${t}</div>
            </div>
            <svg class="dash-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </div>
          <div class="dash-ord-body">
            <div class="dash-section-lbl">Produits</div>
            <div class="dash-detail-items">${itemsDetail}</div>
            <div class="dash-totals-row" style="margin-top:6px">
              <span class="txt-t2">Total HT</span>
              <strong>${fmt(q.total_ht)} DH</strong>
            </div>
            <div class="dash-totals-row dash-totals-ttc">
              <span>Total TTC</span>
              <strong class="txt-bl">${fmt(ttc)} DH</strong>
            </div>
            <div class="dash-actions">
              <div></div>
              <div class="dash-action-btns">
                <button class="dash-act-btn dash-act-pdf"
                  onclick="DASHBOARD.openQuoteInvoice('${q.id}')">
                  ${IC.printer} Aperçu PDF
                </button>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── A5 Package Label Generator ── */
  function printLabel(id) {
    const ord    = _orders.find(o => o.id === id);
    if (!ord) return;
    const p      = ord.payload || {};
    const items  = p.items || [];
    const client  = p.client || {};
    const ttc     = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const delAmt  = p.totals?.del || 0;
    const deposit = ord.montant_verse || p.deposit || 0;
    const d      = ord.created_at
      ? _fmtDate(ord.created_at)
      : new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'});
    const shopName  = DB?.shop?.name || 'Kote Imprimerie';
    const shopTel   = DB?.contact?.whatsapp || DB?.contact?.tel || '+212 6 44 50 20 90';
    const shopEmail = DB?.contact?.email    || 'contact@kdigital.ma';
    const shopAddr  = DB?.shop?.address || DB?.contact?.adresse  || '144, Bd de la Gironde — Casablanca';
    const shopWeb   = DB?.shop?.website || DB?.contact?.website  || 'www.kdigital.ma';
    const clientCity = ord.client_ville || client.ville || '';

    const qrData = location.origin + location.pathname.replace(/[^/]*$/, '') + 'tracking.html?ref=' + encodeURIComponent(ord.ref);

    /* ── Custom icons ── */
    const ICO = {
      box:     `<svg viewBox="0 0 28.67 29.33" fill="currentColor"><path d="M12.67 0L25.33 7.33v14.67L12.67 29.33 0 22V7.33zm-8.67 8.11L14 13.89v11.58l8.67-5.01V8.88L12.67 3.09zM2.67 10.43v10.02l8.67 5.04V15.44z"/></svg>`,
      fragile: `<svg viewBox="0 0 18.69 26.66" fill="currentColor"><path d="M18.69 10c0-.33-.07-1.07-.22-2.22C18.32 6.64 17.97 4.41 17.41 1.09L17.19 0h-4.66L10.81 3.41l2.41 1.19.94-1.94h.81c.44 2.67.72 4.5.84 5.5.13 1 .19 1.61.19 1.84 0 .81-.17 1.58-.52 2.31-.34.73-.81 1.37-1.41 1.91s-1.31 1.02-2.13 1.33c-.81.32-1.66.48-2.56.48s-1.75-.16-2.56-.48-1.51-.79-2.13-1.33c-.61-.54-1.08-1.18-1.41-1.91S2.69 10.81 2.69 10c0-.23.06-.84.19-1.84.12-1 .41-2.83.84-5.5h3.03L4.75 8h2.44L5.5 11.41l2.38 1.19L11.5 5.31H8.59L10.59 0H1.5L1.28 1.09C.72 4.41.36 6.64.22 7.78.07 8.93 0 9.67 0 10c0 1.08.2 2.1.61 3.06.41.96.97 1.82 1.67 2.58.7.76 1.54 1.39 2.5 1.91.97.51 2.01.84 3.13.98V24H3.94v2.66h10.66V24h-4V18.56c1.15-.14 2.21-.47 3.19-.97.98-.5 1.83-1.13 2.56-1.89.73-.76 1.3-1.63 1.72-2.61.41-.98.62-2.01.62-3.09z"/></svg>`,
      recycle: `<svg viewBox="0 0 28.93 26.03" fill="currentColor"><path d="M23.15 12.79l2.03 3.55c.43.73.64 1.51.64 2.33s-.2 1.57-.61 2.29c-.41.72-.98 1.29-1.71 1.72-.73.43-1.51.64-2.33.64l-2.75-.03v2.69l-6.67-4.67 6.67-4.67v2.64l2.75.03c.12 0 .23-.04.32-.11.14-.07.22-.18.27-.33.05-.15.05-.31 0-.47l-.03-.11-2.05-3.54zM7.39 9.19l.69 8.1-2.29-1.33-1.39 2.37c-.05.11-.08.23-.08.35 0 .16.05.3.14.43.1.12.23.2.39.21l.13.03 4.08-.03V23.3H4.99c-.85 0-1.64-.21-2.35-.64C1.93 22.24 1.36 21.67.95 20.96.53 20.26.32 19.49.32 18.65s.2-1.63.61-2.35L2.32 14l-2.32-1.33zM15.39.63c.73.41 1.3.98 1.7 1.7l1.39 2.37 2.29-1.33-.69 8.11-7.39-3.44 2.32-1.33-1.39-2.37c-.05-.11-.13-.18-.24-.23-.14-.09-.29-.12-.44-.09-.15.03-.28.1-.37.23l-.08.11-2.03 3.55-3.47-2 2.03-3.55C11.44 1.6 12.01 1.04 12.73.63 13.45.22 14.23.01 15.05 0c.83-.01 1.61.2 2.34.63z"/></svg>`,
      shield:  `<svg viewBox="0 0 24 29.34" fill="currentColor"><path d="M12 0L0 5.34v8c0 1.83.3 3.63.91 5.38.6 1.75 1.44 3.34 2.51 4.77 1.07 1.43 2.34 2.66 3.8 3.69C8.68 28.2 10.27 28.93 12 29.34c1.73-.41 3.32-1.14 4.78-2.16 1.46-1.03 2.72-2.26 3.79-3.69 1.07-1.43 1.91-3.02 2.51-4.77C23.7 16.97 24 15.18 24 13.34V5.34zM12 14.66h9.34c-.19 1.37-.55 2.7-1.08 3.96-.53 1.27-1.2 2.43-2.01 3.48-.81 1.05-1.74 1.96-2.8 2.73-1.05.77-2.2 1.35-3.45 1.72V14.66H2.66V7.06L12 2.91z"/></svg>`,
    };

    document.getElementById('labelModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'labelModal';

    modal.innerHTML = `
<div id="lbl-box">
  <div id="lbl-tb">
    <div id="lbl-tb-l">
      ${ICO.box}
      Bon d\u2019exp\xe9dition \xb7 ${ord.ref}
    </div>
    <div id="lbl-tb-r">
      <button class="l-btn p" id="lbl-pdf-btn" onclick="DASHBOARD._labelGenPDF('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        PDF
      </button>
      <button class="l-btn p" onclick="DASHBOARD._printLabel()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimer A6
      </button>
      <button class="l-btn" onclick="document.getElementById('labelModal').remove()">\u2715 Fermer</button>
    </div>
  </div>
  <div id="lbl-scroll">
    <div id="lbl-a6">
      <div id="lbl-frame">

        <!-- TOP BAR -->
        <div class="la-top">
          <div class="la-logo-cell">
            ${(() => {
              const svg = DB?.shop?.logo_svg?.trim();
              if (svg && svg.startsWith('<svg')) {
                return svg.replace(/<svg([^>]*)>/i, (m, a) => {
                  const c = a.replace(/\s*(width|height|style)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '');
                  return `<svg${c} class="la-logo-svg" style="max-height:32px;width:auto;display:block">`;
                });
              }
              return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 451.63 123.79" class="la-logo-svg">
              <path fill="#696969" d="M191,123.79a62.31,62.31,0,0,0,31.07-8A59.36,59.36,0,0,0,244.5,93.65a62,62,0,0,0,8.26-31.84A62,62,0,0,0,244.5,30a58.88,58.88,0,0,0-22.39-22,65.43,65.43,0,0,0-62.41,0,59.26,59.26,0,0,0-22.56,22,61.44,61.44,0,0,0-8.34,31.84,61.44,61.44,0,0,0,8.34,31.84,59.93,59.93,0,0,0,22.56,22.14A62.66,62.66,0,0,0,191,123.79Zm0-35.25q-11.41,0-17.54-7.23t-6.13-19.5q0-12.44,6.13-19.67T191,34.91q11.24,0,17.37,7.23t6.13,19.67q0,12.25-6.13,19.5T191,88.54ZM259.57,2V32h31.67V122.6H329V32h32V2ZM451.63,32.18V2H371.26V122.6h80.37V92.46H409.07v-17h37.45V47H409.07V32.18Z"/>
              <path fill="#2563EB" d="M103.06,41.51a18.57,18.57,0,0,0,18.57-18.57V1M103.06,122.6A18.57,18.57,0,0,0,121.63,104v-22M40.54,41.51H81.09v22.3A18.24,18.24,0,0,1,62.85,82.05H40.54V122.6H0V1H40.54ZM121.63,1H81.09V41.51h22M121.63,82.05H81.09V122.6h22"/>
            </svg>`;
            })()}
          </div>
          <div class="la-ref-cell">
            <div class="la-ref-val">${ord.ref}</div>
            <div class="la-ref-meta">
              <div class="la-date">${d}</div>
              ${clientCity ? `<div class="la-city">${clientCity}</div>` : ''}
            </div>
          </div>
        </div>

        <!-- LEFT: ADDRESSES -->
        <div class="la-addr-col">
          <div class="la-addr-block">
            <div class="la-addr-eyebrow">Exp\xe9diteur</div>
            <div class="la-addr-name">${shopName}</div>
            <div class="la-addr-line">${shopAddr}</div>
            ${shopTel ? `<div class="la-addr-tel">${shopTel}</div>` : ''}
            <div class="la-addr-line">${shopEmail}</div>
          </div>
          <div class="la-addr-block">
            <div class="la-addr-eyebrow">Destinataire</div>
            <div class="la-addr-name">${ord.client_nom||client.nom||'—'}</div>
            ${(ord.client_tel||client.tel)?`<div class="la-addr-tel">${ord.client_tel||client.tel}</div>`:''}
            ${(ord.client_adresse||client.adresse)?`<div class="la-addr-line">${ord.client_adresse||client.adresse||''}${(ord.client_ville||client.ville)?', '+(ord.client_ville||client.ville):''}</div>`:''}
          </div>
        </div>

        <!-- RIGHT: QR + AMOUNTS -->
        <div class="la-right">
          <div class="la-qr-zone">
            <div id="lbl-qr-el"></div>
            <div class="la-qr-cap">Scanner \u2192 d\xe9tail colis</div>
          </div>
          <div class="la-info-zone">
            <div>
              <div class="la-sec">Montant</div>
              <div class="la-totals-box" id="lbl-totals-box" data-ttc="${ttc}">
                <div class="la-tr"><span>Sous-total HT</span><span>${fmt(ord.total_ht)} DH</span></div>
                ${delAmt>0?`<div class="la-tr"><span>Livraison</span><span>+${fmt(delAmt)} DH</span></div>`:''}
                <div class="la-tr"><span>TVA 20%</span><span>${fmt(ttc-(ord.total_ht||0))} DH</span></div>
                <div class="la-tr ttc" id="lbl-row-ttc"><span>Total TTC</span><span>${fmt(ttc)} DH</span></div>
                <div class="la-tr" id="lbl-row-dep" style="display:${deposit>0?'flex':'none'}">
                  <span>Acompte versé</span><span id="lbl-dep-val">−${fmt(deposit)} DH</span>
                </div>
                <div class="la-tr ttc" id="lbl-row-due" style="margin-top:4px;display:${deposit>0?'flex':'none'};font-size:12px">
                  <span>À payer</span><span id="lbl-due-val">${fmt(Math.max(0,ttc-deposit))} DH</span>
                </div>
              </div>
            </div>
            <div class="la-policy">
              <div class="la-policy-t">Retour</div>
              <div class="la-policy-b">Aucun retour sur commande personnalis\xe9e. D\xe9faut d\u2019impression : 48h \u2014 ${shopEmail}</div>
            </div>
          </div>
        </div>

        <!-- FOOTER -->
        <div class="la-foot">
          <div class="la-foot-web">${shopWeb}</div>
          <div class="la-foot-bc">
            <svg id="lbl-barcode-svg"></svg>
          </div>
          <div class="la-foot-icons">
            <div class="la-ico-box">${ICO.fragile}</div>
            <div class="la-ico-box">${ICO.recycle}</div>
            <div class="la-ico-box">${ICO.shield}</div>
          </div>
        </div>

      </div>
    </div>
  </div>
</div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    Promise.all([
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', 'QRCode'),
      _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.5/JsBarcode.all.min.js', 'JsBarcode'),
    ]).then(() => {
      const qrEl = document.getElementById('lbl-qr-el');
      if (qrEl && typeof QRCode !== 'undefined') {
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
          text: qrData, width: 108, height: 108,
          colorDark: '#0f172a', colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M,
        });
        /* QRCode.js injects both canvas + img — kill the img */
        setTimeout(() => { qrEl.querySelectorAll('img').forEach(el => el.remove()); }, 80);
      }
      const bcEl = document.getElementById('lbl-barcode-svg');
      if (bcEl && typeof JsBarcode !== 'undefined') {
        JsBarcode(bcEl, ord.ref, {
          format: 'CODE128', width: 1.1, height: 28,
          displayValue: true, fontSize: 9, font: 'Courier New',
          textMargin: 2, margin: 0, lineColor: '#0f172a', background: '#ffffff',
        });
      }
    }).catch(err => {
      console.warn('[Label] CDN load failed:', err);
      const qrEl = document.getElementById('lbl-qr-el');
      if (qrEl) qrEl.innerHTML = `<div style="width:108px;height:108px;border:1.5px solid #0f172a;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#0f172a;text-align:center;padding:4px;word-break:break-all;font-family:monospace">${ord.ref}</div>`;
    });
  }

  async function _labelGenPDF(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const btn = document.getElementById('lbl-pdf-btn');
    if (btn) { btn.disabled=true; btn.innerHTML=`<svg class="l-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="11" height="11"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> G\xe9n\xe9ration\u2026`; }
    try {
      const _ld = (src, ready) => new Promise((res,rej) => {
        if (ready()) { res(); return; }
        if (document.querySelector(`script[src="${src}"]`)) {
          let n=0; const t=setInterval(()=>{ if(ready()){clearInterval(t);res();} else if(++n>50){clearInterval(t);rej(new Error('Timeout'));} },100); return;
        }
        const s=document.createElement('script'); s.src=src;
        s.onload=res; s.onerror=()=>rej(new Error('CDN: '+src)); document.head.appendChild(s);
      });
      await _ld('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', ()=>!!window.html2canvas);
      await _ld('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', ()=>!!(window.jspdf?.jsPDF||window.jsPDF));

      const cardEl = document.getElementById('lbl-a6');
      if (!cardEl) throw new Error('Label element not found');

      const canvas = await window.html2canvas(cardEl, {
        scale: 3, useCORS: true, allowTaint: false,
        backgroundColor: '#ffffff', logging: false,
        width: 559, height: 397,
      });

      const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
      if (!JsPDF) throw new Error('jsPDF unavailable');

      const pdf = new JsPDF({ unit:'mm', format:'a6', orientation:'landscape' });
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 148, 105);

      const blob = pdf.output('blob');
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href=url; a.download=`etiquette-${ord.ref}.pdf`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url), 10000);

      if (btn) { btn.disabled=false; btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> PDF \u2713`; }
    } catch(e) {
      console.error('[Label] PDF:', e);
      if (btn) { btn.disabled=false; btn.innerHTML='\u26a0 Erreur \u2014 r\xe9essayer'; }
      alert('Erreur PDF\u00a0: '+e.message);
    }
  }

  function _printLabel() {
    const a6 = document.getElementById('lbl-a6');
    if (!a6) return;
    const pw = window.open('', '_blank', 'width=700,height=560');
    if (!pw) { alert('Autorisez les popups pour imprimer.'); return; }
    /* Clone and bake QR canvas → <img> so it survives serialization */
    const clone = a6.cloneNode(true);
    const origCanvas = a6.querySelector('#lbl-qr-el canvas');
    const cloneQrEl  = clone.querySelector('#lbl-qr-el');
    if (origCanvas && cloneQrEl) {
      try {
        const img = document.createElement('img');
        img.src = origCanvas.toDataURL();
        img.style.cssText = 'width:108px;height:108px;display:block;image-rendering:pixelated';
        cloneQrEl.innerHTML = '';
        cloneQrEl.appendChild(img);
      } catch(e) {}
    }
    pw.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>\u00c9tiquette exp\u00e9dition</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;font-family:'Poppins',Arial,sans-serif}
#lbl-a6{width:148mm;height:105mm;background:#fff;font-family:'Poppins',sans-serif;overflow:hidden;padding:5mm;box-sizing:border-box;color:#374151}
#lbl-frame{width:100%;height:100%;border:1.5px solid #94a3b8;border-radius:6px;overflow:hidden;display:grid;grid-template-columns:190px 1fr;grid-template-rows:auto 1fr auto}
.la-top{grid-column:1/-1;display:flex;align-items:center;border-bottom:1.5px solid #94a3b8;height:50px}
.la-logo-cell{width:190px;flex-shrink:0;padding:0 16px;display:flex;align-items:center;border-right:1.5px solid #94a3b8;height:100%}
.la-logo-svg{height:20px;width:auto;display:block}
.la-ref-cell{flex:1;padding:0 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.la-ref-val{font-size:20px;font-weight:900;font-family:'Courier New',monospace;letter-spacing:.07em;line-height:1;color:#374151}
.la-ref-meta{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}
.la-date{font-size:8px;color:#94a3b8;font-weight:500}
.la-city{font-size:9px;font-weight:700;color:#374151;letter-spacing:.02em}
.la-addr-col{grid-column:1;grid-row:2;border-right:1.5px solid #94a3b8;display:flex;flex-direction:column}
.la-addr-block{flex:1;padding:10px 14px;display:flex;flex-direction:column;gap:3px}
.la-addr-block:first-child{border-bottom:1.5px solid #cbd5e1;background:#f8fafc}
.la-addr-eyebrow{font-size:6.5px;font-weight:800;text-transform:uppercase;letter-spacing:1.1px;color:#94a3b8;margin-bottom:5px}
.la-addr-name{font-size:11.5px;font-weight:800;color:#374151;line-height:1.2;margin-bottom:2px}
.la-addr-line{font-size:9px;color:#64748b;line-height:1.5;font-weight:400}
.la-addr-tel{font-size:10px;font-weight:700;color:#374151;margin-top:2px}
.la-right{grid-column:2;grid-row:2;display:grid;grid-template-columns:148px 1fr;grid-template-rows:1fr}
.la-qr-zone{border-right:1.5px solid #94a3b8;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;gap:5px}
#lbl-qr-el{display:flex;align-items:center;justify-content:center;width:108px;height:108px;overflow:hidden;flex-shrink:0}
#lbl-qr-el img{display:block;width:108px;height:108px;image-rendering:pixelated}
.la-qr-cap{font-size:6px;color:#94a3b8;text-transform:uppercase;letter-spacing:.7px;text-align:center;font-weight:600}
.la-info-zone{padding:10px 12px;display:flex;flex-direction:column;justify-content:space-between;gap:8px}
.la-sec{font-size:6.5px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px;padding-bottom:3px;border-bottom:1px solid #e2e8f0}
.la-totals-box{display:flex;flex-direction:column;gap:3px}
.la-tr{display:flex;justify-content:space-between;font-size:9.5px;color:#64748b;font-weight:400;padding:1px 0}
.la-tr.ttc{font-size:13px;font-weight:900;color:#374151;border-top:2px solid #cbd5e1;margin-top:4px;padding-top:5px}
.la-policy{border:1px solid #e2e8f0;border-radius:3px;padding:6px 8px;margin-top:auto}
.la-policy-t{font-size:7px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.7px;margin-bottom:3px}
.la-policy-b{font-size:7px;color:#64748b;line-height:1.5;font-weight:400}
.la-foot{grid-column:1/-1;grid-row:3;border-top:1.5px solid #94a3b8;display:flex;align-items:center;padding:8px 14px 6px;gap:12px;height:50px;background:#fff}
.la-foot-web{font-size:7.5px;font-weight:600;color:#64748b;white-space:nowrap;flex-shrink:0;letter-spacing:.2px}
.la-foot-bc{flex:1;display:flex;flex-direction:column;align-items:center;min-width:0}
#lbl-barcode-svg{display:block;max-width:100%}
.la-foot-icons{display:flex;align-items:center;gap:5px;flex-shrink:0}
.la-ico-box{width:26px;height:26px;border:1px solid #cbd5e1;border-radius:3px;display:flex;align-items:center;justify-content:center;color:#475569;flex-shrink:0}
.la-ico-box svg{width:13px;height:13px;display:block}
@page{size:A6 landscape;margin:0}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
${clone.outerHTML}
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
</body></html>`);
    pw.document.close();
  }

  function openQuoteInvoice(id) {
    const q = _quotes.find(x => x.id === id)
           || (window._jsonQuotes||[]).find(x => x.id === id);
    if (!q) return;
    const p = q.payload || {};
    if (typeof INVOICE !== 'undefined') {
      INVOICE.open(p, { dbId: q.id, docType: q.status || 'devis' });
    }
  }

  /* ── Dossier de Fabrication modal ── */
  function showDF(id) {
    const ord = _orders.find(o => o.id === id);
    if (!ord) return;
    const p      = ord.payload || {};
    const items  = p.items || [];
    const ttc    = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const tva    = Math.round((ttc - (ord.total_ht||0))*100)/100;
    const delAmt = p.totals?.del    || 0;
    const surAmt = p.totals?.surAmt || 0;
    const sub    = p.totals?.sub    || (ord.total_ht||0) - surAmt - delAmt;
    const d      = ord.created_at
      ? _fmtDate(ord.created_at)
      : '—';
    const ta         = p.ta || {};
    const totals     = { sub, surAmt, del: delAmt, grand: ord.total_ht||0, tva, ttc };
    const cityLabel  = p.client?.ville || ord.client_ville || '';

    // Build client info from order
    const clientInfo = {
      nom:     ord.client_nom     || p.client?.nom     || '',
      tel:     ord.client_tel     || p.client?.tel     || '',
      email:   ord.client_email   || p.client?.email   || '',
      adresse: ord.client_adresse || p.client?.adresse || '',
      ville:   ord.client_ville   || p.client?.ville   || '',
    };

    const dfText = (typeof buildOrderDF === 'function')
      ? buildOrderDF(items, totals, ta.label, ta.days, ord.ref, d, cityLabel, clientInfo)
      : items.map(i => `• ${i.quantity}× ${i.prodName}${i.specs?' — '+i.specs:''}`).join('\n');

    // Deadline = order date + delay days
    let deadlineStr = '';
    if (ta.days && ord.created_at) {
      try {
        const taDaysNum = parseInt(String(ta.days).match(/\d+/)?.[0] || '0', 10);
        if (taDaysNum > 0) {
          const dl = new Date(ord.created_at);
          dl.setDate(dl.getDate() + taDaysNum);
          deadlineStr = dl.toLocaleDateString('fr-MA', {day:'2-digit', month:'2-digit', year:'numeric'});
        }
      } catch(e) { /* ignore */ }
    }

    // Build compact 2-line item list: "qty × Name" bold + all technical details inline
    const _DB = (typeof DB !== 'undefined') ? DB : {};
    const dfItemsHtml = (items||[]).map((item, idx) => {
      const s = item.snap || {};
      const parts = _buildItemSnap(s);
      const noteHtml = item.notes && item.notes.trim()
        ? `<div style="margin-top:.15rem;font-size:.62rem;color:#b45309;font-style:italic;display:flex;align-items:center;gap:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${item.notes}</div>` : '';
      return `<li style="padding:.5rem 0;border-bottom:1px solid #e8edf3;page-break-inside:avoid">
        <div style="font-size:.75rem;font-weight:700;color:#0f172a;line-height:1.3">
          ${(item.quantity||0).toLocaleString('fr-FR')} × ${item.prodName}
        </div>
        ${parts.length ? `<div style="font-size:.63rem;color:#475569;margin-top:.15rem;line-height:1.45">${parts.join(' · ')}</div>` : ''}
        ${noteHtml}
      </li>`;
    }).join('');

    // Build bullet-format clipboard text
    const dfBulletLines = [
      `${ord.ref}${clientInfo.nom ? ' — ' + clientInfo.nom : ''}${clientInfo.tel ? ' — ' + clientInfo.tel : ''} — ${d}`,
      ta.label ? `Délai : ${ta.label}${ta.days ? ' (' + ta.days + ')' : ''}${deadlineStr ? ' -> ' + deadlineStr : ''}` : '',
      '',
      ...(items||[]).map(item => {
        const parts = _buildItemSnap(item.snap || {});
        const detLine = parts.join(' · ');
        return `• ${(item.quantity||0).toLocaleString('fr-FR')} x ${item.prodName}${detLine ? '\n  ' + detLine : ''}${item.notes ? '\n  [!] ' + item.notes : ''}`;
      }),
      '',
      delAmt > 0 ? `Livraison${cityLabel ? ' -> ' + cityLabel : ''}` : 'Retrait boutique',
    ].filter(l => l !== null).join('\n').trim();

    // Build A5 print copy HTML (used twice) — portrait 148×210mm, no prices
    const _dfA5Copy = () => {
      const briefRef3 = (items||[]).reduce((acc, i) => acc || i.snap?.brief_ref || null, null);
      return `
      <div class="df-a5">
        <div class="df-a5-head">
          <div class="df-a5-head-l">
            <div class="df-a5-head-title">Dossier de<br>Fabrication</div>
            <div class="df-a5-head-ordref">Ordre&nbsp;<strong>${ord.ref}</strong></div>
            ${briefRef3 ? `<div class="df-a5-head-brief"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="7" height="7"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Brief&nbsp;${briefRef3}</div>` : ''}
            <div class="df-a5-head-date">${d}</div>
          </div>
          <div class="df-a5-head-r">
            <div class="df-a5-head-rlabel">Client</div>
            ${clientInfo.nom   ? `<div class="df-a5-cl nom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${clientInfo.nom}</div>` : ''}
            ${clientInfo.tel   ? `<div class="df-a5-cl dim"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5a19.79 19.79 0 01-.1-.86 2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>${clientInfo.tel}</div>` : ''}
            ${clientInfo.email ? `<div class="df-a5-cl dim"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${clientInfo.email}</div>` : ''}
            ${(clientInfo.adresse || clientInfo.ville) ? `<div class="df-a5-cl dim"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${[clientInfo.adresse, clientInfo.ville].filter(Boolean).join(', ')}</div>` : ''}
          </div>
        </div>
        <div class="df-a5-divider"></div>
        <ul class="df-a5-items">
          ${(items||[]).map(item => {
            const s3 = item.snap || {};
            const p3 = _buildItemSnap(s3);
            return `<li>
              <div class="df-a5-item-hd">${(item.quantity||0).toLocaleString('fr-FR')} × ${item.prodName}</div>
              ${p3.length ? `<div class="df-a5-item-det">${p3.join(' · ')}</div>` : ''}
              ${item.notes ? `<div class="df-a5-item-note" style="display:flex;align-items:center;gap:3px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="8" height="8" style="flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${item.notes}</div>` : ''}
            </li>`;
          }).join('')}
        </ul>
        <div class="df-a5-footer">
          <div class="df-a5-del">${delAmt > 0
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison${cityLabel ? ' \u2192 ' + cityLabel : ''}`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="9" height="9"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Retrait boutique`
          }</div>
          ${ta.label ? `<div class="df-a5-delai-foot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="8" height="8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${ta.label}${ta.days ? ' · ' + ta.days : ''}${deadlineStr ? ' \u2192 ' + deadlineStr : ''}</div>` : ''}
        </div>
      </div>`;
    };

    document.getElementById('dfModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'dfModal';
    modal.innerHTML = `
<div id="df-box">
  <div id="df-tb">
    <div id="df-tb-l">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      DF · ${ord.ref}
    </div>
    <div style="display:flex;gap:.3rem">
      <button class="df-m-btn p" id="df-copy-btn" onclick="(function(btn){
        var txt = document.getElementById('dfBulletText').value;
        navigator.clipboard.writeText(txt).then(function(){
          btn.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2.5\\' width=\\'11\\' height=\\'11\\'><polyline points=\\'20 6 9 17 4 12\\'/></svg> Copié';
          setTimeout(function(){btn.innerHTML='<svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' width=\\'11\\' height=\\'11\\'><rect x=\\'9\\' y=\\'9\\' width=\\'13\\' height=\\'13\\' rx=\\'2\\'/><path d=\\'M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1\\'/></svg> Copier';},2200);
        }).catch(function(){
          var ta=document.createElement('textarea');ta.value=txt;
          ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);
          ta.select();document.execCommand('copy');document.body.removeChild(ta);
          btn.textContent='✓ Copié';setTimeout(function(){btn.textContent='Copier';},2200);
        });
      })(this)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
          <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copier
      </button>
      <button class="df-m-btn" onclick="DASHBOARD._printDF()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Imprimer
      </button>
      <button class="df-m-btn" onclick="document.getElementById('dfModal').remove()">✕</button>
    </div>
  </div>
  <textarea id="dfBulletText" class="hidden">${dfBulletLines.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
  <div id="df-body">
    <div id="df-meta">
      <div id="df-meta-l">
        <div><strong>${ord.ref}</strong> · ${d}</div>
        ${(clientInfo.nom || clientInfo.tel || clientInfo.email) ? `<div style="display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.3rem;align-items:center;font-size:.63rem;color:#374151">
          ${clientInfo.nom   ? `<span style="display:flex;align-items:center;gap:3px;font-weight:600"><svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" width="10" height="10"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${clientInfo.nom}</span>` : ''}
          ${clientInfo.tel   ? `<span style="display:flex;align-items:center;gap:3px"><svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" width="10" height="10"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5a19.79 19.79 0 01-.1-.86 2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>${clientInfo.tel}</span>` : ''}
          ${clientInfo.email ? `<span style="display:flex;align-items:center;gap:3px"><svg viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" width="10" height="10"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${clientInfo.email}</span>` : ''}
        </div>` : ''}
      </div>
      <div id="df-meta-r">
        ${ta.label||''}${ta.days ? `<span style="color:#64748b"> (${ta.days})</span>` : ''}
        ${deadlineStr ? `<div class="dl">→ ${deadlineStr}</div>` : ''}
      </div>
    </div>
    <ul>${dfItemsHtml}</ul>
    <div style="margin-top:.75rem;padding:.4rem .6rem;background:#f8fafc;border:1px solid #e4e9f0;
      border-radius:6px;font-size:.65rem;color:#6b7280">
      ${delAmt > 0
        ? `<span class="d-iflex-g5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison${cityLabel ? ' \u2192 ' + cityLabel : ''}</span>`
        : `<span class="d-iflex-g5"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Retrait boutique</span>`
      }
    </div>
  </div>
</div>
<!-- Print layout: 2× A5 portrait, side by side on A4 landscape -->
<div id="df-print-a4">
  ${_dfA5Copy()}
  <div class="df-a5-sep"></div>
  ${_dfA5Copy()}
</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  function _printDF() {
    const a4 = document.getElementById('df-print-a4');
    if (!a4) return;
    const pw = window.open('', '_blank', 'width=950,height=720');
    if (!pw) { alert('Autorisez les popups pour imprimer.'); return; }
    pw.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Dossier de Fabrication</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@100;400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;font-family:'Poppins',Arial,sans-serif}

/* ── Page wrapper ── */
#df-print-a4{display:flex;flex-direction:row;width:297mm;height:210mm;box-sizing:border-box;overflow:hidden}

/* ── Dashed separator between the 2 copies ── */
.df-a5-sep{width:1mm;height:210mm;position:relative;flex-shrink:0}
.df-a5-sep::before{content:'';position:absolute;top:8mm;bottom:8mm;left:50%;border-left:1px dashed #d1d5db}

/* ── Each A5 copy ── */
.df-a5{width:148mm;height:210mm;box-sizing:border-box;padding:9mm 9mm 8mm;
  display:flex;flex-direction:column;overflow:hidden;
  font-family:'Poppins',Arial,sans-serif;background:#fff}

/* ── Header block — exact structure from style.css, light colors ── */
.df-a5-head{display:flex;background:#f1f5f9;border-radius:2mm;flex-shrink:0}
.df-a5-head-l{flex:1;padding:5mm 4mm 5mm 5mm;display:flex;flex-direction:column;justify-content:center}
.df-a5-head-title{font-size:18pt;font-weight:100;color:#0f172a;line-height:1;
  letter-spacing:-.01em;margin-bottom:3.5mm;font-family:'Poppins',Arial,sans-serif}
.df-a5-head-ordref{font-size:7.5pt;color:#64748b;margin-bottom:1mm;
  display:flex;align-items:center;gap:2mm}
.df-a5-head-ordref strong{color:#0f172a;font-family:'Courier New',monospace;font-weight:700;letter-spacing:.04em}
.df-a5-head-brief{font-size:6pt;color:#7c3aed;background:rgba(124,58,237,.1);
  border:1px solid rgba(124,58,237,.3);border-radius:2pt;padding:.5mm 2mm;
  display:inline-flex;align-items:center;gap:1.5mm;margin-bottom:1mm;
  font-family:'Courier New',monospace;font-weight:700;letter-spacing:.04em;width:fit-content}
.df-a5-head-date{font-size:6.5pt;color:#94a3b8;margin-top:1mm}
.df-a5-head-r{padding:5mm 5mm 5mm 4mm;display:flex;flex-direction:column;
  justify-content:center;gap:2mm;min-width:52mm}
.df-a5-head-rlabel{font-size:6pt;font-weight:700;text-transform:uppercase;
  letter-spacing:.1em;color:#64748b;margin-bottom:1mm}
.df-a5-cl{display:flex;align-items:center;gap:2mm;line-height:1.2}
.df-a5-cl.nom{font-size:8pt;font-weight:700;color:#0f172a}
.df-a5-cl.dim{font-size:7pt;color:#64748b}
.df-a5-cl svg{flex-shrink:0;opacity:.5}

/* ── Items list ── */
.df-a5-divider{display:none}
.df-a5-items{list-style:none;margin:0;padding:3.5mm 0 0;flex:1;overflow:hidden}
.df-a5-items li{padding:2.5mm 0;border-bottom:1px solid #f3f4f6}
.df-a5-items li:last-child{border-bottom:none}
.df-a5-item-hd{font-size:9pt;font-weight:700;color:#111827;line-height:1.25}
.df-a5-item-det{font-size:6.5pt;color:#6b7280;margin-top:.6mm;line-height:1.5}
.df-a5-item-note{font-size:6pt;color:#b45309;font-style:italic;margin-top:.5mm;
  display:flex;align-items:center;gap:2mm}

/* ── Footer ── */
.df-a5-footer{padding:3mm 0 0;border-top:1px solid #e5e7eb;
  display:flex;align-items:center;gap:4mm;flex-shrink:0;margin-top:auto}
.df-a5-del{font-size:6.5pt;color:#374151;display:flex;align-items:center;gap:1.5mm;flex-shrink:0}
.df-a5-delai-foot{font-size:6.5pt;color:#374151;font-weight:600;
  display:flex;align-items:center;gap:1.5mm;flex:1}
.df-a5-brand{font-size:5.5pt;color:#d1d5db;letter-spacing:.04em;white-space:nowrap;margin-left:auto}

@page{size:A4 landscape;margin:0}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style></head><body>
${a4.outerHTML}
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};<\/script>
</body></html>`);
    pw.document.close();
  }


  /* ════════════════════════════════════════════════════════
     BRIEFS TAB — kote_briefs table renderer
  ════════════════════════════════════════════════════════ */
  const BRIEF_STATUS = {
    nouveau:     { label: 'En validation', color: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe' },
    en_cours:    { label: 'En cours',      color: '#2563eb', bg: '#eff6ff', bd: '#bfdbfe' },
    traite:      { label: 'Terminé',       color: '#059669', bg: '#ecfdf5', bd: '#a7f3d0' },
    annule:      { label: 'Annulé',        color: '#dc2626', bg: '#fef2f2', bd: '#fecaca' },
  };

  function _briefsHTML() {
    // Update count badge
    const bbc = $('dashBrfCount');
    if (bbc) bbc.textContent = _briefs.length || '';

    if (!_briefs.length) return _emptyHTML(
      '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
      'Aucun brief reçu', 'Les briefs de conception apparaîtront ici');

    const sq = _searchQuery;
    const filtered = sq
      ? _briefs.filter(b =>
          (b.ref||'').toLowerCase().includes(sq) ||
          (b.brand_name||'').toLowerCase().includes(sq) ||
          (b.client_name||'').toLowerCase().includes(sq) ||
          (b.client_tel||'').includes(sq) ||
          (b.product_id||'').toLowerCase().includes(sq))
      : _briefs;

    if (sq && !filtered.length) return _emptyHTML(
      '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
      `Aucun brief pour « ${sq} »`);

    return filtered.map(b => _buildBriefCard(b)).join('');
  }

  /* ════════════════════════════════════════════════════════
     _buildBriefSections — shared renderer used by card + modal + print
     Returns { sectionsHTML, specChips, deadlineLabel, deadlineColor,
               contactTel, contactEmail, contactNom, plainText }
  ════════════════════════════════════════════════════════ */
  function _buildBriefSections(b) {
    const d   = b.payload || {};

    // Client contact — brief fields → payload → linked order
    const linkedOrder  = b.order_ref ? _orders.find(o => o.ref === b.order_ref) : null;
    const contactNom   = b.client_name  || d.client_name  || linkedOrder?.client_nom   || '';
    const contactTel   = b.client_tel   || d.client_tel   || linkedOrder?.client_tel   || '';
    const contactEmail = b.client_email || d.client_email || linkedOrder?.client_email || '';

    // Spec chips — brief payload fields
    const specChips = [];
    if (d.sizeObj?.label || d.size_label) specChips.push(d.sizeObj?.label || d.size_label);
    if (d.pages)       specChips.push(d.pages + ' pages');
    if (d.sides)       specChips.push(d.sides === 'double' ? 'Recto-Verso' : 'Recto');
    if (d.fold)        specChips.push(d.fold);
    const _paperLbl = d.paperObj?.label || d.paper || null;
    if (_paperLbl)     specChips.push(_paperLbl + (d.paperObj?.gram ? ' ' + d.paperObj.gram + 'g' : ''));
    if (d.lamination)  specChips.push(d.lamination);
    if (d.finish)      specChips.push(Array.isArray(d.finish) ? d.finish.join(', ') : d.finish);
    if (d.binding)     specChips.push(d.binding);
    if (d.quantity)    specChips.push(d.quantity.toLocaleString('fr-FR') + ' ex.');

    // Deadline
    const deadlineLabel = DEADLINE_MAP[d.deadline]   || d.deadline   || '';
    const deadlineColor = DEADLINE_COLOR[d.deadline] || '#94a3b8';

    // Content fields
    const contentFields = _cFields(d);

    /* ── Section builder helpers ── */
    const _row = _bRow;
    const _sec = _bSec;

    /* ── Identity ── */
    const identityHTML = [
      _row('Marque',   b.brand_name || d.brand_name),
      _row('Site',     d.website ? `<a href="${d.website}" target="_blank" style="color:#2563eb;text-decoration:none">${d.website}</a>` : ''),
      _row('Couleurs', d.brand_colors),
      d.has_logo   !== undefined ? _row('Logo',   d.has_logo   ? '✓ Vectoriel disponible' : '✗ Non disponible') : '',
      d.has_charte !== undefined ? _row('Charte', d.has_charte ? '✓ Disponible'           : '✗ Non disponible') : '',
    ].join('');

    /* ── Content ── */
    const contentHTML = contentFields.map(v =>
      `<div class="brf-content-blk">${v}</div>`
    ).join('');

    /* ── Visual ── */
    const visualHTML = [
      _row('Style',      _jn(d.visual_style)),
      _row('Ton',        _jn(d.visual_tone)),
      _row('Références', d.visual_refs),
      _row('À éviter',   d.avoid),
    ].join('');

    /* ── Contact ── */
    const contactHTML = [
      _row('Nom',   contactNom),
      _row('Tél',   contactTel),
      _row('Email', contactEmail),
      deadlineLabel ? _row('Délai', `<span style="color:${deadlineColor};font-weight:700">${deadlineLabel}</span>`) : '',
    ].join('');

    /* ── Notes ── */
    const notesHTML = d.notes
      ? `<div style="font-size:.72rem;color:#374151;line-height:1.65;white-space:pre-wrap">${d.notes}</div>`
      : '';

    /* ── Order items — only items that require design work ── */
    const ordItems = linkedOrder?.payload?.items || [];
    const printItems = ordItems.filter(i => i.snap?.designOption === 'service' || i.snap?.type === 'brief');
    const ordItemsHTML = printItems.length
      ? printItems.map(i => [
          _row('Produit',         i.prodName || '—'),
          i.specs    ? _row('Spécifications', i.specs.replace(/📋\s*Brief fourni|Brief fourni/, '<span class="pu-inline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" class="vam-mr2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></svg>Brief fourni</span>')) : '',
          i.quantity ? _row('Quantité', i.quantity.toLocaleString('fr-FR') + ' ex.') : '',
        ].join('')).join('<div style="border-top:1.5px dashed #f1f5f9;margin:.35rem 0"></div>')
      : '';

    /* ── Spécifications produit ── */
    const _paperLblSpec = d.paperObj?.label || d.paper || null;
    const _paperSpec    = _paperLblSpec ? (_paperLblSpec + (d.paperObj?.gram ? ' ' + d.paperObj.gram + ' g/m²' : '')) : null;
    const _prodLabel    = d.product_label || (ordItems.find(i => i.snap?.type !== 'brief' && i.snap?.designOption !== 'service')?.prodName) || b.product_id || null;
    const specsHTML = [
      _row('Produit',    _prodLabel),
      _row('Format',     d.sizeObj?.label ? (d.sizeObj.label + (d.sizeObj.dims ? ' — ' + d.sizeObj.dims : '')) : (d.size_label || null)),
      (d.gfW && d.gfH) ? _row('Dimensions', d.gfW + ' × ' + d.gfH + ' cm') : '',
      _row('Impression', d.sides ? (d.sides === 'double' ? 'Recto-Verso' : 'Recto') : null),
      _row('Pages',      d.pages ? d.pages + ' pages' : null),
      _row('Pliage',     d.fold   || null),
      _row('Support',    _paperSpec),
      _row('Pelliculage',d.lamination || null),
      _row('Finition',   d.finish ? (Array.isArray(d.finish) ? d.finish.join(', ') : d.finish) : null),
      _row('Reliure',    d.binding || null),
      _row('Quantité',   d.quantity ? d.quantity.toLocaleString('fr-FR') + ' ex.' : null),
      _row('Niveau',     TIER_LABELS[b.design_tier || d.designTier || ''] || (b.design_tier || d.designTier || null)),
    ].join('');

    const sectionsHTML = [
      specsHTML ? _sec('Spécifications produit', '#2563eb', specsHTML) : '',
      ordItemsHTML && !specsHTML ? _sec('Articles à concevoir', '#0891b2', ordItemsHTML) : '',
      _sec('Marque & Identité',    '#7c3aed', identityHTML),
      _sec('Contenu',              '#d97706', contentHTML),
      _sec('Direction artistique', '#059669', visualHTML),
      _sec('Contact & Délai',      '#64748b', contactHTML),
      _sec('Notes',                '#94a3b8', notesHTML),
    ].join('');

    /* ── Plain text for WA / email ── */
    const tier  = b.design_tier || d.designTier || '';
    const prod  = b.product_id  || '—';
    const brand = b.brand_name  || d.brand_name || '';
    const shop  = DB?.shop?.name || 'Kote Imprimerie';
    const date  = b.created_at
      ? new Date(b.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})
      : '—';
    const plainText = [
      `BRIEF DE CONCEPTION — ${b.ref || b.id}`,
      `Date : ${date}  |  Produit : ${prod}`,
      tier  ? `Niveau : ${tier}`  : null,
      brand ? `Marque : ${brand}` : null,
      d.brand_colors ? `Couleurs : ${d.brand_colors}` : null,
      ``,
      contentFields.length ? `CONTENU\n${contentFields.join('\n')}` : null,
      (_jn(d.visual_style)||_jn(d.visual_tone)) ? `DIRECTION ARTISTIQUE\nStyle : ${_jn(d.visual_style)}\nTon : ${_jn(d.visual_tone)}` : null,
      d.visual_refs  ? `Références : ${d.visual_refs}` : null,
      d.avoid        ? `À éviter : ${d.avoid}`         : null,
      ``,
      `CONTACT`,
      contactNom   ? `Nom : ${contactNom}`   : null,
      contactTel   ? `Tél : ${contactTel}`   : null,
      contactEmail ? `Email : ${contactEmail}` : null,
      deadlineLabel ? `Délai : ${deadlineLabel}` : null,
      d.notes ? `\nNOTES\n${d.notes}` : null,
      ``,
      `— ${shop}`,
    ].filter(l => l !== null).join('\n');

    return { sectionsHTML, specChips, deadlineLabel, deadlineColor,
             contactTel, contactEmail, contactNom, plainText };
  }

  /* ════════════════════════════════════════════════════════
     _buildBriefCard — renders one accordion card
  ════════════════════════════════════════════════════════ */
  function _buildBriefCard(b) {
    const d          = b.payload || {};
    const st         = BRIEF_STATUS[b.status] || BRIEF_STATUS.nouveau;
    const date       = b.created_at
      ? new Date(b.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}) : '—';
    const prod       = b.product_id || '—';
    const brand      = b.brand_name || d.brand_name || '—';
    const tier       = b.design_tier || d.designTier || '';
    const tierLabel  = TIER_LABELS[tier] || tier;

    const { sectionsHTML, specChips, deadlineLabel, deadlineColor,
            contactTel, contactEmail, contactNom } = _buildBriefSections(b);

    // Linked order chip — clickable → switches tab to orders
    const linkedChip = b.order_ref
      ? `<span class="brf-ord-chip" title="Voir la commande ${b.order_ref}"
           onclick="event.stopPropagation();DASHBOARD.switchTab('orders')">${b.order_ref}</span>`
      : '';

    // Single chips strip — specs + tier + deadline, no duplication anywhere
    const allHdrChips = [
      ...specChips.map(c => `<span class="brf-hdr-chip">${c}</span>`),
      tierLabel     ? `<span class="brf-hdr-chip brf-hdr-chip--pu">${tierLabel}</span>` : '',
      deadlineLabel ? `<span class="brf-hdr-chip" style="color:${deadlineColor};border-color:${deadlineColor}33;background:${deadlineColor}0d">${deadlineLabel}</span>` : '',
    ].filter(Boolean).join('');

    return `
    <div class="dash-ord-card" id="dbrf-${b.id}" style="border-left:3px solid ${st.color}">

      <!-- HEADER -->
      <div class="dash-ord-hdr" onclick="DASHBOARD.toggleBrief('${b.id}')">
        <div class="dash-ord-hdr-l" style="gap:.22rem">

          <!-- Row 1: identifiers + status only -->
          <div style="display:flex;align-items:center;gap:.35rem;flex-wrap:wrap">
            ${linkedChip}
            ${b.ref ? `<span class="brf-ref">${b.ref}</span>` : ''}
            <span class="dash-st-badge" style="background:${st.bg};color:${st.color};border-color:${st.bd}">${st.label}</span>
          </div>

          <!-- Row 2: brand + product -->
          <div style="display:flex;align-items:baseline;gap:.3rem;flex-wrap:wrap">
            <span style="font-size:.8rem;font-weight:700;color:var(--pu)">${brand}</span>
            <span style="font-size:.67rem;color:var(--t2)">· ${prod}</span>
          </div>

          <!-- Row 3: contact (compact, if any) -->
          ${(contactNom||contactTel||contactEmail) ? `
          <div style="font-size:.6rem;color:var(--t3);display:flex;gap:.28rem;flex-wrap:wrap;align-items:center">
            ${contactNom   ? `<span style="font-weight:500">${contactNom}</span>` : ''}
            ${contactTel   ? `<span style="opacity:.75">· ${contactTel}</span>` : ''}
            ${contactEmail ? `<span style="opacity:.65">· ${contactEmail}</span>` : ''}
          </div>` : ''}

          <!-- Row 4: all chips — specs + tier + deadline in one strip -->
          ${allHdrChips ? `<div style="display:flex;gap:.22rem;flex-wrap:wrap;margin-top:.04rem">${allHdrChips}</div>` : ''}

        </div>
        <div class="dash-ord-hdr-r">
          <span style="font-size:.62rem;color:var(--t3)">${date}</span>
          <svg class="dash-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>

      <!-- BODY -->
      <div class="dash-ord-body">

        <!-- Status pills -->
        <div class="dash-body-section">
          <div class="dash-section-lbl">Statut</div>
          <div class="dash-action-btns">
            ${Object.entries(BRIEF_STATUS).map(([k,p]) => `
              <button class="dash-st-pill${b.status===k?' act':''}" data-status="${k}"
                style="${b.status===k ? `background:${p.bg};color:${p.color};border-color:${p.bd}` : ''}"
                onclick="DASHBOARD.setBriefStatus('${b.id}','${k}')">
                ${p.label}
              </button>`).join('')}
          </div>
        </div>

        <!-- Brief content sections (shared renderer) -->
        <div class="dash-body-section" style="padding-top:.1rem">
          ${sectionsHTML}
        </div>

        <!-- Footer — price · devis · notify client | brief PDF right -->
        <div class="dash-body-footer" style="flex-wrap:wrap;gap:.35rem;align-items:center">

          <!-- LEFT: fixer prix + devis + notify client -->
          <div style="display:flex;align-items:center;gap:.3rem;flex:1;flex-wrap:wrap">
            ${b.price_ht != null && b.price_ht > 0
              ? `<span style="display:inline-flex;align-items:center;gap:.3rem;font-size:.7rem;font-weight:700;
                   color:#059669;background:#ecfdf5;border:1.5px solid #a7f3d0;border-radius:7px;
                   padding:.22rem .55rem;white-space:nowrap">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" width="9" height="9"><polyline points="20 6 9 17 4 12"/></svg>
                   ${b.price_ht.toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2})} DH HT
                 </span>
                 <button class="dash-act-btn" style="color:#64748b;border-color:#e2e8f0"
                   onclick="event.stopPropagation();DASHBOARD._briefShowPriceInput('${b.id}')"
                   title="Modifier le prix">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                 </button>`
              : `<button class="dash-act-btn" style="color:#d97706;border-color:#fde68a;background:#fffbeb;font-weight:700"
                   id="brf-fix-btn-${b.id}"
                   onclick="event.stopPropagation();DASHBOARD._briefShowPriceInput('${b.id}')"
                   title="Fixer le prix HT de ce brief">
                   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                   Fixer le prix
                 </button>`
            }
            <span id="brf-price-inline-${b.id}" style="display:none;align-items:center;gap:.3rem">
              <input type="number" min="0" step="0.01" id="brf-price-${b.id}"
                placeholder="0.00 DH HT"
                style="border:1.5px solid #fbbf24;border-radius:6px;padding:.25rem .45rem;
                  font-size:.72rem;font-family:inherit;color:var(--t1);background:#fffbeb;
                  width:90px;box-sizing:border-box"
                onclick="event.stopPropagation()"
                onkeydown="if(event.key==='Enter'){event.preventDefault();DASHBOARD._saveBriefPrice('${b.id}');}
                           if(event.key==='Escape'){event.preventDefault();DASHBOARD._briefHidePriceInput('${b.id}');}">
              <button class="dash-act-btn" style="color:#059669;border-color:#a7f3d0;background:#ecfdf5;padding:.22rem .45rem"
                onclick="event.stopPropagation();DASHBOARD._saveBriefPrice('${b.id}')" title="Confirmer le prix">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <button class="dash-act-btn" style="color:#64748b;border-color:#e2e8f0;padding:.22rem .45rem"
                onclick="event.stopPropagation();DASHBOARD._briefHidePriceInput('${b.id}')" title="Annuler">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </span>
            ${(()=>{const priceReady=b.price_ht!=null&&b.price_ht>0;return `
            <button class="dash-act-btn dash-act-pdf${priceReady?'':' disabled'}"
              ${priceReady?`onclick="event.stopPropagation();DASHBOARD.openBriefDevis('${b.id}')"`:
                            `onclick="event.stopPropagation()" title="Fixez le prix avant de générer le devis"`}
              style="${priceReady?'':'opacity:.4;cursor:not-allowed'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Générer devis
            </button>
            <!-- Notify client: label + icon-only WA + Mail -->
            <span style="font-size:.6rem;font-weight:600;color:var(--t3);white-space:nowrap;margin-left:.1rem">Notif. client</span>
            <button class="dash-act-btn dash-act-wa brf-icon-btn${priceReady?'':' disabled'}"
              title="${priceReady?(contactTel?'WhatsApp · '+contactTel:'Pas de tél client'):'Fixez le prix d\'abord'}"
              ${priceReady?`onclick="event.stopPropagation();DASHBOARD.setPriceAndNotifyWA('${b.id}')"`:`onclick="event.stopPropagation()"`}
              style="${priceReady?'':'opacity:.4;cursor:not-allowed'}">
              ${IC.whatsapp}
            </button>
            <button class="dash-act-btn dash-act-mail brf-icon-btn${(priceReady&&contactEmail)?'':' disabled'}"
              title="${priceReady?(contactEmail?'Email · '+contactEmail:'Pas d\'email client'):'Fixez le prix d\'abord'}"
              ${(priceReady&&contactEmail)?`onclick="event.stopPropagation();DASHBOARD.setPriceAndNotifyEmail('${b.id}')"`:`onclick="event.stopPropagation()"`}
              style="${(priceReady&&contactEmail)?'':'opacity:.4;cursor:not-allowed'}">
              ${IC.mail}
            </button>`;})()}
          </div>

          <!-- RIGHT: Brief PDF -->
          <button class="dash-act-btn" style="color:#7c3aed;border-color:#ddd6fe;background:#f5f3ff;margin-left:auto;flex-shrink:0"
            onclick="event.stopPropagation();DASHBOARD._briefCreaPDF('${b.id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            Brief PDF
          </button>

        </div>

      </div>
    </div>`;
  }

  /* ════════════════════════════════════════════════════════
     _briefShowPriceInput / _briefHidePriceInput — inline price entry
  ════════════════════════════════════════════════════════ */
  function _briefShowPriceInput(id) {
    const wrap = document.getElementById('brf-price-inline-' + id);
    if (!wrap) return;
    wrap.style.display = 'inline-flex';
    const inp = document.getElementById('brf-price-' + id);
    if (inp) {
      const brief = _briefs.find(b => b.id === id);
      if (brief?.price_ht != null) inp.value = brief.price_ht;
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    }
    // Hide the "Fixer le prix" or price badge buttons to avoid clutter
    const fixBtn = document.getElementById('brf-fix-btn-' + id);
    if (fixBtn) fixBtn.style.display = 'none';
  }

  function _briefHidePriceInput(id) {
    const wrap = document.getElementById('brf-price-inline-' + id);
    if (wrap) wrap.style.display = 'none';
    const fixBtn = document.getElementById('brf-fix-btn-' + id);
    if (fixBtn) fixBtn.style.display = '';
  }

  /* ════════════════════════════════════════════════════════
     _saveBriefPrice — PATCH Supabase + update _briefs[] + re-render card
  ════════════════════════════════════════════════════════ */
  async function _saveBriefPrice(id) {
    const brief = _briefs.find(b => b.id === id);
    if (!brief) return;

    const inp      = document.getElementById('brf-price-' + id);
    const priceVal = inp ? parseFloat(inp.value) : NaN;
    if (isNaN(priceVal) || priceVal <= 0) {
      alert('Saisissez un prix HT valide (> 0) avant de confirmer.');
      inp?.focus();
      return;
    }

    /* ── 1. PATCH kote_briefs — use return=representation to verify ── */
    try {
      const res = await fetch(`${window.SUPABASE_URL}/rest/v1/kote_briefs?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey':        window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation',
        },
        body: JSON.stringify({ price_ht: priceVal, status: 'en_cours' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${await res.text()}`);
      const rows = await res.json();
      if (!rows || !rows.length) throw new Error('Aucune ligne mise à jour — vérifiez les permissions RLS.');
      /* Sync local array from DB response */
      brief.price_ht = rows[0].price_ht ?? priceVal;
      brief.status   = rows[0].status   ?? 'en_cours';
      console.log('[_saveBriefPrice] brief patched OK — price_ht:', brief.price_ht);
    } catch(e) {
      alert('Erreur mise à jour brief : ' + e.message);
      return;
    }

    /* ── 2. Update linked order payload ── */
    if (brief.order_ref) {
      const order = _orders.find(o => o.ref === brief.order_ref);
      if (order) {
        const payload = JSON.parse(JSON.stringify(order.payload || {}));
        const items   = payload.items || [];
        const idx = items.findIndex(i =>
          (i.snap?.type === 'brief'  && i.snap?.brief_ref === brief.ref) ||
          (i.snap?.designOption === 'service' && i.snap?.brief_ref === brief.ref)
        );
        if (idx >= 0) {
          items[idx].baseTotal = priceVal;
          items[idx].perUnit   = priceVal;
          items[idx].quantity  = items[idx].quantity || 1;
        } else {
          const tier      = brief.design_tier || (brief.payload||{}).designTier || '';
          const tierLabel = TIER_LABELS[tier] || tier;
          items.push({
            prodName:  `Conception graphique — ${brief.product_id || 'Graphique'}`,
            specs:     [tierLabel, brief.ref].filter(Boolean).join(' · '),
            notes:     '',
            quantity:  1,
            perUnit:   priceVal,
            baseTotal: priceVal,
            snap:      { type:'brief', brief_ref: brief.ref, designTier: tier },
          });
        }
        const delAmt     = payload.totals?.del   || 0;
        const surAmt     = payload.totals?.surAmt || 0;
        const itemsTotal = items.reduce((s, i) => s + (i.baseTotal || 0), 0);
        payload.items    = items;
        payload.totals   = { ...payload.totals, grand: itemsTotal + delAmt + surAmt };
        try {
          const newTtc = Math.round((itemsTotal + delAmt + surAmt) * 1.20 * 100) / 100;
          await _patch('kote_orders', order.id, {
            payload,
            total_ht:  itemsTotal + delAmt + surAmt,
            total_ttc: newTtc,
          });
          order.payload   = payload;
          order.total_ht  = itemsTotal + delAmt + surAmt;
          order.total_ttc = newTtc;
          console.log('[_saveBriefPrice] order patched OK — total_ht:', order.total_ht, 'total_ttc:', order.total_ttc);
          /* Re-render the order card in-place if it exists in the DOM */
          _rerenderOrderCard(order);
        } catch(e) {
          console.warn('[DASHBOARD] order patch failed:', e);
        }
      }
    }

    /* ── 3. Re-render brief card from updated local value ── */
    const card = document.getElementById('dbrf-' + id);
    if (card) {
      const wasOpen = card.classList.contains('open');
      card.outerHTML = _buildBriefCard(brief);
      const newCard = document.getElementById('dbrf-' + id);
      if (newCard && wasOpen) newCard.classList.add('open');
    }
  }

  /* ── Re-render a single order card in-place (after brief price update) ── */
  function _rerenderOrderCard(order) {
    const card = document.getElementById('dord-' + order.id);
    if (!card) return;
    const wasOpen = card.classList.contains('open');
    const tmp = document.createElement('div');
    tmp.innerHTML = _buildOrderCards([order]);
    const newCard = tmp.firstElementChild;
    if (newCard) {
      if (wasOpen) newCard.classList.add('open');
      card.replaceWith(newCard);
    }
  }

  /* ════════════════════════════════════════════════════════
     VALIDÉ TOGGLE — kept for backwards compat (calls _saveBriefPrice)
  ════════════════════════════════════════════════════════ */
  async function validateBriefPrice(id) {
    /* Backwards-compat wrapper — delegates to the new flow */
    return _saveBriefPrice(id);
  }

  /* ════════════════════════════════════════════════════════
     CREA PDF — A4 preview panel + html2canvas→jsPDF export
  ════════════════════════════════════════════════════════ */
  function _briefCreaPDF(id) {
    const b = _briefs.find(x => x.id === id);
    if (!b) return;

    const d         = b.payload || {};
    const prod      = b.product_id || 'Conception graphique';
    const brand     = b.brand_name || d.brand_name || '';
    const ref       = b.ref || b.id;
    const tier      = b.design_tier || d.designTier || '';
    const tierLabel = TIER_LABELS[tier] || tier;
    const date      = b.created_at
      ? new Date(b.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '—';
    const shop      = DB?.shop?.name || DB?.contact?.name || 'Kote';

    const deadlineLabel = DEADLINE_MAP[d.deadline] || d.deadline || '';
    const deadlineColor = DEADLINE_COLOR[d.deadline] || '#94a3b8';

    const linkedOrder  = b.order_ref ? _orders.find(o => o.ref === b.order_ref) : null;
    const contactNom   = b.client_name  || d.client_name  || linkedOrder?.client_nom   || '';
    const contactTel   = b.client_tel   || d.client_tel   || linkedOrder?.client_tel   || '';
    const contactEmail = b.client_email || d.client_email || linkedOrder?.client_email || '';
    const cleanPhone   = contactTel.replace(/\D/g,'');

    const _paperLblSpec = d.paperObj?.label || d.paper || null;
    const _paperSpec    = _paperLblSpec ? _paperLblSpec + (d.paperObj?.gram ? ' ' + d.paperObj.gram + 'g' : '') : null;

    /* ── Left column helpers ── */
    const _lr = (l, v, col) => v
      ? `<div style="padding:4px 0;border-bottom:1px solid #f1f5f9">
           <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:2px">${l}</div>
           <div style="font-size:10px;color:${col||'#374151'};line-height:1.35;word-break:break-word">${v}</div>
         </div>` : '';

    const _lsec = (title, rows) => {
      const inner = rows.filter(Boolean).join('');
      if (!inner) return '';
      return `<div style="margin-bottom:14px">
        <div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#cbd5e1;padding-bottom:3px;border-bottom:1px solid #e2e8f0;margin-bottom:3px">${title}</div>
        ${inner}
      </div>`;
    };

    const leftHTML = `
      ${_lsec('Identifiants', [
        _lr('Réf. brief', `<span style="font-family:'Courier New',monospace;font-weight:700;font-size:9.5px">${ref}</span>`),
        b.order_ref ? _lr('Commande', `<span style="font-family:'Courier New',monospace;color:#0891b2;font-size:9.5px">${b.order_ref}</span>`) : '',
        _lr('Date', date),
      ])}
      ${(tierLabel || deadlineLabel) ? `<div style="margin-bottom:14px">
        <div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#cbd5e1;padding-bottom:3px;border-bottom:1px solid #e2e8f0;margin-bottom:6px">Statut</div>
        <div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center">
          ${tierLabel ? `<span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:99px;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe">${tierLabel}</span>` : ''}
          ${deadlineLabel ? `<div style="font-size:10px;font-weight:700;color:${deadlineColor};width:100%;margin-top:5px">${deadlineLabel}</div>` : ''}
        </div>
      </div>` : ''}
      ${_lsec('Spécifications', [
        _lr('Produit',    prod),
        d.sizeObj?.label ? _lr('Format',    d.sizeObj.label+(d.sizeObj.dims?' · '+d.sizeObj.dims:'')) : '',
        (d.gfW&&d.gfH)   ? _lr('Dimensions',d.gfW+' × '+d.gfH+' cm') : '',
        d.sides           ? _lr('Impression',d.sides==='double'?'Recto-Verso':'Recto') : '',
        d.pages           ? _lr('Pages',     d.pages+' p.') : '',
        d.fold            ? _lr('Pliage',    d.fold) : '',
        _paperSpec        ? _lr('Support',   _paperSpec) : '',
        d.lamination      ? _lr('Pellicul.', d.lamination) : '',
        d.finish          ? _lr('Finition',  Array.isArray(d.finish)?d.finish.join(', '):d.finish) : '',
        d.binding         ? _lr('Reliure',   d.binding) : '',
        d.quantity        ? _lr('Quantité',  d.quantity.toLocaleString('fr-FR')+' ex.') : '',
      ])}
      ${(contactNom||contactTel||contactEmail) ? `<div style="margin-top:auto;padding-top:2px">
        <div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#cbd5e1;padding-bottom:3px;border-bottom:1px solid #e2e8f0;margin-bottom:3px">Client</div>
        ${_lr('Nom',   contactNom,   '#1e293b')}
        ${_lr('Tél',   contactTel)}
        ${_lr('Email', contactEmail)}
        ${cleanPhone ? `<div id="bcp-qr-zone" style="display:flex;flex-direction:column;align-items:center;gap:5px;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9">
          <div style="width:72px;height:72px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;display:flex;align-items:center;justify-content:center">
            <span style="font-size:7px;color:#cbd5e1;text-align:center;line-height:1.5">QR<br>WA</span>
          </div>
          <div style="font-size:7.5px;color:#94a3b8">WhatsApp</div>
        </div>` : ''}
      </div>` : ''}
    `;

    /* ── Right column (no specs section) ── */
    const _rrow = _bRow;
    const _rsec = _bSec;

    const _chk = ok => ok
      ? `<svg viewBox="0 0 12 12" fill="none" stroke="#059669" stroke-width="2" style="width:10px;height:10px;flex-shrink:0;margin-right:3px"><polyline points="1.5 6 4.5 9 10.5 3"/></svg>`
      : `<svg viewBox="0 0 12 12" fill="none" stroke="#dc2626" stroke-width="2" style="width:10px;height:10px;flex-shrink:0;margin-right:3px"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>`;

    const identInner = [
      _rrow('Marque',   b.brand_name || d.brand_name),
      _rrow('Site',     d.website),
      _rrow('Couleurs', d.brand_colors),
      d.has_logo   !== undefined ? _rrow('Logo',   `<span class="d-ifl-ci">${_chk(d.has_logo)}${d.has_logo   ? 'Vectoriel disponible' : 'Non disponible'}</span>`) : '',
      d.has_charte !== undefined ? _rrow('Charte', `<span class="d-ifl-ci">${_chk(d.has_charte)}${d.has_charte ? 'Disponible'           : 'Non disponible'}</span>`) : '',
    ].join('');

    const cFields = _cFields(d);
    const contentInner = cFields.map(v=>`<div class="brf-content-blk">${v}</div>`).join('');

    const visInner = [
      _rrow('Style',      _jn(d.visual_style)),
      _rrow('Ton',        _jn(d.visual_tone)),
      _rrow('Références', d.visual_refs),
      _rrow('À éviter',   d.avoid),
    ].join('');

    const ordItems = (linkedOrder?.payload?.items||[])
      .filter(i => i.snap?.designOption==='service' || i.snap?.type==='brief');
    const ordInner = ordItems.map(i=>[
      _rrow('Produit',  i.prodName||'—'),
      i.specs    ?_rrow('Spécs',   i.specs.replace(/📋\s*Brief fourni|Brief fourni/, '<span class="pu-inline"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10" class="vam-mr2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></svg>Brief fourni</span>')):'',
      i.quantity ?_rrow('Qté',     i.quantity.toLocaleString('fr-FR')+' ex.'):'',
    ].join('')).join('<div style="border-top:1px dashed #f1f5f9;margin:4px 0"></div>');

    const notesInner = d.notes
      ? `<div style="font-size:10px;color:#374151;line-height:1.6;white-space:pre-wrap">${d.notes}</div>` : '';

    const rightHTML = [
      `<div style="font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:#94a3b8;margin-bottom:11px;padding-bottom:5px;border-bottom:1px solid #f1f5f9">Brief créatif — Contenu pour l'équipe de conception</div>`,
      identInner   ? _rsec('Marque & Identité',    '#7c3aed', identInner)  : '',
      contentInner ? `<div class="brf-sec"><div class="brf-sec-hd" style="border-left-color:#d97706;color:#d97706">Contenu</div><div class="brf-sec-body">${contentInner}</div></div>` : '',
      visInner     ? _rsec('Direction artistique', '#059669', visInner)    : '',
      ordInner     ? _rsec('Articles à concevoir',  '#0891b2', ordInner)    : '',
      notesInner   ? _rsec('Notes',                '#94a3b8', notesInner)  : '',
    ].join('');

    /* ── Build modal ── */
    document.getElementById('brfCreaModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'brfCreaModal';
    modal.innerHTML = `

<div id="bcp-panel">

  <!-- SIDEBAR -->
  <div id="bcp-sb">
    <div id="bcp-sb-hd">
      <div id="bcp-sb-ico">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      </div>
      <div class="bcp-sb-t"><b>Brief créatif — PDF</b><span>Aperçu A4 · export créa</span></div>
      <button class="bcp-x" onclick="document.getElementById('brfCreaModal').remove()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div id="bcp-sb-body">
      ${brand ? `<div class="bcp-sm"><div class="bcp-sm-l">Marque</div><div class="bcp-sm-v" style="font-weight:700;color:#1e293b">${brand}</div></div>` : ''}
      <div class="bcp-sm"><div class="bcp-sm-l">Produit</div><div class="bcp-sm-v">${prod}</div></div>
      ${ref ? `<div class="bcp-sm"><div class="bcp-sm-l">Réf. brief</div><div class="bcp-sm-mono">${ref}</div></div>` : ''}
      ${b.order_ref ? `<div class="bcp-sm"><div class="bcp-sm-l">Commande</div><div class="bcp-sm-mono" style="color:#0891b2">${b.order_ref}</div></div>` : ''}
      ${(contactNom||contactTel) ? `<div class="bcp-sm"><div class="bcp-sm-l">Client</div>
        <div style="font-size:10.5px;color:#374151;margin-top:2px">
          ${contactNom ? `<div style="font-weight:600">${contactNom}</div>` : ''}
          ${contactTel ? `<div style="color:#64748b">${contactTel}</div>` : ''}
        </div></div>` : ''}
      ${deadlineLabel ? `<div class="bcp-sm"><div class="bcp-sm-l">Délai</div><div style="font-size:11px;font-weight:700;color:${deadlineColor};margin-top:2px">${deadlineLabel}</div></div>` : ''}
    </div>
    <div id="bcp-sb-ft">
      <div id="bcp-tray">
        <div class="bcp-tray-lbl">Partager avec l'équipe créa</div>
        <div class="bcp-tray-row">
          <a id="bcp-tr-dl" class="bcp-tr bcp-tr-dl bcp-tr-dis" href="#" download="">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="2" x2="12" y2="16"/></svg>PDF
          </a>
          <a id="bcp-tr-wa" class="bcp-tr bcp-tr-wa bcp-tr-dis" href="#" target="_blank">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>WA Créa
          </a>
          <a id="bcp-tr-ml" class="bcp-tr bcp-tr-ml bcp-tr-dis" href="#">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>Mail
          </a>
        </div>
      </div>
      <button class="bcp-gen-btn" id="bcp-gen-btn" onclick="DASHBOARD._briefCreaPDFGenerate('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Générer le PDF
      </button>
      <button class="bcp-close-btn" onclick="DASHBOARD._briefCreaPDFPrint('${id}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimer
      </button>
      <button class="bcp-close-btn" onclick="document.getElementById('brfCreaModal').remove()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Fermer
      </button>
    </div>
  </div>

  <!-- A4 PREVIEW -->
  <div id="bcp-prev">
    <div id="bcp-a4">
      <!-- 8mm inner margin wrapper (30px ≈ 8mm at 96dpi) -->
      <div style="margin:30px;flex:1;display:flex;flex-direction:column">

        <!-- HEADER -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid #e2e8f0;margin-bottom:14px;flex-shrink:0">
          <div style="min-width:0">
            <div style="font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;margin-bottom:5px">Brief de Conception Graphique</div>
            <div style="font-size:17px;font-weight:700;color:#1e293b;letter-spacing:-.02em;line-height:1.2">${prod}</div>
            ${brand ? `<div style="font-size:11px;color:#64748b;margin-top:3px">${brand}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:16px">
            ${ref ? `<div style="font-family:'Courier New',monospace;font-size:10px;font-weight:700;color:#475569;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;padding:3px 10px;display:inline-block">${ref}</div>` : ''}
            <div style="font-size:9px;color:#94a3b8;margin-top:5px">${date}</div>
            ${tierLabel ? `<div style="margin-top:5px"><span style="font-size:8.5px;font-weight:700;padding:2px 9px;border-radius:99px;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe">${tierLabel}</span></div>` : ''}
          </div>
        </div>

        <!-- BODY — 25/75 columns -->
        <div style="display:flex;flex:1;gap:0;min-height:0">

          <!-- LEFT 25% — Fiche Projet -->
          <div style="width:25%;flex-shrink:0;padding-right:14px;border-right:1px solid #e2e8f0;box-sizing:border-box;display:flex;flex-direction:column">
            ${leftHTML}
          </div>

          <!-- RIGHT 75% — Brief Créatif -->
          <div style="flex:1;min-width:0;padding-left:16px;box-sizing:border-box">
            ${rightHTML}
          </div>

        </div>

        <!-- FOOTER -->
        <div style="margin-top:16px;padding-top:7px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
          <span style="font-size:7.5px;color:#94a3b8">Généré par ${shop}</span>
          ${ref ? `<span style="font-family:'Courier New',monospace;font-size:7.5px;color:#cbd5e1">${ref}</span>` : ''}
        </div>

      </div>
    </div>
  </div>

</div>`;
    document.body.appendChild(modal);

    /* ── Async QR preview — render off-screen, extract canvas dataURL, show as img ── */
    if (cleanPhone) {
      const _ldQr = src => new Promise((res,rej) => {
        if (window.QRCode) { res(); return; }
        if (document.querySelector(`script[src="${src}"]`)) {
          let n=0; const t=setInterval(()=>{ if(window.QRCode){clearInterval(t);res();} else if(++n>40){clearInterval(t);rej();}},100);
          return;
        }
        const s=document.createElement('script'); s.src=src;
        s.onload=res; s.onerror=()=>rej(); document.head.appendChild(s);
      });
      _ldQr('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js').then(()=>{
        const zone = document.getElementById('bcp-qr-zone');
        if (!zone || !window.QRCode) return;
        try {
          const tmp = document.createElement('div');
          tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:72px;height:72px';
          document.body.appendChild(tmp);
          new window.QRCode(tmp, { text:`https://wa.me/${cleanPhone}`, width:72, height:72,
            colorDark:'#374151', colorLight:'#ffffff', correctLevel:window.QRCode?.CorrectLevel?.M||1 });
          setTimeout(() => {
            const cv = tmp.querySelector('canvas');
            const dataUrl = cv ? cv.toDataURL('image/png') : null;
            document.body.removeChild(tmp);
            if (!dataUrl) return;
            zone.innerHTML = '';
            zone.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9';
            const img = document.createElement('img');
            img.src = dataUrl; img.style.cssText = 'width:72px;height:72px;display:block;border-radius:3px';
            zone.appendChild(img);
            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-size:7.5px;color:#94a3b8;font-family:Poppins,Arial,sans-serif';
            lbl.textContent = 'WhatsApp';
            zone.appendChild(lbl);
          }, 120);
        } catch(e){}
      }).catch(()=>{});
    }
  }

  async function _briefCreaPDFGenerate(id) {
    const b = _briefs.find(x => x.id === id);
    if (!b) return;

    const d         = b.payload || {};
    /* Strip non-latin1 chars (emoji etc) so jsPDF/helvetica renders cleanly */
    const _txt = s => String(s||'').replace(/[^\u0000-\u00FF]/g,'').replace(/\s+/g,' ').trim();
    const prod      = b.product_id || 'Conception graphique';
    const brand     = b.brand_name || d.brand_name || '';
    const ref       = b.ref || b.id;
    const tier      = b.design_tier || d.designTier || '';
    const tierLabel = TIER_LABELS[tier] || tier;
    const date      = b.created_at
      ? new Date(b.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '—';
    const shop      = DB?.shop?.name || DB?.contact?.name || 'Kote';

    const linkedOrder  = b.order_ref ? _orders.find(o => o.ref === b.order_ref) : null;
    const contactNom   = b.client_name  || d.client_name  || linkedOrder?.client_nom   || '';
    const contactTel   = b.client_tel   || d.client_tel   || linkedOrder?.client_tel   || '';
    const contactEmail = b.client_email || d.client_email || linkedOrder?.client_email || '';
    const cleanPhone   = contactTel.replace(/\D/g,'');

    const _dlRgb   = { urgent:[220,38,38], '1sem':[217,119,6], '2sem':[5,150,105], flexible:[148,163,184] };
    const deadlineLabel = DEADLINE_MAP[d.deadline] || d.deadline || '';
    const deadlineRgb   = _dlRgb[d.deadline] || [148,163,184];

    const _paperLblSpec = d.paperObj?.label || d.paper || null;
    const _paperSpec    = _paperLblSpec ? _paperLblSpec+(d.paperObj?.gram?' '+d.paperObj.gram+'g':'') : null;

    const genBtn = document.getElementById('bcp-gen-btn');
    if (genBtn) { genBtn.disabled=true; genBtn.innerHTML=`<svg class="bcp-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="13" height="13"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Génération…`; }

    try {
      /* ── Load libs ── */
      const _ld = (src, ready) => new Promise((res,rej) => {
        if (ready()) { res(); return; }
        if (document.querySelector(`script[src="${src}"]`)) {
          let n=0; const t=setInterval(()=>{ if(ready()){clearInterval(t);res();} else if(++n>50){clearInterval(t);rej(new Error('Timeout'));} },100);
          return;
        }
        const s=document.createElement('script'); s.src=src;
        s.onload=res; s.onerror=()=>rej(new Error('CDN: '+src)); document.head.appendChild(s);
      });
      await _ld('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js', ()=>!!window.QRCode);
      await _ld('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', ()=>!!(window.jspdf?.jsPDF||window.jsPDF));

      /* ── QR code canvas ── */
      let qrDataUrl = null;
      if (cleanPhone && window.QRCode) {
        try {
          const tmp = document.createElement('div');
          tmp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:120px;height:120px';
          document.body.appendChild(tmp);
          new window.QRCode(tmp, { text:`https://wa.me/${cleanPhone}`, width:120, height:120,
            colorDark:'#374151', colorLight:'#ffffff', correctLevel:window.QRCode?.CorrectLevel?.M||1 });
          await new Promise(r=>setTimeout(r,180));
          const cv = tmp.querySelector('canvas');
          if (cv) qrDataUrl = cv.toDataURL('image/png');
          document.body.removeChild(tmp);
          /* Also update preview QR zone */
          const zone = document.getElementById('bcp-qr-zone');
          if (zone && qrDataUrl) {
            zone.innerHTML = '';
            zone.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;margin-top:12px;padding-top:10px;border-top:1px solid #f1f5f9';
            const img = document.createElement('img');
            img.src = qrDataUrl; img.style.cssText = 'width:72px;height:72px;display:block';
            zone.appendChild(img);
            const lbl = document.createElement('div');
            lbl.style.cssText = 'font-size:7.5px;color:#94a3b8;font-family:Poppins,Arial,sans-serif';
            lbl.textContent = 'WhatsApp'; zone.appendChild(lbl);
          }
        } catch(e) { /* QR optional */ }
      }

      /* ── jsPDF setup ── */
      const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
      if (!JsPDF) throw new Error('jsPDF non disponible');
      const pdf = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

      /* ── Layout constants (mm) ── */
      const PW=210, PH=297, PM=8;                   // page, margin
      const CX=PM, CW=PW-2*PM;                       // content x=8, w=194
      const LW=47, GAP=4;                            // left col ~25%
      const RX=CX+LW+GAP, RW=CW-LW-GAP;             // right col x=59, w=143
      const HDR_Y=PM, HDR_BOT=PM+26, SEP_Y=HDR_BOT+1, BODY_Y=SEP_Y+4;
      const FTR_LINE=PH-PM-6, FTR_TXT=PH-PM-1.5;

      /* ── Color palette ── */
      const C = {
        dark:   [30,41,59],   text:  [55,65,81],    mid:   [100,116,139],
        light:  [148,163,184],xlt:   [203,213,225],  bord:  [226,232,240],
        bg:     [241,245,249],bgx:   [248,250,252],  pu:    [124,58,237],
        pu_bg:  [245,243,255],pu_bd: [221,214,254],  amb:   [251,191,36],
        amb_bg: [254,252,232],green: [5,150,105],    cyan:  [8,145,178],
      };
      const sC = c=>pdf.setTextColor(...c);
      const sD = c=>pdf.setDrawColor(...c);
      const sF = c=>pdf.setFillColor(...c);

      /* ── Header ── */
      // Eyebrow
      pdf.setFont('helvetica','bold'); pdf.setFontSize(7); sC(C.light);
      pdf.text('BRIEF DE CONCEPTION GRAPHIQUE', CX, HDR_Y+5);
      // Product name
      pdf.setFontSize(15); sC(C.dark);
      pdf.text(prod.length>45 ? prod.slice(0,43)+'…' : prod, CX, HDR_Y+13);
      // Brand
      if (brand) { pdf.setFont('helvetica','normal'); pdf.setFontSize(10); sC(C.mid); pdf.text(brand, CX, HDR_Y+20); }

      // Header right: ref box
      if (ref) {
        const rw=44, rh=6, rx=PW-PM-rw;
        sF(C.bg); sD(C.bord); pdf.setLineWidth(0.25);
        pdf.roundedRect(rx, HDR_Y+2, rw, rh, 1,1, 'FD');
        pdf.setFont('courier','bold'); pdf.setFontSize(8.5); sC(C.dark);
        pdf.text(ref, rx+rw/2, HDR_Y+6.2, {align:'center'});
      }
      // Date
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8); sC(C.light);
      pdf.text(date, PW-PM, HDR_Y+13, {align:'right'});
      // Tier badge
      if (tierLabel) {
        const tw=pdf.getStringUnitWidth(tierLabel)*7*0.352778+8;
        sF(C.pu_bg); sD(C.pu_bd); pdf.setLineWidth(0.2);
        pdf.roundedRect(PW-PM-tw, HDR_Y+16, tw, 5, 1.5,1.5, 'FD');
        pdf.setFont('helvetica','bold'); pdf.setFontSize(7); sC(C.pu);
        pdf.text(tierLabel, PW-PM-tw/2, HDR_Y+19.7, {align:'center'});
      }

      // Header separator
      sD(C.bord); pdf.setLineWidth(0.3); pdf.line(CX, SEP_Y, PW-PM, SEP_Y);

      /* ── Left column ── */
      let lY = BODY_Y;

      const _lSec = (title, rows) => {
        const vr = rows.filter(r=>r&&r[1]!=null&&r[1]!=='');
        if (!vr.length) return;
        sC(C.xlt); pdf.setFont('helvetica','bold'); pdf.setFontSize(6);
        pdf.text(title.toUpperCase(), CX, lY); lY+=1.5;
        sD(C.bord); pdf.setLineWidth(0.2); pdf.line(CX, lY, CX+LW, lY); lY+=3;
        vr.forEach(([lbl,val])=>{
          if (lY>FTR_LINE-10) return;
          sC(C.light); pdf.setFont('helvetica','bold'); pdf.setFontSize(6);
          pdf.text(lbl, CX, lY); lY+=2.5;
          sC(C.text); pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5);
          const lines=pdf.splitTextToSize(_txt(val), LW-1);
          lines.forEach(ln=>{ if(lY<FTR_LINE-5){pdf.text(ln,CX,lY);} lY+=3.5; });
          sD([241,245,249]); pdf.setLineWidth(0.15); pdf.line(CX,lY,CX+LW-1,lY); lY+=2;
        });
        lY+=3;
      };

      _lSec('Identifiants', [
        ref && ['Réf. brief', ref],
        b.order_ref && ['Commande', b.order_ref],
        ['Date', date],
      ].filter(Boolean));

      const stRows = [
        tierLabel    && ['Niveau', tierLabel],
        deadlineLabel&& ['Délai',  deadlineLabel],
      ].filter(Boolean);
      if (stRows.length) _lSec('Statut', stRows);

      _lSec('Spécifications', [
        ['Produit', prod],
        d.sizeObj?.label && ['Format',    d.sizeObj.label+(d.sizeObj.dims?' · '+d.sizeObj.dims:'')],
        (d.gfW&&d.gfH)   && ['Dimensions',d.gfW+' × '+d.gfH+' cm'],
        d.sides           && ['Impression',d.sides==='double'?'Recto-Verso':'Recto'],
        d.pages           && ['Pages',     d.pages+' p.'],
        d.fold            && ['Pliage',    d.fold],
        _paperSpec        && ['Support',   _paperSpec],
        d.lamination      && ['Pellicul.', d.lamination],
        d.finish          && ['Finition',  Array.isArray(d.finish)?d.finish.join(', '):d.finish],
        d.binding         && ['Reliure',   d.binding],
        d.quantity        && ['Quantité',  d.quantity.toLocaleString('fr-FR')+' ex.'],
      ].filter(Boolean));

      /* Client section + QR — measured together, pinned as one block to bottom */
      const clRows = [
        contactNom   && ['Client', contactNom],
        contactTel   && ['Tél',    contactTel],
        contactEmail && ['Email',  contactEmail],
      ].filter(Boolean);

      if (clRows.length || qrDataUrl) {
        // Measure block height before drawing
        let blockH = 0;
        if (clRows.length) {
          blockH += 4.5; // section title + underline + gap
          clRows.forEach(([, val]) => {
            const lines = pdf.splitTextToSize(_txt(val), LW - 1);
            blockH += 2.5 + lines.length * 3.5 + 2; // label + value lines + row-sep
          });
          blockH += 3; // trailing gap
        }
        if (qrDataUrl) blockH += 2 + 20 + 4; // sep-line + image + label
        // Pin: jump lY to bottom anchor (never push existing content up)
        const pinY = FTR_LINE - blockH;
        if (pinY > lY) lY = pinY;

        if (clRows.length) _lSec('Client', clRows);

        if (qrDataUrl) {
          const qSz = 20, qX = CX + (LW - qSz) / 2;
          sD(C.bord); pdf.setLineWidth(0.15); pdf.line(CX, lY, CX + LW, lY); lY += 2;
          try { pdf.addImage(qrDataUrl, 'PNG', qX, lY, qSz, qSz); } catch(e) {}
          lY += qSz + 2;
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); sC(C.light);
          pdf.text('WhatsApp', CX + LW / 2, lY, { align: 'center' });
        }
      }

      /* ── Right column ── */
      let rY = BODY_Y;
      let page = 1;

      const needH = h => {
        if (rY+h > FTR_LINE-2) {
          pdf.addPage(); page++;
          sD(C.bord); pdf.setLineWidth(0.2);
          pdf.line(CX+LW+GAP/2, PM, CX+LW+GAP/2, FTR_LINE-1);
          rY = PM+6;
        }
      };

      /* Right col eyebrow */
      pdf.setFont('helvetica','bold'); pdf.setFontSize(6.5); sC(C.light);
      pdf.text('BRIEF CRÉATIF — CONTENU POUR L\'ÉQUIPE DE CONCEPTION', RX, rY); rY+=2;
      sD([241,245,249]); pdf.setLineWidth(0.2); pdf.line(RX,rY,RX+RW,rY); rY+=4;

      const _rSec = (title, acRgb, rows) => {
        const vr=rows.filter(r=>r&&r[1]!=null&&r[1]!=='');
        if (!vr.length) return;
        needH(8);
        sF(acRgb); pdf.rect(RX, rY-3.5, 1.5, 5, 'F');
        sC(acRgb); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
        pdf.text(title.toUpperCase(), RX+3, rY); rY+=4;
        vr.forEach(([k,v])=>{
          const vlines=pdf.splitTextToSize(_txt(v),RW-22);
          const rh=Math.max(4.5, vlines.length*3.5+1.5);
          needH(rh);
          sC(C.light); pdf.setFont('helvetica','bold'); pdf.setFontSize(6.5);
          pdf.text(_txt(k), RX+1, rY+3);
          sC(C.text); pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5);
          vlines.forEach((ln,li)=>pdf.text(ln, RX+21, rY+3+li*3.5));
          sD([248,250,252]); pdf.setLineWidth(0.15); pdf.line(RX,rY+rh,RX+RW,rY+rh);
          rY+=rh;
        });
        rY+=4;
      };

      const _rContent = text => {
        const lines=pdf.splitTextToSize(_txt(text),RW-8);
        const bh=lines.length*3.5+5;
        needH(bh);
        sF(C.amb_bg); pdf.rect(RX,rY,RW,bh,'F');
        sF(C.amb);    pdf.rect(RX,rY,1.5,bh,'F');
        sC(C.text); pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5);
        lines.forEach((ln,li)=>pdf.text(ln,RX+4,rY+3.5+li*3.5));
        rY+=bh+2;
      };

      /* Identity */
      _rSec('Marque & Identité', C.pu, [
        (b.brand_name||d.brand_name) && ['Marque',  b.brand_name||d.brand_name],
        d.website      && ['Site web', d.website],
        d.brand_colors && ['Couleurs', d.brand_colors],
        d.has_logo   !== undefined && ['Logo',   d.has_logo   ? 'Vectoriel disponible' : 'Non disponible'],
        d.has_charte !== undefined && ['Charte', d.has_charte ? 'Disponible'           : 'Non disponible'],
      ].filter(Boolean));

      /* Contenu */
      const cFields=_cFields(d);
      if (cFields.length) {
        needH(8);
        sF(C.amb); pdf.rect(RX,rY-3.5,1.5,5,'F');
        sC(C.amb);  pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
        pdf.text('CONTENU', RX+3, rY); rY+=4;
        cFields.forEach(t=>_rContent(t));
        rY+=1;
      }

      /* Direction artistique */
      _rSec('Direction artistique', C.green, [
        _jn(d.visual_style) && ['Style',      _txt(_jn(d.visual_style))],
        _jn(d.visual_tone)  && ['Ton',        _txt(_jn(d.visual_tone))],
        d.visual_refs       && ['Références', _txt(d.visual_refs)],
        d.avoid             && ['A éviter',   _txt(d.avoid)],
      ].filter(Boolean));

      /* Articles à concevoir — only items requiring design work */
      const ordItems=(linkedOrder?.payload?.items||[])
        .filter(i=>i.snap?.designOption==='service'||i.snap?.type==='brief');
      if (ordItems.length) {
        const oRows=[];
        ordItems.forEach((i,idx)=>{
          oRows.push([`Article ${idx+1}`, _txt(i.prodName||'—')]);
          if(i.specs)    oRows.push(['Spécs',  _txt(i.specs)]);
          if(i.quantity) oRows.push(['Qté',    i.quantity.toLocaleString('fr-FR')+' ex.']);
        });
        _rSec('Articles à concevoir', C.cyan, oRows);
      }

      /* Notes */
      if (d.notes) {
        needH(8);
        sF([100,116,139]); pdf.rect(RX,rY-3.5,1.5,5,'F');
        sC([100,116,139]); pdf.setFont('helvetica','bold'); pdf.setFontSize(7);
        pdf.text('NOTES', RX+3, rY); rY+=4;
        const nlines=pdf.splitTextToSize(_txt(d.notes),RW-2);
        nlines.forEach(ln=>{ needH(4); sC(C.text); pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.text(ln,RX+1,rY); rY+=3.5; });
      }

      /* ── Finalize: dividers + footers on every page ── */
      const totalPages = pdf.internal.getNumberOfPages();
      for (let p=1; p<=totalPages; p++) {
        pdf.setPage(p);
        /* Column divider */
        sD(C.bord); pdf.setLineWidth(0.2);
        pdf.line(CX+LW+GAP/2, p===1?SEP_Y+2:PM, CX+LW+GAP/2, FTR_LINE-1);
        /* Footer line */
        sD(C.bord); pdf.setLineWidth(0.25); pdf.line(CX, FTR_LINE, PW-PM, FTR_LINE);
        /* Footer text */
        pdf.setFont('helvetica','normal'); pdf.setFontSize(7); sC(C.light);
        pdf.text(`Généré par ${shop}`, CX, FTR_TXT);
        if (ref) { pdf.setFont('courier','normal'); sC(C.xlt); pdf.text(ref, PW-PM, FTR_TXT, {align:'right'}); }
        if (totalPages>1) { sC(C.light); pdf.setFont('helvetica','normal'); pdf.text(`${p} / ${totalPages}`, PW/2, FTR_TXT, {align:'center'}); }
      }
      pdf.setPage(totalPages);

      /* ── Blob + share tray ── */
      const blob     = pdf.output('blob');
      const blobURL  = URL.createObjectURL(blob);
      const fileName = `brief-${ref}-${prod.toLowerCase().replace(/\s+/g,'-')}.pdf`;

      const waNum  = (DB?.contact?.designer_whatsapp||'').replace(/\D/g,'');
      const emails = DB?.contact?.emails||[];
      const creaML = emails.find(e=>e.id==='crea')?.address || DB?.contact?.email || '';

      const waMsg=[`*Brief créatif — ${ref}*`,`Produit : ${prod}`,
        brand&&`Marque : ${brand}`,tierLabel&&`Niveau : ${tierLabel}`,
        '','Veuillez trouver le brief en pièce jointe.','Merci de lancer la conception.',
      ].filter(Boolean).join('\n');
      const mlSubj=encodeURIComponent(`Brief créatif ${ref} — ${prod}${brand?' · '+brand:''}`);
      const mlBody=encodeURIComponent(`Brief : ${ref}\nProduit : ${prod}\n`
        +(brand?`Marque : ${brand}\n`:'')+(tierLabel?`Niveau : ${tierLabel}\n`:'')
        +'\nVeuillez trouver le brief PDF en pièce jointe.\n\nMerci de lancer la conception.');

      const dlEl=document.getElementById('bcp-tr-dl');
      const waEl=document.getElementById('bcp-tr-wa');
      const mlEl=document.getElementById('bcp-tr-ml');
      if (dlEl){dlEl.href=blobURL;dlEl.download=fileName;dlEl.classList.remove('bcp-tr-dis');setTimeout(()=>URL.revokeObjectURL(blobURL),90000);}
      if (waEl&&waNum){waEl.href=`https://wa.me/${waNum}?text=${encodeURIComponent(waMsg)}`;waEl.classList.remove('bcp-tr-dis');}
      if (mlEl&&creaML){mlEl.href=`mailto:${creaML}?subject=${mlSubj}&body=${mlBody}`;mlEl.classList.remove('bcp-tr-dis');}

      document.getElementById('bcp-tray')?.classList.add('on');
      if (genBtn) {
        genBtn.disabled=false;
        genBtn.style.cssText='width:100%;padding:7px;border-radius:8px;background:#f1f5f9;color:#64748b;border:1.5px solid #e2e8f0;font-family:inherit;font-size:10.5px;font-weight:500;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .18s';
        genBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Regénérer`;
      }

    } catch(e) {
      console.error('[DASHBOARD] _briefCreaPDFGenerate:', e);
      if (genBtn) { genBtn.disabled=false; genBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Générer le PDF`; }
      alert('Erreur génération PDF : ' + e.message);
    }
  }

  /* ── Print brief preview — exact vector copy of the A4 preview panel ── */
  function _briefCreaPDFPrint(id) {
    const a4 = document.getElementById('bcp-a4');
    if (!a4) return;

    /* Collect all styles from the modal's <style> tag */
    const modalStyles = Array.from(document.querySelectorAll('#brfCreaModal style'))
      .map(s => s.textContent).join('\n');

    const pw = window.open('', '_blank', 'width=900,height=700');
    if (!pw) { alert('Autorisez les popups pour imprimer.'); return; }

    pw.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Brief créatif</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
/* Reset */
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;font-family:'Poppins','Segoe UI',Arial,sans-serif}

/* Carry over modal A4 styles */
${modalStyles}

/* Print overrides */
#bcp-a4{
  width:210mm;min-height:297mm;
  box-shadow:none!important;
  page-break-after:always;
}
@page{size:A4 portrait;margin:0}
@media print{
  html,body{width:210mm;height:297mm}
  body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
  .no-print{display:none!important}
}
</style>
</head><body>
${a4.outerHTML}
<script>
  window.onload = function() {
    window.print();
    window.onafterprint = function(){ window.close(); };
  };
<\/script>
</body></html>`);
    pw.document.close();
  }

  async function setBriefStatus(id, val) {
    // Optimistic UI
    const card = $('dbrf-' + id);
    if (card) {
      card.querySelectorAll('.dash-st-pill').forEach(btn => {
        const isActive = btn.dataset.status === val;
        btn.classList.toggle('act', isActive);
        const p = BRIEF_STATUS[btn.dataset.status];
        if (p) {
          btn.style.background  = isActive ? p.bg    : '';
          btn.style.color       = isActive ? p.color : '';
          btn.style.borderColor = isActive ? p.bd    : '';
        }
      });
      const badge = card.querySelector('.dash-st-badge');
      if (badge) {
        const p = BRIEF_STATUS[val] || BRIEF_STATUS.nouveau;
        badge.textContent = p.label;
        badge.style.background  = p.bg;
        badge.style.color       = p.color;
        badge.style.borderColor = p.bd;
      }
      card.style.borderLeftColor = (BRIEF_STATUS[val] || BRIEF_STATUS.nouveau).color;
    }
    try {
      await _patch('kote_briefs', id, { status: val });
      const br = _briefs.find(b => b.id === id);
      if (br) br.status = val;
    } catch(e) {
      console.warn('[DASHBOARD] setBriefStatus failed:', e);
    }
  }

  function toggleBrief(id) {
    const card = $('dbrf-' + id);
    if (card) card.classList.toggle('open');
  }

  /* ── Shared: read DB price + build client message data ── */
  async function _patchPriceAndBuildMsg(id) {
    const brief = _briefs.find(b => b.id === id);
    if (!brief) return null;

    /* Read price from DB value — must already be persisted via _saveBriefPrice */
    const priceVal = brief.price_ht;
    if (priceVal == null || isNaN(priceVal) || priceVal <= 0) {
      alert('Fixez d\'abord le prix HT du brief avant d\'envoyer la notification.');
      return null;
    }

    const linkedOrder = brief.order_ref ? _orders.find(o => o.ref === brief.order_ref) : null;
    const d           = brief.payload || {};
    const clientTel   = (brief.client_tel || d.client_tel || linkedOrder?.client_tel || '').replace(/\D/g,'');
    const clientEmail = brief.client_email || d.client_email || linkedOrder?.client_email || '';
    const clientNom   = brief.client_name || d.client_name || linkedOrder?.client_nom || brief.brand_name || d.brand_name || '';
    const ref         = brief.ref || id;
    const prodId      = brief.product_id || '—';
    const tierLabel   = brief.design_tier || d.designTier || '';
    const priceFmt    = priceVal.toLocaleString('fr-MA', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const trkRef      = brief.order_ref || null;
    const trackingUrl = trkRef
      ? location.href.replace(/[^/]*$/, '') + 'tracking.html?ref=' + encodeURIComponent(trkRef)
      : null;

    return { brief, clientTel, clientEmail, clientNom, ref, prodId, tierLabel, priceFmt, trackingUrl };
  }

  /* ── Notify client via WhatsApp ── */
  async function setPriceAndNotifyWA(id) {
    const ctx = await _patchPriceAndBuildMsg(id);
    if (!ctx) return;
    const { clientTel, clientNom, ref, prodId, tierLabel, priceFmt, trackingUrl } = ctx;
    if (!clientTel) { alert('Aucun téléphone client disponible.'); return; }
    const _shopName = DB?.shop?.name || 'Kote Imprimerie';
    const msg = [
      `*Brief de conception — ${ref}*`,
      ``,
      `Bonjour ${clientNom || 'Client'},`,
      `Votre brief créatif a été analysé par notre équipe.`,
      ``,
      `Support  : ${prodId}`,
      tierLabel ? `Niveau   : ${tierLabel}` : null,
      `Prix HT  : ${priceFmt} DH`,
      ``,
      `Pour confirmer, répondez à ce message ou contactez-nous.`,
      trackingUrl ? `Suivre votre commande : ${trackingUrl}` : null,
      ``,
      _shopName,
    ].filter(l => l !== null).join('\n');
    window.open(`https://wa.me/${clientTel}?text=${encodeURIComponent(msg)}`, '_blank');
    setTimeout(() => refresh(), 600);
  }

  /* ── Notify client via Email ── */
  async function setPriceAndNotifyEmail(id) {
    const ctx = await _patchPriceAndBuildMsg(id);
    if (!ctx) return;
    const { clientEmail, clientNom, ref, prodId, tierLabel, priceFmt, trackingUrl } = ctx;
    if (!clientEmail) { alert('Aucun email client disponible.'); return; }
    const _shopNameE = DB?.shop?.name || 'Kote Imprimerie';
    const subj = encodeURIComponent(`Brief ${ref} — Tarif confirmé`);
    const body = encodeURIComponent(
      `Bonjour ${clientNom || 'Client'},\n\n` +
      `Votre brief créatif (réf. ${ref}) a été analysé.\n\n` +
      `Support  : ${prodId}\n` +
      (tierLabel ? `Niveau   : ${tierLabel}\n` : '') +
      `Prix HT  : ${priceFmt} DH\n\n` +
      `Pour confirmer, répondez à cet email ou appelez-nous.\n` +
      (trackingUrl ? `\nSuivre votre commande : ${trackingUrl}\n` : '') +
      `\n${_shopNameE}`
    );
    window.open(`mailto:${clientEmail}?subject=${subj}&body=${body}`, '_blank');
    setTimeout(() => refresh(), 600);
  }

  /* ── Keep old combined notify for backwards compat (modals etc.) ── */
  async function setPriceAndNotify(id) {
    await setPriceAndNotifyWA(id);
  }

  /* ── Send brief to creative team via WhatsApp ── */
  function _sendToCreaWA(id) {
    const b = _briefs.find(x => x.id === id);
    if (!b) return;
    const waDesigner = (DB?.contact?.designer_whatsapp || '').replace(/\D/g,'');
    if (!waDesigner) { alert('Numéro WhatsApp créatif non configuré dans Paramètres → Contact.'); return; }
    const d    = b.payload || {};
    const ref  = b.ref || id;
    const prod = b.product_id || '—';
    const brand = b.brand_name || d.brand_name || '';
    const tier  = b.design_tier || d.designTier || '';
    const contentFields = _cFields(d);

    const msg = [
      `*Brief créatif — ${ref}*`,
      `Produit : ${prod}`,
      brand  ? `Marque : ${brand}`  : null,
      tier   ? `Niveau : ${tier}`   : null,
      ``,
      contentFields.length ? `*Contenu*\n${contentFields.join('\n')}` : null,
      (_jn(d.visual_style)||_jn(d.visual_tone)) ? `*Direction artistique*\nStyle : ${_jn(d.visual_style)}\nTon : ${_jn(d.visual_tone)}` : null,
      d.visual_refs ? `Références : ${d.visual_refs}` : null,
      d.avoid       ? `À éviter : ${d.avoid}`         : null,
      ``,
      (b.client_name||d.client_name) ? `Client : ${b.client_name||d.client_name}` : null,
      (b.client_tel||d.client_tel)   ? `Tél : ${b.client_tel||d.client_tel}`      : null,
      d.deadline     ? `Délai : ${{ urgent:'Urgent (24–48h)', '1sem':'Cette semaine', '2sem':'2 semaines', flexible:'Flexible' }[d.deadline]||d.deadline}` : null,
    ].filter(l => l !== null).join('\n');

    window.open(`https://wa.me/${waDesigner}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  /* ════════════════════════════════════════════════════════
     BRIEF DETAIL MODAL — wraps _buildBriefSections
     Print = window.print() on the modal (clean CSS handles it)
  ════════════════════════════════════════════════════════ */
  function openBriefModal(id) {
    const b = _briefs.find(x => x.id === id);
    if (!b) return;

    const d         = b.payload || {};
    const st        = BRIEF_STATUS[b.status] || BRIEF_STATUS.nouveau;
    const date      = b.created_at
      ? new Date(b.created_at).toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'}) : '—';
    const prod      = b.product_id  || '—';
    const brand     = b.brand_name  || d.brand_name  || '—';
    const tier      = b.design_tier || d.designTier  || '';
    const tierLabel = TIER_LABELS[tier] || tier;

    const waDesigner = (DB?.contact?.designer_whatsapp || '').replace(/\D/g,'');
    const emailsCfg  = DB?.contact?.emails || [];
    const creaEmail  = emailsCfg.find(e => e.id === 'crea')?.address || DB?.contact?.email || '';

    const { sectionsHTML, specChips, deadlineLabel, deadlineColor,
            contactTel, contactEmail, contactNom } = _buildBriefSections(b);

    const linkedOrderChip = b.order_ref
      ? `<span class="brf-ord-chip" title="Commande liée"
           onclick="document.getElementById('brfDetailModal').remove();DASHBOARD.switchTab('orders')">${b.order_ref}</span>`
      : '';

    const specChipHTML = specChips.map(c =>
      `<span class="bpm-chip" class="cf-ico-btn--bl">${c}</span>`
    ).join('');

    document.getElementById('brfDetailModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'brfDetailModal';
    modal.innerHTML = `

<div id="bpm-box">

  <!-- HEADER -->
  <div id="bpm-hdr">
    <div class="bpm-hdr-l">
      <div class="bpm-eyebrow">Brief de conception</div>
      <div class="bpm-title">${prod}</div>
      <div class="bpm-meta">
        <span class="bpm-brand">${brand}</span>
        ${b.ref         ? `<span class="bpm-brf-ref">${b.ref}</span>` : ''}
        ${linkedOrderChip}
        <span class="bpm-st-pill" style="background:${st.bg};color:${st.color};border-color:${st.bd}">${st.label}</span>
        ${tierLabel     ? `<span class="bpm-st-pill" class="cf-ico-btn--pu">${tierLabel}</span>` : ''}
        ${deadlineLabel ? `<span class="bpm-st-pill" style="color:${deadlineColor};background:#fff;border-color:${deadlineColor}44">${deadlineLabel}</span>` : ''}
      </div>
    </div>
    <button class="bpm-close" onclick="document.getElementById('brfDetailModal').remove()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="17" height="17">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <!-- CLIENT STRIP -->
  ${(contactNom||contactTel||contactEmail) ? `
  <div id="bpm-client">
    ${contactNom   ? `<span class="bpm-cli"><svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" width="11" height="11"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${contactNom}</span>` : ''}
    ${contactTel   ? `<span class="bpm-cli"><svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" width="11" height="11"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5a19.79 19.79 0 01-.1-.86 2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>${contactTel}</span>` : ''}
    ${contactEmail ? `<span class="bpm-cli"><svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" width="11" height="11"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>${contactEmail}</span>` : ''}
    <span style="margin-left:auto;font-size:.62rem;color:#94a3b8">${date}</span>
  </div>` : `<div style="padding:.35rem 1.3rem;font-size:.62rem;color:#94a3b8;background:#f8fafc;border-bottom:1px solid #e4e9f0">${date}</div>`}

  <!-- SPEC CHIPS -->
  ${(specChipHTML||tierLabel||deadlineLabel) ? `
  <div id="bpm-chips">
    <span style="font-size:.54rem;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#6b7280;margin-right:.2rem">Spécs</span>
    ${specChipHTML}
    ${tierLabel     ? `<span class="bpm-chip" class="chip--pu-sm">${tierLabel}</span>` : ''}
  </div>` : ''}

  <!-- BODY — reuses shared .brf-* sections -->
  <div id="bpm-body">
    ${sectionsHTML}
  </div>

  <!-- FOOTER -->
  <div id="bpm-ftr">
    <button class="bpm-btn bpm-btn-close" onclick="document.getElementById('brfDetailModal').remove()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      Fermer
    </button>
    <button class="bpm-btn bpm-btn-print" onclick="window.print()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Imprimer / PDF
    </button>
    <div class="bpm-sep"></div>
    <button class="bpm-btn bpm-btn-wa" ${!waDesigner ? 'disabled title="WA designer non configuré"' : ''}
      onclick="DASHBOARD._sendToCreaWA('${id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
      Crea WA
    </button>
    <button class="bpm-btn bpm-btn-mail" ${!creaEmail ? 'disabled title="Email crea non configuré"' : ''}
      onclick="DASHBOARD._briefEmail('${id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      Crea Mail
    </button>
  </div>

</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  /* ── Brief PDF — delegates to modal print (pixel-perfect, no jsPDF dependency) ── */
  function _briefPDF(id) {
    openBriefModal(id);
    // Give the modal a frame to render, then trigger print
    requestAnimationFrame(() => setTimeout(() => window.print(), 80));
  }

  /* ── Brief: send to creative team by email ── */
  function _briefEmail(id) {
    const b = _briefs.find(x => x.id === id);
    if (!b) return;
    const emailsCfg = DB?.contact?.emails || [];
    const creaEmail = emailsCfg.find(e => e.id === 'crea')?.address || DB?.contact?.email || '';
    if (!creaEmail) { alert('Email créatifs non configuré dans Paramètres.'); return; }
    const d     = b.payload || {};
    const prod  = b.product_id || 'Brief';
    const brand = b.brand_name || d.brand_name || '';
    const ref   = b.ref || id;
    const tier  = b.design_tier || d.designTier || '';
    const contentFields = _cFields(d);

    const subj = encodeURIComponent(`Brief créatif ${ref} — ${prod}${brand?' · '+brand:''}`);
    const body = encodeURIComponent([
      `Brief : ${ref}`,
      `Produit : ${prod}`,
      brand  ? `Marque : ${brand}` : null,
      tier   ? `Niveau : ${tier}`  : null,
      ``,
      `--- IDENTITÉ ---`,
      d.brand_colors ? `Couleurs : ${d.brand_colors}` : null,
      d.has_logo!==undefined ? `Logo vectoriel : ${d.has_logo?'Oui':'Non'}` : null,
      ``,
      contentFields.length ? `--- CONTENU ---\n${contentFields.join('\n')}` : null,
      ``,
      (_jn(d.visual_style)||_jn(d.visual_tone)) ? `--- DIRECTION ARTISTIQUE ---\nStyle : ${_jn(d.visual_style)}\nTon : ${_jn(d.visual_tone)}` : null,
      d.visual_refs ? `Références : ${d.visual_refs}` : null,
      d.avoid       ? `À éviter : ${d.avoid}` : null,
      ``,
      `--- CONTACT CLIENT ---`,
      (b.client_name||d.client_name) ? `Nom : ${b.client_name||d.client_name}` : null,
      (b.client_tel||d.client_tel)   ? `Tél : ${b.client_tel||d.client_tel}`   : null,
      d.notes ? `\nNotes : ${d.notes}` : null,
    ].filter(l=>l!==null).join('\n'));

    window.open(`mailto:${creaEmail}?subject=${subj}&body=${body}`, '_blank');
  }

  /* ════════════════════════════════════════════════════════
     BRIEF → DEVIS  — opens INVOICE with order items + conception line injected
  ════════════════════════════════════════════════════════ */
  function openBriefDevis(id) {
    const brief = _briefs.find(b => b.id === id);
    if (!brief) return;

    // Price must be set and persisted in DB
    const priceVal = brief.price_ht;
    if (priceVal == null || isNaN(priceVal) || priceVal <= 0) {
      alert('Fixez d\'abord le prix HT du brief avant de générer le devis.');
      return;
    }

    const d          = brief.payload || {};
    const tier       = brief.design_tier || d.designTier || '';
    const tierLabel  = TIER_LABELS[tier] || tier;
    const prod       = brief.product_id || 'Conception graphique';
    const ref        = brief.ref        || brief.id;

    // ── Build base payload from linked order (robust lookup) ──
    // Try order_ref first, then scan all orders for one containing this brief ref
    let linkedOrder = brief.order_ref
      ? _orders.find(o => o.ref === brief.order_ref)
      : null;
    if (!linkedOrder && ref) {
      linkedOrder = _orders.find(o =>
        (o.payload?.items||[]).some(i =>
          i.snap?.brief_ref === ref ||
          (i.snap?.designOption === 'service' && i.snap?.brief_ref === ref)
        )
      );
    }
    const basePayload = linkedOrder ? JSON.parse(JSON.stringify(linkedOrder.payload || {})) : {};

    // Client — brief contact fields → linked order → brief payload
    const client = {
      nom:     brief.client_name  || d.client_name  || linkedOrder?.client_nom   || '',
      tel:     brief.client_tel   || d.client_tel   || linkedOrder?.client_tel   || '',
      email:   brief.client_email || d.client_email || linkedOrder?.client_email || '',
      adresse: linkedOrder?.client_adresse || '',
      ville:   linkedOrder?.client_ville   || '',
      ice:     linkedOrder?.client_ice     || '',
    };

    // ── Items ──
    // Keep original order items, strip any existing brief/conception placeholders,
    // then append the priced conception line at the end
    let baseItems = (basePayload.items || []).filter(i =>
      !(i.snap?.type === 'brief' && i.snap?.brief_ref === ref) &&
      !(i.snap?.designOption === 'service' && i.snap?.brief_ref === ref)
    );

    // Build richer specs string from brief payload (format, pages, sides, paper…)
    const _specParts = [];
    if (tierLabel)        _specParts.push(tierLabel);
    if (d.sizeObj?.label) _specParts.push(d.sizeObj.label);
    if (d.pages)          _specParts.push(d.pages + ' pages');
    if (d.sides)          _specParts.push(d.sides === 'double' ? 'R/V' : 'Recto');
    if (d.paper)          _specParts.push(d.paper);
    if (d.finish)         _specParts.push(d.finish);
    if (ref)              _specParts.push(ref);
    const concepSpecs = _specParts.filter(Boolean).join(' · ');

    const concepLine = {
      prodName:  `Conception graphique — ${prod}`,
      specs:     concepSpecs,
      notes:     '',
      quantity:  1,
      perUnit:   priceVal,
      baseTotal: priceVal,
      snap:      { type:'brief', brief_ref:ref, designTier:tier },
    };
    baseItems = [...baseItems, concepLine];

    // ── Totals ──
    const itemsTotal  = baseItems.reduce((s, i) => s + (i.baseTotal || 0), 0);
    const delAmt      = basePayload.totals?.del || 0;
    const surAmt      = basePayload.totals?.surAmt || 0;
    const grand       = itemsTotal + delAmt + surAmt;

    // ── Date + ref ──
    const today = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'long', year:'numeric' });
    const devisRef = brief.order_ref
      ? `${brief.order_ref}-D`
      : `BRF-${ref.replace('BRF-','')}-D`;

    const payload = {
      ...basePayload,
      ref:   devisRef,
      date:  today,
      items: baseItems,
      totals: { grand, del: delAmt, surAmt },
      ta:    basePayload.ta || null,
      shop:  DB?.shop || basePayload.shop || {},
      client,
    };

    if (typeof INVOICE !== 'undefined') {
      INVOICE.open(payload, {
        dbId:    linkedOrder?.id || null,
        docType: 'devis',
        client,
      });
    } else {
      alert('Module INVOICE non disponible.');
    }
  }

  /* ── Navigate from order chip → brief card ── */
  function goToBrief(brfRef) {
    // Switch to briefs tab
    switchTab('briefs');
    // After render, scroll to + flash the target card
    requestAnimationFrame(() => {
      const brief = _briefs.find(b => b.ref === brfRef);
      if (!brief) return;
      const card = document.getElementById('dbrf-' + brief.id);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Expand if collapsed
      if (!card.classList.contains('open')) card.classList.add('open');
      // Flash highlight
      card.style.transition = 'box-shadow .2s, outline .2s';
      card.style.outline = '2.5px solid #7c3aed';
      card.style.boxShadow = '0 0 0 5px #ddd6fe';
      setTimeout(() => { card.style.outline = ''; card.style.boxShadow = ''; }, 1800);
    });
  }

  /* ════════════════════════════════════════════════════════
     Acompte (deposit) on order card — inline input + DB save
  ════════════════════════════════════════════════════════ */
  function _showDepositInput(id) {
    const wrap = document.getElementById('ord-dep-inline-' + id);
    if (!wrap) return;
    wrap.style.display = 'flex';
    const display = document.getElementById('ord-dep-display-' + id);
    if (display) display.style.display = 'none';
    const inp = document.getElementById('ord-dep-inp-' + id);
    if (inp) {
      const order = _orders.find(o => o.id === id);
      if (order?.montant_verse != null) inp.value = order.montant_verse;
      setTimeout(() => { inp.focus(); inp.select(); }, 0);
    }
  }

  function _hideDepositInput(id) {
    const wrap = document.getElementById('ord-dep-inline-' + id);
    if (wrap) wrap.style.display = 'none';
    const display = document.getElementById('ord-dep-display-' + id);
    if (display) display.style.display = '';
  }

  async function _saveDeposit(id) {
    const order = _orders.find(o => o.id === id);
    if (!order) return;

    const inp    = document.getElementById('ord-dep-inp-' + id);
    const depVal = inp ? parseFloat(inp.value) : NaN;
    if (isNaN(depVal) || depVal < 0) {
      alert('Saisissez un montant valide (>= 0).');
      inp?.focus();
      return;
    }

    const confirmBtn = inp?.closest('[id^="ord-dep-inline-"]')?.querySelector('button');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '⏳'; }

    try {
      await _patch('kote_orders', id, { montant_verse: depVal });
      /* Update local cache */
      order.montant_verse = depVal;

      /* Re-render card in-place */
      _rerenderOrderCard(order);
    } catch(e) {
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>'; }
      alert('Erreur : ' + e.message);
    }
  }



  function toggleContact(id) {
    // Close all other open contact pills first
    document.querySelectorAll('.dash-contact-pills.open').forEach(p => {
      if (p.id !== 'dc-pills-' + id) {
        p.classList.remove('open');
        const otherId = p.id.replace('dc-pills-', '');
        const otherBtn = document.getElementById('dc-' + otherId)?.querySelector('.dash-act-contact');
        if (otherBtn) otherBtn.classList.remove('act');
      }
    });
    const pills = document.getElementById('dc-pills-' + id);
    const btn   = document.getElementById('dc-' + id)?.querySelector('.dash-act-contact');
    if (!pills) return;
    const open = pills.classList.toggle('open');
    if (btn) btn.classList.toggle('act', open);
  }

  /* ════════════════════════════════════════════════════════
     DOCUMENTS TAB  — order-first document hub
     One row per order · 4 document columns · click → popover CTA
  ════════════════════════════════════════════════════════ */

  let _docsSub = 'orders'; // 'orders' | 'quotes'

  /* Shared doc type metadata — used by _docsMenu + _docsHTML */
  const _DOC_ICONS = {
    facture: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    df:      '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/>',
    label:   '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>',
    brief:   '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>',
    quote:   '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  };
  const _DOC_COLORS = { facture:'#2563eb', df:'#7c3aed', label:'#0891b2', brief:'#7c3aed', quote:'#2563eb' };
  const _DOC_CONF = (id) => ({
    facture: { label:'Facture / Devis',        bg:'#eff6ff', action:'Générer / Ouvrir',   fn:`DASHBOARD.openInvoice('${id}')` },
    df:      { label:'Dossier de fabrication', bg:'#f5f3ff', action:'Ouvrir le DF',       fn:`DASHBOARD.showDF('${id}')` },
    label:   { label:'Étiquette colis',        bg:'#ecfeff', action:'Imprimer étiquette', fn:`DASHBOARD.printLabel('${id}')` },
    brief:   { label:'Brief créatif',          bg:'#f5f3ff', action:'Ouvrir brief PDF',   fn:`DASHBOARD._briefCreaPDF('${id}')` },
    quote:   { label:'Devis / Facture',        bg:'#eff6ff', action:'Aperçu PDF',         fn:`DASHBOARD.openQuoteInvoice('${id}')` },
  });

  function _docsSetSub(s) {
    _docsSub = s;
    const el = $('dashContent');
    if (el && _tab === 'docs') el.innerHTML = _docsHTML();
  }

  /* Click on a document cell → floating action menu */
  function _docsMenu(type, id, triggerEl) {
    document.getElementById('docs-pop')?.remove();

    const conf = _DOC_CONF(id);
    const meta = conf[type];
    if (!meta) return;
    const c = { ...meta, color: _DOC_COLORS[type], icon: _DOC_ICONS[type] };
    const rect = triggerEl.getBoundingClientRect();

    // Find order/quote context label
    let ctxRef = '', ctxClient = '';
    if (type === 'quote') {
      const q = _quotes.find(x => x.id === id);
      ctxRef = q?.ref || ''; ctxClient = q?.client_nom || '';
    } else {
      const o = _orders.find(x => x.id === id);
      ctxRef = o?.ref || ''; ctxClient = o?.client_nom || '';
    }

    const pop = document.createElement('div');
    pop.id = 'docs-pop';
    pop.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;padding:8px 10px 6px;border-bottom:1px solid #f1f5f9">
        <span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background:${c.bg};flex-shrink:0">
          <svg viewBox="0 0 24 24" fill="none" stroke="${c.color}" stroke-width="1.8" width="11" height="11">${c.icon}</svg>
        </span>
        <div style="min-width:0">
          <div style="font-size:10px;font-weight:700;color:#0f172a;white-space:nowrap">${c.label}</div>
          ${ctxRef ? `<div style="font-size:9px;color:#94a3b8;font-family:'Courier New',monospace;margin-top:1px">${ctxRef}${ctxClient?' · '+ctxClient:''}</div>` : ''}
        </div>
      </div>
      <div style="padding:4px">
        <button id="docs-pop-btn"
          style="display:flex;align-items:center;justify-content:center;gap:5px;width:100%;
            padding:6px 10px;border-radius:6px;border:none;
            background:${c.color};color:#fff;font-family:inherit;font-size:11px;font-weight:700;
            cursor:pointer;transition:filter .12s"
          onmouseover="this.style.filter='brightness(.9)'"
          onmouseout="this.style.filter=''"
          onclick="${c.fn};document.getElementById('docs-pop')?.remove()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">${c.icon}</svg>
          ${c.action}
        </button>
      </div>`;

    pop.style.cssText = `position:fixed;z-index:1200;background:#fff;
      border:1px solid #e2e8f0;border-radius:10px;
      box-shadow:0 4px 6px rgba(0,0,0,.04),0 12px 32px rgba(0,0,0,.12);
      min-width:190px;font-family:inherit;
      animation:dtpop .12s cubic-bezier(.34,1.3,.64,1)`;

    // Position: below the cell, aligned left, clamp to viewport
    const top  = Math.min(rect.bottom + 6, window.innerHeight - 100);
    const left = Math.min(Math.max(rect.left - 10, 6), window.innerWidth - 210);
    pop.style.top  = top  + 'px';
    pop.style.left = left + 'px';

    document.body.appendChild(pop);

    // Dismiss on outside click or Escape
    const dismiss = e => {
      if (e.key === 'Escape' || !pop.contains(e.target)) {
        pop.remove();
        document.removeEventListener('click', dismiss);
        document.removeEventListener('keydown', dismiss);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', dismiss);
      document.addEventListener('keydown', dismiss);
    }, 0);
  }

  function _docsHTML() {
    const sub   = _docsSub;

    /* Status dot */
    const dot = s => {
      const v = STATUS[s] || STATUS.nouveau;
      return `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;
        background:${v.color};flex-shrink:0" title="${v.label}"></span>`;
    };

    /* Document cell button */
    const cell = (type, id, active, title) => {
      const col = active ? _DOC_COLORS[type] : '#cbd5e1';
      const cur = active ? 'pointer' : 'default';
      return `<button class="dtab-cell" style="color:${col};cursor:${cur}"
        ${active ? `onclick="event.stopPropagation();DASHBOARD._docsMenu('${type}','${id}',this)" title="${title}"` : 'disabled tabindex="-1"'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">${_DOC_ICONS[type]}</svg>
      </button>`;
    };

    /* ── ORDERS table ── */
    const ordersHTML = () => {
      if (!_orders.length) return `<tr><td colspan="8" class="ops-empty">Aucune commande</td></tr>`;
      return _orders.slice(0, 50).map(o => {
        const p   = o.payload || {};
        const hasItems   = (p.items||[]).length > 0;
        const hasDesign  = (p.items||[]).some(i =>
          (i.snap?.designOption === 'service' && i.snap?.designTier) || i.snap?.type === 'brief');
        const brief = hasDesign
          ? _briefs.find(b => b.order_ref === o.ref || (p.items||[]).some(i => i.snap?.brief_ref === b.ref))
          : null;

        return `<tr class="dtab-row" onclick="">
          <td class="dtab-ref">${o.ref}</td>
          <td class="dtab-client" title="${o.client_nom||''}">${o.client_nom||'—'}</td>
          <td><span style="display:inline-flex;align-items:center;gap:4px;font-size:.62rem;color:var(--t2)">
            ${dot(o.status||'nouveau')}
            ${(STATUS[o.status||'nouveau']||STATUS.nouveau).label}
          </span></td>
          <td class="dtab-date">${_fmtDate(o.created_at)}</td>
          <td>${fmt(o.total_ht)} DH</td>
          <td class="dtab-doc">${cell('facture', o.id, true, 'Générer facture / devis')}</td>
          <td class="dtab-doc">${cell('df',      o.id, hasItems, 'Dossier de fabrication')}</td>
          <td class="dtab-doc">${cell('label',   o.id, true, 'Étiquette colis')}</td>
          <td class="dtab-doc">${cell('brief',   brief?.id || o.id, !!brief, hasDesign ? 'Brief créatif' : 'Pas de conception')}</td>
        </tr>`;
      }).join('');
    };

    /* ── QUOTES table ── */
    const quotesHTML = () => {
      const list = _quotes.length ? _quotes : (window._jsonQuotes || []);
      if (!list.length) return `<tr><td colspan="6" class="ops-empty">Aucun devis</td></tr>`;
      return list.slice(0, 50).map(q => {
        const stC = q.status === 'facture' ? '#2563eb' : q.status === 'avoir' ? '#d97706' : '#64748b';
        const stL = {devis:'Devis', facture:'Facture', avoir:'Avoir'}[q.status] || q.status || 'devis';
        return `<tr class="dtab-row">
          <td class="dtab-ref">${q.ref||'—'}</td>
          <td class="dtab-client" title="${q.client_nom||''}">${q.client_nom||'—'}</td>
          <td><span style="font-size:.62rem;font-weight:700;color:${stC}">${stL}</span></td>
          <td class="dtab-date">${_fmtDate(q.created_at)}</td>
          <td>${fmt(q.total_ht)} DH</td>
          <td class="dtab-doc">${cell('quote', q.id, true, 'Aperçu PDF')}</td>
        </tr>`;
      }).join('');
    };

    return `
<div class="dtab-wrap">
  <div class="dtab-sub">
    <button class="dtab-sub-btn${sub==='orders'?' on':''}" onclick="DASHBOARD._docsSetSub('orders')">Commandes</button>
    <button class="dtab-sub-btn${sub==='quotes'?' on':''}" onclick="DASHBOARD._docsSetSub('quotes')">Devis</button>
  </div>
  <div class="dtab-table-wrap">
    ${sub === 'orders' ? `
    <table class="dtab-table">
      <thead><tr>
        <th>Réf.</th><th>Client</th><th>Statut</th><th>Date</th><th>Montant HT</th>
        <th class="dtab-doc dtab-doc-hd" title="Facture / Devis">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </th>
        <th class="dtab-doc dtab-doc-hd" title="Dossier de fabrication">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
        </th>
        <th class="dtab-doc dtab-doc-hd" title="Étiquette">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
        </th>
        <th class="dtab-doc dtab-doc-hd" title="Brief créatif">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
        </th>
      </tr></thead>
      <tbody>${ordersHTML()}</tbody>
    </table>` : `
    <table class="dtab-table">
      <thead><tr>
        <th>Réf.</th><th>Client</th><th>Type</th><th>Date</th><th>Montant HT</th>
        <th class="dtab-doc dtab-doc-hd" title="PDF">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </th>
      </tr></thead>
      <tbody>${quotesHTML()}</tbody>
    </table>`}
  </div>
</div>`;
  }

  return { load, refresh, switchTab, toggleOrder, setStatus, openInvoice, notifyWA, notifyEmail, filterByStatus, printLabel, _labelGenPDF, _printLabel, showDF, _printDF, search, _clearSearch, setKpiPeriod, setKpiRange, openQuoteInvoice, setBriefStatus, toggleBrief, setPriceAndNotify, setPriceAndNotifyWA, setPriceAndNotifyEmail, openBriefModal, openBriefDevis, _briefPDF, _briefEmail, _sendToCreaWA, goToBrief, validateBriefPrice, _saveBriefPrice, _briefShowPriceInput, _briefHidePriceInput, _rerenderOrderCard, _briefCreaPDF, _briefCreaPDFGenerate, _briefCreaPDFPrint, _showDepositInput, _hideDepositInput, _saveDeposit, toggleContact, _docsMenu, _docsSetSub, toggleClient, saveClientNote, rateClient };
})();
