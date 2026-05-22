/**
 * Tab + UI icons. Paths copied verbatim from the real app's index.html nav so the
 * chrome is identical to production.
 */
import React from 'react';
import type { TabId } from './theme';

type IconProps = { size?: number; strokeWidth?: number; color?: string };

const wrap = (size: number, sw: number, color: string, children: React.ReactNode) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

export const TabIcon: React.FC<IconProps & { tab: TabId }> = ({ tab, size = 15, strokeWidth, color = 'currentColor' }) => {
  switch (tab) {
    case 'dashboard':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      ));
    case 'cutlist':
      return wrap(size, strokeWidth ?? 1.5, color, (
        <>
          <path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z" />
          <circle cx="12" cy="12" r="1.5" />
        </>
      ));
    case 'cabinet':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </>
      ));
    case 'stock':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </>
      ));
    case 'orders':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <line x1="8" y1="13" x2="16" y2="13" />
          <line x1="8" y1="17" x2="13" y2="17" />
        </>
      ));
    case 'quotes':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </>
      ));
    case 'clients':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </>
      ));
    case 'schedule':
      return wrap(size, strokeWidth ?? 2, color, (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </>
      ));
  }
};

// Small generic icons used inside screens.
export const PlusIcon: React.FC<IconProps> = ({ size = 14, strokeWidth = 2, color = 'currentColor' }) =>
  wrap(size, strokeWidth, color, <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>);

export const SearchIcon: React.FC<IconProps> = ({ size = 14, strokeWidth = 2, color = 'currentColor' }) =>
  wrap(size, strokeWidth, color, <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>);

export const ArrowRight: React.FC<IconProps> = ({ size = 14, strokeWidth = 2, color = 'currentColor' }) =>
  wrap(size, strokeWidth, color, <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>);

export const SparkleIcon: React.FC<IconProps> = ({ size = 14, strokeWidth = 2, color = 'currentColor' }) =>
  wrap(size, strokeWidth, color, <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />);
