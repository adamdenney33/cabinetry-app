// LivePrice (5s, 150 frames, 1920×1080). Synthesised dark card with a
// large headline, a counter that ticks $0 → $1,247 inside an amber-bordered
// price chip, and a subtitle that fades in last. Wider layout than vertical
// — chip sits to the right of the headline at desktop scale.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BRAND } from '../constants';
import { Counter } from '../../vertical/Counter';

export const LivePrice: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();
  void durationFrames;

  const headlineEnter = spring({
    frame: localFrame,
    fps,
    config: { damping: 13, stiffness: 180, mass: 0.55 },
  });
  const chipEnter = spring({
    frame: Math.max(0, localFrame - 14),
    fps,
    config: { damping: 12, stiffness: 160, mass: 0.5 },
  });
  const subOpacity = interpolate(localFrame, [80, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
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
      {/* Two-column-ish: headline + subtitle on the left, chip on the right. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 100,
          padding: '0 120px',
          maxWidth: 1760,
        }}
      >
        <div style={{ flex: '1 1 auto', textAlign: 'left' }}>
          <div
            style={{
              fontSize: 96,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1.04,
              opacity: headlineEnter,
              transform: `translateY(${(1 - headlineEnter) * 12}px)`,
            }}
          >
            Priced from
            <br />
            your rates.
          </div>
          <div
            style={{
              marginTop: 36,
              fontSize: 40,
              fontWeight: 500,
              letterSpacing: 0.2,
              color: '#cfcfcf',
              opacity: subOpacity,
              maxWidth: 760,
            }}
          >
            Change a rate, every quote re-prices.
          </div>
        </div>

        {/* Price chip */}
        <div
          style={{
            position: 'relative',
            transform: `scale(${0.85 + chipEnter * 0.15})`,
            opacity: chipEnter,
            flex: '0 0 auto',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: -44,
              borderRadius: 36,
              background: BRAND.accent,
              filter: 'blur(70px)',
              opacity: glowOpacity * 0.5,
            }}
          />
          <div
            style={{
              position: 'relative',
              padding: '60px 96px',
              borderRadius: 32,
              background: '#1a1a1a',
              border: `4px solid ${BRAND.accent}`,
              boxShadow: `0 36px 96px rgba(0,0,0,0.6), 0 0 48px ${BRAND.accent}33`,
              fontSize: 200,
              fontWeight: 800,
              letterSpacing: -5,
              color: BRAND.accent,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 600,
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
      </div>
    </AbsoluteFill>
  );
};
