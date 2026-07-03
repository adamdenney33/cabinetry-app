// Wiki clip: Dashboard Overview (~30s on screen).
// Read-only tour of the dashboard cards with the seeded data: 3 active
// orders with due dates, 4 recent quotes in mixed statuses, stock alerts,
// the 7-day schedule and the revenue chart.
// NOTE: with the seeded stock (all qty > low) the Stock Alerts card shows
// "all well stocked" — an honest state, still worth the beat.

import { bootApp, clickThrough, glideTo, settle } from './_driver.mjs';

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // 1. A visible beat on the Dashboard tab (active by default on boot).
  await clickThrough(page, '.nav-tab[title="Dashboard"]');
  await settle(page, 800);

  // 2. Active orders, with due dates at a glance.
  await glideTo(page, '.card:has-text("Active Orders") .card-header');
  await settle(page, 1100);

  // 3. The quote pipeline — what's waiting on a customer.
  await glideTo(page, '.card:has-text("Recent Quotes") .card-header');
  await settle(page, 1000);

  // 4. Stock alerts — low materials surface here before they stall a job.
  await glideTo(page, '.card:has-text("Stock Alerts") .card-header');
  await settle(page, 1000);

  // 5. This week's schedule.
  await glideTo(page, '.card:has-text("Schedule") .card-header');
  await settle(page, 1200);

  // 6. Revenue chart, then the full-dashboard money shot.
  await glideTo(page, '#revenue-chart');
  await settle(page, 1000);
  await glideTo(page, '#dashboard-main', { steps: 34 });
  await settle(page, 2200);
}
