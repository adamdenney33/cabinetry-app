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
  if (!session || !session.user) return;
  const ph = window.posthog;
  // PostHog lazy-loads after `load` (src/main.js, perf pass P.2) and a fast
  // data load can beat it here — stash the session for the init to replay.
  if (!ph) { window._pendingIdentify = session; return; }
  try {
    /** @type {Record<string, any>} */
    const props = { email: session.user.email, plan: _currentPlan() };
    // Name collected at signup (user_metadata). `name` is PostHog's canonical
    // person-display property; first/last are kept for segmentation.
    const meta = session.user.user_metadata || {};
    const fullName = (meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(' ')).trim();
    if (fullName) props.name = fullName;
    if (meta.first_name) props.first_name = meta.first_name;
    if (meta.last_name) props.last_name = meta.last_name;
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
 *
 * Dedupe: the same CompleteRegistration also fires server-side via the
 * meta-capi-signup edge function, from TWO callers — the `auth.users` trigger
 * (catches every signup incl. Google OAuth and browser-blocked environments,
 * matches on email + reconstructed fbc) and the client POST below (adds the
 * real _fbc/_fbp + client IP/UA for higher match quality). All three events
 * (browser pixel + both server calls) share event_id `signup-<user_id>`, so
 * Meta counts the signup once and keeps the richest match data.
 *
 * @param {string | null} [userId] Supabase auth user id from signUp()
 */
function _trackSignupConversion(userId) {
  // ── Meta Pixel (browser) ──
  try {
    if (typeof window.fbq === 'function') {
      if (userId) {
        window.fbq('track', 'CompleteRegistration', {}, { eventID: 'signup-' + userId });
      } else {
        window.fbq('track', 'CompleteRegistration');
      }
    }
  } catch (e) { /* best-effort */ }

  // ── Meta Conversions API (server) — match-quality path ──
  // The auth.users trigger already fires this CompleteRegistration server-side
  // for every signup (email + reconstructed fbc). This client POST adds what a
  // DB trigger can't see — the real _fbc/_fbp cookies + client IP/UA — lifting
  // match quality; the function dedupes the two via event_id signup-<user_id>.
  // Fire-and-forget: never blocks or fails signup, and no-ops without a user id
  // or Supabase config (local dev). `keepalive` lets it outlive the post-signup
  // nav to the confirm panel. The function verifies the user id and reads the
  // real email server-side, so the only sensitive thing the browser sends is
  // the Meta cookies the pixel already set.
  try {
    if (userId && window._SBURL && window._SBKEY) {
      fetch(window._SBURL + '/functions/v1/meta-capi-signup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: window._SBKEY,
          authorization: 'Bearer ' + window._SBKEY,
        },
        body: JSON.stringify({
          user_id: userId,
          fbc: _readCookie('_fbc'),
          fbp: _readCookie('_fbp'),
          event_source_url: window.location.href,
        }),
        keepalive: true,
      }).catch(function () { /* best-effort */ });
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

/**
 * Read a browser cookie by name, '' when absent. Used to forward Meta's click
 * id (_fbc) and browser id (_fbp) cookies — set by the pixel on the landing
 * page, readable same-origin at /os — to the server-side signup CAPI for match
 * quality.
 *
 * @param {string} name Cookie name, e.g. '_fbc'
 * @returns {string} Decoded cookie value, or '' if not present
 */
function _readCookie(name) {
  try {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  } catch (e) {
    return '';
  }
}

/**
 * Fire ad-platform conversion pixels on a successful Pro purchase. Called from
 * handleCheckoutReturn() (src/stripe.js) when Stripe redirects back with
 * `?upgrade=success&plan=<plan>`. Feature-detected exactly like the signup
 * helper — with no pixel/ads IDs configured, every branch is a safe no-op.
 *
 * `value` is the USD list price from the stripe-checkout function (monthly $35,
 * annual $299, founder $499 one-off). The amount actually charged can differ
 * with Adaptive Pricing currency conversion, so treat this as the reporting /
 * value-optimisation figure, not the exact receipt.
 *
 * Meta is NOT fired from the browser here (since 2026-06-10): the Stripe
 * webhook fires a server-side CAPI 'Subscribe'/'Purchase' with the exact
 * amount_total, hashed email, and fbc — far more reliable than a pixel on a
 * post-checkout return page (which only fires if the user lands back, with no
 * blocker, before navigating away). One canonical source = no dedupe risk.
 *
 * Event names per platform:
 *   - Meta:       server-side CAPI from stripe-webhook ('Subscribe' / 'Purchase')
 *   - GA4:        'purchase'
 *   - Google Ads: 'conversion' with send_to (VITE_GOOGLE_ADS_PURCHASE_CONVERSION_SEND_TO)
 *
 * @param {string | null | undefined} plan  Expected 'monthly' | 'annual' | 'founder'; any other value falls back to the monthly price.
 */
function _trackPurchaseConversion(plan) {
  // USD list prices keyed by plan. Fall back to the monthly price if the plan
  // param is missing, so the conversion still carries a sensible value.
  /** @type {Record<string, number>} */
  const PRICES = { monthly: 35, annual: 299, founder: 499 };
  const value = (plan && PRICES[plan]) || PRICES.monthly;
  const currency = 'USD';

  // ── GA4 purchase + Google Ads purchase conversion ──
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'purchase', { value, currency });
      const adsPurchaseSendTo = window._GADS_PURCHASE_CONV;
      if (adsPurchaseSendTo) {
        window.gtag('event', 'conversion', { send_to: adsPurchaseSendTo, value, currency });
      }
    }
  } catch (e) { /* best-effort */ }
}

/** Clear the PostHog identity on sign-out so the next user starts clean. */
function _resetAnalytics() {
  window._pendingIdentify = null; // a queued identify must not outlive sign-out
  const ph = window.posthog;
  if (!ph) return;
  try {
    ph.reset();
  } catch (e) {
    // best-effort
  }
}
