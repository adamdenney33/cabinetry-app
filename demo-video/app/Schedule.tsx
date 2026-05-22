import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { C, ORDERS } from '../theme';
import { Reveal, EASE_OUT, clampOpts } from '../primitives';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// May 2026 grid (Mon-first). Leading days from April are muted.
const WEEKS: { date: number; muted?: boolean }[][] = [
  [{ date: 27, muted: true }, { date: 28, muted: true }, { date: 29, muted: true }, { date: 30, muted: true }, { date: 1 }, { date: 2 }, { date: 3 }],
  [{ date: 4 }, { date: 5 }, { date: 6 }, { date: 7 }, { date: 8 }, { date: 9 }, { date: 10 }],
  [{ date: 11 }, { date: 12 }, { date: 13 }, { date: 14 }, { date: 15 }, { date: 16 }, { date: 17 }],
  [{ date: 18 }, { date: 19 }, { date: 20 }, { date: 21 }, { date: 22 }, { date: 23 }, { date: 24 }],
  [{ date: 25 }, { date: 26 }, { date: 27 }, { date: 28 }, { date: 29 }, { date: 30 }, { date: 31 }],
];

type Bar = { week: number; lane: number; start: number; end: number; color: string; label: string; due?: string };
const BARS: Bar[] = [
  { week: 3, lane: 0, start: 2, end: 5, color: '#e05252', label: 'ORD-0312 · Mitchell Kitchen Renovation' },
  { week: 3, lane: 1, start: 2, end: 4, color: '#9333ea', label: 'ORD-0315 · Cole Study Built-ins' },
  { week: 4, lane: 0, start: 0, end: 3, color: '#e05252', label: 'ORD-0312 · Mitchell Kitchen', due: 'Due 4d' },
  { week: 4, lane: 1, start: 2, end: 6, color: '#e8a838', label: 'ORD-0316 · Westside Apartment 12B', due: 'Due 6w' },
];

const WEEK_H = 96;

const OrderBar: React.FC<{ bar: Bar; index: number }> = ({ bar, index }) => {
  const frame = useCurrentFrame();
  const delay = 12 + index * 5;
  const grow = interpolate(frame, [delay, delay + 18], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const leftPct = (bar.start / 7) * 100;
  const widthPct = ((bar.end - bar.start + 1) / 7) * 100;
  return (
    <div
      style={{
        position: 'absolute',
        left: `calc(${leftPct}% + 4px)`,
        width: `calc(${widthPct}% - 8px)`,
        top: 30 + bar.lane * 26,
        height: 22,
        background: bar.color,
        borderRadius: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px',
        color: '#fff',
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        transform: `scaleX(${grow})`,
        transformOrigin: 'left center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', opacity: grow > 0.6 ? 1 : 0 }}>{bar.label}</span>
      {bar.due && <span style={{ background: 'rgba(0,0,0,0.85)', borderRadius: 3, padding: '1px 5px', fontSize: 9.5, flexShrink: 0, marginLeft: 6 }}>{bar.due}</span>}
    </div>
  );
};

export const Schedule: React.FC = () => {
  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 290, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 12 }}>Schedule</div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: C.text2, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>Sort by: Start date <span style={{ color: C.muted }}>▾</span></div>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: C.text2, marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>Filter by: All <span style={{ color: C.muted }}>▾</span></div>
        {ORDERS.map((o) => (
          <div key={o.no} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 0', borderBottom: `1px solid ${C.border2}` }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: o.color, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.no} · {o.client}</div>
              <div style={{ fontSize: 10.5, color: C.muted }}>{o.status} · Due {o.due.slice(5)}</div>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginTop: 16 }}>Working Hours · 8h/day</div>
      </div>

      {/* Calendar */}
      <div style={{ flex: 1, background: C.bg, padding: '14px 18px', overflow: 'hidden' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 10 }}>May 2026</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
          {WEEKDAYS.map((d) => <div key={d} style={{ fontSize: 11, fontWeight: 700, color: C.muted, padding: '0 6px 6px' }}>{d}</div>)}
        </div>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {WEEKS.map((week, wi) => (
            <Reveal key={wi} delay={4 + wi * 2} dur={10} y={0}>
              <div style={{ position: 'relative', height: WEEK_H, borderBottom: wi < WEEKS.length - 1 ? `1px solid ${C.border2}` : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', height: '100%' }}>
                  {week.map((day, di) => {
                    const weekend = di >= 5;
                    return (
                      <div key={di} style={{ borderRight: di < 6 ? `1px solid ${C.border2}` : 'none', padding: '6px 8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: day.muted ? '#ccc' : C.text2 }}>{day.date}</span>
                        <span style={{ fontSize: 10, color: weekend ? C.danger : C.muted }}>{weekend ? '0h' : '8h'}</span>
                      </div>
                    );
                  })}
                </div>
                {BARS.map((b, bi) => (b.week === wi ? <OrderBar key={bi} bar={b} index={bi} /> : null))}
              </div>
            </Reveal>
          ))}
        </div>
        <div style={{ display: 'inline-block', marginTop: 12, border: `1px solid ${C.border}`, background: C.surface, borderRadius: 7, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, color: C.text2 }}>Today</div>
      </div>
    </div>
  );
};
