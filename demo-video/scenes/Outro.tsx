import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { BACKDROP, FONT, C, BRAND } from '../theme';
import { TabIcon } from '../icons';
import { EASE_OUT, clampOpts } from '../primitives';

export const Outro: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inOp = interpolate(frame, [0, 14], [0, 1], clampOpts);
  const l1 = interpolate(frame, [10, 30], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const l2 = interpolate(frame, [24, 46], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const cta = spring({ frame: frame - 52, fps, config: { damping: 14, mass: 0.8, stiffness: 120 } });
  const brand = interpolate(frame, [40, 58], [0, 1], { ...clampOpts, easing: EASE_OUT });

  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: inOp }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: brand, marginBottom: 30 }}>
        <div style={{ width: 50, height: 50, borderRadius: 13, background: `linear-gradient(150deg, #f0b54a, ${C.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 28px rgba(232,168,56,0.4)' }}>
          <TabIcon tab="cabinet" size={30} color="#fff" strokeWidth={1.8} />
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: -0.8 }}>
          <span style={{ color: '#fff' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', maxWidth: 1180 }}>
        <div style={{ fontSize: 50, fontWeight: 800, color: '#fff', letterSpacing: -1, opacity: l1, transform: `translateY(${interpolate(l1, [0, 1], [14, 0])}px)` }}>
          It's not just an app.
        </div>
        <div style={{ fontSize: 50, fontWeight: 800, letterSpacing: -1, marginTop: 6, opacity: l2, transform: `translateY(${interpolate(l2, [0, 1], [14, 0])}px)` }}>
          <span style={{ color: '#fff' }}>It's your workshop's </span><span style={{ color: C.accent }}>operating system.</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 46, transform: `scale(${interpolate(cta, [0, 1], [0.85, 1])})`, opacity: interpolate(cta, [0, 1], [0, 1]) }}>
        <div style={{ background: C.accent, color: '#fff', fontSize: 23, fontWeight: 800, padding: '17px 34px', borderRadius: 13, boxShadow: '0 14px 40px rgba(232,168,56,0.5)' }}>Try the demo — no sign-up</div>
        <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: 19, fontWeight: 600 }}>Free to start · {BRAND.url}</div>
      </div>
    </AbsoluteFill>
  );
};
