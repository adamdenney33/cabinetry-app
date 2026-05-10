// ProCabinet — Cabinet library + smart-suggest dropdowns (extracted from cabinet.js, R.1 split)

// ── Position suggest box as fixed overlay (avoids overflow clipping) ──
/** @param {HTMLElement | null} input @param {HTMLElement | null} box */
function _posSuggest(input, box) {
  if (!input || !box) return;
  const r = (input.parentElement || input).getBoundingClientRect();
  box.style.position = 'fixed';
  box.style.left = r.left + 'px';
  box.style.width = r.width + 'px';
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

function cbExportLibrary() {
  if (!cbLibrary.length) { _toast('No cabinets in library', 'error'); return; }
  const headers = ['Name','Width','Height','Depth','Qty','Material','Back Material','Finish','Construction','Base','Doors','Door Material','Door %','Drawers','Front Material','Inner Material','Drawer %','Fixed Shelves','Adj Shelves','Loose Shelves','Partitions','End Panels'];
  /** @type {any[][]} */
  const rows = [headers];
  cbLibrary.forEach(c => {
    rows.push([c._libName||c.name||'Cabinet',c.w,c.h,c.d,c.qty||1,c.material||'',c.backMat||'',c.finish||'None',c.construction||'Overlay',c.baseType||'None',c.doors||0,c.doorMat||'',c.doorPct||95,c.drawers||0,c.drawerFrontMat||'',c.drawerInnerMat||'',c.drawerPct||85,c.shelves||0,c.adjShelves||0,c.looseShelves||0,c.partitions||0,c.endPanels||0]);
  });
  const csv = rows.map(r => r.map(/** @param {any} v */ v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'cabinet-library.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Library exported as CSV', 'success');
}

function cbImportLibrary() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
      if (rows.length < 2) { _toast('CSV has no data rows', 'error'); return; }
      // Free-tier cap on cabinet_templates: refuse the import outright if we'd
      // bust the cap. Pro users skip the check.
      if (typeof isPro === 'function' && !isPro()) {
        const room = FREE_LIMITS.cabinet_templates - cbLibrary.length;
        const incoming = rows.length - 1;
        if (room <= 0) { _openLimitHitModal('cabinet_templates'); return; }
        if (incoming > room) { _toast(`Free plan only allows ${room} more cabinet${room === 1 ? '' : 's'}. Upgrade for unlimited.`, 'error'); _openLimitHitModal('cabinet_templates'); return; }
      }
      let imported = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (r.length < 4 || !r[0]) continue;
        /** @type {any} */
        const cab = cbDefaultLine();
        cab.id = Date.now() + Math.random();
        cab._libName = r[0]; cab.name = r[0];
        cab.w = parseFloat(r[1])||600; cab.h = parseFloat(r[2])||720; cab.d = parseFloat(r[3])||560;
        cab.qty = parseInt(r[4])||1; cab.material = r[5]||cab.material; cab.backMat = r[6]||cab.backMat;
        cab.finish = r[7]||'None'; cab.construction = r[8]||'Overlay'; cab.baseType = r[9]||'None';
        cab.doors = parseInt(r[10])||0; cab.doorMat = r[11]||cab.material; cab.doorPct = parseInt(r[12])||95;
        cab.drawers = parseInt(r[13])||0; cab.drawerFrontMat = r[14]||cab.material; cab.drawerInnerMat = r[15]||cab.backMat;
        cab.drawerPct = parseInt(r[16])||85; cab.shelves = parseInt(r[17])||0; cab.adjShelves = parseInt(r[18])||0;
        cab.looseShelves = parseInt(r[19])||0; cab.partitions = parseInt(r[20])||0; cab.endPanels = parseInt(r[21])||0;
        cbLibrary.push(cab); imported++;
      }
      renderCBLibraryView();
      _toast(imported + ' cabinets imported', 'success');
      const p = _byId('cb-library-panel'); if (p) p.style.display = '';
      const newEntries = cbLibrary.slice(-imported);
      Promise.all(newEntries.map(e => _saveCabinetToDB(e).then(id => { if (id) e.db_id = id; })))
        .catch(err => console.warn('[cabinet-template bulk save]', err.message || err));
    } catch(e) { _toast('Could not read CSV: ' + (/** @type {any} */ (e)).message, 'error'); }
  };
  input.click();
}

function cbSaveToLibrary() {
  const line = cbScratchpad;
  if (!line) { _toast('Open a cabinet first', 'error'); return; }
  if (!_enforceFreeLimit('cabinet_templates', cbLibrary.length)) return;
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
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cbNextId++;
  delete copy._libName;
  if (typeof _cbNextCabinetName === 'function' && !copy.name) copy.name = _cbNextCabinetName(false);
  cbLines.push(copy);
  saveCBLines();
  renderCBPanel();
  if (typeof switchCBMainView === 'function') switchCBMainView('results');
  _toast(`"${src._libName}" added to project`, 'success');
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

/** Create a blank library cut list linked to this library cabinet, then
 *  switch to the Cut List Library tab. The cabinet must be persisted so we
 *  have a db_id to link against — if not, save it first. (Item 7.)
 *  @param {number} libIdx */
async function _cbAddCutListForLibrary(libIdx) {
  if (!_userId) { _toast('Sign in to link cut lists', 'error'); return; }
  const cab = cbLibrary[libIdx];
  if (!cab) return;
  if (!cab.db_id) {
    try {
      const newId = await _saveCabinetToDB(cab);
      if (newId) cab.db_id = newId;
    } catch (e) { /* tolerate */ }
  }
  if (!cab.db_id) { _toast('Save the cabinet first', 'error'); return; }
  const name = (typeof _clNextCutlistName === 'function') ? await _clNextCutlistName(null) : 'Cutlist 1';
  try {
    const { data, error } = await _db('cutlists').insert(/** @type {any} */ ({
      user_id: _userId,
      project_id: null,
      cabinet_id: cab.db_id,
      name,
      position: 0,
      ui_prefs: {}
    })).select().single();
    if (error || !data) { _toast('Could not create cut list', 'error'); return; }
    _toast(`"${name}" created and linked to "${cab._libName || cab.name || 'cabinet'}"`, 'success');
    if (typeof switchSection === 'function') switchSection('cutlist');
    if (typeof switchCLMainView === 'function') switchCLMainView('library');
  } catch (e) {
    _toast('Could not create cut list', 'error');
  }
}
/** @type {any} */ (window)._cbAddCutListForLibrary = _cbAddCutListForLibrary;

/** @param {number} idx */
function cbDuplicateLibraryEntry(idx) {
  const src = cbLibrary[idx];
  if (!src) return;
  if (!_enforceFreeLimit('cabinet_templates', cbLibrary.length)) return;
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
  const matches = q ? cbLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(q)) : cbLibrary;
  let html = '';
  matches.slice(0, 8).forEach(c => {
    const idx = cbLibrary.indexOf(c);
    const calc = calcCBLine(c);
    html += `<div class="client-suggest-item" onmousedown="cbLoadFromLibrary(${idx});_byId('cb-cabinet-search').value='';_byId('${boxId}').style.display='none'">
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
  const pool = stockItems.filter(s => s.category === 'Sheet Goods' || s.category === 'Solid Timber' || s.category === 'Edge Banding' || ((s.w ?? 0) > 0 && (s.h ?? 0) > 0));
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('rates-stock-search').value='';_byId('${boxId}').style.display='none';_openStockPopup(${s.id})">
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
    html += `<div class="client-suggest-item" onmousedown="_byId('rates-finish-search').value='';_byId('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m²</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new finish to stock</div>`;
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
    html += `<div class="client-suggest-item" onmousedown="_byId('rates-edge-search').value='';_byId('${boxId}').style.display='none';_openStockPopup(${s.id})">
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
  const pool = stockItems.filter(s => s.category === 'Sheet Goods' || s.category === 'Solid Timber' || s.category === 'Edge Banding' || ((s.w ?? 0) > 0 && (s.h ?? 0) > 0));
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = (s.qty ?? 0) <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('cb-mat-${fieldName}').value='${_escHtml(s.name)}';cbUpdateField('${fieldName}','${_escHtml(s.name)}');_byId('${boxId}').style.display='none'">
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
    html += `<div class="client-suggest-item" onmousedown="_byId('cb-mat-${field}').value='${_escHtml(s.name)}';cbUpdateField('${field}','${_escHtml(s.name)}');_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup('${field}')">+ Add new finish to stock</div>`;
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
      <button class="btn btn-accent" onclick="_saveNewCBMaterial('${fieldName}')">Add Material</button>
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

/** @param {string} [fieldName] */
function _openNewStockPopup(fieldName) {
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
      <button class="btn btn-accent" onclick="_saveNewCBFinish('${field}')">Add Finish</button>
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
// scope = 'cabinet' | 'door' | 'drawer'. Defaults to 'cabinet' for back-compat.
/** @param {HTMLInputElement} input @param {string} boxId @param {number} lineId @param {number} hwIdx @param {string} [scope] */
function _smartCBHwSuggest(input, boxId, lineId, hwIdx, scope) {
  const sc = scope || 'cabinet';
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cbSettings.hardware.filter(/** @param {any} h */ h => h.name.toLowerCase().includes(q)) : cbSettings.hardware;
  let html = '';
  matches.slice(0, 8).forEach(/** @param {any} h */ h => {
    html += `<div class="client-suggest-item" onmousedown="_byId('cb-hw-${sc}-${lineId}-${hwIdx}').value='${_escHtml(h.name)}';updateCBHw(${lineId},${hwIdx},'name','${_escHtml(h.name)}','${sc}');_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:#6b8aff20;color:#6b8aff">H</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewCBHardwarePopup(${lineId},${hwIdx},'${sc}')">+ Add${q ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new hardware</div>`;
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
  const matches = q ? cbSettings.hardware.filter(/** @param {any} h */ h => h.name.toLowerCase().includes(q)) : cbSettings.hardware;
  let html = '';
  matches.slice(0, 8).forEach(/** @param {any} h */ h => {
    html += `<div class="client-suggest-item" onmousedown="_addCBHwByName(${lineId},'${_escHtml(h.name)}','${sc}');_byId('cb-hw-add-${sc}-${lineId}').value='';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:#6b8aff20;color:#6b8aff">H</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewCBHardwarePopup(${lineId},-1,'${sc}')">+ Add${q ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new hardware</div>`;
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
      <div class="pf"><label class="pf-label">Price per Unit</label><input class="pf-input" id="pnh-price" type="number" value="0" step="0.01"></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewCBHardware(${lineId},${hwIdx},'${sc}')">Add Hardware</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnh-name')?.focus(), 50);
}

/** @param {number} lineId @param {number} hwIdx @param {string} [scope] */
function _saveNewCBHardware(lineId, hwIdx, scope) {
  const sc = scope || 'cabinet';
  const name = _popupVal('pnh-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnh-price')) || 0;
  if (!cbSettings.hardware.some(/** @param {any} h */ h => h.name === name)) {
    cbSettings.hardware.push({ name, price });
    saveCBSettings();
  }
  if (hwIdx >= 0) {
    updateCBHw(lineId, hwIdx, 'name', name, sc);
    const inp = _byId('cb-hw-' + sc + '-' + lineId + '-' + hwIdx);
    if (inp) inp.value = name;
  } else {
    _addCBHwByName(lineId, name, sc);
  }
  _closePopup();
  _toast('"' + name + '" added to hardware', 'success');
}

// ── Cut List smart search: Projects ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartCLProjectSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const raw = input.value.trim();
  const q = raw.toLowerCase();
  const matches = q ? _clProjectCache.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8) : _clProjectCache.slice(0, 8);
  let html = '';
  matches.forEach((p, i) => {
    const idx = _clProjectCache.indexOf(p);
    const date = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '';
    html += `<div class="client-suggest-item" onmousedown="_clLoadProjectByIdx(${idx});_byId('cl-project').value='${_escHtml(p.name)}';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon">P</span>
      <span style="flex:1">${_escHtml(p.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${date}</span>
    </div>`;
  });
  // Only show inline "Save as" when user has typed a brand-new name (non-empty
  // and doesn't exactly match an existing project — prevents accidental overwrite).
  const exactExists = !!raw && _clProjectCache.some(p => p.name.toLowerCase() === q);
  if (raw && !exactExists) {
    const escName = _escHtml(raw).replace(/'/g, '&#39;');
    html += `<div class="client-suggest-add" onmousedown="_clSaveProjectByName('${escName}');_byId('${boxId}').style.display='none'">+ Save current cut list as "${_escHtml(raw)}"</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

// ── Cabinet Builder smart search: Project Library ──
// Mirrors _smartCLProjectSuggest but loads cabinet draft for the picked project.
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartCBProjectSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const raw = input.value.trim();
  const q = raw.toLowerCase();
  const matches = q ? _clProjectCache.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8) : _clProjectCache.slice(0, 8);
  let html = '';
  matches.forEach((p) => {
    const date = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '';
    const escName = _escHtml(p.name).replace(/'/g, '&#39;');
    html += `<div class="client-suggest-item" onmousedown="_cbPickProject(${p.id},'${escName}');_byId('${boxId}').style.display='none'">
      <span class="suggest-icon">P</span>
      <span style="flex:1">${_escHtml(p.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${date}</span>
    </div>`;
  });
  const exactExists = !!raw && _clProjectCache.some(p => p.name.toLowerCase() === q);
  if (raw && !exactExists) {
    const escName = _escHtml(raw).replace(/'/g, '&#39;');
    html += `<div class="client-suggest-add" onmousedown="_cbSaveProjectByName('${escName}');_byId('${boxId}').style.display='none'">+ Save current cabinet build as "${_escHtml(raw)}"</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

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
      ? `Edge${s.thickness ? ' · ' + s.thickness + 'mm' : ''}`
      : (s.w && s.h ? `${s.w}×${s.h}` : '');
    const onClick = edge
      ? `_clAddEdgeBandFromStockIdx(${origIdx})`
      : `_clAddPanelFromStock(${origIdx})`;
    return `<div class="client-suggest-item" onmousedown="${onClick};_byId('cl-stock').value='';_byId('${boxId}').style.display='none'">
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
  const thickness = vd.thickness ?? s.thickness ?? 0;
  const width = vd.width ?? s.width ?? s.h ?? 0;
  const length = vd.length ?? s.length ?? s.w ?? 0;
  const glue = vd.glue || s.glue || '';
  addEdgeBand(s.name, thickness, width, null, length, glue);
  _toast(`Added ${s.name}`, 'success');
}

// ── Cut List Cabinet Library ──
/** @param {any[]} parts @param {string} mode */
function _applyCabinetParts(parts, mode) {
  /** @param {any} p */
  const key = p => `${p.label}|${p.w}|${p.h}|${p.grain||'none'}`;
  /** @param {any} src */
  const applyExtras = (src) => {
    const last = pieces[pieces.length - 1];
    if (!last) return;
    if (src.material !== undefined) last.material = src.material || '';
    if (src.notes    !== undefined) last.notes    = src.notes    || '';
    if (src.edgeBand !== undefined) last.edgeBand = src.edgeBand || 'none';
  };
  let merged = 0, added = 0;
  if (mode === 'merge') {
    const idx = new Map();
    pieces.forEach(p => idx.set(key(p), p));
    for (const c of parts) {
      const hit = idx.get(key(c));
      if (hit) { hit.qty = (hit.qty || 0) + c.qty; merged++; }
      else { addPiece(c.label, c.w, c.h, c.qty, c.grain); applyExtras(c); added++; }
    }
  } else {
    for (const c of parts) { addPiece(c.label, c.w, c.h, c.qty, c.grain); applyExtras(c); added++; }
  }
  renderPieces();
  return { merged, added };
}

/** @param {any[]} parts @param {string} name */
function _clPromptMergeOrNew(parts, name) {
  /** @param {any} p */
  const key = p => `${p.label}|${p.w}|${p.h}|${p.grain||'none'}`;
  const existing = new Set(pieces.map(key));
  const dupCount = parts.filter(/** @param {any} c */ c => existing.has(key(c))).length;

  /** @param {string} mode */
  const finish = (mode) => {
    const r = _applyCabinetParts(parts, mode);
    const suffix = r.merged
      ? `${r.merged} merged, ${r.added} added`
      : `${r.added} parts added`;
    _toast(`"${name}" — ${suffix}`, 'success');
  };

  if (dupCount === 0) { finish('new'); return; }

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Identical parts already in cut list</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <p style="margin:0 0 10px 0;line-height:1.5">
        <strong>${dupCount}</strong> of the ${parts.length} parts in <strong>${_escHtml(name)}</strong>
        match existing rows in your cut list (same label &amp; dimensions).
      </p>
      <p style="margin:0;color:var(--muted);font-size:12px;line-height:1.5">
        Merging bumps the quantity on existing rows. Adding as new keeps them separate.
      </p>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" id="cl-cab-cancel">Cancel</button>
      <button class="btn btn-outline" id="cl-cab-new">Add as new</button>
      <button class="btn btn-primary" id="cl-cab-merge">Merge quantities</button>
    </div>
  `, 'sm');
  /** @type {HTMLElement} */ (_byId('cl-cab-cancel')).onclick = () => _closePopup();
  /** @type {HTMLElement} */ (_byId('cl-cab-new')).onclick   = () => { _closePopup(); finish('new');   };
  /** @type {HTMLElement} */ (_byId('cl-cab-merge')).onclick = () => { _closePopup(); finish('merge'); };
}

/** @param {number} libIdx */
function _clLoadCabinetParts(libIdx) {
  const cab = cbLibrary[libIdx];
  if (!cab) return;
  if (cab._cutParts && cab._cutParts.length) {
    const name = cab._libName || cab.name || 'Cabinet';
    _clPromptMergeOrNew(cab._cutParts, name);
    return;
  }
  const name = cab._libName || cab.name || 'Cabinet';
  _clPromptMergeOrNew(_cabinetPartsList(cab), name);
}

function _clSaveToCabinetLibrary() {
  if (!pieces.length) { _toast('No cut parts to save', 'error'); return; }
  if (!_clSelectedIds || _clSelectedIds.size === 0) {
    _toast('Select parts in the list first', 'error');
    return;
  }
  const selectedPieces = pieces.filter(p => _clSelectedIds.has(p.id) && p.enabled !== false);
  if (!selectedPieces.length) { _toast('No enabled parts selected', 'error'); return; }
  const projName = _byId('cl-project')?.value?.trim() || '';
  const defaultName = projName || `Cabinet ${new Date().toLocaleDateString()}`;
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Save Selected Parts as Cabinet</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Cabinet Name</label><input class="pf-input pf-input-lg" id="pcl-name" value="${_escHtml(defaultName)}"></div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">${selectedPieces.length} selected cut part${selectedPieces.length===1?'':'s'} will be saved as a reusable cabinet.</div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_confirmSaveCLToCabLib()">Save Cabinet</button>
    </div>
  `, 'sm');
  setTimeout(() => { const i = _byId('pcl-name'); if (i) { i.focus(); i.select(); } }, 50);
}

function _confirmSaveCLToCabLib() {
  const name = _popupVal('pcl-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const selectedPieces = pieces.filter(p => _clSelectedIds.has(p.id) && p.enabled !== false);
  if (!selectedPieces.length) { _toast('No enabled parts selected', 'error'); _closePopup(); return; }
  if (!_enforceFreeLimit('cabinet_templates', cbLibrary.length)) { _closePopup(); return; }
  /** @type {any} */
  const entry = cbDefaultLine();
  entry.id = Date.now();
  entry._libName = name;
  entry.name = name;
  entry._cutParts = selectedPieces.map(p => ({
    label: p.label, w: p.w, h: p.h, qty: p.qty, grain: p.grain || 'none', material: p.material || '', notes: p.notes || '', edgeBand: p.edgeBand || 'none'
  }));
  const maxW = Math.max(...selectedPieces.map(p => Math.max(p.w, p.h)), 600);
  const maxD = Math.max(...selectedPieces.map(p => Math.min(p.w, p.h)), 560);
  entry.w = maxW; entry.h = maxW; entry.d = maxD;
  cbLibrary.push(entry);
  _closePopup();
  _toast(`"${name}" saved to cabinet library`, 'success');
  _saveCabinetToDB(entry).then(id => { if (id) entry.db_id = id; });
  if (typeof switchCLMainView === 'function') switchCLMainView('library');
}
