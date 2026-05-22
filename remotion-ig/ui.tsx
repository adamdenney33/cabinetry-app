// Shared UI primitives that mirror the app's component look: the browser
// window wrapper, cards, status badges, buttons and the order pipeline stepper.
import React from 'react';
import { C, RADIUS, SHADOW } from './theme';
import { FONT, numeric } from './fonts';
import { AppHeader, TabBar } from './chrome';
import { TabKey } from './icons';

// ── Browser window wrapping the live app chrome ──────────────────
export const Window: React.FC<{
  active: TabKey;
  children: React.ReactNode;
  url?: string;
}> = ({ active, children, url = 'procabinet.app' }) => (
  <div
    style={{
      borderRadius: RADIUS.window,
      overflow: 'hidden',
      background: C.surface,
      border: `1px solid ${C.border}`,
      boxShadow: SHADOW.window,
      width: '100%',
      fontFamily: FONT,
    }}
  >
    <div
      style={{
        height: 44,
        background: C.surface2,
        borderBottom: `1px solid ${C.borderSoft}`,
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 14,
      }}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((d) => (
          <span
            key={d}
            style={{ width: 13, height: 13, borderRadius: '50%', background: d }}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          height: 26,
          borderRadius: 7,
          background: '#ececec',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          color: C.muted,
          fontWeight: 500,
          maxWidth: 360,
          margin: '0 auto',
        }}
      >
        {url}
      </div>
      <div style={{ width: 60 }} />
    </div>
    <AppHeader />
    <TabBar active={active} />
    <div style={{ background: C.bg }}>{children}</div>
  </div>
);

// ── Card ──────────────────────────────────────────────────────────
export const Card: React.FC<
  React.PropsWithChildren<{ style?: React.CSSProperties; pad?: number }>
> = ({ children, style, pad = 18 }) => (
  <div
    style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: RADIUS.md,
      boxShadow: SHADOW.card,
      padding: pad,
      ...style,
    }}
  >
    {children}
  </div>
);

// ── Status badge ──────────────────────────────────────────────────
type Tone = 'draft' | 'sent' | 'approved' | 'production' | 'confirmed' | 'low';
const TONE: Record<Tone, { bg: string; fg: string; label?: string }> = {
  draft: { bg: C.greyDim, fg: C.muted },
  sent: { bg: C.blueDim, fg: C.blue },
  approved: { bg: C.greenDim, fg: C.green },
  production: { bg: C.amberDim, fg: '#bd7d12' },
  confirmed: { bg: C.blueDim, fg: C.blue },
  low: { bg: C.redDim, fg: C.red },
};

export const Badge: React.FC<{ tone: Tone; children: React.ReactNode }> = ({
  tone,
  children,
}) => {
  const t = TONE[tone];
  return (
    <span
      style={{
        background: t.bg,
        color: t.fg,
        fontSize: 13,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 6,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
};

export const SavedTag: React.FC = () => (
  <span
    style={{
      color: C.green,
      fontSize: 13,
      fontWeight: 800,
      letterSpacing: '0.6px',
    }}
  >
    SAVED
  </span>
);

// ── Buttons ───────────────────────────────────────────────────────
type BtnVariant = 'ghost' | 'amber' | 'link' | 'danger';
export const Btn: React.FC<
  React.PropsWithChildren<{ variant?: BtnVariant; style?: React.CSSProperties }>
> = ({ children, variant = 'ghost', style }) => {
  const base: React.CSSProperties = {
    fontFamily: FONT,
    fontSize: 14.5,
    fontWeight: 600,
    padding: '9px 14px',
    borderRadius: 8,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  };
  const styles: Record<BtnVariant, React.CSSProperties> = {
    ghost: { background: C.surface, color: C.text, border: `1px solid ${C.border}` },
    amber: {
      background: C.accent,
      color: '#1a1a1a',
      border: '1px solid transparent',
      boxShadow: '0 6px 18px rgba(232,168,56,0.30)',
    },
    link: { background: 'transparent', color: C.text2, border: '1px solid transparent', padding: '9px 8px' },
    danger: { background: 'transparent', color: C.red, border: '1px solid transparent', padding: '9px 10px' },
  };
  return <div style={{ ...base, ...styles[variant], ...style }}>{children}</div>;
};

// ── Money / breakdown row ─────────────────────────────────────────
export const MoneyRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  strong?: boolean;
  sub?: boolean;
  accent?: boolean;
}> = ({ label, value, strong, sub, accent }) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      padding: sub ? '3px 0' : '5px 0',
      fontSize: sub ? 14.5 : 16,
      color: accent ? C.accent : sub ? C.muted : C.text2,
      fontWeight: strong ? 800 : 500,
    }}
  >
    <span>{label}</span>
    <span style={{ ...numeric, fontWeight: strong ? 800 : 600, color: accent ? C.accent : C.text }}>
      {value}
    </span>
  </div>
);

// ── Order pipeline stepper ────────────────────────────────────────
export const Stepper: React.FC<{
  steps: string[];
  active: number; // index of current stage (0-based)
  note?: string;
}> = ({ steps, active, note }) => (
  <div style={{ fontFamily: FONT }}>
    <div style={{ position: 'relative', height: 18, margin: '0 12px' }}>
      <div
        style={{
          position: 'absolute',
          top: 7,
          left: 0,
          right: 0,
          height: 3,
          background: C.border,
          borderRadius: 3,
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 7,
          left: 0,
          width: `${(active / (steps.length - 1)) * 100}%`,
          height: 3,
          background: C.teal,
          borderRadius: 3,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between' }}>
        {steps.map((_, i) => {
          const done = i <= active;
          return (
            <div
              key={i}
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: i === active ? C.accent : done ? C.teal : C.surface,
                border: `2px solid ${i === active ? C.accent : done ? C.teal : C.border}`,
              }}
            />
          );
        })}
      </div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 4px 0' }}>
      {steps.map((s, i) => (
        <span
          key={s}
          style={{
            fontSize: 12.5,
            fontWeight: i === active ? 800 : 600,
            letterSpacing: '0.4px',
            color: i === active ? C.text : i < active ? C.text2 : C.faint,
            flex: '1 1 0',
            textAlign: i === 0 ? 'left' : i === steps.length - 1 ? 'right' : 'center',
          }}
        >
          {s}
        </span>
      ))}
    </div>
    {note && (
      <div style={{ fontSize: 13, color: C.accent, fontWeight: 700, marginTop: 6, textAlign: 'center' }}>
        {note}
      </div>
    )}
  </div>
);

// small labelled input box (builder sidebar)
export const Field: React.FC<{ label: string; value: string; w?: number | string }> = ({
  label,
  value,
  w = '100%',
}) => (
  <div style={{ width: w, fontFamily: FONT }}>
    <div style={{ fontSize: 13.5, color: C.text2, fontWeight: 600, marginBottom: 6 }}>{label}</div>
    <div
      style={{
        height: 46,
        border: `1px solid ${C.border}`,
        borderRadius: 9,
        background: C.surface,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        fontSize: 17,
        fontWeight: 600,
        color: C.text,
        ...numeric,
      }}
    >
      {value}
    </div>
  </div>
);
