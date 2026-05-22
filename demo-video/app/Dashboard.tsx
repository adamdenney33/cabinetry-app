import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { C, ORDERS, QUOTES } from '../theme';
import { Badge, statusTone } from './ui';
import { PopIn, Reveal, useCount, EASE_OUT, clampOpts } from '../primitives';

const Card: React.FC<{ title: string; sub?: string; children: React.ReactNode; delay: number; style?: React.CSSProperties }> = ({ title, sub, children, delay, style }) => (
  <PopIn delay={delay} from={0.97} style={{ ...style }}>
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{title}</span>
        {sub && <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>}
      </div>
      {children}
    </div>
  </PopIn>
);

const QuickBtn: React.FC<{ children: React.ReactNode; primary?: boolean }> = ({ children, primary }) => (
  <div style={{ fontSize: 12.5, fontWeight: primary ? 700 : 600, color: primary ? '#fff' : C.text2, background: primary ? C.accent : C.surface, border: `1px solid ${primary ? C.accent : C.border}`, borderRadius: 8, padding: '8px 13px', boxShadow: primary ? '0 2px 6px rgba(232,168,56,0.3)' : 'none' }}>{children}</div>
);

const Row: React.FC<{ no: string; title: string; sub: string; price: string; status: string }> = ({ no, title, sub, price, status }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '9px 0', borderBottom: `1px solid ${C.border2}` }}>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{no} · {title}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>
    </div>
    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{price}</div>
      <div style={{ marginTop: 3 }}><Badge tone={statusTone(status)} style={{ fontSize: 9.5, padding: '2px 7px' }}>{status}</Badge></div>
    </div>
  </div>
);

const REV = [
  { m: 'Dec', v: 4.0 }, { m: 'Jan', v: 6.2 }, { m: 'Feb', v: 3.4 }, { m: 'Mar', v: 9.1 }, { m: 'Apr', v: 5.2 }, { m: 'May', v: 1.4 },
];
const PIPE = [
  { label: 'Quote Sent', n: 0, c: C.muted }, { label: 'Confirmed', n: 3, c: C.blue }, { label: 'In Production', n: 2, c: C.accent }, { label: 'Ready for Delivery', n: 1, c: C.teal }, { label: 'Complete', n: 2, c: C.success },
];

const RevBars: React.FC = () => {
  const frame = useCurrentFrame();
  const max = 10;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 120, paddingTop: 8 }}>
      {REV.map((r, i) => {
        const g = interpolate(frame, [10 + i * 4, 34 + i * 4], [0, 1], { ...clampOpts, easing: EASE_OUT });
        return (
          <div key={r.m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ width: '78%', height: `${(r.v / max) * 100 * g}%`, background: C.success, borderRadius: '4px 4px 0 0', minHeight: 2 }} />
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 6 }}>{r.m}</div>
          </div>
        );
      })}
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const alerts = [
    { name: '18mm Birch Plywood', meta: '6 left · reorder at 8' },
    { name: 'Blum 110° Soft-close Hinge', meta: '24 left · reorder at 40' },
    { name: 'ABS Edge Banding 1mm Oak', meta: '8 left · reorder at 15' },
  ];
  return (
    <div style={{ height: '100%', padding: '16px 22px', overflow: 'hidden' }}>
      {/* Quick create */}
      <Reveal style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <QuickBtn primary>＋ New Quote</QuickBtn>
        <QuickBtn>＋ Cabinet</QuickBtn>
        <QuickBtn>＋ Cut List</QuickBtn>
        <QuickBtn>＋ Stock</QuickBtn>
        <QuickBtn>＋ Order</QuickBtn>
        <QuickBtn>＋ Client</QuickBtn>
      </Reveal>

      {/* Three summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.86fr', gap: 14, marginBottom: 14 }}>
        <Card title="Active Orders" delay={6}>
          {ORDERS.slice(0, 4).map((o) => <Row key={o.no} no={o.no} title={o.client} sub={`${o.project} · Due ${o.due}`} price={o.price} status={o.status} />)}
        </Card>
        <Card title="Recent Quotes" delay={10}>
          {QUOTES.slice(0, 4).map((q) => <Row key={q.no} no={q.no} title={q.client} sub={q.project} price={q.price} status={q.status} />)}
        </Card>
        <Card title="Stock Alerts" delay={14}>
          {alerts.map((a) => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border2}` }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{a.name}</div>
                <div style={{ fontSize: 11, color: C.danger, marginTop: 2 }}>{a.meta}</div>
              </div>
              <Badge tone="red" style={{ fontSize: 9.5 }}>Low</Badge>
            </div>
          ))}
        </Card>
      </div>

      {/* Bottom row: revenue + pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 14 }}>
        <Card title="Monthly Revenue" sub="completed orders" delay={18}><RevBars /></Card>
        <Card title="Pipeline" sub="last 90 days" delay={22}>
          {PIPE.map((p, i) => {
            const n = useCount(0, p.n, 18 + i * 3, 18);
            return (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < PIPE.length - 1 ? `1px solid ${C.border2}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.c }} />
                  <span style={{ fontSize: 13, color: C.text2, fontWeight: 500 }}>{p.label}</span>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{Math.round(n)}</span>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
};
