// ProCabinet — Auth: screen + session flows, helpers, keyboard shortcuts
// (phase E carve 6; the auth screen/session cluster moved back here from
// app.js's regrowth).
//
// Owns the auth SCREEN and session flows: _showApp/_showAuth, mode toggle,
// authSubmit, the confirmation panel (resend / back), forgot/set-password,
// signInWithGoogle/signOut, plus _authMode/_oauthError state and the
// OAuth-return error capture (_handleOAuthError, evaluated at script load).
// app.js keeps _userId/_bootLoadedUserId and the onAuthStateChange boot
// orchestration — its callback awaits DOMContentLoaded, so everything here
// (loaded AFTER app.js) is defined before any of it is called.
//
// Two top-level `document.addEventListener` calls attach global keyboard
// handlers at script-load time; handlers resolve globals at fire time.
//
// Cross-file dependencies referenced from this file: switchSection
// (settings.js), _sb (main.js bridge), _toast/_openPopup/_closePopup/
// _popupVal (ui.js), _userId/loadAllData (app.js), toggleAccount
// (business.js), _resetAnalytics (analytics.js), _unsubscribeLiveStatus
// (livelink.js), _track (analytics.js).

// ══════════════════════════════════════════
// AUTH HELPERS
// ══════════════════════════════════════════
function dismissAuth() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.add('hidden');
}

/**
 * Add a freshly-confirmed, opted-in user to the marketing mailing list.
 *
 * Called fire-and-forget from onAuthStateChange. The actual list write runs
 * server-side in the `list-subscribe` edge function (which holds the Resend
 * API key) — this only decides whether to invoke it:
 *   - the user ticked the opt-in box at signup (user_metadata.marketing_opt_in)
 *   - their email is confirmed (no Supabase session exists before that anyway)
 *   - they haven't already been synced on this device
 * A localStorage flag suppresses repeat calls; the edge function is also
 * idempotent, so a redundant call (e.g. a second device) is harmless.
 *
 * @param {import('@supabase/supabase-js').Session} session
 */
async function _syncMailingList(session) {
  const user = session?.user;
  if (!user || window._demoMode) return;
  const meta = user.user_metadata || {};
  if (meta.marketing_opt_in !== true) return;
  if (!user.email_confirmed_at) return;
  const flagKey = `pc_mailing_synced_${user.id}`;
  if (localStorage.getItem(flagKey)) return;
  // Pass the session's access token explicitly. _sb.functions.invoke() otherwise
  // takes its bearer from the SDK's persisted session, which is empty on
  // storage-blocked browsers (iOS / in-app webviews) — there the call goes out
  // as anon and the verify_jwt gateway 401s, silently dropping the subscribe.
  const { error } = await _sb.functions.invoke('list-subscribe', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  localStorage.setItem(flagKey, '1');
}

// Accounts created before this instant never get the welcome email. Must
// match WELCOME_CUTOFF in supabase/functions/send-welcome-email/index.ts —
// the server is authoritative; this copy only saves a pointless network
// call on every old-user login.
const _WELCOME_EMAIL_CUTOFF = Date.parse('2026-06-12T00:00:00Z');

/**
 * Send the one-time onboarding welcome email to a freshly signed-up user.
 *
 * Called fire-and-forget from onAuthStateChange, right beside
 * _syncMailingList. The actual send runs server-side in the
 * `send-welcome-email` edge function (which holds the Resend key and the
 * durable per-account already-sent flag in app_metadata) — this only decides
 * whether to invoke it:
 *   - real session, not demo mode
 *   - email confirmed (email signups can't hold a session before that;
 *     OAuth emails arrive provider-confirmed)
 *   - account created after the feature shipped (cheap old-user skip)
 *   - not already handled on this device
 * Unlike the mailing list there is NO marketing-opt-in gate: this is a
 * transactional service email and goes to every new account.
 *
 * @param {import('@supabase/supabase-js').Session} session
 */
async function _sendWelcomeEmailOnce(session) {
  const user = session?.user;
  if (!user || window._demoMode) return;
  if (!user.email_confirmed_at) return;
  if (!user.created_at || Date.parse(user.created_at) < _WELCOME_EMAIL_CUTOFF) return;
  const flagKey = `pc_welcome_sent_${user.id}`;
  if (localStorage.getItem(flagKey)) return;
  // Pass the session's access token explicitly. _sb.functions.invoke() otherwise
  // takes its bearer from the SDK's persisted session, which is empty on
  // storage-blocked browsers (iOS / in-app webviews) — there the call goes out
  // as anon and the verify_jwt gateway 401s, silently dropping the send.
  const { error } = await _sb.functions.invoke('send-welcome-email', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  // Every non-error outcome ({ok:true}, 'already sent', 'pre-launch user')
  // is terminal for this device — the unconfirmed-email skip can't happen
  // past the guard above. The flag just suppresses repeat invokes; the
  // server stays authoritative either way.
  localStorage.setItem(flagKey, '1');
}

/**
 * One-time marketing opt-in prompt for accounts that never recorded a choice.
 *
 * The email signup form has a "send me cabinetry tips" checkbox that writes
 * user_metadata.marketing_opt_in at signUp() time. OAuth (Google) signups skip
 * that form entirely, so those accounts land with the flag ABSENT — without
 * this they'd never get the chance to opt in. We show the same opt-in once,
 * in-app, after onboarding. Opt-in only — default stays off (no implied
 * consent), and we only ever ADD to the list here; opting out later is the
 * unsubscribe link in every email (Resend-managed).
 *
 * Gated to show at most once per account per device, regardless of the answer.
 * Skips accounts that already carry a boolean preference (every email signup),
 * so only OAuth signups and any legacy pre-checkbox accounts are ever asked.
 *
 * @param {import('@supabase/supabase-js').Session} session
 */
function _maybePromptMarketingOptIn(session) {
  const user = session?.user;
  if (!user || window._demoMode) return;
  const meta = user.user_metadata || {};
  // Email signups always carry a boolean here — only ask when it's genuinely
  // absent (OAuth signup, or a legacy account predating the checkbox).
  if (typeof meta.marketing_opt_in === 'boolean') return;
  const askedKey = `pc_mkt_asked_${user.id}`;
  if (localStorage.getItem(askedKey)) return;

  const id = '_mktoptin_' + Date.now();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:popupFadeIn .15s ease;transform:translateZ(0)';
  overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:22px 24px;box-shadow:0 16px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.04);max-width:380px;width:calc(100vw - 32px);color:var(--text);animation:popupSlideIn .2s ease">
    <div style="font-size:15px;font-weight:800;margin-bottom:8px">Stay in the loop?</div>
    <div style="font-size:13px;line-height:1.5;color:var(--text2);margin-bottom:18px">Get occasional cabinetry tips and product news by email. No spam — unsubscribe anytime.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="${id}_no" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;font-family:inherit">No thanks</button>
      <button id="${id}_yes" style="padding:8px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit">Yes, send tips</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // Mark "asked" the moment it's shown so it never reappears, whatever happens
  // next (explicit choice, backdrop-dismiss, or tab close = stays opted out).
  localStorage.setItem(askedKey, '1');
  const close = () => overlay.remove();
  /** @param {boolean} optIn */
  const record = async (optIn) => {
    close();
    try {
      await _sb.auth.updateUser({ data: { marketing_opt_in: optIn } });
      if (optIn) {
        // updateUser leaves the access token valid; re-read the session so
        // _syncMailingList sees the now-true flag and a fresh user object.
        const { data } = await _sb.auth.getSession();
        if (data?.session) await _syncMailingList(data.session);
        if (typeof _toast === 'function') _toast('You’re on the list — thanks!', 'success');
      }
    } catch (e) {
      console.warn('[mailing-list] opt-in update failed', e);
    }
  };
  /** @type {HTMLElement} */ (document.getElementById(id + '_no')).onclick = () => record(false);
  /** @type {HTMLElement} */ (document.getElementById(id + '_yes')).onclick = () => record(true);
  // Backdrop click dismisses without subscribing (default stays opted out).
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Ctrl/Cmd + number: switch tabs
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    /** @type {Record<string, string>} */
    const tabMap = {'1':'dashboard','2':'cutlist','3':'stock','4':'cabinet','5':'quote','6':'orders','7':'clients','8':'schedule'};
    if (tabMap[e.key]) { e.preventDefault(); switchSection(tabMap[e.key]); return; }
  }
  // ? key shows keyboard shortcuts (when not typing in an input)
  const ae = /** @type {HTMLElement | null} */ (document.activeElement);
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(ae?.tagName ?? '') || ae?.contentEditable?.toString()?.includes('true');
  if (e.key === '?' && !typing) {
    _showShortcutsHelp();
  }
  // N key: new item for current tab (when not typing)
  if (e.key === 'n' && !typing && !e.ctrlKey && !e.metaKey) {
    const active = document.querySelector('.section-panel.active')?.id;
    if (active === 'panel-quote') { document.getElementById('qe-client-picker')?.focus(); e.preventDefault(); }
    else if (active === 'panel-orders') { document.getElementById('oe-client-picker')?.focus(); e.preventDefault(); }
    else if (active === 'panel-stock') { document.getElementById('stock-name')?.focus(); e.preventDefault(); }
    else if (active === 'panel-clients') { document.getElementById('cl-name')?.focus(); e.preventDefault(); }
  }
  // / key: focus search (when not typing)
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
    const search = /** @type {HTMLElement | null} */ (document.querySelector('.section-panel.active .lib-filter-input, .section-panel.active input[type="search"], .section-panel.active input[placeholder*="Search"]'));
    if (search) { search.focus(); e.preventDefault(); }
  }
});
function _showShortcutsHelp() {
  const existing = document.getElementById('shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const m = document.createElement('div');
  m.id = 'shortcuts-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px)';
  m.onclick = e => { if (e.target === m) m.remove(); };
  const shortcuts = [
    ['Ctrl/Cmd + 1–9', 'Switch tabs'],
    ['N', 'New item (focus sidebar form)'],
    ['/', 'Focus search'],
    ['Escape', 'Close dialogs / overlays'],
    ['?', 'Toggle this help']
  ];
  m.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:15px;font-weight:800;color:var(--text)">Keyboard Shortcuts</div>
      <button onclick="this.closest('#shortcuts-modal').remove()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:0 4px">×</button>
    </div>
    ${shortcuts.map(([key,desc]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:12px;color:var(--text2)">${desc}</span>
      <kbd style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);font-family:inherit">${key}</kbd>
    </div>`).join('')}
  </div>`;
  document.body.appendChild(m);
}
// Escape key closes overlays
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const auth = document.getElementById('auth-screen');
  if (auth && !auth.classList.contains('hidden')) { dismissAuth(); return; }
  const acct = document.getElementById('account-dropdown');
  if (acct && acct.classList.contains('open')) { acct.classList.remove('open'); return; }
  // Close any open confirm dialogs
  const confirms = document.querySelectorAll('[id^="_confirm_"]');
  if (confirms.length) { confirms.forEach(c => c.remove()); return; }
});


// ══════════════════════════════════════════
// AUTH SCREEN + SESSION FLOWS (moved here from src/app.js — its regrown
// auth cluster; app.js keeps only _userId/_bootLoadedUserId and the
// onAuthStateChange boot orchestration)
// ══════════════════════════════════════════
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
// Capture the OAuth-return error at script evaluation (this file loads before
// DOMContentLoaded; onAuthStateChange's no-session branch — which consumes
// _oauthError — awaits DOMContentLoaded, so this always runs first).
_oauthError = _handleOAuthError();
