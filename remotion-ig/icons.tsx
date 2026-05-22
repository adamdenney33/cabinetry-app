// Tab icons inlined verbatim from brand/icons/individual/*.svg (Lucide-style
// strokes) plus a few utility glyphs. Stroke is currentColor-driven so a tab
// recolours exactly like the app does.
import React from 'react';

type IconProps = { size?: number; color?: string; sw?: number };

const Base: React.FC<
  IconProps & { children: React.ReactNode; sw?: number }
> = ({ size = 24, color = '#111', sw = 2, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    // stroke set via style (not attribute) so CSS var() / --pc-accent resolves
    style={{ display: 'block', stroke: color }}
  >
    {children}
  </svg>
);

// ── 8 nav-tab icons ──────────────────────────────────────────────
export const IcoDashboard: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Base>
);

export const IcoCutList: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 1.5}>
    <path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z" />
    <circle cx="12" cy="12" r="1.5" />
  </Base>
);

export const IcoCabinet: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 21V9" />
  </Base>
);

export const IcoStock: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </Base>
);

export const IcoOrders: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </Base>
);

export const IcoQuotes: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </Base>
);

export const IcoClients: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </Base>
);

export const IcoSchedule: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </Base>
);

// ── utility glyphs ───────────────────────────────────────────────
export const IcoPlus: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2.4}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Base>
);

export const IcoSearch: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.5" y2="16.5" />
  </Base>
);

export const IcoChevronDown: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2.2}>
    <polyline points="6 9 12 15 18 9" />
  </Base>
);

export const IcoArrowRight: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2.2}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </Base>
);

export const IcoCheck: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2.6}>
    <polyline points="20 6 9 17 4 12" />
  </Base>
);

export const IcoSparkle: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 1.8}>
    <path d="M12 2 L13.8 8.2 L20 10 L13.8 11.8 L12 18 L10.2 11.8 L4 10 L10.2 8.2 Z" />
  </Base>
);

export const IcoX: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2.2}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Base>
);

export const IcoGear: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </Base>
);

export const IcoClock: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <circle cx="12" cy="12" r="9" />
    <polyline points="12 7 12 12 16 14" />
  </Base>
);

export const IcoKey: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <circle cx="7.5" cy="15.5" r="4" />
    <path d="M10.3 12.7 L20 3M16 7l3 3M14 9l2 2" />
  </Base>
);

export const IcoMenu: React.FC<IconProps> = (p) => (
  <Base {...p} sw={p.sw ?? 2}>
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </Base>
);

export const TAB_ICONS = {
  dashboard: IcoDashboard,
  cutlist: IcoCutList,
  cabinet: IcoCabinet,
  stock: IcoStock,
  orders: IcoOrders,
  quotes: IcoQuotes,
  clients: IcoClients,
  schedule: IcoSchedule,
} as const;

export type TabKey = keyof typeof TAB_ICONS;
