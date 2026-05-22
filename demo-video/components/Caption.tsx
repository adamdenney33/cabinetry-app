/**
 * Lower-third caption in the founder's voice. Floats over the app with a soft scrim.
 */
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { C, FONT } from '../theme';
import { EASE_OUT, clampOpts } from '../primitives';

export const Caption: React.FC<{
  text: React.ReactNode;
  delay?: number;
  dur: number; // scene duration in frames, for the fade-out
  align?: 'center' | 'left';
}> = ({ text, delay = 8, dur, align = 'center' }) => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [delay, delay + 14], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const outT = interpolate(frame, [dur - 14, dur - 2], [1, 0], clampOpts);
  const op = Math.min(inT, outT);
  const rise = (1 - inT) * 16;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 58,
        display: 'flex',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        paddingLeft: align === 'left' ? 130 : 0,
        opacity: op,
        transform: `translateY(${rise}px)`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          maxWidth: 1340,
          background: 'rgba(14,14,16,0.74)',
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 16,
          padding: '15px 30px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent, flexShrink: 0, boxShadow: `0 0 14px ${C.accent}` }} />
        <span style={{ color: '#fff', fontSize: 29, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.32, textAlign: align === 'center' ? 'center' : 'left' }}>{text}</span>
      </div>
    </div>
  );
};
