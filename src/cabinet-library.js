// ProCabinet — Cabinet library + smart-suggest dropdowns (extracted from cabinet.js, R.1 split)

// ── Position suggest box as fixed overlay (avoids overflow clipping) ──
// Anchored to the input's left edge; grows rightward to fit content on one
// line (never narrower than the input, capped so it can't run past the
// viewport's right edge).
/** @param {HTMLElement | null} input @param {HTMLElement | null} box */
function _posSuggest(input, box) {
  if (!input || !box) return;
  const r = (input.parentElement || input).getBoundingClientRect();
  box.style.position = 'fixed';
  box.style.left = r.left + 'px';
  box.style.width = 'auto';
  box.style.minWidth = r.width + 'px';
  box.style.maxWidth = Math.max(160, window.innerWidth - r.left - 12) + 'px';
  box.style.right = 'auto';
  const spaceBelow = window.innerHeight - r.bottom;
  if (spaceBelow < 220) {
    box.style.top = 'auto';
    box.style.bottom = (window.innerHeight - r.top) + 'px';
    box.style.borderRadius = '8px 8px 0 0';
  } else {
    box.style.top = r.bottom + 'px';
    box.style.bottom = 'auto';
    box.style.borderRadius = '0 0 8px 8px';
  }
}

// ── Cabinet Library Panel ──
/** @param {string} panel */
function toggleCabPanel(panel) {
  const library = _byId('cb-library-panel');
  if (panel === 'library' && library) {
    library.style.display = library.style.display === 'none' ? '' : 'none';
  }
}
function toggleCabLibrary() { toggleCabPanel('library'); }

/** @param {string} name */
function _cbSaveCabByName(name) {
  if (!name || !name.trim()) { _toast('Enter a cabinet name', 'error'); return; }
  if (cbScratchpad) cbScratchpad.name = name.trim();
  cbSaveToLibrary();
}
/** @param {string} name */
function _saveStockLibByName(name) {
  if (!name || !name.trim()) { _toast('Enter a library name', 'error'); return; }
  saveStockLibrary(name.trim());
}

// Column spec shared by export + header-mapped import. Aliases include the
// pre-2026-06 export headers so old files keep importing cleanly.
const _CABLIB_CSV_COLS = /** @type {Record<string, string[]>} */ ({
  name:              ['name'],
  type:              ['type', 'preset'],
  room:              ['room'],
  w:                 ['width', 'w', 'widthmm'],
  h:                 ['height', 'h', 'heightmm'],
  d:                 ['depth', 'd', 'depthmm'],
  qty:               ['qty', 'quantity'],
  material:          ['material', 'carcassmaterial'],
  backMat:           ['backmaterial', 'back'],
  finish:            ['finish'],
  carcassType:       ['carcasstype', 'carcass'],
  construction:      ['construction'],
  baseType:          ['base', 'basetype'],
  doors:             ['doors', 'doorcount'],
  doorMat:           ['doormaterial'],
  doorType:          ['doortype'],
  doorFinish:        ['doorfinish'],
  doorPct:           ['door', 'doorpct', 'doorheight'],
  drawers:           ['drawers', 'drawercount'],
  drawerFrontMat:    ['frontmaterial', 'drawerfrontmaterial'],
  drawerFrontType:   ['drawerfronttype', 'fronttype'],
  drawerFrontFinish: ['drawerfrontfinish', 'frontfinish'],
  drawerInnerMat:    ['innermaterial', 'drawerinnermaterial', 'drawerboxmaterial'],
  drawerBoxType:     ['drawerboxtype', 'boxtype'],
  drawerBoxFinish:   ['drawerboxfinish', 'boxfinish'],
  drawerPct:         ['drawer', 'drawerpct', 'drawerheight'],
  shelves:           ['fixedshelves', 'shelves'],
  adjShelves:        ['adjshelves', 'adjustableshelves'],
  looseShelves:      ['looseshelves'],
  partitions:        ['partitions'],
  endPanels:         ['endpanels'],
  labourHrs:         ['labourhrs', 'labourhours', 'laborhours'],
  labourOverride:    ['labouroverride', 'laboroverride'],
  matCostOverride:   ['materialcostoverride', 'matcostoverride', 'costoverride'],
  hardware:          ['hardware'],
  doorHardware:      ['doorhardware'],
  drawerHardware:    ['drawerhardware'],
  shelfHardware:     ['shelfhardware'],
  drawerFrontHardware: ['drawerfronthardware'],
  extras:            ['extras'],
  notes:             ['notes', 'note'],
});

function cbExportLibrary() {
  if (!_enforceProFeature()) return;
  if (!cbLibrary.length) { _toast('No cabinets in library', 'error'); return; }
  /** @type {any[][]} */
  const rows = [['Name','Type','Room','Width','Height','Depth','Qty','Material','Back Material','Finish','Carcass Type','Construction','Base','Doors','Door Material','Door Type','Door Finish','Door %','Drawers','Front Material','Drawer Front Type','Drawer Front Finish','Inner Material','Drawer Box Type','Drawer Box Finish','Drawer %','Fixed Shelves','Adj Shelves','Loose Shelves','Partitions','End Panels','Labour Hrs','Labour Override','Material Cost Override','Hardware','Door Hardware','Drawer Hardware','Shelf Hardware','Drawer Front Hardware','Extras','Notes']];
  /** @param {any[]} arr */
  const json = arr => (Array.isArray(arr) && arr.length) ? JSON.stringify(arr) : '';
  cbLibrary.forEach(c => {
    rows.push([
      c._libName||c.name||'Cabinet', c.cabType||c.type||'', c.room||'', c.w, c.h, c.d, c.qty||1,
      c.material||'', c.backMat||'', c.finish||'None', c.carcassType||'', c.construction||'Overlay', c.baseType||'None',
      c.doors||0, c.doorMat||'', c.doorType||'', c.doorFinish||'', c.doorPct||95,
      c.drawers||0, c.drawerFrontMat||'', c.drawerFrontType||'', c.drawerFrontFinish||'', c.drawerInnerMat||'', c.drawerBoxType||'', c.drawerBoxFinish||'', c.drawerPct||85,
      c.shelves||0, c.adjShelves||0, c.looseShelves||0, c.partitions||0, c.endPanels||0,
      c.labourHrs||0, c.labourOverride ? 'TRUE' : 'FALSE', c.matCostOverride ?? '',
      json(c.hwItems), json(c.doorHwItems), json(c.drawerHwItems), json(c.shelfHwItems), json(c.drawerFrontHwItems), json(c.extras), c.notes||'',
    ]);
  });
  _csvDownload(rows, 'cabinet-library.csv');
  _toast('Library exported as CSV', 'success');
}

function cbImportLibrary() {
  if (!_enforceProFeature()) return;
  _csvPickFile(rows => {
    const col = _csvCol(rows[0], _CABLIB_CSV_COLS);
    // Headerless file → legacy export order.
    const legacyKeys = ['name','w','h','d','qty','material','backMat','finish','construction','baseType','doors','doorMat','doorPct','drawers','drawerFrontMat','drawerInnerMat','drawerPct','shelves','adjShelves','looseShelves','partitions','endPanels'];
    const start = col ? 1 : 0;
    /** @param {string[]} r @param {string} key */
    const get = (r, key) => col ? col(r, key) : ((r[legacyKeys.indexOf(key)] ?? '').trim());
    // Free-tier cap on cabinet_templates: refuse the import outright if we'd
    // bust the cap. Pro users and trial users skip the check.
    if (typeof _hasProAccess === 'function' && !_hasProAccess()) {
      const room = FREE_LIMITS.cabinet_templates - _realCount(cbLibrary);
      const incoming = rows.length - start;
      if (room <= 0) { _openLimitHitModal('cabinet_templates'); return; }
      if (incoming > room) { _toast(`Free plan only allows ${room} more cabinet${room === 1 ? '' : 's'}. Upgrade for unlimited.`, 'error'); _openLimitHitModal('cabinet_templates'); return; }
    }
    /** @param {string} v */
    const jsonArr = v => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch (e) { return null; } };
    let imported = 0;
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      const name = get(r, 'name');
      if (!name) continue;
      // Build from the preset when a Type column is present so unspecified
      // fields inherit that preset's defaults, then override from the CSV.
      const type = get(r, 'type');
      /** @type {any} */
      const cab = cbDefaultLine(type || undefined);
      cab.id = Date.now() + Math.random();
      if (type) cab.type = type;   // persisted via default_specs; cabinet_templates.type reads it
      cab._libName = name; cab.name = name;
      cab.w = parseFloat(get(r, 'w'))||600; cab.h = parseFloat(get(r, 'h'))||720; cab.d = parseFloat(get(r, 'd'))||560;
      cab.qty = parseInt(get(r, 'qty'))||1;
      cab.material = get(r, 'material')||cab.material; cab.backMat = get(r, 'backMat')||cab.backMat;
      cab.finish = get(r, 'finish')||cab.finish||'None';
      cab.carcassType = get(r, 'carcassType')||cab.carcassType;
      cab.construction = get(r, 'construction')||cab.construction||'Overlay';
      cab.baseType = get(r, 'baseType')||cab.baseType||'None';
      cab.room = get(r, 'room')||cab.room;
      cab.doors = parseInt(get(r, 'doors'))||0;
      cab.doorMat = get(r, 'doorMat')||cab.material;
      cab.doorType = get(r, 'doorType')||cab.doorType;
      cab.doorFinish = get(r, 'doorFinish')||cab.doorFinish;
      cab.doorPct = parseInt(get(r, 'doorPct'))||95;
      cab.drawers = parseInt(get(r, 'drawers'))||0;
      cab.drawerFrontMat = get(r, 'drawerFrontMat')||cab.material;
      cab.drawerFrontType = get(r, 'drawerFrontType')||cab.drawerFrontType;
      cab.drawerFrontFinish = get(r, 'drawerFrontFinish')||cab.drawerFrontFinish;
      cab.drawerInnerMat = get(r, 'drawerInnerMat')||cab.backMat;
      cab.drawerBoxType = get(r, 'drawerBoxType')||cab.drawerBoxType;
      cab.drawerBoxFinish = get(r, 'drawerBoxFinish')||cab.drawerBoxFinish;
      cab.drawerPct = parseInt(get(r, 'drawerPct'))||85;
      cab.shelves = parseInt(get(r, 'shelves'))||0; cab.adjShelves = parseInt(get(r, 'adjShelves'))||0;
      cab.looseShelves = parseInt(get(r, 'looseShelves'))||0; cab.partitions = parseInt(get(r, 'partitions'))||0;
      cab.endPanels = parseInt(get(r, 'endPanels'))||0;
      cab.labourHrs = parseFloat(get(r, 'labourHrs'))||0;
      cab.labourOverride = /^(true|yes|1)$/i.test(get(r, 'labourOverride'));
      const mco = parseFloat(get(r, 'matCostOverride'));
      cab.matCostOverride = isFinite(mco) ? mco : null;
      cab.hwItems = jsonArr(get(r, 'hardware')) || cab.hwItems;
      cab.doorHwItems = jsonArr(get(r, 'doorHardware')) || cab.doorHwItems;
      cab.drawerHwItems = jsonArr(get(r, 'drawerHardware')) || cab.drawerHwItems;
      cab.shelfHwItems = jsonArr(get(r, 'shelfHardware')) || cab.shelfHwItems;
      cab.drawerFrontHwItems = jsonArr(get(r, 'drawerFrontHardware')) || cab.drawerFrontHwItems;
      cab.extras = jsonArr(get(r, 'extras')) || cab.extras;
      cab.notes = get(r, 'notes')||cab.notes;
      cbLibrary.push(cab); imported++;
    }
    renderCBLibraryView();
    _toast(imported + ' cabinets imported', 'success');
    const p = _byId('cb-library-panel'); if (p) p.style.display = '';
    const newEntries = cbLibrary.slice(-imported);
    Promise.all(newEntries.map(e => _saveCabinetToDB(e).then(id => { if (id) e.db_id = id; })))
      .catch(err => console.warn('[cabinet-template bulk save]', err.message || err));
  });
}

function cbSaveToLibrary() {
  const line = cbScratchpad;
  if (!line) { _toast('Open a cabinet first', 'error'); return; }
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('cabinet_templates', _realCount(cbLibrary))) return;
  const copy = JSON.parse(JSON.stringify(line));
  copy.id = Date.now();
  const libName = copy.name || copy.type || (typeof _cbNextCabinetName === 'function' ? _cbNextCabinetName(true) : 'Cabinet');
  copy._libName = libName;
  copy.name = libName;
  cbLibrary.push(copy);
  if (typeof switchCBMainView === 'function') switchCBMainView('library');
  renderCBLibraryView();
  _toast(`"${copy._libName}" saved to library`, 'success');
  _saveCabinetToDB(copy).then(id => { if (id) copy.db_id = id; });
}

/** Save a specific Quote Builder cabinet line (by index) to the library as a
 *  reusable template. Mirrors cbSaveToLibrary but doesn't depend on the
 *  scratchpad — used by the per-row "Add to Library" button.
 *  @param {number} idx */
function cbAddLineToLibrary(idx) {
  const line = cbLines[idx];
  if (!line) { _toast('Cabinet not found', 'error'); return; }
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('cabinet_templates', _realCount(cbLibrary))) return;
  const copy = JSON.parse(JSON.stringify(line));
  copy.id = Date.now();
  const libName = copy.name || copy.type || (typeof _cbNextCabinetName === 'function' ? _cbNextCabinetName(true) : 'Cabinet');
  copy._libName = libName;
  copy.name = libName;
  cbLibrary.push(copy);
  renderCBLibraryView();
  _toast(`"${copy._libName}" added to library`, 'success');
  _saveCabinetToDB(copy).then(id => { if (id) copy.db_id = id; });
}
/** @type {any} */ (window).cbAddLineToLibrary = cbAddLineToLibrary;

/** @param {number} idx */
function cbLoadFromLibrary(idx) {
  const src = cbLibrary[idx];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cbNextId++;
  delete copy._libName;
  if (typeof _cbNextCabinetName === 'function' && !copy.name) copy.name = _cbNextCabinetName(false);
  cbLines.push(copy);
  cbEditingLineIdx = cbLines.length - 1;
  cbScratchpad = copy;
  saveCBLines();
  renderCBPanel();
  switchCBMainView('results');
  _toast(`"${src._libName}" loaded to editor`, 'success');
}

/** @param {number} idx */
function cbAddFromLibrary(idx) {
  const src = cbLibrary[idx];
  if (!src) return;
  // "Add to Quote" targets the quote (or order) currently open in the Quote
  // Builder. With nothing open, the autosave path mints a brand-new draft
  // quote nobody asked for — block that and send the user to pick a quote.
  if (!cbEditingQuoteId && !cbEditingOrderId) {
    if (typeof switchCBMainView === 'function') switchCBMainView('results');
    _toast('Open or start a quote first, then add from the library', 'info');
    return;
  }
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cbNextId++;
  delete copy._libName;
  if (typeof _cbNextCabinetName === 'function' && !copy.name) copy.name = _cbNextCabinetName(false);
  cbLines.push(copy);
  saveCBLines();
  renderCBPanel();
  if (typeof switchCBMainView === 'function') switchCBMainView('results');
  _toast(`"${src._libName}" added to quote`, 'success');
}

/** @param {number} idx */
function cbRemoveFromLibrary(idx) {
  const removed = cbLibrary[idx];
  cbLibrary.splice(idx, 1);
  if (cbEditingLibraryIdx === idx) {
    cbEditingLibraryIdx = -1;
    cbScratchpad = null;
    renderCBPanel();
  } else {
    if (cbEditingLibraryIdx > idx) cbEditingLibraryIdx--;
    renderCBLibraryView();
  }
  if (removed?.db_id) _deleteCabinetFromDB(removed.db_id);
}

/** Click-to-edit handler for library cards. Points the editor at the live
 *  cbLibrary[idx] entry — edits autosave to cabinet_templates via the
 *  _cbScheduleAutosave routing.
 *  @param {number} idx */
function cbEditLibraryEntry(idx) {
  const src = cbLibrary[idx];
  if (!src) return;
  cbScratchpad = src; // reference, NOT a copy
  cbEditingLineIdx = -1;
  cbEditingLibraryIdx = idx;
  if (window._mvShowEditor) window._mvShowEditor();
  renderCBPanel();
  _scrollCBEditorIntoView();
}

/** Exit library-edit mode. Clears the active library reference and returns
 *  the editor to a fresh blank scratchpad. */
function _cbExitLibraryEdit() {
  cbEditingLibraryIdx = -1;
  cbScratchpad = null;
  renderCBPanel();
  if (typeof switchCBMainView === 'function') switchCBMainView('library');
}
/** @type {any} */ (window)._cbExitLibraryEdit = _cbExitLibraryEdit;

/** @param {number} idx */
function cbDuplicateLibraryEntry(idx) {
  const src = cbLibrary[idx];
  if (!src) return;
  if (!_enforceFreeLimit('cabinet_templates', _realCount(cbLibrary))) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = Date.now();
  copy._libName = (src._libName || src.name || 'Cabinet') + ' (copy)';
  delete copy.db_id;
  cbLibrary.push(copy);
  renderCBLibraryView();
  _saveCabinetToDB(copy).then(id => { if (id) copy.db_id = id; });
  _toast(`"${copy._libName}" added to library`, 'success');
}

/** @param {HTMLInputElement} input */
function _cbCabinetSearchInput(input) {
  if (cbScratchpad) {
    cbScratchpad.name = input.value.trim();
    if (cbEditingLibraryIdx >= 0) cbScratchpad._libName = cbScratchpad.name;
    if (typeof _cbScheduleAutosave === 'function') _cbScheduleAutosave();
  }
  _smartCBLibrarySuggest(input, 'cb-cabinet-suggest');
}

/** @param {HTMLInputElement} input @param {string} boxId */
function _smartCBLibrarySuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  // Show the full library when the value already exactly matches a template
  // (an entry is selected — user is opening to browse, not searching). Only
  // filter once the text no longer matches, i.e. the pick was edited/deleted.
  const isExisting = cbLibrary.some(c => (c._libName||c.name||'').toLowerCase() === q);
  const matches = (q && !isExisting) ? cbLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(q)) : cbLibrary;
  let html = '';
  matches.slice(0, 8).forEach(c => {
    const idx = cbLibrary.indexOf(c);
    const calc = calcCBLine(c);
    html += `<div class="client-suggest-item" onmousedown="cbLoadFromLibrary(${idx});_hideEl('${boxId}')">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">C</span>
      <span style="flex:1">${_escHtml(c._libName||c.name||'Cabinet')}</span>
      <span style="font-size:10px;color:var(--muted)">${c.w}×${c.h}</span>
      <span style="font-size:10px;font-weight:700;color:var(--accent)">${cur}${Math.round(calc.lineSubtotal)}</span>
    </div>`;
  });
  if (matches.length === 0) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No matching templates in library</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

// ── Rates Stock Smart Suggest ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartRatesStockSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => { const cat = _scGet(s.id) || s.category; return cat === 'Sheet Goods' || cat === 'Solid Timber' || cat === 'Edge Banding' || (!cat && (s.w ?? 0) > 0 && (s.h ?? 0) > 0); });
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_setElVal('rates-stock-search','');_hideEl('${boxId}');_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${dims ? dims + ' · ' : ''}${cur}${s.cost}/sheet</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock material</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// ── Rates Finish Smart Suggest ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartRatesFinishSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Finishing');
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_setElVal('rates-finish-search','');_hideEl('${boxId}');_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m²</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewCBFinishPopup()">+ Add new finish to stock</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// ── Rates Edge Banding Smart Suggest ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartRatesEdgeSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Edge Banding');
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_setElVal('rates-edge-search','');_hideEl('${boxId}');_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new edge banding to stock</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// ── Cabinet Material Smart Suggest ──
/** @param {HTMLInputElement} input @param {string} boxId @param {string} fieldName */
function _smartCBMaterialSuggest(input, boxId, fieldName) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => { const cat = _scGet(s.id) || s.category; return cat === 'Sheet Goods' || cat === 'Solid Timber' || cat === 'Edge Banding' || (!cat && (s.w ?? 0) > 0 && (s.h ?? 0) > 0); });
  // Show all when the value already matches a stock item (an entry is selected —
  // opening to browse, not searching). Filter only once the pick is edited/deleted.
  const isExisting = pool.some(s => s.name.toLowerCase() === q);
  const matches = (q && !isExisting) ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_setElVal('cb-mat-${fieldName}','${_escHtml(s.name)}');cbUpdateField('${fieldName}','${_escHtml(s.name)}');_hideEl('${boxId}')">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${dims ? dims + ' · ' : ''}${cur}${s.cost}/sheet</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock material</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {HTMLInputElement} input @param {string} boxId @param {string} [fieldName] */
function _smartCBFinishSuggest(input, boxId, fieldName) {
  const field = fieldName || 'finish';
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Finishing');
  // Show all when the value is the 'None' placeholder or already matches an existing
  // pool item (user is opening to pick, not typing a search).
  const isExisting = q === 'none' || pool.some(s => s.name.toLowerCase() === q);
  const matches = (q && !isExisting) ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_setElVal('cb-mat-${field}','${_escHtml(s.name)}');cbUpdateField('${field}','${_escHtml(s.name)}');_hideEl('${boxId}')">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewCBFinishPopup('${field}')">+ Add new finish to stock</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {string} fieldName */
function _openNewCBMaterialPopup(fieldName) {
  const existing = _byId('cb-mat-' + fieldName)?.value || '';
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Material</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Material Name</label><input class="pf-input pf-input-lg" id="pnm-name" value="${_escHtml(existing)}"></div>
      <div class="pf"><label class="pf-label">Price per Sheet</label><input class="pf-input" id="pnm-price" type="number" value="0" step="0.01"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewCBMaterial('${fieldName}')">Add Material</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnm-name')?.focus(), 50);
}

/** @param {string} fieldName */
function _saveNewCBMaterial(fieldName) {
  const name = _popupVal('pnm-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnm-price')) || 0;
  if (!cbSettings.materials.some(/** @param {any} m */ m => m.name === name)) {
    cbSettings.materials.push({ name, price });
    saveCBSettings();
  }
  cbUpdateField(fieldName, name);
  const inp = _byId('cb-mat-' + fieldName);
  if (inp) inp.value = name;
  _closePopup();
  _toast('"' + name + '" added to materials', 'success');
}

/** Open the "New Finish" popup used by cabinet-builder material/finish smart-inputs.
 *  Historically misnamed `_openNewStockPopup` — that name now belongs to the
 *  real new-stock popup in app.js.
 *  @param {string} [fieldName] */
function _openNewCBFinishPopup(fieldName) {
  const field = fieldName || 'finish';
  const existing = _byId('cb-mat-' + field)?.value || '';
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Finish</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Finish Name</label><input class="pf-input pf-input-lg" id="pnf-name" value="${_escHtml(existing)}"></div>
      <div class="pf"><label class="pf-label">Price per m²</label><input class="pf-input" id="pnf-price" type="number" value="0" step="0.01"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewCBFinish('${field}')">Add Finish</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnf-name')?.focus(), 50);
}

/** @param {string} [fieldName] */
function _saveNewCBFinish(fieldName) {
  const field = fieldName || 'finish';
  const name = _popupVal('pnf-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnf-price')) || 0;
  if (!cbSettings.finishes) cbSettings.finishes = [];
  if (!cbSettings.finishes.some(/** @param {any} f */ f => f.name === name)) {
    cbSettings.finishes.push({ name, price });
    saveCBSettings();
  }
  cbUpdateField(field, name);
  const inp = _byId('cb-mat-' + field);
  if (inp) inp.value = name;
  _closePopup();
  _toast('"' + name + '" added to finishes', 'success');
}

// ── Cabinet Hardware Smart Suggest ──
// Picker pool: stock items categorised "Hardware" or "Other", mirroring the
// material/finish pickers which read straight from Stock. The legacy
// cbSettings.hardware catalog is no longer offered here — it survives only as a
// pricing fallback in cabinet-calc's hwp() for cabinets that reference old names.
function _cbHwPool() {
  /** @type {{name:string, price:number, qty?:number, low?:number}[]} */
  const pool = [];
  const seen = new Set();
  (typeof stockItems !== 'undefined' ? stockItems : []).forEach(/** @param {any} s */ s => {
    const cat = (typeof _scGet === 'function' ? _scGet(s.id) : '') || s.category;
    if ((cat !== 'Hardware' && cat !== 'Other') || !s.name) return;
    const key = s.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pool.push({ name: s.name, price: s.cost ?? 0, qty: s.qty, low: s.low });
  });
  return pool;
}

// scope = 'cabinet' | 'door' | 'drawer'. Defaults to 'cabinet' for back-compat.
/** @param {HTMLInputElement} input @param {string} boxId @param {number} lineId @param {number} hwIdx @param {string} [scope] */
function _smartCBHwSuggest(input, boxId, lineId, hwIdx, scope) {
  const sc = scope || 'cabinet';
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = _cbHwPool();
  // Show all when the value already matches a hardware item (an entry is selected —
  // opening to browse, not searching). Filter only once the pick is edited/deleted.
  const isExisting = pool.some(/** @param {any} h */ h => h.name.toLowerCase() === q);
  const matches = (q && !isExisting) ? pool.filter(/** @param {any} h */ h => h.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(/** @param {any} h */ h => {
    const qtyColor = (h.qty ?? 0) <= (h.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_setElVal('cb-hw-${sc}-${lineId}-${hwIdx}','${_escHtml(h.name)}');updateCBHw(${lineId},${hwIdx},'name','${_escHtml(h.name)}','${sc}');_hideEl('${boxId}')">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${h.qty ?? ''}</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewCBHardwarePopup(${lineId},${hwIdx},'${sc}')">+ Add${q ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new hardware to stock</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {HTMLInputElement} input @param {string} boxId @param {number} lineId @param {string} [scope] */
function _smartCBHwAddSuggest(input, boxId, lineId, scope) {
  const sc = scope || 'cabinet';
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = _cbHwPool();
  const matches = q ? pool.filter(/** @param {any} h */ h => h.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(/** @param {any} h */ h => {
    const qtyColor = (h.qty ?? 0) <= (h.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_addCBHwByName(${lineId},'${_escHtml(h.name)}','${sc}');_setElVal('cb-hw-add-${sc}-${lineId}','');_hideEl('${boxId}')">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${h.qty ?? ''}</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewCBHardwarePopup(${lineId},-1,'${sc}')">+ Add${q ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new hardware to stock</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {number} lineId @param {string} hwName @param {string} [scope] */
function _addCBHwByName(lineId, hwName, scope) {
  const sc = scope || 'cabinet';
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l => l.id === lineId);
  if (!line) return;
  const list = _hwList(line, sc);
  list.push({ name: hwName, qty: 1 });
  if (cbEditingLineIdx >= 0) saveCBLines();
  renderCBPanel();
  _toast('"' + hwName + '" added', 'success');
}

/** @param {number} lineId @param {number} hwIdx @param {string} [scope] */
function _openNewCBHardwarePopup(lineId, hwIdx, scope) {
  const sc = scope || 'cabinet';
  const existing = hwIdx >= 0 ? (_byId('cb-hw-' + sc + '-' + lineId + '-' + hwIdx)?.value || '') : (_byId('cb-hw-add-' + sc + '-' + lineId)?.value || '');
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">New Hardware</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Hardware Name</label><input class="pf-input pf-input-lg" id="pnh-name" value="${_escHtml(existing)}"></div>
      <div class="pf-row">
        <div class="pf"><label class="pf-label">Qty in Stock</label><input class="pf-input" id="pnh-qty" type="number" value="0" style="text-align:center"></div>
        <div class="pf"><label class="pf-label">Low Alert</label><input class="pf-input" id="pnh-low" type="number" value="3" style="text-align:center"></div>
        <div class="pf"><label class="pf-label">Cost / Unit</label><input class="pf-input" id="pnh-price" type="number" value="0" step="0.01" style="text-align:right"></div>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewCBHardware(${lineId},${hwIdx},'${sc}')">Add to Stock</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnh-name')?.focus(), 50);
}

// Create a Hardware stock item (mirrors _saveNewStockPopup's persistence) and
// attach it to the cabinet line. Hardware lives in Stock alongside materials and
// finishes now — there is no separate catalog to write to.
/** @param {number} lineId @param {number} hwIdx @param {string} [scope] */
async function _saveNewCBHardware(lineId, hwIdx, scope) {
  const sc = scope || 'cabinet';
  const name = _popupVal('pnh-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const cost = parseFloat(_popupVal('pnh-price')) || 0;
  const qty = parseInt(_popupVal('pnh-qty')) || 0;
  const low = parseInt(_popupVal('pnh-low')) || 0;
  // Reuse an existing Hardware/Other stock row of the same name, else create one.
  const existing = stockItems.find(/** @param {any} s */ s => {
    if (s.name !== name) return false;
    const cat = (typeof _scGet === 'function' ? _scGet(s.id) : '') || s.category;
    return cat === 'Hardware' || cat === 'Other';
  });
  if (!existing) {
    /** @type {any} */
    let row = { name, sku: '', w: 0, h: 0, qty, low, cost };
    if (_userId) {
      row.user_id = _userId;
      const { data, error } = await _db('stock_items').insert(row).select().single();
      if (error || !data) { _toast('Save failed: ' + (error?.message || ''), 'error'); return; }
      row = data;
      stockItems.push(row);
    } else {
      row.id = stockNextId++;
      stockItems.push(row);
    }
    _scSet(row.id, 'Hardware');
    if (typeof renderStockMain === 'function') renderStockMain();
  }
  if (hwIdx >= 0) {
    updateCBHw(lineId, hwIdx, 'name', name, sc);
    const inp = _byId('cb-hw-' + sc + '-' + lineId + '-' + hwIdx);
    if (inp) inp.value = name;
  } else {
    _addCBHwByName(lineId, name, sc);
  }
  _closePopup();
  _toast('"' + name + '" added to stock', 'success');
}

// F6 (2026-05-13): _smartCLProjectSuggest + _smartCBProjectSuggest removed
// alongside the projects entity. _clProjectCache is also gone from cabinet.js.

// ── Cut List smart search: Stock Materials (panels + edge banding when on) ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartCLStockSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  // Sheet Goods always; Edge Banding only when its column is enabled in the
  // cut list. Legacy items with no category but dimensions are treated as
  // panels for back-compat.
  const includeEdgeBanding = (typeof colsVisible !== 'undefined' && !!colsVisible.edgeband);
  /** @param {any} s @returns {boolean} */
  const isPanel = (s) => {
    const cat = _scGet(s.id) || s.category;
    if (cat === 'Sheet Goods') return true;
    if (!cat && (s.w ?? 0) > 0 && (s.h ?? 0) > 0) return true;
    return false;
  };
  /** @param {any} s @returns {boolean} */
  const isEdge = (s) => {
    const cat = _scGet(s.id) || s.category;
    return cat === 'Edge Banding';
  };
  const pool = stockItems.filter(/** @param {any} s */ s => isPanel(s) || (includeEdgeBanding && isEdge(s)));
  const matches = q ? pool.filter(/** @param {any} s */ s => s.name.toLowerCase().includes(q)) : pool;
  const panelMatches = matches.filter(/** @param {any} s */ s => !isEdge(s));
  const edgeMatches = matches.filter(/** @param {any} s */ s => isEdge(s));
  const showHeaders = panelMatches.length > 0 && edgeMatches.length > 0;
  /** @param {any} s */
  const renderItem = (s) => {
    const origIdx = stockItems.indexOf(s);
    const qtyColor = (s.qty ?? 0) <= (s.lowAlert || s.low || 3) ? '#ef4444' : '#22c55e';
    const edge = isEdge(s);
    const meta = edge
      ? `Edge${s.thickness_mm ? ' · ' + s.thickness_mm + 'mm' : ''}`
      : (s.w && s.h ? `${s.w}×${s.h}` : '');
    const onClick = edge
      ? `_clAddEdgeBandFromStockIdx(${origIdx})`
      : `_clAddPanelFromStock(${origIdx})`;
    return `<div class="client-suggest-item" onmousedown="${onClick};_setElVal('cl-stock','');_hideEl('${boxId}')">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${meta}</span>
    </div>`;
  };
  let html = '';
  let remaining = 12;
  if (panelMatches.length) {
    if (showHeaders) html += `<div class="suggest-group-header">Sheet Goods</div>`;
    const slice = panelMatches.slice(0, remaining);
    html += slice.map(renderItem).join('');
    remaining -= slice.length;
  }
  if (edgeMatches.length && remaining > 0) {
    if (showHeaders) html += `<div class="suggest-group-header">Edge Banding</div>`;
    html += edgeMatches.slice(0, remaining).map(renderItem).join('');
  }
  if (matches.length === 0) {
    const what = includeEdgeBanding ? 'panels or edge banding' : 'panel materials';
    html += `<div class="client-suggest-add" onmousedown="switchSection('stock')">No ${what} — go to Stock to add</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {number} idx */
function _clAddPanelFromStock(idx) { const item = stockItems[idx]; if (!item) return; addSheet(item.name, item.w ?? undefined, item.h ?? undefined, Math.max(1, item.qty ?? 0)); _toast('"'+item.name+'" added to panels', 'success'); }

/** @param {number} idx */
function _clAddEdgeBandFromStockIdx(idx) {
  /** @type {any} */
  const s = stockItems[idx];
  if (!s) return;
  const exists = edgeBands.find(eb => eb.name === s.name);
  if (exists) { _toast(`${s.name} already in project`, 'error'); return; }
  /** @type {any} */
  const vd = _svGet(s.id) || {};
  const thickness = vd.thickness ?? 0;
  const width = vd.width ?? s.h ?? 0;
  const length = vd.length ?? s.w ?? 0;
  const glue = vd.glue || s.glue || '';
  addEdgeBand(s.name, thickness, width, null, length, glue);
  _toast(`Added ${s.name}`, 'success');
}

// ── Cut List Cabinet Library ──

/** Saw-blade icon used in the .proj-act-style "Cut List" button. Matches the sidebar nav-tab glyph. */
const _CB_CUTLIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>';
/** @type {any} */ (window)._CB_CUTLIST_ICON = _CB_CUTLIST_ICON;

/** Markup for the .proj-act-style "Cut List" widget on cabinet cards.
 *  Mirrors the Cabinets/Items/Labour strip cells in quote cards.
 *  @param {string} mainOnclick @param {string} addOnclick @param {number|string} cabid */
function _cbCutListProjActHtml(mainOnclick, addOnclick, cabid) {
  return `<div class="proj-act _cbct-btn empty" data-cabid="${cabid}" onclick="event.stopPropagation()">
    <div class="proj-act-main" onclick="event.stopPropagation();${mainOnclick}" title="Open this cabinet's cut lists">
      ${_CB_CUTLIST_ICON}
      <span class="proj-act-label">Link to Cutlist</span>
      <span class="proj-act-count _cbct-label">0</span>
    </div>
    <div class="proj-act-add" onclick="event.stopPropagation();${addOnclick}" title="New cut list">+</div>
  </div>`;
}
/** @type {any} */ (window)._cbCutListProjActHtml = _cbCutListProjActHtml;

/** Patches every `._cbct-btn` in the DOM with the count of library cut lists
 *  linked to its `data-cabid` cabinet, and toggles the `.empty` class so the
 *  pill picks up muted styling when 0. Best-effort: silent on auth or query errors. */
async function _cbApplyCutListCounts() {
  if (!_userId && !window._demoMode) return;
  const buttons = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('._cbct-btn'));
  if (!buttons.length) return;
  /** @type {Set<number>} */
  const ids = new Set();
  buttons.forEach(b => {
    const v = parseInt(b.getAttribute('data-cabid') || '', 10);
    if (Number.isFinite(v)) ids.add(v);
  });
  if (!ids.size) return;
  /** @type {Record<number, number>} */
  const counts = {};
  try {
    const { data } = await _db('cutlist_cabinets')
      .select('cabinet_id')
      .in('cabinet_id', Array.from(ids));
    for (const r of (data || [])) {
      const cid = /** @type {any} */ (r).cabinet_id;
      if (cid != null) counts[cid] = (counts[cid] || 0) + 1;
    }
  } catch (e) { return; }
  buttons.forEach(b => {
    const v = parseInt(b.getAttribute('data-cabid') || '', 10);
    const n = Number.isFinite(v) ? (counts[v] || 0) : 0;
    const lbl = b.querySelector('._cbct-label');
    if (lbl) lbl.textContent = String(n);
    b.classList.toggle('empty', n === 0);
  });
}
/** @type {any} */ (window)._cbApplyCutListCounts = _cbApplyCutListCounts;

/** Ensure the cabinet at cbLibrary[libIdx] has a db_id (persists to
 *  cabinet_templates if needed). Returns the db_id or null on failure.
 *  @param {number} libIdx */
async function _cbEnsureCabinetSaved(libIdx) {
  const cab = cbLibrary[libIdx];
  if (!cab) return null;
  if (!cab.db_id) {
    if (typeof _saveCabinetToDB === 'function') {
      try {
        const newId = await _saveCabinetToDB(cab);
        if (newId) cab.db_id = newId;
      } catch (e) { /* tolerate */ }
    }
  }
  return cab.db_id || null;
}

/** Main pill click: open a picker of cut lists currently linked to this
 *  cabinet; clicking one navigates to the Cut List Library and opens it
 *  in the editor. Mirrors `_clOpenLinkedCabinets` on the cut-list side.
 *  @param {number} libIdx */
async function _cbOpenLinkedCutLists(libIdx) {
  const cabinetDbId = await _cbEnsureCabinetSaved(libIdx);
  if (!cabinetDbId) { _toast('Save the cabinet first', 'error'); return; }

  /** @type {number[]} */ let linkedIds = [];
  try {
    const { data } = await _db('cutlist_cabinets').select('cutlist_id').eq('cabinet_id', cabinetDbId);
    linkedIds = (data || []).map(/** @param {any} r */ r => r.cutlist_id).filter(/** @param {any} v */ v => v != null);
  } catch (e) { linkedIds = []; }

  /** @type {any[]} */ let cls = [];
  if (linkedIds.length) {
    try {
      const { data } = await _db('cutlists').select('id, name, updated_at').in('id', linkedIds).order('updated_at', { ascending: false });
      cls = /** @type {any[]} */ (data || []);
    } catch (e) { cls = []; }
  }

  const cutlistIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>';

  const items = cls.map(/** @param {any} c */ c => ({
    title: c.name || '(untitled)',
    icon: cutlistIcon,
    metaText: c.updated_at ? _clFormatDate(c.updated_at) : '',
    onPick: `_cbOpenCutlistFromPicker(${c.id})`,
  }));

  _openPickerPopup({
    title: 'Linked Cut Lists',
    hint: 'Pick a cut list to open it in the Cut List editor.',
    items,
    emptyText: 'No cut lists linked yet.',
    createLabel: '+ Add Cut List',
    onCreate: `_cbLinkToCutList(${libIdx})`,
    createClass: 'subtle',
    size: 'md',
  });
}
/** @type {any} */ (window)._cbOpenLinkedCutLists = _cbOpenLinkedCutLists;

/** "+" pill click: open a multi-toggle picker listing every cut list;
 *  rows marked Linked indicate the current join, clicking toggles the link
 *  via `_cbToggleCutListLink`. Mirrors `_clLinkToCabinet` on the cut-list side.
 *  @param {number} libIdx */
async function _cbLinkToCutList(libIdx) {
  const cabinetDbId = await _cbEnsureCabinetSaved(libIdx);
  if (!cabinetDbId) { _toast('Save the cabinet first', 'error'); return; }

  /** @type {Set<number>} */ const linkedIds = new Set();
  try {
    const { data } = await _db('cutlist_cabinets').select('cutlist_id').eq('cabinet_id', cabinetDbId);
    for (const r of (data || [])) {
      const cid = /** @type {any} */ (r).cutlist_id;
      if (cid != null) linkedIds.add(cid);
    }
  } catch (e) { /* tolerate */ }

  /** @type {any[]} */ let cls = [];
  try {
    const { data } = await _db('cutlists').select('id, name, updated_at').order('updated_at', { ascending: false });
    cls = /** @type {any[]} */ (data || []);
  } catch (e) { cls = []; }

  const cutlistIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>';

  const items = cls.map(/** @param {any} c */ c => {
    const linked = linkedIds.has(c.id);
    return {
      title: c.name || '(untitled)',
      icon: cutlistIcon,
      metaText: c.updated_at ? _clFormatDate(c.updated_at) : '',
      metaPills: linked ? [{ label: 'Linked', tone: 'approved' }] : [],
      onPick: `_cbToggleCutListLink(${libIdx},${c.id})`,
    };
  });

  _openPickerPopup({
    title: 'Link to Cut Lists',
    hint: 'Click a cut list to add or remove its link. Close when done.',
    items,
    emptyText: 'No cut lists yet. Start one in the <strong>Cut List</strong> tab — it saves here automatically.',
    size: 'md',
  });
}
/** @type {any} */ (window)._cbLinkToCutList = _cbLinkToCutList;

/** Toggle a single `cutlist_cabinets` row for this cabinet/cutlist pair.
 *  Re-renders the toggle picker after each click so the user can keep
 *  going; refreshes the cabinet-card pill counts.
 *  @param {number} libIdx @param {number} cutlistId */
async function _cbToggleCutListLink(libIdx, cutlistId) {
  const cab = cbLibrary[libIdx];
  if (!cab || !cab.db_id) { _toast('Save the cabinet first', 'error'); return; }
  const cabinetDbId = cab.db_id;
  try {
    const { data: existing } = await _db('cutlist_cabinets')
      .select('cutlist_id')
      .eq('cutlist_id', cutlistId)
      .eq('cabinet_id', cabinetDbId);
    const isLinked = !!(existing && existing.length);
    if (isLinked) {
      const { error } = await _db('cutlist_cabinets').delete().eq('cutlist_id', cutlistId).eq('cabinet_id', cabinetDbId);
      if (error) { _toast('Unlink failed', 'error'); return; }
      _toast('Unlinked', 'success');
    } else {
      if (!_requireAuth()) return;
      const { error } = await _db('cutlist_cabinets').insert(/** @type {any} */ ({ cutlist_id: cutlistId, cabinet_id: cabinetDbId, user_id: _userId }));
      if (error) { _toast('Link failed', 'error'); return; }
      _toast('Linked', 'success');
    }
    _cbApplyCutListCounts();
    _cbLinkToCutList(libIdx);
  } catch (e) { _toast('Link toggle failed', 'error'); }
}
/** @type {any} */ (window)._cbToggleCutListLink = _cbToggleCutListLink;

/** Picker-row callback: close the popup, switch to the Cut List tab &
 *  Library view, and open the picked cut list in the editor.
 *  @param {number} cutlistId */
function _cbOpenCutlistFromPicker(cutlistId) {
  _closePopup();
  const w = /** @type {any} */ (window);
  if (typeof switchSection === 'function') switchSection('cutlist');
  if (typeof w.switchCLMainView === 'function') w.switchCLMainView('library');
  if (typeof w._clOpenLibraryCutlist === 'function') w._clOpenLibraryCutlist(cutlistId);
}
/** @type {any} */ (window)._cbOpenCutlistFromPicker = _cbOpenCutlistFromPicker;

/** Open the cabinet's cut-list view from a project-line cabinet (cbLines).
 *  Resolves the line's `db_id` (the underlying template), saving as a
 *  template first if necessary.
 *  @param {number} lineIdx */
async function _cbOpenCabinetCutListsForLine(lineIdx) {
  const line = cbLines[lineIdx];
  if (!line) return;
  if (!line.db_id) {
    if (typeof _saveCabinetToDB === 'function') {
      try {
        const newId = await _saveCabinetToDB(line);
        if (newId) line.db_id = newId;
      } catch (e) { /* tolerate */ }
    }
  }
  if (!line.db_id) { _toast('Save the cabinet first', 'error'); return; }
  const name = line.name || 'Cabinet';
  if (typeof _clOpenCabinet === 'function') _clOpenCabinet(line.db_id, name);
}
/** @type {any} */ (window)._cbOpenCabinetCutListsForLine = _cbOpenCabinetCutListsForLine;

/** "+" half for project-line cards — open + create new linked cut list.
 *  @param {number} lineIdx */
async function _cbNewCutListForLine(lineIdx) {
  await _cbOpenCabinetCutListsForLine(lineIdx);
  if (typeof _clNewCabinetLinkedCutlist === 'function') {
    /** @type {any} */ (window)._clNewCabinetLinkedCutlist();
  }
}
/** @type {any} */ (window)._cbNewCutListForLine = _cbNewCutListForLine;

