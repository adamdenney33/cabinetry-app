// Scene 4 / Live Price (0:18 → 0:23, 150 frames).
// Synthesised UI card. Headline + ticking counter + subtitle. No screenshot
// — the price chip is bespoke, designed to read crisply at vertical scale.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BRAND } from '../constants';
import { Counter } from '../Counter';

export const LivePrice: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  // Headline pops in immediately.
  const headlineEnter = spring({
    frame: localFrame,
    fps,
    config: { damping: 13, stiffness: 180, mass: 0.55 },
  });

  // Price chip springs in slightly delayed.
  const chipEnter = spring({
    frame: Math.max(0, localFrame - 14),
    fps,
    config: { damping: 12, stiffness: 160, mass: 0.5 },
  });

  // Subtitle fades in last.
  const subOpacity = interpolate(localFrame, [80, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Soft pulsing glow on the price as the counter settles.
  const glowPulse = 0.5 + 0.5 * Math.sin((localFrame - 24) / 8);
  const glowOpacity = interpolate(localFrame, [24, 80], [0, glowPulse * 0.7], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
      <div style={{ textAlign: 'center', padding: '0 80px' }}>
        <div
          style={{
            fontSize: 76,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.05,
            opacity: headlineEnter,
            transform: `translateY(${(1 - headlineEnter) * 12}px)`,
          }}
        >
          Priced from your rates.
        </div>

        {/* Price chip — large amber-bordered card. */}
        <div
          style={{
            marginTop: 80,
            display: 'inline-block',
            position: 'relative',
            transform: `scale(${0.85 + chipEnter * 0.15})`,
            opacity: chipEnter,
          }}
        >
          {/* Glow halo behind */}
          <div
            style={{
              position: 'absolute',
              inset: -36,
              borderRadius: 36,
              background: BRAND.accent,
              filter: 'blur(60px)',
              opacity: glowOpacity * 0.45,
            }}
          />
          <div
            style={{
              position: 'relative',
              padding: '52px 88px',
              borderRadius: 28,
              background: '#1a1a1a',
              border: `3px solid ${BRAND.accent}`,
              boxShadow: `0 30px 80px rgba(0,0,0,0.6), 0 0 40px ${BRAND.accent}33`,
              fontSize: 180,
              fontWeight: 800,
              letterSpacing: -4,
              color: BRAND.accent,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 580,
              textAlign: 'center',
            }}
          >
            <Counter
              localFrame={localFrame}
              startFrame={24}
              endFrame={84}
              from={0}
              to={1247}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 56,
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: 0.2,
            color: '#cfcfcf',
            opacity: subOpacity,
          }}
        >
          Change a rate, every quote re-prices.
        </div>
      </div>
    </AbsoluteFill>
  );
};
