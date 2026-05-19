// ProCabinet.App — tight-cropped logo PNGs
//
// Renders each logo in headless Chrome over the DevTools Protocol, measures
// the rendered element's exact bounding box in CSS pixels, then captures a
// PNG clipped to those pixel bounds. Result: zero whitespace around the edges
// — the visible logo fills the file edge-to-edge.
//
// PNG-only. No SVG masters. The brand/logo/ kit is the SVG source of truth;
// this script is for places where you want a flush-cropped raster: avatars,
// favicons, button labels, inline mentions.
//
//   node brand/_src/build-tight.mjs
//
// Requires Google Chrome.

import { writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC   = dirname(fileURLToPath(import.meta.url));
const BRAND = join(SRC, '..');
const REPO  = join(BRAND, '..');
const OUT   = join(BRAND, 'logo-tight');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT  = 9334;
const SCALE = 3;

// One-time migration: anything called "a logo" used to live in marketing/assets/.
// All logo assets now live under brand/ — sweep up the stragglers (no-op if
// they've already been removed).
const STALE = [
  join(REPO, 'marketing/assets/logo.svg'),
  join(REPO, 'marketing/assets/logo-light.svg'),
  join(REPO, 'marketing/assets/logo-square.svg'),
  join(REPO, 'marketing/assets/logos-tight'),
];
for (const p of STALE) {
  try {
    rmSync(p, { recursive: true, force: true });
    console.log('  rm   ' + p.replace(REPO + '/', ''));
  } catch { /* already gone, fine */ }
}

// ── design tokens (mirror styles.css / build.mjs) ──
const INK   = '#111111';
const WHITE = '#ffffff';
const AMBER = '#e8a838';
const FONT  = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Each item declares a CSS-rendered HTML element and the selector to clip to.
// padding INSIDE the element is fine (it becomes part of the crop); padding
// AROUND it gets cropped away.
const ITEMS = [
  {
    // Dark plate — text inside rounded dark rect, plate fills the PNG.
    name: 'logo',
    css:
      `body{margin:0;background:transparent;font-family:${FONT};font-weight:800;}` +
      `#plate{display:inline-block;background:${INK};color:${WHITE};` +
      `padding:14px 24px;border-radius:14px;` +
      `font-size:88px;letter-spacing:-2.3px;line-height:1;}` +
      `.app{color:${AMBER};}`,
    body: `<span id="plate">ProCabinet<span class="app">.App</span></span>`,
    selector: '#plate',
  },
  {
    // Transparent — text only, no plate. Crop = exact text bounds.
    name: 'logo-light',
    css:
      `body{margin:0;background:transparent;font-family:${FONT};font-weight:800;}` +
      `#t{display:inline-block;color:${INK};font-size:88px;letter-spacing:-2.3px;line-height:1;}` +
      `.app{color:${AMBER};}`,
    body: `<span id="t">ProCabinet<span class="app">.App</span></span>`,
    selector: '#t',
  },
  {
    // Square — stacked wordmark on dark gradient with rounded corners.
    // Tight crop = the rounded rect edges = the PNG edges.
    name: 'logo-square',
    css:
      `body{margin:0;background:transparent;font-family:${FONT};font-weight:800;}` +
      `#plate{display:inline-block;background:linear-gradient(180deg,#1a1a1a,#0a0a0a);` +
      `padding:48px 60px;border-radius:96px;text-align:center;line-height:1;}` +
      `.name{display:block;color:${WHITE};font-size:140px;letter-spacing:-3.6px;}` +
      `.app{display:block;color:${AMBER};font-size:140px;letter-spacing:-3.6px;margin-top:18px;}`,
    body: `<div id="plate"><span class="name">ProCabinet</span><span class="app">.App</span></div>`,
    selector: '#plate',
  },
];

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'pc-tight-'));

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=2400,2400', '--force-device-scale-factor=' + SCALE,
  '--default-background-color=00000000', 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  // wait for DevTools endpoint
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(200);
    try {
      const targets = await (await fetch('http://localhost:' + PORT + '/json')).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) throw new Error('Chrome DevTools endpoint never came up');

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('WebSocket failed')), { once: true });
  });

  // minimal CDP client
  let msgId = 0;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else if (m.method) {
      for (let i = waiters.length - 1; i >= 0; i--) {
        if (waiters[i].method === m.method) { waiters[i].resolve(m.params); waiters.splice(i, 1); }
      }
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const waitEvent = (method, ms = 15000) => new Promise((resolve, reject) => {
    const w = { method, resolve };
    waiters.push(w);
    setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) { waiters.splice(i, 1); reject(new Error('timeout waiting for ' + method)); }
    }, ms);
  });
  const evalJS = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  await send('Page.enable');

  console.log('Rendering tight logo PNGs...');
  for (const item of ITEMS) {
    const html =
      '<!doctype html><meta charset="utf-8"><style>' + item.css + '</style>' + item.body;
    const dataUri = 'data:text/html;base64,' + Buffer.from(html).toString('base64');

    await send('Page.navigate', { url: dataUri });
    await waitEvent('Page.loadEventFired');
    // let layout + fontfaces settle
    await sleep(250);

    // measure exact bounds of the target element (CSS pixels)
    const rect = await evalJS(
      "(()=>{const r=document.querySelector('" + item.selector + "').getBoundingClientRect();" +
      "return{x:r.left,y:r.top,w:r.width,h:r.height};})()"
    );

    // CDP captureScreenshot.clip is in CSS pixels; --force-device-scale-factor
    // rasterises at SCALE×, so output PNG is rect.w*SCALE × rect.h*SCALE.
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
    });

    const path = join(OUT, item.name + '.png');
    writeFileSync(path, Buffer.from(data, 'base64'));
    const size = statSync(path).size;
    console.log(
      '  png  logo-tight/' + item.name + '.png  (' +
      Math.round(rect.w * SCALE) + 'x' + Math.round(rect.h * SCALE) +
      ', ' + (size / 1024).toFixed(1) + ' KB)'
    );
  }

  console.log('Done — 3 tight PNGs written to brand/logo-tight/.');
} finally {
  try { ws?.close(); } catch { /* already closed */ }
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}
