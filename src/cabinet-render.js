// ProCabinet — Cabinet UI rendering (extracted from cabinet.js, R.1 split)
// All DOM rendering lives here. Reads globals, writes innerHTML.

// ── UI state ──
let cbExpandedRows = new Set();
let cbMainView = 'results';
let cbActiveTab = 'builder'; // 'builder' | 'rates' — active Quote Builder sidebar sub-tab

/** @param {number} id */
function toggleCBExpand(id) {
  if (cbExpandedRows.has(id)) cbExpandedRows.delete(id);
  else cbExpandedRows.add(id);
  renderCBPanel();
}

function toggleCBSettings() {
  switchCabTab('rates');
}

/** @param {string} tab */
function switchCabTab(tab) {
  cbActiveTab = tab;
  const rates = _byId('cab-view-rates');
  const tabBuilder = _byId('cab-tab-builder');
  const tabRates = _byId('cab-tab-rates');
  const sidebar = _byId('cb-sidebar');
  const ctx = _byId('cb-context');
  if (!sidebar) return;
  const builderDivs = /** @type {HTMLElement[]} */ (Array.from(sidebar.children).filter(el => el.id !== 'cab-view-rates'));
  // Gated empty state (no quote/client open, not editing a library template):
  // #cb-context holds the quote-picker gate and #cb-sidebar is hidden. The
  // rates panel lives inside #cb-sidebar, so My Rates here means revealing
  // #cb-sidebar + hiding the gate; the Builder tab restores the gate. When a
  // project is open #cb-context is the persistent header — leave it alone.
  const gated = !_cbCurrentClientId && !cbEditingQuoteId && !(cbEditingLibraryIdx >= 0);

  if (tab === 'rates') {
    builderDivs.forEach(el => el.style.display = 'none');
    if (rates) rates.style.display = '';
    if (gated) { sidebar.style.display = ''; if (ctx) ctx.style.display = 'none'; }
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'transparent'; tabBuilder.style.fontWeight = '500'; tabBuilder.style.color = 'var(--muted)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'var(--accent)'; tabRates.style.fontWeight = '700'; tabRates.style.color = 'var(--text)'; }
    renderCBRates();
  } else {
    builderDivs.forEach(el => el.style.display = '');
    if (rates) rates.style.display = 'none';
    if (gated) { sidebar.style.display = 'none'; if (ctx) ctx.style.display = ''; }
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'var(--accent)'; tabBuilder.style.fontWeight = '700'; tabBuilder.style.color = 'var(--text)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'transparent'; tabRates.style.fontWeight = '500'; tabRates.style.color = 'var(--muted)'; }
  }
}

/** @param {string} tab */
function switchCBLibTab(tab) {
  const gateWrap = _byId('cb-lib-gate-wrap');
  const ratesWrap = _byId('cb-lib-rates-wrap');
  const tabBuilder = _byId('cb-lib-tab-builder');
  const tabRates = _byId('cb-lib-tab-rates');
  if (tab === 'rates') {
    if (gateWrap) gateWrap.style.display = 'none';
    if (ratesWrap) ratesWrap.style.display = '';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'transparent'; tabBuilder.style.fontWeight = '500'; tabBuilder.style.color = 'var(--muted)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'var(--accent)'; tabRates.style.fontWeight = '700'; tabRates.style.color = 'var(--text)'; }
    renderCBRates();
  } else {
    if (gateWrap) gateWrap.style.display = '';
    if (ratesWrap) ratesWrap.style.display = 'none';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'var(--accent)'; tabBuilder.style.fontWeight = '700'; tabBuilder.style.color = 'var(--text)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'transparent'; tabRates.style.fontWeight = '500'; tabRates.style.color = 'var(--muted)'; }
  }
}

// ── Main content view toggle (Results / Library) ──
/** Sync sidebar wrappers + tab-strip styling to the current cbMainView and
 *  edit state. Pure render — does NOT mutate scratchpad / editing indices. */
function _syncCBMainViewChrome() {
  const view = cbMainView;
  const results = _byId('cb-results');
  const library = _byId('cb-library-view');
  const tabR = _byId('cb-main-tab-results');
  const tabL = _byId('cb-main-tab-library');
  const sbB = _byId('cb-sidebar-builder');
  const sbL = _byId('cb-sidebar-library');
  if (results) results.style.display = view === 'results' ? '' : 'none';
  if (library) library.style.display = view === 'library' ? '' : 'none';
  // Pinned results footer lives outside #cb-results — hide it whenever the
  // Library view is showing (renderCBResults re-populates it on the way back).
  const foot = _byId('cb-results-footer');
  if (foot && view !== 'results') foot.style.display = 'none';
  if (tabR) { tabR.style.borderBottomColor = view === 'results' ? 'var(--accent)' : 'transparent'; tabR.style.fontWeight = view === 'results' ? '700' : '500'; tabR.style.color = view === 'results' ? 'var(--text)' : 'var(--muted)'; }
  if (tabL) { tabL.style.borderBottomColor = view === 'library' ? 'var(--accent)' : 'transparent'; tabL.style.fontWeight = view === 'library' ? '700' : '500'; tabL.style.color = view === 'library' ? 'var(--text)' : 'var(--muted)'; }
  // Sidebar wrapper visibility. The builder wrapper houses the cabinet editor,
  // which is reused for in-quote AND library-template edits. So it stays
  // visible whenever something is being edited, regardless of sub-tab.
  const showBuilder = view === 'results' || (cbEditingLibraryIdx >= 0 && !!cbScratchpad);
  if (sbB) sbB.style.display = showBuilder ? 'flex' : 'none';
  if (sbL) sbL.style.display = (view === 'library' && !showBuilder) ? 'flex' : 'none';
  if (view === 'library' && !showBuilder
      && typeof /** @type {any} */ (window)._renderCBLibSidebarGate === 'function') {
    /** @type {any} */ (window)._renderCBLibSidebarGate();
    switchCBLibTab('builder');
  }
}
/** @type {any} */ (window)._syncCBMainViewChrome = _syncCBMainViewChrome;

/** @param {string} view */
function switchCBMainView(view) {
  // Cross-sub-tab cleanup: each sub-tab has its own active-edit semantics.
  // Switching tabs drops the OTHER tab's open scratchpad so the receiving
  // tab starts in a clean state.
  if (view === 'library' && cbEditingLibraryIdx < 0 && cbScratchpad) {
    cbScratchpad = null;
    cbEditingLineIdx = -1;
  }
  if (view === 'results' && cbEditingLibraryIdx >= 0) {
    cbEditingLibraryIdx = -1;
    cbScratchpad = null;
    cbEditingLineIdx = -1;
    if (typeof renderCBEditor === 'function') renderCBEditor();
    // Refresh the sidebar context (#cb-context) so the "Cabinet Library"
    // header is replaced with the appropriate Quote Builder gate (either
    // client-picker empty state or in-project header).
    if (typeof /** @type {any} */ (window)._cbRenderContext === 'function') {
      /** @type {any} */ (window)._cbRenderContext();
    }
  }
  cbMainView = view;
  if (typeof /** @type {any} */ (window)._pcSaveCabinetMainView === 'function') {
    /** @type {any} */ (window)._pcSaveCabinetMainView(view);
  }
  _syncCBMainViewChrome();
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
  const targets = [_byId('cb-rates-content'), _byId('cb-lib-rates-content')].filter(Boolean);
  if (!targets.length) return;
  const cur = window.currency;
  /** @type {any} */
  const lt = cbSettings.labourTimes || {};
  if (!window._ratesOpen) window._ratesOpen = { core:true, carcassTypes:true, doorTypes:true, drawerFrontTypes:true, drawerBoxTypes:true, labour:true, basetypes:true };
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
    {name:'Labour Time Contingency',price:cbSettings.contingencyPct ?? 5,path:'cbSettings.contingencyPct',unit:'%'},
    // Packaging + installation: per-cabinet hours folded into cabinet labour by
    // calcCBLine (subject to the contingency above), so they live with the
    // other pricing levers here rather than under Extra Panels.
    {name:'Packaging',price:cbSettings.packagingHours||0,path:'cbSettings.packagingHours',unit:'hrs/cab',step:'0.05'},
    {name:'Installation',price:cbSettings.installationHours||0,path:'cbSettings.installationHours',unit:'hrs/cab',step:'0.05'},
  ];
  const coreContent = coreItems.map(item => `<div class="cb-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.price}"${item.step?` step="${item.step}"`:''} style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
    </div>
  </div>`).join('');

  // Extra Panels — fixed per-unit labour times for shelves, partitions & end
  // panels (power-law carcass/door/etc. components handled per-type below).
  // Finish labour is intentionally omitted: finish material is driven from stock.
  const labourItems = [
    {name:'Fixed Shelf',val:lt.fixedShelf||0.3,path:'cbSettings.labourTimes.fixedShelf',unit:'hrs'},
    {name:'Adj. Shelf Holes',val:lt.adjShelfHoles||0.4,path:'cbSettings.labourTimes.adjShelfHoles',unit:'hrs'},
    {name:'Loose Shelf',val:lt.looseShelf||0.2,path:'cbSettings.labourTimes.looseShelf',unit:'hrs'},
    {name:'Partition',val:lt.partition||0.5,path:'cbSettings.labourTimes.partition',unit:'hrs'},
    {name:'End Panel',val:lt.endPanel||0.3,path:'cbSettings.labourTimes.endPanel',unit:'hrs'},
  ];
  const labourContent = labourItems.map(item => `<div class="cb-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.val}" step="0.05" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
    </div>
  </div>`).join('');

  // Custom extra-panel types — editable name + size basis + hrs + remove, shown
  // below the 5 fixed built-ins. basis drives the face-area & cut-list dimensions.
  const epTypes = cbSettings.extraPanelTypes || [];
  const epBases = [['HD','H × D'],['WD','W × D'],['WH','W × H']];
  /** @param {string} cur @param {number} i */
  const epBasisSelect = (cur, i) => `<select title="Panel size basis (which two cabinet dimensions form its face)" onchange="cbSettings.extraPanelTypes[${i}].basis=this.value;saveCBSettings();renderCBPanel()" style="font-size:10px;padding:3px 2px;border:1px solid var(--border);border-radius:4px;background:var(--surface2);color:var(--text);max-width:62px">${epBases.map(/** @param {string[]} b */ b=>`<option value="${b[0]}"${cur===b[0]?' selected':''}>${b[1]}</option>`).join('')}</select>`;
  const epCustomRows = epTypes.map(/** @param {any} t @param {number} i */ (t,i) => `<div class="cb-mat-row" style="margin-top:4px">
    <input value="${t.name}" placeholder="Name" onblur="cbSettings.extraPanelTypes[${i}].name=this.value;saveCBSettings();renderCBPanel()">
    ${epBasisSelect(t.basis, i)}
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">hrs</span>
      <input type="number" value="${t.hrs}" step="0.05" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:46px" onblur="cbSettings.extraPanelTypes[${i}].hrs=parseFloat(this.value)||0;saveCBSettings();renderCBPanel()">
    </div>
    <button onclick="cbSettings.extraPanelTypes.splice(${i},1);saveCBSettings();renderCBRates();renderCBPanel()" style="font-size:16px;background:none;border:none;color:var(--muted);cursor:pointer" title="Remove panel type">&times;</button>
  </div>`).join('');
  const epCustomLabel = `<div style="font-size:10px;color:var(--muted);margin:10px 0 0;padding-top:8px;border-top:1px dashed var(--border)">Custom panels${epTypes.length?'':' — none yet'}</div>`;
  const epAddBtn = `<button class="cl-add-btn" onclick="addCBExtraPanel()" style="font-size:11px;padding:4px 8px;margin:6px 0 0">+ Add panel type</button>`;
  const extraPanelsContent = labourContent + epCustomLabel + epCustomRows + epAddBtn;

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

  const html = `
    ${stockLink}
    ${section('core', 'Core Rates', '7 rates', coreContent)}
    ${section('carcassTypes', 'Carcass', '('+carcassTypes.length+')', typeListItems(carcassTypes, 'cbSettings.carcassTypes', 0.4))}
    ${section('labour', 'Extra Panels', (5+epTypes.length)+' rates', extraPanelsContent)}
    ${section('doorTypes', 'Door', '('+doorTypes.length+')', typeListItems(doorTypes, 'cbSettings.doorTypes', 0.4))}
    ${section('drawerFrontTypes', 'Drawer Front', '('+drawerFrontTypes.length+')', typeListItems(drawerFrontTypes, 'cbSettings.drawerFrontTypes', 0.3))}
    ${section('drawerBoxTypes', 'Drawer Box', '('+drawerBoxTypes.length+')', typeListItems(drawerBoxTypes, 'cbSettings.drawerBoxTypes', 0.8))}
    ${section('basetypes', 'Base', '('+(cbSettings.baseTypes||[]).length+')', typeListItems(cbSettings.baseTypes||[], 'cbSettings.baseTypes', 0.3))}
  `;
  targets.forEach(el => { if (el) el.innerHTML = html; });
}

function renderCBSettingsLists() { renderCBRates(); }

// ── Render the sidebar: cabinet list + active editor ──
function renderCBPanel() {
  if (!_renderCBAuthGate()) return;
  renderCBRates();
  renderCBEditor();
  // F7 (2026-05-13): Library sub-tab is now self-sufficient via its own
  // sidebar gate (#cb-sidebar-library). No auto-flip — the Quote Builder
  // sub-tab keeps its existing client-picker empty state in _cbRenderContext.
  if (cbMainView === 'results') {
    renderCBResults();
  } else {
    renderCBLibraryView();
  }
  _syncCBMainViewChrome();
  if (typeof _renderCbCurrentProject === 'function') _renderCbCurrentProject();
}

function _renderCBAuthGate() {
  const builder = document.getElementById('cab-view-builder');
  let gate = document.getElementById('cb-auth-gate');
  // Demo mode shows the seeded builder — saving is gated separately via
  // _requireAuth(), so a guest can still explore the Cabinet Builder.
  if (_userId || window._demoMode) {
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
        <div style="margin-bottom:12px;color:var(--muted);display:flex;justify-content:center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
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
  // Reference the live row, not a copy — edits flow straight to cbLines[idx]
  // and the 800 ms debounced sync persists them.
  cbScratchpad = cbLines[idx];
  renderCBEditor();
}

/** @param {number} idx */
function cbEditCabinetFromOutput(idx) {
  cbSelectLine(idx);
  // Refresh the table so the .editing row highlight follows the selection
  // (the old cards had the same lag — cbSelectLine only re-renders the editor).
  renderCBResults();
  if (window._mvShowEditor) window._mvShowEditor();
  // Scroll to the editor's TOP — with the pinned header, scrolling to the
  // bottom would land the user on the sticky footer instead of the name/dims.
  _scrollCBEditorIntoView();
}

// ── Spec-card editor helpers (2026-07-03 v2) ──
/** Live cost text for card headers (My Rates styling: plain accent, no pill).
 *  @param {number} v */
function _cbSecBadge(v) {
  return `<span class="cb-rc-badge">${window.currency}${Math.round(v)}</span>`;
}

/** Header/footer live total (line subtotal incl. qty).
 *  @param {any} line @param {any} calc */
function _cbEdTotalHTML(line, calc) {
  return `${window.currency}${Math.round(calc.lineSubtotal).toLocaleString()}`;
}

// ── Render the active cabinet editor in sidebar ──
function renderCBEditor() {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => { b.style.display = 'none'; b.style.position = ''; });
  const el = _byId('cb-cab-editor');
  if (!el) return;

  const line = cbScratchpad;
  // No cabinet open → render the cabinet sub-gate (only meaningful when a
  // project is active; library mode without a selection just shows empty).
  // Match _cbRenderContext: either an active client OR an editing-quote id
  // counts as in-project. Reopening an existing quote sets cbEditingQuoteId
  // without setting _cbCurrentClientId, so the client-only check left the
  // sidebar blank on refresh.
  if (!line) {
    if ((_cbCurrentClientId || cbEditingQuoteId) && typeof _cbRenderCabinetSubGate === 'function') {
      _cbRenderCabinetSubGate();
    } else {
      el.innerHTML = '';
    }
    return;
  }

  // Spec cards (2026-07-03 v2): the whole spec is ALWAYS visible — a 2-col
  // grid of always-open section cards styled like the My Rates boxes. Nothing
  // collapses; only the per-scope hardware editors expand on demand.
  const displayedName = line.name || (cbEditingLineIdx >= 0 ? 'Cabinet ' + (cbEditingLineIdx + 1) : 'Cabinet');

  const cur = window.currency;
  const c = calcCBLine(line);
  /** @param {string} field @param {any} val */
  const matSmart = (field, val) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cb-mat-${field}" value="${_escHtml(val||'')}" placeholder="Search material..." autocomplete="off" style="font-size:13px" oninput="_smartCBMaterialSuggest(this,'cb-mat-suggest-${field}','${field}')" onfocus="_smartCBMaterialSuggest(this,'cb-mat-suggest-${field}','${field}')" onblur="setTimeout(()=>{_hideEl('cb-mat-suggest-${field}');cbUpdateField('${field}',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new material">+</div></div><div id="cb-mat-suggest-${field}" class="client-suggest-list" style="display:none"></div></div>`;
  // Per-component finish picker. `field` is the line property name
  // (`finish` | `doorFinish` | `drawerFrontFinish` | `drawerBoxFinish`).
  /** @param {string} field */
  const finishSmart = (field) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cb-mat-${field}" value="${_escHtml(line[field]||'None')}" autocomplete="off" style="font-size:13px" oninput="_smartCBFinishSuggest(this,'cb-mat-suggest-${field}','${field}')" onfocus="_smartCBFinishSuggest(this,'cb-mat-suggest-${field}','${field}')" onblur="setTimeout(()=>{_hideEl('cb-mat-suggest-${field}');cbUpdateField('${field}',this.value)},150)"><div class="smart-input-add" onclick="_openNewCBFinishPopup('${field}')" title="Add new finish">+</div></div><div id="cb-mat-suggest-${field}" class="client-suggest-list" style="display:none"></div></div>`;
  // Per-component hardware. `scope` ∈ {'cabinet','door','drawer'} maps to
  // line.hwItems / line.doorHwItems / line.drawerHwItems.
  // Add-search smart input (shown inline with the Hardware header when the
  // list is empty). matSmart-shaped so smart() compacts it to rates scale.
  /** @param {string} scope */
  const hwAddSearch = (scope) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cb-hw-add-${scope}-${line.id}" placeholder="Search hardware..." autocomplete="off" oninput="_smartCBHwAddSuggest(this,'cb-hw-add-suggest-${scope}-${line.id}',${line.id},'${scope}')" onfocus="_smartCBHwAddSuggest(this,'cb-hw-add-suggest-${scope}-${line.id}',${line.id},'${scope}')" onblur="setTimeout(()=>_hideEl('cb-hw-add-suggest-${scope}-${line.id}'),150)"><div class="smart-input-add" onclick="_openNewCBHardwarePopup(${line.id},-1,'${scope}')" title="Add new hardware type">+</div></div><div id="cb-hw-add-suggest-${scope}-${line.id}" class="client-suggest-list" style="display:none"></div></div>`;
  // One editable hardware item row: name smart-input + qty + delete.
  /** @param {string} scope @param {any} hw @param {number} hi */
  const hwItemRow = (scope, hw, hi) => `<div class="cb-hw-row">
      <div class="cb-hw-item"><div class="smart-input-wrap"><input type="text" id="cb-hw-${scope}-${line.id}-${hi}" value="${_escHtml(hw.name)}" placeholder="Search hardware..." autocomplete="off" oninput="_smartCBHwSuggest(this,'cb-hw-suggest-${scope}-${line.id}-${hi}',${line.id},${hi},'${scope}')" onfocus="_smartCBHwSuggest(this,'cb-hw-suggest-${scope}-${line.id}-${hi}',${line.id},${hi},'${scope}')" onblur="setTimeout(()=>{_hideEl('cb-hw-suggest-${scope}-${line.id}-${hi}');updateCBHw(${line.id},${hi},'name',this.value,'${scope}')},150)"><div class="smart-input-add" onclick="_openNewCBHardwarePopup(${line.id},${hi},'${scope}')" title="Add new hardware type">+</div></div><div id="cb-hw-suggest-${scope}-${line.id}-${hi}" class="client-suggest-list" style="display:none"></div></div>
      <span class="cb-hw-x">×</span>
      <input type="number" class="cb-hw-qty" value="${hw.qty}" min="1" onchange="updateCBHw(${line.id},${hi},'qty',this.value,'${scope}')">
      <button class="cb-del-btn" onclick="removeCBHw(${line.id},${hi},'${scope}')">×</button>
    </div>`;
  /** @param {string} field @param {any} val @param {number} [min] */
  const stepper = (field, val, min) => `<div class="cl-stepper"><button class="cl-step-btn" onclick="cbStepField('${field}',-1)">−</button><input type="number" class="cl-input cl-qty-input" value="${val}" min="${min||0}" style="font-size:14px;width:42px" onchange="cbUpdateField('${field}',this.value)"><button class="cl-step-btn" onclick="cbStepField('${field}',1)">+</button></div>`;
  // Stepper variant for custom panels — writes into the nested line.extraPanels map.
  /** @param {string} id @param {any} val */
  const epStepper = (id, val) => `<div class="cl-stepper"><button class="cl-step-btn" onclick="cbStepExtraPanel('${id}',-1)">−</button><input type="number" class="cl-input cl-qty-input" value="${val}" min="0" style="font-size:14px;width:42px" onchange="cbUpdateExtraPanel('${id}',this.value)"><button class="cl-step-btn" onclick="cbStepExtraPanel('${id}',1)">+</button></div>`;
  // Total panel count incl. custom — drives the section header summary.
  const shelfTot = (line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0)+_extraPanelCount(line);
  // Per-section cost breakdown (material + labour + section-specific hardware)
  const sec = calcCBSections(line);

  // Row: fixed 62px label + control (rates-tab scale).
  /** @param {string} label @param {string} ctl */
  const rr = (label, ctl) => `<div class="cb-rr"><label>${label}</label>${ctl}</div>`;
  // Smart-input wrapper so matSmart/finishSmart flex correctly inside a row.
  /** @param {string} html */
  const smart = html => `<div class="cb-rr-smart">${html}</div>`;
  // Rates-style native select for cbSettings type arrays.
  /** @param {string} field @param {any[]} types @param {string} title */
  const typeSel = (field, types, title) => `<select title="${title}" onchange="cbUpdateField('${field}',this.value)">${(types || []).map(/** @param {any} t */ t => `<option value="${_escHtml(t.name)}" ${t.name === line[field] ? 'selected' : ''}>${_escHtml(t.name)}</option>`).join('')}</select>`;
  // Always-open section card (My Rates box styling).
  /** @param {string} title @param {string} badgeId @param {string} badgeHtml @param {string} body @param {boolean} [span2] */
  const card = (title, badgeId, badgeHtml, body, span2) => `<div class="cb-rc${span2 ? ' s2' : ''}">
    <div class="cb-rc-hd"><span class="cb-rc-title">${title}</span><span id="${badgeId}">${badgeHtml}</span></div>
    <div class="cb-rc-bd">${body}</div>
  </div>`;
  // Hardware line: "Hardware" header + control on one row. Empty → the
  // add-search dropdown sits inline with the header; once items exist the
  // header carries a "+ add" button (no second search box) and each item
  // renders as its own row below. "+ add" appends a blank row to fill.
  /** @param {string} scope */
  const hwKey = (scope) => scope === 'door' ? 'doorHwItems' : scope === 'drawer' ? 'drawerHwItems' : scope === 'shelf' ? 'shelfHwItems' : scope === 'drawerFront' ? 'drawerFrontHwItems' : 'hwItems';
  /** @param {string} scope */
  const hwLine = (scope) => {
    const list = line[hwKey(scope)] || [];
    const headerCtl = list.length
      ? `<button class="cb-hw-addbtn" onclick="cbAddBlankHw(${line.id},'${scope}')">+ add</button>`
      : smart(hwAddSearch(scope));
    return `<div class="cb-hw-line">${rr('Hardware', headerCtl)}${list.map(/** @param {any} hw @param {number} hi */ (hw, hi) => hwItemRow(scope, hw, hi)).join('')}</div>`;
  };
  // Coverage slider (shared markup with the old editor — cbUpdatePct clamp).
  /** @param {string} field */
  const pctRow = (field) => rr('% of front', `<div class="cb-pct-row"><input type="range" class="cb-pct-slider" min="0" max="100" step="5" value="${line[field]||0}" oninput="this.nextElementSibling.value=this.value" onchange="cbUpdatePct('${field}',this.value)"><input type="number" class="cb-pct-num" min="0" max="100" step="5" value="${line[field]||0}" oninput="this.previousElementSibling.value=this.value" onchange="cbUpdatePct('${field}',this.value)"><span class="cb-pct-suffix">%</span></div>`);

  // Sticky-footer actions — context-dependent (quote row vs library template).
  const isLib = cbEditingLibraryIdx >= 0;
  const footActions = isLib
    ? `<button class="btn btn-outline" onclick="cbAddFromLibrary(${cbEditingLibraryIdx})">Add to Quote</button><button class="btn btn-outline" onclick="cbDuplicateLibraryEntry(${cbEditingLibraryIdx})">Duplicate</button><button class="btn btn-outline" style="color:var(--danger)" onclick="_confirm('Delete this template?',()=>cbRemoveFromLibrary(${cbEditingLibraryIdx}))">Delete</button>`
    : `<button class="btn btn-outline" onclick="_duplicateCabinet(${cbEditingLineIdx})" title="Duplicate cabinet">Duplicate</button><button class="btn btn-outline" style="color:var(--danger)" onclick="_cbConfirmDeleteLine(${cbEditingLineIdx})" title="Delete cabinet">Delete</button>`;

  el.innerHTML = `
    <div class="cb-ed-head">
      <input type="text" id="cb-name" class="cb-ed-name" value="${_escHtml(line.name||'')}" placeholder="${_escHtml(displayedName)}" autocomplete="off" oninput="cbUpdateField('name',this.value)">
      <span class="cb-ed-qty">Qty <input type="number" min="1" value="${line.qty||1}" onchange="cbUpdateField('qty',this.value);if(cbScratchpad)this.value=cbScratchpad.qty"></span>
      <span class="cb-ed-total" id="cb-live-total">${_cbEdTotalHTML(line, c)}</span>
    </div>
    <div class="cb-rc-grid">
      ${card('Cabinet', 'cb-live-cabinet', _cbSecBadge(sec.cabinet + sec.cabinetHardware),
        rr(`Dims (${unitLabel()})`, `<div class="cb-rc-dims"><input type="text" inputmode="decimal" value="${dimDisplayFromMM(line.w)}" title="Width" onchange="cbUpdateField('w',this.value)"><input type="text" inputmode="decimal" value="${dimDisplayFromMM(line.h)}" title="Height" onchange="cbUpdateField('h',this.value)"><input type="text" inputmode="decimal" value="${dimDisplayFromMM(line.d)}" title="Depth" onchange="cbUpdateField('d',this.value)"></div>`)
        + rr('Carcass', smart(matSmart('material', line.material)))
        + rr('Back panel', smart(matSmart('backMat', line.backMat)))
        + `<div class="cb-rr-2col">${rr('Type', typeSel('carcassType', cbSettings.carcassTypes, 'Carcass type'))}${rr('Base', typeSel('baseType', cbSettings.baseTypes, 'Base'))}</div>`
        + rr('Finish', smart(finishSmart('finish')))
        + hwLine('cabinet'), true)}
      ${card('Shelves &amp; Partitions', 'cb-live-shelves', (shelfTot > 0 || sec.shelfHardware > 0) ? _cbSecBadge(sec.shelves + sec.shelfHardware) : '',
        rr('Fixed shelf', stepper('shelves', line.shelves, 0))
        + rr('Adj. holes', stepper('adjShelves', line.adjShelves, 0))
        + rr('Loose shelf', stepper('looseShelves', line.looseShelves||0, 0))
        + rr('Partition', stepper('partitions', line.partitions||0, 0))
        + rr('End panel', stepper('endPanels', line.endPanels||0, 0))
        + (cbSettings.extraPanelTypes||[]).map(/** @param {any} t */ t => rr(_escHtml(t.name||'Panel'), epStepper(t.id, (line.extraPanels&&line.extraPanels[t.id])||0))).join('')
        + hwLine('shelf'))}
      ${card('Doors', 'cb-live-doors', line.doors > 0 ? _cbSecBadge(sec.doors + sec.doorHardware) : '',
        rr('Count', stepper('doors', line.doors, 0))
        + rr('Material', smart(matSmart('doorMat', line.doorMat)))
        + rr('Type', typeSel('doorType', cbSettings.doorTypes, 'Door type'))
        + rr('Finish', smart(finishSmart('doorFinish')))
        + pctRow('doorPct')
        + hwLine('door'))}
      ${card('Drawer Fronts', 'cb-live-dfronts', (line.drawers > 0 || sec.drawerFrontHardware > 0) ? _cbSecBadge(sec.drawerFronts + sec.drawerFrontHardware) : '',
        rr('Count', stepper('drawers', line.drawers, 0))
        + rr('Material', smart(matSmart('drawerFrontMat', line.drawerFrontMat)))
        + rr('Type', typeSel('drawerFrontType', cbSettings.drawerFrontTypes, 'Front type'))
        + rr('Finish', smart(finishSmart('drawerFrontFinish')))
        + pctRow('drawerPct')
        + hwLine('drawerFront'))}
      ${card('Drawer Boxes', 'cb-live-dboxes', line.drawers > 0 ? _cbSecBadge(sec.drawerBoxes + sec.drawerHardware) : '',
        rr('Inner mat', smart(matSmart('drawerInnerMat', line.drawerInnerMat)))
        + rr('Type', typeSel('drawerBoxType', cbSettings.drawerBoxTypes, 'Box type'))
        + rr('Finish', smart(finishSmart('drawerBoxFinish')))
        + hwLine('drawer'))}
      ${card('Extras', 'cb-live-extras', sec.extras > 0 ? _cbSecBadge(sec.extras) : '',
        (line.extras||[]).map(/** @param {any} ex @param {number} ei */ (ex, ei) => `<div class="cb-rr cb-rr-extra">
          <input type="text" value="${_escHtml(ex.label||'')}" placeholder="Item name" onblur="cbUpdateExtra(${line.id},${ei},'label',this.value)">
          <span class="cb-rr-affix" title="Cost per item">${cur}</span>
          <input type="number" style="flex:0 0 56px" title="Cost per item (${cur})" value="${ex.cost||0}" onblur="cbUpdateExtra(${line.id},${ei},'cost',this.value)">
          <span class="cb-rr-affix" title="Quantity">×</span>
          <div class="cl-stepper" style="flex:0 0 auto" title="Quantity"><button class="cl-step-btn" onclick="cbStepExtra(${line.id},${ei},-1)">−</button><input type="number" class="cl-input cl-qty-input" min="1" value="${ex.qty==null?1:ex.qty}" onchange="cbUpdateExtra(${line.id},${ei},'qty',this.value)"><button class="cl-step-btn" onclick="cbStepExtra(${line.id},${ei},1)">+</button></div>
          <button class="cb-del-btn" style="font-size:14px;width:22px;height:22px" onclick="cbRemoveExtra(${line.id},${ei})">×</button>
        </div>`).join('')
        + `<div class="cb-rr"><span class="cb-hw-chip add" onclick="cbAddExtra(${line.id})">+ add item</span></div>`)}
      ${card('Notes', 'cb-live-notes-badge', '',
        rr('Room', `<input type="text" value="${_escHtml(line.room||'')}" placeholder="e.g. Kitchen" list="cb-room-list" onchange="cbUpdateField('room',this.value)">`)
        + rr('Notes', `<textarea onblur="cbUpdateField('notes',this.value)">${_escHtml(line.notes||'')}</textarea>`))}
    </div>
    <div class="cb-ed-foot">
      ${footActions}
      <span class="cb-ed-foot-total" id="cb-live-total-ft">${_cbEdTotalHTML(line, c)}</span>
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
  const sec = calcCBSections(line);

  /** @param {string} id @param {string} html */
  const set = (id, html) => { const el = _byId(id); if (el) el.innerHTML = html; };

  // Card badges include their section's hardware bucket so the six cards +
  // extras visibly sum to the unit total.
  set('cb-live-cabinet', _cbSecBadge(sec.cabinet + sec.cabinetHardware));
  set('cb-live-doors', line.doors > 0 ? _cbSecBadge(sec.doors + sec.doorHardware) : '');
  set('cb-live-dfronts', (line.drawers > 0 || sec.drawerFrontHardware > 0) ? _cbSecBadge(sec.drawerFronts + sec.drawerFrontHardware) : '');
  set('cb-live-dboxes', line.drawers > 0 ? _cbSecBadge(sec.drawerBoxes + sec.drawerHardware) : '');
  const interiorTot = (line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0)+_extraPanelCount(line);
  set('cb-live-shelves', (interiorTot > 0 || sec.shelfHardware > 0) ? _cbSecBadge(sec.shelves + sec.shelfHardware) : '');
  set('cb-live-extras', sec.extras > 0 ? _cbSecBadge(sec.extras) : '');
  const c = calcCBLine(line);
  set('cb-live-total', _cbEdTotalHTML(line, c));
  set('cb-live-total-ft', _cbEdTotalHTML(line, c));
}

/** Write (or hide, when html === '') the pinned results footer bar. Lives
 *  outside #cb-results, so every render path must set it explicitly or a
 *  stale total survives into the empty states.
 *  @param {string} html */
function _setCBFooter(html) {
  const el = _byId('cb-results-footer');
  if (!el) return;
  el.innerHTML = html;
  el.style.display = (html && cbMainView === 'results') ? 'flex' : 'none';
}

// ── Render right panel: cost breakdown ──
function renderCBResults() {
  const el = _byId('cb-results');
  if (!el) return;
  const cur = window.currency;
  /** @param {any} v */
  const fmt = v => cur + Number(v).toFixed(2);
  /** @param {number} v */
  const fmt0 = v => cur + (Number.isFinite(v) ? Math.round(v) : 0).toLocaleString();
  const projName = (typeof _cbCurrentClientName !== 'undefined' && _cbCurrentClientName) ? _cbCurrentClientName : (_byId('cb-client')?.value || '');
  // When a quote is open, prefix the header with its number (e.g. "QUO-0007 · …").
  const _hdrQuote = cbEditingQuoteId ? quotes.find(x => x.id === cbEditingQuoteId) : null;
  const _hdrQNum = _hdrQuote ? (_hdrQuote.quote_number || ('QUO-' + String(_hdrQuote.id).padStart(4, '0'))) : '';
  const cbHeaderTitle = _hdrQNum ? (_hdrQNum + ' · ' + projName) : projName;

  // Editing-order banner — built once, shown in BOTH the empty and populated
  // states (it used to render only when cabinets existed, so an order with no
  // cabinets yet had no way back and no Discard). Label leads with the order
  // number so the user always knows which order they're inside.
  let orderBanner = '';
  if (cbEditingOrderId) {
    const eo = orders.find(x => x.id === cbEditingOrderId);
    const eoNum = eo ? (eo.order_number || ('ORD-' + String(eo.id).padStart(4, '0'))) : '';
    const eoProj = eo ? (((typeof orderProject === 'function' ? orderProject(eo) : '') || (typeof orderClient === 'function' ? orderClient(eo) : '')) || '') : '';
    const eoLabel = [eoNum, eoProj].filter(Boolean).join(' · ') || 'Order';
    orderBanner = `<div style="background:var(--accent-dim);border:2px solid var(--accent);border-radius:8px;padding:10px 16px;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font-size:13px;font-weight:600;color:var(--accent)">Editing order: ${_escHtml(eoLabel)}</span>
      <span style="flex:1"></span>
      <button class="btn btn-outline" onclick="discardOrderEdits()" style="font-size:12px;padding:6px 14px;width:auto;color:var(--danger)" title="Restore the cabinets to how they were when you opened the Builder">Discard changes</button>
      <button class="btn btn-primary" onclick="finishEditingOrder()" style="font-size:12px;padding:6px 14px;width:auto" title="Cabinets autosave — this returns you to the order editor">&larr; Back to order</button>
    </div>`;
  }

  if (!cbLines.length) {
    let emptyHeader = '';
    if (projName) {
      emptyHeader = _renderContentHeader({ iconSvg: _CH_ICON_PROJECT, title: cbHeaderTitle, addOnclick: 'window._mvShowEditor()', backOnclick: cbEditingQuoteId ? '_exitClient_cabinet()' : undefined, addIcon: _CH_ICON_CABINET.replace('class="ch-icon"', '') });
    } else {
      emptyHeader = _renderContentHeader({ iconSvg: _CH_ICON_QUOTE, title: 'Quotes', addOnclick: 'window._mvShowEditor()' });
    }
    // If a quote is already opened (drilled in), don't show the all-quotes
    // picker — just show an empty state for THIS quote.
    if (cbEditingQuoteId || cbEditingOrderId) {
      _setCBFooter('');
      el.innerHTML = `${emptyHeader}<div style="max-width:700px">${orderBanner}</div><div class="empty-state" style="max-width:700px">
        <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>
        <h3>No cabinets yet</h3>
        <p>Add a cabinet from the sidebar to start building this ${cbEditingOrderId ? 'order' : 'quote'}.</p>      </div>`;
      return;
    }
    // Show all quotes as clickable cards (same card layout as the Quote tab).
    // Clicking a card loads that quote into the cabinet builder.
    const allQuotes = (typeof quotes !== 'undefined' && Array.isArray(quotes) ? quotes : [])
      .slice()
      .sort(/** @param {any} a @param {any} b */ (a, b) => (+new Date(b.updated_at || 0)) - (+new Date(a.updated_at || 0)));
    if (!allQuotes.length) {
      _setCBFooter('');
      el.innerHTML = `${emptyHeader}<div class="empty-state">
        <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div>
        <h3>No quotes yet</h3>
        <p>Pick a quote from the sidebar or create a new one to start building cabinets.</p>      </div>`;
      return;
    }
    const cardsHtml = allQuotes.map(/** @param {any} q */ q => {
      const num = q.quote_number || ('QUO-' + String(q.id).padStart(4, '0'));
      const proj = (typeof quoteProject === 'function' ? quoteProject(q) : '') || '';
      const cli = (typeof quoteClient === 'function' ? quoteClient(q) : '') || '';
      const title = [num, proj, cli].filter(Boolean).join(' · ');
      const status = q.status || 'draft';
      const _qm = typeof _quoteStatusMeta === 'function' ? _quoteStatusMeta(status) : { badge: 'badge-gray', label: 'Draft' };
      const statusBadge = _qm.badge;
      const statusText = _qm.label;
      const total = typeof quoteTotal === 'function' ? quoteTotal(q) : 0;
      const counts = typeof _lineKindCountsLabel === 'function' ? _lineKindCountsLabel(q._lines) : '';
      const dateBits = [q.date, counts].filter(Boolean).join(' · ');
      return `<div class="quote-card" style="cursor:pointer;max-width:700px;margin-bottom:8px" onclick="_cbPickQuote(${q.id})">
        <div class="qc-header">
          <div class="oc-info">
            <div class="oc-title-row">
              <div class="qc-title">${_escHtml(title)}</div>
              <span class="badge ${statusBadge}" style="font-size:10px" onclick="event.stopPropagation()">${statusText}</span>
            </div>
            ${dateBits ? `<div class="qc-meta">${_escHtml(dateBits)}</div>` : ''}
          </div>
          <div class="oc-right">
            <div class="oc-value" style="cursor:default;border-bottom:none">${fmt0(total)}</div>
          </div>
        </div>
        <div class="qc-footer">
          <button class="btn btn-outline" onclick="event.stopPropagation();switchSection('quote');loadQuoteIntoSidebar(${q.id})" title="Open in Quote tab">Go to Quote &rarr;</button>
          <span style="flex:1"></span>
          <button class="btn btn-outline" onclick="event.stopPropagation();duplicateQuote(${q.id})">Duplicate</button>
          <button class="btn btn-outline" style="color:var(--danger)" onclick="event.stopPropagation();_confirm('Delete quote for <strong>${_escHtml(cli || num)}</strong>?',()=>removeQuote(${q.id}))">Delete</button>
        </div>
      </div>`;
    }).join('');
    _setCBFooter('');
    el.innerHTML = `${emptyHeader}<div style="max-width:700px">${cardsHtml}</div>`;
    return;
  }

  // Totals. When a real quote/order is open, use ITS stored markup / tax /
  // discount so the figure here matches the Quotes tab, the editor, and the
  // customer's live page — cbSettings rates are only the default for a
  // standalone (not-yet-attached) builder session.
  const _editEnt = cbEditingQuoteId ? quotes.find(x => x.id === cbEditingQuoteId)
    : (cbEditingOrderId ? orders.find(x => x.id === cbEditingOrderId) : null);
  const effMarkup = _editEnt ? (parseFloat(/** @type {any} */ (_editEnt).markup) || 0) : cbSettings.markup;
  const effTax    = _editEnt ? (parseFloat(/** @type {any} */ (_editEnt).tax) || 0) : cbSettings.tax;
  const effDisc   = _editEnt ? (parseFloat(/** @type {any} */ (_editEnt).discount) || 0) : 0;
  let gMat=0,gLabour=0,gHw=0,gSub=0;
  const calcs = cbLines.map(l => { const c=calcCBLine(l); gMat+=c.matCost*l.qty; gLabour+=c.labourCost*l.qty; gHw+=c.hwCost*l.qty; gSub+=c.lineSubtotal; return c; });
  const totalHrs = cbLines.reduce((s,l,i)=>s+calcs[i].labourHrs*l.qty,0);
  const gMarkup = gSub * effMarkup/100;
  const gPreDisc = (gSub+gMarkup)*(1+effTax/100);
  const gDiscAmt = gPreDisc * effDisc/100;
  const gTotal = gPreDisc - gDiscAmt;

  let html = `<div style="max-width:700px">`;

  html += orderBanner;

  // Project header
  if (projName) {
    html += _renderContentHeader({ iconSvg: _CH_ICON_QUOTE, title: cbHeaderTitle, addOnclick: 'window._mvShowEditor()', backOnclick: cbEditingQuoteId ? '_exitClient_cabinet()' : undefined, addIcon: _CH_ICON_CABINET.replace('class="ch-icon"', '') });
  }
  // Expanded spec read-out for the selected cabinet — a full-width row
  // directly under the .editing row. Spans all 6 columns; card-mode CSS
  // reflows the key/value grid to a single column.
  /** @param {any} line */
  const expandRowHtml = (line) => {
    /** @param {string} label @param {any} val */
    const kv = (label, val) => (val === 0 || val) && String(val).trim() ? `<div class="cb-x-kv"><dt>${label}</dt><dd>${_escHtml(String(val))}</dd></div>` : '';
    /** @param {string} f */
    const fin = (f) => f && f !== 'None' ? f : '';
    // Interior parts summary (only non-zero counts).
    const parts = [[line.shelves, 'fixed shelf', 'fixed shelves'], [line.adjShelves, 'adj. shelf', 'adj. shelves'], [line.looseShelves, 'loose shelf', 'loose shelves'], [line.partitions, 'partition', 'partitions'], [line.endPanels, 'end panel', 'end panels']]
      .filter(([n]) => n > 0).map(([n, s, p]) => `${n} ${n === 1 ? s : p}`).join(', ');
    // Hardware across every scope → "Name ×N".
    const hwAll = [...(line.hwItems||[]), ...(line.doorHwItems||[]), ...(line.drawerHwItems||[]), ...(line.shelfHwItems||[]), ...(line.drawerFrontHwItems||[])]
      .filter(h => h && h.name).map(h => `${h.name} ×${h.qty||1}`).join(', ');
    const carcass = [line.material, fin(line.finish)].filter(Boolean).join(' · ');
    const doorsVal = line.doors > 0 ? [`${line.doors} × ${line.doorType||'—'}`, line.doorMat, fin(line.doorFinish)].filter(Boolean).join(' · ') : '';
    const drawerFrontsVal = line.drawers > 0 ? [`${line.drawers} × ${line.drawerFrontType||'—'}`, line.drawerFrontMat, fin(line.drawerFrontFinish)].filter(Boolean).join(' · ') : '';
    const drawerBoxesVal = line.drawers > 0 ? [line.drawerInnerMat, line.drawerBoxType, fin(line.drawerBoxFinish)].filter(Boolean).join(' · ') : '';
    const construction = [line.carcassType, line.baseType ? line.baseType + ' base' : ''].filter(Boolean).join(' · ');
    const spec = kv('Dimensions', dimsLabelFromMM(line.w, line.h, line.d))
      + kv('Carcass', carcass)
      + kv('Back panel', line.backMat)
      + kv('Construction', construction)
      + kv('Doors', doorsVal)
      + kv('Drawer fronts', drawerFrontsVal)
      + kv('Drawer boxes', drawerBoxesVal)
      + kv('Interior', parts)
      + kv('Hardware', hwAll)
      + kv('Room', line.room)
      + kv('Notes', line.notes);
    return `<tr class="cb-li-xrow"><td colspan="5"><div class="cb-li-expand"><dl class="cb-x-list">${spec}</dl></div></td></tr>`;
  };
  // Line-item table (quote-editor style). Row click selects the cabinet into
  // the editor; qty/actions cells stop propagation. Row Total = pre-markup
  // line subtotal (rows sum to the Subtotal below); markup/tax/discount only
  // appear in the totals block.
  /** @param {any} line @param {number} idx */
  const rowHtml = (line, idx) => {
    const c = calcs[idx];
    const isActive = idx === cbEditingLineIdx;
    const unitCost = c.matCost + c.labourCost + c.hwCost;
    return `<tr class="cb-li-row${isActive ? ' editing' : ''}" onclick="cbEditCabinetFromOutput(${idx})">
      <td class="cb-col-name"><span class="cb-li-name">${_escHtml(line.name||'Cabinet '+(idx+1))}</span><span class="cb-li-sub cb-li-sub-desktop">${dimsLabelFromMM(line.w, line.h, line.d)}</span><span class="cb-li-sub cb-li-sub-mobile">${dimsLabelFromMM(line.w, line.h, line.d)}${line.material ? ' · ' + _escHtml(line.material) : ''}</span></td>
      <td class="cb-col-qty" onclick="event.stopPropagation()"><div class="cl-stepper">
        <button class="cl-step-btn" style="padding:0 6px" onclick="cbStepLineQty(${idx},-1)" title="Decrease quantity">−</button>
        <input type="number" class="cl-input cl-qty-input" value="${line.qty}" min="1" style="font-size:11px;width:32px;padding:4px 2px" onchange="cbSetLineQty(${idx},this.value)">
        <button class="cl-step-btn" style="padding:0 6px" onclick="cbStepLineQty(${idx},1)" title="Increase quantity">+</button>
      </div></td>
      <td class="cb-col-each">${fmt0(unitCost)}</td>
      <td class="cb-col-total"><strong>${fmt0(c.lineSubtotal)}</strong></td>
      <td class="cb-col-act" onclick="event.stopPropagation()"><div class="cb-li-actions">
        <button class="cb-act-btn cb-lib-btn" onclick="cbAddLineToLibrary(${idx})" title="Save this cabinet as a library template">Add to Library</button>
        ${_cbCutListProjActHtml(`_cbOpenCabinetCutListsForLine(${idx})`, `_cbNewCutListForLine(${idx})`, line.db_id||'')}
        <button class="cb-act-btn cb-dup-btn" onclick="_duplicateCabinet(${idx})" title="Duplicate cabinet">⧉</button>
        <button class="cb-act-btn cb-del-btn" onclick="_cbConfirmDeleteLine(${idx})" title="Delete cabinet">×</button>
      </div></td>
    </tr>${isActive ? expandRowHtml(line) : ''}`;
  };
  html += `<div class="cb-li-wrap"><table class="cb-li-table">
    <thead><tr><th>Cabinet</th><th class="cb-col-qty">Qty</th><th class="cb-col-each">Each</th><th class="cb-col-total" style="text-align:right">Total</th><th class="cb-col-act"></th></tr></thead>
    <tbody>${cbLines.map(rowHtml).join('')}</tbody>
  </table></div>`;
  html += `<button class="cb-li-add" onclick="addCBLine();if(window._mvShowEditor)window._mvShowEditor()">+ Add cabinet</button>`;

  // Totals block — same math + conditional rows as the old All-Cabinets card
  // (markup/tax/discount parity with the Quotes tab and the customer page).
  html += `<div class="pf-totals" style="max-width:300px;margin:12px 0 0 auto">
    <div class="pf-total-row"><span class="t-label">Materials</span><span class="t-val">${fmt0(gMat)}</span></div>
    <div class="pf-total-row"><span class="t-label">Labour (${totalHrs.toFixed(1)} hrs)</span><span class="t-val">${fmt0(gLabour)}</span></div>
    ${(cbSettings.contingencyPct||0) > 0 ? `<div class="pf-total-row"><span class="t-label" style="color:var(--muted)">Labour Time Contingency (${cbSettings.contingencyPct}%)</span><span class="t-val" style="color:var(--muted);font-weight:400;font-style:italic">incl. +${fmt0(gLabour * cbSettings.contingencyPct / (100 + cbSettings.contingencyPct))}</span></div>` : ''}
    <div class="pf-total-row"><span class="t-label">Hardware</span><span class="t-val">${fmt0(gHw)}</span></div>
    <div class="pf-total-row" style="border-top:1px solid var(--border2);padding-top:4px;margin-top:2px"><span class="t-label" style="font-weight:700;color:var(--text)">Subtotal</span><span class="t-val" style="font-weight:700">${fmt0(gSub)}</span></div>
    ${effMarkup>0?`<div class="pf-total-row"><span class="t-label" style="color:var(--muted)">Markup (${effMarkup}%)</span><span class="t-val" style="color:var(--muted);font-weight:400">+${fmt0(gMarkup)}</span></div>`:''}
    ${effTax>0?`<div class="pf-total-row"><span class="t-label" style="color:var(--muted)">Tax (${effTax}%)</span><span class="t-val" style="color:var(--muted);font-weight:400">+${fmt0(gPreDisc-gSub-gMarkup)}</span></div>`:''}
    ${effDisc>0?`<div class="pf-total-row discount"><span class="t-label" style="color:var(--muted)">Discount (${effDisc}%)</span><span class="t-val">−${fmt0(gDiscAmt)}</span></div>`:''}
    <div class="pf-total-row t-main"><span class="t-label">${_editEnt && cbEditingOrderId ? 'Order Total' : 'Quote Total'}${_editEnt ? '' : ' (est.)'}</span><span class="t-val" style="font-size:14px;font-weight:800;color:var(--accent)">${fmt0(gTotal)}</span></div>
    ${_editEnt ? '' : `<div style="font-size:10px;color:var(--muted);text-align:right">Using your default markup/tax — attaches to the quote's own rates when sent.</div>`}
  </div>`;

  html += `</div>`;
  el.innerHTML = html;

  // Pinned footer: counts · total · context action (relocates the old top
  // buttons bar; order context folds "Back to order" in as the primary —
  // the banner keeps Discard).
  const units = cbLines.reduce((s, l) => s + l.qty, 0);
  let footBtns = '';
  if (cbEditingOrderId) {
    footBtns = `<button class="btn btn-primary" onclick="finishEditingOrder()" style="font-size:12px;padding:8px 14px;width:auto" title="Cabinets autosave — this returns you to the order editor">&larr; Back to order</button>`;
  } else if (cbEditingQuoteId) {
    footBtns = `<button class="btn btn-primary" onclick="cbGoToQuote()" style="font-size:12px;padding:8px 14px;width:auto">Go to Quote &rarr;</button>`;
  } else {
    footBtns = `<button class="btn btn-outline" onclick="cbGoToQuote()" style="font-size:12px;padding:8px 14px;width:auto">Go to Quote &rarr;</button>
      <button class="btn btn-outline" onclick="cbSendToOrder()" style="font-size:12px;padding:8px 14px;width:auto">Send to Order &rarr;</button>
      <button class="btn btn-primary" onclick="cbSendToQuote()" style="font-size:12px;padding:8px 14px;width:auto">Send to Quote &rarr;</button>`;
  }
  _setCBFooter(`<span class="cb-foot-meta">${cbLines.length} cabinet${cbLines.length!==1?'s':''} · ${units} unit${units!==1?'s':''}</span>
    <span style="flex:1"></span>
    <span class="cb-foot-total-label">${cbEditingOrderId ? 'Order' : 'Quote'} Total${_editEnt ? '' : ' (est.)'}</span>
    <span class="cb-foot-total">${fmt0(gTotal)}</span>
    ${footBtns}`);

  if (typeof _cbApplyCutListCounts === 'function') _cbApplyCutListCounts();
}

// ── Library View (main content area) ──
function renderCBLibraryView() {
  const el = _byId('cb-library-view');
  if (!el) return;
  const cur = window.currency;
  /** @param {number} v */
  const fmt0 = v => cur + (Number.isFinite(v) ? Math.round(v) : 0).toLocaleString();

  if (!cbLibrary.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg></div>
      <h3>Cabinet Library</h3>
      <p>No saved templates yet. Use the sidebar to add a template, or import a CSV.</p>
      <button class="btn btn-primary mv-only" onclick="cbStartNewLibraryEntry()" style="font-size:12px;padding:8px 14px;width:auto;margin-top:8px">+ Add Template</button>
      <button class="btn btn-outline" onclick="cbImportLibrary()" style="font-size:12px;padding:8px 14px;width:auto;margin-top:8px">&uarr; Import CSV</button>
    </div>`;
    return;
  }

  let html = `<div style="max-width:1100px">`;
  html += _renderContentHeader({ iconSvg: _CH_ICON_CABINET, title: 'Cabinet Library', addOnclick: 'cbStartNewLibraryEntry()' });

  // Filter input + Import/Export buttons (CLAUDE.md convention: I/E lives in
  // the main content area filter bar, not in sidebars). This is the reference
  // filter-bar layout — .lib-filter-* classes are shared by every list tab.
  html += `<div class="lib-filter-row">
    <input type="text" id="cb-lib-filter" class="lib-filter-input" placeholder="Filter templates..." oninput="filterCBLibraryView(this.value)">
    <button class="btn btn-outline lib-filter-btn" onclick="cbExportLibrary()">&darr; Export</button>
    <button class="btn btn-outline lib-filter-btn" onclick="cbImportLibrary()">&uarr; Import</button>
  </div>`;

  html += `<div id="cb-lib-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;align-items:stretch">`;
  html += _renderLibraryCards(cbLibrary);
  html += `</div></div>`;
  el.innerHTML = html;
  if (typeof _cbApplyCutListCounts === 'function') _cbApplyCutListCounts();
}

/** @param {any[]} items */
function _renderLibraryCards(items) {
  const cur = window.currency;
  /** @param {number} v */
  const fmt0 = v => cur + (Number.isFinite(v) ? Math.round(v) : 0).toLocaleString();
  let html = '';
  items.forEach((c, i) => {
    const idx = cbLibrary.indexOf(c);
    const calc = calcCBLine(c);
    const details = [];
    if (c.doors > 0) details.push(c.doors + ' door' + (c.doors!==1?'s':''));
    if (c.drawers > 0) details.push(c.drawers + ' drawer' + (c.drawers!==1?'s':''));
    const shelfTotal = (c.shelves||0) + (c.adjShelves||0) + (c.looseShelves||0);
    if (shelfTotal > 0) details.push(shelfTotal + ' shelves');
    if (c.partitions > 0) details.push(c.partitions + ' partition' + (c.partitions!==1?'s':''));
    if (c.endPanels > 0) details.push(c.endPanels + ' end panel' + (c.endPanels!==1?'s':''));
    const _epN = _extraPanelCount(c);
    if (_epN > 0) details.push(_epN + ' panel' + (_epN!==1?'s':''));

    const isEditingThis = cbEditingLibraryIdx === idx;
    const borderColor = isEditingThis ? 'var(--accent)' : 'var(--border)';
    // Caption segments: each stays on one line (white-space:nowrap) so a whole
    // segment pushes to the next line at the " ·" separators rather than being
    // split mid-segment (e.g. dimensions never break across lines).
    const _capSegs = [dimsLabelFromMM(c.w, c.h, c.d)];
    if (c.material) _capSegs.push(_escHtml(c.material));
    if (details.length) _capSegs.push(details.join(', '));
    const _capHtml = _capSegs.map((s, si) => `<span style="white-space:nowrap">${s}${si < _capSegs.length - 1 ? ' ·' : ''}</span>`).join(' ');
    html += `<div style="background:var(--surface);border:1px solid ${borderColor};border-radius:var(--radius);box-shadow:var(--shadow);transition:box-shadow .15s,border-color .15s;cursor:pointer;display:flex;flex-direction:column;height:100%"
      onmouseover="this.style.boxShadow='var(--shadow-md)';this.style.borderColor='var(--accent)'"
      onmouseout="this.style.boxShadow='var(--shadow)';this.style.borderColor='${borderColor}'"
      onclick="cbEditLibraryEntry(${idx})">
      <div style="flex:1;display:flex;align-items:flex-start;gap:8px;padding:10px 12px 6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(c._libName||c.name||'Cabinet')}${isEditingThis?' <span style="font-size:10px;font-weight:600;color:var(--accent);margin-left:4px">· editing</span>':''}</div>
          <div style="font-size:11px;color:var(--muted);line-height:1.4">${_capHtml}</div>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--accent);flex-shrink:0;white-space:nowrap">${fmt0(calc.lineSubtotal)}</div>
      </div>
      <div style="display:flex;gap:6px;padding:8px 12px 10px;border-top:1px solid var(--border2);flex-wrap:wrap;align-items:stretch">
        <button class="btn btn-outline" onclick="event.stopPropagation();cbAddFromLibrary(${idx})" style="font-size:11px;padding:5px 10px;width:auto">Add to Quote</button>
        ${_cbCutListProjActHtml(`_cbOpenLinkedCutLists(${idx})`, `_cbLinkToCutList(${idx})`, c.db_id||'')}
        <span style="flex:1"></span>
        <button class="btn btn-outline" onclick="event.stopPropagation();cbDuplicateLibraryEntry(${idx})" style="font-size:11px;padding:5px 10px;width:auto">Duplicate</button>
        <button class="btn btn-outline" onclick="event.stopPropagation();_confirm('Delete this template?',()=>cbRemoveFromLibrary(${idx}))" style="font-size:11px;padding:5px 10px;width:auto;color:var(--danger)">Delete</button>
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
  if (typeof _cbApplyCutListCounts === 'function') _cbApplyCutListCounts();
}
