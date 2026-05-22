/**
 * Small animation primitives. All driven by useCurrentFrame()/interpolate — no CSS
 * transitions (forbidden in Remotion).
 */
import React from 'react';
import { useCurrentFrame, interpolate, Easing, spring, useVideoConfig } from 'remotion';

export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

export const clampOpts = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Fade + small rise in. `delay`/`dur` in frames, relative to the enclosing Sequence. */
export const Reveal: React.FC<{
  delay?: number;
  dur?: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, dur = 16, y = 10, children, style }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [delay, delay + dur], [0, 1], { ...clampOpts, easing: EASE_OUT });
  return (
    <div style={{ ...style, opacity: t, transform: `translateY(${(1 - t) * y}px)` }}>{children}</div>
  );
};

/** Spring pop-in for cards/badges. */
export const PopIn: React.FC<{
  delay?: number;
  from?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, from = 0.9, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.7, stiffness: 140 } });
  const scale = interpolate(s, [0, 1], [from, 1]);
  return <div style={{ ...style, opacity: interpolate(s, [0, 1], [0, 1]), transform: `scale(${scale})` }}>{children}</div>;
};

/** Typed-text effect. Returns the visible substring at the current frame. */
export const useTyping = (full: string, startFrame: number, cps = 26) => {
  const frame = useCurrentFrame();
  const chars = Math.max(0, Math.floor((frame - startFrame) * (cps / 30)));
  return full.slice(0, Math.min(full.length, chars));
};

/** Animated number that counts from `from` to `to` between startFrame and +dur. */
export const useCount = (from: number, to: number, startFrame: number, dur = 24) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [startFrame, startFrame + dur], [from, to], { ...clampOpts, easing: EASE_OUT });
};

/** A blinking caret. */
export const Caret: React.FC<{ color?: string }> = ({ color = '#111' }) => {
  const frame = useCurrentFrame();
  const on = Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={{ display: 'inline-block', width: 2, height: '1em', background: color, marginLeft: 1, opacity: on ? 0.9 : 0, transform: 'translateY(2px)' }} />
  );
};

export const fmtMoney = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');
