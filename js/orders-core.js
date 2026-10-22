'use strict';

/* ============================================================
   orders-core.js -- Offline queue, ORDERS form, boot
   Extracted from kote-orders.js (S8 split).
   Exposes: _QUEUE, _syncQueueBadge, ORDERS
   Requires: kote-core.js, orders-cart.js, orders-auth.js
   Load order: last orders file (contains boot)
   ============================================================ */



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
    const ta     = _selectedTaId ? _taList().find(t => t.id === _selectedTaId) : null;
    const surAmt = ta
      ? Math.round(sub * (ta.sur || 0) * 100) / 100
      : (_q?.totals?.surAmt ?? 0);
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
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10" class="svg-pu-ico"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
               Conception — ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier }
             </span>
             <span class="ord-item-qty ord-item-qty--pu">${fmt(i.snap.designCost)} DH</span>
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
        ${surAmt > 0 ? `<div class="ord-total-row"><span class="text-am">Délai express</span><strong class="text-am">+${fmt(surAmt)} DH</strong></div>` : ''}
        ${del > 0 ? `<div class="ord-total-row"><span class="del-span">${truckIco}Livraison${_ordCityChosen ? ' — ' + _ordCityChosen.label : ''}</span><strong>+${fmt(del)} DH</strong></div>` : ''}
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
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="10" height="10" class="svg-pu-ico"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
               Conception — ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier] || i.snap.designTier }
             </span>
             <span class="ord-item-qty ord-item-qty--pu">${fmt(i.snap.designCost)} DH</span>
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
          ${surAmt > 0 ? `<div class="ord-total-row"><span class="text-am">${_taList().find(t=>t.id===_selectedTaId)?.label || 'Délai express'}</span><strong class="text-am">+${fmt(surAmt)} DH</strong></div>` : ''}
          ${del > 0 ? `<div class="ord-total-row"><span class="del-span"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>Livraison</span><strong>+${fmt(del)} DH</strong></div>` : ''}
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

        ${(() => {
          const list = _taList();
          if (!list.length || DB.pricing?.ta_enabled === false) return '';
          return `<div class="ord-field">
            <label class="ord-lbl">Délai de production</label>
            <div class="ta-pills" style="margin-top:.3rem">
              ${list.map(t => {
                const lbl = t.sur === 0 ? 'Inclus' : `+${Math.round(t.sur * 100)}%`;
                const cls = t.sur === 0 ? 's0' : 'sp-';
                return `<div class="opt ta-p${_selectedTaId === t.id ? ' on' : ''}"
                  onclick="ORDERS.selectTa('${t.id}')">
                  <div class="ta-p-name">${t.label}</div>
                  <div class="ta-p-days">${t.days}</div>
                  <div class="ta-p-sur ${cls}">${lbl}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        })()}

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
  let _selectedTaId  = null;

  function _taList() {
    return (DB.turnaround_options || []).filter(t => t.enabled !== false);
  }

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
    const list = _taList();
    _selectedTaId = (_q?.ta?.id && list.find(t => t.id === _q.ta.id))
      ? _q.ta.id : (list[0]?.id ?? null);

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

    let pushResult;
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

      pushResult = await _push(row);
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
      <div class="cf-ico text-gn">
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
                <td class="cf-td-num cf-td-num--bl">${fmt(i.baseTotal)} DH</td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            ${(_q?.items||[]).filter(i=>i.snap?.designOption==='service'&&i.snap?.designCost).map(i=>`
              <tr>
                <td class="td-pu">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="9" height="9" style="vertical-align:middle;margin-right:3px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
                  Conception ${ { basic:'Basic', pro:'Pro', premium:'Premium' }[i.snap.designTier]||i.snap.designTier }
                </td>
                <td class="cf-td-num" colspan="1"></td>
                <td class="cf-td-num cf-td-num--pu">${fmt(i.snap.designCost)} DH</td>
              </tr>`).join('')}
            ${surAmt > 0 ? `<tr><td class="cf-td-right--am" colspan="2">Délai express</td><td class="cf-td-num" style="color:var(--am)">+${fmt(surAmt)} DH</td></tr>` : ''}
            ${del > 0 ? `<tr><td class="cf-td-right" colspan="2"><span style="display:inline-flex;align-items:center;gap:4px">${truckSVG}Livraison</span></td><td class="cf-td-num">+${fmt(del)} DH</td></tr>` : ''}
            <tr class="cf-total-row cf-ht-row">
              <td class="cf-td-right" colspan="2">Total HT</td>
              <td class="cf-td-num">${fmt(grand)} DH</td>
            </tr>
            <tr class="cf-tva-row">
              <td class="cf-td-right" colspan="2">TVA 20%</td>
              <td class="cf-td-num cf-td-num--t2">${fmt(ttc - grand)} DH</td>
            </tr>
            <tr class="cf-total-row">
              <td class="cf-td-right-plain" colspan="2">Total TTC</td>
              <td class="cf-td-num">${fmt(ttc)} DH</td>
            </tr>
          </tfoot>
        </table>

        <!-- Client details recap -->
        <div class="ord-recap">
          <div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="ico-sm-dim">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${client.nom}</span>
          </div>
          <div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="ico-sm-dim">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.1 .86a2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9c1.37 2.49 3.41 4.53 5.91 5.91l.79-.79a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <span>${client.tel}</span>
          </div>
          ${client.email ? `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="ico-sm-dim">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            <span>${client.email}</span>
          </div>` : ''}
          ${client.adresse ? `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="ico-sm-dim">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>${client.adresse}${client.ville ? ', '+client.ville : ''}</span>
          </div>` : `<div class="ord-recap-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
              class="ico-sm-dim">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
            </svg>
            <span class="adm-dim-txt">Retrait en boutique</span>
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
            class="cf-ico-btn--pu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            <span>Contacter le graphiste</span>
          </a>`;
        })()}
        ${(typeof AUTH !== 'undefined' && AUTH.getUser())
          ? `<button class="cf-ico-btn" onclick="AUTH.openMyOrders()" class="cf-ico-btn--bl">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
               <span>Mes commandes</span>
             </button>`
          : `<a class="cf-ico-btn" href="tracking.html?ref=${row.ref}" target="_blank" class="cf-ico-btn--bl">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
               <span>Suivre ma commande</span>
             </a>`
        }
      </div>

      <div style="margin-top:.7rem">
        <button class="btn-xs" onclick="afterCheckout()">← Faire une autre demande</button>
      </div>`;
  }

  function selectTa(id) {
    _selectedTaId = id;
    const box = $('ordBox');
    if (box) {
      box.querySelectorAll('.ta-p').forEach(el => {
        el.classList.toggle('on', el.getAttribute('onclick') === `ORDERS.selectTa('${id}')`);
      });
    }
    _refreshSummary();
  }

  return { open, openOrderForm: _openForm, close, submit, selectTa, _filterCities, _openCityDrop, _chooseCity, _clearCity, _refreshSummary };
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
