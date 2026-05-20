// Scene 3 / Spec Scroll (0:07 → 0:18, 330 frames).
// Smooth top-to-bottom scroll of the sidebar-editor.png (880×3950), with
// four section captions riding along: Width → Doors → Drawers → Hardware.

import { AbsoluteFill } from 'remotion';
import { PhoneFrame } from '../PhoneFrame';
import { VerticalScreen } from '../VerticalScreen';
import { BigCaption } from '../BigCaption';

// Section labels and the frame-windows they live in. Together they tile the
// 330-frame scroll into four readable beats. Last label persists slightly
// into the next scene's lead-in so the transition feels overlapping.
const SECTIONS: { text: string; from: number; to: number }[] = [
  { text: 'Width & height',          from:   0, to:  82 },
  { text: 'Doors & drawer fronts',   from:  82, to: 165 },
  { text: 'Drawer boxes',            from: 165, to: 248 },
  { text: 'Hardware & extras',       from: 248, to: 330 },
];

export const SpecScroll: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  return (
    <AbsoluteFill>
      <PhoneFrame>
        <VerticalScreen
          src="sidebar-editor.png"
          sourceW={880}
          sourceH={3950}
          localFrame={localFrame}
          durationFrames={durationFrames}
          fit="width"
          scrollFrom={0}
          scrollTo={1}
          scrollStart={10}
          scrollEnd={durationFrames - 10}
        />
      </PhoneFrame>

      {/* Render each section's caption only while its window is active. The
          BigCaption itself handles a clean fade-in/out, so we just clip to
          the active window with a Sequence-style guard. */}
      {SECTIONS.map((s) => {
        if (localFrame < s.from || localFrame >= s.to) return null;
        return (
          <BigCaption
            key={s.text}
            text={s.text}
            localFrame={localFrame - s.from}
            durationFrames={s.to - s.from}
            variant="pill"
            fadeIn={10}
            fadeOut={14}
          />
        );
      })}
    </AbsoluteFill>
  );
};
