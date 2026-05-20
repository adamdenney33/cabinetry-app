// Cursor.tsx ported to the PhoneFrame coord system. Coords passed in are
// relative to the content area (top-left = 0,0); this component adds the
// PHONE_FRAME content offset internally so scene code stays clean.

import { interpolate, Easing } from 'remotion';
import { BRAND, PHONE_FRAME } from './constants';

export type CursorAnim = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  startFrame: number;
  endFrame: number;
  clickFrames?: number[];
};

export type VerticalCursorProps = {
  localFrame: number;
  anim?: CursorAnim;
  idle?: { x: number; y: number };
  hidden?: boolean;
};

const CURSOR_W = 40;
const CURSOR_H = 40;

export const VerticalCursor: React.FC<VerticalCursorProps> = ({
  localFrame,
  anim,
  idle,
  hidden,
}) => {
  if (hidden) return null;

  let x: number, y: number;
  if (anim) {
    const t = interpolate(localFrame, [anim.startFrame, anim.endFrame], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
    x = anim.from.x + (anim.to.x - anim.from.x) * t;
    y = anim.from.y + (anim.to.y - anim.from.y) * t;
  } else if (idle) {
    x = idle.x;
    y = idle.y;
  } else {
    return null;
  }

  const cx = x + PHONE_FRAME.contentX;
  const cy = y + PHONE_FRAME.contentY;

  const PULSE = 14;
  const pulses = (anim?.clickFrames || []).map((cf) => {
    const dt = localFrame - cf;
    if (dt < 0 || dt > PULSE) return null;
    const progress = dt / PULSE;
    const size = 36 + progress * 90;
    const opacity = 1 - progress;
    return (
      <div
        key={cf}
        style={{
          position: 'absolute',
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          border: `4px solid ${BRAND.accent}`,
          borderRadius: '50%',
          opacity,
          pointerEvents: 'none',
        }}
      />
    );
  });

  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }}>
      {pulses}
      <svg
        width={CURSOR_W}
        height={CURSOR_H}
        viewBox="0 0 24 24"
        style={{
          position: 'absolute',
          left: cx - 5,
          top: cy - 3,
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
        }}
      >
        <path d="M2,2 L2,18 L6,14 L9,21 L11,20 L8,13 L14,13 Z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
      </svg>
    </div>
  );
};
