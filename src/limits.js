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
  return isPro();
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
 * Deprecated freemium alias — the per-library cap is gone. Delegates to
 * `_enforceCanEdit()` so the existing call sites keep working unchanged.
 * @param {string} [_library] @param {number} [_currentCount] @returns {boolean}
 */
function _enforceFreeLimit(_library, _currentCount) {
  return _enforceCanEdit();
}

/**
 * Gate a Pro-only WRITE / paid-integration action (CSV import, accounting
 * connect/push). Same rule as `_enforceCanEdit`. Exports are NOT gated — a
 * read-only user may export their data — so their guards are removed at the
 * call site rather than routed here.
 *
 * @returns {boolean}
 */
function _enforceProFeature() {
  return _enforceCanEdit();
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
