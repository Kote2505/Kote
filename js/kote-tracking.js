'use strict';

/* ════════════════════════════════════════════════════════
   kote-tracking.js — Public order tracker (standalone)
   Self-contained: embeds Supabase config + TRK module.
   Page: tracking.html only. No other dependencies.
   ════════════════════════════════════════════════════════ */

/* ── Supabase config (embedded for standalone use) ── */
/* ── Supabase config (embedded for standalone use) ── */
(function() {
  var _storedUrl  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_url');
  var _storedKey  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_key');
  if (!window.SUPABASE_URL) {
    window.SUPABASE_URL = _storedUrl  || 'https://qjqextlzbklcvhejqrsm.supabase.co';
  }
  if (!window.SUPABASE_ANON_KEY) {
    window.SUPABASE_ANON_KEY = _storedKey  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqcWV4dGx6YmtsY3ZoZWpxcnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTYwMDIsImV4cCI6MjA4ODY3MjAwMn0.z-VpvgT8U4whyKs6P71oKtMO64pie1xsgaBdyhZkRdA';
  }
})();


/* ═══════════════════════════════════════════════════════
   TRACKING CORE — shared between tracking.html + index.html
   Requires js/config.js to expose window.SUPABASE_URL + window.SUPABASE_ANON_KEY
   ═══════════════════════════════════════════════════════ */
const TRK = (() => {

  /* ── Inject timeline CSS once ── */
  (function _injectCSS() {
    if (document.getElementById('trk-css')) return;
    const s = document.createElement('style');
    s.id = 'trk-css';
    s.textContent = `
/* ── Card wrapper ── */
.tk-card{
  background:#fff;border-radius:14px;
  border:1.5px solid #e5e7eb;
  overflow:hidden;font-family:'Poppins',Arial,sans-serif
}
.tk-card-hdr{
  display:flex;justify-content:space-between;align-items:flex-start;
  padding:16px 18px 14px;border-bottom:1px solid #f3f4f6
}
.tk-label{font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
.tk-ref{font-size:18px;font-weight:700;color:#111827;letter-spacing:.3px;font-family:monospace}
.tk-date{font-size:11px;color:#9ca3af;margin-top:3px}
.tk-badge{
  display:inline-flex;align-items:center;
  padding:3px 10px;border-radius:20px;
  font-size:11px;font-weight:600;border:1px solid
}

/* ── Timeline ── */
.tk-timeline{
  display:flex;flex-direction:column;
  padding:16px 18px 10px 18px
}
.tk-step{display:flex;gap:12px;min-height:36px}
.tk-step:last-child{min-height:0}

/* ── Node (dot + connector line) ── */
.tk-step-node{display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:22px}
.tk-step-dot{
  width:22px;height:22px;border-radius:50%;flex-shrink:0;
  border:1.5px solid #e5e7eb;background:#fff;
  display:flex;align-items:center;justify-content:center;
  color:#e5e7eb;transition:border-color .25s,background .25s,color .25s
}
.tk-step-line{width:1.5px;background:#e5e7eb;flex:1;margin:3px 0;min-height:14px}

/* ── Past milestones: #89F336 outline, white fill ── */
.tk-step.tk-done .tk-step-dot{
  border-color:#89F336;background:#fff;color:#3d8c00;border-width:2px
}
.tk-step.tk-done .tk-step-line{background:#c8f08a}

/* ── Active (current) step: solid #89F336 ── */
.tk-step.tk-active .tk-step-dot{
  border-color:#89F336;background:#89F336;color:#1a4200;border-width:2px;
  box-shadow:0 0 0 4px #d4f7a0
}
.tk-step.tk-active .tk-step-line{background:#e5e7eb}

/* ── Body text ── */
.tk-step-body{padding:.05rem 0 .85rem 0;display:flex;flex-direction:column;gap:2px}
.tk-step:last-child .tk-step-body{padding-bottom:.05rem}
.tk-step-lbl{font-size:.72rem;font-weight:500;color:#d1d5db;line-height:1.3}
.tk-step.tk-done .tk-step-lbl{color:#3d8c00;font-weight:600}
.tk-step.tk-active .tk-step-lbl{color:#1a4200;font-weight:700;font-size:.75rem}
.tk-step-sub{
  font-size:.63rem;color:#6b7280;line-height:1.5;
  padding:.2rem .55rem;background:#f0fdf4;border-radius:5px;
  border-left:2px solid #89F336;margin-top:2px;display:inline-block
}

/* ── Products section ── */
.tk-section-lbl{
  font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;
  letter-spacing:1px;padding:0 18px;margin-bottom:8px
}
.tk-items{display:flex;flex-direction:column;gap:6px;padding:0 18px 14px}
.tk-item{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.tk-item-l{display:flex;flex-direction:column;gap:1px;min-width:0}
.tk-item-name{font-size:.73rem;font-weight:600;color:#111827}
.tk-item-specs{font-size:.62rem;color:#9ca3af;font-style:italic}
.tk-item-qty{font-size:.67rem;color:#6b7280;white-space:nowrap;flex-shrink:0}

/* ── Totals ── */
.tk-totals{
  border-top:1px solid #f3f4f6;padding:12px 18px 14px;
  display:flex;flex-direction:column;gap:5px
}
.tk-trow{display:flex;justify-content:space-between;font-size:.71rem;color:#6b7280}
.tk-trow-sub{color:#9ca3af}
.tk-trow-ttc{
  font-size:.8rem;font-weight:700;color:#111827;
  margin-top:4px;padding-top:8px;border-top:1px solid #f3f4f6
}

/* ── Actions ── */
.tk-actions{padding:0 18px 14px;display:flex;gap:8px;flex-wrap:wrap}
.tk-act-btn{
  display:inline-flex;align-items:center;gap:5px;
  padding:6px 13px;border-radius:7px;border:1.5px solid #e5e7eb;
  background:#fff;font-size:.68rem;font-weight:600;color:#374151;
  cursor:pointer;font-family:inherit;transition:all .15s
}
.tk-act-btn:hover{border-color:#89F336;color:#1a4200}

/* ── Extracted static inline styles ── */
.tk-card-hdr-r{display:flex;flex-direction:column;align-items:flex-end;gap:.4rem}
.tk-card-hdr-meta{font-size:.68rem;color:#9ca3af;font-weight:400}
.tk-delivery-lbl{color:#0891b2}
.tk-step-dot--cancelled{background:#ef4444;border-color:#ef4444;color:#fff}
.tk-step-lbl--cancelled{color:#ef4444}
.tk-brief-ref-inline{font-family:'Courier New',monospace;font-size:.65em;opacity:.75}
.tk-item-specs--brief{font-family:'Courier New',monospace;font-weight:600;color:#7c3aed}
.tk-item-qty--pending{color:#d97706;font-size:.63rem}
`;
    document.head.appendChild(s);
  })();

  const STATUS = {
    nouveau:       { label:'Nouveau',        dot:'#f59e0b' },
    en_cours:      { label:'En cours',       dot:'#2563eb' },
    en_impression: { label:'Impression',     dot:'#7c3aed' },
    finition:      { label:'Finition',       dot:'#0891b2' },
    conception:    { label:'Conception',     dot:'#7c3aed' },
    pret:          { label:'Prêt à livrer',  dot:'#16a34a' },
    livre:         { label:'Livré',          dot:'#059669' },
    annule:        { label:'Annulé',         dot:'#ef4444' },
  };

  // Base steps — always present
  const STEPS_BASE = [
    { key:['nouveau','en_cours','conception','en_impression','finition','pret','livre'],
      label:'Commande reçue', sub:'Enregistrée et confirmée.' },
    { key:['en_cours','conception','en_impression','finition','pret','livre'],
      label:'En traitement', sub:'Votre dossier est en préparation.' },
    { key:['en_impression','finition','pret','livre'],
      label:'En impression', sub:'Vos fichiers sont en cours d\'impression.' },
    { key:['finition','pret','livre'],
      label:'Finition', sub:'Découpe, pelliculage ou façonnage.' },
    { key:['pret','livre'],
      label:'Prêt', sub:'Votre commande est prête à être retirée ou livrée.' },
    { key:['livre'],
      label:'Livré · Terminé', sub:'Commande remise. Merci pour votre confiance.' },
  ];

  // Conception step — injected after "En traitement" only when order has design service
  const STEP_CONCEPTION = {
    key:['conception','en_impression','finition','pret','livre'],
    label:'Conception graphique', sub:'Nos graphistes travaillent sur votre design.',
    isConception: true,
  };

  async function lookup(ref) {
    const S_URL = window.SUPABASE_URL;
    const S_KEY = window.SUPABASE_ANON_KEY;
    if (!S_URL || !S_KEY) throw new Error('Config manquante');
    const res = await fetch(
      `${S_URL}/rest/v1/kote_orders?ref=eq.${encodeURIComponent(ref)}&select=*&limit=1`,
      { headers: { apikey: S_KEY, Authorization: 'Bearer ' + S_KEY } }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    return rows.length ? rows[0] : null;
  }

  const fmt  = n => (n||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2});
  const fmtN = n => (n||0).toLocaleString('fr-FR');

  function buildResultHTML(ord, opts = {}) {
    const p      = ord.payload || {};
    const items  = p.items || [];
    const ttc    = ord.total_ttc || Math.round((ord.total_ht||0)*1.20*100)/100;
    const delAmt = p.totals?.del || 0;
    const st     = STATUS[ord.status||'nouveau'] || STATUS.nouveau;
    const cancelled = (ord.status||'') === 'annule';

    // Build steps list — inject Conception step when order has design service or brief items
    const hasDesign = items.some(i =>
      (i.snap?.designOption === 'service' && i.snap?.designTier) ||
      i.snap?.type === 'brief'
    );

    // Find brief ref if any brief item present (for step label)
    const briefItem = items.find(i => i.snap?.type === 'brief');
    const briefRef  = briefItem?.snap?.brief_ref || null;

    const STEPS = hasDesign
      ? [...STEPS_BASE.slice(0,2), STEP_CONCEPTION, ...STEPS_BASE.slice(2)]
      : STEPS_BASE;

    const d = ord.created_at
      ? new Date(ord.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'long',year:'numeric'})
      : '—';

    const stepsHTML = STEPS.map((step, i) => {
      const isDone   = !cancelled && step.key.includes(ord.status||'nouveau');
      const isActive = isDone && (i === STEPS.length-1 || !STEPS[i+1].key.includes(ord.status||'nouveau'));
      const isLast   = i === STEPS.length-1;
      const isConception = !!step.isConception;
      const stepLabel = isConception && briefRef
        ? `${step.label} <span class="tk-brief-ref-inline">· ${briefRef}</span>`
        : step.label;
      const cls      = isActive ? 'tk-active' : isDone ? 'tk-done' : '';
      const dotStyle = isConception && isActive ? 'border-color:#7c3aed;background:#7c3aed;box-shadow:0 0 0 4px #ede9fe' :
                       isConception && isDone   ? 'border-color:#a78bfa;color:#7c3aed' : '';
      return `<div class="tk-step ${cls}">
        <div class="tk-step-node">
          <div class="tk-step-dot" ${dotStyle ? `style="${dotStyle}"` : ''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" width="10" height="10">
              ${isDone
                ? '<polyline points="4 12 9 17 20 7"/>'
                : '<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>'}
            </svg>
          </div>
          ${!isLast ? '<div class="tk-step-line"></div>' : ''}
        </div>
        <div class="tk-step-body">
          <div class="tk-step-lbl">${stepLabel}</div>
          ${isActive ? `<div class="tk-step-sub">${step.sub}</div>` : ''}
        </div>
      </div>`;
    }).join('');

    const cancelledHTML = cancelled ? `
      <div class="tk-step">
        <div class="tk-step-node">
          <div class="tk-step-dot tk-step-dot--cancelled">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="9" height="9"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </div>
        </div>
        <div class="tk-step-body">
          <div class="tk-step-lbl tk-step-lbl--cancelled">Annulée</div>
          <div class="tk-step-sub">Contactez-nous pour plus d'informations.</div>
        </div>
      </div>` : '';

    const itemsHTML = items.map(i => {
      const isBrief = i.snap?.type === 'brief';
      if (isBrief) {
        return `
      <div class="tk-item">
        <div class="tk-item-l">
          <span class="tk-item-name">${i.prodName}</span>
          ${i.snap?.brief_ref ? `<span class="tk-item-specs tk-item-specs--brief">${i.snap.brief_ref}</span>` : ''}
        </div>
        <span class="tk-item-qty tk-item-qty--pending">Prix en attente</span>
      </div>`;
      }
      return `
      <div class="tk-item">
        <div class="tk-item-l">
          <span class="tk-item-name">${i.prodName}</span>
          ${i.specs ? `<span class="tk-item-specs">${i.specs}</span>` : ''}
        </div>
        <span class="tk-item-qty">${fmtN(i.quantity)} ex.</span>
      </div>`;
    }).join('');

    const resetHTML = opts.resetFn
      ? `<button class="tk-act-btn" onclick="${opts.resetFn}">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
           Nouvelle recherche
         </button>`
      : '';

    return `
      <div class="tk-card-hdr">
        <div>
          <div class="tk-label">Référence</div>
          <div class="tk-ref">${ord.ref}</div>
          <div class="tk-date">${d}</div>
        </div>
        <div class="tk-card-hdr-r">
          <div class="tk-badge" style="color:${st.dot};background:${st.dot}18;border-color:${st.dot}35">
            <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:${st.dot};margin-right:5px;vertical-align:middle"></span>${st.label}
          </div>
          <div class="tk-card-hdr-meta">
            ${delAmt > 0 ? '<span class="tk-delivery-lbl">Livraison</span>' : 'Retrait boutique'}
          </div>
        </div>
      </div>
      <div class="tk-timeline">${stepsHTML}${cancelledHTML}</div>
      ${items.length ? `<div class="tk-section-lbl">Produits</div><div class="tk-items">${itemsHTML}</div>` : ''}
      <div class="tk-totals">
        <div class="tk-trow"><span>Sous-total HT</span><span>${fmt(ord.total_ht)} DH</span></div>
        ${delAmt > 0 ? `<div class="tk-trow tk-trow-sub"><span>Livraison</span><span>+${fmt(delAmt)} DH</span></div>` : ''}
        <div class="tk-trow tk-trow-sub"><span>TVA 20%</span><span>${fmt(ttc-(ord.total_ht||0))} DH</span></div>
        <div class="tk-trow tk-trow-ttc"><span>Total TTC</span><span>${fmt(ttc)} DH</span></div>
      </div>
      <div class="tk-actions">${resetHTML}</div>`;
  }

  return { lookup, buildResultHTML };
})();
window.TRK = TRK;
