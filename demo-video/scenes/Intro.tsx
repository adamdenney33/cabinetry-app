import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { BACKDROP, FONT, C, BRAND, TABS } from '../theme';
import { TabIcon } from '../icons';
import { EASE_OUT, clampOpts } from '../primitives';

export const Intro: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const tile = spring({ frame: frame - 4, fps, config: { damping: 13, mass: 0.8, stiffness: 120 } });
  const word = interpolate(frame, [14, 32], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const tag = interpolate(frame, [30, 48], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const sub = interpolate(frame, [58, 76], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const drift = interpolate(frame, [0, dur], [1, 1.05], clampOpts);
  const out = interpolate(frame, [dur - 16, dur], [1, 0], clampOpts);

  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <div style={{ transform: `scale(${drift})`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ opacity: interpolate(tile, [0, 1], [0, 1]), transform: `scale(${interpolate(tile, [0, 1], [0.86, 1])})` }}>
          <div style={{ fontSize: 92, fontWeight: 800, letterSpacing: -2.5, lineHeight: 1, opacity: word }}>
            <span style={{ color: '#fff' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
          </div>
        </div>

        <div style={{ fontSize: 31, color: 'rgba(255,255,255,0.82)', fontWeight: 500, marginTop: 26, opacity: tag, transform: `translateY(${interpolate(tag, [0, 1], [12, 0])}px)` }}>
          {BRAND.tagline}
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 40 }}>
          {TABS.map((t, i) => {
            const a = interpolate(frame, [44 + i * 4, 60 + i * 4], [0, 1], { ...clampOpts, easing: EASE_OUT });
            return (
              <div key={t.id} style={{ width: 58, height: 58, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)', opacity: a, transform: `translateY(${interpolate(a, [0, 1], [16, 0])}px)` }}>
                <TabIcon tab={t.id} size={26} strokeWidth={1.8} />
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 3, marginTop: 34, textTransform: 'uppercase', opacity: sub }}>
          Quote · Cut · Schedule · Bill
        </div>
      </div>
    </AbsoluteFill>
  );
};
