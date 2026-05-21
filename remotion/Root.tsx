// Composition registration.
//
// Four productions live here:
//   - CabinetWorkflow         — 16:9 horizontal demo master (narration-driven)
//   - w-<scene>               — same demo split into one file per section
//                                (intro / rates / builder / spec / library / outro)
//                                with per-section narration audio baked in.
//                                The `w-` prefix mirrors the `h-` reel scenes;
//                                Remotion bans underscores in composition ids.
//   - CabinetBuilderReel      — 9:16 vertical reel master (music-driven)
//   - h-* (six standalones)   — 16:9 horizontal reel scenes shipped as
//                                separate files (no master comp)
//
// Plus per-scene debug compositions for the vertical reel, so any single
// scene can be scrubbed/rendered in isolation.
//
// Each <Composition> is written as explicit JSX (not generated from a
// `.map()` loop) so Remotion Studio's "delete from Studio" affordance can
// target individual comps. Studio rewrites this file through Prettier when
// you delete a comp from the rail; it only sees standalone JSX nodes, not
// array iterations. Durations and audio paths still come from one source
// (scenes/index.ts, vertical/constants.ts, reel-h/constants.ts) via the
// w() / reel() / reelH() helpers below.

import { Composition, Folder, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { WorkflowVideo } from './Composition';
import { SCENES, TOTAL_FRAMES, FPS, WIDTH, HEIGHT, type SceneSpec as WorkflowSceneSpec } from './scenes';
import { Intro } from './scenes/Intro';
import { Outro } from './scenes/Outro';
import { SceneRates } from './scenes/SceneRates';
import { SceneBuilder } from './scenes/SceneBuilder';
import { SceneSpec } from './scenes/SceneSpec';
import { SceneLibrary } from './scenes/SceneLibrary';
import { CabinetBuilderReel } from './vertical/Composition';
import { REEL, REEL_SCENES } from './vertical/constants';
import { HookSchema, REEL_CONTENT, type HookProps } from './vertical/reel-content';
import { Hook as VHook } from './vertical/scenes/Hook';
import { OpenBuilder as VOpenBuilder } from './vertical/scenes/OpenBuilder';
import { SpecScroll as VSpecScroll } from './vertical/scenes/SpecScroll';
import { LivePrice as VLivePrice } from './vertical/scenes/LivePrice';
import { SaveToLibrary as VSaveToLibrary } from './vertical/scenes/SaveToLibrary';
import { Close as VClose } from './vertical/scenes/Close';
import { REEL_H, REEL_H_SCENES } from './reel-h/constants';
import { Hook as HHook } from './reel-h/scenes/Hook';
import { OpenBuilder as HOpenBuilder } from './reel-h/scenes/OpenBuilder';
import { SpecScroll as HSpecScroll } from './reel-h/scenes/SpecScroll';
import { LivePrice as HLivePrice } from './reel-h/scenes/LivePrice';
import { SaveToLibrary as HSaveToLibrary } from './reel-h/scenes/SaveToLibrary';
import { Close as HClose } from './reel-h/scenes/Close';

type SceneComponent = React.FC<{ localFrame: number; durationFrames: number }>;

/** Spec lookup helpers. Each `<Composition>` below is written as explicit
 *  JSX (rather than a `.map()` loop) so Remotion Studio's "delete from
 *  Studio" feature can target it — the in-Studio delete edits Root.tsx via
 *  Prettier, and it only sees standalone JSX nodes, not array iterations.
 *  These helpers keep the JSX DRY for fields that should still come from
 *  one source of truth (durations in `constants.ts`, audio paths in
 *  `scenes/index.ts`). Throws on miss so a typo is caught at startup. */
const w = (id: string): WorkflowSceneSpec => {
  const found = SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`Workflow scene spec not found: ${id}`);
  return found;
};
const reel = (id: string) => {
  const found = REEL_SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`Vertical reel scene spec not found: ${id}`);
  return found;
};
const reelH = (id: string) => {
  const found = REEL_H_SCENES.find((s) => s.id === id);
  if (!found) throw new Error(`Horizontal reel scene spec not found: ${id}`);
  return found;
};

/** Wraps a scene component so it can be the entry of a standalone
 *  Composition — Remotion's frame counter becomes `localFrame`. */
const makeStandaloneComponent = (
  Component: SceneComponent,
  duration: number,
  tag: string,
): React.FC => {
  const Wrapped: React.FC = () => {
    const f = useCurrentFrame();
    return <Component localFrame={f} durationFrames={duration} />;
  };
  Wrapped.displayName = `Standalone(${tag})`;
  return Wrapped;
};

/** Standalone wrapper for the vertical Hook scene. Unlike the generic
 *  `makeStandaloneComponent`, this one accepts HookProps so they can be
 *  driven by a Composition's `defaultProps` and edited live in Remotion
 *  Studio's right-side Props panel. The other 5 vertical scenes still use
 *  the props-less generic wrapper for now — they'll migrate in a follow-up. */
const HOOK_DURATION_FRAMES = REEL_SCENES.find((s) => s.id === 'hook')!.duration;
const HookStandalone: React.FC<HookProps> = (props) => {
  const f = useCurrentFrame();
  return <VHook {...props} localFrame={f} durationFrames={HOOK_DURATION_FRAMES} />;
};

/** Standalone wrapper for a narration-demo scene. Mounts the scene's audio
 *  alongside the visual so the per-section MP4 plays back with sound. The
 *  Sequence `from={6}` matches the master Composition.tsx's audio offset
 *  (small lead so the voiceover doesn't trip over the scene's entrance). */
const makeNarratedScene = (
  render: (lf: number, d: number, fps: number) => React.ReactNode,
  spec: WorkflowSceneSpec,
): React.FC => {
  const Wrapped: React.FC = () => {
    const f = useCurrentFrame();
    const { fps } = useVideoConfig();
    return (
      <>
        {spec.audio && (
          <Sequence from={6}>
            <Audio src={staticFile(spec.audio)} volume={1} />
          </Sequence>
        )}
        {render(f, spec.duration, fps)}
      </>
    );
  };
  Wrapped.displayName = `Narrated(${spec.id})`;
  return Wrapped;
};

/** Per-scene renderers for the narration demo. The signature is uniform
 *  (lf, d, fps) so we don't need any-typed casts even though Intro/Outro
 *  consume `fps` and the others don't. */
const NARRATED_SCENE_RENDERERS: Record<
  string,
  (lf: number, d: number, fps: number) => React.ReactNode
> = {
  'intro':      (lf, d, fps) => <Intro localFrame={lf} durationFrames={d} fps={fps} />,
  '01-rates':   (lf, d)      => <SceneRates localFrame={lf} durationFrames={d} />,
  '02-builder': (lf, d)      => <SceneBuilder localFrame={lf} durationFrames={d} />,
  '03-spec':    (lf, d)      => <SceneSpec localFrame={lf} durationFrames={d} />,
  '04-library': (lf, d)      => <SceneLibrary localFrame={lf} durationFrames={d} />,
  'outro':      (lf, d, fps) => <Outro localFrame={lf} durationFrames={d} fps={fps} />,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* =====================================================================
          Workflow — 16:9 narrated product demo
          Master comp plus one comp per section (each section bundles its own
          narration audio so the per-section MP4 plays back standalone).
          ===================================================================== */}
      <Folder name="Workflow">
        <Composition
          id="CabinetWorkflow"
          component={WorkflowVideo}
          durationInFrames={TOTAL_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />

        <Folder name="Sections">
          <Composition
            id="w-intro"
            component={makeNarratedScene(NARRATED_SCENE_RENDERERS['intro'], w('intro'))}
            durationInFrames={w('intro').duration}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
          <Composition
            id="w-rates"
            component={makeNarratedScene(NARRATED_SCENE_RENDERERS['01-rates'], w('01-rates'))}
            durationInFrames={w('01-rates').duration}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
          <Composition
            id="w-builder"
            component={makeNarratedScene(NARRATED_SCENE_RENDERERS['02-builder'], w('02-builder'))}
            durationInFrames={w('02-builder').duration}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
          <Composition
            id="w-spec"
            component={makeNarratedScene(NARRATED_SCENE_RENDERERS['03-spec'], w('03-spec'))}
            durationInFrames={w('03-spec').duration}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
          <Composition
            id="w-library"
            component={makeNarratedScene(NARRATED_SCENE_RENDERERS['04-library'], w('04-library'))}
            durationInFrames={w('04-library').duration}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
          <Composition
            id="w-outro"
            component={makeNarratedScene(NARRATED_SCENE_RENDERERS['outro'], w('outro'))}
            durationInFrames={w('outro').duration}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
          />
        </Folder>
      </Folder>

      {/* =====================================================================
          Reel — Vertical (9:16) — music-driven 30s reel
          Master comp plus one debug comp per scene. `reel-hook` declares a
          zod schema + defaultProps so its copy + accent color show up as
          editable inputs in Remotion Studio's right-side Props panel — edit
          live with no code round-trip; the other 5 scenes still use the
          props-less standalone wrapper and will migrate to the same pattern
          in a follow-up commit.
          ===================================================================== */}
      <Folder name="Reel-Vertical">
        <Composition
          id="CabinetBuilderReel"
          component={CabinetBuilderReel}
          durationInFrames={REEL.totalFrames}
          fps={REEL.fps}
          width={REEL.width}
          height={REEL.height}
        />

        <Folder name="Scenes">
          <Composition
            id="reel-hook"
            component={HookStandalone}
            schema={HookSchema}
            defaultProps={REEL_CONTENT.hook}
            durationInFrames={HOOK_DURATION_FRAMES}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />

          <Composition
            id="reel-open-builder"
            component={makeStandaloneComponent(VOpenBuilder, reel('openBuilder').duration, 'reel-open-builder')}
            durationInFrames={reel('openBuilder').duration}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />
          <Composition
            id="reel-spec-scroll"
            component={makeStandaloneComponent(VSpecScroll, reel('specScroll').duration, 'reel-spec-scroll')}
            durationInFrames={reel('specScroll').duration}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />
          <Composition
            id="reel-live-price"
            component={makeStandaloneComponent(VLivePrice, reel('livePrice').duration, 'reel-live-price')}
            durationInFrames={reel('livePrice').duration}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />
          <Composition
            id="reel-save-library"
            component={makeStandaloneComponent(VSaveToLibrary, reel('saveLibrary').duration, 'reel-save-library')}
            durationInFrames={reel('saveLibrary').duration}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />
          <Composition
            id="reel-close"
            component={makeStandaloneComponent(VClose, reel('close').duration, 'reel-close')}
            durationInFrames={reel('close').duration}
            fps={REEL.fps}
            width={REEL.width}
            height={REEL.height}
          />
        </Folder>
      </Folder>

      {/* =====================================================================
          Reel — Horizontal (16:9) — six standalone scenes, no master
          ===================================================================== */}
      <Folder name="Reel-Horizontal">
        <Folder name="Scenes">
          <Composition
            id="h-hook"
            component={makeStandaloneComponent(HHook, reelH('hook').duration, 'h-hook')}
            durationInFrames={reelH('hook').duration}
            fps={REEL_H.fps}
            width={REEL_H.width}
            height={REEL_H.height}
          />
          <Composition
            id="h-open-builder"
            component={makeStandaloneComponent(HOpenBuilder, reelH('openBuilder').duration, 'h-open-builder')}
            durationInFrames={reelH('openBuilder').duration}
            fps={REEL_H.fps}
            width={REEL_H.width}
            height={REEL_H.height}
          />
          <Composition
            id="h-spec-scroll"
            component={makeStandaloneComponent(HSpecScroll, reelH('specScroll').duration, 'h-spec-scroll')}
            durationInFrames={reelH('specScroll').duration}
            fps={REEL_H.fps}
            width={REEL_H.width}
            height={REEL_H.height}
          />
          <Composition
            id="h-live-price"
            component={makeStandaloneComponent(HLivePrice, reelH('livePrice').duration, 'h-live-price')}
            durationInFrames={reelH('livePrice').duration}
            fps={REEL_H.fps}
            width={REEL_H.width}
            height={REEL_H.height}
          />
          <Composition
            id="h-save-library"
            component={makeStandaloneComponent(HSaveToLibrary, reelH('saveLibrary').duration, 'h-save-library')}
            durationInFrames={reelH('saveLibrary').duration}
            fps={REEL_H.fps}
            width={REEL_H.width}
            height={REEL_H.height}
          />
          <Composition
            id="h-close"
            component={makeStandaloneComponent(HClose, reelH('close').duration, 'h-close')}
            durationInFrames={reelH('close').duration}
            fps={REEL_H.fps}
            width={REEL_H.width}
            height={REEL_H.height}
          />
        </Folder>
      </Folder>
    </>
  );
};
