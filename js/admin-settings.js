'use strict';

/* ════════════════════════════════════════════════════════
   admin-settings.js — Boutique, Notifications & Design tab renderers
   Extracted from kote-admin.js (S6 split).
   Exposes file-scope: _bIdentite, _bContact (alias), _bNotifications, _bDesign
   Requires: kote-core.js (DB, IC), admin-materials.js (helpers)
   Load order: after admin-materials.js, before kote-admin.js
   ════════════════════════════════════════════════════════ */

/* ── Identité tab — shop identity only (name, address, tel, ICE) ── */
function _bIdentite() {
  if (!DB.contact) DB.contact = {};
  if (!DB.shop)    DB.shop    = {};
  const s = DB.shop;
  const row = (label, key, placeholder='', hint='') => `
    <div class="adm-row">
      <div>
        <div class="adm-row-label">${label}</div>
        ${hint ? `<div class="adm-row-sub">${hint}</div>` : ''}
      </div>
      <input class="adm-inp-lbl" style="width:180px"
        value="${(s[key]||'').replace(/"/g,'&quot;')}"
        placeholder="${placeholder}"
        oninput="ADMIN.set('shop.${key}',this.value)">
    </div>`;
  return `
    ${_pageHdr('Identité', 'Informations de la boutique — visibles sur le devis PDF')}
    <div class="adm-grid adm-grid-1">
      ${_card('Boutique', '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        row('Nom de la boutique', 'name',    'Kote Imprimerie') +
        row('Adresse',            'address', 'Casablanca, Maroc') +
        row('Site web',           'website', 'https://…') +
        row('Téléphone',          'tel',     '+212 6XX XXX XXX') +
        row('ICE',                'ice',     '000000000000000', 'Identifiant Commun de l\'Entreprise')
      )}
    </div>`;
}

/* backward-compat alias — any legacy selectTab('contact') still renders Identité */
function _bContact() { return _bIdentite(); }

/* ── Notifications tab — WhatsApp client + Telegram + Email Resend ── */
function _bNotifications() {
  if (!DB.contact) DB.contact = {};
  if (!DB.shop)    DB.shop    = {};
  const c = DB.contact, s = DB.shop;

  return `
    ${_pageHdr('Notifications', 'Canaux de communication — client et propriétaire')}
    <div class="adm-grid adm-grid-1">

      ${_card('WhatsApp client',
        '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81 19.79 19.79 0 01.15 1.18 2 2 0 012.13 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/>',
        `<div class="adm-row">
          <div>
            <div class="adm-row-label">Numéro WhatsApp</div>
            <div class="adm-row-sub">Format international sans + ni espaces — ex: 212661234567</div>
          </div>
          <input class="adm-inp-lbl" style="width:170px"
            value="${(c.whatsapp||'').replace(/"/g,'&quot;')}"
            placeholder="212600000000"
            oninput="ADMIN.set('contact.whatsapp',this.value)">
        </div>
        <div class="adm-row adm-row--no-border">
          <div class="adm-row-label adm-dim-txt">Aperçu du lien</div>
          <code style="font-size:.62rem;color:var(--bl);word-break:break-all">
            ${c.whatsapp ? `wa.me/${(c.whatsapp||'').replace(/\D/g,'')}` : '—'}
          </code>
        </div>`
      )}

      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico" style="background:#e8f4fd">
              <svg viewBox="0 0 24 24" fill="none" stroke="#0088cc" stroke-width="1.8" style="width:11px;height:11px"><path d="M21.5 2L2 9.5l7 2.5 2.5 7L21.5 2z"/><path d="M9 12l4 4"/></svg>
            </div>
            <div>
              <div class="adm-card-title">Telegram — Alertes commandes</div>
              <div class="adm-card-sub">Recevez une notification à chaque nouvelle commande</div>
            </div>
          </div>
          <label class="tog${c.tg_enabled?' on':''}"
            onclick="this.classList.toggle('on');ADMIN.set('contact.tg_enabled',this.classList.contains('on'));ADMIN._settingsSelectTab('notifications')">
          </label>
        </div>
        <div class="adm-rows" style="${c.tg_enabled?'':'opacity:.45;pointer-events:none'}">
          <div class="adm-row">
            <div>
              <div class="adm-row-label">Bot Token</div>
              <div class="adm-row-sub">@BotFather → /newbot → copier le token</div>
            </div>
            <input class="adm-inp-lbl adm-inp--mono-sm" style="width:200px"
              type="password"
              value="${(c.tg_token||'').replace(/"/g,'&quot;')}"
              placeholder="123456789:AAF..."
              oninput="ADMIN.set('contact.tg_token',this.value)">
          </div>
          <div class="adm-row">
            <div>
              <div class="adm-row-label">Chat ID</div>
              <div class="adm-row-sub">Envoyez /start à votre bot, puis @userinfobot</div>
            </div>
            <input class="adm-inp-lbl adm-inp--mono" style="width:140px"
              value="${(c.tg_chat_id||'').replace(/"/g,'&quot;')}"
              placeholder="123456789"
              oninput="ADMIN.set('contact.tg_chat_id',this.value)">
          </div>
          <div class="adm-row adm-row--no-border">
            <div>
              <div class="adm-row-label">Tester</div>
              <div class="adm-row-sub">Envoie un message de test à votre bot</div>
            </div>
            <button class="adm-action-btn" onclick="ADMIN.tgTest()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px"><path d="M21.5 2L2 9.5l7 2.5 2.5 7L21.5 2z"/></svg>
              Envoyer test
            </button>
          </div>
        </div>
        <div class="adm-guide-note">
          <strong>Guide rapide :</strong>
          Ouvrez Telegram → cherchez <code class="adm-code-tag">@BotFather</code> →
          <code class="adm-code-tag">/newbot</code> → copiez le token.
          Puis <code class="adm-code-tag">@userinfobot</code> → copiez votre <em>Id</em> comme Chat ID.
        </div>
      </div>

      ${_card('Email — Confirmations commandes',
        '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
        `<div class="adm-row">
          <div>
            <div class="adm-row-label">URL de l'application</div>
            <div class="adm-row-sub">Domaine sans slash final — utilisé dans les liens de suivi</div>
          </div>
          <input class="adm-inp-lbl adm-inp--mono-sm" style="width:210px"
            value="${(s.app_url||'').replace(/"/g,'&quot;')}"
            placeholder="https://appkote.netlify.app"
            oninput="ADMIN.set('shop.app_url',this.value)">
        </div>
        <div class="adm-row adm-row--no-border">
          <div>
            <div class="adm-row-label">Email expéditeur Resend</div>
            <div class="adm-row-sub">Domaine vérifié sur Resend (from)</div>
          </div>
          <input class="adm-inp-lbl adm-inp--mono-sm" style="width:210px"
            value="${(s.resend_from_email||'').replace(/"/g,'&quot;')}"
            placeholder="commandes@votre-domaine.ma"
            oninput="ADMIN.set('shop.resend_from_email',this.value)">
        </div>`
      )}

    </div>`;
}

/* ── Telegram test ── */
async function tgTest() {
  const token   = DB.contact?.tg_token?.trim();
  const chat_id = DB.contact?.tg_chat_id?.trim();
  if (!token || !chat_id) { alert('Renseignez le Token et le Chat ID d\'abord.'); return; }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text: '✅ Kote · Notifications activées !\n\nVous recevrez une alerte ici à chaque nouvelle commande.', parse_mode: 'HTML' }),
  }).catch(e => ({ ok: false, _err: e.message }));
  const data = res.ok ? await res.json().catch(() => ({})) : {};
  if (data.ok) { alert('✅ Message envoyé — vérifiez Telegram !'); }
  else         { alert('❌ Échec : ' + (data.description || res._err || 'Vérifiez token et chat ID')); }
}

/* ══════════════════════════════════════════════════════
   DEPLOY — Email Edge Function tab
   ══════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   EDGE FUNCTION REGISTRY
   Add any new function here — deploy panel + SQL export
   pick it up automatically. No other change required.
   ══════════════════════════════════════════════════════ */
const _EDGE_FUNCTIONS = [

  /* ── kote-order-confirm ──────────────────────────────── */
  {
    slug: 'kote-order-confirm',
    name: 'Confirmation de commande',
    desc: 'Envoie un email de confirmation au client après chaque commande via Resend.',
    secrets: ['RESEND_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
    source: `import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';

const fmt = (n) =>
(n ?? 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function _getCfg(supabaseUrl, supabaseKey) {
try {
  const r = await fetch(supabaseUrl + '/rest/v1/kote_config?select=shop&limit=1', {
    headers: { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey },
  });
  if (!r.ok) return {};
  const rows = await r.json();
  return rows?.[0]?.shop || {};
} catch { return {}; }
}

function buildHtml(p, appUrl, shopName) {
const rows = p.items.map(i => \`
  <tr>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155">\${i.prodName}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b">\${i.specs || '—'}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#334155;text-align:right">\${i.quantity} × \${fmt(i.perUnit ?? 0)} DH</td>
  </tr>\`).join('');
return \`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>Confirmation \${p.order_ref}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06)">
<tr><td style="background:#2463EB;padding:28px 32px">
  <div style="font-size:22px;font-weight:700;color:#fff">\${shopName}</div>
  <div style="font-size:13px;color:rgba(255,255,255,.75);margin-top:4px">Confirmation de commande</div>
</td></tr>
<tr><td style="padding:28px 32px 0">
  <p style="margin:0;font-size:15px;color:#1e293b;font-weight:600">Bonjour \${p.client_nom},</p>
  <p style="margin:10px 0 0;font-size:14px;color:#64748b;line-height:1.6">Votre commande a bien été reçue.</p>
</td></tr>
<tr><td style="padding:20px 32px">
  <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:8px;padding:10px 18px;display:inline-block">
    <div style="font-size:11px;color:#3b82f6;font-weight:600;text-transform:uppercase;letter-spacing:.6px">Référence</div>
    <div style="font-size:18px;font-weight:700;color:#1e40af;font-family:'Courier New',monospace">\${p.order_ref}</div>
  </div>
</td></tr>
<tr><td style="padding:0 32px">
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1f5f9;border-radius:8px;overflow:hidden">
    <thead><tr style="background:#f8fafc">
      <th style="padding:9px 12px;font-size:11px;color:#94a3b8;text-align:left;text-transform:uppercase">Produit</th>
      <th style="padding:9px 12px;font-size:11px;color:#94a3b8;text-align:left;text-transform:uppercase">Détails</th>
      <th style="padding:9px 12px;font-size:11px;color:#94a3b8;text-align:right;text-transform:uppercase">Prix</th>
    </tr></thead>
    <tbody>\${rows}</tbody>
  </table>
</td></tr>
<tr><td style="padding:16px 32px">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:13px;color:#64748b;padding:4px 0">Total HT</td>
        <td style="font-size:13px;color:#334155;font-weight:600;text-align:right">\${fmt(p.total_ht)} DH</td></tr>
    <tr><td style="font-size:14px;color:#1e293b;font-weight:700;padding:8px 0 4px;border-top:2px solid #f1f5f9">Total TTC (TVA 20%)</td>
        <td style="font-size:14px;color:#2463EB;font-weight:700;text-align:right;border-top:2px solid #f1f5f9">\${fmt(p.total_ttc)} DH</td></tr>
  </table>
</td></tr>
<tr><td style="padding:8px 32px 28px">
  <p style="margin:0 0 14px;font-size:13px;color:#64748b">Suivez l'avancement de votre commande grâce à votre référence.</p>
  <a href="\${appUrl}/tracking.html?ref=\${encodeURIComponent(p.order_ref)}"
    style="display:inline-block;background:#2463EB;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 22px;border-radius:7px">
    Suivre ma commande →</a>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #f1f5f9">
  <p style="margin:0;font-size:12px;color:#94a3b8">\${shopName}\${p.shop?.tel ? ' · ' + p.shop.tel : ''}</p>
  <p style="margin:6px 0 0;font-size:11px;color:#cbd5e1">Email automatique — merci de ne pas y répondre.</p>
</td></tr>
</table></td></tr></table></body></html>\`;
}

serve(async (req) => {
if (req.method === 'OPTIONS')
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
try {
  const payload = await req.json();
  if (!payload.client_email || !payload.order_ref)
    return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const cfg       = await _getCfg(supabaseUrl, supabaseKey);
  const appUrl    = (cfg.app_url           || 'https://appkote.netlify.app').replace(/\/$/, '');
  const fromEmail = cfg.resend_from_email  || Deno.env.get('KOTE_FROM_EMAIL') || 'contact@kdigital.ma';
  const shopName  = cfg.name               || payload.shop?.name || 'Kote';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${RESEND_API_KEY}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: payload.client_email,
      subject: \`✅ Commande confirmée — \${payload.order_ref} · \${shopName}\`,
      html: buildHtml(payload, appUrl, shopName) }),
  });
  if (!res.ok) { const err = await res.text(); return new Response(JSON.stringify({ error: err }), { status: 500 }); }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
} catch (e) {
  return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
}
});`,
  },

  /* ── Add future edge functions below this line ────────
     Pattern:
     {
       slug:    'kote-my-function',        // Supabase function name
       name:    'My Function',             // Display name in admin
       desc:    'What it does.',           // One line description
       secrets: ['MY_SECRET_KEY'],         // Required Supabase secrets
       source:  `...TypeScript source...`, // Full TS source code
     },
  ──────────────────────────────────────────────────── */

];

/* ── Deploy UI ── */

function _bDesign() {
  if (!DB.contact) DB.contact = {};
  const c = DB.contact;
  const DEFAULT_TIERS = [
    { id:'basic',   label:'Basic',   desc:'Mise en page soignée — idéal pour supports simples'    },
    { id:'pro',     label:'Pro',     desc:'Design créatif + 2 corrections — supports complexes'   },
    { id:'premium', label:'Premium', desc:'Premium + déclinaisons + rush — projets stratégiques'  },
  ];
  const tiers = c.design_tiers || DEFAULT_TIERS;
  const bd    = c.brief_defaults || {};

  /* ── Card 1: Paramètres généraux ── */
  const paramsCard = _card('Paramètres',
    '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    `<div class="adm-row adm-row--no-border">
      <div>
        <div class="adm-row-label">Activer la section design</div>
        <div class="adm-row-sub">Affiche l'uploader + les niveaux de conception sur chaque produit</div>
      </div>
      <label class="tog${c.design_enabled !== false ? ' on' : ''}"
        onclick="this.classList.toggle('on');ADMIN.set('contact.design_enabled',this.classList.contains('on'))">
      </label>
    </div>
    <div class="adm-row adm-row--no-border">
      <div>
        <div class="adm-row-label">WhatsApp graphiste</div>
        <div class="adm-row-sub">Numéro qui recevra les briefs (format: 212XXXXXXXXX)</div>
      </div>
      <input class="adm-inp-lbl" style="width:160px"
        value="${(c.designer_whatsapp||'').replace(/"/g,'&quot;')}"
        placeholder="212600000000"
        oninput="ADMIN.set('contact.designer_whatsapp',this.value)">
    </div>`
  );

  /* ── Card 2: Niveaux de conception ── */
  const tierRows = tiers.map((t, i) => `
    <div class="adm-row adm-row--wrap">
      <input class="adm-inp-lbl" style="width:90px" value="${(t.label||'').replace(/"/g,'&quot;')}"
        placeholder="Nom" oninput="ADMIN.setDesignTier(${i},'label',this.value)">
      <input class="adm-inp-lbl" style="flex:1;min-width:160px" value="${(t.desc||'').replace(/"/g,'&quot;')}"
        placeholder="Description courte (visible client)" oninput="ADMIN.setDesignTier(${i},'desc',this.value)">
    </div>`).join('');
  const tiersCard = _card('Niveaux de conception',
    '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>',
    `<div class="adm-hint-txt">
      Niveaux visibles par le client — tarifs communiqués après réception du brief
    </div>` + tierRows
  );

  /* ── Card 3: Emails de réception ── */
  const emails = c.emails || [
    { id:'crea',    label:'Créa',    address:'crea@kdigital.ma'    },
    { id:'contact', label:'Contact', address:'contact@kdigital.ma' },
    { id:'sales',   label:'Sales',   address:'sales@kdigital.ma'   },
  ];
  const emailsCard = _card('Emails de réception (briefs)',
    '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    `<div class="adm-hint-txt">
      Les briefs clients sont envoyés à ces adresses
    </div>` +
    emails.map((em, i) =>
      `<div class="adm-row" style="${i===emails.length-1?'border-bottom:none':''}">
         <div>
           <div class="adm-row-label">${em.label}</div>
           <div class="adm-row-sub">${em.address}</div>
         </div>
         <input class="adm-inp-lbl" style="width:210px"
           value="${(em.address||'').replace(/"/g,'&quot;')}"
           placeholder="email@domaine.ma"
           oninput="ADMIN.setDesignEmail(${i}, this.value)">
       </div>`
    ).join('')
  );

  /* ── Card 4: Brief defaults ── */
  const briefCard = _card('Valeurs par défaut du brief',
    '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    `<div class="adm-row">
      <div><div class="adm-row-label">Nom de la marque / entreprise</div></div>
      <input class="adm-inp-lbl" style="width:180px" value="${(bd.brand_name||'').replace(/"/g,'&quot;')}"
        placeholder="Ex: Kote Studio" oninput="ADMIN.set('contact.brief_defaults.brand_name',this.value)">
    </div>
    <div class="adm-row">
      <div><div class="adm-row-label">Site web</div></div>
      <input class="adm-inp-lbl" style="width:180px" value="${(bd.website||'').replace(/"/g,'&quot;')}"
        placeholder="https://…" oninput="ADMIN.set('contact.brief_defaults.website',this.value)">
    </div>
    <div class="adm-row">
      <div><div class="adm-row-label">Couleurs de marque</div></div>
      <input class="adm-inp-lbl" style="width:220px" value="${(bd.brand_colors||'').replace(/"/g,'&quot;')}"
        placeholder="#1A2B3C, #FF6B00…" oninput="ADMIN.set('contact.brief_defaults.brand_colors',this.value)">
    </div>
    <div class="adm-row">
      <div>
        <div class="adm-row-label">Logo disponible</div>
        <div class="adm-row-sub">Le client a un logo vectoriel à fournir</div>
      </div>
      <label class="tog${bd.has_logo ? ' on' : ''}"
        onclick="this.classList.toggle('on');ADMIN.set('contact.brief_defaults.has_logo',this.classList.contains('on'))">
      </label>
    </div>
    <div class="adm-row">
      <div>
        <div class="adm-row-label">Charte graphique existante</div>
        <div class="adm-row-sub">Le client a une charte (couleurs, typos, guidelines)</div>
      </div>
      <label class="tog${bd.has_charte ? ' on' : ''}"
        onclick="this.classList.toggle('on');ADMIN.set('contact.brief_defaults.has_charte',this.classList.contains('on'))">
      </label>
    </div>
    <div class="adm-row adm-row--no-border">
      <div>
        <div class="adm-row-label">Référence de style</div>
        <div class="adm-row-sub">URL ou mots-clés d'inspiration par défaut</div>
      </div>
      <input class="adm-inp-lbl" style="width:220px" value="${(bd.style_ref||'').replace(/"/g,'&quot;')}"
        placeholder="Moderne, minimaliste, luxe…" oninput="ADMIN.set('contact.brief_defaults.style_ref',this.value)">
    </div>`
  );

  /* ── Card 5: Tarifs conception (logo + prestations) ── */
  const icoConc = '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>';
  const concProd = (DB.products||[]).find(p => p.product_type === 'conception');
  const conceptionCard = (() => {
    if (!concProd) return `
      <div class="adm-card">
        <div class="adm-card-hdr">
          <div class="adm-card-hdr-l">
            <div class="adm-card-hdr-ico">${(() => { const _svg = (d,sw=1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" style="width:12px;height:12px">${d}</svg>`; return _svg(icoConc); })()}</div>
            <div><div class="adm-card-title">Tarifs conception</div></div>
          </div>
        </div>
        <div class="adm-rows">
          <div class="adm-empty adm-empty--md">
            Aucun produit de type "conception" dans le catalogue.<br>
            <span class="adm-dim-txt">Créez un produit de type Conception dans Catalogue → Produits.</span>
          </div>
        </div>
      </div>`;
    const pi   = DB.products.indexOf(concProd);
    const rows = (concProd.conception_types||[]).map((ct,i) => {
      let priceInp = '';
      if      (ct.price!=null)          priceInp = _numInp(`products.${pi}.conception_types.${i}.price`,         ct.price,         'DH');
      else if (ct.price_base!=null)     priceInp = `<div style="display:flex;gap:.3rem">${_numInp(`products.${pi}.conception_types.${i}.price_base`,ct.price_base,'DH base')}${_numInp(`products.${pi}.conception_types.${i}.price_per_page`,ct.price_per_page,'DH/p.')}</div>`;
      else if (ct.price_per_face!=null) priceInp = _numInp(`products.${pi}.conception_types.${i}.price_per_face`, ct.price_per_face,'DH/face');
      return _row3(
        `<div>${_txtInp(`products.${pi}.conception_types.${i}.label`,ct.label)}<div class="adm-row-sub">${ct.id}</div></div>`,
        priceInp,
        _delBtn(`ADMIN.removeConcType(${pi},${i})`)
      );
    }).join('');
    return `
      ${_card('Prix logo', icoConc,
        _row('Prix logo', 'tarif de base personnalisable',
          _numInp(`products.${pi}.logo_price`, concProd.logo_price||1200, 'DH', '1'))
      )}
      ${_cardAct('Prestations de conception', icoConc,
        `<button class="adm-action-btn" onclick="ADMIN.addConcType(${pi})">${IC.plus} Ajouter</button>`,
        rows || `<div class="adm-empty adm-empty--sm">Aucune prestation</div>`,
        true)}`;
  })();

  return `
    ${_pageHdr('Conception', 'Uploader de design, niveaux, emails, brief et tarifs graphiques')}
    <div class="adm-grid adm-grid-1">
      ${paramsCard}
      ${tiersCard}
      ${emailsCard}
      ${briefCard}
    </div>
    <div class="adm-grid adm-grid-1 adm-grid--mt">
      ${conceptionCard}
    </div>`;
}



function setDesignEmail(i, value) {
  if (!DB.contact) DB.contact = {};
  if (!DB.contact.emails) DB.contact.emails = [
    { id:'crea',    label:'Créa',    address:'crea@kdigital.ma'    },
    { id:'contact', label:'Contact', address:'contact@kdigital.ma' },
    { id:'sales',   label:'Sales',   address:'sales@kdigital.ma'   },
  ];
  if (DB.contact.emails[i]) DB.contact.emails[i].address = value;
  _flash();
}

function setDesignTier(i, field, value) {
  if (!DB.contact) DB.contact = {};
  if (!DB.contact.design_tiers) {
    DB.contact.design_tiers = [
      { id:'basic',   label:'Basic',   desc:'Mise en page soignée — idéal pour supports simples'   },
      { id:'pro',     label:'Pro',     desc:'Design créatif + 2 corrections — supports complexes'  },
      { id:'premium', label:'Premium', desc:'Premium + déclinaisons + rush — projets stratégiques' },
    ];
  }
  if (!DB.contact.design_tiers[i]) return;
  DB.contact.design_tiers[i][field] = value;
  _flash();
}

/* Per-product design section tier config (stored in composition entry.config.tiers) */
function setDesignSectionTier(pi, ei, ti, field, value) {
  const p = _getComp(pi); if (!p) return;
  const entry = p.composition[ei]; if (!entry) return;
  if (!entry.config) entry.config = {};
  const model = entry.config.design_model || 'tier';
  const defaults = model === 'multipage'
    ? [
        { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price_base:400,  price_per_page:50  },
        { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price_base:700,  price_per_page:80  },
        { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price_base:1200, price_per_page:120 },
      ]
    : [
        { id:'basic',   label:'Basic',   desc:'Mise en page soignée',       price:200 },
        { id:'pro',     label:'Pro',     desc:'Design créatif + retouches', price:400 },
        { id:'premium', label:'Premium', desc:'Premium · déclinaisons',     price:800 },
      ];
  if (!entry.config.tiers) entry.config.tiers = JSON.parse(JSON.stringify(defaults));
  if (!entry.config.tiers[ti]) return;
  entry.config.tiers[ti][field] = value;
  _flash();
}

/* ── Auth tab — minimalist, details behind help toggles ── */
