// ProCabinet — Cabinet Builder core (state, CRUD, persistence, quotes, print)
// Split R.1: calc in cabinet-calc.js, render in cabinet-render.js, library in cabinet-library.js.
// Loaded as the LAST of the four cabinet scripts (its init block calls into the others).

// ══════════════════════════════════════════
// CABINET BUILDER — State & Core Logic
// ══════════════════════════════════════════

// ── CB Settings State ──
/** @type {any} */
let cbSettings = {
  labourRate: 65, markup: 20, tax: 13, deposit: 50, edgingPerM: 3, materialMarkup: 0,
  // Production scheduler defaults (mirrors business_info.default_*)
  workdayHours: 8,
  weekdayHours: [8, 8, 8, 8, 8, 0, 0],   // Mon..Sun
  packagingHours: 0,
  contingencyHours: 0,
  queueStartDate: null,                   // ISO date string or null (= today)
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
    carcass: 1.5, door: 0.4, drawer: 0.6, shelf: 0.25, finishPerM2: 0.5,
  }
};

// ── Cabinet Library ──
/** @type {any[]} */
let cbLibrary = [];
/** @param {any} entry */
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
  } catch(e) { console.warn('[cabinet-template save]', (/** @type {any} */ (e)).message || e); return null; }
}
/** @param {number | null} dbId */
async function _deleteCabinetFromDB(dbId) {
  if (!_userId || !dbId) return;
  try {
    const { error } = await _db('cabinet_templates').delete().eq('id', dbId);
    if (error) console.warn('[cabinet-template delete]', error.message);
  } catch(e) { console.warn('[cabinet-template delete]', (/** @type {any} */ (e)).message || e); }
}
async function _loadCabinetTemplatesFromDB() {
  if (!_userId) return;
  try {
    const { data, error } = await _db('cabinet_templates').select('*').eq('user_id', _userId).order('name');
    if (error) { console.warn('[cabinet-template load]', error.message); return; }
    if (!data) return;
    cbLibrary = data.map(row => ({ .../** @type {Record<string, any>} */ (row.default_specs || {}), _libName: row.name, db_id: row.id }));
  } catch(e) { console.warn('[cabinet-template load]', (/** @type {any} */ (e)).message || e); }
}

// ── CB Line Items State ──
/** @type {any[]} */
let cbLines = [];
let cbNextId = 1;

// Scratchpad: ephemeral cabinet being configured (not yet in project)
/** @type {any} */
let cbScratchpad = null; // initialized in init block after cbDefaultLine is defined
let cbEditingLineIdx = -1; // -1 = new cabinet, >=0 = editing existing line

// Editing context for quote editing
/** @type {number|null} */
let cbEditingQuoteId = null;
/** @type {any[]|null} */
let cbEditingOriginalLines = null;

const CB_TYPES = ['Base Cabinet','Wall Cabinet','Tall Cabinet','Drawer Unit','Shelf Unit','Vanity','Island','Pantry','Custom'];

// ── Type Presets ──
const CB_PRESETS = {
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
/** @param {string} [type] */
function cbDefaultLine(type) {
  const preset = type ? /** @type {any} */ (CB_PRESETS)[type] : null;
  return {
    id: cbNextId++, name: type || '',
    w: preset?.w || 600, h: preset?.h || 720, d: preset?.d || 560, qty: 1,
    construction: 'overlay',
    baseType: 'plinth',
    material: cbSettings.materials[0]?.name || '',
    backMat: (cbSettings.materials.find(/** @param {any} m */ m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cbSettings.materials[0])?.name || '',
    finish: cbSettings.finishes?.[0]?.name || 'None',
    carcassType: cbSettings.carcassTypes?.[0]?.name || 'Standard',
    doors: preset?.doors || 0, doorPct: 95,
    doorMat: cbSettings.materials[0]?.name || '',
    doorType: cbSettings.doorTypes?.[0]?.name || 'Slab',
    drawers: preset?.drawers || 0, drawerPct: 0,
    drawerFrontMat: cbSettings.materials[0]?.name || '',
    drawerFrontType: cbSettings.drawerFrontTypes?.[0]?.name || 'Slab',
    drawerBoxType: cbSettings.drawerBoxTypes?.[0]?.name || 'Standard',
    drawerInnerMat: (cbSettings.materials.find(/** @param {any} m */ m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cbSettings.materials[0])?.name || '',
    shelves: preset?.shelves || 0, adjShelves: 0, looseShelves: 0, partitions: 0, endPanels: 0,
    hwItems: [],
    extras: [],
    labourHrs: 0, labourOverride: false,
    matCostOverride: null,
    notes: '', room: ''
  };
}

// ── Load / Save Settings ──
function loadCBSettings() {
  try { const s = localStorage.getItem('pc_cq_settings'); if (s) cbSettings = JSON.parse(s); } catch(e) {}
  if (!cbSettings.baseTypes || !cbSettings.baseTypes.length) cbSettings.baseTypes = [
    {name:'None',price:0},{name:'Plinth',price:20},{name:'Feet / Legs',price:40},{name:'Castors',price:60},{name:'Frame',price:30}
  ];
  if (!cbSettings.constructions || !cbSettings.constructions.length) cbSettings.constructions = [
    {name:'Overlay',price:0},{name:'Inset',price:25},{name:'Face Frame',price:35}
  ];
  // Power-law labour types — refHours per fixed reference geometry.
  // Reference units (constants in cabinet-calc.js): carcass 0.25 m³, door 0.216 m²,
  // drawer front 0.1296 m², drawer box 0.0752 m³ — all derived from a 600×720×580
  // standard cabinet at 50% door / 30% drawer pct.
  if (!cbSettings.carcassTypes || !cbSettings.carcassTypes.length) cbSettings.carcassTypes = [
    {name:'Standard',refHours:0.4}
  ];
  if (!cbSettings.doorTypes || !cbSettings.doorTypes.length) cbSettings.doorTypes = [
    {name:'Slab',refHours:0.4},{name:'Shaker',refHours:0.7},{name:'Vinyl-Wrapped',refHours:0.5},{name:'Integrated Handle',refHours:0.6}
  ];
  if (!cbSettings.drawerFrontTypes || !cbSettings.drawerFrontTypes.length) cbSettings.drawerFrontTypes = [
    {name:'Slab',refHours:0.3},{name:'Shaker',refHours:0.5}
  ];
  if (!cbSettings.drawerBoxTypes || !cbSettings.drawerBoxTypes.length) cbSettings.drawerBoxTypes = [
    {name:'Standard',refHours:0.8},{name:'Dovetail',refHours:1.2}
  ];
  if (!cbSettings.finishes || !cbSettings.finishes.length) cbSettings.finishes = [
    {name:'None',price:0},{name:'Oil (Osmo/Rubio)',price:12},{name:'Lacquer',price:18},{name:'Paint',price:22},{name:'Stain + Oil',price:15},{name:'Wax',price:8},{name:'2-Pack Spray',price:35}
  ];
  if (cbSettings.materialMarkup == null) cbSettings.materialMarkup = 0;
  if (!cbSettings.labourTimes) cbSettings.labourTimes = /** @type {any} */ ({});
  /** @type {any} */
  const _lt = cbSettings.labourTimes;
  if (!_lt.carcass) _lt.carcass = 1.5;
  // Power-law carcass scaling: hrs = refHours × (volume / refVolume)^exponent.
  // Sub-linear because most cabinet labour is surface work (cuts/edges/joints),
  // and surface scales as V^(2/3) for similar shapes.
  if (_lt.carcassRefVolume == null) _lt.carcassRefVolume = 0.25;
  if (_lt.carcassRefHours == null) _lt.carcassRefHours = 0.4;
  if (_lt.carcassExponent == null) _lt.carcassExponent = 0.7;
  if (!_lt.door) _lt.door = 0.4;
  if (!_lt.drawer) _lt.drawer = 0.6;
  if (!_lt.fixedShelf) _lt.fixedShelf = 0.3;
  if (!_lt.adjShelfHoles) _lt.adjShelfHoles = 0.4;
  if (!_lt.looseShelf) _lt.looseShelf = 0.2;
  if (!_lt.partition) _lt.partition = 0.5;
  if (!_lt.endPanel) _lt.endPanel = 0.3;
  if (!_lt.finishPerM2) _lt.finishPerM2 = 0.5;
  if (!cbSettings.edgeBanding) cbSettings.edgeBanding = [{name:'Iron-on Veneer',price:3},{name:'PVC 1mm',price:4},{name:'PVC 2mm',price:5},{name:'Solid Timber',price:8}];
}
function saveCBSettings() {
  // Rate inputs in My Rates panel mutate cbSettings directly via inline onblur
  // handlers (e.g. cbSettings.labourRate=parseFloat(this.value)). This function
  // persists the in-memory object to DB and a localStorage cache (the cache
  // covers fields not yet mirrored as business_info columns, e.g. materialMarkup).
  // Note: catalog_items sync removed — stock_items is now the single source of
  // truth for material/hardware/finish prices. cbSettings.materials/hardware/
  // finishes remain as in-memory fallbacks for items not yet in stock.
  try { localStorage.setItem('pc_cq_settings', JSON.stringify(cbSettings)); } catch(e) {}
  if (typeof _syncCBSettingsToDB === 'function') _syncCBSettingsToDB();
}

function addCBMaterial() { cbSettings.materials.push({name:'New Material',price:0}); saveCBSettings(); renderCBRates(); }
function addCBHardware() { cbSettings.hardware.push({name:'New Hardware',price:0}); saveCBSettings(); renderCBRates(); }
function addCBFinish() { if (!cbSettings.finishes) cbSettings.finishes = []; cbSettings.finishes.push({name:'New Finish',price:0}); saveCBSettings(); renderCBRates(); }

// ── Line Persistence ──
function loadCBLines() {
  try { const s = localStorage.getItem('pc_cq_lines'); if (s) { cbLines = JSON.parse(s); cbNextId = Math.max(0, ...cbLines.map(l=>l.id)) + 1; } } catch(e) {}
  setTimeout(() => {
    const pn = _byId('cb-project'); const saved = localStorage.getItem('pc_cq_project_name'); if (pn && saved) pn.value = saved;
    const cn = _byId('cb-client'); const savedC = localStorage.getItem('pc_cq_client_name'); if (cn && savedC) cn.value = savedC;
  }, 100);
  const eqId = localStorage.getItem('pc_cb_editing_quote_id');
  if (eqId) cbEditingQuoteId = parseInt(eqId, 10);
}
function saveCBLines() {
  const pn = _byId('cb-project');
  if (pn) localStorage.setItem('pc_cq_project_name', pn.value);
  const cn = _byId('cb-client');
  if (cn) localStorage.setItem('pc_cq_client_name', cn.value);
  _scheduleCBLinesSync();
}

function _getCBProjectId() {
  if (!_userId) return null;
  const pn = _byId('cb-project');
  if (!pn) return null;
  const name = pn.value.trim();
  if (!name) return null;
  const proj = projects.find(p => p.name === name);
  return proj ? proj.id : null;
}

async function _ensureCBProject() {
  const projId = _getCBProjectId();
  if (projId) return projId;
  if (!_userId) { _toast('Sign in to save cabinets', 'error'); return null; }
  const name = _byId('cb-project')?.value?.trim();
  if (!name) { _toast('Enter a project name first', 'error'); return null; }
  const clientName = _byId('cb-client')?.value?.trim() || '';
  const clientId = clientName ? await resolveClient(clientName) : null;
  const newId = await resolveProject(name, clientId);
  if (newId) _toast('Project "' + name + '" created', 'success');
  return newId;
}

/** @type {ReturnType<typeof setTimeout> | null} */
let _cbLinesSyncTimer = null;

function _scheduleCBLinesSync() {
  if (_cbLinesSyncTimer) clearTimeout(_cbLinesSyncTimer);
  _cbLinesSyncTimer = setTimeout(() => {
    _cbLinesSyncTimer = null;
    _syncCBLinesToDB();
  }, 800);
}

async function _syncCBLinesToDB() {
  if (cbEditingQuoteId) return _syncCBLinesToQuote(cbEditingQuoteId);
  const projectId = _getCBProjectId();
  if (!projectId) return;
  try {
    const draft = await _findOrCreateDraftQuote(projectId);
    if (!draft) return;
    // Only delete cabinet-kind rows; preserve any item/labour lines added
    // directly in the quote popup.
    await _db('quote_lines').delete().eq('quote_id', draft.id).eq('line_kind', 'cabinet');
    if (cbLines.length > 0) {
      /** @type {any[]} */
      const rows = cbLines.map((l, i) => _cbLineToRow(l, i, draft.id));
      await _db('quote_lines').insert(rows);
    }
  } catch (e) {
    console.warn('[cb dual-write]', (/** @type {any} */ (e)).message || e);
  }
}

/** @param {number} quoteId */
async function _syncCBLinesToQuote(quoteId) {
  try {
    // Only delete cabinet-kind rows; item/labour lines live alongside.
    await _db('quote_lines').delete().eq('quote_id', quoteId).eq('line_kind', 'cabinet');
    if (cbLines.length > 0) {
      /** @type {any[]} */
      const rows = cbLines.map((l, i) => _cbLineToRow(l, i, quoteId));
      await _db('quote_lines').insert(rows);
    }
    if (typeof _refreshQuoteTotals === 'function') await _refreshQuoteTotals(quoteId);
  } catch (e) {
    console.warn('[cb edit-quote sync]', (/** @type {any} */ (e)).message || e);
  }
}

async function _loadCBLinesFromDB() {
  if (!_userId) return;
  if (_cbLinesSyncTimer) return;
  if (cbEditingQuoteId && cbLines.length > 0) return;
  const editingId = localStorage.getItem('pc_cb_editing_quote_id');
  if (editingId) {
    const qId = parseInt(editingId, 10);
    const q = quotes.find(x => x.id === qId);
    if (q) {
      cbEditingQuoteId = qId;
      try {
        const { data: lines } = await _db('quote_lines').select('*').eq('quote_id', qId).order('position');
        if (lines && lines.length) {
          cbLines = lines.map(/** @param {any} row @param {number} i */ (row, i) => {
            const cb = /** @type {any} */ (_quoteLineRowToCB(row));
            cb.id = i + 1;
            return cb;
          });
          cbNextId = cbLines.length + 1;
          cbEditingOriginalLines = JSON.parse(JSON.stringify(cbLines));
        }
      } catch (e) {
        console.warn('[cb edit-restore]', (/** @type {any} */ (e)).message || e);
      }
      localStorage.removeItem('pc_cq_lines');
      if (typeof renderCBPanel === 'function') renderCBPanel();
      return;
    }
    localStorage.removeItem('pc_cb_editing_quote_id');
    cbEditingQuoteId = null;
  }
  const savedName = localStorage.getItem('pc_cq_project_name');
  if (!savedName) return;
  const proj = projects.find(p => p.name === savedName);
  if (!proj) return;
  const draft = quotes.find(q => q.project_id === proj.id && _isDraftQuote(q));
  if (!draft) return;
  try {
    const { data: lines, error } = await _db('quote_lines').select('*').eq('quote_id', draft.id).eq('line_kind', 'cabinet').order('position');
    if (error || !lines || lines.length === 0) return;
    cbLines = lines.map(/** @param {any} row @param {number} i */ (row, i) => {
      const cb = /** @type {any} */ (_quoteLineRowToCB(row));
      cb.id = i + 1;
      return cb;
    });
    cbNextId = cbLines.length + 1;
    localStorage.removeItem('pc_cq_lines');
    if (typeof renderCBPanel === 'function') renderCBPanel();
  } catch (e) {
    console.warn('[cb db-load]', (/** @type {any} */ (e)).message || e);
  }
}

// ── Scratchpad + CRUD ──
// The "+" button resets the scratchpad to a fresh cabinet in the sidebar editor.
// Cabinets only enter the project (viewer) when "Add to Project" is pressed.
function addCBLine() {
  cbScratchpad = cbDefaultLine();
  cbEditingLineIdx = -1;
  cbOpenSections.add(cbScratchpad.id + '-cab');
  renderCBEditor();
  _scrollCBEditorIntoView();
}
/** @param {string} type */
function addCBLineFromPreset(type) {
  cbScratchpad = cbDefaultLine(type);
  cbEditingLineIdx = -1;
  cbOpenSections.add(cbScratchpad.id + '-cab');
  renderCBEditor();
  _scrollCBEditorIntoView();
}

function _scrollCBEditorIntoView() {
  const el = document.getElementById('cb-cab-editor');
  if (!el) return;
  const sidebar = /** @type {HTMLElement|null} */ (el.closest('.sidebar-scroll'));
  if (sidebar) sidebar.scrollTop = el.offsetTop - sidebar.offsetTop;
}

// Commit scratchpad to project (Add to Project / Save Changes)
async function cbCommitToProject() {
  if (!cbScratchpad) return;
  if (!await _ensureCBProject()) return;

  if (cbEditingLineIdx >= 0 && cbLines[cbEditingLineIdx]) {
    // Save changes to existing line
    cbLines[cbEditingLineIdx] = JSON.parse(JSON.stringify(cbScratchpad));
    cbEditingLineIdx = -1;
    cbScratchpad = cbDefaultLine();
    saveCBLines();
    renderCBPanel();
    _toast('Cabinet updated', 'success');
  } else {
    // Add new cabinet to project
    const copy = JSON.parse(JSON.stringify(cbScratchpad));
    copy.id = cbNextId++;
    cbLines.push(copy);
    cbEditingLineIdx = -1;
    cbScratchpad = cbDefaultLine();
    saveCBLines();
    renderCBPanel();
    _toast('Cabinet added to project', 'success');
  }
}

function cbCancelEdit() {
  cbEditingLineIdx = -1;
  cbScratchpad = cbDefaultLine();
  renderCBEditor();
  renderCBResults();
}

/** @param {number} idx @param {number} dir */
function cbStepLineQty(idx, dir) {
  const line = cbLines[idx];
  if (!line) return;
  line.qty = Math.max(1, (parseFloat(line.qty) || 1) + dir);
  if (cbEditingLineIdx === idx && cbScratchpad) cbScratchpad.qty = line.qty;
  saveCBLines();
  renderCBPanel();
}

/** @param {number} idx @param {any} val */
function cbSetLineQty(idx, val) {
  const line = cbLines[idx];
  if (!line) return;
  line.qty = Math.max(1, parseFloat(val) || 1);
  if (cbEditingLineIdx === idx && cbScratchpad) cbScratchpad.qty = line.qty;
  saveCBLines();
  renderCBPanel();
}

/** @param {number} id */
function removeCBLine(id) {
  cbLines = cbLines.filter(l => l.id !== id);
  if (cbEditingLineIdx >= cbLines.length) cbEditingLineIdx = -1;
  saveCBLines(); renderCBPanel();
}
/** @param {number} id */
function dupCBLine(id) {
  const src = cbLines.find(l => l.id === id);
  if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = cbNextId++;
  cbLines.push(copy);
  saveCBLines(); renderCBPanel();
}
/** @param {number} id @param {number} dir */
function moveCBLine(id, dir) {
  const idx = cbLines.findIndex(l => l.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= cbLines.length) return;
  [cbLines[idx], cbLines[newIdx]] = [cbLines[newIdx], cbLines[idx]];
  saveCBLines(); renderCBPanel();
}

// ── Field updates (scratchpad only — no DB sync) ──
/** @param {string} field @param {number} dir */
function cbStepField(field, dir) {
  if (!cbScratchpad) return;
  const cur = parseFloat(cbScratchpad[field]) || 0;
  const min = (field === 'qty') ? 1 : 0;
  cbScratchpad[field] = Math.max(min, cur + dir);
  // Steppers can change door/drawer/shelf counts which restructure the editor body
  renderCBEditor();
  renderCBResults();
}

/** @param {string} field @param {any} val */
function cbUpdateField(field, val) {
  if (!cbScratchpad) return;
  const numFields = ['w','h','d','qty','doors','drawers','shelves','adjShelves','endPanels','looseShelves','partitions','labourHrs','doorPct','drawerPct'];
  if (numFields.includes(field)) {
    cbScratchpad[field] = parseFloat(val) || 0;
  } else {
    cbScratchpad[field] = val;
  }
  // Targeted update of section header live costs (preserves input focus)
  _refreshCBLiveCosts();
  renderCBResults();
  // Re-render editor only when the change restructures the body
  if (['doors','drawers','construction','baseType','finish'].includes(field)) renderCBEditor();
}

// Clamp doorPct + drawerPct ≤ 100. Updates the OTHER pct to preserve the constraint
// without surprising the user (just trims headroom on the partner section).
/** @param {string} field @param {any} val */
function cbUpdatePct(field, val) {
  if (!cbScratchpad) return;
  const v = Math.max(0, Math.min(100, parseFloat(val) || 0));
  cbScratchpad[field] = v;
  const partner = field === 'doorPct' ? 'drawerPct' : 'doorPct';
  const partnerVal = parseFloat(cbScratchpad[partner]) || 0;
  if (v + partnerVal > 100) cbScratchpad[partner] = 100 - v;
  _refreshCBLiveCosts();
  renderCBResults();
  renderCBEditor();
}

// ── Hardware CRUD on scratchpad ──
/** @param {number} lineId @param {number} idx @param {string} field @param {any} val */
function updateCBHw(lineId, idx, field, val) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l => l.id === lineId);
  if (!line || !line.hwItems[idx]) return;
  if (field === 'qty') line.hwItems[idx].qty = parseInt(val) || 1;
  else line.hwItems[idx].name = val;
  if (cbEditingLineIdx >= 0) saveCBLines();
  renderCBEditor(); renderCBResults();
}
/** @param {number} lineId @param {number} idx */
function removeCBHw(lineId, idx) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l => l.id === lineId);
  if (!line) return;
  line.hwItems.splice(idx, 1);
  if (cbEditingLineIdx >= 0) saveCBLines();
  renderCBEditor(); renderCBResults();
}

// ── Extras CRUD ──
/** @param {number} lineId */
function cbAddExtra(lineId) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l=>l.id===lineId);
  if (!line) return;
  if (!line.extras) line.extras = [];
  line.extras.push({label:'',cost:0});
  renderCBEditor();
}
/** @param {number} lineId @param {number} idx @param {string} field @param {any} val */
function cbUpdateExtra(lineId, idx, field, val) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l=>l.id===lineId);
  if (!line || !line.extras || !line.extras[idx]) return;
  if (field==='cost') line.extras[idx].cost = parseFloat(val)||0;
  else line.extras[idx].label = val;
  renderCBResults();
}
/** @param {number} lineId @param {number} idx */
function cbRemoveExtra(lineId, idx) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l=>l.id===lineId);
  if (!line || !line.extras) return;
  line.extras.splice(idx,1);
  renderCBEditor(); renderCBResults();
}

// ── Quote Creation & Editing ──
async function cbCreateQuoteFromDraft() {
  if (!cbLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!_userId) { _toast('Sign in to create a quote', 'error'); return; }
  // Free-tier cap: count only customer-facing quotes (drafts don't count).
  const customerQuotes = quotes.filter(q => typeof _isDraftQuote === 'function' ? !_isDraftQuote(q) : true);
  if (!_enforceFreeLimit('quotes', customerQuotes.length)) return;
  const projectId = await _ensureCBProject();
  if (!projectId) return;

  const clientName = _byId('cb-client')?.value?.trim() || '';
  const clientId = clientName ? await resolveClient(clientName) : null;
  const projName = _byId('cb-project')?.value?.trim() || '';

  // Line items are stored as real quote_lines rows; no need to mirror the
  // cabinet specs into a notes blob (the popup renders rows directly).
  /** @type {any} */
  const insertBody = {
    user_id: _userId, project_id: projectId, client_id: clientId,
    markup: cbSettings.markup ?? 0, tax: cbSettings.tax ?? 0,
    status: 'draft', date: new Date().toISOString().slice(0, 10), notes: ''
  };
  const { data, error } = await _db('quotes').insert(insertBody).select().single();
  if (error || !data) { _toast('Could not create quote: ' + (error?.message || ''), 'error'); return; }
  quotes.unshift(data);

  /** @type {any[]} */
  const lineRows = cbLines.map((l, i) => _cbLineToRow(l, i, data.id));
  if (lineRows.length) await _db('quote_lines').insert(lineRows);
  if (typeof _refreshQuoteTotals === 'function') await _refreshQuoteTotals(data.id);

  _toast('Quote created for "' + projName + '" - view in Quotes tab', 'success');
  if (typeof renderQuoteMain === 'function') renderQuoteMain();
  renderCBPanel();
}

/** @param {number} quoteId */
async function editQuoteInCB(quoteId) {
  if (!_userId) { _toast('Sign in to edit a quote', 'error'); return; }
  const q = quotes.find(x => x.id === quoteId);
  if (!q) { _toast('Quote not found', 'error'); return; }

  const { data: lines, error } = await _db('quote_lines')
    .select('*').eq('quote_id', quoteId).eq('line_kind', 'cabinet').order('position');
  if (error) { _toast('Could not load quote lines', 'error'); return; }

  if (_cbLinesSyncTimer) { clearTimeout(_cbLinesSyncTimer); _cbLinesSyncTimer = null; }

  cbLines = (lines || []).map(/** @param {any} row @param {number} i */ (row, i) => {
    const cb = /** @type {any} */ (_quoteLineRowToCB(row));
    cb.id = i + 1;
    return cb;
  });
  cbNextId = cbLines.length + 1;

  cbEditingQuoteId = quoteId;
  cbEditingOriginalLines = JSON.parse(JSON.stringify(cbLines));
  localStorage.setItem('pc_cb_editing_quote_id', String(quoteId));

  const projName = quoteProject(q);
  const clientName = quoteClient(q);
  const pn = _byId('cb-project'); if (pn) pn.value = projName;
  const cn = _byId('cb-client'); if (cn) cn.value = clientName;
  if (projName) localStorage.setItem('pc_cq_project_name', projName);
  if (clientName) localStorage.setItem('pc_cq_client_name', clientName);

  cbEditingLineIdx = -1;
  cbScratchpad = cbDefaultLine();
  switchSection('cabinet');
  renderCBPanel();
  _toast('Editing quote - changes save automatically', 'info');
}

async function finishEditingQuote() {
  if (_cbLinesSyncTimer) { clearTimeout(_cbLinesSyncTimer); _cbLinesSyncTimer = null; }
  if (cbEditingQuoteId) await _syncCBLinesToQuote(cbEditingQuoteId);
  cbEditingQuoteId = null;
  cbEditingOriginalLines = null;
  localStorage.removeItem('pc_cb_editing_quote_id');
  cbLines = [];
  cbNextId = 1;
  await _loadCBLinesFromDB();
  renderCBPanel();
  _toast('Quote saved', 'success');
}

function discardQuoteEdits() {
  if (cbEditingQuoteId == null) return;
  /** @type {number} */
  const qId = cbEditingQuoteId;
  /** @type {any[]} */
  const orig = cbEditingOriginalLines || [];
  _confirm('Discard changes to this quote?', async () => {
    if (_cbLinesSyncTimer) { clearTimeout(_cbLinesSyncTimer); _cbLinesSyncTimer = null; }
    try {
      await _db('quote_lines').delete().eq('quote_id', qId);
      if (orig.length > 0) {
        /** @type {any[]} */
        const rows = orig.map((l, i) => _cbLineToRow(l, i, qId));
        await _db('quote_lines').insert(rows);
      }
      if (typeof _refreshQuoteTotals === 'function') await _refreshQuoteTotals(qId);
    } catch (e) {
      console.warn('[cb discard]', (/** @type {any} */ (e)).message || e);
    }
    cbEditingQuoteId = null;
    cbEditingOriginalLines = null;
    localStorage.removeItem('pc_cb_editing_quote_id');
    cbLines = [];
    cbNextId = 1;
    await _loadCBLinesFromDB();
    renderCBPanel();
    _toast('Changes discarded', 'info');
  });
}

// Legacy stubs
function cbAddToNewQuote() { cbCreateQuoteFromDraft(); }
function cbAddToExistingQuote() { cbCreateQuoteFromDraft(); }
/** @param {number} _qi */
async function _cbApplyToQuote(_qi) { return; }

function cbConvertToOrder() {
  const client = _byId('cb-client')?.value?.trim() || 'Cabinet Client';
  const project = _byId('cb-project')?.value?.trim() || 'Cabinet Project';
  if (!cbLines.length) { _toast('Add cabinet lines first.', 'error'); return; }
  const grandSubtotal = cbLines.reduce((s, l) => s + calcCBLine(l).lineSubtotal, 0);
  /** @type {any} */
  const row = {
    user_id: _userId, client, project,
    materials: cbLines.reduce(/** @param {number} s @param {any} l */ (s, l) => s + calcCBLine(l).matCost * l.qty, 0),
    labour: cbLines.reduce(/** @param {number} s @param {any} l */ (s, l) => s + calcCBLine(l).labourCost * l.qty, 0),
    markup: cbSettings.markup, tax: cbSettings.tax,
    status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
    notes: 'Cabinet Quote: ' + cbLines.map(l => l.name || 'Cabinet').filter(Boolean).join(', '),
  };
  if (_userId) {
    _db('quotes').insert(row).select().single().then(({data, error}) => {
      if (error || !data) { _toast('Could not save quote: ' + (error?.message||''), 'error'); return; }
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

/** @param {any} s */
function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/** @param {string} [mode] */
function printCBQuote(mode) {
  if (!cbLines.length) { _toast('Add cabinet lines first.', 'error'); return; }
  if (mode === 'pdf') {
    // Build pseudo quote_lines rows so the PDF renders proper line items
    // even from the in-memory cabinet builder preview path.
    const previewRows = cbLines.map((l, i) => Object.assign(_cbLineToRow(l, i, 0), { line_kind: 'cabinet' }));
    _buildQuotePDF({
      id: Date.now(), client: '', project: 'Cabinet Quote',
      markup: cbSettings.markup, tax: cbSettings.tax,
      status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
      notes: ''
    }, previewRows);
    return;
  }
  const cur = window.currency;
  /** @param {any} v */
  const fmt = v => cur + Number(v).toFixed(2);
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();
  const biz = getBizInfo();
  const client = _byId('cb-client')?.value?.trim() || '';
  const project = _byId('cb-project')?.value?.trim() || '';
  const notes = _byId('cb-notes')?.value?.trim() || '';
  const quoteNum = _byId('cb-quote-num')?.value?.trim() || ('CB-' + Date.now().toString(36).toUpperCase());

  let grandMat = 0, grandLabour = 0, grandHw = 0, grandSub = 0;
  /** @type {string | null} */
  let lastRoom = null;
  let lineNum = 0;
  const hasRooms = cbLines.some(l => l.room);
  const lineRows = cbLines.map(/** @param {any} line */ (line) => {
    const c = calcCBLine(line);
    grandMat += c.matCost * line.qty; grandLabour += c.labourCost * line.qty; grandHw += c.hwCost * line.qty; grandSub += c.lineSubtotal;
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
      ${line.hwItems.length>0?'<br><span style="font-size:10px;color:#999">HW: '+line.hwItems.map(/** @param {any} h */ h=>_escHtml(h.name)+' x'+h.qty).join(', ')+'</span>':''}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:center">${line.qty}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-variant-numeric:tabular-nums">${fmt(c.matCost + c.labourCost + c.hwCost)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${fmt0(c.lineSubtotal)}</td>
    </tr>`;
  }).join('');

  const markupAmt = grandSub * cbSettings.markup / 100;
  const afterMarkup = grandSub + markupAmt;
  const taxAmt = afterMarkup * cbSettings.tax / 100;
  const grandTotal = afterMarkup + taxAmt;

  const pdfHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quote ${quoteNum} - ${project}</title>
<style>@page{size:A4;margin:14mm 16mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;font-size:12px;line-height:1.5}.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:12px;border-bottom:3px solid #111;margin-bottom:24px}.biz-name{font-size:18px;font-weight:800;letter-spacing:-.3px}.biz-contact{font-size:10px;color:#777;margin-top:4px;line-height:1.7}.doc-right{text-align:right}.doc-word{font-size:26px;font-weight:200;letter-spacing:3px;text-transform:uppercase;color:#222}.doc-num{font-size:11px;color:#888;margin-top:4px}.bill-row{display:flex;gap:40px;margin-bottom:22px}.bill-block label{font-size:8px;text-transform:uppercase;letter-spacing:.7px;color:#bbb;display:block;margin-bottom:4px;border-bottom:1px solid #eee;padding-bottom:3px}.bill-block .name{font-size:15px;font-weight:700}table{width:100%;border-collapse:collapse;margin-bottom:4px}thead tr{border-bottom:1.5px solid #111}thead th{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888;padding:6px 10px;text-align:left}thead th.r{text-align:right}.total-box{display:flex;justify-content:space-between;align-items:center;background:#111;color:#fff;padding:12px 16px;border-radius:6px;margin-top:8px}.total-label{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;opacity:.7}.total-amount{font-size:24px;font-weight:800;letter-spacing:-.4px}.breakdown{display:flex;gap:24px;margin-top:14px;padding:12px 16px;background:#f8f8f8;border-radius:6px}.bd-item{flex:1}.bd-label{font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#aaa;margin-bottom:2px}.bd-val{font-size:14px;font-weight:700}.validity{margin-top:16px;font-size:10px;color:#aaa}.acceptance{margin-top:28px;padding-top:16px;border-top:1px solid #e0e0e0}.acceptance-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:#555;margin-bottom:10px}.acceptance-text{font-size:11px;color:#777;margin-bottom:18px;line-height:1.5}.sig-grid{display:grid;grid-template-columns:2fr 1fr;gap:28px}.sig-field{border-bottom:1.5px solid #ccc;padding-top:28px}.sig-label{font-size:8px;text-transform:uppercase;letter-spacing:.5px;color:#bbb;margin-top:4px}.footer{margin-top:30px;display:flex;justify-content:space-between;font-size:8px;color:#ccc;border-top:1px solid #f0f0f0;padding-top:8px}</style></head><body>
<div class="hdr"><div><div class="biz-name">${biz.name||'Your Business'}</div><div class="biz-contact">${[biz.phone,biz.email,biz.address,biz.abn?'ABN: '+biz.abn:''].filter(Boolean).join('<br>')}</div></div><div class="doc-right"><div class="doc-word">Quotation</div><div class="doc-num">#${quoteNum} &bull; ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div></div></div>
<div class="bill-row"><div class="bill-block"><label>Prepared for</label><div class="name">${_escHtml(client)||'—'}</div></div><div class="bill-block"><label>Project</label><div class="name" style="font-size:14px">${_escHtml(project)||'—'}</div></div></div>
<table><thead><tr><th>#</th><th>Description</th><th style="text-align:center">Qty</th><th class="r">Unit Price</th><th class="r">Total</th></tr></thead><tbody>${lineRows}</tbody></table>
<div class="breakdown"><div class="bd-item"><div class="bd-label">Materials</div><div class="bd-val">${fmt0(grandMat)}</div></div><div class="bd-item"><div class="bd-label">Labour</div><div class="bd-val">${fmt0(grandLabour)}</div></div><div class="bd-item"><div class="bd-label">Hardware</div><div class="bd-val">${fmt0(grandHw)}</div></div><div class="bd-item"><div class="bd-label">Subtotal</div><div class="bd-val">${fmt0(grandSub)}</div></div>${cbSettings.markup>0?'<div class="bd-item"><div class="bd-label">Markup ('+cbSettings.markup+'%)</div><div class="bd-val">+'+fmt0(markupAmt)+'</div></div>':''}${cbSettings.tax>0?'<div class="bd-item"><div class="bd-label">Tax ('+cbSettings.tax+'%)</div><div class="bd-val">+'+fmt0(taxAmt)+'</div></div>':''}</div>
<div class="total-box"><div class="total-label">Total Amount Due</div><div class="total-amount">${fmt0(grandTotal)}</div></div>
${cbSettings.deposit > 0 && cbSettings.deposit < 100 ? `<div style="display:flex;gap:20px;margin-top:8px;padding:10px 16px;background:#f0f7ff;border:1px solid #c8ddf5;border-radius:6px"><div><div style="font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#6b8db5;margin-bottom:1px">Deposit Required (${cbSettings.deposit}%)</div><div style="font-size:16px;font-weight:800">${fmt0(grandTotal * cbSettings.deposit / 100)}</div></div><div><div style="font-size:8px;text-transform:uppercase;letter-spacing:.6px;color:#6b8db5;margin-bottom:1px">Balance on Completion</div><div style="font-size:16px;font-weight:800">${fmt0(grandTotal * (1 - cbSettings.deposit / 100))}</div></div></div>` : ''}
${notes?'<div class="notes-box"><label>Scope &amp; Notes</label><p>'+_escHtml(notes).replace(/\\n/g,'<br>')+'</p></div>':''}
<div class="validity">This quote is valid for 30 days from the date of issue.${cbSettings.deposit > 0 && cbSettings.deposit < 100 ? ' A deposit of ' + cbSettings.deposit + '% is required upon acceptance.' : ''}</div>
<div class="acceptance"><div class="acceptance-title">Acceptance</div><div class="acceptance-text">To accept this quotation, please sign below and return a copy to ${biz.name||'us'}${biz.email?' at '+biz.email:''}.</div><div class="sig-grid"><div><div class="sig-field"></div><div class="sig-label">Client Signature</div></div><div><div class="sig-field"></div><div class="sig-label">Date</div></div></div></div>
<div class="footer"><span>${biz.name||'ProCabinet'} — Generated by ProCabinet.App</span><span>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span></div>
</body></html>`;

  _saveAsPDF(pdfHtml);
}

function copyCBSummary() {
  if (!cbLines.length) { _toast('No items to copy.', 'error'); return; }
  const cur = window.currency;
  const client = _byId('cb-client')?.value?.trim() || '';
  const project = _byId('cb-project')?.value?.trim() || '';
  let grandSub = 0;
  const lineTexts = cbLines.map((line, i) => {
    const c = calcCBLine(line);
    grandSub += c.lineSubtotal;
    return `${i+1}. ${line.name||line.type} (${line.w}x${line.h}x${line.d}mm) x${line.qty} — ${cur}${Math.round(c.lineSubtotal)}`;
  });
  const markupAmt = grandSub * cbSettings.markup / 100;
  const taxAmt = (grandSub + markupAmt) * cbSettings.tax / 100;
  const grandTotal = grandSub + markupAmt + taxAmt;
  const depositAmt = grandTotal * cbSettings.deposit / 100;

  const text = [
    client || project ? `${client}${project ? ' — ' + project : ''}` : 'Cabinet Quote',
    '─'.repeat(30), ...lineTexts, '─'.repeat(30),
    `Subtotal: ${cur}${Math.round(grandSub)}`,
    cbSettings.markup > 0 ? `Markup (${cbSettings.markup}%): +${cur}${Math.round(markupAmt)}` : '',
    cbSettings.tax > 0 ? `Tax (${cbSettings.tax}%): +${cur}${Math.round(taxAmt)}` : '',
    `TOTAL: ${cur}${Math.round(grandTotal)}`,
    cbSettings.deposit > 0 && cbSettings.deposit < 100 ? `Deposit (${cbSettings.deposit}%): ${cur}${Math.round(depositAmt)}` : '',
  ].filter(Boolean).join('\n');

  navigator.clipboard.writeText(text).then(() => _toast('Summary copied to clipboard', 'success')).catch(() => _toast('Copy failed', 'error'));
}

// (cbSendToQuickQuote was removed alongside the aggregate Materials/Labour
// inputs on the quote sidebar. Use cbCreateQuoteFromDraft() to materialise
// the current cabinet lines as a real quote.)

// ── Init CB ──
loadCBSettings();
loadCBLines();
loadStockLibraries();
cbScratchpad = cbDefaultLine();
