/**
 * Shared in-app UI atoms (badges, sub-tab bar, sidebar, smart input, panel layout).
 * Styling mirrors the real app so every screen is consistent.
 */
import React from 'react';
import { C } from '../theme';
import { PlusIcon, SearchIcon, ArrowRight } from '../icons';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'teal';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  gray: { bg: '#ececec', fg: '#777777' },
  blue: { bg: 'rgba(80,140,220,0.15)', fg: '#3f72b8' },
  green: { bg: 'rgba(61,153,112,0.16)', fg: '#2f8460' },
  amber: { bg: 'rgba(232,168,56,0.18)', fg: '#b07614' },
  red: { bg: 'rgba(224,82,82,0.14)', fg: '#c0392b' },
  teal: { bg: 'rgba(13,148,136,0.14)', fg: '#0c8278' },
};

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; style?: React.CSSProperties }> = ({ tone = 'gray', children, style }) => {
  const t = TONES[tone];
  return (
    <span style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, letterSpacing: 0.2, whiteSpace: 'nowrap', ...style }}>{children}</span>
  );
};

export const statusTone = (s: string): Tone => {
  switch (s) {
    case 'Draft': return 'gray';
    case 'Sent': return 'blue';
    case 'Approved': return 'green';
    case 'In Production': return 'amber';
    case 'Confirmed': return 'blue';
    case 'Complete': return 'green';
    default: return 'gray';
  }
};

/** The split sub-tab bar used on Cabinet / Cut List tabs. */
export const SubTabBar: React.FC<{ left: { label: string; active?: boolean }[]; right: { label: string; active?: boolean }[]; leftWidth: number }> = ({ left, right, leftWidth }) => {
  const Item: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
    <div style={{ position: 'relative', padding: '14px 4px 13px', fontSize: 14, fontWeight: active ? 700 : 500, color: active ? C.text : C.muted }}>
      {label}
      {active && <div style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, background: C.accent, borderRadius: 2 }} />}
    </div>
  );
  return (
    <div style={{ display: 'flex', background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      <div style={{ width: leftWidth, display: 'flex', gap: 26, padding: '0 24px', justifyContent: 'center', borderRight: `1px solid ${C.border2}` }}>
        {left.map((i) => <Item key={i.label} {...i} />)}
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 26, padding: '0 28px', justifyContent: 'center' }}>
        {right.map((i) => <Item key={i.label} {...i} />)}
      </div>
    </div>
  );
};

export const Sidebar: React.FC<{ width: number; children: React.ReactNode }> = ({ width, children }) => (
  <div style={{ width, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: 22, overflow: 'hidden' }}>{children}</div>
);

export const SmartInput: React.FC<{ placeholder: string }> = ({ placeholder }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '11px 13px', color: C.muted, fontSize: 14 }}>
      <SearchIcon size={15} color={C.muted} />
      {placeholder}
    </div>
    <div style={{ width: 40, background: C.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
      <PlusIcon size={17} color="#fff" />
    </div>
  </div>
);

export const PrimaryBtn: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: C.accent, color: '#fff', fontWeight: 700, fontSize: 14, padding: '13px 16px', borderRadius: 9, textAlign: 'center', boxShadow: '0 2px 8px rgba(232,168,56,0.35)', ...style }}>{children}</div>
);

export const GhostBtn: React.FC<{ children: React.ReactNode; danger?: boolean; style?: React.CSSProperties }> = ({ children, danger, style }) => (
  <div style={{ border: `1px solid ${C.border}`, background: C.surface, color: danger ? C.danger : C.text2, fontWeight: 600, fontSize: 12.5, padding: '7px 12px', borderRadius: 7, ...style }}>{children}</div>
);

export const GoToLink: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, fontWeight: 600, fontSize: 12.5, padding: '7px 12px', borderRadius: 7 }}>
    {children} <ArrowRight size={13} color={C.text2} />
  </div>
);

/** Section label used in sidebars (e.g. RECENT QUOTES). */
export const SideLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', margin: '20px 0 10px' }}>{children}</div>
);

export const ContentHeader: React.FC<{ icon?: React.ReactNode; title: string; right?: React.ReactNode }> = ({ icon, title, right }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
    {icon}
    <div style={{ fontSize: 21, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>{title}</div>
    <div style={{ marginLeft: 'auto' }}>{right}</div>
  </div>
);
