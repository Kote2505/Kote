'use strict';

/* ============================================================
   orders-auth.js -- Magic Link + Google OAuth (AUTH)
   Extracted from kote-orders.js (S8 split).
   Exposes: AUTH
   Requires: kote-core.js
   Load order: after orders-invoice.js
   ============================================================ */




/* ════ auth.js ════ */
/* ════════════════════════════════════════════════════════
   AUTH — Magic Link + Google OAuth for client.html
   Reads OAuth credentials from DB.contact (set in admin panel)

   Public API:
     AUTH.init()              — call on page load
     AUTH.openSignIn(afterFn) — show sign-in modal
     AUTH.signOut()           — sign out
     AUTH.getUser()           — current user or null
     AUTH.getUserId()         — uid string or null
     AUTH.openMyOrders()      — open order history drawer
   ════════════════════════════════════════════════════════ */
const AUTH = (() => {

  let _user    = null;
  let _afterFn = null;
  let _guestEmail = null;

  /* ── Auth method config — reads from DB, falls back to all-enabled ── */
  function _authMethods() {
    if (typeof DB !== 'undefined' && DB?.auth_methods) return DB.auth_methods;
    return { magic_link: true, oauth_google: true, guest: true, email_no_confirm: false };
  }

  /* ── Helpers ── */
  const _url = () => window.SUPABASE_URL || '';
  const _key = () => window.SUPABASE_ANON_KEY || '';
  const _hdrs = tok => ({
    'apikey':        _key(),
    'Authorization': 'Bearer ' + (tok || _key()),
    'Content-Type':  'application/json',
  });
  const _ref = () => _url().replace('https://','').split('.')[0];
  const _storageKey = () => `sb-${_ref()}-auth-token`;

  /* ── Session ── */
  function _saveSession(data) {
    if (!data?.access_token) return;
    localStorage.setItem(_storageKey(), JSON.stringify({
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_at:    Math.floor(Date.now()/1000) + (data.expires_in||3600),
      user:          data.user,
    }));
  }

  function _clearSession() {
    localStorage.removeItem(_storageKey());
    _user = null;
  }

  async function _getSession() {
    const raw = localStorage.getItem(_storageKey());
    if (!raw) return null;
    try {
      const data = JSON.parse(raw);
      if (data.expires_at && Date.now()/1000 > data.expires_at - 60) {
        return await _refreshSession(data.refresh_token);
      }
      return data;
    } catch { return null; }
  }

  async function _refreshSession(rt) {
    if (!rt) return null;
    try {
      const r = await fetch(`${_url()}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST', headers: _hdrs(),
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!r.ok) { _clearSession(); return null; }
      const data = await r.json();
      _saveSession(data);
      return data;
    } catch { return null; }
  }

  /* ── Handle callback — works for BOTH magic link AND Google OAuth ── */
  async function _handleCallback() {
    const hash   = window.location.hash;
    const search = window.location.search;

    // ── Implicit flow: #access_token=... (magic link + Google if flow=implicit) ──
    if (hash && hash.includes('access_token')) {
      const params       = new URLSearchParams(hash.replace('#',''));
      const accessToken  = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn    = parseInt(params.get('expires_in') || '3600');
      if (!accessToken) return false;
      try {
        const r = await fetch(`${_url()}/auth/v1/user`, { headers: _hdrs(accessToken) });
        if (!r.ok) return false;
        const user = await r.json();
        _saveSession({ access_token:accessToken, refresh_token:refreshToken, expires_in:expiresIn, user });
        _user = user;
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log('[AUTH] implicit callback → signed in:', user.email);
        return true;
      } catch(e) { console.error('[AUTH] implicit callback error', e); return false; }
    }

    // ── PKCE flow: ?code=... (Supabase default) — exchange code for token ──
    if (search && search.includes('code=')) {
      const code     = new URLSearchParams(search).get('code');
      const verifier = sessionStorage.getItem('pkce_verifier');
      if (!code) return false;
      try {
        const body = { auth_code: code };
        if (verifier) body.code_verifier = verifier;
        const r = await fetch(`${_url()}/auth/v1/token?grant_type=pkce`, {
          method: 'POST', headers: _hdrs(),
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          console.warn('[AUTH] PKCE exchange failed', r.status, await r.text());
          // Clean URL anyway
          window.history.replaceState(null, '', window.location.pathname);
          return false;
        }
        const data = await r.json();
        _saveSession(data);
        _user = data.user;
        sessionStorage.removeItem('pkce_verifier');
        window.history.replaceState(null, '', window.location.pathname);
        console.log('[AUTH] PKCE callback → signed in:', data.user?.email);
        return true;
      } catch(e) { console.error('[AUTH] PKCE callback error', e); return false; }
    }

    return false;
  }

  /* ── Magic link ── */
  async function _sendMagicLink(email) {
    const redirectTo = window.location.origin + window.location.pathname;
    const r = await fetch(`${_url()}/auth/v1/otp`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, create_user: true, options: { emailRedirectTo: redirectTo } }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.msg || err.message || `HTTP ${r.status}`);
    }
  }

  /* ── Google OAuth ── */
  async function _signInWithGoogle() {
    const redirectTo = window.location.origin + window.location.pathname;
    // Use the Supabase authorize endpoint — it handles the Google redirect
    window.location.href =
      `${_url()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
  }

  /* ── Google configured? ── */
  function _googleEnabled() {
    // Google works if the Supabase project has it enabled — we always show it,
    // but it will fail gracefully if not configured
    return true;
  }

  /* ── Init ── */
  async function init() {
    const fromCallback = await _handleCallback();
    if (!fromCallback) {
      const session = await _getSession();
      if (session?.user) _user = session.user;
      else if (session?.access_token) {
        // Session exists but user missing — fetch it
        try {
          const r = await fetch(`${_url()}/auth/v1/user`, { headers: _hdrs(session.access_token) });
          if (r.ok) { _user = await r.json(); _saveSession({ ...session, user: _user }); }
        } catch(e) { console.warn('[AUTH] user fetch failed', e); }
      }
    }

    _updateHeader();
    console.log('[AUTH] init done. user:', _user?.email || 'guest');

    if (fromCallback && _user) {
      const pending = sessionStorage.getItem('auth_pending_action');
      if (pending === 'order') {
        sessionStorage.removeItem('auth_pending_action');
        closeModal();
        setTimeout(() => ORDERS?.openOrderForm?.(), 300);
      }
    }
  }

  /* ── Header button ── */
  function _updateHeader() {
    const btn = document.getElementById('authHeaderBtn');
    if (!btn) { console.warn('[AUTH] #authHeaderBtn not found'); return; }
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor  = 'pointer';
    btn.style.display = 'flex';

    if (_user) {
      const name   = _user.user_metadata?.full_name || _user.email?.split('@')[0] || 'Compte';
      const avatar = _user.user_metadata?.avatar_url;
      btn.title = name;
      btn.onclick = () => _toggleUserMenu();
      btn.innerHTML = avatar
        ? `<img src="${avatar}" alt="${name}" class="auth-avatar-img">`
        : `<div class="auth-avatar-init">${name[0].toUpperCase()}</div>`;
    } else {
      btn.title = 'Se connecter';
      btn.onclick = () => openSignIn();
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  }

  /* ── User menu ── */
  function _toggleUserMenu() {
    const ex = document.getElementById('authUserMenu');
    if (ex) { ex.remove(); return; }
    const menu = document.createElement('div');
    menu.id = 'authUserMenu';
    const name  = _user?.user_metadata?.full_name || _user?.email?.split('@')[0] || 'Compte';
    const email = _user?.email || '';
    const provider = _user?.app_metadata?.provider || 'email';
    const providerTag = provider === 'google'
      ? `<span class="auth-provider--google">Google</span>`
      : `<span class="auth-provider--magic">Magic Link</span>`;
    menu.innerHTML = `
      <div class="auth-menu-head">
        <div class="auth-menu-name">${name}</div>
        <div class="auth-menu-email">${email}</div>
        ${providerTag}
      </div>
      <div class="auth-menu-divider"></div>
      <button class="auth-menu-item" onclick="AUTH.openMyOrders()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        Mes commandes
      </button>
      <button class="auth-menu-item auth-menu-signout" onclick="AUTH.signOut()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Déconnexion
      </button>`;
    document.body.appendChild(menu);
    const btn  = document.getElementById('authHeaderBtn');
    const rect = btn.getBoundingClientRect();
    menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;right:${window.innerWidth-rect.right}px;z-index:900`;
    setTimeout(() => {
      const close = e => { if (!menu.contains(e.target)&&e.target!==btn){menu.remove();document.removeEventListener('click',close);} };
      document.addEventListener('click', close);
    }, 50);
  }

  /* ── Sign-in modal ── */
  function openSignIn(afterFn) {
    _afterFn = afterFn || null;
    document.getElementById('authModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'authModal';
    modal.innerHTML = `
      <div class="auth-modal-backdrop" onclick="AUTH.closeModal()"></div>
      <div class="auth-modal-box">
        <button class="auth-modal-close" onclick="AUTH.closeModal()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>

        <div class="auth-modal-logo">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 451.63 123.79" style="height:22px;width:auto">
            <path fill="#696969" d="M191,123.79a62.31,62.31,0,0,0,31.07-8A59.36,59.36,0,0,0,244.5,93.65a62,62,0,0,0,8.26-31.84A62,62,0,0,0,244.5,30a58.88,58.88,0,0,0-22.39-22,65.43,65.43,0,0,0-62.41,0,59.26,59.26,0,0,0-22.56,22,61.44,61.44,0,0,0-8.34,31.84,61.44,61.44,0,0,0,8.34,31.84,59.93,59.93,0,0,0,22.56,22.14A62.66,62.66,0,0,0,191,123.79Zm0-35.25q-11.41,0-17.54-7.23t-6.13-19.5q0-12.44,6.13-19.67T191,34.91q11.24,0,17.37,7.23t6.13,19.67q0,12.25-6.13,19.5T191,88.54ZM259.57,2V32h31.67V122.6H329V32h32V2ZM451.63,32.18V2H371.26V122.6h80.37V92.46H409.07v-17h37.45V47H409.07V32.18Z"/>
            <path fill="#2563EB" d="M103.06,41.51a18.57,18.57,0,0,0,18.57-18.57V1M103.06,122.6A18.57,18.57,0,0,0,121.63,104v-22M40.54,41.51H81.09v22.3A18.24,18.24,0,0,1,62.85,82.05H40.54V122.6H0V1H40.54ZM121.63,1H81.09V41.51h22M121.63,82.05H81.09V122.6h22"/>
          </svg>
        </div>

        <!-- STEP 1: input -->
        <div id="authStep1">
          ${(()=>{
            const _am = (typeof DB!=='undefined'&&DB?.auth_methods)||{magic_link:true,oauth_google:true,guest:true,email_no_confirm:false};
            const showGoogle  = _am.oauth_google !== false;
            const showEmail   = _am.magic_link || _am.email_no_confirm || _am.email_password;
            const showGuest   = _am.guest !== false;
            const noConfirm   = !_am.magic_link && _am.email_no_confirm;
            const btnLabel    = noConfirm ? 'Continuer' : 'Envoyer le lien';
            const sendIcon    = '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>';
            const arrowIcon   = '<polyline points="9 18 15 12 9 6"/>';
            const btnIcon     = noConfirm ? arrowIcon : sendIcon;
            return `
          <h2 class="auth-modal-title">Suivez votre commande</h2>
          <p class="auth-modal-sub">Connectez-vous pour accéder à l'historique et au suivi de vos commandes.</p>
          ${showGoogle ? `
          <button class="auth-google-btn" onclick="AUTH._googleClick()">
            <svg viewBox="0 0 24 24" width="17" height="17"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continuer avec Google
          </button>` : ''}
          ${showEmail ? `
          ${showGoogle ? '<div class="auth-divider"><span>ou par email</span></div>' : ''}
          ${_am.email_password ? `
          <div class="auth-btn-stack">
            <input class="auth-email-inp" id="authEmailInp" type="email"
              placeholder="votre@email.com" autocomplete="email"
              onkeydown="if(event.key==='Enter')document.getElementById('authPassInp')?.focus()">
            <input class="auth-email-inp" id="authPassInp" type="password"
              placeholder="Mot de passe (6 caractères min)" autocomplete="current-password"
              onkeydown="if(event.key==='Enter')AUTH._submitPassword()"
              style="letter-spacing:.05em">
            <button class="auth-email-btn" id="authEmailBtn" onclick="AUTH._submitPassword()"
              style="width:100%;justify-content:center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="9 18 15 12 9 6"/></svg>
              <span id="authBtnLbl">Se connecter</span>
            </button>
          </div>
          <div class="auth-divider-note">
            <span id="authModeHint">Première visite ?</span>
            <button id="authModeToggle" onclick="AUTH._togglePwdMode()"
              class="auth-link-btn">
              Créer un compte
            </button>
          </div>` : `
          <div class="auth-email-wrap">
            <input class="auth-email-inp" id="authEmailInp" type="email"
              placeholder="votre@email.com" autocomplete="email"
              onkeydown="if(event.key==='Enter')AUTH._submitEmail()">
            <button class="auth-email-btn" id="authEmailBtn" onclick="AUTH._submitEmail()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><${btnIcon}/></svg>
              ${btnLabel}
            </button>
          </div>`}
          <div class="auth-email-err" id="authEmailErr"></div>` : ''}
          ${showGuest ? `
          <div class="auth-divider"><span>ou</span></div>
          <button class="auth-guest-btn" onclick="AUTH._continueAsGuest()">
            Continuer sans compte
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <p class="auth-modal-note">Sans compte, notre équipe vous contactera par téléphone.</p>` : ''}
          ${!showGoogle && !showEmail && !showGuest ? '<p class="auth-modal-note auth-modal-note--center">Aucune méthode de connexion activée.<br>Contactez l\'administrateur.</p>' : ''}`;
          })()}
        </div>

        <!-- STEP 2: email sent -->
        <div id="authStep2" style="display:none">
          <div class="auth-sent-ico">
            <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="1.5" width="32" height="32"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <h2 class="auth-modal-title">Vérifiez votre email</h2>
          <p class="auth-modal-sub">Lien envoyé à <strong id="authSentEmail"></strong>. Cliquez dessus pour vous connecter instantanément.</p>
          <p class="auth-modal-note auth-modal-note--mt">Vérifiez aussi vos spams. Le lien expire dans 1 heure.</p>
          <button class="auth-guest-btn auth-guest-btn--full" onclick="AUTH._backToEmail()">← Changer d'adresse</button>
          <div class="auth-divider"><span>ou</span></div>
          <button class="auth-guest-btn" onclick="AUTH._continueAsGuest()">Continuer sans compte <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg></button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      modal.classList.add('on');
      setTimeout(() => document.getElementById('authEmailInp')?.focus(), 220);
    });
  }

  function _googleClick() {
    sessionStorage.setItem('auth_pending_action', 'order');
    _signInWithGoogle();
  }

  async function _submitEmail() {
    const inp   = document.getElementById('authEmailInp');
    const err   = document.getElementById('authEmailErr');
    const btn   = document.getElementById('authEmailBtn');
    const email = (inp?.value || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      if (err) { err.textContent = 'Adresse email invalide.'; err.style.display = 'block'; }
      inp?.focus(); return;
    }
    if (err) err.style.display = 'none';

    const am = _authMethods();

    // Password mode active — this button should not be reachable, but guard anyway
    if (am.email_password) return;

    // Magic link flow
    if (!am.magic_link) {
      // No email auth mode enabled — close and proceed as guest
      _guestEmail = email;
      closeModal();
      sessionStorage.removeItem('auth_pending_action');
      if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Envoi…'; }
    sessionStorage.setItem('auth_pending_action', 'order');
    try {
      await _sendMagicLink(email);
      document.getElementById('authStep1').style.display = 'none';
      document.getElementById('authStep2').style.display = 'block';
      const el = document.getElementById('authSentEmail');
      if (el) el.textContent = email;
    } catch(e) {
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
      if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le lien`; }
    }
  }

  function _backToEmail() {
    document.getElementById('authStep1').style.display = 'block';
    document.getElementById('authStep2').style.display = 'none';
    const btn = document.getElementById('authEmailBtn');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer le lien`; }
    setTimeout(() => document.getElementById('authEmailInp')?.focus(), 80);
  }

  function closeModal() {
    const m = document.getElementById('authModal');
    if (!m) return;
    m.classList.remove('on');
    setTimeout(() => m.remove(), 200);
  }

  function _continueAsGuest() {
    _guestEmail = null;   // clear any stored guest email when skipping
    closeModal();
    sessionStorage.removeItem('auth_pending_action');
    if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
  }

  /* ── My Orders drawer ── */
  async function openMyOrders() {
    document.getElementById('authUserMenu')?.remove();
    const ex = document.getElementById('myOrdersPanel');
    if (ex) { ex.remove(); return; }
    const panel = document.createElement('div');
    panel.id = 'myOrdersPanel';
    panel.innerHTML = `
      <div class="my-orders-backdrop" onclick="document.getElementById('myOrdersPanel').remove()"></div>
      <div class="my-orders-drawer">
        <div class="my-orders-hdr">
          <div class="my-orders-title">Mes commandes</div>
          <button class="auth-modal-close" onclick="document.getElementById('myOrdersPanel').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="my-orders-body" id="myOrdersBody">
          <div class="my-orders-loading">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="18" height="18" class="spin-loader"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            Chargement…
          </div>
        </div>
      </div>`;
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add('on'));
    await _loadMyOrders();
  }

  async function _loadMyOrders() {
    const body = document.getElementById('myOrdersBody');
    if (!body || !_user) return;
    const session = await _getSession();
    if (!session?.access_token) return;
    try {
      const r = await fetch(
        `${_url()}/rest/v1/kote_orders?user_id=eq.${_user.id}&select=*&order=created_at.desc`,
        { headers: _hdrs(session.access_token) }
      );
      if (!r.ok) throw new Error('HTTP '+r.status);
      const orders = await r.json();
      if (!orders.length) {
        body.innerHTML = `<div class="my-orders-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="32" height="32" class="ico-dim"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>Aucune commande pour le moment</p></div>`;
        return;
      }
      body.innerHTML = orders.map(_renderRow).join('');
    } catch(e) {
      body.innerHTML = `<div class="my-orders-empty my-orders-empty--err">Erreur — ${e.message}</div>`;
    }
  }

  const _SL = {nouveau:'Nouveau',en_cours:'En cours',en_impression:'Impression',finition:'Finition',pret:'Prêt',livre:'Livré',annule:'Annulé'};
  const _SC = {nouveau:'#f59e0b',en_cours:'#2563eb',en_impression:'#7c3aed',finition:'#0891b2',pret:'#16a34a',livre:'#059669',annule:'#dc2626'};
  const _f = n => (n||0).toLocaleString('fr-MA',{minimumFractionDigits:2,maximumFractionDigits:2});

  function _renderRow(o) {
    const st  = o.status||'nouveau', col=_SC[st]||'#9ca3af', lbl=_SL[st]||st;
    const d   = o.created_at ? new Date(o.created_at).toLocaleDateString('fr-MA',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    const ttc = o.total_ttc||Math.round((o.total_ht||0)*1.2*100)/100;
    const preview = (o.payload?.items||[]).slice(0,2).map(i=>i.prodName).join(', ') + ((o.payload?.items||[]).length>2?` +${(o.payload?.items||[]).length-2}`:'');
    return `<div class="my-order-row" onclick="window.open('tracking.html?ref=${encodeURIComponent(o.ref)}','_blank')">
      <div class="my-order-top">
        <span class="my-order-ref">${o.ref}</span>
        <span class="my-order-badge" style="color:${col};background:${col}18;border-color:${col}35"><span style="width:5px;height:5px;border-radius:50%;background:${col};display:inline-block;margin-right:4px;vertical-align:middle"></span>${lbl}</span>
      </div>
      <div class="my-order-desc">${preview||'—'}</div>
      <div class="my-order-foot"><span class="my-order-date">${d}</span><span class="my-order-total">${_f(ttc)} DH TTC</span></div>
    </div>`;
  }

  /* ── Sign out ── */
  function signOut() {
    document.getElementById('authUserMenu')?.remove();
    const s = JSON.parse(localStorage.getItem(_storageKey())||'{}');
    _clearSession(); _updateHeader();
    if (s.access_token) fetch(`${_url()}/auth/v1/logout`,{method:'POST',headers:_hdrs(s.access_token)}).catch(()=>{});
  }

  function getUser()   { return _user; }
  function getUserId() { return _user?.id || null; }

  /* ── Password auth ── */
  let _pwdModeState = 'signin';

  function _togglePwdMode() {
    _pwdModeState = _pwdModeState === 'signin' ? 'signup' : 'signin';
    const isSignup = _pwdModeState === 'signup';
    const hint    = document.getElementById('authModeHint');
    const toggle  = document.getElementById('authModeToggle');
    const btnLbl  = document.getElementById('authBtnLbl');
    const passInp = document.getElementById('authPassInp');
    if (hint)    hint.textContent    = isSignup ? 'Déjà un compte ?'   : 'Première visite ?';
    if (toggle)  toggle.textContent  = isSignup ? 'Se connecter'        : 'Créer un compte';
    if (btnLbl)  btnLbl.textContent  = isSignup ? 'Créer mon compte'    : 'Se connecter';
    if (passInp) passInp.autocomplete = isSignup ? 'new-password' : 'current-password';
    const err = document.getElementById('authEmailErr');
    if (err) err.style.display = 'none';
  }

  async function _signUpWithPassword(email, password) {
    const r = await fetch(`${_url()}/auth/v1/signup`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.msg || data.message || `HTTP ${r.status}`);
    if (data.access_token) { _saveSession(data); _user = data.user; }
    return data;
  }

  async function _signInWithPassword(email, password) {
    const r = await fetch(`${_url()}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: _hdrs(),
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.msg || data.message || `HTTP ${r.status}`);
    _saveSession(data); _user = data.user;
    return data;
  }

  async function _submitPassword() {
    const email   = (document.getElementById('authEmailInp')?.value || '').trim().toLowerCase();
    const pass    = (document.getElementById('authPassInp')?.value  || '');
    const err     = document.getElementById('authEmailErr');
    const btn     = document.getElementById('authEmailBtn');
    const lbl     = document.getElementById('authBtnLbl');
    if (!email || !email.includes('@')) {
      if (err) { err.textContent = 'Email invalide.'; err.style.display = 'block'; } return;
    }
    if (pass.length < 6) {
      if (err) { err.textContent = 'Mot de passe : 6 caractères minimum.'; err.style.display = 'block'; } return;
    }
    if (err) err.style.display = 'none';
    if (btn) btn.disabled = true;
    if (lbl) lbl.textContent = '…';
    try {
      if (_pwdModeState === 'signup') {
        await _signUpWithPassword(email, pass);
      } else {
        await _signInWithPassword(email, pass);
      }
      _pwdModeState = 'signin';
      closeModal(); _updateHeader();
      if (_afterFn) { const fn = _afterFn; _afterFn = null; fn(); }
    } catch(e) {
      if (err) { err.textContent = e.message; err.style.display = 'block'; }
      if (btn) btn.disabled = false;
      if (lbl) lbl.textContent = _pwdModeState === 'signup' ? 'Créer mon compte' : 'Se connecter';
    }
  }

  return {
    init, openSignIn, closeModal, signOut,
    openMyOrders, getUser, getUserId, getGuestEmail: () => _guestEmail,
    _submitEmail, _backToEmail, _continueAsGuest, _googleClick, _authMethods,
    _submitPassword, _togglePwdMode,
  };
})();
