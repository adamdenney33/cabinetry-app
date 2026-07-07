// Ad take: the whole SCHEDULING chapter in ONE continuous recording —
// the order sidebar's Schedule block (auto toggle, priority, hours) → the
// Schedule tab, where priority changes reflow the Gantt calendar live.
// Assumes the seed has run (ORD-0001..0005).

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // — Order sidebar: the schedule block on the order itself —
  await clickThrough(page, '.nav-tab[title="Orders"]');
  await page.waitForSelector('#panel-orders .order-card', { timeout: 10_000 });
  await settle(page, 500);
  await clickThrough(page, '#panel-orders .order-card:has-text("Greenwood")');
  await page.waitForSelector('#po-sched-details', { timeout: 10_000 });
  await settle(page, 600);
  const open = await page.$eval('#po-sched-details', (el) => el.hasAttribute('open')).catch(() => false);
  if (!open) await clickThrough(page, '#po-sched-details summary');
  await page.waitForSelector('#po-priority', { timeout: 8_000 });
  await settle(page, 700);
  await clickThrough(page, '#po-priority-wrap .step-btn[aria-label="Increase"]');
  await settle(page, 600);
  await clickThrough(page, '#po-hours-override');
  await settle(page, 1300);

  // — Schedule tab: priority change reflows the calendar live —
  await clickThrough(page, '.nav-tab[title="Schedule"]');
  await page.waitForSelector('.sched-bar', { timeout: 10_000 });
  await settle(page, 900);
  const smithUp = '.sched-sidebar-body > div:has-text("Smith") .sched-pri-btn[aria-label="Raise priority"]';
  const harringtonDown = '.sched-sidebar-body > div:has-text("Harrington") .sched-pri-btn[aria-label="Lower priority"]';
  await glideTo(page, '.sched-sidebar-body > div:has-text("Smith")');
  await settle(page, 500);
  await clickThrough(page, smithUp);
  await settle(page, 1200);
  await clickThrough(page, harringtonDown);
  await settle(page, 1400);
  await glideTo(page, '#schedule-main', { steps: 28 });
  await settle(page, 2000);
}
