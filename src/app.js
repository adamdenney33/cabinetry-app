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
  const cQuotes = quotes.filter(q => q.client_id === c.id || (!q.client_id && quoteClient(q) === c.name));
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
/** @param {number} id */
function _openOrderPopup(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const cur = window.currency;
  /** @param {any} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
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
          <label class="pf-label">Value</label>
          <input class="pf-input" id="po-value" value="${o.value}" style="font-weight:700;font-size:16px;text-align:right">
        </div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf" style="margin-bottom:8px">
        <label class="pf-label">Status Pipeline</label>
        <div class="pp-pipeline">${pipe}</div>
        <select class="pf-select" id="po-status" style="margin-top:6px">
          ${pipelineSteps.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${(/** @type {Record<string,string>} */(STATUS_LABELS))[s]}</option>`).join('')}
        </select>
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Production Start</label>
          <input class="pf-input" type="date" id="po-start" value="${_orderDateToISO(o.prodStart||'')}">
        </div>
        <div class="pf">
          <label class="pf-label">Due Date</label>
          <input class="pf-input" type="date" id="po-due" value="${_orderDateToISO(o.due||'')}">
        </div>
      </div>
      <div class="pf">
        <label class="pf-label">Production Notes</label>
        <textarea class="pf-textarea" id="po-notes" placeholder="Production notes...">${_escHtml(o.notes||'')}</textarea>
      </div>
      ${quoteChip}
    </div>
    <div class="popup-footer">
      <div class="popup-footer-left">
        <button class="btn btn-danger" onclick="_confirm('Delete order for <strong>${_escHtml(orderClient(o))}</strong>?',()=>{_closePopup();removeOrder(${o.id})})">Delete</button>
        <button class="btn btn-outline" onclick="_closePopup();printWorkOrder(${o.id},'print')">Work Order</button>
        <button class="btn btn-outline" onclick="_closePopup();printWorkOrder(${o.id},'pdf')">PDF</button>
      </div>
      <div class="popup-footer-right">
        ${o.status !== 'complete' ? `<button class="btn btn-success" onclick="_saveOrderPopup(${o.id}).then(()=>{advanceOrder(${o.id});_openOrderPopup(${o.id})})">Next →</button>` : ''}
        <button class="btn btn-primary" onclick="_saveOrderPopup(${o.id})">Save</button>
      </div>
    </div>
  `, 'md');
}

/** @param {number} id */
async function _saveOrderPopup(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const projectName = _popupVal('po-project');
  const clientName = _popupVal('po-client');
  const value = parseFloat(_popupVal('po-value').replace(/[^0-9.]/g,'')) || 0;
  const status = _popupVal('po-status');
  const notes = _popupVal('po-notes');
  const dueRaw = _popupVal('po-due');
  const due = dueRaw ? new Date(dueRaw+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : 'TBD';
  const startRaw = _popupVal('po-start');

  // Resolve client/project FKs (find-or-create) so writes don't depend on the legacy text columns
  const client_id = clientName ? await resolveClient(clientName) : null;
  const project_id = projectName ? await resolveProject(projectName, client_id) : null;

  /** @type {any} */
  const update = { value, status, due };
  if (client_id) update.client_id = client_id;
  if (project_id) update.project_id = project_id;
  Object.assign(o, update, { notes });
  if (startRaw) setOrderProdStart(o.id, startRaw);
  _onSet(o.id, notes);

  await _db('orders').update(update).eq('id', id);
  const ob = document.getElementById('orders-badge');
  if (ob) ob.textContent = String(orders.filter(o => o.status !== 'complete').length);
  _closePopup();
  renderOrdersMain();
  renderSchedule();
  renderDashboard();
  setTimeout(drawRevenueChart, 0);
  _toast('Order updated', 'success');
}

// ── Quote Popup ──
/** @param {number} id */
function _openQuotePopup(id) {
  const q = /** @type {any} */ (quotes.find(x => x.id === id));
  if (!q) return;
  const cur = window.currency;
  /** @param {any} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const matVal = q._totals?.materials || 0;
  const labVal = q._totals?.labour    || 0;
  const sub = matVal + labVal;
  const markupAmt = sub * (q.markup || 0) / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * (q.tax || 0) / 100;
  const total = afterMarkup + taxAmt;
  const rate = (typeof cqSettings !== 'undefined' && cqSettings.labourRate) ? cqSettings.labourRate : 65;
  const hrs = labVal > 0 ? (labVal / Math.max(1, rate)).toFixed(1) : '0';

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
      <div class="pf">
        <label class="pf-label">Notes / Line Items</label>
        <textarea class="pf-textarea" id="pq-notes" style="min-height:80px" placeholder="Add line items or notes...">${_escHtml(q.notes||'')}</textarea>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Materials</label><input class="pf-input" id="pq-materials" value="${matVal}" oninput="_updateQuotePopupTotals()"></div>
        <div class="pf"><label class="pf-label">Hours @ ${cur}${rate}/hr</label><input class="pf-input" id="pq-hours" value="${hrs}" oninput="_updateQuotePopupTotals()"></div>
        <div class="pf" style="flex:0.5"></div>
      </div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Markup %</label><input class="pf-input" id="pq-markup" value="${q.markup}" oninput="_updateQuotePopupTotals()"></div>
        <div class="pf"><label class="pf-label">Tax %</label><input class="pf-input" id="pq-tax" value="${q.tax}" oninput="_updateQuotePopupTotals()"></div>
        <div class="pf" style="flex:0.5"></div>
      </div>
      <div class="pf-totals" id="pq-totals">
        <div class="pf-total-row"><span class="t-label">Materials</span><span class="t-val">${fmt(matVal)}</span></div>
        <div class="pf-total-row"><span class="t-label">Labour (${hrs}h @ ${cur}${rate}/hr)</span><span class="t-val">${fmt(labVal)}</span></div>
        <div class="pf-total-row"><span class="t-label">Markup (${q.markup}%)</span><span class="t-val">+${fmt(markupAmt)}</span></div>
        <div class="pf-total-row"><span class="t-label">Tax (${q.tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
        <div class="pf-total-row t-main"><span class="t-label">Total</span><span class="t-val">${fmt(total)}</span></div>
      </div>
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
}

function _updateQuotePopupTotals() {
  const cur = window.currency;
  /** @param {any} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const mat = parseFloat(_popupVal('pq-materials')) || 0;
  const rate = (typeof cqSettings !== 'undefined' && cqSettings.labourRate) ? cqSettings.labourRate : 65;
  const hrs = parseFloat(_popupVal('pq-hours')) || 0;
  const labour = rate * hrs;
  const markup = parseFloat(_popupVal('pq-markup')) || 0;
  const tax = parseFloat(_popupVal('pq-tax')) || 0;
  const sub = mat + labour;
  const markupAmt = sub * markup / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * tax / 100;
  const total = afterMarkup + taxAmt;
  const el = document.getElementById('pq-totals');
  if (el) el.innerHTML = `
    <div class="pf-total-row"><span class="t-label">Materials</span><span class="t-val">${fmt(mat)}</span></div>
    <div class="pf-total-row"><span class="t-label">Labour (${hrs}h @ ${cur}${rate}/hr)</span><span class="t-val">${fmt(labour)}</span></div>
    <div class="pf-total-row"><span class="t-label">Markup (${markup}%)</span><span class="t-val">+${fmt(markupAmt)}</span></div>
    <div class="pf-total-row"><span class="t-label">Tax (${tax}%)</span><span class="t-val">+${fmt(taxAmt)}</span></div>
    <div class="pf-total-row t-main"><span class="t-label">Total</span><span class="t-val">${fmt(total)}</span></div>`;
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
  const materials = parseFloat(_popupVal('pq-materials')) || 0;
  const hrs = parseFloat(_popupVal('pq-hours')) || 0;
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
  await _db('quotes').update(update).eq('id', id);
  // Manual-totals quote: store materials + labour hours on a single quote_lines stub row
  await _writeManualTotalsLine(id, materials, hrs);
  await _refreshQuoteTotals(id);
  _closePopup();
  renderQuoteMain();
  _toast('Quote updated', 'success');
}

// Maintain a single quote_lines row (name='Manual Quote') per quote that holds
// the user-entered materials/labour totals as overrides. Aggregation sees this
// row and produces the same total as the legacy materials+labour columns.
/** @param {number} quoteId @param {number} materials @param {number} labourHours */
async function _writeManualTotalsLine(quoteId, materials, labourHours) {
  if (!_userId || !quoteId) return;
  const { data: existing } = await _db('quote_lines')
    .select('id').eq('quote_id', quoteId).eq('name', 'Manual Quote').limit(1);
  const hasData = (materials > 0) || (labourHours > 0);
  if (!hasData) {
    if (existing && existing.length) {
      await _db('quote_lines').delete().eq('id', existing[0].id);
    }
    return;
  }
  const row = {
    quote_id: quoteId, user_id: _userId, position: 0, name: 'Manual Quote', qty: 1,
    material_cost_override: materials > 0 ? materials : null,
    labour_hours: labourHours > 0 ? labourHours : 0,
    labour_override: true,
  };
  if (existing && existing.length) {
    await _db('quote_lines').update(row).eq('id', existing[0].id);
  } else {
    await _db('quote_lines').insert([row]);
  }
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
  const pQuotes = quotes.filter(q => q.project_id === p.id || (!q.project_id && quoteProject(q) === p.name));
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
        <div class="pf"><label class="pf-label">Low Alert (m)</label><input class="pf-input" id="ps-low" type="number" step="0.1" value="${item.low}" style="text-align:center"></div>
        <div class="pf"><label class="pf-label">Cost / m</label><input class="pf-input" id="ps-cost" type="number" step="0.01" value="${item.cost}" style="text-align:right"></div>
      </div>
      ` : `
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Length</label><input class="pf-input" id="ps-length" value="${item.w}"></div>
        <div class="pf"><label class="pf-label">Width</label><input class="pf-input" id="ps-width" value="${item.h}"></div>
        <div class="pf"><label class="pf-label">Thickness</label><input class="pf-input" id="ps-thick" value="${vd.thickness||item.thick||''}"></div>
      </div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Qty in Stock</label><input class="pf-input" id="ps-qty" value="${item.qty}" style="font-weight:700;font-size:16px;text-align:center"></div>
        <div class="pf"><label class="pf-label">Low Alert</label><input class="pf-input" id="ps-low" value="${item.low}" style="text-align:center"></div>
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
        ${sup.url ? `<button class="btn btn-outline" style="color:var(--accent)" onclick="window.open('${_escHtml(sup.url)}','_blank')">Reorder ↗</button>` : ''}
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
  const line = cqLines[idx];
  if (!line) return;
  const c = calcCQLine(line);
  const cur = window.currency;
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const cabMarkup = c.lineSubtotal * cqSettings.markup / 100;
  const cabTotal = (c.lineSubtotal + cabMarkup) * (1 + cqSettings.tax / 100);

  // Material options
  const matOpts = cqSettings.materials.map(/** @param {any} m */ m =>
    `<option value="${m.name}" ${m.name===line.material?'selected':''}>${m.name}</option>`
  ).join('');
  const finishOpts = (cqSettings.finishes||[]).map(/** @param {any} f */ f =>
    `<option value="${f.name}" ${f.name===(line.finish||'None')?'selected':''}>${f.name}</option>`
  ).join('');
  const constOpts = (cqSettings.constructions||[]).map(/** @param {any} co */ co =>
    `<option value="${co.name}" ${co.name===line.construction?'selected':''}>${co.name}</option>`
  ).join('');
  const baseOpts = (cqSettings.baseTypes||[]).map(/** @param {any} b */ b =>
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
        ${cqSettings.markup>0?`<div class="pf-total-row"><span style="color:var(--muted)">Markup (${cqSettings.markup}%)</span><span>+${fmt0(cabMarkup)}</span></div>`:''}
        <div class="pf-total-row" style="font-weight:700;font-size:14px;color:var(--accent);border-top:1px solid var(--border);padding-top:6px;margin-top:4px"><span>Total</span><span>${fmt0(cabTotal)}</span></div>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" style="color:var(--danger);margin-right:auto" onclick="_confirm('Delete this cabinet?',()=>{cqLines.splice(${idx},1);saveCQLines();_closePopup();renderCQPanel()})">Delete</button>
      <button class="btn btn-outline" onclick="_duplicateCabinet(${idx})">Duplicate</button>
      <button class="btn btn-outline" onclick="_closePopup();cqEditCabinetFromOutput(${idx})">Full Editor</button>
      <button class="btn btn-accent" onclick="_saveCabinetPopup(${idx})">Save</button>
    </div>`;
  _openPopup(html, 'md');
}

/** @param {number} idx */
function _duplicateCabinet(idx) {
  const line = cqLines[idx];
  if (!line) return;
  const copy = JSON.parse(JSON.stringify(line));
  copy.id = cqNextId++;
  copy.name = (copy.name || 'Cabinet') + ' (copy)';
  cqLines.splice(idx + 1, 0, copy);
  saveCQLines();
  _closePopup();
  renderCQPanel();
  _toast('Cabinet duplicated', 'success');
}

/** @param {number} idx */
function _saveCabinetPopup(idx) {
  const line = cqLines[idx];
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
  saveCQLines();
  _closePopup();
  renderCQPanel();
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
  if (_authMode === 'signin') {
    ({ error } = await _sb.auth.signInWithPassword({ email, password }));
  } else {
    ({ error } = await _sb.auth.signUp({ email, password }));
  }
  if (btn) { btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account'; }
  if (error) { if (msgEl) msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`; return; }
  if (_authMode === 'signup' && msgEl) { msgEl.innerHTML = '<div class="auth-success">Check your email to confirm your account, then sign in.</div>'; }
}

async function signOut() {
  await _sb.auth.signOut();
  orders = []; quotes = []; stockItems = []; clients = []; projects = [];
  _userId = null;
  toggleAccount();
  renderStockMain(); renderQuoteMain(); renderOrdersMain();
}

async function loadAllData() {
  const [{ data: ord }, { data: quo }, { data: stk }, { data: cli }, { data: prj }, { data: cat }, { data: biz }] = await Promise.all([
    _db('orders').select('*').order('created_at', { ascending: false }),
    _db('quotes').select('*').order('created_at', { ascending: false }),
    _db('stock_items').select('*').order('created_at', { ascending: true }),
    _db('clients').select('*').order('name', { ascending: true }).then(r => r).catch(() => ({data:[]})),
    _db('projects').select('*').order('created_at', { ascending: false }).then(r => r).catch(() => ({data:[]})),
    // Phase 3: catalog_items overlays cqSettings arrays
    _db('catalog_items').select('*').eq('user_id', _userId).then(r => r).catch(() => ({data:[]})),
    // Phase 3: business_info overlays pc_biz / pc_biz_logo / pc_cq_settings rates
    _db('business_info').select('*').eq('user_id', _userId).then(r => r).catch(() => ({data:[]})),
  ]);
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
  _hydrateQuoteTotals().then(() => { try { renderQuoteMain(); } catch(e){} }).catch(e => console.warn('[quote totals] hydrate failed:', e.message || e));
  // Phase 3.2 — overlay catalog from DB (only if rows exist; otherwise leave localStorage defaults)
  _applyCatalogFromDB(/** @type {any[]} */ (cat || []));
  // Phase 3.3 — overlay business_info from DB (only if a row exists)
  _applyBizInfoFromDB(/** @type {any[]} */ (biz || []));
  /** @type {HTMLElement} */ (document.getElementById('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  renderStockMain();
  renderQuoteMain();
  renderOrdersMain();
}

// Phase 3.2: overlay catalog_items rows onto in-memory cqSettings.
// If DB has no rows, the existing localStorage-loaded arrays remain untouched.
/** @param {any[]} rows */
function _applyCatalogFromDB(rows) {
  if (!rows || rows.length === 0) return;
  /** @type {Record<string, {name: string, price: number}[]>} */
  const byType = { material: [], handle: [], finish: [], hardware: [] };
  for (const r of rows) {
    if (byType[r.type]) byType[r.type].push({ name: r.name, price: parseFloat(r.price) || 0 });
  }
  if (byType.material.length && typeof cqSettings !== 'undefined') cqSettings.materials = byType.material;
  if (byType.finish.length && typeof cqSettings !== 'undefined') cqSettings.finishes = byType.finish;
  if (byType.hardware.length && typeof cqSettings !== 'undefined') cqSettings.hardware = byType.hardware;
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
  // Persist back to localStorage so other reads pick it up (legacy compatibility)
  try {
    localStorage.setItem('pc_biz', JSON.stringify({
      name: b.name || '', phone: b.phone || '', email: b.email || '',
      address: b.address || '', abn: b.abn || ''
    }));
  } catch(e) {}
  // Default rates (only if cqSettings hasn't been customised)
  if (typeof cqSettings !== 'undefined') {
    if (b.default_labour_rate != null && (!cqSettings.labourRate || cqSettings.labourRate === 65)) {
      cqSettings.labourRate = parseFloat(b.default_labour_rate);
    }
    if (b.default_markup_pct != null && (!cqSettings.markup || cqSettings.markup === 20)) {
      cqSettings.markup = parseFloat(b.default_markup_pct);
    }
    if (b.default_tax_pct != null && (!cqSettings.tax || cqSettings.tax === 13)) {
      cqSettings.tax = parseFloat(b.default_tax_pct);
    }
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
    /** @type {HTMLElement} */ (document.getElementById('account-guest-view')).style.display = '';
    /** @type {HTMLElement} */ (document.getElementById('account-user-view')).style.display = 'none';
    _clProjectCache = [];
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

