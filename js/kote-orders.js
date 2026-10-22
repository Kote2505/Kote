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
        style="width:20px;height:20px;opacity:.4;animation:spin 1s linear infinite">
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
          <small style="font-weight:400;margin-top:.2rem;display:block;color:var(--t3)">
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
        ? `<span class="hq-meta" style="color:var(--t2);font-weight:600">${q.client_nom}${q.client_ice?' · ICE '+q.client_ice:''}</span>`
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
            <div style="display:flex;justify-content:flex-end;padding-top:.3rem;margin-top:.15rem;border-top:1px solid var(--bd)">
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
      if (lamIntObj) lines.push(`  Pelliculage int.: ${lamIntObj.label}`);
      if (s.pancarteMat) {
        const pm = (DB?.pancarte_materials || []).find(x => x.id === s.pancarteMat);
        if (pm) lines.push(`  Matière         : ${pm.label}`);
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

    // ── Forme de découpe ──
    if (s.fd?.enabled) {
      lines.push(`  Forme de découpe: ${s.fd.reuse ? 'Gabarit existant (réutilisation)' : 'Nouvelle forme'}`);
    }

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
        const sup = (DB?.rollup_supports || []).find(x => x.id === (s.rollupSupportId || (typeof curProd !== 'undefined' ? curProd?.support_id : null)));
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
      if (lamIntObj) html += _row('Pelliculage int.', lamIntObj.label);
      if (s.pancarteMat) {
        const pm = (DB?.pancarte_materials || []).find(x => x.id === s.pancarteMat);
        if (pm) html += _row('Matière', pm.label);
      }
    }

    // Common fields
    if (!isCat && s.fold)  html += _row('Pliage', s.fold);
    if (bindObj)           html += _row('Reliure', bindObj.label);
    if (s.chemiseColle)    html += _row('Rabat collé', 'Oui');
    if (s.chemiseImprime)  html += _row('Rabat imprimé', 'Oui');
    if (s.sacSoufflet > 0) html += _row('Soufflet', `${s.sacSoufflet} mm`);
    if (s.fd?.enabled)     html += _row('Forme de découpe', s.fd.reuse ? 'Gabarit existant (réutilisation)' : 'Nouvelle forme');
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
  let opts  = { turnaround: 'standard', delivery: false, deliveryCityId: null };
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
    if (s.lamInterior && s.lamInterior !== 'none') { const lf = (DB?.finishes || []).find(f => f.id === s.lamInterior); if (lf) parts.push(lf.label + ' int.'); }
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
    if (s.fd?.enabled)    parts.push(s.fd.reuse ? 'FD existante' : 'Forme de découpe');
    if (s.carnetPages && s.carnetSouches) {
      parts.push(`${s.carnetPages} f. × ${s.carnetSouches} souches`);
      if (s.carnetColors)  parts.push(`${s.carnetColors}c offset`);
      if (s.carnetNumero)  parts.push('Numéroté' + (s.carnetNumStart > 1 ? ` (N°${s.carnetNumStart})` : ''));
      if (s.carnetPerfo)   parts.push('Perforé');
      if (s.carnetCover)   parts.push('Couv. imprimée');
    }
    if (s.envFormatId || s.envTypeId) {
      const envFmt  = (DB?.envelope_formats || []).find(f => f.id === s.envFormatId);
      const envType = (DB?.envelope_types   || []).find(t => t.id === s.envTypeId);
      if (envFmt)  parts.push(envFmt.name + (envFmt.w && envFmt.h ? ` ${envFmt.w}×${envFmt.h}mm` : ''));
      if (envType) parts.push(envType.name);
      if (s.envFenetre)  parts.push('Avec fenêtre');
      if (s.envColors)   parts.push(`${s.envColors}c offset`);
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
    const ta   = DB.turnaround_options.find(t => t.id === opts.turnaround);
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
  function open()   { $('cartOverlay').classList.add('open');    $('cartDrawer').classList.add('open');    _renderDrawer(); }
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
            ${item.specs ? `<div class="ci-specs" style="font-family:'Courier New',monospace;font-weight:700;color:var(--bl)">${item.specs}</div>` : ''}
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
      <div>
        <div class="s-lbl">Délai de production</div>
        <div class="ta-pills">${DB.turnaround_options.map(t => {
          const cls = t.sur === 0 ? 's0' : t.id === 'same-day' ? 'sh' : 'sp-';
          const lbl = t.sur === 0 ? 'Inclus' : `+${Math.round(t.sur * 100)}%`;
          return `<div class="opt ta-p${opts.turnaround === t.id ? ' on' : ''}" onclick="CART.selTA('${t.id}')">
            <div class="ta-p-name">${t.label}</div>
            <div class="ta-p-days">${t.days}</div>
            <div class="ta-p-sur ${cls}">${lbl}</div>
          </div>`;
        }).join('')}</div>
      </div>
      <div class="opt del-row${opts.delivery ? ' on' : ''}" onclick="CART.toggleDel()">
        <div class="del-l">
          <span style="width:15px;height:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--t2)">${IC.truck.replace('<svg ', '<svg width="15" height="15" ')}</span>
          <div>
            <div class="del-name">Livraison en ville</div>
            <div class="del-sub">Domicile ou bureau</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:.35rem">
          <span class="del-price">À partir de ${minFee} DH</span>
          <div class="tog${opts.delivery ? ' on' : ''}"></div>
        </div>
      </div>`;
  }
  function _renderFooter() {
    const footer = $('cartFooter');
    const { sub, surAmt, del, grand } = CALC.cartTotal(items, opts, DB.pricing, DB.delivery_cities);
    const ta = DB.turnaround_options.find(t => t.id === opts.turnaround);
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
             <button class="btn btn-outline btn-h" style="flex:1;justify-content:center" onclick="CART.checkout()">${IC['file-text']} Résumé</button>
             <button class="btn btn-p btn-h" style="flex:1;justify-content:center" onclick="CART.checkoutInvoice()">${IC.printer} Devis PDF</button>
           </div>`
        : `<button class="btn btn-p btn-h" style="width:100%;justify-content:center" onclick="CART.checkout()">${IC['file-text']} Envoyer ma demande</button>`
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
        ? `<span style="color:#b45309;font-style:italic"> · ⚠ ${item.notes}</span>` : '';
      return `<li style="padding:.22rem 0;border-bottom:1px solid #e2e8f0;line-height:1.4">
        <div style="font-size:.72rem"><strong>${(item.quantity||0).toLocaleString('fr-FR')} × ${item.prodName}</strong></div>
        ${detailLine||noteHtml?`<div style="font-size:.62rem;color:#475569">${detailLine}${noteHtml}</div>`:''}
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
                <td class="cf-td-num" style="color:var(--t2)">${fmt(item.perUnit)}</td>
                <td class="cf-td-num" style="color:var(--bl);font-weight:700">${fmt(item.baseTotal)} DH</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${surAmt > 0 ? `<tr><td style="text-align:right;color:var(--t2)" colspan="3">${ta.label} (+${Math.round(ta.sur * 100)}%)</td><td class="cf-td-num" style="color:var(--am)">+${fmt(surAmt)} DH</td></tr>` : ''}
            ${del > 0    ? `<tr><td style="text-align:right;color:var(--t2)" colspan="3">Livraison</td><td class="cf-td-num">+${fmt(del)} DH</td></tr>` : ''}
            <tr class="cf-total-row cf-ht-row">
              <td style="text-align:right;color:var(--t2)" colspan="3">Total HT</td>
              <td class="cf-td-num">${fmt(grand)} DH</td>
            </tr>
            <tr class="cf-tva-row">
              <td style="text-align:right;color:var(--t2)" colspan="3">TVA 20%</td>
              <td class="cf-td-num" style="color:var(--t2)">${fmt(tva)} DH</td>
            </tr>
            <tr class="cf-total-row">
              <td style="text-align:right" colspan="3">Total TTC</td>
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
      <div style="margin-top:.5rem;padding:.5rem .65rem;background:var(--bl-lt,#ebf2ff);
        border:1px solid var(--bl-md,#bfdbfe);border-radius:8px;
        display:flex;align-items:center;justify-content:space-between;gap:.5rem">
        <div>
          <div style="font-size:.58rem;font-weight:700;color:var(--bl);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Lien de suivi</div>
          <div style="font-size:.62rem;color:var(--t1);font-family:'Courier New',monospace;word-break:break-all">${trackingUrl}</div>
        </div>
        <button onclick="navigator.clipboard?.writeText('${trackingUrl}').then(()=>{this.textContent='✓';setTimeout(()=>this.textContent='Copier',1800)})"
          style="flex-shrink:0;padding:.28rem .55rem;border:1.5px solid var(--bl-md,#bfdbfe);border-radius:6px;
          background:#fff;font-size:.6rem;font-weight:700;color:var(--bl);cursor:pointer;font-family:inherit">
          Copier
        </button>
      </div>
      <div class="df-panel" id="cfDfPanel" style="margin-top:.5rem;text-align:left">
        <div class="df-hdr">
          <span class="df-ttl">Dossier de fabrication</span>
          <button class="btn-ghost" style="font-size:.6rem" onclick="CART.copyDF('${encodeURIComponent(dfText)}',this)">Copier ↗</button>
        </div>
        <ul class="df-list">${dfLines}</ul>
      </div>
      <div style="margin-top:.55rem">
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


/* ══════════════════════════════════════════════════════════════
   KOTE INVOICE PREVIEW  v6.0
   ══════════════════════════════════════════════════════════════
   window.INVOICE.open(quoteData)
   window.INVOICE.setImage(key, dataURL)
   ══════════════════════════════════════════════════════════════ */
window.INVOICE = (() => {
  
  /* ── Layout constants ── */
  const DOC_W = 794, DOC_H = 1123;
  const CT    = 128, CS = 48;   // content top / side offsets

  const CDN_H2C  = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  const CDN_JPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  /* ══════════════════════════════════════════════════════════
     Images — stored as base64 in localStorage
  ══════════════════════════════════════════════════════════ */
  const LS = { lh:'kote_img_lh', stamp:'kote_img_stamp', sig:'kote_img_sig' };
  const _b64 = { lh:null, stamp:null, sig:null };

  function _loadB64() {
    for (const [k,lk] of Object.entries(LS)) _b64[k] = localStorage.getItem(lk) || null;
  }
  function setImage(key, dataURL) {
    if (!LS[key]) return;
    dataURL ? localStorage.setItem(LS[key], dataURL) : localStorage.removeItem(LS[key]);
    _b64[key] = dataURL || null;
    if (key === 'lh') { const i = document.querySelector('#inv-lh img'); if (i) i.src = dataURL || 'images/letterhead.png'; }
  }
  function _src(k) { return _b64[k] || (k==='lh'?'images/letterhead.png':k==='stamp'?'images/stamp.png':'images/signature.png'); }

  /* Load any image (relative URL or data-URL) to base64.
     Strategy:
     1. data-URL already → return as-is
     2. XHR blob → FileReader (no canvas = no taint, works on file://)
     3. Canvas fallback for http/https when XHR fails (e.g. opaque cross-origin) */
  async function _imgToB64(src) {
    if (!src) return null;
    if (src.startsWith('data:')) return src;

    /* XHR blob approach — avoids canvas SecurityError on file:// */
    try {
      const blob = await new Promise((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', src);
        xhr.responseType = 'blob';
        /* status 0 = success on file://, 200 on http */
        xhr.onload = () => (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300))
          ? res(xhr.response) : rej(new Error('HTTP ' + xhr.status));
        xhr.onerror = rej;
        xhr.send();
      });
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload  = () => res(fr.result);
        fr.onerror = () => rej(new Error('FileReader error'));
        fr.readAsDataURL(blob);
      });
    } catch(e) { /* fall through to canvas */ }

    /* Canvas fallback (http/https same-origin or CORS-enabled) */
    return new Promise(res => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || img.width;
          cv.height = img.naturalHeight || img.height;
          cv.getContext('2d').drawImage(img, 0, 0);
          res(cv.toDataURL('image/png'));
        } catch(e) { res(null); }
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  /* ══════════════════════════════════════════════════════════
     State
  ══════════════════════════════════════════════════════════ */
  let _q       = null;
  let _dbId    = null;
  let _cl      = { id:null, nom:'', adresse:'', ice:'', tel:'', email:'' };
  let _type    = 'devis';
  let _layers  = { lh:true, stamp:false, sig:false };
  let _dovs    = { stamp:null, sig:null };
  let _blob    = null;
  let _fname   = '';
  let _srchTO  = null;
  let _mobView = 'form';
  const _COND_DEFAULT = 'Un acompte de 50% est exigible à la commande. Le solde de 50% est dû à la livraison.';
  let _condOn   = true;
  let _condText = _COND_DEFAULT;
  let _validDate = '';
  let _tvaOn    = false;
  let _tvaRate  = 20;
  let _depositOn = false;
  let _deposit   = 0;

  /* ══════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════
     SVG icons
  ══════════════════════════════════════════════════════════ */
  const I = {
    doc:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    x:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    srch:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>`,
    save:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    lh:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="5" rx="1"/><line x1="2" y1="11" x2="22" y2="11" stroke-dasharray="3 2"/><line x1="2" y1="15" x2="16" y2="15" stroke-dasharray="3 2"/></svg>`,
    stamp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 21h12M8 17c0-2.21 1.79-4 4-4s4 1.79 4 4v1H8v-1z"/></svg>`,
    sig:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18c3-6 5-9 7-9s2 3 4 3 4-4.5 7-10.5"/><path d="M3 21h18"/></svg>`,
    wa:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    mail:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
    dl:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="2" x2="12" y2="16"/></svg>`,
    share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    form:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`,
    eye:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };

  /* ══════════════════════════════════════════════════════════
     Helpers
  ══════════════════════════════════════════════════════════ */
  const _$   = id => document.getElementById(id);

  function _lettre(n) {
    const u=['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const d=['','','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
    if(!n||n===0) return 'zéro';
    function hw(x){if(x<20)return u[x];const di=Math.floor(x/10),un=x%10;if(di<7)return d[di]+(un?(un===1&&di<8?'-et-un':'-'+u[un]):(di===8?'s':''));if(di===7)return'soixante-'+(un?u[10+un]:'dix');if(di===8)return'quatre-vingt'+(un?'-'+u[un]:'s');return'quatre-vingt-'+u[10+un];}
    function grp(x){const h=Math.floor(x/100),r=x%100;let s='';if(h)s+=(h===1?'cent':u[h]+' cent')+(h>1&&!r?'s':'');if(h&&r)s+=' ';s+=hw(r);return s;}
    const int=Math.floor(n), dec=Math.round((n-int)*100);
    const pts=[];
    if(int>=1000){const m=Math.floor(int/1000);pts.push(m===1?'mille':grp(m)+' mille');}
    if(int%1000) pts.push(grp(int%1000));
    let r=pts.join(' ').trim();
    r=r.charAt(0).toUpperCase()+r.slice(1);
    return r+(dec>0?' et '+grp(dec)+' centimes':'')+' dirhams';
  }

  /* ══════════════════════════════════════════════════════════
     Supabase
  ══════════════════════════════════════════════════════════ */
  function _sbH(extra={}) {
    const k=window.SUPABASE_ANON_KEY||'';
    return {'apikey':k,'Authorization':'Bearer '+k,'Content-Type':'application/json',...extra};
  }
  async function _sbSearch(q) {
    /* JSON mode — search embedded clients if available */
    if (window._jsonClients) {
      const lq = q.toLowerCase();
      return window._jsonClients.filter(c =>
        (c.nom||'').toLowerCase().includes(lq) ||
        (c.ice||'').toLowerCase().includes(lq)
      ).slice(0, 8);
    }
    const url=`${window.SUPABASE_URL}/rest/v1/kote_clients?select=id,nom,adresse,ice,tel,email&or=(nom.ilike.*${encodeURIComponent(q)}*,ice.ilike.*${encodeURIComponent(q)}*)&limit=8`;
    const r=await fetch(url,{headers:_sbH()});if(!r.ok)throw new Error(await r.text());
    return r.json();
  }
  async function _sbInsertClient(payload) {
    const url=`${window.SUPABASE_URL}/rest/v1/kote_clients`;
    const r=await fetch(url,{method:'POST',headers:_sbH({'Prefer':'return=representation'}),body:JSON.stringify(payload)});
    if(!r.ok)throw new Error(await r.text());
    return (await r.json())[0];
  }
  async function _sbUpsertQuote(quotePayload) {
    const url=`${window.SUPABASE_URL}/rest/v1/kote_quotes`;
    const body={
      ref:        quotePayload.ref,
      status:     _type,
      client_nom: _cl.nom||'',
      client_ice: _cl.ice||'',
      total_ht:   quotePayload.totals?.grand||0,
      total_ttc:  quotePayload.totals?.ttc||quotePayload.totals?.grand||0,
      payload:    quotePayload,
    };
    const r=await fetch(url,{method:'POST',headers:_sbH({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await r.text());
    return (await r.json())[0];
  }

  /* ══════════════════════════════════════════════════════════
     Inject HTML + CSS
  ══════════════════════════════════════════════════════════ */
  function _inject() {
    if (_$('inv-ovl')) return;

    document.body.insertAdjacentHTML('beforeend',`
<div id="inv-ovl">
 <div id="inv-panel">

  <!-- ════ SIDEBAR ════ -->
  <div id="inv-sb">
   <div id="inv-hd">
    <div id="inv-hd-ico">${I.doc}</div>
    <div style="flex:1;min-width:0">
     <div id="inv-hd-title">Aperçu document</div>
     <div id="inv-hd-sub" style="font-size:9px;color:#94a3b8;margin-top:1px">Devis · Facture</div>
    </div>
    <button class="inv-x" onclick="INVOICE.close()" title="Fermer">${I.x}</button>
   </div>

   <div id="inv-bd">

    <!-- 1. Type + Import -->
    <div class="isec">
     <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px">
      <div class="isec-ttl" style="margin-bottom:0">Document</div>
      <button class="iimport-btn" id="inv-imp-toggle" onclick="INVOICE._toggleImport()">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 15V3m0 12l-4-4m4 4l4-4M3 18v2a1 1 0 001 1h16a1 1 0 001-1v-2"/></svg>
       Importer
      </button>
     </div>
     <div class="itype">
      <button class="itbtn on" id="inv-t-d" onclick="INVOICE._setType('devis')">Devis</button>
      <button class="itbtn"    id="inv-t-f" onclick="INVOICE._setType('facture')">Facture</button>
     </div>
     <div class="iimport-panel" id="inv-imp-panel">
      <div class="iimport-search">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="11" height="11"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>
       <input id="inv-imp-q" type="text" placeholder="Ref, client…" autocomplete="off"
              oninput="INVOICE._impSearch(this.value)">
      </div>
      <div class="iimport-list" id="inv-imp-list">
       <div class="iimport-msg">Tapez pour chercher…</div>
      </div>
     </div>
    </div>

    <!-- 2. Client -->
    <div class="isec">
     <div class="isec-ttl">Client</div>

     <!-- chip (shown after picking from DB) -->
     <div class="icl-chip" id="inv-chip">
      <div class="icl-chip-info">
       <div class="icl-chip-name" id="inv-chip-name"></div>
       <div class="icl-chip-sub"  id="inv-chip-sub"></div>
      </div>
      <button class="icl-chip-x" onclick="INVOICE._resetClient()" title="Changer">${I.x}</button>
     </div>

     <!-- search -->
     <div style="position:relative" id="inv-srch-wrap">
      <div class="icl-search">
       ${I.srch}
       <input id="inv-cl-q" type="text" placeholder="Rechercher dans la base…"
              autocomplete="off"
              oninput="INVOICE._onSearch(this.value)"
              onfocus="INVOICE._onSearch(this.value)">
       <button class="icl-clr" id="inv-cl-clr" onclick="INVOICE._clearSearch()" style="display:none">${I.x}</button>
      </div>
      <div class="icl-drop" id="inv-cl-drop">
       <div class="icl-dr-msg">Tapez pour rechercher…</div>
      </div>
     </div>

     <!-- form (always shown, fills when picking from search) -->
     <div class="icl-form" id="inv-cl-form">
      <div class="ifl"><label>Nom / Société *</label>
       <input id="inv-fn" type="text" placeholder="Nom ou raison sociale"
              oninput="INVOICE._syncCl()">
      </div>
      <div class="ifl"><label>Adresse</label>
       <textarea id="inv-fa" placeholder="Rue, ville…" oninput="INVOICE._syncCl()"></textarea>
      </div>
      <div class="ifl-row">
       <div class="ifl"><label>ICE</label><input id="inv-fi" type="text" oninput="INVOICE._syncCl()"></div>
       <div class="ifl"><label>Tél</label><input id="inv-ft2" type="text" oninput="INVOICE._syncCl()"></div>
      </div>
      <div class="ifl"><label>Email</label>
       <input id="inv-fe" type="email" oninput="INVOICE._syncCl()">
      </div>
      <!-- appears when nom is filled and client is new -->
      <button class="icl-save" id="inv-cl-save" onclick="INVOICE._saveClient()">
       ${I.save} Ajouter à la base de données
      </button>
     </div>
    </div>

    <!-- 3. Éléments visuels (pill row) -->
    <div class="isec">
     <div class="isec-ttl">Éléments visuels</div>
     <div class="ilpills">
      <button class="ilpill on" id="inv-pl-lh"    onclick="INVOICE._layer('lh')">${I.lh} En-tête</button>
      <button class="ilpill"    id="inv-pl-stamp"  onclick="INVOICE._layer('stamp')">${I.stamp} Cachet</button>
      <button class="ilpill"    id="inv-pl-sig"    onclick="INVOICE._layer('sig')">${I.sig} Signature</button>
     </div>
    </div>

    <!-- 4. Conditions & Validité -->
    <div class="isec">
     <div class="icond-toggle">
      <div class="isec-ttl" style="margin-bottom:0">Conditions de règlement</div>
      <button class="icond-pill on" id="inv-cond-pill" onclick="INVOICE._toggleCond()">Activé</button>
     </div>
     <div class="icond-body" id="inv-cond-body">
      <div class="ifl">
       <label>Texte des conditions</label>
       <textarea id="inv-cond-txt" class="ifl icond-txt" oninput="INVOICE._syncCond(this.value)"></textarea>
      </div>
      <div class="ifl">
       <label>Validité du devis (optionnel)</label>
       <input type="date" id="inv-valid-date" onchange="INVOICE._syncValidDate(this.value)">
      </div>
     </div>
    </div>

    <!-- 5. TVA -->
    <div class="isec">
     <div class="icond-toggle">
      <div class="isec-ttl" style="margin-bottom:0">TVA</div>
      <button class="icond-pill" id="inv-tva-pill" onclick="INVOICE._toggleTva()">OFF</button>
     </div>
     <div class="icond-body off" id="inv-tva-body">
      <div class="ifl">
       <label>Taux TVA (%)</label>
       <input type="number" id="inv-tva-rate" min="0" max="100" step="0.1" value="20"
              oninput="INVOICE._syncTvaRate(+this.value)">
      </div>
     </div>
    </div>



   </div><!-- #inv-bd -->

   <!-- Footer -->
   <div id="inv-ft">
    <button class="ibtn ibtn-gen" id="inv-gen-btn" onclick="INVOICE._generate()">
     ${I.doc} Générer le PDF
    </button>
    <div id="inv-tray">
     <div class="itray-lbl">Partager le PDF</div>
     <div class="itray-row">
      <a  class="itr itr-wa" id="inv-tr-wa" href="#" onclick="event.preventDefault();INVOICE._shareWA()" style="display:none">${I.wa} WhatsApp</a>
      <button class="itr itr-ml" onclick="INVOICE._shareMail()">${I.mail} Mail</button>
     </div>
     <div class="itray-row">
      <button class="itr itr-dl" onclick="INVOICE._dl()">${I.dl} Télécharger</button>
      <button class="itr itr-sh" id="inv-tr-sh" onclick="INVOICE._share()" style="display:none">${I.share} Partager</button>
     </div>
    </div>
    <button class="ibtn ibtn-back" onclick="INVOICE.close()">← Retour</button>
   </div>
  </div><!-- #inv-sb -->

  <!-- ════ PREVIEW ════ -->
  <div id="inv-prev">
   <div id="inv-doc-wrap">
    <div id="inv-doc">
     <div id="inv-lh" class="on"><img src="images/letterhead.png" alt=""></div>
     <div id="inv-ct"></div>
     <div id="inv-spin"><div class="isp"></div><p>Génération…</p></div>
    </div>
   </div>
  </div>

  <!-- ════ MOBILE BOTTOM BAR ════ -->
  <div id="inv-mob-bar">
   <button class="imb-btn on" id="inv-mb-form" onclick="INVOICE._mobSwitch('form')">
    ${I.form} Formulaire
   </button>
   <button class="imb-btn" id="inv-mb-prev" onclick="INVOICE._mobSwitch('preview')">
    ${I.eye} Aperçu
   </button>
  </div>

 </div><!-- #inv-panel -->
</div>`);

    window.addEventListener('resize', _onResize);
    document.addEventListener('click', e => {
      if (!e.target.closest('#inv-srch-wrap')) _$('inv-cl-drop')?.classList.remove('on');
    });
  }

  /* ══════════════════════════════════════════════════════════
     Scale + mobile
  ══════════════════════════════════════════════════════════ */
  function _onResize() { _scaleDoc(); _mobLayout(); }

  function _scaleDoc() {
    const prev=_$('inv-prev'), wrap=_$('inv-doc-wrap');
    if(!prev||!wrap) return;
    /* Reset transform first so offsetHeight reflects true layout height */
    wrap.style.transform = 'none';
    const actualH = wrap.offsetHeight || DOC_H;
    const mob = window.innerWidth <= 700;
    if (mob) {
      const avail = prev.clientWidth - 16;
      const sc = avail / DOC_W;
      wrap.style.transformOrigin = 'top left';
      wrap.style.transform  = `scale(${sc})`;
      wrap.style.marginBottom = (actualH * sc - actualH) + 'px';
      wrap.style.marginRight  = (DOC_W  * sc - DOC_W)   + 'px';
      wrap.style.marginLeft   = '';
    } else {
      const sc = Math.min(
        (prev.clientWidth  - 32) / DOC_W,
        (prev.clientHeight - 40) / actualH,
        1
      );
      wrap.style.transformOrigin = 'top center';
      wrap.style.transform = `scale(${sc})`;
      wrap.style.marginBottom = (actualH * sc - actualH) + 'px';
      wrap.style.marginRight  = '';
    }
  }

  function _mobLayout() {
    const mob = window.innerWidth <= 700;
    const sb = _$('inv-sb'), pv = _$('inv-prev');
    if (!sb || !pv) return;
    if (!mob) {
      sb.classList.remove('mob-hidden');
      pv.classList.remove('mob-hidden');
      return;
    }
    sb.classList.toggle('mob-hidden', _mobView !== 'form');
    pv.classList.toggle('mob-hidden', _mobView !== 'preview');
  }

  function _mobSwitch(view) {
    _mobView = view;
    _$('inv-mb-form')?.classList.toggle('on', view === 'form');
    _$('inv-mb-prev')?.classList.toggle('on', view === 'preview');
    _mobLayout();
    if (view === 'preview') requestAnimationFrame(_scaleDoc);
  }

  function _getScale() {
    const w=_$('inv-doc-wrap'); if(!w) return 1;
    return new DOMMatrix(getComputedStyle(w).transform).a || 1;
  }

  /* ══════════════════════════════════════════════════════════
     Layer pills
  ══════════════════════════════════════════════════════════ */
  function _layer(k) {
    _layers[k] = !_layers[k];
    _$(`inv-pl-${k}`)?.classList.toggle('on', _layers[k]);
    if (k === 'lh') { _$('inv-lh')?.classList.toggle('on', _layers[k]); }
    else if (_layers[k]) { _dovs[k] ? (_dovs[k].style.display='') : _mkDov(k); }
    else { if (_dovs[k]) _dovs[k].style.display='none'; }
    /* Persist layer prefs so they survive next INVOICE.open() */
    try { localStorage.setItem('kote_inv_layers', JSON.stringify(_layers)); } catch(e) {}
  }

  function _toggleCond() {
    _condOn = !_condOn;
    const pill = _$('inv-cond-pill'), body = _$('inv-cond-body');
    if (pill) { pill.classList.toggle('on', _condOn); pill.textContent = _condOn ? 'Activé' : 'Désactivé'; }
    if (body) body.classList.toggle('off', !_condOn);
    _renderDoc();
  }
  function _syncCond(val) { _condText = val; _renderDoc(); }
  function _syncValidDate(val) { _validDate = val; _renderDoc(); }

  function _toggleTva() {
    _tvaOn = !_tvaOn;
    const pill = _$('inv-tva-pill'), body = _$('inv-tva-body');
    if (pill) { pill.classList.toggle('on', _tvaOn); pill.textContent = _tvaOn ? `${_tvaRate}%` : 'OFF'; }
    if (body) body.classList.toggle('off', !_tvaOn);
    _renderDoc();
  }
  function _syncTvaRate(val) {
    _tvaRate = isNaN(val)||val<0 ? 20 : val;
    const pill = _$('inv-tva-pill');
    if (pill && _tvaOn) pill.textContent = `${_tvaRate}%`;
    _renderDoc();
  }

  function _toggleDeposit() {
    _depositOn = !_depositOn;
    const pill = _$('inv-dep-pill'), body = _$('inv-dep-body');
    if (pill) { pill.classList.toggle('on', _depositOn); pill.textContent = _depositOn ? 'ON' : 'OFF'; }
    if (body) body.classList.toggle('off', !_depositOn);
    if (!_depositOn) { _deposit = 0; const i = _$('inv-dep-amt'); if (i) i.value = 0; }
    _renderDoc();
  }
  function _syncDeposit(val) {
    _deposit = isNaN(val) || val < 0 ? 0 : val;
    _renderDoc();
  }

  function _mkDov(k) {
    const doc=_$('inv-doc'); if(!doc) return;
    const W=k==='stamp'?120:140;
    const ov=document.createElement('div'); ov.className='inv-dov'; ov.dataset.k=k;
    const img=document.createElement('img');
    img.src=_src(k); img.alt=k; img.style.width=W+'px';
    img.onerror=()=>{img.style.cssText=`width:${W}px;height:${Math.round(W*.65)}px;background:rgba(37,99,235,.06);border:1.5px dashed #2563EB;border-radius:6px;display:block;`;};
    ov.appendChild(img); doc.appendChild(ov);
    /* Default: sig left of stamp, both bottom-right, same Y */
    const Y = DOC_H - 210;
    if(k==='stamp') {
      ov.style.left=(DOC_W-CS-W-10)+'px';
    } else {
      /* sig sits left of stamp with 10px gap */
      ov.style.left=(DOC_W-CS-120-10-W-14)+'px';
    }
    ov.style.top=Y+'px';
    _drag(ov); _dovs[k]=ov;
  }

  function _drag(ov) {
    let sx,sy,sl,st,active=false;
    const start=e=>{e.preventDefault();active=true;const p=e.touches?e.touches[0]:e,sc=_getScale();sx=p.clientX/sc;sy=p.clientY/sc;sl=parseFloat(ov.style.left)||0;st=parseFloat(ov.style.top)||0;ov.classList.add('dragging');};
    const move=e=>{if(!active)return;e.preventDefault();const p=e.touches?e.touches[0]:e,sc=_getScale(),w=ov.parentElement;ov.style.left=Math.max(0,Math.min(w.offsetWidth-ov.offsetWidth,sl+p.clientX/sc-sx))+'px';ov.style.top=Math.max(0,Math.min(w.offsetHeight-ov.offsetHeight,st+p.clientY/sc-sy))+'px';};
    const end=()=>{active=false;ov.classList.remove('dragging');};
    ov.addEventListener('mousedown',start);ov.addEventListener('touchstart',start,{passive:false});
    document.addEventListener('mousemove',move);document.addEventListener('touchmove',move,{passive:false});
    document.addEventListener('mouseup',end);document.addEventListener('touchend',end);
  }

  /* ══════════════════════════════════════════════════════════
     Client — search
  ══════════════════════════════════════════════════════════ */
  function _onSearch(val) {
    clearTimeout(_srchTO);
    const drop=_$('inv-cl-drop'), clr=_$('inv-cl-clr');
    const srch=_$('inv-cl-q')?.closest('.icl-search');
    if(!drop) return;
    if(clr) clr.style.display = val ? '' : 'none';
    if(!val.trim()){
      drop.innerHTML='<div class="icl-dr-msg">Tapez pour rechercher…</div>';
      drop.classList.remove('on'); srch?.classList.remove('drop-open'); return;
    }
    drop.innerHTML='<div class="icl-dr-msg">Recherche…</div>';
    drop.classList.add('on'); srch?.classList.add('drop-open');
    _srchTO=setTimeout(async()=>{
      try {
        const rows=await _sbSearch(val.trim());
        if(!rows.length){ drop.innerHTML='<div class="icl-dr-msg">Aucun résultat</div>'; return; }
        drop.innerHTML=rows.map(r=>`
          <div class="icl-dr-row" data-cl="${JSON.stringify(r).replace(/"/g,'&quot;')}" onclick="INVOICE._pickClient(this.dataset.cl)">
           <div class="icl-dr-name">${r.nom||'—'}</div>
           <div class="icl-dr-sub">${[r.ice,r.tel,r.email].filter(Boolean).join(' · ')||r.adresse||''}</div>
          </div>`).join('');
      } catch(e){ drop.innerHTML='<div class="icl-dr-msg">⚠ Erreur réseau</div>'; }
    },280);
  }

  function _clearSearch() {
    const q=_$('inv-cl-q'); if(q){q.value='';q.focus();}
    _$('inv-cl-drop')?.classList.remove('on');
    _$('inv-cl-q')?.closest('.icl-search')?.classList.remove('drop-open');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
  }

  function _pickClient(jsonStr) {
    const r=JSON.parse(jsonStr);
    _cl={id:r.id||null,nom:r.nom||'',adresse:r.adresse||'',ice:r.ice||'',tel:r.tel||'',email:r.email||''};
    _fillForm(); _showChip(); _renderDoc();
    _$('inv-cl-drop')?.classList.remove('on');
    _$('inv-cl-q')?.closest('.icl-search')?.classList.remove('drop-open');
  }

  function _fillForm() {
    const set=(id,v)=>{const e=_$(id);if(e)e.value=v||'';};
    set('inv-fn',_cl.nom); set('inv-fa',_cl.adresse);
    set('inv-fi',_cl.ice); set('inv-ft2',_cl.tel); set('inv-fe',_cl.email);
    _updateSaveBtn();
  }

  function _showChip() {
    _$('inv-chip-name').textContent=_cl.nom||'—';
    _$('inv-chip-sub').textContent=[_cl.ice,_cl.tel].filter(Boolean).join(' · ')||_cl.adresse||'';
    _$('inv-chip')?.classList.add('on');
  }

  function _resetClient() {
    _cl={id:null,nom:'',adresse:'',ice:'',tel:'',email:''};
    _fillForm(); _$('inv-chip')?.classList.remove('on');
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');
    _renderDoc();
  }

  /* ── form sync ── */
  function _syncCl() {
    _cl.nom     = (_$('inv-fn')?.value ||'').trim();
    _cl.adresse = (_$('inv-fa')?.value ||'').trim();
    _cl.ice     = (_$('inv-fi')?.value ||'').trim();
    _cl.tel     = (_$('inv-ft2')?.value||'').trim();
    _cl.email   = (_$('inv-fe')?.value ||'').trim();
    _cl.id      = null; // manual edit → treat as new
    _updateSaveBtn();
    _renderDoc();
  }

  function _updateSaveBtn() {
    // Show "add to DB" only when nom is filled AND client not already saved
    const show = !!_cl.nom && !_cl.id;
    _$('inv-cl-save')?.classList.toggle('on', show);
  }

  async function _saveClient() {
    const btn=_$('inv-cl-save'); if(!_cl.nom) return;
    const origHTML=btn?btn.innerHTML:'';
    if(btn){btn.disabled=true;btn.style.cssText='background:#e2e8f0;border-color:#cbd5e1;color:#94a3b8;cursor:not-allowed';}
    try {
      const saved=await _sbInsertClient({nom:_cl.nom,adresse:_cl.adresse,ice:_cl.ice,tel:_cl.tel,email:_cl.email});
      _cl.id=saved?.id||null;
      /* flash green success on the button */
      if(btn){
        btn.style.cssText='background:#dcfce7;border-color:#86efac;color:#16a34a;cursor:default';
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Client ajouté avec succès`;
        setTimeout(()=>{
          btn.disabled=false; btn.style.cssText='';
          btn.innerHTML=origHTML;
          _updateSaveBtn(); /* hides btn since cl.id is now set */
        },2500);
      }
      _showChip();
    } catch(e){
      console.error('[INVOICE] saveClient:',e);
      if(btn){
        btn.disabled=false; btn.style.cssText='';
        btn.style.cssText='background:#fef2f2;border-color:#fca5a5;color:#dc2626';
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Erreur — réessayer`;
        setTimeout(()=>{btn.style.cssText='';btn.innerHTML=origHTML;},3000);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     Render A4
  ══════════════════════════════════════════════════════════ */
  function _renderDoc() {
    /* Remove any extra pages from a previous render */
    document.querySelectorAll('.inv-page-extra').forEach(e => e.remove());
    const mainDoc = _$('inv-doc'), ct = _$('inv-ct');
    if (!ct || !_q || !mainDoc) return;

    const {ref, date, items=[], totals={}, ta, shop={}} = _q;
    const {surAmt=0, del=0, grand=0} = totals;
    const isD = _type === 'devis';

    /* TVA */
    const tvaAmt = _tvaOn ? Math.round(grand * (_tvaRate / 100) * 100) / 100 : 0;
    const total  = _tvaOn ? Math.round((grand + tvaAmt) * 100) / 100 : grand;

    /* Layout */
    const CONTENT_W  = DOC_W - 2 * CS;          // 698 px
    const PAGE_CONT  = DOC_H - CT - 40;          // usable height per page (minus footer pad)

    /* Off-screen height measurement — CSS classes injected by _inject() apply */
    const _msr = html => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:-9999px;top:0;width:${CONTENT_W}px;`
        + `font-family:'Poppins',Arial,sans-serif;font-size:9pt;`
        + `visibility:hidden;pointer-events:none;box-sizing:border-box`;
      d.innerHTML = html;
      document.body.appendChild(d);
      const h = d.offsetHeight;
      document.body.removeChild(d);
      return h + 4; // +4 safety
    };

    /* ── HTML fragments ── */
    const cbox = (_cl.nom||_cl.adresse||_cl.ice) ? `
      <div class="dc-cbox">
        ${_cl.nom    ?`<div class="dc-cnom">${_cl.nom}</div>`:''}
        ${_cl.adresse?`<div class="dc-cadr">${_cl.adresse.replace(/\n/g,'<br>')}</div>`:''}
        ${_cl.ice    ?`<div class="dc-cice"><strong>ICE : </strong>${_cl.ice}</div>`:''}
      </div>` : '<div></div>';

    const headerHTML = `
      <div class="dc-date">${date}</div>
      <div class="dc-top">
        <div><div class="dc-ttl">${isD?'Devis':'Facture'}</div><div class="dc-ref">N° ${ref}</div></div>
        ${cbox}
      </div>`;

    const theadHTML = `<thead><tr>
      <th>Désignations</th>
      <th class="r" style="width:60px">Qté</th>
      <th class="r" style="width:72px">P.U. HT</th>
      <th class="r" style="width:88px">Total HT</th>
    </tr></thead>`;

    const rowHTMLs = items.map((it, i) => `
      <tr class="${i%2?'er':''}">
        <td><div class="dc-tn">${it.prodName||''}</div>
          ${it.specs ?`<div class="dc-ts">${it.specs}</div>`:''}
          ${it.notes ?`<div class="dc-to">"${it.notes}"</div>`:''}</td>
        <td class="r">${fmtN(it.quantity)}</td>
        <td class="r">${fmt(it.perUnit)}</td>
        <td class="r" style="font-weight:700">${fmt(it.baseTotal)}</td>
      </tr>`);

    const _grandTotal = total || grand;
    const _finalAmt   = (_depositOn && _deposit > 0) ? Math.max(0, _grandTotal - _deposit) : _grandTotal;

    const tfootRows = [
      surAmt>0 ? `<tr><td colspan="3" style="text-align:right;font-size:8pt;color:#f59e0b">${ta?.label||''}</td><td class="tfv" style="text-align:right;color:#f59e0b">+${fmt(surAmt)} DH</td></tr>` : '',
      del>0    ? `<tr><td colspan="3" class="tfl">Livraison</td><td class="tfv" style="text-align:right">+${fmt(del)} DH</td></tr>` : '',
      _tvaOn
        ? `<tr class="tfsep"><td colspan="3" class="tfl">Total HT</td><td class="tfv" style="text-align:right">${fmt(grand)} DH</td></tr>
           <tr><td colspan="3" class="tfl">TVA ${_tvaRate}%</td><td style="text-align:right;color:#94a3b8">${fmt(tvaAmt)} DH</td></tr>
           <tr class="tfsep"><td colspan="3" class="tflb">Total TTC</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(total)} DH</td></tr>`
        : `<tr class="tfsep"><td colspan="3" class="tflb">Total Hors champ de TVA</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(grand)} DH</td></tr>`,
      (_depositOn && _deposit > 0)
        ? `<tr><td colspan="3" class="tfl">Acompte versé</td><td class="tfv" style="text-align:right">−${fmt(_deposit)} DH</td></tr>
           <tr class="tfsep"><td colspan="3" class="tflb">Reste à payer</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(_finalAmt)} DH</td></tr>`
        : ''
    ].join('');
    const tfootHTML = `<tfoot><tr><td colspan="4" style="padding:3px 0;border:none"></td></tr>${tfootRows}</tfoot>`;

    const arreteHTML = `<div class="dc-arr">Arrêter la présente ${isD?'offre':'facture'} à la somme de :
      <strong>${_lettre(_finalAmt).toUpperCase()}.</strong></div>`;

    const condHTML = _condOn ? `<div class="dc-cond">
      <div class="dc-cond-t">Conditions de règlement</div>
      ${shop.rib?`<p>RIB : <strong>${shop.rib}</strong></p>`:''}
      <p>${_condText||_COND_DEFAULT}</p>
      ${_validDate?`<p style="margin-top:5px;font-size:7.5pt;color:#1a1f2e"><strong>Validité du devis : </strong>${new Date(_validDate+'T00:00:00').toLocaleDateString('fr-MA',{day:'2-digit',month:'long',year:'numeric'})}</p>`:''}
    </div>` : '';

    const suffixHTML = arreteHTML + condHTML;

    /* ── Single-page fast path ── */
    if (!items.length) {
      const fill = Array(4).fill('<tr class="er"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('');
      ct.innerHTML = `${headerHTML}<table class="dc-tbl">${theadHTML}<tbody>${fill}</tbody>${tfootHTML}</table>${suffixHTML}`;
      requestAnimationFrame(_scaleDoc); return;
    }

    /* ── Measure heights for page-break algorithm ── */
    const msrDiv = document.createElement('div');
    msrDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${CONTENT_W}px;`
      + `font-family:'Poppins',Arial,sans-serif;font-size:9pt;`
      + `visibility:hidden;pointer-events:none;box-sizing:border-box`;
    msrDiv.innerHTML = `
      <div>${headerHTML}</div>
      <table class="dc-tbl" style="width:100%;border-collapse:collapse">
        ${theadHTML}<tbody>${rowHTMLs.join('')}</tbody>
      </table>
      <table class="dc-tbl" style="width:100%;border-collapse:collapse">${tfootHTML}</table>
      <div>${suffixHTML}</div>`;
    document.body.appendChild(msrDiv);

    const kids      = msrDiv.children;
    const headerH   = kids[0].offsetHeight;
    const allTrs    = Array.from(msrDiv.querySelectorAll('tbody tr'));
    const theadH    = msrDiv.querySelector('thead').offsetHeight;
    const rowHts    = allTrs.map(tr => tr.offsetHeight);
    const tfootH    = kids[2].offsetHeight;
    const sfxH      = kids[3].offsetHeight;
    const suffH     = tfootH + sfxH + 4;

    document.body.removeChild(msrDiv);

    /* ── Greedy page packing ── */
    const pages = [[]];
    let used = headerH + theadH;

    for (let i = 0; i < rowHTMLs.length; i++) {
      const rh = rowHts[i];
      const isLast = i === rowHTMLs.length - 1;
      const fits   = used + rh + (isLast ? suffH : 0) <= PAGE_CONT;
      const isFirstOnPage = pages[pages.length - 1].length === 0;

      if (fits || isFirstOnPage) {
        pages[pages.length - 1].push(i);
        used += rh;
      } else {
        pages.push([i]);
        used = theadH + rh;
      }
    }

    /* If suffix doesn't fit on last page, push it to a new page */
    if (used + suffH > PAGE_CONT) pages.push([]);

    const numPages = pages.length;

    /* ── Build page content HTML ── */
    const lhSrc = _b64.lh || 'images/letterhead.png';

    const _pageContent = (rowIdxs, isFirst, isLast) => {
      const fill = (isFirst && isLast) ? Array(Math.max(0, 4 - rowIdxs.length))
        .fill('<tr class="er"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('') : '';
      return `${isFirst ? headerHTML : ''}
        <table class="dc-tbl">
          ${theadHTML}
          <tbody>${rowIdxs.map(i => rowHTMLs[i]).join('')}${fill}</tbody>
          ${isLast ? tfootHTML : '<tfoot></tfoot>'}
        </table>
        ${isLast ? suffixHTML : ''}`;
    };

    /* Page 1 — goes into #inv-ct */
    ct.innerHTML = _pageContent(pages[0], true, numPages === 1);

    /* Extra pages */
    const wrap = mainDoc.parentElement;
    for (let p = 1; p < numPages; p++) {
      const div = document.createElement('div');
      div.className = 'inv-page-extra';
      div.innerHTML = `
        <div class="inv-lh-clone${_layers.lh?' on':''}"><img src="${lhSrc}" alt=""></div>
        <div class="inv-ct-extra">${_pageContent(pages[p], false, p === numPages - 1)}</div>`;
      wrap.appendChild(div);
    }

    requestAnimationFrame(_scaleDoc);
  }

  /* ══════════════════════════════════════════════════════════
     open / close
  ══════════════════════════════════════════════════════════ */
  function open(q, opts={}) {
    _inject(); _loadB64();
    _q=q; _blob=null; _dbId=opts.dbId||null;
    _type=opts.docType||'devis';

    /* Restore persisted layer prefs, default to lh:true stamp:false sig:false */
    try {
      const saved = JSON.parse(localStorage.getItem('kote_inv_layers') || 'null');
      _layers = saved ? { lh: !!saved.lh, stamp: !!saved.stamp, sig: !!saved.sig }
                      : { lh:true, stamp:false, sig:false };
    } catch(e) {
      _layers = { lh:true, stamp:false, sig:false };
    }

    _dovs={stamp:null,sig:null};
    _mobView='form';

    /* Pre-fill client if passed in opts */
    if(opts.client){
      _cl={...{id:null,nom:'',adresse:'',ice:'',tel:'',email:''},...opts.client};
    } else {
      _cl={id:null,nom:'',adresse:'',ice:'',tel:'',email:''};
    }

    /* Reset UI */
    _fillForm();
    _$('inv-chip')?.classList.remove('on');
    if(_cl.nom) _showChip();
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');

    /* type btns */
    _$('inv-t-d')?.classList.toggle('on',_type==='devis');
    _$('inv-t-f')?.classList.toggle('on',_type==='facture');

    /* layer pills — driven by restored _layers */
    _$('inv-pl-lh')?.classList.toggle('on', _layers.lh);
    _$('inv-pl-stamp')?.classList.toggle('on', _layers.stamp);
    _$('inv-pl-sig')?.classList.toggle('on', _layers.sig);
    _$('inv-lh')?.classList.toggle('on', _layers.lh);

    /* letterhead src */
    const lhImg=document.querySelector('#inv-lh img');
    if(lhImg) lhImg.src=_b64.lh||'images/letterhead.png';

    /* generate + tray */
    _$('inv-tray')?.classList.remove('on');
    const gb=_$('inv-gen-btn');
    if(gb){gb.disabled=false;gb.innerHTML=`${I.doc} Générer le PDF`;}

    /* WA / share */
    const wa=_$('inv-tr-wa');
    if(wa) wa.style.display = navigator.canShare ? 'flex' : 'none';
    const sh=_$('inv-tr-sh');if(sh) sh.style.display=navigator.share?'flex':'none';

    /* Reset conditions state */
    _condOn   = true;
    _condText = _COND_DEFAULT;
    _validDate = '';
    const condTxt  = _$('inv-cond-txt');
    const condDate = _$('inv-valid-date');
    const condPill = _$('inv-cond-pill');
    const condBody = _$('inv-cond-body');
    if(condTxt)  condTxt.value  = _COND_DEFAULT;
    if(condDate) condDate.value = '';
    if(condPill){ condPill.classList.add('on'); condPill.textContent='Activé'; }
    if(condBody) condBody.classList.remove('off');

    /* Reset TVA state */
    _tvaOn   = false;
    _tvaRate = 20;
    const tvaPill = _$('inv-tva-pill'), tvaBody = _$('inv-tva-body'), tvaRate = _$('inv-tva-rate');
    if(tvaPill){ tvaPill.classList.remove('on'); tvaPill.textContent='OFF'; }
    if(tvaBody) tvaBody.classList.add('off');
    if(tvaRate) tvaRate.value = 20;

    /* Reset Deposit state — pre-fill from opts.deposit if available */
    _depositOn = !!(opts.deposit && opts.deposit > 0);
    _deposit   = (opts.deposit && opts.deposit > 0) ? opts.deposit : 0;
    const depPill = _$('inv-dep-pill'), depBody = _$('inv-dep-body'), depAmt = _$('inv-dep-amt');
    if (depPill) { depPill.classList.toggle('on', _depositOn); depPill.textContent = _depositOn ? 'ON' : 'OFF'; }
    if (depBody) depBody.classList.toggle('off', !_depositOn);
    if (depAmt)  depAmt.value = _deposit || 0;

    document.querySelectorAll('.inv-dov').forEach(e=>e.remove());
    _$('inv-mob-bar') && _mobSwitch('form');
    _$('inv-ovl').classList.add('on');
    document.body.style.overflow='hidden';
    _renderDoc();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      _scaleDoc(); _mobLayout();
      /* Restore stamp / sig draggable overlays if layers were active */
      ['stamp','sig'].forEach(k=>{ if(_layers[k]) _mkDov(k); });
    }));
  }

  function close() {
    _$('inv-ovl')?.classList.remove('on');
    document.body.style.overflow='';
    document.querySelectorAll('.inv-dov').forEach(e=>e.remove());
    _dovs={stamp:null,sig:null};
  }

  /* ══════════════════════════════════════════════════════════
     Generate PDF — taint-proof
     ─────────────────────────────────────────────────────────
     Strategy (same as v5):
     1. base64 in localStorage → swap src → zero external URLs
     2. http(s):// without base64 → useCORS:true
     3. file:// without base64 → hide images before capture
  ══════════════════════════════════════════════════════════ */
  async function _generate() {
    const gb=_$('inv-gen-btn'), sp=_$('inv-spin');
    if(gb){gb.disabled=true;gb.textContent='⏳ Rendu…';}
    if(sp) sp.classList.add('on');

    const isFile=location.protocol==='file:';
    const hidden=[];
    const hide=el=>{if(el){el.style.visibility='hidden';hidden.push(el);}};
    const restore=()=>hidden.forEach(el=>el.style.visibility='');

    try {
      await _loadScript(CDN_H2C,'html2canvas'); await _loadScript(CDN_JPDF,'jspdf');

      /* ── Resolve all images to base64, wait for load, then capture ──
         html2canvas clones the DOM before rendering — two-step fix:
         1) resolve + onload in live DOM (browser cache populated)
         2) re-inject in onclone() so the cloned doc also has data-URLs  */
      const _resolved = {};

      /* Resolve every image we might need — use _src() which already
         returns localStorage data-URL if uploaded, else the file path */
      const _keys = ['lh', 'stamp', 'sig'];
      for (const k of _keys) {
        const b64 = await _imgToB64(_src(k));
        if (b64) _resolved[k] = b64;
      }

      /* Pre-warm live DOM images with resolved data-URLs */
      const lhImg = document.querySelector('#inv-lh img');
      if (lhImg && _resolved.lh) {
        await new Promise(res => {
          if (lhImg.src === _resolved.lh && lhImg.complete) { res(); return; }
          lhImg.onload = lhImg.onerror = () => { lhImg.onload = lhImg.onerror = null; res(); };
          lhImg.src = _resolved.lh;
          if (lhImg.complete) res();
        });
      }
      for (const dov of document.querySelectorAll('.inv-dov')) {
        const k = dov.dataset.k, img = dov.querySelector('img');
        if (img && _resolved[k]) {
          await new Promise(res => {
            if (img.src === _resolved[k] && img.complete) { res(); return; }
            img.onload = img.onerror = () => { img.onload = img.onerror = null; res(); };
            img.src = _resolved[k];
            if (img.complete) res();
          });
        }
      }

      await new Promise(r => setTimeout(r, 60));

      /* ══════════════════════════════════════════════════════
         OFF-SCREEN DESKTOP ENGINE
         Build completely isolated render containers outside
         the overlay DOM — zero mobile CSS contamination.
         html2canvas then captures clean, unclipped elements.
      ══════════════════════════════════════════════════════ */
      const lhSrc  = _resolved.lh || null;
      const lhVis  = _layers.lh;

      /* Page data: collect innerHTML of each page's content area */
      const mainDoc  = _$('inv-doc');
      const ctHTML   = _$('inv-ct')?.innerHTML || '';
      const extraEls = Array.from(document.querySelectorAll('.inv-page-extra'));
      const pageContents = [{ ct: ctHTML, lh: lhVis }];
      extraEls.forEach(el => {
        pageContents.push({
          ct:  el.querySelector('.inv-ct-extra')?.innerHTML || '',
          lh:  el.querySelector('.inv-lh-clone')?.classList.contains('on') ?? lhVis,
        });
      });

      /* Dov (stamp/sig) snapshots: position + resolved src */
      const dovSnaps = Array.from(document.querySelectorAll('.inv-dov')).map(dov => ({
        k:    dov.dataset.k,
        left: dov.style.left,
        top:  dov.style.top,
        w:    dov.querySelector('img')?.style.width || '120px',
        src:  _resolved[dov.dataset.k] || null,
      }));

      /* Off-screen host — completely outside #inv-ovl */
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-${DOC_W + 40}px;top:0;`
        + `width:${DOC_W}px;overflow:visible;z-index:-1;pointer-events:none`;
      document.body.appendChild(host);

      /* Build one render-frame per page, measure, capture */
      const {jsPDF} = window.jspdf;
      const pdf = new jsPDF('p','mm','a4');

      for (let pi = 0; pi < pageContents.length; pi++) {
        const pg = pageContents[pi];

        /* Build isolated page element */
        const frame = document.createElement('div');
        frame.style.cssText = `width:${DOC_W}px;height:${DOC_H}px;background:#fff;`
          + `position:relative;overflow:hidden;font-family:'Poppins',Arial,sans-serif`;

        /* Letterhead */
        if (pg.lh && lhSrc) {
          const lhDiv = document.createElement('div');
          lhDiv.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none';
          const lhI = document.createElement('img');
          lhI.src = lhSrc;
          lhI.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
          lhDiv.appendChild(lhI);
          frame.appendChild(lhDiv);
        }

        /* Content area */
        const ctDiv = document.createElement('div');
        ctDiv.style.cssText = `position:absolute;z-index:1;`
          + `top:${CT}px;left:${CS}px;right:${CS}px;bottom:0;`
          + `box-sizing:border-box;overflow:hidden;font-family:'Poppins',Arial,sans-serif`;
        ctDiv.innerHTML = pg.ct;
        frame.appendChild(ctDiv);

        /* Stamp / sig overlays (page 1 only) */
        if (pi === 0) {
          dovSnaps.forEach(snap => {
            if (!snap.src) return;
            const dov = document.createElement('div');
            dov.style.cssText = `position:absolute;z-index:3;left:${snap.left};top:${snap.top}`;
            const img = document.createElement('img');
            img.src = snap.src;
            img.style.width = snap.w;
            img.style.display = 'block';
            dov.appendChild(img);
            frame.appendChild(dov);
          });
        }

        host.innerHTML = '';
        host.appendChild(frame);

        /* Wait for images to fully load inside frame */
        const imgs = Array.from(frame.querySelectorAll('img'));
        await Promise.all(imgs.map(img => new Promise(res => {
          if (img.complete && img.naturalWidth > 0) { res(); return; }
          img.onload = img.onerror = res;
        })));
        await new Promise(r => requestAnimationFrame(r));

        const canvas = await window.html2canvas(frame, {
          scale: 2, useCORS: false, allowTaint: true,
          foreignObjectRendering: false,
          width: DOC_W, height: DOC_H, backgroundColor: '#ffffff',
          logging: false, imageTimeout: 0,
        });

        if (pi > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 210, 297);
      }

      document.body.removeChild(host);

      restore();
      _blob=pdf.output('blob');
      _fname=`${_type==='devis'?'Devis':'Facture'}_${_q.ref}_${(_q.date||'').replace(/\//g,'-')}.pdf`;

      /* upsert to kote_quotes with full payload + client + deposit */
      const fullPayload={ ..._q, client:_cl, docType:_type,
        deposit: (_depositOn && _deposit > 0) ? _deposit : 0 };
      _sbUpsertQuote(fullPayload).then(row=>{ if(row?.id) _dbId=row.id; }).catch(()=>{});


      _$('inv-tray')?.classList.add('on');
      if(gb){gb.disabled=false;gb.textContent='↺ Regénérer';}
    } catch(err){
      restore();
      console.error('[INVOICE]',err);
      if(gb){gb.disabled=false;gb.textContent='⚠ Erreur — Réessayer';}
    } finally {
      if(sp) sp.classList.remove('on');
    }
  }

  function _dl() {
    if(!_blob) return;
    const url=URL.createObjectURL(_blob);
    const a=document.createElement('a');a.href=url;a.download=_fname;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),8000);
  }
  async function _share() {
    if(!_blob) return;
    const f=new File([_blob],_fname,{type:'application/pdf'});
    if(navigator.canShare?.({files:[f]})){try{await navigator.share({files:[f],title:_fname});}catch(e){if(e.name!=='AbortError')_dl();}}else _dl();
  }
  function _shareMail() {
    if(!_q) return;
    const sub=encodeURIComponent(`${_type==='devis'?'Devis':'Facture'} ${_q.ref}`);
    const body=encodeURIComponent(`Bonjour,\n\nVeuillez trouver en pièce jointe notre ${_type==='devis'?'devis':'facture'} réf. ${_q.ref}.\n\nCordialement,\n${_q.shop?.name||''}`);
    _dl();
    setTimeout(()=>{const a=document.createElement('a');a.href=`mailto:?subject=${sub}&body=${body}`;a.click();},350);
  }

  async function _shareWA() {
    if (!_blob) return;
    const f = new File([_blob], _fname, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: _fname }); }
      catch(e) { if (e.name !== 'AbortError') _dl(); }
    } else {
      /* Fallback: download + open WhatsApp web so user can attach manually */
      _dl();
      const num = (_q?.shop?.whatsapp || '').replace(/\D/g, '');
      if (num) setTimeout(() => window.open(`https://wa.me/${num}`, '_blank'), 400);
    }
  }


  function _setType(t) {
    if (_type === t) return;
    // Full reset: keep the quote data (_q) but clear client, blob, and all options
    _type = t;
    _blob = null;
    _cl   = { id:null, nom:'', adresse:'', ice:'', tel:'', email:'' };
    _condOn   = true;
    _condText = _COND_DEFAULT;
    _validDate = '';
    _tvaOn   = false;
    _tvaRate = 20;
    _depositOn = false;
    _deposit   = 0;

    // Sync type buttons
    _$('inv-t-d')?.classList.toggle('on', t==='devis');
    _$('inv-t-f')?.classList.toggle('on', t==='facture');

    // Reset client UI
    _fillForm();
    _$('inv-chip')?.classList.remove('on');
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');

    // Reset conditions UI
    const condTxt  = _$('inv-cond-txt');
    const condDate = _$('inv-valid-date');
    const condPill = _$('inv-cond-pill');
    const condBody = _$('inv-cond-body');
    if (condTxt)  condTxt.value  = _COND_DEFAULT;
    if (condDate) condDate.value = '';
    if (condPill) { condPill.classList.add('on'); condPill.textContent='Activé'; }
    if (condBody) condBody.classList.remove('off');

    // Reset TVA UI
    const tvaPill = _$('inv-tva-pill'), tvaBody = _$('inv-tva-body'), tvaRate = _$('inv-tva-rate');
    if (tvaPill) { tvaPill.classList.remove('on'); tvaPill.textContent='OFF'; }
    if (tvaBody) tvaBody.classList.add('off');
    if (tvaRate) tvaRate.value = 20;

    // Reset deposit UI
    const depPill = _$('inv-dep-pill'), depBody = _$('inv-dep-body'), depAmt = _$('inv-dep-amt');
    if (depPill) { depPill.classList.remove('on'); depPill.textContent='OFF'; }
    if (depBody) depBody.classList.add('off');
    if (depAmt)  depAmt.value = 0;

    // Reset generate button + tray
    _$('inv-tray')?.classList.remove('on');
    const gb = _$('inv-gen-btn');
    if (gb) { gb.disabled=false; gb.innerHTML=`${I.doc} Générer le PDF`; }

    _renderDoc();
  }

  /* ════ Import from kote_quotes ════ */
  let _impTO=null, _impOpen=false;

  function _toggleImport() {
    _impOpen=!_impOpen;
    _$('inv-imp-panel')?.classList.toggle('on',_impOpen);
    _$('inv-imp-toggle')?.classList.toggle('on',_impOpen);
    if(_impOpen){ _$('inv-imp-q')?.focus(); _impSearch(''); }
  }

  function _impSearch(val) {
    clearTimeout(_impTO);
    const list=_$('inv-imp-list'); if(!list) return;
    list.innerHTML='<div class="iimport-msg">Chargement…</div>';
    _impTO=setTimeout(async()=>{
      const q=val.trim();
      const fd=s=>_fmtDate(s,{day:'2-digit',month:'2-digit',year:'2-digit'});
      const fm=fmt;

      /* JSON mode — search embedded quotes */
      if (window._jsonQuotes) {
        let rows = window._jsonQuotes;
        if (q) {
          const lq = q.toLowerCase();
          rows = rows.filter(r =>
            (r.ref||'').toLowerCase().includes(lq) ||
            (r.client_nom||'').toLowerCase().includes(lq)
          );
        }
        rows = rows.slice(0, 25);
        if (!rows.length) { list.innerHTML='<div class="iimport-msg">Aucun résultat</div>'; return; }
        list.innerHTML=rows.map(row=>`
          <div class="iimport-row" onclick="INVOICE._impLoad('${row.id}')">
           <div class="iimport-row-ref">${row.ref}
            <span class="iimport-badge">${row.status||'devis'}</span>
           </div>
           <div class="iimport-row-sub">${row.client_nom||'—'} &middot; ${fm(row.total_ht)} DH HT &middot; ${fd(row.created_at)}</div>
          </div>`).join('');
        return;
      }

      const SB=window.SUPABASE_URL||'', K=window.SUPABASE_ANON_KEY||'';
      const filter=q?`&or=(ref.ilike.*${encodeURIComponent(q)}*,client_nom.ilike.*${encodeURIComponent(q)}*)`:'';
      const url=`${SB}/rest/v1/kote_quotes?select=id,ref,status,client_nom,total_ht,created_at&order=created_at.desc&limit=25${filter}`;
      try {
        const r=await fetch(url,{headers:{'apikey':K,'Authorization':'Bearer '+K}});
        if(!r.ok) throw new Error(r.status);
        const rows=await r.json();
        if(!rows.length){ list.innerHTML='<div class="iimport-msg">Aucun résultat</div>'; return; }
        list.innerHTML=rows.map(row=>`
          <div class="iimport-row" onclick="INVOICE._impLoad('${row.id}')">
           <div class="iimport-row-ref">${row.ref}
            <span class="iimport-badge">${row.status||'devis'}</span>
           </div>
           <div class="iimport-row-sub">${row.client_nom||'—'} &middot; ${fm(row.total_ht)} DH HT &middot; ${fd(row.created_at)}</div>
          </div>`).join('');
      } catch(e){ list.innerHTML='<div class="iimport-msg">⚠ Erreur réseau</div>'; }
    }, val.trim()?280:0);
  }

  async function _impLoad(dbId) {
    let row;
    /* JSON mode — find in embedded quotes */
    if (window._jsonQuotes) {
      row = window._jsonQuotes.find(r => r.id === dbId);
    }
    if (!row) {
      const SB=window.SUPABASE_URL||'', K=window.SUPABASE_ANON_KEY||'';
      try {
        const r=await fetch(`${SB}/rest/v1/kote_quotes?id=eq.${dbId}&select=*&limit=1`,
          {headers:{'apikey':K,'Authorization':'Bearer '+K}});
        const rows=await r.json(); row=rows[0];
      } catch(e){ console.error('[INVOICE] impLoad:',e); return; }
    }
    if (!row) return;
    const p=row.payload||{};
    _q={...p}; _type=row.status||'devis';
    if(p.client&&(p.client.nom||p.client.id)){
      _cl={...{id:null,nom:'',adresse:'',ice:'',tel:'',email:''},...p.client};
      _fillForm(); if(_cl.nom) _showChip();
    }
    _$('inv-t-d')?.classList.toggle('on',_type==='devis');
    _$('inv-t-f')?.classList.toggle('on',_type==='facture');
    _renderDoc();
    _impOpen=false;
    _$('inv-imp-panel')?.classList.remove('on');
    _$('inv-imp-toggle')?.classList.remove('on');
    _blob=null;
    _$('inv-tray')?.classList.remove('on');
    const gb=_$('inv-gen-btn');
    if(gb){gb.disabled=false;gb.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Générer le PDF`;}
  }

  return {
    open, close, setImage,
    _setType, _layer, _toggleCond, _syncCond, _syncValidDate, _toggleTva, _syncTvaRate,
    _toggleDeposit, _syncDeposit,
    _mobSwitch,
    _toggleImport, _impSearch, _impLoad,
    _onSearch, _clearSearch, _pickClient, _syncCl, _resetClient, _saveClient,
    _renderDoc, _generate, _dl, _share, _shareWA, _shareMail,
  };
})();



/* ════ auth.js ════ */
/* ════════════════════════════════════════════════════════
   AUTH — Magic Link + Google OAuth for client.html
   Reads OAuth credentials from DB.contact (set in admin panel)

   Public API:
     AUTH.init()              — call on page load
     AUTH.openSignIn(afterFn) — show sign-in modal
     AUTH.signOut()           — sign out
     AUTH.getUser()           — current user or null
     AUTH.getUserId()         — uid string or null
     AUTH.openMyOrders()      — open order history drawer
   ════════════════════════════════════════════════════════ */
const AUTH = (() => {

  let _user    = null;
  let _afterFn = null;
  let _guestEmail = null;

  /* ── Auth method config — reads from DB, falls back to all-enabled ── */
  function _authMethods() {
    if (typeof DB !== 'undefined' && DB?.auth_methods) return DB.auth_methods;
    return { magic_link: true, oauth_google: true, guest: true, email_no_confirm: false };
  }

  /* ── Helpers ── */
  const _url = () => window.SUPABASE_URL || '';
  const _key = () => window.SUPABASE_ANON_KEY || '';
  const _hdrs = tok => ({
    'apikey':        _key(),
    'Authorization': 'Bearer ' + (tok || _key()),
    'Content-Type':  'application/json',
  });
  const _ref = () => _url().replace('https://','').split('.')[0];
  const _storageKey = () => `sb-${_ref()}-auth-token`;

  /* ── Session ── */
  function _saveSession(data) {
    if (!data?.access_token) return;
    localStorage.setItem(_storageKey(), JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now()/1000) + (data.expires_in||3600),
      user:          data.user,
    }));
  }

  function _clearSession() {
    localStorage.removeItem(_storageKey());
    _user = null;
  }

  async function _getSession() {
    const raw = localStorage.getItem(_storageKey());
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data.expires_at && Date.now()/1000 > data.expires_at - 60) {
        return await _refreshSession(data.refresh_token);
      }
      return data;
    } catch { return null; }
  }

  async function _refreshSession(rt) {
    if (!rt) return null;
    try {
      const r = await fetch(`${_url()}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: _hdrs(),
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!r.ok) { _clearSession(); return null; }
      const data = await r.json();
      _saveSession(data);
      return data;
    } catch { return null; }
  }

  /* ── Handle callback — works for BOTH magic link AND Google OAuth ── */
  async function _handleCallback() {
    const hash   = window.location.hash;
    const search = window.location.search;

    // ── Implicit flow: #access_token=... (magic link + Google if flow=implicit) ──
    if (hash && hash.includes('access_token')) {
      const params       = new URLSearchParams(hash.replace('#',''));
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn    = parseInt(params.get('expires_in') || '3600');
      if (!accessToken) return false;
      try {
        const r = await fetch(`${_url()}/auth/v1/user`, { headers: _hdrs(accessToken) });
        if (!r.ok) return false;
        const user = await r.json();
        _saveSession({ access_token:accessToken, refresh_token:refreshToken, expires_in:expiresIn, user });
        _user = user;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log('[AUTH] implicit callback → signed in:', user.email);
        return true;
      } catch(e) { console.error('[AUTH] implicit callback error', e); return false; }
    }

    // ── PKCE flow: ?code=... (Supabase default) — exchange code for token ──
    if (search && search.includes('code=')) {
      const code     = new URLSearchParams(search).get('code');
      const verifier = sessionStorage.getItem('pkce_verifier');
      if (!code) return false;
      try {
        const body = { auth_code: code };
        if (verifier) body.code_verifier = verifier;
        const r = await fetch(`${_url()}/auth/v1/token?grant_type=pkce`, {
          method: 'POST', headers: _hdrs(),
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          console.warn('[AUTH] PKCE exchange failed', r.status, await r.text());
          // Clean URL anyway
          window.history.replaceState(null, '', window.location.pathname);
          return false;
        }
        const data = await r.json();
        _saveSession(data);
        _user = data.user;
        sessionStorage.removeItem('pkce_verifier');
        window.history.replaceState(null, '', window.location.pathname);
        console.log('[AUTH] PKCE callback → signed in:', data.user?.email);
        return true;
      } catch(e) { console.error('[AUTH] PKCE callback error', e); return false; }
    }

    return false;
  }

  /* ── Magic link ── */
  async function _sendMagicLink(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const r = await fetch(`${_url()}/auth/v1/otp`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, create_user: true, options: { emailRedirectTo: redirectTo } }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.msg || err.message || `HTTP ${r.status}`);
    }
  }

  /* ── Google OAuth ── */
  async function _signInWithGoogle() {
    const redirectTo = window.location.origin + window.location.pathname;
    // Use the Supabase authorize endpoint — it handles the Google redirect
    window.location.href =
      `${_url()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  /* ── Google configured? ── */
  function _googleEnabled() {
    // Google works if the Supabase project has it enabled — we always show it,
    // but it will fail gracefully if not configured
    return true;
  }

  /* ── Init ── */
  async function init() {
    const fromCallback = await _handleCallback();
    if (!fromCallback) {
      const session = await _getSession();
      if (session?.user) _user = session.user;
      else if (session?.access_token) {
        // Session exists but user missing — fetch it
        try {
          const r = await fetch(`${_url()}/auth/v1/user`, { headers: _hdrs(session.access_token) });
          if (r.ok) { _user = await r.json(); _saveSession({ ...session, user: _user }); }
        } catch(e) { console.warn('[AUTH] user fetch failed', e); }
      }
    }

    _updateHeader();
    console.log('[AUTH] init done. user:', _user?.email || 'guest');

    if (fromCallback && _user) {
      const pending = sessionStorage.getItem('auth_pending_action');
      if (pending === 'order') {
        sessionStorage.removeItem('auth_pending_action');
        closeModal();
        setTimeout(() => ORDERS?.openOrderForm?.(), 300);
      }
    }
  }

  /* ── Header button ── */
  function _updateHeader() {
    const btn = document.getElementById('authHeaderBtn');
    if (!btn) { console.warn('[AUTH] #authHeaderBtn not found'); return; }
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    btn.style.display = 'flex';

    if (_user) {
      const name   = _user.user_metadata?.full_name || _user.email?.split('@')[0] || 'Compte';
      const avatar = _user.user_metadata?.avatar_url;
      btn.title = name;
      btn.onclick = () => _toggleUserMenu();
      btn.innerHTML = avatar
        ? `<img src="${avatar}" alt="${name}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:2px solid #bfdbfe">`
        : `<div style="width:24px;height:24px;border-radius:50%;background:var(--bl);color:#fff;font-size:.6rem;font-weight:700;display:flex;align-items:center;justify-content:center">${name[0].toUpperCase()}</div>`;
    } else {
      btn.title = 'Se connecter';
      btn.onclick = () => openSignIn();
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  }

  /* ── User menu ── */
  function _toggleUserMenu() {
    const ex = document.getElementById('authUserMenu');
    if (ex) { ex.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'authUserMenu';
    const name  = _user?.user_metadata?.full_name || _user?.email?.split('@')[0] || 'Compte';
    const email = _user?.email || '';
    const provider = _user?.app_metadata?.provider || 'email';
    const providerTag = provider === 'google'
      ? `<span style="font-size:.58rem;background:#eff6ff;color:#2563eb;border-radius:4px;padding:1px 6px;font-weight:600;display:inline-block;margin-top:2px">Google</span>`
      : `<span style="font-size:.58rem;background:#f0fdf4;color:#059669;border-radius:4px;padding:1px 6px;font-weight:600;display:inline-block;margin-top:2px">Magic Link</span>`;
    menu.innerHTML = `
      <div class="auth-menu-head">
        <div class="auth-menu-name">${name}</div>
        <div class="auth-menu-email">${email}</div>
        ${providerTag}
      </div>
      <div class="auth-menu-divider"></div>
      <button class="auth-menu-item" onclick="AUTH.openMyOrders()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        Mes commandes
      </button>
      <button class="auth-menu-item auth-menu-signout" onclick="AUTH.signOut()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Déconnexion
      </button>`;
    document.body.appendChild(menu);
    const btn  = document.getElementById('authHeaderBtn');
    const rect = btn.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;z-index:900`;
    setTimeout(() => {
      const close = e => { if (!menu.contains(e.target)&&e.target!==btn){menu.remove();document.removeEventListener('click',close);} };
      document.addEventListener('click', close);
    }, 50);
  }

  /* ── Sign-in modal ── */
  function openSignIn(afterFn) {
    _afterFn = afterFn || null;
    document.getElementById('authModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.innerHTML = `
      <div class="auth-modal-backdrop" onclick="AUTH.closeModal()"></div>
      <div class="auth-modal-box">
        <button class="auth-modal-close" onclick="AUTH.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        <div class="auth-modal-logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 451.63 123.79" style="height:22px;width:auto">
            <path fill="#696969" d="M191,123.79a62.31,62.31,0,0,0,31.07-8A59.36,59.36,0,0,0,244.5,93.65a62,62,0,0,0,8.26-31.84A62,62,0,0,0,244.5,30a58.88,58.88,0,0,0-22.39-22,65.43,65.43,0,0,0-62.41,0,59.26,59.26,0,0,0-22.56,22,61.44,61.44,0,0,0-8.34,31.84,61.44,61.44,0,0,0,8.34,31.84,59.93,59.93,0,0,0,22.56,22.14A62.66,62.66,0,0,0,191,123.79Zm0-35.25q-11.41,0-17.54-7.23t-6.13-19.5q0-12.44,6.13-19.67T191,34.91q11.24,0,17.37,7.23t6.13,19.67q0,12.25-6.13,19.5T191,88.54ZM259.57,2V32h31.67V122.6H329V32h32V2ZM451.63,32.18V2H371.26V122.6h80.37V92.46H409.07v-17h37.45V47H409.07V32.18Z"/>
            <path fill="#2563EB" d="M103.06,41.51a18.57,18.57,0,0,0,18.57-18.57V1M103.06,122.6A18.57,18.57,0,0,0,121.63,104v-22M40.54,41.51H81.09v22.3A18.24,18.24,0,0,1,62.85,82.05H40.54V122.6H0V1H40.54ZM121.63,1H81.09V41.51h22M121.63,82.05H81.09V122.6h22"/>
          </svg>
        </div>

        <!-- STEP 1: input -->
        <div id="authStep1">
          ${(()=>{
            const _am = (typeof DB!=='undefined'&&DB?.auth_methods)||{magic_link:true,oauth_google:true,guest:true,email_no_confirm:false};
            const showGoogle  = _am.oauth_google !== false;
            const showEmail   = _am.magic_link || _am.email_no_confirm || _am.email_password;
            const showGuest   = _am.guest !== false;
            const noConfirm   = !_am.magic_link && _am.email_no_confirm;
            const btnLabel    = noConfirm ? 'Continuer' : 'Envoyer le lien';
            const sendIcon    = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
            const arrowIcon   = '<polyline points="9 18 15 12 9 6"/>';
            const btnIcon     = noConfirm ? arrowIcon : sendIcon;
            return `
          <h2 class="auth-modal-title">Suivez votre commande</h2>
          <p class="auth-modal-sub">Connectez-vous pour accéder à l'historique et au suivi de vos commandes.</p>
          ${showGoogle ? `
          <button class="auth-google-btn" onclick="AUTH._googleClick()">
            <svg viewBox="0 0 24 24" width="17" height="17"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuer avec Google
          </button>` : ''}
          ${showEmail ? `
          ${showGoogle ? '<div class="auth-divider"><span>ou par email</span></div>' : ''}
          ${_am.email_password ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            <input class="auth-email-inp" id="authEmailInp" type="email"
              placeholder="votre@email.com" autocomplete="email"
              onkeydown="if(event.key==='Enter')document.getElementById('authPassInp')?.focus()">
            <input class="auth-email-inp" id="authPassInp" type="password"
              placeholder="Mot de passe (6 caractères min)" autocomplete="current-password"
              onkeydown="if(event.key==='Enter')AUTH._submitPassword()"
              style="letter-spacing:.05em">
            <button class="auth-email-btn" id="authEmailBtn" onclick="AUTH._submitPassword()"
              style="width:100%;justify-content:center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
              <span id="authBtnLbl">Se connecter</span>
            </button>
          </div>
          <div style="text-align:center;margin-top:10px;font-size:12px;color:#64748b">
            <span id="authModeHint">Première visite ?</span>
            <button id="authModeToggle" onclick="AUTH._togglePwdMode()"
              style="background:none;border:none;cursor:pointer;color:#2463EB;font-size:12px;font-weight:600;padding:0 4px;text-decoration:underline">
              Créer un compte
            </button>
          </div>` : `
          <div class="auth-email-wrap">
            <input class="auth-email-inp" id="authEmailInp" type="email"
              placeholder="votre@email.com" autocomplete="email"
              onkeydown="if(event.key==='Enter')AUTH._submitEmail()">
            <button class="auth-email-btn" id="authEmailBtn" onclick="AUTH._submitEmail()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><${btnIcon}/></svg>
              ${btnLabel}
            </button>
          </div>`}
          <div class="auth-email-err" id="authEmailErr"></div>` : ''}
          ${showGuest ? `
          <div class="auth-divider"><span>ou</span></div>
          <button class="auth-guest-btn" onclick="AUTH._continueAsGuest()">
            Continuer sans compte
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <p class="auth-modal-note">Sans compte, notre équipe vous contactera par téléphone.</p>` : ''}
          ${!showGoogle && !showEmail && !showGuest ? '<p class="auth-modal-note" style="text-align:center;padding:1rem 0">Aucune méthode de connexion activée.<br>Contactez l\'administrateur.</p>' : ''}`;
          })()}
        </div>

        <!-- STEP 2: email sent -->
        <div id="authStep2" style="display:none">
          <div class="auth-sent-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5" width="32" height="32"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h2 class="auth-modal-title">Vérifiez votre email</h2>
          <p class="auth-modal-sub">Lien envoyé à <strong id="authSentEmail"></strong>. Cliquez dessus pour vous connecter instantanément.</p>
          <p class="auth-modal-note" style="margin-top:.6rem">Vérifiez aussi vos spams. Le lien expire dans 1 heure.</p>
          <button class="auth-guest-btn" style="margin-top:1rem;width:100%" onclick="AUTH._backToEmail()">← Changer d'adresse</button>
          <div class="auth-divider"><span>ou</span></div>
          <button class="auth-guest-btn" onclick="AUTH._continueAsGuest()">Continuer sans compte <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.classList.add('on');
      setTimeout(() => document.getElementById('authEmailInp')?.focus(), 220);
    });
  }

  function _googleClick() {
    sessionStorage.setItem('auth_pending_action', 'order');
    _signInWithGoogle();
  }

  async function _submitEmail() {
    const inp   = document.getElementById('authEmailInp');
    const err   = document.getElementById('authEmailErr');
    const btn   = document.getElementById('authEmailBtn');
    const email = (inp?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      if (err) { err.textContent = 'Adresse email invalide.'; err.style.display = 'block'; }
      inp?.focus(); return;
    }
    if (err) err.style.display = 'none';

    const am = _authMethods();

    // Password mode active — this button should not be reachable, but guard anyway
    if (am.email_password) return;

    // Magic link flow
    if (!am.magic_link) {
      // No email auth mode enabled — close and proceed as guest
      _guestEmail = email;
      closeModal();
      sessionStorage.removeItem('auth_pending_action');
      if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    sessionStorage.setItem('auth_pending_action', 'order');
    try {
      await _sendMagicLink(email);
      document.getElementById('authStep1').style.display = 'none';
      document.getElementById('authStep2').style.display = 'block';
      const el = document.getElementById('authSentEmail');
      if (el) el.textContent = email;
    } catch(e) {
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le lien`; }
    }
  }

  function _backToEmail() {
    document.getElementById('authStep1').style.display = 'block';
    document.getElementById('authStep2').style.display = 'none';
    const btn = document.getElementById('authEmailBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le lien`; }
    setTimeout(() => document.getElementById('authEmailInp')?.focus(), 80);
  }

  function closeModal() {
    const m = document.getElementById('authModal');
    if (!m) return;
    m.classList.remove('on');
    setTimeout(() => m.remove(), 200);
  }

  function _continueAsGuest() {
    _guestEmail = null;   // clear any stored guest email when skipping
    closeModal();
    sessionStorage.removeItem('auth_pending_action');
    if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
  }

  /* ── My Orders drawer ── */
  async function openMyOrders() {
    document.getElementById('authUserMenu')?.remove();
    const ex = document.getElementById('myOrdersPanel');
    if (ex) { ex.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'myOrdersPanel';
    panel.innerHTML = `
      <div class="my-orders-backdrop" onclick="document.getElementById('myOrdersPanel').remove()"></div>
      <div class="my-orders-drawer">
        <div class="my-orders-hdr">
          <div class="my-orders-title">Mes commandes</div>
          <button class="auth-modal-close" onclick="document.getElementById('myOrdersPanel').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="my-orders-body" id="myOrdersBody">
          <div class="my-orders-loading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" style="opacity:.3;animation:spin 1s linear infinite"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            Chargement…
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('on'));
    await _loadMyOrders();
  }

  async function _loadMyOrders() {
    const body = document.getElementById('myOrdersBody');
    if (!body || !_user) return;
    const session = await _getSession();
    if (!session?.access_token) return;
    try {
      const r = await fetch(
        `${_url()}/rest/v1/kote_orders?user_id=eq.${_user.id}&select=*&order=created_at.desc`,
        { headers: _hdrs(session.access_token) }
      );
      if (!r.ok) throw new Error('HTTP '+r.status);
      const orders = await r.json();
      if (!orders.length) {
        body.innerHTML = `<div class="my-orders-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="32" height="32" style="opacity:.2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>Aucune commande pour le moment</p></div>`;
        return;
      }
      body.innerHTML = orders.map(_renderRow).join('');
    } catch(e) {
      body.innerHTML = `<div class="my-orders-empty" style="color:#dc2626">Erreur — ${e.message}</div>`;
    }
  }

  const _SL = {nouveau:'Nouveau',en_cours:'En cours',en_impression:'Impression',finition:'Finition',pret:'Prêt',livre:'Livré',annule:'Annulé'};
  const _SC = {nouveau:'#f59e0b',en_cours:'#2563eb',en_impression:'#7c3aed',finition:'#0891b2',pret:'#16a34a',livre:'#059669',annule:'#dc2626'};
  const _f = n => (n||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2});

  function _renderRow(o) {
    const st  = o.status||'nouveau', col=_SC[st]||'#9ca3af', lbl=_SL[st]||st;
    const d   = o.created_at ? new Date(o.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    const ttc = o.total_ttc||Math.round((o.total_ht||0)*1.2*100)/100;
    const preview = (o.payload?.items||[]).slice(0,2).map(i=>i.prodName).join(', ') + ((o.payload?.items||[]).length>2?` +${(o.payload?.items||[]).length-2}`:'');
    return `<div class="my-order-row" onclick="window.open('tracking.html?ref=${encodeURIComponent(o.ref)}','_blank')">
      <div class="my-order-top">
        <span class="my-order-ref">${o.ref}</span>
        <span class="my-order-badge" style="color:${col};background:${col}18;border-color:${col}35"><span style="width:5px;height:5px;border-radius:50%;background:${col};display:inline-block;margin-right:4px;vertical-align:middle"></span>${lbl}</span>
      </div>
      <div class="my-order-desc">${preview||'—'}</div>
      <div class="my-order-foot"><span class="my-order-date">${d}</span><span class="my-order-total">${_f(ttc)} DH TTC</span></div>
    </div>`;
  }

  /* ── Sign out ── */
  function signOut() {
    document.getElementById('authUserMenu')?.remove();
    const s = JSON.parse(localStorage.getItem(_storageKey())||'{}');
    _clearSession(); _updateHeader();
    if (s.access_token) fetch(`${_url()}/auth/v1/logout`,{method:'POST',headers:_hdrs(s.access_token)}).catch(()=>{});
  }

  function getUser()   { return _user; }
  function getUserId() { return _user?.id || null; }

  /* ── Password auth ── */
  let _pwdModeState = 'signin';

  function _togglePwdMode() {
    _pwdModeState = _pwdModeState === 'signin' ? 'signup' : 'signin';
    const isSignup = _pwdModeState === 'signup';
    const hint    = document.getElementById('authModeHint');
    const toggle  = document.getElementById('authModeToggle');
    const btnLbl  = document.getElementById('authBtnLbl');
    const passInp = document.getElementById('authPassInp');
    if (hint)    hint.textContent    = isSignup ? 'Déjà un compte ?'   : 'Première visite ?';
    if (toggle)  toggle.textContent  = isSignup ? 'Se connecter'        : 'Créer un compte';
    if (btnLbl)  btnLbl.textContent  = isSignup ? 'Créer mon compte'    : 'Se connecter';
    if (passInp) passInp.autocomplete = isSignup ? 'new-password' : 'current-password';
    const err = document.getElementById('authEmailErr');
    if (err) err.style.display = 'none';
  }

  async function _signUpWithPassword(email, password) {
    const r = await fetch(`${_url()}/auth/v1/signup`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.msg || data.message || `HTTP ${r.status}`);
    if (data.access_token) { _saveSession(data); _user = data.user; }
    return data;
  }

  async function _signInWithPassword(email, password) {
    const r = await fetch(`${_url()}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.msg || data.message || `HTTP ${r.status}`);
    _saveSession(data); _user = data.user;
    return data;
  }

  async function _submitPassword() {
    const email   = (document.getElementById('authEmailInp')?.value || '').trim().toLowerCase();
    const pass    = (document.getElementById('authPassInp')?.value  || '');
    const err     = document.getElementById('authEmailErr');
    const btn     = document.getElementById('authEmailBtn');
    const lbl     = document.getElementById('authBtnLbl');
    if (!email || !email.includes('@')) {
      if (err) { err.textContent = 'Email invalide.'; err.style.display = 'block'; } return;
    }
    if (pass.length < 6) {
      if (err) { err.textContent = 'Mot de passe : 6 caractères minimum.'; err.style.display = 'block'; } return;
    }
    if (err) err.style.display = 'none';
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = '…';
    try {
      if (_pwdModeState === 'signup') {
        await _signUpWithPassword(email, pass);
      } else {
        await _signInWithPassword(email, pass);
      }
      _pwdModeState = 'signin';
      closeModal(); _updateHeader();
      if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
    } catch(e) {
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = _pwdModeState === 'signup' ? 'Créer mon compte' : 'Se connecter';
    }
  }

  return {
    init, openSignIn, closeModal, signOut,
    openMyOrders, getUser, getUserId, getGuestEmail: () => _guestEmail,
    _submitEmail, _backToEmail, _continueAsGuest, _googleClick, _authMethods,
    _submitPassword, _togglePwdMode,
  };
})();


/* ════ orders.js ════ */
/* ════════════════════════════════════════════════════════
   ORDERS  — client order form + kote_orders Supabase push
   Used by client.html only (ROLE === 'client').

   Public API:
     ORDERS.open(quoteSnapshot)  — show order form with quote attached
     ORDERS.submit()             — validate + push + show confirmation
     ORDERS.close()              — dismiss overlay
   ════════════════════════════════════════════════════════ */

/* ── Offline order queue ──────────────────────────────────
   Stores failed Supabase pushes in localStorage.
   Flushed automatically when the browser goes back online.
   ────────────────────────────────────────────────────── */
const _QUEUE = (() => {
  const KEY = 'kote_pending_orders';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch(_) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch(_) {}
  }

  function push(row) {
    const list = load();
    list.push({ row, ts: Date.now() });
    save(list);
    _syncQueueBadge();
    console.info('[QUEUE] Order queued offline:', row.ref);
  }

  function count() { return load().length; }

  async function flush() {
    const list = load();
    if (!list.length) return;
    console.info(`[QUEUE] Flushing ${list.length} pending order(s)…`);
    const failed = [];
    for (const entry of list) {
      try {
        const res = await fetch(`${window.SUPABASE_URL}/rest/v1/kote_orders`, {
          method: 'POST',
          headers: {
            'apikey':        window.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify(entry.row),
        });
        if (!res.ok) {
          console.warn('[QUEUE] Flush failed for', entry.row.ref, res.status);
          failed.push(entry);
        } else {
          console.info('[QUEUE] Flushed:', entry.row.ref);
          // Fire notifications that were skipped during offline submit
          if (typeof _tgNotify === 'function')          _tgNotify(entry.row);
          if (typeof _sendConfirmEmail === 'function')  _sendConfirmEmail(entry.row);
        }
      } catch(e) {
        console.warn('[QUEUE] Network error during flush:', e.message);
        failed.push(entry);
      }
    }
    save(failed);
    _syncQueueBadge();
    if (failed.length === 0 && list.length > 0) {
      _showQueueToast(`${list.length} commande(s) envoyée(s) avec succès.`);
    }
  }

  return { push, flush, count };
})();

/* ── Queue badge: shows pending count in the offline bar ── */
function _syncQueueBadge() {
  const n   = _QUEUE.count();
  const bar = $('offlineBar');
  if (!bar) return;
  let badge = bar.querySelector('.queue-badge');
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'queue-badge';
      bar.appendChild(badge);
    }
    badge.textContent = `${n} commande(s) en attente d'envoi`;
  } else if (badge) {
    badge.remove();
  }
}

function _showQueueToast(msg) {
  const t = document.createElement('div');
  t.className   = 'queue-toast';
  t.textContent = `✓ ${msg}`;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('visible'));
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 4000);
}

const ORDERS = (() => {

  let _q = null;   // quote snapshot passed from CART

  /* ── Supabase POST helper — queues row if offline/network failure ── */
  async function _push(row) {
    if (!navigator.onLine) {
      _QUEUE.push(row);
      return { queued: true };
    }
    const res = await fetch(`${window.SUPABASE_URL}/rest/v1/kote_orders`, {
      method: 'POST',
      headers: {
        'apikey':        window.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      // 5xx = server error → queue for retry; 4xx = client error → throw (won't recover)
      if (res.status >= 500) {
        _QUEUE.push(row);
        return { queued: true };
      }
      throw new Error(`HTTP ${res.status} — ${txt}`);
    }
    return { queued: false };
  }

  /* ── Field value helper ── */
  const _val = id => ($('ord-' + id)?.value || '').trim();

  /* ── Resolve totals — city chosen in form overrides snapshot delivery fee ── */
  function _getTotals() {
    const sub    = _q?.totals?.sub    ?? (_q?.totals?.grand ?? 0);
    const surAmt = _q?.totals?.surAmt ?? 0;
    // City chosen in order form takes priority over cart snapshot estimate
    const del    = _ordCityChosen != null
                 ? (_ordCityChosen.fee || 0)
                 : (_q?.totals?.del ?? 0);
    const grand  = Math.round((sub + surAmt + del) * 100) / 100;
    const tva    = Math.round(grand * 0.20 * 100) / 100;
    const ttc    = Math.round((grand + tva) * 100) / 100;
    return { sub, surAmt, del, grand, tva, ttc };
  }

  /* ── Re-render totals strip live (called on city pick/clear) ── */
  function _refreshSummary() {
    const summaryEl = $('ordBox')?.querySelector('.ord-summary');
    if (!summaryEl) return;
    const { del, surAmt, grand, ttc } = _getTotals();
    const truckIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;
    const itemRows = (_q?.items || []).map(i => {
      const concLine = i.snap?.designOption === 'service' && i.snap?.designTier && i.snap?.designCost
        ? `<div class="ord-item-row ord-item-service">
             <span class="ord-item-name">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10" style="flex-shrink:0;margin-right:.3rem;color:var(--pu,#7c3aed)"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
               Conception — ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier }
             </span>
             <span class="ord-item-qty" style="color:var(--pu,#7c3aed);font-weight:700">${fmt(i.snap.designCost)} DH</span>
           </div>`
        : '';
      return `<div class="ord-item-row">
        <span class="ord-item-name">${i.prodName}</span>
        <span class="ord-item-spec">${i.specs || ''}</span>
        <span class="ord-item-qty">${fmtN(i.quantity)} × ${fmt(i.perUnit)} DH</span>
      </div>${concLine}`;
    }).join('');
    summaryEl.innerHTML = `
      <div class="ord-items">${itemRows}</div>
      <div class="ord-totals">
        ${surAmt > 0 ? `<div class="ord-total-row"><span style="color:var(--am)">Délai express</span><strong style="color:var(--am)">+${fmt(surAmt)} DH</strong></div>` : ''}
        ${del > 0 ? `<div class="ord-total-row"><span style="display:flex;align-items:center;gap:5px;color:var(--t2)">${truckIco}Livraison${_ordCityChosen ? ' — ' + _ordCityChosen.label : ''}</span><strong>+${fmt(del)} DH</strong></div>` : ''}
        <div class="ord-total-row"><span>Total HT</span><strong>${fmt(grand)} DH</strong></div>
        <div class="ord-total-row ord-total-ttc"><span>Total TTC (TVA 20%)</span><strong>${fmt(ttc)} DH</strong></div>
      </div>`;
  }

  /* ── Render form content ── */
  function _renderForm() {
    const box = $('ordBox');
    if (!box) return;

    const itemRows = (_q?.items || []).map(i => {
      const concLine = i.snap?.designOption === 'service' && i.snap?.designTier && i.snap?.designCost
        ? `<div class="ord-item-row ord-item-service">
             <span class="ord-item-name">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10" style="flex-shrink:0;margin-right:.3rem;color:var(--pu,#7c3aed)"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
               Conception — ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier }
             </span>
             <span class="ord-item-qty" style="color:var(--pu,#7c3aed);font-weight:700">${fmt(i.snap.designCost)} DH</span>
           </div>`
        : '';
      return `<div class="ord-item-row">
        <span class="ord-item-name">${i.prodName}</span>
        <span class="ord-item-spec">${i.specs || ''}</span>
        <span class="ord-item-qty">${fmtN(i.quantity)} × ${fmt(i.perUnit)} DH</span>
      </div>${concLine}`;
    }).join('');

    const { grand, del, surAmt, tva, ttc } = _getTotals();

    box.innerHTML = `
      <div class="ord-hdr">
        <div class="ord-hdr-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            style="width:15px;height:15px;color:var(--bl)">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
          </svg>
        </div>
        <div class="ord-hdr-text">
          <div class="ord-hdr-title">Confirmer la demande</div>
          <div class="ord-hdr-sub">Vos coordonnées · Réf ${_q?.ref || '—'}</div>
        </div>
        <button class="inv-x" onclick="ORDERS.close()" title="Fermer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Summary strip -->
      <div class="ord-summary">
        <div class="ord-items">${itemRows}</div>
        <div class="ord-totals">
          ${surAmt > 0 ? `<div class="ord-total-row"><span style="color:var(--am)">Délai express</span><strong style="color:var(--am)">+${fmt(surAmt)} DH</strong></div>` : ''}
          ${del > 0 ? `<div class="ord-total-row"><span style="display:flex;align-items:center;gap:5px;color:var(--t2)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison</span><strong>+${fmt(del)} DH</strong></div>` : ''}
          <div class="ord-total-row">
            <span>Total HT</span>
            <strong>${fmt(grand)} DH</strong>
          </div>
          <div class="ord-total-row ord-total-ttc">
            <span>Total TTC (TVA 20%)</span>
            <strong>${fmt(ttc)} DH</strong>
          </div>
        </div>
      </div>

      <!-- Client form -->
      <div class="ord-form">
        <div class="ord-form-title">Vos coordonnées</div>

        <div class="ord-field-row">
          <div class="ord-field">
            <label class="ord-lbl" for="ord-nom">Nom complet <span class="ord-req">*</span></label>
            <input id="ord-nom" class="ord-inp" type="text"
              placeholder="Prénom Nom / Raison sociale" autocomplete="name">
          </div>
          <div class="ord-field">
            <label class="ord-lbl" for="ord-tel">Téléphone <span class="ord-req">*</span></label>
            <input id="ord-tel" class="ord-inp" type="tel"
              placeholder="+212 6XX XXX XXX" autocomplete="tel">
          </div>
        </div>

        <div class="ord-field-row">
          <div class="ord-field">
            <label class="ord-lbl" for="ord-email">Email</label>
            <input id="ord-email" class="ord-inp" type="email"
              placeholder="exemple@domaine.ma" autocomplete="email">
          </div>
        </div>

        ${del > 0 ? `
        <div class="ord-city-banner" id="ordCityBanner">
          <div class="ord-city-banner-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
              width="16" height="16" style="color:var(--bl)">
              <rect x="1" y="3" width="15" height="13" rx="1"/>
              <path d="M16 8h4l3 3v5h-7V8z"/>
              <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
            </svg>
          </div>
          <div style="flex:1;min-width:0">
            <div class="ord-city-banner-title">Choisissez votre ville de livraison</div>
            <div class="ord-city-banner-sub">Le tarif exact sera ajouté à votre commande</div>
          </div>
        </div>
        <div class="ord-field">
          <div class="ord-city-wrap" id="ordCityWrap">
            <div style="position:relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="position:absolute;left:.6rem;top:50%;transform:translateY(-50%);
                width:13px;height:13px;color:var(--t3);pointer-events:none">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input id="ord-ville" class="ord-inp" type="text" style="padding-left:2rem"
                placeholder="Rechercher votre ville…" autocomplete="off"
                oninput="ORDERS._filterCities(this.value)"
                onfocus="ORDERS._openCityDrop()">
            </div>
            <div class="ord-city-drop" id="ordCityDrop" style="display:none"></div>
            <div class="ord-city-chosen" id="ordCityChosen" style="display:none"></div>
            <div class="ord-delivery-hint" id="ordDeliveryHint" style="display:none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                width="12" height="12"><rect x="1" y="3" width="15" height="13" rx="1"/>
                <path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/></svg>
              <span id="ordDeliveryHintText"></span>
            </div>
          </div>
        </div>` : ''}

        ${del > 0 ? `<div class="ord-field">
          <label class="ord-lbl" for="ord-adresse">Adresse de livraison <span class="ord-req">*</span></label>
          <input id="ord-adresse" class="ord-inp" type="text"
            placeholder="N°, rue, quartier…" autocomplete="street-address">
        </div>` : ''}

        <div class="ord-field">
          <label class="ord-lbl" for="ord-note">Note additionnelle</label>
          <textarea id="ord-note" class="ord-inp ord-textarea"
            placeholder="Délai souhaité, informations complémentaires…"
            rows="2"></textarea>
        </div>

        <div class="ord-err" id="ordErr"></div>

        <div class="ord-actions">
          <button class="btn btn-outline" style="height:36px;font-size:.72rem"
            onclick="ORDERS.close()">Annuler</button>
          <button class="btn btn-p" id="ordSubmitBtn" style="height:36px;font-size:.72rem;min-width:160px;overflow:hidden;position:relative"
            onclick="ORDERS.submit()">
            <span class="btn-slot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="width:13px;height:13px">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Envoyer la demande
            </span>
          </button>
        </div>
      </div>`;
  }

  /* ── Upsert client into kote_clients after order ── */
  async function _upsertClient(row) {
    if (!row.client_email || !row.client_email.includes('@')) return;
    try {
      await fetch(`${window.SUPABASE_URL}/rest/v1/kote_clients`, {
        method: 'POST',
        headers: {
          'apikey':        window.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          nom:     row.client_nom     || '',
          tel:     row.client_tel     || '',
          email:   row.client_email,
          adresse: row.client_adresse || '',
        }),
      });
    } catch(e) {
      console.warn('[ORDERS] client upsert failed:', e);
    }
  }

  /* ── Telegram notification (fire-and-forget) ── */
  function _tgNotify(row) {
    const c = (typeof DB !== 'undefined' && DB?.contact) || {};
    if (!c.tg_enabled || !c.tg_token || !c.tg_chat_id) return;
    const p     = row.payload || {};
    const items = p.items || [];
    const ttc   = row.total_ttc || Math.round((row.total_ht||0)*1.20*100)/100;
    const del   = p.totals?.del > 0 ? '🚚 Livraison' : '🏪 Retrait';
    const lines = [
      `🛎 <b>Nouvelle commande — ${row.ref}</b>`,
      `👤 ${row.client_nom || '—'}${row.client_tel ? ' · ' + row.client_tel : ''}`,
      '',
      ...items.map(i => `📦 ${i.prodName} × ${i.quantity}`),
      '',
      `💰 ${(row.total_ht||0).toLocaleString('fr-MA',{minimumFractionDigits:2})} DH HT · ${del}`,
      `💵 TTC : ${ttc.toLocaleString('fr-MA',{minimumFractionDigits:2})} DH`,
    ].join('\n');
    fetch(`https://api.telegram.org/bot${c.tg_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.tg_chat_id, text: lines, parse_mode: 'HTML' }),
    }).catch(() => {}); // silent — never block the order flow
  }

  /* ── Confirmation email via Edge Function (fire-and-forget) ── */
  function _sendConfirmEmail(row) {
    const am = (typeof DB !== 'undefined' && DB?.auth_methods) || {};
    if (!am.email_no_confirm) return;
    const email = row.client_email;
    if (!email || !email.includes('@')) return;
    const shop = (typeof DB !== 'undefined' && DB?.shop) || {};
    fetch(`${window.SUPABASE_URL}/functions/v1/kote-order-confirm`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        order_ref:    row.ref,
        client_email: row.client_email,
        client_nom:   row.client_nom,
        items:        row.payload?.items || [],
        total_ht:     row.total_ht,
        total_ttc:    row.total_ttc,
        shop,
      }),
    }).catch(() => {}); // silent — never block the order flow
  }

  let _ordCityChosen = null;

  function _openCityDrop() {
    _renderCityDrop('');
    const drop = $('ordCityDrop');
    if (drop) drop.style.display = 'block';
    setTimeout(() => {
      document.addEventListener('click', function _cc(e) {
        if (!e.target.closest('#ordCityWrap')) {
          const d = $('ordCityDrop'); if (d) d.style.display='none';
          document.removeEventListener('click', _cc);
        }
      });
    }, 0);
  }

  function _filterCities(q) {
    _renderCityDrop(q);
    const drop = $('ordCityDrop');
    if (drop) drop.style.display = 'block';
    // If cleared, un-choose
    if (!q.trim()) { _ordCityChosen=null; _updateCityChosen(); }
  }

  function _renderCityDrop(q) {
    const drop = $('ordCityDrop'); if (!drop) return;
    const cities = (typeof DB !== 'undefined' && DB.delivery_cities) || [];
    const sq = q.toLowerCase().trim();
    const results = sq ? cities.filter(c=>c.label.toLowerCase().includes(sq)).slice(0,20)
                       : cities.slice(0,20);
    drop.innerHTML = results.length
      ? results.map(c=>`<div class="ord-city-item" onclick="ORDERS._chooseCity('${c.id}')">
          <span>${c.label}</span>
          <span style="font-size:.65rem;font-weight:700;color:var(--bl)">${c.fee} DH</span>
        </div>`).join('')
      : `<div class="ord-city-empty">Aucune ville trouvée</div>`;
  }

  function _chooseCity(id) {
    const cities = (typeof DB !== 'undefined' && DB.delivery_cities) || [];
    _ordCityChosen = cities.find(c=>c.id===id) || null;
    const inp = $('ord-ville');
    if (inp && _ordCityChosen) inp.value = _ordCityChosen.label;
    const drop = $('ordCityDrop'); if (drop) drop.style.display='none';
    _updateCityChosen();
  }

  function _updateCityChosen() {
    const chosen = $('ordCityChosen');
    const hint   = $('ordDeliveryHint');
    const hintTxt= $('ordDeliveryHintText');
    if (!chosen) return;
    if (_ordCityChosen) {
      chosen.style.display = 'flex';
      chosen.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10" style="color:var(--gn)"><polyline points="20 6 9 17 4 12"/></svg>
        <span>${_ordCityChosen.label}</span>
        <span style="font-weight:700;color:var(--bl)">${_ordCityChosen.fee} DH</span>
        <button onclick="ORDERS._clearCity()" style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--t3);font-size:.65rem">✕</button>`;
      if (hint && hintTxt) {
        hint.style.display='flex';
        hintTxt.textContent = _ordCityChosen.fee > 0
          ? `Livraison vers ${_ordCityChosen.label} : +${_ordCityChosen.fee} DH${_ordCityChosen.days ? ' · '+_ordCityChosen.days : ''}`
          : `Livraison gratuite vers ${_ordCityChosen.label}`;
      }
    } else {
      chosen.style.display = 'none';
      if (hint) hint.style.display='none';
    }
    // Refresh totals strip to reflect city change
    _refreshSummary();
  }

  function _clearCity() {
    _ordCityChosen = null;
    const inp = $('ord-ville'); if (inp) inp.value='';
    _updateCityChosen();
  }

  /* ── Open (intercepts for auth) ── */
  function open(quoteSnapshot) {
    _q = quoteSnapshot;

    // If user is already signed in, go straight to form
    if (typeof AUTH !== 'undefined' && AUTH.getUser()) {
      _openForm();
      return;
    }

    // Otherwise show sign-in prompt first
    if (typeof AUTH !== 'undefined') {
      AUTH.openSignIn(() => _openForm());
    } else {
      _openForm(); // fallback if AUTH not loaded
    }
  }

  function _openForm() {
    _renderForm();
    const ovl = $('ordOverlay');
    const box = $('ordBox');
    if (ovl) ovl.classList.add('open');
    if (box) { box.style.transform = 'translateY(0)'; }
    // Pre-fill from Google profile if signed in
    if (typeof AUTH !== 'undefined') {
      const user = AUTH.getUser();
      if (user) {
        const meta = user.user_metadata || {};
        const nomField   = $('ord-nom');
        const emailField = $('ord-email');
        if (nomField   && !nomField.value)   nomField.value   = meta.full_name || '';
        if (emailField && !emailField.value) emailField.value = user.email     || '';
      }
    }
    // Pre-fill email from no-confirm guest flow
    if (!$('ord-email')?.value && typeof AUTH !== 'undefined' && AUTH.getGuestEmail) {
      const ge = AUTH.getGuestEmail();
      if (ge) { const ef = $('ord-email'); if (ef) ef.value = ge; }
    }
    setTimeout(() => {
      const nom = $('ord-nom');
      if (nom && !nom.value) nom.focus();
      else $('ord-tel')?.focus();
    }, 120);
  }

  /* ── Close ── */
  function close() {
    $('ordOverlay')?.classList.remove('open');
  }

  /* ── Submit ── */
  async function submit() {
    const nom     = _val('nom');
    const tel     = _val('tel');
    const email   = _val('email');
    const ville   = _ordCityChosen ? _ordCityChosen.label : _val('ville');
    const adresse = _val('adresse');
    const note    = _val('note');

    /* Validate required fields */
    const { grand, del, surAmt, tva, ttc } = _getTotals();
    const err = $('ordErr');
    if (!nom)  { if (err) { err.textContent = 'Le nom est requis.'; err.classList.add('on'); } $('ord-nom')?.focus(); return; }
    if (!tel)  { if (err) { err.textContent = 'Le téléphone est requis.'; err.classList.add('on'); } $('ord-tel')?.focus(); return; }
    if ((del > 0 || _ordCityChosen) && !adresse) {
      if (err) { err.textContent = "L'adresse de livraison est requise."; err.classList.add('on'); }
      $('ord-adresse')?.focus(); return;
    }
    if (err) err.classList.remove('on');

    /* Loading state */
    const btn  = $('ordSubmitBtn');
    const slot = btn?.querySelector('.btn-slot');
    const origHTML = slot?.innerHTML;
    if (btn && slot) {
      btn.disabled = true;
      slot.classList.add('slide-out');
      const loading = document.createElement('span');
      loading.className = 'btn-slot-success';
      loading.textContent = '⏳ Envoi…';
      btn.appendChild(loading);
      requestAnimationFrame(() => loading.classList.add('slide-in'));
    }

    const row = {
      ref:            _q?.ref || ('KTE-' + Date.now().toString(36).toUpperCase().slice(-6)),
      status:         'nouveau',
      client_nom:     nom,
      client_tel:     tel,
      client_email:   email,
      client_ville:   ville,
      client_adresse: adresse,
      total_ht:       grand,
      total_ttc:      ttc,
      user_id:        (typeof AUTH !== 'undefined' ? AUTH.getUserId() : null),
      source:         (typeof ROLE !== 'undefined' && ROLE === 'provider') ? 'admin' : 'client',
      payload: {
        ..._q,
        totals: { ...(_q?.totals || {}), del },  // use resolved del (city-aware), not snapshot
        client: { nom, tel, email, ville, adresse, note },
      },
    };

    try {
      // ── If a brief is pending in memory, insert it to DB first ──
      const hasBriefing = typeof KOTE_BRIEFING !== 'undefined' &&
                          typeof KOTE_BRIEFING.getPendingBriefRow === 'function';
      if (hasBriefing) {
        const briefRow = KOTE_BRIEFING.getPendingBriefRow();
        if (briefRow) {
          const bRes = await fetch(`${window.SUPABASE_URL}/rest/v1/kote_briefs`, {
            method: 'POST',
            headers: {
              'apikey':        window.SUPABASE_ANON_KEY,
              'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
              'Content-Type':  'application/json',
              'Prefer':        'return=representation',
            },
            body: JSON.stringify({ ...briefRow, order_ref: row.ref }),
          });
          if (bRes.ok) {
            const saved   = await bRes.json();
            const briefId = Array.isArray(saved) ? saved[0]?.id : saved?.id;
            // Patch brief_id into order payload items so the link is preserved
            if (briefId && row.payload?.items) {
              row.payload.items = row.payload.items.map(i =>
                i.snap?.type === 'brief'
                  ? { ...i, snap: { ...i.snap, brief_id: briefId } }
                  : i
              );
            }
            KOTE_BRIEFING.clearPendingBriefRow();
          } else {
            console.warn('[ORDERS] Brief DB insert failed:', bRes.status);
          }
        }
      }

      const pushResult = await _push(row);
      if (!pushResult.queued) {
        // Online — fire notifications immediately (fire-and-forget)
        _upsertClient(row);
        _tgNotify(row);
        _sendConfirmEmail(row);
      }
      // If queued: notifications will fire in _QUEUE.flush() when back online
    } catch(e) {
      console.error('ORDERS.submit push failed:', e);
      if (btn && slot) {
        btn.disabled = false;
        slot.classList.remove('slide-out');
        btn.querySelector('.btn-slot-success')?.remove();
      }
      if (err) {
        err.textContent = `Erreur d'envoi — vérifiez votre connexion. (${e.message})`;
        err.classList.add('on');
      }
      return;
    }

    /* Show success animation on button briefly before navigating */
    if (btn && slot) {
      const loadingEl = btn.querySelector('.btn-slot-success');
      if (loadingEl) {
        loadingEl.textContent = pushResult.queued ? '📋 Enregistré hors-ligne' : '✓ Envoyé !';
      }
    }
    await new Promise(r => setTimeout(r, 420));

    /* Build WhatsApp notification link for provider */
    const waPhone = (DB.contact?.whatsapp || '').replace(/\D/g, '');
    const d = new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'});
    const waLines = [
      `Kote Imprimerie — Nouvelle commande`,
      `Ref : ${row.ref}  |  ${d}`,
      ``,
      `Client : ${nom}`,
      `Tel    : ${tel}`,
      email   ? `Email  : ${email}`   : null,
      adresse ? `Adresse: ${adresse}${ville ? ', '+ville : ''}` : null,
      ``,
      `Produits`,
      `--------`,
      ...(_q?.items || []).map(i => `- ${fmtN(i.quantity)} x ${i.prodName} : ${fmt(i.baseTotal)} DH`),
      ``,
      // Design requests summary
      ...(_q?.items || []).flatMap(i => {
        if (!i.snap) return [];
        if (i.snap.designOption === 'service' && i.snap.designTier) {
          const tLabel = { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier;
          return [`Conception ${tLabel} (${i.snap.designCost || 0} DH) — ${i.prodName}`];
        }
        if (i.snap.designOption === 'file' && i.snap.designFileName) {
          return [`Fichier fourni : ${i.snap.designFileName} — ${i.prodName}`];
        }
        return [];
      }),
      `Total HT  : ${fmt(grand)} DH`,
      `Total TTC : ${fmt(ttc)} DH`,
      note ? `\nNote : ${note}` : null,
    ].filter(l => l !== null).join('\n');

    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waLines)}`
      : null;

    /* Close form overlay */
    close();

    /* Render success confirmation */
    _renderSuccess(row, waUrl, { nom, tel, email, ville, adresse, note }, pushResult.queued);
    UI.show('vConfirm');
  }

  /* ── Success screen ── */
  function _renderSuccess(row, waUrl, client, isQueued) {
    const grand  = row.total_ht;
    const ttc    = row.total_ttc;
    const del    = row.payload?.totals?.del   ?? 0;
    const surAmt = row.payload?.totals?.surAmt ?? 0;
    const d      = new Date().toLocaleDateString('fr-MA', {day:'2-digit',month:'2-digit',year:'numeric'});
    const truckSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

    $('confirmBox').innerHTML = `
      <div class="cf-ico" style="color:var(--gn)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          style="width:28px;height:28px">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <h2 class="cf-title">${isQueued ? 'Commande enregistrée' : 'Demande envoyée !'}</h2>
      ${isQueued ? `
      <div class="cf-offline-notice">
        📶 Vous êtes hors-ligne. Votre commande a été sauvegardée et sera envoyée automatiquement dès le retour de la connexion.
      </div>` : ''}
      <p class="cf-sub">
        Notre équipe vous contactera sous 24h au
        <strong>${client.tel}</strong>.
      </p>

      <div class="ref-box">
        <div class="ref-lbl">Référence</div>
        <div class="ref-val">${row.ref}</div>

        <!-- Items summary -->
        <table class="cf-table">
          <thead><tr>
            <th>Désignation</th>
            <th class="cf-td-num">Qté</th>
            <th class="cf-td-num">Total HT</th>
          </tr></thead>
          <tbody>
            ${(_q?.items || []).map(i => `
              <tr>
                <td>
                  <strong>${i.prodName}</strong>
                  ${i.specs ? `<br><span style="font-size:.59rem;color:var(--t2);font-weight:400">${i.specs}</span>` : ''}
                  ${i.notes ? `<br><em style="font-size:.57rem;color:var(--t3)">"${i.notes}"</em>` : ''}
                </td>
                <td class="cf-td-num">${fmtN(i.quantity)}</td>
                <td class="cf-td-num" style="color:var(--bl);font-weight:700">${fmt(i.baseTotal)} DH</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${(_q?.items||[]).filter(i=>i.snap?.designOption==='service'&&i.snap?.designCost).map(i=>`
              <tr>
                <td style="color:var(--pu,#7c3aed)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="9" height="9" style="vertical-align:middle;margin-right:3px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
                  Conception ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier]||i.snap.designTier }
                </td>
                <td class="cf-td-num" colspan="1"></td>
                <td class="cf-td-num" style="color:var(--pu,#7c3aed);font-weight:700">${fmt(i.snap.designCost)} DH</td>
              </tr>`).join('')}
            ${surAmt > 0 ? `<tr><td style="text-align:right;color:var(--am)" colspan="2">Délai express</td><td class="cf-td-num" style="color:var(--am)">+${fmt(surAmt)} DH</td></tr>` : ''}
            ${del > 0 ? `<tr><td style="text-align:right;color:var(--t2)" colspan="2"><span style="display:inline-flex;align-items:center;gap:4px">${truckSVG}Livraison</span></td><td class="cf-td-num">+${fmt(del)} DH</td></tr>` : ''}
            <tr class="cf-total-row cf-ht-row">
              <td style="text-align:right;color:var(--t2)" colspan="2">Total HT</td>
              <td class="cf-td-num">${fmt(grand)} DH</td>
            </tr>
            <tr class="cf-tva-row">
              <td style="text-align:right;color:var(--t2)" colspan="2">TVA 20%</td>
              <td class="cf-td-num" style="color:var(--t2)">${fmt(ttc - grand)} DH</td>
            </tr>
            <tr class="cf-total-row">
              <td style="text-align:right" colspan="2">Total TTC</td>
              <td class="cf-td-num">${fmt(ttc)} DH</td>
            </tr>
          </tfoot>
        </table>

        <!-- Client details recap -->
        <div class="ord-recap">
          <div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${client.nom}</span>
          </div>
          <div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.1 .86a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <span>${client.tel}</span>
          </div>
          ${client.email ? `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>${client.email}</span>
          </div>` : ''}
          ${client.adresse ? `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${client.adresse}${client.ville ? ', '+client.ville : ''}</span>
          </div>` : `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              style="width:11px;height:11px;color:var(--t3);flex-shrink:0">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
            <span style="color:var(--t3)">Retrait en boutique</span>
          </div>`}
        </div>
      </div>

      <!-- Actions -->
      <div class="cf-btns">
        ${waUrl
          ? `<a class="cf-ico-btn cf-wa-btn" href="${waUrl}" target="_blank" rel="noopener">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
               <span>Notifier par WhatsApp</span>
             </a>`
          : ''
        }
        ${(() => {
          // Designer WA button — only if order has a conception service item
          const designItems = (_q?.items || []).filter(i => i.snap?.designOption === 'service' && i.snap?.designTier);
          const waDesigner = (DB?.contact?.designer_whatsapp || '').replace(/\D/g, '');
          if (!designItems.length || !waDesigner) return '';
          const tierLabels = { basic:'Basic', pro:'Pro', premium:'Premium' };
          const lines = designItems.map(i => `${i.prodName} — Niveau ${tierLabels[i.snap.designTier] || i.snap.designTier} (${fmt(i.snap.designCost || 0)} DH)`).join(', ');
          const msg = encodeURIComponent(`Bonjour, je viens de passer une commande (réf: ${row.ref}) avec une demande de conception graphique : ${lines}. Pouvez-vous me contacter ?`);
          return `<a class="cf-ico-btn" href="https://wa.me/${waDesigner}?text=${msg}" target="_blank" rel="noopener"
            style="background:#f5f3ff;color:#7c3aed;border-color:#ddd6fe;text-decoration:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            <span>Contacter le graphiste</span>
          </a>`;
        })()}
        ${(typeof AUTH !== 'undefined' && AUTH.getUser())
          ? `<button class="cf-ico-btn" onclick="AUTH.openMyOrders()" style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
               <span>Mes commandes</span>
             </button>`
          : `<a class="cf-ico-btn" href="tracking.html?ref=${row.ref}" target="_blank" style="background:#eff6ff;color:#2563eb;border-color:#bfdbfe;text-decoration:none">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
               <span>Suivre ma commande</span>
             </a>`
        }
      </div>

      <div style="margin-top:.7rem">
        <button class="btn-xs" onclick="afterCheckout()">← Faire une autre demande</button>
      </div>`;
  }

  return { open, openOrderForm: _openForm, close, submit, _filterCities, _openCityDrop, _chooseCity, _clearCity, _refreshSummary };
})();


/* ══════════════════════════════════════════════════════════
   BOOT — runs last after all page scripts are loaded
   ══════════════════════════════════════════════════════════ */
PERF.mark('orders_boot');
DB_MOD.tryRestore();

/* Mark when DB is confirmed ready (fires immediately if session-restored) */
APP.whenReady(() => { PERF.mark('orders_ready'); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
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

function _setOffline(isOffline) {
  const bar = $('offlineBar');
  if (bar) bar.style.display = isOffline ? 'flex' : 'none';
}
window.addEventListener('offline', () => _setOffline(true));
window.addEventListener('online',  () => {
  _setOffline(false);
  _QUEUE.flush(); // send any orders that were queued while offline
});
_setOffline(!navigator.onLine);
_syncQueueBadge(); // show pending count badge if any orders are waiting
