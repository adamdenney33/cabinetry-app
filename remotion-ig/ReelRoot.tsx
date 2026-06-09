// Root for the 9:16 product reel (video). Separate from InstagramRoot (stills)
// so the still-render script never tries to rasterise the reel's frames.
import React from 'react';
import { Composition } from 'remotion';
import { Reel, REEL_FPS, REEL_DURATION } from './Reel';
import { CabinetReel, CABINET_REEL_FPS, CABINET_REEL_DURATION } from './CabinetReel';
import { CabinetReelCover, COVER_FPS, COVER_DURATION } from './CabinetReelCover';
import { CutListReel, CUTLIST_REEL_FPS, CUTLIST_REEL_DURATION } from './CutListReel';
import { SeriesGrid, GRID_FPS, GRID_DURATION, GRID_W, GRID_H } from './SeriesGrid';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="reel" component={Reel} durationInFrames={REEL_DURATION} fps={REEL_FPS} width={1080} height={1920} />
    <Composition id="cabinet-reel" component={CabinetReel} durationInFrames={CABINET_REEL_DURATION} fps={CABINET_REEL_FPS} width={1080} height={1920} />
    <Composition id="cabinet-reel-cover" component={CabinetReelCover} durationInFrames={COVER_DURATION} fps={COVER_FPS} width={1080} height={1920} />
    <Composition id="cutlist-reel" component={CutListReel} durationInFrames={CUTLIST_REEL_DURATION} fps={CUTLIST_REEL_FPS} width={1080} height={1920} />
    <Composition id="series-grid" component={SeriesGrid} durationInFrames={GRID_DURATION} fps={GRID_FPS} width={GRID_W} height={GRID_H} />
  </>
);
