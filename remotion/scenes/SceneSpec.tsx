// Scene 3 — Specifying a cabinet, with animated typing into the dimension
// fields so the viewer can SEE the data being entered.
//
// Layering (bottom-up):
//   1. 03d-cabinet-editor.png — the populated final state
//   2. FieldOverlay components masking the populated values and revealing
//      typed characters one-by-one
//   3. Cursor parking on whichever field is currently being filled
//
// Field positions are in BrowserFrame content-area pixels (0..1480, 0..876).
// They were eyeballed against a 03d render at fit-to-height in the browser
// frame; tweak if the screenshot is recaptured at a different aspect.

import { AbsoluteFill } from 'remotion';
import { BrowserFrame } from '../components/BrowserFrame';
import { Screen } from '../components/Screen';
import { Cursor } from '../components/Cursor';
import { Caption } from '../components/Caption';
import { FieldOverlay } from '../components/FieldOverlay';

export const SceneSpec: React.FC<{ localFrame: number; durationFrames: number }> = ({
  localFrame,
  durationFrames,
}) => {
  // Five typing beats, scheduled across the scene duration. Each one types
  // for ~6 frames then holds, revealing the underlying value at +8 frames.
  const beat = (pct: number) => Math.round(durationFrames * pct);
  const b1 = beat(0.08);   // Width
  const b2 = beat(0.22);   // Height
  const b3 = beat(0.36);   // Depth
  const b4 = beat(0.54);   // Carcass material
  const b5 = beat(0.74);   // Doors count

  // Field geometry — these align with the 03d-cabinet-editor.png rendered
  // fit-to-height in a 1480×876 content area. Y values measured from the top
  // of the content area (i.e. just below the browser title bar).
  const dimsY = 192;
  const widthX = 60;
  const heightX = 170;
  const depthX = 280;
  const dimW = 96;
  const dimH = 36;
  const carcassY = 282;
  const doorsCountY = 670;

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
        {/* Width / Height / Depth — appear one after another */}
        <FieldOverlay
          x={widthX} y={dimsY} width={dimW} height={dimH}
          value="600"
          startFrame={b1}
          revealFrame={b1 + 14}
          localFrame={localFrame}
          fontSize={18}
        />
        <FieldOverlay
          x={heightX} y={dimsY} width={dimW} height={dimH}
          value="720"
          startFrame={b2}
          revealFrame={b2 + 14}
          localFrame={localFrame}
          fontSize={18}
        />
        <FieldOverlay
          x={depthX} y={dimsY} width={dimW} height={dimH}
          value="560"
          startFrame={b3}
          revealFrame={b3 + 14}
          localFrame={localFrame}
          fontSize={18}
        />
        {/* Carcass material dropdown — pretend a value gets selected */}
        <FieldOverlay
          x={18} y={carcassY} width={260} height={dimH}
          value="Birch Ply"
          startFrame={b4}
          revealFrame={b4 + 20}
          localFrame={localFrame}
          cps={3}
          fontSize={16}
        />
        {/* Doors count stepper — "2" appears */}
        <FieldOverlay
          x={70} y={doorsCountY} width={42} height={32}
          value="2"
          startFrame={b5}
          revealFrame={b5 + 12}
          localFrame={localFrame}
          align="center"
          fontSize={18}
          showCaret={false}
        />
      </BrowserFrame>
      <Cursor
        localFrame={localFrame}
        anim={{
          // Cursor parks on each field as it gets filled
          from: { x: widthX + dimW / 2, y: dimsY + dimH / 2 },
          to: { x: 92, y: doorsCountY + 16 },
          startFrame: b1,
          endFrame: b5 + 6,
          clickFrames: [b1, b2, b3, b4, b5],
        }}
      />
      <Caption text="Each field re-prices live" localFrame={localFrame} durationFrames={durationFrames} />
    </AbsoluteFill>
  );
};
