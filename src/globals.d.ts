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
    /** Sentry SDK bridge — set by src/main.js. Calls no-op until Sentry.init runs (DSN-gated). */
    Sentry: typeof import('@sentry/browser');
    /** PostHog client — set by src/main.js only when VITE_POSTHOG_KEY is present; undefined otherwise. */
    posthog?: typeof import('posthog-js').default;
    /** Supabase URL — set by src/main.js from import.meta.env.VITE_SUPABASE_URL. */
    _SBURL: string;
    /** Supabase publishable (anon) key — set by src/main.js from import.meta.env.VITE_SUPABASE_ANON_KEY. */
    _SBKEY: string;
    /** Dev-mode flag set by src/main.js when import.meta.env.DEV is true. */
    _isDev?: boolean;
    /** Test email for window._signInForTesting (dev-only). */
    _TEST_EMAIL?: string;
    /** Test password for window._signInForTesting (dev-only). */
    _TEST_PASSWORD?: string;
    /** Dev-only: sign in via VITE_TEST_* creds. Defined in src/db.js. */
    _signInForTesting?: () => Promise<{ ok: boolean, error?: string, userId?: string }>;
    /** App-wide currency symbol — assigned by src/settings.js GLOBALS section. */
    currency: string;
    /** App-wide units mode ('imperial' | 'metric') — set by src/settings.js. */
    units: string;
    /** Unit display format — set by src/units.js, managed by src/settings.js. */
    unitFormat: { mode: string; decimals: number; denominator: number };
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
    /** U.9: Set of project IDs with any cut-list rows (sheets or pieces). */
    _projectsWithCutLists?: Set<number>;
    _clientSearch?: string;
    _clientSort?: string;
    /** Stock-panel UI stash slots — used by inline oninput / onchange / onclick handlers. */
    _stockSearch?: string;
    _stockCatFilter?: string;
    _editingStockId?: number | null;
    _editingClientId?: number | null;
    _editingProjectId?: number | null;
    _saveStock?: () => void;
    /** Cabinet-panel UI stash slots. */
    _ratesOpen?: any;
    _cbBlankLine?: any;
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
    /** Strategy C: dirty flags + in-flight save set, watched by beforeunload guard. */
    _cbDirty?: boolean;
    _clDirty?: boolean;
    _qpState?: { dirty?: boolean };
    _opState?: { dirty?: boolean };
    _saveInFlight?: Set<string>;
    /** persist.js — refresh-state helpers. */
    _pcSaveSection?: (name: string) => void;
    _pcLoadSection?: () => string | null;
    _pcSaveOpenQuoteId?: (id: number | null) => void;
    _pcLoadOpenQuoteId?: () => number | null;
    _pcSaveOpenOrderId?: (id: number | null) => void;
    _pcLoadOpenOrderId?: () => number | null;
    _pcSaveOpenCutlistCtx?: (ctx: { projectId?: number | null; cabinetId?: number | null; cutlistId?: number | null; mainView?: string } | null) => void;
    _pcLoadOpenCutlistCtx?: () => { projectId?: number | null; cabinetId?: number | null; cutlistId?: number | null; mainView?: string } | null;
    _pcClearAllOpenKeys?: () => void;
    _restoreAppState?: () => Promise<void>;
    /** Set while restore runs so load functions can skip success toasts. */
    _pcSuppressToasts?: boolean;
  }

  // ── units.js globals ──
  function formatDim(val: number | null | undefined, opts?: { showUnit?: boolean }): string;
  function parseDim(str: string | number): number;
  function convertDim(val: number, from: string, to: string): number;
  function unitLabel(): string;

  // ── ui.js save-status pill global ──
  function _setSaveStatus(
    domain: string,
    state: 'dirty' | 'saving' | 'saved' | 'failed' | 'clean',
    opts?: { retry?: () => void }
  ): void;

  // ── ui.js sidebar resize global ──
  function _initSidebarResize(): void;

  // ── ui.js project-context globals (Strategy 2 + Idea 3) ──
  function _renderProjectHeader(
    domain: string,
    opts: { name: string; exitFn: string; status?: string; summary?: string; clientName?: string }
  ): string;
  function _renderProjectEmpty(
    opts: { title: string; subtitle: string; pickFnName: string; newFnName: string; recentProjects: Array<{ id: number; name: string; updated_at?: string | null }> }
  ): string;

  // ── settings.js unit-format globals ──
  function setUnitFormat(mode: string): void;
  function setUnitDecimals(n: number): void;
  function setUnitDenom(d: number): void;
  function _syncUnitFormatUI(): void;

  // Phase G.2 removed the Element/EventTarget transition augmentations from
  // Phase F. Properties like .value / .checked / .files now require an
  // HTMLInputElement narrowing at the call site; .style / .dataset /
  // .focus() require HTMLElement; .src / .width / .height require the right
  // image/canvas subtype; etc.
}

export {};
