// ProCabinet — npm-package bridge module
//
// Loaded as <script type="module"> BEFORE the classic <script> tags in
// index.html. Imports Supabase + jsPDF from npm and re-exports them onto
// `window` under the same names the CDN scripts used to provide. This lets
// the rest of the codebase (db.js, ui.js, app.js, migrate.js) stay as
// classic globals-only scripts unchanged.
//
// This bridge is the ONLY module-syntax file in the codebase right now.
// Phase C of the modernization plan converts everything else.

import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';

// ── Error tracking ──
// Init before everything else so the Supabase env check below — and any other
// bootstrap failure — is captured. DSN-gated: with no VITE_SENTRY_DSN the SDK
// stays uninitialized and every Sentry.* call is a safe no-op, so dev and
// pre-account builds run untouched. Error-only: no tracing/replay/profiling
// integrations are added, keeping the bundle small.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    ignoreErrors: [
      // Microsoft Office/Outlook link-scanning + injected scripts (SafeLinks,
      // Dynamics instrumentation) reject promises with this on pages they
      // crawl or augment. Well-known third-party noise, not app code.
      /Object Not Found Matching Id:\d+/,
    ],
  });
}
window.Sentry = Sentry;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill in values.');
}

window.supabase = { createClient };
window.jspdf = { jsPDF };
window._SBURL = import.meta.env.VITE_SUPABASE_URL;
window._SBKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Product analytics ──
// PostHog is OPTIONAL and key-gated: with no VITE_POSTHOG_KEY the SDK is never
// initialised and window.posthog stays undefined, so the src/analytics.js
// wrappers no-op. A dev .env.local that omits the key keeps dev traffic out of
// production analytics. Never throws — unlike the Supabase keys above.
const _phKey = import.meta.env.VITE_POSTHOG_KEY;
if (_phKey) {
  posthog.init(_phKey, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: true,
    autocapture: true,
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: false,
      // Mask the owner's Business Info fields in replays — company name,
      // phone, email, address, tax number and bank/payment details are
      // sensitive PII/financial data that should not reach analytics.
      maskTextSelector: '#biz-name, #biz-phone, #biz-email, #biz-address, #biz-abn, #biz-bank-details',
    },
  });
  window.posthog = posthog;
}

// ── Marketing attribution capture (first-touch) ──
// Runs once per browser. If the visitor lands with any utm_*/gclid/fbclid
// query params, snapshot them + referrer + landing path into localStorage.
// First-touch wins (industry standard for SaaS attribution) — we never
// overwrite once set, so a returning user's signup is attributed to the
// campaign that first introduced them. authSubmit() in src/app.js reads
// this blob via window._getAttribution() and passes it into Supabase's
// user_metadata at signUp time so it lands permanently on auth.users.
const _ATTR_KEY = 'pc_attribution';
try {
  if (!localStorage.getItem(_ATTR_KEY)) {
    const _qp = new URLSearchParams(window.location.search);
    const _has = (/** @type {string} */ k) => _qp.has(k);
    const _get = (/** @type {string} */ k) => _qp.get(k) || '';
    // Only persist if there's actual attribution data — direct/organic
    // visits don't need a row.
    if (_has('utm_source') || _has('utm_medium') || _has('utm_campaign')
        || _has('gclid') || _has('fbclid')) {
      localStorage.setItem(_ATTR_KEY, JSON.stringify({
        utm_source: _get('utm_source'),
        utm_medium: _get('utm_medium'),
        utm_campaign: _get('utm_campaign'),
        utm_term: _get('utm_term'),
        utm_content: _get('utm_content'),
        gclid: _get('gclid'),
        fbclid: _get('fbclid'),
        referrer: document.referrer || '',
        landing_path: window.location.pathname + window.location.search,
        first_seen_at: new Date().toISOString(),
      }));
    }
  }
} catch (_e) {
  // localStorage unavailable (private mode etc.) — attribution is best-effort.
}
window._getAttribution = () => {
  try { return JSON.parse(localStorage.getItem(_ATTR_KEY) || '{}'); }
  catch { return {}; }
};

// ── Google tag (GA4 + Google Ads) ──
// One gtag.js script powers both GA4 measurement and Google Ads conversion
// tracking. Env-gated: with neither ID set, the script never loads and
// window.gtag stays undefined, so the analytics.js conversion helpers no-op.
const _ga4Id = import.meta.env.VITE_GA4_ID;
const _googleAdsId = import.meta.env.VITE_GOOGLE_ADS_ID;
if (_ga4Id || _googleAdsId) {
  const _tagSeed = _ga4Id || _googleAdsId;
  const _s = document.createElement('script');
  _s.async = true;
  _s.src = `https://www.googletagmanager.com/gtag/js?id=${_tagSeed}`;
  document.head.appendChild(_s);
  /** @type {any[]} */
  const _dl = window.dataLayer = window.dataLayer || [];
  /** @type {(...args: any[]) => void} */
  const _gtag = function () { _dl.push(arguments); };
  window.gtag = _gtag;
  _gtag('js', new Date());
  if (_ga4Id) _gtag('config', _ga4Id, { send_page_view: true });
  if (_googleAdsId) _gtag('config', _googleAdsId);
}
// Google Ads conversion `send_to` string ('AW-XXXXXXXXX/abcDEF12345').
// Exposed to classic scripts via window — src/analytics.js fires the
// conversion event when this is set.
const _adsConvSendTo = import.meta.env.VITE_GOOGLE_ADS_CONVERSION_SEND_TO;
if (_adsConvSendTo) window._GADS_CONV = _adsConvSendTo;
// Google Ads PURCHASE conversion `send_to` — a distinct conversion action from
// the signup one above, fired by _trackPurchaseConversion (src/analytics.js) on
// a successful Pro checkout. No-op until VITE_GOOGLE_ADS_PURCHASE_CONVERSION_SEND_TO is set.
const _adsPurchaseSendTo = import.meta.env.VITE_GOOGLE_ADS_PURCHASE_CONVERSION_SEND_TO;
if (_adsPurchaseSendTo) window._GADS_PURCHASE_CONV = _adsPurchaseSendTo;

// ── Meta Pixel (Facebook + Instagram ads) ──
// Env-gated by VITE_META_PIXEL_ID. With no ID set, window.fbq stays
// undefined and the analytics.js conversion helpers no-op.
const _metaPixelId = import.meta.env.VITE_META_PIXEL_ID;
if (_metaPixelId) {
  // Standard Meta Pixel bootstrap, scoped to avoid leaking helpers globally.
  // The Meta-supplied snippet mutates the fbq function with non-function
  // properties (.callMethod, .queue, .push, .loaded, .version) so the inner
  // `n` binding is typed `any` to keep the upstream code shape intact while
  // satisfying strict TS.
  (function (/** @type {any} */ f, /** @type {Document} */ b, /** @type {string} */ e, /** @type {string} */ v) {
    if (f.fbq) return;
    /** @type {any} */
    const n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = b.createElement(e); /** @type {any} */ (t).async = true; /** @type {any} */ (t).src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /** @type {any} */ (window).fbq('init', _metaPixelId);
  /** @type {any} */ (window).fbq('track', 'PageView');
}

// Dev-only: stash test credentials for window._signInForTesting() (defined in db.js).
// Production builds (`import.meta.env.DEV === false`) leave these undefined.
if (import.meta.env.DEV) {
  window._isDev = true;
  if (import.meta.env.VITE_TEST_EMAIL && import.meta.env.VITE_TEST_PASSWORD) {
    window._TEST_EMAIL = import.meta.env.VITE_TEST_EMAIL;
    window._TEST_PASSWORD = import.meta.env.VITE_TEST_PASSWORD;
  }
}
