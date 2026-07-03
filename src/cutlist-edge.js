// ProCabinet — Cut list edge-band UI + column visibility (carved out of
// src/cutlist.js, R.2 split). The edge-band materials table (add / edit /
// step-length / remove), the per-piece edge assignment popup (sides, trim,
// save), the "new edge-band material" popup, and the pieces-table column
// visibility toggles (grain / material / notes / label / edgeband). No
// top-level state and no parse-time executable code. app.js's INIT block
// calls initColVisibility() at script-evaluation time, so this file must
// load before src/app.js.
//
// Cross-file dependencies (runtime, resolved through the global env):
//   - _toast / _confirm / _byId / _openPopup / _closePopup / _popupVal (src/ui.js)
//   - _escHtml (src/cabinet.js); formatDim (src/units.js)
//   - stockItems (src/stock.js)
//   - renderPieces / renderSheets (src/cutlist-render.js)
//   - shared state + persistence from src/cutlist.js: edgeBands, _edgeBandId,
//     colsVisible, pieces, EYE_ON / EYE_OFF / DEL_SVG, _saveCutList
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
