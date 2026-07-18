// ProCabinet — Quote + order line-item editors (carved out of src/app.js,
// which had regrown these post-Phase-E). The two near-twin inline editors for
// the sidebar quote/order forms: line tables (item / labour / cabinet /
// stock), per-line update/add/remove with debounced upserts, totals renderers,
// hours breakdown, stock smart-search, plus the popups they use (stock popup,
// "+ Add new stock" popup, cabinet edit popup) and the routing aliases
// _openClientPopup / _openOrderPopup / _openQuotePopup.
//
// Declares the editor state _opState / _qpState and the upsert timer maps —
// all initialized from pure literals (no parse-time cross-file reads).
// renderOrdersMain / renderQuoteMain (orders.js / quotes.js) read _opState /
// _qpState behind typeof guards, so this file loads just before them.
//
// Cross-file dependencies (runtime, resolved through the global env):
//   - _db / _userId (src/db.js / src/app.js); _dbInsertSafe (src/clients.js)
//   - _toast / _openPopup / _closePopup / _popupVal / _byId / _setSaveStatus /
//     _escAttr (src/ui.js); _escHtml (src/cabinet.js)
//   - quotes / _lineSubtotal / _refreshQuoteTotals / loadQuoteIntoSidebar
//     (src/quotes.js); _lineDisplay (src/quote-editor.js)
//   - orders / loadOrderIntoSidebar (src/orders.js)
//   - stockItems / editStockItem / _scGet (src/stock.js / src/stock-persist.js)
//   - calcCBLine / cbSettings (src/cabinet-calc.js / src/cabinet.js)
//   - _quoteLineRowToCB (src/migrate.js); _linePhotoBtn consumers
//     (src/line-photos.js); editClient (src/clients.js)
//   - _enforceFreeLimit / _realCount (src/limits.js)
//   - dimsLabelFromMM / parseDim / formatDim (src/units.js)

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
  const kind = row.line_kind || 'cabinet';
  // Markup lives in the Cabinet Builder — bake it into the cabinet line price so
  // the order never shows a separate markup row (PLAN.md 2026-07-14). Other line
  // kinds are shown at cost (no markup).
  const _o = _opState.orderId ? orders.find(x => x.id === _opState.orderId) : null;
  const _mkMult = kind === 'cabinet' ? 1 + (_o ? (parseFloat(/** @type {any} */ (_o).markup) || 0) : 0) / 100 : 1;
  const total = (sub.materials + sub.labour) * _mkMult;
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
    const unitPrice = (parseFloat(row.qty) || 1) > 0 ? total / (parseFloat(row.qty) || 1) : 0;
    const descDefault = row.name || 'Cabinet';
    return `<tr>
      <td class="col-handle" title="Drag to reorder (coming soon)">⋮</td>
      ${_lineDotCell('cabinet', row, i, true)}
      <td class="col-desc"><div class="li-desc-wrap">${_linePhotoBtn(row, 'order_line')}<textarea class="cl-input desc" rows="1" oninput="_orderLineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(descDefault)}</textarea></div></td>
      <td class="col-qty"><input class="cl-input right" type="number" min="1" step="1" value="${row.qty ?? 1}" oninput="_orderLineUpdate(${i}, 'qty', this.value)"></td>
      <td class="col-price" title="Priced from the cabinet's specs — use the cabinet icon to edit in the Builder"><div class="cl-input right is-computed" style="padding:5px 4px">${Number(unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div></td>
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

// Scheduled hours a single line contributes, with its kind. Shared by the
// hours breakdown and the Schedule-tab popup's line list so the rows always sum
// to the "Hours required" figure shown beside them. Kinds outside
// cabinet/labour/item (i.e. stock) carry no workshop time.
//
// calcCBLine bakes contingency (cbSettings.contingencyPct) AND packaging
// (cbSettings.packagingHours, per cabinet) into its labour hours, so a cabinet
// line already includes both — packaging only ever counts for cabinet lines.
/** @param {any} r @returns {{kind: string, hours: number}} */
function _lineScheduleHours(r) {
  const kind = r.line_kind || 'cabinet';
  if (kind === 'cabinet') {
    // Use cached _hrs if present; otherwise compute via calcCBLine and cache.
    let hrs = r._hrs;
    if (typeof hrs !== 'number') {
      try {
        const cb = _quoteLineRowToCB(r);
        const c = calcCBLine(cb);
        hrs = c.labourHrs || 0;
        Object.defineProperty(r, '_hrs', { value: hrs, writable: true, enumerable: false, configurable: true });
      } catch (e) { hrs = 0; }
    }
    return { kind, hours: hrs * (parseFloat(r.qty) || 1) };
  }
  if (kind === 'labour') return { kind, hours: parseFloat(r.labour_hours) || 0 };
  if (kind === 'item') return { kind, hours: (parseFloat(r.schedule_hours) || 0) * (parseFloat(r.qty) || 1) };
  return { kind, hours: 0 };
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
    const { kind, hours } = _lineScheduleHours(r);
    if (kind === 'cabinet') cabinetHrs += hours;
    else if (kind === 'labour') labourHrs += hours;
    else if (kind === 'item') itemHrs += hours;
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
  el.innerHTML = _orderHoursBreakdownHTML(b);
}

// Markup for the hours readout. Split out of _renderOrderHoursBreakdown so the
// Schedule-tab order popup renders an identical breakdown from its own lines.
/** @param {{cabinet: number, labour: number, item: number, runOver: number, total: number}} b
 *  @returns {string} */
function _orderHoursBreakdownHTML(b) {
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
  // Legacy labour lines counted toward the total but had no row of their own,
  // so the itemised rows didn't add up to it.
  if (b.labour  > 0)   rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Labour lines</span><span>${h(b.labour)}</span></div>`);
  if (b.item    > 0)   rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Item lines</span><span>${h(b.item)}</span></div>`);
  if (b.runOver  > 0)  rows.push(`<div class="pf-hours-row"><span class="pf-hours-sub">• Run-over</span><span>${h(b.runOver)}</span></div>`);
  return `<div class="pf-hours-row pf-hours-total"><span>Hours required</span><span>${h(b.total)}</span></div>${rows.join('')}`;
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
        ? computeSchedule(_schedList(orders), {
            workdayHours: cbSettings.workdayHours,
            weekdayHours: cbSettings.weekdayHours,
            packagingHours: cbSettings.packagingHours,
            contingencyPct: cbSettings.contingencyPct,
            queueStartDate: cbSettings.queueStartDate,
          }, dayOverrides || [], new Date(), (typeof _schedTaskReservations === 'function' ? _schedTaskReservations() : undefined)).get(_opState.orderId)
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
      if ((row.line_kind || 'cabinet') === 'cabinet') acc.cabSub += s.materials + s.labour;
      return acc;
    },
    { materials: 0, labour: 0, stockMat: 0, cabSub: 0 }
  );
  // Stock markup is a single rate applied to all stock-kind lines (set in the
  // editor below the stock library). NOTE: stock materials themselves belong
  // in the subtotal too — they were being dropped here, so an order with
  // stock lines understated its total vs. the card/dashboard/webhook math.
  const stockMarkup = parseFloat(_popupVal('po-stock-markup')) || 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkup / 100;
  // Markup lives in the Cabinet Builder: baked into the cabinet line prices, it
  // applies to no other line kind and is never a separate order row (PLAN.md
  // 2026-07-14). Subtotal already includes the folded cabinet markup.
  const _o = _opState.orderId ? orders.find(x => x.id === _opState.orderId) : null;
  const markupPct = _o ? (parseFloat(/** @type {any} */ (_o).markup) || 0) : 0;
  const cabMarkupAmt = subParts.cabSub * markupPct / 100;
  const subDisplay = subParts.materials + subParts.labour + subParts.stockMat + cabMarkupAmt;
  const afterMarkup = subDisplay + stockMarkupAmt;
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
  const discRow = discount > 0
    ? `<div class="pf-total-row discount"><span class="t-label">Discount (${discount}%)</span><span class="t-val">−${fmt(discountAmt)}</span></div>`
    : '';
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(subDisplay)}</span></div>
    ${stockMarkupRow}
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
      // Cabinet lines carry the folded Cabinet Builder markup (see _orderLineRowHtml).
      const _o = _opState.orderId ? orders.find(x => x.id === _opState.orderId) : null;
      const _mkMult = (row.line_kind || 'cabinet') === 'cabinet'
        ? 1 + (_o ? (parseFloat(/** @type {any} */ (_o).markup) || 0) : 0) / 100 : 1;
      const total = (sub.materials + sub.labour) * _mkMult;
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
    // Markup applies to cabinet lines only (PLAN.md 2026-07-14).
    const afterMarkup = subPostLine + (t.cabSub || 0) * mk / 100;
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
  const kind = row.line_kind || 'cabinet';
  // Markup lives in the Cabinet Builder — bake it into the cabinet line price
  // so the quote never shows a separate markup row (PLAN.md 2026-07-14). Other
  // line kinds are shown at cost (no markup).
  const _q = _qpState.quoteId ? quotes.find(x => x.id === _qpState.quoteId) : null;
  const _mkMult = kind === 'cabinet' ? 1 + (_q ? (parseFloat(/** @type {any} */ (_q).markup) || 0) : 0) / 100 : 1;
  const total = (sub.materials + sub.labour) * _mkMult;
  const disc = parseFloat(row.discount) || 0;
  const discCell = `<td class="col-disc${disc > 0 ? '' : ' zero'}"><input class="cl-input right" type="number" min="0" max="100" step="1" value="${disc || ''}" placeholder="—" oninput="_lineUpdate(${i}, 'discount', this.value)"></td>`;
  if (kind === 'cabinet') {
    let hrs = 0;
    try {
      const cb = _quoteLineRowToCB(row);
      const c = calcCBLine(cb);
      hrs = (c.labourHrs || 0) * (parseFloat(row.qty) || 1);
    } catch (e) { hrs = 0; }
    const unitPrice = (parseFloat(row.qty) || 1) > 0 ? total / (parseFloat(row.qty) || 1) : 0;
    const descDefault = row.name || 'Cabinet';
    return `<tr>
      <td class="col-handle">⋮</td>
      ${_lineDotCell('cabinet', row, i, false)}
      <td class="col-desc"><div class="li-desc-wrap">${_linePhotoBtn(row)}<textarea class="cl-input desc" rows="1" oninput="_lineUpdate(${i}, 'name', this.value);_autoGrowTextarea(this)">${_escHtml(descDefault)}</textarea></div></td>
      <td class="col-qty"><input class="cl-input right" type="number" min="1" step="1" value="${row.qty ?? 1}" oninput="_lineUpdate(${i}, 'qty', this.value)"></td>
      <td class="col-price" title="Priced from the cabinet's specs — use the cabinet icon to edit in the Builder"><div class="cl-input right is-computed" style="padding:5px 4px">${Number(unitPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div></td>
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
      if ((row.line_kind || 'cabinet') === 'cabinet') acc.cabSub += s.materials + s.labour;
      return acc;
    },
    { materials: 0, labour: 0, stockMat: 0, cabSub: 0 }
  );
  const stockMarkup = parseFloat(_popupVal('pq-stock-markup')) || 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkup / 100;
  const _q = _qpState.quoteId ? quotes.find(x => x.id === _qpState.quoteId) : null;
  const markupPct = _q ? (parseFloat(/** @type {any} */ (_q).markup) || 0) : 0;
  // Markup lives in the Cabinet Builder: it's baked into the cabinet line prices
  // (see _lineRowHtml) and applies to NO other line kind, so it's never shown as
  // its own quote row (PLAN.md 2026-07-14). Subtotal here already includes the
  // folded cabinet markup so it matches the sum of the line-item totals above.
  const cabMarkupAmt = subParts.cabSub * markupPct / 100;
  const subDisplay = subParts.materials + subParts.labour + subParts.stockMat + cabMarkupAmt;
  const afterMarkup = subDisplay + stockMarkupAmt;
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
  const discRow = discount > 0
    ? `<div class="pf-total-row discount"><span class="t-label">Discount (${discount}%)</span><span class="t-val">−${fmt(discountAmt)}</span></div>`
    : '';
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(subDisplay)}</span></div>
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
      // Cabinet lines carry the folded Cabinet Builder markup (see _lineRowHtml).
      const _q = _qpState.quoteId ? quotes.find(x => x.id === _qpState.quoteId) : null;
      const _mkMult = (row.line_kind || 'cabinet') === 'cabinet'
        ? 1 + (_q ? (parseFloat(/** @type {any} */ (_q).markup) || 0) : 0) / 100 : 1;
      const total = (sub.materials + sub.labour) * _mkMult;
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
      </div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">SHELVES</label><input class="pf-input" type="number" id="pcab-shelves" value="${line.shelves||0}" min="0"></div>
        <div class="pf" style="flex:1"><label class="pf-label">ADJ SHELVES</label><input class="pf-input" type="number" id="pcab-adjshelves" value="${line.adjShelves||0}" min="0"></div>
        <div class="pf" style="flex:1"><label class="pf-label">LOOSE SHELVES</label><input class="pf-input" type="number" id="pcab-looseshelves" value="${line.looseShelves||0}" min="0"></div>
      </div>
      <div class="pf-row">
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
  // Keep the editing index pointing at the same cabinet when the copy lands
  // above it (mirrors _cbConfirmDeleteLine's shift on delete) — the editor
  // footer bakes cbEditingLineIdx into its action handlers at render time.
  if (cbEditingLineIdx > idx) cbEditingLineIdx++;
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
  line.looseShelves = Math.max(0, parseInt(_popupVal('pcab-looseshelves')) || 0);
  line.partitions = Math.max(0, parseInt(_popupVal('pcab-partitions')) || 0);
  line.endPanels = Math.max(0, parseInt(_popupVal('pcab-endpanels')) || 0);
  line.notes = _popupVal('pcab-notes') || '';
  saveCBLines();
  _closePopup();
  renderCBPanel();
  _toast('Cabinet updated', 'success');
}

