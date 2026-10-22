'use strict';

/* ============================================================
   catalog-ui.js -- UI layer: DESIGN, BRIEF, SEL, UI, loaders
   Extracted from kote-catalog.js (S7 split).
   Exposes: DESIGN, BRIEF, SEL, fSel, UI,
            loadProduct, loadConception, afterCheckout
   Requires: kote-core.js, catalog-sections.js (SECTIONS)
   Load order: after catalog-sections.js
   ============================================================ */

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

      const _grpFirstProd = grp.products.map(pid => DB.products.find(x => x.id === pid)).find(p => p && p.icon);
      const _grpIcHtml = _grpFirstProd && IC[_grpFirstProd.icon]
        ? `<span class="sb-grp-ic">${IC[_grpFirstProd.icon]}</span>`
        : '';
      hdr.innerHTML = `${_grpIcHtml}<span class="sb-grp-lbl">${grp.label}</span><span class="sb-chev">${IC['chev-r']}</span>`;
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
      if (res.intPaper > 0) rows += row(`Papier ${res.pObj?.label||''} × ${res.intTotal} f.`, fmt(res.intPaper) + ' DH');
      rows += row(`Impression ${intSideLabel} × ${res.intTotal} f.`, fmt(res.intPrint) + ' DH');
      if (res.intLam > 0) rows += row(res.lamIntF?.label||'', fmt(res.intLam) + ' DH');
      rows += sep(`Couverture (4 pages · ${covSideLabel})`);
      if (res.covPaper > 0) rows += row(`Papier ${res.covObj?.label||''} × ${res.covTotal} f.`, fmt(res.covPaper) + ' DH');
      rows += row(`Impression ${covSideLabel} × ${res.covTotal} f.`, fmt(res.covPrint) + ' DH');
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
      if (res.paperCost > 0) rows += row(`Papier presse${res.pressPaperLabel ? ' — ' + res.pressPaperLabel : ''} × ${res.pressSheets} f.`, fmt(res.paperCost) + ' DH');
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
      // Standard / envelope / sac / packaging
      // Use same composition-based detection as _priceSheetFit — profile assignment must not affect display
      const _hasSacSec      = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'sac-format');
      const _hasOuvertSec   = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'format-ouvert');
      const hasFormeDecoupe = _getComposition(curProd).some(e =>
        typeof e === 'string'
          ? e === 'forme-decoupe'
          : e.type_id === 'forme-decoupe' || e.config?.fd_enabled === true);
      const isPackaging     = !!(_hasSacSec || _hasOuvertSec || curProd?.is_sac ||
        curProd?.product_type === 'sac' || curProd?.product_type === 'packaging' ||
        curProd?.calc_engine === 'packaging');
      const sheetUnit       = isPackaging && res.sacPlanche ? res.sacPlanche : 'f.';
      const techLabel  = res.isOffset ? 'Offset' : (dbl ? 'R/V' : 'Recto');
      const paperLabel = res.pObj ? ` — ${res.pObj.label}` : '';
      if (res.paperCost > 0) rows += row(`Papier${paperLabel} × ${res.sheets} ${sheetUnit}`, fmt(res.paperCost) + ' DH');
      rows += row(`Impression ${techLabel} × ${res.sheets} ${sheetUnit}`, fmt(res.printCost) + ' DH');
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
      if (hasFormeDecoupe && res.fdCost > 0) {
        rows += row('Forme de découpe', fmt(res.fdCost) + ' DH');
      }
      if (res.chemiseCost > 0) {
        const opts = [curSel.chemiseColle ? 'Rabat collé' : '', curSel.chemiseImprime ? 'Rabat imprimé' : ''].filter(Boolean).join(' + ');
        rows += row(opts, fmt(res.chemiseCost) + ' DH');
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
    if (curSel.sacL && curSel.sacH && curSel.sacS) {
      // Sac shopping: use open-format dims + chosen planche as the sheet
      const L = curSel.sacL, H = curSel.sacH, S = curSel.sacS;
      const Lo = 2*(L+S)+20, Ho = H+(S/2+20)+40;
      const planches  = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
      const planche   = planches.find(p => p.id === res.sacPlanche) || planches[planches.length-1];
      const shForSac  = { ...sh, w: planche.w, h: planche.h };
      const half      = curSel.sizeObj?.passes === 2 && curSel.sizeObj?.demi_w;
      const drawW     = half ? curSel.sizeObj.demi_w : Lo;
      const drawH     = half ? curSel.sizeObj.demi_h : Ho;
      const svg       = sheetSVG(res.fit, drawW, drawH, shForSac);
      const grid      = `${res.fit.cols}×${res.fit.rows}${res.fit.rotated ? ' ↻' : ''}`;
      const passLabel = half ? `<br><span class="cat-pass-lbl">× 2 passes</span>` : '';
      return svg + legend(`${res.unitsPerSheet || 1}×/planche`, `${planche.id} · ${grid}${passLabel}<br>${res.sheets} planche${res.sheets > 1 ? 's' : ''}`);
    }
    if (curSel.ouvertL && curSel.ouvertH && res.fit) {
      // Packaging: ouvertL/ouvertH fed directly as fitW/fitH
      const planches = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
      const planche  = planches.find(p => p.id === res.sacPlanche) || planches[planches.length-1];
      const shForPack = { ...sh, w: planche.w, h: planche.h };
      const svg      = sheetSVG(res.fit, curSel.ouvertL, curSel.ouvertH, shForPack);
      const grid     = `${res.fit.cols}×${res.fit.rows}${res.fit.rotated ? ' ↻' : ''}`;
      return svg + legend(`${res.unitsPerSheet || 1}×/planche`, `${planche.id} · ${grid}<br>${res.sheets} planche${res.sheets > 1 ? 's' : ''}`);
    }
    if (curSel.sizeObj?.mode === 'boite' && curSel.sizeObj?.fo_w) {
      // Boite: imposition uses open format (fo_w/fo_h), not closed dims (w/h)
      const planches  = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
      const planche   = planches.find(p => p.id === res.sacPlanche) || planches[planches.length-1];
      const shForBoite = { ...sh, w: planche.w, h: planche.h };
      const half      = curSel.sizeObj.passes === 2 && curSel.sizeObj.demi_w;
      const drawW     = half ? curSel.sizeObj.demi_w : curSel.sizeObj.fo_w;
      const drawH     = half ? curSel.sizeObj.demi_h : curSel.sizeObj.fo_h;
      const svg       = sheetSVG(res.fit, drawW, drawH, shForBoite);
      const grid      = `${res.fit.cols}×${res.fit.rows}${res.fit.rotated ? ' ↻' : ''}`;
      const passLabel = half ? `<br><span class="cat-pass-lbl">× 2 passes</span>` : '';
      return svg + legend(`${res.unitsPerSheet || 1}×/planche`, `${planche.id} · ${grid}${passLabel}<br>${res.sheets} planche${res.sheets > 1 ? 's' : ''}`);
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
        : `<div class="gf-area-lbl gf-area-lbl--dim">Surface</div>`;
    }
    renderFooter();
  }
  function _buildSacFormatBadge(L, H, S) {
    const hasAll = L > 0 && H > 0 && S > 0;
    if (!hasAll) return `<div class="cat-hint-row">Renseignez L, H et Soufflet pour voir le format ouvert.</div>`;
    const Lo = 2*(L+S)+20, Ho = H+(S/2+20)+40;
    const planches = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
    const PMULT = [1,2,4];
    const margin = DB.sheet?.margin || 3, bleed = DB.sheet?.bleed || 2;
    // Check if half-FD applies
    const fitsA3 = (() => {
      const pl = planches[0];
      const uw = pl.w-margin*2, uh = pl.h-margin*2;
      const fw = Lo+bleed*2, fh = Ho+bleed*2;
      return Math.max(Math.floor(uw/fw)*Math.floor(uh/fh), Math.floor(uw/fh)*Math.floor(uh/fw)) >= 1;
    })();
    const demi_w = fitsA3 ? null : Math.ceil((Lo+20)/2);
    const dispW  = demi_w || Lo, dispH = Ho;
    let displayPlanche = planches[planches.length-1].id;
    let displayMult    = PMULT[planches.length-1];
    let perSheet       = null;
    for (let i = 0; i < planches.length; i++) {
      const pl = planches[i];
      const uw = pl.w - margin*2, uh = pl.h - margin*2;
      const fw = dispW+bleed*2, fh = dispH+bleed*2;
      const n = Math.max(Math.floor(uw/fw)*Math.floor(uh/fh), Math.floor(uw/fh)*Math.floor(uh/fw));
      if (n >= 1) { displayPlanche = pl.id; displayMult = PMULT[i]; perSheet = n; break; }
    }
    return `<div class="cat-fmt-card">
      <div>
        <div class="cat-fmt-lbl">${demi_w ? 'Format ouvert complet' : 'Format ouvert'}</div>
        <div style="font-size:${demi_w?'.82rem':'1rem'};font-weight:700;color:${demi_w?'var(--t2)':'var(--bl)'}">${Lo} × ${Ho} mm</div>
        ${demi_w ? `<div class="adm-sep-top" style="border-top-color:var(--bl-md)">
          <div class="cat-fmt-lbl">½ FD · 2 passes</div>
          <div class="cat-fmt-val">${demi_w} × ${Ho} mm</div>
          <div class="cat-fmt-sub">(${Lo}+20)÷2 × ${Ho}</div>
        </div>` : `<div class="cat-fmt-sub">L : 2×(${L}+${S})+20 &nbsp;·&nbsp; H : ${H}+(${S}/2+20)+40</div>`}
      </div>
      <div class="txt-r">
        <div class="cat-planche-lbl">${displayPlanche}</div>
        ${displayMult > 1 ? `<div class="cat-mult-am">planche ×${displayMult}</div>` : `<div class="cat-mult-gn">planche ×1</div>`}
        ${perSheet ? `<div class="cat-sub-t2">${perSheet} sac${perSheet>1?'s':''} / planche</div>` : ''}
      </div>
    </div>`;
  }
  function sacDims() {
    const L = +($('sacInputL')?.value) || 0;
    const H = +($('sacInputH')?.value) || 0;
    const S = +($('sacInputS')?.value) || 0;
    curSel.sacL = L; curSel.sacH = H; curSel.sacS = S;
    STATE.emit('curSel');
    // Patch only the format ouvert badge — never call renderForm() which would destroy the focused input
    const box = $('sacFormatOuvert');
    if (box) box.innerHTML = _buildSacFormatBadge(L, H, S);
    renderFooter();
  }
  function _buildPackFormatBadge(L, H) {
    const hasAll = L > 0 && H > 0;
    if (!hasAll) return `<div class="cat-hint-row">Entrez L et H pour voir le format ouvert.</div>`;
    const planches = DB.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}];
    const PMULT = [1,2,4];
    const margin = DB.sheet?.margin || 3, bleed = DB.sheet?.bleed || 2;
    let displayPlanche = planches[planches.length-1].id;
    let displayMult    = PMULT[planches.length-1];
    let perSheet       = null;
    for (let i = 0; i < planches.length; i++) {
      const pl = planches[i];
      const uw = pl.w - margin*2, uh = pl.h - margin*2;
      const fw = L+bleed*2, fh = H+bleed*2;
      const n = Math.max(Math.floor(uw/fw)*Math.floor(uh/fh), Math.floor(uw/fh)*Math.floor(uh/fw));
      if (n >= 1) { displayPlanche = pl.id; displayMult = PMULT[i]; perSheet = n; break; }
    }
    return `<div class="cat-fmt-card">
      <div>
        <div class="cat-fmt-lbl">Format ouvert</div>
        <div class="cat-fmt-val">${L} × ${H} mm</div>
        <div class="cat-fmt-sub">Format à plat de la boîte</div>
      </div>
      <div class="txt-r">
        <div class="cat-planche-lbl">${displayPlanche}</div>
        ${displayMult > 1 ? `<div class="cat-mult-am">planche ×${displayMult}</div>` : `<div class="cat-mult-gn">planche ×1</div>`}
        ${perSheet ? `<div class="cat-sub-t2">${perSheet} pièce${perSheet>1?'s':''} / planche</div>` : ''}
      </div>
    </div>`;
  }
  function packDims() {
    const L = +($('packInputL')?.value) || 0;
    const H = +($('packInputH')?.value) || 0;
    curSel.ouvertL = L; curSel.ouvertH = H;
    STATE.emit('curSel');
    const box = $('packFormatOuvert');
    if (box) box.innerHTML = _buildPackFormatBadge(L, H);
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
    if (curSel.useOffset) {
      curSel._offsetManualOff = false; // user opted back in — clear override
      if (!curSel.offsetColors) curSel.offsetColors = 4;
    } else {
      curSel._offsetManualOff = true;  // user explicitly chose numérique — respect it
    }
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
    customSizeMM, gfDims, gfFinish, sacDims, packDims,
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
    // Detect packaging/sac products by composition — ensures section defaults (presets, qty) always
    // run on load regardless of the assigned profile (packaging, feuille_presse, etc.)
    const hasPackagingComposition = _getComposition(curProd).some(e => {
      const tid = typeof e === 'string' ? e : e.type_id;
      if (['sac-format', 'format-ouvert', 'boite-format'].includes(tid)) return true;
      if (tid === 'size') {
        const mode = (typeof e === 'object' && e?.config?.mode) || null;
        if (['free', 'derived', 'boite'].includes(mode)) return true;
      }
      return false;
    });

    if (hasEnvComposition) {
      // Envelope: always run env-section defaults + qty default
      _getComposition(curProd).forEach(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        SECTIONS[tid]?.defaults?.(curProd, curSel, DB, entry);
      });
      if (!curSel.quantity && curProd.quantities?.length) curSel.quantity = curProd.quantities[0];
    } else if (!isStandard || hasPackagingComposition) {
      _getComposition(curProd).forEach(entry => {
        const tid = typeof entry === 'string' ? entry : entry.type_id;
        SECTIONS[tid]?.defaults?.(curProd, curSel, DB, entry);
      });
      (curProd.default_addons || []).forEach(aid => {
        if (!curSel.addons.includes(aid)) { curSel.addons.push(aid); curSel.addonFaces[aid] = 1; }
      });
      if (!curSel.quantity && curProd.quantities?.length) curSel.quantity = curProd.quantities[0];
    } else {
      // Standard products: normally user picks himself, but run defaults() for any section
      // where the admin has explicitly set a pre-selection diamond (config.default /
      // config.default_paper / config.default_lam). Sections without an admin default are
      // skipped so the product still opens blank — zero regression on existing behaviour.
      _getComposition(curProd).forEach(entry => {
        if (typeof entry !== 'object' || !entry.config) return;
        const cfg = entry.config;
        if (!('default' in cfg || 'default_paper' in cfg || 'default_lam' in cfg)) return;
        SECTIONS[entry.type_id]?.defaults?.(curProd, curSel, DB, entry);
      });
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

