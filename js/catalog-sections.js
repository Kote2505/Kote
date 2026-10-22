'use strict';

/* ════════════════════════════════════════════════════════
   catalog-sections.js — Section renderer registry (SECTIONS)
   Extracted from kote-catalog.js (S7 split).
   Exposes: SECTIONS
   Requires: kote-core.js (DB, IC, curProd, curSel)
   Load order: first catalog file
   ════════════════════════════════════════════════════════ */

/* ════ sections.js ════ */
/* ════════════════════════════════════════════════════════
   SECTIONS  — config form block registry
   Each entry: { html(prod, sel, db, entry) => string,
                 defaults?(prod, sel, db, entry) }
   ════════════════════════════════════════════════════════ */
const SECTIONS = (() => {
  const registry = {};
  const reg = (id, def) => { registry[id] = def; };

  /* ── Shared overflow state helper (used by chipList + pillList) ──
     Returns { visible, rest, selInRest, expanded } for any list > 6 items */
  function _overflowState(items, key, selVal) {
    const expanded  = !!curSel[key];
    const visible   = expanded ? items : items.slice(0, 5);
    const rest      = items.slice(5);
    const selInRest = !expanded && rest.some(it => it.id === selVal);
    return { expanded, visible, rest, selInRest };
  }

  /* Stable key from an onclick string — strips non-alphanum, caps at 12 chars */
  const _ovfKey = onclick => '_ovf_' + onclick.replace(/[^a-z0-9]/gi, '').slice(0, 12);

  /* ── Chip list (label + small dims line) with optional overflow ── */
  const chipList = (items, selVal, onclick, extraClass = '') => {
    const mkChip = it => {
      const dimsDisplay = (it.w && it.h) ? `${it.w}×${it.h} mm` : (it.dims || it.desc || '—');
      return `<div class="opt chip${selVal === it.id ? ' on' : ''} ${extraClass}" onclick="${onclick}('${it.id}')">
        <strong>${it.label}</strong><small>${dimsDisplay}</small>
      </div>`;
    };
    if (items.length <= 6) return `<div class="chips">${items.map(mkChip).join('')}</div>`;
    const key = _ovfKey(onclick);
    const { expanded, visible, rest, selInRest } = _overflowState(items, key, selVal);
    return `<div class="chips">
      ${visible.map(mkChip).join('')}
      ${!expanded ? `<div class="opt chip chip-spec-trigger${selInRest ? ' on' : ''}" onclick="UI.expandList('${key}')">
        <strong>+${rest.length} autres</strong>
      </div>` : ''}
    </div>`;
  };

  /* ── Pill list (label only) with optional overflow ── */
  const pillList = (items, selVal, onclick) => {
    const mkPill = it =>
      `<div class="opt pill${selVal === it.id ? ' on' : ''}" onclick="${onclick}('${it.id}')">${it.label}</div>`;
    if (items.length <= 6) return `<div class="pills">${items.map(mkPill).join('')}</div>`;
    const key = _ovfKey(onclick);
    const { expanded, visible, rest, selInRest } = _overflowState(items, key, selVal);
    return `<div class="pills">
      ${visible.map(mkPill).join('')}
      ${!expanded ? `<div class="opt pill${selInRest ? ' on' : ''}" onclick="UI.expandList('${key}')">+${rest.length} autres</div>` : ''}
    </div>`;
  };

  /* ── Custom size (mm) inputs ── */
  const customSizeInputs = (sel, wLabel = 'Largeur (mm)', hLabel = 'Hauteur (mm)', wPh = 'ex: 85', hPh = 'ex: 55') =>
    `<div class="custom-row">
      <div class="inp-wrap"><label class="inp-lbl">${wLabel}</label>
        <input type="number" class="inp" id="cW" placeholder="${wPh}" min="1" max="420" oninput="UI.customSizeMM()"
          value="${sel.sizeObj?.id === 'custom' ? sel.sizeObj.w || '' : ''}"></div>
      <div class="inp-wrap"><label class="inp-lbl">${hLabel}</label>
        <input type="number" class="inp" id="cH" placeholder="${hPh}" min="1" max="420" oninput="UI.customSizeMM()"
          value="${sel.sizeObj?.id === 'custom' ? sel.sizeObj.h || '' : ''}"></div>
      <span id="custom-size-warn" style="font-size:.62rem;color:var(--rd);align-self:center"></span>
    </div>`;

  /* ── Custom quantity slide-in block ── */
  const qtyCustomBlock = (sel, wrapId = 'qtyCustomWrap', inpId = 'qtyInp', onInput = 'UI.qtyCustom(this.value)') =>
    `<div class="disc on" id="${wrapId}" style="max-height:${sel.customQty ? '50px' : '0'};margin-top:.22rem">
      <div class="qty-custom-row">
        <span class="qty-custom-lbl">Quantité :</span>
        <input type="number" class="inp" style="flex:1" id="${inpId}" min="1" placeholder="ex: 750"
          value="${sel.customQty ? sel.quantity : ''}" oninput="${onInput}">
      </div>
    </div>`;

  /* ════════════════════════════════════════════════════════
     UNIFIED SIZE  — single section ID, 5 mode branches.
     mode is set by admin in section config: entry.config.mode
       'presets' — chip list W×H + optional custom
       'free'    — 2 inputs L×H (mm), FO direct (boîtes, étuis)
       'derived' — L×H×Soufflet → open format computed (sac)
       'rollup'  — preset cards with cost_base (rollup, kakémono)
       'sqm'     — 2 inputs W×H (cm) for grand format
     Every mode writes a normalized sizeObj to curSel.
  ════════════════════════════════════════════════════════ */

  /* ── Internal: write normalized sizeObj + trigger re-render ── */
  function _applySizeObj(obj) {
    curSel.size    = obj.id || 'custom';
    curSel.sizeObj = { ...obj };
    STATE.emit('curSel');
    if (typeof UI !== 'undefined') { UI.renderForm(); UI.renderFooter(); }
  }
  /* ── Internal: compute sac open-format from L, H, Soufflet ── */
  function _sacFO(L, H, S) {
    return { fo_w: 2*(L+S)+20, fo_h: H + (S/2+20) + 40 };
  }
  /* ── Internal: resolve best planche display for imposition preview ── */
  function _bestPlanche(fw, fh, db) {
    const planches = db.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
    const MULT = [1, 2, 4];
    const mg = db.sheet?.margin || 3, bl = db.sheet?.bleed || 2;
    let best = { planche: planches.at(-1).id, mult: MULT.at(-1), perSheet: null };
    for (let i = 0; i < planches.length; i++) {
      const pl = planches[i];
      const uw = pl.w - mg*2, uh = pl.h - mg*2;
      const fw2 = fw+bl*2, fh2 = fh+bl*2;
      const n = Math.max(Math.floor(uw/fw2)*Math.floor(uh/fh2), Math.floor(uw/fh2)*Math.floor(uh/fw2));
      if (n >= 1) { best = { planche: pl.id, mult: MULT[i], perSheet: n }; break; }
    }
    return best;
  }

  /* ── Planche info badge shared by free + derived modes ── */
  function _plancheBadge(fw, fh, db) {
    if (!fw || !fh) return '';
    const { planche, mult, perSheet } = _bestPlanche(fw, fh, db);
    return `<div style="text-align:right">
      <div style="font-size:.67rem;font-weight:700;color:var(--bl)">${planche}</div>
      <div style="font-size:.63rem;color:${mult > 1 ? 'var(--am)' : 'var(--gn)'};font-weight:600">planche ×${mult}</div>
      ${perSheet ? `<div style="font-size:.63rem;color:var(--t2)">${perSheet} pièce${perSheet>1?'s':''} / planche</div>` : ''}
    </div>`;
  }

  /* ── Mode: presets ── */
  function _sizeModePresets(p, s, db, entry) {
    const sizes       = entry?.config?.items || p.sizes || [];
    const allowCustom = !!(entry?.config?.allow_custom);
    const withFold    = !!(entry?.config?.fold);
    const chips = allowCustom
      ? [...sizes, { id:'custom', label:'Sur mesure', dims:'≤ A3' }]
      : sizes;

    // Build sizeObj-setting onclick — sets size+sizeObj atomically
    const onSize = sz => {
      const obj = JSON.stringify({ ...sz, mode:'presets' }).replace(/"/g, '&quot;');
      return `SECTIONS.setSizeObj(${obj})`;
    };
    const mkChip = sz => {
      const dimsDisplay = (sz.w && sz.h) ? `${sz.w}×${sz.h} mm` : (sz.dims || sz.desc || '—');
      return `<div class="opt chip${s.size === sz.id ? ' on' : ''}" onclick="${onSize(sz)}">
        <strong>${sz.label}</strong><small>${dimsDisplay}</small>
      </div>`;
    };
    const chipsHtml = chips.length <= 6
      ? `<div class="chips">${chips.map(mkChip).join('')}</div>`
      : (() => {
          const key = '_ovf_sizePresets';
          const expanded = !!curSel[key];
          const visible = expanded ? chips : chips.slice(0,5);
          const rest    = chips.slice(5);
          const selInRest = !expanded && rest.some(sz => sz.id === s.size);
          return `<div class="chips">
            ${visible.map(mkChip).join('')}
            ${!expanded ? `<div class="opt chip chip-spec-trigger${selInRest?' on':''}" onclick="UI.expandList('${key}')">
              <strong>+${rest.length} autres</strong></div>` : ''}
          </div>`;
        })();

    const foldHtml = withFold && s.size
      ? `<div style="margin-top:.45rem">
          <div class="s-lbl">Pliage</div>
          ${chipList(p.fold_options || [], s.fold, "fSel.bind(null,'fold')")}
        </div>`
      : '';

    return `<div>
      <div class="s-lbl">${withFold ? 'Format ouvert' : 'Format'}</div>
      ${chipsHtml}
      ${s.size === 'custom' ? customSizeInputs(s) : ''}
      ${foldHtml}
    </div>`;
  }

  /* ── Half forme-de-découpe: split FO when it doesn't fit on A3+ ── */
  /* overlap = 20mm for both boite and sac (collage/assemblage)       */
  function _halfFD(Lo, Ho, overlap, db) {
    const bp = _bestPlanche(Lo, Ho, db);
    if (bp.mult === 1) return null; // fits on A3+, no split needed
    return { demi_w: Math.ceil((Lo + overlap) / 2), demi_h: Ho, passes: 2 };
  }

  /* ── Mode: free (format ouvert direct — boîte, étui) ── */
  function _sizeModeFree(p, s, db, entry) {
    const L = s.sizeObj?.mode === 'free' ? (s.sizeObj.w || 0) : (s.ouvertL || 0);
    const H = s.sizeObj?.mode === 'free' ? (s.sizeObj.h || 0) : (s.ouvertH || 0);
    const hasAll = L > 0 && H > 0;
    return `<div>
      <div class="s-lbl">Format ouvert (mm)</div>
      <div class="cat-flex-wrap mb-6" style="margin-bottom:.5rem">
        <div class="d-flex-g3-ci">
          <span class="cat-axis-lbl">L</span>
          <div class="inp-wrap inp-wrap--0">
            <input type="number" class="inp" style="width:86px" min="1" placeholder="ex: 420"
              id="sizeInputL" value="${L || ''}" oninput="SECTIONS.updateFreeDims()">
          </div>
        </div>
        <span class="micro-t3">×</span>
        <div class="d-flex-g3-ci">
          <span class="cat-axis-lbl">H</span>
          <div class="inp-wrap inp-wrap--0">
            <input type="number" class="inp" style="width:86px" min="1" placeholder="ex: 297"
              id="sizeInputH" value="${H || ''}" oninput="SECTIONS.updateFreeDims()">
          </div>
        </div>
        <span class="cat-sub-t2" style="color:var(--t3)">mm</span>
      </div>
      <div id="sizeFormatOuvert">
        ${hasAll ? `
        <div style="background:var(--bl-lt);border:1px solid var(--bl-md);border-radius:var(--r);
          padding:.4rem .7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
          <div>
            <div class="cat-fmt-lbl">Format ouvert</div>
            <div class="cat-fmt-val">${L} × ${H} mm</div>
            <div class="cat-fmt-sub">Format à plat</div>
          </div>
          ${_plancheBadge(L, H, db)}
        </div>` : `
        <div class="cat-hint-row">Entrez L et H pour voir le format ouvert.</div>`}
      </div>
    </div>`;
  }

  /* ── Mode: derived (sac — L×H×Soufflet → FO) ── */
  function _sizeModeDerived(p, s, db, entry) {
    const presets = entry?.config?.presets || [
      { label:'Petit', l:240, h:320, souf:80  },
      { label:'Moyen', l:320, h:420, souf:100 },
      { label:'Grand', l:380, h:480, souf:120 },
    ];
    const so   = s.sizeObj;
    const L    = (so?.mode === 'derived' ? so.w : null)  ?? s.sacL ?? 0;
    const H    = (so?.mode === 'derived' ? so.h : null)  ?? s.sacH ?? 0;
    const S    = (so?.mode === 'derived' ? so.soufflet : null) ?? s.sacS ?? 0;
    const hasAll = L && H && S;
    const Lo   = hasAll ? 2*(L+S)+20 : null;
    const Ho   = hasAll ? H+(S/2+20)+40 : null;
    const half = (hasAll && Lo && Ho) ? _halfFD(Lo, Ho, 20, db) : null;
    const bp   = (hasAll && Lo && Ho) ? _bestPlanche(half ? half.demi_w : Lo, half ? half.demi_h : Ho, db) : null;

    const isPreset = (l,h,so2) => L===l && H===h && S===so2;
    const mkPreset = pr => {
      const fo = _sacFO(pr.l, pr.h, pr.souf);
      const half = _halfFD(fo.fo_w, fo.fo_h, 20, db);
      const obj = { id:`sac-${pr.l}x${pr.h}x${pr.souf}`, label:pr.label,
        w:pr.l, h:pr.h, soufflet:pr.souf, fo_w:fo.fo_w, fo_h:fo.fo_h, mode:'derived',
        dims:`${pr.l}×${pr.h} mm (+${pr.souf} soufflet)`, ...(half || {}) };
      const json = JSON.stringify(obj).replace(/"/g, '&quot;');
      return `<div class="opt pill${isPreset(pr.l,pr.h,pr.souf)?' on':''}"
        onclick="SECTIONS.setSizeObj(${json});curSel.sacL=${pr.l};curSel.sacH=${pr.h};curSel.sacS=${pr.souf}">
        ${pr.label}<span class="cat-opacity-sub">${pr.l}×${pr.h}×${pr.souf}</span>
      </div>`;
    };
    const isCustom = !presets.some(pr => isPreset(pr.l, pr.h, pr.souf)) && (L||H||S);
    return `<div>
      <div class="s-lbl">Format du sac (mm)</div>
      <div class="pills mb-6">
        ${presets.map(mkPreset).join('')}
        <div class="opt pill${isCustom?' on':''}"
          onclick="document.getElementById('sacSizeCustomWrap').style.display='flex'">
          Personnalisé
        </div>
      </div>
      <div id="sacSizeCustomWrap" style="display:${isCustom?'flex':'none'};align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem">
        ${['L','H','S'].map((ax,i) => {
          const val = [L,H,S][i];
          const ph  = ['320','420','100'][i];
          return `<div class="d-flex-g3-ci">
            <span class="micro-t3--600">${ax}</span>
            <div class="inp-wrap inp-wrap--0">
              <input type="number" class="inp" style="width:64px" min="1" placeholder="${ph}"
                id="sacSize${ax}" value="${val||''}" oninput="SECTIONS.updateSacDims()">
            </div>
          </div>
          <span class="cat-axis-lbl" style="font-weight:400">×</span>`;
        }).join('')}
        <span class="micro-t3">mm</span>
      </div>
      <div id="sacSizeFO">
        ${hasAll && Lo && Ho ? (ROLE === 'client'
        ? `<div class="cat-fmt-box">
            <div class="cat-fmt-lbl">Format ouvert</div>
            <div class="cat-fmt-val">${half ? half.demi_w : Lo} × ${half ? half.demi_h : Ho} mm</div>
          </div>`
        : `
        <div style="background:var(--bl-lt);border:1px solid var(--bl-md);border-radius:var(--r);
          padding:.4rem .7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
          <div>
            <div class="cat-fmt-lbl">${half ? 'Format ouvert complet' : 'Format ouvert'}</div>
            <div style="font-size:${half?'.82rem':'1rem'};font-weight:700;color:${half?'var(--t2)':'var(--bl)'}">${Lo} × ${Ho} mm</div>
            ${half ? `<div class="cat-sep-bl">
              <div class="cat-fmt-lbl">½ FD · 2 passes</div>
              <div class="cat-fmt-val">${half.demi_w} × ${half.demi_h} mm</div>
              <div class="cat-fmt-sub">(${Lo}+20)÷2 × ${Ho}</div>
            </div>` : `<div class="cat-fmt-sub">
              L : 2×(${L}+${S})+20 &nbsp;·&nbsp; H : ${H}+(${S}/2+20)+40
            </div>`}
          </div>
          ${_plancheBadge(half ? half.demi_w : Lo, half ? half.demi_h : Ho, db)}
        </div>`) : `
        <div class="cat-hint-row">
          Renseignez L, H et Soufflet pour voir le format ouvert.
        </div>`}
      </div>
    </div>`;
  }

  /* ── Internal: compute boite open-format from L, H, Profondeur (languette 15 mm) ── */
  function _boiteFO(L, H, P) {
    return { fo_w: 2*(L+P)+20, fo_h: H+2*(P+20) };
  }

  /* ── Mode: boite (L × H × Profondeur → FO calculé, languette 15 mm) ── */
  function _sizeModeBoite(p, s, db, entry) {
    const defaultPresets = [
      { label:'Petit',  l:100, h:150, p:50  },
      { label:'Moyen',  l:150, h:220, p:70  },
      { label:'Grand',  l:200, h:300, p:100 },
    ];
    const presets = (entry?.config?.presets?.length) ? entry.config.presets : defaultPresets;
    const so   = s.sizeObj;
    const L    = (so?.mode === 'boite' ? so.w          : null) ?? s.boiteL ?? 0;
    const H    = (so?.mode === 'boite' ? so.h          : null) ?? s.boiteH ?? 0;
    const Prof = (so?.mode === 'boite' ? so.profondeur : null) ?? s.boiteP ?? 0;
    const hasAll = L && H && Prof;
    const foW  = hasAll ? 2*(L+Prof)+20 : null;
    const foH  = hasAll ? H+2*(Prof+20) : null;
    const half = (hasAll && foW && foH) ? _halfFD(foW, foH, 20, db) : null;
    const bp   = (hasAll && foW && foH) ? _bestPlanche(half ? half.demi_w : foW, half ? half.demi_h : foH, db) : null;

    const isPreset = (l, h, pf) => L===l && H===h && Prof===pf;
    const mkPreset = pr => {
      const pf = pr.p ?? pr.profondeur ?? 50;
      const fo = _boiteFO(pr.l, pr.h, pf);
      const half = _halfFD(fo.fo_w, fo.fo_h, 20, db);
      const obj = { id:`boite-${pr.l}x${pr.h}x${pf}`, label:pr.label,
        w:pr.l, h:pr.h, profondeur:pf, ...fo, mode:'boite',
        dims:`${pr.l}×${pr.h}×${pf} mm`, ...(half || {}) };
      const json = JSON.stringify(obj).replace(/"/g, '&quot;');
      return `<div class="opt pill${isPreset(pr.l, pr.h, pf) ? ' on' : ''}"
        onclick="SECTIONS.setSizeObj(${json});curSel.boiteL=${pr.l};curSel.boiteH=${pr.h};curSel.boiteP=${pf}">
        ${pr.label}<span class="cat-opacity-sub">${pr.l}×${pr.h}×${pf}</span>
      </div>`;
    };
    const isCustom = !presets.some(pr => isPreset(pr.l, pr.h, pr.p??pr.profondeur??50)) && (L||H||Prof);
    return `<div>
      <div class="s-lbl">Format boîte (mm)</div>
      <div class="pills mb-6">
        ${presets.map(mkPreset).join('')}
        <div class="opt pill${isCustom ? ' on' : ''}"
          onclick="document.getElementById('boiteSizeCustomWrap').style.display='flex'">
          Personnalisé
        </div>
      </div>
      <div id="boiteSizeCustomWrap" style="display:${isCustom?'flex':'none'};align-items:center;gap:.4rem;flex-wrap:wrap;margin-bottom:.5rem">
        ${['L','H','P'].map((ax, i) => {
          const val = [L,H,Prof][i];
          const ph  = ['150','220','70'][i];
          return `<div class="d-flex-g3-ci">
            <span class="micro-t3--600">${ax}</span>
            <div class="inp-wrap inp-wrap--0">
              <input type="number" class="inp" style="width:72px" min="1" placeholder="${ph}"
                id="boiteSize${ax}" value="${val||''}" oninput="SECTIONS.updateBoiteDims()">
            </div>
          </div>
          <span class="cat-axis-lbl" style="font-weight:400">×</span>`;
        }).join('')}
        <span class="micro-t3">mm</span>
      </div>
      <div id="boiteSizeFO">
        ${hasAll && foW && foH ? (ROLE === 'client'
        ? `<div class="cat-fmt-box">
            <div class="cat-fmt-lbl">Format ouvert</div>
            <div class="cat-fmt-val">${half ? half.demi_w : foW} × ${half ? half.demi_h : foH} mm</div>
          </div>`
        : `
        <div style="background:var(--bl-lt);border:1px solid var(--bl-md);border-radius:var(--r);
          padding:.4rem .7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
          <div>
            <div class="cat-fmt-lbl">${half ? 'Format ouvert complet' : 'Format ouvert'}</div>
            <div style="font-size:${half?'.82rem':'1rem'};font-weight:700;color:${half?'var(--t2)':'var(--bl)'}">${foW} × ${foH} mm</div>
            ${half ? `<div class="cat-sep-bl">
              <div class="cat-fmt-lbl">½ FD · 2 passes</div>
              <div class="cat-fmt-val">${half.demi_w} × ${half.demi_h} mm</div>
              <div class="cat-fmt-sub">(${foW}+20)÷2 × ${foH}</div>
            </div>` : `<div class="cat-fmt-sub">
              L\u00a0: 2\xd7(${L}+${Prof})+20 &nbsp;\xb7&nbsp; H\u00a0: ${H}+2\xd7(${Prof}+20)
            </div>`}
          </div>
          ${_plancheBadge(half ? half.demi_w : foW, half ? half.demi_h : foH, db)}
        </div>`) : `
        <div class="cat-hint-row">
          Sélectionnez un format ou saisissez L, H et Profondeur.
        </div>`}
      </div>
    </div>`;
  }

  /* ── Mode: rollup (preset cards with cost_base) ── */
  function _sizeModeRollup(p, s, db, entry) {
    const sizes = entry?.config?.items || p.sizes || [];
    const onSize = sz => {
      const obj = JSON.stringify({ ...sz, mode:'rollup' }).replace(/"/g, '&quot;');
      return `SECTIONS.setSizeObj(${obj})`;
    };
    return `<div>
      <div class="s-lbl">Format</div>
      <div class="ru-cards">${sizes.map(sz =>
        `<div class="opt ru-card${s.size === sz.id ? ' on' : ''}" onclick="${onSize(sz)}">
          <div style="font-weight:600">${sz.label}</div>
          ${sz.cost_base ? `<div class="micro-t3">${sz.cost_base} DH</div>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  /* ── Mode: sqm (grand format — cm inputs) ── */
  function _sizeModeSqm(p, s, db, entry) {
    // GF uses gfW/gfH directly — no sizeObj needed
    const W = s.gfW || '', H = s.gfH || '';
    return `<div>
      <div class="s-lbl">Dimensions (cm)</div>
      <div class="cat-flex-wrap">
        <div class="d-flex-g3-ci">
          <span class="cat-axis-lbl">L</span>
          <div class="inp-wrap inp-wrap--0">
            <input type="number" class="inp" style="width:86px" min="1" placeholder="ex: 100"
              id="gfW" value="${W}" oninput="UI.gfDims(this.value,null)">
          </div>
        </div>
        <span class="micro-t3">×</span>
        <div class="d-flex-g3-ci">
          <span class="cat-axis-lbl">H</span>
          <div class="inp-wrap inp-wrap--0">
            <input type="number" class="inp" style="width:86px" min="1" placeholder="ex: 200"
              id="gfH" value="${H}" oninput="UI.gfDims(null,this.value)">
          </div>
        </div>
        <span class="cat-sub-t2" style="color:var(--t3)">cm</span>
        ${W && H ? `<span class="cat-bl-sm">
          ${(parseFloat(W)/100*parseFloat(H)/100).toFixed(3)} m²</span>` : ''}
      </div>
    </div>`;
  }

  reg('size', {
    html: (p, s, db, entry) => {
      const mode = entry?.config?.mode || 'presets';
      switch (mode) {
        case 'free':    return _sizeModeFree(p, s, db, entry);
        case 'derived': return _sizeModeDerived(p, s, db, entry);
        case 'boite':   return _sizeModeBoite(p, s, db, entry);
        case 'rollup':  return _sizeModeRollup(p, s, db, entry);
        case 'sqm':     return _sizeModeSqm(p, s, db, entry);
        default:        return _sizeModePresets(p, s, db, entry);   // 'presets'
      }
    },
    defaults: (p, s, db, entry) => {
      const mode  = entry?.config?.mode || 'presets';
      const items = entry?.config?.items || p.sizes || [];
      switch (mode) {
        case 'presets':
        case 'rollup':
          if (!s.size && items.length) {
            s.size    = items[0].id;
            s.sizeObj = { ...items[0], mode };
          }
          if (mode === 'presets' && entry?.config?.fold) {
            s.fold = s.fold || (p.fold_options || [])[0]?.id;
          }
          break;
        case 'derived': {
          const presets = entry?.config?.presets || [{ label:'Petit', l:240, h:320, souf:80 }];
          if (!s.sizeObj && presets.length) {
            const pr = presets[0];
            const fo = _sacFO(pr.l, pr.h, pr.souf);
            const half = _halfFD(fo.fo_w, fo.fo_h, 20, db);
            s.sacL = pr.l; s.sacH = pr.h; s.sacS = pr.souf;
            s.sizeObj = { id:`sac-${pr.l}x${pr.h}x${pr.souf}`, label:pr.label,
              w:pr.l, h:pr.h, soufflet:pr.souf, ...fo, mode:'derived',
              dims:`${pr.l}×${pr.h} mm (+${pr.souf} soufflet)`, ...(half || {}) };
          }
          break;
        }
        case 'free':
          if (!s.sizeObj) s.sizeObj = { id:'fo-custom', w:0, h:0, mode:'free', label:'' };
          break;
        case 'boite': {
          const presets = entry?.config?.presets || [];
          if (!s.sizeObj && presets.length) {
            const pr = presets[0];
            const pf = pr.p ?? pr.profondeur ?? 50;
            const fo = _boiteFO(pr.l, pr.h, pf);
            const half = _halfFD(fo.fo_w, fo.fo_h, 20, db);
            s.boiteL = pr.l; s.boiteH = pr.h; s.boiteP = pf;
            s.sizeObj = { id:`boite-${pr.l}x${pr.h}x${pf}`, label:pr.label,
              w:pr.l, h:pr.h, profondeur:pf, ...fo, mode:'boite',
              dims:`${pr.l}×${pr.h}×${pf} mm`, ...(half || {}) };
          }
          break;
        }
        case 'sqm':
          // no sizeObj — gfW/gfH used directly
          break;
      }
    }
  });

  /* ── Public methods exposed on the SECTIONS registry ── */
  /* Called from inline onclicks in the size section HTML */
  registry.setSizeObj     = _applySizeObj;

  /* Called from oninput on free-mode inputs (sizeInputL / sizeInputH) */
  registry.updateFreeDims = function() {
    const L = parseFloat(document.getElementById('sizeInputL')?.value) || 0;
    const H = parseFloat(document.getElementById('sizeInputH')?.value) || 0;
    // Keep legacy ouvertL/ouvertH for CALC backward compat during transition
    curSel.ouvertL = L;
    curSel.ouvertH = H;
    curSel.sizeObj = {
      id:    `fo-${L}x${H}`, label: `${L} × ${H} mm`,
      dims:  `${L}×${H} mm`, w: L, h: H, mode: 'free',
    };
    STATE.emit('curSel');
    // Surgical update — only refresh the result display, never re-render the form
    // (full renderForm() would destroy the focused input on every keystroke)
    const resultEl = document.getElementById('sizeFormatOuvert');
    if (resultEl) {
      const hasAll = L > 0 && H > 0;
      resultEl.innerHTML = hasAll
        ? `<div style="background:var(--bl-lt);border:1px solid var(--bl-md);border-radius:var(--r);
            padding:.4rem .7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">
            <div>
              <div class="cat-fmt-lbl">Format ouvert</div>
              <div class="cat-fmt-val">${L} × ${H} mm</div>
              <div class="cat-fmt-sub">Format à plat</div>
            </div>
            ${_plancheBadge(L, H, DB)}
          </div>`
        : `<div class="cat-hint-row">Entrez L et H pour voir le format ouvert.</div>`;
    }
    if (typeof UI !== 'undefined') { UI.renderFooter(); }
  };

  /* Called from oninput on derived-mode inputs (sacSizeL / sacSizeH / sacSizeS) */
  registry.updateSacDims = function() {
    const L = parseFloat(document.getElementById('sacSizeL')?.value) || 0;
    const H = parseFloat(document.getElementById('sacSizeH')?.value) || 0;
    const S = parseFloat(document.getElementById('sacSizeS')?.value) || 0;
    // Keep legacy fields for CALC backward compat
    curSel.sacL = L; curSel.sacH = H; curSel.sacS = S;
    if (L && H && S) {
      const fo = _sacFO(L, H, S);
      const half = _halfFD(fo.fo_w, fo.fo_h, 20, DB);
      curSel.sizeObj = {
        id: `sac-${L}x${H}x${S}`, label: `${L}×${H} (+${S})`,
        dims: `${L}×${H} mm (+${S} soufflet)`,
        w: L, h: H, soufflet: S, ...fo, mode: 'derived', ...(half || {}),
      };
    }
    STATE.emit('curSel');
    // Refresh FD dims display surgically (forme-decoupe section doesn't re-render on keystrokes)
    const fdEl = document.getElementById('fdDimsDisplay');
    if (fdEl && L && H && S) {
      const fo = _sacFO(L, H, S);
      const half = _halfFD(fo.fo_w, fo.fo_h, 20, DB);
      const fdW = half ? half.demi_w : fo.fo_w;
      const fdH = half ? half.demi_h : fo.fo_h;
      const areaCm2 = Math.round(fdW * fdH / 100);
      const halfBadge = half ? ' <span class="cat-bl-bold">(x2)</span>' : '';
      fdEl.innerHTML = 'Format\u00a0: <strong class="txt-t2">' + fdW + ' \xd7 ' + fdH + ' mm' + halfBadge + '</strong> <span class="txt-t3">(' + areaCm2 + ' cm\xb2)</span>';
    }
    // Surgical update — only refresh the result display, never re-render the form
    // (full renderForm() would destroy the focused input on every keystroke)
    const resultEl = document.getElementById('sacSizeFO');
    if (resultEl) {
      const hasAll = L && H && S;
      const Lo = hasAll ? 2*(L+S)+20 : null;
      const Ho = hasAll ? H+(S/2+20)+40 : null;
      const half = (hasAll && Lo && Ho) ? _halfFD(Lo, Ho, 20, DB) : null;
      const bp = (hasAll && Lo && Ho) ? _bestPlanche(half ? half.demi_w : Lo, half ? half.demi_h : Ho, DB) : null;
      resultEl.innerHTML = (hasAll && Lo && Ho)
        ? (ROLE === 'client'
          ? `<div class="cat-fmt-box">` +
            `<div class="cat-fmt-lbl">Format ouvert</div>` +
            `<div class="cat-fmt-val">${half ? half.demi_w : Lo} \xd7 ${half ? half.demi_h : Ho} mm</div>` +
            `</div>`
          : `<div style="background:var(--bl-lt);border:1px solid var(--bl-md);border-radius:var(--r);` +
            `padding:.4rem .7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">` +
            `<div>` +
            `<div class="cat-fmt-lbl">${half ? 'Format ouvert complet' : 'Format ouvert'}</div>` +
            `<div style="font-size:${half?'.82rem':'1rem'};font-weight:700;color:${half?'var(--t2)':'var(--bl)'}">${Lo} \xd7 ${Ho} mm</div>` +
            (half
              ? `<div class="cat-sep-bl">` +
                `<div class="cat-fmt-lbl">\xbd FD \xb7 2 passes</div>` +
                `<div class="cat-fmt-val">${half.demi_w} \xd7 ${half.demi_h} mm</div>` +
                `<div class="cat-fmt-sub">(${Lo}+20)\xf72 \xd7 ${Ho}</div>` +
                `</div>`
              : `<div class="cat-fmt-sub">` +
                `L\u00a0: 2\xd7(${L}+${S})+20 \u00a0\xb7\u00a0 H\u00a0: ${H}+(${S}/2+20)+40` +
                `</div>`) +
            `</div>${_plancheBadge(half ? half.demi_w : Lo, half ? half.demi_h : Ho, DB)}</div>`)
        : `<div class="cat-hint-row">` +
          `Renseignez L, H et Soufflet pour voir le format ouvert.</div>`;
    }
    if (typeof UI !== 'undefined') { UI.renderFooter(); }
  };

  /* Called from oninput on boite-mode inputs (boiteSizeL / boiteSizeH / boiteSizeP) */
  registry.updateBoiteDims = function() {
    const L = parseFloat(document.getElementById('boiteSizeL')?.value) || 0;
    const H = parseFloat(document.getElementById('boiteSizeH')?.value) || 0;
    const P = parseFloat(document.getElementById('boiteSizeP')?.value) || 0;
    curSel.boiteL = L; curSel.boiteH = H; curSel.boiteP = P;
    if (L && H && P) {
      const fo = _boiteFO(L, H, P);
      const half = _halfFD(fo.fo_w, fo.fo_h, 20, DB);
      curSel.sizeObj = {
        id: `boite-${L}x${H}x${P}`, label: `${L}\xd7${H}\xd7${P} mm`,
        dims: `${L}\xd7${H}\xd7${P} mm`, w: L, h: H, profondeur: P,
        ...fo, mode: 'boite', ...(half || {}),
      };
    }
    STATE.emit('curSel');
    // Refresh FD dims display surgically (forme-decoupe section doesn't re-render on keystrokes)
    const fdElB = document.getElementById('fdDimsDisplay');
    if (fdElB && L && H && P) {
      const fo = _boiteFO(L, H, P);
      const half = _halfFD(fo.fo_w, fo.fo_h, 20, DB);
      const fdW = half ? half.demi_w : fo.fo_w;
      const fdH = half ? half.demi_h : fo.fo_h;
      const areaCm2 = Math.round(fdW * fdH / 100);
      const halfBadge = half ? ' <span class="cat-bl-bold">(x2)</span>' : '';
      fdElB.innerHTML = 'Format\u00a0: <strong class="txt-t2">' + fdW + ' \xd7 ' + fdH + ' mm' + halfBadge + '</strong> <span class="txt-t3">(' + areaCm2 + ' cm\xb2)</span>';
    }
    // Surgical update — only refresh the result display, never re-render the form
    const resultEl = document.getElementById('boiteSizeFO');
    if (resultEl) {
      if (L && H && P) {
        const fo = _boiteFO(L, H, P);
        const half = _halfFD(fo.fo_w, fo.fo_h, 20, DB);
        resultEl.innerHTML = ROLE === 'client'
          ? `<div class="cat-fmt-box">` +
            `<div class="cat-fmt-lbl">Format ouvert</div>` +
            `<div class="cat-fmt-val">${half ? half.demi_w : fo.fo_w} \xd7 ${half ? half.demi_h : fo.fo_h} mm</div>` +
            `</div>`
          : `<div style="background:var(--bl-lt);border:1px solid var(--bl-md);border-radius:var(--r);` +
            `padding:.4rem .7rem;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.3rem">` +
            `<div>` +
            `<div class="cat-fmt-lbl">${half ? 'Format ouvert complet' : 'Format ouvert'}</div>` +
            `<div style="font-size:${half?'.82rem':'1rem'};font-weight:700;color:${half?'var(--t2)':'var(--bl)'}">${fo.fo_w} \xd7 ${fo.fo_h} mm</div>` +
            (half
              ? `<div class="cat-sep-bl">` +
                `<div class="cat-fmt-lbl">\xbd FD \xb7 2 passes</div>` +
                `<div class="cat-fmt-val">${half.demi_w} \xd7 ${half.demi_h} mm</div>` +
                `<div class="cat-fmt-sub">(${fo.fo_w}+20)\xf72 \xd7 ${fo.fo_h}</div>` +
                `</div>`
              : `<div class="cat-fmt-sub">` +
                `L\u00a0: 2\xd7(${L}+${P})+20 \u00a0\xb7\u00a0 H\u00a0: ${H}+2\xd7(${P}+20)` +
                `</div>`) +
            `</div>${_plancheBadge(half ? half.demi_w : fo.fo_w, half ? half.demi_h : fo.fo_h, DB)}</div>`;
      } else {
        resultEl.innerHTML =
          `<div class="cat-hint-row">` +
          `Renseignez L, H et Profondeur pour voir le format ouvert.</div>`;
      }
    }
    if (typeof UI !== 'undefined') { UI.renderFooter(); }
  };

  /* ════════════════════════════════════════════════════════
     PAPER
  ════════════════════════════════════════════════════════ */
  reg('paper', {
    html: (p, s, db, entry) => {
      const cfg        = entry?.config || {};
      let allowedIds   = cfg.allowed != null ? cfg.allowed : (p.paper_stocks || []);
      let specialIds   = cfg.special != null ? cfg.special : (p.paper_stocks_special || []);

      // No restrictions configured → show all DB papers
      const noRestrictions = !allowedIds.length && !specialIds.length;
      if (noRestrictions) {
        allowedIds = db.paper_stocks.filter(x => !x.special).map(x => x.id);
        specialIds = db.paper_stocks.filter(x => x.special).map(x => x.id);
      }
      // Explicit product overrides: always show all papers for these products
      const showAll = noRestrictions || ['flyer', 'depliant'].includes(p.id);

      if (showAll) {
        const std      = db.paper_stocks.filter(ps => !ps.special);
        const spc      = db.paper_stocks.filter(ps => ps.special);
        const FEATURED = ['135g', '170g', '250g'];
        const featured    = std.filter(ps => FEATURED.some(g => ps.label.startsWith(g)));
        const others      = std.filter(ps => !FEATURED.some(g => ps.label.startsWith(g)));
        const allOthers   = [...others, ...spc];
        const othersOpen  = allOthers.some(ps => ps.id === s.paper) || !!s.specOpen;
        return `<div>
          <div class="s-lbl">Support papier</div>
          <div class="chips">
            ${featured.map(ps => `<div class="opt chip${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
              <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
            <div class="opt chip chip-spec-trigger${othersOpen ? ' on' : ''}" onclick="UI.toggleSpecPaper()">
              <strong>Autres…</strong>
            </div>
          </div>
          <div class="spec-sub${othersOpen ? ' on' : ''}">
            <div class="chips">${allOthers.map(ps =>
              `<div class="opt chip${ps.special ? ' chip-sp' : ''}${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
                <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
            </div>
          </div>
        </div>`;
      }

      const prodStd   = db.paper_stocks.filter(ps => !ps.special && allowedIds.includes(ps.id));
      const prodSpc   = db.paper_stocks.filter(ps => specialIds.includes(ps.id));
      const specOpen  = prodSpc.some(ps => ps.id === s.paper) || !!s.specOpen;

      if (!prodSpc.length) {
        return `<div><div class="s-lbl">Support papier</div>${chipList(prodStd, s.paper, "fSel.bind(null,'paper')")}</div>`;
      }
      return `<div>
        <div class="s-lbl">Support papier</div>
        <div class="chips">
          ${prodStd.map(ps => `<div class="opt chip${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
            <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
          <div class="opt chip chip-spec-trigger${specOpen ? ' on' : ''}" onclick="UI.toggleSpecPaper()" title="Papiers spéciaux">
            <strong>✶ Spéciaux</strong>
          </div>
        </div>
        <div class="spec-sub${specOpen ? ' on' : ''}">
          <div class="chips">${prodSpc.map(ps =>
            `<div class="opt chip chip-sp${s.paper === ps.id ? ' on' : ''}" onclick="fSel('paper','${ps.id}')">
              <strong>${ps.label}</strong><small>${ps.desc}</small></div>`).join('')}
          </div>
        </div>
      </div>`;
    }
  });

  // Paper defaults — attached after registration to keep html/defaults adjacent is less confusing
  // than a separate IIFE mutating the registry entry
  registry['paper'].defaults = (p, s, db, entry) => {
    if (s.paper) return;
    const cfg = entry?.config || {};
    let allowedIds = cfg.allowed != null ? cfg.allowed : (p.paper_stocks || []);
    if (!allowedIds.length) allowedIds = db.paper_stocks.filter(x => !x.special).map(x => x.id);
    const first = db.paper_stocks.find(ps => allowedIds.includes(ps.id));
    if (first) s.paper = first.id;
  };

  /* ════════════════════════════════════════════════════════
     SIDES
  ════════════════════════════════════════════════════════ */
  reg('sides', {
    html: (p, s, db, entry) => {
      const hasChemiseSection = !!(_getComposition(p).find(e =>
        (typeof e === 'string' ? e : e.type_id) === 'chemise-options'
      ));
      if (hasChemiseSection) return '';

      const cfg = entry?.config || {};
      const hasSingle = cfg.single !== false;
      const hasDouble = cfg.double !== false;
      const sidesOrder = (p.sides && p.sides.length) ? p.sides : ['single', 'double'];
      const sidesBtns = {
        single: hasSingle ? `<button class="seg-btn${s.sides === 'single' ? ' on' : ''}" onclick="fSel('sides','single')"><span class="seg-ico"><span class="seg-p"></span></span>Recto</button>` : '',
        double: hasDouble ? `<button class="seg-btn${s.sides === 'double' ? ' on' : ''}" onclick="fSel('sides','double')"><span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V</button>` : ''
      };
      const rendered = sidesOrder.map(v => sidesBtns[v] || '').join('');
      if (!rendered.trim()) return '';
      return `<div><div class="s-lbl">Impression</div>
        <div class="seg">${rendered}</div></div>`;
    },
    defaults: (p, s, db, entry) => {
      const cfg = entry?.config || {};
      const hasSingle = cfg.single !== false;
      const hasSingleDefault = cfg.default === 'single' || (!cfg.default && hasSingle);
      s.sides = hasSingleDefault ? 'single' : 'double';
    }
  });

  /* ════════════════════════════════════════════════════════
     LAM
  ════════════════════════════════════════════════════════ */
  reg('lam', {
    html: (p, s, db, entry) => {
      let allowedIds = entry?.config?.allowed ?? (p.finishes_lam || []);
      if (!allowedIds.length) allowedIds = (db.finishes || []).filter(f => f.id !== 'none').map(f => f.id);
      const lamPills = (db.finishes || []).filter(f => allowedIds.includes(f.id));
      const _compHasAddonSec = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'addon');
      const hasAddon = !_compHasAddonSec && (entry?.config?.addon ?? (p.finishes_addon || [])).length > 0;
      return `<div>
        <div class="s-lbl">Finition</div>
        <div class="pills">
          ${lamPills.map(it => `<div class="opt pill${s.lam === it.id ? ' on' : ''}" onclick="fSel('lam','${it.id}')">${it.label}</div>`).join('')}
          ${hasAddon ? `<div class="opt pill${s.addonOpen ? ' on' : ''}" onclick="UI.toggleFinition()">Autre finitions</div>` : ''}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      let allowedIds = entry?.config?.allowed ?? (p.finishes_lam || []);
      if (!allowedIds.length) allowedIds = (db.finishes || []).filter(f => f.id !== 'none').map(f => f.id);
      s.lam = allowedIds[0] || 'none';
    }
  });

  /* ════════════════════════════════════════════════════════
     ADDON
  ════════════════════════════════════════════════════════ */
  reg('addon', {
    html: (p, s, db, entry) => {
      const cfgAllowed = entry?.config?.allowed;
      const allowedIds = (cfgAllowed && cfgAllowed.length > 0)
        ? cfgAllowed
        : (p.finishes_addon?.length > 0 ? p.finishes_addon : (db.finishes_addon || []).map(f => f.id));
      const all     = (db.finishes_addon || []).filter(f => allowedIds.includes(f.id));
      const special = all.filter(f => f.group === 'special');
      const fac     = all.filter(f => f.group === 'faconnage');
      const fdEnabled = !!(entry?.config?.fd_enabled);
      if (!all.length && !fdEnabled) return '';

      const specGrid = special.length ? `
        <div class="sg-lbl">Finitions spéciales</div>
        <div class="fin-grid-v2">${special.map(f => {
          const on = (s.addons || []).includes(f.id);
          const fc = s.addonFaces?.[f.id] || 1;
          return `<div class="opt fin-cell-v2${on ? ' on' : ''}">
            <div class="fin-cell-top" onclick="fSel('addon','${f.id}')">
              <span class="fin-cell-lbl">${f.label}</span>
              <div class="tog${on ? ' on' : ''}"></div>
            </div>
            ${on ? `<div class="fin-cell-faces">
              <div class="face-pill${fc === 1 ? ' on' : ''}" onclick="event.stopPropagation();UI.addonFaces('${f.id}',1)">1 face</div>
              <div class="face-pill${fc === 2 ? ' on' : ''}" onclick="event.stopPropagation();UI.addonFaces('${f.id}',2)">2 faces</div>
            </div>` : ''}
          </div>`;
        }).join('')}</div>` : '';

      const facGrid = fac.length ? `
        <div class="sg-lbl"${special.length ? ' class="mt-45"' : ''}>Façonnage</div>
        <div class="fac-grid">${fac.map(f => {
          const on = (s.addons || []).includes(f.id);
          return `<div class="opt fac-cell${on ? ' on' : ''}" onclick="fSel('addon','${f.id}')">
            <span>${f.label}</span><div class="tog${on ? ' on' : ''}"></div></div>`;
        }).join('')}</div>` : '';

      /* ── FD sub-row (sheet_fit only — addon config fd_enabled:true) ──
         Renders INSIDE the collapsible "Finitions supplémentaires" block.
         Writes sel.fd = { enabled:true, reuse:bool, setup_cost:number }.
      ── */
      let fdRow = '';
      if (fdEnabled) {
        const fdSetup   = entry?.config?.fd_setup_cost ?? db?.forme_decoupe?.setup ?? 300;
        const fd        = s.fd || { enabled: false, reuse: false, setup_cost: fdSetup };
        const fdOn      = fd.enabled !== false;
        const fdReuse   = !!fd.reuse;
        fdRow = `
        <div class="mt-45 adm-sep-top" style="border-top-style:dashed">
          <div class="sg-lbl">Forme de découpe</div>
          <div class="opt fac-cell${fdOn ? ' on' : ''}"
            onclick="SECTIONS.toggleFD('${fdSetup}')">
            <span style="font-size:.68rem;font-weight:600">Forme de découpe</span>
            <div class="tog${fdOn ? ' on' : ''}"></div>
          </div>
          ${fdOn ? `<div class="opt fac-cell${fdReuse ? ' on' : ''}" style="margin-top:.25rem"
            onclick="SECTIONS.toggleFDReuse('${fdSetup}')">
            <span style="font-size:.63rem">${db?.forme_decoupe?.reuse_label || 'J\'ai déjà ma forme (gabarit existant)'}</span>
            <div class="tog${fdReuse ? ' on' : ''}"></div>
          </div>` : ''}
        </div>`;
      }

      const hasActive = (s.addons || []).some(id => allowedIds.includes(id));
      const fdActive  = fdEnabled && s.fd?.enabled;
      const open = !!s.addonOpen || hasActive || fdActive;
      return `<div>
        <div class="notes-acc${open ? ' open' : ''}" id="addonAcc">
          <div class="notes-hdr" onclick="UI.toggleAddon()">
            <div class="notes-hdr-l" style="display:flex;align-items:center;gap:.4rem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;flex-shrink:0;color:var(--t3)"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
              Finitions supplémentaires
              ${hasActive ? `<span class="cat-bl-badge">(${(s.addons||[]).filter(id=>allowedIds.includes(id)).length} actif${(s.addons||[]).filter(id=>allowedIds.includes(id)).length>1?'s':''})</span>` : ''}
              ${fdActive ? `<span style="font-size:.58rem;color:var(--am);font-weight:600">+ FD</span>` : ''}
            </div>
            <div class="notes-chev">${IC['chev-d']}</div>
          </div>
          <div class="notes-body">
            <div class="notes-inner" style="padding-top:.4rem">
              <div class="fin-wrap"><div class="fin-section">${specGrid}${facGrid}${fdRow}</div></div>
            </div>
          </div>
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     QTY
  ════════════════════════════════════════════════════════ */
  reg('qty', {
    html: (p, s, db, entry) => {
      const all      = entry?.config?.items || p.quantities || [];
      const isCustom = s.customQty;

      // Offset pill — compute sheets to check eligibility
      const offPill = (() => {
        const off = CALC.resolveOffsetProfile(p, db);
        if (!off || off.enabled === false || !s.sizeObj || !s.quantity) return { inline: '', below: '' };
        const isEnvLocal = p.id === 'enveloppe';
        const fit    = (s.sizeObj.id === 'custom' || isEnvLocal) ? { n: 1 } : CALC.sheetFit(s.sizeObj.w, s.sizeObj.h, db.sheet);
        const sheets = Math.ceil(s.quantity / fit.n);
        const threshold = p.offset_threshold || off.min_sheets || 1000;
        if (sheets < threshold) {
          // Below threshold — reset flags so next time quantity goes above, auto-switch fires cleanly
          if (s.useOffset) { s.useOffset = false; s._offsetManualOff = false; }
          return { inline: '', below: '' };
        }
        // Auto-switch to offset unless user explicitly opted out
        if (!s._offsetManualOff && !s.useOffset) { s.useOffset = true; STATE.emit('curSel'); }
        const active = !!s.useOffset;
        const pill   = `<button class="opt qty-btn offset-pill${active ? ' active' : ''}" onclick="UI.toggleOffset()" title="${active ? 'Basculer vers Numérique' : 'Basculer vers Offset'}">Offset</button>`;
        if (!active) return { inline: pill, below: '' };
        const colors      = s.offsetColors || 4;
        const colorPicker = `<div class="offset-colors">
          <div class="offset-colors-lbl">Nombre de couleurs :</div>
          <div class="seg">${[1,2,3,4,5,6].map(n =>
            `<button class="seg-btn${colors === n ? ' on' : ''}" onclick="UI.setOffsetColors(${n})" title="${n} couleur${n > 1 ? 's' : ''}">${n}</button>`
          ).join('')}</div>
        </div>`;
        return { inline: pill, below: colorPicker };
      })();

      const btns = (qtys, expanded, rest) => {
        const selInRest = !expanded && !isCustom && rest.includes(s.quantity);
        return `${qtys.map(q => `<button class="opt qty-btn${s.quantity === q && !isCustom ? ' on' : ''}" onclick="UI.qty(${q})">${fmtN(q)}</button>`).join('')}
          ${!expanded && rest.length ? `<button class="opt qty-btn${selInRest ? ' on' : ''}" onclick="UI.expandList('_qtyExpanded')">+${rest.length} autres</button>` : ''}
          <button class="opt qty-btn${isCustom ? ' on' : ''}" onclick="UI.qtyCustomOpen()">Personnalisé…</button>
          ${offPill.inline}`;
      };

      if (all.length <= 6) {
        return `<div>
          <div class="s-lbl">Quantité</div>
          <div class="qty-row">${btns(all, true, [])}</div>
          ${qtyCustomBlock(s)}
          ${offPill.below}
        </div>`;
      }
      const expanded = !!s._qtyExpanded;
      const visible  = expanded ? all : all.slice(0, 5);
      const rest     = all.slice(5);
      return `<div>
        <div class="s-lbl">Quantité</div>
        <div class="qty-row">${btns(visible, expanded, rest)}</div>
        ${qtyCustomBlock(s)}
        ${offPill.below}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const qtys = entry?.config?.items || p.quantities || [];
      if (!s.quantity && qtys.length) s.quantity = qtys[0];
    }
  });

  /* ════════════════════════════════════════════════════════
     NOTES
  ════════════════════════════════════════════════════════ */
  reg('notes', {
    html: (p, s) => {
      const filled = !!(s.notes && s.notes.trim());
      return `<div>
        <div class="notes-acc${filled ? ' open' : ''}" id="notesAcc">
          <div class="notes-hdr" onclick="UI.toggleNotes()">
            <div class="notes-hdr-l">${IC['file-plus']} Notes &amp; instructions
              ${filled ? `<span class="cat-bl-badge">(rempli)</span>` : ''}
            </div>
            <div class="notes-chev">${IC['chev-d']}</div>
          </div>
          <div class="notes-body"><div class="notes-inner">
            <textarea class="inp notes-ta" placeholder="Instructions, gabarit, Pantone, fichiers…"
              oninput="curSel.notes=this.value">${s.notes || ''}</textarea>
          </div></div>
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     LEGACY SIZE WRAPPERS — backward compat for products not yet
     migrated by _migrateDB. Delegates to unified size renderer
     with the appropriate mode injected into entry.config.
  ════════════════════════════════════════════════════════ */
  const _legacySizeWrap = (mode, extraCfg) => ({
    html: (p, s, db, entry) => {
      const merged = { ...entry, config: { mode, ...(extraCfg||{}), ...(entry?.config||{}) } };
      return SECTIONS['size'].html(p, s, db, merged);
    },
    defaults: (p, s, db, entry) => {
      const merged = { ...entry, config: { mode, ...(extraCfg||{}), ...(entry?.config||{}) } };
      SECTIONS['size'].defaults(p, s, db, merged);
    },
  });
  reg('depl-format',   _legacySizeWrap('presets', { fold: true }));
  reg('rollup-size',   _legacySizeWrap('rollup'));
  reg('gf-dims',       _legacySizeWrap('sqm'));
  reg('format-ouvert', _legacySizeWrap('free'));
  reg('sac-format',    _legacySizeWrap('derived'));
  reg('boite-format',  _legacySizeWrap('boite'));

  /* ════════════════════════════════════════════════════════
     CAT-PAGES
  ════════════════════════════════════════════════════════ */
  reg('cat-pages', {
    html: (p, s, db, entry) => {
      const all   = entry?.config?.items || p.page_options || [];
      const shown = all.slice(0, 4);
      const rest  = all.slice(4);
      const isC   = s.customPages;
      const showWarn = s.binding === 'pique' && s.pages && s.pages % 4 !== 0;
      return `<div>
        <div class="s-lbl">Nombre de pages <span class="cat-note-sub">(couverture incluse)</span></div>
        <div class="qty-row">
          ${shown.map(n => `<div class="opt qty-btn${s.pages === n && !isC ? ' on' : ''}" onclick="UI.catPages(${n})">${n}</div>`).join('')}
          <select class="opt qty-select${!isC && rest.includes(s.pages) ? ' on' : ''}" onchange="UI.catPagesSelect(this.value)">
            <option value="">Plus…</option>
            ${rest.map(n => `<option value="pg:${n}"${s.pages === n && !isC ? ' selected' : ''}>${n}</option>`).join('')}
            <option value="custom"${isC ? ' selected' : ''}>Personnalisé…</option>
          </select>
        </div>
        <div class="disc on" id="catPagesWrap" style="max-height:${isC ? '50px' : '0'};margin-top:.22rem">
          <div class="qty-custom-row">
            <span class="qty-custom-lbl">Pages :</span>
            <input type="number" class="inp" style="flex:1" min="4" step="4"
              placeholder="multiple de 4" value="${isC ? s.pages : ''}"
              oninput="UI.catPagesCustom(this.value)">
          </div>
        </div>
        ${showWarn ? `<div class="warn">${IC.alert} Piqûre à cheval : le nombre de pages doit être un multiple de 4.</div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      s.pages = (entry?.config?.items || p.page_options || [])[0] || 8;
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-INT
  ════════════════════════════════════════════════════════ */
  reg('cat-int', {
    html: (p, s, db, entry) => {
      const cfg    = entry?.config || {};
      const allowed = cfg.allowed ?? (p.paper_stocks || []);
      const lamIds  = cfg.lam     ?? (p.finishes_lam_int || []);
      const papers  = db.paper_stocks.filter(ps => allowed.includes(ps.id));
      const fins    = (db.finishes || []).filter(f => lamIds.includes(f.id));
      const sidesInt = s.sidesInt || 'double';
      return `<div class="cat-block">
        <div class="cat-block-hdr">${IC.layers} Intérieur</div>
        <div class="s-lbl">Papier</div>
        ${chipList(papers, s.paper, "fSel.bind(null,'paper')")}
        <div class="mt-35">
          <div class="s-lbl">Impression intérieur</div>
          <div class="seg">
            <button class="seg-btn${sidesInt==='single'?' on':''}" onclick="fSel('sidesInt','single')">
              <span class="seg-ico"><span class="seg-p"></span></span>Recto
            </button>
            <button class="seg-btn${sidesInt==='double'?' on':''}" onclick="fSel('sidesInt','double')">
              <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
            </button>
          </div>
        </div>
        ${fins.length ? `<div class="mt-35">
          <div class="s-lbl">Pelliculage intérieur</div>
          ${pillList(fins, s.lamInterior, "fSel.bind(null,'lamInterior')")}
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const allowed = entry?.config?.allowed ?? (p.paper_stocks || []);
      if (!s.paper) s.paper = allowed[0] || null;
      s.lamInterior = 'none';
      if (!s.sidesInt) s.sidesInt = 'double';
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-COV
  ════════════════════════════════════════════════════════ */
  reg('cat-cov', {
    html: (p, s, db, entry) => {
      const cfg      = entry?.config || {};
      const allowed  = cfg.allowed ?? (p.paper_stocks_cover || []);
      const lamIds   = cfg.lam     ?? (p.finishes_lam || []);
      const papers   = db.paper_stocks.filter(ps => allowed.includes(ps.id));
      const finPills = (db.finishes || []).filter(f => lamIds.includes(f.id));
      const _catCovHasAddonSec = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'addon');
      const hasAddonCov = !_catCovHasAddonSec && (cfg.addon ?? (p.finishes_addon || [])).length > 0;
      const sidesCov = s.sidesCov || 'double';
      return `<div class="cat-block">
        <div class="cat-block-hdr">${IC['file-plus']} Couverture</div>
        <div class="s-lbl">Papier</div>
        ${chipList(papers, s.paperCover, "fSel.bind(null,'paperCover')")}
        <div class="mt-35">
          <div class="s-lbl">Impression couverture</div>
          <div class="seg">
            <button class="seg-btn${sidesCov==='single'?' on':''}" onclick="fSel('sidesCov','single')">
              <span class="seg-ico"><span class="seg-p"></span></span>Recto
            </button>
            <button class="seg-btn${sidesCov==='double'?' on':''}" onclick="fSel('sidesCov','double')">
              <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
            </button>
          </div>
        </div>
        <div class="mt-35">
          <div class="pills">
            ${finPills.map(it => `<div class="opt pill${s.lamCover === it.id ? ' on' : ''}" onclick="fSel('lamCover','${it.id}')">${it.label}</div>`).join('')}
            ${hasAddonCov ? `<div class="opt pill${s.addonOpen ? ' on' : ''}" onclick="UI.toggleFinition()">Autre finitions</div>` : ''}
          </div>
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const allowed = entry?.config?.allowed ?? (p.paper_stocks_cover || []);
      if (!s.paperCover) s.paperCover = allowed[0] || null;
      s.lamCover = 'none';
      if (!s.sidesCov) s.sidesCov = 'double';
    }
  });

  /* ════════════════════════════════════════════════════════
     CAT-BIND
  ════════════════════════════════════════════════════════ */
  reg('cat-bind', {
    html: (p, s, db) => {
      const showWarn = s.binding === 'pique' && s.pages && s.pages % 4 !== 0;
      return `<div>
        <div class="s-lbl">Reliure</div>
        ${chipList(db.binding_options || [], s.binding, "fSel.bind(null,'binding')")}
        ${showWarn ? `<div class="warn">${IC.alert} Piqûre à cheval requiert un multiple de 4 pages.</div>` : ''}
      </div>`;
    },
    defaults: (p, s, db) => { s.binding = (db.binding_options || [])[0]?.id || 'pique'; }
  });

  /* ════════════════════════════════════════════════════════
     GF-MATERIAL
  ════════════════════════════════════════════════════════ */
  reg('gf-material', {
    html: (p, s, db, entry) => {
      const COLORS = ['#3B82F6','#10B981','#6366F1','#F59E0B','#EC4899','#8B5CF6','#06B6D4'];
      const allMats = db.gf_materials || [];
      // Respect admin checkbox config — only show allowed materials to client
      const allowed = entry?.config?.allowed;
      const mats = allowed ? allMats.filter(m => allowed.includes(m.id)) : allMats;
      if (!mats.length) return `<div><div class="s-lbl">Support</div>
        <span class="info-tag">Aucune matière disponible — configurez-les dans Paramètres → Grand Format</span></div>`;
      return `<div>
        <div class="s-lbl">Support</div>
        <div class="gf-mat-grid">${mats.map((m, i) =>
          `<div class="opt gf-mat-chip${s.gfMaterial === m.id ? ' on' : ''}" onclick="fSel('gfMaterial','${m.id}');UI.renderFooter()">
            <div class="gf-mat-dot" style="background:${COLORS[i % COLORS.length]}"></div>
            <div style="flex:1;min-width:0">
              <div class="gf-mat-name">${m.label}</div>
              <div class="gf-mat-price">${m.cost_per_sqm ? m.cost_per_sqm + ' DH/m²' : (m.desc || '')}</div>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const allMats = db.gf_materials || [];
      const allowed = entry?.config?.allowed;
      const mats = allowed ? allMats.filter(m => allowed.includes(m.id)) : allMats;
      if (!s.gfMaterial && mats.length) s.gfMaterial = mats[0].id;
    }
  });

  /* ════════════════════════════════════════════════════════
     GF-DIMS
  ════════════════════════════════════════════════════════ */
  reg('gf-dims', {
    html: (p, s) => {
      const area = s.gfW && s.gfH ? (parseFloat(s.gfW) / 100 * parseFloat(s.gfH) / 100).toFixed(2) : null;
      return `<div>
        <div class="s-lbl">Dimensions</div>
        <div class="gf-dims-box">
          <div class="inp-wrap"><label class="inp-lbl">Larg. (cm)</label>
            <input type="number" class="inp" id="gfW" placeholder="ex: 150" oninput="UI.gfDims()" value="${s.gfW || ''}">
          </div>
          <div class="inp-wrap"><label class="inp-lbl">Haut. (cm)</label>
            <input type="number" class="inp" id="gfH" placeholder="ex: 100" oninput="UI.gfDims()" value="${s.gfH || ''}">
          </div>
          <div class="gf-area-badge">
            ${area
              ? `<div class="gf-area-val">${area}</div><div class="gf-area-lbl">m²</div>`
              : `<div class="gf-area-lbl" style="color:var(--t3)">Surface</div>`}
          </div>
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     GF-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('gf-options', {
    html: (p, s, db, entry) => {
      const allowedIds = entry?.config?.allowed ?? (p.gf_finish_options || []);
      const mat  = (db.gf_materials || []).find(m => m.id === s.gfMaterial);
      const opts = allowedIds.filter(fid => {
        if (!fid) return false;
        if ((fid === 'lam-mat' || fid === 'lam-gloss') && mat && !mat.laminage) return false;
        return true;
      }).map(fid => (db.gf_finishes || []).find(f => f.id === fid)).filter(Boolean);
      if (!opts.length) return '';
      return `<div>
        <div class="s-lbl">Options</div>
        <div class="pills">${opts.map(fo => {
          const on = (s.gfFinishes || []).includes(fo.id);
          return `<div class="opt pill${on ? ' on' : ''}" onclick="UI.gfFinish('${fo.id}')">${fo.label}</div>`;
        }).join('')}
        </div>
      </div>`;
    }
  });

  /* ════════════════════════════════════════════════════════
     ROLLUP-SIZE
  ════════════════════════════════════════════════════════ */
  reg('rollup-size', {
    html: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      return `<div>
        <div class="s-lbl">Format</div>
        <div class="ru-cards">${sizes.map(sz =>
          `<div class="opt ru-card${s.size === sz.id ? ' on' : ''}" onclick="fSel('size','${sz.id}')">
            <div style="font-weight:600">${sz.label}</div>
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      if (sizes.length) { s.size = sizes[0].id; s.sizeObj = sizes[0]; }
    }
  });

  /* ════════════════════════════════════════════════════════
     ROLLUP-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('rollup-options', {
    html: (p, s) => `<div>
      <div class="s-lbl">Options</div>
      <div class="opt gf-opt-row${s.withSupport ? ' on' : ''}" onclick="fSel('withSupport',${!s.withSupport})">
        <div>
          <div class="gf-opt-name">${p.xbanner ? 'Avec support X-Banner' : 'Avec support aluminium'}</div>
        </div>
        <div class="tog${s.withSupport ? ' on' : ''}"></div>
      </div>
    </div>`
  });

  /* ════════════════════════════════════════════════════════
     CHEMISE-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('chemise-options', {
    html: (p, s) => {
      const colCost = p.rabat_colle_cost  ?? 0.8;
      const impCost = p.rabat_imprime_cost ?? 0.5;
      const btn = (label, cost, on, handler) =>
        `<button class="opt qty-btn${on ? ' on' : ''}" onclick="${handler}"
          style="display:flex;flex-direction:column;align-items:center;gap:1px;padding:5px 12px;height:auto;line-height:1.2">
          <span style="font-size:.69rem;font-weight:600">${label}</span>
          <span style="font-size:.58rem;opacity:.6">+${cost} DH/u</span>
        </button>`;
      const sides = s.sides || 'single';
      return `<div>
        <div class="s-lbl">Impression</div>
        <div class="seg mb-65">
          <button class="seg-btn${sides === 'single' ? ' on' : ''}" onclick="fSel('sides','single')">
            <span class="seg-ico"><span class="seg-p"></span></span>Recto
          </button>
          <button class="seg-btn${sides === 'double' ? ' on' : ''}" onclick="fSel('sides','double')">
            <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
          </button>
        </div>
        <div class="s-lbl">Options rabat</div>
        <div style="display:flex;gap:.45rem;flex-wrap:wrap">
          ${btn('Rabat collé',   colCost, !!s.chemiseColle,   `fSel('chemiseColle',${!s.chemiseColle})`)}
          ${btn('Rabat imprimé', impCost, !!s.chemiseImprime, `fSel('chemiseImprime',${!s.chemiseImprime})`)}
        </div>
      </div>`;
    },
    defaults: (p, s) => { if (!s.sides) s.sides = 'single'; }
  });

  /* ════════════════════════════════════════════════════════
     PANCARTE-SUPPORT
  ════════════════════════════════════════════════════════ */
  reg('pancarte-support', {
    html: (p, s, db, entry) => {
      const allMats = db.pancarte_materials || p.pancarte_materials || [];
      const allowed = entry?.config?.allowed;
      const mats = allowed ? allMats.filter(m => allowed.includes(m.id)) : allMats;
      if (!mats.length) return `<div><div class="s-lbl">Support</div>
        <span class="info-tag">Aucun support — ajoutez-en dans Paramètres → Pancarte</span></div>`;
      return `<div>
        <div class="s-lbl">Support</div>
        <div class="pills">${mats.map(m =>
          `<div class="opt pill${s.pancarteMat === m.id ? ' on' : ''}" onclick="fSel('pancarteMat','${m.id}');UI.renderFooter()">
            ${m.label}${m.desc ? `<span style="opacity:.55;font-size:.6rem;margin-left:4px">${m.desc}</span>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const allMats = db.pancarte_materials || p.pancarte_materials || [];
      const allowed = entry?.config?.allowed;
      const mats = allowed ? allMats.filter(m => allowed.includes(m.id)) : allMats;
      if (!s.pancarteMat && mats.length) s.pancarteMat = mats[0].id;
    }
  });

  /* ════════════════════════════════════════════════════════
     SAC-OPTIONS  (legacy standalone — kept for products not yet migrated)
  ════════════════════════════════════════════════════════ */
  reg('sac-options', {
    html: (p, s) => {
      const souf  = s.sacSoufflet || 0;
      const w = s.sizeObj?.w, h = s.sizeObj?.h;
      const openW = (w && souf) ? 2 * w + 2 * souf : null;
      const openH = (h && souf) ? h + souf : null;
      return `<div>
        <div class="s-lbl">Soufflet latéral</div>
        <div class="cat-flex-wrap">
          <div class="inp-wrap" style="margin:0;flex:0 0 auto">
            <input type="number" class="inp" style="width:80px" min="0" placeholder="ex: 80"
              value="${souf || ''}" oninput="fSel('sacSoufflet',+this.value||0);UI.renderFooter()">
          </div>
          <span style="font-size:.67rem;color:var(--t3)">mm</span>
          ${openW && openH
            ? `<span class="cat-bl-sm">
                 Format ouvert : ${openW}×${openH} mm
                 <span style="font-size:.58rem;font-weight:400;color:var(--t3);margin-left:4px">
                   (2×${w} + 2×${souf}) × (${h} + ${souf})
                 </span>
               </span>`
            : `<span style="font-size:.62rem;color:var(--t3)">Format ouvert calculé automatiquement</span>`}
        </div>
      </div>`;
    }
  });

  /* ── FD toggle handlers exposed for addon-embedded FD row ── */
  registry.toggleFD = function(setupCost) {
    const cost = parseFloat(setupCost) || (typeof DB !== 'undefined' ? (DB?.forme_decoupe?.setup || 300) : 300);
    const cur  = curSel.fd || { enabled: false, reuse: false, setup_cost: cost };
    curSel.fd  = { ...cur, enabled: !cur.enabled, setup_cost: cost };
    // legacy compat
    curSel.formeDecoupe = curSel.fd.reuse;
    STATE.emit('curSel');
    if (typeof UI !== 'undefined') { UI.renderForm(); UI.renderFooter(); }
  };
  registry.toggleFDReuse = function(setupCost) {
    const cost = parseFloat(setupCost) || (typeof DB !== 'undefined' ? (DB?.forme_decoupe?.setup || 300) : 300);
    const cur  = curSel.fd || { enabled: true, reuse: false, setup_cost: cost };
    curSel.fd  = { ...cur, enabled: true, reuse: !cur.reuse, setup_cost: cost };
    // legacy compat
    curSel.formeDecoupe = curSel.fd.reuse;
    STATE.emit('curSel');
    if (typeof UI !== 'undefined') { UI.renderForm(); UI.renderFooter(); }
  };

  /* ════════════════════════════════════════════════════════
     FORME-DECOUPE  — standalone bloc (packaging engine only).
     sheet_fit products: use addon.config.fd_enabled instead.
     Writes sel.fd = { enabled:true, reuse:bool, setup_cost:number }
     + maintains legacy sel.formeDecoupe for CALC backward compat.
  ════════════════════════════════════════════════════════ */
  reg('forme-decoupe', {
    html: (p, s, db, entry) => {
      const fdSetup   = entry?.config?.fd_setup_cost ?? db?.forme_decoupe?.setup ?? 300;
      const fdPrixCm2 = db?.forme_decoupe?.prix_cm2 ?? 0;
      // Read new sel.fd object; fall back to legacy sel.formeDecoupe boolean
      const fd      = s.fd || { enabled: true, reuse: s.formeDecoupe ?? false, setup_cost: fdSetup };
      const fdReuse = !!fd.reuse;
      const reuseLabel = db?.forme_decoupe?.reuse_label || 'J\'ai déjà ma forme (gabarit existant)';
      // Use demi dims when half-FD is active, otherwise full FO dims
      const fdW     = s.sizeObj?.demi_w || s.sizeObj?.fo_w || s.sizeObj?.w;
      const fdH     = s.sizeObj?.demi_h || s.sizeObj?.fo_h || s.sizeObj?.h;
      const areaCm2 = fdW && fdH ? Math.round(fdW * fdH / 100) : null;
      const surfCost = fdPrixCm2 && areaCm2 ? fdPrixCm2 * areaCm2 : 0;
      const totalFdCost = fdSetup + surfCost;
      const isHalf  = !!(s.sizeObj?.passes === 2 && s.sizeObj?.demi_w);
      const dims    = fdW && fdH ? `${fdW} × ${fdH} mm${isHalf ? ' <span class="cat-bl-bold">(x2)</span>' : ''}` : null;
      return `<div>
        <div class="s-lbl">Forme de découpe</div>
        <div style="background:var(--s2);border:1px solid var(--bd);border-radius:var(--r);padding:.6rem .8rem">
          ${dims ? `<div id="fdDimsDisplay" style="font-size:.6rem;color:var(--t3);margin-bottom:.4rem">
            Format : <strong class="txt-t2">${dims}</strong>${areaCm2 ? ` <span class="txt-t3">(${areaCm2} cm²)</span>` : ''}
          </div>` : ''}
          <div style="font-size:.65rem;margin-bottom:.3rem">
            ${fdReuse
              ? '<span style="color:var(--gn);font-weight:600">✓ Forme existante — aucun frais de création</span>'
              : `Coût : <strong style="color:var(--am)">${fmt(totalFdCost)} DH</strong> <span style="color:var(--t2)">(Fabrication${surfCost > 0 ? '+Surface' : ''})</span>`}
          </div>
          <div class="opt gf-opt-row${fdReuse ? ' on' : ''}"
            onclick="SECTIONS.toggleFDReuse('${fdSetup}')">
            <div>
              <div class="gf-opt-name">${reuseLabel}</div>
              <div class="gf-opt-desc" style="font-size:.6rem;color:var(--t2);margin-top:1px">
                ${fdReuse ? 'Frais de forme supprimés' : 'Activez si vous réutilisez un gabarit existant'}
              </div>
            </div>
            <div class="tog${fdReuse ? ' on' : ''}"></div>
          </div>
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const setup = entry?.config?.fd_setup_cost ?? db?.forme_decoupe?.setup ?? 300;
      if (!s.fd) {
        s.fd = { enabled: true, reuse: s.formeDecoupe ?? false, setup_cost: setup };
      }
      // legacy compat for CALC
      if (s.formeDecoupe === undefined) s.formeDecoupe = false;
    }
  });

  /* ════════════════════════════════════════════════════════
     GADGET-QTY
  ════════════════════════════════════════════════════════ */
  reg('gadget-qty', {
    html: (p, s, db, entry) => {
      const all      = entry?.config?.items || p.quantities || [];
      const isCustom = s.quantity && !all.includes(s.quantity);
      const uprice   = p.unit_price   || 0;
      const prcost   = p.print_cost   || 0;
      const total    = uprice + prcost;
      const mkBtn    = q => `<button class="opt qty-btn${s.quantity === q && !isCustom ? ' on' : ''}" onclick="UI.qty(${q})">${fmtN(q)}</button>`;
      const costHint = `<div style="display:flex;gap:.75rem;margin-top:.3rem;font-size:.63rem;color:var(--t3)">
        ${uprice ? `<span>Produit : <strong class="txt-t2">${uprice} DH/u</strong></span>` : ''}
        ${prcost ? `<span>Impression : <strong class="txt-t2">${prcost} DH/u</strong></span>` : ''}
        ${total  ? `<span style="color:var(--bl);font-weight:600">= ${total} DH/u</span>` : ''}
      </div>`;
      const customInp = isCustom || s._qtyCustomOpen
        ? `<div style="margin-top:.35rem;display:flex;align-items:center;gap:.4rem">
             <input type="number" class="inp" style="width:90px" placeholder="Quantité" min="1"
               value="${isCustom ? s.quantity : ''}" oninput="UI.qty(+this.value)">
           </div>`
        : '';
      return `<div>
        <div class="s-lbl">Quantité</div>
        <div class="qty-row">
          ${all.map(mkBtn).join('')}
          <button class="opt qty-btn${isCustom ? ' on' : ''}" onclick="UI.qtyCustomOpen()">Personnalisé…</button>
        </div>
        ${customInp}
        ${costHint}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const items = entry?.config?.items || p.quantities || [];
      if (!s.quantity && items.length) s.quantity = items[0];
    }
  });

  /* ════════════════════════════════════════════════════════
     CONCEPTION-TYPE  — Tier-based design service with WA slot animation
     Uses DB.contact.design_tiers for tier pricing (shared with design-file module).
     Service types from p.conception_types define categories shown as selector pills.
  ════════════════════════════════════════════════════════ */
  reg('conception-type', {
    html: (p, s, db) => {

      const waDesigner = (db.contact?.designer_whatsapp || db.contact?.whatsapp || '').replace(/\D/g,'');
      const icoWA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`;
      const icoCheck = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>`;

      // Tiers: from DB.contact.design_tiers global
      const tiers = db.contact?.design_tiers || [
        { id:'basic',   label:'Basic',   desc:'Mise en page soignée',               price:200 },
        { id:'pro',     label:'Pro',     desc:'Design créatif + retouches',          price:400 },
        { id:'premium', label:'Premium', desc:'Premium · déclinaisons · rush 48h',   price:800 },
      ];

      // Service type categories from product config
      const types = p.conception_types || [];

      // ── Provider custom price block ──
      const customBlock = ROLE === 'provider' ? (() => {
        const cpOpen = !!s.customPriceOpen;
        return `<div class="conc-custom-row${cpOpen?' open':''}" onclick="event.stopPropagation();UI.toggleConcCustom()">
          <span class="conc-custom-lbl">${IC['chev-d']} ${s.customPrice?'Prix personnalisé actif':'Personnaliser le prix'}</span>
          ${s.customPrice?`<span style="font-size:.67rem;font-weight:700;color:var(--pu)">${fmt(s.customPrice)} DH</span>`:''}
        </div>
        <div class="conc-custom-panel${cpOpen?' on':''}">
          <div class="conc-custom-field">
            <div class="inp-wrap">
              <label class="inp-lbl">Prix de vente HT — laisser vide pour auto</label>
              <input type="number" class="inp" min="0" placeholder="Prix libre…"
                value="${s.customPrice||''}" onclick="event.stopPropagation()"
                oninput="event.stopPropagation();curSel.customPrice=this.value?+this.value:null;UI.renderFooter()">
            </div>
          </div>
        </div>`;
      })() : '';

      // ── Tier pill with slot animation (same system as design-file) ──
      const tierPill = (t) => {
        const on = s.designTier === t.id;
        if (on && waDesigner) {
          const waMsg = encodeURIComponent(
            'Bonjour, je voudrais confier ma conception graphique'
            + (s.concType ? ' — ' + (types.find(x=>x.id===s.concType)?.label||s.concType) : '')
            + ' · Niveau ' + t.label + ' (' + t.price + ' DH).'
            + (s.concNote ? ' Brief : ' + s.concNote : '')
          );
          return `<div class="design-tier-pill on design-tier-wa-active">
            <div class="design-tier-slot-wrap">
              <div class="design-tier-slot-out">
                <span class="design-tier-pill-name">${t.label}</span>
              </div>
              <a class="design-tier-slot-in" href="https://wa.me/${waDesigner}?text=${waMsg}"
                target="_blank" rel="noopener" onclick="event.stopPropagation()">
                ${icoWA}<span>Engagez un graphiste</span>
              </a>
            </div>
            <div class="design-tier-pill-desc">${t.desc}</div>
            <button class="design-tier-desel" onclick="fSel('designTier',null)" title="Changer">✕</button>
          </div>`;
        }
        return `<div class="design-tier-pill${on?' on':''}" onclick="fSel('designTier','${t.id}');UI.renderForm();UI.renderFooter()">
          <div class="design-tier-pill-name">${t.label}</div>
          <div class="design-tier-pill-desc">${t.desc}</div>
        </div>`;
      };

      // ── Brief textarea ──
      const briefBlock = `<div class="inp-wrap" style="margin-top:.5rem">
        <label class="inp-lbl">Brief — décrivez votre projet</label>
        <textarea class="inp" rows="3"
          placeholder="Couleurs, style, références, supports à décliner…"
          onclick="event.stopPropagation()"
          oninput="event.stopPropagation();curSel.concNote=this.value;UI.renderFooter()">${s.concNote||''}</textarea>
      </div>`;

      // ── Service type selector (optional, shown if product has types) ──
      const typeSelector = types.length ? `
        <div style="margin-bottom:.65rem">
          <div class="s-lbl" style="margin-bottom:.35rem">Prestation</div>
          <div class="pills">
            ${types.map(ct => `<div class="opt pill${s.concType===ct.id?' on':''}"
              onclick="event.stopPropagation();fSel('concType','${ct.id}');UI.renderForm();UI.renderFooter()">
              ${ct.label}
            </div>`).join('')}
          </div>
        </div>` : '';

      return `<div class="conc-service-wrap">
        ${typeSelector}
        <div class="s-lbl" style="margin-bottom:.4rem">Niveau de conception</div>
        <div class="design-tier-row">${tiers.map(tierPill).join('')}</div>
        ${briefBlock}
        ${customBlock}
      </div>`;
    },
    defaults: (p, s) => {
      if (!s.designTier) s.designTier = null;
      const types = p.conception_types || [];
      if (!s.concType && types.length) s.concType = types[0].id;
    }
  });

  /* ════════════════════════════════════════════════════════
     CARNET NCR SECTIONS
  ════════════════════════════════════════════════════════ */

  /* ── CARNET-FORMAT ── */
  reg('carnet-format', {
    html: (p, s) => {
      const sizes = p.sizes || [];
      return `<div>
        <div class="s-lbl">Format</div>
        ${chipList(sizes, s.size, "fSel.bind(null,'size')")}
        ${s.size === 'custom' ? customSizeInputs(s, 'Largeur (mm)', 'Hauteur (mm)', '148', '210') : ''}
      </div>`;
    },
    defaults: (p, s) => {
      const first = (p.sizes || [])[0];
      if (first) { s.size = first.id; s.sizeObj = first; }
    }
  });

  /* ── CARNET-PAGES ── */
  reg('carnet-pages', {
    html: (p, s, entry) => {
      const cfg  = entry?.config || {};
      const opts = cfg.items?.length ? cfg.items : (p.carnet_pages_options || [25, 50, 100]);
      const dflt = cfg.default;
      return `<div>
        <div class="s-lbl">Feuillets par carnet <span class="cat-note-sub">(couverture non comptée)</span></div>
        <div class="qty-row">
          ${opts.map(n =>
            `<button class="opt qty-btn${s.carnetPages === n ? ' on' : ''}"
               onclick="curSel.carnetPages=${n};UI.renderForm();UI.renderFooter()">${n}</button>`
          ).join('')}
        </div>
        <div style="margin-top:.3rem;font-size:.61rem;color:var(--t3)">
          Total impressions : ${s.carnetPages && s.carnetSouches && s.quantity
            ? fmtN(s.carnetPages * s.carnetSouches * s.quantity) + ' feuilles en offset'
            : '—'}
        </div>
      </div>`;
    },
    defaults: (p, s, entry) => {
      const cfg  = entry?.config || {};
      const opts = cfg.items?.length ? cfg.items : (p.carnet_pages_options || [25, 50, 100]);
      const dflt = cfg.default;
      s.carnetPages = dflt ?? opts[0];
    }
  });

  /* ── CARNET-SOUCHES ── */
  reg('carnet-souches', {
    html: (p, s, entry) => {
      const cfg  = entry?.config || {};
      const opts = cfg.items?.length ? cfg.items : (p.carnet_souches_options || [2, 3, 4, 5]);
      const COLORS = [
        { label:'Blanc', hex:'#ffffff', border:'#d1d5db' },
        { label:'Jaune', hex:'#fef08a', border:'#ca8a04' },
        { label:'Rose',  hex:'#fda4af', border:'#e11d48' },
        { label:'Vert',  hex:'#86efac', border:'#16a34a' },
        { label:'Bleu',  hex:'#93c5fd', border:'#2563eb' },
      ];
      const n    = s.carnetSouches || 2;
      const dots = COLORS.slice(0, n).map(c =>
        `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;
           background:${c.hex};border:1.5px solid ${c.border};flex-shrink:0" title="${c.label}"></span>`
      ).join('');
      return `<div>
        <div class="s-lbl">Nombre de souches</div>
        <div class="chips">
          ${opts.map(nb => {
            const cDots = COLORS.slice(0, nb).map(c =>
              `<span style="width:8px;height:8px;border-radius:50%;background:${c.hex};border:1px solid ${c.border};flex-shrink:0"></span>`
            ).join('');
            return `<div class="opt chip${s.carnetSouches === nb ? ' on' : ''}"
               onclick="curSel.carnetSouches=${nb};UI.renderForm();UI.renderFooter()">
              <strong>${nb} souches</strong>
              <small style="display:flex;gap:3px;align-items:center;margin-top:2px">${cDots}</small>
            </div>`;
          }).join('')}
        </div>
        ${n > 0 ? `<div style="margin-top:.35rem;display:flex;align-items:center;gap:5px;font-size:.63rem;color:var(--t2)">
          <span style="font-weight:600">Composition :</span>
          <span style="display:flex;gap:4px;align-items:center">${dots}</span>
          <span>${COLORS.slice(0, n).map(c => c.label).join(' + ')}</span>
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, entry) => {
      const cfg  = entry?.config || {};
      const opts = cfg.items?.length ? cfg.items : (p.carnet_souches_options || [2, 3, 4, 5]);
      const dflt = cfg.default;
      s.carnetSouches = dflt ?? opts[0];
    }
  });

  /* ── CARNET-OPTIONS ── */
  reg('carnet-options', {
    html: (p, s, entry) => {
      const cfg        = entry?.config || {};
      const colorOpts  = cfg.color_options?.length ? cfg.color_options : [1, 2, 3, 4];
      const dfltColor  = cfg.default_color ?? colorOpts[colorOpts.length - 1];
      const showNumero = cfg.show_numero !== false;
      const showPerfo  = cfg.show_perfo  !== false;
      const showCover  = cfg.show_cover  !== false;
      const colors = s.carnetColors || dfltColor;
      return `<div>
        <div class="s-lbl">Couleurs d'impression offset</div>
        <div class="seg" style="margin-bottom:.55rem">
          ${colorOpts.map(n =>
            `<button class="seg-btn${colors === n ? ' on' : ''}"
               onclick="curSel.carnetColors=${n};UI.renderForm();UI.renderFooter()"
               title="${n} couleur${n > 1 ? 's' : ''}">${n}c</button>`
          ).join('')}
        </div>
        <div class="s-lbl">Options</div>
        <div class="fac-grid">
          ${showNumero ? `<div class="opt fac-cell${s.carnetNumero ? ' on' : ''}"
            onclick="curSel.carnetNumero=!curSel.carnetNumero;UI.renderForm();UI.renderFooter()">
            <span>Numérotation</span><div class="tog${s.carnetNumero ? ' on' : ''}"></div>
          </div>` : ''}
          ${showPerfo ? `<div class="opt fac-cell${s.carnetPerfo ? ' on' : ''}"
            onclick="curSel.carnetPerfo=!curSel.carnetPerfo;UI.renderForm();UI.renderFooter()">
            <span>Perforage</span><div class="tog${s.carnetPerfo ? ' on' : ''}"></div>
          </div>` : ''}
          ${showCover ? `<div class="opt fac-cell${s.carnetCover ? ' on' : ''}"
            onclick="curSel.carnetCover=!curSel.carnetCover;UI.renderForm();UI.renderFooter()">
            <span>Couverture imprimée</span><div class="tog${s.carnetCover ? ' on' : ''}"></div>
          </div>` : ''}
        </div>
        ${s.carnetNumero && showNumero ? `
        <div style="margin-top:.4rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <span class="s-lbl" style="margin:0">N° de départ :</span>
          <input type="number" class="inp" style="width:90px;flex-shrink:0" min="1" step="1" placeholder="001"
            value="${s.carnetNumStart || 1}"
            oninput="curSel.carnetNumStart=+this.value||1;UI.renderFooter()">
          <span class="micro-t3">Chaque batch commence à ce numéro</span>
        </div>` : ''}
        ${s.carnetCover && showCover ? `
        <div style="margin-top:.3rem;font-size:.62rem;color:var(--t3);display:flex;align-items:center;gap:.3rem">
          <span style="display:inline-flex;width:13px;height:13px;flex-shrink:0">${IC.info}</span>
          Couverture imprimée 1 face, sur papier standard — non comptée dans le nb de feuillets
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, entry) => {
      const cfg       = entry?.config || {};
      const colorOpts = cfg.color_options?.length ? cfg.color_options : [1, 2, 3, 4];
      s.carnetNumero   = cfg.default_numero ?? false;
      s.carnetPerfo    = cfg.default_perfo  ?? false;
      s.carnetCover    = cfg.default_cover  ?? false;
      s.carnetNumStart = 1;
      s.carnetColors   = cfg.default_color  ?? colorOpts[colorOpts.length - 1];
    }
  });

  /* ════════════════════════════════════════════════════════
     ENVELOPE SECTIONS
  ════════════════════════════════════════════════════════ */

  /* ── ENV-SIZE — format chips from DB.envelope_formats ── */
  reg('env-size', {
    html: (p, s, db, entry) => {
      const fmts    = db.envelope_formats || [];
      const allowed = entry?.config?.allowed || null;
      const list    = allowed ? fmts.filter(f => allowed.includes(f.id)) : fmts;
      if (!list.length) return `<div><div class="s-lbl">Format</div><span class="info-tag">${IC.info} Aucun format — ajoutez-en dans Papiers → Enveloppes</span></div>`;
      return `<div>
        <div class="s-lbl">Format</div>
        <div class="pills">
          ${list.map(f => `<div class="opt pill${s.envFormatId === f.id ? ' on' : ''}"
            onclick="curSel.envFormatId='${f.id}';UI.renderForm();UI.renderFooter()">
            ${f.name}
            ${f.w && f.h ? `<span style="font-size:.57rem;opacity:.55;margin-left:3px">${f.w}×${f.h} mm</span>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db) => { s.envFormatId = (db.envelope_formats || [])[0]?.id || null; }
  });

  /* ── ENV-SUPPORT — type chips from DB.envelope_types ── */
  reg('env-support', {
    html: (p, s, db, entry) => {
      const types   = db.envelope_types || [];
      const allowed = entry?.config?.allowed || null;
      const list    = allowed ? types.filter(t => allowed.includes(t.id)) : types;
      if (!list.length) return `<div><div class="s-lbl">Type</div><span class="info-tag">${IC.info} Aucun type — ajoutez-en dans Papiers → Enveloppes</span></div>`;
      return `<div>
        <div class="s-lbl">Type</div>
        <div class="pills">
          ${list.map(t => `<div class="opt pill${s.envTypeId === t.id ? ' on' : ''}"
            onclick="curSel.envTypeId='${t.id}';UI.renderForm();UI.renderFooter()">
            ${t.name}
          </div>`).join('')}
        </div>
      </div>`;
    },
    defaults: (p, s, db) => { s.envTypeId = (db.envelope_types || [])[0]?.id || null; }
  });

  /* ── ENV-OFFSET-COLORS — color count for envelope offset print ── */
  reg('env-offset-colors', {
    html: (p, s, db, entry) => {
      const paper    = (db.paper_stocks || []).find(e => e.id === s.paper && e.envelope);
      const thresh   = entry?.config?.threshold ?? paper?.print_threshold ?? 500;
      const qty      = s.quantity || 0;
      const eligible = qty >= thresh;
      const colors   = s.envColors || 1;
      const costPer  = paper?.print_cost_per_color || 0;
      // FIX: removed local `fmt` that was shadowing the global formatter
      const printCost = eligible ? costPer * colors * qty : 0;
      return `<div>
        <div class="s-lbl">Impression offset</div>
        ${!eligible
          ? `<span class="info-tag">${IC.info} Disponible à partir de ${thresh.toLocaleString('fr-FR')} pcs</span>`
          : `<div class="seg">
              ${[1,2,3,4].map(n => `<button class="seg-btn${colors === n ? ' on' : ''}" onclick="curSel.envColors=${n};UI.renderForm();UI.renderFooter()">${n} coul.</button>`).join('')}
            </div>
            ${costPer > 0 ? `<div style="font-size:.62rem;color:var(--bl);margin-top:.3rem">${fmt(costPer)} DH/coul × ${colors} = ${fmt(printCost)} DH</div>` : ''}`
        }
      </div>`;
    },
    defaults: (p, s) => { s.envColors = 1; }
  });

  /* ── ENV-FENETRE — window preference (no price impact) ── */
  reg('env-fenetre', {
    html: (p, s) => `<div>
      <div class="s-lbl">Fenêtre</div>
      <div class="seg">
        <button class="seg-btn${!s.envFenetre ? ' on' : ''}" onclick="curSel.envFenetre=false;UI.renderForm()">Sans fenêtre</button>
        <button class="seg-btn${s.envFenetre  ? ' on' : ''}" onclick="curSel.envFenetre=true;UI.renderForm()">Avec fenêtre</button>
      </div>
    </div>`,
    defaults: (p, s) => { s.envFenetre = false; }
  });

  /* ════════════════════════════════════════════════════════
     DESIGN-FILE  — file upload OR design service selector
     design_model in entry.config: 'tier' | 'multipage' | 'devis'
     curSel fields:
       designOption    : 'file' | 'service' | null
       designFileName  : string
       designFileSize  : string
       designTier      : tier id | null
       designPages     : number (multipage)
  ════════════════════════════════════════════════════════ */
  reg('design-file', {
    html: (p, s, db, entry) => {
      const opt   = s.designOption || null;
      const model = entry?.config?.design_model || 'tier';
      const waDesigner = (db.contact?.designer_whatsapp || db.contact?.whatsapp || '').replace(/\D/g,'');

      // Tiers — from entry.config first, then db.contact fallback
      const defaultTiers = model === 'multipage'
        ? [
            { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price_base:400,  price_per_page:50  },
            { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price_base:700,  price_per_page:80  },
            { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price_base:1200, price_per_page:120 },
          ]
        : (db.contact?.design_tiers) || [
            { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price:200 },
            { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price:400 },
            { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price:800 },
          ];
      const tiers      = entry?.config?.tiers || defaultTiers;
      const chosenTier = tiers.find(t => t.id === s.designTier);

      const icoUpload = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
      const icoPen    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>`;
      const icoWA     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`;

      const tabBtn = (id, ico, label) =>
        `<button class="seg-btn${opt===id?' on':''}" onclick="fSel('designOption','${id}')" type="button">${ico} ${label}</button>`;

      const fileHints = [
        { ico:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>', txt:'Résolution minimale <strong>300 dpi</strong>' },
        { ico:'<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/>', txt:'Format <strong>PDF, AI ou EPS</strong> vectorisé' },
        { ico:'<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>', txt:'<strong>3 mm</strong> de fond perdu + marges de sécurité' },
        { ico:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', txt:'Couleurs en mode <strong>CMJN</strong> (pas RVB)' },
      ].map(h => `<div class="design-hint-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="11" height="11" style="flex-shrink:0;color:var(--bl);margin-top:.1rem">${h.ico}</svg>
        <span>${h.txt}</span>
      </div>`).join('');

      // ── Tier pill — no price shown, brief button appears when selected ──
      function _tierPill(t) {
        const on = s.designTier === t.id;
        if (on) {
          return `<div class="design-tier-pill on">
            <div class="design-tier-pill-name">${t.label}</div>
            <div class="design-tier-pill-desc">${t.desc}</div>
            <button class="design-tier-desel" onclick="fSel('designTier',null);UI.renderForm()" title="Changer">✕</button>
          </div>`;
        }
        return `<div class="design-tier-pill"
          onclick="fSel('designTier','${t.id}');UI.renderForm()">
          <div class="design-tier-pill-name">${t.label}</div>
          <div class="design-tier-pill-desc">${t.desc}</div>
        </div>`;
      }

      let body = '';

      // ── FILE tab ──
      if (opt === 'file') {
        if (s.designFileName) {
          body = `<div class="design-file-chosen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15" style="color:var(--gn);flex-shrink:0"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span class="design-file-name">${s.designFileName}</span>
            ${s.designFileSize ? `<span class="design-file-sz">${s.designFileSize}</span>` : ''}
            <button class="design-file-rm" onclick="DESIGN.clearFile()" type="button">✕</button>
          </div>
          <div class="design-hints mt-45">${fileHints}</div>
          <div style="font-size:.6rem;color:var(--t3);margin-top:.4rem">Envoyez votre fichier par WhatsApp ou email après la commande.</div>`;
        } else {
          body = `<div class="design-drop-zone" id="designDropZone"
            onclick="document.getElementById('designFileInput').click()"
            ondragover="event.preventDefault();this.classList.add('drag-over')"
            ondragleave="this.classList.remove('drag-over')"
            ondrop="DESIGN.onDrop(event)">
            ${icoUpload}
            <span>Glissez votre fichier ou <strong>cliquez pour parcourir</strong></span>
            <span class="design-drop-hint">PDF · AI · EPS · PSD · PNG — max 50 Mo</span>
          </div>
          <input type="file" id="designFileInput" style="display:none"
            accept=".pdf,.ai,.psd,.png,.jpg,.jpeg,.eps,.tiff,.tif"
            onchange="DESIGN.onFileInput(this)">
          <div class="design-hints" style="margin-top:.6rem">${fileHints}</div>`;
        }

      // ── SERVICE tab ──
      } else if (opt === 'service') {
        const _hasBrief  = typeof KOTE_BRIEFING !== 'undefined' && KOTE_BRIEFING.hasBrief();
        const _specsReady = !!(typeof CALC !== 'undefined' && CALC.price(s, db));
        if (!_specsReady) {
          body = `
            <button class="btn btn-p" disabled style="width:100%;justify-content:center;opacity:.45;cursor:not-allowed">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Remplir le brief créatif
            </button>
            <div style="display:flex;align-items:flex-start;gap:.35rem;margin-top:.45rem;
              font-size:.62rem;color:#92400e;background:#fffbeb;border:1px solid #fde68a;
              border-radius:7px;padding:.35rem .55rem;line-height:1.45">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                width="11" height="11" style="flex-shrink:0;margin-top:.1rem;color:#d97706">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Complétez d'abord les spécifications du produit (format, papier, quantité…) pour activer le brief.
            </div>`;
        } else {
          body = `
            <button class="btn btn-p" style="width:100%;justify-content:center;${_hasBrief ? 'background:var(--gn,#059669)' : ''}"
              onclick="KOTE_BRIEFING.open('embedded')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              ${_hasBrief ? '✓ Brief renseigné — modifier' : 'Remplir le brief créatif'}
            </button>
            <div style="font-size:.6rem;color:var(--t3);text-align:center;margin-top:.3rem">
              Niveau &amp; tarif confirmés après analyse · Devis gratuit
            </div>`;
        }
      }

      return `<div class="design-section">
        <div class="s-lbl">Conception & fichier</div>
        <div class="seg mb-65">
          ${tabBtn('file',    icoUpload, 'J\'ai mon fichier')}
          ${tabBtn('service', icoPen,    'Créer pour moi')}
        </div>
        ${body}
      </div>`;
    },
  });
  return registry;
})();

