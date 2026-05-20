// Top-level video composition. Lays out the 6 scenes back-to-back, scopes
// each scene's local frame counter via Sequence + useCurrentFrame, and
// schedules each scene's narration audio as a sibling Audio element so
// rendering can encode it directly into the MP4.

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { SCENES, sceneStart, FPS } from './scenes';
import { Intro } from './scenes/Intro';
import { Outro } from './scenes/Outro';
import { SceneRates } from './scenes/SceneRates';
import { SceneBuilder } from './scenes/SceneBuilder';
import { SceneSpec } from './scenes/SceneSpec';
import { SceneLibrary } from './scenes/SceneLibrary';

/** Wrapper that scopes each scene's frame counter to start at 0 — child
 *  components read the local frame via useCurrentFrame() without having to
 *  know their start offset in the composition. */
const Scene: React.FC<{
  id: string;
  duration: number;
  children: (localFrame: number, duration: number) => React.ReactNode;
}> = ({ id, duration, children }) => {
  return (
    <Sequence from={sceneStart(id)} durationInFrames={duration} name={id}>
      <LocalFrameProvider duration={duration} render={children} />
    </Sequence>
  );
};

const LocalFrameProvider: React.FC<{
  duration: number;
  render: (localFrame: number, duration: number) => React.ReactNode;
}> = ({ duration, render }) => {
  const localFrame = useCurrentFrame();
  return <>{render(localFrame, duration)}</>;
};

export const WorkflowVideo: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: '#0a0a0a' }}>
      {/* Schedule every narration track at its scene's start frame. Remotion
          bakes these into the final MP4's audio stream. */}
      {SCENES.filter((s) => s.audio).map((s) => (
        <Sequence key={s.id} from={sceneStart(s.id) + 6} name={`audio-${s.id}`}>
          <Audio src={staticFile(s.audio as string)} volume={1} />
        </Sequence>
      ))}

      <Scene id="intro" duration={SCENES[0].duration}>
        {(lf, d) => <Intro localFrame={lf} durationFrames={d} fps={fps} />}
      </Scene>

      <Scene id="01-rates" duration={SCENES[1].duration}>
        {(lf, d) => <SceneRates localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene id="02-builder" duration={SCENES[2].duration}>
        {(lf, d) => <SceneBuilder localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene id="03-spec" duration={SCENES[3].duration}>
        {(lf, d) => <SceneSpec localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene id="04-library" duration={SCENES[4].duration}>
        {(lf, d) => <SceneLibrary localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene id="outro" duration={SCENES[5].duration}>
        {(lf, d) => <Outro localFrame={lf} durationFrames={d} fps={fps} />}
      </Scene>
    </AbsoluteFill>
  );
};
