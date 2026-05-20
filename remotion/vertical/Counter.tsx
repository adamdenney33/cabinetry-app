// Animated currency counter — $0 → $1,247 (or whatever target) with smooth
// easing. Used in the LivePrice scene to make the price tick feel earned.

import { interpolate, Easing } from 'remotion';

export type CounterProps = {
  localFrame: number;
  /** Frame at which the count begins. */
  startFrame: number;
  /** Frame at which the count lands on `to`. */
  endFrame: number;
  from: number;
  to: number;
  /** Currency prefix (default '$'). */
  prefix?: string;
  /** Style overrides. */
  style?: React.CSSProperties;
};

export const Counter: React.FC<CounterProps> = ({
  localFrame,
  startFrame,
  endFrame,
  from,
  to,
  prefix = '$',
  style,
}) => {
  const t = interpolate(localFrame, [startFrame, endFrame], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1), // out-expo-ish for a satisfying settle
  });
  const value = Math.round(from + (to - from) * t);
  const formatted = value.toLocaleString('en-GB');

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {formatted}
    </span>
  );
};
