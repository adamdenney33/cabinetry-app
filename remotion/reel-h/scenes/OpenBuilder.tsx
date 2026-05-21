// OpenBuilder (4s, 120 frames, 1920×1080). BrowserFrame snaps in showing
// the cabinet editor screenshot, cursor enters from outside-right, lands
// on a spec field, click pulse at the end of the entry.

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BrowserFrame, BROWSER_FRAME } from '../../components/BrowserFrame';
import { Screen } from '../../components/Screen';
import { Cursor } from '../../components/Cursor';
import { Caption } from '../../components/Caption';

export const OpenBuilder: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  // Springy entrance from below + slight scale up.
  const enter = spring({
    frame: localFrame,
    fps,
    config: { damping: 14, stiffness: 140, mass: 0.7 },
  });
  const frameY = (1 - enter) * 120;
  const frameScale = 0.95 + enter * 0.05;
  const frameOpacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${frameY}px) scale(${frameScale})`,
          transformOrigin: 'center 45%',
          opacity: frameOpacity,
        }}
      >
        <BrowserFrame>
          <Screen
            src="03d-cabinet-editor.png"
            sourceW={2560}
            sourceH={1800}
            localFrame={localFrame}
            durationFrames={durationFrames}
            fit="width"
          />
        </BrowserFrame>
      </div>

      <Caption
        text="Open the Cabinet Builder"
        localFrame={localFrame}
        durationFrames={durationFrames}
        fadeIn={24}
      />

      {/* Cursor enters from outside-right of the content area, lands on the
          form. Coords are inside the BrowserFrame content area (1480 × 876). */}
      <Cursor
        localFrame={localFrame}
        anim={{
          from: { x: BROWSER_FRAME.innerW + 80, y: 320 },
          to: { x: 940, y: 480 },
          startFrame: 36,
          endFrame: 84,
          clickFrames: [88],
        }}
      />
    </AbsoluteFill>
  );
};
