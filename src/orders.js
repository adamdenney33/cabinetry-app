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

// Compute the next sequential order number. Scans trailing digits of any
// existing `order_number` and returns the next 4-digit zero-padded value.
// Plain `NNNN` (no prefix). Unlike `_nextQuoteNumber()` we do NOT compare
// against `id` — the backfill migration guarantees every existing order has
// a number, so the `id` fallback would only inject gaps from the row-id
// counter and surprise the user (`0007` → `0022` instead of `0008`).
function _nextOrderNumber() {
  let max = 0;
  for (const o of orders) {
    if (o.order_number) {
      const m = String(o.order_number).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return String(max + 1).padStart(4, '0');
}

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

  /** @param {any} o */
  const orderCard = o => {
    let isOverdue = false;
    if (o.status !== 'complete' && o.due && o.due !== 'TBD') {
      const parsed = new Date(o.due);
      if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
    }
    const relDate = _relativeDate(o.due);
    const titleNum = o.order_number ? `#${o.order_number} · ` : '';
    const titleClient = orderClient(o) ? ' - ' + orderClient(o) : '';
    const statusBadgeCls = (/** @type {Record<string,string>} */(STATUS_BADGES))[o.status]||'badge-gray';
    const statusLabel = (/** @type {Record<string,string>} */(STATUS_LABELS))[o.status]||o.status;
    return `
    <div class="order-card${isOverdue ? ' order-overdue' : ''}" style="cursor:pointer" onclick="loadOrderIntoSidebar(${o.id})">
      <div class="oc-header">
        <div class="oc-info">
          <div class="oc-title-row">
            <div class="oc-title">${titleNum}${orderProject(o)}${titleClient}</div>
            <span class="badge ${statusBadgeCls}" style="font-size:10px">${statusLabel}</span>
          </div>
          <div class="oc-meta">
            <span>Due: ${o.due || 'TBD'}</span>
            ${relDate ? `<span style="font-size:9px;font-weight:700;color:${relDate.color}">${relDate.label}</span>` : ''}
            ${isOverdue ? '<span class="badge badge-red" style="font-size:8px;padding:1px 5px">Overdue</span>' : ''}
          </div>
        </div>
        <div class="oc-right">
          <div class="oc-value">${fmt(o.value)}</div>
          <button class="oc-menu-btn" onclick="event.stopPropagation();_oOpenCardMenu(event,${o.id})" title="Actions" aria-label="Order actions">⋯</button>
        </div>
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
    ${_renderContentHeader({ iconSvg: _CH_ICON_ORDER, title: 'Orders' })}
    ${orders.length === 0 ? emptyState : filterTabs + `<div class="orders-list">${filtered.map(orderCard).join('')}</div>`}
  </div>`;
}


/** Open the order-card actions menu near the clicked `⋯` button. Replaces the
 *  per-card row of action buttons with a compact dropdown.
 *  @param {Event} e @param {number} id */
function _oOpenCardMenu(e, id) {
  // Close any existing menu
  const existing = document.querySelector('.oc-card-menu');
  if (existing) existing.remove();
  const o = orders.find(ox => ox.id === id);
  if (!o) return;
  const btn = /** @type {HTMLElement} */ (e.currentTarget || e.target);
  const r = btn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'oc-card-menu';
  menu.innerHTML = `
    <button onclick="printOrderDoc(${id},'order_confirmation');_oCloseCardMenus()">Confirmation</button>
    <button onclick="printOrderDoc(${id},'proforma');_oCloseCardMenus()">Pro-forma</button>
    <button onclick="printOrderDoc(${id},'invoice');_oCloseCardMenus()">Invoice</button>
    <button onclick="printOrderDoc(${id},'work_order');_oCloseCardMenus()">Work Order</button>
    <hr>
    <button onclick="duplicateOrder(${id});_oCloseCardMenus()">Duplicate</button>
    <button class="danger" onclick="_confirm('Delete order?',()=>{removeOrder(${id});_oCloseCardMenus()})">Delete</button>
  `;
  document.body.appendChild(menu);
  // Position below the button, right-aligned.
  const mw = 200;
  menu.style.top = (r.bottom + 4) + 'px';
  menu.style.left = Math.max(8, r.right - mw) + 'px';
  // Dismiss on outside click.
  setTimeout(() => {
    const closeOnClick = (/** @type {MouseEvent} */ ev) => {
      if (!menu.contains(/** @type {Node} */ (ev.target))) {
        _oCloseCardMenus();
        document.removeEventListener('mousedown', closeOnClick);
      }
    };
    document.addEventListener('mousedown', closeOnClick);
  }, 0);
}

function _oCloseCardMenus() {
  document.querySelectorAll('.oc-card-menu').forEach(m => m.remove());
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
  const rows = [['Order #','Client','Project','Value','Status','Due','Notes']];
  orders.forEach(o => rows.push([o.order_number||'',orderClient(o),orderProject(o),o.value,o.status,o.due||'TBD',o.notes||'']));
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

// Cabinets/Items/Labour icons mirror the top nav-tab SVGs:
// Cabinet ← Cabinet nav-tab, Item ← Stock nav-tab (3D box), Labour ← Schedule nav-tab (calendar).
const _O_ICON_CABINET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';
const _O_ICON_ITEM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
const _O_ICON_LABOUR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

// 48px-friendly version of the Orders nav icon for the empty-state hero.
const _O_EMPTY_ICON = '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';

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
    if (!_opState.startingNew) {
      // Idle: logo + Recent Projects + "+ New Order" button
      const recents = (typeof projects !== 'undefined' ? projects : [])
        .slice()
        .sort(/** @param {any} a @param {any} b */ (a, b) => {
          const av = a.updated_at ? +new Date(a.updated_at) : 0;
          const bv = b.updated_at ? +new Date(b.updated_at) : 0;
          return bv - av;
        });
      host.innerHTML = _renderProjectEmpty({
        title: 'Orders',
        subtitle: 'Pick a project to start a new order.',
        pickFnName: '_oPickProjectFromEmpty',
        pickerInputId: 'oe-project-picker',
        pickerSuggestId: 'oe-project-suggest',
        pickerSuggestFn: '_smartOProjectSuggest',
        recentProjects: recents,
        iconSvg: _O_EMPTY_ICON,
      });
      return;
    }
    // Drafting: project-picker form (reached by clicking "+ New Order")
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

  // Optional from-quote chip — prefer the DB column (order.quote_id) and fall
  // back to the legacy localStorage map (_oqGet) for orders converted before
  // the column was added.
  const qRef = o ? (/** @type {any} */ (o).quote_id ?? _oqGet(o.id)) : null;
  const fromQuote = qRef ? quotes.find(q => q.id === qRef) : null;
  const quoteChip = fromQuote ? `<div class="pf" style="margin:8px 0"><label class="pf-label">From Quote</label><div class="pf-chips"><span class="pf-chip" style="border-color:rgba(37,99,235,0.3);color:#6b9bf4" onclick="switchSection('quote');window._quoteSearch='${_escHtml(quoteProject(fromQuote)).replace(/'/g,"\\'")}';renderQuoteMain()">Q-${String(fromQuote.id).padStart(4,'0')} · ${_escHtml(quoteProject(fromQuote))}</span></div></div>` : '';

  // Overdue badge
  let isOverdue = false;
  if (o && o.status !== 'complete' && o.due && o.due !== 'TBD') {
    const parsed = new Date(o.due);
    if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
  }

  const auto = o ? (o.auto_schedule !== false) : true;

  // Hours-allocated override: NULL on the order = use computed; non-null = pinned manual value.
  const hoursOverride = !!(o && /** @type {any} */ (o).hours_allocated != null);
  const hoursAllocVal = hoursOverride ? /** @type {any} */ (o).hours_allocated : '';

  // Schedule section open/closed: persisted per-tab in localStorage.
  const schedOpen = localStorage.getItem('pc_order_sched_open') === 'true';

  // Column-toggle pill state — Disc + Hours default to on; Stock = library toggle.
  const colDiscOff  = localStorage.getItem('pc_order_col_disc')  === 'off';
  const colHrsOff   = localStorage.getItem('pc_order_col_hrs')   === 'off';
  const colStockOn  = localStorage.getItem('pc_order_col_stock') === 'on';

  const orderNumberValue = _escHtml((o && o.order_number) || (o ? String(o.id).padStart(4,'0') : _nextOrderNumber()));

  const headerName = (projectName || 'Untitled project') + (clientName ? ' · ' + clientName : '');

  host.innerHTML = `<div class="form-section editor-shell">
    <div class="project-header">
      <div class="ph-row1">
        <button class="ph-back" onclick="_oChangeProject()" title="Back to orders" aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
        <span class="ph-title">${_escHtml(headerName)}</span>
      </div>
    </div>

    <!-- Smart library for order number (same UX as cutlist tab). -->
    <div class="ed-libsearch">
      <div class="smart-input-wrap">
        <input type="text" id="po-order-number" placeholder="Order number..." autocomplete="off"
          value="${orderNumberValue}"
          oninput="_oOrderSearchInput(this)"
          onfocus="_oOrderSuggest(this,'po-order-suggest')"
          onblur="setTimeout(()=>{const b=document.getElementById('po-order-suggest'); if(b)b.style.display='none'},150)">
        <div class="smart-input-add" onclick="_oNewOrderFromInput()" title="Start a new order">+</div>
      </div>
      <div id="po-order-suggest" class="client-suggest-list" style="display:none"></div>
    </div>

    ${quoteChip}

    <div class="cl-section-header">
      <span class="cl-section-title">Line Items</span>
      <div class="pill-group">
        <button class="cl-col-pill ${colDiscOff ? '' : 'active'}" data-col="disc" onclick="_oToggleColumn('disc',this)">Discount</button>
        <button class="cl-col-pill ${colHrsOff ? '' : 'active'}" data-col="hrs" onclick="_oToggleColumn('hrs',this)">Hours</button>
        <button class="cl-col-pill ${colStockOn ? 'active' : ''}" data-col="stock" onclick="_oToggleColumn('stock',this)">Stock</button>
      </div>
    </div>

    <div id="po-lines"></div>

    <div class="cl-add-row">
      <button class="cl-add-btn" onclick="_oAddLine('cabinet')">+ Cabinet</button>
      <button class="cl-add-btn" onclick="_oAddLine('item')">+ Item</button>
    </div>

    <div class="stock-library ${colStockOn ? 'visible' : ''}" id="po-stock-library">
      <div style="position:relative">
        <div class="smart-input-wrap">
          <input type="text" id="po-stock-search" placeholder="Search or add stock..." autocomplete="off"
            oninput="_oStockSearch(this.value)" onfocus="_oStockSearch(this.value)"
            onblur="setTimeout(()=>{const b=document.getElementById('po-stock-suggest'); if(b)b.style.display='none'},150)">
          <div class="smart-input-add" onclick="_openNewStockPopup('po-stock-search')" title="Add new stock item">+</div>
        </div>
        <div id="po-stock-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      <div class="stock-markup-row">
        <label>Stock Markup</label>
        <div class="markup-wrap">
          <input type="number" id="po-stock-markup" value="${(o && /** @type {any} */ (o).stock_markup) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()">
          <span class="markup-unit">%</span>
        </div>
        <span class="stock-markup-hint">applied to all stock lines</span>
      </div>
    </div>

    <div class="editor-section" style="margin-top:10px;border-top:1px solid var(--border);border-bottom:none;padding-top:10px">
      <div class="editor-section-title">Pricing</div>
      <div class="rates-chips">
        <div class="rate-chip"><span class="chip-label">Tax</span><input type="number" id="po-tax" value="${(o && o.tax) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()"><span class="chip-unit">%</span></div>
        <div class="rate-chip"><span class="chip-label">Disc</span><input type="number" id="po-discount" value="${(o && /** @type {any} */ (o).discount) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()"><span class="chip-unit">%</span></div>
      </div>
    </div>

    <div class="editor-section" style="border-top:none;border-bottom:none;padding-top:0">
      <div class="pf-totals" id="po-totals"></div>
    </div>

    <details class="sched editor-section" id="po-sched-details" style="padding:0;border-bottom:1px solid var(--border)" ${schedOpen ? 'open' : ''} ontoggle="_orderSchedToggle(this)">
      <summary>
        <span class="chev"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="sched-label">Schedule</span>
        <span class="sched-summary" id="po-sched-summary"></span>
      </summary>
      <div class="sched-body">
        <div class="pf-row-inline">
          <label class="pf-inline"><input type="checkbox" id="po-auto-schedule" ${auto ? 'checked' : ''} oninput="_orderAutoScheduleToggle(this.checked);_oMarkDirty()"><span class="pf-inline-label">Auto schedule</span></label>
          <label class="pf-inline"><span class="pf-inline-label">Priority</span><input class="pf-input-compact" type="number" id="po-priority" value="${(o && o.priority) ?? 0}" step="1" oninput="_oMarkDirty();_renderOrderSchedSummary()" title="Higher = scheduled first"></label>
          <label class="pf-inline"><span class="pf-inline-label">Run-over</span><input class="pf-input-compact" type="number" min="0" step="0.5" id="po-run-over" value="${(o && o.run_over_hours) ?? 0}" oninput="_renderOrderHoursBreakdown();_oMarkDirty();_renderOrderSchedSummary()"><span class="pf-inline-suffix">h</span></label>
        </div>
        <div class="pf-row-inline">
          <label class="pf-inline"><input type="checkbox" id="po-hours-override" ${hoursOverride ? 'checked' : ''} oninput="_orderHoursOverrideToggle(this.checked);_oMarkDirty();_renderOrderSchedSummary()"><span class="pf-inline-label">Override hours</span></label>
          <label class="pf-inline" id="po-hours-alloc-wrap" style="${hoursOverride ? '' : 'display:none'}"><span class="pf-inline-label">Allocated</span><input class="pf-input-compact" type="number" min="0" step="0.5" id="po-hours-allocated" value="${hoursAllocVal}" oninput="_oMarkDirty();_renderOrderSchedSummary()"><span class="pf-inline-suffix">h</span></label>
        </div>
        <div class="pf-hours-readout" id="po-hours-breakdown" style="${hoursOverride ? 'display:none' : ''}"></div>
        <div class="pf-row-inline">
          <label class="pf-inline pf-inline-grow"><span class="pf-inline-label">Production Start ${auto ? '<span class="pf-inline-hint">(auto)</span>' : ''}</span><input class="pf-input-compact" type="date" id="po-start" value="${o ? _orderDateToISO(o.prodStart||'') : ''}" ${auto ? 'disabled title="Auto-scheduled — toggle off to set manually"' : ''} oninput="_oMarkDirty();_renderOrderSchedSummary()"></label>
          <label class="pf-inline pf-inline-grow"><span class="pf-inline-label">Due</span><input class="pf-input-compact" type="date" id="po-due" value="${o ? _orderDateToISO(o.due||'') : ''}" oninput="_oMarkDirty();_renderOrderSchedSummary()"></label>
        </div>
      </div>
    </details>

    <div class="editor-section">
      <div class="editor-section-title">Notes</div>
      <textarea class="pf-textarea" id="po-notes" rows="3" placeholder="Production notes..." oninput="_oMarkDirty()">${_escHtml((o && o.notes)||'')}</textarea>
    </div>

    ${isExisting ? '' : `<div class="editor-footer"><span style="flex:1"></span><button class="btn btn-primary" onclick="createOrderFromEditor()">+ Create Order</button></div>`}
  </div>`;

  if (o || _opState.lines.length > 0) {
    if (typeof _renderOrderLines === 'function') _renderOrderLines();
    if (typeof _renderOrderLineTotals === 'function') _renderOrderLineTotals();
    if (typeof _renderOrderHoursBreakdown === 'function') _renderOrderHoursBreakdown();
  }
  if (typeof _renderOrderSchedSummary === 'function') _renderOrderSchedSummary();
}

/** Persist the Schedule section's open/closed state.
 *  @param {HTMLDetailsElement} el */
function _orderSchedToggle(el) {
  try { localStorage.setItem('pc_order_sched_open', String(el.open)); } catch (e) {}
}

/** Reflect the picked status into the badge's data-status attribute so the
 *  CSS-driven background colour follows. The native select element provides
 *  the dropdown UI; we just style its host as a coloured pill.
 *  @param {HTMLSelectElement} el */
function _oSetStatusBadge(el) {
  el.setAttribute('data-status', el.value);
}

/** Oninput handler for #po-order-number. Marks dirty (so autosave picks up the
 *  renamed order_number) and refreshes the suggest dropdown.
 *  @param {HTMLInputElement} input */
function _oOrderSearchInput(input) {
  _oMarkDirty();
  _oOrderSuggest(input, 'po-order-suggest');
}

/** Smart suggest for the order-number input. Lists orders for the current
 *  project with click-to-load and a "+ Start new" footer when the typed
 *  number isn't an existing match — mirrors the cutlist library pattern.
 *  @param {HTMLInputElement} input @param {string} boxId */
function _oOrderSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  if (!_opState.projectId) {
    box.innerHTML = `<div class="client-suggest-add" style="color:var(--muted)">Pick a project first</div>`;
    box.style.display = 'block';
    return;
  }
  const q = input.value.trim().toLowerCase();
  const rows = orders
    .filter(o => o.project_id === _opState.projectId)
    .slice()
    .sort(/** @param {any} a @param {any} b */ (a, b) => (+new Date(b.updated_at || 0)) - (+new Date(a.updated_at || 0)));
  /** @param {any} o */
  const numFor = o => String(o.order_number || String(o.id).padStart(4, '0'));
  const matches = q ? rows.filter(o => numFor(o).toLowerCase().includes(q)) : rows;
  const exact = q && rows.some(o => numFor(o).toLowerCase() === q);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  matches.slice(0, 8).forEach(o => {
    const isActive = o.id === _opState.orderId;
    const num = numFor(o);
    const meta = o.status ? `<span class="csi-meta">${esc(o.status)}</span>` : '';
    html += `<div class="client-suggest-item" onmousedown="loadOrderIntoSidebar(${o.id});document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">#</span>
      <span class="csi-name">${esc(num)}${isActive ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</span>
      ${meta}
    </div>`;
  });
  if (matches.length === 0 && rows.length > 0) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No matching orders</div>`;
  } else if (rows.length === 0 && !q) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No orders in this project yet</div>`;
  }
  if (q && !exact) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_oNewOrderFromInput()">
      <span class="csi-icon">+</span>
      <span class="csi-name">Start new order #${esc(input.value.trim())}</span>
    </div>`;
  }
  box.innerHTML = html;
  box.style.display = 'block';
}

/** "+" button handler for the order-number smart library. Starts a fresh draft
 *  order in the current project, pre-filling the typed number when present.
 *  Dirty-checks first. */
function _oNewOrderFromInput() {
  if (!_opState.projectId) { _toast('Pick a project first', 'error'); return; }
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('po-order-number'));
  const typed = inp ? inp.value.trim() : '';
  const startNew = () => {
    _opState = { orderId: null, lines: [], dirty: false, projectId: _opState.projectId, startingNew: false };
    renderOrderEditor();
    const newInp = /** @type {HTMLInputElement|null} */ (document.getElementById('po-order-number'));
    if (newInp && typed) newInp.value = typed;
    const box = document.getElementById('po-order-suggest'); if (box) box.style.display = 'none';
    _toast(`New draft order #${typed || _nextOrderNumber()} — add lines then save`, 'success');
  };
  if (_opState.dirty) _confirm('Discard unsaved changes and start a new order?', startNew);
  else startNew();
}

/** Toggle a line-items column (or the stock library). Persists state per-tab.
 *  @param {string} col @param {HTMLElement} btn */
function _oToggleColumn(col, btn) {
  const table = document.getElementById('po-lines-table');
  const lib = document.getElementById('po-stock-library');
  const wasActive = btn.classList.contains('active');
  btn.classList.toggle('active', !wasActive);
  const nowActive = !wasActive;
  if (col === 'stock') {
    if (lib) lib.classList.toggle('visible', nowActive);
    try { localStorage.setItem('pc_order_col_stock', nowActive ? 'on' : 'off'); } catch (e) {}
    // Hide the suggest dropdown if we just closed the library.
    if (!nowActive) {
      const sugg = document.getElementById('po-stock-suggest');
      if (sugg) sugg.classList.remove('open');
    }
  } else {
    if (table) table.classList.toggle('hide-' + col, !nowActive);
    try { localStorage.setItem('pc_order_col_' + col, nowActive ? 'on' : 'off'); } catch (e) {}
  }
}

/** Open the stock-library smart-search dropdown filtered by the typed query.
 *  Suggestions are grouped by stock_type / category (sticky section labels).
 *  Click a row to add it as a stock-kind line.
 *  @param {string} q */
function _oStockSearch(q) {
  _stockSearchRender(q, 'po-stock-suggest', /** @param {any} item */ item => {
    _oAddStockLineFromLibrary(item);
  });
}

/** Show/hide the allocated-hours input + breakdown panel when override toggles.
 *  @param {boolean} on */
function _orderHoursOverrideToggle(on) {
  const wrap = document.getElementById('po-hours-alloc-wrap');
  if (wrap) wrap.style.display = on ? '' : 'none';
  const breakdown = document.getElementById('po-hours-breakdown');
  if (breakdown) breakdown.style.display = on ? 'none' : '';
  if (on) {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('po-hours-allocated'));
    if (input && !input.value) {
      // Seed with current computed total so the user can adjust from there.
      const b = (typeof _orderHoursBreakdown === 'function')
        ? _orderHoursBreakdown(_opState.lines, {})
        : null;
      if (b) input.value = String(b.total);
    }
  }
}

/** Render the 1-line summary shown next to the "Schedule" title when the
 *  section is collapsed. Reads live values from inputs so it stays current. */
function _renderOrderSchedSummary() {
  const el = document.getElementById('po-sched-summary');
  if (!el) return;
  const auto = /** @type {HTMLInputElement|null} */ (document.getElementById('po-auto-schedule'));
  const start = /** @type {HTMLInputElement|null} */ (document.getElementById('po-start'));
  const override = /** @type {HTMLInputElement|null} */ (document.getElementById('po-hours-override'));
  const allocated = /** @type {HTMLInputElement|null} */ (document.getElementById('po-hours-allocated'));
  /** @param {string} iso */
  const fmtDate = iso => {
    if (!iso) return 'TBD';
    try {
      const d = new Date(iso + 'T12:00:00');
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch (e) { return iso; }
  };
  let hoursVal;
  if (override && override.checked) {
    hoursVal = (parseFloat((allocated && allocated.value) || '0') || 0).toFixed(1);
  } else {
    const b = (typeof _orderHoursBreakdown === 'function')
      ? _orderHoursBreakdown(_opState.lines, {
          runOverHours: parseFloat(/** @type {any} */ (document.getElementById('po-run-over'))?.value) || undefined,
        })
      : { total: 0 };
    hoursVal = (b.total || 0).toFixed(1);
  }
  const mode = (auto && auto.checked) ? 'Auto' : 'Manual';
  el.textContent = `${mode} · Start ${fmtDate(start ? start.value : '')} · ${hoursVal} h`;
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

/** @type {ReturnType<typeof setTimeout> | null} */
let _oAutoSaveTimer = null;
function _oMarkDirty() {
  if (!_opState.dirty) {
    _opState.dirty = true;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'dirty');
  }
  // Strategy C: only existing orders autosave; new orders need explicit + Create.
  if (_opState.orderId) {
    if (_oAutoSaveTimer) clearTimeout(_oAutoSaveTimer);
    _oAutoSaveTimer = setTimeout(() => { _oAutoSaveTimer = null; saveOrderEditor(); }, 600);
  }
}

function _oClearEditor() {
  _opState = { orderId: null, lines: [], dirty: false, projectId: null, startingNew: false };
  renderOrderEditor();
}

/** Idle-state click handler: pick a recent project to start a new order on it.
 *  @param {number} id @param {string} _name */
function _oPickProjectFromEmpty(id, _name) {
  _opState.projectId = id;
  _opState.startingNew = false;
  renderOrderEditor();
}

/** Idle-state click handler: reveal the project-picker form. */
function _oNewOrder() {
  _opState.startingNew = true;
  renderOrderEditor();
  setTimeout(() => {
    const el = document.getElementById('oe-project-picker');
    if (el) /** @type {HTMLInputElement} */ (el).focus();
  }, 0);
}

function _oChangeProject() {
  if (_opState.dirty) {
    _confirm('Discard unsaved changes?', () => _oClearEditor());
    return;
  }
  _oClearEditor();
}

/** @param {number} id */
async function loadOrderIntoSidebar(id) {
  const o = orders.find(ox => ox.id === id);
  if (!o) return;
  if (_opState.dirty && _opState.orderId !== id) {
    _confirm('Discard unsaved changes?', () => { _opState.dirty = false; loadOrderIntoSidebar(id); });
    return;
  }
  _opState = {
    orderId: id,
    lines: Array.isArray(/** @type {any} */ (o)._lines) ? /** @type {any} */ (o)._lines.map(/** @param {any} r */ r => ({ ...r })) : [],
    dirty: false,
    projectId: o.project_id || null,
    startingNew: false,
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
  _opState = { orderId: null, lines: [], dirty: false, projectId: p.id, startingNew: false };
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
    markup: 0,
    tax: parseFloat(_popupVal('po-tax')) || 0,
    discount: parseFloat(_popupVal('po-discount')) || 0,
    stock_markup: parseFloat(_popupVal('po-stock-markup')) || 0,
    order_number: _popupVal('po-order-number') || null,
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
  // Strategy C: surface saving status + track in-flight for beforeunload.
  /** @type {any} */ const w = window;
  if (!w._saveInFlight) w._saveInFlight = new Set();
  w._saveInFlight.add('order');
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saving');
  try {
  const status = _popupVal('po-status');
  const order_number = _popupVal('po-order-number') || null;
  // Legacy order-level markup column is no longer surfaced in the editor; we
  // preserve whatever the row already has so existing non-zero values are kept.
  const markup = /** @type {any} */ (o).markup ?? 0;
  const tax = parseFloat(_popupVal('po-tax')) || 0;
  const discount = parseFloat(_popupVal('po-discount')) || 0;
  const stock_markup = parseFloat(_popupVal('po-stock-markup')) || 0;
  const priority = parseFloat(_popupVal('po-priority')) || 0;
  const autoEl = /** @type {HTMLInputElement|null} */ (document.getElementById('po-auto-schedule'));
  const auto_schedule = autoEl ? autoEl.checked : true;
  const run_over_hours = parseFloat(_popupVal('po-run-over')) || 0;
  const startISO = _popupVal('po-start');
  const dueISO = _popupVal('po-due');
  // Manual start/end inputs are gone — when auto is off, production_start_date
  // doubles as the manual anchor (mirrored to manual_start_date for scheduler
  // compatibility), and end is computed from hours by the scheduler walk.
  const manual_start = auto_schedule ? null : (startISO || null);
  const manual_end = null;
  // Hours-allocated override: NULL = use computed; non-null = pinned manual.
  const hoursOverrideEl = /** @type {HTMLInputElement|null} */ (document.getElementById('po-hours-override'));
  const hours_allocated = (hoursOverrideEl && hoursOverrideEl.checked)
    ? (parseFloat(_popupVal('po-hours-allocated')) || 0)
    : null;
  /** @type {any} */
  const update = { status, order_number, markup, tax, discount, stock_markup, priority, auto_schedule, manual_start_date: manual_start, manual_end_date: manual_end, run_over_hours, hours_allocated, updated_at: new Date().toISOString() };
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
      discount: row.discount ?? 0,
    };
    writes.push(/** @type {any} */ (_db('order_lines').update(u).eq('id', row.id)));
  }
  await Promise.all(writes);
  // Refresh totals if helper exists. Stock-kind materials are isolated as
  // t.stockMat and re-priced via stock_markup; everything else flows through
  // the legacy markup → tax → discount chain.
  if (typeof orderTotalsFromLines === 'function') {
    const t = await orderTotalsFromLines(id);
    if (t) {
      const nonStockMat = t.materials - (t.stockMat || 0);
      const stockSub = (t.stockMat || 0) * (1 + (stock_markup||0)/100);
      const subPostLine = nonStockMat + t.labour + stockSub;
      const afterMarkup = subPostLine * (1 + (markup||0)/100);
      const afterTax = afterMarkup * (1 + (tax||0)/100);
      /** @type {any} */ (o).value = Math.round(afterTax * (1 - (discount||0)/100));
    }
  }
  _opState.dirty = false;
  _oBadge();
  renderOrdersMain();
  renderOrderEditor();
  if (typeof renderSchedule === 'function') renderSchedule();
  if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saved');
  } catch (e) {
    console.warn('[order save]', (/** @type {any} */ (e)).message || e);
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: saveOrderEditor });
    _toast('Save failed — check connection', 'error');
  } finally {
    w._saveInFlight.delete('order');
  }
}
