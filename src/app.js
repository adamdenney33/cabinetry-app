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
  // R.3: stock rows are used as-is — dimension consumers read the DB columns
  // (thickness_mm/width_mm/length_m) via _svGet; the legacy short-name shadow
  // fields were removed.
  stockItems = stk || [];
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
// INIT
// ══════════════════════════════════════════
// Show a toast on Stripe Checkout return (?upgrade=success / cancelled),
// then strip the query param so a refresh doesn't re-toast.
if (typeof handleCheckoutReturn === 'function') handleCheckoutReturn();
if (typeof handlePortalReturn === 'function') handlePortalReturn();
// Toast + refresh on return from the QuickBooks/Xero OAuth consent screen
// (?accounting=connected / error), then strip the param.
if (typeof handleAccountingReturn === 'function') handleAccountingReturn();
if (typeof handleConnectReturn === 'function') handleConnectReturn();
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


// ── Strategy C: global beforeunload guard ──
// Block tab close while any sidebar / editor is dirty or has a save in flight.
// The dirty flags are top-level `let` globals in their owning files (read them
// bare — they are NOT window properties):
//   _cbDirty (cabinet.js), _clDirty (cutlist.js),
//   _qpState.dirty / _opState.dirty (line-editor.js).
// _saveInFlight IS a window Set (lazily created + add/delete'd by the debounced
// autosaves in business.js / cabinet.js / orders.js / quote-editor.js).
window.addEventListener('beforeunload', (e) => {
  /** @type {any} */
  const w = window;
  const dirty =
    !!_cbDirty ||
    !!_clDirty ||
    !!(_qpState && _qpState.dirty) ||
    !!(_opState && _opState.dirty) ||
    !!(w._saveInFlight && w._saveInFlight.size > 0);
  if (dirty) {
    e.preventDefault();
    // Modern browsers ignore the message string but still show their own prompt
    // when preventDefault() is called and returnValue is set.
    e.returnValue = '';
    return '';
  }
});

