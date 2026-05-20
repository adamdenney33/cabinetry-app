// Scene 2 / Open Builder (0:03 → 0:07, 120 frames).
// Phone-frame springs in from below, showing the cabinet editor screenshot.
// Cursor enters from the right edge, lands on a spec field.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { PhoneFrame } from '../PhoneFrame';
import { VerticalScreen } from '../VerticalScreen';
import { VerticalCursor } from '../VerticalCursor';
import { BigCaption } from '../BigCaption';
import { PHONE_FRAME } from '../constants';

export const OpenBuilder: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  // Spring the whole frame in from below.
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.7 },
  });
  const frameY = (1 - enter) * 160;     // travel from +160px to 0
  const frameScale = 0.94 + enter * 0.06;
  const frameOpacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* Outer wrap so the phone-frame can be translated/scaled together. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          transform: `translateY(${frameY}px) scale(${frameScale})`,
          transformOrigin: 'center 35%',
          opacity: frameOpacity,
        }}
      >
        <PhoneFrame>
          <VerticalScreen
            src="03d-cabinet-editor.png"
            sourceW={2560}
            sourceH={1800}
            localFrame={localFrame}
            durationFrames={durationFrames}
            fit="width"
          />
        </PhoneFrame>
      </div>

      <BigCaption
        text="Open the Cabinet Builder"
        localFrame={localFrame}
        durationFrames={durationFrames}
        variant="hero"
        fadeIn={20}
      />

      <BigCaption
        text="The Cabinet Builder"
        localFrame={localFrame}
        durationFrames={durationFrames}
        variant="pill"
        fadeIn={28}
      />

      {/* Cursor: enters from outside-right of the content area, lands on the
          form. Content-area coords are 0..PHONE_FRAME.innerW / 0..innerH. */}
      <VerticalCursor
        localFrame={localFrame}
        anim={{
          from: { x: PHONE_FRAME.innerW + 60, y: 280 },
          to: { x: 600, y: 480 },
          startFrame: 35,
          endFrame: 80,
          clickFrames: [82],
        }}
      />
    </AbsoluteFill>
  );
};
