// Stock tab — the grouped stock library with QTY health pills, reorder
// thresholds, unit costs and stock values feeding the rest of the app.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';

type Row = { mat: string; th: string; qty: number; low: number; unit: string; val: string };

const Head: React.FC = () => (
  <div style={{ display: 'flex', padding: '8px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.4px', color: C.muted }}>
    <span style={{ flex: 3 }}>MATERIAL</span>
    <span style={{ flex: 1, textAlign: 'center' }}>THICK</span>
    <span style={{ flex: 1, textAlign: 'center' }}>QTY</span>
    <span style={{ flex: 1, textAlign: 'center' }}>LOW</span>
    <span style={{ flex: 1, textAlign: 'right' }}>UNIT</span>
    <span style={{ flex: 1, textAlign: 'right' }}>VALUE</span>
  </div>
);

const StockGroup: React.FC<{ title: string; meta: string; rows: Row[] }> = ({ title, meta, rows }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(17,17,17,0.05)' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 16px', background: C.surface2, borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: '0.6px', color: C.text2 }}>{title}</span>
      <span style={{ fontSize: 12.5, color: C.muted, fontWeight: 600 }}>{meta}</span>
    </div>
    <Head />
    {rows.map((r) => {
      const low = r.qty <= r.low;
      return (
        <div key={r.mat} style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', borderTop: `1px solid ${C.borderSoft}`, fontSize: 14.5, ...numeric }}>
          <span style={{ flex: 3, fontWeight: 600, color: C.text }}>{r.mat}</span>
          <span style={{ flex: 1, textAlign: 'center', color: C.muted }}>{r.th}</span>
          <span style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <span style={{ minWidth: 36, textAlign: 'center', background: low ? C.redDim : C.greenDim, color: low ? C.red : C.green, fontWeight: 800, borderRadius: 20, padding: '3px 10px' }}>{r.qty}</span>
          </span>
          <span style={{ flex: 1, textAlign: 'center', color: C.muted }}>{r.low}</span>
          <span style={{ flex: 1, textAlign: 'right', color: C.text2 }}>{r.unit}</span>
          <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: C.text }}>{r.val}</span>
        </div>
      );
    })}
  </div>
);

export const StockScreen: React.FC = () => (
  <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['All', true], ['Sheet material', false], ['Hardware', false], ['Finishes', false]].map((f) => (
          <div key={f[0] as string} style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13.5, fontWeight: 700, background: f[1] ? C.accent : C.surface, color: f[1] ? '#1a1a1a' : C.text2, border: `1px solid ${f[1] ? 'transparent' : C.border}` }}>
            {f[0]}
          </div>
        ))}
      </div>
      <span style={{ fontSize: 13.5, color: C.muted, fontWeight: 600 }}>122 units · £4,144</span>
    </div>
    <StockGroup
      title="SHEET MATERIAL"
      meta="4 items · Low: 1 · Value: £4,144"
      rows={[
        { mat: '18mm Birch Plywood', th: '18mm', qty: 6, low: 8, unit: '£82.00', val: '£492' },
        { mat: '16mm White Melamine', th: '16mm', qty: 22, low: 10, unit: '£48.00', val: '£1,056' },
        { mat: '18mm Oak Veneer MDF', th: '18mm', qty: 14, low: 6, unit: '£119.00', val: '£1,666' },
        { mat: '12mm Standard MDF', th: '12mm', qty: 30, low: 12, unit: '£31.00', val: '£930' },
      ]}
    />
    <StockGroup
      title="HARDWARE"
      meta="3 items · Low: 1 · Value: £1,544"
      rows={[
        { mat: 'Blum 110° Soft-close Hinge', th: '—', qty: 24, low: 40, unit: '£4.50', val: '£108' },
        { mat: 'Blum Tandembox Runner 500mm', th: '—', qty: 38, low: 16, unit: '£28.00', val: '£1,064' },
        { mat: 'Cabinet Handle 128mm Brushed', th: '—', qty: 60, low: 24, unit: '£6.20', val: '£372' },
      ]}
    />
  </div>
);
