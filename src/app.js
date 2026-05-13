// ProCabinet — main app script (Phase 5 of pre-launch refactor)
// Extracted from index.html. Module split (Phase 6) breaks this into src/<feature>.js

// DB layer moved to src/db.js (Phase 6 partial split)
// UI primitives moved to src/ui.js (Phase 6 partial split)


function _requireAuth() {
  if (_userId) return true;
  _showAuth();
  return false;
}

// ── Client edit: routes to sidebar editor (replaces former popup) ──
/** Compatibility alias — keeps existing call sites working.
 *  @param {number} id */
function _openClientPopup(id) {
  switchSection('clients');
  if (typeof editClient === 'function') editClient(id);
}

// ── Order Popup ──
// Mirror of the quote popup's line-items state.
/** @type {{orderId: number|null, lines: any[]}} */
/** Sidebar editor state for the Orders tab (replaces former popup state).
 *  - orderId: null until a row is created/loaded
 *  - lines: in-memory editable copies of order_lines rows
 *  - dirty: true when fields have been edited but not saved
 *  - clientId: working client id (used in the empty/new state before orderId exists) */
let _opState = /** @type {{orderId: number|null, lines: any[], dirty: boolean, clientId: number|null, startingNew: boolean}} */ ({ orderId: null, lines: [], dirty: false, clientId: null, startingNew: false });

/** Compatibility alias: routes to the Orders sidebar editor.
 *  Kept so external callers (schedule.js, dashboard.js) continue to work.
 *  @param {number} id */
function _openOrderPopup(id) {
  switchSection('orders');
  if (typeof loadOrderIntoSidebar === 'function') loadOrderIntoSidebar(id);
}

// SVG icons for the line-item kind badge. Mirror the top nav-tab SVGs (kept
// in sync with the tile icons in orders.js / quotes.js):
// Cabinet ← Cabinet nav-tab, Item ← Stock nav-tab (3D box), Labour ← Schedule nav-tab (calendar).
const _LI_KIND_ICON = {
  cabinet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  item:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  labour:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
};

function _renderOrderLines() {
  const host = document.getElementById('po-lines');
  if (!host) return;
  if (!_opState.lines.length) {
    host.innerHTML = '<div class="li-empty">No line items yet — add a cabinet or item below.</div>';
    return;
  }
  _opState.lines.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const tableClasses = _orderTableToggleClasses();
  const head = `<thead><tr>
    <th class="col-handle"></th>
    <th class="col-dot"></th>
    <th>Description</th>
    <th class="num col-qty">Qty</th>
    <th class="num col-price">Price</th>
    <th class="num col-hrs">Hrs</th>
    <th class="num col-disc">Disc%</th>
    <th class="num col-total">Total</th>
    <th class="col-x"></th>
  </tr></thead>`;
  const body = '<tbody>' + _opState.lines.map((row, i) => _orderLineRowHtml(row, i)).join('') + '</tbody>';
  host.innerHTML = `<table class="editor-li-table ${tableClasses}" id="po-lines-table">${head}${body}</table>`;
  _autoGrowDescTextareas(host);
}

// Build the class string for `.editor-li-table` reflecting which optional
// columns are hidden. Column-toggle state is persisted in localStorage so it
// survives sidebar reloads. Stock is a library toggle, not a column.
function _orderTableToggleClasses() {
  const cols = ['disc', 'hrs'];
  return cols
    .filter(c => localStorage.getItem('pc_order_col_' + c) === 'off')
    .map(c => 'hide-' + c)
    .join(' ');
}

// Render a single row as a <tr> in the zebra-striped table. Three kinds:
// cabinet (read-only price + auto hours, editable qty/disc), item (fully
// editable), stock (item-style but tied to a stock library entry — same
// editable fields). Legacy `labour` rows render as item-style rows (the
// labour math still works through _lineSubtotal's labour branch).
/** @param {any} row @param {number} i */
function _orderLineRowHtml(row, i) {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const sub = _lineSubtotal(row);
  const total = sub.materials + sub.labour;
  const kind = row.line_kind || 'cabinet';
  const disc = parseFloat(row.discount) || 0;
  const discCell = `<td class="col-disc${disc > 0 ? '' : ' zero'}"><input class="cl-input right" type="number" min="0" max="100" step="1" value="${disc || ''}" placeholder="—" oninput="_orderLineUpdate(${i}, 'discount', this.value)"></td>`;
  if (kind === 'cabinet') {
    // Cabinet hours = cached calcCBLine().labourHrs × qty; fall back to
    // computing on demand if the cache hasn't been populated yet.
    let hrs = row._hrs;
    if (typeof hrs !== 'number') {
      try {
        const cb = _quoteLineRowToCB(row);
        const c = calcCBLine(cb);
        hrs = c.labourHrs || 0;
        Object.defineProperty(row, '_hrs', { value: hrs, writable: true, enumerable: false, configurable: true });
      } catch (e) { hrs = 0; }
    }
    const hrsTotal = hrs * (parseFloat(row.qty) || 1);
    const unitPrice = (parseFloat(row.qty) || 1) > 0 ? (sub.materials + sub.labour) / (parseFloat(row.qty) || 1) : 0;
    const descDefault = row.name || 'Cabinet';
    return `<tr>
      <td class="col-handle" title="Drag to reorder (coming soon)">⋮</td>
      <td class="col-dot"><span></span></td>
      <td class="col-desc"><textarea class="cl-input desc" rows="1" oninput="_orderLineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(descDefault)}</textarea></td>
      <td class="col-qty"><input class="cl-input right" type="number" min="1" step="1" value="${row.qty ?? 1}" oninput="_orderLineUpdate(${i}, 'qty', this.value)"></td>
      <td class="col-price"><div class="total-val" style="font-weight:400;color:var(--text2)">${fmt(unitPrice)}</div></td>
      <td class="col-hrs" title="Computed from cabinet labour"><div class="cl-input right is-computed" style="padding:5px 4px">${hrsTotal.toFixed(1)}</div></td>
      ${discCell}
      <td class="col-total"><div class="total-val">${fmt(total)}</div></td>
      <td class="col-x" title="Remove" onclick="_orderLineRemove(${i})">✕</td>
    </tr>`;
  }
  // Item / stock / legacy labour: same editable shape. Stock rows link to a
  // stock_items row via row.stock_id (kept in shadow state; persisted to DB).
  // Legacy labour rows write to labour_hours; everything else writes to
  // schedule_hours (workshop time, scheduler-only, PDF-hidden).
  const isLegacyLabour = kind === 'labour';
  const isStock = kind === 'stock';
  const dotClass = isStock ? 'is-stock' : (isLegacyLabour ? 'is-labour' : 'is-item');
  const hoursField = isLegacyLabour ? 'labour_hours' : 'schedule_hours';
  const hoursVal = isLegacyLabour ? (row.labour_hours ?? 0) : (row.schedule_hours ?? 0);
  const placeholder = isStock ? 'Stock item description…' : 'Item description…';
  return `<tr>
    <td class="col-handle" title="Drag to reorder (coming soon)">⋮</td>
    <td class="col-dot ${dotClass}"><span></span></td>
    <td class="col-desc"><textarea class="cl-input desc" rows="1" placeholder="${placeholder}" oninput="_orderLineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(row.name || '')}</textarea></td>
    <td class="col-qty"><input class="cl-input right" type="number" min="0" step="1" value="${row.qty ?? 1}" oninput="_orderLineUpdate(${i}, 'qty', this.value)"></td>
    <td class="col-price"><input class="cl-input right" type="number" min="0" step="0.01" value="${row.unit_price ?? 0}" oninput="_orderLineUpdate(${i}, 'unit_price', this.value)"></td>
    <td class="col-hrs" title="Workshop time, not on PDF"><input class="cl-input right" type="number" min="0" step="0.5" value="${hoursVal}" oninput="_orderLineUpdate(${i}, '${hoursField}', this.value)"></td>
    ${discCell}
    <td class="col-total"><div class="total-val">${fmt(total)}</div></td>
    <td class="col-x" title="Remove" onclick="_orderLineRemove(${i})">✕</td>
  </tr>`;
}

// Auto-grow a textarea to fit its content so multi-line descriptions wrap
// onto extra lines and the row grows.
/** @param {HTMLTextAreaElement} ta */
function _autoGrowTextarea(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
/** @param {Element} host */
function _autoGrowDescTextareas(host) {
  host.querySelectorAll('textarea.cl-input.desc').forEach(ta => _autoGrowTextarea(/** @type {HTMLTextAreaElement} */ (ta)));
}

/** Render the stock library smart-search dropdown for the order/quote editor.
 *  Filters `window.stockItems` by name (substring match), groups by category,
 *  and renders sticky-header sections. Each row click calls `onPick(item)`
 *  and clears the search input.
 *  @param {string} q query string
 *  @param {string} suggestId id of the .stock-suggest container
 *  @param {(item: any) => void} onPick called with the picked stockItems row */
function _stockSearchRender(q, suggestId, onPick) {
  const box = document.getElementById(suggestId);
  if (!box || typeof stockItems === 'undefined' || !Array.isArray(stockItems)) return;
  const cur = window.currency;
  const ql = (q || '').trim().toLowerCase();
  const matches = stockItems.filter(s => !ql || (s.name || '').toLowerCase().includes(ql));
  /** @type {string[]} */
  const html = [];
  if (matches.length === 0) {
    html.push('<div style="padding:14px 12px;font-size:11px;color:var(--muted);text-align:center">No matching stock</div>');
  } else {
    /** @type {Record<string, any[]>} */
    const grouped = {};
    for (const s of matches) {
      const cat = (s.category || _scGet(s.id) || 'Other');
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(s);
    }
    Object.keys(grouped).sort().forEach(cat => {
      html.push(`<div class="suggest-group-header">${_escHtml(cat)}</div>`);
      grouped[cat].forEach(s => {
        const dims = (s.w && s.h) ? `${s.w}×${s.h}` : '';
        const qty = s.qty != null ? `${s.qty}${dims ? ' · ' + dims : ''}` : (dims || '');
        const cost = s.cost != null ? cur + Number(s.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
        const metas = [];
        if (qty)  metas.push(`<span class="csi-meta">${_escHtml(qty)}</span>`);
        if (cost) metas.push(`<span class="csi-meta">${cost}</span>`);
        html.push(`<div class="client-suggest-item" data-stock-id="${s.id}">
          <span class="csi-name">${_escHtml(s.name || '')}</span>
          ${metas.join('')}
        </div>`);
      });
    });
  }
  html.push('<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock item</div>');
  box.innerHTML = html.join('');
  box.style.display = 'block';
  // Wire click handler via delegation (mousedown fires before input blur).
  box.onmousedown = (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const rowEl = target.closest('.client-suggest-item');
    if (!rowEl) return;
    e.preventDefault();
    const sid = parseInt(/** @type {HTMLElement} */ (rowEl).dataset.stockId || '0', 10);
    const picked = stockItems.find(s => s.id === sid);
    if (picked) onPick(picked);
    box.style.display = 'none';
  };
}

// S.3: Per-order hours breakdown for the popup readout. Returns components
// in hours; total is the sum used by the production scheduler.
// Mirrors the formula documented in the plan; will move to src/scheduler.js
// in S.4 alongside computeSchedule().
/** @param {any[]} lines @param {{packagingHours?: number, runOverHours?: number, allocatedHours?: number|null}} [overrides] */
function _orderHoursBreakdown(lines, overrides) {
  // When the order has a manual hours_allocated override, the auto components
  // are bypassed entirely — the scheduler reserves exactly the override value.
  const ovr = overrides || {};
  if (ovr.allocatedHours != null) {
    return { cabinet: 0, labour: 0, item: 0, packaging: 0, runOver: 0, total: parseFloat(String(ovr.allocatedHours)) || 0 };
  }
  let cabinetHrs = 0, labourHrs = 0, itemHrs = 0;
  for (const r of lines || []) {
    const kind = r.line_kind || 'cabinet';
    if (kind === 'cabinet') {
      // Use cached _hrs if present; otherwise compute via calcCBLine and cache.
      // calcCBLine bakes contingency (cbSettings.contingencyPct) into the labour
      // hours, so the cabinet line below already includes contingency time.
      let hrs = r._hrs;
      if (typeof hrs !== 'number') {
        try {
          const cb = _quoteLineRowToCB(r);
          const c = calcCBLine(cb);
          hrs = c.labourHrs || 0;
          Object.defineProperty(r, '_hrs', { value: hrs, writable: true, enumerable: false, configurable: true });
        } catch (e) { hrs = 0; }
      }
      cabinetHrs += hrs * (parseFloat(r.qty) || 1);
    } else if (kind === 'labour') {
      labourHrs += parseFloat(r.labour_hours) || 0;
    } else if (kind === 'item') {
      itemHrs += (parseFloat(r.schedule_hours) || 0) * (parseFloat(r.qty) || 1);
    }
  }
  const pack = ovr.packagingHours != null ? ovr.packagingHours : (cbSettings.packagingHours ?? 0);
  const over = ovr.runOverHours != null ? ovr.runOverHours : 0;
  return {
    cabinet: cabinetHrs,
    labour: labourHrs,
    item: itemHrs,
    packaging: pack,
    runOver: over,
    total: cabinetHrs + labourHrs + itemHrs + pack + over,
  };
}

// Render the breakdown into the popup. Reads packaging/contingency/run-over
// directly from the popup inputs so the readout responds live as the user
// types.
function _renderOrderHoursBreakdown() {
  const el = document.getElementById('po-hours-breakdown');
  if (!el) return;
  const popupVal = /** @param {string} id @returns {number|undefined} */ id => {
    const v = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
    return v && v.value !== '' ? parseFloat(v.value) : undefined;
  };
  // Skip the breakdown computation entirely when the override is on — the
  // panel is hidden in that mode anyway.
  const overrideEl = /** @type {HTMLInputElement|null} */ (document.getElementById('po-hours-override'));
  if (overrideEl && overrideEl.checked) { el.innerHTML = ''; return; }
  const b = _orderHoursBreakdown(_opState.lines, {
    runOverHours: popupVal('po-run-over'),
  });
  /** @param {number} v */
  const h = v => Number(v).toFixed(1) + ' h';
  const contPct = cbSettings.contingencyPct ?? 0;
  const contLabel = contPct > 0 ? ` <span class="pf-hours-tag">incl. ${contPct}% contingency</span>` : '';
  /** @type {string[]} */
  const rows = [];
  if (b.cabinet > 0)   rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Cabinet labour <span class="pf-hours-tag">auto</span>${contLabel}</span><span>${h(b.cabinet)}</span></div>`);
  if (b.item    > 0)   rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Item lines</span><span>${h(b.item)}</span></div>`);
  if (b.packaging > 0) rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Packaging</span><span>${h(b.packaging)}</span></div>`);
  if (b.runOver  > 0)  rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Run-over</span><span>${h(b.runOver)}</span></div>`);
  el.innerHTML = `<div class="pf-hours-row pf-hours-total"><span>Hours required</span><span>${h(b.total)}</span></div>${rows.join('')}`;
}

// When auto-schedule toggles, enable/disable the Production Start input.
// Manual start/end inputs no longer exist — production_start_date is the
// single anchor when auto is off, end is computed by the scheduler from
// hoursRequired (or hours_allocated override).
/** @param {boolean} on */
function _orderAutoScheduleToggle(on) {
  // Priority only applies when auto-scheduling — hide the field when off.
  const prioWrap = document.getElementById('po-priority-wrap');
  if (prioWrap) prioWrap.style.display = on ? '' : 'none';
  const startInput = /** @type {HTMLInputElement|null} */ (document.getElementById('po-start'));
  if (startInput) {
    startInput.disabled = on;
    startInput.title = on ? 'Auto-scheduled — toggle off to set manually' : '';
    if (!on && !startInput.value && _opState.orderId != null) {
      // Seed with the current scheduler-computed start so the bar doesn't
      // jump on toggle.
      const sched = (typeof computeSchedule === 'function')
        ? computeSchedule(orders, {
            workdayHours: cbSettings.workdayHours,
            weekdayHours: cbSettings.weekdayHours,
            packagingHours: cbSettings.packagingHours,
            contingencyPct: cbSettings.contingencyPct,
            queueStartDate: cbSettings.queueStartDate,
          }, dayOverrides || [], new Date()).get(_opState.orderId)
        : null;
      const o = orders.find(x => x.id === _opState.orderId);
      startInput.value = (sched && sched.startISO) || (o ? _orderDateToISO(o.prodStart || '') : '') || '';
    }
  }
  // Update the auto/manual hint label and the schedule summary line.
  if (typeof _renderOrderSchedSummary === 'function') _renderOrderSchedSummary();
}

function _renderOrderLineTotals() {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  // Subtotal is the sum of per-line _lineSubtotal results, which already have
  // the per-line discount applied. Order-level markup is added, then tax,
  // then whole-order discount comes off last.
  const subParts = _opState.lines.reduce(
    (acc, row) => {
      const s = _lineSubtotal(row);
      if (row.line_kind === 'stock') {
        acc.stockMat += s.materials;
      } else {
        acc.materials += s.materials;
        acc.labour += s.labour;
      }
      return acc;
    },
    { materials: 0, labour: 0, stockMat: 0 }
  );
  // Stock markup is a single rate applied to all stock-kind lines (set in the
  // editor below the stock library). The legacy order-level markup column
  // (orders.markup) stays in the DB for back-compat — existing rows with a
  // non-zero markup still apply it here, but the UI no longer exposes it.
  // The legacy order-level `markup` column is no longer applied — stock_markup
  // is the only markup concept in the new editor (per mockup J). Existing
  // orders with a non-zero `markup` value will see a lower total; the column
  // stays in the DB so historical data isn't lost.
  const stockMarkup = parseFloat(_popupVal('po-stock-markup')) || 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkup / 100;
  const sub = subParts.materials + subParts.labour + stockMarkupAmt;
  const tax = parseFloat(_popupVal('po-tax')) || 0;
  const discount = parseFloat(_popupVal('po-discount')) || 0;
  const taxAmt = sub * tax / 100;
  const afterTax = sub + taxAmt;
  const discountAmt = afterTax * discount / 100;
  const total = afterTax - discountAmt;
  const el = document.getElementById('po-totals');
  if (!el) return;
  const stockMarkupRow = stockMarkupAmt > 0
    ? `<div class="pf-total-row"><span class="t-label">Stock markup (${stockMarkup}%)</span><span class="t-val">+${fmt(stockMarkupAmt)}</span></div>`
    : '';
  const discRow = discount > 0
    ? `<div class="pf-total-row discount"><span class="t-label">Discount (${discount}%)</span><span class="t-val">−${fmt(discountAmt)}</span></div>`
    : '';
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(subParts.materials + subParts.labour)}</span></div>
    ${stockMarkupRow}
    <div class="pf-total-row"><span class="t-label">Tax (${tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
    ${discRow}
    <div class="pf-total-row t-main"><span class="t-label">Order Total</span><span class="t-val">${fmt(total)}</span></div>`;
}

/** @param {number} idx @param {string} field @param {any} val */
function _orderLineUpdate(idx, field, val) {
  const row = _opState.lines[idx];
  if (!row) return;
  const numeric = ['qty', 'unit_price', 'labour_hours', 'schedule_hours', 'discount'];
  row[field] = numeric.includes(field) ? (parseFloat(val) || 0) : val;
  // Per-line discount changes the cached subtotal; bust the cabinet cache
  // so the next _lineSubtotal call recomputes.
  if (field === 'discount' || field === 'qty') delete row._sub;
  _renderOrderLineTotals();
  _renderOrderHoursBreakdown();
  // Touch only the affected row's total cell so input focus is preserved.
  const host = document.getElementById('po-lines');
  if (host) {
    const rowEls = host.querySelectorAll('tbody tr');
    const rowEl = rowEls[idx];
    if (rowEl) {
      const cur = window.currency;
      const sub = _lineSubtotal(row);
      const total = sub.materials + sub.labour;
      const amt = rowEl.querySelector('.col-total .total-val');
      if (amt) amt.textContent = cur + Number(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
  }
  _scheduleOrderLineUpsert(idx);
}

/** @param {string} kind 'item' | 'labour' | 'stock' (labour kept for back-compat; UI no longer adds it) */
function _orderLineAdd(kind) {
  if (!_opState.orderId || !_userId) return;
  const position = _opState.lines.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0);
  const businessRate = (typeof cbSettings !== 'undefined' && cbSettings.labourRate) ? cbSettings.labourRate : 65;
  /** @type {any} */
  const row = {
    order_id: _opState.orderId,
    user_id: _userId,
    position,
    line_kind: kind,
    name: '',
    qty: (kind === 'item' || kind === 'stock') ? 1 : 0,
    labour_hours: kind === 'labour' ? 0 : null,
    unit_price: kind === 'labour' ? businessRate : 0,
    discount: 0,
  };
  _opState.lines.push(row);
  _renderOrderLines();
  _renderOrderLineTotals();
  _renderOrderHoursBreakdown();
  _db('order_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) { _toast('Could not add line — ' + (r.error?.message || ''), 'error'); return; }
    const idx = _opState.lines.findIndex(x => x === row);
    if (idx < 0) return;
    _opState.lines[idx].id = r.data.id;
    const cur = _opState.lines[idx];
    if (cur.name || cur.qty || cur.labour_hours || (cur.unit_price !== row.unit_price)) {
      _scheduleOrderLineUpsert(idx);
    }
  });
}

/** Add a stock-kind line to the open order from a picked stockItems row.
 *  Pre-fills name + unit_price from the stock library; the user adjusts qty.
 *  @param {any} stockItem */
function _oAddStockLineFromLibrary(stockItem) {
  if (!_opState.orderId || !_userId) return;
  const position = _opState.lines.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0);
  /** @type {any} */
  const row = {
    order_id: _opState.orderId,
    user_id: _userId,
    position,
    line_kind: 'stock',
    name: stockItem.name || '',
    qty: 1,
    unit_price: parseFloat(stockItem.cost) || 0,
    discount: 0,
  };
  _opState.lines.push(row);
  _renderOrderLines();
  _renderOrderLineTotals();
  _db('order_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) { _toast('Could not add stock line — ' + (r.error?.message || ''), 'error'); return; }
    const idx = _opState.lines.findIndex(x => x === row);
    if (idx >= 0) _opState.lines[idx].id = r.data.id;
  });
  // Clear the search input so the next pick starts fresh.
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('po-stock-search'));
  if (inp) inp.value = '';
}

/** @param {number} idx */
async function _orderLineRemove(idx) {
  const row = _opState.lines[idx];
  if (!row) return;
  if (row.line_kind === 'cabinet') {
    if (!confirm('Remove this cabinet line from the order? (Original quote unchanged.)')) return;
  }
  await _db('order_lines').delete().eq('id', row.id);
  _opState.lines.splice(idx, 1);
  _renderOrderLines();
  _renderOrderLineTotals();
  _renderOrderHoursBreakdown();
}

/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const _orderLineUpsertTimers = new Map();
/** @param {number} idx */
function _scheduleOrderLineUpsert(idx) {
  const existing = _orderLineUpsertTimers.get(idx);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _orderLineUpsertTimers.delete(idx);
    const row = _opState.lines[idx];
    if (!row || !row.id) return;
    /** @type {any} */
    const update = {
      name: row.name || '',
      qty: row.qty || 0,
      unit_price: row.unit_price ?? null,
      labour_hours: row.labour_hours ?? null,
      schedule_hours: row.schedule_hours ?? null,
      discount: row.discount ?? 0,
    };
    _db('order_lines').update(update).eq('id', row.id).then(/** @param {any} r */ (r) => {
      if (r && r.error) console.warn('[order line upsert]', r.error.message);
    });
  }, 600);
  _orderLineUpsertTimers.set(idx, t);
}

// _saveOrderPopup was replaced by saveOrderEditor() in src/orders.js.

// ── Quote Popup ──
// In-memory cache of the quote_lines for the open popup. Each open populates
// it; line CRUD operations mutate it locally then debounce-write to the DB,
// keeping the UI snappy and avoiding a refetch per edit.
/** @type {{quoteId: number|null, lines: any[]}} */
/** Sidebar editor state for the Quotes tab (replaces former popup state).
 *  Same shape as _opState but for quotes. */
let _qpState = /** @type {{quoteId: number|null, lines: any[], dirty: boolean, clientId: number|null, startingNew: boolean}} */ ({ quoteId: null, lines: [], dirty: false, clientId: null, startingNew: false });

/** Compatibility alias: routes to the Quotes sidebar editor.
 *  Kept so external callers (dashboard.js) continue to work.
 *  @param {number} id */
function _openQuotePopup(id) {
  switchSection('quote');
  if (typeof loadQuoteIntoSidebar === 'function') loadQuoteIntoSidebar(id);
}

// Render the line-item rows inside the open quote editor.
function _renderQuoteLines() {
  const host = document.getElementById('pq-lines');
  if (!host) return;
  if (!_qpState.lines.length) {
    host.innerHTML = '<div class="li-empty">No line items yet — add a cabinet or item below.</div>';
    return;
  }
  _qpState.lines.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const tableClasses = _quoteTableToggleClasses();
  const head = `<thead><tr>
    <th class="col-handle"></th>
    <th class="col-dot"></th>
    <th>Description</th>
    <th class="num col-qty">Qty</th>
    <th class="num col-price">Price</th>
    <th class="num col-hrs">Hrs</th>
    <th class="num col-disc">Disc%</th>
    <th class="num col-total">Total</th>
    <th class="col-x"></th>
  </tr></thead>`;
  const body = '<tbody>' + _qpState.lines.map((row, i) => _lineRowHtml(row, i)).join('') + '</tbody>';
  host.innerHTML = `<table class="editor-li-table ${tableClasses}" id="pq-lines-table">${head}${body}</table>`;
  _autoGrowDescTextareas(host);
}

function _quoteTableToggleClasses() {
  const cols = ['disc', 'hrs'];
  return cols
    .filter(c => localStorage.getItem('pc_quote_col_' + c) === 'off')
    .map(c => 'hide-' + c)
    .join(' ');
}

// Render a single quote_lines row as a <tr>. Same shape as _orderLineRowHtml.
/** @param {any} row @param {number} i */
function _lineRowHtml(row, i) {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const sub = _lineSubtotal(row);
  const total = (sub.materials + sub.labour);
  const kind = row.line_kind || 'cabinet';
  const disc = parseFloat(row.discount) || 0;
  const discCell = `<td class="col-disc${disc > 0 ? '' : ' zero'}"><input class="cl-input right" type="number" min="0" max="100" step="1" value="${disc || ''}" placeholder="—" oninput="_lineUpdate(${i}, 'discount', this.value)"></td>`;
  if (kind === 'cabinet') {
    let hrs = 0;
    try {
      const cb = _quoteLineRowToCB(row);
      const c = calcCBLine(cb);
      hrs = (c.labourHrs || 0) * (parseFloat(row.qty) || 1);
    } catch (e) { hrs = 0; }
    const unitPrice = (parseFloat(row.qty) || 1) > 0 ? (sub.materials + sub.labour) / (parseFloat(row.qty) || 1) : 0;
    const descDefault = row.name || 'Cabinet';
    return `<tr ondblclick="_lineEditCabinetRow(${i})" title="Double-click to edit in Cabinet Builder">
      <td class="col-handle">⋮</td>
      <td class="col-dot"><span></span></td>
      <td class="col-desc"><textarea class="cl-input desc" rows="1" oninput="_lineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(descDefault)}</textarea></td>
      <td class="col-qty"><input class="cl-input right" type="number" min="1" step="1" value="${row.qty ?? 1}" oninput="_lineUpdate(${i}, 'qty', this.value)"></td>
      <td class="col-price"><div class="total-val" style="font-weight:400;color:var(--text2)">${fmt(unitPrice)}</div></td>
      <td class="col-hrs" title="Computed from cabinet labour"><div class="cl-input right is-computed" style="padding:5px 4px">${hrs.toFixed(1)}</div></td>
      ${discCell}
      <td class="col-total"><div class="total-val">${fmt(total)}</div></td>
      <td class="col-x" title="Remove" onclick="event.stopPropagation();_lineRemove(${i})">✕</td>
    </tr>`;
  }
  const isLegacyLabour = kind === 'labour';
  const isStock = kind === 'stock';
  const dotClass = isStock ? 'is-stock' : (isLegacyLabour ? 'is-labour' : 'is-item');
  const hoursField = isLegacyLabour ? 'labour_hours' : 'schedule_hours';
  const hoursVal = isLegacyLabour ? (row.labour_hours ?? 0) : (row.schedule_hours ?? 0);
  const placeholder = isStock ? 'Stock item description…' : 'Item description…';
  return `<tr>
    <td class="col-handle">⋮</td>
    <td class="col-dot ${dotClass}"><span></span></td>
    <td class="col-desc"><textarea class="cl-input desc" rows="1" placeholder="${placeholder}" oninput="_lineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(row.name || '')}</textarea></td>
    <td class="col-qty"><input class="cl-input right" type="number" min="0" step="1" value="${row.qty ?? 1}" oninput="_lineUpdate(${i}, 'qty', this.value)"></td>
    <td class="col-price"><input class="cl-input right" type="number" min="0" step="0.01" value="${row.unit_price ?? 0}" oninput="_lineUpdate(${i}, 'unit_price', this.value)"></td>
    <td class="col-hrs" title="Workshop time, not on PDF"><input class="cl-input right" type="number" min="0" step="0.5" value="${hoursVal}" oninput="_lineUpdate(${i}, '${hoursField}', this.value)"></td>
    ${discCell}
    <td class="col-total"><div class="total-val">${fmt(total)}</div></td>
    <td class="col-x" title="Remove" onclick="_lineRemove(${i})">✕</td>
  </tr>`;
}

function _renderQuoteLineTotals() {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const subParts = _qpState.lines.reduce(
    (acc, row) => {
      const s = _lineSubtotal(row);
      if (row.line_kind === 'stock') {
        acc.stockMat += s.materials;
      } else {
        acc.materials += s.materials;
        acc.labour += s.labour;
      }
      return acc;
    },
    { materials: 0, labour: 0, stockMat: 0 }
  );
  // Same simplification as the order side: legacy `markup` is no longer
  // applied in totals math. Stock markup is the only markup concept.
  const stockMarkup = parseFloat(_popupVal('pq-stock-markup')) || 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkup / 100;
  const sub = subParts.materials + subParts.labour + subParts.stockMat + stockMarkupAmt;
  const tax = parseFloat(_popupVal('pq-tax')) || 0;
  const discount = parseFloat(_popupVal('pq-discount')) || 0;
  const taxAmt = sub * tax / 100;
  const afterTax = sub + taxAmt;
  const discountAmt = afterTax * discount / 100;
  const total = afterTax - discountAmt;
  const el = document.getElementById('pq-totals');
  if (!el) return;
  const stockMarkupRow = stockMarkupAmt > 0
    ? `<div class="pf-total-row"><span class="t-label">Stock markup (${stockMarkup}%)</span><span class="t-val">+${fmt(stockMarkupAmt)}</span></div>`
    : '';
  const discRow = discount > 0
    ? `<div class="pf-total-row discount"><span class="t-label">Discount (${discount}%)</span><span class="t-val">−${fmt(discountAmt)}</span></div>`
    : '';
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(subParts.materials + subParts.labour + subParts.stockMat)}</span></div>
    ${stockMarkupRow}
    <div class="pf-total-row"><span class="t-label">Tax (${tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
    ${discRow}
    <div class="pf-total-row t-main"><span class="t-label">Total</span><span class="t-val">${fmt(total)}</span></div>`;
}

// Update one field of one line in the local cache, then schedule a debounced
// upsert. Numeric fields are parsed; everything else stored as-is.
/** @param {number} idx @param {string} field @param {any} val */
function _lineUpdate(idx, field, val) {
  const row = _qpState.lines[idx];
  if (!row) return;
  const numeric = ['qty', 'unit_price', 'labour_hours', 'schedule_hours', 'discount'];
  row[field] = numeric.includes(field) ? (parseFloat(val) || 0) : val;
  if (field === 'discount' || field === 'qty') delete row._sub;
  _renderQuoteLineTotals();
  // Update only the affected row's total without a full re-render so input
  // focus is preserved.
  const host = document.getElementById('pq-lines');
  if (host) {
    const rowEls = host.querySelectorAll('tbody tr');
    const rowEl = rowEls[idx];
    if (rowEl) {
      const cur = window.currency;
      const sub = _lineSubtotal(row);
      const total = sub.materials + sub.labour;
      const amt = rowEl.querySelector('.col-total .total-val');
      if (amt) amt.textContent = cur + Number(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
  }
  _scheduleLineUpsert(idx);
}

/** @param {string} kind 'item' | 'labour' | 'stock' (labour kept for back-compat; UI no longer adds it) */
function _lineAdd(kind) {
  if (!_qpState.quoteId || !_userId) return;
  const position = _qpState.lines.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0);
  const businessRate = (typeof cbSettings !== 'undefined' && cbSettings.labourRate) ? cbSettings.labourRate : 65;
  /** @type {any} */
  const row = {
    quote_id: _qpState.quoteId,
    user_id: _userId,
    position,
    line_kind: kind,
    name: '',
    qty: (kind === 'item' || kind === 'stock') ? 1 : 0,
    labour_hours: kind === 'labour' ? 0 : null,
    unit_price: kind === 'labour' ? businessRate : 0,
    discount: 0,
  };
  _qpState.lines.push(row);
  _renderQuoteLines();
  _renderQuoteLineTotals();
  _db('quote_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) { _toast('Could not add line — ' + (r.error?.message || ''), 'error'); return; }
    const idx = _qpState.lines.findIndex(x => x === row);
    if (idx < 0) return;
    _qpState.lines[idx].id = r.data.id;
    const cur = _qpState.lines[idx];
    if (cur.name || cur.qty || cur.labour_hours || (cur.unit_price !== row.unit_price)) {
      _scheduleLineUpsert(idx);
    }
  });
}

/** Add a stock-kind line to the open quote from a picked stockItems row.
 *  @param {any} stockItem */
function _qAddStockLineFromLibrary(stockItem) {
  if (!_qpState.quoteId || !_userId) return;
  const position = _qpState.lines.reduce((m, r) => Math.max(m, (r.position ?? 0) + 1), 0);
  /** @type {any} */
  const row = {
    quote_id: _qpState.quoteId,
    user_id: _userId,
    position,
    line_kind: 'stock',
    name: stockItem.name || '',
    qty: 1,
    unit_price: parseFloat(stockItem.cost) || 0,
    discount: 0,
  };
  _qpState.lines.push(row);
  _renderQuoteLines();
  _renderQuoteLineTotals();
  _db('quote_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) { _toast('Could not add stock line — ' + (r.error?.message || ''), 'error'); return; }
    const idx = _qpState.lines.findIndex(x => x === row);
    if (idx >= 0) _qpState.lines[idx].id = r.data.id;
  });
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('pq-stock-search'));
  if (inp) inp.value = '';
}

/** @param {number} idx */
async function _lineRemove(idx) {
  const row = _qpState.lines[idx];
  if (!row) return;
  if (row.line_kind === 'cabinet') {
    if (!confirm('Remove this cabinet line? This will also delete it from the project.')) return;
  }
  await _db('quote_lines').delete().eq('id', row.id);
  _qpState.lines.splice(idx, 1);
  _renderQuoteLines();
  _renderQuoteLineTotals();
}

/** Save the editor's current state and switch into Cabinet Builder pointed at
 *  this quote, where the user can add or edit a cabinet on the workspace.
 *  @param {number} quoteId */
function _lineEditCabinet(quoteId) {
  const after = () => { if (typeof editQuoteInCB === 'function') editQuoteInCB(quoteId); };
  if (typeof saveQuoteEditor === 'function') saveQuoteEditor().then(after); else after();
}

/** Edit an existing cabinet line — same as Add Cabinet but the builder
 *  loads with the cabinet pre-selected for editing.
 *  @param {number} idx */
function _lineEditCabinetRow(idx) {
  const row = _qpState.lines[idx];
  if (!row || !_qpState.quoteId) return;
  const qId = /** @type {number} */ (_qpState.quoteId);
  const after = () => { if (typeof editQuoteInCB === 'function') editQuoteInCB(qId); };
  if (typeof saveQuoteEditor === 'function') saveQuoteEditor().then(after); else after();
}

/** Order analog of _lineEditCabinet — saves the current order editor and
 *  jumps into Cabinet Builder pointed at this order.
 *  @param {number} orderId */
function _orderLineEditCabinet(orderId) {
  const after = () => { if (typeof editOrderInCB === 'function') editOrderInCB(orderId); };
  if (typeof saveOrderEditor === 'function') saveOrderEditor().then(after); else after();
}

// Debounced per-line upsert: each edit waits 600ms before writing to the DB,
// so rapid typing doesn't flood the network.
/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const _lineUpsertTimers = new Map();
/** @param {number} idx */
function _scheduleLineUpsert(idx) {
  const existing = _lineUpsertTimers.get(idx);
  if (existing) clearTimeout(existing);
  const t = setTimeout(() => {
    _lineUpsertTimers.delete(idx);
    const row = _qpState.lines[idx];
    if (!row || !row.id) return;
    /** @type {any} */
    const update = {
      name: row.name || '',
      qty: row.qty || 0,
      unit_price: row.unit_price ?? null,
      labour_hours: row.labour_hours ?? null,
      schedule_hours: row.schedule_hours ?? null,
      discount: row.discount ?? 0,
    };
    _db('quote_lines').update(update).eq('id', row.id).then(/** @param {any} r */ (r) => {
      if (r && r.error) console.warn('[line upsert]', r.error.message);
    });
  }, 600);
  _lineUpsertTimers.set(idx, t);
}

// _saveQuotePopup was replaced by saveQuoteEditor() in src/quotes.js.

// ── Project edit: routes to sidebar editor (autosave) ──
/** Drill into the project's client and load it into the sidebar form. All
 *  edits autosave — no Save/Cancel buttons.
 *  @param {number} id */
function _openProjectPopup(id) {
  const p = projects.find(/** @param {any} x */ x => x.id === id);
  if (!p) return;
  switchSection('projects');
  if (p.client_id) {
    if (typeof _setProjectsActiveClient === 'function') _setProjectsActiveClient(p.client_id);
  } else {
    _toast('This project has no client — assign one from the Clients tab first.', 'error');
    return;
  }
  if (typeof _renderProjectsSidebarGate === 'function') _renderProjectsSidebarGate();
  if (typeof _pjLoadProject === 'function') _pjLoadProject(id);
}

// ── Stock edit: routes to sidebar editor (replaces former popup) ──
/** Compatibility alias — keeps existing call sites working.
 *  @param {number} id */
function _openStockPopup(id) {
  switchSection('stock');
  if (typeof editStockItem === 'function') editStockItem(id);
}

// ── New Stock Popup (for adding from Cut List) ──
function _openNewStockPopup() {
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Stock Material</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">Name</label>
        <input class="pf-input pf-input-lg" id="pns-name" placeholder="e.g. 18mm Birch Plywood">
      </div>
      <div class="pf">
        <label class="pf-label">Category</label>
        <select class="pf-select" id="pns-cat" onchange="_pnsCatChanged()">
          <option value="Sheet Goods" selected>Sheet Goods</option>
          <option value="Solid Timber">Solid Timber</option>
          <option value="Edge Banding">Edge Banding</option>
          <option value="Hardware">Hardware</option>
          <option value="Finishing">Finishing</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div class="pf">
        <label class="pf-label">Variant / Spec</label>
        <input class="pf-input" id="pns-variant" placeholder="e.g. BP-18, 500mm depth">
      </div>
      <div id="pns-sheet-fields">
        <div class="pf-row">
          <div class="pf"><label class="pf-label">Length</label><input class="pf-input" id="pns-length" value="2440"></div>
          <div class="pf"><label class="pf-label">Width</label><input class="pf-input" id="pns-width" value="1220"></div>
          <div class="pf"><label class="pf-label">Thickness</label><input class="pf-input" id="pns-thick" placeholder="18"></div>
        </div>
        <div class="pf-row">
          <div class="pf"><label class="pf-label">Qty in Stock</label><input class="pf-input" id="pns-qty" value="10" style="font-weight:700;font-size:16px;text-align:center"></div>
          <div class="pf"><label class="pf-label">Low Alert</label><input class="pf-input" id="pns-low" value="3" style="text-align:center"></div>
          <div class="pf"><label class="pf-label">Cost / Unit</label><input class="pf-input" id="pns-cost" value="0" style="text-align:right"></div>
        </div>
      </div>
      <div id="pns-eb-fields" style="display:none">
        <div class="pf-row">
          <div class="pf"><label class="pf-label">Thickness (mm)</label><input class="pf-input" id="pns-eb-thick" type="number" step="0.1" value="1.0"></div>
          <div class="pf"><label class="pf-label">Width (mm)</label><input class="pf-input" id="pns-eb-width" type="number" value="22"></div>
          <div class="pf"><label class="pf-label">Length (m)</label><input class="pf-input" id="pns-eb-length" type="number" step="0.1" value="50"></div>
        </div>
        <div class="pf-row">
          <div class="pf"><label class="pf-label">Glue Type</label>
            <select class="pf-select" id="pns-eb-glue">
              <option value="EVA">EVA</option>
              <option value="PUR">PUR</option>
              <option value="Laser">Laser</option>
              <option value="Hot Melt">Hot Melt</option>
              <option value="Pre-glued">Pre-glued</option>
              <option value="None">None</option>
            </select>
          </div>
          <div class="pf"><label class="pf-label">Low Alert (m)</label><input class="pf-input" id="pns-eb-low" type="number" step="0.1" value="10" style="text-align:center"></div>
          <div class="pf"><label class="pf-label">Cost / m</label><input class="pf-input" id="pns-eb-cost" type="number" step="0.01" value="0" style="text-align:right"></div>
        </div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf">
        <label class="pf-label">Supplier</label>
        <input class="pf-input" id="pns-supplier" placeholder="Supplier name">
      </div>
      <div class="pf" style="margin-bottom:0">
        <label class="pf-label">Reorder Link</label>
        <input class="pf-input" id="pns-url" placeholder="https://...">
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewStockPopup()">Add to Stock</button>
    </div>
  `, 'sm');
  setTimeout(() => document.getElementById('pns-name')?.focus(), 50);
}

function _pnsCatChanged() {
  const cat = /** @type {HTMLSelectElement | null} */ (document.getElementById('pns-cat'))?.value;
  const isEB = cat === 'Edge Banding';
  const sheet = document.getElementById('pns-sheet-fields');
  const eb = document.getElementById('pns-eb-fields');
  if (sheet) sheet.style.display = isEB ? 'none' : '';
  if (eb) eb.style.display = isEB ? '' : 'none';
}

async function _saveNewStockPopup() {
  const name = _popupVal('pns-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const cat = _popupVal('pns-cat') || '';
  const isEB = cat === 'Edge Banding';
  const variant = _popupVal('pns-variant') || '';
  let row, thick = 0, ebWidth = 0, ebLength = 0, ebGlue = '';
  if (isEB) {
    thick = parseFloat(_popupVal('pns-eb-thick')) || 0;
    ebWidth = parseFloat(_popupVal('pns-eb-width')) || 0;
    ebLength = parseFloat(_popupVal('pns-eb-length')) || 0;
    ebGlue = _popupVal('pns-eb-glue') || '';
    row = /** @type {any} */ ({
      name, sku: '',
      w: ebLength, h: ebWidth,
      qty: Math.round(ebLength),
      low: Math.round(parseFloat(_popupVal('pns-eb-low')) || 0),
      cost: parseFloat(_popupVal('pns-eb-cost')) || 0,
    });
  } else {
    thick = parseFloat(_popupVal('pns-thick')) || 0;
    row = /** @type {any} */ ({
      name, sku: '',
      w: parseFloat(_popupVal('pns-length')) || 0,
      h: parseFloat(_popupVal('pns-width')) || 0,
      qty: parseInt(_popupVal('pns-qty')) || 0,
      low: parseInt(_popupVal('pns-low')) || 0,
      cost: parseFloat(_popupVal('pns-cost')) || 0,
    });
  }
  /** @type {any} */
  let saved;
  if (_userId) {
    row.user_id = _userId;
    const { data, error } = await _db('stock_items').insert(row).select().single();
    if (error || !data) { _toast('Save failed: ' + (error?.message || ''), 'error'); return; }
    saved = data;
    stockItems.push(data);
  } else {
    row.id = stockNextId++;
    saved = row;
    stockItems.push(row);
  }
  if (isEB) { saved.thickness = thick; saved.width = ebWidth; saved.length = ebLength; saved.glue = ebGlue; }
  _scSet(saved.id, cat);
  /** @type {{variant: string, thickness: number, width?: number, length?: number, glue?: string}} */
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  _svSet(saved.id, meta);
  // Save supplier info
  const sup = { supplier: _popupVal('pns-supplier') || '', url: _popupVal('pns-url') || '' };
  _ssSet(saved.id, sup);
  _closePopup();
  renderStockMain();
  _toast('"' + name + '" added to stock', 'success');
}

// ── Cabinet Popup ──
/** @param {number} idx */
function _openCabinetPopup(idx) {
  const line = cbLines[idx];
  if (!line) return;
  const c = calcCBLine(line);
  const cur = window.currency;
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const cabMarkup = c.lineSubtotal * cbSettings.markup / 100;
  const cabTotal = (c.lineSubtotal + cabMarkup) * (1 + cbSettings.tax / 100);

  // Material options
  const matOpts = cbSettings.materials.map(/** @param {any} m */ m =>
    `<option value="${m.name}" ${m.name===line.material?'selected':''}>${m.name}</option>`
  ).join('');
  const finishOpts = (cbSettings.finishes||[]).map(/** @param {any} f */ f =>
    `<option value="${f.name}" ${f.name===(line.finish||'None')?'selected':''}>${f.name}</option>`
  ).join('');
  const constOpts = (cbSettings.constructions||[]).map(/** @param {any} co */ co =>
    `<option value="${co.name}" ${co.name===line.construction?'selected':''}>${co.name}</option>`
  ).join('');
  const baseOpts = (cbSettings.baseTypes||[]).map(/** @param {any} b */ b =>
    `<option value="${b.name}" ${b.name===line.baseType?'selected':''}>${b.name}</option>`
  ).join('');

  const html = `
    <div class="popup-header">
      <div class="popup-title">
        <div style="font-size:16px;font-weight:700">Edit Cabinet</div>
      </div>
      <div style="font-size:18px;font-weight:800;color:var(--accent)">${fmt0(cabTotal)}</div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">NAME</label><input class="pf-input pf-input-lg" id="pcab-name" value="${_escHtml(line.name||'')}"></div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">WIDTH (mm)</label><input class="pf-input" type="number" id="pcab-w" value="${line.w}"></div>
        <div class="pf" style="flex:1"><label class="pf-label">HEIGHT (mm)</label><input class="pf-input" type="number" id="pcab-h" value="${line.h}"></div>
        <div class="pf" style="flex:1"><label class="pf-label">DEPTH (mm)</label><input class="pf-input" type="number" id="pcab-d" value="${line.d}"></div>
      </div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">QTY</label><input class="pf-input" type="number" id="pcab-qty" value="${line.qty}" min="1"></div>
        <div class="pf" style="flex:1"><label class="pf-label">ROOM</label><input class="pf-input" id="pcab-room" value="${_escHtml(line.room||'')}"></div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">MATERIAL</label><select class="pf-select" id="pcab-material">${matOpts}</select></div>
        <div class="pf" style="flex:1"><label class="pf-label">FINISH</label><select class="pf-select" id="pcab-finish">${finishOpts}</select></div>
      </div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">CONSTRUCTION</label><select class="pf-select" id="pcab-const">${constOpts}</select></div>
        <div class="pf" style="flex:1"><label class="pf-label">BASE TYPE</label><select class="pf-select" id="pcab-base">${baseOpts}</select></div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">DOORS</label><input class="pf-input" type="number" id="pcab-doors" value="${line.doors}" min="0"></div>
        <div class="pf" style="flex:1"><label class="pf-label">DRAWERS</label><input class="pf-input" type="number" id="pcab-drawers" value="${line.drawers}" min="0"></div>
        <div class="pf" style="flex:1"><label class="pf-label">SHELVES</label><input class="pf-input" type="number" id="pcab-shelves" value="${line.shelves||0}" min="0"></div>
      </div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">ADJ SHELVES</label><input class="pf-input" type="number" id="pcab-adjshelves" value="${line.adjShelves||0}" min="0"></div>
        <div class="pf" style="flex:1"><label class="pf-label">PARTITIONS</label><input class="pf-input" type="number" id="pcab-partitions" value="${line.partitions||0}" min="0"></div>
        <div class="pf" style="flex:1"><label class="pf-label">END PANELS</label><input class="pf-input" type="number" id="pcab-endpanels" value="${line.endPanels||0}" min="0"></div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf"><label class="pf-label">NOTES</label><textarea class="pf-textarea" id="pcab-notes" rows="2" placeholder="Cabinet notes...">${_escHtml(line.notes||'')}</textarea></div>
      <div class="pf-divider"></div>
      <div class="pf-totals">
        <div class="pf-total-row"><span>Materials</span><span>${fmt0(c.matCost)}</span></div>
        <div class="pf-total-row"><span>Labour (${c.labourHrs.toFixed(1)} hrs)</span><span>${fmt0(c.labourCost)}</span></div>
        <div class="pf-total-row"><span>Hardware</span><span>${fmt0(c.hwCost)}</span></div>
        <div class="pf-total-row"><span style="color:var(--muted)">Subtotal</span><span>${fmt0(c.lineSubtotal)}</span></div>
        ${cbSettings.markup>0?`<div class="pf-total-row"><span style="color:var(--muted)">Markup (${cbSettings.markup}%)</span><span>+${fmt0(cabMarkup)}</span></div>`:''}
        <div class="pf-total-row" style="font-weight:700;font-size:14px;color:var(--accent);border-top:1px solid var(--border);padding-top:6px;margin-top:4px"><span>Total</span><span>${fmt0(cabTotal)}</span></div>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" style="color:var(--danger);margin-right:auto" onclick="_confirm('Delete this cabinet?',()=>{cbLines.splice(${idx},1);saveCBLines();_closePopup();renderCBPanel()})">Delete</button>
      <button class="btn btn-outline" onclick="_duplicateCabinet(${idx})">Duplicate</button>
      <button class="btn btn-outline" onclick="_closePopup();cbEditCabinetFromOutput(${idx})">Full Editor</button>
      <button class="btn btn-accent" onclick="_saveCabinetPopup(${idx})">Save</button>
    </div>`;
  _openPopup(html, 'md');
}

/** @param {number} idx */
function _duplicateCabinet(idx) {
  const line = cbLines[idx];
  if (!line) return;
  const copy = JSON.parse(JSON.stringify(line));
  copy.id = cbNextId++;
  copy.name = (copy.name || 'Cabinet') + ' (copy)';
  cbLines.splice(idx + 1, 0, copy);
  saveCBLines();
  _closePopup();
  renderCBPanel();
  _toast('Cabinet duplicated', 'success');
}

/** @param {number} idx */
function _saveCabinetPopup(idx) {
  const line = cbLines[idx];
  if (!line) return;
  line.name = _popupVal('pcab-name') || '';
  line.w = parseFloat(_popupVal('pcab-w')) || line.w;
  line.h = parseFloat(_popupVal('pcab-h')) || line.h;
  line.d = parseFloat(_popupVal('pcab-d')) || line.d;
  line.qty = Math.max(1, parseInt(_popupVal('pcab-qty')) || 1);
  line.room = _popupVal('pcab-room') || '';
  line.material = _popupVal('pcab-material') || line.material;
  line.finish = _popupVal('pcab-finish') || line.finish;
  line.construction = _popupVal('pcab-const') || line.construction;
  line.baseType = _popupVal('pcab-base') || line.baseType;
  line.doors = Math.max(0, parseInt(_popupVal('pcab-doors')) || 0);
  line.drawers = Math.max(0, parseInt(_popupVal('pcab-drawers')) || 0);
  line.shelves = Math.max(0, parseInt(_popupVal('pcab-shelves')) || 0);
  line.adjShelves = Math.max(0, parseInt(_popupVal('pcab-adjshelves')) || 0);
  line.partitions = Math.max(0, parseInt(_popupVal('pcab-partitions')) || 0);
  line.endPanels = Math.max(0, parseInt(_popupVal('pcab-endpanels')) || 0);
  line.notes = _popupVal('pcab-notes') || '';
  saveCBLines();
  _closePopup();
  renderCBPanel();
  _toast('Cabinet updated', 'success');
}

/** @type {string | null} */
let _userId = null;
let _authMode = 'signin';

function _showApp() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.add('hidden');
}
function _showAuth() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.remove('hidden');
}

function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSign = _authMode === 'signin';
  /** @type {HTMLElement} */ (document.getElementById('auth-heading')).textContent = isSign ? 'Sign in to your account' : 'Create your account';
  /** @type {HTMLElement} */ (document.getElementById('auth-btn')).textContent = isSign ? 'Sign In' : 'Create Account';
  /** @type {HTMLElement} */ (document.getElementById('auth-toggle')).innerHTML = isSign
    ? 'No account? <span onclick="toggleAuthMode()">Create one</span>'
    : 'Already have an account? <span onclick="toggleAuthMode()">Sign In</span>';
  /** @type {HTMLElement} */ (document.getElementById('auth-msg')).innerHTML = '';
}

async function authSubmit() {
  const email = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-email'))?.value.trim() || '';
  const password = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-password'))?.value || '';
  const msgEl = document.getElementById('auth-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-btn'));
  if (msgEl) msgEl.innerHTML = '';
  if (!email || !password) { if (msgEl) msgEl.innerHTML = '<div class="auth-error">Email and password required.</div>'; return; }
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  let error;
  try {
    if (_authMode === 'signin') {
      ({ error } = await _sb.auth.signInWithPassword({ email, password }));
    } else {
      ({ error } = await _sb.auth.signUp({ email, password }));
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
    if (msgEl) msgEl.innerHTML = '<div class="auth-error">Unable to connect. Please run the app via the dev server (npm run dev).</div>';
    return;
  }
  if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
  if (error) { if (msgEl) msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`; return; }
  if (_authMode === 'signup' && msgEl) { msgEl.innerHTML = '<div class="auth-success">Check your email to confirm your account, then sign in.</div>'; }
}

async function signOut() {
  await _sb.auth.signOut();
  orders = []; quotes = []; stockItems = []; clients = []; projects = [];
  _userId = null;
  _subscription = null;
  toggleAccount();
  renderStockMain(); renderQuoteMain(); renderOrdersMain();
  if (typeof renderSubscriptionSection === 'function') renderSubscriptionSection();
}

async function loadAllData() {
  // F.1: kick off subscription load in parallel — updates global `_subscription`
  // via side effect; we don't need its return value in the destructure below.
  const subPromise = loadSubscription().catch(() => null);
  const [{ data: ord }, { data: quo }, { data: stk }, { data: cli }, { data: prj }, { data: cat }, { data: biz }] = await Promise.all([
    _db('orders').select('*').order('created_at', { ascending: false }),
    _db('quotes').select('*').order('created_at', { ascending: false }),
    _db('stock_items').select('*').order('created_at', { ascending: true }),
    _db('clients').select('*').order('name', { ascending: true }).then(r => r).catch(() => ({data:[]})),
    _db('projects').select('*').order('created_at', { ascending: false }).then(r => r).catch(() => ({data:[]})),
    // Phase 3: catalog_items overlays cbSettings arrays
    _db('catalog_items').select('*').eq('user_id', _userId).then(r => r).catch(() => ({data:[]})),
    // Phase 3: business_info overlays pc_biz / pc_biz_logo / pc_cb_settings rates
    _db('business_info').select('*').eq('user_id', _userId).then(r => r).catch(() => ({data:[]})),
  ]);
  await subPromise;
  orders = ord || [];
  _onRestore(orders);  // merge locally-stored notes (notes col may not be in DB schema yet)
  _restoreProdStarts(orders);  // merge locally-stored production start dates
  quotes = quo || [];
  // H0.2: hydrate shadow fields (thickness/width/length) from DB columns
  // (thickness_mm/width_mm/length_m). Cut-list and edge-band UI consumers
  // read the short names; load-time map closes the desync after reload.
  stockItems = (stk || []).map(s => {
    const out = /** @type {any} */ ({ ...s });
    if (s.thickness_mm != null) out.thickness = s.thickness_mm;
    if (s.width_mm != null)     out.width = s.width_mm;
    if (s.length_m != null)     out.length = s.length_m;
    return out;
  });
  clients = cli || [];
  projects = prj || [];
  if (orders.length) orderNextId = Math.max(...orders.map(o => o.id)) + 1;
  if (quotes.length) quoteNextId = Math.max(...quotes.map(q => q.id)) + 1;
  if (stockItems.length) stockNextId = Math.max(...stockItems.map(s => s.id)) + 1;
  // Phase 7 step 1: hydrate quote totals from quote_lines (fire and forget; renders re-run when ready)
  // U.9: re-render Projects too so cabinet counts (derived from quote_lines) appear once hydrated.
  _hydrateQuoteTotals().then(() => {
    try { renderQuoteMain(); } catch(e){}
    try { renderProjectsMain(); } catch(e){}
  }).catch(e => console.warn('[quote totals] hydrate failed:', e.message || e));
  // Pre-cache order_lines too so order popups open without a network wait.
  // Re-render the dashboard once order_lines land — the Schedule mini-calendar
  // sizes bars by `orderHoursRequired`, which reads `o._lines`. Without this,
  // the first render places every multi-day auto-scheduled order as a single-
  // day block on today.
  _hydrateOrderLines().then(() => {
    try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e){}
  }).catch(e => console.warn('[order lines] hydrate failed:', e.message || e));
  // F5 (2026-05-13): _loadCutListProjectIds was the per-project cut-list count
  // cache. Removed alongside the Projects panel — cutlists are accessed via
  // the Cut List Library tab now, no per-project rollup needed.
  // catalog_items deprecated — stock_items is now the single source of truth
  // for material/hardware/finish prices. _applyCatalogFromDB call removed.
  // Phase 3.3 — overlay business_info from DB (only if a row exists)
  _applyBizInfoFromDB(/** @type {any[]} */ (biz || []));
  // S.2 — load schedule day overrides for the production scheduler (fire and forget)
  loadDayOverrides().catch(/** @param {any} e */ e => console.warn('[day_overrides] load:', e.message || e));
  /** @type {HTMLElement} */ (document.getElementById('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  renderStockMain();
  renderQuoteMain();
  renderOrdersMain();
  // Dashboard renders once at script-load before data arrives, so refresh it now
  // that orders/quotes/stockItems are populated. Safe to call even when another
  // panel is active — innerHTML update is invisible until the user navigates back.
  try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e) {}
  // Strategy 2: re-render project contexts now that projects[] is populated.
  // Initial top-level calls fire before loadAllData resolves, so this catches up.
  if (typeof _clRenderContext === 'function') _clRenderContext();
  if (typeof _cbRenderContext === 'function') _cbRenderContext();
  // Item 2 phase 1.3: pull Cabinet Builder lines from the project's draft quote.
  // No-op without auth, without a saved project name, or when the DB draft is empty.
  _loadCBLinesFromDB().catch(e => console.warn('[cb db-load]', e.message || e));
}

// Phase 3.2: overlay catalog_items rows onto in-memory cbSettings.
// If DB has no rows, the existing localStorage-loaded arrays remain untouched.
// Phase 4.1: race guard — bail when a catalog sync is pending so a TOKEN_REFRESHED
// during the 800ms debounce window doesn't clobber unsaved rates-panel edits.
/** @param {any[]} rows */
function _applyCatalogFromDB(rows) {
  if (typeof _catalogSyncTimer !== 'undefined' && _catalogSyncTimer) return;
  if (!rows || rows.length === 0) return;
  /** @type {Record<string, {name: string, price: number}[]>} */
  const byType = { material: [], handle: [], finish: [], hardware: [] };
  for (const r of rows) {
    if (byType[r.type]) byType[r.type].push({ name: r.name, price: parseFloat(r.price) || 0 });
  }
  if (byType.material.length && typeof cbSettings !== 'undefined') cbSettings.materials = byType.material;
  if (byType.finish.length && typeof cbSettings !== 'undefined') cbSettings.finishes = byType.finish;
  if (byType.hardware.length && typeof cbSettings !== 'undefined') cbSettings.hardware = byType.hardware;
}

// Phase 3.3: overlay business_info row onto pc_biz fields and form inputs.
// If DB has no row, existing localStorage-loaded values remain.
/** @param {any[]} rows */
function _applyBizInfoFromDB(rows) {
  if (!rows || rows.length === 0) return;
  const b = rows[0];
  // Update form inputs (these mirror what saveBizInfo / loadBizInfo manage)
  /** @param {string} id @param {any} v */
  const set = (id, v) => { const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id)); if (el && v != null) el.value = v; };
  set('biz-name', b.name);
  set('biz-phone', b.phone);
  set('biz-email', b.email);
  set('biz-address', b.address);
  set('biz-abn', b.abn);
  // Logo: if DB has a public URL, use it; otherwise fall through to localStorage base64
  if (b.logo_url) {
    const img = /** @type {HTMLImageElement | null} */ (document.getElementById('biz-logo-preview'));
    const btn = document.getElementById('biz-logo-remove');
    if (img) { img.src = b.logo_url; img.style.display = ''; }
    if (btn) btn.style.display = '';
  }
  // Unit format from DB overrides localStorage
  if (b.unit_format) {
    try {
      var uf = typeof b.unit_format === 'string' ? JSON.parse(b.unit_format) : b.unit_format;
      if (uf) { Object.assign(window.unitFormat, uf); _syncUnitFormatUI(); }
    } catch(e) {}
  }
  // Persist back to localStorage so other reads pick it up (legacy compatibility)
  try {
    localStorage.setItem('pc_biz', JSON.stringify({
      name: b.name || '', phone: b.phone || '', email: b.email || '',
      address: b.address || '', abn: b.abn || ''
    }));
  } catch(e) {}
  // Phase 3: business_info is the source of truth for all cbSettings scalars
  // and labour/list defaults. Hard overlay — DB always wins. Hardcoded defaults
  // in cabinet.js still apply for new users with no business_info row.
  // Race guard (mirrors _loadCBLinesFromDB): _applyBizInfoFromDB re-runs on
  // every auth event including hourly TOKEN_REFRESHED. If a sync is pending,
  // the user has unsaved cbSettings edits — leave them alone.
  if (typeof cbSettings !== 'undefined' && (typeof _cbSettingsSyncTimer === 'undefined' || !_cbSettingsSyncTimer)) {
    if (b.default_labour_rate != null) cbSettings.labourRate = parseFloat(b.default_labour_rate);
    if (b.default_markup_pct  != null) cbSettings.markup     = parseFloat(b.default_markup_pct);
    if (b.default_tax_pct     != null) cbSettings.tax        = parseFloat(b.default_tax_pct);
    if (b.default_deposit_pct  != null) cbSettings.deposit    = parseFloat(b.default_deposit_pct);
    if (b.default_edging_per_m != null) cbSettings.edgingPerM = parseFloat(b.default_edging_per_m);
    if (b.default_labour_times && typeof b.default_labour_times === 'object' && Object.keys(b.default_labour_times).length > 0) {
      // Merge: DB values override defaults for known keys; new defaults fill in
      // for keys not yet present in the DB row (e.g. carcass power-law fields
      // added 2026-05-05). Wholesale replace would wipe forward-compat defaults.
      cbSettings.labourTimes = { ...cbSettings.labourTimes, ...b.default_labour_times };
    }
    if (Array.isArray(b.default_base_types)         && b.default_base_types.length         > 0) cbSettings.baseTypes         = b.default_base_types;
    if (Array.isArray(b.default_constructions)      && b.default_constructions.length      > 0) cbSettings.constructions     = b.default_constructions;
    if (Array.isArray(b.default_edge_banding)       && b.default_edge_banding.length       > 0) cbSettings.edgeBanding       = b.default_edge_banding;
    if (Array.isArray(b.default_carcass_types)      && b.default_carcass_types.length      > 0) cbSettings.carcassTypes      = b.default_carcass_types;
    if (Array.isArray(b.default_door_types)         && b.default_door_types.length         > 0) cbSettings.doorTypes         = b.default_door_types;
    if (Array.isArray(b.default_drawer_front_types) && b.default_drawer_front_types.length > 0) cbSettings.drawerFrontTypes  = b.default_drawer_front_types;
    if (Array.isArray(b.default_drawer_box_types)   && b.default_drawer_box_types.length   > 0) cbSettings.drawerBoxTypes    = b.default_drawer_box_types;
    // Production scheduler defaults (S.2):
    if (b.default_workday_hours     != null) cbSettings.workdayHours     = parseFloat(b.default_workday_hours);
    if (b.default_packaging_hours   != null) cbSettings.packagingHours   = parseFloat(b.default_packaging_hours);
    if (b.default_contingency_pct   != null) cbSettings.contingencyPct   = parseFloat(b.default_contingency_pct);
    if (Array.isArray(b.default_weekday_hours) && b.default_weekday_hours.length === 7) {
      cbSettings.weekdayHours = b.default_weekday_hours.map(/** @param {any} h */ h => parseFloat(h) || 0);
    }
    if (b.production_queue_start_date) cbSettings.queueStartDate = b.production_queue_start_date;
    // Phase 3 cleanup: DB is authoritative; drop the legacy LS key so it
    // can't shadow on a future session.
    localStorage.removeItem('pc_cq_settings');
  }
}

_sb.auth.onAuthStateChange(async (event, session) => {
  if (session) {
    _userId = session.user.id;
    const emailEl = document.getElementById('account-email-item');
    if (emailEl) emailEl.textContent = session.user.email ?? '';
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = 'none';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = '';
    _showApp();
    await loadAllData();
    await _loadCabinetTemplatesFromDB();
    _clLoadProjectList();
    // Restore the active section and any open editor entity from the previous
    // session. Runs after data hydrates so entity-lookup .find() guards have
    // something to match against; missed lookups silently clear their key.
    if (typeof /** @type {any} */ (window)._restoreAppState === 'function') {
      try { await /** @type {any} */ (window)._restoreAppState(); }
      catch (e) { console.warn('restoreAppState failed', e); }
    }
  } else {
    _userId = null;
    _subscription = null;
    if (typeof renderSubscriptionSection === 'function') renderSubscriptionSection();
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = '';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = 'none';
    _clProjectCache = [];
    // Clear "what was open" keys only on explicit sign-out, so the next user
    // on this browser doesn't inherit the previous user's entity IDs. The
    // INITIAL_SESSION event fires on every guest page load and must NOT
    // clear these — otherwise guest mode loses its restore state.
    // pcCurrentPage is kept regardless — it's a UI preference, not user data.
    if (event === 'SIGNED_OUT'
        && typeof /** @type {any} */ (window)._pcClearAllOpenKeys === 'function') {
      /** @type {any} */ (window)._pcClearAllOpenKeys();
    }
    // Item 2 phase 1.4: clear in-memory Cabinet Builder state and re-render
    // so the auth gate shows immediately on sign-out (otherwise the panel
    // keeps rendering the previous user's cabinets until the next tab switch).
    cbLines = [];
    if (typeof renderCBPanel === 'function') { try { renderCBPanel(); } catch(e){} }
    // Restore last-active section for guest/free-tier users too. Entity restore
    // safely no-ops because the DB-backed arrays (quotes/orders/projects) are
    // empty for guests, so the .find() guards in _restoreAppState skip them.
    if (typeof /** @type {any} */ (window)._restoreAppState === 'function') {
      try { await /** @type {any} */ (window)._restoreAppState(); }
      catch (e) { console.warn('restoreAppState failed', e); }
    }
  }
});

// ══════════════════════════════════════════
// FREE TIER
// ══════════════════════════════════════════
const FREE_LIMIT = 5;
function _getOptCount() { return parseInt(localStorage.getItem('pcOptCount') || '0', 10); }
function _incOptCount() { localStorage.setItem('pcOptCount', String(_getOptCount() + 1)); _updateOptCounter(); }
function _updateOptCounter() {
  const el = document.getElementById('opt-counter');
  if (!el) return;
  if (_userId) { el.style.display = 'none'; return; }
  const n = _getOptCount();
  const left = Math.max(0, FREE_LIMIT - n);
  el.style.display = '';
  el.textContent = left > 0 ? `${left} free optimization${left === 1 ? '' : 's'} remaining` : 'Free limit reached — sign in for unlimited';
  el.style.color = left === 0 ? 'var(--danger)' : 'var(--muted)';
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
/** @param {string} hex @param {number} a */
function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
/** @param {string} s @param {number} n */
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n-1) + '…'; }

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
// Show a toast on Stripe Checkout return (?upgrade=success / cancelled),
// then strip the query param so a refresh doesn't re-toast.
if (typeof handleCheckoutReturn === 'function') handleCheckoutReturn();
if (typeof handlePortalReturn === 'function') handlePortalReturn();
loadBizInfo();
loadLogoPreview();
// Restore kerf
(function(){ const k = localStorage.getItem('pc_kerf'); if (k) { const el = /** @type {HTMLInputElement | null} */ (document.getElementById('kerf')); if (el) el.value = k; } })();
renderStockMain();
renderQuoteMain();
renderOrdersMain();
_updateOptCounter();

// Cut list — restore saved state, or load demo data on first visit
_loadCutList();
if (pieces.length === 0 && sheets.length === 0) {
  const _m = window.units === 'metric';
  addSheet(_m ? '18mm Plywood' : '3/4" Plywood', _m ? 2440 : 96, _m ? 1220 : 48, 5);
  for (const d of (_m ? [
    { label: 'Side Panel',   w: 590, h: 762, qty: 2 },
    { label: 'Top / Bottom', w: 572, h: 590, qty: 2 },
    { label: 'Shelf',        w: 572, h: 559, qty: 3 },
    { label: 'Back Panel',   w: 590, h: 762, qty: 1 },
    { label: 'Door',         w: 292, h: 749, qty: 2 },
  ] : [
    { label: 'Side Panel',   w: 23.25, h: 30,    qty: 2 },
    { label: 'Top / Bottom', w: 22.5,  h: 23.25, qty: 2 },
    { label: 'Shelf',        w: 22.5,  h: 22,    qty: 3 },
    { label: 'Back Panel',   w: 23.25, h: 30,    qty: 1 },
    { label: 'Door',         w: 11.5,  h: 29.5,  qty: 2 },
  ])) { addPiece(d.label, d.w, d.h, d.qty, 'none'); }
} else {
  renderSheets();
  renderPieces();
}
initColVisibility();
// Strategy 2 + Idea 3: render the project context (empty state or header)
// for Cut List on init. Cabinet Builder is rendered through renderCBPanel.
if (typeof _clRenderContext === 'function') _clRenderContext();
if (typeof _cbRenderContext === 'function') _cbRenderContext();

// ── Strategy C: global beforeunload guard ──
// Block tab close while any sidebar / editor is dirty or has a save in flight.
// Surfaces register intent via these globals (already present pre-Strategy-C):
//   _cbDirty (cabinet.js), _clDirty (cutlist.js),
//   _qpState.dirty (quotes.js), _opState.dirty (orders.js)
// Plus the in-flight set populated by debounced autosaves in business.js etc.
window.addEventListener('beforeunload', (e) => {
  /** @type {any} */
  const w = window;
  const dirty =
    !!w._cbDirty ||
    !!w._clDirty ||
    !!(w._qpState && w._qpState.dirty) ||
    !!(w._opState && w._opState.dirty) ||
    !!(w._saveInFlight && w._saveInFlight.size > 0);
  if (dirty) {
    e.preventDefault();
    // Modern browsers ignore the message string but still show their own prompt
    // when preventDefault() is called and returnValue is set.
    e.returnValue = '';
    return '';
  }
});

