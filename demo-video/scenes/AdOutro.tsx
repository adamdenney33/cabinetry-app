/**
 * AdOutro v2 — CTA. Copy verbatim from the landing page.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C, BRAND, PINSTRIPES, DISPLAY } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

export const AdOutro: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inOp = interpolate(frame, [0, 8], [0, 1], clampOpts);
  const l1 = interpolate(frame, [4, 18], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const l2 = interpolate(frame, [14, 30], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const cta = spring({ frame: frame - 36, fps, config: { damping: 13, mass: 0.7, stiffness: 150 } });
  const foot = interpolate(frame, [50, 64], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const pulse = 1 + Math.sin(Math.max(0, frame - 44) / 11) * 0.015;

  return (
    <AbsoluteFill style={{ ...PINSTRIPES, fontFamily: FONT, alignItems: 'flex-start', justifyContent: 'center', padding: '0 120px', opacity: inOp }}>
      <div style={{ textAlign: 'left', maxWidth: 1400, opacity: Math.max(l1, l2), transform: `translateY(${(1 - l2) * 16}px)` }}>
        <div style={{ ...DISPLAY, fontSize: 76, letterSpacing: '-2px' }}>
          <span style={{ color: '#fff' }}>It's not just an app. It's your workshop's </span>
          <span style={{ color: C.accent }}>operating system.</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 50, transform: `scale(${interpolate(cta, [0, 1], [0.82, 1]) * pulse})`, transformOrigin: 'left center', opacity: interpolate(cta, [0, 1], [0, 1]) }}>
        <div style={{ background: C.accent, color: '#111', fontSize: 28, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', padding: '22px 44px' }}>Start free</div>
      </div>
      <div style={{ marginTop: 24, color: 'rgba(255,255,255,0.62)', fontSize: 21, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', opacity: foot }}>
        No card needed · {BRAND.url}
      </div>
    </AbsoluteFill>
  );
};
