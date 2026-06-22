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

/** Resolve the maker's CURRENT rates into a flat, self-contained snapshot the
 *  `quote-public-update` edge function can re-price a customer's spec edit with —
 *  identically to this browser, but WITHOUT ever shipping cost inputs to the
 *  customer page (stored server-only on `quotes.rate_card`). Prices resolve
 *  through the same `_matPricePerM2` / `_hwUnitPrice` / `_finishPricePerM2`
 *  (stock-first) the calculator uses, so the edge function never re-implements
 *  that logic — only the geometry→cost math is ported (see _shared/costing.ts).
 *  @param {any} q @returns {any} */
function _buildRateCard(q) {
  if (typeof cbSettings === 'undefined' || !cbSettings) return null;
  const cs = /** @type {any} */ (cbSettings);
  const stock = (typeof stockItems !== 'undefined' && Array.isArray(stockItems)) ? stockItems : [];
  // Every name a line could reference now OR after an edit: the full catalogue,
  // all stock items, plus whatever the quote's lines already carry (legacy names).
  const names = new Set();
  (cs.materials || []).forEach(/** @param {any} m */ m => m && m.name && names.add(m.name));
  (cs.hardware || []).forEach(/** @param {any} h */ h => h && h.name && names.add(h.name));
  (cs.finishes || []).forEach(/** @param {any} f */ f => f && f.name && names.add(f.name));
  stock.forEach(/** @param {any} s */ s => s && s.name && names.add(s.name));
  for (const l of (q._lines || [])) {
    [l.material, l.door_material, l.drawer_front_material, l.drawer_inner_material,
     l.finish, l.door_finish, l.drawer_front_finish, l.drawer_box_finish].forEach(n => n && names.add(n));
    [l.hardware, l.door_hardware, l.drawer_hardware].forEach(arr =>
      Array.isArray(arr) && arr.forEach(/** @param {any} h */ h => h && h.name && names.add(h.name)));
  }
  /** @type {Record<string,number>} */ const matPerM2 = {};
  /** @type {Record<string,number>} */ const hwUnit = {};
  /** @type {Record<string,number>} */ const finishPerM2 = {};
  for (const n of names) {
    matPerM2[n] = _matPricePerM2(n);
    hwUnit[n] = _hwUnitPrice(n);
    finishPerM2[n] = _finishPricePerM2(n);
  }
  // Typed name lists for the customer-page spec editor. The public edge functions
  // read these (NOT the dead `catalog_items` table) to BOTH offer the dropdown
  // options and validate the customer's pick — so every option offered is a key
  // in the maps above and therefore priceable (the "offered == priceable ==
  // accepted" invariant auto-accept relies on). Materials mirror the
  // quote-public-get sources: the maker's catalogue + customer-visible stock +
  // any name a line already carries. 'None' is dropped (it's a no-cost default
  // the editor offers implicitly, never a catalogue entry).
  /** @type {Set<string>} */ const matNames = new Set();
  /** @type {Set<string>} */ const finNames = new Set();
  (cs.materials || []).forEach(/** @param {any} m */ m => m && m.name && matNames.add(m.name));
  stock.forEach(/** @param {any} s */ s => s && s.name && s.customer_visible && matNames.add(s.name));
  (cs.finishes || []).forEach(/** @param {any} f */ f => f && f.name && finNames.add(f.name));
  for (const l of (q._lines || [])) {
    [l.material, l.door_material, l.drawer_front_material, l.drawer_inner_material].forEach(n => n && matNames.add(n));
    [l.finish, l.door_finish, l.drawer_front_finish, l.drawer_box_finish].forEach(n => n && n !== 'None' && finNames.add(n));
  }
  return {
    v: 1,
    matPerM2, hwUnit, finishPerM2,
    materialNames: Array.from(matNames),
    finishNames: Array.from(finNames),
    labourRate: Number(cs.labourRate) || 0,
    materialMarkup: Number(cs.materialMarkup) || 0,
    edgingPerM: Number(cs.edgingPerM) || 0,
    contingencyPct: Number(cs.contingencyPct) || 0,
    packagingHours: Number(cs.packagingHours) || 0,
    installationHours: Number(cs.installationHours) || 0,
    labourTimes: cs.labourTimes || {},
    constructions: cs.constructions || [],
    baseTypes: cs.baseTypes || [],
    carcassTypes: cs.carcassTypes || [],
    doorTypes: cs.doorTypes || [],
    drawerFrontTypes: cs.drawerFrontTypes || [],
    drawerBoxTypes: cs.drawerBoxTypes || [],
    extraPanelTypes: cs.extraPanelTypes || [],
    // Quote-level wrapper (matches _shareLineCustomerPrice): pre-tax marked total.
    markup: parseFloat(q.markup) || 0,
    discount: parseFloat(q.discount) || 0,
    stock_markup: parseFloat(q.stock_markup) || 0,
  };
}

/** @param {string} token */
function _shareLink(token) { return `${location.origin}/q.html?t=${token}`; }

/** @param {number} quoteId */
async function _openSharePanel(quoteId) {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  // The share controls moved into the sidebar "Live link" tab — open the quote
  // there instead of the old popup.
  if (typeof switchSection === 'function') switchSection('quote');
  if (typeof loadQuoteIntoSidebar === 'function') await loadQuoteIntoSidebar(quoteId);
  if (typeof switchQuoteTab === 'function') switchQuoteTab('live');
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
      ${tog('sh-pay', 'Accept online payment', 'Pays into your Stripe · <a href="/payment-fees" target="_blank" style="color:var(--accent)">platform fee applies</a>', !!s.accept_payment)}
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

/** @param {number} quoteId @param {'quote'|'order'} [kind] */
async function _generateShareLink(quoteId, kind) {
  if ((kind || 'quote') === 'order') return _generateOrderShareLink(quoteId);
  const q = /** @type {any} */ (quotes.find(x => x.id === quoteId));
  if (!q) return;
  // Backstop: never mint a link for an items-less quote (it would share a blank
  // page). The Live-link panel blocks this earlier; this guards direct callers.
  if (!q.share_token && !(Array.isArray(q._lines) && q._lines.length)) return;
  const wasShared = !!q.share_token;
  // Guard against a debounced autosave (_llAutoSave's 450ms timer) firing after
  // the Live-link panel was torn down — tab switch, editor close, mobile pane
  // change. With the panel gone, every settings read below returns the element's
  // empty/off default and would clobber the saved share_settings: deposit % →0,
  // payment + selection toggles →off, and the per-line flags reset. The settings
  // were already persisted while the panel was live, so bail instead of wiping
  // them. (sh-pay + sh-dep are present whenever the panel or the legacy popup is
  // on screen; sh-dep stays in the DOM even when the deposit row is hidden.)
  if (!document.getElementById('sh-pay') && !document.getElementById('sh-dep')) return;
  const pressed = (/** @type {string} */ id) => { const b = document.getElementById(id); return b ? b.getAttribute('aria-pressed') === 'true' : false; };
  // The deposit + bank-transfer toggles may not be in the DOM (legacy share
  // popup) — fall back to the stored setting so a save from elsewhere never
  // flips them off.
  const depTog = document.getElementById('sh-dep-on');
  const bankTog = document.getElementById('sh-bank');
  // Auto-accept toggle may be absent (legacy popup, or hidden when spec-editing
  // is off) — fall back to the stored setting so a save from elsewhere never
  // flips it. Forced off whenever spec editing itself is off (it's meaningless).
  const autoTog = document.getElementById('sh-auto-accept');
  const allowEdit = pressed('sh-edit');
  const settings = {
    allow_select: pressed('sh-select'),
    allow_edit: allowEdit,
    accept_payment: pressed('sh-pay'),
    allow_bank_transfer: bankTog ? bankTog.getAttribute('aria-pressed') === 'true' : ((q.share_settings || {}).allow_bank_transfer === true),
    take_deposit: depTog ? depTog.getAttribute('aria-pressed') === 'true' : ((q.share_settings || {}).take_deposit !== false),
    deposit_pct: Math.max(0, Math.min(100, parseFloat(_popupVal('sh-dep')) || 0)),
    auto_accept_edits: allowEdit && (autoTog ? autoTog.getAttribute('aria-pressed') === 'true' : ((q.share_settings || {}).auto_accept_edits === true)),
  };
  const token = q.share_token || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 14));
  try {
    await Promise.all((q._lines || []).map(/** @param {any} l */ async (l) => {
      const optEl = /** @type {HTMLInputElement|null} */ (document.getElementById('sh-opt-' + l.id));
      const editable_specs = Array.from(document.querySelectorAll('.ll-spec[data-line="' + l.id + '"]'))
        .filter(/** @param {any} el */ el => el.checked)
        .map(/** @param {any} el */ el => el.getAttribute('data-spec'));
      const optional = optEl ? optEl.checked : false;
      const customer_editable = editable_specs.length > 0;
      const customer_price = _shareLineCustomerPrice(q, l);
      const _upd = await _db('quote_lines').update(/** @type {any} */ ({ optional, customer_editable, customer_included: true, customer_price, editable_specs })).eq('id', l.id);
      if (_upd && _upd.error) {
        // editable_specs column not migrated yet — still save the rest so the link works.
        await _db('quote_lines').update(/** @type {any} */ ({ optional, customer_editable, customer_included: true, customer_price })).eq('id', l.id);
      }
      Object.assign(l, { optional, customer_editable, customer_included: true, customer_price, editable_specs });
    }));
    // Snapshot the resolved rate card so the edge function can re-price customer
    // spec edits server-side (auto-accept). Omit when unavailable rather than
    // clobbering a previously-saved snapshot with null.
    const rate_card = _buildRateCard(q);
    /** @type {any} */ const quotePatch = { share_token: token, share_settings: settings, status: q.status === 'draft' ? 'sent' : q.status };
    if (rate_card) quotePatch.rate_card = rate_card;
    const _qupd = await _db('quotes').update(quotePatch).eq('id', quoteId);
    if (_qupd && _qupd.error && rate_card) {
      // rate_card column not migrated yet — save the link without the snapshot so
      // sharing still works (auto-accept just falls back to "Price to confirm").
      delete quotePatch.rate_card;
      await _db('quotes').update(quotePatch).eq('id', quoteId);
    }
    q.share_token = token; q.share_settings = settings; if (rate_card) q.rate_card = rate_card; if (q.status === 'draft') q.status = 'sent';
    if (typeof _track === 'function' && !wasShared) _track('quote_shared', { accept_payment: settings.accept_payment });
    if (typeof _llOnSaved === 'function') _llOnSaved(wasShared, 'quote');
  } catch (e) {
    if (typeof _llSaveError === 'function') _llSaveError();
  }
}

/** Mint (or refresh) an order's OWN live link: write share_token + share_settings
 *  on the order, plus a customer-safe per-line `customer_price` snapshot. The
 *  live order page renders `customer_price`, so without this every line shows
 *  "—" and the total reads £0 (orders carry the same markup/discount/stock_markup
 *  as quotes, so the same price formula applies). @param {number} orderId */
async function _generateOrderShareLink(orderId) {
  const o = /** @type {any} */ (orders.find(/** @param {any} x */ x => x.id === orderId));
  if (!o) return;
  const wasShared = !!o.share_token;
  const token = o.share_token || (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Math.random().toString(36).slice(2, 14));
  const settings = (o.share_settings && typeof o.share_settings === 'object') ? o.share_settings : {};
  try {
    // Load the order's lines once (the Live-link tab doesn't hydrate them for
    // orders) and snapshot each customer_price, mirroring the quote flow.
    let lines = Array.isArray(o._lines) ? o._lines : null;
    if (!lines) {
      try {
        const { data } = await _db('order_lines').select('*').eq('order_id', orderId).order('position');
        lines = (data || []).map(/** @param {any} r */ r => ({ ...r }));
        o._lines = lines;
      } catch (e) { lines = []; }
    }
    if (typeof _shareLineCustomerPrice === 'function') {
      await Promise.all((lines || []).map(/** @param {any} l */ async (l) => {
        const customer_price = _shareLineCustomerPrice(o, l);
        if (customer_price == null || Number(l.customer_price) === customer_price) return;
        l.customer_price = customer_price;
        await _db('order_lines').update(/** @type {any} */ ({ customer_price })).eq('id', l.id);
      }));
    }
    await _db('orders').update(/** @type {any} */ ({ share_token: token, share_settings: settings })).eq('id', orderId);
    o.share_token = token; o.share_settings = settings;
    if (typeof _track === 'function' && !wasShared) _track('order_shared', {});
    if (typeof _llOnSaved === 'function') _llOnSaved(wasShared, 'order');
  } catch (e) {
    if (typeof _llSaveError === 'function') _llSaveError();
  }
}

/** Open the order's OWN live customer page (mints the link first if needed).
 *  @param {number} orderId */
function _openLiveOrderPage(orderId) {
  const o = /** @type {any} */ (orders).find(/** @param {any} x */ x => x.id === orderId);
  if (!o) { _toast('Order not found', 'error'); return; }
  if (o.share_token) { window.open(_shareLink(o.share_token), '_blank'); return; }
  if (typeof _openLiveLinkTab === 'function') { _openLiveLinkTab('order', orderId); return; }
  _toast('Open the order to set up its live link', 'info');
}

Object.assign(window, { _openSharePanel, _generateShareLink, _generateOrderShareLink, _shareLink, _shTgl, _copyShareLink, _openLiveOrderPage });
