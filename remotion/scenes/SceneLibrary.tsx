// Scene 4 — Cabinet Library inside the browser frame. Static view, cursor
// clicks the "Add to Quote" buttons on two templates to suggest reuse.

import { AbsoluteFill } from 'remotion';
import { BrowserFrame } from '../components/BrowserFrame';
import { Screen } from '../components/Screen';
import { Cursor } from '../components/Cursor';
import { Caption } from '../components/Caption';

export const SceneLibrary: React.FC<{ localFrame: number; durationFrames: number }> = ({
  localFrame,
  durationFrames,
}) => {
  return (
    <AbsoluteFill>
      <BrowserFrame>
        <Screen
          src="03b-cabinet-library.png"
          sourceW={2560}
          sourceH={1800}
          localFrame={localFrame}
          durationFrames={durationFrames}
          fadeOut={6}
        />
      </BrowserFrame>
      <Cursor
        localFrame={localFrame}
        anim={{
          // "Add to Quote" buttons sit on the right side of each template card
          from: { x: 950, y: 200 },
          to: { x: 950, y: 440 },
          startFrame: 4,
          endFrame: 18,
          clickFrames: [12, Math.round(durationFrames * 0.55)],
        }}
      />
      <Caption text="The Cabinet Library" localFrame={localFrame} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};
