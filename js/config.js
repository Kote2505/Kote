'use strict';

/* ════════════════════════════════════════════════════════
   DB_MOD  — database load / session persistence + source toggle
   ════════════════════════════════════════════════════════ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ROLE — controls feature visibility across the app
   'provider' → full app: admin, PDF, cost breakdown, DB toggle
   'client'   → product catalog + cart + order form only
   Set per entry point: provider.html keeps this default.
   client.html overrides with <script>const ROLE='client'</script>
   before loading shared modules.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* var allows safe re-declaration — client.html sets var ROLE='client' before this loads */
if (typeof ROLE === 'undefined') var ROLE = 'provider';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DB TOGGLE — change DEFAULT_SOURCE to switch boot mode
   'json'      → auto-fetch ./data.json on page load
   'supabase'  → connect to Supabase REST API on page load
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const DEFAULT_SOURCE = 'supabase'; /* ← CHANGE THIS LINE ONLY : supabase | json */

/* ── Supabase credentials — override via admin panel stored in localStorage ─── */
const _storedUrl  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_url');
const _storedKey  = typeof localStorage !== 'undefined' && localStorage.getItem('kote_supa_key');

const SUPABASE_URL      = _storedUrl  || 'https://qjqextlzbklcvhejqrsm.supabase.co';
const SUPABASE_ANON_KEY = _storedKey  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqcWV4dGx6YmtsY3ZoZWpxcnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTYwMDIsImV4cCI6MjA4ODY3MjAwMn0.z-VpvgT8U4whyKs6P71oKtMO64pie1xsgaBdyhZkRdA';
/* expose to invoice.js (loaded as separate <script>) */
window.SUPABASE_URL      = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
/* ─────────────────────────────────────────────────────── */
