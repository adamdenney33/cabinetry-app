// Scene 1 — My Rates panel, scrolling through every input.
// Uses the tall capture (sidebar-rates.png · 880×4900 px = 440×2450 logical)
// rendered fit-to-width inside the BrowserFrame. The image's vertical
// overflow is animated by Screen.tsx's scrollFrom→scrollTo props so the
// viewer sees Core Rates → Carcass → Door → Drawer Front → Drawer Box →
// Other Labour Times → Base.
//
// Cursor stays near the centre of the sidebar to look like the user is
// hovering as they scroll.

import { AbsoluteFill } from 'remotion';
import { BrowserFrame } from '../components/BrowserFrame';
import { Screen } from '../components/Screen';
import { Cursor } from '../components/Cursor';
import { Caption } from '../components/Caption';

export const SceneRates: React.FC<{ localFrame: number; durationFrames: number }> = ({
  localFrame,
  durationFrames,
}) => {
  return (
    <AbsoluteFill>
      <BrowserFrame>
        <Screen
          src="sidebar-rates.png"
          sourceW={880}
          sourceH={3900}
          localFrame={localFrame}
          durationFrames={durationFrames}
          // Tall image — fit-to-width fills the content area horizontally
          // and produces a scrollable overflow vertically.
          fit="width"
          scrollFrom={0}
          scrollTo={1}
          scrollStart={16}
          scrollEnd={durationFrames - 12}
        />
      </BrowserFrame>
      <Cursor
        localFrame={localFrame}
        anim={{
          // Cursor drifts down the sidebar as the content scrolls. Coords are
          // content-area pixels (0..1480, 0..876).
          from: { x: 760, y: 200 },
          to: { x: 760, y: 600 },
          startFrame: 6,
          endFrame: durationFrames - 12,
        }}
      />
      <Caption text="The Rates Panel" localFrame={localFrame} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};
