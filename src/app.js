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
function _openClientPopup(id) {
  const c = clients.find(x => x.id === id);
  if (!c) return;
  const cur = window.currency;
  const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const cQuotes = quotes.filter(q => q.client_id === c.id || (!q.client_id && quoteClient(q) === c.name));
  const cOrders = orders.filter(o => o.client_id === c.id || (!o.client_id && orderClient(o) === c.name));
  const cProjects = projects.filter(p => p.client_id === c.id);

  const projectChips = cProjects.map(p => {
    const badge = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';
    return `<span class="pf-chip badge ${badge}" onclick="_closePopup();switchSection('projects');_highlightProject(${p.id})">${_escHtml(p.name)}</span>`;
  }).join('') || '<span style="font-size:10px;color:var(--muted)">None</span>';
  const orderChips = cOrders.map(o =>
    `<span class="pf-chip" onclick="_closePopup();switchSection('orders');window._orderSearch='${_escHtml(orderProject(o))}';renderOrdersMain()">${_escHtml(orderProject(o))} — ${fmt(o.value)}</span>`
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
  await _db('clients').update(updates).eq('id', id);
  _closePopup();
  renderClientsMain();
  _toast('Client updated', 'success');
}

// ── Order Popup ──
function _openOrderPopup(id) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  const cur = window.currency;
  const fmt = v => cur + Number(v).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const pipelineSteps = ORDER_STATUSES;
  const stepLabels = ['Quote','Confirmed','Production','Delivery','Done'];
  const curIdx = pipelineSteps.indexOf(o.status);

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
  const quoteChip = fromQuote ? `<div class="pf" style="margin-bottom:0"><label class="pf-label">From Quote</label><div class="pf-chips"><span class="pf-chip" style="border-color:rgba(37,99,235,0.3);color:#6b9bf4" onclick="_closePopup();switchSection('quote');window._quoteSearch='${_escHtml(fromQuote.project)}';renderQuoteMain()">Q-${String(fromQuote.id).padStart(4,'0')} · ${_escHtml(fromQuote.project)}</span></div></div>` : '';

  // Overdue detection
  let isOverdue = false;
  if (o.status !== 'complete' && o.due && o.due !== 'TBD') {
    const parsed = new Date(o.due); if (!isNaN(parsed) && parsed < new Date()) isOverdue = true;
  }

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">
        Edit Order
        <span class="badge ${STATUS_BADGES[o.status]||'badge-gray'}" style="font-size:10px">${STATUS_LABELS[o.status]||o.status}</span>
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
          ${pipelineSteps.map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${STATUS_LABELS[s]}</option>`).join('')}
        </select>
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Production Start</label>
          <input class="pf-input" type="date" id="po-start" value="${_orderDateToISO(o.prodStart)}">
        </div>
        <div class="pf">
          <label class="pf-label">Due Date</label>
          <input class="pf-input" type="date" id="po-due" value="${_orderDateToISO(o.due)}">
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

  const update = { value, status, due };
  if (client_id) update.client_id = client_id;
  if (project_id) update.project_id = project_id;
  Object.assign(o, update, { notes });
  if (startRaw) setOrderProdStart(o.id, startRaw);
  _onSet(o.id, notes);

  await _db('orders').update(update).eq('id', id);
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  _closePopup();
  renderOrdersMain();
  renderSchedule();
  renderDashboard();
  setTimeout(drawRevenueChart, 0);
  _toast('Order updated', 'success');
}

// ── Quote Popup ──
function _openQuotePopup(id) {
  const q = quotes.find(x => x.id === id);
  if (!q) return;
  const cur = window.currency;
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
function _openProjectPopup(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  const cur = window.currency;
  const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
  const clientName = p.client_id ? (clients.find(c=>c.id===p.client_id)||{}).name||'' : '';
  const pQuotes = quotes.filter(q => q.project_id === p.id || (!q.project_id && quoteProject(q) === p.name));
  const pOrders = orders.filter(o => o.project_id === p.id || (!o.project_id && orderProject(o) === p.name));
  const statusBadge = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';

  const quoteChips = pQuotes.map(q =>
    `<span class="pf-chip" onclick="_closePopup();switchSection('quote');window._quoteSearch='${_escHtml(quoteProject(q))}';renderQuoteMain()">Q-${String(q.id).padStart(4,'0')} · ${fmt(quoteTotal(q))} · ${q.status}</span>`
  ).join('') || '<span style="font-size:10px;color:var(--muted)">None</span>';
  const orderChips = pOrders.map(o =>
    `<span class="pf-chip" onclick="_closePopup();switchSection('orders');window._orderSearch='${_escHtml(orderProject(o))}';renderOrdersMain()">${_escHtml(orderProject(o))} · ${fmt(o.value)} · ${STATUS_LABELS[o.status]||o.status}</span>`
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
function _openStockPopup(id) {
  const item = stockItems.find(x => x.id === id);
  if (!item) return;
  const sup = _ssGet(id);
  const vd = _svGet(id);
  const cat = _scGet(id) || item.category || '';
  const isEB = cat === 'Edge Banding';
  const ebThick = vd.thickness ?? item.thickness ?? '';
  const ebWidth = vd.width ?? item.width ?? item.h ?? '';
  const ebLength = vd.length ?? item.length ?? item.w ?? '';
  const ebGlue = vd.glue || item.glue || 'EVA';
  const isLow = item.qty <= item.low;

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

async function _saveStockPopup(id) {
  const item = stockItems.find(x => x.id === id);
  if (!item) return;
  const name = _popupVal('ps-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const cat = _popupVal('ps-cat') || '';
  const isEB = cat === 'Edge Banding';
  const variant = _popupVal('ps-variant') || '';
  let updates, thick = 0, ebWidth = 0, ebLength = 0, ebGlue = '';
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
  const cat = document.getElementById('pns-cat')?.value;
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
    row = {
      name, sku: '',
      w: ebLength, h: ebWidth,
      qty: Math.round(ebLength),
      low: Math.round(parseFloat(_popupVal('pns-eb-low')) || 0),
      cost: parseFloat(_popupVal('pns-eb-cost')) || 0,
    };
  } else {
    thick = parseFloat(_popupVal('pns-thick')) || 0;
    row = {
      name, sku: '',
      w: parseFloat(_popupVal('pns-length')) || 0,
      h: parseFloat(_popupVal('pns-width')) || 0,
      qty: parseInt(_popupVal('pns-qty')) || 0,
      low: parseInt(_popupVal('pns-low')) || 0,
      cost: parseFloat(_popupVal('pns-cost')) || 0,
    };
  }
  let saved;
  if (_userId) {
    row.user_id = _userId;
    const { data, error } = await _db('stock_items').insert(row).select().single();
    if (error) { _toast('Save failed: ' + error.message, 'error'); return; }
    saved = data;
    stockItems.push(data);
  } else {
    row.id = stockNextId++;
    saved = row;
    stockItems.push(row);
  }
  if (isEB) { saved.thickness = thick; saved.width = ebWidth; saved.length = ebLength; saved.glue = ebGlue; }
  _scSet(saved.id, cat);
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
function _openCabinetPopup(idx) {
  const line = cqLines[idx];
  if (!line) return;
  const c = calcCQLine(line);
  const cur = window.currency;
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const cabMarkup = c.lineSubtotal * cqSettings.markup / 100;
  const cabTotal = (c.lineSubtotal + cabMarkup) * (1 + cqSettings.tax / 100);

  // Material options
  const matOpts = cqSettings.materials.map(m =>
    `<option value="${m.name}" ${m.name===line.material?'selected':''}>${m.name}</option>`
  ).join('');
  const finishOpts = (cqSettings.finishes||[]).map(f =>
    `<option value="${f.name}" ${f.name===(line.finish||'None')?'selected':''}>${f.name}</option>`
  ).join('');
  const constOpts = (cqSettings.constructions||[]).map(co =>
    `<option value="${co.name}" ${co.name===line.construction?'selected':''}>${co.name}</option>`
  ).join('');
  const baseOpts = (cqSettings.baseTypes||[]).map(b =>
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

let _userId = null;
let _authMode = 'signin';

function _showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
}
function _showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
}

function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSign = _authMode === 'signin';
  document.getElementById('auth-heading').textContent = isSign ? 'Sign in to your account' : 'Create your account';
  document.getElementById('auth-btn').textContent = isSign ? 'Sign In' : 'Create Account';
  document.getElementById('auth-toggle').innerHTML = isSign
    ? 'No account? <span onclick="toggleAuthMode()">Create one</span>'
    : 'Already have an account? <span onclick="toggleAuthMode()">Sign In</span>';
  document.getElementById('auth-msg').innerHTML = '';
}

async function authSubmit() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const msgEl = document.getElementById('auth-msg');
  const btn = document.getElementById('auth-btn');
  msgEl.innerHTML = '';
  if (!email || !password) { msgEl.innerHTML = '<div class="auth-error">Email and password required.</div>'; return; }
  btn.disabled = true; btn.textContent = '…';
  let error;
  if (_authMode === 'signin') {
    ({ error } = await _sb.auth.signInWithPassword({ email, password }));
  } else {
    ({ error } = await _sb.auth.signUp({ email, password }));
  }
  btn.disabled = false; btn.textContent = _authMode === 'signin' ? 'Sign In' : 'Create Account';
  if (error) { msgEl.innerHTML = `<div class="auth-error">${error.message}</div>`; return; }
  if (_authMode === 'signup') { msgEl.innerHTML = '<div class="auth-success">Check your email to confirm your account, then sign in.</div>'; }
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
  stockItems = stk || [];
  clients = cli || [];
  projects = (prj || []).map(p => ({ ...p, status: p.status || 'active' }));
  if (orders.length) orderNextId = Math.max(...orders.map(o => o.id)) + 1;
  if (quotes.length) quoteNextId = Math.max(...quotes.map(q => q.id)) + 1;
  if (stockItems.length) stockNextId = Math.max(...stockItems.map(s => s.id)) + 1;
  // Phase 7 step 1: hydrate quote totals from quote_lines (fire and forget; renders re-run when ready)
  _hydrateQuoteTotals().then(() => { try { renderQuoteMain(); } catch(e){} }).catch(e => console.warn('[quote totals] hydrate failed:', e.message || e));
  // Phase 3.2 — overlay catalog from DB (only if rows exist; otherwise leave localStorage defaults)
  _applyCatalogFromDB(cat);
  // Phase 3.3 — overlay business_info from DB (only if a row exists)
  _applyBizInfoFromDB(biz);
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  renderStockMain();
  renderQuoteMain();
  renderOrdersMain();
}

// Phase 3.2: overlay catalog_items rows onto in-memory cqSettings.
// If DB has no rows, the existing localStorage-loaded arrays remain untouched.
function _applyCatalogFromDB(rows) {
  if (!rows || rows.length === 0) return;
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
function _applyBizInfoFromDB(rows) {
  if (!rows || rows.length === 0) return;
  const b = rows[0];
  // Update form inputs (these mirror what saveBizInfo / loadBizInfo manage)
  const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  set('biz-name', b.name);
  set('biz-phone', b.phone);
  set('biz-email', b.email);
  set('biz-address', b.address);
  set('biz-abn', b.abn);
  // Logo: if DB has a public URL, use it; otherwise fall through to localStorage base64
  if (b.logo_url) {
    const img = document.getElementById('biz-logo-preview');
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
    if (emailEl) emailEl.textContent = session.user.email;
    document.getElementById('account-guest-view').style.display = 'none';
    document.getElementById('account-user-view').style.display = '';
    _showApp();
    await loadAllData();
    await _loadCabinetTemplatesFromDB();
    _clLoadProjectList();
  } else {
    _userId = null;
    document.getElementById('account-guest-view').style.display = '';
    document.getElementById('account-user-view').style.display = 'none';
    _clProjectCache = [];
  }
});

// ══════════════════════════════════════════
// GLOBALS
// ══════════════════════════════════════════
window.currency = '$';
window.units = 'imperial';

// ══════════════════════════════════════════
// BUSINESS INFO
// ══════════════════════════════════════════
function saveBizInfo() {
  const payload = {
    name:    document.getElementById('biz-name')?.value    || '',
    phone:   document.getElementById('biz-phone')?.value   || '',
    email:   document.getElementById('biz-email')?.value   || '',
    address: document.getElementById('biz-address')?.value || '',
    abn:     document.getElementById('biz-abn')?.value     || '',
  };
  localStorage.setItem('pc_biz', JSON.stringify(payload));
  // Phase 3.3: debounced dual-write to business_info table
  _syncBizInfoToDB(payload);
}

let _bizInfoSyncTimer = null;
function _syncBizInfoToDB(payload) {
  if (!_userId) return;
  if (_bizInfoSyncTimer) clearTimeout(_bizInfoSyncTimer);
  _bizInfoSyncTimer = setTimeout(async () => {
    const fields = {
      user_id: _userId,
      name: payload.name || '',
      phone: payload.phone || null,
      email: payload.email || null,
      address: payload.address || null,
      abn: payload.abn || null,
      updated_at: new Date().toISOString()
    };
    const { data: existing } = await _db('business_info').select('id').eq('user_id', _userId);
    if (existing && existing.length > 0) {
      const { error } = await _db('business_info').update(fields).eq('user_id', _userId);
      if (error) console.warn('[biz_info] DB sync failed:', error.message);
    } else {
      const { error } = await _db('business_info').insert([fields]);
      if (error) console.warn('[biz_info] DB sync failed:', error.message);
    }
  }, 800);
}
function loadBizInfo() {
  try {
    const b = JSON.parse(localStorage.getItem('pc_biz') || '{}');
    if (b.name)    document.getElementById('biz-name').value    = b.name;
    if (b.phone)   document.getElementById('biz-phone').value   = b.phone;
    if (b.email)   document.getElementById('biz-email').value   = b.email;
    if (b.address) document.getElementById('biz-address').value = b.address;
    if (b.abn)     document.getElementById('biz-abn').value     = b.abn;
  } catch(e) {}
}
function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 500000) { _toast('Logo too large (max 500KB)', 'error'); return; }
  const reader = new FileReader();
  reader.onload = async e => {
    // 1. Always write to localStorage (legacy compatibility)
    localStorage.setItem('pc_biz_logo', e.target.result);
    loadLogoPreview();
    // 2. Phase 3.3: also upload to Supabase Storage and store URL on business_info
    if (_userId) {
      try {
        const ext = (file.type.split('/')[1] || 'png').replace('+xml','svg');
        const path = _userId + '/logo.' + ext;
        const up = await _sb.storage.from('business-assets').upload(path, file, { contentType: file.type, upsert: true });
        if (up.error) {
          console.warn('[logo] Storage upload failed:', up.error.message);
          _toast('Logo saved locally — cloud sync failed', 'success');
        } else {
          const pub = _sb.storage.from('business-assets').getPublicUrl(path);
          const url = pub.data && pub.data.publicUrl ? pub.data.publicUrl : null;
          if (url) {
            // UPSERT business_info.logo_url
            const { data: existing } = await _db('business_info').select('id').eq('user_id', _userId);
            if (existing && existing.length > 0) {
              await _db('business_info').update({ logo_url: url, updated_at: new Date().toISOString() }).eq('user_id', _userId);
            } else {
              await _db('business_info').insert([{ user_id: _userId, logo_url: url, name: '' }]);
            }
            _toast('Logo saved & synced', 'success');
            return;
          }
        }
      } catch(err) { console.warn('[logo] Sync exception:', err.message || err); }
    }
    _toast('Logo saved', 'success');
  };
  reader.readAsDataURL(file);
}
function removeLogo() {
  localStorage.removeItem('pc_biz_logo');
  loadLogoPreview();
}
function loadLogoPreview() {
  const logo = localStorage.getItem('pc_biz_logo');
  const img = document.getElementById('biz-logo-preview');
  const btn = document.getElementById('biz-logo-remove');
  if (img) { img.style.display = logo ? '' : 'none'; if (logo) img.src = logo; }
  if (btn) btn.style.display = logo ? '' : 'none';
}
function getBizLogo() { return localStorage.getItem('pc_biz_logo') || ''; }

function getBizInfo() {
  try { return JSON.parse(localStorage.getItem('pc_biz') || '{}'); } catch(e) { return {}; }
}

// ══════════════════════════════════════════
// SETTINGS DROPDOWN
// ══════════════════════════════════════════
function toggleSettings() {
  document.getElementById('settings-dropdown').classList.toggle('open');
  document.getElementById('account-dropdown').classList.remove('open');
}
function toggleAccount() {
  document.getElementById('account-dropdown').classList.toggle('open');
  document.getElementById('settings-dropdown').classList.remove('open');
}

document.addEventListener('click', function(e) {
  if (!document.querySelector('.settings-wrap').contains(e.target))
    document.getElementById('settings-dropdown').classList.remove('open');
  if (!document.querySelector('.account-wrap').contains(e.target))
    document.getElementById('account-dropdown').classList.remove('open');
});

// ══════════════════════════════════════════
// THEME TOGGLE
// ══════════════════════════════════════════
let darkMode = false;

function setTheme(dark) {
  darkMode = dark;
  document.documentElement.classList.toggle('dark', darkMode);
  localStorage.setItem('pcDark', darkMode ? '1' : '0');
  const lbl = document.getElementById('sd-theme-label');
  if (lbl) lbl.textContent = darkMode ? 'Dark Mode' : 'Light Mode';
  const tl = document.getElementById('toggle-light'), td = document.getElementById('toggle-dark');
  if (tl) tl.classList.toggle('active', !darkMode);
  if (td) td.classList.toggle('active', darkMode);
}

function toggleTheme() {
  setTheme(!darkMode);
}

(function() {
  if (localStorage.getItem('pcDark') === '1') {
    setTheme(true);
  }
})();

// ══════════════════════════════════════════
// UNITS
// ══════════════════════════════════════════
function setUnits(u) {
  const prevUnits = window.units;
  window.units = u;
  localStorage.setItem('pcUnits', u);
  const uiEl = document.getElementById('unit-imperial'), umEl = document.getElementById('unit-metric');
  if (uiEl) uiEl.classList.toggle('active', u === 'imperial');
  if (umEl) umEl.classList.toggle('active', u === 'metric');

  const m = u === 'metric';

  // Sync unit pills (settings bar + layout toolbar)
  document.querySelectorAll('#cl-unit-in').forEach(el => el.classList.toggle('active', !m));
  document.querySelectorAll('#cl-unit-mm').forEach(el => el.classList.toggle('active', m));

  // Stock form defaults
  const stW = document.getElementById('stock-w');
  const stH = document.getElementById('stock-h');
  const stN = document.getElementById('stock-name');
  if (stW) stW.value = m ? 2440 : 96;
  if (stH) stH.value = m ? 1220 : 48;
  if (stN && !stN.value) stN.placeholder = m ? 'e.g. 18mm Birch Plywood' : 'e.g. 3/4" Birch Plywood';

  // Convert existing sheets and pieces only when actually changing unit
  if (prevUnits && prevUnits !== u) {
    try {
      sheets.forEach(s => {
        if (m) { s.w = Math.round(s.w * 25.4); s.h = Math.round(s.h * 25.4); }
        else   { s.w = Math.round(s.w / 25.4 * 100) / 100; s.h = Math.round(s.h / 25.4 * 100) / 100; }
      });
      renderSheets();
    } catch(e) {}
    try {
      pieces.forEach(p => {
        if (m) { p.w = Math.round(p.w * 25.4); p.h = Math.round(p.h * 25.4); }
        else   { p.w = Math.round(p.w / 25.4 * 100) / 100; p.h = Math.round(p.h / 25.4 * 100) / 100; }
      });
      renderPieces();
    } catch(e) {}
  }

  try { renderStockMain(); renderQuoteMain(); renderOrdersMain(); } catch(e) {}
}

(function() {
  const saved = localStorage.getItem('pcUnits');
  if (saved) {
    setUnits(saved);
  } else {
    const lang = navigator.language || 'en-US';
    const imperialLocales = ['en-US', 'en-CA', 'en-AU'];
    const isImperial = imperialLocales.some(l => lang.startsWith(l.split('-')[0]) && lang.includes(l.split('-')[1]));
    setUnits(isImperial ? 'imperial' : 'metric');
  }
})();

// ══════════════════════════════════════════
// CURRENCY
// ══════════════════════════════════════════
const EURO_LOCALES = ['de','fr','es','it','nl','pt','fi','el','cs','sk','sl','hr','bg','ro','hu','lv','lt','et','mt','ga'];

function setCurrency(c) {
  window.currency = c;
  localStorage.setItem('pcCurrency', c);
  const curMap = { '$': 'cur-usd', '£': 'cur-gbp', '€': 'cur-eur', 'A$': 'cur-aud' };
  Object.entries(curMap).forEach(([sym, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', c === sym);
  });
  try { renderStockMain(); renderQuoteMain(); renderOrdersMain(); } catch(e) {}
}

(function() {
  const saved = localStorage.getItem('pcCurrency');
  if (saved) {
    setCurrency(saved);
    return;
  }
  const lang = navigator.language || 'en-US';
  if (lang === 'en-GB' || lang.startsWith('en-GB')) {
    setCurrency('£');
  } else if (EURO_LOCALES.some(l => lang.startsWith(l))) {
    setCurrency('€');
  } else {
    setCurrency('$');
  }
})();

// ══════════════════════════════════════════
// SECTION NAVIGATION
// ══════════════════════════════════════════
function switchSection(name) {
  document.querySelectorAll('.nav-tab').forEach((t,i) => {
    const sections = ['dashboard','cutlist','stock','cabinet','quote','orders','schedule','projects','clients'];
    t.classList.toggle('active', sections[i] === name);
  });
  document.querySelectorAll('.section-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + name);
  });
  if (name === 'cabinet') { try { renderCQPanel(); } catch(e) {} }
  if (name === 'stock') { renderStockMain(); }
  if (name === 'quote') renderQuoteMain();
  if (name === 'orders') renderOrdersMain();
  if (name === 'schedule') renderSchedule();
  if (name === 'dashboard') { renderDashboard(); setTimeout(drawRevenueChart, 0); }
  if (name === 'projects') renderProjectsMain();
  if (name === 'clients') renderClientsMain();
}

// ══════════════════════════════════════════
// STOCK
// ══════════════════════════════════════════
let stockItems = [];
let clients = [];
let projects = [];
let stockNextId = 1;
const STOCK_CATS = ['Sheet Goods','Solid Timber','Edge Banding','Hardware','Finishing','Other'];

// ── Stock metadata: DB columns first, localStorage fallback (Phase 3 of pre-launch refactor) ──
// stockItems is loaded with select('*'), so DB columns (category, supplier, supplier_url,
// variant, thickness_mm, width_mm, length_m, glue) come along automatically. Once migration
// has run, the DB is the source of truth. localStorage stays as fallback for unmigrated browsers.

// Helper: dual-write any subset of stock columns to DB + in-memory + localStorage map
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
function _scGet(id) {
  const item = stockItems.find(s => s.id === id);
  if (item && item.category) return item.category;
  return _scMap()[String(id)] || '';
}
function _scSet(id, cat) {
  _stockUpdateCols(id, { category: cat || null }, 'pc_stock_cats', cat || null);
}

// ── Stock Supplier Storage ──
function _ssGet(id) {
  const item = stockItems.find(s => s.id === id);
  if (item && (item.supplier || item.supplier_url)) {
    return { supplier: item.supplier || '', url: item.supplier_url || '' };
  }
  try { return JSON.parse(localStorage.getItem('pc_stock_suppliers')||'{}')[String(id)] || {}; } catch(e) { return {}; }
}
function _ssSet(id, data) {
  _stockUpdateCols(id, { supplier: data.supplier || null, supplier_url: data.url || null }, 'pc_stock_suppliers', data);
}
function _updateStockSupplier(id, field, val) {
  const sup = _ssGet(id);
  sup[field] = val;
  _ssSet(id, sup);
  renderStockMain();
}
function _promptReorderUrl(id) {
  const url = prompt('Enter supplier/reorder URL:');
  if (url === null) return;
  const sup = _ssGet(id);
  sup.url = url.trim();
  _ssSet(id, sup);
  renderStockMain();
}

// ── Stock Variant/Thickness Storage ──
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
function _oqGet(id) {
  // Prefer DB column on the in-memory orders array; fall back to localStorage map.
  const o = orders.find(x => x.id === id);
  if (o && o.quote_id != null) return o.quote_id;
  return _oqMap()[String(id)] || null;
}
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
function _onGet(id) {
  const o = orders.find(x => x.id === id);
  if (o && o.notes) return o.notes;
  return _onMap()[String(id)] || '';
}
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
function _onRestore(orderArr) {
  // For orders where DB notes is null but localStorage has a value, hydrate the in-memory cache
  // (DB takes precedence if both present).
  const m = _onMap();
  orderArr.forEach(o => {
    if (!o.notes && m[String(o.id)]) o.notes = m[String(o.id)];
  });
}

function stockCatChanged() {
  const cat = document.getElementById('stock-cat').value;
  const dimsEl = document.getElementById('stock-dims-fields');
  const ebEl = document.getElementById('stock-eb-fields');
  const qtyEl = document.getElementById('stock-qty-fields');
  const ebQtyEl = document.getElementById('stock-eb-qty-fields');
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
  document.getElementById('stock-name').value = '';
  document.getElementById('stock-variant').value = '';
  document.getElementById('stock-sku').value = '';
  document.getElementById('stock-submit-btn').textContent = '+ Add to Stock';
  document.getElementById('stock-cancel-btn').style.display = 'none';
  document.getElementById('stock-form-title').textContent = 'Add Material';
  renderStockMain();
}

async function addStockItem() {
  const name = document.getElementById('stock-name').value.trim();
  if (!name) { _toast('Enter a material name.', 'error'); return; }
  if (!_requireAuth()) return;
  const cat = document.getElementById('stock-cat').value.trim();
  const variant = document.getElementById('stock-variant').value.trim();
  const isEB = cat === 'Edge Banding';
  const thick = isEB
    ? (parseFloat(document.getElementById('stock-eb-thick')?.value) || 0)
    : (parseFloat(document.getElementById('stock-thick')?.value) || 0);
  const ebWidth = isEB ? (parseFloat(document.getElementById('stock-eb-width')?.value) || 0) : 0;
  const ebLength = isEB ? (parseFloat(document.getElementById('stock-eb-length')?.value) || 0) : 0;
  const ebGlue = isEB ? (document.getElementById('stock-eb-glue')?.value || '') : '';
  const row = {
    user_id: _userId, name,
    sku: document.getElementById('stock-sku').value.trim() || '—',
    w: isEB ? ebLength : (parseFloat(document.getElementById('stock-w').value) || 2440),
    h: isEB ? ebWidth : (parseFloat(document.getElementById('stock-h').value) || 1220),
    qty: isEB
      ? Math.round(ebLength)
      : (parseInt(document.getElementById('stock-qty').value) || 0),
    low: isEB
      ? Math.round(parseFloat(document.getElementById('stock-eb-low')?.value) || 0)
      : (parseInt(document.getElementById('stock-low').value) || 3),
    cost: isEB
      ? (parseFloat(document.getElementById('stock-eb-cost')?.value) || 0)
      : (parseFloat(document.getElementById('stock-cost').value) || 0),
  };
  const { data, error } = await _db('stock_items').insert(row).select().single();
  if (error) { _toast('Could not save stock item — ' + (error.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  // Attach edge banding metadata to in-memory item so cut list dropdowns see it
  if (isEB) {
    data.thickness = thick;
    data.width = ebWidth;
    data.length = ebLength;
    data.glue = ebGlue;
  }
  stockItems.push(data);
  if (cat) _scSet(data.id, cat);
  // Store variant/thickness (and edge banding extras) in local metadata
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  if (variant || thick || isEB) _svSet(data.id, meta);
  const supplier = document.getElementById('stock-supplier')?.value?.trim() || '';
  const reorderUrl = document.getElementById('stock-reorder-url')?.value?.trim() || '';
  if (supplier || reorderUrl) _ssSet(data.id, {supplier, url: reorderUrl});
  _toast('Stock item added', 'success');
  document.getElementById('stock-name').value = '';
  document.getElementById('stock-variant').value = '';
  document.getElementById('stock-sku').value = '';
  if (document.getElementById('stock-supplier')) document.getElementById('stock-supplier').value = '';
  if (document.getElementById('stock-reorder-url')) document.getElementById('stock-reorder-url').value = '';
  window._editingStockId = null;
  renderStockMain();
}

function editStockItem(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  window._editingStockId = id;
  const cat = _scGet(id) || 'Sheet Goods';
  document.getElementById('stock-cat').value = cat;
  stockCatChanged();
  document.getElementById('stock-name').value = item.name;
  const vd = _svGet(id);
  document.getElementById('stock-variant').value = vd.variant || '';
  document.getElementById('stock-sku').value = item.sku || '';
  if (cat === 'Edge Banding') {
    document.getElementById('stock-eb-thick').value = vd.thickness ?? item.thickness ?? '';
    document.getElementById('stock-eb-width').value = vd.width ?? item.width ?? item.h ?? '';
    document.getElementById('stock-eb-length').value = vd.length ?? item.length ?? item.w ?? '';
    document.getElementById('stock-eb-glue').value = vd.glue || item.glue || 'EVA';
    document.getElementById('stock-eb-low').value = item.low;
    document.getElementById('stock-eb-cost').value = item.cost;
  } else {
    document.getElementById('stock-thick').value = vd.thickness || '';
    document.getElementById('stock-w').value = item.w;
    document.getElementById('stock-h').value = item.h;
    document.getElementById('stock-qty').value = item.qty;
    document.getElementById('stock-low').value = item.low;
    document.getElementById('stock-cost').value = item.cost;
  }
  const sup = _ssGet(id);
  if (document.getElementById('stock-supplier')) document.getElementById('stock-supplier').value = sup.supplier || '';
  if (document.getElementById('stock-reorder-url')) document.getElementById('stock-reorder-url').value = sup.url || '';
  // Scroll sidebar to top and change button/title text
  const sidebar = document.querySelector('#panel-stock .sidebar-scroll');
  if (sidebar) sidebar.scrollTop = 0;
  document.getElementById('stock-submit-btn').textContent = 'Save Changes';
  document.getElementById('stock-cancel-btn').style.display = '';
  document.getElementById('stock-form-title').textContent = 'Edit Material';
}

async function saveStockEdit() {
  const id = window._editingStockId;
  if (!id) { addStockItem(); return; }
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const cat = document.getElementById('stock-cat').value.trim();
  const isEB = cat === 'Edge Banding';
  const variant = document.getElementById('stock-variant')?.value?.trim() || '';
  let updates, thick = 0, ebWidth = 0, ebLength = 0, ebGlue = '';
  if (isEB) {
    thick = parseFloat(document.getElementById('stock-eb-thick')?.value) || 0;
    ebWidth = parseFloat(document.getElementById('stock-eb-width')?.value) || 0;
    ebLength = parseFloat(document.getElementById('stock-eb-length')?.value) || 0;
    ebGlue = document.getElementById('stock-eb-glue')?.value || '';
    updates = {
      name: document.getElementById('stock-name').value.trim(),
      sku: document.getElementById('stock-sku').value.trim(),
      w: ebLength,
      h: ebWidth,
      qty: Math.round(ebLength),
      low: Math.round(parseFloat(document.getElementById('stock-eb-low')?.value) || 0),
      cost: parseFloat(document.getElementById('stock-eb-cost')?.value) || 0,
    };
  } else {
    thick = parseFloat(document.getElementById('stock-thick')?.value) || 0;
    updates = {
      name: document.getElementById('stock-name').value.trim(),
      sku: document.getElementById('stock-sku').value.trim(),
      w: parseFloat(document.getElementById('stock-w').value) || item.w,
      h: parseFloat(document.getElementById('stock-h').value) || item.h,
      qty: parseInt(document.getElementById('stock-qty').value) || 0,
      low: parseInt(document.getElementById('stock-low').value) || 3,
      cost: parseFloat(document.getElementById('stock-cost').value) || 0,
    };
  }
  Object.assign(item, updates);
  if (isEB) { item.thickness = thick; item.width = ebWidth; item.length = ebLength; item.glue = ebGlue; }
  else { delete item.thickness; delete item.width; delete item.length; delete item.glue; }
  if (_userId) await _db('stock_items').update(updates).eq('id', id);
  _scSet(id, cat);
  const meta = { variant, thickness: thick };
  if (isEB) { meta.width = ebWidth; meta.length = ebLength; meta.glue = ebGlue; }
  _svSet(id, meta);
  const supplier = document.getElementById('stock-supplier')?.value?.trim() || '';
  const reorderUrl = document.getElementById('stock-reorder-url')?.value?.trim() || '';
  _ssSet(id, {supplier, url: reorderUrl});
  cancelStockEdit();
  _toast('Stock item updated', 'success');
}

async function removeStock(id) {
  if (!_requireAuth()) return;
  await _db('stock_items').delete().eq('id', id);
  stockItems = stockItems.filter(s => s.id !== id);
  renderStockMain();
}

async function adjustStock(id, delta) {
  if (!_requireAuth()) return;
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const newQty = Math.max(0, item.qty + delta);
  await _db('stock_items').update({ qty: newQty }).eq('id', id);
  item.qty = newQty;
  renderStockMain();
}
async function setStockQty(id, text) {
  const qty = parseInt(String(text).replace(/[^0-9]/g,'')) || 0;
  const item = stockItems.find(s => s.id === id);
  if (!item || item.qty === qty) return;
  item.qty = Math.max(0, qty);
  if (_userId) await _db('stock_items').update({ qty: item.qty }).eq('id', id);
  renderStockMain();
}

function _updateStockBadge() {
  const badge = document.getElementById('stock-badge');
  if (!badge) return;
  const low = stockItems.filter(i => i.qty <= i.low).length;
  if (low > 0) { badge.textContent = low; badge.style.display = ''; }
  else { badge.style.display = 'none'; }
}
function renderStockMain() {
  _updateStockBadge();
  const cur = window.currency;
  const el = document.getElementById('stock-main');
  const totalSheets = stockItems.reduce((s, i) => s + i.qty, 0);
  const totalValue = stockItems.reduce((s, i) => s + i.qty * i.cost, 0);
  const lowItems = stockItems.filter(i => i.qty <= i.low).length;
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
  filtered.sort((a,b) => (a.qty<=a.low ? 0 : 1) - (b.qty<=b.low ? 0 : 1));

  const stockCardHTML = (item) => {
    const isLow = item.qty <= item.low;
    const u = window.units === 'metric' ? 'mm' : '"';
    const cat = _scGet(item.id);
    const sup = _ssGet(item.id);
    const vd = _svGet(item.id);
    const isEB = cat === 'Edge Banding';
    const sheetCat = ['Sheet Goods','Solid Timber'].includes(cat);
    let dims = '';
    let thk = '';
    let glue = '';
    if (isEB) {
      const t = vd.thickness ?? item.thickness;
      const w = vd.width ?? item.width ?? item.h;
      const l = vd.length ?? item.length ?? item.w;
      thk = t ? `${t}mm` : '';
      dims = (w && l) ? `${w}mm × ${l}m` : (w ? `${w}mm` : '');
      glue = vd.glue || item.glue || '';
    } else if (sheetCat) {
      dims = `${item.w}×${item.h}${u}`;
      thk = vd.thickness ? `${vd.thickness}mm` : '';
    } else {
      thk = vd.thickness ? `${vd.thickness}mm` : '';
    }
    const subtitle = [vd.variant, thk, item.sku !== '—' ? item.sku : '', dims, glue].filter(Boolean).join(' · ');
    const unitLabel = isEB ? 'metres' : (sheetCat ? 'sheets' : 'units');
    return `
    <div class="stock-card" style="display:flex;flex-direction:column;gap:0;padding:0;cursor:pointer;transition:box-shadow .15s${isLow?';border-color:var(--danger);border-left:3px solid var(--danger)':''}" onclick="_openStockPopup(${item.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div style="padding:10px 12px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
          <div style="font-size:13px;font-weight:700;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(item.name)}</div>
          <span class="badge ${isLow ? 'badge-red' : 'badge-green'}" style="flex-shrink:0;font-size:9px;padding:2px 6px">${isLow ? 'Low' : 'OK'}</span>
        </div>
        ${subtitle ? `<div style="font-size:10px;color:var(--muted);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(subtitle)}</div>` : ''}
        ${sup.supplier ? `<div style="font-size:10px;color:var(--text2);margin-bottom:4px">${_escHtml(sup.supplier)}${sup.url ? ' ↗' : ''}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-outline" onclick="adjustStock(${item.id},-1)" style="padding:2px 8px;font-size:14px;font-weight:700;line-height:1">−</button>
            <div style="text-align:center;min-width:32px">
              <div style="font-size:20px;font-weight:800;color:${isLow?'var(--danger)':'var(--text)'};line-height:1">${item.qty}</div>
              <div style="font-size:9px;color:var(--muted)">${unitLabel}</div>
            </div>
            <button class="btn btn-outline" onclick="adjustStock(${item.id},1)" style="padding:2px 8px;font-size:14px;font-weight:700;line-height:1">+</button>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:700;color:var(--text)">${cur}${(item.qty * item.cost).toFixed(0)}</div>
            <div style="font-size:9px;color:var(--muted)">${cur}${item.cost.toFixed(2)}/${isEB?'m':(sheetCat?'sheet':'unit')}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;border-top:1px solid var(--border2)" onclick="event.stopPropagation()">
        <button class="btn btn-outline" onclick="_openStockPopup(${item.id})" style="flex:1;border:0;border-radius:0;padding:6px;font-size:11px;border-right:1px solid var(--border2)">Edit</button>
        <button class="btn btn-outline" onclick="useStockInCutList(${item.id})" style="flex:1;border:0;border-radius:0;padding:6px;font-size:11px;border-right:1px solid var(--border2)">+ Cut List</button>
        ${sup.url ? `<a href="${_escHtml(sup.url)}" target="_blank" rel="noopener" class="btn btn-outline" style="flex:1;border:0;border-radius:0;padding:6px;font-size:11px;text-decoration:none;text-align:center;${isLow?'color:var(--accent);font-weight:700':''}">Reorder${isLow?' ↗':''}</a>` : `<button class="btn btn-outline" onclick="_openStockPopup(${item.id})" style="flex:1;border:0;border-radius:0;padding:6px;font-size:11px;opacity:.5">+ Reorder</button>`}
      </div>
    </div>`;
  };

  // When viewing "All" and categories exist, group by category
  const shouldGroup = activeCat === 'All' && usedCats.length > 0 && !q;
  let cardsHTML = '';
  if (shouldGroup) {
    const grouped = {};
    filtered.forEach(i => {
      const c = _scGet(i.id) || 'Uncategorised';
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(i);
    });
    const catOrder = [...STOCK_CATS, ...Object.keys(grouped).filter(k => !STOCK_CATS.includes(k) && k !== 'Uncategorised'), 'Uncategorised'];
    catOrder.forEach(cat => {
      if (!grouped[cat]) return;
      cardsHTML += `<div class="stock-cat-group-header">${cat} <span style="font-weight:400;color:var(--muted)">(${grouped[cat].length})</span></div>`;
      cardsHTML += grouped[cat].map(stockCardHTML).join('');
    });
  } else {
    cardsHTML = filtered.map(stockCardHTML).join('');
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
    `}
    <div class="stock-grid">${cardsHTML}</div>
  </div>`;
}

// ══════════════════════════════════════════
// CUTLIST — State & Logic
// ══════════════════════════════════════════
let sheets = [];
let pieces = [];
let results = null;
let activeSheetIdx = 0;
let activeTab = 'layout';
let pieceColorIdx = 0;
let _sheetId = 1;
let _pieceId = 1;
let _csvImportTarget = 'pieces';
let layoutZoom = parseFloat(localStorage.getItem('pc_zoom')) || 1.0;
let layoutColor = true;
let layoutGrain = true;
let layoutFontScale = parseFloat(localStorage.getItem('pc_font_scale')) || 1.0;
let layoutCutOrder = localStorage.getItem('pc_cut_order') === '1';
let layoutSheetCutList = localStorage.getItem('pc_sheet_cutlist') === '1';
let colsVisible = { grain: false, material: false, label: true, notes: false, edgeband: false };
let edgeBands = [];
let _edgeBandId = 1;
let layoutRotate = false;
let clShowSummary = localStorage.getItem('pc_show_summary') === '1';
let clShowCutList = clShowSummary;  // cut list is part of the Summary tile
let _dragSrc = null, _dragTable = null;

const COLORS = [
  '#4a90d9','#d4763b','#4caf50','#9c27b0','#e53935',
  '#00acc1','#f9a825','#7cb342','#5c6bc0','#e91e63',
  '#00897b','#f57c00','#6d4c41','#546e7a','#7b1fa2',
  '#1e88e5','#43a047','#fdd835','#8e24aa','#039be5',
];

// ── GRAIN ICONS ──
const GRAIN_ICONS = {
  // none: faint equal lines — no constraint
  'none': `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.25"><line x1="1" y1="2.5" x2="13" y2="2.5"/><line x1="1" y1="6" x2="13" y2="6"/><line x1="1" y1="9.5" x2="13" y2="9.5"/></svg>`,
  // h: horizontal lines — grain runs the length of the board
  'h':    `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="0" y1="2.5" x2="14" y2="2.5"/><line x1="0" y1="6" x2="14" y2="6"/><line x1="0" y1="9.5" x2="14" y2="9.5"/></svg>`,
  // v: vertical lines — cross grain
  'v':    `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="2" y1="0" x2="2" y2="12"/><line x1="5.5" y1="0" x2="5.5" y2="12"/><line x1="9" y1="0" x2="9" y2="12"/><line x1="12.5" y1="0" x2="12.5" y2="12"/></svg>`,
};
const EYE_ON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const DEL_SVG = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;

function grainIcon(g) { return GRAIN_ICONS[g] || GRAIN_ICONS['none']; }

function _trimmedDims(p) {
  const e = p.edges || {};
  const thk = side => {
    const s = e[side];
    if (!s || !s.trim) return 0;
    const mat = edgeBands.find(x => x.id === s.id);
    return mat ? (mat.thickness || 0) : 0;
  };
  return { w: p.w - thk('W2') - thk('W4'), h: p.h - thk('L1') - thk('L3') };
}

// ── VALUE PARSER (fractions + math) ──
function parseVal(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim();
  if (!str) return 0;
  const mixed = str.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
  const frac = str.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
  const safe = str.replace(/[^0-9+\-*/.() ]/g, '');
  try { const v = Function('"use strict";return(' + safe + ')')(); if (isFinite(v)) return v; } catch(e) {}
  return parseFloat(str) || 0;
}

// ── CYCLE GRAIN ──
function cycleGrain(id, type) {
  const arr = type === 'sheet' ? sheets : pieces;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  item.grain = item.grain === 'none' ? 'h' : item.grain === 'h' ? 'v' : 'none';
  type === 'sheet' ? renderSheets() : renderPieces();
  if (results) optimize();
}

// ── TOGGLE ENABLE ──
function toggleSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (s) { s.enabled = s.enabled === false ? true : false; renderSheets(); }
}
let _lastToggleIdx = -1;
function _clCheckboxClick(id, idx, checked, ev) {
  if (ev && ev.shiftKey && _lastToggleIdx >= 0) {
    const from = Math.min(_lastToggleIdx, idx);
    const to = Math.max(_lastToggleIdx, idx);
    for (let i = from; i <= to; i++) pieces[i].enabled = checked;
  } else {
    pieces[idx].enabled = checked;
  }
  _lastToggleIdx = idx;
  renderPieces();
  _saveCutList();
}
function togglePiece(id) {
  const p = pieces.find(x => x.id === id);
  if (p) { p.enabled = !(p.enabled !== false); renderPieces(); _saveCutList(); }
}
function _clToggleAll(checked) {
  pieces.forEach(p => p.enabled = checked);
  renderPieces();
}

// ── STEP QTY ──
function stepQty(type, id, delta) {
  const arr = type === 'sheet' ? sheets : pieces;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  const max = type === 'sheet' ? 99 : 999;
  item.qty = Math.max(1, Math.min(max, (item.qty || 1) + delta));
  type === 'sheet' ? renderSheets() : renderPieces();
}

// ── COLUMN TOGGLE ──
function initColVisibility() {
  ['grain','material','notes','label','edgeband'].forEach(col => {
    const on = colsVisible[col];
    document.querySelectorAll('.cl-col-' + col).forEach(el => { el.style.display = on ? '' : 'none'; });
    const pill = document.getElementById('pill-' + col);
    if (pill) pill.classList.toggle('active', on);
  });
  const ebSec = document.getElementById('cl-edgeband-section');
  if (ebSec) ebSec.style.display = colsVisible.edgeband ? '' : 'none';
}
function toggleCol(col) {
  colsVisible[col] = !colsVisible[col];
  _saveCutList();
  const pill = document.getElementById('pill-' + col);
  if (pill) pill.classList.toggle('active', colsVisible[col]);
  document.querySelectorAll('.cl-col-' + col).forEach(el => {
    el.style.display = colsVisible[col] ? '' : 'none';
  });
}
function toggleGrainCol() {
  const turning_on = !colsVisible.grain;
  if (turning_on) {
    pieces.forEach(p => { if (!p.grain || p.grain === 'none') p.grain = 'h'; });
    sheets.forEach(s => { if (!s.grain || s.grain === 'none') s.grain = 'h'; });
  } else {
    pieces.forEach(p => { p.grain = 'none'; });
    sheets.forEach(s => { s.grain = 'none'; });
  }
  colsVisible.grain = turning_on;
  _saveCutList();
  renderPieces();
  renderSheets();
  const pill = document.getElementById('pill-grain');
  if (pill) pill.classList.toggle('active', turning_on);
  document.querySelectorAll('.cl-col-grain').forEach(el => {
    el.style.display = turning_on ? '' : 'none';
  });
  renderResults();
}

function toggleEdgeBandCol() {
  const turning_on = !colsVisible.edgeband;
  colsVisible.edgeband = turning_on;
  _saveCutList();
  const pill = document.getElementById('pill-edgeband');
  if (pill) pill.classList.toggle('active', turning_on);
  document.querySelectorAll('.cl-col-edgeband').forEach(el => {
    el.style.display = turning_on ? '' : 'none';
  });
  const section = document.getElementById('cl-edgeband-section');
  if (section) section.style.display = turning_on ? '' : 'none';
}

function hasAnyEdge(p) {
  const e = p.edges || {};
  return !!(e.L1 || e.W2 || e.L3 || e.W4);
}

function _ebIcon(p) {
  const e = p.edges || {};
  const c = side => {
    const s = e[side];
    if (!s) return null;
    const mat = edgeBands.find(x => x.id === s.id);
    return mat ? mat.color : null;
  };
  const seg = (x1,y1,x2,y2,col) => col
    ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`
    : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.25"/>`;
  return `<svg width="16" height="12" viewBox="0 0 16 12" fill="none">
    ${seg(1,1,15,1,c('L1'))}${seg(15,1,15,11,c('W2'))}${seg(15,11,1,11,c('L3'))}${seg(1,11,1,1,c('W4'))}
  </svg>`;
}

function renderEdgeBands() {
  const tbody = document.getElementById('edgebands-body');
  if (!tbody) return;
  if (!edgeBands.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--muted);font-size:11px;padding:8px 14px;text-align:center">No edge bands — click "+ Add edge band"</td></tr>`;
    return;
  }
  tbody.innerHTML = edgeBands.map(eb => `<tr>
    <td class="cl-del-cell" style="padding:0 2px;width:14px"></td>
    <td class="cl-del-cell">
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${eb.color};flex-shrink:0"></span>
    </td>
    <td style="padding:2px 4px">
      <input class="cl-input" value="${_escHtml(eb.name)}"
        style="font-size:12px;width:100%;border:0;background:transparent;box-shadow:none"
        onblur="updateEdgeBand(${eb.id},'name',this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"
        ${eb.glue?`title="Glue: ${_escHtml(eb.glue)}"`:''}>
    </td>
    <td></td>
    <td></td>
    <td>
      <div class="cl-stepper">
        <button class="cl-step-btn" onclick="stepEbLength(${eb.id},-10)">−</button>
        <input class="cl-input cl-qty-input" value="${(eb.length||0)}" inputmode="decimal"
          style="border:0;background:transparent;box-shadow:none"
          onblur="updateEbLength(${eb.id},this.value)"
          onkeydown="if(event.key==='Enter')this.blur()">
        <button class="cl-step-btn" onclick="stepEbLength(${eb.id},10)">+</button>
      </div>
    </td>
    <td class="cl-col-grain" style="${colsVisible.grain?'':'display:none'}"></td>
    <td style="text-align:center">
      <input class="cl-input cl-dim-input" value="${eb.thickness||''}" inputmode="decimal"
        style="width:32px;text-align:center;padding:2px 2px;border:0;background:transparent;box-shadow:none"
        onblur="updateEdgeBand(${eb.id},'thickness',parseFloat(this.value)||0)"
        onkeydown="if(event.key==='Enter')this.blur()"
        placeholder="0">
    </td>
    <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}"></td>
    <td class="cl-col-notes" style="${colsVisible.notes?'':'display:none'}"></td>
    <td class="cl-del-cell" style="padding:2px 4px;text-align:right">
      <button class="cl-del-btn" onclick="removeEdgeBand(${eb.id})" title="Remove">${DEL_SVG}</button>
    </td>
  </tr>`).join('');
}

function stepEbLength(id, delta) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb.length = Math.max(0, (eb.length || 0) + delta);
  renderEdgeBands();
  _saveCutList();
}

function updateEbLength(id, text) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb.length = Math.max(0, parseFloat(text) || 0);
  renderEdgeBands();
  _saveCutList();
}

function addEdgeBand(name, thickness, width, color, length, glue) {
  const eb = {
    id: _edgeBandId++,
    name: name || 'Edge Band',
    color: color || COLORS[pieceColorIdx++ % COLORS.length],
    thickness: thickness || 0,
    width: width || 0,
    length: length || 0,
    glue: glue || '',
  };
  edgeBands.push(eb);
  renderEdgeBands();
  renderPieces();
  _saveCutList();
  return eb;
}

function updateEdgeBand(id, field, val) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb[field] = val;
  renderEdgeBands();
  renderPieces();
  _saveCutList();
}

function removeEdgeBand(id) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  _confirm(`Remove edge band <strong>${_escHtml(eb.name)}</strong>?`, () => {
    edgeBands = edgeBands.filter(x => x.id !== id);
    pieces.forEach(p => {
      const e = p.edges || {};
      ['L1','W2','L3','W4'].forEach(side => {
        if (e[side] && e[side].id === id) e[side] = null;
      });
    });
    renderEdgeBands();
    renderPieces();
    _saveCutList();
  });
}

function openEdgePopup(pieceId) {
  const p = pieces.find(x => x.id === pieceId);
  if (!p) return;
  // Work with a mutable copy of edges
  const draft = {
    L1: p.edges && p.edges.L1 ? {...p.edges.L1} : null,
    W2: p.edges && p.edges.W2 ? {...p.edges.W2} : null,
    L3: p.edges && p.edges.L3 ? {...p.edges.L3} : null,
    W4: p.edges && p.edges.W4 ? {...p.edges.W4} : null,
  };

  const accent = '#c9962b';
  // Panel SVG dimensions
  const maxW = 190, maxH = 230, svgPad = 38;
  const aspect = p.w / p.h;
  let rw, rh;
  if (aspect >= 1) { rw = maxW; rh = Math.round(maxW / aspect); }
  else { rh = maxH; rw = Math.round(maxH * aspect); }
  const svgW = rw + svgPad*2, svgH = rh + svgPad*2;
  const rx = svgPad, ry = svgPad;
  const pColor = toPastel ? toPastel(p.color) : '#e8f0fe';

  function buildSVG(ed) {
    const thk = side => {
      const s = ed[side];
      if (!s || !s.trim) return 0;
      const mat = edgeBands.find(x => x.id === s.id);
      return mat ? (mat.thickness || 0) : 0;
    };
    const cutW = p.w - thk('W2') - thk('W4');
    const cutH = p.h - thk('L1') - thk('L3');
    const pw = p.w, ph = p.h;

    // Grain lines
    let grainLines = '';
    if (p.grain !== 'none') {
      const gdir = p.grain;
      const sp = 10;
      grainLines = `<clipPath id="pgclip"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"/></clipPath><g clip-path="url(#pgclip)" stroke="${p.color}" stroke-width="0.5" opacity="0.4">`;
      if (gdir === 'h') {
        for (let y2 = ry+sp; y2 < ry+rh; y2 += sp) grainLines += `<line x1="${rx}" y1="${y2}" x2="${rx+rw}" y2="${y2}"/>`;
      } else {
        for (let x2 = rx+sp; x2 < rx+rw; x2 += sp) grainLines += `<line x1="${x2}" y1="${ry}" x2="${x2}" y2="${ry+rh}"/>`;
      }
      grainLines += '</g>';
    }

    // Dashed edge band lines (inset 5px, corner-aware)
    const inset = 5;
    let edgeLines = '';
    const sides2 = [
      {side:'L1', x1:rx+inset, y1:ry+inset, x2:rx+rw-inset, y2:ry+inset},
      {side:'W2', x1:rx+rw-inset, y1:ry+inset, x2:rx+rw-inset, y2:ry+rh-inset},
      {side:'L3', x1:rx+rw-inset, y1:ry+rh-inset, x2:rx+inset, y2:ry+rh-inset},
      {side:'W4', x1:rx+inset, y1:ry+rh-inset, x2:rx+inset, y2:ry+inset},
    ];
    sides2.forEach(({side, x1, y1, x2, y2}) => {
      const s = ed[side]; if (!s) return;
      const mat = edgeBands.find(x => x.id === s.id); if (!mat) return;
      edgeLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${mat.color}" stroke-width="2.5" stroke-dasharray="4,3" stroke-linecap="round"/>`;
    });

    // Dim labels (cut dims, gold when trimmed)
    const fmtDim = (cut, fin, lbl) => {
      const trimmed = cut !== fin;
      const numColor = trimmed ? accent : '#888';
      const numWeight = trimmed ? '700' : '400';
      return `<tspan fill="${numColor}" font-weight="${numWeight}">${cut}</tspan><tspan fill="#aaa"> [${lbl}]</tspan>`;
    };

    const dimLabels = `
      <text x="${rx+rw/2}" y="${ry-9}" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutW,pw,'L1')}</text>
      <text x="${rx+rw/2}" y="${ry+rh+18}" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutW,pw,'L3')}</text>
      <text transform="translate(${rx+rw+18},${ry+rh/2}) rotate(90)" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutH,ph,'W2')}</text>
      <text transform="translate(${rx-9},${ry+rh/2}) rotate(-90)" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutH,ph,'W4')}</text>
    `;

    return `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${pColor}" stroke="${p.color}" stroke-width="1"/>
      ${grainLines}${edgeLines}${dimLabels}
    </svg>`;
  }

  function buildTable(ed) {
    const thk = side => {
      const s = ed[side];
      if (!s || !s.trim) return 0;
      const mat = edgeBands.find(x => x.id === s.id);
      return mat ? (mat.thickness || 0) : 0;
    };
    const cutW = p.w - thk('W2') - thk('W4');
    const cutH = p.h - thk('L1') - thk('L3');
    const tapeDim = {L1:cutW, W2:cutH, L3:cutW, W4:cutH};
    const finDim  = {L1:p.w,  W2:p.h,  L3:p.w,  W4:p.h};
    const accent2 = '#c9962b';

    const ebOpts = `<option value="">— None —</option>` + edgeBands.map(eb =>
      `<option value="${eb.id}">${_escHtml(eb.name)}</option>`
    ).join('');

    return ['L1','W2','L3','W4'].map(side => {
      const s = ed[side];
      const selId = s ? s.id : '';
      const mat = selId ? edgeBands.find(x => x.id === selId) : null;
      const borderStyle = mat ? `border-left:3px solid ${mat.color}` : '';
      const trim = s ? s.trim : false;
      const fin = finDim[side], cut = tapeDim[side];
      const tapeStr = cut !== fin
        ? `${fin} → <span style="color:${accent2};font-weight:600">${cut}</span>mm`
        : `${fin}mm`;
      return `<tr>
        <td style="padding:5px 8px;font-size:12px;font-weight:600;color:var(--text)">${side}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--muted)">${tapeStr}</td>
        <td style="padding:3px 4px">
          <select class="cl-input" style="font-size:11px;padding:3px 4px;${borderStyle};border-radius:3px"
            onchange="_ebUpdateSide('${side}',this.value,'${pieceId}')">
            ${ebOpts.replace(`value="${selId}"`,`value="${selId}" selected`)}
          </select>
        </td>
        <td style="padding:3px 8px;white-space:nowrap">
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
            <input type="checkbox" ${trim?'checked':''} ${!s?'disabled':''} onchange="_ebUpdateTrim('${side}',this.checked,'${pieceId}')"> Trim
          </label>
        </td>
      </tr>`;
    }).join('');
  }

  const html = `
    <div class="popup-header">
      <div class="popup-title">Edge Banding — ${_escHtml(p.label)}</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding-bottom:8px">
      <div id="_eb_svg_wrap" style="margin-top:4px">${buildSVG(draft)}</div>
      <table style="width:100%;border-collapse:collapse" id="_eb_table">
        <thead><tr style="font-size:11px;color:var(--muted)">
          <th style="text-align:left;padding:3px 8px">Side</th>
          <th style="text-align:left;padding:3px 8px">Tape</th>
          <th style="text-align:left;padding:3px 4px">Edge Band</th>
          <th style="padding:3px 8px"></th>
        </tr></thead>
        <tbody id="_eb_tbody">${buildTable(draft)}</tbody>
      </table>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_ebSave(${pieceId})">Save</button>
    </div>`;

  // Store draft on window for live updates
  window._ebDraft = draft;
  window._ebPieceId = pieceId;
  window._ebBuildSVG = buildSVG;
  window._ebBuildTable = buildTable;
  _openPopup(html, 'md');
}

function _ebUpdateSide(side, val, pieceId) {
  const d = window._ebDraft;
  if (!d) return;
  const id = val ? parseInt(val) : null;
  if (id) {
    d[side] = { id, trim: d[side] ? d[side].trim : false };
  } else {
    d[side] = null;
  }
  // Refresh SVG and table
  const sw = document.getElementById('_eb_svg_wrap');
  if (sw && window._ebBuildSVG) sw.innerHTML = window._ebBuildSVG(d);
  const tb = document.getElementById('_eb_tbody');
  if (tb && window._ebBuildTable) tb.innerHTML = window._ebBuildTable(d);
}

function _ebUpdateTrim(side, checked, pieceId) {
  const d = window._ebDraft;
  if (!d || !d[side]) return;
  d[side].trim = checked;
  const sw = document.getElementById('_eb_svg_wrap');
  if (sw && window._ebBuildSVG) sw.innerHTML = window._ebBuildSVG(d);
  const tb = document.getElementById('_eb_tbody');
  if (tb && window._ebBuildTable) tb.innerHTML = window._ebBuildTable(d);
}

function _ebSave(pieceId) {
  const p = pieces.find(x => x.id === pieceId);
  if (!p || !window._ebDraft) return;
  p.edges = { ...window._ebDraft };
  _closePopup();
  renderPieces();
  _saveCutList();
}

function _openNewEdgeBandMaterialPopup() {
  const h = `
    <div class="popup-header">
      <div class="popup-title">New Edge Band Material</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body">
      <div class="pf"><label>Name</label><input type="text" id="eb-new-name" class="form-control" placeholder="e.g. PVC 1mm White" value=""></div>
      <div style="display:flex;gap:12px">
        <div class="pf" style="flex:1"><label>Thickness (mm)</label><input type="number" id="eb-new-thickness" class="form-control" placeholder="e.g. 1" min="0" step="0.1"></div>
        <div class="pf" style="flex:1"><label>Width (mm)</label><input type="number" id="eb-new-width" class="form-control" placeholder="e.g. 22" min="0"></div>
        <div class="pf" style="flex:1"><label>Length (m)</label><input type="number" id="eb-new-length" class="form-control" placeholder="e.g. 50" min="0" step="0.1"></div>
      </div>
      <div class="pf">
        <label>Glue Type</label>
        <select id="eb-new-glue" class="form-control">
          <option value="EVA" selected>EVA</option>
          <option value="PUR">PUR</option>
          <option value="Laser">Laser</option>
          <option value="Hot Melt">Hot Melt</option>
          <option value="Pre-glued">Pre-glued</option>
          <option value="None">None</option>
        </select>
      </div>
      <div class="pf">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="eb-new-save-stock"> Save to Stock Library
        </label>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewEdgeBandMaterial()">Add Edge Band</button>
    </div>`;
  _openPopup(h, 'sm');
  setTimeout(() => {
    document.getElementById('eb-new-name') && document.getElementById('eb-new-name').focus();
  }, 50);
}

function _saveNewEdgeBandMaterial() {
  const name = (_popupVal('eb-new-name') || '').trim();
  if (!name) { _toast('Please enter a name', 'error'); return; }
  const thickness = parseFloat(document.getElementById('eb-new-thickness')?.value) || 0;
  const width = parseFloat(document.getElementById('eb-new-width')?.value) || 0;
  const length = parseFloat(document.getElementById('eb-new-length')?.value) || 0;
  const glue = document.getElementById('eb-new-glue')?.value || '';
  const saveStock = document.getElementById('eb-new-save-stock')?.checked;

  const eb = addEdgeBand(name, thickness, width, null, length, glue);
  _closePopup();

  if (saveStock && window.stockItems) {
    const id = Date.now();
    window.stockItems.push({
      id,
      name,
      w: length,
      h: width,
      qty: Math.round(length),
      low: 0,
      cost: 0,
      thickness,
      width,
      length,
      glue,
    });
    _scSet(id, 'Edge Banding');
    _svSet(id, { variant: '', thickness, width, length, glue });
    if (window._saveStock) window._saveStock();
    else if (window.saveStockItems) window.saveStockItems();
  }
  _toast(`Added ${name}`, 'success');
}

function _clSaveProject() {
  // If there's a live project already loaded, save silently
  // Otherwise open the save dialog
  const liveId = window._currentProjectId || null;
  if (liveId) {
    // save silently
    if (window.saveCurrentProject) window.saveCurrentProject();
    else _toast('Project saved', 'success');
  } else {
    _openSaveProjectPopup();
  }
}

function _openSaveProjectPopup() {
  const defaultName = pieces.length > 0 ? (pieces[0].label.split(' ')[0] + ' Build') : '';
  const h = `
    <div class="popup-header">
      <div class="popup-title">Save Project</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label>Project Name</label>
        <input type="text" id="save-proj-name" class="form-control" placeholder="e.g. Kitchen Cabinet Build" value="${_escHtml(defaultName)}">
      </div>
      <div class="pf">
        <label>Client</label>
        <div class="smart-input-wrap">
          <input type="text" id="save-proj-client" placeholder="Search or add client..." autocomplete="off"
            oninput="_smartClientSuggest(this,'save-proj-client-suggest')"
            onfocus="_smartClientSuggest(this,'save-proj-client-suggest')"
            onblur="setTimeout(()=>document.getElementById('save-proj-client-suggest').style.display='none',150)">
          <div class="smart-input-add" onclick="_openNewClientPopup('save-proj-client')" title="Add new client">+</div>
        </div>
        <div id="save-proj-client-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      <div class="pf">
        <label>Notes</label>
        <textarea id="save-proj-notes" placeholder="Optional notes..." style="width:100%;height:56px;font-size:13px;resize:none;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--input-bg,#fff);color:var(--text)"></textarea>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_doSaveProject()">Save Project</button>
    </div>`;
  _openPopup(h, 'sm');
  setTimeout(() => document.getElementById('save-proj-name')?.focus(), 50);
}

function _doSaveProject() {
  const name = (_popupVal('save-proj-name') || '').trim();
  if (!name) { _toast('Please enter a project name', 'error'); return; }
  _closePopup();
  _toast(`Project "${name}" saved`, 'success');
}

// ── DRAG REORDER ──
function onDragStart(e, table, idx) {
  _dragSrc = idx; _dragTable = table;
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e, row) {
  e.preventDefault();
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  row.classList.add('cl-drag-over');
}
function onDrop(e, table, idx) {
  e.preventDefault();
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  if (_dragTable !== table || _dragSrc === null || _dragSrc === idx) return;
  const arr = table === 'pieces' ? pieces : sheets;
  const [item] = arr.splice(_dragSrc, 1);
  arr.splice(idx, 0, item);
  _dragSrc = null;
  table === 'pieces' ? renderPieces() : renderSheets();
}
function onDragEnd() {
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
}

function clearCutList() {
  _confirm('Clear all parts and panels? This cannot be undone.', () => _doClearAll()); return;
}
function _doClearAll() {
  pieces = []; sheets = []; _pieceId = 1; _sheetId = 1; pieceColorIdx = 0; results = null;
  ['pc_cl_pieces','pc_cl_sheets','pc_cl_pid','pc_cl_sid','pc_cl_colorIdx','pc_cl_sheetColorIdx'].forEach(k => localStorage.removeItem(k));
  renderPieces(); renderSheets();
  document.getElementById('results-area').innerHTML = '<div class="empty-state"><div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div><h3>Ready to Optimize</h3><p>Add stock panels and cut pieces, then click "Optimize Cut Layout"</p></div>';
}

// ── PANEL RESIZE ──
(function() {
  document.addEventListener('DOMContentLoaded', () => {});
  const init = () => {
    const handle = document.getElementById('cl-resize-handle');
    const left   = document.querySelector('.cl-left');
    if (!handle || !left) return;
    let dragging = false, startX, startW;
    handle.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = left.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cssText += 'cursor:col-resize!important;user-select:none';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      left.style.width = Math.max(260, Math.min(680, startW + e.clientX - startX)) + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false; handle.classList.remove('dragging');
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ── SHEETS ──
function addSheet(name, w, h, qty) {
  const m = window.units === 'metric';
  sheets.push({
    id:      _sheetId++,
    name:    name !== undefined ? name : (m ? '18mm Plywood' : '3/4" Plywood'),
    w:       w    !== undefined ? w    : (m ? 2440 : 96),
    h:       h    !== undefined ? h    : (m ? 1220 : 48),
    qty:     qty  !== undefined ? qty  : 1,
    grain:   'none',
    kerf:    m ? 3 : 0.125,
    enabled: true,
    color:   COLORS[pieceColorIdx++ % COLORS.length],
  });
  renderSheets();
  renderPieces(); // refresh material dropdowns
}

function removeSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (!s) return;
  _confirm(`Delete panel <strong>${_escHtml(s.name || 'Untitled')}</strong>?`, () => {
    sheets = sheets.filter(x => x.id !== id);
    renderSheets();
    renderPieces();
    _saveCutList();
  });
}

function duplicateSheet(id) {
  const s = sheets.find(s => s.id === id);
  if (!s) return;
  const idx = sheets.indexOf(s);
  const copy = { ...s, id: _sheetId++, name: s.name + ' (copy)', color: COLORS[pieceColorIdx++ % COLORS.length] };
  sheets.splice(idx + 1, 0, copy);
  renderSheets();
  renderPieces();
}

function updateSheet(id, field, val) {
  const s = sheets.find(s => s.id === id);
  if (!s) return;
  if (field === 'w' || field === 'h') { const v = parseVal(val); s[field] = v; }
  else if (field === 'qty') s[field] = Math.max(1, parseInt(val) || 1);
  else s[field] = val;
  renderSheets();
  renderPieces();
}

const DRAG_HANDLE = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>`;

function renderSheets() {
  const tbody = document.getElementById('sheets-body');
  if (!tbody) return;
  if (!sheets.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="color:var(--muted);font-size:11px;padding:10px 14px;text-align:center">No panels — click "+ Add panel"</td></tr>`;
    return;
  }
  tbody.innerHTML = sheets.map((s, i) => {
    const dis = s.enabled === false;
    return `<tr class="${dis ? 'cl-row-disabled' : ''}"
      draggable="true"
      ondragstart="onDragStart(event,'sheets',${i})"
      ondragover="onDragOver(event,this)"
      ondrop="onDrop(event,'sheets',${i})"
      ondragend="onDragEnd()">
      <td class="cl-del-cell" style="padding:0 2px;width:14px">
        <span class="cl-drag-handle" title="Drag to reorder">${DRAG_HANDLE}</span>
      </td>
      <td class="cl-del-cell">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.color || 'var(--muted)'};flex-shrink:0"></span>
      </td>
      <td><input class="cl-input" value="${s.name.replace(/"/g,'&quot;')}"
        data-table="sheets" data-row="${i}" data-col="name"
        onblur="updateSheet(${s.id},'name',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'name')"
        ${dis ? 'disabled' : ''} placeholder="Material"></td>
      <td><input class="cl-input cl-dim-input" value="${s.w}"
        data-table="sheets" data-row="${i}" data-col="w"
        onblur="updateSheet(${s.id},'w',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'w')"
        ${dis ? 'disabled' : ''}></td>
      <td><input class="cl-input cl-dim-input" value="${s.h}"
        data-table="sheets" data-row="${i}" data-col="h"
        onblur="updateSheet(${s.id},'h',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'h')"
        ${dis ? 'disabled' : ''}></td>
      <td>
        <div class="cl-stepper">
          <button class="cl-step-btn" onclick="stepQty('sheet',${s.id},-1)">−</button>
          <input class="cl-input cl-qty-input" value="${s.qty}"
            data-table="sheets" data-row="${i}" data-col="qty"
            onblur="updateSheet(${s.id},'qty',this.value)"
            onkeydown="clKeydown(event,'sheets',${i},'qty')"
            min="1" max="99" ${dis ? 'disabled' : ''}>
          <button class="cl-step-btn" onclick="stepQty('sheet',${s.id},1)">+</button>
        </div>
      </td>
      <td class="cl-grain-cell cl-col-grain" style="${colsVisible.grain?'':'display:none'}">
        <button class="cl-grain-btn${s.grain !== 'none' ? ' active' : ''}"
          onclick="cycleGrain(${s.id},'sheet')" title="Grain: ${s.grain}">${grainIcon(s.grain)}</button>
      </td>
      <td style="padding:0 4px;text-align:center">
        <input class="cl-input cl-dim-input" value="${s.kerf ?? (window.units==='metric'?3:0.125)}"
          style="width:32px;text-align:center;padding:2px 2px;border:0;background:transparent;box-shadow:none" inputmode="decimal"
          onblur="updateSheet(${s.id},'kerf',parseFloat(this.value)||0)"
          onkeydown="if(event.key==='Enter')this.blur()"
          ${dis ? 'disabled' : ''} placeholder="0">
      </td>
      <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}"></td>
      <td class="cl-col-notes" style="${colsVisible.notes?'':'display:none'}"></td>
      <td class="cl-del-cell" style="white-space:nowrap">
        <button class="cl-del-btn" onclick="duplicateSheet(${s.id})" title="Duplicate sheet" style="opacity:.6;margin-right:2px">⧉</button>
        <button class="cl-del-btn" onclick="removeSheet(${s.id})" title="Remove">${DEL_SVG}</button>
      </td>
    </tr>`;
  }).join('');
  _saveCutList();
}

// ── CUT LIST PERSISTENCE ──
function _saveCutList() {
  try {
    localStorage.setItem('pc_cl_pieces', JSON.stringify(pieces));
    localStorage.setItem('pc_cl_sheets', JSON.stringify(sheets));
    localStorage.setItem('pc_cl_pid', _pieceId);
    localStorage.setItem('pc_cl_sid', _sheetId);
    localStorage.setItem('pc_cl_colorIdx', pieceColorIdx);
    localStorage.setItem('pc_cl_edgebands', JSON.stringify(edgeBands));
    localStorage.setItem('pc_cl_ebid', _edgeBandId);
    localStorage.setItem('pc_cl_colsVisible', JSON.stringify(colsVisible));
  } catch(e) {}
}

function _loadCutList() {
  try {
    const p = localStorage.getItem('pc_cl_pieces');
    const s = localStorage.getItem('pc_cl_sheets');
    const eb = localStorage.getItem('pc_cl_edgebands');
    if (eb) { edgeBands = JSON.parse(eb); const ids = edgeBands.map(x=>x.id); _edgeBandId = ids.length ? Math.max(...ids)+1 : 1; }
    if (p) {
      pieces = JSON.parse(p);
      pieces.forEach(x => {
        if (typeof x.id === 'string') x.id = parseInt(String(x.id).replace(/\D/g, '')) || 0;
        if (x.notes === undefined) x.notes = '';
        if (!x.edges && x.edgeBand) {
          const firstId = edgeBands.length ? edgeBands[0].id : null;
          const sides = {L1:null,W2:null,L3:null,W4:null};
          if (x.edgeBand === 'L' || x.edgeBand === 'LW' || x.edgeBand === 'all') { sides.L1 = firstId ? {id:firstId,trim:false} : null; sides.L3 = firstId ? {id:firstId,trim:false} : null; }
          if (x.edgeBand === 'W' || x.edgeBand === 'LW' || x.edgeBand === 'all') { sides.W2 = firstId ? {id:firstId,trim:false} : null; sides.W4 = firstId ? {id:firstId,trim:false} : null; }
          x.edges = sides;
          delete x.edgeBand;
        }
        if (!x.edges) x.edges = {L1:null,W2:null,L3:null,W4:null};
      });
      const usedPids = pieces.map(x => x.id).filter(n => Number.isFinite(n));
      if (usedPids.length) _pieceId = Math.max(_pieceId, Math.max(...usedPids) + 1);
    }
    if (s) {
      sheets = JSON.parse(s);
      sheets.forEach(x => {
        if (typeof x.id === 'string') x.id = parseInt(String(x.id).replace(/\D/g, '')) || 0;
        if (x.kerf === undefined) x.kerf = (window.units === 'metric' ? 3 : 0.125);
        if (!x.color) x.color = COLORS[pieceColorIdx++ % COLORS.length];
      });
      const usedSids = sheets.map(x => x.id).filter(n => Number.isFinite(n));
      if (usedSids.length) _sheetId = Math.max(_sheetId, Math.max(...usedSids) + 1);
    }
    const pid = localStorage.getItem('pc_cl_pid'); if (pid) _pieceId = parseInt(pid);
    const sid = localStorage.getItem('pc_cl_sid'); if (sid) _sheetId = parseInt(sid);
    const ci  = localStorage.getItem('pc_cl_colorIdx'); if (ci) pieceColorIdx = parseInt(ci);
    const ebid = localStorage.getItem('pc_cl_ebid'); if (ebid) _edgeBandId = parseInt(ebid);
    const cv = localStorage.getItem('pc_cl_colsVisible');
    if (cv) { try { Object.assign(colsVisible, JSON.parse(cv)); } catch(e) {} }
    // Sync grain data with column visibility — clear stale grain values if column is hidden
    if (!colsVisible.grain) {
      pieces.forEach(p => { p.grain = 'none'; });
      sheets.forEach(s => { s.grain = 'none'; });
    }
  } catch(e) {}
}

// ── PIECES ──
function addPiece(label, w, h, qty, grain) {
  const m = window.units === 'metric';
  const color = COLORS[pieceColorIdx++ % COLORS.length];
  const prevMat = pieces.length > 0 ? (pieces[pieces.length-1].material || '') : '';
  pieces.push({
    id:       _pieceId++,
    label:    label !== undefined ? label : `Part ${pieces.length + 1}`,
    w:        w     !== undefined ? w     : (m ? 300 : 12),
    h:        h     !== undefined ? h     : (m ? 600 : 24),
    qty:      qty   !== undefined ? qty   : 1,
    grain:    (grain !== undefined && grain !== false) ? grain : 'none',
    material: prevMat,
    notes:    '',
    enabled:  true,
    color,
    edges:    {L1:null,W2:null,L3:null,W4:null},
  });
  renderPieces();
}

function removePiece(id) {
  const p = pieces.find(x => x.id === id);
  if (!p) return;
  _confirm(`Delete part <strong>${_escHtml(p.label || 'Untitled')}</strong>?`, () => {
    pieces = pieces.filter(x => x.id !== id);
    renderPieces();
    _saveCutList();
  });
}

function duplicatePiece(id) {
  const p = pieces.find(p => p.id === id);
  if (!p) return;
  const idx = pieces.indexOf(p);
  // Sequential copy naming: "Side Panel" → "Side Panel 2" → "Side Panel 3" …
  // Strip any trailing " N" from the source to get the base, then pick the next
  // number not already used among pieces sharing that base.
  const srcLabel = p.label || '';
  const m = srcLabel.match(/^(.*?)\s+(\d+)$/);
  const base = m ? m[1] : srcLabel;
  let maxN = 1;
  for (const q of pieces) {
    if (!q.label) continue;
    if (q.label === base) continue;  // "base" alone counts as N=1 (implicit)
    const qm = q.label.match(/^(.*?)\s+(\d+)$/);
    if (qm && qm[1] === base) {
      const n = parseInt(qm[2], 10);
      if (n > maxN) maxN = n;
    }
  }
  const copy = { ...p, id: _pieceId++, label: `${base} ${maxN + 1}`, color: COLORS[pieceColorIdx++ % COLORS.length] };
  pieces.splice(idx + 1, 0, copy);
  renderPieces();
}

function updatePiece(id, field, val) {
  const p = pieces.find(p => p.id === id);
  if (!p) return;
  if (field === 'w' || field === 'h') { const v = parseVal(val); p[field] = v; }
  else if (field === 'qty') p[field] = Math.max(1, parseInt(val) || 1);
  else p[field] = val;
  renderPieces();
}

function renderPieces() {
  const tbody = document.getElementById('pieces-body');
  if (!tbody) return;
  if (!pieces.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--muted);font-size:11px;padding:10px 14px;text-align:center">No parts — click "+ Add part"</td></tr>`;
    return;
  }
  const makeOpts = (sel) => {
    let o = `<option value="">— any —</option>`;
    sheets.forEach(s => { o += `<option value="${s.name.replace(/"/g,'&quot;')}"${s.name===sel?' selected':''}>${s.name}</option>`; });
    return o;
  };
  tbody.innerHTML = pieces.map((p, i) => {
    const dis = p.enabled === false;
    return `<tr class="${dis ? 'cl-row-disabled' : ''}"
      draggable="true"
      ondragstart="onDragStart(event,'pieces',${i})"
      ondragover="onDragOver(event,this)"
      ondrop="onDrop(event,'pieces',${i})"
      ondragend="onDragEnd()">
      <td style="padding:0 2px;width:14px">
        <span class="cl-drag-handle" title="Drag to reorder">${DRAG_HANDLE}</span>
      </td>
      <td class="cl-del-cell">
        <button class="cl-toggle-btn" tabindex="-1" onclick="togglePiece(${p.id})" title="${dis ? 'Enable' : 'Disable'}"
          style="background:none;border:none;padding:2px;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;width:22px;height:22px">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dis?'var(--muted)':p.color};flex-shrink:0"></span>
        </button>
      </td>
      <td class="cl-col-label" style="${colsVisible.label?'':'display:none'}">
        <input class="cl-input" value="${p.label.replace(/"/g,'&quot;')}"
          data-table="pieces" data-row="${i}" data-col="label"
          onblur="updatePiece(${p.id},'label',this.value)"
          onkeydown="clKeydown(event,'pieces',${i},'label')"
          ${dis ? 'disabled' : ''} placeholder="Label">
      </td>
      <td><input class="cl-input cl-dim-input" value="${p.w}"
        data-table="pieces" data-row="${i}" data-col="w"
        onblur="updatePiece(${p.id},'w',this.value)"
        onkeydown="clKeydown(event,'pieces',${i},'w')"
        ${dis ? 'disabled' : ''}></td>
      <td><input class="cl-input cl-dim-input" value="${p.h}"
        data-table="pieces" data-row="${i}" data-col="h"
        onblur="updatePiece(${p.id},'h',this.value)"
        onkeydown="clKeydown(event,'pieces',${i},'h')"
        ${dis ? 'disabled' : ''}></td>
      <td>
        <div class="cl-stepper">
          <button class="cl-step-btn" tabindex="-1" onclick="stepQty('piece',${p.id},-1)">−</button>
          <input class="cl-input cl-qty-input" value="${p.qty}"
            data-table="pieces" data-row="${i}" data-col="qty"
            onblur="updatePiece(${p.id},'qty',this.value)"
            onkeydown="clKeydown(event,'pieces',${i},'qty')"
            min="1" max="999" ${dis ? 'disabled' : ''}>
          <button class="cl-step-btn" tabindex="-1" onclick="stepQty('piece',${p.id},1)">+</button>
        </div>
      </td>
      <td class="cl-grain-cell cl-col-grain" style="${colsVisible.grain?'':'display:none'}">
        <button class="cl-grain-btn${p.grain !== 'none' ? ' active' : ''}" tabindex="-1"
          onclick="cycleGrain(${p.id},'piece')" title="Grain: ${p.grain}">${grainIcon(p.grain)}</button>
      </td>
      <td class="cl-col-edgeband" style="${colsVisible.edgeband?'':'display:none'}">
        <button class="cl-grain-btn${hasAnyEdge(p) ? ' active' : ''}" tabindex="-1" onclick="openEdgePopup(${p.id})" title="Edge banding">${_ebIcon(p)}</button>
      </td>
      <td></td>
      <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}">
        <select class="cl-input" tabindex="-1" style="font-size:11px;padding:3px 4px;border-radius:3px"
          onchange="updatePiece(${p.id},'material',this.value)" ${dis ? 'disabled' : ''}>
          ${makeOpts(p.material)}
        </select>
      </td>
      <td class="cl-del-cell" style="white-space:nowrap;display:flex;align-items:center;gap:2px">
        <input type="checkbox" class="cl-check" tabindex="-1" ${dis ? '' : 'checked'} onclick="_clCheckboxClick(${p.id},${i},this.checked,event)" title="Include in layout&#10;Shift+click to select range">
        <button class="cl-del-btn" tabindex="-1" onclick="removePiece(${p.id})" title="Remove">${DEL_SVG}</button>
      </td>
    </tr>`;
  }).join('');

  // Totals footer
  const tot = document.getElementById('pieces-totals');
  if (tot) {
    const enabled = pieces.filter(p => p.enabled !== false);
    const totalQty = enabled.reduce((s,p) => s+p.qty, 0);
    const totalArea = enabled.reduce((s,p) => s + p.w * p.h * p.qty, 0);
    const m = window.units === 'metric';
    const areaStr = m
      ? `${(totalArea / 1e6).toFixed(2)} m²`
      : `${(totalArea / 144).toFixed(1)} ft²`;
    tot.textContent = pieces.length ? `${totalQty} piece${totalQty!==1?'s':''} · ${areaStr} total` : '';
  }
  _saveCutList();
}

// ── KEYBOARD NAV ──
const CL_COLS = { pieces: ['label','w','h','qty'], sheets: ['name','w','h','qty'] };
function clKeydown(event, tableId, rowIdx, colName) {
  if (event.key !== 'Tab' && event.key !== 'Enter') return;
  event.preventDefault();
  const cols = CL_COLS[tableId];
  const colIdx = cols.indexOf(colName);
  const arr = tableId === 'pieces' ? pieces : sheets;

  // Commit the current input's value to state NOW, and null out its onblur.
  // Otherwise the pending blur (triggered when we move focus below) fires
  // updatePiece/updateSheet → renderPieces/renderSheets, which rebuilds the
  // entire tbody and destroys the input we're about to focus, causing the
  // browser to drop focus outside the table.
  const curEl = event.target;
  if (curEl && 'value' in curEl) {
    const item = arr[rowIdx];
    if (item) {
      if (colName === 'w' || colName === 'h') item[colName] = parseVal(curEl.value);
      else if (colName === 'qty') item[colName] = Math.max(1, parseInt(curEl.value) || 1);
      else item[colName] = curEl.value;
    }
    curEl.onblur = null;
  }

  if (event.key === 'Enter') {
    // Enter = duplicate current row
    const item = arr[rowIdx];
    if (item && tableId === 'pieces') {
      duplicatePiece(item.id);
      setTimeout(() => focusClCell(tableId, rowIdx + 1, cols[0]), 30);
    } else if (item) {
      // For sheets, just move to next row or add new
      if (rowIdx + 1 < arr.length) focusClCell(tableId, rowIdx + 1, colName);
      else { addSheet(); setTimeout(() => focusClCell(tableId, arr.length - 1, cols[0]), 30); }
    }
  } else { // Tab
    const next = event.shiftKey ? colIdx - 1 : colIdx + 1;
    if (next >= 0 && next < cols.length) {
      focusClCell(tableId, rowIdx, cols[next]);
    } else if (next >= cols.length) {
      if (rowIdx + 1 < arr.length) focusClCell(tableId, rowIdx + 1, cols[0]);
      else { tableId === 'pieces' ? addPiece() : addSheet(); setTimeout(() => focusClCell(tableId, arr.length - 1, cols[0]), 30); }
    } else {
      if (rowIdx > 0) focusClCell(tableId, rowIdx - 1, cols[cols.length - 1]);
    }
  }
}
function focusClCell(tableId, rowIdx, colName) {
  const el = document.querySelector(`[data-table="${tableId}"][data-row="${rowIdx}"][data-col="${colName}"]`);
  if (el) { el.focus(); try { el.select(); } catch(e) {} }
}

// ── PASTE FROM SPREADSHEET ──
document.addEventListener('paste', function(e) {
  const target = e.target;
  if (!target.dataset || !target.dataset.table) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const rows = text.trim().split(/\r?\n/);
  if (rows.length <= 1 && !text.includes('\t')) return;
  e.preventDefault();
  const tableId = target.dataset.table;
  const rowIdx  = parseInt(target.dataset.row) || 0;
  const cols    = CL_COLS[tableId];
  const startCI = cols.indexOf(target.dataset.col);
  rows.forEach((row, ri) => {
    const cells = row.split('\t');
    const ai = rowIdx + ri;
    const arr = tableId === 'pieces' ? pieces : sheets;
    while (arr.length <= ai) tableId === 'pieces' ? addPiece() : addSheet();
    cells.forEach((cell, ci) => {
      const coli = startCI + ci;
      if (coli >= cols.length) return;
      const cn = cols[coli];
      const item = arr[ai];
      if (!item) return;
      if (cn === 'w' || cn === 'h') item[cn] = parseVal(cell.trim());
      else if (cn === 'qty') item[cn] = Math.max(1, parseInt(cell.trim()) || 1);
      else item[cn] = cell.trim();
    });
  });
  tableId === 'pieces' ? renderPieces() : renderSheets();
  setTimeout(() => focusClCell(tableId, rowIdx + rows.length - 1, cols[startCI]), 30);
});

// ── CSV ──
function exportCSV(type) {
  let csv, fn;
  if (type === 'pieces') {
    csv = 'Label,W,H,Qty,Grain,Material\n' + pieces.map(p =>
      `"${p.label}",${p.w},${p.h},${p.qty},${p.grain||'none'},"${p.material||''}"`).join('\n');
    fn = 'cut-parts.csv';
  } else {
    csv = 'Material,W,H,Qty,Grain\n' + sheets.map(s =>
      `"${s.name}",${s.w},${s.h},${s.qty},${s.grain||'none'}`).join('\n');
    fn = 'stock-panels.csv';
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: fn });
  a.click();
}
function downloadTemplate(type) {
  const csv = type === 'pieces'
    ? 'Label,W,H,Qty,Grain,Material\nSide Panel,23.25,30,2,none,3/4" Plywood'
    : 'Material,W,H,Qty,Grain\n3/4" Plywood,96,48,5,none';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: type==='pieces'?'parts-template.csv':'panels-template.csv' });
  a.click();
}
function triggerImportCSV(type) {
  _csvImportTarget = type;
  const inp = document.getElementById('csv-import-input');
  inp.value = ''; inp.click();
}
function handleCSVImport(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const lines = e.target.result.trim().split(/\r?\n/).slice(1);
    lines.forEach(line => {
      const c = line.split(',').map(x => x.trim().replace(/^"|"$/g,''));
      if (_csvImportTarget === 'pieces') addPiece(c[0]||`Part ${pieces.length+1}`, parseVal(c[1]), parseVal(c[2]), parseInt(c[3])||1, c[4]||'none');
      else addSheet(c[0]||'Sheet', parseVal(c[1]), parseVal(c[2]), parseInt(c[3])||1);
    });
  };
  reader.readAsText(file);
}

// ── LAYOUT TOOLBAR ──
function zoomIn()  { layoutZoom = Math.min(layoutZoom + 0.25, 4); localStorage.setItem('pc_zoom', layoutZoom); renderResults(); }
function zoomOut() { layoutZoom = Math.max(layoutZoom - 0.25, 0.25); localStorage.setItem('pc_zoom', layoutZoom); renderResults(); }
function zoomFit() { layoutZoom = 1.0; layoutFontScale = 1.0; localStorage.setItem('pc_zoom', layoutZoom); localStorage.setItem('pc_font_scale', layoutFontScale); renderResults(); }
function toggleLayoutColor() {
  layoutColor = !layoutColor;
  const b = document.getElementById('lt-color'); if (b) b.classList.toggle('active', layoutColor);
  renderResults();
}
function toggleLayoutGrain() {
  layoutGrain = !layoutGrain;
  const b = document.getElementById('lt-grain'); if (b) b.classList.toggle('active', layoutGrain);
  renderResults();
}
function toggleCutOrder() {
  layoutCutOrder = !layoutCutOrder;
  localStorage.setItem('pc_cut_order', layoutCutOrder ? '1' : '0');
  const b = document.getElementById('lt-cutorder'); if (b) b.classList.toggle('active', layoutCutOrder);
  renderResults();
}
function toggleSheetCutList() {
  layoutSheetCutList = !layoutSheetCutList;
  localStorage.setItem('pc_sheet_cutlist', layoutSheetCutList ? '1' : '0');
  const b = document.getElementById('lt-sheetcl'); if (b) b.classList.toggle('active', layoutSheetCutList);
  renderResults();
}
function adjustFontScale(d) { layoutFontScale = Math.max(0.5, Math.min(2.5, layoutFontScale + d)); localStorage.setItem('pc_font_scale', layoutFontScale); renderResults(); }
function printLayout(mode='print') {
  if (!results || !results.layouts || !results.layouts.length) { _toast('Run the optimiser first', 'info'); return; }
  // Brief delay so canvases finish rendering before capture
  setTimeout(() => {
    const biz = getBizInfo();
    const u = window.units === 'metric' ? 'mm' : 'in';
    const cur = window.currency;
    const totalArea = results.layouts.reduce((s,l) => s + l.sheet.w * l.sheet.h, 0);
    const usedArea  = results.layouts.reduce((s,l) => s + l.placed.reduce((a,p) => a + p.w * p.h, 0), 0);
    const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0';
    const totalPieces = results.placed;
    const matCost = results.layouts.reduce((s,l) => { const si = stockItems.find(i => i.name === l.sheet.name); return s + (si ? si.cost : 0); }, 0);

    // Capture canvas images
    const canvases = document.querySelectorAll('.canvas-wrap canvas');
    const imgs = [...canvases].map(c => { try { return c.toDataURL('image/png'); } catch(e) { return ''; } });

    const sheetSections = results.layouts.map((layout, i) => {
      const util = (layout.util * 100).toFixed(0);
      const imgTag = imgs[i] ? `<img src="${imgs[i]}" class="sheet-img">` : '';
      const pieceRows = layout.placed.map(p => `
        <tr>
          <td style="width:16px"><div style="width:12px;height:12px;border-radius:2px;background:${p.item.color};opacity:.7"></div></td>
          <td><strong>${p.item.label}</strong></td>
          <td class="num">${p.item.w}</td>
          <td class="num">${p.item.h}</td>
          <td class="num">${p.rotated ? '↺ Yes' : '—'}</td>
          <td>${p.item.notes || ''}</td>
        </tr>`).join('');
      return `
      <div class="sheet-section">
        <div class="sheet-heading">
          <span class="sheet-title">Sheet ${i+1} &mdash; ${layout.sheet.name}</span>
          <span class="sheet-meta">${layout.sheet.w}&times;${layout.sheet.h}${u} &nbsp;&bull;&nbsp; ${layout.placed.length} piece${layout.placed.length!==1?'s':''} &nbsp;&bull;&nbsp; ${util}% used</span>
        </div>
        <div class="sheet-body">
          <div class="sheet-left">${imgTag}</div>
          <div class="sheet-right">
            <table class="ptable">
              <thead><tr><th></th><th>Label</th><th>W (${u})</th><th>H (${u})</th><th>Rotated</th><th>Notes</th></tr></thead>
              <tbody>${pieceRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join('');

    const allPieceRows = pieces.map(p => `
      <tr>
        <td><div style="width:10px;height:10px;border-radius:2px;background:${p.color};opacity:.7;display:inline-block"></div></td>
        <td>${p.label}</td>
        <td class="num">${p.w}</td>
        <td class="num">${p.h}</td>
        <td class="num">${p.qty}</td>
        <td>${p.material || '—'}</td>
        <td>${p.grain === 'h' ? 'Horiz' : p.grain === 'v' ? 'Vert' : '—'}</td>
        <td>${p.notes || ''}</td>
      </tr>`).join('');

    const dateStr = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    const bizSub  = [biz.phone, biz.email].filter(Boolean).join(' · ');

    // Optional combined page (summary stats + full cut list) — respects toggles
    const combinedPageHTML = (clShowSummary || clShowCutList) ? `
<div class="combined-pg">
  <div class="hdr">
    <div><div class="biz">${biz.name || 'ProCabinet'}</div>${bizSub ? `<div class="biz-sub">${bizSub}</div>` : ''}</div>
    <div class="doc-right"><div class="doc-title">Cut List</div><div class="doc-meta">${dateStr}</div></div>
  </div>
  ${clShowSummary ? `<div class="summary">
    <div class="sstat"><div class="sstat-val">${results.layouts.length}</div><div class="sstat-lbl">Sheets</div></div>
    <div class="sstat"><div class="sstat-val">${totalPieces}</div><div class="sstat-lbl">Pieces</div></div>
    <div class="sstat"><div class="sstat-val">${avgUtil}%</div><div class="sstat-lbl">Efficiency</div></div>
    <div class="sstat"><div class="sstat-val">${(100-parseFloat(avgUtil)).toFixed(1)}%</div><div class="sstat-lbl">Waste</div></div>
    ${matCost > 0 ? `<div class="sstat"><div class="sstat-val">${cur}${matCost.toLocaleString()}</div><div class="sstat-lbl">Material Cost</div></div>` : ''}
  </div>` : ''}
  ${clShowCutList ? `<div class="section-hdr" style="margin-top:${clShowSummary?'18px':'0'}">Full Cut List — All Pieces</div>
  <table class="ptable" style="border:1px solid #e0e0e0">
    <thead><tr><th></th><th>Label</th><th>W (${u})</th><th>H (${u})</th><th>Qty</th><th>Material</th><th>Grain</th><th>Notes</th></tr></thead>
    <tbody>${allPieceRows}</tbody>
  </table>` : ''}
  <div class="footer"><span>${biz.name || 'ProCabinet'} — ProCabinet.App</span><span>Printed ${dateStr}</span></div>
</div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cut List — ${new Date().toLocaleDateString('en-GB')}</title>
<style>
  /* A4 landscape — 10mm margins → 190mm usable height, 277mm usable width */
  @page { size: A4 landscape; margin: 10mm 10mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; background:#fff; }
  /* Compact title bar — sits above first sheet on page 1 */
  .doc-title-bar { display:flex; justify-content:space-between; align-items:baseline; font-size:10px; color:#888; border-bottom:1px solid #ddd; padding-bottom:5px; margin-bottom:7px; }
  .doc-title-bar strong { font-size:12px; font-weight:700; color:#111; }
  /* Sheets — first sheet shares page with title bar, subsequent sheets each get their own page */
  .sheet-section { break-inside:avoid; }
  .sheet-section + .sheet-section { break-before:page; }
  .sheet-heading { display:flex; justify-content:space-between; align-items:baseline; background:#f5f5f5; padding:7px 12px; border-radius:5px 5px 0 0; border:1px solid #ddd; border-bottom:2px solid #ddd; }
  .sheet-title { font-size:13px; font-weight:700; }
  .sheet-meta { font-size:10px; color:#777; }
  /* Two-column body: panel LEFT (2/3), cut list RIGHT (1/3) */
  .sheet-body { display:flex; flex-direction:row; gap:12px; align-items:flex-start; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 5px 5px; padding:10px; overflow:hidden; }
  .sheet-left { flex:0 0 66%; overflow:hidden; }
  .sheet-img { display:block; max-width:100%; max-height:158mm; width:auto; height:auto; border:1px solid #e8e8e8; border-radius:3px; }
  .sheet-right { flex:1 1 auto; min-width:0; }
  .ptable { width:100%; border-collapse:collapse; font-size:11px; border:1px solid #e0e0e0; }
  .ptable th { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; padding:5px 8px; background:#fafafa; border-bottom:1px solid #e8e8e8; text-align:left; }
  .ptable td { padding:5px 8px; border-bottom:1px solid #f3f3f3; vertical-align:middle; }
  .ptable tr:last-child td { border-bottom:none; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  /* Combined summary + cut list page — always starts on its own page */
  .combined-pg { break-before:page; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #111; padding-bottom:10px; margin-bottom:16px; }
  .biz { font-size:17px; font-weight:800; letter-spacing:-.5px; }
  .biz-sub { font-size:10px; color:#888; margin-top:2px; }
  .doc-right { text-align:right; }
  .doc-title { font-size:22px; font-weight:300; letter-spacing:3px; text-transform:uppercase; color:#333; }
  .doc-meta { font-size:10px; color:#999; margin-top:3px; }
  .summary { display:flex; gap:0; margin-bottom:0; border:1px solid #e0e0e0; border-radius:6px; overflow:hidden; }
  .sstat { flex:1; padding:10px 14px; border-right:1px solid #e0e0e0; }
  .sstat:last-child { border-right:none; }
  .sstat-val { font-size:20px; font-weight:800; }
  .sstat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; margin-top:1px; }
  .section-hdr { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; padding:0 0 8px; }
  .footer { margin-top:32px; padding-top:10px; border-top:1px solid #eee; display:flex; justify-content:space-between; font-size:9px; color:#bbb; }
</style></head><body>
<div class="doc-title-bar"><span><strong>${biz.name || 'ProCabinet'}</strong>${bizSub ? ' &nbsp;·&nbsp; ' + bizSub : ''}</span><span style="letter-spacing:2px;text-transform:uppercase;font-size:9px">Cut List &nbsp;·&nbsp; ${dateStr}</span></div>
${sheetSections}
${combinedPageHTML}
</body></html>`;
    if (mode === 'pdf') {
      _buildCutListPDF({ biz, layouts: results.layouts, imgs, pieces, u, cur,
        totalPieces, avgUtil, matCost });
    } else {
      _printInFrame(html);
    }
  }, 400);
}

function _printInFrame(html) {
  // Use a hidden iframe — avoids popup blockers entirely
  const old = document.getElementById('_print_frame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = '_print_frame';
  frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:297mm;height:210mm;border:none;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(frame);
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
  setTimeout(() => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch(e) {
      _saveAsPDF(html); // fallback to new-tab PDF flow
    }
    setTimeout(() => { const f = document.getElementById('_print_frame'); if (f) f.remove(); }, 3000);
  }, 600);
}

function _saveAsPDF(html) {
  // Open HTML in a new browser tab — user can print/save from there
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  } else {
    // Fallback if popup blocked — use blob URL
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}


// ── Build a real PDF for quotes using jsPDF ──
function _buildQuotePDF(q) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const cur = window.currency;
  const biz = getBizInfo();
  const logo = getBizLogo();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const matVal = q._totals ? q._totals.materials : (q.materials || 0);
  const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
  const sub = matVal + labVal;
  const markupAmt = sub * q.markup / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * q.tax / 100;
  const total = afterMarkup + taxAmt;
  const fmt = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  // Portrait A4
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // ── Header ──
  pdf.setFontSize(16); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'Your Business', M, y + 6);
  const bizSub = [biz.phone, biz.email, biz.address].filter(Boolean).join('  ·  ');
  if (bizSub) { pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(120); pdf.text(bizSub, M, y + 11); }
  if (biz.abn) { pdf.setFontSize(7); pdf.text('ABN: ' + biz.abn, M, y + 15); }

  pdf.setFontSize(22); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('QUOTATION', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text('#Q-' + String(q.id).padStart(4,'0') + '  ·  ' + (q.date||dateStr), PW - M, y + 12, { align:'right' });

  y += 20;
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // ── Client & Project ──
  pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
  pdf.text('PREPARED FOR', M, y);
  pdf.text('PROJECT', M + 70, y);
  y += 5;
  pdf.setFontSize(13); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(quoteClient(q) || '—', M, y);
  pdf.setFontSize(12); pdf.setFont('helvetica','bold');
  pdf.text(quoteProject(q) || '—', M + 70, y);
  y += 12;

  // ── Cabinet Line Items (from notes) ──
  const noteLines = (q.notes||'').split(/\r?\n/).filter(Boolean);
  const cabLines = noteLines.filter(l => l.includes('\u2014') || l.includes('—'));
  const plainNotes = noteLines.filter(l => !l.includes('\u2014') && !l.includes('—')).join('\n').trim();

  if (cabLines.length > 0) {
    // Table header
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
    pdf.text('DESCRIPTION', M, y); pdf.text('', PW-M, y, { align:'right' });
    y += 2;
    pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.line(M, y, PW-M, y);
    y += 6;

    cabLines.forEach(cl => {
      const parts = cl.split(/\u2014|—/).map(s => s.trim());
      const name = parts[0] || 'Cabinet';
      const details = parts.slice(1).join(' — ').trim();

      pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(name, M, y);
      y += 5;
      if (details) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(130);
        const detailLines = pdf.splitTextToSize(details, W - 10);
        detailLines.forEach(dl => { pdf.text(dl, M + 4, y); y += 4; });
      }
      y += 3;

      if (y > PH - 60) { pdf.addPage(); y = M + 10; }
    });

    pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y);
    y += 8;
  }

  // ── Totals ──
  const totalsX = PW - M;
  const labelX = PW - M - 80;

  if (q.markup > 0 || q.tax > 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('Subtotal', labelX, y); pdf.text(fmt(sub), totalsX, y, { align:'right' });
    y += 6;
  }
  if (q.markup > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Markup (' + q.markup + '%)', labelX, y); pdf.text('+ ' + fmt(markupAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if (q.tax > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Tax (' + q.tax + '%)', labelX, y); pdf.text('+ ' + fmt(taxAmt), totalsX, y, { align:'right' });
    y += 5;
  }

  // ── Total box ──
  y += 3;
  pdf.setFillColor(17,17,17); pdf.roundedRect(M, y, W, 14, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(255);
  pdf.text('TOTAL AMOUNT DUE', M + 8, y + 9);
  pdf.setFontSize(18); pdf.setFont('helvetica','bold');
  pdf.text(fmt0(total), PW - M - 8, y + 10, { align:'right' });
  y += 22;

  // ── Notes ──
  if (plainNotes) {
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(170);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(60);
    const noteWrapped = pdf.splitTextToSize(plainNotes, W);
    noteWrapped.forEach(nl => { pdf.text(nl, M, y); y += 4.5; });
    y += 6;
  }

  // ── Validity ──
  pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
  pdf.text('This quote is valid for 30 days from the date of issue.', M, y);
  y += 12;

  // ── Acceptance ──
  if (y > PH - 60) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(80);
  pdf.text('ACCEPTANCE', M, y); y += 6;
  pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(120);
  const accText = 'To accept this quotation, please sign below and return a copy to ' + (biz.name||'us') + '.';
  pdf.text(accText, M, y); y += 10;

  // Signature lines
  pdf.setDrawColor(180); pdf.setLineWidth(0.4);
  pdf.line(M, y + 16, M + 100, y + 16);
  pdf.line(M + 120, y + 16, PW - M, y + 16);
  pdf.setFontSize(6.5); pdf.setTextColor(180);
  pdf.text('Client Signature', M, y + 20);
  pdf.text('Date', M + 120, y + 20);

  // ── Footer ──
  pdf.setFontSize(6.5); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — Generated by ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  // Output
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


function _buildStockPDF() {
  if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  const u = window.units === 'metric' ? 'mm' : 'in';
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const totalValue = stockItems.reduce((s,i) => s+i.qty*i.cost, 0);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14;
  const W = PW - 2*M;
  let y = M;

  // Header
  pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'ProCabinet', M, y + 6);
  pdf.setFontSize(18); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('STOCK INVENTORY', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text(dateStr + '  ·  ' + stockItems.length + ' items  ·  ' + cur + Math.round(totalValue), PW - M, y + 12, { align:'right' });
  y += 18;
  pdf.setDrawColor(17); pdf.setLineWidth(0.5); pdf.line(M, y, PW-M, y);
  y += 6;

  // Table header
  const cols = [M, M+55, M+80, M+100, M+130, M+148, M+165];
  pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
  ['Material','SKU','Size','Supplier','Qty','Alert',cur+' Value'].forEach((h,i) => pdf.text(h, cols[i], y));
  y += 4;
  pdf.setDrawColor(200); pdf.setLineWidth(0.2); pdf.line(M, y, PW-M, y);
  y += 5;

  // Rows
  stockItems.forEach(item => {
    if (y > PH - 20) { pdf.addPage(); y = M + 10; }
    const isLow = item.qty <= item.low;
    const sup = _ssGet(item.id);
    pdf.setFontSize(9); pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.setTextColor(isLow ? 192 : 40, isLow ? 50 : 40, isLow ? 50 : 40);
    pdf.text(item.name.substring(0,22), cols[0], y);
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text((item.sku||'').substring(0,10), cols[1], y);
    pdf.text(item.w+'×'+item.h+u, cols[2], y);
    pdf.text((sup.supplier||'').substring(0,14), cols[3], y);
    pdf.setTextColor(isLow?192:40, isLow?50:40, isLow?50:40);
    pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.text(String(item.qty), cols[4], y);
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text(String(item.low), cols[5], y);
    pdf.text(cur + (item.qty*item.cost).toFixed(0), cols[6], y);
    y += 5;
  });

  // Footer
  pdf.setFontSize(6.5); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function _buildWorkOrderPDF(o) {
  if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  const fmt = v => cur + Math.round(v).toLocaleString();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const statusLabel = { quote:'Quote Sent', confirmed:'Confirmed', production:'In Production', delivery:'Ready for Delivery', complete:'Complete' }[o.status] || o.status;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // Header
  pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'ProCabinet', M, y + 6);
  const bizSub = [biz.phone, biz.email].filter(Boolean).join('  ·  ');
  if (bizSub) { pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(120); pdf.text(bizSub, M, y + 11); }
  pdf.setFontSize(20); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('WORK ORDER', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text('#WO-' + String(o.id).padStart(4,'0') + '  ·  ' + dateStr, PW - M, y + 12, { align:'right' });
  y += 18;
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // Project info
  const infoItems = [
    ['Client', orderClient(o)], ['Project', orderProject(o)],
    ['Order Value', fmt(o.value)], ['Status', statusLabel],
    ['Due Date', o.due || 'TBD']
  ];
  infoItems.forEach(([label, val]) => {
    pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
    pdf.text(label.toUpperCase(), M, y);
    pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
    pdf.text(String(val), M + 35, y);
    y += 7;
  });
  y += 5;

  // Notes
  if (o.notes) {
    pdf.setDrawColor(220); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y); y += 6;
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal'); pdf.setTextColor(40);
    const noteLines = pdf.splitTextToSize(o.notes, W);
    noteLines.forEach(nl => { pdf.text(nl, M, y); y += 5; });
    y += 5;
  }

  // Production notes (blank lines)
  pdf.setDrawColor(220); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y); y += 6;
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
  pdf.text('PRODUCTION NOTES', M, y); y += 8;
  for (let i = 0; i < 8; i++) {
    pdf.setDrawColor(210); pdf.setLineWidth(0.15); pdf.line(M, y, PW-M, y);
    y += 8;
  }
  y += 5;

  // Sign-off
  if (y > PH - 50) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
  pdf.text('SIGN-OFF', M, y); y += 8;
  ['Prepared by', 'Date started', 'Date completed'].forEach(label => {
    pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
    pdf.text(label, M, y + 10);
    pdf.setDrawColor(180); pdf.setLineWidth(0.3); pdf.line(M + 30, y + 10, M + 80, y + 10);
    y += 14;
  });

  // Footer
  pdf.setFontSize(6.5); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function _buildCutListPDF({ biz, layouts, imgs, pieces, u, cur, totalPieces, avgUtil, matCost }) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  _toast('Building PDF\u2026', 'info', 8000);
  try {
    const { jsPDF } = window.jspdf;
    const PW = 297, PH = 210, M = 10;
    const W = PW - 2*M, H = PH - 2*M;  // 277 x 190 mm usable
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    // ── safe hex → [r,g,b] ──
    function hexRgb(hex) {
      if (!hex || hex.length < 7) return [180,180,180];
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

    // ── compact title bar drawn at top of each sheet page ──
    function titleBar() {
      const sub = [biz.phone, biz.email].filter(Boolean).join(' · ');
      pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(biz.name || 'ProCabinet', M, M+5);
      if (sub) { pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136); pdf.text(sub, M+pdf.getTextWidth(biz.name||'ProCabinet')+3, M+5); }
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
      pdf.text('CUT LIST  ·  '+dateStr, PW-M, M+5, { align:'right' });
      pdf.setDrawColor(200); pdf.setLineWidth(0.25); pdf.line(M, M+7, PW-M, M+7);
      pdf.setTextColor(17);
    }

    // ── full-page header used on the combined summary/cutlist page ──
    function pageHeader() {
      pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(17,17,17);
      pdf.text(biz.name || 'ProCabinet', M, M+7);
      const sub = [biz.phone, biz.email].filter(Boolean).join('  \u00b7  ');
      if (sub) { pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(136); pdf.text(sub, M, M+12); }
      pdf.setFontSize(20); pdf.setFont('helvetica','normal'); pdf.setTextColor(51);
      pdf.text('CUT LIST', PW-M, M+9, { align:'right' });
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(153);
      pdf.text(dateStr, PW-M, M+14, { align:'right' });
      pdf.setDrawColor(17); pdf.setLineWidth(0.7); pdf.line(M, M+17, PW-M, M+17);
      pdf.setTextColor(17);
    }

    // ── one landscape page per sheet — sheets start on page 1 ──
    const leftW  = Math.floor(W * 2/3);   // ~184 mm (2/3)
    const gap    = 8;
    const rightX = M + leftW + gap;
    const rightW = W - leftW - gap;       // ~85 mm
    const hdgH   = 9;                     // heading bar height
    const titleBarH = 9;                  // compact title bar height

    layouts.forEach((layout, i) => {
      if (i > 0) pdf.addPage();           // first sheet on page 1, rest add pages
      titleBar();
      const util = (layout.util*100).toFixed(0);

      // sheet heading bar (sits below title bar)
      const sheetHdgY = M + titleBarH + 2;
      pdf.setFillColor(245,245,245); pdf.rect(M, sheetHdgY, W, hdgH, 'F');
      pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.rect(M, sheetHdgY, W, hdgH, 'S');
      pdf.setFontSize(9.5); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(`Sheet ${i+1}  \u2014  ${layout.sheet.name}`, M+4, sheetHdgY+6);
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(110);
      pdf.text(`${layout.sheet.w}\u00d7${layout.sheet.h} ${u}    ${layout.placed.length} piece${layout.placed.length!==1?'s':''}    ${util}% used`, PW-M-2, sheetHdgY+6, { align:'right' });
      pdf.setTextColor(17);

      // panel image — left 2/3, aspect-correct
      if (imgs[i]) {
        const imgX = M+2, imgY = sheetHdgY + hdgH + 3;
        const maxW = leftW-4, maxH = PH-imgY-M-2;
        const aspect = layout.sheet.w / layout.sheet.h;
        let iw, ih;
        if (aspect >= maxW/maxH) { iw = maxW; ih = iw/aspect; }
        else                      { ih = maxH; iw = ih*aspect; }
        pdf.setDrawColor(220); pdf.setLineWidth(0.2); pdf.rect(imgX, imgY, iw, ih, 'S');
        pdf.addImage(imgs[i], 'PNG', imgX, imgY, iw, ih);
      }

      // cut list table — right 1/3
      pdf.autoTable({
        startY: sheetHdgY + hdgH + 3,
        margin: { left: rightX, right: M },
        tableWidth: rightW,
        head: [['', 'Label', `W (${u})`, `H (${u})`, 'Rot', 'Notes']],
        body: layout.placed.map(p => ['', p.item.label, p.item.w, p.item.h, p.rotated?'Y':'--', p.item.notes||'']),
        styles: { fontSize: 7.5, cellPadding: 1.8, overflow:'ellipsize', textColor:[17,17,17] },
        headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:6.5, lineWidth:0 },
        columnStyles: { 0:{cellWidth:5}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'center',cellWidth:7} },
        theme: 'plain',
        tableLineColor: [224,224,224], tableLineWidth: 0.2,
        didDrawCell(data) {
          if (data.column.index===0 && data.section==='body') {
            const p = layout.placed[data.row.index];
            if (p) { const [r,g,b]=hexRgb(p.item.color); pdf.setFillColor(r,g,b); pdf.roundedRect(data.cell.x+1,data.cell.y+1.5,3,3,0.5,0.5,'F'); }
          }
        }
      });
    });

    // ── OPTIONAL COMBINED PAGE: summary stats + full cut list ──
    if (clShowSummary || clShowCutList) {
      pdf.addPage();
      pageHeader();
      let cy = M + 22;

      if (clShowSummary) {
        const stats = [
          { v: layouts.length,                           l: 'SHEETS' },
          { v: totalPieces,                              l: 'PIECES' },
          { v: avgUtil + '%',                            l: 'EFFICIENCY' },
          { v: (100-parseFloat(avgUtil)).toFixed(1)+'%', l: 'WASTE' },
        ];
        if (matCost > 0) stats.push({ v: cur + matCost.toLocaleString(), l: 'MATERIAL COST' });
        const sw = W / stats.length;
        stats.forEach((s, i) => {
          const sx = M + i*sw;
          pdf.setFillColor(247,247,247); pdf.roundedRect(sx, cy, sw-2, 20, 2, 2, 'F');
          pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
          pdf.text(String(s.v), sx+sw/2-1, cy+12, { align:'center' });
          pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
          pdf.text(s.l, sx+sw/2-1, cy+17, { align:'center' });
        });
        cy += 26;
      }

      if (clShowCutList) {
        if (clShowSummary) { cy += 4; }
        pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(80);
        pdf.text('ALL PIECES', M, cy);
        pdf.setDrawColor(210); pdf.setLineWidth(0.2); pdf.line(M, cy+1.5, PW-M, cy+1.5);
        cy += 5;
        pdf.autoTable({
          startY: cy, margin: { left:M, right:M },
          head: [['','Label',`W (${u})`,`H (${u})`,'Qty','Material','Grain','Notes']],
          body: pieces.map(p => ['',p.label,p.w,p.h,p.qty,p.material||'--',p.grain==='h'?'Horiz':p.grain==='v'?'Vert':'--',p.notes||'']),
          styles: { fontSize:8, cellPadding:2, overflow:'ellipsize', textColor:[17,17,17] },
          headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:7, lineWidth:0 },
          columnStyles: { 0:{cellWidth:6}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right',cellWidth:10} },
          theme: 'plain', tableLineColor:[224,224,224], tableLineWidth:0.2,
          didDrawCell(data) {
            if (data.column.index===0 && data.section==='body') {
              const p = pieces[data.row.index];
              if (p) { const [r,g,b]=hexRgb(p.color); pdf.setFillColor(r,g,b); pdf.roundedRect(data.cell.x+1,data.cell.y+1.5,3,3,0.5,0.5,'F'); }
            }
          }
        });
      }

      // footer
      pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(187);
      pdf.text((biz.name||'ProCabinet')+' \u2014 ProCabinet.App', M, PH-M+4);
      pdf.text('Printed '+dateStr, PW-M, PH-M+4, { align:'right' });
    }

    // output as real PDF blob → opens in browser PDF viewer
    const blob = pdf.output('blob');
    const url  = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    _toast('PDF opened in new tab', 'success', 3000);
  } catch(err) {
    console.error(err);
    _toast('PDF generation failed: '+err.message, 'error');
  }
}

function toggleLayoutRotate() {
  layoutRotate = !layoutRotate;
  const b = document.getElementById('lt-rotate'); if (b) b.classList.toggle('active', layoutRotate);
  renderResults();
}
function toggleClSummary() {
  clShowSummary = !clShowSummary;
  clShowCutList = clShowSummary;  // cut list table is part of the Summary tile now
  localStorage.setItem('pc_show_summary', clShowSummary ? '1' : '0');
  localStorage.setItem('pc_show_cutlist', clShowCutList ? '1' : '0');
  document.getElementById('lt-pg-summary')?.classList.toggle('active', clShowSummary);
  renderResults();
}
function toggleClCutList() {
  // Legacy — routed through the combined Summary toggle
  toggleClSummary();
}
function setPagesPerSheet(n) {
  let s = document.getElementById('print-pages-style');
  if (!s) { s = document.createElement('style'); s.id = 'print-pages-style'; document.head.appendChild(s); }
  n = parseInt(n);
  if (n === 2) s.textContent = `@media print{.canvas-wrap{display:inline-block;width:48%;margin:0 1% 2%;vertical-align:top}}`;
  else if (n === 4) s.textContent = `@media print{.canvas-wrap{display:inline-block;width:23%;margin:0 1% 2%;vertical-align:top}}`;
  else s.textContent = '';
}

// Recursive guillotine packer (multi-start best-fit).
// Options A+B: tournament over several starting orderings × best-short-side-fit
// pick at each region × shorter-axis-first split preference. Every layout is
// pure guillotine by construction — edge-to-edge cuts per region.
function packSheetRecGuillotine(sheetW, sheetH, sheetGrain, items, kerf) {
  const orientOf = (it) => {
    const pg = it.grain || 'none', sg = sheetGrain || 'none';
    const mustRot = pg !== 'none' && sg !== 'none' && pg !== sg;
    const canRot  = pg === 'none' || mustRot;
    const nat = { w: it.w, h: it.h, rotated: false };
    const rot = { w: it.h, h: it.w, rotated: true };
    if (mustRot) return [rot, nat];
    if (canRot)  return [nat, rot];
    return [nat];
  };
  const areaOf = (pcs) => pcs.reduce((s, p) => s + p.w * p.h, 0);
  const betterThan = (a, b) => {
    if (!b) return true;
    if (a.placed.length !== b.placed.length) return a.placed.length > b.placed.length;
    return areaOf(a.placed) > areaOf(b.placed);
  };

  // Inner packer: given a pre-sorted item list, recursively fill regions using
  // best-short-side-fit picks. Orderings is the tiebreak when multiple items
  // tie on BSSF score — earlier-in-list wins.
  function packOrdered(orderedItems) {
    function packRegion(x0, y0, x1, y1, items) {
      const rw = x1 - x0, rh = y1 - y0;
      if (rw < 1 || rh < 1 || !items.length) return { placed: [], leftover: items };

      // Best Short Side Fit: pick the item+orientation that leaves the smallest
      // minor leftover. Ties broken by the caller-provided item order.
      let pickIdx = -1, pickScore = Infinity;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        for (const o of orientOf(it)) {
          if (o.w > rw + 0.5 || o.h > rh + 0.5) continue;
          const score = Math.min(rw - o.w, rh - o.h);
          if (score < pickScore) { pickIdx = i; pickScore = score; }
          break;  // first valid orientation for this item — we'll branch on both later
        }
      }
      if (pickIdx < 0) return { placed: [], leftover: items };

      const it = items[pickIdx];
      const remaining = items.filter((_, i) => i !== pickIdx);

      // Branch on every fitting orientation × both guillotine splits.
      // Split A (row-first): RIGHT = (x0+w+k, y0, x1, y0+h), BELOW = (x0, y0+h+k, x1, y1)
      // Split B (col-first): BELOW = (x0, y0+h+k, x0+w, y1), RIGHT = (x0+w+k, y0, x1, y1)
      // SAS preference: when leftover RIGHT arm is narrower than BELOW arm, prefer
      // Split B (keep the wider BELOW arm intact); else Split A. Still try both —
      // this only affects tie-breaking when both pack the same # of pieces.
      let best = null;
      for (const o of orientOf(it)) {
        if (o.w > rw + 0.5 || o.h > rh + 0.5) continue;
        const placed0 = { x: x0, y: y0, w: o.w, h: o.h, item: it, rotated: o.rotated };
        const preferA = (rw - o.w) >= (rh - o.h);  // wider right arm → preserve it via split A

        const tryA = () => {
          const rA1 = packRegion(x0 + o.w + kerf, y0, x1, y0 + o.h, remaining);
          const rA2 = packRegion(x0, y0 + o.h + kerf, x1, y1, rA1.leftover);
          return { placed: [placed0, ...rA1.placed, ...rA2.placed], leftover: rA2.leftover };
        };
        const tryB = () => {
          const rB1 = packRegion(x0, y0 + o.h + kerf, x0 + o.w, y1, remaining);
          const rB2 = packRegion(x0 + o.w + kerf, y0, x1, y1, rB1.leftover);
          return { placed: [placed0, ...rB1.placed, ...rB2.placed], leftover: rB2.leftover };
        };

        const [first, second] = preferA ? [tryA(), tryB()] : [tryB(), tryA()];
        if (betterThan(first, best)) best = first;
        if (betterThan(second, best)) best = second;
      }

      return best || { placed: [], leftover: items };
    }
    return packRegion(0, 0, sheetW, sheetH, orderedItems);
  }

  // Multi-start tournament — five orderings, keep the best result.
  const orderings = [
    [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h)),                         // area desc
    [...items].sort((a, b) => b.h - a.h),                                         // height desc
    [...items].sort((a, b) => b.w - a.w),                                         // width desc
    [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),           // longest-edge desc
    [...items].sort((a, b) => (b.w + b.h) - (a.w + a.h)),                         // perimeter desc
  ];

  let best = null;
  for (const ord of orderings) {
    const res = packOrdered(ord);
    if (betterThan(res, best)) best = res;
  }
  return best || { placed: [], leftover: items };
}

function optimize() {
  if (!_userId && _getOptCount() >= FREE_LIMIT) {
    document.getElementById('paywall-modal').classList.remove('hidden');
    return;
  }
  const activeSheets = sheets.filter(s => s.enabled !== false);
  const activePieces = pieces.filter(p => p.enabled !== false);
  if (!activeSheets.length) { _toast('Add at least one enabled sheet panel.', 'error'); return; }
  if (!activePieces.length) { _toast('Add at least one enabled cut part.', 'error'); return; }
  let remaining = [];
  for (const p of activePieces) for (let i = 0; i < p.qty; i++) {
    const {w: tw, h: th} = _trimmedDims(p);
    remaining.push({ ...p, w: tw, h: th, _origW: p.w, _origH: p.h, _inst: i });
  }
  remaining.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const sheetInsts = [];
  for (const s of activeSheets) for (let i = 0; i < s.qty; i++) sheetInsts.push({ ...s, _inst: i });
  const layouts = [];
  for (const si of sheetInsts) {
    if (!remaining.length) break;
    const fittable = remaining.filter(p => {
      const pGrain = p.grain || 'none';
      const sGrain = si.grain || 'none';
      const mustRotate = pGrain !== 'none' && sGrain !== 'none' && pGrain !== sGrain;
      const canRotate  = pGrain === 'none' || mustRotate;
      const fitsNatural = p.w <= si.w && p.h <= si.h;
      const fitsRotated = p.h <= si.w && p.w <= si.h;
      if (mustRotate) return fitsRotated || fitsNatural;
      if (canRotate)  return fitsNatural || fitsRotated;
      return fitsNatural;
    });
    if (!fittable.length) continue;
    const sheetKerf = si.kerf ?? 0;
    // PANEL-SAW OPTIMISATION ───────────────────────────────────────────────
    // Recursive guillotine only — builds an explicit cut tree by trying both
    // horizontal and vertical splits at each region and keeping whichever
    // packs more pieces. Produces clean hierarchical structure ideal for
    // panel-saw workflows.
    const recR   = packSheetRecGuillotine(si.w, si.h, si.grain || 'none', fittable, sheetKerf);
    if (!recR.placed.length) continue;
    const chosen = recR;
    const { placed, leftover } = chosen;
    if (!placed.length) continue;
    const usedArea = placed.reduce((s, p) => s + p.w * p.h, 0);
    layouts.push({ sheet: si, placed, util: usedArea / (si.w * si.h), waste: 1 - usedArea / (si.w * si.h) });
    const placedKeys = new Set(placed.map(p => `${p.item.id}_${p.item._inst}`));
    remaining = remaining.filter(p => !placedKeys.has(`${p.id}_${p._inst}`));
  }
  results = { layouts, unplaced: remaining, total: activePieces.reduce((s,p) => s+p.qty, 0), placed: activePieces.reduce((s,p) => s+p.qty, 0) - remaining.length };
  if (!_userId) _incOptCount();
  activeSheetIdx = 0;
  renderResults();
  // Scroll results into view
  setTimeout(() => {
    const el = document.getElementById('results-area');
    if (el) el.scrollTop = 0;
    // On narrow screens, scroll the right panel into view
    const right = document.querySelector('.cl-right');
    if (right) right.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.inner-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  renderResults();
}

function renderResults() {
  if (!results) return;
  // Sync layout toolbar button states with persisted prefs
  const btnCo = document.getElementById('lt-cutorder'); if (btnCo) btnCo.classList.toggle('active', layoutCutOrder);
  const btnSum = document.getElementById('lt-pg-summary'); if (btnSum) btnSum.classList.toggle('active', clShowSummary);
  const btnScl = document.getElementById('lt-sheetcl'); if (btnScl) btnScl.classList.toggle('active', layoutSheetCutList);
  const area = document.getElementById('results-area');
  renderLayout(area);  // inner tabs removed; layout view is the only view
}

function renderLayout(area) {
  if (!results.layouts.length) {
    area.innerHTML = '<div class="empty-state"><h3>No layouts generated</h3><p>Check that your pieces fit within your sheet dimensions.</p></div>';
    return;
  }
  const u = window.units === 'metric' ? 'mm' : 'in';
  const totalArea = results.layouts.reduce((s,l) => s + l.sheet.w * l.sheet.h, 0);
  const usedArea  = results.layouts.reduce((s,l) => s + l.placed.reduce((a,p) => a + p.w * p.h, 0), 0);
  const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0.0';

  // Material cost estimate — match sheet name to stock items
  const matCost = results.layouts.reduce((s, l) => {
    const stock = stockItems.find(si => si.name === l.sheet.name);
    return s + (stock ? stock.cost : 0);
  }, 0);
  const cur = window.currency;

  area.innerHTML = '';

  // Combined Summary tile — stats + full cut list in one card, shown when Summary is on
  if (clShowSummary) {
    const card = document.createElement('div');
    card.className = 'combined-pg-card';
    card.style.marginBottom = '14px';

    const statList = [
      ['Sheets', results.layouts.length],
      ['Pieces', results.placed],
      ['Efficiency', avgUtil + '%'],
      ['Waste', (100 - parseFloat(avgUtil)).toFixed(1) + '%'],
    ];
    if (matCost > 0) statList.push(['Material Cost', cur + matCost.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})]);

    card.innerHTML = `
      <div class="combined-pg-stats">${statList.map(([l, v]) => `<div class="combined-pg-stat"><div class="combined-pg-stat-val">${v}</div><div class="combined-pg-stat-lbl">${l}</div></div>`).join('')}</div>
      <div class="combined-pg-section-hdr" style="margin-top:14px">All Pieces</div>
      <table class="combined-pg-table">
        <thead><tr>
          <th style="width:14px"></th><th>Label</th>
          <th style="text-align:right">W (${u})</th><th style="text-align:right">H (${u})</th>
          <th style="text-align:right">Qty</th><th>Material</th><th>Grain</th><th>Notes</th>
        </tr></thead>
        <tbody>${pieces.map(p => `<tr>
          <td><div style="width:10px;height:10px;border-radius:2px;background:${p.color};opacity:.8;display:inline-block"></div></td>
          <td>${p.label}</td>
          <td style="text-align:right">${p.w}</td><td style="text-align:right">${p.h}</td>
          <td style="text-align:right">${p.qty}</td>
          <td>${p.material || '—'}</td>
          <td>${p.grain === 'h' ? 'Horiz' : p.grain === 'v' ? 'Vert' : '—'}</td>
          <td>${p.notes || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    area.appendChild(card);
  }

  // Sheets
  results.layouts.forEach((layout, i) => {
    const lbl = document.createElement('div');
    lbl.className = 'sheet-block-label';
    lbl.innerHTML = `<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${layout.sheet.color || 'var(--muted)'};margin-right:6px;vertical-align:middle"></span>Sheet ${i+1}</span><span style="font-weight:400;color:var(--muted)">${layout.sheet.name} &nbsp;·&nbsp; ${(layout.util*100).toFixed(0)}% used</span>`;
    area.appendChild(lbl);
    drawCanvas(area, layout, u);

    // Per-sheet cut list table (toggleable from toolbar)
    if (layoutSheetCutList && layout.placed.length) {
      const agg = new Map();
      for (const p of layout.placed) {
        const k = p.item.id;
        if (!agg.has(k)) agg.set(k, { label: p.item.label, w: p.item.w, h: p.item.h, qty: 0, color: p.item.color, material: p.item.material, grain: p.item.grain });
        agg.get(k).qty++;
      }
      const rows = [...agg.values()];
      const tableWrap = document.createElement('div');
      tableWrap.className = 'sheet-cutlist';
      tableWrap.innerHTML = `<table class="combined-pg-table">
        <thead><tr>
          <th style="width:14px"></th><th>Label</th>
          <th style="text-align:right">W (${u})</th><th style="text-align:right">H (${u})</th>
          <th style="text-align:right">Qty</th><th>Material</th><th>Grain</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><div style="width:10px;height:10px;border-radius:2px;background:${r.color};opacity:.8;display:inline-block"></div></td>
          <td>${r.label}</td>
          <td style="text-align:right">${r.w}</td><td style="text-align:right">${r.h}</td>
          <td style="text-align:right">${r.qty}</td>
          <td>${r.material || '—'}</td>
          <td>${r.grain === 'h' ? 'Horiz' : r.grain === 'v' ? 'Vert' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
      area.appendChild(tableWrap);
    }
  });
}

function selectSheet(i) { activeSheetIdx = i; renderResults(); }

// Pastel color helpers
function toPastel(hex) {
  // Panel parts: moderate tint — blend 16% color with 84% white
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.16+255*.84)},${Math.round(g*.16+255*.84)},${Math.round(b*.16+255*.84)})`;
}
function toPaleSheet(hex) {
  // Sheet background: very pale (lighter than parts) — 4% tint
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.04+255*.96)},${Math.round(g*.04+255*.96)},${Math.round(b*.04+255*.96)})`;
}
function toPastelDark(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.45+180*.55)},${Math.round(g*.45+180*.55)},${Math.round(b*.45+180*.55)})`;
}

function drawCanvas(container, layout, units) {
  const { sheet, placed } = layout;
  const sW = layoutRotate ? sheet.h : sheet.w;
  const sH = layoutRotate ? sheet.w : sheet.h;
  const rotPieces = placed.map(p => layoutRotate
    ? { ...p, x: p.y, y: p.x, w: p.h, h: p.w } : p);

  // Gutters — small margin for overall sheet dim arrows only (part/offcut dims are now inside)
  const FAR_L = 22;   // left overall height arrow + label
  const GUT_T = 6;    // top breathing room
  const GUT_R = 10;   // right breathing room
  const GUT_B = 28;   // bottom overall width arrow + label

  // Append wrap first to measure actual inner width
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  container.appendChild(wrap);

  // Auto-scale to actual wrap *content* width (clientWidth minus horizontal padding)
  const wrapCS = getComputedStyle(wrap);
  const wrapPadH = (parseFloat(wrapCS.paddingLeft) || 0) + (parseFloat(wrapCS.paddingRight) || 0);
  const wrapInner = Math.max(200, wrap.clientWidth - wrapPadH - 2);
  const layoutSpace = Math.max(200, wrapInner - FAR_L - GUT_R);
  const heightBudget = 560;
  const fitScale = Math.min(layoutSpace / sW, (heightBudget - GUT_T - GUT_B) / sH);
  const scale = Math.max(0.02, fitScale * layoutZoom);
  const cw = Math.round(sW * scale), ch = Math.round(sH * scale);

  const OX = FAR_L;
  const OY = GUT_T;
  const TW = OX + cw + GUT_R;
  const TH = OY + ch + GUT_B;

  const canvas = document.createElement('canvas');

  // ── High-DPI rendering ──
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(TW * dpr);
  canvas.height = Math.round(TH * dpr);
  canvas.style.cssText = `width:${TW}px;height:${TH}px;display:block`;
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Unified font sizing — consistent across all labels + dims
  const fs = Math.max(9, Math.min(12, cw / 55)) * layoutFontScale;
  const FONT_FAMILY = '-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
  const labelFont = `500 ${fs}px ${FONT_FAMILY}`;
  const dimFont   = `400 ${fs}px ${FONT_FAMILY}`;

  // Sheet background — honors layoutColor (grey when Color is off, very pale tinted otherwise)
  if (layoutColor && sheet.color) {
    ctx.fillStyle = toPaleSheet(sheet.color);
  } else {
    ctx.fillStyle = '#f7f7f7';
  }
  ctx.fillRect(OX, OY, cw, ch);

  // Sheet grain — subtle
  const sheetGrain = sheet.grain || 'none';
  const drawSG = layoutRotate ? (sheetGrain==='h'?'v':sheetGrain==='v'?'h':'none') : sheetGrain;
  if (drawSG !== 'none' && layoutGrain) {
    ctx.save();
    ctx.beginPath(); ctx.rect(OX+1, OY+1, cw-2, ch-2); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.65;
    const sgsp = Math.max(5, Math.min(14, cw/8, ch/8));
    if (drawSG==='h') { for (let gy=sgsp; gy<ch; gy+=sgsp) { ctx.beginPath(); ctx.moveTo(OX, OY+gy); ctx.lineTo(OX+cw, OY+gy); ctx.stroke(); } }
    else { for (let gx=sgsp; gx<cw; gx+=sgsp) { ctx.beginPath(); ctx.moveTo(OX+gx, OY); ctx.lineTo(OX+gx, OY+ch); ctx.stroke(); } }
    ctx.restore();
  }

  // ── Rip direction: parallel to sheet's long axis (with grain when specified) ──
  // Rip cuts are made FIRST (industry standard), then cross cuts.
  // The plan is computed in the SHEET's ORIGINAL coordinate space so the cut
  // tree (and therefore the cut order) is invariant under display rotation.
  // After plan generation, cuts are transposed to display coords if needed.
  const sW0 = sheet.w, sH0 = sheet.h;
  const origPieces = placed;
  const origRipIsH = sheetGrain === 'h' ? true : sheetGrain === 'v' ? false : (sW0 >= sH0);
  const ripIsH = origRipIsH;  // used inside buildGuillotinePlan helpers below
  const ripPass = 1, crossPass = 2;
  const ripPassOf = isH => (isH === ripIsH) ? ripPass : crossPass;

  // ── 4-PHASE cut ordering (rip-cross-rip-cross) ──
  // phase=1 : rips reachable from root with no cross ancestor ("full-sheet rips")
  // phase=2 : crosses that enable at least one phase-3 rip ("blocking crosses")
  // phase=3 : rips that follow a phase-2 cross (have a cross ancestor in the tree)
  // phase=4 : terminal crosses with no rip later in their subtree (piece-sizing)
  // Each cut carries a `_path` — an array of 2-char ancestry tokens ('cL', 'cR',
  // 'rL', 'rR') uniquely identifying its tree position. Rip phase is known at
  // emit time. Cross phase is finalized post-build by searching for any later
  // rip whose `_path` starts with this cross's `_path` (a true descendant).
  const ripPhaseFor = (pathDirs) => pathDirs.some(d => d[0] === 'c') ? 3 : 1;

  // ── Recursive guillotine decomposition ──
  // Prefer interior rips first at each region. If none is possible, try outer
  // strips, then an interior cross. Each cut carries a `_path` snapshot of its
  // ancestor direction chain so phases can be finalized in a post-pass.
  function buildGuillotinePlan(x0, y0, x1, y1, pcs, pathDirs) {
    pathDirs = pathDirs || [];
    const out = { cuts: [], offcuts: [] };
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return out;
    if (pcs.length === 0) { out.offcuts.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); return out; }

    const bounds = () => {
      let mY=-Infinity, mX=-Infinity, nY=Infinity, nX=Infinity;
      for (const p of pcs) { if (p.y+p.h>mY) mY=p.y+p.h; if (p.x+p.w>mX) mX=p.x+p.w; if (p.y<nY) nY=p.y; if (p.x<nX) nX=p.x; }
      return { mY, mX, nY, nX };
    };
    const ripPhase = ripPhaseFor(pathDirs);
    const stripBot = () => { const { mY } = bounds(); if (mY < y1 - 0.5) { out.cuts.push({ x1: x0, y1: mY, x2: x1, y2: mY, pass: ripPassOf(true),  phase: ripPhase, _path: pathDirs, outer: true }); out.offcuts.push({ x: x0, y: mY, w: x1 - x0, h: y1 - mY }); y1 = mY; } };
    const stripTop = () => { const { nY } = bounds(); if (nY > y0 + 0.5) { out.cuts.push({ x1: x0, y1: nY, x2: x1, y2: nY, pass: ripPassOf(true),  phase: ripPhase, _path: pathDirs, outer: true }); out.offcuts.push({ x: x0, y: y0, w: x1 - x0, h: nY - y0 }); y0 = nY; } };
    const stripRight = () => { const { mX } = bounds(); if (mX < x1 - 0.5) { out.cuts.push({ x1: mX, y1: y0, x2: mX, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs, outer: true }); out.offcuts.push({ x: mX, y: y0, w: x1 - mX, h: y1 - y0 }); x1 = mX; } };
    const stripLeft  = () => { const { nX } = bounds(); if (nX > x0 + 0.5) { out.cuts.push({ x1: nX, y1: y0, x2: nX, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs, outer: true }); out.offcuts.push({ x: x0, y: y0, w: nX - x0, h: y1 - y0 }); x0 = nX; } };

    const spans = (v, axis) => pcs.some(p => (axis === 'h' ? (p.y < v - 0.5 && p.y + p.h > v + 0.5) : (p.x < v - 0.5 && p.x + p.w > v + 0.5)));
    const pickFrom = (cands, axis) => {
      let best = null;
      const onSideA = (p, v) => (axis === 'h' ? (p.y + p.h <= v + 0.5) : (p.x + p.w <= v + 0.5));
      // Perpendicular extent: for a vertical cut (axis='v'), sub-regions get stripped
      // in the y-direction, so pieces' y+h matters. For a horizontal cut, x+w matters.
      const perpEnd = p => axis === 'v' ? (p.y + p.h) : (p.x + p.w);
      // Count pieces on a side that don't reach the side's max perpendicular extent.
      // Each such piece forces an extra outer strip after recursion, fragmenting waste.
      const shortCount = side => {
        if (!side.length) return 0;
        let M = -Infinity;
        for (const p of side) { const e = perpEnd(p); if (e > M) M = e; }
        let n = 0;
        for (const p of side) if (perpEnd(p) < M - 0.5) n++;
        return n;
      };
      for (const v of cands) {
        const sideA = pcs.filter(p => onSideA(p, v));
        const sideB = pcs.filter(p => !onSideA(p, v));
        if (!sideA.length || !sideB.length) continue;
        const bal = Math.abs(sideA.length - sideB.length);
        const spread = shortCount(sideA) + shortCount(sideB);
        if (!best || bal < best.bal || (bal === best.bal && spread < best.spread)) {
          best = { v, bal, spread };
        }
      }
      return best;
    };

    // ──── Interior RIP (structural split in rip direction) ────
    if (pcs.length > 1) {
      const ripCands = (ripIsH
        ? [...new Set(pcs.flatMap(p => [p.y, p.y + p.h]))].filter(y => y > y0 + 0.5 && y < y1 - 0.5 && !spans(y, 'h'))
        : [...new Set(pcs.flatMap(p => [p.x, p.x + p.w]))].filter(x => x > x0 + 0.5 && x < x1 - 0.5 && !spans(x, 'v')));
      const ripBest = pickFrom(ripCands, ripIsH ? 'h' : 'v');
      if (ripBest) {
        const v = ripBest.v;
        if (ripIsH) {
          out.cuts.push({ x1: x0, y1: v, x2: x1, y2: v, pass: ripPassOf(true), phase: ripPhase, _path: pathDirs });
          const above = pcs.filter(p => p.y + p.h <= v + 0.5);
          const below = pcs.filter(p => p.y >= v - 0.5);
          const a = buildGuillotinePlan(x0, y0, x1, v, above, [...pathDirs, 'rL']);
          const b = buildGuillotinePlan(x0, v, x1, y1, below, [...pathDirs, 'rR']);
          out.cuts.push(...a.cuts, ...b.cuts);
          out.offcuts.push(...a.offcuts, ...b.offcuts);
        } else {
          out.cuts.push({ x1: v, y1: y0, x2: v, y2: y1, pass: ripPassOf(false), phase: ripPhase, _path: pathDirs });
          const left  = pcs.filter(p => p.x + p.w <= v + 0.5);
          const right = pcs.filter(p => p.x >= v - 0.5);
          const l = buildGuillotinePlan(x0, y0, v, y1, left,  [...pathDirs, 'rL']);
          const r = buildGuillotinePlan(v, y0, x1, y1, right, [...pathDirs, 'rR']);
          out.cuts.push(...l.cuts, ...r.cuts);
          out.offcuts.push(...l.offcuts, ...r.offcuts);
        }
        return out;
      }
    }

    // ──── Outer offcut stripping ────
    // Phase-1 rips are cut FIRST physically, so emit them before crosses so
    // their geometry captures the full region bounds. Phase-3 rips are cut
    // after phase-2 crosses — emit crosses first so rips see the reduced
    // bounds that match physical reality.
    if (ripPhase === 1) {
      if (ripIsH) { stripBot(); stripTop(); stripRight(); stripLeft(); }
      else        { stripRight(); stripLeft(); stripBot(); stripTop(); }
    } else {
      if (ripIsH) { stripRight(); stripLeft(); stripBot(); stripTop(); }
      else        { stripBot(); stripTop(); stripRight(); stripLeft(); }
    }

    // ──── Interior CROSS (structural split in cross direction) ────
    if (pcs.length > 1) {
      const crossCands = (ripIsH
        ? [...new Set(pcs.flatMap(p => [p.x, p.x + p.w]))].filter(x => x > x0 + 0.5 && x < x1 - 0.5 && !spans(x, 'v'))
        : [...new Set(pcs.flatMap(p => [p.y, p.y + p.h]))].filter(y => y > y0 + 0.5 && y < y1 - 0.5 && !spans(y, 'h')));
      const crossBest = pickFrom(crossCands, ripIsH ? 'v' : 'h');
      if (crossBest) {
        const v = crossBest.v;
        if (ripIsH) {
          out.cuts.push({ x1: v, y1: y0, x2: v, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs });
          const left  = pcs.filter(p => p.x + p.w <= v + 0.5);
          const right = pcs.filter(p => p.x >= v - 0.5);
          const l = buildGuillotinePlan(x0, y0, v, y1, left,  [...pathDirs, 'cL']);
          const r = buildGuillotinePlan(v, y0, x1, y1, right, [...pathDirs, 'cR']);
          out.cuts.push(...l.cuts, ...r.cuts);
          out.offcuts.push(...l.offcuts, ...r.offcuts);
        } else {
          out.cuts.push({ x1: x0, y1: v, x2: x1, y2: v, pass: ripPassOf(true), phase: 2, _path: pathDirs });
          const above = pcs.filter(p => p.y + p.h <= v + 0.5);
          const below = pcs.filter(p => p.y >= v - 0.5);
          const a = buildGuillotinePlan(x0, y0, x1, v, above, [...pathDirs, 'cL']);
          const b = buildGuillotinePlan(x0, v, x1, y1, below, [...pathDirs, 'cR']);
          out.cuts.push(...a.cuts, ...b.cuts);
          out.offcuts.push(...a.offcuts, ...b.offcuts);
        }
        return out;
      }
    }

    // Residual region
    if (pcs.length === 0) out.offcuts.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    return out;
  }

  const plan = buildGuillotinePlan(0, 0, sW0, sH0, origPieces);

  // Transform cuts + offcuts into display coordinates if the layout is rotated.
  // The transform is a transposition (x↔y, w↔h) — it matches the same transform
  // applied to pieces above. ripIsH etc. were computed in original space so the
  // pre-rotation cut order is preserved.
  if (layoutRotate) {
    plan.cuts = plan.cuts.map(c => ({ ...c, x1: c.y1, y1: c.x1, x2: c.y2, y2: c.x2 }));
    plan.offcuts = plan.offcuts.map(o => ({ ...o, x: o.y, y: o.x, w: o.h, h: o.w }));
  }

  // ── Finalize cross phases: 2 if a rip follows somewhere in this cut's subtree,
  // else 4. "Subtree" = cuts emitted LATER in DFS order whose path starts with
  // this cut's path (same region or any descendant region).
  const pathStartsWith = (path, prefix) => {
    if (path.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) if (path[i] !== prefix[i]) return false;
    return true;
  };
  for (let i = 0; i < plan.cuts.length; i++) {
    const c = plan.cuts[i];
    if (c.pass !== crossPass) continue;  // only crosses need resolving
    const myPath = c._path || [];
    let hasRipAfter = false;
    for (let j = i + 1; j < plan.cuts.length; j++) {
      const later = plan.cuts[j];
      if (later.pass === ripPass && pathStartsWith(later._path || [], myPath)) {
        hasRipAfter = true; break;
      }
    }
    c.phase = hasRipAfter ? 2 : 4;
  }

  // Merge collinear cuts within kerf distance — a single saw pass should be ONE line.
  const kerfTol = Math.max(4, (sheet.kerf || 3) + 1);
  const cutLines = [];
  for (const c of plan.cuts) {
    const horiz = c.y1 === c.y2;
    let merged = null;
    for (const m of cutLines) {
      const mHoriz = m.y1 === m.y2;
      if (mHoriz !== horiz) continue;
      if (horiz) {
        if (Math.abs(m.y1 - c.y1) > kerfTol) continue;
        if (m.x2 < c.x1 - 0.5 || c.x2 < m.x1 - 0.5) continue;
      } else {
        if (Math.abs(m.x1 - c.x1) > kerfTol) continue;
        if (m.y2 < c.y1 - 0.5 || c.y2 < m.y1 - 0.5) continue;
      }
      merged = m; break;
    }
    if (merged) {
      if (horiz) {
        merged.y1 = merged.y2 = (merged.y1 + c.y1) / 2;
        merged.x1 = Math.min(merged.x1, c.x1);
        merged.x2 = Math.max(merged.x2, c.x2);
      } else {
        merged.x1 = merged.x2 = (merged.x1 + c.x1) / 2;
        merged.y1 = Math.min(merged.y1, c.y1);
        merged.y2 = Math.max(merged.y2, c.y2);
      }
      merged.pass = Math.min(merged.pass, c.pass);
      merged.phase = Math.min(merged.phase ?? 4, c.phase ?? 4);
    } else {
      cutLines.push({ ...c });
    }
  }

  // Keep DFS emit order — each cut depends on the physical rectangle left by
  // earlier cuts, and the planner emits in dependency order (parent cut, then
  // children). Phase-based sort would invert this for sibling outer-strip rips
  // (phase 3) vs interior crosses (phase 2) in the same region, producing cuts
  // that pass through pieces when executed.

  // ── Split cuts to reflect physical reality at the time each cut is made ──
  // When a cut comes AFTER a perpendicular cut that intersects its span, the
  // region it crosses is already separated — so the single planned cut is in
  // fact multiple physical saw passes, one per still-connected sub-piece.
  // Replace each such cut with a segment for each sub-piece.
  const finalCuts = [];
  for (const c of cutLines) {
    const isH = c.y1 === c.y2;
    const cuts = [];
    for (const prior of finalCuts) {
      const priorIsH = prior.y1 === prior.y2;
      if (priorIsH === isH) continue;  // parallel cuts don't split each other
      if (isH) {
        if (prior.x1 > c.x1 + 0.5 && prior.x1 < c.x2 - 0.5 &&
            c.y1 >= prior.y1 - 0.5 && c.y1 <= prior.y2 + 0.5) {
          cuts.push(prior.x1);
        }
      } else {
        if (prior.y1 > c.y1 + 0.5 && prior.y1 < c.y2 - 0.5 &&
            c.x1 >= prior.x1 - 0.5 && c.x1 <= prior.x2 + 0.5) {
          cuts.push(prior.y1);
        }
      }
    }
    if (!cuts.length) { finalCuts.push({ ...c }); continue; }
    cuts.sort((a, b) => a - b);
    // Minimum meaningful segment length = larger than a kerf (else it's just a saw-pass artefact)
    const minSeg = kerfTol;
    if (isH) {
      let x = c.x1;
      for (const ix of cuts) { if (ix - x > minSeg) finalCuts.push({ ...c, x1: x, x2: ix }); x = ix; }
      if (c.x2 - x > minSeg) finalCuts.push({ ...c, x1: x, x2: c.x2 });
    } else {
      let y = c.y1;
      for (const iy of cuts) { if (iy - y > minSeg) finalCuts.push({ ...c, y1: y, y2: iy }); y = iy; }
      if (c.y2 - y > minSeg) finalCuts.push({ ...c, y1: y, y2: c.y2 });
    }
  }
  cutLines.length = 0;
  cutLines.push(...finalCuts);

  // Drop cut segments that only traverse already-separated offcut regions —
  // i.e. segments that don't lie along ANY piece edge. These are "phantom"
  // passes created by the segmentation logic when a prior perpendicular cut
  // pre-separated the region the cut was planned through.
  const adjTol = kerfTol;  // allow for kerf offset between piece edge and cut line
  const segmentTouchesPiece = (c) => {
    const isH = c.y1 === c.y2;
    for (const p of rotPieces) {
      if (isH) {
        const xOverlap = p.x < c.x2 - 0.5 && p.x + p.w > c.x1 + 0.5;
        if (!xOverlap) continue;
        if (Math.abs(p.y - c.y1) <= adjTol || Math.abs(p.y + p.h - c.y1) <= adjTol) return true;
      } else {
        const yOverlap = p.y < c.y2 - 0.5 && p.y + p.h > c.y1 + 0.5;
        if (!yOverlap) continue;
        if (Math.abs(p.x - c.x1) <= adjTol || Math.abs(p.x + p.w - c.x1) <= adjTol) return true;
      }
    }
    return false;
  };
  const kept = cutLines.filter(segmentTouchesPiece);
  cutLines.length = 0;
  cutLines.push(...kept);

  // Filter out kerf-slot offcuts (too small to be meaningful)
  const offcutRects = plan.offcuts.filter(o => o.w >= kerfTol + 1 && o.h >= kerfTol + 1);

  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (const cl of cutLines) {
    ctx.lineWidth = cl.pass === 1 ? 1.0 : 0.8;
    ctx.beginPath();
    ctx.moveTo(OX + cl.x1 * scale, OY + cl.y1 * scale);
    ctx.lineTo(OX + cl.x2 * scale, OY + cl.y2 * scale);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // ── Draw pieces ──
  for (const p of rotPieces) {
    const x = OX + p.x*scale, y = OY + p.y*scale, w = p.w*scale, h = p.h*scale;
    const fill  = layoutColor ? toPastel(p.item.color) : 'rgb(235,235,235)';
    const bdCol = layoutColor ? toPastelDark(p.item.color) : '#aaa';
    const txtColor = '#333';

    ctx.fillStyle = fill; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2; ctx.strokeRect(x+.6, y+.6, w-1.2, h-1.2);

    // Edge banding dashed lines (inset 3px)
    const ebEdges = p.item.edges || {};
    const inset = 3;
    const ebSides = [
      {side:'L1', x1:x+inset,   y1:y+inset,   x2:x+w-inset, y2:y+inset  },
      {side:'W2', x1:x+w-inset, y1:y+inset,   x2:x+w-inset, y2:y+h-inset},
      {side:'L3', x1:x+w-inset, y1:y+h-inset, x2:x+inset,   y2:y+h-inset},
      {side:'W4', x1:x+inset,   y1:y+h-inset, x2:x+inset,   y2:y+inset  },
    ];
    ebSides.forEach(({side, x1, y1, x2, y2}) => {
      const s = ebEdges[side]; if (!s) return;
      const mat = edgeBands.find(e => e.id === s.id); if (!mat) return;
      ctx.save();
      ctx.setLineDash([3,3]); ctx.strokeStyle = mat.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.restore();
    });

    // Grain lines
    const pGrain = p.item.grain || 'none';
    if (pGrain !== 'none' && layoutGrain) {
      const gdir = p.rotated ? (pGrain==='h'?'v':'h') : pGrain;
      ctx.save();
      ctx.beginPath(); ctx.rect(x+1,y+1,w-2,h-2); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.65;
      const sp = Math.max(5, Math.min(14, w/8, h/8));
      if (gdir==='h') { for (let gy=y+sp; gy<y+h; gy+=sp) { ctx.beginPath(); ctx.moveTo(x,gy); ctx.lineTo(x+w,gy); ctx.stroke(); } }
      else { for (let gx=x+sp; gx<x+w; gx+=sp) { ctx.beginPath(); ctx.moveTo(gx,y); ctx.lineTo(gx,y+h); ctx.stroke(); } }
      ctx.restore();
    }

    // ── Label + dims inside part ──
    const pW = Math.round(p.rotated ? p.item.h : p.item.w);
    const pH = Math.round(p.rotated ? p.item.w : p.item.h);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Centered label (if there's room)
    const labelRoom = w > 30 && h > 18;
    if (labelRoom && p.item.label) {
      ctx.fillStyle = txtColor;
      ctx.font = labelFont;
      const lbl = trunc(p.item.label, Math.floor(w / (fs * 0.58)));
      ctx.fillText(lbl, x + w/2, y + h/2);
    }

    // Width dim at top-inside, height dim at left-inside (rotated) — both inside part
    ctx.fillStyle = '#333';
    ctx.font = dimFont;
    if (w > 30) {
      // Width near top, clear of the label
      ctx.fillText(`${pW}`, x + w/2, y + Math.min(fs + 4, h * 0.22));
    }
    if (h > 30) {
      // Height rotated on left side, clear of the label
      ctx.save();
      ctx.translate(x + Math.min(fs + 4, w * 0.22), y + h/2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${pH}`, 0, 0);
      ctx.restore();
    }
  }

  // ── Offcut dims — inside each offcut rectangle, centred top + left ──
  // Skip a dim if it's redundant (matches sheet edge or a touching piece's matching dim).
  ctx.save();
  ctx.fillStyle = '#8a8a8a';
  ctx.font = dimFont;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const eq = (a, b) => Math.abs(a - b) < 1;
  for (const oc of offcutRects) {
    const oW = Math.round(oc.w), oH = Math.round(oc.h);
    // Touching pieces on each side (edge-shared)
    const touchLeft  = rotPieces.filter(p => eq(p.x + p.w, oc.x) && p.y < oc.y + oc.h && p.y + p.h > oc.y);
    const touchRight = rotPieces.filter(p => eq(p.x, oc.x + oc.w) && p.y < oc.y + oc.h && p.y + p.h > oc.y);
    const touchTop   = rotPieces.filter(p => eq(p.y + p.h, oc.y) && p.x < oc.x + oc.w && p.x + p.w > oc.x);
    const touchBot   = rotPieces.filter(p => eq(p.y, oc.y + oc.h) && p.x < oc.x + oc.w && p.x + p.w > oc.x);

    // Skip height if it matches sheet height OR matches an adjacent piece's height
    const skipH = eq(oc.h, sH)
      || touchLeft.some(p => eq(p.h, oc.h))
      || touchRight.some(p => eq(p.h, oc.h));
    // Skip width if it matches sheet width OR matches an adjacent piece's width
    const skipW = eq(oc.w, sW)
      || touchTop.some(p => eq(p.w, oc.w))
      || touchBot.some(p => eq(p.w, oc.w));

    const oxo = OX + oc.x * scale;
    const oyo = OY + oc.y * scale;
    const owo = oc.w * scale;
    const oho = oc.h * scale;
    if (!skipW && owo > 24 && oho > 14) {
      ctx.fillText(`${oW}`, oxo + owo / 2, oyo + Math.min(fs + 4, oho * 0.22));
    }
    if (!skipH && oho > 30 && owo > 14) {
      ctx.save();
      ctx.translate(oxo + Math.min(fs + 4, owo * 0.22), oyo + oho / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${oH}`, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // Sheet border
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.4; ctx.strokeRect(OX + .7, OY + .7, cw - 1.4, ch - 1.4);

  // ── Overall sheet dimensions (bottom arrow + left arrow) ──
  ctx.save();
  ctx.strokeStyle = '#666'; ctx.lineWidth = 0.8;
  ctx.fillStyle = '#333'; ctx.font = dimFont;
  const by = OY + ch + 16;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.beginPath(); ctx.moveTo(OX, by); ctx.lineTo(OX + cw, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OX, by - 4); ctx.lineTo(OX, by + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OX + cw, by - 4); ctx.lineTo(OX + cw, by + 4); ctx.stroke();
  const swText = `${sW}`;
  const swW = ctx.measureText(swText).width;
  ctx.fillStyle = '#fff';
  ctx.fillRect(OX + cw / 2 - swW / 2 - 4, by - fs / 2 - 1, swW + 8, fs + 2);
  ctx.fillStyle = '#333';
  ctx.fillText(swText, OX + cw / 2, by);

  const lx = Math.max(6, FAR_L - 12);
  ctx.save();
  ctx.translate(lx, OY + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#666';
  ctx.beginPath(); ctx.moveTo(-ch / 2, 0); ctx.lineTo(ch / 2, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-ch / 2, -4); ctx.lineTo(-ch / 2, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ch / 2, -4); ctx.lineTo(ch / 2, 4); ctx.stroke();
  const shText = `${sH}`;
  const shW = ctx.measureText(shText).width;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-shW / 2 - 4, -fs / 2 - 1, shW + 8, fs + 2);
  ctx.fillStyle = '#333';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(shText, 0, 0);
  ctx.restore();
  ctx.restore();

  // ── Optional: numbered cut-order overlay ──
  if (layoutCutOrder && cutLines.length) {
    ctx.save();
    let step = 1;
    // Use the planner's insertion order — it already emits:
    //   1. Outer offcut rips for this region
    //   2. Outer offcut cross cuts
    //   3. Interior cut (rip preferred over cross)
    //   4. Recurse into sub-regions (DFS)
    // That matches physical cutting sequence: a sub-region's rips/crosses only
    // appear after its parent strip has been separated.
    const ordered = cutLines;
    const badgeR = Math.max(8, Math.min(11, fs + 2));
    ctx.font = `700 ${Math.round(badgeR * 1.1)}px ${FONT_FAMILY}`;
    for (const cl of ordered) {
      const mx = OX + ((cl.x1 + cl.x2) / 2) * scale;
      const my = OY + ((cl.y1 + cl.y2) / 2) * scale;
      ctx.beginPath(); ctx.arc(mx, my, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#222'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(step++), mx, my + 0.5);
    }
    ctx.restore();
  }
}

function renderSummary(area) {
  if (!results || !results.layouts.length) {
    area.innerHTML = '<p style="color:#94a3b8;font-size:13px;padding:20px">No results. Click Optimize first.</p>';
    return;
  }
  const u = window.units === 'metric' ? 'mm' : 'in';

  let html = `<div class="cutsheet-toolbar">
    <div style="font-size:14px;font-weight:700;color:var(--text)">Workshop Cut Sheet</div>
    <div style="display:flex;gap:8px">
      <span style="font-size:12px;color:var(--muted);align-self:center">${results.placed} pieces · ${results.layouts.length} sheet${results.layouts.length!==1?'s':''}</span>
      <button class="btn btn-outline" onclick="printLayout('print')" style="font-size:11px;padding:5px 10px" title="Send to printer">Print</button>
      <button class="btn btn-outline" onclick="printLayout('pdf')" style="font-size:11px;padding:5px 10px" title="Save as PDF">PDF</button>
    </div>
  </div>`;

  results.layouts.forEach((layout, si) => {
    const pct = (layout.util * 100).toFixed(0);
    const wasteColor = layout.util > 0.7 ? 'var(--success)' : layout.util > 0.4 ? 'var(--accent)' : 'var(--danger)';
    html += `
    <div class="cutsheet-sheet">
      <div class="cutsheet-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="cutsheet-title">Sheet ${si + 1}</span>
          <span class="cutsheet-sub">${layout.sheet.name} &nbsp;·&nbsp; ${layout.sheet.w}×${layout.sheet.h} ${u}</span>
        </div>
        <span style="font-size:12px;font-weight:700;color:${wasteColor}">${pct}% used &nbsp;·&nbsp; ${(layout.waste*100).toFixed(0)}% waste</span>
      </div>
      <table class="cutsheet-table">
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th>Label</th>
            <th style="width:80px;text-align:right">W (${u})</th>
            <th style="width:80px;text-align:right">H (${u})</th>
            <th style="width:48px;text-align:center">Grain</th>
            <th style="width:60px">Notes</th>
            <th style="width:32px;text-align:center">✓</th>
          </tr>
        </thead>
        <tbody>
          ${layout.placed.map((p, i) => {
            const baseGrain = layout.sheet.grain || 'none';
            const cutW = p.rotated ? p.item.h : p.item.w;
            const cutH = p.rotated ? p.item.w : p.item.h;
            const grainDir = baseGrain === 'none' ? '—' : (p.rotated ? (baseGrain==='h'?'↕':'↔') : (baseGrain==='h'?'↔':'↕'));
            return `<tr>
              <td class="cutsheet-num">${i + 1}</td>
              <td><span class="color-dot" style="background:${p.item.color};margin-right:6px;display:inline-block;vertical-align:middle"></span>${p.item.label}</td>
              <td class="cutsheet-dim">${cutW}</td>
              <td class="cutsheet-dim">${cutH}</td>
              <td style="text-align:center;font-size:15px;color:var(--muted)">${grainDir}</td>
              <td>${p.rotated ? '<span class="badge badge-orange" style="font-size:9px">rotated</span>' : ''}</td>
              <td style="text-align:center"><span class="cut-checkbox" onclick="this.classList.toggle(\'checked\')"></span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  });

  if (results.unplaced.length) {
    html += `<div class="cutsheet-sheet" style="border-color:var(--danger)">
      <div class="cutsheet-header" style="background:rgba(239,68,68,0.08)">
        <span class="cutsheet-title" style="color:var(--danger)">⚠ Unplaced Pieces (${results.unplaced.length})</span>
        <span class="cutsheet-sub" style="color:var(--danger)">Add more sheets to fit these</span>
      </div>
      <table class="cutsheet-table">
        <thead><tr><th>Label</th><th style="text-align:right">W (${u})</th><th style="text-align:right">H (${u})</th></tr></thead>
        <tbody>${results.unplaced.map(p=>`<tr><td>${p.label}</td><td class="cutsheet-dim">${p.w}</td><td class="cutsheet-dim">${p.h}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  area.innerHTML = html;
}

// ══════════════════════════════════════════
// QUOTE HELPERS
// ══════════════════════════════════════════
// ── Smart Suggest System ──
function _smartClientSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const allClients = [...new Set([...clients.map(c => c.name), ...quotes.map(q => quoteClient(q)), ...orders.map(o => orderClient(o))].filter(Boolean))];
  const matches = val ? allClients.filter(c => c.toLowerCase().includes(val) && c.toLowerCase() !== val) : allClients;
  if (!matches.length && !val) { box.style.display = 'none'; return; }
  const inputId = input.id;
  let html = matches.slice(0,8).map(c => {
    const initial = c.charAt(0).toUpperCase();
    return `<div class="client-suggest-item" onmousedown="document.getElementById('${inputId}').value='${c.replace(/'/g,'&#39;')}';document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon">${initial}</span>
      <span>${_escHtml(c)}</span>
    </div>`;
  }).join('');
  html += `<div class="client-suggest-add" onmousedown="_openNewClientPopup('${inputId}')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new client</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

function _smartProjectSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const allProjects = [...new Set([...projects.map(p => p.name), ...quotes.map(q => quoteProject(q)), ...orders.map(o => orderProject(o))].filter(Boolean))];
  const matches = val ? allProjects.filter(p => p.toLowerCase().includes(val) && p.toLowerCase() !== val) : allProjects;
  if (!matches.length && !val) { box.style.display = 'none'; return; }
  const inputId = input.id;
  let html = matches.slice(0,8).map(p => {
    const proj = projects.find(px => px.name === p);
    const clientName = proj ? proj.client : '';
    return `<div class="client-suggest-item" onmousedown="document.getElementById('${inputId}').value='${p.replace(/'/g,'&#39;')}';document.getElementById('${boxId}').style.display='none';_autoFillClientFromProject('${p.replace(/'/g,'&#39;')}','${inputId}')">
      <span class="suggest-icon">P</span>
      <span style="flex:1">${_escHtml(p)}</span>
      ${clientName ? `<span style="font-size:11px;color:var(--muted)">${_escHtml(clientName)}</span>` : ''}
    </div>`;
  }).join('');
  html += `<div class="client-suggest-add" onmousedown="_openNewProjectPopup('${inputId}')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new project</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// Auto-fill client when selecting a project that has a known client
function _autoFillClientFromProject(projName, projInputId) {
  const proj = projects.find(p => p.name === projName);
  if (!proj || !proj.client) return;
  // Determine which client input to fill based on the project input
  const clientInputId = projInputId.replace('-project', '-client');
  const clientInput = document.getElementById(clientInputId);
  if (clientInput && !clientInput.value) clientInput.value = proj.client;
}

// ── New Client/Project Popup (inline creation) ──
function _openNewClientPopup(targetInputId) {
  // Close any suggest dropdowns
  document.querySelectorAll('.client-suggest-list').forEach(b => b.style.display = 'none');
  // Pre-fill with what user typed
  const existing = document.getElementById(targetInputId)?.value || '';
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">New Client</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">NAME</label><input class="pf-input pf-input-lg" id="pnc-name" value="${_escHtml(existing)}"></div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">EMAIL</label><input class="pf-input" id="pnc-email" type="email" placeholder="email@example.com"></div>
        <div class="pf" style="flex:1"><label class="pf-label">PHONE</label><input class="pf-input" id="pnc-phone" placeholder="+44 ..."></div>
      </div>
      <div class="pf"><label class="pf-label">ADDRESS</label><input class="pf-input" id="pnc-address" placeholder="Street, City..."></div>
      <div class="pf"><label class="pf-label">NOTES</label><textarea class="pf-textarea" id="pnc-notes" rows="2" placeholder="Optional notes..."></textarea></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewClientPopup('${targetInputId}')">Add Client</button>
    </div>`;
  _openPopup(html, 'sm');
}

async function _saveNewClientPopup(targetInputId) {
  const name = _popupVal('pnc-name');
  if (!name) { _toast('Client name is required', 'error'); return; }
  // Check for duplicate
  if (clients.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    // Just set the input and close
    document.getElementById(targetInputId).value = name;
    _closePopup();
    _toast('Client already exists — selected', 'info');
    return;
  }
  const newClient = {
    id: Date.now(),
    name,
    email: _popupVal('pnc-email') || '',
    phone: _popupVal('pnc-phone') || '',
    address: _popupVal('pnc-address') || '',
    notes: _popupVal('pnc-notes') || '',
    user_id: _userId
  };
  clients.push(newClient);
  try { await _db('clients').insert(newClient); } catch(e) { console.warn('Client insert failed', e); }
  document.getElementById(targetInputId).value = name;
  _closePopup();
  renderClientsMain();
  _toast(`Client "${name}" added`, 'success');
}

function _openNewProjectPopup(targetInputId) {
  document.querySelectorAll('.client-suggest-list').forEach(b => b.style.display = 'none');
  const existing = document.getElementById(targetInputId)?.value || '';
  // Get client from the corresponding client input
  const clientInputId = targetInputId.replace('-project', '-client');
  const clientVal = document.getElementById(clientInputId)?.value || '';
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">New Project</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">PROJECT NAME</label><input class="pf-input pf-input-lg" id="pnp-name" value="${_escHtml(existing)}"></div>
      <div class="pf" style="position:relative"><label class="pf-label">CLIENT</label>
        <div class="smart-input-wrap"><input class="pf-input" id="pnp-client" value="${_escHtml(clientVal)}" placeholder="Search or add client..." autocomplete="off" oninput="_smartClientSuggest(this,'pnp-client-suggest')" onfocus="_smartClientSuggest(this,'pnp-client-suggest')" onblur="setTimeout(()=>document.getElementById('pnp-client-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewClientPopup('pnp-client')" title="Add new client">+</div></div>
        <div id="pnp-client-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      <div class="pf"><label class="pf-label">DESCRIPTION</label><textarea class="pf-textarea" id="pnp-desc" rows="2" placeholder="Project details..."></textarea></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewProjectPopup('${targetInputId}')">Add Project</button>
    </div>`;
  _openPopup(html, 'sm');
}

async function _saveNewProjectPopup(targetInputId) {
  const name = _popupVal('pnp-name');
  if (!name) { _toast('Project name is required', 'error'); return; }
  const clientName = _popupVal('pnp-client') || '';
  // Check for duplicate
  if (projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    document.getElementById(targetInputId).value = name;
    const clientInputId = targetInputId.replace('-project', '-client');
    const ci = document.getElementById(clientInputId);
    if (ci && clientName && !ci.value) ci.value = clientName;
    _closePopup();
    _toast('Project already exists — selected', 'info');
    return;
  }
  const newProject = {
    id: Date.now(),
    name,
    client: clientName,
    desc: _popupVal('pnp-desc') || '',
    status: 'active',
    user_id: _userId
  };
  projects.push(newProject);
  try { await _db('projects').insert(newProject); } catch(e) { console.warn('Project insert failed', e); }
  document.getElementById(targetInputId).value = name;
  // Also fill client input
  const clientInputId = targetInputId.replace('-project', '-client');
  const ci = document.getElementById(clientInputId);
  if (ci && clientName && !ci.value) ci.value = clientName;
  _closePopup();
  renderProjectsMain();
  _toast(`Project "${name}" added`, 'success');
}

// Close suggest on blur
document.addEventListener('click', e => {
  document.querySelectorAll('.client-suggest-list').forEach(box => {
    if (!box.contains(e.target) && !e.target.closest('.smart-input-wrap')) box.style.display = 'none';
  });
});

function printWorkOrder(id, mode='print') {
  const o = orders.find(o => o.id === id);
  if (!o) return;
  if (mode === 'pdf') { _buildWorkOrderPDF(o); return; }
  const biz = getBizInfo();
  const cur = window.currency;
  const rel = _relativeDate(o.due);
  const statusColMap = { quote:'#6b7280', confirmed:'#2563eb', production:'#d97706', delivery:'#0891b2', complete:'#16a34a' };
  const statusCol = statusColMap[o.status] || '#6b7280';
  const stageLabels = ['Quote Sent','Confirmed','In Production','Ready for Delivery','Complete'];
  const stageKeys   = ['quote','confirmed','production','delivery','complete'];
  const currentIdx  = stageKeys.indexOf(o.status);

  const stageRows = stageKeys.map((s, i) => {
    const done = i < currentIdx;
    const active = i === currentIdx;
    return `<tr style="background:${active ? '#fffbeb' : 'transparent'}">
      <td style="width:22px;padding:8px 6px 8px 12px">
        <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${done?statusCol:active?statusCol:'#ddd'};background:${done?statusCol:'transparent'};display:flex;align-items:center;justify-content:center">
          ${done ? '<span style="color:#fff;font-size:11px;font-weight:700">✓</span>' : active ? '<div style="width:8px;height:8px;border-radius:50%;background:'+statusCol+'"></div>' : ''}
        </div>
      </td>
      <td style="padding:8px 12px;font-size:14px;font-weight:${active?700:400};color:${active?'#111':'#555'}">${stageLabels[i]}</td>
      <td style="padding:8px 12px;width:140px;border-bottom:1px solid #e8e8e8"></td>
      <td style="padding:8px 12px;width:100px;border-bottom:1px solid #e8e8e8;font-size:11px;color:#bbb">Initials</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Work Order #WO-${String(o.id).padStart(4,'0')}</title>
<style>
  @page { size:A4; margin:12mm 14mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; background:#fff; font-size:13px; }
  /* Top bar */
  .top-bar { background:${statusCol}; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-radius:6px 6px 0 0; }
  .top-bar-left { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px; opacity:.9; }
  .top-bar-right { font-size:13px; font-weight:800; letter-spacing:.5px; }
  /* Header */
  .hdr { border:1.5px solid #ddd; border-top:none; padding:16px; border-radius:0 0 6px 6px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:flex-start; }
  .biz-name { font-size:14px; font-weight:800; }
  .biz-contact { font-size:10px; color:#888; margin-top:3px; line-height:1.7; }
  .wo-ref { text-align:right; }
  .wo-ref-num { font-size:28px; font-weight:800; letter-spacing:-1px; color:#111; }
  .wo-date { font-size:10px; color:#aaa; margin-top:3px; }
  /* Job details */
  .job-block { margin-bottom:18px; }
  .job-client { font-size:26px; font-weight:800; letter-spacing:-.5px; line-height:1.1; }
  .job-project { font-size:16px; color:#444; margin-top:4px; font-weight:400; }
  /* Info strip */
  .info-strip { display:grid; grid-template-columns:repeat(3,1fr); border:1.5px solid #e0e0e0; border-radius:6px; overflow:hidden; margin-bottom:18px; }
  .info-cell { padding:12px 14px; border-right:1px solid #e0e0e0; }
  .info-cell:last-child { border-right:none; }
  .info-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#aaa; margin-bottom:4px; }
  .info-val { font-size:17px; font-weight:800; }
  .info-sub { font-size:10px; color:#888; margin-top:1px; }
  /* Notes */
  .section-label { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#aaa; margin-bottom:6px; margin-top:16px; }
  .notes-content { border:1.5px solid #e0e0e0; border-radius:6px; padding:14px; font-size:14px; color:#222; line-height:1.75; min-height:60px; }
  /* Production checklist */
  .stages-table { width:100%; border-collapse:collapse; border:1.5px solid #e0e0e0; border-radius:6px; overflow:hidden; margin-top:6px; }
  .stages-table td { border-bottom:1px solid #eee; vertical-align:middle; }
  .stages-table tr:last-child td { border-bottom:none; }
  .col-hdr { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#bbb; padding:6px 12px; background:#f8f8f8; border-bottom:1.5px solid #e0e0e0; }
  /* Production notes lines */
  .note-line { border-bottom:1px solid #e0e0e0; height:28px; margin-bottom:2px; }
  /* Sign-off */
  .signoff { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:6px; }
  .signoff-field { border-top:1.5px solid #555; padding-top:6px; }
  .signoff-label { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; }
  .footer { margin-top:24px; border-top:1px solid #eee; padding-top:8px; display:flex; justify-content:space-between; font-size:9px; color:#ccc; }
</style></head><body>

<div class="top-bar">
  <div class="top-bar-left">Work Order &nbsp;&bull;&nbsp; ${STATUS_LABELS[o.status] || o.status}</div>
  <div class="top-bar-right">#WO-${String(o.id).padStart(4,'0')}</div>
</div>
<div class="hdr">
  <div>
    <div class="biz-name">${biz.name || 'ProCabinet'}</div>
    <div class="biz-contact">${[biz.phone, biz.email, biz.address, biz.abn ? 'ABN: ' + biz.abn : ''].filter(Boolean).join('<br>')}</div>
  </div>
  <div class="wo-ref">
    <div class="wo-ref-num">#WO-${String(o.id).padStart(4,'0')}</div>
    <div class="wo-date">Issued ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
  </div>
</div>

<div class="job-block">
  <div class="job-client">${orderClient(o)}</div>
  <div class="job-project">${orderProject(o)}</div>
</div>

<div class="info-strip">
  <div class="info-cell">
    <div class="info-lbl">Due Date</div>
    <div class="info-val" style="font-size:15px">${o.due || 'TBD'}</div>
    ${rel ? `<div class="info-sub" style="color:${rel.color}">${rel.label}</div>` : ''}
  </div>
  <div class="info-cell">
    <div class="info-lbl">Job Value</div>
    <div class="info-val">${cur}${(o.value||0).toLocaleString('en-US',{minimumFractionDigits:0})}</div>
  </div>
  <div class="info-cell">
    <div class="info-lbl">Stage</div>
    <div class="info-val" style="font-size:14px;color:${statusCol}">${STATUS_LABELS[o.status] || o.status}</div>
  </div>
</div>

${o.notes ? `<div class="section-label">Job Notes &amp; Instructions</div><div class="notes-content">${(o.notes||'').replace(/\n/g,'<br>')}</div>` : ''}

<div class="section-label" style="margin-top:18px">Production Stages</div>
<table class="stages-table">
  <thead><tr>
    <td class="col-hdr" style="width:32px"></td>
    <td class="col-hdr">Stage</td>
    <td class="col-hdr">Completed (date)</td>
    <td class="col-hdr">Sign off</td>
  </tr></thead>
  <tbody>${stageRows}</tbody>
</table>

<div class="section-label" style="margin-top:18px">Production Notes</div>
${[1,2,3,4,5].map(() => `<div class="note-line"></div>`).join('')}

<div class="section-label" style="margin-top:18px">Sign-off</div>
<div class="signoff">
  <div class="signoff-field"><div class="signoff-label">Prepared by</div></div>
  <div class="signoff-field"><div class="signoff-label">Date started</div></div>
  <div class="signoff-field"><div class="signoff-label">Date completed</div></div>
</div>

<div class="footer">
  <span>${biz.name || 'ProCabinet'} — ProCabinet.App</span>
  <span>Printed ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
</div>
</body></html>`;

  _saveAsPDF(html);
}

async function deductStockFromCutList() {
  if (!window.results || !window.results.layouts) { _toast('Run optimization first.', 'error'); return; }
  if (!_requireAuth()) return;
  // Count sheets used by name
  const usage = {};
  window.results.layouts.forEach(l => {
    const name = l.sheet.label || l.sheet.name || '';
    usage[name] = (usage[name] || 0) + 1;
  });
  let deducted = 0;
  for (const [name, count] of Object.entries(usage)) {
    const stock = stockItems.find(s => s.name === name);
    if (!stock) continue;
    const newQty = Math.max(0, stock.qty - count);
    await _db('stock_items').update({ qty: newQty }).eq('id', stock.id);
    stock.qty = newQty;
    deducted += count;
  }
  if (deducted) {
    _toast(deducted + ' sheet' + (deducted !== 1 ? 's' : '') + ' deducted from stock', 'success');
    renderStockMain();
  } else {
    _toast('No matching stock items found to deduct', 'info');
  }
}

function quoteFromCutList(matCost) {
  switchSection('quote');
  const el = document.getElementById('q-materials');
  if (el) { el.value = matCost.toFixed(2); el.focus(); }
  const pn = document.getElementById('q-project');
  if (pn && !pn.value) pn.value = 'Untitled Job';
  // Subtle flash to draw attention to the pre-filled field
  if (el) { el.style.background = 'rgba(232,168,56,0.2)'; setTimeout(() => el.style.background = '', 1200); }
}

async function markQuoteSent(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'sent' }).eq('id', id);
  q.status = 'sent';
  renderQuoteMain();
}

function printQuote(id, mode='print') {
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  if (mode === 'pdf') { _buildQuotePDF(q); return; }
  const cur = window.currency;
  const fmt  = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  const fmt0 = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const logo = getBizLogo();
  const matVal = q._totals ? q._totals.materials : (q.materials || 0);
  const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
  const sub = matVal + labVal;
  const markupAmt = sub * q.markup / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * q.tax / 100;
  const total = afterMarkup + taxAmt;
  const biz = getBizInfo();
  const statusCol = { draft:'#888', sent:'#2563eb', approved:'#16a34a' }[q.status] || '#888';
  const statusTxt = { draft:'Draft', sent:'Sent', approved:'Approved' }[q.status] || q.status;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quote #Q-${String(q.id).padStart(4,'0')} — ${quoteProject(q)}</title>
<style>
  @page { size:A4; margin:15mm 18mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; background:#fff; font-size:13px; line-height:1.5; }
  /* Header */
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:14px; border-bottom:3px solid #111; margin-bottom:28px; }
  .biz-name { font-size:20px; font-weight:800; letter-spacing:-.4px; }
  .biz-contact { font-size:11px; color:#777; margin-top:4px; line-height:1.7; }
  .doc-right { text-align:right; }
  .doc-word { font-size:30px; font-weight:200; letter-spacing:4px; text-transform:uppercase; color:#222; }
  .doc-num { font-size:12px; color:#888; margin-top:6px; }
  .status-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusCol}; margin-right:4px; }
  /* Bill-to / project */
  .bill-row { display:flex; gap:48px; margin-bottom:28px; }
  .bill-block label { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#bbb; display:block; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:4px; }
  .bill-block .name { font-size:17px; font-weight:700; }
  .bill-block .sub  { font-size:13px; color:#555; margin-top:2px; }
  /* Line items */
  table { width:100%; border-collapse:collapse; margin-bottom:2px; }
  thead tr { border-bottom:1.5px solid #111; }
  thead th { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:#888; padding:8px 10px; text-align:left; }
  thead th.r { text-align:right; }
  tbody td { padding:11px 10px; border-bottom:1px solid #f0f0f0; font-size:13px; }
  tbody td.r { text-align:right; font-variant-numeric:tabular-nums; }
  tr.subtotal td { color:#777; font-size:12px; padding:6px 10px; border-bottom:none; }
  tr.subtotal td.r { color:#777; }
  /* Total box */
  .total-box { display:flex; justify-content:space-between; align-items:center; background:#111; color:#fff; padding:14px 18px; border-radius:6px; margin-top:10px; }
  .total-label { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; font-weight:600; opacity:.7; }
  .total-amount { font-size:26px; font-weight:800; letter-spacing:-.5px; }
  /* Notes */
  .notes-box { margin-top:24px; background:#f8f8f8; border-radius:6px; padding:16px 18px; }
  .notes-box label { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#aaa; display:block; margin-bottom:8px; }
  .notes-box p { font-size:13px; color:#333; line-height:1.65; }
  /* Validity */
  .validity { margin-top:20px; font-size:11px; color:#aaa; }
  /* Acceptance */
  .acceptance { margin-top:32px; padding-top:20px; border-top:1px solid #e0e0e0; }
  .acceptance-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#555; margin-bottom:12px; }
  .acceptance-text { font-size:12px; color:#777; margin-bottom:22px; line-height:1.6; }
  .sig-grid { display:grid; grid-template-columns:2fr 1fr; gap:32px; margin-top:4px; }
  .sig-field { border-bottom:1.5px solid #ccc; padding-bottom:0; padding-top:32px; }
  .sig-label { font-size:9px; text-transform:uppercase; letter-spacing:.6px; color:#bbb; margin-top:5px; }
  /* Footer */
  .footer { margin-top:36px; display:flex; justify-content:space-between; font-size:9px; color:#ccc; border-top:1px solid #f0f0f0; padding-top:10px; }
  @media print { .acceptance { break-inside:avoid; } }
</style></head><body>

<div class="hdr">
  <div style="display:flex;align-items:center;gap:12px">
    ${logo ? `<img src="${logo}" style="max-height:48px;max-width:120px;object-fit:contain">` : ''}
    <div>
      <div class="biz-name">${biz.name || 'Your Business'}</div>
      <div class="biz-contact">${[biz.phone, biz.email, biz.address, biz.abn ? 'ABN: ' + biz.abn : ''].filter(Boolean).join('<br>')}</div>
    </div>
  </div>
  <div class="doc-right">
    <div class="doc-word">Quotation</div>
    <div class="doc-num">#Q-${String(q.id).padStart(4,'0')} &nbsp;&bull;&nbsp; ${q.date} &nbsp;&bull;&nbsp; <span class="status-dot"></span>${statusTxt}</div>
  </div>
</div>

<div class="bill-row">
  <div class="bill-block">
    <label>Prepared for</label>
    <div class="name">${_escHtml(quoteClient(q))}</div>
  </div>
  <div class="bill-block">
    <label>Project</label>
    <div class="name" style="font-size:15px">${_escHtml(quoteProject(q))}</div>
  </div>
</div>

<table>
  <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
  <tbody>
    ${(q.notes||'').split(/\r?\n/).filter(l => l.includes('\u2014') || l.includes('—')).map(cl => {
      const parts = cl.split(/\u2014|—/).map(s=>s.trim());
      return '<tr><td style="padding:10px"><strong style="font-size:14px">'+_escHtml(parts[0])+'</strong><br><span style="font-size:11px;color:#888;padding-left:14px">'+_escHtml(parts.slice(1).join(' — ').trim())+'</span></td><td class="r"></td></tr>';
    }).join('')}
    ${(q.notes||'').split(/\r?\n/).some(l => l.includes('\u2014') || l.includes('—')) ? '<tr><td colspan="2" style="border-bottom:1.5px solid #ddd;padding:0"></td></tr>' : ''}
    ${q.markup > 0 || q.tax > 0 ? `<tr class="subtotal"><td style="color:#aaa">Subtotal</td><td class="r">${fmt(sub)}</td></tr>` : ''}
    ${q.markup > 0 ? `<tr class="subtotal"><td style="padding-left:20px">Markup &nbsp;<span style="color:#bbb">(${q.markup}%)</span></td><td class="r">+ ${fmt(markupAmt)}</td></tr>` : ''}
    ${q.tax > 0 ? `<tr class="subtotal"><td style="padding-left:20px">Tax &nbsp;<span style="color:#bbb">(${q.tax}%)</span></td><td class="r">+ ${fmt(taxAmt)}</td></tr>` : ''}
  </tbody>
</table>
<div class="total-box">
  <div class="total-label">Total Amount Due</div>
  <div class="total-amount">${fmt0(total)}</div>
</div>

${(() => {
  const noteLines = (q.notes||'').split(/\r?\n/).filter(Boolean);
  const plainNotes = noteLines.filter(l => !l.includes('\u2014') && !l.includes('—')).join('<br>');
  return plainNotes ? '<div class="notes-box"><label>Notes</label><p>'+_escHtml(plainNotes)+'</p></div>' : '';
})()}

<div class="validity">This quote is valid for 30 days from the date of issue. Prices are subject to change after this period.</div>

<div class="acceptance">
  <div class="acceptance-title">Acceptance</div>
  <div class="acceptance-text">To accept this quotation, please sign below and return a copy to ${biz.name || 'us'}${biz.email ? ' at ' + biz.email : ''}. Work will commence upon receipt of a signed copy and any agreed deposit.</div>
  <div class="sig-grid">
    <div>
      <div class="sig-field"></div>
      <div class="sig-label">Client Signature</div>
    </div>
    <div>
      <div class="sig-field"></div>
      <div class="sig-label">Date</div>
    </div>
  </div>
</div>

<div class="footer">
  <span>${biz.name || 'ProCabinet'} &mdash; Generated by ProCabinet.App</span>
  <span>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
</div>
</body></html>`;

  _printInFrame(html);
}

async function duplicateQuote(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const row = { user_id: _userId, markup: q.markup, tax: q.tax, status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}), notes: q.notes || '' };
  if (q.client_id) row.client_id = q.client_id;
  if (q.project_id) row.project_id = q.project_id;
  const { data, error } = await _db('quotes').insert(row).select().single();
  if (error) { _toast('Could not duplicate quote — ' + (error.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  quotes.unshift(data);
  // Copy any existing quote_lines so the duplicate has matching totals
  try {
    const { data: oldLines } = await _db('quote_lines').select('*').eq('quote_id', q.id);
    if (oldLines && oldLines.length) {
      const newLines = oldLines.map(l => { const nl = { ...l, quote_id: data.id }; delete nl.id; return nl; });
      await _db('quote_lines').insert(newLines);
      await _refreshQuoteTotals(data.id);
    }
  } catch(e) { console.warn('[duplicateQuote] copy lines failed:', e.message || e); }
  _toast('Quote duplicated', 'success');
  renderQuoteMain();
}

async function updateQuoteField(id, field, val) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const numFields = ['materials','labour','markup','tax'];
  const v = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  q[field] = v;
  await _db('quotes').update({ [field]: v }).eq('id', id);
  renderQuoteMain();
}

// Clients CSV import/export — moves to clients.js when the
// CLIENTS section gets carved out of app.js.
function exportClientsCSV() {
  const allClients = [...new Set([...quotes.map(q=>quoteClient(q)), ...orders.map(o=>orderClient(o))].filter(Boolean))].sort();
  if (!allClients.length) { _toast('No clients to export', 'error'); return; }
  const rows = [['Client Name','Quotes','Orders','Total Value']];
  allClients.forEach(c => {
    const qCount = quotes.filter(q=>quoteClient(q)===c).length;
    const oCount = orders.filter(o=>orderClient(o)===c).length;
    const totalVal = quotes.filter(q=>quoteClient(q)===c).reduce((s,q)=>s+quoteTotal(q),0) + orders.filter(o=>orderClient(o)===c).reduce((s,o)=>s+o.value,0);
    rows.push([c, qCount, oCount, totalVal.toFixed(2)]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `clients-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Clients exported', 'success');
}
function importClientsCSV() {
  _toast('Clients are created automatically from quotes and orders', 'info');
}

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
      const newQty = Math.max(0, stockItem.qty - sheetsUsed);
      setStockQty(stockItem.id, newQty);
      _toast(`Removed ${sheetsUsed} sheet${sheetsUsed!==1?'s':''} from "${stockItem.name}" (${stockItem.qty + sheetsUsed} → ${newQty})`, 'success');
    } else {
      _toast('No matching stock item found — update stock manually', 'info');
    }
  }, false);
}

function useStockInCutList(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  addSheet(item.name, item.w, item.h, Math.max(1, item.qty));
  _toast(`"${item.name}" added to cut list`, 'success');
  switchSection('cutlist');
}

// ── Stock Libraries ──
let stockLibraries = [];
function loadStockLibraries() { try { stockLibraries = JSON.parse(localStorage.getItem('pc_stock_libraries')||'[]'); } catch(e) { stockLibraries=[]; } }
function saveStockLibraries() { localStorage.setItem('pc_stock_libraries', JSON.stringify(stockLibraries)); }

function toggleStockLibraries() {}

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

function loadStockLibrary(idx) {
  const lib = stockLibraries[idx];
  if (!lib) return;
  _confirm(`Load "${lib.name}"? This will replace current stock.`, () => {
    // Clear current and load
    stockItems.length = 0;
    (lib.items||[]).forEach(item => stockItems.push(item));
    if (lib.categories) localStorage.setItem('pc_stock_cats', JSON.stringify(lib.categories));
    if (lib.suppliers) localStorage.setItem('pc_stock_suppliers', JSON.stringify(lib.suppliers));
    renderStockMain();
    _updateStockBadge();
    _toast(`Loaded "${lib.name}"`, 'success');
  }, false);
}

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
    const file = e.target.files[0]; if (!file) return;
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
  const rows = [['Name','SKU','Category',`W (${u})`,`H (${u})`,'Qty','Low Alert','Cost/Sheet','Total Value','Status']];
  stockItems.forEach(i => {
    const cat = _scGet(i.id);
    const status = i.qty <= i.low ? 'Low Stock' : 'OK';
    rows.push([i.name, i.sku||'', cat, i.w, i.h, i.qty, i.low, i.cost.toFixed(2), (i.qty*i.cost).toFixed(2), status]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
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
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('CSV has no data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 6) continue;
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

function printStockList(mode='print') {
  if (mode === 'pdf') { _buildStockPDF(); return; }
  const cur = window.currency;
  const u = window.units === 'metric' ? 'mm' : 'in';
  const biz = getBizInfo();
  const usedCats = [...new Set(stockItems.map(i => _scGet(i.id)).filter(Boolean))].sort();
  const totalValue = stockItems.reduce((s,i) => s + i.qty*i.cost, 0);
  const totalSheets = stockItems.reduce((s,i) => s + i.qty, 0);
  const lowItems = stockItems.filter(i => i.qty <= i.low);

  // Group by category
  const grouped = {};
  stockItems.forEach(i => { const c = _scGet(i.id) || 'Uncategorised'; if (!grouped[c]) grouped[c] = []; grouped[c].push(i); });
  const catOrder = [...STOCK_CATS, ...Object.keys(grouped).filter(k => !STOCK_CATS.includes(k) && k !== 'Uncategorised'), 'Uncategorised'];

  const rows = catOrder.filter(c => grouped[c]).map(cat => `
    <tr><td colspan="7" style="background:#f5f5f5;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;padding:6px 10px">${cat}</td></tr>
    ${grouped[cat].map(i => {
      const isLow = i.qty <= i.low;
      const sup = _ssGet(i.id);
      return `<tr style="${isLow?'background:#fff5f5':''}">
        <td>${i.name}</td>
        <td>${i.sku||'—'}</td>
        <td>${i.w}×${i.h}${u}</td>
        <td style="font-size:10px;color:#666">${sup.supplier||''}</td>
        <td style="text-align:right;${isLow?'color:#c0392b;font-weight:700':''}">${i.qty}</td>
        <td style="text-align:right">${i.low}</td>
        <td style="text-align:right">${cur}${(i.qty*i.cost).toFixed(0)}</td>
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

async function setStockQty(id, val) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const qty = Math.max(0, parseInt(val) || 0);
  await _db('stock_items').update({ qty }).eq('id', id);
  item.qty = qty;
  renderStockMain();
}

async function updateStockField(id, field, val) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const numFields = ['w','h','qty','low','cost'];
  const v = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  item[field] = v;
  await _db('stock_items').update({ [field]: v }).eq('id', id);
  renderStockMain();
}

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
// AUTH HELPERS
// ══════════════════════════════════════════
function dismissAuth() {
  document.getElementById('auth-screen').classList.add('hidden');
}
function showAuthFromPaywall() {
  document.getElementById('paywall-modal').classList.add('hidden');
  _showAuth();
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Ctrl/Cmd + number: switch tabs
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    const tabMap = {'1':'dashboard','2':'cutlist','3':'stock','4':'cabinet','5':'quote','6':'orders','7':'schedule','8':'projects','9':'clients'};
    if (tabMap[e.key]) { e.preventDefault(); switchSection(tabMap[e.key]); return; }
  }
  // ? key shows keyboard shortcuts (when not typing in an input)
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.contentEditable?.toString()?.includes('true');
  if (e.key === '?' && !typing) {
    _showShortcutsHelp();
  }
  // N key: new item for current tab (when not typing)
  if (e.key === 'n' && !typing && !e.ctrlKey && !e.metaKey) {
    const active = document.querySelector('.section-panel.active')?.id;
    if (active === 'panel-quote') { document.getElementById('q-client')?.focus(); e.preventDefault(); }
    else if (active === 'panel-orders') { document.getElementById('o-client')?.focus(); e.preventDefault(); }
    else if (active === 'panel-stock') { document.getElementById('stock-name')?.focus(); e.preventDefault(); }
    else if (active === 'panel-clients') { document.getElementById('cl-name')?.focus(); e.preventDefault(); }
    else if (active === 'panel-projects') { document.getElementById('pj-name')?.focus(); e.preventDefault(); }
  }
  // / key: focus search (when not typing)
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
    const search = document.querySelector('.section-panel.active .order-search-input, .section-panel.active input[type="search"], .section-panel.active input[placeholder*="Search"]');
    if (search) { search.focus(); e.preventDefault(); }
  }
});
function _showShortcutsHelp() {
  const existing = document.getElementById('shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const m = document.createElement('div');
  m.id = 'shortcuts-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px)';
  m.onclick = e => { if (e.target === m) m.remove(); };
  const shortcuts = [
    ['Ctrl/Cmd + 1–9', 'Switch tabs'],
    ['N', 'New item (focus sidebar form)'],
    ['/', 'Focus search'],
    ['Escape', 'Close dialogs / overlays'],
    ['?', 'Toggle this help']
  ];
  m.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:15px;font-weight:800;color:var(--text)">Keyboard Shortcuts</div>
      <button onclick="this.closest('#shortcuts-modal').remove()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:0 4px">×</button>
    </div>
    ${shortcuts.map(([key,desc]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:12px;color:var(--text2)">${desc}</span>
      <kbd style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);font-family:inherit">${key}</kbd>
    </div>`).join('')}
  </div>`;
  document.body.appendChild(m);
}
// Escape key closes overlays
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const auth = document.getElementById('auth-screen');
  if (auth && !auth.classList.contains('hidden')) { dismissAuth(); return; }
  const paywall = document.getElementById('paywall-modal');
  if (paywall && !paywall.classList.contains('hidden')) { paywall.classList.add('hidden'); return; }
  const acct = document.getElementById('account-panel');
  if (acct && acct.classList.contains('open')) { acct.classList.remove('open'); return; }
  const proj = document.getElementById('projects-panel');
  if (proj && proj.classList.contains('open')) { proj.classList.remove('open'); return; }
  // Close any open confirm dialogs
  const confirms = document.querySelectorAll('[id^="_confirm_"]');
  if (confirms.length) { confirms.forEach(c => c.remove()); return; }
});

// ══════════════════════════════════════════
// FREE TIER
// ══════════════════════════════════════════
const FREE_LIMIT = 5;
function _getOptCount() { return parseInt(localStorage.getItem('pcOptCount') || '0', 10); }
function _incOptCount() { localStorage.setItem('pcOptCount', _getOptCount() + 1); _updateOptCounter(); }
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
// PROJECTS PANEL
// ══════════════════════════════════════════
async function _clLoadProjectList() {
  const { data, error } = await _db('projects').select('id,name,updated_at').order('updated_at', { ascending: false });
  if (!error && data) { _clProjectCache = data; }
}

// ──────────────────────────────────────────────
// UNIFIED PROJECT SAVE
// One canonical place to save project data, regardless of which subsystem (Cut List
// or Cabinet Quote) initiated the save. Ensures (user_id, name) maps to ONE projects
// row. The scope payload is written to the schema's child tables (sheets, pieces,
// edge_bands, quote_lines); the projects row itself only holds UI prefs in `ui_prefs`
// post Phase 7 (alias `data` pre-rename).
// scope: 'cutlist' | 'quote'
// payload: free-form scope-specific blob (cutlist: {sheets, pieces, settings}; quote: {lines, date})
// Returns: { projectId, isNew, error }
// ──────────────────────────────────────────────
async function _saveProjectScoped({ name, scope, payload }) {
  if (!_userId) return { error: 'Not authenticated' };
  if (!name || !name.trim()) return { error: 'Project name required' };
  if (scope !== 'cutlist' && scope !== 'quote') return { error: 'Invalid scope: ' + scope };
  const trimmed = name.trim();

  // 1. Find-or-create the projects row for (user, name). The row itself stores
  //    nothing scope-specific anymore — child tables hold the data.
  const { data: existing, error: lookupErr } = await _db('projects')
    .select('id')
    .eq('user_id', _userId)
    .eq('name', trimmed);
  if (lookupErr) return { error: 'Lookup failed: ' + lookupErr.message };

  let projectId, isNew;
  if (existing && existing.length > 0) {
    projectId = existing[0].id; isNew = false;
    await _db('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  } else {
    const { data: created, error: insertErr } = await _db('projects')
      .insert([{ name: trimmed, user_id: _userId }]);
    if (insertErr) return { error: 'Insert failed: ' + insertErr.message };
    projectId = (created && created[0]) ? created[0].id : null;
    isNew = true;
  }

  // 2. Replace the scope's child-table rows with the current payload.
  if (scope === 'cutlist' && projectId) {
    try { await _replaceCutListChildTables(projectId, payload); }
    catch(e) { console.warn('[saveProjectScoped] child-table sync failed:', e.message || e); }
  }
  if (scope === 'quote' && projectId) {
    try { await _replaceQuoteLinesChildTable(projectId, payload); }
    catch(e) { console.warn('[saveProjectScoped] quote_lines sync failed:', e.message || e); }
  }

  return { projectId, isNew };
}

// Phase 3.6: replace quote_lines for the project's "default" cabinet-quote (tagged [CQ_DEFAULT]).
// Idempotent: finds existing tagged quote or creates one, then deletes old lines and inserts new.
async function _replaceQuoteLinesChildTable(projectId, payload) {
  if (!projectId) return;
  const lines = payload.lines || [];
  const tag = '[CQ_DEFAULT]';
  // Find existing default quote for this project
  const { data: existing } = await _db('quotes').select('id,notes').eq('project_id', projectId).eq('user_id', _userId);
  let quoteId = null;
  if (existing) {
    const found = existing.find(q => (q.notes || '').includes(tag));
    if (found) quoteId = found.id;
  }
  if (!quoteId) {
    const { data: created, error } = await _db('quotes').insert([{
      user_id: _userId, project_id: projectId,
      notes: tag, status: 'draft',
      date: payload.date || new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
      markup: 0, tax: 0,
    }]);
    if (error) { console.warn('[saveProjectScoped] quote create failed:', error.message); return; }
    quoteId = (created && created[0]) ? created[0].id : null;
  }
  if (!quoteId) return;
  // Replace lines
  await _db('quote_lines').delete().eq('quote_id', quoteId);
  if (lines.length > 0 && typeof _cqLineToRow === 'function') {
    const rows = lines.map((l, i) => _cqLineToRow(l, i, quoteId));
    await _db('quote_lines').insert(rows);
  }
}

// Phase 3.5: replace sheets/pieces/edge_bands rows for a project with the current payload.
// Idempotent: deletes existing rows then inserts new ones. Doesn't touch piece_edges yet
// (would require resolving edge_band ids by name; deferred until edge banding flows are migrated).
async function _replaceCutListChildTables(projectId, payload) {
  if (!projectId) return;
  // Delete existing rows for this project (cascade not enabled here, but FK is — cascade handles piece_edges)
  await Promise.all([
    _db('sheets').delete().eq('project_id', projectId),
    _db('pieces').delete().eq('project_id', projectId),
    _db('edge_bands').delete().eq('project_id', projectId),
  ]);
  const sheets = payload.sheets || [];
  const pieces = payload.pieces || [];
  const ebs = payload.edgeBands || [];
  if (sheets.length) {
    const rows = sheets.map((s, i) => ({
      project_id: projectId, user_id: _userId, position: i,
      name: s.name || 'Sheet',
      w_mm: parseFloat(s.w) || 0, h_mm: parseFloat(s.h) || 0,
      qty: parseInt(s.qty, 10) || 1, kerf_mm: parseFloat(s.kerf) || 3,
      grain: s.grain || 'none', color: s.color || null,
      enabled: s.enabled !== false,
    }));
    await _db('sheets').insert(rows);
  }
  if (pieces.length) {
    const rows = pieces.map((pc, i) => ({
      project_id: projectId, user_id: _userId, position: i,
      label: pc.label || 'Part',
      w_mm: parseFloat(pc.w) || 0, h_mm: parseFloat(pc.h) || 0,
      qty: parseInt(pc.qty, 10) || 1,
      grain: pc.grain || 'none', material: pc.material || null,
      notes: pc.notes || null, color: pc.color || null,
      enabled: pc.enabled !== false,
    }));
    await _db('pieces').insert(rows);
  }
  if (ebs.length) {
    const rows = ebs.map((eb, i) => ({
      project_id: projectId, user_id: _userId, position: i,
      name: eb.name || 'Edge Band',
      thickness_mm: parseFloat(eb.thickness) || 0,
      width_mm: parseFloat(eb.width) || 0,
      length_m: parseFloat(eb.length) || 0,
      glue: eb.glue || null, color: eb.color || null,
    }));
    await _db('edge_bands').insert(rows);
  }
}

function _clSaveProjectByName(name) {
  if (!name) return;
  if (!_requireAuth()) return;
  const payload = {
    sheets:    JSON.parse(JSON.stringify(sheets)),
    pieces:    JSON.parse(JSON.stringify(pieces)),
    edgeBands: JSON.parse(JSON.stringify(edgeBands || [])),
    settings:  { units: window.units },
  };
  _saveProjectScoped({ name, scope: 'cutlist', payload }).then(({ projectId, error }) => {
    if (error) { _toast('Save failed: ' + error, 'error'); return; }
    _toast(`"${name}" saved`, 'success');
    _clLoadProjectList();
  });
}

function _clLoadProjectByIdx(idx) {
  const p = _clProjectCache[idx];
  if (!p) return;
  loadProject(p.id);
}

function _clDeleteProjectByIdx(idx) {
  const p = _clProjectCache[idx];
  if (!p) return;
  deleteProject(p.id);
}

// Save project via popup
function showSaveProjectForm() {
  if (!_requireAuth()) return;
  const defaultName = `Project ${new Date().toLocaleDateString()}`;
  _openPopup(`
    <h2 style="margin:0 0 16px">Save Cut List Project</h2>
    <div class="form-group"><label>Project Name</label>
      <input id="pop-save-proj-name" class="pop-input" value="${defaultName}" style="width:100%">
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" onclick="_confirmSaveProjectPopup()" style="flex:1">Save</button>
      <button class="btn" onclick="_closePopup()" style="flex:1">Cancel</button>
    </div>
  `, 'small');
  setTimeout(() => {
    const inp = document.getElementById('pop-save-proj-name');
    if (inp) { inp.focus(); inp.select(); }
  }, 50);
}
function _confirmSaveProjectPopup() {
  const name = _popupVal('pop-save-proj-name');
  if (!name) return;
  _clSaveProjectByName(name);
  _closePopup();
  _toast('Project saved: ' + name);
}
function hideSaveProjectForm() {}
async function confirmSaveProject() { _confirmSaveProjectPopup(); }
async function promptSaveProject() { showSaveProjectForm(); }

async function saveProject(name) {
  _clSaveProjectByName(name);
}

async function loadProject(id) {
  const { data, error } = await _db('projects').select('*').eq('id', id).single();
  if (error || !data) { _toast('Could not load project.', 'error'); return; }
  sheets = []; pieces = []; edgeBands = []; _sheetId = 1; _pieceId = 1; _edgeBandId = 1; pieceColorIdx = 0;

  // Source of truth: child tables (sheets / pieces / edge_bands).
  const [{ data: dbSheets }, { data: dbPieces }, { data: dbEdges }] = await Promise.all([
    _db('sheets').select('*').eq('project_id', id).order('position', { ascending: true }),
    _db('pieces').select('*').eq('project_id', id).order('position', { ascending: true }),
    _db('edge_bands').select('*').eq('project_id', id).order('position', { ascending: true }),
  ]);

  for (const r of (dbSheets || [])) {
    sheets.push({
      id: _sheetId++,
      name: r.name, w: r.w_mm, h: r.h_mm, qty: r.qty,
      kerf: r.kerf_mm, grain: r.grain,
      color: r.color || COLORS[pieceColorIdx++ % COLORS.length],
      enabled: r.enabled !== false,
      db_id: r.id,
    });
  }
  for (const r of (dbPieces || [])) {
    pieces.push({
      id: _pieceId++,
      label: r.label, w: r.w_mm, h: r.h_mm, qty: r.qty,
      grain: r.grain, material: r.material, notes: r.notes,
      color: r.color || COLORS[pieceColorIdx++ % COLORS.length],
      enabled: r.enabled !== false,
      edges: { L1: null, W2: null, L3: null, W4: null },
      db_id: r.id,
    });
  }
  for (const r of (dbEdges || [])) {
    edgeBands.push({
      id: _edgeBandId++,
      name: r.name, thickness: r.thickness_mm, width: r.width_mm,
      length: r.length_m, glue: r.glue, color: r.color,
      db_id: r.id,
    });
  }

  // ui_prefs holds layout/UI settings only (renamed from `data` in Phase 7).
  const prefs = data.ui_prefs || {};
  if (prefs.settings && prefs.settings.units) setUnits(prefs.settings.units);
  results = null;
  renderSheets(); renderPieces();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  document.getElementById('results-area').innerHTML = '<div class="empty-state"><h3>Project loaded</h3><p>Click Optimize to generate layouts.</p></div>';
  _toast('Project loaded — click Optimize to generate layouts', 'success');
}

function deleteProject(id) {
  _confirm('Delete this project? This cannot be undone.', async () => {
    await _db('projects').delete().eq('id', id);
    _clProjectCache = _clProjectCache.filter(p => p.id !== id);
  });
}

// ══════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════
function hexRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}
function trunc(s, n) { return s.length <= n ? s : s.slice(0, n-1) + '…'; }

// ══════════════════════════════════════════
// FORM DEFAULTS (persist across sessions)
// ══════════════════════════════════════════
(function() {
  const defs = { 'q-labour-rate': 65, 'q-hours': 8, 'q-markup': 20, 'q-tax': 13 };
  Object.entries(defs).forEach(([id, fallback]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const saved = localStorage.getItem('pc_' + id);
    if (saved !== null) el.value = saved;
    el.addEventListener('change', () => { localStorage.setItem('pc_' + id, el.value); _updateQuotePreview(); });
  });
  // Also update preview on input to these fields
  ['q-labour-rate','q-hours','q-materials','q-markup','q-tax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _updateQuotePreview);
  });
  _updateQuotePreview();
})();

function _orderDateToISO(str) {
  if (!str || str === 'TBD') return '';
  const p = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (p) {
    const m = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const mo = m[p[2].toLowerCase().substring(0,3)];
    if (mo) return p[3]+'-'+mo+'-'+p[1].padStart(2,'0');
  }
  try { const d = new Date(str); return !isNaN(d) ? d.toISOString().split('T')[0] : ''; } catch(e) { return ''; }
}

function _relativeDate(dateStr) {
  if (!dateStr || dateStr === 'TBD') return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return { label: 'Today', color: 'var(--warn)' };
  if (diff === 1) return { label: 'Tomorrow', color: 'var(--success)' };
  if (diff > 1 && diff <= 7) return { label: `in ${diff} days`, color: 'var(--success)' };
  if (diff > 7 && diff <= 30) return { label: `in ${diff} days`, color: 'var(--text2)' };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: 'var(--danger)' };
  return null;
}

function _updateQuotePreview() {
  const cur = window.currency;
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const rate = parseFloat(document.getElementById('q-labour-rate')?.value) || 0;
  const hrs  = parseFloat(document.getElementById('q-hours')?.value)       || 0;
  const mat  = parseFloat(document.getElementById('q-materials')?.value)   || 0;
  const mkp  = parseFloat(document.getElementById('q-markup')?.value)      || 0;
  const tax  = parseFloat(document.getElementById('q-tax')?.value)         || 0;
  const labour = rate * hrs;
  const sub    = labour + mat;
  const total  = sub * (1 + mkp/100) * (1 + tax/100);
  const prev   = document.getElementById('quote-form-preview');
  if (!prev) return;
  if (sub === 0) { prev.style.display = 'none'; return; }
  prev.style.display = '';
  const markupAmt = sub * mkp / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * tax / 100;
  document.getElementById('qfp-labour').textContent    = `${hrs}h @ ${cur}${rate}/hr = ${fmt(labour)}`;
  document.getElementById('qfp-materials').textContent = fmt(mat);
  document.getElementById('qfp-markup-label').textContent = `Markup (${mkp}%)`;
  document.getElementById('qfp-markup').textContent = `+${fmt(markupAmt)}`;
  document.getElementById('qfp-tax-label').textContent = `Tax (${tax}%)`;
  document.getElementById('qfp-tax').textContent = `+${fmt(taxAmt)}`;
  document.getElementById('qfp-total').textContent     = fmt(afterMarkup + taxAmt);
}

// ══════════════════════════════════════════
// CABINET BUILDER — line-based cabinet quoting
// ══════════════════════════════════════════

// ── CQ Settings State ──
let cqSettings = {
  labourRate: 65, markup: 20, tax: 13, deposit: 50, edgingPerM: 3,
  materials: [
    { name: 'Birch Ply 18mm', price: 72 },
    { name: 'Birch Ply 12mm', price: 58 },
    { name: 'Birch Ply 6mm', price: 42 },
    { name: 'Melamine 16mm', price: 45 },
    { name: 'MDF 18mm', price: 38 },
    { name: 'Hardwood Edging', price: 25 },
    { name: 'Plywood 3mm (backs)', price: 22 },
    { name: 'Solid Oak 20mm', price: 110 },
  ],
  hardware: [
    { name: 'Blum Hinges (pair)', price: 12 },
    { name: 'Soft-close Slides (pair)', price: 24 },
    { name: 'Shelf Pins (4)', price: 3 },
    { name: 'Handle - Bar', price: 8 },
    { name: 'Handle - Cup', price: 6 },
    { name: 'Push-to-Open', price: 14 },
    { name: 'Leg Levellers (4)', price: 10 },
    { name: 'Cam & Dowel (10)', price: 5 },
  ],
  finishes: [
    { name: 'None', price: 0 },
    { name: 'Oil (Osmo/Rubio)', price: 12 },
    { name: 'Lacquer', price: 18 },
    { name: 'Paint', price: 22 },
    { name: 'Stain + Oil', price: 15 },
    { name: 'Wax', price: 8 },
    { name: '2-Pack Spray', price: 35 },
  ],
  baseTypes: [
    { name: 'None', price: 0 },
    { name: 'Plinth', price: 20 },
    { name: 'Feet / Legs', price: 40 },
    { name: 'Castors', price: 60 },
    { name: 'Frame', price: 30 },
  ],
  constructions: [
    { name: 'Overlay', price: 0 },
    { name: 'Inset', price: 25 },
    { name: 'Face Frame', price: 35 },
  ],
  labourTimes: {
    carcass: 1.5,
    door: 0.4,
    drawer: 0.6,
    shelf: 0.25,
    finishPerM2: 0.5,
  }
};

// ── Cabinet Library ──
// Backed by the cabinet_templates DB table. Library is loaded on auth
// (_loadCabinetTemplatesFromDB) and stays in-memory; saves go straight to DB.
let cqLibrary = [];
async function _saveCabinetToDB(entry) {
  if (!_userId) return null;
  try {
    const { data, error } = await _db('cabinet_templates').insert({
      user_id: _userId,
      name: entry._libName || entry.name || 'Cabinet',
      type: 'base',
      default_w_mm: entry.w || null,
      default_h_mm: entry.h || null,
      default_d_mm: entry.d || null,
      default_specs: entry,
    }).select().single();
    if (error) { console.warn('[cabinet-template save]', error.message); return null; }
    return data?.id || null;
  } catch(e) { console.warn('[cabinet-template save]', e.message || e); return null; }
}
async function _deleteCabinetFromDB(dbId) {
  if (!_userId || !dbId) return;
  try {
    const { error } = await _db('cabinet_templates').delete().eq('id', dbId);
    if (error) console.warn('[cabinet-template delete]', error.message);
  } catch(e) { console.warn('[cabinet-template delete]', e.message || e); }
}
async function _loadCabinetTemplatesFromDB() {
  if (!_userId) return;
  try {
    const { data, error } = await _db('cabinet_templates').select('*').eq('user_id', _userId).order('name');
    if (error) { console.warn('[cabinet-template load]', error.message); return; }
    if (!data) return;
    cqLibrary = data.map(row => ({ ...(row.default_specs || {}), _libName: row.name, db_id: row.id }));
  } catch(e) { console.warn('[cabinet-template load]', e.message || e); }
}

// ── CQ Line Items State ──
let cqLines = [];
let cqNextId = 1;
let cqSavedQuotes = [];
let cqActiveQuoteIdx = -1;

const CQ_TYPES = ['Base Cabinet','Wall Cabinet','Tall Cabinet','Drawer Unit','Shelf Unit','Vanity','Island','Pantry','Custom'];
const SHEET_W = 2.44, SHEET_H = 1.22, SHEET_M2 = SHEET_W * SHEET_H;

// ── Load / Save Settings ──
function loadCQSettings() {
  try { const s = localStorage.getItem('pc_cq_settings'); if (s) cqSettings = JSON.parse(s); } catch(e) {}
  // Ensure defaults exist for all list fields
  if (!cqSettings.baseTypes || !cqSettings.baseTypes.length) cqSettings.baseTypes = [
    {name:'None',price:0},{name:'Plinth',price:20},{name:'Feet / Legs',price:40},{name:'Castors',price:60},{name:'Frame',price:30}
  ];
  if (!cqSettings.constructions || !cqSettings.constructions.length) cqSettings.constructions = [
    {name:'Overlay',price:0},{name:'Inset',price:25},{name:'Face Frame',price:35}
  ];
  if (!cqSettings.finishes || !cqSettings.finishes.length) cqSettings.finishes = [
    {name:'None',price:0},{name:'Oil (Osmo/Rubio)',price:12},{name:'Lacquer',price:18},{name:'Paint',price:22},{name:'Stain + Oil',price:15},{name:'Wax',price:8},{name:'2-Pack Spray',price:35}
  ];
  if (!cqSettings.labourTimes) cqSettings.labourTimes = {};
  const _lt = cqSettings.labourTimes;
  if (!_lt.carcass) _lt.carcass = 1.5;
  if (!_lt.door) _lt.door = 0.4;
  if (!_lt.drawer) _lt.drawer = 0.6;
  if (!_lt.fixedShelf) _lt.fixedShelf = 0.3;
  if (!_lt.adjShelfHoles) _lt.adjShelfHoles = 0.4;
  if (!_lt.looseShelf) _lt.looseShelf = 0.2;
  if (!_lt.partition) _lt.partition = 0.5;
  if (!_lt.endPanel) _lt.endPanel = 0.3;
  if (!_lt.finishPerM2) _lt.finishPerM2 = 0.5;
  if (!cqSettings.edgeBanding) cqSettings.edgeBanding = [{name:'Iron-on Veneer',price:3},{name:'PVC 1mm',price:4},{name:'PVC 2mm',price:5},{name:'Solid Timber',price:8}];
  // Persist defaults back so they stick
  localStorage.setItem('pc_cq_settings', JSON.stringify(cqSettings));
}
function saveCQSettings() {
  const g = id => parseFloat(document.getElementById(id)?.value);
  cqSettings.labourRate = g('cq-labour-rate') || 65;
  cqSettings.markup = g('cq-markup') || 20;
  cqSettings.tax = g('cq-tax') || 13;
  cqSettings.deposit = g('cq-deposit') || 50;
  cqSettings.edgingPerM = g('cq-edging-m') || 0;
  // labourTimes, materials, hardware, finishes, baseTypes, constructions
  // are updated inline via onblur handlers
  localStorage.setItem('pc_cq_settings', JSON.stringify(cqSettings));
}
function loadCQLines() {
  try { const s = localStorage.getItem('pc_cq_lines'); if (s) { cqLines = JSON.parse(s); cqNextId = Math.max(0, ...cqLines.map(l=>l.id)) + 1; } } catch(e) {}
  // Restore project + client names
  setTimeout(() => {
    const pn = document.getElementById('cq-project'); const saved = localStorage.getItem('pc_cq_project_name'); if (pn && saved) pn.value = saved;
    const cn = document.getElementById('cq-client'); const savedC = localStorage.getItem('pc_cq_client_name'); if (cn && savedC) cn.value = savedC;
  }, 100);
}
function saveCQLines() {
  localStorage.setItem('pc_cq_lines', JSON.stringify(cqLines));
  const pn = document.getElementById('cq-project');
  if (pn) localStorage.setItem('pc_cq_project_name', pn.value);
  const cn = document.getElementById('cq-client');
  if (cn) localStorage.setItem('pc_cq_client_name', cn.value);
}
function loadCQSaved() {
  try { const s = localStorage.getItem('pc_cq_saved'); if (s) cqSavedQuotes = JSON.parse(s); } catch(e) {}
}
function saveCQSaved() { localStorage.setItem('pc_cq_saved', JSON.stringify(cqSavedQuotes)); }

function toggleCQSettings() {
  switchCabTab('rates');
}

function switchCabTab(tab) {
  const rates = document.getElementById('cab-view-rates');
  const tabBuilder = document.getElementById('cab-tab-builder');
  const tabRates = document.getElementById('cab-tab-rates');
  // Get all builder content divs (everything in sidebar except the rates div and the tabs)
  const sidebar = document.getElementById('cq-sidebar');
  if (!sidebar) return;
  const builderDivs = Array.from(sidebar.children).filter(el => el.id !== 'cab-view-rates');

  if (tab === 'rates') {
    builderDivs.forEach(el => el.style.display = 'none');
    if (rates) rates.style.display = '';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'transparent'; tabBuilder.style.fontWeight = '500'; tabBuilder.style.color = 'var(--muted)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'var(--accent)'; tabRates.style.fontWeight = '700'; tabRates.style.color = 'var(--text)'; }
    renderCQRates();
  } else {
    builderDivs.forEach(el => el.style.display = '');
    if (rates) rates.style.display = 'none';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'var(--accent)'; tabBuilder.style.fontWeight = '700'; tabBuilder.style.color = 'var(--text)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'transparent'; tabRates.style.fontWeight = '500'; tabRates.style.color = 'var(--muted)'; }
  }
}

// ── Settings Lists Render ──
// ── Render editable list helper ──
function _cqListHTML(arr, path, unitLabel) {
  const cur = window.currency;
  return arr.map((item, i) => `<div class="cq-mat-row">
    <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCQSettings();renderCQPanel()">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${unitLabel||cur}</span>
      <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].price=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
    </div>
    <button onclick="${path}.splice(${i},1);saveCQSettings();renderCQRates();renderCQPanel()" style="font-size:16px">&times;</button>
  </div>`).join('');
}

function renderCQRates() {
  const el = document.getElementById('cq-rates-content');
  if (!el) return;
  const cur = window.currency;
  const lt = cqSettings.labourTimes || {};
  if (!window._ratesOpen) window._ratesOpen = {};
  const ro = window._ratesOpen;
  const isOpen = k => ro[k] === true;
  const chev = k => `<span style="font-size:10px;color:var(--muted);display:inline-block;transition:transform .2s;${isOpen(k)?'transform:rotate(90deg)':''}">&#9654;</span>`;

  function section(key, title, count, content) {
    return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none" onclick="window._ratesOpen.${key}=!window._ratesOpen.${key};renderCQRates()">
        ${chev(key)}
        <span style="font-size:13px;font-weight:600;color:var(--text);flex:1">${title}</span>
        <span style="font-size:11px;color:var(--muted)">${count}</span>
      </div>
      ${isOpen(key)?`<div style="padding:0 12px 10px;border-top:1px solid var(--border)">${content}</div>`:''}
    </div>`;
  }

  function listItems(arr, path, unit) {
    return arr.map((item,i) => `<div class="cq-mat-row" style="margin-top:4px">
      <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCQSettings();renderCQPanel()">
      <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
        <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${unit||cur}</span>
        <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].price=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
      </div>
      <button onclick="${path}.splice(${i},1);saveCQSettings();renderCQRates()" style="font-size:16px;background:none;border:none;color:var(--muted);cursor:pointer">&times;</button>
    </div>`).join('') + `<button class="cl-add-btn" onclick="${path}.push({name:'New',price:0});saveCQSettings();renderCQRates()" style="font-size:11px;padding:4px 8px;margin:6px 0 0">+ Add</button>`;
  }

  // Core Rates as list
  const coreItems = [
    {name:'Labour Rate',price:cqSettings.labourRate,path:'cqSettings.labourRate',unit:'per hour'},
    {name:'Markup',price:cqSettings.markup,path:'cqSettings.markup',unit:'%'},
    {name:'Tax / GST',price:cqSettings.tax,path:'cqSettings.tax',unit:'%'},
  ];
  const coreContent = coreItems.map(item => `<div class="cq-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
    </div>
  </div>`).join('');

  // Labour Times as list
  const labourItems = [
    {name:'Carcass (volume)',val:lt.carcass||1.5,path:'cqSettings.labourTimes.carcass',unit:'hrs/m³'},
    {name:'Per Door',val:lt.door||0.4,path:'cqSettings.labourTimes.door',unit:'hrs'},
    {name:'Per Drawer',val:lt.drawer||0.6,path:'cqSettings.labourTimes.drawer',unit:'hrs'},
    {name:'Fixed Shelf',val:lt.fixedShelf||0.3,path:'cqSettings.labourTimes.fixedShelf',unit:'hrs'},
    {name:'Adj. Shelf Holes',val:lt.adjShelfHoles||0.4,path:'cqSettings.labourTimes.adjShelfHoles',unit:'hrs'},
    {name:'Loose Shelf',val:lt.looseShelf||0.2,path:'cqSettings.labourTimes.looseShelf',unit:'hrs'},
    {name:'Partition',val:lt.partition||0.5,path:'cqSettings.labourTimes.partition',unit:'hrs'},
    {name:'End Panel',val:lt.endPanel||0.3,path:'cqSettings.labourTimes.endPanel',unit:'hrs'},
    {name:'Finish',val:lt.finishPerM2||0.5,path:'cqSettings.labourTimes.finishPerM2',unit:'hrs/m²'},
  ];
  const labourContent = labourItems.map(item => `<div class="cq-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.val}" step="0.05" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
    </div>
  </div>`).join('');

  // Edge Banding
  if (!cqSettings.edgeBanding) cqSettings.edgeBanding = [{name:'Iron-on Veneer',price:3},{name:'PVC 1mm',price:4},{name:'PVC 2mm',price:5},{name:'Solid Timber',price:8}];
  const edgeBandContent = listItems(cqSettings.edgeBanding, 'cqSettings.edgeBanding', cur+'/m');

  el.innerHTML = `
    ${section('core', 'Core Rates', '3 rates', coreContent)}
    ${section('labour', 'Labour Times', '9 rates', labourContent)}
    ${section('materials', 'Stock Materials', '('+stockItems.length+' in stock)', `<div style="position:relative;margin-top:6px"><div class="smart-input-wrap"><input type="text" id="rates-stock-search" placeholder="Search stock materials..." autocomplete="off" style="font-size:12px" oninput="_smartRatesStockSuggest(this,'rates-stock-suggest')" onfocus="_smartRatesStockSuggest(this,'rates-stock-suggest')" onblur="setTimeout(()=>document.getElementById('rates-stock-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new stock material">+</div></div><div id="rates-stock-suggest" class="client-suggest-list" style="display:none"></div></div>`)}
    ${section('hardware', 'Hardware', '('+cqSettings.hardware.length+' items)', listItems(cqSettings.hardware, 'cqSettings.hardware', cur))}
    ${section('finishes', 'Finishes', '('+stockItems.filter(s=>s.category==='Finishing').length+' in stock)', `<div style="position:relative;margin-top:6px"><div class="smart-input-wrap"><input type="text" id="rates-finish-search" placeholder="Search finishing products..." autocomplete="off" style="font-size:12px" oninput="_smartRatesFinishSuggest(this,'rates-finish-suggest')" onfocus="_smartRatesFinishSuggest(this,'rates-finish-suggest')" onblur="setTimeout(()=>document.getElementById('rates-finish-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new finish to stock">+</div></div><div id="rates-finish-suggest" class="client-suggest-list" style="display:none"></div></div>`)}
    ${section('edgebanding', 'Edge Banding', '('+stockItems.filter(s=>s.category==='Edge Banding').length+' in stock)', `<div style="position:relative;margin-top:6px"><div class="smart-input-wrap"><input type="text" id="rates-edge-search" placeholder="Search edge banding..." autocomplete="off" style="font-size:12px" oninput="_smartRatesEdgeSuggest(this,'rates-edge-suggest')" onfocus="_smartRatesEdgeSuggest(this,'rates-edge-suggest')" onblur="setTimeout(()=>document.getElementById('rates-edge-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new edge banding to stock">+</div></div><div id="rates-edge-suggest" class="client-suggest-list" style="display:none"></div></div>`)}
    ${section('basetypes', 'Base Types', '('+(cqSettings.baseTypes||[]).length+' types)', listItems(cqSettings.baseTypes||[], 'cqSettings.baseTypes', cur))}
    ${section('constructions', 'Construction Types', '('+(cqSettings.constructions||[]).length+' types)', listItems(cqSettings.constructions||[], 'cqSettings.constructions', cur+'/m²'))}
  `;
}

function renderCQSettingsLists() { renderCQRates(); }
function addCQMaterial() { cqSettings.materials.push({name:'New Material',price:0}); saveCQSettings(); renderCQRates(); }
function addCQHardware() { cqSettings.hardware.push({name:'New Hardware',price:0}); saveCQSettings(); renderCQRates(); }
function addCQFinish() { if (!cqSettings.finishes) cqSettings.finishes = []; cqSettings.finishes.push({name:'New Finish',price:0}); saveCQSettings(); renderCQRates(); }

// ── Cabinet Library ──
function toggleCabPanel(panel) {
  const projects = document.getElementById('cq-projects-panel');
  const library = document.getElementById('cq-library-panel');
  if (panel === 'projects') {
    if (projects) projects.style.display = projects.style.display === 'none' ? '' : 'none';
    if (library) library.style.display = 'none';
    renderCQProjects();
  } else {
    if (library) library.style.display = library.style.display === 'none' ? '' : 'none';
    if (projects) projects.style.display = 'none';
  }
}
function toggleCabLibrary() { toggleCabPanel('library'); }

// ── Project Library (saves project name + all cabinets) ──
let cqProjectLibrary = [];
function loadCQProjectLibrary() { try { cqProjectLibrary = JSON.parse(localStorage.getItem('pc_cq_projects')||'[]'); } catch(e) { cqProjectLibrary=[]; } }
function saveCQProjectLibrary() { localStorage.setItem('pc_cq_projects', JSON.stringify(cqProjectLibrary)); }

function _cqSaveProjectByName(name) {
  if (!name || !name.trim()) { _toast('Enter a project name', 'error'); return; }
  cqSaveProject(name.trim());
}
function _cqSaveCabByName(name) {
  if (!name || !name.trim()) { _toast('Enter a cabinet name', 'error'); return; }
  const line = cqLines[cqActiveLineIdx];
  if (line) line.name = name.trim();
  cqSaveToLibrary();
}
function _saveStockLibByName(name) {
  if (!name || !name.trim()) { _toast('Enter a library name', 'error'); return; }
  saveStockLibrary(name.trim());
}
function cqSaveProject(nameOverride) {
  const name = nameOverride || '';
  if (!name) { _toast('Enter a project name first', 'error'); return; }
  const project = {
    id: Date.now(), name,
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    lines: JSON.parse(JSON.stringify(cqLines)),
    projectName: name
  };
  // Phase 1.5: also persist to the unified projects table so Cut List + Cabinet Quote
  // share one canonical row per (user, name). This converges both subsystems before the
  // Phase 2 data migration runs. localStorage write below stays as fallback.
  if (_userId) {
    _saveProjectScoped({
      name,
      scope: 'quote',
      payload: { lines: project.lines, date: project.date }
    }).then(({ error }) => {
      if (error) console.warn('CQ project DB save failed:', error);
    });
  }
  cqProjectLibrary.unshift(project);
  saveCQProjectLibrary();
  renderCQProjects();
  // Open projects panel to show saved
  const p = document.getElementById('cq-projects-panel');
  if (p) p.style.display = '';
  _toast(`Project "${name}" saved`, 'success');
}

function cqLoadProject(idx) {
  const p = cqProjectLibrary[idx];
  if (!p) return;
  cqLines = JSON.parse(JSON.stringify(p.lines || []));
  cqNextId = cqLines.length > 0 ? Math.max(...cqLines.map(l=>l.id)) + 1 : 1;
  const nameEl = document.getElementById('cq-project');
  if (nameEl) nameEl.value = p.projectName || p.name || '';
  cqActiveLineIdx = 0;
  saveCQLines();
  renderCQPanel();
  toggleCabPanel('projects'); // close panel
  _toast(`Loaded "${p.name}"`, 'success');
}

function cqDeleteProject(idx) {
  _confirm('Delete this project?', () => {
    cqProjectLibrary.splice(idx, 1);
    saveCQProjectLibrary();
    renderCQProjects();
  });
}

function renderCQProjects() {
  const el = document.getElementById('cq-projects-list');
  if (!el) return;
  const cur = window.currency;
  if (!cqProjectLibrary.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface);text-align:center">${_userId ? 'No saved projects yet. Enter a project name and click Save Project.' : '<div class="projects-signin">Sign in to save & load projects. <span onclick="dismissAuth();_showAuth()">Sign in</span></div>'}</div>`;
    return;
  }
  el.innerHTML = cqProjectLibrary.map((p, i) => {
    const count = (p.lines||[]).length;
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:3px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer" onclick="cqLoadProject(${i})">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(p.name)}</div>
        <div style="font-size:10px;color:var(--muted)">${p.date} · ${count} cabinet${count!==1?'s':''}</div>
      </div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 2px" onclick="event.stopPropagation();cqDeleteProject(${i})">×</button>
    </div>`;
  }).join('');
}
function cqExportProjects() {
  if (!cqProjectLibrary.length) { _toast('No projects to export', 'error'); return; }
  const rows = [['Project Name','Date','Cabinet Count']];
  cqProjectLibrary.forEach(p => rows.push([p.name, p.date, (p.lines||[]).length]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'cabinet-projects.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  // Also export full data as JSON for re-import
  const json = JSON.stringify(cqProjectLibrary);
  const a2 = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json],{type:'application/json'})), download: 'cabinet-projects-data.json' });
  a2.click(); URL.revokeObjectURL(a2.href);
  _toast('Projects exported (CSV summary + JSON data)', 'success');
}
function cqImportProjects() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,.csv';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(text);
        if (Array.isArray(data)) { data.forEach(p => { p.id = Date.now() + Math.random(); cqProjectLibrary.push(p); }); saveCQProjectLibrary(); renderCQProjects(); _toast(data.length + ' projects imported', 'success'); }
      } else { _toast('Use the JSON file for project import (CSV is summary only)', 'info'); }
    } catch(e) { _toast('Could not read file', 'error'); }
  };
  input.click();
}

function cqExportLibrary() {
  if (!cqLibrary.length) { _toast('No cabinets in library', 'error'); return; }
  const headers = ['Name','Width','Height','Depth','Qty','Material','Back Material','Finish','Construction','Base','Doors','Door Material','Door %','Drawers','Front Material','Inner Material','Drawer %','Fixed Shelves','Adj Shelves','Loose Shelves','Partitions','End Panels'];
  const rows = [headers];
  cqLibrary.forEach(c => {
    rows.push([c._libName||c.name||'Cabinet',c.w,c.h,c.d,c.qty||1,c.material||'',c.backMat||'',c.finish||'None',c.construction||'Overlay',c.baseType||'None',c.doors||0,c.doorMat||'',c.doorPct||95,c.drawers||0,c.drawerFrontMat||'',c.drawerInnerMat||'',c.drawerPct||85,c.shelves||0,c.adjShelves||0,c.looseShelves||0,c.partitions||0,c.endPanels||0]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'cabinet-library.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Library exported as CSV', 'success');
}
function cqImportLibrary() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
      if (rows.length < 2) { _toast('CSV has no data rows', 'error'); return; }
      let imported = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (r.length < 4 || !r[0]) continue;
        const cab = cqDefaultLine();
        cab.id = Date.now() + Math.random();
        cab._libName = r[0]; cab.name = r[0];
        cab.w = parseFloat(r[1])||600; cab.h = parseFloat(r[2])||720; cab.d = parseFloat(r[3])||560;
        cab.qty = parseInt(r[4])||1; cab.material = r[5]||cab.material; cab.backMat = r[6]||cab.backMat;
        cab.finish = r[7]||'None'; cab.construction = r[8]||'Overlay'; cab.baseType = r[9]||'None';
        cab.doors = parseInt(r[10])||0; cab.doorMat = r[11]||cab.material; cab.doorPct = parseInt(r[12])||95;
        cab.drawers = parseInt(r[13])||0; cab.drawerFrontMat = r[14]||cab.material; cab.drawerInnerMat = r[15]||cab.backMat;
        cab.drawerPct = parseInt(r[16])||85; cab.shelves = parseInt(r[17])||0; cab.adjShelves = parseInt(r[18])||0;
        cab.looseShelves = parseInt(r[19])||0; cab.partitions = parseInt(r[20])||0; cab.endPanels = parseInt(r[21])||0;
        cqLibrary.push(cab); imported++;
      }
      renderCQLibrary();
      _toast(imported + ' cabinets imported', 'success');
      const p = document.getElementById('cq-library-panel'); if (p) p.style.display = '';
      // Cloud sync: push the just-imported entries to DB and capture db_ids
      const newEntries = cqLibrary.slice(-imported);
      Promise.all(newEntries.map(e => _saveCabinetToDB(e).then(id => { if (id) e.db_id = id; })))
        .catch(err => console.warn('[cabinet-template bulk save]', err.message || err));
    } catch(e) { _toast('Could not read CSV: ' + e.message, 'error'); }
  };
  input.click();
}
function cqSaveToLibrary() {
  const line = cqLines[cqActiveLineIdx];
  if (!line) { _toast('Select a cabinet first', 'error'); return; }
  const copy = JSON.parse(JSON.stringify(line));
  copy.id = Date.now();
  copy._libName = copy.name || copy.type || 'Cabinet';
  cqLibrary.push(copy);
  renderCQLibrary();
  _toast(`"${copy._libName}" saved to library`, 'success');
  _saveCabinetToDB(copy).then(id => { if (id) copy.db_id = id; });
}
function cqLoadFromLibrary(idx) {
  const src = cqLibrary[idx];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cqNextId++;
  delete copy._libName;
  cqLines.push(copy);
  cqActiveLineIdx = cqLines.length - 1;
  saveCQLines();
  renderCQPanel();
  _toast(`"${src._libName}" added to quote`, 'success');
}
function cqRemoveFromLibrary(idx) {
  const removed = cqLibrary[idx];
  cqLibrary.splice(idx, 1);
  renderCQLibrary();
  if (removed?.db_id) _deleteCabinetFromDB(removed.db_id);
}
function renderCQLibrary() {} // Library now via smart search dropdown

function _cqCabinetSearchInput(input) {
  // Update the active cabinet name as the user types
  if (cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx]) {
    cqLines[cqActiveLineIdx].name = input.value;
    saveCQLines();
    renderCQCabList();
    renderCQResults();
  }
  _smartCQLibrarySuggest(input, 'cq-cabinet-suggest');
}

function _smartCQLibrarySuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(q)) : cqLibrary;
  if (matches.length === 0 && !q) { box.style.display = 'none'; return; }
  let html = '';
  matches.slice(0, 8).forEach(c => {
    const idx = cqLibrary.indexOf(c);
    const calc = calcCQLine(c);
    html += `<div class="client-suggest-item" onmousedown="cqLoadFromLibrary(${idx});document.getElementById('cq-cabinet-search').value='';document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">C</span>
      <span style="flex:1">${_escHtml(c._libName||c.name||'Cabinet')}</span>
      <span style="font-size:10px;color:var(--muted)">${c.w}×${c.h}</span>
      <span style="font-size:10px;font-weight:700;color:var(--accent)">${cur}${Math.round(calc.lineSubtotal)}</span>
    </div>`;
  });
  if (matches.length === 0) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No matching templates in library</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

// ── Type Presets ──
const CQ_PRESETS = {
  'Base Cabinet':   { w:600, h:720, d:560, doors:2, drawers:0, shelves:1 },
  'Wall Cabinet':   { w:600, h:720, d:330, doors:2, drawers:0, shelves:2 },
  'Tall Cabinet':   { w:600, h:2100, d:560, doors:2, drawers:0, shelves:4 },
  'Drawer Unit':    { w:600, h:720, d:560, doors:0, drawers:3, shelves:0 },
  'Shelf Unit':     { w:800, h:1800, d:350, doors:0, drawers:0, shelves:4 },
  'Vanity':         { w:900, h:850, d:500, doors:2, drawers:1, shelves:0 },
  'Island':         { w:1200, h:900, d:600, doors:4, drawers:2, shelves:1 },
  'Pantry':         { w:600, h:2100, d:560, doors:2, drawers:0, shelves:6 },
  'Custom':         { w:600, h:720, d:560, doors:0, drawers:0, shelves:0 },
};

// ── Default Line Item ──
function cqDefaultLine() {
  return {
    id: cqNextId++, name: '',
    w: 600, h: 720, d: 560, qty: 1,
    construction: 'overlay', // overlay, inset, face frame
    baseType: 'plinth', // plinth, feet, castors, frame, none
    material: cqSettings.materials[0]?.name || '',
    backMat: (cqSettings.materials.find(m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cqSettings.materials[0])?.name || '',
    finish: cqSettings.finishes?.[0]?.name || 'None',
    doors: 0, doorPct: 95,
    doorMat: cqSettings.materials[0]?.name || '',
    drawers: 0, drawerPct: 85,
    drawerFrontMat: cqSettings.materials[0]?.name || '',
    drawerInnerMat: (cqSettings.materials.find(m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cqSettings.materials[0])?.name || '',
    shelves: 0, adjShelves: 0, looseShelves: 0, partitions: 0, endPanels: 0,
    hwItems: [],
    extras: [], // [{label, cost}]
    labourHrs: 0, labourOverride: false,
    matCostOverride: null,
    notes: '', room: ''
  };
}

// ── Add / Remove / Duplicate Lines ──
function addCQLine(type) {
  // If we have a blank line with user edits, use that instead of a fresh default
  let line;
  if (!type && window._cqBlankLine && window._cqBlankLine.name) {
    line = JSON.parse(JSON.stringify(window._cqBlankLine));
    line.id = cqNextId++;
    window._cqBlankLine = cqDefaultLine(); // reset blank
  } else {
    line = cqDefaultLine(type);
  }
  cqLines.push(line);
  saveCQLines(); renderCQPanel();
}
function addCQLineFromPreset(type) {
  const line = cqDefaultLine(type);
  line.name = type;
  cqLines.push(line);
  saveCQLines(); renderCQPanel();
  setTimeout(() => { const el = document.getElementById('cq-table-area'); if (el) el.scrollTop = el.scrollHeight; }, 50);
}
function removeCQLine(id) {
  cqLines = cqLines.filter(l => l.id !== id);
  saveCQLines(); renderCQPanel();
}
function dupCQLine(id) {
  const src = cqLines.find(l => l.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cqNextId++;
  copy.name = src.name ? src.name + ' (copy)' : '';
  cqLines.push(copy);
  saveCQLines(); renderCQPanel();
}

// ── Update a field on a line ──
function updateCQLine(id, field, val) {
  const line = cqLines.find(l => l.id === id);
  if (!line) return;
  const numFields = ['w','h','d','qty','doors','drawers','adjShelves','labourHrs','doorPct','drawerPct'];
  if (numFields.includes(field)) {
    line[field] = parseFloat(val) || 0;
  } else if (field === 'shelves') {
    // The main table shows combined shelves - update shelves, keep adjShelves separate
    const total = parseFloat(val) || 0;
    line.shelves = total;
    line.adjShelves = 0;
  } else if (field === 'labourOverride') {
    line.labourOverride = val === 'true' || val === true;
  } else if (field === 'matCostOverride') {
    const v = parseFloat(val);
    line.matCostOverride = (val === '' || val === null || isNaN(v)) ? null : v;
  } else if (field === 'type') {
    line.type = val;
    // Apply preset dimensions if type changed
    const preset = CQ_PRESETS[val];
    if (preset) {
      line.w = preset.w; line.h = preset.h; line.d = preset.d;
      line.doors = preset.doors; line.drawers = preset.drawers; line.shelves = preset.shelves;
    }
  } else {
    line[field] = val;
  }
  saveCQLines(); renderCQPanel();
}

// ── Add hardware item to a line ──
function addCQHwToLine(id) {
  const line = cqLines.find(l => l.id === id);
  if (!line) return;
  line.hwItems.push({ name: cqSettings.hardware[0]?.name || '', qty: 1 });
  saveCQLines(); renderCQPanel();
}
function updateCQHw(lineId, hwIdx, field, val) {
  const line = cqLines.find(l => l.id === lineId);
  if (!line || !line.hwItems[hwIdx]) return;
  if (field === 'qty') { line.hwItems[hwIdx].qty = parseInt(val) || 1; saveCQLines(); renderCQPanel(); }
  else { line.hwItems[hwIdx].name = val; saveCQLines(); renderCQCabList(); renderCQResults(); }
}
function removeCQHw(lineId, hwIdx) {
  const line = cqLines.find(l => l.id === lineId);
  if (!line) return;
  line.hwItems.splice(hwIdx, 1);
  saveCQLines(); renderCQPanel();
}

// ── Move rows up/down ──
function moveCQLine(id, dir) {
  const idx = cqLines.findIndex(l => l.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cqLines.length) return;
  [cqLines[idx], cqLines[newIdx]] = [cqLines[newIdx], cqLines[idx]];
  saveCQLines(); renderCQPanel();
}

// ── Toggle expanded detail for a row ──
let cqExpandedRows = new Set();
function toggleCQExpand(id) {
  if (cqExpandedRows.has(id)) cqExpandedRows.delete(id);
  else cqExpandedRows.add(id);
  renderCQPanel();
}

// ── Toggle individual sections within a cabinet card ──
let cqOpenSections = new Set();
function toggleCQSection(lineId, section) {
  const key = lineId + '-' + section;
  if (cqOpenSections.has(key)) cqOpenSections.delete(key);
  else cqOpenSections.add(key);
  renderCQPanel();
}
function cqExpandAll() {
  const secs = ['dims','doors','drawers','shelves','hw','extras'];
  cqLines.forEach(l => secs.forEach(s => cqOpenSections.add(l.id + '-' + s)));
  renderCQPanel();
}
function cqCollapseAll() {
  cqOpenSections.clear();
  renderCQPanel();
}

// ── Calculate a single line item ──
function calcCQLine(line) {
  const W = line.w / 1000, H = line.h / 1000, D = line.d / 1000;
  const T = 0.018;
  const innerW = Math.max(0, W - 2 * T);

  // Material price per m2 — checks stockItems first, then cqSettings.materials as fallback
  function mp(matName) {
    const s = stockItems.find(s => s.name === matName);
    if (s) return s.cost / (s.w && s.h ? (s.w/1000)*(s.h/1000) : SHEET_M2);
    const m = cqSettings.materials.find(m => m.name === matName);
    return m ? m.price / SHEET_M2 : 0;
  }
  function hwp(hwName) {
    const h = cqSettings.hardware.find(h => h.name === hwName);
    return h ? h.price : 0;
  }

  // Auto material cost: carcass panels
  let matCost = 0;
  // Sides (2)
  matCost += 2 * H * D * mp(line.material);
  // Top + bottom
  matCost += 2 * innerW * D * mp(line.material);
  // Back
  matCost += W * H * mp(line.backMat);
  // Doors (using % of front area, separate door material)
  const doorPct = (line.doorPct || 95) / 100;
  if (line.doors > 0) {
    const doorH = H * doorPct, doorW = innerW / Math.max(1, line.doors);
    matCost += line.doors * doorW * doorH * mp(line.doorMat || line.material);
  }
  // Drawers (fronts + boxes, using % of front area, separate materials)
  const drawerPct = (line.drawerPct || 85) / 100;
  if (line.drawers > 0) {
    const drwH = (H * drawerPct) / line.drawers;
    matCost += line.drawers * innerW * drwH * mp(line.drawerFrontMat || line.material); // fronts
    matCost += line.drawers * (2 * D * drwH + 2 * innerW * drwH + innerW * D) * mp(line.drawerInnerMat || line.backMat); // boxes
  }
  // Shelves
  const shelfArea = innerW * (D - T);
  matCost += (line.shelves + line.adjShelves) * shelfArea * mp(line.material);
  // End panels
  matCost += (line.endPanels || 0) * H * D * mp(line.material);

  // Finishing cost (from finish presets in settings)
  const allSurface = 2*H*D + 2*innerW*D + W*H;
  const _fs = stockItems.find(s => s.name === line.finish && s.category === 'Finishing');
  const finishPricePerM2 = _fs ? _fs.cost : ((cqSettings.finishes||[]).find(f => f.name === line.finish)?.price || 0);
  const finishCost = allSurface * finishPricePerM2;
  matCost += finishCost;

  // Extras cost
  const extrasCost = (line.extras||[]).reduce((s, e) => s + (parseFloat(e.cost)||0), 0);
  matCost += extrasCost;

  // Edge banding (exposed edges: front edges of sides, shelves, top, bottom)
  const edgingLength = 2*H + 2*innerW + (line.shelves + line.adjShelves) * innerW; // front edges
  const edgingCost = edgingLength * (cqSettings.edgingPerM || 0);
  matCost += edgingCost;

  // Use override if set
  const finalMatCost = (line.matCostOverride !== null && line.matCostOverride !== undefined) ? line.matCostOverride : matCost;

  // Base type cost
  const basePrice = (cqSettings.baseTypes||[]).find(b => b.name === line.baseType)?.price || 0;
  matCost += basePrice;

  // Construction type cost — frontal area based (price per m2 of front face)
  const frontArea = W * H;
  const constPrice = (cqSettings.constructions||[]).find(c => c.name === line.construction)?.price || 0;
  matCost += constPrice * frontArea;

  // Auto labour estimate (hours) — from configurable rates
  const lt = cqSettings.labourTimes || {};
  let autoLabour = 0;
  // Carcass — volume based (hrs per m3)
  const volume = W * H * D;
  autoLabour += (lt.carcass || 1.5) * volume;
  autoLabour += line.doors * (lt.door || 0.4);
  autoLabour += line.drawers * (lt.drawer || 0.6);
  // Split shelf/partition labour
  autoLabour += (line.shelves || 0) * (lt.fixedShelf || 0.3);
  autoLabour += (line.adjShelves || 0) * (lt.adjShelfHoles || 0.4);
  autoLabour += (line.looseShelves || 0) * (lt.looseShelf || 0.2);
  autoLabour += (line.partitions || 0) * (lt.partition || 0.5);
  autoLabour += (line.endPanels || 0) * (lt.endPanel || 0.3);
  const surfaceArea = 2*H*D + 2*innerW*D + W*H;
  autoLabour += surfaceArea * (lt.finishPerM2 || 0.5);

  const labourHrs = line.labourOverride ? line.labourHrs : autoLabour;
  const labourCost = labourHrs * cqSettings.labourRate;

  // Hardware
  let hwCost = 0;
  // Auto hardware for doors/drawers
  if (line.doors > 0) hwCost += line.doors * 2 * 6;
  if (line.drawers > 0) hwCost += line.drawers * 24;
  // Manual hardware items
  for (const hw of line.hwItems) {
    hwCost += hwp(hw.name) * hw.qty;
  }

  const lineSubtotal = (finalMatCost + labourCost + hwCost) * line.qty;

  return {
    matCost: finalMatCost, matCostAuto: matCost,
    labourHrs, labourHrsAuto: autoLabour, labourCost,
    hwCost, lineSubtotal,
    qty: line.qty
  };
}


// ── Render the sidebar: cabinet list + active editor ──
function renderCQPanel() {
  const cur = window.currency;
  const fmt = v => cur + Number(v).toFixed(2);
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  // Sync settings form values
  const fields = {labourRate:'cq-labour-rate', markup:'cq-markup', tax:'cq-tax', deposit:'cq-deposit', edgingPerM:'cq-edging-m'};
  Object.entries(fields).forEach(([k, id]) => { const el = document.getElementById(id); if (el && el !== document.activeElement) el.value = cqSettings[k]; });

  renderCQRates();
  renderCQLibrary();
  renderCQCabList();
  renderCQEditor();
  renderCQResults();
}

// ── Render cabinet list in sidebar ──
function renderCQCabList() {
  const el = document.getElementById('cq-cab-list');
  if (!el) return;
  const cur = window.currency;
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  if (!cqLines.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface);text-align:center">No cabinets yet. Click "+ Add Cabinet" above.</div>`;
    return;
  }
  el.innerHTML = cqLines.map((c, i) => {
    const calc = calcCQLine(c);
    const active = i === cqActiveLineIdx;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;border-radius:8px;border:1.5px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent-dim)':'var(--surface)'};cursor:pointer;transition:border-color .15s" onclick="cqSelectLine(${i})">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name || 'Cabinet'}${c.qty > 1 ? ' <span style="color:var(--muted);font-weight:400">x'+c.qty+'</span>' : ''}</div>
        <div style="font-size:11px;color:var(--muted)">${c.w}×${c.h}×${c.d}mm</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--accent);white-space:nowrap">${fmt0(calc.lineSubtotal)}</div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px" onclick="event.stopPropagation();_openCabinetPopup(${i})" title="Edit in popup">✎</button>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px" onclick="event.stopPropagation();dupCQLine(${c.id})" title="Duplicate">⧉</button>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;padding:2px" onclick="event.stopPropagation();removeCQLine(${c.id})" title="Remove">×</button>
    </div>`;
  }).join('');
}

// ── Active line index ──
let cqActiveLineIdx = 0;
function cqSelectLine(idx) {
  cqActiveLineIdx = idx;
  renderCQPanel();
}

// ── Render the active cabinet editor in sidebar ──
function renderCQEditor() {
  // Hide any open fixed suggest dropdowns
  document.querySelectorAll('.client-suggest-list').forEach(b => { b.style.display = 'none'; b.style.position = ''; });
  const el = document.getElementById('cq-cab-editor');
  if (!el) return;
  // Use active line or a blank default for "Add" mode
  const isEditing = cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx];
  // Sync cabinet library search box with active cabinet name
  const searchInp = document.getElementById('cq-cabinet-search');
  if (searchInp && document.activeElement !== searchInp) {
    searchInp.value = isEditing ? (cqLines[cqActiveLineIdx].name || '') : '';
  }
  if (!window._cqBlankLine) window._cqBlankLine = cqDefaultLine();
  const line = isEditing ? cqLines[cqActiveLineIdx] : window._cqBlankLine;

  const cur = window.currency;
  const c = calcCQLine(line);
  const matSmart = (field, val) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cq-mat-${field}" value="${_escHtml(val||'')}" autocomplete="off" style="font-size:13px" oninput="_smartCQMaterialSuggest(this,'cq-mat-suggest-${field}','${field}')" onfocus="_smartCQMaterialSuggest(this,'cq-mat-suggest-${field}','${field}')" onblur="setTimeout(()=>{document.getElementById('cq-mat-suggest-${field}').style.display='none';cqUpdateField('${field}',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new material">+</div></div><div id="cq-mat-suggest-${field}" class="client-suggest-list" style="display:none"></div></div>`;
  const finishSmart = () => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cq-mat-finish" value="${_escHtml(line.finish||'None')}" autocomplete="off" style="font-size:13px" oninput="_smartCQFinishSuggest(this,'cq-mat-suggest-finish')" onfocus="_smartCQFinishSuggest(this,'cq-mat-suggest-finish')" onblur="setTimeout(()=>{document.getElementById('cq-mat-suggest-finish').style.display='none';cqUpdateField('finish',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new finish">+</div></div><div id="cq-mat-suggest-finish" class="client-suggest-list" style="display:none"></div></div>`;
  const stepper = (field, val, min) => `<div class="cl-stepper"><button class="cl-step-btn" onclick="cqStepField('${field}',-1)">−</button><input type="number" class="cl-input cl-qty-input" value="${val}" min="${min||0}" style="font-size:14px;width:42px" onchange="cqUpdateField('${field}',this.value)"><button class="cl-step-btn" onclick="cqStepField('${field}',1)">+</button></div>`;
  const so = sec => cqOpenSections.has(line.id + '-' + sec);
  const chev = sec => `<span style="font-size:10px;color:var(--muted);transition:transform .2s;display:inline-block;${so(sec)?'transform:rotate(90deg)':''}">&#9654;</span>`;
  const SB = 'border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;background:var(--surface)';
  const SH = 'display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none';
  const ST = 'font-size:13px;font-weight:600;color:var(--text);flex:1';
  const SS = 'font-size:11px;color:var(--muted)';
  const SC = sec => `style="padding:10px 12px;border-top:1px solid var(--border);${so(sec)?'':'display:none'}"`;
  const FM = 'margin:0';
  const LB = 'font-size:12px';
  const IS = 'font-size:14px';
  const SL = 'font-size:13px';
  const dot = c => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--${c});margin-right:4px"></span>`;
  const liveCost = v => `<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">${cur}${Math.round(v)}</span>`;

  // Calculate per-section costs
  const W=line.w/1000, H=line.h/1000, D=line.d/1000, T=0.018, iW=Math.max(0,W-2*T);
  function mp(n){ const s=stockItems.find(s=>s.name===n); if(s) return s.cost/(s.w&&s.h?(s.w/1000)*(s.h/1000):2.9768); const m=cqSettings.materials.find(m=>m.name===n); return m?m.price/2.9768:0; }
  const carcassCost = (2*H*D + 2*iW*D)*mp(line.material) + W*H*mp(line.backMat);
  const _fss = stockItems.find(s => s.name === line.finish && s.category === 'Finishing');
  const finishPrice = _fss ? _fss.cost : ((cqSettings.finishes||[]).find(f=>f.name===line.finish)?.price || 0);
  const surfArea = 2*H*D + 2*iW*D + W*H;
  const finishCostVal = surfArea * finishPrice;
  const doorCost = line.doors > 0 ? line.doors*(iW/Math.max(1,line.doors))*(H*(line.doorPct||95)/100)*mp(line.doorMat||line.material) : 0;
  const drwFrontCost = line.drawers > 0 ? line.drawers*iW*((H*(line.drawerPct||85)/100)/line.drawers)*mp(line.drawerFrontMat||line.material) : 0;
  const shelfCost = (line.shelves+line.adjShelves)*iW*(D-T)*mp(line.material) + (line.endPanels||0)*H*D*mp(line.material);
  const extrasCost = (line.extras||[]).reduce((s,e)=>s+(parseFloat(e.cost)||0),0);

  el.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">

      <!-- CABINET (dims + material + finish + construction + base) -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'cab')">
          ${chev('cab')}
          <span style="${ST}">Cabinet</span>
          ${liveCost(carcassCost + finishCostVal)}
          <span style="${SS}">${line.w}×${line.h}×${line.d}</span>
        </div>
        <div ${SC('cab')}>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="${FM}"><label style="${LB}">Width (mm)</label><input type="number" value="${line.w}" style="${IS}" oninput="cqUpdateField('w',this.value)"></div>
            <div class="form-group" style="${FM}"><label style="${LB}">Height (mm)</label><input type="number" value="${line.h}" style="${IS}" oninput="cqUpdateField('h',this.value)"></div>
            <div class="form-group" style="${FM}"><label style="${LB}">Depth (mm)</label><input type="number" value="${line.d}" style="${IS}" oninput="cqUpdateField('d',this.value)"></div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Qty</label>${stepper('qty', line.qty, 1)}</div>
          </div>
          <div style="margin-bottom:8px"><label style="${LB}">Carcass Material</label>${matSmart('material', line.material)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Back Panel</label>${matSmart('backMat', line.backMat)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Finish</label>${finishSmart()}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Construction</label>
            <select style="${SL};width:100%" onchange="cqUpdateField('construction',this.value)">
              ${(cqSettings.constructions||[]).map(c=>`<option value="${c.name}" ${c.name===line.construction?'selected':''}>${c.name}${c.price?' (+'+cur+c.price+'/m²)':''}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:0"><label style="${LB}">Base</label>
            <select style="${SL};width:100%" onchange="cqUpdateField('baseType',this.value)">
              ${(cqSettings.baseTypes||[]).map(b=>`<option value="${b.name}" ${b.name===line.baseType?'selected':''}>${b.name}${b.price?' (+'+cur+b.price+')':''}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- DOORS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'doors')">
          ${chev('doors')}
          <span style="${ST}">Doors</span>
          ${line.doors > 0 ? liveCost(doorCost) : ''}
          <span style="${SS}">${line.doors>0?line.doors+' door'+(line.doors!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('doors')}>
          <div style="margin-bottom:8px"><label style="${LB}">Count</label>${stepper('doors', line.doors, 0)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Door Material</label>${matSmart('doorMat', line.doorMat||line.material)}</div>
          ${line.doors>0?`<label style="font-size:11px;color:var(--muted)">% of front area</label><div class="cq-pct-row"><input type="range" class="cq-pct-slider" min="50" max="100" value="${line.doorPct||95}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="cqUpdateField('doorPct',this.value)"><span class="cq-pct-val">${line.doorPct||95}%</span></div>`:''}
        </div>
      </div>

      <!-- DRAWERS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'drawers')">
          ${chev('drawers')}
          <span style="${ST}">Drawers</span>
          ${line.drawers > 0 ? liveCost(drwFrontCost) : ''}
          <span style="${SS}">${line.drawers>0?line.drawers+' drawer'+(line.drawers!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('drawers')}>
          <div style="margin-bottom:8px"><label style="${LB}">Count</label>${stepper('drawers', line.drawers, 0)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Front Material</label>${matSmart('drawerFrontMat', line.drawerFrontMat||line.material)}</div>
          ${line.drawers>0?`<div style="margin-bottom:8px"><label style="${LB}">Inner Box Material</label>${matSmart('drawerInnerMat', line.drawerInnerMat||line.backMat)}</div>
          <label style="font-size:11px;color:var(--muted)">% of front area</label><div class="cq-pct-row"><input type="range" class="cq-pct-slider" min="30" max="100" value="${line.drawerPct||85}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="cqUpdateField('drawerPct',this.value)"><span class="cq-pct-val">${line.drawerPct||85}%</span></div>`:''}
        </div>
      </div>

      <!-- SHELVES & PARTITIONS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'shelves')">
          ${chev('shelves')}
          <span style="${ST}">Shelves & Partitions</span>
          ${(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))>0 ? liveCost(shelfCost) : ''}
          <span style="${SS}">${(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))>0?(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))+' total':'None'}</span>
        </div>
        <div ${SC('shelves')}>
          <div class="form-row" style="margin-bottom:6px;align-items:flex-end">
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Fixed Shelf</label>${stepper('shelves', line.shelves, 0)}</div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Adj. Holes</label>${stepper('adjShelves', line.adjShelves, 0)}</div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Loose Shelf</label>${stepper('looseShelves', line.looseShelves||0, 0)}</div>
          </div>
          <div class="form-row" style="margin-bottom:0;align-items:flex-end">
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Partition</label>${stepper('partitions', line.partitions||0, 0)}</div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">End Panel</label>${stepper('endPanels', line.endPanels||0, 0)}</div>
          </div>
        </div>
      </div>

      <!-- HARDWARE -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'hw')">
          ${chev('hw')}
          <span style="${ST}">Hardware</span>
          ${liveCost(c.hwCost)}
        </div>
        <div ${SC('hw')}>
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Auto: ${line.doors>0?line.doors*2+' hinges':''}${line.doors>0&&line.drawers>0?', ':''}${line.drawers>0?line.drawers+' slides':''}${line.doors===0&&line.drawers===0?'None':''}</div>
          ${line.hwItems.map((hw, hi) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px;position:relative">
            <div style="flex:1;position:relative"><div class="smart-input-wrap"><input type="text" id="cq-hw-${line.id}-${hi}" value="${_escHtml(hw.name)}" style="font-size:12px" autocomplete="off" oninput="_smartCQHwSuggest(this,'cq-hw-suggest-${line.id}-${hi}',${line.id},${hi})" onfocus="_smartCQHwSuggest(this,'cq-hw-suggest-${line.id}-${hi}',${line.id},${hi})" onblur="setTimeout(()=>{document.getElementById('cq-hw-suggest-${line.id}-${hi}').style.display='none';updateCQHw(${line.id},${hi},'name',this.value)},150)"><div class="smart-input-add" onclick="_openNewCQHardwarePopup(${line.id},${hi})" title="Add new hardware type">+</div></div><div id="cq-hw-suggest-${line.id}-${hi}" class="client-suggest-list" style="display:none"></div></div>
            <span style="font-size:10px;color:var(--muted)">×</span>
            <input type="number" style="width:40px;text-align:center;padding:5px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text)" value="${hw.qty}" min="1" onchange="updateCQHw(${line.id},${hi},'qty',this.value)">
            <button class="cq-del-btn" style="font-size:16px" onclick="removeCQHw(${line.id},${hi})">×</button>
          </div>`).join('')}
          <div style="position:relative;margin-top:4px">
            <label style="font-size:10px;font-weight:600;color:var(--muted)">Add Hardware</label>
            <div class="smart-input-wrap">
              <input type="text" id="cq-hw-add-${line.id}" placeholder="Search hardware..." style="font-size:12px" autocomplete="off" oninput="_smartCQHwAddSuggest(this,'cq-hw-add-suggest-${line.id}',${line.id})" onfocus="_smartCQHwAddSuggest(this,'cq-hw-add-suggest-${line.id}',${line.id})" onblur="setTimeout(()=>document.getElementById('cq-hw-add-suggest-${line.id}').style.display='none',150)">
              <div class="smart-input-add" onclick="_openNewCQHardwarePopup(${line.id},-1)" title="Add new hardware type">+</div>
            </div>
            <div id="cq-hw-add-suggest-${line.id}" class="client-suggest-list" style="display:none"></div>
          </div>
        </div>
      </div>

      <!-- EXTRAS (custom items with label + cost) -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'extras')">
          ${chev('extras')}
          <span style="${ST}">Extras</span>
          ${extrasCost > 0 ? liveCost(extrasCost) : ''}
          <span style="${SS}">${(line.extras||[]).length>0?(line.extras.length)+' item'+(line.extras.length!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('extras')}>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Add custom items like cable holes, lighting cutouts, etc.</div>
          ${(line.extras||[]).map((ex, ei) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">
            <input style="flex:1;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-family:inherit" value="${ex.label||''}" placeholder="Item name" onblur="cqUpdateExtra(${line.id},${ei},'label',this.value)">
            <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--surface2)">
              <span style="font-size:11px;color:var(--muted);padding:4px 4px 4px 8px;background:var(--surface)">${cur}</span>
              <input type="number" style="width:60px;border:none;padding:6px 6px 6px 2px;font-size:13px;background:transparent;color:var(--text)" value="${ex.cost||0}" onblur="cqUpdateExtra(${line.id},${ei},'cost',this.value)">
            </div>
            <button class="cq-del-btn" style="font-size:16px" onclick="cqRemoveExtra(${line.id},${ei})">×</button>
          </div>`).join('')}
          <button class="cl-add-btn" onclick="cqAddExtra(${line.id})" style="font-size:12px;padding:5px 10px;margin:4px 0 0">+ Add Extra</button>
        </div>
      </div>

      <!-- NOTES -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'notes')">
          ${chev('notes')}
          <span style="${ST}">Notes</span>
          <span style="${SS}">${line.notes?'✓':''} ${line.room||''}</span>
        </div>
        <div ${SC('notes')}>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="${FM}"><label style="${LB}">Room / Area</label><input type="text" value="${line.room||''}" placeholder="e.g. Kitchen" style="${SL}" list="cq-room-list" onchange="cqUpdateField('room',this.value)"></div>
          </div>
          <div class="form-group" style="${FM}"><label style="${LB}">Notes</label><textarea style="${SL};min-height:60px;resize:vertical" onblur="cqUpdateField('notes',this.value)">${line.notes||''}</textarea></div>
        </div>
      </div>

      <!-- Sidebar Actions -->
      <div style="padding-top:8px;display:flex;gap:6px">
        <button class="btn btn-primary" onclick="cqAddOrUpdateCabinet()" id="cq-add-btn" style="flex:1;font-size:13px;padding:10px 12px">${cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx] ? 'Update Cabinet' : 'Add to Project'}</button>
        <button class="btn btn-outline" onclick="cqSaveToLibrary()" style="flex:1;font-size:12px;padding:10px 12px">Save to Library</button>
      </div>

    </div>
    <datalist id="cq-room-list">${['Kitchen','Bathroom','Bedroom','Living Room','Laundry','Garage','Office','Pantry'].map(r=>'<option value="'+r+'">').join('')}</datalist>
  `;
}

// ── Extras CRUD ──
function cqAddExtra(lineId) {
  const line = cqLines.find(l=>l.id===lineId);
  if (!line) return;
  if (!line.extras) line.extras = [];
  line.extras.push({label:'',cost:0});
  saveCQLines(); renderCQEditor();
}
function cqUpdateExtra(lineId, idx, field, val) {
  const line = cqLines.find(l=>l.id===lineId);
  if (!line || !line.extras || !line.extras[idx]) return;
  if (field==='cost') line.extras[idx].cost = parseFloat(val)||0;
  else line.extras[idx].label = val;
  saveCQLines(); renderCQResults();
}
function cqRemoveExtra(lineId, idx) {
  const line = cqLines.find(l=>l.id===lineId);
  if (!line || !line.extras) return;
  line.extras.splice(idx,1);
  saveCQLines(); renderCQEditor(); renderCQResults();
}

function cqAddOrUpdateCabinet() {
  if (cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx]) {
    // Was editing — save and deselect
    cqActiveLineIdx = -1;
    saveCQLines();
    renderCQPanel();
    _toast('Cabinet updated', 'success');
  } else {
    // Add new cabinet from current form data
    addCQLine();
    // Deselect so form resets to blank
    cqActiveLineIdx = -1;
    renderCQEditor();
    renderCQResults();
  }
}

function cqEditCabinetFromOutput(idx) {
  cqActiveLineIdx = idx;
  renderCQCabList();
  renderCQEditor();
  renderCQResults();
  // Scroll sidebar to editor
  const sidebar = document.getElementById('cq-sidebar');
  if (sidebar) sidebar.scrollTop = sidebar.scrollHeight;
}

function cqStepField(field, dir) {
  const isEditing = cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx];
  const line = isEditing ? cqLines[cqActiveLineIdx] : window._cqBlankLine;
  if (!line) return;
  const cur = parseFloat(line[field]) || 0;
  const min = (field === 'qty') ? 1 : 0;
  line[field] = Math.max(min, cur + dir);
  saveCQLines();
  renderCQCabList(); renderCQResults(); renderCQEditor();
}

function cqUpdateField(field, val) {
  const isEditing = cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx];
  const line = isEditing ? cqLines[cqActiveLineIdx] : window._cqBlankLine;
  if (!line) return;
  const numFields = ['w','h','d','qty','doors','drawers','shelves','adjShelves','endPanels','looseShelves','partitions','labourHrs','doorPct','drawerPct'];
  if (numFields.includes(field)) {
    line[field] = parseFloat(val) || 0;
  } else {
    line[field] = val;
  }
  saveCQLines();
  renderCQCabList();
  renderCQResults();
  // Re-render editor when structural fields change
  if (['doors','drawers','construction','baseType','finish'].includes(field)) renderCQEditor();
}

// ── Position suggest box as fixed overlay (avoids overflow clipping) ──
function _posSuggest(input, box) {
  if (!input || !box) return;
  const r = input.parentElement.getBoundingClientRect();
  box.style.position = 'fixed';
  box.style.left = r.left + 'px';
  box.style.width = r.width + 'px';
  box.style.right = 'auto';
  const spaceBelow = window.innerHeight - r.bottom;
  if (spaceBelow < 220) {
    box.style.top = 'auto';
    box.style.bottom = (window.innerHeight - r.top) + 'px';
    box.style.borderRadius = '8px 8px 0 0';
  } else {
    box.style.top = r.bottom + 'px';
    box.style.bottom = 'auto';
    box.style.borderRadius = '0 0 8px 8px';
  }
}

// ── Rates Stock Smart Suggest (opens stock edit popup on click) ──
function _smartRatesStockSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Sheet Goods' || s.category === 'Solid Timber' || s.category === 'Edge Banding' || (s.w > 0 && s.h > 0));
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="document.getElementById('rates-stock-search').value='';document.getElementById('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${dims ? dims + ' · ' : ''}${cur}${s.cost}/sheet</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock material</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// ── Rates Finish Smart Suggest ──
function _smartRatesFinishSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Finishing');
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="document.getElementById('rates-finish-search').value='';document.getElementById('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m²</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new finish to stock</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// ── Rates Edge Banding Smart Suggest ──
function _smartRatesEdgeSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Edge Banding');
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="document.getElementById('rates-edge-search').value='';document.getElementById('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new edge banding to stock</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// ── Cabinet Material Smart Suggest ──
function _smartCQMaterialSuggest(input, boxId, fieldName) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  // Search from shared stockItems library (Sheet Goods + items with dimensions)
  const pool = stockItems.filter(s => s.category === 'Sheet Goods' || s.category === 'Solid Timber' || s.category === 'Edge Banding' || (s.w > 0 && s.h > 0));
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="document.getElementById('cq-mat-${fieldName}').value='${_escHtml(s.name)}';cqUpdateField('${fieldName}','${_escHtml(s.name)}');document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${dims ? dims + ' · ' : ''}${cur}${s.cost}/sheet</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock material</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _smartCQFinishSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Finishing');
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="document.getElementById('cq-mat-finish').value='${_escHtml(s.name)}';cqUpdateField('finish','${_escHtml(s.name)}');document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new finish to stock</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _openNewCQMaterialPopup(fieldName) {
  const existing = document.getElementById('cq-mat-' + fieldName)?.value || '';
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Material</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Material Name</label><input class="pf-input pf-input-lg" id="pnm-name" value="${_escHtml(existing)}"></div>
      <div class="pf"><label class="pf-label">Price per Sheet</label><input class="pf-input" id="pnm-price" type="number" value="0" step="0.01"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewCQMaterial('${fieldName}')">Add Material</button>
    </div>
  `, 'sm');
  setTimeout(() => document.getElementById('pnm-name')?.focus(), 50);
}

function _saveNewCQMaterial(fieldName) {
  const name = _popupVal('pnm-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnm-price')) || 0;
  if (!cqSettings.materials.some(m => m.name === name)) {
    cqSettings.materials.push({ name, price });
    saveCQSettings();
  }
  cqUpdateField(fieldName, name);
  const inp = document.getElementById('cq-mat-' + fieldName);
  if (inp) inp.value = name;
  _closePopup();
  _toast('"' + name + '" added to materials', 'success');
}

function _openNewStockPopup() {
  const existing = document.getElementById('cq-mat-finish')?.value || '';
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Finish</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Finish Name</label><input class="pf-input pf-input-lg" id="pnf-name" value="${_escHtml(existing)}"></div>
      <div class="pf"><label class="pf-label">Price per m²</label><input class="pf-input" id="pnf-price" type="number" value="0" step="0.01"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewCQFinish()">Add Finish</button>
    </div>
  `, 'sm');
  setTimeout(() => document.getElementById('pnf-name')?.focus(), 50);
}

function _saveNewCQFinish() {
  const name = _popupVal('pnf-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnf-price')) || 0;
  if (!cqSettings.finishes) cqSettings.finishes = [];
  if (!cqSettings.finishes.some(f => f.name === name)) {
    cqSettings.finishes.push({ name, price });
    saveCQSettings();
  }
  cqUpdateField('finish', name);
  const inp = document.getElementById('cq-mat-finish');
  if (inp) inp.value = name;
  _closePopup();
  _toast('"' + name + '" added to finishes', 'success');
}

// ── Cabinet Hardware Smart Suggest ──
function _smartCQHwSuggest(input, boxId, lineId, hwIdx) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqSettings.hardware.filter(h => h.name.toLowerCase().includes(q)) : cqSettings.hardware;
  let html = '';
  matches.slice(0, 8).forEach(h => {
    html += `<div class="client-suggest-item" onmousedown="document.getElementById('cq-hw-${lineId}-${hwIdx}').value='${_escHtml(h.name)}';updateCQHw(${lineId},${hwIdx},'name','${_escHtml(h.name)}');document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:#6b8aff20;color:#6b8aff">H</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  if (q) html += `<div class="client-suggest-add" onmousedown="_openNewCQHardwarePopup(${lineId},${hwIdx})">+ Add "${_escHtml(input.value.trim())}" as new hardware</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _smartCQHwAddSuggest(input, boxId, lineId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqSettings.hardware.filter(h => h.name.toLowerCase().includes(q)) : cqSettings.hardware;
  let html = '';
  matches.slice(0, 8).forEach(h => {
    html += `<div class="client-suggest-item" onmousedown="_addCQHwByName(${lineId},'${_escHtml(h.name)}');document.getElementById('cq-hw-add-${lineId}').value='';document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:#6b8aff20;color:#6b8aff">H</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  if (q) html += `<div class="client-suggest-add" onmousedown="_openNewCQHardwarePopup(${lineId},-1)">+ Add "${_escHtml(input.value.trim())}" as new hardware</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _addCQHwByName(lineId, hwName) {
  const line = cqLines.find(l => l.id === lineId);
  if (!line) return;
  line.hwItems.push({ name: hwName, qty: 1 });
  saveCQLines(); renderCQPanel();
  _toast('"' + hwName + '" added', 'success');
}

function _openNewCQHardwarePopup(lineId, hwIdx) {
  const existing = hwIdx >= 0 ? (document.getElementById('cq-hw-' + lineId + '-' + hwIdx)?.value || '') : (document.getElementById('cq-hw-add-' + lineId)?.value || '');
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Hardware</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Hardware Name</label><input class="pf-input pf-input-lg" id="pnh-name" value="${_escHtml(existing)}"></div>
      <div class="pf"><label class="pf-label">Price per Unit</label><input class="pf-input" id="pnh-price" type="number" value="0" step="0.01"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewCQHardware(${lineId},${hwIdx})">Add Hardware</button>
    </div>
  `, 'sm');
  setTimeout(() => document.getElementById('pnh-name')?.focus(), 50);
}

function _saveNewCQHardware(lineId, hwIdx) {
  const name = _popupVal('pnh-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnh-price')) || 0;
  if (!cqSettings.hardware.some(h => h.name === name)) {
    cqSettings.hardware.push({ name, price });
    saveCQSettings();
  }
  if (hwIdx >= 0) {
    updateCQHw(lineId, hwIdx, 'name', name);
    const inp = document.getElementById('cq-hw-' + lineId + '-' + hwIdx);
    if (inp) inp.value = name;
  } else {
    _addCQHwByName(lineId, name);
  }
  _closePopup();
  _toast('"' + name + '" added to hardware', 'success');
}

// ── Render right panel: cost breakdown ──
function renderCQResults() {
  const el = document.getElementById('cq-results');
  if (!el) return;
  const cur = window.currency;
  const fmt = v => cur + Number(v).toFixed(2);
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const projName = document.getElementById('cq-project')?.value || '';

  if (!cqLines.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="12"/></svg></div>
      <h3>Cabinet Builder</h3>
      <p>Add cabinets using the sidebar to start building your project.</p>
    </div>`;
    return;
  }

  // Totals
  let gMat=0,gLabour=0,gHw=0,gSub=0;
  const calcs = cqLines.map(l => { const c=calcCQLine(l); gMat+=c.matCost*l.qty; gLabour+=c.labourCost*l.qty; gHw+=c.hwCost*l.qty; gSub+=c.lineSubtotal; return c; });
  const totalHrs = cqLines.reduce((s,l,i)=>s+calcs[i].labourHrs*l.qty,0);
  const gMarkup = gSub * cqSettings.markup/100;
  const gTotal = (gSub+gMarkup)*(1+cqSettings.tax/100);

  let html = `<div style="max-width:700px">`;

  // ── Top buttons bar ──
  html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <button class="btn btn-primary" onclick="cqAddToExistingQuote()" style="font-size:12px;padding:8px 14px">Add to Existing Quote</button>
    <div id="cq-quote-picker" style="display:none"></div>
    <button class="btn btn-outline" onclick="cqAddToNewQuote()" style="font-size:12px;padding:8px 14px;width:auto">+ New Quote</button>
    <span style="flex:1"></span>
    <button class="btn btn-outline" onclick="printCQQuote('pdf')" style="font-size:12px;padding:8px 12px;width:auto">&darr; PDF</button>
    <button class="btn btn-outline" onclick="printCQQuote('print')" style="font-size:12px;padding:8px 12px;width:auto">&oplus; Print</button>
    <button class="btn btn-outline" onclick="cqExportLibrary()" style="font-size:12px;padding:8px 12px;width:auto">&darr; Export</button>
    <button class="btn btn-outline" onclick="cqImportLibrary()" style="font-size:12px;padding:8px 12px;width:auto">&uarr; Import</button>
  </div>`;

  // ── Project header ──
  if (projName) html += `<h2 style="font-size:18px;font-weight:800;margin:0 0 4px">${_escHtml(projName)}</h2>`;
  html += `<div style="font-size:12px;color:var(--muted);margin-bottom:16px">${cqLines.length} cabinet${cqLines.length!==1?'s':''} · ${cqLines.reduce((s,l)=>s+l.qty,0)} units</div>`;

  // ── Individual cabinet cards ──
  cqLines.forEach((line, idx) => {
    const c = calcs[idx];
    const isActive = idx === cqActiveLineIdx;
    const cabMarkup = c.lineSubtotal * cqSettings.markup / 100;
    const cabTotal = (c.lineSubtotal + cabMarkup) * (1 + cqSettings.tax / 100);
    html += `<div style="background:var(--surface);border:${isActive?'2px solid var(--accent)':'1px solid var(--border)'};border-radius:var(--radius);margin-bottom:10px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow);transition:box-shadow .15s" onclick="_openCabinetPopup(${idx})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='var(--shadow)'">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:${isActive?'var(--accent-dim)':'var(--surface2)'}">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(line.name||'Cabinet '+(idx+1))}</div>
          <div style="font-size:11px;color:var(--muted)">${line.w} × ${line.h} × ${line.d} mm · ${_escHtml(line.material)}${line.qty>1?' · x'+line.qty:''}</div>
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--accent)">${fmt0(cabTotal)}</div>
      </div>
      <!-- Details -->
      <div style="padding:10px 16px;font-size:12px;color:var(--text2)">
        <div style="display:grid;grid-template-columns:1fr auto;gap:2px 16px">
          <span>Materials</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt(c.matCost)}</span>
          <span>Labour (${c.labourHrs.toFixed(1)} hrs @ ${cur}${cqSettings.labourRate}/hr)</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt(c.labourCost)}</span>
          <span>Hardware</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt0(c.hwCost)}</span>
          <span style="color:var(--muted)">Subtotal</span><span style="text-align:right;font-weight:600">${fmt0(c.lineSubtotal)}</span>
          ${cqSettings.markup>0?`<span style="color:var(--muted)">Markup (${cqSettings.markup}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(cabMarkup)}</span>`:''}
          ${cqSettings.tax>0?`<span style="color:var(--muted)">Tax (${cqSettings.tax}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(cabTotal-c.lineSubtotal-cabMarkup)}</span>`:''}
        </div>
        <!-- Sub details -->
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border2);font-size:11px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap">
          ${line.finish&&line.finish!=='None'?`<span>${_escHtml(line.finish)}</span>`:''}\
          ${line.construction?`<span>${_escHtml(line.construction)}</span>`:''}\
          ${line.baseType&&line.baseType!=='None'?`<span>${_escHtml(line.baseType)}</span>`:''}\
          ${line.doors>0?`<span>${line.doors} door${line.doors!==1?'s':''}</span>`:''}\
          ${line.drawers>0?`<span>${line.drawers} drawer${line.drawers!==1?'s':''}</span>`:''}\
          ${(line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)>0?`<span>${(line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)} shelves</span>`:''}\
          ${(line.partitions||0)>0?`<span>${line.partitions} partition${line.partitions!==1?'s':''}</span>`:''}\
          ${(line.endPanels||0)>0?`<span>${line.endPanels} end panel${line.endPanels!==1?'s':''}</span>`:''}\
          ${line.room?`<span>${_escHtml(line.room)}</span>`:''}
        </div>
      </div>
    </div>`;
  });

  // ── All Cabinets Total card ──
  html += `<div style="background:var(--surface);border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)">
    <div style="padding:12px 16px;background:var(--surface2);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">All Cabinets (${cqLines.length})</div>
    <div style="padding:12px 16px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 16px;font-size:13px">
        <span style="color:var(--text2)">Materials</span><span style="text-align:right;font-weight:600">${fmt0(gMat)}</span>
        <span style="color:var(--text2)">Labour (${totalHrs.toFixed(1)} hrs)</span><span style="text-align:right;font-weight:600">${fmt0(gLabour)}</span>
        <span style="color:var(--text2)">Hardware</span><span style="text-align:right;font-weight:600">${fmt0(gHw)}</span>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;display:grid;grid-template-columns:1fr auto;gap:3px 16px;font-size:13px">
        <span style="font-weight:700">Subtotal</span><span style="text-align:right;font-weight:700">${fmt0(gSub)}</span>
        ${cqSettings.markup>0?`<span style="color:var(--muted)">Markup (${cqSettings.markup}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(gMarkup)}</span>`:''}
        ${cqSettings.tax>0?`<span style="color:var(--muted)">Tax (${cqSettings.tax}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(gTotal-gSub-gMarkup)}</span>`:''}
      </div>
      <div style="border-top:2px solid var(--accent);margin-top:6px;padding-top:8px;display:flex;justify-content:space-between;font-size:16px">
        <span style="font-weight:700;color:var(--accent)">Quote Total</span>
        <span style="font-weight:800;color:var(--accent)">${fmt0(gTotal)}</span>
      </div>
    </div>
  </div>`;

  html += `</div>`;
  el.innerHTML = html;
}

function cqAddToNewQuote() {
  if (!cqLines.length) { _toast('Add cabinets first.', 'error'); return; }
  const gMat = cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0);
  const gLabour = cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0);
  const totalHrs = cqLines.reduce((s, l) => s + calcCQLine(l).labourHrs * l.qty, 0);

  // Pre-fill the quote form
  const projName = document.getElementById('cq-project')?.value?.trim() || '';
  const clientName = document.getElementById('cq-client')?.value?.trim() || '';
  if (projName) document.getElementById('q-project').value = projName;
  if (clientName) document.getElementById('q-client').value = clientName;
  document.getElementById('q-materials').value = gMat.toFixed(2);
  document.getElementById('q-labour-rate').value = cqSettings.labourRate;
  document.getElementById('q-hours').value = totalHrs.toFixed(1);
  document.getElementById('q-markup').value = cqSettings.markup;
  document.getElementById('q-tax').value = cqSettings.tax;
  document.getElementById('q-notes').value = cqLines.map(l => {
    const desc = l.name || 'Cabinet';
    const details = [l.w+'×'+l.h+'×'+l.d+'mm', l.material];
    if (l.doors > 0) details.push(l.doors + ' door' + (l.doors!==1?'s':''));
    if (l.drawers > 0) details.push(l.drawers + ' drawer' + (l.drawers!==1?'s':''));
    if (l.qty > 1) details.push('x' + l.qty);
    return desc + ' — ' + details.join(', ');
  }).join('\n');

  switchSection('quote');
  try { _updateQuotePreview(); } catch(e) {}
  _toast('Quote form pre-filled — enter client details and create', 'success');
}

// ── Add to existing quote (show picker) ──
function cqAddToExistingQuote() {
  if (!cqLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!quotes.length) { _toast('No existing quotes. Use "Create New Quote" instead.', 'info'); cqAddToNewQuote(); return; }

  // Show picker inline below button
  const picker = document.getElementById('cq-quote-picker');
  if (!picker) return;
  if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
  const cur = window.currency;
  picker.style.display = 'block';
  picker.innerHTML = `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
    <select id="_cq_qsel" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;margin-bottom:8px">
      ${quotes.map((q,i) => `<option value="${i}">${quoteClient(q) || 'No client'} — ${quoteProject(q) || 'No project'} (${cur}${Math.round(quoteTotal(q))})</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px">
      <button class="btn btn-primary" onclick="const qi=parseInt(document.getElementById('_cq_qsel').value);document.getElementById('cq-quote-picker').style.display='none';_cqApplyToQuote(qi)" style="flex:1;font-size:12px;padding:7px 10px">Add</button>
      <button class="btn btn-outline" onclick="document.getElementById('cq-quote-picker').style.display='none'" style="width:auto;font-size:12px;padding:7px 10px">Cancel</button>
    </div>
  </div>`;
}
async function _cqApplyToQuote(qi) {
  const q = quotes[qi];
  if (!q) return;
  const cabNotes = cqLines.map(l => {
    const desc = l.name || 'Cabinet';
    const details = [l.w+'\u00d7'+l.h+'\u00d7'+l.d+'mm', l.material];
    if (l.doors > 0) details.push(l.doors + ' door' + (l.doors!==1?'s':''));
    if (l.drawers > 0) details.push(l.drawers + ' drawer' + (l.drawers!==1?'s':''));
    if (l.qty > 1) details.push('x' + l.qty);
    return desc + ' \u2014 ' + details.join(', ');
  }).join('\n');
  q.notes = ((q.notes || '') + '\n' + cabNotes).trim();
  if (_userId) {
    // Append cabinet specs as quote_lines rows so totals aggregate from the schema source of truth
    const { data: existing } = await _db('quote_lines').select('position').eq('quote_id', q.id);
    const startPos = (existing && existing.length) ? Math.max(...existing.map(r => r.position || 0)) + 1 : 1;
    const rows = cqLines.map((l, i) => _cqLineToRow(l, startPos + i, q.id));
    if (rows.length) await _db('quote_lines').insert(rows);
    await _db('quotes').update({ notes: q.notes, updated_at: new Date().toISOString() }).eq('id', q.id);
    await _refreshQuoteTotals(q.id);
  }
  switchSection('quote');
  renderQuoteMain();
  _toast(`Added to "${quoteProject(q)}" — quote lines added`, 'success');
}

// ── Save / Load / New Quotes ──
function saveCQQuote() {
  const client = document.getElementById('cq-client')?.value?.trim() || '';
  const project = document.getElementById('cq-project')?.value?.trim() || '';
  const notes = document.getElementById('cq-notes')?.value?.trim() || '';
  const quoteNum = document.getElementById('cq-quote-num')?.value?.trim() || '';
  if (!client && !project) { _toast('Enter a client or project name first.', 'error'); return; }

  const quote = {
    id: Date.now(), client, project, notes, quoteNum,
    lines: JSON.parse(JSON.stringify(cqLines)),
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    settings: { labourRate: cqSettings.labourRate, markup: cqSettings.markup, tax: cqSettings.tax }
  };

  if (cqActiveQuoteIdx >= 0 && cqSavedQuotes[cqActiveQuoteIdx]) {
    quote.id = cqSavedQuotes[cqActiveQuoteIdx].id;
    cqSavedQuotes[cqActiveQuoteIdx] = quote;
    _toast('Quote updated', 'success');
  } else {
    cqSavedQuotes.unshift(quote);
    cqActiveQuoteIdx = 0;
    _toast('Quote saved', 'success');
  }
  saveCQSaved();
  renderCQSavedShelf();
}

function loadCQQuote(idx) {
  const q = cqSavedQuotes[idx];
  if (!q) return;
  cqActiveQuoteIdx = idx;
  cqLines = JSON.parse(JSON.stringify(q.lines || []));
  cqNextId = cqLines.length > 0 ? Math.max(...cqLines.map(l=>l.id)) + 1 : 1;
  document.getElementById('cq-client').value = quoteClient(q) || '';
  document.getElementById('cq-project').value = quoteProject(q) || '';
  document.getElementById('cq-notes').value = q.notes || '';
  document.getElementById('cq-quote-num').value = q.quoteNum || '';
  saveCQLines();
  renderCQPanel();
}

function newCQQuote() {
  cqActiveQuoteIdx = -1;
  cqLines = [];
  cqNextId = 1;
  document.getElementById('cq-client').value = '';
  document.getElementById('cq-project').value = '';
  document.getElementById('cq-notes').value = '';
  document.getElementById('cq-quote-num').value = '';
  saveCQLines();
  renderCQPanel();
}

function deleteCQQuote(idx) {
  _confirm('Delete this saved quote?', () => {
    cqSavedQuotes.splice(idx, 1);
    if (cqActiveQuoteIdx === idx) { cqActiveQuoteIdx = -1; newCQQuote(); }
    else if (cqActiveQuoteIdx > idx) cqActiveQuoteIdx--;
    saveCQSaved();
    renderCQSavedShelf();
  });
}

function renderCQSavedShelf() {
  const shelf = document.getElementById('cq-saved-shelf');
  const pills = document.getElementById('cq-saved-pills');
  if (!shelf || !pills) return;
  if (cqSavedQuotes.length === 0) { shelf.style.display = 'none'; return; }
  shelf.style.display = '';
  const cur = window.currency;
  pills.innerHTML = cqSavedQuotes.map((q, i) => {
    const total = q.lines.reduce((s, l) => {
      const c = calcCQLine(l);
      return s + c.lineSubtotal;
    }, 0);
    const gt = total * (1 + (q.settings?.markup||0)/100) * (1 + (q.settings?.tax||0)/100);
    const active = i === cqActiveQuoteIdx;
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent-dim)':'var(--surface)'};cursor:pointer;flex-shrink:0;white-space:nowrap" onclick="loadCQQuote(${i})">
      <div style="font-size:11px;font-weight:600;color:var(--text)">${quoteClient(q)||quoteProject(q)}</div>
      <div style="font-size:10px;color:var(--muted)">${q.date}</div>
      <div style="font-size:11px;font-weight:700;color:var(--accent)">${cur}${Math.round(gt).toLocaleString()}</div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:0" onclick="event.stopPropagation();dupCQSavedQuote(${i})" title="Duplicate">&#10697;</button>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:0" onclick="event.stopPropagation();deleteCQQuote(${i})">&times;</button>
    </div>`;
  }).join('');
}

// ── Convert to Order ──
function cqConvertToOrder() {
  const client = document.getElementById('cq-client')?.value?.trim() || 'Cabinet Client';
  const project = document.getElementById('cq-project')?.value?.trim() || 'Cabinet Project';
  if (!cqLines.length) { _toast('Add cabinet lines first.', 'error'); return; }

  const grandSubtotal = cqLines.reduce((s, l) => s + calcCQLine(l).lineSubtotal, 0);
  const grandTotal = grandSubtotal * (1 + cqSettings.markup/100) * (1 + cqSettings.tax/100);

  // Create via the existing quote system
  const row = {
    user_id: _userId, client, project,
    materials: cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0),
    labour: cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0),
    markup: cqSettings.markup, tax: cqSettings.tax,
    status: 'draft',
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
    notes: 'Cabinet Quote: ' + cqLines.map(l => l.name || 'Cabinet').filter(Boolean).join(', '),
  };

  if (_userId) {
    _db('quotes').insert(row).select().single().then(({data, error}) => {
      if (error) { _toast('Could not save quote: ' + (error.message||''), 'error'); return; }
      quotes.unshift(data);
      _toast('Quote created from cabinet quote', 'success');
      renderQuoteMain();
      switchSection('quote');
    });
  } else {
    _toast('Sign in to save quotes', 'error');
  }
}

// ── PDF / Print ──

let _clProjectCache = [];

// ── Cut List smart search: Projects ──
function _smartCLProjectSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const matches = q ? _clProjectCache.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8) : _clProjectCache.slice(0, 8);
  if (matches.length === 0 && !q) { box.style.display = 'none'; return; }
  let html = '';
  matches.forEach((p, i) => {
    const idx = _clProjectCache.indexOf(p);
    const date = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '';
    html += `<div class="client-suggest-item" onmousedown="_clLoadProjectByIdx(${idx});document.getElementById('cl-project').value='${_escHtml(p.name)}';document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon">P</span>
      <span style="flex:1">${_escHtml(p.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${date}</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="showSaveProjectForm()">+ Save current cut list as "${_escHtml(input.value.trim())}"</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// ── Cut List smart search: Stock Materials ──
function _smartCLStockSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const ebOn = typeof colsVisible !== 'undefined' && !!colsVisible.edgeband;
  // Panels: Sheet Goods or anything with dims (but not Edge Banding)
  const panelItems = stockItems.filter(s => (_scGet(s.id)||s.category) !== 'Edge Banding' && ((_scGet(s.id)||s.category) === 'Sheet Goods' || (s.w > 0 && s.h > 0)));
  // When edgeband column is on, also include Edge Banding items
  const ebItems = ebOn ? stockItems.filter(s => (_scGet(s.id)||s.category) === 'Edge Banding') : [];
  const pool = panelItems.concat(ebItems);
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  if (matches.length === 0 && !q) { box.style.display = 'none'; return; }
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const origIdx = stockItems.indexOf(s);
    const isEB = (_scGet(s.id)||s.category) === 'Edge Banding';
    const qtyColor = s.qty <= (s.lowAlert || 3) ? '#ef4444' : '#22c55e';
    let meta = '';
    if (isEB) {
      const vd = _svGet(s.id) || {};
      const t = vd.thickness ?? s.thickness;
      const w = vd.width ?? s.width ?? s.h;
      const l = vd.length ?? s.length ?? s.w;
      meta = [t?`${t}mm`:'', w?`${w}mm`:'', l?`${l}m`:''].filter(Boolean).join(' · ');
    } else {
      meta = (s.w && s.h ? `${s.w}×${s.h}` : '');
    }
    const handler = isEB
      ? `_clAddEdgeBandFromStockIdx(${origIdx})`
      : `_clAddPanelFromStock(${origIdx})`;
    const badge = isEB ? `<span style="font-size:9px;font-weight:600;color:var(--muted);background:var(--border);padding:1px 5px;border-radius:3px;margin-right:4px">EB</span>` : '';
    html += `<div class="client-suggest-item" onmousedown="${handler};document.getElementById('cl-stock').value='';document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${badge}${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${meta}</span>
    </div>`;
  });
  if (matches.length === 0) {
    html += `<div class="client-suggest-add" onmousedown="switchSection('stock')">No matches — go to Stock to add materials</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

function _clAddPanelFromStock(idx) { const item = stockItems[idx]; if (!item) return; addSheet(item.name, item.w, item.h, Math.max(1, item.qty)); _toast('"'+item.name+'" added to panels', 'success'); }

function _clAddEdgeBandFromStockIdx(idx) {
  const s = stockItems[idx];
  if (!s) return;
  const exists = edgeBands.find(eb => eb.name === s.name);
  if (exists) { _toast(`${s.name} already in project`, 'error'); return; }
  const vd = _svGet(s.id) || {};
  const thickness = vd.thickness ?? s.thickness ?? 0;
  const width = vd.width ?? s.width ?? s.h ?? 0;
  const length = vd.length ?? s.length ?? s.w ?? 0;
  const glue = vd.glue || s.glue || '';
  addEdgeBand(s.name, thickness, width, null, length, glue);
  _toast(`Added ${s.name}`, 'success');
}

// ── Cut List Cabinet Library ──
function _smartCLCabinetSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(q)) : cqLibrary;
  let html = '';
  matches.slice(0, 8).forEach(c => {
    const idx = cqLibrary.indexOf(c);
    const partCount = _cabinetPartCount(c);
    html += `<div class="client-suggest-item" onmousedown="_clLoadCabinetParts(${idx});document.getElementById('cl-cabinet-search').value='';document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">C</span>
      <span style="flex:1">${_escHtml(c._libName||c.name||'Cabinet')}</span>
      <span style="font-size:10px;color:var(--muted)">${c.w}×${c.h} · ${partCount} parts</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_clSaveToCabinetLibrary()">+ Save current cut parts to library</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// Count how many cut parts a cabinet would produce
function _cabinetPartCount(cab) {
  let n = 4; // 2 sides + top + bottom
  if (cab.backMat) n++; // back panel
  n += (cab.doors || 0);
  n += (cab.drawers || 0) * 2; // front + box per drawer
  n += (cab.shelves || 0) + (cab.adjShelves || 0) + (cab.looseShelves || 0);
  n += (cab.partitions || 0) + (cab.endPanels || 0);
  return n;
}

// Build the list of parts a cabinet explodes into — pure data, no side effects.
function _cabinetPartsList(cab) {
  const W = cab.w, H = cab.h, D = cab.d;
  const T = 18;
  const iW = Math.max(0, W - 2*T);
  const mat = cab.material || '';
  const backMat = cab.backMat || mat;
  const name = cab._libName || cab.name || 'Cabinet';
  const parts = [];
  const add = (label, w, h, qty) => parts.push({ label, w, h, qty, grain: 'none' });

  add(name + ' — Side', H, D, 2);
  add(name + ' — Top/Bottom', iW, D, 2);
  if (backMat) add(name + ' — Back', W, H, 1);

  if (cab.doors > 0) {
    const doorPct = (cab.doorPct || 95) / 100;
    const doorH = Math.round(H * doorPct);
    const doorW = Math.round(iW / Math.max(1, cab.doors));
    add(name + ' — Door', doorW, doorH, cab.doors);
  }
  if (cab.drawers > 0) {
    const drwPct = (cab.drawerPct || 85) / 100;
    const drwH = Math.round((H * drwPct) / cab.drawers);
    add(name + ' — Drawer Front', iW, drwH, cab.drawers);
    const boxH = drwH - 20;
    const boxD = D - 40;
    add(name + ' — Drawer Side', boxD, boxH, cab.drawers * 2);
    add(name + ' — Drawer F/B', Math.max(0, iW - 2*T), boxH, cab.drawers * 2);
    add(name + ' — Drawer Base', Math.max(0, iW - 2*T), boxD, cab.drawers);
  }
  const shelfCount = (cab.shelves||0) + (cab.adjShelves||0) + (cab.looseShelves||0);
  if (shelfCount > 0) add(name + ' — Shelf', iW, D - T, shelfCount);
  if (cab.partitions > 0) add(name + ' — Partition', H, D, cab.partitions);
  if (cab.endPanels > 0) add(name + ' — End Panel', H, D, cab.endPanels);
  return parts;
}

// Apply a built parts list to the cut list under a chosen merge strategy:
//   'merge' — identical parts (same label + w + h + grain) bump existing qty;
//             non-matching parts are appended as new rows.
//   'new'   — every part becomes a new row (prior behaviour).
// Extra fields on the part (material, notes, edgeBand) are carried onto newly-added pieces.
function _applyCabinetParts(parts, mode) {
  const key = p => `${p.label}|${p.w}|${p.h}|${p.grain||'none'}`;
  const applyExtras = (src) => {
    const last = pieces[pieces.length - 1];
    if (!last) return;
    if (src.material !== undefined) last.material = src.material || '';
    if (src.notes    !== undefined) last.notes    = src.notes    || '';
    if (src.edgeBand !== undefined) last.edgeBand = src.edgeBand || 'none';
  };
  let merged = 0, added = 0;
  if (mode === 'merge') {
    const idx = new Map();
    pieces.forEach(p => idx.set(key(p), p));
    for (const c of parts) {
      const hit = idx.get(key(c));
      if (hit) { hit.qty = (hit.qty || 0) + c.qty; merged++; }
      else { addPiece(c.label, c.w, c.h, c.qty, c.grain); applyExtras(c); added++; }
    }
  } else {
    for (const c of parts) { addPiece(c.label, c.w, c.h, c.qty, c.grain); applyExtras(c); added++; }
  }
  renderPieces();
  return { merged, added };
}

// Prompt user to merge or add-as-new when a parts list has duplicates in the cut list.
// If there are no duplicates, parts are added straight away with no prompt.
function _clPromptMergeOrNew(parts, name) {
  const key = p => `${p.label}|${p.w}|${p.h}|${p.grain||'none'}`;
  const existing = new Set(pieces.map(key));
  const dupCount = parts.filter(c => existing.has(key(c))).length;

  const finish = (mode) => {
    const r = _applyCabinetParts(parts, mode);
    const suffix = r.merged
      ? `${r.merged} merged, ${r.added} added`
      : `${r.added} parts added`;
    _toast(`"${name}" — ${suffix}`, 'success');
  };

  if (dupCount === 0) { finish('new'); return; }

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Identical parts already in cut list</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <p style="margin:0 0 10px 0;line-height:1.5">
        <strong>${dupCount}</strong> of the ${parts.length} parts in <strong>${_escHtml(name)}</strong>
        match existing rows in your cut list (same label &amp; dimensions).
      </p>
      <p style="margin:0;color:var(--muted);font-size:12px;line-height:1.5">
        Merging bumps the quantity on existing rows. Adding as new keeps them separate.
      </p>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" id="cl-cab-cancel">Cancel</button>
      <button class="btn btn-outline" id="cl-cab-new">Add as new</button>
      <button class="btn btn-primary" id="cl-cab-merge">Merge quantities</button>
    </div>
  `, 'sm');
  document.getElementById('cl-cab-cancel').onclick = () => _closePopup();
  document.getElementById('cl-cab-new').onclick   = () => { _closePopup(); finish('new');   };
  document.getElementById('cl-cab-merge').onclick = () => { _closePopup(); finish('merge'); };
}

// Explode a saved cabinet into individual cut list pieces.
// If any parts match existing cut-list rows, prompt the user to merge or add as new.
function _clLoadCabinetParts(libIdx) {
  const cab = cqLibrary[libIdx];
  if (!cab) return;
  const name = cab._libName || cab.name || 'Cabinet';
  _clPromptMergeOrNew(_cabinetPartsList(cab), name);
}

// Save current cut parts as a cabinet library entry
function _clSaveToCabinetLibrary() {
  if (!pieces.length) { _toast('No cut parts to save', 'error'); return; }
  const projName = document.getElementById('cl-project')?.value?.trim() || '';
  const defaultName = projName || `Cut List ${new Date().toLocaleDateString()}`;
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Save to Cabinet Library</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Template Name</label><input class="pf-input pf-input-lg" id="pcl-name" value="${_escHtml(defaultName)}"></div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">${pieces.length} cut parts will be saved as a reusable template.</div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_confirmSaveCLToCabLib()">Save Template</button>
    </div>
  `, 'sm');
  setTimeout(() => { const i = document.getElementById('pcl-name'); if (i) { i.focus(); i.select(); } }, 50);
}

function _confirmSaveCLToCabLib() {
  const name = _popupVal('pcl-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  // Create a lightweight cabinet library entry that stores cut parts directly
  const entry = cqDefaultLine();
  entry.id = Date.now();
  entry._libName = name;
  entry.name = name;
  // Store cut parts snapshot
  entry._cutParts = pieces.filter(p => p.enabled !== false).map(p => ({
    label: p.label, w: p.w, h: p.h, qty: p.qty, grain: p.grain || 'none', material: p.material || '', notes: p.notes || '', edgeBand: p.edgeBand || 'none'
  }));
  // Estimate dims from largest part
  const maxW = Math.max(...pieces.map(p => Math.max(p.w, p.h)), 600);
  const maxD = Math.max(...pieces.map(p => Math.min(p.w, p.h)), 560);
  entry.w = maxW; entry.h = maxW; entry.d = maxD;
  cqLibrary.push(entry);
  _closePopup();
  _toast(`"${name}" saved to cabinet library`, 'success');
  _saveCabinetToDB(entry).then(id => { if (id) entry.db_id = id; });
}

// Override _clLoadCabinetParts to also handle entries with _cutParts
const _clLoadCabinetParts_orig = _clLoadCabinetParts;
_clLoadCabinetParts = function(libIdx) {
  const cab = cqLibrary[libIdx];
  if (!cab) return;
  if (cab._cutParts && cab._cutParts.length) {
    const name = cab._libName || cab.name || 'Cabinet';
    _clPromptMergeOrNew(cab._cutParts, name);
    return;
  }
  // Otherwise explode from cabinet dimensions
  _clLoadCabinetParts_orig(libIdx);
};

function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function printCQQuote(mode) {
  if (!cqLines.length) { _toast('Add cabinet lines first.', 'error'); return; }
  if (mode === 'pdf') {
    // Build a synthetic quote object for the jsPDF builder
    const gMat = cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0);
    const gLabour = cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0);
    const cabNotes = cqLines.map(l => {
      const desc = l.name || 'Cabinet';
      const details = [l.w+'\u00d7'+l.h+'\u00d7'+l.d+'mm', l.material];
      if (l.doors > 0) details.push(l.doors + ' door' + (l.doors!==1?'s':''));
      if (l.drawers > 0) details.push(l.drawers + ' drawer' + (l.drawers!==1?'s':''));
      if (l.qty > 1) details.push('x' + l.qty);
      return desc + ' \u2014 ' + details.join(', ');
    }).join('\n');
    _buildQuotePDF({
      id: Date.now(), client: '', project: 'Cabinet Quote',
      materials: gMat, labour: gLabour,
      markup: cqSettings.markup, tax: cqSettings.tax,
      status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
      notes: cabNotes
    });
    return;
  }
  const cur = window.currency;
  const fmt = v => cur + Number(v).toFixed(2);
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const biz = getBizInfo();
  const client = document.getElementById('cq-client')?.value?.trim() || '';
  const project = document.getElementById('cq-project')?.value?.trim() || '';
  const notes = document.getElementById('cq-notes')?.value?.trim() || '';
  const quoteNum = document.getElementById('cq-quote-num')?.value?.trim() || ('CQ-' + Date.now().toString(36).toUpperCase());

  let grandMat = 0, grandLabour = 0, grandHw = 0, grandSub = 0;
  let lineNum = 0, lastRoom = null;
  const hasRooms = cqLines.some(l => l.room);
  const lineRows = cqLines.map((line) => {
    const c = calcCQLine(line);
    grandMat += c.matCost * line.qty;
    grandLabour += c.labourCost * line.qty;
    grandHw += c.hwCost * line.qty;
    grandSub += c.lineSubtotal;
    lineNum++;
    let roomHeader = '';
    if (hasRooms && line.room !== lastRoom) {
      lastRoom = line.room;
      roomHeader = `<tr><td colspan="5" style="padding:10px 10px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#888;background:#f8f8f8;border-bottom:1px solid #e0e0e0">${_escHtml(line.room || 'Other')}</td></tr>`;
    }
    return roomHeader + `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555">${lineNum}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0"><strong>${_escHtml(line.name || 'Cabinet')}</strong><br><span style="font-size:10px;color:#999">${line.w}&times;${line.h}&times;${line.d}mm &middot; ${_escHtml(line.material)}</span>
      ${line.doors>0?'<br><span style="font-size:10px;color:#999">'+line.doors+' door(s)</span>':''}
      ${line.drawers>0?'<br><span style="font-size:10px;color:#999">'+line.drawers+' drawer(s)</span>':''}
      ${line.shelves+line.adjShelves>0?'<br><span style="font-size:10px;color:#999">'+(line.shelves+line.adjShelves)+' shelf/shelves</span>':''}
      ${line.hwItems.length>0?'<br><span style="font-size:10px;color:#999">HW: '+line.hwItems.map(h=>_escHtml(h.name)+' x'+h.qty).join(', ')+'</span>':''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center">${line.qty}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-variant-numeric:tabular-nums">${fmt(c.matCost + c.labourCost + c.hwCost)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmt0(c.lineSubtotal)}</td>
    </tr>`;
  }).join('');

  const markupAmt = grandSub * cqSettings.markup / 100;
  const afterMarkup = grandSub + markupAmt;
  const taxAmt = afterMarkup * cqSettings.tax / 100;
  const grandTotal = afterMarkup + taxAmt;

  const pdfHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quote ${quoteNum} - ${project}</title>
<style>
  @page { size:A4; margin:14mm 16mm; }
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; line-height:1.5; }
  .hdr { display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #111;margin-bottom:24px; }
  .biz-name { font-size:18px;font-weight:800;letter-spacing:-.3px; }
  .biz-contact { font-size:10px;color:#777;margin-top:4px;line-height:1.7; }
  .doc-right { text-align:right; }
  .doc-word { font-size:26px;font-weight:200;letter-spacing:3px;text-transform:uppercase;color:#222; }
  .doc-num { font-size:11px;color:#888;margin-top:4px; }
  .bill-row { display:flex;gap:40px;margin-bottom:22px; }
  .bill-block label { font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:#bbb;display:block;margin-bottom:4px;border-bottom:1px solid #eee;padding-bottom:3px; }
  .bill-block .name { font-size:15px;font-weight:700; }
  table { width:100%;border-collapse:collapse;margin-bottom:4px; }
  thead tr { border-bottom:1.5px solid #111; }
  thead th { font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888;padding:6px 10px;text-align:left; }
  thead th.r { text-align:right; }
  .total-box { display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;padding:12px 16px;border-radius:6px;margin-top:8px; }
  .total-label { font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;opacity:.7; }
  .total-amount { font-size:24px;font-weight:800;letter-spacing:-.4px; }
  .breakdown { display:flex;gap:24px;margin-top:14px;padding:12px 16px;background:#f8f8f8;border-radius:6px; }
  .bd-item { flex:1; }
  .bd-label { font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#aaa;margin-bottom:2px; }
  .bd-val { font-size:14px;font-weight:700; }
  .notes-box { margin-top:18px;background:#f8f8f8;border-radius:6px;padding:14px 16px; }
  .notes-box label { font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:#aaa;display:block;margin-bottom:6px; }
  .notes-box p { font-size:12px;color:#333;line-height:1.6; }
  .validity { margin-top:16px;font-size:10px;color:#aaa; }
  .acceptance { margin-top:28px;padding-top:16px;border-top:1px solid #e0e0e0; }
  .acceptance-title { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#555;margin-bottom:10px; }
  .acceptance-text { font-size:11px;color:#777;margin-bottom:18px;line-height:1.5; }
  .sig-grid { display:grid;grid-template-columns:2fr 1fr;gap:28px; }
  .sig-field { border-bottom:1.5px solid #ccc;padding-top:28px; }
  .sig-label { font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#bbb;margin-top:4px; }
  .footer { margin-top:30px;display:flex;justify-content:space-between;font-size:8px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px; }
</style></head><body>
<div class="hdr">
  <div><div class="biz-name">${biz.name||'Your Business'}</div><div class="biz-contact">${[biz.phone,biz.email,biz.address,biz.abn?'ABN: '+biz.abn:''].filter(Boolean).join('<br>')}</div></div>
  <div class="doc-right"><div class="doc-word">Quotation</div><div class="doc-num">#${quoteNum} &bull; ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>
</div>
<div class="bill-row">
  <div class="bill-block"><label>Prepared for</label><div class="name">${_escHtml(client)||'—'}</div></div>
  <div class="bill-block"><label>Project</label><div class="name" style="font-size:14px">${_escHtml(project)||'—'}</div></div>
</div>
<table>
  <thead><tr><th>#</th><th>Description</th><th style="text-align:center">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr></thead>
  <tbody>${lineRows}</tbody>
</table>
<div class="breakdown">
  <div class="bd-item"><div class="bd-label">Materials</div><div class="bd-val">${fmt0(grandMat)}</div></div>
  <div class="bd-item"><div class="bd-label">Labour</div><div class="bd-val">${fmt0(grandLabour)}</div></div>
  <div class="bd-item"><div class="bd-label">Hardware</div><div class="bd-val">${fmt0(grandHw)}</div></div>
  <div class="bd-item"><div class="bd-label">Subtotal</div><div class="bd-val">${fmt0(grandSub)}</div></div>
  ${cqSettings.markup>0?'<div class="bd-item"><div class="bd-label">Markup ('+cqSettings.markup+'%)</div><div class="bd-val">+'+fmt0(markupAmt)+'</div></div>':''}
  ${cqSettings.tax>0?'<div class="bd-item"><div class="bd-label">Tax ('+cqSettings.tax+'%)</div><div class="bd-val">+'+fmt0(taxAmt)+'</div></div>':''}
</div>
<div class="total-box"><div class="total-label">Total Amount Due</div><div class="total-amount">${fmt0(grandTotal)}</div></div>
${cqSettings.deposit > 0 && cqSettings.deposit < 100 ? `<div style="display:flex;gap:20px;margin-top:8px;padding:10px 16px;background:#f0f7ff;border:1px solid #c8ddf5;border-radius:6px">
  <div><div style="font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#6b8db5;margin-bottom:1px">Deposit Required (${cqSettings.deposit}%)</div><div style="font-size:16px;font-weight:800">${fmt0(grandTotal * cqSettings.deposit / 100)}</div></div>
  <div><div style="font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#6b8db5;margin-bottom:1px">Balance on Completion</div><div style="font-size:16px;font-weight:800">${fmt0(grandTotal * (1 - cqSettings.deposit / 100))}</div></div>
</div>` : ''}
${notes?'<div class="notes-box"><label>Scope &amp; Notes</label><p>'+_escHtml(notes).replace(/\\n/g,'<br>')+'</p></div>':''}
<div class="validity">This quote is valid for 30 days from the date of issue. Prices are subject to change after this period.${cqSettings.deposit > 0 && cqSettings.deposit < 100 ? ' A deposit of ' + cqSettings.deposit + '% is required upon acceptance to commence work.' : ''}</div>
<div class="acceptance">
  <div class="acceptance-title">Acceptance</div>
  <div class="acceptance-text">To accept this quotation, please sign below and return a copy to ${biz.name||'us'}${biz.email?' at '+biz.email:''}.</div>
  <div class="sig-grid"><div><div class="sig-field"></div><div class="sig-label">Client Signature</div></div><div><div class="sig-field"></div><div class="sig-label">Date</div></div></div>
</div>
<div class="footer"><span>${biz.name||'ProCabinet'} — Generated by ProCabinet.App</span><span>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span></div>
</body></html>`;

  _saveAsPDF(pdfHtml);
}

// ── Copy summary to clipboard ──
function copyCQSummary() {
  if (!cqLines.length) { _toast('No items to copy.', 'error'); return; }
  const cur = window.currency;
  const client = document.getElementById('cq-client')?.value?.trim() || '';
  const project = document.getElementById('cq-project')?.value?.trim() || '';
  let grandSub = 0;
  const lineTexts = cqLines.map((line, i) => {
    const c = calcCQLine(line);
    grandSub += c.lineSubtotal;
    return `${i+1}. ${line.name||line.type} (${line.w}x${line.h}x${line.d}mm) x${line.qty} — ${cur}${Math.round(c.lineSubtotal)}`;
  });
  const markupAmt = grandSub * cqSettings.markup / 100;
  const taxAmt = (grandSub + markupAmt) * cqSettings.tax / 100;
  const grandTotal = grandSub + markupAmt + taxAmt;
  const depositAmt = grandTotal * cqSettings.deposit / 100;

  const text = [
    client || project ? `${client}${project ? ' — ' + project : ''}` : 'Cabinet Quote',
    '─'.repeat(30),
    ...lineTexts,
    '─'.repeat(30),
    `Subtotal: ${cur}${Math.round(grandSub)}`,
    cqSettings.markup > 0 ? `Markup (${cqSettings.markup}%): +${cur}${Math.round(markupAmt)}` : '',
    cqSettings.tax > 0 ? `Tax (${cqSettings.tax}%): +${cur}${Math.round(taxAmt)}` : '',
    `TOTAL: ${cur}${Math.round(grandTotal)}`,
    cqSettings.deposit > 0 && cqSettings.deposit < 100 ? `Deposit (${cqSettings.deposit}%): ${cur}${Math.round(depositAmt)}` : '',
  ].filter(Boolean).join('\n');

  navigator.clipboard.writeText(text).then(() => _toast('Summary copied to clipboard', 'success')).catch(() => _toast('Copy failed', 'error'));
}

// ── Send to Quick Quote ──
function cqSendToQuickQuote() {
  if (!cqLines.length) { _toast('Add cabinet lines first.', 'error'); return; }
  const grandSub = cqLines.reduce((s, l) => s + calcCQLine(l).lineSubtotal, 0);
  const matTotal = cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0);
  const labourTotal = cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0);
  const client = document.getElementById('cq-client')?.value?.trim() || '';
  const project = document.getElementById('cq-project')?.value?.trim() || '';

  document.getElementById('q-client').value = client;
  document.getElementById('q-project').value = project;
  document.getElementById('q-materials').value = matTotal.toFixed(2);
  document.getElementById('q-labour-rate').value = cqSettings.labourRate;
  const totalHrs = cqLines.reduce((s, l) => s + calcCQLine(l).labourHrs * l.qty, 0);
  document.getElementById('q-hours').value = totalHrs.toFixed(1);
  document.getElementById('q-markup').value = cqSettings.markup;
  document.getElementById('q-tax').value = cqSettings.tax;
  document.getElementById('q-notes').value = 'Cabinet Quote: ' + cqLines.map(l => (l.name || 'Cabinet') + (l.qty > 1 ? ' x' + l.qty : '')).join(', ');

  switchSection('quote');
  try { _updateQuotePreview(); } catch(e) {}
  _toast('Sent to Quote — review and create', 'success');
}

// ── Duplicate saved quote ──
function dupCQSavedQuote(idx) {
  const src = cqSavedQuotes[idx];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = Date.now();
  copy.client = src.client + ' (copy)';
  copy.date = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  cqSavedQuotes.unshift(copy);
  saveCQSaved();
  renderCQSavedShelf();
  _toast('Quote duplicated', 'success');
}


// ── Init CQ ──
loadCQSettings();
loadCQLines();
loadCQSaved();
loadCQProjectLibrary();
loadStockLibraries();

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
loadBizInfo();
loadLogoPreview();
// Restore kerf
(function(){ const k = localStorage.getItem('pc_kerf'); if (k) { const el = document.getElementById('kerf'); if (el) el.value = k; } })();
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

// ══════════════════════════════════════════
// CLIENTS & PROJECTS — CRUD + RENDER
// ══════════════════════════════════════════

// ── Safe insert — retries by stripping columns the schema doesn't have yet ──
async function _dbInsertSafe(table, row) {
  let { data, error } = await _db(table).insert(row).select().single();
  while (error && error.message) {
    const m = error.message.match(/Could not find the '(\w+)' column/);
    if (!m) break;
    delete row[m[1]];
    ({ data, error } = await _db(table).insert(row).select().single());
  }
  return { data, error };
}

// ── Resolve-or-create helpers ──
async function resolveClient(name) {
  if (!name) return null;
  const existing = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const row = { user_id: _userId, name };
  const { data, error } = await _db('clients').insert(row).select().single();
  if (error || !data) return null;
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  return data.id;
}

async function resolveProject(name, clientId) {
  if (!name) return null;
  const existing = projects.find(p => p.name.toLowerCase() === name.toLowerCase() && (p.client_id === clientId || !clientId));
  if (existing) return existing.id;
  const row = { user_id: _userId, name, status: 'active' };
  if (clientId) row.client_id = clientId;
  const { data, error } = await _dbInsertSafe('projects', row);
  if (error || !data) return null;
  projects.unshift(data);
  return data.id;
}

// ── Client CRUD ──
async function createClient() {
  const name = document.getElementById('cl-name').value.trim();
  if (!name) { _toast('Enter a client name.', 'error'); return; }
  if (!_requireAuth()) return;
  const row = {
    user_id: _userId, name,
    email: document.getElementById('cl-email').value.trim() || null,
    phone: document.getElementById('cl-phone').value.trim() || null,
    address: document.getElementById('cl-address').value.trim() || null,
    notes: document.getElementById('cl-notes').value.trim() || null,
  };
  const { data, error } = await _dbInsertSafe('clients', row);
  if (error) { _toast('Could not save client — ' + (error.message || JSON.stringify(error)), 'error'); return; }
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  _toast('Client added', 'success');
  document.getElementById('cl-name').value = '';
  document.getElementById('cl-email').value = '';
  document.getElementById('cl-phone').value = '';
  document.getElementById('cl-address').value = '';
  document.getElementById('cl-notes').value = '';
  renderClientsMain();
}

async function updateClient(id, field, value) {
  const c = clients.find(c => c.id === id);
  if (!c) return;
  c[field] = value;
  await _db('clients').update({ [field]: value }).eq('id', id);
}

async function removeClient(id) {
  if (!_requireAuth()) return;
  await _db('clients').delete().eq('id', id);
  clients = clients.filter(c => c.id !== id);
  renderClientsMain();
  _toast('Client removed', 'success');
}

// ── Project CRUD ──
async function createProject() {
  const name = document.getElementById('pj-name').value.trim();
  if (!name) { _toast('Enter a project name.', 'error'); return; }
  if (!_requireAuth()) return;
  const clientName = document.getElementById('pj-client').value.trim();
  const clientId = clientName ? await resolveClient(clientName) : null;
  const row = {
    user_id: _userId, name,
    description: document.getElementById('pj-desc').value.trim() || null,
    status: document.getElementById('pj-status').value,
  };
  if (clientId) row.client_id = clientId;
  let { data, error } = await _dbInsertSafe('projects', row);
  if (error) { _toast('Could not save project — ' + (error.message || JSON.stringify(error)), 'error'); return; }
  data.status = data.status || 'active';
  projects.unshift(data);
  _toast('Project created', 'success');
  document.getElementById('pj-name').value = '';
  document.getElementById('pj-client').value = '';
  document.getElementById('pj-desc').value = '';
  document.getElementById('pj-status').value = 'active';
  renderProjectsMain();
  // Scroll to the newly created project
  setTimeout(() => _highlightProject(data.id), 100);
}

async function updateProject(id, field, value) {
  const p = projects.find(p => p.id === id);
  if (!p) return;
  p[field] = value;
  await _db('projects').update({ [field]: value }).eq('id', id);
}

async function removeProject(id) {
  if (!_requireAuth()) return;
  await _db('projects').delete().eq('id', id);
  projects = projects.filter(p => p.id !== id);
  renderProjectsMain();
  _toast('Project removed', 'success');
}

// ── Client name helper ──
function _clientName(id) {
  const c = clients.find(c => c.id === id);
  return c ? c.name : '';
}
function _projectName(id) {
  const p = projects.find(p => p.id === id);
  return p ? p.name : '';
}

// ── Client suggest for Projects sidebar ──
function _pjClientSuggest(input) {
  const val = input.value.toLowerCase().trim();
  const list = document.getElementById('pj-client-suggest');
  if (!list) return;
  _posSuggest(input, list);
  const matches = val ? clients.filter(c => c.name.toLowerCase().includes(val)).slice(0, 8) : clients.slice(0, 8);
  if (!matches.length && !val) { list.style.display = 'none'; return; }
  list.innerHTML = matches.map(c => `<div class="client-suggest-item" onmousedown="document.getElementById('pj-client').value='${_escHtml(c.name)}';document.getElementById('pj-client-suggest').style.display='none'">
    <span class="suggest-icon">${c.name.charAt(0).toUpperCase()}</span>
    <span>${_escHtml(c.name)}</span>
  </div>`).join('') + `<div class="client-suggest-add" onmousedown="_openNewClientPopup('pj-client')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new client</div>`;
  list.style.display = 'block';
  input.onblur = () => setTimeout(() => list.style.display = 'none', 150);
}

// ── Render Clients Tab ──
function renderClientsMain() {
  const el = document.getElementById('clients-main');
  if (!el) return;
  const cur = window.currency;

  const clientCard = c => {
    const cQuotes = quotes.filter(q => q.client_id === c.id || (!q.client_id && quoteClient(q) === c.name));
    const cOrders = orders.filter(o => o.client_id === c.id || (!o.client_id && orderClient(o) === c.name));
    const cProjects = projects.filter(p => p.client_id === c.id);
    const totalValue = cOrders.reduce((s,o) => s + o.value, 0) + cQuotes.reduce((s,q) => s + quoteTotal(q), 0);
    const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:6px;cursor:pointer;transition:box-shadow .15s" onclick="_openClientPopup(${c.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${c.name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(c.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">
            ${c.email ? _escHtml(c.email) : ''}${c.email && c.phone ? ' · ' : ''}${c.phone ? _escHtml(c.phone) : ''}
            ${(c.email || c.phone) ? ' · ' : ''}${cProjects.length} project${cProjects.length!==1?'s':''} · ${cOrders.length} order${cOrders.length!==1?'s':''} · ${fmt(totalValue)}
          </div>
        </div>
      </div>
      ${cProjects.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:6px">${cProjects.map(p => `<span class="badge ${p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue'}" style="font-size:9px;padding:1px 6px">${_escHtml(p.name)}</span>`).join('')}</div>` : ''}
    </div>`;
  };

  const search = (window._clientSearch || '').toLowerCase();
  const sortBy = window._clientSort || 'name';
  let filtered = search ? clients.filter(c => c.name.toLowerCase().includes(search)) : [...clients];
  if (sortBy === 'value') filtered.sort((a,b) => {
    const va = orders.filter(o=>o.client_id===a.id||orderClient(o)===a.name).reduce((s,o)=>s+o.value,0) + quotes.filter(q=>q.client_id===a.id||quoteClient(q)===a.name).reduce((s,q)=>s+quoteTotal(q),0);
    const vb = orders.filter(o=>o.client_id===b.id||orderClient(o)===b.name).reduce((s,o)=>s+o.value,0) + quotes.filter(q=>q.client_id===b.id||quoteClient(q)===b.name).reduce((s,q)=>s+quoteTotal(q),0);
    return vb - va;
  });
  else if (sortBy === 'orders') filtered.sort((a,b) => orders.filter(o=>o.client_id===b.id||orderClient(o)===b.name).length - orders.filter(o=>o.client_id===a.id||orderClient(o)===a.name).length);
  else filtered.sort((a,b) => a.name.localeCompare(b.name));

  const totalClientValue = clients.reduce((s,c) => s + orders.filter(o=>o.client_id===c.id||orderClient(o)===c.name).reduce((t,o)=>t+o.value,0), 0);
  const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

  el.innerHTML = `<div style="padding:24px;max-width:900px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-size:18px;font-weight:800;color:var(--text);flex:1">Clients <span style="font-size:13px;font-weight:400;color:var(--muted)">(${clients.length})</span></div>
      <input type="text" placeholder="Search clients..." value="${_escHtml(window._clientSearch||'')}" oninput="window._clientSearch=this.value;renderClientsMain()" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;font-family:inherit">
      <button class="btn" onclick="exportClientsCSV()" style="font-size:11px;padding:5px 10px">Export</button>
      <button class="btn" onclick="importClientsCSV()" style="font-size:11px;padding:5px 10px">Import</button>
    </div>
    ${clients.length > 1 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer" onchange="window._clientSort=this.value;renderClientsMain()">
        <option value="name" ${sortBy==='name'?'selected':''}>Sort by name</option>
        <option value="value" ${sortBy==='value'?'selected':''}>Sort by value</option>
        <option value="orders" ${sortBy==='orders'?'selected':''}>Sort by orders</option>
      </select>
      <span style="font-size:11px;color:var(--muted);margin-left:auto">Total order value: <strong style="color:var(--text)">${fmt(totalClientValue)}</strong></span>
    </div>` : ''}
    ${filtered.length ? filtered.map(clientCard).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:var(--radius)">${search ? 'No clients match your search.' : 'No clients yet. Add one using the form on the left.'}</div>`}
  </div>`;
}

function _highlightProject(id) {
  setTimeout(() => {
    const el = document.getElementById('project-card-'+id);
    if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.outline='2px solid var(--accent)'; setTimeout(()=>el.style.outline='',2000); }
  }, 100);
}

// ── Render Projects Tab ──
function renderProjectsMain() {
  const el = document.getElementById('projects-main');
  if (!el) return;
  const cur = window.currency;

  const statusBadge = s => {
    if (s === 'complete') return '<span class="badge badge-green">Complete</span>';
    if (s === 'on-hold') return '<span class="badge badge-gray">On Hold</span>';
    return '<span class="badge badge-blue">Active</span>';
  };

  const projectCard = p => {
    const client = p.client_id ? clients.find(c => c.id === p.client_id) : null;
    const pQuotes = quotes.filter(q => q.project_id === p.id || (!q.project_id && quoteProject(q) === p.name));
    const pOrders = orders.filter(o => o.project_id === p.id || (!o.project_id && orderProject(o) === p.name));
    const totalValue = pOrders.reduce((s,o) => s + o.value, 0);
    const quoteValue = pQuotes.reduce((s,q) => s + quoteTotal(q), 0);
    const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
    const created = p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';

    const statusBadge = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';
    const statusText = p.status==='complete'?'Complete':p.status==='on-hold'?'On Hold':'Active';
    return `<div id="project-card-${p.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:6px;cursor:pointer;transition:box-shadow .15s" onclick="_openProjectPopup(${p.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(p.name)}</div>
        <span class="badge ${statusBadge}" style="font-size:9px;padding:1px 6px">${statusText}</span>
      </div>
      <div style="font-size:10px;color:var(--muted)">
        ${client ? _escHtml(client.name) + ' · ' : ''}${created} · ${pQuotes.length} quote${pQuotes.length!==1?'s':''} (${fmt(quoteValue)}) · ${pOrders.length} order${pOrders.length!==1?'s':''} (${fmt(totalValue)})
      </div>
      ${p.description ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(p.description)}</div>` : ''}
    </div>`;
  };

  const filter = window._projFilter || 'all';
  const search = (window._projSearch || '').toLowerCase();
  const sortBy = window._projSort || 'newest';
  let filtered = [...projects];
  if (filter !== 'all') filtered = filtered.filter(p => p.status === filter);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || (_clientName(p.client_id)||'').toLowerCase().includes(search));
  if (sortBy === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name));
  else if (sortBy === 'client') filtered.sort((a,b) => (_clientName(a.client_id)||'').localeCompare(_clientName(b.client_id)||''));
  else if (sortBy === 'value') filtered.sort((a,b) => {
    const va = orders.filter(o=>o.project_id===a.id||orderProject(o)===a.name).reduce((s,o)=>s+o.value,0);
    const vb = orders.filter(o=>o.project_id===b.id||orderProject(o)===b.name).reduce((s,o)=>s+o.value,0);
    return vb - va;
  });

  const activeCount = projects.filter(p => p.status === 'active').length;
  const holdCount = projects.filter(p => p.status === 'on-hold').length;
  const doneCount = projects.filter(p => p.status === 'complete').length;

  el.innerHTML = `<div style="padding:24px;max-width:900px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-size:18px;font-weight:800;color:var(--text);flex:1">Projects <span style="font-size:13px;font-weight:400;color:var(--muted)">(${projects.length})</span></div>
      <input type="text" placeholder="Search projects..." value="${_escHtml(window._projSearch||'')}" oninput="window._projSearch=this.value;renderProjectsMain()" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;font-family:inherit">
    </div>
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <button class="ofilter-tab ${filter==='all'?'active':''}" onclick="window._projFilter='all';renderProjectsMain()">All (${projects.length})</button>
      <button class="ofilter-tab ${filter==='active'?'active':''}" onclick="window._projFilter='active';renderProjectsMain()">Active (${activeCount})</button>
      <button class="ofilter-tab ${filter==='on-hold'?'active':''}" onclick="window._projFilter='on-hold';renderProjectsMain()">On Hold (${holdCount})</button>
      <button class="ofilter-tab ${filter==='complete'?'active':''}" onclick="window._projFilter='complete';renderProjectsMain()">Complete (${doneCount})</button>
      <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer;margin-left:auto" onchange="window._projSort=this.value;renderProjectsMain()">
        <option value="newest" ${sortBy==='newest'?'selected':''}>Newest first</option>
        <option value="name" ${sortBy==='name'?'selected':''}>Name</option>
        <option value="client" ${sortBy==='client'?'selected':''}>Client</option>
        <option value="value" ${sortBy==='value'?'selected':''}>Value</option>
      </select>
    </div>
    ${filtered.length ? filtered.map(projectCard).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:var(--radius)">${(search || filter !== 'all') ? 'No projects match this filter.' : 'No projects yet. Create one using the form on the left.'}</div>`}
  </div>`;
}

// Default library panels to open
// (Old library init removed)
// Dashboard is the default landing tab
try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e) {}
