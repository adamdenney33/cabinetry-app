// ProCabinet — Guided walkthrough (O.2 onboarding tour).
//
// Classic <script defer>, loaded LAST so every section-switch / panel-render
// function it drives already exists. A "spotlight" tour: dims the screen,
// cuts a highlight around one real DOM element, anchors a tooltip beside it.
//
// The tour always runs over the demo seed (src/demo.js): for a guest demo
// mode is already on; for a signed-in user _wtStart flips it on for the
// tour's duration and _wtClose restores their real data. Dismissal persists
// to localStorage['pc_wt_state'] (and business_info when signed in), so a
// first-time visitor sees the tour once.
//
// Public surface (window globals — classic-script top-level functions):
//   _wtStart(opts)      — begin the tour (async; opts.force kept for the
//                         Help re-trigger).
//   _wtClose(reason)    — tear down. reason: 'completed' | 'skipped'.
//   _wtMaybeAutoStart() — first-run gate; auto-shows the tour once.
//
// Cross-file globals used: switchSection (settings.js), switchCabTab /
// switchCBMainView (cabinet-render.js). Reached via the `_wtW` any-cast so
// the type-checker doesn't need ambient decls for them.

/** Walkthrough content version. Bump when steps change materially — drives
 *  the version-gated re-show in _wtMaybeAutoStart (M7). */
const WT_VERSION = 2;

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
    type: 'spot', phase: 'Cut List', section: 'cutlist', clView: 'layout',
    target: '#sheets-table', position: 'right',
    title: 'Sheet stock',
    body: 'Pull panels in from your Stock inventory. Each sheet row sets the material, dimensions and grain direction — the optimiser uses this to <span class="wt-hi">rotate and nest pieces correctly</span>.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist', clView: 'layout',
    target: '#pieces-table', position: 'right',
    title: 'Piece list',
    body: 'Add every part you need to cut — label, length, width, quantity, grain direction and edge banding. <span class="wt-hi">You\'re in full control</span> of what goes on each sheet.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist', clView: 'layout',
    target: '#cl-action-bar', position: 'top',
    title: 'Optimise the layout',
    body: 'Hit <span class="wt-hi">Optimise Cut Layout</span> and ProCabinet nests all your pieces onto the available sheets for minimum waste, respecting grain and saw-kerf.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist', clView: 'layout',
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
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist', clView: 'library',
    target: '#cl-view-library', position: 'left',
    title: 'Cut List Library',
    body: 'Every cut list is saved here as its own entry. <span class="wt-hi">Reopen or duplicate</span> a past job, or start a fresh one — your whole cutting history in one place.'
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
      // The cut-layout steps (sheets / pieces tables, action bar) only render
      // once a cut list is open. Open the first one, then show the Cut Layout
      // view — async, but the steps' _wtWaitFor budget covers the load.
      (async () => {
        try {
          if (typeof _db === 'function' && typeof _wtW._clOpenLibraryCutlist === 'function') {
            const { data } = await _db('cutlists').select('id').order('position').limit(1);
            const id = data && data[0] && data[0].id;
            if (id != null) await _wtW._clOpenLibraryCutlist(id);
          }
          if (typeof _wtW.switchCLMainView === 'function') _wtW.switchCLMainView('layout');
        } catch (e) { console.warn('[walkthrough] cutlist gate failed', e); }
      })();
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
 * @param {{force?: boolean}} [opts]
 */
async function _wtStart(opts) {
  void opts;
  if (_wtActive) return;
  const needTempDemo = !!_userId && !window._demoMode;
  if (needTempDemo) {
    const w = _wtW;
    const dirty = !!w._cbDirty || !!w._clDirty
      || !!(w._qpState && w._qpState.dirty) || !!(w._opState && w._opState.dirty);
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
  _wtCurrent = 0;
  _wtDir = 1;
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
  // Persist dismissal — localStorage (the durable first-run gate, works for
  // guests) and business_info when signed in. _wtPersistState handles both.
  _wtPersistState({
    version: WT_VERSION,
    dismissed_at: new Date().toISOString(),
    completed: reason === 'completed',
  });
  // A finished tour suppresses the redundant dashboard "Getting Started" card.
  if (reason === 'completed') {
    try { localStorage.setItem('pc_hide_guide', '1'); } catch (e) { void e; }
  }
  // Restore the signed-in user's real data BEFORE removing the overlay, so
  // there's no flash of demo content as the panels re-render.
  if (_wtTempDemo) {
    _wtTempDemo = false;
    window._demoMode = false;
    try {
      if (typeof loadAllData === 'function') await loadAllData();
      if (typeof _loadCabinetTemplatesFromDB === 'function') await _loadCabinetTemplatesFromDB();
    } catch (e) { console.warn('[walkthrough] real-data restore failed', e); }
  }
  // Teardown — every handle cleared so a double call or a stale callback no-ops.
  if (_wtOverlay) { _wtOverlay.remove(); _wtOverlay = null; }
  _wtDestroyCursor();
  const sd = document.getElementById('settings-dropdown');
  if (sd) sd.classList.remove('open');
  const ad = document.getElementById('account-dropdown');
  if (ad) ad.classList.remove('open');
  // Land on a clean Dashboard.
  if (typeof _wtW.switchSection === 'function') {
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
  try { localStorage.setItem('pc_wt_state', JSON.stringify(next)); } catch (e) { void e; }
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
  _wtResizeTimer = setTimeout(() => { _wtResizeTimer = 0; if (_wtActive) _wtRender(_wtCurrent); }, 120);
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
 * Wait for `sel` to resolve to an on-screen, sized element, polling across
 * animation frames while a panel renders. Calls cb(el) on success, or cb(null)
 * once the budget expires. The single target-resolution mechanism for the tour.
 * @param {string} sel
 * @param {(el: HTMLElement|null) => void} cb
 */
function _wtWaitFor(sel, cb) {
  if (!sel) { cb(null); return; }
  const deadline = performance.now() + 1000;
  const tick = () => {
    if (!_wtActive) return;
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.width > 1 && r.height > 1) { cb(/** @type {HTMLElement} */ (el)); return; }
    }
    if (performance.now() >= deadline) { cb(null); return; }
    requestAnimationFrame(tick);
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
  if (next >= 0 && next < _wtSteps.length) { _wtRender(next); return; }
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

  if (step.type === 'center') { _wtApplyContext(step); _wtDrawCenter(step, false); return; }

  const proceed = () => {
    if (!_wtActive || _wtCurrent !== i) return;
    _wtApplyContext(step);
    _wtResolveAndDraw(i, step);
  };
  // A forward step gets a cursor-travel beat to the button it "clicks".
  const pre = (i > prevIdx) ? _wtGetPreClickTarget(i) : null;
  if (pre) {
    _wtCursorMoveTo(pre.cx, pre.cy);
    setTimeout(proceed, 540);
  } else {
    proceed();
  }
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
  }
  h += '<div class="wt-center-actions">';
  if (_wtCurrent > 0) h += '<button class="wt-btn wt-btn-ghost" data-wt-act="back">Back</button>';
  else h += '<button class="wt-btn wt-btn-skip" data-wt-act="skip">Skip tour</button>';
  h += '<button class="wt-btn wt-btn-primary" data-wt-act="next">' + _wtEsc(step.nextLabel || 'Next →') + '</button>';
  h += '</div>';
  return h;
}

// ── first-run gate ──

/**
 * Decide whether to auto-show the walkthrough. Called from app.js after a
 * sign-in and on guest boot, once data has hydrated.
 *   • dismissed at the current version  → nothing
 *   • dismissed at an older version     → re-show (a new feature shipped)
 *   • never onboarded                   → show
 * The app is always populated — the demo seed for a guest, or the temporary
 * demo overlay _wtStart flips on for a signed-in user — so the tour never
 * needs to seed anything. No-ops if a tour is already on screen.
 * @returns {Promise<void>}
 */
async function _wtMaybeAutoStart() {
  if (_wtActive) return;
  // localStorage is the durable first-run gate for everyone (incl. guests);
  // business_info.onboarding_state mirrors it for a signed-in user's devices.
  /** @type {any} */
  let ls = null;
  try { ls = JSON.parse(localStorage.getItem('pc_wt_state') || 'null'); } catch (e) { ls = null; }
  const ob = _wtW._onboardingState || {};
  const lsVersion = (ls && typeof ls.version === 'number') ? ls.version : -1;
  const obVersion = (typeof ob.version === 'number') ? ob.version : -1;
  const dismissed = !!((ls && ls.dismissed_at) || ob.dismissed_at);
  if (dismissed && Math.max(lsVersion, obVersion) >= WT_VERSION) return;
  _wtStart({ force: true });
}

// ── public surface ──
_wtW._wtStart = _wtStart;
_wtW._wtClose = _wtClose;
_wtW._wtMaybeAutoStart = _wtMaybeAutoStart;
