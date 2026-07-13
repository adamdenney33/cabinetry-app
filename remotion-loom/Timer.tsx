// Digital stopwatch, top-left. Shows REAL elapsed loom time regardless of the
// composition's playback speed: realSeconds = (frame / fps) * speed. So on the
// sped-up IG cuts the readout still climbs to ~3:15, keeping the
// "under three minutes" claim honest.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { C } from '../remotion-ig/theme';

const numeric = { fontVariantNumeric: 'tabular-nums' } as const;

export const Timer: React.FC<{ speed: number; scale?: number }> = ({ speed, scale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const real = (frame / fps) * speed;
  const mm = Math.floor(real / 60);
  const ss = Math.floor(real % 60);
  const cs = Math.floor((real * 100) % 100); // hundredths — sells "ticking fast"
  const label = `${mm}:${String(ss).padStart(2, '0')}`;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 18 * scale,
        padding: `${16 * scale}px ${24 * scale}px`,
        borderRadius: 18 * scale,
        background: 'rgba(17,17,17,0.82)',
        border: `${2 * scale}px solid ${C.accent}`,
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* pulsing dot */}
      <div
        style={{
          width: 14 * scale,
          height: 14 * scale,
          borderRadius: '50%',
          background: C.accent,
          opacity: frame % fps < fps / 2 ? 1 : 0.35,
          boxShadow: `0 0 ${12 * scale}px ${C.accent}`,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
        <span
          style={{
            fontSize: 13 * scale,
            fontWeight: 700,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.62)',
            marginBottom: 6 * scale,
          }}
        >
          Quote build time
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', color: '#fff', ...numeric }}>
          <span style={{ fontSize: 54 * scale, fontWeight: 900, letterSpacing: -1 }}>{label}</span>
          <span style={{ fontSize: 26 * scale, fontWeight: 700, color: C.accent, marginLeft: 4 * scale }}>
            .{String(cs).padStart(2, '0')}
          </span>
        </span>
      </div>
    </div>
  );
};
