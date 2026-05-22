// Schedule tab — the order-priority sidebar and the auto-scheduled month
// calendar with production bars laid across the working days.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { IcoChevronDown } from '../icons';

type Bar = { start: number; span: number; lane: number; label: string; color: string; due?: string };

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const Week: React.FC<{ days: (number | null)[]; bars: Bar[] }> = ({ days, bars }) => {
  const barH = 26;
  const top0 = 30;
  return (
    <div style={{ position: 'relative', borderTop: `1px solid ${C.borderSoft}`, height: top0 + 2 * (barH + 6) + 10 }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, borderLeft: i === 0 ? 'none' : `1px solid ${C.borderSoft}`, padding: '5px 7px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: d ? C.text2 : C.faint, ...numeric }}>{d ?? ''}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: i >= 5 ? C.red : C.faint, ...numeric }}>{i >= 5 ? '0h' : '8h'}</span>
            </div>
          </div>
        ))}
      </div>
      {bars.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `calc(${(b.start / 7) * 100}% + 4px)`,
            width: `calc(${(b.span / 7) * 100}% - 8px)`,
            top: top0 + b.lane * (barH + 6),
            height: barH,
            background: b.color,
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            padding: '0 9px',
            gap: 6,
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
          {b.due && (
            <span style={{ marginLeft: 'auto', background: 'rgba(0,0,0,0.78)', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700 }}>
              {b.due}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export const ScheduleSidebar: React.FC = () => {
  const orders: { code: string; who: string; status: 'production' | 'confirmed'; dot: string; pri: number }[] = [
    { code: 'ORD-0315', who: 'Daniel & Emma Cole', status: 'production', dot: '#8b5cf6', pri: 1 },
    { code: 'ORD-0312', who: 'Sarah Mitchell', status: 'production', dot: C.red, pri: 1 },
    { code: 'ORD-0316', who: 'Westside Property', status: 'confirmed', dot: C.accent, pri: 2 },
    { code: 'ORD-0313', who: 'James Whitfield', status: 'confirmed', dot: C.teal, pri: 2 },
    { code: 'ORD-0314', who: 'Sarah Mitchell', status: 'confirmed', dot: C.blue, pri: 3 },
  ];
  return (
    <div style={{ width: 320, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '18px 18px 22px', fontFamily: FONT }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 14 }}>Schedule</div>
      {['Sort: Start date', 'Filter: All'].map((t) => (
        <div key={t} style={{ height: 42, border: `1px solid ${C.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 0 14px', fontSize: 14.5, fontWeight: 600, color: C.text2, marginBottom: 10 }}>
          {t}
          <IcoChevronDown size={17} color={C.muted} />
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        {orders.map((o) => (
          <div key={o.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: o.dot }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{o.code}</div>
              <div style={{ fontSize: 12.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.who}</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, background: C.surface2, borderRadius: 6, padding: '3px 8px' }}>P{o.pri}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, padding: '12px 14px', background: C.surface2, borderRadius: 10 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '0.5px', color: C.muted }}>WORKING HOURS</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 4, ...numeric }}>8h <span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>/ day</span></div>
      </div>
    </div>
  );
};

export const ScheduleCalendar: React.FC = () => (
  <div style={{ flex: 1, padding: '18px 22px 22px', fontFamily: FONT }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>May 2026</span>
      <span style={{ fontSize: 14, color: C.muted, fontWeight: 600 }}>auto-scheduled</span>
    </div>
    <div style={{ display: 'flex', marginBottom: 2 }}>
      {DOW.map((d) => (
        <span key={d} style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: C.muted, paddingLeft: 7 }}>{d}</span>
      ))}
    </div>
    <Week days={[27, 28, 29, 30, 1, 2, 3]} bars={[]} />
    <Week
      days={[4, 5, 6, 7, 8, 9, 10]}
      bars={[{ start: 1, span: 3, lane: 0, label: 'ORD-0314 · Bathroom Vanity', color: C.blue }]}
    />
    <Week
      days={[11, 12, 13, 14, 15, 16, 17]}
      bars={[
        { start: 0, span: 3, lane: 0, label: 'ORD-0313 · Laundry Cabinets', color: C.teal },
        { start: 3, span: 4, lane: 1, label: 'ORD-0316 · Walk-in Robe', color: C.accent },
      ]}
    />
    <Week
      days={[18, 19, 20, 21, 22, 23, 24]}
      bars={[
        { start: 1, span: 4, lane: 0, label: 'ORD-0312 · Kitchen Renovation', color: C.red },
        { start: 2, span: 5, lane: 1, label: 'ORD-0315 · Cole Study Built-ins', color: '#8b5cf6' },
      ]}
    />
    <Week
      days={[25, 26, 27, 28, 29, 30, 31]}
      bars={[
        { start: 0, span: 3, lane: 0, label: 'ORD-0312 · Kitchen Renovation', color: C.red, due: 'Due 4d' },
        { start: 2, span: 5, lane: 1, label: 'ORD-0316 · Westside Apt 12B', color: C.accent, due: 'Due 1w' },
      ]}
    />
  </div>
);

export const ScheduleScreen: React.FC = () => (
  <div style={{ display: 'flex', minHeight: 560, fontFamily: FONT }}>
    <ScheduleSidebar />
    <ScheduleCalendar />
  </div>
);
