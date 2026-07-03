// ProCabinet — Guided walkthrough (O.2 onboarding tour).
//
// Classic <script defer>, loaded LAST so every section-switch / panel-render
// function it drives already exists. A "spotlight" tour: dims the screen,
// cuts a highlight around one real DOM element, anchors a tooltip beside it.
//
// Runs on every device. On a narrow viewport (≤760px, the single-column
// mobile layout) each step also picks the pane its target lives in via
// body[data-mv] (step.mv, applied through mobile-nav.js), the tooltip pins
// sheet-style to the top/bottom screen edge, and swipe left/right steps the
// tour. On touch devices the animated pointer is a fingertip tap-dot instead
// of the desktop arrow cursor, and keyboard copy swaps to touch copy.
//
// The tour always runs over the demo seed (src/demo.js): for a guest demo
// mode is already on; for a signed-in user _wtStart flips it on for the
// tour's duration and _wtClose restores their real data. Dismissal persists
// to localStorage['pc_wt_state'] (and business_info when signed in), so a
// first-time visitor sees the full tour once. A returning free user instead
// gets just the final Pro CTA, once per browser session — gated by the
// sessionStorage key 'pc_wt_session_cta'.
//
// Public surface (window globals — classic-script top-level functions):
//   _wtStart(opts)      — begin the tour (async; opts.force kept for the
//                         Help re-trigger).
//   _wtClose(reason)    — tear down. reason: 'completed' | 'skipped'.
//   _wtMaybeAutoStart() — entry gate; auto-shows the full tour on first run,
//                         then the once-per-session Pro CTA for free users.
//   _wtStartCta()       — open just the Pro CTA on demand (the account
//                         dropdown's "Upgrade to Pro" button); no session gate.
//
// Cross-file globals used: switchSection (settings.js), switchCabTab /
// switchCBMainView (cabinet-render.js). Reached via the `_wtW` any-cast so
// the type-checker doesn't need ambient decls for them.

/** Walkthrough content version. Bump when steps change materially — drives
 *  the version-gated re-show in _wtMaybeAutoStart (M7).
 *  NOTE: the 2026-06 trim (26 → 10 steps) deliberately did NOT bump this:
 *  nothing new to teach, and re-showing a tour to users who already dismissed
 *  it is exactly the friction the trim removes. */
const WT_VERSION = 4;

/** @type {any} window, any-typed so cross-file globals resolve without decls. */
const _wtW = /** @type {any} */ (window);

/** Narrow single-column viewport — the mobile pane layout (mobile-nav.js).
 *  Drives pane selection, sheet-style tooltip placement and narrow copy. */
function _wtIsNarrow() {
  return typeof _wtW._mvIsMobile === 'function'
    ? !!_wtW._mvIsMobile()
    : window.matchMedia('(max-width: 760px)').matches;
}

/** Touch-primary device (phone/tablet) — no keyboard, no hover. Drives the
 *  tap-dot pointer and touch copy; independent of viewport width (an iPad
 *  keeps the desktop two-pane layout but still gets touch affordances). */
function _wtIsTouch() {
  return typeof _wtW._pcIsTouchDevice === 'function'
    ? !!_wtW._pcIsTouchDevice()
    : window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/**
 * @typedef {Object} WtStep
 * @property {'center'|'spot'} type
 * @property {string} [phase]          Stage label shown in the step header.
 * @property {string} [section]        switchSection() target before render.
 * @property {string} [subtab]         switchCabTab() target ('builder'|'rates').
 * @property {string} [cbView]         switchCBMainView() target ('results'|'library').
 * @property {string} [clView]         switchCLMainView() target ('library'|'layout').
 * @property {boolean} [openSettings]  Open the header Settings dropdown for this step.
 * @property {boolean} [openAccount]   Open the header Account dropdown for this step.
 * @property {boolean} [openHelp]      Open the header Help dropdown for this step.
 * @property {boolean} [openFeatures]  Open the header New-features dropdown for this step.
 * @property {string} [target]         CSS selector to spotlight (spot steps).
 * @property {string} [preClickCard]   CSS selector — animate cursor to and click this before the step shows.
 * @property {boolean} [clOptimize]    After the pre-click opens a cut list, run the optimiser once its rows load — switches the right pane to Cut Layout with the nested sheets on screen.
 * @property {'list'|'editor'} [mv]    Mobile pane (body[data-mv]) holding the step's target in the ≤760px single-column layout. Applied after preClickCard.
 * @property {'right'|'left'|'top'|'bottom'} [position]  Preferred tooltip side.
 * @property {string} [icon]           Emoji for centred steps.
 * @property {string} title
 * @property {string} [titleHtml]      Raw HTML override for title (welcome preview).
 * @property {string} [body]            May contain authored <span class="wt-hi"> markup. Omitted on the final CTA step.
 * @property {string} [bodyTouch]       Body override on touch devices (keyboard hints don't apply).
 * @property {string} [bodyNarrow]      Body override on narrow viewports (what's on screen differs, e.g. schedule agenda vs gantt grid). Wins over bodyTouch.
 * @property {string} [nextLabel]
 * @property {string[]} [flow]         Welcome-step flow chips.
 * @property {string} [preview]        Welcome preview graphic type ('gantt').
 * @property {boolean} [showPricing]   Final CTA — render the pricing block.
 */

/** @type {WtStep[]} */
const _wtSteps = [
  // 0 — Welcome
  {
    type: 'center', section: 'dashboard', mv: 'list', preview: 'gantt',
    title: 'See the full workflow in action',
    titleHtml: 'See the full <span class="wt-hi">workflow</span> in action',
    body: 'A quick tour of the highlights — set your rates once, price a cabinet, send the quote. We\'ve loaded a sample project so you can see it working — use the <span class="wt-hi">arrow keys on your keyboard</span> to step through it.',
    bodyTouch: 'A quick tour of the highlights — set your rates once, price a cabinet, send the quote. We\'ve loaded a sample project so you can see it working — <span class="wt-hi">swipe left or tap Next</span> to step through it.',
    nextLabel: 'Start the tour →'
  },

  // 1 — Tab bar
  {
    type: 'spot', phase: 'Navigation', section: 'dashboard', mv: 'list',
    target: '.nav-tabs', position: 'bottom',
    title: 'Navigate between sections',
    body: 'ProCabinet is organised into <span class="wt-hi">8 tabs</span>, one per section of your workflow — quote, cut, schedule and bill, one click apart. The tour hits the key ones.',
    bodyTouch: 'ProCabinet is organised into <span class="wt-hi">8 tabs</span>, one per section of your workflow — quote, cut, schedule and bill, one tap apart. The tour hits the key ones.'
  },

  // F (tour trim): 26 → 10 steps. Cut: Clients ×2, Quote list, Orders ×2,
  // Stock ×2, Cabinet Library, Cut List Library + Layout, Schedule queue,
  // Dashboard quick-actions, Toolbar ×4 (settings, not selling). What's left
  // proves "minutes, not hours": rates → builder → quote → cut list →
  // schedule → dashboard → plans.

  // ── Cabinet — the aha: set rates once, every cabinet prices itself ──────
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results', mv: 'list',
    preClickCard: '#cb-results .quote-card',
    target: '#cb-results', position: 'left',
    title: 'Quote Builder',
    body: 'Pick a quote and its cabinets load here, <span class="wt-hi">priced live</span> — material, labour, markup and tax calculated line by line as you design.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results', subtab: 'builder', mv: 'editor',
    preClickCard: '#cb-results .cb-cab-card',
    target: '#cb-sidebar-builder', position: 'right',
    title: 'Cabinet Builder',
    body: 'Open any cabinet to set its full spec — <span class="wt-hi">carcass size, doors, drawers, shelves and hardware</span>. Labour pricing scales with size, so every cabinet is costed accurately.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results', subtab: 'rates', mv: 'editor',
    target: '#cb-sidebar-builder', position: 'right',
    title: 'My Rates',
    body: 'Set your <span class="wt-hi">hourly labour rate, material markup, edge-banding cost and contingency</span> once — every cabinet prices itself from these, no spreadsheet formulas to maintain.'
  },
  // ── Quote ────────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Quote', section: 'quote', mv: 'editor',
    preClickCard: '.quote-card',
    target: '#quote-sidebar', position: 'right',
    title: 'Quote editor',
    body: 'Add line items: cabinets from the builder, labour, materials or custom lines. ProCabinet calculates <span class="wt-hi">subtotals, tax and the grand total</span> live — then export a PDF or send the customer a live link.'
  },

  // ── Cut List ──────────────────────────────────────────────────────────────
  // The section gate lands on the Cut List Library; pre-clicking a library
  // card opens a real demo cut list ([onclick] skips the grid's synchronous
  // "Loading…" / empty-state placeholder divs), then clOptimize runs the
  // optimiser over it once its rows load — so the spotlit pane shows a real
  // nested cut layout, not the "Ready to Optimize" empty state.
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist', mv: 'list',
    preClickCard: '#cl-lib-grid > div[onclick]',
    clOptimize: true,
    target: '#cl-view-layout', position: 'left',
    title: 'Optimised cut layout',
    body: 'Add your sheets and the pieces to cut on the left, hit <span class="wt-hi">Optimise</span>, and ProCabinet nests everything for <span class="wt-hi">minimum waste</span> — ready to print or export as PDF or DXF.',
    bodyNarrow: 'Add your sheets and the pieces to cut, hit <span class="wt-hi">Optimise</span>, and ProCabinet nests everything for <span class="wt-hi">minimum waste</span> — ready to print or export as PDF or DXF.'
  },

  // ── Schedule ─────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Schedule', section: 'schedule', mv: 'list',
    target: '#schedule-main', position: 'top',
    title: 'Gantt calendar',
    body: 'Orders land on the calendar automatically, in priority order — each coloured bar spans its production days. The scheduler <span class="wt-hi">avoids weekends and respects your daily capacity</span>.',
    bodyNarrow: 'Orders land on the schedule automatically, in priority order — each job shows its <span class="wt-hi">start and delivery dates</span>, and the Calendar tab has the full timeline. The scheduler <span class="wt-hi">avoids weekends and respects your daily capacity</span>.'
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Dashboard', section: 'dashboard', mv: 'list',
    target: '#dashboard-main', position: 'top',
    title: 'Live overview',
    body: 'Active orders with due-date alerts, your most recent quotes, low-stock warnings and this week\'s schedule — <span class="wt-hi">the full picture without opening a single tab</span>.'
  },
  // Pro CTA — the four-tier plan picker (rendered by _wtCtaHTML). Dropped by
  // _wtLastIdx for anyone with full Pro access (paying or in the automatic
  // trial — i.e. every fresh signup); their tour ends on the step before this.
  {
    type: 'center', section: 'dashboard', mv: 'list',
    title: 'Choose your plan',
    showPricing: true
  }
];

// ── module state ──
/** @type {boolean} */
let _wtActive = false;
/** @type {number} */
let _wtCurrent = 0;
/** Navigation direction of the last step change: 1 forward, -1 back. Used to
 *  skip an unreachable step in the right direction. */
let _wtDir = 1;
/** True when the tour flipped demo mode on for a signed-in user (B2); _wtClose
 *  restores their real data. */
let _wtTempDemo = false;
/** @type {HTMLElement | null} */
let _wtOverlay = null;
/** @type {number | ReturnType<typeof setTimeout>} */
let _wtResizeTimer = 0;
/** @type {HTMLElement | null} */
let _wtCursorEl = null;
/** Founder seats remaining for the final CTA, or null until the public
 *  `founder_seats_taken` RPC resolves. @type {number | null} */
let _wtFounderSeatsLeft = null;
/** True while the overlay is showing ONLY the final Pro CTA — the
 *  once-per-browser-session reminder for a returning free user, not the full
 *  tour. Suppresses the demo-mode borrow, section switches and first-run
 *  dismissal persistence the full tour performs. */
let _wtCtaOnly = false;
/** True when the current tour was auto-started by _wtMaybeAutoStart (first
 *  run / version re-show) rather than deliberately opened from Help. Drives
 *  the skip → plan-picker hand-off in _wtSkip (F.3). */
let _wtAutoRun = false;
/** "Nothing to sell this user" — _hasProAccess() (paying OR in the automatic
 *  trial) snapshotted by _wtRunStart BEFORE the tour borrows demo mode: the
 *  demo seed has no subscription rows, so live isPro()/_hasProAccess() reads
 *  are false mid-tour even for paying users. Drops the trailing plan-picker
 *  step (_wtLastIdx) and the skip → plan-picker hand-off (_wtSkip). */
let _wtNoUpsell = false;

/** @param {string} s @returns {string} */
function _wtEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Step body resolved for the current device — narrow/touch overrides first.
 *  @param {WtStep} step @returns {string} */
function _wtBody(step) {
  if (step.bodyNarrow && _wtIsNarrow()) return step.bodyNarrow;
  if (step.bodyTouch && _wtIsTouch()) return step.bodyTouch;
  return step.body || '';
}

// ── animated cursor ──

// Tip of the cursor SVG is at (4, 3) within the 20×26 viewBox; the touch
// tap-dot's "tip" is its centre (radius 14 of the 28px circle).
const _WT_CUR_TIP_X = 4, _WT_CUR_TIP_Y = 3;
const _WT_DOT_R = 14;
let _wtCurTipX = _WT_CUR_TIP_X, _wtCurTipY = _WT_CUR_TIP_Y;

function _wtInitCursor() {
  if (_wtCursorEl) return;
  const el = document.createElement('div');
  el.id = 'wt-cursor';
  if (_wtIsTouch()) {
    // A mouse arrow means nothing on a phone — show a fingertip tap-dot.
    el.classList.add('wt-cur-touch');
    el.innerHTML = '<div class="wt-tap-dot"></div>';
    _wtCurTipX = _WT_DOT_R; _wtCurTipY = _WT_DOT_R;
  } else {
    el.innerHTML = '<svg width="20" height="26" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 3L4 21L9 16L12 24L14.5 23L11.5 15L18 15Z" fill="white" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      '</svg>';
    _wtCurTipX = _WT_CUR_TIP_X; _wtCurTipY = _WT_CUR_TIP_Y;
  }
  // Start at viewport centre so the first movement animates from mid-screen.
  el.style.left = (window.innerWidth  / 2 - _wtCurTipX) + 'px';
  el.style.top  = (window.innerHeight / 2 - _wtCurTipY) + 'px';
  document.body.appendChild(el);
  _wtCursorEl = el;
}

function _wtDestroyCursor() {
  if (_wtCursorEl) { _wtCursorEl.remove(); _wtCursorEl = null; }
}

/**
 * Animate the cursor tip to (cx, cy) and pulse a click when it arrives.
 * @param {number} cx  @param {number} cy
 */
function _wtCursorMoveTo(cx, cy) {
  const el = _wtCursorEl;
  if (!el) return;
  el.classList.add('wt-cur-show');
  el.classList.remove('wt-cur-click');
  void el.offsetWidth; // flush so remove-then-add re-triggers any in-flight animation
  el.style.left = (cx - _wtCurTipX) + 'px';
  el.style.top  = (cy - _wtCurTipY) + 'px';
  // Click pulse fires after the 0.5 s travel transition.
  setTimeout(() => {
    if (!_wtCursorEl) return;
    _wtCursorEl.classList.add('wt-cur-click');
    setTimeout(() => _wtCursorEl && _wtCursorEl.classList.remove('wt-cur-click'), 260);
  }, 490);
}

// ── section gating ──

/** Reset a section's sidebar to its gated (no-record-selected) state so the
 *  walkthrough starts each section clean before the card-click animation opens
 *  the editing workflow. Safe to call even when no record is currently open.
 *  @param {string} section */
function _wtGateSection(section) {
  try {
    if (section === 'clients') {
      if (typeof cancelClientEdit === 'function') cancelClientEdit();
      if (typeof _renderClientsSidebarGate === 'function') _renderClientsSidebarGate();
    }
    if (section === 'stock') {
      if (typeof cancelStockEdit === 'function') cancelStockEdit();
    }
    if (section === 'cabinet' && typeof _wtW._exitClient_cabinet === 'function') {
      _wtW._exitClient_cabinet();
    }
    if (section === 'cutlist') {
      // Land on the Cut List Library. The "Optimised cut layout" step then
      // opens a cut list by pre-clicking a library card and runs the
      // optimiser over it (clOptimize), so the spotlit pane shows a real
      // nested layout rather than the no-cut-list-open gate.
      if (typeof _wtW.switchCLMainView === 'function') _wtW.switchCLMainView('library');
    }
    if (section === 'orders' && typeof _opState !== 'undefined') {
      _opState.orderId = null; _opState.clientId = null;
      _opState.lines = []; _opState.dirty = false; _opState.startingNew = false;
      if (typeof renderOrderEditor === 'function') renderOrderEditor();
    }
    if (section === 'quote' && typeof _qpState !== 'undefined') {
      _qpState.quoteId = null; _qpState.clientId = null;
      _qpState.lines = []; _qpState.dirty = false; _qpState.startingNew = false;
      if (typeof renderQuoteEditor === 'function') renderQuoteEditor();
    }
  } catch (e) { console.warn('[walkthrough] gate failed', e); }
}

// ── lifecycle ──

/**
 * Begin the walkthrough. The tour always runs over the demo seed: for a guest
 * demo mode is already on; for a signed-in user it is flipped on for the
 * tour's duration (B2) and _wtClose restores their real data afterwards.
 * No-ops if a tour is already on screen (guards the hourly TOKEN_REFRESHED
 * auth event from restarting a tour mid-flight).
 * @param {{force?: boolean, auto?: boolean}} [opts]  auto: set by
 *   _wtMaybeAutoStart so _wtSkip can tell a first-run tour from a Help
 *   re-trigger (F.3).
 */
async function _wtStart(opts) {
  if (_wtActive) return;
  _wtAutoRun = !!(opts && opts.auto);
  const needTempDemo = !!_userId && !window._demoMode;
  if (needTempDemo) {
    const w = _wtW;
    // Dirty flags are bare top-level globals, not window props (see app.js's
    // beforeunload guard); read them directly so the confirm actually fires.
    const dirty = !!_cbDirty || !!_clDirty
      || !!(_qpState && _qpState.dirty) || !!(_opState && _opState.dirty);
    if (dirty && typeof w._confirm === 'function') {
      w._confirm('Start the walkthrough? Unsaved changes on the current screen will be discarded.',
        () => { _wtRunStart(true); });
      return;
    }
    return _wtRunStart(true);
  }
  return _wtRunStart(false);
}

/**
 * Load the demo seed (when borrowing demo mode for a signed-in user) and open
 * the tour overlay.
 * @param {boolean} tempDemo
 */
async function _wtRunStart(tempDemo) {
  if (_wtActive) return;
  // Decide the upsell question NOW, over the user's real subscription state —
  // after the demo-mode flip below, isPro()/_hasProAccess() read demo data.
  _wtNoUpsell = typeof _hasProAccess === 'function'
    ? _hasProAccess()
    : (typeof isPro === 'function' && isPro());
  if (tempDemo) {
    _wtTempDemo = true;
    window._demoMode = true;
    try {
      if (typeof loadAllData === 'function') await loadAllData();
      if (typeof _loadCabinetTemplatesFromDB === 'function') await _loadCabinetTemplatesFromDB();
    } catch (e) { console.warn('[walkthrough] demo-seed load failed', e); }
    if (_wtActive) return; // a concurrent start already opened the tour
  }
  _wtActive = true;
  _wtW._wtActive = true; // window-visible so other modules can suspend autosaves
  _wtFetchFounderSeats(); // best-effort — populates the final CTA's seat counter
  _wtCurrent = 0;
  _wtDir = 1;
  const ov = document.createElement('div');
  ov.id = 'wt-overlay';
  ov.addEventListener('click', _wtOverlayClick);
  ov.addEventListener('touchstart', _wtTouchStart, { passive: true });
  ov.addEventListener('touchend', _wtTouchEnd, { passive: true });
  document.body.appendChild(ov);
  _wtOverlay = ov;
  document.addEventListener('keydown', _wtKeydown, true);
  window.addEventListener('resize', _wtOnResize);
  _wtInitCursor();
  _wtRender(0);
}

/**
 * Open the overlay showing ONLY the final Pro CTA. Used two ways: as the
 * once-per-browser-session reminder for a returning free user (via
 * _wtMaybeShowSessionCta), and as the on-demand opener behind the account
 * dropdown's "Upgrade to Pro" button. Unlike _wtRunStart it never borrows
 * demo mode and never switches section — the CTA is a centred modal over the
 * user's own live screen. No-ops if a tour/overlay is already up.
 */
function _wtStartCta() {
  if (_wtActive) return;
  const ctaIdx = _wtSteps.findIndex(s => s.showPricing);
  if (ctaIdx < 0) return;
  // Showing pricing is this overlay's whole job (explicit Upgrade click /
  // post-trial reminder) — clear any stale no-upsell snapshot so the step
  // counter and navigation treat the CTA step as reachable.
  _wtNoUpsell = false;
  _wtActive = true;
  _wtW._wtActive = true;
  _wtCtaOnly = true;
  _wtFetchFounderSeats(); // best-effort — populates the CTA's seat counter
  _wtCurrent = ctaIdx;
  _wtDir = 1;
  const ov = document.createElement('div');
  ov.id = 'wt-overlay';
  ov.addEventListener('click', _wtOverlayClick);
  ov.addEventListener('touchstart', _wtTouchStart, { passive: true });
  ov.addEventListener('touchend', _wtTouchEnd, { passive: true });
  document.body.appendChild(ov);
  _wtOverlay = ov;
  document.addEventListener('keydown', _wtKeydown, true);
  window.addEventListener('resize', _wtOnResize);
  _wtRender(ctaIdx);
}

/**
 * Tear the tour down, persist the dismissal, and — if the tour borrowed demo
 * mode for a signed-in user — restore their real data. Idempotent.
 * @param {'completed'|'skipped'} reason
 */
async function _wtClose(reason) {
  if (!_wtActive) return;
  _wtActive = false;
  _wtW._wtActive = false;
  document.removeEventListener('keydown', _wtKeydown, true);
  window.removeEventListener('resize', _wtOnResize);
  if (_wtResizeTimer) { clearTimeout(_wtResizeTimer); _wtResizeTimer = 0; }
  const ctaOnly = _wtCtaOnly;
  _wtCtaOnly = false;
  // The standalone session CTA isn't the first-run tour — it has its own
  // sessionStorage gate, so it skips the durable dismissal persistence.
  if (!ctaOnly) {
    // Persist dismissal — localStorage (the durable first-run gate, works for
    // guests) and business_info when signed in. _wtPersistState handles both.
    _wtPersistState({
      version: WT_VERSION,
      dismissed_at: new Date().toISOString(),
      completed: reason === 'completed',
    });
    // F.4: pc_hide_guide is deliberately NOT set here any more — the dashboard
    // "Getting Started" card is the action prompt toward a first real quote,
    // it only renders while the app is empty, and it has its own dismiss ×.
    // Hiding it on tour completion stripped guidance from exactly the users
    // with an empty app.
    // The full tour ends on the CTA, so it satisfies the once-per-session
    // reminder — don't double up with a standalone CTA on a same-session
    // reload, and stamp the 7-day cadence clock too (F: CTA cadence).
    try { sessionStorage.setItem('pc_wt_session_cta', '1'); } catch (e) { void e; }
    try { localStorage.setItem('pc_wt_cta_last', String(Date.now())); } catch (e) { void e; }
  }
  // Strip the tour chrome NOW. The demo→real reload below can take seconds
  // on a phone connection, and a frozen spotlight/tooltip after tapping
  // Finish reads as a hang. The dim mask stays up with a small loading pill,
  // so demo content never flashes and interaction stays blocked until the
  // user's real data is back.
  if (_wtTempDemo && _wtOverlay) {
    _wtOverlay.innerHTML = '<div class="wt-mask"></div><div class="wt-restore">Loading your data…</div>';
  }
  _wtDestroyCursor();
  const sd = document.getElementById('settings-dropdown');
  if (sd) sd.classList.remove('open');
  const ad = document.getElementById('account-dropdown');
  if (ad) ad.classList.remove('open');
  const hd = document.getElementById('help-dropdown');
  if (hd) hd.classList.remove('open');
  const fd = document.getElementById('features-dropdown');
  if (fd) fd.classList.remove('open');
  // Restore the signed-in user's real data before dropping the mask. The wait
  // is capped — a stalled fetch on a flaky connection must not trap the user
  // under the overlay; a late response still renders when it lands.
  if (_wtTempDemo) {
    _wtTempDemo = false;
    window._demoMode = false;
    try {
      await Promise.race([
        (async () => {
          if (typeof loadAllData === 'function') await loadAllData();
          if (typeof _loadCabinetTemplatesFromDB === 'function') await _loadCabinetTemplatesFromDB();
        })(),
        new Promise((res) => setTimeout(res, 12000)),
      ]);
    } catch (e) { console.warn('[walkthrough] real-data restore failed', e); }
    // The tour pre-clicked a demo cut list open and optimised it; that lives
    // in cutlist.js module state (pieces/sheets/results) which loadAllData
    // doesn't touch. Exit library-edit so the user's next visit to the Cut
    // List tab doesn't show demo parts and a demo layout over their account.
    try {
      if (typeof _wtW._clExitLibraryEdit === 'function') _wtW._clExitLibraryEdit();
    } catch (e) { console.warn('[walkthrough] cutlist reset failed', e); }
  }
  // Teardown — every handle cleared so a double call or a stale callback no-ops.
  if (_wtOverlay) { _wtOverlay.remove(); _wtOverlay = null; }
  // Land on a clean Dashboard — but the CTA-only overlay sits over the user's
  // own restored screen, so leave them wherever they are.
  if (!ctaOnly && typeof _wtW.switchSection === 'function') {
    try { _wtW.switchSection('dashboard'); } catch (e) { void e; }
  }
}

/**
 * Merge `patch` into the onboarding state and persist it. localStorage is the
 * durable first-run gate for everyone (including guests); business_info mirrors
 * it for a signed-in user across devices. Fire-and-forget.
 * @param {Record<string, any>} patch
 */
async function _wtPersistState(patch) {
  const next = Object.assign({}, _wtW._onboardingState || {}, patch);
  _wtW._onboardingState = next;
  // Stamp the owning account into the browser copy so _wtMaybeAutoStart can
  // tell this account's dismissal from another account's (or a guest's).
  try {
    localStorage.setItem('pc_wt_state',
      JSON.stringify(_userId ? { ...next, user_id: _userId } : next));
  } catch (e) { void e; }
  if (!_userId || typeof _db !== 'function') return;
  const uid = _userId;
  try {
    await _db('business_info').upsert(
      [{ user_id: uid, onboarding_state: next, updated_at: new Date().toISOString() }],
      { onConflict: 'user_id' }
    );
  } catch (e) {
    console.warn('[walkthrough] persist failed', e);
  }
}

// ── navigation ──

/**
 * Last step index the guided tour advances to. The trailing Pro CTA
 * ("Choose your plan") is dropped for anyone with full Pro access
 * (_hasProAccess: paying OR inside the automatic 14-day trial — i.e. every
 * fresh signup) — nothing to sell them yet, so their tour ends one step
 * earlier, on the final content step. Pricing waits until the trial lapses:
 * the trial-ending banner (stripe.js) and the weekly session CTA own that.
 * @returns {number}
 */
function _wtLastIdx() {
  const last = _wtSteps.length - 1;
  return (_wtNoUpsell && _wtSteps[last] && _wtSteps[last].showPricing) ? last - 1 : last;
}

function _wtNext() {
  // The standalone session CTA is a single step — advancing just closes it.
  if (_wtCtaOnly) { _wtClose('completed'); return; }
  if (_wtCurrent < _wtLastIdx()) _wtRender(_wtCurrent + 1);
  else _wtClose('completed');
}
function _wtBack() {
  // No earlier step exists for the standalone session CTA — stepping back
  // would drop the user into the middle of the full tour.
  if (_wtCtaOnly) return;
  if (_wtCurrent > 0) _wtRender(_wtCurrent - 1);
}
/**
 * Skip handler (F.3). Closes the tour, then — for the auto-run first tour
 * only — hands off to the standalone plan-picker CTA, so post-trial skippers
 * still see pricing exactly once. The hand-off never fires for: the CTA-only
 * overlay (Escape there must not reopen it), anyone with full Pro access
 * (paying or in-trial — nothing to sell yet), a deliberate Help re-trigger,
 * or a skip pressed when the pricing step is already on screen.
 */
function _wtSkip() {
  const onPricingStep = !!(_wtSteps[_wtCurrent] && _wtSteps[_wtCurrent].showPricing);
  const handOff = _wtAutoRun && !_wtCtaOnly && !_wtNoUpsell && !onPricingStep;
  _wtClose('skipped').then(() => {
    if (!handOff) return;
    if (typeof _track === 'function') _track('tour_skip_plan_picker_shown');
    _wtStartCta();
  });
}

/** @param {MouseEvent} e */
function _wtOverlayClick(e) {
  // Block bubbling to document so settings.js's outside-click handler can't
  // snap the Settings dropdown shut while the Settings step is on screen.
  e.stopPropagation();
  const t = /** @type {HTMLElement|null} */ (e.target);
  const act = t && t.getAttribute ? t.getAttribute('data-wt-act') : null;
  if (act === 'next') _wtNext();
  else if (act === 'back') _wtBack();
  else if (act === 'skip') _wtSkip();
  else if (act === 'cta-free') _wtClose('completed');
  else if (act === 'cta-monthly') _wtCtaCheckout('monthly');
  else if (act === 'cta-annual') _wtCtaCheckout('annual');
  else if (act === 'cta-founder') _wtCtaCheckout('founder');
}

/** @param {KeyboardEvent} e */
function _wtKeydown(e) {
  if (!_wtActive) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); _wtNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); _wtBack(); }
  else if (e.key === 'Escape') { e.preventDefault(); _wtSkip(); }
}

// Swipe left/right anywhere on the overlay steps the tour — the touch
// counterpart of the arrow keys. Listeners are passive so vertical scrolling
// inside the centred modals (the CTA plan picker) is never blocked; the
// 1.5× dx:dy ratio keeps a scroll from registering as a swipe, and the 60px
// floor keeps a tap from registering as one.
/** Swipe origin from the overlay's last touchstart, or null.
 *  @type {{x:number,y:number}|null} */
let _wtTouchOrig = null;

/** @param {TouchEvent} e */
function _wtTouchStart(e) {
  const t = e.changedTouches && e.changedTouches[0];
  _wtTouchOrig = t ? { x: t.clientX, y: t.clientY } : null;
}

/** @param {TouchEvent} e */
function _wtTouchEnd(e) {
  const o = _wtTouchOrig;
  _wtTouchOrig = null;
  if (!o || !_wtActive) return;
  const t = e.changedTouches && e.changedTouches[0];
  if (!t) return;
  const dx = t.clientX - o.x, dy = t.clientY - o.y;
  if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0) _wtNext(); else _wtBack();
}

function _wtOnResize() {
  if (!_wtActive) return;
  if (_wtResizeTimer) clearTimeout(_wtResizeTimer);
  _wtResizeTimer = setTimeout(() => { _wtResizeTimer = 0; if (_wtActive) _wtRender(_wtCurrent); }, 120);
}

// ── render ──

/** Mobile single-column layout: land on the pane that holds the step's
 *  target. Runs AFTER the pre-click — switchSection resets to the list pane
 *  and card pre-click handlers flip to the editor pane, so the step's own
 *  choice must win over both.
 *  @param {WtStep} step */
function _wtApplyMv(step) {
  if (_wtCtaOnly || !step.mv) return;
  if (_wtIsNarrow() && typeof _wtW._mvSet === 'function') _wtW._mvSet(step.mv);
}

/**
 * Apply a step's navigation context — switch tab / sub-tab / main view, and
 * open or close the Settings dropdown. All synchronous; the pre-click and
 * pane choice run afterwards in _wtRender's pipeline (the pre-click card may
 * render async, so it is awaited there rather than clicked blindly here).
 * @param {WtStep} step
 */
function _wtApplyContext(step) {
  try {
    const prevSection = _wtCurrent > 0 ? (_wtSteps[_wtCurrent - 1] || {}).section : null;
    // The standalone session CTA is a centred modal over the user's own live
    // screen — it must not switch tabs or reset a sidebar to its gated state.
    if (!_wtCtaOnly && step.section && typeof _wtW.switchSection === 'function') _wtW.switchSection(step.section);
    if (!_wtCtaOnly && step.section && step.section !== prevSection) _wtGateSection(step.section);
    // View/tab switches must run BEFORE the card click — switchCBMainView()
    // re-syncs the library sub-tab, which would otherwise undo a rates-tab click.
    if (step.subtab && typeof _wtW.switchCabTab === 'function') _wtW.switchCabTab(step.subtab);
    if (step.cbView && typeof _wtW.switchCBMainView === 'function') _wtW.switchCBMainView(step.cbView);
    if (step.clView && typeof _wtW.switchCLMainView === 'function') _wtW.switchCLMainView(step.clView);
  } catch (e) { console.warn('[walkthrough] context switch failed', e); }
  const sd = document.getElementById('settings-dropdown');
  if (sd) sd.classList.toggle('open', !!step.openSettings);
  const ad = document.getElementById('account-dropdown');
  if (ad) ad.classList.toggle('open', !!step.openAccount);
  const hd = document.getElementById('help-dropdown');
  if (hd) hd.classList.toggle('open', !!step.openHelp);
  const fd = document.getElementById('features-dropdown');
  if (fd) fd.classList.toggle('open', !!step.openFeatures);
}

/**
 * Return the centre of a visible "pre-click" element the cursor should travel
 * to before the context switch fires (so the page change looks like a real
 * click). Returns null when no pre-click is needed.
 * @param {number} i
 * @returns {{cx:number,cy:number}|null}
 */
function _wtGetPreClickTarget(i) {
  const step = _wtSteps[i];
  const prev = _wtSteps[i - 1];
  if (!step || !prev) return null;

  /** @param {HTMLElement|null} el @returns {{cx:number,cy:number}|null} */
  function _centre(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.width > 1 && r.height > 1) ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : null;
  }

  // Settings / Account / Help / Features button — opens/closes the dropdown
  if (step.openSettings && !prev.openSettings) return _centre(document.getElementById('settings-btn'));
  if (step.openAccount && !prev.openAccount) return _centre(document.getElementById('account-btn'));
  if (step.openHelp && !prev.openHelp) return _centre(document.getElementById('help-btn'));
  if (step.openFeatures && !prev.openFeatures) return _centre(document.getElementById('features-btn'));

  // Section change → the matching nav-tab button (always in the bar, always measurable)
  if (step.section && step.section !== prev.section) {
    const map = { dashboard: 'Dashboard', clients: 'Clients', cabinet: 'Cabinet',
      quote: 'Quotes', orders: 'Orders', schedule: 'Schedule', stock: 'Stock', cutlist: 'Cut List' };
    const title = /** @type {Record<string,string>} */ (map)[step.section];
    if (title) return _centre(document.querySelector('.nav-tab[title="' + title + '"]'));
  }

  // Cabinet sub-tab switch
  if (step.subtab && step.subtab !== prev.subtab)
    return _centre(document.getElementById('cab-tab-' + step.subtab));

  // Cabinet main-view switch (Library / Results)
  if (step.cbView && step.cbView !== prev.cbView)
    return _centre(document.getElementById(step.cbView === 'library' ? 'cb-main-tab-library' : 'cb-main-tab-results'));

  // Cut List main-view switch (Library / Layout)
  if (step.clView && step.clView !== prev.clView)
    return _centre(document.getElementById(step.clView === 'layout' ? 'cl-tab-layout' : 'cl-tab-library'));

  // Card pre-click — open a record in the sidebar before spotlighting it
  if (step.preClickCard) return _centre(document.querySelector(step.preClickCard));

  return null;
}

/**
 * Wait for `sel` to resolve to an on-screen, sized element, polling across
 * animation frames while a panel renders. Calls cb(el) on success, or cb(null)
 * once the budget expires. The single target-resolution mechanism for the tour.
 * @param {string} sel
 * @param {(el: HTMLElement|null) => void} cb
 */
function _wtWaitFor(sel, cb) {
  if (!sel) { cb(null); return; }
  const deadline = performance.now() + 2000;
  // setTimeout, not requestAnimationFrame: rAF is paused in a backgrounded or
  // throttled tab, which would stall a step whose target appears async (e.g.
  // a table that only renders once a card-click opens its record).
  const tick = () => {
    if (!_wtActive) return;
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) { cb(/** @type {HTMLElement} */ (el)); return; }
    }
    if (performance.now() >= deadline) { cb(null); return; }
    setTimeout(tick, 50);
  };
  tick();
}

/**
 * clOptimize steps: run the cut list optimiser once the pre-clicked cut list
 * finishes its async load. _clDoOpenLibraryCutlist flips _clCutlistReady false
 * synchronously inside the card click, so polling it (plus the in-memory rows)
 * can't pass on stale pre-click state. optimize() switches the right pane to
 * Cut Layout and renders the nested sheets; autosave is already suspended for
 * the tour (_wtActive), so nothing persists. If the load never completes the
 * pane is switched anyway so the step's #cl-view-layout target still resolves
 * — worst case it shows its "Ready to Optimize" empty state.
 * @param {() => void} done
 */
function _wtOptimizeCutlist(done) {
  const deadline = performance.now() + 2500;
  const tick = () => {
    if (!_wtActive) return;
    const ready = typeof _clCutlistReady !== 'undefined' && _clCutlistReady
      && typeof pieces !== 'undefined' && pieces.length > 0
      && typeof sheets !== 'undefined' && sheets.length > 0;
    if (!ready && performance.now() < deadline) { setTimeout(tick, 50); return; }
    if (ready) {
      try { if (typeof optimize === 'function') optimize(); }
      catch (e) { console.warn('[walkthrough] optimise failed', e); }
    } else if (typeof _wtW.switchCLMainView === 'function') {
      try { _wtW.switchCLMainView('layout'); } catch (e) { void e; }
    }
    done();
  };
  tick();
}

/**
 * Skip a step whose spotlight target never resolved, continuing in the current
 * navigation direction. Step 0 is a center step (always renders), so stepping
 * back always terminates; stepping forward past the end finishes the tour.
 * @param {number} i
 */
function _wtSkipUnreachable(i) {
  const next = i + (_wtDir < 0 ? -1 : 1);
  if (next >= 0 && next <= _wtLastIdx()) { _wtRender(next); return; }
  if (_wtDir < 0) { _wtRender(0); return; }
  _wtClose('completed');
}

/**
 * Resolve a step's spotlight target and draw it. If the target can't be found
 * within the budget the step is skipped rather than shown broken.
 * @param {number} i
 * @param {WtStep} step
 */
function _wtResolveAndDraw(i, step) {
  _wtWaitFor(step.target || '', (el) => {
    if (!_wtActive || _wtCurrent !== i) return;
    if (!el) {
      console.warn('[walkthrough] step ' + (i + 1) + ' "' + step.title +
        '": target not found (' + (step.target || '') + ') — skipping');
      _wtSkipUnreachable(i);
      return;
    }
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { void e; }
    if (!_wtActive || _wtCurrent !== i) return;
    _wtDrawSpot(step, el.getBoundingClientRect());
  });
}

/**
 * Render step `i`. For forward navigation, the cursor first travels to the
 * clickable nav/settings/sub-tab button so the page change reads as a click.
 * @param {number} i
 */
function _wtRender(i) {
  const prevIdx = _wtCurrent;
  _wtDir = (i < prevIdx) ? -1 : 1;
  _wtCurrent = i;
  const step = _wtSteps[i];
  if (!step || !_wtOverlay) return;

  if (step.type === 'center') { _wtApplyContext(step); _wtApplyMv(step); _wtDrawCenter(step, false); return; }

  const proceed = () => {
    if (!_wtActive || _wtCurrent !== i) return;
    _wtApplyContext(step);
    if (step.preClickCard) {
      // The card may render async after the section/view switch (e.g. the
      // Cut List Library grid) — wait for it like a spotlight target, click,
      // THEN pick the pane and resolve. A missing card degrades to no click.
      _wtWaitFor(step.preClickCard, (card) => {
        if (!_wtActive || _wtCurrent !== i) return;
        if (card) { try { card.click(); } catch (e) { void e; } }
        if (step.clOptimize) {
          // The optimiser must wait for the clicked cut list's async row load,
          // and its own view switch must land before the pane/target resolve.
          _wtOptimizeCutlist(() => {
            if (!_wtActive || _wtCurrent !== i) return;
            _wtApplyMv(step);
            _wtResolveAndDraw(i, step);
          });
          return;
        }
        _wtApplyMv(step);
        _wtResolveAndDraw(i, step);
      });
      return;
    }
    _wtApplyMv(step);
    _wtResolveAndDraw(i, step);
  };
  // Move the cursor to where the action is, THEN switch the view / draw the
  // highlight once it has arrived. A forward step travels to the button it
  // "clicks"; otherwise it travels to the step's own target if that is already
  // on screen. The view switch / preClickCard click fires inside proceed(), so
  // a click's change lands exactly as the cursor reaches it.
  let dest = (i > prevIdx) ? _wtGetPreClickTarget(i) : null;
  if (!dest && step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) dest = { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }
  }
  if (dest) {
    _wtCursorMoveTo(dest.cx, dest.cy);
    setTimeout(proceed, 540);
  } else {
    proceed();
  }
}

/**
 * Draw the dim mask, current-tab highlight, spotlight ring and anchored
 * tooltip for a spot step.
 * @param {WtStep} step
 * @param {DOMRect} r
 */
function _wtDrawSpot(step, r) {
  const ov = _wtOverlay;
  if (!ov) return;
  const pad = 7;
  const vw = window.innerWidth, vh = window.innerHeight;
  const x1 = Math.max(0, r.left - pad), y1 = Math.max(0, r.top - pad);
  const x2 = Math.min(vw, r.right + pad), y2 = Math.min(vh, r.bottom + pad);
  ov.innerHTML = '';

  const mask = document.createElement('div');
  mask.className = 'wt-mask';
  mask.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ' + y1 +
    'px, ' + x1 + 'px ' + y1 + 'px, ' + x1 + 'px ' + y2 + 'px, ' + x2 + 'px ' +
    y2 + 'px, ' + x2 + 'px ' + y1 + 'px, 0 ' + y1 + 'px)';
  ov.appendChild(mask);
  _wtDrawTabHighlight(step);

  const spot = document.createElement('div');
  spot.className = 'wt-spot';
  spot.style.left = x1 + 'px'; spot.style.top = y1 + 'px';
  spot.style.width = (x2 - x1) + 'px'; spot.style.height = (y2 - y1) + 'px';
  ov.appendChild(spot);

  const tip = document.createElement('div');
  tip.className = 'wt-tooltip';
  tip.innerHTML = _wtTooltipHTML(step);
  ov.appendChild(tip);

  const box = { left: x1, top: y1, right: x2, bottom: y2, width: x2 - x1, height: y2 - y1 };
  const pos = _wtPlaceTooltip(box, step.position || 'right', tip);
  tip.style.left = pos.left + 'px';
  tip.style.top = pos.top + 'px';

  const arrow = document.createElement('div');
  arrow.className = 'wt-arrow';
  arrow.style.left = pos.ax + 'px';
  arrow.style.top = pos.ay + 'px';
  ov.appendChild(arrow);

  // Animate cursor tip to the centre of the spotlit element.
  _wtCursorMoveTo(r.left + r.width / 2, r.top + r.height / 2);
}

/**
 * Keep the section the tour is in visibly lit: clone the active nav tab and
 * float the copy above the dim mask so it reads as highlighted on every spot
 * step. Skipped when the step already spotlights the nav bar itself — the tab
 * is un-dimmed by the clip-path hole there — and when no tab is active.
 * @param {WtStep} step
 */
function _wtDrawTabHighlight(step) {
  const ov = _wtOverlay;
  if (!ov) return;
  if (step.target && step.target.indexOf('.nav-tab') === 0) return;
  const tab = document.querySelector('.nav-tab.active');
  if (!tab) return;
  const r = tab.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return;
  const clone = /** @type {HTMLElement} */ (tab.cloneNode(true));
  clone.removeAttribute('id');
  clone.classList.add('wt-tabhi');
  // The clone keeps the `.nav-tab` class for its lit styling, so its box has
  // to be pinned with `!important` to beat the responsive `.nav-tab` rules
  // (which force `width: auto !important`).
  const cs = clone.style;
  cs.setProperty('position', 'absolute', 'important');
  cs.setProperty('margin', '0', 'important');
  cs.setProperty('pointer-events', 'none', 'important');
  cs.setProperty('left', r.left + 'px', 'important');
  cs.setProperty('top', r.top + 'px', 'important');
  cs.setProperty('width', r.width + 'px', 'important');
  cs.setProperty('height', r.height + 'px', 'important');
  ov.appendChild(clone);
}

/**
 * Position the tooltip beside the spotlight, flipping/clamping to stay
 * on-screen, and compute the arrow position.
 * @param {{left:number,top:number,right:number,bottom:number,width:number,height:number}} r
 * @param {string} side
 * @param {HTMLElement} tip
 * @returns {{left:number,top:number,ax:number,ay:number}}
 */
function _wtPlaceTooltip(r, side, tip) {
  const vw = window.innerWidth, vh = window.innerHeight, M = 14, gap = 18;
  const tr = tip.getBoundingClientRect();
  const TW = tr.width, TH = tr.height;
  let left, top, dir = side;
  if (_wtIsNarrow()) {
    // Single-column phone layout: targets are full-width, so beside-the-target
    // placement can't fit. Pin the tooltip sheet-style to the BOTTOM edge —
    // always: panes carry their key info (headers, names, first fields) at the
    // top, so a top-pinned sheet covers exactly what the step is pointing at.
    left = (vw - TW) / 2;
    top = vh - TH - M;
    dir = 'bottom'; // arrow on the sheet's top edge, toward the target above
  } else {
    if (side === 'right') { left = r.right + gap; top = r.top - 8; }
    else if (side === 'left') { left = r.left - gap - TW; top = r.top - 8; }
    else if (side === 'bottom') { left = r.left + r.width / 2 - TW / 2; top = r.bottom + gap; }
    else { left = r.left + r.width / 2 - TW / 2; top = r.top - gap - TH; }
    // flip if it would overflow the chosen side
    if (side === 'right' && left + TW > vw - M) { left = r.left - gap - TW; dir = 'left'; }
    else if (side === 'left' && left < M) { left = r.right + gap; dir = 'right'; }
    else if (side === 'bottom' && top + TH > vh - M) { top = r.top - gap - TH; dir = 'top'; }
    else if (side === 'top' && top < M) { top = r.bottom + gap; dir = 'bottom'; }
  }
  // clamp into the viewport
  left = Math.max(M, Math.min(left, vw - TW - M));
  top = Math.max(M, Math.min(top, vh - TH - M));
  // arrow points at the target centre, clamped to the tooltip's span
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let ax, ay;
  if (dir === 'right' || dir === 'left') {
    ay = Math.max(top + 14, Math.min(cy - 7, top + TH - 22));
    ax = (dir === 'right') ? left - 7 : left + TW - 7;
  } else {
    ax = Math.max(left + 14, Math.min(cx - 7, left + TW - 22));
    ay = (dir === 'bottom') ? top - 7 : top + TH - 7;
  }
  return { left: left, top: top, ax: ax, ay: ay };
}

/**
 * Render a centred modal — welcome, final CTA, or a missing-target fallback.
 * @param {WtStep} step
 * @param {boolean} isFallback
 */
function _wtDrawCenter(step, isFallback) {
  void isFallback;
  const ov = _wtOverlay;
  if (!ov) return;
  ov.innerHTML = '';
  if (_wtCursorEl) _wtCursorEl.classList.remove('wt-cur-show');
  const mask = document.createElement('div');
  mask.className = 'wt-mask';
  ov.appendChild(mask);
  const card = document.createElement('div');
  card.className = 'wt-center' + (step.preview ? ' wt-has-preview' : '') + (step.showPricing ? ' wt-has-cta' : '');
  card.innerHTML = _wtCenterHTML(step);
  ov.appendChild(card);
}

/** @param {WtStep} step @returns {string} */
function _wtTooltipHTML(step) {
  const n = _wtCurrent + 1, total = _wtLastIdx() + 1;
  const pct = Math.round((n / total) * 100);
  const phase = step.phase ? _wtEsc(step.phase) + ' · ' : '';
  // Last step ends the tour for paid users (the Pro CTA is dropped) — say "Finish".
  const nextLabel = step.nextLabel || (_wtCurrent >= _wtLastIdx() ? 'Finish' : 'Next →');
  return '' +
    '<div class="wt-phase">' + phase + 'Step ' + n + ' of ' + total + '</div>' +
    '<h3>' + _wtEsc(step.title) + '</h3>' +
    '<p>' + _wtBody(step) + '</p>' +
    '<div class="wt-progress-track"><div class="wt-progress-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="wt-actions">' +
      '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip tour</button>' +
      '<span class="wt-spacer"></span>' +
      (_wtCurrent > 0 ? '<button class="wt-btn wt-btn-ghost" data-wt-act="back">Back</button>' : '') +
      '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(nextLabel) + '</button>' +
    '</div>';
}

/** @param {WtStep} step @returns {string} */
function _wtCenterPreviewHTML(step) {
  const title = step.titleHtml || _wtEsc(step.title);
  return '' +
    '<div class="wt-wp">' +
      '<div class="wt-wchrome">' +
        '<div class="wt-wdot" style="background:#ff5f57"></div>' +
        '<div class="wt-wdot" style="background:#febc2e"></div>' +
        '<div class="wt-wdot" style="background:#28c840"></div>' +
        '<div class="wt-wurl">procabinet.app</div>' +
      '</div>' +
      '<div class="wt-wapp">' +
        '<div class="wt-waheader">' +
          '<div class="wt-walogo-text">ProCabinet.App</div>' +
          '<div class="wt-waheader-right"><div class="wt-wahdot"></div><div class="wt-wahdot"></div></div>' +
        '</div>' +
        '<div class="wt-watabs">' +
          '<div class="wt-watab">Dashboard</div>' +
          '<div class="wt-watab">Cut List</div>' +
          '<div class="wt-watab">Stock</div>' +
          '<div class="wt-watab">Cabinet</div>' +
          '<div class="wt-watab">Quote</div>' +
          '<div class="wt-watab">Orders</div>' +
          '<div class="wt-watab">Clients</div>' +
          '<div class="wt-watab wt-watab-active">Schedule</div>' +
        '</div>' +
        '<div class="wt-wabody">' +
          '<div class="wt-wasidebar">' +
            '<div class="wt-wasb-title">Orders</div>' +
            '<div class="wt-wasb-row wt-wasb-row-act"><div class="wt-wasb-dot wt-wasb-dot-acc"></div><div class="wt-wasb-line wt-wasb-line-dk"></div></div>' +
            '<div class="wt-wasb-row"><div class="wt-wasb-dot"></div><div class="wt-wasb-line"></div></div>' +
            '<div class="wt-wasb-row"><div class="wt-wasb-dot"></div><div class="wt-wasb-line"></div></div>' +
            '<div class="wt-wasb-row"><div class="wt-wasb-dot"></div><div class="wt-wasb-line"></div></div>' +
          '</div>' +
          '<div class="wt-wamain">' +
            '<div class="wt-wacols">' +
              '<div class="wt-wacol">Mon</div><div class="wt-wacol">Tue</div><div class="wt-wacol">Wed</div>' +
              '<div class="wt-wacol">Thu</div><div class="wt-wacol">Fri</div><div class="wt-wacol">Mon</div><div class="wt-wacol">Tue</div>' +
            '</div>' +
            '<div class="wt-wag-row"><div class="wt-wag-track"><div class="wt-wag-bar" style="left:0;width:55%;background:#e8a838;opacity:0.85"></div></div></div>' +
            '<div class="wt-wag-row"><div class="wt-wag-track"><div class="wt-wag-bar" style="left:30%;width:45%;background:#3d9970;opacity:0.7"></div></div></div>' +
            '<div class="wt-wag-row"><div class="wt-wag-track"><div class="wt-wag-bar" style="left:55%;width:40%;background:#5b8dd9;opacity:0.7"></div></div></div>' +
            '<div class="wt-wag-row"><div class="wt-wag-track"><div class="wt-wag-bar" style="left:10%;width:30%;background:#e8a838;opacity:0.5"></div></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="wt-wfade"></div>' +
      '</div>' +
    '</div>' +
    '<div class="wt-wbody">' +
      '<h2>' + title + '</h2>' +
      '<p>' + _wtBody(step) + '</p>' +
      '<div class="wt-center-actions">' +
        '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip</button>' +
        '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(step.nextLabel || 'Start the tour →') + '</button>' +
      '</div>' +
    '</div>';
}

/** @param {WtStep} step @returns {string} */
function _wtCenterHTML(step) {
  if (step.preview) return _wtCenterPreviewHTML(step);
  if (step.showPricing) return _wtCtaHTML();
  let h = '';
  if (step.icon) h += '<div class="wt-icon">' + step.icon + '</div>';
  h += '<h2>' + _wtEsc(step.title) + '</h2>';
  h += '<p>' + _wtBody(step) + '</p>';
  if (step.flow) {
    h += '<div class="wt-flow">';
    step.flow.forEach((f, idx) => {
      h += '<span class="wt-chip' + (idx === 0 ? ' wt-chip-lead' : '') + '">' + _wtEsc(f) + '</span>';
    });
    h += '</div>';
  }
  h += '<div class="wt-center-actions">';
  if (_wtCurrent > 0) h += '<button class="wt-btn wt-btn-ghost" data-wt-act="back">Back</button>';
  else h += '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip tour</button>';
  h += '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(step.nextLabel || 'Next →') + '</button>';
  h += '</div>';
  return h;
}

/**
 * Final-step CTA — the four-tier ProCabinet plan picker. Self-contained: renders
 * its own header and per-tier buttons (the generic icon/title/actions are
 * skipped for this step). Buttons are wired through `data-wt-act` in
 * `_wtOverlayClick`.
 * @returns {string}
 */
function _wtCtaHTML() {
  const cap = FOUNDER_CAP;
  const left = _wtFounderSeatsLeft;
  const soldOut = typeof left === 'number' && left <= 0;
  const flag = (typeof left === 'number')
    ? (soldOut ? 'Sold out' : left + ' of ' + cap + ' left')
    : 'Limited to ' + cap;
  const founderBtn = soldOut
    ? '<button class="wt-cta-btn wt-cta-btn-amber" disabled>Sold out</button>'
    : '<button class="wt-cta-btn wt-cta-btn-amber" data-wt-act="cta-founder">Claim a seat</button>';
  return '' +
    '<div class="wt-cta-head">' +
      '<div class="wt-cta-eyebrow">Support the project</div>' +
      '<div class="wt-cta-title">Choose your ProCabinet plan</div>' +
      '<div class="wt-cta-sub">Continue for free, or unlock pro features.</div>' +
    '</div>' +
    '<div class="wt-cta-cols">' +
      '<div class="wt-cta-col">' +
        '<div class="wt-cta-tier">Free</div>' +
        '<div class="wt-cta-price">$0</div>' +
        '<div class="wt-cta-per">forever</div>' +
        '<ul class="wt-cta-feats">' +
          '<li>Free use of all core functions of the app</li>' +
          '<li><strong>Unlimited</strong> stock items</li>' +
          '<li class="wt-lim"><strong>5 saved items</strong> per other library</li>' +
          '<li class="wt-lim">No library import / export (CSV)</li>' +
          '<li class="wt-lim">No CNC / DXF export</li>' +
          '<li class="wt-lim">ProCabinet branding on PDFs</li>' +
          '<li class="wt-lim">Limited access to new features</li>' +
        '</ul>' +
        '<button class="wt-cta-btn wt-cta-btn-ghost" data-wt-act="cta-free">Continue free</button>' +
      '</div>' +
      '<div class="wt-cta-col">' +
        '<div class="wt-cta-tier">Monthly</div>' +
        '<div class="wt-cta-price">$25<span>/mo</span></div>' +
        '<div class="wt-cta-per"><s>$35/mo</s> · launch price</div>' +
        '<ul class="wt-cta-feats">' +
          '<li>First 6 months, then $35/mo</li>' +
          '<li><strong>Unlimited saved items</strong></li>' +
          '<li>Import / export libraries (CSV)</li>' +
          '<li>CNC / DXF export</li>' +
          '<li>ProCabinet removed from PDFs</li>' +
          '<li>Priority email support</li>' +
        '</ul>' +
        '<button class="wt-cta-btn wt-cta-btn-ghost" data-wt-act="cta-monthly">Choose Monthly</button>' +
      '</div>' +
      '<div class="wt-cta-col">' +
        '<div class="wt-cta-tier">Annual</div>' +
        '<div class="wt-cta-price">$15<span>/mo</span></div>' +
        '<div class="wt-cta-per"><s>$25/mo</s> · launch price</div>' +
        '<ul class="wt-cta-feats">' +
          '<li>$180 billed for year one, then $299/yr</li>' +
          '<li><strong>Unlimited saved items</strong></li>' +
          '<li>Import / export libraries (CSV)</li>' +
          '<li>CNC / DXF export</li>' +
          '<li>ProCabinet removed from PDFs</li>' +
          '<li>Priority email support</li>' +
        '</ul>' +
        '<button class="wt-cta-btn wt-cta-btn-ghost" data-wt-act="cta-annual">Choose Annual</button>' +
      '</div>' +
      '<div class="wt-cta-col wt-cta-col-hero">' +
        '<div class="wt-cta-flag">' + flag + '</div>' +
        '<div class="wt-cta-tier wt-cta-tier-hero">Founder</div>' +
        '<div class="wt-cta-price">$299</div>' +
        '<div class="wt-cta-per">one-off · lifetime</div>' +
        '<ul class="wt-cta-feats">' +
          '<li>Pay once, use forever</li>' +
          '<li>Only <strong>' + cap + ' accounts</strong> ever sold</li>' +
          '<li><strong>Everything</strong> in the paid plans</li>' +
          '<li>CNC / DXF export</li>' +
          '<li>New feature requests prioritised</li>' +
          '<li>WhatsApp group with founder</li>' +
        '</ul>' +
        founderBtn +
      '</div>' +
    '</div>';
}

/**
 * Fetch the live Founder seat count via the public `founder_seats_taken` RPC
 * and cache the remaining count for the CTA. Best-effort — on failure the CTA
 * shows a static "Limited to N" label. Re-renders the CTA if it is on screen
 * when the count arrives.
 * @returns {Promise<void>}
 */
async function _wtFetchFounderSeats() {
  if (_wtFounderSeatsLeft !== null) return;
  try {
    const { data, error } = await _sb.rpc('founder_seats_taken');
    if (error || typeof data !== 'number') return;
    _wtFounderSeatsLeft = Math.max(0, FOUNDER_CAP - data);
    if (_wtActive && _wtSteps[_wtCurrent] && _wtSteps[_wtCurrent].showPricing) {
      _wtRender(_wtCurrent);
    }
  } catch (e) {
    console.warn('[walkthrough] founder seat count failed', e);
  }
}

/**
 * Final-CTA paid-tier click. Closes the tour, then routes a signed-in user to
 * Stripe Checkout, or a guest to the sign-up flow (an account is required
 * before they can pay).
 * @param {'monthly'|'annual'|'founder'} plan
 */
function _wtCtaCheckout(plan) {
  const signedIn = !!_userId;
  _wtClose('completed');
  if (!signedIn) {
    if (typeof _wtW._showAuth === 'function') _wtW._showAuth();
    return;
  }
  if (typeof _wtW._handleUpgradeClick === 'function') _wtW._handleUpgradeClick(plan);
}

// ── first-run gate ──

/** Minimum gap between automatic plan-picker reminders (F: CTA cadence). */
const _WT_CTA_GAP_MS = 7 * 86400000;

/**
 * Standalone plan-picker reminder for a returning FREE user — heavily gated
 * so it never trains dismissal (F: CTA cadence):
 *   • Pro users: never.
 *   • Trial users: never — the trial-ending banner (stripe.js) owns days
 *     12–14, and the account dropdown always has Upgrade.
 *   • Free (post-trial): at most once per browser session AND at most once
 *     every 7 days (localStorage 'pc_wt_cta_last', also stamped when the
 *     full tour ends, so a fresh tour-CTA doesn't repeat a week's reminder).
 * Limit-hit and Pro-feature modals (stripe.js) remain intent-triggered and
 * are not gated by this cadence.
 */
function _wtMaybeShowSessionCta() {
  if (typeof isPro === 'function' && isPro()) return;
  if (typeof _trialActive === 'function' && _trialActive()) return;
  try {
    if (sessionStorage.getItem('pc_wt_session_cta') === '1') return;
    const last = Number(localStorage.getItem('pc_wt_cta_last') || 0);
    if (last && Date.now() - last < _WT_CTA_GAP_MS) return;
    sessionStorage.setItem('pc_wt_session_cta', '1');
    localStorage.setItem('pc_wt_cta_last', String(Date.now()));
  } catch (e) {
    // Storage blocked (private mode / disabled) — skip rather than re-show
    // the CTA on every page load with no way to remember it.
    void e;
    return;
  }
  _wtStartCta();
}

/**
 * Decide what onboarding surface to auto-show. Called from app.js after a
 * sign-in and on guest boot, once data has hydrated.
 *   • dismissed at the current version  → once-per-session Pro CTA (free users)
 *   • dismissed at an older version     → re-show the full tour (new feature)
 *   • never onboarded                   → show the full tour
 * The app is always populated — the demo seed for a guest, or the temporary
 * demo overlay _wtStart flips on for a signed-in user — so the tour never
 * needs to seed anything. No-ops if a tour is already on screen.
 * @returns {Promise<void>}
 */
async function _wtMaybeAutoStart() {
  if (_wtActive) return;
  // Logged-out demo visitors get the full tour + CTA on every reload — the demo
  // is a marketing surface, so the localStorage dismissal gate is bypassed.
  if (!_userId) { _wtStart({ force: true, auto: true }); return; }
  // Signed-in users: localStorage is the durable first-run gate;
  // business_info.onboarding_state mirrors it across their devices.
  /** @type {any} */
  let ls = null;
  try { ls = JSON.parse(localStorage.getItem('pc_wt_state') || 'null'); } catch (e) { ls = null; }
  // localStorage is per-BROWSER but dismissal is per-ACCOUNT: an entry written
  // by another account — or by a guest in the pre-launch demo era, which never
  // stamped user_id — must not suppress a brand-new account's first run.
  // business_info.onboarding_state (per-account, cross-device) still gates.
  if (ls && ls.user_id !== _userId) ls = null;
  const ob = _wtW._onboardingState || {};
  const lsVersion = (ls && typeof ls.version === 'number') ? ls.version : -1;
  const obVersion = (typeof ob.version === 'number') ? ob.version : -1;
  const dismissed = !!((ls && ls.dismissed_at) || ob.dismissed_at);
  if (dismissed && Math.max(lsVersion, obVersion) >= WT_VERSION) {
    // First-run tour already done at the current version. Touch devices get
    // the once-per-session "optimised for mobile" welcome (suppressed when the
    // full tour runs — the tour IS the welcome), then a free user still gets a
    // once-per-browser-session reminder of the plan picker.
    if (typeof window._pcMaybeShowMobileNotice === 'function') window._pcMaybeShowMobileNotice();
    _wtMaybeShowSessionCta();
    return;
  }
  _wtStart({ force: true, auto: true });
}

// ── public surface ──
_wtW._wtStart = _wtStart;
_wtW._wtClose = _wtClose;
_wtW._wtMaybeAutoStart = _wtMaybeAutoStart;
_wtW._wtStartCta = _wtStartCta;
