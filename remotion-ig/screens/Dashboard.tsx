// Dashboard tab — the three signature summary cards (Active Orders, Recent
// Quotes, Stock Alerts). Rendered inside <Window active="dashboard">.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { Badge } from '../ui';

const CardBox: React.FC<React.PropsWithChildren<{ title: string; meta?: string }>> = ({
  title,
  meta,
  children,
}) => (
  <div
    style={{
      flex: '1 1 0',
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(17,17,17,0.05)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{title}</span>
      {meta && <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{meta}</span>}
    </div>
    <div style={{ padding: '4px 16px 8px' }}>{children}</div>
  </div>
);

const Row: React.FC<{
  code: string;
  who: string;
  sub: string;
  amount: string;
  badge: React.ReactNode;
}> = ({ code, who, sub, amount, badge }) => (
  <div style={{ padding: '13px 0', borderBottom: `1px solid ${C.borderSoft}` }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
        {code} · {who}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800, color: C.text, ...numeric }}>{amount}</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
      <span style={{ fontSize: 13, color: C.muted }}>{sub}</span>
      {badge}
    </div>
  </div>
);

const RevenueCard: React.FC = () => {
  const bars = [
    { m: 'Dec', v: 3.1 },
    { m: 'Jan', v: 4.3 },
    { m: 'Feb', v: 2.4 },
    { m: 'Mar', v: 8.4 },
    { m: 'Apr', v: 5.2 },
    { m: 'May', v: 6.0 },
  ];
  const max = 10;
  return (
    <CardBox title="Monthly Revenue" meta="completed orders">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 150, padding: '14px 4px 6px' }}>
        {bars.map((b) => (
          <div key={b.m} style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: '78%',
                height: `${(b.v / max) * 118}px`,
                background: `linear-gradient(180deg, ${C.green} 0%, #4fb083 100%)`,
                borderRadius: '6px 6px 0 0',
              }}
            />
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{b.m}</span>
          </div>
        ))}
      </div>
    </CardBox>
  );
};

const PipelineCard: React.FC = () => {
  const rows: { label: string; n: number; c: string }[] = [
    { label: 'Quote Sent', n: 2, c: C.muted },
    { label: 'Confirmed', n: 3, c: C.blue },
    { label: 'In Production', n: 2, c: C.accent },
    { label: 'Ready for Delivery', n: 0, c: C.teal },
    { label: 'Complete', n: 2, c: C.green },
  ];
  return (
    <CardBox title="Pipeline" meta="last 90 days">
      <div style={{ padding: '4px 0' }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8.5px 0',
              borderBottom: `1px solid ${C.borderSoft}`,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, color: C.text2, fontWeight: 600 }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: r.c }} />
              {r.label}
            </span>
            <span style={{ fontSize: 17, fontWeight: 800, color: C.text, ...numeric }}>{r.n}</span>
          </div>
        ))}
      </div>
    </CardBox>
  );
};

export const DashboardScreen: React.FC = () => (
  <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, fontFamily: FONT }}>
    <div style={{ display: 'flex', gap: 16 }}>
      <CardBox title="Active Orders" meta="4 live">
        <Row code="ORD-0315" who="Daniel & Emma Cole" sub="Cole Study Built-ins · Due 06-01" amount="£5,980" badge={<Badge tone="production">In Production</Badge>} />
        <Row code="ORD-0312" who="Sarah Mitchell" sub="Kitchen Renovation · Due 06-09" amount="£8,450" badge={<Badge tone="production">In Production</Badge>} />
        <Row code="ORD-0313" who="James Whitfield" sub="Laundry Cabinets · Due 06-23" amount="£3,200" badge={<Badge tone="confirmed">Confirmed</Badge>} />
      </CardBox>

      <CardBox title="Recent Quotes" meta="6 open">
        <Row code="QUO-1044" who="Sarah Mitchell" sub="Mitchell Walk-in Robe" amount="£2,891" badge={<Badge tone="draft">Draft</Badge>} />
        <Row code="QUO-1045" who="Priya Nair" sub="Nair Kitchen Island" amount="£1,014" badge={<Badge tone="sent">Sent</Badge>} />
        <Row code="QUO-1046" who="Daniel & Emma Cole" sub="Cole Study Built-ins" amount="£2,359" badge={<Badge tone="approved">Approved</Badge>} />
      </CardBox>

      <CardBox title="Stock Alerts" meta="3 low">
        <Row code="18mm" who="Birch Plywood" sub="6 left · reorder at 8" amount="£492" badge={<Badge tone="low">Low</Badge>} />
        <Row code="Blum" who="Soft-close Hinge" sub="24 left · reorder at 40" amount="£108" badge={<Badge tone="low">Low</Badge>} />
        <Row code="1mm" who="ABS Oak Banding" sub="8 left · reorder at 15" amount="£19" badge={<Badge tone="low">Low</Badge>} />
      </CardBox>
    </div>

    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: '1.5 1 0', display: 'flex' }}>
        <RevenueCard />
      </div>
      <div style={{ flex: '1 1 0', display: 'flex' }}>
        <PipelineCard />
      </div>
    </div>
  </div>
);
