import React from 'react';
import { C } from '../theme';
import { SideLabel, ContentHeader, GhostBtn } from './ui';
import { TabIcon } from '../icons';
import { PopIn, Reveal } from '../primitives';

type Item = { name: string; dim: string; thick: string; qty: number; low: number; cost: string; value: string; supplier: string };

const HARDWARE: Item[] = [
  { name: 'Blum 110° Soft-close Hinge', dim: '—', thick: '—', qty: 24, low: 40, cost: '£4.50', value: '£108', supplier: 'Blum' },
  { name: 'Blum Tandembox Runner 500mm', dim: '—', thick: '—', qty: 38, low: 16, cost: '£28.00', value: '£1,064', supplier: 'Blum' },
  { name: 'Cabinet Handle 128mm Brushed', dim: '—', thick: '—', qty: 60, low: 24, cost: '£6.20', value: '£372', supplier: 'Hettich' },
];
const SHEET: Item[] = [
  { name: '18mm Birch Plywood', dim: '2440 × 1220', thick: '18mm', qty: 6, low: 8, cost: '£82.00', value: '£492', supplier: 'Plyco' },
  { name: '16mm White Melamine', dim: '3600 × 1800', thick: '16mm', qty: 22, low: 6, cost: '£48.00', value: '£1,056', supplier: 'Polytec' },
  { name: '18mm Oak Veneer MDF', dim: '2440 × 1220', thick: '18mm', qty: 14, low: 6, cost: '£119.00', value: '£1,666', supplier: 'Briggs' },
  { name: '12mm Standard MDF', dim: '2400 × 1200', thick: '12mm', qty: 30, low: 12, cost: '£31.00', value: '£930', supplier: 'Laminex' },
];

const qtyTone = (q: number, low: number) => (q <= low * 0.85 ? { bg: 'rgba(224,82,82,0.16)', fg: '#c0392b' } : q <= low ? { bg: 'rgba(232,168,56,0.2)', fg: '#b07614' } : { bg: 'rgba(61,153,112,0.16)', fg: '#2f8460' });

const COLS = '2.4fr 1.3fr 0.9fr 0.7fr 0.9fr 0.9fr 1.1fr';

const HeadRow = () => (
  <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '0 12px 7px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: C.muted, textTransform: 'uppercase' }}>
    <span>Material</span><span>Dimensions</span><span>Thickness</span><span>Qty</span><span>Unit Cost</span><span>Value</span><span>Supplier</span>
  </div>
);

const ItemRow: React.FC<{ it: Item; zebra: boolean }> = ({ it, zebra }) => {
  const t = qtyTone(it.qty, it.low);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '11px 12px', background: zebra ? C.zebra : 'transparent', borderRadius: 7, fontSize: 13 }}>
      <span style={{ fontWeight: 700, color: C.text }}>{it.name}</span>
      <span style={{ color: C.muted }}>{it.dim}</span>
      <span style={{ color: C.text2 }}>{it.thick}</span>
      <span><span style={{ background: t.bg, color: t.fg, fontWeight: 800, fontSize: 12.5, padding: '3px 11px', borderRadius: 20 }}>{it.qty}</span></span>
      <span style={{ color: C.text2 }}>{it.cost}</span>
      <span style={{ fontWeight: 700, color: C.text }}>{it.value}</span>
      <span style={{ color: C.muted }}>{it.supplier}</span>
    </div>
  );
};

const Group: React.FC<{ title: string; count: number; lowNote: string; value: string; items: Item[]; delay: number }> = ({ title, count, lowNote, value, items, delay }) => (
  <PopIn delay={delay} from={0.98}>
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 8px 8px', marginBottom: 14, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px 10px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{title} <span style={{ color: C.muted, fontWeight: 500 }}>· {count} items</span></div>
        <div style={{ fontSize: 11, color: C.muted }}>{lowNote} · Value: <b style={{ color: C.text }}>{value}</b></div>
      </div>
      <HeadRow />
      {items.map((it, i) => <ItemRow key={it.name} it={it} zebra={i % 2 === 1} />)}
    </div>
  </PopIn>
);

const Pill: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
  <div style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? '#fff' : C.text2, background: active ? C.accent : C.surface, border: `1px solid ${active ? C.accent : C.border}`, borderRadius: 20, padding: '6px 14px' }}>{children}</div>
);

export const Stock: React.FC = () => {
  const recent = ['Cabinet Handle 128mm', 'Matte Polyurethane Finish 4L', 'ABS Edge Banding 1mm Oak', 'PVC Edge Banding 22mm', 'Blum Tandembox Runner'];
  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 320, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: 22 }}>
        <div style={{ textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
          <div style={{ display: 'inline-flex', width: 46, height: 46, alignItems: 'center', justifyContent: 'center', color: C.muted, marginBottom: 8 }}><TabIcon tab="stock" size={40} strokeWidth={1.4} /></div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Stock</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>Track sheet goods, hardware<br />and consumables.</div>
        </div>
        <div style={{ background: C.accent, color: '#fff', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 9, textAlign: 'center', boxShadow: '0 2px 8px rgba(232,168,56,0.35)' }}>＋ Add Stock Item</div>
        <SideLabel>Recent</SideLabel>
        {recent.map((r) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', fontSize: 13, color: C.text2 }}>
            <span style={{ color: C.accent }}><TabIcon tab="stock" size={14} /></span>{r}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: C.bg, padding: '16px 22px', overflow: 'hidden' }}>
        <ContentHeader icon={<span style={{ color: C.accent }}><TabIcon tab="stock" size={20} /></span>} title="Stock Library" right={<div style={{ display: 'flex', gap: 7 }}><GhostBtn>PDF</GhostBtn><GhostBtn>Export</GhostBtn><GhostBtn>Import</GhostBtn></div>} />
        <Reveal style={{ display: 'flex', gap: 8, marginBottom: 16 }} delay={2}>
          <Pill active>All</Pill><Pill>Edge banding</Pill><Pill>Finishes</Pill><Pill>Hardware</Pill><Pill>Sheet material</Pill>
        </Reveal>
        <Group title="HARDWARE" count={3} lowNote="Low: 1 item · 122 units" value="£1,544" items={HARDWARE} delay={6} />
        <Group title="SHEET MATERIAL" count={4} lowNote="Low: 1 item · 72 units" value="£4,144" items={SHEET} delay={12} />
      </div>
    </div>
  );
};
