// ProCabinet — Cut list layout engine (carved out of src/cutlist.js, R.2
// split). The guillotine + nested packing algorithms, the optimiser, the
// canvas sheet drawing (drawCanvas + gestures), the layout toolbar
// (zoom / color / grain / cut-order / rotate / font-scale toggles) and the
// results/summary renderers. No top-level state and no parse-time executable
// code — everything runs on user action or via renderResults().
//
// Reads/writes the shared cut-list state declared in src/cutlist.js
// (sheets, pieces, results, activeSheetIdx, activeTab, cutMethod, layoutZoom
// / layoutColor / layoutGrain / layoutFontScale / layoutCutOrder /
// layoutSheetCutList / layoutRotate, _clRotateTouched, clShowSummary,
// clShowCutList, _clDrawnW, _clAreaObs*) through the shared global lexical
// environment. app.js's INIT block calls _syncCutMethodToggle() at script-
// evaluation time, so this file must load before src/app.js.
//
// Cross-file dependencies (runtime, resolved through the global env):
//   - _toast / _byId (src/ui.js)
//   - formatDim (src/units.js); window.units (src/settings.js)
//   - stockItems (src/stock.js)
//   - grainIcon / _trimmedDims + state above (src/cutlist.js)
//   - printLayout callers live in src/cutlist-pdf.js; DXF export stays in
//     src/cutlist.js — both consume `results` produced by optimize() here.

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
function toggleLayoutRotate() {
  layoutRotate = !layoutRotate;
  _clRotateTouched = true;
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

// ── CNC ROUTER (NESTED) PACKER ──────────────────────────────────────────────
// Non-guillotine packer for a CNC router: parts can sit anywhere on the sheet
// (no edge-to-edge cut constraint), so it packs denser than the panel-saw
// packer. MaxRects with Best-Short-Side-Fit placement.
//
// `gap` is the clearance left around every part (the router bit diameter). It is
// baked into each part's footprint, and the bin is inflated by `gap`, so any two
// neighbouring parts end up >= gap apart while parts can still reach the real
// sheet edge. Returns the SAME shape as packSheetRecGuillotine —
// { placed: [{ x, y, w, h, item, rotated }], leftover } in real (un-inflated)
// coordinates — so the layout viewer, PDF and DXF export consume it unchanged.
/**
 * @param {number} sheetW @param {number} sheetH @param {string} sheetGrain
 * @param {any[]} items @param {number} gap
 * @returns {{ placed: any[], leftover: any[] }}
 */
function packSheetNested(sheetW, sheetH, sheetGrain, items, gap) {
  const g = gap || 0;
  // Allowed orientations given the sheet grain (mirrors the guillotine packer).
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

  // Free-rectangle list. Bin inflated by g so a part touching the real sheet
  // edge still "fits" with its trailing (virtual) gap.
  let free = [{ x: 0, y: 0, w: sheetW + g, h: sheetH + g }];
  /** @type {any[]} */ const placed = [];
  /** @type {any[]} */ const leftover = [];

  // Largest-first — MaxRects packs best with big pieces placed first.
  const queue = [...items].sort((a, b) => (b.w * b.h) - (a.w * a.h));

  for (const it of queue) {
    /** @type {any} */ let best = null;
    for (let i = 0; i < free.length; i++) {
      const fr = free[i];
      for (const o of orientOf(it)) {
        const fw = o.w + g, fh = o.h + g;            // inflated footprint
        if (fw > fr.w + 1e-6 || fh > fr.h + 1e-6) continue;
        const short = Math.min(fr.w - fw, fr.h - fh);
        const long  = Math.max(fr.w - fw, fr.h - fh);
        if (!best || short < best.short || (short === best.short && long < best.long)) {
          best = { x: fr.x, y: fr.y, fw, fh, o, short, long };
        }
      }
    }
    if (!best) { leftover.push(it); continue; }

    // Place the REAL part at the free-rect origin (un-inflated size).
    placed.push({ x: best.x, y: best.y, w: best.o.w, h: best.o.h, item: it, rotated: best.o.rotated });

    // Split every free rect overlapping the inflated footprint, then prune.
    const px0 = best.x, py0 = best.y, px1 = best.x + best.fw, py1 = best.y + best.fh;
    /** @type {any[]} */ const next = [];
    for (const fr of free) {
      if (px0 >= fr.x + fr.w || px1 <= fr.x || py0 >= fr.y + fr.h || py1 <= fr.y) {
        next.push(fr); continue;                      // no overlap — keep
      }
      if (px0 > fr.x)        next.push({ x: fr.x, y: fr.y, w: px0 - fr.x, h: fr.h });
      if (px1 < fr.x + fr.w) next.push({ x: px1, y: fr.y, w: fr.x + fr.w - px1, h: fr.h });
      if (py0 > fr.y)        next.push({ x: fr.x, y: fr.y, w: fr.w, h: py0 - fr.y });
      if (py1 < fr.y + fr.h) next.push({ x: fr.x, y: py1, w: fr.w, h: fr.y + fr.h - py1 });
    }
    free = _pruneFreeRects(next);
  }
  return { placed, leftover };
}

/**
 * MaxRects housekeeping: drop sliver rects and any free rect fully contained in
 * another (keeps the free list small and correct).
 * @param {any[]} rects @returns {any[]}
 */
function _pruneFreeRects(rects) {
  const r = rects.filter(a => a.w >= 1 && a.h >= 1);
  /** @type {any[]} */ const keep = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    let contained = false;
    for (let j = 0; j < r.length; j++) {
      if (i === j) continue;
      const b = r[j];
      const inside = a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
      const aArea = a.w * a.h, bArea = b.w * b.h;
      if (inside && (bArea > aArea || (bArea === aArea && j < i))) { contained = true; break; }
    }
    if (!contained) keep.push(a);
  }
  return keep;
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

/**
 * Switch the cutting method ('guillotine' = panel saw, 'nested' = CNC router).
 * Persists the choice and re-optimises immediately when a layout is on screen.
 * @param {string} method
 */
function setCutMethod(method) {
  cutMethod = method === 'nested' ? 'nested' : 'guillotine';
  localStorage.setItem('pc_cut_method', cutMethod);
  _syncCutMethodToggle();
  if (results) optimize();
}

/** Reflect the current cutMethod on the toolbar — toggle button active states
 *  and hide the guillotine-only "Cut order" button in router mode. */
function _syncCutMethodToggle() {
  const g = _byId('cmt-guillotine'), n = _byId('cmt-nested');
  if (g) g.classList.toggle('active', cutMethod === 'guillotine');
  if (n) n.classList.toggle('active', cutMethod === 'nested');
  // Cut order shows the numbered guillotine cut sequence — meaningless on a
  // CNC router (each part is its own toolpath), so hide the button entirely
  // in nested mode. Its layoutCutOrder state is preserved.
  const co = _byId('lt-cutorder');
  if (co) co.style.display = cutMethod === 'nested' ? 'none' : '';
}

function optimize() {
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
    // PACK THIS SHEET ───────────────────────────────────────────────────────
    // Panel saw (guillotine): recursive guillotine builds an explicit cut tree,
    // trying both splits at each region — clean hierarchical cuts for a saw.
    // CNC router (nested): MaxRects places parts freely for denser packing,
    // with `sheetKerf` acting as the router-bit gap between parts.
    /** @type {{ placed: any[], leftover: any[] }} */
    const chosen = cutMethod === 'nested'
      ? packSheetNested(si.w, si.h, si.grain || 'none', fittable, sheetKerf)
      : packSheetRecGuillotine(si.w, si.h, si.grain || 'none', fittable, sheetKerf);
    if (!chosen.placed.length) continue;
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

  // Immediate feedback when not everything fitted on the available sheets —
  // the persistent banner in renderLayout lists which parts; this toast just
  // surfaces the count so the user notices right after clicking Optimize.
  if (results.unplaced.length && typeof _toast === 'function') {
    const n = results.unplaced.length;
    _toast(`${n} part${n === 1 ? '' : 's'} didn't fit — add more sheets`, 'error');
  }

  activeSheetIdx = 0;
  if (typeof switchCLMainView === 'function') switchCLMainView('layout');
  // Mobile: the layout renders in the list pane (cl-right) — reveal it.
  if (window._mvShowList) window._mvShowList();
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

/** Watch #results-area and re-render the layout when its width meaningfully
 *  changes from the width the diagrams were drawn for. Covers every "drawn at
 *  the wrong width" case in one place: rendered while the pane was hidden
 *  (tab switch later un-hides a tiny diagram), window resizes, phone rotation,
 *  and panel collapse/expand. The 24px dead-band ignores scrollbar
 *  appear/disappear so a re-render can't re-trigger itself. */
function _clEnsureAreaObserver() {
  if (_clAreaObs || typeof ResizeObserver === 'undefined') return;
  const area = _byId('results-area');
  if (!area) return;
  _clAreaObs = new ResizeObserver(() => {
    if (!results || !results.layouts.length || _clDrawnW < 0) return;
    const a = _byId('results-area');
    if (!a) return;
    const w = a.clientWidth;
    if (w < 50 || Math.abs(w - _clDrawnW) <= 24) return;
    if (_clAreaObsRaf) return;
    _clAreaObsRaf = requestAnimationFrame(() => { _clAreaObsRaf = 0; renderResults(); });
  });
  _clAreaObs.observe(area);
}

function renderResults() {
  // Mobile back bar (#cl-view-layout) shows the open cut-list's name.
  const _clNameEl = document.getElementById('cl-layout-name');
  if (_clNameEl) _clNameEl.textContent = _clCurrentCutlistName || 'Cut Layout';
  if (!results) return;
  _clEnsureAreaObserver();
  // Mobile defaults to portrait sheet orientation — landscape sheets render tiny
  // on a phone. Respected only until the user manually hits Rotate.
  if (!_clRotateTouched && window._mvIsMobile && window._mvIsMobile()) layoutRotate = true;
  // Sync layout toolbar button states with persisted prefs
  const btnCo = _byId('lt-cutorder'); if (btnCo) btnCo.classList.toggle('active', layoutCutOrder);
  const btnSum = _byId('lt-pg-summary'); if (btnSum) btnSum.classList.toggle('active', clShowSummary);
  const btnScl = _byId('lt-sheetcl'); if (btnScl) btnScl.classList.toggle('active', layoutSheetCutList);
  const btnRot = _byId('lt-rotate'); if (btnRot) btnRot.classList.toggle('active', layoutRotate);
  const area = _byId('results-area');
  if (area) renderLayout(area);  // inner tabs removed; layout view is the only view
}

/** @param {HTMLElement} area @param {number} [tries] */
function renderLayout(area, tries) {
  if (!results.layouts.length) {
    area.innerHTML = '<div class="empty-state"><h3>No layouts generated</h3><p>Check that your pieces fit within your sheet dimensions.</p></div>';
    return;
  }
  // The diagram scales to the panel's content width. If the layout panel has
  // not been laid out yet (e.g. just un-hidden when the walkthrough switches
  // to it), clientWidth is 0 and the fit-scale floors to a tiny diagram —
  // defer a few frames until the panel has a real width.
  if (area.clientWidth < 50 && (tries || 0) < 12) {
    requestAnimationFrame(() => renderLayout(area, (tries || 0) + 1));
    return;
  }
  // Record the width this render is sized for; the area ResizeObserver
  // re-renders when the live width later deviates (see _clEnsureAreaObserver).
  _clDrawnW = area.clientWidth;
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

  // Unplaced-parts banner — pinned to the top of the layout view so it can't
  // be missed. Groups instances by (label, w, h) into per-part chips with a
  // quantity badge, and tells the user what to do next.
  if (results.unplaced.length) {
    /** @type {Map<string, { label: string, w: number, h: number, qty: number }>} */
    const grouped = new Map();
    for (const p of results.unplaced) {
      const k = `${p.label}|${p.w}|${p.h}`;
      const g = grouped.get(k);
      if (g) g.qty++; else grouped.set(k, { label: p.label, w: p.w, h: p.h, qty: 1 });
    }
    const chips = [...grouped.values()].map(g =>
      `<span class="layout-warn-chip">${g.qty}× ${g.label} <em>${formatDim(g.w)}×${formatDim(g.h)}${u}</em></span>`
    ).join('');
    const n = results.unplaced.length;
    const banner = document.createElement('div');
    banner.className = 'layout-warn';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <div class="layout-warn-icon" aria-hidden="true">⚠</div>
      <div class="layout-warn-body">
        <div class="layout-warn-title">${n} part${n === 1 ? '' : 's'} didn't fit on the available sheets</div>
        <div class="layout-warn-sub">Add more sheets, or turn off the parts you don't need.</div>
        <div class="layout-warn-list">${chips}</div>
      </div>`;
    area.appendChild(banner);
  }

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

/** Pinch-zoom + drag-pan for a rendered cut-layout canvas. Phones / touch only
 *  (a gesture layer on top of the toolbar zoom; a wide mouse desktop keeps the
 *  toolbar controls only). The canvas is moved with a CSS transform, so the
 *  bitmap stays pristine — PDF export and toolbar re-renders (which replace the
 *  canvas) are unaffected. Pinch = zoom (1×–6×), drag = pan when zoomed,
 *  double-tap = zoom to / reset. `touch-action` flips to `none` only while
 *  zoomed, so the results list still scrolls normally at fit.
 *  @param {HTMLCanvasElement} canvas */
function _clAttachCanvasGestures(canvas) {
  const enable = (typeof window._mvIsMobile === 'function' && window._mvIsMobile())
    || (!!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (!enable) return;

  let scale = 1, tx = 0, ty = 0;
  /** @type {Map<number, {x:number, y:number}>} */
  const pts = new Map();
  let pinchDist = 0, pinchScale = 1, lastTapAt = 0, anchorX = 0, anchorY = 0;
  /** @type {{x:number, y:number} | null} */
  let panLast = null;

  canvas.style.transformOrigin = '0 0';
  canvas.style.willChange = 'transform';
  canvas.style.touchAction = 'pan-y';

  const apply = () => {
    canvas.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
    canvas.style.touchAction = scale > 1.01 ? 'none' : 'pan-y';
  };
  /** @param {number} s */
  const clamp = (s) => Math.max(1, Math.min(6, s));
  /** @param {number} cx @param {number} cy @param {number} s */
  const setAnchor = (cx, cy, s) => {
    const r = canvas.getBoundingClientRect();
    anchorX = (cx - r.left) / s; anchorY = (cy - r.top) / s;
  };
  /** @param {number} ns @param {number} fx @param {number} fy */
  const zoomTo = (ns, fx, fy) => {
    ns = clamp(ns);
    setAnchor(fx, fy, scale);
    const r = canvas.getBoundingClientRect();
    tx = fx - (r.left - tx) - anchorX * ns;
    ty = fy - (r.top - ty) - anchorY * ns;
    scale = ns; apply();
  };
  const reset = () => { scale = 1; tx = 0; ty = 0; apply(); };

  canvas.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (pts.size === 1) {
      panLast = { x: e.clientX, y: e.clientY };
      const now = Date.now();
      if (now - lastTapAt < 320) { if (scale > 1.01) reset(); else zoomTo(2.5, e.clientX, e.clientY); lastTapAt = 0; }
      else lastTapAt = now;
    } else if (pts.size === 2) {
      const a = Array.from(pts.values());
      pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      pinchScale = scale;
      setAnchor((a[0].x + a[1].x) / 2, (a[0].y + a[1].y) / 2, scale);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      const a = Array.from(pts.values());
      const dist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
      const mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
      const ns = clamp(pinchScale * (dist / pinchDist));
      tx = mx - (canvas.getBoundingClientRect().left - tx) - anchorX * ns;
      ty = my - (canvas.getBoundingClientRect().top - ty) - anchorY * ns;
      scale = ns; apply(); e.preventDefault();
    } else if (pts.size === 1 && scale > 1.01 && panLast) {
      tx += e.clientX - panLast.x; ty += e.clientY - panLast.y;
      panLast = { x: e.clientX, y: e.clientY };
      apply(); e.preventDefault();
    }
  });
  /** @param {PointerEvent} e */
  const end = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinchDist = 0;
    if (pts.size === 1) { const a = Array.from(pts.values())[0]; panLast = { x: a.x, y: a.y }; }
    if (pts.size === 0) { panLast = null; if (scale <= 1.01) reset(); }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
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
  _clAttachCanvasGestures(canvas);
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

  // In CNC-router (nested) mode there are no guillotine cut paths — the router
  // follows each part outline — so skip the whole plan. Downstream loops over
  // plan.cuts / plan.offcuts then no-op cleanly: no dashed cut lines, no offcut
  // dimension annotations, no numbered cut-order overlay.
  /** @type {{ cuts: any[], offcuts: any[] }} */
  const plan = cutMethod === 'nested'
    ? { cuts: [], offcuts: [] }
    : buildGuillotinePlan(0, 0, sW0, sH0, origPieces, []);

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
  const dimBg = document.documentElement.classList.contains('dark') ? '#cccccc' : '#fff';
  ctx.fillStyle = dimBg;
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
  ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#cccccc' : '#fff';
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

