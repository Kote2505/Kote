'use strict';

/* ════════════════════════════════════════════════════════
   kote-core.js — Foundation layer
   Pure data, formatters, icons, DB persistence, pricing engine,
   date/CDN utilities. No DOM rendering. Safe on every page.
   Load order: config.js → kote-core.js → everything else
   ════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════
   ADMIN  — password guard + full configuration panel
   ════════════════════════════════════════════════════════ */

/* ════ globals.js ════ */
/* ════════════════════════════════════════════════════════
   CONSTANTS & GLOBALS
   ════════════════════════════════════════════════════════ */
const APP_VERSION = 'kote-v9.6';

// Shared mutable state — kept minimal and explicit
let DB       = null;   // loaded data.json
let curProd  = null;   // currently configured product
let curSel   = {};     // current selection state
let editId   = null;   // cart item being edited (null = new)
let detailOpen = false;

/* ════════════════════════════════════════════════════════
   PERF  — boot timing tracer (call PERF.log() in DevTools)
   ════════════════════════════════════════════════════════ */
const PERF = (() => {
  const _marks = {};
  const _base  = performance.now();
  return {
    mark: k  => { _marks[k] = +(performance.now() - _base).toFixed(1); },
    log:  () => {
      console.table(
        Object.entries(_marks).map(([step, ms]) => ({ step, ms }))
      );
    },
    get:  k  => _marks[k] || 0,
  };
})();
PERF.mark('core_start');

/* ════════════════════════════════════════════════════════
   APP  — central boot contract
   Usage (from any module):
     APP.whenReady(db => { ... })   — run after DB is loaded
     APP.fail('reason')             — show central error UI
     APP.isReady()                  — check synchronously
   ════════════════════════════════════════════════════════ */
const APP = (() => {
  let _ready = false;
  const _queue = [];
  return {
    whenReady: fn => {
      if (_ready) { try { fn(DB); } catch(e) { console.error('[APP] whenReady cb error', e); } }
      else _queue.push(fn);
    },
    init: db => {
      if (_ready) return; // idempotent — ignore second call
      _ready = true;
      PERF.mark('app_ready');
      _queue.splice(0).forEach(fn => {
        try { fn(db); } catch(e) { console.error('[APP] boot queue error', e); }
      });
    },
    fail: reason => {
      PERF.mark('app_fail');
      console.error('[APP] boot failed:', reason);
      if (DB) return; // already recovered — don't overwrite good state
      const title = document.getElementById('vDBTitle');
      const sub   = document.getElementById('vDBSub');
      const btn   = document.getElementById('vDBBtn');
      if (title) title.textContent = 'Erreur de chargement';
      if (sub)   sub.innerHTML = `Impossible de charger la base.<br><span style="color:var(--rd);font-size:.85em">${reason}</span>`;
      if (btn) { btn.style.display = 'inline-flex'; btn.textContent = 'Réessayer'; btn.onclick = () => DB_MOD.tryRestore(); }
    },
    isReady: () => _ready,
  };
})();

/* ════════════════════════════════════════════════════════
   STATE  — reactive wrapper around core mutable globals
   Backed by the existing let-variables so all existing
   direct reads (DB, curProd, curSel, editId) keep working.

   Usage:
     STATE.set('db', value)         — mutate + notify listeners
     STATE.get('db')                — read current value
     STATE.on('db', fn)             — subscribe to changes
     STATE.off('db', fn)            — unsubscribe
     STATE.emit('curSel')           — notify without mutating
                                      (use after in-place mutation)
   Supported keys: 'db' | 'curProd' | 'curSel' | 'editId' | 'detailOpen'
   ════════════════════════════════════════════════════════ */
const STATE = (() => {
  const _listeners = {};

  function _emit(k, v) {
    (_listeners[k] || []).forEach(fn => {
      try { fn(v); } catch(e) { console.error(`[STATE] listener error on "${k}"`, e); }
    });
  }

  /* Map of key → getter/setter against the backing globals */
  const _store = {
    db:          { get: ()  => DB,          set: v => { DB          = v; } },
    curProd:     { get: ()  => curProd,     set: v => { curProd     = v; } },
    curSel:      { get: ()  => curSel,      set: v => { curSel      = v; } },
    editId:      { get: ()  => editId,      set: v => { editId      = v; } },
    detailOpen:  { get: ()  => detailOpen,  set: v => { detailOpen  = v; } },
  };

  return {
    get: k => {
      const entry = _store[k];
      if (!entry) { console.warn(`[STATE] unknown key: "${k}"`); return undefined; }
      return entry.get();
    },
    set: (k, v) => {
      const entry = _store[k];
      if (!entry) { console.warn(`[STATE] unknown key: "${k}"`); return; }
      entry.set(v);
      _emit(k, v);
    },
    /* Notify listeners without mutating — use after direct in-place object mutation */
    emit: k => {
      const entry = _store[k];
      if (!entry) return;
      _emit(k, entry.get());
    },
    on:  (k, fn) => {
      if (!_listeners[k]) _listeners[k] = [];
      _listeners[k].push(fn);
    },
    off: (k, fn) => {
      if (!_listeners[k]) return;
      _listeners[k] = _listeners[k].filter(f => f !== fn);
    },
  };
})();

/* DOM shortcut */
const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════
   FORMATTERS  (pure, no side-effects)
   ════════════════════════════════════════════════════════ */
const fmt  = n => n.toLocaleString('fr-MA', {minimumFractionDigits:2, maximumFractionDigits:2});
const fmtN = n => n.toLocaleString('fr-FR').replace(/\u202F/g, '\u00A0');

/* ════════════════════════════════════════════════════════
   ICONS  (SVG sprite map, keyed by name)
   ════════════════════════════════════════════════════════ */
const IC = (() => {
  const s = (d, sw=1.75) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}">${d}</svg>`;
  return {
    'credit-card': s('<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>'),
    'file-text':   s('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'),
    'layout':      s('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="13" y1="21" x2="13" y2="9"/>'),
    'book-open':   s('<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>'),
    'book':        s('<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>'),
    'tag':         s('<path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    'image':       s('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
    'scroll':      s('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/>'),
    'flag':        s('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    'pen-tool':    s('<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'),
    'check':       s('<polyline points="20 6 9 17 4 12"/>', 2.5),
    'cart':        s('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>', 2),
    'chev-r':      s('<path d="M9 18l6-6-6-6"/>', 2),
    'chev-d':      s('<path d="M6 9l6 6 6-6"/>', 2),
    'trash':       s('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/>', 1.8),
    'edit':        s('<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/>', 1.8),
    'truck':       s('<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>', 1.8),
    'arrow-l':     s('<path d="M19 12H5M12 5l-7 7 7 7"/>', 2),
    'info':        s('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 2),
    'plus':        s('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 2),
    'alert':       s('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', 2),
    'file-plus':   s('<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>', 1.8),
    'layers':      s('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    'printer':     s('<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
    'clock':       s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    'wifi-off':    s('<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01"/>'),
    'whatsapp':    s('<path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>', 1.8),
    'mail':        s('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>', 1.8),
  };
})();

/* ════════════════════════════════════════════════════════
   SECTION_CATALOG  — master vocabulary of all section types
   Used by the admin section builder + DB migration
   ════════════════════════════════════════════════════════ */
const SECTION_CATALOG = [
  /* ── FORMAT & DIMENSIONS ─────────────────────────────────────────────────
     ONE unified 'size' section replaces all legacy size variants.
     The admin picks a mode in section config; the client sees only that UI.
     All modes produce a normalized sizeObj written to curSel.
     Legacy IDs below (deprecated:true) are kept for _migrateDB backward compat.
  ── */
  {
    id:           'size',
    label:        'Format & Dimensions',
    icon:         'layout',
    group:        'structure',
    configurable: true,
    desc:         'Section format unifiée — mode: presets | free | derived | rollup | sqm',
    modes: [
      { id:'presets', label:'Formats prédéfinis',         engines:['sheet_fit','carnet'],  desc:'Chips W×H + sur mesure optionnel' },
      { id:'free',    label:'Format ouvert libre (mm)',   engines:['packaging'],           desc:'Saisie L × H directe — boîtes, étuis' },
      { id:'derived', label:'Format calculé sac',         engines:['packaging'],           desc:'L × H × Soufflet → FO calculé automatiquement' },
      { id:'boite',   label:'Format calculé boîte',       engines:['packaging'],           desc:'L × H × Profondeur → FO calculé (languette 15 mm)' },
      { id:'rollup',  label:'Formats présentoir',         engines:['sqm'],                 desc:'Presets avec coût de base (rollup, kakémono, totem)' },
      { id:'sqm',     label:'Dimensions libres GF (cm)', engines:['sqm'],                 desc:'Saisie W × H en cm — bâche, vinyle, poster GF' },
    ],
  },
  /* ── deprecated: superseded by unified 'size' — kept for _migrateDB only ── */
  { id:'depl-format',   deprecated:true, superseded_by:'size', mode_hint:'presets', label:'Format dépliant (dépr.)',      icon:'scroll',       group:'structure', configurable:true,  desc:'→ Utiliser section Format · mode presets + fold:true' },
  { id:'rollup-size',   deprecated:true, superseded_by:'size', mode_hint:'rollup',  label:'Format roll-up (dépr.)',       icon:'scroll',       group:'structure', configurable:true,  desc:'→ Utiliser section Format · mode rollup' },
  { id:'gf-dims',       deprecated:true, superseded_by:'size', mode_hint:'sqm',     label:'Dimensions libres GF (dépr.)', icon:'layout',       group:'structure', configurable:false, desc:'→ Utiliser section Format · mode sqm' },
  { id:'format-ouvert', deprecated:true, superseded_by:'size', mode_hint:'free',    label:'Format ouvert (dépr.)',        icon:'box',          group:'structure', configurable:false, desc:'→ Utiliser section Format · mode free' },
  { id:'sac-format',    deprecated:true, superseded_by:'size', mode_hint:'derived', label:'Format sac (dépr.)',           icon:'shopping-bag', group:'structure', configurable:true,  desc:'→ Utiliser section Format · mode derived' },
  { id:'boite-format',  deprecated:true, superseded_by:'size', mode_hint:'boite',   label:'Format boîte (dépr.)',          icon:'box',          group:'structure', configurable:true,  desc:'→ Utiliser section Format · mode boite' },
  { id:'carnet-format', deprecated:true, superseded_by:'size', mode_hint:'presets', label:'Format carnet (dépr.)',        icon:'book',         group:'structure', configurable:false, desc:'→ Utiliser section Format · mode presets' },

  /* ── MATIÈRES & SUPPORT ──────────────────────────────────────────────── */
  { id:'paper',           label:'Papier',                icon:'file-text', group:'materials',  configurable:true,  desc:'Papier standard + spéciaux'       },
  { id:'cat-int',         label:'Intérieur catalogue',   icon:'layers',    group:'materials',  configurable:true,  desc:'Papier + finition intérieur'      },
  { id:'cat-cov',         label:'Couverture catalogue',  icon:'book-open', group:'materials',  configurable:true,  desc:'Papier + finition couverture'     },
  { id:'gf-material',     label:'Matière grand format',  icon:'image',     group:'materials',  configurable:true,  desc:'Matières visibles par le client'  },
  { id:'pancarte-support',label:'Support rigide',         icon:'layers',    group:'materials',  configurable:true,  desc:'Matériaux visibles par le client'  },
  { id:'env-support',     label:'Support enveloppe',      icon:'credit-card',group:'materials', configurable:true, desc:'Autodex / Normal / Spécial'       },

  /* ── IMPRESSION ──────────────────────────────────────────────────────── */
  { id:'sides',           label:'Recto / Recto-Verso',   icon:'layers',    group:'impression', configurable:true,  desc:'Mode d\'impression'               },
  { id:'env-offset-colors',label:'Couleurs offset env.', icon:'layers',    group:'impression', configurable:true,  desc:'Impression offset — nb couleurs'  },

  /* ── FINITIONS ───────────────────────────────────────────────────────── */
  { id:'lam',             label:'Pelliculage',            icon:'tag',       group:'finish',     configurable:true,  desc:'Finition de surface'              },
  {
    id:           'addon',
    label:        'Façonnage & finitions',
    icon:         'flag',
    group:        'finish',
    configurable: true,
    desc:         'Options spéciales — vernis, dorure, gaufrage. Active fd_enabled:true pour ajouter Forme de découpe dans ce bloc (moteurs sheet_fit uniquement)',
  },
  { id:'gf-options',      label:'Options grand format',  icon:'flag',      group:'finish',     configurable:true,  desc:'Finitions grand format'           },
  { id:'chemise-options', label:'Options chemise',        icon:'folder',    group:'finish',     configurable:false, desc:'Rabat collé / rabat imprimé'      },
  /* ── Forme de découpe — comportement conditionnel par moteur ─
     packaging  → bloc standalone visible, toujours présent
     sheet_fit  → option dans le bloc addon (config fd_enabled:true sur la section addon)
     Ne pas ajouter manuellement sur un produit sheet_fit — activer via addon.config.fd_enabled ── */
  {
    id:           'forme-decoupe',
    label:        'Forme de découpe',
    icon:         'scissors',
    group:        'finish',
    configurable: true,
    desc:         'Packaging : bloc standalone · Feuille presse : option inside addon (fd_enabled). Stocke sel.fd = { enabled, reuse, setup_cost }',
  },

  /* ── RELIURE & ASSEMBLAGE ─────────────────────────────────────────────── */
  { id:'cat-pages',       label:'Nombre de pages',       icon:'book',      group:'booklet',    configurable:true,  desc:'Sélecteur de pages catalogue'     },
  { id:'cat-bind',        label:'Reliure',               icon:'book',      group:'booklet',    configurable:true,  desc:'Type de reliure'                  },
  { id:'carnet-pages',    label:'Feuillets par carnet',  icon:'book-open', group:'booklet',    configurable:true,  desc:'Nombre de feuillets (hors couv.)' },
  { id:'carnet-souches',  label:'Nombre de souches',     icon:'layers',    group:'booklet',    configurable:true,  desc:'2 à 5 souches NCR couleurs'       },
  { id:'carnet-options',  label:'Options carnet',        icon:'flag',      group:'booklet',    configurable:true,  desc:'Numérotation, perfo, couverture'  },

  /* ── OPTIONS EMBALLAGE ───────────────────────────────────────────────── */
  { id:'rollup-options',  label:'Options roll-up',       icon:'flag',      group:'packaging',  configurable:false, desc:'Support aluminium'                },
  { id:'sac-options',     label:'Soufflet sac',           icon:'package',   group:'packaging',  configurable:false, desc:'Soufflet latéral mm (legacy — absorbé dans size mode:derived)' },

  /* ── ENVELOPPE ───────────────────────────────────────────────────────── */
  { id:'env-size',        label:'Format enveloppe',       icon:'layout',    group:'envelope',   configurable:true,  desc:'Formats DL / C6 / C5… sélectionnables'},
  { id:'env-fenetre',     label:'Fenêtre enveloppe',      icon:'credit-card',group:'envelope',  configurable:false, desc:'Avec / sans fenêtre (choix client)'},

  /* ── QUANTITÉ ────────────────────────────────────────────────────────── */
  { id:'qty',             label:'Quantité',               icon:'scroll',    group:'order',      configurable:true,  desc:'Paliers de quantité'              },
  { id:'gadget-qty',      label:'Quantité gadget',        icon:'package',   group:'order',      configurable:true,  desc:'Quantités fixes — gadgets'        },

  /* ── CONCEPTION ──────────────────────────────────────────────────────── */
  { id:'conception-type', label:'Prestation conception', icon:'pen-tool',  group:'conception', configurable:false, desc:'Type de prestation conception'    },
  { id:'design-file',     label:'Conception & fichier',  icon:'pen-tool',  group:'design',     configurable:true,  desc:'Upload fichier client + niveaux de conception graphique'},

  /* ── COMMANDE ────────────────────────────────────────────────────────── */
  { id:'notes',           label:'Notes & instructions',  icon:'file-plus', group:'order',      configurable:false, desc:'Champ texte libre'                },
];

/* ── Helper: normalise product sections → composition array ── */
function _getComposition(p) {
  if (p.composition) return p.composition;
  return (p.sections || []).map(s => ({ type_id: s, config: {} }));
}

/* ── DB migration: convert old flat arrays → composition ── */
function _migrateDB(db) {
  if (!db?.products) return;
  db.products.forEach(p => {
    if (p.composition) return;   // already new format
    const sections = p.sections || [];
    p.composition = sections.map(sid => {
      const entry = { type_id: sid, config: {} };
      switch (sid) {
        case 'paper':
          entry.config = {
            allowed: [...(p.paper_stocks || [])],
            special: [...(p.paper_stocks_special || [])],
          };
          break;
        case 'lam':
          entry.config = { allowed: [...(p.finishes_lam || [])] };
          break;
        case 'addon':
          entry.config = { allowed: [...(p.finishes_addon || [])] };
          break;
        case 'cat-int':
          entry.config = {
            allowed: [...(p.paper_stocks || [])],
            lam:     [...(p.finishes_lam_int || [])],
          };
          break;
        case 'cat-cov':
          entry.config = {
            allowed: [...(p.paper_stocks_cover || [])],
            lam:     [...(p.finishes_lam || [])],
          };
          break;
        case 'gf-options':
          entry.config = { allowed: [...(p.gf_finish_options || [])] };
          break;
        default:
          entry.config = {};
      }
      return entry;
    });
  });

  /* ── Offset profiles migration: single DB.offset → DB.offset_profiles array ── */
  if (!db.offset_profiles || !Array.isArray(db.offset_profiles) || db.offset_profiles.length === 0) {
    const legacy = db.offset || {};
    db.offset_profiles = [{
      id:             'default',
      label:          'Standard',
      enabled:        legacy.enabled !== false,
      min_sheets:     legacy.min_sheets  || 1000,
      setup_cost:     legacy.setup_cost  || 0,
      cost_per_plate: legacy.cost_per_plate || 0,
      print_single:   legacy.print_single || 1.5,
      print_double:   legacy.print_double || 2,
      planche_recto:  legacy.planche_recto || 6,
      planche_rv:     legacy.planche_rv    || 7,
    }];
  }
  /* Keep DB.offset as alias to first profile for backward compat */
  db.offset = db.offset_profiles[0];

  /* ── Paper cost_per_sheet migration: copy print_recto → cost_per_sheet ── */
  (db.paper_stocks || []).forEach(ps => {
    if (ps.cost_per_sheet == null && ps.print_recto != null) {
      ps.cost_per_sheet = ps.print_recto;
    }
  });

  /* ── Unified size section migration ──────────────────────────────────────
     Replaces legacy size type_ids in product compositions with the unified
     'size' section, carrying a mode config that tells the renderer which UI
     to show and which curSel fields to write.

     Also migrates 'forme-decoupe' in sheet_fit products:
       - packaging engine → leave as standalone section (unchanged)
       - sheet_fit engine → absorb into addon section config (fd_enabled:true),
         remove the standalone section
     ── */
  const _SIZE_LEGACY_MAP = {
    'depl-format':   (p, cfg) => ({ mode:'presets', fold:true,  items: cfg.items || p.sizes || [] }),
    'rollup-size':   (p, cfg) => ({ mode:'rollup',              items: cfg.items || p.sizes || [] }),
    'gf-dims':       ()       => ({ mode:'sqm' }),
    'format-ouvert': ()       => ({ mode:'free' }),
    'sac-format':    (p, cfg) => ({ mode:'derived', presets: cfg.presets || [] }),
    'boite-format':  (p, cfg) => ({ mode:'boite',   presets: cfg.presets || [] }),
    'carnet-format': (p, cfg) => ({ mode:'presets',             items: cfg.items || p.sizes || [] }),
  };

  db.products.forEach(p => {
    if (!p.composition) return;
    const engine = p.calc_engine || 'sheet_fit';
    let fdAbsorbed = false;   // true if a forme-decoupe section was pulled into addon

    p.composition = p.composition.map(entry => {
      const typeId  = typeof entry === 'string' ? entry : entry.type_id;
      const cfg     = typeof entry === 'string' ? {} : (entry.config || {});

      /* ── Absorb 'forme-decoupe' into addon for non-packaging engines ── */
      if (typeId === 'forme-decoupe' && engine !== 'packaging') {
        fdAbsorbed = true;
        return null; // removed; addon will receive fd_enabled below
      }

      /* ── Map legacy size type_id → unified 'size' with mode ── */
      if (_SIZE_LEGACY_MAP[typeId]) {
        const modeConfig = _SIZE_LEGACY_MAP[typeId](p, cfg);
        // Merge existing config keys (e.g. allow_custom, allowed papers) with mode config
        return { type_id: 'size', config: { ...cfg, ...modeConfig } };
      }

      /* ── Normalise string entries (old flat-array format) ── */
      return typeof entry === 'string' ? { type_id: entry, config: {} } : entry;
    }).filter(Boolean);

    /* ── If FD was absorbed, enable it in the addon section config ── */
    if (fdAbsorbed) {
      const addonEntry = p.composition.find(e => e.type_id === 'addon');
      if (addonEntry) {
        addonEntry.config        = addonEntry.config || {};
        addonEntry.config.fd_enabled    = true;
        // null → inherit from DB.forme_decoupe.setup at runtime
        addonEntry.config.fd_setup_cost = addonEntry.config.fd_setup_cost ?? null;
      }
      // If no addon section exists, add a minimal one so FD isn't lost
      else {
        p.composition.splice(
          p.composition.findIndex(e => e.type_id === 'qty'), 0,
          { type_id: 'addon', config: { allowed: [], fd_enabled: true, fd_setup_cost: null } }
        );
      }
    }
  });
}


/* ════ db.js ════ */
const DB_MOD = (() => {

  let _source = DEFAULT_SOURCE; // runtime active source

  /* ── JSON button dual-state: "JSON" when loaded, "Charger" when not ── */
  function _updateJsonBtn(state) {
    const btn = $('dbBtnJson');
    if (!btn) return;
    if (_source !== 'json') {
      /* Supabase mode — restore default label, normal toggle behaviour */
      btn.textContent = 'JSON';
      btn.onclick = () => DB_MOD.setSource('json');
      return;
    }
    if (state === 'on') {
      /* JSON loaded fine — show "JSON", click re-fetches */
      btn.textContent = 'JSON';
      btn.onclick = () => DB_MOD.setSource('json');
    } else {
      /* Not loaded / error — show "Charger", click opens file picker */
      btn.textContent = 'Charger';
      btn.onclick = () => $('dbFile')?.click();
    }
  }

  /* ── Toggle UI sync ── */
  function _syncToggleUI() {
    const bjson = $('dbBtnJson'), bsupa = $('dbBtnSupa');
    if (!bjson || !bsupa) return;
    bjson.classList.toggle('on', _source === 'json');
    bsupa.classList.toggle('on', _source === 'supabase');
    /* On source switch, reset JSON button to pending state if switching to JSON */
    if (_source === 'json') _updateJsonBtn('');
    // Update empty-state content to match active source
    const isSupa = _source === 'supabase';
    const title = $('vDBTitle'), sub = $('vDBSub'), btn = $('vDBBtn');
    if (title) title.textContent = isSupa ? 'Connexion Supabase…' : 'Aucune base chargée';
    if (sub)   sub.innerHTML     = isSupa
      ? 'Connexion en cours à <strong>Supabase</strong>…'
      : 'Chargez votre fichier <strong>data.json</strong>';
    if (btn) {
      btn.style.display = isSupa ? 'none' : 'inline-flex';
    }
  }

  /* ── Status helper ── */
  function _status(text, state = '') {
    const st  = $('dbStatus'); if (!st) return;
    const dot = $('dbDot');
    st.textContent = text;
    st.title = text;
    st.className = 'sb-db-st' + (state ? ' ' + state : '');
    if (dot) {
      dot.className = 'sb-db-dot';
      if      (state === 'on')  dot.classList.add('connected');
      else if (state === 'err') dot.classList.add('error');
      else                      dot.classList.add('pending');
    }
    _updateJsonBtn(state);
    if (typeof ADMIN !== 'undefined' && ADMIN.syncDbDot) ADMIN.syncDbDot();
  }

  /* ── Apply parsed DB object ── */
  function _apply(parsed, label) {
    STATE.set('db', parsed); // sets DB + notifies 'db' listeners
    _migrateDB(DB);
    PERF.mark('db_ready');
    APP.init(DB);
    window._jsonClients = Array.isArray(parsed._clients) ? parsed._clients : null;
    window._jsonQuotes  = Array.isArray(parsed._quotes)  ? parsed._quotes  : null;
    _status(label, 'on');
    _updateJsonBtn('on');
    if (ROLE === 'provider') {
      const tag = $('admSourceTag');
      if (tag) tag.textContent = DB_MOD.getSource() === 'supabase' ? 'Supabase' : 'JSON local';
      // Go to dashboard — ADMIN.goToDash handles all display logic
      if (typeof ADMIN !== 'undefined') {
        ADMIN.goToDash();
      } else {
        // Fallback if ADMIN not loaded yet
        $('vDB').style.display   = 'none';
        $('vDash').style.display = 'flex';
      }
      UI.buildSidebar();
      DASHBOARD.load();
    } else {
      UI.buildSidebar();
      UI.show('vEmpty');
      if (typeof AUTH !== 'undefined') AUTH.init();
    }
  }

  /* ── Session persistence ── */
  function _save(raw, name) {
    try {
      sessionStorage.setItem('kote_db',        raw);
      sessionStorage.setItem('kote_db_name',   name);
      sessionStorage.setItem('kote_db_source', _source);
    } catch (_) {}
  }

  /* ── Manual file upload ── */
  function onFile(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      let parsed;
      try { parsed = JSON.parse(e.target.result); }
      catch { alert('JSON invalide.'); return; }
      _source = 'json';
      _syncToggleUI();
      _apply(parsed, file.name);
      _save(e.target.result, file.name);
    };
    reader.readAsText(file);
    input.value = '';
  }

  /* ── Fetch data.json — falls back to file upload prompt if not found ── */
  async function _fetchJSON() {
    PERF.mark('json_fetch_start');
    _status('Chargement…', 'pending');
    try {
      const res = await fetch('./data.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = await res.json();
      _apply(parsed, 'data.json');
      _save(JSON.stringify(parsed), 'data.json');
    } catch(e) {
      _status('data.json introuvable', 'err');
      console.warn('DB_MOD: data.json fetch failed', e);
      APP.fail('data.json introuvable — chargez votre fichier manuellement');
      /* Show file upload prompt prominently */
      const title = $('vDBTitle'), sub = $('vDBSub'), btn = $('vDBBtn');
      if (title) title.textContent = 'Aucune base chargée';
      if (sub)   sub.innerHTML = 'Chargez votre fichier <strong>data.json</strong>';
      if (btn) {
        btn.style.display = 'inline-flex';
        btn.onclick = () => $('dbFile').click();
      }
    }
  }

  let _booted = false; // prevents double-init (tryRestore called from both kote-orders.js and kote-admin.js)

  /* ── Fetch Supabase kote_config view ── */
  async function _fetchSupabase() {
    PERF.mark('supabase_fetch_start');
    _status('Connexion…', 'pending');
    try {
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/kote_config?select=*&id=eq.1`,
        { headers: { 'apikey': window.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!rows || !rows.length) throw new Error('Aucun résultat');
      const parsed = rows[0];
      _apply(parsed, 'Supabase');
      _save(JSON.stringify(parsed), 'Supabase');
    } catch(e) {
      _status('Supabase erreur', 'err');
      console.warn('DB_MOD: Supabase fetch failed', e);
      APP.fail(`Supabase : ${e.message || 'connexion échouée'}`);
      // Update empty state to show error + retry
      const title = $('vDBTitle'), sub = $('vDBSub'), btn = $('vDBBtn');
      if (title) title.textContent = 'Connexion Supabase échouée';
      if (sub)   sub.innerHTML = 'Impossible de joindre la base.<br>Vérifiez vos identifiants ou chargez un fichier JSON.';
      if (btn) { btn.style.display = 'inline-flex'; btn.textContent = 'Charger data.json'; btn.onclick = () => $('dbFile').click(); }
    }
  }

  /* ── Source toggle (called by UI buttons) ── */
  function setSource(src) {
    _source = src;
    _syncToggleUI();
    if (src === 'json')      _fetchJSON();
    else                     _fetchSupabase();
  }

  /* ── Session restore ── */
  function tryRestore() {
    if (_booted) return; // guard: kote-orders.js + kote-admin.js both call this — only first runs
    _booted = true;
    PERF.mark('try_restore');
    _syncToggleUI();
    try {
      if (sessionStorage.getItem('kote_version') !== APP_VERSION) {
        sessionStorage.clear();
        sessionStorage.setItem('kote_version', APP_VERSION);
        // Fall through to auto-boot
      } else {
        const raw  = sessionStorage.getItem('kote_db');
        const name = sessionStorage.getItem('kote_db_name') || 'data.json';
        const src  = sessionStorage.getItem('kote_db_source') || DEFAULT_SOURCE;
        if (raw) {
          const cachedAt  = parseInt(sessionStorage.getItem('kote_db_cached_at') || '0', 10);
          const updatedAt = parseInt(localStorage.getItem('kote_db_updated_at')  || '0', 10);
          if (updatedAt > cachedAt) {
            sessionStorage.removeItem('kote_db'); // admin changed DB after this tab cached — fetch fresh
          } else {
            _source = src; _syncToggleUI();
            PERF.mark('session_restore');
            _apply(JSON.parse(raw), name);
            return;
          }
        }
      }
    } catch (_) {}
    // Auto-boot from DEFAULT_SOURCE
    if (DEFAULT_SOURCE === 'supabase') _fetchSupabase();
    else                               _fetchJSON();
  }

  /* ── Persist after admin edits ── */
  function persistCurrent() {
    try {
      const now = String(Date.now());
      sessionStorage.setItem('kote_db',           JSON.stringify(STATE.get('db')));
      sessionStorage.setItem('kote_db_cached_at', now);
      localStorage.setItem('kote_db_updated_at',  now); // signal all other tabs
    } catch (_) {}
  }

  /* ── Granular patch — coalescing debounce ────────────────
     Collects top-level column keys dirtied during a burst of
     ADMIN.set() calls, then sends ONE PATCH after 800ms idle.

     Usage (from ADMIN.set):
       DB_MOD.pushPath('shop.name')       → queues 'shop'
       DB_MOD.pushPath('products.0.price')→ queues 'products'
       DB_MOD.pushPath('pricing.margin')  → queues 'pricing'
     After 800ms idle → single PATCH { shop, products, pricing }
  ──────────────────────────────────────────────────────── */
  const _pendingPatch = new Set();  // dirty top-level column keys
  let   _patchTimer   = null;       // debounce handle

  /* Extract top-level column key from dot-path */
  function _topKey(dotPath) {
    return dotPath.split('.')[0];
  }

  /* Immediately PATCH only the dirty columns */
  async function _patchNow() {
    if (!_pendingPatch.size) return;
    const db   = STATE.get('db');
    const keys = [..._pendingPatch];
    _pendingPatch.clear();
    const body = {};
    keys.forEach(k => { if (db[k] !== undefined) body[k] = db[k]; });
    if (!Object.keys(body).length) return;
    PERF.mark('patch_start');
    console.info('[DB_MOD] granular PATCH:', keys.join(', '));
    try {
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/kote_config?id=eq.1`,
        {
          method:  'PATCH',
          headers: {
            'apikey':        window.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',  // faster — no response body needed
          },
          body: JSON.stringify(body),
        }
      );
      PERF.mark('patch_done');
      if (res.status === 403 || res.status === 401) {
        console.warn('[DB_MOD] patch permission denied');
        return { ok: false, reason: 'permission' };
      }
      if (!res.ok) {
        console.warn('[DB_MOD] patch failed:', res.status);
        return { ok: false, reason: `HTTP ${res.status}` };
      }
      return { ok: true, keys };
    } catch(e) {
      console.warn('[DB_MOD] patch network error:', e);
      // Re-queue the keys so next save attempt includes them
      keys.forEach(k => _pendingPatch.add(k));
      return { ok: false, reason: 'network' };
    }
  }

  /* Queue a dot-path for patching, debounced 800ms */
  function pushPath(dotPath) {
    if (_source !== 'supabase') return; // JSON mode — no remote write
    _pendingPatch.add(_topKey(dotPath));
    persistCurrent(); // always update session immediately
    clearTimeout(_patchTimer);
    _patchTimer = setTimeout(_patchNow, 800);
  }

  /* Flush any pending patch immediately (call before page unload) */
  function flushPatch() {
    clearTimeout(_patchTimer);
    return _patchNow();
  }

  async function pushToSupabase() {
    const body = {};
    const db = STATE.get('db');
    Object.keys(db).forEach(k => { if (k !== 'id') body[k] = db[k]; });
    try {
      const res = await fetch(
        `${window.SUPABASE_URL}/rest/v1/kote_config?id=eq.1`,
        {
          method:  'PATCH',
          headers: {
            'apikey':        window.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + window.SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=representation',
          },
          body: JSON.stringify(body),
        }
      );

      const rawText = await res.text();

      if (res.status === 403 || res.status === 401) return { ok: false, reason: 'permission' };
      if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

      let rows;
      try { rows = JSON.parse(rawText); } catch(_) { rows = null; }
      if (!rows || !rows.length) return { ok: false, reason: 'no_rows' };

      return { ok: true };
    } catch(e) {
      console.warn('DB_MOD: network error', e);
      return { ok: false, reason: 'network' };
    }
  }

  function getSource() { return _source; }

  return { onFile, tryRestore, persistCurrent, setSource, pushToSupabase, getSource, pushPath, flushPatch };
})();


/* ════ calc.js ════ */
const CALC = (() => {

  /* ── Sheet imposition: best fit portrait vs landscape ── */
  function sheetFit(iW, iH, sh) {
    const uw = sh.w - sh.margin * 2, uh = sh.h - sh.margin * 2;
    const sW = iW + sh.bleed * 2,   sH = iH + sh.bleed * 2;
    const P = { cols: Math.floor(uw / sW), rows: Math.floor(uh / sH), rotated: false };
    const L = { cols: Math.floor(uw / sH), rows: Math.floor(uh / sW), rotated: true  };
    P.n = P.cols * P.rows;
    L.n = L.cols * L.rows;
    const best = L.n > P.n ? L : P;
    return { ...best, n: Math.max(best.n, 1) };
  }

  /* ── Quantity discount — supports 3 modes + marge floor protection ── */
  function qtyDisc(quantity, pr) {
    // Legacy: if pr is an array (old call style), treat as paliers with no cap
    if (Array.isArray(pr)) {
      return ([...pr].reverse().find(d => quantity >= d.min)?.disc) || 0;
    }
    if (!pr) return 0;
    const mode    = pr.remise_mode || (pr.qty_discounts?.length ? 'paliers' : null);
    const enabled = pr.remise_enabled !== false;
    if (!mode || !enabled) return 0;

    // Marge floor cap: never allow a discount that would push margin below remise_min_marge
    const margin   = pr.profit_margin || 0.33;
    const floor    = pr.remise_min_marge ?? 0.15;
    const maxDisc  = Math.max(0, margin - floor);

    let raw = 0;

    if (mode === 'paliers') {
      const tiers = pr.qty_discounts || [];
      raw = ([...tiers].reverse().find(d => quantity >= d.min)?.disc) || 0;

    } else if (mode === 'lineaire') {
      const l = pr.remise_lineaire || {};
      const { qty1 = 500, disc1 = 0, qty2 = 2500, disc2 = 0.15 } = l;
      if (quantity < qty1) raw = 0;
      else if (quantity >= qty2) raw = disc2;
      else raw = disc1 + (quantity - qty1) / (qty2 - qty1) * (disc2 - disc1);

    } else if (mode === 'degressif') {
      const d = pr.remise_degressif || {};
      const { qty_min = 100, qty_max = 5000, disc_min = 0, disc_max = 0.15, curve = 'sqrt' } = d;
      if (quantity <= qty_min) raw = disc_min;
      else if (quantity >= qty_max) raw = disc_max;
      else {
        const t_lin = (quantity - qty_min) / (qty_max - qty_min);
        // φ = golden ratio (Fibonacci limit)
        const PHI = (1 + Math.sqrt(5)) / 2;
        const t = curve === 'log'  ? Math.log(quantity / qty_min) / Math.log(qty_max / qty_min)
                : curve === 'sqrt' ? Math.sqrt(t_lin)
                : curve === 'exp'  ? 1 - Math.exp(-3 * t_lin)          // e-based, asymptotic ~95% at qty_max
                : curve === 'fib'  ? 1 - Math.pow(1 / PHI, 5 * t_lin)  // φ-based, asymptotic ~91% at qty_max
                :                    t_lin;
        raw = disc_min + t * (disc_max - disc_min);
      }
    }

    return Math.min(raw, maxDisc);
  }

  /* ── Addon line costs (setup_sheet | per_sheet | per_unit) ── */
  function addonLines(addons, addonFaces, sheets, quantity, db) {
    return (addons || []).map(id => {
      const f = (db.finishes_addon || []).find(x => x.id === id);
      if (!f) return { id, label: id, cost: 0 };
      const faces = addonFaces?.[id] || 1;
      let cost = 0;
      if      (f.pricing_model === 'setup_sheet') cost = f.cost_setup + f.cost_ps * sheets * faces;
      else if (f.pricing_model === 'per_sheet')   cost = f.cost_ps * sheets;
      else if (f.pricing_model === 'per_unit')    cost = f.cost_pu * quantity;
      return { id, label: f.label, model: f.pricing_model, cost, faces };
    });
  }

  /* ── Raw cost → selling price via profit margin ── */
  function applyMargin(raw, margin) {
    return raw / (1 - margin);
  }

  /* ── Resolve offset profile for a product ── */
  function _resolveOffsetProfile(product, db) {
    const profiles = db.offset_profiles || [];
    if (!profiles.length) return db.offset || {};
    const pid = product?.offset_profile_id;
    if (pid) {
      const found = profiles.find(p => p.id === pid);
      if (found) return found;
    }
    return profiles[0]; // fallback to first / default
  }

  /* ── Resolve numérique profile for a product ── */
  function _resolveNumProfile(product, db) {
    const profiles = db.numerique_profiles || [];
    if (!profiles.length) return null;
    const pid = product?.num_profile_id;
    if (pid) {
      const found = profiles.find(p => p.id === pid);
      if (found) return found;
    }
    return profiles[0]; // fallback to first / default
  }

  /* ── Main price dispatcher ── */
  /* ── Legacy product_type → calc_engine mapper ── */
  function _legacyEngine(type) {
    const map = { catalogue:'sheet_fit', grand_format:'sqm', rollup:'sqm', pancarte:'sqm',
                  conception:'service', gadget:'gadget', carnet:'carnet' };
    return map[type] || 'sheet_fit';
  }

  function price(sel, db) {
    if (!curProd) return null;
    // If the product composition contains envelope sections, always use the gadget engine
    // regardless of calc_engine — the enveloppe product has calc_engine:'sheet_fit' in DB
    // but must be priced via _priceGadget which understands envFormatId / envTypeId
    const hasEnvComposition = _getComposition(curProd).some(e =>
      ['env-size','env-support','env-offset-colors','env-fenetre'].includes(
        typeof e === 'string' ? e : e.type_id
      )
    );
    if (hasEnvComposition) return _priceGadget(sel, db);
    // If composition contains format-ouvert, always use sheet_fit engine (packaging logic)
    // — independent of calc_engine or product_type
    const hasFormatOuvert = _getComposition(curProd).some(e =>
      (typeof e === 'string' ? e : e.type_id) === 'format-ouvert'
    );
    if (hasFormatOuvert) return _priceSheetFit(sel, db);
    const engine = curProd.calc_engine || _legacyEngine(curProd.product_type);
    switch (engine) {
      case 'sheet_fit':
      case 'packaging': return _priceSheetFit(sel, db);
      case 'sqm':       return _priceSquareMeter(sel, db);
      case 'gadget':    return _priceGadget(sel, db);
      case 'carnet':    return _priceCarnet(sel, db);
      case 'service':   return _priceService(sel, db);
      default:          return _priceSheetFit(sel, db);
    }
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 1 — SHEET FIT
     Imposition A3+/A2+/A1+. Per-product planche override via product.planche.
     Paper cost from paper_stocks.cost_per_sheet, print cost from
     numérique or offset profile.
  ══════════════════════════════════════════════════════════ */
  function _priceSheetFit(sel, db) {
    const { sizeObj, paper, sides = 'single', addons = [], addonFaces = {}, quantity } = sel;
    if (!quantity) return null;
    // isPackaging covers sac + packaging + feuille presse — all use planche imposition.
    // sizeObj.mode (set by unified size section) is the primary signal.
    // Legacy composition IDs (hasSacSection / hasOuvertSection) remain as fallback for
    // products that haven't been through _migrateDB yet or for archived snap reads.
    const hasSacSection    = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'sac-format');
    const hasBoiteSection  = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'boite-format');
    const hasOuvertSection = _getComposition(curProd).some(e => (typeof e === 'string' ? e : e.type_id) === 'format-ouvert');
    const sizeMode         = sizeObj?.mode; // 'presets'|'free'|'derived'|'boite'|'rollup'|'sqm'
    const isPackaging = !!(
      sizeMode === 'derived' || sizeMode === 'free' || sizeMode === 'boite' ||
      hasSacSection || hasBoiteSection || hasOuvertSection || curProd?.is_sac ||
      curProd?.product_type === 'sac' || curProd?.product_type === 'packaging' ||
      curProd?.calc_engine === 'packaging'
    );

    /* ── Guard: need valid dimensions before proceeding ── */
    if (!isPackaging && (!sizeObj || (sizeObj.id === 'custom' && (!sizeObj.w || !sizeObj.h)))) return null;
    const isDerived = sizeMode === 'derived' || sizeMode === 'boite' || hasSacSection || hasBoiteSection;
    const isFree    = sizeMode === 'free'    || hasOuvertSection;
    if (isPackaging && isDerived) {
      const ok = (sizeObj?.fo_w && sizeObj?.fo_h) || (sel.sacL && sel.sacH && sel.sacS);
      if (!ok) return null;
    }
    if (isPackaging && isFree) {
      const ok = (sizeObj?.w && sizeObj?.h) || (sel.ouvertL && sel.ouvertH);
      if (!ok) return null;
    }

    const pr  = db.pricing;
    const dbl = sides === 'double';
    const sh  = curProd.planche ? { ...db.sheet, w: curProd.planche.w, h: curProd.planche.h } : db.sheet;
    const usePlanches = isPackaging;

    /* ── Resolve open-format dimensions ─────────────────────────────────────
       Unified size section writes sizeObj.fo_w/fo_h (derived) or sizeObj.w/h (free).
       Legacy fields (sacL/sacH/sacS, ouvertL/ouvertH) are read as fallback.
    ── */
    let fitW, fitH;
    if (isPackaging) {
      if ((sizeMode === 'derived' || sizeMode === 'boite') && sizeObj?.fo_w) {
        fitW = sizeObj.fo_w; fitH = sizeObj.fo_h;
      } else if (sizeMode === 'free' && sizeObj?.w) {
        fitW = sizeObj.w;   fitH = sizeObj.h;
      } else if (isDerived) {
        // Legacy sac fields
        const sacL = sel.sacL || 0, sacH = sel.sacH || 0, sacS = sel.sacS || sel.sacSoufflet || 0;
        fitW = (sacL && sacS) ? 2*(sacL+sacS)+20 : 0;
        fitH = (sacH && sacS) ? sacH+(sacS/2+20)+40 : 0;
      } else {
        // Legacy format-ouvert fields
        fitW = sel.ouvertL || sizeObj?.w || 0;
        fitH = sel.ouvertH || sizeObj?.h || 0;
      }
    } else {
      fitW = sizeObj?.w || 0;
      fitH = sizeObj?.h || 0;
    }
    // Half-FD mode: FO exceeds A3+, imposition runs on the half format, sheet count doubled.
    const passes = (isPackaging && sizeObj?.passes === 2 && sizeObj?.demi_w) ? 2 : 1;
    if (passes === 2) { fitW = sizeObj.demi_w; fitH = sizeObj.demi_h; }
    // Planche auto-selection for sac/packaging: try smallest first, escalate if open format doesn't fit.
    // Cost multiplier: A3+=×1, A2+=×2, A1+=×4 (bigger sheet = proportionally more expensive).
    const PLANCHE_LIST = (db.planches || [{id:'A3+',w:480,h:320},{id:'A2+',w:650,h:480},{id:'A1+',w:900,h:650}])
      .map((pl, idx) => ({ ...pl, mult: [1, 2, 4][idx] ?? 4 }));
    let chosenPlanche = PLANCHE_LIST[PLANCHE_LIST.length - 1]; // fallback to largest
    let sacFit = null;
    if (usePlanches) {
      for (const pl of PLANCHE_LIST) {
        const shTry = { ...db.sheet, w: pl.w, h: pl.h };
        const tryFit = sheetFit(fitW, fitH, shTry);
        if (tryFit.cols > 0 && tryFit.rows > 0) { chosenPlanche = pl; sacFit = tryFit; break; }
      }
      if (!sacFit) sacFit = sheetFit(fitW, fitH, { ...db.sheet, w: chosenPlanche.w, h: chosenPlanche.h });
    }
    const sacMult = usePlanches ? (chosenPlanche.mult || 1) : 1;
    const shSac   = { ...db.sheet, w: chosenPlanche.w, h: chosenPlanche.h };
    const fit     = usePlanches ? sacFit : sheetFit(fitW, fitH, sh);
    const sheets = Math.ceil(quantity / fit.n) * passes;
    let paperCost=0, printCost=0, lamCost=0, setupCost=0, plateCost=0, colorCount=0;
    let useOffset=false, offEligible=false, pObj=null, lamF={ id:'none', cost_ps:0 };
    if (!paper) return null;
    pObj = db.paper_stocks.find(p => p.id === paper); if (!pObj) return null;
    const lamId = sel.lam || 'none';
    lamF   = db.finishes.find(f => f.id === lamId) || { id:'none', cost_ps:0 };
    const off = _resolveOffsetProfile(curProd, db);
    const offIsPlanche = off.mode === 'planche';
    offEligible = off && off.enabled !== false && sheets >= (curProd?.offset_threshold || off.min_sheets || 1000);
    useOffset   = offEligible && !!sel.useOffset;
    colorCount  = useOffset ? (sel.offsetColors || 4) : 0;
    // Paper cost from paper tab (cost_per_sheet), print cost from impression profile
    const faces = dbl ? 2 : 1;
    paperCost   = sheets * (pObj.cost_per_sheet || 0) * sacMult;
    if (useOffset) {
      if (offIsPlanche) {
        printCost = sheets * (dbl ? (off.planche_rv||off.planche_recto||6) : (off.planche_recto||6)) * sacMult;
      } else {
        printCost = sheets * (off.print_per_face || off.print_single || 0) * faces * sacMult;
      }
    } else {
      const numP = _resolveNumProfile(curProd, db);
      const cpf  = numP ? (numP.cost_per_face || 0) : (pr.print_single || 2);
      printCost  = sheets * cpf * faces * sacMult;
    }
    setupCost   = useOffset && !offIsPlanche ? (off.setup_cost  || 0) : 0;
    plateCost   = useOffset && !offIsPlanche ? colorCount * (off.cost_per_plate || 0) : 0;
    lamCost     = lamF?.cost_ps ? sheets * lamF.cost_ps * (dbl && lamF.per_side ? 2 : 1) * sacMult : 0;
    const isChemise   = !!(curProd?.is_chemise || curProd?.id === 'chemise-rabat');
    const chemiseCost = isChemise
      ? ((sel.chemiseColle   ? (curProd.rabat_colle_cost   ?? 0.8) : 0)
       + (sel.chemiseImprime ? (curProd.rabat_imprime_cost ?? 0.5) : 0)) * quantity : 0;
    let bindCost=0, bindObj=null;
    if (sel.binding && sel.binding !== 'none') {
      bindObj  = (db.binding_options || []).find(b => b.id === sel.binding);
      bindCost = bindObj ? bindObj.cost_flat + bindObj.cost_per_copy * quantity : 0;
    }
    let intPaper=0, covPaper=0, intPrint=0, covPrint=0, intLam=0, covLam=0, intTotal=0, covTotal=0;
    let catSidesInt=2, catSidesCov=2, catInteriorPages=0, catPpsInt=4;
    const isCatalogue = !!(sel.paperCover && sel.pages);
    if (isCatalogue) {
      const covObj = db.paper_stocks.find(p => p.id === sel.paperCover); if (!covObj) return null;

      // ── Sides: default R/V for both interior and cover ──
      const sidesInt = sel.sidesInt === 'single' ? 1 : 2;
      const sidesCov = sel.sidesCov === 'single' ? 1 : 2;
      catSidesInt = sidesInt;
      catSidesCov = sidesCov;

      // ── Pages per press-sheet FACE (sizeObj.pps = 2 for A4 on A3 press) ──
      const ppsPerFace = sizeObj.pps_face ?? sizeObj.pps ?? 2;

      // Total pages per physical press sheet = face pages × sides printed
      const ppsInt = Math.max(1, ppsPerFace * sidesInt);
      catPpsInt = ppsInt;

      // ── Interior pages = total pages − 4 cover pages (outer+inner × front+back) ──
      const COVER_PAGES = 4;
      const interiorPages = Math.max(0, sel.pages - COVER_PAGES);
      catInteriorPages = interiorPages;

      // Interior press sheets per copy, then for all copies
      const intSheetsPerCopy = Math.ceil(interiorPages / ppsInt);
      intTotal = intSheetsPerCopy * quantity;

      // Cover press sheets: covFit.n = how many cover spreads (2× closed width) per press sheet
      const covFit = sheetFit(sizeObj.w * 2, sizeObj.h, sh);
      covTotal = Math.ceil(quantity / Math.max(covFit.n, 1));

      // ── Paper cost from paper tab, print cost from numérique profile ──
      const numP = _resolveNumProfile(curProd, db);
      const cpf  = numP ? (numP.cost_per_face || 0) : (pr.print_single || 2);

      const lamCovF = db.finishes.find(f => f.id === (sel.lamCover    || 'none')) || { id:'none', cost_ps:0 };
      const lamIntF = db.finishes.find(f => f.id === (sel.lamInterior || 'none')) || { id:'none', cost_ps:0 };

      intPaper  = intTotal * (pObj?.cost_per_sheet || 0);
      covPaper  = covTotal * (covObj.cost_per_sheet || 0);
      intPrint  = intTotal * cpf * sidesInt;
      covPrint  = covTotal * cpf * sidesCov;
      intLam    = lamIntF.cost_ps ? intTotal * lamIntF.cost_ps : 0;
      covLam    = lamCovF.cost_ps ? covTotal * lamCovF.cost_ps : 0;
      paperCost = intPaper + covPaper;
      printCost = intPrint + covPrint;
      lamCost   = intLam   + covLam;
    }
    const lines     = addonLines(addons, addonFaces, sheets, quantity, db);
    const addonCost = lines.reduce((s,l)=>s+l.cost,0);
    // ── Coupe + conditionnement — editable in Finitions → Façonnage ──
    // Looks up the reserved addon entry first; falls back to legacy pr.cutting_fee
    const _coupAddon = (db.finishes_addon || []).find(x => x.id === 'coupe-conditionnement');
    const cutFee     = _coupAddon
      ? (_coupAddon.cost_setup || 0) + (_coupAddon.cost_pu || 0) * quantity
      : (pr.cutting_fee || 0);
    // ── Forme de découpe ─────────────────────────────────────────────────────
    // New contract: sel.fd = { enabled:bool, reuse:bool, setup_cost:number }
    //   enabled = FD is applicable for this product
    //   reuse   = client has existing die → setup waived
    // Legacy compat: sel.formeDecoupe (bool) where true = "I have existing die" = reuse
    const hasFormeDecoupeSection = _getComposition(curProd).some(e =>
      (typeof e === 'string' ? e : e.type_id) === 'forme-decoupe'
    );
    const addonEntry_fd  = _getComposition(curProd).find(e =>
      (typeof e === 'string' ? e : e.type_id) === 'addon'
    );
    const addonFdEnabled = !!(addonEntry_fd && (typeof addonEntry_fd === 'object')
      && addonEntry_fd.config?.fd_enabled);
    const fdEnabled  = sel.fd != null
      ? sel.fd.enabled
      : false;  // no explicit state → FD toggle starts OFF (standalone packaging sets sel.fd via defaults)
    const fdReuse    = sel.fd != null
      ? sel.fd.reuse
      : (sel.formeDecoupe ?? false);  // legacy: true = "réutilisation forme"
    const fdSetupCfg = sel.fd?.setup_cost ?? db.forme_decoupe?.setup ?? 0;
    const hasFD      = fdEnabled && !fdReuse;
    const fdSetup    = hasFD ? fdSetupCfg : 0;
    const fdPrixCm2  = hasFD ? (db.forme_decoupe?.prix_cm2 || 0) : 0;
    const fdSurface  = fdEnabled ? Math.round(fitW * fitH / 100) : 0; // cm²
    const fdCost     = fdSetup + fdSurface * fdPrixCm2;
    const raw     = paperCost + printCost + setupCost + plateCost + lamCost + addonCost + cutFee + chemiseCost + bindCost + fdCost;
    const disc    = qtyDisc(quantity, pr);
    const discAmt = Math.round(raw * disc);
    const selling = Math.round(applyMargin(raw - discAmt, pr.profit_margin));
    const designCost = _calcDesignCost(sel, db);

    return {
      baseTotal: selling + designCost, perUnit: (selling + designCost) / quantity,
      paperCost, printCost, setupCost, plateCost, colorCount, lamCost,
      addonCost, addonLines: lines, cutFee, chemiseCost, bindCost, fdCost, fdSurface,
      fdEnabled, fdReuse, fdSetup,
      intPaper, covPaper, intPrint, covPrint, intLam, covLam, intTotal, covTotal,
      raw, discAmt, disc, profit: selling-(raw-discAmt), designCost,
      sheets, unitsPerSheet: fit.n, fit, pObj,
      covObj: isCatalogue ? (DB?.paper_stocks||[]).find(p => p.id === sel.paperCover) : null,
      lamF, bindObj,
      lamIntF: isCatalogue ? ((DB?.finishes||[]).find(f=>f.id===(sel.lamInterior||'none'))||{id:'none',cost_ps:0}) : null,
      lamCovF: isCatalogue ? ((DB?.finishes||[]).find(f=>f.id===(sel.lamCover   ||'none'))||{id:'none',cost_ps:0}) : null,
      offEligible, isOffset: useOffset, isSheetFit: true,
      sidesInt: catSidesInt, sidesCov: catSidesCov,
      interiorPages: catInteriorPages, ppsInt: catPpsInt,
      sacPlanche: usePlanches ? chosenPlanche.id : null, sacMult: usePlanches ? sacMult : 1,
      isPackaging,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 2 — SQUARE METER
     Products: bâche, vinyl, rollup, kakémono, totem, x-banner, pancarte.
     Global material list: DB.gf_materials (id, label, cost_per_sqm, laize).
     Global support list:  DB.rollup_supports (id, label, cost).
     Product references:   product.gf_material_id + optional product.support_id.
     Laize: width rounded UP to nearest laize multiple (min = 1 laize).
  ══════════════════════════════════════════════════════════ */
  function _priceSquareMeter(sel, db) {
    const { gfW, gfH, gfFinishes=[], withSupport, sizeObj, quantity } = sel;
    if (!quantity) return null;
    // sizeObj units: rollup/kakemono/xbanner/totem store w/h in cm;
    // pancarte stores w/h in mm (like sheet-fit sizes). gfW/gfH are always user-typed cm.
    const _sizeInCm = curProd?.product_type === 'rollup';
    const _sizeDiv  = _sizeInCm ? 1 : 10;
    const rawW_cm = gfW ? parseFloat(gfW) : (sizeObj?.w ? sizeObj.w / _sizeDiv : 0);
    const rawH_cm = gfH ? parseFloat(gfH) : (sizeObj?.h ? sizeObj.h / _sizeDiv : 0);
    if (!rawW_cm || !rawH_cm) return null;
    // Material — pancarte uses db.pancarte_materials + sel.pancarteMat
    //            GF/rollup uses db.gf_materials + sel.gfMaterial
    const isPancarteProduct = curProd?.product_type === 'pancarte';
    const matList  = isPancarteProduct
      ? (db.pancarte_materials || curProd.pancarte_materials || [])
      : (db.gf_materials || []);
    const matId    = isPancarteProduct
      ? (sel.pancarteMat || (matList[0]?.id))
      : (sel.gfMaterial  || (matList[0]?.id));
    const mat      = matList.find(m => m.id === matId);
    const costPerSqm = mat ? (mat.cost_per_sqm || 0) : (curProd.cost_per_sqm || 0);
    // Pancarte: rigid panels, no laize rounding; GF: laize rounding applies
    const laize_m    = isPancarteProduct ? 0 : (mat ? (mat.laize || 1.0) : (curProd.laize || 1.0));
    // Laize rounding
    const rawW_m  = rawW_cm / 100;
    const rawH_m  = rawH_cm / 100;
    // Laize rounding: only for GF (flexible media). Pancarte = exact surface, no min 1m².
    const eff_w_m   = laize_m > 0 ? Math.ceil(rawW_m / laize_m) * laize_m : rawW_m;
    const raw_area  = eff_w_m * rawH_m;
    const area_m2   = isPancarteProduct ? Math.max(raw_area, 0.25) : Math.max(raw_area, 1.0);  // pancarte: min 0.25m², GF: min 1m²
    const sqmCost   = area_m2 * costPerSqm * quantity;
    // Finishes
    let finCost = 0;
    const finLines = gfFinishes.map(fid => {
      const fo = (db.gf_finishes||[]).find(f=>f.id===fid); if (!fo) return null;
      const c  = fo.cost_flat ? fo.cost_flat*quantity : (fo.cost_per_sqm ? fo.cost_per_sqm*area_m2*quantity : 0);
      finCost += c;
      return { label: fo.label, cost: c };
    }).filter(Boolean);
    // Support — prefer db.rollup_supports (global), fall back to curProd support cost directly
    // NOTE: kote_config has no global rollup_supports column — cost lives on curProd
    const supList    = (db.rollup_supports?.length ? db.rollup_supports : null) || [];
    const supId      = curProd.support_id;
    const sup        = withSupport && supId ? supList.find(s=>s.id===supId) : null;
    const supportCost = withSupport
      ? (sup ? (sup.cost||0)*quantity : (curProd.support_cost||curProd.rollup_support_cost||0)*quantity)
      : 0;
    const raw     = sqmCost + finCost + supportCost;
    // GF: no margin applied — price = raw cost (materials + finishes + support)
    return {
      baseTotal: raw, perUnit: raw/quantity,
      sqmCost, finCost, finLines, supportCost, mat, sup,
      costPerSqm, laize_m, area_m2, eff_w_m, rawW_m, rawH_m,
      raw, discAmt:0, disc:0, profit:0,
      addonLines:[], addonCost:0, cutFee:0,
      sheets:quantity, unitsPerSheet:1,
      fit:{ cols:1, rows:1, n:1, rotated:false },
      lamF:{ id:'none', cost_ps:0 }, isSquareMeter:true,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 3 — GADGET
     Products: gadgets + envelopes.
  ══════════════════════════════════════════════════════════ */
  function _priceGadget(sel, db) {
    const { quantity } = sel;
    if (!quantity || !curProd) return null;
    const pr = db.pricing;
    // Detect envelope: by selection state, product flag, product id, or composition sections
    const hasEnvSection = !!(_getComposition(curProd).find(e =>
      ['env-size','env-support','env-offset-colors','env-fenetre'].includes(
        typeof e === 'string' ? e : e.type_id
      )
    ));
    // Also detect by product name/label containing "envelop" — covers misconfigured DB products
    const nameHint = !!(curProd.name||curProd.label||'').toLowerCase().includes('envelop');
    const isEnv = !!(sel.envFormatId || sel.envTypeId || curProd?.is_envelope ||
                     curProd?.id==='enveloppe' || hasEnvSection || nameHint);
    if (isEnv) {
      // Auto-fallback: if envFormatId/envTypeId are null (defaults didn't fire due to empty
      // composition), use first available from DB so the price can still be computed
      const resolvedFormatId = sel.envFormatId || (db.envelope_formats||[])[0]?.id || null;
      const resolvedTypeId   = sel.envTypeId   || (db.envelope_types  ||[])[0]?.id || null;
      // Sync back into curSel so UI stays consistent
      if (!sel.envFormatId && resolvedFormatId) sel.envFormatId = resolvedFormatId;
      if (!sel.envTypeId   && resolvedTypeId)   sel.envTypeId   = resolvedTypeId;
      const envFmt  = (db.envelope_formats||[]).find(f=>f.id===resolvedFormatId);
      const envType = (db.envelope_types  ||[]).find(t=>t.id===resolvedTypeId);
      const envColors = sel.envColors || 1;
      const envThresh = 500;
      const unitCost  = envFmt?.cost || 0;
      const prcost    = envType
        ? (quantity>=envThresh
            ? (envType.cost_per_piece||0)+(envType.cost_per_color||0)*envColors
            : (envType.cost_per_piece||0))
        : 0;
      const raw     = (unitCost+prcost)*quantity;
      const disc    = qtyDisc(quantity, pr);
      const discAmt = Math.round(raw*disc);
      const selling = Math.round(applyMargin(raw-discAmt, pr.profit_margin));
      return {
        baseTotal:selling, perUnit:selling/quantity,
        unitCost:unitCost*quantity, printCost:prcost*quantity,
        raw, discAmt, disc, profit:selling-(raw-discAmt),
        addonLines:[], addonCost:0, cutFee:0, sheets:quantity, unitsPerSheet:1,
        fit:{cols:1,rows:1,n:1,rotated:false}, lamF:{id:'none',cost_ps:0},
        isEnv:true, envFmt, envType, envColors,
      };
    }
    const uprice = curProd.unit_price || 0;
    const prcost = curProd.print_cost  || 0;
    if (!uprice && !prcost && !isEnv) return null;
    // Gadget price = (gadget cost + print cost) × qty — no discount, no margin
    const raw = (uprice + prcost) * quantity;
    return {
      baseTotal: raw, perUnit: raw / quantity,
      raw, discAmt:0, disc:0, profit:0,
      unitPrice: uprice, printCostPerUnit: prcost,
      technique: curProd.print_technique || '',
      addonLines:[], addonCost:0, cutFee:0, sheets:quantity, unitsPerSheet:1,
      fit:{cols:1,rows:1,n:1,rotated:false}, lamF:{id:'none',cost_ps:0}, isGadget:true,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 4 — CARNET NCR (always offset, always detailed)
  ══════════════════════════════════════════════════════════ */
  function _priceCarnet(sel, db) {
    const { sizeObj, carnetPages, carnetSouches, quantity } = sel;
    if (!sizeObj||!carnetPages||!carnetSouches||!quantity) return null;
    if (sizeObj.id==='custom'&&(!sizeObj.w||!sizeObj.h)) return null;
    // Allow bon-de-livraison and other carnet-engine products to fall back
    // to the canonical carnet product's carnet_pricing if they have none set
    let cp = curProd.carnet_pricing;
    if (!cp || Object.keys(cp).length === 0) {
      const fallbackProd = (db.products||[]).find(p =>
        p.id !== curProd.id && (p.product_type==='carnet'||p.calc_engine==='carnet') && p.carnet_pricing
      );
      cp = fallbackProd?.carnet_pricing || {};
    }
    const off = _resolveOffsetProfile(curProd, db);
    const offIsPlanche = off.mode === 'planche';
    const pr  = db.pricing;
    const ncrCostPerSet    = (cp.ncr_cost_per_set||{})[String(carnetSouches)] || 0;
    const totalSets        = carnetPages*quantity;
    const ncrCost          = totalSets*ncrCostPerSet;
    const totalPrintSheets = carnetPages*carnetSouches*quantity;
    const fit              = sheetFit(sizeObj.w, sizeObj.h, db.sheet);
    const pressSheets      = Math.ceil(totalPrintSheets/fit.n);
    // Press paper cost: use client-selected paper (sel.paper) first,
    // then admin-configured ncr_paper_id, so paper selector actually affects price
    const pressPaperId = sel.paper || cp.ncr_paper_id || null;
    const pressPaper   = pressPaperId ? (db.paper_stocks||[]).find(ps => ps.id === pressPaperId) : null;
    const paperCost    = pressPaper ? pressSheets * pressPaper.cost_per_sheet : 0;
    // Use print_per_face first (UI field "PX TIRAGE/FACE"), fallback to print_single,
    // then global pr.print_single — matches same resolution order as _priceSheetFit
    const printCostPerSheet = off.print_per_face ?? off.print_single ?? pr.print_single ?? 0;
    const printCost        = offIsPlanche
      ? pressSheets*(off.planche_recto||6)
      : pressSheets*printCostPerSheet;
    const setupCost        = offIsPlanche ? 0 : (off.setup_cost||0);
    const colorCount       = sel.carnetColors||4;
    const plateCost        = offIsPlanche ? 0 : colorCount*(off.cost_per_plate||0);
    let coverCost=0, covPressSheets=0;
    if (sel.carnetCover) {
      const covPaper     = cp.cover_paper_id ? db.paper_stocks.find(p=>p.id===cp.cover_paper_id) : null;
      covPressSheets     = Math.ceil(quantity/Math.max(fit.n,1));
      const covPaperCost = covPaper ? covPressSheets*covPaper.cost_per_sheet : 0;
      const covPrintCost = covPressSheets*(cp.cover_print_cost_per_sheet??pr.print_single);
      coverCost = covPaperCost+covPrintCost;
    }
    const staplingCost = (cp.stapling_cost_per_carnet  ||0)*quantity;
    const numeroCost   = sel.carnetNumero ? (cp.numbering_cost_per_carnet  ||0)*quantity : 0;
    const perfoCost    = sel.carnetPerfo  ? (cp.perforation_cost_per_carnet||0)*quantity : 0;
    const raw     = paperCost+printCost+setupCost+plateCost+coverCost+staplingCost+numeroCost+perfoCost;
    const disc    = qtyDisc(quantity, pr);
    const discAmt = Math.round(raw*disc);
    const selling = Math.round(applyMargin(raw-discAmt, pr.profit_margin));
    return {
      baseTotal:selling, perUnit:selling/quantity,
      ncrCost, paperCost, printCost, setupCost, plateCost, coverCost, staplingCost, numeroCost, perfoCost,
      raw, discAmt, disc, profit:selling-(raw-discAmt),
      pressSheets, totalPrintSheets, totalSets, fit,
      pressPaperLabel: pressPaper ? pressPaper.label : null,
      carnetPages, carnetSouches, colorCount, isCarnet:true,
      carnetNumero:sel.carnetNumero||false, carnetNumStart:sel.carnetNumStart||1,
      carnetPerfo:sel.carnetPerfo||false, carnetCover:sel.carnetCover||false,
    };
  }

  /* ══════════════════════════════════════════════════════════
     ENGINE 5 — SERVICE (Design / Conception graphique)
  ══════════════════════════════════════════════════════════ */
  function _priceService(sel, db) {
    const { concType, concPages, concFaces, customPrice } = sel;
    if (!concType) return null;
    if (concType==='logo') {
      const base = (curProd.logo_price>0)?curProd.logo_price:1200;
      const raw  = customPrice>0?customPrice:base;
      return _serviceResult(raw,{id:'logo',label:'Design Logo'},customPrice>0);
    }
    const ct = (curProd.conception_types||[]).find(x=>x.id===concType); if (!ct) return null;
    if (customPrice>0) return _serviceResult(customPrice,ct,true);
    let raw=0;
    if      (ct.price)                           raw=ct.price;
    else if (ct.price_base&&ct.price_per_page)   { if(!concPages||concPages<1) return null; raw=ct.price_base+ct.price_per_page*concPages; }
    else if (ct.price_per_face)                  { if(!concFaces||concFaces<1) return null; raw=ct.price_per_face*concFaces; }
    return raw?_serviceResult(raw,ct,false):null;
  }
  function _serviceResult(total,ct,isCustom) {
    return {
      baseTotal:total, perUnit:total, raw:total,
      discAmt:0, disc:0, profit:0,
      addonLines:[], addonCost:0, cutFee:0, sheets:0, unitsPerSheet:1,
      fit:{cols:1,rows:1,n:1,rotated:false}, lamF:{id:'none',cost_ps:0},
      concType:ct, isCustomPrice:isCustom, isService:true,
    };
  }

  /* ── Design service surcharge helper (used by sheet_fit) ── */
  function _calcDesignCost(sel, db) {
    // Design pricing is handled via brief/quote — not summed into product price
    return 0;
  }

  /* ── Cart grand total (subtotal + turnaround surcharge + delivery) ── */
  function cartTotal(items, opts, pr, deliveryCities) {
    const sub    = items.reduce((s, i) => s + i.baseTotal, 0);
    const sur    = (pr.turnaround_sur || {})[opts.turnaround] || 0;
    const surAmt = sub * sur;
    let del = 0;
    if (opts.deliveryCityId) {
      // Exact city fee chosen by user
      const city = (deliveryCities || []).find(c => c.id === opts.deliveryCityId);
      del = city ? (city.fee || 0) : 0;
    } else if (opts.delivery) {
      // Toggle ON but no city chosen yet — show minimum fee as estimate
      const fees = (deliveryCities || []).map(c => c.fee).filter(Boolean);
      del = fees.length ? Math.min(...fees) : (pr.delivery_fee || 0);
    }
    return { sub, surAmt, del, grand: sub + surAmt + del };
  }

  return { sheetFit, price, cartTotal, resolveOffsetProfile: _resolveOffsetProfile, qtyDisc };
})();



const _fmtDate = (ts, opts) => ts
  ? new Date(ts).toLocaleDateString('fr-MA', opts || {day:'2-digit',month:'2-digit',year:'numeric'})
  : '—';
const _fmtTime = ts => ts
  ? new Date(ts).toLocaleTimeString('fr-MA', {hour:'2-digit',minute:'2-digit'})
  : '';

/* Script loader — load a CDN script once, resolve when ready */
function _loadScript(src, globalCheck) {
  return new Promise((res, rej) => {
    if (globalCheck && window[globalCheck]) { res(); return; }
    if (document.querySelector(`script[src="${src}"]`)) {
      let tries = 0;
      const poll = setInterval(() => {
        if (!globalCheck || window[globalCheck]) { clearInterval(poll); res(); }
        else if (++tries > 40) { clearInterval(poll); rej(new Error('Timeout: '+src)); }
      }, 100);
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res();
    s.onerror = () => rej(new Error('Failed: '+src));
    document.head.appendChild(s);
  });
}

/* Brief content fields — used by briefs tab, PDF, WA, email */

PERF.mark('core_loaded');
// STATE, APP, PERF, DB_MOD, CALC now available as window globals

/* Flush any pending granular DB patch before the page closes */
window.addEventListener('beforeunload', () => {
  if (typeof DB_MOD !== 'undefined') DB_MOD.flushPatch();
});
