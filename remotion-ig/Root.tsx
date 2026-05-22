// Registers one Composition per carousel. Each slide is a still: durationIn
// Frames == slide count, fps 1, so frame N renders slide N. The render script
// walks the frames to emit one PNG per slide.
import React from 'react';
import { Composition, useCurrentFrame } from 'remotion';
import { W, H } from './theme';
import { CAROUSELS } from './carousels';

const Carousel: React.FC<{ id: string }> = ({ id }) => {
  const frame = useCurrentFrame();
  const slides = CAROUSELS[id].slides;
  const slide = slides[Math.min(frame, slides.length - 1)];
  return <>{slide}</>;
};

export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(CAROUSELS).map(([id, c]) => (
      <Composition
        key={id}
        id={id}
        component={Carousel}
        durationInFrames={c.slides.length}
        fps={1}
        width={W}
        height={H}
        defaultProps={{ id }}
      />
    ))}
  </>
);
