// Wiki clip: Generate an Optimised Cut List (~28s on screen).
// Assumes scripts/seed_wiki_account.sql has run: "Smith Kitchen — Bases"
// exists in the library with 1 sheet + 5 pieces. Opens it, hits Optimise,
// ends on the nested sheet layout. No new rows written.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Cut List tab — the library grid renders.
  await clickThrough(page, '.nav-tab[title="Cut List"]');
  await page.waitForSelector('#cl-lib-grid > div[onclick]');
  await settle(page, 700);

  // 2. Open a saved cut list; its sheets + pieces load into the sidebar
  //    (async fetch — give the rows a beat to arrive before optimising).
  await clickThrough(page, '#cl-lib-grid > div[onclick]');
  await page.waitForSelector('#cutlist-name');
  await settle(page, 1500);

  // 3. Show the parts list on the left before the action beat.
  await glideTo(page, '.cl-add-btn:has-text("+ Add part")');
  await settle(page, 900);

  // 4. Hit Optimise — ProCabinet nests everything for minimum waste.
  await clickThrough(page, '#cl-action-bar button');
  await page.waitForSelector('#cl-view-layout', { timeout: 10_000 });
  await page.waitForSelector('#results-area canvas, #results-area svg, #results-area .sheet-diagram', { timeout: 10_000 });
  await settle(page, 800);

  // 5. The nested layout is the money shot — glide across it and hold.
  await glideTo(page, '#results-area', { steps: 34 });
  await settle(page, 2600);
}
