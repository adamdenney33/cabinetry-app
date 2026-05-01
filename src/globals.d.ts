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
    /** Stock-panel UI stash slots — used by inline oninput / onchange / onclick handlers. */
    _stockSearch?: string;
    _stockCatFilter?: string;
    _editingStockId?: number | null;
    _saveStock?: () => void;
    /** Cabinet-panel UI stash slots. */
    _ratesOpen?: any;
    _cqBlankLine?: any;
    _currentProjectId?: number | null;
    saveCurrentProject?: () => void;
    /** Cutlist edge-band drafting stash slots. */
    _ebDraft?: any;
    _ebPieceId?: number;
    _ebBuildSVG?: (...args: any[]) => string;
    _ebBuildTable?: (...args: any[]) => string;
    /** Quotes results stash. */
    results?: any;
    /** Stock items array — exposed on window for some callers. */
    stockItems?: any[];
    saveStockItems?: () => void;
    /** Cutlist clipboard support — assigned in some browsers' paste handler. */
    clipboardData?: any;
  }

  // ── Phase F transition: loosen Element/HTMLElement shape so peeled .js files
  // can do the common DOM-element accesses without per-call casts. The runtime
  // semantics are unchanged. Tighten in a future strict pass.
  interface Element {
    style: CSSStyleDeclaration;
    value: any;
    focus(): void;
    select(): void;
    offsetWidth: number;
    offsetHeight: number;
    dataset: DOMStringMap;
    src: string;
    width: number;
    height: number;
    getContext(contextId: string): any;
    toDataURL(...args: any[]): string;
    files: FileList | null;
    checked: boolean;
    disabled: boolean;
    closest(selector: string): Element | null;
    placeholder: string;
  }

  interface EventTarget {
    files?: FileList | null;
    dataset?: DOMStringMap;
    closest?(selector: string): Element | null;
    value?: any;
    result?: any;
  }
}

export {};
