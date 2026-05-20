// Screenshot frame — renders the app screenshot inside the BrowserFrame's
// content area (1480×876). Two modes:
//   - Static (the default): the screenshot is fit to the content area and
//     held still — used by Scenes 2 / 3 / 4 for "explanatory product tour"
//     feel.
//   - Scrollable: pass `scrollFrom`/`scrollTo` (in normalised 0..1 of the
//     source image height) plus a duration window to animate a vertical
//     translate of a TALL source image — used to scroll through the sidebar
//     screenshots.

import { Img, staticFile, interpolate, Easing } from 'remotion';
import { BROWSER_FRAME } from './BrowserFrame';

const CONTENT_W = BROWSER_FRAME.innerW;     // 1480
const CONTENT_H = BROWSER_FRAME.innerH;     // 876

export type ScreenProps = {
  /** Filename under public/screenshots/. */
  src: string;
  /** Source image's intrinsic width (before retina scaling). */
  sourceW: number;
  /** Source image's intrinsic height (before retina scaling). */
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

export const Screen: React.FC<ScreenProps> = ({
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

  // Compute rendered size + base offset to center it inside the content area
  let renderedW: number, renderedH: number;
  if (effectiveFit === 'width') {
    renderedW = CONTENT_W;
    renderedH = (sourceH / sourceW) * CONTENT_W;
  } else {
    renderedH = CONTENT_H;
    renderedW = (sourceW / sourceH) * CONTENT_H;
  }
  const baseX = (CONTENT_W - renderedW) / 2;
  // If the image fits (height ≤ content area), centre it vertically. If it
  // overflows (tall scrollable sidebar), anchor to the top so the scroll
  // animation can sweep down through it cleanly.
  const overflowH = Math.max(0, renderedH - CONTENT_H);
  const baseY = overflowH > 0 ? 0 : (CONTENT_H - renderedH) / 2;

  // Scroll: animate translateY between scrollFrom and scrollTo (0..1).
  let scrollY = 0;
  const doScroll = scrollFrom !== undefined && scrollTo !== undefined;
  if (doScroll) {
    const s0 = scrollStart ?? 0;
    const s1 = scrollEnd ?? durationFrames;
    const t = interpolate(localFrame, [s0, s1], [scrollFrom!, scrollTo!], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    // t=0 shows the top of the image, t=1 shows the bottom.
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
