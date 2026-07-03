// Wiki clip: Build & Price a Cabinet (~30s on screen).
// Story: Cabinet tab → pick a quote (cabinets load priced) → open a cabinet
// in the builder → change its width → the live price updates.
// Assumes scripts/seed_wiki_account.sql has run.

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

const WIDTH_INPUT = '#cb-sidebar-builder .form-group:has(label:has-text("Width")) input';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Cabinet tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Cabinet"]');
  await settle(page);

  // 2. Pick a quote — its cabinets load in the main pane, priced live.
  await page.waitForSelector('#cb-results .quote-card');
  await clickThrough(page, '#cb-results .quote-card');
  await page.waitForSelector('#cb-results .cb-cab-card');
  await settle(page, 600);

  // 3. Open a cabinet card — its full spec loads into the builder sidebar.
  await clickThrough(page, '#cb-results .cb-cab-card');
  await page.waitForSelector(WIDTH_INPUT);
  await settle(page, 800);

  // 4. Change the width; onchange re-costs the cabinet.
  await typeHuman(page, WIDTH_INPUT, '800', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 900);

  // 5. The cabinet card shows the new price — glide over the breakdown.
  await glideTo(page, '#cb-results .cb-cab-card');
  await settle(page, 2200);
}
