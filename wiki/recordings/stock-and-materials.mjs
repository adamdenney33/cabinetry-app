// Wiki clip: Track Stock & Materials (~30s on screen).
// Assumes scripts/seed_wiki_account.sql has run: "18mm Birch Plywood" exists
// as a stock item. Reads the stock list, opens an existing material card,
// updates the quantity on camera, then glides over the low-stock indicator.
// No writes after setup — the seed reset is clean.

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Stock tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Stock"]');
  await settle(page);

  // 2. Wait for stock cards to render and glide to the first card visible.
  // The cards are rendered in a table inside .stock-sheet-wrap with rows
  // that have class "stock-row". The reference item "18mm Birch Plywood" is
  // seeded in the account.
  await page.waitForSelector('.stock-row', { timeout: 10_000 });
  await settle(page, 600);

  // 3. Find and click the "18mm Birch Plywood" stock item. The card is a <tr>
  // with text "18mm Birch Plywood"; clicking it opens the editor.
  await clickThrough(page, '.stock-row:has-text("18mm Birch Plywood")');
  await page.waitForSelector('#stock-qty', { timeout: 5_000 });
  await settle(page, 800);

  // 4. Update the quantity field on camera. The Qty field is #stock-qty.
  // Note: this field may need clearing first (flag in risks).
  // Glide to the field so it's visible on screen.
  await glideTo(page, '#stock-qty');
  await settle(page, 400);
  // Click to select, clear the field, and type a new value.
  await typeHuman(page, '#stock-qty', '15', { clear: true });
  await settle(page, 600);

  // 5. Glide over the low-stock indicator / low alert field to show the
  // threshold. The #stock-low field is the "Low Alert" input.
  await glideTo(page, '#stock-low');
  await settle(page, 1000);

  // 6. Final beat: pan back to show the full editor sidebar with updated qty
  // and low-alert fields in view. Settle on the money shot.
  await glideTo(page, '#stock-form-section', { steps: 20 });
  await settle(page, 1500);
}
