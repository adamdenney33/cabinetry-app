// ProCabinet — Cutlist (carved out of src/app.js in phase E carve 16 — the
// final big-section carve of phase E).
//
// R.2 split: the print/PDF pipeline (printLayout, _printInFrame, _saveAsPDF,
// PDF helpers + the five _build*PDF document builders) lives in
// src/cutlist-pdf.js; the packing algorithms, optimiser, canvas drawing and
// layout toolbar live in src/cutlist-layout.js; the edge-band UI + column
// visibility toggles live in src/cutlist-edge.js; the sheet/piece tables,
// selection, keyboard nav, CSV and the Cut List Library view live in
// src/cutlist-render.js. This residual file owns the shared state, the
// drill-in state machine, localStorage persistence and the DXF export.
//
// Loaded as a classic <script defer> BEFORE src/app.js, BEFORE src/settings.js
// (settings.js's setUnits IIFE may reference `sheets` / `pieces` at script-
// load time — guarded by try/catch but cleaner if cutlist.js loads first).
//
// State-bearing — many top-level `let` bindings: sheets, pieces, edgeBands,
// results, activeSheetIdx, activeTab, pieceColorIdx, _sheetId, _pieceId,
// _csvImportTarget, layoutZoom / layoutColor / layoutGrain / layoutFontScale
// / layoutCutOrder / layoutSheetCutList (UI prefs). The `addSheet` /
// `addPiece` / `renderSheets` / `renderPieces` / `_loadCutList` functions
// are called from app.js's INIT block, so they must be defined when app.js
// runs — load-before-app.js satisfies that.
//
// Cross-file dependencies (runtime, resolved through global env):
//   - _toast / _confirm / _openPopup / _closePopup / _popupVal /
//     _escHtml (src/app.js / src/ui.js)
//   - _db / _userId / _dbInsertSafe (src/db.js / src/clients.js)
//   - window.units / window.currency (src/settings.js)
//   - stockItems (src/stock.js, used by `useStockInCutList` callers and
//     stock-derived sheet creation)
//   - calcCBLine / cbSettings (src/cabinet.js — for line-pricing
//     conversions in CSV import/export paths)

// ══════════════════════════════════════════
// CUTLIST — State & Logic
// ══════════════════════════════════════════
/** @type {any[]} */
let sheets = [];
/** @type {any[]} */
let pieces = [];
/** @type {any} */
let results = null;
let activeSheetIdx = 0;
let activeTab = 'layout';
let pieceColorIdx = 0;
let _sheetId = 1;
let _pieceId = 1;
let _csvImportTarget = 'pieces';
let layoutZoom = parseFloat(localStorage.getItem('pc_zoom') ?? '') || 1.0;
let layoutColor = true;
let layoutGrain = true;
let layoutFontScale = parseFloat(localStorage.getItem('pc_font_scale') ?? '') || 1.0;
let layoutCutOrder = localStorage.getItem('pc_cut_order') === '1';
let layoutSheetCutList = localStorage.getItem('pc_sheet_cutlist') === '1';
// Cutting method: 'guillotine' (panel saw, edge-to-edge cuts) or 'nested'
// (CNC router, parts placed freely). Selects which packer optimize() uses.
let cutMethod = localStorage.getItem('pc_cut_method') === 'nested' ? 'nested' : 'guillotine';
/** @type {Record<string, boolean>} */
let colsVisible = { grain: false, material: true, label: true, notes: false, edgeband: false };
/** @type {any[]} */
let edgeBands = [];
let _edgeBandId = 1;
let layoutRotate = false;
// True once the user manually hits Rotate, so the mobile portrait-default
// (set in renderResults) stops overriding their choice.
let _clRotateTouched = false;
let clShowSummary = localStorage.getItem('pc_show_summary') === '1';
let clShowCutList = clShowSummary;  // cut list is part of the Summary tile
// Width (px) of #results-area when the layout diagrams were last drawn, or -1
// if never drawn. The area ResizeObserver re-renders when the live width
// meaningfully deviates from this — e.g. the pane was hidden at draw time and
// the diagram fell back to the 200px floor, or the window/panel was resized.
let _clDrawnW = -1;
/** @type {ResizeObserver|null} */
let _clAreaObs = null;
let _clAreaObsRaf = 0;
/** @type {any} */
let _dragSrc = null;
/** @type {any} */
let _dragTable = null;

// Project-state tracking — set by loadProject / _clSaveProjectByName, reset when a library cut list is opened or a new one is started.
/** @type {number | null} */
let _clCurrentProjectId = null;
let _clCurrentProjectName = '';
// Cabinet-scope tracking — set by _clOpenCabinet, cleared by _exitCabinet_cutlist.
// Mutually exclusive with _clCurrentProjectId.
/** @type {number | null} */
let _clCurrentCabinetId = null;
let _clCurrentCabinetName = '';
/** @type {number | null} */
let _clCurrentCutlistId = null;
let _clCurrentCutlistName = '';
let _clDirty = false;
// false while a cut list is mid-load — gates autosave so the transient
// empty/partial in-memory arrays during a load can't be persisted.
let _clCutlistReady = true;
/** @type {string} */
let _clMainView = 'library';

/** Persist the cutlist editor's open context so refresh can restore it. */
function _persistCutlistCtx() {
  const w = /** @type {any} */ (window);
  if (typeof w._pcSaveOpenCutlistCtx !== 'function') return;
  w._pcSaveOpenCutlistCtx({
    projectId: _clCurrentProjectId,
    cabinetId: _clCurrentCabinetId,
    cutlistId: _clCurrentCutlistId,
    mainView: _clMainView,
  });
}

const COLORS = [
  '#4a90d9','#d4763b','#4caf50','#9c27b0','#e53935',
  '#00acc1','#f9a825','#7cb342','#5c6bc0','#e91e63',
  '#00897b','#f57c00','#6d4c41','#546e7a','#7b1fa2',
  '#1e88e5','#43a047','#fdd835','#8e24aa','#039be5',
];

// ── GRAIN ICONS ──
const GRAIN_ICONS = {
  // none: faint equal lines — no constraint
  'none': `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5"><line x1="1" y1="2.5" x2="13" y2="2.5"/><line x1="1" y1="6" x2="13" y2="6"/><line x1="1" y1="9.5" x2="13" y2="9.5"/></svg>`,
  // h: horizontal lines — grain runs the length of the board
  'h':    `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="0" y1="2.5" x2="14" y2="2.5"/><line x1="0" y1="6" x2="14" y2="6"/><line x1="0" y1="9.5" x2="14" y2="9.5"/></svg>`,
  // v: vertical lines — cross grain
  'v':    `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="2" y1="0" x2="2" y2="12"/><line x1="5.5" y1="0" x2="5.5" y2="12"/><line x1="9" y1="0" x2="9" y2="12"/><line x1="12.5" y1="0" x2="12.5" y2="12"/></svg>`,
};
const EYE_ON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const DEL_SVG = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;

/** @param {string} g */
function grainIcon(g) { return (/** @type {Record<string,string>} */(GRAIN_ICONS))[g] || GRAIN_ICONS['none']; }

/** @param {any} p */
function _trimmedDims(p) {
  const e = p.edges || {};
  /** @param {string} side */
  const thk = side => {
    const s = e[side];
    if (!s || !s.trim) return 0;
    const mat = edgeBands.find(x => x.id === s.id);
    return mat ? (mat.thickness || 0) : 0;
  };
  return { w: p.w - thk('W2') - thk('W4'), h: p.h - thk('L1') - thk('L3') };
}

// ── VALUE PARSER (fractions + math) ──
/** @param {string | number} str */
function parseVal(str) {
  if (typeof str === 'number') return str;
  str = String(str).trim();
  if (!str) return 0;
  const mixed = str.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
  const frac = str.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
  const safe = str.replace(/[^0-9+\-*/.() ]/g, '');
  try { const v = Function('"use strict";return(' + safe + ')')(); if (isFinite(v)) return v; } catch(e) {}
  return parseFloat(str) || 0;
}



// Guard for any flow that would replace the current cut list state. Always
// confirms when there are unsaved changes; runs `proceed` once the user has
// agreed (or immediately, when nothing is dirty).
/** @param {string} actionLabel @param {() => void} proceed */
function _clConfirmDiscardIfDirty(actionLabel, proceed) {
  if (_clDirty) {
    _confirm(`You have unsaved changes. Discard and ${actionLabel}?`, proceed);
  } else {
    proceed();
  }
}

// Sidebar `+` button — start a new project. Confirms before discarding
// F6 (2026-05-13): _clNewProject removed alongside the projects entity.


// ── PROJECT-STATE TRACKING ──
/** @type {ReturnType<typeof setTimeout> | null} */
let _clAutosaveTimer = null;

/** @param {boolean} dirty */
function _setClDirty(dirty) {
  _clDirty = !!dirty;
  _renderClCurrentProject();
  // Strategy C: surface dirty state on the cutlist save pill (kept for now;
  // a follow-up removes the pill entirely).
  if (typeof _setSaveStatus === 'function') {
    _setSaveStatus('cutlist', _clDirty ? 'dirty' : 'clean');
  }
  // Autosave: schedule a debounced DB write whenever dirty flips on.
  if (_clDirty) _clScheduleAutosave();
}

/** Debounced 800 ms autosave for cut list changes.
 *  Routes to _clSaveProjectByName for project-scoped cutlists, or to a direct
 *  cutlists table update + child re-sync for library cutlists. */
function _clScheduleAutosave() {
  if (_clAutosaveTimer) clearTimeout(_clAutosaveTimer);
  _clAutosaveTimer = setTimeout(() => {
    _clAutosaveTimer = null;
    _clRunAutosave();
  }, 800);
}

async function _clRunAutosave() {
  if (!_userId) return;
  // Suspend autosave while the walkthrough is on screen: the tour opens the
  // sample cut list read-only, so a tour-driven render or the optimise step
  // must not persist over — or wipe — the seeded rows.
  if (/** @type {any} */ (window)._wtActive) return;
  // Never autosave a cut list mid-load: its in-memory arrays are transiently
  // empty/partial and the destructive re-sync below would persist that,
  // wiping the real rows.
  if (!_clCutlistReady) return;
  // Post-F5: every cut list is its own row (no project wrapper). Direct
  // write to the cutlists row, then re-sync sheets/pieces/edge_bands children.
  if (_clCurrentCutlistId) {
    // Data-loss guard: the sync below deletes every piece/sheet for this
    // cut list and re-inserts only what is in memory. If all the in-memory
    // arrays are empty that is almost always a transient load state (e.g.
    // the walkthrough opening a cut list mid-render), not a deliberate
    // empty — skip rather than wipe a populated cut list in the DB.
    if (!pieces.length && !sheets.length &&
        !(typeof edgeBands !== 'undefined' && edgeBands.length)) {
      _clDirty = false;
      if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'clean');
      return;
    }
    if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'saving');
    try {
      await _db('cutlists').update(/** @type {any} */ ({
        name: _clCurrentCutlistName || 'Untitled',
        updated_at: new Date().toISOString()
      })).eq('id', _clCurrentCutlistId);
      await _db('pieces').delete().eq('cutlist_id', _clCurrentCutlistId);
      await _db('sheets').delete().eq('cutlist_id', _clCurrentCutlistId);
      await _db('edge_bands').delete().eq('cutlist_id', _clCurrentCutlistId);
      if (pieces.length) {
        const rows = pieces.map((p, i) => /** @type {any} */ ({
          user_id: _userId, cutlist_id: _clCurrentCutlistId,
          label: p.label || '', w_mm: p.w, h_mm: p.h, qty: p.qty || 1,
          grain: p.grain || 'none', material: p.material || '', notes: p.notes || '',
          enabled: p.enabled !== false, color: p.color, position: i
        }));
        await _db('pieces').insert(rows);
      }
      if (sheets.length) {
        const rows = sheets.map((s, i) => /** @type {any} */ ({
          user_id: _userId, cutlist_id: _clCurrentCutlistId,
          name: s.name || 'Sheet', w_mm: s.w, h_mm: s.h, qty: s.qty || 1,
          grain: s.grain || 'none', kerf_mm: s.kerf || 3,
          enabled: s.enabled !== false, color: s.color, position: i
        }));
        await _db('sheets').insert(rows);
      }
      _clDirty = false;
      if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'saved');
      // Refresh the library card grid so the per-cut-list piece count reflects
      // the rows we just wrote. renderCLCutListLibraryView no-ops when its DOM
      // isn't mounted, so it's safe to call from any tab.
      if (typeof renderCLCutListLibraryView === 'function') renderCLCutListLibraryView();
    } catch (e) {
      console.warn('[cl autosave-library]', (/** @type {any} */ (e)).message || e);
      if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'failed', { retry: _clRunAutosave });
    }
  }
}

function _renderClCurrentProject() {
  // Strategy 2: delegate to _clRenderContext which manages empty/in-project states.
  _clRenderContext();
}

// SVG icons for the project-style headers (item 8).
const _CL_LIBRARY_ICON = '<svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1.7 L12.9 3.45 L15.94 2.48 L16.1 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.3 12 L20.55 12.9 L21.52 15.94 L19.56 16.1 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12 22.3 L11.1 20.55 L8.06 21.52 L7.9 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.7 12 L3.45 11.1 L2.48 8.06 L4.44 7.9 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>';
const _CL_CABINET_ICON = '<svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';

/** Strategy 2: render either empty state or Idea-3 header into #cl-context. */
function _clRenderContext() {
  _persistCutlistCtx();
  // Render whatever main-view tab is currently active (default: cutlists).
  // Idempotent: switchCLMainView keeps display state in sync each call.
  if (typeof switchCLMainView === 'function') switchCLMainView(_clMainView || 'library');
  const ctx = _byId('cl-context');
  const scroll = _byId('cl-scroll-body');
  const actionBar = _byId('cl-action-bar');
  if (!ctx) return;
  const subGate = _byId('cl-sub-gate');
  // Cabinet-scope: a cabinet is open and we're either listing its cut lists
  // or editing one of them. Show a cabinet-flavoured header.
  if (_clCurrentCabinetId) {
    if (subGate) { subGate.innerHTML = ''; subGate.style.display = 'none'; }
    if (scroll) scroll.style.display = '';
    if (actionBar) actionBar.style.display = '';
    ctx.innerHTML = _renderProjectHeader('cutlist', {
      name: _clCurrentCabinetName || 'Cabinet',
      exitFn: '_exitCabinet_cutlist',
      iconSvg: _CL_CABINET_ICON,
    });
    _clSyncDrillInputs();
    if (typeof _setSaveStatus === 'function') {
      if (_clDirty) _setSaveStatus('cutlist', 'dirty');
    }
    return;
  }
  // Library-cutlist editing (item 8): _clCurrentProjectId is null but a
  // _clCurrentCutlistId is set (loaded from Cut List Library).
  if (!_clCurrentProjectId && _clCurrentCutlistId) {
    if (subGate) { subGate.innerHTML = ''; subGate.style.display = 'none'; }
    if (scroll) scroll.style.display = '';
    if (actionBar) actionBar.style.display = '';
    ctx.innerHTML = _renderProjectHeader('cutlist', {
      name: _clCurrentCutlistName || 'Cut List',
      exitFn: '_clExitLibraryEdit',
      iconSvg: _CL_LIBRARY_ICON,
      saveIndicator: 'cutlist',
    });
    _clSyncDrillInputs();
    if (typeof _setSaveStatus === 'function') {
      _setSaveStatus('cutlist', _clDirty ? 'dirty' : 'clean');
    }
    return;
  }
  // F6 (2026-05-13): no project scope. Empty state prompts the user to pick
  // a cut list from the library or create one.
  if (!_clCurrentCutlistId) {
    if (subGate) { subGate.innerHTML = ''; subGate.style.display = 'none'; }
    if (scroll) scroll.style.display = 'none';
    if (actionBar) actionBar.style.display = 'none';
    ctx.innerHTML = `<div class="project-empty">
      <svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>
      <h3>Cut List</h3>
      <p>Open a cut list from the <strong>Cut List Library</strong> tab on the right, or click <strong>+ Add Cut List</strong> to start a fresh one.</p>
      <button class="btn btn-primary" onclick="_clStartNewCutlist()" style="width:100%;justify-content:center">+ Add Cut List</button>
    </div>`;
    return;
  }
  // Cut list active. Render its header.
  ctx.innerHTML = _renderProjectHeader('cutlist', {
    name: _clCurrentCutlistName || 'Cut List',
    exitFn: '_clExitLibraryEdit',
    iconSvg: _CL_LIBRARY_ICON,
    saveIndicator: 'cutlist',
  });
  if (!_clCurrentCutlistId) {
    // Sub-gate: show "+ Add Cut List" + recent cut lists.
    if (scroll) scroll.style.display = 'none';
    if (actionBar) actionBar.style.display = 'none';
    _clRenderCutlistSubGate();
    return;
  }
  // Drill-in: hide sub-gate, show editor body + header.
  if (subGate) { subGate.innerHTML = ''; subGate.style.display = 'none'; }
  if (scroll) scroll.style.display = '';
  if (actionBar) actionBar.style.display = '';
  _clSyncDrillInputs();
  if (typeof _setSaveStatus === 'function') {
    if (_clDirty) _setSaveStatus('cutlist', 'dirty');
  }
}

/** Mirror the in-memory _clCurrentCutlistName into the drill-in name input
 *  and the title display. Skips writing while the input is focused so the
 *  user's typing isn't clobbered by other renders. */
function _clSyncDrillInputs() {
  // id `cutlist-name` (not `cl-name`) — the Clients panel uses `cl-name` for
  // the client-name field, and getElementById on the duplicated id was
  // letting client edits leak into this input.
  const nameInp = /** @type {HTMLInputElement|null} */ (_byId('cutlist-name'));
  if (nameInp && document.activeElement !== nameInp) {
    nameInp.value = _clCurrentCutlistName || '';
  }
  const disp = _byId('cl-name-display');
  if (disp) disp.textContent = _clCurrentCutlistName || 'Cut List';
}
/** @type {any} */ (window)._clSyncDrillInputs = _clSyncDrillInputs;

/** Render the cut list sub-gate (no cut list open) into #cl-sub-gate: shows
 *  "+ Add Cut List" + recent cut lists. Post-F5: no project filter; RLS bounds
 *  to the current user. */
async function _clRenderCutlistSubGate() {
  const el = _byId('cl-sub-gate');
  if (!el) return;
  /** @type {any[]} */
  let rows = [];
  try {
    const { data } = await _db('cutlists')
      .select('id, name, updated_at')
      .order('updated_at', { ascending: false });
    rows = /** @type {any[]} */ (data || []);
  } catch (e) { rows = []; }
  const recents = rows.slice(0, 5).map(/** @param {any} r */ r => ({
    id: r.id,
    name: r.name || '(untitled)',
    meta: _clFormatDate(r.updated_at) || '',
    onClick: `_clLoadCutlist(${r.id})`,
  }));
  el.innerHTML = _renderListEmpty({
    iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>',
    title: 'Cut Lists',
    subtitle: 'Add a cut list. New cut lists autosave as you edit.',
    btnLabel: '+ Add Cut List',
    btnOnclick: '_clStartNewCutlist()',
    recentItems: recents,
    recentLabel: 'Recent',
    itemIconSvg: _TYPE_ICON_CUTLIST,
  });
  el.style.display = '';
}
/** @type {any} */ (window)._clRenderCutlistSubGate = _clRenderCutlistSubGate;

// F6 (2026-05-13): _clPickProjectByIdSafe + _smartCLEmptyProjectSuggest
// removed alongside the projects entity. Cut lists open via _clLoadCutlist
// from the Cut List Library tab or Client cards.

// ── CUT LIST DRILL-IN (sidebar) ──
// The sub-gate (in _clRenderContext) gives "+ Add Cut List" and a recent list.
// Once a cut list is open the drill-in header (#cl-editor-header in
// index.html) hosts the back button, name input, and Autosave indicator —
// equivalent to Clients/Stock's pattern.

/** Drill-in name input handler. Live-updates _clCurrentCutlistName,
 *  refreshes the title display, and marks the cut list dirty so the
 *  debounced autosave persists the rename.
 *  @param {string} val */
function _clRenameCutlist(val) {
  _clCurrentCutlistName = String(val || '').trim();
  const disp = _byId('cl-name-display');
  if (disp) disp.textContent = _clCurrentCutlistName || 'Cut List';
  _setClDirty(true);
}
/** @type {any} */ (window)._clRenameCutlist = _clRenameCutlist;

/** Exit the open cut list back to the cut list sub-gate. */
function _clExitCutlist() {
  const proceed = () => {
    _clCurrentCutlistId = null;
    _clCurrentCutlistName = '';
    pieces = []; sheets = []; edgeBands = [];
    _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0;
    results = null;
    _setClDirty(false);
    if (typeof renderSheets === 'function') renderSheets();
    if (typeof renderPieces === 'function') renderPieces();
    if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
    _clRenderContext();
  };
  if (_clDirty) _confirm('Discard unsaved changes and close this cut list?', proceed);
  else proceed();
}
/** @type {any} */ (window)._clExitCutlist = _clExitCutlist;

/** Compute the next sequential "Cut List N" name across the user's cutlists.
 *  Post-F5: no project scope — just walks the user's cutlists (RLS bounds them).
 *  Falls back to "Cut List 1" if the lookup fails or returns no rows.
 *  @param {number|null} _scopeId unused — kept for caller back-compat
 *  @returns {Promise<string>} */
async function _clNextCutlistName(_scopeId) {
  try {
    const { data } = await _db('cutlists').select('name');
    let max = 0;
    for (const r of (data || [])) {
      const m = String(/** @type {any} */ (r).name || '').match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return 'Cut List ' + (max + 1);
  } catch (e) { return 'Cut List 1'; }
}
/** @type {any} */ (window)._clNextCutlistName = _clNextCutlistName;

/** "+ Add Cut List" handler. Inserts a fresh cut list row in the DB
 *  immediately (with a sequential default name), then drills in. Mirrors
 *  Clients/Stock — the row exists by the time the user starts editing, so
 *  back→recent picks up the new entry without further user input.
 *  In cabinet-scope, defers to _clNewCabinetLinkedCutlist which copies
 *  cabinet cut parts into the new row. */
async function _clStartNewCutlist() {
  if (_clCurrentCabinetId) { return _clNewCabinetLinkedCutlist(); }
  if (!_requireAuth()) return;
  const { data: _clCountRows } = await _db('cutlists').select('id').eq('user_id', _userId);
  if (!_enforceFreeLimit('cutlists', _realCount(_clCountRows))) return;
  const insertNew = async () => {
    const name = await _clNextCutlistName(null);
    if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'saving');
    try {
      const { data, error } = await _db('cutlists').insert(/** @type {any} */ ({
        user_id: _userId,
        name,
        position: 0,
        ui_prefs: {},
      })).select().single();
      if (error || !data) {
        if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'failed', { retry: _clStartNewCutlist });
        _toast('Could not create cut list', 'error');
        return;
      }
      const newId = /** @type {any} */ (data).id;
      if (typeof _track === 'function') _track('library_item_created', { library: 'cutlists', item_id: newId, source: 'cutlist_tab' });
      _clCurrentCutlistId = newId;
      _clCurrentCutlistName = name;
      if (window._mvShowEditor) window._mvShowEditor();
      pieces = []; sheets = []; edgeBands = [];
      _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0;
      results = null;
      _setClDirty(false);
      if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'saved');
      if (typeof renderSheets === 'function') renderSheets();
      if (typeof renderPieces === 'function') renderPieces();
      if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
      _clRenderContext();
      const focus = /** @type {HTMLInputElement|null} */ (_byId('cutlist-name'));
      if (focus) focus.focus();
    } catch (e) {
      if (typeof _setSaveStatus === 'function') _setSaveStatus('cutlist', 'failed', { retry: _clStartNewCutlist });
      _toast('Could not create cut list', 'error');
    }
  };
  if (_clDirty) _confirm('Discard unsaved changes and start a new cut list?', insertNew);
  else insertNew();
}
/** @type {any} */ (window)._clStartNewCutlist = _clStartNewCutlist;

/** Cabinet-scope branch of "+" creation. Inserts a library cut list with
 *  cabinet_id set, copies the cabinet's cut parts into pieces rows, then
 *  opens the new cut list in edit state. */
async function _clNewCabinetLinkedCutlist() {
  if (!_requireAuth()) return;
  if (!_clCurrentCabinetId) return;
  const w = /** @type {any} */ (window);
  const lib = (typeof cbLibrary !== 'undefined' && cbLibrary) ? cbLibrary : [];
  const cab = lib.find(/** @param {any} c */ c => c.db_id === _clCurrentCabinetId);
  if (!cab) { _toast('Cabinet not found', 'error'); return; }
  const parts = (cab._cutParts && cab._cutParts.length)
    ? cab._cutParts
    : (typeof w._cabinetPartsList === 'function' ? w._cabinetPartsList(cab) : []);
  if (!parts || !parts.length) { _toast('Cabinet has no cut parts to copy', 'error'); return; }

  const { data: _clCountRows } = await _db('cutlists').select('id').eq('user_id', _userId);
  if (!_enforceFreeLimit('cutlists', _realCount(_clCountRows))) return;

  const name = await _clNextCutlistName(null);
  const insertCutlist = async () => {
    try {
      const { data, error } = await _db('cutlists').insert(/** @type {any} */ ({
        user_id: _userId,
        name,
        position: 0,
        ui_prefs: {}
      })).select().single();
      if (error || !data) { _toast('Could not create cut list', 'error'); return; }
      const newId = /** @type {any} */ (data).id;
      if (typeof _track === 'function') _track('library_item_created', { library: 'cutlists', item_id: newId, source: 'cabinet_linked' });
      try {
        await _db('cutlist_cabinets').insert(/** @type {any} */ ({
          user_id: _userId,
          cutlist_id: newId,
          cabinet_id: _clCurrentCabinetId,
        }));
      } catch (e) { /* tolerate — cut list exists, link can be added manually */ }
      const rows = parts.map(/** @param {any} p @param {number} i */ (p, i) => /** @type {any} */ ({
        user_id: _userId,
        cutlist_id: newId,
        label: p.label || '',
        w_mm: p.w,
        h_mm: p.h,
        qty: p.qty || 1,
        grain: p.grain || 'none',
        material: p.material || '',
        notes: p.notes || '',
        enabled: true,
        color: COLORS[i % COLORS.length],
        position: i,
      }));
      try { await _db('pieces').insert(rows); } catch (e) { /* tolerate */ }
      _toast(`"${name}" created and linked`, 'success');
      if (typeof w._clDoOpenLibraryCutlist === 'function') {
        await w._clDoOpenLibraryCutlist(newId);
      }
      // Refresh the library grid so the new card appears.
      if (typeof renderCLCutListLibraryView === 'function') renderCLCutListLibraryView();
    } catch (e) {
      _toast('Could not create cut list', 'error');
    }
  };
  if (_clDirty) _confirm('Discard unsaved changes and start a new cut list?', insertCutlist);
  else insertCutlist();
}
/** @type {any} */ (window)._clNewCabinetLinkedCutlist = _clNewCabinetLinkedCutlist;

/** Exit library-cutlist editing mode. Clears active library cutlist and
 *  returns the right pane to the Cut List Library tab. */
function _clExitLibraryEdit() {
  // Persist any in-flight autosave before clearing state.
  if (_clAutosaveTimer) { clearTimeout(_clAutosaveTimer); _clAutosaveTimer = null; }
  pieces = []; sheets = []; edgeBands = [];
  _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0;
  results = null;
  _clCurrentCutlistId = null;
  _clCurrentCutlistName = '';
  _clDirty = false;
  renderPieces(); renderSheets();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  if (typeof switchCLMainView === 'function') switchCLMainView('library');
  _clRenderContext();
}
/** @type {any} */ (window)._clExitLibraryEdit = _clExitLibraryEdit;

/** Strategy 2: clear active Cut List project and return to empty state. */
function _exitProject_cutlist() {
  if (_clDirty) {
    _confirm('You have unsaved changes. Discard and exit?', () => _doExitClProject());
  } else {
    _doExitClProject();
  }
}
function _doExitClProject() {
  pieces = []; sheets = []; edgeBands = []; _pieceId = 1; _sheetId = 1; _edgeBandId = 1;
  pieceColorIdx = 0;
  results = null;
  _clSelectedIds = new Set(); _clSelectionAnchorId = null;
  ['pc_cl_pieces','pc_cl_sheets','pc_cl_pid','pc_cl_sid','pc_cl_colorIdx','pc_cl_sheetColorIdx','pc_cl_edgebands','pc_cl_ebid'].forEach(k => localStorage.removeItem(k));
  _clCurrentProjectId = null;
  _clCurrentProjectName = '';
  _clDirty = false;
  renderPieces(); renderSheets();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  _clRenderContext();
}
/** @type {any} */ (window)._exitProject_cutlist = _exitProject_cutlist;

/** Open the Cut List tab in cabinet-scope: lists all library cut lists with
 *  linked to cabinetDbId via cutlist_cabinets. Mirrors loadProject() → switchCLMainView('cutlists').
 *  @param {number} cabinetDbId @param {string} cabinetName */
function _clOpenCabinet(cabinetDbId, cabinetName) {
  if (_clDirty) {
    _confirm('You have unsaved changes. Switch cabinets anyway?', () => _doOpenCabinet(cabinetDbId, cabinetName));
    return;
  }
  _doOpenCabinet(cabinetDbId, cabinetName);
}
/** @param {number} cabinetDbId @param {string} cabinetName */
function _doOpenCabinet(cabinetDbId, cabinetName) {
  _clCurrentProjectId = null; _clCurrentProjectName = '';
  _clCurrentCabinetId = cabinetDbId;
  _clCurrentCabinetName = cabinetName || '';
  _clCurrentCutlistId = null; _clCurrentCutlistName = '';
  pieces = []; sheets = []; edgeBands = [];
  _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0;
  results = null;
  _clSelectedIds = new Set(); _clSelectionAnchorId = null;
  _clDirty = false;
  if (typeof switchSection === 'function') switchSection('cutlist');
  renderPieces(); renderSheets();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  _clRenderContext();
  if (typeof switchCLMainView === 'function') switchCLMainView('cutlists');
}
/** @type {any} */ (window)._clOpenCabinet = _clOpenCabinet;

/** Exit cabinet-scope and return to the empty cut-list state. */
function _exitCabinet_cutlist() {
  if (_clDirty) {
    _confirm('You have unsaved changes. Discard and exit?', () => _doExitCabinet());
  } else {
    _doExitCabinet();
  }
}
function _doExitCabinet() {
  pieces = []; sheets = []; edgeBands = []; _pieceId = 1; _sheetId = 1; _edgeBandId = 1;
  pieceColorIdx = 0;
  results = null;
  _clSelectedIds = new Set(); _clSelectionAnchorId = null;
  _clCurrentCabinetId = null;
  _clCurrentCabinetName = '';
  _clCurrentCutlistId = null;
  _clCurrentCutlistName = '';
  _clDirty = false;
  renderPieces(); renderSheets();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  _clRenderContext();
}
/** @type {any} */ (window)._exitCabinet_cutlist = _exitCabinet_cutlist;


// ── CUT LIST PERSISTENCE ──
function _saveCutList() {
  try {
    localStorage.setItem('pc_cl_pieces', JSON.stringify(pieces));
    localStorage.setItem('pc_cl_sheets', JSON.stringify(sheets));
    localStorage.setItem('pc_cl_pid', String(_pieceId));
    localStorage.setItem('pc_cl_sid', String(_sheetId));
    localStorage.setItem('pc_cl_colorIdx', String(pieceColorIdx));
    localStorage.setItem('pc_cl_edgebands', JSON.stringify(edgeBands));
    localStorage.setItem('pc_cl_ebid', String(_edgeBandId));
    localStorage.setItem('pc_cl_colsVisible', JSON.stringify(colsVisible));
  } catch(e) {}
  // Any local-state mutation flips dirty when a cut list is open. F6 retired
  // the project wrapper — every cut list is now its own row keyed by
  // _clCurrentCutlistId, so that's the right scope for "is there a DB target
  // to autosave to". The old `_clCurrentProjectId &&` guard never fired
  // post-F6 and silently broke autosave.
  if (_clCurrentCutlistId && !_clDirty) _setClDirty(true);
}

function _loadCutList() {
  try {
    const p = localStorage.getItem('pc_cl_pieces');
    const s = localStorage.getItem('pc_cl_sheets');
    const eb = localStorage.getItem('pc_cl_edgebands');
    if (eb) { edgeBands = JSON.parse(eb); const ids = edgeBands.map(x=>x.id); _edgeBandId = ids.length ? Math.max(...ids)+1 : 1; }
    if (p) {
      pieces = JSON.parse(p);
      pieces.forEach(x => {
        if (typeof x.id === 'string') x.id = parseInt(String(x.id).replace(/\D/g, '')) || 0;
        if (x.notes === undefined) x.notes = '';
        if (!x.edges && x.edgeBand) {
          const firstId = edgeBands.length ? edgeBands[0].id : null;
          /** @type {Record<string, {id: any, trim: boolean} | null>} */
          const sides = {L1:null,W2:null,L3:null,W4:null};
          if (x.edgeBand === 'L' || x.edgeBand === 'LW' || x.edgeBand === 'all') { sides.L1 = firstId ? {id:firstId,trim:false} : null; sides.L3 = firstId ? {id:firstId,trim:false} : null; }
          if (x.edgeBand === 'W' || x.edgeBand === 'LW' || x.edgeBand === 'all') { sides.W2 = firstId ? {id:firstId,trim:false} : null; sides.W4 = firstId ? {id:firstId,trim:false} : null; }
          x.edges = sides;
          delete x.edgeBand;
        }
        if (!x.edges) x.edges = {L1:null,W2:null,L3:null,W4:null};
      });
      const usedPids = pieces.map(x => x.id).filter(n => Number.isFinite(n));
      if (usedPids.length) _pieceId = Math.max(_pieceId, Math.max(...usedPids) + 1);
    }
    if (s) {
      sheets = JSON.parse(s);
      sheets.forEach(x => {
        if (typeof x.id === 'string') x.id = parseInt(String(x.id).replace(/\D/g, '')) || 0;
        if (x.kerf === undefined) x.kerf = (window.units === 'metric' ? 3 : 0.125);
        if (!x.color) x.color = COLORS[pieceColorIdx++ % COLORS.length];
      });
      const usedSids = sheets.map(x => x.id).filter(n => Number.isFinite(n));
      if (usedSids.length) _sheetId = Math.max(_sheetId, Math.max(...usedSids) + 1);
    }
    const pid = localStorage.getItem('pc_cl_pid'); if (pid) _pieceId = parseInt(pid);
    const sid = localStorage.getItem('pc_cl_sid'); if (sid) _sheetId = parseInt(sid);
    const ci  = localStorage.getItem('pc_cl_colorIdx'); if (ci) pieceColorIdx = parseInt(ci);
    const ebid = localStorage.getItem('pc_cl_ebid'); if (ebid) _edgeBandId = parseInt(ebid);
    const cv = localStorage.getItem('pc_cl_colsVisible');
    if (cv) { try { Object.assign(colsVisible, JSON.parse(cv)); } catch(e) {} }
    // Panel column is now always visible — no toggle UI exists for it
    colsVisible.material = true;
    // Sync grain data with column visibility — clear stale grain values if column is hidden
    if (!colsVisible.grain) {
      pieces.forEach(p => { p.grain = 'none'; });
      sheets.forEach(s => { s.grain = 'none'; });
    }
  } catch(e) {}
}


// ── DXF / CNC EXPORT ──
// Exports the optimised nested layout as a single DXF — every unique sheet
// packing tiled left-to-right into one drawing — for import into CAM / CNC
// nesting software. Each part is a closed polyline rectangle sitting at its
// nested CUT position; the sheet outline and the part labels live on their own
// layers so they can be toggled in CAM. Pro-only (a data export, mirroring the
// CSV gating).
//
// Two correctness points that are easy to get wrong:
//   • Origin flip — the packer uses a top-left origin (y grows downward, canvas
//     convention). DXF and CNC machines use a bottom-left origin (y grows up),
//     so every y is mapped through (sheetH - y). Skip this and every part is
//     mirrored vertically on the bed.
//   • Cut size — `placed.w/h` is already the trimmed cut size (the optimiser
//     subtracts edge-band thickness in _trimmedDims), which is exactly what the
//     machine should cut. We draw that, not the finished size.
//
// Output is R12 (AC1009) with old-style closed POLYLINEs — the most universally
// readable DXF flavour across Vectric, Fusion, AlphaCAM, Cabinet Vision, etc.

/** Format a real for DXF output — fixed precision, no float dust. @param {number} v */
function _dxfNum(v) { return (Math.round(v * 10000) / 10000).toString(); }

/**
 * One closed POLYLINE rectangle (R12 old-style) on `layer`.
 * @param {string} layer @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1
 * @returns {string}
 */
function _dxfRect(layer, x0, y0, x1, y1) {
  /** @param {number} x @param {number} y */
  const vtx = (x, y) => `0\nVERTEX\n8\n${layer}\n10\n${_dxfNum(x)}\n20\n${_dxfNum(y)}\n30\n0.0\n`;
  return `0\nPOLYLINE\n8\n${layer}\n66\n1\n70\n1\n10\n0.0\n20\n0.0\n30\n0.0\n`
    + vtx(x0, y0) + vtx(x1, y0) + vtx(x1, y1) + vtx(x0, y1)
    + `0\nSEQEND\n8\n${layer}\n`;
}

/**
 * A TEXT entity centred (horizontally + vertically) on (cx,cy).
 * @param {string} layer @param {number} cx @param {number} cy @param {number} height @param {string} text
 * @returns {string}
 */
function _dxfText(layer, cx, cy, height, text) {
  const t = String(text).replace(/[^\x20-\x7E]/g, ''); // DXF default encoding is ASCII
  return `0\nTEXT\n8\n${layer}\n`
    + `10\n${_dxfNum(cx)}\n20\n${_dxfNum(cy)}\n30\n0.0\n`
    + `40\n${_dxfNum(height)}\n1\n${t}\n`
    + `72\n1\n`
    + `11\n${_dxfNum(cx)}\n21\n${_dxfNum(cy)}\n31\n0.0\n`
    + `73\n2\n`;
}

/**
 * A left-justified TEXT entity at baseline point (x,y) — used for sheet
 * captions (the centred `_dxfText` is for part labels).
 * @param {string} layer @param {number} x @param {number} y @param {number} height @param {string} text
 * @returns {string}
 */
function _dxfTextLeft(layer, x, y, height, text) {
  const t = String(text).replace(/[^\x20-\x7E]/g, '');
  return `0\nTEXT\n8\n${layer}\n10\n${_dxfNum(x)}\n20\n${_dxfNum(y)}\n30\n0.0\n40\n${_dxfNum(height)}\n1\n${t}\n`;
}

/**
 * Entities for ONE sheet placed at block offset (ox, oy): outline (SHEET),
 * parts (PARTS), part labels + an identifying caption (LABELS). The per-sheet
 * Y-flip (top-left canvas → bottom-left DXF) happens first, then the whole
 * block is translated by the offset.
 * @param {any} layout @param {number} ox @param {number} oy @param {number} idx @param {number} total
 * @returns {string}
 */
function _dxfSheetBlock(layout, ox, oy, idx, total) {
  const sheetW = layout.sheet.w, sheetH = layout.sheet.h;
  const metric = window.units === 'metric';
  const minTh = metric ? 4 : 0.15, maxTh = metric ? 22 : 0.9;

  let ents = _dxfRect('SHEET', ox, oy, ox + sheetW, oy + sheetH);
  for (const p of layout.placed) {
    const x0 = ox + p.x, y0 = oy + sheetH - (p.y + p.h);
    const x1 = ox + p.x + p.w, y1 = oy + sheetH - p.y;
    ents += _dxfRect('PARTS', x0, y0, x1, y1);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const th = Math.max(minTh, Math.min(Math.min(p.w, p.h) * 0.14, maxTh));
    const name = (p.item && p.item.label) ? String(p.item.label) : '';
    if (name) ents += _dxfText('LABELS', cx, cy + th * 0.7, th, name);
    ents += _dxfText('LABELS', cx, cy - th * 0.7, th * 0.8, `${formatDim(p.w)}x${formatDim(p.h)}`);
  }
  // Caption above the block so each sheet is identifiable in the combined file.
  const qty = layout.qty || 1;
  const cap = `Sheet ${idx + 1}/${total}: ${layout.sheet.name || 'Sheet'} `
    + `[${formatDim(sheetW)}x${formatDim(sheetH)}]${qty > 1 ? ` x${qty}` : ''}`;
  ents += _dxfTextLeft('LABELS', ox, oy + sheetH + (metric ? 36 : 1.4), metric ? 28 : 1.1, cap);
  return ents;
}

/**
 * Assemble ONE DXF document containing every unique sheet layout, tiled
 * left-to-right with a gap between blocks.
 * @param {any[]} layouts results.uniqueLayouts
 * @returns {string}
 */
function _buildLayoutDXF(layouts) {
  const metric = window.units === 'metric';
  const insUnits = metric ? 4 : 1;       // $INSUNITS: 4 = mm, 1 = inch
  const gap = metric ? 100 : 4;          // clear space between sheet blocks
  const capSpace = metric ? 70 : 2.8;    // caption headroom above each block

  let ents = '', ox = 0, extMaxX = 0, extMaxY = 0;
  layouts.forEach(/** @param {any} layout @param {number} i */ (layout, i) => {
    ents += _dxfSheetBlock(layout, ox, 0, i, layouts.length);
    extMaxX = ox + layout.sheet.w;
    extMaxY = Math.max(extMaxY, layout.sheet.h + capSpace);
    ox += layout.sheet.w + gap;
  });

  /** @param {string} name @param {number} color */
  const layer = (name, color) => `0\nLAYER\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;

  return `0\nSECTION\n2\nHEADER\n`
    + `9\n$ACADVER\n1\nAC1009\n`
    + `9\n$INSUNITS\n70\n${insUnits}\n`
    + `9\n$EXTMIN\n10\n0.0\n20\n0.0\n`
    + `9\n$EXTMAX\n10\n${_dxfNum(extMaxX)}\n20\n${_dxfNum(extMaxY)}\n`
    + `0\nENDSEC\n`
    + `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n3\n`
    + layer('SHEET', 5) + layer('PARTS', 3) + layer('LABELS', 7)
    + `0\nENDTAB\n0\nENDSEC\n`
    + `0\nSECTION\n2\nENTITIES\n`
    + ents
    + `0\nENDSEC\n0\nEOF\n`;
}

/** Sanitise a string for a download filename. @param {string} s */
function _dxfFilenameSafe(s) {
  return (s || 'cutlist').replace(/[^\w\-]+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 60) || 'cutlist';
}

/** Export the optimised nested layout as a single DXF (all sheets tiled). Pro-only. */
function exportLayoutDXF() {
  if (!_enforceProFeature()) return;
  if (!results || !results.uniqueLayouts || !results.uniqueLayouts.length) {
    _toast('Run the optimiser first', 'error');
    return;
  }
  const base = _dxfFilenameSafe(_clCurrentCutlistName || _clCurrentCabinetName || 'cutlist');
  const layouts = results.uniqueLayouts;
  const N = layouts.length;
  const phys = layouts.reduce(/** @param {number} s @param {any} l */ (s, l) => s + (l.qty || 1), 0);
  const dxf = _buildLayoutDXF(layouts);
  const url = URL.createObjectURL(new Blob([dxf], { type: 'application/dxf' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `${base}-nested.dxf` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  if (typeof _track === 'function') _track('cnc_dxf_exported', { layouts: N, sheets: phys });
  _toast(phys === N
    ? `Exported nested DXF (${N} sheet${N !== 1 ? 's' : ''})`
    : `Exported nested DXF (${N} layout${N !== 1 ? 's' : ''}, ${phys} sheets)`, 'success');
}

