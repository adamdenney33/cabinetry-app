// ProCabinet — Cut list tables + library view (carved out of src/cutlist.js,
// R.2 split). Sheet/piece table CRUD + renderers, multi-row selection,
// drag-reorder, qty steppers, grain/enable toggles, keyboard navigation,
// spreadsheet paste, CSV import/export/template, and the Cut List Library
// view (open / rename / duplicate / delete / link-to-cabinet).
//
// Declares the row-selection state (_lastToggleIdx, _clSelectedIds,
// _clSelectionAnchorId) — the rest of the shared cut-list state (sheets,
// pieces, results, edgeBands, _clCurrent* ids, _clDirty) stays in
// src/cutlist.js. Two top-level listener registrations (click-outside
// selection clear IIFE; document paste handler) run at script evaluation but
// resolve everything lazily at event time. app.js's INIT block calls
// addSheet / addPiece / renderSheets / renderPieces at script-evaluation
// time, so this file must load before src/app.js.
//
// Cross-file dependencies (runtime, resolved through the global env):
//   - _toast / _confirm / _byId / _closePopup / _csvParse / _csvCol (src/ui.js)
//   - _escHtml (src/cabinet.js); cabinets (src/cabinet-library.js)
//   - _db / _userId (src/db.js); _realCount / _enforceFreeLimit (src/limits.js)
//   - parseDim / formatDim (src/units.js); window.units (src/settings.js)
//   - _ebIcon / hasAnyEdge (src/cutlist-edge.js)
//   - optimize (src/cutlist-layout.js); switchSection (src/settings.js)
//   - shared state + helpers from src/cutlist.js: sheets, pieces, edgeBands,
//     colsVisible, COLORS, GRAIN_ICONS, DEL_SVG, grainIcon, _trimmedDims,
//     parseVal, _saveCutList, _setClDirty, _clScheduleAutosave,
//     _clConfirmDiscardIfDirty, _clRenderContext, _clCurrent* ids
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

