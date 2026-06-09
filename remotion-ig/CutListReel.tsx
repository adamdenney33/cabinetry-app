// 9:16 reel #3 — Cut List. Leads with time saved, and the USP: it is connected
// to your stock library and saved cabinets (most shops already own a cut-list
// tool). Beats: hook → pull parts from the library → optimise the nest in
// seconds → the result (real numbers) → deduct from stock (the connected bit) →
// close. Same style / music / no-narration as the other reels.
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { C } from './theme';
import { FONT, numeric } from './fonts';
import { IcoCheck, IcoClock } from './icons';
import { CutPartsSidebar, NestingMoneyShot, DeductPanel } from './screens/CutList';
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

// ── Scene 1 — hook ───────────────────────────────────────────────
const SHook: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center' }}>
      <Rise delay={0}><Wordmark light /></Rise>
      <Rise delay={6} style={{ marginTop: 60 }}><div style={KICKER}>Cut List</div></Rise>
      <div style={{ marginTop: 22 }}>
        <Rise delay={12}><div style={H1}>Still drawing</div></Rise>
        <Rise delay={18}><div style={H1}>cut lists</div></Rise>
        <Rise delay={24}><div style={H1}>by <Amber>hand?</Amber></div></Rise>
      </div>
      <Rise delay={34} style={{ marginTop: 28 }}><div style={{ ...SUB, color: 'rgba(255,255,255,0.72)' }}>Pull your parts, nest the sheets, deduct the stock.</div></Rise>
    </Pad>
  </InkBG>
);

// ── Scene 2 — pull the parts from your library ───────────────────
const SParts: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>Your parts</div></Rise>
      <Rise delay={6} style={{ marginTop: 12, marginBottom: 30 }}><div style={{ ...H1D, fontSize: 78 }}>Straight from <Amber>your library</Amber><Dot /></div></Rise>
      <div style={{ alignSelf: 'center' }}>
        <Pop delay={12}>
          <div style={{ transform: 'scale(1.55)', transformOrigin: 'top center' }}>
            <CutPartsSidebar />
          </div>
        </Pop>
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 3 — optimise the nest in seconds ───────────────────────
const SOptimise: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>One button</div></Rise>
      <Rise delay={6} style={{ marginTop: 12 }}><div style={H1D}>Nest it in <Amber>seconds</Amber><Dot /></div></Rise>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Pop delay={12}>
          <div style={{ transform: 'scale(1.05)', transformOrigin: 'center' }}>
            <NestingMoneyShot />
          </div>
        </Pop>
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 4 — the result (real numbers) ──────────────────────────
const CHIP_SHADOW = '0 18px 50px rgba(17,17,17,0.10)';
const Chip: React.FC<{ big: string; small: string }> = ({ big, small }) => (
  <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 22, padding: '30px 20px', textAlign: 'center', boxShadow: CHIP_SHADOW }}>
    <div style={{ fontSize: 70, fontWeight: 900, color: C.ink, letterSpacing: '-2px', ...numeric }}>{big}</div>
    <div style={{ fontSize: 26, fontWeight: 600, color: C.muted, marginTop: 6 }}>{small}</div>
  </div>
);

const SProof: React.FC = () => {
  const frame = useCurrentFrame();
  const u1 = Math.round(interpolate(frame, [16, 56], [0, 72], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  const u2 = Math.round(interpolate(frame, [16, 56], [0, 57], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center' }}>
        <Rise delay={0}><div style={KICKER}>The result</div></Rise>
        <Rise delay={6} style={{ marginTop: 12 }}><div style={H1D}>Less board, <Amber>less time</Amber><Dot /></div></Rise>
        <Rise delay={12} style={{ marginTop: 36 }}>
          <div style={{ display: 'flex', gap: 22 }}>
            <Chip big="29" small="parts placed" />
            <Chip big={`${u1}%`} small="sheet 1 used" />
            <Chip big={`${u2}%`} small="sheet 2 used" />
          </div>
        </Rise>
        <Rise delay={22} style={{ marginTop: 26 }}>
          <div style={{ background: C.ink, borderRadius: 22, padding: '28px 34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#fff' }}>
              <IcoClock size={40} color={C.accent} />
              <div style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>By hand: <span style={{ color: '#fff', fontWeight: 800 }}>the best part of an hour</span></div>
            </div>
            <div style={{ fontSize: 40, fontWeight: 900, color: C.accent, letterSpacing: '-1px' }}>Here: seconds</div>
          </div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── Scene 5 — deduct from stock (the connected USP) ──────────────
const SDeduct: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'flex-start' }}>
      <Rise delay={0}><div style={KICKER}>Connected to Stock</div></Rise>
      <Rise delay={6} style={{ marginTop: 12 }}><div style={H1D}>Deduct as you <Amber>cut</Amber><Dot /></div></Rise>
      <Rise delay={10} style={{ marginTop: 14 }}><div style={{ ...SUB, color: C.text2, maxWidth: 820 }}>One button takes the boards straight off your stock, so on-hand stays honest.</div></Rise>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Pop delay={14}>
          <div style={{ transform: 'scale(1.35)', transformOrigin: 'center' }}>
            <DeductPanel />
          </div>
        </Pop>
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 6 — close + CTA ────────────────────────────────────────
const SClose: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Rise delay={0}><div style={{ ...KICKER, color: C.accent }}>Stop guessing</div></Rise>
      <Rise delay={8} style={{ marginTop: 22 }}><div style={{ ...H1, fontSize: 80 }}>Cut sheets that<br />don't <Amber>waste board</Amber><Dot /></div></Rise>
      <Rise delay={18} style={{ marginTop: 26 }}><div style={{ ...SUB, color: 'rgba(255,255,255,0.72)', maxWidth: 780 }}>Connected to your stock and your saved cabinets.</div></Rise>
      <Rise delay={30} style={{ marginTop: 56 }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>ProCabinet<span style={{ color: C.accent }}>.App</span></div>
        <div style={{ fontSize: 30, color: 'rgba(255,255,255,0.72)', marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
          <IcoCheck size={26} color={C.accent} /> Free to start, no card
        </div>
      </Rise>
    </Pad>
  </InkBG>
);

// ── timeline ─────────────────────────────────────────────────────
export const CUTLIST_REEL_FPS = 30;
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 100 },
  { c: SParts, from: 100, dur: 130 },
  { c: SOptimise, from: 230, dur: 150 },
  { c: SProof, from: 380, dur: 150 },
  { c: SDeduct, from: 530, dur: 140 },
  { c: SClose, from: 670, dur: 150 },
];
export const CUTLIST_REEL_DURATION = 820;

export const CutListReel: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio
      src={reelMusic}
      volume={(f) => interpolate(f, [0, 12, CUTLIST_REEL_DURATION - 40, CUTLIST_REEL_DURATION - 4], [0, 0.72, 0.72, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
    />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
