/**
 * SectionBreak — 3D interstitial: a large flat amber tab icon (no tile, no
 * outline) + white title/sub directly on the dark backdrop. The whole group
 * flies in from deep Z and settles.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C, TabId, PINSTRIPES, DISPLAY } from '../theme';
import { TabIcon } from '../icons';
import { EASE_OUT, clampOpts } from '../primitives';

export const SectionBreak: React.FC<{
  title: string;
  sub?: string;
  tab: TabId;
  dur: number;
}> = ({ title, sub, tab, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fly = spring({ frame: frame - 2, fps, config: { damping: 15, mass: 1.1, stiffness: 70 } });
  const ry = interpolate(fly, [0, 1], [55, 0]);
  const rx = interpolate(fly, [0, 1], [12, 0]);
  const tz = interpolate(fly, [0, 1], [-1600, 0]);
  const ttl = interpolate(frame, [16, 30], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const sb = interpolate(frame, [26, 40], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const drift = interpolate(frame, [30, dur], [0, -5], clampOpts);
  const out = interpolate(frame, [dur - 10, dur], [1, 0], clampOpts);

  return (
    <AbsoluteFill style={{ ...PINSTRIPES, backgroundPosition: `${(frame * 0.25) % 44}px 0px`, fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      <div style={{ perspective: 1400 }}>
        <div
          style={{
            transform: `translateZ(${tz}px) rotateY(${ry}deg) rotateX(${rx}deg) translateY(${drift}px)`,
            transformStyle: 'preserve-3d',
            display: 'flex',
            alignItems: 'center',
            gap: 56,
            opacity: interpolate(fly, [0, 0.25, 1], [0, 1, 1]),
          }}
        >
          <div style={{ color: C.accent, flexShrink: 0, display: 'flex' }}>
            <TabIcon tab={tab} size={190} strokeWidth={1.4} />
          </div>
          <div>
            <div style={{ ...DISPLAY, fontSize: 70, color: '#fff', maxWidth: 900, opacity: ttl, transform: `translateY(${(1 - ttl) * 16}px)` }}>{title}</div>
            {sub && <div style={{ fontSize: 26, fontWeight: 600, color: 'rgba(255,255,255,0.62)', marginTop: 18, maxWidth: 800, lineHeight: 1.4, opacity: sb, transform: `translateY(${(1 - sb) * 12}px)` }}>{sub}</div>}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
