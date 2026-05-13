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
  contingencyPct: 5,
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
/** @param {number | null} dbId @param {any} entry */
async function _updateCabinetInDB(dbId, entry) {
  if (!_userId || !dbId) return;
  try {
    const { error } = await _db('cabinet_templates').update({
      name: entry._libName || entry.name || 'Cabinet',
      default_w_mm: entry.w || null,
      default_h_mm: entry.h || null,
      default_d_mm: entry.d || null,
      default_specs: entry,
    }).eq('id', dbId);
    if (error) console.warn('[cabinet-template update]', error.message);
  } catch(e) { console.warn('[cabinet-template update]', (/** @type {any} */ (e)).message || e); }
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
let cbEditingLibraryIdx = -1; // -1 = not editing library entry, >=0 = editing cbLibrary[idx]

// Editing context for quote editing
/** @type {number|null} */
let cbEditingQuoteId = null;
/** @type {any[]|null} */
let cbEditingOriginalLines = null;
// Editing context for direct order editing (sister of cbEditingQuoteId).
// Only one of cbEditingQuoteId / cbEditingOrderId is non-null at a time.
/** @type {number|null} */
let cbEditingOrderId = null;

// Client-state tracking — F5: re-keyed from project_id to client_id.
// _cbCurrentClientId scopes the active design canvas to a client; the
// workspace quote is the most recent 'designing' status quote for this client.
/** @type {number | null} */
let _cbCurrentClientId = null;
let _cbCurrentClientName = '';
let _cbDirty = false;
let _cbSuppressDirty = false;

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

// ── Auto-name helper ──
/** Compute the next sequential "Cabinet N" name for the active scope.
 *  @param {boolean} [libraryMode] true = scan cbLibrary; false = scan cbLines.
 *  @returns {string} */
function _cbNextCabinetName(libraryMode) {
  /** @type {any[]} */
  const scope = libraryMode ? (typeof cbLibrary !== 'undefined' ? cbLibrary : []) : cbLines;
  let max = 0;
  for (const c of scope) {
    const n = libraryMode ? (c._libName || c.name || '') : (c.name || '');
    const m = String(n).match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'Cabinet ' + (max + 1);
}
/** @type {any} */ (window)._cbNextCabinetName = _cbNextCabinetName;

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
    doorFinish: cbSettings.finishes?.[0]?.name || 'None',
    drawers: preset?.drawers || 0, drawerPct: 0,
    drawerFrontMat: cbSettings.materials[0]?.name || '',
    drawerFrontType: cbSettings.drawerFrontTypes?.[0]?.name || 'Slab',
    drawerFrontFinish: cbSettings.finishes?.[0]?.name || 'None',
    drawerBoxType: cbSettings.drawerBoxTypes?.[0]?.name || 'Standard',
    drawerBoxFinish: cbSettings.finishes?.[0]?.name || 'None',
    drawerInnerMat: (cbSettings.materials.find(/** @param {any} m */ m=>m.name.toLowerCase().includes('3mm') || m.name.toLowerCase().includes('back')) || cbSettings.materials[0])?.name || '',
    shelves: preset?.shelves || 0, adjShelves: 0, looseShelves: 0, partitions: 0, endPanels: 0,
    hwItems: [],
    doorHwItems: [],
    drawerHwItems: [],
    extras: [],
    labourHrs: 0, labourOverride: false,
    matCostOverride: null,
    notes: '', room: ''
  };
}

// ── Load / Save Settings ──
function loadCBSettings() {
  try { const s = localStorage.getItem('pc_cq_settings'); if (s) cbSettings = JSON.parse(s); } catch(e) {}
  if (typeof cbSettings.contingencyPct !== 'number') cbSettings.contingencyPct = 5;
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
  // Migration: cb-client input was removed; clear stale client name so future
  // readers can't accidentally pick up the orphan key.
  localStorage.removeItem('pc_cq_client_name');
  setTimeout(() => {
    const pn = _byId('cb-client'); const saved = localStorage.getItem('pc_cq_client_name');
    if (pn && saved) /** @type {HTMLInputElement} */ (pn).value = saved;
  }, 100);
  const eqId = localStorage.getItem('pc_cb_editing_quote_id');
  if (eqId) cbEditingQuoteId = parseInt(eqId, 10);
}
function saveCBLines() {
  const pn = _byId('cb-client');
  if (pn) localStorage.setItem('pc_cq_client_name', /** @type {HTMLInputElement} */ (pn).value);
  _scheduleCBLinesSync();
  if (_cbCurrentClientId && !_cbDirty && !_cbSuppressDirty && !cbEditingQuoteId) {
    _setCbDirty(true);
  }
}

function _getCBClientId() {
  if (!_userId) return null;
  if (_cbCurrentClientId) return _cbCurrentClientId;
  const pn = _byId('cb-client');
  if (!pn) return null;
  const name = pn.value.trim();
  if (!name) return null;
  const cli = clients.find(c => c.name === name);
  return cli ? cli.id : null;
}

async function _ensureCBClient() {
  const cliId = _getCBClientId();
  if (cliId) return cliId;
  if (!_userId) { _toast('Sign in to save cabinets', 'error'); return null; }
  const name = _cbCurrentClientName || (/** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '');
  if (!name) { _toast('Pick a client first', 'error'); return null; }
  const newId = await resolveClient(name);
  if (newId) _toast('Client "' + name + '" created', 'success');
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
  // Strategy C: wrap all three dispatch paths so the save pill cycles
  // through saving → saved/failed regardless of which target the cabinet
  // editor is bound to (project draft, an open quote, or an open order).
  /** @type {any} */ const w = window;
  if (!w._saveInFlight) w._saveInFlight = new Set();
  w._saveInFlight.add('cabinet');
  if (typeof _setSaveStatus === 'function') _setSaveStatus('cabinet', 'saving');
  try {
    if (cbEditingOrderId) {
      await _syncCBLinesToOrder(cbEditingOrderId);
    } else if (cbEditingQuoteId) {
      await _syncCBLinesToQuote(cbEditingQuoteId);
    } else {
      const clientId = _getCBClientId();
      if (clientId) {
        const draft = await _findOrCreateDraftQuote(clientId);
        if (draft) {
          // Only delete cabinet-kind rows; preserve any item/labour lines added
          // directly in the quote popup.
          await _db('quote_lines').delete().eq('quote_id', draft.id).eq('line_kind', 'cabinet');
          if (cbLines.length > 0) {
            /** @type {any[]} */
            const rows = cbLines.map((l, i) => _cbLineToRow(l, i, draft.id));
            await _db('quote_lines').insert(rows);
          }
        }
      }
    }
    _cbDirty = false;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('cabinet', 'saved');
  } catch (e) {
    console.warn('[cb dual-write]', (/** @type {any} */ (e)).message || e);
    if (typeof _setSaveStatus === 'function') _setSaveStatus('cabinet', 'failed', { retry: _syncCBLinesToDB });
    _toast('Save failed — check connection', 'error');
  } finally {
    w._saveInFlight.delete('cabinet');
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

/** Sister of _syncCBLinesToQuote — writes cabinet rows to order_lines and
 *  refreshes the order's value snapshot.
 *  @param {number} orderId */
async function _syncCBLinesToOrder(orderId) {
  try {
    await _db('order_lines').delete().eq('order_id', orderId).eq('line_kind', 'cabinet');
    if (cbLines.length > 0) {
      /** @type {any[]} */
      const rows = cbLines.map((l, i) => {
        const r = /** @type {any} */ (_cbLineToRow(l, i, 0));
        delete r.quote_id;
        r.order_id = orderId;
        return r;
      });
      await _db('order_lines').insert(rows);
    }
    if (typeof orderTotalsFromLines === 'function') {
      const t = await orderTotalsFromLines(orderId);
      const o = orders.find(x => x.id === orderId);
      if (o && t) {
        const value = Math.round((t.materials + t.labour) * (1 + (o.markup || 0) / 100) * (1 + (o.tax || 0) / 100));
        /** @type {any} */ (o).value = value;
        await _db('orders').update(/** @type {any} */ ({ value })).eq('id', orderId);
      }
    }
  } catch (e) {
    console.warn('[cb edit-order sync]', (/** @type {any} */ (e)).message || e);
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
  // F5: localStorage workspace key migrated from project name to client name.
  const savedName = localStorage.getItem('pc_cq_client_name') || localStorage.getItem('pc_cq_client_name');
  if (!savedName) return;
  const cli = clients.find(c => c.name === savedName);
  if (!cli) {
    localStorage.removeItem('pc_cq_client_name');
    localStorage.removeItem('pc_cq_client_name');
    _cbCurrentClientId = null;
    _cbCurrentClientName = '';
    return;
  }
  _cbCurrentClientId = cli.id;
  _cbCurrentClientName = cli.name;
  const draft = quotes.find(q => q.client_id === cli.id && _isDraftQuote(q));
  if (!draft) {
    if (typeof renderCBPanel === 'function') renderCBPanel();
    return;
  }
  try {
    const { data: lines, error } = await _db('quote_lines').select('*').eq('quote_id', draft.id).eq('line_kind', 'cabinet').order('position');
    if (error || !lines || lines.length === 0) {
      if (typeof renderCBPanel === 'function') renderCBPanel();
      return;
    }
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

// ── CRUD ──
// The "+" button creates a new cabinet directly in cbLines (live row, no
// scratchpad staging) and points the editor at it. Edits autosave via the
// 800 ms debounced sync in saveCBLines().
function addCBLine() {
  const fresh = cbDefaultLine();
  fresh.name = _cbNextCabinetName(false);
  cbLines.push(fresh);
  cbEditingLineIdx = cbLines.length - 1;
  cbScratchpad = fresh; // reference into cbLines, NOT a copy
  cbOpenSections.add(fresh.id + '-cab');
  saveCBLines();
  renderCBPanel();
  _scrollCBEditorIntoView();
  if (typeof switchCBMainView === 'function') switchCBMainView('results');
}
/** @param {string} type */
function addCBLineFromPreset(type) {
  const fresh = cbDefaultLine(type);
  fresh.name = _cbNextCabinetName(false);
  cbLines.push(fresh);
  cbEditingLineIdx = cbLines.length - 1;
  cbScratchpad = fresh;
  cbOpenSections.add(fresh.id + '-cab');
  saveCBLines();
  renderCBPanel();
  _scrollCBEditorIntoView();
  if (typeof switchCBMainView === 'function') switchCBMainView('results');
}

function _scrollCBEditorIntoView() {
  const el = document.getElementById('cb-cab-editor');
  if (!el) return;
  const sidebar = /** @type {HTMLElement|null} */ (el.closest('.sidebar-scroll'));
  if (sidebar) sidebar.scrollTop = el.offsetTop - sidebar.offsetTop;
}

// (cbCommitToProject / cbCancelEdit removed — autosave makes them obsolete.
// Edits flow live to cbLines[cbEditingLineIdx] via cbUpdateField.)

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

/** Wrapped delete-by-index used from cabinet card buttons. Resets the
 *  active editor reference if the deleted row was the one being edited.
 *  @param {number} idx */
function _cbConfirmDeleteLine(idx) {
  _confirm('Delete this cabinet?', () => {
    if (idx < 0 || idx >= cbLines.length) return;
    cbLines.splice(idx, 1);
    if (cbEditingLineIdx === idx) {
      cbEditingLineIdx = -1;
      cbScratchpad = null;
    } else if (cbEditingLineIdx > idx) {
      cbEditingLineIdx--;
      cbScratchpad = cbLines[cbEditingLineIdx] || null;
    }
    saveCBLines();
    renderCBPanel();
    _toast('Cabinet deleted', 'success');
  });
}
/** @type {any} */ (window)._cbConfirmDeleteLine = _cbConfirmDeleteLine;

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
  if (typeof switchCBMainView === 'function') switchCBMainView('results');
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

// ── Field updates ──
// cbScratchpad references the active live row (cbLines[i] or cbLibrary[i]).
// Mutations flow straight to that row; autosave fires via _cbScheduleAutosave.
/** @param {string} field @param {number} dir */
function cbStepField(field, dir) {
  if (!cbScratchpad) return;
  const cur = parseFloat(cbScratchpad[field]) || 0;
  const min = (field === 'qty') ? 1 : 0;
  cbScratchpad[field] = Math.max(min, cur + dir);
  // Steppers can change door/drawer/shelf counts which restructure the editor body
  renderCBEditor();
  renderCBResults();
  _cbScheduleAutosave();
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
  _cbScheduleAutosave();
}

/** Route autosave to either the project sync (cbLines) or the library DB
 *  (cabinet_templates), depending on whether the active line is a library
 *  entry or a project row. */
function _cbScheduleAutosave() {
  if (cbEditingLibraryIdx >= 0 && cbScratchpad) {
    // Library editing: debounced write to cabinet_templates row.
    const target = /** @type {any} */ (cbScratchpad);
    if (_cbLibSaveTimer) clearTimeout(_cbLibSaveTimer);
    _cbLibSaveTimer = setTimeout(() => {
      _cbLibSaveTimer = null;
      // Keep _libName in sync with name when the user edits the search input.
      if (target.name && !target._libName) target._libName = target.name;
      if (target.db_id && typeof _updateCabinetInDB === 'function') {
        /** @type {any} */ (window)._updateCabinetInDB(target.db_id, target);
      } else if (typeof _saveCabinetToDB === 'function') {
        /** @type {any} */ (window)._saveCabinetToDB(target).then((/** @type {any} */ id) => { if (id) target.db_id = id; });
      }
    }, 800);
    return;
  }
  // Project editing: existing dirty-flag path triggers _scheduleCBLinesSync.
  if (typeof saveCBLines === 'function') saveCBLines();
}

/** @type {ReturnType<typeof setTimeout> | null} */
let _cbLibSaveTimer = null;

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
  _cbScheduleAutosave();
}

// ── Hardware CRUD on scratchpad ──
// scope = 'cabinet' | 'door' | 'drawer' (default 'cabinet' for back-compat).
/** @param {string} scope */
function _hwListKey(scope) {
  if (scope === 'door') return 'doorHwItems';
  if (scope === 'drawer') return 'drawerHwItems';
  return 'hwItems';
}
/** @param {any} line @param {string} scope */
function _hwList(line, scope) {
  const key = _hwListKey(scope);
  if (!Array.isArray(line[key])) line[key] = [];
  return line[key];
}
/** @param {number} lineId @param {number} idx @param {string} field @param {any} val @param {string} [scope] */
function updateCBHw(lineId, idx, field, val, scope) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l => l.id === lineId);
  if (!line) return;
  const list = _hwList(line, scope || 'cabinet');
  if (!list[idx]) return;
  if (field === 'qty') list[idx].qty = parseInt(val) || 1;
  else list[idx].name = val;
  _cbScheduleAutosave();
  renderCBEditor(); renderCBResults();
}
/** @param {number} lineId @param {number} idx @param {string} [scope] */
function removeCBHw(lineId, idx, scope) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l => l.id === lineId);
  if (!line) return;
  const list = _hwList(line, scope || 'cabinet');
  list.splice(idx, 1);
  _cbScheduleAutosave();
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
  _cbScheduleAutosave();
}
/** @param {number} lineId @param {number} idx @param {string} field @param {any} val */
function cbUpdateExtra(lineId, idx, field, val) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l=>l.id===lineId);
  if (!line || !line.extras || !line.extras[idx]) return;
  if (field==='cost') line.extras[idx].cost = parseFloat(val)||0;
  else line.extras[idx].label = val;
  renderCBResults();
  _cbScheduleAutosave();
}
/** @param {number} lineId @param {number} idx */
function cbRemoveExtra(lineId, idx) {
  const line = cbScratchpad && cbScratchpad.id === lineId ? cbScratchpad : cbLines.find(l=>l.id===lineId);
  if (!line || !line.extras) return;
  line.extras.splice(idx,1);
  renderCBEditor(); renderCBResults();
}

// ── Quote Creation & Editing ──

// Picker icons mirror the top nav-tab SVGs (kept in sync with index.html).
const _PICKER_ICON_QUOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
const _PICKER_ICON_ORDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
const _PICKER_ICON_CABINET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';

/** Entry point for the "Send to Quote" button. If existing customer-facing
 *  quotes exist for the current client, prompts the user to pick one (or
 *  create a new quote). If none exist, creates a new quote directly. */
function cbSendToQuote() {
  if (!cbLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!_userId) { _toast('Sign in to save', 'error'); return; }

  const cliName = _cbCurrentClientName || (/** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '');
  const cli = _cbCurrentClientId
    ? clients.find(c => c.id === _cbCurrentClientId)
    : clients.find(c => c.name === cliName);
  const existing = cli
    ? quotes.filter(q => q.client_id === cli.id && !_isDraftQuote(q))
    : [];

  if (existing.length === 0) { cbCreateQuoteFromDraft(); return; }

  const items = existing.map(q => ({
    title: q.name || quoteClient(q) || 'No name',
    icon: _PICKER_ICON_QUOTE,
    metaPills: [{ label: q.status || 'draft', tone: q.status || 'draft' }],
    metaText: q.date ? '· ' + q.date : '',
    onPick: `cbSendCabinetsToExistingQuote(${q.id})`,
  }));

  _openPickerPopup({
    title: 'Send to Quote',
    hint: `${existing.length} existing quote${existing.length===1?'':'s'} for &ldquo;${_escHtml(cliName)}&rdquo;. Choose one to update, or create a new quote.`,
    items,
    createLabel: '+ Create New Quote',
    onCreate: '_closePopup();cbCreateQuoteFromDraft()',
    size: 'md',
  });
}

/** @param {number} quoteId */
async function cbSendCabinetsToExistingQuote(quoteId) {
  _closePopup();
  const q = quotes.find(x => x.id === quoteId);
  if (!q) { _toast('Quote not found', 'error'); return; }
  await _syncCBLinesToQuote(quoteId);
  if (typeof _refreshQuoteTotals === 'function') await _refreshQuoteTotals(quoteId);
  if (typeof renderQuoteMain === 'function') renderQuoteMain();
  switchSection('quote');
  _toast(`Cabinets sent to quote for "${quoteClient(q) || 'client'}"`, 'success');
}

async function cbCreateQuoteFromDraft() {
  if (!cbLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!_userId) { _toast('Sign in to create a quote', 'error'); return; }
  // Free-tier cap: count only customer-facing quotes (drafts don't count).
  const customerQuotes = quotes.filter(q => typeof _isDraftQuote === 'function' ? !_isDraftQuote(q) : true);
  if (!_enforceFreeLimit('quotes', customerQuotes.length)) return;
  const clientId = await _ensureCBClient();
  if (!clientId) return;

  const cliName = _cbCurrentClientName || (/** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '');

  // Line items are stored as real quote_lines rows; no need to mirror the
  // cabinet specs into a notes blob (the popup renders rows directly).
  /** @type {any} */
  const insertBody = {
    user_id: _userId, client_id: clientId,
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

  _toast('Quote created for "' + cliName + '"', 'success');
  _setCbDirty(false);
  if (typeof renderQuoteMain === 'function') renderQuoteMain();
  renderCBPanel();
  switchSection('quote');
}

// ── Order Creation (mirror of Quote flow) ──

/** Entry point for the "Send to Order" button. If existing orders exist for
 *  the current project, prompts the user to pick one (or create a new order).
 *  If none exist, creates a new order directly. */
function cbSendToOrder() {
  if (!cbLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!_userId) { _toast('Sign in to save', 'error'); return; }

  const cliName = _cbCurrentClientName || (/** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '');
  const cli = _cbCurrentClientId
    ? clients.find(c => c.id === _cbCurrentClientId)
    : clients.find(c => c.name === cliName);
  const existing = cli
    ? orders.filter(o => o.client_id === cli.id)
    : [];

  if (existing.length === 0) { cbCreateOrderFromDraft(); return; }

  const items = existing.map(o => {
    const num = o.order_number ? '#' + o.order_number + ' · ' : '';
    return {
      title: num + (orderClient(o) || 'No client'),
      icon: _PICKER_ICON_ORDER,
      metaPills: [{ label: o.status || 'quote', tone: o.status || 'quote' }],
      metaText: 'due ' + (o.due || 'TBD'),
      onPick: `cbSendCabinetsToExistingOrder(${o.id})`,
    };
  });

  _openPickerPopup({
    title: 'Send to Order',
    hint: `${existing.length} existing order${existing.length===1?'':'s'} for &ldquo;${_escHtml(cliName)}&rdquo;. Choose one to update, or create a new order.`,
    items,
    createLabel: '+ Create New Order',
    onCreate: '_closePopup();cbCreateOrderFromDraft()',
    size: 'md',
  });
}

/** @param {number} orderId */
async function cbSendCabinetsToExistingOrder(orderId) {
  _closePopup();
  const o = orders.find(x => x.id === orderId);
  if (!o) { _toast('Order not found', 'error'); return; }
  await _syncCBLinesToOrder(orderId);
  if (typeof renderOrdersMain === 'function') renderOrdersMain();
  switchSection('orders');
  _toast(`Cabinets sent to order for "${orderClient(o) || 'client'}"`, 'success');
}

async function cbCreateOrderFromDraft() {
  if (!cbLines.length) { _toast('Add cabinets first.', 'error'); return; }
  if (!_userId) { _toast('Sign in to create an order', 'error'); return; }
  if (!_enforceFreeLimit('orders', orders.length)) return;
  const clientId = await _ensureCBClient();
  if (!clientId) return;

  const cliName = _cbCurrentClientName || (/** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '');

  /** @type {any} */
  const insertBody = {
    user_id: _userId, client_id: clientId,
    value: 0,
    status: 'quote',
    markup: cbSettings.markup ?? 0,
    tax: cbSettings.tax ?? 0,
    due: 'TBD',
    order_number: typeof _nextOrderNumber === 'function' ? _nextOrderNumber() : null,
  };
  const { data, error } = await _dbInsertSafe('orders', insertBody);
  if (error || !data) { _toast('Could not create order: ' + (error?.message || ''), 'error'); return; }
  orders.unshift(data);

  await _syncCBLinesToOrder(data.id);

  _toast('Order created for "' + cliName + '"', 'success');
  if (typeof _oBadge === 'function') _oBadge();
  if (typeof renderOrdersMain === 'function') renderOrdersMain();
  renderCBPanel();
  switchSection('orders');
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
  const pn = _byId('cb-client'); if (pn) /** @type {HTMLInputElement} */ (pn).value = projName;
  if (projName) localStorage.setItem('pc_cq_client_name', projName);

  cbEditingLineIdx = -1;
  cbScratchpad = null;
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
  _setCbDirty(false);
  renderCBPanel();
  _toast('Quote saved', 'success');
}

/** Cabinet Builder editing pointed at an order. Mirrors editQuoteInCB but
 *  reads/writes order_lines.
 *  @param {number} orderId */
async function editOrderInCB(orderId) {
  if (!_userId) { _toast('Sign in to edit an order', 'error'); return; }
  const o = orders.find(x => x.id === orderId);
  if (!o) { _toast('Order not found', 'error'); return; }

  const { data: lines, error } = await _db('order_lines')
    .select('*').eq('order_id', orderId).eq('line_kind', 'cabinet').order('position');
  if (error) { _toast('Could not load order lines', 'error'); return; }

  if (_cbLinesSyncTimer) { clearTimeout(_cbLinesSyncTimer); _cbLinesSyncTimer = null; }

  cbLines = (lines || []).map(/** @param {any} row @param {number} i */ (row, i) => {
    const cb = /** @type {any} */ (_quoteLineRowToCB(row));
    cb.id = i + 1;
    return cb;
  });
  cbNextId = cbLines.length + 1;

  cbEditingOrderId = orderId;
  cbEditingQuoteId = null;
  cbEditingOriginalLines = JSON.parse(JSON.stringify(cbLines));
  localStorage.setItem('pc_cb_editing_order_id', String(orderId));
  localStorage.removeItem('pc_cb_editing_quote_id');

  const projName = (typeof orderProject === 'function') ? orderProject(o) : '';
  const pn = _byId('cb-client'); if (pn) /** @type {HTMLInputElement} */ (pn).value = projName;
  if (projName) localStorage.setItem('pc_cq_client_name', projName);

  cbEditingLineIdx = -1;
  cbScratchpad = null;
  switchSection('cabinet');
  renderCBPanel();
  _toast('Editing order — cabinets save automatically', 'info');
}

async function finishEditingOrder() {
  if (_cbLinesSyncTimer) { clearTimeout(_cbLinesSyncTimer); _cbLinesSyncTimer = null; }
  if (cbEditingOrderId) await _syncCBLinesToOrder(cbEditingOrderId);
  cbEditingOrderId = null;
  cbEditingOriginalLines = null;
  localStorage.removeItem('pc_cb_editing_order_id');
  cbLines = [];
  cbNextId = 1;
  await _loadCBLinesFromDB();
  _setCbDirty(false);
  renderCBPanel();
  _toast('Order saved', 'success');
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
  const client = _cbClientNameForProject() || 'Cabinet Client';
  const project = /** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || 'Cabinet Project';
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
// F6 (2026-05-13): _clProjectCache removed alongside the projects entity.

/** @param {any} s */
function _escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function copyCBSummary() {
  if (!cbLines.length) { _toast('No items to copy.', 'error'); return; }
  const cur = window.currency;
  const client = _cbClientNameForProject();
  const project = /** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '';
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

// ── CLIENT-STATE TRACKING (F5: was project-keyed) ──
// The cabinet builder's workspace is keyed to the active client directly.
// These helpers just resolve _cbCurrentClientId (or the input value) to a
// client name / id, kept under their legacy names for caller back-compat.
function _cbClientNameForProject() {
  if (_cbCurrentClientName) return _cbCurrentClientName;
  const name = /** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '';
  return name;
}

function _cbClientIdForProject() {
  if (_cbCurrentClientId) return _cbCurrentClientId;
  const name = /** @type {HTMLInputElement|null} */ (_byId('cb-client'))?.value?.trim() || '';
  if (!name) return null;
  const cli = clients.find(c => c.name === name);
  return cli ? cli.id : null;
}

/** @param {boolean} dirty */
function _setCbDirty(dirty) {
  _cbDirty = !!dirty;
  _renderCbCurrentProject();
  // Strategy C: surface dirty state immediately; the 800 ms debounced sync
  // will overwrite it with 'saving' once it fires.
  if (typeof _setSaveStatus === 'function') {
    _setSaveStatus('cabinet', _cbDirty ? 'dirty' : 'clean');
  }
}

function _renderCbCurrentProject() {
  // Strategy 2: project context block now owns the empty/in-project rendering.
  // Delegating keeps the dirty-pill update path identical to before.
  _cbRenderContext();
}

// SVG icon for the Cabinet Library project-style header (item 8).
const _CB_LIBRARY_ICON = '<svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/><path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/></svg>';

/**
 * Strategy 2: render either the project-empty state or the Idea-3 project
 * header into #cb-context, and toggle the tabs (Builder / My Rates) which
 * are only visible when a project is active.
 */
function _cbRenderContext() {
  const ctx = _byId('cb-context');
  const tabsWrap = _byId('cb-tabs-wrap');
  const sb = _byId('cb-sidebar');
  if (!ctx) return;
  if (!_cbCurrentClientId) {
    // Library editing works without a client — when the user is mid-edit,
    // surface a header reading "Cabinet Library" with the cabinet icon.
    // The sidebar editor stays open.
    const editingLib = (typeof cbEditingLibraryIdx !== 'undefined' && cbEditingLibraryIdx >= 0);
    if (tabsWrap) tabsWrap.style.display = 'none';
    if (sb) sb.style.display = editingLib ? '' : 'none';
    if (editingLib) {
      ctx.innerHTML = _renderProjectHeader('cabinet', {
        name: 'Cabinet Library',
        exitFn: '_cbExitLibraryEdit',
        iconSvg: _CB_LIBRARY_ICON,
      });
      return;
    }
    // Empty state — pick a client to start designing.
    const recents = (typeof clients !== 'undefined' ? clients : [])
      .slice()
      .sort(/** @param {any} a @param {any} b */ (a, b) => {
        const av = a.updated_at ? +new Date(a.updated_at) : (a.id || 0);
        const bv = b.updated_at ? +new Date(b.updated_at) : (b.id || 0);
        return bv - av;
      })
      .slice(0, 5);
    ctx.innerHTML = `<div class="project-empty">
      <svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
      <h3>Cabinet Builder</h3>
      <p>Pick a client to start designing cabinets.</p>
      <div style="position:relative;text-align:left">
        <div class="smart-input-wrap">
          <input type="text" id="cb-empty-picker" placeholder="Search or add client..." autocomplete="off"
            oninput="_smartCBEmptyClientSuggest(this,'cb-empty-suggest')"
            onfocus="_smartCBEmptyClientSuggest(this,'cb-empty-suggest')"
            onblur="setTimeout(()=>{const b=document.getElementById('cb-empty-suggest'); if(b)b.style.display='none'},150)">
          <div class="smart-input-add" onclick="_openNewClientPopup('cb-empty-picker')" title="New client">+</div>
        </div>
        <div id="cb-empty-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      ${recents.length ? `<div class="pe-recent-list">
        <div class="pe-recent-label">Recent clients</div>
        ${recents.map(/** @param {any} c */ c => `<div class="pe-recent-item" onclick="_cbPickClient(${c.id})">
          <span class="pe-ri-icon">${_TYPE_ICON_CLIENT}</span>
          <span>${_escHtml(c.name)}</span>
        </div>`).join('')}
      </div>` : ''}
    </div>`;
    return;
  }
  if (tabsWrap) tabsWrap.style.display = '';
  if (sb) sb.style.display = '';
  ctx.innerHTML = _renderProjectHeader('cabinet', {
    name: _cbCurrentClientName,
    exitFn: '_exitClient_cabinet',
  });
  // If we entered with dirty=true, surface the pill state immediately.
  if (typeof _setSaveStatus === 'function') {
    if (_cbDirty) _setSaveStatus('cabinet', 'dirty');
  }
}

/** Exit the open cabinet editor back to the cabinet sub-gate (recent + Add).
 *  In library-edit mode, defers to _cbExitLibraryEdit (which exits library
 *  mode entirely — there is no library sub-gate). */
function _cbExitCabinet() {
  if (typeof cbEditingLibraryIdx !== 'undefined' && cbEditingLibraryIdx >= 0
      && typeof /** @type {any} */ (window)._cbExitLibraryEdit === 'function') {
    /** @type {any} */ (window)._cbExitLibraryEdit();
    return;
  }
  cbEditingLineIdx = -1;
  cbScratchpad = null;
  if (typeof renderCBEditor === 'function') renderCBEditor();
}
/** @type {any} */ (window)._cbExitCabinet = _cbExitCabinet;

/** Render the project-scoped cabinet sub-gate (no cabinet open) into
 *  #cb-cab-editor: "+ Add Cabinet" + recent cabinets in this project. */
function _cbRenderCabinetSubGate() {
  const el = _byId('cb-cab-editor');
  if (!el) return;
  // Sorted by most recent (cbLines is in insertion order; reverse → newest first).
  const recents = cbLines
    .slice()
    .reverse()
    .slice(0, 5)
    .map(/** @param {any} c @param {number} i */ (c, i) => {
      // Map reverse index back to the actual cbLines index for cbSelectLine.
      const realIdx = cbLines.length - 1 - i;
      return {
        id: c.id || realIdx,
        name: c.name || ('Cabinet ' + (realIdx + 1)),
        meta: `${c.w}×${c.h}`,
        onClick: `cbSelectLine(${realIdx})`,
      };
    });
  el.innerHTML = _renderListEmpty({
    iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    title: 'Cabinets',
    subtitle: 'Add a cabinet to this project. New cabinets autosave as you edit.',
    btnLabel: '+ Add Cabinet',
    btnOnclick: 'addCBLine()',
    recentItems: recents,
    recentLabel: 'Recent',
    itemIconSvg: _TYPE_ICON_CABINET,
  });
}
/** @type {any} */ (window)._cbRenderCabinetSubGate = _cbRenderCabinetSubGate;

/** Strategy 2: clear the active Cabinet Builder client and return to empty state. */
function _exitClient_cabinet() {
  _cbConfirmDiscardIfDirty('exit client', () => {
    _cbSuppressDirty = true;
    cbLines = [];
    cbNextId = 1;
    cbScratchpad = null;
    cbEditingLineIdx = -1;
    cbEditingQuoteId = null;
    cbEditingOriginalLines = null;
    localStorage.removeItem('pc_cq_lines');
    localStorage.removeItem('pc_cq_client_name');
    localStorage.removeItem('pc_cb_editing_quote_id');
    _cbCurrentClientId = null;
    _cbCurrentClientName = '';
    _setCbDirty(false);
    _cbSuppressDirty = false;
    if (typeof renderCBPanel === 'function') renderCBPanel();
    _cbRenderContext();
  });
}
/** @type {any} */ (window)._exitClient_cabinet = _exitClient_cabinet;

/** @param {string} actionLabel @param {() => void} proceed */
function _cbConfirmDiscardIfDirty(actionLabel, proceed) {
  if (_cbDirty) {
    _confirm(`You have unsaved changes. Discard and ${actionLabel}?`, proceed);
  } else {
    proceed();
  }
}

function _cbNewClient() {
  _cbConfirmDiscardIfDirty('start a new design', () => {
    _cbSuppressDirty = true;
    cbLines = [];
    cbNextId = 1;
    cbScratchpad = null;
    cbEditingLineIdx = -1;
    cbEditingQuoteId = null;
    cbEditingOriginalLines = null;
    localStorage.removeItem('pc_cq_lines');
    localStorage.removeItem('pc_cq_client_name');
    localStorage.removeItem('pc_cb_editing_quote_id');
    _cbCurrentClientId = null;
    _cbCurrentClientName = '';
    const pn = _byId('cb-client');
    if (pn) /** @type {HTMLInputElement} */ (pn).value = '';
    _setCbDirty(false);
    _cbSuppressDirty = false;
    if (typeof renderCBPanel === 'function') renderCBPanel();
    _openNewClientPopup('cb-client');
  });
}

/** @param {number} clientId */
function _cbPickClient(clientId) {
  const cli = clients.find(c => c.id === clientId);
  if (!cli) return;
  _cbConfirmDiscardIfDirty(`load "${cli.name}"`, () => {
    _loadCBClientById(clientId, cli.name);
  });
}
/** @type {any} */ (window)._cbPickClient = _cbPickClient;

/** Smart-suggest for the Cabinet Builder gated-entry client picker.
 *  @param {HTMLInputElement} input @param {string} boxId */
function _smartCBEmptyClientSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  if (typeof _posSuggest === 'function') _posSuggest(input, box);
  const matches = clients
    .filter(/** @param {any} c */ c => !val || c.name.toLowerCase().includes(val))
    .slice(0, 8);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  for (const c of matches) {
    const designingCount = quotes.filter(/** @param {any} q */ q => q.client_id === c.id && _isDraftQuote(q)).length;
    html += `<div class="client-suggest-item" onmousedown="_cbPickClient(${c.id})">
      <span class="suggest-icon">${esc(c.name).charAt(0).toUpperCase()}</span>
      <span class="csi-name">${esc(c.name)}</span>
      ${designingCount ? `<span class="csi-meta">${designingCount} draft${designingCount!==1?'s':''}</span>` : ''}
    </div>`;
  }
  if (val && !matches.some(/** @param {any} c */ c => c.name.toLowerCase() === val)) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_openNewClientPopup('cb-empty-picker')">
      <span class="csi-icon">+</span>
      <span class="csi-name">Create client "${esc(input.value.trim())}"</span>
    </div>`;
  }
  if (!html) html = '<div class="client-suggest-empty">No clients yet — click + to create one.</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}
/** @type {any} */ (window)._smartCBEmptyClientSuggest = _smartCBEmptyClientSuggest;

/** @param {string} name */
async function _cbSaveClientByName(name) {
  if (!name) return;
  if (!_userId) { _toast('Sign in to save', 'error'); return; }
  const existing = clients.find(c => c.name === name);
  let clientId = existing ? existing.id : null;
  if (!clientId) {
    clientId = await resolveClient(name);
    if (!clientId) { _toast('Could not save client', 'error'); return; }
  }
  _cbCurrentClientId = clientId;
  _cbCurrentClientName = name;
  const pn = _byId('cb-client');
  if (pn) /** @type {HTMLInputElement} */ (pn).value = name;
  localStorage.setItem('pc_cq_client_name', name);
  try {
    const draft = await _findOrCreateDraftQuote(clientId);
    if (draft) {
      await _db('quote_lines').delete().eq('quote_id', draft.id).eq('line_kind', 'cabinet');
      if (cbLines.length) {
        /** @type {any[]} */
        const rows = cbLines.map((l, i) => _cbLineToRow(l, i, draft.id));
        await _db('quote_lines').insert(rows);
      }
    }
  } catch (e) {
    _toast('Save failed: ' + ((/** @type {any} */ (e)).message || e), 'error');
    return;
  }
  _setCbDirty(false);
  _toast(`"${name}" saved`, 'success');
  if (typeof renderCBPanel === 'function') renderCBPanel();
}

/** @param {number} clientId @param {string} clientName */
async function _loadCBClientById(clientId, clientName) {
  if (_cbLinesSyncTimer) { clearTimeout(_cbLinesSyncTimer); _cbLinesSyncTimer = null; }
  _cbSuppressDirty = true;
  cbEditingQuoteId = null;
  cbEditingOriginalLines = null;
  localStorage.removeItem('pc_cb_editing_quote_id');
  cbLines = [];
  cbNextId = 1;
  cbScratchpad = null;
  cbEditingLineIdx = -1;

  // Pick the most-recent designing quote for this client (mirror _findOrCreateDraftQuote).
  const drafts = quotes
    .filter(q => q.client_id === clientId && _isDraftQuote(q))
    .sort((a, b) => (+new Date(b.updated_at || b.created_at || 0)) - (+new Date(a.updated_at || a.created_at || 0)));
  const draft = drafts[0];
  if (draft) {
    try {
      const { data: lines } = await _db('quote_lines')
        .select('*').eq('quote_id', draft.id).eq('line_kind', 'cabinet').order('position');
      if (lines && lines.length) {
        cbLines = lines.map(/** @param {any} row @param {number} i */ (row, i) => {
          const cb = /** @type {any} */ (_quoteLineRowToCB(row));
          cb.id = i + 1;
          return cb;
        });
        cbNextId = cbLines.length + 1;
      }
    } catch (e) {
      console.warn('[cb load-client]', (/** @type {any} */ (e)).message || e);
    }
  }

  _cbCurrentClientId = clientId;
  _cbCurrentClientName = clientName;
  const pn = _byId('cb-client');
  if (pn) /** @type {HTMLInputElement} */ (pn).value = clientName;
  localStorage.setItem('pc_cq_client_name', clientName);
  localStorage.removeItem('pc_cq_lines');
  _setCbDirty(false);
  _cbSuppressDirty = false;
  if (typeof renderCBPanel === 'function') renderCBPanel();
  if (typeof switchCBMainView === 'function') switchCBMainView(cbLines.length ? 'results' : 'library');
}

// ── Init CB ──
loadCBSettings();
loadCBLines();
loadStockLibraries();
// Editor starts empty — clicking "+" pushes a fresh row to cbLines and points
// the scratchpad at it.
cbScratchpad = null;
