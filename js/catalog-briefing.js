'use strict';

/* ============================================================
   catalog-briefing.js -- Design brief wizard (KOTE_BRIEFING)
   Extracted from kote-catalog.js (S7 split).
   Exposes: KOTE_BRIEFING
   Requires: kote-core.js, catalog-ui.js (UI, BRIEF, loadProduct)
   Load order: after catalog-ui.js
   ============================================================ */

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
    if (step.id === 'contact') {
      const vcn = g('client_name');  if (vcn !== undefined) _data.client_name  = vcn;
      const vct = g('client_tel');   if (vct !== undefined) _data.client_tel   = vct;
      const vce = g('client_email'); if (vce !== undefined) _data.client_email = vce;
      const vcnotes = g('notes');    if (vcnotes !== undefined) _data.notes    = vcnotes;
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
    `<svg viewBox="0 0 8 8" width="8" height="8" class="brf-dot-svg">
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
      ${!chosen ? `<div class="brf-ok-note brf-ok-note--empty">
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
              <svg viewBox="0 0 8 8" width="8" height="8" class="brf-dot-svg"><circle cx="4" cy="4" r="3.5" fill="${on?o.color:'#cbd5e1'}"/></svg>
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
            width="11" height="11" class="brf-dot-svg--am">
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
              width="15" height="15" class="brf-gn-ico">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Brief soumis &amp; ajouté au panier</span>
          </div>
          <div class="brf-ref-badge">${_briefRef}</div>
          <button class="brf-cart-btn brf-cart-btn--mt" onclick="KOTE_BRIEFING.close()">
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
        ${value===true ? `<span class="text-gn">${ICOS.check}</span>` : ''}
        ${yesLabel}
      </button>
      <button type="button" class="brf-toggle-btn${value===false?' on':''}"
        onclick="KOTE_BRIEFING._set('${key}',false)">
        ${value===false ? `<span class="text-rd">${ICOS.cross}</span>` : ''}
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
    if (step.id === 'contact') {
      _data.client_name  = g('client_name')  ?? _data.client_name;
      _data.client_tel   = g('client_tel')   ?? _data.client_tel;
      _data.client_email = g('client_email') ?? _data.client_email;
      _data.notes        = g('notes')        ?? _data.notes;
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
.brf-ok-note--empty{background:var(--s2);color:var(--t3);border:1px solid var(--bd)}
.brf-dot-svg{flex-shrink:0;margin-top:1px}
.brf-dot-svg--am{flex-shrink:0;margin-top:1px;color:var(--am)}
.brf-gn-ico{color:var(--gn);flex-shrink:0}
.brf-cart-btn--mt{margin-top:.2rem}
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
