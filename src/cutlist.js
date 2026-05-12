// ProCabinet — Cutlist (carved out of src/app.js in phase E carve 16 — the
// final big-section carve of phase E).
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
/** @type {Record<string, boolean>} */
let colsVisible = { grain: false, material: true, label: true, notes: false, edgeband: false };
/** @type {any[]} */
let edgeBands = [];
let _edgeBandId = 1;
let layoutRotate = false;
let clShowSummary = localStorage.getItem('pc_show_summary') === '1';
let clShowCutList = clShowSummary;  // cut list is part of the Summary tile
/** @type {any} */
let _dragSrc = null;
/** @type {any} */
let _dragTable = null;

// Project-state tracking — set by loadProject / _clSaveProjectByName, cleared by _doClearAll.
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
/** @type {string} */
let _clMainView = 'cutlists';

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
}

// ── TOGGLE ENABLE ──
/** @param {number} id */
function toggleSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (s) { s.enabled = s.enabled === false ? true : false; renderSheets(); }
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
// unsaved changes, clears state, then opens the standard New Project popup.
function _clNewProject() {
  _clConfirmDiscardIfDirty('start a new project', () => {
    _doClearAll();
    _openNewProjectPopup('cl-project');
  });
}

function _clSaveProject() {
  // Already-loaded project + cutlist → silent overwrite. No popup.
  if (_clCurrentProjectId && _clCurrentProjectName && _clCurrentCutlistId && _clCurrentCutlistName) {
    /** @type {any} */ (window)._clSaveProjectByName?.(_clCurrentProjectName, { cutlistName: _clCurrentCutlistName });
    return;
  }
  // Always go through the popup when project or cutlist isn't fully resolved —
  // user must name the cutlist explicitly so it's discoverable in the library.
  _openSaveProjectPopup();
}

function _openSaveProjectPopup() {
  const defaultProjectName = _clCurrentProjectName || (pieces.length > 0 ? (pieces[0].label.split(' ')[0] + ' Build') : '');
  const defaultCutlistName = _clCurrentCutlistName || 'Main';
  const projectLocked = !!(_clCurrentProjectId && _clCurrentProjectName);
  const h = `
    <div class="popup-header">
      <div class="popup-title">Save cut list to project</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label>Project Name</label>
        <input type="text" id="save-proj-name" class="form-control" placeholder="e.g. Kitchen Cabinet Build" value="${_escHtml(defaultProjectName)}"${projectLocked ? ' readonly style="opacity:.7"' : ''}>
      </div>
      <div class="pf">
        <label>Cut List Name</label>
        <input type="text" id="save-cutlist-name" class="form-control" placeholder="e.g. Bases, Wall units, Doors" value="${_escHtml(defaultCutlistName)}">
      </div>
      <div class="pf">
        <label>Client</label>
        <div class="smart-input-wrap">
          <input type="text" id="save-proj-client" placeholder="Search or add client..." autocomplete="off"
            oninput="_smartClientSuggest(this,'save-proj-client-suggest')"
            onfocus="_smartClientSuggest(this,'save-proj-client-suggest')"
            onblur="setTimeout(()=>_byId('save-proj-client-suggest').style.display='none',150)">
          <div class="smart-input-add" onclick="_openNewClientPopup('save-proj-client')" title="Add new client">+</div>
        </div>
        <div id="save-proj-client-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      <div class="pf">
        <label>Notes</label>
        <textarea id="save-proj-notes" placeholder="Optional notes..." style="width:100%;height:56px;font-size:13px;resize:none;border:1px solid var(--border);border-radius:6px;padding:6px 8px;background:var(--input-bg,#fff);color:var(--text)"></textarea>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_doSaveProject()">Save cut list</button>
    </div>`;
  _openPopup(h, 'sm');
  setTimeout(() => {
    const focusId = projectLocked ? 'save-cutlist-name' : 'save-proj-name';
    const el = /** @type {HTMLInputElement|null} */ (_byId(focusId));
    if (el) { el.focus(); el.select(); }
  }, 50);
}

async function _doSaveProject() {
  const name = (_popupVal('save-proj-name') || '').trim();
  if (!name) { _toast('Please enter a project name', 'error'); return; }
  const cutlistName = (_popupVal('save-cutlist-name') || '').trim() || 'Main';
  const clientName = (_popupVal('save-proj-client') || '').trim();
  const description = (_popupVal('save-proj-notes') || '').trim();
  _closePopup();
  /** @type {any} */ (window)._clSaveProjectByName?.(name, { clientName, description, cutlistName });
}

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
  // Project-scoped cut list — reuse the existing save path.
  if (_clCurrentProjectId && _clCurrentProjectName) {
    /** @type {any} */ (window)._clSaveProjectByName?.(
      _clCurrentProjectName,
      { cutlistName: _clCurrentCutlistName }
    );
    return;
  }
  // Library cut list — direct write to the cutlists row, then re-sync children
  // via delete-then-insert (mirrors how _clSaveProjectByName persists rows).
  if (_clCurrentCutlistId) {
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
          user_id: _userId, project_id: null, cutlist_id: _clCurrentCutlistId,
          label: p.label || '', w_mm: p.w, h_mm: p.h, qty: p.qty || 1,
          grain: p.grain || 'none', material: p.material || '', notes: p.notes || '',
          enabled: p.enabled !== false, color: p.color, position: i
        }));
        await _db('pieces').insert(rows);
      }
      if (sheets.length) {
        const rows = sheets.map((s, i) => /** @type {any} */ ({
          user_id: _userId, project_id: null, cutlist_id: _clCurrentCutlistId,
          name: s.name || 'Sheet', w_mm: s.w, h_mm: s.h, qty: s.qty || 1,
          grain: s.grain || 'none', kerf_mm: s.kerf || 3,
          enabled: s.enabled !== false, color: s.color, position: i
        }));
        await _db('sheets').insert(rows);
      }
      _clDirty = false;
    } catch (e) {
      console.warn('[cl autosave-library]', (/** @type {any} */ (e)).message || e);
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
  if (typeof switchCLMainView === 'function') switchCLMainView(_clMainView || 'cutlists');
  const ctx = _byId('cl-context');
  const scroll = _byId('cl-scroll-body');
  const actionBar = _byId('cl-action-bar');
  if (!ctx) return;
  // Cabinet-scope: a cabinet is open and we're either listing its cut lists
  // or editing one of them. Show a cabinet-flavoured header.
  if (_clCurrentCabinetId) {
    if (scroll) scroll.style.display = '';
    if (actionBar) actionBar.style.display = '';
    ctx.innerHTML = _renderProjectHeader('cutlist', {
      name: _clCurrentCabinetName || 'Cabinet',
      exitFn: '_exitCabinet_cutlist',
      iconSvg: _CL_CABINET_ICON,
    });
    const sInp = /** @type {HTMLInputElement|null} */ (_byId('cl-cutlist-search'));
    if (sInp) sInp.value = _clCurrentCutlistName || '';
    if (typeof _setSaveStatus === 'function') {
      if (_clDirty) _setSaveStatus('cutlist', 'dirty');
    }
    return;
  }
  // Library-cutlist editing (item 8): _clCurrentProjectId is null but a
  // _clCurrentCutlistId is set (loaded from Cut List Library).
  if (!_clCurrentProjectId && _clCurrentCutlistId) {
    if (scroll) scroll.style.display = '';
    if (actionBar) actionBar.style.display = '';
    ctx.innerHTML = _renderProjectHeader('cutlist', {
      name: 'Cut List Library',
      exitFn: '_clExitLibraryEdit',
      iconSvg: _CL_LIBRARY_ICON,
    });
    const sInp = /** @type {HTMLInputElement|null} */ (_byId('cl-cutlist-search'));
    if (sInp) sInp.value = _clCurrentCutlistName || '';
    return;
  }
  if (!_clCurrentProjectId) {
    if (scroll) scroll.style.display = 'none';
    if (actionBar) actionBar.style.display = 'none';
    const recents = (typeof projects !== 'undefined' ? projects : [])
      .slice()
      .sort(/** @param {any} a @param {any} b */ (a, b) => {
        const av = a.updated_at ? +new Date(a.updated_at) : 0;
        const bv = b.updated_at ? +new Date(b.updated_at) : 0;
        return bv - av;
      });
    ctx.innerHTML = _renderProjectEmpty({
      title: 'Cut List',
      subtitle: 'Pick a project to load its cut parts and panels.',
      pickFnName: '_clPickProjectByIdSafe',
      pickerInputId: 'cl-empty-picker',
      pickerSuggestId: 'cl-empty-suggest',
      pickerSuggestFn: '_smartCLEmptyProjectSuggest',
      recentProjects: recents,
      iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>',
    });
    return;
  }
  if (scroll) scroll.style.display = '';
  if (actionBar) actionBar.style.display = '';
  ctx.innerHTML = _renderProjectHeader('cutlist', {
    name: _clCurrentProjectName,
    exitFn: '_exitProject_cutlist',
  });
  // Sync the sidebar smart-library input with the active cut list's name.
  const sInp = /** @type {HTMLInputElement|null} */ (_byId('cl-cutlist-search'));
  if (sInp) sInp.value = _clCurrentCutlistName || '';
  if (typeof _setSaveStatus === 'function') {
    if (_clDirty) _setSaveStatus('cutlist', 'dirty');
  }
}

/** Pick-by-id wrapper for the empty-state recent list. Uses the existing loadProject. */
/** @param {number} id @param {string} _name */
function _clPickProjectByIdSafe(id, _name) {
  /** @type {any} */ const w = window;
  if (typeof w.loadProject === 'function') {
    if (_clDirty) {
      _confirm('You have unsaved changes. Load this project anyway? Current work will be lost.', () => w.loadProject(id));
    } else {
      w.loadProject(id);
    }
  }
}
/** @type {any} */ (window)._clPickProjectByIdSafe = _clPickProjectByIdSafe;

/** Smart-suggest for the Cut List gated-entry project picker.
 *  @param {HTMLInputElement} input @param {string} boxId */
function _smartCLEmptyProjectSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  if (typeof _posSuggest === 'function') _posSuggest(input, box);
  const matches = projects
    .filter(/** @param {any} p */ p => !val || p.name.toLowerCase().includes(val))
    .slice(0, 8);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  for (const p of matches) {
    const cName = p.client_id ? (clients.find(/** @param {any} c */ c => c.id === p.client_id) || /** @type {any} */ ({})).name || '' : '';
    html += `<div class="client-suggest-item" onmousedown="_clPickProjectByIdSafe(${p.id},'${esc(p.name)}')">
      <span class="suggest-icon">P</span>
      <span class="csi-name">${esc(p.name)}</span>
      ${cName ? `<span class="csi-meta">${esc(cName)}</span>` : ''}
    </div>`;
  }
  if (val && !matches.some(/** @param {any} p */ p => p.name.toLowerCase() === val)) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_openNewProjectPopup('cl-empty-picker')">
      <span class="csi-icon">+</span>
      <span class="csi-name">Create project "${esc(input.value.trim())}"</span>
    </div>`;
  }
  if (!html) html = '<div class="client-suggest-empty">No projects yet — click + to create one.</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}
/** @type {any} */ (window)._smartCLEmptyProjectSuggest = _smartCLEmptyProjectSuggest;

// ── CUT LIST SMART LIBRARY (sidebar top) ──
// Mirrors Cabinet Builder's #cb-cabinet-search pattern: one input that doubles
// as the current cut list's name AND filters/loads saved cut lists for the
// current project. Backed by the existing _clLoadCutlist / _clSaveProject flow.

/** Oninput handler for #cl-cutlist-search. Live-updates _clCurrentCutlistName
 *  and refreshes the suggest dropdown.
 *  @param {HTMLInputElement} input */
function _clCutlistSearchInput(input) {
  _clCurrentCutlistName = input.value.trim();
  _smartCLLibrarySuggest(input, 'cl-cutlist-suggest');
}
/** @type {any} */ (window)._clCutlistSearchInput = _clCutlistSearchInput;

/** Smart suggest for the cut-list library input. Lists cut lists for the
 *  current project, with click-to-load and a "+ Start new" footer.
 *  @param {HTMLInputElement} input @param {string} boxId */
async function _smartCLLibrarySuggest(input, boxId) {
  const box = _byId(boxId);
  if (!box) return;
  if (typeof _posSuggest === 'function') _posSuggest(input, box);
  if (!_clCurrentProjectId) {
    box.innerHTML = `<div class="client-suggest-add" style="color:var(--muted)">Open a project to use cut lists</div>`;
    box.style.display = 'block';
    return;
  }
  const q = input.value.trim().toLowerCase();
  /** @type {any[]} */
  let rows = [];
  try {
    const { data } = await _db('cutlists')
      .select('id, name, updated_at')
      .eq('project_id', _clCurrentProjectId)
      .order('updated_at', { ascending: false });
    rows = /** @type {any[]} */ (data || []);
  } catch (e) { rows = []; }
  const matches = q ? rows.filter(r => (r.name || '').toLowerCase().includes(q)) : rows;
  const exact = q && rows.some(r => (r.name || '').toLowerCase() === q);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  matches.slice(0, 8).forEach(r => {
    const isActive = r.id === _clCurrentCutlistId;
    const date = _clFormatDate(r.updated_at);
    html += `<div class="client-suggest-item" onmousedown="_clLoadCutlist(${r.id});_byId('${boxId}').style.display='none'">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">C</span>
      <span style="flex:1">${esc(r.name || '(untitled)')}${isActive ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</span>
      ${date ? `<span style="font-size:10px;color:var(--muted)">${esc(date)}</span>` : ''}
    </div>`;
  });
  if (matches.length === 0 && rows.length > 0) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No matching cut lists</div>`;
  } else if (rows.length === 0 && !q) {
    html += `<div class="client-suggest-add" style="color:var(--muted)">No saved cut lists yet</div>`;
  }
  if (q && !exact) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_clNewCutlistFromInput()">
      <span class="csi-icon">+</span>
      <span class="csi-name">Start new "${esc(input.value.trim())}"</span>
    </div>`;
  }
  box.innerHTML = html;
  box.style.display = 'block';
}
/** @type {any} */ (window)._smartCLLibrarySuggest = _smartCLLibrarySuggest;

/** Compute the next sequential "Cutlist N" name for a given scope.
 *  When projectId is null, scopes to library cutlists (project_id IS NULL).
 *  Falls back to "Cutlist 1" if the lookup fails or returns no rows.
 *  @param {number|null} projectId
 *  @returns {Promise<string>} */
async function _clNextCutlistName(projectId) {
  try {
    let q = _db('cutlists').select('name');
    if (projectId == null) q = q.is('project_id', null);
    else q = q.eq('project_id', projectId);
    const { data } = await q;
    let max = 0;
    for (const r of (data || [])) {
      const m = String(/** @type {any} */ (r).name || '').match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return 'Cutlist ' + (max + 1);
  } catch (e) { return 'Cutlist 1'; }
}
/** @type {any} */ (window)._clNextCutlistName = _clNextCutlistName;

/** "+" button handler for the smart library input. Reads the typed name from
 *  #cl-cutlist-search and starts a fresh blank cut list. Dirty-checks first.
 *  In cabinet-scope, persists a new linked cut list (cabinet_id set, parts
 *  pre-populated from the cabinet) and opens it in edit state. */
async function _clNewCutlistFromInput() {
  if (_clCurrentCabinetId) { return _clNewCabinetLinkedCutlist(); }
  if (!_clCurrentProjectId) { _toast('Open a project first', 'error'); return; }
  const inp = /** @type {HTMLInputElement|null} */ (_byId('cl-cutlist-search'));
  const typed = (inp && inp.value ? inp.value : '').trim();
  const fallbackName = typed || await _clNextCutlistName(_clCurrentProjectId);
  const startNew = () => {
    _clCurrentCutlistId = null;
    _clCurrentCutlistName = fallbackName;
    pieces = []; sheets = []; edgeBands = [];
    _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0;
    results = null;
    if (inp) inp.value = _clCurrentCutlistName;
    renderSheets(); renderPieces();
    if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
    _setClDirty(false);
    const box = _byId('cl-cutlist-suggest'); if (box) box.style.display = 'none';
    _toast(`New cut list "${_clCurrentCutlistName}" — add parts then save`, 'success');
  };
  if (_clDirty) _confirm('Discard unsaved changes and start a new cut list?', startNew);
  else startNew();
}
/** @type {any} */ (window)._clNewCutlistFromInput = _clNewCutlistFromInput;

/** Cabinet-scope branch of "+" creation. Inserts a library cut list with
 *  cabinet_id set, copies the cabinet's cut parts into pieces rows, then
 *  opens the new cut list in edit state. */
async function _clNewCabinetLinkedCutlist() {
  if (!_userId) { _toast('Sign in to create cut lists', 'error'); return; }
  if (!_clCurrentCabinetId) return;
  const w = /** @type {any} */ (window);
  const lib = (typeof cbLibrary !== 'undefined' && cbLibrary) ? cbLibrary : [];
  const cab = lib.find(/** @param {any} c */ c => c.db_id === _clCurrentCabinetId);
  if (!cab) { _toast('Cabinet not found', 'error'); return; }
  const parts = (cab._cutParts && cab._cutParts.length)
    ? cab._cutParts
    : (typeof w._cabinetPartsList === 'function' ? w._cabinetPartsList(cab) : []);
  if (!parts || !parts.length) { _toast('Cabinet has no cut parts to copy', 'error'); return; }

  const inp = /** @type {HTMLInputElement|null} */ (_byId('cl-cutlist-search'));
  const typed = (inp && inp.value ? inp.value : '').trim();
  const name = typed || await _clNextCutlistName(null);
  const insertCutlist = async () => {
    try {
      const { data, error } = await _db('cutlists').insert(/** @type {any} */ ({
        user_id: _userId,
        project_id: null,
        name,
        position: 0,
        ui_prefs: {}
      })).select().single();
      if (error || !data) { _toast('Could not create cut list', 'error'); return; }
      const newId = /** @type {any} */ (data).id;
      try {
        await _db('cutlist_cabinets').insert(/** @type {any} */ ({
          user_id: _userId,
          cutlist_id: newId,
          cabinet_id: _clCurrentCabinetId,
        }));
      } catch (e) { /* tolerate — cut list exists, link can be added manually */ }
      const rows = parts.map(/** @param {any} p @param {number} i */ (p, i) => /** @type {any} */ ({
        user_id: _userId,
        project_id: null,
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
      if (inp) inp.value = name;
      const box = _byId('cl-cutlist-suggest'); if (box) box.style.display = 'none';
      if (typeof w._clDoOpenLibraryCutlist === 'function') {
        await w._clDoOpenLibraryCutlist(newId);
      }
      // Refresh the grid so the new card appears under the cabinet.
      if (typeof renderCLCutListsView === 'function') renderCLCutListsView();
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

function clearCutList() {
  _confirm('Start a new cut list? Current parts and panels will be cleared.', () => _doClearAll()); return;
}
function _doClearAll() {
  pieces = []; sheets = []; edgeBands = []; _pieceId = 1; _sheetId = 1; _edgeBandId = 1; pieceColorIdx = 0; results = null;
  _clSelectedIds = new Set(); _clSelectionAnchorId = null;
  ['pc_cl_pieces','pc_cl_sheets','pc_cl_pid','pc_cl_sid','pc_cl_colorIdx','pc_cl_sheetColorIdx','pc_cl_edgebands','pc_cl_ebid'].forEach(k => localStorage.removeItem(k));
  // Reset project tracking — clearing means a fresh, unloaded cut list.
  _clCurrentProjectId = null;
  _clCurrentProjectName = '';
  _clCurrentCutlistId = null;
  _clCurrentCutlistName = '';
  _clDirty = false;
  const inp = /** @type {HTMLInputElement|null} */ (_byId('cl-project'));
  if (inp) inp.value = '';
  _renderClCurrentProject();
  renderPieces(); renderSheets();
  if (typeof renderEdgeBands === 'function') { try { renderEdgeBands(); } catch(e) {} }
  /** @type {HTMLElement} */ (_byId('results-area')).innerHTML = '<div class="empty-state"><div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg></div><h3>Ready to Optimize</h3><p>Add stock panels and cut pieces, then click "Optimize Cut Layout"</p></div>';
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
/** @param {string} [name] @param {number} [w] @param {number} [h] @param {number} [qty] */
function addSheet(name, w, h, qty) {
  const m = window.units === 'metric';
  sheets.push({
    id:      _sheetId++,
    name:    name !== undefined ? name : (m ? '18mm Plywood' : '3/4" Plywood'),
    w:       w    !== undefined ? w    : (m ? 2440 : 96),
    h:       h    !== undefined ? h    : (m ? 1220 : 48),
    qty:     qty  !== undefined ? qty  : 1,
    grain:   'none',
    kerf:    m ? 3 : 0.125,
    enabled: true,
    color:   COLORS[pieceColorIdx++ % COLORS.length],
  });
  renderSheets();
  renderPieces(); // refresh material dropdowns
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
          <button class="cl-step-btn" onclick="stepQty('sheet',${s.id},-1)">−</button>
          <input class="cl-input cl-qty-input" value="${s.qty}"
            data-table="sheets" data-row="${i}" data-col="qty"
            onblur="updateSheet(${s.id},'qty',this.value)"
            onkeydown="clKeydown(event,'sheets',${i},'qty')"
            min="1" max="99" ${dis ? 'disabled' : ''}>
          <button class="cl-step-btn" onclick="stepQty('sheet',${s.id},1)">+</button>
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
  // Any local-state mutation flips dirty when a project is loaded.
  if (_clCurrentProjectId && !_clDirty) _setClDirty(true);
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
/** @param {string} [label] @param {number} [w] @param {number} [h] @param {number} [qty] @param {string} [grain] */
function addPiece(label, w, h, qty, grain) {
  const m = window.units === 'metric';
  const color = COLORS[pieceColorIdx++ % COLORS.length];
  const prevMat = pieces.length > 0 ? (pieces[pieces.length-1].material || '') : '';
  pieces.push({
    id:       _pieceId++,
    label:    label !== undefined ? label : `Part ${pieces.length + 1}`,
    w:        w     !== undefined ? w     : (m ? 300 : 12),
    h:        h     !== undefined ? h     : (m ? 600 : 24),
    qty:      qty   !== undefined ? qty   : 1,
    grain:    (grain !== undefined && grain !== '') ? grain : 'none',
    material: prevMat,
    notes:    '',
    enabled:  true,
    color,
    edges:    {L1:null,W2:null,L3:null,W4:null},
  });
  renderPieces();
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
          <button class="cl-step-btn" tabindex="-1" onclick="stepQty('piece',${p.id},-1)">−</button>
          <input class="cl-input cl-qty-input" value="${p.qty}"
            data-table="pieces" data-row="${i}" data-col="qty"
            onblur="updatePiece(${p.id},'qty',this.value)"
            onkeydown="clKeydown(event,'pieces',${i},'qty')"
            min="1" max="999" ${dis ? 'disabled' : ''}>
          <button class="cl-step-btn" tabindex="-1" onclick="stepQty('piece',${p.id},1)">+</button>
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
/** @param {string} type */
function exportCSV(type) {
  let csv, fn;
  if (type === 'pieces') {
    csv = 'Label,W,H,Qty,Grain,Material\n' + pieces.map(p =>
      `"${p.label}",${p.w},${p.h},${p.qty},${p.grain||'none'},"${p.material||''}"`).join('\n');
    fn = 'cut-parts.csv';
  } else {
    csv = 'Material,W,H,Qty,Grain\n' + sheets.map(s =>
      `"${s.name}",${s.w},${s.h},${s.qty},${s.grain||'none'}`).join('\n');
    fn = 'stock-panels.csv';
  }
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: fn });
  a.click();
}
/** @param {string} type */
function downloadTemplate(type) {
  const csv = type === 'pieces'
    ? 'Label,W,H,Qty,Grain,Material\nSide Panel,23.25,30,2,none,3/4" Plywood'
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
    const lines = text.trim().split(/\r?\n/).slice(1);
    lines.forEach(line => {
      const c = line.split(',').map(x => x.trim().replace(/^"|"$/g,''));
      if (_csvImportTarget === 'pieces') addPiece(c[0]||`Part ${pieces.length+1}`, parseDim(c[1]), parseDim(c[2]), parseInt(c[3])||1, c[4]||'none');
      else addSheet(c[0]||'Sheet', parseDim(c[1]), parseDim(c[2]), parseInt(c[3])||1);
    });
  };
  reader.readAsText(file);
}

// ── LAYOUT TOOLBAR ──
function zoomIn()  { layoutZoom = Math.min(layoutZoom + 0.25, 4); localStorage.setItem('pc_zoom', String(layoutZoom)); renderResults(); }
function zoomOut() { layoutZoom = Math.max(layoutZoom - 0.25, 0.25); localStorage.setItem('pc_zoom', String(layoutZoom)); renderResults(); }
function zoomFit() { layoutZoom = 1.0; layoutFontScale = 1.0; localStorage.setItem('pc_zoom', String(layoutZoom)); localStorage.setItem('pc_font_scale', String(layoutFontScale)); renderResults(); }
function toggleLayoutColor() {
  layoutColor = !layoutColor;
  const b = _byId('lt-color'); if (b) b.classList.toggle('active', layoutColor);
  renderResults();
}
function toggleLayoutGrain() {
  layoutGrain = !layoutGrain;
  const b = _byId('lt-grain'); if (b) b.classList.toggle('active', layoutGrain);
  renderResults();
}
function toggleCutOrder() {
  layoutCutOrder = !layoutCutOrder;
  localStorage.setItem('pc_cut_order', layoutCutOrder ? '1' : '0');
  const b = _byId('lt-cutorder'); if (b) b.classList.toggle('active', layoutCutOrder);
  renderResults();
}
function toggleSheetCutList() {
  layoutSheetCutList = !layoutSheetCutList;
  localStorage.setItem('pc_sheet_cutlist', layoutSheetCutList ? '1' : '0');
  const b = _byId('lt-sheetcl'); if (b) b.classList.toggle('active', layoutSheetCutList);
  renderResults();
}
/** @param {number} d */
function adjustFontScale(d) { layoutFontScale = Math.max(0.5, Math.min(2.5, layoutFontScale + d)); localStorage.setItem('pc_font_scale', String(layoutFontScale)); renderResults(); }
/** @param {string} [mode] */
function printLayout(mode='print') {
  if (!results || !results.layouts || !results.layouts.length) { _toast('Run the optimiser first', 'info'); return; }
  // Brief delay so canvases finish rendering before capture
  setTimeout(() => {
    const biz = getBizInfo();
    const u = window.units === 'metric' ? 'mm' : 'in';
    const cur = window.currency;
    const totalArea = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => s + l.sheet.w * l.sheet.h, 0);
    const usedArea  = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => s + l.placed.reduce(/** @param {number} a @param {any} p */ (a,p) => a + p.w * p.h, 0), 0);
    const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0';
    const totalPieces = results.placed;
    const matCost = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => { const si = stockItems.find(i => i.name === l.sheet.name); return s + (si ? (si.cost ?? 0) : 0); }, 0);

    // Capture canvas images
    const canvases = /** @type {NodeListOf<HTMLCanvasElement>} */ (document.querySelectorAll('.canvas-wrap canvas'));
    const imgs = [...canvases].map(c => { try { return c.toDataURL('image/png'); } catch(e) { return ''; } });

    const sheetSections = results.layouts.map(/** @param {any} layout @param {number} i */ (layout, i) => {
      const util = (layout.util * 100).toFixed(0);
      const imgTag = imgs[i] ? `<img src="${imgs[i]}" class="sheet-img">` : '';
      const pieceRows = layout.placed.map(/** @param {any} p */ p => `
        <tr>
          <td style="width:16px"><div style="width:12px;height:12px;border-radius:2px;background:${p.item.color};opacity:.7"></div></td>
          <td><strong>${p.item.label}</strong></td>
          <td class="num">${formatDim(p.item.w)}</td>
          <td class="num">${formatDim(p.item.h)}</td>
          <td class="num">${p.rotated ? '↺ Yes' : '—'}</td>
          <td>${p.item.notes || ''}</td>
        </tr>`).join('');
      return `
      <div class="sheet-section">
        <div class="sheet-heading">
          <span class="sheet-title">Sheet ${i+1} &mdash; ${layout.sheet.name}</span>
          <span class="sheet-meta">${formatDim(layout.sheet.w)}&times;${formatDim(layout.sheet.h)}${u} &nbsp;&bull;&nbsp; ${layout.placed.length} piece${layout.placed.length!==1?'s':''} &nbsp;&bull;&nbsp; ${util}% used</span>
        </div>
        <div class="sheet-body">
          <div class="sheet-left">${imgTag}</div>
          <div class="sheet-right">
            <table class="ptable">
              <thead><tr><th></th><th>Label</th><th>W (${u})</th><th>H (${u})</th><th>Rotated</th><th>Notes</th></tr></thead>
              <tbody>${pieceRows}</tbody>
            </table>
          </div>
        </div>
      </div>`;
    }).join('');

    const allPieceRows = pieces.map(p => `
      <tr>
        <td><div style="width:10px;height:10px;border-radius:2px;background:${p.color};opacity:.7;display:inline-block"></div></td>
        <td>${p.label}</td>
        <td class="num">${p.w}</td>
        <td class="num">${p.h}</td>
        <td class="num">${p.qty}</td>
        <td>${p.material || '—'}</td>
        <td>${p.grain === 'h' ? 'Horiz' : p.grain === 'v' ? 'Vert' : '—'}</td>
        <td>${p.notes || ''}</td>
      </tr>`).join('');

    const dateStr = new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
    const bizSub  = [biz.phone, biz.email].filter(Boolean).join(' · ');

    // Optional combined page (summary stats + full cut list) — respects toggles
    const combinedPageHTML = (clShowSummary || clShowCutList) ? `
<div class="combined-pg">
  <div class="hdr">
    <div><div class="biz">${biz.name || 'ProCabinet'}</div>${bizSub ? `<div class="biz-sub">${bizSub}</div>` : ''}</div>
    <div class="doc-right"><div class="doc-title">Cut List</div><div class="doc-meta">${dateStr}</div></div>
  </div>
  ${clShowSummary ? `<div class="summary">
    <div class="sstat"><div class="sstat-val">${results.layouts.length}</div><div class="sstat-lbl">Sheets</div></div>
    <div class="sstat"><div class="sstat-val">${totalPieces}</div><div class="sstat-lbl">Pieces</div></div>
    <div class="sstat"><div class="sstat-val">${avgUtil}%</div><div class="sstat-lbl">Efficiency</div></div>
    <div class="sstat"><div class="sstat-val">${(100-parseFloat(avgUtil)).toFixed(1)}%</div><div class="sstat-lbl">Waste</div></div>
    ${matCost > 0 ? `<div class="sstat"><div class="sstat-val">${cur}${matCost.toLocaleString()}</div><div class="sstat-lbl">Material Cost</div></div>` : ''}
  </div>` : ''}
  ${clShowCutList ? `<div class="section-hdr" style="margin-top:${clShowSummary?'18px':'0'}">Full Cut List — All Pieces</div>
  <table class="ptable" style="border:1px solid #e0e0e0">
    <thead><tr><th></th><th>Label</th><th>W (${u})</th><th>H (${u})</th><th>Qty</th><th>Material</th><th>Grain</th><th>Notes</th></tr></thead>
    <tbody>${allPieceRows}</tbody>
  </table>` : ''}
  <div class="footer"><span>${biz.name || 'ProCabinet'} — ProCabinet.App</span><span>Printed ${dateStr}</span></div>
</div>` : '';

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cut List — ${new Date().toLocaleDateString('en-GB')}</title>
<style>
  /* A4 — 10mm margins; orientation follows the on-screen Rotate toggle */
  @page { size: A4 ${layoutRotate ? 'portrait' : 'landscape'}; margin: 10mm 10mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; background:#fff; }
  /* Compact title bar — sits above first sheet on page 1 */
  .doc-title-bar { display:flex; justify-content:space-between; align-items:baseline; font-size:10px; color:#888; border-bottom:1px solid #ddd; padding-bottom:5px; margin-bottom:7px; }
  .doc-title-bar strong { font-size:12px; font-weight:700; color:#111; }
  /* Sheets — first sheet shares page with title bar, subsequent sheets each get their own page */
  .sheet-section { break-inside:avoid; }
  .sheet-section + .sheet-section { break-before:page; }
  .sheet-heading { display:flex; justify-content:space-between; align-items:baseline; background:#f5f5f5; padding:7px 12px; border-radius:5px 5px 0 0; border:1px solid #ddd; border-bottom:2px solid #ddd; }
  .sheet-title { font-size:13px; font-weight:700; }
  .sheet-meta { font-size:10px; color:#777; }
  /* Two-column body: panel LEFT (2/3), cut list RIGHT (1/3) */
  .sheet-body { display:flex; flex-direction:row; gap:12px; align-items:flex-start; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 5px 5px; padding:10px; overflow:hidden; }
  .sheet-left { flex:0 0 66%; overflow:hidden; }
  .sheet-img { display:block; max-width:100%; max-height:158mm; width:auto; height:auto; border:1px solid #e8e8e8; border-radius:3px; }
  .sheet-right { flex:1 1 auto; min-width:0; }
  .ptable { width:100%; border-collapse:collapse; font-size:11px; border:1px solid #e0e0e0; }
  .ptable th { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; padding:5px 8px; background:#fafafa; border-bottom:1px solid #e8e8e8; text-align:left; }
  .ptable td { padding:5px 8px; border-bottom:1px solid #f3f3f3; vertical-align:middle; }
  .ptable tr:last-child td { border-bottom:none; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  /* Combined summary + cut list page — always starts on its own page */
  .combined-pg { break-before:page; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #111; padding-bottom:10px; margin-bottom:16px; }
  .biz { font-size:17px; font-weight:800; letter-spacing:-.5px; }
  .biz-sub { font-size:10px; color:#888; margin-top:2px; }
  .doc-right { text-align:right; }
  .doc-title { font-size:22px; font-weight:300; letter-spacing:3px; text-transform:uppercase; color:#333; }
  .doc-meta { font-size:10px; color:#999; margin-top:3px; }
  .summary { display:flex; gap:0; margin-bottom:0; border:1px solid #e0e0e0; border-radius:6px; overflow:hidden; }
  .sstat { flex:1; padding:10px 14px; border-right:1px solid #e0e0e0; }
  .sstat:last-child { border-right:none; }
  .sstat-val { font-size:20px; font-weight:800; }
  .sstat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; margin-top:1px; }
  .section-hdr { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; padding:0 0 8px; }
  .footer { margin-top:32px; padding-top:10px; border-top:1px solid #eee; display:flex; justify-content:space-between; font-size:9px; color:#bbb; }
</style></head><body>
<div class="doc-title-bar"><span><strong>${biz.name || 'ProCabinet'}</strong>${bizSub ? ' &nbsp;·&nbsp; ' + bizSub : ''}</span><span style="letter-spacing:2px;text-transform:uppercase;font-size:9px">Cut List &nbsp;·&nbsp; ${dateStr}</span></div>
${sheetSections}
${combinedPageHTML}
</body></html>`;
    if (mode === 'pdf') {
      // Pass uniqueLayouts so the PDF renders one page per unique packing,
      // matching the on-screen viewer (canvases were captured 1:1 with it).
      _buildCutListPDF({ biz, layouts: results.uniqueLayouts || results.layouts, imgs, pieces, u, cur,
        totalPieces, avgUtil, matCost });
    } else {
      _printInFrame(html);
    }
  }, 400);
}

/** @param {string} html */
function _printInFrame(html) {
  // Use a hidden iframe — avoids popup blockers entirely
  const old = _byId('_print_frame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = '_print_frame';
  frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:297mm;height:210mm;border:none;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(frame);
  // contentDocument/contentWindow are guaranteed non-null after appendChild for a
  // freshly-created same-origin iframe.
  const cdoc = /** @type {Document} */ (frame.contentDocument);
  const cwin = /** @type {Window} */ (frame.contentWindow);
  cdoc.open();
  cdoc.write(html);
  cdoc.close();
  setTimeout(() => {
    try {
      cwin.focus();
      cwin.print();
    } catch(e) {
      _saveAsPDF(html); // fallback to new-tab PDF flow
    }
    setTimeout(() => { const f = _byId('_print_frame'); if (f) f.remove(); }, 3000);
  }, 600);
}

/** @param {string} html */
function _saveAsPDF(html) {
  // Open HTML in a new browser tab — user can print/save from there
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  } else {
    // Fallback if popup blocked — use blob URL
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
}


// ── Build a real PDF for quotes using jsPDF ──
/** @param {any} q */
/**
 * @param {any} q quote row
 * @param {any[]} [lineRows] quote_lines rows; when omitted, uses cached totals
 *                           (so legacy callers like cabinet.js's preview path
 *                           keep working without an extra fetch).
 */
function _buildQuotePDF(q, lineRows) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const cur = window.currency;
  const biz = getBizInfo();
  const logo = getBizLogo();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  // If lines were passed, recompute from them (source of truth). Otherwise
  // fall back to the in-memory _totals cache.
  let sub, stockMat = 0;
  if (Array.isArray(lineRows)) {
    let matSum = 0, labSum = 0;
    for (const row of lineRows) {
      const s = _lineSubtotal(row);
      matSum += s.materials;
      labSum += s.labour;
      if (row.line_kind === 'stock') stockMat += s.materials;
    }
    sub = matSum + labSum;
  } else {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    stockMat = q._totals ? (q._totals.stockMat || 0) : 0;
    sub = matVal + labVal;
  }
  const stockMarkupPct = /** @type {any} */ (q).stock_markup ?? 0;
  const stockMarkupAmt = stockMat * stockMarkupPct / 100;
  const subWithStock = sub + stockMarkupAmt;
  const markupAmt = subWithStock * (q.markup ?? 0) / 100;
  const afterMarkup = subWithStock + markupAmt;
  const taxAmt = afterMarkup * (q.tax ?? 0) / 100;
  const afterTax = afterMarkup + taxAmt;
  const orderDiscPct = /** @type {any} */ (q).discount ?? 0;
  const orderDiscAmt = afterTax * orderDiscPct / 100;
  const total = afterTax - orderDiscAmt;
  const anyLineDisc = Array.isArray(lineRows) && lineRows.some(/** @param {any} r */ r => (parseFloat(r.discount) || 0) > 0);
  /** @param {any} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  /** @param {number} v */
  const fmt0 = v => cur + Math.round(v).toLocaleString();

  // Portrait A4
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // ── Header ──
  pdf.setFontSize(16); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'Your Business', M, y + 6);
  const bizSub = [biz.phone, biz.email, biz.address].filter(Boolean).join('  ·  ');
  if (bizSub) { pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(120); pdf.text(bizSub, M, y + 11); }
  if (biz.abn) { pdf.setFontSize(7); pdf.text('ABN: ' + biz.abn, M, y + 15); }

  pdf.setFontSize(22); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('QUOTATION', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text('#Q-' + String(q.id).padStart(4,'0') + '  ·  ' + (q.date||dateStr), PW - M, y + 12, { align:'right' });

  y += 20;
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // ── Client & Project ──
  pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
  pdf.text('PREPARED FOR', M, y);
  pdf.text('PROJECT', M + 70, y);
  y += 5;
  pdf.setFontSize(13); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(quoteClient(q) || '—', M, y);
  pdf.setFontSize(12); pdf.setFont('helvetica','bold');
  pdf.text(quoteProject(q) || '—', M + 70, y);
  y += 12;

  // ── Line items ──
  const plainNotes = (q.notes||'').trim();
  const rows = Array.isArray(lineRows) ? lineRows : [];

  if (rows.length > 0) {
    // Table header — add a "DISC" column only when at least one line has a discount.
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
    pdf.text('DESCRIPTION', M, y);
    if (anyLineDisc) pdf.text('DISC', PW - M - 28, y, { align: 'right' });
    pdf.text('AMOUNT', PW-M, y, { align:'right' });
    y += 2;
    pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.line(M, y, PW-M, y);
    y += 6;

    let lastKind = '';
    rows.forEach(/** @param {any} row */ row => {
      const d = _lineDisplay(row);
      // Group header when the kind changes
      if (d.kind !== lastKind) {
        pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(160);
        const groupLabel = { cabinet: 'CABINETS', item: 'ITEMS', labour: 'LABOUR' };
        pdf.text((/** @type {any} */ (groupLabel))[d.kind] || d.kind.toUpperCase(), M, y);
        y += 4;
        lastKind = d.kind;
      }
      pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      const headerText = d.qtyText ? d.name + '  ' + d.qtyText : d.name;
      pdf.text(headerText, M, y);
      if (anyLineDisc) {
        const rowDisc = parseFloat(row.discount) || 0;
        pdf.setFont('helvetica','normal'); pdf.setTextColor(130); pdf.setFontSize(9);
        pdf.text(rowDisc > 0 ? rowDisc + '%' : '—', PW - M - 28, y, { align: 'right' });
        pdf.setFont('helvetica','bold'); pdf.setTextColor(17); pdf.setFontSize(11);
      }
      pdf.text(fmt(d.total), PW - M, y, { align: 'right' });
      y += 5;
      if (d.detail) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(130);
        const detailLines = pdf.splitTextToSize(d.detail, W - 30);
        detailLines.forEach(/** @param {string} dl */ dl => { pdf.text(dl, M + 4, y); y += 4; });
      }
      y += 3;
      if (y > PH - 60) { pdf.addPage(); y = M + 10; }
    });

    pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y);
    y += 8;
  }

  // ── Totals ──
  const totalsX = PW - M;
  const labelX = PW - M - 80;

  if ((q.markup ?? 0) > 0 || (q.tax ?? 0) > 0 || orderDiscPct > 0 || stockMarkupAmt > 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('Subtotal', labelX, y); pdf.text(fmt(sub), totalsX, y, { align:'right' });
    y += 6;
  }
  if (stockMarkupAmt > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Stock markup (' + stockMarkupPct + '%)', labelX, y); pdf.text('+ ' + fmt(stockMarkupAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if ((q.markup ?? 0) > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Markup (' + q.markup + '%)', labelX, y); pdf.text('+ ' + fmt(markupAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if ((q.tax ?? 0) > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Tax (' + q.tax + '%)', labelX, y); pdf.text('+ ' + fmt(taxAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if (orderDiscPct > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(196, 68, 68);
    pdf.text('Discount (' + orderDiscPct + '%)', labelX, y); pdf.text('− ' + fmt(orderDiscAmt), totalsX, y, { align:'right' });
    pdf.setTextColor(140);
    y += 5;
  }

  // ── Total box ──
  y += 3;
  pdf.setFillColor(17,17,17); pdf.roundedRect(M, y, W, 14, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(255);
  pdf.text('TOTAL AMOUNT DUE', M + 8, y + 9);
  pdf.setFontSize(18); pdf.setFont('helvetica','bold');
  pdf.text(fmt0(total), PW - M - 8, y + 10, { align:'right' });
  y += 22;

  // ── Notes ──
  if (plainNotes) {
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(170);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(60);
    const noteWrapped = pdf.splitTextToSize(plainNotes, W);
    noteWrapped.forEach(/** @param {string} nl */ nl => { pdf.text(nl, M, y); y += 4.5; });
    y += 6;
  }

  // ── Validity ──
  pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
  pdf.text('This quote is valid for 30 days from the date of issue.', M, y);
  y += 12;

  // ── Acceptance ──
  if (y > PH - 60) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(80);
  pdf.text('ACCEPTANCE', M, y); y += 6;
  pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(120);
  const accText = 'To accept this quotation, please sign below and return a copy to ' + (biz.name||'us') + '.';
  pdf.text(accText, M, y); y += 10;

  // Signature lines
  pdf.setDrawColor(180); pdf.setLineWidth(0.4);
  pdf.line(M, y + 16, M + 100, y + 16);
  pdf.line(M + 120, y + 16, PW - M, y + 16);
  pdf.setFontSize(6.5); pdf.setTextColor(180);
  pdf.text('Client Signature', M, y + 20);
  pdf.text('Date', M + 120, y + 20);

  // ── Footer ──
  pdf.setFontSize(6.5); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — Generated by ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  // Output
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


function _buildStockPDF() {
  if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  const u = window.units === 'metric' ? 'mm' : 'in';
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const totalValue = stockItems.reduce((s,i) => s+(i.qty ?? 0)*(i.cost ?? 0), 0);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 14;
  const W = PW - 2*M;
  let y = M;

  // Header
  pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'ProCabinet', M, y + 6);
  pdf.setFontSize(18); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('STOCK INVENTORY', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text(dateStr + '  ·  ' + stockItems.length + ' items  ·  ' + cur + Math.round(totalValue), PW - M, y + 12, { align:'right' });
  y += 18;
  pdf.setDrawColor(17); pdf.setLineWidth(0.5); pdf.line(M, y, PW-M, y);
  y += 6;

  // Table header
  const cols = [M, M+55, M+80, M+100, M+130, M+148, M+165];
  pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
  ['Material','SKU','Size','Supplier','Qty','Alert',cur+' Value'].forEach((h,i) => pdf.text(h, cols[i], y));
  y += 4;
  pdf.setDrawColor(200); pdf.setLineWidth(0.2); pdf.line(M, y, PW-M, y);
  y += 5;

  // Rows
  stockItems.forEach(item => {
    if (y > PH - 20) { pdf.addPage(); y = M + 10; }
    const isLow = (item.qty ?? 0) <= (item.low ?? 0);
    const sup = _ssGet(item.id);
    pdf.setFontSize(9); pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.setTextColor(isLow ? 192 : 40, isLow ? 50 : 40, isLow ? 50 : 40);
    pdf.text(item.name.substring(0,22), cols[0], y);
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text((item.sku||'').substring(0,10), cols[1], y);
    pdf.text(formatDim(item.w)+'×'+formatDim(item.h)+u, cols[2], y);
    pdf.text((sup.supplier||'').substring(0,14), cols[3], y);
    pdf.setTextColor(isLow?192:40, isLow?50:40, isLow?50:40);
    pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.text(String(item.qty), cols[4], y);
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text(String(item.low), cols[5], y);
    pdf.text(cur + ((item.qty ?? 0)*(item.cost ?? 0)).toFixed(0), cols[6], y);
    y += 5;
  });

  // Footer
  pdf.setFontSize(6.5); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** @param {any} o */
function _buildWorkOrderPDF(o) {
  if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  /** @param {number} v */
  const fmt = v => cur + Math.round(v).toLocaleString();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  /** @type {Record<string, string>} */
  const statusLabelMap = { quote:'Quote Sent', confirmed:'Confirmed', production:'In Production', delivery:'Ready for Delivery', complete:'Complete' };
  const statusLabel = statusLabelMap[o.status||''] || o.status;

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // Header
  pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'ProCabinet', M, y + 6);
  const bizSub = [biz.phone, biz.email].filter(Boolean).join('  ·  ');
  if (bizSub) { pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(120); pdf.text(bizSub, M, y + 11); }
  pdf.setFontSize(20); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text('WORK ORDER', PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text('#WO-' + String(o.id).padStart(4,'0') + '  ·  ' + dateStr, PW - M, y + 12, { align:'right' });
  y += 18;
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // Project info
  /** @type {Array<[string, string]>} */
  const infoItems = [
    ['Client', orderClient(o)], ['Project', orderProject(o)],
    ['Order Value', fmt(o.value ?? 0)], ['Status', statusLabel||''],
    ['Due Date', o.due || 'TBD']
  ];
  infoItems.forEach(([label, val]) => {
    pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
    pdf.text(label.toUpperCase(), M, y);
    pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
    pdf.text(String(val), M + 35, y);
    y += 7;
  });
  y += 5;

  // Notes
  if (o.notes) {
    pdf.setDrawColor(220); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y); y += 6;
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal'); pdf.setTextColor(40);
    const noteLines = pdf.splitTextToSize(o.notes, W);
    noteLines.forEach(/** @param {string} nl */ nl => { pdf.text(nl, M, y); y += 5; });
    y += 5;
  }

  // Production notes (blank lines)
  pdf.setDrawColor(220); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y); y += 6;
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
  pdf.text('PRODUCTION NOTES', M, y); y += 8;
  for (let i = 0; i < 8; i++) {
    pdf.setDrawColor(210); pdf.setLineWidth(0.15); pdf.line(M, y, PW-M, y);
    y += 8;
  }
  y += 5;

  // Sign-off
  if (y > PH - 50) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
  pdf.text('SIGN-OFF', M, y); y += 8;
  ['Prepared by', 'Date started', 'Date completed'].forEach(label => {
    pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
    pdf.text(label, M, y + 10);
    pdf.setDrawColor(180); pdf.setLineWidth(0.3); pdf.line(M + 30, y + 10, M + 80, y + 10);
    y += 14;
  });

  // Footer
  pdf.setFontSize(6.5); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Client-facing order document PDF — Order Confirmation, Pro-forma, or Invoice.
 * Modelled on _buildQuotePDF: same header, same line-items grouping, same
 * subtotal/markup/tax/total stack. Type drives the title, ref prefix,
 * addressee label, payment block, and closing line.
 *
 * The work_order variant is intentionally NOT routed through this builder —
 * _buildWorkOrderPDF stays as the workshop document so its production-note
 * lines and sign-off block don't bleed into client-facing outputs.
 *
 * @param {any} o the order row
 * @param {any[]} lines order_lines rows (may be empty for legacy orders)
 * @param {'order_confirmation'|'proforma'|'invoice'} type
 */
function _buildOrderDocPDF(o, lines, type) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const cur = window.currency;
  const biz = getBizInfo();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const refNum = String(o.id).padStart(4,'0');
  const dueLabel = (o.due && o.due !== 'TBD') ? o.due : 'On receipt';

  /** @type {Record<string, {title: string, prefix: string, addresseeLabel: string, totalLabel: string, closing: string, showPaymentBlock: boolean, showDueInHeader: boolean}>} */
  const cfg = {
    order_confirmation: {
      title: 'ORDER CONFIRMATION', prefix: 'OC', addresseeLabel: 'PREPARED FOR',
      totalLabel: 'ORDER TOTAL',
      closing: 'Thank you for confirming your order. We will keep you updated as your job progresses.',
      showPaymentBlock: false, showDueInHeader: false,
    },
    proforma: {
      title: 'PRO FORMA INVOICE', prefix: 'PF', addresseeLabel: 'BILL TO',
      totalLabel: 'AMOUNT DUE',
      closing: 'Pro forma invoice — not a tax invoice. Goods/services not yet supplied.',
      showPaymentBlock: true, showDueInHeader: true,
    },
    invoice: {
      title: 'TAX INVOICE', prefix: 'INV', addresseeLabel: 'BILL TO',
      totalLabel: 'TOTAL DUE',
      closing: 'Payment due by ' + dueLabel + '. Please reference #INV-' + refNum + ' on remittance.',
      showPaymentBlock: true, showDueInHeader: true,
    },
  };
  const c = cfg[type];
  if (!c) { _toast('Unknown document type: ' + type, 'error'); return; }

  // Compute totals from order_lines. If no lines (legacy orders), invert
  // o.value back through markup+tax so the breakdown still adds up.
  const rows = Array.isArray(lines) ? lines : [];
  let sub, stockMat = 0;
  if (rows.length > 0) {
    let matSum = 0, labSum = 0;
    for (const row of rows) {
      const s = _lineSubtotal(row);
      matSum += s.materials;
      labSum += s.labour;
      if (row.line_kind === 'stock') stockMat += s.materials;
    }
    sub = matSum + labSum;
  } else {
    const mFrac = (o.markup ?? 0) / 100;
    const tFrac = (o.tax ?? 0) / 100;
    const denom = (1 + mFrac) * (1 + tFrac);
    sub = denom > 0 ? (o.value ?? 0) / denom : (o.value ?? 0);
  }
  const stockMarkupPct = /** @type {any} */ (o).stock_markup ?? 0;
  const stockMarkupAmt = stockMat * stockMarkupPct / 100;
  const subWithStock = sub + stockMarkupAmt;
  const markupAmt = subWithStock * (o.markup ?? 0) / 100;
  const afterMarkup = subWithStock + markupAmt;
  const taxAmt = afterMarkup * (o.tax ?? 0) / 100;
  const afterTax = afterMarkup + taxAmt;
  const orderDiscPct = /** @type {any} */ (o).discount ?? 0;
  const orderDiscAmt = afterTax * orderDiscPct / 100;
  const total = afterTax - orderDiscAmt;
  const anyLineDisc = rows.some(/** @param {any} r */ r => (parseFloat(r.discount) || 0) > 0);

  /** @param {number} v */
  const fmt = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18;
  const W = PW - 2*M;
  let y = M;

  // ── Header ──
  pdf.setFontSize(16); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(biz.name || 'Your Business', M, y + 6);
  const bizSub = [biz.phone, biz.email, biz.address].filter(Boolean).join('  ·  ');
  if (bizSub) { pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(120); pdf.text(bizSub, M, y + 11); }
  if (biz.abn) { pdf.setFontSize(7); pdf.text('ABN: ' + biz.abn, M, y + 15); }

  pdf.setFontSize(22); pdf.setFont('helvetica','normal'); pdf.setTextColor(50);
  pdf.text(c.title, PW - M, y + 7, { align:'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text('#' + c.prefix + '-' + refNum + '  ·  ' + dateStr, PW - M, y + 12, { align:'right' });
  if (c.showDueInHeader) {
    pdf.setFontSize(8); pdf.setTextColor(140);
    pdf.text('Due: ' + dueLabel, PW - M, y + 16, { align:'right' });
  }

  y += 20;
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW-M, y);
  y += 10;

  // ── Addressee ──
  pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(170);
  pdf.text(c.addresseeLabel, M, y);
  pdf.text('PROJECT', M + 70, y);
  y += 5;
  pdf.setFontSize(13); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
  pdf.text(orderClient(o) || '—', M, y);
  pdf.setFontSize(12); pdf.setFont('helvetica','bold');
  pdf.text(orderProject(o) || '—', M + 70, y);
  y += 12;

  // ── Line items ──
  if (rows.length > 0) {
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
    pdf.text('DESCRIPTION', M, y);
    if (anyLineDisc) pdf.text('DISC', PW - M - 28, y, { align: 'right' });
    pdf.text('AMOUNT', PW-M, y, { align:'right' });
    y += 2;
    pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.line(M, y, PW-M, y);
    y += 6;

    let lastKind = '';
    rows.forEach(/** @param {any} row */ row => {
      const d = _lineDisplay(row);
      if (d.kind !== lastKind) {
        pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(160);
        const groupLabel = { cabinet: 'CABINETS', item: 'ITEMS', labour: 'LABOUR' };
        pdf.text((/** @type {any} */ (groupLabel))[d.kind] || d.kind.toUpperCase(), M, y);
        y += 4;
        lastKind = d.kind;
      }
      pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      const headerText = d.qtyText ? d.name + '  ' + d.qtyText : d.name;
      pdf.text(headerText, M, y);
      if (anyLineDisc) {
        const rowDisc = parseFloat(row.discount) || 0;
        pdf.setFont('helvetica','normal'); pdf.setTextColor(130); pdf.setFontSize(9);
        pdf.text(rowDisc > 0 ? rowDisc + '%' : '—', PW - M - 28, y, { align: 'right' });
        pdf.setFont('helvetica','bold'); pdf.setTextColor(17); pdf.setFontSize(11);
      }
      pdf.text(fmt(d.total), PW - M, y, { align: 'right' });
      y += 5;
      if (d.detail) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(130);
        const detailLines = pdf.splitTextToSize(d.detail, W - 30);
        detailLines.forEach(/** @param {string} dl */ dl => { pdf.text(dl, M + 4, y); y += 4; });
      }
      y += 3;
      if (y > PH - 60) { pdf.addPage(); y = M + 10; }
    });

    pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.line(M, y, PW-M, y);
    y += 8;
  }

  // ── Totals ──
  const totalsX = PW - M;
  const labelX = PW - M - 80;

  if ((o.markup ?? 0) > 0 || (o.tax ?? 0) > 0 || orderDiscPct > 0 || stockMarkupAmt > 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('Subtotal', labelX, y); pdf.text(fmt(sub), totalsX, y, { align:'right' });
    y += 6;
  }
  if (stockMarkupAmt > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Stock markup (' + stockMarkupPct + '%)', labelX, y); pdf.text('+ ' + fmt(stockMarkupAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if ((o.markup ?? 0) > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Markup (' + o.markup + '%)', labelX, y); pdf.text('+ ' + fmt(markupAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if ((o.tax ?? 0) > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Tax (' + o.tax + '%)', labelX, y); pdf.text('+ ' + fmt(taxAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if (orderDiscPct > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(196, 68, 68);
    pdf.text('Discount (' + orderDiscPct + '%)', labelX, y); pdf.text('− ' + fmt(orderDiscAmt), totalsX, y, { align:'right' });
    pdf.setTextColor(140);
    y += 5;
  }

  // ── Total box ──
  y += 3;
  if (y > PH - 40) { pdf.addPage(); y = M + 10; }
  pdf.setFillColor(17,17,17); pdf.roundedRect(M, y, W, 14, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(255);
  pdf.text(c.totalLabel, M + 8, y + 9);
  pdf.setFontSize(18); pdf.setFont('helvetica','bold');
  pdf.text(fmt(total), PW - M - 8, y + 9.5, { align:'right' });
  y += 22;

  // ── Notes ──
  if (o.notes) {
    if (y > PH - 50) { pdf.addPage(); y = M + 10; }
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(10); pdf.setFont('helvetica','normal'); pdf.setTextColor(40);
    const noteLines = pdf.splitTextToSize(o.notes, W);
    noteLines.forEach(/** @param {string} nl */ nl => {
      if (y > PH - 30) { pdf.addPage(); y = M + 10; }
      pdf.text(nl, M, y); y += 5;
    });
    y += 5;
  }

  // ── Payment block (proforma + invoice) ──
  if (c.showPaymentBlock) {
    if (y > PH - 40) { pdf.addPage(); y = M + 10; }
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(100);
    pdf.text('PAYMENT', M, y); y += 5;
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('[Bank details — configure in Business settings]', M, y);
    y += 8;
  }

  // ── Closing line ──
  if (y > PH - 30) { pdf.addPage(); y = M + 10; }
  pdf.setFontSize(8.5); pdf.setFont('helvetica','italic'); pdf.setTextColor(120);
  const closingLines = pdf.splitTextToSize(c.closing, W);
  closingLines.forEach(/** @param {string} cl */ cl => {
    if (y > PH - 25) { pdf.addPage(); y = M + 10; }
    pdf.text(cl, M, y); y += 5;
  });

  // ── Footer ──
  pdf.setFontSize(6.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(190);
  pdf.text((biz.name || 'ProCabinet') + ' — ProCabinet.App', M, PH - M);
  pdf.text(dateStr, PW - M, PH - M, { align:'right' });

  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** @param {{biz: any, layouts: any[], imgs: string[], pieces: any[], u: string, cur: string, totalPieces: number, avgUtil: string, matCost: number}} arg */
async function _buildCutListPDF({ biz, layouts, imgs, pieces, u, cur, totalPieces, avgUtil, matCost }) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  _toast('Building PDF\u2026', 'info', 8000);
  try {
    const { jsPDF } = window.jspdf;
    const isPortrait = layoutRotate;
    const PW = isPortrait ? 210 : 297;
    const PH = isPortrait ? 297 : 210;
    const M = 10;
    const W = PW - 2*M, H = PH - 2*M;
    const pdf = new jsPDF({ orientation: isPortrait ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    // ── safe hex → [r,g,b] ──
    /** @param {string} hex */
    function hexRgb(hex) {
      if (!hex || hex.length < 7) return [180,180,180];
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

    // ── compact title bar drawn at top of each sheet page ──
    // Stacked layout: name + sub on left (two lines), CUT LIST + date on right (two lines).
    // Eliminates horizontal collision when business contact info is long.
    function titleBar() {
      const sub = [biz.phone, biz.email].filter(Boolean).join(' · ');
      // Left side — name top, sub bottom
      pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(biz.name || 'ProCabinet', M, M+4);
      if (sub) {
        pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
        pdf.text(sub, M, M+8);
      }
      // Right side — CUT LIST top, date bottom
      pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(110);
      pdf.text('CUT LIST', PW-M, M+4, { align:'right' });
      pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
      pdf.text(dateStr, PW-M, M+8, { align:'right' });
      // Divider
      pdf.setDrawColor(200); pdf.setLineWidth(0.25); pdf.line(M, M+10, PW-M, M+10);
      pdf.setTextColor(17);
    }

    // ── full-page header used on the combined summary/cutlist page ──
    function pageHeader() {
      pdf.setFontSize(14); pdf.setFont('helvetica','bold'); pdf.setTextColor(17,17,17);
      pdf.text(biz.name || 'ProCabinet', M, M+7);
      const sub = [biz.phone, biz.email].filter(Boolean).join('  \u00b7  ');
      if (sub) { pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(136); pdf.text(sub, M, M+12); }
      pdf.setFontSize(20); pdf.setFont('helvetica','normal'); pdf.setTextColor(51);
      pdf.text('CUT LIST', PW-M, M+9, { align:'right' });
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(153);
      pdf.text(dateStr, PW-M, M+14, { align:'right' });
      pdf.setDrawColor(17); pdf.setLineWidth(0.7); pdf.line(M, M+17, PW-M, M+17);
      pdf.setTextColor(17);
    }

    // ── one page per sheet — sheets start on page 1 ──
    // Wider image column in landscape (3/4) than portrait (2/3) — portrait's
    // table can't take any more squeeze, but landscape has room to spare.
    const leftW  = Math.floor(W * (isPortrait ? 2/3 : 3/4));
    const gap    = 8;
    const rightX = M + leftW + gap;
    const rightW = W - leftW - gap;
    const hdgH   = 9;                     // heading bar height
    const titleBarH = 12;                 // stacked title bar height

    layouts.forEach(/** @param {any} layout @param {number} i */ (layout, i) => {
      if (i > 0) pdf.addPage();           // first sheet on page 1, rest add pages
      titleBar();
      const util = (layout.util*100).toFixed(0);

      // Effective sheet dims — swap when the on-screen viewer is rotated, so the
      // captured (rotated) PNG and the displayed dims agree on aspect & values.
      const sw = layoutRotate ? layout.sheet.h : layout.sheet.w;
      const sh = layoutRotate ? layout.sheet.w : layout.sheet.h;

      // sheet heading bar (sits below title bar)
      const sheetHdgY = M + titleBarH + 2;
      pdf.setFillColor(245,245,245); pdf.rect(M, sheetHdgY, W, hdgH, 'F');
      pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.rect(M, sheetHdgY, W, hdgH, 'S');
      pdf.setFontSize(9.5); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      // Sheet label: physical-sheet numbers (e.g. "Sheet 1", "Sheets 2-4 (\u00d73)")
      // when this entry collapses multiple identical physical sheets.
      const lqty = layout.qty || 1;
      const lphys = layout.physIndexes || [i];
      const lLabel = lqty > 1
        ? (lphys[0] === lphys[lphys.length-1]
            ? `Sheet ${lphys[0]+1} (\u00d7${lqty})`
            : `Sheets ${lphys[0]+1}\u2013${lphys[lphys.length-1]+1} (\u00d7${lqty})`)
        : `Sheet ${lphys[0]+1}`;
      pdf.text(`${lLabel}  \u2014  ${layout.sheet.name}`, M+4, sheetHdgY+6);
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(110);
      pdf.text(`${formatDim(sw)}\u00d7${formatDim(sh)} ${u}    ${layout.placed.length} piece${layout.placed.length!==1?'s':''}    ${util}% used`, PW-M-2, sheetHdgY+6, { align:'right' });
      pdf.setTextColor(17);

      // panel image — left 2/3, aspect-correct
      if (imgs[i]) {
        const imgX = M+2, imgY = sheetHdgY + hdgH + 3;
        const maxW = leftW-4, maxH = PH-imgY-M-2;
        const aspect = sw / sh;
        let iw, ih;
        if (aspect >= maxW/maxH) { iw = maxW; ih = iw/aspect; }
        else                      { ih = maxH; iw = ih*aspect; }
        pdf.setDrawColor(220); pdf.setLineWidth(0.2); pdf.rect(imgX, imgY, iw, ih, 'S');
        pdf.addImage(imgs[i], 'PNG', imgX, imgY, iw, ih);
      }

      // cut list table — right 1/3
      /** @type {any} */ (pdf).autoTable({
        startY: sheetHdgY + hdgH + 3,
        margin: { left: rightX, right: M },
        tableWidth: rightW,
        head: [['', 'Label', `W (${u})`, `H (${u})`]],
        body: layout.placed.map(/** @param {any} p */ p => ['', p.item.label, formatDim(p.item.w), formatDim(p.item.h)]),
        styles: { fontSize: 7.5, cellPadding: 1.8, overflow:'ellipsize', textColor:[17,17,17] },
        headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:6.5, lineWidth:0 },
        columnStyles: { 0:{cellWidth:5}, 2:{halign:'right'}, 3:{halign:'right'} },
        theme: 'plain',
        tableLineColor: [224,224,224], tableLineWidth: 0.2,
        didDrawCell(/** @type {any} */ data) {
          if (data.column.index===0 && data.section==='body') {
            const p = layout.placed[data.row.index];
            if (p) { const [r,g,b]=hexRgb(p.item.color); pdf.setFillColor(r,g,b); pdf.circle(data.cell.x+2.5, data.cell.y+3, 1.5, 'F'); }
          }
        }
      });
    });

    // ── OPTIONAL COMBINED PAGE: summary stats + full cut list ──
    if (clShowSummary || clShowCutList) {
      pdf.addPage();
      pageHeader();
      let cy = M + 22;

      if (clShowSummary) {
        const stats = [
          { v: layouts.length,                           l: 'SHEETS' },
          { v: totalPieces,                              l: 'PIECES' },
          { v: avgUtil + '%',                            l: 'EFFICIENCY' },
          { v: (100-parseFloat(avgUtil)).toFixed(1)+'%', l: 'WASTE' },
        ];
        if (matCost > 0) stats.push({ v: cur + matCost.toLocaleString(), l: 'MATERIAL COST' });
        const sw = W / stats.length;
        stats.forEach((s, i) => {
          const sx = M + i*sw;
          pdf.setFillColor(247,247,247); pdf.roundedRect(sx, cy, sw-2, 20, 2, 2, 'F');
          pdf.setFontSize(18); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
          pdf.text(String(s.v), sx+sw/2-1, cy+12, { align:'center' });
          pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
          pdf.text(s.l, sx+sw/2-1, cy+17, { align:'center' });
        });
        cy += 26;
      }

      if (clShowCutList) {
        if (clShowSummary) { cy += 4; }
        pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(80);
        pdf.text('ALL PIECES', M, cy);
        pdf.setDrawColor(210); pdf.setLineWidth(0.2); pdf.line(M, cy+1.5, PW-M, cy+1.5);
        cy += 5;
        /** @type {any} */ (pdf).autoTable({
          startY: cy, margin: { left:M, right:M },
          head: [['','Label',`W (${u})`,`H (${u})`,'Qty','Material','Grain']],
          body: pieces.map(/** @param {any} p */ p => ['',p.label,p.w,p.h,p.qty,p.material||'--',p.grain==='h'?'Horiz':p.grain==='v'?'Vert':'--']),
          styles: { fontSize:8, cellPadding:2, overflow:'ellipsize', textColor:[17,17,17] },
          headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:7, lineWidth:0 },
          columnStyles: { 0:{cellWidth:6}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right',cellWidth:10} },
          theme: 'plain', tableLineColor:[224,224,224], tableLineWidth:0.2,
          didDrawCell(/** @type {any} */ data) {
            if (data.column.index===0 && data.section==='body') {
              const p = pieces[data.row.index];
              if (p) { const [r,g,b]=hexRgb(p.color); pdf.setFillColor(r,g,b); pdf.circle(data.cell.x+2.5, data.cell.y+3, 1.5, 'F'); }
            }
          }
        });
      }

      // footer
      pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(187);
      pdf.text((biz.name||'ProCabinet')+' \u2014 ProCabinet.App', M, PH-M+4);
      pdf.text('Printed '+dateStr, PW-M, PH-M+4, { align:'right' });
    }

    // output as real PDF blob → opens in browser PDF viewer
    const blob = pdf.output('blob');
    const url  = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, target:'_blank', rel:'noopener' });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    _toast('PDF opened in new tab', 'success', 3000);
  } catch(err) {
    console.error(err);
    _toast('PDF generation failed: '+(/** @type {any} */ (err).message), 'error');
  }
}

function toggleLayoutRotate() {
  layoutRotate = !layoutRotate;
  const b = _byId('lt-rotate'); if (b) b.classList.toggle('active', layoutRotate);
  renderResults();
}
function toggleClSummary() {
  clShowSummary = !clShowSummary;
  clShowCutList = clShowSummary;  // cut list table is part of the Summary tile now
  localStorage.setItem('pc_show_summary', clShowSummary ? '1' : '0');
  localStorage.setItem('pc_show_cutlist', clShowCutList ? '1' : '0');
  _byId('lt-pg-summary')?.classList.toggle('active', clShowSummary);
  renderResults();
}
function toggleClCutList() {
  // Legacy — routed through the combined Summary toggle
  toggleClSummary();
}
// Recursive guillotine packer (multi-start best-fit).
// Options A+B: tournament over several starting orderings × best-short-side-fit
// pick at each region × shorter-axis-first split preference. Every layout is
// pure guillotine by construction — edge-to-edge cuts per region.
/** @param {number} sheetW @param {number} sheetH @param {string} sheetGrain @param {any[]} items @param {number} kerf */
function packSheetRecGuillotine(sheetW, sheetH, sheetGrain, items, kerf) {
  /** @param {any} it */
  const orientOf = (it) => {
    const pg = it.grain || 'none', sg = sheetGrain || 'none';
    const mustRot = pg !== 'none' && sg !== 'none' && pg !== sg;
    const canRot  = pg === 'none' || mustRot;
    const nat = { w: it.w, h: it.h, rotated: false };
    const rot = { w: it.h, h: it.w, rotated: true };
    if (mustRot) return [rot, nat];
    if (canRot)  return [nat, rot];
    return [nat];
  };
  /** @param {any[]} pcs */
  const areaOf = (pcs) => pcs.reduce(/** @param {number} s @param {any} p */ (s, p) => s + p.w * p.h, 0);
  /** @param {any} a @param {any} b */
  const betterThan = (a, b) => {
    if (!b) return true;
    if (a.placed.length !== b.placed.length) return a.placed.length > b.placed.length;
    return areaOf(a.placed) > areaOf(b.placed);
  };

  // Inner packer: given a pre-sorted item list, recursively fill regions using
  // best-short-side-fit picks. Orderings is the tiebreak when multiple items
  // tie on BSSF score — earlier-in-list wins.
  /** @param {any[]} orderedItems */
  function packOrdered(orderedItems) {
    /** @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {any[]} items @returns {any} */
    function packRegion(x0, y0, x1, y1, items) {
      const rw = x1 - x0, rh = y1 - y0;
      if (rw < 1 || rh < 1 || !items.length) return { placed: [], leftover: items };

      // Best Short Side Fit: pick the item+orientation that leaves the smallest
      // minor leftover. Ties broken by the caller-provided item order.
      let pickIdx = -1, pickScore = Infinity;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        for (const o of orientOf(it)) {
          if (o.w > rw + 0.5 || o.h > rh + 0.5) continue;
          const score = Math.min(rw - o.w, rh - o.h);
          if (score < pickScore) { pickIdx = i; pickScore = score; }
          break;  // first valid orientation for this item — we'll branch on both later
        }
      }
      if (pickIdx < 0) return { placed: [], leftover: items };

      const it = items[pickIdx];
      const remaining = items.filter(/** @param {any} _ @param {number} i */ (_, i) => i !== pickIdx);

      // Branch on every fitting orientation × both guillotine splits.
      // Split A (row-first): RIGHT = (x0+w+k, y0, x1, y0+h), BELOW = (x0, y0+h+k, x1, y1)
      // Split B (col-first): BELOW = (x0, y0+h+k, x0+w, y1), RIGHT = (x0+w+k, y0, x1, y1)
      // SAS preference: when leftover RIGHT arm is narrower than BELOW arm, prefer
      // Split B (keep the wider BELOW arm intact); else Split A. Still try both —
      // this only affects tie-breaking when both pack the same # of pieces.
      /** @type {any} */
      let best = null;
      for (const o of orientOf(it)) {
        if (o.w > rw + 0.5 || o.h > rh + 0.5) continue;
        const placed0 = { x: x0, y: y0, w: o.w, h: o.h, item: it, rotated: o.rotated };
        const preferA = (rw - o.w) >= (rh - o.h);  // wider right arm → preserve it via split A

        /** @returns {any} */
        const tryA = () => {
          const rA1 = packRegion(x0 + o.w + kerf, y0, x1, y0 + o.h, remaining);
          const rA2 = packRegion(x0, y0 + o.h + kerf, x1, y1, rA1.leftover);
          return { placed: [placed0, ...rA1.placed, ...rA2.placed], leftover: rA2.leftover };
        };
        /** @returns {any} */
        const tryB = () => {
          const rB1 = packRegion(x0, y0 + o.h + kerf, x0 + o.w, y1, remaining);
          const rB2 = packRegion(x0 + o.w + kerf, y0, x1, y1, rB1.leftover);
          return { placed: [placed0, ...rB1.placed, ...rB2.placed], leftover: rB2.leftover };
        };

        const [first, second] = preferA ? [tryA(), tryB()] : [tryB(), tryA()];
        if (betterThan(first, best)) best = first;
        if (betterThan(second, best)) best = second;
      }

      return best || { placed: [], leftover: items };
    }
    return packRegion(0, 0, sheetW, sheetH, orderedItems);
  }

  // Multi-start tournament — five orderings, keep the best result.
  const orderings = [
    [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h)),                         // area desc
    [...items].sort((a, b) => b.h - a.h),                                         // height desc
    [...items].sort((a, b) => b.w - a.w),                                         // width desc
    [...items].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h)),           // longest-edge desc
    [...items].sort((a, b) => (b.w + b.h) - (a.w + a.h)),                         // perimeter desc
  ];

  let best = null;
  for (const ord of orderings) {
    const res = packOrdered(ord);
    if (betterThan(res, best)) best = res;
  }
  return best || { placed: [], leftover: items };
}

// Groups physical-sheet layouts that pack identical pieces in identical
// positions/orientations into a single unique-layout entry with a `qty` count
// and `physIndexes` (the positions in the flat results.layouts array that
// collapsed into this entry). Stats keep iterating the flat array; the viewer
// and PDF iterate the unique array for one canvas/page per unique packing.
/**
 * @param {any[]} flatLayouts
 * @returns {any[]}
 */
function _groupUniqueLayouts(flatLayouts) {
  /** @param {any} l */
  const layoutKey = (l) => [
    l.sheet.name, l.sheet.w, l.sheet.h, l.sheet.grain || 'none', l.sheet.kerf ?? 0,
    l.placed.map(/** @param {any} p */ p => `${p.item.id}:${p.x}:${p.y}:${p.rotated?1:0}:${p.w}:${p.h}`).sort().join(',')
  ].join('|');
  /** @type {any[]} */
  const unique = [];
  /** @type {Map<string, number>} */
  const keyToIdx = new Map();
  flatLayouts.forEach(/** @param {any} l @param {number} i */ (l, i) => {
    const k = layoutKey(l);
    if (keyToIdx.has(k)) {
      const u = unique[/** @type {number} */ (keyToIdx.get(k))];
      u.qty++;
      u.physIndexes.push(i);
    } else {
      keyToIdx.set(k, unique.length);
      unique.push({ ...l, qty: 1, physIndexes: [i] });
    }
  });
  return unique;
}

function optimize() {
  if (!_userId && _getOptCount() >= FREE_LIMIT) {
    /** @type {HTMLElement} */ (_byId('paywall-modal')).classList.remove('hidden');
    return;
  }
  const activeSheets = sheets.filter(s => s.enabled !== false);
  const activePieces = pieces.filter(p => p.enabled !== false);
  if (!activeSheets.length) { _toast('Add at least one enabled sheet panel.', 'error'); return; }
  if (!activePieces.length) { _toast('Add at least one enabled cut part.', 'error'); return; }
  let remaining = [];
  for (const p of activePieces) for (let i = 0; i < p.qty; i++) {
    const {w: tw, h: th} = _trimmedDims(p);
    remaining.push({ ...p, w: tw, h: th, _origW: p.w, _origH: p.h, _inst: i });
  }
  remaining.sort((a, b) => (b.w * b.h) - (a.w * a.h));
  const sheetInsts = [];
  for (const s of activeSheets) for (let i = 0; i < s.qty; i++) sheetInsts.push({ ...s, _inst: i });
  const layouts = [];
  for (const si of sheetInsts) {
    if (!remaining.length) break;
    const fittable = remaining.filter(p => {
      if (p.material && p.material !== si.name) return false;
      const pGrain = p.grain || 'none';
      const sGrain = si.grain || 'none';
      const mustRotate = pGrain !== 'none' && sGrain !== 'none' && pGrain !== sGrain;
      const canRotate  = pGrain === 'none' || mustRotate;
      const fitsNatural = p.w <= si.w && p.h <= si.h;
      const fitsRotated = p.h <= si.w && p.w <= si.h;
      if (mustRotate) return fitsRotated || fitsNatural;
      if (canRotate)  return fitsNatural || fitsRotated;
      return fitsNatural;
    });
    if (!fittable.length) continue;
    const sheetKerf = si.kerf ?? 0;
    // PANEL-SAW OPTIMISATION ───────────────────────────────────────────────
    // Recursive guillotine only — builds an explicit cut tree by trying both
    // horizontal and vertical splits at each region and keeping whichever
    // packs more pieces. Produces clean hierarchical structure ideal for
    // panel-saw workflows.
    const recR   = packSheetRecGuillotine(si.w, si.h, si.grain || 'none', fittable, sheetKerf);
    if (!recR.placed.length) continue;
    const chosen = recR;
    const { placed, leftover } = chosen;
    if (!placed.length) continue;
    const usedArea = placed.reduce(/** @param {number} s @param {any} p */ (s, p) => s + p.w * p.h, 0);
    layouts.push({ sheet: si, placed, util: usedArea / (si.w * si.h), waste: 1 - usedArea / (si.w * si.h) });
    const placedKeys = new Set(placed.map(/** @param {any} p */ p => `${p.item.id}_${p.item._inst}`));
    remaining = remaining.filter(/** @param {any} p */ p => !placedKeys.has(`${p.id}_${p._inst}`));
  }
  results = { layouts, unplaced: remaining, total: activePieces.reduce(/** @param {number} s @param {any} p */ (s,p) => s+p.qty, 0), placed: activePieces.reduce(/** @param {number} s @param {any} p */ (s,p) => s+p.qty, 0) - remaining.length };

  // Group identical layouts so the viewer/PDF render one canvas per unique
  // packing with a ×N badge, while results.layouts stays flat for stats and
  // for downstream consumers (stock.js, quotes.js).
  results.uniqueLayouts = _groupUniqueLayouts(results.layouts);

  if (!_userId) _incOptCount();
  activeSheetIdx = 0;
  if (typeof switchCLMainView === 'function') switchCLMainView('layout');
  renderResults();
  // Scroll results into view
  setTimeout(() => {
    const el = _byId('results-area');
    if (el) el.scrollTop = 0;
    // On narrow screens, scroll the right panel into view
    const right = document.querySelector('.cl-right');
    if (right) right.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}

/** @param {string} tab */
function switchTab(tab) {
  activeTab = tab;
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.inner-tab')).forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  renderResults();
}

function renderResults() {
  if (!results) return;
  // Sync layout toolbar button states with persisted prefs
  const btnCo = _byId('lt-cutorder'); if (btnCo) btnCo.classList.toggle('active', layoutCutOrder);
  const btnSum = _byId('lt-pg-summary'); if (btnSum) btnSum.classList.toggle('active', clShowSummary);
  const btnScl = _byId('lt-sheetcl'); if (btnScl) btnScl.classList.toggle('active', layoutSheetCutList);
  const area = _byId('results-area');
  if (area) renderLayout(area);  // inner tabs removed; layout view is the only view
}

/** @param {HTMLElement} area */
function renderLayout(area) {
  if (!results.layouts.length) {
    area.innerHTML = '<div class="empty-state"><h3>No layouts generated</h3><p>Check that your pieces fit within your sheet dimensions.</p></div>';
    return;
  }
  const u = window.units === 'metric' ? 'mm' : 'in';
  const totalArea = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => s + l.sheet.w * l.sheet.h, 0);
  const usedArea  = results.layouts.reduce(/** @param {number} s @param {any} l */ (s,l) => s + l.placed.reduce(/** @param {number} a @param {any} p */ (a,p) => a + p.w * p.h, 0), 0);
  const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0.0';

  // Material cost estimate — match sheet name to stock items
  const matCost = results.layouts.reduce(/** @param {number} s @param {any} l */ (s, l) => {
    const stock = stockItems.find(si => si.name === l.sheet.name);
    return s + (stock ? (stock.cost ?? 0) : 0);
  }, 0);
  const cur = window.currency;

  area.innerHTML = '';

  // Combined Summary tile — stats + full cut list in one card, shown when Summary is on
  if (clShowSummary) {
    const card = document.createElement('div');
    card.className = 'combined-pg-card';
    card.style.marginBottom = '14px';

    const statList = [
      ['Sheets', results.layouts.length],
      ['Pieces', results.placed],
      ['Efficiency', avgUtil + '%'],
      ['Waste', (100 - parseFloat(avgUtil)).toFixed(1) + '%'],
    ];
    if (matCost > 0) statList.push(['Material Cost', cur + matCost.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0})]);

    card.innerHTML = `
      <div class="combined-pg-stats">${statList.map(([l, v]) => `<div class="combined-pg-stat"><div class="combined-pg-stat-val">${v}</div><div class="combined-pg-stat-lbl">${l}</div></div>`).join('')}</div>
      <div class="combined-pg-section-hdr" style="margin-top:14px">All Pieces</div>
      <table class="combined-pg-table">
        <thead><tr>
          <th style="width:14px"></th><th>Label</th>
          <th style="text-align:right">W (${u})</th><th style="text-align:right">H (${u})</th>
          <th style="text-align:right">Qty</th><th>Material</th><th>Grain</th><th>Notes</th>
        </tr></thead>
        <tbody>${pieces.map(p => `<tr>
          <td><div style="width:10px;height:10px;border-radius:2px;background:${p.color};opacity:.8;display:inline-block"></div></td>
          <td>${p.label}</td>
          <td style="text-align:right">${formatDim(p.w)}</td><td style="text-align:right">${formatDim(p.h)}</td>
          <td style="text-align:right">${p.qty}</td>
          <td>${p.material || '—'}</td>
          <td>${p.grain === 'h' ? 'Horiz' : p.grain === 'v' ? 'Vert' : '—'}</td>
          <td>${p.notes || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    area.appendChild(card);
  }

  // Sheets — iterate the grouped uniqueLayouts so identical packings collapse
  // to one canvas with a ×N badge. Falls back to the flat layouts if grouping
  // hasn't been computed yet (defensive — optimize() always populates it).
  const renderLayouts = results.uniqueLayouts || results.layouts;
  renderLayouts.forEach(/** @param {any} layout @param {number} i */ (layout, i) => {
    const qty = layout.qty || 1;
    const physIdxs = layout.physIndexes || [i];
    const sheetLabel = qty > 1
      ? (physIdxs[0] === physIdxs[physIdxs.length-1]
          ? `Sheet ${physIdxs[0]+1} (×${qty})`
          : `Sheets ${physIdxs[0]+1}–${physIdxs[physIdxs.length-1]+1} (×${qty})`)
      : `Sheet ${physIdxs[0]+1}`;
    const lbl = document.createElement('div');
    lbl.className = 'sheet-block-label';
    lbl.innerHTML = `<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${layout.sheet.color || 'var(--muted)'};margin-right:6px;vertical-align:middle"></span>${sheetLabel}</span><span style="font-weight:400;color:var(--muted)">${layout.sheet.name} &nbsp;·&nbsp; ${(layout.util*100).toFixed(0)}% used</span>`;
    area.appendChild(lbl);
    drawCanvas(area, layout, u);

    // Per-sheet cut list table (toggleable from toolbar)
    if (layoutSheetCutList && layout.placed.length) {
      const agg = new Map();
      for (const p of layout.placed) {
        const k = p.item.id;
        if (!agg.has(k)) agg.set(k, { label: p.item.label, w: p.item.w, h: p.item.h, qty: 0, color: p.item.color, material: p.item.material, grain: p.item.grain });
        agg.get(k).qty++;
      }
      const rows = [...agg.values()];
      const tableWrap = document.createElement('div');
      tableWrap.className = 'sheet-cutlist';
      tableWrap.innerHTML = `<table class="combined-pg-table">
        <thead><tr>
          <th style="width:14px"></th><th>Label</th>
          <th style="text-align:right">W (${u})</th><th style="text-align:right">H (${u})</th>
          <th style="text-align:right">Qty</th><th>Material</th><th>Grain</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td><div style="width:10px;height:10px;border-radius:2px;background:${r.color};opacity:.8;display:inline-block"></div></td>
          <td>${r.label}</td>
          <td style="text-align:right">${formatDim(r.w)}</td><td style="text-align:right">${formatDim(r.h)}</td>
          <td style="text-align:right">${r.qty}</td>
          <td>${r.material || '—'}</td>
          <td>${r.grain === 'h' ? 'Horiz' : r.grain === 'v' ? 'Vert' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
      area.appendChild(tableWrap);
    }
  });
}

/** @param {number} i */
function selectSheet(i) { activeSheetIdx = i; renderResults(); }

// Pastel color helpers
/** @param {string} hex */
function toPastel(hex) {
  // Panel parts: moderate tint — blend 16% color with 84% white
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.16+255*.84)},${Math.round(g*.16+255*.84)},${Math.round(b*.16+255*.84)})`;
}
/** @param {string} hex */
function toPaleSheet(hex) {
  // Sheet background: very pale (lighter than parts) — 4% tint
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.04+255*.96)},${Math.round(g*.04+255*.96)},${Math.round(b*.04+255*.96)})`;
}
/** @param {string} hex */
function toPastelDark(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.45+180*.55)},${Math.round(g*.45+180*.55)},${Math.round(b*.45+180*.55)})`;
}

/** @param {HTMLElement} container @param {any} layout @param {string} units */
function drawCanvas(container, layout, units) {
  const { sheet, placed } = layout;
  const sW = layoutRotate ? sheet.h : sheet.w;
  const sH = layoutRotate ? sheet.w : sheet.h;
  const rotPieces = placed.map(/** @param {any} p */ p => layoutRotate
    ? { ...p, x: p.y, y: p.x, w: p.h, h: p.w } : p);

  // Gutters — small margin for overall sheet dim arrows only (part/offcut dims are now inside)
  const FAR_L = 22;   // left overall height arrow + label
  const GUT_T = 6;    // top breathing room
  const GUT_R = 10;   // right breathing room
  const GUT_B = 28;   // bottom overall width arrow + label

  // Append wrap first to measure actual inner width
  const wrap = document.createElement('div');
  wrap.className = 'canvas-wrap';
  container.appendChild(wrap);

  // Auto-scale to actual wrap *content* width (clientWidth minus horizontal padding)
  const wrapCS = getComputedStyle(wrap);
  const wrapPadH = (parseFloat(wrapCS.paddingLeft) || 0) + (parseFloat(wrapCS.paddingRight) || 0);
  const wrapInner = Math.max(200, wrap.clientWidth - wrapPadH - 2);
  const layoutSpace = Math.max(200, wrapInner - FAR_L - GUT_R);
  const heightBudget = 560;
  const fitScale = Math.min(layoutSpace / sW, (heightBudget - GUT_T - GUT_B) / sH);
  const scale = Math.max(0.02, fitScale * layoutZoom);
  const cw = Math.round(sW * scale), ch = Math.round(sH * scale);

  const OX = FAR_L;
  const OY = GUT_T;
  const TW = OX + cw + GUT_R;
  const TH = OY + ch + GUT_B;

  const canvas = document.createElement('canvas');

  // ── High-DPI rendering ──
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(TW * dpr);
  canvas.height = Math.round(TH * dpr);
  canvas.style.cssText = `width:${TW}px;height:${TH}px;display:block`;
  wrap.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Unified font sizing — consistent across all labels + dims
  const fs = Math.max(9, Math.min(12, cw / 55)) * layoutFontScale;
  const FONT_FAMILY = '-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif';
  const labelFont = `500 ${fs}px ${FONT_FAMILY}`;
  const dimFont   = `400 ${fs}px ${FONT_FAMILY}`;

  // Sheet background — honors layoutColor (grey when Color is off, very pale tinted otherwise)
  if (layoutColor && sheet.color) {
    ctx.fillStyle = toPaleSheet(sheet.color);
  } else {
    ctx.fillStyle = '#f7f7f7';
  }
  ctx.fillRect(OX, OY, cw, ch);

  // Sheet grain — subtle
  const sheetGrain = sheet.grain || 'none';
  const drawSG = layoutRotate ? (sheetGrain==='h'?'v':sheetGrain==='v'?'h':'none') : sheetGrain;
  if (drawSG !== 'none' && layoutGrain) {
    ctx.save();
    ctx.beginPath(); ctx.rect(OX+1, OY+1, cw-2, ch-2); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.65;
    const sgsp = Math.max(5, Math.min(14, cw/8, ch/8));
    if (drawSG==='h') { for (let gy=sgsp; gy<ch; gy+=sgsp) { ctx.beginPath(); ctx.moveTo(OX, OY+gy); ctx.lineTo(OX+cw, OY+gy); ctx.stroke(); } }
    else { for (let gx=sgsp; gx<cw; gx+=sgsp) { ctx.beginPath(); ctx.moveTo(OX+gx, OY); ctx.lineTo(OX+gx, OY+ch); ctx.stroke(); } }
    ctx.restore();
  }

  // ── Rip direction: parallel to sheet's long axis (with grain when specified) ──
  // Rip cuts are made FIRST (industry standard), then cross cuts.
  // The plan is computed in the SHEET's ORIGINAL coordinate space so the cut
  // tree (and therefore the cut order) is invariant under display rotation.
  // After plan generation, cuts are transposed to display coords if needed.
  const sW0 = sheet.w, sH0 = sheet.h;
  const origPieces = placed;
  const origRipIsH = sheetGrain === 'h' ? true : sheetGrain === 'v' ? false : (sW0 >= sH0);
  const ripIsH = origRipIsH;  // used inside buildGuillotinePlan helpers below
  const ripPass = 1, crossPass = 2;
  /** @param {any} isH */
  const ripPassOf = isH => (isH === ripIsH) ? ripPass : crossPass;

  // ── 4-PHASE cut ordering (rip-cross-rip-cross) ──
  // phase=1 : rips reachable from root with no cross ancestor ("full-sheet rips")
  // phase=2 : crosses that enable at least one phase-3 rip ("blocking crosses")
  // phase=3 : rips that follow a phase-2 cross (have a cross ancestor in the tree)
  // phase=4 : terminal crosses with no rip later in their subtree (piece-sizing)
  // Each cut carries a `_path` — an array of 2-char ancestry tokens ('cL', 'cR',
  // 'rL', 'rR') uniquely identifying its tree position. Rip phase is known at
  // emit time. Cross phase is finalized post-build by searching for any later
  // rip whose `_path` starts with this cross's `_path` (a true descendant).
  /** @param {any} pathDirs */
  const ripPhaseFor = (pathDirs) => pathDirs.some(/** @param {any} d */ (d ) => d[0] === 'c') ? 3 : 1;

  // ── Recursive guillotine decomposition ──
  // Prefer interior rips first at each region. If none is possible, try outer
  // strips, then an interior cross. Each cut carries a `_path` snapshot of its
  // ancestor direction chain so phases can be finalized in a post-pass.
  /** @param {any} x0 @param {any} y0 @param {any} x1 @param {any} y1 @param {any} pcs @param {any} pathDirs */
  function buildGuillotinePlan(x0, y0, x1, y1, pcs, pathDirs) {
    pathDirs = pathDirs || [];
    /** @type {{ cuts: any[], offcuts: any[] }} */
    const out = { cuts: [], offcuts: [] };
    if (x1 - x0 < 0.5 || y1 - y0 < 0.5) return out;
    if (pcs.length === 0) { out.offcuts.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); return out; }

    const bounds = () => {
      let mY=-Infinity, mX=-Infinity, nY=Infinity, nX=Infinity;
      for (const p of pcs) { if (p.y+p.h>mY) mY=p.y+p.h; if (p.x+p.w>mX) mX=p.x+p.w; if (p.y<nY) nY=p.y; if (p.x<nX) nX=p.x; }
      return { mY, mX, nY, nX };
    };
    const ripPhase = ripPhaseFor(pathDirs);
    const stripBot = () => { const { mY } = bounds(); if (mY < y1 - 0.5) { out.cuts.push({ x1: x0, y1: mY, x2: x1, y2: mY, pass: ripPassOf(true),  phase: ripPhase, _path: pathDirs, outer: true }); out.offcuts.push({ x: x0, y: mY, w: x1 - x0, h: y1 - mY }); y1 = mY; } };
    const stripTop = () => { const { nY } = bounds(); if (nY > y0 + 0.5) { out.cuts.push({ x1: x0, y1: nY, x2: x1, y2: nY, pass: ripPassOf(true),  phase: ripPhase, _path: pathDirs, outer: true }); out.offcuts.push({ x: x0, y: y0, w: x1 - x0, h: nY - y0 }); y0 = nY; } };
    const stripRight = () => { const { mX } = bounds(); if (mX < x1 - 0.5) { out.cuts.push({ x1: mX, y1: y0, x2: mX, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs, outer: true }); out.offcuts.push({ x: mX, y: y0, w: x1 - mX, h: y1 - y0 }); x1 = mX; } };
    const stripLeft  = () => { const { nX } = bounds(); if (nX > x0 + 0.5) { out.cuts.push({ x1: nX, y1: y0, x2: nX, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs, outer: true }); out.offcuts.push({ x: x0, y: y0, w: nX - x0, h: y1 - y0 }); x0 = nX; } };

    /** @param {any} v @param {any} axis */
    const spans = (v, axis) => pcs.some(/** @param {any} p */ (p ) => (axis === 'h' ? (p.y < v - 0.5 && p.y + p.h > v + 0.5) : (p.x < v - 0.5 && p.x + p.w > v + 0.5)));
    /** @param {any} cands @param {any} axis */
    const pickFrom = (cands, axis) => {
      /** @type {any} */
      let best = null;
      /** @param {any} p @param {any} v */
      const onSideA = (p, v) => (axis === 'h' ? (p.y + p.h <= v + 0.5) : (p.x + p.w <= v + 0.5));
      // Perpendicular extent: for a vertical cut (axis='v'), sub-regions get stripped
      // in the y-direction, so pieces' y+h matters. For a horizontal cut, x+w matters.
      /** @param {any} p */
      const perpEnd = p => axis === 'v' ? (p.y + p.h) : (p.x + p.w);
      // Count pieces on a side that don't reach the side's max perpendicular extent.
      // Each such piece forces an extra outer strip after recursion, fragmenting waste.
      /** @param {any} side */
      const shortCount = side => {
        if (!side.length) return 0;
        let M = -Infinity;
        for (const p of side) { const e = perpEnd(p); if (e > M) M = e; }
        let n = 0;
        for (const p of side) if (perpEnd(p) < M - 0.5) n++;
        return n;
      };
      for (const v of cands) {
        /** @param {any} p */
        const sideA = pcs.filter(/** @param {any} p */ (p ) => onSideA(p, v));
        /** @param {any} p */
        const sideB = pcs.filter(/** @param {any} p */ (p ) => !onSideA(p, v));
        if (!sideA.length || !sideB.length) continue;
        const bal = Math.abs(sideA.length - sideB.length);
        const spread = shortCount(sideA) + shortCount(sideB);
        if (!best || bal < best.bal || (bal === best.bal && spread < best.spread)) {
          best = { v, bal, spread };
        }
      }
      return best;
    };

    // ──── Interior RIP (structural split in rip direction) ────
    if (pcs.length > 1) {
      const ripCands = (ripIsH
        /** @param {any} p */
        ? [...new Set(pcs.flatMap(/** @param {any} p */ (p ) => [p.y, p.y + p.h]))].filter(y => y > y0 + 0.5 && y < y1 - 0.5 && !spans(y, 'h'))
        /** @param {any} p */
        : [...new Set(pcs.flatMap(/** @param {any} p */ (p ) => [p.x, p.x + p.w]))].filter(x => x > x0 + 0.5 && x < x1 - 0.5 && !spans(x, 'v')));
      const ripBest = pickFrom(ripCands, ripIsH ? 'h' : 'v');
      if (ripBest) {
        const v = ripBest.v;
        if (ripIsH) {
          out.cuts.push({ x1: x0, y1: v, x2: x1, y2: v, pass: ripPassOf(true), phase: ripPhase, _path: pathDirs });
          /** @param {any} p */
          const above = pcs.filter(/** @param {any} p */ (p ) => p.y + p.h <= v + 0.5);
          /** @param {any} p */
          const below = pcs.filter(/** @param {any} p */ (p ) => p.y >= v - 0.5);
          const a = buildGuillotinePlan(x0, y0, x1, v, above, [...pathDirs, 'rL']);
          const b = buildGuillotinePlan(x0, v, x1, y1, below, [...pathDirs, 'rR']);
          out.cuts.push(...a.cuts, ...b.cuts);
          out.offcuts.push(...a.offcuts, ...b.offcuts);
        } else {
          out.cuts.push({ x1: v, y1: y0, x2: v, y2: y1, pass: ripPassOf(false), phase: ripPhase, _path: pathDirs });
          /** @param {any} p */
          const left  = pcs.filter(/** @param {any} p */ (p ) => p.x + p.w <= v + 0.5);
          /** @param {any} p */
          const right = pcs.filter(/** @param {any} p */ (p ) => p.x >= v - 0.5);
          const l = buildGuillotinePlan(x0, y0, v, y1, left,  [...pathDirs, 'rL']);
          const r = buildGuillotinePlan(v, y0, x1, y1, right, [...pathDirs, 'rR']);
          out.cuts.push(...l.cuts, ...r.cuts);
          out.offcuts.push(...l.offcuts, ...r.offcuts);
        }
        return out;
      }
    }

    // ──── Outer offcut stripping ────
    // Phase-1 rips are cut FIRST physically, so emit them before crosses so
    // their geometry captures the full region bounds. Phase-3 rips are cut
    // after phase-2 crosses — emit crosses first so rips see the reduced
    // bounds that match physical reality.
    if (ripPhase === 1) {
      if (ripIsH) { stripBot(); stripTop(); stripRight(); stripLeft(); }
      else        { stripRight(); stripLeft(); stripBot(); stripTop(); }
    } else {
      if (ripIsH) { stripRight(); stripLeft(); stripBot(); stripTop(); }
      else        { stripBot(); stripTop(); stripRight(); stripLeft(); }
    }

    // ──── Interior CROSS (structural split in cross direction) ────
    if (pcs.length > 1) {
      const crossCands = (ripIsH
        /** @param {any} p */
        ? [...new Set(pcs.flatMap(/** @param {any} p */ (p ) => [p.x, p.x + p.w]))].filter(x => x > x0 + 0.5 && x < x1 - 0.5 && !spans(x, 'v'))
        /** @param {any} p */
        : [...new Set(pcs.flatMap(/** @param {any} p */ (p ) => [p.y, p.y + p.h]))].filter(y => y > y0 + 0.5 && y < y1 - 0.5 && !spans(y, 'h')));
      const crossBest = pickFrom(crossCands, ripIsH ? 'v' : 'h');
      if (crossBest) {
        const v = crossBest.v;
        if (ripIsH) {
          out.cuts.push({ x1: v, y1: y0, x2: v, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs });
          /** @param {any} p */
          const left  = pcs.filter(/** @param {any} p */ (p ) => p.x + p.w <= v + 0.5);
          /** @param {any} p */
          const right = pcs.filter(/** @param {any} p */ (p ) => p.x >= v - 0.5);
          const l = buildGuillotinePlan(x0, y0, v, y1, left,  [...pathDirs, 'cL']);
          const r = buildGuillotinePlan(v, y0, x1, y1, right, [...pathDirs, 'cR']);
          out.cuts.push(...l.cuts, ...r.cuts);
          out.offcuts.push(...l.offcuts, ...r.offcuts);
        } else {
          out.cuts.push({ x1: x0, y1: v, x2: x1, y2: v, pass: ripPassOf(true), phase: 2, _path: pathDirs });
          /** @param {any} p */
          const above = pcs.filter(/** @param {any} p */ (p ) => p.y + p.h <= v + 0.5);
          /** @param {any} p */
          const below = pcs.filter(/** @param {any} p */ (p ) => p.y >= v - 0.5);
          const a = buildGuillotinePlan(x0, y0, x1, v, above, [...pathDirs, 'cL']);
          const b = buildGuillotinePlan(x0, v, x1, y1, below, [...pathDirs, 'cR']);
          out.cuts.push(...a.cuts, ...b.cuts);
          out.offcuts.push(...a.offcuts, ...b.offcuts);
        }
        return out;
      }
    }

    // Residual region
    if (pcs.length === 0) out.offcuts.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    return out;
  }

  const plan = buildGuillotinePlan(0, 0, sW0, sH0, origPieces, []);

  // Transform cuts + offcuts into display coordinates if the layout is rotated.
  // The transform is a transposition (x↔y, w↔h) — it matches the same transform
  // applied to pieces above. ripIsH etc. were computed in original space so the
  // pre-rotation cut order is preserved.
  if (layoutRotate) {
    plan.cuts = plan.cuts.map(c => ({ ...c, x1: c.y1, y1: c.x1, x2: c.y2, y2: c.x2 }));
    plan.offcuts = plan.offcuts.map(o => ({ ...o, x: o.y, y: o.x, w: o.h, h: o.w }));
  }

  // ── Finalize cross phases: 2 if a rip follows somewhere in this cut's subtree,
  // else 4. "Subtree" = cuts emitted LATER in DFS order whose path starts with
  // this cut's path (same region or any descendant region).
  /** @param {any} path @param {any} prefix */
  const pathStartsWith = (path, prefix) => {
    if (path.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) if (path[i] !== prefix[i]) return false;
    return true;
  };
  for (let i = 0; i < plan.cuts.length; i++) {
    const c = plan.cuts[i];
    if (c.pass !== crossPass) continue;  // only crosses need resolving
    const myPath = c._path || [];
    let hasRipAfter = false;
    for (let j = i + 1; j < plan.cuts.length; j++) {
      const later = plan.cuts[j];
      if (later.pass === ripPass && pathStartsWith(later._path || [], myPath)) {
        hasRipAfter = true; break;
      }
    }
    c.phase = hasRipAfter ? 2 : 4;
  }

  // Merge collinear cuts within kerf distance — a single saw pass should be ONE line.
  const kerfTol = Math.max(4, (sheet.kerf || 3) + 1);
  /** @type {any[]} */
  const cutLines = [];
  for (const c of plan.cuts) {
    const horiz = c.y1 === c.y2;
    let merged = null;
    for (const m of cutLines) {
      const mHoriz = m.y1 === m.y2;
      if (mHoriz !== horiz) continue;
      if (horiz) {
        if (Math.abs(m.y1 - c.y1) > kerfTol) continue;
        if (m.x2 < c.x1 - 0.5 || c.x2 < m.x1 - 0.5) continue;
      } else {
        if (Math.abs(m.x1 - c.x1) > kerfTol) continue;
        if (m.y2 < c.y1 - 0.5 || c.y2 < m.y1 - 0.5) continue;
      }
      merged = m; break;
    }
    if (merged) {
      if (horiz) {
        merged.y1 = merged.y2 = (merged.y1 + c.y1) / 2;
        merged.x1 = Math.min(merged.x1, c.x1);
        merged.x2 = Math.max(merged.x2, c.x2);
      } else {
        merged.x1 = merged.x2 = (merged.x1 + c.x1) / 2;
        merged.y1 = Math.min(merged.y1, c.y1);
        merged.y2 = Math.max(merged.y2, c.y2);
      }
      merged.pass = Math.min(merged.pass, c.pass);
      merged.phase = Math.min(merged.phase ?? 4, c.phase ?? 4);
    } else {
      cutLines.push({ ...c });
    }
  }

  // Keep DFS emit order — each cut depends on the physical rectangle left by
  // earlier cuts, and the planner emits in dependency order (parent cut, then
  // children). Phase-based sort would invert this for sibling outer-strip rips
  // (phase 3) vs interior crosses (phase 2) in the same region, producing cuts
  // that pass through pieces when executed.

  // ── Split cuts to reflect physical reality at the time each cut is made ──
  // When a cut comes AFTER a perpendicular cut that intersects its span, the
  // region it crosses is already separated — so the single planned cut is in
  // fact multiple physical saw passes, one per still-connected sub-piece.
  // Replace each such cut with a segment for each sub-piece.
  /** @type {any[]} */
  const finalCuts = [];
  for (const c of cutLines) {
    const isH = c.y1 === c.y2;
    /** @type {number[]} */
    const cuts = [];
    for (const prior of finalCuts) {
      const priorIsH = prior.y1 === prior.y2;
      if (priorIsH === isH) continue;  // parallel cuts don't split each other
      if (isH) {
        if (prior.x1 > c.x1 + 0.5 && prior.x1 < c.x2 - 0.5 &&
            c.y1 >= prior.y1 - 0.5 && c.y1 <= prior.y2 + 0.5) {
          cuts.push(prior.x1);
        }
      } else {
        if (prior.y1 > c.y1 + 0.5 && prior.y1 < c.y2 - 0.5 &&
            c.x1 >= prior.x1 - 0.5 && c.x1 <= prior.x2 + 0.5) {
          cuts.push(prior.y1);
        }
      }
    }
    if (!cuts.length) { finalCuts.push({ ...c }); continue; }
    cuts.sort((a, b) => a - b);
    // Minimum meaningful segment length = larger than a kerf (else it's just a saw-pass artefact)
    const minSeg = kerfTol;
    if (isH) {
      let x = c.x1;
      for (const ix of cuts) { if (ix - x > minSeg) finalCuts.push({ ...c, x1: x, x2: ix }); x = ix; }
      if (c.x2 - x > minSeg) finalCuts.push({ ...c, x1: x, x2: c.x2 });
    } else {
      let y = c.y1;
      for (const iy of cuts) { if (iy - y > minSeg) finalCuts.push({ ...c, y1: y, y2: iy }); y = iy; }
      if (c.y2 - y > minSeg) finalCuts.push({ ...c, y1: y, y2: c.y2 });
    }
  }
  cutLines.length = 0;
  cutLines.push(...finalCuts);

  // Drop cut segments that only traverse already-separated offcut regions —
  // i.e. segments that don't lie along ANY piece edge. These are "phantom"
  // passes created by the segmentation logic when a prior perpendicular cut
  // pre-separated the region the cut was planned through.
  const adjTol = kerfTol;  // allow for kerf offset between piece edge and cut line
  /** @param {any} c */
  const segmentTouchesPiece = (c) => {
    const isH = c.y1 === c.y2;
    for (const p of rotPieces) {
      if (isH) {
        const xOverlap = p.x < c.x2 - 0.5 && p.x + p.w > c.x1 + 0.5;
        if (!xOverlap) continue;
        if (Math.abs(p.y - c.y1) <= adjTol || Math.abs(p.y + p.h - c.y1) <= adjTol) return true;
      } else {
        const yOverlap = p.y < c.y2 - 0.5 && p.y + p.h > c.y1 + 0.5;
        if (!yOverlap) continue;
        if (Math.abs(p.x - c.x1) <= adjTol || Math.abs(p.x + p.w - c.x1) <= adjTol) return true;
      }
    }
    return false;
  };
  const kept = cutLines.filter(segmentTouchesPiece);
  cutLines.length = 0;
  cutLines.push(...kept);

  // Filter out kerf-slot offcuts (too small to be meaningful)
  const offcutRects = plan.offcuts.filter(o => o.w >= kerfTol + 1 && o.h >= kerfTol + 1);

  ctx.save();
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (const cl of cutLines) {
    ctx.lineWidth = cl.pass === 1 ? 1.0 : 0.8;
    ctx.beginPath();
    ctx.moveTo(OX + cl.x1 * scale, OY + cl.y1 * scale);
    ctx.lineTo(OX + cl.x2 * scale, OY + cl.y2 * scale);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  // ── Draw pieces ──
  for (const p of rotPieces) {
    const x = OX + p.x*scale, y = OY + p.y*scale, w = p.w*scale, h = p.h*scale;
    const fill  = layoutColor ? toPastel(p.item.color) : 'rgb(235,235,235)';
    const bdCol = layoutColor ? toPastelDark(p.item.color) : '#aaa';
    const txtColor = '#333';

    ctx.fillStyle = fill; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2; ctx.strokeRect(x+.6, y+.6, w-1.2, h-1.2);

    // Edge banding dashed lines (inset 3px)
    const ebEdges = p.item.edges || {};
    const inset = 3;
    const ebSides = [
      {side:'L1', x1:x+inset,   y1:y+inset,   x2:x+w-inset, y2:y+inset  },
      {side:'W2', x1:x+w-inset, y1:y+inset,   x2:x+w-inset, y2:y+h-inset},
      {side:'L3', x1:x+w-inset, y1:y+h-inset, x2:x+inset,   y2:y+h-inset},
      {side:'W4', x1:x+inset,   y1:y+h-inset, x2:x+inset,   y2:y+inset  },
    ];
    ebSides.forEach(({side, x1, y1, x2, y2}) => {
      const s = ebEdges[side]; if (!s) return;
      const mat = edgeBands.find(e => e.id === s.id); if (!mat) return;
      ctx.save();
      ctx.setLineDash([3,3]); ctx.strokeStyle = mat.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.restore();
    });

    // Grain lines
    const pGrain = p.item.grain || 'none';
    if (pGrain !== 'none' && layoutGrain) {
      // Screen-space grain = part grain flipped by p.rotated XOR layoutRotate
      // (optimizer rotation and view rotation each swap the grain axis once)
      const screenRotated = !!p.rotated !== !!layoutRotate;
      const gdir = screenRotated ? (pGrain==='h'?'v':'h') : pGrain;
      ctx.save();
      ctx.beginPath(); ctx.rect(x+1,y+1,w-2,h-2); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.65;
      const sp = Math.max(5, Math.min(14, w/8, h/8));
      if (gdir==='h') { for (let gy=y+sp; gy<y+h; gy+=sp) { ctx.beginPath(); ctx.moveTo(x,gy); ctx.lineTo(x+w,gy); ctx.stroke(); } }
      else { for (let gx=x+sp; gx<x+w; gx+=sp) { ctx.beginPath(); ctx.moveTo(gx,y); ctx.lineTo(gx,y+h); ctx.stroke(); } }
      ctx.restore();
    }

    // ── Label + dims inside part ──
    const pW = formatDim(p.rotated ? p.item.h : p.item.w);
    const pH = formatDim(p.rotated ? p.item.w : p.item.h);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Centered label — runs along the part's longest side, so on tall narrow
    // parts the text rotates to vertical and stays clear of the side dim
    // drawn on the left edge.
    const longSide = Math.max(w, h);
    const shortSide = Math.min(w, h);
    const labelRoom = longSide > 30 && shortSide > 18;
    if (labelRoom && p.item.label) {
      ctx.fillStyle = txtColor;
      ctx.font = labelFont;
      const lbl = trunc(p.item.label, Math.floor(longSide / (fs * 0.58)));
      if (h > w) {
        // tall part — rotate label along the height, centred in the part
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(lbl, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(lbl, x + w / 2, y + h / 2);
      }
    }

    // Width dim at top-inside, height dim at left-inside (rotated) — both inside part
    ctx.fillStyle = '#333';
    ctx.font = dimFont;
    if (w > 30) {
      // Width near top, clear of the label
      ctx.fillText(pW, x + w/2, y + Math.min(fs + 4, h * 0.22));
    }
    if (h > 30) {
      // Height rotated on left side, clear of the label
      ctx.save();
      ctx.translate(x + Math.min(fs + 4, w * 0.22), y + h/2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pH, 0, 0);
      ctx.restore();
    }
  }

  // ── Offcut dims — inside each offcut rectangle, centred top + left ──
  // Skip a dim if it's redundant (matches sheet edge or a touching piece's matching dim).
  ctx.save();
  ctx.fillStyle = '#8a8a8a';
  ctx.font = dimFont;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  /** @param {any} a @param {any} b */
  const eq = (a, b) => Math.abs(a - b) < 1;
  for (const oc of offcutRects) {
    const oW = formatDim(oc.w), oH = formatDim(oc.h);
    // Touching pieces on each side (edge-shared)
    /** @param {any} p */
    const touchLeft  = rotPieces.filter(/** @param {any} p */ (p ) => eq(p.x + p.w, oc.x) && p.y < oc.y + oc.h && p.y + p.h > oc.y);
    /** @param {any} p */
    const touchRight = rotPieces.filter(/** @param {any} p */ (p ) => eq(p.x, oc.x + oc.w) && p.y < oc.y + oc.h && p.y + p.h > oc.y);
    /** @param {any} p */
    const touchTop   = rotPieces.filter(/** @param {any} p */ (p ) => eq(p.y + p.h, oc.y) && p.x < oc.x + oc.w && p.x + p.w > oc.x);
    /** @param {any} p */
    const touchBot   = rotPieces.filter(/** @param {any} p */ (p ) => eq(p.y, oc.y + oc.h) && p.x < oc.x + oc.w && p.x + p.w > oc.x);

    // Skip height if it matches sheet height OR matches an adjacent piece's height
    const skipH = eq(oc.h, sH)
      /** @param {any} p */
      || touchLeft.some(/** @param {any} p */ (p ) => eq(p.h, oc.h))
      /** @param {any} p */
      || touchRight.some(/** @param {any} p */ (p ) => eq(p.h, oc.h));
    // Skip width if it matches sheet width OR matches an adjacent piece's width
    const skipW = eq(oc.w, sW)
      /** @param {any} p */
      || touchTop.some(/** @param {any} p */ (p ) => eq(p.w, oc.w))
      /** @param {any} p */
      || touchBot.some(/** @param {any} p */ (p ) => eq(p.w, oc.w));

    const oxo = OX + oc.x * scale;
    const oyo = OY + oc.y * scale;
    const owo = oc.w * scale;
    const oho = oc.h * scale;
    if (!skipW && owo > 24 && oho > 14) {
      ctx.fillText(oW, oxo + owo / 2, oyo + Math.min(fs + 4, oho * 0.22));
    }
    if (!skipH && oho > 30 && owo > 14) {
      ctx.save();
      ctx.translate(oxo + Math.min(fs + 4, owo * 0.22), oyo + oho / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(oH, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();

  // Sheet border
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.4; ctx.strokeRect(OX + .7, OY + .7, cw - 1.4, ch - 1.4);

  // ── Overall sheet dimensions (bottom arrow + left arrow) ──
  ctx.save();
  ctx.strokeStyle = '#666'; ctx.lineWidth = 0.8;
  ctx.fillStyle = '#333'; ctx.font = dimFont;
  const by = OY + ch + 16;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.beginPath(); ctx.moveTo(OX, by); ctx.lineTo(OX + cw, by); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OX, by - 4); ctx.lineTo(OX, by + 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(OX + cw, by - 4); ctx.lineTo(OX + cw, by + 4); ctx.stroke();
  const swText = formatDim(sW);
  const swW = ctx.measureText(swText).width;
  ctx.fillStyle = '#fff';
  ctx.fillRect(OX + cw / 2 - swW / 2 - 4, by - fs / 2 - 1, swW + 8, fs + 2);
  ctx.fillStyle = '#333';
  ctx.fillText(swText, OX + cw / 2, by);

  const lx = Math.max(6, FAR_L - 12);
  ctx.save();
  ctx.translate(lx, OY + ch / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.strokeStyle = '#666';
  ctx.beginPath(); ctx.moveTo(-ch / 2, 0); ctx.lineTo(ch / 2, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-ch / 2, -4); ctx.lineTo(-ch / 2, 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ch / 2, -4); ctx.lineTo(ch / 2, 4); ctx.stroke();
  const shText = formatDim(sH);
  const shW = ctx.measureText(shText).width;
  ctx.fillStyle = '#fff';
  ctx.fillRect(-shW / 2 - 4, -fs / 2 - 1, shW + 8, fs + 2);
  ctx.fillStyle = '#333';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(shText, 0, 0);
  ctx.restore();
  ctx.restore();

  // ── Optional: numbered cut-order overlay ──
  if (layoutCutOrder && cutLines.length) {
    ctx.save();
    let step = 1;
    // Use the planner's insertion order — it already emits:
    //   1. Outer offcut rips for this region
    //   2. Outer offcut cross cuts
    //   3. Interior cut (rip preferred over cross)
    //   4. Recurse into sub-regions (DFS)
    // That matches physical cutting sequence: a sub-region's rips/crosses only
    // appear after its parent strip has been separated.
    const ordered = cutLines;
    const badgeR = Math.max(8, Math.min(11, fs + 2));
    ctx.font = `700 ${Math.round(badgeR * 1.1)}px ${FONT_FAMILY}`;
    for (const cl of ordered) {
      const mx = OX + ((cl.x1 + cl.x2) / 2) * scale;
      const my = OY + ((cl.y1 + cl.y2) / 2) * scale;
      ctx.beginPath(); ctx.arc(mx, my, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#222'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(step++), mx, my + 0.5);
    }
    ctx.restore();
  }
}

/** @param {HTMLElement} area */
function renderSummary(area) {
  if (!results || !results.layouts.length) {
    area.innerHTML = '<p style="color:#94a3b8;font-size:13px;padding:20px">No results. Click Optimize first.</p>';
    return;
  }
  const u = window.units === 'metric' ? 'mm' : 'in';

  let html = `<div class="cutsheet-toolbar">
    <div style="font-size:14px;font-weight:700;color:var(--text)">Workshop Cut Sheet</div>
    <div style="display:flex;gap:8px">
      <span style="font-size:12px;color:var(--muted);align-self:center">${results.placed} pieces · ${results.layouts.length} sheet${results.layouts.length!==1?'s':''}</span>
      <button class="btn btn-outline" onclick="printLayout('pdf')" style="font-size:11px;padding:5px 10px" title="Save as PDF">PDF</button>
    </div>
  </div>`;

  results.layouts.forEach(/** @param {any} layout @param {number} si */ (layout, si) => {
    const pct = (layout.util * 100).toFixed(0);
    const wasteColor = layout.util > 0.7 ? 'var(--success)' : layout.util > 0.4 ? 'var(--accent)' : 'var(--danger)';
    html += `
    <div class="cutsheet-sheet">
      <div class="cutsheet-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="cutsheet-title">Sheet ${si + 1}</span>
          <span class="cutsheet-sub">${layout.sheet.name} &nbsp;·&nbsp; ${formatDim(layout.sheet.w)}×${formatDim(layout.sheet.h)} ${u}</span>
        </div>
        <span style="font-size:12px;font-weight:700;color:${wasteColor}">${pct}% used &nbsp;·&nbsp; ${(layout.waste*100).toFixed(0)}% waste</span>
      </div>
      <table class="cutsheet-table">
        <thead>
          <tr>
            <th style="width:28px">#</th>
            <th>Label</th>
            <th style="width:80px;text-align:right">W (${u})</th>
            <th style="width:80px;text-align:right">H (${u})</th>
            <th style="width:48px;text-align:center">Grain</th>
            <th style="width:60px">Notes</th>
            <th style="width:32px;text-align:center">✓</th>
          </tr>
        </thead>
        <tbody>
          ${layout.placed.map(/** @param {any} p @param {number} i */ (p, i) => {
            const baseGrain = layout.sheet.grain || 'none';
            const cutW = p.rotated ? p.item.h : p.item.w;
            const cutH = p.rotated ? p.item.w : p.item.h;
            const grainDir = baseGrain === 'none' ? '—' : (p.rotated ? (baseGrain==='h'?'↕':'↔') : (baseGrain==='h'?'↔':'↕'));
            return `<tr>
              <td class="cutsheet-num">${i + 1}</td>
              <td><span class="color-dot" style="background:${p.item.color};margin-right:6px;display:inline-block;vertical-align:middle"></span>${p.item.label}</td>
              <td class="cutsheet-dim">${formatDim(cutW)}</td>
              <td class="cutsheet-dim">${formatDim(cutH)}</td>
              <td style="text-align:center;font-size:15px;color:var(--muted)">${grainDir}</td>
              <td>${p.rotated ? '<span class="badge badge-orange" style="font-size:9px">rotated</span>' : ''}</td>
              <td style="text-align:center"><span class="cut-checkbox" onclick="this.classList.toggle(\'checked\')"></span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  });

  if (results.unplaced.length) {
    html += `<div class="cutsheet-sheet" style="border-color:var(--danger)">
      <div class="cutsheet-header" style="background:rgba(239,68,68,0.08)">
        <span class="cutsheet-title" style="color:var(--danger)">⚠ Unplaced Pieces (${results.unplaced.length})</span>
        <span class="cutsheet-sub" style="color:var(--danger)">Add more sheets to fit these</span>
      </div>
      <table class="cutsheet-table">
        <thead><tr><th>Label</th><th style="text-align:right">W (${u})</th><th style="text-align:right">H (${u})</th></tr></thead>
        /** @param {any} p */
        <tbody>${results.unplaced.map(/** @param {any} p */ (p) =>`<tr><td>${p.label}</td><td class="cutsheet-dim">${formatDim(p.w)}</td><td class="cutsheet-dim">${formatDim(p.h)}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  area.innerHTML = html;
}

// ── Main content tabs (Cut Layout / Project Cut Lists / Cabinet Library) ──
/** @param {string} view */
function switchCLMainView(view) {
  _clMainView = view;
  _persistCutlistCtx();
  const layout   = _byId('cl-view-layout');
  const cutlists = _byId('cl-view-cutlists');
  const library  = _byId('cl-view-library');
  if (layout)   layout.style.display   = view === 'layout'   ? 'flex' : 'none';
  if (cutlists) cutlists.style.display = view === 'cutlists' ? ''     : 'none';
  if (library)  library.style.display  = view === 'library'  ? ''     : 'none';
  /** @param {string} id @param {boolean} active */
  const setTab = (id, active) => {
    const el = _byId(id);
    if (!el) return;
    el.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
    el.style.fontWeight        = active ? '700' : '500';
    el.style.color             = active ? 'var(--text)' : 'var(--muted)';
  };
  setTab('cl-tab-layout',   view === 'layout');
  setTab('cl-tab-cutlists', view === 'cutlists');
  setTab('cl-tab-library',  view === 'library');
  // Reflect the current scope in the middle tab label: "Cabinet" when a
  // cabinet is open, otherwise the default "Project".
  const cutlistsTab = _byId('cl-tab-cutlists');
  if (cutlistsTab) cutlistsTab.textContent = _clCurrentCabinetId ? 'Cabinet' : 'Project';
  if (view === 'cutlists') renderCLCutListsView();
  else if (view === 'library') renderCLCutListLibraryView();
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

async function renderCLCutListsView() {
  const host = _byId('cl-view-cutlists');
  if (!host) return;
  // Content header — cabinet icon + cabinet name when in a linked cabinet,
  // otherwise project icon + project name (with client suffix when known).
  let headerHtml = '';
  if (_clCurrentCabinetId) {
    headerHtml = _renderContentHeader({ iconSvg: _CH_ICON_CABINET, title: _clCurrentCabinetName || 'Cabinet' });
  } else if (_clCurrentProjectId) {
    const proj = (typeof projects !== 'undefined' ? projects : []).find(/** @param {any} p */ p => p.id === _clCurrentProjectId);
    const cName = (proj && proj.client_id) ? (clients.find(/** @param {any} c */ c => c.id === proj.client_id)?.name || '') : '';
    headerHtml = _renderContentHeader({ iconSvg: _CH_ICON_PROJECT, title: _clCurrentProjectName || 'Project', clientName: cName || undefined });
  }
  host.innerHTML = `
    ${headerHtml}
    <div style="display:flex;gap:6px;justify-content:flex-end;margin-bottom:12px">
      <button class="btn btn-outline" onclick="triggerImportCSV('pieces')" style="font-size:12px;padding:8px 12px;width:auto" title="Import parts from CSV">↑ Import</button>
      <button class="btn btn-outline" onclick="exportCSV('pieces')" style="font-size:12px;padding:8px 12px;width:auto" title="Export parts to CSV">↓ Export</button>
    </div>
    <div id="cl-cutlists-grid" style="display:flex;flex-direction:column;gap:8px">
      <div style="font-size:12px;color:var(--muted);text-align:center;padding:20px">Loading…</div>
    </div>`;

  if (typeof _userId === 'undefined' || !_userId) {
    /** @type {HTMLElement} */ (_byId('cl-cutlists-grid')).innerHTML = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px">Sign in to see your saved cut lists.</div>`;
    return;
  }
  if (!_clCurrentProjectId && !_clCurrentCabinetId) {
    const allProjects = /** @type {any[]} */ (typeof projects !== 'undefined' && projects ? projects : []);
    const grid = /** @type {HTMLElement} */ (_byId('cl-cutlists-grid'));
    if (!allProjects.length) {
      grid.innerHTML = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px;border:1px dashed var(--border);border-radius:var(--radius)">No projects yet. Create one in the <strong>Projects</strong> section to get started.</div>`;
      return;
    }
    /** @type {Record<number, number>} */ const cutlistCounts = {};
    try {
      const pids = allProjects.map(/** @param {any} p */ p => p.id);
      const { data: cls } = await _db('cutlists').select('project_id').in('project_id', pids);
      for (const r of (cls || [])) {
        const pid = /** @type {any} */ (r).project_id;
        if (pid != null) cutlistCounts[pid] = (cutlistCounts[pid] || 0) + 1;
      }
    } catch (e) { /* leave empty */ }
    grid.innerHTML = allProjects.map(/** @param {any} p */ p => {
      const cName = p.client_id ? ((typeof clients !== 'undefined' && clients ? clients : []).find(/** @param {any} c */ c => c.id === p.client_id)?.name || '') : '';
      const n = cutlistCounts[p.id] || 0;
      return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);transition:box-shadow .15s,border-color .15s;cursor:pointer;padding:12px 14px"
        onmouseover="this.style.boxShadow='var(--shadow-md)';this.style.borderColor='var(--accent)'"
        onmouseout="this.style.boxShadow='var(--shadow)';this.style.borderColor='var(--border)'"
        onclick="loadProject(${p.id})">
        <div style="font-size:13px;font-weight:700;color:var(--text)">${_escHtml(p.name || '(untitled)')}${cName ? ` · ${_escHtml(cName)}` : ''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${n} cut list${n === 1 ? '' : 's'}</div>
      </div>`;
    }).join('');
    return;
  }

  // Branch on scope: cabinet (project_id IS NULL + join-table link) vs project.
  const isCabinet = !!_clCurrentCabinetId;
  const query = isCabinet
    ? _db('cutlists')
        .select('id, name, position, project_id, updated_at, cutlist_cabinets!inner(cabinet_id)')
        .is('project_id', null)
        .eq(/** @type {any} */ ('cutlist_cabinets.cabinet_id'), _clCurrentCabinetId)
        .order('updated_at', { ascending: false })
    : _db('cutlists')
        .select('id, name, position, project_id, updated_at')
        .eq('project_id', _clCurrentProjectId)
        .order('updated_at', { ascending: false });
  const { data: rows, error } = await query;
  if (error) {
    /** @type {HTMLElement} */ (_byId('cl-cutlists-grid')).innerHTML = `<div style="font-size:13px;color:var(--danger);text-align:center;padding:30px">Failed to load: ${_escHtml(error.message)}</div>`;
    return;
  }
  const list = rows || [];
  const grid = _byId('cl-cutlists-grid');
  if (!grid) return;
  if (!list.length) {
    const scopeLabel = isCabinet ? _clCurrentCabinetName : _clCurrentProjectName;
    const emptyMsg = isCabinet
      ? `No cut lists linked to <strong>${_escHtml(scopeLabel)}</strong> yet. Type a name in the sidebar and click <strong>+</strong> to create one.`
      : `No cut lists in <strong>${_escHtml(scopeLabel)}</strong> yet. Add parts in the sidebar — they autosave.`;
    grid.innerHTML = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px;border:1px dashed var(--border);border-radius:var(--radius)">${emptyMsg}</div>`;
    return;
  }

  // Fetch piece counts per cutlist (best-effort; render placeholder if it fails).
  const ids = list.map(/** @param {any} r */ r => r.id);
  /** @type {Record<number, number>} */
  const counts = {};
  try {
    const { data: pcs } = await _db('pieces').select('cutlist_id').in('cutlist_id', ids);
    for (const p of (pcs || [])) {
      const cid = /** @type {any} */ (p).cutlist_id;
      if (cid != null) counts[cid] = (counts[cid] || 0) + 1;
    }
  } catch (e) { /* counts stay empty */ }

  const cardClickFn = isCabinet ? '_clDoOpenLibraryCutlist' : '_clLoadCutlist';
  grid.innerHTML = list.map(/** @param {any} r */ (r) => {
    const isActive = r.id === _clCurrentCutlistId;
    const partCount = counts[r.id] != null ? counts[r.id] : '–';
    const date = _clFormatDate(r.updated_at);
    return `<div style="background:var(--surface);border:1px solid ${isActive ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);box-shadow:var(--shadow);transition:box-shadow .15s,border-color .15s;cursor:pointer"
      onmouseover="this.style.boxShadow='var(--shadow-md)';this.style.borderColor='var(--accent)'"
      onmouseout="this.style.boxShadow='var(--shadow)';this.style.borderColor='${isActive ? 'var(--accent)' : 'var(--border)'}'"
      onclick="${cardClickFn}(${r.id})">
      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px 6px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${_escHtml(r.name||'(untitled)')}${isActive ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">
            <span>${partCount} part${partCount === 1 ? '' : 's'}</span>
            ${date ? ` · <span>${_escHtml(date)}</span>` : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:6px;padding:8px 12px 10px;border-top:1px solid var(--border2);justify-content:flex-end">
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto" onclick="event.stopPropagation();_clRenameCutlist(${r.id})">Rename</button>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto" onclick="event.stopPropagation();_clDuplicateCutlist(${r.id})">Duplicate</button>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto;color:var(--danger)" onclick="event.stopPropagation();_clDeleteCutlist(${r.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}
/** @type {any} */ (window).renderCLCutListsView = renderCLCutListsView;

/** Render the Cut List Library tab — project-less cutlists from the
 *  cutlists table where project_id IS NULL. Each row has Open / Link to
 *  Cabinet / Duplicate / Delete actions. */
async function renderCLCutListLibraryView() {
  const host = _byId('cl-view-library');
  if (!host) return;
  const filterEl = /** @type {HTMLInputElement|null} */ (_byId('cl-lib-filter'));
  const q = (filterEl && filterEl.value) ? filterEl.value.trim().toLowerCase() : '';

  host.innerHTML = `
    ${_renderContentHeader({ iconSvg: _CH_ICON_CUTLIST, title: 'Cut List Library' })}
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px">
      <input type="text" id="cl-lib-filter" placeholder="Filter by name..." value="${_escHtml(q)}" oninput="renderCLCutListLibraryView()" style="font-size:12px;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;margin-left:auto">
    </div>
    <div id="cl-lib-grid" style="display:flex;flex-direction:column;gap:8px">
      <div style="font-size:12px;color:var(--muted);text-align:center;padding:20px">Loading…</div>
    </div>`;

  if (typeof _userId === 'undefined' || !_userId) {
    /** @type {HTMLElement} */ (_byId('cl-lib-grid')).innerHTML = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px">Sign in to see your library cut lists.</div>`;
    return;
  }

  /** @type {any[]} */ let rows = [];
  try {
    const { data } = await _db('cutlists')
      .select('id, name, updated_at, cutlist_cabinets(cabinet_id, cabinet_templates(name))')
      .is('project_id', null)
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
            <span class="proj-act-label">Cabinet</span>
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

/** @param {number} id */
async function _clDoOpenLibraryCutlist(id) {
  try {
    const { data: cl } = await _db('cutlists').select('*').eq('id', id).single();
    if (!cl) { _toast('Cut list not found', 'error'); return; }
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
  } catch (e) {
    _toast('Failed to load cut list', 'error');
  }
}

/** Insert a new library cutlist row (no project) and copy the in-memory
 *  pieces/sheets/edge_bands into it. Switches to the Cut List Library tab. */
async function _clAddToCutlistLibrary() {
  if (!_userId) { _toast('Sign in to save', 'error'); return; }
  const name = (_clCurrentCutlistName || '').trim() || await _clNextCutlistName(null);
  try {
    const { data, error } = await _db('cutlists').insert(/** @type {any} */ ({
      user_id: _userId,
      project_id: null,
      name,
      position: 0,
      ui_prefs: {}
    })).select().single();
    if (error || !data) { _toast('Could not save to library', 'error'); return; }
    const newId = /** @type {any} */ (data).id;
    // Copy pieces/sheets/edge_bands.
    if (pieces.length) {
      const rows = pieces.map((p, i) => /** @type {any} */ ({
        user_id: _userId, project_id: null, cutlist_id: newId, label: p.label || '',
        w_mm: p.w, h_mm: p.h, qty: p.qty || 1, grain: p.grain || 'none',
        material: p.material || '', notes: p.notes || '', enabled: p.enabled !== false,
        color: p.color, position: i
      }));
      await _db('pieces').insert(rows);
    }
    if (sheets.length) {
      const rows = sheets.map((s, i) => /** @type {any} */ ({
        user_id: _userId, project_id: null, cutlist_id: newId, name: s.name || 'Sheet',
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
      if (!_userId) { _toast('Sign in to link', 'error'); return; }
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
    const { data: src } = await _db('cutlists').select('*').eq('id', id).single();
    if (!src) return;
    const newName = (/** @type {any} */ (src).name || 'Cutlist') + ' (copy)';
    const { data: ins, error } = await _db('cutlists').insert(/** @type {any} */ ({
      user_id: _userId, project_id: null, name: newName, position: 0, ui_prefs: {}
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

