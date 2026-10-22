'use strict';

/* ════════════════════════════════════════════════════════
   kote-catalog.js — Product catalog & client UI layer
   SECTIONS, DESIGN, BRIEF, SEL, UI, loadProduct,
   loadConception, KOTE_BRIEFING.
   Pages: index.html, client.html, admin.html
   Requires: config.js, kote-core.js
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
     SIZE
  ════════════════════════════════════════════════════════ */
  reg('size', {
    html: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      const allowCustom = !!(entry?.config?.allow_custom);
      const chips = allowCustom
        ? [...sizes, { id: 'custom', label: 'Sur mesure', dims: '≤ A3' }]
        : sizes;
      return `<div>
        <div class="s-lbl">Format</div>
        ${chipList(chips, s.size, "fSel.bind(null,'size')")}
        ${s.size === 'custom' ? customSizeInputs(s) : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      if (!s.size && sizes.length) { s.size = sizes[0].id; s.sizeObj = sizes[0]; }
    }
  });

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
    html: (p, s) => {
      // If chemise-options is also in this product's composition, it renders its
      // own R/RV toggle — skip here to avoid a duplicate impression selector.
      const hasChemiseSection = !!(_getComposition(p).find(e =>
        (typeof e === 'string' ? e : e.type_id) === 'chemise-options'
      ));
      if (hasChemiseSection) return '';

      // Always offer both options — never lock to a single side via product data
      const hasSingle = !p.sides || p.sides.includes('single');
      const hasDouble = !p.sides || p.sides.includes('double');
      return `<div><div class="s-lbl">Impression</div>
        <div class="seg">
          ${hasSingle ? `<button class="seg-btn${s.sides === 'single' ? ' on' : ''}" onclick="fSel('sides','single')">
            <span class="seg-ico"><span class="seg-p"></span></span>Recto
          </button>` : ''}
          ${hasDouble ? `<button class="seg-btn${s.sides === 'double' ? ' on' : ''}" onclick="fSel('sides','double')">
            <span class="seg-ico"><span class="seg-p"></span><span class="seg-p"></span></span>R/V
          </button>` : ''}
        </div></div>`;
    },
    defaults: (p, s) => { s.sides = p.sides?.[0] || 'single'; }
  });

  /* ════════════════════════════════════════════════════════
     LAM
  ════════════════════════════════════════════════════════ */
  reg('lam', {
    html: (p, s, db, entry) => {
      let allowedIds = entry?.config?.allowed ?? (p.finishes_lam || []);
      if (!allowedIds.length) allowedIds = (db.finishes || []).filter(f => f.id !== 'none').map(f => f.id);
      const lamPills = allowedIds.map(id => db.finishes.find(x => x.id === id)).filter(Boolean);
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
      if (!all.length) return '';

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
        <div class="sg-lbl"${special.length ? ' style="margin-top:.45rem"' : ''}>Façonnage</div>
        <div class="fac-grid">${fac.map(f => {
          const on = (s.addons || []).includes(f.id);
          return `<div class="opt fac-cell${on ? ' on' : ''}" onclick="fSel('addon','${f.id}')">
            <span>${f.label}</span><div class="tog${on ? ' on' : ''}"></div></div>`;
        }).join('')}</div>` : '';

      const hasActive = (s.addons || []).some(id => allowedIds.includes(id));
      const open = !!s.addonOpen || hasActive;
      return `<div>
        <div class="notes-acc${open ? ' open' : ''}" id="addonAcc">
          <div class="notes-hdr" onclick="UI.toggleAddon()">
            <div class="notes-hdr-l" style="display:flex;align-items:center;gap:.4rem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:13px;height:13px;flex-shrink:0;color:var(--t3)"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
              Finitions supplémentaires
              ${hasActive ? `<span style="font-size:.58rem;color:var(--bl);font-weight:600">(${(s.addons||[]).filter(id=>allowedIds.includes(id)).length} actif${(s.addons||[]).filter(id=>allowedIds.includes(id)).length>1?'s':''})</span>` : ''}
            </div>
            <div class="notes-chev">${IC['chev-d']}</div>
          </div>
          <div class="notes-body">
            <div class="notes-inner" style="padding-top:.4rem">
              <div class="fin-wrap"><div class="fin-section">${specGrid}${facGrid}</div></div>
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
        const off = db.offset;
        if (!off || off.enabled === false || !s.sizeObj || !s.quantity) return { inline: '', below: '' };
        const isEnvLocal = p.id === 'enveloppe';
        const fit    = (s.sizeObj.id === 'custom' || isEnvLocal) ? { n: 1 } : CALC.sheetFit(s.sizeObj.w, s.sizeObj.h, db.sheet);
        const sheets = Math.ceil(s.quantity / fit.n);
        if (sheets < (off.min_sheets || 1000)) return { inline: '', below: '' };
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
              ${filled ? `<span style="font-size:.58rem;color:var(--bl);font-weight:600">(rempli)</span>` : ''}
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
     DEPL-FORMAT
  ════════════════════════════════════════════════════════ */
  reg('depl-format', {
    html: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      return `<div>
        <div class="s-lbl">Format ouvert</div>
        ${chipList(sizes, s.size, "fSel.bind(null,'size')")}
        ${s.size === 'custom' ? customSizeInputs(s, 'Largeur ouvert (mm)', 'Hauteur (mm)', '420', '297') : ''}
        ${s.size ? `<div style="margin-top:.45rem">
          <div class="s-lbl">Pliage</div>
          ${chipList(p.fold_options || [], s.fold, "fSel.bind(null,'fold')")}
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const sizes = entry?.config?.items || p.sizes || [];
      if (sizes.length) { s.size = sizes[0].id; s.sizeObj = sizes[0]; }
      s.fold = (p.fold_options || [])[0]?.id;
    }
  });

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
        <div class="s-lbl">Nombre de pages <span style="font-weight:400;text-transform:none;font-size:.58rem;color:var(--t3)">(couverture incluse)</span></div>
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
      const fins    = lamIds.map(id => db.finishes.find(x => x.id === id)).filter(Boolean);
      const sidesInt = s.sidesInt || 'double';
      return `<div class="cat-block">
        <div class="cat-block-hdr">${IC.layers} Intérieur</div>
        <div class="s-lbl">Papier</div>
        ${chipList(papers, s.paper, "fSel.bind(null,'paper')")}
        <div style="margin-top:.35rem">
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
        ${fins.length ? `<div style="margin-top:.35rem">
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
      const finPills = lamIds.map(id => db.finishes.find(x => x.id === id)).filter(Boolean);
      const _catCovHasAddonSec = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'addon');
      const hasAddonCov = !_catCovHasAddonSec && (cfg.addon ?? (p.finishes_addon || [])).length > 0;
      const sidesCov = s.sidesCov || 'double';
      return `<div class="cat-block">
        <div class="cat-block-hdr">${IC['file-plus']} Couverture</div>
        <div class="s-lbl">Papier</div>
        ${chipList(papers, s.paperCover, "fSel.bind(null,'paperCover')")}
        <div style="margin-top:.35rem">
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
        <div style="margin-top:.35rem">
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
    html: (p, s, db, entry) => {
      const cfg      = entry?.config || {};
      const dflt     = cfg.default ?? (db.binding_options || [])[0]?.id;
      const opts     = db.binding_options || [];
      const showWarn = s.binding === 'pique' && s.pages && s.pages % 4 !== 0;
      const mkChip   = it => {
        const isDflt = it.id === dflt;
        const isSel  = s.binding === it.id;
        return `<div class="opt chip${isSel ? ' on' : ''}"
          onclick="fSel('binding','${it.id}');UI.renderFooter()">
          <strong>${it.label}${isDflt ? ' <span style="color:var(--bl);font-size:.7rem" title="Option conseillée">◆</span>' : ''}</strong>
          <small>${it.desc || '—'}</small>
        </div>`;
      };
      return `<div>
        <div class="s-lbl">Reliure</div>
        <div class="chips">${opts.map(mkChip).join('')}</div>
        ${showWarn ? `<div class="warn">${IC.alert} Piqûre à cheval requiert un multiple de 4 pages.</div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const cfg  = entry?.config || {};
      const dflt = cfg.default ?? (db.binding_options || [])[0]?.id;
      if (dflt) s.binding = dflt;
    }
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
        <div class="seg" style="margin-bottom:.65rem">
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
     SAC-OPTIONS
  ════════════════════════════════════════════════════════ */
  reg('sac-options', {
    html: (p, s) => {
      const souf  = s.sacSoufflet || 0;
      const w = s.sizeObj?.w, h = s.sizeObj?.h;
      const openW = (w && souf) ? 2 * w + 2 * souf : null;
      const openH = (h && souf) ? h + souf : null;
      return `<div>
        <div class="s-lbl">Soufflet latéral</div>
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <div class="inp-wrap" style="margin:0;flex:0 0 auto">
            <input type="number" class="inp" style="width:80px" min="0" placeholder="ex: 80"
              value="${souf || ''}" oninput="fSel('sacSoufflet',+this.value||0);UI.renderFooter()">
          </div>
          <span style="font-size:.67rem;color:var(--t3)">mm</span>
          ${openW && openH
            ? `<span style="font-size:.63rem;color:var(--bl);font-weight:600">
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
        ${uprice ? `<span>Produit : <strong style="color:var(--t2)">${uprice} DH/u</strong></span>` : ''}
        ${prcost ? `<span>Impression : <strong style="color:var(--t2)">${prcost} DH/u</strong></span>` : ''}
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
    configurable: true,
    html: (p, s, db, entry) => {
      const cfg  = entry?.config || {};
      const opts = cfg.items?.length ? cfg.items : (p.carnet_pages_options || [25, 50, 100]);
      const dflt = cfg.default ?? opts[0];
      return `<div>
        <div class="s-lbl">Feuillets par carnet <span style="font-weight:400;text-transform:none;font-size:.58rem;color:var(--t3)">(couverture non comptée)</span></div>
        <div class="qty-row">
          ${opts.map(n =>
            `<button class="opt qty-btn${s.carnetPages === n ? ' on' : ''}${n === dflt && s.carnetPages !== n ? ' suggested' : ''}"
               onclick="curSel.carnetPages=${n};UI.renderForm();UI.renderFooter()">${n}${n === dflt ? ' ◆' : ''}</button>`
          ).join('')}
        </div>
        <div style="margin-top:.3rem;font-size:.61rem;color:var(--t3)">
          Total impressions : ${s.carnetPages && s.carnetSouches && s.quantity
            ? fmtN(s.carnetPages * s.carnetSouches * s.quantity) + ' feuilles en offset'
            : '—'}
        </div>
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const cfg  = entry?.config || {};
      const opts = cfg.items?.length ? cfg.items : (p.carnet_pages_options || [50]);
      s.carnetPages = cfg.default ?? opts[0];
    }
  });

  /* ── CARNET-SOUCHES ── */
  reg('carnet-souches', {
    html: (p, s) => {
      const opts   = p.carnet_souches_options || [2, 3, 4, 5];
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
    defaults: (p, s) => { s.carnetSouches = (p.carnet_souches_options || [2])[0]; }
  });

  /* ── CARNET-OPTIONS ── */
  reg('carnet-options', {
    configurable: true,
    html: (p, s, db, entry) => {
      const cfg        = entry?.config || {};
      const colorOpts  = cfg.color_options?.length ? cfg.color_options : [1, 2, 3, 4];
      const dfltColor  = cfg.default_color ?? colorOpts[0];
      const colors     = s.carnetColors || dfltColor;
      return `<div>
        <div class="s-lbl">Couleurs d'impression offset</div>
        <div class="seg" style="margin-bottom:.55rem">
          ${colorOpts.map(n =>
            `<button class="seg-btn${colors === n ? ' on' : ''}"
               onclick="curSel.carnetColors=${n};UI.renderForm();UI.renderFooter()"
               title="${n} couleur${n > 1 ? 's' : ''}">${n}c${n === dfltColor ? ' ◆' : ''}</button>`
          ).join('')}
        </div>
        <div class="s-lbl">Options</div>
        <div class="fac-grid">
          <div class="opt fac-cell${s.carnetNumero ? ' on' : ''}"
            onclick="curSel.carnetNumero=!curSel.carnetNumero;UI.renderForm();UI.renderFooter()">
            <span>Numérotation</span><div class="tog${s.carnetNumero ? ' on' : ''}"></div>
          </div>
          <div class="opt fac-cell${s.carnetPerfo ? ' on' : ''}"
            onclick="curSel.carnetPerfo=!curSel.carnetPerfo;UI.renderForm();UI.renderFooter()">
            <span>Perforage</span><div class="tog${s.carnetPerfo ? ' on' : ''}"></div>
          </div>
          <div class="opt fac-cell${s.carnetCover ? ' on' : ''}"
            onclick="curSel.carnetCover=!curSel.carnetCover;UI.renderForm();UI.renderFooter()">
            <span>Couverture imprimée</span><div class="tog${s.carnetCover ? ' on' : ''}"></div>
          </div>
        </div>
        ${s.carnetNumero ? `
        <div style="margin-top:.4rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <span class="s-lbl" style="margin:0">N° de départ :</span>
          <input type="number" class="inp" style="width:90px;flex-shrink:0" min="1" step="1" placeholder="001"
            value="${s.carnetNumStart || 1}"
            oninput="curSel.carnetNumStart=+this.value||1;UI.renderFooter()">
          <span style="font-size:.6rem;color:var(--t3)">Chaque batch commence à ce numéro</span>
        </div>` : ''}
        ${s.carnetCover ? `
        <div style="margin-top:.3rem;font-size:.62rem;color:var(--t3);display:flex;align-items:center;gap:.3rem">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Couverture imprimée 1 face, sur papier standard — non comptée dans le nb de feuillets
        </div>` : ''}
      </div>`;
    },
    defaults: (p, s, db, entry) => {
      const cfg = entry?.config || {};
      const colorOpts = cfg.color_options?.length ? cfg.color_options : [1, 2, 3, 4];
      s.carnetNumero   = false;
      s.carnetPerfo    = false;
      s.carnetCover    = false;
      s.carnetNumStart = 1;
      s.carnetColors   = cfg.default_color ?? colorOpts[0];
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
          <div class="design-hints" style="margin-top:.5rem">${fileHints}</div>
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
        <div class="seg" style="margin-bottom:.65rem">
          ${tabBtn('file',    icoUpload, 'J\'ai mon fichier')}
          ${tabBtn('service', icoPen,    'Créer pour moi')}
        </div>
        ${body}
      </div>`;
    },
  });
  return registry;
})();

/* ════════════════════════════════════════════════════════
   DESIGN  — file picker helpers (global, called from inline events)
════════════════════════════════════════════════════════ */
const DESIGN = (() => {
  function _fmtSize(bytes) {
    if (bytes < 1024)       return bytes + ' o';
    if (bytes < 1048576)    return (bytes/1024).toFixed(0) + ' Ko';
    return (bytes/1048576).toFixed(1) + ' Mo';
  }
  function _apply(file) {
    if (!file) return;
    curSel.designOption   = 'file';
    curSel.designFileName = file.name;
    curSel.designFileSize = _fmtSize(file.size);
    curSel.designTier     = null;
    UI.renderForm();
    UI.renderFooter();
  }
  function onFileInput(input) {
    const file = input.files?.[0]; if (!file) return;
    _apply(file);
    input.value = '';
  }
  function onDrop(e) {
    e.preventDefault();
    document.getElementById('designDropZone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0]; if (!file) return;
    _apply(file);
  }
  function clearFile() {
    curSel.designFileName = null;
    curSel.designFileSize = null;
    UI.renderForm();
    UI.renderFooter();
  }
  function setPages(n) {
    curSel.designPages = Math.max(1, n);
    UI.renderForm();
    UI.renderFooter();
  }
  return { onFileInput, onDrop, clearFile, setPages };
})();


/* ════════════════════════════════════════════════════════
   BRIEF  — product-aware briefing system
   Opens a modal pre-filled with product context (curProd, curSel),
   client brand data (DB.contact.brief_defaults), and chosen design tier.
   Generates a structured WA message sent to DB.contact.designer_whatsapp.
════════════════════════════════════════════════════════ */
const BRIEF = (() => {

  function _productFields() {
    if (!curProd) return '';
    const s   = curSel || {};
    const type = curProd.product_type || '';
    const eng  = curProd.calc_engine  || '';
    const rows = [];
    const _fld = (lbl, id, ph, type_) => {
      type_ = type_ || 'text';
      return `<div class="brief-field"><label class="brief-lbl">${lbl}</label><input type="${type_}" id="brief-${id}" class="brief-inp" placeholder="${ph}"></div>`;
    };
    const _txt = (lbl, id, ph, rows_) => {
      rows_ = rows_ || 3;
      return `<div class="brief-field"><label class="brief-lbl">${lbl}</label><textarea id="brief-${id}" class="brief-inp brief-ta" rows="${rows_}" placeholder="${ph}"></textarea></div>`;
    };
    const _sel = (lbl, id, opts) =>
      `<div class="brief-field"><label class="brief-lbl">${lbl}</label><select id="brief-${id}" class="brief-inp">${opts.map(o => `<option value="${o.v}">${o.l}</option>`).join('')}</select></div>`;

    if (s.sizeObj) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Format</span><span class="brief-info-val">${s.sizeObj.label || 'Sur mesure'}${s.sizeObj.w && s.sizeObj.h ? ' — ' + s.sizeObj.w + '×' + s.sizeObj.h + ' mm' : ''}</span></div>`);
    if (s.gfW && s.gfH) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Dimensions</span><span class="brief-info-val">${s.gfW} × ${s.gfH} cm</span></div>`);
    if (s.sides) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Impression</span><span class="brief-info-val">${s.sides === 'double' ? 'Recto-Verso' : 'Recto'}</span></div>`);
    if (s.pages) {
      rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Pages</span><span class="brief-info-val">${s.pages} pages</span></div>`);
      rows.push(_txt('Structure du contenu (par page)', 'content-structure', 'Ex: p.1 Couverture, p.2-3 Présentation, p.4-7 Produits, p.8 Contact…'));
    }
    if (s.fold) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Pliage</span><span class="brief-info-val">${s.fold}</span></div>`);
    if (eng === 'sqm' && (s.gfW || s.sizeObj)) {
      rows.push(_sel('Usage', 'gf-usage', [{v:'interieur',l:'Intérieur'},{v:'exterieur',l:'Extérieur'},{v:'les-deux',l:'Intérieur et extérieur'}]));
      rows.push(_fld('Lieu / emplacement', 'gf-location', 'Ex: hall d\'entrée, vitrine, façade…'));
      rows.push(_sel('Fixation', 'gf-fixation', [{v:'oeillets',l:'Œillets'},{v:'adhesif',l:'Adhésif'},{v:'cadre',l:'Cadre / support'},{v:'enrouleur',l:'Enrouleur (roll-up)'},{v:'autre',l:'Autre'}]));
    }
    if (type === 'pancarte') {
      const matLabel = (DB?.pancarte_materials || []).find(m => m.id === s.pancarteMat)?.label || '';
      if (matLabel) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Support</span><span class="brief-info-val">${matLabel}</span></div>`);
      rows.push(_sel('Usage', 'pan-usage', [{v:'interieur',l:'Intérieur'},{v:'exterieur',l:'Extérieur'}]));
      rows.push(_fld('Texte principal / slogan', 'pan-text', 'Texte à afficher en grande taille…'));
    }
    if (type === 'carnet' || s.carnetPages) {
      rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Feuillets</span><span class="brief-info-val">${s.carnetPages} f. × ${s.carnetSouches||2} souches</span></div>`);
      rows.push(_txt('Contenu du carnet', 'carnet-content', 'Champs à inclure : Nom, Date, Réf, Montant, Signature…'));
      rows.push(_fld('Position logo', 'carnet-logo-pos', 'Ex: En-tête centré, coin sup. gauche…'));
    }
    if (s.envFormatId || s.envTypeId) {
      const ef = (DB?.envelope_formats||[]).find(f=>f.id===s.envFormatId);
      const et = (DB?.envelope_types  ||[]).find(t=>t.id===s.envTypeId);
      if (ef) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Format env.</span><span class="brief-info-val">${ef.name}</span></div>`);
      if (et) rows.push(`<div class="brief-info-row"><span class="brief-info-lbl">Type env.</span><span class="brief-info-val">${et.name}</span></div>`);
      rows.push(_txt('Zones à imprimer', 'env-zones', 'Ex: Adresse retour dos rabat, logo recto bas gauche…'));
    }
    if (curProd.id === 'business-card') rows.push(_txt('Informations à faire figurer', 'identity-fields', 'Nom, Titre, Tél, Email, Site web, Adresse…'));
    rows.push(_txt('Message principal / accroche', 'main-message', 'Quel message clé ce support doit-il communiquer ?'));
    rows.push(_txt('Public cible', 'target-audience', 'À qui s\'adresse ce support ? (ex: B2B, grand public, 25-40 ans…)', 2));
    return rows.join('');
  }

  function _buildMessage() {
    const g = id => { const el = document.getElementById('brief-' + id); return el ? (el.value || '').trim() : ''; };
    const tier = (curSel?.designTier || '').toUpperCase();
    const prod = curProd?.name || 'Produit';
    const s = curSel || {};
    const lines = ['\ud83c\udfa8 *BRIEF CONCEPTION \u2014 ' + prod.toUpperCase() + '*', '\u25b8 Niveau : ' + tier, ''];
    lines.push('\ud83d\udccb *PRODUIT*');
    if (s.sizeObj) lines.push('\u2022 Format : ' + (s.sizeObj.label||'') + (s.sizeObj.w&&s.sizeObj.h?' ('+s.sizeObj.w+'\u00d7'+s.sizeObj.h+' mm)':''));
    if (s.gfW&&s.gfH) lines.push('\u2022 Dimensions : '+s.gfW+' \u00d7 '+s.gfH+' cm');
    if (s.sides) lines.push('\u2022 Impression : '+(s.sides==='double'?'Recto-Verso':'Recto'));
    if (s.pages) lines.push('\u2022 Pages : '+s.pages);
    if (s.fold) lines.push('\u2022 Pliage : '+s.fold);
    if (s.carnetPages) lines.push('\u2022 Carnet : '+s.carnetPages+' f. \u00d7 '+(s.carnetSouches||2)+' souches');
    const ef=(DB?.envelope_formats||[]).find(f=>f.id===s.envFormatId); if(ef) lines.push('\u2022 Enveloppe : '+ef.name);
    const pm=(DB?.pancarte_materials||[]).find(m=>m.id===s.pancarteMat); if(pm) lines.push('\u2022 Support : '+pm.label);
    const gm=(DB?.gf_materials||[]).find(m=>m.id===s.gfMaterial); if(gm) lines.push('\u2022 Matière GF : '+gm.label);
    if (s.quantity) lines.push('\u2022 Quantité : '+s.quantity.toLocaleString('fr-FR')+' ex.');
    const push = (lbl,id)=>{ const v=g(id); if(v) lines.push('\u2022 '+lbl+' : '+v); };
    push('Usage','gf-usage'); push('Emplacement','gf-location'); push('Fixation','gf-fixation');
    push('Usage','pan-usage'); push('Texte principal','pan-text');
    push('Contenu carnet','carnet-content'); push('Position logo','carnet-logo-pos');
    push('Zones impression','env-zones'); push('Informations','identity-fields');
    push('Structure contenu','content-structure');
    lines.push('','\ud83c\udfaf *BRIEF CRÉATIF*');
    push('Message principal','main-message'); push('Public cible','target-audience');
    lines.push('','\ud83c\udfe2 *MARQUE & IDENTITÉ*');
    push('Marque','brand-name'); push('Site web','website'); push('Couleurs de marque','brand-colors');
    const logo=g('has-logo'); if(logo) lines.push('\u2022 Logo vectoriel : '+(logo==='oui'?'\u2705 Oui \u2014 envoyé séparément':'\u274c Non'));
    const charte=g('has-charte'); if(charte) lines.push('\u2022 Charte graphique : '+(charte==='oui'?'\u2705 Disponible':'\u274c Non'));
    push('Style','style-ref'); push('Références visuelles','visual-refs');
    lines.push('','\ud83d\udcde *CONTACT*');
    push('Nom','client-name'); push('Téléphone','client-tel'); push('Email','client-email'); push('Délai','deadline');
    const notes=g('notes'); if(notes){lines.push('','\ud83d\udcdd *NOTES*'); lines.push(notes);}
    return lines.join('\n');
  }

  function open() {
    const waDesigner = (DB?.contact?.designer_whatsapp||'').replace(/\D/g,'');
    const bd = DB?.contact?.brief_defaults || {};
    const tier = (DB?.contact?.design_tiers||[]).find(t=>t.id===curSel?.designTier);
    const tierLabel = tier?.label || curSel?.designTier || '';
    document.getElementById('briefModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'briefModal';
    modal.innerHTML = `<style>
#briefModal{position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,.8);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:1rem}
#brief-box{background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.35);display:flex;flex-direction:column;width:100%;max-width:520px;max-height:92vh;overflow:hidden}
#brief-hdr{padding:.75rem 1rem;background:#f8fafc;border-bottom:1px solid #e4e9f0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
#brief-hdr-l{font-size:.75rem;font-weight:700;color:#0f172a;display:flex;align-items:center;gap:8px}
.brief-tier-badge{font-size:.6rem;font-weight:700;background:#7c3aed;color:#fff;padding:2px 9px;border-radius:99px;letter-spacing:.3px}
#brief-body{overflow-y:auto;padding:1rem;display:flex;flex-direction:column;gap:.15rem}
.brief-section-title{font-size:.6rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#64748b;padding:.6rem 0 .25rem;border-bottom:1.5px solid #e4e9f0;margin-bottom:.15rem;margin-top:.5rem}
.brief-section-title:first-child{margin-top:0}
.brief-info-row{display:flex;align-items:baseline;gap:.5rem;padding:.18rem 0;font-size:.67rem}
.brief-info-lbl{color:#94a3b8;font-weight:600;min-width:90px;flex-shrink:0}
.brief-info-val{color:#0f172a;font-weight:600}
.brief-field{display:flex;flex-direction:column;gap:.2rem;padding:.2rem 0}
.brief-lbl{font-size:.65rem;font-weight:600;color:#475569}
.brief-inp{border:1.5px solid #e4e9f0;border-radius:6px;padding:.32rem .5rem;font-size:.7rem;font-family:inherit;color:#0f172a;background:#fff;width:100%;box-sizing:border-box;outline:none;transition:border-color .14s}
.brief-inp:focus{border-color:#7c3aed}
.brief-ta{resize:vertical;min-height:60px}
select.brief-inp{cursor:pointer}
#brief-footer{padding:.75rem 1rem;border-top:1px solid #e4e9f0;display:flex;gap:.5rem;flex-shrink:0;background:#f8fafc}
.brief-close-btn{padding:6px 14px;border-radius:7px;border:1.5px solid #e4e9f0;background:#fff;font-family:inherit;font-size:.65rem;font-weight:700;cursor:pointer;color:#475569}
.brief-send-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border-radius:7px;border:none;background:#25D366;color:#fff;font-family:inherit;font-size:.68rem;font-weight:700;cursor:pointer;transition:background .15s}
.brief-send-btn:hover{background:#1da851}
.brief-send-btn:disabled{background:#94a3b8;cursor:not-allowed}
</style>
<div id="brief-box">
  <div id="brief-hdr">
    <div id="brief-hdr-l">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Brief de conception
      ${tierLabel ? `<span class="brief-tier-badge">${tierLabel}</span>` : ''}
    </div>
    <button class="brief-close-btn" onclick="document.getElementById('briefModal').remove()">✕</button>
  </div>
  <div id="brief-body">
    <div class="brief-section-title">Produit — données techniques</div>
    ${_productFields()}
    <div class="brief-section-title">Marque & identité visuelle</div>
    <div class="brief-field"><label class="brief-lbl">Nom de la marque / entreprise</label><input id="brief-brand-name" class="brief-inp" value="${(bd.brand_name||'').replace(/"/g,'&quot;')}" placeholder="Ex: Mon Entreprise"></div>
    <div class="brief-field"><label class="brief-lbl">Site web</label><input id="brief-website" class="brief-inp" value="${(bd.website||'').replace(/"/g,'&quot;')}" placeholder="https://…" type="url"></div>
    <div class="brief-field"><label class="brief-lbl">Couleurs de marque</label><input id="brief-brand-colors" class="brief-inp" value="${(bd.brand_colors||'').replace(/"/g,'&quot;')}" placeholder="#1A2B3C, Bleu marine…"></div>
    <div class="brief-field"><label class="brief-lbl">Logo vectoriel disponible ?</label><select id="brief-has-logo" class="brief-inp"><option value="oui"${bd.has_logo?' selected':''}>✅ Oui — je l'envoie séparément</option><option value="non"${!bd.has_logo?' selected':''}>❌ Non</option></select></div>
    <div class="brief-field"><label class="brief-lbl">Charte graphique existante ?</label><select id="brief-has-charte" class="brief-inp"><option value="oui"${bd.has_charte?' selected':''}>✅ Oui — je la fournis</option><option value="non"${!bd.has_charte?' selected':''}>❌ Non</option></select></div>
    <div class="brief-field"><label class="brief-lbl">Style visuel souhaité</label><input id="brief-style-ref" class="brief-inp" value="${(bd.style_ref||'').replace(/"/g,'&quot;')}" placeholder="Moderne, minimaliste, luxe, épuré…"></div>
    <div class="brief-field"><label class="brief-lbl">Références visuelles (URLs)</label><textarea id="brief-visual-refs" class="brief-inp brief-ta" rows="2" placeholder="behance.net/…, style Apple…"></textarea></div>
    <div class="brief-section-title">Contact & délai</div>
    <div class="brief-field"><label class="brief-lbl">Votre nom</label><input id="brief-client-name" class="brief-inp" placeholder="Prénom Nom"></div>
    <div class="brief-field"><label class="brief-lbl">Téléphone</label><input id="brief-client-tel" class="brief-inp" type="tel" placeholder="06XX XX XX XX"></div>
    <div class="brief-field"><label class="brief-lbl">Email</label><input id="brief-client-email" class="brief-inp" type="email" placeholder="vous@email.com"></div>
    <div class="brief-field"><label class="brief-lbl">Délai souhaité</label><select id="brief-deadline" class="brief-inp"><option value="urgent">🔴 Urgent — sous 24–48h</option><option value="3-5j" selected>🟡 3 à 5 jours ouvrés</option><option value="1-2sem">🟢 1 à 2 semaines</option><option value="flexible">⚪ Flexible</option></select></div>
    <div class="brief-section-title">Notes complémentaires</div>
    <div class="brief-field"><textarea id="brief-notes" class="brief-inp brief-ta" rows="3" placeholder="Contraintes, éléments obligatoires, ce qu'il faut éviter…"></textarea></div>
  </div>
  <div id="brief-footer">
    <button class="brief-close-btn" onclick="document.getElementById('briefModal').remove()">Annuler</button>
    <button class="brief-send-btn" ${!waDesigner?'disabled title="WhatsApp graphiste non configuré"':''} onclick="BRIEF.send('${waDesigner}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
      Envoyer le brief par WhatsApp
    </button>
  </div>
</div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    setTimeout(() => { const f = modal.querySelector('.brief-inp:not(select)'); if(f&&!f.value) f.focus(); }, 80);
  }

  function send(waNum) {
    if (!waNum) return;
    const msg = _buildMessage();
    window.open('https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    document.getElementById('briefModal')?.remove();
  }

  return { open, send };
})();


/* ════ sel.js ════ */
/* ════════════════════════════════════════════════════════
   SELECTION DISPATCHER  — maps field name → state mutation
   ════════════════════════════════════════════════════════ */
const SEL = {
  size: v => {
    curSel.size = v;
    // Look up from composition config.items first, then p.sizes
    const allSizes = _getComposition(curProd)
      .flatMap(e => e?.config?.items || [])
      .concat(curProd.sizes || []);
    curSel.sizeObj = allSizes.find(s => s.id === v);
  },
  paper:       v => { curSel.paper = v; },
  paperCover:  v => { curSel.paperCover = v; },
  sides:       v => { curSel.sides = String(v); },
  lam:         v => { curSel.lam = v; },
  lamCover:    v => { curSel.lamCover = v; },
  lamInterior: v => { curSel.lamInterior = v; },
  binding:     v => { curSel.binding = v; },
  fold:        v => { curSel.fold = v; },
  gfMaterial:  v => { curSel.gfMaterial = v; },
  withSupport: v => { curSel.withSupport = v === 'true' || v === true; },
  concType:    v => { curSel.concType = v; curSel.concPages = null; curSel.concFaces = null; curSel.customPrice = null; curSel.customPriceOpen = false; curSel.concNote = ''; curSel.logoTier = null; },
  logoTier:    v => { curSel.logoTier = v; curSel.customPrice = null; curSel.customPriceOpen = false; },
  addon:       v => {
    if (!curSel.addons)      curSel.addons = [];
    if (!curSel.addonFaces)  curSel.addonFaces = {};
    const i = curSel.addons.indexOf(v);
    if (i >= 0) { curSel.addons.splice(i, 1); delete curSel.addonFaces[v]; }
    else        { curSel.addons.push(v); curSel.addonFaces[v] = 1; }
  },
};

// Global dispatcher (called from inline event handlers in section HTML)
function fSel(field, val) {
  if (SEL[field]) SEL[field](val);
  else curSel[field] = val;   // generic fallback for custom fields (chemiseColle, pancarteMat, etc.)
  STATE.emit('curSel');        // notify listeners — curSel was mutated in-place
  UI.renderForm();
  UI.renderFooter();
}


/* ════ ui.js ════ */
const UI = (() => {

  /* ── View switcher ── */
  const VIEWS = ['vDB', 'vEmpty', 'vDash', 'vCfg', 'vConfirm'];
  function show(id) {
    VIEWS.forEach(v => {
      const el = $(v); if (!el) return;
      el.style.display = v === id ? 'flex' : 'none';
      if (v === id && v === 'vCfg') el.style.flexDirection = 'column';
    });
  }

  /* ── Sidebar ── */
  let _sbTabs = []; // [{h, l}] for one-open-at-a-time accordion

  // Icon map for well-known conception type IDs
  const CONC_ICON_MAP = {
    'logo':'pen-tool', 'carte':'credit-card', 'charte':'layers',
    'catalogue-conc':'book', 'catalogue':'book', 'mockup':'image',
    'flyer':'layout', 'affiche':'image', 'autre':'file-text',
  };

  function _sbItem(id, label, icon, sub, onClick) {
    const el  = document.createElement('div');
    el.className = 'sb-item sb-item-conc';
    el.id        = 'sb-' + id;
    const ico    = IC[icon] || IC['pen-tool'];
    el.innerHTML = `<div class="sb-ico">${ico}</div>
      <div class="sb-lbl-wrap">
        <span class="sb-lbl">${label}</span>
        ${sub ? `<span class="sb-sub">${sub}</span>` : ''}
      </div>`;
    el.onclick = onClick;
    return el;
  }

  function buildSidebar() {
    const sb   = $('sidebar');
    const foot = $('sbFoot');
    sb.querySelectorAll('.sb-sec').forEach(e => e.remove());
    _sbTabs = [];

    const groups = (DB.sidebar_groups || [{ id:'all', label:'Produits', products: DB.products.map(p => p.id) }])
      .filter(grp => grp.id !== 'signalétique' && grp.id !== 'signaletique');

    const _renderedPids = new Set(); // prevent duplicate DOM nodes when a product appears in multiple groups

    groups.forEach(grp => {
      const sec  = document.createElement('div'); sec.className = 'sb-sec';
      const hdr  = document.createElement('div'); hdr.className = 'sb-grp';
      const list = document.createElement('div'); list.className = 'sb-list';

      hdr.innerHTML = `<span class="sb-grp-lbl">${grp.label}</span><span class="sb-chev">${IC['chev-r']}</span>`;
      hdr.onclick = () => {
        const isOpen = hdr.classList.contains('open');
        _sbTabs.forEach(({ h, l }) => { h.classList.remove('open'); l.classList.remove('open'); });
        if (!isOpen) { hdr.classList.add('open'); list.classList.add('open'); }
      };

      grp.products.forEach(pid => {
        const p = DB.products.find(x => x.id === pid); if (!p) return;
        if (_renderedPids.has(pid)) return;
        _renderedPids.add(pid);

        if (p.product_type === 'conception') {
          // All services come from DB — no hardcoded logo
          (p.conception_types || []).forEach(ct => {
            const icon  = ct.icon || CONC_ICON_MAP[ct.id] || 'pen-tool';
            const model = ct.price_model
              || (ct.packages?.length ? 'packages'
                : ct.price_base != null ? 'per_layout_page'
                : ct.price_per_face != null ? 'per_face' : 'flat');
            let sub = '';
            if (model === 'packages') {
              const prices = (ct.packages || []).map(pk => pk.price).filter(Boolean);
              if (prices.length) sub = 'Dès ' + fmt(Math.min(...prices)) + ' DH';
            } else if (model === 'per_face') {
              sub = fmt(ct.price_per_face || 0) + ' DH/face';
            } else if (model === 'per_layout_page') {
              const base = ct.price_per_layout || ct.price_base || 0;
              sub = base ? 'Dès ' + fmt(base) + ' DH' : '';
            } else {
              sub = ct.price ? fmt(ct.price) + ' DH' : '';
            }
            list.appendChild(_sbItem('conc-' + ct.id, ct.label, icon, sub, () => loadConception(ct.id)));
          });
        } else {
          const el  = document.createElement('div');
          el.className = 'sb-item';
          el.id        = 'sb-' + p.id;
          el.innerHTML = `<div class="sb-ico">${IC[p.icon] || IC.layout}</div><span class="sb-lbl">${p.name}</span>`;
          el.onclick   = () => loadProduct(p.id);
          list.appendChild(el);
        }
      });

      _sbTabs.push({ h: hdr, l: list });
      sec.appendChild(hdr);
      sec.appendChild(list);
      sb.insertBefore(sec, foot);
    });

    // Open first group by default
    if (_sbTabs.length) { _sbTabs[0].h.classList.add('open'); _sbTabs[0].l.classList.add('open'); }
    if (ROLE === 'provider' && $('adminBtn'))  $('adminBtn').style.display  = 'flex';
    if (ROLE === 'provider' && $('sbHomeBtn')) $('sbHomeBtn').style.display = 'flex';
  }

  // No-op stub — kept so external callers don't break
  function _refreshGroupActive() {}

  /* ── Product header ── */
  function renderProductHeader() {
    const isCatAdmin = typeof ADMIN !== 'undefined' && !!ADMIN.catalogueMode;
    const backBtn = isCatAdmin
      ? `<button class="adm-cat-back-btn" onclick="ADMIN.openCatSheet()">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>
           Catalogue
         </button>`
      : '';
    $('cfgHdr').innerHTML = `
      ${backBtn}
      <div class="cfg-hdr-ico">${IC[curProd.icon] || IC.layout}</div>
      <div>
        <div class="cfg-hdr-title">${curProd.name}</div>
        <div class="cfg-hdr-sub">${editId ? 'Modification en cours' : 'Configurez vos spécifications'}</div>
      </div>`;
  }

  /* ── Form render ── */
  function renderForm() {
    $('cfgScroll').innerHTML =
      _getComposition(curProd).map(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        return SECTIONS[tid]?.html(curProd, curSel, DB, entry) || '';
      }).join('');
  }

  /* ── Footer / price panel ── */
  function renderFooter() {
    const footer = $('cfgFooter');
    const res    = CALC.price(curSel, DB);
    const isEdit = !!editId;
    const ctaLbl = isEdit ? 'Mettre à jour' : 'Ajouter au panier';
    const ctaFn  = isEdit
      ? `CART.update(${editId},CALC.price(curSel,DB))`
      : 'CART.add(CALC.price(curSel,DB))';

    if (!res) {
      footer.innerHTML = `
        <div class="q-hint">Complétez toutes les options pour voir le tarif</div>
        <div class="q-row">
          <div class="q-price"><div class="q-lbl">Total HT</div><div class="q-total">— <span class="cur">DH</span></div></div>
          <button class="btn btn-p" disabled>${IC.cart} ${ctaLbl}</button>
        </div>`;
      return;
    }

    if (ROLE === 'provider') {
      const isCatMode = typeof ADMIN !== 'undefined' && !!ADMIN.catalogueMode;
      const open      = isCatMode ? true : detailOpen;
      const toggleBtn = isCatMode ? '' : `
        <button class="btn-ghost${open ? ' open' : ''}" id="dtog" onclick="UI.toggleDetail()">
          ${open ? 'Masquer' : 'Voir le détail'} ${IC['chev-d']}
        </button>`;
      footer.innerHTML = `
        <div class="q-meta">
          <div class="q-lbl">${isEdit ? 'Nouveau sous-total' : 'Total HT estimé'}</div>
          ${toggleBtn}
        </div>
        <div class="dp${open ? ' open' : ''}" id="dp">
          <div class="di"><div class="di-grid">
            <div class="di-left">${_detailLeft(res)}</div>
            <div class="di-right">${_detailRows(res)}</div>
          </div></div>
        </div>
        <div class="q-row">
          <div class="q-price">
            <div class="q-total">${fmt(res.baseTotal)} <span class="cur">DH</span></div>
            <div class="q-unit">${fmt(res.perUnit)} <strong>DH / unité</strong></div>
          </div>
          <button class="btn btn-p" onclick="${ctaFn}">${IC.cart} ${ctaLbl}</button>
        </div>`;
    } else {
      /* CLIENT — for GF products show rate instead of total price */
      const isGFClient = res.isSquareMeter;
      const mat = res.mat;
      const area = res.area_m2 ? res.area_m2.toFixed(2) : null;
      const isGadgetClient = res.isGadget;
      const technique = res.technique || '';
      const gadgetName = curProd?.name || '';
      const gadgetLabel = technique ? `${gadgetName} · ${technique}` : gadgetName;
      footer.innerHTML = isGFClient ? `
        <div class="q-row">
          <div class="q-price">
            <div class="q-lbl">Tarification</div>
            <div class="q-total" style="font-size:.95rem">Prix par m²</div>
            ${mat ? `<div class="q-unit">${mat.label}${area ? ' · ' + area + ' m²' : ''}</div>` : ''}
          </div>
          <button class="btn btn-p" onclick="${ctaFn}">${IC.cart} ${ctaLbl}</button>
        </div>` : isGadgetClient ? `
        <div class="q-row">
          <div class="q-price">
            <div class="q-lbl">${isEdit ? 'Nouveau sous-total' : 'Total estimé'}</div>
            <div class="q-total">${fmt(res.baseTotal)} <span class="cur">DH</span></div>
            <div class="q-unit">${fmt(res.perUnit)} <strong>DH / unité</strong>${technique ? ` · <em style="font-weight:400;color:var(--t2)">${technique}</em>` : ''}</div>
          </div>
          <button class="btn btn-p" onclick="${ctaFn}">${IC.cart} ${ctaLbl}</button>
        </div>` : `
        <div class="q-row">
          <div class="q-price">
            <div class="q-lbl">${isEdit ? 'Nouveau sous-total' : 'Prix estimé'}</div>
            <div class="q-total">${fmt(res.baseTotal)} <span class="cur">DH</span></div>
            <div class="q-unit">${fmt(res.perUnit)} <strong>DH / unité</strong></div>
          </div>
          <button class="btn btn-p" onclick="${ctaFn}">${IC.cart} ${ctaLbl}</button>
        </div>`;
    }
  }

  function _detailRows(res) {
    const type       = curProd?.product_type;
    const isCat      = type === 'catalogue';
    const isGF       = type === 'grand_format';
    const isRU       = type === 'rollup';
    const isConc     = type === 'conception';
    const isGadget   = type === 'gadget';
    const isPancarte = type === 'pancarte';
    const isCarnet   = type === 'carnet';
    const dbl  = curSel.sides === 'double';
    const row  = (k, v, cls = '') => `<div class="sp"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`;
    const sep  = lbl => `<div class="di-sep">${lbl}</div>`;
    let rows = '';

    if (isCat) {
      const intSideLabel = res.sidesInt === 1 ? 'Recto' : 'R/V';
      const covSideLabel = res.sidesCov === 1 ? 'Recto' : 'R/V';
      const intPagesCount = res.interiorPages ?? Math.max(0, (curSel.pages || 0) - 4);
      rows += sep(`Intérieur (${intPagesCount} pages · ${intSideLabel})`);
      rows += row(`Impression ${res.pObj?.label||''} ${intSideLabel} × ${res.intTotal} f.`, fmt(res.intPrint) + ' DH');
      if (res.intLam > 0) rows += row(res.lamIntF?.label||'', fmt(res.intLam) + ' DH');
      rows += sep(`Couverture (4 pages · ${covSideLabel})`);
      rows += row(`Impression ${res.covObj?.label||''} ${covSideLabel} × ${res.covTotal} f.`, fmt(res.covPrint) + ' DH');
      if (res.covLam > 0) rows += row(res.lamCovF?.label||'', fmt(res.covLam) + ' DH');
      rows += sep('Reliure');
      rows += row(res.bindObj?.label||'', fmt(res.bindCost) + ' DH');
      rows += row('Coupe', fmt(res.cutFee) + ' DH');
    } else if (isGF) {
      const area = (parseFloat(curSel.gfW || 0) / 100 * parseFloat(curSel.gfH || 0) / 100).toFixed(2);
      rows += row(`${res.mat?.label || 'Matière'} — ${res.costPerSqm} DH/m²`, fmt(res.sqmCost) + ' DH');
      rows += row(`Surface ${area} m² × ${fmtN(curSel.quantity)} ex`, '');
      res.finLines?.forEach(l => { rows += row(l.label, fmt(l.cost) + ' DH'); });
      if (res.supportCost > 0) rows += row('Support', fmt(res.supportCost) + ' DH');
    } else if (isRU) {
      rows += row(`Impression ${curSel.sizeObj?.label}`, fmt(res.sqmCost) + ' DH');
      if (res.supportCost > 0) rows += row(`Support ${curProd.xbanner ? 'X-Banner' : 'aluminium'}`, fmt(res.supportCost) + ' DH');
    } else if (isConc) {
      const pkgLabel = res.concPackage ? ` — ${res.concPackage.label}` : '';
      rows += row(`${res.concType?.label}${pkgLabel}`, fmt(res.raw) + ' DH');
      // Show package includes as bullet list
      if (res.concPackage?.includes?.length) {
        rows += `<div class="sp" style="flex-direction:column;align-items:flex-start;gap:2px;padding:.15rem 0">
          ${res.concPackage.includes.map(inc => `<span style="font-size:.6rem;color:var(--t2)">· ${inc}</span>`).join('')}
        </div>`;
      }
      if (res.isCustomPrice) rows += `<div class="sp"><span class="k" style="font-style:italic;color:var(--pu)">Prix personnalisé</span><span class="v" style="color:var(--pu)">✓</span></div>`;
      if (curSel.concNote)   rows += `<div class="sp" style="flex-direction:column;align-items:flex-start;gap:2px"><span class="k">Brief</span><span style="font-size:.61rem;color:var(--t2);font-style:italic">${curSel.concNote}</span></div>`;
      rows += `<div class="hr"></div>${row('Total', fmt(res.baseTotal) + ' DH', 'bl')}`;
    } else if (isGadget) {
      rows += row('Coût gadget / unité', fmt(res.unitPrice || 0) + ' DH');
      if ((res.printCostPerUnit || 0) > 0) rows += row('Impression / unité', fmt(res.printCostPerUnit) + ' DH');
      rows += row('Quantité', fmtN(curSel.quantity) + ' unités');
      rows += row('Sous-total (coûts)', fmt((res.unitPrice||0) * curSel.quantity + (res.printCostPerUnit||0) * curSel.quantity) + ' DH');
    } else if (isPancarte) {
      const w = curSel.sizeObj?.w, h = curSel.sizeObj?.h;
      const area = res.area_m2 ? res.area_m2.toFixed(4) : (w && h ? ((w/1000)*(h/1000)).toFixed(4) : '—');
      rows += row(`${res.mat?.label || 'Support'} — ${res.costPerSqm} DH/m²`, fmt(res.sqmCost) + ' DH');
      rows += row(`Surface ${area} m² × ${fmtN(curSel.quantity)} ex`, '');
    } else if (isCarnet) {
      const SOUCHE_COLORS = ['Blanc','Jaune','Rose','Vert','Bleu'];
      rows += sep(`NCR — ${res.carnetPages} feuillets × ${res.carnetSouches} souches`);
      rows += row(`Papier NCR (${SOUCHE_COLORS.slice(0, res.carnetSouches).join(' + ')})`, fmt(res.ncrCost) + ' DH');
      rows += row(`${res.totalPrintSheets} feuilles → ${res.pressSheets} f. presse`, '');
      rows += row(`Impression offset × ${res.pressSheets} f.`, fmt(res.printCost) + ' DH');
      if (res.setupCost > 0) rows += row('Calage offset', fmt(res.setupCost) + ' DH');
      if (res.plateCost > 0) rows += row(`Plaques offset × ${res.colorCount} couleurs`, fmt(res.plateCost) + ' DH');
      rows += sep('Finition');
      rows += row('Agrafage', fmt(res.staplingCost) + ' DH');
      if (res.coverCost  > 0) rows += row('Couverture imprimée', fmt(res.coverCost) + ' DH');
      if (res.numeroCost > 0) rows += row('Numérotation', fmt(res.numeroCost) + ' DH');
      if (res.perfoCost  > 0) rows += row('Perforage', fmt(res.perfoCost) + ' DH');
    } else {
      // Standard / envelope
      const techLabel = res.isOffset ? 'Offset' : (dbl ? 'R/V' : 'Recto');
      const paperLabel = res.pObj ? ` — ${res.pObj.label}` : '';
      rows += row(`Impression${paperLabel} ${techLabel} × ${res.sheets} f.`, fmt(res.printCost) + ' DH');
      if (res.isOffset && res.setupCost > 0) rows += row('Calage offset', fmt(res.setupCost) + ' DH');
      if (res.isOffset && res.plateCost > 0) rows += row(`Plaques × ${res.colorCount} couleurs`, fmt(res.plateCost) + ' DH');
      if (res.lamCost > 0) rows += row(`${res.lamF.label}${dbl ? ' × 2 faces' : ''}`, fmt(res.lamCost) + ' DH');
      res.addonLines.filter(l => l.cost > 0).forEach(l => {
        let det = '';
        if      (l.model === 'setup_sheet') det = ` — film + ${res.sheets}f × ${l.faces === 1 ? '1 face' : '2 faces'}`;
        else if (l.model === 'per_sheet')   det = ` — ${res.sheets} feuilles`;
        else if (l.model === 'per_unit')    det = ` — ${fmtN(curSel.quantity)} unités`;
        rows += row(l.label + det, fmt(l.cost) + ' DH');
      });
      if (curProd?.id !== 'enveloppe') rows += row('Coupe + conditionnement', fmt(res.cutFee) + ' DH');
      if (res.chemiseCost > 0) {
        const opts = [curSel.chemiseColle ? 'Rabat collé' : '', curSel.chemiseImprime ? 'Rabat imprimé' : ''].filter(Boolean).join(' + ');
        rows += row(opts, fmt(res.chemiseCost) + ' DH');
      }
      if (curProd?.id === 'sac-shopping' && curSel.sacSoufflet > 0 && curSel.sizeObj?.w) {
        const openW = curSel.sizeObj.w + curSel.sacSoufflet * 2;
        rows += `<div class="sp" style="font-size:.63rem;color:var(--bl);font-style:italic"><span>Format ouvert</span><span>${openW}×${curSel.sizeObj.h} mm</span></div>`;
      }
    }

    if (!isConc && !isGadget && !isPancarte) {
      if (res.discAmt > 0) rows += `<div class="hr"></div>${row(`Remise (${Math.round(res.disc * 100)}%)`, '−' + fmt(res.discAmt) + ' DH', 'hi')}`;
      const marginPct = DB.pricing?.profit_margin > 0 ? Math.round(DB.pricing.profit_margin * 100) : '—';
      rows += `<div class="hr"></div>${row(`Marge (${marginPct}%)`, '+' + fmt(res.profit) + ' DH', 'hi')}`;
      rows += `<div class="sp" style="margin-top:.08rem"><span style="font-weight:600">Sous-total</span><span class="v bl">${fmt(res.baseTotal)} DH</span></div>`;
      rows += `<div class="sp" style="margin-top:.02rem"><span style="font-size:.63rem;color:var(--t3)">Délai &amp; livraison dans le panier</span></div>`;
    }
    return rows;
  }

  function _detailLeft(res) {
    const type       = curProd?.product_type;
    const isGadget   = type === 'gadget';
    const isPancarte = type === 'pancarte';
    const isCarnet   = type === 'carnet';
    const isCat      = type === 'catalogue';
    const isGF       = type === 'grand_format';
    const isRU       = type === 'rollup';
    const isConc     = type === 'conception';
    const sh         = DB.sheet;
    const iconBox = (icon, bg = 'var(--s2)', color = '') =>
      `<div style="width:98px;height:62px;background:${bg};${color ? '' : 'border:1.5px solid var(--bd);'}border-radius:5px;display:flex;align-items:center;justify-content:center${color ? ';color:' + color : ''}">${icon}</div>`;
    const legend = (bold, line2) =>
      `<div class="di-legend"><b>${bold}</b>${line2}</div>`;

    if (isCat) {
      const w = curSel.sizeObj?.w || 148, h = curSel.sizeObj?.h || 210;
      const cf  = CALC.sheetFit(w, h, sh);
      const totalPages = curSel.pages || 0;
      const totalSheets = res.intTotal + res.covTotal;
      const ppp = totalPages > 0 ? fmt(res.baseTotal / totalPages) : '—';
      const sidesLabel = res.sidesInt === 1 ? 'Recto' : 'R/V';
      return sheetSVG(cf, w, h, sh) + legend(
        `${sidesLabel} · ${res.ppsInt||4}p./f.`,
        `Int: ${res.intTotal}f + Couv: ${res.covTotal}f<br>= ${totalSheets} f. · ${ppp} DH/p.`
      );
    }
    if (isGF)   return iconBox(IC.image.replace('<svg ', '<svg width="22" height="22" '))  + legend(`${curSel.gfW || '—'}×${curSel.gfH || '—'} cm`, `Grand format<br>${fmtN(curSel.quantity || 0)} ex`);
    if (isRU)   return iconBox(IC.scroll.replace('<svg ', '<svg width="22" height="22" ')) + legend(curSel.sizeObj?.label || '—', `${curProd.xbanner ? 'X-Banner' : 'Roll-up'}<br>${fmtN(curSel.quantity || 0)} ex`);
    if (isConc) {
      const concIcon = IC[res.concType?.icon || 'pen-tool'] || IC['pen-tool'];
      const concSub  = res.concPackage ? res.concPackage.label : (res.concType?.label || '');
      return iconBox(`<span style="transform:scale(.5);display:flex">${concIcon}</span>`, 'var(--pu-lt)', 'var(--pu)')
        + legend(res.concType?.label || 'Conception', concSub);
    }
    if (isGadget) {
      const gIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:24px;height:24px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      return iconBox(gIco, '#fdf4ff', '#a855f7') + legend(fmtN(curSel.quantity || 0) + ' unités', `${fmt(res.unitPrice || 0)} DH/u`);
    }
    if (isPancarte) {
      const area = res.area_m2 ? res.area_m2.toFixed(3) : '—';
      return iconBox(IC.layout.replace('<svg ', '<svg width="22" height="22" ') || '', '#fff7ed', '#f97316') + legend(curSel.sizeObj?.label || '—', `${area} m² · ${res.mat?.label || ''}`);
    }
    if (isCarnet) {
      const carnetSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:26px;height:26px"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/><line x1="12" y1="8" x2="16" y2="8"/><line x1="12" y1="12" x2="16" y2="12"/></svg>`;
      const n = curSel.carnetSouches || 2;
      return iconBox(carnetSvg, '#f0fdf4', '#16a34a')
        + legend(`${fmtN(curSel.quantity || 0)} carnets × ${n}s`, `${curSel.carnetPages || 0} f. · ${fmtN(res.totalPrintSheets || 0)} imp.`);
    }
    if (curSel.sizeObj?.w && curSel.sizeObj?.h) {
      if (curProd?.id === 'enveloppe') {
        const envSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:28px;height:28px;color:var(--bl)"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="2,4 12,13 22,4"/></svg>`;
        return iconBox(envSvg, 'var(--bl-lt)') + legend(`${fmtN(res.sheets)} env.`, `Impression individuelle<br>${res.pObj?.label || ''}`);
      }
      const foldMap = { '2volets':2, '3volets':3, '4volets':4 };
      const nFolds  = curSel.fold ? foldMap[curSel.fold] || 1 : 1;
      const svg     = sheetSVG(res.fit, curSel.sizeObj.w, curSel.sizeObj.h, sh, nFolds > 1 ? { folds: nFolds } : {});
      const grid    = `${res.fit.cols}×${res.fit.rows}${res.fit.rotated ? ' ↻' : ''}`;
      return svg + legend(`${res.unitsPerSheet}×/feuille`, `${grid}<br>${res.sheets} feuilles`);
    }
    return '';
  }

  function toggleDetail() {
    detailOpen = !detailOpen;
    $('dp')?.classList.toggle('open', detailOpen);
    const b = $('dtog');
    if (b) { b.classList.toggle('open', detailOpen); b.innerHTML = `${detailOpen ? 'Masquer' : 'Voir le détail'} ${IC['chev-d']}`; }
  }

  /* ── Edit / cancel ── */
  function cancelEdit() {
    STATE.set('editId', null);
    $('editBanner').classList.remove('on');
    const sub = $('cfgHdr')?.querySelector('.cfg-hdr-sub');
    if (sub) sub.textContent = 'Configurez vos spécifications';
    renderFooter();
  }

  /* ── Input handlers ── */
  function customSizeMM() {
    const MAX = 420; // A3 long edge
    const wEl = $('cW'), hEl = $('cH');
    let w = parseFloat(wEl?.value), h = parseFloat(hEl?.value);
    let warn = '';
    if (w > MAX) { w = MAX; if (wEl) wEl.value = MAX; warn = `Max A3 (${MAX} mm)`; }
    if (h > MAX) { h = MAX; if (hEl) hEl.value = MAX; warn = `Max A3 (${MAX} mm)`; }
    const warnEl = document.getElementById('custom-size-warn');
    if (warnEl) warnEl.textContent = warn;
    if (w > 0 && h > 0) { curSel.sizeObj = { id:'custom', label:'Sur mesure', dims:`${w}×${h} mm`, w, h }; renderFooter(); }
  }
  function gfDims() {
    curSel.gfW = $('gfW')?.value;
    curSel.gfH = $('gfH')?.value;
    // Update only the area badge in-place — full renderForm() would destroy the
    // focused input and force the user to click again after every keystroke.
    const badge = document.querySelector('.gf-area-badge');
    if (badge) {
      const w = parseFloat(curSel.gfW), h = parseFloat(curSel.gfH);
      const area = (w > 0 && h > 0) ? (w / 100 * h / 100).toFixed(2) : null;
      badge.innerHTML = area
        ? `<div class="gf-area-val">${area}</div><div class="gf-area-lbl">m²</div>`
        : `<div class="gf-area-lbl" style="color:var(--t3)">Surface</div>`;
    }
    renderFooter();
  }
  function gfFinish(id) {
    if (!curSel.gfFinishes) curSel.gfFinishes = [];
    const i = curSel.gfFinishes.indexOf(id);
    if (i >= 0) curSel.gfFinishes.splice(i, 1); else curSel.gfFinishes.push(id);
    renderForm(); renderFooter();
  }
  function qty(v) {
    curSel.quantity  = v;
    curSel.customQty = false;
    curSel.useOffset = false; // reset offset toggle; pill reappears if still eligible
    renderForm(); renderFooter();
  }
  function qtyCustomOpen() { curSel.customQty = true; renderForm(); renderFooter(); setTimeout(() => $('qtyInp')?.focus(), 0); }
  function qtySelect(v) {
    if (!v) return;
    if (v === 'custom') { curSel.customQty = true; renderForm(); renderFooter(); setTimeout(() => $('qtyInp')?.focus(), 0); }
    else if (v.startsWith('qty:')) { curSel.quantity = +v.slice(4); curSel.customQty = false; renderForm(); renderFooter(); }
  }
  function qtyCustom(v) {
    const n = parseInt(v);
    if (n >= 1) { curSel.quantity = n; curSel.customQty = true; renderFooter(); }
  }
  function catPages(n) { curSel.pages = n; curSel.customPages = false; renderForm(); renderFooter(); }
  function catPagesSelect(v) {
    if (!v) return;
    if (v === 'custom') { curSel.customPages = true; renderForm(); setTimeout(() => $('catPagesWrap')?.querySelector('input')?.focus(), 0); return; }
    if (v.startsWith('pg:')) { curSel.pages = +v.slice(3); curSel.customPages = false; renderForm(); renderFooter(); }
  }
  // FIX: was setting curSel.customQty instead of curSel.customPages — caused custom-pages input to never collapse
  function catPagesCustom(v) {
    const n = parseInt(v);
    if (n >= 4) { curSel.pages = n; curSel.customPages = true; renderFooter(); }
  }
  function addonFaces(id, n) {
    if (!curSel.addonFaces) curSel.addonFaces = {};
    curSel.addonFaces[id] = n;
    renderForm(); renderFooter();
  }
  function toggleAddon()      { curSel.addonOpen = !curSel.addonOpen; renderForm(); }
  function toggleFinition()   { curSel.addonOpen = !curSel.addonOpen; renderForm(); } // alias kept for lam/cat-cov pills
  function toggleSpecPaper()  { curSel.specOpen          = !curSel.specOpen;          renderForm(); }
  function toggleConcCustom() { curSel.customPriceOpen   = !curSel.customPriceOpen;   renderForm(); }
  function toggleNotes()      { $('notesAcc')?.classList.toggle('open'); }
  function expandList(key)    { curSel[key] = true; renderForm(); }
  function toggleOffset() {
    curSel.useOffset = !curSel.useOffset;
    if (curSel.useOffset && !curSel.offsetColors) curSel.offsetColors = 4;
    renderForm(); renderFooter();
  }
  function setOffsetColors(n) { curSel.offsetColors = n; renderForm(); renderFooter(); }

  function toggleMobileMenu() {
    const sb   = $('sidebar');
    const ov   = $('mobSbOverlay');
    const open = sb?.classList.toggle('mob-open');
    ov?.classList.toggle('open', open);
  }

  /* ── Swipe-right to open sidebar (mobile) ── */
  (function _initSwipe() {
    let _tx = 0, _ty = 0, _tracking = false;
    const EDGE  = 28;  // px from left edge to start swipe zone
    const MIN   = 52;  // minimum horizontal distance to trigger
    const MAX_V = 60;  // maximum vertical drift allowed

    document.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      if (t.clientX > EDGE) { _tracking = false; return; }
      _tx = t.clientX; _ty = t.clientY; _tracking = true;
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!_tracking) return;
      _tracking = false;
      const t  = e.changedTouches[0];
      const dx = t.clientX - _tx;
      const dy = Math.abs(t.clientY - _ty);
      if (dx > MIN && dy < MAX_V) {
        const sb = $('sidebar');
        if (sb && !sb.classList.contains('mob-open')) toggleMobileMenu();
      }
    }, { passive: true });
  })();

  /* ── Dashboard home shortcut ── */
  function showDash() {
    document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('on'));
    _refreshGroupActive();
    $('sbHomeBtn')?.classList.add('on');
    show('vDash');
    if (typeof DASHBOARD !== 'undefined') DASHBOARD.refresh();
    $('sidebar')?.classList.remove('mob-open');
    $('mobSbOverlay')?.classList.remove('open');
  }

  /* ── Landing page helpers ── */
  function openFirstProduct() {
    if (!APP.isReady() || !DB?.products?.length) return;
    const first = DB.products.find(p => p.product_type !== 'conception') || DB.products[0];
    if (!first) return;
    if (first.product_type === 'conception') {
      const ct = (first.conception_types || [])[0];
      ct ? loadConception(ct.id) : loadProduct(first.id);
    } else {
      loadProduct(first.id);
    }
  }

  function openProductByType(typeHint) {
    if (!APP.isReady() || !DB?.products?.length) return;
    const p = DB.products.find(x => x.id === typeHint)
           || DB.products.find(x => x.product_type === typeHint)
           || DB.products.find(x => x.name?.toLowerCase().includes(typeHint))
           || DB.products.find(x => x.id?.toLowerCase().includes(typeHint));
    if (p) {
      if (p.product_type === 'conception') {
        const first = (p.conception_types || [])[0];
        first ? loadConception(first.id) : loadProduct(p.id);
      } else {
        loadProduct(p.id);
      }
    } else {
      openFirstProduct();
    }
  }

  return {
    show, buildSidebar, renderProductHeader, renderForm, renderFooter,
    toggleDetail, cancelEdit, showDash,
    customSizeMM, gfDims, gfFinish,
    qty, qtySelect, qtyCustom, qtyCustomOpen,
    catPages, catPagesSelect, catPagesCustom,
    addonFaces, toggleFinition, toggleAddon, toggleSpecPaper, toggleConcCustom, toggleNotes, expandList, toggleOffset, setOffsetColors,
    refreshGroupActive: _refreshGroupActive,
    toggleMobileMenu,
    openFirstProduct, openProductByType,
  };
})();


/* ════ loader.js ════ */
/* ════════════════════════════════════════════════════════
   PRODUCT LOADER  — orchestrates loading a product into the configurator
   ════════════════════════════════════════════════════════ */

/* Load a product by id, optionally with a pre-built selection state (cart edit / conception shortcut) */
function loadProduct(id, presel = null) {
  // Deactivate all sidebar items and dashboard home button
  document.querySelectorAll('.sb-item').forEach(el => el.classList.remove('on'));
  $('sbHomeBtn')?.classList.remove('on');

  // Highlight the correct sidebar entry
  if (presel?.concType) {
    $('sb-conc-' + presel.concType)?.classList.add('on');
  } else {
    $('sb-' + id)?.classList.add('on');
  }
  UI.refreshGroupActive();

  STATE.set('curProd', DB.products.find(p => p.id === id));
  if (!curProd) return;

  // ── Briefing wizard intercept ──
  if (curProd.id === 'briefing') {
    setTimeout(() => {
      if (typeof KOTE_BRIEFING !== 'undefined') KOTE_BRIEFING.open('standalone');
    }, 0);
    UI.show('vEmpty');
    // Close mobile nav if open
    $('sidebar')?.classList.remove('mob-open');
    $('mobSbOverlay')?.classList.remove('open');
    return;
  }

  if (presel) {
    // Restore a previous selection (cart edit) — deep-copy mutable arrays/objects
    STATE.set('curSel', {
      ...presel,
      addons:     [...(presel.addons     || [])],
      addonFaces: { ...(presel.addonFaces || {}) },
      gfFinishes: [...(presel.gfFinishes  || [])],
    });
    if (curSel.addons.length > 0) curSel.addonOpen = true;
  } else {
    // Fresh selection — start with structural base
    STATE.set('curSel', { sides: curProd.sides?.[0] || 'single', addons: [], addonFaces: {}, gfFinishes: [] });

    const _specialTypes = ['grand_format', 'rollup', 'pancarte', 'catalogue', 'carnet', 'gadget', 'conception'];
    const isStandard = !_specialTypes.includes(curProd.product_type);

    // Detect envelope product by composition regardless of product_type or calc_engine
    // (DB has enveloppe with calc_engine:'sheet_fit' and no product_type, but composition
    //  contains env-size / env-support / env-fenetre / env-offset-colors sections)
    const hasEnvComposition = _getComposition(curProd).some(e =>
      ['env-size','env-support','env-offset-colors','env-fenetre'].includes(
        typeof e === 'string' ? e : e.type_id
      )
    );

    if (hasEnvComposition) {
      // Envelope: always run env-section defaults + qty default
      _getComposition(curProd).forEach(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        SECTIONS[tid]?.defaults?.(curProd, curSel, DB, entry);
      });
      if (!curSel.quantity && curProd.quantities?.length) curSel.quantity = curProd.quantities[0];
    } else if (!isStandard) {
      _getComposition(curProd).forEach(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        SECTIONS[tid]?.defaults?.(curProd, curSel, DB, entry);
      });
      (curProd.default_addons || []).forEach(aid => {
        if (!curSel.addons.includes(aid)) { curSel.addons.push(aid); curSel.addonFaces[aid] = 1; }
      });
      if (!curSel.quantity && curProd.quantities?.length) curSel.quantity = curProd.quantities[0];
    } else {
      // Standard products: no pre-selected size/paper/lam/qty — user picks himself
      (curProd.default_addons || []).forEach(aid => {
        if (!curSel.addons.includes(aid)) { curSel.addons.push(aid); curSel.addonFaces[aid] = 1; }
      });
    }

    detailOpen = false;
  }

  UI.renderProductHeader();
  UI.renderForm();
  UI.renderFooter();
  UI.show('vCfg');

  // Close mobile nav if open
  $('sidebar')?.classList.remove('mob-open');
  $('mobSbOverlay')?.classList.remove('open');
}

/* Load the conception product with a specific service pre-selected (called from sidebar) */
function loadConception(concTypeId) {
  const concProd = DB.products.find(p => p.product_type === 'conception');
  if (!concProd) return;
  const ct = (concProd.conception_types || []).find(x => x.id === concTypeId);
  // For packages model, pre-select first package
  const concPackage = ct?.price_model === 'packages' || ct?.packages?.length
    ? (ct.packages?.[0]?.id || null)
    : null;
  loadProduct(concProd.id, {
    concType:    concTypeId,
    concPackage: concPackage,
    concFaces:   ct?.price_model === 'per_face' ? 1 : null,
    concPages:   ct?.min_pages || null,
    addons:      [],
    addonFaces:  {},
    gfFinishes:  [],
    quantity:    concProd.quantities?.[0] || 1,
  });
}

/* Reset cart and reload current product (or empty state) after a completed order */
function afterCheckout() {
  CART.clear();
  curProd ? loadProduct(curProd.id) : UI.show('vEmpty');
}




/* ════════════════════════════════════════════════════════
   KOTE_BRIEFING  — Smart product-aware design brief wizard
   Version 2.0 — 2026

   Two operating modes:
     'embedded'   — triggered from product form (design-file).
                    Reads curProd + curSel for context.
                    Saves back to curSel.briefData.
     'standalone' — opened from sidebar → Briefing product.
                    User picks product first, then answers.

   Public surface:
     KOTE_BRIEFING.open(mode, briefTemplate?)
     KOTE_BRIEFING.close()
     KOTE_BRIEFING.hasBrief()
   ════════════════════════════════════════════════════════ */
const KOTE_BRIEFING = (() => {

  /* ── Internal state ── */
  let _mode          = 'embedded';
  let _step          = 0;
  let _data          = {};
  let _prod          = null;   // actual product (for display)
  let _questionsProd = null;   // product whose Q&A schema is used (may differ via brief_template)
  let _sel           = {};
  let _steps         = [];
  let _briefRef        = null;   // BRF-XXXXXX assigned on successful submit
  let _briefId         = null;   // Supabase row id returned from POST (set after order submit)
  let _pendingBriefRow = null;   // brief held in memory until order is confirmed
  let _tiers         = [];     // tier definitions from product config
  let _designModel   = 'tier'; // 'tier' | 'multipage' | 'devis'

  /* ── Generate a unique brief reference ── */
  function _generateRef() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return 'BRF-' + s;
  }

  /* ── Harvest text/textarea fields only (no chip/toggle state) ──
     Called before _chip()/_set() re-renders the step body so that
     typed text isn't lost when the user clicks a chip or toggle.    */
  function _harvestText() {
    const g = id => { const el = document.getElementById('brf-' + id); return el ? el.value.trim() : undefined; };
    const step = _steps[_step];
    if (!step) return;
    if (step.id === 'brand') {
      const vbn = g('brand_name');   if (vbn !== undefined) _data.brand_name   = vbn;
      const vw  = g('website');      if (vw  !== undefined) _data.website      = vw;
      const vbc = g('brand_colors'); if (vbc !== undefined) _data.brand_colors = vbc;
    }
    if (step.id === 'content') {
      _productQuestions(_questionsProd || _prod, _sel).forEach(q => {
        if (q.type === 'text' || q.type === 'textarea') {
          const v = g(q.key); if (v !== undefined) _data[q.key] = v;
        }
      });
    }
    if (step.id === 'visual') {
      const vr = g('visual_refs'); if (vr !== undefined) _data.visual_refs = vr;
      const va = g('avoid');       if (va !== undefined) _data.avoid       = va;
      const vn = g('notes');       if (vn !== undefined) _data.notes       = vn;
    }
  }

  /* ════════════════════════════════════════════════════════
     SVG ICON HELPERS  — no emojis anywhere
  ════════════════════════════════════════════════════════ */
  const _ico = (d, size = 14, sw = 1.8) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}"
      width="${size}" height="${size}" style="flex-shrink:0">${d}</svg>`;

  const ICOS = {
    check:    _ico('<polyline points="20 6 9 17 4 12"/>', 12, 2.5),
    cross:    _ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 11, 2.5),
    edit:     _ico('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    arrow_l:  _ico('<path d="M19 12H5M12 5l-7 7 7 7"/>', 12, 2),
    arrow_r:  _ico('<path d="M5 12h14M12 5l7 7-7 7"/>', 12, 2),
    wa:       _ico('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>', 16),
    mail:     _ico('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', 14),
    download: _ico('<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 14),
    print:    _ico('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>', 14),
    save:     _ico('<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>', 13),
    clock_u:  _ico('<circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>', 12),
    clock_a:  _ico('<circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 16 14"/>', 12),
    clock_g:  _ico('<circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 20 14"/>', 12),
    circle:   _ico('<circle cx="12" cy="12" r="9"/>', 12),
  };

  /* deadline dot — small colored circle */
  const _dot = color =>
    `<svg viewBox="0 0 8 8" width="8" height="8" style="flex-shrink:0;margin-top:1px">
       <circle cx="4" cy="4" r="3.5" fill="${color}"/>
     </svg>`;

  /* ════════════════════════════════════════════════════════
     PRODUCT QUESTION SCHEMAS
  ════════════════════════════════════════════════════════ */
  function _productQuestions(prod, sel) {
    if (!prod) return [];
    const id   = prod.id || '';
    const type = prod.product_type || prod.calc_engine || '';
    const qs   = [];

    const chip = (key, label, opts, multi) =>
      ({ type: 'chips', key, label, opts, multi: multi !== false });
    const inp  = (key, label, ph, t) =>
      ({ type: 'text', key, label, placeholder: ph || '', inputType: t || 'text' });
    const ta   = (key, label, ph, rows) =>
      ({ type: 'textarea', key, label, placeholder: ph || '', rows: rows || 2 });
    const tog  = (key, label, yes, no) =>
      ({ type: 'toggle', key, label, yes, no });

    if (id === 'business-card') {
      qs.push(ta('fields', 'Informations à afficher',
        'Nom · Titre · Téléphone · Email · Site web · Adresse…', 3));
      qs.push(chip('layout_feel', 'Style de mise en page', [
        { v: 'minimaliste', l: 'Minimaliste'    },
        { v: 'corporate',   l: 'Corporate'      },
        { v: 'créatif',     l: 'Créatif'        },
        { v: 'luxe',        l: 'Luxe / Premium' },
        { v: 'tech',        l: 'Tech / Digital' },
      ]));
      qs.push(inp('tagline', 'Accroche / slogan (optionnel)',
        'Ex : Votre partenaire créatif…'));

    } else if (id === 'letterhead') {
      qs.push(ta('address_block', 'Bloc adresse & coordonnées',
        'Adresse complète · Tél · Email · Site web · ICE / RC…', 3));
      qs.push(chip('header_pos', 'Position du logo', [
        { v: 'haut-gauche', l: 'Haut gauche' },
        { v: 'centré',      l: 'Centré'      },
        { v: 'haut-droite', l: 'Haut droite' },
      ], false));
      qs.push(inp('footer_content', 'Pied de page (optionnel)',
        'ICE · RC · CNSS · mentions légales…'));

    } else if (id === 'enveloppe') {
      qs.push(ta('return_address', 'Adresse retour à imprimer',
        'Nom · Rue · Ville · Code postal…', 2));
      qs.push(chip('print_zones', 'Zones à personnaliser', [
        { v: 'rabat',     l: 'Rabat'       },
        { v: 'recto-bas', l: 'Recto bas'   },
        { v: 'dos',       l: 'Dos'         },
        { v: 'full',      l: 'Plein recto' },
      ]));

    } else if (id === 'chemise-rabat') {
      qs.push(ta('content_zones', 'Contenu par zone',
        'Recto : logo + slogan\nIntérieur gauche : présentation\nIntérieur droit : coordonnées…', 3));
      qs.push(chip('chemise_usage', 'Usage principal', [
        { v: 'commercial',     l: 'Commercial'     },
        { v: 'institutionnel', l: 'Institutionnel'  },
        { v: 'événementiel',   l: 'Événementiel'   },
      ], false));

    } else if (id === 'flyer' || id === 'affiche' || id === 'fiches') {
      qs.push(inp('headline', 'Titre principal / accroche',
        'Ex : Soldes jusqu\'à −50% !'));
      qs.push(inp('subheadline', 'Sous-titre / corps du message',
        'Du 15 au 30 janvier · Plus d\'infos sur…'));
      qs.push(inp('cta', 'Appel à l\'action',
        'Ex : Appelez le 06… · Visitez notre site…'));
      qs.push(chip('flyer_tone', 'Ton du message', [
        { v: 'informatif',     l: 'Informatif'    },
        { v: 'promotionnel',   l: 'Promotionnel'  },
        { v: 'événementiel',   l: 'Événementiel'  },
        { v: 'institutionnel', l: 'Institutionnel' },
      ]));

    } else if (id === 'depliant') {
      const foldNote = sel.fold ? ` (${sel.fold})` : '';
      qs.push(ta('panel_content', `Contenu par volet${foldNote}`,
        'Volet 1 : Couverture — titre + visuel\nVolet 2 : Arguments\nVolet 3 : Offres + contact…', 4));
      qs.push(chip('depliant_purpose', 'Objectif principal', [
        { v: 'présentation', l: 'Présentation' },
        { v: 'tarifs',       l: 'Tarifs'       },
        { v: 'catalogue',    l: 'Catalogue'    },
        { v: 'événement',    l: 'Événement'    },
      ], false));

    } else if (id === 'plaquette' || id === 'catalogue' || id === 'menu') {
      const pagesNote = sel.pages ? ` (${sel.pages} pages)` : '';
      qs.push(ta('page_structure', `Structure du contenu${pagesNote}`,
        'p.1 Couverture\np.2–3 Présentation\np.4–7 Produits / Services\np.8 Contact…', 4));
      qs.push(chip('catalog_type', 'Type de contenu', [
        { v: 'produits',       l: 'Produits'       },
        { v: 'services',       l: 'Services'       },
        { v: 'présentation',   l: 'Présentation'   },
        { v: 'menu',           l: 'Menu'           },
        { v: 'institutionnel', l: 'Institutionnel'  },
      ], false));
      qs.push(tog('content_ready', 'Textes & photos fournis ?', 'Oui — je les envoie', 'Non — aide requise'));

    } else if (id === 'grand-format' || type === 'grand_format') {
      qs.push(inp('headline', 'Message principal (visible de loin)',
        'Ex : BIENVENUE · OUVERT · SOLDES…'));
      qs.push(inp('gf_location', 'Emplacement prévu',
        'Vitrine · Façade · Hall · Salon…'));
      qs.push(chip('viewing_dist', 'Distance de lecture', [
        { v: '<1m',   l: '< 1 m'    },
        { v: '1-3m',  l: '1 – 3 m'  },
        { v: '3-10m', l: '3 – 10 m' },
        { v: '>10m',  l: '> 10 m'   },
      ], false));

    } else if (id === 'rollup' || id === 'kakemono' || id === 'xbanner' || id === 'totem') {
      qs.push(inp('headline', 'Titre / accroche principal',
        'Ex : Bienvenue chez Kdigital'));
      qs.push(inp('sub_ru', 'Sous-texte / coordonnées',
        'Tél · Email · Site web…'));
      qs.push(chip('rollup_ctx', 'Contexte d\'utilisation', [
        { v: 'salon',    l: 'Salon / Expo'      },
        { v: 'boutique', l: 'Boutique'          },
        { v: 'événement',l: 'Événement'         },
        { v: 'bureau',   l: 'Bureau / Accueil'  },
      ], false));

    } else if (id === 'pancarte') {
      qs.push(inp('pan_text', 'Texte principal',
        'Ex : OUVERT · ENTRÉE · MENU DU JOUR…'));
      qs.push(chip('pan_usage', 'Usage', [
        { v: 'interieur', l: 'Intérieur' },
        { v: 'exterieur', l: 'Extérieur' },
      ], false));
      qs.push(inp('pan_location', 'Emplacement',
        'Vitrine · Porte d\'entrée · Comptoir…'));

    } else if (id === 'etiquettes') {
      qs.push(ta('label_content', 'Contenu de l\'étiquette',
        'Nom produit · Code-barres · Composition · Numéro de lot…', 3));
      qs.push(chip('label_type', 'Type d\'étiquette', [
        { v: 'produit',    l: 'Produit'          },
        { v: 'prix',       l: 'Prix'             },
        { v: 'expédition', l: 'Expédition'        },
        { v: 'identité',   l: 'Identité marque'   },
      ], false));

    } else if (id === 'carnet') {
      qs.push(ta('carnet_fields', 'Champs à inclure par feuillet',
        'Date · Référence · Client · Désignation · Montant HT · TTC · Signature…', 3));
      qs.push(inp('carnet_header', 'En-tête du carnet',
        'Nom société · Adresse · Tél · ICE…'));
      qs.push(tog('carnet_numbered', 'Numérotation des feuillets ?', 'Oui', 'Non'));

    } else if (id === 'sac-shopping') {
      qs.push(chip('bag_sides', 'Côtés à imprimer', [
        { v: 'recto', l: '1 côté (recto)' },
        { v: 'rv',    l: '2 côtés (R/V)'  },
      ], false));
      qs.push(ta('bag_content', 'Contenu à imprimer',
        'Logo · Slogan · Site web · Adresse…', 2));
      qs.push(chip('bag_usage', 'Usage du sac', [
        { v: 'boutique',     l: 'Boutique'      },
        { v: 'cadeau',       l: 'Cadeau'        },
        { v: 'vrac',         l: 'Emballage vrac' },
        { v: 'événementiel', l: 'Événementiel'   },
      ]));

    } else if (type === 'gadget') {
      qs.push(ta('gadget_content', 'Que souhaitez-vous graver / imprimer ?',
        'Logo · Texte · Numéro de téléphone · Site web…', 2));
      qs.push(chip('gadget_area', 'Zone d\'impression', [
        { v: 'face-avant',  l: 'Face avant'   },
        { v: 'dos',         l: 'Dos'          },
        { v: 'tout-autour', l: 'Tout autour'  },
        { v: 'a-définir',   l: 'À définir'    },
      ], false));

    } else {
      qs.push(ta('content_generic', 'Contenu à intégrer dans le design',
        'Textes, images et informations à inclure…', 3));
      qs.push(inp('headline_generic', 'Message / accroche principal',
        'Titre · Slogan · Texte clé…'));
    }

    return qs;
  }

  /* ════════════════════════════════════════════════════════
     STEP BUILDER
  ════════════════════════════════════════════════════════ */
  function _buildSteps() {
    const steps = [];
    if (_mode === 'standalone') {
      steps.push({ id: 'product', title: 'Support à concevoir',
        sub: 'Sélectionnez le produit — les questions s\'adapteront automatiquement.' });
    } else {
      // Tier selection as first step (embedded mode, product has tier model)
      if (_tiers.length) {
        steps.push({ id: 'tiers', title: 'Niveau de conception',
          sub: 'Choisissez le niveau de service créatif pour votre projet.' });
      }
      steps.push({ id: 'context', title: 'Contexte produit',
        sub: 'Spécifications confirmées de votre commande.' });
    }
    steps.push({ id: 'brand', title: 'Identité de marque',
      sub: 'Votre marque, vos couleurs, votre univers visuel.' });
    if (_productQuestions(_questionsProd || _prod, _sel).length) {
      steps.push({ id: 'content', title: 'Contenu & informations',
        sub: 'Éléments à intégrer dans la création.' });
    }
    steps.push({ id: 'visual', title: 'Direction artistique',
      sub: 'Style, atmosphère et références visuelles.' });
    steps.push({ id: 'summary', title: 'Récapitulatif',
      sub: 'Vérifiez, exportez ou envoyez votre brief.' });
    return steps;
  }

  /* ════════════════════════════════════════════════════════
     SPEC TAGS  — from curSel
  ════════════════════════════════════════════════════════ */
  function _specTags() {
    if (!_prod) return [];
    const s = _sel, tags = [];
    tags.push({ k: 'Produit',    v: _prod.name });
    if (s.sizeObj?.label)  tags.push({ k: 'Format',     v: s.sizeObj.label + (s.sizeObj.dims ? ' — ' + s.sizeObj.dims : '') });
    if (s.gfW && s.gfH)    tags.push({ k: 'Dimensions', v: s.gfW + ' × ' + s.gfH + ' cm' });
    if (s.pages)            tags.push({ k: 'Pages',      v: s.pages + ' pages' });
    if (s.sides)            tags.push({ k: 'Impression', v: s.sides === 'double' ? 'Recto-Verso' : 'Recto' });
    if (s.fold)             tags.push({ k: 'Pliage',     v: s.fold });
    /* Paper / support */
    const paperLabel = s.paperObj?.label || s.paper || null;
    const gramLabel  = s.paperObj?.gram  ? s.paperObj.gram + ' g/m²' : null;
    if (paperLabel)         tags.push({ k: 'Support',    v: [paperLabel, gramLabel].filter(Boolean).join(' · ') });
    /* Finishes */
    if (s.lamination)       tags.push({ k: 'Pelliculage', v: s.lamination });
    if (s.finish)           tags.push({ k: 'Finition',    v: Array.isArray(s.finish) ? s.finish.join(', ') : s.finish });
    /* Binding (catalogues, plaquettes) */
    if (s.binding)          tags.push({ k: 'Reliure',     v: s.binding });
    /* Carnet */
    if (s.copies)           tags.push({ k: 'Copies',      v: s.copies + ' ex. / carnet' });
    if (s.numbering)        tags.push({ k: 'Numérotation', v: s.numbering ? 'Oui' : 'Non' });
    /* Quantity + design tier */
    if (s.quantity)         tags.push({ k: 'Quantité',    v: s.quantity.toLocaleString('fr-FR') + ' ex.' });
    if (s.designTier)       tags.push({ k: 'Niveau',      v: ({ basic:'Basic', pro:'Pro', premium:'Premium' })[s.designTier] || s.designTier });
    return tags;
  }

  /* ════════════════════════════════════════════════════════
     STEP RENDERERS
  ════════════════════════════════════════════════════════ */
  function _stepHTML(step) {
    switch (step.id) {
      case 'tiers':   return _renderTiers();
      case 'product': return _renderProductPicker();
      case 'context': return _renderContext();
      case 'brand':   return _renderBrand();
      case 'content': return _renderContent();
      case 'visual':  return _renderVisual();
      case 'contact': return _renderContact();
      case 'summary': return _renderSummary();
      default:        return '';
    }
  }

  function _renderProductPicker() {
    const db    = (typeof DB !== 'undefined' ? DB : window.DB) || {};
    const prods = (db.products || []).filter(p => p.id !== 'briefing' && p.product_type !== 'conception');
    if (!prods.length) return `<div class="brf-empty">Catalogue non chargé.</div>`;
    const groups = db.sidebar_groups || [];
    const allICs = typeof IC !== 'undefined' ? IC : {};
    let html = '';
    groups.forEach(g => {
      const gProds = (g.products || []).map(pid => prods.find(p => p.id === pid)).filter(Boolean);
      if (!gProds.length) return;
      html += `<div class="brf-pg-group">
        <div class="brf-pg-label">${g.label}</div>
        <div class="brf-prod-grid">
          ${gProds.map(p => {
            const on  = _prod?.id === p.id;
            const ico = allICs[p.icon] || allICs['layout'] || '';
            return `<div class="brf-prod-card${on?' on':''}" onclick="KOTE_BRIEFING._pickProd('${p.id}')">
              <div class="brf-prod-icon">${ico}</div>
              <div class="brf-prod-name">${p.name}</div>
              ${on ? `<div class="brf-prod-check">${ICOS.check}</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    });
    return html;
  }

  function _renderContext() {
    const tags = _specTags();
    if (!tags.length) return `<div class="brf-empty">Aucun produit actif.</div>`;
    return `
      <div class="brf-spec-recap">
        ${tags.map(t => `<div class="brf-spec-tag">
          <span class="brf-spec-k">${t.k}</span>
          <span class="brf-spec-v">${t.v}</span>
        </div>`).join('')}
      </div>
      <div class="brf-ok-note">
        ${ICOS.check}
        Ces spécifications sont déjà incluses — renseignez uniquement les infos créatives.
      </div>`;
  }

  function _renderTiers() {
    if (!_tiers.length) return `<div class="brf-empty">Aucun niveau disponible.</div>`;
    const chosen = _data.designTier || null;
    return `
      <div class="brf-tiers-grid">
        ${_tiers.map(t => {
          const on = chosen === t.id;
            return `<button type="button" class="brf-tier-card${on ? ' on' : ''}"
            onclick="KOTE_BRIEFING._pickTier('${t.id}')">
            ${on ? `<div class="brf-tier-check">${ICOS.check}</div>` : ''}
            <div class="brf-tier-name">${t.label}</div>
            <div class="brf-tier-desc">${t.desc || ''}</div>
          </button>`;
        }).join('')}
      </div>
      ${!chosen ? `<div class="brf-ok-note" style="background:var(--s2,#f7f9fc);color:var(--t3,#9eafc0);border:1px solid var(--bd)">
        ${ICOS.circle} Choisissez un niveau pour continuer
      </div>` : `<div class="brf-ok-note">
        ${ICOS.check} Niveau <strong>${_tiers.find(t=>t.id===chosen)?.label||chosen}</strong> sélectionné
      </div>`}`;
  }

  function _renderBrand() {
    const d  = _data;
    const bd = (() => { try { return (typeof DB !== 'undefined' ? DB : window.DB)?.contact?.brief_defaults || {}; } catch { return {}; } })();
    return `
      <div class="brf-field">
        <label class="brf-lbl">Nom de la marque / entreprise <span class="brf-req">*</span></label>
        <input class="brf-inp" id="brf-brand_name" placeholder="Ex : Kdigital"
          value="${_esc(d.brand_name || bd.brand_name || '')}">
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Site web</label>
        <input class="brf-inp" id="brf-website" type="url" placeholder="https://…"
          value="${_esc(d.website || bd.website || '')}">
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Couleurs de la marque</label>
        <input class="brf-inp" id="brf-brand_colors"
          placeholder="#1A2B3C · Bleu marine · Doré · Blanc…"
          value="${_esc(d.brand_colors || bd.brand_colors || '')}">
      </div>
      <div class="brf-row2">
        <div class="brf-field">
          <label class="brf-lbl">Logo vectoriel disponible ?</label>
          ${_toggle('has_logo', d.has_logo, 'Oui — envoyé séparément', 'Non')}
        </div>
        <div class="brf-field">
          <label class="brf-lbl">Charte graphique ?</label>
          ${_toggle('has_charte', d.has_charte, 'Oui — disponible', 'Non')}
        </div>
      </div>`;
  }

  function _renderContent() {
    return _productQuestions(_questionsProd || _prod, _sel).map(_renderField).join('');
  }

  function _renderVisual() {
    const d = _data;
    const styleOpts = [
      { v: 'minimaliste', l: 'Minimaliste'        },
      { v: 'moderne',     l: 'Moderne'            },
      { v: 'luxe',        l: 'Luxe / Premium'     },
      { v: 'coloré',      l: 'Coloré / Dynamique' },
      { v: 'corporate',   l: 'Corporate'          },
      { v: 'artisanal',   l: 'Artisanal / Nature' },
      { v: 'tech',        l: 'Tech / Digital'     },
      { v: 'fun',         l: 'Fun / Jeune'        },
    ];
    const toneOpts = [
      { v: 'professionnel',  l: 'Professionnel'  },
      { v: 'convivial',      l: 'Convivial'       },
      { v: 'haut-de-gamme',  l: 'Haut de gamme'  },
      { v: 'décontracté',    l: 'Décontracté'    },
      { v: 'institutionnel', l: 'Institutionnel'  },
    ];
    return `
      <div class="brf-field">
        <label class="brf-lbl">Style visuel <span class="brf-lbl-hint">(plusieurs choix)</span></label>
        ${_chips('visual_style', d.visual_style, styleOpts, true)}
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Ton & personnalité</label>
        ${_chips('visual_tone', d.visual_tone, toneOpts, true)}
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Références visuelles</label>
        <textarea class="brf-inp brf-ta" id="brf-visual_refs" rows="2"
          placeholder="behance.net/… · apple.com · Épuré chic · Marrakech moderne…">${_esc(d.visual_refs || '')}</textarea>
      </div>
      <div class="brf-field">
        <label class="brf-lbl">À éviter absolument</label>
        <input class="brf-inp" id="brf-avoid"
          placeholder="Ex : couleur rouge · style rétro · typographies fantaisie…"
          value="${_esc(d.avoid || '')}">
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Délai souhaité</label>
        <div class="brf-deadline-grid">
          ${[
            { v: 'urgent',   l: 'Urgent',          sub: '24 – 48 h',    color: '#dc2626' },
            { v: '1sem',     l: 'Cette semaine',    sub: '~5 j.',        color: '#d97706' },
            { v: '2sem',     l: 'Sous 2 semaines',  sub: '~12 j.',       color: '#059669' },
            { v: 'flexible', l: 'Flexible',         sub: 'pas de rush',  color: '#94a3b8' },
          ].map(o => {
            const on = d.deadline === o.v;
            return `<button type="button" class="brf-deadline-btn${on?' on':''}"
              onclick="KOTE_BRIEFING._set('deadline','${o.v}')"
              style="${on?`border-color:${o.color};background:${o.color}08`:''}">
              <svg viewBox="0 0 8 8" width="8" height="8" style="flex-shrink:0;margin-top:1px"><circle cx="4" cy="4" r="3.5" fill="${on?o.color:'#cbd5e1'}"/></svg>
              <span class="brf-dl-main" style="${on?`color:${o.color}`:''}"> ${o.l}</span>
              <span class="brf-dl-sub">${o.sub}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Notes complémentaires</label>
        <textarea class="brf-inp brf-ta" id="brf-notes" rows="2"
          placeholder="Contraintes · éléments obligatoires · questions…">${_esc(d.notes || '')}</textarea>
      </div>`;
  }

  function _renderContact() {
    const d = _data;
    const deadlineOpts = [
      { v: 'urgent',   l: 'Urgent',          sub: '24 – 48 h',    color: '#dc2626' },
      { v: '1sem',     l: 'Cette semaine',    sub: '~5 j.',        color: '#d97706' },
      { v: '2sem',     l: 'Sous 2 semaines',  sub: '~12 j.',       color: '#059669' },
      { v: 'flexible', l: 'Flexible',         sub: 'pas de rush',  color: '#94a3b8' },
    ];
    return `
      <div class="brf-row2">
        <div class="brf-field">
          <label class="brf-lbl">Votre nom <span class="brf-req">*</span></label>
          <input class="brf-inp" id="brf-client_name" placeholder="Prénom Nom"
            value="${_esc(d.client_name || '')}">
        </div>
        <div class="brf-field">
          <label class="brf-lbl">Téléphone <span class="brf-req">*</span></label>
          <input class="brf-inp" id="brf-client_tel" type="tel" placeholder="06 XX XX XX XX"
            value="${_esc(d.client_tel || '')}">
        </div>
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Email</label>
        <input class="brf-inp" id="brf-client_email" type="email" placeholder="vous@email.com"
          value="${_esc(d.client_email || '')}">
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Délai souhaité</label>
        <div class="brf-deadline-grid">
          ${deadlineOpts.map(o => {
            const on = d.deadline === o.v;
            return `<button type="button" class="brf-deadline-btn${on?' on':''}"
              onclick="KOTE_BRIEFING._set('deadline','${o.v}')"
              style="${on?`border-color:${o.color};background:${o.color}08`:''}">
              ${_dot(on ? o.color : '#cbd5e1')}
              <span class="brf-dl-main" style="${on?`color:${o.color}`:''}">${o.l}</span>
              <span class="brf-dl-sub">${o.sub}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="brf-deadline-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            width="11" height="11" style="flex-shrink:0;margin-top:1px;color:#d97706">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Ce choix peut influencer le tarif et la qualité de la création.
        </div>
      </div>
      <div class="brf-field">
        <label class="brf-lbl">Notes complémentaires</label>
        <textarea class="brf-inp brf-ta" id="brf-notes" rows="2"
          placeholder="Contraintes · éléments obligatoires · questions…">${_esc(d.notes || '')}</textarea>
      </div>`;
  }

  function _renderSummary() {
    const d      = _data;
    const db     = (typeof DB !== 'undefined' ? DB : window.DB) || {};
    const waNum  = (db.contact?.designer_whatsapp || '').replace(/\D/g, '');
    const _emails  = db.contact?.emails || [];
    const _creaEm  = _emails.find(e => e.id === 'crea');
    const email    = (_creaEm?.address || db.contact?.email || db.shop?.email || '').trim();
    const sections = [];

    const specs = _specTags();
    if (specs.length) sections.push({ title: 'Produit & spécifications',
      color: '#2563eb', bg: '#eff6ff', bd: '#bfdbfe',
      rows: specs.map(t => ({ k: t.k, v: t.v })) });

    const brandRows = [];
    if (d.brand_name)              brandRows.push({ k: 'Marque',  v: d.brand_name });
    if (d.website)                 brandRows.push({ k: 'Site',    v: d.website });
    if (d.brand_colors)            brandRows.push({ k: 'Couleurs',v: d.brand_colors });
    if (d.has_logo   !== undefined) brandRows.push({ k: 'Logo',   v: d.has_logo   ? 'Vectoriel disponible' : 'Non disponible' });
    if (d.has_charte !== undefined) brandRows.push({ k: 'Charte', v: d.has_charte ? 'Disponible'           : 'Non disponible' });
    if (brandRows.length) sections.push({ title: 'Marque & identité',
      color: '#7c3aed', bg: '#f5f3ff', bd: '#ddd6fe', rows: brandRows });

    const qs = _productQuestions(_questionsProd || _prod, _sel);
    const contentRows = [];
    qs.forEach(q => {
      const v = d[q.key];
      if (v === undefined || v === null || v === '') return;
      const display = Array.isArray(v) ? v.join(', ')
        : v === true  ? 'Oui'
        : v === false ? 'Non'
        : String(v);
      const short = display.length > 80 ? display.slice(0, 77) + '…' : display;
      if (short) contentRows.push({ k: q.label, v: short });
    });
    if (contentRows.length) sections.push({ title: 'Contenu',
      color: '#d97706', bg: '#fffbeb', bd: '#fde68a', rows: contentRows });

    const _join = v => [].concat(v || []).join(', ');
    const visRows = [];
    if (_join(d.visual_style)) visRows.push({ k: 'Style',      v: _join(d.visual_style) });
    if (_join(d.visual_tone))  visRows.push({ k: 'Ton',        v: _join(d.visual_tone)  });
    if (d.visual_refs)          visRows.push({ k: 'Références', v: d.visual_refs.length > 60 ? d.visual_refs.slice(0,57)+'…' : d.visual_refs });
    if (d.avoid)                visRows.push({ k: 'À éviter',   v: d.avoid });
    if (d.deadline) {
      const dl = { urgent:'Urgent (24–48h)', '1sem':'Cette semaine', '2sem':'Sous 2 semaines', flexible:'Flexible' }[d.deadline] || d.deadline;
      visRows.push({ k: 'Délai', v: dl });
    }
    if (d.notes)                visRows.push({ k: 'Notes',      v: d.notes });
    if (visRows.length) sections.push({ title: 'Direction artistique',
      color: '#059669', bg: '#ecfdf5', bd: '#a7f3d0', rows: visRows });

    if (d.notes) sections.push({ title: 'Notes',
      color: '#64748b', bg: '#f8fafc', bd: '#e2e8f0', rows: [{ k: '', v: d.notes }] });

    const sumHTML = `
      <div class="brf-summary">
        ${sections.map(sec => `
          <div class="brf-sum-section" style="border-color:${sec.bd}">
            <div class="brf-sum-title" style="color:${sec.color};background:${sec.bg};border-color:${sec.bd}">${sec.title}</div>
            ${sec.rows.map(r => `
              <div class="brf-sum-row">
                ${r.k ? `<span class="brf-sum-k">${r.k}</span>` : ''}
                <span class="brf-sum-v">${r.v}</span>
              </div>`).join('')}
          </div>`).join('')}
        ${!sections.length ? '<div class="brf-empty">Aucune donnée renseignée.</div>' : ''}
      </div>`;

    /* ── POST-SUBMIT: success panel ───────────────────────── */
    if (_briefRef) {
      return sumHTML + `
        <div class="brf-success-panel">
          <div class="brf-success-top">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              width="15" height="15" style="color:var(--gn,#059669);flex-shrink:0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Brief soumis &amp; ajouté au panier</span>
          </div>
          <div class="brf-ref-badge">${_briefRef}</div>
          <button class="brf-cart-btn" style="margin-top:.2rem" onclick="KOTE_BRIEFING.close()">
            Continuer mes achats
          </button>
        </div>`;
    }

    /* ── PRE-SUBMIT: summary + submit button only ─────────── */
    return sumHTML + `
      <div class="brf-submit-row" id="brf-submit-wrap">
        <button class="brf-submit-btn" onclick="KOTE_BRIEFING._submitBrief(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          Soumettre le brief
        </button>
        <div class="brf-submit-note">Enregistré dans la base · visible dans le dashboard Admin</div>
      </div>`;
  }

  /* ════════════════════════════════════════════════════════
     FIELD RENDERERS
  ════════════════════════════════════════════════════════ */
  function _renderField(q) {
    const v = _data[q.key];
    switch (q.type) {
      case 'text':
        return `<div class="brf-field">
          <label class="brf-lbl">${q.label}</label>
          <input class="brf-inp" id="brf-${q.key}" type="${q.inputType||'text'}"
            placeholder="${q.placeholder||''}" value="${_esc(v||'')}">
        </div>`;
      case 'textarea':
        return `<div class="brf-field">
          <label class="brf-lbl">${q.label}</label>
          <textarea class="brf-inp brf-ta" id="brf-${q.key}" rows="${q.rows||2}"
            placeholder="${q.placeholder||''}">${_esc(v||'')}</textarea>
        </div>`;
      case 'chips':
        return `<div class="brf-field">
          <label class="brf-lbl">${q.label}</label>
          ${_chips(q.key, v, q.opts, q.multi !== false)}
        </div>`;
      case 'toggle':
        return `<div class="brf-field">
          <label class="brf-lbl">${q.label}</label>
          ${_toggle(q.key, v, q.yes, q.no)}
        </div>`;
      default: return '';
    }
  }

  function _chips(key, selected, opts, multi) {
    const sel = Array.isArray(selected) ? selected : (selected != null ? [selected] : []);
    return `<div class="brf-chips">
      ${opts.map(o => {
        const on = sel.includes(o.v);
        return `<button type="button" class="brf-chip${on?' on':''}"
          onclick="KOTE_BRIEFING._chip('${key}',${!!multi},'${o.v}')">
          ${on ? `<span class="brf-chip-check">${ICOS.check}</span>` : ''}
          ${o.l}
        </button>`;
      }).join('')}
    </div>`;
  }

  function _toggle(key, value, yesLabel, noLabel) {
    return `<div class="brf-toggle-row">
      <button type="button" class="brf-toggle-btn${value===true?' on':''}"
        onclick="KOTE_BRIEFING._set('${key}',true)">
        ${value===true ? `<span style="color:var(--gn,#059669)">${ICOS.check}</span>` : ''}
        ${yesLabel}
      </button>
      <button type="button" class="brf-toggle-btn${value===false?' on':''}"
        onclick="KOTE_BRIEFING._set('${key}',false)">
        ${value===false ? `<span style="color:var(--rd,#dc2626)">${ICOS.cross}</span>` : ''}
        ${noLabel}
      </button>
    </div>`;
  }

  /* ════════════════════════════════════════════════════════
     DATA HARVEST
  ════════════════════════════════════════════════════════ */
  function _harvest() {
    const g = id => { const el = document.getElementById('brf-' + id); return el ? el.value.trim() : undefined; };
    const step = _steps[_step];
    if (!step) return;
    if (step.id === 'brand') {
      _data.brand_name   = g('brand_name')   ?? _data.brand_name;
      _data.website      = g('website')      ?? _data.website;
      _data.brand_colors = g('brand_colors') ?? _data.brand_colors;
    }
    if (step.id === 'content') {
      _productQuestions(_questionsProd || _prod, _sel).forEach(q => {
        if (q.type === 'text' || q.type === 'textarea') {
          const v = g(q.key);
          if (v !== undefined) _data[q.key] = v;
        }
      });
    }
    if (step.id === 'visual') {
      _data.visual_refs = g('visual_refs') ?? _data.visual_refs;
      _data.avoid       = g('avoid')       ?? _data.avoid;
      _data.notes       = g('notes')       ?? _data.notes;
    }
  }

  /* ════════════════════════════════════════════════════════
     NAVIGATION
  ════════════════════════════════════════════════════════ */
  function _go(dir) {
    _harvest();
    const next = _step + dir;
    if (next < 0 || next >= _steps.length) return;
    if (_mode === 'standalone' && _step === 0 && dir > 0 && !_prod) {
      _shake(document.getElementById('brf-step-body'));
      return;
    }
    const body   = document.getElementById('brf-step-body');
    const outCls = dir > 0 ? 'brf-out-l' : 'brf-out-r';
    const inCls  = dir > 0 ? 'brf-in-r'  : 'brf-in-l';
    if (body) {
      body.classList.add(outCls);
      setTimeout(() => {
        _step = next;
        _renderFull();
        const nb = document.getElementById('brf-step-body');
        if (nb) {
          nb.classList.add(inCls);
          requestAnimationFrame(() => requestAnimationFrame(() => nb.classList.remove(inCls)));
        }
      }, 200);
    } else {
      _step = next;
      _renderFull();
    }
  }

  function _shake(el) {
    if (!el) return;
    el.classList.add('brf-shake');
    setTimeout(() => el.classList.remove('brf-shake'), 500);
  }

  /* ════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════ */
  function _renderFull() {
    const modal = document.getElementById('brfModal');
    if (!modal) return;
    const step    = _steps[_step];
    const isFirst = _step === 0;
    const isLast  = _step === _steps.length - 1;
    const pct     = _steps.length > 1 ? Math.round((_step / (_steps.length - 1)) * 100) : 100;
    const dots    = _steps.map((s, i) =>
      `<div class="brf-dot${i===_step?' on':i<_step?' done':''}"></div>`).join('');

    modal.innerHTML = `
<style id="brf-style">${_css()}</style>
<div id="brf-box">

  <div id="brf-hdr">
    <div id="brf-hdr-top">
      <div id="brf-hdr-title">
        ${ICOS.edit}
        <span>Brief de conception</span>
        ${_prod ? `<span class="brf-prod-badge">${_prod.name}</span>` : ''}
      </div>
      <button class="brf-close" onclick="KOTE_BRIEFING.close()">
        ${_ico('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 16, 2)}
      </button>
    </div>
    <div id="brf-progress"><div id="brf-progress-fill" style="width:${pct}%"></div></div>
    <div id="brf-step-info">
      <div id="brf-dots">${dots}</div>
      <span id="brf-step-label">${step.title}</span>
    </div>
  </div>

  <div id="brf-sub">${step.sub}</div>

  <div id="brf-step-body">${_stepHTML(step)}</div>

  <div id="brf-footer">
    <button class="brf-btn-back${isFirst?' invisible':''}" onclick="KOTE_BRIEFING._go(-1)">
      ${ICOS.arrow_l} Retour
    </button>
    <div class="brf-step-counter">${_step+1} / ${_steps.length}</div>
    ${isLast
      ? `<div style="width:90px"></div>`
      : `<button class="brf-btn-next" onclick="KOTE_BRIEFING._go(1)">
          Suivant ${ICOS.arrow_r}
        </button>`}
  </div>

</div>`;

    setTimeout(() => {
      const f = document.querySelector('#brf-step-body .brf-inp:not(textarea):not([disabled])');
      if (f && !f.value) f.focus();
    }, 80);
  }

  /* ════════════════════════════════════════════════════════
     CSS
  ════════════════════════════════════════════════════════ */
  function _css() {
    return `
#brfModal{position:fixed;inset:0;z-index:1200;background:rgba(15,23,42,.72);
  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;padding:1rem;
  animation:brf-bg-in .2s ease}
@keyframes brf-bg-in{from{opacity:0}to{opacity:1}}
#brf-box{background:var(--sf,#fff);border-radius:16px;
  box-shadow:0 4px 6px rgba(0,0,0,.04),0 20px 60px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.05);
  display:flex;flex-direction:column;width:100%;max-width:540px;max-height:90vh;overflow:hidden;
  animation:brf-box-in .22s cubic-bezier(.34,1.36,.64,1)}
@keyframes brf-box-in{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}
#brf-hdr{flex-shrink:0;background:var(--s2,#f7f9fc);border-bottom:1px solid var(--bd,#e4e9f0)}
#brf-hdr-top{padding:.7rem 1rem .4rem;display:flex;align-items:center;justify-content:space-between}
#brf-hdr-title{display:flex;align-items:center;gap:7px;font-size:.73rem;font-weight:700;color:var(--t1,#0f172a)}
#brf-hdr-title svg{color:var(--pu,#7c3aed)}
.brf-prod-badge{font-size:.58rem;font-weight:700;background:var(--pu-lt,#f5f3ff);color:var(--pu,#7c3aed);
  border:1px solid var(--pu-bd,#ddd6fe);padding:2px 8px;border-radius:99px}
.brf-close{background:none;border:none;cursor:pointer;padding:2px;color:var(--t3,#9eafc0);
  display:flex;align-items:center;border-radius:5px;transition:color .13s,background .13s}
.brf-close:hover{color:var(--t1,#0f172a);background:var(--bd,#e4e9f0)}
#brf-progress{height:3px;background:var(--bd,#e4e9f0)}
#brf-progress-fill{height:100%;background:linear-gradient(90deg,var(--bl,#2563eb),var(--pu,#7c3aed));
  border-radius:0 2px 2px 0;transition:width .4s cubic-bezier(.4,0,.2,1)}
#brf-step-info{padding:.35rem 1rem .38rem;display:flex;align-items:center;gap:.55rem}
#brf-dots{display:flex;gap:.28rem;align-items:center}
.brf-dot{width:6px;height:6px;border-radius:50%;background:var(--bd,#e4e9f0);
  transition:all .25s cubic-bezier(.4,0,.2,1)}
.brf-dot.on{background:var(--bl,#2563eb);width:16px;border-radius:3px}
.brf-dot.done{background:var(--pu,#7c3aed)}
#brf-step-label{font-size:.68rem;font-weight:700;color:var(--t1,#0f172a)}
#brf-sub{font-size:.63rem;color:var(--t2,#5a6a7e);padding:.15rem 1rem .5rem;flex-shrink:0;line-height:1.4}
#brf-step-body{flex:1;overflow-y:auto;padding:.75rem 1rem 1rem;
  display:flex;flex-direction:column;gap:.65rem;min-height:140px}
#brf-step-body::-webkit-scrollbar{width:3px}
#brf-step-body::-webkit-scrollbar-thumb{background:var(--bd);border-radius:3px}
@keyframes brf-in-r{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
@keyframes brf-in-l{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}
.brf-out-l{animation:brf-out-l .19s ease forwards}
.brf-out-r{animation:brf-out-r .19s ease forwards}
@keyframes brf-out-l{to{opacity:0;transform:translateX(-16px)}}
@keyframes brf-out-r{to{opacity:0;transform:translateX(16px)}}
.brf-in-r{animation:brf-in-r .22s cubic-bezier(.34,1.2,.64,1) forwards}
.brf-in-l{animation:brf-in-l .22s cubic-bezier(.34,1.2,.64,1) forwards}
@keyframes brf-shake{0%,100%{transform:none}20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
.brf-shake{animation:brf-shake .4s ease}
.brf-field{display:flex;flex-direction:column;gap:.22rem}
.brf-lbl{font-size:.62rem;font-weight:600;color:var(--t2,#5a6a7e)}
.brf-lbl-hint{font-size:.58rem;font-weight:500;color:var(--t3,#9eafc0);margin-left:4px}
.brf-req{color:var(--bl,#2563eb);margin-left:2px}
.brf-inp{border:1.5px solid var(--bd,#e4e9f0);border-radius:7px;
  padding:.35rem .55rem;font-size:.7rem;font-family:inherit;color:var(--t1,#0f172a);
  background:var(--sf,#fff);width:100%;box-sizing:border-box;transition:border-color .14s,box-shadow .14s}
.brf-inp:focus{border-color:var(--bl,#2563eb);box-shadow:0 0 0 3px rgba(37,99,235,.1);outline:none}
.brf-ta{resize:vertical;min-height:50px;line-height:1.5}
.brf-row2{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}
@media(max-width:400px){.brf-row2{grid-template-columns:1fr}}
.brf-chips{display:flex;flex-wrap:wrap;gap:.28rem}
.brf-chip{display:inline-flex;align-items:center;gap:5px;border:1.5px solid var(--bd,#e4e9f0);
  border-radius:99px;padding:.25rem .65rem;font-size:.65rem;font-weight:600;
  color:var(--t2,#5a6a7e);cursor:pointer;background:var(--sf,#fff);
  transition:all .14s;font-family:inherit;white-space:nowrap}
.brf-chip:hover{border-color:var(--bl,#2563eb);color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff)}
.brf-chip.on{background:var(--bl,#2563eb);border-color:var(--bl,#2563eb);color:#fff}
.brf-chip-check{display:flex;align-items:center}
.brf-chip-check svg{color:#fff}
.brf-toggle-row{display:flex;gap:.3rem}
.brf-toggle-btn{flex:1;border:1.5px solid var(--bd,#e4e9f0);border-radius:7px;
  padding:.32rem .5rem;font-size:.66rem;font-weight:600;cursor:pointer;
  background:var(--sf,#fff);color:var(--t2,#5a6a7e);transition:all .14s;font-family:inherit;
  display:flex;align-items:center;justify-content:center;gap:5px}
.brf-toggle-btn:hover{border-color:var(--bl,#2563eb);color:var(--bl,#2563eb)}
.brf-toggle-btn.on{background:var(--s2,#f7f9fc);border-color:var(--bl,#2563eb);color:var(--t1,#0f172a);font-weight:700}
.brf-deadline-grid{display:grid;grid-template-columns:1fr 1fr;gap:.3rem}
.brf-deadline-btn{display:flex;align-items:center;gap:.4rem;
  border:1.5px solid var(--bd,#e4e9f0);border-radius:8px;padding:.4rem .6rem;
  cursor:pointer;background:var(--sf,#fff);font-family:inherit;transition:all .14s;text-align:left}
.brf-deadline-btn:hover{border-color:var(--bl,#2563eb)}
.brf-dl-main{font-size:.67rem;font-weight:700;color:var(--t1,#0f172a);flex:1}
.brf-dl-sub{font-size:.58rem;color:var(--t3,#9eafc0);white-space:nowrap}
.brf-spec-recap{display:flex;flex-wrap:wrap;gap:.32rem}
.brf-spec-tag{display:inline-flex;align-items:baseline;gap:.32rem;
  background:var(--bl-lt,#ebf2ff);border:1px solid var(--bl-md,#bfdbfe);
  border-radius:7px;padding:.28rem .6rem}
.brf-spec-k{font-size:.56rem;font-weight:800;color:var(--bl,#2563eb);
  text-transform:uppercase;letter-spacing:.5px;flex-shrink:0}
.brf-spec-v{font-size:.67rem;font-weight:600;color:var(--t1,#0f172a)}
.brf-ok-note{display:flex;align-items:flex-start;gap:.4rem;font-size:.62rem;
  color:var(--gn,#059669);background:var(--gn-lt,#ecfdf5);border-radius:7px;
  padding:.35rem .6rem;margin-top:.15rem}
.brf-ok-note svg{color:var(--gn,#059669);margin-top:.1rem}
.brf-empty{font-size:.68rem;color:var(--t3,#9eafc0);text-align:center;
  padding:2rem 1rem;font-style:italic}
.brf-pg-group{display:flex;flex-direction:column;gap:.3rem}
.brf-pg-label{font-size:.55rem;font-weight:800;text-transform:uppercase;
  letter-spacing:.8px;color:var(--t3,#9eafc0)}
.brf-prod-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem}
@media(max-width:420px){.brf-prod-grid{grid-template-columns:repeat(3,1fr)}}
.brf-prod-card{position:relative;border:1.5px solid var(--bd,#e4e9f0);border-radius:10px;
  padding:.45rem .3rem .38rem;display:flex;flex-direction:column;align-items:center;gap:.18rem;
  cursor:pointer;background:var(--sf,#fff);transition:all .15s;text-align:center}
.brf-prod-card:hover{border-color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff);transform:translateY(-1px)}
.brf-prod-card.on{border-color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff)}
.brf-prod-icon{width:22px;height:22px;color:var(--t3,#9eafc0)}
.brf-prod-icon svg{width:100%;height:100%}
.brf-prod-card.on .brf-prod-icon{color:var(--bl,#2563eb)}
.brf-prod-name{font-size:.54rem;font-weight:700;color:var(--t2,#5a6a7e);line-height:1.25}
.brf-prod-card.on .brf-prod-name{color:var(--bl,#2563eb)}
.brf-prod-check{position:absolute;top:4px;right:5px;display:flex;align-items:center;color:var(--bl,#2563eb)}
.brf-summary{display:flex;flex-direction:column;gap:.4rem}
.brf-sum-section{border-radius:9px;border:1px solid var(--bd,#e4e9f0);overflow:hidden}
.brf-sum-title{font-size:.57rem;font-weight:800;text-transform:uppercase;letter-spacing:.7px;
  padding:.28rem .65rem;border-bottom:1px solid inherit}
.brf-sum-row{display:flex;align-items:baseline;gap:.4rem;
  padding:.2rem .65rem;border-bottom:1px solid var(--bd,#e4e9f0);font-size:.65rem}
.brf-sum-row:last-child{border-bottom:none}
.brf-sum-k{min-width:75px;flex-shrink:0;font-weight:600;color:var(--t3,#9eafc0)}
.brf-sum-v{color:var(--t1,#0f172a);font-weight:500;word-break:break-word;flex:1}
.brf-export-panel{background:var(--s2,#f7f9fc);border:1px solid var(--bd,#e4e9f0);
  border-radius:10px;padding:.6rem .75rem}
.brf-export-label{font-size:.57rem;font-weight:800;text-transform:uppercase;
  letter-spacing:.7px;color:var(--t3,#9eafc0);margin-bottom:.4rem}
.brf-export-grid{display:grid;grid-template-columns:1fr 1fr;gap:.3rem}
.brf-exp-btn{display:flex;align-items:center;gap:.45rem;padding:.42rem .6rem;
  border-radius:8px;border:1.5px solid var(--bd,#e4e9f0);background:var(--sf,#fff);
  font-family:inherit;cursor:pointer;transition:all .14s;text-align:left}
.brf-exp-btn:hover:not(:disabled):not(.brf-exp-disabled){transform:translateY(-1px);box-shadow:0 2px 8px rgba(0,0,0,.08)}
.brf-exp-btn:active{transform:none}
.brf-exp-btn svg{flex-shrink:0}
.brf-exp-main{font-size:.67rem;font-weight:700;color:var(--t1,#0f172a)}
.brf-exp-sub{font-size:.57rem;color:var(--t3,#9eafc0);display:block;line-height:1.2;white-space:nowrap}
.brf-exp-btn .brf-exp-main,.brf-exp-btn .brf-exp-sub{display:block}
.brf-exp-wa{border-color:#d1fae5}
.brf-exp-wa svg{color:#25D366}
.brf-exp-wa:hover:not(:disabled){border-color:#25D366;background:#f0fdf4}
.brf-exp-mail svg{color:var(--bl,#2563eb)}
.brf-exp-mail:hover:not(:disabled){border-color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff)}
.brf-exp-html svg{color:#d97706}
.brf-exp-html:hover{border-color:#d97706;background:#fffbeb}
.brf-exp-print svg{color:var(--t2,#5a6a7e)}
.brf-exp-print:hover{border-color:var(--t2,#5a6a7e);background:var(--s2,#f7f9fc)}
.brf-exp-disabled,.brf-exp-btn:disabled{opacity:.38;cursor:not-allowed;pointer-events:none}
.brf-save-row{margin-top:.15rem}
.brf-save-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:6px;
  padding:.42rem 1rem;border-radius:8px;border:1.5px solid var(--bd,#e4e9f0);
  background:var(--sf,#fff);color:var(--t2,#5a6a7e);font-family:inherit;
  font-size:.68rem;font-weight:700;cursor:pointer;transition:all .14s}
.brf-save-btn:hover{border-color:var(--bl,#2563eb);color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff)}
.brf-save-btn svg{flex-shrink:0}
#brf-footer{flex-shrink:0;padding:.6rem 1rem;border-top:1px solid var(--bd,#e4e9f0);
  display:flex;justify-content:space-between;align-items:center;
  background:var(--s2,#f7f9fc);gap:.5rem}
.brf-btn-back{display:inline-flex;align-items:center;gap:5px;padding:.35rem .75rem;
  border-radius:7px;font-size:.66rem;font-weight:700;cursor:pointer;
  border:1.5px solid var(--bd,#e4e9f0);background:var(--sf,#fff);
  color:var(--t2,#5a6a7e);font-family:inherit;transition:all .14s}
.brf-btn-back:hover{border-color:var(--bl,#2563eb);color:var(--bl,#2563eb)}
.brf-btn-next{display:inline-flex;align-items:center;gap:5px;padding:.35rem .85rem;
  border-radius:7px;font-size:.66rem;font-weight:700;cursor:pointer;border:none;
  background:var(--bl,#2563eb);color:#fff;font-family:inherit;transition:all .14s}
.brf-btn-next:hover{background:var(--bl-dk,#1a4cc8);transform:translateY(-1px)}
.brf-step-counter{font-size:.6rem;font-weight:700;color:var(--t3,#9eafc0)}
.invisible{visibility:hidden}
.brf-submit-row{display:flex;flex-direction:column;gap:.3rem;margin-top:.1rem}
.brf-submit-btn{display:flex;align-items:center;justify-content:center;gap:7px;
  padding:.5rem 1rem;border-radius:8px;border:none;
  background:var(--t1,#0f172a);color:#fff;font-family:inherit;
  font-size:.7rem;font-weight:700;cursor:pointer;transition:all .14s}
.brf-submit-btn:hover:not(:disabled){background:#1e3a8a;transform:translateY(-1px)}
.brf-submit-btn:disabled{opacity:.45;cursor:not-allowed}
.brf-submit-note{font-size:.58rem;color:var(--t3,#9eafc0);text-align:center;line-height:1.4}
.brf-submit-ok{display:flex;align-items:center;justify-content:center;gap:.35rem;
  font-size:.65rem;font-weight:700;color:var(--gn,#059669);
  background:var(--gn-lt,#ecfdf5);border-radius:7px;padding:.3rem .6rem}
.brf-deadline-note{display:flex;align-items:flex-start;gap:.35rem;
  font-size:.6rem;color:#92400e;background:#fffbeb;border-radius:6px;
  padding:.3rem .55rem;margin-top:.3rem;line-height:1.45;border:1px solid #fde68a}
/* ── Success panel ── */
.brf-success-panel{display:flex;flex-direction:column;gap:.35rem;margin-top:.4rem;
  background:var(--gn-lt,#ecfdf5);border:1px solid var(--gn-bd,#a7f3d0);
  border-radius:10px;padding:.7rem .8rem}
.brf-success-top{display:flex;align-items:center;gap:.4rem;
  font-size:.68rem;font-weight:700;color:var(--gn,#059669)}
.brf-ref-badge{display:inline-flex;align-items:center;justify-content:center;
  font-size:.85rem;font-weight:900;font-family:'Courier New',monospace;
  letter-spacing:.08em;color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff);
  border:2px solid var(--bl-md,#bfdbfe);border-radius:8px;padding:.3rem .8rem;
  align-self:flex-start}
.brf-exp-pdf svg{color:#d97706}
.brf-exp-pdf:hover{border-color:#d97706;background:#fffbeb}
.brf-cart-btn{display:flex;align-items:center;justify-content:center;gap:7px;
  padding:.48rem 1rem;border-radius:8px;border:none;
  background:var(--bl,#2563eb);color:#fff;font-family:inherit;
  font-size:.7rem;font-weight:700;cursor:pointer;transition:all .14s;margin-top:.1rem}
.brf-cart-btn:hover{background:var(--bl-dk,#1a4cc8);transform:translateY(-1px)}
/* ── Tier selection step ── */
.brf-tiers-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem}
@media(max-width:380px){.brf-tiers-grid{grid-template-columns:1fr}}
.brf-tier-card{position:relative;border:2px solid var(--bd,#e4e9f0);border-radius:10px;
  padding:.6rem .5rem .5rem;display:flex;flex-direction:column;align-items:center;
  gap:.18rem;cursor:pointer;background:var(--sf,#fff);transition:all .15s;
  font-family:inherit;text-align:center}
.brf-tier-card:hover{border-color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff);transform:translateY(-1px)}
.brf-tier-card.on{border-color:var(--bl,#2563eb);background:var(--bl-lt,#ebf2ff)}
.brf-tier-name{font-size:.75rem;font-weight:800;color:var(--t1,#0f172a)}
.brf-tier-card.on .brf-tier-name{color:var(--bl,#2563eb)}
.brf-tier-desc{font-size:.58rem;color:var(--t3,#9eafc0);line-height:1.3;font-weight:500}
.brf-tier-check{position:absolute;top:5px;right:6px;display:flex;align-items:center;color:var(--bl,#2563eb)}
`;
  }

  /* ════════════════════════════════════════════════════════
     EXPORT: PLAIN TEXT (WA / Email)
  ════════════════════════════════════════════════════════ */
  function _buildPlainText() {
    const d    = _data;
    const prod = _prod?.name || 'Produit';
    const lines = [`BRIEF CONCEPTION — ${prod.toUpperCase()}`, ''];

    const specs = _specTags();
    if (specs.length) {
      lines.push('── PRODUIT & SPECIFICATIONS ──');
      specs.forEach(t => lines.push(`  ${t.k.padEnd(14)}: ${t.v}`));
      lines.push('');
    }

    const qs = _productQuestions(_questionsProd || _prod, _sel);
    const contentLines = [];
    qs.forEach(q => {
      const v = d[q.key];
      if (v === undefined || v === null || v === '') return;
      const display = Array.isArray(v) ? v.join(', ')
        : v === true  ? 'Oui'
        : v === false ? 'Non'
        : String(v);
      if (display) contentLines.push(`  ${q.label} :\n  ${display}`);
    });
    if (contentLines.length) {
      lines.push('── CONTENU ──');
      lines.push(...contentLines);
      lines.push('');
    }

    const brandLines = [];
    if (d.brand_name)              brandLines.push(`  Marque         : ${d.brand_name}`);
    if (d.website)                 brandLines.push(`  Site           : ${d.website}`);
    if (d.brand_colors)            brandLines.push(`  Couleurs       : ${d.brand_colors}`);
    if (d.has_logo   !== undefined) brandLines.push(`  Logo vectoriel : ${d.has_logo   ? 'Disponible' : 'Non'}`);
    if (d.has_charte !== undefined) brandLines.push(`  Charte graphique: ${d.has_charte ? 'Disponible' : 'Non'}`);
    if (brandLines.length) {
      lines.push('── MARQUE & IDENTITE ──');
      lines.push(...brandLines);
      lines.push('');
    }

    const _join = v => [].concat(v || []).join(', ');
    const visLines = [];
    if (_join(d.visual_style)) visLines.push(`  Style          : ${_join(d.visual_style)}`);
    if (_join(d.visual_tone))  visLines.push(`  Ton            : ${_join(d.visual_tone)}`);
    if (d.visual_refs)          visLines.push(`  References     : ${d.visual_refs}`);
    if (d.avoid)                visLines.push(`  A eviter       : ${d.avoid}`);
    if (visLines.length) {
      lines.push('── DIRECTION ARTISTIQUE ──');
      lines.push(...visLines);
      lines.push('');
    }

    const ctLines = [];
    if (d.client_name)  ctLines.push(`  Nom            : ${d.client_name}`);
    if (d.client_tel)   ctLines.push(`  Tel            : ${d.client_tel}`);
    if (d.client_email) ctLines.push(`  Email          : ${d.client_email}`);
    if (d.deadline) {
      const dl = { urgent:'Urgent (24-48h)', '1sem':'Cette semaine', '2sem':'Sous 2 semaines', flexible:'Flexible' }[d.deadline] || d.deadline;
      ctLines.push(`  Delai          : ${dl}`);
    }
    if (ctLines.length) {
      lines.push('── CONTACT ──');
      lines.push(...ctLines);
    }
    if (d.notes) {
      lines.push('');
      lines.push('── NOTES ──');
      lines.push('  ' + d.notes);
    }
    return lines.join('\n');
  }

  /* ════════════════════════════════════════════════════════
     EXPORT: STYLED HTML DOCUMENT
  ════════════════════════════════════════════════════════ */
  function _buildExportHTML() {
    const d    = _data;
    const prod = _prod?.name || 'Produit';
    const date = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

    const sections = [];
    const specs = _specTags();
    if (specs.length) sections.push({ title: 'Produit & spécifications',
      accent: '#2563eb', rows: specs.map(t => ({ k: t.k, v: t.v })) });

    const brandRows = [];
    if (d.brand_name)              brandRows.push({ k: 'Marque',    v: d.brand_name });
    if (d.website)                 brandRows.push({ k: 'Site web',  v: d.website });
    if (d.brand_colors)            brandRows.push({ k: 'Couleurs',  v: d.brand_colors });
    if (d.has_logo   !== undefined) brandRows.push({ k: 'Logo',     v: d.has_logo   ? 'Vectoriel disponible' : 'Non disponible' });
    if (d.has_charte !== undefined) brandRows.push({ k: 'Charte',   v: d.has_charte ? 'Disponible'           : 'Non disponible' });
    if (brandRows.length) sections.push({ title: 'Marque & identité', accent: '#7c3aed', rows: brandRows });

    const qs = _productQuestions(_questionsProd || _prod, _sel);
    const contentRows = [];
    qs.forEach(q => {
      const v = d[q.key];
      if (v === undefined || v === null || v === '') return;
      const display = Array.isArray(v) ? v.join(', ')
        : v === true  ? 'Oui'
        : v === false ? 'Non'
        : String(v);
      if (display) contentRows.push({ k: q.label, v: display });
    });
    if (contentRows.length) sections.push({ title: 'Contenu', accent: '#d97706', rows: contentRows });

    const _join = v => [].concat(v || []).join(', ');
    const visRows = [];
    if (_join(d.visual_style)) visRows.push({ k: 'Style',       v: _join(d.visual_style) });
    if (_join(d.visual_tone))  visRows.push({ k: 'Ton',         v: _join(d.visual_tone)  });
    if (d.visual_refs)          visRows.push({ k: 'Références',  v: d.visual_refs });
    if (d.avoid)                visRows.push({ k: 'À éviter',    v: d.avoid });
    if (visRows.length) sections.push({ title: 'Direction artistique', accent: '#059669', rows: visRows });

    const ctRows = [];
    if (d.client_name)  ctRows.push({ k: 'Nom',   v: d.client_name });
    if (d.client_tel)   ctRows.push({ k: 'Tél',   v: d.client_tel  });
    if (d.client_email) ctRows.push({ k: 'Email', v: d.client_email });
    if (d.deadline) {
      const dl = { urgent:'Urgent (24–48h)', '1sem':'Cette semaine', '2sem':'Sous 2 semaines', flexible:'Flexible' }[d.deadline] || d.deadline;
      ctRows.push({ k: 'Délai', v: dl });
    }
    if (ctRows.length) sections.push({ title: 'Contact', accent: '#0891b2', rows: ctRows });
    if (d.notes) sections.push({ title: 'Notes complémentaires', accent: '#64748b', rows: [{ k: '', v: d.notes }] });

    const sectionHTML = sections.map(s => `
      <div class="section">
        <h2 style="color:${s.accent}">${s.title}</h2>
        <table>
          ${s.rows.map(r => `
            <tr>
              ${r.k ? `<td class="key">${r.k}</td>` : '<td class="key"></td>'}
              <td class="val">${r.v}</td>
            </tr>`).join('')}
        </table>
      </div>`).join('');

    const db   = (typeof DB !== 'undefined' ? DB : window.DB) || {};
    const shop = db.shop || {};

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brief — ${prod}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;
    font-size:14px;line-height:1.5;padding:2rem}
  @media print{body{padding:0;background:#fff}.no-print{display:none}}
  .page{background:#fff;max-width:720px;margin:0 auto;border-radius:12px;
    box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 32px rgba(0,0,0,.06);overflow:hidden}
  @media print{.page{box-shadow:none;border-radius:0}}
  .header{background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:1.5rem 2rem;
    display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}
  .header-left{}
  .header-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;
    color:#93c5fd;margin-bottom:.35rem}
  .header-title{font-size:1.4rem;font-weight:800;color:#fff;letter-spacing:-.03em}
  .header-sub{font-size:.78rem;color:#bfdbfe;margin-top:.15rem}
  .header-right{text-align:right;flex-shrink:0}
  .header-date{font-size:.72rem;color:#94a3b8;margin-bottom:.25rem}
  .header-shop{font-size:.82rem;font-weight:700;color:#fff}
  .body{padding:1.5rem 2rem;display:flex;flex-direction:column;gap:1.25rem}
  .section{}
  .section h2{font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;
    padding:.2rem .5rem .2rem 0;margin-bottom:.5rem;border-bottom:2px solid currentColor;
    display:inline-block}
  table{width:100%;border-collapse:collapse}
  tr:not(:last-child) td{border-bottom:1px solid #f1f5f9}
  td{padding:.4rem .35rem;font-size:.85rem}
  td.key{width:160px;font-weight:600;color:#64748b;font-size:.78rem;padding-right:.75rem}
  td.val{color:#0f172a}
  .footer{padding:.85rem 2rem;background:#f8fafc;border-top:1px solid #e2e8f0;
    display:flex;align-items:center;justify-content:space-between;
    font-size:.68rem;color:#94a3b8}
  .print-btn{display:inline-flex;align-items:center;gap:6px;padding:.4rem .9rem;
    border-radius:6px;border:1.5px solid #e2e8f0;background:#fff;cursor:pointer;
    font-size:.72rem;font-weight:700;color:#475569;font-family:inherit;transition:all .15s}
  .print-btn:hover{border-color:#2563eb;color:#2563eb}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="header-tag">Brief de conception</div>
      <div class="header-title">${prod}</div>
      ${d.brand_name ? `<div class="header-sub">${d.brand_name}${d.client_name ? ' · ' + d.client_name : ''}</div>` : ''}
    </div>
    <div class="header-right">
      <div class="header-date">${date}</div>
      ${shop.name ? `<div class="header-shop">${shop.name}</div>` : ''}
    </div>
  </div>
  <div class="body">${sectionHTML}</div>
  <div class="footer">
    <span>Généré par Kote · ${date}</span>
    <button class="print-btn no-print" onclick="window.print()">Imprimer</button>
  </div>
</div>
</body>
</html>`;
  }

  /* ════════════════════════════════════════════════════════
     EXPORT ACTIONS
  ════════════════════════════════════════════════════════ */
  function _sendWA(waNum) {
    if (!waNum) return;
    _harvest();
    const prod  = (_prod?.name || 'Brief').toLowerCase().replace(/\s+/g, '-');
    const brand = (_data.brand_name || '').toLowerCase().replace(/\s+/g, '-');
    // Step 1 — open PDF print window (user saves as PDF)
    const html = _buildExportHTML();
    const win  = window.open('', '_blank', 'width=820,height=960,toolbar=0,menubar=0');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }
    // Step 2 — open WA with a brief cover message (slight delay so PDF window opens first)
    const prodName  = _prod?.name || 'Produit';
    const brandName = _data.brand_name ? ' — ' + _data.brand_name : '';
    const msg = `Bonjour,\n\nVeuillez trouver ci-joint le brief de conception pour : ${prodName}${brandName}.\n\nFichier PDF téléchargé depuis la fenêtre d'impression.\n\nMerci.`;
    setTimeout(() => {
      window.open('https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    }, 600);
  }

  function _sendEmail(emailAddr) {
    if (!emailAddr) return;
    _harvest();
    const prod  = _prod?.name || 'Produit';
    const brand = _data.brand_name ? ' · ' + _data.brand_name : '';
    const subj  = encodeURIComponent(`Brief de conception — ${prod}${brand}`);
    // Open PDF print window first
    const html = _buildExportHTML();
    const win  = window.open('', '_blank', 'width=820,height=960,toolbar=0,menubar=0');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.onload = () => { win.focus(); win.print(); };
    }
    // Open mail client with plain-text body + instruction
    const bodyText = `Bonjour,\n\nVeuillez trouver ci-joint le brief de conception (PDF joint séparément).\n\n` + _buildPlainText();
    setTimeout(() => {
      window.location.href = `mailto:${emailAddr}?subject=${subj}&body=${encodeURIComponent(bodyText)}`;
    }, 600);
  }

  function _exportHTML() {
    _harvest();
    const html  = _buildExportHTML();
    const blob  = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url   = URL.createObjectURL(blob);
    const prod  = (_prod?.name || 'brief').toLowerCase().replace(/\s+/g, '-');
    const brand = (_data.brand_name || '').toLowerCase().replace(/\s+/g, '-');
    const fname = `brief-${prod}${brand ? '-' + brand : ''}.html`;
    const a     = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function _printPDF() {
    _harvest();
    const html = _buildExportHTML();
    const win  = window.open('', '_blank', 'width=800,height=900');
    if (!win) { alert('Autorisez les popups pour imprimer.'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }

  /* ════════════════════════════════════════════════════════
     UTILITY
  ════════════════════════════════════════════════════════ */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _getComposition(p) {
    if (!p) return [];
    if (p.composition) return p.composition;
    return (p.sections || []).map(s => ({ type_id: s, config: {} }));
  }

  /* ════════════════════════════════════════════════════════
     SUPABASE SAVE
  ════════════════════════════════════════════════════════ */
  async function _submitBrief(btn) {
    _harvest();

    if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }

    const ref = _generateRef();

    const row = {
      ref:         ref,
      product_id:  _prod?.id         || null,
      brand_name:  _data.brand_name  || null,
      client_name: _data.client_name || null,
      client_tel:  _data.client_tel  || null,
      client_email:_data.client_email|| null,
      design_tier: _data.designTier  || null,
      status:      'nouveau',
      order_ref:   null,
      payload: {
        /* ── product spec fields from _sel (context step) ── */
        sizeObj:    _sel.sizeObj    || null,
        size_label: _sel.sizeObj?.label || _sel.size_label || null,
        gfW:        _sel.gfW        || null,
        gfH:        _sel.gfH        || null,
        sides:      _sel.sides      || null,
        pages:      _sel.pages      || null,
        fold:       _sel.fold       || null,
        paper:      _sel.paper      || null,
        paperObj:   _sel.paperObj   || null,
        lamination: _sel.lamination || null,
        finish:     _sel.finish     || null,
        binding:    _sel.binding    || null,
        quantity:   _sel.quantity   || null,
        copies:     _sel.copies     || null,
        numbering:  _sel.numbering  ?? null,
        designTier: _data.designTier || _sel.designTier || null,
        /* ── all creative brief answers ── */
        ..._data,
      },
    };

    // ── Store in memory only — DB insert happens when order is submitted ──
    _briefRef        = ref;
    _briefId         = null; // will be assigned after order is confirmed
    _pendingBriefRow = row;

    // Auto-sync brief data + tier back to curSel
    if (typeof curSel !== 'undefined') {
      curSel.briefData = Object.assign({}, _data);
      if (_data.designTier) curSel.designTier = _data.designTier;
    }
    // Auto-add brief as a standalone cart line item
    if (typeof CART !== 'undefined' && typeof CART.addBrief === 'function') {
      CART.addBrief({
        prodName:        _prod?.name || 'Conception graphique',
        briefRef:        _briefRef,
        briefId:         null, // no DB id yet
        linkedProdId:    _prod?.id   || null,
        linkedProdName:  _prod?.name || null,
      });
    }
    // Auto-add the product itself if not already in cart
    if (typeof CART !== 'undefined' && typeof CART.addIfNew === 'function') {
      const calcRes = (typeof CALC !== 'undefined') ? CALC.price(curSel, DB) : null;
      if (calcRes) CART.addIfNew(calcRes);
    }
    // Refresh product form to reflect brief state
    if (typeof UI !== 'undefined') {
      if (typeof UI.renderForm   === 'function') UI.renderForm();
      if (typeof UI.renderFooter === 'function') UI.renderFooter();
    }

    // Re-render the full modal — _renderSummary() detects _briefRef → success panel
    _renderFull();
  }

    /* ════════════════════════════════════════════════════════
     PDF GENERATION  — programmatic jsPDF (no html2canvas)
  ════════════════════════════════════════════════════════ */
  async function _generatePDF() {
    // Lazy-load jsPDF from CDN if not already present
    if (!window.jspdf?.jsPDF && !window.jsPDF) {
      await new Promise((res, rej) => {
        if (document.querySelector('script[src*="jspdf"]')) {
          // Already injected — wait for global
          let n = 0;
          const t = setInterval(() => {
            if (window.jspdf?.jsPDF || window.jsPDF) { clearInterval(t); res(); }
            else if (++n > 50) { clearInterval(t); rej(new Error('jsPDF timeout')); }
          }, 100);
          return;
        }
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload  = () => res();
        s.onerror = () => rej(new Error('jsPDF CDN unavailable'));
        document.head.appendChild(s);
      }).catch(e => { alert('Erreur chargement jsPDF : ' + e.message); throw e; });
    }

    const JsPDF = window.jspdf?.jsPDF || window.jsPDF;
    if (!JsPDF) { alert('jsPDF non disponible.'); return; }

    const d    = _data;
    const prod = _prod?.name || 'Brief';
    const db   = (typeof DB !== 'undefined' ? DB : window.DB) || {};
    const shop = db.shop || {};
    const date = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

    const doc  = new JsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const W = 210, H = 297, ML = 15, MR = 15, MT = 15;
    let y = MT;

    // ── Header band ──────────────────────────────────────
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 32, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(147, 197, 253);
    doc.text('BRIEF DE CONCEPTION', ML, 10);
    doc.setFontSize(16);
    doc.setTextColor(255, 255, 255);
    doc.text(prod, ML, 20);
    if (d.brand_name) {
      doc.setFontSize(8);
      doc.setTextColor(191, 219, 254);
      doc.text(d.brand_name + (d.client_name ? ' · ' + d.client_name : ''), ML, 27.5);
    }
    if (_briefRef) {
      doc.setFillColor(37, 99, 235);
      doc.roundedRect(W - MR - 38, 8, 38, 10, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(_briefRef, W - MR - 19, 14.5, { align: 'center' });
    }
    if (shop.name) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text(shop.name, W - MR, 27.5, { align: 'right' });
    }
    y = 40;

    // ── Section builder ───────────────────────────────────
    const SECS = [];
    const specs = _specTags();
    if (specs.length) SECS.push({ title:'Produit & Spécifications', accent:[37,99,235],
      rows: specs.map(t => [t.k, t.v]) });

    const brandRows = [];
    if (d.brand_name)               brandRows.push(['Marque',           d.brand_name]);
    if (d.website)                   brandRows.push(['Site web',         d.website]);
    if (d.brand_colors)              brandRows.push(['Couleurs',         d.brand_colors]);
    if (d.has_logo   !== undefined)  brandRows.push(['Logo vectoriel',   d.has_logo   ? 'Disponible' : 'Non']);
    if (d.has_charte !== undefined)  brandRows.push(['Charte graphique', d.has_charte ? 'Disponible' : 'Non']);
    if (brandRows.length) SECS.push({ title:'Marque & Identité', accent:[124,58,237], rows: brandRows });

    const qs = _productQuestions(_questionsProd || _prod, _sel);
    const contentRows = [];
    qs.forEach(q => {
      const v = d[q.key];
      if (v === undefined || v === null || v === '') return;
      const display = Array.isArray(v) ? v.join(', ')
        : v === true ? 'Oui' : v === false ? 'Non' : String(v);
      if (display) contentRows.push([q.label, display]);
    });
    if (contentRows.length) SECS.push({ title:'Contenu & Informations', accent:[217,119,6], rows: contentRows });

    const _jn = v => [].concat(v||[]).join(', ');
    const visRows = [];
    if (_jn(d.visual_style)) visRows.push(['Style',       _jn(d.visual_style)]);
    if (_jn(d.visual_tone))  visRows.push(['Ton',         _jn(d.visual_tone)]);
    if (d.visual_refs)        visRows.push(['Références',  d.visual_refs]);
    if (d.avoid)              visRows.push(['À éviter',    d.avoid]);
    if (visRows.length) SECS.push({ title:'Direction Artistique', accent:[5,150,105], rows: visRows });

    const ctRows = [];
    if (d.client_name)  ctRows.push(['Nom',   d.client_name]);
    if (d.client_tel)   ctRows.push(['Tél',   d.client_tel]);
    if (d.client_email) ctRows.push(['Email', d.client_email]);
    if (d.deadline) {
      const dl = {urgent:'Urgent (24–48h)','1sem':'Cette semaine','2sem':'Sous 2 semaines',flexible:'Flexible'}[d.deadline] || d.deadline;
      ctRows.push(['Délai', dl]);
    }
    if (ctRows.length) SECS.push({ title:'Contact', accent:[8,145,178], rows: ctRows, pinBottom: true });
    if (d.notes) SECS.push({ title:'Notes', accent:[100,116,139], rows:[['Notes', d.notes]] });

    // ── Render each section ───────────────────────────────
    const FTR_LINE_BR = H - 18;
    const normalSecs  = SECS.filter(s => !s.pinBottom);
    const bottomSecs  = SECS.filter(s =>  s.pinBottom);

    for (const sec of normalSecs) {
      if (y > FTR_LINE_BR - 30) { doc.addPage(); y = MT; }
      doc.setFillColor(...sec.accent);
      doc.rect(ML, y, W - ML - MR, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(sec.title.toUpperCase(), ML + 2.5, y + 4.1);
      y += 8;

      for (const [k, v] of sec.rows) {
        if (y > FTR_LINE_BR - 18) { doc.addPage(); y = MT; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(k, ML + 2, y + 3.8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        const vLines = doc.splitTextToSize(String(v), W - ML - MR - 52);
        doc.text(vLines, ML + 50, y + 3.8);
        const rowH = Math.max(7, vLines.length * 4.5);
        doc.setDrawColor(228, 233, 240);
        doc.line(ML, y + rowH, W - MR, y + rowH);
        y += rowH;
      }
      y += 3;
    }

    // ── Bottom-pinned sections (Contact) ──────────────────
    for (const sec of bottomSecs) {
      // Pre-calculate height
      let secH = 8;
      for (const [, v] of sec.rows) {
        doc.setFontSize(7.5);
        const vl = doc.splitTextToSize(String(v), W - ML - MR - 52);
        secH += Math.max(7, vl.length * 4.5);
      }
      secH += 3;
      const pinY = FTR_LINE_BR - secH;
      // Subtle separator if there's a gap above
      if (pinY > y + 6) {
        doc.setDrawColor(228, 233, 240);
        doc.setLineWidth(0.2);
        doc.line(ML, pinY - 3, W - MR, pinY - 3);
      }
      let py = Math.max(y, pinY);
      doc.setFillColor(...sec.accent);
      doc.rect(ML, py, W - ML - MR, 6, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(255, 255, 255);
      doc.text(sec.title.toUpperCase(), ML + 2.5, py + 4.1);
      py += 8;
      for (const [k, v] of sec.rows) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(k, ML + 2, py + 3.8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        const vLines = doc.splitTextToSize(String(v), W - ML - MR - 52);
        doc.text(vLines, ML + 50, py + 3.8);
        const rowH = Math.max(7, vLines.length * 4.5);
        doc.setDrawColor(228, 233, 240);
        doc.line(ML, py + rowH, W - MR, py + rowH);
        py += rowH;
      }
    }

    // ── Footer ───────────────────────────────────────────
    doc.setFillColor(248, 250, 252);
    doc.rect(0, H - 12, W, 12, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184);
    doc.text('Généré par Kote · ' + date, ML, H - 5);
    if (_briefRef) doc.text(_briefRef, W - MR, H - 5, { align: 'right' });

    const prodSlug  = prod.toLowerCase().replace(/\s+/g, '-');
    const brandSlug = (d.brand_name || '').toLowerCase().replace(/\s+/g, '-');
    doc.save(`brief-${prodSlug}${brandSlug ? '-' + brandSlug : ''}${_briefRef ? '-' + _briefRef : ''}.pdf`);
  }

  /* ════════════════════════════════════════════════════════
     ADD BRIEF AS STANDALONE CART ITEM
  ════════════════════════════════════════════════════════ */
  function _addBriefToCart() {
    if (!_briefRef) return;
    if (typeof CART !== 'undefined' && typeof CART.addBrief === 'function') {
      CART.addBrief({
        prodName:        _prod?.name || 'Conception graphique',
        briefRef:        _briefRef,
        briefId:         _briefId,
        linkedProdId:    _prod?.id   || null,
        linkedProdName:  _prod?.name || null,
      });
    }
    close();
  }

  /* ════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════ */
  function open(mode) {
    _mode     = mode || 'embedded';
    _step     = 0;
    _briefRef = null;
    _briefId  = null;

    if (_mode === 'embedded') {
      _prod = (typeof curProd !== 'undefined') ? curProd : null;
      _sel  = (typeof curSel  !== 'undefined') ? Object.assign({}, curSel) : {};
      _data = (_sel.briefData && typeof _sel.briefData === 'object')
        ? Object.assign({}, _sel.briefData) : {};

      // Restore previously chosen tier from curSel if available
      if (_sel.designTier && !_data.designTier) _data.designTier = _sel.designTier;

      /* Resolve brief_template from product's design-file entry config */
      const dfEntry = _prod
        ? _getComposition(_prod).find(e => (typeof e === 'string' ? e : e.type_id) === 'design-file')
        : null;
      const tplId = dfEntry?.config?.brief_template;
      if (tplId) {
        const db = (typeof DB !== 'undefined' ? DB : window.DB) || {};
        _questionsProd = (db.products || []).find(p => p.id === tplId) || _prod;
      } else {
        _questionsProd = _prod;
      }

      // Extract tier configuration for the tiers step
      _designModel = dfEntry?.config?.design_model || 'tier';
      if (dfEntry && (_designModel === 'tier' || _designModel === 'multipage')) {
        const db = (typeof DB !== 'undefined' ? DB : window.DB) || {};
        const defaultTiers = _designModel === 'multipage'
          ? [
              { id:'basic',   label:'Basic',   desc:'Mise en page soignée'       },
              { id:'pro',     label:'Pro',     desc:'Design créatif + retouches' },
              { id:'premium', label:'Premium', desc:'Premium · déclinaisons'     },
            ]
          : (db.contact?.design_tiers) || [
              { id:'basic',   label:'Basic',   desc:'Mise en page soignée'       },
              { id:'pro',     label:'Pro',     desc:'Design créatif + retouches' },
              { id:'premium', label:'Premium', desc:'Premium · déclinaisons'     },
            ];
        _tiers = dfEntry?.config?.tiers || defaultTiers;
      } else {
        _tiers = [];
      }
    } else {
      _prod = null;
      _questionsProd = null;
      _sel  = {};
      _data = {};
      _tiers = [];
      _designModel = 'tier';
    }

    _steps = _buildSteps();

    document.getElementById('brfModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'brfModal';
    document.body.appendChild(modal);
    // No click-outside-to-close — only the X button closes the modal
    _renderFull();
  }

  function close() {
    document.getElementById('brfModal')?.remove();
  }

  function hasBrief() {
    return !!(typeof curSel !== 'undefined' && curSel.briefData && Object.keys(curSel.briefData).length);
  }

  /* ── Inline handlers ── */
  function _pickProd(id) {
    const db = (typeof DB !== 'undefined' ? DB : window.DB) || {};
    _prod          = (db.products || []).find(p => p.id === id) || null;
    _questionsProd = _prod;
    _steps         = _buildSteps();
    _renderFull();
  }

  function _chip(key, multi, val) {
    _harvestText(); // preserve typed text before re-render
    if (multi === 'true' || multi === true) {
      const arr = Array.isArray(_data[key]) ? [..._data[key]] : [];
      const i   = arr.indexOf(val);
      if (i >= 0) arr.splice(i, 1); else arr.push(val);
      _data[key] = arr;
    } else {
      _data[key] = (_data[key] === val) ? null : val;
    }
    const step = _steps[_step];
    const body = document.getElementById('brf-step-body');
    if (body && step) body.innerHTML = _stepHTML(step);
  }

  function _set(key, val) {
    _harvestText(); // preserve typed text before re-render
    _data[key] = val;
    const step = _steps[_step];
    const body = document.getElementById('brf-step-body');
    if (body && step) body.innerHTML = _stepHTML(step);
  }

  function _pickTier(id) {
    _data.designTier = (_data.designTier === id) ? null : id;
    const step = _steps[_step];
    const body = document.getElementById('brf-step-body');
    if (body && step) body.innerHTML = _stepHTML(step);
  }

  function _saveToCart() {
    _harvest();
    if (typeof curSel !== 'undefined') {
      curSel.briefData  = Object.assign({}, _data);
      if (_data.designTier) curSel.designTier = _data.designTier;
    }
    close();
    if (typeof UI !== 'undefined') {
      if (typeof UI.renderForm   === 'function') UI.renderForm();
      if (typeof UI.renderFooter === 'function') UI.renderFooter();
    }
  }

  return {
    open, close, hasBrief,
    _go, _chip, _set, _pickProd, _pickTier,
    _sendWA, _sendEmail, _exportHTML, _printPDF,
    _saveToCart, _submitBrief, _generatePDF, _addBriefToCart,
    getPendingBriefRow: () => _pendingBriefRow,
    clearPendingBriefRow: () => { _pendingBriefRow = null; },
  };
})();
