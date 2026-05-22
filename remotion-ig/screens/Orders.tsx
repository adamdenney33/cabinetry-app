// Orders tab — order cards with the full QUOTE→DONE production pipeline and
// the document action buttons (pro-forma, invoice, work order).
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { Badge, Btn, Stepper } from '../ui';

const STEPS = ['QUOTE', 'CONFIRMED', 'PRODUCTION', 'DELIVERY', 'DONE'];

const OrderCard: React.FC<{
  code: string;
  who: string;
  project: string;
  price: string;
  tone: 'confirmed' | 'production';
  due: string;
  stage: number;
  note?: string;
}> = ({ code, who, project, price, tone, due, stage, note }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(17,17,17,0.05)', fontFamily: FONT }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{code} · {who}</span>
          <Badge tone={tone}>{tone === 'production' ? 'In Production' : 'Confirmed'}</Badge>
        </div>
        <div style={{ fontSize: 14.5, color: C.muted, marginTop: 4 }}>{project} · {due}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: C.text, ...numeric }}>{price}</div>
    </div>
    <div style={{ margin: '20px 0 16px' }}>
      <Stepper steps={STEPS} active={stage} note={note} />
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      {['Pro-forma', 'Invoice', 'Work Order'].map((b) => (
        <Btn key={b}>{b}</Btn>
      ))}
    </div>
  </div>
);

export const OrdersScreen: React.FC = () => (
  <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
    <div style={{ display: 'flex', gap: 8 }}>
      {[['Active', 5, true], ['All', 10, false], ['Completed', 5, false]].map((f) => (
        <div key={f[0] as string} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700, background: f[2] ? C.accent : C.surface, color: f[2] ? '#1a1a1a' : C.text2, border: `1px solid ${f[2] ? 'transparent' : C.border}` }}>
          {f[0]} ({f[1] as number})
        </div>
      ))}
    </div>
    <OrderCard code="ORD-0316" who="Westside Property" project="Apartment 12B · 12 cabinets" price="£11,200" tone="confirmed" due="Due 07-27" stage={1} />
    <OrderCard code="ORD-0315" who="Daniel & Emma Cole" project="Cole Study Built-ins · 6 cabinets" price="£5,980" tone="production" due="Due 06-01" stage={2} note="in 12 days" />
    <OrderCard code="ORD-0312" who="Sarah Mitchell" project="Kitchen Renovation · 9 cabinets" price="£8,450" tone="production" due="Due 06-09" stage={2} note="in 20 days" />
  </div>
);

// single freshly-converted order (carousel D "convert to order")
export const ConvertedOrder: React.FC = () => (
  <div style={{ width: 660 }}>
    <OrderCard code="ORD-0312" who="Sarah Mitchell" project="Kitchen Renovation · 9 cabinets" price="£8,450" tone="confirmed" due="Due 06-09" stage={1} note="just created from QUO-1042" />
  </div>
);
