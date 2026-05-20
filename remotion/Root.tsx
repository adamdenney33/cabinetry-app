// Composition registration. The video runs at 1920×1080 / 30fps so it's
// share-ready on LinkedIn / YouTube / web embeds without extra transcoding.
// Total length is the sum of every scene's duration in `scenes.ts`.
import { Composition } from 'remotion';
import { WorkflowVideo } from './Composition';
import { TOTAL_FRAMES, FPS, WIDTH, HEIGHT } from './scenes';

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="CabinetWorkflow"
      component={WorkflowVideo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
