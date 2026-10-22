'use strict';

/* ════════════════════════════════════════════════════════
   admin-materials.js — Settings tab renderers (materials/pricing)
   Extracted from kote-admin.js (S6 split).
   Exposes file-scope: _svg, _card, _cardAct, _row, _row3,
     _numInp, _pctInp, _txtInp, _sec, _pageHdr,
     _bPricing, _bPapers, _bGFMat,
     _bPancarteMat, _bGadgetsMat, _bFinishes, _bAddons,
     _bGF, _bCarnet, _bBinding, _bConception
   Requires: kote-core.js (DB, IC), admin-imposition.js (_delBtn, _addBtn)
   Load order: after admin-imposition.js, before kote-admin.js
   ════════════════════════════════════════════════════════ */

/* ══ BUILDER HELPERS ══ */
const _svg = (d,sw=1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" style="width:12px;height:12px">${d}</svg>`;

// Card with new header design
const _card = (title, iconPath, content, full=false) => `
  <div class="adm-card${full?' adm-card-full':''}">
    <div class="adm-card-hdr">
      <div class="adm-card-hdr-l">
        <div class="adm-card-hdr-ico">${_svg(iconPath)}</div>
        <div><div class="adm-card-title">${title}</div></div>
      </div>
    </div>
    <div class="adm-rows">${content}</div>
  </div>`;

// Card with right-side action
const _cardAct = (title, iconPath, action, content, full=false) => `
  <div class="adm-card${full?' adm-card-full':''}">
    <div class="adm-card-hdr">
      <div class="adm-card-hdr-l">
        <div class="adm-card-hdr-ico">${_svg(iconPath)}</div>
        <div><div class="adm-card-title">${title}</div></div>
      </div>
      ${action}
    </div>
    <div class="adm-rows">${content}</div>
  </div>`;

const _row = (label, sub, inp) => `
  <div class="adm-row">
    <div><div class="adm-row-label">${label}</div>${sub?`<div class="adm-row-sub">${sub}</div>`:''}</div>
    ${inp}
  </div>`;

const _row3 = (a,b,c) => `<div class="adm-row-3">${a}${b}${c}</div>`;

const _numInp = (path, val, unit='DH', step='0.01') =>
  `<div class="adm-num-wrap"><input type="number" class="adm-inp" step="${step}" min="0" value="${+val||0}" oninput="ADMIN.set('${path}',+this.value)"><span class="adm-num-unit">${unit}</span></div>`;

const _pctInp = (path, val) =>
  `<div class="adm-num-wrap"><input type="number" class="adm-inp" step="1" min="0" max="100" value="${Math.round((+val||0)*100)}" oninput="ADMIN.set('${path}',+this.value/100)"><span class="adm-num-unit">%</span></div>`;

const _txtInp = (path, val, w='130px') =>
  `<input class="adm-inp-lbl" style="width:${w}" value="${(val||'').replace(/"/g,'&quot;')}" placeholder="Label" oninput="ADMIN.set('${path}',this.value)">`;

const _sec = (title, content) => `
  <div class="adm-sec-title">${title}</div>${content}`;

// Page header helper
const _pageHdr = (title, sub, action='') => `
  <div class="adm-page-hdr">
    <div><div class="adm-page-title">${title}</div>${sub?`<div class="adm-page-sub">${sub}</div>`:''}</div>
    ${action}
  </div>`;

/* ══ TAB BUILDERS ══ */


function _bPricing() {
  const p   = DB.pricing  || {};
  const sh  = DB.sheet    || {};
  const profiles = DB.offset_profiles || [];
  const planches = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
  const lams      = (DB.finishes     ||[]).filter(f=>f.id!=='none');
  const addons    =  DB.finishes_addon||[];
  const gfFins    =  DB.gf_finishes  ||[];
  const bindings  =  DB.binding_options||[];
  const gfMats    =  DB.gf_materials ||[];
  const ruSups    =  DB.rollup_supports||[];
  const carnetProd= (DB.products||[]).find(p=>(p.calc_engine==='carnet')||p.product_type==='carnet');
  const carnetPi  = carnetProd ? DB.products.indexOf(carnetProd) : -1;
  const cp        = carnetProd?.carnet_pricing||{};

  const togRow = (val,path,lbl,sub) => `<div class="adm-toggle-row">
    <div class="adm-toggle-lbl-wrap"><div class="adm-toggle-lbl">${lbl}</div>${sub?`<div class="adm-toggle-sub">${sub}</div>`:''}
    </div><label class="tog${val?' on':''}" onclick="this.classList.toggle('on');ADMIN.set('${path}',this.classList.contains('on'));ADMIN._renderTab('pricing')"></label>
  </div>`;

  /* ── Offset: selected profile index ── */
  const _opi = Math.min(p._offset_edit_idx || 0, profiles.length - 1);
  const _op  = profiles[_opi] || {};
  const _opfx = `offset_profiles.${_opi}`;
  const _opMode = _op.mode || 'detailed';

  return `
    ${_pageHdr('Tarifs & Marges','Tous les coûts de production, finitions et marges')}

    <!-- MARGE GLOBALE -->
    <div class="adm-hero-card">
      <div>
        <div class="adm-hero-lbl">Marge bénéficiaire globale</div>
        <div class="adm-hero-val" id="heroMarginVal">${Math.round((+p.profit_margin||0)*100)}%</div>
        <div class="adm-hero-sub">Appliquée à tous les produits du catalogue</div>
      </div>
      <div class="adm-hero-inp-wrap">
        <input type="number" class="adm-hero-inp" id="heroMarginInp" step="1" min="0" max="100"
          value="${Math.round((+p.profit_margin||0)*100)}"
          oninput="ADMIN.set('pricing.profit_margin',+this.value/100);document.getElementById('heroMarginVal').textContent=this.value+'%'">
        <span class="adm-hero-unit">%</span>
      </div>
    </div>

    <!-- ROW 1: OFFSET (single card with profile selector) -->
    <div class="adm-grid adm-grid-1">
      <div class="adm-card adm-card-full">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>')}</div>
            <div class="adm-card-title">Offset</div>
          </div>
          <div class="adm-offset-hdr">
            <select style="font-size:.65rem;font-weight:700;padding:4px 10px;border:1.5px solid var(--bd);
              border-radius:7px;background:var(--sf);color:var(--t1);cursor:pointer;min-width:140px"
              onchange="ADMIN.set('pricing._offset_edit_idx',+this.value);ADMIN._renderTab('pricing')">
              ${profiles.map((pr,i) =>
                `<option value="${i}"${i===_opi?' selected':''}>${pr.label || 'Profil '+(i+1)}</option>`
              ).join('')}
            </select>
            <button class="adm-action-btn adm-offset-add" onclick="ADMIN.addOffsetProfile()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:10px;height:10px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ajouter
            </button>
            ${_opi > 0 ? `<button class="adm-action-btn danger adm-offset-del" title="Supprimer ce profil" onclick="ADMIN.removeOffsetProfile(${_opi})">✕</button>` : ''}
          </div>
        </div>

        <!-- Profile meta -->
        <div class="adm-mat-hdr">
          <div class="adm-mat-hdr-l">
            <span class="adm-mat-lbl">Nom :</span>
            <input style="font-size:.72rem;font-weight:700;border:1.5px solid var(--bd);border-radius:6px;
              background:var(--sf);color:var(--t1);padding:3px 8px;width:180px;font-family:inherit;outline:none"
              value="${_op.label||'Profil '+(_opi+1)}"
              onchange="ADMIN.set('${_opfx}.label',this.value);ADMIN._renderTab('pricing')">
            <span class="adm-mat-id">${_op.id||'default'}</span>
          </div>
          <div class="adm-mat-hdr-r">
            <span class="adm-mat-lbl">Mode :</span>
            <div class="adm-mat-seg">
              ${['detailed','planche'].map(m =>
                `<button style="padding:3px 12px;font-size:.62rem;font-weight:600;border:none;cursor:pointer;
                  background:${_opMode===m?'var(--bl)':'transparent'};color:${_opMode===m?'#fff':'var(--t2)'}"
                  onclick="ADMIN.set('${_opfx}.mode','${m}');ADMIN._renderTab('pricing')">${m==='detailed'?'Détaillé':'Planche'}</button>`
              ).join('')}
            </div>
          </div>
        </div>

        <!-- Profile fields -->
        <div class="adm-rows">
          ${togRow(_op.enabled!==false,_opfx+'.enabled','Activer','Proposer l\'offset pour ce profil')}
          ${_row('Seuil feuilles','déclenchement suggestion',_numInp(_opfx+'.min_sheets',_op.min_sheets||1000,'f.','1'))}
          ${_opMode==='detailed' ? `
            ${_row('Calage','frais fixes par job',_numInp(_opfx+'.setup_cost',_op.setup_cost||0,'DH','1'))}
            ${_row('Plaques','coût × nb couleurs',_numInp(_opfx+'.cost_per_plate',_op.cost_per_plate||0,'DH','1'))}
            ${_row('Recto','DH par feuille',_numInp(_opfx+'.print_single',_op.print_single||1.5))}
            ${_row('Recto-Verso','DH par feuille',_numInp(_opfx+'.print_double',_op.print_double||2))}
          ` : `
            ${_row('Recto','DH par planche',_numInp(_opfx+'.planche_recto',_op.planche_recto||6))}
            ${_row('Recto-Verso','DH par planche',_numInp(_opfx+'.planche_rv',_op.planche_rv||7))}
          `}
          <!-- Carnet NCR costs — shown on every profile, used only when calc_engine=carnet -->
          <div class="adm-mat-field-lbl" style="padding:.3rem .85rem .1rem;border-top:1px solid var(--bd);font-size:.58rem;
            text-transform:uppercase;letter-spacing:.6px;color:var(--t3);margin-top:.2rem">
            Carnet NCR — coûts (si profil utilisé par un carnet)
          </div>
          ${[2,3,4,5].map(n => {
            const labels = {2:'2 souches (B+J)',3:'3 souches (B+J+R)',4:'4 souches (B+J+R+V)',5:'5 souches'};
            const val = (_op.ncr_cost_per_set||{})[String(n)] ?? '';
            return _row(labels[n],'DH/set NCR',
              `<div class="adm-num-wrap"><input type="number" class="adm-inp" style="width:72px"
                value="${val}" step="0.01" min="0" placeholder="0.00"
                oninput="ADMIN.setNcrCost(${_opi},${n},+this.value)">
               <span class="adm-num-unit">DH</span></div>`);
          }).join('')}
          ${_row('Agrafage','DH/carnet',_numInp(_opfx+'.stapling_cost_per_carnet',_op.stapling_cost_per_carnet||0))}
          ${_row('Numérotation','DH/carnet',_numInp(_opfx+'.numbering_cost_per_carnet',_op.numbering_cost_per_carnet||0))}
          ${_row('Perforage','DH/carnet',_numInp(_opfx+'.perforation_cost_per_carnet',_op.perforation_cost_per_carnet||0))}
          ${_row('Couverture','DH/f. presse',_numInp(_opfx+'.cover_print_cost_per_sheet',_op.cover_print_cost_per_sheet||0))}
        </div>
      </div>
    </div>

    <!-- ROW 2: PLANCHES + PRESSE -->
    <div class="adm-grid adm-grid--mt">
      <div class="adm-card adm-card-full">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>')}</div>
            <div class="adm-card-title">Formats de planche & Feuille de presse</div></div>
        </div>
        <div class="adm-mat-grid2">
          <div class="adm-mat-col-l">
            <div class="adm-mat-field-lbl">Formats disponibles</div>
            ${planches.map((pl,i)=>`
              <div class="adm-mat-item-row">
                <span class="adm-mat-id-cell">${pl.id}</span>
                ${_numInp(`planches.${i}.w`,pl.w,'mm L')}
                <span class="adm-mat-x">×</span>
                ${_numInp(`planches.${i}.h`,pl.h,'mm H')}
              </div>`).join('')}
            <div style="padding:.4rem 0"><button class="adm-action-btn" onclick="ADMIN.addPlanche()">${IC.plus} Ajouter format</button></div>
          </div>
          <div class="adm-mat-col-r">
            <div class="adm-mat-field-lbl">Paramètres globaux</div>
            ${_row('Marge presse','mm — tous formats',_numInp('sheet.margin',sh.margin,'mm','0.5'))}
            ${_row('Fond perdu','mm — tous formats',_numInp('sheet.bleed',sh.bleed,'mm','0.5'))}
          </div>
        </div>
      </div>
    </div>

    <!-- ROW 3: GRAND FORMAT + CARNET NCR -->
    <div class="adm-grid adm-grid--mt">
      <!-- MATIÈRES GRAND FORMAT -->
      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>')}</div>
            <div><div class="adm-card-title">Grand Format — matières</div>
            <div class="adm-card-sub">Bâche, vinyle, oneway, papier, duratrans, regulus…</div></div></div>
          <button class="adm-action-btn" onclick="ADMIN.addGfMat()">${IC.plus} Ajouter</button>
        </div>
        <div class="adm-rows">
          ${gfMats.length ? gfMats.map((m,i)=>_row3(
            `<div>${_txtInp(`gf_materials.${i}.label`,m.label)}<div class="adm-row-sub">${m.id}</div></div>`,
            `<div class="d-flex-g3">${_numInp(`gf_materials.${i}.cost_per_sqm`,m.cost_per_sqm||0,'DH/m²')}${_numInp(`gf_materials.${i}.laize`,m.laize||1,'m laize','0.1')}</div>`,
            _delBtn(`ADMIN.removeGfMat(${i})`)
          )).join('') : `<div class="adm-empty adm-empty--sm">Aucune matière — ajoutez-en une</div>`}
        </div>
        <div class="adm-rows">
          <div class="adm-mat-field-lbl" style="padding:.35rem .85rem .1rem">Finitions GF (oeillets, lam, contrecollage…)</div>
          ${gfFins.map((f,i)=>`
            <div style="display:flex;align-items:center;gap:.5rem;padding:.25rem .85rem;border-bottom:1px solid var(--bd)">
              <div style="flex:1;font-size:.7rem;color:var(--t1)">${f.label}</div>
              ${f.cost_per_sqm!=null?_numInp(`gf_finishes.${i}.cost_per_sqm`,f.cost_per_sqm,'DH/m²'):_numInp(`gf_finishes.${i}.cost_flat`,f.cost_flat,'DH/ex','1')}
              ${_delBtn(`ADMIN.removeGfFinish(${i})`)}
            </div>`).join('')}
          <div style="padding:.35rem .85rem"><button class="adm-action-btn" onclick="ADMIN.addGfFinish()">${IC.plus} Finition GF</button></div>
        </div>
      </div>

      <!-- SUPPORTS ROLL-UP / X-BANNER + CARNET -->
      <div class="adm-col-rows">
        <div class="adm-card">
          <div class="adm-card-hdr">
            <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M12 2v20M2 12h20"/>')}</div>
              <div><div class="adm-card-title">Supports Roll-up / X-banner</div>
              <div class="adm-card-sub">Mécanismes — prix par unité</div></div></div>
            <button class="adm-action-btn" onclick="ADMIN.addRuSupport()">${IC.plus} Ajouter</button>
          </div>
          <div class="adm-rows">
            ${ruSups.length ? ruSups.map((s,i)=>_row3(
              `<div>${_txtInp(`rollup_supports.${i}.label`,s.label)}<div class="adm-row-sub">${s.id}</div></div>`,
              _numInp(`rollup_supports.${i}.cost`,s.cost||0,'DH'),
              _delBtn(`ADMIN.removeRuSupport(${i})`)
            )).join('') : `<div class="adm-empty adm-empty--p75">Aucun support</div>`}
          </div>
        </div>

        ${carnetProd ? `
        <div class="adm-card">
          <div class="adm-card-hdr"><div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>')}</div>
            <div class="adm-card-title">Carnet NCR</div></div></div>
          <div class="adm-rows">
            <div class="adm-row adm-row--wrap">
              <div class="adm-tab-flex1"><div class="adm-row-lbl">Papier presse (A3+)</div><div class="adm-row-sub">Feuille offset utilisée — coût/feuille pris du tab Papiers</div></div>
              <select class="adm-inp-lbl" style="width:180px"
                onchange="ADMIN.set('products.${carnetPi}.carnet_pricing.ncr_paper_id',this.value)">
                <option value="">— Aucun (coût papier ignoré)</option>
                ${(DB.paper_stocks||[]).map(ps =>
                  `<option value="${ps.id}"${(cp.ncr_paper_id||'')=== ps.id?' selected':''}>${ps.label||ps.id} · ${ps.cost_per_sheet||0} DH/f</option>`
                ).join('')}
              </select>
            </div>
            ${[2,3,4,5].map(n=>{const labels={2:'2s (B+J)',3:'3s (B+J+R)',4:'4s (B+J+R+V)',5:'5 souches'};return _row(labels[n],'DH/set',_numInp(`products.${carnetPi}.carnet_pricing.ncr_cost_per_set.${n}`,(cp.ncr_cost_per_set||{})[String(n)]||0,'DH'));}).join('')}
            <div class="adm-sep-h2"></div>
            ${_row('Couverture','DH/f. presse',_numInp(`products.${carnetPi}.carnet_pricing.cover_print_cost_per_sheet`,cp.cover_print_cost_per_sheet||0))}
            ${_row('Agrafage','par carnet',_numInp(`products.${carnetPi}.carnet_pricing.stapling_cost_per_carnet`,cp.stapling_cost_per_carnet||0))}
            ${_row('Numérotation','par carnet',_numInp(`products.${carnetPi}.carnet_pricing.numbering_cost_per_carnet`,cp.numbering_cost_per_carnet||0))}
            ${_row('Perforage','par carnet',_numInp(`products.${carnetPi}.carnet_pricing.perforation_cost_per_carnet`,cp.perforation_cost_per_carnet||0))}
          </div>
        </div>` : ''}
      </div>
    </div>

    <!-- ROW 4: FAÇONNAGE & FINITIONS -->
    <div class="adm-grid adm-grid--mt">
      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>')}</div>
            <div class="adm-card-title">Pelliculage</div></div>
          <button class="adm-action-btn" onclick="ADMIN.addLam()">${IC.plus} Ajouter</button>
        </div>
        <div class="adm-rows">
          ${lams.map(f=>{const i=DB.finishes.indexOf(f);return _row3(
            `<div>${_txtInp(`finishes.${i}.label`,f.label)}<div class="adm-row-sub">${f.id}${f.per_side?' · par face':''}</div></div>`,
            _numInp(`finishes.${i}.cost_ps`,f.cost_ps,'DH/f'),
            _delBtn(`ADMIN.removeLam(${i})`)
          );}).join('')||`<div class="adm-empty adm-empty--sm">Aucun pelliculage</div>`}
        </div>
      </div>

      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>')}</div>
            <div class="adm-card-title">Finitions spéciales</div></div>
          <button class="adm-action-btn" onclick="ADMIN.addAddon()">${IC.plus} Ajouter</button>
        </div>
        <div class="adm-rows">
          ${addons.map((f,i)=>{
            let inp='';
            if      (f.pricing_model==='setup_sheet') inp=`<div class="d-flex-g3">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup,'DH fix')}${_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f')}</div>`;
            else if (f.pricing_model==='per_sheet')   inp=_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f');
            else if (f.pricing_model==='per_unit')    inp=`<div class="d-flex-g3">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup||0,'DH fix')}${_numInp(`finishes_addon.${i}.cost_pu`,f.cost_pu||0,'DH/u','0.01')}</div>`;
            return _row3(`<div>${_txtInp(`finishes_addon.${i}.label`,f.label)}<div class="adm-row-sub">${f.pricing_model} · ${f.group||''}</div></div>`,inp,_delBtn(`ADMIN.removeAddon(${i})`));
          }).join('')||`<div class="adm-empty adm-empty--sm">Aucune finition</div>`}
          <div class="adm-sep-h"></div>
          ${_row('Frais de coupe','par commande numérique',_numInp('pricing.cutting_fee',p.cutting_fee||60,'DH','1'))}
        </div>
      </div>

      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l"><div class="adm-card-hdr-ico">${_svg('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>')}</div>
            <div class="adm-card-title">Reliures</div></div>
          <button class="adm-action-btn" onclick="ADMIN.addBinding()">${IC.plus} Ajouter</button>
        </div>
        <div class="adm-rows">
          ${bindings.map((b,i)=>_row3(
            `<div>${_txtInp(`binding_options.${i}.label`,b.label)}<div class="adm-row-sub">${b.id}</div></div>`,
            `<div class="d-flex-g3">${_numInp(`binding_options.${i}.cost_flat`,b.cost_flat,'DH fix','1')}${_numInp(`binding_options.${i}.cost_per_copy`,b.cost_per_copy,'DH/ex')}</div>`,
            _delBtn(`ADMIN.removeBinding(${i})`)
          )).join('')||`<div class="adm-empty adm-empty--sm">Aucune reliure</div>`}
        </div>
      </div>
    </div>

    <!-- ROW 5: REMISES VOLUME -->
    <div class="adm-grid adm-grid--mt">
      ${_card('Remises volume','<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>',
        (p.qty_discounts||[]).map((d,i)=>i===0?'':
          _row(`Remise ≥ ${fmtN(d.min)} ex.`,'',_pctInp(`pricing.qty_discounts.${i}.disc`,d.disc))
        ).join('')||`<div class="adm-empty adm-empty--sm">Aucune remise configurée</div>`)}
    </div>`;
}

/* ── Livraison tab (zones + villes Maroc) ── */

function _bPapers() {
  const std  = (DB.paper_stocks||[]).filter(p=>!p.special && !p.envelope);
  const spe  = (DB.paper_stocks||[]).filter(p=> p.special && !p.envelope);
  const fmts = DB.envelope_formats || [];
  const types= DB.envelope_types   || [];
  const isSupa    = typeof DB_MOD!=='undefined' && DB_MOD.getSource()==='supabase';
  const colsMissing = isSupa && !DB.envelope_formats && !DB.envelope_types;

  /* ── Column-header bar helper ── */
  const colHdr = (...cols) => `
    <div style="display:flex;align-items:center;gap:.35rem;padding:.18rem .85rem;
      background:var(--s2);border-bottom:1px solid var(--bd)">
      ${cols.map(([label, w, align='left'])=>`
        <span style="font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;
          letter-spacing:.6px;${w?'width:'+w+';flex-shrink:0':'flex:1'};text-align:${align}">${label}</span>`
      ).join('')}
      <span class="adm-mat-spacer28"></span>
    </div>`;

  /* ── Inline add-row helper ── */
  const addRow = content => `
    <div style="display:flex;align-items:center;gap:.35rem;padding:.4rem .85rem;
      border-bottom:1px solid var(--bd);background:var(--s2)">${content}</div>`;

  /* ── Paper rows ── */
  const paperRow = ps => {
    const i = DB.paper_stocks.indexOf(ps);
    return `<div class="adm-mat-row">
      <div class="adm-mat-flex1">
        ${_txtInp(`paper_stocks.${i}.label`,ps.label)}
        <div class="adm-row-sub" style="margin-top:2px">${ps.id}</div>
      </div>
      <div class="adm-num-wrap" title="Coût de la feuille vide (papier seul) format A3+">
        <input type="number" class="adm-inp" step="0.01" min="0" style="width:58px" value="${ps.cost_per_sheet || 0}"
          oninput="ADMIN.set('paper_stocks.${i}.cost_per_sheet',+this.value)">
        <span class="adm-num-unit">DH</span>
      </div>
      ${_delBtn(`ADMIN.removePaper(${i})`)}
    </div>`;
  };

  /* ── Envelope format rows ── */
  const fmtRows = fmts.map((f,i)=>`
    <div class="adm-mat-row">
      <input class="adm-inp-lbl" style="width:52px" value="${(f.name||'').replace(/"/g,'&quot;')}"
        placeholder="DL" oninput="ADMIN.set('envelope_formats.${i}.name',this.value)">
      <input class="adm-inp" type="number" style="width:50px" value="${f.w||''}" placeholder="220"
        oninput="ADMIN.set('envelope_formats.${i}.w',+this.value)">
      <span class="adm-mat-x">×</span>
      <input class="adm-inp" type="number" style="width:50px" value="${f.h||''}" placeholder="110"
        oninput="ADMIN.set('envelope_formats.${i}.h',+this.value)">
      <span class="adm-mat-x-mm">mm</span>
      <div class="adm-tab-flex1"></div>
      <div class="adm-num-wrap">
        <input class="adm-inp" type="number" min="0" step="0.01" style="width:64px" value="${f.cost||0}"
          oninput="ADMIN.set('envelope_formats.${i}.cost',+this.value)">
        <span class="adm-num-unit">DH</span>
      </div>
      ${_delBtn(`ADMIN.removeEnvFormat(${i})`)}
    </div>`).join('');

  /* ── Envelope type rows ── */
  const typeRows = types.map((t,i)=>`
    <div class="adm-mat-row">
      <input class="adm-inp-lbl" style="width:90px" value="${(t.name||'').replace(/"/g,'&quot;')}"
        placeholder="Autodex" oninput="ADMIN.set('envelope_types.${i}.name',this.value)">
      <div class="adm-tab-flex1"></div>
      <div class="adm-num-wrap">
        <input class="adm-inp" type="number" min="0" step="0.01" style="width:58px" value="${t.cost_per_piece||0}"
          oninput="ADMIN.set('envelope_types.${i}.cost_per_piece',+this.value)">
        <span class="adm-num-unit">DH/pce</span>
      </div>
      <div class="adm-num-wrap">
        <input class="adm-inp" type="number" min="0" step="0.01" style="width:58px" value="${t.cost_per_color||0}"
          oninput="ADMIN.set('envelope_types.${i}.cost_per_color',+this.value)">
        <span class="adm-num-unit">DH/coul</span>
      </div>
      ${_delBtn(`ADMIN.removeEnvType(${i})`)}
    </div>`).join('');

  /* ── Presets ── */
  const envPresets = [['DL',220,110],['C6',162,114],['C5',229,162],['C4',324,229],['B5',250,176]];
  const typPresets = ['Autodex','Normal','Spécial'];

  const icoStd = '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>';
  const paperColHdr = `<div class="adm-hdr-row-wrap">
    <span style="flex:1;font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px">Papier / Support</span>
    <span style="width:80px;flex-shrink:0;font-size:.57rem;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.6px;text-align:center">Prix planche A3+</span>
    <span class="adm-mat-spacer28"></span>
  </div>`;
  const icoEnv = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>';

  return `
    ${_pageHdr('Papiers','Coût de la planche vide (papier) et formats d\'enveloppes')}

    <!-- Row 1: Standard + Spéciaux -->
    <div class="adm-grid">
      ${_cardAct('Papiers standards',icoStd,
        `<button class="adm-action-btn" onclick="ADMIN.addPaper(false)">${IC.plus} Ajouter</button>`,
        paperColHdr + (std.map(paperRow).join('') || `<div class="adm-empty adm-empty--sm">Aucun papier standard</div>`))}
      ${_cardAct('Papiers spéciaux','<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
        `<button class="adm-action-btn" onclick="ADMIN.addPaper(true)">${IC.plus} Ajouter</button>`,
        paperColHdr + (spe.map(paperRow).join('') || `<div class="adm-empty adm-empty--sm">Aucun papier spécial</div>`))}
    </div>

    <!-- Row 2: Enveloppes -->
    ${colsMissing ? `
      <div class="adm-warn-blk">
        <strong>⚠ Colonnes manquantes.</strong> Exécutez dans Supabase → SQL Editor :
        <code class="adm-warn-code">
          ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_formats jsonb;<br>
          ALTER TABLE kote_config ADD COLUMN IF NOT EXISTS envelope_types   jsonb;
        </code>
      </div>` : ''}
    <div class="adm-grid adm-grid--mt">

      <!-- Formats enveloppes -->
      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico">${_svg(icoEnv)}</div>
            <div><div class="adm-card-title">Formats enveloppes</div>
            <div class="adm-card-sub">Nom · L×H mm · Coût unitaire</div></div>
          </div>
        </div>
        ${addRow(`
          <input class="adm-inp-lbl" id="efName" placeholder="DL…" style="width:52px">
          <input class="adm-inp" id="efW" type="number" placeholder="220" style="width:50px">
          <span class="adm-mat-x">×</span>
          <input class="adm-inp" id="efH" type="number" placeholder="110" style="width:50px">
          <span class="adm-mat-x-mm">mm</span>
          <div class="adm-tab-flex1"></div>
          <div class="adm-num-wrap">
            <input class="adm-inp" id="efCost" type="number" value="0" step="0.01" style="width:60px">
            <span class="adm-num-unit">DH</span>
          </div>
          <button class="adm-primary-btn adm-primary-btn--sm" onclick="ADMIN.addEnvFormat2()">${IC.plus} Ajouter</button>
        `)}
        <div class="adm-preset-row">
          <span class="adm-row-sub adm-preset-lbl">Rapide :</span>
          ${envPresets.map(([n,w,h])=>`<button class="adm-action-btn adm-preset-btn"
            onclick="ADMIN.addEnvFormatPreset('${n}',${w},${h})">${n}</button>`).join('')}
        </div>
        ${colHdr(['Nom','52px'],['L × H'],'',['Coût','64px','right'])}
        <div>${fmtRows || `<div class="adm-empty adm-empty--p75">Aucun format</div>`}</div>
      </div>

      <!-- Types d'enveloppes -->
      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico">${_svg('<path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/>')}</div>
            <div><div class="adm-card-title">Types d'enveloppes</div>
            <div class="adm-card-sub">Coût impression par pièce + par couleur</div></div>
          </div>
        </div>
        ${addRow(`
          <input class="adm-inp-lbl" id="etName" placeholder="Autodex…" style="width:100px">
          <div class="adm-tab-flex1"></div>
          <div class="adm-num-wrap">
            <input class="adm-inp" id="etCostPce" type="number" value="0" step="0.01" style="width:58px">
            <span class="adm-num-unit">DH/pce</span>
          </div>
          <div class="adm-num-wrap">
            <input class="adm-inp" id="etCost" type="number" value="0" step="0.01" style="width:58px">
            <span class="adm-num-unit">DH/coul</span>
          </div>
          <button class="adm-primary-btn adm-primary-btn--sm" onclick="ADMIN.addEnvType()">${IC.plus} Ajouter</button>
        `)}
        <div class="adm-preset-row">
          <span class="adm-row-sub adm-preset-lbl">Rapide :</span>
          ${typPresets.map(n=>`<button class="adm-action-btn adm-preset-btn"
            onclick="$('etName').value='${n}'">${n}</button>`).join('')}
        </div>
        ${colHdr(['Nom','90px'],[''],['DH/pce','58px','right'],['DH/coul','58px','right'])}
        <div>${typeRows || `<div class="adm-empty adm-empty--p75">Aucun type</div>`}</div>
        <div class="adm-finish-hint">
          Prix = (format + DH/pce + DH/coul × nb couleurs) × quantité
        </div>
      </div>
    </div>`;
}

/* ── Grand Format tab (Matières nav) ── */
function _bGFMat() {
  const gfMaterials = DB.gf_materials    || [];
  const supports    = DB.rollup_supports || [];
  const gfFins      = DB.gf_finishes     || [];
  const icoGF  = '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>';
  const icoSup = '<path d="M12 2v20M2 12h20"/>';
  const matRows = gfMaterials.map((m,i) => _row3(
    `<div>${_txtInp(`gf_materials.${i}.label`,m.label)}<div class="adm-row-sub">${m.id} · laize ${m.laize||1}m</div></div>`,
    `<div class="d-flex-g3">
      ${_numInp(`gf_materials.${i}.cost_per_sqm`,m.cost_per_sqm||0,'DH/m²')}
      ${_numInp(`gf_materials.${i}.laize`,m.laize||1,'m laize','0.1')}
    </div>`,
    _delBtn(`ADMIN.removeGfMat(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucune matière</div>`;
  const supRows = supports.map((s,i) => _row3(
    `<div>${_txtInp(`rollup_supports.${i}.label`,s.label)}<div class="adm-row-sub">${s.id}</div></div>`,
    _numInp(`rollup_supports.${i}.cost`,s.cost||0,'DH'),
    _delBtn(`ADMIN.removeRuSupport(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucun support</div>`;
  const finRows = gfFins.map((f,i) => _row3(
    `<div>${_txtInp(`gf_finishes.${i}.label`,f.label)}<div class="adm-row-sub">${f.id}</div></div>`,
    f.cost_per_sqm!=null ? _numInp(`gf_finishes.${i}.cost_per_sqm`,f.cost_per_sqm,'DH/m²') : _numInp(`gf_finishes.${i}.cost_flat`,f.cost_flat,'DH/ex','1'),
    _delBtn(`ADMIN.removeGfFinish(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucune finition GF</div>`;
  return `
    ${_pageHdr('Grand Format','Matières imprimables, supports mécaniques et finitions')}
    <div class="adm-grid">
      ${_cardAct('Matières imprimables',icoGF,
        `<button class="adm-action-btn" onclick="ADMIN.addGfMat()">${IC.plus} Ajouter</button>`,
        matRows, true)}
      ${_cardAct('Supports — Roll-up / X-banner',icoSup,
        `<button class="adm-action-btn" onclick="ADMIN.addRuSupport()">${IC.plus} Ajouter</button>`,
        supRows, true)}
      ${_cardAct('Finitions Grand Format',icoGF,
        `<button class="adm-action-btn" onclick="ADMIN.addGfFinish()">${IC.plus} Ajouter</button>`,
        finRows, true)}
    </div>`;
}

/* ── Pancarte tab (Matières nav) ── */
function _bPancarteMat() {
  const mats = DB.pancarte_materials || [];
  const icoP = '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';
  const matRows = mats.map((m,i) => _row3(
    `<div>
      ${_txtInp(`pancarte_materials.${i}.label`, m.label)}
      <div class="adm-row-sub">${m.id}${m.desc ? ' · ' + m.desc : ''}</div>
    </div>`,
    `<div class="d-flex-g3-ci">
      ${_numInp(`pancarte_materials.${i}.cost_per_sqm`, m.cost_per_sqm||0, 'DH/m²')}
      <input class="adm-inp-lbl adm-inp--mono-sm" style="width:100px" placeholder="Description…"
        value="${(m.desc||'').replace(/"/g,'&quot;')}"
        oninput="ADMIN.set('pancarte_materials.${i}.desc',this.value)">
    </div>`,
    _delBtn(`ADMIN.removePancarteMat(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--p15">Aucun support — ajoutez du Forex, Plexiglass, MDF, Verre…</div>`;
  return `
    ${_pageHdr('Pancarte','Supports rigides pour pancartes — tarification au m²')}
    <div class="adm-grid adm-grid-1">
      ${_cardAct('Supports rigides', icoP,
        `<button class="adm-action-btn" onclick="ADMIN.addPancarteMat()">${IC.plus} Ajouter</button>`,
        matRows, true)}
    </div>`;
}

/* ── Gadgets tab (Matières nav) ── */
function _bGadgetsMat() {
  const gadgetProds = (DB.products||[]).filter(p => (p.calc_engine==='gadget') || p.product_type==='gadget');
  const icoGad = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';
  const rows = gadgetProds.map(prod => {
    const pi = DB.products.indexOf(prod);
    return _row3(
      `<div>
        ${_txtInp(`products.${pi}.name`, prod.name)}
        <div class="adm-row-sub">${prod.id}${prod.print_technique ? ' · ' + prod.print_technique : ''}</div>
      </div>`,
      `<div class="d-flex-g3-ci">
        ${_numInp(`products.${pi}.unit_price`,prod.unit_price||0,'DH/u')}
        ${_numInp(`products.${pi}.print_cost`,prod.print_cost||0,'DH imp.')}
        <input class="adm-inp-lbl adm-inp--mono-sm" style="width:90px" placeholder="Technique…"
          value="${(prod.print_technique||'').replace(/"/g,'&quot;')}"
          oninput="ADMIN.set('products.${pi}.print_technique',this.value)">
      </div>`,
      _delBtn(`ADMIN.deleteGadget('${prod.id}')`)
    );
  }).join('');
  return `
    ${_pageHdr('Gadgets & Objets pub','Prix unitaire, coût impression et technique par produit')}
    <div class="adm-grid adm-grid-1">
      ${_cardAct('Gadgets',icoGad,
        `<button class="adm-action-btn" onclick="ADMIN.addGadget()">${IC.plus} Nouveau gadget</button>`,
        rows || `<div class="adm-empty adm-empty--p15">Aucun produit Gadget dans le catalogue</div>`,
        true)}
    </div>`;
}

function _bFinishes() {
  const lams = (DB.finishes||[]).filter(f=>f.id!=='none');
  const rows = lams.map(f => {
    const i = DB.finishes.indexOf(f);
    return _row3(
      `<div>${_txtInp(`finishes.${i}.label`,f.label)}<div class="adm-row-sub">${f.id}${f.per_side?' · par face':''}</div></div>`,
      _numInp(`finishes.${i}.cost_ps`,f.cost_ps,'DH/f'),
      _delBtn(`ADMIN.removeLam(${i})`)
    );
  }).join('');
  const ico = '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>';
  return `
    ${_pageHdr('Pelliculage','Types de finitions et coût à la feuille')}
    <div class="adm-grid adm-grid-1">
      ${_cardAct('Pelliculages',ico,
        `<button class="adm-action-btn" onclick="ADMIN.addLam()">${IC.plus} Ajouter</button>`,
        rows||`<div class="adm-empty adm-empty--sm">Aucun pelliculage</div>`,true)}
    </div>`;
}

function _bAddons() {
  const rows = (DB.finishes_addon||[]).map((f,i) => {
    let inp = '';
    if      (f.pricing_model==='setup_sheet') inp=`<div class="d-flex-g3">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup,'DH fix')}${_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f')}</div>`;
    else if (f.pricing_model==='per_sheet')   inp=_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f');
    else if (f.pricing_model==='per_unit')    inp=`<div class="d-flex-g3">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup||0,'DH fix')}${_numInp(`finishes_addon.${i}.cost_pu`,f.cost_pu||0,'DH/u','0.01')}</div>`;
    return _row3(
      `<div>${_txtInp(`finishes_addon.${i}.label`,f.label)}<div class="adm-row-sub">${f.pricing_model} · ${f.group||''}</div></div>`,
      inp, _delBtn(`ADMIN.removeAddon(${i})`)
    );
  }).join('');
  const ico = '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>';
  const carnetCard = (() => {
    const cp = (DB.products||[]).find(p => p.product_type === 'carnet' || p.calc_engine === 'carnet');
    if (!cp) return '';
    const pi = DB.products.indexOf(cp);
    const pr = cp.carnet_pricing || {};
    const icoOpts = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>';
    return _card('Finitions Carnet NCR', icoOpts,
      _row('Agrafage', 'par carnet (obligatoire)',
        _numInp('products.'+pi+'.carnet_pricing.stapling_cost_per_carnet', pr.stapling_cost_per_carnet||0)) +
      _row('Numérotation', 'par carnet (si activée)',
        _numInp('products.'+pi+'.carnet_pricing.numbering_cost_per_carnet', pr.numbering_cost_per_carnet||0)) +
      _row('Perforage', 'par carnet (si activé)',
        _numInp('products.'+pi+'.carnet_pricing.perforation_cost_per_carnet', pr.perforation_cost_per_carnet||0)));
  })();

  return `
    ${_pageHdr('Façonnage & Finitions spéciales','Pelliculage addon, découpe, vernis sélectif et autres opérations')}
    <div class="adm-grid adm-grid-1">
      ${_cardAct('Finitions spéciales',ico,
        `<button class="adm-action-btn" onclick="ADMIN.addAddon()">${IC.plus} Ajouter</button>`,
        rows||`<div class="adm-empty adm-empty--sm">Aucune finition</div>`,true)}
      ${carnetCard}
    </div>`;
}

function _bGF() {
  const gfFinRows = (DB.gf_finishes||[]).map((f,i)=>
    _row(f.label,'',f.cost_per_sqm!=null
      ? _numInp(`gf_finishes.${i}.cost_per_sqm`,f.cost_per_sqm,'DH/m²')
      : _numInp(`gf_finishes.${i}.cost_flat`,f.cost_flat,'DH/ex','1'))
  ).join('');
  const gfProds = (DB.products||[]).filter(p=>p.product_type==='grand_format'||p.product_type==='rollup');
  const matCards = gfProds.map(p => {
    const pi = DB.products.indexOf(p);
    const ico = '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>';
    return _card(`${p.name} — Matières`,ico,
      (p.gf_materials||[]).map((m,i)=>
        _row(m.label,m.desc,_numInp(`products.${pi}.gf_materials.${i}.cost_per_sqm`,m.cost_per_sqm,'DH/m²','1'))
      ).join(''));
  }).join('');
  const icoGF = '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>';
  return `
    ${_pageHdr('Grand Format','Matières et finitions pour l\'impression grand format')}
    <div class="adm-grid">
      ${_card('Finitions Grand Format',icoGF,gfFinRows||`<div class="adm-empty adm-empty--sm">Aucune finition</div>`)}
      ${matCards}
    </div>`;
}

function _bCarnet() {
  /* Carnet NCR settings have been distributed to their logical sections:
     • Papier NCR + Couverture  → Papiers (matières)
     • Agrafage / Numérotation / Perforage → Façonnage (opérations de finition) */
  const icoMap = (label, tab, color) =>
    `<div onclick="ADMIN._settingsSelectTab('${tab}')" style="display:flex;align-items:center;gap:.75rem;
      padding:.75rem 1rem;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;
      background:var(--sf);transition:all var(--ease)" onmouseover="this.style.borderColor='var(--bl)'"
      onmouseout="this.style.borderColor='var(--bd)'">
      <div style="width:32px;height:32px;border-radius:7px;background:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="width:15px;height:15px;color:#fff">${_svg(label[1]).replace('<svg','<svg style="width:15px;height:15px"')}</svg>
      </div>
      <div class="adm-tab-flex1">
        <div class="adm-tab-title">${label[0]}</div>
        <div class="adm-tab-sub">${label[2]}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--t3)"><path d="M9 18l6-6-6-6"/></svg>
    </div>`;

  return `
    ${_pageHdr('Carnet NCR','Les paramètres ont été répartis dans leurs sections logiques')}
    <div class="adm-grid adm-grid-1">
      <div class="adm-card adm-card-full">
        <div class="adm-rows adm-rows--fcol">
          <div class="adm-tab-hint">
            ${IC.info} Les coûts Carnet NCR sont maintenant dans leurs sections respectives :
          </div>
          <div onclick="ADMIN._settingsSelectTab('papers')" style="display:flex;align-items:center;gap:.75rem;
            padding:.75rem 1rem;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;
            background:var(--sf);transition:border-color var(--ease)"
            onmouseover="this.style.borderColor='var(--bl)'" onmouseout="this.style.borderColor='var(--bd)'">
            <div class="adm-tab-ico adm-tab-ico--bl">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" style="width:15px;height:15px"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div class="adm-tab-flex1">
              <div class="adm-tab-title">Papiers</div>
              <div class="adm-tab-sub">Papier NCR (coût/set par nb souches) · Couverture imprimée</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--t3)"><path d="M9 18l6-6-6-6"/></svg>
          </div>
          <div onclick="ADMIN._settingsSelectTab('addons')" style="display:flex;align-items:center;gap:.75rem;
            padding:.75rem 1rem;border:1.5px solid var(--bd);border-radius:var(--r);cursor:pointer;
            background:var(--sf);transition:border-color var(--ease)"
            onmouseover="this.style.borderColor='var(--bl)'" onmouseout="this.style.borderColor='var(--bd)'">
            <div class="adm-tab-ico adm-tab-ico--am">
              <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" style="width:15px;height:15px"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div class="adm-tab-flex1">
              <div class="adm-tab-title">Façonnage</div>
              <div class="adm-tab-sub">Agrafage · Numérotation · Perforage (coûts par carnet)</div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;color:var(--t3)"><path d="M9 18l6-6-6-6"/></svg>
          </div>
        </div>
      </div>
    </div>`;
}

function _bBinding() {
  const rows = (DB.binding_options||[]).map((b,i)=>
    _row(b.label,'frais fixes + par exemplaire',
      `<div style="display:flex;gap:.4rem">${_numInp(`binding_options.${i}.cost_flat`,b.cost_flat,'DH fix','1')}${_numInp(`binding_options.${i}.cost_per_copy`,b.cost_per_copy,'DH/ex')}</div>`)
  ).join('');
  const ico = '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>';
  return `
    ${_pageHdr('Reliure','Options de reliure et leur tarification')}
    <div class="adm-grid adm-grid-1">
      ${_card('Options de reliure',ico,rows||`<div class="adm-empty adm-empty--sm">Aucune option</div>`,true)}
    </div>`;
}

function _bConception() {
  const cp = (DB.products||[]).find(p=>p.product_type==='conception');
  if (!cp) return `${_pageHdr('Conception','')}<div class="adm-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 19l7-7 3 3-7 7-3-3z"/></svg>Aucun produit de type "conception" dans le catalogue.</div>`;
  const pi = DB.products.indexOf(cp);
  const rows = (cp.conception_types||[]).map((ct,i) => {
    let priceInp = '';
    if      (ct.price!=null)             priceInp = _numInp(`products.${pi}.conception_types.${i}.price`,ct.price,'DH');
    else if (ct.price_base!=null)        priceInp = `<div class="d-flex-g3">${_numInp(`products.${pi}.conception_types.${i}.price_base`,ct.price_base,'DH base')}${_numInp(`products.${pi}.conception_types.${i}.price_per_page`,ct.price_per_page,'DH/p.')}</div>`;
    else if (ct.price_per_face!=null)    priceInp = _numInp(`products.${pi}.conception_types.${i}.price_per_face`,ct.price_per_face,'DH/face');
    return _row3(`<div>${_txtInp(`products.${pi}.conception_types.${i}.label`,ct.label)}<div class="adm-row-sub">${ct.id}</div></div>`,priceInp,_delBtn(`ADMIN.removeConcType(${pi},${i})`));
  }).join('');
  const ico = '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>';
  return `
    ${_pageHdr('Conception','Tarifs des prestations de design graphique')}
    <div class="adm-grid adm-grid-1">
      ${_card('Prix design logo',ico,
        _row('Prix Logo','tarif de base personnalisable',_numInp(`products.${pi}.logo_price`,cp.logo_price||1200,'DH','1')))}
      ${_cardAct('Prestations',ico,
        `<button class="adm-action-btn" onclick="ADMIN.addConcType(${pi})">${IC.plus} Ajouter</button>`,
        rows||`<div class="adm-empty adm-empty--sm">Aucune prestation</div>`,true)}
    </div>`;
}

/* ══════════════════════════════════════════════════════════
   NEW CONSOLIDATED TAB BUILDERS (post-restructure)
   _bMarge        — replaces _bPricing (margin + remises only)
   _bImpression   — new: offset profiles + planches + sheet params
   _bGrandFormat  — merges _bGFMat + _bPancarteMat + orphan _bGF
   _bFinitions    — merges _bFinishes + _bAddons + _bBinding
   ══════════════════════════════════════════════════════════ */

/* ── Marge & Remises ─────────────────────────────────────── */
function _bMarge() {
  const p = DB.pricing || {};
  return `
    ${_pageHdr('Marge & Remises', 'Marge bénéficiaire globale et remises par volume de commande')}

    <div class="adm-hero-card">
      <div>
        <div class="adm-hero-lbl">Marge bénéficiaire globale</div>
        <div class="adm-hero-val" id="heroMarginVal">${Math.round((+p.profit_margin||0)*100)}%</div>
        <div class="adm-hero-sub">Appliquée à tous les produits du catalogue</div>
      </div>
      <div class="adm-hero-inp-wrap">
        <input type="number" class="adm-hero-inp" id="heroMarginInp" step="1" min="0" max="100"
          value="${Math.round((+p.profit_margin||0)*100)}"
          oninput="ADMIN.set('pricing.profit_margin',+this.value/100);document.getElementById('heroMarginVal').textContent=this.value+'%'">
        <span class="adm-hero-unit">%</span>
      </div>
    </div>

    <div class="adm-grid adm-grid-1">
      ${_card('Remises volume',
        '<path d="M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5"/>',
        (p.qty_discounts||[]).map((d,i) => i===0 ? '' :
          _row(`Remise ≥ ${fmtN(d.min)} ex.`, '', _pctInp(`pricing.qty_discounts.${i}.disc`, d.disc))
        ).join('') || `<div class="adm-empty adm-empty--sm">Aucune remise configurée</div>`
      )}
    </div>`;
}

/* ── Impression — offset + planches ─────────────────────── */
function _bImpression() {
  const p        = DB.pricing || {};
  const sh       = DB.sheet   || {};
  const profiles = DB.offset_profiles || [];
  const planches = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];

  const _opi   = Math.min(p._offset_edit_idx || 0, Math.max(0, profiles.length - 1));
  const _op    = profiles[_opi] || {};
  const _opfx  = `offset_profiles.${_opi}`;
  const _opMode= _op.mode || 'detailed';

  const togRow = (val, path, lbl, sub) => `
    <div class="adm-toggle-row">
      <div class="adm-toggle-lbl-wrap">
        <div class="adm-toggle-lbl">${lbl}</div>
        ${sub ? `<div class="adm-toggle-sub">${sub}</div>` : ''}
      </div>
      <label class="tog${val?' on':''}"
        onclick="this.classList.toggle('on');ADMIN.set('${path}',this.classList.contains('on'));ADMIN._renderTab('impression')">
      </label>
    </div>`;

  return `
    ${_pageHdr('Impression', 'Profils offset, formats de planche et paramètres presse')}

    <div class="adm-grid adm-grid-1">
      <div class="adm-card adm-card-full">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico">${_svg('<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>')}</div>
            <div class="adm-card-title">Offset</div>
          </div>
          <div class="adm-offset-hdr">
            <select style="font-size:.65rem;font-weight:700;padding:4px 10px;border:1.5px solid var(--bd);
              border-radius:7px;background:var(--sf);color:var(--t1);cursor:pointer;min-width:140px"
              onchange="ADMIN.set('pricing._offset_edit_idx',+this.value);ADMIN._renderTab('impression')">
              ${profiles.map((pr,i) =>
                `<option value="${i}"${i===_opi?' selected':''}>${pr.label || 'Profil '+(i+1)}</option>`
              ).join('')}
            </select>
            <button class="adm-action-btn adm-offset-add"
              onclick="ADMIN.addOffsetProfile()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                style="width:10px;height:10px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Ajouter
            </button>
            ${_opi > 0 ? `<button class="adm-action-btn danger adm-offset-del"
              title="Supprimer ce profil" onclick="ADMIN.removeOffsetProfile(${_opi})">✕</button>` : ''}
          </div>
        </div>

        <div class="adm-mat-hdr">
          <div class="adm-mat-hdr-l">
            <span class="adm-mat-lbl">Nom :</span>
            <input style="font-size:.72rem;font-weight:700;border:1.5px solid var(--bd);border-radius:6px;
              background:var(--sf);color:var(--t1);padding:3px 8px;width:180px;font-family:inherit;outline:none"
              value="${_op.label||'Profil '+(_opi+1)}"
              onchange="ADMIN.set('${_opfx}.label',this.value);ADMIN._renderTab('impression')">
            <span style="font-size:.52rem;font-family:monospace;color:var(--t3);background:var(--bd);
              padding:1px 6px;border-radius:4px">${_op.id||'default'}</span>
          </div>
          <div class="adm-mat-hdr-r">
            <span class="adm-mat-lbl">Mode :</span>
            <div class="adm-mat-seg">
              ${['detailed','planche'].map(m =>
                `<button style="padding:3px 12px;font-size:.62rem;font-weight:600;border:none;cursor:pointer;
                  background:${_opMode===m?'var(--bl)':'transparent'};color:${_opMode===m?'#fff':'var(--t2)'}"
                  onclick="ADMIN.set('${_opfx}.mode','${m}');ADMIN._renderTab('impression')">
                  ${m==='detailed'?'Détaillé':'Planche'}</button>`
              ).join('')}
            </div>
          </div>
        </div>

        <div class="adm-rows">
          ${togRow(_op.enabled!==false, _opfx+'.enabled', 'Activer', "Proposer l'offset pour ce profil")}
          ${_row('Seuil feuilles', 'déclenchement suggestion', _numInp(_opfx+'.min_sheets', _op.min_sheets||1000, 'f.', '1'))}
          ${_opMode==='detailed' ? `
            ${_row('Calage',      'frais fixes par job',      _numInp(_opfx+'.setup_cost',     _op.setup_cost||0,     'DH',    '1'))}
            ${_row('Plaques',     'coût × nb couleurs',       _numInp(_opfx+'.cost_per_plate', _op.cost_per_plate||0, 'DH',    '1'))}
            ${_row('Recto',       'DH par feuille',           _numInp(_opfx+'.print_single',   _op.print_single||1.5))}
            ${_row('Recto-Verso', 'DH par feuille',           _numInp(_opfx+'.print_double',   _op.print_double||2))}
          ` : `
            ${_row('Recto',       'DH par planche',           _numInp(_opfx+'.planche_recto',  _op.planche_recto||6))}
            ${_row('Recto-Verso', 'DH par planche',           _numInp(_opfx+'.planche_rv',     _op.planche_rv||7))}
          `}
        </div>
      </div>
    </div>

    <div class="adm-grid adm-grid-1 adm-grid--mt">
      <div class="adm-card adm-card-full">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico">${_svg('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>')}</div>
            <div class="adm-card-title">Formats de planche &amp; Feuille de presse</div>
          </div>
          <button class="adm-action-btn" onclick="ADMIN.addPlanche()">${IC.plus} Ajouter format</button>
        </div>
        <div class="adm-mat-grid2">
          <div class="adm-mat-col-l">
            <div class="adm-mat-field-lbl">Formats disponibles</div>
            ${planches.map((pl,i) => `
              <div class="adm-mat-item-row">
                <span class="adm-mat-id-cell">${pl.id}</span>
                ${_numInp(`planches.${i}.w`, pl.w, 'mm L')}
                <span class="adm-mat-x">×</span>
                ${_numInp(`planches.${i}.h`, pl.h, 'mm H')}
              </div>`).join('')}
          </div>
          <div class="adm-mat-col-r">
            <div class="adm-mat-field-lbl">Paramètres globaux</div>
            ${_row('Marge presse', 'mm — tous formats', _numInp('sheet.margin', sh.margin, 'mm', '0.5'))}
            ${_row('Fond perdu',   'mm — tous formats', _numInp('sheet.bleed',  sh.bleed,  'mm', '0.5'))}
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Grand Format — matières + supports + finitions + pancartes ─ */
function _bGrandFormat() {
  const gfMats  = DB.gf_materials      || [];
  const ruSups  = DB.rollup_supports   || [];
  const panMats = DB.pancarte_materials|| [];

  const icoGF  = '<rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="21 15 16 10 5 21"/><circle cx="8.5" cy="8.5" r="1.5"/>';
  const icoSup = '<path d="M12 2v20M2 12h20"/>';
  const icoPan = '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';

  const matRows = gfMats.map((m,i) => _row3(
    `<div>${_txtInp(`gf_materials.${i}.label`, m.label)}<div class="adm-row-sub">${m.id} · laize ${m.laize||1}m</div></div>`,
    `<div class="d-flex-g3">
      ${_numInp(`gf_materials.${i}.cost_per_sqm`, m.cost_per_sqm||0, 'DH/m²')}
      ${_numInp(`gf_materials.${i}.laize`,         m.laize||1,         'm laize', '0.1')}
    </div>`,
    _delBtn(`ADMIN.removeGfMat(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucune matière — ajoutez bâche, vinyle, papier…</div>`;

  const supRows = ruSups.map((s,i) => _row3(
    `<div>${_txtInp(`rollup_supports.${i}.label`, s.label)}<div class="adm-row-sub">${s.id}</div></div>`,
    _numInp(`rollup_supports.${i}.cost`, s.cost||0, 'DH'),
    _delBtn(`ADMIN.removeRuSupport(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucun support</div>`;

  const panRows = panMats.map((m,i) => _row3(
    `<div>
      ${_txtInp(`pancarte_materials.${i}.label`, m.label)}
      <div class="adm-row-sub">${m.id}${m.desc ? ' · ' + m.desc : ''}</div>
    </div>`,
    `<div class="d-flex-g3-ci">
      ${_numInp(`pancarte_materials.${i}.cost_per_sqm`, m.cost_per_sqm||0, 'DH/m²')}
      <input class="adm-inp-lbl adm-inp--mono-sm" style="width:100px" placeholder="Description…"
        value="${(m.desc||'').replace(/"/g,'&quot;')}"
        oninput="ADMIN.set('pancarte_materials.${i}.desc',this.value)">
    </div>`,
    _delBtn(`ADMIN.removePancarteMat(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--p15">Aucun support — Forex, Plexiglass, MDF, Verre…</div>`;

  return `
    ${_pageHdr('Grand Format', 'Matières imprimables, supports mécaniques et pancartes')}
    <div class="adm-grid">
      ${_cardAct('Matières imprimables', icoGF,
        `<button class="adm-action-btn" onclick="ADMIN.addGfMat()">${IC.plus} Ajouter</button>`,
        matRows, true)}
      ${_cardAct('Supports — Roll-up / X-banner', icoSup,
        `<button class="adm-action-btn" onclick="ADMIN.addRuSupport()">${IC.plus} Ajouter</button>`,
        supRows, true)}
      ${_cardAct('Pancartes — supports rigides', icoPan,
        `<button class="adm-action-btn" onclick="ADMIN.addPancarteMat()">${IC.plus} Ajouter</button>`,
        panRows, true)}
    </div>`;
}

/* ── Finitions — pelliculage + façonnage + reliure ────────── */
function _bFinitions() {
  const lams     = (DB.finishes||[]).filter(f => f.id !== 'none');
  const addons   = DB.finishes_addon  || [];
  const bindings = DB.binding_options || [];
  const p        = DB.pricing         || {};
  const gfFins   = DB.gf_finishes     || [];

  const icoLam  = '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>';
  const icoFac  = '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>';
  const icoBind = '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>';
  const icoNCR  = '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>';
  const icoGFFin = '<path d="M12 2H2v10l9.29 9.29A1 1 0 0012.7 21l8.58-8.58a1 1 0 000-1.42L12 2z"/>';

  const lamRows = lams.map(f => {
    const i = DB.finishes.indexOf(f);
    return _row3(
      `<div>${_txtInp(`finishes.${i}.label`, f.label)}<div class="adm-row-sub">${f.id}${f.per_side?' · par face':''}</div></div>`,
      _numInp(`finishes.${i}.cost_ps`, f.cost_ps, 'DH/f'),
      _delBtn(`ADMIN.removeLam(${i})`)
    );
  }).join('') || `<div class="adm-empty adm-empty--sm">Aucun pelliculage</div>`;

  const addonRows = addons.map((f,i) => {
    let inp = '';
    if      (f.pricing_model==='setup_sheet') inp = `<div class="d-flex-g3">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup,'DH fix')}${_numInp(`finishes_addon.${i}.cost_ps`,f.cost_ps,'DH/f')}</div>`;
    else if (f.pricing_model==='per_sheet')   inp = _numInp(`finishes_addon.${i}.cost_ps`, f.cost_ps, 'DH/f');
    else if (f.pricing_model==='per_unit')    inp = `<div class="d-flex-g3">${_numInp(`finishes_addon.${i}.cost_setup`,f.cost_setup||0,'DH fix')}${_numInp(`finishes_addon.${i}.cost_pu`,f.cost_pu||0,'DH/u','0.01')}</div>`;
    return _row3(
      `<div>${_txtInp(`finishes_addon.${i}.label`,f.label)}<div class="adm-row-sub">${f.pricing_model} · ${f.group||''}</div></div>`,
      inp, _delBtn(`ADMIN.removeAddon(${i})`)
    );
  }).join('') || `<div class="adm-empty adm-empty--sm">Aucune finition</div>`;

  const bindRows = bindings.map((b,i) => _row3(
    `<div>${_txtInp(`binding_options.${i}.label`, b.label)}<div class="adm-row-sub">${b.id}</div></div>`,
    `<div class="d-flex-g3">
      ${_numInp(`binding_options.${i}.cost_flat`,     b.cost_flat,     'DH fix', '1')}
      ${_numInp(`binding_options.${i}.cost_per_copy`, b.cost_per_copy, 'DH/ex')}
    </div>`,
    _delBtn(`ADMIN.removeBinding(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucune option</div>`;

  const gfFinRows = gfFins.map((f,i) => _row3(
    `<div>${_txtInp(`gf_finishes.${i}.label`, f.label)}<div class="adm-row-sub">${f.id}</div></div>`,
    f.cost_per_sqm != null
      ? _numInp(`gf_finishes.${i}.cost_per_sqm`, f.cost_per_sqm, 'DH/m²')
      : _numInp(`gf_finishes.${i}.cost_flat`,    f.cost_flat,    'DH/ex', '1'),
    _delBtn(`ADMIN.removeGfFinish(${i})`)
  )).join('') || `<div class="adm-empty adm-empty--sm">Aucune finition GF</div>`;

  /* Carnet NCR operations — shown only if a carnet product exists */
  const carnetProd = (DB.products||[]).find(pr => pr.product_type === 'carnet' || pr.calc_engine === 'carnet');
  const carnetCard = (() => {
    if (!carnetProd) return '';
    const pi = DB.products.indexOf(carnetProd);
    const pr = carnetProd.carnet_pricing || {};
    return _card('Finitions Carnet NCR', icoNCR,
      _row('Agrafage',       'par carnet', _numInp(`products.${pi}.carnet_pricing.stapling_cost_per_carnet`,   pr.stapling_cost_per_carnet||0)) +
      _row('Numérotation',   'par carnet (si activée)', _numInp(`products.${pi}.carnet_pricing.numbering_cost_per_carnet`,   pr.numbering_cost_per_carnet||0)) +
      _row('Perforage',      'par carnet (si activé)',  _numInp(`products.${pi}.carnet_pricing.perforation_cost_per_carnet`, pr.perforation_cost_per_carnet||0))
    );
  })();

  return `
    ${_pageHdr('Finitions', 'Pelliculage, façonnage, découpe numérique, reliure, finitions GF et Carnet NCR')}
    <div class="adm-grid">
      ${_cardAct('Pelliculage', icoLam,
        `<button class="adm-action-btn" onclick="ADMIN.addLam()">${IC.plus} Ajouter</button>`,
        lamRows, true)}
      <div class="adm-col-rows">
        ${_cardAct('Façonnage &amp; finitions spéciales', icoFac,
          `<button class="adm-action-btn" onclick="ADMIN.addAddon()">${IC.plus} Ajouter</button>`,
          addonRows +
          `<div class="adm-sep-h"></div>` +
          _row('Frais de coupe', 'par commande numérique', _numInp('pricing.cutting_fee', p.cutting_fee||60, 'DH', '1'))
        )}
        ${carnetCard}
        ${_card('Forme de découpe',
          '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/>',
          _row('Setup',     'frais fixes par commande (une fois)',
            _numInp('forme_decoupe.setup',    (DB.forme_decoupe?.setup    || 0), 'DH',    '0.01')) +
          _row('Prix / cm²','surface du format ouvert sac',
            _numInp('forme_decoupe.prix_cm2', (DB.forme_decoupe?.prix_cm2 || 0), 'DH/cm²','0.001'))
        )}
        ${_cardAct('Reliure', icoBind,
          `<button class="adm-action-btn" onclick="ADMIN.addBinding()">${IC.plus} Ajouter</button>`,
          bindRows)}
        ${_cardAct('Finitions Grand Format', icoGFFin,
          `<button class="adm-action-btn" onclick="ADMIN.addGfFinish()">${IC.plus} Ajouter</button>`,
          gfFinRows)}
      </div>
    </div>`;
}

/* ── Section Builder helpers ── */

