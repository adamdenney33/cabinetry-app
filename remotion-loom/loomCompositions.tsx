// Single source of truth for the three loom-based deliverables, shared by both
// the standalone render entry (remotion-loom/Root.tsx) and the IG reel studio
// (remotion-ig/ReelRoot.tsx) so the durations/speeds never drift between them.
//
//   loom-email     1920×1080  real-time, audio on  → attach in customer emails
//   loom-reel      1080×1920  1.8× sped, muted      → Instagram Reel / ad
//   loom-portrait  1080×1350  1.8× sped, muted      → Instagram feed / ad
//
// Note: these use staticFile('loom.mp4'), so whichever entry renders them must
// point Remotion's public dir at remotion-loom/public (see package.json).
import React from 'react';
import { Composition } from 'remotion';
import { LoomComposition, loomSchema } from './LoomComposition';

const FPS = 30;
const SRC_FRAMES = 5850; // 195.0s loom @ 30fps
const IG_SPEED = 1.8;
const IG_FRAMES = Math.ceil(SRC_FRAMES / IG_SPEED); // 3250 ≈ 1:48

export const LoomCompositions: React.FC = () => (
  <>
    <Composition
      id="loom-email"
      component={LoomComposition}
      schema={loomSchema}
      durationInFrames={SRC_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ layout: 'landscape' as const, speed: 1, muted: false }}
    />
    <Composition
      id="loom-reel"
      component={LoomComposition}
      schema={loomSchema}
      durationInFrames={IG_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ layout: 'reel' as const, speed: IG_SPEED, muted: true }}
    />
    <Composition
      id="loom-portrait"
      component={LoomComposition}
      schema={loomSchema}
      durationInFrames={IG_FRAMES}
      fps={FPS}
      width={1080}
      height={1350}
      defaultProps={{ layout: 'portrait' as const, speed: IG_SPEED, muted: true }}
    />
  </>
);
