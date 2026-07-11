/**
 * SectionBreakPortrait — portrait variant of SectionBreak: icon STACKED above
 * the title/sub (centered), instead of side-by-side, so it reads cleanly on
 * a narrow 1080px frame. Same fly-in-from-deep-Z motion as the landscape cut.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C, TabId, PINSTRIPES, DISPLAY } from '../theme';
import { TabIcon } from '../icons';
import { EASE_OUT, clampOpts } from '../primitives';

export const SectionBreakPortrait: React.FC<{
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
            flexDirection: 'column',
            alignItems: 'center',
            gap: 34,
            opacity: interpolate(fly, [0, 0.25, 1], [0, 1, 1]),
            padding: '0 64px',
          }}
        >
          <div style={{ color: C.accent, flexShrink: 0, display: 'flex' }}>
            <TabIcon tab={tab} size={150} strokeWidth={1.4} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ ...DISPLAY, fontSize: 58, color: '#fff', opacity: ttl, transform: `translateY(${(1 - ttl) * 16}px)` }}>{title}</div>
            {sub && <div style={{ fontSize: 24, fontWeight: 600, color: 'rgba(255,255,255,0.62)', marginTop: 22, maxWidth: 760, lineHeight: 1.4, opacity: sb, transform: `translateY(${(1 - sb) * 12}px)` }}>{sub}</div>}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
