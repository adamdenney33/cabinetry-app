/**
 * AdIntro v2 — hard-hitting kinetic hook. Copy is verbatim from the landing
 * hero: eyebrow + "Quote custom cabinetry projects in minutes ... not hours".
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

const Word: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 9], [0, 1], { ...clampOpts, easing: EASE_OUT });
  return <span style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 34}px) scale(${0.94 + t * 0.06})`, ...style }}>{children}</span>;
};

export const AdIntro: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eyebrow = interpolate(frame, [2, 12], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const brand = spring({ frame: frame - 66, fps, config: { damping: 13, mass: 0.7, stiffness: 150 } });
  const punch = 1 + interpolate(frame, [0, dur], [0, 0.07], clampOpts); // continuous push-in
  const out = interpolate(frame, [dur - 10, dur], [1, 0], clampOpts);
  const flash = interpolate(frame, [0, 5], [0.35, 0], clampOpts); // opening flash frame

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <AbsoluteFill style={{ background: `radial-gradient(46% 36% at 50% 46%, rgba(232,168,56,0.14) 0%, rgba(232,168,56,0) 70%)` }} />
      <div style={{ transform: `scale(${punch})`, textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: 4.5, textTransform: 'uppercase', color: C.accent, opacity: eyebrow, marginBottom: 26 }}>
          The workshop OS for cabinet makers
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, color: '#fff', letterSpacing: -2.4, lineHeight: 1.08 }}>
          <Word at={8}>Quote custom</Word>{' '}<Word at={14}>cabinetry projects</Word>
        </div>
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -2.4, lineHeight: 1.08, marginTop: 4 }}>
          <Word at={22} style={{ color: C.accent }}>in minutes</Word>{' '}
          <Word at={34} style={{ color: 'rgba(255,255,255,0.45)' }}>... not hours</Word>
        </div>
        <div style={{ marginTop: 40, opacity: interpolate(brand, [0, 1], [0, 1]), transform: `scale(${interpolate(brand, [0, 1], [0.88, 1])})` }}>
          <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.8 }}>
            <span style={{ color: '#fff' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
          </span>
        </div>
      </div>
      <AbsoluteFill style={{ background: '#fff', opacity: flash, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
