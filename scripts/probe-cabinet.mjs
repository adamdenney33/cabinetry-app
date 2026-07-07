// One-off debug probe: what does the Cabinet tab actually show for the
// recording account right now? Saves /tmp/probe-cabinet.png (+ after clicking
// the builder sub-tab: /tmp/probe-builder.png) and dumps #cb-results state.
import { chromium } from '@playwright/test';
import { loadEnv, signInAndSaveState, BASE_URL, VIEWPORT } from '../wiki/recordings/_driver.mjs';
import { join } from 'node:path';

const AUTH_STATE = join(process.cwd(), 'wiki', 'recordings', 'out', '.auth-state.json');
const env = loadEnv();
const browser = await chromium.launch({ headless: true });
await signInAndSaveState(browser, env);
const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT, storageState: AUTH_STATE });
const page = await ctx.newPage();
await page.goto('/');
await page.waitForSelector('.nav-tab', { timeout: 30_000 });
await page.waitForTimeout(2500);
await page.click('.nav-tab[title="Cabinet"]');
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/probe-cabinet.png' });
await page.click('#cab-tab-builder').catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/probe-builder.png' });
const info = await page.evaluate(() => {
  const r = document.getElementById('cb-results');
  const rows = document.querySelectorAll('#cb-results .cb-li-row');
  const vis = Array.from(rows).filter((el) => el.offsetParent !== null).length;
  return { resultsChildren: r ? r.children.length : -1, rows: rows.length, visibleRows: vis, firstHtml: r ? r.innerHTML.slice(0, 300) : '' };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
