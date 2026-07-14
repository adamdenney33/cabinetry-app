// ProCabinet — main-window PDF preview sub-tab (quotes + orders).
//
// When a quote/order is open in the sidebar editor, the MAIN pane becomes a
// two-tab surface: "PDF preview" (default — a live iframe of the generated
// PDF, refreshed on every autosave) and the existing cards list. Mirrors the
// Live-link tab's ownership pattern: renderQuoteMain/renderOrdersMain branch
// into _dpRender when the preview tab is active (the Live-link tab still wins
// when IT is active — its guard runs first).
//
// Cross-file deps: _qpState/_opState (quote-editor.js / orders.js),
// quotes/orders (arrays), _llTab (livelink.js), _buildQuotePDF /
// _buildOrderDocPDF / _buildWorkOrderPDF (cutlist-pdf.js), printQuote /
// printOrderDoc (quote-editor.js), _db (db.js), _escHtml (ui.js).

/** Which main-pane sub-tab is active per section. 'pdf' = live PDF preview
 *  (default when a record opens), 'cards' = the classic cards list.
 *  @type {{quote:'pdf'|'cards', order:'pdf'|'cards'}} */
let _dpTab = { quote: 'pdf', order: 'pdf' };

/** Order document type shown in the preview (persisted — makers usually live
 *  in one doc type). @type {string} */
let _dpOrderDocType = localStorage.getItem('pc_dp_doctype') || 'order_confirmation';

/** Monotonic generation counter per kind — a stale async build must never
 *  overwrite a newer one. @type {{quote:number, order:number}} */
let _dpGen = { quote: 0, order: 0 };

/** Last object URL per kind, revoked when replaced. @type {{quote:string|null, order:string|null}} */
let _dpUrl = { quote: null, order: null };

/** Reset to the PDF tab (call when a record opens). @param {'quote'|'order'} kind */
function _dpReset(kind) { _dpTab[kind] = 'pdf'; }

/** True when the preview surface owns the main pane decision: a record is open
 *  and the Live-link tab hasn't claimed the pane. @param {'quote'|'order'} kind */
function _dpActive(kind) {
  if (typeof _llTab !== 'undefined' && _llTab[kind] === 'live') return false;
  if (kind === 'quote') return typeof _qpState !== 'undefined' && _qpState && _qpState.quoteId != null;
  return typeof _opState !== 'undefined' && _opState && _opState.orderId != null;
}

/** The main-pane sub-tab bar (reuses the sidebar .ll-tabs styling).
 *  @param {'quote'|'order'} kind @returns {string} */
function _dpTabBar(kind) {
  const pdfOn = _dpTab[kind] === 'pdf';
  const cardsLabel = kind === 'quote' ? 'Quotes' : 'Orders';
  return `<div class="ll-tabs dp-tabs">
    <div class="ll-tab${pdfOn ? ' active' : ''}" onclick="_dpSwitch('${kind}','pdf')">PDF preview</div>
    <div class="ll-tab${pdfOn ? '' : ' active'}" onclick="_dpSwitch('${kind}','cards')">${cardsLabel}</div>
  </div>`;
}

/** @param {'quote'|'order'} kind @param {'pdf'|'cards'} tab */
function _dpSwitch(kind, tab) {
  _dpTab[kind] = tab;
  if (kind === 'quote') { if (typeof renderQuoteMain === 'function') renderQuoteMain(); }
  else { if (typeof renderOrdersMain === 'function') renderOrdersMain(); }
}

/** @param {string} t */
function _dpSetDocType(t) {
  _dpOrderDocType = t;
  try { localStorage.setItem('pc_dp_doctype', t); } catch (e) {}
  _dpRefresh('order');
}

/** The open record for a kind. @param {'quote'|'order'} kind @returns {any} */
function _dpRecord(kind) {
  if (kind === 'quote') return _qpState.quoteId ? quotes.find(/** @param {any} q */ q => q.id === _qpState.quoteId) : null;
  return _opState.orderId ? orders.find(/** @param {any} o */ o => o.id === _opState.orderId) : null;
}

/** Render (or refresh) the preview surface into the main pane. Called from
 *  renderQuoteMain/renderOrdersMain when the PDF tab is active. If the shell
 *  already exists, only the iframe is refreshed — no DOM rebuild, no flash.
 *  @param {'quote'|'order'} kind */
function _dpRender(kind) {
  const host = document.getElementById(kind === 'quote' ? 'quote-main' : 'orders-main');
  if (!host) return;
  if (document.getElementById(`dp-wrap-${kind}`)) { _dpRefresh(kind); return; }
  const rec = _dpRecord(kind);
  const dl = kind === 'quote'
    ? `printQuote(${rec ? rec.id : 0},'pdf')`
    : `printOrderDoc(${rec ? rec.id : 0},'${_dpOrderDocType}')`;
  const docPicker = kind === 'order' ? `
    <select class="lib-sort-select dp-doc-select" onchange="_dpSetDocType(this.value)">
      <option value="order_confirmation"${_dpOrderDocType==='order_confirmation'?' selected':''}>Order Confirmation</option>
      <option value="proforma"${_dpOrderDocType==='proforma'?' selected':''}>Pro-forma Invoice</option>
      <option value="invoice"${_dpOrderDocType==='invoice'?' selected':''}>Invoice</option>
      <option value="work_order"${_dpOrderDocType==='work_order'?' selected':''}>Work Order</option>
    </select>` : '';
  host.innerHTML = `<div class="dp-shell" id="dp-wrap-${kind}">
    ${_dpTabBar(kind)}
    <div class="ll-preview-wrap dp-preview-wrap">
      <div class="ll-preview-bar"><span class="ll-preview-label">PDF preview · updates as you edit</span>
        ${docPicker}
        <button class="btn btn-outline ll-preview-open" onclick="${dl}">Download</button></div>
      <div class="ll-preview-stage dp-stage">
        <div class="dp-loading" id="dp-loading-${kind}">Building preview…</div>
        <iframe class="ll-preview-frame dp-frame" id="dp-frame-${kind}" title="PDF preview" style="visibility:hidden"></iframe>
      </div>
    </div>
  </div>`;
  _dpRefresh(kind);
}

/** @type {{quote:any, order:any}} */
let _dpRefreshTimer = { quote: null, order: null };

/** Debounced regenerate + swap of the preview iframe (autosave calls land
 *  here via renderQuoteMain/renderOrdersMain). @param {'quote'|'order'} kind */
function _dpRefresh(kind) {
  if (_dpRefreshTimer[kind]) clearTimeout(_dpRefreshTimer[kind]);
  _dpRefreshTimer[kind] = setTimeout(() => { _dpRefreshTimer[kind] = null; _dpBuild(kind); }, 250);
}

/** @param {'quote'|'order'} kind */
async function _dpBuild(kind) {
  const frame = /** @type {HTMLIFrameElement|null} */ (document.getElementById(`dp-frame-${kind}`));
  if (!frame) return;
  const rec = _dpRecord(kind);
  if (!rec) return;
  const gen = ++_dpGen[kind];
  /** @type {string|void} */ let url;
  try {
    if (kind === 'quote') {
      // The editor's in-memory rows are the freshest truth (autosave may still
      // be in flight); fall back to the cached hydrate, then a fetch.
      let rows = (_qpState.quoteId === rec.id && Array.isArray(_qpState.lines)) ? _qpState.lines
        : (Array.isArray(rec._lines) ? rec._lines : null);
      if (!rows) {
        const { data } = await _db('quote_lines').select('*').eq('quote_id', rec.id).order('position');
        rows = data || [];
      }
      if (gen !== _dpGen[kind]) return;
      url = await _buildQuotePDF(rec, rows, { output: 'bloburl', silent: true });
    } else if (_dpOrderDocType === 'work_order') {
      url = await _buildWorkOrderPDF(rec, { output: 'bloburl', silent: true });
    } else {
      let rows = (_opState.orderId === rec.id && Array.isArray(_opState.lines)) ? _opState.lines
        : (Array.isArray(rec._lines) ? rec._lines : null);
      if (!rows) {
        const { data } = await _db('order_lines').select('*').eq('order_id', rec.id).order('position');
        rows = data || [];
      }
      if (gen !== _dpGen[kind]) return;
      url = await _buildOrderDocPDF(rec, rows, /** @type {any} */ (_dpOrderDocType), undefined, { output: 'bloburl', silent: true });
    }
  } catch (e) {
    console.warn('[pdf preview]', /** @type {any} */ (e).message || e);
    return;
  }
  if (gen !== _dpGen[kind] || !url) return;
  if (_dpUrl[kind]) { try { URL.revokeObjectURL(/** @type {string} */ (_dpUrl[kind])); } catch (e) {} }
  _dpUrl[kind] = url;
  // Hide Chrome's PDF chrome where supported; harmless elsewhere.
  frame.src = url + '#toolbar=0&navpanes=0&view=FitH';
  frame.style.visibility = '';
  const loading = document.getElementById(`dp-loading-${kind}`);
  if (loading) loading.style.display = 'none';
}

Object.assign(window, { _dpTab, _dpReset, _dpActive, _dpTabBar, _dpSwitch, _dpSetDocType, _dpRender, _dpRefresh });
