// ProCabinet — Quotes state + view (carved out of src/app.js in phase E carve 4)
//
// Loaded as a classic <script defer> BEFORE src/app.js (state declarations
// here — `quotes`, `quoteNextId` — are referenced from app.js at load
// time inside function bodies, but the bindings need to exist when those
// functions are eventually called).
//
// The sidebar drill-in editor (renderQuoteEditor, loadQuoteIntoSidebar,
// saveQuoteEditor, client picker, printQuote/printOrderDoc dispatch) lives in
// src/quote-editor.js — this file keeps the data (quotes array), statuses,
// totals, lifecycle CRUD (duplicateQuote, removeQuote, convertQuoteToOrder),
// the list view and CSV import/export.
//
// Cross-file dependencies referenced from this file's functions: clients
// (clients.js), orders (orders.js), _db / _dbInsertSafe / _userId (db.js),
// _requireAuth (app.js), _toast / _csvParse / _csvCol (ui.js), _escHtml
// (cabinet.js), _onSet / _oqSet (stock-persist.js), renderQuoteEditor /
// loadQuoteIntoSidebar (quote-editor.js), _quoteLineRowToCB (migrate.js),
// calcCBLine (cabinet-calc.js), renderOrdersMain (orders.js), switchSection
// (settings.js).

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

// One status vocabulary everywhere: the pipeline's manual stages are
// Draft → Sent → Accepted ("Approved" was the old manual word for the same
// stage — kept as a read alias below so legacy rows display identically).
const QUOTE_STATUSES = ['draft','sent','accepted'];
const QUOTE_STATUS_LABELS = { draft:'Draft', sent:'Sent', accepted:'Accepted' };
const QUOTE_STATUS_COLORS = { draft:'#94a3b8', sent:'#1565c0', accepted:'var(--success)' };

// Live-link lifecycle → how the card renders it. The live-link edge functions
// write richer statuses than the 3-step pipeline knows (viewed/accepted/
// deposit_paid/paid). `stage` collapses them onto the existing Draft→Sent→
// Approved pipeline, while `label`/`badge` carry the granular state so the card
// shows what the customer actually did. `_quoteStatusMeta` is the single source
// of truth — used by every quote status-render site (card, sidebar, client
// detail, cabinet builder). Globally visible to the other classic-script files.
/** @type {Record<string, { label: string, badge: string, stage: number }>} */
const QUOTE_STATUS_META = {
  draft:        { label: 'Draft',        badge: 'badge-gray',  stage: 0 },
  sent:         { label: 'Sent',         badge: 'badge-blue',  stage: 1 },
  viewed:       { label: 'Viewed',       badge: 'badge-blue',  stage: 1 },
  accepted:     { label: 'Accepted',     badge: 'badge-green', stage: 2 },
  approved:     { label: 'Accepted',     badge: 'badge-green', stage: 2 }, // legacy alias — same word everywhere
  deposit_paid: { label: 'Deposit paid', badge: 'badge-green', stage: 2 },
  paid:         { label: 'Paid',         badge: 'badge-green', stage: 2 },
};
/** @param {string | null} [s] */
function _quoteStatusMeta(s) { return QUOTE_STATUS_META[s || 'draft'] || QUOTE_STATUS_META.draft; }
/** Short "2 Jun"-style date for live-link activity stamps. @param {string} ts */
function _fmtLLDate(ts) {
  try { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); }
  catch (e) { return ''; }
}

// FK-resolving display helpers. After Phase 7 the legacy text columns are gone,
// so an unresolved FK simply returns ''.
/** @param {any} q */
function quoteClient(q) {
  if (!q || !q.client_id) return '';
  const c = clients.find(x => x.id === q.client_id);
  return c ? c.name : '';
}
// F5 (2026-05-13): The "project name" that used to come from a projects-table
// lookup is now stored directly on the quote/order row as `name` (backfilled
// from projects.name in F2). The legacy function names are kept so the ~25
// call sites across cabinet/dashboard/cutlist/schedule don't churn.
/** @param {any} q */
function quoteProject(q) { return q && q.name ? q.name : ''; }
/** @param {any} o */
function orderClient(o) {
  if (!o || !o.client_id) return '';
  const c = clients.find(x => x.id === o.client_id);
  return c ? c.name : '';
}
/** @param {any} o */
function orderProject(o) { return o && o.name ? o.name : ''; }

// Format helpers for any place a quote/order number is shown alongside an
// identifier — recents lists, smart-suggest dropdowns, picker items, client
// card rows. Pass `{ client: false }` when client context is already implied
// (e.g. inside a client-scoped card or a client-filtered dropdown).
/** @param {any} q @param {{client?: boolean}} [opts] */
function _quoteLabel(q, opts) {
  if (!q) return '';
  const o = opts || {};
  const num = q.quote_number || ('QUO-' + String(q.id || 0).padStart(4, '0'));
  const proj = quoteProject(q) || '';
  const cli = o.client === false ? '' : (quoteClient(q) || '');
  return [num, cli, proj].filter(Boolean).join(' · ');
}
/** @param {any} o @param {{client?: boolean}} [opts] */
function _orderLabel(o, opts) {
  if (!o) return '';
  const opt = opts || {};
  const num = o.order_number || ('ORD-' + String(o.id || 0).padStart(4, '0'));
  const proj = orderProject(o) || '';
  const cli = opt.client === false ? '' : (orderClient(o) || '');
  return [num, cli, proj].filter(Boolean).join(' · ');
}

// ── Legacy draft-quote guard (Item 2; hidden-draft model removed 2026-05-18) ──
// The Cabinet Builder used to autosave into a hidden 'designing'-status quote
// that was excluded from the Quotes tab, client cards, dashboard, and CSV
// exports. That hidden state was removed: the builder now creates a normal
// 'draft' quote (see _findOrCreateDraftQuote) and tracks it via
// cbEditingQuoteId, so a quote built in the Cabinet Builder is first-class and
// visible everywhere immediately. _isDraftQuote is kept only to hide any
// pre-existing 'designing' / [CB_DRAFT] rows created before this change.
const CB_DRAFT_TAG = '[CB_DRAFT]';

/** @param {{notes?: string | null, status?: string | null} | null | undefined} q */
function _isDraftQuote(q) {
  if (!q) return false;
  if (q.status === 'designing') return true;
  // Legacy guard — should be zero rows after F3 migration applied 2026-05-13.
  return typeof q.notes === 'string' && q.notes.startsWith(CB_DRAFT_TAG);
}

/**
 * Create a fresh draft quote for the Cabinet Builder to autosave into. The
 * builder adopts it via cbEditingQuoteId, so it behaves like any other quote
 * and shows in the Quotes tab immediately. Returns null if no user is signed
 * in or no client id is supplied.
 * @param {number | null | undefined} clientId
 */
async function _findOrCreateDraftQuote(clientId) {
  if (!_userId || !clientId) return null;
  const insertBody = {
    user_id: _userId,
    client_id: clientId,
    quote_number: _nextQuoteNumber(),
    status: 'draft',
    markup: (typeof cbSettings !== 'undefined' && cbSettings && cbSettings.markup) ?? 0,
    tax: (typeof cbSettings !== 'undefined' && cbSettings && cbSettings.tax) ?? 0,
    date: new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await _db('quotes').insert(insertBody).select().single();
  if (error || !data) {
    _toast('Could not create quote.', 'error');
    return null;
  }
  quotes.unshift(data);
  return data;
}

// Compute the next sequential quote number. Looks at both the trailing
// integer in any existing `quote_number` strings and the DB `id` values, so
// the new number stays ahead of both. Format: `QUO-NNNN` (4-digit padded).
function _nextQuoteNumber() {
  let max = 0;
  for (const q of quotes) {
    if (_isDraftQuote(q)) continue;
    if (typeof q.id === 'number' && q.id < 0) continue; // sample data — QUO-1042… must not seed the user's own sequence
    if (q.quote_number) {
      const m = String(q.quote_number).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    if (q.id) max = Math.max(max, q.id);
  }
  return 'QUO-' + String(max + 1).padStart(4, '0');
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
  // One batched query for every quote's lines, instead of one fetch per quote
  // (the per-quote loop was an N+1). Lines are grouped by quote_id in memory;
  // q._lines and q._totals are populated to match the old per-quote behaviour.
  const need = quotes.filter(q => !q._totals);
  if (!need.length) return;
  const { data: lines, error } = await _db('quote_lines').select('*')
    .in('quote_id', need.map(q => q.id)).order('position');
  if (error || !lines) {
    console.warn('[quote totals] hydrate failed:', error && error.message);
    return;
  }
  /** @type {Record<number, any[]>} */
  const byQuote = {};
  for (const row of lines) (byQuote[row.quote_id] || (byQuote[row.quote_id] = [])).push(row);
  for (const q of need) {
    const rows = (byQuote[q.id] || []).map(/** @param {any} r */ r => ({ ...r }));
    q._lines = rows;
    if (!rows.length) continue;
    try {
      let materials = 0, labour = 0, stockMat = 0;
      for (const row of rows) {
        const sub = _lineSubtotal(row);
        materials += sub.materials;
        labour += sub.labour;
        if (row.line_kind === 'stock') stockMat += sub.materials;
      }
      const totals = { materials, labour, stockMat };
      q._totals = totals;
    } catch (e) {
      console.warn('[quote totals] compute failed for', q.id, (/** @type {any} */ (e)).message || e);
    }
  }
}

async function _hydrateOrderLines() {
  // One batched query for every order's lines (was an N+1: one fetch per
  // order). Pre-caches o._lines so order popups open without a network wait.
  const need = orders.filter(o => !(/** @type {any} */ (o)._lines));
  if (!need.length) return;
  const { data: lines, error } = await _db('order_lines').select('*')
    .in('order_id', need.map(o => o.id)).order('position');
  if (error || !lines) {
    console.warn('[order lines] hydrate failed:', error && error.message);
    return;
  }
  /** @type {Record<number, any[]>} */
  const byOrder = {};
  for (const row of lines) (byOrder[row.order_id] || (byOrder[row.order_id] = [])).push(row);
  for (const o of need) {
    /** @type {any} */ (o)._lines = (byOrder[o.id] || []).map(/** @param {any} r */ r => ({ ...r }));
  }
}

/** Build a "2 cabinets · 1 item · 3 stock" caption from a quote/order's
 *  cached line rows. Returns empty string when the cache is missing or empty.
 *  @param {any[] | undefined} lines */
function _lineKindCountsLabel(lines) {
  if (!Array.isArray(lines) || !lines.length) return '';
  let cab = 0, item = 0, stock = 0;
  for (const l of lines) {
    if (!l) continue;
    const k = l.line_kind;
    const qty = Math.max(1, parseInt(l.qty, 10) || 1);
    if (k === 'stock') stock += qty;
    else if (k === 'item') item += qty;
    else cab += qty;
  }
  const parts = [];
  if (cab) parts.push(`${cab} cabinet${cab !== 1 ? 's' : ''}`);
  if (item) parts.push(`${item} item${item !== 1 ? 's' : ''}`);
  if (stock) parts.push(`${stock} stock`);
  return parts.join(' · ');
}
/** @type {any} */ (window)._lineKindCountsLabel = _lineKindCountsLabel;

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
  // The Cabinet Builder shows the same quotes as clickable cards (the quote
  // picker). Refresh it too so a quote deleted from that tab disappears
  // immediately instead of lingering until the next page load.
  if (typeof renderCBResults === 'function') { try { renderCBResults(); } catch (e) {} }
}

/** @param {number} id */
async function convertQuoteToOrder(id) {
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('orders', _realCount(orders))) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const { error: qErr } = await _db('quotes').update({ status: 'accepted' }).eq('id', id);
  if (qErr) { _toast('Could not update quote — ' + (qErr.message || JSON.stringify(qErr)), 'error'); console.error(qErr); return; }
  q.status = 'accepted';
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
  if (q.name) orderRow.name = q.name;
  const { data, error: oErr } = await _dbInsertSafe('orders', orderRow);
  if (oErr || !data) { _toast('Could not create order — ' + (oErr?.message || JSON.stringify(oErr)), 'error'); console.error(oErr); return; }
  if (typeof _track === 'function') _track('library_item_created', { library: 'orders', item_id: data.id, source: 'quote_conversion' });
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
  // The realtime channel (_subscribeLiveStatus) can deliver this row's INSERT
  // and unshift it while the line-copy above is still awaiting — guard so the
  // new order doesn't appear twice in the list until the next reload.
  const _rtCopy = orders.find(o => o.id === data.id);
  if (_rtCopy) Object.assign(_rtCopy, data);
  else orders.unshift(data);
  /** @type {HTMLElement} */ (_byId('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  _toast(`Order created for ${quoteClient(q)} — ${quoteProject(q)}`, 'success');
  renderQuoteMain();
  switchSection('orders');
}

/** @param {number} id @param {string} status */
// Statuses written by the CUSTOMER's live page / payment webhook. A manual
// pipeline click shouldn't silently destroy these facts.
const _QUOTE_CUSTOMER_STATUSES = ['viewed', 'accepted', 'deposit_paid', 'paid'];

/** Plain-language line about what the customer did, for confirm dialogs.
 *  @param {any} q @returns {string} */
function _quoteCustomerFact(q) {
  if (q.status === 'paid') return 'The customer has <strong>paid in full</strong> on the live page';
  if (q.status === 'deposit_paid') return 'The customer has <strong>paid a deposit</strong> on the live page';
  if (q.status === 'accepted') return 'The customer <strong>accepted</strong> this quote' + (q.accepted_at ? ' on ' + _fmtLLDate(q.accepted_at) : '');
  if (q.status === 'viewed') return 'The customer <strong>viewed</strong> this quote' + (q.viewed_at ? ' on ' + _fmtLLDate(q.viewed_at) : '');
  return '';
}

/** @param {number} id @param {string} status */
async function setQuoteStatus(id, status) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  if (q.status === status) return;
  const curMeta = _quoteStatusMeta(q.status);
  const newMeta = _quoteStatusMeta(status);
  const customerDriven = _QUOTE_CUSTOMER_STATUSES.includes(q.status || '');
  // Same pipeline stage but the current status is richer (viewed ⊃ sent,
  // deposit_paid ⊃ accepted): the richer truth wins — nothing to change.
  if (customerDriven && newMeta.stage === curMeta.stage) return;
  // Walking a customer-driven status backwards is a deliberate choice, not a
  // mis-click: confirm with what actually happened.
  if (customerDriven && newMeta.stage < curMeta.stage) {
    _confirm(
      `${_quoteCustomerFact(q)}. Move it back to <strong>${newMeta.label}</strong>?` +
      `<br><br><span style="font-size:11px;color:var(--muted)">This only changes the status on your cards — payments and the customer's page aren't affected.</span>`,
      () => { _applyQuoteStatus(q, status); });
    return;
  }
  await _applyQuoteStatus(q, status);
}

/** Write + render a manual status change. @param {any} q @param {string} status */
async function _applyQuoteStatus(q, status) {
  await _db('quotes').update({ status }).eq('id', q.id);
  q.status = status;
  if (status === 'accepted') _toast('Quote marked as accepted', 'success');
  renderQuoteMain();
}

function renderQuoteMain() {
  const cur = window.currency;
  const el = _byId('quote-main');
  if (!el) return;
  // Live-link tab owns the main pane (the customer-preview iframe). A realtime
  // echo of our own settings autosave — or any background refresh — must not
  // clobber it with the cards grid; _llSwitch repaints the cards on tab exit.
  if (typeof _llTab !== 'undefined' && _llTab.quote === 'live'
      && typeof _qpState !== 'undefined' && _qpState && _qpState.quoteId != null) return;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  // Drill-down: when the sidebar editor has a client picked, scope this list
  // to that client. If the client has been deleted, clear the stale state.
  const drillClientId = (typeof _qpState !== 'undefined' && _qpState) ? _qpState.clientId : null;
  let drillClient = drillClientId ? clients.find(c => c.id === drillClientId) : null;
  if (drillClientId && !drillClient) { _qpState.clientId = null; drillClient = null; }
  // Hide CB drafts — they're Cabinet Builder workspace state, not customer quotes.
  const customerQuotes = quotes
    .filter(q => !_isDraftQuote(q))
    .filter(q => !drillClient || q.client_id === drillClient.id);
  // Bucket by pipeline stage so the live-link statuses (viewed→Sent,
  // accepted/deposit_paid/paid→Approved) count under the right tab.
  const draft = customerQuotes.filter(q => _quoteStatusMeta(q.status).stage === 0).length;
  const sent = customerQuotes.filter(q => _quoteStatusMeta(q.status).stage === 1).length;
  const approved = customerQuotes.filter(q => _quoteStatusMeta(q.status).stage === 2).length;

  /** @param {any} q */
  const qCard = q => {
    const total = quoteTotal(q);
    const _qm = _quoteStatusMeta(q.status);
    const statusText = _qm.label;
    // ONE status display: the pipeline. Its active step carries the granular
    // state word + date — no badge duplicating the same fact in the corner.
    // Live-link events and manual clicks land in the same place, so the card
    // reads identically with or without a live link.
    const _stDate = (q.status === 'viewed' && q.viewed_at) ? _fmtLLDate(q.viewed_at)
      : ((q.status === 'accepted' || q.status === 'approved') && q.accepted_at) ? _fmtLLDate(q.accepted_at)
      : '';
    // Quiet nudge while a live link is out but unopened. Shows nothing for
    // makers who don't use live links at all.
    const _linkHint = (q.share_token && !q.viewed_at && !q.accepted_at && _qm.stage < 2)
      ? '<span class="qc-link-hint" title="The live link exists but the customer hasn’t opened it yet">Link live · not viewed yet</span>'
      : '';
    const pName = quoteProject(q);
    const cName = quoteClient(q);
    // Fall back to the id-derived number (matching PDF/orders/dashboard) so a
    // quote still lacking a stored quote_number — e.g. older cabinet-builder
    // drafts — never renders without one. Skip for negative-id demo/overlay
    // rows, which carry their own quote_number.
    const qNumStr = q.quote_number || (typeof q.id === 'number' && q.id > 0 ? 'QUO-' + String(q.id).padStart(4, '0') : '');
    const qNum = qNumStr ? `${_escHtml(qNumStr)} · ` : '';
    const titleText = pName && cName
      ? `${qNum}${_escHtml(cName)} · ${_escHtml(pName)}`
      : `${qNum}${_escHtml(pName || cName || '')}`;
    const lineCounts = _lineKindCountsLabel(q._lines);
    const curIdx = _qm.stage;
    const pipe = QUOTE_STATUSES.map((s, i) => {
      const done = i < curIdx;
      const active = i === curIdx;
      const color = active ? (/** @type {Record<string,string>} */ (QUOTE_STATUS_COLORS))[s] : done ? 'var(--success)' : 'var(--border)';
      // The ACTIVE step shows the granular status word (Viewed / Deposit paid /
      // Paid) so the pipeline and the badge always say the same thing; the
      // other steps keep their stage names as click targets.
      const stageLabel = (/** @type {Record<string,string>} */ (QUOTE_STATUS_LABELS))[s];
      const label = active ? statusText : stageLabel;
      const title = active ? 'Current stage' : `Set to ${stageLabel}`;
      return `<div class="pipe-step ${active?'pipe-active':''}${done?' pipe-done':''}" data-idx="${i}" data-hover-color="${(/** @type {Record<string,string>} */(QUOTE_STATUS_COLORS))[s]}" onmouseenter="pipePreview(this)" onmouseleave="pipeRestorePreview(this)" onclick="event.stopPropagation();setQuoteStatus(${q.id},'${s}')" style="cursor:pointer" title="${title}">
        <div class="pipe-dot" data-orig-color="${color}" style="background:${color};border-color:${color}"></div>
        <div class="pipe-label">${label}</div>${active && _stDate ? `<div class="pipe-date">${_stDate}</div>` : ''}
      </div>${i < QUOTE_STATUSES.length-1 ? `<div class="pipe-line ${done?'pipe-line-done':''}"></div>` : ''}`;
    }).join('');
    const isEditing = q.id === _qpState.quoteId;
    return `
    <div class="quote-card${isEditing ? ' editing' : ''}" style="cursor:pointer" onclick="loadQuoteIntoSidebar(${q.id})">
      <div class="qc-header">
        <div class="oc-info">
          <div class="oc-title-row">
            <div class="qc-title">${titleText}${isEditing ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</div>
          </div>
          ${(q.date || lineCounts || _linkHint) ? `<div class="qc-meta">${[[q.date, lineCounts].filter(Boolean).join(' · '), _linkHint].filter(Boolean).join(' · ')}</div>` : ''}
        </div>
        <div class="oc-right">
          <div class="oc-value" style="cursor:default;border-bottom:none">${fmt(total)}</div>
        </div>
      </div>
      ${q.notes ? `<div style="border-top:1px solid var(--border2);padding:8px 16px;background:var(--surface)">
        ${q.notes.split(/\r?\n/).filter(/** @param {string} l */ l => l).slice(0,3).map(/** @param {string} line */ line =>
          '<div style="font-size:11px;color:var(--text2);margin-bottom:2px">' + _escHtml(line) + '</div>'
        ).join('')}
        ${q.notes.split(/\r?\n/).filter(/** @param {string} l */ l => l).length > 3 ? '<div style="font-size:10px;color:var(--muted)">…</div>' : ''}
      </div>` : ''}
      <div class="oc-pipeline">${pipe}</div>
      <div class="qc-footer">
        <button class="btn btn-outline" onclick="event.stopPropagation();printQuote(${q.id},'pdf')">PDF</button>
        ${typeof _openLiveLinkTab === 'function' ? `<button class="btn btn-outline" onclick="event.stopPropagation();_openLiveLinkTab('quote',${q.id})" title="Open the live link page">Live link</button>` : (typeof _openSharePanel === 'function' ? `<button class="btn btn-outline" onclick="event.stopPropagation();_openSharePanel(${q.id})">Live link</button>` : '')}
        ${typeof _toggleQuoteThread === 'function' ? (() => { const _u = typeof _dealUnreadCount === 'function' ? _dealUnreadCount('quote', q.id) : 0; const _cls = typeof _dealMsgBtnClass === 'function' ? _dealMsgBtnClass('quote', q.id) : 'btn btn-outline'; return `<button class="${_cls}" data-msg-btn-quote="${q.id}" onclick="event.stopPropagation();_toggleQuoteThread(${q.id})">Messages <span data-quote-unread="${q.id}">${_u ? `(${_u})` : ''}</span></button>`; })() : ''}
        <span style="flex:1"></span>
        ${(() => { const matchingOrder = orders.find(o => o.quote_id === q.id); return matchingOrder ? `<button class="btn btn-outline" onclick="event.stopPropagation();_openOrderPopup(${matchingOrder.id})" style="color:var(--success)">✓ View Order</button>` : `<button class="btn btn-outline" onclick="event.stopPropagation();convertQuoteToOrder(${q.id})">Create Order</button>`; })()}
        <button class="btn btn-outline" onclick="event.stopPropagation();duplicateQuote(${q.id})">Duplicate</button>
        <button class="btn btn-outline" style="color:var(--danger)" onclick="event.stopPropagation();_confirm('Delete quote for <strong>${_escHtml(quoteClient(q))}</strong>?',()=>removeQuote(${q.id}))">Delete</button>
      </div>
      <div class="oc-thread" data-quote-thread="${q.id}" style="display:none" onclick="event.stopPropagation()"></div>
    </div>`;
  };

  const emptyState = `<div class="empty-state">
    <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
    <h3>No quotes yet</h3><p>Fill in the form on the left to create your first quote.</p></div>`;

  const qFilter = window._quoteFilter || 'all';
  const qSearch = (window._quoteSearch || '').toLowerCase().trim();
  const qSort = window._quoteSort || 'newest';
  let filteredQ = [...customerQuotes];
  // Match the tab's pipeline stage (draft/sent/approved), so a viewed quote
  // shows under Sent and accepted/paid quotes show under Approved.
  if (qFilter !== 'all') {
    const wantStage = _quoteStatusMeta(qFilter).stage;
    filteredQ = filteredQ.filter(q => _quoteStatusMeta(q.status).stage === wantStage);
  }
  if (qSearch) filteredQ = filteredQ.filter(q => (quoteClient(q) + ' ' + quoteProject(q)).toLowerCase().includes(qSearch));
  if (qSort === 'value') filteredQ.sort((a,b) => quoteTotal(b) - quoteTotal(a));
  else if (qSort === 'client') filteredQ.sort((a,b) => (quoteClient(a)||'').localeCompare(quoteClient(b)||''));

  const filterBar = `<div class="lib-filter-row">
    <input class="lib-filter-input" type="search" placeholder="Search client or project…" value="${window._quoteSearch||''}" oninput="window._quoteSearch=this.value;renderQuoteMain()">
    <button class="btn btn-outline lib-filter-btn" onclick="event.stopPropagation();exportQuotesCSV()">&darr; Export</button>
    <button class="btn btn-outline lib-filter-btn" onclick="event.stopPropagation();importQuotesCSV()">&uarr; Import</button>
  </div>
  <div class="lib-toggle-row">
    <button class="ofilter-tab ${qFilter==='all'?'active':''}" onclick="window._quoteFilter='all';renderQuoteMain()">All (${customerQuotes.length})</button>
    <button class="ofilter-tab ${qFilter==='draft'?'active':''}" onclick="window._quoteFilter='draft';renderQuoteMain()">Draft (${draft})</button>
    <button class="ofilter-tab ${qFilter==='sent'?'active':''}" onclick="window._quoteFilter='sent';renderQuoteMain()">Sent (${sent})</button>
    <button class="ofilter-tab ${qFilter==='accepted'?'active':''}" onclick="window._quoteFilter='accepted';renderQuoteMain()">Accepted (${approved})</button>
    <select class="lib-sort-select" style="margin-left:auto" onchange="window._quoteSort=this.value;renderQuoteMain()">
      <option value="newest" ${qSort==='newest'?'selected':''}>Newest first</option>
      <option value="value" ${qSort==='value'?'selected':''}>Value</option>
      <option value="client" ${qSort==='client'?'selected':''}>Client</option>
    </select>
  </div>`;

  const header = drillClient
    ? _renderProjectHeader('quotes', {
        name: drillClient.name,
        exitFn: '_qChangeClient',
        iconSvg: _CH_ICON_QUOTE.replace('ch-icon', 'ph-icon'),
        addOnclick: '_qNewQuote()',
      })
    : _renderContentHeader({ iconSvg: _CH_ICON_QUOTE, title: 'Quotes', addOnclick: '_qNewQuote()' });

  const noMatchMsg = drillClient
    ? '<div class="empty-state" style="padding:40px 0"><p style="color:var(--muted)">No quotes for this client yet.</p></div>'
    : '<div class="empty-state" style="padding:40px 0"><p style="color:var(--muted)">No quotes match this filter.</p></div>';

  el.innerHTML = `<div style="max-width:800px;margin:0 auto">
    ${header}
    ${customerQuotes.length === 0 && !drillClient ? emptyState : filterBar + `<div class="quote-list">${filteredQ.map(qCard).join('')}${filteredQ.length === 0 ? noMatchMsg : ''}</div>`}
  </div>`;
}


// ── CSV import / export ──
async function exportQuotesCSV() {
  if (!_enforceProFeature()) return;
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  if (!customerQuotes.length) { _toast('No quotes to export', 'error'); return; }
  // Ensure totals are hydrated before reading them — boot hydration
  // (_hydrateQuoteTotals, fired from app.js) may not have resolved yet, and the
  // legacy q.materials/q.labour fallback reads 0 for post-migration quotes, so
  // an early export would emit £0 Materials/Labour/Total to a customer-facing CSV.
  if (typeof _hydrateQuoteTotals === 'function') { try { await _hydrateQuoteTotals(); } catch (e) { /* fall back to per-quote values */ } }
  /** @type {any[][]} */
  const rows = [['Quote #','Client','Project','Materials','Labour','Markup %','Tax %','Discount %','Stock Markup %','Status','Date','Notes','Total']];
  customerQuotes.forEach(q => {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    rows.push([
      q.quote_number||'', quoteClient(q), quoteProject(q), matVal, labVal,
      q.markup, q.tax, /** @type {any} */ (q).discount ?? 0, /** @type {any} */ (q).stock_markup ?? 0,
      q.status, q.date, q.notes||'', quoteTotal(q).toFixed(2),
    ]);
  });
  _csvDownload(rows, `quotes-${new Date().toISOString().slice(0,10)}.csv`);
  _toast('Quotes exported', 'success');
}
function importQuotesCSV() {
  if (!_enforceProFeature()) return;
  _csvPickFile(async rows => {
    const col = _csvCol(rows[0], {
      number:      ['quote', 'quotenumber', 'quoteno', 'number'],
      client:      ['client', 'clientname', 'customer'],
      project:     ['project', 'projectname', 'name'],
      materials:   ['materials', 'material'],
      labour:      ['labour', 'labor'],
      markup:      ['markup'],
      tax:         ['tax', 'taxvat', 'vat'],
      discount:    ['discount'],
      stockMarkup: ['stockmarkup'],
      status:      ['status'],
      date:        ['date'],
      notes:       ['notes', 'note'],
    });
    // Headerless file → legacy import order (Client, Project, Materials,
    // Labour, Markup, Tax, Discount, Status, Date, Notes).
    /** @type {Record<string, number>} */
    const legacy = { client:0, project:1, materials:2, labour:3, markup:4, tax:5, discount:6, status:7, date:8, notes:9 };
    const start = col ? 1 : 0;
    /** @param {string[]} r @param {string} key */
    const get = (r, key) => col ? col(r, key) : (legacy[key] !== undefined ? (r[legacy[key]] ?? '').trim() : '');
    /** @param {string} v */
    const statusKey = v => {
      const s = (v || '').trim().toLowerCase();
      if (!s) return 'draft';
      if (/** @type {any} */ (QUOTE_STATUS_LABELS)[s]) return s;
      const byLabel = Object.keys(QUOTE_STATUS_LABELS).find(k => /** @type {any} */ (QUOTE_STATUS_LABELS)[k].toLowerCase() === s);
      return byLabel || 'draft';
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
      // `materials`/`labour` are no longer columns on `quotes` (derived from
      // quote_lines since the schema normalisation) — the £ values from the
      // CSV become two quote_lines below so totals survive the round-trip.
      const mat = num(get(r, 'materials')) ?? 0;
      const lab = num(get(r, 'labour')) ?? 0;
      /** @type {any} */
      const row = {
        user_id: _userId,
        quote_number: get(r, 'number') || _nextQuoteNumber(),
        markup: num(get(r, 'markup')) ?? 20,
        tax: num(get(r, 'tax')) ?? 13,
        discount: num(get(r, 'discount')) ?? 0,
        stock_markup: num(get(r, 'stockMarkup')) ?? 0,
        status: statusKey(get(r, 'status')),
        date: get(r, 'date') || new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
        notes: get(r, 'notes') || '',
      };
      if (client_id) row.client_id = client_id;
      if (project) row.name = project;
      if (_userId) {
        const { data } = await _db('quotes').insert(row).select().single();
        if (!data) continue;
        // Uniform key set on both rows — PostgREST rejects bulk inserts whose
        // rows don't share identical keys ("All object keys must match").
        /** @type {any[]} */
        const lineRows = [];
        if (mat) lineRows.push({ quote_id: data.id, user_id: _userId, position: 0, line_kind: 'item', name: 'Imported materials', qty: 1, unit_price: mat, labour_hours: null });
        if (lab) lineRows.push({ quote_id: data.id, user_id: _userId, position: 1, line_kind: 'labour', name: 'Imported labour', qty: 1, unit_price: lab, labour_hours: 1 });
        const q = /** @type {any} */ (data);
        if (lineRows.length) {
          const { data: lines } = await _db('quote_lines').insert(lineRows).select();
          q._lines = (lines || []).map(/** @param {any} l */ l => ({ ...l }));
          q._totals = { materials: mat, labour: lab, stockMat: 0 };
        }
        quotes.unshift(q); imported++;
      }
    }
    _toast(imported+' quotes imported','success'); renderQuoteMain();
  });
}



/** @param {number} id */
async function duplicateQuote(id) {
  if (!_requireAuth()) return;
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  if (!_enforceFreeLimit('quotes', _realCount(customerQuotes))) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  /** @type {any} */
  const row = { user_id: _userId, markup: q.markup, tax: q.tax, status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}), notes: q.notes || '' };
  if (q.client_id) row.client_id = q.client_id;
  if (q.name) row.name = q.name;
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

