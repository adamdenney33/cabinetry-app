// Shared primitives for the 9:16 reels — extracted from Reel.tsx so every reel
// (overview v2, live-link, speed, founder) animates and reads identically.
// Nothing here changes the original `reel` composition.
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from 'remotion';
import { C } from './theme';
import { FONT } from './fonts';

export const Amber: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ color: C.accent }}>{children}</span>
);
// trailing full stop in accent-amber (brand motif on headlines)
export const Dot: React.FC = () => <span style={{ color: C.accent }}>.</span>;

// rise + fade in
export const Rise: React.FC<
  React.PropsWithChildren<{ delay?: number; y?: number; style?: React.CSSProperties }>
> = ({ delay = 0, y = 46, style, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px)`, ...style }}>{children}</div>;
};

// pop (scale) in
export const Pop: React.FC<React.PropsWithChildren<{ delay?: number; style?: React.CSSProperties }>> = ({
  delay = 0,
  style,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.6 } });
  return (
    <div style={{ opacity: Math.min(1, s + 0.0001), transform: `scale(${0.6 + s * 0.4})`, ...style }}>
      {children}
    </div>
  );
};

export const KICKER: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  letterSpacing: '3px',
  textTransform: 'uppercase',
  color: C.accent,
};
export const H1: React.CSSProperties = {
  fontSize: 96,
  fontWeight: 900,
  letterSpacing: '-3px',
  lineHeight: 1.0,
  color: '#fff',
};
export const H1D: React.CSSProperties = { ...H1, color: C.ink };
export const SUB: React.CSSProperties = { fontSize: 34, fontWeight: 500, lineHeight: 1.4 };

export const InkBG: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(900px 700px at 80% 6%, rgba(232,168,56,0.22), transparent 55%), radial-gradient(800px 700px at 8% 100%, rgba(13,148,136,0.16), transparent 55%)',
      }}
    />
    {children}
  </AbsoluteFill>
);

export const LightBG: React.FC<React.PropsWithChildren> = ({ children }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
    <AbsoluteFill
      style={{
        background: 'radial-gradient(1100px 700px at 12% -6%, rgba(232,168,56,0.12), transparent 60%)',
      }}
    />
    {children}
  </AbsoluteFill>
);

export const Pad: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties }>> = ({
  children,
  style,
}) => (
  <AbsoluteFill style={{ padding: '120px 80px', display: 'flex', flexDirection: 'column', ...style }}>
    {children}
  </AbsoluteFill>
);

export const Wordmark: React.FC<{ light?: boolean }> = ({ light }) => (
  <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.5px', color: light ? '#fff' : C.ink }}>
    ProCabinet<span style={{ color: C.accent }}>.App</span>
  </div>
);

// a visual in a browser frame that slowly drifts (Ken Burns)
export const Framed: React.FC<{ children: React.ReactNode; w?: number }> = ({ children, w = 940 }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, 110], [1.04, 1.12], { extrapolateRight: 'extend' });
  return (
    <div
      style={{
        width: w,
        borderRadius: 26,
        overflow: 'hidden',
        border: `1px solid ${C.border}`,
        boxShadow: '0 40px 100px rgba(17,17,17,0.30)',
        background: C.surface,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          height: 46,
          background: C.surface2,
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 18px',
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map((d) => (
          <span key={d} style={{ width: 14, height: 14, borderRadius: '50%', background: d }} />
        ))}
      </div>
      {children}
    </div>
  );
};

// standard music envelope (fade in over 12f, out over the last ~36f)
export const musicVolume =
  (duration: number) =>
  (f: number): number =>
    interpolate(f, [0, 12, duration - 40, duration - 4], [0, 0.72, 0.72, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
