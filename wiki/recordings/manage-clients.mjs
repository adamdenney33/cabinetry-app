// Wiki clip: Manage Clients (~28s on screen).
// Assumes scripts/seed_wiki_account.sql has run: "Harrington Manor" exists
// with a quote (QUO-0003) and an order (ORD-0003), so its card shows real
// job history. Read-only — opens the client and tours their record.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Clients tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Clients"]');
  await page.waitForSelector('.client-card');
  await settle(page, 800);

  // 2. Open Harrington Manor — details + job history load.
  await clickThrough(page, '.client-card:has-text("Harrington Manor")');
  await settle(page, 900);

  // 3. Their quotes hang off the record…
  await glideTo(page, '.cc-section:has-text("Quotes")');
  await settle(page, 1300);

  // 4. …and so do their orders.
  await glideTo(page, '.cc-section:has-text("Orders")');
  await settle(page, 1300);

  // 5. End on the full client card — contact details + history in one place.
  await glideTo(page, '.client-card:has-text("Harrington Manor")');
  await settle(page, 2200);
}
