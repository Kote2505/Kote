'use strict';

/* ============================================================
   kote-types.js -- JSDoc type definitions (zero runtime cost)
   Drop in js/ and load before kote-core.js on every page.
   These are comment-only typedefs — no executable code.
   Gives VS Code autocomplete + inline error detection across
   all Kote modules without TypeScript or a build step.
   ============================================================ */


/* ============================================================
   CORE STATE
   ============================================================ */

/**
 * Current product selection state. Lives in the global `curSel`.
 * Mutated in-place by SEL.* and fSel(); replaced wholesale by
 * loadProduct(). Notify listeners via STATE.emit('curSel').
 *
 * @typedef {Object} Selection
 *
 * -- Shared --
 * @property {number}   [quantity]        Selected quantity
 * @property {string}   [notes]           Free-text instructions
 * @property {string[]} addons            Active addon finish IDs
 * @property {Object.<string,number>} addonFaces  Faces per addon ID
 *
 * -- Sheet-fit products --
 * @property {string}   [size]            Size ID (e.g. 'A4', 'custom')
 * @property {SizeObj}  [sizeObj]         Full size object for chosen size
 * @property {string}   [paper]           Paper stock ID
 * @property {string}   [paperCover]      Cover paper ID (catalogues)
 * @property {string}   [sides]           'single' | 'double'
 * @property {string}   [lam]             Lamination finish ID or 'none'
 * @property {string}   [lamCover]        Cover lam ID (catalogues)
 * @property {string}   [lamInterior]     Interior lam ID (catalogues)
 * @property {number}   [pages]           Page count (catalogues)
 * @property {string}   [binding]         Binding option ID
 * @property {string}   [fold]            Fold type ID
 * @property {boolean}  [useOffset]       Offset printing mode active
 * @property {number}   [offsetColors]    Offset colour count (1–4)
 * @property {boolean}  [chemiseColle]    Chemise: glued flap
 * @property {boolean}  [chemiseImprime]  Chemise: printed flap
 * @property {number}   [sacSoufflet]     Sac: gusset width mm
 *
 * -- Grand format / sqm --
 * @property {string}   [gfMaterial]      GF material ID
 * @property {string[]} gfFinishes        Active GF finish IDs
 * @property {number}   [gfW]            Width cm (user input)
 * @property {number}   [gfH]            Height cm (user input)
 * @property {boolean}  [withSupport]     Roll-up: aluminium support
 * @property {string}   [pancarteMat]     Pancarte material ID
 *
 * -- Carnet NCR --
 * @property {number}   [carnetPages]     Feuillets per carnet
 * @property {number}   [carnetSouches]   NCR layer count (2–5)
 * @property {number}   [carnetColors]    Offset colour count
 * @property {boolean}  [carnetNumero]    Numbering option
 * @property {boolean}  [carnetPerfo]     Perforation option
 * @property {boolean}  [carnetCover]     Cover option
 * @property {number}   [carnetNumStart]  Numbering start value
 *
 * -- Envelopes --
 * @property {string}   [envFormatId]     Envelope format ID
 * @property {string}   [envTypeId]       Envelope type ID
 * @property {number}   [envColors]       Print colour count
 * @property {boolean}  [envFenetre]      Window option
 *
 * -- Conception / design --
 * @property {string}   [concType]        Conception type ID
 * @property {number}   [concPages]       Page count for per-page pricing
 * @property {number}   [concFaces]       Face count for per-face pricing
 * @property {number}   [customPrice]     Admin custom price override
 * @property {string}   [designOption]    'file' | 'service' | null
 * @property {string}   [designTier]      'basic' | 'pro' | 'premium'
 * @property {string}   [designFileName]  Uploaded file name
 * @property {string}   [designFileSize]  Formatted file size string
 * @property {number}   [designPages]     Page count for multi-page design
 * @property {string}   [brief_ref]       Linked brief reference
 */

/**
 * Size object inside Selection.sizeObj and product.sizes[].
 *
 * @typedef {Object} SizeObj
 * @property {string}  id          Size ID ('A4', 'A5', 'custom'…)
 * @property {string}  [label]     Display label
 * @property {number}  [w]         Width mm
 * @property {number}  [h]         Height mm
 * @property {number}  [pps]       Pages per press-sheet (catalogues)
 * @property {number}  [pps_face]  Pages per press-sheet face
 */


/* ============================================================
   CART & ORDER
   ============================================================ */

/**
 * A single item in the cart (and in order payload.items).
 *
 * @typedef {Object} CartItem
 * @property {string}    id         Unique item ID (Date.now hex)
 * @property {string}    prodId     Product ID
 * @property {string}    prodName   Product display name
 * @property {string}    specs      Formatted spec summary string
 * @property {string}    [notes]    Free-text notes
 * @property {number}    quantity   Ordered quantity
 * @property {number}    perUnit    Price per unit HT
 * @property {number}    baseTotal  Total price HT
 * @property {Selection} snap       Deep-copy of curSel at add time
 */

/**
 * Cart totals object — returned by CALC.cartTotal().
 *
 * @typedef {Object} CartTotals
 * @property {number} sub     Subtotal HT (sum of item baseTotals)
 * @property {number} surAmt  Turnaround surcharge amount
 * @property {number} del     Delivery fee
 * @property {number} grand   Grand total HT (sub + surAmt + del)
 */

/**
 * Full order row as pushed to kote_orders.payload.
 *
 * @typedef {Object} OrderPayload
 * @property {string}      ref       'KTE-XXXXXX'
 * @property {string}      date      ISO date string
 * @property {CartItem[]}  items     Line items
 * @property {CartTotals}  totals    Subtotal, surcharge, delivery, grand
 * @property {TaOption}    ta        Selected turnaround option
 * @property {ShopInfo}    shop      Snapshot of DB.shop at order time
 * @property {ClientInfo}  client    Client contact details
 */

/**
 * Client contact info — collected in the order form.
 *
 * @typedef {Object} ClientInfo
 * @property {string} nom      Full name
 * @property {string} tel      Phone number
 * @property {string} [email]  Email address
 * @property {string} [ville]  City (delivery)
 * @property {string} [adresse] Street address
 * @property {string} [ice]    Tax ID (ICE)
 * @property {string} [note]   Order note
 */

/**
 * Turnaround option from DB.turnaround_options / DB.ta.
 *
 * @typedef {Object} TaOption
 * @property {string} id        Option ID ('urgent', '1sem'…)
 * @property {string} label     Display label
 * @property {number} days      Lead time in days
 * @property {number} [sur]     Surcharge multiplier (0–1)
 */


/* ============================================================
   PRODUCT
   ============================================================ */

/**
 * A product as stored in DB.products[].
 *
 * @typedef {Object} Product
 * @property {string}   id              Unique product ID
 * @property {string}   name            Display name
 * @property {string}   [desc]          Short description
 * @property {string}   [icon]          IC icon key
 * @property {string}   product_type    'standard' | 'catalogue' | 'grand_format' |
 *                                      'rollup' | 'pancarte' | 'carnet' |
 *                                      'gadget' | 'conception' | 'sac'
 * @property {string}   calc_engine     'sheet_fit' | 'sqm' | 'gadget' |
 *                                      'carnet' | 'service'
 * @property {string}   [pricing_mode]  'detailed' | 'planche'
 * @property {SectionEntry[]} composition  Ordered section definitions
 * @property {number[]} [quantities]    Preset quantity tiers
 * @property {SizeObj[]} [sizes]        Available sizes
 * @property {string[]} [sides]         Allowed sides options
 * @property {string[]} [default_addons] Addon IDs pre-selected on load
 * @property {number}   [unit_price]    Gadget base unit cost
 * @property {number}   [print_cost]    Gadget print cost per unit
 * @property {boolean}  [is_envelope]   Envelope product flag
 * @property {boolean}  [is_chemise]    Chemise product flag
 * @property {boolean}  [is_sac]        Sac shopping product flag
 * @property {Object}   [planche]       Custom press sheet {w, h}
 * @property {Object}   [planche_cost]  Planche mode costs {recto, rv}
 * @property {string}   [offset_profile_id] Linked offset profile ID
 */

/**
 * A single entry in product.composition[].
 *
 * @typedef {Object} SectionEntry
 * @property {string} type_id   Section type ID (matches SECTIONS registry key)
 * @property {Object} config    Section-specific config (sizes, allowed papers…)
 */


/* ============================================================
   DATABASE (DB object — lives in kote_config.payload)
   ============================================================ */

/**
 * The top-level DB config object. Loaded from Supabase kote_config
 * row id=1. Mutated only via ADMIN.set(). Persisted via
 * DB_MOD.persistCurrent() + DB_MOD.pushToSupabase().
 *
 * @typedef {Object} KoteDB
 * @property {ShopInfo}       shop              Shop identity
 * @property {ContactInfo}    contact           Contact + notification settings
 * @property {AuthMethods}    auth_methods      Enabled auth flows
 * @property {PricingConfig}  pricing           Global pricing parameters
 * @property {SheetConfig}    sheet             Press sheet dimensions
 * @property {Product[]}      products          Product catalogue
 * @property {PaperStock[]}   paper_stocks      Available paper stocks
 * @property {Finish[]}       finishes          Lamination finishes
 * @property {Finish[]}       finishes_addon    Addon finishes (façonnage)
 * @property {BindingOption[]} binding_options  Binding options
 * @property {GFMaterial[]}   gf_materials      Grand format materials
 * @property {GFFinish[]}     gf_finishes       Grand format finishes
 * @property {EnvFormat[]}    envelope_formats  Envelope size formats
 * @property {EnvType[]}      envelope_types    Envelope print types
 * @property {OffsetProfile[]} offset_profiles  Offset press profiles
 * @property {OffsetProfile}  offset            Alias → offset_profiles[0]
 * @property {TaOption[]}     turnaround_options Turnaround options
 * @property {DeliveryCity[]} delivery_cities   Delivery city list
 * @property {DesignTiers}    design_tiers      Design service tier pricing
 * @property {SidebarGroup[]} [sidebar_groups]  Sidebar group config
 */

/**
 * @typedef {Object} ShopInfo
 * @property {string} [name]      Shop name
 * @property {string} [tel]       Phone
 * @property {string} [email]     Email
 * @property {string} [addr]      Address
 * @property {string} [website]   Website URL
 * @property {string} [whatsapp]  WhatsApp number (digits only)
 */

/**
 * @typedef {Object} ContactInfo
 * @property {string}   [email]               Contact email
 * @property {string}   [tel]                 Contact phone
 * @property {string}   [whatsapp]            Provider WA number
 * @property {string}   [designer_whatsapp]   Designer WA number
 * @property {boolean}  [tg_enabled]          Telegram notifications on
 * @property {string}   [tg_token]            Telegram bot token
 * @property {string}   [tg_chat_id]          Telegram chat ID
 */

/**
 * @typedef {Object} AuthMethods
 * @property {boolean} [magic_link]      Magic link email auth
 * @property {boolean} [oauth_google]    Google OAuth
 * @property {boolean} [guest]           Guest checkout
 * @property {boolean} [email_no_confirm] Password flow (no email confirm)
 */

/**
 * @typedef {Object} PricingConfig
 * @property {number}   profit_margin     Global margin (0–1)
 * @property {number}   print_single      Default recto print cost/sheet
 * @property {number}   print_double      Default recto-verso cost/sheet
 * @property {number}   cutting_fee       Per-job cutting fee
 * @property {number}   [delivery_fee]    Fallback delivery fee
 * @property {QtyDiscount[]} qty_discounts Quantity discount tiers
 * @property {Object}   [turnaround_sur]  Turnaround surcharge map {id: rate}
 */

/**
 * @typedef {Object} QtyDiscount
 * @property {number} min   Minimum quantity to qualify
 * @property {number} disc  Discount rate (0–1)
 */

/**
 * @typedef {Object} SheetConfig
 * @property {number} w       Sheet width mm
 * @property {number} h       Sheet height mm
 * @property {number} margin  Gripper margin mm
 * @property {number} bleed   Bleed mm
 */

/**
 * @typedef {Object} PaperStock
 * @property {string}  id              Unique ID
 * @property {string}  label           Display name
 * @property {string}  [desc]          Description
 * @property {number}  [cost_per_sheet] Paper cost per A3+ sheet (empty sheet, no print)
 * @property {number}  [print_recto]   Legacy — migrated to cost_per_sheet on boot
 * @property {number}  [print_rv]      Legacy — no longer used
 * @property {boolean} [special]       Special paper flag
 * @property {boolean} [envelope]      Envelope paper flag
 */

/**
 * @typedef {Object} Finish
 * @property {string}  id        Unique ID
 * @property {string}  label     Display name
 * @property {string}  [group]   Group ('lam' | 'faconnage')
 * @property {number}  cost_ps   Cost per press sheet
 * @property {boolean} [per_side] Double-sided billing flag
 */

/**
 * @typedef {Object} OffsetProfile
 * @property {string}  id              Profile ID
 * @property {string}  label           Display name
 * @property {boolean} enabled         Profile active flag
 * @property {number}  min_sheets      Minimum sheets to qualify
 * @property {number}  setup_cost      Setup cost per job
 * @property {number}  cost_per_plate  Cost per colour plate
 * @property {number}  print_single    Recto cost per sheet
 * @property {number}  print_double    Recto-verso cost per sheet
 * @property {number}  [planche_recto] Planche mode recto cost
 * @property {number}  [planche_rv]    Planche mode RV cost
 * @property {string}  [mode]          'detailed' | 'planche'
 */

/**
 * @typedef {Object} DeliveryCity
 * @property {string} id     City ID
 * @property {string} label  City name
 * @property {number} fee    Delivery fee DH
 * @property {number} [days] Lead time in days
 */

/**
 * @typedef {Object} SidebarGroup
 * @property {string}   id       Group ID
 * @property {string}   label    Display label
 * @property {string[]} products Ordered product IDs in this group
 */


/* ============================================================
   PRICING ENGINE OUTPUT
   ============================================================ */

/**
 * Result object returned by CALC.price(). Shape varies by engine
 * but these fields are always present.
 *
 * @typedef {Object} PriceResult
 * @property {number}   baseTotal       Total selling price HT
 * @property {number}   perUnit         Per-unit selling price HT
 * @property {number}   raw             Raw cost before margin
 * @property {number}   discAmt         Quantity discount amount
 * @property {number}   disc            Discount rate applied (0–1)
 * @property {number}   profit          Margin amount
 * @property {number}   addonCost       Total addon costs
 * @property {AddonLine[]} addonLines   Per-addon cost breakdown
 * @property {number}   cutFee          Cutting fee
 * @property {number}   sheets          Press sheets used
 * @property {number}   unitsPerSheet   Imposition units per sheet
 * @property {SheetFit} fit             Imposition result
 *
 * -- Sheet-fit specific --
 * @property {number}   [paperCost]     Paper cost
 * @property {number}   [printCost]     Print cost
 * @property {number}   [lamCost]       Lamination cost
 * @property {number}   [setupCost]     Offset setup cost
 * @property {number}   [plateCost]     Offset plate cost
 * @property {boolean}  [isSheetFit]    Engine flag
 * @property {boolean}  [isOffset]      Offset mode active
 *
 * -- Square meter specific --
 * @property {number}   [sqmCost]       Material cost
 * @property {number}   [finCost]       Finishes cost
 * @property {number}   [supportCost]   Support cost
 * @property {number}   [area_m2]       Effective area m²
 * @property {boolean}  [isSquareMeter] Engine flag
 *
 * -- Service specific --
 * @property {boolean}  [isService]     Engine flag
 * @property {boolean}  [isCustomPrice] Custom price override active
 *
 * -- Carnet specific --
 * @property {boolean}  [isCarnet]      Engine flag
 * @property {number}   [ncrCost]       NCR paper cost
 * @property {number}   [staplingCost]  Stapling cost
 */

/**
 * @typedef {Object} SheetFit
 * @property {number}  cols     Columns in imposition grid
 * @property {number}  rows     Rows in imposition grid
 * @property {number}  n        Total units per sheet (cols × rows)
 * @property {boolean} rotated  Sheet is rotated for best fit
 */

/**
 * @typedef {Object} AddonLine
 * @property {string} id     Addon finish ID
 * @property {string} label  Display name
 * @property {string} model  Pricing model used
 * @property {number} cost   Total cost for this addon
 * @property {number} faces  Face count applied
 */


/* ============================================================
   BRIEFS & QUOTES
   ============================================================ */

/**
 * A saved design brief row from kote_briefs.
 *
 * @typedef {Object} BriefRow
 * @property {string}  [id]           DB row ID
 * @property {string}  ref            'BRF-XXXXXX'
 * @property {string}  [status]       'nouveau' | 'en_cours' | 'livre'
 * @property {string}  [product_id]   Linked product ID
 * @property {string}  [brand_name]   Client brand name
 * @property {string}  [design_tier]  'basic' | 'pro' | 'premium'
 * @property {number}  [price_ht]     Quoted price HT
 * @property {string}  [order_ref]    Linked order reference
 * @property {Object}  payload        Full brief content
 * @property {string}  [created_at]   ISO timestamp
 */

/**
 * A saved quote row from kote_quotes.
 *
 * @typedef {Object} QuoteRow
 * @property {string}       [id]          DB row ID
 * @property {string}       ref           'QTE-XXXXXX'
 * @property {string}       [status]      'draft' | 'sent' | 'accepted'
 * @property {string}       [client_nom]  Client name
 * @property {string}       [client_ice]  Client tax ID
 * @property {number}       total_ht      Total HT
 * @property {number}       total_ttc     Total TTC
 * @property {OrderPayload} payload       Full quote payload
 * @property {string}       [created_at]  ISO timestamp
 */


/* ============================================================
   STATE BUS
   ============================================================ */

/**
 * STATE bus key → value type map.
 * Use STATE.get(key) / STATE.set(key, val) / STATE.on(key, fn).
 *
 * @typedef {'db'|'curProd'|'curSel'|'editId'|'detailOpen'} StateKey
 *
 * @typedef {Object} StateMap
 * @property {KoteDB|null}    db          Live config object
 * @property {Product|null}   curProd     Currently configured product
 * @property {Selection}      curSel      Current selection state
 * @property {string|null}    editId      Cart item being edited
 * @property {boolean}        detailOpen  Cost breakdown panel open
 */


/* ============================================================
   APP BOOT CONTRACT
   ============================================================ */

/**
 * APP boot contract — use instead of reading DB directly.
 *
 * @example
 * // Safe module init — works whether DB loads fast or slow:
 * APP.whenReady(db => {
 *   UI.buildSidebar();
 *   DASHBOARD.load();
 * });
 *
 * @typedef {Object} AppContract
 * @property {function(function(KoteDB):void):void} whenReady  Queue callback for when DB is ready
 * @property {function(KoteDB):void}                init       Called by DB_MOD._apply() — do not call manually
 * @property {function(string):void}                fail       Show central error UI
 * @property {function():boolean}                   isReady    Synchronous ready check
 */

/* No exports — this file is comment-only. All types are
   available globally to VS Code via the JSDoc @typedef tags. */
