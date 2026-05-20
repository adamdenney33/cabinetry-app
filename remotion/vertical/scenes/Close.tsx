// Scene 6 / Close (0:27 → 0:30, 90 frames).
// Dark brand card with the logo, tagline, URL, and a soft amber glow.

import { AbsoluteFill, Img, interpolate, spring, staticFile, useVideoConfig } from 'remotion';
import { BRAND } from '../constants';

export const Close: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  const logoEnter = spring({
    frame: localFrame,
    fps,
    config: { damping: 13, stiffness: 180, mass: 0.55 },
  });
  const taglineOpacity = interpolate(localFrame, [16, 32], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const taglineY = interpolate(localFrame, [16, 32], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const urlOpacity = interpolate(localFrame, [40, 56], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Glow swells then steadies.
  const glowOpacity = interpolate(
    localFrame,
    [0, 36, durationFrames - 4],
    [0, 0.55, 0.55],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
        color: BRAND.paper,
      }}
    >
      {/* Amber halo */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '46%',
          transform: 'translate(-50%, -50%)',
          width: 760,
          height: 760,
          borderRadius: '50%',
          background: BRAND.accent,
          filter: 'blur(140px)',
          opacity: glowOpacity * 0.4,
        }}
      />

      <div
        style={{
          textAlign: 'center',
          padding: '0 80px',
          position: 'relative',
        }}
      >
        {/* Wordmark (text-rendered, ensures crisp at 4K). */}
        <div
          style={{
            fontSize: 124,
            fontWeight: 800,
            letterSpacing: -3,
            color: BRAND.paper,
            opacity: logoEnter,
            transform: `scale(${0.92 + logoEnter * 0.08})`,
          }}
        >
          ProCabinet<span style={{ color: BRAND.accent }}>.App</span>
        </div>

        <div
          style={{
            marginTop: 40,
            fontSize: 44,
            fontWeight: 600,
            lineHeight: 1.2,
            color: '#e4e4e4',
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          Quote, cut, schedule and bill
          <br />
          from one place.
        </div>

        <div
          style={{
            marginTop: 56,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 36px',
            borderRadius: 999,
            background: BRAND.accent,
            color: '#111',
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 0.4,
            opacity: urlOpacity,
            boxShadow: `0 14px 40px ${BRAND.accent}55`,
          }}
        >
          procabinet.app
        </div>
      </div>
    </AbsoluteFill>
  );
};
