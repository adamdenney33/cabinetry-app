// Close (3s, 90 frames, 1920×1080). Dark brand-ink card with the wordmark,
// tagline, URL pill, and a soft amber halo behind the wordmark. Horizontal
// layout — tagline sits on a single line under the wordmark.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
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
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '46%',
          transform: 'translate(-50%, -50%)',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: BRAND.accent,
          filter: 'blur(160px)',
          opacity: glowOpacity * 0.4,
        }}
      />

      <div style={{ textAlign: 'center', padding: '0 80px', position: 'relative' }}>
        <div
          style={{
            fontSize: 160,
            fontWeight: 800,
            letterSpacing: -4,
            color: BRAND.paper,
            opacity: logoEnter,
            transform: `scale(${0.92 + logoEnter * 0.08})`,
          }}
        >
          ProCabinet<span style={{ color: BRAND.accent }}>.App</span>
        </div>

        <div
          style={{
            marginTop: 36,
            fontSize: 48,
            fontWeight: 600,
            lineHeight: 1.2,
            color: '#e4e4e4',
            opacity: taglineOpacity,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          Quote, cut, schedule and bill from one place.
        </div>

        <div
          style={{
            marginTop: 48,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '20px 40px',
            borderRadius: 999,
            background: BRAND.accent,
            color: '#111',
            fontSize: 36,
            fontWeight: 700,
            letterSpacing: 0.4,
            opacity: urlOpacity,
            boxShadow: `0 18px 48px ${BRAND.accent}55`,
          }}
        >
          procabinet.app
        </div>
      </div>
    </AbsoluteFill>
  );
};
