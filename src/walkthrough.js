// ProCabinet — Guided walkthrough (O.2 onboarding tour).
//
// Classic <script defer>, loaded LAST so every section-switch / panel-render
// function it drives already exists. A "spotlight" tour: dims the screen,
// cuts a highlight around one real DOM element, anchors a tooltip beside it.
//
// This file owns three things (built across milestones M3/M5/M6/M7):
//   • the engine + step list                         (M3 — here now)
//   • _wtPersistState — onboarding_state read/write   (M5)
//   • _wtSeedSampleProject / _wtClearSampleData       (M6)
//   • _wtMaybeAutoStart — first-run gate              (M7)
//
// Public surface (window globals — classic-script top-level functions):
//   _wtStart(opts)   — begin the tour. opts.force is accepted for the Help
//                      re-trigger (the gate lives in _wtMaybeAutoStart, not here).
//   _wtClose(reason) — tear down. reason: 'completed' | 'skipped'.
//
// Cross-file globals used: switchSection (settings.js), switchCabTab /
// switchCBMainView (cabinet-render.js). Reached via the `_wtW` any-cast so
// the type-checker doesn't need ambient decls for them.

/** Walkthrough content version. Bump when steps change materially — drives
 *  the version-gated re-show in _wtMaybeAutoStart (M7). */
const WT_VERSION = 1;

/** @type {any} window, any-typed so cross-file globals resolve without decls. */
const _wtW = /** @type {any} */ (window);

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
 * @property {string} [target]         CSS selector to spotlight (spot steps).
 * @property {string} [preClickCard]   CSS selector — animate cursor to and click this before the step shows.
 * @property {'right'|'left'|'top'|'bottom'} [position]  Preferred tooltip side.
 * @property {string} [icon]           Emoji for centred steps.
 * @property {string} title
 * @property {string} [titleHtml]      Raw HTML override for title (welcome preview).
 * @property {string} body             May contain authored <span class="wt-hi"> markup.
 * @property {string} [nextLabel]
 * @property {string[]} [flow]         Welcome-step flow chips.
 * @property {string} [preview]        Welcome preview graphic type ('gantt').
 * @property {boolean} [showPricing]   Final CTA — render the pricing block.
 */

/** @type {WtStep[]} */
const _wtSteps = [
  // 0 — Welcome
  {
    type: 'center', section: 'dashboard', preview: 'gantt',
    title: 'See the full workflow in action',
    titleHtml: 'See the full <span class="wt-hi">workflow</span> in action',
    body: 'This tour walks through each part of the app. We\'ve loaded a sample project so you can see how it works — use the <span class="wt-hi">arrow keys on your keyboard</span> to step through it.',
    nextLabel: 'Start the tour →'
  },

  // 1 — Tab bar
  {
    type: 'spot', phase: 'Navigation', section: 'dashboard',
    target: '.nav-tabs', position: 'bottom',
    title: 'Navigate between sections',
    body: 'ProCabinet is organised into <span class="wt-hi">8 tabs</span>, one per section of your workflow. Click any tab to jump there — we\'ll walk through each one now.'
  },

  // 2 — Settings
  {
    type: 'spot', phase: 'Setup', section: 'dashboard', openSettings: true,
    target: '#settings-dropdown', position: 'left',
    title: 'Set your units & preferences first',
    body: 'Switch between <span class="wt-hi">metric and imperial</span>, choose your unit format and currency, and toggle dark mode. These apply everywhere — quotes, cabinets and cut lists.'
  },

  // 3 — Account / Business details
  {
    type: 'spot', phase: 'Setup', section: 'dashboard', openAccount: true,
    target: '#account-dropdown', position: 'left',
    title: 'Add your business details',
    body: 'Your business name, address and contact info print on <span class="wt-hi">quotes and invoices</span>. Tap "Edit business details" to fill them in.'
  },

  // ── Clients ──────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Clients', section: 'clients',
    target: '.nav-tab[title="Clients"]', position: 'bottom',
    title: 'Clients tab',
    body: 'Every job starts with a client. Their name, address and contact details carry through to <span class="wt-hi">every quote, order and invoice</span> automatically.'
  },
  {
    type: 'spot', phase: 'Clients', section: 'clients',
    target: '#clients-main', position: 'left',
    title: 'Client cards',
    body: 'Each card shows the client\'s total quote value and job count. Click a card to open their profile in the sidebar — <span class="wt-hi">full history in one place</span>.'
  },
  {
    type: 'spot', phase: 'Clients', section: 'clients',
    preClickCard: '.client-card',
    target: '#clients-sidebar', position: 'right',
    title: 'Client profile',
    body: 'Edit name, email, phone, address and notes. Everything here <span class="wt-hi">auto-populates your quotes and PDFs</span> — fill it in once.'
  },

  // ── Quote ────────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Quote', section: 'quote',
    target: '.nav-tab[title="Quotes"]', position: 'bottom',
    title: 'Quotes tab',
    body: 'All your customer quotes live here. Each quote moves through a status pipeline — <span class="wt-hi">Draft → Sent → Approved</span> — before becoming an order.'
  },
  {
    type: 'spot', phase: 'Quote', section: 'quote',
    target: '#quote-main', position: 'left',
    title: 'Quote list',
    body: 'Quotes are sorted newest first. Filter by status at the top. Click any quote to open the full editor — <span class="wt-hi">line items, totals and actions</span> in the sidebar.'
  },
  {
    type: 'spot', phase: 'Quote', section: 'quote',
    preClickCard: '.quote-card',
    target: '.qc-footer', position: 'left',
    title: 'Send & convert',
    body: 'Export a branded PDF to send to the client. Once approved, one click <span class="wt-hi">converts the quote to an order</span> — locking the line items as a snapshot.'
  },
  {
    type: 'spot', phase: 'Quote', section: 'quote',
    target: '#quote-sidebar', position: 'right',
    title: 'Quote editor',
    body: 'Add line items: cabinets from the builder, labour, materials or custom lines. ProCabinet calculates <span class="wt-hi">subtotals, tax and the grand total</span> live.'
  },

  // ── Orders ───────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Orders', section: 'orders',
    target: '.nav-tab[title="Orders"]', position: 'bottom',
    title: 'Orders tab',
    body: 'Confirmed jobs move here from Quotes. Each order tracks its own <span class="wt-hi">5-stage production pipeline</span> from start to delivery.'
  },
  {
    type: 'spot', phase: 'Orders', section: 'orders',
    target: '#orders-main', position: 'left',
    title: 'Order cards',
    body: 'Each card shows the pipeline stage, due date and value. Open one to <span class="wt-hi">advance its stage</span> or export job sheets and delivery notes as PDFs.'
  },
  {
    type: 'spot', phase: 'Orders', section: 'orders',
    preClickCard: '.order-card',
    target: '#order-sidebar', position: 'right',
    title: 'Order detail',
    body: 'Each order carries its own <span class="wt-hi">priority, hours and dates</span> — set them and the job lands on the production calendar.'
  },

  // ── Stock ─────────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Stock', section: 'stock',
    target: '.nav-tab[title="Stock"]', position: 'bottom',
    title: 'Stock tab',
    body: 'Track your sheet goods, hardware, edge banding and finishes here. After a cut list, <span class="wt-hi">deduct the used material</span> from stock with one click.'
  },
  {
    type: 'spot', phase: 'Stock', section: 'stock',
    target: '#stock-main', position: 'left',
    title: 'Material list',
    body: 'Each item shows current quantity, supplier and unit cost. Items that drop below their threshold are <span class="wt-hi">flagged in red</span>.'
  },
  {
    type: 'spot', phase: 'Stock', section: 'stock',
    preClickCard: '.stock-row',
    target: '#stock-sidebar', position: 'right',
    title: 'Adding materials',
    body: 'Set the sheet dimensions, cost per unit, quantity on hand, and <span class="wt-hi">low-stock threshold</span>. When stock falls below the threshold you\'ll see a dashboard alert.'
  },

  // ── Cabinet ──────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results',
    target: '.nav-tab[title="Cabinet"]', position: 'bottom',
    title: 'Cabinet tab',
    body: 'The heart of ProCabinet. Design cabinets, keep a <span class="wt-hi">reusable template library</span>, and set the rates that price every job — it all lives here.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results',
    target: '#cb-sidebar-builder', position: 'right',
    title: 'Start from a quote',
    body: 'The Quote Builder is quote-driven. Pick a quote from the sidebar and its cabinets load instantly — <span class="wt-hi">always in sync with the Quotes tab</span>.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results',
    preClickCard: '#cb-results .quote-card',
    target: '#cb-results', position: 'left',
    title: 'Cabinets & live pricing',
    body: 'Every cabinet in the quote is listed here with material, labour, markup and tax <span class="wt-hi">calculated line by line</span> — the total updates as you design.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'results',
    preClickCard: '#cb-results .cb-cab-card',
    target: '#cb-cab-editor', position: 'right',
    title: 'The cabinet editor',
    body: 'Open any cabinet to set its full spec — carcass size, doors, drawers, shelves and hardware. Labour pricing <span class="wt-hi">scales with size</span> so cabinets big and small are costed accurately.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'library',
    target: '#cb-library-view', position: 'left',
    title: 'Cabinet Library',
    body: 'A catalogue of <span class="wt-hi">reusable cabinet templates</span>. Build a cabinet once, then "Add to Quote" drops it into any job — dimensions, materials and pricing included.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'library',
    target: '#cb-lib-tab-rates', position: 'bottom',
    title: 'My Rates',
    body: 'Set your <span class="wt-hi">hourly labour rate, material markup, edge-banding cost and contingency</span>. Do this once — every cabinet prices itself from these.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', cbView: 'library',
    preClickCard: '#cb-lib-tab-rates',
    target: '#cb-lib-rates-wrap', position: 'right',
    title: 'Rate inputs',
    body: 'Adjust any rate and all open quotes reprice in real time. <span class="wt-hi">No spreadsheet formulas to maintain</span> — one source of truth for your whole business.'
  },

  // ── Cut List ──────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    target: '.nav-tab[title="Cut List"]', position: 'bottom',
    title: 'Cut List tab',
    body: 'Plan exactly how each sheet gets cut. Add your stock panels, list every piece needed, then let ProCabinet <span class="wt-hi">optimise the layout for minimum waste</span>.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    target: '#sheets-table', position: 'right',
    title: 'Sheet stock',
    body: 'Pull panels in from your Stock inventory. Each sheet row sets the material, dimensions and grain direction — the optimiser uses this to <span class="wt-hi">rotate and nest pieces correctly</span>.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    target: '#pieces-table', position: 'right',
    title: 'Piece list',
    body: 'Add every part you need to cut — label, length, width, quantity, grain direction and edge banding. <span class="wt-hi">You\'re in full control</span> of what goes on each sheet.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    target: '#cl-action-bar', position: 'top',
    title: 'Optimise the layout',
    body: 'Hit <span class="wt-hi">Optimise Cut Layout</span> and ProCabinet nests all your pieces onto the available sheets for minimum waste, respecting grain and saw-kerf.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    preClickCard: '#cl-action-bar .btn',
    target: '#results-area', position: 'left',
    title: 'Visual layout',
    body: 'Each sheet is drawn as a scaled diagram with pieces labelled and colour-coded. See <span class="wt-hi">waste percentage, cut order and material totals</span> at a glance.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist', clView: 'layout',
    target: '#layout-toolbar-top', position: 'bottom',
    title: 'Export & deduct stock',
    body: 'Export a <span class="wt-hi">workshop PDF</span> with the cut diagram and part labels, or deduct the used sheets straight from your Stock inventory with one click.'
  },

  // ── Schedule ─────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Schedule', section: 'schedule',
    target: '.nav-tab[title="Schedule"]', position: 'bottom',
    title: 'Schedule tab',
    body: 'ProCabinet automatically places your orders on a calendar based on <span class="wt-hi">due date, priority and your working hours</span>. Set your hours and days off from the ⚙ Hours button.'
  },
  {
    type: 'spot', phase: 'Schedule', section: 'schedule',
    target: '#schedule-sidebar', position: 'right',
    title: 'Order queue',
    body: 'Active orders are listed here in priority order. Use the <span class="wt-hi">priority stepper</span> on any order to raise or lower it — the schedule rebuilds instantly.'
  },
  {
    type: 'spot', phase: 'Schedule', section: 'schedule',
    target: '#schedule-main', position: 'top',
    title: 'Gantt calendar',
    body: 'Each order occupies a coloured bar spanning its production days. Hover to see job details. The scheduler <span class="wt-hi">avoids weekends and respects your daily capacity</span>.'
  },

  // ── Dashboard ─────────────────────────────────────────────────────────────
  {
    type: 'spot', phase: 'Dashboard', section: 'dashboard',
    target: '.nav-tab[title="Dashboard"]', position: 'bottom',
    title: 'Dashboard',
    body: 'Your home base. Everything you just explored is summarised here — <span class="wt-hi">live, every time you open the app</span>.'
  },
  {
    type: 'spot', phase: 'Dashboard', section: 'dashboard',
    target: '#dash-toolbar', position: 'bottom',
    title: 'Quick actions',
    body: '<span class="wt-hi">+ Quote, + Cabinet, + Client</span> — jump straight into creating anything; each button opens the right tab with a fresh form ready.'
  },
  {
    type: 'spot', phase: 'Dashboard', section: 'dashboard',
    target: '#dashboard-main', position: 'top',
    title: 'Live overview',
    body: 'Active orders with due-date alerts, your most recent quotes, low-stock warnings and this week\'s schedule — <span class="wt-hi">the full picture without opening a single tab</span>.'
  },

  // Pro CTA
  {
    type: 'center', section: 'dashboard', icon: '🚀',
    title: 'You\'re ready to go',
    body: 'The free plan keeps <span class="wt-hi">5 of each</span> — clients, cabinets, quotes, orders and cut lists. Upgrade to Pro for unlimited.',
    showPricing: true,
    nextLabel: 'Finish'
  }
];

// ── module state ──
/** @type {boolean} */
let _wtActive = false;
/** @type {number} */
let _wtCurrent = 0;
/** @type {HTMLElement | null} */
let _wtOverlay = null;
/** @type {number | ReturnType<typeof setTimeout>} */
let _wtResizeTimer = 0;
/** @type {HTMLElement | null} */
let _wtCursorEl = null;

/** @param {string} s @returns {string} */
function _wtEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── animated cursor ──

// Tip of the cursor SVG is at (4, 3) within the 20×26 viewBox.
const _WT_CUR_TIP_X = 4, _WT_CUR_TIP_Y = 3;

function _wtInitCursor() {
  if (_wtCursorEl) return;
  const el = document.createElement('div');
  el.id = 'wt-cursor';
  el.innerHTML = '<svg width="20" height="26" viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 3L4 21L9 16L12 24L14.5 23L11.5 15L18 15Z" fill="white" stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>';
  // Start at viewport centre so the first movement animates from mid-screen.
  el.style.left = (window.innerWidth  / 2 - _WT_CUR_TIP_X) + 'px';
  el.style.top  = (window.innerHeight / 2 - _WT_CUR_TIP_Y) + 'px';
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
  el.style.left = (cx - _WT_CUR_TIP_X) + 'px';
  el.style.top  = (cy - _WT_CUR_TIP_Y) + 'px';
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
      // Open the seeded sample cut list (created by _wtSeedSampleProject with
      // its own sheets + pieces) so the input form un-gates and the layout
      // steps walk a populated cut list.
      const clIds = (((_wtW._onboardingState || {}).sample_ids) || {}).cutlists || [];
      if (clIds[0] && typeof _wtW._clOpenLibraryCutlist === 'function') {
        _wtW._clOpenLibraryCutlist(clIds[0]);
      }
      if (typeof _wtW.switchCLMainView === 'function') _wtW.switchCLMainView('layout');
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
 * Begin the walkthrough. No-ops if a tour is already on screen (guards the
 * hourly TOKEN_REFRESHED auth event from restarting a tour mid-flight).
 * @param {{force?: boolean}} [opts]
 */
function _wtStart(opts) {
  void opts; // gate lives in _wtMaybeAutoStart (M7); _wtStart always starts.
  if (_wtActive) return;
  _wtActive = true;
  _wtCurrent = 0;
  const ov = document.createElement('div');
  ov.id = 'wt-overlay';
  ov.addEventListener('click', _wtOverlayClick);
  document.body.appendChild(ov);
  _wtOverlay = ov;
  document.addEventListener('keydown', _wtKeydown, true);
  window.addEventListener('resize', _wtOnResize);
  _wtInitCursor();
  _wtRender(0);
}

/**
 * Tear the tour down and persist the dismissal.
 * @param {'completed'|'skipped'} reason
 */
function _wtClose(reason) {
  if (!_wtActive) return;
  _wtActive = false;
  if (_wtOverlay) { _wtOverlay.remove(); _wtOverlay = null; }
  document.removeEventListener('keydown', _wtKeydown, true);
  window.removeEventListener('resize', _wtOnResize);
  _wtDestroyCursor();
  const sd = document.getElementById('settings-dropdown');
  if (sd) sd.classList.remove('open');
  // M8: a finished tour suppresses the redundant dashboard "Getting Started" card.
  if (reason === 'completed') {
    try { localStorage.setItem('pc_hide_guide', '1'); } catch (e) { void e; }
  }
  // Persist dismissal — version gate + timestamp. M7's _wtMaybeAutoStart
  // reads these to decide whether to auto-show on the next login.
  _wtPersistState({
    version: WT_VERSION,
    dismissed_at: new Date().toISOString(),
    completed: reason === 'completed'
  });
}

/**
 * Merge `patch` into the user's onboarding_state and persist it to
 * business_info. Find-or-insert UPSERT — a brand-new user has no row yet, so
 * the first write creates it (baseline name:'' for the NOT-NULL name column,
 * mirroring _syncBizInfoToDB in business.js). Fire-and-forget.
 * @param {Record<string, any>} patch
 */
async function _wtPersistState(patch) {
  const next = Object.assign({}, _wtW._onboardingState || {}, patch);
  _wtW._onboardingState = next;
  if (!_userId || typeof _db !== 'function') return;
  const uid = _userId;
  try {
    const { data: existing } = await _db('business_info').select('id').eq('user_id', uid);
    if (existing && existing.length > 0) {
      await _db('business_info')
        .update({ onboarding_state: next, updated_at: new Date().toISOString() })
        .eq('user_id', uid);
    } else {
      await _db('business_info').insert([{ user_id: uid, name: '', onboarding_state: next }]);
    }
  } catch (e) {
    console.warn('[walkthrough] persist failed', e);
  }
}

// ── navigation ──

function _wtNext() {
  if (_wtCurrent < _wtSteps.length - 1) _wtRender(_wtCurrent + 1);
  else _wtClose('completed');
}
function _wtBack() {
  if (_wtCurrent > 0) _wtRender(_wtCurrent - 1);
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
  else if (act === 'skip') _wtClose('skipped');
  else if (act === 'clear-sample') {
    _wtClose('completed');
    if (typeof _wtW._wtClearSampleData === 'function') _wtW._wtClearSampleData();
  }
}

/** @param {KeyboardEvent} e */
function _wtKeydown(e) {
  if (!_wtActive) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); _wtNext(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); _wtBack(); }
  else if (e.key === 'Escape') { e.preventDefault(); _wtClose('skipped'); }
}

function _wtOnResize() {
  if (!_wtActive) return;
  if (_wtResizeTimer) clearTimeout(_wtResizeTimer);
  _wtResizeTimer = setTimeout(() => { _wtResizeTimer = 0; _wtRender(_wtCurrent); }, 120);
}

// ── render ──

/**
 * Apply a step's navigation context — switch tab / sub-tab / main view, and
 * open or close the Settings dropdown. All synchronous.
 * @param {WtStep} step
 */
function _wtApplyContext(step) {
  try {
    const prevSection = _wtCurrent > 0 ? (_wtSteps[_wtCurrent - 1] || {}).section : null;
    if (step.section && typeof _wtW.switchSection === 'function') _wtW.switchSection(step.section);
    if (step.section && step.section !== prevSection) _wtGateSection(step.section);
    // View/tab switches must run BEFORE the card click — switchCBMainView()
    // re-syncs the library sub-tab, which would otherwise undo a rates-tab click.
    if (step.subtab && typeof _wtW.switchCabTab === 'function') _wtW.switchCabTab(step.subtab);
    if (step.cbView && typeof _wtW.switchCBMainView === 'function') _wtW.switchCBMainView(step.cbView);
    if (step.clView && typeof _wtW.switchCLMainView === 'function') _wtW.switchCLMainView(step.clView);
    if (step.preClickCard) {
      const card = document.querySelector(step.preClickCard);
      if (card) /** @type {HTMLElement} */ (card).click();
    }
  } catch (e) { console.warn('[walkthrough] context switch failed', e); }
  const sd = document.getElementById('settings-dropdown');
  if (sd) sd.classList.toggle('open', !!step.openSettings);
  const ad = document.getElementById('account-dropdown');
  if (ad) ad.classList.toggle('open', !!step.openAccount);
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

  // Settings / Account button — opens/closes the dropdown
  if (step.openSettings && !prev.openSettings) return _centre(document.getElementById('settings-btn'));
  if (step.openAccount && !prev.openAccount) return _centre(document.getElementById('account-btn'));

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
 * Apply context then resolve the spotlight target and draw. Extracted so both
 * the immediate path and the pre-click-delay path share the same logic.
 * @param {number} i
 * @param {WtStep} step
 */
function _wtResolveAndDraw(i, step) {
  const sel = step.target || '';
  const now = sel ? document.querySelector(sel) : null;
  if (now) {
    const r0 = now.getBoundingClientRect();
    if (r0.width > 1 && r0.height > 1) {
      try { now.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { void e; }
      _wtDrawSpot(step, now.getBoundingClientRect());
      return;
    }
  }
  _wtResolveTarget(sel, 0, (el) => {
    if (!_wtActive || _wtCurrent !== i) return;
    if (!el) { _wtDrawCenter(step, true); return; }
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { void e; }
    _wtDrawSpot(step, el.getBoundingClientRect());
  });
}

/**
 * Render step `i`. For forward navigation, moves the cursor to the clickable
 * nav/settings/subtab button first so the page change looks like a real click.
 * @param {number} i
 */
function _wtRender(i) {
  const prevIdx = _wtCurrent;
  _wtCurrent = i;
  const step = _wtSteps[i];
  if (!step || !_wtOverlay) return;

  if (step.type === 'center') { _wtApplyContext(step); _wtDrawCenter(step, false); return; }

  // Only add the pre-click delay when advancing forward.
  const pre = (i > prevIdx) ? _wtGetPreClickTarget(i) : null;
  if (pre) {
    _wtCursorMoveTo(pre.cx, pre.cy);
    setTimeout(() => {
      if (!_wtActive || _wtCurrent !== i) return;
      _wtApplyContext(step);
      _wtResolveAndDraw(i, step);
    }, 540);
    return;
  }

  _wtApplyContext(step);
  _wtResolveAndDraw(i, step);
}

/**
 * Resolve a spotlight target, retrying across frames while a panel renders.
 * @param {string} sel
 * @param {number} tries
 * @param {(el: HTMLElement|null) => void} cb
 */
function _wtResolveTarget(sel, tries, cb) {
  const el = sel ? document.querySelector(sel) : null;
  if (el) {
    const r = el.getBoundingClientRect();
    if (r.width > 1 && r.height > 1) { cb(/** @type {HTMLElement} */ (el)); return; }
  }
  if (tries >= 6) { cb(null); return; }
  setTimeout(() => _wtResolveTarget(sel, tries + 1, cb), 40);
}

/**
 * Draw the dim mask + spotlight ring + anchored tooltip for a spot step.
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
  if (side === 'right') { left = r.right + gap; top = r.top - 8; }
  else if (side === 'left') { left = r.left - gap - TW; top = r.top - 8; }
  else if (side === 'bottom') { left = r.left + r.width / 2 - TW / 2; top = r.bottom + gap; }
  else { left = r.left + r.width / 2 - TW / 2; top = r.top - gap - TH; }
  // flip if it would overflow the chosen side
  if (side === 'right' && left + TW > vw - M) { left = r.left - gap - TW; dir = 'left'; }
  else if (side === 'left' && left < M) { left = r.right + gap; dir = 'right'; }
  else if (side === 'bottom' && top + TH > vh - M) { top = r.top - gap - TH; dir = 'top'; }
  else if (side === 'top' && top < M) { top = r.bottom + gap; dir = 'bottom'; }
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
  card.className = 'wt-center' + (step.preview ? ' wt-has-preview' : '');
  card.innerHTML = _wtCenterHTML(step);
  ov.appendChild(card);
}

/** @param {WtStep} step @returns {string} */
function _wtTooltipHTML(step) {
  const n = _wtCurrent + 1, total = _wtSteps.length;
  const pct = Math.round((n / total) * 100);
  const phase = step.phase ? _wtEsc(step.phase) + ' · ' : '';
  return '' +
    '<div class="wt-phase">' + phase + 'Step ' + n + ' of ' + total + '</div>' +
    '<h3>' + _wtEsc(step.title) + '</h3>' +
    '<p>' + step.body + '</p>' +
    '<div class="wt-progress-track"><div class="wt-progress-fill" style="width:' + pct + '%"></div></div>' +
    '<div class="wt-actions">' +
      '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip tour</button>' +
      '<span class="wt-spacer"></span>' +
      (_wtCurrent > 0 ? '<button class="wt-btn wt-btn-ghost" data-wt-act="back">Back</button>' : '') +
      '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(step.nextLabel || 'Next →') + '</button>' +
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
      '<p>' + step.body + '</p>' +
      '<div class="wt-center-actions">' +
        '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip</button>' +
        '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(step.nextLabel || 'Start the tour →') + '</button>' +
      '</div>' +
    '</div>';
}

/** @param {WtStep} step @returns {string} */
function _wtCenterHTML(step) {
  if (step.preview) return _wtCenterPreviewHTML(step);
  let h = '';
  if (step.icon) h += '<div class="wt-icon">' + step.icon + '</div>';
  h += '<h2>' + _wtEsc(step.title) + '</h2>';
  h += '<p>' + step.body + '</p>';
  if (step.flow) {
    h += '<div class="wt-flow">';
    step.flow.forEach((f, idx) => {
      h += '<span class="wt-chip' + (idx === 0 ? ' wt-chip-lead' : '') + '">' + _wtEsc(f) + '</span>';
    });
    h += '</div>';
  }
  if (step.showPricing) {
    h += '<div class="wt-pricing">' +
      '<div class="wt-price"><div class="wt-price-label">Monthly</div>' +
      '<div class="wt-price-amt">$35</div><div class="wt-price-per">per month</div></div>' +
      '<div class="wt-price wt-price-rec"><div class="wt-price-label">Annual</div>' +
      '<div class="wt-price-amt">$299</div><div class="wt-price-per">per year</div>' +
      '<div class="wt-price-save">Save 29%</div></div>' +
      '</div>';
    h += '<div class="wt-sublink" data-wt-act="clear-sample">Clear the sample data</div>';
  }
  h += '<div class="wt-center-actions">';
  if (_wtCurrent > 0) h += '<button class="wt-btn wt-btn-ghost" data-wt-act="back">Back</button>';
  else h += '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip tour</button>';
  h += '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(step.nextLabel || 'Next →') + '</button>';
  h += '</div>';
  return h;
}

// ── sample-data seeder (M6) ──

/**
 * Seed a light "Smith Kitchen" sample project so the tour walks populated
 * panels. Every count stays under the 5-item free cap (1 client, 3 stock,
 * 3 cabinet templates, 1 quote, 4 orders, 1 cut list). The inserted row IDs are
 * recorded into onboarding_state.sample_ids so _wtClearSampleData can later
 * remove exactly these rows. Child lines cascade-delete with their parent.
 * @returns {Promise<boolean>}
 */
async function _wtSeedSampleProject() {
  if (!_userId || typeof _db !== 'function') return false;
  // Idempotency guard: sample_seeded is set as an intent marker before the
  // first insert, so once it is true the sample project already exists —
  // seeding again would duplicate every row. _wtMaybeAutoStart also guards,
  // but this makes the function itself safe to call directly.
  if ((_wtW._onboardingState || {}).sample_seeded) return false;
  const uid = _userId;
  const db = _wtW._db;
  /** @type {Record<string, number[]>} */
  const ids = { clients: [], stock_items: [], cabinet_templates: [], quotes: [], orders: [], cutlists: [] };
  // Mark intent BEFORE inserting: if the seed is interrupted (tab closed
  // mid-run), the next login sees sample_seeded=true and won't re-seed.
  await _wtPersistState({ sample_seeded: true });
  /** @param {string} table @param {any} row @returns {Promise<number>} */
  const ins1 = async (table, row) => {
    const { data, error } = await db(table).insert([row]).single();
    if (error || !data) throw new Error(table + ': ' + ((error && error.message) || 'no row returned'));
    return data.id;
  };
  /** @param {string} table @param {any[]} rows @returns {Promise<number[]>} */
  const insMany = async (table, rows) => {
    const { data, error } = await db(table).insert(rows);
    if (error || !data) throw new Error(table + ': ' + ((error && error.message) || 'no rows returned'));
    return /** @type {any[]} */ (data).map((/** @type {any} */ r) => r.id);
  };
  try {
    const clientId = await ins1('clients', {
      user_id: uid, name: 'Smith Residence', email: 'sarah.smith@example.com',
      phone: '0412 558 901', address: '14 Maple Drive, Kew',
      notes: 'Sample client — added by the ProCabinet walkthrough.'
    });
    ids.clients.push(clientId);

    ids.stock_items = await insMany('stock_items', [
      { user_id: uid, name: '18mm Birch Plywood', sku: 'PLY-BIR-18', qty: 6, low: 8, cost: 82, category: 'Sheet material' },
      { user_id: uid, name: 'Blum 110° Hinge', sku: 'HW-BLM-110', qty: 24, low: 40, cost: 4.5, category: 'Hardware' },
      { user_id: uid, name: 'PVC Edge Banding 22mm', sku: 'EB-PVC-22', qty: 45, low: 20, cost: 1.8, category: 'Edge banding' }
    ]);

    ids.cabinet_templates = await insMany('cabinet_templates', [
      { user_id: uid, name: 'Base 600', type: 'base', default_w_mm: 600, default_h_mm: 720, default_d_mm: 560, default_specs: {} },
      { user_id: uid, name: 'Wall 600', type: 'wall', default_w_mm: 600, default_h_mm: 720, default_d_mm: 320, default_specs: {} },
      { user_id: uid, name: 'Drawer 800', type: 'drawer', default_w_mm: 800, default_h_mm: 720, default_d_mm: 560, default_specs: {} }
    ]);

    const quoteId = await ins1('quotes', {
      user_id: uid, client_id: clientId, name: 'Smith Kitchen Renovation',
      status: 'sent', markup: 35, tax: 10, quote_number: 'QUO-SAMPLE',
      notes: 'Sample quote — added by the ProCabinet walkthrough.'
    });
    ids.quotes.push(quoteId);
    // Bulk insert requires every row to carry the SAME keys — the labour line
    // takes explicit nulls / zeros for the cabinet-only columns. Cabinet lines
    // carry door / drawer / shelf specs so the cabinet-editor step opens onto
    // a fully configured cabinet.
    await insMany('quote_lines', [
      { quote_id: quoteId, user_id: uid, position: 0, name: 'Base 600', line_kind: 'cabinet', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 2, unit_price: 640, door_count: 2, door_pct: 100, drawer_count: 0, drawer_pct: 0, fixed_shelves: 1, adj_shelves: 0 },
      { quote_id: quoteId, user_id: uid, position: 1, name: 'Wall 600', line_kind: 'cabinet', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 2, unit_price: 480, door_count: 2, door_pct: 100, drawer_count: 0, drawer_pct: 0, fixed_shelves: 0, adj_shelves: 2 },
      { quote_id: quoteId, user_id: uid, position: 2, name: 'Drawer Base 600', line_kind: 'cabinet', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 1, unit_price: 780, door_count: 0, door_pct: 0, drawer_count: 3, drawer_pct: 100, fixed_shelves: 0, adj_shelves: 0 },
      { quote_id: quoteId, user_id: uid, position: 3, name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1800, door_count: 0, door_pct: 0, drawer_count: 0, drawer_pct: 0, fixed_shelves: 0, adj_shelves: 0 }
    ]);

    const orderId = await ins1('orders', {
      user_id: uid, client_id: clientId, quote_id: quoteId, name: 'Smith Kitchen Renovation',
      value: 8450, status: 'confirmed', due: '2026-06-12', markup: 35, tax: 10, order_number: 'ORD-SAMPLE'
    });
    ids.orders.push(orderId);
    await insMany('order_lines', [
      { order_id: orderId, user_id: uid, position: 0, name: 'Base 600', line_kind: 'cabinet', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 2, unit_price: 565 },
      { order_id: orderId, user_id: uid, position: 1, name: 'Wall 600', line_kind: 'cabinet', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 2, unit_price: 425 },
      { order_id: orderId, user_id: uid, position: 2, name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1800 }
    ]);

    // A few more orders give the production schedule a fuller multi-week
    // spread for the Schedule steps. hours_allocated drives the calendar span
    // directly, so these need no line items.
    const extraOrderIds = await insMany('orders', [
      { user_id: uid, client_id: clientId, name: 'Smith — Laundry Cabinets', value: 3200, status: 'production', due: '2026-06-26', markup: 35, tax: 10, order_number: 'ORD-SAMPLE-2', hours_allocated: 28 },
      { user_id: uid, client_id: clientId, name: 'Smith — Bathroom Vanity', value: 2650, status: 'confirmed', due: '2026-07-17', markup: 35, tax: 10, order_number: 'ORD-SAMPLE-3', hours_allocated: 36 },
      { user_id: uid, client_id: clientId, name: 'Smith — Study Built-ins', value: 6100, status: 'confirmed', due: '2026-08-14', markup: 35, tax: 10, order_number: 'ORD-SAMPLE-4', hours_allocated: 32 }
    ]);
    ids.orders.push(...extraOrderIds);

    const cutlistId = await ins1('cutlists', {
      user_id: uid, name: 'Smith Kitchen — Cut List', position: 0, ui_prefs: {}, quote_id: quoteId
    });
    ids.cutlists.push(cutlistId);
    // Seed the cut list's sheets + pieces so the cut-list steps open onto a
    // populated layout. Both cascade-delete with the cutlist row.
    await insMany('sheets', [
      { cutlist_id: cutlistId, user_id: uid, position: 0, name: '18mm Birch Plywood', w_mm: 2440, h_mm: 1220, qty: 3, grain: 'none', kerf_mm: 3 }
    ]);
    await insMany('pieces', [
      { cutlist_id: cutlistId, user_id: uid, position: 0, label: 'Side panel', w_mm: 720, h_mm: 560, qty: 4, grain: 'none' },
      { cutlist_id: cutlistId, user_id: uid, position: 1, label: 'Shelf', w_mm: 568, h_mm: 540, qty: 6, grain: 'none' },
      { cutlist_id: cutlistId, user_id: uid, position: 2, label: 'Door front', w_mm: 597, h_mm: 397, qty: 4, grain: 'none' }
    ]);
  } catch (e) {
    console.warn('[walkthrough] seed failed', e);
    // Record whatever landed so a later "clear" can still tidy up.
    await _wtPersistState({ sample_seeded: true, sample_ids: ids });
    _wtSyncHelpItem();
    return false;
  }
  await _wtPersistState({ sample_seeded: true, sample_ids: ids });
  _wtSyncHelpItem();
  return true;
}

/**
 * Remove the seeded sample project (behind a confirm). Deletes child lines
 * first, then parents in reverse-FK order, clears sample_ids, reloads data.
 */
function _wtClearSampleData() {
  const ob = _wtW._onboardingState || {};
  const ids = ob.sample_ids || {};
  const has = ob.sample_seeded && Object.keys(ids).some((/** @type {string} */ k) => (ids[k] || []).length > 0);
  if (!has) {
    if (typeof _wtW._toast === 'function') _wtW._toast('No sample data to clear', 'error');
    return;
  }
  const doClear = async () => {
    const db = _wtW._db;
    /** @param {string} table @param {string} col @param {number[]} vals */
    const del = async (table, col, vals) => {
      if (!vals || !vals.length) return;
      try { await db(table).delete().in(col, vals); }
      catch (e) { console.warn('[walkthrough] clear ' + table, e); }
    };
    await del('order_lines', 'order_id', ids.orders || []);
    await del('quote_lines', 'quote_id', ids.quotes || []);
    await del('orders', 'id', ids.orders || []);
    await del('cutlists', 'id', ids.cutlists || []);
    await del('quotes', 'id', ids.quotes || []);
    await del('cabinet_templates', 'id', ids.cabinet_templates || []);
    await del('stock_items', 'id', ids.stock_items || []);
    await del('clients', 'id', ids.clients || []);
    await _wtPersistState({ sample_seeded: false, sample_ids: {} });
    _wtSyncHelpItem();
    if (typeof _wtW.loadAllData === 'function') {
      try { await _wtW.loadAllData(); } catch (e) { void e; }
    }
    if (typeof _wtW._toast === 'function') _wtW._toast('Sample data cleared', 'success');
  };
  document.getElementById('help-dropdown')?.classList.remove('open');
  if (typeof _wtW._confirm === 'function') {
    _wtW._confirm('Remove the sample project? This deletes the sample client, 3 cabinets, quote, order, cut list and 3 stock items.', doClear);
  } else {
    doClear();
  }
}

/** Show the Help-menu "Clear sample data" item only while sample data exists. */
function _wtSyncHelpItem() {
  const item = document.getElementById('help-clear-sample');
  if (!item) return;
  const ob = _wtW._onboardingState || {};
  item.style.display = ob.sample_seeded ? '' : 'none';
}

// ── first-run gate (M7) ──

/** @param {any} arr @returns {number} */
function _wtCount(arr) { return (arr && arr.length) ? arr.length : 0; }

/**
 * Decide whether to auto-show the walkthrough after login. Called from
 * app.js once loadAllData() has resolved (so the in-memory entity arrays and
 * window._onboardingState are populated).
 *   • dismissed at the current version  → nothing
 *   • dismissed at an older version     → re-show (a new feature shipped)
 *   • never onboarded, empty app        → seed a sample project, reload, show
 *   • never onboarded, app already used → show without seeding
 * No-ops if a tour is already on screen (guards the hourly TOKEN_REFRESHED
 * auth event from restarting a tour mid-flight).
 * @returns {Promise<void>}
 */
async function _wtMaybeAutoStart() {
  if (_wtActive) return;
  _wtSyncHelpItem();
  const ob = _wtW._onboardingState || {};
  const seenVersion = typeof ob.version === 'number' ? ob.version : 0;
  if (ob.dismissed_at && seenVersion >= WT_VERSION) return;          // current — done
  if (ob.dismissed_at && seenVersion < WT_VERSION) {                 // version-gated re-show
    _wtStart({ force: true });
    return;
  }
  // Never onboarded — seed a sample project if the app is empty so the tour
  // walks populated panels, then start.
  const empty =
    _wtCount(typeof orders !== 'undefined' && orders) === 0 &&
    _wtCount(typeof quotes !== 'undefined' && quotes) === 0 &&
    _wtCount(typeof clients !== 'undefined' && clients) === 0 &&
    _wtCount(typeof stockItems !== 'undefined' && stockItems) === 0;
  if (empty && !ob.sample_seeded) {
    const ok = await _wtSeedSampleProject();
    if (ok && typeof _wtW.loadAllData === 'function') {
      try { await _wtW.loadAllData(); } catch (e) { void e; }
    }
  }
  _wtStart({ force: true });
}

// ── public surface ──
_wtW._wtStart = _wtStart;
_wtW._wtClose = _wtClose;
_wtW._wtSeedSampleProject = _wtSeedSampleProject;
_wtW._wtClearSampleData = _wtClearSampleData;
_wtW._wtSyncHelpItem = _wtSyncHelpItem;
_wtW._wtMaybeAutoStart = _wtMaybeAutoStart;
