// ProCabinet — Demo dataset: full demo mode + persistent sample-data overlay.
//
// Loaded as a classic <script defer> immediately after src/db.js. Two modes:
//
// 1. FULL DEMO (`window._demoMode`) — a signed-in user running the guided
//    walkthrough (historically also the logged-out guest demo). src/db.js
//    routes every `_db()` call here instead of to Supabase:
//      • select → served from the static demo dataset (`_demoSelect`)
//      • insert / update / delete → blocked (`_demoBlockWrite`), which shows a
//        non-blocking `_demoNudge()` toast. Explicit save/create actions
//        already nudge via `_requireAuth()` / `_enforceFreeLimit()`; the
//        `_db()`-level block is a backstop so a missed guard can't escape.
//
// 2. SAMPLE-DATA OVERLAY (`window._demoOverlay`) — a signed-in account keeps
//    the demo seed visible AFTER the walkthrough, merged into normal reads,
//    until they hit "Remove demo data" on the Dashboard. Selects fetch the
//    user's real rows and append demo rows; writes pass through to Supabase
//    untouched — EXCEPT writes that target a demo row (negative id in the
//    where-filter or payload), which are blocked with an explainer toast so a
//    broken FK insert / phantom update can't happen. Activation is decided
//    once per account in `_demoOverlayInit` (loadAllData) and persisted as
//    `onboarding_state.demo_data: 'active' | 'removed'` in business_info —
//    accounts that already have real data are marked 'removed' sight unseen.
//
// Every demo id (and demo-internal FK) is NEGATIVE — see `_demoNegateIds` —
// so demo rows can never collide with real Supabase rows and `id < 0` is the
// universal "this is sample data" discriminator (used by the free-tier cap
// counts in src/limits.js and the QUO-/ORD- numbering scans).
//
// The dataset is built lazily on first use so `cbDefaultLine()` / `cbSettings`
// (cabinet.js) are available. It is immutable — the demo is read-only, so
// in-memory edits never reach it and a reload restores the pristine seed.
//
// Cross-file globals used: cbDefaultLine (cabinet.js), _toast/_confirm (ui.js),
// _userId (app.js), _wtPersistState (walkthrough.js), loadAllData (app.js),
// _track (analytics.js) — all runtime-only, so script order doesn't matter.

/** Lazily-built, memoized demo dataset, keyed by table name.
 *  @type {Record<string, any[]> | null} */
let _demoData = null;

/** Build a cabinet `default_specs` object from cbDefaultLine() + overrides. */
function _demoSpec(/** @type {Record<string, any>} */ over) {
  const base = (typeof cbDefaultLine === 'function') ? /** @type {any} */ (cbDefaultLine()) : {};
  if (base && base.id != null) delete base.id;
  return Object.assign(base, over || {});
}

/** ISO timestamp `daysAgo` days before now — keeps the seed looking recent. */
function _demoDate(/** @type {number} */ daysAgo) {
  return new Date(Date.now() - daysAgo * 86400000).toISOString();
}

/** Future ISO date (YYYY-MM-DD) `daysAhead` days from now — for order due dates. */
function _demoDue(/** @type {number} */ daysAhead) {
  return new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);
}

/** Numeric columns negated by `_demoNegateIds`. `user_id` (uuid/null) is
 *  deliberately absent; `quote_id: null` etc. stay null (typeof check). */
const _DEMO_ID_COLS = ['id', 'client_id', 'quote_id', 'order_id', 'cutlist_id', 'cabinet_id'];

/**
 * Flip every id/FK in the dataset negative, in place. Negative ids cannot
 * collide with real Supabase rows, which is what makes the sample-data
 * overlay safe: `id < 0` identifies a demo row everywhere (write blocking,
 * cap counts, numbering scans). Internal FK consistency is preserved because
 * parent and child ids negate together.
 * @param {Record<string, any[]>} data @returns {Record<string, any[]>}
 */
function _demoNegateIds(data) {
  for (const table in data) {
    for (const row of data[table]) {
      for (const col of _DEMO_ID_COLS) {
        if (typeof row[col] === 'number') row[col] = -row[col];
      }
    }
  }
  return data;
}

/**
 * Construct the demo dataset. Called once, memoized into `_demoData`. Every row
 * carries `user_id: null` so `loadAllData`'s `.eq('user_id', _userId)` filters
 * (with `_userId === null` for a guest) match. Each library is seeded to the
 * 5-item free cap; stock has 10 items. Ids are authored positive for
 * readability and re-keyed negative by `_demoNegateIds` on the way out.
 * @returns {Record<string, any[]>}
 */
function _demoBuildDataset() {
  let ql = 1, ol = 1, sh = 1, pc = 1; // child-row id counters

  /** quote_lines row with full defaults + overrides. */
  const QL = (/** @type {number} */ quoteId, /** @type {number} */ pos, /** @type {Record<string, any>} */ over) => Object.assign({
    id: ql++, quote_id: quoteId, user_id: null, position: pos,
    line_kind: 'cabinet', type: 'base', name: '',
    w_mm: 600, h_mm: 720, d_mm: 560, qty: 1, unit_price: 0,
    door_count: 0, door_pct: 0, drawer_count: 0, drawer_pct: 0,
    fixed_shelves: 0, adj_shelves: 0, discount: 0, schedule_hours: 0,
    created_at: _demoDate(24), updated_at: _demoDate(6),
  }, over);

  /** order_lines row with full defaults + overrides. */
  const OL = (/** @type {number} */ orderId, /** @type {number} */ pos, /** @type {Record<string, any>} */ over) => Object.assign({
    id: ol++, order_id: orderId, user_id: null, position: pos,
    line_kind: 'cabinet', type: 'base', name: '',
    w_mm: 600, h_mm: 720, d_mm: 560, qty: 1, unit_price: 0,
    door_count: 0, door_pct: 0, drawer_count: 0, drawer_pct: 0,
    fixed_shelves: 0, adj_shelves: 0, discount: 0,
    created_at: _demoDate(18), updated_at: _demoDate(4),
  }, over);

  /** sheets row. */
  const SH = (/** @type {number} */ cutlistId, /** @type {number} */ pos, /** @type {Record<string, any>} */ over) => Object.assign({
    id: sh++, cutlist_id: cutlistId, user_id: null, position: pos,
    name: '', w_mm: 2440, h_mm: 1220, qty: 1, grain: 'none', kerf_mm: 3, enabled: true,
    created_at: _demoDate(20),
  }, over);

  /** pieces row. */
  const PC = (/** @type {number} */ cutlistId, /** @type {number} */ pos, /** @type {Record<string, any>} */ over) => Object.assign({
    id: pc++, cutlist_id: cutlistId, user_id: null, position: pos,
    label: '', w_mm: 600, h_mm: 600, qty: 1, grain: 'none', enabled: true,
    created_at: _demoDate(20),
  }, over);

  return _demoNegateIds({
    clients: [
      { id: 1, user_id: null, name: 'Sarah Mitchell', email: 'sarah.mitchell@example.com',
        phone: '0412 558 901', address: '14 Maple Drive, Kew VIC 3101',
        notes: 'Full custom kitchen renovation — birch ply carcasses.', created_at: _demoDate(48) },
      { id: 2, user_id: null, name: 'James Whitfield', email: 'j.whitfield@example.com',
        phone: '0438 220 174', address: '8 Carlton Street, Fitzroy VIC 3065',
        notes: 'Repeat client — laundry joinery, study built-ins to follow.', created_at: _demoDate(40) },
      { id: 3, user_id: null, name: 'Priya Nair', email: 'priya.nair@example.com',
        phone: '0405 771 332', address: '52 Riversdale Road, Hawthorn VIC 3122',
        notes: 'Kitchen island with waterfall ends.', created_at: _demoDate(31) },
      { id: 4, user_id: null, name: 'Daniel & Emma Cole', email: 'cole.home@example.com',
        phone: '0421 904 558', address: '3 Helen Street, Northcote VIC 3070',
        notes: 'Home-office study built-ins, oak veneer finish.', created_at: _demoDate(22) },
      { id: 5, user_id: null, name: 'Westside Property Group', email: 'projects@westsidegroup.example',
        phone: '03 9412 7700', address: '200 Harbour Esplanade, Docklands VIC 3008',
        notes: 'Commercial — apartment fit-outs across multiple units.', created_at: _demoDate(14) },
    ],

    stock_items: [
      { id: 1, user_id: null, name: '18mm Birch Plywood', sku: 'PLY-BIR-18', category: 'Sheet material',
        supplier: 'Plyco', qty: 6, low: 8, cost: 82, w: 2440, h: 1220, thickness_mm: 18, tags: [], created_at: _demoDate(46) },
      { id: 2, user_id: null, name: '16mm White Melamine', sku: 'MEL-WHT-16', category: 'Sheet material',
        supplier: 'Polytec', qty: 22, low: 10, cost: 48, w: 3600, h: 1800, thickness_mm: 16, tags: [], created_at: _demoDate(45) },
      { id: 3, user_id: null, name: '18mm Oak Veneer MDF', sku: 'VNR-OAK-18', category: 'Sheet material',
        supplier: 'Briggs Veneers', qty: 14, low: 6, cost: 119, w: 2400, h: 1200, thickness_mm: 18, tags: [], created_at: _demoDate(43) },
      { id: 4, user_id: null, name: '12mm Standard MDF', sku: 'MDF-STD-12', category: 'Sheet material',
        supplier: 'Laminex', qty: 30, low: 12, cost: 31, w: 2400, h: 1200, thickness_mm: 12, tags: [], created_at: _demoDate(42) },
      { id: 5, user_id: null, name: 'Blum 110° Soft-close Hinge', sku: 'HW-BLM-110', category: 'Hardware',
        supplier: 'Blum', qty: 24, low: 40, cost: 4.5, tags: [], created_at: _demoDate(40) },
      { id: 6, user_id: null, name: 'Blum Tandembox Runner 500mm', sku: 'HW-BLM-TB500', category: 'Hardware',
        supplier: 'Blum', qty: 38, low: 16, cost: 28, tags: [], created_at: _demoDate(39) },
      { id: 7, user_id: null, name: 'PVC Edge Banding 22mm White', sku: 'EB-PVC-22W', category: 'Edge banding',
        supplier: 'Polytec', qty: 45, low: 20, cost: 1.8, length_m: 50, tags: [], created_at: _demoDate(37) },
      { id: 8, user_id: null, name: 'ABS Edge Banding 1mm Oak', sku: 'EB-ABS-OAK', category: 'Edge banding',
        supplier: 'Briggs Veneers', qty: 8, low: 15, cost: 2.4, length_m: 50, tags: [], created_at: _demoDate(35) },
      { id: 9, user_id: null, name: 'Matte Polyurethane Finish 4L', sku: 'FIN-PU-MAT', category: 'Finishes',
        supplier: 'Mirotone', qty: 11, low: 4, cost: 96, tags: [], created_at: _demoDate(33) },
      { id: 10, user_id: null, name: 'Cabinet Handle 128mm Brushed', sku: 'HW-HDL-128', category: 'Hardware',
        supplier: 'Hettich', qty: 60, low: 24, cost: 6.2, tags: [], created_at: _demoDate(30) },
    ],

    cabinet_templates: [
      { id: 1, user_id: null, name: 'Base Cabinet 600', type: 'base',
        default_w_mm: 600, default_h_mm: 720, default_d_mm: 560, tags: [],
        default_specs: _demoSpec({ name: 'Base Cabinet 600', w: 600, h: 720, d: 560, doors: 2, doorPct: 95, shelves: 1 }),
        created_at: _demoDate(44), updated_at: _demoDate(11) },
      { id: 2, user_id: null, name: 'Wall Cabinet 600', type: 'wall',
        default_w_mm: 600, default_h_mm: 720, default_d_mm: 320, tags: [],
        default_specs: _demoSpec({ name: 'Wall Cabinet 600', w: 600, h: 720, d: 320, doors: 2, doorPct: 95, adjShelves: 2 }),
        created_at: _demoDate(43), updated_at: _demoDate(10) },
      { id: 3, user_id: null, name: 'Drawer Base 800', type: 'drawer',
        default_w_mm: 800, default_h_mm: 720, default_d_mm: 560, tags: [],
        default_specs: _demoSpec({ name: 'Drawer Base 800', w: 800, h: 720, d: 560, drawers: 3, drawerPct: 100 }),
        created_at: _demoDate(41), updated_at: _demoDate(9) },
      { id: 4, user_id: null, name: 'Tall Pantry 600', type: 'tall',
        default_w_mm: 600, default_h_mm: 2100, default_d_mm: 560, tags: [],
        default_specs: _demoSpec({ name: 'Tall Pantry 600', w: 600, h: 2100, d: 560, doors: 2, doorPct: 100, shelves: 6 }),
        created_at: _demoDate(38), updated_at: _demoDate(8) },
      { id: 5, user_id: null, name: 'Corner Base 900', type: 'base',
        default_w_mm: 900, default_h_mm: 720, default_d_mm: 900, tags: [],
        default_specs: _demoSpec({ name: 'Corner Base 900', w: 900, h: 720, d: 900, doors: 1, doorPct: 100, shelves: 1 }),
        created_at: _demoDate(36), updated_at: _demoDate(7) },
    ],

    quotes: [
      { id: 1, user_id: null, client_id: 1, name: 'Mitchell Kitchen Renovation', status: 'approved',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, quote_number: 'QUO-1042',
        date: _demoDate(24).slice(0, 10), notes: 'Approved — converted to order ORD-0312.',
        created_at: _demoDate(24), updated_at: _demoDate(12) },
      { id: 2, user_id: null, client_id: 2, name: 'Whitfield Laundry Cabinets', status: 'sent',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, quote_number: 'QUO-1043',
        date: _demoDate(16).slice(0, 10), notes: 'Sent — awaiting client sign-off.',
        created_at: _demoDate(16), updated_at: _demoDate(5) },
      { id: 3, user_id: null, client_id: 1, name: 'Mitchell Walk-in Robe', status: 'draft',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, quote_number: 'QUO-1044',
        date: _demoDate(6).slice(0, 10), notes: 'Draft — pricing in progress.',
        created_at: _demoDate(6), updated_at: _demoDate(2) },
      { id: 4, user_id: null, client_id: 3, name: 'Nair Kitchen Island', status: 'sent',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, quote_number: 'QUO-1045',
        date: _demoDate(12).slice(0, 10), notes: 'Sent — waterfall-end island.',
        created_at: _demoDate(12), updated_at: _demoDate(4) },
      { id: 5, user_id: null, client_id: 4, name: 'Cole Study Built-ins', status: 'approved',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, quote_number: 'QUO-1046',
        date: _demoDate(20).slice(0, 10), notes: 'Approved — converted to order ORD-0315.',
        created_at: _demoDate(20), updated_at: _demoDate(9) },
    ],

    quote_lines: [
      QL(1, 0, { name: 'Base Cabinet 600', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 4, unit_price: 642, door_count: 2, door_pct: 100, fixed_shelves: 1 }),
      QL(1, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 3, unit_price: 478, door_count: 2, door_pct: 100, adj_shelves: 2 }),
      QL(1, 2, { name: 'Drawer Base 800', type: 'base', w_mm: 800, h_mm: 720, d_mm: 560, qty: 1, unit_price: 786, drawer_count: 3, drawer_pct: 100 }),
      QL(1, 3, { name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1800 }),
      QL(2, 0, { name: 'Base Cabinet 600', type: 'base', w_mm: 600, h_mm: 900, d_mm: 560, qty: 3, unit_price: 596, door_count: 2, door_pct: 100, fixed_shelves: 1 }),
      QL(2, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 600, d_mm: 320, qty: 2, unit_price: 402, door_count: 1, door_pct: 100, adj_shelves: 1 }),
      QL(2, 2, { name: 'Delivery & install', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 780 }),
      QL(3, 0, { name: 'Drawer Base 800', type: 'base', w_mm: 800, h_mm: 720, d_mm: 560, qty: 2, unit_price: 812, drawer_count: 4, drawer_pct: 100 }),
      QL(3, 1, { name: 'Tall Robe Cabinet', type: 'tall', w_mm: 900, h_mm: 2100, d_mm: 600, qty: 2, unit_price: 1340, door_count: 2, door_pct: 100, adj_shelves: 4 }),
      QL(4, 0, { name: 'Island Base 1200', type: 'base', w_mm: 1200, h_mm: 900, d_mm: 600, qty: 1, unit_price: 1480, door_count: 4, door_pct: 100, drawer_count: 2 }),
      QL(4, 1, { name: 'Base Cabinet 600', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 2, unit_price: 642, door_count: 2, door_pct: 100, fixed_shelves: 1 }),
      QL(4, 2, { name: 'Install & stone liaison', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1100 }),
      QL(5, 0, { name: 'Tall Pantry 600', type: 'tall', w_mm: 600, h_mm: 2100, d_mm: 560, qty: 2, unit_price: 1190, door_count: 2, door_pct: 100, fixed_shelves: 6 }),
      QL(5, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 3, unit_price: 478, door_count: 2, door_pct: 100, adj_shelves: 2 }),
      QL(5, 2, { name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1450 }),
    ],

    orders: [
      { id: 1, user_id: null, client_id: 1, quote_id: 1, name: 'Mitchell Kitchen Renovation',
        value: 8450, status: 'production', due: _demoDue(20), order_number: 'ORD-0312',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 1, hours_allocated: 42,
        auto_schedule: true, created_at: _demoDate(12), updated_at: _demoDate(3) },
      { id: 2, user_id: null, client_id: 2, quote_id: null, name: 'Whitfield Laundry Cabinets',
        value: 3200, status: 'confirmed', due: _demoDue(34), order_number: 'ORD-0313',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 3, hours_allocated: 24,
        auto_schedule: true, created_at: _demoDate(8), updated_at: _demoDate(2) },
      { id: 3, user_id: null, client_id: 1, quote_id: null, name: 'Mitchell Bathroom Vanity',
        value: 2650, status: 'confirmed', due: _demoDue(55), order_number: 'ORD-0314',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 4, hours_allocated: 18,
        auto_schedule: true, created_at: _demoDate(5), updated_at: _demoDate(1) },
      { id: 4, user_id: null, client_id: 4, quote_id: 5, name: 'Cole Study Built-ins',
        value: 5980, status: 'production', due: _demoDue(12), order_number: 'ORD-0315',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 1, hours_allocated: 33,
        auto_schedule: true, created_at: _demoDate(9), updated_at: _demoDate(2) },
      { id: 5, user_id: null, client_id: 5, quote_id: null, name: 'Westside Apartment 12B',
        value: 11200, status: 'confirmed', due: _demoDue(68), order_number: 'ORD-0316',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 2, hours_allocated: 56,
        auto_schedule: true, created_at: _demoDate(3), updated_at: _demoDate(1) },
      // Completed orders — backdated across the last 6 months so the dashboard
      // Monthly Revenue chart (orders.status === 'complete', bucketed by
      // created_at month) actually has data to render.
      { id: 6, user_id: null, client_id: 1, quote_id: null, name: 'Mitchell Pantry Refurb',
        value: 4200, status: 'complete', due: _demoDue(-140), order_number: 'ORD-0298',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 3, hours_allocated: 22,
        auto_schedule: false, created_at: _demoDate(158), updated_at: _demoDate(138) },
      { id: 7, user_id: null, client_id: 3, quote_id: null, name: 'Nair Walk-in Robe',
        value: 7850, status: 'complete', due: _demoDue(-105), order_number: 'ORD-0299',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 2, hours_allocated: 38,
        auto_schedule: false, created_at: _demoDate(127), updated_at: _demoDate(103) },
      { id: 8, user_id: null, client_id: 2, quote_id: null, name: 'Whitfield Study Built-ins',
        value: 3400, status: 'complete', due: _demoDue(-72), order_number: 'ORD-0300',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 3, hours_allocated: 19,
        auto_schedule: false, created_at: _demoDate(95), updated_at: _demoDate(70) },
      { id: 9, user_id: null, client_id: 5, quote_id: null, name: 'Westside Apartment 8C',
        value: 9600, status: 'complete', due: _demoDue(-42), order_number: 'ORD-0301',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 2, hours_allocated: 48,
        auto_schedule: false, created_at: _demoDate(64), updated_at: _demoDate(40) },
      { id: 10, user_id: null, client_id: 4, quote_id: null, name: 'Cole Mudroom Cabinetry',
        value: 5750, status: 'complete', due: _demoDue(-14), order_number: 'ORD-0302',
        markup: 35, tax: 10, discount: 0, stock_markup: 0, priority: 3, hours_allocated: 28,
        auto_schedule: false, created_at: _demoDate(33), updated_at: _demoDate(12) },
    ],

    order_lines: [
      OL(1, 0, { name: 'Base Cabinet 600', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 4, unit_price: 565, door_count: 2, fixed_shelves: 1 }),
      OL(1, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 3, unit_price: 425, door_count: 2, adj_shelves: 2 }),
      OL(1, 2, { name: 'Drawer Base 800', type: 'base', w_mm: 800, h_mm: 720, d_mm: 560, qty: 1, unit_price: 690, drawer_count: 3 }),
      OL(1, 3, { name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1800 }),
      OL(2, 0, { name: 'Base Cabinet 600', type: 'base', w_mm: 600, h_mm: 900, d_mm: 560, qty: 3, unit_price: 520, door_count: 2 }),
      OL(2, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 600, d_mm: 320, qty: 2, unit_price: 360, door_count: 1 }),
      OL(3, 0, { name: 'Vanity Cabinet 900', type: 'base', w_mm: 900, h_mm: 820, d_mm: 480, qty: 1, unit_price: 1180, door_count: 2, drawer_count: 1 }),
      OL(4, 0, { name: 'Tall Pantry 600', type: 'tall', w_mm: 600, h_mm: 2100, d_mm: 560, qty: 2, unit_price: 1090, door_count: 2, fixed_shelves: 6 }),
      OL(4, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 3, unit_price: 425, door_count: 2 }),
      OL(4, 2, { name: 'Install & fit-off', line_kind: 'labour', type: null, w_mm: null, h_mm: null, d_mm: null, qty: 1, unit_price: 1450 }),
      OL(5, 0, { name: 'Base Cabinet 600', type: 'base', w_mm: 600, h_mm: 720, d_mm: 560, qty: 6, unit_price: 560, door_count: 2 }),
      OL(5, 1, { name: 'Wall Cabinet 600', type: 'wall', w_mm: 600, h_mm: 720, d_mm: 320, qty: 6, unit_price: 410, door_count: 2 }),
    ],

    cutlists: [
      { id: 1, user_id: null, name: 'Mitchell Kitchen — Cut List', position: 0, quote_id: 1,
        ui_prefs: {}, tags: [], created_at: _demoDate(22), updated_at: _demoDate(7) },
      { id: 2, user_id: null, name: 'Whitfield Laundry — Cut List', position: 1, quote_id: 2,
        ui_prefs: {}, tags: [], created_at: _demoDate(15), updated_at: _demoDate(5) },
      { id: 3, user_id: null, name: 'Nair Kitchen Island — Cut List', position: 2, quote_id: 4,
        ui_prefs: {}, tags: [], created_at: _demoDate(11), updated_at: _demoDate(4) },
      { id: 4, user_id: null, name: 'Cole Study — Cut List', position: 3, quote_id: 5,
        ui_prefs: {}, tags: [], created_at: _demoDate(18), updated_at: _demoDate(6) },
      { id: 5, user_id: null, name: 'Westside 12B — Cut List', position: 4, quote_id: null,
        ui_prefs: {}, tags: [], created_at: _demoDate(3), updated_at: _demoDate(1) },
    ],

    sheets: [
      SH(1, 0, { name: '18mm Birch Plywood', w_mm: 2440, h_mm: 1220, qty: 4, grain: 'length' }),
      SH(1, 1, { name: '16mm White Melamine', w_mm: 3600, h_mm: 1800, qty: 2, grain: 'none' }),
      SH(2, 0, { name: '16mm White Melamine', w_mm: 3600, h_mm: 1800, qty: 2, grain: 'none' }),
      SH(3, 0, { name: '18mm Oak Veneer MDF', w_mm: 2400, h_mm: 1200, qty: 3, grain: 'length' }),
      SH(4, 0, { name: '18mm Oak Veneer MDF', w_mm: 2400, h_mm: 1200, qty: 3, grain: 'length' }),
      SH(5, 0, { name: '16mm White Melamine', w_mm: 3600, h_mm: 1800, qty: 5, grain: 'none' }),
    ],

    pieces: [
      PC(1, 0, { label: 'Side panel', w_mm: 720, h_mm: 560, qty: 8, grain: 'length' }),
      PC(1, 1, { label: 'Fixed shelf', w_mm: 568, h_mm: 540, qty: 4, grain: 'length' }),
      PC(1, 2, { label: 'Door front', w_mm: 597, h_mm: 715, qty: 8, grain: 'length' }),
      PC(1, 3, { label: 'Drawer front', w_mm: 797, h_mm: 178, qty: 3, grain: 'length' }),
      PC(1, 4, { label: 'Top / bottom', w_mm: 568, h_mm: 560, qty: 6, grain: 'length' }),
      PC(2, 0, { label: 'Side panel', w_mm: 900, h_mm: 560, qty: 6, grain: 'none' }),
      PC(2, 1, { label: 'Shelf', w_mm: 568, h_mm: 540, qty: 5, grain: 'none' }),
      PC(3, 0, { label: 'Waterfall end', w_mm: 900, h_mm: 600, qty: 2, grain: 'length' }),
      PC(3, 1, { label: 'Island top panel', w_mm: 1200, h_mm: 600, qty: 1, grain: 'length' }),
      PC(4, 0, { label: 'Pantry side', w_mm: 2100, h_mm: 560, qty: 4, grain: 'length' }),
      PC(4, 1, { label: 'Pantry shelf', w_mm: 568, h_mm: 540, qty: 12, grain: 'length' }),
      PC(5, 0, { label: 'Side panel', w_mm: 720, h_mm: 560, qty: 12, grain: 'none' }),
      PC(5, 1, { label: 'Door front', w_mm: 597, h_mm: 715, qty: 12, grain: 'none' }),
    ],

    cutlist_cabinets: [
      { cutlist_id: 1, cabinet_id: 1, user_id: null, created_at: _demoDate(22) },
      { cutlist_id: 1, cabinet_id: 2, user_id: null, created_at: _demoDate(22) },
      { cutlist_id: 4, cabinet_id: 4, user_id: null, created_at: _demoDate(18) },
    ],

    business_info: [
      { id: 1, user_id: null, name: 'Maple & Oak Cabinetry',
        email: 'studio@mapleoak.example', phone: '0412 887 220',
        address: '27 Workshop Lane, Brunswick VIC 3056', abn: '24 115 778 003',
        bank_details: 'Maple & Oak Cabinetry\nBSB 063-000   Acct 1122 3344',
        logo_url: null, onboarding_state: {},
        default_labour_rate: 75, default_markup_pct: 35, default_tax_pct: 10,
        default_deposit_pct: 30, default_edging_per_m: 2.5,
        default_labour_times: {}, default_base_types: [], default_constructions: [],
        default_edge_banding: [], default_carcass_types: [], default_door_types: [],
        default_drawer_front_types: [], default_drawer_box_types: [],
        created_at: _demoDate(48), updated_at: _demoDate(2) },
    ],

    subscriptions: [],
    schedule_day_overrides: [],
  });
}

/** Return the demo rows for `table`, building the dataset on first use. */
function _demoTable(/** @type {string} */ table) {
  if (!_demoData) _demoData = _demoBuildDataset();
  return _demoData[table] || (_demoData[table] = []);
}

/**
 * Match one row value against a PostgREST-style filter expression as built by
 * `_DBBuilder` (`eq.X`, `is.null`, `is.not.null`, `in.(a,b,c)`).
 * @param {any} rowVal
 * @param {string} expr
 * @returns {boolean}
 */
function _demoWhereMatch(rowVal, expr) {
  if (expr === 'is.null') return rowVal == null;
  if (expr === 'is.not.null') return rowVal != null;
  if (expr.indexOf('eq.') === 0) return String(rowVal) === expr.slice(3);
  if (expr.indexOf('in.(') === 0) {
    return expr.slice(4, -1).split(',').indexOf(String(rowVal)) !== -1;
  }
  return true;
}

/**
 * Sort `rows` in place the way PostgREST would for `order(col, {ascending})`
 * — nulls last either direction. Shared by `_demoSelect` and the overlay
 * merge (which must re-sort after appending demo rows to server rows).
 * @param {any[]} rows @param {string | null} key @param {boolean} asc
 * @returns {any[]}
 */
function _demoSortRows(rows, key, asc) {
  if (!key) return rows;
  const dir = asc ? 1 : -1;
  rows.sort(/** @param {any} a @param {any} b */ (a, b) => {
    const av = a[key], bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return av > bv ? dir : av < bv ? -dir : 0;
  });
  return rows;
}

/**
 * Attach the `cutlist_cabinets(cabinet_id, cabinet_templates(name))` embedded
 * select to demo cutlist rows when the builder asked for it. Returns copies —
 * the memoized seed rows stay clean.
 * @param {any} builder a `_DBBuilder` instance @param {any[]} rows demo rows
 * @returns {any[]}
 */
function _demoAttachEmbeds(builder, rows) {
  if (typeof builder._sel !== 'string' || builder._sel.indexOf('cutlist_cabinets') === -1) return rows;
  const links = _demoTable('cutlist_cabinets');
  const tpls = _demoTable('cabinet_templates');
  return rows.map(/** @param {any} r */ r => Object.assign({}, r, {
    cutlist_cabinets: links
      .filter(/** @param {any} l */ l => l.cutlist_id === r.id)
      .map(/** @param {any} l */ l => {
        const t = tpls.find(/** @param {any} x */ x => x.id === l.cabinet_id);
        return { cabinet_id: l.cabinet_id, cabinet_templates: t ? { name: t.name } : null };
      }),
  }));
}

/**
 * Demo rows for a builder's table matching its where-filters. `skipUserId`
 * (overlay mode) ignores the `user_id` filter: seed rows carry
 * `user_id: null`, which can never equal a signed-in user's uuid, but in the
 * overlay they belong to the account visually.
 * @param {any} builder a `_DBBuilder` instance @param {boolean} skipUserId
 * @returns {any[]}
 */
function _demoFilterRows(builder, skipUserId) {
  let rows = _demoTable(builder._t).slice();
  const where = builder._where || {};
  for (const col in where) {
    if (skipUserId && col === 'user_id') continue;
    rows = rows.filter(/** @param {any} r */ r => _demoWhereMatch(r[col], where[col]));
  }
  return rows;
}

/**
 * Resolve a `_DBBuilder` select against the demo dataset. Mirrors the shape the
 * real `fetch` branch resolves with: `{ data, error }`.
 * @param {any} builder a `_DBBuilder` instance
 * @returns {{ data: any, error: any }}
 */
function _demoSelect(builder) {
  let rows = _demoFilterRows(builder, false);
  _demoSortRows(rows, builder._orderBy, builder._orderAsc);
  if (builder._lim != null) rows = rows.slice(0, builder._lim);
  rows = _demoAttachEmbeds(builder, rows);
  return { data: builder._isSingle ? (rows[0] || null) : rows, error: null };
}

/** Timestamp (ms) of the last demo nudge, for debouncing — see `_demoNudge`. */
let _demoNudgeAt = 0;

/**
 * Non-blocking "this is a demo" nudge. Shown when a guest tries to save in the
 * read-only demo, in place of the full sign-in screen — they stay exactly where
 * they are and keep exploring, and can sign in via the demo banner or account
 * menu whenever they're ready. Debounced so rapid inline edits (e.g. dragging a
 * dimension field) can't spam the toast stack.
 */
function _demoNudge() {
  // Guests only. A signed-in user mid-walkthrough also runs in demo mode, but
  // telling them to "sign in" would be nonsense — stay silent for them.
  if (typeof _userId !== 'undefined' && _userId) return;
  const now = Date.now();
  if (now - _demoNudgeAt < 4000) return;
  _demoNudgeAt = now;
  if (typeof _toast === 'function') {
    _toast("You're exploring the demo — sign in to save your work.", 'info');
  }
}

/**
 * Block a write in demo mode. A logged-out visitor gets a gentle nudge (the
 * explicit-action guards in the app normally catch this first via `_requireAuth`
 * / `_enforceFreeLimit`; this is the backstop). Returns a benign result so the
 * caller can't crash.
 * @param {any} builder a `_DBBuilder` instance
 * @returns {{ data: any, error: any }}
 */
function _demoBlockWrite(builder) {
  _demoNudge();
  return { data: builder && builder._isSingle ? null : [], error: { message: 'Sign in to save your work', _demo: true } };
}

// ══════════════════════════════════════════
// SAMPLE-DATA OVERLAY (persistent demo data)
// ══════════════════════════════════════════
// Active when `window._demoOverlay` is true and `window._demoMode` is false
// (full demo mode wins while the walkthrough runs). src/db.js consults the
// helpers below from `_DBBuilder.then()`.

/** Content tables the overlay merges demo rows into. Deliberately absent:
 *  business_info (the user's OWN settings/letterhead), subscriptions
 *  (real billing state), schedule_day_overrides. */
const _DEMO_OVERLAY_TABLES = new Set([
  'clients', 'stock_items', 'cabinet_templates',
  'quotes', 'quote_lines', 'orders', 'order_lines',
  'cutlists', 'sheets', 'pieces', 'cutlist_cabinets',
]);

/** @param {string} table */
function _demoOverlayHandles(table) { return _DEMO_OVERLAY_TABLES.has(table); }

/**
 * True when a select can ONLY match demo rows — an id-ish where-filter pinned
 * to a negative id (`eq.-N`, or `in.(…)` of all-negative ids). Real rows have
 * positive ids, so the network round-trip is skipped and the demo dataset
 * answers directly (e.g. opening a demo cut list loads sheets/pieces by
 * `cutlist_id=eq.-2`).
 * @param {any} builder a `_DBBuilder` instance
 */
function _demoOverlaySelectsDemoOnly(builder) {
  const w = builder._where || {};
  for (const col in w) {
    if (col === 'user_id' || (col !== 'id' && !/_id$/.test(col))) continue;
    const v = String(w[col]);
    if (v.indexOf('eq.-') === 0) return true;
    if (v.indexOf('in.(') === 0) {
      const parts = v.slice(4, -1).split(',');
      if (parts.length && parts.every(s => s.trim().charAt(0) === '-')) return true;
    }
  }
  return false;
}

/**
 * Serve a select purely from the demo dataset, ignoring the `user_id` filter
 * (seed rows carry `user_id: null`, which never equals a signed-in uuid, but
 * in the overlay they belong to the account visually).
 * @param {any} builder a `_DBBuilder` instance
 * @returns {{ data: any, error: any }}
 */
function _demoOverlaySelect(builder) {
  let rows = _demoFilterRows(builder, true);
  _demoSortRows(rows, builder._orderBy, builder._orderAsc);
  if (builder._lim != null) rows = rows.slice(0, builder._lim);
  rows = _demoAttachEmbeds(builder, rows);
  return { data: builder._isSingle ? (rows[0] || null) : rows, error: null };
}

/**
 * Merge matching demo rows into a resolved server select. Errors pass through
 * untouched (demo rows must never mask a real failure). Lists are re-sorted
 * by the builder's order so demo rows interleave naturally; `.single()` falls
 * back to a demo match only when the server found nothing.
 * @param {any} builder a `_DBBuilder` instance
 * @param {{ data: any, error: any }} res the real fetch's resolved value
 * @returns {{ data: any, error: any }}
 */
function _demoOverlayMergeResult(builder, res) {
  if (!res || res.error) return res;
  let demoRows = _demoFilterRows(builder, true);
  if (!demoRows.length) return res;
  demoRows = _demoAttachEmbeds(builder, demoRows);
  if (builder._isSingle) {
    return res.data != null ? res : { data: demoRows[0] || null, error: null };
  }
  const merged = (Array.isArray(res.data) ? res.data : []).concat(demoRows);
  _demoSortRows(merged, builder._orderBy, builder._orderAsc);
  return { data: builder._lim != null ? merged.slice(0, builder._lim) : merged, error: null };
}

/**
 * True when a write would touch demo rows: a negative id in an id-ish
 * where-filter (update/delete on a demo row) or in the payload's top-level
 * id/FK columns (inserting a child into a demo parent, or re-linking a real
 * row to a demo entity — e.g. a new quote pointed at a demo client, which
 * would be an FK violation server-side).
 * @param {any} builder a `_DBBuilder` instance
 */
function _demoOverlayTargetsDemo(builder) {
  const w = builder._where || {};
  for (const col in w) {
    if (col === 'user_id' || (col !== 'id' && !/_id$/.test(col))) continue;
    const v = String(w[col]);
    if (v.indexOf('eq.-') === 0) return true;
    if (v.indexOf('in.(') === 0 && v.slice(4, -1).split(',').some(s => s.trim().charAt(0) === '-')) return true;
  }
  const bodies = Array.isArray(builder._body) ? builder._body : (builder._body != null ? [builder._body] : []);
  for (const b of bodies) {
    for (const k in b) {
      if (k === 'user_id' || (k !== 'id' && !/_id$/.test(k))) continue;
      if (typeof b[k] === 'number' && b[k] < 0) return true;
    }
  }
  return false;
}

/** Timestamp (ms) of the last overlay block toast, for debouncing — editor
 *  autosaves retry every few seconds and must not stack toasts. */
let _demoOverlayToastAt = 0;

/**
 * Block a write aimed at demo rows while the overlay is on. Unlike the full
 * demo mode's silent backstop, this always explains itself (debounced): the
 * user is signed in and their OWN writes save fine, so a refused edit needs a
 * why and a way out.
 * @param {any} builder a `_DBBuilder` instance
 * @returns {{ data: any, error: any }}
 */
function _demoOverlayBlockWrite(builder) {
  const now = Date.now();
  if (now - _demoOverlayToastAt > 4000) {
    _demoOverlayToastAt = now;
    if (typeof _toast === 'function') {
      _toast('That’s sample data — it can’t be changed. Use “Remove demo data” on the Dashboard when you’re done exploring.', 'info');
    }
  }
  return { data: builder && builder._isSingle ? null : [], error: { message: 'Sample data is read-only', _demo: true } };
}

/**
 * Decide whether this account shows the sample-data overlay, then merge the
 * seed into the boot arrays. Called from loadAllData after orders/quotes/
 * stockItems/clients are assigned and business_info has hydrated
 * `_onboardingState` (the early-boot fetches bypass `_db()`, so the boot
 * arrays must be merged here rather than in the builder).
 *
 * Decision, first boot only (then persisted via `_wtPersistState`):
 *   • account has any real content → 'removed' (existing users never see it)
 *   • account is empty             → 'active'
 * Skipped entirely while the walkthrough's full demo mode owns the data —
 * the arrays hold seed rows then, so the emptiness check would lie.
 */
function _demoOverlayInit() {
  if (window._demoMode) return;
  if (typeof _userId === 'undefined' || !_userId) { window._demoOverlay = false; return; }
  // Session latch: once removed, stay removed — even if a reload's
  // business_info select races (or loses) the 'removed' upsert.
  if (_demoRemovedLatch) { window._demoOverlay = false; return; }
  const ob = _demoW._onboardingState || {};
  /** @type {string | null} */
  let st = (ob.demo_data === 'active' || ob.demo_data === 'removed') ? ob.demo_data : null;
  if (!st) {
    // LS fallback (same account-stamped key _wtPersistState writes) — covers a
    // prior decision whose business_info upsert didn't land.
    try {
      const ls = JSON.parse(localStorage.getItem('pc_wt_state') || 'null');
      if (ls && ls.user_id === _userId && (ls.demo_data === 'active' || ls.demo_data === 'removed')) st = ls.demo_data;
    } catch (e) { /* storage blocked / bad JSON — fall through */ }
  }
  if (!st) {
    const empty = !(clients && clients.length) && !(quotes && quotes.length)
      && !(orders && orders.length) && !(stockItems && stockItems.length);
    st = empty ? 'active' : 'removed';
    if (typeof _wtPersistState === 'function') _wtPersistState({ demo_data: st });
  }
  window._demoOverlay = st === 'active';
  if (window._demoOverlay) _demoOverlayMergeBoot();
}

/**
 * Merge the seed into the four boot arrays, idempotently (strips any demo
 * rows already present first — loadAllData's `_db()` fallback path merges in
 * the builder, the early-boot path doesn't, and this runs after both). Sorts
 * mirror loadAllData's query orders so demo rows interleave naturally.
 */
function _demoOverlayMergeBoot() {
  /** @param {any[]} arr */
  const strip = arr => (arr || []).filter(r => !(r && typeof r.id === 'number' && r.id < 0));
  orders = _demoSortRows(strip(orders).concat(_demoTable('orders')), 'created_at', false);
  quotes = _demoSortRows(strip(quotes).concat(_demoTable('quotes')), 'created_at', false);
  clients = _demoSortRows(strip(clients).concat(_demoTable('clients')), 'name', true);
  // Shallow-copy the seed rows so later overlay edits can't mutate the seed.
  const demoStock = _demoTable('stock_items').map(/** @param {any} s */ s => ({ ...s }));
  stockItems = _demoSortRows(strip(stockItems).concat(demoStock), 'created_at', true);
}

/** True once the user removed the demo data this session — _demoOverlayInit
 *  honours it unconditionally so a reload can never resurrect the overlay
 *  from a stale business_info read. */
let _demoRemovedLatch = false;

/**
 * Dashboard "Remove demo data" button. Flips the persisted flag and reloads
 * in place — nothing is deleted server-side because nothing demo was ever
 * written there. The user's own rows are untouched by construction.
 */
function _demoRemoveData() {
  const doRemove = async () => {
    window._demoOverlay = false;
    _demoRemovedLatch = true;
    // Await the persist: loadAllData below re-reads business_info, and the
    // select must not race the 'removed' upsert (the latch covers a loss, but
    // the next device/boot reads whatever actually landed).
    try { if (typeof _wtPersistState === 'function') await _wtPersistState({ demo_data: 'removed' }); }
    catch (e) { console.warn('[demo] removal persist failed', e); }
    if (typeof _track === 'function') _track('demo_data_removed');
    // A demo cut list open in the editor lives in cutlist.js module state that
    // loadAllData doesn't touch — exit library-edit so demo parts can't linger.
    try {
      if (typeof _clCurrentCutlistId !== 'undefined' && typeof _clCurrentCutlistId === 'number'
          && _clCurrentCutlistId < 0 && typeof _demoW._clExitLibraryEdit === 'function') {
        _demoW._clExitLibraryEdit();
      }
    } catch (e) { /* best-effort */ }
    try {
      if (typeof loadAllData === 'function') await loadAllData();
      if (typeof _loadCabinetTemplatesFromDB === 'function') await _loadCabinetTemplatesFromDB();
      if (typeof renderCBLibraryView === 'function') { try { renderCBLibraryView(); } catch (e) { void e; } }
    } catch (e) { console.warn('[demo] post-removal reload failed', e); }
    if (typeof _toast === 'function') _toast('Demo data removed — the app is all yours.', 'success');
  };
  if (typeof _confirm === 'function') {
    _confirm('Remove the demo data? Everything you created yourself stays.', doRemove);
  } else { doRemove(); }
}

const _demoW = /** @type {any} */ (window);
_demoW._demoSelect = _demoSelect;
_demoW._demoBlockWrite = _demoBlockWrite;
_demoW._demoNudge = _demoNudge;
_demoW._demoBuildDataset = _demoBuildDataset;
_demoW._demoOverlayInit = _demoOverlayInit;
_demoW._demoRemoveData = _demoRemoveData;
