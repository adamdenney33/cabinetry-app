import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, QUOTES } from '../theme';
import { SubTabBar, Badge, statusTone, GoToLink, GhostBtn } from './ui';
import { ArrowRight } from '../icons';
import { Reveal, useTyping, Caret } from '../primitives';

const SIDE_W = 440;

const RateRow: React.FC<{ name: string; unit: string; value: string; focused?: boolean }> = ({ name, unit, value, focused }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' }}>
    <span style={{ flex: 1, fontSize: 13, color: C.text2 }}>{name}</span>
    <span style={{ fontSize: 10.5, color: C.muted, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 7px' }}>{unit}</span>
    <span style={{ width: 64, textAlign: 'center', fontSize: 14, fontWeight: 700, color: C.text, border: `1.5px solid ${focused ? C.accent : C.border}`, background: focused ? '#fffdf7' : C.surface, borderRadius: 7, padding: '6px 0', boxShadow: focused ? `0 0 0 3px ${C.accentDim}` : 'none' }}>{value}</span>
  </div>
);

const Group: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <div style={{ borderTop: `1px solid ${C.border2}`, paddingTop: 10, marginTop: 10 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
      <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>{title}</span>
      <span style={{ fontSize: 11, color: C.muted }}>({count})</span>
    </div>
    {children}
    <div style={{ fontSize: 12, color: C.accent, fontWeight: 600, marginTop: 4 }}>＋ Add</div>
  </div>
);

const StepRow: React.FC<{ name: string; hrs: string }> = ({ name, hrs }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
    <span style={{ flex: 1, fontSize: 13, color: C.text2 }}>{name}</span>
    <span style={{ fontSize: 10.5, color: C.muted }}>hrs</span>
    <span style={{ width: 54, textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 0' }}>{hrs}</span>
  </div>
);

const MiniQuote: React.FC<{ q: (typeof QUOTES)[number] }> = ({ q }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 16px', marginBottom: 11, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>{q.no} · {q.project} · {q.client}</span>
        <Badge tone={statusTone(q.status)}>{q.status}</Badge>
      </div>
      <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{q.price}</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
      <GoToLink>Go to Quote</GoToLink>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}><GhostBtn>Duplicate</GhostBtn><GhostBtn danger>Delete</GhostBtn></div>
    </div>
  </div>
);

export const MyRates: React.FC = () => {
  const frame = useCurrentFrame();
  const labour = useTyping('75', 8, 14);
  const typing = frame >= 8 && frame < 24;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubTabBar leftWidth={SIDE_W} left={[{ label: 'Cabinet Builder' }, { label: 'My Rates', active: true }]} right={[{ label: 'Quote Builder', active: true }, { label: 'Cabinet Library' }]} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: SIDE_W, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '16px 22px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 9, padding: '11px 14px', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b07614' }}>Manage Materials in Stock</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Materials, hardware, finishes & edge banding (10 items)</div>
            </div>
            <ArrowRight size={16} color={C.accent} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Core Rates</span>
            <span style={{ fontSize: 11, color: C.muted }}>5 rates</span>
          </div>
          <RateRow name="Labour Rate" unit="per hour" value={typing ? `${labour}` : '75'} focused />
          <RateRow name="Material Markup" unit="%" value="0" />
          <RateRow name="Quote Markup" unit="%" value="35" />
          <RateRow name="Tax / GST" unit="%" value="10" />
          <RateRow name="Contingency" unit="%" value="5" />
          <Group title="Carcass" count={1}><StepRow name="Standard" hrs="0.4" /></Group>
          <Group title="Door" count={4}>
            <StepRow name="Slab" hrs="0.4" /><StepRow name="Shaker" hrs="0.7" /><StepRow name="Integrated Handle" hrs="0.6" />
          </Group>
          <Group title="Drawer Box" count={2}><StepRow name="Standard" hrs="0.8" /><StepRow name="Dovetail" hrs="1.2" /></Group>
          {typing && <span style={{ position: 'absolute' }}><Caret /></span>}
        </div>
        <div style={{ flex: 1, background: C.bg, padding: '16px 24px', overflow: 'hidden' }}>
          <Reveal style={{ fontSize: 21, fontWeight: 800, color: C.text, marginBottom: 14 }}>Quotes</Reveal>
          {QUOTES.slice(0, 4).map((q) => <MiniQuote key={q.no} q={q} />)}
        </div>
      </div>
    </div>
  );
};
