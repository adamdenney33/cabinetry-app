// ProCabinet — Subscription state, trial detection, and write gating.
//
// Loaded as a classic <script defer> BEFORE src/app.js. Declares the global
// `_subscription` state and `loadSubscription()` (called from loadAllData).
//
// Model (2026-06 — replaces the old 5-item freemium tier): a card-upfront
// 14-day Stripe trial. A signed-in user with an active trial/subscription gets
// full access (`canEdit()` true). A signed-in user with NO active trial/sub is
// READ-ONLY — they can view + export their data but cannot create/edit/delete
// until they start a trial / resubscribe. Stripe owns the trial clock
// (status 'trialing', `current_period_end` = trial end). Non-subscribers have
// no row in `subscriptions` (null/missing → read-only).
//
// Cross-file dependencies: _userId (src/app.js), _db (src/db.js),
// _openTrialModal (src/stripe.js), _toast (src/ui.js), _track (src/analytics.js),
// window._demoMode (now tour-only, src/demo.js).

// ══════════════════════════════════════════
// PLAN CONSTANTS
// ══════════════════════════════════════════
/** Founder plan — total lifetime accounts ever sold (one-off $299 purchase).
 *  Surfaced as the "N of 50 left" counter on the walkthrough's final CTA and
 *  enforced server-side in the stripe-checkout Edge Function. */
const FOUNDER_CAP = 50;

/** Free-trial length in days. Stripe owns the actual clock (the stripe-checkout
 *  Edge Function passes `trial_period_days`); this mirrors it for UI copy only.
 *  Keep in sync with STRIPE_TRIAL_DAYS in supabase/functions/stripe-checkout. */
const TRIAL_DAYS = 14;

/** Accounts created before this instant keep full free access ("legacy" /
 *  grandfathered): they predate the 14-day-trial model, so they're never forced
 *  into read-only. Set this to your go-live timestamp — the default covers
 *  everyone who signed up through 2026-06-04. */
const GRANDFATHER_BEFORE = '2026-06-05T00:00:00Z';

/** Current user's auth `created_at` (ISO), captured from the Supabase session in
 *  app.js. Null when signed out / not yet known. Server-set, so it can't be
 *  forged client-side.
 *  @type {string | null} */
let _userCreatedAt = null;

// ══════════════════════════════════════════
// SUBSCRIPTION STATE
// ══════════════════════════════════════════
/**
 * Current user's subscription row, or null if read-only / not loaded yet.
 * Non-subscribers have no row in the `subscriptions` table — null/missing =
 * read-only.
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
 * True once `loadSubscription()` has resolved at least once. The read-only
 * write-block in src/db.js fails OPEN until this is set, so a write that races
 * boot is never wrongly blocked for a paying user.
 * @type {boolean}
 */
let _subStateKnown = false;

/**
 * Fetch the current user's subscription row. Returns null when read-only, when
 * not signed in, or when the fetch fails.
 *
 * @returns {Promise<SubscriptionRow | null>}
 */
async function loadSubscription() {
  if (!_userId) {
    _subscription = null;
    _subStateKnown = true;
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
  _subStateKnown = true;
  // Refresh the Settings → Subscription section + the trial banner if mounted.
  if (typeof renderSubscriptionSection === 'function') {
    try { renderSubscriptionSection(); } catch (_e) { /* render is best-effort */ }
  }
  if (typeof _syncTrialBanner === 'function') {
    try { _syncTrialBanner(); } catch (_e) { /* banner is best-effort */ }
  }
  return _subscription;
}

// ══════════════════════════════════════════
// PRO / TRIAL DETECTION
// ══════════════════════════════════════════
/**
 * True when the user has an active Pro subscription OR an in-progress trial.
 * Stripe statuses considered "full access": 'active' (paying / Founder lifetime)
 * and 'trialing' (in the 14-day card-upfront trial). All others (canceled,
 * past_due, unpaid, incomplete, incomplete_expired, paused, null) → read-only.
 *
 * @param {SubscriptionRow | null} [sub] override (defaults to current state)
 * @returns {boolean}
 */
function isPro(sub) {
  const s = sub === undefined ? _subscription : sub;
  if (!s) return false;
  return s.status === 'active' || s.status === 'trialing';
}

/**
 * True when the signed-in user may write (create / edit / delete). Equivalent
 * to an active trial or subscription; read-only users return false. Single
 * source of truth for the write gates + the db.js chokepoint.
 *
 * @returns {boolean}
 */
function canEdit() {
  return isPro() || isGrandfathered();
}

/**
 * True when the signed-in user predates the 14-day-trial model and keeps full
 * free access ("legacy" account). Compares the authenticated session's
 * `created_at` (captured into `_userCreatedAt`) against GRANDFATHER_BEFORE.
 *
 * @returns {boolean}
 */
function isGrandfathered() {
  if (!_userId || !_userCreatedAt) return false;
  const t = new Date(_userCreatedAt).getTime();
  if (isNaN(t)) return false;
  return t < new Date(GRANDFATHER_BEFORE).getTime();
}

/**
 * Lifecycle bucket for UI: 'trialing' | 'active' | 'past_due' | 'none' | 'lapsed'.
 *   • 'none'     — never subscribed (no row)
 *   • 'trialing' — inside the 14-day trial
 *   • 'active'   — paying (incl. Founder lifetime)
 *   • 'past_due' — payment failed; needs a card update (route to the portal)
 *   • 'lapsed'   — had a subscription, now inactive (canceled/incomplete/…)
 *
 * @returns {'trialing'|'active'|'past_due'|'none'|'lapsed'}
 */
function _subState() {
  const s = _subscription;
  if (!s || !s.status) return 'none';
  if (s.status === 'trialing') return 'trialing';
  if (s.status === 'active') return 'active';
  if (s.status === 'past_due' || s.status === 'unpaid') return 'past_due';
  return 'lapsed';
}

/**
 * Whole days left in the Stripe trial, or null when not trialing. Reads
 * `current_period_end` (= trial end while status === 'trialing'). Clamped ≥ 0.
 *
 * @returns {number | null}
 */
function _trialDaysLeft() {
  const s = _subscription;
  if (!s || s.status !== 'trialing' || !s.current_period_end) return null;
  const ms = new Date(s.current_period_end).getTime() - Date.now();
  if (isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
}

// ══════════════════════════════════════════
// LEGACY FREE-TIER CAP (grandfathered users only)
// ══════════════════════════════════════════
/** Per-library item cap for grandfathered (legacy free) users. Pro/trial users
 *  are unlimited; post-cutoff non-subscribers are read-only (no creates at all). */
const FREE_LIMITS = Object.freeze({
  clients: 5,
  quotes: 5,
  orders: 5,
  cabinet_templates: 5,
  stock: 5,
  cutlists: 5,
});
/** @typedef {keyof typeof FREE_LIMITS} LimitedLibrary */

/** Cap for a library: Infinity for Pro/trial, else the legacy free cap.
 *  @param {LimitedLibrary} library @returns {number} */
function getLimit(library) {
  if (isPro()) return Infinity;
  return FREE_LIMITS[library];
}

/** True when adding one more item would exceed the cap.
 *  @param {LimitedLibrary} library @param {number} currentCount @returns {boolean} */
function isAtLimit(library, currentCount) {
  return currentCount >= getLimit(library);
}

// ══════════════════════════════════════════
// WRITE GATES
// ══════════════════════════════════════════
/**
 * Gate a create / edit / delete action up-front (before opening a form).
 *   • Guided tour (window._demoMode) → pass through so the tour flows; the
 *     db.js demo branch blocks the real write.
 *   • Active trial / subscription → proceed.
 *   • Read-only (signed-in non-subscriber) → open the trial modal and bail.
 *
 * Use at the top of every create/edit entry point:
 *   if (!_enforceCanEdit()) return;
 *
 * @returns {boolean}
 */
function _enforceCanEdit() {
  if (window._demoMode) return true;            // guided tour — let it flow
  if (canEdit()) return true;
  if (typeof _track === 'function') _track('readonly_write_blocked', { surface: 'gate' });
  if (typeof _openTrialModal === 'function') {
    _openTrialModal();
  } else if (typeof _toast === 'function') {
    _toast(`Start your ${TRIAL_DAYS}-day free trial to add this.`, 'error');
  }
  return false;
}

/**
 * Gate a per-library CREATE action against the tier rules:
 *   • Guided tour (window._demoMode) → pass (the db demo branch blocks the write).
 *   • Pro / trial → unlimited.
 *   • Grandfathered (legacy free) → capped at FREE_LIMITS[library]; at the cap,
 *     open the cap modal and bail.
 *   • Read-only (post-cutoff non-subscriber) → can't create; open the trial modal.
 *
 * Use at the top of every per-library create entry point:
 *   if (!_enforceFreeLimit('clients', clients.length)) return;
 *
 * @param {LimitedLibrary} library
 * @param {number} currentCount
 * @returns {boolean}
 */
function _enforceFreeLimit(library, currentCount) {
  if (window._demoMode) return true;
  if (isPro()) return true;
  if (isGrandfathered()) {
    if (!isAtLimit(library, currentCount)) return true;
    if (typeof _track === 'function') _track('free_tier_limit_hit', { library: library, current_count: currentCount });
    if (typeof _openLimitHitModal === 'function') _openLimitHitModal(library);
    else if (typeof _toast === 'function') _toast(`Legacy free plan limit reached (${FREE_LIMITS[library]} ${library}). Upgrade for unlimited.`, 'error');
    return false;
  }
  // Read-only (no active trial/sub, not grandfathered) — can't create at all.
  if (typeof _track === 'function') _track('readonly_write_blocked', { surface: 'create', library: library });
  if (typeof _openTrialModal === 'function') _openTrialModal();
  else if (typeof _toast === 'function') _toast(`Start your ${TRIAL_DAYS}-day free trial to add this.`, 'error');
  return false;
}

/**
 * Gate a Pro-only action that bulk-writes or uses a paid integration (CSV
 * import, accounting connect/push). Pro/trial only — grandfathered (legacy
 * free) users are blocked too, both to match the old free tier and because a
 * bulk import would bypass their per-library cap. Exports are NOT gated (a
 * read-only user may export their data); those guards were removed at the call
 * sites, not routed here.
 *
 * @returns {boolean}
 */
function _enforceProFeature() {
  if (window._demoMode) return true;
  if (isPro()) return true;
  if (typeof _track === 'function') _track('pro_feature_blocked', { feature: 'import_integration' });
  if (typeof _openTrialModal === 'function') _openTrialModal();
  else if (typeof _toast === 'function') _toast('Importing is a Pro feature — start your free trial.', 'error');
  return false;
}

// ══════════════════════════════════════════
// READ-ONLY WRITE BLOCK (db.js chokepoint backstop)
// ══════════════════════════════════════════
/** Tables a read-only user may still write to (engagement, not core business
 *  data). Everything else is blocked at the db.js chokepoint. `subscriptions`
 *  is service-role-only and never written client-side, so needs no entry. */
const _READONLY_WRITE_ALLOW = Object.freeze(['feature_suggestion_votes']);

/** @param {string} table @returns {boolean} */
function _readonlyWriteAllowed(table) {
  return _READONLY_WRITE_ALLOW.indexOf(table) !== -1;
}

/** Timestamp (ms) of the last read-only nudge, for debouncing. */
let _trialNudgeAt = 0;

/**
 * Debounced read-only nudge — a non-blocking toast shown when a signed-in
 * non-subscriber's write is blocked at the db.js chokepoint (an inline
 * autosave / delete that slipped past the up-front `_enforceCanEdit` gates).
 * Kept as a toast (not a modal) so inline edits don't throw up a popup; the
 * explicit create actions open the modal via `_enforceCanEdit`.
 */
function _trialNudge() {
  const now = Date.now();
  if (now - _trialNudgeAt < 4000) return;
  _trialNudgeAt = now;
  if (typeof _toast === 'function') {
    _toast(`Read-only — start your ${TRIAL_DAYS}-day free trial to save changes.`, 'error');
  }
}

/**
 * Block a write for a read-only user. Mirrors `_demoBlockWrite` (src/demo.js):
 * nudges, then returns a benign resolved value so the caller can't crash.
 * @param {any} builder a `_DBBuilder` instance
 * @returns {{ data: any, error: any }}
 */
function _readonlyBlockWrite(builder) {
  _trialNudge();
  return { data: builder && builder._isSingle ? null : [], error: { message: 'Start your free trial to save your work', _readonly: true } };
}
