/**
 * Demo-video design tokens — mirrors the real app's styles.css :root vars so the
 * React replicas read as the actual product. Source of truth: styles.css lines 5-27.
 * This project is fully self-contained and does NOT depend on the existing remotion/ work.
 */

export const FPS = 30;

export const C = {
  accent: '#e8a838', // brand amber/gold
  accentDim: 'rgba(232,168,56,0.12)',
  accent2: '#0d9488', // teal
  danger: '#e05252',
  success: '#3d9970',
  warn: '#e8a838',

  bg: '#f2f2f2',
  surface: '#ffffff',
  surface2: '#f7f7f7',
  border: '#e0e0e0',
  border2: '#ebebeb',
  text: '#111111',
  text2: '#444444',
  muted: '#888888',
  headerBg: '#111111',
  headerFg: '#ffffff',
  tabbar: '#e2e2e2',

  // badge bases (derived from styles.css badge rules)
  blue: '#508cdc',
  green: '#3d9970',
  red: '#e05252',
  teal: '#0d9488',
  gray: '#888888',

  zebra: 'rgba(0,0,0,0.025)',
} as const;

export const RADIUS = 10;
export const SHADOW = '0 1px 4px rgba(0,0,0,0.07)';
export const SHADOW_MD = '0 4px 16px rgba(0,0,0,0.10)';

// System-UI feel of the real app, matched with Inter on Google Fonts.
export const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Soft cinematic backdrop the app window floats on. */
export const BACKDROP = 'radial-gradient(120% 120% at 50% 0%, #2a2a2e 0%, #161618 60%, #0d0d0f 100%)';

// ── App-window geometry (logical px the app is drawn at, then scaled to frame) ──
export const WIN = {
  width: 1640,
  height: 936,
  headerH: 56,
  tabH: 46,
};

// ── Brand strings ──
export const BRAND = {
  name: 'ProCabinet.App',
  badge: 'BETA v0.12.0',
  tagline: 'The workshop OS for cabinet makers',
  url: 'procabinet.app',
};

// ── The 8 tabs, in real app order ──
export type TabId =
  | 'dashboard'
  | 'cutlist'
  | 'cabinet'
  | 'stock'
  | 'orders'
  | 'quotes'
  | 'clients'
  | 'schedule';

export const TABS: { id: TabId; label: string; badge?: string; badgeColor?: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'cutlist', label: 'Cut List' },
  { id: 'cabinet', label: 'Cabinet' },
  { id: 'stock', label: 'Stock', badge: '1', badgeColor: C.danger },
  { id: 'orders', label: 'Orders', badge: '3' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'clients', label: 'Clients' },
  { id: 'schedule', label: 'Schedule' },
];

// ── Shared demo data (matches the marketing screenshots) ──
export const QUOTES = [
  { no: 'QUO-1044', client: 'Sarah Mitchell', project: 'Mitchell Walk-in Robe', date: '2026-05-14', cabinets: 4, status: 'Draft', price: '£2,891', stage: 0 },
  { no: 'QUO-1045', client: 'Priya Nair', project: 'Nair Kitchen Island', date: '2026-05-08', cabinets: 4, status: 'Sent', price: '£1,014', stage: 1 },
  { no: 'QUO-1043', client: 'James Whitfield', project: 'Whitfield Laundry Cabinets', date: '2026-05-05', cabinets: 6, status: 'Sent', price: '£1,386', stage: 1 },
  { no: 'QUO-1046', client: 'Daniel & Emma Cole', project: 'Cole Study Built-ins', date: '2026-04-30', cabinets: 6, status: 'Approved', price: '£2,359', stage: 2 },
  { no: 'QUO-1042', client: 'Sarah Mitchell', project: 'Mitchell Kitchen Renovation', date: '2026-04-26', cabinets: 9, status: 'Approved', price: '£2,530', stage: 2 },
];

export const ORDERS = [
  { no: 'ORD-0315', client: 'Daniel & Emma Cole', project: 'Cole Study Built-ins', due: '2026-06-01', price: '£5,980', status: 'In Production', color: '#9333ea' },
  { no: 'ORD-0312', client: 'Sarah Mitchell', project: 'Mitchell Kitchen Renovation', due: '2026-06-09', price: '£8,450', status: 'Confirmed', color: '#e05252' },
  { no: 'ORD-0313', client: 'James Whitfield', project: 'Whitfield Laundry Cabinets', due: '2026-06-23', price: '£3,200', status: 'Confirmed', color: '#0d9488' },
  { no: 'ORD-0314', client: 'Sarah Mitchell', project: 'Mitchell Bathroom Vanity', due: '2026-07-14', price: '£2,650', status: 'Confirmed', color: '#508cdc' },
  { no: 'ORD-0316', client: 'Westside Property Group', project: 'Westside Apartment 12B', due: '2026-07-27', price: '£11,200', status: 'Confirmed', color: '#e8a838' },
];

// Cabinets shown in the Quote Builder money screen.
export const CABINETS = [
  {
    name: 'Base Cabinet 600', dims: '600 × 720 × 560 mm', price: 1111,
    materials: '£7.83', labour: '£179.22', labourHrs: '2.4 hrs @ £75/hr',
    unit: '£187', units: 4, unitsTotal: '£748', markup: '+£262', tax: '+£101', meta: '2 cores · 1 shelves',
  },
  {
    name: 'Wall Cabinet 600', dims: '600 × 720 × 320 mm', price: 862,
    materials: '£9.24', labour: '£184.35', labourHrs: '2.5 hrs @ £75/hr',
    unit: '£194', units: 3, unitsTotal: '£581', markup: '+£203', tax: '+£78', meta: '2 cores · 2 shelves',
  },
  {
    name: 'Drawer Base 800', dims: '800 × 720 × 560 mm', price: 557,
    materials: '£7.42', labour: '£367.53', labourHrs: '4.9 hrs @ £75/hr',
    unit: '£190', units: 1, unitsTotal: '£190', markup: '+£67', tax: '+£26', meta: '1 core · 4 drawers',
  },
];
