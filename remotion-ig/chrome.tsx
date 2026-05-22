// The app's persistent chrome: the ink header bar (wordmark + BETA + tool
// icons) and the light chrome-tab strip with the active tab punched out in
// white under an amber accent line. Mirrors index.html / styles.css.
import React from 'react';
import { C } from './theme';
import { FONT } from './fonts';
import {
  TAB_ICONS,
  TabKey,
  IcoKey,
  IcoClock,
  IcoGear,
  IcoMenu,
} from './icons';
import { useBrand } from './brand';

export const AppHeader: React.FC<{ h?: number }> = ({ h = 62 }) => {
  const { betaTag } = useBrand();
  return (
  <div
    style={{
      height: h,
      background: C.ink,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 26px',
      fontFamily: FONT,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        style={{
          fontSize: 25,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          color: '#fff',
        }}
      >
        ProCabinet<span style={{ color: C.accent }}>.App</span>
      </span>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.8px',
          color: 'rgba(255,255,255,0.5)',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.12)',
          padding: '3px 8px',
          borderRadius: 5,
        }}
      >
        {betaTag}
      </span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {[IcoKey, IcoClock, IcoGear, IcoMenu].map((Ico, i) => (
        <Ico key={i} size={20} color="rgba(255,255,255,0.62)" />
      ))}
    </div>
    </div>
  );
};

// Icon-only tab strip used as a brand motif on cover/CTA slides (mirrors
// brand/icons/icons-only-sheet — the 8 nav glyphs on a rounded bar).
export const IconStrip: React.FC<{ light?: boolean; size?: number }> = ({ light, size = 38 }) => {
  const keys: TabKey[] = ['dashboard', 'cutlist', 'cabinet', 'stock', 'orders', 'quotes', 'clients', 'schedule'];
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '18px 20px',
        background: light ? 'rgba(255,255,255,0.06)' : C.tabbar,
        border: `1px solid ${light ? 'rgba(255,255,255,0.12)' : C.border}`,
        borderRadius: 18,
      }}
    >
      {keys.map((k) => {
        const Ico = TAB_ICONS[k];
        return (
          <div key={k} style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ico size={size} color={light ? 'rgba(255,255,255,0.82)' : C.ink} />
          </div>
        );
      })}
    </div>
  );
};

const TAB_ORDER: { key: TabKey; label: string; badge?: string; badgeKind?: 'red' | 'amber' }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'cutlist', label: 'Cut List' },
  { key: 'cabinet', label: 'Cabinet' },
  { key: 'stock', label: 'Stock', badge: '2', badgeKind: 'red' },
  { key: 'orders', label: 'Orders', badge: '8', badgeKind: 'amber' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'clients', label: 'Clients' },
  { key: 'schedule', label: 'Schedule' },
];

export const TabBar: React.FC<{ active: TabKey }> = ({ active }) => (
  <div
    style={{
      background: C.tabbar,
      padding: '9px 14px 0',
      display: 'flex',
      alignItems: 'flex-end',
      gap: 2,
      fontFamily: FONT,
    }}
  >
    {TAB_ORDER.map(({ key, label, badge, badgeKind }) => {
      const on = key === active;
      const Ico = TAB_ICONS[key];
      const fg = on ? C.text : C.muted;
      return (
        <div
          key={key}
          style={{
            position: 'relative',
            flex: '1 1 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: '11px 6px 13px',
            borderRadius: '9px 9px 0 0',
            background: on ? C.surface : 'transparent',
            border: on ? `1px solid ${C.border}` : '1px solid transparent',
            borderBottom: on ? `1px solid ${C.surface}` : 'none',
            marginBottom: on ? -1 : 0,
            color: fg,
            fontSize: 15,
            fontWeight: on ? 700 : 500,
            whiteSpace: 'nowrap',
          }}
        >
          {on && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 6,
                right: 6,
                height: 3,
                borderRadius: 3,
                background: C.accent,
              }}
            />
          )}
          <Ico size={18} color={fg} />
          <span>{label}</span>
          {badge && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
                background: badgeKind === 'red' ? C.red : C.accent,
                borderRadius: 20,
                minWidth: 18,
                height: 18,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 5px',
              }}
            >
              {badge}
            </span>
          )}
        </div>
      );
    })}
  </div>
);
