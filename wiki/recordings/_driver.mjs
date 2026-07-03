// Shared Playwright driver for the wiki workflow-clip recordings
// (scripts/record-wiki-clips.mjs). Owns: browser context setup with video
// capture, the synthetic cursor overlay, humanized interaction helpers, and
// sign-in as the dedicated recording account (WIKI_REC_* in .env.local).
//
// Recordings run against the LOCAL dev server (npm run dev, port 3000) but
// write REAL rows to the recording account on prod Supabase — reset the
// account first via scripts/seed_wiki_account.sql. Analytics hosts are
// route-blocked per context so recording sessions never pollute PostHog/GA.

import { readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_URL = 'http://localhost:3000';
export const VIEWPORT = { width: 1440, height: 900 };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_DIR = join(ROOT, 'wiki', 'recordings', 'out');
const AUTH_STATE = join(OUT_DIR, '.auth-state.json');

/** Parse .env.local (no dotenv dep). @returns {Record<string, string>} */
export function loadEnv() {
  const env = Object.fromEntries(
    readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  for (const k of ['WIKI_REC_EMAIL', 'WIKI_REC_PASSWORD']) {
    if (!env[k]) throw new Error(`Missing ${k} in .env.local — see scripts/seed_wiki_account.sql header.`);
  }
  if (!/\+wiki@/.test(env.WIKI_REC_EMAIL)) {
    throw new Error('WIKI_REC_EMAIL must be a +wiki@ alias — refusing to record on any other account.');
  }
  return env;
}

// Synthetic cursor: Playwright videos show no OS cursor, so an overlay tracks
// the REAL mousemove/mousedown events page.mouse.* dispatches (never lags the
// actual click point). Arrow + gold ripple match the in-app walkthrough cursor
// (src/walkthrough.js / styles.css #wt-cursor).
const CURSOR_INIT = `(() => {
  if (window.__recCursorInstalled) return;
  window.__recCursorInstalled = true;
  const install = () => {
    if (!document.body) return;
    const style = document.createElement('style');
    style.textContent = [
      '#rec-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647;',
      '  pointer-events: none; will-change: transform; transform: translate(-40px,-40px); }',
      '#rec-cursor svg { filter: drop-shadow(0 1px 3px rgba(0,0,0,0.45)); display:block; }',
      '#rec-cursor.rec-click svg { animation: recClick 0.24s ease-out; }',
      '@keyframes recClick { 0% {transform:scale(1)} 35% {transform:scale(0.72)} 100% {transform:scale(1)} }',
      '.rec-ripple { position: fixed; z-index: 2147483646; pointer-events: none;',
      '  width: 36px; height: 36px; border-radius: 50%; margin: -18px 0 0 -18px;',
      '  background: rgba(232,168,56,0.35); border: 2px solid rgba(232,168,56,0.7);',
      '  animation: recRipple 0.45s ease-out forwards; }',
      '@keyframes recRipple { from {transform:scale(0.3);opacity:1} to {transform:scale(1.6);opacity:0} }',
    ].join('\\n');
    document.head.appendChild(style);
    const cur = document.createElement('div');
    cur.id = 'rec-cursor';
    cur.innerHTML = '<svg width="20" height="26" viewBox="0 0 20 26" fill="none">'
      + '<path d="M4 3L4 21L9 16L12 24L14.5 23L11.5 15L18 15Z" fill="white" '
      + 'stroke="#1a1a1a" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    document.body.appendChild(cur);
    document.addEventListener('mousemove', (e) => {
      cur.style.transform = 'translate(' + (e.clientX - 4) + 'px,' + (e.clientY - 3) + 'px)';
    }, true);
    document.addEventListener('mousedown', (e) => {
      cur.classList.remove('rec-click'); void cur.offsetWidth; cur.classList.add('rec-click');
      const r = document.createElement('div');
      r.className = 'rec-ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 500);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();`;

// Third-party analytics/pixels: dev loads a real PostHog key from .env.local,
// so recording sessions must never reach these hosts.
const BLOCKED_HOSTS = /posthog\.com|googletagmanager\.com|google-analytics\.com|doubleclick\.net|facebook\.(net|com)|sentry\.io/;

/**
 * Sign in once as the recording account and persist storageState, so every
 * clip context starts authenticated (login dead-time never recorded).
 * `_sb` is src/db.js's top-level const — a global lexical binding, reachable
 * from evaluated scripts just like the console.
 * @param {import('@playwright/test').Browser} browser
 * @param {Record<string, string>} env
 */
export async function signInAndSaveState(browser, env) {
  mkdirSync(OUT_DIR, { recursive: true });
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT });
  await context.route(BLOCKED_HOSTS, (route) => route.abort());
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForFunction(() => typeof (/** @type {any} */ (globalThis)).supabase !== 'undefined', null, { timeout: 30_000 });
  const err = await page.evaluate(async ({ email, password }) => {
    // eslint-disable-next-line no-undef
    const sb = _sb; // global lexical const from src/db.js
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  }, { email: env.WIKI_REC_EMAIL, password: env.WIKI_REC_PASSWORD });
  if (err) throw new Error(`Recording-account sign-in failed: ${err}`);
  await page.waitForSelector('.nav-tab', { timeout: 30_000 });
  await context.storageState({ path: AUTH_STATE });
  await context.close();
}

/**
 * One recording context per clip (recordVideo finalizes on context.close()).
 * @param {import('@playwright/test').Browser} browser
 * @param {string} slug
 */
export async function makeClipContext(browser, slug) {
  mkdirSync(join(OUT_DIR, 'tmp'), { recursive: true });
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    storageState: AUTH_STATE,
    // size must be explicit: Playwright otherwise scales the capture down to
    // fit 800x800. viewport === size → 1:1 CSS-pixel capture, no rescale blur.
    recordVideo: { dir: join(OUT_DIR, 'tmp'), size: VIEWPORT },
  });
  await context.route(BLOCKED_HOSTS, (route) => route.abort());
  await context.addInitScript(CURSOR_INIT);
  await context.addInitScript(() => {
    localStorage.setItem('pcDark', '0'); // pin light theme for all clips
    // Pin metric: headless Chromium's en-US locale would otherwise flip the
    // app to imperial (settings.js locale sniff) and display the seeded mm
    // dimensions as nonsense inches.
    localStorage.setItem('pcUnits', 'metric');
    sessionStorage.setItem('pc_wt_session_cta', '1'); // belt-and-braces CTA suppression
    // Disarm main.js's boot self-heal: under a busy dev server its script
    // sentinel check can false-positive and location.reload() MID-CLIP.
    // Pre-marking "already healed" makes it report instead of reloading.
    sessionStorage.setItem('_pc_boot_heal', '1');
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const meta = {
    slug,
    /** Seconds into the recording where the clip should start (ffmpeg head trim). */
    sceneStart: 0,
    markSceneStart() { this.sceneStart = (Date.now() - t0) / 1000; },
  };
  return { context, page, meta };
}

/**
 * Boot the app shell and mark the trim point. Every drive script starts here.
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function bootApp(page, meta) {
  await page.goto('/');
  await page.waitForSelector('.nav-tab', { timeout: 30_000 });
  // Boot loader fades once data has rendered — don't record the spinner.
  await page.waitForFunction(() => {
    const l = document.getElementById('boot-loader');
    return !l || l.classList.contains('fade') || l.classList.contains('hidden');
  }, null, { timeout: 30_000 });
  await page.waitForTimeout(600);
  meta.markSceneStart();
}

/**
 * Smoothly move the synthetic cursor to an element's centre.
 * @param {import('@playwright/test').Page} page
 * @param {string} selector
 * @param {{ steps?: number }} [opts]
 */
export async function glideTo(page, selector, { steps = 28 } = {}) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps }); // real mousemove → overlay follows
  await page.waitForTimeout(180);
  return { x, y };
}

/**
 * Glide to an element, click it visibly, let the UI respond on camera.
 * @param {import('@playwright/test').Page} page @param {string} selector
 */
export async function clickThrough(page, selector) {
  await glideTo(page, selector);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/**
 * Click into a field and type like a human (visible keystrokes).
 * `clear` selects the existing value first so the typed text replaces it —
 * required for prefilled inputs (e.g. number fields that start at 0).
 * @param {import('@playwright/test').Page} page @param {string} selector @param {string} text
 * @param {{ clear?: boolean }} [opts]
 */
export async function typeHuman(page, selector, text, { clear = false } = {}) {
  await clickThrough(page, selector);
  if (clear) {
    await page.keyboard.press('ControlOrMeta+a');
    await page.waitForTimeout(120);
  }
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(40 + Math.random() * 55);
  }
}

/**
 * Beat of stillness so the viewer can read the result.
 * @param {import('@playwright/test').Page} page @param {number} [ms]
 */
export const settle = (page, ms = 800) => page.waitForTimeout(ms);
