/**
 * A macOS-style pointer that glides between keyframes and pulses a ring on click.
 * Coordinates are in AppWindow-local px (the window's logical WIN.width × WIN.height).
 * Render this as the last child of AppWindow so it sits above the content.
 */
import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';

export type CursorKey = { frame: number; x: number; y: number; click?: boolean };

const EASE = Easing.bezier(0.5, 0, 0.2, 1);

export const DemoCursor: React.FC<{ keys: CursorKey[] }> = ({ keys }) => {
  const frame = useCurrentFrame();
  if (keys.length === 0) return null;

  const frames = keys.map((k) => k.frame);
  const xs = keys.map((k) => k.x);
  const ys = keys.map((k) => k.y);

  const x = interpolate(frame, frames, xs, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });
  const y = interpolate(frame, frames, ys, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE });

  // Press dip — cursor shrinks slightly right around a click frame.
  let press = 1;
  let ripple: { age: number } | null = null;
  for (const k of keys) {
    if (k.click) {
      const d = frame - k.frame;
      if (d >= -4 && d <= 4) press = Math.min(press, interpolate(Math.abs(d), [0, 4], [0.82, 1], { extrapolateRight: 'clamp' }));
      if (d >= 0 && d <= 18) ripple = { age: d };
    }
  }

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 50 }}>
      {ripple && (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: y,
            width: 8,
            height: 8,
            borderRadius: '50%',
            transform: `translate(-50%, -50%) scale(${interpolate(ripple.age, [0, 18], [0.4, 4.2], { extrapolateRight: 'clamp' })})`,
            border: '2px solid rgba(232,168,56,0.9)',
            opacity: interpolate(ripple.age, [0, 18], [0.55, 0], { extrapolateRight: 'clamp' }),
          }}
        />
      )}
      <div style={{ position: 'absolute', left: x, top: y, transform: `scale(${press})`, transformOrigin: 'top left' }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}>
          <path d="M5 3l5 16 2.5-6.5L19 10 5 3z" fill="#ffffff" stroke="#1a1a1a" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
};
