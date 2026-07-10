// Root for the IG Content Studio compositions — separate entry from
// ReelRoot/InstagramRoot so studio renders bundle fast and never touch the
// hand-built reel/carousel comps. Dimensions + duration are prop-driven via
// calculateMetadata: the render script passes ratio/slides/seconds in props
// and the comp resizes itself (no per-ratio composition registry needed).
import React from 'react';
import { Composition } from 'remotion';
import {
  SocialStudioStill,
  SocialStudioReel,
  studioSchema,
  StudioProps,
  STUDIO_RATIOS,
  StudioRatio,
  REEL_STUDIO_FPS,
} from './SocialStudio';

const dims = (p: StudioProps) => STUDIO_RATIOS[p.ratio as StudioRatio] ?? STUDIO_RATIOS['4:5'];

const DEFAULTS: StudioProps = {
  ratio: '4:5',
  variant: 'flat-ink',
  bgData: '',
  slides: [
    {
      kicker: 'Content creators',
      title: 'Our affiliate program is *coming soon.*',
      sub: '',
      imageData: '',
      builtin: 'none',
    },
  ],
  cta: false,
  handle: 'ProCabinet.App',
  seconds: 12,
  audioFile: '',
};

export const RemotionRoot: React.FC = () => (
  <>
    {/* stills — fps 1, one frame per slide (frame N renders slide N) */}
    <Composition
      id="studio-still"
      component={SocialStudioStill}
      schema={studioSchema}
      durationInFrames={1}
      fps={1}
      width={1080}
      height={1350}
      defaultProps={DEFAULTS}
      calculateMetadata={({ props }) => ({
        ...dims(props),
        durationInFrames: Math.max(1, props.slides.length),
      })}
    />
    {/* reel — 30fps, duration from the `seconds` prop, always 9:16 */}
    <Composition
      id="studio-reel"
      component={SocialStudioReel}
      schema={studioSchema}
      durationInFrames={12 * REEL_STUDIO_FPS}
      fps={REEL_STUDIO_FPS}
      width={1080}
      height={1920}
      defaultProps={{ ...DEFAULTS, ratio: '9:16' }}
      calculateMetadata={({ props }) => ({
        width: 1080,
        height: 1920,
        durationInFrames: Math.max(3 * REEL_STUDIO_FPS, Math.round(props.seconds * REEL_STUDIO_FPS)),
      })}
    />
  </>
);
