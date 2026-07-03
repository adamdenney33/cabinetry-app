// ProCabinet — main app script (Phase 5 of pre-launch refactor)
// Extracted from index.html. Module split (Phase 6) breaks this into src/<feature>.js

// DB layer moved to src/db.js (Phase 6 partial split)
// UI primitives moved to src/ui.js (Phase 6 partial split)


function _requireAuth() {
  if (_userId) return true;
  // Demo (guest) visitor: don't throw up the full sign-in screen on every save
  // — give a non-blocking nudge and leave them where they are. They can still
  // sign in via the demo banner or account menu whenever they're ready.
  if (window._demoMode) { _demoNudge(); return false; }
  _showAuth();
  return false;
}

/** @type {string | null} */
let _userId = null;
/** User id whose data this page session has already boot-loaded. Dedupes the
 *  full loadAllData() across supabase-js's repeated session events — on every
 *  page load it emits INITIAL_SESSION and then SIGNED_IN for the same stored
 *  session, plus SIGNED_IN again on tab re-focus and TOKEN_REFRESHED hourly.
 *  Before this guard each of those re-ran the entire boot load (every query
 *  twice per page load, serialized — the dominant boot cost on slow
 *  connections) and wiped the _lines/_totals caches mid-use.
 *  @type {string | null} */
let _bootLoadedUserId = null;
// Default to sign-up: a logged-out visitor arriving from the landing site lands
// on "Create your account", with a one-click "Sign In" toggle for returning
// users. Keep in sync with the auth-screen markup defaults in index.html.
let _authMode = 'signup';

// Message pulled from an OAuth redirect that came back with an error instead of
// a session (set by _handleOAuthError at init; consumed once when the auth
// screen first shows). null when the last load wasn't a failed OAuth return.
/** @type {string | null} */
let _oauthError = null;

function _showApp() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.add('hidden');
}
function _showAuth() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.remove('hidden');
  // The auth screen is the boot destination here — no data load follows, so
  // drop the boot loader that has covered the shell since first paint.
  window._hideBootLoader();
}

function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSign = _authMode === 'signin';
  /** @type {HTMLElement} */ (document.getElementById('auth-heading')).textContent = isSign ? 'Sign in to your account' : 'Create your account';
  /** @type {HTMLElement} */ (document.getElementById('auth-btn')).textContent = isSign ? 'Sign In' : 'Create Account';
  /** @type {HTMLElement} */ (document.getElementById('auth-toggle')).innerHTML = isSign
    ? 'No account? <span onclick="toggleAuthMode()">Create one</span>'
    : 'Already have an account? <span onclick="toggleAuthMode()">Sign In</span>';
  /** @type {HTMLElement} */ (document.getElementById('auth-marketing-row')).style.display = isSign ? 'none' : 'flex';
  const reassureEl = document.getElementById('auth-reassure');
  if (reassureEl) reassureEl.style.display = isSign ? 'none' : '';
  const forgotEl = document.getElementById('auth-forgot');
  if (forgotEl) forgotEl.style.display = isSign ? '' : 'none';
  /** @type {HTMLElement} */ (document.getElementById('auth-msg')).innerHTML = '';
}

async function authSubmit() {
  const email = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-email'))?.value.trim() || '';
  const password = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-password'))?.value || '';
  const msgEl = document.getElementById('auth-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-btn'));
  if (msgEl) msgEl.innerHTML = '';
  if (!email || !password) { if (msgEl) msgEl.innerHTML = '<div class="auth-error">Email and password required.</div>'; return; }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  let error;
  // Supabase user id from a successful signUp() — passed to
  // _trackSignupConversion, which uses it as the Meta Pixel eventID AND posts
  // it to the meta-capi-signup edge function, so the browser event dedupes
  // against the server-side CAPI event (both use `signup-<user_id>`).
  /** @type {string | null} */
  let signupUserId = null;
  // Anti-enumeration quirk: signUp() against an EXISTING CONFIRMED email
  // "succeeds" but returns an obfuscated user with an empty identities array —
  // and sends NO email. Detected here so we don't show "check your inbox" to
  // someone whose inbox will stay empty. (Existing-but-unconfirmed emails get
  // a fresh confirmation email and a populated identities array.)
  let signupExistingAccount = false;
  try {
    if (_authMode === 'signin') {
      ({ error } = await _sb.auth.signInWithPassword({ email, password }));
    } else {
      const marketingOptIn = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-marketing'))?.checked === true;
      // First-touch attribution (utm_*/gclid/fbclid/referrer) captured by
      // src/main.js into localStorage on landing. Returns {} for organic
      // visits. We persist it into auth.users.user_metadata so every signup
      // carries permanent ad-campaign attribution, queryable later via
      // `select raw_user_meta_data->'attribution' from auth.users`.
      const attribution = (typeof window._getAttribution === 'function')
        ? window._getAttribution()
        : {};
      let signUpData;
      ({ data: signUpData, error } = await _sb.auth.signUp({
        email, password,
        options: {
          // App is served at /os in prod, but at / in local dev (window._isDev,
          // set by main.js). Point the email-confirm redirect at wherever the
          // app actually lives so dev signups don't bounce to a 404.
          emailRedirectTo: window.location.origin + (window._isDev ? '' : '/os'),
          // Persisted into auth.users.user_metadata; the list-subscribe edge
          // function reads marketing_opt_in after the user confirms their
          // email. Name fields were dropped from signup (F: friction) — the
          // account dropdown and greetings already tolerate accounts with no
          // first_name/last_name/full_name metadata.
          data: { marketing_opt_in: marketingOptIn, attribution },
        },
      }));
      signupUserId = signUpData?.user?.id ?? null;
      signupExistingAccount = Array.isArray(signUpData?.user?.identities)
        && signUpData.user.identities.length === 0;
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
    if (msgEl) msgEl.innerHTML = '<div class="auth-error">Unable to connect. Please run the app via the dev server (npm run dev).</div>';
    return;
  }
  if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
  if (error) {
    // "Email not confirmed" on sign-in strands the user behind a dead-end
    // error (their original link may have expired). Route them to the
    // confirmation panel instead — it has a working resend button.
    const errCode = /** @type {{ code?: string }} */ (error).code || '';
    if (_authMode === 'signin' && (errCode === 'email_not_confirmed' || /not confirmed/i.test(error.message || ''))) {
      if (typeof _track === 'function') _track('signin_unconfirmed_email');
      _showConfirmPanel(email, 'signup', false);
      return;
    }
    if (msgEl) msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`;
    return;
  }
  if (_authMode === 'signin') {
    if (typeof _track === 'function') _track('user_logged_in');
    return; // onAuthStateChange (SIGNED_IN) takes over from here
  }
  // Repeated signup of a confirmed account (see signupExistingAccount above):
  // no email was sent — flip to sign-in instead of pointing at an empty inbox.
  if (signupExistingAccount) {
    if (typeof _track === 'function') _track('signup_existing_account');
    toggleAuthMode(); // → sign-in mode; the email field keeps its value
    if (msgEl) msgEl.innerHTML = '<div class="auth-error">An account with this email already exists — sign in below, or use “Forgot password?”.</div>';
    return;
  }
  if (typeof _track === 'function') _track('user_signed_up');
  // Fire ad-platform conversion pixels for paid-ads attribution. No-ops when
  // pixels are disabled (no env vars set in main.js). _trackSignupConversion
  // is defined in src/analytics.js. Deliberately after the repeated-signup
  // guard — re-signups aren't conversions, and the obfuscated user id would
  // poison the Meta CAPI dedup key.
  if (typeof _trackSignupConversion === 'function') _trackSignupConversion(signupUserId);
  // The confirm link's tokens land on /os and the Supabase client exchanges
  // them automatically — clicking the link signs the user straight in, so
  // the panel says so instead of telling them to come back and sign in.
  _showConfirmPanel(email, 'signup', true);
}

// ── "Check your inbox" confirmation panel ──────────────────────────────────
// Replaces the old one-line green "check your email" text (routinely missed)
// with a full panel that swaps in for the auth form. Serves three flows:
// post-signup confirmation, password-reset sent, and unconfirmed-sign-in
// recovery — anywhere the next step is "go click a link in your inbox".

/** Email the panel is currently showing / resending to. */
let _confirmPanelEmail = '';
/** What a resend should send. */
let _confirmPanelMode = /** @type {'signup' | 'recovery'} */ ('signup');
/** @type {ReturnType<typeof setInterval> | null} */
let _resendTimer = null;

/**
 * Swap the auth form for the confirmation panel.
 * @param {string} email
 * @param {'signup' | 'recovery'} mode what the Resend button sends
 * @param {boolean} justSent true when an email was just sent (starts the
 *   resend cooldown); false when arriving without a send (unconfirmed
 *   sign-in) so the send button is immediately live.
 */
function _showConfirmPanel(email, mode, justSent) {
  _confirmPanelEmail = email;
  _confirmPanelMode = mode;
  /** @param {string} id @param {string} text */
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('auth-confirm-title', justSent ? (mode === 'recovery' ? 'Check your inbox' : 'You’re nearly there!') : 'Confirm your email');
  set('auth-confirm-lead', justSent
    ? (mode === 'recovery' ? 'We’ve sent a password reset link to' : 'We’ve sent a confirmation link to')
    : 'Your email isn’t confirmed yet. We can send a fresh link to');
  set('auth-confirm-email', email);
  set('auth-confirm-sub', mode === 'recovery'
    ? 'Click the link in the email to choose a new password.'
    : 'Click the link in the email to activate your account — it signs you in automatically.');
  const msg = document.getElementById('auth-confirm-msg');
  if (msg) msg.innerHTML = '';
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (btn) btn.textContent = justSent ? 'Resend email' : 'Send email';
  const fw = document.getElementById('auth-form-wrap');
  if (fw) fw.style.display = 'none';
  const panel = document.getElementById('auth-confirm-panel');
  if (panel) panel.style.display = '';
  if (justSent) _startResendCooldown(60); else _clearResendCooldown();
}

function _backToAuthForm() {
  _clearResendCooldown();
  const panel = document.getElementById('auth-confirm-panel');
  if (panel) panel.style.display = 'none';
  const fw = document.getElementById('auth-form-wrap');
  if (fw) fw.style.display = '';
  const msgEl = document.getElementById('auth-msg');
  if (msgEl) msgEl.innerHTML = '';
}

/**
 * Disable the resend button for `secs` seconds. Supabase's smtp_max_frequency
 * rejects same-address sends inside 60s anyway — surface that as a countdown
 * instead of a server error.
 * @param {number} secs
 */
function _startResendCooldown(secs) {
  _clearResendCooldown();
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (!btn) return;
  const base = btn.textContent || 'Resend email';
  let left = secs;
  btn.disabled = true;
  btn.textContent = `${base} (${left}s)`;
  _resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { _clearResendCooldown(); btn.textContent = base; return; }
    btn.textContent = `${base} (${left}s)`;
  }, 1000);
}

function _clearResendCooldown() {
  if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (btn) btn.disabled = false;
}

/** Resend whatever the panel is waiting on (confirmation or reset link). */
async function resendConfirmEmail() {
  const msg = document.getElementById('auth-confirm-msg');
  const redirectTo = window.location.origin + (window._isDev ? '' : '/os');
  let error = null;
  try {
    if (_confirmPanelMode === 'recovery') {
      ({ error } = await _sb.auth.resetPasswordForEmail(_confirmPanelEmail, { redirectTo }));
    } else {
      ({ error } = await _sb.auth.resend({ type: 'signup', email: _confirmPanelEmail, options: { emailRedirectTo: redirectTo } }));
    }
  } catch (e) { error = /** @type {any} */ (e); }
  if (error) {
    const rate = /rate|second|frequency/i.test(error.message || '');
    if (msg) msg.innerHTML = `<div class="auth-error">${rate ? 'Too many requests — wait a minute, then try again.' : (error.message || 'Could not send the email.')}</div>`;
    return;
  }
  if (typeof _track === 'function') _track(_confirmPanelMode === 'recovery' ? 'password_reset_resent' : 'confirmation_email_resent');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (btn) btn.textContent = 'Resend email';
  if (msg) msg.innerHTML = '<div class="auth-success">Sent! Give it a minute — and check spam.</div>';
  _startResendCooldown(60);
}

/**
 * "Forgot password?" (sign-in mode). Sends the reset email and shows the
 * confirmation panel. Supabase deliberately succeeds for unknown emails
 * (anti-enumeration), so the panel shows either way.
 */
async function forgotPassword() {
  const email = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-email'))?.value.trim() || '';
  const msgEl = document.getElementById('auth-msg');
  if (!email) { if (msgEl) msgEl.innerHTML = '<div class="auth-error">Type your email address above first.</div>'; return; }
  if (msgEl) msgEl.innerHTML = '';
  let error = null;
  try {
    ({ error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + (window._isDev ? '' : '/os') }));
  } catch (e) { error = /** @type {any} */ (e); }
  if (error) { if (msgEl) msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`; return; }
  if (typeof _track === 'function') _track('password_reset_requested');
  _showConfirmPanel(email, 'recovery', true);
}

/**
 * Opened by onAuthStateChange on PASSWORD_RECOVERY — the reset link has
 * already signed the user in; this collects the new password on top of the
 * loading app.
 */
function _openSetNewPasswordPopup() {
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Set a new password</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">New password</label>
        <input class="pf-input" type="password" id="np-pass" autocomplete="new-password" placeholder="At least 6 characters">
      </div>
      <div class="pf">
        <label class="pf-label">Repeat it</label>
        <input class="pf-input" type="password" id="np-pass2" autocomplete="new-password">
      </div>
      <div id="np-msg"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewPassword()">Save password</button>
    </div>`, 'sm');
}

async function _saveNewPassword() {
  const p1 = _popupVal('np-pass'), p2 = _popupVal('np-pass2');
  const msg = document.getElementById('np-msg');
  /** @param {string} t */
  const fail = (t) => { if (msg) msg.innerHTML = `<div class="auth-error">${t}</div>`; };
  if (!p1 || p1.length < 6) { fail('Password must be at least 6 characters.'); return; }
  if (p1 !== p2) { fail('Passwords don’t match.'); return; }
  const { error } = await _sb.auth.updateUser({ password: p1 });
  if (error) { fail(error.message); return; }
  if (typeof _track === 'function') _track('password_reset_completed');
  _closePopup();
  _toast('Password updated — you’re signed in.', 'success');
}

// One-click Google sign-in / sign-up. signInWithOAuth navigates the whole page
// to Google's consent screen, so on success nothing after it runs — Google
// redirects back to redirectTo, the SDK's detectSessionInUrl exchanges the code
// for a session, and onAuthStateChange (SIGNED_IN) drives the rest exactly like
// a password login. An `error` only comes back synchronously if the redirect
// itself can't be started (provider not configured, offline).
//
// Note: OAuth signups can't carry the marketing_opt_in / attribution metadata
// the email flow attaches at signUp() time — those come from Google's profile
// instead. The marketing opt-in is recovered post-auth by
// _maybePromptMarketingOptIn (src/auth.js), which asks Google users once in-app.
// Paid-ads attribution just won't be stamped on Google-originated accounts.
async function signInWithGoogle() {
  const msgEl = document.getElementById('auth-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-google-btn'));
  if (msgEl) msgEl.innerHTML = '';
  if (btn) btn.disabled = true;
  if (typeof _track === 'function') _track('google_signin_clicked');
  let error;
  try {
    ({ error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Mirror the email-confirm redirect: app is served at /os in prod, / in
        // local dev (window._isDev, set by main.js).
        redirectTo: window.location.origin + (window._isDev ? '' : '/os'),
      },
    }));
  } catch (e) {
    error = /** @type {{ message?: string }} */ (e);
  }
  // Reached only when the redirect failed to start (otherwise the page is gone).
  if (btn) btn.disabled = false;
  if (error && msgEl) {
    msgEl.innerHTML = `<div class="auth-error">${error.message || 'Could not start Google sign-in.'}</div>`;
  }
}

async function signOut() {
  // onAuthStateChange's SIGNED_OUT handler re-enters demo mode, re-seeds the
  // in-memory arrays and re-renders every panel — so no manual teardown here.
  toggleAccount();
  if (typeof _resetAnalytics === 'function') _resetAnalytics();
  _unsubscribeLiveStatus();
  await _sb.auth.signOut();
}

async function loadAllData() {
  // F.1: kick off subscription load in parallel — updates global `_subscription`
  // via side effect; we don't need its return value in the destructure below.
  const subPromise = loadSubscription().catch(() => null);
  // Hydrate QuickBooks/Xero connections + order→invoice links in parallel so the
  // order cards can show "Synced" chips. No-ops (stays empty) when not signed in.
  const acctPromise = typeof loadAccountingConnections === 'function'
    ? loadAccountingConnections().catch(() => null)
    : Promise.resolve();
  // Quote/order overhaul: hydrate line-item photos (Phase 2) + Stripe Connect
  // status (Phase 4) in the background. Both no-op until their flag/schema is on.
  if (typeof loadLinePhotos === 'function') loadLinePhotos().catch(() => null);
  if (typeof loadConnectStatus === 'function') loadConnectStatus().catch(() => null);
  if (typeof loadAllClientMessages === 'function') loadAllClientMessages().catch(() => null);
  // Each query below may already be in flight: src/main.js starts them as the
  // module bundle executes (window._earlyBoot) and _earlyBootOr (src/db.js)
  // consumes that result, falling back to the _db() query on any miss/error.
  const [{ data: ord }, { data: quo }, { data: stk }, { data: cli }, { data: biz }] = await Promise.all([
    _earlyBootOr('orders', _userId, () => _db('orders').select('*').order('created_at', { ascending: false })),
    _earlyBootOr('quotes', _userId, () => _db('quotes').select('*').order('created_at', { ascending: false })),
    _earlyBootOr('stock_items', _userId, () => _db('stock_items').select('*').order('created_at', { ascending: true })),
    _earlyBootOr('clients', _userId, () => _db('clients').select('*').order('name', { ascending: true })).catch(() => ({ data: [], error: null })),
    // Phase 3: business_info overlays pc_biz / pc_biz_logo / pc_cb_settings rates
    _earlyBootOr('business_info', _userId, () => _db('business_info').select('*').eq('user_id', _userId)).catch(() => ({ data: [], error: null })),
  ]);
  await subPromise;
  await acctPromise;
  orders = ord || [];
  _onRestore(orders);  // merge locally-stored notes (notes col may not be in DB schema yet)
  _restoreProdStarts(orders);  // merge locally-stored production start dates
  quotes = quo || [];
  // H0.2: hydrate shadow fields (thickness/width/length) from DB columns
  // (thickness_mm/width_mm/length_m). Cut-list and edge-band UI consumers
  // read the short names; load-time map closes the desync after reload.
  stockItems = (stk || []).map(/** @param {any} s */ s => {
    const out = /** @type {any} */ ({ ...s });
    if (s.thickness_mm != null) out.thickness = s.thickness_mm;
    if (s.width_mm != null)     out.width = s.width_mm;
    if (s.length_m != null)     out.length = s.length_m;
    return out;
  });
  clients = cli || [];
  // F6 (2026-05-13): projects table dropped — variable kept declared for
  // back-compat with any legacy reads that linger as null-state markers.
  projects = [];
  // Phase 3.3 — overlay business_info from DB (only if a row exists). Runs
  // BEFORE _demoOverlayInit (it hydrates _onboardingState, the overlay's
  // persisted gate) and before the lines/totals hydrates below (which must
  // see demo ids in the arrays when the overlay is on).
  _applyBizInfoFromDB(/** @type {any[]} */ (biz || []));
  // Sample-data overlay (src/demo.js): keep the demo seed visible for
  // accounts that haven't removed it yet — merges demo rows into the four
  // boot arrays (the early-boot fetches bypass _db(), so the builder-level
  // merge can't cover this path).
  if (typeof _demoOverlayInit === 'function') _demoOverlayInit();
  // Demo overlay rows carry negative ids — floor at 0 so local id counters
  // stay positive even when the account's own libraries are empty.
  if (orders.length) orderNextId = Math.max(0, ...orders.map(o => o.id)) + 1;
  if (quotes.length) quoteNextId = Math.max(0, ...quotes.map(q => q.id)) + 1;
  if (stockItems.length) stockNextId = Math.max(0, ...stockItems.map(s => s.id)) + 1;
  // Phase 7 step 1: hydrate quote totals from quote_lines (fire and forget; renders re-run when ready).
  _hydrateQuoteTotals().then(() => {
    try { renderQuoteMain(); } catch(e){}
  }).catch(e => console.warn('[quote totals] hydrate failed:', e.message || e));
  // Pre-cache order_lines too so order popups open without a network wait.
  // Re-render the dashboard once order_lines land — the Schedule mini-calendar
  // sizes bars by `orderHoursRequired`, which reads `o._lines`. Without this,
  // the first render places every multi-day auto-scheduled order as a single-
  // day block on today.
  _hydrateOrderLines().then(() => {
    try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e){}
  }).catch(e => console.warn('[order lines] hydrate failed:', e.message || e));
  // F6 (2026-05-13): hydrate client→cutlists map for Client card flat sections.
  if (typeof _loadCutListsByClient === 'function') {
    _loadCutListsByClient().catch(/** @param {any} e */ e => console.warn('[cutlists by client] load:', e.message || e));
  }
  // catalog_items deprecated — stock_items is now the single source of truth
  // for material/hardware/finish prices (client-side catalog code removed).
  // Phase 3.3 _applyBizInfoFromDB moved up — it must precede _demoOverlayInit.
  // S.2 — load schedule day overrides for the production scheduler (fire and forget)
  loadDayOverrides().catch(/** @param {any} e */ e => console.warn('[day_overrides] load:', e.message || e));
  /** @type {HTMLElement} */ (document.getElementById('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  // Guarded: a dropped domain script (main.js boot self-heal reloads once to
  // recover) must not abort the rest of boot before the realtime subscribe below.
  try { renderStockMain(); } catch (_e) {}
  try { renderQuoteMain(); } catch (_e) {}
  try { renderOrdersMain(); } catch (_e) {}
  // Realtime: reflect customer live-link activity (viewed / accepted / paid, and
  // webhook-created orders) on the cards without a manual reload.
  _subscribeLiveStatus();
  // Dashboard renders once at script-load before data arrives, so refresh it now
  // that orders/quotes/stockItems are populated. Safe to call even when another
  // panel is active — innerHTML update is invisible until the user navigates back.
  try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e) {}
  // Strategy 2: re-render project contexts now that projects[] is populated.
  // Initial top-level calls fire before loadAllData resolves, so this catches up.
  if (typeof _clRenderContext === 'function') _clRenderContext();
  if (typeof _cbRenderContext === 'function') _cbRenderContext();
  // Item 2 phase 1.3: pull Cabinet Builder lines from the project's draft quote.
  // No-op without auth, without a saved project name, or when the DB draft is empty.
  _loadCBLinesFromDB().catch(e => console.warn('[cb db-load]', e.message || e));
}

// ── Realtime live-link status sync ──────────────────────────────────────────
// The live-link edge functions (running with the service role) update the
// user's own quotes/orders rows when a customer views, accepts, or pays — and
// the pay webhook inserts a new order. With no subscription the cards only catch
// up on a full reload, so a quote the customer just accepted still reads
// "Draft". Subscribe to postgres_changes scoped to this user (RLS already limits
// delivery to their own rows) and re-render the affected lists in place.

/** Merge a realtime row change into a local array, preserving locally-attached
 *  fields (`_lines`, restored notes/prod-starts) by mutating in place rather
 *  than replacing the object. @param {any[]} arr @param {any} payload */
function _applyRealtimeRow(arr, payload) {
  const evt = payload.eventType || payload.event;
  if (evt === 'DELETE') {
    const oid = payload.old && payload.old.id;
    const di = arr.findIndex(x => x.id === oid);
    if (di >= 0) arr.splice(di, 1);
    return;
  }
  const row = payload.new;
  if (!row || row.id == null) return;
  const idx = arr.findIndex(x => x.id === row.id);
  if (idx >= 0) Object.assign(arr[idx], row);   // keep _lines/notes already on the object
  else arr.unshift({ ...row });
}

/** Subscribe once to quotes/orders changes for the signed-in user. Re-renders
 *  both card lists on any change (order chips derive from the linked quote, so a
 *  quote change can move an order chip and vice-versa). */
function _subscribeLiveStatus() {
  if (!_userId || window._rtChannel) return;
  const rerender = () => {
    try { renderQuoteMain(); } catch (e) {}
    try { renderOrdersMain(); } catch (e) {}
    // The Schedule calendar is also derived from orders (priority/dates feed the
    // auto-scheduler) but, unlike the card lists, it isn't refreshed in place —
    // so a priority change persisted to the DB only reached the calendar on a
    // manual reload. Re-render it when it's the visible tab so it self-heals.
    try {
      if (typeof renderSchedule === 'function' &&
          document.getElementById('panel-schedule')?.classList.contains('active')) {
        renderSchedule();
      }
    } catch (e) {}
    try { _oBadge(); } catch (e) {}
  };
  try {
    window._rtChannel = _sb.channel('rt-cards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `user_id=eq.${_userId}` },
          /** @param {any} p */ p => { _applyRealtimeRow(quotes, p); rerender(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${_userId}` },
          /** @param {any} p */ p => { _applyRealtimeRow(orders, p); rerender(); })
      // Email-bridge: a new chat message (live-page or emailed reply) lands in
      // the thread cache + lights the unread badge without a manual reload.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'customer_messages', filter: `user_id=eq.${_userId}` },
          /** @param {any} p */ p => { if (typeof _applyRealtimeMessage === 'function') _applyRealtimeMessage(p); })
      .subscribe();
  } catch (e) { console.warn('[realtime] subscribe failed:', /** @type {any} */ (e)?.message || e); }
}

/** Tear down the realtime channel (on sign-out, before the user_id changes). */
function _unsubscribeLiveStatus() {
  if (!window._rtChannel) return;
  try { _sb.removeChannel(window._rtChannel); } catch (e) {}
  window._rtChannel = null;
}

// Phase 3.3: overlay business_info row onto pc_biz fields and form inputs.
// If DB has no row, existing localStorage-loaded values remain.
/** @param {any[]} rows */
function _applyBizInfoFromDB(rows) {
  if (!rows || rows.length === 0) {
    // No business_info row (brand-new account): reset the walkthrough gate so
    // a previous account's state can't leak across a same-tab account switch.
    /** @type {any} */ (window)._onboardingState = {};
    return;
  }
  const b = rows[0];
  // O.2: stash the guided-walkthrough state for walkthrough.js's auto-start
  // gate. Absent/non-object => {} (treated as a never-onboarded user).
  /** @type {any} */ (window)._onboardingState =
    (b && b.onboarding_state && typeof b.onboarding_state === 'object') ? b.onboarding_state : {};
  // Update form inputs (these mirror what saveBizInfo / loadBizInfo manage)
  /** @param {string} id @param {any} v */
  const set = (id, v) => { const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id)); if (el && v != null) el.value = v; };
  set('biz-name', b.name);
  set('biz-phone', b.phone);
  set('biz-email', b.email);
  set('biz-address', b.address);
  set('biz-abn', b.abn);
  set('biz-bank-details', b.bank_details);
  // Logo: if DB has a public URL, use it; otherwise fall through to localStorage
  // base64 — and self-heal the DB from that localStorage logo so the customer
  // live link (which reads business_info.logo_url server-side) shows it too.
  if (b.logo_url) {
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById('biz-logo-preview'));
    const btn = document.getElementById('biz-logo-remove');
    if (img) { img.src = b.logo_url; img.style.display = ''; }
    if (btn) btn.style.display = '';
    // Reverse self-heal: cache the logo into localStorage so the PDF/print header
    // (getBizLogo(), localStorage-only) shows it on a device that synced from DB.
    if (!localStorage.getItem('pc_biz_logo') && typeof _hydrateLogoToLS === 'function') {
      _hydrateLogoToLS(b.logo_url);
    }
  } else if (localStorage.getItem('pc_biz_logo') && typeof _healLogoToDB === 'function') {
    _healLogoToDB();
  }
  // Unit format from DB overrides localStorage
  if (b.unit_format) {
    try {
      var uf = typeof b.unit_format === 'string' ? JSON.parse(b.unit_format) : b.unit_format;
      if (uf) {
        Object.assign(window.unitFormat, uf);
        // The synced unit_format.mode is also the source of truth for the
        // imperial/metric SYSTEM. Keep window.units in agreement so a second
        // device (where localStorage pcUnits is stale or absent) doesn't render
        // the wrong system. fromDB:true skips the mm<->inch data conversion —
        // stored values are already in the maker's true unit.
        var _sys = ['decimal', 'fractional', 'feetInches'].includes(uf.mode) ? 'imperial'
                 : ['mm', 'cm', 'm'].includes(uf.mode) ? 'metric' : '';
        if (_sys && _sys !== window.units && typeof setUnits === 'function') {
          setUnits(_sys, { fromDB: true });
        }
        _syncUnitFormatUI();
      }
    } catch(e) {}
  }
  // Currency: window.currency (the in-app pick, from localStorage, shown on the
  // PDF/print) is the user's authoritative choice. business_info.default_currency
  // — which the public live link reads — was only ever written at the one-time
  // migration (frozen, often a stale '£'), so the DEVICE wins: heal the DB from
  // window.currency when they disagree, NEVER the reverse. (Overwriting
  // window.currency from the stale DB would wrongly flip a correct '$' PDF to
  // '£'.) Unlike unit_format, default_currency has no live sync to trust — this
  // makes the live link follow the in-app selection / PDF.
  if (window.currency && b.default_currency !== window.currency) {
    try { if (typeof _syncCurrencyToDB === 'function') _syncCurrencyToDB(window.currency); } catch(e) {}
  }
  // Persist back to localStorage so other reads pick it up (legacy compatibility)
  try {
    localStorage.setItem('pc_biz', JSON.stringify({
      name: b.name || '', phone: b.phone || '', email: b.email || '',
      address: b.address || '', abn: b.abn || '',
      bank_details: b.bank_details || ''
    }));
  } catch(e) {}
  // Phase 3: business_info is the source of truth for all cbSettings scalars
  // and labour/list defaults. Hard overlay — DB always wins. Hardcoded defaults
  // in cabinet.js still apply for new users with no business_info row.
  // Race guard (mirrors _loadCBLinesFromDB): _applyBizInfoFromDB re-runs on
  // every auth event including hourly TOKEN_REFRESHED. If a sync is pending,
  // the user has unsaved cbSettings edits — leave them alone.
  if (typeof cbSettings !== 'undefined' && (typeof _cbSettingsSyncTimer === 'undefined' || !_cbSettingsSyncTimer)) {
    if (b.default_labour_rate != null) cbSettings.labourRate = parseFloat(b.default_labour_rate);
    if (b.default_markup_pct  != null) cbSettings.markup     = parseFloat(b.default_markup_pct);
    if (b.default_tax_pct     != null) cbSettings.tax        = parseFloat(b.default_tax_pct);
    if (b.default_deposit_pct  != null) cbSettings.deposit    = parseFloat(b.default_deposit_pct);
    if (b.default_edging_per_m != null) cbSettings.edgingPerM = parseFloat(b.default_edging_per_m);
    if (b.default_labour_times && typeof b.default_labour_times === 'object' && Object.keys(b.default_labour_times).length > 0) {
      // Merge: DB values override defaults for known keys; new defaults fill in
      // for keys not yet present in the DB row (e.g. carcass power-law fields
      // added 2026-05-05). Wholesale replace would wipe forward-compat defaults.
      cbSettings.labourTimes = { ...cbSettings.labourTimes, ...b.default_labour_times };
    }
    if (Array.isArray(b.default_base_types)         && b.default_base_types.length         > 0) {
      // Migrate legacy base types (flat price → labour hours). Old rows hold
      // {name, price}; base now contributes labour (hours × rate), so drop the
      // price and default refHours to 0 rather than double-counting it.
      cbSettings.baseTypes = b.default_base_types.map(/** @param {any} bt */ bt => ({ name: bt.name, refHours: bt.refHours != null ? bt.refHours : 0 }));
    }
    if (Array.isArray(b.default_constructions)      && b.default_constructions.length      > 0) cbSettings.constructions     = b.default_constructions;
    if (Array.isArray(b.default_edge_banding)       && b.default_edge_banding.length       > 0) cbSettings.edgeBanding       = b.default_edge_banding;
    if (Array.isArray(b.default_carcass_types)      && b.default_carcass_types.length      > 0) cbSettings.carcassTypes      = b.default_carcass_types;
    if (Array.isArray(b.default_door_types)         && b.default_door_types.length         > 0) cbSettings.doorTypes         = b.default_door_types;
    if (Array.isArray(b.default_drawer_front_types) && b.default_drawer_front_types.length > 0) cbSettings.drawerFrontTypes  = b.default_drawer_front_types;
    if (Array.isArray(b.default_drawer_box_types)   && b.default_drawer_box_types.length   > 0) cbSettings.drawerBoxTypes    = b.default_drawer_box_types;
    // Production scheduler defaults (S.2):
    if (b.default_workday_hours     != null) cbSettings.workdayHours     = parseFloat(b.default_workday_hours);
    if (b.default_packaging_hours   != null) cbSettings.packagingHours   = parseFloat(b.default_packaging_hours);
    if (b.default_installation_hours!= null) cbSettings.installationHours= parseFloat(b.default_installation_hours);
    if (b.default_contingency_pct   != null) cbSettings.contingencyPct   = parseFloat(b.default_contingency_pct);
    if (Array.isArray(b.default_weekday_hours) && b.default_weekday_hours.length === 7) {
      cbSettings.weekdayHours = b.default_weekday_hours.map(/** @param {any} h */ h => parseFloat(h) || 0);
    }
    if (b.production_queue_start_date) cbSettings.queueStartDate = b.production_queue_start_date;
    // Phase 3 cleanup: DB is authoritative; drop the legacy LS key so it
    // can't shadow on a future session.
    localStorage.removeItem('pc_cq_settings');
  }
}

_sb.auth.onAuthStateChange(async (event, session) => {
  // Keep the raw-fetch DB layer's bearer token current on every auth event,
  // synchronously and before any await — _db()'s _dbHeaders() reads this
  // in-memory token (see src/db.js). Must run on TOKEN_REFRESHED too so a
  // rotated token is picked up immediately, and on storage-blocked browsers
  // where it's the only place the token is available.
  _setAccessToken(session?.access_token ?? null);
  // loadAllData()'s hydrate helpers reference globals from late-loading defer
  // scripts (e.g. _quoteLineRowToCB in migrate.js). A guest's INITIAL_SESSION
  // can fire mid defer-script execution — wait until every defer script has run
  // (DOMContentLoaded, or `load` if we're already past it).
  if (document.readyState !== 'complete') {
    await new Promise(res => {
      const done = () => res(undefined);
      document.addEventListener('DOMContentLoaded', done, { once: true });
      window.addEventListener('load', done, { once: true });
    });
  }
  // Password-recovery landing: the reset link signs the user in (session
  // present, so the app loads below as normal), but they still need to choose
  // a new password — collect it on top of the loading app.
  if (event === 'PASSWORD_RECOVERY') _openSetNewPasswordPopup();
  if (session) {
    // Repeat event for the already-loaded user (SIGNED_IN after
    // INITIAL_SESSION on the same page load, tab-focus SIGNED_IN, hourly
    // TOKEN_REFRESHED): the bearer token was updated above, realtime keeps
    // quotes/orders in sync — there is nothing else to redo. Bail before the
    // full boot load duplicates every query.
    if (session.user.id === _bootLoadedUserId) return;
    _bootLoadedUserId = session.user.id;
    // A real Supabase session — leave demo mode. Guard on _wtActive so a
    // TOKEN_REFRESHED firing while a signed-in user runs the walkthrough
    // (which flips demo mode on temporarily) doesn't clobber the tour.
    if (!window._wtActive) window._demoMode = false;
    _userId = session.user.id;
    // Server-set signup timestamp — drives the 14-day no-card Pro trial in
    // src/limits.js (_trialActive). Set before loadAllData() so the first
    // subscription render is trial-aware. Tamper-proof (auth.users.created_at).
    _userCreatedAt = session.user.created_at ?? null;
    window.Sentry.setUser({ id: session.user.id, email: session.user.email });
    const emailEl = document.getElementById('account-email-item');
    if (emailEl) emailEl.textContent = session.user.email ?? '';
    // Name collected at signup (user_metadata.full_name / first_name+last_name).
    // Older accounts created before the name field won't have it — hide the row.
    const meta = session.user.user_metadata || {};
    const displayName = (meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(' ')).trim();
    const nameEl = document.getElementById('account-name-item');
    if (nameEl) { nameEl.textContent = displayName; nameEl.style.display = displayName ? '' : 'none'; }
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = 'none';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = '';
    _showApp();
    // finally (not just after the await): the boot loader is an opaque
    // overlay, so it must come down even when the load throws.
    try { await loadAllData(); } finally { window._hideBootLoader(); }
    if (typeof _identifyUser === 'function') _identifyUser(session);
    if (typeof _syncMailingList === 'function') {
      _syncMailingList(session).catch(e => console.warn('[mailing-list] sync failed', e));
    }
    // One-time founder welcome email for new signups (all of them — it's a
    // transactional service email, no marketing-opt-in gate). Both auth
    // paths reach here: email signups on the first post-confirmation load,
    // OAuth signups immediately. Idempotency lives server-side.
    if (typeof _sendWelcomeEmailOnce === 'function') {
      _sendWelcomeEmailOnce(session).catch(e => console.warn('[welcome-email] send failed', e));
    }
    await _loadCabinetTemplatesFromDB();
    // F.1 — landing-page pricing deep-link: consume the stashed tier and head
    // straight to Stripe Checkout. The localStorage backing means this also
    // fires on the first signed-in load AFTER the signup → email-confirm round
    // trip, where the original page (and its in-memory stash) is long gone.
    const _pendingPlanNow = _readPendingPlan(true);
    if (_pendingPlanNow) {
      const _up = /** @type {any} */ (window)._handleUpgradeClick;
      if (typeof _up === 'function') _up(_pendingPlanNow);
    }
    // O.2: guided walkthrough — first-run auto-start / version-gated re-show.
    // Runs after data has hydrated so the empty-app check is accurate. Skipped
    // when a pending plan is redirecting to Checkout — the tour would flash and
    // vanish mid-render; it auto-shows on the return load instead.
    if (!_pendingPlanNow && typeof /** @type {any} */ (window)._wtMaybeAutoStart === 'function') {
      try { await /** @type {any} */ (window)._wtMaybeAutoStart(); }
      catch (e) { console.warn('[walkthrough] auto-start failed', e); }
    }
    // F6 (2026-05-13): _clLoadProjectList removed alongside the projects entity.
    // Restore the active section and any open editor entity from the previous
    // session. Runs after data hydrates so entity-lookup .find() guards have
    // something to match against; missed lookups silently clear their key.
    if (typeof /** @type {any} */ (window)._restoreAppState === 'function') {
      try { await /** @type {any} */ (window)._restoreAppState(); }
      catch (e) { console.warn('restoreAppState failed', e); }
    }
    // Marketing opt-in for OAuth (Google) signups: the email form's opt-in
    // checkbox never ran for them, so ask once in-app. Never on top of the
    // first-run walkthrough (_wtActive) or a Checkout redirect — in those cases
    // it shows on a later load, where marketing_opt_in is still unset.
    if (!_pendingPlanNow && !window._wtActive && typeof _maybePromptMarketingOptIn === 'function') {
      _maybePromptMarketingOptIn(session);
    }
  } else {
    // No Supabase session — an account is required. Show the auth screen (a
    // full-screen overlay) instead of loading any app data. No more guest demo
    // mode: the demo seed (src/demo.js) now exists only for the in-app guided
    // walkthrough, which a signed-in user borrows via _wtRunStart(tempDemo).
    _userId = null;
    _bootLoadedUserId = null;
    _userCreatedAt = null;
    _setAccessToken(null);
    _unsubscribeLiveStatus();
    window._demoMode = false;
    window.Sentry.setUser(null);
    _subscription = null;
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = '';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = 'none';
    _showAuth();
    // A failed OAuth return (provider misconfigured, redirect mismatch, user
    // cancelled) bounces back here with no session — show why instead of a
    // silent auth screen. Consumed once; cleared so a re-render stays clean.
    if (_oauthError) {
      const m = document.getElementById('auth-msg');
      if (m) m.innerHTML = `<div class="auth-error">${_oauthError}</div>`;
      _oauthError = null;
    }
    // The screen opens in sign-up mode by default (see _authMode init) — a
    // landing-site visitor lands on "Create your account", not a sign-in form.
    // Clear "what was open" keys on explicit sign-out so the next user's session
    // doesn't restore the previous one's entity IDs. INITIAL_SESSION (a plain
    // logged-out page load) must NOT clear them.
    if (event === 'SIGNED_OUT'
        && typeof /** @type {any} */ (window)._pcClearAllOpenKeys === 'function') {
      /** @type {any} */ (window)._pcClearAllOpenKeys();
    }
  }
  // F.1: pending-plan consumption moved INTO the session branch above. With no
  // session there's nothing to do — the auth screen is already up, and the
  // localStorage stash deliberately survives until the user authenticates.
});

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
/** @param {string} hex @param {number} a */
function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
/** @param {string} s @param {number} n */
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n-1) + '…'; }

/**
 * Pull an OAuth error off the return URL (and strip it so a refresh is clean).
 *
 * When Google/Supabase rejects a sign-in, it redirects back to redirectTo with
 * `error` + `error_description` and NO session — PKCE puts them in the query
 * string, the implicit flow in the hash; we read both. Returns a user-facing
 * string (or null), stashed in `_oauthError` for the auth screen to show.
 * @returns {string | null}
 */
function _handleOAuthError() {
  const q = new URLSearchParams(window.location.search);
  const h = window.location.hash.startsWith('#')
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();
  const err = q.get('error') || h.get('error');
  if (!err) return null;
  const desc = q.get('error_description') || h.get('error_description') || '';
  // Strip the OAuth error params from the query so a refresh doesn't re-show it.
  // (The token-carrying hash, if any, is left to the SDK's detectSessionInUrl.)
  ['error', 'error_description', 'error_code'].forEach(k => q.delete(k));
  const s = q.toString();
  history.replaceState(null, '', window.location.pathname + (s ? '?' + s : '') + window.location.hash);
  // access_denied = the user backed out of Google's consent screen — not alarming.
  return err === 'access_denied'
    ? 'Google sign-in was cancelled.'
    : (desc || 'Google sign-in failed. Please check the provider setup and try again.');
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
// Capture any OAuth-return error before onAuthStateChange's no-session branch
// renders the auth screen, so it can explain the failure instead of going blank.
_oauthError = _handleOAuthError();
// Show a toast on Stripe Checkout return (?upgrade=success / cancelled),
// then strip the query param so a refresh doesn't re-toast.
if (typeof handleCheckoutReturn === 'function') handleCheckoutReturn();
if (typeof handlePortalReturn === 'function') handlePortalReturn();
// Toast + refresh on return from the QuickBooks/Xero OAuth consent screen
// (?accounting=connected / error), then strip the param.
if (typeof handleAccountingReturn === 'function') handleAccountingReturn();
if (typeof handleConnectReturn === 'function') handleConnectReturn();
// Landing-page pricing deep-link: the static landing page links its pricing
// CTAs to /?plan=<tier>. Stash the tier and strip the param (mirrors
// handleCheckoutReturn); the onAuthStateChange handler above consumes it once
// the session is known. Runs before that handler clears its readyState await.
//
// F.1: the stash is localStorage-backed (48 h TTL), not just `window`, because
// a NEW user's path to checkout crosses page loads: click paid CTA → sign up →
// confirm email (fresh load, often a different tab) → first signed-in session.
// The in-memory stash alone died at that boundary and the paid click was lost.
const _PENDING_PLAN_KEY = 'pc_pending_plan';
const _PENDING_PLAN_TTL_MS = 48 * 3600000;

/** @param {'monthly'|'annual'|'founder'} plan */
function _storePendingPlan(plan) {
  window._pendingPlan = plan;
  try {
    localStorage.setItem(_PENDING_PLAN_KEY, JSON.stringify({ plan, at: Date.now() }));
  } catch (e) { void e; /* private mode — in-memory stash still covers same-load flows */ }
}

/**
 * Read the stashed plan — memory first, then localStorage — discarding stale
 * or malformed entries. Pass `consume: true` only once a session exists (the
 * user can actually reach Checkout); otherwise the stash survives the signup
 * → email-confirm round trip it exists for.
 * @param {boolean} consume
 * @returns {'monthly'|'annual'|'founder'|null}
 */
function _readPendingPlan(consume) {
  /** @type {'monthly'|'annual'|'founder'|null} */
  let plan = window._pendingPlan || null;
  if (!plan) {
    try {
      const raw = localStorage.getItem(_PENDING_PLAN_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && (obj.plan === 'monthly' || obj.plan === 'annual' || obj.plan === 'founder')
            && typeof obj.at === 'number' && Date.now() - obj.at < _PENDING_PLAN_TTL_MS) {
          plan = obj.plan;
        } else {
          localStorage.removeItem(_PENDING_PLAN_KEY); // stale or garbage — drop it
        }
      }
    } catch (e) { void e; }
  }
  if (plan && consume) {
    window._pendingPlan = null;
    try { localStorage.removeItem(_PENDING_PLAN_KEY); } catch (e) { void e; }
  }
  return plan;
}

(function () {
  const _params = new URLSearchParams(window.location.search);
  const _plan = _params.get('plan');
  if (_plan === 'monthly' || _plan === 'annual' || _plan === 'founder') {
    _storePendingPlan(_plan);
    _params.delete('plan');
    const _cleaned = _params.toString();
    window.history.replaceState({}, '',
      window.location.pathname + (_cleaned ? `?${_cleaned}` : '') + window.location.hash);
  }
})();
// Guarded: these fire at script-eval time, so a single dropped domain file must
// not abort the rest of app.js top-level (main.js self-heals via one reload).
try { loadBizInfo(); } catch (_e) {}
try { loadLogoPreview(); } catch (_e) {}
// (kerf restore removed — kerf is per-sheet in the cut list now; the global
// '#kerf' input no longer exists.)
try { renderStockMain(); } catch (_e) {}
try { renderQuoteMain(); } catch (_e) {}
try { renderOrdersMain(); } catch (_e) {}

// Cut list — restore saved state, or load demo data on first visit
_loadCutList();
if (pieces.length === 0 && sheets.length === 0) {
  const _m = window.units === 'metric';
  addSheet(_m ? '18mm Plywood' : '3/4" Plywood', _m ? 2440 : 96, _m ? 1220 : 48, 5);
  for (const d of (_m ? [
    { label: 'Side Panel',   w: 590, h: 762, qty: 2 },
    { label: 'Top / Bottom', w: 572, h: 590, qty: 2 },
    { label: 'Shelf',        w: 572, h: 559, qty: 3 },
    { label: 'Back Panel',   w: 590, h: 762, qty: 1 },
    { label: 'Door',         w: 292, h: 749, qty: 2 },
  ] : [
    { label: 'Side Panel',   w: 23.25, h: 30,    qty: 2 },
    { label: 'Top / Bottom', w: 22.5,  h: 23.25, qty: 2 },
    { label: 'Shelf',        w: 22.5,  h: 22,    qty: 3 },
    { label: 'Back Panel',   w: 23.25, h: 30,    qty: 1 },
    { label: 'Door',         w: 11.5,  h: 29.5,  qty: 2 },
  ])) { addPiece(d.label, d.w, d.h, d.qty, 'none'); }
} else {
  renderSheets();
  renderPieces();
}
initColVisibility();
if (typeof _syncCutMethodToggle === 'function') _syncCutMethodToggle();
// Strategy 2 + Idea 3: render the project context (empty state or header)
// for Cut List on init. Cabinet Builder is rendered through renderCBPanel.
if (typeof _clRenderContext === 'function') _clRenderContext();
if (typeof _cbRenderContext === 'function') _cbRenderContext();

// ── Pipeline hover preview ──
/** @param {HTMLElement} stepEl */
function pipePreview(stepEl) {
  const container = stepEl.closest('.oc-pipeline');
  if (!container) return;
  const hoverIdx = parseInt(/** @type {HTMLElement} */(stepEl).dataset.idx || '0');
  container.querySelectorAll('.pipe-step').forEach((/** @type {any} */ step, i) => {
    const dot = /** @type {HTMLElement|null} */(step.querySelector('.pipe-dot'));
    if (!dot) return;
    const c = i < hoverIdx ? 'var(--success)' : i === hoverIdx ? step.dataset.hoverColor : 'var(--border)';
    dot.style.background = c;
    dot.style.borderColor = c;
  });
  container.querySelectorAll('.pipe-line').forEach((/** @type {any} */ line, i) => {
    line.style.background = i < hoverIdx ? 'var(--success)' : 'var(--border)';
  });
}

/** @param {HTMLElement} stepEl */
function pipeRestorePreview(stepEl) {
  const container = stepEl.closest('.oc-pipeline');
  if (!container) return;
  container.querySelectorAll('.pipe-step').forEach((/** @type {any} */ step) => {
    const dot = /** @type {HTMLElement|null} */(step.querySelector('.pipe-dot'));
    if (dot) { dot.style.background = dot.dataset.origColor || ''; dot.style.borderColor = dot.dataset.origColor || ''; }
  });
  container.querySelectorAll('.pipe-line').forEach((/** @type {any} */ line) => {
    line.style.background = line.classList.contains('pipe-line-done') ? 'var(--success)' : 'var(--border)';
  });
}

// ── Strategy C: global beforeunload guard ──
// Block tab close while any sidebar / editor is dirty or has a save in flight.
// Surfaces register intent via these globals (already present pre-Strategy-C):
//   _cbDirty (cabinet.js), _clDirty (cutlist.js),
//   _qpState.dirty (quotes.js), _opState.dirty (orders.js)
// Plus the in-flight set populated by debounced autosaves in business.js etc.
window.addEventListener('beforeunload', (e) => {
  /** @type {any} */
  const w = window;
  const dirty =
    !!w._cbDirty ||
    !!w._clDirty ||
    !!(w._qpState && w._qpState.dirty) ||
    !!(w._opState && w._opState.dirty) ||
    !!(w._saveInFlight && w._saveInFlight.size > 0);
  if (dirty) {
    e.preventDefault();
    // Modern browsers ignore the message string but still show their own prompt
    // when preventDefault() is called and returnValue is set.
    e.returnValue = '';
    return '';
  }
});

