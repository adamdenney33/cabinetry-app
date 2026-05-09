// ProCabinet — Cabinet UI rendering (extracted from cabinet.js, R.1 split)
// All DOM rendering lives here. Reads globals, writes innerHTML.

// ── UI state ──
let cbOpenSections = new Set();
let cbExpandedRows = new Set();
let cbMainView = 'results';

/** @param {number} id */
function toggleCBExpand(id) {
  if (cbExpandedRows.has(id)) cbExpandedRows.delete(id);
  else cbExpandedRows.add(id);
  renderCBPanel();
}

/** @param {number} lineId @param {string} section */
function toggleCBSection(lineId, section) {
  const key = lineId + '-' + section;
  if (cbOpenSections.has(key)) cbOpenSections.delete(key);
  else cbOpenSections.add(key);
  renderCBEditor();
}

function cbExpandAll() {
  const secs = ['cab','doors','drawers','shelves','hw','extras','notes'];
  const line = cbScratchpad;
  if (line) secs.forEach(s => cbOpenSections.add(line.id + '-' + s));
  renderCBEditor();
}
function cbCollapseAll() {
  cbOpenSections.clear();
  renderCBEditor();
}

function toggleCBSettings() {
  switchCabTab('rates');
}

/** @param {string} tab */
function switchCabTab(tab) {
  const rates = _byId('cab-view-rates');
  const tabBuilder = _byId('cab-tab-builder');
  const tabRates = _byId('cab-tab-rates');
  const sidebar = _byId('cb-sidebar');
  if (!sidebar) return;
  const builderDivs = /** @type {HTMLElement[]} */ (Array.from(sidebar.children).filter(el => el.id !== 'cab-view-rates'));

  if (tab === 'rates') {
    builderDivs.forEach(el => el.style.display = 'none');
    if (rates) rates.style.display = '';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'transparent'; tabBuilder.style.fontWeight = '500'; tabBuilder.style.color = 'var(--muted)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'var(--accent)'; tabRates.style.fontWeight = '700'; tabRates.style.color = 'var(--text)'; }
    renderCBRates();
  } else {
    builderDivs.forEach(el => el.style.display = '');
    if (rates) rates.style.display = 'none';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'var(--accent)'; tabBuilder.style.fontWeight = '700'; tabBuilder.style.color = 'var(--text)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'transparent'; tabRates.style.fontWeight = '500'; tabRates.style.color = 'var(--muted)'; }
  }
}

// ── Main content view toggle (Results / Library) ──
/** @param {string} view */
function switchCBMainView(view) {
  cbMainView = view;
  const results = _byId('cb-results');
  const library = _byId('cb-library-view');
  const tabR = _byId('cb-main-tab-results');
  const tabL = _byId('cb-main-tab-library');
  if (results) results.style.display = view === 'results' ? '' : 'none';
  if (library) library.style.display = view === 'library' ? '' : 'none';
  if (tabR) { tabR.style.borderBottomColor = view === 'results' ? 'var(--accent)' : 'transparent'; tabR.style.fontWeight = view === 'results' ? '700' : '500'; tabR.style.color = view === 'results' ? 'var(--text)' : 'var(--muted)'; }
  if (tabL) { tabL.style.borderBottomColor = view === 'library' ? 'var(--accent)' : 'transparent'; tabL.style.fontWeight = view === 'library' ? '700' : '500'; tabL.style.color = view === 'library' ? 'var(--text)' : 'var(--muted)'; }
  if (view === 'results') renderCBResults();
  else renderCBLibraryView();
}

// ── Settings Lists Render ──
/** @param {any[]} arr @param {string} path @param {string} [unitLabel] */
function _cbListHTML(arr, path, unitLabel) {
  const cur = window.currency;
  return arr.map(/** @param {any} item @param {number} i */ (item, i) => `<div class="cb-mat-row">
    <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCBSettings();renderCBPanel()">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${unitLabel||cur}</span>
      <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].price=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
    </div>
    <button onclick="${path}.splice(${i},1);saveCBSettings();renderCBRates();renderCBPanel()" style="font-size:16px">&times;</button>
  </div>`).join('');
}

function renderCBRates() {
  const el = _byId('cb-rates-content');
  if (!el) return;
  const cur = window.currency;
  /** @type {any} */
  const lt = cbSettings.labourTimes || {};
  if (!window._ratesOpen) window._ratesOpen = {};
  const ro = window._ratesOpen;
  /** @param {string} k */
  const isOpen = k => ro[k] === true;
  /** @param {string} k */
  const chev = k => `<span style="font-size:10px;color:var(--muted);display:inline-block;transition:transform .2s;${isOpen(k)?'transform:rotate(90deg)':''}">&#9654;</span>`;

  /** @param {string} key @param {string} title @param {string | number} count @param {string} content */
  function section(key, title, count, content) {
    return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none" onclick="window._ratesOpen.${key}=!window._ratesOpen.${key};renderCBRates()">
        ${chev(key)}
        <span style="font-size:13px;font-weight:600;color:var(--text);flex:1">${title}</span>
        <span style="font-size:11px;color:var(--muted)">${count}</span>
      </div>
      ${isOpen(key)?`<div style="padding:0 12px 10px;border-top:1px solid var(--border)">${content}</div>`:''}
    </div>`;
  }

  /** @param {any[]} arr @param {string} path @param {string} [unit] */
  function listItems(arr, path, unit) {
    return arr.map(/** @param {any} item @param {number} i */ (item,i) => `<div class="cb-mat-row" style="margin-top:4px">
      <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCBSettings();renderCBPanel()">
      <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
        <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${unit||cur}</span>
        <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].price=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
      </div>
      <button onclick="${path}.splice(${i},1);saveCBSettings();renderCBRates()" style="font-size:16px;background:none;border:none;color:var(--muted);cursor:pointer">&times;</button>
    </div>`).join('') + `<button class="cl-add-btn" onclick="${path}.push({name:'New',price:0});saveCBSettings();renderCBRates()" style="font-size:11px;padding:4px 8px;margin:6px 0 0">+ Add</button>`;
  }

  // Typed-labour list (refHours instead of price). Used for carcass/door/drawer-front/drawer-box types.
  /** @param {any[]} arr @param {string} path @param {number} defaultHrs */
  function typeListItems(arr, path, defaultHrs) {
    return arr.map(/** @param {any} item @param {number} i */ (item,i) => `<div class="cb-mat-row" style="margin-top:4px">
      <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCBSettings();renderCBPanel()">
      <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
        <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">hrs</span>
        <input type="number" value="${item.refHours}" step="0.05" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].refHours=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
      </div>
      <button onclick="${path}.splice(${i},1);saveCBSettings();renderCBRates()" style="font-size:16px;background:none;border:none;color:var(--muted);cursor:pointer">&times;</button>
    </div>`).join('') + `<button class="cl-add-btn" onclick="${path}.push({name:'New',refHours:${defaultHrs}});saveCBSettings();renderCBRates()" style="font-size:11px;padding:4px 8px;margin:6px 0 0">+ Add</button>`;
  }

  const coreItems = [
    {name:'Labour Rate',price:cbSettings.labourRate,path:'cbSettings.labourRate',unit:'per hour'},
    {name:'Material Markup',price:cbSettings.materialMarkup||0,path:'cbSettings.materialMarkup',unit:'%'},
    {name:'Quote Markup',price:cbSettings.markup,path:'cbSettings.markup',unit:'%'},
    {name:'Tax / GST',price:cbSettings.tax,path:'cbSettings.tax',unit:'%'},
    {name:'Contingency',price:cbSettings.contingencyPct ?? 5,path:'cbSettings.contingencyPct',unit:'%'},
  ];
  const coreContent = coreItems.map(item => `<div class="cb-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
    </div>
  </div>`).join('');

  // Other (fixed) labour rates — power-law components handled per-type below.
  // Finish labour is intentionally omitted: finish material is driven from stock.
  const labourItems = [
    {name:'Fixed Shelf',val:lt.fixedShelf||0.3,path:'cbSettings.labourTimes.fixedShelf',unit:'hrs'},
    {name:'Adj. Shelf Holes',val:lt.adjShelfHoles||0.4,path:'cbSettings.labourTimes.adjShelfHoles',unit:'hrs'},
    {name:'Loose Shelf',val:lt.looseShelf||0.2,path:'cbSettings.labourTimes.looseShelf',unit:'hrs'},
    {name:'Partition',val:lt.partition||0.5,path:'cbSettings.labourTimes.partition',unit:'hrs'},
    {name:'End Panel',val:lt.endPanel||0.3,path:'cbSettings.labourTimes.endPanel',unit:'hrs'},
    {name:'Packaging',val:cbSettings.packagingHours||0,path:'cbSettings.packagingHours',unit:'hrs'},
  ];
  const labourContent = labourItems.map(item => `<div class="cb-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.val}" step="0.05" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
    </div>
  </div>`).join('');

  if (!cbSettings.edgeBanding) cbSettings.edgeBanding = [{name:'Iron-on Veneer',price:3},{name:'PVC 1mm',price:4},{name:'PVC 2mm',price:5},{name:'Solid Timber',price:8}];

  // Single Stock link — materials, hardware, finishes, edge banding all live in Stock
  const stockCount = stockItems.length;
  const stockLink = `<div onclick="switchSection('stock')" style="border:1px solid var(--accent);border-radius:8px;margin-bottom:8px;padding:14px 16px;cursor:pointer;background:var(--accent-dim);display:flex;align-items:center;gap:12px;transition:background .15s" onmouseover="this.style.background='var(--accent)';this.style.color='#fff'" onmouseout="this.style.background='var(--accent-dim)';this.style.color=''">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:var(--accent)">Manage Materials in Stock →</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Materials, hardware, finishes &amp; edge banding (${stockCount} item${stockCount!==1?'s':''})</div>
      </div>
      <span style="font-size:18px;color:var(--accent)">→</span>
    </div>`;

  const carcassTypes = cbSettings.carcassTypes || [];
  const doorTypes = cbSettings.doorTypes || [];
  const drawerFrontTypes = cbSettings.drawerFrontTypes || [];
  const drawerBoxTypes = cbSettings.drawerBoxTypes || [];

  el.innerHTML = `
    ${stockLink}
    ${section('core', 'Core Rates', '5 rates', coreContent)}
    ${section('carcassTypes', 'Carcass', '('+carcassTypes.length+')', typeListItems(carcassTypes, 'cbSettings.carcassTypes', 0.4))}
    ${section('doorTypes', 'Door', '('+doorTypes.length+')', typeListItems(doorTypes, 'cbSettings.doorTypes', 0.4))}
    ${section('drawerFrontTypes', 'Drawer Front', '('+drawerFrontTypes.length+')', typeListItems(drawerFrontTypes, 'cbSettings.drawerFrontTypes', 0.3))}
    ${section('drawerBoxTypes', 'Drawer Box', '('+drawerBoxTypes.length+')', typeListItems(drawerBoxTypes, 'cbSettings.drawerBoxTypes', 0.8))}
    ${section('labour', 'Other Labour Times', '6 rates', labourContent)}
    ${section('basetypes', 'Base', '('+(cbSettings.baseTypes||[]).length+')', listItems(cbSettings.baseTypes||[], 'cbSettings.baseTypes', cur))}
  `;
}

function renderCBSettingsLists() { renderCBRates(); }

// ── Render the sidebar: cabinet list + active editor ──
function renderCBPanel() {
  if (!_renderCBAuthGate()) return;
  renderCBRates();
  renderCBEditor();
  if (cbMainView === 'results') renderCBResults();
  else renderCBLibraryView();
  if (typeof _renderCbCurrentProject === 'function') _renderCbCurrentProject();
}

function _renderCBAuthGate() {
  const builder = document.getElementById('cab-view-builder');
  let gate = document.getElementById('cb-auth-gate');
  if (_userId) {
    if (gate) gate.style.display = 'none';
    if (builder) builder.style.display = 'flex';
    return true;
  }
  if (builder) builder.style.display = 'none';
  if (!gate) {
    const panel = document.getElementById('panel-cabinet');
    if (!panel) return false;
    gate = document.createElement('div');
    gate.id = 'cb-auth-gate';
    gate.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:40px 20px';
    gate.innerHTML = `
      <div style="max-width:420px;text-align:center;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:32px 28px;box-shadow:var(--shadow)">
        <div style="font-size:32px;margin-bottom:12px">🔒</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px;color:var(--text)">Sign in to use Cabinet Builder</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:20px;line-height:1.5">
          Cabinet Builder saves your work to the cloud so you can pick up where you left off on any device. An account is required.
        </div>
        <button class="btn btn-primary" onclick="document.getElementById('auth-screen').classList.remove('hidden')" style="padding:10px 24px;font-size:14px">Sign In / Create Account</button>
      </div>`;
    panel.appendChild(gate);
  }
  gate.style.display = '';
  return false;
}

/** @param {number} idx */
function cbSelectLine(idx) {
  cbEditingLineIdx = idx;
  cbScratchpad = JSON.parse(JSON.stringify(cbLines[idx]));
  renderCBEditor();
}

/** @param {number} idx */
function cbEditCabinetFromOutput(idx) {
  cbSelectLine(idx);
  const sidebar = _byId('cb-sidebar');
  if (sidebar) sidebar.scrollTop = sidebar.scrollHeight;
}

// ── Render the active cabinet editor in sidebar ──
function renderCBEditor() {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => { b.style.display = 'none'; b.style.position = ''; });
  const el = _byId('cb-cab-editor');
  if (!el) return;

  const line = cbScratchpad;
  if (!line) return;

  // Sync cabinet library search box. Mirror the viewer card's display fallback
  // so cabinets without an explicit name still show "Cabinet N" in the search.
  const displayedName = line.name || (cbEditingLineIdx >= 0 ? 'Cabinet ' + (cbEditingLineIdx + 1) : '');
  const searchInp = _byId('cb-cabinet-search');
  if (searchInp && document.activeElement !== searchInp) {
    searchInp.value = displayedName;
  }
  // "Editing: <name>" indicator (mirrors cut list's cl-current-project pattern)
  const editIndicator = _byId('cb-current-cabinet');
  if (editIndicator) {
    if (cbEditingLineIdx >= 0) {
      editIndicator.innerHTML = `<span class="cl-cp-label">Editing:</span> <span class="cl-cp-name">${_escHtml(displayedName)}</span>`;
      editIndicator.style.display = '';
    } else {
      editIndicator.style.display = 'none';
      editIndicator.innerHTML = '';
    }
  }

  const cur = window.currency;
  const c = calcCBLine(line);
  /** @param {string} field @param {any} val */
  const matSmart = (field, val) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cb-mat-${field}" value="${_escHtml(val||'')}" autocomplete="off" style="font-size:13px" oninput="_smartCBMaterialSuggest(this,'cb-mat-suggest-${field}','${field}')" onfocus="_smartCBMaterialSuggest(this,'cb-mat-suggest-${field}','${field}')" onblur="setTimeout(()=>{_byId('cb-mat-suggest-${field}').style.display='none';cbUpdateField('${field}',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new material">+</div></div><div id="cb-mat-suggest-${field}" class="client-suggest-list" style="display:none"></div></div>`;
  // Per-component finish picker. `field` is the line property name
  // (`finish` | `doorFinish` | `drawerFrontFinish` | `drawerBoxFinish`).
  /** @param {string} field */
  const finishSmart = (field) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cb-mat-${field}" value="${_escHtml(line[field]||'None')}" autocomplete="off" style="font-size:13px" oninput="_smartCBFinishSuggest(this,'cb-mat-suggest-${field}','${field}')" onfocus="_smartCBFinishSuggest(this,'cb-mat-suggest-${field}','${field}')" onblur="setTimeout(()=>{_byId('cb-mat-suggest-${field}').style.display='none';cbUpdateField('${field}',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup('${field}')" title="Add new finish">+</div></div><div id="cb-mat-suggest-${field}" class="client-suggest-list" style="display:none"></div></div>`;
  // Per-component hardware list. `scope` ∈ {'cabinet','door','drawer'} maps
  // to line.hwItems / line.doorHwItems / line.drawerHwItems respectively.
  /** @param {string} scope */
  const hwListUI = (scope) => {
    const list = scope === 'door' ? (line.doorHwItems || []) : scope === 'drawer' ? (line.drawerHwItems || []) : (line.hwItems || []);
    const rows = list.map(/** @param {any} hw @param {number} hi */ (hw, hi) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px;position:relative">
            <div style="flex:1;position:relative"><div class="smart-input-wrap"><input type="text" id="cb-hw-${scope}-${line.id}-${hi}" value="${_escHtml(hw.name)}" style="font-size:12px" autocomplete="off" oninput="_smartCBHwSuggest(this,'cb-hw-suggest-${scope}-${line.id}-${hi}',${line.id},${hi},'${scope}')" onfocus="_smartCBHwSuggest(this,'cb-hw-suggest-${scope}-${line.id}-${hi}',${line.id},${hi},'${scope}')" onblur="setTimeout(()=>{_byId('cb-hw-suggest-${scope}-${line.id}-${hi}').style.display='none';updateCBHw(${line.id},${hi},'name',this.value,'${scope}')},150)"><div class="smart-input-add" onclick="_openNewCBHardwarePopup(${line.id},${hi},'${scope}')" title="Add new hardware type">+</div></div><div id="cb-hw-suggest-${scope}-${line.id}-${hi}" class="client-suggest-list" style="display:none"></div></div>
            <span style="font-size:10px;color:var(--muted)">×</span>
            <input type="number" style="width:40px;text-align:center;padding:5px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text)" value="${hw.qty}" min="1" onchange="updateCBHw(${line.id},${hi},'qty',this.value,'${scope}')">
            <button class="cb-del-btn" style="font-size:16px" onclick="removeCBHw(${line.id},${hi},'${scope}')">×</button>
          </div>`).join('');
    return `${rows}<div style="position:relative;margin-top:4px">
            <label style="font-size:10px;font-weight:600;color:var(--muted)">Add Hardware</label>
            <div class="smart-input-wrap">
              <input type="text" id="cb-hw-add-${scope}-${line.id}" placeholder="Search hardware..." style="font-size:12px" autocomplete="off" oninput="_smartCBHwAddSuggest(this,'cb-hw-add-suggest-${scope}-${line.id}',${line.id},'${scope}')" onfocus="_smartCBHwAddSuggest(this,'cb-hw-add-suggest-${scope}-${line.id}',${line.id},'${scope}')" onblur="setTimeout(()=>_byId('cb-hw-add-suggest-${scope}-${line.id}').style.display='none',150)">
              <div class="smart-input-add" onclick="_openNewCBHardwarePopup(${line.id},-1,'${scope}')" title="Add new hardware type">+</div>
            </div>
            <div id="cb-hw-add-suggest-${scope}-${line.id}" class="client-suggest-list" style="display:none"></div>
          </div>`;
  };
  /** @param {string} field @param {any} val @param {number} [min] */
  const stepper = (field, val, min) => `<div class="cl-stepper"><button class="cl-step-btn" onclick="cbStepField('${field}',-1)">−</button><input type="number" class="cl-input cl-qty-input" value="${val}" min="${min||0}" style="font-size:14px;width:42px" onchange="cbUpdateField('${field}',this.value)"><button class="cl-step-btn" onclick="cbStepField('${field}',1)">+</button></div>`;
  /** @param {string} sec */
  const so = sec => cbOpenSections.has(line.id + '-' + sec);
  /** @param {string} sec */
  const chev = sec => `<span style="font-size:10px;color:var(--muted);transition:transform .2s;display:inline-block;${so(sec)?'transform:rotate(90deg)':''}">&#9654;</span>`;
  const SB = 'border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;background:var(--surface)';
  const SH = 'display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none';
  const ST = 'font-size:13px;font-weight:600;color:var(--text);flex:1';
  const SS = 'font-size:11px;color:var(--muted)';
  /** @param {string} sec */
  const SC = sec => `style="padding:10px 12px;border-top:1px solid var(--border);${so(sec)?'':'display:none'}"`;
  const FM = 'margin:0';
  const LB = 'font-size:12px';
  const IS = 'font-size:14px';
  const SL = 'font-size:13px';
  /** @param {number} v */
  const liveCost = v => `<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">${cur}${Math.round(v)}</span>`;

  // Per-section cost breakdown (material + labour + section-specific hardware)
  const sec = calcCBSections(line);

  const isEditing = cbEditingLineIdx >= 0;
  const btnLabel = isEditing ? 'Save Changes' : 'Add to Project';
  const btnAction = 'cbCommitToProject()';

  el.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">

      <!-- CABINET (dims + material + finish + construction + base) -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'cab')">
          ${chev('cab')}
          <span style="${ST}">Cabinet</span>
          <span id="cb-live-cab">${liveCost(sec.cabinet)}</span>
          <span id="cb-live-cab-dims" style="${SS}">${line.w}×${line.h}×${line.d}</span>
        </div>
        <div ${SC('cab')}>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="${FM}"><label style="${LB}">Width (mm)</label><input type="number" value="${line.w}" style="${IS}" oninput="cbUpdateField('w',this.value)"></div>
            <div class="form-group" style="${FM}"><label style="${LB}">Height (mm)</label><input type="number" value="${line.h}" style="${IS}" oninput="cbUpdateField('h',this.value)"></div>
            <div class="form-group" style="${FM}"><label style="${LB}">Depth (mm)</label><input type="number" value="${line.d}" style="${IS}" oninput="cbUpdateField('d',this.value)"></div>
          </div>
          <div style="margin-bottom:8px"><label style="${LB}">Carcass Material</label>${matSmart('material', line.material)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Back Panel</label>${matSmart('backMat', line.backMat)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Carcass Type</label>
            <select style="${SL};width:100%" onchange="cbUpdateField('carcassType',this.value)">
              ${(cbSettings.carcassTypes||[]).map(/** @param {any} t */ t=>`<option value="${t.name}" ${t.name===line.carcassType?'selected':''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:8px"><label style="${LB}">Base</label>
            <select style="${SL};width:100%" onchange="cbUpdateField('baseType',this.value)">
              ${(cbSettings.baseTypes||[]).map(/** @param {any} b */ b=>`<option value="${b.name}" ${b.name===line.baseType?'selected':''}>${b.name}${b.price?' (+'+cur+b.price+')':''}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:8px"><label style="${LB}">Finish</label>${finishSmart('finish')}</div>
          <div style="margin-bottom:0"><label style="${LB}">Hardware</label>${hwListUI('cabinet')}</div>
        </div>
      </div>

      <!-- DOORS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'doors')">
          ${chev('doors')}
          <span style="${ST}">Doors</span>
          <span id="cb-live-doors">${line.doors > 0 ? liveCost(sec.doors) : ''}</span>
          <span id="cb-live-doors-count" style="${SS}">${line.doors>0?line.doors+' door'+(line.doors!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('doors')}>
          <div style="margin-bottom:8px"><label style="${LB}">Count</label>${stepper('doors', line.doors, 0)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Door Material</label>${matSmart('doorMat', line.doorMat||line.material)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Door Type</label>
            <select style="${SL};width:100%" onchange="cbUpdateField('doorType',this.value)">
              ${(cbSettings.doorTypes||[]).map(/** @param {any} t */ t=>`<option value="${t.name}" ${t.name===line.doorType?'selected':''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <label style="font-size:11px;color:var(--muted)">% of front area</label><div class="cb-pct-row"><input type="range" class="cb-pct-slider" min="0" max="100" value="${line.doorPct||0}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="cbUpdatePct('doorPct',this.value)"><span class="cb-pct-val">${line.doorPct||0}%</span></div>
          <div style="font-size:10px;color:var(--muted);margin-top:6px">Open: ${Math.max(0, 100 - (line.doorPct||0) - (line.drawerPct||0))}%</div>
          <div style="margin-top:10px"><label style="${LB}">Finish</label>${finishSmart('doorFinish')}</div>
          <div style="margin-top:8px"><label style="${LB}">Hardware</label>${hwListUI('door')}</div>
        </div>
      </div>

      <!-- DRAWER FRONTS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'drawerFronts')">
          ${chev('drawerFronts')}
          <span style="${ST}">Drawer Fronts</span>
          <span id="cb-live-drawer-fronts">${line.drawers > 0 ? liveCost(sec.drawerFronts) : ''}</span>
          <span id="cb-live-drawer-fronts-count" style="${SS}">${line.drawers>0?line.drawers+' front'+(line.drawers!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('drawerFronts')}>
          <div style="margin-bottom:8px"><label style="${LB}">Count</label>${stepper('drawers', line.drawers, 0)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Front Material</label>${matSmart('drawerFrontMat', line.drawerFrontMat||line.material)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Front Type</label>
            <select style="${SL};width:100%" onchange="cbUpdateField('drawerFrontType',this.value)">
              ${(cbSettings.drawerFrontTypes||[]).map(/** @param {any} t */ t=>`<option value="${t.name}" ${t.name===line.drawerFrontType?'selected':''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <label style="font-size:11px;color:var(--muted)">% of front area</label><div class="cb-pct-row"><input type="range" class="cb-pct-slider" min="0" max="100" value="${line.drawerPct||0}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="cbUpdatePct('drawerPct',this.value)"><span class="cb-pct-val">${line.drawerPct||0}%</span></div>
          <div style="font-size:10px;color:var(--muted);margin-top:6px">Open: ${Math.max(0, 100 - (line.doorPct||0) - (line.drawerPct||0))}%</div>
          <div style="margin-top:10px"><label style="${LB}">Finish</label>${finishSmart('drawerFrontFinish')}</div>
        </div>
      </div>

      <!-- DRAWER BOXES -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'drawerBoxes')">
          ${chev('drawerBoxes')}
          <span style="${ST}">Drawer Boxes</span>
          <span id="cb-live-drawer-boxes">${line.drawers > 0 ? liveCost(sec.drawerBoxes) : ''}</span>
          <span id="cb-live-drawer-boxes-count" style="${SS}">${line.drawers>0?line.drawers+' box'+(line.drawers!==1?'es':''):'None'}</span>
        </div>
        <div ${SC('drawerBoxes')}>
          <div style="margin-bottom:8px"><label style="${LB}">Inner Box Material</label>${matSmart('drawerInnerMat', line.drawerInnerMat||line.backMat)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Box Type</label>
            <select style="${SL};width:100%" onchange="cbUpdateField('drawerBoxType',this.value)">
              ${(cbSettings.drawerBoxTypes||[]).map(/** @param {any} t */ t=>`<option value="${t.name}" ${t.name===line.drawerBoxType?'selected':''}>${t.name}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:8px"><label style="${LB}">Finish</label>${finishSmart('drawerBoxFinish')}</div>
          <div style="margin-bottom:0"><label style="${LB}">Hardware</label>${hwListUI('drawer')}</div>
        </div>
      </div>

      <!-- SHELVES & PARTITIONS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'shelves')">
          ${chev('shelves')}
          <span style="${ST}">Shelves & Partitions</span>
          <span id="cb-live-shelves">${(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))>0 ? liveCost(sec.shelves) : ''}</span>
          <span id="cb-live-shelves-count" style="${SS}">${(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))>0?(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))+' total':'None'}</span>
        </div>
        <div ${SC('shelves')}>
          <div class="form-row" style="margin-bottom:6px;align-items:flex-end">
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Fixed Shelf</label>${stepper('shelves', line.shelves, 0)}</div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Adj. Holes</label>${stepper('adjShelves', line.adjShelves, 0)}</div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Loose Shelf</label>${stepper('looseShelves', line.looseShelves||0, 0)}</div>
          </div>
          <div class="form-row" style="margin-bottom:0;align-items:flex-end">
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Partition</label>${stepper('partitions', line.partitions||0, 0)}</div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">End Panel</label>${stepper('endPanels', line.endPanels||0, 0)}</div>
          </div>
        </div>
      </div>


      <!-- EXTRAS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'extras')">
          ${chev('extras')}
          <span style="${ST}">Extras</span>
          <span id="cb-live-extras">${sec.extras > 0 ? liveCost(sec.extras) : ''}</span>
          <span id="cb-live-extras-count" style="${SS}">${(line.extras||[]).length>0?(line.extras.length)+' item'+(line.extras.length!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('extras')}>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Add custom items like cable holes, lighting cutouts, etc.</div>
          ${(line.extras||[]).map(/** @param {any} ex @param {number} ei */ (ex, ei) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">
            <input style="flex:1;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-family:inherit" value="${ex.label||''}" placeholder="Item name" onblur="cbUpdateExtra(${line.id},${ei},'label',this.value)">
            <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--surface2)">
              <span style="font-size:11px;color:var(--muted);padding:4px 4px 4px 8px;background:var(--surface)">${cur}</span>
              <input type="number" style="width:60px;border:none;padding:6px 6px 6px 2px;font-size:13px;background:transparent;color:var(--text)" value="${ex.cost||0}" onblur="cbUpdateExtra(${line.id},${ei},'cost',this.value)">
            </div>
            <button class="cb-del-btn" style="font-size:16px" onclick="cbRemoveExtra(${line.id},${ei})">×</button>
          </div>`).join('')}
          <button class="cl-add-btn" onclick="cbAddExtra(${line.id})" style="font-size:12px;padding:5px 10px;margin:4px 0 0">+ Add Extra</button>
        </div>
      </div>

      <!-- NOTES -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCBSection(${line.id},'notes')">
          ${chev('notes')}
          <span style="${ST}">Notes</span>
          <span id="cb-live-notes" style="${SS}">${line.notes?'✓':''} ${line.room||''}</span>
        </div>
        <div ${SC('notes')}>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="${FM}"><label style="${LB}">Room / Area</label><input type="text" value="${line.room||''}" placeholder="e.g. Kitchen" style="${SL}" list="cb-room-list" onchange="cbUpdateField('room',this.value)"></div>
          </div>
          <div class="form-group" style="${FM}"><label style="${LB}">Notes</label><textarea style="${SL};min-height:60px;resize:vertical" onblur="cbUpdateField('notes',this.value)">${line.notes||''}</textarea></div>
        </div>
      </div>

      <!-- Sidebar Actions -->
      <div style="padding-top:8px;display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="${btnAction}" style="flex:1;font-size:13px;padding:10px 12px">${btnLabel}</button>
        ${isEditing ? `<button class="btn btn-outline" onclick="cbCancelEdit()" style="font-size:12px;padding:10px 12px">Cancel</button>` : ''}
        <button class="btn btn-outline" onclick="cbSaveToLibrary()" style="font-size:12px;padding:10px 12px">Save to Library</button>
      </div>

    </div>
    <datalist id="cb-room-list">${['Kitchen','Bathroom','Bedroom','Living Room','Laundry','Garage','Office','Pantry'].map(r=>'<option value="'+r+'">').join('')}</datalist>
  `;
}

// Targeted update of section header live costs without re-rendering inputs.
// Called from cbUpdateField/cbStepField so values refresh as the user types
// without disrupting the focused input.
function _refreshCBLiveCosts() {
  if (!cbScratchpad) return;
  const line = cbScratchpad;
  const cur = window.currency;
  const sec = calcCBSections(line);

  /** @param {number} v */
  const liveCost = v => `<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">${cur}${Math.round(v)}</span>`;
  /** @param {string} id @param {string} html */
  const set = (id, html) => { const el = _byId(id); if (el) el.innerHTML = html; };

  set('cb-live-cab', liveCost(sec.cabinet));
  set('cb-live-cab-dims', `${line.w}×${line.h}×${line.d}`);
  set('cb-live-doors', line.doors > 0 ? liveCost(sec.doors) : '');
  set('cb-live-doors-count', line.doors>0?line.doors+' door'+(line.doors!==1?'s':''):'None');
  set('cb-live-drawer-fronts', line.drawers > 0 ? liveCost(sec.drawerFronts) : '');
  set('cb-live-drawer-fronts-count', line.drawers>0?line.drawers+' front'+(line.drawers!==1?'s':''):'None');
  set('cb-live-drawer-boxes', line.drawers > 0 ? liveCost(sec.drawerBoxes) : '');
  set('cb-live-drawer-boxes-count', line.drawers>0?line.drawers+' box'+(line.drawers!==1?'es':''):'None');
  const shelfTotal = (line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0);
  set('cb-live-shelves', shelfTotal > 0 ? liveCost(sec.shelves) : '');
  set('cb-live-shelves-count', shelfTotal > 0 ? shelfTotal + ' total' : 'None');
  set('cb-live-extras', sec.extras > 0 ? liveCost(sec.extras) : '');
  set('cb-live-extras-count', (line.extras||[]).length>0 ? line.extras.length+' item'+(line.extras.length!==1?'s':''):'None');
  set('cb-live-notes', (line.notes?'✓':'') + ' ' + (line.room||''));
}

// ── Render right panel: cost breakdown ──
function renderCBResults() {
  const el = _byId('cb-results');
  if (!el) return;
  const cur = window.currency;
  /** @param {any} v */
  const fmt = v => cur + Number(v).toFixed(2);
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const projName = _byId('cb-project')?.value || '';

  if (!cbLines.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>
      <h3>Cabinet Builder</h3>
      <p>Configure a cabinet in the editor and click "Add to Project" to start building your quote.</p>
    </div>`;
    return;
  }

  // Totals
  let gMat=0,gLabour=0,gHw=0,gSub=0;
  const calcs = cbLines.map(l => { const c=calcCBLine(l); gMat+=c.matCost*l.qty; gLabour+=c.labourCost*l.qty; gHw+=c.hwCost*l.qty; gSub+=c.lineSubtotal; return c; });
  const totalHrs = cbLines.reduce((s,l,i)=>s+calcs[i].labourHrs*l.qty,0);
  const gMarkup = gSub * cbSettings.markup/100;
  const gTotal = (gSub+gMarkup)*(1+cbSettings.tax/100);

  let html = `<div style="max-width:700px">`;

  // Editing quote banner
  if (cbEditingQuoteId) {
    const eq = quotes.find(x => x.id === cbEditingQuoteId);
    const eqLabel = eq ? (quoteProject(eq) || quoteClient(eq) || 'Quote') : 'Quote';
    html += `<div style="background:var(--accent-dim);border:2px solid var(--accent);border-radius:8px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600;color:var(--accent)">Editing: ${_escHtml(eqLabel)}</span>
      <span style="flex:1"></span>
      <button class="btn btn-primary" onclick="finishEditingQuote()" style="font-size:12px;padding:6px 14px">Done</button>
      <button class="btn btn-outline" onclick="discardQuoteEdits()" style="font-size:12px;padding:6px 14px">Discard</button>
    </div>`;
  }

  // Top buttons bar
  html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center">`;
  if (!cbEditingQuoteId) {
    html += `<button class="btn btn-primary" onclick="cbSendToQuote()" style="font-size:12px;padding:8px 14px">Send to Quote &rarr;</button>`;
  }
  html += `<span style="flex:1"></span>
    <button class="btn btn-outline" onclick="cbExportLibrary()" style="font-size:12px;padding:8px 12px;width:auto">&darr; Export</button>
    <button class="btn btn-outline" onclick="cbImportLibrary()" style="font-size:12px;padding:8px 12px;width:auto">&uarr; Import</button>
  </div>`;

  // Project header
  if (projName) html += `<h2 style="font-size:18px;font-weight:800;margin:0 0 4px">${_escHtml(projName)}</h2>`;
  html += `<div style="font-size:12px;color:var(--muted);margin-bottom:16px">${cbLines.length} cabinet${cbLines.length!==1?'s':''} · ${cbLines.reduce((s,l)=>s+l.qty,0)} units</div>`;

  // Individual cabinet cards
  cbLines.forEach((line, idx) => {
    const c = calcs[idx];
    const isActive = idx === cbEditingLineIdx;
    const unitCost = c.matCost + c.labourCost + c.hwCost;
    const cabMarkup = c.lineSubtotal * cbSettings.markup / 100;
    const cabTotal = (c.lineSubtotal + cabMarkup) * (1 + cbSettings.tax / 100);
    html += `<div style="background:var(--surface);border:${isActive?'2px solid var(--accent)':'1px solid var(--border)'};border-radius:var(--radius);margin-bottom:10px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow);transition:box-shadow .15s" onclick="cbEditCabinetFromOutput(${idx})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='var(--shadow)'">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:${isActive?'var(--accent-dim)':'var(--surface2)'}">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(line.name||'Cabinet '+(idx+1))}</div>
          <div style="font-size:11px;color:var(--muted)">${line.w} × ${line.h} × ${line.d} mm · ${_escHtml(line.material)}</div>
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--accent)">${fmt0(cabTotal)}</div>
      </div>
      <!-- Details -->
      <div style="padding:10px 16px;font-size:12px;color:var(--text2)">
        <div style="display:grid;grid-template-columns:1fr auto;gap:2px 16px">
          <span>Materials</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt(c.matCost)}</span>
          <span>Labour (${c.labourHrs.toFixed(1)} hrs @ ${cur}${cbSettings.labourRate}/hr)</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt(c.labourCost)}</span>
          <span>Hardware</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt0(c.hwCost)}</span>
          ${line.qty > 1 ? `
          <span style="border-top:1px solid var(--border2);padding-top:4px;margin-top:2px">Unit Cost</span><span style="text-align:right;font-weight:600;border-top:1px solid var(--border2);padding-top:4px;margin-top:2px">${fmt0(unitCost)}</span>
          <span>× ${line.qty} units</span><span style="text-align:right;font-weight:700">${fmt0(c.lineSubtotal)}</span>
          ` : `
          <span style="color:var(--muted);border-top:1px solid var(--border2);padding-top:4px;margin-top:2px">Subtotal</span><span style="text-align:right;font-weight:700;border-top:1px solid var(--border2);padding-top:4px;margin-top:2px">${fmt0(c.lineSubtotal)}</span>
          `}
          ${cbSettings.markup>0?`<span style="color:var(--muted)">Markup (${cbSettings.markup}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(cabMarkup)}</span>`:''}
          ${cbSettings.tax>0?`<span style="color:var(--muted)">Tax (${cbSettings.tax}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(cabTotal-c.lineSubtotal-cabMarkup)}</span>`:''}
        </div>
        <!-- Sub details -->
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border2);font-size:11px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap">
          ${line.finish&&line.finish!=='None'?`<span>${_escHtml(line.finish)}</span>`:''}${line.construction?`<span>${_escHtml(line.construction)}</span>`:''}${line.baseType&&line.baseType!=='None'?`<span>${_escHtml(line.baseType)}</span>`:''}${line.doors>0?`<span>${line.doors} door${line.doors!==1?'s':''}</span>`:''}${line.drawers>0?`<span>${line.drawers} drawer${line.drawers!==1?'s':''}</span>`:''}${(line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)>0?`<span>${(line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)} shelves</span>`:''}${(line.partitions||0)>0?`<span>${line.partitions} partition${line.partitions!==1?'s':''}</span>`:''}${(line.endPanels||0)>0?`<span>${line.endPanels} end panel${line.endPanels!==1?'s':''}</span>`:''}${line.room?`<span>${_escHtml(line.room)}</span>`:''}
        </div>
      </div>
      <!-- Actions -->
      <div style="padding:6px 12px;border-top:1px solid var(--border2);display:flex;gap:6px;align-items:center;justify-content:flex-end;background:var(--surface2)">
        <div class="cl-stepper" style="flex:0 0 auto" onclick="event.stopPropagation()">
          <button class="cl-step-btn" style="padding:0 6px" onclick="event.stopPropagation();cbStepLineQty(${idx},-1)" title="Decrease quantity">−</button>
          <input type="number" class="cl-input cl-qty-input" value="${line.qty}" min="1" style="font-size:11px;width:32px;padding:4px 2px" onclick="event.stopPropagation()" onchange="event.stopPropagation();cbSetLineQty(${idx},this.value)">
          <button class="cl-step-btn" style="padding:0 6px" onclick="event.stopPropagation();cbStepLineQty(${idx},1)" title="Increase quantity">+</button>
        </div>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto" onclick="event.stopPropagation();_duplicateCabinet(${idx})" title="Duplicate cabinet">Duplicate</button>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto;color:var(--danger)" onclick="event.stopPropagation();_confirm('Delete this cabinet?',()=>{cbLines.splice(${idx},1);saveCBLines();renderCBPanel();_toast('Cabinet deleted','success')})" title="Delete cabinet">Delete</button>
      </div>
    </div>`;
  });

  // All Cabinets Total card
  html += `<div style="background:var(--surface);border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)">
    <div style="padding:12px 16px;background:var(--surface2);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">All Cabinets (${cbLines.length})</div>
    <div style="padding:12px 16px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 16px;font-size:13px">
        <span style="color:var(--text2)">Materials</span><span style="text-align:right;font-weight:600">${fmt0(gMat)}</span>
        <span style="color:var(--text2)">Labour (${totalHrs.toFixed(1)} hrs)</span><span style="text-align:right;font-weight:600">${fmt0(gLabour)}</span>
        <span style="color:var(--text2)">Hardware</span><span style="text-align:right;font-weight:600">${fmt0(gHw)}</span>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;display:grid;grid-template-columns:1fr auto;gap:3px 16px;font-size:13px">
        <span style="font-weight:700">Subtotal</span><span style="text-align:right;font-weight:700">${fmt0(gSub)}</span>
        ${cbSettings.markup>0?`<span style="color:var(--muted)">Markup (${cbSettings.markup}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(gMarkup)}</span>`:''}
        ${cbSettings.tax>0?`<span style="color:var(--muted)">Tax (${cbSettings.tax}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(gTotal-gSub-gMarkup)}</span>`:''}
      </div>
      <div style="border-top:2px solid var(--accent);margin-top:6px;padding-top:8px;display:flex;justify-content:space-between;font-size:16px">
        <span style="font-weight:700;color:var(--accent)">Quote Total</span>
        <span style="font-weight:800;color:var(--accent)">${fmt0(gTotal)}</span>
      </div>
    </div>
  </div>`;

  html += `</div>`;
  el.innerHTML = html;
}

// ── Library View (main content area) ──
function renderCBLibraryView() {
  const el = _byId('cb-library-view');
  if (!el) return;
  const cur = window.currency;
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  if (!cbLibrary.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg></div>
      <h3>Cabinet Library</h3>
      <p>No saved templates yet. Use "Save to Library" in the editor to save reusable cabinet templates.</p>
    </div>`;
    return;
  }

  let html = `<div style="max-width:700px">`;
  html += `<div style="margin-bottom:16px;display:flex;align-items:center;gap:12px">
    <h2 style="font-size:18px;font-weight:800;margin:0;flex:1">Cabinet Library</h2>
    <span style="font-size:12px;color:var(--muted)">${cbLibrary.length} template${cbLibrary.length!==1?'s':''}</span>
  </div>`;

  // Filter input
  html += `<div style="margin-bottom:16px"><input type="text" id="cb-lib-filter" placeholder="Filter templates..." style="width:100%;font-size:13px;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface2);color:var(--text)" oninput="filterCBLibraryView(this.value)"></div>`;

  html += `<div id="cb-lib-grid">`;
  html += _renderLibraryCards(cbLibrary);
  html += `</div></div>`;
  el.innerHTML = html;
}

/** @param {any[]} items */
function _renderLibraryCards(items) {
  const cur = window.currency;
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  let html = '';
  items.forEach((c, i) => {
    const idx = cbLibrary.indexOf(c);
    const calc = calcCBLine(c);
    const details = [];
    if (c.doors > 0) details.push(c.doors + ' door' + (c.doors!==1?'s':''));
    if (c.drawers > 0) details.push(c.drawers + ' drawer' + (c.drawers!==1?'s':''));
    const shelfTotal = (c.shelves||0) + (c.adjShelves||0) + (c.looseShelves||0);
    if (shelfTotal > 0) details.push(shelfTotal + ' shelves');

    html += `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px;box-shadow:var(--shadow);transition:box-shadow .15s" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='var(--shadow)'">
      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px 6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(c._libName||c.name||'Cabinet')}</div>
          <div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.w} × ${c.h} × ${c.d} mm · ${_escHtml(c.material||'')}${details.length?' · '+details.join(', '):''}</div>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--accent);flex-shrink:0;white-space:nowrap">${fmt0(calc.lineSubtotal)}</div>
      </div>
      <div style="display:flex;gap:6px;padding:0 12px 10px;justify-content:flex-end">
        <button class="btn btn-primary" onclick="cbLoadFromLibrary(${idx})" style="font-size:11px;padding:5px 10px;width:auto">Load</button>
        <button class="btn btn-outline" onclick="cbAddFromLibrary(${idx})" style="font-size:11px;padding:5px 10px;width:auto">+ Project</button>
        <button class="btn btn-outline" title="Delete" onclick="_confirm('Remove from library?',()=>cbRemoveFromLibrary(${idx}))" style="font-size:13px;padding:5px 9px;color:var(--muted);width:auto">×</button>
      </div>
    </div>`;
  });
  return html;
}

/** @param {string} q */
function filterCBLibraryView(q) {
  const grid = _byId('cb-lib-grid');
  if (!grid) return;
  const query = q.trim().toLowerCase();
  const filtered = query ? cbLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(query)) : cbLibrary;
  grid.innerHTML = _renderLibraryCards(filtered);
}
