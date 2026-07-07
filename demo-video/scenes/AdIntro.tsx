/**
 * AdIntro — kinetic hook for the landing ad. Problem line → answer line → brand.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { BACKDROP, FONT, C, BRAND } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

const Word: React.FC<{ at: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ at, children, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [at, at + 12], [0, 1], { ...clampOpts, easing: EASE_OUT });
  return (
    <span style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 26}px)`, ...style }}>{children}</span>
  );
};

export const AdIntro: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Beat 1: the problem (frames 0–70), Beat 2: the answer + brand (70–end)
  const b1Out = interpolate(frame, [62, 74], [1, 0], clampOpts);
  const b2 = frame >= 72;
  const logo = spring({ frame: frame - 118, fps, config: { damping: 13, mass: 0.8, stiffness: 120 } });
  const drift = interpolate(frame, [0, dur], [1, 1.06], clampOpts);
  const out = interpolate(frame, [dur - 14, dur], [1, 0], clampOpts);

  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <AbsoluteFill style={{ background: `radial-gradient(46% 36% at 50% 44%, rgba(232,168,56,0.10) 0%, rgba(232,168,56,0) 70%)` }} />
      <div style={{ transform: `scale(${drift})`, textAlign: 'center' }}>
        {!b2 && (
          <div style={{ opacity: b1Out }}>
            <div style={{ fontSize: 62, fontWeight: 800, color: '#fff', letterSpacing: -1.6, lineHeight: 1.15 }}>
              <Word at={4}>Still pricing cabinets</Word>
            </div>
            <div style={{ fontSize: 62, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.15, marginTop: 6 }}>
              <Word at={18} style={{ color: 'rgba(255,255,255,0.55)' }}>at the kitchen table, at 10pm?</Word>
            </div>
          </div>
        )}
        {b2 && (
          <div>
            <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -2.2, lineHeight: 1.1 }}>
              <Word at={76} style={{ color: '#fff' }}>Quote in&nbsp;</Word>
              <Word at={84} style={{ color: C.accent }}>minutes.</Word>
            </div>
            <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: -2.2, lineHeight: 1.1, marginTop: 4 }}>
              <Word at={94} style={{ color: '#fff' }}>Get approved&nbsp;</Word>
              <Word at={102} style={{ color: C.accent }}>the same day.</Word>
            </div>
            <div style={{ marginTop: 44, opacity: interpolate(logo, [0, 1], [0, 1]), transform: `scale(${interpolate(logo, [0, 1], [0.9, 1])})` }}>
              <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.8 }}>
                <span style={{ color: 'rgba(255,255,255,0.9)' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
              </span>
              <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', fontWeight: 600, marginLeft: 16, letterSpacing: 2, textTransform: 'uppercase' }}>{BRAND.tagline}</span>
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
