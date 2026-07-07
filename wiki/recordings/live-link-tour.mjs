// Ad clip: quote sidebar editor → Live link controls → the ACTUAL customer
// page (navigates to the /q share URL in the same recorded page).
// Assumes seed has run; QUO-0001 (Smith) carries cabinet lines.
// Turns ON "customers choose items" (default) + "request changes", marks the
// first line Optional and unlocks its specs, so the customer page shows the
// Optional checkbox and Edit chips.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Quotes tab → open QUO-0001 in the sidebar editor.
  await clickThrough(page, '.nav-tab[title="Quotes"]');
  await page.waitForSelector('#panel-quote .quote-card');
  await settle(page, 500);
  await clickThrough(page, '#panel-quote .quote-card:has-text("Smith")');
  await page.waitForSelector('#pq-lines-table', { timeout: 10_000 });
  await settle(page, 700);

  // 2. The sidebar editor beat: line items, pricing, totals.
  await glideTo(page, '#pq-lines-table');
  await settle(page, 1600);
  await glideTo(page, '#pq-totals');
  await settle(page, 1400);

  // 3. Live link tab — link generates on entry.
  await clickThrough(page, '#ql-tab-live');
  await page.waitForSelector('#share-link', { timeout: 15_000 });
  await settle(page, 900);

  // 4. Turn on "Accept online payment" (Stripe Connect must be live on the
  //    recording account) and "Let customers request changes".
  const payOn = await page.$eval('#sh-pay', (el) => el.getAttribute('aria-pressed') === 'true').catch(() => null);
  if (payOn === null) throw new Error('sh-pay toggle not rendered — Stripe Connect not live on this account');
  if (!payOn) {
    await clickThrough(page, '#sh-pay');
    await settle(page, 700);
  }
  const editOn = await page.$eval('#sh-edit', (el) => el.getAttribute('aria-pressed') === 'true').catch(() => false);
  if (!editOn) {
    await clickThrough(page, '#sh-edit');
    await settle(page, 700);
  }

  // 5. Mark the first line Optional + unlock all its specs.
  await clickThrough(page, '.ll-line .ll-opt input');
  await settle(page, 500);
  await clickThrough(page, '.ll-line .ll-spec-caret');
  await settle(page, 500);
  await clickThrough(page, '.ll-spec-all a:has-text("All on")');
  await settle(page, 1400); // autosave

  // 6. Go to the ACTUAL customer page (same tab, so it's recorded).
  const url = await page.$eval('#share-link', (el) => (el.textContent || '').trim());
  if (!url.startsWith('http')) throw new Error(`share link not ready: "${url}"`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.qp-chip.edit', { timeout: 20_000 });
  await settle(page, 1200);

  // 7. Customer view: scroll the quote, open a spec editor via an Edit chip.
  await glideTo(page, '.qp-chip.edit');
  await settle(page, 600);
  await clickThrough(page, '.qp-chip.edit');
  await settle(page, 1400);
  await page.mouse.wheel(0, 420);
  await settle(page, 1200);

  // 8. The money ending: hit "Accept & pay deposit" — quote-pay creates a
  //    PaymentIntent on the connected account and the Stripe Payment Element
  //    sheet opens. We do NOT click Pay — just hold on the checkout.
  await glideTo(page, '.qpd-b.dark');
  await settle(page, 500);
  await clickThrough(page, '.qpd-b.dark');
  await page.waitForSelector('#qp-pay-el iframe', { timeout: 25_000 });
  await settle(page, 3200); // Stripe element paints inside its iframe
}
