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
//   - calcCQLine / cqSettings (src/cabinet.js — for line-pricing
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
let colsVisible = { grain: false, material: false, label: true, notes: false, edgeband: false };
/** @type {any[]} */
let edgeBands = [];
let _edgeBandId = 1;
let layoutRotate = false;
let clShowSummary = localStorage.getItem('pc_show_summary') === '1';
let clShowCutList = clShowSummary;  // cut list is part of the Summary tile
let _dragSrc = null, _dragTable = null;

const COLORS = [
  '#4a90d9','#d4763b','#4caf50','#9c27b0','#e53935',
  '#00acc1','#f9a825','#7cb342','#5c6bc0','#e91e63',
  '#00897b','#f57c00','#6d4c41','#546e7a','#7b1fa2',
  '#1e88e5','#43a047','#fdd835','#8e24aa','#039be5',
];

// ── GRAIN ICONS ──
const GRAIN_ICONS = {
  // none: faint equal lines — no constraint
  'none': `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.25"><line x1="1" y1="2.5" x2="13" y2="2.5"/><line x1="1" y1="6" x2="13" y2="6"/><line x1="1" y1="9.5" x2="13" y2="9.5"/></svg>`,
  // h: horizontal lines — grain runs the length of the board
  'h':    `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="0" y1="2.5" x2="14" y2="2.5"/><line x1="0" y1="6" x2="14" y2="6"/><line x1="0" y1="9.5" x2="14" y2="9.5"/></svg>`,
  // v: vertical lines — cross grain
  'v':    `<svg width="14" height="12" viewBox="0 0 14 12" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="2" y1="0" x2="2" y2="12"/><line x1="5.5" y1="0" x2="5.5" y2="12"/><line x1="9" y1="0" x2="9" y2="12"/><line x1="12.5" y1="0" x2="12.5" y2="12"/></svg>`,
};
const EYE_ON  = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const DEL_SVG = `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/></svg>`;

function grainIcon(g) { return GRAIN_ICONS[g] || GRAIN_ICONS['none']; }

function _trimmedDims(p) {
  const e = p.edges || {};
  const thk = side => {
    const s = e[side];
    if (!s || !s.trim) return 0;
    const mat = edgeBands.find(x => x.id === s.id);
    return mat ? (mat.thickness || 0) : 0;
  };
  return { w: p.w - thk('W2') - thk('W4'), h: p.h - thk('L1') - thk('L3') };
}

// ── VALUE PARSER (fractions + math) ──
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
function cycleGrain(id, type) {
  const arr = type === 'sheet' ? sheets : pieces;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  item.grain = item.grain === 'none' ? 'h' : item.grain === 'h' ? 'v' : 'none';
  type === 'sheet' ? renderSheets() : renderPieces();
  if (results) optimize();
}

// ── TOGGLE ENABLE ──
function toggleSheet(id) {
  const s = sheets.find(x => x.id === id);
  if (s) { s.enabled = s.enabled === false ? true : false; renderSheets(); }
}
let _lastToggleIdx = -1;
function _clCheckboxClick(id, idx, checked, ev) {
  if (ev && ev.shiftKey && _lastToggleIdx >= 0) {
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
function togglePiece(id) {
  const p = pieces.find(x => x.id === id);
  if (p) { p.enabled = !(p.enabled !== false); renderPieces(); _saveCutList(); }
}
function _clToggleAll(checked) {
  pieces.forEach(p => p.enabled = checked);
  renderPieces();
}

// ── STEP QTY ──
function stepQty(type, id, delta) {
  const arr = type === 'sheet' ? sheets : pieces;
  const item = arr.find(x => x.id === id);
  if (!item) return;
  const max = type === 'sheet' ? 99 : 999;
  item.qty = Math.max(1, Math.min(max, (item.qty || 1) + delta));
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
}
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
}

function hasAnyEdge(p) {
  const e = p.edges || {};
  return !!(e.L1 || e.W2 || e.L3 || e.W4);
}

function _ebIcon(p) {
  const e = p.edges || {};
  const c = side => {
    const s = e[side];
    if (!s) return null;
    const mat = edgeBands.find(x => x.id === s.id);
    return mat ? mat.color : null;
  };
  const seg = (x1,y1,x2,y2,col) => col
    ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="2.5" stroke-linecap="round"/>`
    : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.25"/>`;
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
    <td></td>
    <td></td>
    <td>
      <div class="cl-stepper">
        <button class="cl-step-btn" onclick="stepEbLength(${eb.id},-10)">−</button>
        <input class="cl-input cl-qty-input" value="${(eb.length||0)}" inputmode="decimal"
          style="border:0;background:transparent;box-shadow:none"
          onblur="updateEbLength(${eb.id},this.value)"
          onkeydown="if(event.key==='Enter')this.blur()">
        <button class="cl-step-btn" onclick="stepEbLength(${eb.id},10)">+</button>
      </div>
    </td>
    <td class="cl-col-grain" style="${colsVisible.grain?'':'display:none'}"></td>
    <td style="text-align:center">
      <input class="cl-input cl-dim-input" value="${eb.thickness||''}" inputmode="decimal"
        style="width:32px;text-align:center;padding:2px 2px;border:0;background:transparent;box-shadow:none"
        onblur="updateEdgeBand(${eb.id},'thickness',parseFloat(this.value)||0)"
        onkeydown="if(event.key==='Enter')this.blur()"
        placeholder="0">
    </td>
    <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}"></td>
    <td class="cl-col-notes" style="${colsVisible.notes?'':'display:none'}"></td>
    <td class="cl-del-cell" style="padding:2px 4px;text-align:right">
      <button class="cl-del-btn" onclick="removeEdgeBand(${eb.id})" title="Remove">${DEL_SVG}</button>
    </td>
  </tr>`).join('');
}

function stepEbLength(id, delta) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb.length = Math.max(0, (eb.length || 0) + delta);
  renderEdgeBands();
  _saveCutList();
}

function updateEbLength(id, text) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb.length = Math.max(0, parseFloat(text) || 0);
  renderEdgeBands();
  _saveCutList();
}

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

function updateEdgeBand(id, field, val) {
  const eb = edgeBands.find(x => x.id === id);
  if (!eb) return;
  eb[field] = val;
  renderEdgeBands();
  renderPieces();
  _saveCutList();
}

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
  let rw, rh;
  if (aspect >= 1) { rw = maxW; rh = Math.round(maxW / aspect); }
  else { rh = maxH; rw = Math.round(maxH * aspect); }
  const svgW = rw + svgPad*2, svgH = rh + svgPad*2;
  const rx = svgPad, ry = svgPad;
  const pColor = toPastel ? toPastel(p.color) : '#e8f0fe';

  function buildSVG(ed) {
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
    const fmtDim = (cut, fin, lbl) => {
      const trimmed = cut !== fin;
      const numColor = trimmed ? accent : '#888';
      const numWeight = trimmed ? '700' : '400';
      return `<tspan fill="${numColor}" font-weight="${numWeight}">${cut}</tspan><tspan fill="#aaa"> [${lbl}]</tspan>`;
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

  function buildTable(ed) {
    const thk = side => {
      const s = ed[side];
      if (!s || !s.trim) return 0;
      const mat = edgeBands.find(x => x.id === s.id);
      return mat ? (mat.thickness || 0) : 0;
    };
    const cutW = p.w - thk('W2') - thk('W4');
    const cutH = p.h - thk('L1') - thk('L3');
    const tapeDim = {L1:cutW, W2:cutH, L3:cutW, W4:cutH};
    const finDim  = {L1:p.w,  W2:p.h,  L3:p.w,  W4:p.h};
    const accent2 = '#c9962b';

    const ebOpts = `<option value="">— None —</option>` + edgeBands.map(eb =>
      `<option value="${eb.id}">${_escHtml(eb.name)}</option>`
    ).join('');

    return ['L1','W2','L3','W4'].map(side => {
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

function _ebUpdateTrim(side, checked, pieceId) {
  const d = window._ebDraft;
  if (!d || !d[side]) return;
  d[side].trim = checked;
  const sw = _byId('_eb_svg_wrap');
  if (sw && window._ebBuildSVG) sw.innerHTML = window._ebBuildSVG(d);
  const tb = _byId('_eb_tbody');
  if (tb && window._ebBuildTable) tb.innerHTML = window._ebBuildTable(d);
}

function _ebSave(pieceId) {
  const p = pieces.find(x => x.id === pieceId);
  if (!p || !window._ebDraft) return;
  p.edges = { ...window._ebDraft };
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

function _clSaveProject() {
  // If there's a live project already loaded, save silently
  // Otherwise open the save dialog
  const liveId = window._currentProjectId || null;
  if (liveId) {
    // save silently
    if (window.saveCurrentProject) window.saveCurrentProject();
    else _toast('Project saved', 'success');
  } else {
    _openSaveProjectPopup();
  }
}

function _openSaveProjectPopup() {
  const defaultName = pieces.length > 0 ? (pieces[0].label.split(' ')[0] + ' Build') : '';
  const h = `
    <div class="popup-header">
      <div class="popup-title">Save Project</div>
      <div class="popup-close" onclick="_closePopup()">×</div>
    </div>
    <div class="popup-body">
      <div class="pf">
        <label>Project Name</label>
        <input type="text" id="save-proj-name" class="form-control" placeholder="e.g. Kitchen Cabinet Build" value="${_escHtml(defaultName)}">
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
      <button class="btn btn-primary" onclick="_doSaveProject()">Save Project</button>
    </div>`;
  _openPopup(h, 'sm');
  setTimeout(() => _byId('save-proj-name')?.focus(), 50);
}

function _doSaveProject() {
  const name = (_popupVal('save-proj-name') || '').trim();
  if (!name) { _toast('Please enter a project name', 'error'); return; }
  _closePopup();
  _toast(`Project "${name}" saved`, 'success');
}

// ── DRAG REORDER ──
function onDragStart(e, table, idx) {
  _dragSrc = idx; _dragTable = table;
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(e, row) {
  e.preventDefault();
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  row.classList.add('cl-drag-over');
}
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
  _confirm('Clear all parts and panels? This cannot be undone.', () => _doClearAll()); return;
}
function _doClearAll() {
  pieces = []; sheets = []; _pieceId = 1; _sheetId = 1; pieceColorIdx = 0; results = null;
  ['pc_cl_pieces','pc_cl_sheets','pc_cl_pid','pc_cl_sid','pc_cl_colorIdx','pc_cl_sheetColorIdx'].forEach(k => localStorage.removeItem(k));
  renderPieces(); renderSheets();
  /** @type {HTMLElement} */ (_byId('results-area')).innerHTML = '<div class="empty-state"><div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></div><h3>Ready to Optimize</h3><p>Add stock panels and cut pieces, then click "Optimize Cut Layout"</p></div>';
}

// ── PANEL RESIZE ──
(function() {
  document.addEventListener('DOMContentLoaded', () => {});
  const init = () => {
    const handle = _byId('cl-resize-handle');
    const left   = /** @type {HTMLElement | null} */ (document.querySelector('.cl-left'));
    if (!handle || !left) return;
    let dragging = false, startX, startW;
    handle.addEventListener('mousedown', e => {
      dragging = true; startX = e.clientX; startW = left.offsetWidth;
      handle.classList.add('dragging');
      document.body.style.cssText += 'cursor:col-resize!important;user-select:none';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      left.style.width = Math.max(260, Math.min(680, startW + e.clientX - startX)) + 'px';
    });
    document.addEventListener('mouseup', () => {
      dragging = false; handle.classList.remove('dragging');
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ── SHEETS ──
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

function duplicateSheet(id) {
  const s = sheets.find(s => s.id === id);
  if (!s) return;
  const idx = sheets.indexOf(s);
  const copy = { ...s, id: _sheetId++, name: s.name + ' (copy)', color: COLORS[pieceColorIdx++ % COLORS.length] };
  sheets.splice(idx + 1, 0, copy);
  renderSheets();
  renderPieces();
}

function updateSheet(id, field, val) {
  const s = sheets.find(s => s.id === id);
  if (!s) return;
  if (field === 'w' || field === 'h') { const v = parseVal(val); s[field] = v; }
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
    tbody.innerHTML = `<tr><td colspan="12" style="color:var(--muted);font-size:11px;padding:10px 14px;text-align:center">No panels — click "+ Add panel"</td></tr>`;
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
      <td><input class="cl-input cl-dim-input" value="${s.w}"
        data-table="sheets" data-row="${i}" data-col="w"
        onblur="updateSheet(${s.id},'w',this.value)"
        onkeydown="clKeydown(event,'sheets',${i},'w')"
        ${dis ? 'disabled' : ''}></td>
      <td><input class="cl-input cl-dim-input" value="${s.h}"
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
      <td class="cl-grain-cell cl-col-grain" style="${colsVisible.grain?'':'display:none'}">
        <button class="cl-grain-btn${s.grain !== 'none' ? ' active' : ''}"
          onclick="cycleGrain(${s.id},'sheet')" title="Grain: ${s.grain}">${grainIcon(s.grain)}</button>
      </td>
      <td style="padding:0 4px;text-align:center">
        <input class="cl-input cl-dim-input" value="${s.kerf ?? (window.units==='metric'?3:0.125)}"
          style="width:32px;text-align:center;padding:2px 2px;border:0;background:transparent;box-shadow:none" inputmode="decimal"
          onblur="updateSheet(${s.id},'kerf',parseFloat(this.value)||0)"
          onkeydown="if(event.key==='Enter')this.blur()"
          ${dis ? 'disabled' : ''} placeholder="0">
      </td>
      <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}"></td>
      <td class="cl-col-notes" style="${colsVisible.notes?'':'display:none'}"></td>
      <td class="cl-del-cell" style="white-space:nowrap">
        <button class="cl-del-btn" onclick="duplicateSheet(${s.id})" title="Duplicate sheet" style="opacity:.6;margin-right:2px">⧉</button>
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
    // Sync grain data with column visibility — clear stale grain values if column is hidden
    if (!colsVisible.grain) {
      pieces.forEach(p => { p.grain = 'none'; });
      sheets.forEach(s => { s.grain = 'none'; });
    }
  } catch(e) {}
}

// ── PIECES ──
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
    grain:    (grain !== undefined && grain !== false) ? grain : 'none',
    material: prevMat,
    notes:    '',
    enabled:  true,
    color,
    edges:    {L1:null,W2:null,L3:null,W4:null},
  });
  renderPieces();
}

function removePiece(id) {
  const p = pieces.find(x => x.id === id);
  if (!p) return;
  _confirm(`Delete part <strong>${_escHtml(p.label || 'Untitled')}</strong>?`, () => {
    pieces = pieces.filter(x => x.id !== id);
    renderPieces();
    _saveCutList();
  });
}

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

function updatePiece(id, field, val) {
  const p = pieces.find(p => p.id === id);
  if (!p) return;
  if (field === 'w' || field === 'h') { const v = parseVal(val); p[field] = v; }
  else if (field === 'qty') p[field] = Math.max(1, parseInt(val) || 1);
  else p[field] = val;
  renderPieces();
}

function renderPieces() {
  const tbody = _byId('pieces-body');
  if (!tbody) return;
  if (!pieces.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="color:var(--muted);font-size:11px;padding:10px 14px;text-align:center">No parts — click "+ Add part"</td></tr>`;
    return;
  }
  const makeOpts = (sel) => {
    let o = `<option value="">— any —</option>`;
    sheets.forEach(s => { o += `<option value="${s.name.replace(/"/g,'&quot;')}"${s.name===sel?' selected':''}>${s.name}</option>`; });
    return o;
  };
  tbody.innerHTML = pieces.map((p, i) => {
    const dis = p.enabled === false;
    return `<tr class="${dis ? 'cl-row-disabled' : ''}"
      draggable="true"
      ondragstart="onDragStart(event,'pieces',${i})"
      ondragover="onDragOver(event,this)"
      ondrop="onDrop(event,'pieces',${i})"
      ondragend="onDragEnd()">
      <td style="padding:0 2px;width:14px">
        <span class="cl-drag-handle" title="Drag to reorder">${DRAG_HANDLE}</span>
      </td>
      <td class="cl-del-cell">
        <button class="cl-toggle-btn" tabindex="-1" onclick="togglePiece(${p.id})" title="${dis ? 'Enable' : 'Disable'}"
          style="background:none;border:none;padding:2px;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;width:22px;height:22px">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${dis?'var(--muted)':p.color};flex-shrink:0"></span>
        </button>
      </td>
      <td class="cl-col-label" style="${colsVisible.label?'':'display:none'}">
        <input class="cl-input" value="${p.label.replace(/"/g,'&quot;')}"
          data-table="pieces" data-row="${i}" data-col="label"
          onblur="updatePiece(${p.id},'label',this.value)"
          onkeydown="clKeydown(event,'pieces',${i},'label')"
          ${dis ? 'disabled' : ''} placeholder="Label">
      </td>
      <td><input class="cl-input cl-dim-input" value="${p.w}"
        data-table="pieces" data-row="${i}" data-col="w"
        onblur="updatePiece(${p.id},'w',this.value)"
        onkeydown="clKeydown(event,'pieces',${i},'w')"
        ${dis ? 'disabled' : ''}></td>
      <td><input class="cl-input cl-dim-input" value="${p.h}"
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
      <td class="cl-grain-cell cl-col-grain" style="${colsVisible.grain?'':'display:none'}">
        <button class="cl-grain-btn${p.grain !== 'none' ? ' active' : ''}" tabindex="-1"
          onclick="cycleGrain(${p.id},'piece')" title="Grain: ${p.grain}">${grainIcon(p.grain)}</button>
      </td>
      <td class="cl-col-edgeband" style="${colsVisible.edgeband?'':'display:none'}">
        <button class="cl-grain-btn${hasAnyEdge(p) ? ' active' : ''}" tabindex="-1" onclick="openEdgePopup(${p.id})" title="Edge banding">${_ebIcon(p)}</button>
      </td>
      <td></td>
      <td class="cl-col-material" style="${colsVisible.material?'':'display:none'}">
        <select class="cl-input" tabindex="-1" style="font-size:11px;padding:3px 4px;border-radius:3px"
          onchange="updatePiece(${p.id},'material',this.value)" ${dis ? 'disabled' : ''}>
          ${makeOpts(p.material)}
        </select>
      </td>
      <td class="cl-del-cell" style="white-space:nowrap;display:flex;align-items:center;gap:2px">
        <input type="checkbox" class="cl-check" tabindex="-1" ${dis ? '' : 'checked'} onclick="_clCheckboxClick(${p.id},${i},this.checked,event)" title="Include in layout&#10;Shift+click to select range">
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
const CL_COLS = { pieces: ['label','w','h','qty'], sheets: ['name','w','h','qty'] };
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
  const curEl = event.target;
  if (curEl && 'value' in curEl) {
    const item = arr[rowIdx];
    if (item) {
      if (colName === 'w' || colName === 'h') item[colName] = parseVal(curEl.value);
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
function focusClCell(tableId, rowIdx, colName) {
  const el = /** @type {HTMLInputElement | null} */ (document.querySelector(`[data-table="${tableId}"][data-row="${rowIdx}"][data-col="${colName}"]`));
  if (el) { el.focus(); try { el.select(); } catch(e) {} }
}

// ── PASTE FROM SPREADSHEET ──
document.addEventListener('paste', function(e) {
  const target = /** @type {HTMLElement | null} */ (e.target);
  if (!target || !target.dataset || !target.dataset.table) return;
  const text = (e.clipboardData || window.clipboardData).getData('text');
  const rows = text.trim().split(/\r?\n/);
  if (rows.length <= 1 && !text.includes('\t')) return;
  e.preventDefault();
  const tableId = target.dataset.table;
  const rowIdx  = parseInt(target.dataset.row ?? '') || 0;
  const cols    = CL_COLS[tableId];
  const startCI = cols.indexOf(target.dataset.col ?? '');
  rows.forEach((row, ri) => {
    const cells = row.split('\t');
    const ai = rowIdx + ri;
    const arr = tableId === 'pieces' ? pieces : sheets;
    while (arr.length <= ai) tableId === 'pieces' ? addPiece() : addSheet();
    cells.forEach((cell, ci) => {
      const coli = startCI + ci;
      if (coli >= cols.length) return;
      const cn = cols[coli];
      const item = arr[ai];
      if (!item) return;
      if (cn === 'w' || cn === 'h') item[cn] = parseVal(cell.trim());
      else if (cn === 'qty') item[cn] = Math.max(1, parseInt(cell.trim()) || 1);
      else item[cn] = cell.trim();
    });
  });
  tableId === 'pieces' ? renderPieces() : renderSheets();
  setTimeout(() => focusClCell(tableId, rowIdx + rows.length - 1, cols[startCI]), 30);
});

// ── CSV ──
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
function downloadTemplate(type) {
  const csv = type === 'pieces'
    ? 'Label,W,H,Qty,Grain,Material\nSide Panel,23.25,30,2,none,3/4" Plywood'
    : 'Material,W,H,Qty,Grain\n3/4" Plywood,96,48,5,none';
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: type==='pieces'?'parts-template.csv':'panels-template.csv' });
  a.click();
}
function triggerImportCSV(type) {
  _csvImportTarget = type;
  const inp = _byId('csv-import-input');
  if (!inp) return;
  inp.value = ''; inp.click();
}
function handleCSVImport(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = /** @type {string} */ (/** @type {FileReader} */ (e.target).result);
    const lines = text.trim().split(/\r?\n/).slice(1);
    lines.forEach(line => {
      const c = line.split(',').map(x => x.trim().replace(/^"|"$/g,''));
      if (_csvImportTarget === 'pieces') addPiece(c[0]||`Part ${pieces.length+1}`, parseVal(c[1]), parseVal(c[2]), parseInt(c[3])||1, c[4]||'none');
      else addSheet(c[0]||'Sheet', parseVal(c[1]), parseVal(c[2]), parseInt(c[3])||1);
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
function adjustFontScale(d) { layoutFontScale = Math.max(0.5, Math.min(2.5, layoutFontScale + d)); localStorage.setItem('pc_font_scale', String(layoutFontScale)); renderResults(); }
function printLayout(mode='print') {
  if (!results || !results.layouts || !results.layouts.length) { _toast('Run the optimiser first', 'info'); return; }
  // Brief delay so canvases finish rendering before capture
  setTimeout(() => {
    const biz = getBizInfo();
    const u = window.units === 'metric' ? 'mm' : 'in';
    const cur = window.currency;
    const totalArea = results.layouts.reduce((s,l) => s + l.sheet.w * l.sheet.h, 0);
    const usedArea  = results.layouts.reduce((s,l) => s + l.placed.reduce((a,p) => a + p.w * p.h, 0), 0);
    const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0';
    const totalPieces = results.placed;
    const matCost = results.layouts.reduce((s,l) => { const si = stockItems.find(i => i.name === l.sheet.name); return s + (si ? si.cost : 0); }, 0);

    // Capture canvas images
    const canvases = /** @type {NodeListOf<HTMLCanvasElement>} */ (document.querySelectorAll('.canvas-wrap canvas'));
    const imgs = [...canvases].map(c => { try { return c.toDataURL('image/png'); } catch(e) { return ''; } });

    const sheetSections = results.layouts.map((layout, i) => {
      const util = (layout.util * 100).toFixed(0);
      const imgTag = imgs[i] ? `<img src="${imgs[i]}" class="sheet-img">` : '';
      const pieceRows = layout.placed.map(p => `
        <tr>
          <td style="width:16px"><div style="width:12px;height:12px;border-radius:2px;background:${p.item.color};opacity:.7"></div></td>
          <td><strong>${p.item.label}</strong></td>
          <td class="num">${p.item.w}</td>
          <td class="num">${p.item.h}</td>
          <td class="num">${p.rotated ? '↺ Yes' : '—'}</td>
          <td>${p.item.notes || ''}</td>
        </tr>`).join('');
      return `
      <div class="sheet-section">
        <div class="sheet-heading">
          <span class="sheet-title">Sheet ${i+1} &mdash; ${layout.sheet.name}</span>
          <span class="sheet-meta">${layout.sheet.w}&times;${layout.sheet.h}${u} &nbsp;&bull;&nbsp; ${layout.placed.length} piece${layout.placed.length!==1?'s':''} &nbsp;&bull;&nbsp; ${util}% used</span>
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
  /* A4 landscape — 10mm margins → 190mm usable height, 277mm usable width */
  @page { size: A4 landscape; margin: 10mm 10mm; }
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
      _buildCutListPDF({ biz, layouts: results.layouts, imgs, pieces, u, cur,
        totalPieces, avgUtil, matCost });
    } else {
      _printInFrame(html);
    }
  }, 400);
}

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
function _buildQuotePDF(q) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const cur = window.currency;
  const biz = getBizInfo();
  const logo = getBizLogo();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const matVal = q._totals ? q._totals.materials : (q.materials || 0);
  const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
  const sub = matVal + labVal;
  const markupAmt = sub * q.markup / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * q.tax / 100;
  const total = afterMarkup + taxAmt;
  const fmt = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
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

  // ── Cabinet Line Items (from notes) ──
  const noteLines = (q.notes||'').split(/\r?\n/).filter(Boolean);
  const cabLines = noteLines.filter(l => l.includes('\u2014') || l.includes('—'));
  const plainNotes = noteLines.filter(l => !l.includes('\u2014') && !l.includes('—')).join('\n').trim();

  if (cabLines.length > 0) {
    // Table header
    pdf.setFontSize(7); pdf.setFont('helvetica','bold'); pdf.setTextColor(140);
    pdf.text('DESCRIPTION', M, y); pdf.text('', PW-M, y, { align:'right' });
    y += 2;
    pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.line(M, y, PW-M, y);
    y += 6;

    cabLines.forEach(cl => {
      const parts = cl.split(/\u2014|—/).map(s => s.trim());
      const name = parts[0] || 'Cabinet';
      const details = parts.slice(1).join(' — ').trim();

      pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(name, M, y);
      y += 5;
      if (details) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(130);
        const detailLines = pdf.splitTextToSize(details, W - 10);
        detailLines.forEach(dl => { pdf.text(dl, M + 4, y); y += 4; });
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

  if (q.markup > 0 || q.tax > 0) {
    pdf.setFontSize(9); pdf.setFont('helvetica','normal'); pdf.setTextColor(140);
    pdf.text('Subtotal', labelX, y); pdf.text(fmt(sub), totalsX, y, { align:'right' });
    y += 6;
  }
  if (q.markup > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Markup (' + q.markup + '%)', labelX, y); pdf.text('+ ' + fmt(markupAmt), totalsX, y, { align:'right' });
    y += 5;
  }
  if (q.tax > 0) {
    pdf.setFontSize(8.5); pdf.setTextColor(140);
    pdf.text('Tax (' + q.tax + '%)', labelX, y); pdf.text('+ ' + fmt(taxAmt), totalsX, y, { align:'right' });
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
    noteWrapped.forEach(nl => { pdf.text(nl, M, y); y += 4.5; });
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
  const totalValue = stockItems.reduce((s,i) => s+i.qty*i.cost, 0);

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
    const isLow = item.qty <= item.low;
    const sup = _ssGet(item.id);
    pdf.setFontSize(9); pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.setTextColor(isLow ? 192 : 40, isLow ? 50 : 40, isLow ? 50 : 40);
    pdf.text(item.name.substring(0,22), cols[0], y);
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text((item.sku||'').substring(0,10), cols[1], y);
    pdf.text(item.w+'×'+item.h+u, cols[2], y);
    pdf.text((sup.supplier||'').substring(0,14), cols[3], y);
    pdf.setTextColor(isLow?192:40, isLow?50:40, isLow?50:40);
    pdf.setFont('helvetica', isLow?'bold':'normal');
    pdf.text(String(item.qty), cols[4], y);
    pdf.setTextColor(120); pdf.setFont('helvetica','normal');
    pdf.text(String(item.low), cols[5], y);
    pdf.text(cur + (item.qty*item.cost).toFixed(0), cols[6], y);
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

function _buildWorkOrderPDF(o) {
  if (!window.jspdf) { _toast('PDF library not loaded yet', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const biz = getBizInfo();
  const cur = window.currency;
  const fmt = v => cur + Math.round(v).toLocaleString();
  const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const statusLabel = { quote:'Quote Sent', confirmed:'Confirmed', production:'In Production', delivery:'Ready for Delivery', complete:'Complete' }[o.status] || o.status;

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
  const infoItems = [
    ['Client', orderClient(o)], ['Project', orderProject(o)],
    ['Order Value', fmt(o.value)], ['Status', statusLabel],
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
    noteLines.forEach(nl => { pdf.text(nl, M, y); y += 5; });
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

async function _buildCutListPDF({ biz, layouts, imgs, pieces, u, cur, totalPieces, avgUtil, matCost }) {
  if (!window.jspdf) { _toast('PDF library not loaded yet — try again', 'error'); return; }
  _toast('Building PDF\u2026', 'info', 8000);
  try {
    const { jsPDF } = window.jspdf;
    const PW = 297, PH = 210, M = 10;
    const W = PW - 2*M, H = PH - 2*M;  // 277 x 190 mm usable
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    // ── safe hex → [r,g,b] ──
    function hexRgb(hex) {
      if (!hex || hex.length < 7) return [180,180,180];
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

    // ── compact title bar drawn at top of each sheet page ──
    function titleBar() {
      const sub = [biz.phone, biz.email].filter(Boolean).join(' · ');
      pdf.setFontSize(9); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(biz.name || 'ProCabinet', M, M+5);
      if (sub) { pdf.setFontSize(7); pdf.setFont('helvetica','normal'); pdf.setTextColor(136); pdf.text(sub, M+pdf.getTextWidth(biz.name||'ProCabinet')+3, M+5); }
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(136);
      pdf.text('CUT LIST  ·  '+dateStr, PW-M, M+5, { align:'right' });
      pdf.setDrawColor(200); pdf.setLineWidth(0.25); pdf.line(M, M+7, PW-M, M+7);
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

    // ── one landscape page per sheet — sheets start on page 1 ──
    const leftW  = Math.floor(W * 2/3);   // ~184 mm (2/3)
    const gap    = 8;
    const rightX = M + leftW + gap;
    const rightW = W - leftW - gap;       // ~85 mm
    const hdgH   = 9;                     // heading bar height
    const titleBarH = 9;                  // compact title bar height

    layouts.forEach((layout, i) => {
      if (i > 0) pdf.addPage();           // first sheet on page 1, rest add pages
      titleBar();
      const util = (layout.util*100).toFixed(0);

      // sheet heading bar (sits below title bar)
      const sheetHdgY = M + titleBarH + 2;
      pdf.setFillColor(245,245,245); pdf.rect(M, sheetHdgY, W, hdgH, 'F');
      pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.rect(M, sheetHdgY, W, hdgH, 'S');
      pdf.setFontSize(9.5); pdf.setFont('helvetica','bold'); pdf.setTextColor(17);
      pdf.text(`Sheet ${i+1}  \u2014  ${layout.sheet.name}`, M+4, sheetHdgY+6);
      pdf.setFontSize(7.5); pdf.setFont('helvetica','normal'); pdf.setTextColor(110);
      pdf.text(`${layout.sheet.w}\u00d7${layout.sheet.h} ${u}    ${layout.placed.length} piece${layout.placed.length!==1?'s':''}    ${util}% used`, PW-M-2, sheetHdgY+6, { align:'right' });
      pdf.setTextColor(17);

      // panel image — left 2/3, aspect-correct
      if (imgs[i]) {
        const imgX = M+2, imgY = sheetHdgY + hdgH + 3;
        const maxW = leftW-4, maxH = PH-imgY-M-2;
        const aspect = layout.sheet.w / layout.sheet.h;
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
        head: [['', 'Label', `W (${u})`, `H (${u})`, 'Rot', 'Notes']],
        body: layout.placed.map(p => ['', p.item.label, p.item.w, p.item.h, p.rotated?'Y':'--', p.item.notes||'']),
        styles: { fontSize: 7.5, cellPadding: 1.8, overflow:'ellipsize', textColor:[17,17,17] },
        headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:6.5, lineWidth:0 },
        columnStyles: { 0:{cellWidth:5}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'center',cellWidth:7} },
        theme: 'plain',
        tableLineColor: [224,224,224], tableLineWidth: 0.2,
        didDrawCell(data) {
          if (data.column.index===0 && data.section==='body') {
            const p = layout.placed[data.row.index];
            if (p) { const [r,g,b]=hexRgb(p.item.color); pdf.setFillColor(r,g,b); pdf.roundedRect(data.cell.x+1,data.cell.y+1.5,3,3,0.5,0.5,'F'); }
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
          head: [['','Label',`W (${u})`,`H (${u})`,'Qty','Material','Grain','Notes']],
          body: pieces.map(p => ['',p.label,p.w,p.h,p.qty,p.material||'--',p.grain==='h'?'Horiz':p.grain==='v'?'Vert':'--',p.notes||'']),
          styles: { fontSize:8, cellPadding:2, overflow:'ellipsize', textColor:[17,17,17] },
          headStyles: { fillColor:[250,250,250], textColor:[140,140,140], fontStyle:'normal', fontSize:7, lineWidth:0 },
          columnStyles: { 0:{cellWidth:6}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right',cellWidth:10} },
          theme: 'plain', tableLineColor:[224,224,224], tableLineWidth:0.2,
          didDrawCell(data) {
            if (data.column.index===0 && data.section==='body') {
              const p = pieces[data.row.index];
              if (p) { const [r,g,b]=hexRgb(p.color); pdf.setFillColor(r,g,b); pdf.roundedRect(data.cell.x+1,data.cell.y+1.5,3,3,0.5,0.5,'F'); }
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
    _toast('PDF generation failed: '+err.message, 'error');
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
function setPagesPerSheet(n) {
  let s = /** @type {HTMLStyleElement | null} */ (document.getElementById('print-pages-style'));
  if (!s) { s = document.createElement('style'); s.id = 'print-pages-style'; document.head.appendChild(s); }
  n = parseInt(n);
  if (n === 2) s.textContent = `@media print{.canvas-wrap{display:inline-block;width:48%;margin:0 1% 2%;vertical-align:top}}`;
  else if (n === 4) s.textContent = `@media print{.canvas-wrap{display:inline-block;width:23%;margin:0 1% 2%;vertical-align:top}}`;
  else s.textContent = '';
}

// Recursive guillotine packer (multi-start best-fit).
// Options A+B: tournament over several starting orderings × best-short-side-fit
// pick at each region × shorter-axis-first split preference. Every layout is
// pure guillotine by construction — edge-to-edge cuts per region.
function packSheetRecGuillotine(sheetW, sheetH, sheetGrain, items, kerf) {
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
  const areaOf = (pcs) => pcs.reduce((s, p) => s + p.w * p.h, 0);
  const betterThan = (a, b) => {
    if (!b) return true;
    if (a.placed.length !== b.placed.length) return a.placed.length > b.placed.length;
    return areaOf(a.placed) > areaOf(b.placed);
  };

  // Inner packer: given a pre-sorted item list, recursively fill regions using
  // best-short-side-fit picks. Orderings is the tiebreak when multiple items
  // tie on BSSF score — earlier-in-list wins.
  function packOrdered(orderedItems) {
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
      const remaining = items.filter((_, i) => i !== pickIdx);

      // Branch on every fitting orientation × both guillotine splits.
      // Split A (row-first): RIGHT = (x0+w+k, y0, x1, y0+h), BELOW = (x0, y0+h+k, x1, y1)
      // Split B (col-first): BELOW = (x0, y0+h+k, x0+w, y1), RIGHT = (x0+w+k, y0, x1, y1)
      // SAS preference: when leftover RIGHT arm is narrower than BELOW arm, prefer
      // Split B (keep the wider BELOW arm intact); else Split A. Still try both —
      // this only affects tie-breaking when both pack the same # of pieces.
      let best = null;
      for (const o of orientOf(it)) {
        if (o.w > rw + 0.5 || o.h > rh + 0.5) continue;
        const placed0 = { x: x0, y: y0, w: o.w, h: o.h, item: it, rotated: o.rotated };
        const preferA = (rw - o.w) >= (rh - o.h);  // wider right arm → preserve it via split A

        const tryA = () => {
          const rA1 = packRegion(x0 + o.w + kerf, y0, x1, y0 + o.h, remaining);
          const rA2 = packRegion(x0, y0 + o.h + kerf, x1, y1, rA1.leftover);
          return { placed: [placed0, ...rA1.placed, ...rA2.placed], leftover: rA2.leftover };
        };
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
    const usedArea = placed.reduce((s, p) => s + p.w * p.h, 0);
    layouts.push({ sheet: si, placed, util: usedArea / (si.w * si.h), waste: 1 - usedArea / (si.w * si.h) });
    const placedKeys = new Set(placed.map(p => `${p.item.id}_${p.item._inst}`));
    remaining = remaining.filter(p => !placedKeys.has(`${p.id}_${p._inst}`));
  }
  results = { layouts, unplaced: remaining, total: activePieces.reduce((s,p) => s+p.qty, 0), placed: activePieces.reduce((s,p) => s+p.qty, 0) - remaining.length };
  if (!_userId) _incOptCount();
  activeSheetIdx = 0;
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
  renderLayout(area);  // inner tabs removed; layout view is the only view
}

function renderLayout(area) {
  if (!results.layouts.length) {
    area.innerHTML = '<div class="empty-state"><h3>No layouts generated</h3><p>Check that your pieces fit within your sheet dimensions.</p></div>';
    return;
  }
  const u = window.units === 'metric' ? 'mm' : 'in';
  const totalArea = results.layouts.reduce((s,l) => s + l.sheet.w * l.sheet.h, 0);
  const usedArea  = results.layouts.reduce((s,l) => s + l.placed.reduce((a,p) => a + p.w * p.h, 0), 0);
  const avgUtil   = totalArea ? (usedArea / totalArea * 100).toFixed(1) : '0.0';

  // Material cost estimate — match sheet name to stock items
  const matCost = results.layouts.reduce((s, l) => {
    const stock = stockItems.find(si => si.name === l.sheet.name);
    return s + (stock ? stock.cost : 0);
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
          <td style="text-align:right">${p.w}</td><td style="text-align:right">${p.h}</td>
          <td style="text-align:right">${p.qty}</td>
          <td>${p.material || '—'}</td>
          <td>${p.grain === 'h' ? 'Horiz' : p.grain === 'v' ? 'Vert' : '—'}</td>
          <td>${p.notes || '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
    area.appendChild(card);
  }

  // Sheets
  results.layouts.forEach((layout, i) => {
    const lbl = document.createElement('div');
    lbl.className = 'sheet-block-label';
    lbl.innerHTML = `<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${layout.sheet.color || 'var(--muted)'};margin-right:6px;vertical-align:middle"></span>Sheet ${i+1}</span><span style="font-weight:400;color:var(--muted)">${layout.sheet.name} &nbsp;·&nbsp; ${(layout.util*100).toFixed(0)}% used</span>`;
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
          <td style="text-align:right">${r.w}</td><td style="text-align:right">${r.h}</td>
          <td style="text-align:right">${r.qty}</td>
          <td>${r.material || '—'}</td>
          <td>${r.grain === 'h' ? 'Horiz' : r.grain === 'v' ? 'Vert' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
      area.appendChild(tableWrap);
    }
  });
}

function selectSheet(i) { activeSheetIdx = i; renderResults(); }

// Pastel color helpers
function toPastel(hex) {
  // Panel parts: moderate tint — blend 16% color with 84% white
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.16+255*.84)},${Math.round(g*.16+255*.84)},${Math.round(b*.16+255*.84)})`;
}
function toPaleSheet(hex) {
  // Sheet background: very pale (lighter than parts) — 4% tint
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.04+255*.96)},${Math.round(g*.04+255*.96)},${Math.round(b*.04+255*.96)})`;
}
function toPastelDark(hex) {
  const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  return `rgb(${Math.round(r*.45+180*.55)},${Math.round(g*.45+180*.55)},${Math.round(b*.45+180*.55)})`;
}

function drawCanvas(container, layout, units) {
  const { sheet, placed } = layout;
  const sW = layoutRotate ? sheet.h : sheet.w;
  const sH = layoutRotate ? sheet.w : sheet.h;
  const rotPieces = placed.map(p => layoutRotate
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
  const ripPhaseFor = (pathDirs) => pathDirs.some(d => d[0] === 'c') ? 3 : 1;

  // ── Recursive guillotine decomposition ──
  // Prefer interior rips first at each region. If none is possible, try outer
  // strips, then an interior cross. Each cut carries a `_path` snapshot of its
  // ancestor direction chain so phases can be finalized in a post-pass.
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

    const spans = (v, axis) => pcs.some(p => (axis === 'h' ? (p.y < v - 0.5 && p.y + p.h > v + 0.5) : (p.x < v - 0.5 && p.x + p.w > v + 0.5)));
    const pickFrom = (cands, axis) => {
      let best = null;
      const onSideA = (p, v) => (axis === 'h' ? (p.y + p.h <= v + 0.5) : (p.x + p.w <= v + 0.5));
      // Perpendicular extent: for a vertical cut (axis='v'), sub-regions get stripped
      // in the y-direction, so pieces' y+h matters. For a horizontal cut, x+w matters.
      const perpEnd = p => axis === 'v' ? (p.y + p.h) : (p.x + p.w);
      // Count pieces on a side that don't reach the side's max perpendicular extent.
      // Each such piece forces an extra outer strip after recursion, fragmenting waste.
      const shortCount = side => {
        if (!side.length) return 0;
        let M = -Infinity;
        for (const p of side) { const e = perpEnd(p); if (e > M) M = e; }
        let n = 0;
        for (const p of side) if (perpEnd(p) < M - 0.5) n++;
        return n;
      };
      for (const v of cands) {
        const sideA = pcs.filter(p => onSideA(p, v));
        const sideB = pcs.filter(p => !onSideA(p, v));
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
        ? [...new Set(pcs.flatMap(p => [p.y, p.y + p.h]))].filter(y => y > y0 + 0.5 && y < y1 - 0.5 && !spans(y, 'h'))
        : [...new Set(pcs.flatMap(p => [p.x, p.x + p.w]))].filter(x => x > x0 + 0.5 && x < x1 - 0.5 && !spans(x, 'v')));
      const ripBest = pickFrom(ripCands, ripIsH ? 'h' : 'v');
      if (ripBest) {
        const v = ripBest.v;
        if (ripIsH) {
          out.cuts.push({ x1: x0, y1: v, x2: x1, y2: v, pass: ripPassOf(true), phase: ripPhase, _path: pathDirs });
          const above = pcs.filter(p => p.y + p.h <= v + 0.5);
          const below = pcs.filter(p => p.y >= v - 0.5);
          const a = buildGuillotinePlan(x0, y0, x1, v, above, [...pathDirs, 'rL']);
          const b = buildGuillotinePlan(x0, v, x1, y1, below, [...pathDirs, 'rR']);
          out.cuts.push(...a.cuts, ...b.cuts);
          out.offcuts.push(...a.offcuts, ...b.offcuts);
        } else {
          out.cuts.push({ x1: v, y1: y0, x2: v, y2: y1, pass: ripPassOf(false), phase: ripPhase, _path: pathDirs });
          const left  = pcs.filter(p => p.x + p.w <= v + 0.5);
          const right = pcs.filter(p => p.x >= v - 0.5);
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
        ? [...new Set(pcs.flatMap(p => [p.x, p.x + p.w]))].filter(x => x > x0 + 0.5 && x < x1 - 0.5 && !spans(x, 'v'))
        : [...new Set(pcs.flatMap(p => [p.y, p.y + p.h]))].filter(y => y > y0 + 0.5 && y < y1 - 0.5 && !spans(y, 'h')));
      const crossBest = pickFrom(crossCands, ripIsH ? 'v' : 'h');
      if (crossBest) {
        const v = crossBest.v;
        if (ripIsH) {
          out.cuts.push({ x1: v, y1: y0, x2: v, y2: y1, pass: ripPassOf(false), phase: 2, _path: pathDirs });
          const left  = pcs.filter(p => p.x + p.w <= v + 0.5);
          const right = pcs.filter(p => p.x >= v - 0.5);
          const l = buildGuillotinePlan(x0, y0, v, y1, left,  [...pathDirs, 'cL']);
          const r = buildGuillotinePlan(v, y0, x1, y1, right, [...pathDirs, 'cR']);
          out.cuts.push(...l.cuts, ...r.cuts);
          out.offcuts.push(...l.offcuts, ...r.offcuts);
        } else {
          out.cuts.push({ x1: x0, y1: v, x2: x1, y2: v, pass: ripPassOf(true), phase: 2, _path: pathDirs });
          const above = pcs.filter(p => p.y + p.h <= v + 0.5);
          const below = pcs.filter(p => p.y >= v - 0.5);
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

  const plan = buildGuillotinePlan(0, 0, sW0, sH0, origPieces);

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
  const finalCuts = [];
  for (const c of cutLines) {
    const isH = c.y1 === c.y2;
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
      const gdir = p.rotated ? (pGrain==='h'?'v':'h') : pGrain;
      ctx.save();
      ctx.beginPath(); ctx.rect(x+1,y+1,w-2,h-2); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 0.65;
      const sp = Math.max(5, Math.min(14, w/8, h/8));
      if (gdir==='h') { for (let gy=y+sp; gy<y+h; gy+=sp) { ctx.beginPath(); ctx.moveTo(x,gy); ctx.lineTo(x+w,gy); ctx.stroke(); } }
      else { for (let gx=x+sp; gx<x+w; gx+=sp) { ctx.beginPath(); ctx.moveTo(gx,y); ctx.lineTo(gx,y+h); ctx.stroke(); } }
      ctx.restore();
    }

    // ── Label + dims inside part ──
    const pW = Math.round(p.rotated ? p.item.h : p.item.w);
    const pH = Math.round(p.rotated ? p.item.w : p.item.h);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    // Centered label (if there's room)
    const labelRoom = w > 30 && h > 18;
    if (labelRoom && p.item.label) {
      ctx.fillStyle = txtColor;
      ctx.font = labelFont;
      const lbl = trunc(p.item.label, Math.floor(w / (fs * 0.58)));
      ctx.fillText(lbl, x + w/2, y + h/2);
    }

    // Width dim at top-inside, height dim at left-inside (rotated) — both inside part
    ctx.fillStyle = '#333';
    ctx.font = dimFont;
    if (w > 30) {
      // Width near top, clear of the label
      ctx.fillText(`${pW}`, x + w/2, y + Math.min(fs + 4, h * 0.22));
    }
    if (h > 30) {
      // Height rotated on left side, clear of the label
      ctx.save();
      ctx.translate(x + Math.min(fs + 4, w * 0.22), y + h/2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${pH}`, 0, 0);
      ctx.restore();
    }
  }

  // ── Offcut dims — inside each offcut rectangle, centred top + left ──
  // Skip a dim if it's redundant (matches sheet edge or a touching piece's matching dim).
  ctx.save();
  ctx.fillStyle = '#8a8a8a';
  ctx.font = dimFont;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const eq = (a, b) => Math.abs(a - b) < 1;
  for (const oc of offcutRects) {
    const oW = Math.round(oc.w), oH = Math.round(oc.h);
    // Touching pieces on each side (edge-shared)
    const touchLeft  = rotPieces.filter(p => eq(p.x + p.w, oc.x) && p.y < oc.y + oc.h && p.y + p.h > oc.y);
    const touchRight = rotPieces.filter(p => eq(p.x, oc.x + oc.w) && p.y < oc.y + oc.h && p.y + p.h > oc.y);
    const touchTop   = rotPieces.filter(p => eq(p.y + p.h, oc.y) && p.x < oc.x + oc.w && p.x + p.w > oc.x);
    const touchBot   = rotPieces.filter(p => eq(p.y, oc.y + oc.h) && p.x < oc.x + oc.w && p.x + p.w > oc.x);

    // Skip height if it matches sheet height OR matches an adjacent piece's height
    const skipH = eq(oc.h, sH)
      || touchLeft.some(p => eq(p.h, oc.h))
      || touchRight.some(p => eq(p.h, oc.h));
    // Skip width if it matches sheet width OR matches an adjacent piece's width
    const skipW = eq(oc.w, sW)
      || touchTop.some(p => eq(p.w, oc.w))
      || touchBot.some(p => eq(p.w, oc.w));

    const oxo = OX + oc.x * scale;
    const oyo = OY + oc.y * scale;
    const owo = oc.w * scale;
    const oho = oc.h * scale;
    if (!skipW && owo > 24 && oho > 14) {
      ctx.fillText(`${oW}`, oxo + owo / 2, oyo + Math.min(fs + 4, oho * 0.22));
    }
    if (!skipH && oho > 30 && owo > 14) {
      ctx.save();
      ctx.translate(oxo + Math.min(fs + 4, owo * 0.22), oyo + oho / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${oH}`, 0, 0);
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
  const swText = `${sW}`;
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
  const shText = `${sH}`;
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
      <button class="btn btn-outline" onclick="printLayout('print')" style="font-size:11px;padding:5px 10px" title="Send to printer">Print</button>
      <button class="btn btn-outline" onclick="printLayout('pdf')" style="font-size:11px;padding:5px 10px" title="Save as PDF">PDF</button>
    </div>
  </div>`;

  results.layouts.forEach((layout, si) => {
    const pct = (layout.util * 100).toFixed(0);
    const wasteColor = layout.util > 0.7 ? 'var(--success)' : layout.util > 0.4 ? 'var(--accent)' : 'var(--danger)';
    html += `
    <div class="cutsheet-sheet">
      <div class="cutsheet-header">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="cutsheet-title">Sheet ${si + 1}</span>
          <span class="cutsheet-sub">${layout.sheet.name} &nbsp;·&nbsp; ${layout.sheet.w}×${layout.sheet.h} ${u}</span>
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
          ${layout.placed.map((p, i) => {
            const baseGrain = layout.sheet.grain || 'none';
            const cutW = p.rotated ? p.item.h : p.item.w;
            const cutH = p.rotated ? p.item.w : p.item.h;
            const grainDir = baseGrain === 'none' ? '—' : (p.rotated ? (baseGrain==='h'?'↕':'↔') : (baseGrain==='h'?'↔':'↕'));
            return `<tr>
              <td class="cutsheet-num">${i + 1}</td>
              <td><span class="color-dot" style="background:${p.item.color};margin-right:6px;display:inline-block;vertical-align:middle"></span>${p.item.label}</td>
              <td class="cutsheet-dim">${cutW}</td>
              <td class="cutsheet-dim">${cutH}</td>
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
        <tbody>${results.unplaced.map(p=>`<tr><td>${p.label}</td><td class="cutsheet-dim">${p.w}</td><td class="cutsheet-dim">${p.h}</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  area.innerHTML = html;
}

