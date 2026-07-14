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
      <div class="ll-preview-stage dp-stage" id="dp-stage-${kind}">
        <div class="dp-loading" id="dp-loading-${kind}">Building preview…</div>
        <div class="dp-pages" id="dp-pages-${kind}"></div>
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
  const pagesEl = document.getElementById(`dp-pages-${kind}`);
  if (!pagesEl) return;
  const rec = _dpRecord(kind);
  if (!rec) return;
  const gen = ++_dpGen[kind];
  /** @type {ArrayBuffer|void} */ let buf;
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
      buf = /** @type {any} */ (await _buildQuotePDF(rec, rows, { output: 'arraybuffer', silent: true }));
    } else if (_dpOrderDocType === 'work_order') {
      buf = /** @type {any} */ (await _buildWorkOrderPDF(rec, { output: 'arraybuffer', silent: true }));
    } else {
      let rows = (_opState.orderId === rec.id && Array.isArray(_opState.lines)) ? _opState.lines
        : (Array.isArray(rec._lines) ? rec._lines : null);
      if (!rows) {
        const { data } = await _db('order_lines').select('*').eq('order_id', rec.id).order('position');
        rows = data || [];
      }
      if (gen !== _dpGen[kind]) return;
      buf = /** @type {any} */ (await _buildOrderDocPDF(rec, rows, /** @type {any} */ (_dpOrderDocType), undefined, { output: 'arraybuffer', silent: true }));
    }
  } catch (e) {
    console.warn('[pdf preview]', /** @type {any} */ (e).message || e);
    return;
  }
  if (gen !== _dpGen[kind] || !buf) return;
  // Snapshot bytes BEFORE pdf.js (getDocument transfers/detaches the buffer)
  // so the iframe fallback still has something to show.
  const blob = new Blob([buf], { type: 'application/pdf' });
  try {
    await _dpRenderPages(kind, gen, buf);
  } catch (e) {
    console.warn('[pdf preview] pdf.js render failed — iframe fallback', /** @type {any} */ (e).message || e);
    if (gen !== _dpGen[kind]) return;
    _dpIframeFallback(kind, blob);
  }
  if (gen !== _dpGen[kind]) return;
  const loading = document.getElementById(`dp-loading-${kind}`);
  if (loading) loading.style.display = 'none';
}

/** Render every page of the PDF onto canvases inside #dp-pages-<kind> — our
 *  own backdrop (var(--bg)) shows between/around pages, unlike Chrome's
 *  unstylable grey iframe viewer. @param {'quote'|'order'} kind
 *  @param {number} gen @param {ArrayBuffer} buf */
async function _dpRenderPages(kind, gen, buf) {
  const pdfjs = await /** @type {any} */ (window)._ensurePdfJs();
  if (gen !== _dpGen[kind]) return;
  // pdf.js v6: destroy() lives on the loadingTask, not the resolved
  // PDFDocumentProxy (doc.destroy no longer exists — calling it throws and
  // silently punts every render to the iframe fallback).
  const loadingTask = pdfjs.getDocument({ data: buf });
  const doc = await loadingTask.promise;
  if (gen !== _dpGen[kind]) { loadingTask.destroy(); return; }
  const stage = document.getElementById(`dp-stage-${kind}`);
  const pagesEl = document.getElementById(`dp-pages-${kind}`);
  if (!stage || !pagesEl) { loadingTask.destroy(); return; }
  const scrollTop = stage.scrollTop; // keep the reader's place across refreshes
  const pageW = Math.min(Math.max(stage.clientWidth - 48, 320), 820);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    if (gen !== _dpGen[kind]) { loadingTask.destroy(); return; }
    const vp1 = page.getViewport({ scale: 1 });
    const scale = pageW / vp1.width;
    const vp = page.getViewport({ scale: scale * dpr });
    const canvas = document.createElement('canvas');
    canvas.className = 'dp-page';
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    // Width only — CSS height:auto + max-width:100% keep the aspect ratio even
    // when a narrow viewport squeezes the page below pageW.
    canvas.style.width = pageW + 'px';
    // pdf.js v6 API: pass the canvas element (canvasContext-only throws).
    await page.render({ canvas, viewport: vp }).promise;
    if (gen !== _dpGen[kind]) { loadingTask.destroy(); return; }
    frag.appendChild(canvas);
  }
  pagesEl.replaceChildren(frag);
  stage.scrollTop = scrollTop;
  loadingTask.destroy();
}

/** pdf.js unavailable (offline first hit / import failure): show the browser's
 *  built-in viewer instead. Grey backdrop, but a working preview beats none.
 *  @param {'quote'|'order'} kind @param {Blob} blob */
function _dpIframeFallback(kind, blob) {
  const pagesEl = document.getElementById(`dp-pages-${kind}`);
  if (!pagesEl) return;
  const url = URL.createObjectURL(blob);
  if (_dpUrl[kind]) { try { URL.revokeObjectURL(/** @type {string} */ (_dpUrl[kind])); } catch (e) {} }
  _dpUrl[kind] = url;
  pagesEl.innerHTML = `<iframe class="ll-preview-frame dp-frame" title="PDF preview" src="${url}#toolbar=0&navpanes=0&view=FitH"></iframe>`;
  pagesEl.classList.add('dp-pages-iframe');
}

Object.assign(window, { _dpTab, _dpReset, _dpActive, _dpTabBar, _dpSwitch, _dpSetDocType, _dpRender, _dpRefresh });
