// ProCabinet — Quotes state + view (carved out of src/app.js in phase E carve 4)
//
// Loaded as a classic <script defer> BEFORE src/app.js (state declarations
// here — `quotes`, `quoteNextId` — are referenced from app.js at load
// time inside function bodies, but the bindings need to exist when those
// functions are eventually called).
//
// Cross-file dependencies referenced from this file's functions: clients,
// projects, orders, _db, _dbInsertSafe, _userId, _requireAuth, _toast,
// _escHtml, _onSet, _oqSet, resolveClient, resolveProject, _openQuotePopup,
// _quoteLineRowToCB, calcCBLine, markQuoteSent, duplicateQuote, printQuote,
// exportQuotesCSV, importQuotesCSV, renderOrdersMain, switchSection — all
// globals defined in app.js, src/orders.js, or src/db.js.

// ══════════════════════════════════════════
// QUOTES
// ══════════════════════════════════════════
// In-memory shadow fields beyond the DB schema: `_totals` (materials/labour
// derived from quote_lines aggregation, cached on load), plus a few legacy
// pre-Phase-7 fields retained for fallback rendering.
/** @type {(import('./database.types').Tables<'quotes'> & {
 *    _totals?: {materials: number, labour: number},
 *    _lines?: any[],
 *    client?: string, project?: string,
 *    materials?: number, labour?: number
 * })[]} */
let quotes = [];
let quoteNextId = 1;

// FK-resolving display helpers. After Phase 7 the legacy text columns are gone,
// so an unresolved FK simply returns ''.
/** @param {any} q */
function quoteClient(q) {
  if (!q || !q.client_id) return '';
  const c = clients.find(x => x.id === q.client_id);
  return c ? c.name : '';
}
/** @param {any} q */
function quoteProject(q) {
  if (!q || !q.project_id) return '';
  const p = projects.find(x => x.id === q.project_id);
  return p ? p.name : '';
}
/** @param {any} o */
function orderClient(o) {
  if (!o || !o.client_id) return '';
  const c = clients.find(x => x.id === o.client_id);
  return c ? c.name : '';
}
/** @param {any} o */
function orderProject(o) {
  if (!o || !o.project_id) return '';
  const p = projects.find(x => x.id === o.project_id);
  return p ? p.name : '';
}

// ── Cabinet Builder draft-quote helpers (Item 2 Phase 1.1) ──
// Each (user, project) pair has at most one draft quote, used by the Cabinet
// Builder tab as the live workspace. Drafts are excluded from the Quotes tab,
// dashboard counts, and CSV exports. The tag is a notes-prefix convention —
// schema-free, swap for a real `is_draft` column if it becomes load-bearing.
const CB_DRAFT_TAG = '[CB_DRAFT]';

/** @param {{notes?: string | null} | null | undefined} q */
function _isDraftQuote(q) {
  return !!q && typeof q.notes === 'string' && q.notes.startsWith(CB_DRAFT_TAG);
}

/**
 * Find or create the Cabinet Builder draft quote for a given project.
 * Returns null if no user is signed in or no project id is supplied.
 * @param {number | null | undefined} projectId
 */
async function _findOrCreateDraftQuote(projectId) {
  if (!_userId || !projectId) return null;
  let draft = quotes.find(q => q.project_id === projectId && _isDraftQuote(q));
  if (draft) return draft;
  const { data: existing } = await _db('quotes')
    .select('*')
    .eq('user_id', _userId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (existing && existing.length) {
    const found = existing.find(q => _isDraftQuote(q));
    if (found) {
      if (!quotes.find(q => q.id === found.id)) quotes.unshift(found);
      return found;
    }
  }
  const insertBody = {
    user_id: _userId,
    project_id: projectId,
    notes: CB_DRAFT_TAG,
    status: 'draft',
    markup: (typeof cbSettings !== 'undefined' && cbSettings && cbSettings.markup) ?? 0,
    tax: (typeof cbSettings !== 'undefined' && cbSettings && cbSettings.tax) ?? 0,
    date: new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await _db('quotes').insert(insertBody).select().single();
  if (error || !data) {
    _toast('Could not create draft quote.', 'error');
    return null;
  }
  quotes.unshift(data);
  return data;
}

// Compute the next sequential quote number. Looks at both the trailing
// integer in any existing `quote_number` strings and the DB `id` values, so
// the new number stays ahead of both. Format: `Q-NNNN` (4-digit padded).
function _nextQuoteNumber() {
  let max = 0;
  for (const q of quotes) {
    if (_isDraftQuote(q)) continue;
    if (q.quote_number) {
      const m = String(q.quote_number).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    if (q.id) max = Math.max(max, q.id);
  }
  return 'Q-' + String(max + 1).padStart(4, '0');
}

// Per-line subtotal across all kinds. `cabinet` runs the full calcCBLine
// pipeline; `item` and `labour` are simple qty/hours × unit_price products.
// Cabinet results are memoised on the row (`row._sub`) since their inputs
// only change in the Cabinet Builder, not in the quote/order popup —
// recomputing per keystroke for an item edit was the main slowness vector.
//
// Per-line `discount` (percentage 0-100) is applied to both materials AND
// labour proportionally so totals downstream stay simple sums.
/** @param {any} row a quote_lines / order_lines row */
function _lineSubtotal(row) {
  const kind = row.line_kind || 'cabinet';
  const disc = parseFloat(row.discount) || 0;
  const discMult = 1 - (disc / 100);
  if (kind === 'item' || kind === 'stock') {
    // Stock lines have the same per-line math as items. The order/quote's
    // stock_markup is applied later in the totals calc (one rate × the sum
    // of all stock-kind materials), not per-line — that's why it's a single
    // input below the stock library rather than a per-row column.
    const qty = parseFloat(row.qty) || 1;
    const price = parseFloat(row.unit_price) || 0;
    return { materials: qty * price * discMult, labour: 0 };
  }
  if (kind === 'labour') {
    const hrs = parseFloat(row.labour_hours) || 0;
    const rate = parseFloat(row.unit_price);
    const fallback = (typeof cbSettings !== 'undefined' && cbSettings.labourRate) ? cbSettings.labourRate : 65;
    const r = isFinite(rate) ? rate : fallback;
    return { materials: 0, labour: hrs * r * discMult };
  }
  // cabinet — cached on the row. Cache key includes discount so editing it
  // in the editor invalidates the cache (see _orderLineUpdate / _lineUpdate).
  if (row._sub) return row._sub;
  const cb = _quoteLineRowToCB(row);
  const c = calcCBLine(cb);
  const qty = cb.qty || 1;
  const out = { materials: (c.matCost + c.hwCost) * qty * discMult, labour: c.labourCost * qty * discMult };
  Object.defineProperty(row, '_sub', { value: out, writable: true, enumerable: false, configurable: true });
  return out;
}

// Aggregate materials/labour for a quote from its `quote_lines` rows. Side
// effect: caches the rows on the quote (`q._lines`) so popups can open
// synchronously without a fresh fetch. Returns null if no lines exist.
/** @param {number} quoteId */
async function quoteTotalsFromLines(quoteId) {
  if (!quoteId) return null;
  const { data: lines, error } = await _db('quote_lines').select('*').eq('quote_id', quoteId).order('position');
  if (error || !lines) return null;
  // Cache the rows on the quote object for popup open
  const q = quotes.find(x => x.id === quoteId);
  if (q) q._lines = lines.map(/** @param {any} r */ r => ({ ...r }));
  if (lines.length === 0) return null;
  let materials = 0, labour = 0, stockMat = 0;
  for (const row of lines) {
    const sub = _lineSubtotal(row);
    materials += sub.materials;
    labour += sub.labour;
    if (row.line_kind === 'stock') stockMat += sub.materials;
  }
  return { materials, labour, stockMat };
}

// Same shape as quoteTotalsFromLines, against order_lines. Caches lines on
// the order (`o._lines`) so popups can open synchronously. stockMat is the
// sum of stock-kind line materials, broken out so the caller can apply the
// per-order stock_markup separately.
/** @param {number} orderId */
async function orderTotalsFromLines(orderId) {
  if (!orderId) return null;
  const { data: lines, error } = await _db('order_lines').select('*').eq('order_id', orderId).order('position');
  if (error || !lines) return null;
  const o = orders.find(x => x.id === orderId);
  if (o) /** @type {any} */ (o)._lines = lines.map(/** @param {any} r */ r => ({ ...r }));
  if (lines.length === 0) return null;
  let materials = 0, labour = 0, stockMat = 0;
  for (const row of lines) {
    const sub = _lineSubtotal(row);
    materials += sub.materials;
    labour += sub.labour;
    if (row.line_kind === 'stock') stockMat += sub.materials;
  }
  return { materials, labour, stockMat };
}

async function _hydrateQuoteTotals() {
  // Run in parallel; each call also caches q._lines as a side effect.
  await Promise.all(quotes.map(async q => {
    if (q._totals) return;
    try {
      const t = await quoteTotalsFromLines(q.id);
      if (t) q._totals = t;
    } catch (e) {
      console.warn('[quote totals] hydrate failed for', q.id, (/** @type {any} */ (e)).message || e);
    }
  }));
}

async function _hydrateOrderLines() {
  // Pre-cache order lines so the order popup opens without a network wait.
  await Promise.all(orders.map(async o => {
    if (/** @type {any} */ (o)._lines) return;
    try { await orderTotalsFromLines(o.id); }
    catch (e) { console.warn('[order lines] hydrate failed for', o.id, (/** @type {any} */ (e)).message || e); }
  }));
}

/** @param {number} quoteId */
async function _refreshQuoteTotals(quoteId) {
  const q = quotes.find(x => x.id === quoteId);
  if (!q) return;
  delete q._totals;
  const t = await quoteTotalsFromLines(quoteId);
  if (t) q._totals = t;
}

/** @param {any} q */
function quoteTotal(q) {
  const mat = q._totals ? q._totals.materials : (q.materials || 0);
  const lab = q._totals ? q._totals.labour    : (q.labour    || 0);
  const stockMat = q._totals ? (q._totals.stockMat || 0) : 0;
  const nonStockMat = mat - stockMat;
  const stockMarkup = parseFloat(q.stock_markup) || 0;
  const stockSub = stockMat * (1 + stockMarkup / 100);
  const sub = nonStockMat + lab + stockSub;
  const marked = sub * (1 + (q.markup || 0) / 100);
  const taxed = marked * (1 + (q.tax || 0) / 100);
  return taxed * (1 - (q.discount || 0) / 100);
}

// orders.value is the customer-paid snapshot at conversion time (post-markup,
// post-tax). order_lines exist for itemisation but do not drive the dashboard
// total — see SPEC.md § 13 (2026-04-29) for why we kept the column.
/** @param {any} o */
function orderTotal(o) {
  return o ? (o.value || 0) : 0;
}

// Quote creation flow lives in the sidebar editor (createQuoteFromEditor).
// The legacy createQuote() that read from q-client / q-project sidebar inputs
// was removed when the sidebar became the editor.

/** @param {number} id */
async function removeQuote(id) {
  if (!_requireAuth()) return;
  await _db('quotes').delete().eq('id', id);
  quotes = quotes.filter(q => q.id !== id);
  // Phase 2 (2.2): if the deleted quote was being edited in the Cabinet Builder,
  // clear that editing state so the next CB load falls back to the project draft.
  const editingId = localStorage.getItem('pc_cb_editing_quote_id');
  if (editingId && parseInt(editingId, 10) === id) {
    localStorage.removeItem('pc_cb_editing_quote_id');
    if (typeof cbEditingQuoteId !== 'undefined') {
      cbEditingQuoteId = null;
      cbEditingOriginalLines = null;
    }
  }
  renderQuoteMain();
}

/** @param {number} id */
async function convertQuoteToOrder(id) {
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('orders', orders.length)) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const { error: qErr } = await _db('quotes').update({ status: 'approved' }).eq('id', id);
  if (qErr) { _toast('Could not update quote — ' + (qErr.message || JSON.stringify(qErr)), 'error'); console.error(qErr); return; }
  q.status = 'approved';
  /** @type {any} */
  const orderRow = {
    user_id: _userId,
    value: Math.round(quoteTotal(q)),
    markup: q.markup ?? 0,
    tax: q.tax ?? 0,
    discount: /** @type {any} */ (q).discount ?? 0,
    stock_markup: /** @type {any} */ (q).stock_markup ?? 0,
    status: 'confirmed',
    order_number: typeof _nextOrderNumber === 'function' ? _nextOrderNumber() : null,
    due: 'TBD',
  };
  if (q.client_id) orderRow.client_id = q.client_id;
  if (q.project_id) orderRow.project_id = q.project_id;
  const { data, error: oErr } = await _dbInsertSafe('orders', orderRow);
  if (oErr || !data) { _toast('Could not create order — ' + (oErr?.message || JSON.stringify(oErr)), 'error'); console.error(oErr); return; }
  // Carry quote notes to order notes & store quote reference
  if (q.notes && data) { data.notes = q.notes; _onSet(data.id, q.notes); }
  if (data) { _oqSet(data.id, q.id); }
  // Copy the quote's line items to order_lines so the order has its own snapshot
  if (data) {
    try {
      const { data: qlines } = await _db('quote_lines').select('*').eq('quote_id', q.id);
      if (qlines && qlines.length) {
        const olines = qlines.map(l => {
          // Cast: quote_lines Row has id+quote_id (required); order_lines Insert needs
          // them stripped (delete operator forbids non-optional fields under strict).
          const nl = /** @type {any} */ ({ ...l, order_id: data.id });
          delete nl.id; delete nl.quote_id;
          return nl;
        });
        await _db('order_lines').insert(olines);
      }
    } catch(e) { console.warn('[convertQuoteToOrder] copy lines failed:', (/** @type {any} */ (e)).message || e); }
  }
  orders.unshift(data);
  /** @type {HTMLElement} */ (_byId('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  _toast(`Order created for ${quoteClient(q)} — ${quoteProject(q)}`, 'success');
  renderQuoteMain();
  switchSection('orders');
}

/** @param {number} id */
async function approveQuote(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'approved' }).eq('id', id);
  q.status = 'approved';
  _toast('Quote marked as approved', 'success');
  renderQuoteMain();
}

/** @param {number} id */
async function revertQuoteToDraft(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'draft' }).eq('id', id);
  q.status = 'draft';
  renderQuoteMain();
}

function renderQuoteMain() {
  const cur = window.currency;
  const el = _byId('quote-main');
  if (!el) return;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  // Hide CB drafts — they're Cabinet Builder workspace state, not customer quotes.
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  const approved = customerQuotes.filter(q => q.status === 'approved').length;
  const sent = customerQuotes.filter(q => q.status === 'sent').length;
  const draft = customerQuotes.filter(q => q.status === 'draft').length;

  /** @param {string} s */
  const statusBadge = s => {
    if (s === 'approved') return '<span class="badge badge-green">Approved</span>';
    if (s === 'sent') return '<span class="badge badge-blue">Sent</span>';
    return '<span class="badge badge-gray">Draft</span>';
  };

  /** @param {any} q */
  const qCard = q => {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    const sub = matVal + labVal;
    const markupAmt = sub * q.markup / 100;
    const afterMarkup = sub + markupAmt;
    const taxAmt = afterMarkup * q.tax / 100;
    const total = afterMarkup + taxAmt;
    const statusBadge = q.status === 'approved' ? 'badge-green' : q.status === 'sent' ? 'badge-blue' : 'badge-gray';
    const statusText = q.status === 'approved' ? 'Approved' : q.status === 'sent' ? 'Sent' : 'Draft';
    const lines = /** @type {any[]} */ (q._lines || []);
    const cabCount  = lines.filter(/** @param {any} l */ l => (l.line_kind || 'cabinet') === 'cabinet').length;
    const itemCount = lines.filter(/** @param {any} l */ l => l.line_kind === 'item').length;
    const labCount  = lines.filter(/** @param {any} l */ l => l.line_kind === 'labour').length;
    const pName = quoteProject(q);
    const cName = quoteClient(q);
    const titleText = pName && cName
      ? `${_escHtml(pName)} - ${_escHtml(cName)}`
      : _escHtml(pName || cName || '');
    /** @param {string} label @param {string} kind @param {number} count @param {string} icon */
    const stripCell = (label, kind, count, icon) => `
        <div class="proj-act${count ? '' : ' empty'}">
          <div class="proj-act-main" onclick="event.stopPropagation();loadQuoteIntoSidebar(${q.id})" title="Open quote">
            ${icon}
            <span class="proj-act-label">${label}</span>
            <span class="proj-act-count">${count}</span>
          </div>
          <div class="proj-act-add" onclick="event.stopPropagation();loadQuoteIntoSidebar(${q.id});_qAddLine('${kind}')" title="Add ${label.toLowerCase()}">+</div>
        </div>`;
    return `
    <div class="quote-card" style="cursor:pointer" onclick="loadQuoteIntoSidebar(${q.id})">
      <div class="qc-header">
        <div style="flex:1;min-width:0;overflow:hidden">
          <div class="qc-title" style="display:flex;align-items:center;gap:8px;min-width:0">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1">${titleText}</span>
            <span class="badge ${statusBadge}" style="font-size:9px;padding:1px 6px;flex-shrink:0">${statusText}</span>
          </div>
          ${q.date ? `<div class="qc-meta">${q.date}</div>` : ''}
        </div>
        <span class="qc-total">${fmt(total)}</span>
      </div>
      ${q.notes ? `<div style="border-top:1px solid var(--border2);padding:8px 16px;background:var(--surface)">
        ${q.notes.split(/\r?\n/).filter(Boolean).slice(0,3).map(/** @param {string} line */ line =>
          '<div style="font-size:11px;color:var(--text2);margin-bottom:2px">' + _escHtml(line) + '</div>'
        ).join('')}
        ${q.notes.split(/\r?\n/).filter(Boolean).length > 3 ? '<div style="font-size:10px;color:var(--muted)">…</div>' : ''}
      </div>` : ''}
      <div class="proj-strip cols-3" style="padding:8px 16px" onclick="event.stopPropagation()">
        ${stripCell('Cabinets', 'cabinet', cabCount, _Q_ICON_CABINET)}
        ${stripCell('Items', 'item', itemCount, _Q_ICON_ITEM)}
        ${stripCell('Labour', 'labour', labCount, _Q_ICON_LABOUR)}
      </div>
      <div class="qc-footer" onclick="event.stopPropagation()">
        ${q.status === 'draft' ? `<button class="btn btn-outline" onclick="markQuoteSent(${q.id})">Mark Sent</button>` : ''}
        ${q.status === 'sent' ? `<button class="btn btn-success" onclick="approveQuote(${q.id})">Approve</button>` : ''}
        ${q.status !== 'draft' ? `<button class="btn btn-outline" onclick="revertQuoteToDraft(${q.id})" style="color:var(--muted)">↩ Draft</button>` : ''}
        ${(() => { const matchingOrder = orders.find(o => o.quote_id === q.id); return matchingOrder ? `<button class="btn btn-outline" onclick="_openOrderPopup(${matchingOrder.id})" style="color:var(--success)">✓ View Order</button>` : `<button class="btn btn-outline" onclick="convertQuoteToOrder(${q.id})">→ Order</button>`; })()}
        <span style="flex:1"></span>
        <button class="btn btn-outline" onclick="printQuote(${q.id},'pdf')">PDF</button>
        <button class="btn btn-outline" onclick="duplicateQuote(${q.id})">Duplicate</button>
        <button class="btn btn-outline" style="color:var(--danger)" onclick="_confirm('Delete quote for <strong>${_escHtml(quoteClient(q))}</strong>?',()=>removeQuote(${q.id}))">Delete</button>
      </div>
    </div>`;
  };

  const emptyState = `<div class="empty-state">
    <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
    <h3>No quotes yet</h3><p>Fill in the form on the left to create your first quote.</p></div>`;

  const qFilter = window._quoteFilter || 'all';
  const qSearch = (window._quoteSearch || '').toLowerCase().trim();
  const qSort = window._quoteSort || 'newest';
  let filteredQ = [...customerQuotes];
  if (qFilter !== 'all') filteredQ = filteredQ.filter(q => q.status === qFilter);
  if (qSearch) filteredQ = filteredQ.filter(q => (quoteClient(q) + ' ' + quoteProject(q)).toLowerCase().includes(qSearch));
  if (qSort === 'value') filteredQ.sort((a,b) => quoteTotal(b) - quoteTotal(a));
  else if (qSort === 'client') filteredQ.sort((a,b) => (quoteClient(a)||'').localeCompare(quoteClient(b)||''));

  const filterBar = `<div class="order-filter-tabs" style="align-items:center">
    <input class="order-search-input" type="search" placeholder="Search client or project…" value="${window._quoteSearch||''}" oninput="window._quoteSearch=this.value;renderQuoteMain()">
    <button class="ofilter-tab ${qFilter==='all'?'active':''}" onclick="window._quoteFilter='all';renderQuoteMain()">All (${customerQuotes.length})</button>
    <button class="ofilter-tab ${qFilter==='draft'?'active':''}" onclick="window._quoteFilter='draft';renderQuoteMain()">Draft (${draft})</button>
    <button class="ofilter-tab ${qFilter==='sent'?'active':''}" onclick="window._quoteFilter='sent';renderQuoteMain()">Sent (${sent})</button>
    <button class="ofilter-tab ${qFilter==='approved'?'active':''}" onclick="window._quoteFilter='approved';renderQuoteMain()">Approved (${approved})</button>
    <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer;margin-left:auto" onchange="window._quoteSort=this.value;renderQuoteMain()">
      <option value="newest" ${qSort==='newest'?'selected':''}>Newest first</option>
      <option value="value" ${qSort==='value'?'selected':''}>Value</option>
      <option value="client" ${qSort==='client'?'selected':''}>Client</option>
    </select>
    <button class="btn btn-outline" onclick="event.stopPropagation();exportQuotesCSV()" style="font-size:10px;padding:4px 8px;width:auto">Export</button>
    <button class="btn btn-outline" onclick="event.stopPropagation();importQuotesCSV()" style="font-size:10px;padding:4px 8px;width:auto">Import</button>
  </div>`;

  el.innerHTML = `<div style="max-width:800px;margin:0 auto">
    ${_renderContentHeader({ iconSvg: _CH_ICON_QUOTE, title: 'Quotes' })}
    ${customerQuotes.length === 0 ? emptyState : filterBar + `<div class="quote-list">${filteredQ.map(qCard).join('')}${filteredQ.length === 0 ? '<div class="empty-state" style="padding:40px 0"><p style="color:var(--muted)">No quotes match this filter.</p></div>' : ''}</div>`}
  </div>`;
}


// ── CSV import / export ──
function exportQuotesCSV() {
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  if (!customerQuotes.length) { _toast('No quotes to export', 'error'); return; }
  const cur = window.currency;
  /** @type {any[][]} */
  const rows = [['Client','Project','Materials','Labour','Markup %','Tax %','Discount %','Status','Date','Notes']];
  customerQuotes.forEach(q => {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    rows.push([quoteClient(q),quoteProject(q),matVal,labVal,q.markup,q.tax,/** @type {any} */ (q).discount ?? 0,q.status,q.date,q.notes||'']);
  });
  const csv = rows.map(r => r.map(/** @param {any} v */ v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `quotes-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Quotes exported', 'success');
}
function importQuotesCSV() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('No data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 4 || !r[0]) continue;
      const client_id = r[0] ? await resolveClient(r[0]) : null;
      const project_id = r[1] ? await resolveProject(r[1], client_id) : null;
      /** @type {any} */
      const row = { user_id: _userId, materials: parseFloat(r[2])||0, labour: parseFloat(r[3])||0, markup: parseFloat(r[4])||20, tax: parseFloat(r[5])||13, discount: parseFloat(r[6])||0, status: r[7]||'draft', date: r[8]||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}), notes: r[9]||'' };
      if (client_id) row.client_id = client_id;
      if (project_id) row.project_id = project_id;
      if (_userId) { const{data}=await _db('quotes').insert(row).select().single(); if(data){quotes.unshift(data);imported++;} }
    }
    _toast(imported+' quotes imported','success'); renderQuoteMain();
  };
  input.click();
}


// ══════════════════════════════════════════
// QUOTE HELPERS (smart-input, popups, printing — formerly section in app.js,
// pulled in during phase E carve 14)
// ══════════════════════════════════════════
// ── Smart Suggest System ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartClientSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const allClients = [...new Set([...clients.map(c => c.name), ...quotes.map(q => quoteClient(q)), ...orders.map(o => orderClient(o))].filter(Boolean))];
  const matches = val ? allClients.filter(c => c.toLowerCase().includes(val) && c.toLowerCase() !== val) : allClients;
  const inputId = input.id;
  let html = matches.slice(0,8).map(c => {
    const initial = c.charAt(0).toUpperCase();
    return `<div class="client-suggest-item" onmousedown="_byId('${inputId}').value='${c.replace(/'/g,'&#39;')}';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon">${initial}</span>
      <span>${_escHtml(c)}</span>
    </div>`;
  }).join('');
  html += `<div class="client-suggest-add" onmousedown="_openNewClientPopup('${inputId}')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new client</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {HTMLInputElement} input @param {string} boxId */
function _smartProjectSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const allProjects = [...new Set([...projects.map(p => p.name), ...quotes.map(q => quoteProject(q)), ...orders.map(o => orderProject(o))].filter(Boolean))];
  const matches = val ? allProjects.filter(p => p.toLowerCase().includes(val) && p.toLowerCase() !== val) : allProjects;
  const inputId = input.id;
  let html = matches.slice(0,8).map(p => {
    const proj = /** @type {any} */ (projects.find(px => px.name === p));
    const clientName = proj ? proj.client : '';
    return `<div class="client-suggest-item" onmousedown="_byId('${inputId}').value='${p.replace(/'/g,'&#39;')}';_byId('${boxId}').style.display='none';_autoFillClientFromProject('${p.replace(/'/g,'&#39;')}','${inputId}')">
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
/** @param {string} projName @param {string} projInputId */
function _autoFillClientFromProject(projName, projInputId) {
  const proj = projects.find(p => p.name === projName);
  if (!proj || proj.client_id == null) return;
  const cli = clients.find(c => c.id === proj.client_id);
  if (!cli) return;
  // Determine which client input to fill based on the project input
  const clientInputId = projInputId.replace('-project', '-client');
  const clientInput = _byId(clientInputId);
  if (clientInput && !clientInput.value) clientInput.value = cli.name;
}

// ── New Client/Project Popup (inline creation) ──
/** @param {string} targetInputId */
function _openNewClientPopup(targetInputId) {
  // Close any suggest dropdowns
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => b.style.display = 'none');
  // Pre-fill with what user typed
  const existing = _byId(targetInputId)?.value || '';
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

/** @param {string} targetInputId */
async function _saveNewClientPopup(targetInputId) {
  const name = _popupVal('pnc-name');
  if (!name) { _toast('Client name is required', 'error'); return; }
  // Check for duplicate
  if (clients.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    // Just set the input and close
    /** @type {HTMLInputElement} */ (_byId(targetInputId)).value = name;
    _closePopup();
    _toast('Client already exists — selected', 'info');
    return;
  }
  const insertBody = {
    name,
    email: _popupVal('pnc-email') || '',
    phone: _popupVal('pnc-phone') || '',
    address: _popupVal('pnc-address') || '',
    notes: _popupVal('pnc-notes') || '',
    user_id: /** @type {string} */ (_userId),
  };
  const { data, error } = await _db('clients').insert(insertBody).select().single();
  if (error || !data) { _toast('Could not save client — ' + (error?.message || ''), 'error'); console.error(error); return; }
  clients.push(data);
  /** @type {HTMLInputElement} */ (_byId(targetInputId)).value = name;
  _closePopup();
  renderClientsMain();
  _toast(`Client "${name}" added`, 'success');
}

/** @param {string} targetInputId */
function _openNewProjectPopup(targetInputId) {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => b.style.display = 'none');
  const existing = _byId(targetInputId)?.value || '';
  // Get client from the corresponding client input
  const clientInputId = targetInputId.replace('-project', '-client');
  const clientVal = _byId(clientInputId)?.value || '';
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">New Project</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">PROJECT NAME</label><input class="pf-input pf-input-lg" id="pnp-name" value="${_escHtml(existing)}"></div>
      <div class="pf" style="position:relative"><label class="pf-label">CLIENT</label>
        <div class="smart-input-wrap"><input class="pf-input" id="pnp-client" value="${_escHtml(clientVal)}" placeholder="Search or add client..." autocomplete="off" oninput="_smartClientSuggest(this,'pnp-client-suggest')" onfocus="_smartClientSuggest(this,'pnp-client-suggest')" onblur="setTimeout(()=>_byId('pnp-client-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewClientPopup('pnp-client')" title="Add new client">+</div></div>
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

/** @param {string} targetInputId */
async function _saveNewProjectPopup(targetInputId) {
  const name = _popupVal('pnp-name');
  if (!name) { _toast('Project name is required', 'error'); return; }
  const clientName = _popupVal('pnp-client') || '';
  const isCutList = targetInputId === 'cl-project' || targetInputId === 'cl-empty-picker';
  const isCabBuilder = targetInputId === 'cb-project' || targetInputId === 'cb-empty-picker';
  const isQuoteEditor = targetInputId === 'qe-project-picker';
  const isOrderEditor = targetInputId === 'oe-project-picker';
  // Check for duplicate
  const dupe = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (dupe) {
    const tInput = _byId(targetInputId);
    if (tInput) tInput.value = name;
    const clientInputId = targetInputId.replace('-project', '-client');
    const ci = _byId(clientInputId);
    if (ci && clientName && !ci.value) ci.value = clientName;
    if (isCutList) _setClLoadedProject(dupe.id, dupe.name);
    if (isCabBuilder) _setCbLoadedProject(dupe.id, dupe.name);
    if (isQuoteEditor) _qPickProject(dupe.id);
    if (isOrderEditor && typeof _oPickProject === 'function') _oPickProject(dupe.id);
    _closePopup();
    _toast('Project already exists — selected', 'info');
    return;
  }
  const cli = clientName ? clients.find(c => c.name === clientName) : null;
  const insertBody = {
    name,
    client_id: cli?.id ?? null,
    user_id: /** @type {string} */ (_userId),
    status: 'active',
    description: _popupVal('pnp-desc') || null,
  };
  const { data, error } = await _db('projects').insert(insertBody).select().single();
  if (error || !data) { _toast('Could not save project — ' + (error?.message || ''), 'error'); console.error(error); return; }
  projects.push(data);
  const tInput2 = _byId(targetInputId);
  if (tInput2) tInput2.value = name;
  // Also fill client input (for sidebars that have one)
  const clientInputId = targetInputId.replace('-project', '-client');
  const ci2 = _byId(clientInputId);
  if (ci2 && clientName && !ci2.value) ci2.value = clientName;
  if (isCutList) _setClLoadedProject(data.id, data.name);
  if (isCabBuilder) _setCbLoadedProject(data.id, data.name);
  if (isQuoteEditor) _qPickProject(data.id);
  if (isOrderEditor && typeof _oPickProject === 'function') _oPickProject(data.id);
  _closePopup();
  renderProjectsMain();
  _toast(`Project "${name}" added`, 'success');
}

// Set the cut list's "currently loaded" project tracking. Used by the
// New Project popup when invoked from the Cut List sidebar so subsequent
// saves overwrite this project instead of opening another popup.
/** @param {number} id @param {string} name */
function _setClLoadedProject(id, name) {
  if (typeof _clCurrentProjectId === 'undefined') return;
  _clCurrentProjectId = id;
  _clCurrentProjectName = name;
  if (typeof _setClDirty === 'function') _setClDirty(false);
  if (typeof _clLoadProjectList === 'function') _clLoadProjectList();
}

// Cabinet Builder counterpart — wires the new project into _cbCurrentProjectId
// so the dirty-pill tracker recognises the project and subsequent saves go
// straight to its draft quote.
/** @param {number} id @param {string} name */
function _setCbLoadedProject(id, name) {
  if (typeof _cbCurrentProjectId === 'undefined') return;
  _cbCurrentProjectId = id;
  _cbCurrentProjectName = name;
  localStorage.setItem('pc_cq_project_name', name);
  if (typeof _setCbDirty === 'function') _setCbDirty(false);
  if (typeof _clLoadProjectList === 'function') _clLoadProjectList();
}

// Close suggest on blur
document.addEventListener('click', e => {
  const target = /** @type {Node | null} */ (e.target);
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(box => {
    if (target && !box.contains(target) && !(/** @type {Element} */ (target)).closest('.smart-input-wrap')) box.style.display = 'none';
  });
});

/**
 * Generate one of four order PDFs. Replaces the old printWorkOrder dispatcher
 * that produced an HTML-print Work Order or a clean PDF Work Order — the HTML
 * variant is gone.
 *
 *  - work_order:        workshop document (notes + production-note ruled lines + sign-off)
 *  - order_confirmation:client-facing acknowledgement with line items + totals
 *  - proforma:          preliminary invoice (no tax-invoice claim)
 *  - invoice:           final tax invoice
 *
 * @param {number} id
 * @param {'work_order'|'order_confirmation'|'proforma'|'invoice'} type
 */
async function printOrderDoc(id, type) {
  const o = orders.find(o => o.id === id);
  if (!o) return;
  if (type === 'work_order') { _buildWorkOrderPDF(o); return; }
  // Prefer cached lines (set by orderTotalsFromLines / popup state) so the
  // PDF opens instantly when available; fall back to a fresh fetch.
  /** @type {any[]} */
  let rows = (/** @type {any} */ (o))._lines || [];
  if (!rows.length) {
    const { data } = await _db('order_lines').select('*').eq('order_id', id).order('position');
    rows = data || [];
  }
  _buildOrderDocPDF(o, rows, type);
}

async function deductStockFromCutList() {
  if (!window.results || !window.results.layouts) { _toast('Run optimization first.', 'error'); return; }
  if (!_requireAuth()) return;
  // Count sheets used by name
  /** @type {Record<string, number>} */
  const usage = {};
  window.results.layouts.forEach(/** @param {any} l */ l => {
    const name = l.sheet.label || l.sheet.name || '';
    usage[name] = (usage[name] || 0) + 1;
  });
  let deducted = 0;
  for (const [name, count] of Object.entries(usage)) {
    const stock = stockItems.find(s => s.name === name);
    if (!stock) continue;
    const newQty = Math.max(0, (stock.qty ?? 0) - count);
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

/**
 * Send a cut-list materials cost to the Quotes tab. The legacy aggregate
 * "Materials Cost" input is gone; we now switch to the tab, prefill the
 * project name if empty, and toast the figure for the user to add as a
 * line item once the quote is created.
 * @param {number} matCost
 */
function quoteFromCutList(matCost) {
  switchSection('quote');
  const pn = _byId('q-project');
  if (pn && !pn.value) pn.value = 'Untitled Job';
  const cur = window.currency;
  _toast('Cut list materials: ' + cur + matCost.toFixed(2) + ' — add as item line after creating the quote', 'info');
}

/** @param {number} id */
async function markQuoteSent(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'sent' }).eq('id', id);
  q.status = 'sent';
  renderQuoteMain();
}

/** Build a flat per-line summary from a quote_lines / order_lines row.
 *  Returns { kind, name, qtyText, total } for printing/PDF.
 *  @param {any} row
 */
function _lineDisplay(row) {
  const kind = row.line_kind || 'cabinet';
  const sub = _lineSubtotal(row);
  const total = sub.materials + sub.labour;
  if (kind === 'cabinet') {
    const dims = [row.w_mm, row.h_mm, row.d_mm].filter(Boolean).join('×');
    const parts = [];
    if (dims) parts.push(dims + 'mm');
    if (row.material) parts.push(row.material);
    if ((row.door_count || 0) > 0) parts.push(row.door_count + ' door' + (row.door_count !== 1 ? 's' : ''));
    if ((row.drawer_count || 0) > 0) parts.push(row.drawer_count + ' drawer' + (row.drawer_count !== 1 ? 's' : ''));
    return {
      kind, name: row.name || 'Cabinet',
      detail: parts.join(', '),
      qtyText: (row.qty || 1) > 1 ? '×' + row.qty : '',
      total,
    };
  }
  if (kind === 'item' || kind === 'stock') {
    const qty = row.qty || 1;
    const price = row.unit_price || 0;
    const fallbackName = kind === 'stock' ? 'Stock item' : 'Item';
    return { kind, name: row.name || fallbackName, detail: qty + ' × ' + price, qtyText: '', total };
  }
  // labour
  const hrs = row.labour_hours || 0;
  const rate = row.unit_price ?? ((typeof cbSettings !== 'undefined' && cbSettings.labourRate) ? cbSettings.labourRate : 65);
  return { kind, name: row.name || 'Labour', detail: hrs + 'h @ ' + rate + '/hr', qtyText: '', total };
}

/** @param {number} id @param {string} [mode] */
async function printQuote(id, mode='print') {
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const { data: lines } = await _db('quote_lines').select('*').eq('quote_id', id).order('position');
  const rows = lines || [];
  if (mode === 'pdf') { _buildQuotePDF(q, rows); return; }
  const cur = window.currency;
  /** @param {any} v */
  const fmt  = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  /** @param {any} v */
  const fmt0 = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const logo = getBizLogo();
  // Compute totals from the real line items rather than the in-memory cache,
  // so printed output always matches what the DB returns.
  const subParts = rows.reduce(
    (acc, row) => {
      const s = _lineSubtotal(row);
      acc.materials += s.materials;
      acc.labour += s.labour;
      if (row.line_kind === 'stock') acc.stockMat += s.materials;
      return acc;
    },
    { materials: 0, labour: 0, stockMat: 0 }
  );
  const sub = subParts.materials + subParts.labour;
  const stockMarkupPct = /** @type {any} */ (q).stock_markup ?? 0;
  const stockMarkupAmt = subParts.stockMat * stockMarkupPct / 100;
  const subWithStock = sub + stockMarkupAmt;
  const markupAmt = subWithStock * (q.markup ?? 0) / 100;
  const afterMarkup = subWithStock + markupAmt;
  const taxAmt = afterMarkup * (q.tax ?? 0) / 100;
  const afterTax = afterMarkup + taxAmt;
  const orderDiscPct = /** @type {any} */ (q).discount ?? 0;
  const orderDiscAmt = afterTax * orderDiscPct / 100;
  const total = afterTax - orderDiscAmt;
  const anyLineDisc = rows.some(/** @param {any} r */ r => (parseFloat(r.discount) || 0) > 0);
  const biz = getBizInfo();
  /** @type {Record<string, string>} */
  const statusColMap = { draft:'#888', sent:'#2563eb', approved:'#16a34a' };
  /** @type {Record<string, string>} */
  const statusTxtMap = { draft:'Draft', sent:'Sent', approved:'Approved' };
  const statusCol = statusColMap[q.status||''] || '#888';
  const statusTxt = statusTxtMap[q.status||''] || q.status;

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
  <thead><tr><th>Description</th>${anyLineDisc ? '<th class="r">Disc</th>' : ''}<th class="r">Amount</th></tr></thead>
  <tbody>
    ${rows.map(/** @param {any} row */ row => {
      const d = _lineDisplay(row);
      const rowDisc = parseFloat(row.discount) || 0;
      const discCell = anyLineDisc
        ? '<td class="r" style="color:#888;font-size:12px">' + (rowDisc > 0 ? rowDisc + '%' : '—') + '</td>'
        : '';
      return '<tr><td style="padding:10px"><strong style="font-size:14px">' + _escHtml(d.name)
        + (d.qtyText ? ' <span style="font-weight:400;color:#888">' + d.qtyText + '</span>' : '')
        + '</strong>'
        + (d.detail ? '<br><span style="font-size:11px;color:#888;padding-left:14px">' + _escHtml(d.detail) + '</span>' : '')
        + '</td>' + discCell + '<td class="r">' + fmt(d.total) + '</td></tr>';
    }).join('')}
    ${rows.length ? `<tr><td colspan="${anyLineDisc ? 3 : 2}" style="border-bottom:1.5px solid #ddd;padding:0"></td></tr>` : ''}
    ${(q.markup ?? 0) > 0 || (q.tax ?? 0) > 0 || orderDiscPct > 0 || stockMarkupAmt > 0 ? `<tr class="subtotal"><td style="color:#aaa"${anyLineDisc ? ' colspan="2"' : ''}>Subtotal</td><td class="r">${fmt(sub)}</td></tr>` : ''}
    ${stockMarkupAmt > 0 ? `<tr class="subtotal"><td style="padding-left:20px"${anyLineDisc ? ' colspan="2"' : ''}>Stock markup &nbsp;<span style="color:#bbb">(${stockMarkupPct}%)</span></td><td class="r">+ ${fmt(stockMarkupAmt)}</td></tr>` : ''}
    ${(q.markup ?? 0) > 0 ? `<tr class="subtotal"><td style="padding-left:20px"${anyLineDisc ? ' colspan="2"' : ''}>Markup &nbsp;<span style="color:#bbb">(${q.markup}%)</span></td><td class="r">+ ${fmt(markupAmt)}</td></tr>` : ''}
    ${(q.tax ?? 0) > 0 ? `<tr class="subtotal"><td style="padding-left:20px"${anyLineDisc ? ' colspan="2"' : ''}>Tax &nbsp;<span style="color:#bbb">(${q.tax}%)</span></td><td class="r">+ ${fmt(taxAmt)}</td></tr>` : ''}
    ${orderDiscPct > 0 ? `<tr class="subtotal"><td style="padding-left:20px;color:#c44"${anyLineDisc ? ' colspan="2"' : ''}>Discount &nbsp;<span style="color:#bbb">(${orderDiscPct}%)</span></td><td class="r" style="color:#c44">− ${fmt(orderDiscAmt)}</td></tr>` : ''}
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

/** @param {number} id */
async function duplicateQuote(id) {
  if (!_requireAuth()) return;
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  if (!_enforceFreeLimit('quotes', customerQuotes.length)) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  /** @type {any} */
  const row = { user_id: _userId, markup: q.markup, tax: q.tax, status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}), notes: q.notes || '' };
  if (q.client_id) row.client_id = q.client_id;
  if (q.project_id) row.project_id = q.project_id;
  const { data, error } = await _db('quotes').insert(row).select().single();
  if (error || !data) { _toast('Could not duplicate quote — ' + (error?.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  quotes.unshift(data);
  // Copy any existing quote_lines so the duplicate has matching totals
  try {
    const { data: oldLines } = await _db('quote_lines').select('*').eq('quote_id', q.id);
    if (oldLines && oldLines.length) {
      const newLines = oldLines.map(l => { const nl = /** @type {any} */ ({ ...l, quote_id: data.id }); delete nl.id; return nl; });
      await _db('quote_lines').insert(newLines);
      await _refreshQuoteTotals(data.id);
    }
  } catch(e) { console.warn('[duplicateQuote] copy lines failed:', (/** @type {any} */ (e)).message || e); }
  _toast('Quote duplicated', 'success');
  renderQuoteMain();
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const _qFieldDebounceTimers = new Map();
/** @param {number} id @param {string} field @param {any} val */
function updateQuoteField(id, field, val) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const numFields = ['materials','labour','markup','tax','discount'];
  const v = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  // Optimistic in-memory update + immediate re-render.
  /** @type {any} */ (q)[field] = v;
  renderQuoteMain();
  // Strategy C: debounce DB writes so a fast typist doesn't fire one per keystroke.
  const key = id + ':' + field;
  const prev = _qFieldDebounceTimers.get(key);
  if (prev) clearTimeout(prev);
  _qFieldDebounceTimers.set(key, setTimeout(async () => {
    _qFieldDebounceTimers.delete(key);
    try {
      await _db('quotes').update(/** @type {any} */ ({ [field]: v })).eq('id', id);
    } catch (e) {
      console.warn('[updateQuoteField]', (/** @type {any} */ (e)).message || e);
      _toast('Save failed — check connection', 'error');
    }
  }, 600));
}

// ══════════════════════════════════════════
// QUOTE SIDEBAR EDITOR
// (replaces the former popup — sidebar IS the editor now)
// ══════════════════════════════════════════

// Cabinets/Items/Labour icons mirror the top nav-tab SVGs:
// Cabinet ← Cabinet nav-tab, Item ← Stock nav-tab (3D box), Labour ← Schedule nav-tab (calendar).
const _Q_ICON_CABINET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';
const _Q_ICON_ITEM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
const _Q_ICON_LABOUR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

// 48px-friendly version of the Quotes nav icon for the empty-state hero.
const _Q_EMPTY_ICON = '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';

/** Top-level render for the Quote sidebar editor.
 *  Reads _qpState; renders empty (project picker), in-progress (no row yet),
 *  or active-edit (existing quote loaded). */
function renderQuoteEditor() {
  const host = document.getElementById('quote-editor-host');
  if (!host) return;

  const q = _qpState.quoteId ? quotes.find(qx => qx.id === _qpState.quoteId) : null;
  const projectId = _qpState.projectId || (q ? q.project_id : null);
  const project = projectId ? projects.find(p => p.id === projectId) : null;
  const projectName = q ? quoteProject(q) : (project ? project.name : '');
  const clientName = q ? quoteClient(q) : (project && project.client_id ? (clients.find(c => c.id === project.client_id) || {}).name || '' : '');

  // ── Empty state ──
  if (!q && !project) {
    if (!_qpState.startingNew) {
      // Idle: logo + Recent Projects + "+ New Quote" button
      const recents = (typeof projects !== 'undefined' ? projects : [])
        .slice()
        .sort(/** @param {any} a @param {any} b */ (a, b) => {
          const av = a.updated_at ? +new Date(a.updated_at) : 0;
          const bv = b.updated_at ? +new Date(b.updated_at) : 0;
          return bv - av;
        });
      host.innerHTML = _renderProjectEmpty({
        title: 'Quotes',
        subtitle: 'Pick a project to start a new quote.',
        pickFnName: '_qPickProjectFromEmpty',
        pickerInputId: 'qe-project-picker',
        pickerSuggestId: 'qe-project-suggest',
        pickerSuggestFn: '_smartQProjectSuggest',
        recentProjects: recents,
        iconSvg: _Q_EMPTY_ICON,
      });
      return;
    }
    // Drafting: project-picker form (reached by clicking "+ New Quote")
    host.innerHTML = `
      <div class="form-section">
        <div class="form-section-title">New Quote</div>
        <div class="form-group" style="position:relative;margin-bottom:8px">
          <label>Project</label>
          <div class="smart-input-wrap">
            <input type="text" id="qe-project-picker" placeholder="Search or add project..." autocomplete="off"
              oninput="_smartQProjectSuggest(this,'qe-project-suggest')"
              onfocus="_smartQProjectSuggest(this,'qe-project-suggest')"
              onblur="setTimeout(()=>{const b=document.getElementById('qe-project-suggest'); if(b)b.style.display='none'},150)">
            <div class="smart-input-add" onclick="_openNewProjectPopup('qe-project-picker')" title="New project">+</div>
          </div>
          <div id="qe-project-suggest" class="client-suggest-list" style="display:none"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;padding:8px 10px;background:var(--surface2);border-radius:6px;line-height:1.5">
          Pick or create a project to start a new quote. The client is set on the project.
        </div>
      </div>`;
    return;
  }

  // ── Active editor (project picked, with or without saved row) ──
  const status = q ? q.status : 'draft';
  const statusBadge = status === 'approved' ? 'badge-green' : status === 'sent' ? 'badge-blue' : 'badge-gray';
  const statusLabel = status === 'approved' ? 'Approved' : status === 'sent' ? 'Sent' : 'Draft';
  const isExisting = !!q;
  const matchingOrder = q ? orders.find(o => o.quote_id === q.id) : null;
  const hasOrder = !!matchingOrder;

  const dateStr = q ? q.date : new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' });

  const colDiscOff = localStorage.getItem('pc_quote_col_disc') === 'off';
  const colHrsOff  = localStorage.getItem('pc_quote_col_hrs')  === 'off';
  const colStockOn = localStorage.getItem('pc_quote_col_stock') === 'on';

  const quoteNum = (q && q.quote_number) || (q ? 'Q-'+String(q.id).padStart(4,'0') : _nextQuoteNumber());
  // quote_number stored without the "Q-" prefix in some cases — strip it for the
  // header input so the user just edits the digits.
  const quoteNumStripped = String(quoteNum).replace(/^Q-/i, '');

  host.innerHTML = `<div class="form-section editor-shell">
    <div class="ed-head">
      <button class="back-btn" onclick="_qChangeProject()" title="Back to quotes" aria-label="Back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
      </button>
      <div class="head-icon">${_CH_ICON_QUOTE}</div>
      <div class="head-text">
        <div class="ed-title-row">
          <span class="order-num" style="font-weight:700;color:var(--text)">#Q-</span><input class="order-num-input" id="pq-quote-number" value="${_escHtml(quoteNumStripped)}" oninput="_qMarkDirty()" aria-label="Quote number">
          <span class="ed-project-name">${_escHtml(projectName || 'Untitled project')}</span>
        </div>
        <div class="ed-sub">
          <span class="ed-client">${_escHtml(clientName || '—')}</span>
          <select class="ed-status" id="pq-status" data-status="${status}" oninput="_qSetStatusBadge(this);_qMarkDirty()">
            <option value="draft" ${status==='draft'?'selected':''}>Draft</option>
            <option value="sent" ${status==='sent'?'selected':''}>Sent</option>
            <option value="approved" ${status==='approved'?'selected':''}>Approved</option>
          </select>
        </div>
      </div>
    </div>

    <div class="cl-section-header">
      <span class="cl-section-title">Line Items</span>
      <div class="pill-group">
        <button class="cl-col-pill ${colDiscOff ? '' : 'active'}" data-col="disc" onclick="_qToggleColumn('disc',this)">Discount</button>
        <button class="cl-col-pill ${colHrsOff ? '' : 'active'}" data-col="hrs" onclick="_qToggleColumn('hrs',this)">Hours</button>
        <button class="cl-col-pill ${colStockOn ? 'active' : ''}" data-col="stock" onclick="_qToggleColumn('stock',this)">Stock</button>
      </div>
    </div>

    <div id="pq-lines" class="editor-li-list"></div>

    <div class="cl-add-row">
      <button class="cl-add-btn" onclick="_qAddLine('cabinet')">+ Cabinet</button>
      <button class="cl-add-btn" onclick="_qAddLine('item')">+ Item</button>
    </div>

    <div class="stock-library ${colStockOn ? 'visible' : ''}" id="pq-stock-library">
      <div class="smart-input-wrap">
        <input type="search" id="pq-stock-search" class="stock-search" placeholder="Search or add stock…" autocomplete="off"
          oninput="_qStockSearch(this.value)" onfocus="_qStockSearch(this.value)">
        <div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new stock item">+</div>
        <div id="pq-stock-suggest" class="stock-suggest"></div>
      </div>
      <div class="stock-markup-row">
        <label>Stock Markup</label>
        <div class="markup-wrap">
          <input type="number" id="pq-stock-markup" value="${(q && /** @type {any} */ (q).stock_markup) ?? 0}" oninput="_renderQuoteLineTotals();_qMarkDirty()">
          <span class="markup-unit">%</span>
        </div>
        <span class="stock-markup-hint">applied to all stock lines</span>
      </div>
    </div>

    <div class="editor-section" style="margin-top:10px;border-top:1px solid var(--border);border-bottom:none;padding-top:10px">
      <div class="editor-section-title">Pricing</div>
      <div class="rates-chips">
        <div class="rate-chip"><span class="chip-label">Tax</span><input type="number" id="pq-tax" value="${(q && q.tax) ?? 13}" oninput="_renderQuoteLineTotals();_qMarkDirty()"><span class="chip-unit">%</span></div>
        <div class="rate-chip"><span class="chip-label">Disc</span><input type="number" id="pq-discount" value="${(q && /** @type {any} */ (q).discount) ?? 0}" oninput="_renderQuoteLineTotals();_qMarkDirty()"><span class="chip-unit">%</span></div>
      </div>
    </div>

    <div class="pf-totals" id="pq-totals" style="margin: 6px 14px 10px"></div>

    <div class="editor-section">
      <div class="editor-section-title">Notes</div>
      <textarea class="pf-textarea" id="pq-notes" rows="3" placeholder="Customer-facing notes shown on the PDF..." oninput="_qMarkDirty()">${_escHtml((q && q.notes)||'')}</textarea>
    </div>

    ${isExisting ? '' : `<div class="editor-footer"><span style="flex:1"></span><button class="btn btn-primary" onclick="createQuoteFromEditor()">+ Create Quote</button></div>`}
  </div>`;

  // After render, populate line list and totals if there's anything to show.
  if (q || _qpState.lines.length > 0) {
    if (typeof _renderQuoteLines === 'function') _renderQuoteLines();
    if (typeof _renderQuoteLineTotals === 'function') _renderQuoteLineTotals();
  }
}

/** Reflect the picked status into the badge's data-status attribute.
 *  @param {HTMLSelectElement} el */
function _qSetStatusBadge(el) { el.setAttribute('data-status', el.value); }

/** Toggle a line-items column (or the stock library) in the quote editor.
 *  Persists state per-tab in localStorage.
 *  @param {string} col @param {HTMLElement} btn */
function _qToggleColumn(col, btn) {
  const table = document.getElementById('pq-lines-table');
  const lib = document.getElementById('pq-stock-library');
  const wasActive = btn.classList.contains('active');
  btn.classList.toggle('active', !wasActive);
  const nowActive = !wasActive;
  if (col === 'stock') {
    if (lib) lib.classList.toggle('visible', nowActive);
    try { localStorage.setItem('pc_quote_col_stock', nowActive ? 'on' : 'off'); } catch (e) {}
    if (!nowActive) {
      const sugg = document.getElementById('pq-stock-suggest');
      if (sugg) sugg.classList.remove('open');
    }
  } else {
    if (table) table.classList.toggle('hide-' + col, !nowActive);
    try { localStorage.setItem('pc_quote_col_' + col, nowActive ? 'on' : 'off'); } catch (e) {}
  }
}

/** Render the stock smart-library suggestions for the quote editor.
 *  @param {string} q */
function _qStockSearch(q) {
  _stockSearchRender(q, 'pq-stock-suggest', /** @param {any} item */ item => {
    _qAddStockLineFromLibrary(item);
  });
}

/** Update the save-status pill + schedule autosave (Strategy C). */
/** @type {ReturnType<typeof setTimeout> | null} */
let _qAutoSaveTimer = null;
function _qMarkDirty() {
  if (!_qpState.dirty) {
    _qpState.dirty = true;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'dirty');
  }
  // Strategy C: only existing quotes autosave; new quotes need explicit + Create.
  if (_qpState.quoteId) {
    if (_qAutoSaveTimer) clearTimeout(_qAutoSaveTimer);
    _qAutoSaveTimer = setTimeout(() => { _qAutoSaveTimer = null; saveQuoteEditor(); }, 600);
  }
}

/** Reset editor to empty state. */
function _qClearEditor() {
  _qpState = { quoteId: null, lines: [], dirty: false, projectId: null, startingNew: false };
  renderQuoteEditor();
}

/** Idle-state click handler: pick a recent project to start a new quote on it.
 *  @param {number} id @param {string} _name */
function _qPickProjectFromEmpty(id, _name) {
  _qpState.projectId = id;
  _qpState.startingNew = false;
  renderQuoteEditor();
}

/** Idle-state click handler: reveal the project-picker form. */
function _qNewQuote() {
  _qpState.startingNew = true;
  renderQuoteEditor();
  setTimeout(() => {
    const el = document.getElementById('qe-project-picker');
    if (el) /** @type {HTMLInputElement} */ (el).focus();
  }, 0);
}

/** Switch project mid-edit (with discard prompt if dirty). */
function _qChangeProject() {
  if (_qpState.dirty) {
    _confirm('Discard unsaved changes?', () => _qClearEditor());
    return;
  }
  _qClearEditor();
}

/** Load an existing quote into the sidebar editor.
 *  Replaces the former _openQuotePopup. Hydrates lines from cache or DB.
 *  @param {number} id */
async function loadQuoteIntoSidebar(id) {
  const q = quotes.find(qx => qx.id === id);
  if (!q) return;
  if (_qpState.dirty && _qpState.quoteId !== id) {
    _confirm('Discard unsaved changes?', () => { _qpState.dirty = false; loadQuoteIntoSidebar(id); });
    return;
  }
  _qpState = {
    quoteId: id,
    lines: Array.isArray(q._lines) ? q._lines.map(/** @param {any} r */ r => ({ ...r })) : [],
    dirty: false,
    projectId: q.project_id || null,
    startingNew: false,
  };
  renderQuoteEditor();
  if (!Array.isArray(q._lines)) {
    const { data } = await _db('quote_lines').select('*').eq('quote_id', id).order('position');
    if (_qpState.quoteId !== id) return;
    if (data) {
      q._lines = data.map(/** @param {any} r */ r => ({ ...r }));
      _qpState.lines = data.map(/** @param {any} r */ r => ({ ...r }));
      renderQuoteEditor();
    }
  }
}

/** Smart-suggest for project picker in the empty-state editor.
 *  Mirrors _smartCBProjectSuggest from cabinet-library.js.
 *  @param {HTMLInputElement} input @param {string} boxId */
function _smartQProjectSuggest(input, boxId) {
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
    const clientName = p.client_id ? (clients.find(c => c.id === p.client_id) || {}).name || '' : '';
    html += `<div class="client-suggest-item" onmousedown="_qPickProject(${p.id})">
      <span class="csi-icon">${_Q_ICON_CABINET}</span>
      <span class="csi-name">${esc(p.name)}</span>
      ${clientName ? `<span class="csi-meta">${esc(clientName)}</span>` : ''}
    </div>`;
  }
  if (val && !matches.some(p => p.name.toLowerCase() === val)) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_openNewProjectPopup('qe-project-picker')">
      <span class="csi-icon">+</span>
      <span class="csi-name">Create project "${esc(input.value.trim())}"</span>
    </div>`;
  }
  if (!html) {
    html = '<div class="client-suggest-empty">No projects yet — click + to create one.</div>';
  }
  box.innerHTML = html;
  box.style.display = 'block';
}

/** @param {number} projectId */
function _qPickProject(projectId) {
  const p = projects.find(pp => pp.id === projectId);
  if (!p) return;
  _qpState = { quoteId: null, lines: [], dirty: false, projectId: p.id, startingNew: false };
  renderQuoteEditor();
}

/** Add a line to the current quote. Auto-creates the quote row if it doesn't exist.
 *  @param {'cabinet'|'item'|'labour'} kind */
async function _qAddLine(kind) {
  if (!_qpState.quoteId) {
    if (!_qpState.projectId) { _toast('Pick or create a project first.', 'error'); return; }
    const ok = await createQuoteFromEditor(/* silent */ true);
    if (!ok) return;
  }
  if (kind === 'cabinet') {
    if (typeof _lineEditCabinet === 'function') _lineEditCabinet(/** @type {number} */ (_qpState.quoteId));
    return;
  }
  if (typeof _lineAdd === 'function') _lineAdd(kind);
  // Re-render editor so tile counts update
  renderQuoteEditor();
}

/** Create a new quote row from current editor state. Returns true on success.
 *  @param {boolean} [silent] suppress toast (used when auto-creating from line add) */
async function createQuoteFromEditor(silent) {
  if (!_userId) { _toast('Sign in first.', 'error'); return false; }
  if (!_qpState.projectId) { _toast('Pick a project first.', 'error'); return false; }
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  if (!_enforceFreeLimit('quotes', customerQuotes.length)) return false;
  const project = projects.find(p => p.id === _qpState.projectId);
  if (!project) { _toast('Project not found.', 'error'); return false; }
  /** @type {any} */
  const qnRaw = _popupVal('pq-quote-number') || '';
  const qnSaved = qnRaw ? (/^Q-/i.test(qnRaw) ? qnRaw : 'Q-' + qnRaw) : null;
  /** @type {any} */
  const row = {
    user_id: _userId,
    project_id: project.id,
    status: _popupVal('pq-status') || 'draft',
    notes: _popupVal('pq-notes') || '',
    // Legacy order-level markup column kept for back-compat; UI no longer exposes it.
    markup: 0,
    tax: parseFloat(_popupVal('pq-tax')) || 13,
    discount: parseFloat(_popupVal('pq-discount')) || 0,
    stock_markup: parseFloat(_popupVal('pq-stock-markup')) || 0,
    quote_number: qnSaved,
    date: new Date().toLocaleDateString('en-GB', { day:'numeric', month:'short' }),
  };
  if (project.client_id) row.client_id = project.client_id;
  const { data, error } = await _dbInsertSafe('quotes', row);
  if (error || !data) { _toast('Could not create quote — ' + ((error && error.message) || ''), 'error'); return false; }
  quotes.unshift(data);
  _qpState.quoteId = data.id;
  _qpState.dirty = false;
  renderQuoteMain();
  renderQuoteEditor();
  if (!silent) _toast('Quote created', 'success');
  return true;
}

/** Save current editor state for the loaded quote. */
async function saveQuoteEditor() {
  if (!_qpState.quoteId) return createQuoteFromEditor();
  const id = /** @type {number} */ (_qpState.quoteId);
  const q = quotes.find(qx => qx.id === id);
  if (!q) return;
  // Strategy C: surface saving status + track in-flight for beforeunload.
  /** @type {any} */ const w = window;
  if (!w._saveInFlight) w._saveInFlight = new Set();
  w._saveInFlight.add('quote');
  if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saving');
  try {
    const status = _popupVal('pq-status');
    const notes = _popupVal('pq-notes');
    const qnRaw = _popupVal('pq-quote-number') || '';
    const quote_number = qnRaw ? (/^Q-/i.test(qnRaw) ? qnRaw : 'Q-' + qnRaw) : null;
    // Legacy markup column not surfaced in the new editor — preserve the existing value.
    const markup = /** @type {any} */ (q).markup ?? 0;
    const tax = parseFloat(_popupVal('pq-tax')) || 0;
    const discount = parseFloat(_popupVal('pq-discount')) || 0;
    const stock_markup = parseFloat(_popupVal('pq-stock-markup')) || 0;
    /** @type {any} */
    const update = { status, notes, quote_number, markup, tax, discount, stock_markup, updated_at: new Date().toISOString() };
    Object.assign(q, update);
    // Flush pending line edits in parallel
    if (typeof _lineUpsertTimers !== 'undefined') {
      for (const t of _lineUpsertTimers.values()) clearTimeout(t);
      _lineUpsertTimers.clear();
    }
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
        schedule_hours: row.schedule_hours ?? null,
        discount: row.discount ?? 0,
      };
      writes.push(/** @type {any} */ (_db('quote_lines').update(u).eq('id', row.id)));
    }
    await Promise.all(writes);
    await _refreshQuoteTotals(id);
    _qpState.dirty = false;
    renderQuoteEditor();
    renderQuoteMain();
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'saved');
  } catch (e) {
    console.warn('[quote save]', (/** @type {any} */ (e)).message || e);
    if (typeof _setSaveStatus === 'function') _setSaveStatus('quote', 'failed', { retry: saveQuoteEditor });
    _toast('Save failed — check connection', 'error');
  } finally {
    w._saveInFlight.delete('quote');
  }
}
