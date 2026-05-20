// Master vertical reel composition. Sequences the 6 scenes back-to-back,
// scoping each scene's local frame to start at 0, and (optionally) layers
// a music track guarded behind INCLUDE_AUDIO.

import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { Hook } from './scenes/Hook';
import { OpenBuilder } from './scenes/OpenBuilder';
import { SpecScroll } from './scenes/SpecScroll';
import { LivePrice } from './scenes/LivePrice';
import { SaveToLibrary } from './scenes/SaveToLibrary';
import { Close } from './scenes/Close';
import { REEL_SCENES, INCLUDE_AUDIO, REEL_AUDIO_SRC } from './constants';

/** Wrapper that scopes each scene's frame counter to start at 0. Mirrors the
 *  same helper used by the horizontal Composition.tsx. */
const Scene: React.FC<{
  id: string;
  start: number;
  duration: number;
  children: (localFrame: number, duration: number) => React.ReactNode;
}> = ({ id, start, duration, children }) => (
  <Sequence from={start} durationInFrames={duration} name={id}>
    <LocalFrameProvider duration={duration} render={children} />
  </Sequence>
);

const LocalFrameProvider: React.FC<{
  duration: number;
  render: (localFrame: number, duration: number) => React.ReactNode;
}> = ({ duration, render }) => {
  const localFrame = useCurrentFrame();
  return <>{render(localFrame, duration)}</>;
};

const get = (id: string) => {
  const s = REEL_SCENES.find((x) => x.id === id);
  if (!s) throw new Error('Unknown reel scene id: ' + id);
  return s;
};

export const CabinetBuilderReel: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#0a0a0a' }}>
      {INCLUDE_AUDIO ? (
        <Audio src={staticFile(REEL_AUDIO_SRC)} volume={0.8} />
      ) : null}

      <Scene id="hook" start={get('hook').start} duration={get('hook').duration}>
        {(lf, d) => <Hook localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene
        id="open-builder"
        start={get('openBuilder').start}
        duration={get('openBuilder').duration}
      >
        {(lf, d) => <OpenBuilder localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene
        id="spec-scroll"
        start={get('specScroll').start}
        duration={get('specScroll').duration}
      >
        {(lf, d) => <SpecScroll localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene
        id="live-price"
        start={get('livePrice').start}
        duration={get('livePrice').duration}
      >
        {(lf, d) => <LivePrice localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene
        id="save-library"
        start={get('saveLibrary').start}
        duration={get('saveLibrary').duration}
      >
        {(lf, d) => <SaveToLibrary localFrame={lf} durationFrames={d} />}
      </Scene>

      <Scene id="close" start={get('close').start} duration={get('close').duration}>
        {(lf, d) => <Close localFrame={lf} durationFrames={d} />}
      </Scene>
    </AbsoluteFill>
  );
};
