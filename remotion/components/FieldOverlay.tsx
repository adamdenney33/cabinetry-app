// Animated typing/dropdown overlay positioned over a single field in the
// underlying screenshot. Use a sequence of these on top of an
// already-populated screenshot to simulate a user filling in the form:
//
//   1. The overlay starts opaque, masking the final value
//   2. After `startFrame`, characters of `value` are revealed one at a time
//   3. After `revealFrame`, the mask fades, exposing the real underlying
//      screenshot value
//
// Coordinates are content-area pixels (matches Cursor.tsx convention).

import { interpolate } from 'remotion';
import { BROWSER_FRAME } from './BrowserFrame';
import { BRAND } from '../scenes';

export type FieldOverlayProps = {
  /** Top-left of the field on the screenshot (content-area pixels). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text to "type". Each character appears one frame at a time after startFrame. */
  value: string;
  /** Frame at which typing begins (local to the scene). */
  startFrame: number;
  /** Frames per character. Default 2 → fast but legible. */
  cps?: number;
  /** Frame at which the mask fully fades to reveal the underlying value.
   *  Defaults to startFrame + value.length * cps + 6. */
  revealFrame?: number;
  /** Current frame for animation. */
  localFrame: number;
  /** Optional caret indicator at the typing position. */
  showCaret?: boolean;
  /** Font size in px. Default tuned for the dimension fields (24px). */
  fontSize?: number;
  /** Text alignment. Default 'left'. */
  align?: 'left' | 'center' | 'right';
};

export const FieldOverlay: React.FC<FieldOverlayProps> = ({
  x,
  y,
  width,
  height,
  value,
  startFrame,
  cps = 2,
  revealFrame,
  localFrame,
  showCaret = true,
  fontSize = 22,
  align = 'left',
}) => {
  const reveal = revealFrame ?? startFrame + value.length * cps + 6;
  // If the scene hasn't started typing yet, hold the blank mask
  if (localFrame < startFrame) {
    return (
      <Mask
        x={x}
        y={y}
        width={width}
        height={height}
        opacity={1}
        text=""
        showCaret={false}
        fontSize={fontSize}
        align={align}
      />
    );
  }
  // Typing progress
  const charsShown = Math.min(value.length, Math.floor((localFrame - startFrame) / cps));
  const typed = value.slice(0, charsShown);
  // Mask opacity — fades after revealFrame
  const opacity = interpolate(localFrame, [reveal, reveal + 8], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <Mask
      x={x}
      y={y}
      width={width}
      height={height}
      opacity={opacity}
      text={typed}
      showCaret={showCaret && charsShown < value.length}
      fontSize={fontSize}
      align={align}
    />
  );
};

type MaskProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  text: string;
  showCaret: boolean;
  fontSize: number;
  align: 'left' | 'center' | 'right';
};

const Mask: React.FC<MaskProps> = ({ x, y, width, height, opacity, text, showCaret, fontSize, align }) => {
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x + BROWSER_FRAME.contentX,
        top: y + BROWSER_FRAME.contentY,
        width,
        height,
        opacity,
        // Match the app's input chrome — light grey field with subtle border
        background: '#fafafa',
        border: '1px solid #e0e0e0',
        borderRadius: 6,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        paddingLeft: align === 'left' ? 10 : 0,
        paddingRight: align === 'right' ? 10 : 0,
        color: BRAND.ink,
        fontFamily: 'system-ui, -apple-system, "SF Pro Text", sans-serif',
        fontSize,
        fontWeight: 500,
        letterSpacing: 0.2,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{text}</span>
      {showCaret && (
        <span
          style={{
            display: 'inline-block',
            width: 2,
            height: fontSize * 0.95,
            background: BRAND.ink,
            marginLeft: 2,
            animation: 'none',
            // A static caret reads as "actively typing" — no blink needed in a
            // 30fps render where individual blink frames would be jarring.
          }}
        />
      )}
    </div>
  );
};
