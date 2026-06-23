// ProCabinet — npm-package bridge module
//
// Loaded as <script type="module"> BEFORE the classic <script> tags in
// index.html. Imports Supabase + jsPDF from npm and re-exports them onto
// `window` under the same names the CDN scripts used to provide. This lets
// the rest of the codebase (db.js, ui.js, app.js, migrate.js) stay as
// classic globals-only scripts unchanged.
//
// This is the ONLY module-syntax file in the codebase. Phase C converts the
// rest. Force-rebuilt 2026-06-23 to invalidate a poisoned CF edge-cache entry.

import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/browser';

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
      // Android in-app browsers (Facebook/Instagram/Gmail webviews) inject a
      // native bridge that throws once the host Activity is torn down — not
      // our code and unreachable from a normal browser (Sentry JAVASCRIPT-J).
      /Java object is gone/,
      // @supabase/auth-js serialises cross-tab token refresh with the Web Locks
      // API; when two tabs/requests contend, the loser's lock is "stolen" and
      // auth-js rejects. Benign — the refresh retries (Sentry JAVASCRIPT-E / -3).
      /Lock was stolen by another request/,
      /was released because another request stole it/,
    ],
  });
}
window.Sentry = Sentry;

// ── Boot self-heal (resilience pass) ──
// The 18 classic <script defer> domain files share one global scope; if any
// single file fails to download — flaky mobile networks drop a request, and our
// users are tradespeople on job sites / in workshops — every function it
// defines silently goes missing, and the first unguarded caller throws
// (Sentry JAVASCRIPT-M/N/4 were exactly this: a dropped quotes.js / settings.js
// left renderQuoteMain / toggleAccount undefined). A failed `defer` script is
// not cached, so a single reload re-fetches it. After `load`, probe one sentinel
// global per critical domain file; if any stay absent through a short grace
// window a script genuinely dropped, so reload exactly once per tab, guarded by
// sessionStorage against a reload loop. HTML is served must-revalidate and /src
// URLs carry ?v= content stamps (see _headers), so the reload always pulls a
// consistent script set.
const _HEAL_KEY = '_pc_boot_heal';
/** One global per domain file that must exist after a complete boot. */
const _bootSentinels = [
  'loadAllData',      // app.js
  'renderStockMain',  // stock.js
  'renderQuoteMain',  // quotes.js
  'renderOrdersMain', // orders.js
  'toggleAccount',    // settings.js
  '_loadCutList',     // cutlist.js
];
function _checkBootIntegrity() {
  const w = /** @type {any} */ (window);
  const stillMissing = () => _bootSentinels.filter((n) => typeof w[n] !== 'function');
  // Decide once all sentinels are present, or once the grace window is spent.
  // Returns true when a terminal decision is reached (stop polling).
  let tries = 0;
  const decide = () => {
    const missing = stillMissing();
    if (missing.length === 0) {
      // Complete boot — clear the guard so a later dropped load can self-heal too.
      try { sessionStorage.removeItem(_HEAL_KEY); } catch (_e) { /* storage blocked */ }
      return true;
    }
    // Grace window: classic <script defer> files (and Vite's dev transforms of
    // them) can finish just after `load`, so a sentinel missing right now may be
    // merely slow, not dropped. Poll ~3s before concluding a genuine failure — a
    // truly failed script stays missing the whole window.
    if (tries++ < 12) return false;
    let healed = false;
    try { healed = sessionStorage.getItem(_HEAL_KEY) === '1'; } catch (_e) { /* storage blocked */ }
    if (!healed) {
      // First genuinely-incomplete boot this tab: a domain script dropped, and a
      // failed `defer` request isn't cached, so one reload re-fetches it. Only
      // reload if the guard flag persisted; in a storage-blocked browser we
      // can't prevent a loop, so fall through and report instead.
      let marked = false;
      try { sessionStorage.setItem(_HEAL_KEY, '1'); marked = true; } catch (_e) { marked = false; }
      if (marked) { window.location.reload(); return true; }
    }
    // Reloaded once and still incomplete (bad deploy, blocked CDN, an ad-blocker
    // eating a file), or storage unavailable. Don't loop — report so it surfaces;
    // the call-site try/catch guards keep the app usable meanwhile.
    if (window.Sentry) {
      window.Sentry.captureMessage(
        'boot incomplete — domain scripts missing after self-heal: ' + missing.join(', '),
        { level: 'error', extra: { missing } },
      );
    }
    return true;
  };
  if (decide()) return;
  const iv = setInterval(() => { if (decide()) clearInterval(iv); }, 250);
}
// Run after `load` — all deferred scripts have executed by then — rather than
// DOMContentLoaded, which in Vite dev can fire before the classic scripts do.
if (document.readyState === 'complete') { _checkBootIntegrity(); }
else { window.addEventListener('load', _checkBootIntegrity, { once: true }); }

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill in values.');
}

window.supabase = { createClient };
window._SBURL = import.meta.env.VITE_SUPABASE_URL;
window._SBKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Run after the window `load` event — immediately (next tick) if already past
 *  it. Used to keep optional payloads (analytics SDKs, ad pixels, the jsPDF
 *  warm-up) out of the boot-critical window. @param {() => void} fn */
const _afterLoad = (fn) => {
  if (document.readyState === 'complete') setTimeout(fn, 0);
  else window.addEventListener('load', () => setTimeout(fn, 0), { once: true });
};

// ── Early boot fetch (perf pass P.4) ──
// This module executes before the classic <script defer> files finish
// downloading/parsing, so it's the earliest possible moment to request the
// data the dashboard needs. If a stored Supabase session exists (the same
// localStorage blob db.js's _dbAuthToken falls back to), fire the
// render-gating boot queries now and stash the in-flight promises on
// window._earlyBoot. loadAllData / loadSubscription /
// loadAccountingConnections consume them through _earlyBootOr (src/db.js),
// which falls back to the normal _db() query on any miss or error — so the
// query strings here MUST stay equivalent to those fallbacks. Signed-out
// visitors (no blob) and storage-blocked browsers skip this entirely and
// boot exactly as before.
try {
  const _ebRef = new URL(window._SBURL).hostname.split('.')[0];
  const _ebRaw = localStorage.getItem(`sb-${_ebRef}-auth-token`);
  const _ebSess = _ebRaw ? JSON.parse(_ebRaw) : null;
  const _ebToken = _ebSess?.access_token;
  const _ebUid = _ebSess?.user?.id;
  // Skip on an expired/near-expiry JWT — the request would just 401; the
  // normal _db() path refreshes the session and retries instead.
  const _ebFresh = !_ebSess?.expires_at || (_ebSess.expires_at * 1000 > Date.now() + 30_000);
  if (_ebToken && _ebUid && _ebFresh) {
    const _ebHeaders = { apikey: window._SBKEY, Authorization: `Bearer ${_ebToken}` };
    /** @param {string} table @param {string} params @returns {Promise<{ data: any, error: null }>} */
    const _ebGet = (table, params) => {
      const go = () =>
        fetch(`${window._SBURL}/rest/v1/${table}?${params}`, { headers: _ebHeaders })
          .then(async (r) => {
            if (!r.ok) throw new Error(`early-boot ${table} HTTP ${r.status}`);
            return { data: await r.json(), error: null };
          });
      // One immediate retry on pure network failure (fetch rejects with
      // TypeError): a stale pooled socket to the Supabase origin kills all
      // nine requests at once (ERR_CONNECTION_CLOSED) where a fresh
      // connection succeeds. HTTP errors (our own Error above) don't retry —
      // a 401 here means the token is bad and the _db() fallback must handle it.
      return go().catch((e) => (e instanceof TypeError ? go() : Promise.reject(e)));
    };
    window._earlyBoot = {
      userId: _ebUid,
      orders: _ebGet('orders', 'select=*&order=created_at.desc'),
      quotes: _ebGet('quotes', 'select=*&order=created_at.desc'),
      stock_items: _ebGet('stock_items', 'select=*&order=created_at.asc'),
      clients: _ebGet('clients', 'select=*&order=name.asc'),
      catalog_items: _ebGet('catalog_items', `select=*&user_id=eq.${_ebUid}`),
      business_info: _ebGet('business_info', `select=*&user_id=eq.${_ebUid}`),
      subscriptions: _ebGet('subscriptions', `select=*&user_id=eq.${_ebUid}`),
      accounting_connections: _ebGet('accounting_connections', 'select=provider,org_name,status,default_tax_code'),
      accounting_invoice_links: _ebGet('accounting_invoice_links', 'select=order_id,provider,external_url,external_number,status'),
    };
    // Pre-handle rejections: a revoked token rejects all nine at once, and the
    // consumers only catch the copies they await — this silences the
    // unhandled-rejection noise for any slot that never gets consumed.
    for (const v of Object.values(window._earlyBoot)) {
      const p = /** @type {any} */ (v);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
} catch (e) { /* storage blocked / malformed blob — boot proceeds normally */ }

// ── jsPDF (lazy) ──
// PDF generation is never on the boot path, and jspdf + autotable are ~450 KB
// minified — dynamic-import them on first use instead of shipping them in the
// boot bundle. window.jspdf keeps the exact shape the eager import used to
// set, so the `!window.jspdf` guards in cutlist.js still work as a fallback.
/** @type {Promise<{ jsPDF: typeof import('jspdf').jsPDF }> | null} */
let _jspdfLoad = null;
window._ensureJsPDF = function _ensureJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf);
  if (!_jspdfLoad) {
    _jspdfLoad = import('jspdf')
      .then(async (m) => {
        await import('jspdf-autotable'); // patches jsPDF.API — must follow jspdf
        window.jspdf = { jsPDF: m.jsPDF };
        return window.jspdf;
      })
      .catch((e) => { _jspdfLoad = null; throw e; }); // failed fetch → retry on next call
  }
  return _jspdfLoad;
};
// Warm the chunk shortly after full page load so the first export click in a
// normal session never actually waits on the network.
_afterLoad(() => {
  setTimeout(() => { window._ensureJsPDF().catch(() => {}); }, 3000);
});

// ── Product analytics ──
// PostHog is OPTIONAL and key-gated: with no VITE_POSTHOG_KEY the SDK is never
// initialised and window.posthog stays undefined, so the src/analytics.js
// wrappers no-op. A dev .env.local that omits the key keeps dev traffic out of
// production analytics. Never throws — unlike the Supabase keys above.
//
// Perf pass P.2: the SDK (~350 KB minified, plus the session-recorder chunk it
// pulls and the recording CPU) is dynamic-imported after `load`, off the boot
// path. The pageview is captured at init as before (just dated ~a second
// later); _track calls in that first window no-op, and an early _identifyUser
// stashes window._pendingIdentify for the replay below.
const _phKey = import.meta.env.VITE_POSTHOG_KEY;
if (_phKey) {
  _afterLoad(() => {
    import('posthog-js').then(({ default: posthog }) => {
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
      // Replay an identify that fired before the SDK was ready (analytics.js
      // stashes it when window.posthog is still undefined).
      const pending = window._pendingIdentify;
      if (pending && typeof window._identifyUser === 'function') {
        window._pendingIdentify = null;
        window._identifyUser(pending);
      }
    }).catch(() => { /* analytics is best-effort */ });
  });
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
  /** @type {any[]} */
  const _dl = window.dataLayer = window.dataLayer || [];
  /** @type {(...args: any[]) => void} */
  const _gtag = function () { _dl.push(arguments); };
  window.gtag = _gtag;
  _gtag('js', new Date());
  if (_ga4Id) _gtag('config', _ga4Id, { send_page_view: true });
  if (_googleAdsId) _gtag('config', _googleAdsId);
  // Perf pass P.3: the stub above queues every call in dataLayer, so gtag.js
  // can join after `load` and flush the queue — conversions fired during the
  // boot window (e.g. a signup) are preserved, but the ~130 KB script stops
  // competing with the app's own boot downloads.
  _afterLoad(() => {
    const _s = document.createElement('script');
    _s.async = true;
    _s.src = `https://www.googletagmanager.com/gtag/js?id=${_ga4Id || _googleAdsId}`;
    document.head.appendChild(_s);
  });
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
  // Perf pass P.3: stub installs eagerly (queues init/track calls); only the
  // fbevents.js download itself is deferred past `load`, mirroring gtag above.
  (function (/** @type {any} */ f, /** @type {Document} */ b, /** @type {string} */ e, /** @type {string} */ v) {
    if (f.fbq) return;
    /** @type {any} */
    const n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    _afterLoad(() => {
      const t = b.createElement(e); /** @type {any} */ (t).async = true; /** @type {any} */ (t).src = v;
      const s = b.getElementsByTagName(e)[0];
      s.parentNode?.insertBefore(t, s);
    });
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
