// ProCabinet — Stock helpers + main stock view (carved out of src/app.js
// in phase E carve 8 — helpers — and carve 13 — STOCK section appended).
//
// Loaded as a classic <script defer> BEFORE src/app.js. Declares state:
//   - stockLibraries (helpers; loaded via loadStockLibraries() in app.js INIT)
//   - stockItems, clients, projects, stockNextId, STOCK_CATS (STOCK section;
//     stockItems is read by renderStockMain() called from app.js INIT)
//
// Note: `clients` and `projects` lived historically inside the STOCK section
// banner range despite belonging conceptually to clients.js. They came along
// with this carve and resolve through the global lexical environment for
// callers in src/clients.js / src/projects.js / src/quotes.js / src/orders.js.
// Relocation to clients.js is deferred (cosmetic).
//
// File order: helpers come first (function declarations hoist; `let
// stockLibraries` lives inside the helpers block), then the STOCK section
// proper (state + main render + CRUD). Classic-script semantics resolve
// the cross-references at runtime regardless of source-position order.
//
// Cross-file dependencies referenced from this file's functions:
//   sheets (app.js CUTLIST), setStockQty (defined in this file's STOCK
//   block), addSheet (app.js CUTLIST), _toast / _confirm / _openPopup /
//   _closePopup / _popupVal / _escHtml (ui.js / app.js), switchSection
//   (src/settings.js), _userId / _db / _dbInsertSafe (src/db.js /
//   src/clients.js), renderStockMain / _updateStockBadge (defined here),
//   getBizInfo (src/business.js), window.units / window.currency
//   (src/settings.js).

// ══════════════════════════════════════════
// STOCK HELPERS
// ══════════════════════════════════════════
function removeUsedSheets() {
  if (typeof results === 'undefined' || !results || !results.layouts || !results.layouts.length) {
    _toast('Run an optimization first to see which sheets are used', 'error'); return;
  }
  const sheetsUsed = results.layouts.length;
  _confirm(`Remove ${sheetsUsed} used sheet${sheetsUsed!==1?'s':''} from stock?`, () => {
    // Find matching stock item and decrement
    const sheetName = sheets[0]?.material || '';
    const stockItem = stockItems.find(s => s.name.toLowerCase().includes(sheetName.toLowerCase().split(' ')[0]));
    if (stockItem) {
      const newQty = Math.max(0, (stockItem.qty ?? 0) - sheetsUsed);
      setStockQty(stockItem.id, newQty);
      _toast(`Removed ${sheetsUsed} sheet${sheetsUsed!==1?'s':''} from "${stockItem.name}" (${(stockItem.qty ?? 0) + sheetsUsed} → ${newQty})`, 'success');
    } else {
      _toast('No matching stock item found — update stock manually', 'info');
    }
  }, false);
}

/** @param {number} id */
function useStockInCutList(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  addSheet(item.name, item.w ?? undefined, item.h ?? undefined, Math.max(1, item.qty ?? 0));
  _toast(`"${item.name}" added to cut list`, 'success');
  switchSection('cutlist');
}

// ── Stock Libraries ──
/** @type {any[]} */
let stockLibraries = [];
function loadStockLibraries() { try { stockLibraries = JSON.parse(localStorage.getItem('pc_stock_libraries')||'[]'); } catch(e) { stockLibraries=[]; } }
function saveStockLibraries() { localStorage.setItem('pc_stock_libraries', JSON.stringify(stockLibraries)); }

function toggleStockLibraries() {}

/** @param {string} nameArg */
function saveStockLibrary(nameArg) {
  const name = (nameArg || '').trim();
  if (!name) { _toast('Enter a library name', 'error'); return; }
  const lib = {
    id: Date.now(), name,
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    items: JSON.parse(JSON.stringify(stockItems)),
    categories: JSON.parse(localStorage.getItem('pc_stock_cats')||'{}'),
    suppliers: JSON.parse(localStorage.getItem('pc_stock_suppliers')||'{}')
  };
  stockLibraries.unshift(lib);
  saveStockLibraries();
  _toast(`Library "${name}" saved`, 'success');
}

/** @param {number} idx */
function loadStockLibrary(idx) {
  const lib = stockLibraries[idx];
  if (!lib) return;
  _confirm(`Load "${lib.name}"? This will replace current stock.`, () => {
    // Clear current and load
    stockItems.length = 0;
    (lib.items||[]).forEach(/** @param {any} item */ item => stockItems.push(item));
    if (lib.categories) localStorage.setItem('pc_stock_cats', JSON.stringify(lib.categories));
    if (lib.suppliers) localStorage.setItem('pc_stock_suppliers', JSON.stringify(lib.suppliers));
    renderStockMain();
    _updateStockBadge();
    _toast(`Loaded "${lib.name}"`, 'success');
  }, false);
}

/** @param {number} idx */
function deleteStockLibrary(idx) {
  _confirm('Delete this library?', () => {
    stockLibraries.splice(idx, 1);
    saveStockLibraries();
  });
}



function exportStockLibrary() {
  if (!stockLibraries.length) { _toast('No libraries to export', 'error'); return; }
  const json = JSON.stringify(stockLibraries);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json],{type:'application/json'})), download: 'stock-libraries.json' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Libraries exported', 'success');
}

function importStockLibrary() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data)) { data.forEach(lib => { lib.id = Date.now() + Math.random(); stockLibraries.push(lib); }); saveStockLibraries(); _toast(data.length + ' libraries imported', 'success'); }
      else _toast('Invalid file', 'error');
    } catch(e) { _toast('Could not read file', 'error'); }
  };
  input.click();
}

// Header set shared by export, template and the header-mapped import. The
// metadata accessors (_scGet/_svGet/_ssGet) are used on export so rows whose
// metadata still lives in the localStorage fallback maps export complete.
const _STOCK_CSV_COLS = /** @type {Record<string, string[]>} */ ({
  name:     ['name'],
  sku:      ['sku'],
  category: ['category', 'cat'],
  variant:  ['variant', 'variantspec', 'spec'],
  w:        ['wmm', 'win', 'w', 'length', 'lengthmm', 'lengthin'],
  h:        ['hmm', 'hin', 'h', 'width', 'widthmm', 'widthin'],
  thickness:['thicknessmm', 'thickness', 'thick'],
  qty:      ['qty', 'quantity', 'qtyinstock'],
  low:      ['lowalert', 'low', 'lowstock'],
  cost:     ['cost', 'costsheet', 'costunit', 'costperunit', 'price'],
  supplier: ['supplier', 'suppliername'],
  url:      ['reorderlink', 'reorderurl', 'supplierurl', 'url', 'link'],
  glue:     ['gluetype', 'glue'],
  ebWidth:  ['ebwidthmm', 'ebwidth', 'bandwidthmm', 'bandwidth'],
  ebLength: ['eblengthm', 'eblength', 'rolllengthm', 'rolllength'],
  coverage: ['coverageml', 'coveragesqml', 'coveragesqm', 'coverage', 'coveragem2l', 'coverageftgal'],
});

function exportStockCSV() {
  if (!_enforceProFeature()) return;
  if (!stockItems.length) { _toast('No stock items to export', 'error'); return; }
  const u = window.units === 'metric' ? 'mm' : 'in';
  /** @type {any[][]} */
  const rows = [['Name','SKU','Category','Variant',`W (${u})`,`H (${u})`,'Thickness (mm)','Qty','Low Alert','Cost','Supplier','Reorder Link','Glue Type','EB Width (mm)','EB Length (m)','Coverage (m²/L)','Total Value','Status']];
  stockItems.forEach(i => {
    const cat = _scGet(i.id);
    const sup = _ssGet(i.id);
    const meta = _svGet(i.id);
    const status = (i.qty ?? 0) <= (i.low ?? 0) ? 'Low Stock' : 'OK';
    rows.push([
      i.name, i.sku||'', cat, meta.variant||'', i.w ?? '', i.h ?? '', meta.thickness ?? '',
      i.qty ?? 0, i.low ?? 0, (i.cost ?? 0).toFixed(2),
      sup.supplier||'', sup.url||'', meta.glue||'', meta.width ?? '', meta.length ?? '',
      i.coverage_sqm ?? '', ((i.qty ?? 0)*(i.cost ?? 0)).toFixed(2), status,
    ]);
  });
  _csvDownload(rows, `stock-inventory-${new Date().toISOString().slice(0,10)}.csv`);
  _toast('Inventory exported to CSV', 'success');
}

function downloadStockTemplate() {
  const u = window.units === 'metric' ? 'mm' : 'in';
  /** @type {any[][]} */
  const rows = [
    ['Name','SKU','Category','Variant',`W (${u})`,`H (${u})`,'Thickness (mm)','Qty','Low Alert','Cost','Supplier','Reorder Link','Glue Type','EB Width (mm)','EB Length (m)','Coverage (m²/L)'],
    ['18mm Birch Plywood','PLY-18-B','Sheet Goods','BB/BB grade',u==='mm'?2440:96,u==='mm'?1220:48,18,10,3,'72.00','Timber Co','https://example.com/ply','','','',''],
    ['Oak Edge Banding','EB-OAK-22','Edge Banding','Pre-glued',50,22,1,50,10,'0.45','Banding Ltd','','Pre-glued',22,50,''],
    ['Osmo Polyx Oil','FIN-OSMO','Finishing','Satin 3032','','','',2.5,1,'24.00','Finish Supplies','','','','',12],
  ];
  _csvDownload(rows, 'stock-template.csv');
  _toast('Template downloaded', 'success');
}

function importStockCSV() {
  if (!_enforceProFeature()) return;
  _csvPickFile(async rows => {
    const col = _csvCol(rows[0], _STOCK_CSV_COLS);
    // Headerless file → legacy template order (Name, SKU, Category, W, H, Qty, Low, Cost).
    /** @type {Record<string, number>} */
    const legacy = { name:0, sku:1, category:2, w:3, h:4, qty:5, low:6, cost:7 };
    const start = col ? 1 : 0;
    /** @param {string[]} r @param {string} key */
    const get = (r, key) => col ? col(r, key) : (legacy[key] !== undefined ? (r[legacy[key]] ?? '').trim() : '');
    /** @param {string} v */
    const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
    let imported = 0;
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const name = get(r, 'name');
      if (!name) continue;
      /** @type {any} */
      const row = {
        user_id: _userId, name, sku: get(r, 'sku') || '',
        w: num(get(r, 'w')) ?? 0, h: num(get(r, 'h')) ?? 0,
        qty: num(get(r, 'qty')) ?? 0, low: num(get(r, 'low')) ?? 3,
        cost: num(get(r, 'cost')) ?? 0,
      };
      const cat = get(r, 'category');      if (cat) row.category = cat;
      const variant = get(r, 'variant');   if (variant) row.variant = variant;
      const thick = num(get(r, 'thickness'));  if (thick !== null) row.thickness_mm = thick;
      const supplier = get(r, 'supplier'); if (supplier) row.supplier = supplier;
      const url = get(r, 'url');           if (url) row.supplier_url = url;
      const glue = get(r, 'glue');         if (glue) row.glue = glue;
      const ebW = num(get(r, 'ebWidth'));  if (ebW !== null) row.width_mm = ebW;
      const ebL = num(get(r, 'ebLength')); if (ebL !== null) row.length_m = ebL;
      const cov = num(get(r, 'coverage')); if (cov !== null) row.coverage_sqm = cov;
      if (_userId) {
        const { data } = await _db('stock_items').insert(row).select().single();
        if (data) { stockItems.push(data); imported++; }
      }
    }
    _toast(imported + ' items imported', 'success');
    renderStockMain();
  });
}

/** @param {number} id @param {any} val */
async function setStockQty(id, val) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const qty = Math.max(0, parseInt(val) || 0);
  await _db('stock_items').update({ qty }).eq('id', id);
  item.qty = qty;
  renderStockMain();
}

/** @param {number} id @param {string} field @param {any} val */
async function updateStockField(id, field, val) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const numFields = ['w','h','qty','low','cost'];
  const v = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  /** @type {any} */ (item)[field] = v;
  await _db('stock_items').update(/** @type {any} */ ({ [field]: v })).eq('id', id);
  renderStockMain();
}

/** @param {number} id @param {HTMLElement} tagEl */
function setStockCatInline(id, tagEl) {
  // Replace the tag with a small select to pick category
  const cur = _scGet(id);
  const opts = ['', ...STOCK_CATS].map(c => `<option value="${c}"${c===cur?' selected':''}>${c||'— None —'}</option>`).join('');
  const sel = document.createElement('select');
  sel.className = 'stock-cat-select';
  sel.innerHTML = opts;
  sel.onblur = sel.onchange = () => {
    const val = sel.value.trim();
    _scSet(id, val);
    renderStockMain();
  };
  tagEl.replaceWith(sel);
  sel.focus();
}


// ══════════════════════════════════════════
// STOCK
// ══════════════════════════════════════════
// In-memory shadow fields beyond the DB schema: thickness/width/length/glue
// (legacy edge-band field names that shadow the DB's *_mm/*_m columns; the
// codebase is mid-rename, see G.4 SPEC entry).
/** @type {(import('./database.types').Tables<'stock_items'> & { thickness?: number, width?: number, length?: number, thick?: number })[]} */
let stockItems = [];
/** @type {import('./database.types').Tables<'clients'>[]} */
let clients = [];
// F6 (2026-05-13): projects table dropped; declared as any[] for null-state
// reads in straggler code paths that have not yet been cleaned up.
/** @type {any[]} */
let projects = [];
let stockNextId = 1;
const STOCK_CATS = ['Sheet Goods','Solid Timber','Edge Banding','Hardware','Finishing','Other'];

// ── Default starter library ──
// A sensible cabinet maker's starter set: common sheet goods, solid timber,
// edge banding, hardware and finishes. Inserted on demand from the Stock
// empty-state via `loadDefaultStockItems()`. Dimensions are metric (mm); the
// canonical storage units match — display conversion happens in the UI layer.
// Cost is in the user's currency unit at face value (no FX); users can edit.
/** @typedef {{ name:string, sku:string, cat:string, w:number, h:number, qty:number, low:number, cost:number, variant?:string, thickness?:number, ebWidth?:number, ebLength?:number, glue?:string, coverage_sqm?:number }} StockDefault */
/** @type {StockDefault[]} */
const STOCK_DEFAULTS = [
  // Sheet Goods — 2440×1220 standard sheet
  { name:'18mm Birch Plywood',       sku:'PLY-18-BIRCH', cat:'Sheet Goods', w:2440, h:1220, qty:10, low:3, cost:78,  thickness:18 },
  { name:'18mm MDF',                 sku:'MDF-18',       cat:'Sheet Goods', w:2440, h:1220, qty:10, low:3, cost:32,  thickness:18 },
  { name:'12mm MDF',                 sku:'MDF-12',       cat:'Sheet Goods', w:2440, h:1220, qty:5,  low:2, cost:22,  thickness:12 },
  { name:'6mm MDF',                  sku:'MDF-06',       cat:'Sheet Goods', w:2440, h:1220, qty:4,  low:2, cost:14,  thickness:6  },
  { name:'18mm Melamine White',      sku:'MEL-18-WHT',   cat:'Sheet Goods', w:2440, h:1220, qty:6,  low:2, cost:42,  thickness:18 },
  { name:'18mm Oak Veneer MDF',      sku:'VEN-18-OAK',   cat:'Sheet Goods', w:2440, h:1220, qty:3,  low:1, cost:95,  thickness:18 },
  { name:'18mm Walnut Veneer MDF',   sku:'VEN-18-WAL',   cat:'Sheet Goods', w:2440, h:1220, qty:2,  low:1, cost:110, thickness:18 },
  { name:'6mm Plywood (backing)',    sku:'PLY-06-BACK',  cat:'Sheet Goods', w:2440, h:1220, qty:4,  low:2, cost:28,  thickness:6  },

  // Solid Timber — 2400 × 200 boards (length × width)
  { name:'European Oak 25mm',        sku:'TIM-OAK-25',   cat:'Solid Timber', w:2400, h:200, qty:8, low:2, cost:55,  thickness:25 },
  { name:'Tulipwood (Poplar) 25mm',  sku:'TIM-POP-25',   cat:'Solid Timber', w:2400, h:200, qty:6, low:2, cost:32,  thickness:25 },
  { name:'American Walnut 25mm',     sku:'TIM-WAL-25',   cat:'Solid Timber', w:2400, h:200, qty:3, low:1, cost:110, thickness:25 },
  { name:'Beech 25mm',               sku:'TIM-BCH-25',   cat:'Solid Timber', w:2400, h:200, qty:5, low:2, cost:48,  thickness:25 },

  // Edge Banding — width = tape width (mm), length = roll length (m → stored mm)
  { name:'White Melamine Edge Tape', sku:'EB-MEL-WHT',   cat:'Edge Banding', w:100000, h:22, qty:100, low:20, cost:18, thickness:0.4, ebWidth:22, ebLength:100, glue:'Hot melt' },
  { name:'Oak Veneer Edge Tape',     sku:'EB-VEN-OAK',   cat:'Edge Banding', w:50000,  h:22, qty:50,  low:10, cost:32, thickness:0.5, ebWidth:22, ebLength:50,  glue:'Hot melt' },
  { name:'Walnut Veneer Edge Tape',  sku:'EB-VEN-WAL',   cat:'Edge Banding', w:50000,  h:22, qty:50,  low:10, cost:38, thickness:0.5, ebWidth:22, ebLength:50,  glue:'Hot melt' },

  // Hardware — w/h not meaningful; stored as 0
  { name:'Blum Tandem Drawer Runner 450mm', sku:'HW-RUN-450', cat:'Hardware', w:0, h:0, qty:20, low:5,  cost:14    },
  { name:'Blum Clip Top Hinge 110°',        sku:'HW-HNG-110', cat:'Hardware', w:0, h:0, qty:50, low:10, cost:3.50  },
  { name:'Soft-Close Hinge',                sku:'HW-HNG-SC',  cat:'Hardware', w:0, h:0, qty:30, low:8,  cost:4.20  },
  { name:'Adjustable Cabinet Leg 100mm',    sku:'HW-LEG-100', cat:'Hardware', w:0, h:0, qty:40, low:10, cost:2.20  },
  { name:'Wood Screws 4×40mm (box 200)',    sku:'HW-SCR-440', cat:'Hardware', w:0, h:0, qty:5,  low:1,  cost:8     },
  { name:'Confirmat Screws 7×50mm (box)',   sku:'HW-SCR-CFM', cat:'Hardware', w:0, h:0, qty:3,  low:1,  cost:12    },
  { name:'Cup Handle 96mm',                 sku:'HW-HDL-CUP', cat:'Hardware', w:0, h:0, qty:20, low:5,  cost:4.50  },
  { name:'Bar Pull Handle 128mm',           sku:'HW-HDL-BAR', cat:'Hardware', w:0, h:0, qty:20, low:5,  cost:5     },
  { name:'Shelf Pin 5mm (bag 100)',         sku:'HW-PIN-005', cat:'Hardware', w:0, h:0, qty:4,  low:1,  cost:6     },

  // Finishing — qty in L, cost £/L, coverage m²/L (canonical metric)
  { name:'Osmo Polyx Hardwax Oil', sku:'FIN-OSMO',   cat:'Finishing', w:0, h:0, qty:5, low:1, cost:45, coverage_sqm:24 },
  { name:'Rubio Monocoat Oil',     sku:'FIN-RUBIO',  cat:'Finishing', w:0, h:0, qty:2, low:1, cost:75, coverage_sqm:30 },
  { name:'Water-based Lacquer',    sku:'FIN-LACQ-W', cat:'Finishing', w:0, h:0, qty:5, low:1, cost:18, coverage_sqm:10 },
  { name:'Shellac Sanding Sealer', sku:'FIN-SHEL',   cat:'Finishing', w:0, h:0, qty:2, low:1, cost:14, coverage_sqm:10 },
  { name:'White Cabinet Paint',    sku:'FIN-PNT-WHT',cat:'Finishing', w:0, h:0, qty:5, low:1, cost:28, coverage_sqm:12 },
];

/** Bulk-insert STOCK_DEFAULTS into the user's stock library. Used by the
 *  empty-state "Load defaults" button. Skips items the user already has
 *  (matched by SKU) so it's safe to re-run. */
async function loadDefaultStockItems() {
  if (!_requireAuth || !_requireAuth()) return;
  const have = new Set(stockItems.map(s => (s.sku || '').toUpperCase()).filter(Boolean));
  const pending = STOCK_DEFAULTS.filter(d => !have.has(d.sku.toUpperCase()));
  if (!pending.length) { _toast('Default stock library already loaded', 'success'); return; }
  // Stock is uncapped on the free tier (2026-06-10) — load the full set.
  const batch = pending;
  const rows = batch.map(d => ({
    user_id: _userId,
    name: d.name,
    sku: d.sku,
    w: d.w,
    h: d.h,
    qty: d.qty,
    low: d.low,
    cost: d.cost,
    coverage_sqm: d.coverage_sqm ?? null,
  }));
  const { data, error } = await _db('stock_items').insert(/** @type {any} */ (rows)).select();
  if (error || !data) { _toast('Could not load defaults — ' + (error?.message || 'unknown error'), 'error'); console.error(error); return; }
  // Attach category + variant/edge-band metadata to each new row.
  data.forEach((row, i) => {
    const d = batch[i];
    const dataAny = /** @type {any} */ (row);
    if (d.cat === 'Edge Banding') {
      dataAny.thickness = d.thickness;
      dataAny.width = d.ebWidth;
      dataAny.length = d.ebLength;
      dataAny.glue = d.glue;
    } else if (d.thickness != null) {
      dataAny.thickness = d.thickness;
    }
    stockItems.push(row);
    if (d.cat) _scSet(row.id, d.cat);
    if (d.cat === 'Edge Banding') {
      _svSet(row.id, { variant: '', thickness: d.thickness || 0, width: d.ebWidth, length: d.ebLength, glue: d.glue });
    } else if (d.thickness != null) {
      _svSet(row.id, { variant: d.variant || '', thickness: d.thickness });
    }
  });
  if (typeof _track === 'function') _track('stock_defaults_loaded', { count: data.length });
  const skipped = pending.length - batch.length;
  _toast(`Loaded ${data.length} default stock item${data.length===1?'':'s'}${skipped?` (${skipped} skipped — free plan limit)`:''}`, 'success');
  if (typeof renderStockMain === 'function') renderStockMain();
  if (typeof _updateStockBadge === 'function') _updateStockBadge();
}
/** @type {any} */ (window).loadDefaultStockItems = loadDefaultStockItems;

// ── Finishing units (paint/oil/lacquer) ──
// Canonical storage is metric: qty = litres, coverage_sqm = m² per litre,
// cost = £/L. When the app is in imperial mode the form shows US gallons +
// ft²/gal and we convert on the way in/out. The quote integration prices a
// finish by surface area: £/m² = cost-per-litre ÷ coverage(m²/L).
const FIN_DEFAULT_COV_M2L = 10;            // default coverage for new finishes: 10 m²/L
const L_PER_USGAL = 3.785411784;          // 1 US gallon = 3.785411784 L
const SQFT_PER_SQM = 10.7639104167;        // 1 m² = 10.7639 ft²
// 1 (m²/L) expressed as (ft²/US-gal): multiply by ft²/m² then by L/gal
const COV_M2L_TO_FT2GAL = SQFT_PER_SQM * L_PER_USGAL; // ≈ 40.746
/** True when finishes should display in US gallons / ft²/gal. */
function _finImperial() { return window.units !== 'metric'; }
/** Volume label for finishing inputs. */
function _finVolUnit() { return _finImperial() ? 'gal' : 'L'; }
/** Coverage label for finishing inputs. */
function _finCovUnit() { return _finImperial() ? 'ft²/gal' : 'm²/L'; }
/** Convert a display volume (L or US gal) to canonical litres. @param {number} v */
function _finVolToL(v) { return _finImperial() ? v * L_PER_USGAL : v; }
/** Convert canonical litres to the display volume. @param {number} l */
function _finVolFromL(l) { return _finImperial() ? l / L_PER_USGAL : l; }
/** Convert a display coverage to canonical m²/L. @param {number} c */
function _finCovToM2L(c) { return _finImperial() ? c / COV_M2L_TO_FT2GAL : c; }
/** Convert canonical m²/L to the display coverage. @param {number} c */
function _finCovFromM2L(c) { return _finImperial() ? c * COV_M2L_TO_FT2GAL : c; }
/** Convert a display cost (£/L or £/gal) to canonical £/L. @param {number} c */
function _finCostToPerL(c) { return _finImperial() ? c / L_PER_USGAL : c; }
/** Convert canonical £/L to the display cost. @param {number} c */
function _finCostFromPerL(c) { return _finImperial() ? c * L_PER_USGAL : c; }
/** If a stock item is a Finishing material with a coverage rate, return the
 *  per-area pricing for a quote/order line (priced per m² metric / per ft²
 *  imperial). Returns null for non-finishing items or those with no coverage,
 *  so callers fall back to the plain per-unit cost. @param {any} stockItem */
function _finQuoteLine(stockItem) {
  if (!stockItem) return null;
  const cat = stockItem.category || (typeof _scGet === 'function' ? _scGet(stockItem.id) : '');
  if (cat !== 'Finishing') return null;
  const cov = parseFloat(stockItem.coverage_sqm);    // m² per litre (canonical)
  const costL = parseFloat(stockItem.cost);          // £ per litre (canonical)
  if (!cov || cov <= 0 || !isFinite(costL)) return null;
  const perM2 = costL / cov;                          // £/m²
  const areaUnit = _finImperial() ? 'ft²' : 'm²';
  const unit_price = _finImperial() ? perM2 / SQFT_PER_SQM : perM2;
  return { name: `${stockItem.name} (per ${areaUnit})`, unit_price, areaUnit };
}

// ── Stock metadata: DB columns first, localStorage fallback (Phase 3 of pre-launch refactor) ──
// stockItems is loaded with select('*'), so DB columns (category, supplier, supplier_url,
// variant, thickness_mm, width_mm, length_m, glue) come along automatically. Once migration
// has run, the DB is the source of truth. localStorage stays as fallback for unmigrated browsers.

// Helper: dual-write any subset of stock columns to DB + in-memory + localStorage map
/** @param {number} id @param {any} updates @param {string | null} [lsKey] @param {any} [lsValue] */
function _stockUpdateCols(id, updates, lsKey, lsValue) {
  // 1. localStorage map (legacy fallback)
  if (lsKey) {
    try {
      const m = JSON.parse(localStorage.getItem(lsKey) || '{}');
      if (lsValue === null || lsValue === undefined) delete m[String(id)];
      else m[String(id)] = lsValue;
      localStorage.setItem(lsKey, JSON.stringify(m));
    } catch(e) {}
  }
  // 2. DB column update
  if (_userId) {
    _db('stock_items').update(Object.assign({}, updates, { updated_at: new Date().toISOString() })).eq('id', id).then(({ error }) => {
      if (error) console.warn('[stock] DB sync failed:', error.message);
    });
  }
  // 3. In-memory cache
  const item = stockItems.find(s => s.id === id);
  if (item) Object.assign(item, updates);
}

function _scMap() { try { return JSON.parse(localStorage.getItem('pc_stock_cats') || '{}'); } catch(e) { return {}; } }
/** @param {number} id */
function _scGet(id) {
  const item = stockItems.find(s => s.id === id);
  if (item && item.category) return item.category;
  return _scMap()[String(id)] || '';
}
/** @param {number} id @param {string} cat */
function _scSet(id, cat) {
  _stockUpdateCols(id, { category: cat || null }, 'pc_stock_cats', cat || null);
}

// ── Stock Supplier Storage ──
/** @param {number} id */
function _ssGet(id) {
  const item = stockItems.find(s => s.id === id);
  if (item && (item.supplier || item.supplier_url)) {
    return { supplier: item.supplier || '', url: item.supplier_url || '' };
  }
  try { return JSON.parse(localStorage.getItem('pc_stock_suppliers')||'{}')[String(id)] || {}; } catch(e) { return {}; }
}
/** @param {number} id @param {{supplier?: string, url?: string}} data */
function _ssSet(id, data) {
  _stockUpdateCols(id, { supplier: data.supplier || null, supplier_url: data.url || null }, 'pc_stock_suppliers', data);
}
/** @param {number} id @param {string} field @param {any} val */
function _updateStockSupplier(id, field, val) {
  /** @type {any} */
  const sup = _ssGet(id);
  sup[field] = val;
  _ssSet(id, sup);
  renderStockMain();
}
/** @param {number} id */
function _promptReorderUrl(id) {
  const url = prompt('Enter supplier/reorder URL:');
  if (url === null) return;
  const sup = _ssGet(id);
  sup.url = url.trim();
  _ssSet(id, sup);
  renderStockMain();
}

// ── Stock Variant/Thickness Storage ──
/** @param {number} id */
function _svGet(id) {
  const item = stockItems.find(s => s.id === id);
  if (item && (item.variant || item.thickness_mm != null || item.width_mm != null || item.length_m != null || item.glue)) {
    return {
      variant: item.variant || '',
      thickness: item.thickness_mm,
      width: item.width_mm,
      length: item.length_m,
      glue: item.glue || ''
    };
  }
  try { return JSON.parse(localStorage.getItem('pc_stock_variants')||'{}')[String(id)] || {}; } catch(e) { return {}; }
}
/** @param {number} id @param {{variant?: string, thickness?: any, width?: any, length?: any, glue?: string}} data */
function _svSet(id, data) {
  const updates = {
    variant: data.variant || null,
    thickness_mm: (data.thickness !== undefined && data.thickness !== '' && data.thickness !== null) ? parseFloat(data.thickness) : null,
    width_mm: (data.width !== undefined && data.width !== '' && data.width !== null) ? parseFloat(data.width) : null,
    length_m: (data.length !== undefined && data.length !== '' && data.length !== null) ? parseFloat(data.length) : null,
    glue: data.glue || null
  };
  _stockUpdateCols(id, updates, 'pc_stock_variants', data);
}

// Order-to-quote reference (Phase 3.8: orders.quote_id is now the source of truth) ──
function _oqMap() { try { return JSON.parse(localStorage.getItem('pc_order_quote_ref') || '{}'); } catch(e) { return {}; } }
/** @param {number} id */
function _oqGet(id) {
  // Prefer DB column on the in-memory orders array; fall back to localStorage map.
  const o = orders.find(x => x.id === id);
  if (o && o.quote_id != null) return o.quote_id;
  return _oqMap()[String(id)] || null;
}
/** @param {number} id @param {number} quoteId */
function _oqSet(id, quoteId) {
  // Dual-write: localStorage map + DB column + in-memory cache
  const m = _oqMap();
  m[String(id)] = quoteId;
  localStorage.setItem('pc_order_quote_ref', JSON.stringify(m));
  if (_userId) {
    _db('orders').update({ quote_id: quoteId, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => {
      if (error) console.warn('[orders] quote_id sync failed:', error.message);
    });
  }
  const o = orders.find(x => x.id === id);
  if (o) o.quote_id = quoteId;
}

// Order notes (Phase 3.8: orders.notes column now exists) ──
function _onMap() { try { return JSON.parse(localStorage.getItem('pc_order_notes') || '{}'); } catch(e) { return {}; } }
/** @param {number} id */
function _onGet(id) {
  const o = orders.find(x => x.id === id);
  if (o && o.notes) return o.notes;
  return _onMap()[String(id)] || '';
}
/** @param {number} id @param {string} notes */
function _onSet(id, notes) {
  // Dual-write
  const m = _onMap();
  if (notes) m[String(id)] = notes; else delete m[String(id)];
  localStorage.setItem('pc_order_notes', JSON.stringify(m));
  if (_userId) {
    _db('orders').update({ notes: notes || null, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => {
      if (error) console.warn('[orders] notes sync failed:', error.message);
    });
  }
  const o = orders.find(x => x.id === id);
  if (o) o.notes = notes || '';
}
/** @param {any[]} orderArr */
function _onRestore(orderArr) {
  // For orders where DB notes is null but localStorage has a value, hydrate the in-memory cache
  // (DB takes precedence if both present).
  const m = _onMap();
  orderArr.forEach(o => {
    if (!o.notes && m[String(o.id)]) o.notes = m[String(o.id)];
  });
}

function stockCatChanged() {
  const cat = _byId('stock-cat')?.value ?? '';
  const dimsEl = _byId('stock-dims-fields');
  const ebEl = _byId('stock-eb-fields');
  const finEl = _byId('stock-fin-fields');
  const qtyEl = _byId('stock-qty-fields');
  const ebQtyEl = _byId('stock-eb-qty-fields');
  if (!dimsEl) return;
  const isEB = cat === 'Edge Banding';
  const isFin = cat === 'Finishing';
  const sheetCats = ['Sheet Goods', 'Solid Timber'];
  dimsEl.style.display = sheetCats.includes(cat) ? '' : 'none';
  if (ebEl) ebEl.style.display = isEB ? '' : 'none';
  if (finEl) finEl.style.display = isFin ? '' : 'none';
  if (qtyEl) qtyEl.style.display = isEB ? 'none' : '';
  if (ebQtyEl) ebQtyEl.style.display = isEB ? '' : 'none';
  // Spec section heading: "Dimensions" for sheet/timber/edge-banding,
  // "Coverage" for finishing, hidden for Hardware/Other (which have no spec
  // fields). The ::after divider line is a pseudo-element, so it survives
  // setting textContent.
  const specTitle = _byId('stock-spec-title');
  if (specTitle) {
    const hasSpec = sheetCats.includes(cat) || isEB || isFin;
    specTitle.style.display = hasSpec ? '' : 'none';
    specTitle.textContent = isFin ? 'Coverage' : 'Dimensions';
  }
  // Relabel the generic qty/low/cost row for finishing (volume in L or gal).
  const vol = _finVolUnit();
  _setLabel('stock-qty-label', isFin ? `Volume (${vol})` : 'Qty');
  _setLabel('stock-low-label', isFin ? `Low Alert (${vol})` : 'Low Alert');
  _setLabel('stock-cost-label', isFin ? `Cost / ${vol}` : 'Cost / Unit');
  _setLabel('stock-fin-cov-label', `Coverage (${_finCovUnit()})`);
  // Default coverage to 10 m²/L (unit-converted) for NEW finishing items —
  // editStockItem sets _editingStockId first, so existing items aren't clobbered.
  if (isFin && !window._editingStockId) {
    const covEl = /** @type {HTMLInputElement|null} */ (_byId('stock-fin-coverage'));
    if (covEl) covEl.value = _fmtNum(_finCovFromM2L(FIN_DEFAULT_COV_M2L));
  }
}
/** @param {string} id @param {string} text */
function _setLabel(id, text) { const el = _byId(id); if (el) el.textContent = text; }
/** Live-link visibility toggle (share-style mini-toggle in the stock editor). */
function _stockCustVis() { return _byId('stock-customer-visible')?.getAttribute('aria-pressed') === 'true'; }
/** @param {boolean} on */
function _stockSetCustVis(on) { const b = _byId('stock-customer-visible'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
/** Round to 2dp and drop trailing zeros (tidies unit-conversion float noise). @param {number} n */
function _fmtNum(n) { return String(Math.round((Number(n) || 0) * 100) / 100); }
function cancelStockEdit() {
  if (_stockAutosaveTimer) { clearTimeout(_stockAutosaveTimer); _stockAutosaveTimer = null; }
  window._editingStockId = null;
  if (typeof /** @type {any} */ (window)._pcSaveOpenStockId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenStockId(null);
  }
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  inp('stock-name').value = '';
  inp('stock-variant').value = '';
  inp('stock-sku').value = '';
  // Reset the category to the default option so a stale value from the
  // previously-edited item doesn't carry into a fresh "Add Material", and
  // refresh the category-dependent field visibility to match.
  inp('stock-cat').value = 'Sheet Goods';
  _stockSetCustVis(true);
  if (typeof stockCatChanged === 'function') stockCatChanged();
  const sb = /** @type {HTMLElement} */ (_byId('stock-submit-btn'));
  if (sb) { sb.textContent = '+ Add to Stock'; sb.style.display = ''; }
  const db = /** @type {HTMLElement} */ (_byId('stock-delete-btn'));
  if (db) db.style.display = 'none';
  inp('stock-form-title-text').textContent = 'Add Material';
  if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'clean');
  _stockShowForm = false;
  if (window._mvShowList) window._mvShowList();
  renderStockMain();
}

/** Duplicate an existing stock item — copies all row fields + per-item local
 *  metadata (category, variant/thickness, supplier/reorder-url) into a new row.
 *  @param {number} id */
async function duplicateStockItem(id) {
  const src = stockItems.find(s => s.id === id);
  if (!src) return;
  if (!_requireAuth()) return;
  // Stock is uncapped on the free tier (2026-06-10) — no _enforceFreeLimit.
  const row = {
    user_id: _userId,
    name: (src.name || 'Material') + ' (Copy)',
    sku: src.sku || '—',
    w: src.w,
    h: src.h,
    qty: src.qty,
    low: src.low,
    cost: src.cost,
    coverage_sqm: /** @type {any} */ (src).coverage_sqm ?? null,
    customer_visible: /** @type {any} */ (src).customer_visible ?? false,
  };
  const { data, error } = await _db('stock_items').insert(/** @type {any} */ (row)).select().single();
  if (error || !data) { _toast('Could not duplicate stock item', 'error'); return; }
  // Carry over edge-band shadow fields so cut-list dropdowns see them this session.
  /** @type {any} */ (data).thickness = /** @type {any} */ (src).thickness;
  /** @type {any} */ (data).width     = /** @type {any} */ (src).width;
  /** @type {any} */ (data).length    = /** @type {any} */ (src).length;
  /** @type {any} */ (data).glue      = /** @type {any} */ (src).glue;
  stockItems.push(data);
  const cat = _scGet(src.id);  if (cat) _scSet(data.id, cat);
  const meta = _svGet(src.id); if (meta) _svSet(data.id, meta);
  const supp = _ssGet(src.id); if (supp) _ssSet(data.id, supp);
  _toast(`"${row.name}" duplicated`, 'success');
  if (typeof renderStockMain === 'function') renderStockMain();
}
/** @type {any} */ (window).duplicateStockItem = duplicateStockItem;

async function addStockItem() {
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const name = inp('stock-name').value.trim();
  if (!name) { _toast('Enter a material name.', 'error'); return; }
  if (!_requireAuth()) return;
  // Stock is uncapped on the free tier (2026-06-10) — no _enforceFreeLimit.
  const cat = inp('stock-cat').value.trim();
  const variant = inp('stock-variant').value.trim();
  const isEB = cat === 'Edge Banding';
  const isFin = cat === 'Finishing';
  const thick = isEB
    ? (parseFloat(_byId('stock-eb-thick')?.value ?? '') || 0)
    : (parseFloat(_byId('stock-thick')?.value ?? '') || 0);
  const ebWidth = isEB ? (parseFloat(_byId('stock-eb-width')?.value ?? '') || 0) : 0;
  const ebLength = isEB ? (parseFloat(_byId('stock-eb-length')?.value ?? '') || 0) : 0;
  const ebGlue = isEB ? (_byId('stock-eb-glue')?.value || '') : '';
  // Finishing: qty/low/cost are entered in display units (L or US gal) and the
  // coverage in m²/L or ft²/gal — store everything canonically in metric.
  const finCov = isFin ? _finCovToM2L(parseFloat(_byId('stock-fin-coverage')?.value ?? '') || 0) : null;
  const row = {
    user_id: _userId, name,
    sku: inp('stock-sku').value.trim() || '—',
    w: isEB ? ebLength : (parseFloat(inp('stock-w').value) || 2440),
    h: isEB ? ebWidth : (parseFloat(inp('stock-h').value) || 1220),
    qty: isEB
      ? Math.round(ebLength)
      : isFin
        ? _finVolToL(parseFloat(inp('stock-qty').value) || 0)
        : (parseInt(inp('stock-qty').value) || 0),
    low: isEB
      ? Math.round(parseFloat(_byId('stock-eb-low')?.value ?? '') || 0)
      : isFin
        ? _finVolToL(parseFloat(inp('stock-low').value) || 0)
        : (parseInt(inp('stock-low').value) || 3),
    cost: isEB
      ? (parseFloat(_byId('stock-eb-cost')?.value ?? '') || 0)
      : isFin
        ? _finCostToPerL(parseFloat(inp('stock-cost').value) || 0)
        : (parseFloat(inp('stock-cost').value) || 0),
    coverage_sqm: finCov,
    customer_visible: _stockCustVis(),
  };
  const { data, error } = await _db('stock_items').insert(/** @type {any} */ (row)).select().single();
  if (error || !data) { _toast('Could not save stock item — ' + (error?.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  if (typeof _track === 'function') _track('library_item_created', { library: 'stock', item_id: data.id, source: 'editor' });
  // Attach edge-band shadow fields (thickness/width/length/glue) to the
  // in-memory item so cut-list dropdowns see them THIS session. Reloads
  // re-hydrate via app.js loadAllData (H0.2 map of *_mm/*_m → short names).
  const dataAny = /** @type {any} */ (data);
  if (isEB) {
    dataAny.thickness = thick;
    dataAny.width = ebWidth;
    dataAny.length = ebLength;
    dataAny.glue = ebGlue;
  }
  stockItems.push(data);
  if (cat) _scSet(data.id, cat);
  // Store variant/thickness (and edge banding extras) in local metadata
  /** @type {{variant: string, thickness: number, width?: number, length?: number, glue?: string}} */
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  if (variant || thick || isEB) _svSet(data.id, meta);
  const supplier = _byId('stock-supplier')?.value?.trim() || '';
  const reorderUrl = _byId('stock-reorder-url')?.value?.trim() || '';
  if (supplier || reorderUrl) _ssSet(data.id, {supplier, url: reorderUrl});
  _toast('Stock item added', 'success');
  inp('stock-name').value = '';
  inp('stock-variant').value = '';
  inp('stock-sku').value = '';
  const sup = _byId('stock-supplier'); if (sup) sup.value = '';
  const reord = _byId('stock-reorder-url'); if (reord) reord.value = '';
  _stockSetCustVis(false);
  window._editingStockId = null;
  if (typeof /** @type {any} */ (window)._pcSaveOpenStockId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenStockId(null);
  }
  _stockShowForm = false;
  renderStockMain();
}

/** @param {number} id */
function editStockItem(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  window._editingStockId = id;
  _stockShowForm = true;
  if (window._mvShowEditor) window._mvShowEditor();
  if (typeof /** @type {any} */ (window)._pcSaveOpenStockId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenStockId(id);
  }
  _renderStockSidebarGate();
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const cat = _scGet(id) || 'Sheet Goods';
  inp('stock-cat').value = cat;
  stockCatChanged();
  inp('stock-name').value = item.name;
  const vd = /** @type {any} */ (_svGet(id));
  inp('stock-variant').value = vd.variant || '';
  inp('stock-sku').value = item.sku || '';
  if (cat === 'Edge Banding') {
    inp('stock-eb-thick').value = vd.thickness ?? item.thickness ?? '';
    inp('stock-eb-width').value = vd.width ?? item.width ?? item.h ?? '';
    inp('stock-eb-length').value = vd.length ?? item.length ?? item.w ?? '';
    inp('stock-eb-glue').value = vd.glue || item.glue || 'EVA';
    inp('stock-eb-low').value = String(item.low ?? '');
    inp('stock-eb-cost').value = String(item.cost ?? '');
  } else if (cat === 'Finishing') {
    // Canonical metric → display units (L/gal, m²/L or ft²/gal, £/L or £/gal).
    const cov = /** @type {any} */ (item).coverage_sqm;
    inp('stock-fin-coverage').value = (cov != null) ? _fmtNum(_finCovFromM2L(cov)) : '';
    inp('stock-qty').value = (item.qty != null) ? _fmtNum(_finVolFromL(item.qty)) : '';
    inp('stock-low').value = (item.low != null) ? _fmtNum(_finVolFromL(item.low)) : '';
    inp('stock-cost').value = (item.cost != null) ? _fmtNum(_finCostFromPerL(item.cost)) : '';
  } else {
    inp('stock-thick').value = vd.thickness || '';
    inp('stock-w').value = String(item.w ?? '');
    inp('stock-h').value = String(item.h ?? '');
    inp('stock-qty').value = String(item.qty ?? '');
    inp('stock-low').value = String(item.low ?? '');
    inp('stock-cost').value = String(item.cost ?? '');
  }
  const sup = _ssGet(id);
  const supEl = _byId('stock-supplier'); if (supEl) supEl.value = sup.supplier || '';
  const reordEl = _byId('stock-reorder-url'); if (reordEl) reordEl.value = sup.url || '';
  _stockSetCustVis(!!(/** @type {any} */ (item).customer_visible));
  // Scroll sidebar to top and change button/title text
  const sidebar = document.querySelector('#panel-stock .sidebar-scroll');
  if (sidebar) sidebar.scrollTop = 0;
  const sb = /** @type {HTMLElement} */ (_byId('stock-submit-btn'));
  if (sb) sb.style.display = 'none';
  const db = /** @type {HTMLElement} */ (_byId('stock-delete-btn'));
  if (db) db.style.display = '';
  inp('stock-form-title-text').textContent = 'Edit Material';
  if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'clean');
  renderStockMain();
}

async function saveStockEdit() {
  const id = window._editingStockId;
  if (!id) { addStockItem(); return; }
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const cat = inp('stock-cat').value.trim();
  const isEB = cat === 'Edge Banding';
  const isFin = cat === 'Finishing';
  const variant = _byId('stock-variant')?.value?.trim() || '';
  /** @type {any} */
  let updates;
  let thick = 0, ebWidth = 0, ebLength = 0, ebGlue = '';
  if (isEB) {
    thick = parseFloat(_byId('stock-eb-thick')?.value ?? '') || 0;
    ebWidth = parseFloat(_byId('stock-eb-width')?.value ?? '') || 0;
    ebLength = parseFloat(_byId('stock-eb-length')?.value ?? '') || 0;
    ebGlue = _byId('stock-eb-glue')?.value || '';
    updates = {
      name: inp('stock-name').value.trim(),
      sku: inp('stock-sku').value.trim(),
      w: ebLength,
      h: ebWidth,
      qty: Math.round(ebLength),
      low: Math.round(parseFloat(_byId('stock-eb-low')?.value ?? '') || 0),
      cost: parseFloat(_byId('stock-eb-cost')?.value ?? '') || 0,
      coverage_sqm: null,
    };
  } else if (isFin) {
    updates = {
      name: inp('stock-name').value.trim(),
      sku: inp('stock-sku').value.trim(),
      w: item.w, h: item.h,
      qty: _finVolToL(parseFloat(inp('stock-qty').value) || 0),
      low: _finVolToL(parseFloat(inp('stock-low').value) || 0),
      cost: _finCostToPerL(parseFloat(inp('stock-cost').value) || 0),
      coverage_sqm: _finCovToM2L(parseFloat(_byId('stock-fin-coverage')?.value ?? '') || 0),
    };
  } else {
    thick = parseFloat(_byId('stock-thick')?.value ?? '') || 0;
    updates = {
      name: inp('stock-name').value.trim(),
      sku: inp('stock-sku').value.trim(),
      w: parseFloat(inp('stock-w').value) || item.w,
      h: parseFloat(inp('stock-h').value) || item.h,
      qty: parseInt(inp('stock-qty').value) || 0,
      low: parseInt(inp('stock-low').value) || 3,
      cost: parseFloat(inp('stock-cost').value) || 0,
      coverage_sqm: null,
    };
  }
  updates.customer_visible = _stockCustVis();
  /** @type {any} */
  const itemAny = item;
  Object.assign(item, updates);
  if (isEB) { itemAny.thickness = thick; itemAny.width = ebWidth; itemAny.length = ebLength; itemAny.glue = ebGlue; }
  else { delete itemAny.thickness; delete itemAny.width; delete itemAny.length; delete itemAny.glue; }
  if (_userId) await _db('stock_items').update(updates).eq('id', id);
  _scSet(id, cat);
  /** @type {{variant: string, thickness: number, width?: number, length?: number, glue?: string}} */
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  _svSet(id, meta);
  const supplier = _byId('stock-supplier')?.value?.trim() || '';
  const reorderUrl = _byId('stock-reorder-url')?.value?.trim() || '';
  _ssSet(id, {supplier, url: reorderUrl});
  cancelStockEdit();
  _toast('Stock item updated', 'success');
}

/** @type {ReturnType<typeof setTimeout>|null} */
let _stockAutosaveTimer = null;

function _stockScheduleAutosave() {
  if (!window._editingStockId) return;
  if (_stockAutosaveTimer) clearTimeout(_stockAutosaveTimer);
  if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'dirty');
  _stockAutosaveTimer = setTimeout(_stockAutosaveRun, 500);
}
/** @type {any} */ (window)._stockScheduleAutosave = _stockScheduleAutosave;

async function _stockAutosaveRun() {
  _stockAutosaveTimer = null;
  const id = window._editingStockId;
  if (!id) return;
  const item = /** @type {any} */ (stockItems.find(s => s.id === id));
  if (!item) return;
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const name = inp('stock-name')?.value?.trim() || '';
  if (!name) {
    if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'failed', { retry: _stockAutosaveRun });
    return;
  }
  const cat = inp('stock-cat').value.trim();
  const isEB = cat === 'Edge Banding';
  const isFin = cat === 'Finishing';
  const variant = _byId('stock-variant')?.value?.trim() || '';
  /** @type {any} */
  let updates;
  let thick = 0, ebWidth = 0, ebLength = 0, ebGlue = '';
  if (isEB) {
    thick = parseFloat(_byId('stock-eb-thick')?.value ?? '') || 0;
    ebWidth = parseFloat(_byId('stock-eb-width')?.value ?? '') || 0;
    ebLength = parseFloat(_byId('stock-eb-length')?.value ?? '') || 0;
    ebGlue = _byId('stock-eb-glue')?.value || '';
    updates = {
      name, sku: inp('stock-sku').value.trim(),
      w: ebLength, h: ebWidth,
      qty: Math.round(ebLength),
      low: Math.round(parseFloat(_byId('stock-eb-low')?.value ?? '') || 0),
      cost: parseFloat(_byId('stock-eb-cost')?.value ?? '') || 0,
      coverage_sqm: null,
    };
  } else if (isFin) {
    updates = {
      name, sku: inp('stock-sku').value.trim(),
      w: item.w, h: item.h,
      qty: _finVolToL(parseFloat(inp('stock-qty').value) || 0),
      low: _finVolToL(parseFloat(inp('stock-low').value) || 0),
      cost: _finCostToPerL(parseFloat(inp('stock-cost').value) || 0),
      coverage_sqm: _finCovToM2L(parseFloat(_byId('stock-fin-coverage')?.value ?? '') || 0),
    };
  } else {
    thick = parseFloat(_byId('stock-thick')?.value ?? '') || 0;
    updates = {
      name, sku: inp('stock-sku').value.trim(),
      w: parseFloat(inp('stock-w').value) || item.w,
      h: parseFloat(inp('stock-h').value) || item.h,
      qty: parseInt(inp('stock-qty').value) || 0,
      low: parseInt(inp('stock-low').value) || 3,
      cost: parseFloat(inp('stock-cost').value) || 0,
      coverage_sqm: null,
    };
  }
  updates.customer_visible = _stockCustVis();
  Object.assign(item, updates);
  if (isEB) { item.thickness = thick; item.width = ebWidth; item.length = ebLength; item.glue = ebGlue; }
  else { delete item.thickness; delete item.width; delete item.length; delete item.glue; }
  if (_userId) {
    if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'saving');
    const { error } = await _db('stock_items').update(updates).eq('id', id);
    if (error) {
      if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'failed', { retry: _stockAutosaveRun });
      return;
    }
  }
  _scSet(id, cat);
  /** @type {{variant: string, thickness: number, width?: number, length?: number, glue?: string}} */
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  _svSet(id, meta);
  const supplier = _byId('stock-supplier')?.value?.trim() || '';
  const reorderUrl = _byId('stock-reorder-url')?.value?.trim() || '';
  _ssSet(id, {supplier, url: reorderUrl});
  if (typeof _setSaveStatus === 'function') _setSaveStatus('stock', 'saved');
  renderStockMain();
}

(function _wireStockAutosave() {
  const inputs = ['stock-name','stock-variant','stock-sku',
    'stock-w','stock-h','stock-thick',
    'stock-eb-thick','stock-eb-width','stock-eb-length',
    'stock-fin-coverage',
    'stock-qty','stock-low','stock-cost',
    'stock-eb-low','stock-eb-cost',
    'stock-supplier','stock-reorder-url'];
  for (const id of inputs) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _stockScheduleAutosave);
  }
  for (const id of ['stock-cat','stock-eb-glue']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', _stockScheduleAutosave);
  }
})();

/** @param {number} id */
async function removeStock(id) {
  if (!_requireAuth()) return;
  const { error } = await _db('stock_items').delete().eq('id', id);
  if (error) {
    _toast('Could not delete item — ' + (error.message || 'unknown error'), 'error');
    return;
  }
  stockItems = stockItems.filter(s => s.id !== id);
  // If the deleted item is the one open in the sidebar editor, return to "Add" mode.
  if (window._editingStockId === id) {
    cancelStockEdit();
  } else {
    renderStockMain();
  }
  _toast('Stock item deleted', 'success');
}

/** Confirm, then delete a stock item. @param {number} id */
function deleteStockItem(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  _confirm(`Delete <strong>${_escHtml(item.name)}</strong>? This cannot be undone.`, () => removeStock(id));
}
/** @type {any} */ (window).deleteStockItem = deleteStockItem;

// ── Bulk selection / actions ──────────────────────────────────────────────
/** Set of currently-checked stock-item ids for bulk actions. @returns {Set<number>} */
function _stockSel() {
  const w = /** @type {any} */ (window);
  return (w._stockSelected ||= new Set());
}
/** @param {number} id @param {boolean} checked */
function _stockToggleSel(id, checked) {
  const sel = _stockSel();
  if (checked) sel.add(id); else sel.delete(id);
  renderStockMain();
}
/** Select/deselect every rendered row in a category section.
 *  @param {HTMLInputElement} el the group header checkbox */
function _stockToggleGroupSel(el) {
  const wrap = el.closest('.stock-sheet-wrap');
  if (!wrap) return;
  const sel = _stockSel();
  wrap.querySelectorAll('input.stock-sel-cb').forEach(cb => {
    const id = Number(/** @type {HTMLInputElement} */ (cb).value);
    if (el.checked) sel.add(id); else sel.delete(id);
  });
  renderStockMain();
}
function _stockClearSel() { _stockSel().clear(); renderStockMain(); }

/** Delete every selected stock item after one confirm. */
function _stockBulkDelete() {
  if (!_requireAuth()) return;
  const ids = [..._stockSel()];
  if (!ids.length) return;
  const n = ids.length;
  _confirm(`Delete <strong>${n}</strong> stock item${n !== 1 ? 's' : ''}? This cannot be undone.`, async () => {
    const { error } = await _db('stock_items').delete().in('id', ids);
    if (error) {
      _toast('Could not delete items — ' + (error.message || 'unknown error'), 'error');
      return;
    }
    const idset = new Set(ids);
    stockItems = stockItems.filter(s => !idset.has(s.id));
    if (window._editingStockId && idset.has(window._editingStockId)) cancelStockEdit();
    _stockSel().clear();
    renderStockMain();
    _toast(`${n} item${n !== 1 ? 's' : ''} deleted`, 'success');
  });
}

/** Set customer visibility on every selected stock item. @param {boolean} visible */
async function _stockBulkVisibility(visible) {
  if (!_requireAuth()) return;
  const ids = [..._stockSel()];
  if (!ids.length) return;
  const { error } = await _db('stock_items').update({ customer_visible: visible }).in('id', ids);
  if (error) {
    _toast('Could not update items — ' + (error.message || 'unknown error'), 'error');
    return;
  }
  const idset = new Set(ids);
  stockItems.forEach(s => { if (idset.has(s.id)) /** @type {any} */ (s).customer_visible = visible; });
  if (window._editingStockId && idset.has(window._editingStockId)) _stockSetCustVis(visible);
  renderStockMain();
  _toast(`${ids.length} item${ids.length !== 1 ? 's' : ''} ${visible ? 'shown to' : 'hidden from'} customers`, 'success');
}

/** @param {number} id @param {number} delta */
async function adjustStock(id, delta) {
  if (!_requireAuth()) return;
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const newQty = Math.max(0, (item.qty ?? 0) + delta);
  await _db('stock_items').update({ qty: newQty }).eq('id', id);
  item.qty = newQty;
  renderStockMain();
}
/** @param {number} id @param {string | number} text */
async function setStockQty(id, text) {
  const qty = parseInt(String(text).replace(/[^0-9]/g,'')) || 0;
  const item = stockItems.find(s => s.id === id);
  if (!item || item.qty === qty) return;
  item.qty = Math.max(0, qty);
  if (_userId) await _db('stock_items').update({ qty: item.qty }).eq('id', id);
  renderStockMain();
}
/** Inline-edit a finishing item's volume. Accepts a decimal in display units
 *  (L or US gal) and stores canonical litres. @param {number} id @param {string | number} text */
async function setStockQtyFin(id, text) {
  const disp = parseFloat(String(text).replace(/[^0-9.]/g,'')) || 0;
  const litres = Math.max(0, _finVolToL(disp));
  const item = stockItems.find(s => s.id === id);
  if (!item || item.qty === litres) return;
  item.qty = litres;
  if (_userId) await _db('stock_items').update({ qty: item.qty }).eq('id', id);
  renderStockMain();
}

function _updateStockBadge() {
  const badge = _byId('stock-badge');
  if (!badge) return;
  const low = stockItems.filter(i => (i.qty ?? 0) <= (i.low ?? 0)).length;
  if (low > 0) { badge.textContent = String(low); badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}

// Per-user collapsed-group state (localStorage; promote to DB if cross-device sync is wanted)
function _stockGetCollapsed() {
  try {
    const key = 'pc_stock_groups_collapsed_' + ((typeof _userId !== 'undefined' && _userId) || '_');
    return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  } catch (e) { return new Set(); }
}
/** @param {Set<string>} set */
function _stockSetCollapsed(set) {
  try {
    const key = 'pc_stock_groups_collapsed_' + ((typeof _userId !== 'undefined' && _userId) || '_');
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch (e) {}
}
/** @param {string} cat */
function _stockToggleGroup(cat) {
  const s = _stockGetCollapsed();
  if (s.has(cat)) s.delete(cat); else s.add(cat);
  _stockSetCollapsed(s);
  renderStockMain();
}

/** Strategy 2: render the Stock sidebar gate (icon + title + subtitle + button)
 *  whenever there's no active add/edit. Hides only while the form is in use. */
let _stockShowForm = false;
function _renderStockSidebarGate() {
  const gate = _byId('stock-gate');
  const form = _byId('stock-form-section');
  if (!gate || !form) return;
  if (!_stockShowForm) {
    const recents = stockItems.slice().sort(/** @param {any} a @param {any} b */ (a, b) => {
      const av = a.updated_at ? +new Date(a.updated_at) : (a.id || 0);
      const bv = b.updated_at ? +new Date(b.updated_at) : (b.id || 0);
      return bv - av;
    }).map(/** @param {any} s */ s => ({
      id: s.id,
      name: s.name,
      meta: _scGet(s.id) || '',
      onClick: `editStockItem(${s.id})`,
    }));
    gate.innerHTML = _renderListEmpty({
      iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
      title: 'Stock',
      subtitle: 'Track sheet goods, hardware, and consumables. Add your first material to get started.',
      btnLabel: '+ Add Stock Item',
      btnOnclick: '_stockRevealForm()',
      recentItems: recents,
      itemIconSvg: _TYPE_ICON_STOCK,
    });
    gate.style.display = '';
    form.style.display = 'none';
  } else {
    gate.innerHTML = '';
    gate.style.display = 'none';
    form.style.display = '';
  }
}
function _stockRevealForm() {
  // Start fresh — clear any in-progress edit before revealing the form (the
  // header "+" can be tapped with a previous item still loaded).
  if (typeof cancelStockEdit === 'function') cancelStockEdit();
  _stockShowForm = true;
  if (window._mvShowEditor) window._mvShowEditor();
  _renderStockSidebarGate();
  const first = _byId('stock-name');
  if (first) /** @type {HTMLInputElement} */ (first).focus();
}
/** @type {any} */ (window)._stockRevealForm = _stockRevealForm;

/** Reset _stockShowForm when re-entering Stock if nothing was typed and
 *  no item is being edited — so abandoned reveals revert to the gate. */
function _stockMaybeResetFormFlag() {
  if (!_stockShowForm) return;
  if (window._editingStockId) return;
  const nameInput = /** @type {HTMLInputElement|null} */ (_byId('stock-name'));
  if (nameInput && nameInput.value.trim()) return;
  _stockShowForm = false;
}
/** @type {any} */ (window)._stockMaybeResetFormFlag = _stockMaybeResetFormFlag;

function renderStockMain() {
  _updateStockBadge();
  _renderStockSidebarGate();
  const cur = window.currency;
  const el = _byId('stock-main');
  if (!el) return;
  const activeCat = window._stockCatFilter || 'All';
  const q = (window._stockSearch || '').toLowerCase();
  const sel = _stockSel();

  // Build list of used categories for filter bar
  const usedCats = [...new Set(stockItems.map(i => _scGet(i.id)).filter(Boolean))].sort();
  const showCatFilter = usedCats.length > 0;

  // Filter by search + category
  let filtered = stockItems.filter(i => {
    const vd = _svGet(i.id); const sup = _ssGet(i.id);
    const matchSearch = !q || i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q) || (_scGet(i.id)||'').toLowerCase().includes(q) || (vd.variant||'').toLowerCase().includes(q) || (sup.supplier||'').toLowerCase().includes(q);
    const matchCat = activeCat === 'All' || _scGet(i.id) === activeCat || (activeCat === 'Uncategorised' && !_scGet(i.id));
    return matchSearch && matchCat;
  });
  filtered.sort((a,b) => ((a.qty ?? 0)<=(a.low ?? 0) ? 0 : 1) - ((b.qty ?? 0)<=(b.low ?? 0) ? 0 : 1));

  /** @param {any} item */
  const stockRowHTML = (item) => {
    const isLow = (item.qty ?? 0) <= (item.low ?? 0);
    const u = window.units === 'metric' ? 'mm' : '"';
    const cat = _scGet(item.id);
    const sup = _ssGet(item.id);
    const vd = _svGet(item.id);
    const isEB = cat === 'Edge Banding';
    const isFin = cat === 'Finishing';
    const sheetCat = ['Sheet Goods','Solid Timber'].includes(cat);
    let dims = ''; let thk = ''; let glue = '';
    if (isEB) {
      const t = vd.thickness ?? item.thickness;
      const w = vd.width ?? item.width ?? item.h;
      const l = vd.length ?? item.length ?? item.w;
      thk = t ? `${t}mm` : '';
      dims = (w && l) ? `${w}mm × ${l}m` : (w ? `${w}mm` : '');
      glue = vd.glue || item.glue || '';
    } else if (isFin) {
      // Dimensions col = coverage; Thickness col = derived cost per area.
      const cov = item.coverage_sqm;
      if (cov) {
        dims = `${_fmtNum(_finCovFromM2L(cov))} ${_finCovUnit()}`;
        const perArea = item.cost / cov; // £/m²
        thk = `${cur}${(_finImperial() ? perArea / SQFT_PER_SQM : perArea).toFixed(2)}/${_finImperial() ? 'ft²' : 'm²'}`;
      }
    } else if (sheetCat) {
      dims = `${formatDim(item.w)}×${formatDim(item.h)}${u}`;
      thk = vd.thickness ? `${vd.thickness}mm` : '';
    } else {
      thk = vd.thickness ? `${vd.thickness}mm` : '';
    }
    const variant = vd.variant || glue || '';
    const sku = item.sku && item.sku !== '—' ? item.sku : '';
    const unit = isEB ? 'm' : (isFin ? _finVolUnit() : (sheetCat ? 'sheet' : 'unit'));
    const isEditing = item.id === window._editingStockId;
    // Finishing stores canonical metric (litres, £/L) — show display units.
    const qtyDisp = isFin ? _fmtNum(_finVolFromL(item.qty ?? 0)) : item.qty;
    const lowDisp = isFin ? _fmtNum(_finVolFromL(item.low ?? 0)) : (item.low ?? 0);
    const costDisp = isFin ? _finCostFromPerL(item.cost ?? 0) : (item.cost ?? 0);
    const qtySetter = isFin ? `setStockQtyFin(${item.id}, this.value)` : `setStockQty(${item.id}, this.value)`;
    const isSel = sel.has(item.id);
    return `<tr class="stock-row${isEditing ? ' editing' : ''}${isSel ? ' selected' : ''}" onclick="_openStockPopup(${item.id})">
      <td class="stock-sel-cell" onclick="event.stopPropagation()" style="width:28px;text-align:center">
        <input type="checkbox" class="stock-sel-cb" value="${item.id}" ${isSel ? 'checked' : ''} onclick="_stockToggleSel(${item.id}, this.checked)" title="Select for bulk actions">
      </td>
      <td>
        <div style="font-weight:600;color:var(--text)">${_escHtml(item.name)}${isEditing ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</div>
        ${sku ? `<div style="font-size:9px;color:var(--muted);margin-top:1px">${_escHtml(sku)}</div>` : ''}
      </td>
      <td style="color:var(--text2)">${_escHtml(variant) || '—'}</td>
      <td style="color:var(--text2)">${_escHtml(dims) || '—'}</td>
      <td style="color:var(--text2)">${_escHtml(thk) || '—'}</td>
      <td onclick="event.stopPropagation()">
        <span class="stock-qpill ${isLow?'low':'ok'}">
          <input type="text" value="${qtyDisp}" onclick="this.select()" onblur="${qtySetter}" onkeydown="if(event.key==='Enter')this.blur()">
        </span>
      </td>
      <td style="color:var(--muted)">${lowDisp}</td>
      <td style="text-align:right;color:var(--text2)">${cur}${costDisp.toFixed(2)}<span style="font-size:9px;color:var(--muted)">/${unit}</span></td>
      <td style="text-align:right;font-weight:700">${cur}${((item.qty ?? 0) * (item.cost ?? 0)).toFixed(0)}</td>
      <td style="color:var(--text2)">${
        sup.supplier && sup.url
          ? `<a class="stock-supplier-link" href="${_escHtml(_normalizeUrl(sup.url))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${_escHtml(sup.supplier)}</a>`
          : _escHtml(sup.supplier || '—')
      }</td>
      <td onclick="event.stopPropagation()" style="text-align:right;width:40px">
        <div class="stock-row-actions">
          <span class="stock-icon-btn" onclick="duplicateStockItem(${item.id})" title="Duplicate">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </span>
          <span class="stock-icon-btn stock-icon-del" onclick="deleteStockItem(${item.id})" title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </span>
        </div>
      </td>
    </tr>`;
  };

  const theadHTML = `<thead><tr>
    <th style="width:28px"></th>
    <th style="min-width:160px">Material</th>
    <th>Variant</th>
    <th>Dimensions</th>
    <th>Thickness</th>
    <th style="width:80px">Qty</th>
    <th>Low</th>
    <th style="text-align:right">Unit Cost</th>
    <th style="text-align:right">Value</th>
    <th>Supplier</th>
    <th></th>
  </tr></thead>`;

  /** @param {string} cat @param {any[]} items @param {boolean} collapsed */
  const sectionHTML = (cat, items, collapsed) => {
    const isEB = cat === 'Edge Banding';
    const isFin = cat === 'Finishing';
    const sheetCat = ['Sheet Goods','Solid Timber'].includes(cat);
    const rawStock = items.reduce((s, i) => s + (i.qty ?? 0), 0);
    const stock = isFin ? _fmtNum(_finVolFromL(rawStock)) : rawStock;
    const value = items.reduce((s, i) => s + (i.qty ?? 0) * (i.cost ?? 0), 0);
    const lowCount = items.filter(i => (i.qty ?? 0) <= (i.low ?? 0)).length;
    const unitLabel = isEB ? 'metres' : (isFin ? (_finImperial() ? 'gal' : 'litres') : (sheetCat ? 'sheets' : 'units'));
    const allSel = items.length > 0 && items.every(i => sel.has(i.id));
    return `<div class="stock-sheet-wrap${collapsed ? ' collapsed' : ''}">
      <div class="stock-cat-header" onclick="_stockToggleGroup('${cat.replace(/'/g,"\\'")}')">
        ${collapsed ? '' : `<input type="checkbox" class="stock-grp-sel" onclick="event.stopPropagation();_stockToggleGroupSel(this)" ${allSel ? 'checked' : ''} title="Select all in ${_escHtml(cat)}">`}
        <span class="stock-grp-chevron">▼</span>
        <span class="stock-grp-name">${_escHtml(cat)}</span>
        <span class="stock-grp-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        <div class="stock-grp-stats">
          ${lowCount ? `<span class="lo">Low: <b>${lowCount} item${lowCount !== 1 ? 's' : ''}</b></span>` : ''}
          <span>Stock: <b>${stock}</b> ${unitLabel}</span>
          <span>Value: <b>${cur}${value.toLocaleString('en-US',{maximumFractionDigits:0})}</b></span>
        </div>
      </div>
      ${collapsed ? '' : `<div class="stock-sheet-scrollwrap"><div class="stock-sheet-scroll"><table class="stock-sheet">${theadHTML}<tbody>${items.map(stockRowHTML).join('')}</tbody></table></div></div>`}
    </div>`;
  };

  // Always group by category (each category gets its own table)
  /** @type {Record<string, any[]>} */
  const grouped = {};
  filtered.forEach(i => {
    const c = _scGet(i.id) || 'Uncategorised';
    (grouped[c] ||= []).push(i);
  });
  const collapsedSet = _stockGetCollapsed();
  const catOrder = [...STOCK_CATS, ...Object.keys(grouped).filter(k => !STOCK_CATS.includes(k) && k !== 'Uncategorised'), 'Uncategorised'];
  let sectionsHTML = '';
  catOrder.forEach(cat => {
    if (!grouped[cat]) return;
    sectionsHTML += sectionHTML(cat, grouped[cat], collapsedSet.has(cat));
  });
  if (filtered.length === 0 && stockItems.length > 0) {
    sectionsHTML = `<div style="padding:32px 24px;text-align:center;color:var(--muted);font-size:12px">No items match the current filters.</div>`;
  }

  const allCatPills = ['All', ...usedCats, ...(stockItems.some(i => !_scGet(i.id)) ? ['Uncategorised'] : [])];
  const _m = !!(window._mvIsMobile && window._mvIsMobile());
  const _hp = _m ? '0' : '24px';   // side padding: desktop 24px (original), mobile 0 (→ main-scroll 20px)

  el.innerHTML = `<div>
    <div style="padding:16px ${_hp} 0">${_renderContentHeader({ iconSvg: _CH_ICON_STOCK, title: 'Stock Library', addOnclick: '_stockRevealForm()' })}</div>
    ${stockItems.length === 0 ? `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <h3>No stock items yet</h3><p>Add your first material using the form on the left, or load a starter library.</p>
      <button class="btn btn-primary" style="margin-top:12px" onclick="loadDefaultStockItems()">Load default stock list</button></div>` : `
    <div class="lib-filter-row" style="padding:0 ${_hp}">
      <input class="lib-filter-input" type="search" placeholder="Search…" value="${window._stockSearch||''}" oninput="window._stockSearch=this.value;renderStockMain()">
      <button class="btn btn-outline lib-filter-btn" onclick="_buildStockPDF()" title="PDF">PDF</button>
      <button class="btn btn-outline lib-filter-btn" onclick="exportStockCSV()" title="Export CSV">&darr; Export</button>
      <button class="btn btn-outline lib-filter-btn" onclick="importStockCSV()" title="Import CSV">&uarr; Import</button>
    </div>
    ${showCatFilter ? `<div class="stock-cat-filter-bar">${allCatPills.map(c => `<span class="stock-cat-pill${c===activeCat?' active':''}" onclick="window._stockCatFilter='${c}';renderStockMain()">${c}</span>`).join('')}</div>` : ''}
    ${sel.size > 0 ? `<div style="padding:0 ${_hp}"><div class="stock-bulk-bar">
      <span class="stock-bulk-count">${sel.size} selected</span>
      <div class="stock-bulk-actions">
        <button class="btn btn-outline lib-filter-btn" onclick="_stockBulkVisibility(true)">Show to customers</button>
        <button class="btn btn-outline lib-filter-btn" onclick="_stockBulkVisibility(false)">Hide from customers</button>
        <button class="btn btn-outline lib-filter-btn" style="color:var(--danger);border-color:var(--danger)" onclick="_stockBulkDelete()">Delete</button>
        <button class="btn btn-outline lib-filter-btn" onclick="_stockClearSel()">Clear</button>
      </div>
    </div></div>` : ''}
    <div style="padding:0 ${_hp}">${sectionsHTML}</div>
    `}
  </div>`;

  _stockInitScrollFades(el);
}

/**
 * Edge-fade affordance for the horizontally-scrollable stock tables. The fade
 * only shows while there's more table to reach in that direction and hides at
 * the ends — so it never dims the last visible column. Driven by a
 * ResizeObserver (fires on first layout AND when the hidden panel becomes
 * visible) plus a capture-phase scroll listener (scroll events don't bubble).
 * Self-gating: classes are only added when the table actually overflows, so the
 * desktop layout (table fits at 100%) never shows a fade.
 * @param {HTMLElement} root container whose .stock-sheet-scroll elements to wire
 */
function _stockInitScrollFades(root) {
  try {
    if (!window._stockFadeObs && typeof ResizeObserver !== 'undefined') {
      window._stockFadeObs = new ResizeObserver(entries => {
        entries.forEach(e => _stockUpdateFade(/** @type {HTMLElement} */ (e.target)));
      });
      document.addEventListener('scroll', e => {
        const t = /** @type {HTMLElement} */ (e.target);
        if (t && t.classList && t.classList.contains('stock-sheet-scroll')) _stockUpdateFade(t);
      }, true);
    }
    const obs = window._stockFadeObs;
    if (obs) {
      obs.disconnect(); // drop stale observations from the previous render
      root.querySelectorAll('.stock-sheet-scroll').forEach(s => obs.observe(s));
    }
  } catch (_) { /* progressive enhancement only */ }
}

/** @param {HTMLElement} s the scrolling .stock-sheet-scroll element */
function _stockUpdateFade(s) {
  const wrap = s.closest && s.closest('.stock-sheet-scrollwrap');
  if (!wrap) return;
  const max = s.scrollWidth - s.clientWidth;
  const canScroll = max > 1;
  wrap.classList.toggle('fade-right', canScroll && s.scrollLeft < max - 1);
  wrap.classList.toggle('fade-left', canScroll && s.scrollLeft > 1);
}

