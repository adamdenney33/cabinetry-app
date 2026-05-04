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

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill in values.');
}

window.supabase = { createClient };
window.jspdf = { jsPDF };
window._SBURL = import.meta.env.VITE_SUPABASE_URL;
window._SBKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Dev-only: stash test credentials for window._signInForTesting() (defined in db.js).
// Production builds (`import.meta.env.DEV === false`) leave these undefined.
if (import.meta.env.DEV) {
  window._isDev = true;
  if (import.meta.env.VITE_TEST_EMAIL && import.meta.env.VITE_TEST_PASSWORD) {
    window._TEST_EMAIL = import.meta.env.VITE_TEST_EMAIL;
    window._TEST_PASSWORD = import.meta.env.VITE_TEST_PASSWORD;
  }
}
