// Closing card — wordmark with the workshop-OS tagline + URL. Holds for
// ~3s to give viewers time to read and visit the site.

import { AbsoluteFill, interpolate, Easing, spring } from 'remotion';
import { BRAND } from '.';

export const Outro: React.FC<{ localFrame: number; durationFrames: number; fps: number }> = ({
  localFrame,
  durationFrames,
  fps,
}) => {
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 11, stiffness: 180, mass: 0.5 },
  });
  const urlOpacity = interpolate(localFrame, [6, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.2, 0.8, 0.2, 1),
  });
  const fadeOut = interpolate(
    localFrame,
    [durationFrames - 6, durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        opacity: fadeOut,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
      }}
    >
      <div
        style={{
          opacity: enter,
          transform: `translateY(${(1 - enter) * 16}px)`,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2, color: BRAND.paper }}>
          ProCabinet<span style={{ color: BRAND.accent }}>.App</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 26, fontWeight: 500, color: '#bdbdbd' }}>
          Workshop OS for cabinetmakers
        </div>
        <div
          style={{
            marginTop: 36,
            opacity: urlOpacity,
            fontSize: 30,
            fontWeight: 600,
            color: BRAND.accent,
            letterSpacing: 0.5,
          }}
        >
          procabinet.app
        </div>
      </div>
    </AbsoluteFill>
  );
};
