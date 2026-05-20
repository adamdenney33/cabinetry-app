// Screen.tsx ported to PhoneFrame dimensions. Identical scroll/fit logic,
// just bound to PHONE_FRAME.innerW/H instead of BROWSER_FRAME's. Renders
// app screenshots inside the vertical chrome's content area (920 × 1444).

import { Img, staticFile, interpolate } from 'remotion';
import { PHONE_FRAME } from './constants';

const CONTENT_W = PHONE_FRAME.innerW;     // 920
const CONTENT_H = PHONE_FRAME.innerH;     // 1444

export type VerticalScreenProps = {
  /** Filename under public/screenshots/. */
  src: string;
  /** Source image's intrinsic width (px). */
  sourceW: number;
  /** Source image's intrinsic height (px). */
  sourceH: number;
  localFrame: number;
  durationFrames: number;
  fadeIn?: number;
  fadeOut?: number;
  /** If both provided, animate vertical scroll of a tall image. Values are
   *  normalised 0..1 — 0 = top of image, 1 = bottom. The animation runs from
   *  `scrollStart` to `scrollEnd` frames (defaults: 0 → durationFrames). */
  scrollFrom?: number;
  scrollTo?: number;
  scrollStart?: number;
  scrollEnd?: number;
  /** Override the fit mode. 'width' = fit-to-width (default for tall scrolls);
   *  'height' = fit-to-height (default for normal-aspect screenshots). */
  fit?: 'width' | 'height';
};

export const VerticalScreen: React.FC<VerticalScreenProps> = ({
  src,
  sourceW,
  sourceH,
  localFrame,
  durationFrames,
  fadeIn = 0,
  fadeOut = 0,
  scrollFrom,
  scrollTo,
  scrollStart,
  scrollEnd,
  fit,
}) => {
  const isTall = sourceH / sourceW > CONTENT_H / CONTENT_W;
  const effectiveFit = fit ?? (isTall ? 'width' : 'height');

  let renderedW: number, renderedH: number;
  if (effectiveFit === 'width') {
    renderedW = CONTENT_W;
    renderedH = (sourceH / sourceW) * CONTENT_W;
  } else {
    renderedH = CONTENT_H;
    renderedW = (sourceW / sourceH) * CONTENT_H;
  }
  const baseX = (CONTENT_W - renderedW) / 2;
  const overflowH = Math.max(0, renderedH - CONTENT_H);
  const baseY = overflowH > 0 ? 0 : (CONTENT_H - renderedH) / 2;

  let scrollY = 0;
  const doScroll = scrollFrom !== undefined && scrollTo !== undefined;
  if (doScroll) {
    const s0 = scrollStart ?? 0;
    const s1 = scrollEnd ?? durationFrames;
    const t = interpolate(localFrame, [s0, s1], [scrollFrom!, scrollTo!], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    scrollY = -overflowH * t;
  }

  let opacity = 1;
  if (fadeIn > 0 && localFrame < fadeIn) {
    opacity *= interpolate(localFrame, [0, fadeIn], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }
  if (fadeOut > 0 && localFrame > durationFrames - fadeOut) {
    opacity *= interpolate(localFrame, [durationFrames - fadeOut, durationFrames], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: CONTENT_W,
        height: CONTENT_H,
        overflow: 'hidden',
        background: '#f6f6f6',
        opacity,
      }}
    >
      <Img
        src={staticFile('screenshots/' + src)}
        style={{
          position: 'absolute',
          left: baseX,
          top: baseY + scrollY,
          width: renderedW,
          height: renderedH,
        }}
      />
    </div>
  );
};
