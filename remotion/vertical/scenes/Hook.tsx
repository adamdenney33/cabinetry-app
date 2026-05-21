// Scene 1 / Hook (0:00 → 0:03, 90 frames).
// Dark brand-ink card with a two-line headline. The first line lands hard
// on frame 0 (already visible when the reel starts); the second line slides
// in on frame ~14 with the accent under-mark.
//
// Copy + accent color come in as props (see `../reel-content.ts` for the
// HookSchema and the default REEL_CONTENT.hook values). Background and text
// colors stay tied to BRAND constants — those are a brand-level decision,
// not a per-scene tweak.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BRAND } from '../constants';
import type { HookProps } from '../reel-content';

export const Hook: React.FC<HookProps & {
  localFrame: number;
  durationFrames: number;
}> = ({ line1, line2, accentColor, localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  const line1Enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.5 },
  });
  const line2Opacity = interpolate(localFrame, [14, 28], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const line2Y = interpolate(localFrame, [14, 28], [18, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Accent underline that draws across line 2 from frame 30 → 60.
  const underlineProgress = interpolate(localFrame, [30, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Hold steady through the rest of the scene; cut hard to scene 2.
  const exitOpacity = interpolate(
    localFrame,
    [durationFrames - 10, durationFrames],
    [1, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: exitOpacity,
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          color: BRAND.paper,
          padding: '0 80px',
        }}
      >
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: -3,
            lineHeight: 1.05,
            opacity: line1Enter,
            transform: `translateY(${(1 - line1Enter) * 14}px)`,
          }}
        >
          {line1}
        </div>
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            marginTop: 8,
            fontSize: 110,
            fontWeight: 800,
            letterSpacing: -3,
            lineHeight: 1.05,
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          {line2}
          {/* Accent under-mark — draws left to right. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: -16,
              height: 10,
              borderRadius: 5,
              background: accentColor,
              transformOrigin: 'left center',
              transform: `scaleX(${underlineProgress})`,
              boxShadow: `0 0 24px ${accentColor}`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
