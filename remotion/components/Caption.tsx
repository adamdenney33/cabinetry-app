// Small caption pill that appears in the bottom-left to label the current
// workflow step. Optional — disabled if `text` is empty. Fades in/out so it
// doesn't read as a hard cut against the screenshot underneath.

import { interpolate } from 'remotion';
import { BRAND } from '../scenes';

export type CaptionProps = {
  text: string;
  localFrame: number;
  durationFrames: number;
  /** Frames to fade in at start of scene. */
  fadeIn?: number;
  /** Frames to fade out before scene end. */
  fadeOut?: number;
};

export const Caption: React.FC<CaptionProps> = ({
  text,
  localFrame,
  durationFrames,
  fadeIn = 12,
  fadeOut = 12,
}) => {
  if (!text) return null;
  let opacity = 1;
  if (localFrame < fadeIn) {
    opacity = interpolate(localFrame, [0, fadeIn], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  } else if (localFrame > durationFrames - fadeOut) {
    opacity = interpolate(localFrame, [durationFrames - fadeOut, durationFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }
  // Bottom-center, above the nav-tab bar. Screenshots all show a generous
  // amount of body-bg below the actual content, so a pill there overlaps
  // chrome rather than data. Centered horizontally so it never lands on the
  // sidebar regardless of which scene's zoom focal point is active.
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 40,
        transform: 'translateX(-50%)',
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: 'rgba(17,17,17,0.92)',
        color: BRAND.paper,
        padding: '14px 24px',
        borderRadius: 999,
        fontFamily: 'system-ui, -apple-system, "SF Pro Text", sans-serif',
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: 0.2,
        boxShadow: '0 10px 32px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: BRAND.accent,
          boxShadow: `0 0 12px ${BRAND.accent}`,
        }}
      />
      {text}
    </div>
  );
};
