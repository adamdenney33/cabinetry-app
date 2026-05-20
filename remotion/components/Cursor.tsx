// Animated cursor overlay for the workflow video. Moves between two
// browser-content-space points and pulses on "click" frames.
//
// Coord system: (0, 0) is the TOP-LEFT of the BrowserFrame's content area
// (NOT the canvas). Cursor.tsx adds the BROWSER_FRAME offset internally —
// so scenes can think in app-screenshot coords without remembering the
// chrome geometry.

import { interpolate, Easing } from 'remotion';
import { BROWSER_FRAME } from './BrowserFrame';

export type CursorAnim = {
  /** Starting canvas-pixel position. */
  from: { x: number; y: number };
  /** Ending canvas-pixel position. */
  to: { x: number; y: number };
  /** Local frame at which the move starts. */
  startFrame: number;
  /** Local frame at which the cursor arrives. */
  endFrame: number;
  /** Optional list of frames where the cursor "clicks" (shows a ring pulse). */
  clickFrames?: number[];
};

export type CursorProps = {
  localFrame: number;
  /** If omitted, cursor stays at `idle`. */
  anim?: CursorAnim;
  /** Resting position when no anim provided. */
  idle?: { x: number; y: number };
  /** Hide the cursor entirely (e.g. on intro/outro cards). */
  hidden?: boolean;
};

const CURSOR_W = 32;
const CURSOR_H = 32;

export const Cursor: React.FC<CursorProps> = ({ localFrame, anim, idle, hidden }) => {
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

  // Translate content-area coords into canvas coords by adding the chrome offset.
  const cx = x + BROWSER_FRAME.contentX;
  const cy = y + BROWSER_FRAME.contentY;

  // Click pulse — for each click frame, render an expanding ring within ~12 frames.
  const PULSE = 12;
  const pulses = (anim?.clickFrames || []).map((cf) => {
    const dt = localFrame - cf;
    if (dt < 0 || dt > PULSE) return null;
    const progress = dt / PULSE;
    const size = 28 + progress * 70;
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
          border: `3px solid #e8a838`,
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
          left: cx - 4,
          top: cy - 2,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
        }}
      >
        {/* macOS-style arrow cursor */}
        <path d="M2,2 L2,18 L6,14 L9,21 L11,20 L8,13 L14,13 Z" fill="#ffffff" stroke="#000000" strokeWidth="1" />
      </svg>
    </div>
  );
};
