// ProCabinet — product-analytics wrappers (PostHog).
//
// Loaded as a classic <script defer> right after src/stripe.js. PostHog itself
// is initialised in src/main.js and exposed as window.posthog ONLY when
// VITE_POSTHOG_KEY is set; when it is absent every wrapper below is a safe
// no-op, so call sites never need their own env checks.
//
// Cross-file deps: isPro() from src/limits.js; window.posthog from src/main.js.

/**
 * Current subscription tier — attached to every event so funnels and insights
 * can break down by plan.
 *
 * @returns {'free' | 'pro'}
 */
function _currentPlan() {
  return (typeof isPro === 'function' && isPro()) ? 'pro' : 'free';
}

/**
 * Capture a product-analytics event. No-op when PostHog is not initialised
 * (e.g. local dev with no VITE_POSTHOG_KEY).
 *
 * @param {string} event Event name, e.g. 'library_item_created'
 * @param {Record<string, any>} [props] Extra event properties
 */
function _track(event, props) {
  const ph = window.posthog;
  if (!ph) return;
  try {
    ph.capture(event, { plan: _currentPlan(), ...(props || {}) });
  } catch (e) {
    // Analytics is best-effort — a tracking failure must never break the app.
  }
}

/**
 * Link the signed-in user to their PostHog person profile. Call once the
 * Supabase session and subscription state are loaded.
 *
 * @param {any} session Supabase auth session
 */
function _identifyUser(session) {
  const ph = window.posthog;
  if (!ph || !session || !session.user) return;
  try {
    ph.identify(session.user.id, { email: session.user.email, plan: _currentPlan() });
  } catch (e) {
    // best-effort
  }
}

/** Clear the PostHog identity on sign-out so the next user starts clean. */
function _resetAnalytics() {
  const ph = window.posthog;
  if (!ph) return;
  try {
    ph.reset();
  } catch (e) {
    // best-effort
  }
}
