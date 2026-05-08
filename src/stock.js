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

function exportStockCSV() {
  const u = window.units === 'metric' ? 'mm' : 'in';
  /** @type {any[][]} */
  const rows = [['Name','SKU','Category',`W (${u})`,`H (${u})`,'Qty','Low Alert','Cost/Sheet','Total Value','Status']];
  stockItems.forEach(i => {
    const cat = _scGet(i.id);
    const status = (i.qty ?? 0) <= (i.low ?? 0) ? 'Low Stock' : 'OK';
    rows.push([i.name, i.sku||'', cat, i.w, i.h, i.qty, i.low, (i.cost ?? 0).toFixed(2), ((i.qty ?? 0)*(i.cost ?? 0)).toFixed(2), status]);
  });
  const csv = rows.map(r => r.map(/** @param {any} v */ v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `stock-inventory-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Inventory exported to CSV', 'success');
}

function downloadStockTemplate() {
  const u = window.units === 'metric' ? 'mm' : 'in';
  const csv = `"Name","SKU","Category","W (${u})","H (${u})","Qty","Low Alert","Cost/Sheet"\n"18mm Birch Plywood","PLY-18-B","Sheet Goods",${u==='mm'?2440:96},${u==='mm'?1220:48},10,3,72.00`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'stock-template.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Template downloaded', 'success');
}

function importStockCSV() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('CSV has no data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 6) continue;
      /** @type {any} */
      const row = { user_id: _userId, name: r[0], sku: r[1]||'', w: parseFloat(r[3])||0, h: parseFloat(r[4])||0, qty: parseInt(r[5])||0, low: parseInt(r[6])||3, cost: parseFloat(r[7])||0 };
      if (!row.name) continue;
      if (_userId) {
        const { data } = await _db('stock_items').insert(row).select().single();
        if (data) { stockItems.push(data); if (r[2]) _scSet(data.id, r[2]); imported++; }
      }
    }
    _toast(imported + ' items imported', 'success');
    renderStockMain();
  };
  input.click();
}

/** @param {string} [mode] */
function printStockList(mode='print') {
  if (mode === 'pdf') { _buildStockPDF(); return; }
  const cur = window.currency;
  const u = window.units === 'metric' ? 'mm' : 'in';
  const biz = getBizInfo();
  const usedCats = [...new Set(stockItems.map(i => _scGet(i.id)).filter(Boolean))].sort();
  const totalValue = stockItems.reduce((s,i) => s + (i.qty ?? 0)*(i.cost ?? 0), 0);
  const totalSheets = stockItems.reduce((s,i) => s + (i.qty ?? 0), 0);
  const lowItems = stockItems.filter(i => (i.qty ?? 0) <= (i.low ?? 0));

  // Group by category
  /** @type {Record<string, any[]>} */
  const grouped = {};
  stockItems.forEach(i => { const c = _scGet(i.id) || 'Uncategorised'; if (!grouped[c]) grouped[c] = []; grouped[c].push(i); });
  const catOrder = [...STOCK_CATS, ...Object.keys(grouped).filter(k => !STOCK_CATS.includes(k) && k !== 'Uncategorised'), 'Uncategorised'];

  const rows = catOrder.filter(c => grouped[c]).map(cat => `
    <tr><td colspan="7" style="background:#f5f5f5;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;padding:6px 10px">${cat}</td></tr>
    ${grouped[cat].map(/** @param {any} i */ i => {
      const isLow = (i.qty ?? 0) <= (i.low ?? 0);
      const sup = _ssGet(i.id);
      return `<tr style="${isLow?'background:#fff5f5':''}">
        <td>${i.name}</td>
        <td>${i.sku||'—'}</td>
        <td>${formatDim(i.w)}×${formatDim(i.h)}${u}</td>
        <td style="font-size:10px;color:#666">${sup.supplier||''}</td>
        <td style="text-align:right;${isLow?'color:#c0392b;font-weight:700':''}">${i.qty}</td>
        <td style="text-align:right">${i.low}</td>
        <td style="text-align:right">${cur}${((i.qty ?? 0)*(i.cost ?? 0)).toFixed(0)}</td>
      </tr>`;
    }).join('')}`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Inventory</title>
<style>
  @page { size:A4; margin:14mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #111; padding-bottom:10px; margin-bottom:18px; }
  .biz { font-size:16px; font-weight:800; }
  .biz-sub { font-size:10px; color:#888; margin-top:2px; }
  .doc-right { text-align:right; }
  .doc-title { font-size:20px; font-weight:300; letter-spacing:3px; text-transform:uppercase; color:#333; }
  .doc-meta { font-size:10px; color:#999; margin-top:3px; }
  .summary { display:flex; gap:0; border:1px solid #e0e0e0; border-radius:6px; overflow:hidden; margin-bottom:20px; }
  .sstat { flex:1; padding:10px 14px; border-right:1px solid #e0e0e0; }
  .sstat:last-child { border-right:none; }
  .sstat-val { font-size:18px; font-weight:800; }
  .sstat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; margin-top:1px; }
  table { width:100%; border-collapse:collapse; }
  thead tr { border-bottom:1.5px solid #111; }
  thead th { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; padding:6px 10px; text-align:left; }
  thead th.r { text-align:right; }
  tbody td { padding:7px 10px; border-bottom:1px solid #f3f3f3; font-size:11px; }
  .footer { margin-top:24px; border-top:1px solid #eee; padding-top:8px; display:flex; justify-content:space-between; font-size:9px; color:#bbb; }
  .low-note { background:#fff5f5; border:1px solid #fca5a5; border-radius:4px; padding:6px 10px; margin-bottom:14px; font-size:11px; color:#c0392b; }
</style></head><body>
<div class="hdr">
  <div><div class="biz">${biz.name||'ProCabinet'}</div><div class="biz-sub">${[biz.phone,biz.email].filter(Boolean).join(' · ')||'Cabinetry'}</div></div>
  <div class="doc-right"><div class="doc-title">Stock Inventory</div><div class="doc-meta">${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div></div>
</div>
<div class="summary">
  <div class="sstat"><div class="sstat-val">${stockItems.length}</div><div class="sstat-lbl">Materials</div></div>
  <div class="sstat"><div class="sstat-val">${totalSheets}</div><div class="sstat-lbl">Total Sheets</div></div>
  <div class="sstat"><div class="sstat-val">${cur}${totalValue.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}</div><div class="sstat-lbl">Total Value</div></div>
  <div class="sstat"><div class="sstat-val" style="${lowItems.length?'color:#c0392b':''}">${lowItems.length}</div><div class="sstat-lbl">Low Stock</div></div>
</div>
${lowItems.length ? `<div class="low-note">⚠ Low stock: ${lowItems.map(i=>i.name).join(', ')}</div>` : ''}
<table>
  <thead><tr><th>Material</th><th>SKU</th><th>Size</th><th>Supplier</th><th class="r">Qty</th><th class="r">Alert</th><th class="r">Value</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer"><span>${biz.name||'ProCabinet'} — ProCabinet.App</span><span>Printed ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span></div>
</body></html>`;

  _saveAsPDF(html);
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
/** @type {import('./database.types').Tables<'projects'>[]} */
let projects = [];
let stockNextId = 1;
const STOCK_CATS = ['Sheet Goods','Solid Timber','Edge Banding','Hardware','Finishing','Other'];

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
  const qtyEl = _byId('stock-qty-fields');
  const ebQtyEl = _byId('stock-eb-qty-fields');
  if (!dimsEl) return;
  const isEB = cat === 'Edge Banding';
  const sheetCats = ['Sheet Goods', 'Solid Timber'];
  dimsEl.style.display = sheetCats.includes(cat) ? '' : 'none';
  if (ebEl) ebEl.style.display = isEB ? '' : 'none';
  if (qtyEl) qtyEl.style.display = isEB ? 'none' : '';
  if (ebQtyEl) ebQtyEl.style.display = isEB ? '' : 'none';
}
function cancelStockEdit() {
  window._editingStockId = null;
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  inp('stock-name').value = '';
  inp('stock-variant').value = '';
  inp('stock-sku').value = '';
  inp('stock-submit-btn').textContent = '+ Add to Stock';
  inp('stock-cancel-btn').style.display = 'none';
  inp('stock-form-title').textContent = 'Add Material';
  _stockShowForm = false;
  renderStockMain();
}

async function addStockItem() {
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const name = inp('stock-name').value.trim();
  if (!name) { _toast('Enter a material name.', 'error'); return; }
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('stock', stockItems.length)) return;
  const cat = inp('stock-cat').value.trim();
  const variant = inp('stock-variant').value.trim();
  const isEB = cat === 'Edge Banding';
  const thick = isEB
    ? (parseFloat(_byId('stock-eb-thick')?.value ?? '') || 0)
    : (parseFloat(_byId('stock-thick')?.value ?? '') || 0);
  const ebWidth = isEB ? (parseFloat(_byId('stock-eb-width')?.value ?? '') || 0) : 0;
  const ebLength = isEB ? (parseFloat(_byId('stock-eb-length')?.value ?? '') || 0) : 0;
  const ebGlue = isEB ? (_byId('stock-eb-glue')?.value || '') : '';
  const row = {
    user_id: _userId, name,
    sku: inp('stock-sku').value.trim() || '—',
    w: isEB ? ebLength : (parseFloat(inp('stock-w').value) || 2440),
    h: isEB ? ebWidth : (parseFloat(inp('stock-h').value) || 1220),
    qty: isEB
      ? Math.round(ebLength)
      : (parseInt(inp('stock-qty').value) || 0),
    low: isEB
      ? Math.round(parseFloat(_byId('stock-eb-low')?.value ?? '') || 0)
      : (parseInt(inp('stock-low').value) || 3),
    cost: isEB
      ? (parseFloat(_byId('stock-eb-cost')?.value ?? '') || 0)
      : (parseFloat(inp('stock-cost').value) || 0),
  };
  const { data, error } = await _db('stock_items').insert(/** @type {any} */ (row)).select().single();
  if (error || !data) { _toast('Could not save stock item — ' + (error?.message || JSON.stringify(error)), 'error'); console.error(error); return; }
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
  window._editingStockId = null;
  _stockShowForm = false;
  renderStockMain();
}

/** @param {number} id */
function editStockItem(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  window._editingStockId = id;
  _stockShowForm = true;
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
  // Scroll sidebar to top and change button/title text
  const sidebar = document.querySelector('#panel-stock .sidebar-scroll');
  if (sidebar) sidebar.scrollTop = 0;
  inp('stock-submit-btn').textContent = 'Save Changes';
  inp('stock-cancel-btn').style.display = '';
  inp('stock-form-title').textContent = 'Edit Material';
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
    };
  }
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

/** @param {number} id */
async function removeStock(id) {
  if (!_requireAuth()) return;
  await _db('stock_items').delete().eq('id', id);
  stockItems = stockItems.filter(s => s.id !== id);
  renderStockMain();
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
    gate.innerHTML = _renderListEmpty({
      iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
      title: 'Stock',
      subtitle: 'Track sheet goods, hardware, and consumables. Add your first material to get started.',
      btnLabel: '+ Add Stock Item',
      btnOnclick: '_stockRevealForm()',
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
  _stockShowForm = true;
  _renderStockSidebarGate();
  const first = _byId('stock-name');
  if (first) /** @type {HTMLInputElement} */ (first).focus();
}
/** @type {any} */ (window)._stockRevealForm = _stockRevealForm;

function renderStockMain() {
  _updateStockBadge();
  _renderStockSidebarGate();
  const cur = window.currency;
  const el = _byId('stock-main');
  if (!el) return;
  const totalSheets = stockItems.reduce((s, i) => s + (i.qty ?? 0), 0);
  const totalValue = stockItems.reduce((s, i) => s + (i.qty ?? 0) * (i.cost ?? 0), 0);
  const lowItems = stockItems.filter(i => (i.qty ?? 0) <= (i.low ?? 0)).length;
  const activeCat = window._stockCatFilter || 'All';
  const q = (window._stockSearch || '').toLowerCase();

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
    const sheetCat = ['Sheet Goods','Solid Timber'].includes(cat);
    let dims = ''; let thk = ''; let glue = '';
    if (isEB) {
      const t = vd.thickness ?? item.thickness;
      const w = vd.width ?? item.width ?? item.h;
      const l = vd.length ?? item.length ?? item.w;
      thk = t ? `${t}mm` : '';
      dims = (w && l) ? `${w}mm × ${l}m` : (w ? `${w}mm` : '');
      glue = vd.glue || item.glue || '';
    } else if (sheetCat) {
      dims = `${formatDim(item.w)}×${formatDim(item.h)}${u}`;
      thk = vd.thickness ? `${vd.thickness}mm` : '';
    } else {
      thk = vd.thickness ? `${vd.thickness}mm` : '';
    }
    const variant = vd.variant || glue || '';
    const sku = item.sku && item.sku !== '—' ? item.sku : '';
    const unit = isEB ? 'm' : (sheetCat ? 'sheet' : 'unit');
    return `<tr class="stock-row" onclick="_openStockPopup(${item.id})">
      <td>
        <div style="font-weight:600;color:var(--text)">${_escHtml(item.name)}</div>
        ${sku ? `<div style="font-size:9px;color:var(--muted);margin-top:1px">${_escHtml(sku)}</div>` : ''}
      </td>
      <td style="color:var(--text2)">${_escHtml(variant) || '—'}</td>
      <td style="color:var(--text2)">${_escHtml(dims) || '—'}</td>
      <td style="color:var(--text2)">${_escHtml(thk) || '—'}</td>
      <td onclick="event.stopPropagation()">
        <span class="stock-qpill ${isLow?'low':'ok'}">
          <input type="text" value="${item.qty}" onclick="this.select()" onblur="setStockQty(${item.id}, this.value)" onkeydown="if(event.key==='Enter')this.blur()">
        </span>
      </td>
      <td style="color:var(--muted)">${item.low ?? 0}</td>
      <td style="text-align:right;color:var(--text2)">${cur}${item.cost.toFixed(2)}<span style="font-size:9px;color:var(--muted)">/${unit}</span></td>
      <td style="text-align:right;font-weight:700">${cur}${(item.qty * item.cost).toFixed(0)}</td>
      <td style="color:var(--text2)">${
        sup.supplier && sup.url
          ? `<a class="stock-supplier-link" href="${_escHtml(_normalizeUrl(sup.url))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${_escHtml(sup.supplier)}</a>`
          : _escHtml(sup.supplier || '—')
      }</td>
      <td onclick="event.stopPropagation()" style="text-align:right;width:40px">
        <div class="stock-row-actions">
          <span class="stock-icon-btn" onclick="useStockInCutList(${item.id})" title="Add to Cut List">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.8,5.1 L12,2 L12.6,5 L14.4,5.4 L17,3.3 L16,6.3 L17.4,7.5 L20.7,7 L18.3,9 L18.9,10.8 L22,12 L19,12.6 L18.6,14.4 L20.7,17 L17.7,16 L16.5,17.4 L17,20.7 L15,18.3 L13.2,18.9 L12,22 L11.4,19 L9.6,18.6 L7,20.7 L8,17.7 L6.6,16.5 L3.3,17 L5.7,15 L5.1,13.2 L2,12 L5,11.4 L5.4,9.6 L3.3,7 L6.3,8 L7.5,6.6 L7,3.3 L9,5.7 Z"/><circle cx="12" cy="12" r="2.5"/></svg>
          </span>
        </div>
      </td>
    </tr>`;
  };

  const theadHTML = `<thead><tr>
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
    const stock = items.reduce((s, i) => s + (i.qty ?? 0), 0);
    const value = items.reduce((s, i) => s + (i.qty ?? 0) * (i.cost ?? 0), 0);
    const lowCount = items.filter(i => (i.qty ?? 0) <= (i.low ?? 0)).length;
    const isEB = cat === 'Edge Banding';
    const sheetCat = ['Sheet Goods','Solid Timber'].includes(cat);
    const unitLabel = isEB ? 'metres' : (sheetCat ? 'sheets' : 'units');
    return `<div class="stock-sheet-wrap${collapsed ? ' collapsed' : ''}">
      <div class="stock-cat-header" onclick="_stockToggleGroup('${cat.replace(/'/g,"\\'")}')">
        <span class="stock-grp-chevron">▼</span>
        <span class="stock-grp-name">${_escHtml(cat)}</span>
        <span class="stock-grp-count">${items.length} item${items.length !== 1 ? 's' : ''}</span>
        <div class="stock-grp-stats">
          ${lowCount ? `<span class="lo">Low: <b>${lowCount} item${lowCount !== 1 ? 's' : ''}</b></span>` : ''}
          <span>Stock: <b>${stock}</b> ${unitLabel}</span>
          <span>Value: <b>${cur}${value.toLocaleString('en-US',{maximumFractionDigits:0})}</b></span>
        </div>
      </div>
      ${collapsed ? '' : `<table class="stock-sheet">${theadHTML}<tbody>${items.map(stockRowHTML).join('')}</tbody></table>`}
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

  el.innerHTML = `<div>
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:nowrap">
      <div class="stat-card accent" style="flex:1;padding:10px 14px"><div class="stat-label">Materials</div><div class="stat-value">${stockItems.length}</div></div>
      <div class="stat-card success" style="flex:1;padding:10px 14px"><div class="stat-label">In Stock</div><div class="stat-value">${totalSheets}</div></div>
      <div class="stat-card ${lowItems ? 'danger' : 'success'}" style="flex:1;padding:10px 14px"><div class="stat-label">Low Stock</div><div class="stat-value">${lowItems}</div></div>
      <div class="stat-card warn" style="flex:1;padding:10px 14px"><div class="stat-label">Value</div><div class="stat-value">${cur}${totalValue.toLocaleString('en-US',{maximumFractionDigits:0})}</div></div>
    </div>

    ${stockItems.length === 0 ? `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
      <h3>No stock items yet</h3><p>Add your first material using the form on the left.</p></div>` : `
    <div style="padding:0 24px 8px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      <input class="order-search-input" type="search" placeholder="Search…" value="${window._stockSearch||''}" oninput="window._stockSearch=this.value;renderStockMain()" style="max-width:180px">
      <span style="font-size:11px;color:var(--muted)">${filtered.length} of ${stockItems.length}</span>
      <div style="margin-left:auto;display:flex;gap:4px">
        <button class="btn btn-outline" onclick="exportStockCSV()" style="width:auto;padding:4px 10px;font-size:11px" title="Export CSV">Export</button>
        <button class="btn btn-outline" onclick="importStockCSV()" style="width:auto;padding:4px 10px;font-size:11px" title="Import CSV">Import</button>
        <button class="btn btn-outline" onclick="printStockList('print')" style="width:auto;padding:4px 10px;font-size:11px" title="Print">Print</button>
        <button class="btn btn-outline" onclick="printStockList('pdf')" style="width:auto;padding:4px 10px;font-size:11px" title="PDF">PDF</button>
      </div>
    </div>
    ${showCatFilter ? `<div class="stock-cat-filter-bar">${allCatPills.map(c => `<span class="stock-cat-pill${c===activeCat?' active':''}" onclick="window._stockCatFilter='${c}';renderStockMain()">${c}</span>`).join('')}</div>` : ''}
    <div style="padding:0 24px">${sectionsHTML}</div>
    `}
  </div>`;
}

