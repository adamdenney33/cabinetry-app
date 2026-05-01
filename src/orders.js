// @ts-nocheck
// ProCabinet — Orders state + view (carved out of src/app.js in phase E carve 3)
//
// Loaded as a classic <script defer> BEFORE src/app.js (state declarations
// here — `orders`, `orderNextId`, `ORDER_STATUSES`, `STATUS_LABELS`,
// `STATUS_COLORS`, `STATUS_BADGES` — are referenced from app.js at load
// time inside function bodies, but the bindings need to exist when those
// functions are eventually called).
//
// Cross-file dependencies referenced from this file's functions: _escHtml,
// _openOrderPopup, advanceOrder, switchSection, orderClient, orderProject,
// quoteTotal, fmt, currency, _toast — all globals defined in app.js.

// ══════════════════════════════════════════
// ORDERS
// ══════════════════════════════════════════
let orders = [];
let orderNextId = 1;

const ORDER_STATUSES = ['quote','confirmed','production','delivery','complete'];
const STATUS_LABELS = { quote:'Quote Sent', confirmed:'Confirmed', production:'In Production', delivery:'Ready for Delivery', complete:'Complete' };
const STATUS_COLORS = { quote:'#94a3b8', confirmed:'#1565c0', production:'var(--accent)', delivery:'var(--accent2)', complete:'var(--success)' };
const STATUS_BADGES = {
  quote: 'badge-gray', confirmed: 'badge-blue',
  production: 'badge-orange', delivery: 'badge-teal', complete: 'badge-green'
};

async function addOrder() {
  const client = document.getElementById('o-client').value.trim();
  const project = document.getElementById('o-project').value.trim();
  if (!client || !project) { _toast('Enter client name and project.', 'error'); return; }
  if (!_requireAuth()) return;
  const dueRaw = document.getElementById('o-due').value;
  const due = dueRaw ? new Date(dueRaw + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : 'TBD';
  const clientId = await resolveClient(client);
  const projectId = await resolveProject(project, clientId);
  const row = {
    user_id: _userId, client, project,
    value: parseFloat(document.getElementById('o-value').value) || 0,
    status: document.getElementById('o-status').value,
    due,
  };
  if (clientId) row.client_id = clientId;
  if (projectId) row.project_id = projectId;
  let { data, error } = await _dbInsertSafe('orders', row);
  if (error) { _toast('Could not save order — ' + (error.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  // Save notes and prodStart to localStorage
  const notesVal = document.getElementById('o-notes').value.trim();
  const startRaw = document.getElementById('o-start').value;
  const prodStart = startRaw || '';
  if (data) {
    data.notes = notesVal; _onSet(data.id, notesVal);
    if (prodStart) { data.prodStart = prodStart; const ps = JSON.parse(localStorage.getItem('pc_order_prodstarts')||'{}'); ps[String(data.id)] = prodStart; localStorage.setItem('pc_order_prodstarts', JSON.stringify(ps)); }
  }
  orders.unshift(data);
  _toast('Order created', 'success');
  document.getElementById('o-client').value = '';
  document.getElementById('o-project').value = '';
  document.getElementById('o-value').value = '';
  document.getElementById('o-start').value = '';
  document.getElementById('o-due').value = '';
  document.getElementById('o-notes').value = '';
  document.getElementById('o-status').value = 'quote';
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  renderOrdersMain();
}

async function removeOrder(id) {
  if (!_requireAuth()) return;
  await _db('orders').delete().eq('id', id);
  orders = orders.filter(o => o.id !== id);
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  renderOrdersMain();
}

async function duplicateOrder(id) {
  if (!_requireAuth()) return;
  const o = orders.find(o => o.id === id);
  if (!o) return;
  const row = { user_id: _userId, value: o.value, status: 'quote', due: 'TBD' };
  if (o.client_id) row.client_id = o.client_id;
  if (o.project_id) row.project_id = o.project_id;
  const { data, error } = await _dbInsertSafe('orders', row);
  if (error) { _toast('Could not duplicate — ' + (error.message || JSON.stringify(error)), 'error'); return; }
  if (o.notes) { data.notes = o.notes; _onSet(data.id, o.notes); }
  // Copy order_lines to the duplicate so itemisation survives
  try {
    const { data: oldLines } = await _db('order_lines').select('*').eq('order_id', o.id);
    if (oldLines && oldLines.length) {
      const newLines = oldLines.map(l => { const nl = { ...l, order_id: data.id }; delete nl.id; return nl; });
      await _db('order_lines').insert(newLines);
    }
  } catch(e) { console.warn('[duplicateOrder] copy lines failed:', e.message || e); }
  orders.unshift(data);
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  _toast('Order duplicated', 'success');
  renderOrdersMain();
}

async function advanceOrder(id) {
  if (!_requireAuth()) return;
  const o = orders.find(o => o.id === id);
  if (!o) return;
  const idx = ORDER_STATUSES.indexOf(o.status);
  if (idx < ORDER_STATUSES.length - 1) {
    const newStatus = ORDER_STATUSES[idx + 1];
    await _db('orders').update({ status: newStatus }).eq('id', id);
    o.status = newStatus;
  }
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  renderOrdersMain();
}

const ARROW_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

function renderOrdersMain() {
  const cur = window.currency;
  const el = document.getElementById('orders-main');
  if (!el) return;
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const active = orders.filter(o => o.status !== 'complete');
  const complete = orders.filter(o => o.status === 'complete');
  const totalRevenue = complete.reduce((s,o) => s+o.value, 0);
  const pipeline = active.reduce((s,o) => s+o.value, 0);

  const pipelineSteps = ['quote','confirmed','production','delivery','complete'];
  const stepLabels = ['Quote','Confirmed','Production','Delivery','Done'];

  const orderCard = o => {
    const curIdx = pipelineSteps.indexOf(o.status);
    const pipe = pipelineSteps.map((s,i) => {
      const done = i < curIdx;
      const active = i === curIdx;
      const color = active ? STATUS_COLORS[s] : done ? 'var(--success)' : 'var(--border)';
      return `<div class="pipe-step ${active?'pipe-active':''}${done?' pipe-done':''}" onclick="setOrderStatus(${o.id},'${s}')" style="cursor:pointer" title="Set to ${stepLabels[i]}">
        <div class="pipe-dot" style="background:${color};border-color:${color}"></div>
        <div class="pipe-label">${stepLabels[i]}</div>
      </div>${i < pipelineSteps.length-1 ? `<div class="pipe-line ${done?'pipe-line-done':''}"></div>` : ''}`;
    }).join('');

    // Overdue detection — parse due date and compare to today
    let isOverdue = false;
    if (o.status !== 'complete' && o.due && o.due !== 'TBD') {
      const parsed = new Date(o.due);
      if (!isNaN(parsed) && parsed < new Date()) isOverdue = true;
    }

    const relDate = _relativeDate(o.due);
    return `
    <div class="order-card${isOverdue ? ' order-overdue' : ''}" style="cursor:pointer" onclick="_openOrderPopup(${o.id})">
      <div class="oc-header">
        <div class="oc-info">
          <div class="oc-title">${orderProject(o)}</div>
          <div class="oc-meta">${orderClient(o)}</div>
          <div style="display:flex;gap:6px;align-items:center;margin-top:3px;font-size:11px;color:var(--muted)">
            <span>Due: ${o.due || 'TBD'}</span>
            ${relDate ? `<span style="font-size:9px;font-weight:700;color:${relDate.color}">${relDate.label}</span>` : ''}
            ${isOverdue ? '<span class="badge badge-red" style="font-size:8px;padding:1px 5px">Overdue</span>' : ''}
          </div>
          ${o.notes ? `<div class="oc-notes" style="cursor:default">${o.notes}</div>` : ''}
        </div>
        <div class="oc-right">
          <div class="oc-value" style="cursor:default;border-bottom:none">${fmt(o.value)}</div>
        </div>
      </div>
      <div class="oc-pipeline">${pipe}</div>
      <div class="oc-footer" onclick="event.stopPropagation()">
        <span class="badge ${STATUS_BADGES[o.status]||'badge-gray'}" style="font-size:10px">${STATUS_LABELS[o.status]||o.status}</span>
        ${o.status !== 'complete' ? `<button class="btn btn-success" onclick="advanceOrder(${o.id})" style="font-size:11px;padding:5px 10px;display:inline-flex;align-items:center;gap:4px">Next Stage ${ARROW_SVG}</button>` : '<span class="badge badge-green" style="align-self:center">Complete</span>'}
        <span style="flex:1"></span>
        <button class="btn btn-outline" onclick="duplicateOrder(${o.id})" style="font-size:11px;padding:5px 10px;width:auto">Copy</button>
        <button class="btn btn-outline" onclick="printWorkOrder(${o.id},'print')" style="font-size:11px;padding:5px 10px;width:auto">Work Order</button>
        <button class="btn btn-outline" onclick="printWorkOrder(${o.id},'pdf')" style="font-size:11px;padding:5px 10px;width:auto">PDF</button>
      </div>
    </div>`;
  };

  const filterVal = window._orderFilter || 'active';
  const filterSearch = (window._orderSearch || '').toLowerCase().trim();
  const sortBy = window._orderSort || 'newest';
  let pool = filterVal === 'all' ? orders : filterVal === 'active' ? active : complete;
  let filtered = filterSearch ? pool.filter(o => (orderClient(o)+' '+orderProject(o)).toLowerCase().includes(filterSearch)) : [...pool];
  // Sort
  if (sortBy === 'due') filtered.sort((a,b) => { const da=_orderDateToISO(a.due)||'9999', db=_orderDateToISO(b.due)||'9999'; return da.localeCompare(db); });
  else if (sortBy === 'value') filtered.sort((a,b) => b.value - a.value);
  else if (sortBy === 'client') filtered.sort((a,b) => (a.client||'').localeCompare(b.client||''));

  const emptyState = `<div class="empty-state">
    <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg></div>
    <h3>No orders yet</h3><p>Add your first order using the form on the left, or convert a quote.</p></div>`;

  const filterTabs = `<div class="order-filter-tabs" style="align-items:center">
    <input class="order-search-input" type="search" placeholder="Search client or project…" value="${window._orderSearch||''}" oninput="window._orderSearch=this.value;renderOrdersMain()">
    <button class="ofilter-tab ${filterVal==='active'?'active':''}" onclick="setOrderFilter('active')">Active (${active.length})</button>
    <button class="ofilter-tab ${filterVal==='all'?'active':''}" onclick="setOrderFilter('all')">All (${orders.length})</button>
    <button class="ofilter-tab ${filterVal==='complete'?'active':''}" onclick="setOrderFilter('complete')">Completed (${complete.length})</button>
    <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer;margin-left:auto" onchange="window._orderSort=this.value;renderOrdersMain()">
      <option value="newest" ${sortBy==='newest'?'selected':''}>Newest first</option>
      <option value="due" ${sortBy==='due'?'selected':''}>Due date</option>
      <option value="value" ${sortBy==='value'?'selected':''}>Value</option>
      <option value="client" ${sortBy==='client'?'selected':''}>Client</option>
    </select>
    <button class="btn btn-outline" onclick="event.stopPropagation();exportOrdersCSV()" style="font-size:10px;padding:4px 8px;width:auto">Export</button>
    <button class="btn btn-outline" onclick="event.stopPropagation();importOrdersCSV()" style="font-size:10px;padding:4px 8px;width:auto">Import</button>
  </div>`;

  el.innerHTML = `<div style="max-width:800px;margin:0 auto">
    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-label">Active Orders</div><div class="stat-value">${active.length}</div><div class="stat-sub">in progress</div></div>
      <div class="stat-card success"><div class="stat-label">Completed</div><div class="stat-value">${complete.length}</div><div class="stat-sub">this period</div></div>
      <div class="stat-card warn"><div class="stat-label">Pipeline</div><div class="stat-value">${fmt(pipeline)}</div><div class="stat-sub">active order value</div></div>
      <div class="stat-card success"><div class="stat-label">Revenue</div><div class="stat-value">${fmt(totalRevenue)}</div><div class="stat-sub">completed orders</div></div>
    </div>
    ${orders.length === 0 ? emptyState : filterTabs + `<div class="orders-list">${filtered.map(orderCard).join('')}</div>`}
  </div>`;
}


// ── Filter & status helpers ──
function setOrderFilter(f) { window._orderFilter = f; renderOrdersMain(); }
async function setOrderStatus(id, status) {
  if (!_requireAuth()) return;
  const o = orders.find(o => o.id === id);
  if (!o) return;
  await _db('orders').update({ status }).eq('id', id);
  o.status = status;
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  renderOrdersMain();
}

// ── CSV import / export ──
function exportOrdersCSV() {
  if (!orders.length) { _toast('No orders to export', 'error'); return; }
  const rows = [['Client','Project','Value','Status','Due','Notes']];
  orders.forEach(o => rows.push([orderClient(o),orderProject(o),o.value,o.status,o.due||'TBD',o.notes||'']));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `orders-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Orders exported', 'success');
}
function importOrdersCSV() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('No data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 2 || !r[0]) continue;
      const client_id = r[0] ? await resolveClient(r[0]) : null;
      const project_id = r[1] ? await resolveProject(r[1], client_id) : null;
      const row = { user_id: _userId, value: parseFloat(r[2])||0, status: r[3]||'quote', due: r[4]||'TBD' };
      if (client_id) row.client_id = client_id;
      if (project_id) row.project_id = project_id;
      if (_userId) { const{data}=await _db('orders').insert(row).select().single(); if(data){data.notes=r[5]||'';_onSet(data.id,data.notes);orders.unshift(data);imported++;} }
    }
    _toast(imported+' orders imported','success'); renderOrdersMain();
    document.getElementById('orders-badge').textContent = orders.filter(o=>o.status!=='complete').length;
  };
  input.click();
}
