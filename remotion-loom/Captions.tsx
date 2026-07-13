// Subtitle overlay. Cues are timed in SOURCE-LOOM seconds; we map them onto the
// composition timeline by dividing by `speed` (so sped-up cuts keep captions in
// sync with the faster footage).
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { CUES } from './cues';
import { C } from '../remotion-ig/theme';

export const Captions: React.FC<{
  speed: number;
  scale?: number;
  maxWidth: number;
  bottom?: number;
}> = ({ speed, scale = 1, maxWidth, bottom = 50 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * speed; // current position in source-loom seconds

  const active = CUES.find((c) => t >= c.s && t < c.e);
  if (!active) return null;

  // gentle fade in/out at the edges of each cue (in source seconds)
  const fade = 0.12 * speed;
  const opacity = interpolate(
    t,
    [active.s, active.s + fade, active.e - fade, active.e],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        opacity,
      }}
    >
      <span
        style={{
          maxWidth,
          textAlign: 'center',
          fontSize: 38 * scale,
          fontWeight: 700,
          lineHeight: 1.32,
          color: '#fff',
          padding: `${14 * scale}px ${26 * scale}px`,
          borderRadius: 16 * scale,
          background: 'rgba(17,17,17,0.78)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.32)',
          borderBottom: `${3 * scale}px solid ${C.accent}`,
          textWrap: 'balance',
        }}
      >
        {active.t}
      </span>
    </div>
  );
};
