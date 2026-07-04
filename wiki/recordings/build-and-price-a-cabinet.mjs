// Wiki clip: Build & Price a Cabinet (~30s on screen).
// Story: Cabinet tab → pick a quote (cabinets load priced in a line table) →
// open a cabinet row (its full spec loads in the editor) → change its width →
// the row re-prices live.
// Assumes scripts/seed_wiki_account.sql has run.

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

// Dims live in the always-open Cabinet card (2026-07-03 spec-cards editor).
const WIDTH_INPUT = '#cb-cab-editor .cb-rc-dims input[title="Width"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Cabinet tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Cabinet"]');
  await settle(page);

  // 2. Pick a quote — its cabinets load in the main pane as a priced line table.
  await page.waitForSelector('#cb-results .quote-card');
  await clickThrough(page, '#cb-results .quote-card');
  await page.waitForSelector('#cb-results .cb-li-row');
  await settle(page, 600);

  // 3. Open a cabinet row — its full spec loads into the builder editor.
  //    Click the NAME cell: the row's qty/actions cells stopPropagation, and
  //    the row centre sits over the qty stepper, so click the name to select.
  await clickThrough(page, '#cb-results .cb-li-row .cb-col-name');
  await page.waitForSelector(WIDTH_INPUT);
  await settle(page, 800);

  // 4. Change the width; onchange re-costs the cabinet.
  await typeHuman(page, WIDTH_INPUT, '800', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 900);

  // 5. The row shows the new price — glide over the edited line.
  await glideTo(page, '#cb-results .cb-li-row.editing');
  await settle(page, 2200);
}
