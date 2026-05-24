// Render sample PDFs from the REAL builders in src/cutlist.js.
//
// Why this exists: every PDF in the app is drawn by jsPDF inside the browser,
// wired to window/DOM globals and live app state. To review spacing/layout
// without clicking through the app, this harness loads the actual drawing code
// (the `_build*PDF` functions + shared header/footer helpers) into a Node vm
// sandbox, stubs the handful of globals they touch, feeds them seed data, and
// writes one PDF per template into pdf-samples/.
//
// It loads the code by slicing cutlist.js between two stable markers, so edits
// to the builders are reflected on the next run (no copy to drift).
//
//   node scripts/render-pdf-samples.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable/es';

applyPlugin(jsPDF);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'pdf-samples');
mkdirSync(OUT, { recursive: true });

// ── extract the PDF section from cutlist.js (between two stable markers) ──
const cutlistSrc = readFileSync(join(ROOT, 'src', 'cutlist.js'), 'utf8');
const START = '// PDF HEADER / FOOTER HELPERS';
const END = '\nfunction toggleLayoutRotate()';
const sliceStart = cutlistSrc.indexOf(START);
const sliceEnd = cutlistSrc.indexOf(END);
if (sliceStart < 0 || sliceEnd < 0) throw new Error('PDF section markers not found in cutlist.js');
const pdfSlice = cutlistSrc.slice(sliceStart, sliceEnd);

// ── tiny solid-colour PNG generator (for logo + cut-list sheet placeholders) ──
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function makePng(w, h, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolour RGB
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}

// ════════════════════════════════════════════════════════════
// SEED DATA — representative of a small UK cabinet shop
// ════════════════════════════════════════════════════════════
const biz = {
  name: 'Crafted Cabinetry Co.',
  address: '14 Joiners Yard, Bristol BS1 4DJ',
  phone: '0117 496 0231',
  email: 'studio@craftedcabinetry.co.uk',
  abn: '38 294 117 660',
  bank_details:
    'Bank: Lloyds\nAccount name: Crafted Cabinetry Co.\nSort code: 30-00-00\nAccount no: 12345678\nReference: please quote your invoice number',
};

// Quote/order lines. Cabinet rows carry a pre-baked _sub so the harness needn't
// run the cabinet cost engine; item/stock/labour are computed by _lineSubtotal.
const lines = [
  { line_kind: 'cabinet', name: 'Base unit — 900mm, 3 drawer', w_mm: 900, h_mm: 720, d_mm: 560, material: '18mm birch ply', drawer_count: 3, qty: 2, discount: 0, _sub: { materials: 560, labour: 240 } },
  { line_kind: 'cabinet', name: 'Tall larder unit', w_mm: 600, h_mm: 2100, d_mm: 600, material: '18mm birch ply', door_count: 2, qty: 1, discount: 0, _sub: { materials: 430, labour: 180 } },
  { line_kind: 'cabinet', name: 'Wall cabinet — glazed door', w_mm: 800, h_mm: 720, d_mm: 330, material: '18mm MR MDF, sprayed satin', door_count: 2, qty: 3, discount: 10, _sub: { materials: 300, labour: 150 } },
  { line_kind: 'item', name: 'Blum Tandembox drawer runners', qty: 6, unit_price: 48, discount: 0 },
  { line_kind: 'item', name: 'Brushed brass cup handles', qty: 14, unit_price: 9.5, discount: 0 },
  { line_kind: 'stock', name: 'Birch plywood sheet 2440×1220×18', qty: 8, unit_price: 62, discount: 0 },
  { line_kind: 'labour', name: 'On-site installation', labour_hours: 24, unit_price: 55, discount: 0 },
  { line_kind: 'labour', name: 'Template & survey', labour_hours: 4, unit_price: 55, discount: 0 },
];

const quote = {
  id: 42, quote_number: 'QUO-0042', date: '24 May 2026', status: 'sent',
  name: 'Kitchen Renovation — Shaker Style', _clientName: 'Mr & Mrs Hartley',
  markup: 12, tax: 20, discount: 5, stock_markup: 10,
  notes:
    'Prices include template, manufacture and installation. Handles supplied by client unless otherwise specified. Lead time approximately 6–8 weeks from receipt of deposit and final sign-off of drawings.',
};

const order = {
  id: 19, order_number: 'ORD-0019', status: 'production',
  value: 18650, due: '2026-07-15',
  name: 'Kitchen Renovation — Shaker Style', _clientName: 'Mr & Mrs Hartley',
  markup: 12, tax: 20, discount: 5, stock_markup: 10,
  notes: 'Deposit of 50% received 02 May 2026. Balance due on completion. Worktops supplied and fitted by others.',
};

const stockItems = [
  { id: 1, name: 'Birch plywood 2440×1220×18', sku: 'BP-18', w: 2440, h: 1220, qty: 24, low: 10, cost: 62, supplier: 'Timberwise' },
  { id: 2, name: 'MR MDF 2440×1220×18', sku: 'MDF-18', w: 2440, h: 1220, qty: 8, low: 10, cost: 38, supplier: 'Timberwise' },
  { id: 3, name: 'Oak veneered MDF 2440×1220×19', sku: 'OAK-19', w: 2440, h: 1220, qty: 5, low: 6, cost: 95, supplier: 'Decorative Panels' },
  { id: 4, name: 'White melamine 2800×2070×18', sku: 'MEL-W18', w: 2800, h: 2070, qty: 31, low: 8, cost: 44, supplier: 'EGGER' },
  { id: 5, name: 'Blum Tandembox runner 500mm', sku: 'BLM-TB500', w: 500, h: 84, qty: 60, low: 20, cost: 24, supplier: 'Häfele' },
  { id: 6, name: 'Blum Clip-top hinge 110°', sku: 'BLM-CT110', w: 0, h: 0, qty: 4, low: 24, cost: 6.2, supplier: 'Häfele' },
  { id: 7, name: 'Brushed brass cup handle', sku: 'HDL-BB', w: 96, h: 0, qty: 18, low: 12, cost: 9.5, supplier: 'Armac Martin' },
  { id: 8, name: 'Edge banding birch 22mm', sku: 'EB-BIRCH22', w: 22, h: 0, qty: 3, low: 5, cost: 18, supplier: 'Timberwise' },
  { id: 9, name: 'Worktop oiled oak 3000×620×40', sku: 'WT-OAK40', w: 3000, h: 620, qty: 2, low: 2, cost: 210, supplier: 'Worktop Express' },
  { id: 10, name: 'Adjustable cabinet leg 100mm', sku: 'LEG-100', w: 100, h: 100, qty: 120, low: 40, cost: 1.4, supplier: 'Häfele' },
];

// Cut-list seed: two layouts, the second collapses 2 identical sheets.
const sheetPng = makePng(488, 244, [232, 237, 242]);
const cut = {
  biz,
  layouts: [
    {
      util: 0.86, qty: 1, physIndexes: [0], sheet: { w: 2440, h: 1220, name: 'Birch ply 18mm' },
      placed: [
        { item: { label: 'Gable L', w: 720, h: 560, color: '#4a9eff' } },
        { item: { label: 'Gable R', w: 720, h: 560, color: '#4a9eff' } },
        { item: { label: 'Base', w: 864, h: 560, color: '#22c55e' } },
        { item: { label: 'Top rail', w: 864, h: 120, color: '#22c55e' } },
        { item: { label: 'Shelf', w: 864, h: 540, color: '#f59e0b' } },
        { item: { label: 'Back', w: 880, h: 700, color: '#a855f7' } },
      ],
    },
    {
      util: 0.78, qty: 2, physIndexes: [1, 2], sheet: { w: 2440, h: 1220, name: 'Birch ply 18mm' },
      placed: [
        { item: { label: 'Door', w: 597, h: 715, color: '#ef4444' } },
        { item: { label: 'Door', w: 597, h: 715, color: '#ef4444' } },
        { item: { label: 'Drawer front', w: 894, h: 180, color: '#14b8a6' } },
        { item: { label: 'Drawer front', w: 894, h: 280, color: '#14b8a6' } },
      ],
    },
  ],
  imgs: [sheetPng, sheetPng],
  pieces: [
    { label: 'Gable L', w: 720, h: 560, qty: 4, material: 'Birch ply 18mm', grain: 'v', color: '#4a9eff' },
    { label: 'Gable R', w: 720, h: 560, qty: 4, material: 'Birch ply 18mm', grain: 'v', color: '#4a9eff' },
    { label: 'Base', w: 864, h: 560, qty: 2, material: 'Birch ply 18mm', grain: 'h', color: '#22c55e' },
    { label: 'Shelf', w: 864, h: 540, qty: 6, material: 'Birch ply 18mm', grain: 'none', color: '#f59e0b' },
    { label: 'Back', w: 880, h: 700, qty: 2, material: 'MR MDF 6mm', grain: 'none', color: '#a855f7' },
    { label: 'Door', w: 597, h: 715, qty: 4, material: 'MR MDF sprayed', grain: 'v', color: '#ef4444' },
    { label: 'Drawer front', w: 894, h: 180, qty: 3, material: 'MR MDF sprayed', grain: 'h', color: '#14b8a6' },
    { label: 'Drawer front', w: 894, h: 280, qty: 3, material: 'MR MDF sprayed', grain: 'h', color: '#14b8a6' },
  ],
  u: 'mm', cur: '£', totalPieces: 28, avgUtil: '82.0', matCost: 1124,
};

const logoPng = makePng(140, 64, [37, 99, 235]);

// ════════════════════════════════════════════════════════════
// SANDBOX — globals the PDF slice reads, plus capture plumbing
// ════════════════════════════════════════════════════════════
const captured = { blob: null };
const cfg = { logo: '', pro: false };
const results = []; // { name, blob }

// Faithful re-implementations of the two pure helpers the slice imports.
function _lineSubtotal(row) {
  const kind = row.line_kind || 'cabinet';
  const disc = parseFloat(row.discount) || 0;
  const discMult = 1 - disc / 100;
  if (kind === 'item' || kind === 'stock') {
    const qty = parseFloat(row.qty) || 1;
    const price = parseFloat(row.unit_price) || 0;
    return { materials: qty * price * discMult, labour: 0 };
  }
  if (kind === 'labour') {
    const hrs = parseFloat(row.labour_hours) || 0;
    const rate = parseFloat(row.unit_price);
    const r = isFinite(rate) ? rate : 65;
    return { materials: 0, labour: hrs * r * discMult };
  }
  if (row._sub) return { materials: row._sub.materials * (row.qty || 1) * discMult, labour: row._sub.labour * (row.qty || 1) * discMult };
  return { materials: 0, labour: 0 };
}
function _lineDisplay(row) {
  const kind = row.line_kind || 'cabinet';
  const sub = _lineSubtotal(row);
  const total = sub.materials + sub.labour;
  if (kind === 'cabinet') {
    const dims = [row.w_mm, row.h_mm, row.d_mm].filter(Boolean).join('×');
    const parts = [];
    if (dims) parts.push(dims + 'mm');
    if (row.material) parts.push(row.material);
    if ((row.door_count || 0) > 0) parts.push(row.door_count + ' door' + (row.door_count !== 1 ? 's' : ''));
    if ((row.drawer_count || 0) > 0) parts.push(row.drawer_count + ' drawer' + (row.drawer_count !== 1 ? 's' : ''));
    return { kind, name: row.name || 'Cabinet', detail: parts.join(', '), qtyText: (row.qty || 1) > 1 ? '×' + row.qty : '', total };
  }
  if (kind === 'item' || kind === 'stock') {
    const qty = row.qty || 1;
    const price = row.unit_price || 0;
    const fallbackName = kind === 'stock' ? 'Stock item' : 'Item';
    return { kind, name: row.name || fallbackName, detail: qty + ' × ' + price, qtyText: '', total };
  }
  const hrs = row.labour_hours || 0;
  const rate = row.unit_price ?? 65;
  return { kind, name: row.name || 'Labour', detail: hrs + 'h @ ' + rate + '/hr', qtyText: '', total };
}

function formatDim(val) {
  if (val == null || isNaN(val)) return '0';
  return String(Math.round(val));
}

const sandbox = {
  console,
  setTimeout: () => 0,
  Blob,
  URL: { createObjectURL: (b) => { captured.blob = b; return 'blob:x'; }, revokeObjectURL: () => {} },
  document: { createElement: () => ({ click() {} }), body: { appendChild() {}, removeChild() {} } },
  window: { jspdf: { jsPDF }, currency: '£', units: 'metric', unitFormat: { mode: 'mm', decimals: 0 }, open() {} },
  // app stubs
  _toast: () => {},
  _track: () => {},
  getBizInfo: () => biz,
  getBizLogo: () => cfg.logo,
  isPro: () => cfg.pro,
  quoteClient: (q) => q._clientName || '',
  quoteProject: (q) => q.name || '',
  orderClient: (o) => o._clientName || '',
  orderProject: (o) => o.name || '',
  _lineSubtotal, _lineDisplay, formatDim,
  _ssGet: (id) => { const it = stockItems.find((s) => s.id === id); return it ? { supplier: it.supplier || '', url: '' } : {}; },
  stockItems,
  // mutable layout-state globals
  layoutRotate: false, clShowSummary: true, clShowCutList: true,
  // seed + capture plumbing visible to the driver
  __q: quote, __ql: lines, __o: order, __ol: lines, __cut: cut, __logoData: logoPng,
  __emit: (name) => { results.push({ name, blob: captured.blob }); captured.blob = null; },
  __set: (k, v) => { cfg[k] = v; },
};

vm.createContext(sandbox);

// Driver runs in the SAME script as the slice so every function + the
// _PROCAB_FOOTER_VARIANT const are in scope. Each builder fills captured.blob
// (via URL.createObjectURL) and __emit snapshots it under a filename.
const driver = `
${pdfSlice}

// ── render every template ──
_buildQuotePDF(__q, __ql);                          __emit('quote');
__set('pro', true);
_buildQuotePDF(__q, __ql);                          __emit('quote-pro-tier');
__set('pro', false);
__set('logo', __logoData);
_buildQuotePDF(__q, __ql);                          __emit('quote-with-logo');
__set('logo', '');

_buildStockPDF();                                   __emit('stock-inventory');
_buildWorkOrderPDF(__o);                            __emit('work-order');
_buildOrderDocPDF(__o, __ol, 'order_confirmation'); __emit('order-confirmation');
_buildOrderDocPDF(__o, __ol, 'proforma');           __emit('proforma-invoice');
_buildOrderDocPDF(__o, __ol, 'invoice');            __emit('tax-invoice');

layoutRotate = false; _buildCutListPDF(__cut);      __emit('cut-list-landscape');
layoutRotate = true;  _buildCutListPDF(__cut);      __emit('cut-list-portrait');
`;

vm.runInContext(driver, sandbox, { filename: 'pdf-slice.js' });

// ── write captured blobs to disk ──
for (const { name, blob } of results) {
  if (!blob) { console.error('  ✗ %s — no blob captured', name); continue; }
  const bytes = Buffer.from(await blob.arrayBuffer());
  const file = join(OUT, name + '.pdf');
  writeFileSync(file, bytes);
  console.log('  ✓ %s.pdf (%d KB)', name, Math.round(bytes.length / 1024));
}
console.log('\nWrote %d sample PDFs to %s', results.length, OUT);
