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
 * Supabase session and subscription state are loaded. Also lifts the
 * first-touch attribution stored on the auth.users row into the PostHog
 * person profile so funnels can break down by ad campaign.
 *
 * @param {any} session Supabase auth session
 */
function _identifyUser(session) {
  const ph = window.posthog;
  if (!ph || !session || !session.user) return;
  try {
    /** @type {Record<string, any>} */
    const props = { email: session.user.email, plan: _currentPlan() };
    // Lift the attribution blob captured at signUp time into person props.
    // Mirrors what's on auth.users.raw_user_meta_data.attribution.
    const attr = session.user.user_metadata?.attribution;
    if (attr && typeof attr === 'object') {
      for (const [k, v] of Object.entries(attr)) {
        if (v) props[`initial_${k}`] = v;
      }
    }
    ph.identify(session.user.id, props);
  } catch (e) {
    // best-effort
  }
}

/**
 * Fire ad-platform conversion pixels at signup. Called from authSubmit()
 * once Supabase's signUp() returns success. Each branch is feature-detected
 * — with no pixel IDs configured in src/main.js, window.gtag and window.fbq
 * stay undefined and every call below is a safe no-op.
 *
 * Pixel-specific event names:
 *   - GA4:        'sign_up'                  (standard recommended event)
 *   - Google Ads: 'conversion' with send_to  (filled from VITE_GOOGLE_ADS_CONVERSION_LABEL)
 *   - Meta Pixel: 'CompleteRegistration'     (standard event)
 *
 * The conversion is fired on signup form submission, NOT email confirmation.
 * This aligns with how Google Ads and Meta Ads Manager attribute conversions
 * to the originating ad click — they expect the conversion at the moment the
 * user completes the form, not on a later email click that breaks the
 * referrer chain.
 */
function _trackSignupConversion() {
  // ── Meta Pixel ──
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'CompleteRegistration');
    }
  } catch (e) { /* best-effort */ }

  // ── Google Ads conversion + GA4 sign_up event ──
  try {
    if (typeof window.gtag === 'function') {
      // GA4 standard sign_up event (only fires meaningfully if GA4 ID is set)
      window.gtag('event', 'sign_up', { method: 'email' });

      // Google Ads conversion — needs the full send_to string, not just the
      // Ads account ID. Format is 'AW-XXXXXXXXX/abcDEF12345' where the part
      // after the slash is the conversion label, created in Google Ads →
      // Tools → Conversions → New conversion action. window._GADS_CONV is
      // set by src/main.js from VITE_GOOGLE_ADS_CONVERSION_SEND_TO. Without
      // it, GA4 still gets the sign_up event but Google Ads won't attribute.
      const adsConvSendTo = window._GADS_CONV;
      if (adsConvSendTo) {
        window.gtag('event', 'conversion', { send_to: adsConvSendTo });
      }
    }
  } catch (e) { /* best-effort */ }
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
