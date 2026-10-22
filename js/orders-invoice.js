'use strict';

/* ============================================================
   orders-invoice.js -- PDF invoice/devis preview (INVOICE)
   Extracted from kote-orders.js (S8 split).
   Exposes: window.INVOICE
   Requires: kote-core.js
   Load order: after orders-cart.js
   ============================================================ */



/* ══════════════════════════════════════════════════════════════
   KOTE INVOICE PREVIEW  v6.0
   ══════════════════════════════════════════════════════════════
   window.INVOICE.open(quoteData)
   window.INVOICE.setImage(key, dataURL)
   ══════════════════════════════════════════════════════════════ */
window.INVOICE = (() => {
  
  /* ── Layout constants ── */
  const DOC_W = 794, DOC_H = 1123;
  const CT    = 128, CS = 48;   // content top / side offsets

  const CDN_H2C  = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  const CDN_JPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  /* ══════════════════════════════════════════════════════════
     Images — stored as base64 in localStorage
  ══════════════════════════════════════════════════════════ */
  const LS = { lh:'kote_img_lh', stamp:'kote_img_stamp', sig:'kote_img_sig' };
  const _b64 = { lh:null, stamp:null, sig:null };

  function _loadB64() {
    for (const [k,lk] of Object.entries(LS)) _b64[k] = localStorage.getItem(lk) || null;
  }
  function setImage(key, dataURL) {
    if (!LS[key]) return;
    dataURL ? localStorage.setItem(LS[key], dataURL) : localStorage.removeItem(LS[key]);
    _b64[key] = dataURL || null;
    if (key === 'lh') { const i = document.querySelector('#inv-lh img'); if (i) i.src = dataURL || 'images/letterhead.png'; }
  }
  function _src(k) { return _b64[k] || (k==='lh'?'images/letterhead.png':k==='stamp'?'images/stamp.png':'images/signature.png'); }

  /* Load any image (relative URL or data-URL) to base64.
     Strategy:
     1. data-URL already → return as-is
     2. XHR blob → FileReader (no canvas = no taint, works on file://)
     3. Canvas fallback for http/https when XHR fails (e.g. opaque cross-origin) */
  async function _imgToB64(src) {
    if (!src) return null;
    if (src.startsWith('data:')) return src;

    /* XHR blob approach — avoids canvas SecurityError on file:// */
    try {
      const blob = await new Promise((res, rej) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', src);
        xhr.responseType = 'blob';
        /* status 0 = success on file://, 200 on http */
        xhr.onload = () => (xhr.status === 0 || (xhr.status >= 200 && xhr.status < 300))
          ? res(xhr.response) : rej(new Error('HTTP ' + xhr.status));
        xhr.onerror = rej;
        xhr.send();
      });
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload  = () => res(fr.result);
        fr.onerror = () => rej(new Error('FileReader error'));
        fr.readAsDataURL(blob);
      });
    } catch(e) { /* fall through to canvas */ }

    /* Canvas fallback (http/https same-origin or CORS-enabled) */
    return new Promise(res => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = img.naturalWidth || img.width;
          cv.height = img.naturalHeight || img.height;
          cv.getContext('2d').drawImage(img, 0, 0);
          res(cv.toDataURL('image/png'));
        } catch(e) { res(null); }
      };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  /* ══════════════════════════════════════════════════════════
     State
  ══════════════════════════════════════════════════════════ */
  let _q       = null;
  let _dbId    = null;
  let _cl      = { id:null, nom:'', adresse:'', ice:'', tel:'', email:'' };
  let _type    = 'devis';
  let _layers  = { lh:true, stamp:false, sig:false };
  let _dovs    = { stamp:null, sig:null };
  let _blob    = null;
  let _fname   = '';
  let _srchTO  = null;
  let _mobView = 'form';
  const _COND_DEFAULT = 'Un acompte de 50% est exigible à la commande. Le solde de 50% est dû à la livraison.';
  let _condOn   = true;
  let _condText = _COND_DEFAULT;
  let _validDate = '';
  let _tvaOn    = false;
  let _tvaRate  = 20;
  let _depositOn = false;
  let _deposit   = 0;
  let _city      = 'Casablanca';

  /* ══════════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════
     SVG icons
  ══════════════════════════════════════════════════════════ */
  const I = {
    doc:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    x:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    srch:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>`,
    save:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    lh:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="5" rx="1"/><line x1="2" y1="11" x2="22" y2="11" stroke-dasharray="3 2"/><line x1="2" y1="15" x2="16" y2="15" stroke-dasharray="3 2"/></svg>`,
    stamp: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M6 21h12M8 17c0-2.21 1.79-4 4-4s4 1.79 4 4v1H8v-1z"/></svg>`,
    sig:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 18c3-6 5-9 7-9s2 3 4 3 4-4.5 7-10.5"/><path d="M3 21h18"/></svg>`,
    wa:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>`,
    mail:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>`,
    dl:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="2" x2="12" y2="16"/></svg>`,
    share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
    form:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>`,
    eye:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };

  /* ══════════════════════════════════════════════════════════
     Helpers
  ══════════════════════════════════════════════════════════ */
  const _$   = id => document.getElementById(id);

  function _lettre(n) {
    const u=['','un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix','onze','douze','treize','quatorze','quinze','seize','dix-sept','dix-huit','dix-neuf'];
    const d=['','','vingt','trente','quarante','cinquante','soixante','soixante-dix','quatre-vingt','quatre-vingt-dix'];
    if(!n||n===0) return 'zéro';
    function hw(x){if(x<20)return u[x];const di=Math.floor(x/10),un=x%10;if(di<7)return d[di]+(un?(un===1&&di<8?'-et-un':'-'+u[un]):(di===8?'s':''));if(di===7)return'soixante-'+(un?u[10+un]:'dix');if(di===8)return'quatre-vingt'+(un?'-'+u[un]:'s');return'quatre-vingt-'+u[10+un];}
    function grp(x){const h=Math.floor(x/100),r=x%100;let s='';if(h)s+=(h===1?'cent':u[h]+' cent')+(h>1&&!r?'s':'');if(h&&r)s+=' ';s+=hw(r);return s;}
    const int=Math.floor(n), dec=Math.round((n-int)*100);
    const pts=[];
    if(int>=1000){const m=Math.floor(int/1000);pts.push(m===1?'mille':grp(m)+' mille');}
    if(int%1000) pts.push(grp(int%1000));
    let r=pts.join(' ').trim();
    r=r.charAt(0).toUpperCase()+r.slice(1);
    return r+(dec>0?' et '+grp(dec)+' centimes':'')+' dirhams';
  }

  /* ══════════════════════════════════════════════════════════
     Supabase
  ══════════════════════════════════════════════════════════ */
  function _sbH(extra={}) {
    const k=window.SUPABASE_ANON_KEY||'';
    return {'apikey':k,'Authorization':'Bearer '+k,'Content-Type':'application/json',...extra};
  }
  async function _sbSearch(q) {
    /* JSON mode — search embedded clients if available */
    if (window._jsonClients) {
      const lq = q.toLowerCase();
      return window._jsonClients.filter(c =>
        (c.nom||'').toLowerCase().includes(lq) ||
        (c.ice||'').toLowerCase().includes(lq)
      ).slice(0, 8);
    }
    const url=`${window.SUPABASE_URL}/rest/v1/kote_clients?select=id,nom,adresse,ice,tel,email&or=(nom.ilike.*${encodeURIComponent(q)}*,ice.ilike.*${encodeURIComponent(q)}*)&limit=8`;
    const r=await fetch(url,{headers:_sbH()});if(!r.ok)throw new Error(await r.text());
    return r.json();
  }
  async function _sbInsertClient(payload) {
    const url=`${window.SUPABASE_URL}/rest/v1/kote_clients`;
    const r=await fetch(url,{method:'POST',headers:_sbH({'Prefer':'return=representation'}),body:JSON.stringify(payload)});
    if(!r.ok)throw new Error(await r.text());
    return (await r.json())[0];
  }
  async function _sbUpsertQuote(quotePayload) {
    const url=`${window.SUPABASE_URL}/rest/v1/kote_quotes`;
    const body={
      ref:        quotePayload.ref,
      status:     _type,
      client_nom: _cl.nom||'',
      client_ice: _cl.ice||'',
      total_ht:   quotePayload.totals?.grand||0,
      total_ttc:  quotePayload.totals?.ttc||quotePayload.totals?.grand||0,
      payload:    quotePayload,
    };
    const r=await fetch(url,{method:'POST',headers:_sbH({'Prefer':'resolution=merge-duplicates,return=representation'}),body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await r.text());
    return (await r.json())[0];
  }

  /* ══════════════════════════════════════════════════════════
     Inject HTML + CSS
  ══════════════════════════════════════════════════════════ */
  function _inject() {
    if (_$('inv-ovl')) return;

    document.body.insertAdjacentHTML('beforeend',`
<div id="inv-ovl">
 <div id="inv-panel">

  <!-- ════ SIDEBAR ════ -->
  <div id="inv-sb">
   <div id="inv-hd">
    <div id="inv-hd-ico">${I.doc}</div>
    <div class="inv-hd-body">
     <div id="inv-hd-title">Aperçu document</div>
     <div id="inv-hd-sub" class="inv-hd-sub">Devis · Facture</div>
    </div>
    <button class="inv-x" onclick="INVOICE.close()" title="Fermer">${I.x}</button>
   </div>

   <div id="inv-bd">

    <!-- 1. Type + Import -->
    <div class="isec">
     <div class="isec-hdr-row">
      <div class="isec-ttl isec-ttl--no-mb">Document</div>
      <button class="iimport-btn" id="inv-imp-toggle" onclick="INVOICE._toggleImport()">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 15V3m0 12l-4-4m4 4l4-4M3 18v2a1 1 0 001 1h16a1 1 0 001-1v-2"/></svg>
       Importer
      </button>
     </div>
     <div class="itype">
      <button class="itbtn on" id="inv-t-d" onclick="INVOICE._setType('devis')">Devis</button>
      <button class="itbtn"    id="inv-t-f" onclick="INVOICE._setType('facture')">Facture</button>
     </div>
     <div class="iimport-panel" id="inv-imp-panel">
      <div class="iimport-search">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="11" height="11"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>
       <input id="inv-imp-q" type="text" placeholder="Ref, client…" autocomplete="off"
              oninput="INVOICE._impSearch(this.value)">
      </div>
      <div class="iimport-list" id="inv-imp-list">
       <div class="iimport-msg">Tapez pour chercher…</div>
      </div>
     </div>
    </div>

    <!-- 2. Client -->
    <div class="isec">
     <div class="isec-ttl">Client</div>

     <!-- chip (shown after picking from DB) -->
     <div class="icl-chip" id="inv-chip">
      <div class="icl-chip-info">
       <div class="icl-chip-name" id="inv-chip-name"></div>
       <div class="icl-chip-sub"  id="inv-chip-sub"></div>
      </div>
      <button class="icl-chip-x" onclick="INVOICE._resetClient()" title="Changer">${I.x}</button>
     </div>

     <!-- search -->
     <div class="inv-srch-wrap" id="inv-srch-wrap">
      <div class="icl-search">
       ${I.srch}
       <input id="inv-cl-q" type="text" placeholder="Rechercher dans la base…"
              autocomplete="off"
              oninput="INVOICE._onSearch(this.value)"
              onfocus="INVOICE._onSearch(this.value)">
       <button class="icl-clr" id="inv-cl-clr" onclick="INVOICE._clearSearch()" style="display:none">${I.x}</button>
      </div>
      <div class="icl-drop" id="inv-cl-drop">
       <div class="icl-dr-msg">Tapez pour rechercher…</div>
      </div>
     </div>

     <!-- form (always shown, fills when picking from search) -->
     <div class="icl-form" id="inv-cl-form">
      <div class="ifl"><label>Nom / Société *</label>
       <input id="inv-fn" type="text" placeholder="Nom ou raison sociale"
              oninput="INVOICE._syncCl()">
      </div>
      <div class="ifl"><label>Adresse</label>
       <textarea id="inv-fa" placeholder="Rue, ville…" oninput="INVOICE._syncCl()"></textarea>
      </div>
      <div class="ifl-row">
       <div class="ifl"><label>ICE</label><input id="inv-fi" type="text" oninput="INVOICE._syncCl()"></div>
       <div class="ifl"><label>Tél</label><input id="inv-ft2" type="text" oninput="INVOICE._syncCl()"></div>
      </div>
      <div class="ifl"><label>Email</label>
       <input id="inv-fe" type="email" oninput="INVOICE._syncCl()">
      </div>
      <!-- appears when nom is filled and client is new -->
      <button class="icl-save" id="inv-cl-save" onclick="INVOICE._saveClient()">
       ${I.save} Ajouter à la base de données
      </button>
     </div>
    </div>

    <!-- 3. Éléments visuels (pill row) -->
    <div class="isec">
     <div class="isec-ttl">Éléments visuels</div>
     <div class="ilpills">
      <button class="ilpill on" id="inv-pl-lh"    onclick="INVOICE._layer('lh')">${I.lh} En-tête</button>
      <button class="ilpill"    id="inv-pl-stamp"  onclick="INVOICE._layer('stamp')">${I.stamp} Cachet</button>
      <button class="ilpill"    id="inv-pl-sig"    onclick="INVOICE._layer('sig')">${I.sig} Signature</button>
     </div>
    </div>

    <!-- 4. Conditions & Validité -->
    <div class="isec">
     <div class="icond-toggle">
      <div class="isec-ttl isec-ttl--no-mb">Conditions de règlement</div>
      <button class="icond-pill on" id="inv-cond-pill" onclick="INVOICE._toggleCond()">Activé</button>
     </div>
     <div class="icond-body" id="inv-cond-body">
      <div class="ifl">
       <label>Texte des conditions</label>
       <textarea id="inv-cond-txt" class="ifl icond-txt" oninput="INVOICE._syncCond(this.value)"></textarea>
      </div>
      <div class="ifl">
       <label>Validité du devis (optionnel)</label>
       <input type="date" id="inv-valid-date" onchange="INVOICE._syncValidDate(this.value)">
      </div>
     </div>
    </div>

    <!-- 4b. Ville -->
    <div class="isec">
     <div class="ifl">
      <label>Ville (ligne de date)</label>
      <input type="text" id="inv-city" placeholder="Casablanca" oninput="INVOICE._syncCity(this.value)">
     </div>
    </div>

    <!-- 5. TVA -->
    <div class="isec">
     <div class="icond-toggle">
      <div class="isec-ttl isec-ttl--no-mb">TVA</div>
      <button class="icond-pill" id="inv-tva-pill" onclick="INVOICE._toggleTva()">OFF</button>
     </div>
     <div class="icond-body off" id="inv-tva-body">
      <div class="ifl">
       <label>Taux TVA (%)</label>
       <input type="number" id="inv-tva-rate" min="0" max="100" step="0.1" value="20"
              oninput="INVOICE._syncTvaRate(+this.value)">
      </div>
     </div>
    </div>



   </div><!-- #inv-bd -->

   <!-- Footer -->
   <div id="inv-ft">
    <button class="ibtn ibtn-gen" id="inv-gen-btn" onclick="INVOICE._generate()">
     ${I.doc} Générer le PDF
    </button>
    <div id="inv-tray">
     <div class="itray-lbl">Partager le PDF</div>
     <div class="itray-row">
      <a  class="itr itr-wa" id="inv-tr-wa" href="#" onclick="event.preventDefault();INVOICE._shareWA()" style="display:none">${I.wa} WhatsApp</a>
      <button class="itr itr-ml" onclick="INVOICE._shareMail()">${I.mail} Mail</button>
     </div>
     <div class="itray-row">
      <button class="itr itr-dl" onclick="INVOICE._dl()">${I.dl} Télécharger</button>
      <button class="itr itr-sh" id="inv-tr-sh" onclick="INVOICE._share()" style="display:none">${I.share} Partager</button>
     </div>
    </div>
    <button class="ibtn ibtn-back" onclick="INVOICE.close()">← Retour</button>
   </div>
  </div><!-- #inv-sb -->

  <!-- ════ PREVIEW ════ -->
  <div id="inv-prev">
   <div id="inv-doc-wrap">
    <div id="inv-doc">
     <div id="inv-lh" class="on"><img src="images/letterhead.png" alt=""></div>
     <div id="inv-ct"></div>
     <div id="inv-spin"><div class="isp"></div><p>Génération…</p></div>
    </div>
   </div>
  </div>

  <!-- ════ MOBILE BOTTOM BAR ════ -->
  <div id="inv-mob-bar">
   <button class="imb-btn on" id="inv-mb-form" onclick="INVOICE._mobSwitch('form')">
    ${I.form} Formulaire
   </button>
   <button class="imb-btn" id="inv-mb-prev" onclick="INVOICE._mobSwitch('preview')">
    ${I.eye} Aperçu
   </button>
  </div>

 </div><!-- #inv-panel -->
</div>`);

    window.addEventListener('resize', _onResize);
    document.addEventListener('click', e => {
      if (!e.target.closest('#inv-srch-wrap')) _$('inv-cl-drop')?.classList.remove('on');
    });
  }

  /* ══════════════════════════════════════════════════════════
     Scale + mobile
  ══════════════════════════════════════════════════════════ */
  function _onResize() { _scaleDoc(); _mobLayout(); }

  function _scaleDoc() {
    const prev=_$('inv-prev'), wrap=_$('inv-doc-wrap');
    if(!prev||!wrap) return;
    /* Reset transform first so offsetHeight reflects true layout height */
    wrap.style.transform = 'none';
    const actualH = wrap.offsetHeight || DOC_H;
    const mob = window.innerWidth <= 700;
    if (mob) {
      const avail = prev.clientWidth - 16;
      const sc = avail / DOC_W;
      wrap.style.transformOrigin = 'top left';
      wrap.style.transform  = `scale(${sc})`;
      wrap.style.marginBottom = (actualH * sc - actualH) + 'px';
      wrap.style.marginRight  = (DOC_W  * sc - DOC_W)   + 'px';
      wrap.style.marginLeft   = '';
    } else {
      const sc = Math.min(
        (prev.clientWidth  - 32) / DOC_W,
        1
      );
      wrap.style.transformOrigin = 'top center';
      wrap.style.transform = `scale(${sc})`;
      wrap.style.marginBottom = (actualH * sc - actualH) + 'px';
      wrap.style.marginRight  = '';
    }
  }

  function _mobLayout() {
    const mob = window.innerWidth <= 700;
    const sb = _$('inv-sb'), pv = _$('inv-prev');
    if (!sb || !pv) return;
    if (!mob) {
      sb.classList.remove('mob-hidden');
      pv.classList.remove('mob-hidden');
      return;
    }
    sb.classList.toggle('mob-hidden', _mobView !== 'form');
    pv.classList.toggle('mob-hidden', _mobView !== 'preview');
  }

  function _mobSwitch(view) {
    _mobView = view;
    _$('inv-mb-form')?.classList.toggle('on', view === 'form');
    _$('inv-mb-prev')?.classList.toggle('on', view === 'preview');
    _mobLayout();
    if (view === 'preview') requestAnimationFrame(_scaleDoc);
  }

  function _getScale() {
    const w=_$('inv-doc-wrap'); if(!w) return 1;
    return new DOMMatrix(getComputedStyle(w).transform).a || 1;
  }

  /* ══════════════════════════════════════════════════════════
     Layer pills
  ══════════════════════════════════════════════════════════ */
  function _layer(k) {
    _layers[k] = !_layers[k];
    _$(`inv-pl-${k}`)?.classList.toggle('on', _layers[k]);
    if (k === 'lh') { _$('inv-lh')?.classList.toggle('on', _layers[k]); }
    else if (_layers[k]) { _dovs[k] ? (_dovs[k].style.display='') : _mkDov(k); }
    else { if (_dovs[k]) _dovs[k].style.display='none'; }
    /* Persist layer prefs so they survive next INVOICE.open() */
    try { localStorage.setItem('kote_inv_layers', JSON.stringify(_layers)); } catch(e) {}
  }

  function _toggleCond() {
    _condOn = !_condOn;
    const pill = _$('inv-cond-pill'), body = _$('inv-cond-body');
    if (pill) { pill.classList.toggle('on', _condOn); pill.textContent = _condOn ? 'Activé' : 'Désactivé'; }
    if (body) body.classList.toggle('off', !_condOn);
    _renderDoc();
  }
  function _syncCond(val) { _condText = val; _renderDoc(); }
  function _syncCity(val) { _city = val.trim() || 'Casablanca'; _renderDoc(); }
  function _syncValidDate(val) { _validDate = val; _renderDoc(); }

  function _toggleTva() {
    _tvaOn = !_tvaOn;
    const pill = _$('inv-tva-pill'), body = _$('inv-tva-body');
    if (pill) { pill.classList.toggle('on', _tvaOn); pill.textContent = _tvaOn ? `${_tvaRate}%` : 'OFF'; }
    if (body) body.classList.toggle('off', !_tvaOn);
    _renderDoc();
  }
  function _syncTvaRate(val) {
    _tvaRate = isNaN(val)||val<0 ? 20 : val;
    const pill = _$('inv-tva-pill');
    if (pill && _tvaOn) pill.textContent = `${_tvaRate}%`;
    _renderDoc();
  }

  function _toggleDeposit() {
    _depositOn = !_depositOn;
    const pill = _$('inv-dep-pill'), body = _$('inv-dep-body');
    if (pill) { pill.classList.toggle('on', _depositOn); pill.textContent = _depositOn ? 'ON' : 'OFF'; }
    if (body) body.classList.toggle('off', !_depositOn);
    if (!_depositOn) { _deposit = 0; const i = _$('inv-dep-amt'); if (i) i.value = 0; }
    _renderDoc();
  }
  function _syncDeposit(val) {
    _deposit = isNaN(val) || val < 0 ? 0 : val;
    _renderDoc();
  }

  function _mkDov(k) {
    /* Target last page — extra if multipage, doc if single */
    const extraPages = document.querySelectorAll('.inv-page-extra');
    const host = extraPages.length ? extraPages[extraPages.length - 1] : _$('inv-doc');
    if (!host) return;
    /* Remove any existing dov for this key across all pages */
    document.querySelectorAll(`.inv-dov[data-k="${k}"]`).forEach(el => el.remove());
    const W=k==='stamp'?120:140;
    const ov=document.createElement('div'); ov.className='inv-dov'; ov.dataset.k=k;
    const img=document.createElement('img');
    img.src=_src(k); img.alt=k; img.style.width=W+'px';
    img.onerror=()=>{img.style.cssText=`width:${W}px;height:${Math.round(W*.65)}px;background:rgba(37,99,235,.06);border:1.5px dashed #2563EB;border-radius:6px;display:block;`;};
    ov.appendChild(img); host.appendChild(ov);
    /* Default: bottom-right, above 125px footer safe zone */
    const Y = DOC_H - 125 - 85;
    if(k==='stamp') {
      ov.style.left=(DOC_W-CS-W-10)+'px';
    } else {
      ov.style.left=(DOC_W-CS-120-10-W-14)+'px';
    }
    ov.style.top=Y+'px';
    _drag(ov); _dovs[k]=ov;
  }

  function _drag(ov) {
    let sx,sy,sl,st,active=false;
    const start=e=>{e.preventDefault();active=true;const p=e.touches?e.touches[0]:e,sc=_getScale();sx=p.clientX/sc;sy=p.clientY/sc;sl=parseFloat(ov.style.left)||0;st=parseFloat(ov.style.top)||0;ov.classList.add('dragging');};
    const move=e=>{if(!active)return;e.preventDefault();const p=e.touches?e.touches[0]:e,sc=_getScale(),w=ov.parentElement;ov.style.left=Math.max(0,Math.min(w.offsetWidth-ov.offsetWidth,sl+p.clientX/sc-sx))+'px';ov.style.top=Math.max(0,Math.min(w.offsetHeight-ov.offsetHeight,st+p.clientY/sc-sy))+'px';};
    const end=()=>{active=false;ov.classList.remove('dragging');};
    ov.addEventListener('mousedown',start);ov.addEventListener('touchstart',start,{passive:false});
    document.addEventListener('mousemove',move);document.addEventListener('touchmove',move,{passive:false});
    document.addEventListener('mouseup',end);document.addEventListener('touchend',end);
  }

  /* ══════════════════════════════════════════════════════════
     Client — search
  ══════════════════════════════════════════════════════════ */
  function _onSearch(val) {
    clearTimeout(_srchTO);
    const drop=_$('inv-cl-drop'), clr=_$('inv-cl-clr');
    const srch=_$('inv-cl-q')?.closest('.icl-search');
    if(!drop) return;
    if(clr) clr.style.display = val ? '' : 'none';
    if(!val.trim()){
      drop.innerHTML='<div class="icl-dr-msg">Tapez pour rechercher…</div>';
      drop.classList.remove('on'); srch?.classList.remove('drop-open'); return;
    }
    drop.innerHTML='<div class="icl-dr-msg">Recherche…</div>';
    drop.classList.add('on'); srch?.classList.add('drop-open');
    _srchTO=setTimeout(async()=>{
      try {
        const rows=await _sbSearch(val.trim());
        if(!rows.length){ drop.innerHTML='<div class="icl-dr-msg">Aucun résultat</div>'; return; }
        drop.innerHTML=rows.map(r=>`
          <div class="icl-dr-row" data-cl="${JSON.stringify(r).replace(/"/g,'&quot;')}" onclick="INVOICE._pickClient(this.dataset.cl)">
           <div class="icl-dr-name">${r.nom||'—'}</div>
           <div class="icl-dr-sub">${[r.ice,r.tel,r.email].filter(Boolean).join(' · ')||r.adresse||''}</div>
          </div>`).join('');
      } catch(e){ drop.innerHTML='<div class="icl-dr-msg">⚠ Erreur réseau</div>'; }
    },280);
  }

  function _clearSearch() {
    const q=_$('inv-cl-q'); if(q){q.value='';q.focus();}
    _$('inv-cl-drop')?.classList.remove('on');
    _$('inv-cl-q')?.closest('.icl-search')?.classList.remove('drop-open');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
  }

  function _pickClient(jsonStr) {
    const r=JSON.parse(jsonStr);
    _cl={id:r.id||null,nom:r.nom||'',adresse:r.adresse||'',ice:r.ice||'',tel:r.tel||'',email:r.email||''};
    _fillForm(); _showChip(); _renderDoc();
    _$('inv-cl-drop')?.classList.remove('on');
    _$('inv-cl-q')?.closest('.icl-search')?.classList.remove('drop-open');
  }

  function _fillForm() {
    const set=(id,v)=>{const e=_$(id);if(e)e.value=v||'';};
    set('inv-fn',_cl.nom); set('inv-fa',_cl.adresse);
    set('inv-fi',_cl.ice); set('inv-ft2',_cl.tel); set('inv-fe',_cl.email);
    const cityEl=_$('inv-city'); if(cityEl) cityEl.value=_city;
    _updateSaveBtn();
  }

  function _showChip() {
    _$('inv-chip-name').textContent=_cl.nom||'—';
    _$('inv-chip-sub').textContent=[_cl.ice,_cl.tel].filter(Boolean).join(' · ')||_cl.adresse||'';
    _$('inv-chip')?.classList.add('on');
  }

  function _resetClient() {
    _cl={id:null,nom:'',adresse:'',ice:'',tel:'',email:''};
    _fillForm(); _$('inv-chip')?.classList.remove('on');
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');
    _renderDoc();
  }

  /* ── form sync ── */
  function _syncCl() {
    _cl.nom     = (_$('inv-fn')?.value ||'').trim();
    _cl.adresse = (_$('inv-fa')?.value ||'').trim();
    _cl.ice     = (_$('inv-fi')?.value ||'').trim();
    _cl.tel     = (_$('inv-ft2')?.value||'').trim();
    _cl.email   = (_$('inv-fe')?.value ||'').trim();
    _cl.id      = null; // manual edit → treat as new
    _updateSaveBtn();
    _renderDoc();
  }

  function _updateSaveBtn() {
    // Show "add to DB" only when nom is filled AND client not already saved
    const show = !!_cl.nom && !_cl.id;
    _$('inv-cl-save')?.classList.toggle('on', show);
  }

  async function _saveClient() {
    const btn=_$('inv-cl-save'); if(!_cl.nom) return;
    const origHTML=btn?btn.innerHTML:'';
    if(btn){btn.disabled=true;btn.style.cssText='background:#e2e8f0;border-color:#cbd5e1;color:#94a3b8;cursor:not-allowed';}
    try {
      const saved=await _sbInsertClient({nom:_cl.nom,adresse:_cl.adresse,ice:_cl.ice,tel:_cl.tel,email:_cl.email});
      _cl.id=saved?.id||null;
      /* flash green success on the button */
      if(btn){
        btn.style.cssText='background:#dcfce7;border-color:#86efac;color:#16a34a;cursor:default';
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Client ajouté avec succès`;
        setTimeout(()=>{
          btn.disabled=false; btn.style.cssText='';
          btn.innerHTML=origHTML;
          _updateSaveBtn(); /* hides btn since cl.id is now set */
        },2500);
      }
      _showChip();
    } catch(e){
      console.error('[INVOICE] saveClient:',e);
      if(btn){
        btn.disabled=false; btn.style.cssText='';
        btn.style.cssText='background:#fef2f2;border-color:#fca5a5;color:#dc2626';
        btn.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Erreur — réessayer`;
        setTimeout(()=>{btn.style.cssText='';btn.innerHTML=origHTML;},3000);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     Render A4
  ══════════════════════════════════════════════════════════ */
  function _renderDoc() {
    /* Remove any extra pages from a previous render */
    document.querySelectorAll('.inv-page-extra').forEach(e => e.remove());
    const mainDoc = _$('inv-doc'), ct = _$('inv-ct');
    if (!ct || !_q || !mainDoc) return;

    const {ref, date, items=[], totals={}, ta, shop={}} = _q;
    const {surAmt=0, del=0, grand=0} = totals;
    const isD = _type === 'devis';

    /* TVA */
    const tvaAmt = _tvaOn ? Math.round(grand * (_tvaRate / 100) * 100) / 100 : 0;
    const total  = _tvaOn ? Math.round((grand + tvaAmt) * 100) / 100 : grand;

    /* Build city + date line: "Casablanca, le 27 avril 2026" */
    const _parseFrDate = (d) => {
      if (!d) return new Date();
      const m = String(d).match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
      if (m) return new Date(+m[3], +m[2]-1, +m[1]);
      const p = new Date(d); return isNaN(p) ? new Date() : p;
    };
    const _dateFmt  = _parseFrDate(date).toLocaleDateString('fr-FR', {day:'numeric', month:'long', year:'numeric'});
    const _dateLine = `${_city||'Casablanca'}, le ${_dateFmt}`;

    /* Layout */
    const CONTENT_W  = DOC_W - 2 * CS;          // 698 px
    const FOOT_SAFE  = 125;                       // letterhead footer unsafe zone (px)
    const PAGE_CONT  = DOC_H - CT - FOOT_SAFE;   // 870px — pagination never enters footer

    /* Off-screen height measurement — CSS classes injected by _inject() apply */
    const _msr = html => {
      const d = document.createElement('div');
      d.style.cssText = `position:fixed;left:-9999px;top:0;width:${CONTENT_W}px;`
        + `font-family:'Poppins',Arial,sans-serif;font-size:9pt;`
        + `visibility:hidden;pointer-events:none;box-sizing:border-box`;
      d.innerHTML = html;
      document.body.appendChild(d);
      const h = d.offsetHeight;
      document.body.removeChild(d);
      return h + 4; // +4 safety
    };

    /* ── HTML fragments ── */
    const cbox = (_cl.nom||_cl.adresse||_cl.ice) ? `
      <div class="dc-cbox">
        ${_cl.nom    ?`<div class="dc-cnom">${_cl.nom}</div>`:''}
        ${_cl.adresse?`<div class="dc-cadr">${_cl.adresse.replace(/\n/g,'<br>')}</div>`:''}
        ${_cl.ice    ?`<div class="dc-cice"><strong>ICE : </strong>${_cl.ice}</div>`:''}
      </div>` : '<div></div>';

    const headerHTML = `
      <div class="dc-date">${_dateLine}</div>
      <div class="dc-top">
        <div><div class="dc-ttl">${isD?'Devis':'Facture'}</div><div class="dc-ref">N° ${ref}</div></div>
        ${cbox}
      </div>`;

    const theadHTML = `<thead><tr>
      <th>Désignations</th>
      <th class="r" style="width:60px">Qté</th>
      <th class="r" style="width:72px">P.U. HT</th>
      <th class="r" style="width:88px">Total HT</th>
    </tr></thead>`;

    /* ── Rich designation builder — uses item.snap for structured HTML ── */
    const _invDesig = it => {
      const s  = it.snap || {};
      const db = typeof DB !== 'undefined' ? DB : {};
      if (!s || !Object.keys(s).length) {
        return it.specs ? `<div class="dc-ts">${it.specs}</div>` : '';
      }
      const paperObj    = (db.paper_stocks   || []).find(p => p.id === s.paper);
      const paperCovObj = (db.paper_stocks   || []).find(p => p.id === s.paperCover);
      const lamObj      = (s.lam        && s.lam        !== 'none') ? (db.finishes || []).find(f => f.id === s.lam)        : null;
      const lamCovObj   = (s.lamCover   && s.lamCover   !== 'none') ? (db.finishes || []).find(f => f.id === s.lamCover)   : null;
      const lamIntObj   = (s.lamInterior&& s.lamInterior!== 'none') ? (db.finishes || []).find(f => f.id === s.lamInterior): null;
      const bindObj     = (s.binding    && s.binding    !== 'none') ? (db.binding_options || []).find(b => b.id === s.binding) : null;
      const gfMatObj    = (db.gf_materials || []).find(m => m.id === s.gfMaterial);

      const isCat    = !!(s.paperCover && s.pages);
      const isGF     = !!(s.gfW && s.gfH);
      const isCarnet = !!(s.carnetPages && s.carnetSouches);
      const isEnv    = !!(s.envFormatId || s.envTypeId);

      const base    = []; // dark text, · separated
      const notable = []; // orange text, • separated
      let   detail  = ''; // optional second line (catalogue)

      if (isCarnet) {
        if (s.sizeObj)         base.push(s.sizeObj.dims || s.sizeObj.label);
        if (paperObj)          base.push(paperObj.label);
        base.push(`${s.carnetPages} f. × ${s.carnetSouches} souches`);
        if (s.carnetColors)    notable.push(`${s.carnetColors}c offset`);
        if (s.carnetNumero)    notable.push('Numéroté' + (s.carnetNumStart > 1 ? ` N°${s.carnetNumStart}` : ''));
        if (s.carnetPerfo)     notable.push('Perforé');
        if (s.carnetCover)     notable.push('Couv. imprimée');

      } else if (isEnv) {
        const envFmt  = (db.envelope_formats || []).find(f => f.id === s.envFormatId);
        const envType = (db.envelope_types   || []).find(t => t.id === s.envTypeId);
        if (envFmt)            notable.push(envFmt.name + (envFmt.w && envFmt.h ? ` ${envFmt.w}×${envFmt.h}mm` : ''));
        if (envType)           notable.push(envType.name);
        if (s.envFenetre)      notable.push('Avec fenêtre');
        if (s.envColors)       notable.push(`${s.envColors}c offset`);

      } else if (isCat) {
        if (s.sizeObj)         base.push(s.sizeObj.dims || s.sizeObj.label);
        base.push(`${s.pages} p.`);
        if (bindObj)           notable.push(bindObj.label);
        // Detail line — interior · cover breakdown
        const sidesInt  = s.sidesInt === 'single' ? 'Recto' : 'R/V';
        const sidesCov  = s.sidesCov === 'single' ? 'Recto' : 'R/V';
        const intParts  = [paperObj ? paperObj.label : null, sidesInt, lamIntObj ? lamIntObj.label : 'sans pelliculage'].filter(Boolean);
        const covParts  = [paperCovObj ? `Couv. ${paperCovObj.label}` : null, sidesCov, lamCovObj ? lamCovObj.label : null].filter(Boolean);
        const sizeLabel = s.sizeObj?.label || '';
        detail = (sizeLabel ? sizeLabel + ' · ' : '') + `int. ${intParts.join(' · ')} · ${covParts.join(' · ')}`;

      } else if (isGF) {
        if (s.gfW && s.gfH)   base.push(`${s.gfW}×${s.gfH} cm`);
        if (gfMatObj)          base.push(gfMatObj.label);
        (s.gfFinishes || []).forEach(fid => {
          const f = (db.gf_finishes || []).find(x => x.id === fid);
          if (f) notable.push(f.label);
        });
        if (s.withSupport) {
          const sup = (db.rollup_supports || []).find(x => x.id === (s.rollupSupportId || null));
          if (sup) notable.push(sup.label);
        }

      } else {
        // Standard: format + paper in base, everything else notable
        if (s.sizeObj)         base.push(s.sizeObj.dims || s.sizeObj.label);
        if (s.fold)            base.push(s.fold.replace('-', ' '));
        if (paperObj)          base.push(paperObj.label);
        if (s.pages)           base.push(s.pages + ' p.');
        if (s.pancarteMat)     { const pm = (db.pancarte_materials || []).find(x => x.id === s.pancarteMat); if (pm) base.push(pm.label); }
        const sidesLabel = s.sides === 'double' ? 'R/V' : s.sides === 'single' ? 'Recto' : null;
        if (sidesLabel)        notable.push(sidesLabel);
        if (lamObj)            notable.push(lamObj.label);
        if (lamCovObj)         notable.push(lamCovObj.label + ' cov.');
        if (bindObj)           notable.push(bindObj.label);
        if (s.chemiseColle)    notable.push('Rabat collé');
        if (s.chemiseImprime)  notable.push('Rabat imprimé');
        (s.addons || []).forEach(aid => {
          const f = (db.finishes_addon || []).find(x => x.id === aid);
          if (f) notable.push(f.label);
        });
        if (s.sacSoufflet > 0) notable.push(`Soufflet ${s.sacSoufflet}mm`);
        if (s.fd?.enabled)     notable.push(s.fd.reuse ? 'FD existante' : 'Forme de découpe');
      }

      const all = [...base, ...notable];

      const mainLine = all.length ? `<div class="dc-ts">${all.join(' · ')}</div>` : '';
      const detailLine = detail ? `<div class="dc-ts" style="margin-top:1px">${detail}</div>` : '';
      return mainLine + detailLine;
    };

    const rowHTMLs = items.map((it, i) => `
      <tr class="${i%2?'er':''}">
        <td><div class="dc-tn">${it.prodName||''}</div>
          ${_invDesig(it)}
          ${it.notes ?`<div class="dc-to">"${it.notes}"</div>`:''}</td>
        <td class="r">${fmtN(it.quantity)}</td>
        <td class="r">${fmt(it.perUnit)}</td>
        <td class="r" style="font-weight:700">${fmt(it.baseTotal)}</td>
      </tr>`);

    const _grandTotal = total || grand;
    const _finalAmt   = (_depositOn && _deposit > 0) ? Math.max(0, _grandTotal - _deposit) : _grandTotal;

    const tfootRows = [
      surAmt>0 ? `<tr><td colspan="3" style="text-align:right;font-size:8pt;color:#f59e0b">${ta?.label||''}</td><td class="tfv" style="text-align:right;color:#f59e0b">+${fmt(surAmt)} DH</td></tr>` : '',
      del>0    ? `<tr><td colspan="3" class="tfl">Livraison</td><td class="tfv" style="text-align:right">+${fmt(del)} DH</td></tr>` : '',
      _tvaOn
        ? `<tr class="tfsep"><td colspan="3" class="tfl">Total HT</td><td class="tfv" style="text-align:right">${fmt(grand)} DH</td></tr>
           <tr><td colspan="3" class="tfl">TVA ${_tvaRate}%</td><td style="text-align:right;color:#94a3b8">${fmt(tvaAmt)} DH</td></tr>
           <tr class="tfsep"><td colspan="3" class="tflb">Total TTC</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(total)} DH</td></tr>`
        : `<tr class="tfsep"><td colspan="3" class="tflb">Total Hors champ de TVA</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(grand)} DH</td></tr>`,
      (_depositOn && _deposit > 0)
        ? `<tr><td colspan="3" class="tfl">Acompte versé</td><td class="tfv" style="text-align:right">−${fmt(_deposit)} DH</td></tr>
           <tr class="tfsep"><td colspan="3" class="tflb">Reste à payer</td><td class="tfv" style="text-align:right;font-size:9.5pt">${fmt(_finalAmt)} DH</td></tr>`
        : ''
    ].join('');
    const tfootHTML = `<tfoot><tr><td colspan="4" style="padding:3px 0;border:none"></td></tr>${tfootRows}</tfoot>`;

    const arreteHTML = `<div class="dc-arr">Arrêter la présente ${isD?'offre':'facture'} à la somme de :
      <strong>${_lettre(_finalAmt).toUpperCase()}.</strong></div>`;

    const condHTML = _condOn ? `<div class="dc-cond">
      <div class="dc-cond-t">Conditions de règlement</div>
      ${shop.rib?`<p>RIB : <strong>${shop.rib}</strong></p>`:''}
      <p>${_condText||_COND_DEFAULT}</p>
      ${_validDate?`<p style="margin-top:5px;font-size:7.5pt;color:#1a1f2e"><strong>Validité du devis : </strong>${new Date(_validDate+'T00:00:00').toLocaleDateString('fr-MA',{day:'2-digit',month:'long',year:'numeric'})}</p>`:''}
    </div>` : '';

    const suffixHTML = arreteHTML + condHTML;

    /* ── Single-page fast path ── */
    if (!items.length) {
      const fill = Array(4).fill('<tr class="er"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('');
      ct.innerHTML = `${headerHTML}<table class="dc-tbl">${theadHTML}<tbody>${fill}</tbody>${tfootHTML}</table>${suffixHTML}`;
      requestAnimationFrame(_scaleDoc); return;
    }

    /* ── Measure heights for page-break algorithm ── */
    const msrDiv = document.createElement('div');
    msrDiv.style.cssText = `position:fixed;left:-9999px;top:0;width:${CONTENT_W}px;`
      + `font-family:'Poppins',Arial,sans-serif;font-size:9pt;`
      + `visibility:hidden;pointer-events:none;box-sizing:border-box`;
    msrDiv.innerHTML = `
      <div>${headerHTML}</div>
      <table class="dc-tbl" style="width:100%;border-collapse:collapse">
        ${theadHTML}<tbody>${rowHTMLs.join('')}</tbody>
      </table>
      <table class="dc-tbl" style="width:100%;border-collapse:collapse">${tfootHTML}</table>
      <div>${suffixHTML}</div>`;
    document.body.appendChild(msrDiv);

    const kids      = msrDiv.children;
    const headerH   = kids[0].offsetHeight;
    const allTrs    = Array.from(msrDiv.querySelectorAll('tbody tr'));
    const theadH    = msrDiv.querySelector('thead').offsetHeight;
    const rowHts    = allTrs.map(tr => tr.offsetHeight);
    const tfootH    = kids[2].offsetHeight;
    const sfxH      = kids[3].offsetHeight;
    const suffH     = tfootH + sfxH + 4;

    document.body.removeChild(msrDiv);

    /* ── Greedy page packing ── */
    const pages = [[]];
    let used = headerH + theadH;

    for (let i = 0; i < rowHTMLs.length; i++) {
      const rh = rowHts[i];
      const isLast = i === rowHTMLs.length - 1;
      const fits   = used + rh + (isLast ? suffH : 0) <= PAGE_CONT;
      const isFirstOnPage = pages[pages.length - 1].length === 0;

      if (fits || isFirstOnPage) {
        pages[pages.length - 1].push(i);
        used += rh;
      } else {
        pages.push([i]);
        used = theadH + rh;
      }
    }

    /* If suffix doesn't fit on last page, push it to a new page */
    if (used + suffH > PAGE_CONT) pages.push([]);

    const numPages = pages.length;

    /* ── Build page content HTML ── */
    const lhSrc = _b64.lh || 'images/letterhead.png';

    const _pageContent = (rowIdxs, isFirst, isLast) => {
      const fill = (isFirst && isLast) ? Array(Math.max(0, 4 - rowIdxs.length))
        .fill('<tr class="er"><td>&nbsp;</td><td></td><td></td><td></td></tr>').join('') : '';
      return `${isFirst ? headerHTML : ''}
        <table class="dc-tbl">
          ${theadHTML}
          <tbody>${rowIdxs.map(i => rowHTMLs[i]).join('')}${fill}</tbody>
          ${isLast ? tfootHTML : '<tfoot></tfoot>'}
        </table>
        ${isLast ? suffixHTML : ''}`;
    };

    /* Page 1 — goes into #inv-ct */
    ct.innerHTML = _pageContent(pages[0], true, numPages === 1);

    /* Extra pages */
    const wrap = mainDoc.parentElement;
    for (let p = 1; p < numPages; p++) {
      const div = document.createElement('div');
      div.className = 'inv-page-extra';
      div.innerHTML = `
        <div class="inv-lh-clone${_layers.lh?' on':''}"><img src="${lhSrc}" alt=""></div>
        <div class="inv-ct-extra">${_pageContent(pages[p], false, p === numPages - 1)}</div>`;
      wrap.appendChild(div);
    }

    requestAnimationFrame(_scaleDoc);
    /* Re-pin stamp/sig to last page after pagination may have changed */
    requestAnimationFrame(() => {
      ['stamp','sig'].forEach(k => { if (_layers[k]) _mkDov(k); });
    });
  }

  /* ══════════════════════════════════════════════════════════
     open / close
  ══════════════════════════════════════════════════════════ */
  function open(q, opts={}) {
    _inject(); _loadB64();
    _q=q; _blob=null; _dbId=opts.dbId||null;
    _type=opts.docType||'devis';

    /* Restore persisted layer prefs, default to lh:true stamp:false sig:false */
    try {
      const saved = JSON.parse(localStorage.getItem('kote_inv_layers') || 'null');
      _layers = saved ? { lh: !!saved.lh, stamp: !!saved.stamp, sig: !!saved.sig }
                      : { lh:true, stamp:false, sig:false };
    } catch(e) {
      _layers = { lh:true, stamp:false, sig:false };
    }

    _dovs={stamp:null,sig:null};
    _mobView='form';

    /* Pre-fill client if passed in opts */
    if(opts.client){
      _cl={...{id:null,nom:'',adresse:'',ice:'',tel:'',email:''},...opts.client};
    } else {
      _cl={id:null,nom:'',adresse:'',ice:'',tel:'',email:''};
    }

    /* Reset UI */
    _fillForm();
    _$('inv-chip')?.classList.remove('on');
    if(_cl.nom) _showChip();
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');

    /* type btns */
    _$('inv-t-d')?.classList.toggle('on',_type==='devis');
    _$('inv-t-f')?.classList.toggle('on',_type==='facture');

    /* layer pills — driven by restored _layers */
    _$('inv-pl-lh')?.classList.toggle('on', _layers.lh);
    _$('inv-pl-stamp')?.classList.toggle('on', _layers.stamp);
    _$('inv-pl-sig')?.classList.toggle('on', _layers.sig);
    _$('inv-lh')?.classList.toggle('on', _layers.lh);

    /* letterhead src */
    const lhImg=document.querySelector('#inv-lh img');
    if(lhImg) lhImg.src=_b64.lh||'images/letterhead.png';

    /* generate + tray */
    _$('inv-tray')?.classList.remove('on');
    const gb=_$('inv-gen-btn');
    if(gb){gb.disabled=false;gb.innerHTML=`${I.doc} Générer le PDF`;}

    /* WA / share */
    const wa=_$('inv-tr-wa');
    if(wa) wa.style.display = navigator.canShare ? 'flex' : 'none';
    const sh=_$('inv-tr-sh');if(sh) sh.style.display=navigator.share?'flex':'none';

    /* Reset conditions state */
    _condOn   = true;
    _condText = _COND_DEFAULT;
    _validDate = '';
    const condTxt  = _$('inv-cond-txt');
    const condDate = _$('inv-valid-date');
    const condPill = _$('inv-cond-pill');
    const condBody = _$('inv-cond-body');
    if(condTxt)  condTxt.value  = _COND_DEFAULT;
    if(condDate) condDate.value = '';
    if(condPill){ condPill.classList.add('on'); condPill.textContent='Activé'; }
    if(condBody) condBody.classList.remove('off');

    /* Reset TVA state */
    _tvaOn   = false;
    _tvaRate = 20;
    const tvaPill = _$('inv-tva-pill'), tvaBody = _$('inv-tva-body'), tvaRate = _$('inv-tva-rate');
    if(tvaPill){ tvaPill.classList.remove('on'); tvaPill.textContent='OFF'; }
    if(tvaBody) tvaBody.classList.add('off');
    if(tvaRate) tvaRate.value = 20;

    /* Reset Deposit state — pre-fill from opts.deposit if available */
    _depositOn = !!(opts.deposit && opts.deposit > 0);
    _deposit   = (opts.deposit && opts.deposit > 0) ? opts.deposit : 0;
    const depPill = _$('inv-dep-pill'), depBody = _$('inv-dep-body'), depAmt = _$('inv-dep-amt');
    if (depPill) { depPill.classList.toggle('on', _depositOn); depPill.textContent = _depositOn ? 'ON' : 'OFF'; }
    if (depBody) depBody.classList.toggle('off', !_depositOn);
    if (depAmt)  depAmt.value = _deposit || 0;

    document.querySelectorAll('.inv-dov').forEach(e=>e.remove());
    _$('inv-mob-bar') && _mobSwitch('form');
    _$('inv-ovl').classList.add('on');
    document.body.style.overflow='hidden';
    _renderDoc();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      _scaleDoc(); _mobLayout();
      /* Restore stamp / sig draggable overlays if layers were active */
      ['stamp','sig'].forEach(k=>{ if(_layers[k]) _mkDov(k); });
    }));
  }

  function close() {
    _$('inv-ovl')?.classList.remove('on');
    document.body.style.overflow='';
    document.querySelectorAll('.inv-dov').forEach(e=>e.remove());
    _dovs={stamp:null,sig:null};
  }

  /* ══════════════════════════════════════════════════════════
     Generate PDF — taint-proof
     ─────────────────────────────────────────────────────────
     Strategy (same as v5):
     1. base64 in localStorage → swap src → zero external URLs
     2. http(s):// without base64 → useCORS:true
     3. file:// without base64 → hide images before capture
  ══════════════════════════════════════════════════════════ */
  async function _generate() {
    const gb=_$('inv-gen-btn'), sp=_$('inv-spin');
    if(gb){gb.disabled=true;gb.textContent='⏳ Rendu…';}
    if(sp) sp.classList.add('on');

    const isFile=location.protocol==='file:';
    const hidden=[];
    const hide=el=>{if(el){el.style.visibility='hidden';hidden.push(el);}};
    const restore=()=>hidden.forEach(el=>el.style.visibility='');

    try {
      await _loadScript(CDN_H2C,'html2canvas'); await _loadScript(CDN_JPDF,'jspdf');

      /* ── Resolve all images to base64, wait for load, then capture ──
         html2canvas clones the DOM before rendering — two-step fix:
         1) resolve + onload in live DOM (browser cache populated)
         2) re-inject in onclone() so the cloned doc also has data-URLs  */
      const _resolved = {};

      /* Resolve every image we might need — use _src() which already
         returns localStorage data-URL if uploaded, else the file path */
      const _keys = ['lh', 'stamp', 'sig'];
      for (const k of _keys) {
        const b64 = await _imgToB64(_src(k));
        if (b64) _resolved[k] = b64;
      }

      /* Pre-warm live DOM images with resolved data-URLs */
      const lhImg = document.querySelector('#inv-lh img');
      if (lhImg && _resolved.lh) {
        await new Promise(res => {
          if (lhImg.src === _resolved.lh && lhImg.complete) { res(); return; }
          lhImg.onload = lhImg.onerror = () => { lhImg.onload = lhImg.onerror = null; res(); };
          lhImg.src = _resolved.lh;
          if (lhImg.complete) res();
        });
      }
      for (const dov of document.querySelectorAll('.inv-dov')) {
        const k = dov.dataset.k, img = dov.querySelector('img');
        if (img && _resolved[k]) {
          await new Promise(res => {
            if (img.src === _resolved[k] && img.complete) { res(); return; }
            img.onload = img.onerror = () => { img.onload = img.onerror = null; res(); };
            img.src = _resolved[k];
            if (img.complete) res();
          });
        }
      }

      await new Promise(r => setTimeout(r, 60));

      /* ══════════════════════════════════════════════════════
         OFF-SCREEN DESKTOP ENGINE
         Build completely isolated render containers outside
         the overlay DOM — zero mobile CSS contamination.
         html2canvas then captures clean, unclipped elements.
      ══════════════════════════════════════════════════════ */
      const lhSrc  = _resolved.lh || null;
      const lhVis  = _layers.lh;

      /* Page data: collect innerHTML of each page's content area */
      const mainDoc  = _$('inv-doc');
      const ctHTML   = _$('inv-ct')?.innerHTML || '';
      const extraEls = Array.from(document.querySelectorAll('.inv-page-extra'));
      const pageContents = [{ ct: ctHTML, lh: lhVis }];
      extraEls.forEach(el => {
        pageContents.push({
          ct:  el.querySelector('.inv-ct-extra')?.innerHTML || '',
          lh:  el.querySelector('.inv-lh-clone')?.classList.contains('on') ?? lhVis,
        });
      });

      /* Dov (stamp/sig) snapshots: position + resolved src */
      const dovSnaps = Array.from(document.querySelectorAll('.inv-dov')).map(dov => ({
        k:    dov.dataset.k,
        left: dov.style.left,
        top:  dov.style.top,
        w:    dov.querySelector('img')?.style.width || '120px',
        src:  _resolved[dov.dataset.k] || null,
      }));

      /* Off-screen host — completely outside #inv-ovl */
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-${DOC_W + 40}px;top:0;`
        + `width:${DOC_W}px;overflow:visible;z-index:-1;pointer-events:none`;
      document.body.appendChild(host);

      /* Build one render-frame per page, measure, capture */
      const {jsPDF} = window.jspdf;
      const pdf = new jsPDF('p','mm','a4');

      for (let pi = 0; pi < pageContents.length; pi++) {
        const pg = pageContents[pi];

        /* Build isolated page element */
        const frame = document.createElement('div');
        frame.style.cssText = `width:${DOC_W}px;height:${DOC_H}px;background:#fff;`
          + `position:relative;overflow:hidden;font-family:'Poppins',Arial,sans-serif`;

        /* Letterhead */
        if (pg.lh && lhSrc) {
          const lhDiv = document.createElement('div');
          lhDiv.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none';
          const lhI = document.createElement('img');
          lhI.src = lhSrc;
          lhI.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
          lhDiv.appendChild(lhI);
          frame.appendChild(lhDiv);
        }

        /* Content area */
        const ctDiv = document.createElement('div');
        ctDiv.style.cssText = `position:absolute;z-index:1;`
          + `top:${CT}px;left:${CS}px;right:${CS}px;bottom:125px;`
          + `box-sizing:border-box;overflow:hidden;font-family:'Poppins',Arial,sans-serif`;
        ctDiv.innerHTML = pg.ct;
        frame.appendChild(ctDiv);

        /* Stamp / sig overlays — last page only */
        if (pi === pageContents.length - 1) {
          dovSnaps.forEach(snap => {
            if (!snap.src) return;
            const dov = document.createElement('div');
            dov.style.cssText = `position:absolute;z-index:3;left:${snap.left};top:${snap.top}`;
            const img = document.createElement('img');
            img.src = snap.src;
            img.style.width = snap.w;
            img.style.display = 'block';
            dov.appendChild(img);
            frame.appendChild(dov);
          });
        }

        host.innerHTML = '';
        host.appendChild(frame);

        /* Wait for images to fully load inside frame */
        const imgs = Array.from(frame.querySelectorAll('img'));
        await Promise.all(imgs.map(img => new Promise(res => {
          if (img.complete && img.naturalWidth > 0) { res(); return; }
          img.onload = img.onerror = res;
        })));
        await new Promise(r => requestAnimationFrame(r));

        const canvas = await window.html2canvas(frame, {
          scale: 2, useCORS: false, allowTaint: true,
          foreignObjectRendering: false,
          width: DOC_W, height: DOC_H, backgroundColor: '#ffffff',
          logging: false, imageTimeout: 0,
        });

        if (pi > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, 210, 297);
      }

      document.body.removeChild(host);

      restore();
      _blob=pdf.output('blob');
      _fname=`${_type==='devis'?'Devis':'Facture'}_${_q.ref}_${(_q.date||'').replace(/\//g,'-')}.pdf`;

      /* upsert to kote_quotes with full payload + client + deposit */
      const fullPayload={ ..._q, client:_cl, docType:_type,
        deposit: (_depositOn && _deposit > 0) ? _deposit : 0 };
      _sbUpsertQuote(fullPayload).then(row=>{ if(row?.id) _dbId=row.id; }).catch(()=>{});


      _$('inv-tray')?.classList.add('on');
      if(gb){gb.disabled=false;gb.textContent='↺ Regénérer';}
    } catch(err){
      restore();
      console.error('[INVOICE]',err);
      if(gb){gb.disabled=false;gb.textContent='⚠ Erreur — Réessayer';}
    } finally {
      if(sp) sp.classList.remove('on');
    }
  }

  function _dl() {
    if(!_blob) return;
    const url=URL.createObjectURL(_blob);
    const a=document.createElement('a');a.href=url;a.download=_fname;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),8000);
  }
  async function _share() {
    if(!_blob) return;
    const f=new File([_blob],_fname,{type:'application/pdf'});
    if(navigator.canShare?.({files:[f]})){try{await navigator.share({files:[f],title:_fname});}catch(e){if(e.name!=='AbortError')_dl();}}else _dl();
  }
  function _shareMail() {
    if(!_q) return;
    const sub=encodeURIComponent(`${_type==='devis'?'Devis':'Facture'} ${_q.ref}`);
    const body=encodeURIComponent(`Bonjour,\n\nVeuillez trouver en pièce jointe notre ${_type==='devis'?'devis':'facture'} réf. ${_q.ref}.\n\nCordialement,\n${_q.shop?.name||''}`);
    _dl();
    setTimeout(()=>{const a=document.createElement('a');a.href=`mailto:?subject=${sub}&body=${body}`;a.click();},350);
  }

  async function _shareWA() {
    if (!_blob) return;
    const f = new File([_blob], _fname, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: _fname }); }
      catch(e) { if (e.name !== 'AbortError') _dl(); }
    } else {
      /* Fallback: download + open WhatsApp web so user can attach manually */
      _dl();
      const num = (_q?.shop?.whatsapp || '').replace(/\D/g, '');
      if (num) setTimeout(() => window.open(`https://wa.me/${num}`, '_blank'), 400);
    }
  }


  function _setType(t) {
    if (_type === t) return;
    // Full reset: keep the quote data (_q) but clear client, blob, and all options
    _type = t;
    _blob = null;
    _cl   = { id:null, nom:'', adresse:'', ice:'', tel:'', email:'' };
    _condOn   = true;
    _condText = _COND_DEFAULT;
    _validDate = '';
    _tvaOn   = false;
    _tvaRate = 20;
    _depositOn = false;
    _deposit   = 0;

    // Sync type buttons
    _$('inv-t-d')?.classList.toggle('on', t==='devis');
    _$('inv-t-f')?.classList.toggle('on', t==='facture');

    // Reset client UI
    _fillForm();
    _$('inv-chip')?.classList.remove('on');
    _$('inv-cl-q') && (_$('inv-cl-q').value='');
    _$('inv-cl-clr') && (_$('inv-cl-clr').style.display='none');
    _$('inv-cl-drop')?.classList.remove('on');

    // Reset conditions UI
    const condTxt  = _$('inv-cond-txt');
    const condDate = _$('inv-valid-date');
    const condPill = _$('inv-cond-pill');
    const condBody = _$('inv-cond-body');
    if (condTxt)  condTxt.value  = _COND_DEFAULT;
    if (condDate) condDate.value = '';
    if (condPill) { condPill.classList.add('on'); condPill.textContent='Activé'; }
    if (condBody) condBody.classList.remove('off');

    // Reset TVA UI
    const tvaPill = _$('inv-tva-pill'), tvaBody = _$('inv-tva-body'), tvaRate = _$('inv-tva-rate');
    if (tvaPill) { tvaPill.classList.remove('on'); tvaPill.textContent='OFF'; }
    if (tvaBody) tvaBody.classList.add('off');
    if (tvaRate) tvaRate.value = 20;

    // Reset deposit UI
    const depPill = _$('inv-dep-pill'), depBody = _$('inv-dep-body'), depAmt = _$('inv-dep-amt');
    if (depPill) { depPill.classList.remove('on'); depPill.textContent='OFF'; }
    if (depBody) depBody.classList.add('off');
    if (depAmt)  depAmt.value = 0;

    // Reset generate button + tray
    _$('inv-tray')?.classList.remove('on');
    const gb = _$('inv-gen-btn');
    if (gb) { gb.disabled=false; gb.innerHTML=`${I.doc} Générer le PDF`; }

    _renderDoc();
  }

  /* ════ Import from kote_quotes ════ */
  let _impTO=null, _impOpen=false;

  function _toggleImport() {
    _impOpen=!_impOpen;
    _$('inv-imp-panel')?.classList.toggle('on',_impOpen);
    _$('inv-imp-toggle')?.classList.toggle('on',_impOpen);
    if(_impOpen){ _$('inv-imp-q')?.focus(); _impSearch(''); }
  }

  function _impSearch(val) {
    clearTimeout(_impTO);
    const list=_$('inv-imp-list'); if(!list) return;
    list.innerHTML='<div class="iimport-msg">Chargement…</div>';
    _impTO=setTimeout(async()=>{
      const q=val.trim();
      const fd=s=>_fmtDate(s,{day:'2-digit',month:'2-digit',year:'2-digit'});
      const fm=fmt;

      /* JSON mode — search embedded quotes */
      if (window._jsonQuotes) {
        let rows = window._jsonQuotes;
        if (q) {
          const lq = q.toLowerCase();
          rows = rows.filter(r =>
            (r.ref||'').toLowerCase().includes(lq) ||
            (r.client_nom||'').toLowerCase().includes(lq)
          );
        }
        rows = rows.slice(0, 25);
        if (!rows.length) { list.innerHTML='<div class="iimport-msg">Aucun résultat</div>'; return; }
        list.innerHTML=rows.map(row=>`
          <div class="iimport-row" onclick="INVOICE._impLoad('${row.id}')">
           <div class="iimport-row-ref">${row.ref}
            <span class="iimport-badge">${row.status||'devis'}</span>
           </div>
           <div class="iimport-row-sub">${row.client_nom||'—'} &middot; ${fm(row.total_ht)} DH HT &middot; ${fd(row.created_at)}</div>
          </div>`).join('');
        return;
      }

      const SB=window.SUPABASE_URL||'', K=window.SUPABASE_ANON_KEY||'';
      const filter=q?`&or=(ref.ilike.*${encodeURIComponent(q)}*,client_nom.ilike.*${encodeURIComponent(q)}*)`:'';
      const url=`${SB}/rest/v1/kote_quotes?select=id,ref,status,client_nom,total_ht,created_at&order=created_at.desc&limit=25${filter}`;
      try {
        const r=await fetch(url,{headers:{'apikey':K,'Authorization':'Bearer '+K}});
        if(!r.ok) throw new Error(r.status);
        const rows=await r.json();
        if(!rows.length){ list.innerHTML='<div class="iimport-msg">Aucun résultat</div>'; return; }
        list.innerHTML=rows.map(row=>`
          <div class="iimport-row" onclick="INVOICE._impLoad('${row.id}')">
           <div class="iimport-row-ref">${row.ref}
            <span class="iimport-badge">${row.status||'devis'}</span>
           </div>
           <div class="iimport-row-sub">${row.client_nom||'—'} &middot; ${fm(row.total_ht)} DH HT &middot; ${fd(row.created_at)}</div>
          </div>`).join('');
      } catch(e){ list.innerHTML='<div class="iimport-msg">⚠ Erreur réseau</div>'; }
    }, val.trim()?280:0);
  }

  async function _impLoad(dbId) {
    let row;
    /* JSON mode — find in embedded quotes */
    if (window._jsonQuotes) {
      row = window._jsonQuotes.find(r => r.id === dbId);
    }
    if (!row) {
      const SB=window.SUPABASE_URL||'', K=window.SUPABASE_ANON_KEY||'';
      try {
        const r=await fetch(`${SB}/rest/v1/kote_quotes?id=eq.${dbId}&select=*&limit=1`,
          {headers:{'apikey':K,'Authorization':'Bearer '+K}});
        const rows=await r.json(); row=rows[0];
      } catch(e){ console.error('[INVOICE] impLoad:',e); return; }
    }
    if (!row) return;
    const p=row.payload||{};
    _q={...p}; _type=row.status||'devis';
    if(p.client&&(p.client.nom||p.client.id)){
      _cl={...{id:null,nom:'',adresse:'',ice:'',tel:'',email:''},...p.client};
      _fillForm(); if(_cl.nom) _showChip();
    }
    _$('inv-t-d')?.classList.toggle('on',_type==='devis');
    _$('inv-t-f')?.classList.toggle('on',_type==='facture');
    _renderDoc();
    _impOpen=false;
    _$('inv-imp-panel')?.classList.remove('on');
    _$('inv-imp-toggle')?.classList.remove('on');
    _blob=null;
    _$('inv-tray')?.classList.remove('on');
    const gb=_$('inv-gen-btn');
    if(gb){gb.disabled=false;gb.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> Générer le PDF`;}
  }

  return {
    open, close, setImage,
    _setType, _layer, _toggleCond, _syncCond, _syncValidDate, _syncCity, _toggleTva, _syncTvaRate,
    _toggleDeposit, _syncDeposit,
    _mobSwitch,
    _toggleImport, _impSearch, _impLoad,
    _onSearch, _clearSearch, _pickClient, _syncCl, _resetClient, _saveClient,
    _renderDoc, _generate, _dl, _share, _shareWA, _shareMail,
  };
})();
