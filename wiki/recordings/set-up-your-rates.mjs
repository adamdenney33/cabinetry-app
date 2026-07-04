// Wiki clip: Set Up Your Rates (~30s on screen).
// Story: Cabinet tab → open a quote (rates live behind the builder context) →
// My Rates sub-tab → edit the labour rate on camera → the results table re-prices.
// Assumes scripts/seed_wiki_account.sql has run (Smith QUO-0001 has cabinets).

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Cabinet tab — the quote picker renders in the main pane.
  await clickThrough(page, '.nav-tab[title="Cabinet"]');
  await settle(page);

  // 2. Pick a quote; its cabinets load priced (line table) and the sub-tabs appear.
  await page.waitForSelector('#cb-results .quote-card');
  await clickThrough(page, '#cb-results .quote-card');
  await page.waitForSelector('#cb-results .cb-li-row');
  await settle(page, 600);

  // 3. Switch the sidebar to the My Rates sub-tab.
  await clickThrough(page, '#cab-tab-rates');
  await page.waitForSelector('#cb-rates-content .cb-mat-row input[type="number"]');
  await settle(page, 700);

  // 4. Edit the labour rate (first core-rates row). onblur saves + re-prices.
  await typeHuman(page, '#cb-rates-content .cb-mat-row input[type="number"]', '65', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 900);

  // 5. The results table re-prices from the new rate — the money shot.
  await glideTo(page, '#cb-results .cb-li-row');
  await settle(page, 2200);
}
