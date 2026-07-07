/**
 * AdOutro — CTA card for the landing ad.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { BACKDROP, FONT, C, BRAND } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

export const AdOutro: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inOp = interpolate(frame, [0, 12], [0, 1], clampOpts);
  const l1 = interpolate(frame, [8, 26], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const l2 = interpolate(frame, [20, 40], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const cta = spring({ frame: frame - 48, fps, config: { damping: 14, mass: 0.8, stiffness: 120 } });
  const foot = interpolate(frame, [64, 82], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const pulse = 1 + Math.sin(Math.max(0, frame - 60) / 14) * 0.012;

  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: inOp }}>
      <AbsoluteFill style={{ background: `radial-gradient(46% 36% at 50% 46%, rgba(232,168,56,0.12) 0%, rgba(232,168,56,0) 70%)` }} />
      <div style={{ opacity: l1, transform: `translateY(${(1 - l1) * 14}px)`, marginBottom: 8 }}>
        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: '#fff' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
        </span>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 1240, opacity: l2, transform: `translateY(${(1 - l2) * 14}px)` }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: '#fff', letterSpacing: -1.4, lineHeight: 1.18 }}>
          Quote it. Share it. <span style={{ color: C.accent }}>Get paid.</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 44, transform: `scale(${interpolate(cta, [0, 1], [0.85, 1]) * pulse})`, opacity: interpolate(cta, [0, 1], [0, 1]) }}>
        <div style={{ background: C.accent, color: '#fff', fontSize: 24, fontWeight: 800, padding: '18px 38px', borderRadius: 14, boxShadow: '0 16px 46px rgba(232,168,56,0.5)' }}>Try the demo — no sign-up</div>
      </div>
      <div style={{ marginTop: 22, color: 'rgba(255,255,255,0.6)', fontSize: 19, fontWeight: 600, opacity: foot }}>
        Free to start · {BRAND.url}
      </div>
    </AbsoluteFill>
  );
};
