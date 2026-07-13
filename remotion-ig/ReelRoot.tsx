// Root for the 9:16 product reel (video). Separate from InstagramRoot (stills)
// so the still-render script never tries to rasterise the reel's frames.
import React from 'react';
import { Composition } from 'remotion';
import { Reel, REEL_FPS, REEL_DURATION } from './Reel';
import { CabinetReel, CABINET_REEL_FPS, CABINET_REEL_DURATION } from './CabinetReel';
import { CabinetReelCover, COVER_FPS, COVER_DURATION } from './CabinetReelCover';
import { CreatorsCover, COVER_CREATORS_FPS, COVER_CREATORS_DURATION } from './CreatorsCover';
import { SocialTemplate, socialTemplateSchema, SocialVariant, SocialImage, SOCIAL_VARIANTS } from './SocialTemplate';
import { CutListReel, CUTLIST_REEL_FPS, CUTLIST_REEL_DURATION } from './CutListReel';
import { SeriesGrid, GRID_FPS, GRID_DURATION, GRID_W, GRID_H } from './SeriesGrid';
import { ReelV2, REEL_V2_FPS, REEL_V2_DURATION } from './ReelV2';
import { LiveLinkReel, LIVELINK_REEL_FPS, LIVELINK_REEL_DURATION } from './LiveLinkReel';
import { SpeedReel, SPEED_REEL_FPS, SPEED_REEL_DURATION } from './SpeedReel';
import { FounderReel, FOUNDER_REEL_FPS, FOUNDER_REEL_DURATION } from './FounderReel';
// Loom-based customer/IG cuts (loom-email · loom-reel · loom-portrait). They
// pull from staticFile('loom.mp4'), so studio:ig-reel sets
// --public-dir=remotion-loom/public for the source to resolve.
import { LoomCompositions } from '../remotion-loom/loomCompositions';

// Covers for the four existing grid posts, one per template variant, in both
// ratios: feed (4:5, 1080×1350) and reel (9:16, 1080×1920). Rendered by
// scripts/render-social-covers.mjs → out/instagram/covers/.
const COVER_POSTS: { id: string; kicker: string; title: string; image: SocialImage }[] = [
  { id: 'brand', kicker: '', title: 'ProCabinet*.App*', image: 'none' },
  { id: 'flagship', kicker: '', title: 'Quote custom cabinetry *in minutes*.\n...not hours.', image: 'none' },
  { id: 'quoting', kicker: '', title: 'What if quoting was this *easy?*', image: 'quote-card' },
  { id: 'schedule', kicker: '', title: 'Always up to date and *on schedule*.', image: 'icon-strip' },
];
const COVER_RATIOS = [
  { id: 'feed', width: 1080, height: 1350 },
  { id: 'reel', width: 1080, height: 1920 },
] as const;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="reel" component={Reel} durationInFrames={REEL_DURATION} fps={REEL_FPS} width={1080} height={1920} />
    <Composition id="cabinet-reel" component={CabinetReel} durationInFrames={CABINET_REEL_DURATION} fps={CABINET_REEL_FPS} width={1080} height={1920} />
    <Composition id="cabinet-reel-cover" component={CabinetReelCover} durationInFrames={COVER_DURATION} fps={COVER_FPS} width={1080} height={1920} />
    <Composition id="creators-cover" component={CreatorsCover} durationInFrames={COVER_CREATORS_DURATION} fps={COVER_CREATORS_FPS} width={1080} height={1920} />
    {/* Social post templates — flat/patterned backgrounds, no gradients, one text
        size for every line. Reuse for future posts by registering a new
        Composition with a different variant/emoji/kicker/title. */}
    {(['flat-ink', 'amber-block', 'dot-grid', 'blueprint-grid', 'diagonal-pinstripes', 'fine-grain'] as SocialVariant[]).map((variant) => (
      <Composition
        key={variant}
        id={`social-${variant}`}
        component={SocialTemplate}
        schema={socialTemplateSchema}
        durationInFrames={1}
        fps={1}
        width={1080}
        height={1920}
        defaultProps={{
          variant,
          emoji: '📣',
          kicker: 'Content creators',
          title: 'Our affiliate program is *coming soon.*',
        }}
      />
    ))}
    {/* 4 posts × 6 variants × 2 ratios = 48 cover stills */}
    {COVER_POSTS.map((post) =>
      SOCIAL_VARIANTS.map((variant) =>
        COVER_RATIOS.map((ratio) => (
          <Composition
            key={`cover-${post.id}-${variant}-${ratio.id}`}
            id={`cover-${post.id}-${variant}-${ratio.id}`}
            component={SocialTemplate}
            schema={socialTemplateSchema}
            durationInFrames={1}
            fps={1}
            width={ratio.width}
            height={ratio.height}
            defaultProps={{ variant, emoji: '', kicker: post.kicker, title: post.title, image: post.image }}
          />
        )),
      ),
    )}
    <Composition id="cutlist-reel" component={CutListReel} durationInFrames={CUTLIST_REEL_DURATION} fps={CUTLIST_REEL_FPS} width={1080} height={1920} />
    <Composition id="series-grid" component={SeriesGrid} durationInFrames={GRID_DURATION} fps={GRID_FPS} width={GRID_W} height={GRID_H} />
    <Composition id="reel-v2" component={ReelV2} durationInFrames={REEL_V2_DURATION} fps={REEL_V2_FPS} width={1080} height={1920} />
    <Composition id="livelink-reel" component={LiveLinkReel} durationInFrames={LIVELINK_REEL_DURATION} fps={LIVELINK_REEL_FPS} width={1080} height={1920} />
    <Composition id="speed-reel" component={SpeedReel} durationInFrames={SPEED_REEL_DURATION} fps={SPEED_REEL_FPS} width={1080} height={1920} />
    <Composition id="founder-reel" component={FounderReel} durationInFrames={FOUNDER_REEL_DURATION} fps={FOUNDER_REEL_FPS} width={1080} height={1920} />
    <LoomCompositions />
  </>
);
