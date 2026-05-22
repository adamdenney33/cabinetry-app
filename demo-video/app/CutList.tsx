import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { C } from '../theme';
import { SubTabBar } from './ui';
import { Reveal, EASE_OUT, clampOpts } from '../primitives';

const SIDE_W = 380;

type Part = { label: string; l: number; w: number; qty: number; color: string };
const PARTS: Part[] = [
  { label: 'Side panel', l: 720, w: 560, qty: 8, color: '#508cdc' },
  { label: 'Fixed shelf', l: 568, w: 560, qty: 4, color: '#0d9488' },
  { label: 'Door front', l: 597, w: 715, qty: 4, color: '#3d9970' },
  { label: 'Drawer front', l: 797, w: 178, qty: 3, color: '#c46aa0' },
  { label: 'Top / bottom', l: 568, w: 560, qty: 4, color: '#e8a838' },
];

// Placed parts on a 2440×1220 board, expressed in % so they scale with the board.
type Placed = { x: number; y: number; w: number; h: number; fill: string; stroke: string; label: string; wd: string; ht: string };
const SHEET1: Placed[] = [
  ...[0, 1, 2, 3].map((i) => ({ x: 0.6 + i * 24.6, y: 1.5, w: 23.4, h: 58.6, fill: '#dcefd6', stroke: '#3d9970', label: 'Door front', wd: '597', ht: '715' })),
  ...[0, 1, 2].map((i) => ({ x: 0.6 + i * 33, y: 63, w: 31.8, h: 14.6, fill: '#f6dbec', stroke: '#c46aa0', label: 'Drawer front', wd: '797', ht: '178' })),
];
const SHEET2: Placed[] = [0, 1, 2, 3].map((i) => ({ x: 0.6 + i * 24.6, y: 1.5, w: 23.4, h: 58.6, fill: '#dcefd6', stroke: '#3d9970', label: 'Door front', wd: '597', ht: '715' }));

const PartRect: React.FC<{ p: Placed; index: number; baseDelay: number }> = ({ p, index, baseDelay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - (baseDelay + index * 4), fps, config: { damping: 18, mass: 0.6, stiffness: 130 } });
  const op = interpolate(s, [0, 1], [0, 1]);
  const sc = interpolate(s, [0, 1], [0.82, 1]);
  return (
    <div style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%`, background: p.fill, border: `1.5px solid ${p.stroke}`, borderRadius: 3, opacity: op, transform: `scale(${sc})`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: p.stroke }}>{p.ht}</span>
      <span style={{ fontSize: 10, color: p.stroke, opacity: 0.85, writingMode: p.h > p.w * 1.5 ? 'vertical-rl' : 'horizontal-tb', position: p.h > p.w * 1.5 ? 'absolute' : 'static', left: 4 }}>{p.label}</span>
      <span style={{ fontSize: 10, color: p.stroke, opacity: 0.7 }}>{p.wd}</span>
    </div>
  );
};

const Sheet: React.FC<{ n: number; pct: number; parts: Placed[]; baseDelay: number }> = ({ n, pct, parts, baseDelay }) => {
  const frame = useCurrentFrame();
  const pctShown = Math.round(interpolate(frame, [baseDelay, baseDelay + 30], [0, pct], { ...clampOpts, easing: EASE_OUT }));
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: C.accent2 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Sheet {n}</span>
        <span style={{ fontSize: 12, color: C.muted }}>· 18mm Birch Plywood · <b style={{ color: pct > 65 ? C.success : C.text2 }}>{pctShown}% used</b></span>
      </div>
      <div style={{ position: 'relative', width: '100%', paddingTop: '50%', background: '#eef0f1', border: `1px solid ${C.border}`, borderRadius: 6 }}>
        <div style={{ position: 'absolute', inset: 6 }}>
          {parts.map((p, i) => <PartRect key={i} p={p} index={i} baseDelay={baseDelay} />)}
        </div>
      </div>
    </div>
  );
};

const ToolBtn: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
  <div style={{ fontSize: 12, fontWeight: 600, color: active ? '#fff' : C.text2, background: active ? C.accent : C.surface, border: `1px solid ${active ? C.accent : C.border}`, borderRadius: 7, padding: '6px 11px' }}>{children}</div>
);

export const CutList: React.FC = () => {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <SubTabBar leftWidth={SIDE_W} left={[{ label: 'Cut List Library' }]} right={[{ label: 'Cut Layout', active: true }]} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Editor sidebar */}
        <div style={{ width: SIDE_W, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '16px 20px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>‹ Mitchell Kitchen — Cut List</span>
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Cut Parts</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.5fr', fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', padding: '0 0 6px' }}>
            <span>Label</span><span>L</span><span>W</span><span>Qty</span>
          </div>
          {PARTS.map((p) => (
            <div key={p.label} style={{ display: 'grid', gridTemplateColumns: '1.6fr 0.7fr 0.7fr 0.5fr', alignItems: 'center', fontSize: 12.5, padding: '8px 0', borderBottom: `1px solid ${C.border2}` }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, color: C.text }}><span style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />{p.label}</span>
              <span style={{ color: C.text2 }}>{p.l}</span><span style={{ color: C.text2 }}>{p.w}</span><span style={{ color: C.text2 }}>{p.qty}</span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>23 pieces · 10.20 m² total</div>
          <div style={{ marginTop: 18, background: C.accent, color: '#fff', fontWeight: 700, fontSize: 14, padding: '13px', borderRadius: 9, textAlign: 'center', boxShadow: '0 2px 10px rgba(232,168,56,0.4)' }}>✦ Optimize Cut Layout</div>
        </div>

        {/* Layout main */}
        <div style={{ flex: 1, background: C.bg, padding: '14px 22px', overflow: 'hidden' }}>
          <Reveal style={{ display: 'flex', gap: 7, marginBottom: 12 }}>
            <ToolBtn>Summary</ToolBtn>
            <ToolBtn>Deduct from Stock</ToolBtn>
            <ToolBtn>PDF</ToolBtn>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
              <ToolBtn>Fit</ToolBtn><ToolBtn>Rotate</ToolBtn><ToolBtn active>Color</ToolBtn>
            </div>
          </Reveal>
          <Sheet n={1} pct={72} parts={SHEET1} baseDelay={16} />
          <Sheet n={2} pct={57} parts={SHEET2} baseDelay={30} />
        </div>
      </div>
    </div>
  );
};
