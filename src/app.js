// ProCabinet — main app script (Phase 5 of pre-launch refactor)
// Extracted from index.html. Module split (Phase 6) breaks this into src/<feature>.js

// DB layer moved to src/db.js (Phase 6 partial split)
// UI primitives moved to src/ui.js (Phase 6 partial split)


function _requireAuth() {
  if (_userId) return true;
  // Demo (guest) visitor: don't throw up the full sign-in screen on every save
  // — give a non-blocking nudge and leave them where they are. They can still
  // sign in via the demo banner or account menu whenever they're ready.
  if (window._demoMode) { _demoNudge(); return false; }
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
    return `<tr ondblclick="if(!_liDblIgnore(event))_orderLineEditCabinetRow(${i})" title="Double-click to edit this cabinet in the Cabinet Builder">
      <td class="col-handle" title="Drag to reorder (coming soon)">⋮</td>
      ${_lineDotCell('cabinet', row, i, true)}
      <td class="col-desc"><div class="li-desc-wrap">${_linePhotoBtn(row, 'order_line')}<textarea class="cl-input desc" rows="1" oninput="_orderLineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(descDefault)}</textarea></div></td>
      <td class="col-qty"><input class="cl-input right" type="number" min="1" step="1" value="${row.qty ?? 1}" oninput="_orderLineUpdate(${i}, 'qty', this.value)"></td>
      <td class="col-price" title="Priced from the cabinet's specs — double-click to edit in the Builder"><div class="cl-input right is-computed" style="padding:5px 4px">${Number(unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div></td>
      <td class="col-hrs" title="Computed from cabinet labour"><div class="cl-input right is-computed" style="padding:5px 4px">${hrsTotal.toFixed(1)}</div></td>
      ${discCell}
      <td class="col-total"><div class="total-val">${fmt(total)}</div></td>
      <td class="col-x" title="Remove" onclick="event.stopPropagation();_orderLineRemove(${i})">✕</td>
    </tr>`;
  }
  // Item / stock / legacy labour: same editable shape. Stock rows link to a
  // stock_items row via row.stock_id (kept in shadow state; persisted to DB).
  // Legacy labour rows write to labour_hours; everything else writes to
  // schedule_hours (workshop time, scheduler-only, PDF-hidden).
  const isLegacyLabour = kind === 'labour';
  const isStock = kind === 'stock';
  const hoursField = isLegacyLabour ? 'labour_hours' : 'schedule_hours';
  const hoursVal = isLegacyLabour ? (row.labour_hours ?? 0) : (row.schedule_hours ?? 0);
  const placeholder = isStock ? 'Stock item description…' : 'Item description…';
  return `<tr>
    <td class="col-handle" title="Drag to reorder (coming soon)">⋮</td>
    ${_lineDotCell(kind, row, i, true)}
    <td class="col-desc"><div class="li-desc-wrap">${_linePhotoBtn(row, 'order_line')}<textarea class="cl-input desc" rows="1" placeholder="${placeholder}" oninput="_orderLineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(row.name || '')}</textarea></div></td>
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
/** @param {any[]} lines @param {{runOverHours?: number, allocatedHours?: number|null}} [overrides] */
function _orderHoursBreakdown(lines, overrides) {
  // When the order has a manual hours_allocated override, the auto components
  // are bypassed entirely — the scheduler reserves exactly the override value.
  const ovr = overrides || {};
  if (ovr.allocatedHours != null) {
    return { cabinet: 0, labour: 0, item: 0, runOver: 0, total: parseFloat(String(ovr.allocatedHours)) || 0 };
  }
  let cabinetHrs = 0, labourHrs = 0, itemHrs = 0;
  for (const r of lines || []) {
    const kind = r.line_kind || 'cabinet';
    if (kind === 'cabinet') {
      // Use cached _hrs if present; otherwise compute via calcCBLine and cache.
      // calcCBLine bakes contingency (cbSettings.contingencyPct) AND packaging
      // (cbSettings.packagingHours, per cabinet) into the labour hours, so the
      // cabinet line below already includes both — packaging only counts for
      // cabinet lines.
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
  const over = ovr.runOverHours != null ? ovr.runOverHours : 0;
  return {
    cabinet: cabinetHrs,
    labour: labourHrs,
    item: itemHrs,
    runOver: over,
    total: cabinetHrs + labourHrs + itemHrs + over,
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
  // Packaging and contingency are baked into cabinet labour (per cabinet, in
  // calcCBLine), so the Cabinet-labour row already includes both — the tag just
  // notes what's folded in. No standalone Packaging row.
  const contPct = cbSettings.contingencyPct ?? 0;
  const packRate = cbSettings.packagingHours || 0;
  const installRate = cbSettings.installationHours || 0;
  const inclParts = [];
  if (contPct > 0)   inclParts.push(`${contPct}% labour time contingency`);
  if (packRate > 0)  inclParts.push('packaging');
  if (installRate > 0) inclParts.push('installation');
  const contLabel = inclParts.length ? ` <span class="pf-hours-tag">incl. ${inclParts.join(' + ')}</span>` : '';
  /** @type {string[]} */
  const rows = [];
  if (b.cabinet > 0)   rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Cabinet labour <span class="pf-hours-tag">auto</span>${contLabel}</span><span>${h(b.cabinet)}</span></div>`);
  if (b.item    > 0)   rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Item lines</span><span>${h(b.item)}</span></div>`);
  if (b.runOver  > 0)  rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Run-over</span><span>${h(b.runOver)}</span></div>`);
  el.innerHTML = `<div class="pf-hours-row pf-hours-total"><span>Hours required</span><span>${h(b.total)}</span></div>${rows.join('')}`;
}

// When auto-schedule toggles, enable/disable the Production Start input.
// Manual start/end inputs no longer exist — production_start_date is the
// single anchor when auto is off, end is computed by the scheduler from
// hoursRequired (or hours_allocated override).
/** @param {boolean} on */
function _orderAutoScheduleToggle(on) {
  // Priority is shown in both modes — it sets queue order for auto-scheduling
  // and is still a meaningful field to record when scheduling manually.
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
  // editor below the stock library). NOTE: stock materials themselves belong
  // in the subtotal too — they were being dropped here, so an order with
  // stock lines understated its total vs. the card/dashboard/webhook math.
  const stockMarkup = parseFloat(_popupVal('po-stock-markup')) || 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkup / 100;
  const sub = subParts.materials + subParts.labour + subParts.stockMat + stockMarkupAmt;
  // The order's stored `markup` has no editor input (per mockup J) but it IS
  // applied everywhere else (order value, card, webhook, live link). Surface
  // it read-only so the editor total matches what everyone else sees.
  const _o = _opState.orderId ? orders.find(x => x.id === _opState.orderId) : null;
  const markupPct = _o ? (parseFloat(/** @type {any} */ (_o).markup) || 0) : 0;
  const markupAmt = sub * markupPct / 100;
  const afterMarkup = sub + markupAmt;
  const tax = parseFloat(_popupVal('po-tax')) || 0;
  const discount = parseFloat(_popupVal('po-discount')) || 0;
  const taxAmt = afterMarkup * tax / 100;
  const afterTax = afterMarkup + taxAmt;
  const discountAmt = afterTax * discount / 100;
  const total = afterTax - discountAmt;
  const el = document.getElementById('po-totals');
  if (!el) return;
  const stockMarkupRow = stockMarkupAmt > 0
    ? `<div class="pf-total-row"><span class="t-label">Stock markup (${stockMarkup}%)</span><span class="t-val">+${fmt(stockMarkupAmt)}</span></div>`
    : '';
  const markupRow = markupAmt > 0
    ? `<div class="pf-total-row"><span class="t-label" title="Set when this order was created (Cabinet Builder markup)">Markup (${markupPct}%)</span><span class="t-val">+${fmt(markupAmt)}</span></div>`
    : '';
  const discRow = discount > 0
    ? `<div class="pf-total-row discount"><span class="t-label">Discount (${discount}%)</span><span class="t-val">−${fmt(discountAmt)}</span></div>`
    : '';
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(subParts.materials + subParts.labour + subParts.stockMat)}</span></div>
    ${stockMarkupRow}
    ${markupRow}
    <div class="pf-total-row"><span class="t-label">Tax (${tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
    ${discRow}
    <div class="pf-total-row t-main"><span class="t-label">Order Total</span><span class="t-val">${fmt(total)}</span></div>`;
}

/** @param {number} idx @param {string} field @param {any} val */
function _orderLineUpdate(idx, field, val) {
  const row = _opState.lines[idx];
  if (!row) return;
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'dirty');
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
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saving');
  _db('order_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) {
      _toast('Could not add line — ' + (r.error?.message || ''), 'error');
      if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: () => _orderLineAdd(kind) });
      return;
    }
    const idx = _opState.lines.findIndex(x => x === row);
    if (idx < 0) return;
    _opState.lines[idx].id = r.data.id;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saved');
    if (_opState.orderId) _recomputeOrderValuePersist(_opState.orderId);
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
  // Finishing materials with a coverage rate price by surface area (qty = area).
  const fin = (typeof _finQuoteLine === 'function') ? _finQuoteLine(stockItem) : null;
  /** @type {any} */
  const row = {
    order_id: _opState.orderId,
    user_id: _userId,
    position,
    line_kind: 'stock',
    name: fin ? fin.name : (stockItem.name || ''),
    qty: 1,
    unit_price: fin ? fin.unit_price : (parseFloat(stockItem.cost) || 0),
    discount: 0,
  };
  _opState.lines.push(row);
  _renderOrderLines();
  _renderOrderLineTotals();
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saving');
  _db('order_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) {
      _toast('Could not add stock line — ' + (r.error?.message || ''), 'error');
      if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: () => _oAddStockLineFromLibrary(stockItem) });
      return;
    }
    const idx = _opState.lines.findIndex(x => x === row);
    if (idx >= 0) _opState.lines[idx].id = r.data.id;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saved');
    if (_opState.orderId) _recomputeOrderValuePersist(_opState.orderId);
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
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saving');
  const { error } = await _db('order_lines').delete().eq('id', row.id);
  if (error) {
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: () => _orderLineRemove(idx) });
    _toast('Could not remove line — ' + (error.message || ''), 'error');
    return;
  }
  _opState.lines.splice(idx, 1);
  _renderOrderLines();
  _renderOrderLineTotals();
  _renderOrderHoursBreakdown();
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saved');
  if (_opState.orderId) _recomputeOrderValuePersist(_opState.orderId);
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
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saving');
    _db('order_lines').update(update).eq('id', row.id).then(/** @param {any} r */ (r) => {
      if (r && r.error) {
        console.warn('[order line upsert]', r.error.message);
        if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: () => _scheduleOrderLineUpsert(idx) });
        return;
      }
      if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saved');
      if (row.order_id) _recomputeOrderValuePersist(row.order_id);
    });
  }, 600);
  _orderLineUpsertTimers.set(idx, t);
}

/** Recompute + persist the denormalised orders.value cache after a line
 *  mutation. saveOrderEditor does this on the full save, but the line-autosave
 *  paths (add/edit/remove) did not — so an order built purely via autosave kept
 *  its £0 cache until a full save. Mirrors saveOrderEditor's markup → tax →
 *  discount math (stock materials re-priced via stock_markup).
 *  @param {number} id */
async function _recomputeOrderValuePersist(id) {
  if (!id || typeof orderTotalsFromLines !== 'function') return;
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const t = await orderTotalsFromLines(id);
  let newValue = 0;
  if (t) {
    const mk = /** @type {any} */ (o).markup || 0;
    const tx = /** @type {any} */ (o).tax || 0;
    const dc = /** @type {any} */ (o).discount || 0;
    const sm = /** @type {any} */ (o).stock_markup || 0;
    const nonStockMat = t.materials - (t.stockMat || 0);
    const stockSub = (t.stockMat || 0) * (1 + sm / 100);
    const subPostLine = nonStockMat + t.labour + stockSub;
    const afterMarkup = subPostLine * (1 + mk / 100);
    const afterTax = afterMarkup * (1 + tx / 100);
    newValue = Math.round(afterTax * (1 - dc / 100));
  }
  /** @type {any} */ (o).value = newValue;
  await _db('orders').update({ value: newValue }).eq('id', id);
  try { renderOrdersMain(); } catch (_e) {}
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
  const cols = ['img', 'disc', 'hrs'];
  return cols
    .filter(c => localStorage.getItem('pc_quote_col_' + c) === 'off')
    .map(c => 'hide-' + c)
    .join(' ');
}

/** Small 📷 affordance for a SAVED line (needs row.id). Returns '' while the
 *  line-photos feature flag is off, so it's safe to embed unconditionally.
 *  @param {any} row @param {'quote_line'|'order_line'} [kind] */
function _linePhotoBtn(row, kind) {
  const k = /** @type {'quote_line'|'order_line'} */ (kind || 'quote_line');
  if (!window._FEAT_LINE_PHOTOS || !row || !row.id || typeof _openLinePhotosPopup !== 'function') return '';
  const n = (typeof _linePhotoUrls === 'function') ? _linePhotoUrls(k, row.id).length : 0;
  return `<button type="button" class="li-icon-btn li-photo-btn" title="Add photos" onclick="event.stopPropagation();_openLinePhotosPopup('${k}',${row.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>${n ? `<span class="li-icon-n">${n}</span>` : ''}</button>`;
}

/** Leading type cell for a line row (replaces the bare colour dot).
 *  Cabinet → cabinet icon that opens the Builder; stock → stock icon that
 *  opens the linked library item; item / labour → the original colour dot.
 *  @param {string} kind @param {any} row @param {number} i
 *  @param {boolean} isOrder true for order rows (different cabinet-edit entry) */
function _lineDotCell(kind, row, i, isOrder) {
  if (kind === 'cabinet') {
    const action = isOrder ? `_orderLineEditCabinetRow(${i})` : `_lineEditCabinetRow(${i})`;
    return `<td class="col-dot col-dot-icon"><button type="button" class="li-icon-btn li-dot-btn" title="Edit this cabinet in the Cabinet Builder" onclick="event.stopPropagation();${action}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></button></td>`;
  }
  if (kind === 'stock') {
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
    const sid = row && row.stock_id;
    if (sid) return `<td class="col-dot col-dot-icon"><button type="button" class="li-icon-btn li-dot-btn" title="Open stock item" onclick="event.stopPropagation();_openStockFromLine(${sid})">${svg}</button></td>`;
    return `<td class="col-dot col-dot-icon"><span class="li-dot-static" title="Stock item">${svg}</span></td>`;
  }
  const dotClass = kind === 'labour' ? 'is-labour' : 'is-item';
  return `<td class="col-dot ${dotClass}"><span></span></td>`;
}

/** Open a stock library item referenced by a line row: jump to the Stock
 *  section and load it into the editor. @param {number} id */
function _openStockFromLine(id) {
  if (!id) return;
  if (typeof switchSection === 'function') switchSection('stock');
  if (typeof editStockItem === 'function') editStockItem(id);
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
    return `<tr ondblclick="if(!_liDblIgnore(event))_lineEditCabinetRow(${i})" title="Double-click to edit this cabinet in the Cabinet Builder">
      <td class="col-handle">⋮</td>
      ${_lineDotCell('cabinet', row, i, false)}
      <td class="col-desc"><div class="li-desc-wrap">${_linePhotoBtn(row)}<textarea class="cl-input desc" rows="1" oninput="_lineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(descDefault)}</textarea></div></td>
      <td class="col-qty"><input class="cl-input right" type="number" min="1" step="1" value="${row.qty ?? 1}" oninput="_lineUpdate(${i}, 'qty', this.value)"></td>
      <td class="col-price" title="Priced from the cabinet's specs — double-click to edit in the Builder"><div class="cl-input right is-computed" style="padding:5px 4px">${Number(unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div></td>
      <td class="col-hrs" title="Computed from cabinet labour"><div class="cl-input right is-computed" style="padding:5px 4px">${hrs.toFixed(1)}</div></td>
      ${discCell}
      <td class="col-total"><div class="total-val">${fmt(total)}</div></td>
      <td class="col-x" title="Remove" onclick="event.stopPropagation();_lineRemove(${i})">✕</td>
    </tr>`;
  }
  const isLegacyLabour = kind === 'labour';
  const isStock = kind === 'stock';
  const hoursField = isLegacyLabour ? 'labour_hours' : 'schedule_hours';
  const hoursVal = isLegacyLabour ? (row.labour_hours ?? 0) : (row.schedule_hours ?? 0);
  const placeholder = isStock ? 'Stock item description…' : 'Item description…';
  return `<tr>
    <td class="col-handle">⋮</td>
    ${_lineDotCell(kind, row, i, false)}
    <td class="col-desc"><div class="li-desc-wrap">${_linePhotoBtn(row)}<textarea class="cl-input desc" rows="1" placeholder="${placeholder}" oninput="_lineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(row.name || '')}</textarea></div></td>
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
  // Stock markup is the only EDITABLE markup here, but the quote's stored
  // `markup` (seeded by the Cabinet Builder's Quote Markup setting) is applied
  // by the card total, live customer page, and order conversion — so it must
  // show here too or the editor disagrees with every other surface.
  const stockMarkup = parseFloat(_popupVal('pq-stock-markup')) || 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkup / 100;
  const sub = subParts.materials + subParts.labour + subParts.stockMat + stockMarkupAmt;
  const _q = _qpState.quoteId ? quotes.find(x => x.id === _qpState.quoteId) : null;
  const markupPct = _q ? (parseFloat(/** @type {any} */ (_q).markup) || 0) : 0;
  const markupAmt = sub * markupPct / 100;
  const afterMarkup = sub + markupAmt;
  const tax = parseFloat(_popupVal('pq-tax')) || 0;
  const discount = parseFloat(_popupVal('pq-discount')) || 0;
  const taxAmt = afterMarkup * tax / 100;
  const afterTax = afterMarkup + taxAmt;
  const discountAmt = afterTax * discount / 100;
  const total = afterTax - discountAmt;
  const el = document.getElementById('pq-totals');
  if (!el) return;
  const stockMarkupRow = stockMarkupAmt > 0
    ? `<div class="pf-total-row"><span class="t-label">Stock markup (${stockMarkup}%)</span><span class="t-val">+${fmt(stockMarkupAmt)}</span></div>`
    : '';
  const markupRow = markupAmt > 0
    ? `<div class="pf-total-row"><span class="t-label" title="From Cabinet Builder → Settings → Quote Markup, set when this quote was created">Markup (${markupPct}%)</span><span class="t-val">+${fmt(markupAmt)}</span></div>`
    : '';
  const discRow = discount > 0
    ? `<div class="pf-total-row discount"><span class="t-label">Discount (${discount}%)</span><span class="t-val">−${fmt(discountAmt)}</span></div>`
    : '';
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(subParts.materials + subParts.labour + subParts.stockMat)}</span></div>
    ${stockMarkupRow}
    ${markupRow}
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
  if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'dirty');
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
    schedule_hours: 0,
    discount: 0,
  };
  _qpState.lines.push(row);
  _renderQuoteLines();
  _renderQuoteLineTotals();
  if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saving');
  _db('quote_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) {
      _toast('Could not add line — ' + (r.error?.message || ''), 'error');
      if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'failed', { retry: () => _lineAdd(kind) });
      return;
    }
    const idx = _qpState.lines.findIndex(x => x === row);
    if (idx < 0) return;
    _qpState.lines[idx].id = r.data.id;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saved');
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
  // Finishing materials with a coverage rate price by surface area (qty = area).
  const fin = (typeof _finQuoteLine === 'function') ? _finQuoteLine(stockItem) : null;
  /** @type {any} */
  const row = {
    quote_id: _qpState.quoteId,
    user_id: _userId,
    position,
    line_kind: 'stock',
    name: fin ? fin.name : (stockItem.name || ''),
    qty: 1,
    unit_price: fin ? fin.unit_price : (parseFloat(stockItem.cost) || 0),
    schedule_hours: 0,
    discount: 0,
  };
  _qpState.lines.push(row);
  _renderQuoteLines();
  _renderQuoteLineTotals();
  if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saving');
  _db('quote_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) {
      _toast('Could not add stock line — ' + (r.error?.message || ''), 'error');
      if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'failed', { retry: () => _qAddStockLineFromLibrary(stockItem) });
      return;
    }
    const idx = _qpState.lines.findIndex(x => x === row);
    if (idx >= 0) _qpState.lines[idx].id = r.data.id;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saved');
  });
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('pq-stock-search'));
  if (inp) inp.value = '';
}

/** @param {number} idx */
async function _lineRemove(idx) {
  const row = _qpState.lines[idx];
  if (!row) return;
  if (row.line_kind === 'cabinet') {
    if (!confirm('Remove this cabinet line from the quote?')) return;
  }
  if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saving');
  const { error } = await _db('quote_lines').delete().eq('id', row.id);
  if (error) {
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'failed', { retry: () => _lineRemove(idx) });
    _toast('Could not remove line — ' + (error.message || ''), 'error');
    return;
  }
  _qpState.lines.splice(idx, 1);
  _renderQuoteLines();
  _renderQuoteLineTotals();
  if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saved');
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
  const lineId = row.id != null ? row.id : null;
  const after = () => { if (typeof editQuoteInCB === 'function') editQuoteInCB(qId, lineId); };
  if (typeof saveQuoteEditor === 'function') saveQuoteEditor().then(after); else after();
}

/** Order analog of _lineEditCabinet — saves the current order editor and
 *  jumps into Cabinet Builder pointed at this order.
 *  @param {number} orderId */
function _orderLineEditCabinet(orderId) {
  const after = () => { if (typeof editOrderInCB === 'function') editOrderInCB(orderId); };
  if (typeof saveOrderEditor === 'function') saveOrderEditor().then(after); else after();
}

/** Edit a SPECIFIC cabinet line of the open order: saves the editor, then
 *  opens the Cabinet Builder with that cabinet pre-selected (no re-finding
 *  the cabinet among the workspace cards).
 *  @param {number} idx index into _opState.lines */
function _orderLineEditCabinetRow(idx) {
  const row = _opState.lines[idx];
  if (!row || !_opState.orderId) return;
  const oId = /** @type {number} */ (_opState.orderId);
  const lineId = row.id != null ? row.id : null;
  const after = () => { if (typeof editOrderInCB === 'function') editOrderInCB(oId, lineId); };
  if (typeof saveOrderEditor === 'function') saveOrderEditor().then(after); else after();
}

/** True when a dblclick landed on an editable control inside a line row —
 *  used to keep "double-click row to edit cabinet" from hijacking a
 *  double-click-to-select-word inside the description/qty/discount inputs.
 *  @param {Event} ev */
function _liDblIgnore(ev) {
  const t = /** @type {HTMLElement|null} */ (ev && ev.target);
  return !!(t && t.closest && t.closest('input,textarea,button,.col-x'));
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
      // quote_lines.schedule_hours is NOT NULL default 0 — a freshly added
      // line has no local value (only id is copied back after insert), and
      // writing null 400s the whole PATCH (23502, same fix as saveQuoteEditor).
      schedule_hours: row.schedule_hours ?? 0,
      discount: row.discount ?? 0,
    };
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saving');
    _db('quote_lines').update(update).eq('id', row.id).then(/** @param {any} r */ (r) => {
      if (r && r.error) {
        console.warn('[line upsert]', r.error.message);
        if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'failed', { retry: () => _scheduleLineUpsert(idx) });
        return;
      }
      if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saved');
    });
  }, 600);
  _lineUpsertTimers.set(idx, t);
}

// _saveQuotePopup was replaced by saveQuoteEditor() in src/quotes.js.

// F6 (2026-05-13): _openProjectPopup removed alongside the projects entity.

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
      <button class="btn btn-primary" onclick="_saveNewStockPopup()">Add to Stock</button>
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
      <button class="btn btn-primary" onclick="_saveCabinetPopup(${idx})">Save</button>
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
/** User id whose data this page session has already boot-loaded. Dedupes the
 *  full loadAllData() across supabase-js's repeated session events — on every
 *  page load it emits INITIAL_SESSION and then SIGNED_IN for the same stored
 *  session, plus SIGNED_IN again on tab re-focus and TOKEN_REFRESHED hourly.
 *  Before this guard each of those re-ran the entire boot load (every query
 *  twice per page load, serialized — the dominant boot cost on slow
 *  connections) and wiped the _lines/_totals caches mid-use.
 *  @type {string | null} */
let _bootLoadedUserId = null;
// Default to sign-up: a logged-out visitor arriving from the landing site lands
// on "Create your account", with a one-click "Sign In" toggle for returning
// users. Keep in sync with the auth-screen markup defaults in index.html.
let _authMode = 'signup';

// Message pulled from an OAuth redirect that came back with an error instead of
// a session (set by _handleOAuthError at init; consumed once when the auth
// screen first shows). null when the last load wasn't a failed OAuth return.
/** @type {string | null} */
let _oauthError = null;

function _showApp() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.add('hidden');
}
function _showAuth() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.remove('hidden');
  // The auth screen is the boot destination here — no data load follows, so
  // drop the boot loader that has covered the shell since first paint.
  window._hideBootLoader();
}

function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSign = _authMode === 'signin';
  /** @type {HTMLElement} */ (document.getElementById('auth-heading')).textContent = isSign ? 'Sign in to your account' : 'Create your account';
  /** @type {HTMLElement} */ (document.getElementById('auth-btn')).textContent = isSign ? 'Sign In' : 'Create Account';
  /** @type {HTMLElement} */ (document.getElementById('auth-toggle')).innerHTML = isSign
    ? 'No account? <span onclick="toggleAuthMode()">Create one</span>'
    : 'Already have an account? <span onclick="toggleAuthMode()">Sign In</span>';
  /** @type {HTMLElement} */ (document.getElementById('auth-marketing-row')).style.display = isSign ? 'none' : 'flex';
  const reassureEl = document.getElementById('auth-reassure');
  if (reassureEl) reassureEl.style.display = isSign ? 'none' : '';
  const forgotEl = document.getElementById('auth-forgot');
  if (forgotEl) forgotEl.style.display = isSign ? '' : 'none';
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
  // Supabase user id from a successful signUp() — passed to
  // _trackSignupConversion as the Meta Pixel eventID so the browser event
  // dedupes against the server-side CAPI event fired by the auth.users
  // trigger → meta-capi-signup edge function (both use `signup-<user_id>`).
  /** @type {string | null} */
  let signupUserId = null;
  // Anti-enumeration quirk: signUp() against an EXISTING CONFIRMED email
  // "succeeds" but returns an obfuscated user with an empty identities array —
  // and sends NO email. Detected here so we don't show "check your inbox" to
  // someone whose inbox will stay empty. (Existing-but-unconfirmed emails get
  // a fresh confirmation email and a populated identities array.)
  let signupExistingAccount = false;
  try {
    if (_authMode === 'signin') {
      ({ error } = await _sb.auth.signInWithPassword({ email, password }));
    } else {
      const marketingOptIn = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-marketing'))?.checked === true;
      // First-touch attribution (utm_*/gclid/fbclid/referrer) captured by
      // src/main.js into localStorage on landing. Returns {} for organic
      // visits. We persist it into auth.users.user_metadata so every signup
      // carries permanent ad-campaign attribution, queryable later via
      // `select raw_user_meta_data->'attribution' from auth.users`.
      const attribution = (typeof window._getAttribution === 'function')
        ? window._getAttribution()
        : {};
      let signUpData;
      ({ data: signUpData, error } = await _sb.auth.signUp({
        email, password,
        options: {
          // App is served at /os in prod, but at / in local dev (window._isDev,
          // set by main.js). Point the email-confirm redirect at wherever the
          // app actually lives so dev signups don't bounce to a 404.
          emailRedirectTo: window.location.origin + (window._isDev ? '' : '/os'),
          // Persisted into auth.users.user_metadata; the list-subscribe edge
          // function reads marketing_opt_in after the user confirms their
          // email. Name fields were dropped from signup (F: friction) — the
          // account dropdown and greetings already tolerate accounts with no
          // first_name/last_name/full_name metadata.
          data: { marketing_opt_in: marketingOptIn, attribution },
        },
      }));
      signupUserId = signUpData?.user?.id ?? null;
      signupExistingAccount = Array.isArray(signUpData?.user?.identities)
        && signUpData.user.identities.length === 0;
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
    if (msgEl) msgEl.innerHTML = '<div class="auth-error">Unable to connect. Please run the app via the dev server (npm run dev).</div>';
    return;
  }
  if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
  if (error) {
    // "Email not confirmed" on sign-in strands the user behind a dead-end
    // error (their original link may have expired). Route them to the
    // confirmation panel instead — it has a working resend button.
    const errCode = /** @type {{ code?: string }} */ (error).code || '';
    if (_authMode === 'signin' && (errCode === 'email_not_confirmed' || /not confirmed/i.test(error.message || ''))) {
      if (typeof _track === 'function') _track('signin_unconfirmed_email');
      _showConfirmPanel(email, 'signup', false);
      return;
    }
    if (msgEl) msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`;
    return;
  }
  if (_authMode === 'signin') {
    if (typeof _track === 'function') _track('user_logged_in');
    return; // onAuthStateChange (SIGNED_IN) takes over from here
  }
  // Repeated signup of a confirmed account (see signupExistingAccount above):
  // no email was sent — flip to sign-in instead of pointing at an empty inbox.
  if (signupExistingAccount) {
    if (typeof _track === 'function') _track('signup_existing_account');
    toggleAuthMode(); // → sign-in mode; the email field keeps its value
    if (msgEl) msgEl.innerHTML = '<div class="auth-error">An account with this email already exists — sign in below, or use “Forgot password?”.</div>';
    return;
  }
  if (typeof _track === 'function') _track('user_signed_up');
  // Fire ad-platform conversion pixels for paid-ads attribution. No-ops when
  // pixels are disabled (no env vars set in main.js). _trackSignupConversion
  // is defined in src/analytics.js. Deliberately after the repeated-signup
  // guard — re-signups aren't conversions, and the obfuscated user id would
  // poison the Meta CAPI dedup key.
  if (typeof _trackSignupConversion === 'function') _trackSignupConversion(signupUserId);
  // The confirm link's tokens land on /os and the Supabase client exchanges
  // them automatically — clicking the link signs the user straight in, so
  // the panel says so instead of telling them to come back and sign in.
  _showConfirmPanel(email, 'signup', true);
}

// ── "Check your inbox" confirmation panel ──────────────────────────────────
// Replaces the old one-line green "check your email" text (routinely missed)
// with a full panel that swaps in for the auth form. Serves three flows:
// post-signup confirmation, password-reset sent, and unconfirmed-sign-in
// recovery — anywhere the next step is "go click a link in your inbox".

/** Email the panel is currently showing / resending to. */
let _confirmPanelEmail = '';
/** What a resend should send. */
let _confirmPanelMode = /** @type {'signup' | 'recovery'} */ ('signup');
/** @type {ReturnType<typeof setInterval> | null} */
let _resendTimer = null;

/**
 * Swap the auth form for the confirmation panel.
 * @param {string} email
 * @param {'signup' | 'recovery'} mode what the Resend button sends
 * @param {boolean} justSent true when an email was just sent (starts the
 *   resend cooldown); false when arriving without a send (unconfirmed
 *   sign-in) so the send button is immediately live.
 */
function _showConfirmPanel(email, mode, justSent) {
  _confirmPanelEmail = email;
  _confirmPanelMode = mode;
  /** @param {string} id @param {string} text */
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('auth-confirm-title', justSent ? (mode === 'recovery' ? 'Check your inbox' : 'You’re nearly there!') : 'Confirm your email');
  set('auth-confirm-lead', justSent
    ? (mode === 'recovery' ? 'We’ve sent a password reset link to' : 'We’ve sent a confirmation link to')
    : 'Your email isn’t confirmed yet. We can send a fresh link to');
  set('auth-confirm-email', email);
  set('auth-confirm-sub', mode === 'recovery'
    ? 'Click the link in the email to choose a new password.'
    : 'Click the link in the email to activate your account — it signs you in automatically.');
  const msg = document.getElementById('auth-confirm-msg');
  if (msg) msg.innerHTML = '';
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (btn) btn.textContent = justSent ? 'Resend email' : 'Send email';
  const fw = document.getElementById('auth-form-wrap');
  if (fw) fw.style.display = 'none';
  const panel = document.getElementById('auth-confirm-panel');
  if (panel) panel.style.display = '';
  if (justSent) _startResendCooldown(60); else _clearResendCooldown();
}

function _backToAuthForm() {
  _clearResendCooldown();
  const panel = document.getElementById('auth-confirm-panel');
  if (panel) panel.style.display = 'none';
  const fw = document.getElementById('auth-form-wrap');
  if (fw) fw.style.display = '';
  const msgEl = document.getElementById('auth-msg');
  if (msgEl) msgEl.innerHTML = '';
}

/**
 * Disable the resend button for `secs` seconds. Supabase's smtp_max_frequency
 * rejects same-address sends inside 60s anyway — surface that as a countdown
 * instead of a server error.
 * @param {number} secs
 */
function _startResendCooldown(secs) {
  _clearResendCooldown();
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (!btn) return;
  const base = btn.textContent || 'Resend email';
  let left = secs;
  btn.disabled = true;
  btn.textContent = `${base} (${left}s)`;
  _resendTimer = setInterval(() => {
    left -= 1;
    if (left <= 0) { _clearResendCooldown(); btn.textContent = base; return; }
    btn.textContent = `${base} (${left}s)`;
  }, 1000);
}

function _clearResendCooldown() {
  if (_resendTimer) { clearInterval(_resendTimer); _resendTimer = null; }
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (btn) btn.disabled = false;
}

/** Resend whatever the panel is waiting on (confirmation or reset link). */
async function resendConfirmEmail() {
  const msg = document.getElementById('auth-confirm-msg');
  const redirectTo = window.location.origin + (window._isDev ? '' : '/os');
  let error = null;
  try {
    if (_confirmPanelMode === 'recovery') {
      ({ error } = await _sb.auth.resetPasswordForEmail(_confirmPanelEmail, { redirectTo }));
    } else {
      ({ error } = await _sb.auth.resend({ type: 'signup', email: _confirmPanelEmail, options: { emailRedirectTo: redirectTo } }));
    }
  } catch (e) { error = /** @type {any} */ (e); }
  if (error) {
    const rate = /rate|second|frequency/i.test(error.message || '');
    if (msg) msg.innerHTML = `<div class="auth-error">${rate ? 'Too many requests — wait a minute, then try again.' : (error.message || 'Could not send the email.')}</div>`;
    return;
  }
  if (typeof _track === 'function') _track(_confirmPanelMode === 'recovery' ? 'password_reset_resent' : 'confirmation_email_resent');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-resend-btn'));
  if (btn) btn.textContent = 'Resend email';
  if (msg) msg.innerHTML = '<div class="auth-success">Sent! Give it a minute — and check spam.</div>';
  _startResendCooldown(60);
}

/**
 * "Forgot password?" (sign-in mode). Sends the reset email and shows the
 * confirmation panel. Supabase deliberately succeeds for unknown emails
 * (anti-enumeration), so the panel shows either way.
 */
async function forgotPassword() {
  const email = /** @type {HTMLInputElement | null} */ (document.getElementById('auth-email'))?.value.trim() || '';
  const msgEl = document.getElementById('auth-msg');
  if (!email) { if (msgEl) msgEl.innerHTML = '<div class="auth-error">Type your email address above first.</div>'; return; }
  if (msgEl) msgEl.innerHTML = '';
  let error = null;
  try {
    ({ error } = await _sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + (window._isDev ? '' : '/os') }));
  } catch (e) { error = /** @type {any} */ (e); }
  if (error) { if (msgEl) msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`; return; }
  if (typeof _track === 'function') _track('password_reset_requested');
  _showConfirmPanel(email, 'recovery', true);
}

/**
 * Opened by onAuthStateChange on PASSWORD_RECOVERY — the reset link has
 * already signed the user in; this collects the new password on top of the
 * loading app.
 */
function _openSetNewPasswordPopup() {
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Set a new password</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">New password</label>
        <input class="pf-input" type="password" id="np-pass" autocomplete="new-password" placeholder="At least 6 characters">
      </div>
      <div class="pf">
        <label class="pf-label">Repeat it</label>
        <input class="pf-input" type="password" id="np-pass2" autocomplete="new-password">
      </div>
      <div id="np-msg"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewPassword()">Save password</button>
    </div>`, 'sm');
}

async function _saveNewPassword() {
  const p1 = _popupVal('np-pass'), p2 = _popupVal('np-pass2');
  const msg = document.getElementById('np-msg');
  /** @param {string} t */
  const fail = (t) => { if (msg) msg.innerHTML = `<div class="auth-error">${t}</div>`; };
  if (!p1 || p1.length < 6) { fail('Password must be at least 6 characters.'); return; }
  if (p1 !== p2) { fail('Passwords don’t match.'); return; }
  const { error } = await _sb.auth.updateUser({ password: p1 });
  if (error) { fail(error.message); return; }
  if (typeof _track === 'function') _track('password_reset_completed');
  _closePopup();
  _toast('Password updated — you’re signed in.', 'success');
}

// One-click Google sign-in / sign-up. signInWithOAuth navigates the whole page
// to Google's consent screen, so on success nothing after it runs — Google
// redirects back to redirectTo, the SDK's detectSessionInUrl exchanges the code
// for a session, and onAuthStateChange (SIGNED_IN) drives the rest exactly like
// a password login. An `error` only comes back synchronously if the redirect
// itself can't be started (provider not configured, offline).
//
// Note: OAuth signups can't carry the marketing_opt_in / attribution metadata
// the email flow attaches at signUp() time — those come from Google's profile
// instead. The marketing opt-in is recovered post-auth by
// _maybePromptMarketingOptIn (src/auth.js), which asks Google users once in-app.
// Paid-ads attribution just won't be stamped on Google-originated accounts.
async function signInWithGoogle() {
  const msgEl = document.getElementById('auth-msg');
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('auth-google-btn'));
  if (msgEl) msgEl.innerHTML = '';
  if (btn) btn.disabled = true;
  if (typeof _track === 'function') _track('google_signin_clicked');
  let error;
  try {
    ({ error } = await _sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Mirror the email-confirm redirect: app is served at /os in prod, / in
        // local dev (window._isDev, set by main.js).
        redirectTo: window.location.origin + (window._isDev ? '' : '/os'),
      },
    }));
  } catch (e) {
    error = /** @type {{ message?: string }} */ (e);
  }
  // Reached only when the redirect failed to start (otherwise the page is gone).
  if (btn) btn.disabled = false;
  if (error && msgEl) {
    msgEl.innerHTML = `<div class="auth-error">${error.message || 'Could not start Google sign-in.'}</div>`;
  }
}

async function signOut() {
  // onAuthStateChange's SIGNED_OUT handler re-enters demo mode, re-seeds the
  // in-memory arrays and re-renders every panel — so no manual teardown here.
  toggleAccount();
  if (typeof _resetAnalytics === 'function') _resetAnalytics();
  _unsubscribeLiveStatus();
  await _sb.auth.signOut();
}

async function loadAllData() {
  // F.1: kick off subscription load in parallel — updates global `_subscription`
  // via side effect; we don't need its return value in the destructure below.
  const subPromise = loadSubscription().catch(() => null);
  // Hydrate QuickBooks/Xero connections + order→invoice links in parallel so the
  // order cards can show "Synced" chips. No-ops (stays empty) when not signed in.
  const acctPromise = typeof loadAccountingConnections === 'function'
    ? loadAccountingConnections().catch(() => null)
    : Promise.resolve();
  // Quote/order overhaul: hydrate line-item photos (Phase 2) + Stripe Connect
  // status (Phase 4) in the background. Both no-op until their flag/schema is on.
  if (typeof loadLinePhotos === 'function') loadLinePhotos().catch(() => null);
  if (typeof loadConnectStatus === 'function') loadConnectStatus().catch(() => null);
  if (typeof loadAllClientMessages === 'function') loadAllClientMessages().catch(() => null);
  // Each query below may already be in flight: src/main.js starts them as the
  // module bundle executes (window._earlyBoot) and _earlyBootOr (src/db.js)
  // consumes that result, falling back to the _db() query on any miss/error.
  const [{ data: ord }, { data: quo }, { data: stk }, { data: cli }, { data: cat }, { data: biz }] = await Promise.all([
    _earlyBootOr('orders', _userId, () => _db('orders').select('*').order('created_at', { ascending: false })),
    _earlyBootOr('quotes', _userId, () => _db('quotes').select('*').order('created_at', { ascending: false })),
    _earlyBootOr('stock_items', _userId, () => _db('stock_items').select('*').order('created_at', { ascending: true })),
    _earlyBootOr('clients', _userId, () => _db('clients').select('*').order('name', { ascending: true })).catch(() => ({ data: [], error: null })),
    // Phase 3: catalog_items overlays cbSettings arrays
    _earlyBootOr('catalog_items', _userId, () => _db('catalog_items').select('*').eq('user_id', _userId)).catch(() => ({ data: [], error: null })),
    // Phase 3: business_info overlays pc_biz / pc_biz_logo / pc_cb_settings rates
    _earlyBootOr('business_info', _userId, () => _db('business_info').select('*').eq('user_id', _userId)).catch(() => ({ data: [], error: null })),
  ]);
  await subPromise;
  await acctPromise;
  orders = ord || [];
  _onRestore(orders);  // merge locally-stored notes (notes col may not be in DB schema yet)
  _restoreProdStarts(orders);  // merge locally-stored production start dates
  quotes = quo || [];
  // H0.2: hydrate shadow fields (thickness/width/length) from DB columns
  // (thickness_mm/width_mm/length_m). Cut-list and edge-band UI consumers
  // read the short names; load-time map closes the desync after reload.
  stockItems = (stk || []).map(/** @param {any} s */ s => {
    const out = /** @type {any} */ ({ ...s });
    if (s.thickness_mm != null) out.thickness = s.thickness_mm;
    if (s.width_mm != null)     out.width = s.width_mm;
    if (s.length_m != null)     out.length = s.length_m;
    return out;
  });
  clients = cli || [];
  // F6 (2026-05-13): projects table dropped — variable kept declared for
  // back-compat with any legacy reads that linger as null-state markers.
  projects = [];
  // Phase 3.3 — overlay business_info from DB (only if a row exists). Runs
  // BEFORE _demoOverlayInit (it hydrates _onboardingState, the overlay's
  // persisted gate) and before the lines/totals hydrates below (which must
  // see demo ids in the arrays when the overlay is on).
  _applyBizInfoFromDB(/** @type {any[]} */ (biz || []));
  // Sample-data overlay (src/demo.js): keep the demo seed visible for
  // accounts that haven't removed it yet — merges demo rows into the four
  // boot arrays (the early-boot fetches bypass _db(), so the builder-level
  // merge can't cover this path).
  if (typeof _demoOverlayInit === 'function') _demoOverlayInit();
  // Demo overlay rows carry negative ids — floor at 0 so local id counters
  // stay positive even when the account's own libraries are empty.
  if (orders.length) orderNextId = Math.max(0, ...orders.map(o => o.id)) + 1;
  if (quotes.length) quoteNextId = Math.max(0, ...quotes.map(q => q.id)) + 1;
  if (stockItems.length) stockNextId = Math.max(0, ...stockItems.map(s => s.id)) + 1;
  // Phase 7 step 1: hydrate quote totals from quote_lines (fire and forget; renders re-run when ready).
  _hydrateQuoteTotals().then(() => {
    try { renderQuoteMain(); } catch(e){}
  }).catch(e => console.warn('[quote totals] hydrate failed:', e.message || e));
  // Pre-cache order_lines too so order popups open without a network wait.
  // Re-render the dashboard once order_lines land — the Schedule mini-calendar
  // sizes bars by `orderHoursRequired`, which reads `o._lines`. Without this,
  // the first render places every multi-day auto-scheduled order as a single-
  // day block on today.
  _hydrateOrderLines().then(() => {
    try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e){}
  }).catch(e => console.warn('[order lines] hydrate failed:', e.message || e));
  // F6 (2026-05-13): hydrate client→cutlists map for Client card flat sections.
  if (typeof _loadCutListsByClient === 'function') {
    _loadCutListsByClient().catch(/** @param {any} e */ e => console.warn('[cutlists by client] load:', e.message || e));
  }
  // catalog_items deprecated — stock_items is now the single source of truth
  // for material/hardware/finish prices. _applyCatalogFromDB call removed.
  // Phase 3.3 _applyBizInfoFromDB moved up — it must precede _demoOverlayInit.
  // S.2 — load schedule day overrides for the production scheduler (fire and forget)
  loadDayOverrides().catch(/** @param {any} e */ e => console.warn('[day_overrides] load:', e.message || e));
  /** @type {HTMLElement} */ (document.getElementById('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  renderStockMain();
  renderQuoteMain();
  renderOrdersMain();
  // Realtime: reflect customer live-link activity (viewed / accepted / paid, and
  // webhook-created orders) on the cards without a manual reload.
  _subscribeLiveStatus();
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

// ── Realtime live-link status sync ──────────────────────────────────────────
// The live-link edge functions (running with the service role) update the
// user's own quotes/orders rows when a customer views, accepts, or pays — and
// the pay webhook inserts a new order. With no subscription the cards only catch
// up on a full reload, so a quote the customer just accepted still reads
// "Draft". Subscribe to postgres_changes scoped to this user (RLS already limits
// delivery to their own rows) and re-render the affected lists in place.

/** Merge a realtime row change into a local array, preserving locally-attached
 *  fields (`_lines`, restored notes/prod-starts) by mutating in place rather
 *  than replacing the object. @param {any[]} arr @param {any} payload */
function _applyRealtimeRow(arr, payload) {
  const evt = payload.eventType || payload.event;
  if (evt === 'DELETE') {
    const oid = payload.old && payload.old.id;
    const di = arr.findIndex(x => x.id === oid);
    if (di >= 0) arr.splice(di, 1);
    return;
  }
  const row = payload.new;
  if (!row || row.id == null) return;
  const idx = arr.findIndex(x => x.id === row.id);
  if (idx >= 0) Object.assign(arr[idx], row);   // keep _lines/notes already on the object
  else arr.unshift({ ...row });
}

/** Subscribe once to quotes/orders changes for the signed-in user. Re-renders
 *  both card lists on any change (order chips derive from the linked quote, so a
 *  quote change can move an order chip and vice-versa). */
function _subscribeLiveStatus() {
  if (!_userId || window._rtChannel) return;
  const rerender = () => {
    try { renderQuoteMain(); } catch (e) {}
    try { renderOrdersMain(); } catch (e) {}
    // The Schedule calendar is also derived from orders (priority/dates feed the
    // auto-scheduler) but, unlike the card lists, it isn't refreshed in place —
    // so a priority change persisted to the DB only reached the calendar on a
    // manual reload. Re-render it when it's the visible tab so it self-heals.
    try {
      if (typeof renderSchedule === 'function' &&
          document.getElementById('panel-schedule')?.classList.contains('active')) {
        renderSchedule();
      }
    } catch (e) {}
    try { _oBadge(); } catch (e) {}
  };
  try {
    window._rtChannel = _sb.channel('rt-cards')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes', filter: `user_id=eq.${_userId}` },
          /** @param {any} p */ p => { _applyRealtimeRow(quotes, p); rerender(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${_userId}` },
          /** @param {any} p */ p => { _applyRealtimeRow(orders, p); rerender(); })
      .subscribe();
  } catch (e) { console.warn('[realtime] subscribe failed:', /** @type {any} */ (e)?.message || e); }
}

/** Tear down the realtime channel (on sign-out, before the user_id changes). */
function _unsubscribeLiveStatus() {
  if (!window._rtChannel) return;
  try { _sb.removeChannel(window._rtChannel); } catch (e) {}
  window._rtChannel = null;
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
  if (!rows || rows.length === 0) {
    // No business_info row (brand-new account): reset the walkthrough gate so
    // a previous account's state can't leak across a same-tab account switch.
    /** @type {any} */ (window)._onboardingState = {};
    return;
  }
  const b = rows[0];
  // O.2: stash the guided-walkthrough state for walkthrough.js's auto-start
  // gate. Absent/non-object => {} (treated as a never-onboarded user).
  /** @type {any} */ (window)._onboardingState =
    (b && b.onboarding_state && typeof b.onboarding_state === 'object') ? b.onboarding_state : {};
  // Update form inputs (these mirror what saveBizInfo / loadBizInfo manage)
  /** @param {string} id @param {any} v */
  const set = (id, v) => { const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id)); if (el && v != null) el.value = v; };
  set('biz-name', b.name);
  set('biz-phone', b.phone);
  set('biz-email', b.email);
  set('biz-address', b.address);
  set('biz-abn', b.abn);
  set('biz-bank-details', b.bank_details);
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
      if (uf) {
        Object.assign(window.unitFormat, uf);
        // The synced unit_format.mode is also the source of truth for the
        // imperial/metric SYSTEM. Keep window.units in agreement so a second
        // device (where localStorage pcUnits is stale or absent) doesn't render
        // the wrong system. fromDB:true skips the mm<->inch data conversion —
        // stored values are already in the maker's true unit.
        var _sys = ['decimal', 'fractional', 'feetInches'].includes(uf.mode) ? 'imperial'
                 : ['mm', 'cm', 'm'].includes(uf.mode) ? 'metric' : '';
        if (_sys && _sys !== window.units && typeof setUnits === 'function') {
          setUnits(_sys, { fromDB: true });
        }
        _syncUnitFormatUI();
      }
    } catch(e) {}
  }
  // Currency: window.currency (the in-app pick, from localStorage, shown on the
  // PDF/print) is the user's authoritative choice. business_info.default_currency
  // — which the public live link reads — was only ever written at the one-time
  // migration (frozen, often a stale '£'), so the DEVICE wins: heal the DB from
  // window.currency when they disagree, NEVER the reverse. (Overwriting
  // window.currency from the stale DB would wrongly flip a correct '$' PDF to
  // '£'.) Unlike unit_format, default_currency has no live sync to trust — this
  // makes the live link follow the in-app selection / PDF.
  if (window.currency && b.default_currency !== window.currency) {
    try { if (typeof _syncCurrencyToDB === 'function') _syncCurrencyToDB(window.currency); } catch(e) {}
  }
  // Persist back to localStorage so other reads pick it up (legacy compatibility)
  try {
    localStorage.setItem('pc_biz', JSON.stringify({
      name: b.name || '', phone: b.phone || '', email: b.email || '',
      address: b.address || '', abn: b.abn || '',
      bank_details: b.bank_details || ''
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
    if (Array.isArray(b.default_base_types)         && b.default_base_types.length         > 0) {
      // Migrate legacy base types (flat price → labour hours). Old rows hold
      // {name, price}; base now contributes labour (hours × rate), so drop the
      // price and default refHours to 0 rather than double-counting it.
      cbSettings.baseTypes = b.default_base_types.map(/** @param {any} bt */ bt => ({ name: bt.name, refHours: bt.refHours != null ? bt.refHours : 0 }));
    }
    if (Array.isArray(b.default_constructions)      && b.default_constructions.length      > 0) cbSettings.constructions     = b.default_constructions;
    if (Array.isArray(b.default_edge_banding)       && b.default_edge_banding.length       > 0) cbSettings.edgeBanding       = b.default_edge_banding;
    if (Array.isArray(b.default_carcass_types)      && b.default_carcass_types.length      > 0) cbSettings.carcassTypes      = b.default_carcass_types;
    if (Array.isArray(b.default_door_types)         && b.default_door_types.length         > 0) cbSettings.doorTypes         = b.default_door_types;
    if (Array.isArray(b.default_drawer_front_types) && b.default_drawer_front_types.length > 0) cbSettings.drawerFrontTypes  = b.default_drawer_front_types;
    if (Array.isArray(b.default_drawer_box_types)   && b.default_drawer_box_types.length   > 0) cbSettings.drawerBoxTypes    = b.default_drawer_box_types;
    // Production scheduler defaults (S.2):
    if (b.default_workday_hours     != null) cbSettings.workdayHours     = parseFloat(b.default_workday_hours);
    if (b.default_packaging_hours   != null) cbSettings.packagingHours   = parseFloat(b.default_packaging_hours);
    if (b.default_installation_hours!= null) cbSettings.installationHours= parseFloat(b.default_installation_hours);
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
  // Keep the raw-fetch DB layer's bearer token current on every auth event,
  // synchronously and before any await — _db()'s _dbHeaders() reads this
  // in-memory token (see src/db.js). Must run on TOKEN_REFRESHED too so a
  // rotated token is picked up immediately, and on storage-blocked browsers
  // where it's the only place the token is available.
  _setAccessToken(session?.access_token ?? null);
  // loadAllData()'s hydrate helpers reference globals from late-loading defer
  // scripts (e.g. _quoteLineRowToCB in migrate.js). A guest's INITIAL_SESSION
  // can fire mid defer-script execution — wait until every defer script has run
  // (DOMContentLoaded, or `load` if we're already past it).
  if (document.readyState !== 'complete') {
    await new Promise(res => {
      const done = () => res(undefined);
      document.addEventListener('DOMContentLoaded', done, { once: true });
      window.addEventListener('load', done, { once: true });
    });
  }
  // Password-recovery landing: the reset link signs the user in (session
  // present, so the app loads below as normal), but they still need to choose
  // a new password — collect it on top of the loading app.
  if (event === 'PASSWORD_RECOVERY') _openSetNewPasswordPopup();
  if (session) {
    // Repeat event for the already-loaded user (SIGNED_IN after
    // INITIAL_SESSION on the same page load, tab-focus SIGNED_IN, hourly
    // TOKEN_REFRESHED): the bearer token was updated above, realtime keeps
    // quotes/orders in sync — there is nothing else to redo. Bail before the
    // full boot load duplicates every query.
    if (session.user.id === _bootLoadedUserId) return;
    _bootLoadedUserId = session.user.id;
    // A real Supabase session — leave demo mode. Guard on _wtActive so a
    // TOKEN_REFRESHED firing while a signed-in user runs the walkthrough
    // (which flips demo mode on temporarily) doesn't clobber the tour.
    if (!window._wtActive) window._demoMode = false;
    _userId = session.user.id;
    // Server-set signup timestamp — drives the 14-day no-card Pro trial in
    // src/limits.js (_trialActive). Set before loadAllData() so the first
    // subscription render is trial-aware. Tamper-proof (auth.users.created_at).
    _userCreatedAt = session.user.created_at ?? null;
    window.Sentry.setUser({ id: session.user.id, email: session.user.email });
    const emailEl = document.getElementById('account-email-item');
    if (emailEl) emailEl.textContent = session.user.email ?? '';
    // Name collected at signup (user_metadata.full_name / first_name+last_name).
    // Older accounts created before the name field won't have it — hide the row.
    const meta = session.user.user_metadata || {};
    const displayName = (meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(' ')).trim();
    const nameEl = document.getElementById('account-name-item');
    if (nameEl) { nameEl.textContent = displayName; nameEl.style.display = displayName ? '' : 'none'; }
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = 'none';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = '';
    _showApp();
    // finally (not just after the await): the boot loader is an opaque
    // overlay, so it must come down even when the load throws.
    try { await loadAllData(); } finally { window._hideBootLoader(); }
    if (typeof _identifyUser === 'function') _identifyUser(session);
    if (typeof _syncMailingList === 'function') {
      _syncMailingList(session).catch(e => console.warn('[mailing-list] sync failed', e));
    }
    // One-time founder welcome email for new signups (all of them — it's a
    // transactional service email, no marketing-opt-in gate). Both auth
    // paths reach here: email signups on the first post-confirmation load,
    // OAuth signups immediately. Idempotency lives server-side.
    if (typeof _sendWelcomeEmailOnce === 'function') {
      _sendWelcomeEmailOnce(session).catch(e => console.warn('[welcome-email] send failed', e));
    }
    await _loadCabinetTemplatesFromDB();
    // F.1 — landing-page pricing deep-link: consume the stashed tier and head
    // straight to Stripe Checkout. The localStorage backing means this also
    // fires on the first signed-in load AFTER the signup → email-confirm round
    // trip, where the original page (and its in-memory stash) is long gone.
    const _pendingPlanNow = _readPendingPlan(true);
    if (_pendingPlanNow) {
      const _up = /** @type {any} */ (window)._handleUpgradeClick;
      if (typeof _up === 'function') _up(_pendingPlanNow);
    }
    // O.2: guided walkthrough — first-run auto-start / version-gated re-show.
    // Runs after data has hydrated so the empty-app check is accurate. Skipped
    // when a pending plan is redirecting to Checkout — the tour would flash and
    // vanish mid-render; it auto-shows on the return load instead.
    if (!_pendingPlanNow && typeof /** @type {any} */ (window)._wtMaybeAutoStart === 'function') {
      try { await /** @type {any} */ (window)._wtMaybeAutoStart(); }
      catch (e) { console.warn('[walkthrough] auto-start failed', e); }
    }
    // F6 (2026-05-13): _clLoadProjectList removed alongside the projects entity.
    // Restore the active section and any open editor entity from the previous
    // session. Runs after data hydrates so entity-lookup .find() guards have
    // something to match against; missed lookups silently clear their key.
    if (typeof /** @type {any} */ (window)._restoreAppState === 'function') {
      try { await /** @type {any} */ (window)._restoreAppState(); }
      catch (e) { console.warn('restoreAppState failed', e); }
    }
    // Marketing opt-in for OAuth (Google) signups: the email form's opt-in
    // checkbox never ran for them, so ask once in-app. Never on top of the
    // first-run walkthrough (_wtActive) or a Checkout redirect — in those cases
    // it shows on a later load, where marketing_opt_in is still unset.
    if (!_pendingPlanNow && !window._wtActive && typeof _maybePromptMarketingOptIn === 'function') {
      _maybePromptMarketingOptIn(session);
    }
  } else {
    // No Supabase session — an account is required. Show the auth screen (a
    // full-screen overlay) instead of loading any app data. No more guest demo
    // mode: the demo seed (src/demo.js) now exists only for the in-app guided
    // walkthrough, which a signed-in user borrows via _wtRunStart(tempDemo).
    _userId = null;
    _bootLoadedUserId = null;
    _userCreatedAt = null;
    _setAccessToken(null);
    _unsubscribeLiveStatus();
    window._demoMode = false;
    window.Sentry.setUser(null);
    _subscription = null;
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = '';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = 'none';
    _showAuth();
    // A failed OAuth return (provider misconfigured, redirect mismatch, user
    // cancelled) bounces back here with no session — show why instead of a
    // silent auth screen. Consumed once; cleared so a re-render stays clean.
    if (_oauthError) {
      const m = document.getElementById('auth-msg');
      if (m) m.innerHTML = `<div class="auth-error">${_oauthError}</div>`;
      _oauthError = null;
    }
    // The screen opens in sign-up mode by default (see _authMode init) — a
    // landing-site visitor lands on "Create your account", not a sign-in form.
    // Clear "what was open" keys on explicit sign-out so the next user's session
    // doesn't restore the previous one's entity IDs. INITIAL_SESSION (a plain
    // logged-out page load) must NOT clear them.
    if (event === 'SIGNED_OUT'
        && typeof /** @type {any} */ (window)._pcClearAllOpenKeys === 'function') {
      /** @type {any} */ (window)._pcClearAllOpenKeys();
    }
  }
  // F.1: pending-plan consumption moved INTO the session branch above. With no
  // session there's nothing to do — the auth screen is already up, and the
  // localStorage stash deliberately survives until the user authenticates.
});

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

/**
 * Pull an OAuth error off the return URL (and strip it so a refresh is clean).
 *
 * When Google/Supabase rejects a sign-in, it redirects back to redirectTo with
 * `error` + `error_description` and NO session — PKCE puts them in the query
 * string, the implicit flow in the hash; we read both. Returns a user-facing
 * string (or null), stashed in `_oauthError` for the auth screen to show.
 * @returns {string | null}
 */
function _handleOAuthError() {
  const q = new URLSearchParams(window.location.search);
  const h = window.location.hash.startsWith('#')
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();
  const err = q.get('error') || h.get('error');
  if (!err) return null;
  const desc = q.get('error_description') || h.get('error_description') || '';
  // Strip the OAuth error params from the query so a refresh doesn't re-show it.
  // (The token-carrying hash, if any, is left to the SDK's detectSessionInUrl.)
  ['error', 'error_description', 'error_code'].forEach(k => q.delete(k));
  const s = q.toString();
  history.replaceState(null, '', window.location.pathname + (s ? '?' + s : '') + window.location.hash);
  // access_denied = the user backed out of Google's consent screen — not alarming.
  return err === 'access_denied'
    ? 'Google sign-in was cancelled.'
    : (desc || 'Google sign-in failed. Please check the provider setup and try again.');
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
// Capture any OAuth-return error before onAuthStateChange's no-session branch
// renders the auth screen, so it can explain the failure instead of going blank.
_oauthError = _handleOAuthError();
// Show a toast on Stripe Checkout return (?upgrade=success / cancelled),
// then strip the query param so a refresh doesn't re-toast.
if (typeof handleCheckoutReturn === 'function') handleCheckoutReturn();
if (typeof handlePortalReturn === 'function') handlePortalReturn();
// Toast + refresh on return from the QuickBooks/Xero OAuth consent screen
// (?accounting=connected / error), then strip the param.
if (typeof handleAccountingReturn === 'function') handleAccountingReturn();
if (typeof handleConnectReturn === 'function') handleConnectReturn();
// Landing-page pricing deep-link: the static landing page links its pricing
// CTAs to /?plan=<tier>. Stash the tier and strip the param (mirrors
// handleCheckoutReturn); the onAuthStateChange handler above consumes it once
// the session is known. Runs before that handler clears its readyState await.
//
// F.1: the stash is localStorage-backed (48 h TTL), not just `window`, because
// a NEW user's path to checkout crosses page loads: click paid CTA → sign up →
// confirm email (fresh load, often a different tab) → first signed-in session.
// The in-memory stash alone died at that boundary and the paid click was lost.
const _PENDING_PLAN_KEY = 'pc_pending_plan';
const _PENDING_PLAN_TTL_MS = 48 * 3600000;

/** @param {'monthly'|'annual'|'founder'} plan */
function _storePendingPlan(plan) {
  window._pendingPlan = plan;
  try {
    localStorage.setItem(_PENDING_PLAN_KEY, JSON.stringify({ plan, at: Date.now() }));
  } catch (e) { void e; /* private mode — in-memory stash still covers same-load flows */ }
}

/**
 * Read the stashed plan — memory first, then localStorage — discarding stale
 * or malformed entries. Pass `consume: true` only once a session exists (the
 * user can actually reach Checkout); otherwise the stash survives the signup
 * → email-confirm round trip it exists for.
 * @param {boolean} consume
 * @returns {'monthly'|'annual'|'founder'|null}
 */
function _readPendingPlan(consume) {
  /** @type {'monthly'|'annual'|'founder'|null} */
  let plan = window._pendingPlan || null;
  if (!plan) {
    try {
      const raw = localStorage.getItem(_PENDING_PLAN_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && (obj.plan === 'monthly' || obj.plan === 'annual' || obj.plan === 'founder')
            && typeof obj.at === 'number' && Date.now() - obj.at < _PENDING_PLAN_TTL_MS) {
          plan = obj.plan;
        } else {
          localStorage.removeItem(_PENDING_PLAN_KEY); // stale or garbage — drop it
        }
      }
    } catch (e) { void e; }
  }
  if (plan && consume) {
    window._pendingPlan = null;
    try { localStorage.removeItem(_PENDING_PLAN_KEY); } catch (e) { void e; }
  }
  return plan;
}

(function () {
  const _params = new URLSearchParams(window.location.search);
  const _plan = _params.get('plan');
  if (_plan === 'monthly' || _plan === 'annual' || _plan === 'founder') {
    _storePendingPlan(_plan);
    _params.delete('plan');
    const _cleaned = _params.toString();
    window.history.replaceState({}, '',
      window.location.pathname + (_cleaned ? `?${_cleaned}` : '') + window.location.hash);
  }
})();
loadBizInfo();
loadLogoPreview();
// (kerf restore removed — kerf is per-sheet in the cut list now; the global
// '#kerf' input no longer exists.)
renderStockMain();
renderQuoteMain();
renderOrdersMain();

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
if (typeof _syncCutMethodToggle === 'function') _syncCutMethodToggle();
// Strategy 2 + Idea 3: render the project context (empty state or header)
// for Cut List on init. Cabinet Builder is rendered through renderCBPanel.
if (typeof _clRenderContext === 'function') _clRenderContext();
if (typeof _cbRenderContext === 'function') _cbRenderContext();

// ── Pipeline hover preview ──
/** @param {HTMLElement} stepEl */
function pipePreview(stepEl) {
  const container = stepEl.closest('.oc-pipeline');
  if (!container) return;
  const hoverIdx = parseInt(/** @type {HTMLElement} */(stepEl).dataset.idx || '0');
  container.querySelectorAll('.pipe-step').forEach((/** @type {any} */ step, i) => {
    const dot = /** @type {HTMLElement|null} */(step.querySelector('.pipe-dot'));
    if (!dot) return;
    const c = i < hoverIdx ? 'var(--success)' : i === hoverIdx ? step.dataset.hoverColor : 'var(--border)';
    dot.style.background = c;
    dot.style.borderColor = c;
  });
  container.querySelectorAll('.pipe-line').forEach((/** @type {any} */ line, i) => {
    line.style.background = i < hoverIdx ? 'var(--success)' : 'var(--border)';
  });
}

/** @param {HTMLElement} stepEl */
function pipeRestorePreview(stepEl) {
  const container = stepEl.closest('.oc-pipeline');
  if (!container) return;
  container.querySelectorAll('.pipe-step').forEach((/** @type {any} */ step) => {
    const dot = /** @type {HTMLElement|null} */(step.querySelector('.pipe-dot'));
    if (dot) { dot.style.background = dot.dataset.origColor || ''; dot.style.borderColor = dot.dataset.origColor || ''; }
  });
  container.querySelectorAll('.pipe-line').forEach((/** @type {any} */ line) => {
    line.style.background = line.classList.contains('pipe-line-done') ? 'var(--success)' : 'var(--border)';
  });
}

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

