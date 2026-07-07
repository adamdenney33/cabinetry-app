// Ad take: the whole CABINET chapter in ONE continuous recording —
// My Rates edit → Cabinet Builder spec edit + live re-price → Stock editor.
// Assumes the seed has run (Smith QUO-0001 has cabinets; Birch ply in stock).

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

const WIDTH_INPUT = '#cb-cab-editor .cb-rc-dims input[title="Width"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // — My Rates —
  await clickThrough(page, '.nav-tab[title="Cabinet"]');
  await page.waitForSelector('#cb-results .quote-card');
  await clickThrough(page, '#cb-results .quote-card');
  await page.waitForSelector('#cb-results .cb-li-row');
  await settle(page, 500);
  await clickThrough(page, '#cab-tab-rates');
  await page.waitForSelector('#cb-rates-content .cb-mat-row input[type="number"]');
  await settle(page, 600);
  await typeHuman(page, '#cb-rates-content .cb-mat-row input[type="number"]', '65', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 800);
  await glideTo(page, '#cb-results .cb-li-row');
  await settle(page, 1400);

  // — Cabinet Builder: open a cabinet, edit the spec, watch it re-price —
  await clickThrough(page, '#cab-tab-builder');
  await page.waitForSelector('#cb-results .cb-li-row');
  await settle(page, 400);
  await clickThrough(page, '#cb-results .cb-li-row .cb-col-name');
  await page.waitForSelector(WIDTH_INPUT);
  await settle(page, 700);
  await typeHuman(page, WIDTH_INPUT, '800', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 800);
  await glideTo(page, '#cb-cab-editor');
  await settle(page, 1300);
  await glideTo(page, '#cb-results .cb-li-row.editing');
  await settle(page, 1300);

  // — Stock: the library that feeds the builder —
  await clickThrough(page, '.nav-tab[title="Stock"]');
  await page.waitForSelector('.stock-row', { timeout: 10_000 });
  await settle(page, 500);
  await clickThrough(page, '.stock-row:has-text("18mm Birch Plywood")');
  await page.waitForSelector('#stock-qty', { timeout: 5_000 });
  await settle(page, 600);
  await typeHuman(page, '#stock-qty', '15', { clear: true });
  await settle(page, 500);
  await glideTo(page, '#stock-low');
  await settle(page, 1600);
}
