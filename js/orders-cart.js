'use strict';

/* ============================================================
   orders-cart.js -- QUOTES, order DF builders, CART
   Extracted from kote-orders.js (S8 split).
   Exposes: QUOTES, buildOrderDF, buildOrderDFHtml, CART
   Requires: kote-core.js, catalog-ui.js (loadProduct)
   Load order: first orders file
   ============================================================ */

'use strict';

/* ════════════════════════════════════════════════════════
   kote-orders.js — Full order flow
   QUOTES, buildOrderDF/Html, CART, AUTH, ORDERS, INVOICE.
   Pages: client.html, admin.html
   Requires: config.js, kote-core.js, kote-catalog.js
   ════════════════════════════════════════════════════════ */

/* ════ quotes.js ════ */
const QUOTES = (() => {

  let _abortCtrl = null;   // tracks in-flight fetch so we can cancel on close
  let _isOpen    = false;  // explicit open state — prevents duplicate opens

  /* ── Supabase helper (with abort + 12s timeout) ── */
  async function _req(method, path, body, signal) {
    const timeout = new AbortController();
    const timer   = setTimeout(() => timeout.abort(), 12000);
    const combined = signal
      ? { signal: AbortSignal.any
            ? AbortSignal.any([signal, timeout.signal])
            : signal }               // fallback: prefer caller signal
      : { signal: timeout.signal };
    try {
      return await fetch(`${window.SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: {
          'apikey':        window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        method === 'POST' ? 'return=minimal' : '',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        ...combined,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── Save to kote_quotes with full payload (fire-and-forget) ── */
  async function save(ref, items, cartOpts, totals, ta) {
    const d = new Date().toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'});
    const tva = Math.round((totals.grand||0)*0.20*100)/100;
    const ttc = Math.round(((totals.grand||0)+tva)*100)/100;
    const payload = {
      ref, date: d,
      items: items.map(i=>({prodName:i.prodName,specs:i.specs||'',notes:i.notes||'',
        quantity:i.quantity,perUnit:i.perUnit,baseTotal:i.baseTotal})),
      totals: {sub:totals.sub,surAmt:totals.surAmt,del:totals.del,grand:totals.grand,tva,ttc},
      ta: ta||{}, shop: (typeof DB!=='undefined'&&DB?.shop)||{},
      waUrl: null, client: null, docType: 'devis',
    };
    try {
      await _req('POST', 'kote_quotes', {
        ref, status:'devis', client_nom:'', client_ice:'',
        total_ht: totals.grand||0, total_ttc: ttc, payload,
      });
    } catch(e) {
      if (e.name !== 'AbortError') console.warn('QUOTES.save failed:', e);
    }
  }

  /* ── Load last 80 quotes — Supabase or embedded JSON fallback ── */
  async function _load() {
    // Cancel any previous in-flight request
    if (_abortCtrl) _abortCtrl.abort();
    _abortCtrl = new AbortController();
    const signal = _abortCtrl.signal;

    const body = $('histBody');
    body.innerHTML = `<div class="hist-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        class="spin-loader--cart">
        <path d="M21 12a9 9 0 11-6.219-8.56"/>
      </svg>
      Chargement…
    </div>`;

    /* JSON mode — use embedded _quotes if available */
    if (DB_MOD.getSource() !== 'supabase') {
      if (window._jsonQuotes?.length) {
        _render(window._jsonQuotes);
      } else {
        body.innerHTML = `<div class="hist-state">Aucun devis dans ce fichier JSON.<br>
          <small class="cart-toast-sub">
            Exportez depuis le mode Supabase pour inclure l'historique.</small></div>`;
      }
      return;
    }

    try {
      const res = await _req('GET', 'kote_quotes?select=*&order=created_at.desc&limit=80', null, signal);
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const quotes = await res.json();
      if (!_isOpen) return;   // panel was closed while loading — discard
      _render(quotes);
    } catch(e) {
      if (e.name === 'AbortError') return;   // clean cancel — do nothing
      if (!_isOpen) return;
      body.innerHTML = `<div class="hist-state hist-err">
        ${IC.alert} Impossible de charger l'historique.<br>
        <small style="font-weight:400;margin-top:.25rem;display:block">${e.message}</small>
        <button class="btn btn-outline" style="margin-top:.6rem;font-size:.65rem;height:28px"
          onclick="QUOTES._reload()">Réessayer</button>
      </div>`;
    }
  }

  /* ── Render the quotes list ── */
  function _render(quotes) {
    const body = $('histBody');
    if (!quotes.length) {
      body.innerHTML = `<div class="hist-state">Aucun devis enregistré.</div>`;
      return;
    }
    body.innerHTML = quotes.map(q => {
      const payload = q.payload || {};
      const items   = Array.isArray(payload.items) ? payload.items
                    : Array.isArray(q.items)        ? q.items : [];
      const d = new Date(q.created_at).toLocaleDateString('fr-MA',
        {day:'2-digit', month:'2-digit', year:'numeric'});
      const t = new Date(q.created_at).toLocaleTimeString('fr-MA',
        {hour:'2-digit', minute:'2-digit'});
      const ttc = q.total_ttc || (q.total_ht * 1.20);
      const statusColor = q.status==='facture' ? 'var(--bl)' : 'var(--t3)';
      const itemsHtml = items.map(i => `
        <div class="hq-item">
          <span class="hq-item-name">
            <span class="hq-item-qty">${fmtN(i.quantity)}</span> ${i.prodName}
          </span>
          <span class="hq-item-price">${fmt(i.baseTotal)} DH</span>
        </div>`).join('');
      const clientLine = q.client_nom
        ? `<span class="hq-meta">${q.client_nom}${q.client_ice?' · ICE '+q.client_ice:''}</span>`
        : '';
      const payloadEnc = encodeURIComponent(JSON.stringify({...payload, _dbId: q.id}));
      return `
        <div class="hq-card" id="hqc-${q.id}">
          <div class="hq-top" onclick="document.getElementById('hqc-${q.id}').classList.toggle('open')">
            <div class="hq-left">
              <span class="hq-ref">${q.ref}
                <span style="font-size:.58rem;font-weight:600;color:${statusColor};margin-left:4px;text-transform:capitalize">${q.status||'devis'}</span>
              </span>
              ${clientLine}
              <span class="hq-meta">${d} · ${t}</span>
            </div>
            <div class="hq-right">
              <span class="hq-ht">${fmt(q.total_ht)} DH HT</span>
              <span class="hq-ttc">${fmt(ttc)} DH TTC</span>
            </div>
          </div>
          <div class="hq-items" onclick="event.stopPropagation()">
            ${itemsHtml}
            <div class="hq-doc-footer">
              <button onclick="QUOTES.openDoc('${q.id}')" style="background:var(--bl);color:#fff;border:none;border-radius:6px;
                padding:5px 12px;font-size:.65rem;font-weight:700;cursor:pointer;
                display:flex;align-items:center;gap:4px;font-family:inherit">
                <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'
                  width='11' height='11' stroke-linecap='round' stroke-linejoin='round'>
                  <path d='M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z'/>
                  <polyline points='14 2 14 8 20 8'/>
                </svg>
                Ouvrir dans l'aperçu
              </button>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  /* ── Open a saved quote in the Invoice previewer ── */
  function openDoc(dbId) {
    QUOTES.close();
    // Find the row we already have in memory (rendered list) — re-fetch if not
    _req('GET', `kote_quotes?id=eq.${dbId}&select=*&limit=1`)
      .then(r=>r.json())
      .then(rows=>{
        const row = rows[0]; if(!row) return;
        const p = row.payload||{};
        const opts = { dbId: row.id, docType: row.status||'devis' };
        if(p.client && (p.client.nom||p.client.id)) opts.client = p.client;
        INVOICE.open(p, opts);
      })
      .catch(e=>console.error('[QUOTES.openDoc]',e));
  }

  /* ── Open ── */
  function open() {
    if (_isOpen) return;   // already open — ignore duplicate calls
    _isOpen = true;
    $('histOverlay').classList.add('open');
    $('histDrawer').classList.add('open');
    _load();
  }

  /* ── Close ── */
  function close() {
    if (!_isOpen) return;
    _isOpen = false;
    // Cancel any pending fetch immediately
    if (_abortCtrl) { _abortCtrl.abort(); _abortCtrl = null; }
    $('histOverlay').classList.remove('open');
    $('histDrawer').classList.remove('open');
  }

  /* ── Reload (retry button) ── */
  function _reload() { _load(); }

  /* ── Escape key to close ── */
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _isOpen) close(); });

  /* ── Stop clicks inside the drawer from hitting the overlay ── */
  document.addEventListener('DOMContentLoaded', () => {
    const drawer = $('histDrawer');
    if (drawer) drawer.addEventListener('click', e => e.stopPropagation());
  });

  return { save, open, close, openDoc, _reload };
})();


/* ════ cart.js ════ */
/* ════════════════════════════════════════════════════════
   BUILD_ORDER_DF  — shared DF builder (used by CART + DASHBOARD)
   ════════════════════════════════════════════════════════ */
function buildOrderDF(items, totals, taLabel, taDays, ref, date, deliveryCityLabel, clientInfo) {
  // totals kept in signature for backward compat but NOT printed — production doc only
  const HR  = '─'.repeat(44);
  const HR2 = '═'.repeat(44);
  const lines = [
    `╔${'═'.repeat(42)}╗`,
    `  DOSSIER DE FABRICATION`,
    `  Réf : ${ref}`,
    `  Date : ${date}${taLabel ? '  ·  Délai : ' + taLabel + (taDays ? ' (' + taDays + ')' : '') : ''}`,
    `╚${'═'.repeat(42)}╝`,
    '',
  ];

  // ── Client block ──
  const cl = clientInfo || {};
  if (cl.nom || cl.tel || cl.email) {
    lines.push(`CLIENT`);
    lines.push(HR);
    if (cl.nom)     lines.push(`  Nom       : ${cl.nom}`);
    if (cl.tel)     lines.push(`  Tél       : ${cl.tel}`);
    if (cl.email)   lines.push(`  Email     : ${cl.email}`);
    if (cl.adresse) lines.push(`  Adresse   : ${cl.adresse}${cl.ville ? ', ' + cl.ville : ''}`);
    lines.push('');
  }

  // ── Items ──
  (items || []).forEach((item, idx) => {
    const s   = item.snap || {};
    const qty = item.quantity || 0;

    // Lookup helpers
    const paperObj   = (DB?.paper_stocks  || []).find(p => p.id === s.paper);
    const paperCovObj= (DB?.paper_stocks  || []).find(p => p.id === s.paperCover);
    const lamObj     = (s.lam    && s.lam    !== 'none') ? (DB?.finishes || []).find(f => f.id === s.lam)         : null;
    const lamCovObj  = (s.lamCover    && s.lamCover    !== 'none') ? (DB?.finishes || []).find(f => f.id === s.lamCover)    : null;
    const lamIntObj  = (s.lamInterior && s.lamInterior !== 'none') ? (DB?.finishes || []).find(f => f.id === s.lamInterior) : null;
    const bindObj    = (s.binding && s.binding !== 'none') ? (DB?.binding_options || []).find(b => b.id === s.binding) : null;
    const gfMatObj   = (DB?.gf_materials   || []).find(m => m.id === (s.gfMaterial || (typeof curProd !== 'undefined' ? curProd?.gf_material_id : null)));
    const gfSupObj   = (DB?.rollup_supports|| []).find(s2 => s2.id === (typeof curProd !== 'undefined' ? curProd?.support_id : null));

    const addonLines = (s.addons || []).map(aid => {
      const f = (DB?.finishes_addon || []).find(x => x.id === aid);
      const faces = (s.addonFaces || {})[aid];
      return f ? `${f.label}${faces === 2 ? ' (2 faces)' : ''}` : aid;
    });

    const isCat     = !!(s.paperCover && s.pages);
    const isGF      = !!(s.gfW && s.gfH);
    const isCarnet  = !!(s.carnetPages && s.carnetSouches);
    const isEnv     = !!(s.envFormatId || s.envTypeId);
    const isConc    = !!(s.concType || s.designTier);

    lines.push(`PRODUIT ${idx + 1} / ${(items || []).length}  —  ${item.prodName.toUpperCase()}`);
    lines.push(HR);

    // ── Format / Dimensions ──
    if (s.sizeObj?.label || (s.sizeObj?.w && s.sizeObj?.h)) {
      const dims = (s.sizeObj.w && s.sizeObj.h) ? ` (${s.sizeObj.w}×${s.sizeObj.h} mm)` : '';
      lines.push(`  Format          : ${s.sizeObj.label || 'Sur mesure'}${dims}`);
    }
    if (s.gfW && s.gfH) {
      const wm = (parseFloat(s.gfW) / 100).toFixed(2);
      const hm = (parseFloat(s.gfH) / 100).toFixed(2);
      const area = (parseFloat(s.gfW) / 100 * parseFloat(s.gfH) / 100).toFixed(3);
      lines.push(`  Dimensions      : ${s.gfW} × ${s.gfH} cm  (${area} m²)`);
      if (gfMatObj?.laize) lines.push(`  Laize matière   : ${gfMatObj.laize} m`);
    }

    // ── Catalogue specifics ──
    if (isCat) {
      const totalPages    = s.pages || 0;
      const interiorPages = Math.max(0, totalPages - 4);
      const sidesIntLabel = s.sidesInt === 'single' ? 'Recto' : 'Recto-Verso';
      const sidesCovLabel = s.sidesCov === 'single' ? 'Recto' : 'Recto-Verso';
      const ppsPerFace    = s.sizeObj?.pps_face ?? s.sizeObj?.pps ?? 2;
      const ppsInt        = ppsPerFace * (s.sidesInt === 'single' ? 1 : 2);
      const intSheets     = Math.ceil(interiorPages / Math.max(ppsInt, 1));
      lines.push(`  Pages total     : ${totalPages} pages`);
      lines.push('');
      lines.push(`  ┌ INTÉRIEUR ─────────────────────────`);
      lines.push(`  │ Pages          : ${interiorPages} pages`);
      if (paperObj)  lines.push(`  │ Papier         : ${paperObj.label}`);
      lines.push(`  │ Impression     : ${sidesIntLabel}`);
      lines.push(`  │ Feuillets press: ${intSheets} f. / ex.  (${ppsInt} p./f.)`);
      if (lamIntObj) lines.push(`  │ Pelliculage    : ${lamIntObj.label}`);
      lines.push(`  └─────────────────────────────────────`);
      lines.push('');
      lines.push(`  ┌ COUVERTURE ─────────────────────────`);
      lines.push(`  │ Pages          : 4 pages (spread)`);
      if (paperCovObj) lines.push(`  │ Papier         : ${paperCovObj.label}`);
      lines.push(`  │ Impression     : ${sidesCovLabel}`);
      lines.push(`  │ Feuillets press: 1 f. / ex.  (spread format double)`);
      if (lamCovObj) lines.push(`  │ Pelliculage    : ${lamCovObj.label}`);
      lines.push(`  └─────────────────────────────────────`);
    } else if (isGF) {
      // ── Grand Format ──
      if (gfMatObj) lines.push(`  Matière         : ${gfMatObj.label}`);
      const gfFins = (s.gfFinishes || []).map(fid => {
        const f = (DB?.gf_finishes || []).find(x => x.id === fid);
        return f ? f.label : fid;
      });
      if (gfFins.length) lines.push(`  Finitions GF    : ${gfFins.join(', ')}`);
      if (s.withSupport && gfSupObj) lines.push(`  Support         : ${gfSupObj.label}`);
    } else if (isCarnet) {
      // ── Carnet NCR ──
      const SOUCHE_COLORS = ['Blanc', 'Jaune', 'Rose', 'Vert', 'Bleu'];
      const n = s.carnetSouches || 2;
      lines.push(`  Feuillets/carnet: ${s.carnetPages}`);
      lines.push(`  Souches         : ${n} (${SOUCHE_COLORS.slice(0, n).join(' + ')})`);
      lines.push(`  Impression      : Offset ${s.carnetColors || 4} couleurs`);
      if (s.carnetNumero) lines.push(`  Numérotation    : Oui — dès N° ${s.carnetNumStart || 1}`);
      if (s.carnetPerfo)  lines.push(`  Perforage       : Oui`);
      if (s.carnetCover)  lines.push(`  Couverture      : Imprimée 1 face`);
    } else if (isEnv) {
      // ── Enveloppes ──
      const envFmt  = (DB?.envelope_formats || []).find(f => f.id === s.envFormatId);
      const envType = (DB?.envelope_types   || []).find(t => t.id === s.envTypeId);
      if (envFmt)  lines.push(`  Format env.     : ${envFmt.name}${envFmt.w && envFmt.h ? ' (' + envFmt.w + '×' + envFmt.h + ' mm)' : ''}`);
      if (envType) lines.push(`  Type env.       : ${envType.name}`);
      if (s.envFenetre !== undefined) lines.push(`  Fenêtre         : ${s.envFenetre ? 'Avec fenêtre' : 'Sans fenêtre'}`);
      if (s.envColors)  lines.push(`  Couleurs offset : ${s.envColors}`);
    } else {
      // ── Standard (flyer, carte, affiche…) ──
      if (paperObj) lines.push(`  Papier          : ${paperObj.label}`);
      const sidesLabel = s.sides === 'double' ? 'Recto-Verso' : s.sides === 'single' ? 'Recto' : null;
      if (sidesLabel)   lines.push(`  Impression      : ${sidesLabel}`);
      if (lamObj) {
        const lamSides = lamObj.per_side && s.sides === 'double' ? ' (2 faces)' : '';
        lines.push(`  Pelliculage     : ${lamObj.label}${lamSides}`);
      }
    }

    // ── Common fields for all types ──
    if (!isCat) {
      if (s.fold)    lines.push(`  Pliage          : ${s.fold}`);
      if (bindObj)   lines.push(`  Reliure         : ${bindObj.label}`);
    } else {
      if (bindObj)   lines.push(`  Reliure         : ${bindObj.label}`);
    }

    // ── Chemise options ──
    if (s.chemiseColle)   lines.push(`  Rabat collé     : Oui`);
    if (s.chemiseImprime) lines.push(`  Rabat imprimé   : Oui`);

    // ── Sac soufflet ──
    if (s.sacSoufflet > 0) lines.push(`  Soufflet latéral: ${s.sacSoufflet} mm`);

    // ── Addon finitions ──
    if (addonLines.length) {
      lines.push(`  Finitions add.  : ${addonLines.join(', ')}`);
    }

    // ── Design / Conception ──
    if (s.designOption === 'service' && s.designTier) {
      const tl = { basic: 'Basic', pro: 'Pro', premium: 'Premium' }[s.designTier] || s.designTier;
      lines.push(`  Conception      : Niveau ${tl}`);
    }
    if (s.designOption === 'file' && s.designFileName) {
      lines.push(`  Fichier BAT     : ${s.designFileName}${s.designFileSize ? ' (' + s.designFileSize + ')' : ''}`);
    }
    if (s.briefData && Object.keys(s.briefData).length) {
      lines.push(`  Brief design    : ✅ Fourni`);
    }

    // ── Quantity ──
    lines.push('');
    lines.push(`  Quantité        : ${qty.toLocaleString('fr-FR')} exemplaires`);

    // ── Notes ──
    if (item.notes && item.notes.trim()) {
      lines.push(`  ⚠ Note prod.   : "${item.notes}"`);
    }

    lines.push('');
    lines.push('');
  });

  lines.push(HR2);
  lines.push(`  Total : ${(items||[]).length} produit${(items||[]).length > 1 ? 's' : ''} · Réf ${ref}`);
  if (deliveryCityLabel) lines.push(`  Livraison → ${deliveryCityLabel}`);
  lines.push(HR2);
  return lines.join('\n');
}

function buildOrderDFHtml(items, clientInfo) {
  const cl = clientInfo || {};
  const _row  = (label, value) =>
    `<div style="display:flex;gap:.5rem;padding:.18rem 0;font-size:.67rem;line-height:1.4">
       <span style="color:#94a3b8;font-weight:600;min-width:130px;flex-shrink:0">${label}</span>
       <span style="color:#0f172a;font-weight:500">${value}</span>
     </div>`;
  const _sep  = label =>
    `<div style="font-size:.57rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;
       color:#64748b;margin:.55rem 0 .25rem;padding-bottom:.2rem;
       border-bottom:1.5px solid #e2e8f0">${label}</div>`;
  const _box  = (color, label, rows) =>
    `<div style="border-left:3px solid ${color};padding:.35rem .6rem;
       background:${color}11;border-radius:0 5px 5px 0;margin:.35rem 0">
       <div style="font-size:.6rem;font-weight:800;text-transform:uppercase;
         letter-spacing:.7px;color:${color};margin-bottom:.25rem">${label}</div>
       ${rows}
     </div>`;

  let html = '';

  // ── Client header if available ──
  if (cl.nom || cl.tel) {
    html += `<div style="padding:.4rem .6rem;background:#f0fdf4;border:1px solid #bbf7d0;
      border-radius:6px;margin-bottom:.65rem">
      <div style="font-size:.58rem;font-weight:800;text-transform:uppercase;
        letter-spacing:.7px;color:#16a34a;margin-bottom:.2rem">Client</div>
      ${cl.nom     ? _row('Nom',       cl.nom)     : ''}
      ${cl.tel     ? _row('Tél',       cl.tel)     : ''}
      ${cl.email   ? _row('Email',     cl.email)   : ''}
      ${cl.adresse ? _row('Adresse',   cl.adresse + (cl.ville ? ', ' + cl.ville : '')) : ''}
    </div>`;
  }

  html += '<ul style="list-style:none;margin:0;padding:0">';

  (items || []).forEach((item, idx) => {
    const s = item.snap || {};

    const paperObj   = (DB?.paper_stocks   || []).find(p => p.id === s.paper);
    const paperCovObj= (DB?.paper_stocks   || []).find(p => p.id === s.paperCover);
    const lamObj     = (s.lam         && s.lam         !== 'none') ? (DB?.finishes || []).find(f => f.id === s.lam)         : null;
    const lamCovObj  = (s.lamCover    && s.lamCover    !== 'none') ? (DB?.finishes || []).find(f => f.id === s.lamCover)    : null;
    const lamIntObj  = (s.lamInterior && s.lamInterior !== 'none') ? (DB?.finishes || []).find(f => f.id === s.lamInterior) : null;
    const bindObj    = (s.binding && s.binding !== 'none') ? (DB?.binding_options || []).find(b => b.id === s.binding) : null;
    const gfMatObj   = (DB?.gf_materials || []).find(m => m.id === s.gfMaterial);
    const addonLines = (s.addons || []).map(aid => {
      const f = (DB?.finishes_addon || []).find(x => x.id === aid);
      const faces = (s.addonFaces || {})[aid];
      return f ? `${f.label}${faces === 2 ? ' · 2 faces' : ''}` : aid;
    });

    const isCat    = !!(s.paperCover && s.pages);
    const isGF     = !!(s.gfW && s.gfH);
    const isCarnet = !!(s.carnetPages && s.carnetSouches);
    const isEnv    = !!(s.envFormatId || s.envTypeId);

    html += `<li style="padding:.55rem 0;border-bottom:2px solid #e2e8f0;margin-bottom:.3rem">
      <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.4rem">
        <span style="font-size:.6rem;font-weight:800;background:#0f172a;color:#fff;
          border-radius:4px;padding:2px 7px;letter-spacing:.3px">${idx + 1}</span>
        <strong style="font-size:.78rem;color:#0f172a">${item.prodName}</strong>
      </div>`;

    // Format / dimensions
    if (s.sizeObj?.label || (s.sizeObj?.w && s.sizeObj?.h)) {
      const dims = (s.sizeObj.w && s.sizeObj.h) ? ` — ${s.sizeObj.w}×${s.sizeObj.h} mm` : '';
      html += _row('Format fermé', (s.sizeObj.label || 'Sur mesure') + dims);
    }
    if (isGF && s.gfW && s.gfH) {
      const area = (parseFloat(s.gfW) / 100 * parseFloat(s.gfH) / 100).toFixed(3);
      html += _row('Dimensions', `${s.gfW} × ${s.gfH} cm  (${area} m²)`);
      if (gfMatObj?.laize) html += _row('Laize matière', `${gfMatObj.laize} m`);
    }

    // ── Catalogue: two-box layout ──
    if (isCat) {
      const totalPages    = s.pages || 0;
      const interiorPages = Math.max(0, totalPages - 4);
      const sidesIntLabel = s.sidesInt === 'single' ? 'Recto' : 'Recto-Verso';
      const sidesCovLabel = s.sidesCov === 'single' ? 'Recto' : 'Recto-Verso';
      const ppsPerFace    = s.sizeObj?.pps_face ?? s.sizeObj?.pps ?? 2;
      const ppsInt        = ppsPerFace * (s.sidesInt === 'single' ? 1 : 2);
      const intSheets     = Math.ceil(interiorPages / Math.max(ppsInt, 1));

      html += _row('Pages totales', `${totalPages} pages`);

      const intRows = [
        _row('Pages', `${interiorPages} pages`),
        paperObj    ? _row('Papier',        paperObj.label)   : '',
        _row('Impression',  sidesIntLabel),
        _row('Feuillets/ex.', `${intSheets} f.  (${ppsInt} pages/feuille)`),
        lamIntObj   ? _row('Pelliculage',   lamIntObj.label)  : '',
      ].filter(Boolean).join('');
      html += _box('#2563eb', 'Intérieur', intRows);

      const covRows = [
        _row('Pages', '4 pages (spread)'),
        paperCovObj ? _row('Papier',        paperCovObj.label): '',
        _row('Impression',  sidesCovLabel),
        _row('Feuillets/ex.', '1 f.  (spread format double)'),
        lamCovObj   ? _row('Pelliculage',   lamCovObj.label)  : '',
      ].filter(Boolean).join('');
      html += _box('#7c3aed', 'Couverture', covRows);

    } else if (isGF) {
      if (gfMatObj) html += _row('Matière', gfMatObj.label);
      const gfFins = (s.gfFinishes || []).map(fid => {
        const f = (DB?.gf_finishes || []).find(x => x.id === fid);
        return f ? f.label : fid;
      });
      if (gfFins.length) html += _row('Finitions GF', gfFins.join(', '));
      if (s.withSupport) {
        const sup = (DB?.rollup_supports || []).find(x => x.id === (typeof curProd !== 'undefined' ? curProd?.support_id : null));
        if (sup) html += _row('Support', sup.label);
      }

    } else if (isCarnet) {
      const SOUCHE_COLORS = ['Blanc', 'Jaune', 'Rose', 'Vert', 'Bleu'];
      const n = s.carnetSouches || 2;
      html += _row('Feuillets/carnet', `${s.carnetPages}`);
      html += _row('Souches', `${n}  (${SOUCHE_COLORS.slice(0, n).join(' + ')})`);
      html += _row('Impression', `Offset ${s.carnetColors || 4} couleurs`);
      if (s.carnetNumero) html += _row('Numérotation', `Oui — dès N° ${s.carnetNumStart || 1}`);
      if (s.carnetPerfo)  html += _row('Perforage', 'Oui');
      if (s.carnetCover)  html += _row('Couverture', 'Imprimée 1 face');

    } else if (isEnv) {
      const envFmt  = (DB?.envelope_formats || []).find(f => f.id === s.envFormatId);
      const envType = (DB?.envelope_types   || []).find(t => t.id === s.envTypeId);
      if (envFmt)  html += _row('Format', `${envFmt.name}${envFmt.w && envFmt.h ? '  ' + envFmt.w + '×' + envFmt.h + ' mm' : ''}`);
      if (envType) html += _row('Type', envType.name);
      if (s.envFenetre !== undefined) html += _row('Fenêtre', s.envFenetre ? 'Avec fenêtre' : 'Sans fenêtre');
      if (s.envColors)  html += _row('Couleurs offset', `${s.envColors}`);

    } else {
      // Standard
      if (paperObj)  html += _row('Papier', paperObj.label);
      const sidesLabel = s.sides === 'double' ? 'Recto-Verso' : s.sides === 'single' ? 'Recto' : null;
      if (sidesLabel) html += _row('Impression', sidesLabel);
      if (lamObj) {
        const ls = lamObj.per_side && s.sides === 'double' ? '  (2 faces)' : '';
        html += _row('Pelliculage', lamObj.label + ls);
      }
    }

    // Common fields
    if (!isCat && s.fold)  html += _row('Pliage', s.fold);
    if (bindObj)           html += _row('Reliure', bindObj.label);
    if (s.chemiseColle)    html += _row('Rabat collé', 'Oui');
    if (s.chemiseImprime)  html += _row('Rabat imprimé', 'Oui');
    if (s.sacSoufflet > 0) html += _row('Soufflet', `${s.sacSoufflet} mm`);
    if (addonLines.length) html += _row('Finitions', addonLines.join('  ·  '));

    // Design
    if (s.designOption === 'service' && s.designTier) {
      const tl = { basic: 'Basic', pro: 'Pro', premium: 'Premium' }[s.designTier] || s.designTier;
      html += _row('Conception', `Niveau ${tl}`);
    }
    if (s.designOption === 'file' && s.designFileName) {
      html += _row('Fichier BAT', `${s.designFileName}${s.designFileSize ? '  (' + s.designFileSize + ')' : ''}`);
    }
    if (s.briefData && Object.keys(s.briefData).length) {
      const _bn = s.briefData.brand_name ? ` · ${s.briefData.brand_name}` : '';
      html += _row('Brief design', `✅ Fourni${_bn}`);
    }

    // Quantity — prominent
    html += `<div style="margin-top:.4rem;padding:.35rem .55rem;background:#0f172a;border-radius:5px;
      display:flex;align-items:baseline;gap:.5rem">
      <span style="font-size:.6rem;font-weight:700;color:#94a3b8;text-transform:uppercase;
        letter-spacing:.5px">Quantité</span>
      <span style="font-size:.85rem;font-weight:900;color:#fff;letter-spacing:-.02em">
        ${(item.quantity || 0).toLocaleString('fr-FR')} ex.
      </span>
    </div>`;

    // Notes
    if (item.notes && item.notes.trim()) {
      html += `<div style="margin-top:.3rem;padding:.3rem .5rem;background:#fef3c7;
        border-left:3px solid #f59e0b;border-radius:0 4px 4px 0;
        font-size:.64rem;color:#92400e;font-style:italic">
        ⚠ ${item.notes}
      </div>`;
    }

    html += '</li>';
  });

  html += '</ul>';
  return html;
}

const CART = (() => {
  let items = [];
  /* Returns enabled turnaround options from DB.turnaround_options (items already have .sur) */
  function _taList() {
    return (DB.turnaround_options || []).filter(t => t.enabled !== false);
  }

  let opts  = { turnaround: null, delivery: false, deliveryCityId: null };
  let _lastCheckoutText = '';

  /* ── Badge update ── */
  function _badge() {
    const n = items.length;
    const el = $('cartBadge');
    el.textContent = n;
    el.classList.toggle('on', n > 0);
    $('cartCount').textContent = n;
  }

  /* ── Patch kote_briefs.order_ref for any brief items in cart ──
     Call this right after the KTE-ref is generated, before clearing the cart.
     Fire-and-forget — failure is silent (brief is still usable without it). */
  function linkBriefsToOrder(orderRef) {
    const supaUrl = window.SUPABASE_URL  || '';
    const supaKey = window.SUPABASE_ANON_KEY || '';
    if (!supaUrl || !supaKey) return;
    items.forEach(item => {
      const briefId = item.snap?.brief_id;
      if (!briefId) return;
      fetch(`${supaUrl}/rest/v1/kote_briefs?id=eq.${briefId}`, {
        method: 'PATCH',
        headers: {
          'apikey':        supaKey,
          'Authorization': 'Bearer ' + supaKey,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({ order_ref: orderRef }),
      }).catch(e => console.warn('[CART] linkBriefsToOrder failed:', e));
    });
  }

  /* ── Add a standalone brief service line item ── */
  function addBrief({ prodName, briefRef, briefId, linkedProdId, linkedProdName }) {
    const displayName = linkedProdName
      ? `Conception — ${linkedProdName}`
      : (prodName || 'Conception graphique');
    items.push({
      id:             Date.now(),
      prodId:         'brief-service',
      prodName:       displayName,
      prodIcon:       'pen-tool',
      specs:          briefRef || '',
      notes:          '',
      baseTotal:      0,
      perUnit:        0,
      quantity:       1,
      pending_price:  true,
      snap:           {
        type:            'brief',
        brief_ref:       briefRef,
        brief_id:        briefId,
        linked_prod_id:  linkedProdId  || null,
        linked_prod_name: linkedProdName || null,
      },
    });
    _badge();
  }

  /* ── Build specs summary string from a selection state ── */
  function _specs(s) {
    const parts = [];
    const pObj  = DB.paper_stocks.find(p => p.id === s.paper);
    if (s.sizeObj)    parts.push(s.sizeObj.dims || s.sizeObj.label);
    if (s.fold)       parts.push(s.fold.replace('-', ' '));
    if (pObj)         parts.push(pObj.label);
    if (s.paperCover) { const c = DB.paper_stocks.find(p => p.id === s.paperCover); if (c) parts.push('Couv.' + c.label); }
    if (s.lam && s.lam !== 'none') { const lf = DB.finishes.find(f => f.id === s.lam); if (lf) parts.push(lf.label); }
    if (s.lamCover && s.lamCover !== 'none') { const lf = DB.finishes.find(f => f.id === s.lamCover); if (lf) parts.push(lf.label + ' cov.'); }
    (s.addons || []).forEach(id => { const f = (DB.finishes_addon || []).find(x => x.id === id); if (f) parts.push(f.label); });
    if (s.sides === 'double') parts.push('R/V');
    if (s.pages)      parts.push(s.pages + 'p.');
    if (s.binding)    { const b = (DB.binding_options || []).find(x => x.id === s.binding); if (b) parts.push(b.label); }
    if (s.gfMaterial) { const m = (DB?.gf_materials || curProd?.gf_materials || []).find(x => x.id === s.gfMaterial); if (m) parts.push(m.label); }
    if (s.gfW && s.gfH) parts.push(s.gfW + '×' + s.gfH + ' cm');
    if (s.concType) {
      if (s.concType === 'logo') {
        parts.push('Design Logo');
      } else {
        const ct = (curProd?.conception_types || []).find(x => x.id === s.concType); if (ct) parts.push(ct.label);
      }
    }
    if (s.withSupport)    parts.push('avec support');
    if (s.gfFinishes?.length) s.gfFinishes.forEach(id => { const f = (DB.gf_finishes || []).find(x => x.id === id); if (f) parts.push(f.label); });
    if (s.pancarteMat)    { const pm = (DB?.pancarte_materials || curProd?.pancarte_materials || []).find(x => x.id === s.pancarteMat); if (pm) parts.push(pm.label); }
    if (s.chemiseColle)   parts.push('Rabat collé');
    if (s.chemiseImprime) parts.push('Rabat imprimé');
    if (s.sacSoufflet > 0) parts.push('Soufflet ' + s.sacSoufflet + ' mm');
    if (s.carnetPages && s.carnetSouches) {
      parts.push(`${s.carnetPages} f. × ${s.carnetSouches} souches`);
      if (s.carnetNumero) parts.push('Numéroté');
      if (s.carnetPerfo)  parts.push('Perforé');
      if (s.carnetCover)  parts.push('Couv. imprimée');
    }
    if (s.designOption === 'file' && s.designFileName) parts.push('Fichier : ' + s.designFileName);
    if (s.designOption === 'service' && s.designTier) {
      const tierLabel = { basic:'Basic', pro:'Pro', premium:'Premium' }[s.designTier] || s.designTier;
      parts.push('Conception ' + tierLabel);
    }
    if (s.briefData && Object.keys(s.briefData).length) parts.push('Brief fourni');
    return parts.join(' · ');
  }

  /* ── Shared clipboard helper — writes text, falls back to execCommand ──
     onSuccess called in both the async success and the fallback path. */
  function _copy(text, onSuccess) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      onSuccess();
    });
  }

  /* ── Build shared quote payload (used by both checkout paths) ──
     Returns everything both checkout() and checkoutInvoice() need so
     the ~20 duplicated lines don't drift apart. */
  function _buildPayload() {
    const ref  = 'KTE-' + Date.now().toString(36).toUpperCase().slice(-6);
    const { sub, surAmt, del, grand } = CALC.cartTotal(items, opts, DB.pricing, DB.delivery_cities);
    const ta   = _taList().find(t => t.id === opts.turnaround);
    const tva  = Math.round(grand * 0.20 * 100) / 100;
    const ttc  = Math.round((grand + tva) * 100) / 100;
    const d    = new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'2-digit', year:'numeric' });
    const waPhone = (DB.contact?.whatsapp || '').replace(/\D/g, '');
    // Tracking URL — works from any deploy location
    const _base = typeof location !== 'undefined'
      ? location.href.replace(/[^/]*$/, '')
      : '';
    const trackingUrl = `${_base}tracking.html?ref=${encodeURIComponent(ref)}`;
    const waLines = [`*Devis KOTE — ${ref}*`, `Date : ${d}`, ''];
    items.forEach(i => {
      if (i.snap?.type === 'brief') {
        waLines.push(`• Conception graphique${i.snap.brief_ref ? ' ('+i.snap.brief_ref+')' : ''} — Prix en attente`);
      } else {
        waLines.push(`• ${fmtN(i.quantity)} × ${i.prodName} — ${fmt(i.baseTotal)} DH`);
      }
    });
    waLines.push('', `*Total TTC : ${fmt(ttc)} DH*`, `Délai : ${ta?.days || ta?.label || ''}`);
    waLines.push('', `Suivre votre commande : ${trackingUrl}`);
    const waUrl = waPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines.join('\n'))}` : null;
    const itemsSnap = items.map(i => ({
      prodName: i.prodName, specs: i.specs || '', notes: i.notes || '',
      quantity: i.quantity, perUnit: i.perUnit, baseTotal: i.baseTotal,
      snap: i.snap ? JSON.parse(JSON.stringify(i.snap)) : {},
    }));
    // Snapshot the selected delivery city so it's readable in orders
    const deliveryCity = (DB.delivery_cities || []).find(c => c.id === opts.deliveryCityId) || null;
    return { ref, d, sub, surAmt, del, grand, tva, ttc, ta, waUrl, trackingUrl, itemsSnap, deliveryCity };
  }

  /* ── CRUD ── */
  function add(res) {
    if (!res) return;
    items.push({
      id: Date.now(), prodId: curProd.id, prodName: curProd.name, prodIcon: curProd.icon,
      specs: _specs(curSel), notes: curSel.notes || '',
      baseTotal: res.baseTotal, perUnit: res.perUnit, quantity: curSel.quantity,
      snap: { ...JSON.parse(JSON.stringify(curSel)), designCost: res.designCost || 0 },
    });
    _badge();    // Option A: green button flash + flying dot → badge pop
    const btn = document.querySelector('#cfgFooter .btn-p');
    if (btn && !btn._flashing) {
      btn._flashing = true;
      if (!btn.querySelector('.btn-slot')) btn.innerHTML = `<span class="btn-slot">${btn.innerHTML}</span>`;
      const slot     = btn.querySelector('.btn-slot');
      const origHTML = slot.innerHTML;
      const succ     = document.createElement('span');
      succ.className = 'btn-slot-success';
      succ.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#1a5c00" stroke-width="2.5" width="13" height="13" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Ajouté !`;
      btn.appendChild(succ);
      btn.disabled = true;
      requestAnimationFrame(() => {
        slot.classList.add('slide-out');
        btn.classList.add('success-state');
        setTimeout(() => {
          succ.classList.add('slide-in');
          // Launch flying dot toward the cart badge in the header
          _flyToBadge(btn);
          setTimeout(() => {
            succ.classList.remove('slide-in'); succ.classList.add('slide-out');
            btn.classList.remove('success-state');
            setTimeout(() => {
              slot.innerHTML = origHTML; slot.classList.remove('slide-out');
              succ.remove(); btn.disabled = false; btn._flashing = false;
            }, 300);
          }, 800);
        }, 30);
      });
    }
  }

  let _undoItem = null, _undoIdx = -1, _undoTimer = null;

  function _showUndo(item, idx) {
    _undoItem = item; _undoIdx = idx;
    clearTimeout(_undoTimer);
    document.querySelector('.cart-undo-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'cart-undo-toast';
    toast.innerHTML = `<span>${item.prodName} supprimé</span><button onclick="CART.undoRemove()">Annuler</button>`;
    $('cartDrawer').appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    _undoTimer = setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 280); _undoItem = null; }, 4000);
  }

  /* ── Add product only if not already in cart with same prodId ── */
  function addIfNew(res) {
    if (!res || !curProd) return;
    const alreadyInCart = items.some(i => i.prodId === curProd.id && i.snap?.type !== 'brief');
    if (!alreadyInCart) add(res);
  }

  function undoRemove() {
    if (!_undoItem) return;
    clearTimeout(_undoTimer);
    items.splice(_undoIdx, 0, _undoItem);
    _undoItem = null; _undoIdx = -1;
    document.querySelector('.cart-undo-toast')?.remove();
    _badge(); _renderDrawer();
  }

  function remove(id) {
    const idx = items.findIndex(i => i.id === id); if (idx < 0) return;
    const [item] = items.splice(idx, 1);
    _badge(); _renderDrawer(); _showUndo(item, idx);
  }
  function clear()   { items = []; _badge(); _renderDrawer(); }
  function edit(id) {
    const item = items.find(i => i.id === id); if (!item) return;
    STATE.set('editId', id); close(); loadProduct(item.prodId, item.snap);
    $('editBanner').classList.add('on');
  }
  function update(id, res) {
    if (!res) return;
    const idx = items.findIndex(i => i.id === id); if (idx < 0) return;
    items[idx] = { ...items[idx], specs: _specs(curSel), notes: curSel.notes || '',
      baseTotal: res.baseTotal, perUnit: res.perUnit, quantity: curSel.quantity,
      snap: JSON.parse(JSON.stringify(curSel)) };
    STATE.set('editId', null);
    $('editBanner').classList.remove('on');
    _badge(); UI.renderFooter(); open();
  }

  /* ── Drawer ── */
  function open()   {
    const list = _taList();
    if (list.length && (!opts.turnaround || !list.find(t => t.id === opts.turnaround))) {
      opts.turnaround = list[0].id;
    }
    $('cartOverlay').classList.add('open'); $('cartDrawer').classList.add('open'); _renderDrawer();
  }
  function close()  { $('cartOverlay').classList.remove('open'); $('cartDrawer').classList.remove('open'); }
  function resume() { close(); UI.show(curProd ? 'vCfg' : 'vEmpty'); }

  function _renderDrawer() {
    const body   = $('cartBody');
    const optsEl = $('cartOpts');
    const footer = $('cartFooter');

    if (!items.length) {
      body.innerHTML = `<div class="cart-empty">${IC.cart}<span class="cart-empty-txt">Panier vide</span></div>`;
      optsEl.style.display = 'none';
      footer.innerHTML = `<button class="btn-resume" onclick="CART.resume()">${IC['arrow-l']} Continuer</button>`;
      return;
    }

    body.innerHTML = items.map(item => {
      const isBrief = item.snap?.type === 'brief' || item.pending_price === true;
      if (isBrief) {
        return `
        <div class="ci ci-brief">
          <div class="ci-ico">${IC['pen-tool'] || IC.edit}</div>
          <div class="ci-body">
            <div class="ci-name">${item.prodName}</div>
            ${item.specs ? `<div class="ci-specs ci-specs--mono">${item.specs}</div>` : ''}
            <div class="ci-price ci-price-pending">
              <span class="ci-pending-badge">Prix en attente</span>
            </div>
          </div>
          <div class="ci-acts">
            <button class="ci-btn rm" title="Supprimer" onclick="CART.remove(${item.id})">${IC.trash}</button>
          </div>
        </div>`;
      }
      return `
      <div class="ci">
        <div class="ci-ico">${IC[item.prodIcon] || IC.layout}</div>
        <div class="ci-body">
          <div class="ci-name"><span class="ci-qty">${fmtN(item.quantity)}</span> ${item.prodName}</div>
          <div class="ci-specs">${item.specs}</div>
          ${item.notes ? `<div class="ci-notes">"${item.notes}"</div>` : ''}
          <div class="ci-price">${fmt(item.baseTotal)} DH</div>
          <div class="ci-unit">${fmt(item.perUnit)} DH / unité</div>
        </div>
        <div class="ci-acts">
          <button class="ci-btn ed" title="Modifier" onclick="CART.edit(${item.id})">${IC.edit}</button>
          <button class="ci-btn rm" title="Supprimer" onclick="CART.remove(${item.id})">${IC.trash}</button>
        </div>
      </div>`;
    }).join('');

    optsEl.style.display = 'flex';
    _renderOpts();
    _renderFooter();
  }

  function _renderOpts() {
    const cities = DB.delivery_cities || [];
    const minFee = cities.length ? Math.min(...cities.map(c => c.fee)) : (DB.pricing?.delivery_fee || 25);

    $('cartOpts').innerHTML = `
      ${DB.pricing?.ta_enabled !== false ? `<div>
        <div class="s-lbl">Délai de production</div>
        <div class="ta-pills">${_taList().map(t => {
          const cls = t.sur === 0 ? 's0' : t.id === 'same-day' ? 'sh' : 'sp-';
          const lbl = t.sur === 0 ? 'Inclus' : `+${Math.round(t.sur * 100)}%`;
          return `<div class="opt ta-p${opts.turnaround === t.id ? ' on' : ''}" onclick="CART.selTA('${t.id}')">
            <div class="ta-p-name">${t.label}</div>
            <div class="ta-p-days">${t.days}</div>
            <div class="ta-p-sur ${cls}">${lbl}</div>
          </div>`;
        }).join('')}</div>
      </div>` : ''}
      <div class="opt del-row${opts.delivery ? ' on' : ''}" onclick="CART.toggleDel()">
        <div class="del-l">
          <span class="del-ico-wrap">${IC.truck.replace('<svg ', '<svg width="15" height="15" ')}</span>
          <div>
            <div class="del-name">Livraison en ville</div>
            <div class="del-sub">Domicile ou bureau</div>
          </div>
        </div>
        <div class="del-r">
          <span class="del-price">À partir de ${minFee} DH</span>
          <div class="tog${opts.delivery ? ' on' : ''}"></div>
        </div>
      </div>`;
  }
  function _renderFooter() {
    const footer = $('cartFooter');
    const { sub, surAmt, del, grand } = CALC.cartTotal(items, opts, DB.pricing, DB.delivery_cities);
    const ta = _taList().find(t => t.id === opts.turnaround);
    const hasPending = items.some(i => i.pending_price === true || i.snap?.type === 'brief');
    footer.innerHTML = `
      ${hasPending ? `
      <div class="cart-pending-warn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          width="12" height="12" style="flex-shrink:0">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span>Un ou plusieurs articles ont un <strong>prix en attente</strong> — ils seront confirmés par notre équipe.</span>
      </div>` : ''}
      ${surAmt > 0 ? `<div class="sp"><span class="k">${ta.label} (+${Math.round(ta.sur * 100)}%)</span><span class="v wa">+${fmt(surAmt)} DH</span></div>` : ''}
      ${del > 0 ? (() => {
        const cities = DB.delivery_cities || [];
        const city   = cities.find(c => c.id === opts.deliveryCityId);
        const lbl    = city ? ' — ' + city.label : opts.delivery ? ' (estimation)' : '';
        const cls    = city ? '' : ' mu';
        return `<div class="sp"><span class="k">Livraison${lbl}</span><span class="v${cls}">+${fmt(del)} DH</span></div>`;
      })() : ''}
      <div class="grand-row">
        <span class="grand-lbl">Total HT</span>
        <span class="grand-val">${fmt(grand)} <span class="cur">DH</span></span>
      </div>
      ${ROLE === 'provider'
        ? `<div style="display:flex;gap:.4rem">
             <button class="btn btn-outline btn-h btn--fill-center" onclick="CART.checkout()">${IC['file-text']} Résumé</button>
             <button class="btn btn-p btn-h btn--fill-center" onclick="CART.checkoutInvoice()">${IC.printer} Devis PDF</button>
           </div>`
        : `<button class="btn btn-p btn-h btn--full-center" onclick="CART.checkout()">${IC['file-text']} Envoyer ma demande</button>`
      }
      <button class="btn-resume" onclick="CART.resume()">${IC['arrow-l']} Continuer mes achats</button>
      <button class="btn-xs" onclick="CART.clear()">Vider le panier</button>`;
  }

  /* ── Checkout — résumé screen + save to Supabase ── */
  function checkout() {
    close();

    /* CLIENT: hand off to order form — skip provider quote flow */
    if (ROLE === 'client') {
      const { ref, d, sub, surAmt, del, grand, tva, ttc, ta, itemsSnap } = _buildPayload();
      ORDERS.open({ ref, date: d, items: itemsSnap, totals: { sub, surAmt, del, grand, tva, ttc }, ta, shop: DB.shop || {} });
      return;
    }

    /* PROVIDER: save + show on-screen résumé */
    const { ref, d, sub, surAmt, del, grand, tva, ttc, ta, waUrl, trackingUrl, itemsSnap } = _buildPayload();
    QUOTES.save(ref, items, opts, { sub, surAmt, del, grand }, ta);
    // Link any brief cart items to this order ref in Supabase
    linkBriefsToOrder(ref);

    /* Plain-text summary for clipboard */
    const lines = ['=== DEVIS KOTE ===', `Réf : ${ref}`, `Date : ${d}`, '', '── PRODUITS ──'];
    items.forEach((item, i) => {
      lines.push(`${i + 1}. ${fmtN(item.quantity)} × ${item.prodName}`);
      lines.push(`   ${item.specs}`);
      if (item.notes) lines.push(`   Note : ${item.notes}`);
      lines.push(`   Sous-total : ${fmt(item.baseTotal)} DH  (${fmt(item.perUnit)} DH/u)`);
    });
    lines.push('', '── TOTAUX ──');
    if (surAmt > 0) lines.push(`${ta.label} (+${Math.round(ta.sur * 100)}%) : +${fmt(surAmt)} DH`);
    if (del > 0)    lines.push(`Livraison : +${fmt(del)} DH`);
    lines.push(`Total HT  : ${fmt(grand)} DH`, `TVA 20%   : ${fmt(tva)} DH`, `Total TTC : ${fmt(ttc)} DH`);
    lines.push('', '======================');
    _lastCheckoutText = lines.join('\n');

    /* ── Rich DF using global helpers ── */
    const deliveryCity = (DB.delivery_cities||[]).find(c=>c.id===opts.deliveryCityId);
    const dfText  = buildOrderDF(items, { sub, surAmt, del, grand, tva, ttc }, ta?.label, ta?.days, ref, d, deliveryCity?.label, null);

    /* Compact inline format for cfDfPanel (Location A) — one item per <li>:
       Line 1: bold name + qty | Line 2: all details as one continuous text block */
    const dfLines = (items||[]).map(item => {
      const s = item.snap || {};
      const parts = [];
      // Format / dimensions
      if (s.sizeObj?.label || (s.sizeObj?.w && s.sizeObj?.h)) {
        const dims = (s.sizeObj.w && s.sizeObj.h) ? ` (${s.sizeObj.w}×${s.sizeObj.h} mm)` : '';
        parts.push((s.sizeObj.label || 'Sur mesure') + dims);
      }
      if (s.gfW && s.gfH) parts.push(`${s.gfW}×${s.gfH} cm`);
      // Paper / material
      const pObj = (DB.paper_stocks||[]).find(p=>p.id===s.paper);
      if (pObj) parts.push(pObj.label);
      const pCovObj = (DB.paper_stocks||[]).find(p=>p.id===s.paperCover);
      if (pCovObj) parts.push('Couv. '+pCovObj.label);
      // Sides / pages
      if (s.sides==='double') parts.push('R/V');
      else if (s.sides==='single') parts.push('Recto');
      if (s.pages) parts.push(s.pages+'p.');
      // Lamination
      const lObj = (s.lam && s.lam!=='none') ? (DB.finishes||[]).find(f=>f.id===s.lam) : null;
      if (lObj) parts.push(lObj.label);
      const lCovObj = (s.lamCover && s.lamCover!=='none') ? (DB.finishes||[]).find(f=>f.id===s.lamCover) : null;
      if (lCovObj) parts.push(lCovObj.label+' couv.');
      // Binding / fold
      const bObj = (s.binding && s.binding!=='none') ? (DB.binding_options||[]).find(b=>b.id===s.binding) : null;
      if (bObj) parts.push(bObj.label);
      if (s.fold) parts.push(s.fold);
      // Envelope specifics
      if (s.envFormatId||s.envTypeId) {
        const ef = (DB.envelope_formats||[]).find(f=>f.id===s.envFormatId);
        const et = (DB.envelope_types||[]).find(t=>t.id===s.envTypeId);
        if (ef) parts.push(ef.name);
        if (et) parts.push(et.name);
        if (s.envFenetre) parts.push('Avec fenêtre');
        if (s.envColors) parts.push(s.envColors+' coul.');
      }
      // Carnet
      if (s.carnetPages&&s.carnetSouches) {
        parts.push(`${s.carnetPages}f.×${s.carnetSouches} souches`);
        if (s.carnetNumero) parts.push('Numéroté');
        if (s.carnetPerfo) parts.push('Perforé');
      }
      // Grand format material
      const gfMObj = (DB.gf_materials||[]).find(m=>m.id===s.gfMaterial);
      if (gfMObj) parts.push(gfMObj.label);
      // Addons
      (s.addons||[]).forEach(aid=>{const f=(DB.finishes_addon||[]).find(x=>x.id===aid);if(f)parts.push(f.label);});
      // Chemise / soufflet
      if (s.chemiseColle) parts.push('Rabat collé');
      if (s.chemiseImprime) parts.push('Rabat imprimé');
      if (s.sacSoufflet>0) parts.push('Soufflet '+s.sacSoufflet+'mm');
      // Design
      if (s.designOption==='service'&&s.designTier) parts.push('Design '+({basic:'Basic',pro:'Pro',premium:'Premium'}[s.designTier]||s.designTier));

      const detailLine = parts.length ? parts.join(' · ') : '';
      const noteHtml = item.notes&&item.notes.trim()
        ? `<span class="cf-note-warn"> · ⚠ ${item.notes}</span>` : '';
      return `<li class="cf-item-row">
        <div class="cf-item-name"><strong>${(item.quantity||0).toLocaleString('fr-FR')} × ${item.prodName}</strong></div>
        ${detailLine||noteHtml?`<div class="cf-item-detail">${detailLine}${noteHtml}</div>`:''}
      </li>`;
    }).join('');

    $('confirmBox').innerHTML = `
      <div class="cf-ico">${IC.check}</div>
      <h2 class="cf-title">Devis validé !</h2>
      <p class="cf-sub">Référence enregistrée · Notre équipe vous contacte sous 24h.</p>
      <div class="ref-box">
        <div class="ref-lbl">Référence</div>
        <div class="ref-val">${ref}</div>
        <table class="cf-table">
          <thead><tr>
            <th>Désignation</th><th class="cf-td-num">Qté</th><th class="cf-td-num">PU HT</th><th class="cf-td-num">Total HT</th>
          </tr></thead>
          <tbody>
            ${items.map(item => `
              <tr>
                <td>
                  <strong>${item.prodName}</strong>
                  ${item.specs ? `<br><span style="font-size:.59rem;color:var(--t2);font-weight:400">${item.specs}</span>` : ''}
                  ${item.notes ? `<br><em style="font-size:.57rem;color:var(--t3)">"${item.notes}"</em>` : ''}
                </td>
                <td class="cf-td-num">${fmtN(item.quantity)}</td>
                <td class="cf-td-num cf-td-num--t2">${fmt(item.perUnit)}</td>
                <td class="cf-td-num cf-td-num--bl">${fmt(item.baseTotal)} DH</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${surAmt > 0 ? `<tr><td class="cf-td-right" colspan="3">${ta.label} (+${Math.round(ta.sur * 100)}%)</td><td class="cf-td-num cf-td-num--am">+${fmt(surAmt)} DH</td></tr>` : ''}
            ${del > 0    ? `<tr><td class="cf-td-right" colspan="3">Livraison</td><td class="cf-td-num">+${fmt(del)} DH</td></tr>` : ''}
            <tr class="cf-total-row cf-ht-row">
              <td class="cf-td-right" colspan="3">Total HT</td>
              <td class="cf-td-num">${fmt(grand)} DH</td>
            </tr>
            <tr class="cf-tva-row">
              <td class="cf-td-right" colspan="3">TVA 20%</td>
              <td class="cf-td-num cf-td-num--t2">${fmt(tva)} DH</td>
            </tr>
            <tr class="cf-total-row">
              <td class="cf-td-right-plain" colspan="3">Total TTC</td>
              <td class="cf-td-num">${fmt(ttc)} DH</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="cf-btns">
        <button class="cf-ico-btn" id="cfCopyBtn" onclick="CART.copyText()" title="Copier le résumé">
          ${IC['file-text']}<span>Copier</span>
        </button>
        ${waUrl
          ? `<a class="cf-ico-btn cf-wa-btn" href="${waUrl}" target="_blank" rel="noopener" title="Envoyer par WhatsApp">${IC.whatsapp}<span>WhatsApp</span></a>`
          : `<button class="cf-ico-btn cf-wa-btn" onclick="ADMIN.open();ADMIN.selectTab('contact')" title="Configurer WhatsApp">${IC.whatsapp}<span>WhatsApp</span></button>`
        }
        ${ROLE === 'provider' ? `
        <button class="cf-ico-btn cf-pdf-btn" onclick="INVOICE.open(window._koteLastQuote)" title="Créer le devis PDF">
          ${IC.printer}<span>Devis PDF</span>
        </button>
        <button class="cf-ico-btn" id="cfDfBtn" onclick="CART.toggleCfDF()" title="Dossier de fabrication">
          ${IC['scroll']}<span>DF</span>
        </button>` : ''}
      </div>
      <!-- Tracking link card -->
      <div class="cf-track-card">
        <div>
          <div class="cf-track-lbl">Lien de suivi</div>
          <div class="cf-track-url">${trackingUrl}</div>
        </div>
        <button onclick="navigator.clipboard?.writeText('${trackingUrl}').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Copier',1800)})"
          class="cf-track-copy">
          Copier
        </button>
      </div>
      <div class="df-panel df-panel--mt" id="cfDfPanel">
        <div class="df-hdr">
          <span class="df-ttl">Dossier de fabrication</span>
          <button class="btn-ghost btn-ghost--sm" onclick="CART.copyDF('${encodeURIComponent(dfText)}',this)">Copier ↗</button>
        </div>
        <ul class="df-list">${dfLines}</ul>
      </div>
      <div class="cf-actions-mt">
        <button class="btn-xs" onclick="afterCheckout()">← Nouveau devis</button>
      </div>`;

    window._koteLastQuote = {
      ref, date: d, items: itemsSnap, totals: { sub, surAmt, del, grand, tva, ttc },
      ta, shop: DB.shop || {}, waUrl,
    };
    UI.show('vConfirm');
  }

  /* ── Direct-to-Invoice checkout (skips résumé screen) ── */
  function checkoutInvoice() {
    close();
    const { ref, d, sub, surAmt, del, grand, tva, ttc, ta, waUrl, itemsSnap } = _buildPayload();
    QUOTES.save(ref, items, opts, { sub, surAmt, del, grand }, ta);
    window._koteLastQuote = {
      ref, date: d, items: itemsSnap, totals: { sub, surAmt, del, grand, tva, ttc },
      ta, shop: DB.shop || {}, waUrl,
    };
    INVOICE.open(window._koteLastQuote);
  }

  /* ── Clipboard helpers ── */
  function copyText() {
    const btn   = $('cfCopyBtn');
    const reset = () => { if (btn) { btn.innerHTML = `${IC['file-text']}<span>Copier</span>`; btn.style.background = ''; } };
    _copy(_lastCheckoutText, () => {
      if (btn) { btn.textContent = '✓ Copié !'; btn.style.background = 'var(--gn)'; setTimeout(reset, 2200); }
    });
  }

  function copyDF(encoded, triggerEl) {
    const reset = () => { if (triggerEl) triggerEl.textContent = 'Copier ↗'; };
    _copy(decodeURIComponent(encoded), () => {
      if (triggerEl) { triggerEl.textContent = '✓ Copié !'; setTimeout(reset, 2000); }
    });
  }

  function toggleCfDF() {
    const panel = $('cfDfPanel'), btn = $('cfDfBtn');
    const on = panel.classList.toggle('on');
    if (btn) btn.classList.toggle('on', on);
  }

  let _delOpen = false;      // kept for compat
  let _delDropOpen = false;  // city search dropdown state
  function selTA(id)         { opts.turnaround = id;        _renderOpts(); _renderFooter(); }
  function toggleDel() {
    opts.delivery = !opts.delivery;
    if (!opts.delivery) opts.deliveryCityId = null; // clear city when toggling off
    _renderOpts(); _renderFooter();
  }
  function selCity(id) {
    opts.deliveryCityId = id;
    opts.delivery = true;
    _delDropOpen = false;
    _renderOpts(); _renderFooter();
  }
  function clearCity() {
    opts.deliveryCityId = null;
    _delDropOpen = false;
    _renderOpts(); _renderFooter();
  }
  function toggleDelSection() { _delDropOpen = !_delDropOpen; _renderOpts(); }
  function openCityDrop() {
    _delDropOpen = true;
    _renderDrop('');
    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function _close(e) {
        if (!e.target.closest('.del-search-wrap')) {
          _delDropOpen = false;
          document.removeEventListener('click', _close);
          _renderOpts();
        }
      });
    }, 0);
  }
  function filterCities(q) {
    _delDropOpen = true;
    _renderDrop(q);
  }
  function _renderDrop(q) {
    const drop = $('delCityDrop');
    if (!drop) return;
    const cities = DB.delivery_cities || [];
    const sq = (q||'').toLowerCase().trim();
    const results = sq
      ? cities.filter(c => c.label.toLowerCase().includes(sq)).slice(0, 30)
      : cities.slice(0, 30);
    if (!results.length) {
      drop.innerHTML = `<div class="del-drop-empty">Aucune ville trouvée</div>`;
      return;
    }
    drop.innerHTML = results.map(c => `
      <div class="del-drop-item${opts.deliveryCityId===c.id?' on':''}" onclick="CART.selCity('${c.id}')">
        <span class="del-drop-name">${c.label}</span>
        <span class="del-drop-fee">${fmt(c.fee)} DH</span>
      </div>`).join('');
  }


  /* ── Option A: fly dot from add-button to cart badge ── */
  function _flyToBadge(btn) {
    const badge = $('cartBadge');
    if (!badge || !btn) return;
    const bR = btn.getBoundingClientRect();
    const baBadge = badge.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.style.cssText = [
      'position:fixed',
      `left:${bR.left + bR.width / 2 - 5}px`,
      `top:${bR.top + bR.height / 2 - 5}px`,
      'width:10px', 'height:10px',
      'border-radius:50%',
      'background:#2563eb',
      'pointer-events:none',
      'z-index:9999',
      'transition:none',
    ].join(';');
    document.body.appendChild(dot);
    const dx = (baBadge.left + baBadge.width / 2) - (bR.left + bR.width / 2);
    const dy = (baBadge.top  + baBadge.height / 2) - (bR.top  + bR.height / 2);
    requestAnimationFrame(() => {
      dot.style.transition = 'transform .48s cubic-bezier(.4,0,.2,1), opacity .48s ease';
      dot.style.transform  = `translate(${dx}px,${dy}px) scale(.35)`;
      dot.style.opacity    = '0';
    });
    setTimeout(() => {
      dot.remove();
      // Badge pop
      badge.classList.remove('badge-pop');
      void badge.offsetWidth;
      badge.classList.add('badge-pop');
      setTimeout(() => badge.classList.remove('badge-pop'), 400);
    }, 460);
  }

  return { add, addIfNew, addBrief, linkBriefsToOrder, remove, undoRemove, edit, update, clear, open, close, resume, checkout, checkoutInvoice, copyText, toggleCfDF, copyDF, selTA, toggleDel, selCity, clearCity, toggleDelSection, filterCities, openCityDrop, _renderDrop };
})();
