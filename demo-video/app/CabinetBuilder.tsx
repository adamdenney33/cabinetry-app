import React from 'react';
import { useCurrentFrame } from 'remotion';
import { C, CABINETS } from '../theme';
import { SubTabBar, Badge, GoToLink } from './ui';
import { PlusIcon } from '../icons';
import { PopIn, useCount, useTyping, Caret, fmtMoney } from '../primitives';

const SIDE_W = 440;

const Field: React.FC<{ label: string; children: React.ReactNode; focused?: boolean }> = ({ label, children, focused }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 5 }}>{label}</div>
    <div style={{ border: `1.5px solid ${focused ? C.accent : C.border}`, background: focused ? '#fffdf7' : C.surface, borderRadius: 8, padding: '10px 12px', fontSize: 15, fontWeight: 600, color: C.text, minHeight: 40, display: 'flex', alignItems: 'center', boxShadow: focused ? `0 0 0 3px ${C.accentDim}` : 'none' }}>{children}</div>
  </div>
);

const Select: React.FC<{ label: string; value: string; plus?: boolean; muted?: boolean }> = ({ label, value, plus, muted }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: C.text2, marginBottom: 5 }}>{label}</div>
    <div style={{ display: 'flex', gap: 7 }}>
      <div style={{ flex: 1, border: `1px solid ${C.border}`, background: C.surface, borderRadius: 8, padding: '10px 12px', fontSize: 14, color: muted ? C.muted : C.text, fontWeight: muted ? 400 : 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {value}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </div>
      {plus && <div style={{ width: 38, background: C.accent, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PlusIcon size={15} color="#fff" /></div>}
    </div>
  </div>
);

const SectionHead: React.FC<{ title: string; price: string; meta: string }> = ({ title, price, meta }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '6px 0 12px', paddingTop: 14, borderTop: `1px solid ${C.border2}` }}>
    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span style={{ color: C.accent, fontWeight: 800, fontSize: 15 }}>{price}</span>
      <span style={{ color: C.muted, fontSize: 11 }}>{meta}</span>
    </div>
  </div>
);

const Line: React.FC<{ label: React.ReactNode; value: string; sub?: boolean; muted?: boolean }> = ({ label, value, sub, muted }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: sub ? 12.5 : 13.5, padding: '3px 0', color: muted ? C.muted : C.text2 }}>
    <span>{label}</span>
    <span style={{ fontWeight: 700, color: muted ? C.muted : C.text }}>{value}</span>
  </div>
);

const Stepper: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden' }}>
    <div style={{ padding: '6px 11px', color: C.muted, fontWeight: 700, borderRight: `1px solid ${C.border}` }}>−</div>
    <div style={{ padding: '6px 13px', fontWeight: 700, fontSize: 13 }}>{n}</div>
    <div style={{ padding: '6px 11px', color: C.muted, fontWeight: 700, borderLeft: `1px solid ${C.border}` }}>+</div>
  </div>
);

const CabinetCard: React.FC<{ c: (typeof CABINETS)[number]; index: number; animate?: boolean }> = ({ c, index, animate }) => {
  const animatedPrice = useCount(0, c.price, 18, 30);
  const priceVal = animate ? animatedPrice : c.price;
  return (
    <PopIn delay={8 + index * 7} from={0.96}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{c.name}</div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{c.dims}</div>
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, color: C.accent }}>{fmtMoney(priceVal)}</div>
        </div>
        <div style={{ marginTop: 12 }}>
          <Line label="Materials" value={c.materials} />
          <Line label={<>Labour <span style={{ color: C.muted }}>({c.labourHrs})</span></>} value={c.labour} />
          <Line label="Contingency (5%)" value="incl. £0" muted />
          <Line label="Hardware" value="£0" />
        </div>
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border2}` }}>
          <Line label="Unit Cost" value={c.unit} sub />
          <Line label={`× ${c.units} units`} value={c.unitsTotal} sub />
          <Line label="Markup (35%)" value={c.markup} sub muted />
          <Line label="Tax (10%)" value={c.tax} sub muted />
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>{c.meta}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border2}` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>Add to Library</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>Link to Cutlist</span>
          <div style={{ marginLeft: 'auto' }}><Stepper n={c.units} /></div>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>Duplicate</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.danger, border: `1px solid ${C.border}`, borderRadius: 7, padding: '6px 10px' }}>Delete</span>
        </div>
      </div>
    </PopIn>
  );
};

export const CabinetBuilder: React.FC = () => {
  const frame = useCurrentFrame();
  const depth = useTyping('560', 6, 22);
  const typing = frame >= 6 && frame < 24;
  const cabPrice = useCount(96, 112, 20, 24);
  const total = useCount(0, 2530, 18, 34);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubTabBar
        leftWidth={SIDE_W}
        left={[{ label: 'Cabinet Builder', active: true }, { label: 'My Rates' }]}
        right={[{ label: 'Quote Builder', active: true }, { label: 'Cabinet Library' }]}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor sidebar */}
        <div style={{ width: SIDE_W, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '18px 22px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text2 }}>‹ QUO-1042 ·</div>
            <Badge tone="green">SAVED</Badge>
          </div>
          <Field label="NAME">Base Cabinet 600</Field>
          <SectionHead title="Cabinet" price={fmtMoney(cabPrice)} meta="600×720×560" />
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Width (mm)">600</Field></div>
            <div style={{ flex: 1 }}><Field label="Height (mm)">720</Field></div>
            <div style={{ flex: 1 }}><Field label="Depth (mm)" focused>{depth}{typing && <Caret color={C.accent} />}</Field></div>
          </div>
          <Select label="Carcass Material" value="18mm Birch Plywood" plus />
          <Select label="Carcass Type" value="Standard" />
          <Select label="Finish" value="None" muted />
          <SectionHead title="Doors" price="£51" meta="2 doors" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.text2 }}>Count</span>
            <Stepper n={2} />
          </div>
        </div>

        {/* Quote builder main */}
        <div style={{ flex: 1, background: C.bg, padding: '18px 24px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text2 }}>3 cabinets · 8 units <span style={{ color: C.muted, fontWeight: 500, marginLeft: 8 }}>Quote total</span> <span style={{ color: C.accent, fontWeight: 800, fontSize: 17, marginLeft: 6 }}>{fmtMoney(total)}</span></div>
            <GoToLink>Go to Quote</GoToLink>
          </div>
          {CABINETS.map((c, i) => (
            <CabinetCard key={c.name} c={c} index={i} animate={i === 0} />
          ))}
        </div>
      </div>
    </div>
  );
};
