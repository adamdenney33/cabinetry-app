// Scene 3 — Specifying a cabinet. The editor screenshot already shows the
// cabinet fully spec'd (Base Cabinet 600 · 600×720×560), so the scene just
// parks the cursor on each spec field as the narrator names them: width →
// height → door count → carcass material → hardware.
//
// Cursor coords are in BrowserFrame content-area pixels (0..1480, 0..876).
// The dimensions row sits at y ≈ 200, doors at y ≈ 670, carcass material at
// y ≈ 282 — measured against the same 03d render the FieldOverlay scene was
// using, but now without any overlay layer.

import { AbsoluteFill } from 'remotion';
import { BrowserFrame } from '../components/BrowserFrame';
import { Screen } from '../components/Screen';
import { Cursor } from '../components/Cursor';
import { Caption } from '../components/Caption';

export const SceneSpec: React.FC<{ localFrame: number; durationFrames: number }> = ({
  localFrame,
  durationFrames,
}) => {
  // Five cursor beats sync'd to the narration's comma-separated list:
  //   "Width, height, door count, carcass material, hardware."
  const beat = (pct: number) => Math.round(durationFrames * pct);
  const b1 = beat(0.12);   // Width
  const b2 = beat(0.30);   // Height
  const b3 = beat(0.48);   // Door count
  const b4 = beat(0.66);   // Carcass material
  const b5 = beat(0.82);   // Hardware

  return (
    <AbsoluteFill>
      <BrowserFrame>
        <Screen
          src="03d-cabinet-editor.png"
          sourceW={2560}
          sourceH={1800}
          localFrame={localFrame}
          durationFrames={durationFrames}
        />
      </BrowserFrame>
      <Cursor
        localFrame={localFrame}
        anim={{
          // From width field down through to the hardware row
          from: { x: 110, y: 210 },
          to: { x: 130, y: 720 },
          startFrame: b1,
          endFrame: b5 + 8,
          clickFrames: [b1, b2, b3, b4, b5],
        }}
      />
      <Caption text="Each field re-prices live" localFrame={localFrame} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};
