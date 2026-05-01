// ProCabinet — ambient type declarations for the classic-script globals.
//
// Each src/*.js file is loaded via its own <script defer> tag in index.html.
// Top-level `let`/`const`/`function` declarations in those files are visible
// to other files through the global lexical environment, but TypeScript by
// default doesn't know about that — it treats each file as an independent
// module. This file declares the cross-file globals so that, as
// `// @ts-nocheck` is peeled back from individual files, references to
// other files' symbols don't trip up the type checker.
//
// Add `declare var` / `declare function` lines here for every global a
// peeled-back file references. Using `any` for now; tighten types in
// later passes as the modules mature.

import type { createClient as SupabaseCreateClient, SupabaseClient } from '@supabase/supabase-js';
import type { jsPDF as JsPDFConstructor } from 'jspdf';

// ── npm-package bridge globals (set by src/main.js) ──
declare global {
  interface Window {
    supabase: { createClient: typeof SupabaseCreateClient };
    jspdf: { jsPDF: typeof JsPDFConstructor };
    /** App-wide currency symbol — assigned by src/settings.js GLOBALS section. */
    currency: string;
    /** App-wide units mode ('imperial' | 'metric') — set by src/settings.js. */
    units: string;
    /** Supabase Auth-state subscription captured in src/db.js for cleanup. */
    _authSub?: unknown;
    /** Various render-state stash slots used by inline-handler `oninput=` etc. */
    _orderFilter?: string;
    _orderSearch?: string;
    _orderSort?: string;
    _quoteFilter?: string;
    _quoteSearch?: string;
    _quoteSort?: string;
    _projFilter?: string;
    _projSearch?: string;
    _projSort?: string;
    _clientSearch?: string;
    _clientSort?: string;
  }
}

export {};
