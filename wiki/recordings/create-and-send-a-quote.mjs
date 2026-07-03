// Wiki clip: Create & Send a Quote (~35s on screen).
// Assumes scripts/seed_wiki_account.sql has run: "Bayside Build Co" exists
// with NO quotes, so picking it lands on the quote editor's sub-gate.
// Writes real rows (a new quote) — the next seed reset wipes them.

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Quotes tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Quotes"]');
  await settle(page);

  // 2. Pick the client through the smart-input (search-as-you-type).
  await typeHuman(page, '#qe-client-picker', 'Bay');
  await page.waitForSelector('#qe-client-suggest .client-suggest-item');
  await settle(page, 500);
  await clickThrough(page, '#qe-client-suggest .client-suggest-item');
  await settle(page);

  // 3. Sub-gate → "+ Add Quote" (client picked, no quote yet).
  await clickThrough(page, '#quote-sub-gate button');
  await page.waitForSelector('#pq-project-name');
  await settle(page, 500);

  // 4. Name the job.
  await typeHuman(page, '#pq-project-name', 'Bayside Utility Room');
  await settle(page, 500);

  // 5. Add an item line and fill it in (the "+ Cabinet" path jumps to the
  //    Cabinet Builder — that story belongs to the build-and-price clip).
  await clickThrough(page, '.cl-add-btn:has-text("+ Item")');
  await page.waitForSelector('#pq-lines-table tbody tr');
  await typeHuman(page, '#pq-lines-table tbody tr:last-child td.col-desc textarea', 'Worktop supply & fit');
  await typeHuman(page, '#pq-lines-table tbody tr:last-child td.col-price input', '480', { clear: true });
  await settle(page, 500);

  // 6. Set the tax — a visible beat of the totals recalculating live.
  await typeHuman(page, '#pq-tax', '20', { clear: true });
  await glideTo(page, '#pq-totals');
  await settle(page, 1400);

  // 7. Finish on the Live link tab — the "send it" beat. Hold until the
  //    customer-facing live preview iframe has actually rendered.
  await clickThrough(page, '#ql-tab-live');
  await page.waitForSelector('.ll-preview-frame', { timeout: 15_000 });
  await settle(page, 4000);
}
