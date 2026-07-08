/**
 * CabinetPortrait — PROTOTYPE for the portrait (1080×1920) reel cut.
 *
 * Same source recording + same beat timing as the Cabinet Builder chapter in
 * LandingAd.tsx, but a fresh camera path tuned for 9:16 instead of resizing
 * the 16:9 cut:
 *   - "full screen" beats (My Rates opens, switch to Cabinet Builder, the
 *     re-priced cards) show the whole app, letterboxed top/bottom — the app
 *     itself is landscape, so this is unavoidable and intentional.
 *   - "zoomed in" beats (rates editor, dims/doors/drawers, stock editor) crop
 *     tight to the sidebar column, which is naturally tall-and-narrow, so it
 *     fills the portrait frame edge-to-edge with no letterboxing at all.
 *
 * Only the Cabinet Builder chapter is built here — this is a single-chapter
 * proof of the technique before redoing the live-link + schedule chapters
 * and intro/outro.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { C } from './theme';
import { Screen3D, PoseKey } from './components/Screen3D';
import { SectionBreak } from './scenes/SectionBreak';

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;

// Fits the 1440px-wide clip exactly at s=1 in a 1080-wide portrait canvas
// (1080 / 1440 = 0.75) — the "full screen" reference scale. Zoom beats then
// multiply up from here via the pose `s` values below.
const BASE_PORTRAIT = 0.75;

const POSE: PoseKey[] = [
  { f: 0, s: 1.0, rx: 4, ry: 10 },
  { f: 20, s: 1.0, rx: 0, ry: 0 },                    // full screen: My Rates open
  { f: 45, s: 3.3, x: 250, y: 420 },                  // zoom into the rates editor — fills the frame
  { f: 90, s: 3.3, x: 250, y: 460 },
  { f: 120, s: 3.3, x: 250, y: 480 },                 // rates scroll (compressed pan — less headroom in portrait)
  { f: 148, s: 3.3, x: 250, y: 490 },
  { f: 150, s: 1.0, x: 720, y: 450 },                 // zoom OUT: the switch to Cabinet Builder
  { f: 190, s: 1.0 },
  { f: 212, s: 3.3, x: 245, y: 400 },                 // dims typed
  { f: 240, s: 3.3, x: 245, y: 430 },                 // doors stepper
  { f: 290, s: 3.3, x: 245, y: 470 },                 // drawer fronts/boxes
  { f: 330, s: 3.3, x: 245, y: 480 },
  { f: 352, s: 1.0, x: 720, y: 450 },                 // full screen: re-priced cards
  { f: 396, s: 1.0 },                                  // stock tab clicked in view
  { f: 420, s: 2.8, x: 270, y: 420 },                 // stock editor
  { f: 478, s: 2.8, x: 270, y: 430 },
];

const LINES = [
  { at: 16, text: <>Your labour rate, markups and {B('per-step times')} — set once.</> },
  { at: 100, text: <>Carcass, panels, doors, bases — {B('every rate, one editor')}.</> },
  { at: 160, text: <>One tab over — {B('the Cabinet Builder')}.</> },
  { at: 216, text: <>Type the {B('dimensions')}, step the {B('doors and drawers')} — priced as you build.</> },
  { at: 300, text: <>Drawer fronts, boxes, hardware — {B('every spec')} works for its price.</> },
  { at: 356, text: <>Change a number — {B('every cabinet re-prices instantly')}.</> },
  { at: 424, text: <>Your {B('stock library')} feeds it all — {B('low-stock alerts')} included.</> },
];

const BREAK_DUR = 90;
const CLIP_DUR = 483;
const X = 5; // crossfade overlap, matches LandingAd.tsx

export const CABINET_PORTRAIT_TOTAL = BREAK_DUR + (CLIP_DUR - X);

export const CabinetPortrait: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0a0c' }}>
    <Audio src={staticFile('ad-music.mp3')} volume={0.5} />
    <Sequence from={0} durationInFrames={BREAK_DUR}>
      <SectionBreak
        tab="cabinet"
        title="Custom Cabinet Quote Builder"
        sub="Set your rates and times once — then let the builder do the maths."
        dur={BREAK_DUR}
      />
    </Sequence>
    <Sequence from={BREAK_DUR - X} durationInFrames={CLIP_DUR}>
      <Screen3D
        clip="cabinet-tour.mp4"
        trimSec={0.7}
        speed={1.5}
        pose={POSE}
        dur={CLIP_DUR}
        lines={LINES}
        seed={11}
        baseOverride={BASE_PORTRAIT}
      />
    </Sequence>
  </AbsoluteFill>
);
