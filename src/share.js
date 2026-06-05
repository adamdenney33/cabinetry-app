// ProCabinet — Share a live quote. Mints a share_token, sets share_settings,
// snapshots a customer-safe per-line customer_price, and produces the /q link.
// A new module so the large quotes.js needs only a one-line footer hook.
//
// customer_price = (line cost, with stock_markup for stock lines) × (1 + markup)
// × (1 − quote discount) — the line's share of the pre-tax marked total, so the
// public page only adds tax. The customer never receives the cost inputs.
//
// Cross-file deps: _db (db.js), _requireAuth (app.js), _enforceProFeature
// (limits.js), _toast / _openPopup / _closePopup / _popupVal / _escHtml (ui.js),
// quotes / _lineSubtotal / renderQuoteMain (quotes.js), _track (analytics.js).

/** @param {any} q @param {any} row @returns {number} */
function _shareLineCustomerPrice(q, row) {
  const sub = _lineSubtotal(row);
  let base = (sub.materials || 0) + (sub.labour || 0);
  if (row.line_kind === 'stock') base = (sub.materials || 0) * (1 + (parseFloat(q.stock_markup) || 0) / 100);
  const marked = base * (1 + (parseFloat(q.markup) || 0) / 100) * (1 - (parseFloat(q.discount) || 0) / 100);
  return Math.round(marked * 100) / 100;
}

/** @param {string} token */
function _shareLink(token) { return `${location.origin}/q.html?t=${token}`; }

/** @param {number} quoteId */
async function _openSharePanel(quoteId) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  const q = /** @type {any} */ (quotes.find(x => x.id === quoteId));
  if (!q) { _toast('Quote not found', 'error'); return; }
  if (!q._lines) {
    try {
      const { data } = await _db('quote_lines').select('*').eq('quote_id', quoteId).order('position');
      q._lines = (data || []).map(/** @param {any} r */ r => ({ ...r }));
    } catch (e) { q._lines = []; }
  }
  _openPopup(_sharePanelHtml(q), 'lg');
}

/** @param {any} q @returns {string} */
function _sharePanelHtml(q) {
  const s = q.share_settings || {};
  const shared = !!q.share_token;
  const linkBox = shared
    ? `<div class="link-box" style="margin-bottom:8px"><code id="share-link">${_escHtml(_shareLink(q.share_token))}</code><button class="btn btn-primary" style="width:auto;font-size:11px;padding:6px 10px" onclick="_copyShareLink()">Copy</button></div>
       <div style="display:flex;gap:8px;margin-bottom:14px"><a class="btn btn-outline" style="font-size:12px;width:auto" href="${_escHtml(_shareLink(q.share_token))}" target="_blank">↗ Preview as customer</a></div>`
    : '';
  const tog = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ on) =>
    `<div class="share-toggle-row"><div><div class="st-label">${label}</div><div class="st-desc">${desc}</div></div><button class="mini-toggle" id="${id}" aria-pressed="${on ? 'true' : 'false'}" onclick="_shTgl(this)"></button></div>`;
  const lineRows = (q._lines || []).map(/** @param {any} l */ l =>
    `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--border2)">
      <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(l.name || 'Item')}</div></div>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)"><input type="checkbox" id="sh-opt-${l.id}" ${l.optional ? 'checked' : ''}> Optional</label>
      <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--muted)"><input type="checkbox" id="sh-edit-${l.id}" ${l.customer_editable ? 'checked' : ''}> Editable</label>
    </div>`).join('') || '<div style="font-size:12px;color:var(--muted);padding:8px 0">No line items on this quote yet.</div>';
  return `<div class="popup-header"><div class="popup-title">Share live quote${q.quote_number ? ' · ' + _escHtml(q.quote_number) : ''}</div><button class="popup-close" onclick="_closePopup()">&times;</button></div>
    <div class="popup-body">
      ${linkBox}
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:2px">What the customer can do</div>
      ${tog('sh-select', 'Allow item selection', 'Include / exclude optional lines', s.allow_select !== false)}
      ${tog('sh-edit', 'Allow spec editing', 'Unlocked lines: change finish &amp; size', !!s.allow_edit)}
      ${tog('sh-pay', 'Accept card payment', 'Pays into your Stripe · platform fee applies', !!s.accept_payment)}
      <div class="share-toggle-row"><div><div class="st-label">Take a deposit</div><div class="st-desc">% due to confirm the order</div></div>
        <div style="display:flex;align-items:center;gap:6px"><input type="number" id="sh-dep" value="${s.deposit_pct != null ? s.deposit_pct : 40}" min="0" max="100" style="width:54px;text-align:right;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);font-family:inherit"><span style="color:var(--muted)">%</span></div></div>
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:14px 0 2px">Per-line controls</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Tick which lines the customer may toggle off or edit.</div>
      ${lineRows}
    </div>
    <div class="popup-footer" style="padding:14px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-outline" style="width:auto" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" style="width:auto" onclick="_generateShareLink(${q.id})">${shared ? 'Update &amp; copy link' : 'Generate link'}</button>
    </div>`;
}

/** @param {HTMLElement} b */
function _shTgl(b) { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); }

function _copyShareLink() {
  const el = document.getElementById('share-link');
  if (el && navigator.clipboard) { navigator.clipboard.writeText(el.textContent || ''); _toast('Link copied', 'success'); }
}

/** @param {number} quoteId */
async function _generateShareLink(quoteId) {
  const q = /** @type {any} */ (quotes.find(x => x.id === quoteId));
  if (!q) return;
  const pressed = (/** @type {string} */ id) => { const b = document.getElementById(id); return b ? b.getAttribute('aria-pressed') === 'true' : false; };
  const settings = {
    allow_select: pressed('sh-select'),
    allow_edit: pressed('sh-edit'),
    accept_payment: pressed('sh-pay'),
    deposit_pct: Math.max(0, Math.min(100, parseFloat(_popupVal('sh-dep')) || 0)),
  };
  const token = q.share_token || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 14));
  try {
    for (const l of (q._lines || [])) {
      const optEl = /** @type {HTMLInputElement|null} */ (document.getElementById('sh-opt-' + l.id));
      const edEl = /** @type {HTMLInputElement|null} */ (document.getElementById('sh-edit-' + l.id));
      const optional = optEl ? optEl.checked : false;
      const customer_editable = edEl ? edEl.checked : false;
      const customer_price = _shareLineCustomerPrice(q, l);
      await _db('quote_lines').update(/** @type {any} */ ({ optional, customer_editable, customer_included: true, customer_price })).eq('id', l.id);
      Object.assign(l, { optional, customer_editable, customer_included: true, customer_price });
    }
    await _db('quotes').update(/** @type {any} */ ({ share_token: token, share_settings: settings, status: q.status === 'draft' ? 'sent' : q.status })).eq('id', quoteId);
    q.share_token = token; q.share_settings = settings; if (q.status === 'draft') q.status = 'sent';
    if (typeof _track === 'function') _track('quote_shared', { accept_payment: settings.accept_payment });
    _openPopup(_sharePanelHtml(q), 'lg');   // re-render with the link box
    _copyShareLink();
    try { renderQuoteMain(); } catch (e) { /* tab may not be mounted */ }
    _toast('Live link ready — copied to clipboard', 'success');
  } catch (e) {
    _toast('Could not generate the link (is the schema migration applied?)', 'error');
  }
}

/** Open the live customer page for an order — reuse the originating quote's /q
 *  link (one link per deal, evolving quote→order). Falls back to the Share panel
 *  so the business can mint it if the quote hasn't been shared yet.
 *  @param {number} orderId */
function _openLiveOrderPage(orderId) {
  const o = /** @type {any} */ (orders).find(/** @param {any} x */ x => x.id === orderId);
  if (!o) { _toast('Order not found', 'error'); return; }
  const lq = /** @type {any} */ (quotes).find(/** @param {any} q */ q => q.id === o.quote_id);
  if (lq && lq.share_token) { window.open(_shareLink(lq.share_token), '_blank'); return; }
  if (o.quote_id && typeof _openSharePanel === 'function') { _openSharePanel(o.quote_id); return; }
  _toast('Share the originating quote to open its live page', 'info');
}

Object.assign(window, { _openSharePanel, _generateShareLink, _shareLink, _shTgl, _copyShareLink, _openLiveOrderPage });
