// Opening card — dark brand-ink background with the wordmark and tagline.
// Wordmark "ProCabinet.App" — the .App suffix takes the amber accent on dark,
// per marketing/README.md's brand essentials.

import { AbsoluteFill, interpolate, Easing, spring } from 'remotion';
import { BRAND } from '.';

export const Intro: React.FC<{ localFrame: number; durationFrames: number; fps: number }> = ({
  localFrame,
  durationFrames,
  fps,
}) => {
  // 1s intro: lands on wordmark within ~10 frames, holds for ~15, cuts hard.
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 11, stiffness: 180, mass: 0.5 },
  });
  const subY = interpolate(localFrame, [4, 14], [10, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.2, 0.8, 0.2, 1),
  });
  const subOpacity = interpolate(localFrame, [4, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // No fade-out — the cut to scene 1 is hard, matches the explanatory feel.
  const outOpacity = 1;

  return (
    <AbsoluteFill
      style={{
        background: BRAND.ink,
        opacity: outOpacity,
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
      }}
    >
      <div
        style={{
          transform: `scale(${0.94 + enter * 0.06}) translateY(${(1 - enter) * 12}px)`,
          opacity: enter,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 108, fontWeight: 800, letterSpacing: -2, color: BRAND.paper }}>
          ProCabinet<span style={{ color: BRAND.accent }}>.App</span>
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 28,
            fontWeight: 500,
            color: '#bdbdbd',
            letterSpacing: 1,
            opacity: subOpacity,
            transform: `translateY(${subY}px)`,
          }}
        >
          Quote a cabinet in under a minute
        </div>
      </div>
    </AbsoluteFill>
  );
};
