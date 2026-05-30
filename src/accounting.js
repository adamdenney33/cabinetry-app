// ProCabinet — QuickBooks Online + Xero invoice integration (client side).
//
// Loaded as a classic <script defer> after src/orders.js / src/quotes.js (it
// reuses their _lineDisplay / _lineSubtotal). One-way push: turn an order into a
// DRAFT invoice in the user's connected accounting system. Pro-only.
//
// Cross-file deps: _sb / _db / _userId (db.js, limits.js), isPro /
// _enforceProFeature (limits.js), _requireAuth (app.js), _toast / _confirm /
// _openPopup / _closePopup / _escHtml (ui.js), _lineDisplay / _lineSubtotal /
// orders / renderOrdersMain (quotes.js / orders.js), _track (analytics.js).

/** @typedef {'quickbooks'|'xero'} AcctProvider */

/** @type {Record<AcctProvider, { label: string, short: string }>} */
const _ACCT_PROVIDERS = {
  quickbooks: { label: 'QuickBooks', short: 'QuickBooks Online' },
  xero: { label: 'Xero', short: 'Xero' },
};

// In-memory mirror of the user's connections + order→invoice links. Hydrated by
// loadAccountingConnections() on boot and after connect/disconnect/push.
/** @type {Array<{ provider: string, org_name: string|null, status: string, default_tax_code: string|null }>} */
let _accountingConnections = [];
/** @type {Record<number, Array<{ order_id: number, provider: string, external_url: string|null, external_number: string|null, status: string|null }>>} */
let _accountingLinksByOrder = {};

// ── Boot hydrate ────────────────────────────────────────────────────────────
async function loadAccountingConnections() {
  _accountingConnections = [];
  _accountingLinksByOrder = {};
  if (!_userId) return;
  try {
    // Explicit safe columns — the *_enc token columns are revoked from the
    // client at the DB level, so a select('*') would be denied.
    const { data: conns } = await _db('accounting_connections')
      .select('provider, org_name, status, default_tax_code');
    _accountingConnections = /** @type {any} */ (conns || []);
  } catch (_e) { /* table not present yet / offline — stay empty */ }
  try {
    const { data: links } = await _db('accounting_invoice_links')
      .select('order_id, provider, external_url, external_number, status');
    /** @type {Record<number, any[]>} */
    const map = {};
    (links || []).forEach(/** @param {any} l */ l => { (map[l.order_id] = map[l.order_id] || []).push(l); });
    _accountingLinksByOrder = map;
  } catch (_e) { /* ditto */ }
}

/** @returns {Array<{ provider: string, org_name: string|null, status: string, default_tax_code: string|null }>} */
function _accountingConnected() {
  return _accountingConnections.filter(c => c.status === 'connected');
}

// ── Edge-function call (Bearer JWT, mirrors src/stripe.js) ───────────────────
/** @param {string} name @param {any} body @returns {Promise<any>} */
async function _accountingFn(name, body) {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) throw new Error('Sign in to use accounting integrations');
  const res = await fetch(`${window._SBURL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${session.access_token}`, 'content-type': 'application/json' },
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
      try { renderOrdersMain(); } catch (_e) {}
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
      loadAccountingConnections().then(() => { try { renderOrdersMain(); } catch (_e) {} });
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
      <p style="font-size:12px;color:var(--muted);margin:0 0 14px">Push an order's invoice straight into your accounting system as a <strong>draft</strong> — you review and send it from there. Tokens are encrypted; we never see your QuickBooks/Xero password.</p>
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
  let sub = 0, stockMat = 0;
  rows.forEach(/** @param {any} row */ row => {
    const d = _lineDisplay(row);
    const desc = d.detail ? `${d.name} — ${d.detail}` : d.name;
    lines.push({ description: desc, amount: d.total });
    sub += d.total;
    if (row.line_kind === 'stock') stockMat += _lineSubtotal(row).materials;
  });
  const stockMarkupPct = Number(o.stock_markup) || 0;
  const stockMarkupAmt = stockMat * stockMarkupPct / 100;
  if (stockMarkupAmt > 0) lines.push({ description: `Stock markup (${stockMarkupPct}%)`, amount: stockMarkupAmt });
  const subWithStock = sub + stockMarkupAmt;
  const markupPct = Number(o.markup) || 0;
  const markupAmt = subWithStock * markupPct / 100;
  if (markupAmt > 0) lines.push({ description: `Markup (${markupPct}%)`, amount: markupAmt });
  const afterMarkup = subWithStock + markupAmt;
  const discPct = Number(o.discount) || 0;
  const discAmt = afterMarkup * discPct / 100;   // pushed pre-tax as a negative line (see SPEC § 13)
  if (discAmt > 0) lines.push({ description: `Discount (${discPct}%)`, amount: -discAmt });
  const taxApplies = (Number(o.tax) || 0) > 0;
  return { lines, taxApplies };
}

/** @param {number} orderId @param {AcctProvider} provider */
async function pushOrderToAccounting(orderId, provider) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  const o = orders.find(x => x.id === orderId);
  if (!o) { _toast('Order not found', 'error'); return; }
  const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[provider] || { label: provider };
  _toast(`Sending to ${meta.label}…`, 'info', 8000);
  try {
    const { data: rows } = await _db('order_lines').select('*').eq('order_id', orderId).order('position');
    const { lines, taxApplies } = _accountingBuildLines(o, /** @type {any} */ (rows) || []);
    if (!lines.length) { _toast('This order has no line items to invoice', 'error'); return; }
    const resp = await _accountingFn('accounting-push-invoice', { orderId, provider, lines, taxApplies });
    if (typeof _track === 'function') _track('accounting_invoice_pushed', { provider });
    // Optimistic link cache so the "Synced" chip appears immediately.
    const arr = (_accountingLinksByOrder[orderId] || []).filter(l => l.provider !== provider);
    arr.push({ order_id: orderId, provider, external_url: resp.external_url, external_number: resp.external_number, status: 'draft' });
    _accountingLinksByOrder[orderId] = arr;
    try { renderOrdersMain(); } catch (_e) {}
    const num = resp.external_number ? ` ${resp.external_number}` : '';
    _toast(`Draft invoice${num} created in ${meta.label}.`, 'success');
  } catch (e) {
    _toast((/** @type {Error} */ (e)).message || 'Push to accounting failed', 'error');
  }
}

/** Order-card entry point: route by how many providers are connected. @param {number} orderId */
function _accountingSyncMenu(orderId) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  const connected = _accountingConnected();
  if (connected.length === 0) {
    _toast('Connect QuickBooks or Xero first', 'info');
    _openAccountingPopup();
    return;
  }
  if (connected.length === 1) { pushOrderToAccounting(orderId, /** @type {AcctProvider} */ (connected[0].provider)); return; }
  // Both connected — pick one.
  const btns = connected.map(c => {
    const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[c.provider] || { label: c.provider };
    return `<button class="btn btn-primary" style="width:100%;margin-bottom:8px" onclick="_closePopup();pushOrderToAccounting(${orderId},'${c.provider}')">Send to ${meta.label}</button>`;
  }).join('');
  _openPopup(`<div class="popup-header"><div class="popup-title">Send invoice to…</div><button class="popup-close" onclick="_closePopup()">&times;</button></div><div class="popup-body">${btns}</div>`, 'sm');
}

/**
 * HTML for the order card: a "Synced" chip per existing link + the Sync button.
 * Rendered inline by src/orders.js (guarded by typeof).
 * @param {number} orderId @returns {string}
 */
function _accountingOrderFooter(orderId) {
  const links = _accountingLinksByOrder[orderId] || [];
  const chips = links.map(l => {
    const meta = (/** @type {any} */ (_ACCT_PROVIDERS))[l.provider] || { label: l.provider };
    const title = `Synced to ${meta.label}${l.external_number ? ' · ' + l.external_number : ''}`;
    const href = l.external_url || '#';
    return `<a href="${_escHtml(href)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="${_escHtml(title)}" style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:3px 7px;border-radius:10px;background:var(--success);color:#fff;text-decoration:none">✓ ${meta.label}</a>`;
  }).join('');
  return `${chips}<button class="btn btn-outline" onclick="event.stopPropagation();_accountingSyncMenu(${orderId})" style="font-size:11px;padding:5px 8px;width:auto" title="Send to QuickBooks / Xero">Sync ▾</button>`;
}
