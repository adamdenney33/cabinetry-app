// ProCabinet — "Live link" sidebar sub-tab.
//
// Turns the quote/order sidebar editor into a two-tab surface: "Quote builder"
// (the existing editor) and "Live link" — a controls panel in the sidebar plus
// a live preview of the customer /q page (with a two-way chat launcher) rendered
// into the main pane. Replaces the old _openSharePanel popup.
//
// An ORDER is independently shareable: it carries its OWN share_token /
// share_settings and its live page is view-only (the customer reviews items +
// messages, but can't re-select or re-spec — that all happens on the quote).
//
// Cross-file deps: quotes/orders/clients (arrays), _qpState (quotes.js) /
// _opState (orders.js), _db/_userId (db.js), _toast/_escHtml/_openPopup/
// _closePopup (ui.js), _shareLink/_generateShareLink/_copyShareLink/_shTgl
// (share.js), _openClientChat (clients-chat.js), renderQuoteMain/renderQuoteEditor
// (quotes.js), renderOrdersMain/renderOrderEditor (orders.js), printOrderDoc
// (quotes.js), _lineDisplay (quotes.js).

/** @type {{quote:'builder'|'live', order:'builder'|'live'}} */
let _llTab = { quote: 'builder', order: 'builder' };

/** Reset to the builder tab (call when a different record opens). @param {'quote'|'order'} kind */
function _llReset(kind) { _llTab[kind] = 'builder'; }

/** The record that backs the live link for this section: a quote for 'quote',
 *  and the order ITSELF for 'order' (orders are independently shareable — they
 *  carry their own share_token / share_settings). @param {'quote'|'order'} kind @returns {any} */
function _llShareQuote(kind) {
  if (kind === 'quote') return _qpState.quoteId ? quotes.find(/** @param {any} q */ q => q.id === _qpState.quoteId) : null;
  return _opState.orderId ? orders.find(/** @param {any} x */ x => x.id === _opState.orderId) : null;
}

/** Client id for the conversation in this section. @param {'quote'|'order'} kind */
function _llClientId(kind) {
  if (kind === 'quote') { const q = _llShareQuote('quote'); return q ? q.client_id : null; }
  const o = _opState.orderId ? orders.find(/** @param {any} x */ x => x.id === _opState.orderId) : null;
  return o ? o.client_id : null;
}

/** Ensure the controls' line rows are loaded. Quotes load quote_lines; orders
 *  are view-only on the live page (lines render server-side) so we skip.
 *  `force` refetches even when a cache exists — the boot-time cache goes stale
 *  the moment a CUSTOMER edits a spec on the live page (quote_lines isn't in
 *  the realtime publication), so the Live-link tab always loads fresh rows.
 *  @param {any} entity @param {'quote'|'order'} [kind] @param {boolean} [force] */
async function _llEnsureLines(entity, kind, force) {
  if (!entity || kind === 'order') return (entity && entity._lines) || [];
  if (force || !Array.isArray(entity._lines)) {
    try {
      const { data } = await _db('quote_lines').select('*').eq('quote_id', entity.id).order('position');
      entity._lines = (data || []).map(/** @param {any} r */ r => ({ ...r }));
    } catch (e) { entity._lines = entity._lines || []; }
  }
  return entity._lines;
}

// ── Tab bar (rendered by renderQuoteEditor / renderOrderEditor) ───────────────
/** @param {'quote'|'order'} kind @returns {string} */
function _llTabBar(kind) {
  const p = kind === 'quote' ? 'ql' : 'ol';
  const live = _llTab[kind] === 'live';
  const builderLabel = kind === 'quote' ? 'Quote builder' : 'Order builder';
  const tab = (/** @type {string} */ id, /** @type {string} */ label, /** @type {boolean} */ on, /** @type {string} */ fn) =>
    `<div class="ll-tab${on ? ' active' : ''}" id="${id}" onclick="${fn}">${label}</div>`;
  return `<div class="ll-tabs">
    ${tab(`${p}-tab-builder`, builderLabel, !live, `switch${kind === 'quote' ? 'Quote' : 'Order'}Tab('builder')`)}
    ${tab(`${p}-tab-live`, 'Live link', live, `switch${kind === 'quote' ? 'Quote' : 'Order'}Tab('live')`)}
  </div>`;
}

/** The empty live-body div the panel fills. @param {'quote'|'order'} kind @returns {string} */
function _llLiveBodyDiv(kind) {
  const id = kind === 'quote' ? 'ql-live-body' : 'ol-live-body';
  return `<div id="${id}"${_llTab[kind] === 'live' ? '' : ' style="display:none"'}></div>`;
}

/** Keep each line's customer-facing `customer_price` in sync with the quote's
 *  CURRENT figures every time the Live-link tab opens. customer_price is a
 *  snapshot, so it goes stale when the business edits a line after sharing (or
 *  shares while a line is still £0) — the customer then sees a wrong/zero total.
 *  Recompute from `_shareLineCustomerPrice` (price-only — never touches
 *  share_settings, unlike _generateShareLink which reads the settings DOM) and
 *  write only the lines whose price actually changed. @param {any} q */
async function _llSyncCustomerPrices(q) {
  if (!q || !q.share_token || typeof _shareLineCustomerPrice !== 'function') return;
  const writes = [];
  /** Lines whose price was null = customer spec-change requests awaiting a
   *  re-priced confirmation. Re-pricing them here IS the confirmation, so we
   *  remember their names and tell the maker what just happened (banner). */
  const repriced = [];
  for (const l of (q._lines || [])) {
    // Null price + customer-editable = a customer change request (the edit
    // endpoint clears the price). A line merely added after sharing is also
    // null-priced but not editable, so it reprices silently without the banner.
    const wasPending = l.customer_price == null
      && (l.customer_editable || (Array.isArray(l.editable_specs) && l.editable_specs.length > 0));
    const customer_price = _shareLineCustomerPrice(q, l);
    if (customer_price == null || (l.customer_price != null && Number(l.customer_price) === customer_price)) continue; // unchanged
    if (wasPending) repriced.push(l.name || 'Item');
    l.customer_price = customer_price;
    writes.push(_db('quote_lines').update(/** @type {any} */ ({ customer_price })).eq('id', l.id));
  }
  // Refresh the server-side rate snapshot (powers auto-accept live re-pricing in
  // quote-public-update) so it tracks the maker's CURRENT rates. Opening the Live
  // tab is the reconciliation point for any drift since the link was shared.
  if (typeof _buildRateCard === 'function') {
    const rate_card = _buildRateCard(q);
    if (rate_card) { q.rate_card = rate_card; writes.push(_db('quotes').update(/** @type {any} */ ({ rate_card })).eq('id', q.id)); }
  }
  q._llRepriced = repriced;
  if (writes.length) { try { await Promise.all(writes); } catch (e) { /* best-effort — the tab still works without it */ } }
}

/** Order equivalent of _llSyncCustomerPrices: keep the shared order's per-line
 *  customer_price current. Orders aren't hydrated into `_lines` for the panel,
 *  so load order_lines here. @param {any} o */
async function _llSyncOrderPrices(o) {
  if (!o || !o.share_token || typeof _shareLineCustomerPrice !== 'function') return;
  let lines = Array.isArray(o._lines) ? o._lines : null;
  if (!lines) {
    try {
      const { data } = await _db('order_lines').select('*').eq('order_id', o.id).order('position');
      lines = (data || []).map(/** @param {any} r */ r => ({ ...r }));
      o._lines = lines;
    } catch (e) { return; }
  }
  const writes = [];
  for (const l of lines) {
    const customer_price = _shareLineCustomerPrice(o, l);
    if (customer_price == null || Number(l.customer_price) === customer_price) continue;
    l.customer_price = customer_price;
    writes.push(_db('order_lines').update(/** @type {any} */ ({ customer_price })).eq('id', l.id));
  }
  if (writes.length) { try { await Promise.all(writes); } catch (e) { /* best-effort */ } }
}

/** Called by renderQuoteEditor/renderOrderEditor after innerHTML when the live
 *  tab is active: fill the live body + render the preview. @param {'quote'|'order'} kind */
async function _llEnterLive(kind) {
  const q = _llShareQuote(kind);
  // Force-fresh rows: pick up any customer edits made since boot.
  await _llEnsureLines(q, kind, true);
  // Keep customer_price in sync with the current figures (fixes stale / £0).
  if (kind === 'quote') await _llSyncCustomerPrices(q);
  else if (q && q.share_token) await _llSyncOrderPrices(q);
  const bodyId = kind === 'quote' ? 'ql-live-body' : 'ol-live-body';
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = _liveLinkPanel(kind);
  _llSyncLineControls();
  _llRenderPreview(kind);
  // Auto-create the live link on first open (no manual "Generate" button) —
  // but never for a quote with no items (it would share a blank page; the panel
  // shows an "add items first" notice instead).
  const hasLines = kind === 'order' || (q && Array.isArray(q._lines) && q._lines.length > 0);
  if (q && !q.share_token && hasLines && typeof _generateShareLink === 'function') await _generateShareLink(q.id, kind);
}

// ── Tab switching ────────────────────────────────────────────────────────────
/** @param {'builder'|'live'} tab */
async function switchQuoteTab(tab) { await _llSwitch('quote', tab); }
/** @param {'builder'|'live'} tab */
async function switchOrderTab(tab) { await _llSwitch('order', tab); }

/** True when the signed-in user has Pro access (paid or trial). The customer
 *  Live link itself is free; only item selection + spec editing are gated.
 *  @returns {boolean} */
function _llHasPro() {
  return typeof _hasProAccess === 'function' ? _hasProAccess() : true;
}

/** Free user clicked a Pro-gated customer-controls toggle: show the upgrade
 *  modal (item selection / spec editing are Pro). */
function _llControlsProGate() {
  if (typeof _enforceProFeature === 'function') {
    _enforceProFeature('live_link_controls', {
      message: 'Letting customers <strong>pick optional items</strong> and <strong>request spec changes</strong> on the live page is a Pro feature. Upgrade to switch these on.',
      toast: 'Customer item selection & spec editing are Pro features.',
    });
  }
}

/** @param {'quote'|'order'} kind @param {'builder'|'live'} tab */
async function _llSwitch(kind, tab) {
  _llTab[kind] = tab;
  if (tab === 'live') { await _llEnsureLines(_llShareQuote(kind), kind); }
  // Re-render the editor (rebuilds the tab bar + bodies with correct active state).
  if (kind === 'quote') { if (typeof renderQuoteEditor === 'function') renderQuoteEditor(); }
  else { if (typeof renderOrderEditor === 'function') renderOrderEditor(); }
  if (tab === 'builder') {
    // Restore the list in the main pane.
    if (kind === 'quote') { if (typeof renderQuoteMain === 'function') renderQuoteMain(); }
    else { if (typeof renderOrdersMain === 'function') renderOrdersMain(); }
  }
}

// ── The controls panel (migrated from share.js _sharePanelHtml + per-spec) ────
/** Order live-link panel: the customer page is view-only, so just the link +
 *  Send + a note — no per-line / spec / selection controls (those stay
 *  quote-only). @param {any} o @returns {string} */
function _orderLinkPanel(o) {
  const shared = !!o.share_token;
  const link = shared ? _shareLink(o.share_token) : '';
  const linkBox = shared
    ? `<div class="ll-link"><code id="share-link">${_escHtml(link)}</code><button class="btn btn-primary ll-copy" onclick="_copyShareLink()">Copy</button></div>
       <div class="ll-link-actions">
         <button class="btn btn-primary" onclick="_sendLiveLink('order',${o.id})">Send via email</button>
         <button class="btn btn-primary" onclick="_sendLiveLinkMsg('order',${o.id})">Send via messages</button>
         <a class="btn btn-outline" href="${_escHtml(link)}" target="_blank">Open ↗</a>
       </div>`
    : `<div class="ll-empty">Creating live link…</div>`;
  const statusRow = `<div class="ll-status-row"><span class="ll-status-dot" style="background:${shared ? '#2962d9' : 'var(--border)'}"></span>${shared ? 'Live link ready to share' : 'Setting up live link…'}</div>`;
  return `<div class="ll-pad">
    ${statusRow}
    ${linkBox}
    <div class="ll-h">Customer access</div>
    <div class="ll-hint">This order’s page is view-only: customers can review the items and message you. Choosing items and requesting spec changes happen on the quote.</div>
    <div class="ll-autosave" id="ll-autosave">${shared ? 'Live link ready' : 'Creating live link…'}</div>
  </div>`;
}

// Deposit-row captions — swapped live with the toggle.
const _LL_DEP_ON_DESC = 'Collected when the customer accepts · balance due on completion';
const _LL_DEP_OFF_DESC = 'Off — no deposit requested';

// Auto-accept-edits captions — swapped live with the toggle.
const _LL_AUTO_ON_DESC = 'On — customer changes are priced instantly from your rates and applied automatically. No confirmation step.';
const _LL_AUTO_OFF_DESC = 'Off — a customer change comes to you to confirm the new price before anything’s charged.';
/** Auto-accept toggle: flip state, swap the caption, save. @param {HTMLElement} b @param {'quote'|'order'} kind */
function _llAutoAcceptTgl(b, kind) {
  _shTgl(b);
  const on = b.getAttribute('aria-pressed') === 'true';
  const d = document.getElementById('ll-auto-desc'); if (d) d.textContent = on ? _LL_AUTO_ON_DESC : _LL_AUTO_OFF_DESC;
  _llAutoSave(kind);
}
/** One sentence stating what the customer will actually be asked to pay,
 *  given the payment + bank-transfer + deposit toggles combined — and which
 *  switch to flip to change it. Shown under the Payment rows, updated live.
 *  @param {boolean} pay @param {boolean} dep @param {number} pct @param {boolean} [bank] @returns {string} */
function _llPaySummaryText(pay, dep, pct, bank) {
  const how = bank ? 'by card or bank transfer' : 'by card';
  if (pay && dep && pct > 0) return `Customer pays a ${pct}% deposit ${how} when they accept — the balance is due on completion.`;
  if (pay) return `Customer pays the FULL total ${how} when they accept. Prefer part up front? Turn the deposit on. Want no payment on this page? Switch off online payment above.`;
  if (dep && pct > 0) return `No online payment on this page — the customer just accepts, and you arrange the ${pct}% deposit yourself.`;
  return 'No online payment on this page — the customer just accepts, and you arrange payment yourself.';
}
/** Re-render the payment summary from the current toggle states. */
function _llPaySummaryUpdate() {
  const el = document.getElementById('ll-pay-summary'); if (!el) return;
  const on = (/** @type {string} */ id) => { const b = document.getElementById(id); return !!b && b.getAttribute('aria-pressed') === 'true'; };
  const pctEl = /** @type {HTMLInputElement|null} */ (document.getElementById('sh-dep'));
  el.textContent = _llPaySummaryText(on('sh-pay'), on('sh-dep-on'), pctEl ? (parseFloat(pctEl.value) || 0) : 0, on('sh-bank'));
}
/** Deposit toggle: flip state, show/hide the % input, swap the caption.
 *  @param {HTMLElement} b @param {'quote'|'order'} kind */
function _llDepTgl(b, kind) {
  _shTgl(b);
  const on = b.getAttribute('aria-pressed') === 'true';
  const w = document.getElementById('ll-dep-wrap'); if (w) w.style.display = on ? '' : 'none';
  const d = document.getElementById('ll-dep-desc'); if (d) d.textContent = on ? _LL_DEP_ON_DESC : _LL_DEP_OFF_DESC;
  _llPaySummaryUpdate();
  _llAutoSave(kind);
}

/** Whether the maker's Stripe Connect account can actually take card payments.
 *  Reads the cached connect-status (connect.js). @returns {boolean} */
function _llStripeReady() {
  const s = typeof _connectStatus !== 'undefined' ? _connectStatus : null;
  return !!(s && s.connected && s.charges_enabled);
}

/** A one-line "where this link is at" banner so the maker can see customer
 *  activity without leaving the Live link tab. @param {any} q @returns {string} */
function _llStatusRow(q) {
  const fmt = typeof _fmtLLDate === 'function' ? _fmtLLDate : (/** @type {string} */ s) => String(s).slice(0, 10);
  let label, dot;
  if (q.status === 'paid' || q.status === 'deposit_paid') { label = q.status === 'paid' ? 'Paid in full' : 'Deposit paid'; dot = 'var(--success)'; }
  else if (q.accepted_at) { label = `Accepted ${fmt(q.accepted_at)}`; dot = 'var(--success)'; }
  else if (q.viewed_at) { label = `Viewed ${fmt(q.viewed_at)}`; dot = '#2962d9'; }
  else if (q.share_token) { label = 'Live — not viewed yet'; dot = '#2962d9'; }
  else { label = 'Not shared yet'; dot = 'var(--border)'; }
  return `<div class="ll-status-row"><span class="ll-status-dot" style="background:${dot}"></span>${label}</div>`;
}

/** @param {'quote'|'order'} kind @returns {string} */
function _liveLinkPanel(kind) {
  const q = _llShareQuote(kind);
  if (!q) {
    return `<div class="ll-pad"><div class="ll-empty">${kind === 'order' ? 'Open an order to set up its live link.' : 'Open a quote to set up its live link.'}</div></div>`;
  }
  if (kind === 'order') return _orderLinkPanel(q);
  const s = q.share_settings || {};
  const shared = !!q.share_token;
  const pro = _llHasPro();  // item selection + spec editing are Pro-gated
  const lines = q._lines || [];
  const link = shared ? _shareLink(q.share_token) : '';
  const linkBox = shared
    ? `<div class="ll-link"><code id="share-link">${_escHtml(link)}</code><button class="btn btn-primary ll-copy" onclick="_copyShareLink()">Copy</button></div>
       <div class="ll-link-actions">
         <button class="btn btn-primary" onclick="_sendLiveLink('${kind}',${kind === 'quote' ? q.id : (_opState.orderId || 0)})">Send via email</button>
         <button class="btn btn-primary" onclick="_sendLiveLinkMsg('${kind}',${kind === 'quote' ? q.id : (_opState.orderId || 0)})">Send via messages</button>
         <a class="btn btn-outline" href="${_escHtml(link)}" target="_blank">Open ↗</a>
       </div>`
    : `<div class="ll-empty">Creating live link…</div>`;
  const tog = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ on) =>
    `<div class="share-toggle-row"><div><div class="st-label">${label}</div><div class="st-desc">${desc}</div></div><button class="mini-toggle" id="${id}" aria-pressed="${on ? 'true' : 'false'}" onclick="_shTgl(this);_llPaySummaryUpdate();_llAutoSave('${kind}');_llSyncLineControls()"></button></div>`;
  // Pro-gated toggle: rendered off + locked for free users. The hidden id is kept
  // (aria-pressed="false") so _generateShareLink reads it as off and persists
  // allow_select/allow_edit = false. Clicking opens the upgrade modal.
  const togPro = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ on) =>
    pro ? tog(id, label, desc, on)
        : `<div class="share-toggle-row ll-locked" onclick="_llControlsProGate()"><div><div class="st-label">${label} <span class="ll-pro-pill">Pro</span></div><div class="st-desc">${desc}</div></div><button class="mini-toggle" id="${id}" aria-pressed="false" disabled></button></div>`;
  // Guard: a quote with no items would share as a blank page. Block sharing and
  // tell the maker what to do instead.
  if (!lines.length) {
    return `<div class="ll-pad">
      ${_llStatusRow(q)}
      <div class="ll-empty" style="margin-top:12px">Add at least one item to this quote before sharing — the customer’s page would be empty otherwise. Switch to <strong>Quote builder</strong> to add items.</div>
    </div>`;
  }
  const lineRows = lines.map(_llLineControl).join('');
  const perLineSection = pro
    ? `<div class="ll-h">Per-line controls</div>
       <div class="ll-hint">Mark lines the customer may remove, and which specs they can request changes to.</div>
       ${lineRows}`
    : '';
  // Payment toggle: only offer it once Stripe Connect can take charges, so the
  // maker never shares a link whose "Pay" button errors for the customer.
  const stripeReady = _llStripeReady();
  const payRow = stripeReady
    ? tog('sh-pay', 'Accept online payment', 'Paid straight into your Stripe · ProCabinet fee 0.7% (capped) · <a href="/payment-fees" target="_blank" style="color:var(--accent);font-weight:600">How fees work</a>', !!s.accept_payment)
    : `<div class="share-toggle-row ll-locked"><div><div class="st-label">Accept online payment</div><div class="st-desc">Connect Stripe to take a deposit on the live page. <a onclick="_openConnectPopup()" style="color:var(--accent);cursor:pointer;font-weight:600">Set up payments →</a></div></div><button class="mini-toggle" aria-pressed="false" disabled></button></div>`;
  // Bank transfer rides on the same payment sheet (Stripe customer_balance):
  // the customer pushes the money from their banking app and the order confirms
  // when the funds land. Off by default; only meaningful once Stripe is live.
  const bankRow = stripeReady
    ? tog('sh-bank', 'Accept bank transfer', 'Customer transfers from their banking app · needs “Bank transfers” on in your <a href="https://dashboard.stripe.com/settings/payment_methods" target="_blank" style="color:var(--accent);font-weight:600">Stripe payment methods</a>', s.allow_bank_transfer === true)
    : '';
  // Customer spec-change requests that were just re-priced by this tab open
  // (see _llSyncCustomerPrices). Without this banner the maker would never
  // know a change was requested — the price silently updates.
  const repricedBanner = (Array.isArray(q._llRepriced) && q._llRepriced.length)
    ? `<div class="ll-banner">
        <strong>Customer requested change${q._llRepriced.length > 1 ? 's' : ''}:</strong> ${q._llRepriced.map(_escHtml).join(', ')}.
        Price${q._llRepriced.length > 1 ? 's have' : ' has'} been recalculated at your current rates and the customer's page is unblocked. Check the new specs in <strong>Quote builder</strong>, and see the details in <strong>Messages</strong> on the quote card.
      </div>`
    : '';
  return `<div class="ll-pad">
    ${_llStatusRow(q)}
    ${repricedBanner}
    ${linkBox}
    <div class="ll-h">Payment</div>
    ${payRow}
    ${bankRow}
    <div class="share-toggle-row"><div><div class="st-label">Take a deposit</div><div class="st-desc" id="ll-dep-desc">${s.take_deposit === false ? _LL_DEP_OFF_DESC : _LL_DEP_ON_DESC}</div></div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="ll-dep" id="ll-dep-wrap"${s.take_deposit === false ? ' style="display:none"' : ''}><input type="number" id="sh-dep" value="${s.deposit_pct != null ? s.deposit_pct : 40}" min="0" max="100" oninput="_llPaySummaryUpdate()" onchange="_llAutoSave('${kind}')"><span>%</span></div>
        <button class="mini-toggle" id="sh-dep-on" aria-pressed="${s.take_deposit === false ? 'false' : 'true'}" onclick="_llDepTgl(this,'${kind}')"></button>
      </div></div>
    <div class="ll-pay-summary" id="ll-pay-summary">${_llPaySummaryText(stripeReady && !!s.accept_payment, s.take_deposit !== false, s.deposit_pct != null ? Number(s.deposit_pct) : 40, stripeReady && s.allow_bank_transfer === true)}</div>
    <div class="ll-h">What the customer can do</div>
    ${togPro('sh-select', 'Let customers choose items', 'They can include / exclude lines you mark optional below', s.allow_select !== false)}
    ${togPro('sh-edit', 'Let customers request changes', 'They can change the specs you unlock below', !!s.allow_edit)}
    ${pro ? `<div class="share-toggle-row" data-needs="edit"${s.allow_edit ? '' : ' style="display:none"'}>
      <div><div class="st-label">Auto-accept changes</div><div class="st-desc" id="ll-auto-desc">${s.auto_accept_edits ? _LL_AUTO_ON_DESC : _LL_AUTO_OFF_DESC}</div></div>
      <button class="mini-toggle" id="sh-auto-accept" aria-pressed="${s.auto_accept_edits ? 'true' : 'false'}" onclick="_llAutoAcceptTgl(this,'${kind}')"></button>
    </div>` : ''}
    ${perLineSection}
    <div class="ll-autosave" id="ll-autosave">${shared ? 'Changes save automatically' : 'Creating live link…'}</div>
  </div>`;
}

/** The full cabinet spec catalogue. Always returns every spec; `used` flags the
 *  ones this cabinet actually has (the rest can still be unlocked, shown muted).
 *  @param {any} l @returns {Array<{key:string,label:string,used:boolean}>} */
function _llSpecsFor(l) {
  if ((l.line_kind || 'cabinet') !== 'cabinet') return [];
  const doors = (l.door_count || 0) > 0;
  const drawers = (l.drawer_count || 0) > 0;
  return [
    { key: 'dims', label: 'Dimensions (W×H×D)', used: !!(l.w_mm || l.h_mm || l.d_mm) },
    { key: 'material', label: 'Carcass material', used: !!l.material },
    { key: 'finish', label: 'Carcass finish', used: !!(l.finish && l.finish !== 'None') },
    { key: 'construction', label: 'Construction', used: !!l.construction },
    { key: 'base', label: 'Base / plinth', used: !!(l.base_type && l.base_type !== 'None') },
    { key: 'doors', label: 'Door count', used: doors },
    { key: 'doorPct', label: 'Door area (% of front)', used: doors },
    { key: 'doorType', label: 'Door style', used: doors },
    { key: 'doorMat', label: 'Door material', used: doors },
    { key: 'doorFinish', label: 'Door finish', used: doors },
    { key: 'handle', label: 'Handles', used: !!l.door_handle },
    { key: 'drawers', label: 'Drawer count', used: drawers },
    { key: 'drawerPct', label: 'Drawer area (% of front)', used: drawers },
    { key: 'drawerType', label: 'Drawer front style', used: drawers },
    { key: 'drawerMat', label: 'Drawer front material', used: drawers },
    { key: 'drawerFinish', label: 'Drawer front finish', used: drawers },
    { key: 'shelves', label: 'Fixed shelves', used: (l.fixed_shelves || 0) > 0 },
    { key: 'adjShelves', label: 'Adjustable shelves', used: (l.adj_shelves || 0) > 0 },
    { key: 'looseShelves', label: 'Loose shelves', used: (l.loose_shelves || 0) > 0 },
    { key: 'partitions', label: 'Partitions', used: (l.partitions || 0) > 0 },
    { key: 'endPanels', label: 'End panels', used: (l.end_panels || 0) > 0 },
  ];
}

/** One line's controls: Optional + an editable-specs expander. @param {any} l @returns {string} */
function _llLineControl(l) {
  const specs = _llSpecsFor(l);
  const ed = Array.isArray(l.editable_specs) ? l.editable_specs : [];
  const specRows = `<div class="ll-spec-all"><a onclick="_llSpecAll(${l.id},true)">All on</a><span>·</span><a onclick="_llSpecAll(${l.id},false)">All off</a></div>`
    + specs.map(sp =>
      `<label class="ll-spec-opt ${sp.used ? 'used' : 'unused'}"><input type="checkbox" class="ll-spec" data-line="${l.id}" data-spec="${sp.key}" ${ed.includes(sp.key) ? 'checked' : ''} onchange="_llAutoSave('quote')"> <span class="ll-spec-name">${sp.label}</span>${sp.used ? '<span class="ll-spec-used">in use</span>' : ''}</label>`).join('');
  const specBlock = specs.length
    ? `<div class="ll-spec-caret" id="ll-caret-${l.id}" onclick="_llToggleSpecs(${l.id})">Editable specs${ed.length ? ` · ${ed.length}` : ''} ▾</div>
       <div class="ll-spec-list" id="ll-specs-${l.id}" style="display:none">${specRows}</div>`
    : `<span class="ll-nospec">No editable specs</span>`;
  return `<div class="ll-line">
    <div class="ll-line-head">
      <span class="ll-line-name">${_escHtml(l.name || 'Item')}</span>
      <label class="ll-opt" data-needs="select"><input type="checkbox" id="sh-opt-${l.id}" ${l.optional ? 'checked' : ''} onchange="_llAutoSave('quote')"> Optional</label>
    </div>
    <div class="ll-line-sub" data-needs="edit">${specBlock}</div>
  </div>`;
}

/** Expand/collapse a line's editable-spec list. @param {number} lineId */
function _llToggleSpecs(lineId) {
  const el = document.getElementById('ll-specs-' + lineId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

/** Check / uncheck every editable-spec box for a line, then save. @param {number} lineId @param {boolean} on */
function _llSpecAll(lineId, on) {
  document.querySelectorAll('.ll-spec[data-line="' + lineId + '"]').forEach(cb => { /** @type {HTMLInputElement} */ (cb).checked = !!on; });
  _llAutoSave();
}

/** Show/hide the per-line Optional + Editable-specs controls to match the
 *  "Allow item selection" / "Allow spec editing" master toggles. */
function _llSyncLineControls() {
  const on = (/** @type {string} */ id) => { const b = document.getElementById(id); return b ? b.getAttribute('aria-pressed') === 'true' : true; };
  const sel = on('sh-select'), edit = on('sh-edit');
  document.querySelectorAll('[data-needs="select"]').forEach(el => { /** @type {HTMLElement} */ (el).style.display = sel ? '' : 'none'; });
  document.querySelectorAll('[data-needs="edit"]').forEach(el => { /** @type {HTMLElement} */ (el).style.display = edit ? '' : 'none'; });
}

// ── Main-pane preview (iframe of /q) + two-way chat launcher ──────────────────
/** @param {'quote'|'order'} kind */
function _llRenderPreview(kind) {
  const host = document.getElementById(kind === 'quote' ? 'quote-main' : 'orders-main');
  if (!host) return;
  const q = _llShareQuote(kind);
  const clientId = _llClientId(kind);
  if (!q || !q.share_token) {
    host.innerHTML = `<div class="ll-preview-empty">
      <div class="ll-preview-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
      <h3>Live preview</h3>
      <p>Once this ${kind === 'order' ? 'order' : 'quote'} has items and its live link is ready, your customer’s page appears here — exactly as they’ll see it.</p>
    </div>`;
    return;
  }
  const link = _shareLink(q.share_token);
  host.innerHTML = `<div class="ll-preview-wrap">
    <div class="ll-preview-bar"><span class="ll-preview-label">Live preview · what the customer sees</span>
      <a class="btn btn-outline ll-preview-open" href="${_escHtml(link)}" target="_blank">Open ↗</a></div>
    <div class="ll-preview-stage"><iframe class="ll-preview-frame" src="${_escHtml(link + '&biz=1')}" title="Live customer preview"></iframe></div>
    ${clientId ? `<button class="ll-chat-fab" onclick="_openClientChat(${clientId})" title="Message the customer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Message</button>` : ''}
  </div>`;
}

/** Re-render the panel + preview after a save (called by _generateShareLink). @param {'quote'|'order'} [kind] */
function _llAfterSave(kind) {
  const k = kind || (_llTab.order === 'live' ? 'order' : 'quote');
  const bodyId = k === 'quote' ? 'ql-live-body' : 'ol-live-body';
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = _liveLinkPanel(k);
  _llSyncLineControls();
  _llRenderPreview(k);
}

// ── Auto-save (no manual button) ─────────────────────────────────────────────
/** @type {any} */ let _llSaveTimer = null;
/** Debounced auto-save of the live-link settings + per-line controls.
 *  `kind` is passed EXPLICITLY by the panel's inline handlers — inferring it
 *  from leftover `_llTab` state saved settings onto the wrong record when both
 *  a quote's and an order's Live tab had been opened in the same session.
 *  @param {'quote'|'order'} [kind] */
function _llAutoSave(kind) {
  const k = kind || (_llTab.order === 'live' ? 'order' : 'quote');
  const q = _llShareQuote(k);
  if (!q) return;
  const s = document.getElementById('ll-autosave'); if (s) s.textContent = 'Saving…';
  if (_llSaveTimer) clearTimeout(_llSaveTimer);
  _llSaveTimer = setTimeout(() => { if (typeof _generateShareLink === 'function') _generateShareLink(q.id, k); }, 450);
}
/** After a save: the first share re-renders (so the link box + preview appear);
 *  later saves refresh the preview and flash "Saved".
 *  @param {boolean} wasShared @param {'quote'|'order'} [kind] */
function _llOnSaved(wasShared, kind) {
  const k = kind || (_llTab.order === 'live' ? 'order' : 'quote');
  if (!wasShared) { _llAfterSave(k); return; }
  const s = document.getElementById('ll-autosave'); if (s) s.textContent = 'Saved ✓';
  // Settings changed on an existing link: just reload the preview iframe
  // in place — rebuilding the whole preview DOM made the page flash.
  const frame = /** @type {HTMLIFrameElement|null} */ (document.querySelector('.ll-preview-frame'));
  if (frame) { try { frame.src = frame.src; return; } catch (e) { /* fall through */ } }
  _llRenderPreview(k);
}
function _llSaveError() { const s = document.getElementById('ll-autosave'); if (s) s.textContent = 'Couldn’t save — check your connection'; }

// ── Send live link (pre-filled email) ────────────────────────────────────────
/** @param {'quote'|'order'} kind @param {number} id */
async function _sendLiveLink(kind, id) {
  /** @type {any} */ const entity = kind === 'quote'
    ? quotes.find(/** @param {any} x */ x => x.id === id)
    : orders.find(/** @param {any} x */ x => x.id === id);
  if (!entity) { _toast(kind === 'order' ? 'Order not found' : 'Quote not found', 'info'); return; }
  if (!entity.share_token) {
    _toast('Set up the live link first', 'info');
    if (kind === 'quote' && typeof loadQuoteIntoSidebar === 'function') { await loadQuoteIntoSidebar(entity.id); switchQuoteTab('live'); }
    else if (kind === 'order' && typeof loadOrderIntoSidebar === 'function') { await loadOrderIntoSidebar(id); switchOrderTab('live'); }
    return;
  }
  const client = entity.client_id ? clients.find(/** @param {any} c */ c => c.id === entity.client_id) : null;
  const email = (client && client.email) ? client.email : '';
  const biz = _llBizName();
  const link = _shareLink(entity.share_token);
  const first = (client && client.name) ? (' ' + String(client.name).split(/[ &]/)[0]) : '';
  const noun = kind === 'order' ? 'order' : 'quote';
  const num = (kind === 'order' ? entity.order_number : entity.quote_number) || `#${entity.id}`;
  const subject = `Your ${noun} ${num} from ${biz}`;
  const body = kind === 'order'
    ? `Hi${first},\n\nHere's your order — you can view the details and message us any time on this page:\n\n${link}\n\nAny questions, just reply to this email or send us a message on the page.\n\nThanks,\n${biz}`
    : `Hi${first},\n\nHere's your quote — you can review the items, choose what you'd like, and approve it online here:\n\n${link}\n\nAny questions, just reply to this email or send us a message on the page.\n\nThanks,\n${biz}`;
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Best-effort business display name for the email. @returns {string} */
function _llBizName() {
  try {
    const b = (typeof getBizInfo === 'function') ? /** @type {any} */ (getBizInfo()) : null;
    if (b && b.name) return b.name;
  } catch (e) { /* ignore */ }
  return 'us';
}

/** Business email (for the "send me a copy" option). @returns {string} */
function _llBizEmail() {
  try {
    const b = (typeof getBizInfo === 'function') ? /** @type {any} */ (getBizInfo()) : null;
    if (b && b.email) return String(b.email).trim();
  } catch (e) { /* ignore */ }
  return '';
}

// ── Send live link via message (posts to the live page + emails the customer) ─
// Posting a business message makes the link appear on the customer's live page
// (quote-messages list). The email is sent DIRECTLY by the send-live-link edge
// fn — the customer_messages → messages-notify email bridge isn't applied in
// prod, so the chat row alone never emails anyone. A "send me a copy" box also
// emails the business their own copy via the same function.
/** Open the "send via messages" dialogue. @param {'quote'|'order'} kind @param {number} id */
async function _sendLiveLinkMsg(kind, id) {
  /** @type {any} */ const entity = kind === 'quote'
    ? quotes.find(/** @param {any} x */ x => x.id === id)
    : orders.find(/** @param {any} x */ x => x.id === id);
  if (!entity) { _toast(kind === 'order' ? 'Order not found' : 'Quote not found', 'info'); return; }
  if (!entity.share_token) {
    _toast('Set up the live link first', 'info');
    if (kind === 'quote' && typeof loadQuoteIntoSidebar === 'function') { await loadQuoteIntoSidebar(entity.id); switchQuoteTab('live'); }
    else if (kind === 'order' && typeof loadOrderIntoSidebar === 'function') { await loadOrderIntoSidebar(id); switchOrderTab('live'); }
    return;
  }
  const client = entity.client_id ? clients.find(/** @param {any} c */ c => c.id === entity.client_id) : null;
  const noun = kind === 'order' ? 'order' : 'quote';
  if (!client) { _toast(`Add a client to this ${noun} first — messages go to the customer’s conversation`, 'error'); return; }
  const email = (client.email || '').trim();
  const biz = _llBizName();
  const bizEmail = _llBizEmail();
  const link = _shareLink(entity.share_token);
  const first = client.name ? (' ' + String(client.name).split(/[ &]/)[0]) : '';
  const num = (kind === 'order' ? entity.order_number : entity.quote_number) || `#${entity.id}`;
  const defaultMsg = kind === 'order'
    ? `Hi${first}, here's your ${noun} ${num} — you can view the details and message us any time on this page:\n\n${link}\n\nAny questions, just reply here. Thanks, ${biz}`
    : `Hi${first}, here's your ${noun} ${num} — you can review the items, choose what you'd like, and approve it online here:\n\n${link}\n\nAny questions, just reply here. Thanks, ${biz}`;
  const emailNote = email
    ? `It appears on ${_escHtml(client.name || 'the customer')}’s live page, and we’ll email it to <strong>${_escHtml(email)}</strong>.`
    : `It appears on ${_escHtml(client.name || 'the customer')}’s live page. <strong>No email on file</strong> — add one to the client to also email them.`;
  const copyRow = bizEmail
    ? `<label class="ll-copy-row"><input type="checkbox" id="llm-copy"> <span>Send me a copy at <strong>${_escHtml(bizEmail)}</strong></span></label>`
    : `<label class="ll-copy-row"><input type="checkbox" id="llm-copy" disabled> <span style="color:var(--muted)">Add a business email in Settings to send yourself a copy</span></label>`;
  _openPopup(`
    <div class="popup-header"><div class="popup-title">Send live link via message</div><button class="popup-close" onclick="_closePopup()">&times;</button></div>
    <div class="popup-body">
      <div class="pf" style="margin-bottom:6px">
        <label class="pf-label">Message</label>
        <textarea class="pf-input" id="llm-body" rows="7" style="resize:vertical;line-height:1.45">${_escHtml(defaultMsg)}</textarea>
      </div>
      <div class="ll-hint">${emailNote}</div>
      ${copyRow}
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_sendLiveLinkMsgConfirm('${kind}',${id})">Send</button>
    </div>`, 'md');
}

/** Post the composed message (→ shows on the customer's live page), then email
 *  the customer the link directly and optionally a copy to the business.
 *  @param {'quote'|'order'} kind @param {number} id */
async function _sendLiveLinkMsgConfirm(kind, id) {
  const body = _popupVal('llm-body');
  if (!body) { _toast('Write a message first', 'info'); return; }
  /** @type {any} */ const entity = kind === 'quote'
    ? quotes.find(/** @param {any} x */ x => x.id === id)
    : orders.find(/** @param {any} x */ x => x.id === id);
  if (!entity || !entity.client_id) { _toast(`No client on this ${kind === 'order' ? 'order' : 'quote'}`, 'error'); return; }
  const clientId = entity.client_id;
  const client = clients.find(/** @param {any} c */ c => c.id === clientId);
  const wantCopy = !!(/** @type {HTMLInputElement|null} */ (document.getElementById('llm-copy')) || {}).checked;
  const num = (kind === 'order' ? entity.order_number : entity.quote_number) || `#${entity.id}`;
  const btn = /** @type {HTMLButtonElement|null} */ (document.querySelector('.popup-footer .btn-primary'));
  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  // 1) Post the chat message so the link also shows on the customer's live page.
  /** @type {any} */ const row = { user_id: _userId, client_id: clientId, sender: 'business', body };
  if (kind === 'quote') row.quote_id = id; else row.order_id = id;
  try {
    await _cmTable().insert(row);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
    _toast('Couldn’t send the message — check your connection', 'error');
    return;
  }
  // Keep the in-memory thread cache + any open chat UI in step (optimistic).
  try {
    (_clientMessages[clientId] = _clientMessages[clientId] || []).push({ ...row, created_at: new Date().toISOString() });
    if (typeof _refreshClientThreadUI === 'function') _refreshClientThreadUI(clientId);
  } catch (e) { /* cache is best-effort */ }
  // 2) Email the customer the link directly (the messages→email bridge isn't in
  //    prod, so the chat row alone never emails them), plus an optional copy.
  let msg = 'Live link sent'; let type = /** @type {'success'|'info'|'error'} */ ('success');
  try {
    const out = await _llSendLiveLink({ client_id: clientId, body, ref: `${kind === 'order' ? 'Order' : 'Quote'} ${num}`, copyToBusiness: wantCopy });
    if (out.customer === 'sent') { msg = 'Live link emailed to the customer'; }
    else if (out.customer === 'skipped') { msg = 'Posted to their live page — no email on file for the customer'; type = 'info'; }
    else { msg = 'Posted to their live page, but the customer email failed'; type = 'error'; }
    if (wantCopy) msg += out.copy === 'sent' ? ' · copy sent to you' : (out.copy === 'skipped' ? ' · add a business email for your copy' : ' · your copy failed');
  } catch (e) {
    msg = 'Posted to their live page, but emailing failed — check your connection'; type = 'error';
  }
  _closePopup();
  _toast(msg, type);
}

/** Email the live link to the customer (and optionally a copy to the business)
 *  via the send-live-link edge fn. Recipients are resolved SERVER-SIDE from the
 *  caller's JWT — the client must belong to the caller, and the copy goes to the
 *  caller's own business email — never from these fields.
 *  @param {{client_id:number, body:string, ref?:string, copyToBusiness?:boolean}} payload @returns {Promise<any>} */
async function _llSendLiveLink(payload) {
  const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`${window._SBURL}/functions/v1/send-live-link`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'apikey': window._SBKEY, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  /** @type {any} */ let out = {};
  try { out = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out;
}

// ── Open a record's Live link sub-tab from its card ──────────────────────────
/** @param {'quote'|'order'} kind @param {number} id */
async function _openLiveLinkTab(kind, id) {
  if (typeof switchSection === 'function') switchSection(kind === 'quote' ? 'quote' : 'orders');
  if (kind === 'quote') {
    if (typeof loadQuoteIntoSidebar === 'function') await loadQuoteIntoSidebar(id);
    if (typeof switchQuoteTab === 'function') await switchQuoteTab('live');
  } else {
    if (typeof loadOrderIntoSidebar === 'function') await loadOrderIntoSidebar(id);
    if (typeof switchOrderTab === 'function') await switchOrderTab('live');
  }
}

// ── Order card "PDF ▾" dropdown (Phase 5) ────────────────────────────────────
/** @param {number} orderId */
function _orderPdfMenu(orderId) {
  /** @type {Array<[string,string]>} */
  const docs = [
    ['order_confirmation', 'Order Confirmation'],
    ['proforma', 'Pro-forma Invoice'],
    ['invoice', 'Invoice'],
    ['work_order', 'Work Order'],
  ];
  const btns = docs.map(d =>
    `<button class="btn btn-outline" style="width:100%;margin-bottom:8px;justify-content:flex-start;text-align:left" onclick="_closePopup();printOrderDoc(${orderId},'${d[0]}')">${d[1]}</button>`).join('');
  _openPopup(`<div class="popup-header"><div class="popup-title">Export PDF</div><button class="popup-close" onclick="_closePopup()">&times;</button></div><div class="popup-body">${btns}</div>`, 'sm');
}

Object.assign(window, {
  _llTab, _llReset, _llShareQuote, _llClientId, _llEnsureLines, _llTabBar, _llLiveBodyDiv,
  _llEnterLive, switchQuoteTab, switchOrderTab, _liveLinkPanel, _llSpecsFor, _llLineControl,
  _llToggleSpecs, _llSpecAll, _llSyncLineControls, _llRenderPreview, _llAfterSave, _sendLiveLink, _sendLiveLinkMsg, _sendLiveLinkMsgConfirm, _orderPdfMenu, _openLiveLinkTab,
  _llAutoSave, _llOnSaved, _llSaveError, _llControlsProGate, _llAutoAcceptTgl,
});
