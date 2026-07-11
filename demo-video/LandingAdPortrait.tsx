/**
 * LandingAdPortrait — native 9:16 reframe of LandingAd.tsx (v6). Same source
 * recordings, same beat timing/captions/music, but a fresh camera path per
 * chapter tuned for portrait instead of resizing the 16:9 cut:
 *   - "full screen" beats show the whole app, letterboxed top/bottom (the
 *     app itself is landscape — unavoidable, and intentional).
 *   - "zoomed in" beats on narrow tall UI (sidebars, editors, the customer
 *     quote page, the Stripe checkout sheet) crop tight and fill the frame
 *     edge-to-edge with little to no letterboxing.
 *   - Beats on inherently wide content (the schedule calendar grid) stay
 *     closer to full-view zoom, since a tight crop would make the grid
 *     unreadable.
 * See CabinetPortrait.tsx for the validated prototype this extends.
 */
import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile } from 'remotion';
import { C } from './theme';
import { clampOpts } from './primitives';
import { Screen3D, PoseKey } from './components/Screen3D';
import { AdIntroPortrait } from './scenes/AdIntroPortrait';
import { AdOutroPortrait } from './scenes/AdOutroPortrait';
import { SectionBreakPortrait } from './scenes/SectionBreakPortrait';
import { useCurrentFrame, interpolate } from 'remotion';

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;

// Fits the 1440px-wide clip exactly at s=1 in the 1080px-wide portrait
// canvas (1080/1440 = 0.75) — the shared "full screen" reference scale.
const BASE_PORTRAIT = 0.75;

// Instagram's reel chrome (username, caption, action buttons) eats roughly the
// bottom sixth of a 9:16 frame. Sit the caption slab just clear of it rather
// than at the landscape default of 46px, so every line stays readable in-feed.
const CAP_BOTTOM = 250;

const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 2, 6], [0, 0.4, 0], clampOpts);
  return <AbsoluteFill style={{ background: '#fff', opacity: op, pointerEvents: 'none' }} />;
};

type Shot = { key: string; dur: number; el: (dur: number) => React.ReactNode };

const clipShot = (
  key: string, dur: number,
  clip: string, trimSec: number, speed: number,
  pose: PoseKey[],
  lines: { at: number; text: React.ReactNode }[] | undefined,
  seed: number,
): Shot => ({
  key, dur,
  el: (d) => (
    <>
      <Screen3D clip={clip} trimSec={trimSec} speed={speed} dur={d} pose={pose} lines={lines} seed={seed} baseOverride={BASE_PORTRAIT} capBottom={CAP_BOTTOM} brand />
      <Flash />
    </>
  ),
});

const SHOTS: Shot[] = [
  { key: 'intro', dur: 90, el: (d) => <AdIntroPortrait dur={d} /> },

  // ── CABINET BUILDER ── (validated in CabinetPortrait.tsx)
  { key: 'br1', dur: 90, el: (d) => <SectionBreakPortrait tab="cabinet" title="Custom Cabinet Quote Builder" sub="Set your rates and times once — then let the builder do the maths." dur={d} /> },
  clipShot('cabinet', 483, 'cabinet-tour.mp4', 0.7, 1.5,
    [
      { f: 0, s: 1.0, rx: 4, ry: 10 },
      { f: 20, s: 1.0, rx: 0, ry: 0 },
      { f: 45, s: 3.3, x: 250, y: 420 },
      { f: 90, s: 3.3, x: 250, y: 460 },
      { f: 120, s: 3.3, x: 250, y: 480 },
      { f: 148, s: 3.3, x: 250, y: 490 },
      { f: 150, s: 1.0, x: 720, y: 450 },
      { f: 190, s: 1.0 },
      { f: 212, s: 3.3, x: 245, y: 400 },
      { f: 240, s: 3.3, x: 245, y: 430 },
      { f: 290, s: 3.3, x: 245, y: 470 },
      { f: 330, s: 3.3, x: 245, y: 480 },
      { f: 352, s: 1.0, x: 720, y: 450 },
      { f: 396, s: 1.0 },
      { f: 420, s: 2.8, x: 270, y: 420 },
      { f: 478, s: 2.8, x: 270, y: 430 },
    ],
    [
      { at: 16, text: <>Your labour rate, markups and {B('per-step times')} — set once.</> },
      { at: 100, text: <>Carcass, panels, doors, bases — {B('every rate, one editor')}.</> },
      { at: 160, text: <>One tab over — {B('the Cabinet Builder')}.</> },
      { at: 216, text: <>Type the {B('dimensions')}, step the {B('doors and drawers')} — priced as you build.</> },
      { at: 300, text: <>Drawer fronts, boxes, hardware — {B('every spec')} works for its price.</> },
      { at: 356, text: <>Change a number — {B('every cabinet re-prices instantly')}.</> },
      { at: 424, text: <>Your {B('stock library')} feeds it all — {B('low-stock alerts')} included.</> },
    ], 11),

  // ── LIVE LINK ── quote sidebar + live-link controls are narrow/tall (tight
  // zoom fits well); the customer /q page and Stripe sheet are centered,
  // moderate zoom keeps them readable while still filling more of the frame
  // than a straight full-view would.
  { key: 'br2', dur: 90, el: (d) => <SectionBreakPortrait tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },
  clipShot('livelink', 465, 'live-link-tour.mp4', 1.8, 1.55,
    [
      { f: 0, s: 1.05, rx: 6, ry: -16 },
      { f: 22, s: 2.4, x: 280, y: 400, rx: 0, ry: 0 },
      { f: 86, s: 2.4, x: 280, y: 460 },
      { f: 104, s: 2.4, x: 270, y: 420, ry: 4 },
      { f: 185, s: 2.4, x: 270, y: 480, ry: 0 },
      { f: 210, s: 1.05 },
      { f: 233, s: 2.3, x: 570, y: 420 },
      { f: 298, s: 2.3, x: 500, y: 480 },
      { f: 316, s: 1.1, x: 720, y: 450 },                 // breathe: pull back before Accept & Pay (avoids panning through the blank page gutter)
      { f: 348, s: 1.8, x: 1085, y: 265 },                // Accept & Pay button comes into view (verified against source clip)
      { f: 380, s: 1.9, x: 1085, y: 258 },                // the click — cursor on the button, click glow visible here
      { f: 400, s: 1.9, x: 1085, y: 258 },                // hold on the click
      { f: 415, s: 1.3, x: 720, y: 450 },                 // breathe as the Stripe modal opens (modal isn't rendered yet before ~f405)
      { f: 428, s: 3.2, x: 720, y: 450 },                 // Stripe deposit sheet, fully open
      { f: 461, s: 3.2, x: 720, y: 450 },
    ],
    [
      { at: 18, text: <>Cabinets drop onto the quote — {B('lines, pricing, totals')} in one sidebar.</> },
      { at: 108, text: <>Turn on {B('online payment')}, optional items and {B('editable specs')}.</> },
      { at: 237, text: <>Your customer opens a {B('live page')} — the full quote, on their phone.</> },
      { at: 384, text: <>One tap: they {B('pay the deposit')} — {B('secured by Stripe')}.</> },
    ], 12),

  // ── AUTO-SCHEDULE ── order sidebar is tall/narrow (tight zoom, generous
  // scroll room); the calendar grid is inherently wide, so it stays close to
  // full-view so the week's columns stay legible.
  { key: 'br3', dur: 90, el: (d) => <SectionBreakPortrait tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  clipShot('schedule', 365, 'schedule-tour.mp4', 0.6, 1.55,
    [
      { f: 0, s: 1.05, rx: -6, ry: 15 },
      { f: 16, s: 2.6, x: 800, y: 495, rx: 0, ry: 0 },    // push in tight on the ✓ Xero chip itself (kept clear of the caption bar)
      { f: 54, s: 2.6, x: 800, y: 505 },
      { f: 72, s: 1.9, x: 240, y: 560 },
      { f: 99, s: 1.9, x: 240, y: 620 },
      { f: 149, s: 1.9, x: 240, y: 660 },
      { f: 221, s: 1.9, x: 240, y: 680 },
      { f: 237, s: 1.05, ry: -4 },
      { f: 257, s: 2.8, x: 150, y: 430, ry: 0 },
      { f: 298, s: 1.3, x: 750, y: 460 },
      { f: 361, s: 1.3, x: 780, y: 470 },
    ],
    [
      { at: 14, text: <>Invoice {B('synced to Xero')} — accounting handled.</> },
      { at: 108, text: <>Every order carries its own {B('schedule block')} — auto on, priority, hours, dates.</> },
      { at: 262, text: <>Bump a {B('priority')} — the calendar {B('reflows live')} around it.</> },
    ], 13),

  { key: 'outro', dur: 162, el: (d) => <AdOutroPortrait dur={d} /> },
];

const X = 5;
let acc = 0;
const timeline = SHOTS.map((s) => {
  const from = acc;
  acc += s.dur - X;
  return { ...s, from };
});
export const AD_PORTRAIT_TOTAL = timeline[timeline.length - 1].from + SHOTS[SHOTS.length - 1].dur;

export const LandingAdPortrait: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0a0c' }}>
    <Audio src={staticFile('ad-music.mp3')} volume={0.5} />
    {timeline.map((s) => (
      <Sequence key={s.key} from={s.from} durationInFrames={s.dur}>
        {s.el(s.dur)}
      </Sequence>
    ))}
  </AbsoluteFill>
);
