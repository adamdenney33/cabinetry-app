// ProCabinet — Free-tier limits and Pro-subscription detection.
//
// Loaded as a classic <script defer> BEFORE src/app.js. Declares the global
// `_subscription` state and `loadSubscription()` (called from loadAllData).
//
// Free tier: 5 items per library (clients, quotes, orders, cabinet_templates,
// cutlists). Hard block + upgrade modal at the cap. STOCK IS UNCAPPED — it's
// the setup-investment library that feeds quotes, cut lists and orders;
// capping it blocked the core loop while adding nothing to upgrade intent
// (decision 2026-06-10, SPEC § 13).
// Pro tier: unlimited; no feature gates.
//
// Cross-file dependencies: _userId (defined in src/db.js), _db (defined in
// src/db.js).

// ══════════════════════════════════════════
// FREE TIER CAPS
// ══════════════════════════════════════════
/** @type {Readonly<Record<'clients'|'quotes'|'orders'|'cabinet_templates'|'cutlists', number>>} */
const FREE_LIMITS = Object.freeze({
  clients: 5,
  quotes: 5,
  orders: 5,
  cabinet_templates: 5,
  cutlists: 5,
});

// Founder plan — one-off purchase, lifetime access. NO seat cap: the 50-seat
// limit and its live counter were removed on 2026-07-12. Founder seats are
// unlimited; the price (not scarcity) is what changes — $299 until 14 July,
// $499 after. Nothing client- or server-side counts them any more.

/** Length of the automatic, no-card Pro trial every new account gets, in days.
 *  After it lapses the account silently drops to the 5-item free tier. */
const TRIAL_DAYS = 14;

/** Current user's server-set signup timestamp (auth.users.created_at, ISO),
 *  assigned from the Supabase session in src/app.js on sign-in and cleared on
 *  sign-out. Tamper-proof, so it's a safe basis for the trial clock.
 *  @type {string | null} */
let _userCreatedAt = null;

// ══════════════════════════════════════════
// SUBSCRIPTION STATE
// ══════════════════════════════════════════
/**
 * Current user's subscription row, or null if free / not loaded yet.
 * Free users have no row in the `subscriptions` table — null/missing = free.
 *
 * @typedef {{
 *   status: string | null,
 *   plan: string | null,
 *   stripe_customer_id: string,
 *   stripe_subscription_id: string | null,
 *   current_period_end: string | null,
 *   cancel_at_period_end: boolean,
 * }} SubscriptionRow
 *
 * @type {SubscriptionRow | null}
 */
let _subscription = null;

/**
 * Fetch the current user's subscription row. Returns null when free, when
 * not signed in, or when the fetch fails.
 *
 * @returns {Promise<SubscriptionRow | null>}
 */
async function loadSubscription() {
  if (!_userId) {
    _subscription = null;
    return null;
  }
  try {
    // May already be in flight via the early boot fetch (src/main.js) —
    // _earlyBootOr falls back to the _db() query on any miss/error.
    const { data } = await _earlyBootOr('subscriptions', _userId,
      () => _db('subscriptions').select('*').eq('user_id', _userId));
    _subscription = (data && data[0]) ? /** @type {SubscriptionRow} */ (data[0]) : null;
  } catch (e) {
    console.warn('[limits] loadSubscription failed:', /** @type {Error} */ (e).message || e);
    _subscription = null;
  }
  // Refresh the Settings → Subscription section if it's mounted.
  if (typeof renderSubscriptionSection === 'function') {
    try { renderSubscriptionSection(); } catch (_e) { /* render is best-effort */ }
  }
  // F.2: trial-ending banner — inserts/updates/removes itself from trial state.
  if (typeof _renderTrialBanner === 'function') {
    try { _renderTrialBanner(); } catch (_e) { /* banner is best-effort */ }
  }
  return _subscription;
}

// ══════════════════════════════════════════
// PRO DETECTION
// ══════════════════════════════════════════
/**
 * True when the user has an active Pro subscription.
 * Stripe statuses considered "Pro": 'active' (paying) and 'trialing' (in
 * a Stripe-managed free trial). All others (canceled, past_due, unpaid,
 * incomplete, incomplete_expired, paused, null) → free.
 *
 * @param {SubscriptionRow | null} [sub] override (defaults to current state)
 * @returns {boolean}
 */
function isPro(sub) {
  const s = sub === undefined ? _subscription : sub;
  if (!s) return false;
  return s.status === 'active' || s.status === 'trialing';
}

// ══════════════════════════════════════════
// AUTOMATIC 14-DAY TRIAL
// ══════════════════════════════════════════
/**
 * True when the signed-in user is inside their automatic 14-day Pro trial: an
 * account younger than TRIAL_DAYS that has no paid subscription. Paying users
 * return false here (they're Pro via isPro, not "on trial"). Falls to false the
 * moment the window lapses, dropping the user to the 5-item free tier.
 *
 * @returns {boolean}
 */
function _trialActive() {
  if (!_userId || !_userCreatedAt || isPro()) return false;
  const start = new Date(_userCreatedAt).getTime();
  if (isNaN(start)) return false;
  return Date.now() < start + TRIAL_DAYS * 86400000;
}

/**
 * Whole days remaining in the trial (rounded up), or 0 once it has lapsed / when
 * the signup date is unknown. For the "X days left" UI label.
 *
 * @returns {number}
 */
function _trialDaysLeft() {
  if (!_userCreatedAt) return 0;
  const start = new Date(_userCreatedAt).getTime();
  if (isNaN(start)) return 0;
  return Math.max(0, Math.ceil((start + TRIAL_DAYS * 86400000 - Date.now()) / 86400000));
}

/**
 * Single gate for "full Pro access": a paid subscription OR an active trial.
 * Limit/feature checks use this so trial users get unlimited everything.
 *
 * @returns {boolean}
 */
function _hasProAccess() {
  return isPro() || _trialActive();
}

// ══════════════════════════════════════════
// LIMIT CHECKS
// ══════════════════════════════════════════
/** @typedef {keyof typeof FREE_LIMITS} LimitedLibrary */

/**
 * Count the user's OWN rows in a library array, excluding sample-data overlay
 * rows (src/demo.js). Demo rows are identified by a negative id — or a
 * negative `db_id` for cbLibrary entries, whose `id` is a local timestamp and
 * whose DB row id lives on `db_id`. Pass this instead of `arr.length` to
 * every free-tier cap check so seeded sample data can never eat the cap.
 *
 * @param {any[] | null | undefined} rows
 * @returns {number}
 */
function _realCount(rows) {
  let n = 0;
  for (const r of rows || []) {
    if (!r) continue;
    if (typeof r.id === 'number' && r.id < 0) continue;
    if (typeof r.db_id === 'number' && r.db_id < 0) continue;
    n++;
  }
  return n;
}

/**
 * Return the cap for a library. Pro users get Infinity.
 *
 * @param {LimitedLibrary} library
 * @returns {number}
 */
function getLimit(library) {
  if (_hasProAccess()) return Infinity;
  return FREE_LIMITS[library];
}

/**
 * True when adding one more item would exceed the cap.
 *
 * @param {LimitedLibrary} library
 * @param {number} currentCount
 * @returns {boolean}
 */
function isAtLimit(library, currentCount) {
  return currentCount >= getLimit(library);
}

/**
 * True when within one of the cap (4/5 of 5). Used to show the
 * "approaching limit" banner. Pro users always false.
 *
 * @param {LimitedLibrary} library
 * @param {number} currentCount
 * @returns {boolean}
 */
function isApproachingLimit(library, currentCount) {
  if (_hasProAccess()) return false;
  return currentCount >= FREE_LIMITS[library] - 1;
}

/**
 * Gate a free-tier create action. If the user is at their cap, opens the
 * upgrade modal (`_openLimitHitModal` from src/stripe.js) and returns false
 * so the caller can bail. Returns true when it's safe to proceed.
 *
 * Use at the top of every create function for a capped library:
 *   if (!_enforceFreeLimit('clients', clients.length)) return;
 *
 * @param {LimitedLibrary} library
 * @param {number} currentCount
 * @returns {boolean}
 */
function _enforceFreeLimit(library, currentCount) {
  if (!isAtLimit(library, currentCount)) return true;
  // Demo (guest) visitor: never surface the upgrade modal — they aren't even
  // signed in. Nudge them to sign in and bail, leaving them where they are.
  // (The seeded demo always sits at the cap, so this is the path a guest hits
  // when they try to add a 6th item.)
  if (window._demoMode && !_userId) {
    if (typeof _demoNudge === 'function') _demoNudge();
    return false;
  }
  if (typeof _track === 'function') _track('free_tier_limit_hit', { library: library, current_count: currentCount });
  if (typeof _openLimitHitModal === 'function') {
    _openLimitHitModal(library);
  } else if (typeof _toast === 'function') {
    _toast(`Free plan limit reached (${FREE_LIMITS[library]} ${library}). Upgrade for unlimited.`, 'error');
  }
  return false;
}

// ══════════════════════════════════════════
// PRO-ONLY FEATURE GATE
// ══════════════════════════════════════════
/**
 * Gate a Pro-only feature (CSV import / export). Logged-out demo visitors
 * (no `_userId`) and Pro users pass through; a signed-in free user gets the
 * locked-feature modal and the caller bails. Returns true when it's safe to
 * proceed.
 *
 * Use at the top of every import/export entry point:
 *   if (!_enforceProFeature()) return;
 *
 * Pass a feature name + custom copy to reuse the gate for other Pro-only
 * features (e.g. the customer Live link):
 *   if (!_enforceProFeature('live_link', { message: '…', toast: '…' })) return;
 *
 * @param {string} [feature]  Tracking label for the blocked feature.
 * @param {{message?:string, toast?:string}} [opts]  Optional modal/toast copy.
 * @returns {boolean}
 */
function _enforceProFeature(feature, opts) {
  if (!_userId || _hasProAccess()) return true;
  if (typeof _track === 'function') _track('pro_feature_blocked', { feature: feature || 'import_export' });
  if (typeof _openProFeatureModal === 'function') {
    _openProFeatureModal(opts && opts.message);
  } else if (typeof _toast === 'function') {
    _toast((opts && opts.toast) || 'Importing and exporting is a Pro feature.', 'error');
  }
  return false;
}
