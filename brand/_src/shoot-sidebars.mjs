// Companion to shoot.mjs — captures TALL screenshots of the sidebars at
// their full content height so the Remotion composition can animate a
// vertical scroll through every input.
//
// Two outputs:
//   sidebar-rates.png   — My Rates panel fully expanded (every section open)
//   sidebar-editor.png  — Cabinet editor sidebar for QUO-1042 / Base Cabinet
//                         600, all spec sections expanded
//
// Approach: drive the same Vite dev server, navigate to the right view, then
// use CDP Page.captureScreenshot with a `clip` region whose height exceeds
// the viewport — `captureBeyondViewport: true` paints content below the
// viewport into the screenshot.
//
// Requires npm run dev on :3000 + Google Chrome.

import { writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..', 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = 'http://localhost:3000/index.html';
const PORT = 9334; // different port from shoot.mjs so they can run in parallel

// Use a generous viewport — width matches normal shoot.mjs (1280); height is
// tall enough to fully render the sidebar's content without scrollbars.
// 4000 covers every section in the cabinet editor plus the "Notes" block.
const W = 1280, H = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'pc-sidebars-'));
const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=' + W + ',' + H, 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
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
  const waitEvent = (method, ms = 25000) => new Promise((resolve, reject) => {
    const w = { method, resolve };
    waiters.push(w);
    setTimeout(() => {
      const i = waiters.indexOf(w);
      if (i >= 0) { waiters.splice(i, 1); reject(new Error('timeout waiting for ' + method)); }
    }, ms);
  });
  const evalJS = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: false,
  });
  await send('Page.navigate', { url: APP });
  await waitEvent('Page.loadEventFired');

  // Wait for demo mode + bypass auth gates (same trick as shoot.mjs)
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    ready = await evalJS("!!document.querySelector('.nav-tabs') && window._demoMode===true");
    if (!ready) await sleep(250);
  }
  if (!ready) throw new Error('app never reached demo-ready state');

  await evalJS("window._wtClose && window._wtClose('skipped')", true);
  await sleep(800);
  await evalJS("window.setTheme && window.setTheme(false)");
  await evalJS(
    "window._requireAuth = () => true;" +
    "window._showAuth = () => {};" +
    "const a = document.getElementById('auth-screen'); if (a) a.classList.add('hidden');"
  );
  // Hide chrome we don't want in the sidebar shots
  await evalJS(
    "(()=>{let s=document.getElementById('pc-shot-css');" +
    "if(!s){s=document.createElement('style');s.id='pc-shot-css';document.head.appendChild(s);}" +
    "s.textContent='#demo-banner,#toast-container{display:none!important}';})()"
  );
  await sleep(500);

  // Helper: capture the bounding rect of an element with overflow disabled
  // so we get the full content height.
  /**
   * @param {string} expandSelector  Selector(s) whose `overflow` we need to
   *                                 lift before measuring height.
   * @param {string} targetSelector  Element whose bounding rect we capture.
   * @param {string} outName         File name (without extension) for the PNG.
   */
  const captureTall = async (expandSelector, targetSelector, outName) => {
    // Pop open every collapsible — rates panel sections start collapsed.
    await evalJS(`
      // Force every rates section open
      if (window._ratesOpen) for (const k of Object.keys(window._ratesOpen)) window._ratesOpen[k] = true;
      if (typeof renderCBRates === 'function') renderCBRates();
      // Force every cabinet editor section open (cbOpenSections is a Set)
      if (window.cbOpenSections) {
        // Common keys used in cabinet-render's collapsibles
        for (const k of ['cabinet','doors','drawers','hardware','base','finish']) {
          window.cbOpenSections.add(k);
        }
      }
      if (typeof renderCBEditor === 'function') renderCBEditor();
    `);
    await sleep(800);

    // Lift overflow constraints + reset every scrollable ancestor so the
    // target's bounding rect starts at the document top, not partway down
    // (which is what we were getting — element above the viewport got
    // captured starting from where its visible portion was, not from row 0).
    const rect = await evalJS(`
      (() => {
        for (const sel of ${JSON.stringify(expandSelector.split(','))}) {
          document.querySelectorAll(sel).forEach(el => {
            el.style.overflow = 'visible';
            el.style.maxHeight = 'none';
            el.style.height = 'auto';
            el.scrollTop = 0;
          });
        }
        // Reset the document scroll position
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        // Force a layout pass so the rect reflects the lifted overflow
        document.body.offsetHeight;
        const el = document.querySelector(${JSON.stringify(targetSelector)});
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()
    `);
    if (!rect) throw new Error('Target not found: ' + targetSelector);
    await sleep(400);

    // deviceScaleFactor:2 is already applied via Emulation; no need to
    // double-scale here (the previous run did, giving 4× output).
    const { data } = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: {
        x: rect.x, y: rect.y,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        scale: 1,
      },
    });
    const path = join(OUT, outName + '.png');
    writeFileSync(path, Buffer.from(data, 'base64'));
    const kb = (statSync(path).size / 1024).toFixed(0);
    console.log(`  shot  screenshots/${outName}.png  (${Math.ceil(rect.width)}×${Math.ceil(rect.height)}, ${kb} KB)`);
  };

  // ── My Rates sidebar ──
  await evalJS("window.switchSection && window.switchSection('cabinet')");
  await sleep(700);
  await evalJS(
    "window.switchCBMainView && window.switchCBMainView('results');" +
    "window.switchCabTab && window.switchCabTab('rates')"
  );
  await sleep(1200);
  await captureTall(
    '#cb-sidebar, #cb-sidebar-builder, #panel-cabinet, .app-body, .main-content',
    '#cb-sidebar-builder',
    'sidebar-rates',
  );

  // ── Cabinet editor sidebar (QUO-1042 → Base Cabinet 600) ──
  await evalJS("window.switchCabTab && window.switchCabTab('builder')");
  await sleep(600);
  await evalJS("typeof editQuoteInCB === 'function' && editQuoteInCB(1)", true);
  await sleep(1200);
  await evalJS("typeof cbSelectLine === 'function' && cbSelectLine(0)");
  await sleep(1000);
  await captureTall(
    '#cb-sidebar, #cb-sidebar-builder, #panel-cabinet, .app-body, .main-content',
    '#cb-sidebar-builder',
    'sidebar-editor',
  );

  ws.close();
  console.log('Done — 2 tall sidebar screenshots written.');
} finally {
  try { ws?.close(); } catch { /* already closed */ }
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}
