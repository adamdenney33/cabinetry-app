// Scene 2 — Cabinet Builder, scrolling through every input.
// Uses the tall editor sidebar capture showing the full QUO-1042 / Base
// Cabinet 600 spec form: Cabinet, Doors, Drawer Fronts, Drawer Boxes,
// Shelves & Partitions, Extras, Notes.
//
// Scrolls smoothly from top to bottom so the viewer sees every section.

import { AbsoluteFill } from 'remotion';
import { BrowserFrame } from '../components/BrowserFrame';
import { Screen } from '../components/Screen';
import { Cursor } from '../components/Cursor';
import { Caption } from '../components/Caption';

export const SceneBuilder: React.FC<{ localFrame: number; durationFrames: number }> = ({
  localFrame,
  durationFrames,
}) => {
  return (
    <AbsoluteFill>
      <BrowserFrame>
        <Screen
          src="sidebar-editor.png"
          sourceW={880}
          sourceH={3950}
          localFrame={localFrame}
          durationFrames={durationFrames}
          fit="width"
          scrollFrom={0}
          scrollTo={1}
          scrollStart={14}
          scrollEnd={durationFrames - 10}
        />
      </BrowserFrame>
      <Cursor
        localFrame={localFrame}
        anim={{
          from: { x: 760, y: 220 },
          to: { x: 760, y: 620 },
          startFrame: 6,
          endFrame: durationFrames - 12,
        }}
      />
      <Caption text="The Cabinet Builder" localFrame={localFrame} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};
