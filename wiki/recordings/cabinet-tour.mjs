// Ad take: the whole CABINET chapter in ONE continuous recording —
// full My Rates editor tour (scroll + two rate edits) → full Cabinet Builder
// editor tour (dims edits, door/drawer steppers, scroll to the bottom) →
// Stock editor. Assumes the seed has run.

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

const WIDTH_INPUT = '#cb-cab-editor .cb-rc-dims input[title="Width"]';
const HEIGHT_INPUT = '#cb-cab-editor .cb-rc-dims input[title="Height"]';

/** Wheel-scroll whatever is under the cursor (the sidebar), gently. */
async function wheel(page, dy, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(90);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // — My Rates: tour the whole editor, editing as we go —
  await clickThrough(page, '.nav-tab[title="Cabinet"]');
  await settle(page, 800);
  // The tab restores the last session's state (picked quote and/or the My
  // Rates sub-tab). Normalise: force the Builder sub-tab, then pick a quote
  // only if the picker is showing.
  await clickThrough(page, '#cab-tab-builder').catch(() => {});
  await settle(page, 500);
  const picker = await page.$('#cb-results .quote-card:visible');
  if (picker) {
    await clickThrough(page, '#cb-results .quote-card');
  }
  await page.waitForSelector('#cb-results .cb-li-row:visible', { timeout: 15_000 });
  await settle(page, 500);
  await clickThrough(page, '#cab-tab-rates');
  await page.waitForSelector('#cb-rates-content .cb-mat-row input[type="number"]');
  await settle(page, 600);
  // labour rate
  await typeHuman(page, '#cb-rates-content .cb-mat-row input[type="number"]', '65', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 700);
  // a second core rate further down (quote markup row)
  await typeHuman(page, '#cb-rates-content .cb-mat-row input[type="number"] >> nth=2', '22', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 700);
  // scroll the rest of the rates editor into view — carcass, panels, doors…
  await glideTo(page, '#cb-rates-content');
  await wheel(page, 420);
  await settle(page, 900);
  await wheel(page, 480);
  await settle(page, 1000);
  // …and the re-priced results
  await glideTo(page, '#cb-results .cb-li-row');
  await settle(page, 1200);

  // — Cabinet Builder: open a cabinet, tour the full spec editor —
  await clickThrough(page, '#cab-tab-builder');
  await page.waitForSelector('#cb-results .cb-li-row');
  await settle(page, 400);
  await clickThrough(page, '#cb-results .cb-li-row .cb-col-name');
  await page.waitForSelector(WIDTH_INPUT);
  await settle(page, 600);
  await typeHuman(page, WIDTH_INPUT, '800', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 600);
  await typeHuman(page, HEIGHT_INPUT, '750', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 700);
  // scroll to the doors section and add a door
  await glideTo(page, '#cb-cab-editor');
  await wheel(page, 380);
  await settle(page, 500);
  await clickThrough(page, `#cb-cab-editor button[onclick="cbStepField('doors',1)"]`);
  await settle(page, 800);
  // scroll on: drawers — add one
  await wheel(page, 380);
  await settle(page, 500);
  await clickThrough(page, `#cb-cab-editor button[onclick="cbStepField('drawers',1)"]`);
  await settle(page, 800);
  // scroll to the bottom of the editor (hardware / finish sections)
  await wheel(page, 550);
  await settle(page, 1100);
  // the re-priced line
  await glideTo(page, '#cb-results .cb-li-row.editing');
  await settle(page, 1200);

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
  await settle(page, 1500);
}
