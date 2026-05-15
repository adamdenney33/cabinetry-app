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
    session_recording: { maskAllInputs: false },
  });
  window.posthog = posthog;
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
