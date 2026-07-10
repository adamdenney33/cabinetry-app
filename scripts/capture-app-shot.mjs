// Capture a fresh app screenshot for a social post — same Playwright driver
// as the wiki clips (signs into the recording account, real screens).
//
//   node scripts/capture-app-shot.mjs <Tab> [subSelector]
//
//   <Tab>          nav tab title: Dashboard | "Cut List" | Stock | Cabinet |
//                  Quotes | Orders | Clients | Schedule
//   [subSelector]  optional CSS selector to click after the tab loads
//                  (e.g. "#cab-tab-builder" for the cabinet builder sub-tab)
//
// PRECONDITION: `npm run dev` running on port 3000 (same rule as
// scripts/record-wiki-clips.mjs — this script refuses to spawn Vite itself).
// Output: out/instagram/studio/_shots/<tab>-<timestamp>.png (printed as the
// last line, prefixed SAVED, so callers can parse it).
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadEnv, signInAndSaveState, BASE_URL, VIEWPORT } from '../wiki/recordings/_driver.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_STATE = join(ROOT, 'wiki', 'recordings', 'out', '.auth-state.json');

const tab = process.argv[2];
const sub = process.argv[3] || '';
if (!tab) {
  console.error('ERROR: usage: node scripts/capture-app-shot.mjs <Tab> [subSelector]');
  process.exit(1);
}

try {
  await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`ERROR: dev server not reachable at ${BASE_URL} — start it with: npm run dev`);
  process.exit(1);
}

const env = loadEnv();
const browser = await chromium.launch({ headless: true });
try {
  await signInAndSaveState(browser, env);
  const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT, storageState: AUTH_STATE });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.waitForSelector('.nav-tab', { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.click(`.nav-tab[title="${tab}"]`);
  await page.waitForTimeout(2000);
  if (sub) {
    await page.click(sub).catch(() => console.error(`(sub-selector "${sub}" not found — capturing tab as-is)`));
    await page.waitForTimeout(1500);
  }
  const outDir = join(ROOT, 'out', 'instagram', 'studio', '_shots');
  mkdirSync(outDir, { recursive: true });
  const slug = tab.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const out = join(outDir, `${slug}${sub ? '-sub' : ''}-${Date.now()}.png`);
  await page.screenshot({ path: out });
  console.log(`SAVED ${out}`);
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
