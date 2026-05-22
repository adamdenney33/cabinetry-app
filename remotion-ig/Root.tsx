// Registers one Composition per carousel. Each slide is a still: durationIn
// Frames == slide count, fps 1, so frame N renders slide N. The render script
// walks the frames to emit one PNG per slide.
//
// Each composition exposes editable brand props (accent colour, BETA tag, CTA
// handle) via a zod schema — tweak them live in Remotion Studio's props panel.
import React from 'react';
import { Composition, useCurrentFrame } from 'remotion';
import { W, H } from './theme';
import { CAROUSELS } from './carousels';
import { Brand, brandSchema, BRAND_DEFAULT, BrandProvider } from './brand';

const CarouselInner: React.FC<{ id: string } & Brand> = ({ id, accent, betaTag, handle }) => {
  const frame = useCurrentFrame();
  const slides = CAROUSELS[id].slides;
  const slide = slides[Math.min(frame, slides.length - 1)];
  return (
    <BrandProvider value={{ accent, betaTag, handle }}>
      {/* display:contents = no layout box; just cascades --pc-accent to the slide */}
      <div style={{ display: 'contents', ['--pc-accent' as string]: accent } as React.CSSProperties}>
        {slide}
      </div>
    </BrandProvider>
  );
};

// fix the carousel id per composition while leaving brand props editable
const branded = (id: string): React.FC<Brand> => (props) => <CarouselInner id={id} {...props} />;

export const RemotionRoot: React.FC = () => (
  <>
    {Object.entries(CAROUSELS).map(([id, c]) => (
      <Composition
        key={id}
        id={id}
        component={branded(id)}
        durationInFrames={c.slides.length}
        fps={1}
        width={W}
        height={H}
        schema={brandSchema}
        defaultProps={BRAND_DEFAULT}
      />
    ))}
  </>
);
