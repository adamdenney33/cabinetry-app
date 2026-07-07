// Ad clip: the auto-schedule controls in the ORDER sidebar editor.
// Assumes scripts/seed_wiki_account.sql has run (ORD-0001..0005 exist).
// Opens an order, expands the Schedule section, steps the priority and
// reveals the hours override — the inputs that drive auto-scheduling.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Orders tab → open a seeded order in the sidebar editor.
  await clickThrough(page, '.nav-tab[title="Orders"]');
  await page.waitForSelector('#panel-orders .order-card', { timeout: 10_000 });
  await settle(page, 600);
  await clickThrough(page, '#panel-orders .order-card:has-text("Greenwood")');
  await page.waitForSelector('#po-sched-details', { timeout: 10_000 });
  await settle(page, 700);

  // 2. Expand the Schedule section (skip if the app restored it open).
  const open = await page.$eval('#po-sched-details', (el) => el.hasAttribute('open')).catch(() => false);
  if (!open) {
    await clickThrough(page, '#po-sched-details summary');
  }
  await page.waitForSelector('#po-priority', { timeout: 8_000 });
  await settle(page, 800);

  // 3. Step the priority up twice — the sched summary re-renders live.
  await clickThrough(page, '#po-priority-wrap .step-btn[aria-label="Increase"]');
  await settle(page, 700);
  await clickThrough(page, '#po-priority-wrap .step-btn[aria-label="Increase"]');
  await settle(page, 1000);

  // 4. Reveal the hours override — the Allocated field appears.
  await clickThrough(page, '#po-hours-override');
  await settle(page, 1200);

  // 5. Hold on the schedule block: toggles, priority, hours, start/due dates.
  await glideTo(page, '#po-sched-details');
  await settle(page, 2200);
}
