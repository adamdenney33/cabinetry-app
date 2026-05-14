// ProCabinet — Free-tier limits and Pro-subscription detection.
//
// Loaded as a classic <script defer> BEFORE src/app.js. Declares the global
// `_subscription` state and `loadSubscription()` (called from loadAllData).
//
// Free tier: 5 items per library (clients, projects, quotes, orders,
// cabinet_templates, stock). Hard block + upgrade modal at the cap.
// Pro tier: unlimited; no feature gates.
//
// Cross-file dependencies: _userId (defined in src/db.js), _db (defined in
// src/db.js).

// ══════════════════════════════════════════
// FREE TIER CAPS
// ══════════════════════════════════════════
/** @type {Readonly<Record<'clients'|'quotes'|'orders'|'cabinet_templates'|'stock'|'cutlists', number>>} */
const FREE_LIMITS = Object.freeze({
  clients: 5,
  quotes: 5,
  orders: 5,
  cabinet_templates: 5,
  stock: 5,
  cutlists: 5,
});

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
    const { data } = await _db('subscriptions')
      .select('*')
      .eq('user_id', _userId);
    _subscription = (data && data[0]) ? /** @type {SubscriptionRow} */ (data[0]) : null;
  } catch (e) {
    console.warn('[limits] loadSubscription failed:', /** @type {Error} */ (e).message || e);
    _subscription = null;
  }
  // Refresh the Settings → Subscription section if it's mounted.
  if (typeof renderSubscriptionSection === 'function') {
    try { renderSubscriptionSection(); } catch (_e) { /* render is best-effort */ }
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
// LIMIT CHECKS
// ══════════════════════════════════════════
/** @typedef {keyof typeof FREE_LIMITS} LimitedLibrary */

/**
 * Return the cap for a library. Pro users get Infinity.
 *
 * @param {LimitedLibrary} library
 * @returns {number}
 */
function getLimit(library) {
  if (isPro()) return Infinity;
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
  if (isPro()) return false;
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
  if (typeof _openLimitHitModal === 'function') {
    _openLimitHitModal(library);
  } else if (typeof _toast === 'function') {
    _toast(`Free plan limit reached (${FREE_LIMITS[library]} ${library}). Upgrade for unlimited.`, 'error');
  }
  return false;
}
