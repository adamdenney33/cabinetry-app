// Headless end-to-end check of the IG Content Studio browser app.
//   node scripts/ig-studio-e2e.mjs [chromium|webkit|firefox]
// (server must be running on :3036; webkit ≈ Safari/Orion)
// Drives the real UI: templates load, format switching, carousel slide
// editing, asset modal, a full render, caption save. Prints PASS/FAIL lines
// and saves screenshots to /tmp/igs-e2e-*.png.
import * as pw from '@playwright/test';

const ENGINE = process.argv[2] || 'chromium';
const { [ENGINE]: engine } = pw;
const BASE = 'http://localhost:3036';
const out = [];
const ok = (name) => { out.push(`PASS ${name}`); console.log(`PASS ${name}`); };
const no = (name, why) => { out.push(`FAIL ${name} — ${why}`); console.log(`FAIL ${name} — ${why}`); };

const browser = await engine.launch({ headless: true });
console.log('engine:', ENGINE);
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });

try {
  await page.goto(BASE, { timeout: 10_000 });

  // 1 — templates grid loads with real images (poll: fetches race the check)
  await page.waitForSelector('.tpl img', { timeout: 10_000 }).catch(() => {});
  let tiles = [];
  for (let i = 0; i < 10; i++) {
    tiles = await page.$$eval('.tpl img', (els) => els.map((im) => ({ w: im.naturalWidth, c: im.complete })));
    if (tiles.length >= 6 && tiles.every((t) => t.c && t.w > 0)) break;
    await page.waitForTimeout(1000);
  }
  tiles.length >= 6 && tiles.every((t) => t.c && t.w > 0)
    ? ok(`templates grid (${tiles.length} tiles, all loaded)`)
    : no('templates grid', JSON.stringify(tiles.slice(0, 3)));
  await page.screenshot({ path: '/tmp/igs-e2e-1-load.png' });

  // 2 — template selection updates preview
  await page.click('.tpl:nth-child(4)'); // dot-grid
  await page.waitForTimeout(200);
  const pv = await page.$eval('#pvInner', (el) => el.innerHTML.length);
  pv > 100 ? ok('template select + preview painted') : no('preview', 'inner html empty');

  // 3 — format switching
  await page.click('#typeSeg button[data-t="carousel"]');
  await page.waitForTimeout(200);
  const slideEds = await page.$$('.slide-ed');
  slideEds.length >= 2 ? ok(`carousel mode (${slideEds.length} slide editors)`) : no('carousel mode', `${slideEds.length} editors`);

  // 4 — slide copy paste-back
  await page.click('button:has-text("Paste Claude’s JSON")');
  await page.fill('#slidesJson', '[{"kicker":"Test","title":"Slide *one*"},{"kicker":"","title":"Slide two"},{"kicker":"CTA","title":"Follow *us*"}]');
  await page.click('#slidesPaste button');
  await page.waitForTimeout(200);
  const firstTag = await page.$eval('.slide-ed .tag', (el) => el.textContent);
  firstTag.includes('Slide') ? ok('slide copy JSON applied') : no('slide copy JSON', 'tags: ' + firstTag);

  // 5 — asset modal shows grouped images
  await page.click('.slide-ed .imgpick button');
  await page.waitForTimeout(400);
  const assets = await page.$$eval('#assetBody .a img', (els) => els.filter((i) => i.complete && i.naturalWidth > 0).length);
  assets > 3 ? ok(`asset modal (${assets} images loaded)`) : no('asset modal', `${assets} images`);
  const picked = await page.$('#assetBody .a');
  if (picked) { await picked.click(); await page.waitForTimeout(200); }
  const thumb = await page.$('.slide-ed .imgpick img.pv');
  thumb ? ok('asset assigned to slide (thumb shown)') : no('asset assign', 'no thumb after pick');
  await page.screenshot({ path: '/tmp/igs-e2e-2-carousel.png' });

  // 6 — reel mode shows length + music options
  await page.click('#typeSeg button[data-t="reel"]');
  await page.waitForTimeout(300);
  const audioOpts = await page.$$eval('#audio option', (els) => els.length);
  audioOpts > 1 ? ok(`reel mode (music list: ${audioOpts - 1} tracks)`) : no('reel music list', `${audioOpts - 1} tracks`);

  // 7 — full render (single, cached bundle → should finish well under 90s)
  await page.click('#typeSeg button[data-t="single"]');
  await page.fill('#title', 'E2E check *passing.*');
  await page.fill('#slug', 'e2e-check');
  await page.click('#renderBtn');
  let done = false, t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    await page.waitForTimeout(2000);
    const st = await page.$eval('#renderStatus', (el) => el.textContent || '');
    if (/Done in/.test(st)) { done = true; break; }
    if (/died|stalled|ERROR/i.test(st)) break;
  }
  done ? ok(`render completed (${Math.round((Date.now() - t0) / 1000)}s)`) : no('render', await page.$eval('#renderStatus', (el) => el.textContent));
  let outs = 0;
  for (let i = 0; i < 8; i++) {
    outs = await page.$$eval('#outGrid img', (els) => els.filter((im) => im.complete && im.naturalWidth > 0).length);
    if (outs >= 1) break;
    await page.waitForTimeout(1000);
  }
  outs >= 1 ? ok('output preview shown') : no('output preview', `${outs} images`);
  await page.screenshot({ path: '/tmp/igs-e2e-3-render.png' });

  // 8 — caption save round-trip
  await page.fill('#caption', 'e2e test caption');
  await page.click('button:has-text("Save to marketing/captions")');
  await page.waitForTimeout(600);
  const capMsg = await page.$eval('#capMsg', (el) => el.textContent);
  /saved/.test(capMsg) ? ok('caption saved') : no('caption save', capMsg || 'no message');

  consoleErrors.length === 0 ? ok('no console errors') : no('console errors', consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  no('e2e crashed', e.message);
  await page.screenshot({ path: '/tmp/igs-e2e-crash.png' }).catch(() => {});
}
await browser.close();
console.log('\nSUMMARY: ' + out.filter((l) => l.startsWith('FAIL')).length + ' failure(s) of ' + out.length + ' checks');
