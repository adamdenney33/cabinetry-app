/**
 * LandingAdPortraitCreators — content-creator cut of the portrait reel.
 * Same video, same audio, same edits as LandingAdPortrait, with the affiliate
 * message carried by the cover card that opens the reel (creators-cover.png,
 * the same still used as the post cover) rather than by a banner overlaid on
 * the film. The old top banner was clipped by the dynamic island / IG chrome,
 * so it's gone: the cover holds for ~2s, then cross-fades into the ad.
 * Does not modify LandingAdPortrait.
 */
import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';
import { LandingAdPortrait, AD_PORTRAIT_TOTAL } from './LandingAdPortrait';
import { clampOpts } from './primitives';

// Cover hold, then a short cross-fade into the ad (which starts — music and
// all — while the cover is still fading, so the reel never sits in silence).
const COVER_HOLD = 60;   // 2s @30fps
const COVER_FADE = 12;
const AD_FROM = COVER_HOLD - COVER_FADE + 2;

export const AD_PORTRAIT_CREATORS_TOTAL = AD_FROM + AD_PORTRAIT_TOTAL;

const Cover: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [COVER_HOLD - COVER_FADE, COVER_HOLD], [1, 0], clampOpts);
  return (
    <AbsoluteFill style={{ background: '#0a0a0c', opacity: op }}>
      <Img src={staticFile('creators-cover.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};

export const LandingAdPortraitCreators: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0a0c' }}>
    <Sequence from={AD_FROM} durationInFrames={AD_PORTRAIT_TOTAL}>
      <LandingAdPortrait />
    </Sequence>
    <Sequence from={0} durationInFrames={COVER_HOLD}>
      <Cover />
    </Sequence>
  </AbsoluteFill>
);
