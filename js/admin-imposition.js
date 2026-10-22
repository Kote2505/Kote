'use strict';

/* ════════════════════════════════════════════════════════
   admin-imposition.js -- Imposition preview + section builder
   Extracted from kote-admin.js (S6 split).
   Exposes: sheetSVG, DRAG_HANDLE_SVG, _delBtn, _addBtn,
            _sbInlineConfig
   Load order: after kote-core.js, before kote-admin.js
   ============================================================ */

/* ════════════════════════════════════════════════════════
   SHEET SVG  — imposition preview renderer (pure, returns string)
   ════════════════════════════════════════════════════════ */
function sheetSVG(fit, iW, iH, sh, opts = {}) {
  const SC = 98 / sh.w;
  const W  = Math.round(sh.w * SC), H = Math.round(sh.h * SC);
  const mg = sh.margin * SC, bl = sh.bleed * SC;
  const cW = fit.rotated ? (iH + sh.bleed*2)*SC : (iW + sh.bleed*2)*SC;
  const cH = fit.rotated ? (iW + sh.bleed*2)*SC : (iH + sh.bleed*2)*SC;
  const tW = cW - bl*2, tH = cH - bl*2;
  let pieces = '', folds = '', pages = '';

  for (let r = 0; r < fit.rows; r++) for (let col = 0; col < fit.cols; col++) {
    const x = mg + col*cW, y = mg + r*cH;
    const tx = x + bl, ty = y + bl;
    pieces += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cW.toFixed(1)}" height="${cH.toFixed(1)}" fill="#BFDBFE" rx=".5"/>`;
    pieces += `<rect x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" width="${tW.toFixed(1)}" height="${tH.toFixed(1)}" fill="#2563EB" rx=".3"/>`;

    if (opts.folds > 1) {
      const n = opts.folds, portrait = tH > tW;
      for (let f = 1; f < n; f++) {
        if (portrait) {
          const ly = (ty + f*tH/n).toFixed(1);
          folds += `<line x1="${tx.toFixed(1)}" y1="${ly}" x2="${(tx+tW).toFixed(1)}" y2="${ly}" stroke="rgba(255,255,255,.6)" stroke-width=".9" stroke-dasharray="2 1.4"/>`;
        } else {
          const lx = (tx + f*tW/n).toFixed(1);
          folds += `<line x1="${lx}" y1="${ty.toFixed(1)}" x2="${lx}" y2="${(ty+tH).toFixed(1)}" stroke="rgba(255,255,255,.6)" stroke-width=".9" stroke-dasharray="2 1.4"/>`;
        }
      }
    }

    if (opts.pageGrid) {
      const { cols: pc, rows: pr } = opts.pageGrid;
      const pw = tW/pc, ph = tH/pr;
      for (let pr2 = 0; pr2 < pr; pr2++) for (let pc2 = 0; pc2 < pc; pc2++) {
        const px = tx + pc2*pw, py = ty + pr2*ph;
        const fill = (pr2+pc2)%2===0 ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)';
        pages += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${(pw-.4).toFixed(1)}" height="${(ph-.4).toFixed(1)}" fill="${fill}" rx=".2"/>`;
        if (pw > 8 && ph > 6) {
          const pnum = r*fit.cols*pc*pr + col*pc*pr + pr2*pc + pc2 + 1;
          pages += `<text x="${(px+pw/2).toFixed(1)}" y="${(py+ph/2+1.5).toFixed(1)}" font-size="3" fill="rgba(255,255,255,.7)" text-anchor="middle" font-family="sans-serif">${pnum}</text>`;
        }
      }
      for (let pc2 = 1; pc2 < pc; pc2++) {
        const lx = (tx + pc2*pw).toFixed(1);
        pages += `<line x1="${lx}" y1="${ty.toFixed(1)}" x2="${lx}" y2="${(ty+tH).toFixed(1)}" stroke="rgba(255,255,255,.4)" stroke-width=".5"/>`;
      }
      for (let pr2 = 1; pr2 < pr; pr2++) {
        const ly = (ty + pr2*ph).toFixed(1);
        pages += `<line x1="${tx.toFixed(1)}" y1="${ly}" x2="${(tx+tW).toFixed(1)}" y2="${ly}" stroke="rgba(255,255,255,.4)" stroke-width=".5"/>`;
      }
    }
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;border-radius:3px;flex-shrink:0">
    <rect width="${W}" height="${H}" fill="#EEF2F7"/>
    <rect x="${mg.toFixed(1)}" y="${mg.toFixed(1)}" width="${(W-mg*2).toFixed(1)}" height="${(H-mg*2).toFixed(1)}" fill="white"/>
    ${pieces}${folds}${pages}</svg>`;
}

/* ════════════════════════════════════════════════════════
   ADMIN  — password guard + full configuration panel
   ════════════════════════════════════════════════════════ */
/* ── HTML builder helpers (use only IC global) ── */
const _delBtn = onclick => `<button class="adm-del-btn" onclick="${onclick}" title="Supprimer">${IC.trash}</button>`;
const _addBtn = (label, onclick) => `<button class="adm-add-btn" onclick="${onclick}">${IC.plus} ${label}</button>`;

/* ── Diamond default button ──
   field : cfg key to read/write ('default' | 'default_paper' | 'default_lam')
   val   : the option value this button represents
   curDef: the current cfg[field] value                                       */
const _dfBtn = (pi, ei, field, val, curDef) => {
  const on   = curDef === val;
  const vArg = typeof val === 'number' ? val : `'${val}'`;
  return `<button class="sb-default-btn${on ? ' on' : ''}"
    onclick="ADMIN.sbSetDefault(${pi},${ei},${vArg},'${field}')"
    title="${on ? 'Retirer la sélection par défaut' : 'Définir comme sélection par défaut'}">◆</button>`;
};

/* ═══════════════════════════════════════════════════════
   _sbInlineConfig — section builder config panels
   Hoisted outside ADMIN. Uses DB, IC, _delBtn, _addBtn (all global).
   ═══════════════════════════════════════════════════════ */
/* ── Shared drag-handle icon ── */
const DRAG_HANDLE_SVG = '<svg viewBox="0 0 10 16" width="9" height="14" fill="currentColor"><circle cx="2.5" cy="2" r="1.5"/><circle cx="7.5" cy="2" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="14" r="1.5"/><circle cx="7.5" cy="14" r="1.5"/></svg>';

function _sbInlineConfig(p, pi, entry, ei) {
  const tid = entry.type_id;
  const cfg = entry.config || {};
  const mk  = (field, val, label) => `<label class="adm-chk-lbl adm-chk-lbl--row">
    <input type="checkbox" ${val?'checked':''} onchange="ADMIN.sbToggleCfg(${pi},${ei},'${field}','${label}',this.checked)"> ${label}</label>`;

  switch(tid) {
    case 'size':
    case 'depl-format':
    case 'rollup-size': {
      const items = cfg.items || p.sizes || [];
      const cid   = `sz-list-${pi}-${ei}`;
      const rows  = items.map((s,i)=>`
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default', s.id, cfg.default)}
          <input class="adm-inp-lbl" style="width:70px" value="${s.label||''}" placeholder="Label"
            oninput="ADMIN.sbSizeLabel(${pi},${ei},${i},this.value)">
          <input type="number" class="adm-inp" style="width:44px" value="${s.w||''}" placeholder="W mm"
            oninput="ADMIN.sbSizeDim(${pi},${ei},${i},'w',+this.value)">
          <span class="adm-micro-lbl">×</span>
          <input type="number" class="adm-inp" style="width:44px" value="${s.h||''}" placeholder="H mm"
            oninput="ADMIN.sbSizeDim(${pi},${ei},${i},'h',+this.value)">
          <input type="number" class="adm-inp" style="width:44px" value="${s.cost_base||0}" placeholder="DH"
            oninput="ADMIN.sbSizeDim(${pi},${ei},${i},'cost_base',+this.value)">
          ${_delBtn(`ADMIN.sbRemoveSize(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Formats disponibles — ◆ défaut client (label, L×H mm, coût base)</div>
        <div id="${cid}">${rows}</div>
        ${_addBtn('Ajouter format',`ADMIN.sbAddSize(${pi},${ei})`)}
        <label class="adm-chk-lbl adm-chk-lbl--row-mt">
          <input type="checkbox" ${cfg.allow_custom?'checked':''}
            onchange="ADMIN.sbSetCfg(${pi},${ei},'allow_custom',this.checked)">
          Autoriser taille personnalisée (max A3)
        </label>
      </div>`;
    }

    case 'qty': {
      /* Quantity is excluded from the default-diamond feature intentionally */
      const items = cfg.items || p.quantities || [];
      const rows = items.map((q,i)=>`
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          <input type="number" class="adm-inp" value="${q}" min="1"
            oninput="ADMIN.sbQtyVal(${pi},${ei},${i},+this.value)">
          <span class="adm-dim-txt">ex.</span>
          ${_delBtn(`ADMIN.sbRemoveQty(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Paliers de quantité</div>
        ${rows}
        ${_addBtn('Ajouter quantité',`ADMIN.sbAddQty(${pi},${ei})`)}
      </div>`;
    }

    case 'cat-pages': {
      const items = cfg.items || p.page_options || [];
      const rows = items.map((n,i)=>`
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default', n, cfg.default)}
          <input type="number" class="adm-inp" value="${n}" min="4" step="4"
            oninput="ADMIN.sbQtyVal(${pi},${ei},${i},+this.value)">
          <span class="adm-dim-txt">pages</span>
          ${_delBtn(`ADMIN.sbRemoveQty(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Options de pages — ◆ défaut client</div>
        ${rows}
        ${_addBtn('Ajouter option',`ADMIN.sbAddQty(${pi},${ei})`)}
      </div>`;
    }

    case 'paper': {
      const allowed  = cfg.allowed  || [];
      const special  = cfg.special  || [];
      const rows = (DB.paper_stocks||[]).map((ps,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'papers',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default', ps.id, cfg.default)}
          <label class="adm-opt-lbl">${ps.label}${ps.special?' <span style="color:var(--pu);font-size:.55rem">★</span>':''}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${ps.id}',this.checked)"> Std</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${special.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'special','${ps.id}',this.checked)"> Spé</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client · Std · Spé</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    case 'cat-int': {
      const allowed = cfg.allowed || [];
      const lam     = cfg.lam || [];
      const paperRows = (DB.paper_stocks||[]).filter(ps=>!ps.special).map((ps,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default_paper', ps.id, cfg.default_paper)}
          <label class="adm-opt-lbl">${ps.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${ps.id}',this.checked)"> Intérieur</label>
        </div>`).join('');
      const lamRows = (DB.finishes||[]).filter(f=>f.id!=='none').map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'lam',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default_lam', f.id, cfg.default_lam)}
          <label class="adm-opt-lbl">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${lam.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'lam','${f.id}',this.checked)"> Pelliculage</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb3">Papiers intérieur — ◆ défaut</div>
        <div class="adm-checks">${paperRows}</div>
        <div class="adm-row-sub adm-row-sub--my">Pelliculages intérieur — ◆ défaut</div>
        <div class="adm-checks">${lamRows}</div>
      </div>`;
    }

    case 'cat-cov': {
      const allowed = cfg.allowed || [];
      const lam     = cfg.lam || [];
      const paperRows = (DB.paper_stocks||[]).map((ps,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default_paper', ps.id, cfg.default_paper)}
          <label class="adm-opt-lbl">${ps.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(ps.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${ps.id}',this.checked)"> Couverture</label>
        </div>`).join('');
      const lamRows = (DB.finishes||[]).filter(f=>f.id!=='none').map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'lam',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default_lam', f.id, cfg.default_lam)}
          <label class="adm-opt-lbl">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${lam.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'lam','${f.id}',this.checked)"> Pelliculage</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb3">Papiers couverture — ◆ défaut</div>
        <div class="adm-checks">${paperRows}</div>
        <div class="adm-row-sub adm-row-sub--my">Pelliculages couverture — ◆ défaut</div>
        <div class="adm-checks">${lamRows}</div>
      </div>`;
    }

    case 'lam': {
      const allowed = cfg.allowed || [];
      const rows = (DB.finishes||[]).filter(f=>f.id!=='none').map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default', f.id, cfg.default)}
          <label class="adm-opt-lbl">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)"> Activer</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb3">◆ défaut client · Activer</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    case 'addon': {
      const allowed   = cfg.allowed || [];
      const fdEnabled = !!cfg.fd_enabled;
      const rows = (DB.finishes_addon||[]).map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          <label class="adm-opt-lbl">${f.label} <span style="color:var(--t3);font-size:.58rem">${f.group}</span></label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)"> Activer</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-checks">${rows}</div>
        <div class="adm-sep-top">
          <div class="adm-row-sub adm-row-sub--hd">Forme de découpe</div>
          <label class="adm-chk-lbl adm-chk-lbl--row">
            <input type="checkbox" ${fdEnabled?'checked':''}
              onchange="ADMIN.sbSetCfg(${pi},${ei},'fd_enabled',this.checked)">
            Inclure Forme de découpe dans ce bloc
          </label>
        </div>
      </div>`;
    }

    case 'gf-material': {
      const mats = DB.gf_materials || [];
      if (!mats.length) return `<div class="sb-cfg-inner sb-cfg-inner--empty">Aucune matière — ajoutez-en dans Paramètres → Grand Format.</div>`;
      const allowed = cfg.allowed || mats.map(m=>m.id);
      const rows = mats.map(m=>`
        <div class="adm-check-row">
          ${_dfBtn(pi, ei, 'default', m.id, cfg.default)}
          <label class="adm-opt-lbl">
            ${m.label}
            <span class="adm-micro-lbl--ml">${m.cost_per_sqm||0} DH/m²${m.laize&&m.laize>1?' · laize '+m.laize+'m':''}</span>
          </label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(m.id)?'checked':''}
            onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${m.id}',this.checked)"> Afficher</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client · Matières visibles</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    case 'pancarte-support': {
      const mats = DB.pancarte_materials || [];
      if (!mats.length) return `<div class="sb-cfg-inner sb-cfg-inner--empty">Aucun support — ajoutez-en dans Paramètres → Pancarte.</div>`;
      const allowed = cfg.allowed || mats.map(m=>m.id);
      const rows = mats.map(m=>`
        <div class="adm-check-row">
          ${_dfBtn(pi, ei, 'default', m.id, cfg.default)}
          <label class="adm-opt-lbl">
            ${m.label}
            <span class="adm-micro-lbl--ml">${m.cost_per_sqm||0} DH/m²${m.desc?' · '+m.desc:''}</span>
          </label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(m.id)?'checked':''}
            onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${m.id}',this.checked)"> Afficher</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client · Supports visibles</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    case 'gf-options': {
      const allowed = cfg.allowed || [];
      const rows = (DB.gf_finishes||[]).map((f,i)=>`
        <div class="adm-check-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbLDragOver(event)"
          ondragleave="ADMIN.sbLDragLeave(event)"
          ondrop="ADMIN.sbLDrop(event,'allowed',${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbLDragStart(event,${i})"
            ondragend="ADMIN.sbLDragEnd(event)">
            ${DRAG_HANDLE_SVG}
          </span>
          ${_dfBtn(pi, ei, 'default', f.id, cfg.default)}
          <label class="adm-opt-lbl">${f.label}</label>
          <label class="adm-chk-lbl"><input type="checkbox" ${allowed.includes(f.id)?'checked':''} onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)"> Activer</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb3">◆ défaut client · Activer</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    /* ── ENV-SIZE: which formats to show ── */
    case 'env-size': {
      const fmts = DB.envelope_formats || [];
      if (!fmts.length) return `<div class="sb-cfg-inner sb-cfg-inner--empty">Aucun format — ajoutez-en dans Papiers → Enveloppes.</div>`;
      const allowed = cfg.allowed || fmts.map(f=>f.id);
      const rows = fmts.map(f=>`
        <div class="adm-check-row">
          ${_dfBtn(pi, ei, 'default', f.id, cfg.default)}
          <label class="adm-chk-lbl adm-chk-lbl--flex">
            <input type="checkbox" ${allowed.includes(f.id)?'checked':''}
              onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${f.id}',this.checked)">
            ${f.name}${f.w&&f.h?` <span class="adm-micro-lbl--6">${f.w}×${f.h} mm</span>`:''}
          </label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client · Formats visibles</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    /* ── ENV-SUPPORT: which types to show ── */
    case 'env-support': {
      const types = DB.envelope_types || [];
      if (!types.length) return `<div class="sb-cfg-inner sb-cfg-inner--empty">Aucun type — ajoutez-en dans Papiers → Enveloppes.</div>`;
      const allowed = cfg.allowed || types.map(t=>t.id);
      const rows = types.map(t=>`
        <div class="adm-check-row">
          ${_dfBtn(pi, ei, 'default', t.id, cfg.default)}
          <label class="adm-chk-lbl adm-chk-lbl--flex">
            <input type="checkbox" ${allowed.includes(t.id)?'checked':''}
              onchange="ADMIN.sbTogglePaper(${pi},${ei},'allowed','${t.id}',this.checked)">
            ${t.name}
          </label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client · Types disponibles</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    /* ── ENV-OFFSET-COLORS: threshold override ── */
    case 'env-offset-colors': {
      const thresh = cfg.threshold ?? 500;
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Seuil minimum pour l'offset (pcs)</div>
        <div class="adm-inp-row">
          <input type="number" class="adm-inp" style="width:80px" value="${thresh}" min="1" step="1"
            oninput="ADMIN.sbSetCfg(${pi},${ei},'threshold',+this.value)">
          <span class="adm-dim-txt">pcs minimum</span>
        </div>
      </div>`;
    }

    case 'design-file': {
      // Always tier model — no switcher, no prices
      const tiers = cfg.tiers || [
        { id:'basic',   label:'Basic',   desc:'Mise en page soignée'       },
        { id:'pro',     label:'Pro',     desc:'Design créatif + retouches' },
        { id:'premium', label:'Premium', desc:'Premium · déclinaisons'     },
      ];
      const modelCfg = tiers.map((t, i) =>
        `<div class="adm-size-row adm-size-row--g3">
          <input class="adm-inp-lbl" style="width:76px" value="${(t.label||'').replace(/"/g,'&quot;')}"
            placeholder="Label" oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'label',this.value)">
          <input class="adm-inp-lbl" style="flex:1;min-width:100px" value="${(t.desc||'').replace(/"/g,'&quot;')}"
            placeholder="Description" oninput="ADMIN.setDesignSectionTier(${pi},${ei},${i},'desc',this.value)">
        </div>`
      ).join('');

      // Brief template dropdown — lists all products for mapping
      const tplId   = cfg.brief_template || '';
      const prodOpts = (typeof DB !== 'undefined' ? (DB.products || []) : [])
        .filter(p => p.id !== 'briefing' && p.product_type !== 'conception')
        .map(p => `<option value="${p.id}"${tplId === p.id ? ' selected' : ''}>${p.name}</option>`)
        .join('');

      return `<div class="sb-cfg-inner">
        <div style="font-size:.6rem;font-weight:700;color:var(--t3);text-transform:uppercase;
          letter-spacing:.6px;margin-bottom:.4rem">Niveaux de conception</div>
        ${modelCfg}
        <div class="adm-sep-top">
          <div class="adm-row-sub adm-row-sub--hd3">Modèle de brief créatif</div>
          <select class="adm-inp-lbl adm-select--full"
            onchange="ADMIN.sbSetCfg(${pi},${ei},'brief_template',this.value)">
            <option value="">Auto — selon le produit</option>
            ${prodOpts}
          </select>
          <div class="adm-brief-hint">
            Associe le formulaire brief d'un produit similaire à ce nouveau produit.
          </div>
        </div>
      </div>`;
    }

    case 'carnet-pages': {
      const items = cfg.items?.length ? cfg.items : [25, 50, 100];
      const rows = items.map((n, i) => `
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">${DRAG_HANDLE_SVG}</span>
          ${_dfBtn(pi, ei, 'default', n, cfg.default)}
          <input type="number" class="adm-inp" style="width:68px" value="${n}" min="1" step="1"
            oninput="ADMIN.sbQtyVal(${pi},${ei},${i},+this.value)">
          <span class="adm-dim-txt">feuillets</span>
          ${_delBtn(`ADMIN.sbRemoveQty(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Options feuillets — ◆ défaut client</div>
        ${rows}
        ${_addBtn('Ajouter option', `ADMIN.sbAddQty(${pi},${ei})`)}
      </div>`;
    }

    case 'carnet-souches': {
      const items = cfg.items?.length ? cfg.items : [2, 3, 4, 5];
      const rows = items.map((n, i) => `
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">${DRAG_HANDLE_SVG}</span>
          ${_dfBtn(pi, ei, 'default', n, cfg.default)}
          <input type="number" class="adm-inp" style="width:48px" value="${n}" min="2" max="5" step="1"
            oninput="(function(){const a=ADMIN.sbGetCfg(${pi},${ei},'items')||[2,3,4,5];a[${i}]=+this.value;ADMIN.sbSetCfg(${pi},${ei},'items',a)}).call(this)">
          <span class="adm-dim-txt">souche${n > 1 ? 's' : ''}</span>
          ${_delBtn(`(function(){const a=ADMIN.sbGetCfg(${pi},${ei},'items')||[];a.splice(${i},1);ADMIN.sbSetCfg(${pi},${ei},'items',a);ADMIN._renderTab('products')})()`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Options souches — ◆ défaut client</div>
        ${rows}
        ${_addBtn('Ajouter option', `(function(){const a=ADMIN.sbGetCfg(${pi},${ei},'items')||[2,3,4,5];a.push(Math.min((a[a.length-1]||2)+1,5));ADMIN.sbSetCfg(${pi},${ei},'items',a);ADMIN._renderTab('products')})()`)}
      </div>`;
    }

    case 'carnet-options': {
      const colorOpts = cfg.color_options?.length ? cfg.color_options : [1, 2, 3, 4];
      const colorRows = colorOpts.map((n, i) => `
        <div class="adm-size-row sz-draggable" data-i="${i}"
          ondragover="ADMIN.sbDragOver(event)"
          ondragleave="ADMIN.sbDragLeave(event)"
          ondrop="ADMIN.sbDrop(event,${pi},${ei},${i})">
          <span class="sz-drag-handle" draggable="true" title="Réordonner"
            ondragstart="ADMIN.sbDragStart(event,${pi},${ei},${i})"
            ondragend="ADMIN.sbDragEnd(event)">${DRAG_HANDLE_SVG}</span>
          ${_dfBtn(pi, ei, 'default_color', n, cfg.default_color)}
          <input type="number" class="adm-inp" style="width:48px" value="${n}" min="1" max="4" step="1"
            oninput="(function(){const a=ADMIN.sbGetCfg(${pi},${ei},'color_options')||[1,2,3,4];a[${i}]=+this.value;ADMIN.sbSetCfg(${pi},${ei},'color_options',a)}).call(this)">
          <span class="adm-dim-txt">couleur${n > 1 ? 's' : ''}</span>
          ${_delBtn(`(function(){const a=ADMIN.sbGetCfg(${pi},${ei},'color_options')||[];a.splice(${i},1);ADMIN.sbSetCfg(${pi},${ei},'color_options',a);ADMIN._renderTab('products')})()`)}
        </div>`).join('');
      const _optToggle = (field, dfltField, label) => {
        const shown  = cfg[field] !== false;
        const isDflt = cfg[dfltField] === true;
        return `<div class="adm-check-row">
          <button class="sb-default-btn${isDflt ? ' on' : ''}"
            onclick="ADMIN.sbSetCfg(${pi},${ei},'${dfltField}',${!isDflt});ADMIN._renderTab('products')"
            title="${isDflt ? 'Retirer le défaut' : 'Activer par défaut'}">◆</button>
          <label class="adm-opt-chk-row--flex">
            <input type="checkbox" ${shown ? 'checked' : ''}
              onchange="ADMIN.sbSetCfg(${pi},${ei},'${field}',this.checked);ADMIN._renderTab('products')">
            <span class="adm-opt-val">${label}</span>
          </label>
        </div>`;
      };
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Couleurs offset — ◆ défaut client</div>
        ${colorRows}
        ${_addBtn('Ajouter option', `(function(){const a=ADMIN.sbGetCfg(${pi},${ei},'color_options')||[1,2,3,4];a.push(a.length+1);ADMIN.sbSetCfg(${pi},${ei},'color_options',a);ADMIN._renderTab('products')})()`)}
        <div class="adm-row-sub adm-row-sub--my2">Options visibles · ◆ activé par défaut</div>
        ${_optToggle('show_numero', 'default_numero', 'Numérotation')}
        ${_optToggle('show_perfo',  'default_perfo',  'Perforage')}
        ${_optToggle('show_cover',  'default_cover',  'Couverture imprimée')}
      </div>`;
    }

    case 'sides': {
      const hasSingle = cfg.single !== false;
      const hasDouble = cfg.double !== false;
      /* Each row shows both the visibility toggle AND the diamond default button */
      const _tog = (visField, visLabel, visVal, defVal) =>
        `<div class="adm-opt-row">
          ${_dfBtn(pi, ei, 'default', defVal, cfg.default)}
          <label class="adm-opt-chk-row">
            <input type="checkbox" ${visVal ? 'checked' : ''}
              onchange="ADMIN.sbSetCfg(${pi},${ei},'${visField}',this.checked);ADMIN._renderTab('products')">
            <span class="adm-opt-val">${visLabel}</span>
          </label>
        </div>`;
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client · Options visibles</div>
        ${_tog('single', 'Recto',        hasSingle, 'single')}
        ${_tog('double', 'Recto-Verso',  hasDouble, 'double')}
      </div>`;
    }

    case 'sac-format': {
      if (!cfg.presets) cfg.presets = [
        { label:'Petit',  l:240, h:320, souf:80  },
        { label:'Moyen',  l:320, h:420, souf:100 },
        { label:'Grand',  l:380, h:480, souf:120 },
      ];
      const presets = cfg.presets;
      const PLANCHE_OPTS = (DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}])
        .map(pl => `<option value="${pl.id}"${(cfg.planche_id||'A3+')===pl.id?' selected':''}>${pl.id}  ${pl.w}×${pl.h}mm</option>`).join('');
      const presetRows = presets.map((pr, i) => `
        <div class="adm-size-row adm-size-row--g35">
          ${_dfBtn(pi, ei, 'default', i, cfg.default)}
          <input class="adm-inp-lbl" style="width:64px" value="${pr.label||''}" placeholder="Label"
            oninput="ADMIN.sbSacPreset(${pi},${ei},${i},'label',this.value)">
          <span class="adm-micro-lbl">L</span>
          <input type="number" class="adm-inp" style="width:48px" value="${pr.l||''}" placeholder="320"
            oninput="ADMIN.sbSacPreset(${pi},${ei},${i},'l',+this.value)">
          <span class="adm-micro-lbl">H</span>
          <input type="number" class="adm-inp" style="width:48px" value="${pr.h||''}" placeholder="420"
            oninput="ADMIN.sbSacPreset(${pi},${ei},${i},'h',+this.value)">
          <span class="adm-micro-lbl">S</span>
          <input type="number" class="adm-inp" style="width:48px" value="${pr.souf||''}" placeholder="100"
            oninput="ADMIN.sbSacPreset(${pi},${ei},${i},'souf',+this.value)">
          ${_delBtn(`ADMIN.sbSacRemovePreset(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Planche d'impression</div>
        <select class="adm-inp-lbl adm-select--full"
          onchange="ADMIN.sbSetCfg(${pi},${ei},'planche_id',this.value);ADMIN.set('products.${pi}.planche_id',this.value)">
          ${PLANCHE_OPTS}
        </select>
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut · Présets (Label · L × H × Soufflet mm)</div>
        ${presetRows}
        ${_addBtn('Ajouter préset', `ADMIN.sbSacAddPreset(${pi},${ei})`)}
      </div>`;
    }

    case 'boite-format': {
      if (!cfg.presets) cfg.presets = [
        { label:'Petite',  l:150, h:100, prof:50  },
        { label:'Moyenne', l:250, h:150, prof:80  },
        { label:'Grande',  l:350, h:200, prof:100 },
      ];
      const presets = cfg.presets;
      const PLANCHE_OPTS = (DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}])
        .map(pl => `<option value="${pl.id}"${(cfg.planche_id||'A3+')===pl.id?' selected':''}>${pl.id}  ${pl.w}×${pl.h}mm</option>`).join('');
      const presetRows = presets.map((pr, i) => `
        <div class="adm-size-row adm-size-row--g35">
          ${_dfBtn(pi, ei, 'default', i, cfg.default)}
          <input class="adm-inp-lbl" style="width:64px" value="${pr.label||''}" placeholder="Label"
            oninput="ADMIN.sbBoitePreset(${pi},${ei},${i},'label',this.value)">
          <span class="adm-micro-lbl">L</span>
          <input type="number" class="adm-inp" style="width:48px" value="${pr.l||''}" placeholder="250"
            oninput="ADMIN.sbBoitePreset(${pi},${ei},${i},'l',+this.value)">
          <span class="adm-micro-lbl">H</span>
          <input type="number" class="adm-inp" style="width:48px" value="${pr.h||''}" placeholder="150"
            oninput="ADMIN.sbBoitePreset(${pi},${ei},${i},'h',+this.value)">
          <span class="adm-micro-lbl">P</span>
          <input type="number" class="adm-inp" style="width:48px" value="${pr.prof||''}" placeholder="80"
            oninput="ADMIN.sbBoitePreset(${pi},${ei},${i},'prof',+this.value)">
          ${_delBtn(`ADMIN.sbBoiteRemovePreset(${pi},${ei},${i})`)}
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">Planche d'impression</div>
        <select class="adm-inp-lbl adm-select--full"
          onchange="ADMIN.sbSetCfg(${pi},${ei},'planche_id',this.value);ADMIN.set('products.${pi}.planche_id',this.value)">
          ${PLANCHE_OPTS}
        </select>
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut · Présets (Label · L × H × Profondeur mm)</div>
        ${presetRows}
        ${_addBtn('Ajouter préset', `ADMIN.sbBoiteAddPreset(${pi},${ei})`)}
      </div>`;
    }

    case 'cat-bind': {
      const opts = DB.binding_options || [];
      if (!opts.length) return `<div class="sb-cfg-inner sb-cfg-inner--empty">Aucune option — ajoutez-en dans Paramètres → Reliure.</div>`;
      const rows = opts.map(opt => `
        <div class="adm-check-row">
          ${_dfBtn(pi, ei, 'default', opt.id, cfg.default)}
          <label class="adm-opt-lbl">${opt.label}${opt.desc ? ` <span class="adm-micro-lbl--6">${opt.desc}</span>` : ''}</label>
        </div>`).join('');
      return `<div class="sb-cfg-inner">
        <div class="adm-row-sub adm-row-sub--mb">◆ défaut client suggéré</div>
        <div class="adm-checks">${rows}</div>
      </div>`;
    }

    default:
      return `<div class="sb-cfg-inner sb-cfg-inner--empty">Pas de configuration pour ce module.</div>`;
  }
}
