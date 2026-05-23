// 9:16 reel #2 — deep dive on the Cabinet tab. Shows the depth of customisation
// (vertical pan down the editor sidebar), the rates/times that drive pricing
// (My Rates sidebar), and the cost-breakdown structure (count-up) so a customer
// sees exactly how a job is priced. Same style/music/no-narration as Reel.tsx.
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Img,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { C } from './theme';
import { FONT, numeric } from './fonts';
import { IcoCheck } from './icons';
import { BASE_CAB } from './screens/Builder';
import cabSidebarImg from './assets/cabinet-sidebar.png';
import cabRatesSidebarImg from './assets/cabinet-rates-sidebar.png';
import reelMusic from './assets/reel-music.mp3';

const Amber: React.FC<React.PropsWithChildren> = ({ children }) => <span style={{ color: C.accent }}>{children}</span>;
const Dot: React.FC = () => <span style={{ color: C.accent }}>.</span>;

const Rise: React.FC<React.PropsWithChildren<{ delay?: number; y?: number; style?: React.CSSProperties }>> = ({ delay = 0, y = 46, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px)`, ...style }}>{children}</div>;
};

const Pop: React.FC<React.PropsWithChildren<{ delay?: number; style?: React.CSSProperties }>> = ({ delay = 0, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6 } });
  return <div style={{ opacity: Math.min(1, s + 0.0001), transform: `scale(${0.6 + s * 0.4})`, ...style }}>{children}</div>;
};

const KICKER: React.CSSProperties = { fontSize: 30, fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: C.accent };
const H1: React.CSSProperties = { fontSize: 92, fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.0, color: '#fff' };
const H1D: React.CSSProperties = { ...H1, color: C.ink };
const SUB: React.CSSProperties = { fontSize: 33, fontWeight: 500, lineHeight: 1.4 };

const InkBG: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
    <AbsoluteFill style={{ background: 'radial-gradient(900px 700px at 80% 6%, rgba(232,168,56,0.22), transparent 55%), radial-gradient(800px 700px at 8% 100%, rgba(13,148,136,0.16), transparent 55%)' }} />
    {children}
  </AbsoluteFill>
);

const LightBG: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
    <AbsoluteFill style={{ background: 'radial-gradient(1100px 700px at 12% -6%, rgba(232,168,56,0.12), transparent 60%)' }} />
    {children}
  </AbsoluteFill>
);

const Pad: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({ children, style }) => (
  <AbsoluteFill style={{ padding: '110px 70px', display: 'flex', flexDirection: 'column', ...style }}>{children}</AbsoluteFill>
);

const Wordmark: React.FC<{ light?: boolean }> = ({ light }) => (
  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', color: light ? '#fff' : C.ink }}>
    ProCabinet<span style={{ color: C.accent }}>.App</span>
  </div>
);

// vertical pan over a tall screenshot, in a browser frame
const VPan: React.FC<{ src: string; natW: number; natH: number; w: number; viewH: number; panFrom: number; panTo: number }> = ({ src, natW, natH, w, viewH, panFrom, panTo }) => {
  const frame = useCurrentFrame();
  const scaledH = natH * (w / natW);
  const maxScroll = Math.max(0, scaledH - viewH);
  const y = interpolate(frame, [panFrom, panTo], [0, -maxScroll], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ width: w, borderRadius: 22, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: '0 40px 100px rgba(17,17,17,0.28)', background: '#fff' }}>
      <div style={{ height: 42, background: C.surface2, borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((d) => (<span key={d} style={{ width: 13, height: 13, borderRadius: '50%', background: d }} />))}
      </div>
      <div style={{ height: viewH, overflow: 'hidden' }}>
        <Img src={src} style={{ width: w, display: 'block', transform: `translateY(${y}px)` }} />
      </div>
    </div>
  );
};

// ── Scene 1 — hook ───────────────────────────────────────────────
const SHook: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center' }}>
      <Rise delay={0}><Wordmark light /></Rise>
      <Rise delay={6} style={{ marginTop: 60 }}><div style={KICKER}>Cabinet builder</div></Rise>
      <div style={{ marginTop: 22 }}>
        <Rise delay={12}><div style={H1}>Price every job</div></Rise>
        <Rise delay={20}><div style={H1}>to the <Amber>penny</Amber><Dot /></div></Rise>
      </div>
      <Rise delay={30} style={{ marginTop: 28 }}><div style={{ ...SUB, color: 'rgba(255,255,255,0.72)' }}>Customise every part — then the builder does the maths.</div></Rise>
    </Pad>
  </InkBG>
);

// ── Scene 2 — the four sub-tabs ──────────────────────────────────
const STabs: React.FC = () => {
  const subtabs = ['Cabinet Builder', 'My Rates', 'Quote Builder', 'Cabinet Library'];
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center' }}>
        <Rise delay={0}><div style={{ ...KICKER, color: C.accent }}>One tab</div></Rise>
        <Rise delay={6} style={{ marginTop: 14 }}><div style={H1D}>Four tools,<br /><Amber>one tab</Amber><Dot /></div></Rise>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 64 }}>
          {subtabs.map((t, i) => (
            <Pop key={t} delay={14 + i * 6}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, background: C.surface, border: `1px solid ${i === 0 ? C.accent : C.border}`, borderRadius: 16, padding: '26px 30px', boxShadow: '0 8px 24px rgba(17,17,17,0.05)' }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: i === 0 ? C.accent : C.faint }} />
                <span style={{ fontSize: 40, fontWeight: 800, color: C.ink }}>{t}</span>
              </div>
            </Pop>
          ))}
        </div>
      </Pad>
    </LightBG>
  );
};

// ── Scene 3 — pan the editor sidebar (customisation) ─────────────
const SBuilder: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>Cabinet builder</div></Rise>
      <Rise delay={6} style={{ marginTop: 12, marginBottom: 34 }}><div style={{ ...H1D, fontSize: 78 }}>Customise <Amber>every part</Amber><Dot /></div></Rise>
      <div style={{ alignSelf: 'center' }}>
        <Pop delay={12}>
          <VPan src={cabSidebarImg} natW={880} natH={4200} w={760} viewH={1120} panFrom={26} panTo={150} />
        </Pop>
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 4 — pan My Rates (the pricing inputs) ──────────────────
const SRates: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>My Rates</div></Rise>
      <Rise delay={6} style={{ marginTop: 12, marginBottom: 34 }}><div style={{ ...H1D, fontSize: 78 }}>Set rates + times <Amber>once</Amber><Dot /></div></Rise>
      <div style={{ alignSelf: 'center' }}>
        <Pop delay={12}>
          <VPan src={cabRatesSidebarImg} natW={880} natH={2620} w={760} viewH={1120} panFrom={24} panTo={120} />
        </Pop>
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 5 — the breakdown (how a job is priced) ────────────────
const SBreak: React.FC = () => {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [22, 70], [0, 1111], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const d = BASE_CAB;
  const cost: [string, string][] = [
    ['Materials', d.materials],
    [`Labour · ${d.labourNote}`, d.labour],
    ['Contingency (5%)', 'incl.'],
    ['Hardware', d.hardware],
  ];
  const build: [string, string, boolean][] = [
    ['Unit cost', d.unitCost, false],
    [`× ${d.units} units`, d.unitsTotal, true],
    [`Markup (${d.markupPct})`, d.markupVal, false],
    [`Tax (${d.taxPct})`, d.taxVal, false],
  ];
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center' }}>
        <Rise delay={0}><div style={KICKER}>The breakdown</div></Rise>
        <Rise delay={6} style={{ marginTop: 12 }}><div style={H1D}>See how it <Amber>adds up</Amber><Dot /></div></Rise>
        <Pop delay={14} style={{ marginTop: 44 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 26, boxShadow: '0 40px 100px rgba(17,17,17,0.16)', padding: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>Base Cabinet 600</div>
              <div style={{ fontSize: 24, color: C.muted, ...numeric }}>600 × 720 × 560</div>
            </div>
            <div style={{ marginTop: 18, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
              {cost.map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 25, color: C.text2 }}>
                  <span>{l}</span><span style={{ ...numeric, fontWeight: 600, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
              {build.map(([l, v, strong]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', fontSize: 25, color: strong ? C.ink : C.text2, fontWeight: strong ? 800 : 500 }}>
                  <span>{l}</span><span style={{ ...numeric, fontWeight: strong ? 800 : 600, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 18, borderTop: `2px solid ${C.border}` }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: C.ink }}>Total</span>
              <span style={{ fontSize: 76, fontWeight: 900, color: C.accent, letterSpacing: '-2px', ...numeric }}>£{n.toLocaleString()}</span>
            </div>
          </div>
        </Pop>
      </Pad>
    </LightBG>
  );
};

// ── Scene 6 — close + CTA ────────────────────────────────────────
const SClose: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Rise delay={0}><div style={{ ...KICKER, color: C.accent }}>Set it once</div></Rise>
      <Rise delay={8} style={{ marginTop: 22 }}><div style={{ ...H1, fontSize: 80 }}>Quote with<br /><Amber>confidence</Amber><Dot /></div></Rise>
      <Rise delay={18} style={{ marginTop: 26 }}><div style={{ ...SUB, color: 'rgba(255,255,255,0.72)', maxWidth: 760 }}>Delegate the admin — and keep your margins on every job.</div></Rise>
      <Rise delay={30} style={{ marginTop: 60 }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>ProCabinet<span style={{ color: C.accent }}>.App</span></div>
        <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.72)', marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
          <IcoCheck size={26} color={C.accent} /> Free to start — no card
        </div>
      </Rise>
    </Pad>
  </InkBG>
);

// ── timeline ─────────────────────────────────────────────────────
export const CABINET_REEL_FPS = 30;
export const CABINET_REEL_DURATION = 770;
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 100 },
  { c: STabs, from: 100, dur: 96 },
  { c: SBuilder, from: 196, dur: 160 },
  { c: SRates, from: 356, dur: 134 },
  { c: SBreak, from: 490, dur: 130 },
  { c: SClose, from: 620, dur: 150 },
];

export const CabinetReel: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio
      src={reelMusic}
      volume={(f) => interpolate(f, [0, 12, CABINET_REEL_DURATION - 40, CABINET_REEL_DURATION - 4], [0, 0.72, 0.72, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
    />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
