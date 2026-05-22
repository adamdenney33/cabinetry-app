// Registers one Composition per carousel. Each slide is a still: durationIn
// Frames == slide count, fps 1, so frame N renders slide N.
//
// Compositions are declared EXPLICITLY with inlined literal defaultProps (not a
// .map()/factory) — Remotion Studio only makes the props panel editable AND
// saveable when it can statically find inlined defaultProps in this file.
// Editable brand props: accent colour (recolours everything via --pc-accent),
// BETA tag, and CTA handle.
import React from 'react';
import { Composition, useCurrentFrame } from 'remotion';
import { W, H } from './theme';
import { CAROUSELS } from './carousels';
import { Brand, brandSchema, BrandProvider } from './brand';

const Slides: React.FC<{ id: string } & Brand> = ({ id, accent, betaTag, handle }) => {
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

const Flagship: React.FC<Brand> = (p) => <Slides id="flagship" {...p} />;
const CutList: React.FC<Brand> = (p) => <Slides id="cutlist" {...p} />;
const Schedule: React.FC<Brand> = (p) => <Slides id="schedule" {...p} />;
const Pipeline: React.FC<Brand> = (p) => <Slides id="pipeline" {...p} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="flagship"
      component={Flagship}
      schema={brandSchema}
      defaultProps={{ accent: '#e8a838', betaTag: 'BETA v0.12.0', handle: 'ProCabinet.App' }}
      durationInFrames={CAROUSELS.flagship.slides.length}
      fps={1}
      width={W}
      height={H}
    />
    <Composition
      id="cutlist"
      component={CutList}
      schema={brandSchema}
      defaultProps={{ accent: '#e8a838', betaTag: 'BETA v0.12.0', handle: 'ProCabinet.App' }}
      durationInFrames={CAROUSELS.cutlist.slides.length}
      fps={1}
      width={W}
      height={H}
    />
    <Composition
      id="schedule"
      component={Schedule}
      schema={brandSchema}
      defaultProps={{ accent: '#e8a838', betaTag: 'BETA v0.12.0', handle: 'ProCabinet.App' }}
      durationInFrames={CAROUSELS.schedule.slides.length}
      fps={1}
      width={W}
      height={H}
    />
    <Composition
      id="pipeline"
      component={Pipeline}
      schema={brandSchema}
      defaultProps={{ accent: '#e8a838', betaTag: 'BETA v0.12.0', handle: 'ProCabinet.App' }}
      durationInFrames={CAROUSELS.pipeline.slides.length}
      fps={1}
      width={W}
      height={H}
    />
  </>
);
