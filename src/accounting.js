// ProCabinet — QuickBooks Online + Xero integration (client side).
//
// Loaded as a classic <script defer> after src/orders.js / src/quotes.js (it
// reuses their _lineDisplay / _lineSubtotal). One-way push, Pro-only:
//   • an ORDER → a DRAFT invoice  (QBO Invoice / Xero invoice)
//   • a QUOTE → a DRAFT estimate  (QBO Estimate / Xero Quote — the pre-sale doc)
// Both go to the same edge function (accounting-push-invoice) with a docType.
//
// Cross-file deps: _sb / _db / _userId (db.js, limits.js), isPro /
// _enforceProFeature (limits.js), _requireAuth (app.js), _toast / _confirm /
// _openPopup / _closePopup / _escHtml (ui.js), _lineDisplay / _lineSubtotal /
// orders / renderOrdersMain / quotes / renderQuoteMain (quotes.js / orders.js),
// _track (analytics.js).

/** @typedef {'quickbooks'|'xero'} AcctProvider */

/** @type {Record<AcctProvider, { label: string, short: string }>} */
const _ACCT_PROVIDERS = {
  quickbooks: { label: 'QuickBooks', short: 'QuickBooks Online' },
  xero: { label: 'Xero', short: 'Xero' },
};

// In-memory mirror of the user's connections + order/quote → external-doc links.
// Hydrated by loadAccountingConnections() on boot and after connect/disconnect/push.
/** @type {Array<{ provider: string, org_name: string|null, status: string, default_tax_code: string|null }>} */
let _accountingConnections = [];
/** @typedef {{ order_id: number|null, quote_id: number|null, provider: string, external_url: string|null, external_number: string|null, status: string|null }} AcctLink */
/** @type {Record<number, AcctLink[]>} */
let _accountingLinksByOrder = {};
/** @type {Record<number, AcctLink[]>} */
let _accountingLinksByQuote = {};

// ── Boot hydrate ────────────────────────────────────────────────────────────
async function loadAccountingConnections() {
  _accountingConnections = [];
  _accountingLinksByOrder = {};
  _accountingLinksByQuote = {};
  if (!_userId) return;
  try {
    // Explicit safe columns — the *_enc token columns are revoked from the
    // client at the DB level, so a select('*') would be denied. Both queries
    // may already be in flight via the early boot fetch (src/main.js) —
    // _earlyBootOr falls back to the _db() query on any miss/error.
    const { data: conns } = await _earlyBootOr('accounting_connections', _userId,
      () => _db('accounting_connections').select('provider, org_name, status, default_tax_code'));
    _accountingConnections = /** @type {any} */ (conns || []);
  } catch (_e) { /* table not present yet / offline — stay empty */ }
  try {
    const { data: links } = await _earlyBootOr('accounting_invoice_links', _userId,
      () => _db('accounting_invoice_links').select('order_id, quote_id, provider, external_url, external_number, status'));
    /** @type {Record<number, any[]>} */
    const byOrder = {};
    /** @type {Record<number, any[]>} */
    const byQuote = {};
    (links || []).forEach(/** @param {any} l */ l => {
      if (l.quote_id != null) (byQuote[l.quote_id] = byQuote[l.quote_id] || []).push(l);
      else if (l.order_id != null) (byOrder[l.order_id] = byOrder[l.order_id] || []).push(l);
    });
    _accountingLinksByOrder = byOrder;
    _accountingLinksByQuote = byQuote;
  } catch (_e) { /* ditto — older schema (pre-quote_id) still selects order_id */ }
}

/** @returns {Array<{ provider: string, org_name: string|null, status: string, default_tax_code: string|null }>} */
function _accountingConnected() {
  return _accountingConnections.filter(c => c.status === 'connected');
}

// ── Edge-function call (Bearer JWT, mirrors src/stripe.js) ───────────────────
/** @param {string} name @param {any} body @returns {Promise<any>} */
async function _accountingFn(name, body) {
  // In-memory token (db.js `_dbAuthToken`), not `_sb.auth.getSession()` — the
  // storage-based session goes stale on Safari / in-app webviews → 401.
  const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
  if (!token) throw new Error('Sign in to use accounting integrations');
  const res = await fetch(`${window._SBURL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'apikey': window._SBKEY, 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  /** @type {any} */
  let payload = {};
  try { payload = await res.json(); } catch (_e) { /* non-JSON */ }
  if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
  return payload;
}

// ── Connect / disconnect ─────────────────────────────────────────────────────
/** @param {AcctProvider} provider */
async function connectAccounting(provider) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  const meta = _ACCT_PROVIDERS[provider];
  try {
    if (typeof _track === 'function') _track('accounting_connect_started', { provider });
    const { url } = await _accountingFn('accounting-oauth-start', { provider });
    if (!url) throw new Error('No authorization URL returned');
    window.location.href = url; // hand off to the provider's consent screen
  } catch (e) {
    _toast((/** @type {Error} */ (e)).message || `Could not connect ${meta.label}`, 'error');
  }
}

/** @param {AcctProvider} provider */
function disconnectAccounting(provider) {
  const meta = _ACCT_PROVIDERS[provider];
  _confirm(`Disconnect <strong>${meta.label}</strong>? New invoices won't sync until you reconnect.`, async () => {
    try {
      await _accountingFn('accounting-disconnect', { provider });
      if (typeof _track === 'function') _track('accounting_disconnected', { provider });
      _toast(`${meta.label} disconnected`, 'success');
      await loadAccountingConnections();
      _openAccountingPopup();             // re-render the popup in place
      _accountingRerenderCards();
    } catch (e) {
      _toast((/** @type {Error} */ (e)).message || 'Disconnect failed', 'error');
    }
  });
}

// ── Return-from-OAuth handler (mirrors handleCheckoutReturn) ─────────────────
function handleAccountingReturn() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('accounting');
  if (!status) return;
  const provider = params.get('provider') || '';
  const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[provider];
  const label = meta ? meta.label : 'Accounting';
  if (status === 'connected') {
    _toast(`${label} connected.`, 'success');
    if (typeof _track === 'function') _track('accounting_connected', { provider });
    setTimeout(() => {
      loadAccountingConnections().then(() => { _accountingRerenderCards(); });
    }, 500);
  } else if (status === 'error') {
    _toast(`Could not connect ${label}. Please try again.`, 'error');
  }
  params.delete('accounting');
  params.delete('provider');
  const cleaned = params.toString();
  const newUrl = window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash;
  window.history.replaceState({}, '', newUrl);
}

// ── Settings popup ───────────────────────────────────────────────────────────
function _openAccountingPopup() {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  _openPopup(_accountingPopupHtml(), 'md');
}

function _accountingPopupHtml() {
  /** @param {AcctProvider} provider */
  const card = (provider) => {
    const meta = _ACCT_PROVIDERS[provider];
    const c = _accountingConnections.find(x => x.provider === provider && x.status === 'connected');
    const head = `<div style="display:flex;align-items:center;gap:10px;min-width:0">
      <div style="width:34px;height:34px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);flex:none">${meta.label[0]}</div>
      <div style="min-width:0">`;
    if (c) {
      const org = c.org_name ? _escHtml(c.org_name) : meta.short;
      const tax = c.default_tax_code
        ? `Tax code <code>${_escHtml(c.default_tax_code)}</code>`
        : 'No tax rate set — lines push tax-free';
      return `<div class="acct-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
        ${head}
          <div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${meta.label}</div>
          <div style="font-size:11px;color:var(--muted)">Connected to <strong>${org}</strong> · ${tax}</div>
        </div></div>
        <button class="btn btn-outline btn-sm" style="flex:none" onclick="disconnectAccounting('${provider}')">Disconnect</button>
      </div>`;
    }
    return `<div class="acct-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:10px">
      ${head}
        <div style="font-weight:600;font-size:13px">${meta.label}</div>
        <div style="font-size:11px;color:var(--muted)">Not connected</div>
      </div></div>
      <button class="btn btn-primary btn-sm" style="flex:none" onclick="connectAccounting('${provider}')">Connect</button>
    </div>`;
  };
  return `<div class="popup-header">
      <div class="popup-title">Accounting integrations</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <p style="font-size:12px;color:var(--muted);margin:0 0 14px">Push straight into your accounting system as a <strong>draft</strong> you review before sending: an <strong>order</strong> becomes a draft invoice, a <strong>quote</strong> becomes a draft estimate (QuickBooks) / quote (Xero). Tokens are encrypted; we never see your QuickBooks/Xero password.</p>
      ${card('quickbooks')}
      ${card('xero')}
    </div>`;
}

// ── Push an order ─────────────────────────────────────────────────────────────
/**
 * Build the invoice line payload from an order + its lines, mirroring the
 * Invoice PDF's totals (src/cutlist.js _buildOrderDocPDF) so the pushed figures
 * match. Cabinet costs come from the cached _lineSubtotal/_lineDisplay — the
 * same source the PDF uses — which is why the lines are computed client-side.
 *
 * @param {any} o order row @param {any[]} rows order_lines
 * @returns {{ lines: Array<{description:string,amount:number}>, taxApplies: boolean }}
 */
function _accountingBuildLines(o, rows) {
  /** @type {Array<{description:string,amount:number}>} */
  const lines = [];
  // Markup lives in the Cabinet Builder: it's baked into the cabinet line
  // amounts and never pushed as its own line (PLAN.md 2026-07-14). Items/labour
  // get no markup; stock keeps its own stock_markup line below.
  const markupPct = Number(o.markup) || 0;
  let sub = 0, stockMat = 0;
  rows.forEach(/** @param {any} row */ row => {
    const d = _lineDisplay(row);
    const amount = (row.line_kind || 'cabinet') === 'cabinet' ? d.total * (1 + markupPct / 100) : d.total;
    const desc = d.detail ? `${d.name} — ${d.detail}` : d.name;
    lines.push({ description: desc, amount });
    sub += amount;
    if (row.line_kind === 'stock') stockMat += _lineSubtotal(row).materials;
  });
  const stockMarkupPct = Number(o.stock_markup) || 0;
  const stockMarkupAmt = stockMat * stockMarkupPct / 100;
  if (stockMarkupAmt > 0) lines.push({ description: `Stock markup (${stockMarkupPct}%)`, amount: stockMarkupAmt });
  const afterMarkup = sub + stockMarkupAmt;
  const discPct = Number(o.discount) || 0;
  const discAmt = afterMarkup * discPct / 100;   // pushed pre-tax as a negative line (see SPEC § 13)
  if (discAmt > 0) lines.push({ description: `Discount (${discPct}%)`, amount: -discAmt });
  const taxApplies = (Number(o.tax) || 0) > 0;
  return { lines, taxApplies };
}

/** Re-render whichever card grids exist (order + quote). */
function _accountingRerenderCards() {
  try { renderOrdersMain(); } catch (_e) {}
  try { if (typeof renderQuoteMain === 'function') renderQuoteMain(); } catch (_e) {}
}

/**
 * Push an order (→ invoice) or quote (→ estimate) to the given provider.
 * @param {'order'|'quote'} kind @param {number} id @param {AcctProvider} provider
 */
async function _accountingPush(kind, id, provider) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  const isQuote = kind === 'quote';
  const doc = (isQuote ? quotes : orders).find(/** @param {any} x */ x => x.id === id);
  if (!doc) { _toast(`${isQuote ? 'Quote' : 'Order'} not found`, 'error'); return; }
  const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[provider] || { label: provider };
  _toast(`Sending to ${meta.label}…`, 'info', 8000);
  try {
    const table = isQuote ? 'quote_lines' : 'order_lines';
    const fk = isQuote ? 'quote_id' : 'order_id';
    // Dynamic table+column: cast the builder to loosen the typed-client generics
    // (the union table/column cross-product includes combos tsc can't reconcile).
    const { data: rows } = await (/** @type {any} */ (_db(table))).select('*').eq(fk, id).order('position');
    const { lines, taxApplies } = _accountingBuildLines(doc, /** @type {any} */ (rows) || []);
    if (!lines.length) { _toast(`This ${isQuote ? 'quote' : 'order'} has no line items to send`, 'error'); return; }
    const resp = await _accountingFn('accounting-push-invoice', { docType: kind, id, provider, lines, taxApplies });
    if (typeof _track === 'function') _track('accounting_doc_pushed', { provider, doc_type: isQuote ? 'estimate' : 'invoice' });
    // Optimistic link cache so the "Synced" chip appears immediately.
    const store = isQuote ? _accountingLinksByQuote : _accountingLinksByOrder;
    const arr = (store[id] || []).filter(l => l.provider !== provider);
    arr.push({ order_id: isQuote ? null : id, quote_id: isQuote ? id : null, provider, external_url: resp.external_url, external_number: resp.external_number, status: 'draft' });
    store[id] = arr;
    _accountingRerenderCards();
    const num = resp.external_number ? ` ${resp.external_number}` : '';
    _toast(`Draft ${isQuote ? 'estimate' : 'invoice'}${num} created in ${meta.label}.`, 'success');
  } catch (e) {
    _toast((/** @type {Error} */ (e)).message || 'Push to accounting failed', 'error');
  }
}

/** @param {number} orderId @param {AcctProvider} provider */
function pushOrderToAccounting(orderId, provider) { return _accountingPush('order', orderId, provider); }
/** @param {number} quoteId @param {AcctProvider} provider */
function pushQuoteToAccounting(quoteId, provider) { return _accountingPush('quote', quoteId, provider); }

/**
 * Card entry point: route by how many providers are connected.
 * @param {'order'|'quote'} kind @param {number} id
 */
function _accountingSync(kind, id) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  const isQuote = kind === 'quote';
  const noun = isQuote ? 'estimate' : 'invoice';
  const connected = _accountingConnected();
  if (connected.length === 0) {
    _toast('Connect QuickBooks or Xero first', 'info');
    _openAccountingPopup();
    return;
  }
  if (connected.length === 1) { _accountingPush(kind, id, /** @type {AcctProvider} */ (connected[0].provider)); return; }
  // Both connected — pick one.
  const btns = connected.map(c => {
    const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[c.provider] || { label: c.provider };
    return `<button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="_closePopup();_accountingPush('${kind}',${id},'${c.provider}')">Send to ${meta.label}</button>`;
  }).join('');
  _openPopup(`<div class="popup-header"><div class="popup-title">Send ${noun} to…</div><button class="popup-close" onclick="_closePopup()">&times;</button></div><div class="popup-body">${btns}</div>`, 'sm');
}

/** Order-card entry point (kept for the src/orders.js onclick). @param {number} orderId */
function _accountingSyncMenu(orderId) { _accountingSync('order', orderId); }
/** Quote-card entry point. @param {number} quoteId */
function _accountingSyncMenuQuote(quoteId) { _accountingSync('quote', quoteId); }

/**
 * HTML for a card footer: a "Synced" chip per existing link + the Sync button.
 * Rendered inline by src/orders.js / src/quotes.js (guarded by typeof).
 * @param {'order'|'quote'} kind @param {number} id @returns {string}
 */
function _accountingCardFooter(kind, id) {
  const isQuote = kind === 'quote';
  const links = (isQuote ? _accountingLinksByQuote : _accountingLinksByOrder)[id] || [];
  const syncFn = isQuote ? '_accountingSyncMenuQuote' : '_accountingSyncMenu';
  const chips = links.map(l => {
    const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[l.provider] || { label: l.provider };
    const title = `Synced to ${meta.label}${l.external_number ? ' · ' + l.external_number : ''}`;
    const href = l.external_url || '#';
    return `<a href="${_escHtml(href)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${_escHtml(title)}" style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:3px 7px;border-radius:10px;background:var(--success);color:#fff;text-decoration:none">✓ ${meta.label}</a>`;
  }).join('');
  return `${chips}<button class="btn btn-outline" onclick="event.stopPropagation();${syncFn}(${id})" style="font-size:11px;padding:5px 8px;width:auto" title="Send to QuickBooks / Xero">Sync ▾</button>`;
}

/** Order-card footer (kept for the src/orders.js call). @param {number} orderId @returns {string} */
function _accountingOrderFooter(orderId) { return _accountingCardFooter('order', orderId); }
/** Quote-card footer. @param {number} quoteId @returns {string} */
function _accountingQuoteFooter(quoteId) { return _accountingCardFooter('quote', quoteId); }
