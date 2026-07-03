// ProCabinet — Stock/order metadata persistence (carved out of src/stock.js,
// R.2/refactor 2026-07). Pure persistence layer: localStorage-map fallbacks +
// DB-column dual-writes for stock metadata (category, supplier, variant/
// thickness, manual sort order) and order metadata (quote ref, notes). No DOM,
// no rendering — UI actions that call these (e.g. _updateStockSupplier) stay in
// stock.js.
//
// Loaded as a classic <script defer> immediately AFTER src/stock.js and BEFORE
// src/app.js, whose boot block renders the stock/orders lists that read these.
// All cross-file references resolve at runtime through the global lexical
// environment.
//
// Cross-file dependencies referenced from this file's functions:
//   stockItems (src/stock.js), orders (src/orders.js), _userId / _db
//   (src/db.js) — all read inside function bodies only.

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

// ── Stock Manual Sort Order Storage (DB column first, localStorage fallback) ──
function _soMap() { try { return JSON.parse(localStorage.getItem('pc_stock_order') || '{}'); } catch(e) { return {}; } }
/** Manual position for an item, or null when unset. @param {number} id @returns {number | null} */
function _soGet(id) {
  const item = stockItems.find(s => s.id === id);
  if (item && /** @type {any} */ (item).sort_order != null) return /** @type {any} */ (item).sort_order;
  const v = _soMap()[String(id)];
  return (v != null) ? v : null;
}
/** @param {number} id @param {number | null} val */
function _soSet(id, val) {
  _stockUpdateCols(id, { sort_order: val }, 'pc_stock_order', val);
}
/** Comparator key for manual order: positioned items first (by position),
 *  unpositioned fall back to id so they keep insertion order at the end.
 *  @param {any} item */
function _stockManualKey(item) {
  const v = _soGet(item.id);
  return (v != null) ? v : (item.id + 1e7);
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
