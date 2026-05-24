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
import { IcoCheck, TAB_ICONS } from './icons';
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
        <Rise delay={12}><div style={H1}>What if quoting</div></Rise>
        <Rise delay={20}><div style={H1}>was this <Amber>easy?</Amber></div></Rise>
      </div>
      <Rise delay={30} style={{ marginTop: 28 }}><div style={{ ...SUB, color: 'rgba(255,255,255,0.72)' }}>Spec the parts, get instant pricing and timings.</div></Rise>
    </Pad>
  </InkBG>
);

// ── Scene 2 — the four sub-tabs ──────────────────────────────────
// the Cabinet tab's sub-tabs, rendered as the app does them: equal-width tabs,
// centred labels, the active one underlined in amber (app uses 13px / flex:1 /
// 2px accent border-bottom — see index.html #cab-tab-*).
const SubTab: React.FC<{ label: string; on?: boolean }> = ({ label, on }) => (
  <div
    style={{
      flex: '1 1 0',
      textAlign: 'center',
      padding: '18px 10px',
      fontSize: 19,
      fontWeight: on ? 800 : 500,
      color: on ? C.text : C.muted,
      borderBottom: on ? `3px solid ${C.accent}` : '3px solid transparent',
      marginBottom: -1,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </div>
);

// just the Cabinet nav tab (other tabs dropped), scaled up to sit in proportion
// with the sub-tabs below. Mirrors the app's active-tab styling: white surface,
// rounded top, amber accent line, icon + label.
const CabinetNavTab: React.FC = () => {
  const Ico = TAB_ICONS.cabinet;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxSizing: 'border-box',
        width: 220, // = one sub-tab (880 / 4)
        marginLeft: 110, // centre on the seam between sub-tabs 1 and 2 (x=220)
        padding: '14px 0 16px',
        borderRadius: '12px 12px 0 0',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.surface}`,
        marginBottom: -1,
        color: C.text,
        fontSize: 19,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      <Ico size={22} color={C.text} />
      <span>Cabinet</span>
    </div>
  );
};

// the Cabinet tab + its four sub-tabs — a faithful crop of the app's tab area,
// not the whole screen.
const CabinetSubTabBar: React.FC = () => (
  <div style={{ width: 880, background: C.surface, border: `1px solid ${C.border}`, borderRadius: '18px 18px 0 0', overflow: 'hidden', boxShadow: '0 30px 80px rgba(17,17,17,0.18)' }}>
    <div style={{ background: C.tabbar, padding: '14px 0 0', display: 'flex' }}>
      <CabinetNavTab />
    </div>
    <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}` }}>
      <SubTab label="Cabinet Builder" on />
      <SubTab label="My Rates" />
      <SubTab label="Quote Builder" />
      <SubTab label="Cabinet Library" />
    </div>
    <div style={{ height: 64, background: C.surface }} />
  </div>
);

const STabs: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center' }}>
      <Rise delay={0}><div style={{ ...KICKER, color: C.accent }}>One Cabinet tab</div></Rise>
      <Rise delay={6} style={{ marginTop: 14, marginBottom: 56 }}><div style={H1D}>Set rates once,<br /><Amber>build, quote, repeat.</Amber></div></Rise>
      <Pop delay={12} style={{ alignSelf: 'center' }}>
        <CabinetSubTabBar />
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 3 — pan the editor sidebar (customisation) ─────────────
const SBuilder: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>Cabinet builder</div></Rise>
      <Rise delay={6} style={{ marginTop: 12, marginBottom: 34 }}><div style={{ ...H1D, fontSize: 78 }}>Customise <Amber>every part</Amber><Dot /></div></Rise>
      <div style={{ alignSelf: 'center' }}>
        <Pop delay={12}>
          <VPan src={cabSidebarImg} natW={880} natH={4200} w={760} viewH={1300} panFrom={22} panTo={235} />
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
          <VPan src={cabRatesSidebarImg} natW={880} natH={2620} w={760} viewH={1300} panFrom={20} panTo={120} />
        </Pop>
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 5 — the breakdown (how a job is priced) ────────────────
const SBreak: React.FC = () => {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [22, 70], [0, 1111], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const hrs = interpolate(frame, [22, 70], [0, 9.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
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
        <Rise delay={10} style={{ marginTop: 14 }}><div style={{ ...SUB, color: C.text2 }}>Every quote gives you the <Amber>hours</Amber>, not just the price.</div></Rise>
        <Pop delay={14} style={{ marginTop: 30 }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14, paddingTop: 18, borderTop: `2px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '0.5px', color: C.muted }}>TIME</div>
                <div style={{ fontSize: 60, fontWeight: 900, color: C.ink, letterSpacing: '-1.5px', ...numeric }}>{hrs.toFixed(1)} <span style={{ fontSize: 28, fontWeight: 700, color: C.muted }}>hrs</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '0.5px', color: C.muted }}>TOTAL</div>
                <div style={{ fontSize: 64, fontWeight: 900, color: C.accent, letterSpacing: '-2px', ...numeric }}>£{n.toLocaleString()}</div>
              </div>
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
      <Rise delay={18} style={{ marginTop: 26 }}><div style={{ ...SUB, color: 'rgba(255,255,255,0.72)', maxWidth: 760 }}>Set your rates once, hand off the admin.</div></Rise>
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
export const CABINET_REEL_DURATION = 861;
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 100 },
  { c: STabs, from: 100, dur: 96 },
  { c: SRates, from: 196, dur: 135 },
  { c: SBuilder, from: 331, dur: 250 }, // slower pan for readability
  { c: SBreak, from: 581, dur: 130 },
  { c: SClose, from: 711, dur: 150 },
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
