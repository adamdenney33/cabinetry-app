// Large-format caption for vertical scenes. Used for the hero line above
// the phone frame (eg. "Open the Cabinet Builder") and the section labels
// that ride the spec-form scroll. Two variants: 'hero' (above frame) and
// 'pill' (rounded chip below frame, like horizontal Caption).

import { interpolate } from 'remotion';
import { BRAND, PHONE_FRAME, REEL } from './constants';

export type BigCaptionProps = {
  text: string;
  localFrame: number;
  durationFrames: number;
  variant?: 'hero' | 'pill';
  fadeIn?: number;
  fadeOut?: number;
  /** Optional rise-in distance for hero variant. */
  riseFrom?: number;
};

export const BigCaption: React.FC<BigCaptionProps> = ({
  text,
  localFrame,
  durationFrames,
  variant = 'pill',
  fadeIn = 10,
  fadeOut = 12,
  riseFrom = 16,
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

  if (variant === 'hero') {
    const rise = interpolate(localFrame, [0, fadeIn], [riseFrom, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 80, // sits above the phone frame (which starts at y=200)
          textAlign: 'center',
          opacity,
          transform: `translateY(${rise}px)`,
          fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
          color: BRAND.paper,
          fontSize: 56,
          fontWeight: 800,
          letterSpacing: -1,
          textShadow: '0 4px 24px rgba(0,0,0,0.5)',
          padding: '0 40px',
        }}
      >
        {text}
      </div>
    );
  }

  // 'pill' — bottom-center, below the phone frame.
  // Phone frame bottom edge sits at offsetY + outerH = 200 + 1500 = 1700.
  // Reel height = 1920, so 220 of bottom space; pill goes ~80px below frame.
  const PILL_BOTTOM = REEL.height - 1700 - 100; // 120

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: PILL_BOTTOM,
        transform: 'translateX(-50%)',
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'rgba(17,17,17,0.92)',
        color: BRAND.paper,
        padding: '18px 32px',
        borderRadius: 999,
        fontFamily: 'system-ui, -apple-system, "SF Pro Text", sans-serif',
        fontSize: 32,
        fontWeight: 600,
        letterSpacing: 0.2,
        boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: BRAND.accent,
          boxShadow: `0 0 14px ${BRAND.accent}`,
        }}
      />
      {text}
    </div>
  );
};
