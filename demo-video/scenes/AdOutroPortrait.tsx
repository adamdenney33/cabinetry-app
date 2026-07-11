/**
 * AdOutroPortrait — portrait reframe of AdOutro: same copy/beats, smaller
 * type + narrower maxWidth sized for a 1080px-wide frame.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C, BRAND, PINSTRIPES, DISPLAY } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

export const AdOutroPortrait: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inOp = interpolate(frame, [0, 8], [0, 1], clampOpts);
  const l1 = interpolate(frame, [4, 18], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const l2 = interpolate(frame, [14, 30], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const cta = spring({ frame: frame - 36, fps, config: { damping: 13, mass: 0.7, stiffness: 150 } });
  const foot = interpolate(frame, [50, 64], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const pulse = 1 + Math.sin(Math.max(0, frame - 44) / 11) * 0.015;

  return (
    <AbsoluteFill style={{ ...PINSTRIPES, fontFamily: FONT, alignItems: 'flex-start', justifyContent: 'center', padding: '0 80px', opacity: inOp }}>
      <div style={{ textAlign: 'left', maxWidth: 900, opacity: Math.max(l1, l2), transform: `translateY(${(1 - l2) * 16}px)` }}>
        <div style={{ ...DISPLAY, fontSize: 62 }}>
          <span style={{ color: '#fff' }}>It's not just an app. It's your workshop's </span>
          <span style={{ color: C.accent }}>operating system.</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 48, transform: `scale(${interpolate(cta, [0, 1], [0.82, 1]) * pulse})`, transformOrigin: 'left center', opacity: interpolate(cta, [0, 1], [0, 1]) }}>
        <div style={{ background: C.accent, color: '#111', fontSize: 26, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '20px 40px' }}>Start free</div>
      </div>
      <div style={{ marginTop: 22, color: 'rgba(255,255,255,0.62)', fontSize: 20, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: foot }}>
        No card needed · {BRAND.url}
      </div>
    </AbsoluteFill>
  );
};
