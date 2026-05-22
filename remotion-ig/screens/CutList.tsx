// Cut List tab — the parts/panels sidebar, the optimiser button, and the
// nested cut-layout sheets (the money shot) with material efficiency.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { SavedTag } from '../ui';
import { IcoSparkle, IcoPlus, IcoCheck } from '../icons';

// ── sidebar: cut parts + project panels + optimise ───────────────
const partRows: [string, string, string, string][] = [
  ['Side panel', '720', '560', '×8'],
  ['Fixed shelf', '568', '540', '×4'],
  ['Door front', '597', '715', '×2'],
  ['Drawer front', '797', '178', '×5'],
  ['Top / bottom', '568', '540', '×2'],
];

export const CutPartsSidebar: React.FC<{ optimised?: boolean }> = ({ optimised }) => (
  <div style={{ width: 350, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '18px 18px 22px', fontFamily: FONT }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: C.text2 }}>← Mitchell Kitchen — Cut List</span>
      <SavedTag />
    </div>

    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.6px', color: C.muted, margin: '6px 0 8px' }}>CUT PARTS</div>
    <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', background: C.surface2, padding: '8px 12px', fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.4px' }}>
        <span style={{ flex: 2 }}>LABEL</span>
        <span style={{ flex: 1, textAlign: 'right' }}>L</span>
        <span style={{ flex: 1, textAlign: 'right' }}>W</span>
        <span style={{ flex: 1, textAlign: 'right' }}>QTY</span>
      </div>
      {partRows.map((r) => (
        <div key={r[0]} style={{ display: 'flex', padding: '10px 12px', fontSize: 14.5, borderTop: `1px solid ${C.borderSoft}`, ...numeric }}>
          <span style={{ flex: 2, fontWeight: 600, color: C.text }}>{r[0]}</span>
          <span style={{ flex: 1, textAlign: 'right', color: C.text2 }}>{r[1]}</span>
          <span style={{ flex: 1, textAlign: 'right', color: C.text2 }}>{r[2]}</span>
          <span style={{ flex: 1, textAlign: 'right', fontWeight: 700, color: C.text }}>{r[3]}</span>
        </div>
      ))}
    </div>
    <div style={{ fontSize: 13, color: C.muted, margin: '8px 2px 0' }}>29 pieces · 10.20 m² total</div>

    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.6px', color: C.muted, margin: '18px 0 8px' }}>PROJECT PANELS</div>
    {[
      ['18mm Birch Plywood', '2440 × 1220', '×4'],
      ['16mm White Melamine', '3600 × 1800', '×2'],
    ].map((p) => (
      <div key={p[0]} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 12px', border: `1px solid ${C.borderSoft}`, borderRadius: 9, marginBottom: 8, fontSize: 14.5 }}>
        <span style={{ fontWeight: 600 }}>{p[0]}</span>
        <span style={{ color: C.muted, ...numeric }}>{p[1]} {p[2]}</span>
      </div>
    ))}

    <div
      style={{
        marginTop: 18,
        height: 58,
        borderRadius: 12,
        background: C.accent,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        fontSize: 19,
        fontWeight: 800,
        color: '#1a1a1a',
        boxShadow: '0 10px 28px rgba(232,168,56,0.40)',
      }}
    >
      {optimised ? <IcoCheck size={22} color="#1a1a1a" /> : <IcoSparkle size={22} color="#1a1a1a" />}
      {optimised ? 'Layout optimised' : 'Optimize Cut Layout'}
    </div>
  </div>
);

// ── nested sheet visual ──────────────────────────────────────────
const Panel: React.FC<{ flex: number; kind: 'green' | 'pink'; top: string; name: string }> = ({ flex, kind, top, name }) => {
  const col =
    kind === 'green'
      ? { bg: '#d7ecda', bd: '#a8d2ac', fg: '#3f7a46' }
      : { bg: '#f0d6ec', bd: '#d6a9ce', fg: '#9c4f8f' };
  return (
    <div style={{ flex: `${flex} 1 0`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', marginBottom: 2, ...numeric }}>{top}</div>
      <div
        style={{
          flex: 1,
          background: col.bg,
          border: `1.5px solid ${col.bd}`,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: col.fg,
          fontSize: 12.5,
          fontWeight: 700,
          overflow: 'hidden',
        }}
      >
        <span style={{ writingMode: kind === 'green' ? 'vertical-rl' : 'horizontal-tb', transform: kind === 'green' ? 'rotate(180deg)' : 'none', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>
    </div>
  );
};

export const NestingSheet: React.FC<{ idx: number; pct: number; w?: number }> = ({ idx, pct, w = 560 }) => {
  const boardH = w * 0.5; // 2440 × 1220 ≈ 2:1
  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.blue }} />
        <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Sheet {idx}</span>
        <span style={{ fontSize: 14, color: C.muted }}>· 18mm Birch Plywood</span>
        <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: pct >= 70 ? C.green : C.accent, ...numeric }}>{pct}% used</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {/* left axis */}
        <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 12, color: C.muted, ...numeric }}>1220</span>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              height: boardH,
              border: `1px solid ${C.faint}`,
              borderRadius: 4,
              background:
                'repeating-linear-gradient(0deg, rgba(47,111,208,0.05) 0 1px, transparent 1px 22px), repeating-linear-gradient(90deg, rgba(47,111,208,0.05) 0 1px, transparent 1px 22px), #fff',
              padding: 7,
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <div style={{ flex: 716, display: 'flex', gap: 7 }}>
              {[0, 1, 2, 3].map((i) => (
                <Panel key={i} flex={1} kind="green" top="597" name="Door front" />
              ))}
            </div>
            <div style={{ flex: 178, display: 'flex', gap: 7 }}>
              {[0, 1, 2].map((i) => (
                <Panel key={i} flex={1} kind="pink" top="797" name="Drawer front" />
              ))}
              <div style={{ flex: '0.9 1 0' }} />
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 4, ...numeric }}>2440</div>
        </div>
      </div>
    </div>
  );
};

export const NestingMoneyShot: React.FC = () => (
  <div style={{ width: 640, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: '0 24px 60px rgba(17,17,17,0.16)', padding: 26, display: 'flex', flexDirection: 'column', gap: 22, fontFamily: FONT }}>
    <NestingSheet idx={1} pct={72} w={560} />
    <NestingSheet idx={2} pct={57} w={560} />
  </div>
);

// full screen: sidebar + one sheet
export const CutListScreen: React.FC<{ optimised?: boolean }> = ({ optimised = true }) => (
  <div style={{ display: 'flex', minHeight: 560, fontFamily: FONT }}>
    <CutPartsSidebar optimised={optimised} />
    <div style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
      <NestingSheet idx={1} pct={72} w={500} />
      <NestingSheet idx={2} pct={57} w={500} />
    </div>
  </div>
);

// deduct-from-stock confirmation
export const DeductPanel: React.FC = () => (
  <div style={{ width: 560, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: '0 24px 60px rgba(17,17,17,0.16)', padding: 28, fontFamily: FONT }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
      <span style={{ width: 40, height: 40, borderRadius: 10, background: C.greenDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IcoCheck size={22} color={C.green} />
      </span>
      <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Deduct from Stock</span>
    </div>
    {[
      ['18mm Birch Plywood', '−6 sheets', '14 → 8'],
      ['16mm White Melamine', '−2 sheets', '22 → 20'],
      ['ABS Edge Banding 1mm', '−12 m', '20 → 8'],
    ].map((r) => (
      <div key={r[0]} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: `1px solid ${C.borderSoft}`, fontSize: 16 }}>
        <span style={{ fontWeight: 600, color: C.text }}>{r[0]}</span>
        <span style={{ display: 'flex', gap: 14, alignItems: 'center', ...numeric }}>
          <span style={{ color: C.red, fontWeight: 700 }}>{r[1]}</span>
          <span style={{ color: C.muted }}>{r[2]}</span>
        </span>
      </div>
    ))}
    <div style={{ marginTop: 18, height: 54, borderRadius: 12, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: '#1a1a1a' }}>
      Confirm & update stock
    </div>
  </div>
);
