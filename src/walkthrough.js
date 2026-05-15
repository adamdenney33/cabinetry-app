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
 * @property {boolean} [openSettings]  Open the header Settings dropdown for this step.
 * @property {string} [target]         CSS selector to spotlight (spot steps).
 * @property {'right'|'left'|'top'|'bottom'} [position]  Preferred tooltip side.
 * @property {string} [icon]           Emoji for centred steps.
 * @property {string} title
 * @property {string} body             May contain authored <span class="wt-hi"> markup.
 * @property {string} [nextLabel]
 * @property {string[]} [flow]         Welcome-step flow chips.
 * @property {boolean} [showPricing]   Final CTA — render the pricing block.
 */

/** @type {WtStep[]} */
const _wtSteps = [
  {
    type: 'center', section: 'dashboard', icon: '🪚',
    title: 'Welcome to ProCabinet',
    body: 'We\'ve set up a sample kitchen project so you can see how everything fits together. This quick tour follows it from <span class="wt-hi">client to cut list</span>.',
    flow: ['Toolbar', 'Settings', 'Client', 'Cabinet', 'Quote', 'Order', 'Schedule', 'Stock', 'Cut List', 'Dashboard'],
    nextLabel: 'Start the tour →'
  },
  {
    type: 'spot', phase: 'Toolbar', section: 'dashboard',
    target: '#dash-toolbar', position: 'bottom',
    title: 'Start any job here',
    body: 'The toolbar\'s quick actions — <span class="wt-hi">+ Quote, + Cabinet, + Client</span> and more — are always one click away from the dashboard.'
  },
  {
    type: 'spot', phase: 'Setup', section: 'dashboard', openSettings: true,
    target: '#settings-dropdown', position: 'left',
    title: 'Set your units & preferences',
    body: 'Switch between <span class="wt-hi">metric and imperial</span>, choose your unit format and currency, and toggle dark mode. These apply everywhere — quotes, cabinets and cut lists.'
  },
  {
    type: 'spot', phase: 'Client', section: 'clients',
    target: '#clients-main', position: 'left',
    title: '1 — Your clients',
    body: 'Every job starts with a client. Add their details once and they carry through to <span class="wt-hi">quotes, orders and invoices</span>.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', subtab: 'builder',
    target: '#cb-sidebar', position: 'right',
    title: '2 — Build a cabinet',
    body: 'Set dimensions, materials, doors, drawers and shelves. ProCabinet <span class="wt-hi">prices each cabinet live</span> as you build it.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', subtab: 'rates',
    target: '#cab-view-rates', position: 'right',
    title: 'Set your rates once',
    body: 'The <span class="wt-hi">My Rates</span> tab holds your labour rate, material markup, edge-banding and contingency. Every cabinet prices itself from these — no spreadsheets.'
  },
  {
    type: 'spot', phase: 'Cabinet', section: 'cabinet', subtab: 'builder', cbView: 'library',
    target: '#cb-library-view', position: 'left',
    title: 'Reuse with the library',
    body: 'Save any cabinet to your <span class="wt-hi">library</span> as a template and drop it into future quotes — it brings its specs and costs with it.'
  },
  {
    type: 'spot', phase: 'Quote', section: 'quote',
    target: '#quote-main', position: 'left',
    title: '3 — Build the quote',
    body: 'Add cabinets, hardware and labour as line items. Totals, tax and margin <span class="wt-hi">roll up automatically</span>, and you can send it as a branded PDF.'
  },
  {
    type: 'spot', phase: 'Order', section: 'orders',
    target: '#orders-main', position: 'left',
    title: '4 — Turn it into an order',
    body: 'When a quote is approved, convert it to an order in one click and track it through the <span class="wt-hi">production pipeline</span> — confirmed, in production, delivery, complete.'
  },
  {
    type: 'spot', phase: 'Schedule', section: 'schedule',
    target: '#schedule-main', position: 'top',
    title: '5 — Schedule the work',
    body: 'ProCabinet <span class="wt-hi">auto-schedules</span> your orders around your working hours, so you always know what\'s in the workshop and when.'
  },
  {
    type: 'spot', phase: 'Stock', section: 'stock',
    target: '#stock-main', position: 'left',
    title: '6 — Track your stock',
    body: 'Keep sheet goods and hardware here with <span class="wt-hi">low-stock alerts</span>. Cut lists can deduct used sheets straight from your inventory.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    target: '.cl-left', position: 'right',
    title: '7 — Plan your cuts',
    body: 'Add the sheets and pieces for a job. The cut list is <span class="wt-hi">yours to drive</span> — pull in stock panels and lay out every part.'
  },
  {
    type: 'spot', phase: 'Cut List', section: 'cutlist',
    target: '.cl-right', position: 'left',
    title: 'Optimised sheet layouts',
    body: 'ProCabinet <span class="wt-hi">nests your pieces</span> onto each sheet for minimum waste, shows the cut order, and exports a PDF for the workshop.'
  },
  {
    type: 'spot', phase: 'Dashboard', section: 'dashboard',
    target: '#dashboard-main', position: 'top',
    title: 'It all lands here',
    body: 'Active orders, recent quotes, low stock and this week\'s schedule — your dashboard is the <span class="wt-hi">daily overview</span> of everything you just saw.'
  },
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

/** @param {string} s @returns {string} */
function _wtEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    if (step.section && typeof _wtW.switchSection === 'function') _wtW.switchSection(step.section);
    if (step.subtab && typeof _wtW.switchCabTab === 'function') _wtW.switchCabTab(step.subtab);
    if (step.cbView && typeof _wtW.switchCBMainView === 'function') _wtW.switchCBMainView(step.cbView);
  } catch (e) { console.warn('[walkthrough] context switch failed', e); }
  const sd = document.getElementById('settings-dropdown');
  if (sd) sd.classList.toggle('open', !!step.openSettings);
}

/**
 * Render step `i`. Panels render async, so spotlight measurement waits a
 * frame; missing targets retry, then fall back to a centred tooltip.
 * @param {number} i
 */
function _wtRender(i) {
  _wtCurrent = i;
  const step = _wtSteps[i];
  if (!step || !_wtOverlay) return;
  _wtApplyContext(step);
  if (step.type === 'center') { _wtDrawCenter(step, false); return; }
  // switchSection() rebuilds panels synchronously, so the target is almost
  // always measurable right now — getBoundingClientRect forces a layout flush.
  // Draw immediately when we can: no timer dependency, no flicker.
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
  // Target not ready (a panel that renders asynchronously) — retry across
  // timers, then fall back to a centred tooltip rather than strand the user.
  _wtResolveTarget(sel, 0, (el) => {
    if (!_wtActive || _wtCurrent !== i) return;       // user advanced — stale
    if (!el) { _wtDrawCenter(step, true); return; }
    try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { void e; }
    _wtDrawSpot(step, el.getBoundingClientRect());
  });
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
  const mask = document.createElement('div');
  mask.className = 'wt-mask';
  ov.appendChild(mask);
  const card = document.createElement('div');
  card.className = 'wt-center';
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
function _wtCenterHTML(step) {
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
 * 3 cabinet templates, 1 quote, 1 order, 1 cut list). The inserted row IDs are
 * recorded into onboarding_state.sample_ids so _wtClearSampleData can later
 * remove exactly these rows. Child lines cascade-delete with their parent.
 * @returns {Promise<boolean>}
 */
async function _wtSeedSampleProject() {
  if (!_userId || typeof _db !== 'function') return false;
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
    // takes explicit nulls for the cabinet-only columns.
    await insMany('quote_lines', [
      { quote_id: quoteId, user_id: uid, position: 0, name: 'Base 600', line_kind: 'cabinet', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 2, unit_price: 565 },
      { quote_id: quoteId, user_id: uid, position: 1, name: 'Wall 600', line_kind: 'cabinet', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 2, unit_price: 425 },
      { quote_id: quoteId, user_id: uid, position: 2, name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1800 }
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

    const cutlistId = await ins1('cutlists', {
      user_id: uid, name: 'Smith Kitchen — Cut List', position: 0, ui_prefs: {}, quote_id: quoteId
    });
    ids.cutlists.push(cutlistId);
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
