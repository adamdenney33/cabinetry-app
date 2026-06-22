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
// existing `order_number` and returns the next as `ORD-NNNN`. Unlike
// `_nextQuoteNumber()` we do NOT compare against `id` — the backfill
// migration guarantees every existing order has a number, so the `id`
// fallback would only inject gaps from the row-id counter and surprise the
// user (`ORD-0007` → `ORD-0022` instead of `ORD-0008`).
function _nextOrderNumber() {
  let max = 0;
  for (const o of orders) {
    if (typeof o.id === 'number' && o.id < 0) continue; // sample data — ORD-0312… must not seed the user's own sequence
    if (o.order_number) {
      const m = String(o.order_number).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  return 'ORD-' + String(max + 1).padStart(4, '0');
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
  if (!_enforceFreeLimit('orders', _realCount(orders))) return;
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
  if (o.name) row.name = o.name;
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
  // Live-link tab owns the main pane (customer-preview iframe) — see
  // renderQuoteMain for why background refreshes must not repaint cards here.
  if (typeof _llTab !== 'undefined' && _llTab.order === 'live'
      && typeof _opState !== 'undefined' && _opState && _opState.orderId != null) return;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  // Drill-down: when the sidebar editor has a client picked, scope this list
  // to that client. If the client has been deleted, clear the stale state.
  const drillClientId = (typeof _opState !== 'undefined' && _opState) ? _opState.clientId : null;
  let drillClient = drillClientId ? clients.find(c => c.id === drillClientId) : null;
  if (drillClientId && !drillClient) { _opState.clientId = null; drillClient = null; }
  const scopedOrders = drillClient
    ? orders.filter(o => o.client_id === drillClient.id)
    : orders;
  const active = scopedOrders.filter(o => o.status !== 'complete');
  const complete = scopedOrders.filter(o => o.status === 'complete');

  const stepLabels = ['Quote','Confirmed','Production','Delivery','Done'];

  /** @param {any} o */
  const orderCard = o => {
    const curIdx = ORDER_STATUSES.indexOf(o.status);
    const pipe = ORDER_STATUSES.map((s, i) => {
      const done = i < curIdx;
      const active = i === curIdx;
      const color = active ? (/** @type {Record<string,string>} */ (STATUS_COLORS))[s] : done ? 'var(--success)' : 'var(--border)';
      return `<div class="pipe-step ${active?'pipe-active':''}${done?' pipe-done':''}" data-idx="${i}" data-hover-color="${(/** @type {Record<string,string>} */(STATUS_COLORS))[s]}" onmouseenter="pipePreview(this)" onmouseleave="pipeRestorePreview(this)" onclick="event.stopPropagation();setOrderStatus(${o.id},'${s}')" style="cursor:pointer" title="Set to ${stepLabels[i]}">
        <div class="pipe-dot" data-orig-color="${color}" style="background:${color};border-color:${color}"></div>
        <div class="pipe-label">${stepLabels[i]}</div>
      </div>${i < ORDER_STATUSES.length-1 ? `<div class="pipe-line ${done?'pipe-line-done':''}"></div>` : ''}`;
    }).join('');

    const isComplete = o.status === 'complete';
    let isOverdue = false;
    if (!isComplete && o.due && o.due !== 'TBD') {
      const parsed = new Date(o.due);
      if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
    }
    const relDate = isComplete ? null : _relativeDate(o.due);
    const completedOn = isComplete
      ? (o.updated_at ? String(o.updated_at).slice(0, 10) : '—')
      : null;
    const titleNum = o.order_number || '';
    const titleProj = orderProject(o) || '';
    const titleCli = orderClient(o) || '';
    const titleText = [titleNum, titleCli, titleProj].filter(Boolean).join(' · ');
    // Payment is a SEPARATE dimension from production status, so it gets its
    // own outline pill in the meta row instead of a second look-alike badge
    // next to the production one (which read as two conflicting statuses).
    // Derived from the originating quote (payment is quote-only); shows
    // nothing at all when the maker isn't using live links / card payment.
    const _llQuote = o.quote_id ? quotes.find(/** @param {any} x */ x => x.id === o.quote_id) : null;
    let _payPill = '';
    if (_llQuote && _llQuote.status === 'paid') {
      _payPill = '<span class="oc-pay paid" onclick="event.stopPropagation()" title="Paid by card on the live page">✓ Paid in full</span>';
    } else if (_llQuote && _llQuote.status === 'deposit_paid') {
      _payPill = '<span class="oc-pay paid" onclick="event.stopPropagation()" title="Deposit paid by card on the live page — balance due on completion">✓ Deposit paid · balance due</span>';
    } else if (o.share_token || (_llQuote && /** @type {any} */ (_llQuote).share_token)) {
      _payPill = '<span class="oc-pay linked" onclick="event.stopPropagation()" title="The customer can view this on its live link">Link live</span>';
    }
    const isEditing = o.id === _opState.orderId;
    return `
    <div class="order-card${isOverdue ? ' order-overdue' : ''}${isEditing ? ' editing' : ''}" style="cursor:pointer" onclick="loadOrderIntoSidebar(${o.id})">
      <div class="oc-header">
        <div class="oc-info">
          <div class="oc-title-row">
            <div class="oc-title">${titleText}${isEditing ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</div>
          </div>
          <div class="oc-meta">
            ${isComplete
              ? `<span>Completed: ${completedOn}</span>`
              : `<span>Due: ${o.due ? String(o.due).slice(0, 10) : 'TBD'}</span>`}
            ${relDate ? `<span style="font-size:9px;font-weight:700;color:${relDate.color}">${relDate.label}</span>` : ''}
            ${isOverdue ? '<span class="badge badge-red" style="font-size:8px;padding:1px 5px">Overdue</span>' : ''}
            ${(() => { const lc = _lineKindCountsLabel(/** @type {any} */ (o)._lines); return lc ? `<span>· ${lc}</span>` : ''; })()}
            ${_payPill}
          </div>
          ${o.notes ? `<div class="oc-notes" style="cursor:default">${_escHtml(o.notes)}</div>` : ''}
        </div>
        <div class="oc-right">
          <div class="oc-value" style="cursor:default;border-bottom:none">${fmt(o.value)}</div>
        </div>
      </div>
      <div class="oc-pipeline">${pipe}</div>
      <div class="oc-footer">
        ${typeof _orderPdfMenu === 'function' ? `<button class="btn btn-outline" onclick="event.stopPropagation();_orderPdfMenu(${o.id})" style="font-size:11px;padding:5px 8px;width:auto" title="Export a PDF document">PDF ▾</button>` : ''}
        ${typeof _openLiveLinkTab === 'function' ? `<button class="btn btn-outline" onclick="event.stopPropagation();_openLiveLinkTab('order',${o.id})" style="font-size:11px;padding:5px 8px;width:auto" title="Open the live link page">Live link</button>` : ''}
        ${typeof _toggleOrderThread === 'function' ? (() => { const _u = typeof _clientUnreadCount === 'function' ? _clientUnreadCount(o.client_id) : 0; return `<button class="btn btn-outline" onclick="event.stopPropagation();_toggleOrderThread(${o.id})" style="font-size:11px;padding:5px 8px;width:auto">Messages <span data-order-unread="${o.id}">${_u ? `(${_u})` : ''}</span></button>`; })() : ''}
        ${typeof _accountingOrderFooter === 'function' ? _accountingOrderFooter(o.id) : ''}
        <span style="flex:1"></span>
        <button class="btn btn-outline" onclick="event.stopPropagation();duplicateOrder(${o.id})" style="font-size:11px;padding:5px 10px;width:auto">Duplicate</button>
        <button class="btn btn-outline" style="color:var(--danger);font-size:11px;padding:5px 10px;width:auto" onclick="event.stopPropagation();_confirm('Delete order for <strong>${_escHtml(orderClient(o))}</strong>?',()=>removeOrder(${o.id}))">Delete</button>
      </div>
      <div class="oc-thread" data-order-thread="${o.id}" style="display:none" onclick="event.stopPropagation()"></div>
    </div>`;
  };

  const filterVal = window._orderFilter || 'active';
  const filterSearch = (window._orderSearch || '').toLowerCase().trim();
  const sortBy = window._orderSort || 'newest';
  let pool = filterVal === 'all' ? scopedOrders : filterVal === 'active' ? active : complete;
  let filtered = filterSearch ? pool.filter(o => (orderClient(o)+' '+orderProject(o)).toLowerCase().includes(filterSearch)) : [...pool];
  // Sort
  if (sortBy === 'due') filtered.sort((a,b) => { const da=_orderDateToISO(a.due||'')||'9999', db=_orderDateToISO(b.due||'')||'9999'; return da.localeCompare(db); });
  else if (sortBy === 'value') filtered.sort((a,b) => (b.value ?? 0) - (a.value ?? 0));
  else if (sortBy === 'client') filtered.sort((a,b) => (orderClient(a)||'').localeCompare(orderClient(b)||''));

  const emptyState = `<div class="empty-state">
    <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg></div>
    <h3>No orders yet</h3><p>Add your first order using the form on the left, or convert a quote.</p></div>`;

  const filterTabs = `<div class="lib-filter-row">
    <input class="lib-filter-input" type="search" placeholder="Search client or project…" value="${window._orderSearch||''}" oninput="window._orderSearch=this.value;renderOrdersMain()">
    <button class="btn btn-outline lib-filter-btn" onclick="event.stopPropagation();exportOrdersCSV()">&darr; Export</button>
    <button class="btn btn-outline lib-filter-btn" onclick="event.stopPropagation();importOrdersCSV()">&uarr; Import</button>
  </div>
  <div class="lib-toggle-row">
    <button class="ofilter-tab ${filterVal==='active'?'active':''}" onclick="setOrderFilter('active')">Active (${active.length})</button>
    <button class="ofilter-tab ${filterVal==='all'?'active':''}" onclick="setOrderFilter('all')">All (${scopedOrders.length})</button>
    <button class="ofilter-tab ${filterVal==='complete'?'active':''}" onclick="setOrderFilter('complete')">Completed (${complete.length})</button>
    <select class="lib-sort-select" style="margin-left:auto" onchange="window._orderSort=this.value;renderOrdersMain()">
      <option value="newest" ${sortBy==='newest'?'selected':''}>Newest first</option>
      <option value="due" ${sortBy==='due'?'selected':''}>Due date</option>
      <option value="value" ${sortBy==='value'?'selected':''}>Value</option>
      <option value="client" ${sortBy==='client'?'selected':''}>Client</option>
    </select>
  </div>`;

  const header = drillClient
    ? _renderProjectHeader('orders', {
        name: drillClient.name,
        exitFn: '_oChangeClient',
        iconSvg: _CH_ICON_ORDER.replace('ch-icon', 'ph-icon'),
        clientName: undefined,
        addOnclick: '_oNewOrder()',
      })
    : _renderContentHeader({ iconSvg: _CH_ICON_ORDER, title: 'Orders', addOnclick: '_oNewOrder()' });

  const drillEmpty = `<div class="empty-state" style="padding:40px 0"><p style="color:var(--muted)">No orders for this client yet.</p></div>`;

  el.innerHTML = `<div style="max-width:800px;margin:0 auto">
    ${header}
    ${scopedOrders.length === 0 && !drillClient ? emptyState : filterTabs + `<div class="orders-list">${filtered.length === 0 && drillClient ? drillEmpty : filtered.map(orderCard).join('')}</div>`}
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
  if (!_enforceProFeature()) return;
  if (!orders.length) { _toast('No orders to export', 'error'); return; }
  /** @type {any[][]} */
  const rows = [['Order #','Client','Project','Value','Status','Due','Markup %','Tax %','Discount %','Stock Markup %','Priority','Production Start','Notes','Created']];
  orders.forEach(o => rows.push([
    o.order_number||'', orderClient(o), orderProject(o), o.value, o.status, o.due||'TBD',
    o.markup ?? 0, o.tax ?? 0, /** @type {any} */ (o).discount ?? 0, /** @type {any} */ (o).stock_markup ?? 0,
    /** @type {any} */ (o).priority ?? 0, /** @type {any} */ (o).production_start_date || '',
    o.notes||'', (o.created_at||'').slice(0,10),
  ]));
  _csvDownload(rows, `orders-${new Date().toISOString().slice(0,10)}.csv`);
  _toast('Orders exported', 'success');
}
function importOrdersCSV() {
  if (!_enforceProFeature()) return;
  _csvPickFile(async rows => {
    const col = _csvCol(rows[0], {
      number:      ['order', 'ordernumber', 'orderno', 'number'],
      client:      ['client', 'clientname', 'customer'],
      project:     ['project', 'projectname', 'name'],
      value:       ['value', 'total', 'ordertotal'],
      status:      ['status'],
      due:         ['due', 'duedate'],
      markup:      ['markup'],
      tax:         ['tax', 'taxvat', 'vat'],
      discount:    ['discount'],
      stockMarkup: ['stockmarkup'],
      priority:    ['priority'],
      prodStart:   ['productionstart', 'productionstartdate', 'startdate'],
      notes:       ['notes', 'note'],
    });
    // Headerless file → legacy import order (Client, Project, Value, Status, Due, Notes).
    /** @type {Record<string, number>} */
    const legacy = { client:0, project:1, value:2, status:3, due:4, notes:5 };
    const start = col ? 1 : 0;
    /** @param {string[]} r @param {string} key */
    const get = (r, key) => col ? col(r, key) : (legacy[key] !== undefined ? (r[legacy[key]] ?? '').trim() : '');
    // Accept the status key ('production') or its display label ('In Production').
    /** @param {string} v */
    const statusKey = v => {
      const s = (v || '').trim().toLowerCase();
      if (!s) return 'quote';
      if (/** @type {any} */ (STATUS_LABELS)[s]) return s;
      const byLabel = Object.keys(STATUS_LABELS).find(k => /** @type {any} */ (STATUS_LABELS)[k].toLowerCase() === s);
      return byLabel || 'quote';
    };
    /** @param {string} v */
    const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
    let imported = 0;
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const clientName = get(r, 'client');
      const project = get(r, 'project');
      if (!clientName && !project) continue;
      const client_id = clientName ? await resolveClient(clientName) : null;
      /** @type {any} */
      const row = {
        user_id: _userId,
        order_number: get(r, 'number') || _nextOrderNumber(),
        value: num(get(r, 'value')) ?? 0,
        status: statusKey(get(r, 'status')),
        due: get(r, 'due') || 'TBD',
        markup: num(get(r, 'markup')) ?? 0,
        tax: num(get(r, 'tax')) ?? 0,
        discount: num(get(r, 'discount')) ?? 0,
        stock_markup: num(get(r, 'stockMarkup')) ?? 0,
        priority: Math.round(num(get(r, 'priority')) ?? 0),
      };
      if (client_id) row.client_id = client_id;
      if (project) row.name = project;
      const notes = get(r, 'notes');     if (notes) row.notes = notes;
      const prodStart = get(r, 'prodStart');
      if (/^\d{4}-\d{2}-\d{2}$/.test(prodStart)) row.production_start_date = prodStart;
      if (_userId) {
        const { data } = await _db('orders').insert(row).select().single();
        if (data) { orders.unshift(data); imported++; }
      }
    }
    _toast(imported+' orders imported','success'); renderOrdersMain();
    _oBadge();
  });
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
 *  Reads _opState; renders empty (client picker) or active-edit. */
function renderOrderEditor() {
  const host = document.getElementById('order-editor-host');
  if (!host) return;
  const _m = !!(window._mvIsMobile && window._mvIsMobile());

  const o = _opState.orderId ? orders.find(ox => ox.id === _opState.orderId) : null;
  const clientId = _opState.clientId || (o ? o.client_id : null);
  const client = clientId ? clients.find(c => c.id === clientId) : null;
  const projectName = o ? orderProject(o) : '';
  const clientName = o ? orderClient(o) : (client ? client.name : '');

  // ── Empty state ──
  if (!o && !client) {
    if (!_opState.startingNew) {
      // Idle: logo + Recent Clients + smart-input picker
      const recents = (typeof clients !== 'undefined' ? clients : [])
        .slice()
        .sort(/** @param {any} a @param {any} b */ (a, b) => {
          const av = a.updated_at ? +new Date(a.updated_at) : (a.id || 0);
          const bv = b.updated_at ? +new Date(b.updated_at) : (b.id || 0);
          return bv - av;
        })
        .slice(0, 5)
        .map(/** @param {any} c */ c => ({
          id: c.id,
          name: c.name,
          onClick: `_oPickClient(${c.id})`,
        }));
      host.innerHTML = `<div class="project-empty">
        ${_O_EMPTY_ICON}
        <h3>Orders</h3>
        <p>Pick a client to start a new order.</p>
        <div style="position:relative;text-align:left">
          <div class="smart-input-wrap">
            <input type="text" id="oe-client-picker" placeholder="Search or add client..." autocomplete="off"
              oninput="_smartOClientSuggest(this,'oe-client-suggest')"
              onfocus="_smartOClientSuggest(this,'oe-client-suggest')"
              onblur="setTimeout(()=>{const b=document.getElementById('oe-client-suggest'); if(b)b.style.display='none'},150)">
            <div class="smart-input-add" onclick="_openNewClientPopup('oe-client-picker')" title="New client">+</div>
          </div>
          <div id="oe-client-suggest" class="client-suggest-list" style="display:none"></div>
        </div>
        ${recents.length ? `<div class="pe-recent-list">
          <div class="pe-recent-label">Recent clients</div>
          ${recents.map(/** @param {{id:number,name:string,onClick:string}} r */ r => `<div class="pe-recent-item" onclick="${r.onClick}">
            <span class="pe-ri-icon">${_TYPE_ICON_CLIENT}</span>
            <span>${_escHtml(r.name)}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>`;
      return;
    }
    // Drafting: client-picker form (reached by clicking "+ New Order")
    host.innerHTML = `
      <div class="form-section">
        ${_m ? _renderProjectHeader('order', { name: 'New Order', exitFn: '_oClearEditor', iconSvg: _CH_ICON_ORDER.replace('ch-icon', 'ph-icon') }) : '<div class="form-section-title">New Order</div>'}
        <div style="${_m ? 'padding:0 14px' : ''}">
        <div class="form-group" style="position:relative;margin-bottom:8px">
          <label>Client</label>
          <div class="smart-input-wrap">
            <input type="text" id="oe-client-picker" placeholder="Search or add client..." autocomplete="off"
              oninput="_smartOClientSuggest(this,'oe-client-suggest')"
              onfocus="_smartOClientSuggest(this,'oe-client-suggest')"
              onblur="setTimeout(()=>{const b=document.getElementById('oe-client-suggest'); if(b)b.style.display='none'},150)">
            <div class="smart-input-add" onclick="_openNewClientPopup('oe-client-picker')" title="New client">+</div>
          </div>
          <div id="oe-client-suggest" class="client-suggest-list" style="display:none"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;line-height:1.5">
          Pick or create a client to start a new order.
        </div>
        </div>
      </div>`;
    return;
  }

  // ── Sub-gate: client picked, no order open → "+ Add Order" + recent orders
  if (client && !o) {
    const recents = orders
      .filter(ox => ox.client_id === client.id)
      .slice()
      .sort(/** @param {any} a @param {any} b */ (a, b) => (+new Date(b.updated_at || 0)) - (+new Date(a.updated_at || 0)))
      .slice(0, 5)
      .map(/** @param {any} ox */ ox => ({
        id: ox.id,
        name: _orderLabel(ox, { client: false }),
        meta: ox.status || '',
        onClick: `loadOrderIntoSidebar(${ox.id})`,
      }));
    const projHeader = _renderProjectHeader('order', {
      name: client.name || 'Client',
      exitFn: '_oChangeClient',
      iconSvg: _O_EMPTY_ICON.replace('class="pe-icon"', 'class="ph-icon" width="16" height="16"'),
    });
    host.innerHTML = `${projHeader}
      <div id="order-sub-gate" style="padding:14px">
        ${_renderListEmpty({
          iconSvg: _O_EMPTY_ICON,
          title: 'Orders',
          subtitle: 'Add an order for this client. New orders autosave as you edit.',
          btnLabel: '+ Add Order',
          btnOnclick: '_oStartNewOrder()',
          recentItems: recents,
          recentLabel: 'Recent',
          itemIconSvg: _CH_ICON_ORDER,
        })}
      </div>`;
    return;
  }

  // ── Active editor (order open) ──
  const status = o ? (o.status || 'quote') : 'quote';
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
  const quoteChip = fromQuote ? `<div class="pf" style="margin:8px 0"><label class="pf-label">From Quote</label><div class="pf-chips"><span class="pf-chip" style="border-color:rgba(37,99,235,0.3);color:#6b9bf4" onclick="switchSection('quote');loadQuoteIntoSidebar(${fromQuote.id})">${_escHtml(fromQuote.quote_number || ('QUO-' + String(fromQuote.id).padStart(4,'0')))} · ${_escHtml(quoteProject(fromQuote))}</span></div></div>` : '';

  // Overdue badge
  let isOverdue = false;
  if (o && o.status !== 'complete' && o.due && o.due !== 'TBD') {
    const parsed = new Date(o.due);
    if (!isNaN(+parsed) && parsed < new Date()) isOverdue = true;
  }

  const auto = o ? (o.auto_schedule !== false) : true;

  // Hours-allocated override: NULL on the order = use computed; non-null = pinned manual value.
  const hoursOverride = !!(o && /** @type {any} */ (o).hours_allocated != null);
  const hoursAllocVal = hoursOverride ? Number(/** @type {any} */ (o).hours_allocated).toFixed(1) : '';

  // Schedule section open/closed: persisted per-tab in localStorage.
  const schedOpen = localStorage.getItem('pc_order_sched_open') === 'true';

  // Column-toggle pill state — Disc + Hours default to on; Stock = library toggle.
  const colDiscOff  = localStorage.getItem('pc_order_col_disc')  === 'off';
  const colHrsOff   = localStorage.getItem('pc_order_col_hrs')   === 'off';
  const colStockOn  = localStorage.getItem('pc_order_col_stock') === 'on';

  const orderNumFull = (o && o.order_number) || (o ? 'ORD-'+String(o.id).padStart(4,'0') : _nextOrderNumber());
  // Strip the ORD- prefix so the editor input shows just the digits — the
  // prefix is re-applied on save.
  const orderNumberValue = _escHtml(String(orderNumFull).replace(/^ORD-/i, ''));

  const headerName = clientName || 'Untitled order';

  // Project header sits ABOVE the Order builder / Live link tab bar so the client
  // name + Saved pill + Back stay visible on BOTH sub-tabs (was inside #ob-body,
  // which is hidden on the Live link tab). Mirrors the quote editor.
  const _projHeader = `<div class="project-header">
      <div class="ph-row1">
        <button class="ph-back" onclick="_oChangeClient()" title="Back to orders" aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
        <span class="ph-title">${_escHtml(headerName)}</span>
        <span class="cl-unsaved-pill" data-save-pill="order" style="display:none"></span>
      </div>
    </div>`;
  host.innerHTML = `${_projHeader}${typeof _llTabBar === 'function' ? _llTabBar('order') : ''}<div id="ob-body"${(typeof _llTab !== 'undefined' && _llTab.order === 'live') ? ' style="display:none"' : ''}><div class="form-section editor-shell">
    <div class="form-group" style="padding:10px 14px">
      <label>Order Number</label>
      <div class="prefixed-input">
        <span class="input-prefix">ORD-</span>
        <input type="text" id="po-order-number" placeholder="Order number..." autocomplete="off"
          value="${orderNumberValue}"
          oninput="_oMarkDirty()">
      </div>
    </div>

    <div class="form-group" style="padding:0 14px 10px">
      <label>Project Name</label>
      <div class="prefixed-input">
        <input type="text" id="po-project-name" placeholder="e.g. Kitchen Renovation" autocomplete="off"
          value="${_escHtml((o && o.name) || '')}"
          oninput="_oMarkDirty()">
      </div>
    </div>

    ${quoteChip}

    <div class="cl-section-header">
      <span class="cl-section-title">Line Items</span>
      <div class="pill-group">
        <button class="cl-col-pill ${colDiscOff ? '' : 'active'}" data-col="disc" onclick="_oToggleColumn('disc',this)">Discount</button>
        <button class="cl-col-pill ${colHrsOff ? '' : 'active'}" data-col="hrs" onclick="_oToggleColumn('hrs',this)">Hours</button>
      </div>
    </div>

    <div id="po-lines"></div>

    <div class="cl-add-row">
      <button class="cl-add-btn" onclick="_oAddLine('cabinet')">+ Cabinet</button>
      <button class="cl-add-btn" onclick="_oAddLine('item')">+ Item</button>
      <button class="cl-add-btn" onclick="_oToggleStockLibrary()">+ Stock</button>
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
        <label class="rate-field">
          <span class="rate-label">Tax</span>
          <span class="markup-wrap">
            <input type="number" id="po-tax" value="${(o && o.tax) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()">
            <span class="markup-unit">%</span>
          </span>
        </label>
        <label class="rate-field">
          <span class="rate-label">Discount</span>
          <span class="markup-wrap">
            <input type="number" id="po-discount" value="${(o && /** @type {any} */ (o).discount) ?? 0}" oninput="_renderOrderLineTotals();_oMarkDirty()">
            <span class="markup-unit">%</span>
          </span>
        </label>
      </div>
    </div>

    <div class="editor-section" style="border-top:none;border-bottom:none;padding-top:0">
      <div class="pf-totals" id="po-totals"></div>
    </div>

    <div class="editor-section" style="border-top:1px solid var(--border);border-bottom:none">
      <div class="editor-section-title">Notes</div>
      <textarea class="pf-textarea" id="po-notes" rows="3" placeholder="Production notes..." oninput="_oMarkDirty()">${_escHtml((o && o.notes)||'')}</textarea>
    </div>

    <details class="sched editor-section" id="po-sched-details" style="padding:0;border-top:1px solid var(--border);border-bottom:none" ${schedOpen ? 'open' : ''} ontoggle="_orderSchedToggle(this)">
      <summary>
        <span class="chev"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="sched-label">Schedule</span>
        <span class="sched-summary" id="po-sched-summary"></span>
      </summary>
      <div class="sched-body">
        <div class="sched-toggles">
          <label><input type="checkbox" id="po-auto-schedule" ${auto ? 'checked' : ''} oninput="_orderAutoScheduleToggle(this.checked);_oMarkDirty()">Auto schedule</label>
          <label><input type="checkbox" id="po-hours-override" ${hoursOverride ? 'checked' : ''} oninput="_orderHoursOverrideToggle(this.checked);_oMarkDirty();_renderOrderSchedSummary()">Override hours</label>
        </div>
        <div class="sched-fields">
          <label class="sched-field" id="po-priority-wrap">
            <span class="sched-field-label">Priority</span>
            <div class="sched-stepper">
              <button type="button" class="step-btn" onclick="_oStep('po-priority',-1)" tabindex="-1" aria-label="Decrease">−</button>
              <input class="pf-input-compact" type="number" min="1" id="po-priority" value="${(o && o.priority) || ''}" step="1" placeholder="—" oninput="_oMarkDirty();_renderOrderSchedSummary()" title="1 = highest priority. Leave blank for none.">
              <button type="button" class="step-btn" onclick="_oStep('po-priority',1)" tabindex="-1" aria-label="Increase">+</button>
            </div>
          </label>
          <label class="sched-field" id="po-hours-alloc-wrap" style="${hoursOverride ? '' : 'display:none'}">
            <span class="sched-field-label">Allocated</span>
            <div class="sched-stepper">
              <button type="button" class="step-btn" onclick="_oStep('po-hours-allocated',-1)" tabindex="-1" aria-label="Decrease">−</button>
              <input class="pf-input-compact" type="number" min="0" step="0.5" id="po-hours-allocated" value="${hoursAllocVal}" oninput="_oMarkDirty();_renderOrderSchedSummary()">
              <span class="step-unit">h</span>
              <button type="button" class="step-btn" onclick="_oStep('po-hours-allocated',1)" tabindex="-1" aria-label="Increase">+</button>
            </div>
          </label>
          <label class="sched-field">
            <span class="sched-field-label">Run-over</span>
            <div class="sched-stepper">
              <button type="button" class="step-btn" onclick="_oStep('po-run-over',-1)" tabindex="-1" aria-label="Decrease">−</button>
              <input class="pf-input-compact" type="number" min="0" step="0.5" id="po-run-over" value="${(o && o.run_over_hours) ?? 0}" oninput="_renderOrderHoursBreakdown();_oMarkDirty();_renderOrderSchedSummary()">
              <span class="step-unit">h</span>
              <button type="button" class="step-btn" onclick="_oStep('po-run-over',1)" tabindex="-1" aria-label="Increase">+</button>
            </div>
          </label>
        </div>
        <div class="pf-hours-readout" id="po-hours-breakdown" style="${hoursOverride ? 'display:none' : ''}"></div>
        <div class="sched-fields is-dates">
          <label class="sched-field">
            <span class="sched-field-label">Production Start${auto ? ' <span class="sched-field-hint">(auto)</span>' : ''}</span>
            <input class="pf-input-compact" type="date" id="po-start" value="${o ? _orderDateToISO(o.prodStart||'') : ''}" ${auto ? 'disabled title="Auto-scheduled — toggle off to set manually"' : ''} oninput="_oMarkDirty();_renderOrderSchedSummary()">
          </label>
          <label class="sched-field">
            <span class="sched-field-label">Due</span>
            <input class="pf-input-compact" type="date" id="po-due" value="${o ? _orderDateToISO(o.due||'') : ''}" oninput="_oMarkDirty();_renderOrderSchedSummary()">
          </label>
        </div>
      </div>
    </details>

    ${isExisting ? '' : `<div class="editor-footer"><span style="flex:1"></span><button class="btn btn-primary" onclick="createOrderFromEditor()">+ Create Order</button></div>`}
  </div></div>${typeof _llLiveBodyDiv === 'function' ? _llLiveBodyDiv('order') : ''}`;

  if (o || _opState.lines.length > 0) {
    if (typeof _renderOrderLines === 'function') _renderOrderLines();
    if (typeof _renderOrderLineTotals === 'function') _renderOrderLineTotals();
    if (typeof _renderOrderHoursBreakdown === 'function') _renderOrderHoursBreakdown();
  }
  if (typeof _renderOrderSchedSummary === 'function') _renderOrderSchedSummary();
  if (o && typeof _setSaveStatus === 'function') {
    _setSaveStatus('order', _opState.dirty ? 'dirty' : 'clean');
  }
  if (typeof _llTab !== 'undefined' && _llTab.order === 'live' && typeof _llEnterLive === 'function') _llEnterLive('order');
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

/** Stepper button handler for the schedule fields (Priority / Allocated /
 *  Run-over). Uses the input's own min/max/step via stepUp/stepDown, then
 *  dispatches an 'input' event so the existing oninput chain (dirty +
 *  breakdown + summary) re-runs.
 *  @param {string} id @param {number} dir */
function _oStep(id, dir) {
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
  if (!input) return;
  try {
    if (dir > 0) input.stepUp(); else input.stepDown();
  } catch (e) {
    // stepUp/Down can throw if value is non-numeric — fall back to manual.
    const step = parseFloat(input.step || '1') || 1;
    const cur = parseFloat(input.value || '0') || 0;
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    input.value = String(Math.max(min, cur + dir * step));
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Oninput handler for #po-order-number. Marks dirty (so autosave picks up the
 *  renamed order_number) and refreshes the suggest dropdown.
 *  @param {HTMLInputElement} input */
function _oOrderSearchInput(input) {
  _oMarkDirty();
  _oOrderSuggest(input, 'po-order-suggest');
}

/** Smart suggest for the order-number input. Lists orders for the current
 *  client with click-to-load and a "+ Start new" footer when the typed
 *  number isn't an existing match — mirrors the cutlist library pattern.
 *  @param {HTMLInputElement} input @param {string} boxId */
function _oOrderSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  if (!_opState.clientId) {
    box.innerHTML = `<div class="client-suggest-add" style="color:var(--muted)">Pick a client first</div>`;
    box.style.display = 'block';
    return;
  }
  const q = input.value.trim().toLowerCase();
  const rows = orders
    .filter(o => o.client_id === _opState.clientId)
    .slice()
    .sort(/** @param {any} a @param {any} b */ (a, b) => (+new Date(b.updated_at || 0)) - (+new Date(a.updated_at || 0)));
  /** @param {any} o */
  const numFor = o => String(o.order_number || ('ORD-' + String(o.id).padStart(4, '0'))).replace(/^ORD-/i, '');
  const matches = q ? rows.filter(o => numFor(o).toLowerCase().includes(q)) : rows;
  const exact = q && rows.some(o => numFor(o).toLowerCase() === q);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  matches.slice(0, 8).forEach(o => {
    const isActive = o.id === _opState.orderId;
    const label = _orderLabel(o, { client: false });
    const meta = o.status ? `<span class="csi-meta">${esc(o.status)}</span>` : '';
    html += `<div class="client-suggest-item" onmousedown="loadOrderIntoSidebar(${o.id});document.getElementById('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">#</span>
      <span class="csi-name">${esc(label)}${isActive ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</span>
      ${meta}
    </div>`;
  });
  if (matches.length === 0 && rows.length > 0) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No matching orders</div>`;
  } else if (rows.length === 0 && !q) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No orders for this client yet</div>`;
  }
  if (q && !exact) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_oNewOrderFromInput()">
      <span class="csi-icon">+</span>
      <span class="csi-name">Start new order ORD-${esc(input.value.trim())}</span>
    </div>`;
  }
  box.innerHTML = html;
  box.style.display = 'block';
}

/** "+ Add Order" handler. Inserts a fresh order row in the DB immediately
 *  (with the next sequential order number). Mirrors quotes / cabinets.
 *  @param {string} [numOverride] full order number (e.g. 'ORD-0012') — used by
 *  the suggest dropdown's "Start new order ORD-X" row to honour the typed number. */
async function _oStartNewOrder(numOverride) {
  if (!_requireAuth()) return;
  if (!_opState.clientId) { _toast('Pick a client first', 'error'); return; }
  const insertNew = async () => {
    const orderNum = (typeof numOverride === 'string' && numOverride) ? numOverride : _nextOrderNumber();
    // Pre-populate Project Name with "Project N" where N = existing-orders-
    // for-this-client + 1. User overwrites as they wish; the field is editable.
    const clientId = _opState.clientId;
    const existingForClient = orders.filter(o => o.client_id === clientId).length;
    const autoName = 'Project ' + (existingForClient + 1);
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saving');
    try {
      const { data, error } = await _dbInsertSafe('orders', /** @type {any} */ ({
        user_id: _userId,
        client_id: _opState.clientId,
        order_number: orderNum,
        status: 'quote',
        due: 'TBD',
        value: 0,
        name: autoName,
      }));
      if (error || !data) {
        if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: _oStartNewOrder });
        _toast('Could not create order', 'error');
        return;
      }
      const newId = /** @type {any} */ (data).id;
      orders.unshift(/** @type {any} */ (data));
      _opState = { orderId: newId, lines: [], dirty: false, clientId: _opState.clientId, startingNew: false };
      if (typeof /** @type {any} */ (window)._pcSaveOpenOrderId === 'function') {
        /** @type {any} */ (window)._pcSaveOpenOrderId(newId);
      }
      if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'saved');
      if (window._mvShowEditor) window._mvShowEditor();
      renderOrderEditor();
      renderOrdersMain();
    } catch (e) {
      if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'failed', { retry: _oStartNewOrder });
      _toast('Could not create order', 'error');
    }
  };
  if (_opState.dirty) _confirm('Discard unsaved changes and start a new order?', insertNew);
  else insertNew();
}
/** @type {any} */ (window)._oStartNewOrder = _oStartNewOrder;

/** Suggest-dropdown "Start new order ORD-X" row: create the order with the
 *  number typed into #po-order-number (was an unbound onmousedown target). */
function _oNewOrderFromInput() {
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById('po-order-number'));
  const typed = el ? el.value.trim() : '';
  _oStartNewOrder(typed ? ('ORD-' + typed.replace(/^ORD-/i, '')) : undefined);
}
/** @type {any} */ (window)._oNewOrderFromInput = _oNewOrderFromInput;

/** Exit the open order back to the order sub-gate (stays in the project). */
function _oExitOrder() {
  const proceed = () => {
    _opState.orderId = null;
    _opState.lines = [];
    _opState.dirty = false;
    if (typeof /** @type {any} */ (window)._pcSaveOpenOrderId === 'function') {
      /** @type {any} */ (window)._pcSaveOpenOrderId(null);
    }
    if (typeof _setSaveStatus === 'function') _setSaveStatus('order', 'clean');
    if (window._mvShowList) window._mvShowList();
    renderOrderEditor();
    renderOrdersMain();
  };
  if (_opState.dirty) _confirm('Discard unsaved changes and close this order?', proceed);
  else proceed();
}
/** @type {any} */ (window)._oExitOrder = _oExitOrder;

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

/** Toggle the stock-library section from the "+ Stock" button in the add-row.
 *  Persists state and focuses the search input when opening. */
function _oToggleStockLibrary() {
  const lib = document.getElementById('po-stock-library');
  if (!lib) return;
  const willShow = !lib.classList.contains('visible');
  lib.classList.toggle('visible', willShow);
  try { localStorage.setItem('pc_order_col_stock', willShow ? 'on' : 'off'); } catch (e) {}
  if (willShow) {
    setTimeout(() => {
      const search = document.getElementById('po-stock-search');
      if (search) /** @type {HTMLInputElement} */ (search).focus();
    }, 50);
  } else {
    const sugg = document.getElementById('po-stock-suggest');
    if (sugg) sugg.classList.remove('open');
  }
}
/** @type {any} */ (window)._oToggleStockLibrary = _oToggleStockLibrary;

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
      if (b) input.value = (b.total || 0).toFixed(1);
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

/** Pipeline-step click in the EDITOR. The old #po-status select is gone, so
 *  this used to silently no-op — now it writes the status directly through
 *  the same path as the card pipeline, then refreshes the editor's dots.
 *  @param {string} s */
async function _oSetPopupStatus(s) {
  if (!_opState.orderId) return;
  await setOrderStatus(_opState.orderId, s);
  if (typeof renderOrderEditor === 'function') renderOrderEditor();
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
  // Cancel any pending autosave — once _opState is reset, a trailing
  // saveOrderEditor() would either clobber the order from a torn-down DOM or
  // (orderId now null) spawn a junk order via createOrderFromEditor.
  if (_oAutoSaveTimer) { clearTimeout(_oAutoSaveTimer); _oAutoSaveTimer = null; }
  _opState = { orderId: null, lines: [], dirty: false, clientId: null, startingNew: false };
  if (typeof /** @type {any} */ (window)._pcSaveOpenOrderId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenOrderId(null);
  }
  if (window._mvShowList) window._mvShowList();
  renderOrderEditor();
  renderOrdersMain();
}

/** Idle-state click handler: reveal the client-picker form. */
function _oNewOrder() {
  // Clear any still-open order so "+" always starts fresh (switching tabs can
  // leave one loaded while the list is shown).
  if (_oAutoSaveTimer) { clearTimeout(_oAutoSaveTimer); _oAutoSaveTimer = null; }
  _opState.orderId = null; _opState.lines = []; _opState.dirty = false; _opState.clientId = null;
  _opState.startingNew = true;
  if (window._mvShowEditor) window._mvShowEditor();
  renderOrderEditor();
  setTimeout(() => {
    const el = document.getElementById('oe-client-picker');
    if (el) /** @type {HTMLInputElement} */ (el).focus();
  }, 0);
}

function _oChangeClient() {
  if (_opState.dirty) {
    _confirm('Discard unsaved changes?', () => _oClearEditor());
    return;
  }
  _oClearEditor();
}
/** @type {any} */ (window)._oChangeClient = _oChangeClient;

/** @param {number} id */
async function loadOrderIntoSidebar(id) {
  const o = orders.find(ox => ox.id === id);
  if (!o) return;
  // Cancel any pending autosave for the order we're leaving — switching records
  // (or discarding) must not let a stale 600ms timer write the previous edit.
  if (_oAutoSaveTimer) { clearTimeout(_oAutoSaveTimer); _oAutoSaveTimer = null; }
  if (_opState.dirty && _opState.orderId !== id) {
    _confirm('Discard unsaved changes?', () => { _opState.dirty = false; loadOrderIntoSidebar(id); });
    return;
  }
  _opState = {
    orderId: id,
    lines: Array.isArray(/** @type {any} */ (o)._lines) ? /** @type {any} */ (o)._lines.map(/** @param {any} r */ r => ({ ...r })) : [],
    dirty: false,
    clientId: o.client_id || null,
    startingNew: false,
  };
  if (typeof /** @type {any} */ (window)._pcSaveOpenOrderId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenOrderId(id);
  }
  if (typeof _llReset === 'function') _llReset('order');
  if (window._mvShowEditor) window._mvShowEditor();
  renderOrderEditor();
  renderOrdersMain();
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
function _smartOClientSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  if (typeof _posSuggest === 'function') _posSuggest(input, box);
  const matches = clients
    .filter(c => !val || c.name.toLowerCase().includes(val))
    .slice(0, 8);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  for (const c of matches) {
    const ocount = orders.filter(/** @param {any} o */ o => o.client_id === c.id).length;
    html += `<div class="client-suggest-item" onmousedown="_oPickClient(${c.id})">
      <span class="suggest-icon">${esc(c.name).charAt(0).toUpperCase()}</span>
      <span class="csi-name">${esc(c.name)}</span>
      ${ocount ? `<span class="csi-meta">${ocount} order${ocount!==1?'s':''}</span>` : ''}
    </div>`;
  }
  if (val && !matches.some(c => c.name.toLowerCase() === val)) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_openNewClientPopup('oe-client-picker')">
      <span class="csi-icon">+</span>
      <span class="csi-name">Create client "${esc(input.value.trim())}"</span>
    </div>`;
  }
  if (!html) html = '<div class="client-suggest-empty">No clients yet — click + to create one.</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}
/** @type {any} */ (window)._smartOClientSuggest = _smartOClientSuggest;

/** @param {number} clientId */
function _oPickClient(clientId) {
  const c = clients.find(cc => cc.id === clientId);
  if (!c) return;
  _opState = { orderId: null, lines: [], dirty: false, clientId: c.id, startingNew: false };
  if (typeof /** @type {any} */ (window)._pcSaveOpenOrderId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenOrderId(null);
  }
  renderOrderEditor();
  renderOrdersMain();
}
/** @type {any} */ (window)._oPickClient = _oPickClient;

/** @param {'cabinet'|'item'|'labour'} kind */
async function _oAddLine(kind) {
  if (!_opState.orderId) {
    if (!_opState.clientId) { _toast('Pick or create a client first.', 'error'); return; }
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
  if (!_requireAuth()) return false;
  if (!_opState.clientId) { _toast('Pick a client first.', 'error'); return false; }
  if (!_enforceFreeLimit('orders', _realCount(orders))) return false;
  const client = clients.find(c => c.id === _opState.clientId);
  if (!client) { _toast('Client not found.', 'error'); return false; }
  /** @type {any} */
  const row = {
    user_id: _userId,
    client_id: client.id,
    value: 0,
    // Status is managed from the card pipeline — there's no '#po-status'
    // editor field (see saveOrderEditor), so new orders always start 'quote'.
    status: 'quote',
    markup: 0,
    tax: parseFloat(_popupVal('po-tax')) || 0,
    discount: parseFloat(_popupVal('po-discount')) || 0,
    stock_markup: parseFloat(_popupVal('po-stock-markup')) || 0,
    order_number: (() => { const v = _popupVal('po-order-number') || ''; return v ? ('ORD-' + v.replace(/^ORD-/i, '')) : null; })(),
    due: 'TBD',
  };
  // client_id already set on the row above (line "client_id: client.id"); no
  // secondary lookup needed post-F5.
  const { data, error } = await _dbInsertSafe('orders', row);
  if (error || !data) { _toast('Could not create order — ' + ((error && error.message) || ''), 'error'); return false; }
  if (typeof _track === 'function') _track('library_item_created', { library: 'orders', item_id: data.id, source: 'editor' });
  // Save notes locally
  const notesVal = _popupVal('po-notes') || '';
  if (notesVal) { /** @type {any} */ (data).notes = notesVal; _onSet(data.id, notesVal); }
  orders.unshift(data);
  _opState.orderId = data.id;
  _opState.dirty = false;
  if (typeof /** @type {any} */ (window)._pcSaveOpenOrderId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenOrderId(data.id);
  }
  _oBadge();
  renderOrdersMain();
  renderOrderEditor();
  if (!silent) _toast('Order created', 'success');
  return true;
}

async function saveOrderEditor() {
  // Backstop for the trailing autosave (_oAutoSaveTimer): if the editor isn't on
  // screen, every _popupVal() read returns '' and we'd write null/0 over good
  // values (order_number, name, tax, …) — or, with _opState reset, spawn a junk
  // order via createOrderFromEditor. The close/switch paths already cancel the
  // timer; this guards any path that slips through.
  if (!document.getElementById('po-order-number')) return;
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
  // Status is managed from the card pipeline (and the pay webhook), not the
  // editor — '#po-status' no longer exists, so reading it returned '' and the
  // autosave wiped the production status on every edit.
  const status = o.status || 'quote';
  const onRaw = _popupVal('po-order-number') || '';
  const order_number = onRaw ? ('ORD-' + onRaw.replace(/^ORD-/i, '')) : null;
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
  const name = (_popupVal('po-project-name') || '').trim() || null;
  /** @type {any} */
  const update = { status, order_number, name, markup, tax, discount, stock_markup, priority, auto_schedule, manual_start_date: manual_start, manual_end_date: manual_end, run_over_hours, hours_allocated, updated_at: new Date().toISOString() };
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
    let newValue = 0;
    if (t) {
      const nonStockMat = t.materials - (t.stockMat || 0);
      const stockSub = (t.stockMat || 0) * (1 + (stock_markup||0)/100);
      const subPostLine = nonStockMat + t.labour + stockSub;
      const afterMarkup = subPostLine * (1 + (markup||0)/100);
      const afterTax = afterMarkup * (1 + (tax||0)/100);
      newValue = Math.round(afterTax * (1 - (discount||0)/100));
    }
    // Persist the denormalised value cache (SCHEMA § 3.15). It was only set in
    // memory here, so manually-created orders (which start at value 0) showed
    // £0 on the card after a reload until re-saved. Write it back.
    /** @type {any} */ (o).value = newValue;
    await _db('orders').update({ value: newValue }).eq('id', id);
  }
  _opState.dirty = false;
  _oBadge();
  renderOrdersMain();
  // Don't rebuild the editor DOM mid-edit. The autosave fires 600ms after the
  // last keystroke (often while the field is still focused) and runs through an
  // awaited DB round-trip; a full renderOrderEditor() here resets every input to
  // the value captured *before* that round-trip, dropping any keystrokes typed
  // during the save and jumping the cursor. Live helpers already keep on-screen
  // totals/summaries fresh, so only re-render when focus is outside the editor.
  const _oeHost = document.getElementById('order-editor-host');
  if (!(_oeHost && _oeHost.contains(document.activeElement))) renderOrderEditor();
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
