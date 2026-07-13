// Capture the two landing-page "Live link" screenshots straight from the app,
// against the seeded +wiki recording account (Pro Cabinet Co / QUO-0001 Smith).
//
//   node scripts/capture-livelink-shots.mjs
//
// Reuses the wiki driver (headless sign-in + known selectors, same as
// wiki/recordings/live-link-tour.mjs) but takes clean stills — no synthetic
// cursor, no video. Writes straight over the landing assets:
//   brand/screenshots/10-livelink-sidebar.png   — Live link tab + live preview
//   brand/screenshots/10b-livelink-customer.png — the customer /q page
//
// PRECONDITION: `npm run dev` on port 3000, and the +wiki account seeded
// (scripts/seed_wiki_account.sql via the Supabase MCP) so QUO-0001 exists and
// the account is permanent-Pro (live-link pay/deposit controls render).
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadEnv, signInAndSaveState, BASE_URL, VIEWPORT } from '../wiki/recordings/_driver.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH_STATE = join(ROOT, 'wiki', 'recordings', 'out', '.auth-state.json');
const SHOTS = join(ROOT, 'brand', 'screenshots');
const settle = (page, ms) => page.waitForTimeout(ms);

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
  // Block the same third-party pixels the recording driver blocks (dev loads a
  // real PostHog key from .env.local).
  await ctx.route(/posthog\.com|googletagmanager\.com|google-analytics\.com|doubleclick\.net|facebook\.(net|com)|sentry\.io/, (r) => r.abort());
  // Force GBP: the app self-heals business_info.default_currency FROM the
  // device's localStorage on boot ("device wins", src/business.js /
  // settings.js), so pinning pcCurrency='£' here writes '£' to the DB and the
  // public /q page (which reads that column server-side) renders in £, not the
  // headless-Chromium en-US default of $.
  await ctx.addInitScript(() => { try { localStorage.setItem('pcCurrency', '£'); } catch (e) {} });
  const page = await ctx.newPage();

  await page.goto('/');
  await page.waitForSelector('.nav-tab', { timeout: 30_000 });
  await settle(page, 3500); // let the currency self-heal reach the DB before /q loads

  // 1. Quotes → open the Smith quote in the sidebar editor.
  await page.click('.nav-tab[title="Quotes"]');
  await page.waitForSelector('#panel-quote .quote-card', { timeout: 15_000 });
  await settle(page, 500);
  await page.click('#panel-quote .quote-card:has-text("Smith")');
  await page.waitForSelector('#pq-lines-table', { timeout: 10_000 });
  await settle(page, 700);

  // 2. Live link tab — link generates on entry, preview iframe mounts.
  await page.click('#ql-tab-live');
  // The link `<code>` is present-but-hidden in the current UI (a Copy/Open
  // button fronts it) — wait for it attached, not visible.
  await page.waitForFunction(() => {
    const el = document.getElementById('share-link');
    return el && /^https?:\/\//.test((el.textContent || '').trim());
  }, null, { timeout: 15_000 });
  await settle(page, 1000);

  // 3. Turn ON card payment (permanent-Pro account) + "let customers request
  //    changes", so the controls + customer page show the full feature set.
  //    Best-effort: these are custom mini-toggles that can be present-but-
  //    hidden; enable by dispatching their onclick if not already pressed.
  const enableToggle = async (id) => {
    try {
      const changed = await page.$eval(`#${id}`, (el) => {
        if (el.getAttribute('aria-pressed') === 'true') return false;
        el.click();
        return true;
      });
      if (changed) await settle(page, 700);
    } catch { console.error(`(toggle #${id} not found — skipping)`); }
  };
  await enableToggle('sh-pay');
  await enableToggle('sh-edit');

  // 4. Mark the first line Optional + unlock its specs (best-effort — gives the
  //    customer page an Optional toggle + Edit chips like the original shots).
  try {
    await page.$eval('.ll-line .ll-opt input', (el) => { if (!(/** @type {HTMLInputElement} */(el)).checked) el.click(); });
    await settle(page, 500);
    await page.$eval('.ll-line .ll-spec-caret', (el) => el.click());
    await settle(page, 500);
    await page.$eval('.ll-spec-all a', (el) => { if (/all on/i.test(el.textContent || '')) el.click(); });
    await settle(page, 1500); // autosave
  } catch { console.error('(optional/spec-unlock controls not found — capturing as-is)'); }

  // Reload the live-preview iframe so it reflects the now-synced GBP currency
  // (it may have fetched before the self-heal write landed), then let it paint.
  await page.$$eval('#quote-main iframe, #orders-main iframe, iframe', (els) => {
    els.forEach((f) => { try { f.src = f.src; } catch (e) {} });
  }).catch(() => {});
  await settle(page, 2800);

  // SHOT 1 — full app viewport: Live link controls + live customer preview.
  await page.screenshot({ path: join(SHOTS, '10-livelink-sidebar.png') });
  console.log('SAVED 10-livelink-sidebar.png');

  // 5. Navigate to the ACTUAL customer page and shoot it standalone.
  const url = await page.$eval('#share-link', (el) => (el.textContent || '').trim());
  if (!url.startsWith('http')) throw new Error(`share link not ready: "${url}"`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait for the customer quote card to render.
  await page.waitForSelector('.qp-chip, .qpd-b, .quote-public, [class*="qp-"]', { timeout: 20_000 }).catch(() => {});
  await settle(page, 2500);

  // SHOT 2 — customer /q page (viewport, matching the original framing).
  await page.screenshot({ path: join(SHOTS, '10b-livelink-customer.png') });
  console.log('SAVED 10b-livelink-customer.png');
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
