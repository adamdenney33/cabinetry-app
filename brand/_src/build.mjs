// ProCabinet.App — brand-asset generator
// Encodes the live app's logo + nav-tab markup (index.html / styles.css) and
// emits SVG masters + PNG exports. PNGs are rasterised from the same SVGs via
// Chrome headless, so every PNG is pixel-consistent with its vector master.
//
//   node brand/_src/build.mjs
//
// Re-run after any change to the app's logo or tab bar to keep the kit current.

import { writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC   = dirname(fileURLToPath(import.meta.url));
const BRAND = join(SRC, '..');
const REPO  = join(BRAND, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// ── tokens (verbatim from styles.css :root, light theme) ──
const INK = '#111111', WHITE = '#ffffff', AMBER = '#e8a838', MUTED = '#888888',
      TABBAR = '#e2e2e2', BORDER = '#e0e0e0', SURFACE = '#ffffff';
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

// ── 8 nav-tab icons (paths verbatim from index.html lines 177-214) ──
const ICONS = [
  { name: 'dashboard', label: 'Dashboard', sw: 2,
    body: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>' },
  { name: 'cut-list', label: 'Cut List', sw: 1.5,
    body: '<path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/>' },
  { name: 'cabinet', label: 'Cabinet', sw: 2,
    body: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>' },
  { name: 'stock', label: 'Stock', sw: 2,
    body: '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>' },
  { name: 'orders', label: 'Orders', sw: 2, badge: '3',
    body: '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>' },
  { name: 'quotes', label: 'Quotes', sw: 2,
    body: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' },
  { name: 'clients', label: 'Clients', sw: 2,
    body: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>' },
  { name: 'schedule', label: 'Schedule', sw: 2,
    body: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
];

// ── helpers ──
const SVG_NS = 'http://www.w3.org/2000/svg';

// approximate rendered width of a label (for centring inside the tab bar)
const labelW = (text, size, bold) => text.length * size * (bold ? 0.60 : 0.565);

// an icon drawn as a positioned, scaled <g> (stroke-width scales with it,
// matching how the app renders the 24-grid icon at any display size)
const iconGroup = (icon, x, y, size, stroke) =>
  `<g transform="translate(${x},${y}) scale(${size / 24})" fill="none" stroke="${stroke}" ` +
  `stroke-width="${icon.sw}" stroke-linecap="round" stroke-linejoin="round">${icon.body}</g>`;

// standalone single-icon master
const iconSVG = (icon, stroke) =>
  `<svg xmlns="${SVG_NS}" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
  `stroke="${stroke}" stroke-width="${icon.sw}" stroke-linecap="round" stroke-linejoin="round" ` +
  `role="img" aria-label="${icon.label}">\n` +
  `  <title>ProCabinet.App — ${icon.label} tab icon</title>\n  ${icon.body}\n</svg>\n`;

// wordmark logo — procColor for "ProCabinet", appColor for ".App"
const logoSVG = (procColor, appColor, id) =>
  `<svg xmlns="${SVG_NS}" viewBox="0 0 1000 240" role="img" aria-label="ProCabinet.App">\n` +
  `  <title>ProCabinet.App logo — ${id}</title>\n` +
  `  <text x="500" y="120" text-anchor="middle" dominant-baseline="central" ` +
  `font-family="${FONT}" font-weight="800" font-size="100" letter-spacing="-2.6" ` +
  `fill="${procColor}">ProCabinet<tspan fill="${appColor}">.App</tspan></text>\n</svg>\n`;

// icon + label lockup (icon left, label right — matches the in-tab layout)
const labelledSVG = (icon) =>
  `<svg xmlns="${SVG_NS}" viewBox="0 0 340 64" role="img" aria-label="${icon.label}">\n` +
  `  <title>ProCabinet.App — ${icon.label} tab</title>\n` +
  `  ${iconGroup(icon, 8, 8, 48, INK)}\n` +
  `  <text x="80" y="32" dominant-baseline="central" font-family="${FONT}" ` +
  `font-size="44" font-weight="600" fill="${INK}">${icon.label}</text>\n</svg>\n`;

// full nav-tab bar, Dashboard active (light theme) — faithful reconstruction
function tabBarSVG() {
  const W = 1400, H = 44, padX = 50, gap = 2, top = 8, n = ICONS.length;
  const tabW = (W - padX * 2 - gap * (n - 1)) / n;
  const cY = (top + H) / 2;
  let bg = `<rect width="${W}" height="${H}" fill="${TABBAR}"/>`;
  let underline = `<rect x="0" y="${H - 1}" width="${W}" height="1" fill="${BORDER}"/>`;
  let active = '', content = '';
  ICONS.forEach((icon, i) => {
    const slotX = padX + i * (tabW + gap);
    const isActive = i === 0;
    const ink = isActive ? INK : MUTED;
    const lblW = labelW(icon.label, 13, isActive);
    const badgeW = icon.badge ? 24 : 0;            // 6px gap + ~18px pill
    const cw = 14 + 7 + lblW + badgeW;
    const iconX = slotX + tabW / 2 - cw / 2;
    const lblX = iconX + 14 + 7;
    if (isActive) {
      const r = 8, x0 = slotX, x1 = slotX + tabW;
      const fill = `M${x0},${H} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} ` +
                   `L${x1 - r},${top} Q${x1},${top} ${x1},${top + r} L${x1},${H} Z`;
      const edge = `M${x0},${H} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} ` +
                   `L${x1 - r},${top} Q${x1},${top} ${x1},${top + r} L${x1},${H}`;
      active = `<path d="${fill}" fill="${SURFACE}"/>` +
               `<path d="${edge}" fill="none" stroke="${BORDER}" stroke-width="1"/>`;
    }
    content += iconGroup(icon, iconX, cY - 7, 14, ink);
    content += `<text x="${lblX}" y="${cY}" dominant-baseline="central" font-family="${FONT}" ` +
               `font-size="13" font-weight="${isActive ? 700 : 500}" fill="${ink}">${icon.label}</text>`;
    if (icon.badge) {
      const bx = lblX + lblW + 6;
      content += `<rect x="${bx}" y="${cY - 7.5}" width="18" height="15" rx="7.5" fill="${AMBER}"/>` +
                 `<text x="${bx + 9}" y="${cY + 0.5}" text-anchor="middle" dominant-baseline="central" ` +
                 `font-family="${FONT}" font-size="10" font-weight="700" fill="${WHITE}">${icon.badge}</text>`;
    }
  });
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${W} ${H}" role="img" ` +
    `aria-label="ProCabinet.App navigation tab bar, Dashboard active">\n` +
    `  <title>ProCabinet.App — navigation tab bar (Dashboard active)</title>\n` +
    `  ${bg}\n  ${underline}\n  ${active}\n  ${content}\n</svg>\n`;
}

// contact sheet — the 8 bare icons on an app-style card
function iconsSheetSVG() {
  const cols = 4, rows = 2, cell = 184, pad = 56, sz = 64;
  const w = pad * 2 + cols * cell, h = pad * 2 + rows * cell;
  let cells = '';
  ICONS.forEach((icon, i) => {
    const cx = pad + (i % cols) * cell + cell / 2;
    const cy = pad + Math.floor(i / cols) * cell + cell / 2;
    cells += iconGroup(icon, cx - sz / 2, cy - sz / 2, sz, INK);
  });
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ProCabinet.App tab icon set">\n` +
    `  <title>ProCabinet.App — tab icon set</title>\n` +
    `  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="24" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2"/>\n` +
    `  ${cells}\n</svg>\n`;
}

// contact sheet — the 8 icon+label lockups on an app-style card
function labelledSheetSVG() {
  const cols = 2, rows = 4, cellW = 392, cellH = 96, pad = 56;
  const w = pad * 2 + cols * cellW, h = pad * 2 + rows * cellH;
  let cells = '';
  ICONS.forEach((icon, i) => {
    const x = pad + (i % cols) * cellW;
    const y = pad + Math.floor(i / cols) * cellH;
    cells += iconGroup(icon, x + 8, y + (cellH - 48) / 2, 48, INK);
    cells += `<text x="${x + 8 + 48 + 22}" y="${y + cellH / 2}" dominant-baseline="central" ` +
             `font-family="${FONT}" font-size="40" font-weight="600" fill="${INK}">${icon.label}</text>`;
  });
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" role="img" aria-label="ProCabinet.App tab icon set with labels">\n` +
    `  <title>ProCabinet.App — tab icon set with labels</title>\n` +
    `  <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="24" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2"/>\n` +
    `  ${cells}\n</svg>\n`;
}

// ── marketing/assets refresh (text-only, replacing the stale cabinet-mark SVGs) ──
const marketingLogoPlate = () =>
  `<svg xmlns="${SVG_NS}" viewBox="0 0 1000 260" role="img" aria-label="ProCabinet.App">\n` +
  `  <title>ProCabinet.App</title>\n` +
  `  <rect width="1000" height="260" rx="28" fill="${INK}"/>\n` +
  `  <text x="500" y="135" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" ` +
  `font-weight="800" font-size="100" letter-spacing="-2.6" fill="${WHITE}">ProCabinet<tspan fill="${AMBER}">.App</tspan></text>\n</svg>\n`;

const marketingLogoSquare = () =>
  `<svg xmlns="${SVG_NS}" viewBox="0 0 1024 1024" role="img" aria-label="ProCabinet.App">\n` +
  `  <title>ProCabinet.App</title>\n` +
  `  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
  `<stop offset="0%" stop-color="#1a1a1a"/><stop offset="100%" stop-color="#0a0a0a"/></linearGradient></defs>\n` +
  `  <rect width="1024" height="1024" fill="url(#bg)"/>\n` +
  `  <text x="512" y="452" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" ` +
  `font-weight="800" font-size="140" letter-spacing="-3.6" fill="${WHITE}">ProCabinet</text>\n` +
  `  <text x="512" y="624" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" ` +
  `font-weight="800" font-size="140" letter-spacing="-3.6" fill="${AMBER}">.App</text>\n</svg>\n`;

// ── write SVG masters, queue PNG renders ──
const renders = []; // { svg, out, w, h, scale }
const write = (rel, content) => {
  const p = join(BRAND, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log('  svg  ' + rel);
  return p;
};

console.log('Writing SVG masters...');

// logos (2 versions × on-light / on-dark ink)
const LOGOS = [
  ['logo/logo-primary-black.svg',    logoSVG(INK,   INK,   'primary B&W, dark ink')],
  ['logo/logo-primary-white.svg',    logoSVG(WHITE, WHITE, 'primary B&W, light ink')],
  ['logo/logo-colour-on-light.svg',  logoSVG(INK,   AMBER, 'colour, for light backgrounds')],
  ['logo/logo-colour-on-dark.svg',   logoSVG(WHITE, AMBER, 'colour, for dark backgrounds')],
];
for (const [rel, svg] of LOGOS) {
  write(rel, svg);
  renders.push({ svg, out: join(BRAND, rel.replace('.svg', '.png')), w: 1000, h: 240, scale: 3 });
}

// 8 icon masters + PNGs
for (const icon of ICONS) {
  const svg = iconSVG(icon, INK);
  write('icons/individual/' + icon.name + '.svg', svg);
  renders.push({ svg, out: join(BRAND, 'icons/individual/' + icon.name + '.png'), w: 256, h: 256, scale: 3 });
}

// 8 labelled lockups + PNGs
for (const icon of ICONS) {
  const svg = labelledSVG(icon);
  write('icons/labelled/' + icon.name + '.svg', svg);
  renders.push({ svg, out: join(BRAND, 'icons/labelled/' + icon.name + '.png'), w: 340, h: 64, scale: 3 });
}

// tab bar
{
  const svg = tabBarSVG();
  write('icons/tab-bar/tab-bar-dashboard-active.svg', svg);
  renders.push({ svg, out: join(BRAND, 'icons/tab-bar/tab-bar-dashboard-active.png'), w: 1400, h: 44, scale: 3 });
}

// contact sheets
{
  const a = iconsSheetSVG();
  write('icons/icons-only-sheet.svg', a);
  renders.push({ svg: a, out: join(BRAND, 'icons/icons-only-sheet.png'), w: 736, h: 480, scale: 2 });
  const b = labelledSheetSVG();
  write('icons/icons-labelled-sheet.svg', b);
  renders.push({ svg: b, out: join(BRAND, 'icons/icons-labelled-sheet.png'), w: 896, h: 880, scale: 2 });
}

// marketing/assets refresh (SVG only — matches what was there before)
console.log('Refreshing marketing/assets/...');
const mkt = (rel, content) => {
  writeFileSync(join(REPO, rel), content);
  console.log('  svg  ' + rel);
};
mkt('marketing/assets/logo.svg', marketingLogoPlate());
mkt('marketing/assets/logo-light.svg', logoSVG(INK, AMBER, 'transparent, light backgrounds'));
mkt('marketing/assets/logo-square.svg', marketingLogoSquare());

// ── rasterise every queued PNG via Chrome headless ──
console.log('Rendering ' + renders.length + ' PNGs via Chrome headless...');
const TMP = mkdtempSync(join(tmpdir(), 'brand-'));
let failures = 0;
try {
  const htmlPath = join(TMP, 'r.html');
  for (const r of renders) {
    const html =
      '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0}' +
      `#a{width:${r.w}px;height:${r.h}px}#a svg{display:block;width:100%;height:100%}</style>` +
      `<div id="a">${r.svg}</div>`;
    writeFileSync(htmlPath, html);
    // Headless Chrome writes the screenshot then exits; the timeout guards
    // against the occasional non-exiting process — by then the PNG is on disk.
    try {
      execFileSync(CHROME, [
        '--headless', '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
        '--no-first-run', '--no-default-browser-check',
        '--force-device-scale-factor=' + r.scale, '--default-background-color=00000000',
        '--screenshot=' + r.out, '--window-size=' + r.w + ',' + r.h, 'file://' + htmlPath,
      ], { stdio: 'ignore', timeout: 60000, killSignal: 'SIGKILL' });
    } catch { /* fall through to the file-size check */ }
    let size = 0;
    try { size = statSync(r.out).size; } catch { /* not written */ }
    const rel = r.out.replace(BRAND + '/', '').replace(REPO + '/', '');
    if (size > 0) {
      console.log(`  png  ${rel}  (${r.w * r.scale}x${r.h * r.scale}, ${(size / 1024).toFixed(1)} KB)`);
    } else {
      console.log('  FAIL ' + rel);
      failures++;
    }
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(failures ? `Done — ${failures} render(s) failed.` : 'Done — all assets generated.');
