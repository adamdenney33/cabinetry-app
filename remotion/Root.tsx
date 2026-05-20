// Composition registration.
//
// Two productions live here:
//   - CabinetWorkflow         — 16:9 horizontal demo (existing, narration-driven)
//   - CabinetBuilderReel      — 9:16 vertical reel    (new, music-driven)
//
// Plus per-scene debug compositions for the vertical reel, so any single
// scene can be scrubbed/rendered in isolation (~30× faster than re-rendering
// the whole 900-frame master while iterating).

import { Composition, useCurrentFrame } from 'remotion';
import { WorkflowVideo } from './Composition';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './scenes';
import { CabinetBuilderReel } from './vertical/Composition';
import { REEL, REEL_SCENES } from './vertical/constants';
import { Hook } from './vertical/scenes/Hook';
import { OpenBuilder } from './vertical/scenes/OpenBuilder';
import { SpecScroll } from './vertical/scenes/SpecScroll';
import { LivePrice } from './vertical/scenes/LivePrice';
import { SaveToLibrary } from './vertical/scenes/SaveToLibrary';
import { Close } from './vertical/scenes/Close';

type SceneComponent = React.FC<{ localFrame: number; durationFrames: number }>;

const REEL_SCENE_COMPONENTS: Record<string, SceneComponent> = {
  hook: Hook,
  openBuilder: OpenBuilder,
  specScroll: SpecScroll,
  livePrice: LivePrice,
  saveLibrary: SaveToLibrary,
  close: Close,
};

/** Wraps a scene component so it can be the entry of a standalone debug
 *  Composition — Remotion's frame counter becomes `localFrame`. */
const makeDebugComponent = (
  Component: SceneComponent,
  duration: number,
): React.FC => {
  const Wrapped: React.FC = () => {
    const f = useCurrentFrame();
    return <Component localFrame={f} durationFrames={duration} />;
  };
  Wrapped.displayName = `ReelSceneDebug(${Component.displayName ?? Component.name})`;
  return Wrapped;
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ---- Horizontal demo (existing) ---- */}
      <Composition
        id="CabinetWorkflow"
        component={WorkflowVideo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />

      {/* ---- Vertical reel master ---- */}
      <Composition
        id="CabinetBuilderReel"
        component={CabinetBuilderReel}
        durationInFrames={REEL.totalFrames}
        fps={REEL.fps}
        width={REEL.width}
        height={REEL.height}
      />

      {/* ---- Per-scene debug comps for the vertical reel ---- */}
      {REEL_SCENES.map((s) => {
        const Component = REEL_SCENE_COMPONENTS[s.id];
        if (!Component) return null;
        return (
          <Composition
            key={s.label}
            id={s.label}
            component={makeDebugComponent(Component, s.duration)}
            durationInFrames={s.duration}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />
        );
      })}
    </>
  );
};
