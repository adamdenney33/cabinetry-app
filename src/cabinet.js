// ProCabinet — Cabinet Builder / line-based cabinet quoting (carved out of
// src/app.js in phase E carve 15 — the largest carve of phase E).
//
// Loaded as a classic <script defer> BEFORE src/app.js, AFTER src/stock.js.
// State-bearing (5 top-level `let` bindings — cqSettings, cqLibrary,
// cqLines, cqSavedQuotes, _clProjectCache). The trailing init block at
// the bottom of the section runs at script-load time and calls
// loadStockLibraries() defined in src/stock.js — hence stock.js must
// load first.
//
// Cross-file dependencies (runtime, resolved through the global lexical
// environment):
//   - state used by quotes.js: cqLines / cqSettings / cqLibrary referenced
//     in _quoteLineRowToCQ, calcCQLine and friends
//   - _clProjectCache referenced by src/projects.js
//   - _db / _dbInsertSafe (src/db.js / src/clients.js), _userId (src/db.js
//     auth state), _toast / _confirm / _openPopup / _closePopup /
//     _popupVal / _escHtml (src/app.js / src/ui.js), renderQuoteMain
//     (src/quotes.js), switchSection / window.currency / window.units
//     (src/settings.js), stockItems (src/stock.js)
//
// Symbol-name note: the `cq*` prefix (cqLines / cqSettings / cqLibrary /
// cqSavedQuotes) is a historical artefact from the cabinet-quote half of
// the originally-planned cabinet-builder vs cabinet-quote split. SPEC.md
// § 13 (2026-04-30 cabinet ghost-removal entry) records why the rename
// was deferred — it would touch ~150 inline-handler call sites, so the
// rename runs as a separate cosmetic pass after Phase F.

// ══════════════════════════════════════════
// CABINET BUILDER — line-based cabinet quoting
// ══════════════════════════════════════════

// ── CQ Settings State ──
let cqSettings = {
  labourRate: 65, markup: 20, tax: 13, deposit: 50, edgingPerM: 3,
  materials: [
    { name: 'Birch Ply 18mm', price: 72 },
    { name: 'Birch Ply 12mm', price: 58 },
    { name: 'Birch Ply 6mm', price: 42 },
    { name: 'Melamine 16mm', price: 45 },
    { name: 'MDF 18mm', price: 38 },
    { name: 'Hardwood Edging', price: 25 },
    { name: 'Plywood 3mm (backs)', price: 22 },
    { name: 'Solid Oak 20mm', price: 110 },
  ],
  hardware: [
    { name: 'Blum Hinges (pair)', price: 12 },
    { name: 'Soft-close Slides (pair)', price: 24 },
    { name: 'Shelf Pins (4)', price: 3 },
    { name: 'Handle - Bar', price: 8 },
    { name: 'Handle - Cup', price: 6 },
    { name: 'Push-to-Open', price: 14 },
    { name: 'Leg Levellers (4)', price: 10 },
    { name: 'Cam & Dowel (10)', price: 5 },
  ],
  finishes: [
    { name: 'None', price: 0 },
    { name: 'Oil (Osmo/Rubio)', price: 12 },
    { name: 'Lacquer', price: 18 },
    { name: 'Paint', price: 22 },
    { name: 'Stain + Oil', price: 15 },
    { name: 'Wax', price: 8 },
    { name: '2-Pack Spray', price: 35 },
  ],
  baseTypes: [
    { name: 'None', price: 0 },
    { name: 'Plinth', price: 20 },
    { name: 'Feet / Legs', price: 40 },
    { name: 'Castors', price: 60 },
    { name: 'Frame', price: 30 },
  ],
  constructions: [
    { name: 'Overlay', price: 0 },
    { name: 'Inset', price: 25 },
    { name: 'Face Frame', price: 35 },
  ],
  labourTimes: {
    carcass: 1.5,
    door: 0.4,
    drawer: 0.6,
    shelf: 0.25,
    finishPerM2: 0.5,
  }
};

// ── Cabinet Library ──
// Backed by the cabinet_templates DB table. Library is loaded on auth
// (_loadCabinetTemplatesFromDB) and stays in-memory; saves go straight to DB.
/** @type {any[]} */
let cqLibrary = [];
async function _saveCabinetToDB(entry) {
  if (!_userId) return null;
  try {
    const { data, error } = await _db('cabinet_templates').insert({
      user_id: _userId,
      name: entry._libName || entry.name || 'Cabinet',
      type: 'base',
      default_w_mm: entry.w || null,
      default_h_mm: entry.h || null,
      default_d_mm: entry.d || null,
      default_specs: entry,
    }).select().single();
    if (error) { console.warn('[cabinet-template save]', error.message); return null; }
    return data?.id || null;
  } catch(e) { console.warn('[cabinet-template save]', e.message || e); return null; }
}
async function _deleteCabinetFromDB(dbId) {
  if (!_userId || !dbId) return;
  try {
    const { error } = await _db('cabinet_templates').delete().eq('id', dbId);
    if (error) console.warn('[cabinet-template delete]', error.message);
  } catch(e) { console.warn('[cabinet-template delete]', e.message || e); }
}
async function _loadCabinetTemplatesFromDB() {
  if (!_userId) return;
  try {
    const { data, error } = await _db('cabinet_templates').select('*').eq('user_id', _userId).order('name');
    if (error) { console.warn('[cabinet-template load]', error.message); return; }
    if (!data) return;
    cqLibrary = data.map(row => ({ .../** @type {Record<string, any>} */ (row.default_specs || {}), _libName: row.name, db_id: row.id }));
  } catch(e) { console.warn('[cabinet-template load]', e.message || e); }
}

// ── CQ Line Items State ──
/** @type {any[]} */
let cqLines = [];
let cqNextId = 1;
/** @type {any[]} */
let cqSavedQuotes = [];
let cqActiveQuoteIdx = -1;

const CQ_TYPES = ['Base Cabinet','Wall Cabinet','Tall Cabinet','Drawer Unit','Shelf Unit','Vanity','Island','Pantry','Custom'];
const SHEET_W = 2.44, SHEET_H = 1.22, SHEET_M2 = SHEET_W * SHEET_H;

// ── Load / Save Settings ──
function loadCQSettings() {
  try { const s = localStorage.getItem('pc_cq_settings'); if (s) cqSettings = JSON.parse(s); } catch(e) {}
  // Ensure defaults exist for all list fields
  if (!cqSettings.baseTypes || !cqSettings.baseTypes.length) cqSettings.baseTypes = [
    {name:'None',price:0},{name:'Plinth',price:20},{name:'Feet / Legs',price:40},{name:'Castors',price:60},{name:'Frame',price:30}
  ];
  if (!cqSettings.constructions || !cqSettings.constructions.length) cqSettings.constructions = [
    {name:'Overlay',price:0},{name:'Inset',price:25},{name:'Face Frame',price:35}
  ];
  if (!cqSettings.finishes || !cqSettings.finishes.length) cqSettings.finishes = [
    {name:'None',price:0},{name:'Oil (Osmo/Rubio)',price:12},{name:'Lacquer',price:18},{name:'Paint',price:22},{name:'Stain + Oil',price:15},{name:'Wax',price:8},{name:'2-Pack Spray',price:35}
  ];
  if (!cqSettings.labourTimes) cqSettings.labourTimes = /** @type {any} */ ({});
  /** @type {any} */
  const _lt = cqSettings.labourTimes;
  if (!_lt.carcass) _lt.carcass = 1.5;
  if (!_lt.door) _lt.door = 0.4;
  if (!_lt.drawer) _lt.drawer = 0.6;
  if (!_lt.fixedShelf) _lt.fixedShelf = 0.3;
  if (!_lt.adjShelfHoles) _lt.adjShelfHoles = 0.4;
  if (!_lt.looseShelf) _lt.looseShelf = 0.2;
  if (!_lt.partition) _lt.partition = 0.5;
  if (!_lt.endPanel) _lt.endPanel = 0.3;
  if (!_lt.finishPerM2) _lt.finishPerM2 = 0.5;
  if (!cqSettings.edgeBanding) cqSettings.edgeBanding = [{name:'Iron-on Veneer',price:3},{name:'PVC 1mm',price:4},{name:'PVC 2mm',price:5},{name:'Solid Timber',price:8}];
  // Persist defaults back so they stick
  localStorage.setItem('pc_cq_settings', JSON.stringify(cqSettings));
}
function saveCQSettings() {
  const g = id => parseFloat(_byId(id)?.value ?? '');
  cqSettings.labourRate = g('cq-labour-rate') || 65;
  cqSettings.markup = g('cq-markup') || 20;
  cqSettings.tax = g('cq-tax') || 13;
  cqSettings.deposit = g('cq-deposit') || 50;
  cqSettings.edgingPerM = g('cq-edging-m') || 0;
  // labourTimes, materials, hardware, finishes, baseTypes, constructions
  // are updated inline via onblur handlers
  localStorage.setItem('pc_cq_settings', JSON.stringify(cqSettings));
}
function loadCQLines() {
  try { const s = localStorage.getItem('pc_cq_lines'); if (s) { cqLines = JSON.parse(s); cqNextId = Math.max(0, ...cqLines.map(l=>l.id)) + 1; } } catch(e) {}
  // Restore project + client names
  setTimeout(() => {
    const pn = _byId('cq-project'); const saved = localStorage.getItem('pc_cq_project_name'); if (pn && saved) pn.value = saved;
    const cn = _byId('cq-client'); const savedC = localStorage.getItem('pc_cq_client_name'); if (cn && savedC) cn.value = savedC;
  }, 100);
}
function saveCQLines() {
  localStorage.setItem('pc_cq_lines', JSON.stringify(cqLines));
  const pn = _byId('cq-project');
  if (pn) localStorage.setItem('pc_cq_project_name', pn.value);
  const cn = _byId('cq-client');
  if (cn) localStorage.setItem('pc_cq_client_name', cn.value);
}
function loadCQSaved() {
  try { const s = localStorage.getItem('pc_cq_saved'); if (s) cqSavedQuotes = JSON.parse(s); } catch(e) {}
}
function saveCQSaved() { localStorage.setItem('pc_cq_saved', JSON.stringify(cqSavedQuotes)); }

function toggleCQSettings() {
  switchCabTab('rates');
}

function switchCabTab(tab) {
  const rates = _byId('cab-view-rates');
  const tabBuilder = _byId('cab-tab-builder');
  const tabRates = _byId('cab-tab-rates');
  // Get all builder content divs (everything in sidebar except the rates div and the tabs)
  const sidebar = _byId('cq-sidebar');
  if (!sidebar) return;
  const builderDivs = /** @type {HTMLElement[]} */ (Array.from(sidebar.children).filter(el => el.id !== 'cab-view-rates'));

  if (tab === 'rates') {
    builderDivs.forEach(el => el.style.display = 'none');
    if (rates) rates.style.display = '';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'transparent'; tabBuilder.style.fontWeight = '500'; tabBuilder.style.color = 'var(--muted)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'var(--accent)'; tabRates.style.fontWeight = '700'; tabRates.style.color = 'var(--text)'; }
    renderCQRates();
  } else {
    builderDivs.forEach(el => el.style.display = '');
    if (rates) rates.style.display = 'none';
    if (tabBuilder) { tabBuilder.style.borderBottomColor = 'var(--accent)'; tabBuilder.style.fontWeight = '700'; tabBuilder.style.color = 'var(--text)'; }
    if (tabRates) { tabRates.style.borderBottomColor = 'transparent'; tabRates.style.fontWeight = '500'; tabRates.style.color = 'var(--muted)'; }
  }
}

// ── Settings Lists Render ──
// ── Render editable list helper ──
function _cqListHTML(arr, path, unitLabel) {
  const cur = window.currency;
  return arr.map((item, i) => `<div class="cq-mat-row">
    <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCQSettings();renderCQPanel()">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${unitLabel||cur}</span>
      <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].price=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
    </div>
    <button onclick="${path}.splice(${i},1);saveCQSettings();renderCQRates();renderCQPanel()" style="font-size:16px">&times;</button>
  </div>`).join('');
}

function renderCQRates() {
  const el = _byId('cq-rates-content');
  if (!el) return;
  const cur = window.currency;
  /** @type {any} */
  const lt = cqSettings.labourTimes || {};
  if (!window._ratesOpen) window._ratesOpen = {};
  const ro = window._ratesOpen;
  const isOpen = k => ro[k] === true;
  const chev = k => `<span style="font-size:10px;color:var(--muted);display:inline-block;transition:transform .2s;${isOpen(k)?'transform:rotate(90deg)':''}">&#9654;</span>`;

  function section(key, title, count, content) {
    return `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none" onclick="window._ratesOpen.${key}=!window._ratesOpen.${key};renderCQRates()">
        ${chev(key)}
        <span style="font-size:13px;font-weight:600;color:var(--text);flex:1">${title}</span>
        <span style="font-size:11px;color:var(--muted)">${count}</span>
      </div>
      ${isOpen(key)?`<div style="padding:0 12px 10px;border-top:1px solid var(--border)">${content}</div>`:''}
    </div>`;
  }

  function listItems(arr, path, unit) {
    return arr.map((item,i) => `<div class="cq-mat-row" style="margin-top:4px">
      <input value="${item.name}" placeholder="Name" onblur="${path}[${i}].name=this.value;saveCQSettings();renderCQPanel()">
      <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
        <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${unit||cur}</span>
        <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${path}[${i}].price=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
      </div>
      <button onclick="${path}.splice(${i},1);saveCQSettings();renderCQRates()" style="font-size:16px;background:none;border:none;color:var(--muted);cursor:pointer">&times;</button>
    </div>`).join('') + `<button class="cl-add-btn" onclick="${path}.push({name:'New',price:0});saveCQSettings();renderCQRates()" style="font-size:11px;padding:4px 8px;margin:6px 0 0">+ Add</button>`;
  }

  // Core Rates as list
  const coreItems = [
    {name:'Labour Rate',price:cqSettings.labourRate,path:'cqSettings.labourRate',unit:'per hour'},
    {name:'Markup',price:cqSettings.markup,path:'cqSettings.markup',unit:'%'},
    {name:'Tax / GST',price:cqSettings.tax,path:'cqSettings.tax',unit:'%'},
  ];
  const coreContent = coreItems.map(item => `<div class="cq-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.price}" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
    </div>
  </div>`).join('');

  // Labour Times as list
  const labourItems = [
    {name:'Carcass (volume)',val:lt.carcass||1.5,path:'cqSettings.labourTimes.carcass',unit:'hrs/m³'},
    {name:'Per Door',val:lt.door||0.4,path:'cqSettings.labourTimes.door',unit:'hrs'},
    {name:'Per Drawer',val:lt.drawer||0.6,path:'cqSettings.labourTimes.drawer',unit:'hrs'},
    {name:'Fixed Shelf',val:lt.fixedShelf||0.3,path:'cqSettings.labourTimes.fixedShelf',unit:'hrs'},
    {name:'Adj. Shelf Holes',val:lt.adjShelfHoles||0.4,path:'cqSettings.labourTimes.adjShelfHoles',unit:'hrs'},
    {name:'Loose Shelf',val:lt.looseShelf||0.2,path:'cqSettings.labourTimes.looseShelf',unit:'hrs'},
    {name:'Partition',val:lt.partition||0.5,path:'cqSettings.labourTimes.partition',unit:'hrs'},
    {name:'End Panel',val:lt.endPanel||0.3,path:'cqSettings.labourTimes.endPanel',unit:'hrs'},
    {name:'Finish',val:lt.finishPerM2||0.5,path:'cqSettings.labourTimes.finishPerM2',unit:'hrs/m²'},
  ];
  const labourContent = labourItems.map(item => `<div class="cq-mat-row" style="margin-top:4px">
    <input value="${item.name}" disabled style="opacity:.7;cursor:default">
    <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:4px;overflow:hidden;background:var(--surface2)">
      <span style="font-size:10px;color:var(--muted);padding:3px 4px 3px 6px;background:var(--surface)">${item.unit}</span>
      <input type="number" value="${item.val}" step="0.05" style="border:none;border-radius:0;padding:3px 6px 3px 2px;width:55px" onblur="${item.path}=parseFloat(this.value)||0;saveCQSettings();renderCQPanel()">
    </div>
  </div>`).join('');

  // Edge Banding
  if (!cqSettings.edgeBanding) cqSettings.edgeBanding = [{name:'Iron-on Veneer',price:3},{name:'PVC 1mm',price:4},{name:'PVC 2mm',price:5},{name:'Solid Timber',price:8}];
  const edgeBandContent = listItems(cqSettings.edgeBanding, 'cqSettings.edgeBanding', cur+'/m');

  el.innerHTML = `
    ${section('core', 'Core Rates', '3 rates', coreContent)}
    ${section('labour', 'Labour Times', '9 rates', labourContent)}
    ${section('materials', 'Stock Materials', '('+stockItems.length+' in stock)', `<div style="position:relative;margin-top:6px"><div class="smart-input-wrap"><input type="text" id="rates-stock-search" placeholder="Search stock materials..." autocomplete="off" style="font-size:12px" oninput="_smartRatesStockSuggest(this,'rates-stock-suggest')" onfocus="_smartRatesStockSuggest(this,'rates-stock-suggest')" onblur="setTimeout(()=>_byId('rates-stock-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new stock material">+</div></div><div id="rates-stock-suggest" class="client-suggest-list" style="display:none"></div></div>`)}
    ${section('hardware', 'Hardware', '('+cqSettings.hardware.length+' items)', listItems(cqSettings.hardware, 'cqSettings.hardware', cur))}
    ${section('finishes', 'Finishes', '('+stockItems.filter(s=>s.category==='Finishing').length+' in stock)', `<div style="position:relative;margin-top:6px"><div class="smart-input-wrap"><input type="text" id="rates-finish-search" placeholder="Search finishing products..." autocomplete="off" style="font-size:12px" oninput="_smartRatesFinishSuggest(this,'rates-finish-suggest')" onfocus="_smartRatesFinishSuggest(this,'rates-finish-suggest')" onblur="setTimeout(()=>_byId('rates-finish-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new finish to stock">+</div></div><div id="rates-finish-suggest" class="client-suggest-list" style="display:none"></div></div>`)}
    ${section('edgebanding', 'Edge Banding', '('+stockItems.filter(s=>s.category==='Edge Banding').length+' in stock)', `<div style="position:relative;margin-top:6px"><div class="smart-input-wrap"><input type="text" id="rates-edge-search" placeholder="Search edge banding..." autocomplete="off" style="font-size:12px" oninput="_smartRatesEdgeSuggest(this,'rates-edge-suggest')" onfocus="_smartRatesEdgeSuggest(this,'rates-edge-suggest')" onblur="setTimeout(()=>_byId('rates-edge-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new edge banding to stock">+</div></div><div id="rates-edge-suggest" class="client-suggest-list" style="display:none"></div></div>`)}
    ${section('basetypes', 'Base Types', '('+(cqSettings.baseTypes||[]).length+' types)', listItems(cqSettings.baseTypes||[], 'cqSettings.baseTypes', cur))}
    ${section('constructions', 'Construction Types', '('+(cqSettings.constructions||[]).length+' types)', listItems(cqSettings.constructions||[], 'cqSettings.constructions', cur+'/m²'))}
  `;
}

function renderCQSettingsLists() { renderCQRates(); }
function addCQMaterial() { cqSettings.materials.push({name:'New Material',price:0}); saveCQSettings(); renderCQRates(); }
function addCQHardware() { cqSettings.hardware.push({name:'New Hardware',price:0}); saveCQSettings(); renderCQRates(); }
function addCQFinish() { if (!cqSettings.finishes) cqSettings.finishes = []; cqSettings.finishes.push({name:'New Finish',price:0}); saveCQSettings(); renderCQRates(); }

// ── Cabinet Library ──
function toggleCabPanel(panel) {
  const projects = _byId('cq-projects-panel');
  const library = _byId('cq-library-panel');
  if (panel === 'projects') {
    if (projects) projects.style.display = projects.style.display === 'none' ? '' : 'none';
    if (library) library.style.display = 'none';
    renderCQProjects();
  } else {
    if (library) library.style.display = library.style.display === 'none' ? '' : 'none';
    if (projects) projects.style.display = 'none';
  }
}
function toggleCabLibrary() { toggleCabPanel('library'); }

// ── Project Library (saves project name + all cabinets) ──
/** @type {any[]} */
let cqProjectLibrary = [];
function loadCQProjectLibrary() { try { cqProjectLibrary = JSON.parse(localStorage.getItem('pc_cq_projects')||'[]'); } catch(e) { cqProjectLibrary=[]; } }
function saveCQProjectLibrary() { localStorage.setItem('pc_cq_projects', JSON.stringify(cqProjectLibrary)); }

function _cqSaveProjectByName(name) {
  if (!name || !name.trim()) { _toast('Enter a project name', 'error'); return; }
  cqSaveProject(name.trim());
}
function _cqSaveCabByName(name) {
  if (!name || !name.trim()) { _toast('Enter a cabinet name', 'error'); return; }
  const line = cqLines[cqActiveLineIdx];
  if (line) line.name = name.trim();
  cqSaveToLibrary();
}
function _saveStockLibByName(name) {
  if (!name || !name.trim()) { _toast('Enter a library name', 'error'); return; }
  saveStockLibrary(name.trim());
}
function cqSaveProject(nameOverride) {
  const name = nameOverride || '';
  if (!name) { _toast('Enter a project name first', 'error'); return; }
  const project = {
    id: Date.now(), name,
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    lines: JSON.parse(JSON.stringify(cqLines)),
    projectName: name
  };
  // Phase 1.5: also persist to the unified projects table so Cut List + Cabinet Quote
  // share one canonical row per (user, name). This converges both subsystems before the
  // Phase 2 data migration runs. localStorage write below stays as fallback.
  if (_userId) {
    _saveProjectScoped({
      name,
      scope: 'quote',
      payload: { lines: project.lines, date: project.date }
    }).then(({ error }) => {
      if (error) console.warn('CQ project DB save failed:', error);
    });
  }
  cqProjectLibrary.unshift(project);
  saveCQProjectLibrary();
  renderCQProjects();
  // Open projects panel to show saved
  const p = _byId('cq-projects-panel');
  if (p) p.style.display = '';
  _toast(`Project "${name}" saved`, 'success');
}

function cqLoadProject(idx) {
  const p = cqProjectLibrary[idx];
  if (!p) return;
  cqLines = JSON.parse(JSON.stringify(p.lines || []));
  cqNextId = cqLines.length > 0 ? Math.max(...cqLines.map(l=>l.id)) + 1 : 1;
  const nameEl = _byId('cq-project');
  if (nameEl) nameEl.value = p.projectName || p.name || '';
  cqActiveLineIdx = 0;
  saveCQLines();
  renderCQPanel();
  toggleCabPanel('projects'); // close panel
  _toast(`Loaded "${p.name}"`, 'success');
}

function cqDeleteProject(idx) {
  _confirm('Delete this project?', () => {
    cqProjectLibrary.splice(idx, 1);
    saveCQProjectLibrary();
    renderCQProjects();
  });
}

function renderCQProjects() {
  const el = _byId('cq-projects-list');
  if (!el) return;
  const cur = window.currency;
  if (!cqProjectLibrary.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface);text-align:center">${_userId ? 'No saved projects yet. Enter a project name and click Save Project.' : '<div class="projects-signin">Sign in to save & load projects. <span onclick="dismissAuth();_showAuth()">Sign in</span></div>'}</div>`;
    return;
  }
  el.innerHTML = cqProjectLibrary.map((p, i) => {
    const count = (p.lines||[]).length;
    return `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;margin-bottom:3px;border-radius:6px;border:1px solid var(--border);background:var(--surface);cursor:pointer" onclick="cqLoadProject(${i})">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(p.name)}</div>
        <div style="font-size:10px;color:var(--muted)">${p.date} · ${count} cabinet${count!==1?'s':''}</div>
      </div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:14px;padding:0 2px" onclick="event.stopPropagation();cqDeleteProject(${i})">×</button>
    </div>`;
  }).join('');
}
function cqExportProjects() {
  if (!cqProjectLibrary.length) { _toast('No projects to export', 'error'); return; }
  const rows = [['Project Name','Date','Cabinet Count']];
  cqProjectLibrary.forEach(p => rows.push([p.name, p.date, (p.lines||[]).length]));
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'cabinet-projects.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  // Also export full data as JSON for re-import
  const json = JSON.stringify(cqProjectLibrary);
  const a2 = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json],{type:'application/json'})), download: 'cabinet-projects-data.json' });
  a2.click(); URL.revokeObjectURL(a2.href);
  _toast('Projects exported (CSV summary + JSON data)', 'success');
}
function cqImportProjects() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json,.csv';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(text);
        if (Array.isArray(data)) { data.forEach(p => { p.id = Date.now() + Math.random(); cqProjectLibrary.push(p); }); saveCQProjectLibrary(); renderCQProjects(); _toast(data.length + ' projects imported', 'success'); }
      } else { _toast('Use the JSON file for project import (CSV is summary only)', 'info'); }
    } catch(e) { _toast('Could not read file', 'error'); }
  };
  input.click();
}

function cqExportLibrary() {
  if (!cqLibrary.length) { _toast('No cabinets in library', 'error'); return; }
  const headers = ['Name','Width','Height','Depth','Qty','Material','Back Material','Finish','Construction','Base','Doors','Door Material','Door %','Drawers','Front Material','Inner Material','Drawer %','Fixed Shelves','Adj Shelves','Loose Shelves','Partitions','End Panels'];
  const rows = [headers];
  cqLibrary.forEach(c => {
    rows.push([c._libName||c.name||'Cabinet',c.w,c.h,c.d,c.qty||1,c.material||'',c.backMat||'',c.finish||'None',c.construction||'Overlay',c.baseType||'None',c.doors||0,c.doorMat||'',c.doorPct||95,c.drawers||0,c.drawerFrontMat||'',c.drawerInnerMat||'',c.drawerPct||85,c.shelves||0,c.adjShelves||0,c.looseShelves||0,c.partitions||0,c.endPanels||0]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'cabinet-library.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Library exported as CSV', 'success');
}
function cqImportLibrary() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    try {
      const text = await file.text();
      const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
      if (rows.length < 2) { _toast('CSV has no data rows', 'error'); return; }
      let imported = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (r.length < 4 || !r[0]) continue;
        const cab = cqDefaultLine();
        cab.id = Date.now() + Math.random();
        cab._libName = r[0]; cab.name = r[0];
        cab.w = parseFloat(r[1])||600; cab.h = parseFloat(r[2])||720; cab.d = parseFloat(r[3])||560;
        cab.qty = parseInt(r[4])||1; cab.material = r[5]||cab.material; cab.backMat = r[6]||cab.backMat;
        cab.finish = r[7]||'None'; cab.construction = r[8]||'Overlay'; cab.baseType = r[9]||'None';
        cab.doors = parseInt(r[10])||0; cab.doorMat = r[11]||cab.material; cab.doorPct = parseInt(r[12])||95;
        cab.drawers = parseInt(r[13])||0; cab.drawerFrontMat = r[14]||cab.material; cab.drawerInnerMat = r[15]||cab.backMat;
        cab.drawerPct = parseInt(r[16])||85; cab.shelves = parseInt(r[17])||0; cab.adjShelves = parseInt(r[18])||0;
        cab.looseShelves = parseInt(r[19])||0; cab.partitions = parseInt(r[20])||0; cab.endPanels = parseInt(r[21])||0;
        cqLibrary.push(cab); imported++;
      }
      renderCQLibrary();
      _toast(imported + ' cabinets imported', 'success');
      const p = _byId('cq-library-panel'); if (p) p.style.display = '';
      // Cloud sync: push the just-imported entries to DB and capture db_ids
      const newEntries = cqLibrary.slice(-imported);
      Promise.all(newEntries.map(e => _saveCabinetToDB(e).then(id => { if (id) e.db_id = id; })))
        .catch(err => console.warn('[cabinet-template bulk save]', err.message || err));
    } catch(e) { _toast('Could not read CSV: ' + e.message, 'error'); }
  };
  input.click();
}
function cqSaveToLibrary() {
  const line = cqLines[cqActiveLineIdx];
  if (!line) { _toast('Select a cabinet first', 'error'); return; }
  const copy = JSON.parse(JSON.stringify(line));
  copy.id = Date.now();
  copy._libName = copy.name || copy.type || 'Cabinet';
  cqLibrary.push(copy);
  renderCQLibrary();
  _toast(`"${copy._libName}" saved to library`, 'success');
  _saveCabinetToDB(copy).then(id => { if (id) copy.db_id = id; });
}
function cqLoadFromLibrary(idx) {
  const src = cqLibrary[idx];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cqNextId++;
  delete copy._libName;
  cqLines.push(copy);
  cqActiveLineIdx = cqLines.length - 1;
  saveCQLines();
  renderCQPanel();
  _toast(`"${src._libName}" added to quote`, 'success');
}
function cqRemoveFromLibrary(idx) {
  const removed = cqLibrary[idx];
  cqLibrary.splice(idx, 1);
  renderCQLibrary();
  if (removed?.db_id) _deleteCabinetFromDB(removed.db_id);
}
function renderCQLibrary() {} // Library now via smart search dropdown

function _cqCabinetSearchInput(input) {
  // Update the active cabinet name as the user types
  if (cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx]) {
    cqLines[cqActiveLineIdx].name = input.value;
    saveCQLines();
    renderCQCabList();
    renderCQResults();
  }
  _smartCQLibrarySuggest(input, 'cq-cabinet-suggest');
}

function _smartCQLibrarySuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(q)) : cqLibrary;
  if (matches.length === 0 && !q) { box.style.display = 'none'; return; }
  let html = '';
  matches.slice(0, 8).forEach(c => {
    const idx = cqLibrary.indexOf(c);
    const calc = calcCQLine(c);
    html += `<div class="client-suggest-item" onmousedown="cqLoadFromLibrary(${idx});_byId('cq-cabinet-search').value='';_byId('${boxId}').style.display='none'">
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

// ── Type Presets ──
const CQ_PRESETS = {
  'Base Cabinet':   { w:600, h:720, d:560, doors:2, drawers:0, shelves:1 },
  'Wall Cabinet':   { w:600, h:720, d:330, doors:2, drawers:0, shelves:2 },
  'Tall Cabinet':   { w:600, h:2100, d:560, doors:2, drawers:0, shelves:4 },
  'Drawer Unit':    { w:600, h:720, d:560, doors:0, drawers:3, shelves:0 },
  'Shelf Unit':     { w:800, h:1800, d:350, doors:0, drawers:0, shelves:4 },
  'Vanity':         { w:900, h:850, d:500, doors:2, drawers:1, shelves:0 },
  'Island':         { w:1200, h:900, d:600, doors:4, drawers:2, shelves:1 },
  'Pantry':         { w:600, h:2100, d:560, doors:2, drawers:0, shelves:6 },
  'Custom':         { w:600, h:720, d:560, doors:0, drawers:0, shelves:0 },
};

// ── Default Line Item ──
function cqDefaultLine(type) {
  return {
    id: cqNextId++, name: '',
    w: 600, h: 720, d: 560, qty: 1,
    construction: 'overlay', // overlay, inset, face frame
    baseType: 'plinth', // plinth, feet, castors, frame, none
    material: cqSettings.materials[0]?.name || '',
    backMat: (cqSettings.materials.find(m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cqSettings.materials[0])?.name || '',
    finish: cqSettings.finishes?.[0]?.name || 'None',
    doors: 0, doorPct: 95,
    doorMat: cqSettings.materials[0]?.name || '',
    drawers: 0, drawerPct: 85,
    drawerFrontMat: cqSettings.materials[0]?.name || '',
    drawerInnerMat: (cqSettings.materials.find(m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cqSettings.materials[0])?.name || '',
    shelves: 0, adjShelves: 0, looseShelves: 0, partitions: 0, endPanels: 0,
    hwItems: [],
    extras: [], // [{label, cost}]
    labourHrs: 0, labourOverride: false,
    matCostOverride: null,
    notes: '', room: ''
  };
}

// ── Add / Remove / Duplicate Lines ──
function addCQLine(type) {
  // If we have a blank line with user edits, use that instead of a fresh default
  let line;
  if (!type && window._cqBlankLine && window._cqBlankLine.name) {
    line = JSON.parse(JSON.stringify(window._cqBlankLine));
    line.id = cqNextId++;
    window._cqBlankLine = cqDefaultLine(); // reset blank
  } else {
    line = cqDefaultLine(type);
  }
  cqLines.push(line);
  saveCQLines(); renderCQPanel();
}
function addCQLineFromPreset(type) {
  const line = cqDefaultLine(type);
  line.name = type;
  cqLines.push(line);
  saveCQLines(); renderCQPanel();
  setTimeout(() => { const el = _byId('cq-table-area'); if (el) el.scrollTop = el.scrollHeight; }, 50);
}
function removeCQLine(id) {
  cqLines = cqLines.filter(l => l.id !== id);
  saveCQLines(); renderCQPanel();
}
function dupCQLine(id) {
  const src = cqLines.find(l => l.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cqNextId++;
  copy.name = src.name ? src.name + ' (copy)' : '';
  cqLines.push(copy);
  saveCQLines(); renderCQPanel();
}

// ── Update a field on a line ──
function updateCQLine(id, field, val) {
  const line = cqLines.find(l => l.id === id);
  if (!line) return;
  const numFields = ['w','h','d','qty','doors','drawers','adjShelves','labourHrs','doorPct','drawerPct'];
  if (numFields.includes(field)) {
    line[field] = parseFloat(val) || 0;
  } else if (field === 'shelves') {
    // The main table shows combined shelves - update shelves, keep adjShelves separate
    const total = parseFloat(val) || 0;
    line.shelves = total;
    line.adjShelves = 0;
  } else if (field === 'labourOverride') {
    line.labourOverride = val === 'true' || val === true;
  } else if (field === 'matCostOverride') {
    const v = parseFloat(val);
    line.matCostOverride = (val === '' || val === null || isNaN(v)) ? null : v;
  } else if (field === 'type') {
    line.type = val;
    // Apply preset dimensions if type changed
    const preset = CQ_PRESETS[val];
    if (preset) {
      line.w = preset.w; line.h = preset.h; line.d = preset.d;
      line.doors = preset.doors; line.drawers = preset.drawers; line.shelves = preset.shelves;
    }
  } else {
    line[field] = val;
  }
  saveCQLines(); renderCQPanel();
}

// ── Add hardware item to a line ──
function addCQHwToLine(id) {
  const line = cqLines.find(l => l.id === id);
  if (!line) return;
  line.hwItems.push({ name: cqSettings.hardware[0]?.name || '', qty: 1 });
  saveCQLines(); renderCQPanel();
}
function updateCQHw(lineId, hwIdx, field, val) {
  const line = cqLines.find(l => l.id === lineId);
  if (!line || !line.hwItems[hwIdx]) return;
  if (field === 'qty') { line.hwItems[hwIdx].qty = parseInt(val) || 1; saveCQLines(); renderCQPanel(); }
  else { line.hwItems[hwIdx].name = val; saveCQLines(); renderCQCabList(); renderCQResults(); }
}
function removeCQHw(lineId, hwIdx) {
  const line = cqLines.find(l => l.id === lineId);
  if (!line) return;
  line.hwItems.splice(hwIdx, 1);
  saveCQLines(); renderCQPanel();
}

// ── Move rows up/down ──
function moveCQLine(id, dir) {
  const idx = cqLines.findIndex(l => l.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cqLines.length) return;
  [cqLines[idx], cqLines[newIdx]] = [cqLines[newIdx], cqLines[idx]];
  saveCQLines(); renderCQPanel();
}

// ── Toggle expanded detail for a row ──
let cqExpandedRows = new Set();
function toggleCQExpand(id) {
  if (cqExpandedRows.has(id)) cqExpandedRows.delete(id);
  else cqExpandedRows.add(id);
  renderCQPanel();
}

// ── Toggle individual sections within a cabinet card ──
let cqOpenSections = new Set();
function toggleCQSection(lineId, section) {
  const key = lineId + '-' + section;
  if (cqOpenSections.has(key)) cqOpenSections.delete(key);
  else cqOpenSections.add(key);
  renderCQPanel();
}
function cqExpandAll() {
  const secs = ['dims','doors','drawers','shelves','hw','extras'];
  cqLines.forEach(l => secs.forEach(s => cqOpenSections.add(l.id + '-' + s)));
  renderCQPanel();
}
function cqCollapseAll() {
  cqOpenSections.clear();
  renderCQPanel();
}

// ── Calculate a single line item ──
function calcCQLine(line) {
  const W = line.w / 1000, H = line.h / 1000, D = line.d / 1000;
  const T = 0.018;
  const innerW = Math.max(0, W - 2 * T);

  // Material price per m2 — checks stockItems first, then cqSettings.materials as fallback
  function mp(matName) {
    const s = stockItems.find(s => s.name === matName);
    if (s) return s.cost / (s.w && s.h ? (s.w/1000)*(s.h/1000) : SHEET_M2);
    const m = cqSettings.materials.find(m => m.name === matName);
    return m ? m.price / SHEET_M2 : 0;
  }
  function hwp(hwName) {
    const h = cqSettings.hardware.find(h => h.name === hwName);
    return h ? h.price : 0;
  }

  // Auto material cost: carcass panels
  let matCost = 0;
  // Sides (2)
  matCost += 2 * H * D * mp(line.material);
  // Top + bottom
  matCost += 2 * innerW * D * mp(line.material);
  // Back
  matCost += W * H * mp(line.backMat);
  // Doors (using % of front area, separate door material)
  const doorPct = (line.doorPct || 95) / 100;
  if (line.doors > 0) {
    const doorH = H * doorPct, doorW = innerW / Math.max(1, line.doors);
    matCost += line.doors * doorW * doorH * mp(line.doorMat || line.material);
  }
  // Drawers (fronts + boxes, using % of front area, separate materials)
  const drawerPct = (line.drawerPct || 85) / 100;
  if (line.drawers > 0) {
    const drwH = (H * drawerPct) / line.drawers;
    matCost += line.drawers * innerW * drwH * mp(line.drawerFrontMat || line.material); // fronts
    matCost += line.drawers * (2 * D * drwH + 2 * innerW * drwH + innerW * D) * mp(line.drawerInnerMat || line.backMat); // boxes
  }
  // Shelves
  const shelfArea = innerW * (D - T);
  matCost += (line.shelves + line.adjShelves) * shelfArea * mp(line.material);
  // End panels
  matCost += (line.endPanels || 0) * H * D * mp(line.material);

  // Finishing cost (from finish presets in settings)
  const allSurface = 2*H*D + 2*innerW*D + W*H;
  const _fs = stockItems.find(s => s.name === line.finish && s.category === 'Finishing');
  const finishPricePerM2 = _fs ? _fs.cost : ((cqSettings.finishes||[]).find(f => f.name === line.finish)?.price || 0);
  const finishCost = allSurface * finishPricePerM2;
  matCost += finishCost;

  // Extras cost
  const extrasCost = (line.extras||[]).reduce((s, e) => s + (parseFloat(e.cost)||0), 0);
  matCost += extrasCost;

  // Edge banding (exposed edges: front edges of sides, shelves, top, bottom)
  const edgingLength = 2*H + 2*innerW + (line.shelves + line.adjShelves) * innerW; // front edges
  const edgingCost = edgingLength * (cqSettings.edgingPerM || 0);
  matCost += edgingCost;

  // Use override if set
  const finalMatCost = (line.matCostOverride !== null && line.matCostOverride !== undefined) ? line.matCostOverride : matCost;

  // Base type cost
  const basePrice = (cqSettings.baseTypes||[]).find(b => b.name === line.baseType)?.price || 0;
  matCost += basePrice;

  // Construction type cost — frontal area based (price per m2 of front face)
  const frontArea = W * H;
  const constPrice = (cqSettings.constructions||[]).find(c => c.name === line.construction)?.price || 0;
  matCost += constPrice * frontArea;

  // Auto labour estimate (hours) — from configurable rates
  /** @type {any} */
  const lt = cqSettings.labourTimes || {};
  let autoLabour = 0;
  // Carcass — volume based (hrs per m3)
  const volume = W * H * D;
  autoLabour += (lt.carcass || 1.5) * volume;
  autoLabour += line.doors * (lt.door || 0.4);
  autoLabour += line.drawers * (lt.drawer || 0.6);
  // Split shelf/partition labour
  autoLabour += (line.shelves || 0) * (lt.fixedShelf || 0.3);
  autoLabour += (line.adjShelves || 0) * (lt.adjShelfHoles || 0.4);
  autoLabour += (line.looseShelves || 0) * (lt.looseShelf || 0.2);
  autoLabour += (line.partitions || 0) * (lt.partition || 0.5);
  autoLabour += (line.endPanels || 0) * (lt.endPanel || 0.3);
  const surfaceArea = 2*H*D + 2*innerW*D + W*H;
  autoLabour += surfaceArea * (lt.finishPerM2 || 0.5);

  const labourHrs = line.labourOverride ? line.labourHrs : autoLabour;
  const labourCost = labourHrs * cqSettings.labourRate;

  // Hardware
  let hwCost = 0;
  // Auto hardware for doors/drawers
  if (line.doors > 0) hwCost += line.doors * 2 * 6;
  if (line.drawers > 0) hwCost += line.drawers * 24;
  // Manual hardware items
  for (const hw of line.hwItems) {
    hwCost += hwp(hw.name) * hw.qty;
  }

  const lineSubtotal = (finalMatCost + labourCost + hwCost) * line.qty;

  return {
    matCost: finalMatCost, matCostAuto: matCost,
    labourHrs, labourHrsAuto: autoLabour, labourCost,
    hwCost, lineSubtotal,
    qty: line.qty
  };
}


// ── Render the sidebar: cabinet list + active editor ──
function renderCQPanel() {
  const cur = window.currency;
  const fmt = v => cur + Number(v).toFixed(2);
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  // Sync settings form values
  const fields = {labourRate:'cq-labour-rate', markup:'cq-markup', tax:'cq-tax', deposit:'cq-deposit', edgingPerM:'cq-edging-m'};
  Object.entries(fields).forEach(([k, id]) => { const el = _byId(id); if (el && el !== document.activeElement) el.value = cqSettings[k]; });

  renderCQRates();
  renderCQLibrary();
  renderCQCabList();
  renderCQEditor();
  renderCQResults();
}

// ── Render cabinet list in sidebar ──
function renderCQCabList() {
  const el = _byId('cq-cab-list');
  if (!el) return;
  const cur = window.currency;
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  if (!cqLines.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:11px;padding:8px 10px;border-radius:5px;border:1px solid var(--border);background:var(--surface);text-align:center">No cabinets yet. Click "+ Add Cabinet" above.</div>`;
    return;
  }
  el.innerHTML = cqLines.map((c, i) => {
    const calc = calcCQLine(c);
    const active = i === cqActiveLineIdx;
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-bottom:4px;border-radius:8px;border:1.5px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent-dim)':'var(--surface)'};cursor:pointer;transition:border-color .15s" onclick="cqSelectLine(${i})">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.name || 'Cabinet'}${c.qty > 1 ? ' <span style="color:var(--muted);font-weight:400">x'+c.qty+'</span>' : ''}</div>
        <div style="font-size:11px;color:var(--muted)">${c.w}×${c.h}×${c.d}mm</div>
      </div>
      <div style="font-size:13px;font-weight:700;color:var(--accent);white-space:nowrap">${fmt0(calc.lineSubtotal)}</div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px" onclick="event.stopPropagation();_openCabinetPopup(${i})" title="Edit in popup">✎</button>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:12px;padding:2px" onclick="event.stopPropagation();dupCQLine(${c.id})" title="Duplicate">⧉</button>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:15px;padding:2px" onclick="event.stopPropagation();removeCQLine(${c.id})" title="Remove">×</button>
    </div>`;
  }).join('');
}

// ── Active line index ──
let cqActiveLineIdx = 0;
function cqSelectLine(idx) {
  cqActiveLineIdx = idx;
  renderCQPanel();
}

// ── Render the active cabinet editor in sidebar ──
function renderCQEditor() {
  // Hide any open fixed suggest dropdowns
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => { b.style.display = 'none'; b.style.position = ''; });
  const el = _byId('cq-cab-editor');
  if (!el) return;
  // Use active line or a blank default for "Add" mode
  const isEditing = cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx];
  // Sync cabinet library search box with active cabinet name
  const searchInp = _byId('cq-cabinet-search');
  if (searchInp && document.activeElement !== searchInp) {
    searchInp.value = isEditing ? (cqLines[cqActiveLineIdx].name || '') : '';
  }
  if (!window._cqBlankLine) window._cqBlankLine = cqDefaultLine();
  const line = isEditing ? cqLines[cqActiveLineIdx] : window._cqBlankLine;

  const cur = window.currency;
  const c = calcCQLine(line);
  const matSmart = (field, val) => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cq-mat-${field}" value="${_escHtml(val||'')}" autocomplete="off" style="font-size:13px" oninput="_smartCQMaterialSuggest(this,'cq-mat-suggest-${field}','${field}')" onfocus="_smartCQMaterialSuggest(this,'cq-mat-suggest-${field}','${field}')" onblur="setTimeout(()=>{_byId('cq-mat-suggest-${field}').style.display='none';cqUpdateField('${field}',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new material">+</div></div><div id="cq-mat-suggest-${field}" class="client-suggest-list" style="display:none"></div></div>`;
  const finishSmart = () => `<div style="position:relative"><div class="smart-input-wrap"><input type="text" id="cq-mat-finish" value="${_escHtml(line.finish||'None')}" autocomplete="off" style="font-size:13px" oninput="_smartCQFinishSuggest(this,'cq-mat-suggest-finish')" onfocus="_smartCQFinishSuggest(this,'cq-mat-suggest-finish')" onblur="setTimeout(()=>{_byId('cq-mat-suggest-finish').style.display='none';cqUpdateField('finish',this.value)},150)"><div class="smart-input-add" onclick="_openNewStockPopup()" title="Add new finish">+</div></div><div id="cq-mat-suggest-finish" class="client-suggest-list" style="display:none"></div></div>`;
  const stepper = (field, val, min) => `<div class="cl-stepper"><button class="cl-step-btn" onclick="cqStepField('${field}',-1)">−</button><input type="number" class="cl-input cl-qty-input" value="${val}" min="${min||0}" style="font-size:14px;width:42px" onchange="cqUpdateField('${field}',this.value)"><button class="cl-step-btn" onclick="cqStepField('${field}',1)">+</button></div>`;
  const so = sec => cqOpenSections.has(line.id + '-' + sec);
  const chev = sec => `<span style="font-size:10px;color:var(--muted);transition:transform .2s;display:inline-block;${so(sec)?'transform:rotate(90deg)':''}">&#9654;</span>`;
  const SB = 'border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;background:var(--surface)';
  const SH = 'display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none';
  const ST = 'font-size:13px;font-weight:600;color:var(--text);flex:1';
  const SS = 'font-size:11px;color:var(--muted)';
  const SC = sec => `style="padding:10px 12px;border-top:1px solid var(--border);${so(sec)?'':'display:none'}"`;
  const FM = 'margin:0';
  const LB = 'font-size:12px';
  const IS = 'font-size:14px';
  const SL = 'font-size:13px';
  const dot = c => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--${c});margin-right:4px"></span>`;
  const liveCost = v => `<span style="font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">${cur}${Math.round(v)}</span>`;

  // Calculate per-section costs
  const W=line.w/1000, H=line.h/1000, D=line.d/1000, T=0.018, iW=Math.max(0,W-2*T);
  function mp(n){ const s=stockItems.find(s=>s.name===n); if(s) return s.cost/(s.w&&s.h?(s.w/1000)*(s.h/1000):2.9768); const m=cqSettings.materials.find(m=>m.name===n); return m?m.price/2.9768:0; }
  const carcassCost = (2*H*D + 2*iW*D)*mp(line.material) + W*H*mp(line.backMat);
  const _fss = stockItems.find(s => s.name === line.finish && s.category === 'Finishing');
  const finishPrice = _fss ? _fss.cost : ((cqSettings.finishes||[]).find(f=>f.name===line.finish)?.price || 0);
  const surfArea = 2*H*D + 2*iW*D + W*H;
  const finishCostVal = surfArea * finishPrice;
  const doorCost = line.doors > 0 ? line.doors*(iW/Math.max(1,line.doors))*(H*(line.doorPct||95)/100)*mp(line.doorMat||line.material) : 0;
  const drwFrontCost = line.drawers > 0 ? line.drawers*iW*((H*(line.drawerPct||85)/100)/line.drawers)*mp(line.drawerFrontMat||line.material) : 0;
  const shelfCost = (line.shelves+line.adjShelves)*iW*(D-T)*mp(line.material) + (line.endPanels||0)*H*D*mp(line.material);
  const extrasCost = (line.extras||[]).reduce((s,e)=>s+(parseFloat(e.cost)||0),0);

  el.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:6px">

      <!-- CABINET (dims + material + finish + construction + base) -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'cab')">
          ${chev('cab')}
          <span style="${ST}">Cabinet</span>
          ${liveCost(carcassCost + finishCostVal)}
          <span style="${SS}">${line.w}×${line.h}×${line.d}</span>
        </div>
        <div ${SC('cab')}>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="${FM}"><label style="${LB}">Width (mm)</label><input type="number" value="${line.w}" style="${IS}" oninput="cqUpdateField('w',this.value)"></div>
            <div class="form-group" style="${FM}"><label style="${LB}">Height (mm)</label><input type="number" value="${line.h}" style="${IS}" oninput="cqUpdateField('h',this.value)"></div>
            <div class="form-group" style="${FM}"><label style="${LB}">Depth (mm)</label><input type="number" value="${line.d}" style="${IS}" oninput="cqUpdateField('d',this.value)"></div>
            <div class="form-group" style="flex:0 0 auto;${FM}"><label style="${LB}">Qty</label>${stepper('qty', line.qty, 1)}</div>
          </div>
          <div style="margin-bottom:8px"><label style="${LB}">Carcass Material</label>${matSmart('material', line.material)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Back Panel</label>${matSmart('backMat', line.backMat)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Finish</label>${finishSmart()}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Construction</label>
            <select style="${SL};width:100%" onchange="cqUpdateField('construction',this.value)">
              ${(cqSettings.constructions||[]).map(c=>`<option value="${c.name}" ${c.name===line.construction?'selected':''}>${c.name}${c.price?' (+'+cur+c.price+'/m²)':''}</option>`).join('')}
            </select>
          </div>
          <div style="margin-bottom:0"><label style="${LB}">Base</label>
            <select style="${SL};width:100%" onchange="cqUpdateField('baseType',this.value)">
              ${(cqSettings.baseTypes||[]).map(b=>`<option value="${b.name}" ${b.name===line.baseType?'selected':''}>${b.name}${b.price?' (+'+cur+b.price+')':''}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <!-- DOORS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'doors')">
          ${chev('doors')}
          <span style="${ST}">Doors</span>
          ${line.doors > 0 ? liveCost(doorCost) : ''}
          <span style="${SS}">${line.doors>0?line.doors+' door'+(line.doors!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('doors')}>
          <div style="margin-bottom:8px"><label style="${LB}">Count</label>${stepper('doors', line.doors, 0)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Door Material</label>${matSmart('doorMat', line.doorMat||line.material)}</div>
          ${line.doors>0?`<label style="font-size:11px;color:var(--muted)">% of front area</label><div class="cq-pct-row"><input type="range" class="cq-pct-slider" min="50" max="100" value="${line.doorPct||95}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="cqUpdateField('doorPct',this.value)"><span class="cq-pct-val">${line.doorPct||95}%</span></div>`:''}
        </div>
      </div>

      <!-- DRAWERS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'drawers')">
          ${chev('drawers')}
          <span style="${ST}">Drawers</span>
          ${line.drawers > 0 ? liveCost(drwFrontCost) : ''}
          <span style="${SS}">${line.drawers>0?line.drawers+' drawer'+(line.drawers!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('drawers')}>
          <div style="margin-bottom:8px"><label style="${LB}">Count</label>${stepper('drawers', line.drawers, 0)}</div>
          <div style="margin-bottom:8px"><label style="${LB}">Front Material</label>${matSmart('drawerFrontMat', line.drawerFrontMat||line.material)}</div>
          ${line.drawers>0?`<div style="margin-bottom:8px"><label style="${LB}">Inner Box Material</label>${matSmart('drawerInnerMat', line.drawerInnerMat||line.backMat)}</div>
          <label style="font-size:11px;color:var(--muted)">% of front area</label><div class="cq-pct-row"><input type="range" class="cq-pct-slider" min="30" max="100" value="${line.drawerPct||85}" oninput="this.nextElementSibling.textContent=this.value+'%'" onchange="cqUpdateField('drawerPct',this.value)"><span class="cq-pct-val">${line.drawerPct||85}%</span></div>`:''}
        </div>
      </div>

      <!-- SHELVES & PARTITIONS -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'shelves')">
          ${chev('shelves')}
          <span style="${ST}">Shelves & Partitions</span>
          ${(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))>0 ? liveCost(shelfCost) : ''}
          <span style="${SS}">${(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))>0?(line.shelves+(line.adjShelves||0)+(line.looseShelves||0)+(line.partitions||0)+(line.endPanels||0))+' total':'None'}</span>
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

      <!-- HARDWARE -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'hw')">
          ${chev('hw')}
          <span style="${ST}">Hardware</span>
          ${liveCost(c.hwCost)}
        </div>
        <div ${SC('hw')}>
          <div style="font-size:12px;color:var(--muted);margin-bottom:8px">Auto: ${line.doors>0?line.doors*2+' hinges':''}${line.doors>0&&line.drawers>0?', ':''}${line.drawers>0?line.drawers+' slides':''}${line.doors===0&&line.drawers===0?'None':''}</div>
          ${line.hwItems.map((hw, hi) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px;position:relative">
            <div style="flex:1;position:relative"><div class="smart-input-wrap"><input type="text" id="cq-hw-${line.id}-${hi}" value="${_escHtml(hw.name)}" style="font-size:12px" autocomplete="off" oninput="_smartCQHwSuggest(this,'cq-hw-suggest-${line.id}-${hi}',${line.id},${hi})" onfocus="_smartCQHwSuggest(this,'cq-hw-suggest-${line.id}-${hi}',${line.id},${hi})" onblur="setTimeout(()=>{_byId('cq-hw-suggest-${line.id}-${hi}').style.display='none';updateCQHw(${line.id},${hi},'name',this.value)},150)"><div class="smart-input-add" onclick="_openNewCQHardwarePopup(${line.id},${hi})" title="Add new hardware type">+</div></div><div id="cq-hw-suggest-${line.id}-${hi}" class="client-suggest-list" style="display:none"></div></div>
            <span style="font-size:10px;color:var(--muted)">×</span>
            <input type="number" style="width:40px;text-align:center;padding:5px;font-size:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text)" value="${hw.qty}" min="1" onchange="updateCQHw(${line.id},${hi},'qty',this.value)">
            <button class="cq-del-btn" style="font-size:16px" onclick="removeCQHw(${line.id},${hi})">×</button>
          </div>`).join('')}
          <div style="position:relative;margin-top:4px">
            <label style="font-size:10px;font-weight:600;color:var(--muted)">Add Hardware</label>
            <div class="smart-input-wrap">
              <input type="text" id="cq-hw-add-${line.id}" placeholder="Search hardware..." style="font-size:12px" autocomplete="off" oninput="_smartCQHwAddSuggest(this,'cq-hw-add-suggest-${line.id}',${line.id})" onfocus="_smartCQHwAddSuggest(this,'cq-hw-add-suggest-${line.id}',${line.id})" onblur="setTimeout(()=>_byId('cq-hw-add-suggest-${line.id}').style.display='none',150)">
              <div class="smart-input-add" onclick="_openNewCQHardwarePopup(${line.id},-1)" title="Add new hardware type">+</div>
            </div>
            <div id="cq-hw-add-suggest-${line.id}" class="client-suggest-list" style="display:none"></div>
          </div>
        </div>
      </div>

      <!-- EXTRAS (custom items with label + cost) -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'extras')">
          ${chev('extras')}
          <span style="${ST}">Extras</span>
          ${extrasCost > 0 ? liveCost(extrasCost) : ''}
          <span style="${SS}">${(line.extras||[]).length>0?(line.extras.length)+' item'+(line.extras.length!==1?'s':''):'None'}</span>
        </div>
        <div ${SC('extras')}>
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Add custom items like cable holes, lighting cutouts, etc.</div>
          ${(line.extras||[]).map((ex, ei) => `<div style="display:flex;gap:4px;align-items:center;margin-bottom:6px">
            <input style="flex:1;font-size:13px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--text);font-family:inherit" value="${ex.label||''}" placeholder="Item name" onblur="cqUpdateExtra(${line.id},${ei},'label',this.value)">
            <div style="display:flex;align-items:center;border:1px solid var(--border);border-radius:6px;overflow:hidden;background:var(--surface2)">
              <span style="font-size:11px;color:var(--muted);padding:4px 4px 4px 8px;background:var(--surface)">${cur}</span>
              <input type="number" style="width:60px;border:none;padding:6px 6px 6px 2px;font-size:13px;background:transparent;color:var(--text)" value="${ex.cost||0}" onblur="cqUpdateExtra(${line.id},${ei},'cost',this.value)">
            </div>
            <button class="cq-del-btn" style="font-size:16px" onclick="cqRemoveExtra(${line.id},${ei})">×</button>
          </div>`).join('')}
          <button class="cl-add-btn" onclick="cqAddExtra(${line.id})" style="font-size:12px;padding:5px 10px;margin:4px 0 0">+ Add Extra</button>
        </div>
      </div>

      <!-- NOTES -->
      <div style="${SB}">
        <div style="${SH}" onclick="toggleCQSection(${line.id},'notes')">
          ${chev('notes')}
          <span style="${ST}">Notes</span>
          <span style="${SS}">${line.notes?'✓':''} ${line.room||''}</span>
        </div>
        <div ${SC('notes')}>
          <div class="form-row" style="margin-bottom:8px">
            <div class="form-group" style="${FM}"><label style="${LB}">Room / Area</label><input type="text" value="${line.room||''}" placeholder="e.g. Kitchen" style="${SL}" list="cq-room-list" onchange="cqUpdateField('room',this.value)"></div>
          </div>
          <div class="form-group" style="${FM}"><label style="${LB}">Notes</label><textarea style="${SL};min-height:60px;resize:vertical" onblur="cqUpdateField('notes',this.value)">${line.notes||''}</textarea></div>
        </div>
      </div>

      <!-- Sidebar Actions -->
      <div style="padding-top:8px;display:flex;gap:6px">
        <button class="btn btn-primary" onclick="cqAddOrUpdateCabinet()" id="cq-add-btn" style="flex:1;font-size:13px;padding:10px 12px">${cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx] ? 'Update Cabinet' : 'Add to Project'}</button>
        <button class="btn btn-outline" onclick="cqSaveToLibrary()" style="flex:1;font-size:12px;padding:10px 12px">Save to Library</button>
      </div>

    </div>
    <datalist id="cq-room-list">${['Kitchen','Bathroom','Bedroom','Living Room','Laundry','Garage','Office','Pantry'].map(r=>'<option value="'+r+'">').join('')}</datalist>
  `;
}

// ── Extras CRUD ──
function cqAddExtra(lineId) {
  const line = cqLines.find(l=>l.id===lineId);
  if (!line) return;
  if (!line.extras) line.extras = [];
  line.extras.push({label:'',cost:0});
  saveCQLines(); renderCQEditor();
}
function cqUpdateExtra(lineId, idx, field, val) {
  const line = cqLines.find(l=>l.id===lineId);
  if (!line || !line.extras || !line.extras[idx]) return;
  if (field==='cost') line.extras[idx].cost = parseFloat(val)||0;
  else line.extras[idx].label = val;
  saveCQLines(); renderCQResults();
}
function cqRemoveExtra(lineId, idx) {
  const line = cqLines.find(l=>l.id===lineId);
  if (!line || !line.extras) return;
  line.extras.splice(idx,1);
  saveCQLines(); renderCQEditor(); renderCQResults();
}

function cqAddOrUpdateCabinet() {
  if (cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx]) {
    // Was editing — save and deselect
    cqActiveLineIdx = -1;
    saveCQLines();
    renderCQPanel();
    _toast('Cabinet updated', 'success');
  } else {
    // Add new cabinet from current form data
    addCQLine();
    // Deselect so form resets to blank
    cqActiveLineIdx = -1;
    renderCQEditor();
    renderCQResults();
  }
}

function cqEditCabinetFromOutput(idx) {
  cqActiveLineIdx = idx;
  renderCQCabList();
  renderCQEditor();
  renderCQResults();
  // Scroll sidebar to editor
  const sidebar = _byId('cq-sidebar');
  if (sidebar) sidebar.scrollTop = sidebar.scrollHeight;
}

function cqStepField(field, dir) {
  const isEditing = cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx];
  const line = isEditing ? cqLines[cqActiveLineIdx] : window._cqBlankLine;
  if (!line) return;
  const cur = parseFloat(line[field]) || 0;
  const min = (field === 'qty') ? 1 : 0;
  line[field] = Math.max(min, cur + dir);
  saveCQLines();
  renderCQCabList(); renderCQResults(); renderCQEditor();
}

function cqUpdateField(field, val) {
  const isEditing = cqActiveLineIdx >= 0 && cqLines[cqActiveLineIdx];
  const line = isEditing ? cqLines[cqActiveLineIdx] : window._cqBlankLine;
  if (!line) return;
  const numFields = ['w','h','d','qty','doors','drawers','shelves','adjShelves','endPanels','looseShelves','partitions','labourHrs','doorPct','drawerPct'];
  if (numFields.includes(field)) {
    line[field] = parseFloat(val) || 0;
  } else {
    line[field] = val;
  }
  saveCQLines();
  renderCQCabList();
  renderCQResults();
  // Re-render editor when structural fields change
  if (['doors','drawers','construction','baseType','finish'].includes(field)) renderCQEditor();
}

// ── Position suggest box as fixed overlay (avoids overflow clipping) ──
function _posSuggest(input, box) {
  if (!input || !box) return;
  const r = input.parentElement.getBoundingClientRect();
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

// ── Rates Stock Smart Suggest (opens stock edit popup on click) ──
function _smartRatesStockSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Sheet Goods' || s.category === 'Solid Timber' || s.category === 'Edge Banding' || (s.w > 0 && s.h > 0));
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('rates-stock-search').value='';_byId('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${dims ? dims + ' · ' : ''}${cur}${s.cost}/sheet</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock material</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// ── Rates Finish Smart Suggest ──
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
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('rates-finish-search').value='';_byId('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m²</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new finish to stock</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// ── Rates Edge Banding Smart Suggest ──
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
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('rates-edge-search').value='';_byId('${boxId}').style.display='none';_openStockPopup(${s.id})">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/m</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new edge banding to stock</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// ── Cabinet Material Smart Suggest ──
function _smartCQMaterialSuggest(input, boxId, fieldName) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  // Search from shared stockItems library (Sheet Goods + items with dimensions)
  const pool = stockItems.filter(s => s.category === 'Sheet Goods' || s.category === 'Solid Timber' || s.category === 'Edge Banding' || (s.w > 0 && s.h > 0));
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const dims = s.w && s.h ? `${s.w}×${s.h}` : '';
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('cq-mat-${fieldName}').value='${_escHtml(s.name)}';cqUpdateField('${fieldName}','${_escHtml(s.name)}');_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${dims ? dims + ' · ' : ''}${cur}${s.cost}/sheet</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new stock material</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _smartCQFinishSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const pool = stockItems.filter(s => s.category === 'Finishing');
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  let html = '';
  matches.slice(0, 8).forEach(s => {
    const qtyColor = s.qty <= (s.low || 3) ? '#ef4444' : '#22c55e';
    html += `<div class="client-suggest-item" onmousedown="_byId('cq-mat-finish').value='${_escHtml(s.name)}';cqUpdateField('finish','${_escHtml(s.name)}');_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${s.cost}/unit</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_openNewStockPopup()">+ Add new finish to stock</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _openNewCQMaterialPopup(fieldName) {
  const existing = _byId('cq-mat-' + fieldName)?.value || '';
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
      <button class="btn btn-accent" onclick="_saveNewCQMaterial('${fieldName}')">Add Material</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnm-name')?.focus(), 50);
}

function _saveNewCQMaterial(fieldName) {
  const name = _popupVal('pnm-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnm-price')) || 0;
  if (!cqSettings.materials.some(m => m.name === name)) {
    cqSettings.materials.push({ name, price });
    saveCQSettings();
  }
  cqUpdateField(fieldName, name);
  const inp = _byId('cq-mat-' + fieldName);
  if (inp) inp.value = name;
  _closePopup();
  _toast('"' + name + '" added to materials', 'success');
}

function _openNewStockPopup() {
  const existing = _byId('cq-mat-finish')?.value || '';
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
      <button class="btn btn-accent" onclick="_saveNewCQFinish()">Add Finish</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnf-name')?.focus(), 50);
}

function _saveNewCQFinish() {
  const name = _popupVal('pnf-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnf-price')) || 0;
  if (!cqSettings.finishes) cqSettings.finishes = [];
  if (!cqSettings.finishes.some(f => f.name === name)) {
    cqSettings.finishes.push({ name, price });
    saveCQSettings();
  }
  cqUpdateField('finish', name);
  const inp = _byId('cq-mat-finish');
  if (inp) inp.value = name;
  _closePopup();
  _toast('"' + name + '" added to finishes', 'success');
}

// ── Cabinet Hardware Smart Suggest ──
function _smartCQHwSuggest(input, boxId, lineId, hwIdx) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqSettings.hardware.filter(h => h.name.toLowerCase().includes(q)) : cqSettings.hardware;
  let html = '';
  matches.slice(0, 8).forEach(h => {
    html += `<div class="client-suggest-item" onmousedown="_byId('cq-hw-${lineId}-${hwIdx}').value='${_escHtml(h.name)}';updateCQHw(${lineId},${hwIdx},'name','${_escHtml(h.name)}');_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:#6b8aff20;color:#6b8aff">H</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  if (q) html += `<div class="client-suggest-add" onmousedown="_openNewCQHardwarePopup(${lineId},${hwIdx})">+ Add "${_escHtml(input.value.trim())}" as new hardware</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _smartCQHwAddSuggest(input, boxId, lineId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqSettings.hardware.filter(h => h.name.toLowerCase().includes(q)) : cqSettings.hardware;
  let html = '';
  matches.slice(0, 8).forEach(h => {
    html += `<div class="client-suggest-item" onmousedown="_addCQHwByName(${lineId},'${_escHtml(h.name)}');_byId('cq-hw-add-${lineId}').value='';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:#6b8aff20;color:#6b8aff">H</span>
      <span style="flex:1">${_escHtml(h.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${cur}${h.price}/unit</span>
    </div>`;
  });
  if (q) html += `<div class="client-suggest-add" onmousedown="_openNewCQHardwarePopup(${lineId},-1)">+ Add "${_escHtml(input.value.trim())}" as new hardware</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

function _addCQHwByName(lineId, hwName) {
  const line = cqLines.find(l => l.id === lineId);
  if (!line) return;
  line.hwItems.push({ name: hwName, qty: 1 });
  saveCQLines(); renderCQPanel();
  _toast('"' + hwName + '" added', 'success');
}

function _openNewCQHardwarePopup(lineId, hwIdx) {
  const existing = hwIdx >= 0 ? (_byId('cq-hw-' + lineId + '-' + hwIdx)?.value || '') : (_byId('cq-hw-add-' + lineId)?.value || '');
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
      <button class="btn btn-accent" onclick="_saveNewCQHardware(${lineId},${hwIdx})">Add Hardware</button>
    </div>
  `, 'sm');
  setTimeout(() => _byId('pnh-name')?.focus(), 50);
}

function _saveNewCQHardware(lineId, hwIdx) {
  const name = _popupVal('pnh-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  const price = parseFloat(_popupVal('pnh-price')) || 0;
  if (!cqSettings.hardware.some(h => h.name === name)) {
    cqSettings.hardware.push({ name, price });
    saveCQSettings();
  }
  if (hwIdx >= 0) {
    updateCQHw(lineId, hwIdx, 'name', name);
    const inp = _byId('cq-hw-' + lineId + '-' + hwIdx);
    if (inp) inp.value = name;
  } else {
    _addCQHwByName(lineId, name);
  }
  _closePopup();
  _toast('"' + name + '" added to hardware', 'success');
}

// ── Render right panel: cost breakdown ──
function renderCQResults() {
  const el = _byId('cq-results');
  if (!el) return;
  const cur = window.currency;
  const fmt = v => cur + Number(v).toFixed(2);
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const projName = _byId('cq-project')?.value || '';

  if (!cqLines.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="12"/></svg></div>
      <h3>Cabinet Builder</h3>
      <p>Add cabinets using the sidebar to start building your project.</p>
    </div>`;
    return;
  }

  // Totals
  let gMat=0,gLabour=0,gHw=0,gSub=0;
  const calcs = cqLines.map(l => { const c=calcCQLine(l); gMat+=c.matCost*l.qty; gLabour+=c.labourCost*l.qty; gHw+=c.hwCost*l.qty; gSub+=c.lineSubtotal; return c; });
  const totalHrs = cqLines.reduce((s,l,i)=>s+calcs[i].labourHrs*l.qty,0);
  const gMarkup = gSub * cqSettings.markup/100;
  const gTotal = (gSub+gMarkup)*(1+cqSettings.tax/100);

  let html = `<div style="max-width:700px">`;

  // ── Top buttons bar ──
  html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
    <button class="btn btn-primary" onclick="cqAddToExistingQuote()" style="font-size:12px;padding:8px 14px">Add to Existing Quote</button>
    <div id="cq-quote-picker" style="display:none"></div>
    <button class="btn btn-outline" onclick="cqAddToNewQuote()" style="font-size:12px;padding:8px 14px;width:auto">+ New Quote</button>
    <span style="flex:1"></span>
    <button class="btn btn-outline" onclick="printCQQuote('pdf')" style="font-size:12px;padding:8px 12px;width:auto">&darr; PDF</button>
    <button class="btn btn-outline" onclick="printCQQuote('print')" style="font-size:12px;padding:8px 12px;width:auto">&oplus; Print</button>
    <button class="btn btn-outline" onclick="cqExportLibrary()" style="font-size:12px;padding:8px 12px;width:auto">&darr; Export</button>
    <button class="btn btn-outline" onclick="cqImportLibrary()" style="font-size:12px;padding:8px 12px;width:auto">&uarr; Import</button>
  </div>`;

  // ── Project header ──
  if (projName) html += `<h2 style="font-size:18px;font-weight:800;margin:0 0 4px">${_escHtml(projName)}</h2>`;
  html += `<div style="font-size:12px;color:var(--muted);margin-bottom:16px">${cqLines.length} cabinet${cqLines.length!==1?'s':''} · ${cqLines.reduce((s,l)=>s+l.qty,0)} units</div>`;

  // ── Individual cabinet cards ──
  cqLines.forEach((line, idx) => {
    const c = calcs[idx];
    const isActive = idx === cqActiveLineIdx;
    const cabMarkup = c.lineSubtotal * cqSettings.markup / 100;
    const cabTotal = (c.lineSubtotal + cabMarkup) * (1 + cqSettings.tax / 100);
    html += `<div style="background:var(--surface);border:${isActive?'2px solid var(--accent)':'1px solid var(--border)'};border-radius:var(--radius);margin-bottom:10px;overflow:hidden;cursor:pointer;box-shadow:var(--shadow);transition:box-shadow .15s" onclick="_openCabinetPopup(${idx})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow='var(--shadow)'">
      <!-- Header -->
      <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:${isActive?'var(--accent-dim)':'var(--surface2)'}">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(line.name||'Cabinet '+(idx+1))}</div>
          <div style="font-size:11px;color:var(--muted)">${line.w} × ${line.h} × ${line.d} mm · ${_escHtml(line.material)}${line.qty>1?' · x'+line.qty:''}</div>
        </div>
        <div style="font-size:16px;font-weight:800;color:var(--accent)">${fmt0(cabTotal)}</div>
      </div>
      <!-- Details -->
      <div style="padding:10px 16px;font-size:12px;color:var(--text2)">
        <div style="display:grid;grid-template-columns:1fr auto;gap:2px 16px">
          <span>Materials</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt(c.matCost)}</span>
          <span>Labour (${c.labourHrs.toFixed(1)} hrs @ ${cur}${cqSettings.labourRate}/hr)</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt(c.labourCost)}</span>
          <span>Hardware</span><span style="text-align:right;font-weight:600;color:var(--text)">${fmt0(c.hwCost)}</span>
          <span style="color:var(--muted)">Subtotal</span><span style="text-align:right;font-weight:600">${fmt0(c.lineSubtotal)}</span>
          ${cqSettings.markup>0?`<span style="color:var(--muted)">Markup (${cqSettings.markup}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(cabMarkup)}</span>`:''}
          ${cqSettings.tax>0?`<span style="color:var(--muted)">Tax (${cqSettings.tax}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(cabTotal-c.lineSubtotal-cabMarkup)}</span>`:''}
        </div>
        <!-- Sub details -->
        <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border2);font-size:11px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap">
          ${line.finish&&line.finish!=='None'?`<span>${_escHtml(line.finish)}</span>`:''}\
          ${line.construction?`<span>${_escHtml(line.construction)}</span>`:''}\
          ${line.baseType&&line.baseType!=='None'?`<span>${_escHtml(line.baseType)}</span>`:''}\
          ${line.doors>0?`<span>${line.doors} door${line.doors!==1?'s':''}</span>`:''}\
          ${line.drawers>0?`<span>${line.drawers} drawer${line.drawers!==1?'s':''}</span>`:''}\
          ${(line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)>0?`<span>${(line.shelves||0)+(line.adjShelves||0)+(line.looseShelves||0)} shelves</span>`:''}\
          ${(line.partitions||0)>0?`<span>${line.partitions} partition${line.partitions!==1?'s':''}</span>`:''}\
          ${(line.endPanels||0)>0?`<span>${line.endPanels} end panel${line.endPanels!==1?'s':''}</span>`:''}\
          ${line.room?`<span>${_escHtml(line.room)}</span>`:''}
        </div>
      </div>
    </div>`;
  });

  // ── All Cabinets Total card ──
  html += `<div style="background:var(--surface);border:2px solid var(--border);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)">
    <div style="padding:12px 16px;background:var(--surface2);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted)">All Cabinets (${cqLines.length})</div>
    <div style="padding:12px 16px">
      <div style="display:grid;grid-template-columns:1fr auto;gap:3px 16px;font-size:13px">
        <span style="color:var(--text2)">Materials</span><span style="text-align:right;font-weight:600">${fmt0(gMat)}</span>
        <span style="color:var(--text2)">Labour (${totalHrs.toFixed(1)} hrs)</span><span style="text-align:right;font-weight:600">${fmt0(gLabour)}</span>
        <span style="color:var(--text2)">Hardware</span><span style="text-align:right;font-weight:600">${fmt0(gHw)}</span>
      </div>
      <div style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px;display:grid;grid-template-columns:1fr auto;gap:3px 16px;font-size:13px">
        <span style="font-weight:700">Subtotal</span><span style="text-align:right;font-weight:700">${fmt0(gSub)}</span>
        ${cqSettings.markup>0?`<span style="color:var(--muted)">Markup (${cqSettings.markup}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(gMarkup)}</span>`:''}
        ${cqSettings.tax>0?`<span style="color:var(--muted)">Tax (${cqSettings.tax}%)</span><span style="text-align:right;color:var(--muted)">+${fmt0(gTotal-gSub-gMarkup)}</span>`:''}
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

function cqAddToNewQuote() {
  if (!cqLines.length) { _toast('Add cabinets first.', 'error'); return; }
  const gMat = cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0);
  const gLabour = cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0);
  const totalHrs = cqLines.reduce((s, l) => s + calcCQLine(l).labourHrs * l.qty, 0);

  // Pre-fill the quote form
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const projName = _byId('cq-project')?.value?.trim() || '';
  const clientName = _byId('cq-client')?.value?.trim() || '';
  if (projName) inp('q-project').value = projName;
  if (clientName) inp('q-client').value = clientName;
  inp('q-materials').value = gMat.toFixed(2);
  inp('q-labour-rate').value = String(cqSettings.labourRate);
  inp('q-hours').value = totalHrs.toFixed(1);
  inp('q-markup').value = String(cqSettings.markup);
  inp('q-tax').value = String(cqSettings.tax);
  inp('q-notes').value = cqLines.map(l => {
    const desc = l.name || 'Cabinet';
    const details = [l.w+'×'+l.h+'×'+l.d+'mm', l.material];
    if (l.doors > 0) details.push(l.doors + ' door' + (l.doors!==1?'s':''));
    if (l.drawers > 0) details.push(l.drawers + ' drawer' + (l.drawers!==1?'s':''));
    if (l.qty > 1) details.push('x' + l.qty);
    return desc + ' — ' + details.join(', ');
  }).join('\n');

  switchSection('quote');
  try { _updateQuotePreview(); } catch(e) {}
  _toast('Quote form pre-filled — enter client details and create', 'success');
}

// ── Add to existing quote (show picker) ──
function cqAddToExistingQuote() {
  if (!cqLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!quotes.length) { _toast('No existing quotes. Use "Create New Quote" instead.', 'info'); cqAddToNewQuote(); return; }

  // Show picker inline below button
  const picker = _byId('cq-quote-picker');
  if (!picker) return;
  if (picker.style.display !== 'none') { picker.style.display = 'none'; return; }
  const cur = window.currency;
  picker.style.display = 'block';
  picker.innerHTML = `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px">
    <select id="_cq_qsel" style="width:100%;padding:8px 10px;font-size:13px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);font-family:inherit;margin-bottom:8px">
      ${quotes.map((q,i) => `<option value="${i}">${quoteClient(q) || 'No client'} — ${quoteProject(q) || 'No project'} (${cur}${Math.round(quoteTotal(q))})</option>`).join('')}
    </select>
    <div style="display:flex;gap:6px">
      <button class="btn btn-primary" onclick="const qi=parseInt(_byId('_cq_qsel').value);_byId('cq-quote-picker').style.display='none';_cqApplyToQuote(qi)" style="flex:1;font-size:12px;padding:7px 10px">Add</button>
      <button class="btn btn-outline" onclick="_byId('cq-quote-picker').style.display='none'" style="width:auto;font-size:12px;padding:7px 10px">Cancel</button>
    </div>
  </div>`;
}
async function _cqApplyToQuote(qi) {
  const q = quotes[qi];
  if (!q) return;
  const cabNotes = cqLines.map(l => {
    const desc = l.name || 'Cabinet';
    const details = [l.w+'\u00d7'+l.h+'\u00d7'+l.d+'mm', l.material];
    if (l.doors > 0) details.push(l.doors + ' door' + (l.doors!==1?'s':''));
    if (l.drawers > 0) details.push(l.drawers + ' drawer' + (l.drawers!==1?'s':''));
    if (l.qty > 1) details.push('x' + l.qty);
    return desc + ' \u2014 ' + details.join(', ');
  }).join('\n');
  q.notes = ((q.notes || '') + '\n' + cabNotes).trim();
  if (_userId) {
    // Append cabinet specs as quote_lines rows so totals aggregate from the schema source of truth
    const { data: existing } = await _db('quote_lines').select('position').eq('quote_id', q.id);
    const startPos = (existing && existing.length) ? Math.max(...existing.map(r => r.position || 0)) + 1 : 1;
    const rows = cqLines.map((l, i) => _cqLineToRow(l, startPos + i, q.id));
    if (rows.length) await _db('quote_lines').insert(rows);
    await _db('quotes').update({ notes: q.notes, updated_at: new Date().toISOString() }).eq('id', q.id);
    await _refreshQuoteTotals(q.id);
  }
  switchSection('quote');
  renderQuoteMain();
  _toast(`Added to "${quoteProject(q)}" — quote lines added`, 'success');
}

// ── Save / Load / New Quotes ──
function saveCQQuote() {
  const client = _byId('cq-client')?.value?.trim() || '';
  const project = _byId('cq-project')?.value?.trim() || '';
  const notes = _byId('cq-notes')?.value?.trim() || '';
  const quoteNum = _byId('cq-quote-num')?.value?.trim() || '';
  if (!client && !project) { _toast('Enter a client or project name first.', 'error'); return; }

  const quote = {
    id: Date.now(), client, project, notes, quoteNum,
    lines: JSON.parse(JSON.stringify(cqLines)),
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    settings: { labourRate: cqSettings.labourRate, markup: cqSettings.markup, tax: cqSettings.tax }
  };

  if (cqActiveQuoteIdx >= 0 && cqSavedQuotes[cqActiveQuoteIdx]) {
    quote.id = cqSavedQuotes[cqActiveQuoteIdx].id;
    cqSavedQuotes[cqActiveQuoteIdx] = quote;
    _toast('Quote updated', 'success');
  } else {
    cqSavedQuotes.unshift(quote);
    cqActiveQuoteIdx = 0;
    _toast('Quote saved', 'success');
  }
  saveCQSaved();
  renderCQSavedShelf();
}

function loadCQQuote(idx) {
  const q = cqSavedQuotes[idx];
  if (!q) return;
  cqActiveQuoteIdx = idx;
  cqLines = JSON.parse(JSON.stringify(q.lines || []));
  cqNextId = cqLines.length > 0 ? Math.max(...cqLines.map(l=>l.id)) + 1 : 1;
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  inp('cq-client').value = quoteClient(q) || '';
  inp('cq-project').value = quoteProject(q) || '';
  inp('cq-notes').value = q.notes || '';
  inp('cq-quote-num').value = q.quoteNum || '';
  saveCQLines();
  renderCQPanel();
}

function newCQQuote() {
  cqActiveQuoteIdx = -1;
  cqLines = [];
  cqNextId = 1;
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  inp('cq-client').value = '';
  inp('cq-project').value = '';
  inp('cq-notes').value = '';
  inp('cq-quote-num').value = '';
  saveCQLines();
  renderCQPanel();
}

function deleteCQQuote(idx) {
  _confirm('Delete this saved quote?', () => {
    cqSavedQuotes.splice(idx, 1);
    if (cqActiveQuoteIdx === idx) { cqActiveQuoteIdx = -1; newCQQuote(); }
    else if (cqActiveQuoteIdx > idx) cqActiveQuoteIdx--;
    saveCQSaved();
    renderCQSavedShelf();
  });
}

function renderCQSavedShelf() {
  const shelf = _byId('cq-saved-shelf');
  const pills = _byId('cq-saved-pills');
  if (!shelf || !pills) return;
  if (cqSavedQuotes.length === 0) { shelf.style.display = 'none'; return; }
  shelf.style.display = '';
  const cur = window.currency;
  pills.innerHTML = cqSavedQuotes.map((q, i) => {
    const total = q.lines.reduce((s, l) => {
      const c = calcCQLine(l);
      return s + c.lineSubtotal;
    }, 0);
    const gt = total * (1 + (q.settings?.markup||0)/100) * (1 + (q.settings?.tax||0)/100);
    const active = i === cqActiveQuoteIdx;
    return `<div style="display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:6px;border:1px solid ${active?'var(--accent)':'var(--border)'};background:${active?'var(--accent-dim)':'var(--surface)'};cursor:pointer;flex-shrink:0;white-space:nowrap" onclick="loadCQQuote(${i})">
      <div style="font-size:11px;font-weight:600;color:var(--text)">${quoteClient(q)||quoteProject(q)}</div>
      <div style="font-size:10px;color:var(--muted)">${q.date}</div>
      <div style="font-size:11px;font-weight:700;color:var(--accent)">${cur}${Math.round(gt).toLocaleString()}</div>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:11px;padding:0" onclick="event.stopPropagation();dupCQSavedQuote(${i})" title="Duplicate">&#10697;</button>
      <button style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:0" onclick="event.stopPropagation();deleteCQQuote(${i})">&times;</button>
    </div>`;
  }).join('');
}

// ── Convert to Order ──
function cqConvertToOrder() {
  const client = _byId('cq-client')?.value?.trim() || 'Cabinet Client';
  const project = _byId('cq-project')?.value?.trim() || 'Cabinet Project';
  if (!cqLines.length) { _toast('Add cabinet lines first.', 'error'); return; }

  const grandSubtotal = cqLines.reduce((s, l) => s + calcCQLine(l).lineSubtotal, 0);
  const grandTotal = grandSubtotal * (1 + cqSettings.markup/100) * (1 + cqSettings.tax/100);

  // Create via the existing quote system
  const row = {
    user_id: _userId, client, project,
    materials: cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0),
    labour: cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0),
    markup: cqSettings.markup, tax: cqSettings.tax,
    status: 'draft',
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
    notes: 'Cabinet Quote: ' + cqLines.map(l => l.name || 'Cabinet').filter(Boolean).join(', '),
  };

  if (_userId) {
    _db('quotes').insert(row).select().single().then(({data, error}) => {
      if (error) { _toast('Could not save quote: ' + (error.message||''), 'error'); return; }
      quotes.unshift(data);
      _toast('Quote created from cabinet quote', 'success');
      renderQuoteMain();
      switchSection('quote');
    });
  } else {
    _toast('Sign in to save quotes', 'error');
  }
}

// ── PDF / Print ──

/** @type {any[]} */
let _clProjectCache = [];

// ── Cut List smart search: Projects ──
function _smartCLProjectSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const matches = q ? _clProjectCache.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8) : _clProjectCache.slice(0, 8);
  if (matches.length === 0 && !q) { box.style.display = 'none'; return; }
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
  html += `<div class="client-suggest-add" onmousedown="showSaveProjectForm()">+ Save current cut list as "${_escHtml(input.value.trim())}"</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// ── Cut List smart search: Stock Materials ──
function _smartCLStockSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const ebOn = typeof colsVisible !== 'undefined' && !!colsVisible.edgeband;
  // Panels: Sheet Goods or anything with dims (but not Edge Banding)
  const panelItems = stockItems.filter(s => (_scGet(s.id)||s.category) !== 'Edge Banding' && ((_scGet(s.id)||s.category) === 'Sheet Goods' || (s.w > 0 && s.h > 0)));
  // When edgeband column is on, also include Edge Banding items
  const ebItems = ebOn ? stockItems.filter(s => (_scGet(s.id)||s.category) === 'Edge Banding') : [];
  const pool = panelItems.concat(ebItems);
  const matches = q ? pool.filter(s => s.name.toLowerCase().includes(q)) : pool;
  if (matches.length === 0 && !q) { box.style.display = 'none'; return; }
  let html = '';
  matches.slice(0, 10).forEach(s => {
    const origIdx = stockItems.indexOf(s);
    const isEB = (_scGet(s.id)||s.category) === 'Edge Banding';
    const qtyColor = s.qty <= (s.lowAlert || 3) ? '#ef4444' : '#22c55e';
    let meta = '';
    if (isEB) {
      const vd = _svGet(s.id) || {};
      const t = vd.thickness ?? s.thickness;
      const w = vd.width ?? s.width ?? s.h;
      const l = vd.length ?? s.length ?? s.w;
      meta = [t?`${t}mm`:'', w?`${w}mm`:'', l?`${l}m`:''].filter(Boolean).join(' · ');
    } else {
      meta = (s.w && s.h ? `${s.w}×${s.h}` : '');
    }
    const handler = isEB
      ? `_clAddEdgeBandFromStockIdx(${origIdx})`
      : `_clAddPanelFromStock(${origIdx})`;
    const badge = isEB ? `<span style="font-size:9px;font-weight:600;color:var(--muted);background:var(--border);padding:1px 5px;border-radius:3px;margin-right:4px">EB</span>` : '';
    html += `<div class="client-suggest-item" onmousedown="${handler};_byId('cl-stock').value='';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:${qtyColor}20;color:${qtyColor}">${s.qty}</span>
      <span style="flex:1">${badge}${_escHtml(s.name)}</span>
      <span style="font-size:10px;color:var(--muted)">${meta}</span>
    </div>`;
  });
  if (matches.length === 0) {
    html += `<div class="client-suggest-add" onmousedown="switchSection('stock')">No matches — go to Stock to add materials</div>`;
  }
  box.innerHTML = html;
  box.style.display = '';
}

function _clAddPanelFromStock(idx) { const item = stockItems[idx]; if (!item) return; addSheet(item.name, item.w, item.h, Math.max(1, item.qty)); _toast('"'+item.name+'" added to panels', 'success'); }

function _clAddEdgeBandFromStockIdx(idx) {
  const s = stockItems[idx];
  if (!s) return;
  const exists = edgeBands.find(eb => eb.name === s.name);
  if (exists) { _toast(`${s.name} already in project`, 'error'); return; }
  const vd = _svGet(s.id) || {};
  const thickness = vd.thickness ?? s.thickness ?? 0;
  const width = vd.width ?? s.width ?? s.h ?? 0;
  const length = vd.length ?? s.length ?? s.w ?? 0;
  const glue = vd.glue || s.glue || '';
  addEdgeBand(s.name, thickness, width, null, length, glue);
  _toast(`Added ${s.name}`, 'success');
}

// ── Cut List Cabinet Library ──
function _smartCLCabinetSuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const q = input.value.trim().toLowerCase();
  const cur = window.currency;
  const matches = q ? cqLibrary.filter(c => (c._libName||c.name||'').toLowerCase().includes(q)) : cqLibrary;
  let html = '';
  matches.slice(0, 8).forEach(c => {
    const idx = cqLibrary.indexOf(c);
    const partCount = _cabinetPartCount(c);
    html += `<div class="client-suggest-item" onmousedown="_clLoadCabinetParts(${idx});_byId('cl-cabinet-search').value='';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">C</span>
      <span style="flex:1">${_escHtml(c._libName||c.name||'Cabinet')}</span>
      <span style="font-size:10px;color:var(--muted)">${c.w}×${c.h} · ${partCount} parts</span>
    </div>`;
  });
  html += `<div class="client-suggest-add" onmousedown="_clSaveToCabinetLibrary()">+ Save current cut parts to library</div>`;
  box.innerHTML = html;
  box.style.display = matches.length || q ? '' : 'none';
}

// Count how many cut parts a cabinet would produce
function _cabinetPartCount(cab) {
  let n = 4; // 2 sides + top + bottom
  if (cab.backMat) n++; // back panel
  n += (cab.doors || 0);
  n += (cab.drawers || 0) * 2; // front + box per drawer
  n += (cab.shelves || 0) + (cab.adjShelves || 0) + (cab.looseShelves || 0);
  n += (cab.partitions || 0) + (cab.endPanels || 0);
  return n;
}

// Build the list of parts a cabinet explodes into — pure data, no side effects.
function _cabinetPartsList(cab) {
  const W = cab.w, H = cab.h, D = cab.d;
  const T = 18;
  const iW = Math.max(0, W - 2*T);
  const mat = cab.material || '';
  const backMat = cab.backMat || mat;
  const name = cab._libName || cab.name || 'Cabinet';
  const parts = [];
  const add = (label, w, h, qty) => parts.push({ label, w, h, qty, grain: 'none' });

  add(name + ' — Side', H, D, 2);
  add(name + ' — Top/Bottom', iW, D, 2);
  if (backMat) add(name + ' — Back', W, H, 1);

  if (cab.doors > 0) {
    const doorPct = (cab.doorPct || 95) / 100;
    const doorH = Math.round(H * doorPct);
    const doorW = Math.round(iW / Math.max(1, cab.doors));
    add(name + ' — Door', doorW, doorH, cab.doors);
  }
  if (cab.drawers > 0) {
    const drwPct = (cab.drawerPct || 85) / 100;
    const drwH = Math.round((H * drwPct) / cab.drawers);
    add(name + ' — Drawer Front', iW, drwH, cab.drawers);
    const boxH = drwH - 20;
    const boxD = D - 40;
    add(name + ' — Drawer Side', boxD, boxH, cab.drawers * 2);
    add(name + ' — Drawer F/B', Math.max(0, iW - 2*T), boxH, cab.drawers * 2);
    add(name + ' — Drawer Base', Math.max(0, iW - 2*T), boxD, cab.drawers);
  }
  const shelfCount = (cab.shelves||0) + (cab.adjShelves||0) + (cab.looseShelves||0);
  if (shelfCount > 0) add(name + ' — Shelf', iW, D - T, shelfCount);
  if (cab.partitions > 0) add(name + ' — Partition', H, D, cab.partitions);
  if (cab.endPanels > 0) add(name + ' — End Panel', H, D, cab.endPanels);
  return parts;
}

// Apply a built parts list to the cut list under a chosen merge strategy:
//   'merge' — identical parts (same label + w + h + grain) bump existing qty;
//             non-matching parts are appended as new rows.
//   'new'   — every part becomes a new row (prior behaviour).
// Extra fields on the part (material, notes, edgeBand) are carried onto newly-added pieces.
function _applyCabinetParts(parts, mode) {
  const key = p => `${p.label}|${p.w}|${p.h}|${p.grain||'none'}`;
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

// Prompt user to merge or add-as-new when a parts list has duplicates in the cut list.
// If there are no duplicates, parts are added straight away with no prompt.
function _clPromptMergeOrNew(parts, name) {
  const key = p => `${p.label}|${p.w}|${p.h}|${p.grain||'none'}`;
  const existing = new Set(pieces.map(key));
  const dupCount = parts.filter(c => existing.has(key(c))).length;

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

// Explode a saved cabinet into individual cut list pieces.
// If any parts match existing cut-list rows, prompt the user to merge or add as new.
function _clLoadCabinetParts(libIdx) {
  const cab = cqLibrary[libIdx];
  if (!cab) return;
  const name = cab._libName || cab.name || 'Cabinet';
  _clPromptMergeOrNew(_cabinetPartsList(cab), name);
}

// Save current cut parts as a cabinet library entry
function _clSaveToCabinetLibrary() {
  if (!pieces.length) { _toast('No cut parts to save', 'error'); return; }
  const projName = _byId('cl-project')?.value?.trim() || '';
  const defaultName = projName || `Cut List ${new Date().toLocaleDateString()}`;
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Save to Cabinet Library</div>
      <button class="popup-close" onclick="_closePopup()">×</button>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">Template Name</label><input class="pf-input pf-input-lg" id="pcl-name" value="${_escHtml(defaultName)}"></div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">${pieces.length} cut parts will be saved as a reusable template.</div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_confirmSaveCLToCabLib()">Save Template</button>
    </div>
  `, 'sm');
  setTimeout(() => { const i = _byId('pcl-name'); if (i) { i.focus(); i.select(); } }, 50);
}

function _confirmSaveCLToCabLib() {
  const name = _popupVal('pcl-name');
  if (!name) { _toast('Name is required', 'error'); return; }
  // Create a lightweight cabinet library entry that stores cut parts directly
  const entry = cqDefaultLine();
  entry.id = Date.now();
  entry._libName = name;
  entry.name = name;
  // Store cut parts snapshot
  entry._cutParts = pieces.filter(p => p.enabled !== false).map(p => ({
    label: p.label, w: p.w, h: p.h, qty: p.qty, grain: p.grain || 'none', material: p.material || '', notes: p.notes || '', edgeBand: p.edgeBand || 'none'
  }));
  // Estimate dims from largest part
  const maxW = Math.max(...pieces.map(p => Math.max(p.w, p.h)), 600);
  const maxD = Math.max(...pieces.map(p => Math.min(p.w, p.h)), 560);
  entry.w = maxW; entry.h = maxW; entry.d = maxD;
  cqLibrary.push(entry);
  _closePopup();
  _toast(`"${name}" saved to cabinet library`, 'success');
  _saveCabinetToDB(entry).then(id => { if (id) entry.db_id = id; });
}

// Override _clLoadCabinetParts to also handle entries with _cutParts
const _clLoadCabinetParts_orig = _clLoadCabinetParts;
// @ts-expect-error reassigning a function-declared global to extend its behaviour
_clLoadCabinetParts = function(libIdx) {
  const cab = cqLibrary[libIdx];
  if (!cab) return;
  if (cab._cutParts && cab._cutParts.length) {
    const name = cab._libName || cab.name || 'Cabinet';
    _clPromptMergeOrNew(cab._cutParts, name);
    return;
  }
  // Otherwise explode from cabinet dimensions
  _clLoadCabinetParts_orig(libIdx);
};

function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function printCQQuote(mode) {
  if (!cqLines.length) { _toast('Add cabinet lines first.', 'error'); return; }
  if (mode === 'pdf') {
    // Build a synthetic quote object for the jsPDF builder
    const gMat = cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0);
    const gLabour = cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0);
    const cabNotes = cqLines.map(l => {
      const desc = l.name || 'Cabinet';
      const details = [l.w+'\u00d7'+l.h+'\u00d7'+l.d+'mm', l.material];
      if (l.doors > 0) details.push(l.doors + ' door' + (l.doors!==1?'s':''));
      if (l.drawers > 0) details.push(l.drawers + ' drawer' + (l.drawers!==1?'s':''));
      if (l.qty > 1) details.push('x' + l.qty);
      return desc + ' \u2014 ' + details.join(', ');
    }).join('\n');
    _buildQuotePDF({
      id: Date.now(), client: '', project: 'Cabinet Quote',
      materials: gMat, labour: gLabour,
      markup: cqSettings.markup, tax: cqSettings.tax,
      status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
      notes: cabNotes
    });
    return;
  }
  const cur = window.currency;
  const fmt = v => cur + Number(v).toFixed(2);
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const biz = getBizInfo();
  const client = _byId('cq-client')?.value?.trim() || '';
  const project = _byId('cq-project')?.value?.trim() || '';
  const notes = _byId('cq-notes')?.value?.trim() || '';
  const quoteNum = _byId('cq-quote-num')?.value?.trim() || ('CQ-' + Date.now().toString(36).toUpperCase());

  let grandMat = 0, grandLabour = 0, grandHw = 0, grandSub = 0;
  let lineNum = 0, lastRoom = null;
  const hasRooms = cqLines.some(l => l.room);
  const lineRows = cqLines.map((line) => {
    const c = calcCQLine(line);
    grandMat += c.matCost * line.qty;
    grandLabour += c.labourCost * line.qty;
    grandHw += c.hwCost * line.qty;
    grandSub += c.lineSubtotal;
    lineNum++;
    let roomHeader = '';
    if (hasRooms && line.room !== lastRoom) {
      lastRoom = line.room;
      roomHeader = `<tr><td colspan="5" style="padding:10px 10px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#888;background:#f8f8f8;border-bottom:1px solid #e0e0e0">${_escHtml(line.room || 'Other')}</td></tr>`;
    }
    return roomHeader + `<tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#555">${lineNum}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0"><strong>${_escHtml(line.name || 'Cabinet')}</strong><br><span style="font-size:10px;color:#999">${line.w}&times;${line.h}&times;${line.d}mm &middot; ${_escHtml(line.material)}</span>
      ${line.doors>0?'<br><span style="font-size:10px;color:#999">'+line.doors+' door(s)</span>':''}
      ${line.drawers>0?'<br><span style="font-size:10px;color:#999">'+line.drawers+' drawer(s)</span>':''}
      ${line.shelves+line.adjShelves>0?'<br><span style="font-size:10px;color:#999">'+(line.shelves+line.adjShelves)+' shelf/shelves</span>':''}
      ${line.hwItems.length>0?'<br><span style="font-size:10px;color:#999">HW: '+line.hwItems.map(h=>_escHtml(h.name)+' x'+h.qty).join(', ')+'</span>':''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center">${line.qty}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-variant-numeric:tabular-nums">${fmt(c.matCost + c.labourCost + c.hwCost)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmt0(c.lineSubtotal)}</td>
    </tr>`;
  }).join('');

  const markupAmt = grandSub * cqSettings.markup / 100;
  const afterMarkup = grandSub + markupAmt;
  const taxAmt = afterMarkup * cqSettings.tax / 100;
  const grandTotal = afterMarkup + taxAmt;

  const pdfHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quote ${quoteNum} - ${project}</title>
<style>
  @page { size:A4; margin:14mm 16mm; }
  * { margin:0;padding:0;box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; line-height:1.5; }
  .hdr { display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #111;margin-bottom:24px; }
  .biz-name { font-size:18px;font-weight:800;letter-spacing:-.3px; }
  .biz-contact { font-size:10px;color:#777;margin-top:4px;line-height:1.7; }
  .doc-right { text-align:right; }
  .doc-word { font-size:26px;font-weight:200;letter-spacing:3px;text-transform:uppercase;color:#222; }
  .doc-num { font-size:11px;color:#888;margin-top:4px; }
  .bill-row { display:flex;gap:40px;margin-bottom:22px; }
  .bill-block label { font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:#bbb;display:block;margin-bottom:4px;border-bottom:1px solid #eee;padding-bottom:3px; }
  .bill-block .name { font-size:15px;font-weight:700; }
  table { width:100%;border-collapse:collapse;margin-bottom:4px; }
  thead tr { border-bottom:1.5px solid #111; }
  thead th { font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888;padding:6px 10px;text-align:left; }
  thead th.r { text-align:right; }
  .total-box { display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;padding:12px 16px;border-radius:6px;margin-top:8px; }
  .total-label { font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;opacity:.7; }
  .total-amount { font-size:24px;font-weight:800;letter-spacing:-.4px; }
  .breakdown { display:flex;gap:24px;margin-top:14px;padding:12px 16px;background:#f8f8f8;border-radius:6px; }
  .bd-item { flex:1; }
  .bd-label { font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#aaa;margin-bottom:2px; }
  .bd-val { font-size:14px;font-weight:700; }
  .notes-box { margin-top:18px;background:#f8f8f8;border-radius:6px;padding:14px 16px; }
  .notes-box label { font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:#aaa;display:block;margin-bottom:6px; }
  .notes-box p { font-size:12px;color:#333;line-height:1.6; }
  .validity { margin-top:16px;font-size:10px;color:#aaa; }
  .acceptance { margin-top:28px;padding-top:16px;border-top:1px solid #e0e0e0; }
  .acceptance-title { font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#555;margin-bottom:10px; }
  .acceptance-text { font-size:11px;color:#777;margin-bottom:18px;line-height:1.5; }
  .sig-grid { display:grid;grid-template-columns:2fr 1fr;gap:28px; }
  .sig-field { border-bottom:1.5px solid #ccc;padding-top:28px; }
  .sig-label { font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#bbb;margin-top:4px; }
  .footer { margin-top:30px;display:flex;justify-content:space-between;font-size:8px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px; }
</style></head><body>
<div class="hdr">
  <div><div class="biz-name">${biz.name||'Your Business'}</div><div class="biz-contact">${[biz.phone,biz.email,biz.address,biz.abn?'ABN: '+biz.abn:''].filter(Boolean).join('<br>')}</div></div>
  <div class="doc-right"><div class="doc-word">Quotation</div><div class="doc-num">#${quoteNum} &bull; ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div>
</div>
<div class="bill-row">
  <div class="bill-block"><label>Prepared for</label><div class="name">${_escHtml(client)||'—'}</div></div>
  <div class="bill-block"><label>Project</label><div class="name" style="font-size:14px">${_escHtml(project)||'—'}</div></div>
</div>
<table>
  <thead><tr><th>#</th><th>Description</th><th style="text-align:center">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr></thead>
  <tbody>${lineRows}</tbody>
</table>
<div class="breakdown">
  <div class="bd-item"><div class="bd-label">Materials</div><div class="bd-val">${fmt0(grandMat)}</div></div>
  <div class="bd-item"><div class="bd-label">Labour</div><div class="bd-val">${fmt0(grandLabour)}</div></div>
  <div class="bd-item"><div class="bd-label">Hardware</div><div class="bd-val">${fmt0(grandHw)}</div></div>
  <div class="bd-item"><div class="bd-label">Subtotal</div><div class="bd-val">${fmt0(grandSub)}</div></div>
  ${cqSettings.markup>0?'<div class="bd-item"><div class="bd-label">Markup ('+cqSettings.markup+'%)</div><div class="bd-val">+'+fmt0(markupAmt)+'</div></div>':''}
  ${cqSettings.tax>0?'<div class="bd-item"><div class="bd-label">Tax ('+cqSettings.tax+'%)</div><div class="bd-val">+'+fmt0(taxAmt)+'</div></div>':''}
</div>
<div class="total-box"><div class="total-label">Total Amount Due</div><div class="total-amount">${fmt0(grandTotal)}</div></div>
${cqSettings.deposit > 0 && cqSettings.deposit < 100 ? `<div style="display:flex;gap:20px;margin-top:8px;padding:10px 16px;background:#f0f7ff;border:1px solid #c8ddf5;border-radius:6px">
  <div><div style="font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#6b8db5;margin-bottom:1px">Deposit Required (${cqSettings.deposit}%)</div><div style="font-size:16px;font-weight:800">${fmt0(grandTotal * cqSettings.deposit / 100)}</div></div>
  <div><div style="font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#6b8db5;margin-bottom:1px">Balance on Completion</div><div style="font-size:16px;font-weight:800">${fmt0(grandTotal * (1 - cqSettings.deposit / 100))}</div></div>
</div>` : ''}
${notes?'<div class="notes-box"><label>Scope &amp; Notes</label><p>'+_escHtml(notes).replace(/\\n/g,'<br>')+'</p></div>':''}
<div class="validity">This quote is valid for 30 days from the date of issue. Prices are subject to change after this period.${cqSettings.deposit > 0 && cqSettings.deposit < 100 ? ' A deposit of ' + cqSettings.deposit + '% is required upon acceptance to commence work.' : ''}</div>
<div class="acceptance">
  <div class="acceptance-title">Acceptance</div>
  <div class="acceptance-text">To accept this quotation, please sign below and return a copy to ${biz.name||'us'}${biz.email?' at '+biz.email:''}.</div>
  <div class="sig-grid"><div><div class="sig-field"></div><div class="sig-label">Client Signature</div></div><div><div class="sig-field"></div><div class="sig-label">Date</div></div></div>
</div>
<div class="footer"><span>${biz.name||'ProCabinet'} — Generated by ProCabinet.App</span><span>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span></div>
</body></html>`;

  _saveAsPDF(pdfHtml);
}

// ── Copy summary to clipboard ──
function copyCQSummary() {
  if (!cqLines.length) { _toast('No items to copy.', 'error'); return; }
  const cur = window.currency;
  const client = _byId('cq-client')?.value?.trim() || '';
  const project = _byId('cq-project')?.value?.trim() || '';
  let grandSub = 0;
  const lineTexts = cqLines.map((line, i) => {
    const c = calcCQLine(line);
    grandSub += c.lineSubtotal;
    return `${i+1}. ${line.name||line.type} (${line.w}x${line.h}x${line.d}mm) x${line.qty} — ${cur}${Math.round(c.lineSubtotal)}`;
  });
  const markupAmt = grandSub * cqSettings.markup / 100;
  const taxAmt = (grandSub + markupAmt) * cqSettings.tax / 100;
  const grandTotal = grandSub + markupAmt + taxAmt;
  const depositAmt = grandTotal * cqSettings.deposit / 100;

  const text = [
    client || project ? `${client}${project ? ' — ' + project : ''}` : 'Cabinet Quote',
    '─'.repeat(30),
    ...lineTexts,
    '─'.repeat(30),
    `Subtotal: ${cur}${Math.round(grandSub)}`,
    cqSettings.markup > 0 ? `Markup (${cqSettings.markup}%): +${cur}${Math.round(markupAmt)}` : '',
    cqSettings.tax > 0 ? `Tax (${cqSettings.tax}%): +${cur}${Math.round(taxAmt)}` : '',
    `TOTAL: ${cur}${Math.round(grandTotal)}`,
    cqSettings.deposit > 0 && cqSettings.deposit < 100 ? `Deposit (${cqSettings.deposit}%): ${cur}${Math.round(depositAmt)}` : '',
  ].filter(Boolean).join('\n');

  navigator.clipboard.writeText(text).then(() => _toast('Summary copied to clipboard', 'success')).catch(() => _toast('Copy failed', 'error'));
}

// ── Send to Quick Quote ──
function cqSendToQuickQuote() {
  if (!cqLines.length) { _toast('Add cabinet lines first.', 'error'); return; }
  const grandSub = cqLines.reduce((s, l) => s + calcCQLine(l).lineSubtotal, 0);
  const matTotal = cqLines.reduce((s, l) => s + calcCQLine(l).matCost * l.qty, 0);
  const labourTotal = cqLines.reduce((s, l) => s + calcCQLine(l).labourCost * l.qty, 0);
  const client = _byId('cq-client')?.value?.trim() || '';
  const project = _byId('cq-project')?.value?.trim() || '';

  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  inp('q-client').value = client;
  inp('q-project').value = project;
  inp('q-materials').value = matTotal.toFixed(2);
  inp('q-labour-rate').value = String(cqSettings.labourRate);
  const totalHrs = cqLines.reduce((s, l) => s + calcCQLine(l).labourHrs * l.qty, 0);
  inp('q-hours').value = totalHrs.toFixed(1);
  inp('q-markup').value = String(cqSettings.markup);
  inp('q-tax').value = String(cqSettings.tax);
  inp('q-notes').value = 'Cabinet Quote: ' + cqLines.map(l => (l.name || 'Cabinet') + (l.qty > 1 ? ' x' + l.qty : '')).join(', ');

  switchSection('quote');
  try { _updateQuotePreview(); } catch(e) {}
  _toast('Sent to Quote — review and create', 'success');
}

// ── Duplicate saved quote ──
function dupCQSavedQuote(idx) {
  const src = cqSavedQuotes[idx];
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = Date.now();
  copy.client = src.client + ' (copy)';
  copy.date = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  cqSavedQuotes.unshift(copy);
  saveCQSaved();
  renderCQSavedShelf();
  _toast('Quote duplicated', 'success');
}


// ── Init CQ ──
loadCQSettings();
loadCQLines();
loadCQSaved();
loadCQProjectLibrary();
loadStockLibraries();

