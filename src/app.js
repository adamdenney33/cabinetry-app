// ProCabinet — main app script (Phase 5 of pre-launch refactor)
// Extracted from index.html. Module split (Phase 6) breaks this into src/<feature>.js

// DB layer moved to src/db.js (Phase 6 partial split)
// UI primitives moved to src/ui.js (Phase 6 partial split)


function _requireAuth() {
  if (_userId) return true;
  _showAuth();
  return false;
}

// ── Client Popup ──
/** @param {number} id */
function _openClientPopup(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const cQuotes = quotes.filter(q => !_isDraftQuote(q) && (q.client_id === c.id || (!q.client_id && quoteClient(q) === c.name)));
  const cOrders = orders.filter(o => o.client_id === c.id || (!o.client_id && orderClient(o) === c.name));
  const cProjects = projects.filter(p => p.client_id === c.id);

  const projectChips = cProjects.map(p => {
    const badge = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';
    return `<span class="pf-chip badge ${badge}" onclick="_closePopup();switchSection('projects');_highlightProject(${p.id})">${_escHtml(p.name)}</span>`;
  }).join('') || '<span style="font-size:10px;color:var(--muted)">None</span>';
  const orderChips = cOrders.map(o =>
    `<span class="pf-chip" onclick="_closePopup();switchSection('orders');window._orderSearch='${_escHtml(orderProject(o))}';renderOrdersMain()">${_escHtml(orderProject(o))} — ${fmt(o.value ?? 0)}</span>`
  ).join('') || '<span style="font-size:10px;color:var(--muted)">None</span>';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">
        <div style="width:32px;height:32px;border-radius:50%;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px">${c.name.charAt(0).toUpperCase()}</div>
        Edit Client
      </div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">Name</label>
        <input class="pf-input pf-input-lg" id="pc-name" value="${_escHtml(c.name)}">
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Email</label>
          <input class="pf-input" id="pc-email" value="${_escHtml(c.email||'')}" placeholder="client@email.com">
        </div>
        <div class="pf">
          <label class="pf-label">Phone</label>
          <input class="pf-input" id="pc-phone" value="${_escHtml(c.phone||'')}" placeholder="07700 000000">
        </div>
      </div>
      <div class="pf">
        <label class="pf-label">Address</label>
        <input class="pf-input" id="pc-address" value="${_escHtml(c.address||'')}" placeholder="123 Street, City">
      </div>
      <div class="pf">
        <label class="pf-label">Notes</label>
        <textarea class="pf-textarea" id="pc-notes" placeholder="Client notes...">${_escHtml(c.notes||'')}</textarea>
      </div>
      <div class="pf-divider"></div>
      <div class="pf" style="margin-bottom:4px">
        <label class="pf-label">Projects (${cProjects.length})</label>
        <div class="pf-chips">${projectChips}</div>
      </div>
      <div class="pf" style="margin-bottom:0">
        <label class="pf-label">Orders (${cOrders.length})</label>
        <div class="pf-chips">${orderChips}</div>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-danger" onclick="_confirm('Delete client <strong>${_escHtml(c.name)}</strong>?',()=>{_closePopup();removeClient(${c.id})})">Delete</button>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
        <button class="btn btn-primary" onclick="_saveClientPopup(${c.id})">Save Changes</button>
      </div>
    </div>
  `, 'sm');
}

/** @param {number} id */
async function _saveClientPopup(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  const updates = {
    name: _popupVal('pc-name'),
    email: _popupVal('pc-email') || null,
    phone: _popupVal('pc-phone') || null,
    address: _popupVal('pc-address') || null,
    notes: _popupVal('pc-notes') || null,
  };
  if (!updates.name) { _toast('Name is required', 'error'); return; }
  Object.assign(c, updates);
  await _db('clients').update(/** @type {any} */ (updates)).eq('id', id);
  _closePopup();
  renderClientsMain();
  _toast('Client updated', 'success');
}

// ── Order Popup ──
// Mirror of the quote popup's line-items state.
/** @type {{orderId: number|null, lines: any[]}} */
let _opState = { orderId: null, lines: [] };

/** @param {number} id */
function _openOrderPopup(id) {
  const o = /** @type {any} */ (orders.find(x => x.id === id));
  if (!o) return;
  if (Array.isArray(o._lines)) {
    _opState = { orderId: id, lines: o._lines.map(/** @param {any} r */ r => ({ ...r })) };
    _renderOrderPopup(o);
    return;
  }
  _opState = { orderId: id, lines: [] };
  _renderOrderPopup(o);
  _db('order_lines').select('*').eq('order_id', id).order('position').then(/** @param {any} res */ res => {
    if (!res || res.error || !res.data) return;
    if (_opState.orderId !== id) return;
    o._lines = res.data.map(/** @param {any} row */ row => ({ ...row }));
    _opState.lines = res.data.map(/** @param {any} row */ row => ({ ...row }));
    _renderOrderLines();
    _renderOrderLineTotals();
    _renderOrderHoursBreakdown();
  });
}

/** @param {any} o */
function _renderOrderPopup(o) {
  const pipelineSteps = ORDER_STATUSES;
  const stepLabels = ['Quote','Confirmed','Production','Delivery','Done'];
  const curIdx = pipelineSteps.indexOf(o.status || '');

  const pipe = pipelineSteps.map((s,i) => {
    const done = i < curIdx;
    const active = i === curIdx;
    return `<div class="pp-step" onclick="document.getElementById('po-status').value='${s}'">
      <div class="pp-dot ${active?'active':done?'done':''}"></div>
      <div class="pp-label ${active?'active':done?'done':''}">${stepLabels[i]}</div>
    </div>${i < pipelineSteps.length-1 ? `<div class="pp-line ${done?'done':''}"></div>` : ''}`;
  }).join('');

  const qRef = _oqGet(o.id);
  const fromQuote = qRef ? quotes.find(q => q.id === qRef) : null;
  const quoteChip = fromQuote ? `<div class="pf" style="margin-bottom:0"><label class="pf-label">From Quote</label><div class="pf-chips"><span class="pf-chip" style="border-color:rgba(37,99,235,0.3);color:#6b9bf4" onclick="_closePopup();switchSection('quote');window._quoteSearch='${_escHtml(quoteProject(fromQuote))}';renderQuoteMain()">Q-${String(fromQuote.id).padStart(4,'0')} · ${_escHtml(quoteProject(fromQuote))}</span></div></div>` : '';

  // Overdue detection
  let isOverdue = false;
  if (o.status !== 'complete' && o.due && o.due !== 'TBD') {
    const parsed = new Date(o.due); if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
  }

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">
        Edit Order
        <span class="badge ${(/** @type {Record<string,string>} */(STATUS_BADGES))[o.status||'']||'badge-gray'}" style="font-size:10px">${(/** @type {Record<string,string>} */(STATUS_LABELS))[o.status||'']||o.status}</span>
        ${isOverdue ? '<span class="badge badge-red" style="font-size:9px">Overdue</span>' : ''}
      </div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">Project</label>
        <input class="pf-input pf-input-lg" id="po-project" value="${_escHtml(orderProject(o))}">
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Client</label>
          <input class="pf-input" id="po-client" value="${_escHtml(orderClient(o))}">
        </div>
        <div class="pf">
          <label class="pf-label">Status</label>
          <select class="pf-select" id="po-status" style="height:42px">
            ${pipelineSteps.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${(/** @type {Record<string,string>} */(STATUS_LABELS))[s]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="pf" style="margin-bottom:8px">
        <label class="pf-label">Status Pipeline</label>
        <div class="pp-pipeline">${pipe}</div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-label" style="margin-bottom:6px">Line Items</div>
      <div id="po-lines" class="li-list"></div>
      <div class="li-add-row">
        <button type="button" class="btn btn-outline btn-sm" onclick="_orderLineAdd('item')">+ Add Item</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="_orderLineAdd('labour')">+ Add Labour</button>
        ${fromQuote ? `<span style="font-size:10px;color:var(--muted);align-self:center;margin-left:8px">Cabinet lines copied from Q-${String(fromQuote.id).padStart(4,'0')}</span>` : ''}
      </div>
      <div class="pf-divider"></div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Markup %</label><input class="pf-input" id="po-markup" value="${o.markup ?? 0}" oninput="_renderOrderLineTotals()"></div>
        <div class="pf"><label class="pf-label">Tax %</label><input class="pf-input" id="po-tax" value="${o.tax ?? 0}" oninput="_renderOrderLineTotals()"></div>
        <div class="pf" style="flex:0.5"></div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-label" style="margin-bottom:6px">Scheduling</div>
      <div class="pf-row">
        <div class="pf" style="flex:1.5">
          <label class="pf-label" style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" id="po-auto-schedule" ${o.auto_schedule !== false ? 'checked' : ''} oninput="_orderAutoScheduleToggle(this.checked)" style="width:14px;height:14px;margin:0">
            Auto schedule
          </label>
        </div>
        <div class="pf">
          <label class="pf-label">Priority</label>
          <input class="pf-input" type="number" id="po-priority" value="${o.priority ?? 0}" step="1" title="Higher number = scheduled first">
        </div>
      </div>
      <div class="pf-row" id="po-manual-dates" style="${o.auto_schedule === false ? '' : 'display:none'}">
        <div class="pf">
          <label class="pf-label">Manual start</label>
          <input class="pf-input" type="date" id="po-manual-start" value="${o.manual_start_date || ''}">
        </div>
        <div class="pf">
          <label class="pf-label">Manual end</label>
          <input class="pf-input" type="date" id="po-manual-end" value="${o.manual_end_date || ''}">
        </div>
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Packaging (h)</label>
          <input class="pf-input" type="number" min="0" step="0.5" id="po-packaging" value="${o.packaging_hours ?? ''}" placeholder="default ${cbSettings.packagingHours ?? 0}" oninput="_renderOrderHoursBreakdown()">
        </div>
        <div class="pf">
          <label class="pf-label">Contingency (h)</label>
          <input class="pf-input" type="number" min="0" step="0.5" id="po-contingency" value="${o.contingency_hours ?? ''}" placeholder="default ${cbSettings.contingencyHours ?? 0}" oninput="_renderOrderHoursBreakdown()">
        </div>
        <div class="pf">
          <label class="pf-label">Run-over (h)</label>
          <input class="pf-input" type="number" min="0" step="0.5" id="po-run-over" value="${o.run_over_hours ?? 0}" oninput="_renderOrderHoursBreakdown()">
        </div>
      </div>
      <div class="pf-hours-readout" id="po-hours-breakdown" style="margin-bottom:12px"></div>
      <div class="pf-divider"></div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Production Start ${o.auto_schedule !== false ? '<span style="color:var(--muted);font-size:10px">(auto)</span>' : ''}</label>
          <input class="pf-input" type="date" id="po-start" value="${_orderDateToISO(o.prodStart||'')}" ${o.auto_schedule !== false ? 'disabled title="Auto-scheduled — toggle off to set manually"' : ''}>
        </div>
        <div class="pf">
          <label class="pf-label">Due Date</label>
          <input class="pf-input" type="date" id="po-due" value="${_orderDateToISO(o.due||'')}">
        </div>
      </div>
      <div class="pf">
        <label class="pf-label">Production Notes</label>
        <textarea class="pf-textarea" id="po-notes" rows="2" placeholder="Production notes...">${_escHtml(o.notes||'')}</textarea>
      </div>
      ${quoteChip}
      <div class="pf-totals" id="po-totals" style="margin-top:8px"></div>
    </div>
    <div class="popup-footer">
      <div class="popup-footer-left">
        <button class="btn btn-danger" onclick="_confirm('Delete order for <strong>${_escHtml(orderClient(o))}</strong>?',()=>{_closePopup();removeOrder(${o.id})})">Delete</button>
      </div>
      <div class="popup-footer-right">
        <button class="btn btn-primary" onclick="_saveOrderPopup(${o.id})">Save</button>
      </div>
    </div>
  `, 'md');
  _renderOrderLines();
  _renderOrderLineTotals();
  _renderOrderHoursBreakdown();
}

function _renderOrderLines() {
  const host = document.getElementById('po-lines');
  if (!host) return;
  if (!_opState.lines.length) {
    host.innerHTML = '<div class="li-empty">No line items yet — add an item or labour line below.</div>';
    return;
  }
  _opState.lines.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  host.innerHTML = _opState.lines.map((row, i) => _orderLineRowHtml(row, i)).join('');
}

/** @param {any} row @param {number} i */
function _orderLineRowHtml(row, i) {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const sub = _lineSubtotal(row);
  const total = sub.materials + sub.labour;
  const kind = row.line_kind || 'cabinet';
  const labelMap = { cabinet: 'Cabinet', item: 'Item', labour: 'Labour' };
  const colorMap = { cabinet: 'var(--accent)', item: 'var(--text2)', labour: 'var(--accent2)' };
  const kindBadge = `<span class="li-kind" style="color:${(/** @type {any} */ (colorMap))[kind] || 'var(--muted)'}">${(/** @type {any} */ (labelMap))[kind] || kind}</span>`;
  if (kind === 'cabinet') {
    const dims = [row.w_mm, row.h_mm, row.d_mm].filter(Boolean).join('×') + (row.w_mm ? 'mm' : '');
    const desc = (row.name || 'Cabinet') + (dims && dims !== 'mm' ? ' — ' + dims : '');
    return `<div class="li-row">
      ${kindBadge}
      <div class="li-desc">${_escHtml(desc)}${(row.qty || 1) > 1 ? ' <span class="li-meta">×' + row.qty + '</span>' : ''}</div>
      <div class="li-amt">${fmt(total)}</div>
      <button class="li-action" title="Remove" onclick="_orderLineRemove(${i})">✕</button>
    </div>`;
  }
  if (kind === 'item') {
    return `<div class="li-row">
      ${kindBadge}
      <input class="li-name" value="${_escHtml(row.name || '')}" placeholder="Item name" oninput="_orderLineUpdate(${i}, 'name', this.value)">
      <input class="li-qty" type="number" min="0" step="1" value="${row.qty ?? 1}" oninput="_orderLineUpdate(${i}, 'qty', this.value)" title="Qty">
      <input class="li-price" type="number" min="0" step="0.01" value="${row.unit_price ?? 0}" oninput="_orderLineUpdate(${i}, 'unit_price', this.value)" title="Unit price">
      <input class="li-hrs" type="number" min="0" step="0.5" value="${row.schedule_hours ?? 0}" oninput="_orderLineUpdate(${i}, 'schedule_hours', this.value)" title="Schedule hours (workshop time, not on PDF)" placeholder="hrs">
      <div class="li-amt">${fmt(total)}</div>
      <button class="li-action" title="Remove" onclick="_orderLineRemove(${i})">✕</button>
    </div>`;
  }
  return `<div class="li-row">
    ${kindBadge}
    <input class="li-name" value="${_escHtml(row.name || '')}" placeholder="Labour description" oninput="_orderLineUpdate(${i}, 'name', this.value)">
    <input class="li-qty" type="number" min="0" step="0.5" value="${row.labour_hours ?? 0}" oninput="_orderLineUpdate(${i}, 'labour_hours', this.value)" title="Hours">
    <input class="li-price" type="number" min="0" step="0.01" value="${row.unit_price ?? ''}" oninput="_orderLineUpdate(${i}, 'unit_price', this.value)" title="Rate /hr" placeholder="rate">
    <div class="li-amt">${fmt(total)}</div>
    <button class="li-action" title="Remove" onclick="_orderLineRemove(${i})">✕</button>
  </div>`;
}

// S.3: Per-order hours breakdown for the popup readout. Returns components
// in hours; total is the sum used by the production scheduler.
// Mirrors the formula documented in the plan; will move to src/scheduler.js
// in S.4 alongside computeSchedule().
/** @param {any[]} lines @param {{packagingHours?: number, contingencyHours?: number, runOverHours?: number}} [overrides] */
function _orderHoursBreakdown(lines, overrides) {
  let cabinetHrs = 0, labourHrs = 0, itemHrs = 0;
  for (const r of lines || []) {
    const kind = r.line_kind || 'cabinet';
    if (kind === 'cabinet') {
      // Use cached _hrs if present; otherwise compute via calcCBLine and cache.
      // Cabinets in a popup are bounded (typically <30); recomputing is cheap
      // but we cache to avoid repeating work on every keystroke elsewhere.
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
  const o = overrides || {};
  const pack = o.packagingHours != null ? o.packagingHours : (cbSettings.packagingHours ?? 0);
  const cont = o.contingencyHours != null ? o.contingencyHours : (cbSettings.contingencyHours ?? 0);
  const over = o.runOverHours != null ? o.runOverHours : 0;
  return {
    cabinet: cabinetHrs,
    labour: labourHrs,
    item: itemHrs,
    packaging: pack,
    contingency: cont,
    runOver: over,
    total: cabinetHrs + labourHrs + itemHrs + pack + cont + over,
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
  const b = _orderHoursBreakdown(_opState.lines, {
    packagingHours:  popupVal('po-packaging'),
    contingencyHours: popupVal('po-contingency'),
    runOverHours:    popupVal('po-run-over'),
  });
  /** @param {number} v */
  const h = v => Number(v).toFixed(1) + ' h';
  el.innerHTML = `<div class="pf-hours-row pf-hours-total"><span>Hours required</span><span>${h(b.total)}</span></div>
    <div class="pf-hours-row"><span class="pf-hours-sub">• Cabinet labour <span class="pf-hours-tag">auto</span></span><span>${h(b.cabinet)}</span></div>
    <div class="pf-hours-row"><span class="pf-hours-sub">• Labour lines</span><span>${h(b.labour)}</span></div>
    <div class="pf-hours-row"><span class="pf-hours-sub">• Item lines</span><span>${h(b.item)}</span></div>
    <div class="pf-hours-row"><span class="pf-hours-sub">• Packaging</span><span>${h(b.packaging)}</span></div>
    <div class="pf-hours-row"><span class="pf-hours-sub">• Contingency</span><span>${h(b.contingency)}</span></div>
    <div class="pf-hours-row"><span class="pf-hours-sub">• Run-over</span><span>${h(b.runOver)}</span></div>`;
}

// S.3 + S.6: when the auto-schedule checkbox toggles, show/hide the manual
// date inputs and enable/disable the (now derived) Production Start input.
// On toggle-OFF, snapshot the currently-computed start/end into the manual
// date inputs so the bar doesn't jump positions when the user switches modes.
/** @param {boolean} on */
function _orderAutoScheduleToggle(on) {
  const manualRow = document.getElementById('po-manual-dates');
  if (manualRow) manualRow.style.display = on ? 'none' : '';
  const startInput = /** @type {HTMLInputElement|null} */ (document.getElementById('po-start'));
  if (startInput) {
    startInput.disabled = on;
    startInput.title = on ? 'Auto-scheduled — toggle off to set manually' : '';
  }
  if (!on && _opState.orderId != null) {
    const manualStart = /** @type {HTMLInputElement|null} */ (document.getElementById('po-manual-start'));
    const manualEnd   = /** @type {HTMLInputElement|null} */ (document.getElementById('po-manual-end'));
    if (manualStart && !manualStart.value) {
      const sched = (typeof computeSchedule === 'function')
        ? computeSchedule(orders, {
            workdayHours: cbSettings.workdayHours,
            weekdayHours: cbSettings.weekdayHours,
            packagingHours: cbSettings.packagingHours,
            contingencyHours: cbSettings.contingencyHours,
            queueStartDate: cbSettings.queueStartDate,
          }, dayOverrides || [], new Date()).get(_opState.orderId)
        : null;
      const o = orders.find(x => x.id === _opState.orderId);
      manualStart.value = (sched && sched.startISO) || (o ? _orderDateToISO(o.prodStart || '') : '') || '';
      if (manualEnd && !manualEnd.value) {
        manualEnd.value = (sched && sched.endISO) || manualStart.value || '';
      }
    }
  }
}

function _renderOrderLineTotals() {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const subParts = _opState.lines.reduce(
    (acc, row) => {
      const s = _lineSubtotal(row);
      acc.materials += s.materials;
      acc.labour += s.labour;
      return acc;
    },
    { materials: 0, labour: 0 }
  );
  const sub = subParts.materials + subParts.labour;
  const markup = parseFloat(_popupVal('po-markup')) || 0;
  const tax = parseFloat(_popupVal('po-tax')) || 0;
  const markupAmt = sub * markup / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * tax / 100;
  const total = afterMarkup + taxAmt;
  const el = document.getElementById('po-totals');
  if (!el) return;
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(sub)}</span></div>
    <div class="pf-total-row"><span class="t-label">Markup (${markup}%)</span><span class="t-val">+${fmt(markupAmt)}</span></div>
    <div class="pf-total-row"><span class="t-label">Tax (${tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
    <div class="pf-total-row t-main"><span class="t-label">Order Total</span><span class="t-val">${fmt(total)}</span></div>`;
}

/** @param {number} idx @param {string} field @param {any} val */
function _orderLineUpdate(idx, field, val) {
  const row = _opState.lines[idx];
  if (!row) return;
  const numeric = ['qty', 'unit_price', 'labour_hours', 'schedule_hours'];
  row[field] = numeric.includes(field) ? (parseFloat(val) || 0) : val;
  _renderOrderLineTotals();
  _renderOrderHoursBreakdown();
  // Touch only the affected row's amount so input focus is preserved
  const host = document.getElementById('po-lines');
  if (host) {
    const rowEls = host.querySelectorAll('.li-row');
    const rowEl = rowEls[idx];
    if (rowEl) {
      const cur = window.currency;
      const sub = _lineSubtotal(row);
      const total = sub.materials + sub.labour;
      const amt = rowEl.querySelector('.li-amt');
      if (amt) amt.textContent = cur + Number(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
  }
  _scheduleOrderLineUpsert(idx);
}

/** @param {string} kind 'item' | 'labour' */
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
    qty: kind === 'item' ? 1 : 0,
    labour_hours: kind === 'labour' ? 0 : null,
    unit_price: kind === 'labour' ? businessRate : 0,
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
    };
    _db('order_lines').update(update).eq('id', row.id).then(/** @param {any} r */ (r) => {
      if (r && r.error) console.warn('[order line upsert]', r.error.message);
    });
  }, 600);
  _orderLineUpsertTimers.set(idx, t);
}

/** @param {number} id */
async function _saveOrderPopup(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const projectName = _popupVal('po-project');
  const clientName = _popupVal('po-client');
  const status = _popupVal('po-status');
  const notes = _popupVal('po-notes');
  const dueRaw = _popupVal('po-due');
  const due = dueRaw ? new Date(dueRaw+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'TBD';
  const startRaw = _popupVal('po-start');
  const markup = parseFloat(_popupVal('po-markup')) || 0;
  const tax = parseFloat(_popupVal('po-tax')) || 0;

  // Resolve client/project FKs (find-or-create) so writes don't depend on the legacy text columns
  const client_id = clientName ? await resolveClient(clientName) : null;
  const project_id = projectName ? await resolveProject(projectName, client_id) : null;

  // Flush pending line edits in parallel so we don't pay N round-trips.
  for (const t of _orderLineUpsertTimers.values()) clearTimeout(t);
  _orderLineUpsertTimers.clear();
  /** @type {Promise<any>[]} */
  const lineWrites = [];
  for (const row of _opState.lines) {
    if (!row.id) continue;
    /** @type {any} */
    const u = {
      name: row.name || '',
      qty: row.qty || 0,
      unit_price: row.unit_price ?? null,
      labour_hours: row.labour_hours ?? null,
      schedule_hours: row.schedule_hours ?? null,
    };
    lineWrites.push(/** @type {any} */ (_db('order_lines').update(u).eq('id', row.id)));
  }
  await Promise.all(lineWrites);

  // Recompute the order total from order_lines + this popup's markup / tax.
  const totals = await orderTotalsFromLines(id);
  const subParts = totals || { materials: 0, labour: 0 };
  const sub = subParts.materials + subParts.labour;
  const value = Math.round(sub * (1 + markup / 100) * (1 + tax / 100));

  // Scheduler fields (S.3)
  /** @param {string} id */
  const popupNum = id => {
    const v = _popupVal(id);
    return v === '' || v == null ? null : parseFloat(v);
  };
  const autoSchedule = !!(/** @type {HTMLInputElement|null} */ (document.getElementById('po-auto-schedule'))?.checked);
  const priority = parseInt(_popupVal('po-priority') || '0', 10) || 0;
  const manualStart = _popupVal('po-manual-start') || null;
  const manualEnd = _popupVal('po-manual-end') || null;
  // S.6 edge case: warn when manual start > end. Save still proceeds (user
  // may be intentionally fixing one side) but the toast surfaces the issue.
  if (!autoSchedule && manualStart && manualEnd && manualStart > manualEnd) {
    _toast('Manual start date is after end date', 'error');
  }
  const packagingHours = popupNum('po-packaging');
  const contingencyHours = popupNum('po-contingency');
  const runOverHours = parseFloat(_popupVal('po-run-over') || '0') || 0;

  /** @type {any} */
  const update = {
    value, status, due, markup, tax,
    auto_schedule: autoSchedule,
    priority,
    manual_start_date: manualStart,
    manual_end_date: manualEnd,
    packaging_hours: packagingHours,
    contingency_hours: contingencyHours,
    run_over_hours: runOverHours,
  };
  if (client_id) update.client_id = client_id;
  if (project_id) update.project_id = project_id;
  Object.assign(o, update, { notes });
  if (startRaw) setOrderProdStart(o.id, startRaw);
  _onSet(o.id, notes);

  // Close the popup before the final orders.update — feels instant to the user.
  _closePopup();
  await _db('orders').update(update).eq('id', id);
  const ob = document.getElementById('orders-badge');
  if (ob) ob.textContent = String(orders.filter(o => o.status !== 'complete').length);
  renderOrdersMain();
  renderSchedule();
  renderDashboard();
  setTimeout(drawRevenueChart, 0);
  _toast('Order updated', 'success');
}

// ── Quote Popup ──
// In-memory cache of the quote_lines for the open popup. Each open populates
// it; line CRUD operations mutate it locally then debounce-write to the DB,
// keeping the UI snappy and avoiding a refetch per edit.
/** @type {{quoteId: number|null, lines: any[]}} */
let _qpState = { quoteId: null, lines: [] };

/** @param {number} id */
function _openQuotePopup(id) {
  const q = /** @type {any} */ (quotes.find(x => x.id === id));
  if (!q) return;
  // Use cached lines (populated by quoteTotalsFromLines on hydrate + on save);
  // fall back to a one-shot fetch only when the cache hasn't been built yet.
  if (Array.isArray(q._lines)) {
    _qpState = { quoteId: id, lines: q._lines.map(/** @param {any} r */ r => ({ ...r })) };
    _renderQuotePopup(q);
    return;
  }
  _qpState = { quoteId: id, lines: [] };
  _renderQuotePopup(q);
  _db('quote_lines').select('*').eq('quote_id', id).order('position').then(/** @param {any} res */ res => {
    if (!res || res.error || !res.data) return;
    if (_qpState.quoteId !== id) return;
    q._lines = res.data.map(/** @param {any} row */ row => ({ ...row }));
    _qpState.lines = res.data.map(/** @param {any} row */ row => ({ ...row }));
    _renderQuoteLines();
    _renderQuoteLineTotals();
  });
}

/** @param {any} q */
function _renderQuotePopup(q) {
  const statusBadge = q.status === 'approved' ? 'badge-green' : q.status === 'sent' ? 'badge-blue' : 'badge-gray';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">
        Edit Quote
        <span class="badge ${statusBadge}" style="font-size:10px">${q.status === 'approved' ? 'Approved' : q.status === 'sent' ? 'Sent' : 'Draft'}</span>
      </div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf-row">
        <div class="pf" style="flex:2">
          <label class="pf-label">Project</label>
          <input class="pf-input pf-input-lg" id="pq-project" value="${_escHtml(quoteProject(q))}">
        </div>
        <div class="pf" style="flex:1">
          <label class="pf-label">Status</label>
          <select class="pf-select" id="pq-status" style="height:42px">
            <option value="draft" ${q.status==='draft'?'selected':''}>Draft</option>
            <option value="sent" ${q.status==='sent'?'selected':''}>Sent</option>
            <option value="approved" ${q.status==='approved'?'selected':''}>Approved</option>
          </select>
        </div>
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Client</label>
          <input class="pf-input" id="pq-client" value="${_escHtml(quoteClient(q))}">
        </div>
        <div class="pf">
          <label class="pf-label">Quote Number</label>
          <input class="pf-input" id="pq-quote-number" value="${_escHtml(q.quote_number||'')}" placeholder="Q-${String(q.id).padStart(4,'0')}">
        </div>
        <div class="pf">
          <label class="pf-label">Date</label>
          <div class="pf-static">${q.date}</div>
        </div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-label" style="margin-bottom:6px">Line Items</div>
      <div id="pq-lines" class="li-list"></div>
      <div class="li-add-row">
        <button type="button" class="btn btn-outline btn-sm" onclick="_lineEditCabinet(${q.id})">+ Add Cabinet</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="_lineAdd('item')">+ Add Item</button>
        <button type="button" class="btn btn-outline btn-sm" onclick="_lineAdd('labour')">+ Add Labour</button>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Markup %</label><input class="pf-input" id="pq-markup" value="${q.markup ?? 0}" oninput="_renderQuoteLineTotals()"></div>
        <div class="pf"><label class="pf-label">Tax %</label><input class="pf-input" id="pq-tax" value="${q.tax ?? 0}" oninput="_renderQuoteLineTotals()"></div>
        <div class="pf" style="flex:0.5"></div>
      </div>
      <div class="pf" style="margin-top:10px">
        <label class="pf-label">Customer-facing notes (optional)</label>
        <textarea class="pf-textarea" id="pq-notes" rows="2" placeholder="Notes shown on the quote PDF...">${_escHtml(q.notes||'')}</textarea>
      </div>
      <div class="pf-totals" id="pq-totals" style="margin-top:8px"></div>
    </div>
    <div class="popup-footer">
      <div class="popup-footer-left">
        <button class="btn btn-danger" onclick="_confirm('Delete quote for <strong>${_escHtml(quoteClient(q))}</strong>?',()=>{_closePopup();removeQuote(${q.id})})">Delete</button>
        <button class="btn btn-outline" onclick="_closePopup();printQuote(${q.id},'print')">Print</button>
        <button class="btn btn-outline" onclick="_closePopup();printQuote(${q.id},'pdf')">PDF</button>
      </div>
      <div class="popup-footer-right">
        ${(() => { const hasOrder = q.client_id && q.project_id && orders.some(ox => ox.client_id === q.client_id && ox.project_id === q.project_id); return hasOrder ? `<button class="btn btn-outline" style="color:var(--success)" onclick="_closePopup();switchSection('orders');window._orderSearch='${_escHtml(quoteProject(q))}';renderOrdersMain()">✓ View Order</button>` : `<button class="btn btn-outline" onclick="_closePopup();convertQuoteToOrder(${q.id})">→ Order</button>`; })()}
        <button class="btn btn-primary" onclick="_saveQuotePopup(${q.id})">Save</button>
      </div>
    </div>
  `, 'md');
  _renderQuoteLines();
  _renderQuoteLineTotals();
}

// Render the line-item rows inside the open quote popup.
function _renderQuoteLines() {
  const host = document.getElementById('pq-lines');
  if (!host) return;
  if (!_qpState.lines.length) {
    host.innerHTML = '<div class="li-empty">No line items yet — add a cabinet, item, or labour line below.</div>';
    return;
  }
  // Sort by position so reorders persist between opens.
  _qpState.lines.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  host.innerHTML = _qpState.lines.map((row, i) => _lineRowHtml(row, i)).join('');
}

/** @param {any} row @param {number} i */
function _lineRowHtml(row, i) {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const sub = _lineSubtotal(row);
  const total = (sub.materials + sub.labour);
  const kind = row.line_kind || 'cabinet';
  const labelMap = { cabinet: 'Cabinet', item: 'Item', labour: 'Labour' };
  const colorMap = { cabinet: 'var(--accent)', item: 'var(--text2)', labour: 'var(--accent2)' };
  const kindBadge = `<span class="li-kind" style="color:${(/** @type {any} */ (colorMap))[kind] || 'var(--muted)'}">${(/** @type {any} */ (labelMap))[kind] || kind}</span>`;
  if (kind === 'cabinet') {
    const dims = [row.w_mm, row.h_mm, row.d_mm].filter(Boolean).join('×') + (row.w_mm ? 'mm' : '');
    const desc = (row.name || 'Cabinet') + (dims && dims !== 'mm' ? ' — ' + dims : '');
    return `<div class="li-row">
      ${kindBadge}
      <div class="li-desc">${_escHtml(desc)}${(row.qty || 1) > 1 ? ' <span class="li-meta">×' + row.qty + '</span>' : ''}</div>
      <div class="li-amt">${fmt(total)}</div>
      <button class="li-action" title="Edit in Cabinet Builder" onclick="_lineEditCabinetRow(${i})">✎</button>
      <button class="li-action" title="Remove" onclick="_lineRemove(${i})">✕</button>
    </div>`;
  }
  if (kind === 'item') {
    return `<div class="li-row">
      ${kindBadge}
      <input class="li-name" value="${_escHtml(row.name || '')}" placeholder="Item name" oninput="_lineUpdate(${i}, 'name', this.value)">
      <input class="li-qty" type="number" min="0" step="1" value="${row.qty ?? 1}" oninput="_lineUpdate(${i}, 'qty', this.value)" title="Qty">
      <input class="li-price" type="number" min="0" step="0.01" value="${row.unit_price ?? 0}" oninput="_lineUpdate(${i}, 'unit_price', this.value)" title="Unit price">
      <div class="li-amt">${fmt(total)}</div>
      <button class="li-action" title="Remove" onclick="_lineRemove(${i})">✕</button>
    </div>`;
  }
  // labour
  return `<div class="li-row">
    ${kindBadge}
    <input class="li-name" value="${_escHtml(row.name || '')}" placeholder="Labour description" oninput="_lineUpdate(${i}, 'name', this.value)">
    <input class="li-qty" type="number" min="0" step="0.5" value="${row.labour_hours ?? 0}" oninput="_lineUpdate(${i}, 'labour_hours', this.value)" title="Hours">
    <input class="li-price" type="number" min="0" step="0.01" value="${row.unit_price ?? ''}" oninput="_lineUpdate(${i}, 'unit_price', this.value)" title="Rate /hr" placeholder="rate">
    <div class="li-amt">${fmt(total)}</div>
    <button class="li-action" title="Remove" onclick="_lineRemove(${i})">✕</button>
  </div>`;
}

function _renderQuoteLineTotals() {
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const subParts = _qpState.lines.reduce(
    (acc, row) => {
      const s = _lineSubtotal(row);
      acc.materials += s.materials;
      acc.labour += s.labour;
      return acc;
    },
    { materials: 0, labour: 0 }
  );
  const sub = subParts.materials + subParts.labour;
  const markup = parseFloat(_popupVal('pq-markup')) || 0;
  const tax = parseFloat(_popupVal('pq-tax')) || 0;
  const markupAmt = sub * markup / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * tax / 100;
  const total = afterMarkup + taxAmt;
  const el = document.getElementById('pq-totals');
  if (!el) return;
  el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Subtotal</span><span class="t-val">${fmt(sub)}</span></div>
    <div class="pf-total-row"><span class="t-label">Markup (${markup}%)</span><span class="t-val">+${fmt(markupAmt)}</span></div>
    <div class="pf-total-row"><span class="t-label">Tax (${tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
    <div class="pf-total-row t-main"><span class="t-label">Total</span><span class="t-val">${fmt(total)}</span></div>`;
}

// Update one field of one line in the local cache, then schedule a debounced
// upsert. Numeric fields are parsed; everything else stored as-is.
/** @param {number} idx @param {string} field @param {any} val */
function _lineUpdate(idx, field, val) {
  const row = _qpState.lines[idx];
  if (!row) return;
  const numeric = ['qty', 'unit_price', 'labour_hours'];
  row[field] = numeric.includes(field) ? (parseFloat(val) || 0) : val;
  _renderQuoteLineTotals();
  // Update only the affected row's total without a full re-render so input
  // focus is preserved.
  const host = document.getElementById('pq-lines');
  if (host) {
    const rowEls = host.querySelectorAll('.li-row');
    const rowEl = rowEls[idx];
    if (rowEl) {
      const cur = window.currency;
      const sub = _lineSubtotal(row);
      const total = sub.materials + sub.labour;
      const amt = rowEl.querySelector('.li-amt');
      if (amt) amt.textContent = cur + Number(total).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
  }
  _scheduleLineUpsert(idx);
}

/** @param {string} kind 'item' | 'labour' */
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
    qty: kind === 'item' ? 1 : 0,
    labour_hours: kind === 'labour' ? 0 : null,
    unit_price: kind === 'labour' ? businessRate : 0,
  };
  // Optimistic insert: render immediately with no id, then replace with the
  // real id once the DB returns. The user can keep typing — the upsert
  // scheduler waits for an id before writing.
  _qpState.lines.push(row);
  _renderQuoteLines();
  _renderQuoteLineTotals();
  _db('quote_lines').insert([row]).select().single().then(/** @param {any} r */ r => {
    if (r.error || !r.data) { _toast('Could not add line — ' + (r.error?.message || ''), 'error'); return; }
    // Find the still-id-less row and stamp the real id onto it.
    const idx = _qpState.lines.findIndex(x => x === row);
    if (idx < 0) return;
    _qpState.lines[idx].id = r.data.id;
    // If the user typed into this row before the insert returned, flush
    // those edits now (the debounce was a no-op because there was no id).
    const cur = _qpState.lines[idx];
    if (cur.name || cur.qty || cur.labour_hours || (cur.unit_price !== row.unit_price)) {
      _scheduleLineUpsert(idx);
    }
  });
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

/** Open the cabinet builder pointed at this quote. The popup is closed and
 *  the user is taken to the builder where they can add a new cabinet via the
 *  scratchpad.
 *  @param {number} quoteId */
function _lineEditCabinet(quoteId) {
  _saveQuotePopup(quoteId).then(() => {
    if (typeof editQuoteInCB === 'function') editQuoteInCB(quoteId);
  });
}

/** Edit an existing cabinet line — same as Add Cabinet but the builder
 *  loads with the cabinet pre-selected for editing.
 *  @param {number} idx */
function _lineEditCabinetRow(idx) {
  const row = _qpState.lines[idx];
  if (!row || !_qpState.quoteId) return;
  _saveQuotePopup(_qpState.quoteId).then(() => {
    if (typeof editQuoteInCB === 'function') editQuoteInCB(/** @type {number} */ (_qpState.quoteId));
  });
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
    };
    _db('quote_lines').update(update).eq('id', row.id).then(/** @param {any} r */ (r) => {
      if (r && r.error) console.warn('[line upsert]', r.error.message);
    });
  }, 600);
  _lineUpsertTimers.set(idx, t);
}

/** @param {number} id */
async function _saveQuotePopup(id) {
  const q = quotes.find(x => x.id === id);
  if (!q) return;
  const projectName = _popupVal('pq-project');
  const clientName = _popupVal('pq-client');
  const status = _popupVal('pq-status');
  const notes = _popupVal('pq-notes');
  const quote_number = _popupVal('pq-quote-number') || null;
  const markup = parseFloat(_popupVal('pq-markup')) || 0;
  const tax = parseFloat(_popupVal('pq-tax')) || 0;

  // Resolve client/project FKs from the popup's text inputs (find-or-create)
  const client_id = clientName ? await resolveClient(clientName) : null;
  const project_id = projectName ? await resolveProject(projectName, client_id) : null;

  /** @type {any} */
  const update = { status, notes, quote_number, markup, tax, updated_at: new Date().toISOString() };
  if (client_id) update.client_id = client_id;
  if (project_id) update.project_id = project_id;
  Object.assign(q, update);
  // Close the popup immediately — saves run in the background. The user
  // doesn't wait for N+1 round-trips before regaining control.
  _closePopup();
  // Flush any pending line edits in parallel (was sequential — N round-trips).
  for (const t of _lineUpsertTimers.values()) clearTimeout(t);
  _lineUpsertTimers.clear();
  /** @type {Promise<any>[]} */
  const writes = [/** @type {any} */ (_db('quotes').update(update).eq('id', id))];
  for (const row of _qpState.lines) {
    if (!row.id) continue;
    /** @type {any} */
    const u = {
      name: row.name || '',
      qty: row.qty || 0,
      unit_price: row.unit_price ?? null,
      labour_hours: row.labour_hours ?? null,
    };
    writes.push(/** @type {any} */ (_db('quote_lines').update(u).eq('id', row.id)));
  }
  await Promise.all(writes);
  await _refreshQuoteTotals(id);
  renderQuoteMain();
  _toast('Quote updated', 'success');
}

// ── Project Popup ──
/** @param {number} id */
function _openProjectPopup(id) {
  const p = /** @type {any} */ (projects.find(x => x.id === id));
  if (!p) return;
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const clientName = p.client_id ? (clients.find(c=>c.id===p.client_id)||{}).name||'' : '';
  const pQuotes = quotes.filter(q => !_isDraftQuote(q) && (q.project_id === p.id || (!q.project_id && quoteProject(q) === p.name)));
  const pOrders = orders.filter(o => o.project_id === p.id || (!o.project_id && orderProject(o) === p.name));
  const statusBadge = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';

  const quoteChips = pQuotes.map(q =>
    `<span class="pf-chip" onclick="_closePopup();switchSection('quote');window._quoteSearch='${_escHtml(quoteProject(q))}';renderQuoteMain()">Q-${String(q.id).padStart(4,'0')} · ${fmt(quoteTotal(q))} · ${q.status}</span>`
  ).join('') || '<span style="font-size:10px;color:var(--muted)">None</span>';
  const orderChips = pOrders.map(o =>
    `<span class="pf-chip" onclick="_closePopup();switchSection('orders');window._orderSearch='${_escHtml(orderProject(o))}';renderOrdersMain()">${_escHtml(orderProject(o))} · ${fmt(o.value ?? 0)} · ${(/** @type {Record<string,string>} */(STATUS_LABELS))[o.status||'']||o.status}</span>`
  ).join('') || '<span style="font-size:10px;color:var(--muted)">None</span>';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">
        Edit Project
        <span class="badge ${statusBadge}" style="font-size:10px">${p.status==='complete'?'Complete':p.status==='on-hold'?'On Hold':'Active'}</span>
      </div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">Project Name</label>
        <input class="pf-input pf-input-lg" id="pp-name" value="${_escHtml(p.name)}">
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Client</label>
          <div class="pf-static"><div class="pf-dot" style="background:var(--success)"></div> ${_escHtml(clientName || 'No client')}</div>
        </div>
        <div class="pf">
          <label class="pf-label">Status</label>
          <select class="pf-select" id="pp-status">
            <option value="active" ${p.status==='active'?'selected':''}>Active</option>
            <option value="on-hold" ${p.status==='on-hold'?'selected':''}>On Hold</option>
            <option value="complete" ${p.status==='complete'?'selected':''}>Complete</option>
          </select>
        </div>
      </div>
      <div class="pf">
        <label class="pf-label">Notes</label>
        <textarea class="pf-textarea" id="pp-desc" placeholder="Project notes...">${_escHtml(p.description||'')}</textarea>
      </div>
      <div class="pf-divider"></div>
      <div class="pf" style="margin-bottom:4px">
        <label class="pf-label">Quotes (${pQuotes.length})</label>
        <div class="pf-chips">${quoteChips}</div>
      </div>
      <div class="pf" style="margin-bottom:0">
        <label class="pf-label">Orders (${pOrders.length})</label>
        <div class="pf-chips">${orderChips}</div>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-danger" onclick="_confirm('Delete project <strong>${_escHtml(p.name)}</strong>?',()=>{_closePopup();removeProject(${p.id})})">Delete</button>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
        <button class="btn btn-primary" onclick="_saveProjectPopup(${p.id})">Save Changes</button>
      </div>
    </div>
  `, 'sm');
}

/** @param {number} id */
async function _saveProjectPopup(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const name = _popupVal('pp-name');
  const status = _popupVal('pp-status');
  const description = _popupVal('pp-desc') || null;
  if (!name) { _toast('Name is required', 'error'); return; }
  Object.assign(p, { name, status, description });
  await _db('projects').update({ name, status, description }).eq('id', id);
  _closePopup();
  renderProjectsMain();
  _toast('Project updated', 'success');
}

// ── Stock Popup ──
/**
 * Increment/decrement a numeric input by `delta * step`, clamped to `min`.
 * Used by the +/− stepper buttons in the stock edit popup.
 * @param {string} id @param {number} delta @param {number} [step] @param {number} [min]
 */
function _stepInput(id, delta, step = 1, min = 0) {
  const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (!el) return;
  const cur = parseFloat(el.value) || 0;
  let next = cur + delta * step;
  if (next < min) next = min;
  if (step < 1) {
    const decimals = (String(step).split('.')[1] || '').length;
    next = parseFloat(next.toFixed(decimals));
  }
  el.value = String(next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** @param {number} id */
function _openStockPopup(id) {
  const item = /** @type {any} */ (stockItems.find(x => x.id === id));
  if (!item) return;
  const sup = _ssGet(id);
  const vd = _svGet(id);
  const cat = _scGet(id) || item.category || '';
  const isEB = cat === 'Edge Banding';
  const ebThick = vd.thickness ?? item.thickness ?? '';
  const ebWidth = vd.width ?? item.width ?? item.h ?? '';
  const ebLength = vd.length ?? item.length ?? item.w ?? '';
  const ebGlue = vd.glue || item.glue || 'EVA';
  const isLow = (item.qty ?? 0) <= (item.low ?? 0);

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">
        Edit Material
        <span class="badge ${isLow ? 'badge-red' : 'badge-green'}" style="font-size:10px">${isLow ? 'Low Stock' : 'OK'}</span>
      </div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label class="pf-label">Name</label>
        <input class="pf-input pf-input-lg" id="ps-name" value="${_escHtml(item.name)}">
      </div>
      <div class="pf">
        <label class="pf-label">Variant / Spec</label>
        <input class="pf-input" id="ps-variant" value="${_escHtml(vd.variant||item.variant||'')}" placeholder="e.g. BP-18, 500mm depth">
      </div>
      ${isEB ? `
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Thickness (mm)</label><input class="pf-input" id="ps-eb-thick" type="number" step="0.1" value="${ebThick}"></div>
        <div class="pf"><label class="pf-label">Width (mm)</label><input class="pf-input" id="ps-eb-width" type="number" value="${ebWidth}"></div>
        <div class="pf"><label class="pf-label">Length (m)</label><input class="pf-input" id="ps-eb-length" type="number" step="0.1" value="${ebLength}"></div>
      </div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Glue Type</label>
          <select class="pf-select" id="ps-eb-glue">
            ${['EVA','PUR','Laser','Hot Melt','Pre-glued','None'].map(g=>`<option value="${g}" ${ebGlue===g?'selected':''}>${g}</option>`).join('')}
          </select>
        </div>
        <div class="pf"><label class="pf-label">Low Alert (m)</label>
          <div class="pf-stepper">
            <button type="button" class="pf-step-btn" onclick="_stepInput('ps-low',-1,0.1)">−</button>
            <input class="pf-input" id="ps-low" type="number" step="0.1" value="${item.low}">
            <button type="button" class="pf-step-btn" onclick="_stepInput('ps-low',1,0.1)">+</button>
          </div>
        </div>
        <div class="pf"><label class="pf-label">Cost / m</label><input class="pf-input" id="ps-cost" type="number" step="0.01" value="${item.cost}" style="text-align:right"></div>
      </div>
      ` : `
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Length</label><input class="pf-input" id="ps-length" value="${item.w}"></div>
        <div class="pf"><label class="pf-label">Width</label><input class="pf-input" id="ps-width" value="${item.h}"></div>
        <div class="pf"><label class="pf-label">Thickness</label><input class="pf-input" id="ps-thick" value="${vd.thickness||item.thick||''}"></div>
      </div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Qty in Stock</label>
          <div class="pf-stepper">
            <button type="button" class="pf-step-btn" onclick="_stepInput('ps-qty',-1)">−</button>
            <input class="pf-input" id="ps-qty" type="number" min="0" value="${item.qty}" style="font-weight:700">
            <button type="button" class="pf-step-btn" onclick="_stepInput('ps-qty',1)">+</button>
          </div>
        </div>
        <div class="pf"><label class="pf-label">Low Alert</label>
          <div class="pf-stepper">
            <button type="button" class="pf-step-btn" onclick="_stepInput('ps-low',-1)">−</button>
            <input class="pf-input" id="ps-low" type="number" min="0" value="${item.low}">
            <button type="button" class="pf-step-btn" onclick="_stepInput('ps-low',1)">+</button>
          </div>
        </div>
        <div class="pf"><label class="pf-label">Cost / Unit</label><input class="pf-input" id="ps-cost" value="${item.cost}" style="text-align:right"></div>
      </div>
      `}
      <div class="pf">
        <label class="pf-label">Category</label>
        <select class="pf-select" id="ps-cat">
          <option value="Sheet Goods" ${cat==='Sheet Goods'?'selected':''}>Sheet Goods</option>
          <option value="Solid Timber" ${cat==='Solid Timber'?'selected':''}>Solid Timber</option>
          <option value="Edge Banding" ${cat==='Edge Banding'?'selected':''}>Edge Banding</option>
          <option value="Hardware" ${cat==='Hardware'?'selected':''}>Hardware</option>
          <option value="Finishing" ${cat==='Finishing'?'selected':''}>Finishing</option>
          <option value="Other" ${cat==='Other'?'selected':''}>Other</option>
          <option value="" ${!cat||cat==='Uncategorised'?'selected':''}>Uncategorised</option>
        </select>
      </div>
      <div class="pf-divider"></div>
      <div class="pf">
        <label class="pf-label">Supplier</label>
        <input class="pf-input" id="ps-supplier" value="${_escHtml(sup.supplier||'')}" placeholder="Supplier name">
      </div>
      <div class="pf" style="margin-bottom:0">
        <label class="pf-label">Reorder Link</label>
        <input class="pf-input" id="ps-url" value="${_escHtml(sup.url||'')}" placeholder="https://...">
      </div>
    </div>
    <div class="popup-footer">
      <div class="popup-footer-left">
        <button class="btn btn-danger" onclick="_confirm('Remove <strong>${_escHtml(item.name)}</strong>?',()=>{_closePopup();removeStock(${item.id})})">Delete</button>
      </div>
      <div class="popup-footer-right">
        ${sup.url ? `<button class="btn btn-outline" style="color:var(--accent)" onclick="window.open('${_escHtml(_normalizeUrl(sup.url))}','_blank')">Reorder ↗</button>` : ''}
        <button class="btn btn-primary" onclick="_saveStockPopup(${item.id})">Save</button>
      </div>
    </div>
  `, 'sm');
}

/** @param {number} id */
async function _saveStockPopup(id) {
  const item = /** @type {any} */ (stockItems.find(x => x.id === id));
  if (!item) return;
  const name = _popupVal('ps-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const cat = _popupVal('ps-cat') || '';
  const isEB = cat === 'Edge Banding';
  const variant = _popupVal('ps-variant') || '';
  /** @type {any} */
  let updates;
  let thick = 0, ebWidth = 0, ebLength = 0, ebGlue = '';
  if (isEB) {
    thick = parseFloat(_popupVal('ps-eb-thick')) || 0;
    ebWidth = parseFloat(_popupVal('ps-eb-width')) || 0;
    ebLength = parseFloat(_popupVal('ps-eb-length')) || 0;
    ebGlue = _popupVal('ps-eb-glue') || '';
    updates = {
      name,
      w: ebLength,
      h: ebWidth,
      qty: Math.round(ebLength),
      low: Math.round(parseFloat(_popupVal('ps-low')) || 0),
      cost: parseFloat(_popupVal('ps-cost')) || 0,
    };
  } else {
    thick = parseFloat(_popupVal('ps-thick')) || 0;
    updates = {
      name,
      w: parseFloat(_popupVal('ps-length')) || item.w,
      h: parseFloat(_popupVal('ps-width')) || item.h,
      qty: parseInt(_popupVal('ps-qty')) || 0,
      low: parseInt(_popupVal('ps-low')) || 0,
      cost: parseFloat(_popupVal('ps-cost')) || 0,
    };
  }
  Object.assign(item, updates);
  if (isEB) { item.thickness = thick; item.width = ebWidth; item.length = ebLength; item.glue = ebGlue; }
  else { delete item.thickness; delete item.width; delete item.length; delete item.glue; }
  _scSet(id, cat);
  /** @type {{variant: string, thickness: number, width?: number, length?: number, glue?: string}} */
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  _svSet(id, meta);
  // Save supplier info
  const sup = _ssGet(id);
  sup.supplier = _popupVal('ps-supplier');
  sup.url = _popupVal('ps-url');
  _ssSet(id, sup);
  if (_userId) await _db('stock_items').update(updates).eq('id', id);
  _closePopup();
  renderStockMain();
  _toast('Material updated', 'success');
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
  // Pre-cache order_lines too so order popups open without a network wait
  _hydrateOrderLines().catch(e => console.warn('[order lines] hydrate failed:', e.message || e));
  // U.9: load DISTINCT project_id from sheets/pieces for the per-project cut-list count
  _loadCutListProjectIds().catch(e => console.warn('[cutlist project ids]', e.message || e));
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
    if (b.default_contingency_hours != null) cbSettings.contingencyHours = parseFloat(b.default_contingency_hours);
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
  } else {
    _userId = null;
    _subscription = null;
    if (typeof renderSubscriptionSection === 'function') renderSubscriptionSection();
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = '';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = 'none';
    _clProjectCache = [];
    // Item 2 phase 1.4: clear in-memory Cabinet Builder state and re-render
    // so the auth gate shows immediately on sign-out (otherwise the panel
    // keeps rendering the previous user's cabinets until the next tab switch).
    cbLines = [];
    if (typeof renderCBPanel === 'function') { try { renderCBPanel(); } catch(e){} }
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

