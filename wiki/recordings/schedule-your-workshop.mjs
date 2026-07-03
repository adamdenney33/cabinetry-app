// Wiki clip: Schedule Jobs on the Gantt Calendar (~28s on screen).
// Assumes scripts/seed_wiki_account.sql has run: 5 orders (ORD-0001..0005)
// in mixed statuses — active ones render as bars on the Gantt calendar.
// Read-only tour: sidebar job list → bars → Today jump → calendar money shot.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Open the Schedule tab via the real nav.
  await clickThrough(page, '.nav-tab[title="Schedule"]');
  await page.waitForSelector('#schedule-main', { timeout: 10_000 });
  await settle(page, 900);

  // 2. The sidebar lists the jobs in priority order.
  await glideTo(page, '.sched-sidebar-body > div');
  await settle(page, 1100);

  // 3. Glide along an order bar — each coloured bar spans its production days.
  await page.waitForSelector('.sched-bar', { timeout: 8_000 });
  await glideTo(page, '.sched-bar');
  await settle(page, 1300);

  // 4. Jump to today — a real interaction that recentres the calendar.
  await clickThrough(page, '.sched-sidebar-foot button');
  await settle(page, 1200);

  // 5. Money shot: the Gantt calendar with the seeded jobs laid out.
  await glideTo(page, '#schedule-main', { steps: 34 });
  await settle(page, 2400);
}
