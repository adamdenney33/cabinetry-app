// ProCabinet.App — tab + tour screenshot capture
//
// Drives a fresh headless Chrome over the DevTools Protocol against the running
// dev server, captures each of the 8 tab pages plus the guided-tour welcome
// screen, and writes them to brand/screenshots/.
//
// Requires the Vite dev server on http://localhost:3000 (start it first), and
// Google Chrome. Run:  node brand/_src/shoot.mjs
//
// A fresh Chrome profile is used each run, so the app boots logged-out → demo
// mode (rich sample data, see src/demo.js) in the default light theme.

import { writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const OUT = join(SRC, '..', 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const APP = 'http://localhost:3000/index.html';
const PORT = 9333;
// Viewport is set precisely via Emulation.setDeviceMetricsOverride below, so
// --window-size doesn't need to match. 1280 is the "standard app width": just
// above the 1240 icon-only nav breakpoint (styles.css L461) so labels stay
// visible, and below the 1400 section-panel max-width (styles.css L483) so
// the panel fills the window flush — no body-bg gutter on either side.
const W = 1280, H = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the 8 nav tabs — [switchSection id, output file]
const TABS = [
  ['dashboard', '01-dashboard'], ['cutlist', '02-cut-list'],
  ['cabinet', '03-cabinet'],     ['stock', '04-stock'],
  ['orders', '05-orders'],       ['quote', '06-quotes'],
  ['clients', '07-clients'],     ['schedule', '08-schedule'],
];

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'pc-shot-'));
const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
  '--no-first-run', '--no-default-browser-check', '--remote-allow-origins=*',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=' + W + ',' + H, '--force-device-scale-factor=2', 'about:blank',
], { stdio: 'ignore' });

let ws;
try {
  // wait for the DevTools endpoint, grab the page target's WebSocket URL
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

  // minimal CDP client — id-matched commands + one-shot event waiters
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
  const shoot = async (name) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const path = join(OUT, name + '.png');
    writeFileSync(path, Buffer.from(data, 'base64'));
    console.log('  shot  screenshots/' + name + '.png  (' + (statSync(path).size / 1024).toFixed(0) + ' KB)');
  };
  // hide the logged-out "live demo" banner + any open toasts so the shots show
  // the tab content clean (otherwise the info-toasts that trigger on
  // editQuoteInCB / _clOpenLibraryCutlist linger in the bottom-right corner)
  const HIDE_BANNER =
    "(()=>{let s=document.getElementById('pc-shot-css');" +
    "if(!s){s=document.createElement('style');s.id='pc-shot-css';document.head.appendChild(s);}" +
    "s.textContent='#demo-banner,#toast-container{display:none!important}';})()";

  await send('Page.enable');
  // Pin the viewport exactly — Chrome's --window-size flag is OS-window size
  // (often a few px wider than the viewport in headless), so without this
  // override the capture would come in at ~1320 wide and leak body-bg gutter.
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: false,
  });
  await send('Page.navigate', { url: APP });
  await waitEvent('Page.loadEventFired');

  // wait for the app to boot into demo mode with data hydrated
  let ready = false;
  for (let i = 0; i < 80 && !ready; i++) {
    ready = await evalJS("!!document.querySelector('.nav-tabs') && window._demoMode===true");
    if (!ready) await sleep(250);
  }
  if (!ready) throw new Error('app never reached demo-ready state');
  await sleep(1200);

  // ── tour welcome ── the walkthrough auto-starts on a fresh profile; force it
  // if it has not appeared, then wait for the centred welcome card.
  let welcome = false;
  for (let i = 0; i < 40 && !welcome; i++) {
    welcome = await evalJS("!!document.querySelector('#wt-overlay .wt-center')");
    if (!welcome) await sleep(200);
  }
  if (!welcome) {
    await evalJS("window._wtStart && window._wtStart({force:true})");
    for (let i = 0; i < 40 && !welcome; i++) {
      welcome = await evalJS("!!document.querySelector('#wt-overlay .wt-center')");
      if (!welcome) await sleep(200);
    }
  }
  if (!welcome) throw new Error('tour welcome screen never rendered');
  await evalJS(HIDE_BANNER);
  await sleep(1800); // let the overlay + cursor settle
  await shoot('tour-welcome');

  // ── 8 tab pages ── close the tour, force light theme, capture each section
  await evalJS("window._wtClose && window._wtClose('skipped')", true);
  await sleep(1000);
  await evalJS("window.setTheme && window.setTheme(false)");
  await evalJS(HIDE_BANNER);
  // Demo mode has _userId === null, so _requireAuth() bounces editor entry
  // points (editQuoteInCB, cutlist saves, etc.) to the auth screen. Stub it
  // (plus _showAuth as a belt-and-suspenders) for the screenshot run — demo
  // data is read-only and _db writes are already blocked by _demoBlockWrite,
  // so this can't dirty anything.
  await evalJS(
    "window._requireAuth = () => true;" +
    "window._showAuth = () => {};" +
    "const a = document.getElementById('auth-screen'); if (a) a.classList.add('hidden');"
  );
  await sleep(700);
  for (const [section, name] of TABS) {
    await evalJS("window.switchSection && window.switchSection('" + section + "')");
    await sleep(1500);
    await shoot(name);
  }

  // ── sub-tabs + sidebar editors "in use" ──
  // Demo seed (src/demo.js) gives us deterministic IDs:
  //   clients/stock_items/cabinet_templates/quotes/orders/cutlists all start at 1.
  // Quote 1 = Mitchell Kitchen (4 lines, 3 cabinets), Cutlist 1 has 5 sheets + pieces.
  const settle = (ms = 1200) => sleep(ms);

  // Cabinet sub-tabs and editor — keep all cabinet shots in one block so the
  // outer/inner tab state doesn't leak across captures of other sections.
  await evalJS("window.switchSection && window.switchSection('cabinet')");
  await settle();
  // Cabinet Library sub-tab — uses the cb-sidebar-library wrapper with its
  // own Builder/My Rates tab pair (cb-lib-tab-*).
  await evalJS(
    "window.switchCabTab && window.switchCabTab('builder');" +
    "window.switchCBMainView && window.switchCBMainView('library')"
  );
  await settle(1500);
  await shoot('03b-cabinet-library');

  // My Rates — back to Quote Builder view (so cb-sidebar-builder is visible,
  // not cb-sidebar-library), then switchCabTab('rates') reveals cab-view-rates
  // inside cb-sidebar. Switching from Library view first is the order users
  // hit in the app, and avoids the no-op of calling switchCabTab while the
  // library sidebar is the visible one.
  await evalJS(
    "window.switchCBMainView && window.switchCBMainView('results');" +
    "window.switchCabTab && window.switchCabTab('rates')"
  );
  await settle(1500);
  await shoot('03c-cabinet-rates');

  // Open quote 1 in the cabinet editor and select its first cabinet line —
  // this is the "depth shot": project header + cabinet list + spec editor.
  await evalJS("window.switchCabTab && window.switchCabTab('builder')");
  await settle(700);
  await evalJS("typeof editQuoteInCB === 'function' && editQuoteInCB(1)", true);
  await settle(1500);
  await evalJS("typeof cbSelectLine === 'function' && cbSelectLine(0)");
  await settle(1500);
  await shoot('03d-cabinet-editor');

  // Cut Layout view — open the demo cutlist, run the optimiser, capture the
  // packed sheets. optimize() auto-calls switchCLMainView('layout') for us.
  await evalJS("window.switchSection && window.switchSection('cutlist')");
  await settle();
  await evalJS("window._clOpenLibraryCutlist && window._clOpenLibraryCutlist(1)", true);
  await settle(1500);
  await evalJS("typeof optimize === 'function' && optimize()");
  await settle(1800);
  await shoot('02b-cut-layout');

  // Sidebar editors in use — one per editable entity tab.
  await evalJS("window.switchSection && window.switchSection('stock')");
  await settle();
  await evalJS("typeof editStockItem === 'function' && editStockItem(1)");
  await settle(1500);
  await shoot('04b-stock-editor');

  await evalJS("window.switchSection && window.switchSection('orders')");
  await settle();
  await evalJS("typeof loadOrderIntoSidebar === 'function' && loadOrderIntoSidebar(1)", true);
  await settle(1800);
  await shoot('05b-order-editor');

  await evalJS("window.switchSection && window.switchSection('quote')");
  await settle();
  await evalJS("typeof loadQuoteIntoSidebar === 'function' && loadQuoteIntoSidebar(1)", true);
  await settle(1800);
  await shoot('06b-quote-editor');

  await evalJS("window.switchSection && window.switchSection('clients')");
  await settle();
  await evalJS("typeof editClient === 'function' && editClient(1)");
  await settle(1500);
  await shoot('07b-client-editor');

  ws.close();
  console.log('Done — 17 screenshots written to brand/screenshots/.');
} finally {
  try { ws?.close(); } catch { /* already closed */ }
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}
