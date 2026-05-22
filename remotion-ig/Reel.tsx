// 9:16 product reel (1080x1920) — a fast, dynamic overview of ProCabinet built
// from the same components + real screenshots as the carousels, leaning on the
// landing-page phrasing. No narration; music is added in ReelRoot via <Audio>.
// Motion: spring entrances, count-ups, Ken-Burns drift — landing-page energy.
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
import { TAB_ICONS, TabKey, IcoCheck } from './icons';
import { IconStrip } from './chrome';
import { ScheduleCalendar } from './screens/Schedule';
import { OrdersScreen } from './screens/Orders';
import { QuoteLinesPanel } from './screens/Quotes';
import cutNestImg from './assets/cut-nest.png';
import reelMusic from './assets/reel-music.mp3';

const Amber: React.FC<React.PropsWithChildren> = ({ children }) => <span style={{ color: C.accent }}>{children}</span>;
// trailing full stop in accent-amber (brand motif on headlines)
const Dot: React.FC = () => <span style={{ color: C.accent }}>.</span>;

// rise + fade in
const Rise: React.FC<React.PropsWithChildren<{ delay?: number; y?: number; style?: React.CSSProperties }>> = ({ delay = 0, y = 46, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px)`, ...style }}>{children}</div>;
};

// pop (scale) in
const Pop: React.FC<React.PropsWithChildren<{ delay?: number; style?: React.CSSProperties }>> = ({ delay = 0, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6 } });
  return <div style={{ opacity: Math.min(1, s + 0.0001), transform: `scale(${0.6 + s * 0.4})`, ...style }}>{children}</div>;
};

const KICKER: React.CSSProperties = { fontSize: 30, fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: C.accent };
const H1: React.CSSProperties = { fontSize: 96, fontWeight: 900, letterSpacing: '-3px', lineHeight: 1.0, color: '#fff' };
const H1D: React.CSSProperties = { ...H1, color: C.ink };
const SUB: React.CSSProperties = { fontSize: 34, fontWeight: 500, lineHeight: 1.4 };

// a screenshot/visual in a browser frame that slowly drifts (Ken Burns)
const Framed: React.FC<{ children: React.ReactNode; w?: number }> = ({ children, w = 940 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 110], [1.04, 1.12], { extrapolateRight: 'extend' });
  return (
    <div style={{ width: w, borderRadius: 26, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: '0 40px 100px rgba(17,17,17,0.30)', background: C.surface, transform: `scale(${scale})` }}>
      <div style={{ height: 46, background: C.surface2, borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px' }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((d) => (<span key={d} style={{ width: 14, height: 14, borderRadius: '50%', background: d }} />))}
      </div>
      {children}
    </div>
  );
};

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
  <AbsoluteFill style={{ padding: '120px 80px', display: 'flex', flexDirection: 'column', ...style }}>{children}</AbsoluteFill>
);

const Wordmark: React.FC<{ light?: boolean }> = ({ light }) => (
  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', color: light ? '#fff' : C.ink }}>
    ProCabinet<span style={{ color: C.accent }}>.App</span>
  </div>
);

// ── Scene 1 — hook ───────────────────────────────────────────────
const SHook: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center' }}>
      <Rise delay={0}><Wordmark light /></Rise>
      <Rise delay={6} style={{ marginTop: 60 }}><div style={KICKER}>The workshop OS</div></Rise>
      <div style={{ marginTop: 22 }}>
        <Rise delay={12}><div style={H1}>Quote custom</div></Rise>
        <Rise delay={20}><div style={H1}>cabinetry <Amber>in minutes</Amber><Dot /></div></Rise>
        <Rise delay={28}><div style={{ ...H1, color: 'rgba(255,255,255,0.5)' }}>…not hours<Dot /></div></Rise>
      </div>
    </Pad>
  </InkBG>
);

// ── Scene 2 — eight tabs ─────────────────────────────────────────
const STabs: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const keys: TabKey[] = ['dashboard', 'cutlist', 'cabinet', 'stock', 'orders', 'quotes', 'clients', 'schedule'];
  const stat = (target: number, d: number) => Math.round(target * spring({ frame: frame - d, fps, config: { damping: 200 } }));
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center' }}>
        <Rise delay={0}><div style={{ ...KICKER, color: C.accent }}>One workshop</div></Rise>
        <Rise delay={6} style={{ marginTop: 14 }}><div style={H1D}>Eight tabs<Dot /><br /><Amber>One workshop.</Amber></div></Rise>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 22, marginTop: 70 }}>
          {keys.map((k, i) => {
            const Ico = TAB_ICONS[k];
            return (
              <Pop key={k} delay={14 + i * 4}>
                <div style={{ aspectRatio: '1', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '22px 22px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(17,17,17,0.06)' }}>
                  <Ico size={62} color={C.ink} />
                </div>
              </Pop>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 64 }}>
          {[['8', 'connected tabs', C.accent], ['6', 'smart libraries', C.accent], ['1', 'place for everything', C.accent]].map(([t, l, col], i) => (
            <div key={l as string} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 96, fontWeight: 900, color: col as string, letterSpacing: '-3px', ...numeric }}>{stat(Number(t), 30 + i * 6)}</div>
              <div style={{ fontSize: 24, color: C.muted, fontWeight: 600 }}>{l}</div>
            </div>
          ))}
        </div>
      </Pad>
    </LightBG>
  );
};

// ── Scene 3 — live pricing (count-up) ────────────────────────────
const SPrice: React.FC = () => {
  const frame = useCurrentFrame();
  const n = Math.round(interpolate(frame, [14, 52], [0, 1111], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const rows: [string, string][] = [['Materials', '£7.83'], ['Labour · 2.4 hrs', '£179.22'], ['Markup (35%)', '+£262'], ['Tax (10%)', '+£101']];
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center' }}>
        <Rise delay={0}><div style={KICKER}>Live pricing</div></Rise>
        <Rise delay={6} style={{ marginTop: 14 }}><div style={H1D}>It does the <Amber>maths</Amber><Dot /></div></Rise>
        <Rise delay={12} style={{ marginTop: 16 }}><div style={{ ...SUB, color: C.text2 }}>Set your rates once — every change re-prices live.</div></Rise>
        <Pop delay={14} style={{ marginTop: 56 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 28, boxShadow: '0 40px 100px rgba(17,17,17,0.18)', padding: 44 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 38, fontWeight: 800, color: C.ink }}>Base Cabinet 600</div>
                <div style={{ fontSize: 24, color: C.muted, marginTop: 6, ...numeric }}>600 × 720 × 560 mm · ×4</div>
              </div>
              <div style={{ fontSize: 80, fontWeight: 900, color: C.accent, letterSpacing: '-2px', ...numeric }}>£{n.toLocaleString()}</div>
            </div>
            <div style={{ marginTop: 24, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 18 }}>
              {rows.map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 27, color: C.text2 }}>
                  <span>{l}</span><span style={{ ...numeric, fontWeight: 700, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Pop>
      </Pad>
    </LightBG>
  );
};

// ── Scene 4 — cut list (real screenshot) ─────────────────────────
const SCut: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badge = spring({ frame: frame - 26, fps, config: { damping: 12 } });
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}><div style={KICKER}>Cut list optimiser</div></Rise>
        <Rise delay={6} style={{ marginTop: 14 }}><div style={H1D}>Optimize cut lists <Amber>deduct from stock</Amber><Dot /></div></Rise>
        <div style={{ position: 'relative', marginTop: 60, alignSelf: 'center' }}>
          <Pop delay={12}><Framed w={920}><Img src={cutNestImg} style={{ width: '100%', display: 'block' }} /></Framed></Pop>
          <div style={{ position: 'absolute', top: -28, right: -10, background: C.green, color: '#fff', fontWeight: 900, fontSize: 38, padding: '14px 26px', borderRadius: 18, boxShadow: '0 16px 40px rgba(61,153,112,0.5)', transform: `scale(${badge})`, ...numeric }}>72% used</div>
        </div>
      </Pad>
    </LightBG>
  );
};

// ── Scene 5 — schedule ───────────────────────────────────────────
const SSchedule: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>Auto-schedule</div></Rise>
      <Rise delay={6} style={{ marginTop: 14 }}><div style={H1D}>Production that <Amber>schedules itself</Amber><Dot /></div></Rise>
      <Pop delay={12} style={{ marginTop: 56, alignSelf: 'center' }}>
        <Framed w={960}>
          <div style={{ background: C.bg }}><ScheduleCalendar /></div>
        </Framed>
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 6 — one pipeline ───────────────────────────────────────
const SPipeline: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>One pipeline</div></Rise>
      <Rise delay={6} style={{ marginTop: 14 }}><div style={H1D}>Quote → order → <Amber>invoice</Amber><Dot /></div></Rise>
      <Pop delay={12} style={{ marginTop: 50, alignSelf: 'center' }}>
        <Framed w={980}>
          <div style={{ background: C.bg }}><OrdersScreen /></div>
        </Framed>
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 7 — OS close + CTA ─────────────────────────────────────
const SClose: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <InkBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <Rise delay={0}><div style={{ ...KICKER, color: C.accent }}>Not just an app</div></Rise>
        <Rise delay={8} style={{ marginTop: 22 }}>
          <div style={{ ...H1, fontSize: 78 }}>It's your workshop's<br /><Amber>operating system</Amber><Dot /></div>
        </Rise>
        <Rise delay={20} style={{ marginTop: 56 }}><IconStrip light size={42} /></Rise>
        <Rise delay={30} style={{ marginTop: 64 }}>
          <div style={{ fontSize: 64, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>ProCabinet<span style={{ color: C.accent }}>.App</span></div>
          <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.72)', marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
            <IcoCheck size={26} color={C.accent} /> Try it for free - no card required
          </div>
        </Rise>
      </Pad>
    </InkBG>
  );
};

// ── timeline ─────────────────────────────────────────────────────
export const REEL_FPS = 30;
export const REEL_DURATION = 774; // ~25.8s
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 96 },
  { c: STabs, from: 96, dur: 104 },
  { c: SPrice, from: 200, dur: 116 },
  { c: SCut, from: 316, dur: 104 },
  { c: SSchedule, from: 420, dur: 104 },
  { c: SPipeline, from: 524, dur: 100 },
  { c: SClose, from: 624, dur: 150 },
];

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio
      src={reelMusic}
      volume={(f) => interpolate(f, [0, 12, REEL_DURATION - 40, REEL_DURATION - 4], [0, 0.72, 0.72, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
    />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
