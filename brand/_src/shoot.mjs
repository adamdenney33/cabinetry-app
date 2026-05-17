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
const W = 1440, H = 900;

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
  // hide the logged-out "live demo" banner so the shots show the tab content clean
  const HIDE_BANNER =
    "(()=>{let s=document.getElementById('pc-shot-css');" +
    "if(!s){s=document.createElement('style');s.id='pc-shot-css';document.head.appendChild(s);}" +
    "s.textContent='#demo-banner{display:none!important}';})()";

  await send('Page.enable');
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
  await sleep(700);
  for (const [section, name] of TABS) {
    await evalJS("window.switchSection && window.switchSection('" + section + "')");
    await sleep(1500);
    await shoot(name);
  }

  ws.close();
  console.log('Done — 9 screenshots written to brand/screenshots/.');
} finally {
  try { ws?.close(); } catch { /* already closed */ }
  chrome.kill('SIGKILL');
  rmSync(profile, { recursive: true, force: true });
}
