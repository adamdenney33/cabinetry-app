// SpecScroll (11s, 330 frames, 1920×1080). Smooth top-to-bottom scroll of
// sidebar-editor.png (880×3950) inside the BrowserFrame, with four section
// pill captions riding along.

import { AbsoluteFill } from 'remotion';
import { BrowserFrame } from '../../components/BrowserFrame';
import { Screen } from '../../components/Screen';
import { Caption } from '../../components/Caption';

const SECTIONS: { text: string; from: number; to: number }[] = [
  { text: 'Width & height',        from:   0, to:  82 },
  { text: 'Doors & drawer fronts', from:  82, to: 165 },
  { text: 'Drawer boxes',          from: 165, to: 248 },
  { text: 'Hardware & extras',     from: 248, to: 330 },
];

export const SpecScroll: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
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
          scrollStart={10}
          scrollEnd={durationFrames - 10}
        />
      </BrowserFrame>

      {SECTIONS.map((s) => {
        if (localFrame < s.from || localFrame >= s.to) return null;
        return (
          <Caption
            key={s.text}
            text={s.text}
            localFrame={localFrame - s.from}
            durationFrames={s.to - s.from}
            fadeIn={10}
            fadeOut={14}
          />
        );
      })}
    </AbsoluteFill>
  );
};
