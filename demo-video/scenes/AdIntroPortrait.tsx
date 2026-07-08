/**
 * AdIntroPortrait — portrait reframe of AdIntro: same copy/beats, smaller
 * type sized for a 1080px-wide frame instead of 1920px.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

const Word: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 9], [0, 1], { ...clampOpts, easing: EASE_OUT });
  return <span style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 26}px) scale(${0.94 + t * 0.06})`, ...style }}>{children}</span>;
};

export const AdIntroPortrait: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const eyebrow = interpolate(frame, [2, 12], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const brand = spring({ frame: frame - 66, fps, config: { damping: 13, mass: 0.7, stiffness: 150 } });
  const punch = 1 + interpolate(frame, [0, dur], [0, 0.07], clampOpts);
  const out = interpolate(frame, [dur - 10, dur], [1, 0], clampOpts);
  const flash = interpolate(frame, [0, 5], [0.35, 0], clampOpts);

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <AbsoluteFill style={{ background: `radial-gradient(46% 36% at 50% 46%, rgba(232,168,56,0.14) 0%, rgba(232,168,56,0) 70%)` }} />
      <div style={{ transform: `scale(${punch})`, textAlign: 'center', padding: '0 56px' }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3.4, textTransform: 'uppercase', color: C.accent, opacity: eyebrow, marginBottom: 22 }}>
          The workshop OS for cabinet makers
        </div>
        <div style={{ fontSize: 58, fontWeight: 800, color: '#fff', letterSpacing: -1.6, lineHeight: 1.12 }}>
          <Word at={8}>Quote custom cabinetry projects</Word>
        </div>
        <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.12, marginTop: 4 }}>
          <Word at={22} style={{ color: C.accent }}>in minutes</Word>{' '}
          <Word at={34} style={{ color: 'rgba(255,255,255,0.45)' }}>... not hours</Word>
        </div>
        <div style={{ marginTop: 34, opacity: interpolate(brand, [0, 1], [0, 1]), transform: `scale(${interpolate(brand, [0, 1], [0.88, 1])})` }}>
          <span style={{ fontSize: 27, fontWeight: 800, letterSpacing: -0.6 }}>
            <span style={{ color: '#fff' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
          </span>
        </div>
      </div>
      <AbsoluteFill style={{ background: '#fff', opacity: flash, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
