// Hook (3s, 90 frames, 1920×1080). Two-line dark title card with amber
// under-mark on the second line. Lays out horizontally — much wider canvas
// than the vertical equivalent, so type goes bigger and the under-mark
// stretches further.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BRAND } from '../constants';

export const Hook: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
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
  const underlineProgress = interpolate(localFrame, [30, 60], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Hold steady; hard cut at scene end (no fade).
  void durationFrames;

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          color: BRAND.paper,
          padding: '0 120px',
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -4,
            lineHeight: 1.02,
            opacity: line1Enter,
            transform: `translateY(${(1 - line1Enter) * 18}px)`,
          }}
        >
          Quote a cabinet
        </div>
        <div
          style={{
            position: 'relative',
            display: 'inline-block',
            marginTop: 12,
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: -4,
            lineHeight: 1.02,
            opacity: line2Opacity,
            transform: `translateY(${line2Y}px)`,
          }}
        >
          without spreadsheets.
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: -22,
              height: 12,
              borderRadius: 6,
              background: BRAND.accent,
              transformOrigin: 'left center',
              transform: `scaleX(${underlineProgress})`,
              boxShadow: `0 0 32px ${BRAND.accent}`,
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
