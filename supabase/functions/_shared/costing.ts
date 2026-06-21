// ProCabinet — server-side cabinet costing (Deno port of the browser engine).
//
// This is a FAITHFUL port of the geometry→cost math in `src/cabinet-calc.js`
// (`calcCBLine`), the row→line mapping in `src/migrate.js` (`_quoteLineRowToCB`),
// and the customer-price wrapper in `src/share.js` (`_shareLineCustomerPrice`
// + `_lineSubtotal`'s cabinet branch). It exists so `quote-public-update` can
// re-price a customer's spec edit on the public page EXACTLY as the maker's
// browser would, for the "auto-accept edits" mode.
//
// CRITICAL: these prices become real Stripe charges. This file must stay in
// lock-step with the browser engine — `costing.test.ts` asserts parity against
// golden values captured from the live browser engine. If you change cabinet
// pricing in `src/cabinet-calc.js`, change it here too and regenerate the test.
//
// Price RESOLUTION (stock-first material/hardware/finish lookups) is NOT
// duplicated here — the browser resolves every price into a flat `rate_card`
// snapshot (`_buildRateCard` in share.js) and we read from those maps. Only the
// pure geometry/labour math lives in both places.

// ── Reference geometry constants (fixed across all users) ──
const T = 0.018;                       // sheet thickness (m)
const LABOUR_EXPONENT = 0.7;
const CARCASS_REF_VOLUME = 0.25;       // m³
const DOOR_REF_AREA = 0.216;           // m²
const DRAWER_FRONT_REF_AREA = 0.1296;  // m²
const DRAWER_BOX_REF_VOLUME = 0.07517; // m³

export interface RateCard {
  v?: number;
  matPerM2: Record<string, number>;
  hwUnit: Record<string, number>;
  finishPerM2: Record<string, number>;
  labourRate: number;
  materialMarkup: number;
  edgingPerM: number;
  contingencyPct: number;
  packagingHours: number;
  installationHours: number;
  labourTimes: Record<string, number>;
  constructions: Array<{ name: string; price?: number }>;
  baseTypes: Array<{ name: string; refHours?: number }>;
  carcassTypes: Array<{ name: string; refHours?: number }>;
  doorTypes: Array<{ name: string; refHours?: number }>;
  drawerFrontTypes: Array<{ name: string; refHours?: number }>;
  drawerBoxTypes: Array<{ name: string; refHours?: number }>;
  extraPanelTypes: Array<{ id: string; name?: string; hrs?: number; basis?: string }>;
  markup: number;
  discount: number;
  stock_markup: number;
}

type Row = Record<string, any>;
type CBLine = Record<string, any>;

// Mirrors cabinet-calc.js _typeRefHours: exact-name match, else FIRST entry
// (the calculator treats the first type as the default), else 0.
function typeRefHours(list: Array<{ name: string; refHours?: number }> | undefined, name: string): number {
  if (!Array.isArray(list) || !list.length) return 0;
  return (list.find((t) => t.name === name) || list[0])?.refHours ?? 0;
}

// Mirrors cabinet-calc.js _extraPanelArea.
function extraPanelArea(basis: string, innerW: number, W: number, H: number, D: number): number {
  if (basis === 'WD') return innerW * (D - T);
  if (basis === 'WH') return W * H;
  return H * D; // 'HD' (default)
}

// Mirrors cabinet-calc.js _extraPanelTotals.
function extraPanelTotals(
  line: CBLine, innerW: number, W: number, H: number, D: number, matPricePerM2: number, rc: RateCard,
): { matRaw: number; hrs: number } {
  const map = line.extraPanels || {};
  let matRaw = 0, hrs = 0;
  for (const t of (rc.extraPanelTypes || [])) {
    const qty = parseFloat(map[t.id]) || 0;
    if (!qty) continue;
    matRaw += qty * extraPanelArea(t.basis || 'HD', innerW, W, H, D) * matPricePerM2;
    hrs += qty * (parseFloat(String(t.hrs)) || 0);
  }
  return { matRaw, hrs };
}

/**
 * Map a `quote_lines` DB row to the cabinet-line shape the engine expects.
 * Faithful port of `_quoteLineRowToCB` (src/migrate.js). Note it deliberately
 * does NOT map `extraPanels` — matching the browser, where custom panels do not
 * flow into the customer price.
 */
export function quoteLineRowToCB(row: Row): CBLine {
  return {
    name: row.name || '',
    type: row.type || null,
    room: row.room || null,
    w: parseFloat(row.w_mm) || 0,
    h: parseFloat(row.h_mm) || 0,
    d: parseFloat(row.d_mm) || 0,
    qty: parseInt(row.qty, 10) || 1,
    material: row.material || null,
    backMat: row.material || null,
    doorMat: row.door_material || row.material || null,
    doorType: row.door_type || null,
    finish: row.finish || null,
    doorFinish: row.door_finish || null,
    drawerFrontFinish: row.drawer_front_finish || null,
    drawerBoxFinish: row.drawer_box_finish || null,
    construction: row.construction || null,
    baseType: row.base_type || null,
    carcassType: row.carcass_type || null,
    doors: parseInt(row.door_count, 10) || 0,
    doorPct: row.door_pct != null ? parseFloat(row.door_pct) : null,
    doorHandle: row.door_handle || null,
    drawers: parseInt(row.drawer_count, 10) || 0,
    drawerPct: row.drawer_pct != null ? parseFloat(row.drawer_pct) : null,
    drawerFrontMat: row.drawer_front_material || null,
    drawerFrontType: row.drawer_front_type || null,
    drawerBoxType: row.drawer_box_type || null,
    drawerInnerMat: row.drawer_inner_material || null,
    shelves: parseInt(row.fixed_shelves, 10) || 0,
    adjShelves: parseInt(row.adj_shelves, 10) || 0,
    looseShelves: parseInt(row.loose_shelves, 10) || 0,
    partitions: parseInt(row.partitions, 10) || 0,
    endPanels: parseInt(row.end_panels, 10) || 0,
    labourHrs: parseFloat(row.labour_hours) || 0,
    labourOverride: !!row.labour_override,
    matCostOverride: row.material_cost_override != null ? parseFloat(row.material_cost_override) : null,
    hwItems: Array.isArray(row.hardware) ? row.hardware : [],
    doorHwItems: Array.isArray(row.door_hardware) ? row.door_hardware : [],
    drawerHwItems: Array.isArray(row.drawer_hardware) ? row.drawer_hardware : [],
    extras: row.extras || [],
    notes: row.notes || '',
  };
}

/**
 * Per-unit material / labour / hardware cost for one cabinet line. Faithful port
 * of `calcCBLine` (src/cabinet-calc.js) — same statement order, same fallbacks —
 * with the stock-first `mp`/`hwp`/`_finishPricePerM2` replaced by `rate_card`
 * lookups (`mp` → matPerM2, `hwp` → hwUnit, finish → finishPerM2; 'None'/empty → 0).
 */
export function calcCabinetLine(line: CBLine, rc: RateCard): { matCost: number; labourCost: number; hwCost: number } {
  const W = line.w / 1000, H = line.h / 1000, D = line.d / 1000;
  const innerW = Math.max(0, W - 2 * T);

  const mp = (name: string | null | undefined): number => (name != null ? (rc.matPerM2[name] ?? 0) : 0);
  const hwp = (name: string | null | undefined): number => (name != null ? (rc.hwUnit[name] ?? 0) : 0);
  const fp = (name: string | null | undefined): number => (!name || name === 'None' ? 0 : (rc.finishPerM2[name] ?? 0));

  // Auto material cost: carcass panels
  let matCost = 0;
  matCost += 2 * H * D * mp(line.material);
  matCost += 2 * innerW * D * mp(line.material);
  matCost += W * H * mp(line.backMat);
  // Doors: doorPct = % of FRONT FACE AREA taken by doors
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
  // Shelves (fixed + adjustable + loose, cut from carcass material)
  const shelfArea = innerW * (D - T);
  matCost += ((line.shelves || 0) + (line.adjShelves || 0) + (line.looseShelves || 0)) * shelfArea * mp(line.material);
  // Partitions + end panels (full H×D panels)
  matCost += ((line.partitions || 0) + (line.endPanels || 0)) * H * D * mp(line.material);
  // Custom extra panels — material (labour added below)
  const epLine = extraPanelTotals(line, innerW, W, H, D, mp(line.material), rc);
  matCost += epLine.matRaw;

  // Finishing cost — per-component, fall back to line.finish for legacy data.
  const carcassSurfArea = 2 * H * D + 2 * innerW * D + W * H;
  matCost += carcassSurfArea * fp(line.finish);
  if (line.doors > 0) matCost += doorTotalArea * fp(line.doorFinish || line.finish);
  if (line.drawers > 0) matCost += drawerFrontTotalArea * fp(line.drawerFrontFinish || line.finish);
  if (line.drawers > 0) matCost += drawerBoxSurfArea * fp(line.drawerBoxFinish || line.finish);

  // Extras cost
  const extrasCost = (line.extras || []).reduce(
    (s: number, e: any) => s + (parseFloat(e.cost) || 0) * (parseInt(e.qty) || 1), 0);
  matCost += extrasCost;

  // Edge banding
  const edgingLength = 2 * H + 2 * innerW + ((line.shelves || 0) + (line.adjShelves || 0) + (line.looseShelves || 0)) * innerW;
  matCost += edgingLength * (rc.edgingPerM || 0);

  // Construction type cost
  const frontArea = W * H;
  const constPrice = (rc.constructions || []).find((c) => c.name === line.construction)?.price || 0;
  matCost += constPrice * frontArea;

  // Material markup
  const matMarkup = (rc.materialMarkup || 0) / 100;
  matCost = matCost * (1 + matMarkup);

  // Use override if set
  const finalMatCost = (line.matCostOverride !== null && line.matCostOverride !== undefined) ? line.matCostOverride : matCost;

  // Auto labour estimate (hours) — power-law on volume/area.
  const lt = rc.labourTimes || {};
  let autoLabour = 0;
  const volume = W * H * D;
  const carcassRefH = typeRefHours(rc.carcassTypes, line.carcassType) || lt.carcassRefHours || 0.4;
  autoLabour += carcassRefH * Math.pow(volume / CARCASS_REF_VOLUME, LABOUR_EXPONENT);
  if (line.doors > 0 && doorTotalArea > 0) {
    const doorRefH = typeRefHours(rc.doorTypes, line.doorType) || lt.door || 0.4;
    autoLabour += doorRefH * Math.pow(doorTotalArea / DOOR_REF_AREA, LABOUR_EXPONENT);
  }
  if (line.drawers > 0 && drawerFrontTotalArea > 0) {
    const drwFrontRefH = typeRefHours(rc.drawerFrontTypes, line.drawerFrontType) || 0.3;
    autoLabour += drwFrontRefH * Math.pow(drawerFrontTotalArea / DRAWER_FRONT_REF_AREA, LABOUR_EXPONENT);
    const drwBoxVol = innerW * D * drwH * line.drawers;
    if (drwBoxVol > 0) {
      const drwBoxRefH = typeRefHours(rc.drawerBoxTypes, line.drawerBoxType) || 0.8;
      autoLabour += drwBoxRefH * Math.pow(drwBoxVol / DRAWER_BOX_REF_VOLUME, LABOUR_EXPONENT);
    }
  }
  autoLabour += (rc.baseTypes || []).find((b) => b.name === line.baseType)?.refHours || 0;
  autoLabour += (line.shelves || 0) * (lt.fixedShelf || 0.3);
  autoLabour += (line.adjShelves || 0) * (lt.adjShelfHoles || 0.4);
  autoLabour += (line.looseShelves || 0) * (lt.looseShelf || 0.2);
  autoLabour += (line.partitions || 0) * (lt.partition || 0.5);
  autoLabour += (line.endPanels || 0) * (lt.endPanel || 0.3);
  autoLabour += epLine.hrs;
  autoLabour += rc.packagingHours || 0;
  autoLabour += rc.installationHours || 0;
  const surfaceArea = 2 * H * D + 2 * innerW * D + W * H;
  autoLabour += surfaceArea * (lt.finishPerM2 || 0.5);

  // Contingency multiplier (mirrors _contingencyMult)
  autoLabour *= 1 + (rc.contingencyPct || 0) / 100;

  const labourHrs = line.labourOverride ? line.labourHrs : autoLabour;
  const labourCost = labourHrs * rc.labourRate;

  // Hardware — sum across cabinet/door/drawer scopes.
  const hwSum = (list: any[]): number => (Array.isArray(list) ? list : []).reduce((s, hw) => s + hwp(hw.name) * hw.qty, 0);
  const hwCost = hwSum(line.hwItems) + hwSum(line.doorHwItems) + hwSum(line.drawerHwItems);

  return { matCost: finalMatCost, labourCost, hwCost };
}

/**
 * Whether the snapshot prices EVERY rate this line references. A non-empty
 * material / finish / hardware name that isn't a key in the snapshot means the
 * maker added it after the snapshot was written — pricing it would silently
 * use £0 and UNDER-charge. ('None'/empty resolve to £0 legitimately and count
 * as covered.) When false, the caller falls back to "Price to confirm".
 */
function coversLine(cb: CBLine, rc: RateCard): boolean {
  const matOk = (n: any) => !n || (n in rc.matPerM2);
  const finOk = (n: any) => !n || n === 'None' || (n in rc.finishPerM2);
  const hwOk = (list: any[]) => (Array.isArray(list) ? list : []).every((h) => !h || !h.name || (h.name in rc.hwUnit));
  return matOk(cb.material) && matOk(cb.backMat) && matOk(cb.doorMat) && matOk(cb.drawerFrontMat) && matOk(cb.drawerInnerMat)
    && finOk(cb.finish) && finOk(cb.doorFinish) && finOk(cb.drawerFrontFinish) && finOk(cb.drawerBoxFinish)
    && hwOk(cb.hwItems) && hwOk(cb.doorHwItems) && hwOk(cb.drawerHwItems);
}

/**
 * The customer-facing price for ONE cabinet line — what the browser stores as
 * `quote_lines.customer_price`. Faithful port of `_shareLineCustomerPrice` over
 * `_lineSubtotal`'s cabinet branch: per-unit cost × qty × per-line discount,
 * then the quote-level markup and discount, rounded to 2dp. Pre-tax (the public
 * page adds tax). Returns null for a non-cabinet row OR when the snapshot
 * doesn't cover every rate the line references (caller → "Price to confirm").
 */
export function priceCabinetLine(row: Row, rc: RateCard): number | null {
  if ((row.line_kind || 'cabinet') !== 'cabinet') return null;
  const cb = quoteLineRowToCB(row);
  if (!coversLine(cb, rc)) return null; // stale snapshot missing a referenced rate — don't under-charge
  const c = calcCabinetLine(cb, rc);
  const qty = cb.qty || 1;
  const discMult = 1 - (parseFloat(row.discount) || 0) / 100; // per-line discount
  const materials = (c.matCost + c.hwCost) * qty * discMult;
  const labour = c.labourCost * qty * discMult;
  const base = materials + labour;
  const marked = base * (1 + (Number(rc.markup) || 0) / 100) * (1 - (Number(rc.discount) || 0) / 100);
  return Math.round(marked * 100) / 100;
}
