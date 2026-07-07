/**
 * LandingAd v6 — cabinet-tab-first cut.
 *
 * v6: each of the three chapters plays as ONE continuous, uncut take
 * (cabinet-tour / live-link-tour / schedule-tour recordings) with a single
 * long camera path — no jump cuts within a section.
 * Carried over: bare white text on dark (no pills/cards), flat oversized break
 * icons, no caption bullets, deep-Z screen entrances, longer editor dwell
 * time (rates + builder sidebar), live-link chapter shows the quote sidebar
 * editor → live-link controls → the ACTUAL customer /q page (Optional +
 * Edit chips on, spec editor opened), scheduling shows a priority change
 * reflowing the calendar live. Music: single generated track, no loop.
 */
import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { C } from './theme';
import { clampOpts } from './primitives';
import { Screen3D, PoseKey } from './components/Screen3D';
import { AdIntro } from './scenes/AdIntro';
import { AdOutro } from './scenes/AdOutro';
import { SectionBreak } from './scenes/SectionBreak';

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;

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
  label: string | undefined,
  lines: { at: number; text: React.ReactNode }[] | undefined,
  seed: number,
): Shot => ({
  key, dur,
  el: (d) => (
    <>
      <Screen3D clip={clip} trimSec={trimSec} speed={speed} dur={d} pose={pose}
        kicker={label ? { label } : undefined} lines={lines} seed={seed} />
      <Flash />
    </>
  ),
});

// Clip-local coords (1440×900): app sidebar ≈ x 0–460; schedule sidebar ≈ x 0–230.
const SHOTS: Shot[] = [
  { key: 'intro', dur: 90, el: (d) => <AdIntro dur={d} /> },

  // ── CABINET BUILDER — one continuous take ──
  { key: 'br1', dur: 90, el: (d) => <SectionBreak tab="cabinet" title="Custom Cabinet Quote Builder" sub="Set your rates and times once — then let the builder do the maths." dur={d} /> },
  // v10: the take is pre-staged — it OPENS with My Rates already on screen
  // and a cabinet already selected. Camera: full screen (cursor on the tab)
  // → rates editor → full-screen ZOOM-OUT for the switch to Cabinet Builder
  // → spec edits → the one zoom-out with the re-priced cards → stock editor.
  clipShot('cabinet', 483, 'cabinet-tour.mp4', 0.7, 1.5,
    [
      { f: 0, s: 1.02, rx: 4, ry: 10 },
      { f: 20, s: 1.02, rx: 0, ry: 0 },                    // full screen: My Rates open
      { f: 45, s: 1.75, x: 250, y: 330 },                  // zoom into the rates editor
      { f: 90, s: 1.75, x: 250, y: 400 },
      { f: 120, s: 1.7, x: 250, y: 480 },                  // full rates scroll
      { f: 148, s: 1.7, x: 250, y: 500 },
      { f: 150, s: 1.02, x: 720, y: 450 },                 // zoom OUT: the switch to Cabinet Builder
      { f: 190, s: 1.02 },
      { f: 212, s: 1.75, x: 245, y: 360 },                 // dims typed
      { f: 240, s: 1.75, x: 245, y: 440 },                 // doors stepper
      { f: 290, s: 1.75, x: 245, y: 520 },                 // drawer fronts/boxes
      { f: 330, s: 1.75, x: 245, y: 540 },
      { f: 352, s: 1.02, x: 720, y: 450 },                 // the one zoom-out: re-priced cards
      { f: 396, s: 1.02 },                                  // stock tab clicked in view
      { f: 420, s: 1.6, x: 270, y: 400 },                  // stock editor
      { f: 478, s: 1.6, x: 270, y: 420 },
    ],
    undefined,
    [
      { at: 16, text: <>Your labour rate, markups and {B('per-step times')} — set once.</> },
      { at: 100, text: <>Carcass, panels, doors, bases — {B('every rate, one editor')}.</> },
      { at: 160, text: <>One tab over — {B('the Cabinet Builder')}.</> },
      { at: 216, text: <>Type the {B('dimensions')}, step the {B('doors and drawers')} — priced as you build.</> },
      { at: 300, text: <>Drawer fronts, boxes, hardware — {B('every spec')} works for its price.</> },
      { at: 356, text: <>Change a number — {B('every cabinet re-prices instantly')}.</> },
      { at: 424, text: <>Your {B('stock library')} feeds it all — {B('low-stock alerts')} included.</> },
    ], 11),

  // ── LIVE LINK — one continuous take, ends on the Stripe deposit checkout ──
  { key: 'br2', dur: 90, el: (d) => <SectionBreak tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },
  clipShot('livelink', 465, 'live-link-tour.mp4', 1.8, 1.55,
    [
      { f: 0, s: 1.15, rx: 6, ry: -16 },
      { f: 22, s: 1.7, x: 250, y: 340, rx: 0, ry: 0 },     // quote sidebar editor
      { f: 86, s: 1.7, x: 250, y: 480 },
      { f: 104, s: 1.7, x: 240, y: 400, ry: 4 },           // live-link controls (payment ON)
      { f: 185, s: 1.7, x: 240, y: 460, ry: 0 },
      { f: 210, s: 1.05 },                                  // breathe: page swap
      { f: 233, s: 1.5, x: 720, y: 400 },                  // the customer page
      { f: 298, s: 1.6, x: 620, y: 500 },
      { f: 361, s: 1.5, x: 700, y: 450 },                  // Accept & pay clicked
      { f: 388, s: 1.7, x: 720, y: 450 },                  // Stripe deposit sheet
      { f: 461, s: 1.7, x: 720, y: 450 },
    ],
    undefined,
    [
      { at: 18, text: <>Cabinets drop onto the quote — {B('lines, pricing, totals')} in one sidebar.</> },
      { at: 108, text: <>Turn on {B('online payment')}, optional items and {B('editable specs')}.</> },
      { at: 237, text: <>Your customer opens a {B('live page')} — the full quote, on their phone.</> },
      { at: 384, text: <>One tap: they {B('pay the deposit')} — {B('secured by Stripe')}.</> },
    ], 12),

  // ── AUTO-SCHEDULE — one continuous take, opens on the Xero-synced invoice ──
  { key: 'br3', dur: 90, el: (d) => <SectionBreak tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  clipShot('schedule', 365, 'schedule-tour.mp4', 0.6, 1.55,
    [
      { f: 0, s: 1.2, rx: -6, ry: 15 },
      { f: 16, s: 1.45, x: 1050, y: 520, rx: 0, ry: 0 },   // ✓ Xero chip on the order
      { f: 54, s: 1.45, x: 1050, y: 540 },
      { f: 72, s: 1.6, x: 240, y: 500 },                   // order sidebar opens
      { f: 99, s: 1.7, x: 240, y: 700 },                   // scrolling to the bottom…
      { f: 149, s: 1.7, x: 240, y: 780 },                  // …full Schedule block in view
      { f: 221, s: 1.7, x: 240, y: 800 },
      { f: 237, s: 1.05, ry: -4 },                          // tab swap breathe
      { f: 257, s: 1.5, x: 150, y: 430, ry: 0 },           // priority steppers
      { f: 298, s: 1.25, x: 750, y: 460 },                 // calendar reflows
      { f: 361, s: 1.25, x: 780, y: 470 },
    ],
    undefined,
    [
      { at: 14, text: <>Invoice {B('synced to Xero')} — accounting handled.</> },
      { at: 108, text: <>Every order carries its own {B('schedule block')} — auto on, priority, hours, dates.</> },
      { at: 262, text: <>Bump a {B('priority')} — the calendar {B('reflows live')} around it.</> },
    ], 13),

  { key: 'outro', dur: 162, el: (d) => <AdOutro dur={d} /> },
];

const X = 5;
let acc = 0;
const timeline = SHOTS.map((s) => {
  const from = acc;
  acc += s.dur - X;
  return { ...s, from };
});
export const AD_TOTAL = timeline[timeline.length - 1].from + SHOTS[SHOTS.length - 1].dur;

export const LandingAd: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0a0c' }}>
    {/* single full-length track — no looping */}
    <Audio src={staticFile('ad-music.mp3')} volume={0.5} />
    {timeline.map((s) => (
      <Sequence key={s.key} from={s.from} durationInFrames={s.dur}>
        {s.el(s.dur)}
      </Sequence>
    ))}
  </AbsoluteFill>
);
