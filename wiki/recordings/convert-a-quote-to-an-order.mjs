// Wiki clip: Convert a Quote to an Order (~25s on screen).
// Assumes scripts/seed_wiki_account.sql has run: QUO-0004 (Cooper & Sons,
// sent) has NO linked order, so its card shows "Create Order" (quotes.js:590,
// no confirm dialog — conversion runs directly and lands on Orders).
// Writes a real order row — the next seed reset wipes it.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

// Scoped to #panel-quote: the Cabinet tab renders its own (hidden)
// .quote-card elements at boot, and an unscoped selector matches those first.
const COOPER_CREATE = '#panel-quote .quote-card:has-text("Cooper") button:has-text("Create Order")';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Quotes tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Quotes"]');
  await page.waitForSelector('#panel-quote .quote-card');
  await settle(page, 800);

  // 2. Find the accepted job — glide over the Cooper card so the viewer
  //    reads it before the action.
  await glideTo(page, '#panel-quote .quote-card:has-text("Cooper")');
  await settle(page, 900);

  // 3. One click: Create Order. Lines, prices and client carry over.
  await clickThrough(page, COOPER_CREATE);

  // 4. The app lands on the Orders tab with the new order in the list.
  //    Scoped to #panel-orders — an unscoped .order-card resolves first to a
  //    hidden card rendered in another panel at boot, and the wait times out.
  await page.waitForSelector('#panel-orders .order-card', { timeout: 15_000 });
  await settle(page, 1000);

  // 5. Glide over the new order's status pipeline, then its value.
  await glideTo(page, '#panel-orders .order-card:has-text("Cooper") .oc-pipeline');
  await settle(page, 1200);
  await glideTo(page, '#panel-orders .order-card:has-text("Cooper")');
  await settle(page, 2000);
}
