// Ad clip: change an order's priority in the Schedule sidebar and watch the
// Gantt calendar reflow live. Assumes seed has run (ORD-0001..0005).

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. Schedule tab with the seeded bars on the calendar.
  await clickThrough(page, '.nav-tab[title="Schedule"]');
  await page.waitForSelector('.sched-bar', { timeout: 10_000 });
  await settle(page, 1200);

  // 2. Change priorities on two jobs — each click re-sorts the sidebar and
  //    reflows the calendar bars immediately. (Rows are direct children of
  //    .sched-sidebar-body; :has-text scopes to the right job.)
  const smithUp = '.sched-sidebar-body > div:has-text("Smith") .sched-pri-btn[aria-label="Raise priority"]';
  const harringtonDown = '.sched-sidebar-body > div:has-text("Harrington") .sched-pri-btn[aria-label="Lower priority"]';
  await glideTo(page, '.sched-sidebar-body > div:has-text("Smith")');
  await settle(page, 700);
  await clickThrough(page, smithUp);
  await settle(page, 1400);
  await clickThrough(page, harringtonDown);
  await settle(page, 1700);

  // 3. Hold on the reflowed calendar.
  await glideTo(page, '#schedule-main', { steps: 30 });
  await settle(page, 2400);
}
