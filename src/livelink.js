// ProCabinet — "Live link" sidebar sub-tab.
//
// Turns the quote/order sidebar editor into a two-tab surface: "Quote builder"
// (the existing editor) and "Live link" — a controls panel in the sidebar plus
// a live preview of the customer /q page (with a two-way chat launcher) rendered
// into the main pane. Replaces the old _openSharePanel popup.
//
// For an ORDER, the live link is the originating quote's (one link per deal,
// quote -> order), so all live-link operations resolve to that backing quote.
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

/** The quote that backs the live link for this section (order -> its origin quote).
 *  @param {'quote'|'order'} kind @returns {any} */
function _llShareQuote(kind) {
  if (kind === 'quote') return _qpState.quoteId ? quotes.find(/** @param {any} q */ q => q.id === _qpState.quoteId) : null;
  const o = _opState.orderId ? orders.find(/** @param {any} x */ x => x.id === _opState.orderId) : null;
  return o && o.quote_id ? quotes.find(/** @param {any} q */ q => q.id === o.quote_id) : null;
}

/** Client id for the conversation in this section. @param {'quote'|'order'} kind */
function _llClientId(kind) {
  if (kind === 'quote') { const q = _llShareQuote('quote'); return q ? q.client_id : null; }
  const o = _opState.orderId ? orders.find(/** @param {any} x */ x => x.id === _opState.orderId) : null;
  return o ? o.client_id : null;
}

/** Ensure a quote's line rows are loaded for the controls. @param {any} q */
async function _llEnsureLines(q) {
  if (!q) return [];
  if (!Array.isArray(q._lines)) {
    try {
      const { data } = await _db('quote_lines').select('*').eq('quote_id', q.id).order('position');
      q._lines = (data || []).map(/** @param {any} r */ r => ({ ...r }));
    } catch (e) { q._lines = []; }
  }
  return q._lines;
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

/** Called by renderQuoteEditor/renderOrderEditor after innerHTML when the live
 *  tab is active: fill the live body + render the preview. @param {'quote'|'order'} kind */
async function _llEnterLive(kind) {
  const q = _llShareQuote(kind);
  await _llEnsureLines(q);
  const bodyId = kind === 'quote' ? 'ql-live-body' : 'ol-live-body';
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = _liveLinkPanel(kind);
  _llRenderPreview(kind);
}

// ── Tab switching ────────────────────────────────────────────────────────────
/** @param {'builder'|'live'} tab */
async function switchQuoteTab(tab) { await _llSwitch('quote', tab); }
/** @param {'builder'|'live'} tab */
async function switchOrderTab(tab) { await _llSwitch('order', tab); }

/** @param {'quote'|'order'} kind @param {'builder'|'live'} tab */
async function _llSwitch(kind, tab) {
  _llTab[kind] = tab;
  if (tab === 'live') { await _llEnsureLines(_llShareQuote(kind)); }
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
/** @param {'quote'|'order'} kind @returns {string} */
function _liveLinkPanel(kind) {
  const q = _llShareQuote(kind);
  if (!q) {
    return `<div class="ll-pad"><div class="ll-empty">This order isn’t linked to a shareable quote yet, so it has no live link. Create the order from a shared quote to enable a live page here.</div></div>`;
  }
  const s = q.share_settings || {};
  const shared = !!q.share_token;
  const lines = q._lines || [];
  const link = shared ? _shareLink(q.share_token) : '';
  const linkBox = shared
    ? `<div class="ll-link"><code id="share-link">${_escHtml(link)}</code><button class="btn btn-primary ll-copy" onclick="_copyShareLink()">Copy</button></div>
       <div class="ll-link-actions">
         <button class="btn btn-primary" onclick="_sendLiveLink('${kind}',${kind === 'quote' ? q.id : (_opState.orderId || 0)})">✉ Send live link</button>
         <a class="btn btn-outline" href="${_escHtml(link)}" target="_blank">Open ↗</a>
       </div>`
    : `<div class="ll-empty">No live link yet — set the options below, then <strong>Generate</strong>.</div>`;
  const tog = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ on) =>
    `<div class="share-toggle-row"><div><div class="st-label">${label}</div><div class="st-desc">${desc}</div></div><button class="mini-toggle" id="${id}" aria-pressed="${on ? 'true' : 'false'}" onclick="_shTgl(this)"></button></div>`;
  const lineRows = lines.map(_llLineControl).join('') || '<div class="ll-hint" style="padding:8px 0">No line items on this quote yet.</div>';
  return `<div class="ll-pad">
    ${linkBox}
    <div class="ll-h">What the customer can do</div>
    ${tog('sh-select', 'Allow item selection', 'Include / exclude optional lines', s.allow_select !== false)}
    ${tog('sh-edit', 'Allow spec editing', 'Customer can request changes to unlocked specs', !!s.allow_edit)}
    ${tog('sh-pay', 'Accept card payment', 'Pays into your Stripe · platform fee applies', !!s.accept_payment)}
    <div class="share-toggle-row"><div><div class="st-label">Take a deposit</div><div class="st-desc">% due to confirm the order</div></div>
      <div class="ll-dep"><input type="number" id="sh-dep" value="${s.deposit_pct != null ? s.deposit_pct : 40}" min="0" max="100"><span>%</span></div></div>
    <div class="ll-h">Per-line controls</div>
    <div class="ll-hint">Mark lines the customer may remove, and which specs they can request changes to.</div>
    ${lineRows}
    <button class="btn btn-primary ll-gen" onclick="_generateShareLink(${q.id})">${shared ? 'Update live link' : 'Generate live link'}</button>
  </div>`;
}

/** Applicable editable specs for a cabinet line. @param {any} l @returns {Array<{key:string,label:string}>} */
function _llSpecsFor(l) {
  if ((l.line_kind || 'cabinet') !== 'cabinet') return [];
  const out = [];
  if (l.w_mm || l.h_mm || l.d_mm) out.push({ key: 'dims', label: 'Dimensions (W×H×D)' });
  if (l.finish) out.push({ key: 'finish', label: 'Finish' });
  if (l.material) out.push({ key: 'material', label: 'Material' });
  if ((l.door_count || 0) > 0) out.push({ key: 'doors', label: 'Door count' });
  if ((l.drawer_count || 0) > 0) out.push({ key: 'drawers', label: 'Drawer count' });
  return out;
}

/** One line's controls: Optional + an editable-specs expander. @param {any} l @returns {string} */
function _llLineControl(l) {
  const specs = _llSpecsFor(l);
  const ed = Array.isArray(l.editable_specs) ? l.editable_specs : [];
  const specRows = specs.map(sp =>
    `<label class="ll-spec-opt"><input type="checkbox" class="ll-spec" data-line="${l.id}" data-spec="${sp.key}" ${ed.includes(sp.key) ? 'checked' : ''}> ${sp.label}</label>`).join('');
  const specBlock = specs.length
    ? `<div class="ll-spec-caret" id="ll-caret-${l.id}" onclick="_llToggleSpecs(${l.id})">Editable specs${ed.length ? ` · ${ed.length}` : ''} ▾</div>
       <div class="ll-spec-list" id="ll-specs-${l.id}" style="display:none">${specRows}</div>`
    : `<span class="ll-nospec">No editable specs</span>`;
  return `<div class="ll-line">
    <div class="ll-line-head">
      <span class="ll-line-name">${_escHtml(l.name || 'Item')}</span>
      <label class="ll-opt"><input type="checkbox" id="sh-opt-${l.id}" ${l.optional ? 'checked' : ''}> Optional</label>
    </div>
    <div class="ll-line-sub">${specBlock}</div>
  </div>`;
}

/** Expand/collapse a line's editable-spec list. @param {number} lineId */
function _llToggleSpecs(lineId) {
  const el = document.getElementById('ll-specs-' + lineId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
      <div class="ll-preview-empty-icon">🔗</div>
      <h3>Live preview</h3>
      <p>Generate the live link in the panel on the left, then your customer’s page appears here — exactly as they’ll see it.</p>
    </div>`;
    return;
  }
  const link = _shareLink(q.share_token);
  host.innerHTML = `<div class="ll-preview-wrap">
    <div class="ll-preview-bar"><span class="ll-preview-label">Live preview · what the customer sees</span>
      <a class="btn btn-outline ll-preview-open" href="${_escHtml(link)}" target="_blank">Open ↗</a></div>
    <div class="ll-preview-stage"><iframe class="ll-preview-frame" src="${_escHtml(link)}" title="Live customer preview"></iframe></div>
    ${clientId ? `<button class="ll-chat-fab" onclick="_openClientChat(${clientId})" title="Message the customer">💬<span>Message</span></button>` : ''}
  </div>`;
}

/** Re-render the panel + preview after a save (called by _generateShareLink). @param {'quote'|'order'} [kind] */
function _llAfterSave(kind) {
  const k = kind || (_llTab.order === 'live' ? 'order' : 'quote');
  const bodyId = k === 'quote' ? 'ql-live-body' : 'ol-live-body';
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = _liveLinkPanel(k);
  _llRenderPreview(k);
}

// ── Send live link (pre-filled email) ────────────────────────────────────────
/** @param {'quote'|'order'} kind @param {number} id */
async function _sendLiveLink(kind, id) {
  /** @type {any} */ let q = null;
  /** @type {any} */ let clientId = null;
  if (kind === 'quote') { q = quotes.find(/** @param {any} x */ x => x.id === id); clientId = q ? q.client_id : null; }
  else {
    const o = orders.find(/** @param {any} x */ x => x.id === id);
    clientId = o ? o.client_id : null;
    q = o && o.quote_id ? quotes.find(/** @param {any} x */ x => x.id === o.quote_id) : null;
  }
  if (!q) { _toast(kind === 'order' ? 'Link this order to a shared quote first' : 'Quote not found', 'info'); return; }
  if (!q.share_token) {
    _toast('Set up the live link first', 'info');
    if (kind === 'quote' && typeof loadQuoteIntoSidebar === 'function') { await loadQuoteIntoSidebar(q.id); switchQuoteTab('live'); }
    else if (kind === 'order' && typeof loadOrderIntoSidebar === 'function') { await loadOrderIntoSidebar(id); switchOrderTab('live'); }
    return;
  }
  const client = clientId ? clients.find(/** @param {any} c */ c => c.id === clientId) : null;
  const email = (client && client.email) ? client.email : '';
  const biz = _llBizName();
  const link = _shareLink(q.share_token);
  const first = (client && client.name) ? (' ' + String(client.name).split(/[ &]/)[0]) : '';
  const subject = `Your quote${q.quote_number ? ' ' + q.quote_number : ''} from ${biz}`;
  const body = `Hi${first},\n\nHere's your quote — you can review the items, choose what you'd like, and approve it online here:\n\n${link}\n\nAny questions, just reply to this email or send us a message on the page.\n\nThanks,\n${biz}`;
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
  _llToggleSpecs, _llRenderPreview, _llAfterSave, _sendLiveLink, _orderPdfMenu, _openLiveLinkTab,
});
