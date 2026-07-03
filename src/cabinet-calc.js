// ProCabinet — Cabinet calculation engine (extracted from cabinet.js, R.1 split)
// Pure calculation: no DOM, no state mutation, no side effects.

const SHEET_W = 2.44, SHEET_H = 1.22, SHEET_M2 = SHEET_W * SHEET_H;

// Power-law labour reference geometry (constants — fixed across all users).
// Derived from a 600×720×580 standard cabinet at 50% door / 30% drawer pct.
// hours = refHours × (actual / reference)^LABOUR_EXPONENT
const LABOUR_EXPONENT = 0.7;
const CARCASS_REF_VOLUME    = 0.25;    // m³  (0.6 × 0.72 × 0.58)
const DOOR_REF_AREA         = 0.216;   // m²  (50% × 0.6 × 0.72, 1 door)
const DRAWER_FRONT_REF_AREA = 0.1296;  // m²  (30% × 0.6 × 0.72, 2 drawer fronts)
const DRAWER_BOX_REF_VOLUME = 0.07517; // m³  (30% × 0.6 × 0.72 × 0.58, 2 drawer boxes)

/** @param {any[]} list @param {string} name */
function _typeRefHours(list, name) {
  if (!Array.isArray(list) || !list.length) return 0;
  return (list.find(t => t.name === name) || list[0])?.refHours ?? 0;
}

// Look up a finish's per-m² price by name. Stock items take precedence over
// cbSettings.finishes (so user-edited stock always wins). Returns 0 for 'None'
// or unknown names.
/** @param {string} finishName */
function _finishPricePerM2(finishName) {
  if (!finishName || finishName === 'None') return 0;
  const s = stockItems.find(it => it.name === finishName && it.category === 'Finishing');
  if (s) return s.cost ?? 0;
  return (cbSettings.finishes || []).find(/** @param {any} f */ f => f.name === finishName)?.price || 0;
}

// Material £/m² by name. Stock items win over the cbSettings.materials catalogue
// (a user-edited stock row always takes precedence), mirroring _finishPricePerM2.
// Extracted to module scope (was a nested fn in calcCBLine) so the live-link
// rate-card snapshot (share.js _buildRateCard) resolves prices through the SAME
// code the calculator uses — no second copy of the stock-first logic.
/** @param {string} matName */
function _matPricePerM2(matName) {
  const s = stockItems.find(s => s.name === matName);
  if (s) {
    // Sheet m² — prefer width_mm + length_m (canonical fields the app writes for
    // sheet stock); fall back to legacy w/h treated as mm, then SHEET_M2.
    let sheetM2 = (s.width_mm && s.length_m) ? (s.width_mm / 1000) * s.length_m
                : (s.w && s.h) ? (s.w / 1000) * (s.h / 1000)
                : SHEET_M2;
    // Guard: a real sheet is ~1–3 m². If the stored size is implausibly small
    // (e.g. inches mis-entered as mm, or a half-filled legacy row), fall back to
    // the standard sheet so one bad row can't explode a cabinet/quote price.
    if (!(sheetM2 >= 0.5)) sheetM2 = SHEET_M2;
    return sheetM2 > 0 ? (s.cost ?? 0) / sheetM2 : 0;
  }
  const m = cbSettings.materials.find(/** @param {any} m */ m => m.name === matName);
  return m ? m.price / SHEET_M2 : 0;
}

// Hardware unit £ by name. Stock items in the Hardware/Other categories win over
// the legacy cbSettings.hardware catalogue. Extracted alongside _matPricePerM2.
/** @param {string} hwName */
function _hwUnitPrice(hwName) {
  const so = (typeof stockItems !== 'undefined' ? stockItems : []).find(/** @param {any} s */ s => {
    if (s.name !== hwName) return false;
    const cat = (typeof _scGet === 'function' ? _scGet(s.id) : '') || s.category;
    return cat === 'Hardware' || cat === 'Other';
  });
  if (so) return so.cost ?? 0;
  const h = cbSettings.hardware.find(/** @param {any} h */ h => h.name === hwName);
  return h ? h.price : 0;
}

// Contingency multiplier applied to autoLabour BEFORE conversion to cost.
// Driven by cbSettings.contingencyPct (% of labour time), so both labourHrs
// and labourCost reflect it.
function _contingencyMult() {
  return 1 + (cbSettings.contingencyPct || 0) / 100;
}

// ── Custom Extra Panels (user-defined types in My Rates) ──
// A panel's "basis" sets which two cabinet dimensions form its face — mirroring
// the built-ins: shelves = Width×Depth, end panels/partitions = Height×Depth,
// backs/faces = Width×Height. Dimensions are passed in whatever unit the caller
// uses (metres for cost, mm for the cut list); T is the matching thickness.
/** @param {string} basis @param {number} innerW @param {number} W @param {number} H @param {number} D @param {number} T */
function _extraPanelArea(basis, innerW, W, H, D, T) {
  if (basis === 'WD') return innerW * (D - T);   // shelf-like (lies between sides)
  if (basis === 'WH') return W * H;              // back/face-like
  return H * D;                                  // 'HD' — side/partition-like (default)
}
/** Cut-list piece dimensions {w, h} for a basis. @param {string} basis @param {number} W @param {number} H @param {number} D @param {number} iW @param {number} T */
function _extraPanelCutDims(basis, W, H, D, iW, T) {
  if (basis === 'WD') return { w: iW, h: D - T };
  if (basis === 'WH') return { w: W, h: H };
  return { w: H, h: D }; // 'HD'
}
/** Total per-cabinet count of all custom panels on a line. @param {any} cab */
function _extraPanelCount(cab) {
  const m = cab.extraPanels || {};
  let n = 0;
  for (const t of (cbSettings.extraPanelTypes || [])) n += parseFloat(m[t.id]) || 0;
  return n;
}
/** Raw (pre-markup/pre-contingency) material cost + labour hours for a line's
 *  custom panels. matPricePerM2 is mp(line.material) from the caller's scope.
 *  @param {any} line @param {number} innerW @param {number} W @param {number} H @param {number} D @param {number} T @param {number} matPricePerM2 */
function _extraPanelTotals(line, innerW, W, H, D, T, matPricePerM2) {
  const map = line.extraPanels || {};
  let matRaw = 0, hrs = 0;
  for (const t of (cbSettings.extraPanelTypes || [])) {
    const qty = parseFloat(map[t.id]) || 0;
    if (!qty) continue;
    matRaw += qty * _extraPanelArea(t.basis, innerW, W, H, D, T) * matPricePerM2;
    hrs += qty * (parseFloat(t.hrs) || 0);
  }
  return { matRaw, hrs };
}

// Per-section cost breakdown for the editor's live displays.
// Each section's total = material (with materialMarkup) + labour (× labourRate)
//                       + hardware specific to that section.
// Summing every section equals matCost + labourCost + hwCost from calcCBLine
// (modulo extras, which are folded into matCost there).
/** @param {any} line */
function calcCBSections(line) {
  const W = line.w / 1000, H = line.h / 1000, D = line.d / 1000;
  const T = 0.018;
  const innerW = Math.max(0, W - 2 * T);
  const matMarkupMult = 1 + (cbSettings.materialMarkup || 0) / 100;
  const labourRate = cbSettings.labourRate || 65;
  /** @type {any} */
  const lt = cbSettings.labourTimes || {};

  /** @param {string} matName */
  function mp(matName) {
    const s = stockItems.find(s => s.name === matName);
    if (s) {
      // Sheet m² — prefer width_mm + length_m (canonical fields the app writes
      // for sheet stock); fall back to legacy w/h treated as mm, then SHEET_M2.
      let sheetM2 = (s.width_mm && s.length_m) ? (s.width_mm / 1000) * s.length_m
                  : (s.w && s.h) ? (s.w / 1000) * (s.h / 1000)
                  : SHEET_M2;
      // Guard: a real sheet is ~1–3 m². If the stored size is implausibly small
      // (e.g. inches mis-entered as mm, or a half-filled legacy row), fall back to
      // the standard sheet so one bad row can't explode a cabinet/quote price.
      if (!(sheetM2 >= 0.5)) sheetM2 = SHEET_M2;
      return sheetM2 > 0 ? (s.cost ?? 0) / sheetM2 : 0;
    }
    const m = cbSettings.materials.find(/** @param {any} m */ m => m.name === matName);
    return m ? m.price / SHEET_M2 : 0;
  }
  /** @param {string} hwName */
  function hwp(hwName) {
    // Stock-first (Hardware/Other categories), mirroring mp() and _finishPricePerM2.
    // Falls back to the legacy cbSettings.hardware catalog for old cabinet names.
    const so = (typeof stockItems !== 'undefined' ? stockItems : []).find(/** @param {any} s */ s => {
      if (s.name !== hwName) return false;
      const cat = (typeof _scGet === 'function' ? _scGet(s.id) : '') || s.category;
      return cat === 'Hardware' || cat === 'Other';
    });
    if (so) return so.cost ?? 0;
    const h = cbSettings.hardware.find(/** @param {any} h */ h => h.name === hwName);
    return h ? h.price : 0;
  }

  const cont = _contingencyMult();
  const front = W * H;

  // ── Cabinet (carcass body + back + carcass finish + edging + base + construction) ──
  let cabinetMat = 2 * H * D * mp(line.material);             // sides
  cabinetMat += 2 * innerW * D * mp(line.material);            // top + bottom
  cabinetMat += W * H * mp(line.backMat);                      // back
  const carcassSurfArea = 2*H*D + 2*innerW*D + W*H;
  cabinetMat += carcassSurfArea * _finishPricePerM2(line.finish);  // carcass finish
  const edgingLength = 2*H + 2*innerW + ((line.shelves || 0) + (line.adjShelves || 0) + (line.looseShelves || 0)) * innerW;
  cabinetMat += edgingLength * (cbSettings.edgingPerM || 0);   // edge banding
  const constPrice = (cbSettings.constructions||[]).find(/** @param {any} c */ c => c.name === line.construction)?.price || 0;
  cabinetMat += constPrice * front;
  cabinetMat *= matMarkupMult;
  const carcassRefH = _typeRefHours(cbSettings.carcassTypes, line.carcassType) || lt.carcassRefHours || 0.4;
  const carcassHrs = carcassRefH * Math.pow((W*H*D) / CARCASS_REF_VOLUME, LABOUR_EXPONENT);
  // Base/plinth fabrication labour — flat hours per base type (× labour rate).
  // Exact-match only: an unset/unknown base contributes 0 (base is optional,
  // unlike carcass which always falls back to the first type).
  const baseHrs = (cbSettings.baseTypes||[]).find(/** @param {any} b */ b => b.name === line.baseType)?.refHours || 0;
  // Packaging (per-cabinet packing time) is folded into the Cabinet section so
  // the section breakdown still sums to calcCBLine's labourCost.
  const packHrs = cbSettings.packagingHours || 0;
  const cabinetLabour = (carcassHrs + baseHrs + packHrs + carcassSurfArea * (lt.finishPerM2 || 0.5)) * cont * labourRate;
  const cabinet = cabinetMat + cabinetLabour;

  // ── Doors (material + door finish + labour) ──
  // doorPct = % of FRONT FACE AREA. Door labour scales by power-law on total area.
  let doors = 0;
  let doorTotalArea = 0;
  if (line.doors > 0) {
    doorTotalArea = (line.doorPct || 0) / 100 * front;
    let doorMat = doorTotalArea * mp(line.doorMat);
    doorMat += doorTotalArea * _finishPricePerM2(line.doorFinish || line.finish);
    doorMat *= matMarkupMult;
    const doorRefH = _typeRefHours(cbSettings.doorTypes, line.doorType) || lt.door || 0.4;
    const doorHrs = doorTotalArea > 0 ? doorRefH * Math.pow(doorTotalArea / DOOR_REF_AREA, LABOUR_EXPONENT) : 0;
    const doorLabour = doorHrs * cont * labourRate;
    doors = doorMat + doorLabour;
  }

  // ── Drawer Fronts (material + finish + labour) ──
  let drawerFronts = 0;
  let drawerFrontTotalArea = 0;
  let drwH = 0;
  if (line.drawers > 0) {
    drawerFrontTotalArea = (line.drawerPct || 0) / 100 * front;
    drwH = drawerFrontTotalArea / line.drawers / Math.max(0.001, innerW);
    let frontMat = drawerFrontTotalArea * mp(line.drawerFrontMat);
    frontMat += drawerFrontTotalArea * _finishPricePerM2(line.drawerFrontFinish || line.finish);
    frontMat *= matMarkupMult;
    const drwFrontRefH = _typeRefHours(cbSettings.drawerFrontTypes, line.drawerFrontType) || 0.3;
    const drwFrontHrs = drawerFrontTotalArea > 0 ? drwFrontRefH * Math.pow(drawerFrontTotalArea / DRAWER_FRONT_REF_AREA, LABOUR_EXPONENT) : 0;
    drawerFronts = frontMat + drwFrontHrs * cont * labourRate;
  }

  // ── Drawer Boxes (material + finish + labour) ──
  let drawerBoxes = 0;
  if (line.drawers > 0) {
    const boxSurfArea = line.drawers * (2 * D * drwH + 2 * innerW * drwH + innerW * D);
    let boxMat = boxSurfArea * mp(line.drawerInnerMat);
    boxMat += boxSurfArea * _finishPricePerM2(line.drawerBoxFinish || line.finish);
    boxMat *= matMarkupMult;
    const drwBoxRefH = _typeRefHours(cbSettings.drawerBoxTypes, line.drawerBoxType) || 0.8;
    const drwBoxVol = innerW * D * drwH * line.drawers;
    const drwBoxHrs = drwBoxVol > 0 ? drwBoxRefH * Math.pow(drwBoxVol / DRAWER_BOX_REF_VOLUME, LABOUR_EXPONENT) : 0;
    drawerBoxes = boxMat + drwBoxHrs * cont * labourRate;
  }

  // Combined drawers (legacy key, sum of fronts + boxes)
  const drawers = drawerFronts + drawerBoxes;

  // ── Shelves & Partitions (material + labour for all shelf/partition/end-panel kinds) ──
  const shelfArea = innerW * (D - T);
  const _ep = _extraPanelTotals(line, innerW, W, H, D, T, mp(line.material));
  let shelvesMat = ((line.shelves || 0) + (line.adjShelves || 0) + (line.looseShelves || 0)) * shelfArea * mp(line.material);
  shelvesMat += ((line.partitions || 0) + (line.endPanels || 0)) * H * D * mp(line.material);
  shelvesMat += _ep.matRaw;                              // custom panels (raw; markup applied next)
  shelvesMat *= matMarkupMult;
  const shelvesLabour = (
      (line.shelves || 0)     * (lt.fixedShelf || 0.3)
    + (line.adjShelves || 0)  * (lt.adjShelfHoles || 0.4)
    + (line.looseShelves || 0)* (lt.looseShelf || 0.2)
    + (line.partitions || 0)  * (lt.partition || 0.5)
    + (line.endPanels || 0)   * (lt.endPanel || 0.3)
    + _ep.hrs                                            // custom panels labour
  ) * cont * labourRate;
  const shelves = shelvesMat + shelvesLabour;

  // ── Hardware (per-component manual items — no auto hinges/slides) ──
  /** @param {any[]} list */
  const hwSum = (list) => (Array.isArray(list) ? list : []).reduce((s, hw) => s + hwp(hw.name) * hw.qty, 0);
  const cabinetHardware     = hwSum(line.hwItems);
  const doorHardware        = hwSum(line.doorHwItems);
  const drawerHardware      = hwSum(line.drawerHwItems);
  const shelfHardware       = hwSum(line.shelfHwItems);
  const drawerFrontHardware = hwSum(line.drawerFrontHwItems);
  const hardware = cabinetHardware + doorHardware + drawerHardware + shelfHardware + drawerFrontHardware;

  // ── Extras (custom add-ons; markup applies since they're material-side) ──
  const extras = (line.extras || []).reduce(/** @param {number} s @param {any} e */ (s, e) => s + (parseFloat(e.cost) || 0) * (parseInt(e.qty) || 1), 0) * matMarkupMult;

  return { cabinet, doors, drawers, drawerFronts, drawerBoxes, shelves, hardware, cabinetHardware, doorHardware, drawerHardware, shelfHardware, drawerFrontHardware, extras };
}

/** @param {any} line */
function calcCBLine(line) {
  const W = line.w / 1000, H = line.h / 1000, D = line.d / 1000;
  const T = 0.018;
  const innerW = Math.max(0, W - 2 * T);

  // Price resolvers (stock-first) — module-level so the live-link rate-card
  // snapshot resolves through the exact same logic. See _matPricePerM2 / _hwUnitPrice.
  const mp = _matPricePerM2;
  const hwp = _hwUnitPrice;

  // Auto material cost: carcass panels
  let matCost = 0;
  matCost += 2 * H * D * mp(line.material);
  matCost += 2 * innerW * D * mp(line.material);
  matCost += W * H * mp(line.backMat);
  // Doors: doorPct = % of FRONT FACE AREA taken by doors (split equally among count)
  const front = W * H;
  const doorPct = (line.doorPct || 0) / 100;
  const doorTotalArea = doorPct * front;
  if (line.doors > 0) {
    matCost += doorTotalArea * mp(line.doorMat);
  }
  // Drawers: drawerPct = % of FRONT FACE AREA taken by drawer fronts
  const drawerPct = (line.drawerPct || 0) / 100;
  const drawerFrontTotalArea = drawerPct * front;
  let drwH = 0;
  let drawerBoxSurfArea = 0;
  if (line.drawers > 0) {
    drwH = drawerFrontTotalArea / line.drawers / Math.max(0.001, innerW);
    matCost += drawerFrontTotalArea * mp(line.drawerFrontMat);
    drawerBoxSurfArea = line.drawers * (2 * D * drwH + 2 * innerW * drwH + innerW * D);
    matCost += drawerBoxSurfArea * mp(line.drawerInnerMat);
  }
  // Shelves (fixed + adjustable + loose all cut from the carcass material at shelf area)
  const shelfArea = innerW * (D - T);
  matCost += ((line.shelves || 0) + (line.adjShelves || 0) + (line.looseShelves || 0)) * shelfArea * mp(line.material);
  // Partitions + end panels (full H×D panels — matches the cut list)
  matCost += ((line.partitions || 0) + (line.endPanels || 0)) * H * D * mp(line.material);
  // Custom extra panels — material (face area × carcass material) + labour (added below).
  const _epLine = _extraPanelTotals(line, innerW, W, H, D, T, mp(line.material));
  matCost += _epLine.matRaw;

  // Finishing cost — per-component, fall back to line.finish for legacy data.
  const carcassSurfArea = 2*H*D + 2*innerW*D + W*H;
  matCost += carcassSurfArea       * _finishPricePerM2(line.finish);
  if (line.doors > 0)   matCost += doorTotalArea         * _finishPricePerM2(line.doorFinish        || line.finish);
  if (line.drawers > 0) matCost += drawerFrontTotalArea  * _finishPricePerM2(line.drawerFrontFinish || line.finish);
  if (line.drawers > 0) matCost += drawerBoxSurfArea     * _finishPricePerM2(line.drawerBoxFinish   || line.finish);

  // Extras cost
  const extrasCost = (line.extras||[]).reduce(/** @param {number} s @param {any} e */ (s, e) => s + (parseFloat(e.cost)||0) * (parseInt(e.qty)||1), 0);
  matCost += extrasCost;

  // Edge banding
  const edgingLength = 2*H + 2*innerW + ((line.shelves || 0) + (line.adjShelves || 0) + (line.looseShelves || 0)) * innerW;
  const edgingCost = edgingLength * (cbSettings.edgingPerM || 0);
  matCost += edgingCost;

  // Construction type cost (BUG FIX: moved BEFORE override snapshot)
  const frontArea = W * H;
  const constPrice = (cbSettings.constructions||[]).find(/** @param {any} c */ c => c.name === line.construction)?.price || 0;
  matCost += constPrice * frontArea;

  // Material markup — adds a configurable % on top of the actual material cost
  const matMarkup = (cbSettings.materialMarkup || 0) / 100;
  matCost = matCost * (1 + matMarkup);

  // Use override if set
  const finalMatCost = (line.matCostOverride !== null && line.matCostOverride !== undefined) ? line.matCostOverride : matCost;

  // Auto labour estimate (hours) — power-law on every component except per-unit shelf/partition.
  /** @type {any} */
  const lt = cbSettings.labourTimes || {};
  let autoLabour = 0;
  const volume = W * H * D;
  const carcassRefH = _typeRefHours(cbSettings.carcassTypes, line.carcassType) || lt.carcassRefHours || 0.4;
  autoLabour += carcassRefH * Math.pow(volume / CARCASS_REF_VOLUME, LABOUR_EXPONENT);
  if (line.doors > 0 && doorTotalArea > 0) {
    const doorRefH = _typeRefHours(cbSettings.doorTypes, line.doorType) || lt.door || 0.4;
    autoLabour += doorRefH * Math.pow(doorTotalArea / DOOR_REF_AREA, LABOUR_EXPONENT);
  }
  if (line.drawers > 0 && drawerFrontTotalArea > 0) {
    const drwFrontRefH = _typeRefHours(cbSettings.drawerFrontTypes, line.drawerFrontType) || 0.3;
    autoLabour += drwFrontRefH * Math.pow(drawerFrontTotalArea / DRAWER_FRONT_REF_AREA, LABOUR_EXPONENT);
    const drwBoxVol = innerW * D * drwH * line.drawers;
    if (drwBoxVol > 0) {
      const drwBoxRefH = _typeRefHours(cbSettings.drawerBoxTypes, line.drawerBoxType) || 0.8;
      autoLabour += drwBoxRefH * Math.pow(drwBoxVol / DRAWER_BOX_REF_VOLUME, LABOUR_EXPONENT);
    }
  }
  autoLabour += (cbSettings.baseTypes||[]).find(/** @param {any} b */ b => b.name === line.baseType)?.refHours || 0;  // base/plinth fabrication
  autoLabour += (line.shelves || 0) * (lt.fixedShelf || 0.3);
  autoLabour += (line.adjShelves || 0) * (lt.adjShelfHoles || 0.4);
  autoLabour += (line.looseShelves || 0) * (lt.looseShelf || 0.2);
  autoLabour += (line.partitions || 0) * (lt.partition || 0.5);
  autoLabour += (line.endPanels || 0) * (lt.endPanel || 0.3);
  autoLabour += _epLine.hrs;  // custom extra panels (qty × hrs)
  // Packaging + installation — per-cabinet packing/wrapping and on-site install
  // time (cbSettings.packagingHours / cbSettings.installationHours, set in
  // My Rates → Core Rates). Billable like the other labour times: flow into
  // labourCost (price) and labourHrs (schedule), subject to the contingency
  // multiplier below. Per cabinet, so they scale with qty.
  autoLabour += cbSettings.packagingHours || 0;
  autoLabour += cbSettings.installationHours || 0;
  const surfaceArea = 2*H*D + 2*innerW*D + W*H;
  autoLabour += surfaceArea * (lt.finishPerM2 || 0.5);

  // Contingency: multiplies the auto-computed labour so both labourHrs AND
  // labourCost reflect the user's chosen %. User-overridden labourHrs are
  // taken as-is (the user already accounts for contingency themselves).
  autoLabour *= _contingencyMult();

  const labourHrs = line.labourOverride ? line.labourHrs : autoLabour;
  const labourCost = labourHrs * cbSettings.labourRate;

  // Hardware — sum across all five scopes (cabinet/door/drawer/shelf/
  // drawer-front). No auto hinges/slides. Keep in lock-step with
  // _shared/costing.ts hwCost (npm run test:costing parity).
  /** @param {any[]} list */
  const hwSum = (list) => (Array.isArray(list) ? list : []).reduce((s, hw) => s + hwp(hw.name) * hw.qty, 0);
  const hwCost = hwSum(line.hwItems) + hwSum(line.doorHwItems) + hwSum(line.drawerHwItems) + hwSum(line.shelfHwItems) + hwSum(line.drawerFrontHwItems);

  const lineSubtotal = (finalMatCost + labourCost + hwCost) * line.qty;

  return {
    matCost: finalMatCost, matCostAuto: matCost,
    labourHrs, labourHrsAuto: autoLabour, labourCost,
    hwCost, lineSubtotal,
    qty: line.qty
  };
}

/** @param {any} cab */
function _cabinetPartCount(cab) {
  let n = 4;
  if (cab.backMat) n++;
  n += (cab.doors || 0);
  n += (cab.drawers || 0) * 2;
  n += (cab.shelves || 0) + (cab.adjShelves || 0) + (cab.looseShelves || 0);
  n += (cab.partitions || 0) + (cab.endPanels || 0);
  n += _extraPanelCount(cab);
  return n;
}

/** @param {any} cab */
function _cabinetPartsList(cab) {
  const W = cab.w, H = cab.h, D = cab.d;
  const T = 18;
  const iW = Math.max(0, W - 2*T);
  const mat = cab.material || '';
  const backMat = cab.backMat || mat;
  const name = cab._libName || cab.name || 'Cabinet';
  /** @type {Array<{label: string, w: number, h: number, qty: number, grain: string}>} */
  const parts = [];
  /** @param {string} label @param {number} w @param {number} h @param {number} qty */
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
  // Custom extra panels — one cut-list row per type with a quantity, sized by basis.
  const epMap = cab.extraPanels || {};
  for (const t of (cbSettings.extraPanelTypes || [])) {
    const q = parseFloat(epMap[t.id]) || 0;
    if (q > 0) { const dim = _extraPanelCutDims(t.basis, W, H, D, iW, T); add(name + ' — ' + (t.name || 'Panel'), dim.w, dim.h, q); }
  }
  return parts;
}
