// Parity test for the server-side cabinet costing port (costing.ts).
//
// The GOLDEN fixture below was captured from the LIVE browser engine
// (`_shareLineCustomerPrice` over `calcCBLine`) against a real account's rate
// card — see PLAN.md "Live link — auto-accept edits". This test asserts the
// Deno port reproduces those customer prices to the penny. If you change cabinet
// pricing in src/cabinet-calc.js, re-capture the fixture (instructions below)
// and update it here, or the two engines have drifted.
//
// Run:  node --test supabase/functions/_shared/costing.test.mjs
// (Node ≥ 23.6 strips the types in the imported .ts automatically.)
//
// Re-capture the fixture: in the running app's preview console, run the snippet
// in PLAN.md / the LR.4 commit, then paste its JSON output into FIXTURE below.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceCabinetLine } from './costing.ts';

const FIXTURE = {
  "q": { "markup": 20, "discount": 10, "stock_markup": 0 },
  "rateCard": {
    "v": 1,
    "matPerM2": {
      "Birch Ply 18mm": 24.18704649287826, "Birch Ply 12mm": 19.484009674818598,
      "Birch Ply 6mm": 14.109110454178985, "Melamine 16mm": 15.116904058048911,
      "MDF 18mm": 12.765385649019082, "Hardwood Edging": 8.398280032249396,
      "Plywood 3mm (backs)": 7.390486428379468, "Solid Oak 20mm": 36.95243214189734,
      "None": 0, "Oil (Osmo/Rubio)": 0, "Lacquer": 0, "Paint": 0
    },
    "hwUnit": {
      "Blum Hinges (pair)": 12, "Soft-close Slides (pair)": 24, "Handle - Bar": 8,
      "Shelf Pins (set)": 3,
      "Birch Ply 18mm": 0, "Solid Oak 20mm": 0, "None": 0
    },
    "finishPerM2": {
      "None": 0, "Oil (Osmo/Rubio)": 12, "Lacquer": 18, "Paint": 22, "Stain + Oil": 15,
      "Wax": 8, "2-Pack Spray": 35, "Birch Ply 18mm": 0, "Solid Oak 20mm": 0
    },
    "labourRate": 50, "materialMarkup": 0, "edgingPerM": 0, "contingencyPct": 5,
    "packagingHours": 0, "installationHours": 0,
    "labourTimes": {
      "carcass": 1.5, "door": 0.4, "drawer": 0.6, "shelf": 0.25, "finishPerM2": 0.5,
      "carcassRefVolume": 0.25, "carcassRefHours": 0.4, "carcassExponent": 0.7,
      "fixedShelf": 0.3, "adjShelfHoles": 0.4, "looseShelf": 0.2, "partition": 0.5, "endPanel": 0.3
    },
    "constructions": [{ "name": "Overlay", "price": 0 }, { "name": "Inset", "price": 25 }, { "name": "Face Frame", "price": 35 }],
    "baseTypes": [{ "name": "None", "refHours": 0 }, { "name": "Plinth", "refHours": 0.3 }, { "name": "Feet / Legs", "refHours": 0.4 }, { "name": "Castors", "refHours": 0.3 }, { "name": "Frame", "refHours": 2 }],
    "carcassTypes": [{ "name": "Standard", "refHours": 0.4 }],
    "doorTypes": [{ "name": "Slab", "refHours": 0.4 }, { "name": "Shaker", "refHours": 0.7 }, { "name": "Vinyl-Wrapped", "refHours": 0.5 }, { "name": "Integrated Handle", "refHours": 0.6 }],
    "drawerFrontTypes": [{ "name": "Slab", "refHours": 0.3 }, { "name": "Shaker", "refHours": 0.5 }],
    "drawerBoxTypes": [{ "name": "Standard", "refHours": 0.8 }, { "name": "Dovetail", "refHours": 1.2 }],
    "extraPanelTypes": [],
    "markup": 20, "discount": 10, "stock_markup": 0
  },
  "rows": [
    { "line_kind": "cabinet", "qty": 1, "discount": 0, "material": "Birch Ply 18mm", "finish": "None", "id": 1, "name": "Carcass only", "w_mm": 600, "h_mm": 720, "d_mm": 580 },
    { "line_kind": "cabinet", "qty": 1, "discount": 0, "material": "Birch Ply 18mm", "finish": "None", "id": 2, "name": "Two-door base", "w_mm": 800, "h_mm": 720, "d_mm": 580, "door_count": 2, "door_pct": 90, "door_material": "Birch Ply 18mm", "door_finish": "Lacquer", "door_type": "Shaker", "door_handle": "Bar", "hardware": [{ "name": "Blum Hinges (pair)", "qty": 2 }], "door_hardware": [{ "name": "Handle - Bar", "qty": 2 }] },
    { "line_kind": "cabinet", "qty": 1, "discount": 0, "material": "Birch Ply 18mm", "finish": "None", "id": 3, "name": "Drawer bank", "w_mm": 500, "h_mm": 720, "d_mm": 580, "drawer_count": 3, "drawer_pct": 40, "drawer_front_material": "Birch Ply 18mm", "drawer_front_finish": "Paint", "drawer_inner_material": "Birch Ply 12mm", "drawer_box_finish": "None", "drawer_hardware": [{ "name": "Soft-close Slides (pair)", "qty": 3 }] },
    { "line_kind": "cabinet", "qty": 2, "discount": 10, "material": "Birch Ply 18mm", "finish": "Oil (Osmo/Rubio)", "id": 4, "name": "Tall unit", "w_mm": 900, "h_mm": 2100, "d_mm": 600, "fixed_shelves": 3, "adj_shelves": 2, "partitions": 1, "end_panels": 1, "construction": "Inset", "base_type": "Plinth", "extras": [{ "cost": 35.5, "qty": 2 }] },
    { "line_kind": "cabinet", "qty": 1, "discount": 0, "material": "Birch Ply 18mm", "finish": "None", "id": 5, "name": "Dresser", "w_mm": 1200, "h_mm": 900, "d_mm": 450, "door_count": 2, "door_pct": 55, "door_material": "Solid Oak 20mm", "door_finish": "Lacquer", "door_type": "Slab", "drawer_count": 2, "drawer_pct": 30, "drawer_front_material": "Solid Oak 20mm", "drawer_front_finish": "Lacquer", "drawer_inner_material": "Birch Ply 12mm", "fixed_shelves": 1, "construction": "Face Frame", "base_type": "Feet / Legs", "hardware": [{ "name": "Blum Hinges (pair)", "qty": 2 }], "drawer_hardware": [{ "name": "Soft-close Slides (pair)", "qty": 2 }], "shelf_hardware": [{ "name": "Shelf Pins (set)", "qty": 4 }], "drawer_front_hardware": [{ "name": "Handle - Bar", "qty": 2 }] },
    { "line_kind": "cabinet", "qty": 1, "discount": 0, "material": "Birch Ply 18mm", "finish": "None", "id": 6, "name": "Override unit", "w_mm": 700, "h_mm": 720, "d_mm": 580, "labour_override": true, "labour_hours": 9.25, "material_cost_override": 142.4 }
  ],
  "expected": [127.38, 293, 297.13, 1531.12, 643.69, 653.29]
};

test('priceCabinetLine matches the browser engine to the penny', () => {
  FIXTURE.rows.forEach((row, i) => {
    const got = priceCabinetLine(row, FIXTURE.rateCard);
    assert.equal(got, FIXTURE.expected[i],
      `row ${i + 1} "${row.name}": port=${got} browser=${FIXTURE.expected[i]}`);
  });
});

test('priceCabinetLine returns null for non-cabinet rows', () => {
  assert.equal(priceCabinetLine({ line_kind: 'item', unit_price: 50, qty: 1 }, FIXTURE.rateCard), null);
  assert.equal(priceCabinetLine({ line_kind: 'labour', labour_hours: 4 }, FIXTURE.rateCard), null);
});

test('priceCabinetLine falls back to null when the snapshot is missing a rate', () => {
  // Material added by the maker AFTER the snapshot was written → not in matPerM2.
  // Must NOT auto-price (would silently under-charge); caller shows "to confirm".
  const row = { line_kind: 'cabinet', qty: 1, discount: 0, finish: 'None',
    material: 'Walnut 20mm (just added)', w_mm: 600, h_mm: 720, d_mm: 580 };
  assert.equal(priceCabinetLine(row, FIXTURE.rateCard), null);
});
