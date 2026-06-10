// Root for the 9:16 product reel (video). Separate from InstagramRoot (stills)
// so the still-render script never tries to rasterise the reel's frames.
import React from 'react';
import { Composition } from 'remotion';
import { Reel, REEL_FPS, REEL_DURATION } from './Reel';
import { CabinetReel, CABINET_REEL_FPS, CABINET_REEL_DURATION } from './CabinetReel';
import { CabinetReelCover, COVER_FPS, COVER_DURATION } from './CabinetReelCover';
import { CutListReel, CUTLIST_REEL_FPS, CUTLIST_REEL_DURATION } from './CutListReel';
import { SeriesGrid, GRID_FPS, GRID_DURATION, GRID_W, GRID_H } from './SeriesGrid';
import { ReelV2, REEL_V2_FPS, REEL_V2_DURATION } from './ReelV2';
import { LiveLinkReel, LIVELINK_REEL_FPS, LIVELINK_REEL_DURATION } from './LiveLinkReel';
import { SpeedReel, SPEED_REEL_FPS, SPEED_REEL_DURATION } from './SpeedReel';
import { FounderReel, FOUNDER_REEL_FPS, FOUNDER_REEL_DURATION } from './FounderReel';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="reel" component={Reel} durationInFrames={REEL_DURATION} fps={REEL_FPS} width={1080} height={1920} />
    <Composition id="cabinet-reel" component={CabinetReel} durationInFrames={CABINET_REEL_DURATION} fps={CABINET_REEL_FPS} width={1080} height={1920} />
    <Composition id="cabinet-reel-cover" component={CabinetReelCover} durationInFrames={COVER_DURATION} fps={COVER_FPS} width={1080} height={1920} />
    <Composition id="cutlist-reel" component={CutListReel} durationInFrames={CUTLIST_REEL_DURATION} fps={CUTLIST_REEL_FPS} width={1080} height={1920} />
    <Composition id="series-grid" component={SeriesGrid} durationInFrames={GRID_DURATION} fps={GRID_FPS} width={GRID_W} height={GRID_H} />
    <Composition id="reel-v2" component={ReelV2} durationInFrames={REEL_V2_DURATION} fps={REEL_V2_FPS} width={1080} height={1920} />
    <Composition id="livelink-reel" component={LiveLinkReel} durationInFrames={LIVELINK_REEL_DURATION} fps={LIVELINK_REEL_FPS} width={1080} height={1920} />
    <Composition id="speed-reel" component={SpeedReel} durationInFrames={SPEED_REEL_DURATION} fps={SPEED_REEL_FPS} width={1080} height={1920} />
    <Composition id="founder-reel" component={FounderReel} durationInFrames={FOUNDER_REEL_DURATION} fps={FOUNDER_REEL_FPS} width={1080} height={1920} />
  </>
);
