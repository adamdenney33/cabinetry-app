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
    /** jsPDF bridge — set lazily by window._ensureJsPDF() (src/main.js); undefined until the first PDF export (or the post-load warm-up) pulls the chunk. */
    jspdf?: { jsPDF: typeof JsPDFConstructor };
    /** Lazy jsPDF loader (src/main.js): dynamic-imports jspdf + jspdf-autotable on first use, then resolves with (and sets) window.jspdf. */
    _ensureJsPDF: () => Promise<{ jsPDF: typeof JsPDFConstructor }>;
    /** SheetJS bridge — set lazily by window._ensureXLSX() (src/main.js); undefined until the first spreadsheet import or the multi-tab cut-list export pulls the chunk. */
    XLSX?: any;
    /** Lazy SheetJS loader (src/main.js): dynamic-imports xlsx on first use, then resolves with (and sets) window.XLSX. */
    _ensureXLSX: () => Promise<any>;
    /** Lazy pdf.js loader (src/main.js): dynamic-imports pdfjs-dist (worker configured) on first use. Powers the main-window PDF preview's render-to-canvas (doc-preview.js). */
    _ensurePdfJs: () => Promise<any>;
    /** Early boot fetch (src/main.js): in-flight render-gating queries keyed by
     *  table name, started before the classic scripts finish loading, plus the
     *  `userId` they were issued for. Slots are consumed (nulled) at most once
     *  by _earlyBootOr (src/db.js). */
    _earlyBoot?: { userId: string; [table: string]: any };
    /** Session stashed by _identifyUser (src/analytics.js) when PostHog hadn't
     *  loaded yet; replayed and cleared by the lazy PostHog init (src/main.js). */
    _pendingIdentify?: any;
    /** PostHog person-identify (src/analytics.js classic-script global) — read off window by the lazy PostHog init replay. */
    _identifyUser?: (session: any) => void;
    /** Sentry SDK bridge — set by src/main.js. Calls no-op until Sentry.init runs (DSN-gated). */
    Sentry: typeof import('@sentry/browser');
    /** PostHog client — set by src/main.js only when VITE_POSTHOG_KEY is present; undefined otherwise. */
    posthog?: typeof import('posthog-js').default;
    /** Google tag (GA4 + Google Ads) — set by src/main.js only when VITE_GA4_ID or VITE_GOOGLE_ADS_ID is present. */
    gtag?: (...args: any[]) => void;
    /** Google tag dataLayer — populated by gtag.js when loaded. */
    dataLayer?: any[];
    /** Meta Pixel global — set by src/main.js only when VITE_META_PIXEL_ID is present. */
    fbq?: (...args: any[]) => void;
    /** Meta Pixel internal — set by the pixel bootstrap snippet. */
    _fbq?: any;
    /** Refgrow tracking/conversion global — set by scripts.refgrowcdn.com/latest.js. Call as Refgrow(value, type, email) to record an event (e.g. Refgrow(0, 'signup', email)); reads the referral cookie internally. */
    Refgrow?: (value: number, type: string, email: string) => void;
    /** Email of the currently signed-in user — set in src/app.js onAuthStateChange. Used to pre-authenticate the Refgrow affiliate widget (src/affiliates.js). */
    _userEmail?: string;
    /** First-touch attribution blob captured by src/main.js. Returns {} if no UTMs were present at landing. */
    _getAttribution?: () => Record<string, string>;
    /** Google Ads conversion `send_to` string ('AW-XXX/LABEL') — set by src/main.js when VITE_GOOGLE_ADS_CONVERSION_SEND_TO is set. */
    _GADS_CONV?: string;
    /** Google Ads PURCHASE conversion `send_to` — set by src/main.js when VITE_GOOGLE_ADS_PURCHASE_CONVERSION_SEND_TO is set. Fired by _trackPurchaseConversion. */
    _GADS_PURCHASE_CONV?: string;
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
    /** App-wide currency display symbol — assigned by src/settings.js GLOBALS
     *  section. AUD renders as a plain '$' (the 'A' is dropped in-app). */
    currency: string;
    /** Canonical selected currency code (e.g. 'A$' for AUD) — persisted to
     *  localStorage / business_info.default_currency. Set by src/settings.js. */
    currencyCode: string;
    /** App-wide units mode ('imperial' | 'metric') — set by src/settings.js. */
    units: string;
    /** Unit display format — set by src/units.js, managed by src/settings.js. */
    unitFormat: { mode: string; decimals: number; denominator: number };
    /** Supabase Auth-state subscription captured in src/db.js for cleanup. */
    _authSub?: unknown;
    /** Demo (guest) mode — src/db.js serves _db() reads from the seed dataset
     *  and blocks writes. Set by src/app.js and src/walkthrough.js. */
    _demoMode?: boolean;
    /** Sample-data overlay — demo rows merged into a signed-in account's reads
     *  until "Remove demo data" (Dashboard). Decided per account in
     *  _demoOverlayInit (src/demo.js) from onboarding_state.demo_data. */
    _demoOverlay?: boolean;
    /** Feature flag for line-item/template photos (Phase 2). Off until the line_photos migration is applied. Set in src/line-photos.js. */
    _FEAT_LINE_PHOTOS?: boolean;
    /** True while the guided walkthrough overlay is on screen (src/walkthrough.js). */
    _wtActive?: boolean;
    /** Pricing-tier deep-link from the landing page (/?plan=…). Stashed by the
     *  INIT param handler in src/app.js, consumed once the auth state is known
     *  (signed-in → Stripe Checkout, guest → sign-up then retry after auth). */
    _pendingPlan?: 'monthly' | 'annual' | 'founder' | null;
    /** True for phones/tablets — touch-primary, no hover. Defined in src/mobile-notice.js. */
    _pcIsTouchDevice?: () => boolean;
    /** Once-per-session mobile welcome notice. Defined in src/mobile-notice.js. */
    _pcMaybeShowMobileNotice?: () => void;
    /** Mobile single-column "one pane at a time" controls (src/mobile-nav.js).
     *  `data-mv` on <body> is "list" | "editor"; these flip it and no-op on desktop. */
    _mvSet?: (view: 'list' | 'editor') => void;
    _mvIsMobile?: () => boolean;
    _mvShowEditor?: () => void;
    _mvShowList?: () => void;
    /** Various render-state stash slots used by inline-handler `oninput=` etc. */
    _orderFilter?: string;
    _orderSearch?: string;
    _orderSort?: string;
    _quoteFilter?: string;
    _quoteSearch?: string;
    _quoteSort?: string;
    /** Supabase realtime channel for live-link status sync (app.js). */
    _rtChannel?: any;
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
    /** Shared ResizeObserver driving the stock-table edge-fade affordance. */
    _stockFadeObs?: ResizeObserver;
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
    /** Strategy C: set of in-flight debounced-autosave keys, watched by the
     *  beforeunload guard. (The dirty flags _cbDirty/_clDirty/_qpState/_opState
     *  are bare top-level globals in their owning files, not window props.) */
    _saveInFlight?: Set<string>;
    /** index.html head stub — nav tab tapped before the deferred scripts
     *  executed; replayed (then cleared) by restoreAppState. */
    _preBootSection?: string | null;
    /** index.html head stub — fades out the #boot-loader overlay. Called once
     *  boot data has rendered (signed-in) or the auth screen shows. */
    _hideBootLoader: () => void;
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
  function dimDisplayFromMM(mm: number | string | null | undefined, opts?: { showUnit?: boolean }): string;
  function dimInputToMM(str: string | number): number;
  function dimsLabelFromMM(w: number | string | null | undefined, h: number | string | null | undefined, d: number | string | null | undefined): string;

  // ── db.js auth-token cache global ──
  /** Update the in-memory bearer token used by _db()'s raw-fetch layer.
   *  Called from src/app.js's onAuthStateChange on every auth event. */
  function _setAccessToken(t: string | null): void;

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

  // ── analytics.js globals ──
  function _track(event: string, props?: Record<string, any>): void;
  function _identifyUser(session: any): void;
  function _resetAnalytics(): void;
  /** Fire ad-platform conversion pixels (Meta Pixel + Google Ads + GA4) at signup. Pass the Supabase user id so the Meta event dedupes against the server-side CAPI event (`signup-<user_id>`). No-ops if pixels are disabled. */
  function _trackSignupConversion(userId?: string | null): void;
  /** Read a browser cookie by name, '' when absent. Used to forward Meta's _fbc/_fbp cookies to the server-side CAPI for match quality. Defined in src/analytics.js. */
  function _readCookie(name: string): string;
  /** Fire ad-platform purchase conversions (GA4 purchase + Google Ads) on a successful Pro checkout. Meta Subscribe/Purchase fires server-side via CAPI from stripe-webhook. No-ops if pixels are disabled. */
  function _trackPurchaseConversion(plan: string | null | undefined): void;

  // ── accounting.js globals (QuickBooks/Xero: order→invoice, quote→estimate) ──
  /** Hydrate the user's accounting connections + order/quote → external-doc links. Called from loadAllData. */
  function loadAccountingConnections(): Promise<void>;
  /** Toast + refresh on return from the OAuth consent screen (?accounting=). Called once on load. */
  function handleAccountingReturn(): void;
  /** HTML for the order card: "Synced" chip(s) + the Sync button. Rendered by src/orders.js. */
  function _accountingOrderFooter(orderId: number): string;
  /** HTML for the quote card: "Synced" chip(s) + the Sync button. Rendered by src/quotes.js. */
  function _accountingQuoteFooter(quoteId: number): string;
  /** Quote-card Sync ▾ entry point (routes by connected providers, pushes a draft estimate). */
  function _accountingSyncMenuQuote(quoteId: number): void;
  /** Open the Pro-gated "Accounting integrations" connect/disconnect popup. */
  function _openAccountingPopup(): void;

  // ── line-photos.js globals (Phase 2: line-item & cabinet-template photos) ──
  /** Hydrate line/template photos from public.line_photos. Called from loadAllData. No-op while window._FEAT_LINE_PHOTOS is false. */
  function loadLinePhotos(): Promise<void>;
  /** Open a popup to add/manage a line's or template's photos (reusable editor hook). */
  function _openLinePhotosPopup(kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number, title?: string): void;
  /** Handle a multi-file <input> for a line/template's photos: upload to storage + insert link rows. */
  function _addLinePhotos(kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number, input: HTMLInputElement): Promise<void>;
  /** Remove one photo (row + in-memory cache). */
  function _removeLinePhoto(kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number, id: number): Promise<void>;
  /** Editor strip: thumbnails + an add-photos button. Returns '' while the feature flag is off. */
  function _linePhotoStrip(kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number): string;
  /** Display thumbnails for cards / the live page. Returns '' while off or when there are none. */
  function _linePhotoThumbs(kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number, max?: number): string;
  /** Public photo URLs for a line — used by the live customer page renderer. */
  function _linePhotoUrls(kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number): (string | null)[];
  /** Fetch a photo and return a dataURL for jsPDF.addImage. */
  function _linePhotoDataUrl(url: string): Promise<string | null>;
  /** Raw-fetch upload of one photo to the business-assets bucket (in-memory token). */
  function _uploadLinePhotoAsset(uid: string, kind: 'quote_line' | 'order_line' | 'cabinet_template', ownerId: number, file: File): Promise<{ path: string | null, url: string | null, error: { message: string } | null }>;

  // ── connect.js globals (Stripe Connect payouts, business side) ──
  /** Hydrate the business's Stripe Connect status on boot (best-effort). */
  function loadConnectStatus(): Promise<void>;
  /** Start/resume Stripe Express onboarding (redirects to Stripe). */
  function startConnectOnboarding(): Promise<void>;
  /** Handle the ?connect=return redirect back from Stripe. */
  function handleConnectReturn(): void;
  /** Open the "Card payments" connect/manage popup. */
  function _openConnectPopup(): void;

  // ── share.js globals (share a live quote) ──
  /** Open the Share panel for a quote (settings + per-line flags + link). */
  function _openSharePanel(quoteId: number): Promise<void>;
  /** Mint token + snapshot customer_price + write share_settings, then show the link. */
  function _generateShareLink(quoteId: number): Promise<void>;
  /** Build the public /q link for a share token. */
  function _shareLink(token: string): string;
  /** Open the live customer page for an order (reuse the deal's /q link). */
  function _openLiveOrderPage(orderId: number): void;

  // ── clients-chat.js globals (business-side customer chat) ──
  /** Hydrate every client's conversation on boot (best-effort). */
  function loadAllClientMessages(): Promise<void>;
  /** Count unread (customer→business) messages for a client. */
  function _clientUnreadCount(clientId: number): number;
  /** Open the client's chat popup (read + reply). */
  function _openClientChat(clientId: number): Promise<void>;
  /** Send a business reply to the client. */
  function _sendClientMessage(clientId: number): Promise<void>;
  /** Toggle the in-card messages thread on an order card. */
  function _toggleOrderThread(orderId: number): Promise<void>;
  /** Render the in-card order thread (bubbles + composer). */
  function _orderThreadInner(orderId: number, clientId: number): string;
  /** Send a business reply from an order card (tags order_id). */
  function _sendOrderMessage(orderId: number): Promise<void>;
  /** Toggle the in-card messages thread on a client card. */
  function _toggleClientThread(clientId: number): Promise<void>;
  /** Render the in-card client thread (bubbles + composer). */
  function _clientThreadInner(clientId: number): string;
  /** Send a business reply from a client card. */
  function _sendClientThreadMessage(clientId: number): Promise<void>;

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
