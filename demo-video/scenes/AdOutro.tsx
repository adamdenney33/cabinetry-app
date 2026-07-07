/**
 * AdOutro v2 — CTA. Copy verbatim from the landing page.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C, BRAND } from '../theme';
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
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: inOp }}>
      <AbsoluteFill style={{ background: `radial-gradient(46% 36% at 50% 46%, rgba(232,168,56,0.14) 0%, rgba(232,168,56,0) 70%)` }} />
      <div style={{ textAlign: 'center', maxWidth: 1300, opacity: l1, transform: `translateY(${(1 - l1) * 16}px)` }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: -1.1 }}>Eight tabs. One workshop.</div>
      </div>
      <div style={{ textAlign: 'center', maxWidth: 1340, marginTop: 14, opacity: l2, transform: `translateY(${(1 - l2) * 16}px)` }}>
        <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: -1.6, lineHeight: 1.15 }}>
          <span style={{ color: '#fff' }}>It's not just an app. It's your workshop's </span>
          <span style={{ color: C.accent }}>operating system.</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 46, transform: `scale(${interpolate(cta, [0, 1], [0.82, 1]) * pulse})`, opacity: interpolate(cta, [0, 1], [0, 1]) }}>
        <div style={{ background: C.accent, color: '#111', fontSize: 25, fontWeight: 800, padding: '18px 40px', borderRadius: 14, boxShadow: '0 16px 50px rgba(232,168,56,0.55), 0 0 90px rgba(232,168,56,0.25)' }}>Start free</div>
      </div>
      <div style={{ marginTop: 22, color: 'rgba(255,255,255,0.62)', fontSize: 19, fontWeight: 600, opacity: foot }}>
        No card needed · {BRAND.url}
      </div>
    </AbsoluteFill>
  );
};
