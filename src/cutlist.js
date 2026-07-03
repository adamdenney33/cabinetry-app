// ProCabinet — Cutlist (carved out of src/app.js in phase E carve 16 — the
// final big-section carve of phase E).
//
// R.2 split: the print/PDF pipeline (printLayout, _printInFrame, _saveAsPDF,
// PDF helpers + the five _build*PDF document builders) lives in
// src/cutlist-pdf.js; the packing algorithms, optimiser, canvas drawing and
// layout toolbar live in src/cutlist-layout.js.
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

// ── CYCLE GRAIN ──
/** @param {number} id @param {string} type */
function cycleGrain(id, type) {
  const arr = type === 'sheet' ? sheets : pieces;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  const nextGrain = item.grain === 'none' ? 'h' : item.grain === 'h' ? 'v' : 'none';
  if (type === 'piece') {
    // Bulk-apply: set every selected piece (or just this one) to the same next value.
    for (const targetId of _bulkSelectedIds(id)) {
      const p = pieces.find(x => x.id === targetId);
      if (p) p.grain = nextGrain;
    }
  } else {
    item.grain = nextGrain;
  }
  type === 'sheet' ? renderSheets() : renderPieces();
  if (results) optimize();
  _saveCutList();
}

// ── TOGGLE ENABLE ──
/** @param {number} id */
function toggleSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (s) { s.enabled = s.enabled === false ? true : false; renderSheets(); _saveCutList(); }
}
let _lastToggleIdx = -1;

// ── ROW SELECTION (multi-row Excel-like edit) ──
// Keyed by piece.id (stable across drag-reorder, add, delete) — NOT by row index.
/** @type {Set<number>} */
let _clSelectedIds = new Set();
/** @type {number | null} */
let _clSelectionAnchorId = null;

/**
 * Returns the list of piece IDs to apply a mutation to. When the originating
 * piece is part of a multi-row selection, the change fans out to every selected
 * piece. Otherwise it stays scoped to the originating piece.
 * @param {number} id
 * @returns {number[]}
 */
function _bulkSelectedIds(id) {
  if (_clSelectedIds.has(id) && _clSelectedIds.size > 1) {
    return Array.from(_clSelectedIds);
  }
  return [id];
}

/**
 * MOUSEDOWN handler on each piece <tr>. Mousedown (not click) is critical:
 * when the user has focus in an input and shift-clicks another row, the input's
 * onblur fires *before* the click event would. The blur calls renderPieces(),
 * rebuilding the DOM between mousedown and mouseup, which can swallow the
 * click entirely — so the first shift-click would be lost. mousedown fires
 * first, so selection updates before blur cascades into a re-render.
 *
 * Click ANYWHERE on the row (including over an input) selects that row —
 * the input still gets focus from the browser default. Only buttons, the
 * include-checkbox, and the drag handle are excluded so their own handlers
 * stay the source of truth for those interactions.
 *
 * Updates CSS classes directly instead of re-rendering, preserving input focus.
 * @param {number} id
 * @param {MouseEvent} ev
 */
function _clRowMouseDown(id, ev) {
  if (ev.button !== 0) return; // ignore right/middle clicks
  const t = /** @type {HTMLElement} */ (ev.target);
  if (t.closest('button, .cl-drag-handle, .cl-check')) return;
  if (ev.shiftKey && _clSelectionAnchorId !== null) {
    // Suppress focus shift + text-selection on shift+mousedown in inputs.
    ev.preventDefault();
    const aIdx = pieces.findIndex(p => p.id === _clSelectionAnchorId);
    const cIdx = pieces.findIndex(p => p.id === id);
    if (aIdx >= 0 && cIdx >= 0) {
      const from = Math.min(aIdx, cIdx), to = Math.max(aIdx, cIdx);
      _clSelectedIds = new Set();
      for (let i = from; i <= to; i++) _clSelectedIds.add(pieces[i].id);
    } else {
      _clSelectedIds = new Set([id]);
      _clSelectionAnchorId = id;
    }
  } else if (ev.ctrlKey || ev.metaKey) {
    ev.preventDefault();
    if (_clSelectedIds.has(id)) _clSelectedIds.delete(id);
    else _clSelectedIds.add(id);
    _clSelectionAnchorId = id;
  } else {
    // Plain mousedown: only replace selection when the clicked row isn't already
    // part of a multi-selection. Lets the user multi-select first, then click
    // into any selected row's input to edit + bulk-apply.
    if (!_clSelectedIds.has(id)) _clSelectedIds = new Set([id]);
    _clSelectionAnchorId = id;
  }
  _updateRowSelectionClasses();
}

// Toggles the cl-row-selected class on each row in place so input focus
// survives selection changes (no full innerHTML re-render).
function _updateRowSelectionClasses() {
  const tbody = _byId('pieces-body');
  if (!tbody) return;
  const trs = tbody.querySelectorAll('tr');
  pieces.forEach(/** @param {any} p @param {number} i */ (p, i) => {
    const tr = /** @type {HTMLElement | undefined} */ (trs[i]);
    if (!tr) return;
    if (_clSelectedIds.has(p.id)) tr.classList.add('cl-row-selected');
    else tr.classList.remove('cl-row-selected');
  });
}

// Clears the visible selection but KEEPS the anchor so the next shift+click
// has something to extend from. The anchor is only reset when the anchor piece
// itself is deleted or the list is cleared. Without this, the user's first
// shift+click after clicking outside the table would silently fall through to
// a plain single-row select.
function _clClearSelection() {
  if (_clSelectedIds.size === 0) return;
  _clSelectedIds = new Set();
  _updateRowSelectionClasses();
}

/** @param {number} id @param {number} idx @param {boolean} checked @param {MouseEvent} [ev] */
function _clCheckboxClick(id, idx, checked, ev) {
  if (_clSelectedIds.has(id) && _clSelectedIds.size > 1) {
    // Bulk-apply checkbox toggle to all selected rows.
    for (const targetId of _clSelectedIds) {
      const p = pieces.find(x => x.id === targetId);
      if (p) p.enabled = checked;
    }
  } else if (ev && ev.shiftKey && _lastToggleIdx >= 0) {
    const from = Math.min(_lastToggleIdx, idx);
    const to = Math.max(_lastToggleIdx, idx);
    for (let i = from; i <= to; i++) pieces[i].enabled = checked;
  } else {
    pieces[idx].enabled = checked;
  }
  _lastToggleIdx = idx;
  renderPieces();
  _saveCutList();
}
/** @param {number} id */
function togglePiece(id) {
  const p = pieces.find(x => x.id === id);
  if (!p) return;
  const nextEnabled = !(p.enabled !== false);
  for (const targetId of _bulkSelectedIds(id)) {
    const tp = pieces.find(x => x.id === targetId);
    if (tp) tp.enabled = nextEnabled;
  }
  renderPieces();
  _saveCutList();
}
/** @param {boolean} checked */
function _clToggleAll(checked) {
  pieces.forEach(p => p.enabled = checked);
  renderPieces();
}

// ── STEP QTY ──
/** @param {string} type @param {number} id @param {number} delta */
function stepQty(type, id, delta) {
  const arr = type === 'sheet' ? sheets : pieces;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  const max = type === 'sheet' ? 99 : 999;
  if (type === 'piece') {
    // Bulk-apply: each selected piece increments/decrements relative to its own qty.
    for (const targetId of _bulkSelectedIds(id)) {
      const p = pieces.find(x => x.id === targetId);
      if (p) p.qty = Math.max(1, Math.min(max, (p.qty || 1) + delta));
    }
  } else {
    item.qty = Math.max(1, Math.min(max, (item.qty || 1) + delta));
  }
  type === 'sheet' ? renderSheets() : renderPieces();
  _saveCutList();
}

// ── COLUMN TOGGLE ──
function initColVisibility() {
  ['grain','material','notes','label','edgeband'].forEach(col => {
    const on = colsVisible[col];
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.cl-col-' + col)).forEach(el => { el.style.display = on ? '' : 'none'; });
    const pill = _byId('pill-' + col);
    if (pill) pill.classList.toggle('active', on);
  });
  const ebSec = _byId('cl-edgeband-section');
  if (ebSec) ebSec.style.display = colsVisible.edgeband ? '' : 'none';
  // Stock library placeholder mirrors the edge-band column state so the
  // search hint stays accurate after reload.
  const stockInp = /** @type {HTMLInputElement | null} */ (_byId('cl-stock'));
  if (stockInp) stockInp.placeholder = colsVisible.edgeband
    ? 'Load or add Sheet goods and Edge banding...'
    : 'Load or add Sheet goods...';
}
/** @param {string} col */
function toggleCol(col) {
  colsVisible[col] = !colsVisible[col];
  _saveCutList();
  const pill = _byId('pill-' + col);
  if (pill) pill.classList.toggle('active', colsVisible[col]);
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.cl-col-' + col)).forEach(el => {
    el.style.display = colsVisible[col] ? '' : 'none';
  });
}
function toggleGrainCol() {
  const turning_on = !colsVisible.grain;
  if (turning_on) {
    pieces.forEach(p => { if (!p.grain || p.grain === 'none') p.grain = 'h'; });
    sheets.forEach(s => { if (!s.grain || s.grain === 'none') s.grain = 'h'; });
  } else {
    pieces.forEach(p => { p.grain = 'none'; });
    sheets.forEach(s => { s.grain = 'none'; });
  }
  colsVisible.grain = turning_on;
  _saveCutList();
  renderPieces();
  renderSheets();
  const pill = _byId('pill-grain');
  if (pill) pill.classList.toggle('active', turning_on);
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.cl-col-grain')).forEach(el => {
    el.style.display = turning_on ? '' : 'none';
  });
  renderResults();
}

function toggleEdgeBandCol() {
  const turning_on = !colsVisible.edgeband;
  colsVisible.edgeband = turning_on;
  _saveCutList();
  const pill = _byId('pill-edgeband');
  if (pill) pill.classList.toggle('active', turning_on);
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.cl-col-edgeband')).forEach(el => {
    el.style.display = turning_on ? '' : 'none';
  });
  const section = _byId('cl-edgeband-section');
  if (section) section.style.display = turning_on ? '' : 'none';
  // Reflect the new scope in the stock library search placeholder so users
  // know edge banding is now searchable from the same box.
  const stockInp = /** @type {HTMLInputElement | null} */ (_byId('cl-stock'));
  if (stockInp) stockInp.placeholder = turning_on
    ? 'Load or add Sheet goods and Edge banding...'
    : 'Load or add Sheet goods...';
}

/** @param {any} p */
function hasAnyEdge(p) {
  const e = p.edges || {};
  return !!(e.L1 || e.W2 || e.L3 || e.W4);
}

/** @param {any} p */
function _ebIcon(p) {
  const e = p.edges || {};
  /** @param {string} side */
  const c = side => {
    const s = e[side];
    if (!s) return null;
    const mat = edgeBands.find(x => x.id === s.id);
    return mat ? mat.color : null;
  };
  /** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {string | null} col */
  const seg = (x1,y1,x2,y2,col) => col
    ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`
    : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="3 3"/>`;
  return `<svg width="16" height="12" viewBox="0 0 16 12" fill="none">
    ${seg(1,1,15,1,c('L1'))}${seg(15,1,15,11,c('W2'))}${seg(15,11,1,11,c('L3'))}${seg(1,11,1,1,c('W4'))}
  </svg>`;
}

function renderEdgeBands() {
  const tbody = _byId('edgebands-body');
  if (!tbody) return;
  if (!edgeBands.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--muted);font-size:11px;padding:8px 14px;text-align:center">No edge bands — click "+ Add edge band"</td></tr>`;
    return;
  }
  tbody.innerHTML = edgeBands.map(eb => `<tr>
    <td class="cl-del-cell" style="padding:0 2px;width:14px"></td>
    <td class="cl-del-cell">
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${eb.color};flex-shrink:0"></span>
    </td>
    <td style="padding:2px 4px">
      <input class="cl-input" value="${_escHtml(eb.name)}"
        style="font-size:12px;width:100%;border:0;background:transparent;box-shadow:none"
        onblur="updateEdgeBand(${eb.id},'name',this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"
        ${eb.glue?`title="Glue: ${_escHtml(eb.glue)}"`:''}>
    </td>
    <td><input class="cl-input cl-dim-input" value="${eb.length||''}" inputmode="decimal"
      onblur="updateEbLength(${eb.id},this.value)"
      onkeydown="if(event.key==='Enter')this.blur()"
      placeholder="m" title="Total length (m)"></td>
    <td><input class="cl-input cl-dim-input" value="${eb.width||''}" inputmode="decimal"
      onblur="updateEdgeBand(${eb.id},'width',parseFloat(this.value)||0)"
      onkeydown="if(event.key==='Enter')this.blur()"
      placeholder="mm" title="Strip width (mm)"></td>
    <td></td>
    <td></td>
    <td style="padding:0 2px;text-align:center">
      <input class="cl-input" value="${eb.thickness||''}" inputmode="decimal"
        style="width:28px;text-align:center;padding:2px 2px;border:0;background:transparent;box-shadow:none"
        onblur="updateEdgeBand(${eb.id},'thickness',parseFloat(this.value)||0)"
        onkeydown="if(event.key==='Enter')this.blur()"
        placeholder="0">
    </td>
    <td class="cl-col-grain" style="${colsVisible.grain?'':'display:none'}"></td>
    <td></td>
    <td class="cl-del-cell">
      <button class="cl-del-btn" onclick="removeEdgeBand(${eb.id})" title="Remove">${DEL_SVG}</button>
    </td>
  </tr>`).join('');
}

/** @param {number} id @param {number} delta */
function stepEbLength(id, delta) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb.length = Math.max(0, (eb.length || 0) + delta);
  renderEdgeBands();
  _saveCutList();
}

/** @param {number} id @param {string | number} text */
function updateEbLength(id, text) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb.length = Math.max(0, parseFloat(String(text)) || 0);
  renderEdgeBands();
  _saveCutList();
}

/** @param {string} name @param {number} [thickness] @param {number} [width] @param {string | null} [color] @param {number} [length] @param {string} [glue] */
function addEdgeBand(name, thickness, width, color, length, glue) {
  const eb = {
    id: _edgeBandId++,
    name: name || 'Edge Band',
    color: color || COLORS[pieceColorIdx++ % COLORS.length],
    thickness: thickness || 0,
    width: width || 0,
    length: length || 0,
    glue: glue || '',
  };
  edgeBands.push(eb);
  renderEdgeBands();
  renderPieces();
  _saveCutList();
  return eb;
}

/** @param {number} id @param {string} field @param {any} val */
function updateEdgeBand(id, field, val) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb[field] = val;
  renderEdgeBands();
  renderPieces();
  _saveCutList();
}

/** @param {number} id */
function removeEdgeBand(id) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  _confirm(`Remove edge band <strong>${_escHtml(eb.name)}</strong>?`, () => {
    edgeBands = edgeBands.filter(x => x.id !== id);
    pieces.forEach(p => {
      const e = p.edges || {};
      ['L1','W2','L3','W4'].forEach(side => {
        if (e[side] && e[side].id === id) e[side] = null;
      });
    });
    renderEdgeBands();
    renderPieces();
    _saveCutList();
  });
}

/** @param {number} pieceId */
function openEdgePopup(pieceId) {
  const p = pieces.find(x => x.id === pieceId);
  if (!p) return;
  // Work with a mutable copy of edges
  const draft = {
    L1: p.edges && p.edges.L1 ? {...p.edges.L1} : null,
    W2: p.edges && p.edges.W2 ? {...p.edges.W2} : null,
    L3: p.edges && p.edges.L3 ? {...p.edges.L3} : null,
    W4: p.edges && p.edges.W4 ? {...p.edges.W4} : null,
  };

  const accent = '#c9962b';
  // Panel SVG dimensions
  const maxW = 190, maxH = 230, svgPad = 38;
  const aspect = p.w / p.h;
  /** @type {number} */ let rw;
  /** @type {number} */ let rh;
  if (aspect >= 1) { rw = maxW; rh = Math.round(maxW / aspect); }
  else { rh = maxH; rw = Math.round(maxH * aspect); }
  const svgW = rw + svgPad*2, svgH = rh + svgPad*2;
  const rx = svgPad, ry = svgPad;
  const pColor = toPastel ? toPastel(p.color) : '#e8f0fe';

  /** @param {any} ed */
  function buildSVG(ed) {
    /** @param {string} side */
    const thk = side => {
      const s = ed[side];
      if (!s || !s.trim) return 0;
      const mat = edgeBands.find(x => x.id === s.id);
      return mat ? (mat.thickness || 0) : 0;
    };
    const cutW = p.w - thk('W2') - thk('W4');
    const cutH = p.h - thk('L1') - thk('L3');
    const pw = p.w, ph = p.h;

    // Grain lines
    let grainLines = '';
    if (p.grain !== 'none') {
      const gdir = p.grain;
      const sp = 10;
      grainLines = `<clipPath id="pgclip"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"/></clipPath><g clip-path="url(#pgclip)" stroke="${p.color}" stroke-width="0.5" opacity="0.4">`;
      if (gdir === 'h') {
        for (let y2 = ry+sp; y2 < ry+rh; y2 += sp) grainLines += `<line x1="${rx}" y1="${y2}" x2="${rx+rw}" y2="${y2}"/>`;
      } else {
        for (let x2 = rx+sp; x2 < rx+rw; x2 += sp) grainLines += `<line x1="${x2}" y1="${ry}" x2="${x2}" y2="${ry+rh}"/>`;
      }
      grainLines += '</g>';
    }

    // Dashed edge band lines (inset 5px, corner-aware)
    const inset = 5;
    let edgeLines = '';
    const sides2 = [
      {side:'L1', x1:rx+inset, y1:ry+inset, x2:rx+rw-inset, y2:ry+inset},
      {side:'W2', x1:rx+rw-inset, y1:ry+inset, x2:rx+rw-inset, y2:ry+rh-inset},
      {side:'L3', x1:rx+rw-inset, y1:ry+rh-inset, x2:rx+inset, y2:ry+rh-inset},
      {side:'W4', x1:rx+inset, y1:ry+rh-inset, x2:rx+inset, y2:ry+inset},
    ];
    sides2.forEach(({side, x1, y1, x2, y2}) => {
      const s = ed[side]; if (!s) return;
      const mat = edgeBands.find(x => x.id === s.id); if (!mat) return;
      edgeLines += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${mat.color}" stroke-width="2.5" stroke-dasharray="4,3" stroke-linecap="round"/>`;
    });

    // Dim labels (cut dims, gold when trimmed)
    /** @param {number} cut @param {number} fin @param {string} lbl */
    const fmtDim = (cut, fin, lbl) => {
      const trimmed = cut !== fin;
      const numColor = trimmed ? accent : '#888';
      const numWeight = trimmed ? '700' : '400';
      return `<tspan fill="${numColor}" font-weight="${numWeight}">${formatDim(cut)}</tspan><tspan fill="#aaa"> [${lbl}]</tspan>`;
    };

    const dimLabels = `
      <text x="${rx+rw/2}" y="${ry-9}" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutW,pw,'L1')}</text>
      <text x="${rx+rw/2}" y="${ry+rh+18}" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutW,pw,'L3')}</text>
      <text transform="translate(${rx+rw+18},${ry+rh/2}) rotate(90)" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutH,ph,'W2')}</text>
      <text transform="translate(${rx-9},${ry+rh/2}) rotate(-90)" text-anchor="middle" font-size="11" font-family="-apple-system,sans-serif">${fmtDim(cutH,ph,'W4')}</text>
    `;

    return `<svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${pColor}" stroke="${p.color}" stroke-width="1"/>
      ${grainLines}${edgeLines}${dimLabels}
    </svg>`;
  }

  /** @param {any} ed */
  function buildTable(ed) {
    /** @param {string} side */
    const thk = side => {
      const s = ed[side];
      if (!s || !s.trim) return 0;
      const mat = edgeBands.find(x => x.id === s.id);
      return mat ? (mat.thickness || 0) : 0;
    };
    const cutW = p.w - thk('W2') - thk('W4');
    const cutH = p.h - thk('L1') - thk('L3');
    /** @type {Record<string, number>} */
    const tapeDim = {L1:cutW, W2:cutH, L3:cutW, W4:cutH};
    /** @type {Record<string, number>} */
    const finDim  = {L1:p.w,  W2:p.h,  L3:p.w,  W4:p.h};
    const accent2 = '#c9962b';

    const ebOpts = `<option value="">— None —</option>` + edgeBands.map(eb =>
      `<option value="${eb.id}">${_escHtml(eb.name)}</option>`
    ).join('');

    return ['L1','W2','L3','W4'].map(/** @param {string} side */ side => {
      const s = ed[side];
      const selId = s ? s.id : '';
      const mat = selId ? edgeBands.find(x => x.id === selId) : null;
      const borderStyle = mat ? `border-left:3px solid ${mat.color}` : '';
      const trim = s ? s.trim : false;
      const fin = finDim[side], cut = tapeDim[side];
      const tapeStr = cut !== fin
        ? `${fin} → <span style="color:${accent2};font-weight:600">${cut}</span>mm`
        : `${fin}mm`;
      return `<tr>
        <td style="padding:5px 8px;font-size:12px;font-weight:600;color:var(--text)">${side}</td>
        <td style="padding:5px 8px;font-size:12px;color:var(--muted)">${tapeStr}</td>
        <td style="padding:3px 4px">
          <select class="cl-input" style="font-size:11px;padding:3px 4px;${borderStyle};border-radius:3px"
            onchange="_ebUpdateSide('${side}',this.value,'${pieceId}')">
            ${ebOpts.replace(`value="${selId}"`,`value="${selId}" selected`)}
          </select>
        </td>
        <td style="padding:3px 8px;white-space:nowrap">
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)">
            <input type="checkbox" ${trim?'checked':''} ${!s?'disabled':''} onchange="_ebUpdateTrim('${side}',this.checked,'${pieceId}')"> Trim
          </label>
        </td>
      </tr>`;
    }).join('');
  }

  const html = `
    <div class="popup-header">
      <div class="popup-title">Edge Banding — ${_escHtml(p.label)}</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding-bottom:8px">
      <div id="_eb_svg_wrap" style="margin-top:4px">${buildSVG(draft)}</div>
      <table style="width:100%;border-collapse:collapse" id="_eb_table">
        <thead><tr style="font-size:11px;color:var(--muted)">
          <th style="text-align:left;padding:3px 8px">Side</th>
          <th style="text-align:left;padding:3px 8px">Tape</th>
          <th style="text-align:left;padding:3px 4px">Edge Band</th>
          <th style="padding:3px 8px"></th>
        </tr></thead>
        <tbody id="_eb_tbody">${buildTable(draft)}</tbody>
      </table>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_ebSave(${pieceId})">Save</button>
    </div>`;

  // Store draft on window for live updates
  window._ebDraft = draft;
  window._ebPieceId = pieceId;
  window._ebBuildSVG = buildSVG;
  window._ebBuildTable = buildTable;
  _openPopup(html, 'md');
}

/** @param {string} side @param {any} val @param {number} pieceId */
function _ebUpdateSide(side, val, pieceId) {
  const d = window._ebDraft;
  if (!d) return;
  const id = val ? parseInt(val) : null;
  if (id) {
    d[side] = { id, trim: d[side] ? d[side].trim : false };
  } else {
    d[side] = null;
  }
  // Refresh SVG and table
  const sw = _byId('_eb_svg_wrap');
  if (sw && window._ebBuildSVG) sw.innerHTML = window._ebBuildSVG(d);
  const tb = _byId('_eb_tbody');
  if (tb && window._ebBuildTable) tb.innerHTML = window._ebBuildTable(d);
}

/** @param {string} side @param {boolean} checked @param {number} pieceId */
function _ebUpdateTrim(side, checked, pieceId) {
  const d = window._ebDraft;
  if (!d || !d[side]) return;
  d[side].trim = checked;
  const sw = _byId('_eb_svg_wrap');
  if (sw && window._ebBuildSVG) sw.innerHTML = window._ebBuildSVG(d);
  const tb = _byId('_eb_tbody');
  if (tb && window._ebBuildTable) tb.innerHTML = window._ebBuildTable(d);
}

/** @param {number} pieceId */
function _ebSave(pieceId) {
  const p = pieces.find(x => x.id === pieceId);
  if (!p || !window._ebDraft) return;
  // Bulk-apply edge band assignments to every selected piece.
  for (const targetId of _bulkSelectedIds(pieceId)) {
    const tp = pieces.find(x => x.id === targetId);
    if (tp) tp.edges = { ...window._ebDraft };
  }
  _closePopup();
  renderPieces();
  _saveCutList();
}

function _openNewEdgeBandMaterialPopup() {
  const h = `
    <div class="popup-header">
      <div class="popup-title">New Edge Band Material</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body">
      <div class="pf"><label>Name</label><input type="text" id="eb-new-name" class="form-control" placeholder="e.g. PVC 1mm White" value=""></div>
      <div style="display:flex;gap:12px">
        <div class="pf" style="flex:1"><label>Thickness (mm)</label><input type="number" id="eb-new-thickness" class="form-control" placeholder="e.g. 1" min="0" step="0.1"></div>
        <div class="pf" style="flex:1"><label>Width (mm)</label><input type="number" id="eb-new-width" class="form-control" placeholder="e.g. 22" min="0"></div>
        <div class="pf" style="flex:1"><label>Length (m)</label><input type="number" id="eb-new-length" class="form-control" placeholder="e.g. 50" min="0" step="0.1"></div>
      </div>
      <div class="pf">
        <label>Glue Type</label>
        <select id="eb-new-glue" class="form-control">
          <option value="EVA" selected>EVA</option>
          <option value="PUR">PUR</option>
          <option value="Laser">Laser</option>
          <option value="Hot Melt">Hot Melt</option>
          <option value="Pre-glued">Pre-glued</option>
          <option value="None">None</option>
        </select>
      </div>
      <div class="pf">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" id="eb-new-save-stock"> Save to Stock Library
        </label>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveNewEdgeBandMaterial()">Add Edge Band</button>
    </div>`;
  _openPopup(h, 'sm');
  setTimeout(() => {
    _byId('eb-new-name')?.focus();
  }, 50);
}

function _saveNewEdgeBandMaterial() {
  const name = (_popupVal('eb-new-name') || '').trim();
  if (!name) { _toast('Please enter a name', 'error'); return; }
  const thickness = parseFloat(_byId('eb-new-thickness')?.value ?? '') || 0;
  const width = parseFloat(_byId('eb-new-width')?.value ?? '') || 0;
  const length = parseFloat(_byId('eb-new-length')?.value ?? '') || 0;
  const glue = _byId('eb-new-glue')?.value || '';
  const saveStock = _byId('eb-new-save-stock')?.checked;

  const eb = addEdgeBand(name, thickness, width, null, length, glue);
  _closePopup();

  if (saveStock && window.stockItems) {
    const id = Date.now();
    window.stockItems.push({
      id,
      name,
      w: length,
      h: width,
      qty: Math.round(length),
      low: 0,
      cost: 0,
      thickness,
      width,
      length,
      glue,
    });
    _scSet(id, 'Edge Banding');
    _svSet(id, { variant: '', thickness, width, length, glue });
    if (window._saveStock) window._saveStock();
    else if (window.saveStockItems) window.saveStockItems();
  }
  _toast(`Added ${name}`, 'success');
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

// ── DRAG REORDER ──
/** @param {DragEvent} e @param {string} table @param {number} idx */
function onDragStart(e, table, idx) {
  _dragSrc = idx; _dragTable = table;
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}
/** @param {DragEvent} e @param {HTMLElement} row */
function onDragOver(e, row) {
  e.preventDefault();
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  row.classList.add('cl-drag-over');
}
/** @param {DragEvent} e @param {string} table @param {number} idx */
function onDrop(e, table, idx) {
  e.preventDefault();
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  if (_dragTable !== table || _dragSrc === null || _dragSrc === idx) return;
  const arr = table === 'pieces' ? pieces : sheets;
  const [item] = arr.splice(_dragSrc, 1);
  arr.splice(idx, 0, item);
  _dragSrc = null;
  table === 'pieces' ? renderPieces() : renderSheets();
}
function onDragEnd() {
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
}

// ── ROW SELECTION — click-outside to clear ──
// Mousedown on anything outside the pieces table clears the selection. Wired
// once at boot to avoid duplicate listeners on re-render.
(function() {
  const wire = () => {
    document.addEventListener('mousedown', (e) => {
      if (_clSelectedIds.size === 0) return;
      const t = /** @type {HTMLElement} */ (e.target);
      if (!t || !t.closest) return;
      // Stay selected when interacting with the pieces table itself, popups
      // (where edge band edits happen), or any cl-* surface.
      if (t.closest('#pieces-table, .popup-overlay, .popup, .cl-toolbar, .cl-pill, .layout-toolbar')) return;
      _clClearSelection();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

// ── SHEETS ──
/** @param {string} [name] @param {number} [w] @param {number} [h] @param {number} [qty] @param {string} [grain] */
function addSheet(name, w, h, qty, grain) {
  const m = window.units === 'metric';
  // Default name: next free "Sheet N", skipping numbers already in use.
  let sheetName = name;
  if (sheetName === undefined) {
    let maxN = 0;
    for (const s of sheets) {
      const sm = (s.name || '').match(/^Sheet (\d+)$/);
      if (sm) maxN = Math.max(maxN, parseInt(sm[1], 10));
    }
    sheetName = `Sheet ${maxN + 1}`;
  }
  sheets.push({
    id:      _sheetId++,
    name:    sheetName,
    w:       w    !== undefined ? w    : (m ? 2440 : 96),
    h:       h    !== undefined ? h    : (m ? 1220 : 48),
    qty:     qty  !== undefined ? qty  : 1,
    grain:   (grain !== undefined && grain !== '') ? grain : 'none',
    kerf:    m ? 3 : 0.125,
    enabled: true,
    color:   COLORS[pieceColorIdx++ % COLORS.length],
  });
  renderSheets();
  renderPieces(); // refresh material dropdowns
  _saveCutList();
}

/** @param {number} id */
function removeSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (!s) return;
  _confirm(`Delete panel <strong>${_escHtml(s.name || 'Untitled')}</strong>?`, () => {
    sheets = sheets.filter(x => x.id !== id);
    renderSheets();
    renderPieces();
    _saveCutList();
  });
}

/** @param {number} id */
function duplicateSheet(id) {
  const s = sheets.find(s => s.id === id);
  if (!s) return;
  const idx = sheets.indexOf(s);
  const copy = { ...s, id: _sheetId++, name: s.name + ' (copy)', color: COLORS[pieceColorIdx++ % COLORS.length] };
  sheets.splice(idx + 1, 0, copy);
  renderSheets();
  renderPieces();
}

/** @param {number} id @param {string} field @param {any} val */
function updateSheet(id, field, val) {
  const s = sheets.find(s => s.id === id);
  if (!s) return;
  if (field === 'w' || field === 'h') { const v = parseDim(val); s[field] = v; }
  else if (field === 'qty') s[field] = Math.max(1, parseInt(val) || 1);
  else s[field] = val;
  renderSheets();
  renderPieces();
  _saveCutList();
}

const DRAG_HANDLE = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>`;

function renderSheets() {
  const tbody = _byId('sheets-body');
  if (!tbody) return;
  if (!sheets.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--muted);font-size:11px;padding:10px 14px;text-align:center">No panels — click "+ Add panel"</td></tr>`;
    return;
  }
  tbody.innerHTML = sheets.map((s, i) => {
    const dis = s.enabled === false;
    return `<tr class="${dis ? 'cl-row-disabled' : ''}"
      draggable="true"
      ondragstart="onDragStart(event,'sheets',${i})"
      ondragover="onDragOver(event,this)"
      ondrop="onDrop(event,'sheets',${i})"
      ondragend="onDragEnd()">
      <td class="cl-del-cell" style="padding:0 2px;width:14px">
        <span class="cl-drag-handle" title="Drag to reorder">${DRAG_HANDLE}</span>
      </td>
      <td class="cl-del-cell">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${s.color || 'var(--muted)'};flex-shrink:0"></span>
      </td>
      <td><input class="cl-input" value="${s.name.replace(/"/g,'&quot;')}"
        data-table="sheets" data-row="${i}" data-col="name"
        onblur="updateSheet(${s.id},'name',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'name')"
        ${dis ? 'disabled' : ''} placeholder="Material"></td>
      <td><input class="cl-input cl-dim-input" value="${formatDim(s.w)}"
        data-table="sheets" data-row="${i}" data-col="w"
        onblur="updateSheet(${s.id},'w',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'w')"
        ${dis ? 'disabled' : ''}></td>
      <td><input class="cl-input cl-dim-input" value="${formatDim(s.h)}"
        data-table="sheets" data-row="${i}" data-col="h"
        onblur="updateSheet(${s.id},'h',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'h')"
        ${dis ? 'disabled' : ''}></td>
      <td>
        <div class="cl-stepper">
          <button class="cl-step-btn" onmousedown="event.preventDefault();stepQty('sheet',${s.id},-1)">−</button>
          <input class="cl-input cl-qty-input" value="${s.qty}"
            data-table="sheets" data-row="${i}" data-col="qty"
            onblur="updateSheet(${s.id},'qty',this.value)"
            onkeydown="clKeydown(event,'sheets',${i},'qty')"
            min="1" max="99" ${dis ? 'disabled' : ''}>
          <button class="cl-step-btn" onmousedown="event.preventDefault();stepQty('sheet',${s.id},1)">+</button>
        </div>
      </td>
      <td></td>
      <td style="padding:0 2px;text-align:center">
        <input class="cl-input" value="${s.kerf ?? (window.units==='metric'?3:0.125)}"
          style="width:28px;text-align:center;padding:2px 2px;border:0;background:transparent;box-shadow:none" inputmode="decimal"
          onblur="updateSheet(${s.id},'kerf',parseFloat(this.value)||0)"
          onkeydown="if(event.key==='Enter')this.blur()"
          ${dis ? 'disabled' : ''} placeholder="0">
      </td>
      <td class="cl-grain-cell cl-col-grain" style="${colsVisible.grain?'':'display:none'}">
        <button class="cl-grain-btn${s.grain !== 'none' ? ' active' : ''}"
          onclick="cycleGrain(${s.id},'sheet')" title="Grain: ${s.grain}">${grainIcon(s.grain)}</button>
      </td>
      <td></td>
      <td class="cl-del-cell">
        <button class="cl-del-btn" onclick="removeSheet(${s.id})" title="Remove">${DEL_SVG}</button>
      </td>
    </tr>`;
  }).join('');
  _saveCutList();
}

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

// ── PIECES ──
/** @param {string} [label] @param {number} [w] @param {number} [h] @param {number} [qty] @param {string} [grain] @param {string} [material] @param {string} [notes] */
function addPiece(label, w, h, qty, grain, material, notes) {
  const m = window.units === 'metric';
  const color = COLORS[pieceColorIdx++ % COLORS.length];
  const prevMat = pieces.length > 0 ? (pieces[pieces.length-1].material || '') : '';
  // Default name: next free "Panel N", skipping numbers already in use.
  let pieceLabel = label;
  if (pieceLabel === undefined) {
    let maxN = 0;
    for (const q of pieces) {
      const qm = (q.label || '').match(/^Panel (\d+)$/);
      if (qm) maxN = Math.max(maxN, parseInt(qm[1], 10));
    }
    pieceLabel = `Panel ${maxN + 1}`;
  }
  pieces.push({
    id:       _pieceId++,
    label:    pieceLabel,
    w:        w     !== undefined ? w     : (m ? 300 : 12),
    h:        h     !== undefined ? h     : (m ? 600 : 24),
    qty:      qty   !== undefined ? qty   : 1,
    grain:    (grain !== undefined && grain !== '') ? grain : 'none',
    material: (material !== undefined && material !== '') ? material : prevMat,
    notes:    notes || '',
    enabled:  true,
    color,
    edges:    {L1:null,W2:null,L3:null,W4:null},
  });
  renderPieces();
  _saveCutList();
}

/** @param {number} id */
function removePiece(id) {
  const p = pieces.find(x => x.id === id);
  if (!p) return;
  _confirm(`Delete part <strong>${_escHtml(p.label || 'Untitled')}</strong>?`, () => {
    pieces = pieces.filter(x => x.id !== id);
    // Drop the deleted id from the selection set (keeps remaining selection valid).
    if (_clSelectedIds.has(id)) _clSelectedIds.delete(id);
    if (_clSelectionAnchorId === id) _clSelectionAnchorId = null;
    renderPieces();
    _saveCutList();
  });
}

/** @param {number} id */
function duplicatePiece(id) {
  const p = pieces.find(p => p.id === id);
  if (!p) return;
  const idx = pieces.indexOf(p);
  // Sequential copy naming: "Side Panel" → "Side Panel 2" → "Side Panel 3" …
  // Strip any trailing " N" from the source to get the base, then pick the next
  // number not already used among pieces sharing that base.
  const srcLabel = p.label || '';
  const m = srcLabel.match(/^(.*?)\s+(\d+)$/);
  const base = m ? m[1] : srcLabel;
  let maxN = 1;
  for (const q of pieces) {
    if (!q.label) continue;
    if (q.label === base) continue;  // "base" alone counts as N=1 (implicit)
    const qm = q.label.match(/^(.*?)\s+(\d+)$/);
    if (qm && qm[1] === base) {
      const n = parseInt(qm[2], 10);
      if (n > maxN) maxN = n;
    }
  }
  const copy = { ...p, id: _pieceId++, label: `${base} ${maxN + 1}`, color: COLORS[pieceColorIdx++ % COLORS.length] };
  pieces.splice(idx + 1, 0, copy);
  renderPieces();
}

/** @param {number} id @param {string} field @param {any} val */
function updatePiece(id, field, val) {
  const p = pieces.find(p => p.id === id);
  if (!p) return;
  // Process the value once, then fan out to every selected piece (or just this one).
  /** @type {any} */
  let processed;
  if (field === 'w' || field === 'h') processed = parseDim(val);
  else if (field === 'qty') processed = Math.max(1, parseInt(val) || 1);
  else processed = val;
  for (const targetId of _bulkSelectedIds(id)) {
    const tp = pieces.find(x => x.id === targetId);
    if (tp) tp[field] = processed;
  }
  renderPieces();
  _saveCutList();
}

function renderPieces() {
  const tbody = _byId('pieces-body');
  if (!tbody) return;
  if (!pieces.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--muted);font-size:11px;padding:10px 14px;text-align:center">No parts — click "+ Add part"</td></tr>`;
    return;
  }
  /** @param {string} sel */
  const makeOpts = (sel) => {
    let o = '';
    sheets.forEach(s => { o += `<option value="${s.name.replace(/"/g,'&quot;')}"${s.name===sel?' selected':''}>${s.name}</option>`; });
    return o;
  };
  tbody.innerHTML = pieces.map((p, i) => {
    const dis = p.enabled === false;
    const sel = _clSelectedIds.has(p.id);
    const rowClasses = [dis ? 'cl-row-disabled' : '', sel ? 'cl-row-selected' : ''].filter(Boolean).join(' ');
    return `<tr class="${rowClasses}"
      draggable="true"
      onmousedown="_clRowMouseDown(${p.id}, event)"
      ondragstart="onDragStart(event,'pieces',${i})"
      ondragover="onDragOver(event,this)"
      ondrop="onDrop(event,'pieces',${i})"
      ondragend="onDragEnd()">
      <td style="padding:0 2px;width:14px">
        <span class="cl-drag-handle" title="Drag to reorder">${DRAG_HANDLE}</span>
      </td>
      <td class="cl-del-cell">
        <span class="cl-piece-dot" title="${dis ? 'Disabled' : 'Enabled'}">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dis?'var(--muted)':p.color};flex-shrink:0"></span>
        </span>
      </td>
      <td class="cl-col-label" style="${colsVisible.label?'':'display:none'}">
        <input class="cl-input" value="${p.label.replace(/"/g,'&quot;')}"
          data-table="pieces" data-row="${i}" data-col="label"
          onblur="updatePiece(${p.id},'label',this.value)"
          onkeydown="clKeydown(event,'pieces',${i},'label')"
          ${dis ? 'disabled' : ''} placeholder="Label">
      </td>
      <td><input class="cl-input cl-dim-input" value="${formatDim(p.w)}"
        data-table="pieces" data-row="${i}" data-col="w"
        onblur="updatePiece(${p.id},'w',this.value)"
        onkeydown="clKeydown(event,'pieces',${i},'w')"
        ${dis ? 'disabled' : ''}></td>
      <td><input class="cl-input cl-dim-input" value="${formatDim(p.h)}"
        data-table="pieces" data-row="${i}" data-col="h"
        onblur="updatePiece(${p.id},'h',this.value)"
        onkeydown="clKeydown(event,'pieces',${i},'h')"
        ${dis ? 'disabled' : ''}></td>
      <td>
        <div class="cl-stepper">
          <button class="cl-step-btn" tabindex="-1" onmousedown="event.preventDefault();stepQty('piece',${p.id},-1)">−</button>
          <input class="cl-input cl-qty-input" value="${p.qty}"
            data-table="pieces" data-row="${i}" data-col="qty"
            onblur="updatePiece(${p.id},'qty',this.value)"
            onkeydown="clKeydown(event,'pieces',${i},'qty')"
            min="1" max="999" ${dis ? 'disabled' : ''}>
          <button class="cl-step-btn" tabindex="-1" onmousedown="event.preventDefault();stepQty('piece',${p.id},1)">+</button>
        </div>
      </td>
      <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}">
        <select class="cl-input" tabindex="-1" style="font-size:11px;padding:3px 4px;border-radius:3px"
          onchange="updatePiece(${p.id},'material',this.value)" ${dis ? 'disabled' : ''}>
          ${makeOpts(p.material)}
        </select>
      </td>
      <td class="cl-col-edgeband" style="${colsVisible.edgeband?'':'display:none'}">
        <button class="cl-grain-btn${hasAnyEdge(p) ? ' active' : ''}" tabindex="-1" onclick="openEdgePopup(${p.id})" title="Edge banding">${_ebIcon(p)}</button>
      </td>
      <td class="cl-grain-cell cl-col-grain" style="${colsVisible.grain?'':'display:none'}">
        <button class="cl-grain-btn${p.grain !== 'none' ? ' active' : ''}" tabindex="-1"
          onclick="cycleGrain(${p.id},'piece')" title="Grain: ${p.grain}">${grainIcon(p.grain)}</button>
      </td>
      <td class="cl-del-cell" style="text-align:center">
        <span class="cl-check-wrap"><input type="checkbox" class="cl-check" tabindex="-1" ${dis ? '' : 'checked'} onclick="_clCheckboxClick(${p.id},${i},this.checked,event)" title="Include in layout&#10;Shift+click to select range"></span>
      </td>
      <td class="cl-del-cell" style="text-align:center">
        <button class="cl-del-btn" tabindex="-1" onclick="removePiece(${p.id})" title="Remove">${DEL_SVG}</button>
      </td>
    </tr>`;
  }).join('');

  // Totals footer
  const tot = _byId('pieces-totals');
  if (tot) {
    const enabled = pieces.filter(p => p.enabled !== false);
    const totalQty = enabled.reduce((s,p) => s+p.qty, 0);
    const totalArea = enabled.reduce((s,p) => s + p.w * p.h * p.qty, 0);
    const m = window.units === 'metric';
    const areaStr = m
      ? `${(totalArea / 1e6).toFixed(2)} m²`
      : `${(totalArea / 144).toFixed(1)} ft²`;
    tot.textContent = pieces.length ? `${totalQty} piece${totalQty!==1?'s':''} · ${areaStr} total` : '';
  }
  _saveCutList();
}

// ── KEYBOARD NAV ──
/** @type {Record<string, string[]>} */
const CL_COLS = { pieces: ['label','w','h','qty'], sheets: ['name','w','h','qty'] };
/** @param {KeyboardEvent} event @param {string} tableId @param {number} rowIdx @param {string} colName */
function clKeydown(event, tableId, rowIdx, colName) {
  if (event.key !== 'Tab' && event.key !== 'Enter') return;
  event.preventDefault();
  const cols = CL_COLS[tableId];
  const colIdx = cols.indexOf(colName);
  const arr = tableId === 'pieces' ? pieces : sheets;

  // Commit the current input's value to state NOW, and null out its onblur.
  // Otherwise the pending blur (triggered when we move focus below) fires
  // updatePiece/updateSheet → renderPieces/renderSheets, which rebuilds the
  // entire tbody and destroys the input we're about to focus, causing the
  // browser to drop focus outside the table.
  const curEl = /** @type {HTMLInputElement | null} */ (event.target);
  if (curEl && 'value' in curEl) {
    const item = arr[rowIdx];
    if (item) {
      if (colName === 'w' || colName === 'h') item[colName] = parseDim(curEl.value);
      else if (colName === 'qty') item[colName] = Math.max(1, parseInt(curEl.value) || 1);
      else item[colName] = curEl.value;
    }
    curEl.onblur = null;
  }

  if (event.key === 'Enter') {
    // Enter = duplicate current row
    const item = arr[rowIdx];
    if (item && tableId === 'pieces') {
      duplicatePiece(item.id);
      setTimeout(() => focusClCell(tableId, rowIdx + 1, cols[0]), 30);
    } else if (item) {
      // For sheets, just move to next row or add new
      if (rowIdx + 1 < arr.length) focusClCell(tableId, rowIdx + 1, colName);
      else { addSheet(); setTimeout(() => focusClCell(tableId, arr.length - 1, cols[0]), 30); }
    }
  } else { // Tab
    const next = event.shiftKey ? colIdx - 1 : colIdx + 1;
    if (next >= 0 && next < cols.length) {
      focusClCell(tableId, rowIdx, cols[next]);
    } else if (next >= cols.length) {
      if (rowIdx + 1 < arr.length) focusClCell(tableId, rowIdx + 1, cols[0]);
      else { tableId === 'pieces' ? addPiece() : addSheet(); setTimeout(() => focusClCell(tableId, arr.length - 1, cols[0]), 30); }
    } else {
      if (rowIdx > 0) focusClCell(tableId, rowIdx - 1, cols[cols.length - 1]);
    }
  }
}
/** @param {string} tableId @param {number} rowIdx @param {string} colName */
function focusClCell(tableId, rowIdx, colName) {
  const el = /** @type {HTMLInputElement | null} */ (document.querySelector(`[data-table="${tableId}"][data-row="${rowIdx}"][data-col="${colName}"]`));
  if (el) { el.focus(); try { el.select(); } catch(e) {} }
}

// ── PASTE FROM SPREADSHEET ──
document.addEventListener('paste', function(e) {
  const target = /** @type {HTMLElement | null} */ (e.target);
  if (!target || !target.dataset || !target.dataset.table) return;
  const cd = e.clipboardData || /** @type {any} */ (window).clipboardData;
  const text = cd ? cd.getData('text') : '';
  const rows = text.trim().split(/\r?\n/);
  if (rows.length <= 1 && !text.includes('\t')) return;
  e.preventDefault();
  const tableId = target.dataset.table;
  const rowIdx  = parseInt(target.dataset.row ?? '') || 0;
  const cols    = CL_COLS[tableId];
  const startCI = cols.indexOf(target.dataset.col ?? '');
  rows.forEach(/** @param {string} row @param {number} ri */ (row, ri) => {
    const cells = row.split('\t');
    const ai = rowIdx + ri;
    const arr = tableId === 'pieces' ? pieces : sheets;
    while (arr.length <= ai) tableId === 'pieces' ? addPiece() : addSheet();
    cells.forEach(/** @param {string} cell @param {number} ci */ (cell, ci) => {
      const coli = startCI + ci;
      if (coli >= cols.length) return;
      const cn = cols[coli];
      const item = arr[ai];
      if (!item) return;
      if (cn === 'w' || cn === 'h') item[cn] = parseDim(cell.trim());
      else if (cn === 'qty') item[cn] = Math.max(1, parseInt(cell.trim()) || 1);
      else item[cn] = cell.trim();
    });
  });
  tableId === 'pieces' ? renderPieces() : renderSheets();
  setTimeout(() => focusClCell(tableId, rowIdx + rows.length - 1, cols[startCI]), 30);
});

// ── CSV ──
// Per-side edge band cell format: the band's name, with a `|trim` suffix when
// the band is set to trim the panel (e.g. "Oak 22mm|trim"). Import matches the
// name against the cut list's edge bands case-insensitively.
/** @param {{id:number,trim?:boolean}|null} e */
function _edgeCell(e) {
  if (!e) return '';
  const band = edgeBands.find(b => b.id === e.id);
  if (!band) return '';
  return band.name + (e.trim ? '|trim' : '');
}
/** @param {string} cell @returns {{id:number,trim:boolean}|null} */
function _edgeFromCell(cell) {
  const v = (cell || '').trim();
  if (!v) return null;
  const [name, ...flags] = v.split('|');
  const band = edgeBands.find(b => (b.name || '').toLowerCase() === name.trim().toLowerCase());
  if (!band) return null;
  return { id: band.id, trim: flags.some(f => f.trim().toLowerCase() === 'trim') };
}
/** @param {string} type */
function exportCSV(type) {
  if (type === 'pieces') {
    /** @type {any[][]} */
    const rows = [['Label','W','H','Qty','Grain','Material','Notes','Edge L1','Edge W2','Edge L3','Edge W4']];
    pieces.forEach(p => rows.push([
      p.label, p.w, p.h, p.qty, p.grain||'none', p.material||'', p.notes||'',
      _edgeCell(p.edges?.L1), _edgeCell(p.edges?.W2), _edgeCell(p.edges?.L3), _edgeCell(p.edges?.W4),
    ]));
    _csvDownload(rows, 'cut-parts.csv');
  } else {
    /** @type {any[][]} */
    const rows = [['Material','W','H','Qty','Grain']];
    sheets.forEach(s => rows.push([s.name, s.w, s.h, s.qty, s.grain||'none']));
    _csvDownload(rows, 'stock-panels.csv');
  }
}
/** @param {string} type */
function downloadTemplate(type) {
  const csv = type === 'pieces'
    ? 'Label,W,H,Qty,Grain,Material,Notes,Edge L1,Edge W2,Edge L3,Edge W4\nSide Panel,23.25,30,2,none,3/4" Plywood,Sand before finish,,,,'
    : 'Material,W,H,Qty,Grain\n3/4" Plywood,96,48,5,none';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: type==='pieces'?'parts-template.csv':'panels-template.csv' });
  a.click();
}
/** @param {string} type */
function triggerImportCSV(type) {
  _csvImportTarget = type;
  const inp = _byId('csv-import-input');
  if (!inp) return;
  inp.value = ''; inp.click();
}
/** @param {HTMLInputElement} input */
function handleCSVImport(input) {
  const file = input.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = /** @type {string} */ (/** @type {FileReader} */ (e.target).result);
    const rows = _csvParse(text);
    if (!rows.length) return;
    const isPieces = _csvImportTarget === 'pieces';
    const col = _csvCol(rows[0], isPieces ? {
      label:    ['label', 'name', 'part'],
      w:        ['w', 'width', 'wmm', 'win'],
      h:        ['h', 'height', 'hmm', 'hin', 'length'],
      qty:      ['qty', 'quantity'],
      grain:    ['grain'],
      material: ['material'],
      notes:    ['notes', 'note'],
      edgeL1:   ['edgel1', 'l1'],
      edgeW2:   ['edgew2', 'w2'],
      edgeL3:   ['edgel3', 'l3'],
      edgeW4:   ['edgew4', 'w4'],
    } : {
      label: ['material', 'name', 'sheet', 'panel'],
      w:     ['w', 'width', 'wmm', 'win'],
      h:     ['h', 'height', 'hmm', 'hin', 'length'],
      qty:   ['qty', 'quantity'],
      grain: ['grain'],
    });
    // Headerless file → template column order.
    /** @type {Record<string, number>} */
    const legacy = { label:0, w:1, h:2, qty:3, grain:4, material:5, notes:6, edgeL1:7, edgeW2:8, edgeL3:9, edgeW4:10 };
    const start = col ? 1 : 0;
    /** @param {string[]} r @param {string} key */
    const get = (r, key) => col ? col(r, key) : (legacy[key] !== undefined ? (r[legacy[key]] ?? '').trim() : '');
    for (let i = start; i < rows.length; i++) {
      const r = rows[i];
      if (isPieces) {
        addPiece(get(r,'label')||undefined, parseDim(get(r,'w')), parseDim(get(r,'h')), parseInt(get(r,'qty'))||1, get(r,'grain')||'none', get(r,'material')||undefined, get(r,'notes')||undefined);
        const p = pieces[pieces.length - 1];
        const edges = { L1: _edgeFromCell(get(r,'edgeL1')), W2: _edgeFromCell(get(r,'edgeW2')), L3: _edgeFromCell(get(r,'edgeL3')), W4: _edgeFromCell(get(r,'edgeW4')) };
        if (p && (edges.L1 || edges.W2 || edges.L3 || edges.W4)) p.edges = edges;
      } else {
        addSheet(get(r,'label')||undefined, parseDim(get(r,'w')), parseDim(get(r,'h')), parseInt(get(r,'qty'))||1, get(r,'grain')||'none');
      }
    }
    if (isPieces) { renderPieces(); _saveCutList(); }
  };
  reader.readAsText(file);
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

// ── Main content tabs (Cut Layout / Cabinet Library — F5 dropped middle tab) ──
/** @param {string} view */
function switchCLMainView(view) {
  // Post-F5: only 'layout' and 'library' are valid. Legacy 'cutlists' callers
  // route to 'library' so the auto-switch on optimize/save still lands somewhere.
  if (view === 'cutlists') view = 'library';
  _clMainView = view;
  _persistCutlistCtx();
  const layout  = _byId('cl-view-layout');
  const library = _byId('cl-view-library');
  if (layout)  layout.style.display  = view === 'layout'  ? 'flex' : 'none';
  if (library) library.style.display = view === 'library' ? ''     : 'none';
  /** @param {string} id @param {boolean} active */
  const setTab = (id, active) => {
    const el = _byId(id);
    if (!el) return;
    el.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    el.style.fontWeight        = active ? '700' : '500';
    el.style.color             = active ? 'var(--text)' : 'var(--muted)';
  };
  setTab('cl-tab-layout',  view === 'layout');
  setTab('cl-tab-library', view === 'library');
  if (view === 'library') renderCLCutListLibraryView();
}
/** @type {any} */ (window).switchCLMainView = switchCLMainView;

/** Format a date for cutlist card display. @param {string|null|undefined} iso */
function _clFormatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) { return ''; }
}

// F5 (2026-05-13): renderCLCutListsView removed — the "Project Cut Lists"
// middle tab is gone. Cut lists are now accessed via the Cut List Library tab
// (renderCLCutListLibraryView) or via Client cards in the Clients tab.

/** Render the Cut List Library tab — every cutlist the user owns
 *  (post-F5: no project scope; RLS bounds to current user). Each row has
 *  Open / Link to Cabinet / Duplicate / Delete actions. */
async function renderCLCutListLibraryView() {
  const host = _byId('cl-view-library');
  if (!host) return;
  const filterEl = /** @type {HTMLInputElement|null} */ (_byId('cl-lib-filter'));
  const q = (filterEl && filterEl.value) ? filterEl.value.trim().toLowerCase() : '';

  host.innerHTML = `
    ${_renderContentHeader({ iconSvg: _CH_ICON_CUTLIST, title: 'Cut List Library', addOnclick: '_clStartNewCutlist()' })}
    <div class="lib-filter-row">
      <input type="text" id="cl-lib-filter" class="lib-filter-input" placeholder="Filter by name..." value="${_escHtml(q)}" oninput="renderCLCutListLibraryView()">
      <button class="btn btn-outline lib-filter-btn" onclick="exportCSV('pieces')" title="Export the open cut list's parts to CSV">&darr; Export</button>
      <button class="btn btn-outline lib-filter-btn" onclick="triggerImportCSV('pieces')" title="Import parts into the open cut list from CSV">&uarr; Import</button>
    </div>
    <div id="cl-lib-grid" style="display:flex;flex-direction:column;gap:8px">
      <div style="font-size:12px;color:var(--muted);text-align:center;padding:20px">Loading…</div>
    </div>`;

  if ((typeof _userId === 'undefined' || !_userId) && !window._demoMode) {
    /** @type {HTMLElement} */ (_byId('cl-lib-grid')).innerHTML = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px">Sign in to see your library cut lists.</div>`;
    return;
  }

  /** @type {any[]} */ let rows = [];
  try {
    const { data } = await _db('cutlists')
      .select('id, name, updated_at, cutlist_cabinets(cabinet_id, cabinet_templates(name))')
      .order('updated_at', { ascending: false });
    rows = /** @type {any[]} */ (data || []);
  } catch (e) { rows = []; }

  const filtered = q ? rows.filter(r => (r.name || '').toLowerCase().includes(q)) : rows;
  const grid = _byId('cl-lib-grid');
  if (!grid) return;
  if (!filtered.length) {
    grid.innerHTML = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px;border:1px dashed var(--border);border-radius:var(--radius)">
      ${rows.length ? 'No cut lists match this filter.' : 'No cut lists in your library yet. Use "Add to Library" under Optimize to save the current cut list here.'}
    </div>`;
    return;
  }

  // Best-effort piece count per cutlist.
  const ids = filtered.map(/** @param {any} r */ r => r.id);
  /** @type {Record<number, number>} */
  const counts = {};
  try {
    const { data: pcs } = await _db('pieces').select('cutlist_id').in('cutlist_id', ids);
    for (const p of (pcs || [])) {
      const cid = /** @type {any} */ (p).cutlist_id;
      if (cid != null) counts[cid] = (counts[cid] || 0) + 1;
    }
  } catch (e) { /* leave empty */ }

  grid.innerHTML = filtered.map(/** @param {any} r */ (r) => {
    const isActive = r.id === _clCurrentCutlistId;
    const partCount = counts[r.id] != null ? counts[r.id] : '–';
    const date = _clFormatDate(r.updated_at);
    const links = /** @type {any[]} */ (r.cutlist_cabinets || []);
    const linkCount = links.length;
    return `<div style="background:var(--surface);border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);box-shadow:var(--shadow);transition:box-shadow .15s,border-color .15s;cursor:pointer"
      onmouseover="this.style.boxShadow='var(--shadow-md)';this.style.borderColor='var(--accent)'"
      onmouseout="this.style.boxShadow='var(--shadow)';this.style.borderColor='${isActive ? 'var(--accent)' : 'var(--border)'}'"
      onclick="_clOpenLibraryCutlist(${r.id})">
      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px 6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${_escHtml(r.name||'(untitled)')}${isActive ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            <span>${partCount} part${partCount === 1 ? '' : 's'}</span>
            ${date ? ` · <span>${_escHtml(date)}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;padding:8px 12px 10px;border-top:1px solid var(--border2);justify-content:flex-end;flex-wrap:wrap;align-items:stretch">
        <div class="proj-act${linkCount ? '' : ' empty'}" onclick="event.stopPropagation()">
          <div class="proj-act-main" onclick="event.stopPropagation();_clOpenLinkedCabinets(${r.id})" title="${linkCount ? 'Open a linked cabinet' : 'No cabinets linked yet — use + to add'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            <span class="proj-act-label">Link to Cabinet</span>
            <span class="proj-act-count">${linkCount}</span>
          </div>
          <div class="proj-act-add" onclick="event.stopPropagation();_clLinkToCabinet(${r.id})" title="Link to a cabinet">+</div>
        </div>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto" onclick="event.stopPropagation();_clDuplicateLibraryCutlist(${r.id})">Duplicate</button>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto;color:var(--danger)" onclick="event.stopPropagation();_clDeleteLibraryCutlist(${r.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}
/** @type {any} */ (window).renderCLCutListLibraryView = renderCLCutListLibraryView;

/** Load a library cutlist into the editor (no project context).
 *  @param {number} id */
async function _clOpenLibraryCutlist(id) {
  if (!id) return;
  if (_clDirty) {
    _confirm('You have unsaved changes. Open this library cut list anyway?', () => _clDoOpenLibraryCutlist(id));
  } else {
    _clDoOpenLibraryCutlist(id);
  }
}
/** @type {any} */ (window)._clOpenLibraryCutlist = _clOpenLibraryCutlist;

/** @param {number} id
 *  @returns {Promise<boolean>} true if the cutlist was found and loaded */
async function _clDoOpenLibraryCutlist(id) {
  // Mark the cut list "not ready" for the whole load and drop any pending
  // autosave timer — a debounced autosave firing mid-load would otherwise
  // persist the transient empty arrays over the real rows.
  _clCutlistReady = false;
  if (_clAutosaveTimer) { clearTimeout(_clAutosaveTimer); _clAutosaveTimer = null; }
  try {
    const { data: cl } = await _db('cutlists').select('*').eq('id', id).single();
    if (!cl) {
      // During restoreAppState a missing cutlist is expected (deleted since
      // last session) — stay silent and let the caller drop the stale key.
      if (!(/** @type {any} */ (window))._pcSuppressToasts) _toast('Cut list not found', 'error');
      return false;
    }
    if (window._mvShowEditor) window._mvShowEditor();
    _clCurrentProjectId = null;
    _clCurrentProjectName = '';
    _clCurrentCutlistId = id;
    _clCurrentCutlistName = /** @type {any} */ (cl).name || '';
    pieces = []; sheets = []; edgeBands = [];
    _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0;
    results = null;
    // Load pieces / sheets / edge_bands for this cutlist.
    try {
      const { data: ps } = await _db('pieces').select('*').eq('cutlist_id', id).order('position');
      for (const p of (ps || [])) {
        const row = /** @type {any} */ (p);
        pieces.push({
          id: _pieceId++, label: row.label || '', w: row.w_mm, h: row.h_mm, qty: row.qty || 1,
          grain: row.grain || 'none', material: row.material || '', notes: row.notes || '',
          enabled: row.enabled !== false, color: row.color || COLORS[pieceColorIdx++ % COLORS.length],
          edgeBand: 'none'
        });
      }
    } catch (e) { /* tolerate */ }
    try {
      const { data: ss } = await _db('sheets').select('*').eq('cutlist_id', id).order('position');
      for (const s of (ss || [])) {
        const row = /** @type {any} */ (s);
        sheets.push({
          id: _sheetId++, name: row.name || 'Sheet', w: row.w_mm, h: row.h_mm, qty: row.qty || 1,
          grain: row.grain || 'none', kerf: row.kerf_mm || 3, enabled: row.enabled !== false,
          color: row.color || COLORS[pieceColorIdx++ % COLORS.length]
        });
      }
    } catch (e) { /* tolerate */ }
    renderPieces(); renderSheets();
    if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
    _setClDirty(false);
    _clRenderContext();
    if (!(/** @type {any} */ (window))._pcSuppressToasts) {
      _toast(`Opened "${_clCurrentCutlistName}"`, 'success');
    }
    return true;
  } catch (e) {
    if (!(/** @type {any} */ (window))._pcSuppressToasts) _toast('Failed to load cut list', 'error');
    return false;
  } finally {
    _clCutlistReady = true;
  }
}

/** Insert a new library cutlist row (no project) and copy the in-memory
 *  pieces/sheets/edge_bands into it. Switches to the Cut List Library tab. */
async function _clAddToCutlistLibrary() {
  if (!_requireAuth()) return;
  const { data: _clCountRows } = await _db('cutlists').select('id').eq('user_id', _userId);
  if (!_enforceFreeLimit('cutlists', _realCount(_clCountRows))) return;
  const name = (_clCurrentCutlistName || '').trim() || await _clNextCutlistName(null);
  try {
    const { data, error } = await _db('cutlists').insert(/** @type {any} */ ({
      user_id: _userId,
      name,
      position: 0,
      ui_prefs: {}
    })).select().single();
    if (error || !data) { _toast('Could not save to library', 'error'); return; }
    const newId = /** @type {any} */ (data).id;
    // Copy pieces/sheets/edge_bands.
    if (pieces.length) {
      const rows = pieces.map((p, i) => /** @type {any} */ ({
        user_id: _userId, cutlist_id: newId, label: p.label || '',
        w_mm: p.w, h_mm: p.h, qty: p.qty || 1, grain: p.grain || 'none',
        material: p.material || '', notes: p.notes || '', enabled: p.enabled !== false,
        color: p.color, position: i
      }));
      await _db('pieces').insert(rows);
    }
    if (sheets.length) {
      const rows = sheets.map((s, i) => /** @type {any} */ ({
        user_id: _userId, cutlist_id: newId, name: s.name || 'Sheet',
        w_mm: s.w, h_mm: s.h, qty: s.qty || 1, grain: s.grain || 'none',
        kerf_mm: s.kerf || 3, enabled: s.enabled !== false, color: s.color, position: i
      }));
      await _db('sheets').insert(rows);
    }
    _toast(`"${name}" saved to Cut List Library`, 'success');
    if (typeof switchCLMainView === 'function') switchCLMainView('library');
  } catch (e) {
    _toast('Could not save to library', 'error');
  }
}
/** @type {any} */ (window)._clAddToCutlistLibrary = _clAddToCutlistLibrary;

/** Open a multi-toggle picker: every cabinet in the user's library is listed,
 *  with currently-linked ones marked. Clicking a row toggles the link (insert
 *  or delete a `cutlist_cabinets` row), then re-opens the picker so the user
 *  can keep adding. Only shows persisted cabinets (db_id present).
 *  @param {number} cutlistId */
async function _clLinkToCabinet(cutlistId) {
  const lib = (typeof cbLibrary !== 'undefined' && cbLibrary) ? cbLibrary : [];
  const persisted = lib.filter(/** @param {any} c */ c => c.db_id != null);

  /** @type {Set<number>} */ const linkedIds = new Set();
  try {
    const { data } = await _db('cutlist_cabinets').select('cabinet_id').eq('cutlist_id', cutlistId);
    for (const r of (data || [])) {
      const cid = /** @type {any} */ (r).cabinet_id;
      if (cid != null) linkedIds.add(cid);
    }
  } catch (e) { /* tolerate — show all unlinked */ }

  const cabinetIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';

  const items = persisted.map((c, idx) => {
    const name = c._libName || c.name || ('Cabinet ' + (idx+1));
    const dims = (c.w && c.h && c.d) ? `${c.w}×${c.h}×${c.d} mm` : (c.w && c.h ? `${c.w}×${c.h}` : '');
    const meta = [dims, c.material].filter(Boolean).join(' · ');
    const linked = linkedIds.has(c.db_id);
    return {
      title: name,
      icon: cabinetIcon,
      metaText: meta,
      metaPills: linked ? [{ label: 'Linked', tone: 'approved' }] : [],
      onPick: `_clTogglePickedCabinet(${cutlistId},${c.db_id})`,
    };
  });

  _openPickerPopup({
    title: 'Link to Cabinets',
    hint: 'Click a cabinet to add or remove its link. Close when done.',
    items,
    emptyText: lib.length === 0
      ? 'No saved cabinets yet. Create one in the <strong>Cabinet Builder</strong>, then come back here to link.'
      : 'Your cabinets aren&rsquo;t saved to the database yet. Open each one in the <strong>Cabinet Builder</strong> so it autosaves, then return here.',
    size: 'md',
  });
}
/** @type {any} */ (window)._clLinkToCabinet = _clLinkToCabinet;

/** Toggle a single link: insert if missing, delete if present. After the
 *  write succeeds, re-open the picker so the user sees the new state and can
 *  keep toggling. The library view re-renders too so counts stay in sync.
 *  @param {number} cutlistId @param {number} cabinetDbId */
async function _clTogglePickedCabinet(cutlistId, cabinetDbId) {
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
    renderCLCutListLibraryView();
    _clLinkToCabinet(cutlistId);
  } catch (e) { _toast('Link toggle failed', 'error'); }
}
/** @type {any} */ (window)._clTogglePickedCabinet = _clTogglePickedCabinet;

/** Open a picker of the cabinets currently linked to this cut list; clicking
 *  one navigates to that cabinet's cut-list view (same destination as the
 *  cabinet-card Cut List pill).
 *  @param {number} cutlistId */
async function _clOpenLinkedCabinets(cutlistId) {
  const lib = (typeof cbLibrary !== 'undefined' && cbLibrary) ? cbLibrary : [];

  /** @type {number[]} */ let linkedIds = [];
  try {
    const { data } = await _db('cutlist_cabinets').select('cabinet_id').eq('cutlist_id', cutlistId);
    linkedIds = (data || []).map(/** @param {any} r */ r => r.cabinet_id).filter(/** @param {any} v */ v => v != null);
  } catch (e) { linkedIds = []; }

  const cabinetIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';

  const items = linkedIds
    .map(/** @param {number} cid */ cid => lib.find(/** @param {any} c */ c => c.db_id === cid))
    .filter(/** @param {any} c */ c => c != null)
    .map(/** @param {any} c @param {number} idx */ (c, idx) => {
      const name = c._libName || c.name || ('Cabinet ' + (idx+1));
      const dims = (c.w && c.h && c.d) ? `${c.w}×${c.h}×${c.d} mm` : (c.w && c.h ? `${c.w}×${c.h}` : '');
      const meta = [dims, c.material].filter(Boolean).join(' · ');
      return {
        title: name,
        icon: cabinetIcon,
        metaText: meta,
        onPick: `_clOpenCabinetFromPicker(${c.db_id})`,
      };
    });

  _openPickerPopup({
    title: 'Linked Cabinets',
    hint: 'Pick a cabinet to open it in the Cabinet Builder.',
    items,
    emptyText: 'No cabinets linked yet.',
    createLabel: '+ Add Cabinet',
    onCreate: `_clLinkToCabinet(${cutlistId})`,
    createClass: 'subtle',
    size: 'md',
  });
}
/** @type {any} */ (window)._clOpenLinkedCabinets = _clOpenLinkedCabinets;

/** Picker-row callback: close the popup, switch to the Cabinet tab, and open
 *  the picked template in the Cabinet Builder via cbEditLibraryEntry.
 *  @param {number} cabinetDbId */
function _clOpenCabinetFromPicker(cabinetDbId) {
  _closePopup();
  const lib = (typeof cbLibrary !== 'undefined' && cbLibrary) ? cbLibrary : [];
  const idx = lib.findIndex(/** @param {any} c */ c => c.db_id === cabinetDbId);
  if (idx < 0) { _toast('Cabinet not found in library', 'error'); return; }
  const w = /** @type {any} */ (window);
  if (typeof switchSection === 'function') switchSection('cabinet');
  if (typeof w.switchCBMainView === 'function') w.switchCBMainView('library');
  if (typeof w.cbEditLibraryEntry === 'function') w.cbEditLibraryEntry(idx);
}
/** @type {any} */ (window)._clOpenCabinetFromPicker = _clOpenCabinetFromPicker;

/** Duplicate a library cut list (with its pieces/sheets/edge bands).
 *  @param {number} id */
async function _clDuplicateLibraryCutlist(id) {
  try {
    const { data: _clCountRows } = await _db('cutlists').select('id').eq('user_id', _userId);
    if (!_enforceFreeLimit('cutlists', _realCount(_clCountRows))) return;
    const { data: src } = await _db('cutlists').select('*').eq('id', id).single();
    if (!src) return;
    const newName = (/** @type {any} */ (src).name || 'Cutlist') + ' (copy)';
    const { data: ins, error } = await _db('cutlists').insert(/** @type {any} */ ({
      user_id: _userId, name: newName, position: 0, ui_prefs: {}
    })).select().single();
    if (error || !ins) return;
    const newId = /** @type {any} */ (ins).id;
    // Copy children.
    try {
      const { data: ps } = await _db('pieces').select('*').eq('cutlist_id', id);
      if (ps && ps.length) {
        const rows = ps.map(/** @param {any} p */ p => ({ ...p, id: undefined, cutlist_id: newId }));
        await _db('pieces').insert(rows);
      }
    } catch (e) {}
    try {
      const { data: ss } = await _db('sheets').select('*').eq('cutlist_id', id);
      if (ss && ss.length) {
        const rows = ss.map(/** @param {any} s */ s => ({ ...s, id: undefined, cutlist_id: newId }));
        await _db('sheets').insert(rows);
      }
    } catch (e) {}
    _toast(`"${newName}" duplicated`, 'success');
    renderCLCutListLibraryView();
  } catch (e) { _toast('Duplicate failed', 'error'); }
}
/** @type {any} */ (window)._clDuplicateLibraryCutlist = _clDuplicateLibraryCutlist;

/** @param {number} id */
function _clDeleteLibraryCutlist(id) {
  _confirm('Delete this library cut list? This cannot be undone.', async () => {
    try {
      // Delete children first (best-effort).
      await _db('pieces').delete().eq('cutlist_id', id);
      await _db('sheets').delete().eq('cutlist_id', id);
      await _db('edge_bands').delete().eq('cutlist_id', id);
      await _db('cutlists').delete().eq('id', id);
      if (_clCurrentCutlistId === id) {
        _clExitLibraryEdit();
      } else {
        renderCLCutListLibraryView();
      }
      _toast('Cut list deleted', 'success');
    } catch (e) { _toast('Delete failed', 'error'); }
  });
}
/** @type {any} */ (window)._clDeleteLibraryCutlist = _clDeleteLibraryCutlist;

