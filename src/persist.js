// ProCabinet — persist active section + open editor entity IDs across refresh.
//
// Single audit point for all "what was open at refresh" keys.
// Independent of pc_cb_editing_quote_id / pc_cb_editing_order_id, which bind
// the Cabinet Builder to its parent entity. These keys track which entity is
// open in the quote / order / cutlist sidebar editors so reload restores it.
//
// Data itself is not stored here — entity contents reload from the DB via the
// existing load functions (loadQuoteIntoSidebar, loadOrderIntoSidebar,
// loadProject, _clLoadCutlist, _clDoOpenLibraryCutlist, _doOpenCabinet).

(function () {
  const SECTIONS = ['dashboard','cutlist','stock','cabinet','quote','orders','clients','schedule'];

  // Suppresses writes from _persistCutlistCtx until the auth handler's
  // restoreAppState() has had a chance to read the saved value. Without
  // this, the synchronous INIT block in app.js calls _clRenderContext
  // with empty in-memory state and overwrites the saved key before
  // restore runs. Flipped to true by restoreAppState's finally block.
  let _initComplete = false;

  /** @param {string} name */
  function saveSection(name) {
    if (SECTIONS.indexOf(name) !== -1) localStorage.setItem('pcCurrentPage', name);
  }
  function loadSection() {
    const v = localStorage.getItem('pcCurrentPage');
    return SECTIONS.indexOf(/** @type {string} */ (v)) !== -1 ? v : null;
  }

  /** @param {number | null} id */
  function saveOpenQuoteId(id) {
    if (id == null) localStorage.removeItem('pc_open_quote_id');
    else localStorage.setItem('pc_open_quote_id', String(id));
  }
  function loadOpenQuoteId() {
    const v = localStorage.getItem('pc_open_quote_id');
    const n = v == null ? NaN : parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  /** @param {number | null} id */
  function saveOpenOrderId(id) {
    if (id == null) localStorage.removeItem('pc_open_order_id');
    else localStorage.setItem('pc_open_order_id', String(id));
  }
  function loadOpenOrderId() {
    const v = localStorage.getItem('pc_open_order_id');
    const n = v == null ? NaN : parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }

  /** @param {{projectId?: number|null, cabinetId?: number|null, cutlistId?: number|null, mainView?: string} | null} ctx */
  function saveOpenCutlistCtx(ctx) {
    const empty = !ctx
      || (ctx.projectId == null
          && ctx.cabinetId == null
          && ctx.cutlistId == null
          && (!ctx.mainView || ctx.mainView === 'cutlists'));
    if (empty) {
      // Suppress removes until restoreAppState has run — INIT-time renders
      // call _clRenderContext with empty in-memory state and would otherwise
      // wipe the saved key before restore can read it.
      if (!_initComplete) return;
      localStorage.removeItem('pc_open_cutlist_ctx');
      return;
    }
    try { localStorage.setItem('pc_open_cutlist_ctx', JSON.stringify(ctx)); } catch (e) { /* quota */ }
  }
  function loadOpenCutlistCtx() {
    try { return JSON.parse(localStorage.getItem('pc_open_cutlist_ctx') || 'null'); }
    catch (e) { return null; }
  }

  function clearAllOpenKeys() {
    localStorage.removeItem('pc_open_quote_id');
    localStorage.removeItem('pc_open_order_id');
    localStorage.removeItem('pc_open_cutlist_ctx');
  }

  async function restoreAppState() {
    const w = /** @type {any} */ (window);
    w._pcSuppressToasts = true;
    try {
      const section = loadSection();
      if (section && typeof w.switchSection === 'function') {
        try { w.switchSection(section); } catch (e) { /* fall back to default */ }
      }

      // quotes / orders are top-level lets in their carve files (not on
      // window); reference them lexically via the shared global lexical
      // env. Use typeof guards because persist.js loads before those
      // files in the defer order — by the time this function runs, the
      // bindings exist, but we still tolerate the unlikely "not declared"
      // case to avoid a ReferenceError.
      const qId = loadOpenQuoteId();
      if (qId != null) {
        // @ts-ignore - quotes is a top-level let from quotes.js
        const qArr = typeof quotes !== 'undefined' ? quotes : null;
        if (Array.isArray(qArr) && qArr.length > 0) {
          if (qArr.find(/** @param {any} q */ q => q.id === qId)) {
            if (typeof w.loadQuoteIntoSidebar === 'function') {
              try { await w.loadQuoteIntoSidebar(qId); } catch (e) { saveOpenQuoteId(null); }
            }
          } else {
            saveOpenQuoteId(null);
          }
        }
        // If qArr is empty / undefined, leave the key alone — data may not be loaded yet.
      }

      const oId = loadOpenOrderId();
      if (oId != null) {
        // @ts-ignore - orders is a top-level let from orders.js
        const oArr = typeof orders !== 'undefined' ? orders : null;
        if (Array.isArray(oArr) && oArr.length > 0) {
          if (oArr.find(/** @param {any} o */ o => o.id === oId)) {
            if (typeof w.loadOrderIntoSidebar === 'function') {
              try { await w.loadOrderIntoSidebar(oId); } catch (e) { saveOpenOrderId(null); }
            }
          } else {
            saveOpenOrderId(null);
          }
        }
      }

      const ctx = loadOpenCutlistCtx();
      if (ctx) {
        // @ts-ignore - projects is a top-level let from projects.js
        const projArr = typeof projects !== 'undefined' ? projects : null;
        let restored = false;
        let canValidate = false;
        try {
          if (ctx.cabinetId && typeof w._doOpenCabinet === 'function') {
            // Cabinet IDs come from a separate library; no easy pre-check
            // array, so attempt the open and let it no-op on miss.
            await w._doOpenCabinet(ctx.cabinetId, '');
            if (ctx.cutlistId && typeof w._clLoadCutlist === 'function') {
              await w._clLoadCutlist(ctx.cutlistId);
            }
            restored = true;
          } else if (ctx.projectId) {
            canValidate = Array.isArray(projArr) && projArr.length > 0;
            const projExists = canValidate && projArr && projArr.find(/** @param {any} p */ p => p.id === ctx.projectId);
            if (projExists && typeof w.loadProject === 'function') {
              await w.loadProject(ctx.projectId);
              if (ctx.cutlistId && typeof w._clLoadCutlist === 'function') {
                await w._clLoadCutlist(ctx.cutlistId);
              }
              restored = true;
            } else if (canValidate) {
              // Array was populated but project not found → it was deleted.
              // Bypass saveOpenCutlistCtx's _initComplete gate (still false here).
              localStorage.removeItem('pc_open_cutlist_ctx');
            }
            // If !canValidate, leave the key for the next page load.
          } else if (ctx.cutlistId && typeof w._clDoOpenLibraryCutlist === 'function') {
            await w._clDoOpenLibraryCutlist(ctx.cutlistId);
            restored = true;
          }
          if (restored && ctx.mainView && typeof w.switchCLMainView === 'function') {
            w.switchCLMainView(ctx.mainView);
          }
        } catch (e) {
          if (canValidate) localStorage.removeItem('pc_open_cutlist_ctx');
        }
      }
    } finally {
      w._pcSuppressToasts = false;
      _initComplete = true;
    }
  }

  const W = /** @type {any} */ (window);
  W._pcSaveSection = saveSection;
  W._pcLoadSection = loadSection;
  W._pcSaveOpenQuoteId = saveOpenQuoteId;
  W._pcLoadOpenQuoteId = loadOpenQuoteId;
  W._pcSaveOpenOrderId = saveOpenOrderId;
  W._pcLoadOpenOrderId = loadOpenOrderId;
  W._pcSaveOpenCutlistCtx = saveOpenCutlistCtx;
  W._pcLoadOpenCutlistCtx = loadOpenCutlistCtx;
  W._pcClearAllOpenKeys = clearAllOpenKeys;
  W._restoreAppState = restoreAppState;
})();
