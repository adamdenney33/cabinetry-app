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
 *  @param {any} entity @param {'quote'|'order'} [kind] */
async function _llEnsureLines(entity, kind) {
  if (!entity || kind === 'order') return (entity && entity._lines) || [];
  if (!Array.isArray(entity._lines)) {
    try {
      const { data } = await _db('quote_lines').select('*').eq('quote_id', entity.id).order('position');
      entity._lines = (data || []).map(/** @param {any} r */ r => ({ ...r }));
    } catch (e) { entity._lines = []; }
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
  for (const l of (q._lines || [])) {
    const customer_price = _shareLineCustomerPrice(q, l);
    if (customer_price == null || Number(l.customer_price) === customer_price) continue; // unchanged
    l.customer_price = customer_price;
    writes.push(_db('quote_lines').update(/** @type {any} */ ({ customer_price })).eq('id', l.id));
  }
  if (writes.length) { try { await Promise.all(writes); } catch (e) { /* best-effort — the tab still works without it */ } }
}

/** Called by renderQuoteEditor/renderOrderEditor after innerHTML when the live
 *  tab is active: fill the live body + render the preview. @param {'quote'|'order'} kind */
async function _llEnterLive(kind) {
  const q = _llShareQuote(kind);
  await _llEnsureLines(q, kind);
  if (kind === 'quote') await _llSyncCustomerPrices(q);  // keep customer_price in sync with current quote (fixes stale £0)
  const bodyId = kind === 'quote' ? 'ql-live-body' : 'ol-live-body';
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = _liveLinkPanel(kind);
  _llSyncLineControls();
  _llRenderPreview(kind);
  // Auto-create the live link on first open (no manual "Generate" button).
  if (q && !q.share_token && typeof _generateShareLink === 'function') await _generateShareLink(q.id, kind);
}

// ── Tab switching ────────────────────────────────────────────────────────────
/** @param {'builder'|'live'} tab */
async function switchQuoteTab(tab) { await _llSwitch('quote', tab); }
/** @param {'builder'|'live'} tab */
async function switchOrderTab(tab) { await _llSwitch('order', tab); }

/** Live link is a Pro-only feature. Gate entry to the live tab behind an
 *  active subscription/trial; free users get the upgrade modal and stay on the
 *  builder. @returns {boolean} true when it's safe to open the live tab. */
function _enforceLiveLinkPro() {
  if (typeof _enforceProFeature !== 'function') return true;
  return _enforceProFeature('live_link', {
    message: 'The customer <strong>Live link</strong> is a Pro feature. Upgrade to send a live quote page where customers can pick options, request changes, message you and pay a deposit.',
    toast: 'The customer Live link is a Pro feature.',
  });
}

/** @param {'quote'|'order'} kind @param {'builder'|'live'} tab */
async function _llSwitch(kind, tab) {
  // Pro gate: block entry to the live tab for free users (keeps them on builder).
  if (tab === 'live' && !_enforceLiveLinkPro()) { _llTab[kind] = 'builder'; return; }
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
         <button class="btn btn-primary" onclick="_sendLiveLink('order',${o.id})">Send live link</button>
         <a class="btn btn-outline" href="${_escHtml(link)}" target="_blank">Open ↗</a>
       </div>`
    : `<div class="ll-empty">Creating live link…</div>`;
  return `<div class="ll-pad">
    ${linkBox}
    <div class="ll-h">Customer access</div>
    <div class="ll-hint">Customers can view this order’s items and message you from the live page. Spec changes and item selection stay on the quote.</div>
    <div class="ll-autosave" id="ll-autosave">${shared ? 'Live link ready' : 'Creating live link…'}</div>
  </div>`;
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
  const lines = q._lines || [];
  const link = shared ? _shareLink(q.share_token) : '';
  const linkBox = shared
    ? `<div class="ll-link"><code id="share-link">${_escHtml(link)}</code><button class="btn btn-primary ll-copy" onclick="_copyShareLink()">Copy</button></div>
       <div class="ll-link-actions">
         <button class="btn btn-primary" onclick="_sendLiveLink('${kind}',${kind === 'quote' ? q.id : (_opState.orderId || 0)})">Send live link</button>
         <a class="btn btn-outline" href="${_escHtml(link)}" target="_blank">Open ↗</a>
       </div>`
    : `<div class="ll-empty">No live link yet — set the options below, then <strong>Generate</strong>.</div>`;
  const tog = (/** @type {string} */ id, /** @type {string} */ label, /** @type {string} */ desc, /** @type {boolean} */ on) =>
    `<div class="share-toggle-row"><div><div class="st-label">${label}</div><div class="st-desc">${desc}</div></div><button class="mini-toggle" id="${id}" aria-pressed="${on ? 'true' : 'false'}" onclick="_shTgl(this);_llAutoSave();_llSyncLineControls()"></button></div>`;
  const lineRows = lines.map(_llLineControl).join('') || '<div class="ll-hint" style="padding:8px 0">No line items on this quote yet.</div>';
  return `<div class="ll-pad">
    ${linkBox}
    <div class="ll-h">Payment</div>
    ${tog('sh-pay', 'Accept card payment', 'Pays into your Stripe · platform fee applies', !!s.accept_payment)}
    <div class="share-toggle-row"><div><div class="st-label">Take a deposit</div><div class="st-desc">% due to confirm the order</div></div>
      <div class="ll-dep"><input type="number" id="sh-dep" value="${s.deposit_pct != null ? s.deposit_pct : 40}" min="0" max="100" onchange="_llAutoSave()"><span>%</span></div></div>
    <div class="ll-h">What the customer can do</div>
    ${tog('sh-select', 'Allow item selection', 'Include / exclude optional lines', s.allow_select !== false)}
    ${tog('sh-edit', 'Allow spec editing', 'Customer can request changes to unlocked specs', !!s.allow_edit)}
    <div class="ll-h">Per-line controls</div>
    <div class="ll-hint">Mark lines the customer may remove, and which specs they can request changes to.</div>
    ${lineRows}
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
    { key: 'shelves', label: 'Shelves', used: (l.fixed_shelves || 0) > 0 },
  ];
}

/** One line's controls: Optional + an editable-specs expander. @param {any} l @returns {string} */
function _llLineControl(l) {
  const specs = _llSpecsFor(l);
  const ed = Array.isArray(l.editable_specs) ? l.editable_specs : [];
  const specRows = `<div class="ll-spec-all"><a onclick="_llSpecAll(${l.id},true)">All on</a><span>·</span><a onclick="_llSpecAll(${l.id},false)">All off</a></div>`
    + specs.map(sp =>
      `<label class="ll-spec-opt ${sp.used ? 'used' : 'unused'}"><input type="checkbox" class="ll-spec" data-line="${l.id}" data-spec="${sp.key}" ${ed.includes(sp.key) ? 'checked' : ''} onchange="_llAutoSave()"> <span class="ll-spec-name">${sp.label}</span>${sp.used ? '<span class="ll-spec-used">in use</span>' : ''}</label>`).join('');
  const specBlock = specs.length
    ? `<div class="ll-spec-caret" id="ll-caret-${l.id}" onclick="_llToggleSpecs(${l.id})">Editable specs${ed.length ? ` · ${ed.length}` : ''} ▾</div>
       <div class="ll-spec-list" id="ll-specs-${l.id}" style="display:none">${specRows}</div>`
    : `<span class="ll-nospec">No editable specs</span>`;
  return `<div class="ll-line">
    <div class="ll-line-head">
      <span class="ll-line-name">${_escHtml(l.name || 'Item')}</span>
      <label class="ll-opt" data-needs="select"><input type="checkbox" id="sh-opt-${l.id}" ${l.optional ? 'checked' : ''} onchange="_llAutoSave()"> Optional</label>
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
      <p>Generate the live link in the panel on the left, then your customer’s page appears here — exactly as they’ll see it.</p>
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
/** Debounced auto-save of the live-link settings + per-line controls. */
function _llAutoSave() {
  const kind = _llTab.order === 'live' ? 'order' : 'quote';
  const q = _llShareQuote(kind);
  if (!q) return;
  const s = document.getElementById('ll-autosave'); if (s) s.textContent = 'Saving…';
  if (_llSaveTimer) clearTimeout(_llSaveTimer);
  _llSaveTimer = setTimeout(() => { if (typeof _generateShareLink === 'function') _generateShareLink(q.id, kind); }, 450);
}
/** After a save: the first share re-renders (so the link box + preview appear);
 *  later saves refresh the preview and flash "Saved". @param {boolean} wasShared */
function _llOnSaved(wasShared) {
  const kind = _llTab.order === 'live' ? 'order' : 'quote';
  if (!wasShared) { _llAfterSave(kind); return; }
  const s = document.getElementById('ll-autosave'); if (s) s.textContent = 'Saved ✓';
  _llRenderPreview(kind);
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
  const num = kind === 'order' ? entity.order_number : entity.quote_number;
  const subject = `Your ${noun}${num ? ' ' + num : ''} from ${biz}`;
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
  _llToggleSpecs, _llSpecAll, _llSyncLineControls, _llRenderPreview, _llAfterSave, _sendLiveLink, _orderPdfMenu, _openLiveLinkTab,
  _llAutoSave, _llOnSaved, _llSaveError,
});
