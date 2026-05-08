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
// In-memory shadow fields beyond the DB schema: `prodStart` (mirrors
// `production_start_date`), `notes` (mirrors), and a few legacy fields
// retained from pre-Phase-7 days.
/** @type {(import('./database.types').Tables<'orders'> & { prodStart?: string })[]} */
let orders = [];
let orderNextId = 1;

const ORDER_STATUSES = ['quote','confirmed','production','delivery','complete'];
const STATUS_LABELS = { quote:'Quote Sent', confirmed:'Confirmed', production:'In Production', delivery:'Ready for Delivery', complete:'Complete' };
const STATUS_COLORS = { quote:'#94a3b8', confirmed:'#1565c0', production:'var(--accent)', delivery:'var(--accent2)', complete:'var(--success)' };
const STATUS_BADGES = {
  quote: 'badge-gray', confirmed: 'badge-blue',
  production: 'badge-orange', delivery: 'badge-teal', complete: 'badge-green'
};

/** @param {string} id */
const _oInput = id => /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.getElementById(id));
const _oBadge = () => {
  const el = document.getElementById('orders-badge');
  if (el) el.textContent = String(orders.filter(o => o.status !== 'complete').length);
};

// Order creation flow lives in the sidebar editor (createOrderFromEditor).
// The legacy addOrder() that read from o-client / o-project sidebar inputs
// was removed when the sidebar became the editor.

/** @param {number} id */
async function removeOrder(id) {
  if (!_requireAuth()) return;
  await _db('orders').delete().eq('id', id);
  orders = orders.filter(o => o.id !== id);
  _oBadge();
  renderOrdersMain();
}

/** @param {number} id */
async function duplicateOrder(id) {
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('orders', orders.length)) return;
  const o = orders.find(o => o.id === id);
  if (!o) return;
  /** @type {any} */
  const row = {
    user_id: _userId,
    value: o.value,
    status: 'quote',
    due: 'TBD',
    markup: o.markup ?? 0,
    tax: o.tax ?? 0,
    priority: o.priority ?? 0,
    auto_schedule: o.auto_schedule ?? true,
    packaging_hours: o.packaging_hours ?? null,
    contingency_pct: o.contingency_pct ?? null,
  };
  if (o.client_id) row.client_id = o.client_id;
  if (o.project_id) row.project_id = o.project_id;
  const { data, error } = await _dbInsertSafe('orders', row);
  if (error || !data) { _toast('Could not duplicate — ' + (error?.message || JSON.stringify(error)), 'error'); return; }
  if (o.notes) { data.notes = o.notes; _onSet(data.id, o.notes); }
  // Copy order_lines to the duplicate so itemisation survives
  try {
    const { data: oldLines } = await _db('order_lines').select('*').eq('order_id', o.id);
    if (oldLines && oldLines.length) {
      // Cast through any: order_lines Row has id (required); the Insert variant has
      // id?: never, so we must strip it after the spread.
      const newLines = oldLines.map(l => { const nl = /** @type {any} */ ({ ...l, order_id: data.id }); delete nl.id; return nl; });
      await _db('order_lines').insert(newLines);
    }
  } catch(e) { console.warn('[duplicateOrder] copy lines failed:', (/** @type {any} */ (e)).message || e); }
  orders.unshift(data);
  _oBadge();
  _toast('Order duplicated', 'success');
  renderOrdersMain();
  if (typeof renderSchedule === 'function') renderSchedule();
}

/** @param {number} id */
async function advanceOrder(id) {
  if (!_requireAuth()) return;
  const o = orders.find(o => o.id === id);
  if (!o) return;
  const idx = ORDER_STATUSES.indexOf(o.status || '');
  if (idx < ORDER_STATUSES.length - 1) {
    const newStatus = ORDER_STATUSES[idx + 1];
    await _db('orders').update({ status: newStatus }).eq('id', id);
    o.status = newStatus;
  }
  _oBadge();
  renderOrdersMain();
}

const ARROW_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;

function renderOrdersMain() {
  const cur = window.currency;
  const el = document.getElementById('orders-main');
  if (!el) return;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const active = orders.filter(o => o.status !== 'complete');
  const complete = orders.filter(o => o.status === 'complete');
  const totalRevenue = complete.reduce((s,o) => s+(o.value ?? 0), 0);
  const pipeline = active.reduce((s,o) => s+(o.value ?? 0), 0);

  /** @type {string[]} */
  const pipelineSteps = ['quote','confirmed','production','delivery','complete'];
  const stepLabels = ['Quote','Confirmed','Production','Delivery','Done'];

  /** @param {any} o */
  const orderCard = o => {
    const curIdx = pipelineSteps.indexOf(o.status);
    const pipe = pipelineSteps.map((s,i) => {
      const done = i < curIdx;
      const active = i === curIdx;
      const color = active ? (/** @type {Record<string,string>} */ (STATUS_COLORS))[s] : done ? 'var(--success)' : 'var(--border)';
      return `<div class="pipe-step ${active?'pipe-active':''}${done?' pipe-done':''}" onclick="setOrderStatus(${o.id},'${s}')" style="cursor:pointer" title="Set to ${stepLabels[i]}">
        <div class="pipe-dot" style="background:${color};border-color:${color}"></div>
        <div class="pipe-label">${stepLabels[i]}</div>
      </div>${i < pipelineSteps.length-1 ? `<div class="pipe-line ${done?'pipe-line-done':''}"></div>` : ''}`;
    }).join('');

    // Overdue detection — parse due date and compare to today
    let isOverdue = false;
    if (o.status !== 'complete' && o.due && o.due !== 'TBD') {
      const parsed = new Date(o.due);
      if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
    }

    const relDate = _relativeDate(o.due);
    return `
    <div class="order-card${isOverdue ? ' order-overdue' : ''}" style="cursor:pointer" onclick="loadOrderIntoSidebar(${o.id})">
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
        <span class="badge ${(/** @type {Record<string,string>} */(STATUS_BADGES))[o.status]||'badge-gray'}" style="font-size:10px">${(/** @type {Record<string,string>} */(STATUS_LABELS))[o.status]||o.status}</span>
        ${o.status !== 'complete' ? `<button class="btn btn-success" onclick="advanceOrder(${o.id})" style="font-size:11px;padding:5px 10px;display:inline-flex;align-items:center;gap:4px">Next Stage ${ARROW_SVG}</button>` : '<span class="badge badge-green" style="align-self:center">Complete</span>'}
        <span style="flex:1"></span>
        <button class="btn btn-outline" onclick="duplicateOrder(${o.id})" style="font-size:11px;padding:5px 10px;width:auto">Duplicate</button>
        <button class="btn btn-outline" style="color:var(--danger);font-size:11px;padding:5px 10px;width:auto" onclick="_confirm('Delete order for <strong>${_escHtml(orderClient(o))}</strong>?',()=>removeOrder(${o.id}))">Delete</button>
        <button class="btn btn-outline" onclick="printOrderDoc(${o.id},'work_order')" style="font-size:11px;padding:5px 8px;width:auto">Work Order</button>
        <button class="btn btn-outline" onclick="printOrderDoc(${o.id},'order_confirmation')" style="font-size:11px;padding:5px 8px;width:auto">Confirmation</button>
        <button class="btn btn-outline" onclick="printOrderDoc(${o.id},'proforma')" style="font-size:11px;padding:5px 8px;width:auto">Pro-forma</button>
        <button class="btn btn-outline" onclick="printOrderDoc(${o.id},'invoice')" style="font-size:11px;padding:5px 8px;width:auto">Invoice</button>
      </div>
    </div>`;
  };

  const filterVal = window._orderFilter || 'active';
  const filterSearch = (window._orderSearch || '').toLowerCase().trim();
  const sortBy = window._orderSort || 'newest';
  let pool = filterVal === 'all' ? orders : filterVal === 'active' ? active : complete;
  let filtered = filterSearch ? pool.filter(o => (orderClient(o)+' '+orderProject(o)).toLowerCase().includes(filterSearch)) : [...pool];
  // Sort
  if (sortBy === 'due') filtered.sort((a,b) => { const da=_orderDateToISO(a.due||'')||'9999', db=_orderDateToISO(b.due||'')||'9999'; return da.localeCompare(db); });
  else if (sortBy === 'value') filtered.sort((a,b) => (b.value ?? 0) - (a.value ?? 0));
  else if (sortBy === 'client') filtered.sort((a,b) => (orderClient(a)||'').localeCompare(orderClient(b)||''));

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
/** @param {string} f */
function setOrderFilter(f) { window._orderFilter = f; renderOrdersMain(); }
/** @param {number} id @param {string} status */
async function setOrderStatus(id, status) {
  if (!_requireAuth()) return;
  const o = orders.find(o => o.id === id);
  if (!o) return;
  await _db('orders').update({ status }).eq('id', id);
  o.status = status;
  _oBadge();
  renderOrdersMain();
}

// ── CSV import / export ──
function exportOrdersCSV() {
  if (!orders.length) { _toast('No orders to export', 'error'); return; }
  /** @type {any[][]} */
  const rows = [['Client','Project','Value','Status','Due','Notes']];
  orders.forEach(o => rows.push([orderClient(o),orderProject(o),o.value,o.status,o.due||'TBD',o.notes||'']));
  const csv = rows.map(r => r.map(/** @param {any} v */ v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `orders-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Orders exported', 'success');
}
function importOrdersCSV() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const target = /** @type {HTMLInputElement} */ (e.target);
    const file = target.files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('No data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 2 || !r[0]) continue;
      const client_id = r[0] ? await resolveClient(r[0]) : null;
      const project_id = r[1] ? await resolveProject(r[1], client_id) : null;
      /** @type {any} */
      const row = { user_id: _userId, value: parseFloat(r[2])||0, status: r[3]||'quote', due: r[4]||'TBD' };
      if (client_id) row.client_id = client_id;
      if (project_id) row.project_id = project_id;
      if (_userId) { const{data}=await _db('orders').insert(row).select().single(); if(data){data.notes=r[5]||'';_onSet(data.id,data.notes);orders.unshift(data);imported++;} }
    }
    _toast(imported+' orders imported','success'); renderOrdersMain();
    _oBadge();
  };
  input.click();
}

// ══════════════════════════════════════════
// ORDER SIDEBAR EDITOR
// (replaces the former popup — sidebar IS the editor now)
// ══════════════════════════════════════════

const _O_ICON_CABINET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="12"/></svg>';
const _O_ICON_ITEM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
const _O_ICON_LABOUR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

/** Top-level render for the Order sidebar editor.
 *  Reads _opState; renders empty (project picker) or active-edit. */
function renderOrderEditor() {
  const host = document.getElementById('order-editor-host');
  if (!host) return;

  const o = _opState.orderId ? orders.find(ox => ox.id === _opState.orderId) : null;
  const projectId = _opState.projectId || (o ? o.project_id : null);
  const project = projectId ? projects.find(p => p.id === projectId) : null;
  const projectName = o ? orderProject(o) : (project ? project.name : '');
  const clientName = o ? orderClient(o) : (project && project.client_id ? (clients.find(c => c.id === project.client_id) || {}).name || '' : '');

  // ── Empty state ──
  if (!o && !project) {
    host.innerHTML = `
      <div class="form-section">
        <div class="form-section-title">New Order</div>
        <div class="form-group" style="position:relative;margin-bottom:8px">
          <label>Project</label>
          <div class="smart-input-wrap">
            <input type="text" id="oe-project-picker" placeholder="Search or add project..." autocomplete="off"
              oninput="_smartOProjectSuggest(this,'oe-project-suggest')"
              onfocus="_smartOProjectSuggest(this,'oe-project-suggest')"
              onblur="setTimeout(()=>{const b=document.getElementById('oe-project-suggest'); if(b)b.style.display='none'},150)">
            <div class="smart-input-add" onclick="_openNewProjectPopup('oe-project-picker')" title="New project">+</div>
          </div>
          <div id="oe-project-suggest" class="client-suggest-list" style="display:none"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;line-height:1.5">
          Pick or create a project to start a new order. The client is set on the project.
        </div>
      </div>`;
    return;
  }

  // ── Active editor ──
  const status = o ? (o.status || 'quote') : 'quote';
  const statusBadgeCls = (/** @type {Record<string,string>} */ (STATUS_BADGES))[status] || 'badge-gray';
  const statusLabel = (/** @type {Record<string,string>} */ (STATUS_LABELS))[status] || status;
  const isExisting = !!o;
  const dirtyPill = _opState.dirty ? '<span class="cl-unsaved-pill">unsaved</span>' : '';

  // Pipeline visualization
  const curIdx = ORDER_STATUSES.indexOf(status);
  const stepLabels = ['Quote','Confirmed','Production','Delivery','Done'];
  const pipe = ORDER_STATUSES.map((s, i) => {
    const done = i < curIdx;
    const active = i === curIdx;
    return `<div class="pp-step" onclick="_oSetPopupStatus('${s}')">
      <div class="pp-dot ${active?'active':done?'done':''}"></div>
      <div class="pp-label ${active?'active':done?'done':''}">${stepLabels[i]}</div>
    </div>${i < ORDER_STATUSES.length-1 ? `<div class="pp-line ${done?'done':''}"></div>` : ''}`;
  }).join('');

  // Optional from-quote chip
  const qRef = o ? _oqGet(o.id) : null;
  const fromQuote = qRef ? quotes.find(q => q.id === qRef) : null;
  const quoteChip = fromQuote ? `<div class="pf" style="margin:8px 0"><label class="pf-label">From Quote</label><div class="pf-chips"><span class="pf-chip" style="border-color:rgba(37,99,235,0.3);color:#6b9bf4" onclick="switchSection('quote');window._quoteSearch='${_escHtml(quoteProject(fromQuote)).replace(/'/g,"\\'")}';renderQuoteMain()">Q-${String(fromQuote.id).padStart(4,'0')} · ${_escHtml(quoteProject(fromQuote))}</span></div></div>` : '';

  // Overdue badge
  let isOverdue = false;
  if (o && o.status !== 'complete' && o.due && o.due !== 'TBD') {
    const parsed = new Date(o.due);
    if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
  }

  // Cabinet/item/labour counts
  let cabCount=0, itemCount=0, labCount=0;
  for (const r of _opState.lines) {
    const k = r.line_kind || 'cabinet';
    if (k === 'cabinet') cabCount++;
    else if (k === 'item') itemCount++;
    else if (k === 'labour') labCount++;
  }

  const auto = o ? (o.auto_schedule !== false) : true;

  host.innerHTML = `<div class="form-section editor-shell">
    <div class="editor-header">
      <span class="editor-title">${isExisting ? 'Edit Order' : 'New Order'}</span>
      ${isExisting ? `<span class="badge ${statusBadgeCls}" style="font-size:10px">${statusLabel}</span>` : ''}
      ${isOverdue ? '<span class="badge badge-red" style="font-size:9px">Overdue</span>' : ''}
      <span style="flex:1"></span>
      <button class="btn-link" onclick="_oChangeProject()" title="Pick a different project">change</button>
    </div>

    <div class="cl-current-project editor-project-chip">
      <span class="cl-cp-label">Editing:</span>
      <span class="cl-cp-name">${_escHtml(projectName || 'Untitled project')}</span>
      <span id="oe-dirty-pill">${dirtyPill}</span>
    </div>
    <div class="editor-client-line">${clientName ? 'Client: ' + _escHtml(clientName) : '<span style="color:var(--muted);font-style:italic">No client on this project</span>'}</div>

    <div class="editor-section">
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Status</label>
          <select class="pf-select" id="po-status" oninput="_oMarkDirty()">
            ${ORDER_STATUSES.map(/** @param {string} s */ s => `<option value="${s}" ${status===s?'selected':''}>${(/** @type {Record<string,string>} */ (STATUS_LABELS))[s]}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="pf" style="margin-top:6px"><label class="pf-label">Pipeline</label><div class="pp-pipeline">${pipe}</div></div>
    </div>

    ${quoteChip}

    <div class="editor-section">
      <div class="editor-section-title">Line Items</div>
      <div class="editor-add-tiles">
        <div class="editor-add-tile" onclick="_oAddLine('cabinet')" title="Add cabinet">
          <span class="tile-icon">${_O_ICON_CABINET}</span>
          <span class="tile-label">Cabinets</span>
          <span class="tile-count">${cabCount}</span>
          <span class="tile-add">+</span>
        </div>
        <div class="editor-add-tile" onclick="_oAddLine('item')" title="Add item">
          <span class="tile-icon">${_O_ICON_ITEM}</span>
          <span class="tile-label">Items</span>
          <span class="tile-count">${itemCount}</span>
          <span class="tile-add">+</span>
        </div>
        <div class="editor-add-tile" onclick="_oAddLine('labour')" title="Add labour">
          <span class="tile-icon">${_O_ICON_LABOUR}</span>
          <span class="tile-label">Labour</span>
          <span class="tile-count">${labCount}</span>
          <span class="tile-add">+</span>
        </div>
      </div>
      <div id="po-lines" class="li-list"></div>
    </div>

    <div class="editor-section">
      <div class="editor-section-title">Pricing</div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Markup %</label><input class="pf-input" type="number" id="po-markup" value="${(o && o.markup) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()"></div>
        <div class="pf"><label class="pf-label">Tax %</label><input class="pf-input" type="number" id="po-tax" value="${(o && o.tax) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()"></div>
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section-title">Schedule</div>
      <div class="pf-row">
        <div class="pf" style="flex:1.5">
          <label class="pf-label" style="display:flex;align-items:center;gap:6px">
            <input type="checkbox" id="po-auto-schedule" ${auto ? 'checked' : ''} oninput="_orderAutoScheduleToggle(this.checked);_oMarkDirty()" style="width:14px;height:14px;margin:0">
            Auto schedule
          </label>
        </div>
        <div class="pf">
          <label class="pf-label">Priority</label>
          <input class="pf-input" type="number" id="po-priority" value="${(o && o.priority) ?? 0}" step="1" oninput="_oMarkDirty()" title="Higher = scheduled first">
        </div>
      </div>
      <div class="pf-row" id="po-manual-dates" style="${auto ? 'display:none' : ''}">
        <div class="pf">
          <label class="pf-label">Manual start</label>
          <input class="pf-input" type="date" id="po-manual-start" value="${(o && o.manual_start_date) || ''}" oninput="_oMarkDirty()">
        </div>
        <div class="pf">
          <label class="pf-label">Manual end</label>
          <input class="pf-input" type="date" id="po-manual-end" value="${(o && o.manual_end_date) || ''}" oninput="_oMarkDirty()">
        </div>
      </div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Packaging (h)</label>
          <input class="pf-input" type="number" min="0" step="0.5" id="po-packaging" value="${(o && o.packaging_hours) ?? ''}" placeholder="default ${(typeof cbSettings!=='undefined' && cbSettings.packagingHours) ?? 0}" oninput="_renderOrderHoursBreakdown();_oMarkDirty()">
        </div>
        <div class="pf">
          <label class="pf-label">Run-over (h)</label>
          <input class="pf-input" type="number" min="0" step="0.5" id="po-run-over" value="${(o && o.run_over_hours) ?? 0}" oninput="_renderOrderHoursBreakdown();_oMarkDirty()">
        </div>
      </div>
      <div style="font-size:10px;color:var(--muted);margin:-4px 0 8px 2px">Contingency is set in Cabinet Builder → My Rates as a % of cabinet labour time.</div>
      <div class="pf-hours-readout" id="po-hours-breakdown" style="margin-bottom:10px"></div>
      <div class="pf-row">
        <div class="pf">
          <label class="pf-label">Production Start ${auto ? '<span style="color:var(--muted);font-size:10px">(auto)</span>' : ''}</label>
          <input class="pf-input" type="date" id="po-start" value="${o ? _orderDateToISO(o.prodStart||'') : ''}" ${auto ? 'disabled title="Auto-scheduled — toggle off to set manually"' : ''} oninput="_oMarkDirty()">
        </div>
        <div class="pf">
          <label class="pf-label">Due Date</label>
          <input class="pf-input" type="date" id="po-due" value="${o ? _orderDateToISO(o.due||'') : ''}" oninput="_oMarkDirty()">
        </div>
      </div>
    </div>

    <div class="editor-section">
      <div class="editor-section-title">Notes</div>
      <textarea class="pf-textarea" id="po-notes" rows="3" placeholder="Production notes..." oninput="_oMarkDirty()">${_escHtml((o && o.notes)||'')}</textarea>
    </div>

    <div class="pf-totals" id="po-totals" style="margin-top:10px"></div>

    <div class="editor-footer">
      ${isExisting ? `<button class="btn btn-outline" style="color:var(--danger)" onclick="_confirm('Delete order?',()=>{removeOrder(${o.id});_oClearEditor()})">Delete</button>` : ''}
      <span style="flex:1"></span>
      ${isExisting ? `<button class="btn btn-outline" onclick="printOrderDoc(${o.id},'work_order')">Work Order</button>` : ''}
      ${isExisting ? `<button class="btn btn-outline" onclick="printOrderDoc(${o.id},'invoice')">Invoice</button>` : ''}
      <button class="btn btn-primary" onclick="${isExisting ? 'saveOrderEditor()' : 'createOrderFromEditor()'}">${isExisting ? 'Save' : '+ Create Order'}</button>
    </div>
  </div>`;

  if (o || _opState.lines.length > 0) {
    if (typeof _renderOrderLines === 'function') _renderOrderLines();
    if (typeof _renderOrderLineTotals === 'function') _renderOrderLineTotals();
    if (typeof _renderOrderHoursBreakdown === 'function') _renderOrderHoursBreakdown();
  }
}

/** Helper used by pipeline-step click in the editor. Sets the visible status select to s and marks dirty.
 *  @param {string} s */
function _oSetPopupStatus(s) {
  const sel = document.getElementById('po-status');
  if (sel) {
    /** @type {HTMLSelectElement} */ (sel).value = s;
    _oMarkDirty();
    // Re-render to update pipeline dots
    renderOrderEditor();
  }
}

function _oMarkDirty() {
  if (_opState.dirty) return;
  _opState.dirty = true;
  const pill = document.getElementById('oe-dirty-pill');
  if (pill) pill.innerHTML = '<span class="cl-unsaved-pill">unsaved</span>';
}

function _oClearEditor() {
  _opState = { orderId: null, lines: [], dirty: false, projectId: null };
  renderOrderEditor();
}

function _oChangeProject() {
  if (_opState.dirty) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  _oClearEditor();
}

/** @param {number} id */
async function loadOrderIntoSidebar(id) {
  const o = orders.find(ox => ox.id === id);
  if (!o) return;
  if (_opState.dirty && _opState.orderId !== id) {
    if (!confirm('Discard unsaved changes?')) return;
  }
  _opState = {
    orderId: id,
    lines: Array.isArray(/** @type {any} */ (o)._lines) ? /** @type {any} */ (o)._lines.map(/** @param {any} r */ r => ({ ...r })) : [],
    dirty: false,
    projectId: o.project_id || null,
  };
  renderOrderEditor();
  if (!Array.isArray(/** @type {any} */ (o)._lines)) {
    const { data } = await _db('order_lines').select('*').eq('order_id', id).order('position');
    if (_opState.orderId !== id) return;
    if (data) {
      /** @type {any} */ (o)._lines = data.map(/** @param {any} r */ r => ({ ...r }));
      _opState.lines = data.map(/** @param {any} r */ r => ({ ...r }));
      renderOrderEditor();
    }
  }
}

/** @param {HTMLInputElement} input @param {string} boxId */
function _smartOProjectSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  if (typeof _posSuggest === 'function') _posSuggest(input, box);
  const matches = projects
    .filter(p => !val || p.name.toLowerCase().includes(val))
    .slice(0, 8);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  for (const p of matches) {
    const cName = p.client_id ? (clients.find(c => c.id === p.client_id) || {}).name || '' : '';
    html += `<div class="client-suggest-item" onmousedown="_oPickProject(${p.id})">
      <span class="csi-icon">${_O_ICON_CABINET}</span>
      <span class="csi-name">${esc(p.name)}</span>
      ${cName ? `<span class="csi-meta">${esc(cName)}</span>` : ''}
    </div>`;
  }
  if (val && !matches.some(p => p.name.toLowerCase() === val)) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_openNewProjectPopup('oe-project-picker')">
      <span class="csi-icon">+</span>
      <span class="csi-name">Create project "${esc(input.value.trim())}"</span>
    </div>`;
  }
  if (!html) html = '<div class="client-suggest-empty">No projects yet — click + to create one.</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}

/** @param {number} projectId */
function _oPickProject(projectId) {
  const p = projects.find(pp => pp.id === projectId);
  if (!p) return;
  _opState = { orderId: null, lines: [], dirty: false, projectId: p.id };
  renderOrderEditor();
}

/** @param {'cabinet'|'item'|'labour'} kind */
async function _oAddLine(kind) {
  if (!_opState.orderId) {
    if (!_opState.projectId) { _toast('Pick or create a project first.', 'error'); return; }
    const ok = await createOrderFromEditor(/* silent */ true);
    if (!ok) return;
  }
  if (kind === 'cabinet') {
    if (typeof _orderLineEditCabinet === 'function') {
      _orderLineEditCabinet(/** @type {number} */ (_opState.orderId));
    } else {
      _toast('Cabinet editor unavailable.', 'error');
    }
    return;
  }
  if (typeof _orderLineAdd === 'function') _orderLineAdd(kind);
  renderOrderEditor();
}

/** @param {boolean} [silent] */
async function createOrderFromEditor(silent) {
  if (!_userId) { _toast('Sign in first.', 'error'); return false; }
  if (!_opState.projectId) { _toast('Pick a project first.', 'error'); return false; }
  if (!_enforceFreeLimit('orders', orders.length)) return false;
  const project = projects.find(p => p.id === _opState.projectId);
  if (!project) { _toast('Project not found.', 'error'); return false; }
  /** @type {any} */
  const row = {
    user_id: _userId,
    project_id: project.id,
    value: 0,
    status: _popupVal('po-status') || 'quote',
    markup: parseFloat(_popupVal('po-markup')) || 0,
    tax: parseFloat(_popupVal('po-tax')) || 0,
    due: 'TBD',
  };
  if (project.client_id) row.client_id = project.client_id;
  const { data, error } = await _dbInsertSafe('orders', row);
  if (error || !data) { _toast('Could not create order — ' + ((error && error.message) || ''), 'error'); return false; }
  // Save notes locally
  const notesVal = _popupVal('po-notes') || '';
  if (notesVal) { /** @type {any} */ (data).notes = notesVal; _onSet(data.id, notesVal); }
  orders.unshift(data);
  _opState.orderId = data.id;
  _opState.dirty = false;
  _oBadge();
  renderOrdersMain();
  renderOrderEditor();
  if (!silent) _toast('Order created', 'success');
  return true;
}

async function saveOrderEditor() {
  if (!_opState.orderId) return createOrderFromEditor();
  const id = /** @type {number} */ (_opState.orderId);
  const o = orders.find(ox => ox.id === id);
  if (!o) return;
  const status = _popupVal('po-status');
  const markup = parseFloat(_popupVal('po-markup')) || 0;
  const tax = parseFloat(_popupVal('po-tax')) || 0;
  const priority = parseFloat(_popupVal('po-priority')) || 0;
  const autoEl = /** @type {HTMLInputElement|null} */ (document.getElementById('po-auto-schedule'));
  const auto_schedule = autoEl ? autoEl.checked : true;
  const manual_start = _popupVal('po-manual-start') || null;
  const manual_end = _popupVal('po-manual-end') || null;
  const packagingRaw = _popupVal('po-packaging');
  const packaging_hours = packagingRaw === '' ? null : (parseFloat(packagingRaw) || 0);
  const run_over_hours = parseFloat(_popupVal('po-run-over')) || 0;
  const startISO = _popupVal('po-start');
  const dueISO = _popupVal('po-due');
  /** @type {any} */
  const update = { status, markup, tax, priority, auto_schedule, manual_start_date: manual_start, manual_end_date: manual_end, packaging_hours, run_over_hours, updated_at: new Date().toISOString() };
  if (dueISO) update.due = new Date(dueISO + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  if (startISO) update.production_start_date = startISO;
  Object.assign(o, update);
  // Persist localStorage shadow fields
  const notesVal = _popupVal('po-notes') || '';
  /** @type {any} */ (o).notes = notesVal;
  _onSet(id, notesVal);
  if (startISO) {
    /** @type {any} */ (o).prodStart = startISO;
    const ps = JSON.parse(localStorage.getItem('pc_order_prodstarts') || '{}');
    ps[String(id)] = startISO;
    localStorage.setItem('pc_order_prodstarts', JSON.stringify(ps));
  }
  // Flush pending line edits
  if (typeof _orderLineUpsertTimers !== 'undefined') {
    for (const t of _orderLineUpsertTimers.values()) clearTimeout(t);
    _orderLineUpsertTimers.clear();
  }
  /** @type {Promise<any>[]} */
  const writes = [/** @type {any} */ (_db('orders').update(update).eq('id', id))];
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
    writes.push(/** @type {any} */ (_db('order_lines').update(u).eq('id', row.id)));
  }
  await Promise.all(writes);
  // Refresh totals if helper exists
  if (typeof orderTotalsFromLines === 'function') {
    const t = await orderTotalsFromLines(id);
    if (t) /** @type {any} */ (o).value = Math.round((t.materials + t.labour) * (1 + (markup||0)/100) * (1 + (tax||0)/100));
  }
  _opState.dirty = false;
  _oBadge();
  renderOrdersMain();
  renderOrderEditor();
  if (typeof renderSchedule === 'function') renderSchedule();
  _toast('Order saved', 'success');
}
