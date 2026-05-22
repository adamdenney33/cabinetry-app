// Cut List tab — faithful to the app: editor sidebar (Label/Grain/Edge toggle,
// parts table with QTY steppers + PANEL column, project panels, stock library,
// Optimize button), the Cut List Library / Cut Layout sub-tabs, the layout
// toolbar, and the nested cut-layout sheets with per-panel dimensions.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { SavedTag } from '../ui';
import { IcoSparkle, IcoPlus, IcoCheck, IcoX } from '../icons';

// ── sidebar bits ─────────────────────────────────────────────────
const Segmented: React.FC<{ items: string[]; active: number }> = ({ items, active }) => (
  <div style={{ display: 'flex', gap: 3, background: C.surface2, border: `1px solid ${C.borderSoft}`, borderRadius: 8, padding: 3 }}>
    {items.map((it, i) => (
      <span
        key={it}
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          padding: '4px 11px',
          borderRadius: 6,
          color: i === active ? '#fff' : C.muted,
          background: i === active ? C.ink : 'transparent',
        }}
      >
        {it}
      </span>
    ))}
  </div>
);

const MiniStepper: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ display: 'flex', alignItems: 'center', border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden', height: 28 }}>
    <span style={{ width: 22, textAlign: 'center', color: C.muted, fontSize: 16 }}>−</span>
    <span style={{ width: 26, textAlign: 'center', fontSize: 13.5, fontWeight: 800, borderLeft: `1px solid ${C.borderSoft}`, borderRight: `1px solid ${C.borderSoft}`, ...numeric }}>{n}</span>
    <span style={{ width: 22, textAlign: 'center', color: C.accent, fontSize: 15 }}>+</span>
  </div>
);

const parts: { label: string; l: string; w: string; q: number; mat: string; dot: string }[] = [
  { label: 'Side panel', l: '720', w: '560', q: 8, mat: '18mm Birch', dot: C.teal },
  { label: 'Fixed shelf', l: '568', w: '540', q: 4, mat: '18mm Birch', dot: C.blue },
  { label: 'Door front', l: '597', w: '715', q: 2, mat: '18mm Birch', dot: '#4f9a57' },
  { label: 'Drawer front', l: '797', w: '178', q: 5, mat: '18mm Birch', dot: '#9c4f8f' },
  { label: 'Top / bottom', l: '568', w: '540', q: 2, mat: '16mm Mela', dot: C.accent },
];

export const CutPartsSidebar: React.FC<{ optimised?: boolean }> = ({ optimised }) => (
  <div style={{ width: 372, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '16px 16px 18px', fontFamily: FONT }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
      <span style={{ fontSize: 14.5, fontWeight: 700, color: C.text2 }}>← Mitchell Kitchen — Cut List</span>
      <SavedTag />
    </div>

    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.5px', color: C.muted, marginBottom: 5 }}>NAME</div>
    <div style={{ height: 40, border: `1px solid ${C.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
      Mitchell Kitchen — Cut List
    </div>

    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.5px', color: C.muted }}>CUT PARTS</span>
      <Segmented items={['Label', 'Grain', 'Edge']} active={0} />
    </div>

    <div style={{ display: 'flex', padding: '0 2px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.3px', color: C.faint }}>
      <span style={{ flex: 1 }}>LABEL</span>
      <span style={{ width: 32, textAlign: 'right' }}>L</span>
      <span style={{ width: 32, textAlign: 'right' }}>W</span>
      <span style={{ width: 74, textAlign: 'center' }}>QTY</span>
      <span style={{ width: 64, textAlign: 'right' }}>PANEL</span>
    </div>
    {parts.map((p) => (
      <div key={p.label} style={{ display: 'flex', alignItems: 'center', padding: '6px 2px', borderTop: `1px solid ${C.borderSoft}` }}>
        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.dot, flex: 'none' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
        </span>
        <span style={{ width: 32, textAlign: 'right', fontSize: 12.5, color: C.text2, ...numeric }}>{p.l}</span>
        <span style={{ width: 32, textAlign: 'right', fontSize: 12.5, color: C.text2, ...numeric }}>{p.w}</span>
        <span style={{ width: 74, display: 'flex', justifyContent: 'center' }}><MiniStepper n={p.q} /></span>
        <span style={{ width: 64, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
          <span style={{ fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 44 }}>{p.mat}</span>
          <IcoCheck size={13} color={C.green} />
        </span>
      </div>
    ))}
    <div style={{ fontSize: 12, color: C.muted, margin: '8px 2px 0', textAlign: 'right' }}>29 pieces · 10.20 m² total</div>
    <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
      <IcoPlus size={14} color={C.muted} /> Add part
    </div>

    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.5px', color: C.muted, margin: '16px 0 8px' }}>PROJECT PANELS</div>
    {[
      ['18mm Birch Plywood', '2440', '1220', 4],
      ['16mm White Melamine', '3600', '1800', 2],
    ].map((p) => (
      <div key={p[0] as string} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderTop: `1px solid ${C.borderSoft}` }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p[0]}</span>
        <span style={{ fontSize: 12.5, color: C.muted, ...numeric }}>{p[1]}×{p[2]}</span>
        <MiniStepper n={p[3] as number} />
        <IcoX size={13} color={C.faint} />
      </div>
    ))}
    <div style={{ fontSize: 13, fontWeight: 700, color: C.text2, margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
      <IcoPlus size={14} color={C.muted} /> Add panel
    </div>

    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.5px', color: C.muted, margin: '16px 0 8px' }}>STOCK LIBRARY</div>
    <div style={{ height: 40, border: `1px dashed ${C.border}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 6px 0 12px', fontSize: 13, color: C.muted }}>
      Load or add Stock goods…
      <span style={{ width: 28, height: 28, borderRadius: 6, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IcoPlus size={15} color="#1a1a1a" />
      </span>
    </div>

    <div style={{ marginTop: 16, height: 52, borderRadius: 11, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, fontSize: 17, fontWeight: 800, color: '#1a1a1a', boxShadow: '0 10px 26px rgba(232,168,56,0.38)' }}>
      {optimised ? <IcoCheck size={20} color="#1a1a1a" /> : <IcoSparkle size={20} color="#1a1a1a" />}
      {optimised ? 'Layout optimised' : 'Optimize Cut Layout'}
    </div>
  </div>
);

// ── main toolbars ────────────────────────────────────────────────
const SubTabs: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `1px solid ${C.border}`, padding: '0 18px' }}>
    {[
      { label: 'Cut List Library', on: false },
      { label: 'Cut Layout', on: true },
    ].map((t) => (
      <span
        key={t.label}
        style={{
          fontSize: 14.5,
          fontWeight: t.on ? 800 : 600,
          color: t.on ? C.text : C.muted,
          padding: '12px 4px',
          borderBottom: `3px solid ${t.on ? C.accent : 'transparent'}`,
          marginBottom: -1,
        }}
      >
        {t.label}
      </span>
    ))}
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; on?: boolean }> = ({ children, on }) => (
  <span
    style={{
      fontSize: 13,
      fontWeight: 700,
      padding: '7px 12px',
      borderRadius: 8,
      border: `1px solid ${on ? 'transparent' : C.border}`,
      background: on ? C.accent : C.surface,
      color: on ? '#1a1a1a' : C.text2,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const Toolbar: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px 0', gap: 8 }}>
    <div style={{ display: 'flex', gap: 7 }}>
      <Pill>Summary</Pill>
      <Pill>Deduct from Stock</Pill>
      <Pill>PDF</Pill>
    </div>
    <div style={{ display: 'flex', gap: 7 }}>
      <Pill>Cut list</Pill>
      <Pill>Fit</Pill>
      <Pill>A+</Pill>
      <Pill>↻ Rotate</Pill>
      <Pill on>Color</Pill>
    </div>
  </div>
);

// ── nested sheet visual ──────────────────────────────────────────
const Panel: React.FC<{ flex: number; kind: 'green' | 'pink'; top: string; left: string; name: string }> = ({ flex, kind, top, left, name }) => {
  const col =
    kind === 'green'
      ? { bg: '#d7ecda', bd: '#a8d2ac', fg: '#3f7a46' }
      : { bg: '#f0d6ec', bd: '#d6a9ce', fg: '#9c4f8f' };
  return (
    <div style={{ flex: `${flex} 1 0`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 2, ...numeric }}>{top}</div>
      <div
        style={{
          flex: 1,
          position: 'relative',
          background: col.bg,
          border: `1.5px solid ${col.bd}`,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: col.fg,
          fontSize: 12,
          fontWeight: 700,
          overflow: 'hidden',
        }}
      >
        <span style={{ position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%) rotate(180deg)', writingMode: 'vertical-rl', fontSize: 9.5, color: col.fg, opacity: 0.85, ...numeric }}>{left}</span>
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
                <Panel key={i} flex={1} kind="green" top="597" left="716" name="Door front" />
              ))}
            </div>
            <div style={{ flex: 178, display: 'flex', gap: 7 }}>
              {[0, 1, 2].map((i) => (
                <Panel key={i} flex={1} kind="pink" top="797" left="178" name="Drawer front" />
              ))}
              <div style={{ flex: '0.9 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, color: C.faint, ...numeric }}>324</div>
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

// full screen: sidebar + sub-tabs + toolbar + sheet
export const CutListScreen: React.FC<{ optimised?: boolean }> = ({ optimised = true }) => (
  <div style={{ display: 'flex', minHeight: 600, fontFamily: FONT }}>
    <CutPartsSidebar optimised={optimised} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <SubTabs />
      <Toolbar />
      <div style={{ flex: 1, padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <NestingSheet idx={1} pct={72} w={520} />
        <NestingSheet idx={2} pct={57} w={520} />
      </div>
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
