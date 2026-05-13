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
    html += `<div class="client-suggest-item" onmousedown="cbLoadFromLibrary(${idx});_byId('${boxId}').style.display='none'">
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
      <span class="proj-act-label">Cut List</span>
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
  if (!_userId) return;
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
    emptyText: 'No cut lists in your library yet. Create one in <strong>Cut List</strong> &rarr; <strong>Add to Library</strong>.',
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
      if (!_userId) { _toast('Sign in to link', 'error'); return; }
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

