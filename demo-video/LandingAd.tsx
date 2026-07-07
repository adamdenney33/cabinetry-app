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
  // trim 3.0 opens ON the My Rates moment (cursor already over the button);
  // camera: full screen → zoom into the rates editor → stay on the sidebar
  // through rates + builder specs → ONE slow zoom-out to the whole screen
  // (re-priced cards in view, stock tab clicked) → ease into the stock editor.
  clipShot('cabinet', 530, 'cabinet-tour.mp4', 3.0, 1.6,
    [
      { f: 0, s: 1.02, rx: 4, ry: 10 },
      { f: 24, s: 1.02, rx: 0, ry: 0 },                    // full screen, mouse on My Rates
      { f: 48, s: 1.02 },
      { f: 78, s: 1.75, x: 250, y: 330 },                  // zoom into the rates editor
      { f: 115, s: 1.75, x: 250, y: 390 },
      { f: 155, s: 1.7, x: 250, y: 470 },                  // scrolling the full rates editor
      { f: 228, s: 1.7, x: 250, y: 520 },
      { f: 250, s: 1.75, x: 245, y: 360 },                 // builder: dims typed
      { f: 304, s: 1.75, x: 245, y: 480 },                 // doors/panels steppers
      { f: 358, s: 1.75, x: 245, y: 540 },                 // drawer fronts/boxes
      { f: 386, s: 1.75, x: 245, y: 500 },
      { f: 422, s: 1.02, x: 720, y: 450 },                 // the ONE slow zoom-out: whole screen, cards in view
      { f: 470, s: 1.02 },                                  // hold — stock tab clicked in view
      { f: 502, s: 1.6, x: 270, y: 400 },                  // ease into the stock editor
      { f: 528, s: 1.6, x: 270, y: 420 },
    ],
    'Cabinet Builder',
    [
      { at: 20, text: <>Your labour rate, markups and {B('per-step times')} — set once.</> },
      { at: 160, text: <>Carcass, panels, doors, bases — {B('every rate, one editor')}.</> },
      { at: 252, text: <>Type the {B('dimensions')}, step the {B('doors and drawers')} — priced as you build.</> },
      { at: 362, text: <>Drawer fronts, boxes, hardware — {B('every spec')} works for its price.</> },
      { at: 400, text: <>Change a number — {B('every cabinet re-prices instantly')}.</> },
      { at: 465, text: <>Your {B('stock library')} feeds it all — {B('low-stock alerts')} included.</> },
    ], 11),

  // ── LIVE LINK — one continuous take, ends on the Stripe deposit checkout ──
  { key: 'br2', dur: 90, el: (d) => <SectionBreak tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },
  clipShot('livelink', 514, 'live-link-tour.mp4', 1.8, 1.4,
    [
      { f: 0, s: 1.15, rx: 6, ry: -16 },
      { f: 24, s: 1.7, x: 250, y: 340, rx: 0, ry: 0 },     // quote sidebar editor
      { f: 95, s: 1.7, x: 250, y: 480 },
      { f: 115, s: 1.7, x: 240, y: 400, ry: 4 },           // live-link controls (payment ON)
      { f: 205, s: 1.7, x: 240, y: 460, ry: 0 },
      { f: 232, s: 1.05 },                                  // breathe: page swap
      { f: 258, s: 1.5, x: 720, y: 400 },                  // the customer page
      { f: 330, s: 1.6, x: 620, y: 500 },
      { f: 400, s: 1.5, x: 700, y: 450 },                  // Accept & pay clicked
      { f: 430, s: 1.7, x: 720, y: 450 },                  // Stripe deposit sheet
      { f: 510, s: 1.7, x: 720, y: 450 },
    ],
    'The Live Link',
    [
      { at: 20, text: <>Cabinets drop onto the quote — {B('lines, pricing, totals')} in one sidebar.</> },
      { at: 120, text: <>Turn on {B('online payment')}, optional items and {B('editable specs')}.</> },
      { at: 262, text: <>Your customer opens a {B('live page')} — the full quote, on their phone.</> },
      { at: 425, text: <>One tap: they {B('pay the deposit')} — {B('secured by Stripe')}.</> },
    ], 12),

  // ── AUTO-SCHEDULE — one continuous take, opens on the Xero-synced invoice ──
  { key: 'br3', dur: 90, el: (d) => <SectionBreak tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  clipShot('schedule', 405, 'schedule-tour.mp4', 0.6, 1.4,
    [
      { f: 0, s: 1.2, rx: -6, ry: 15 },
      { f: 18, s: 1.45, x: 1050, y: 520, rx: 0, ry: 0 },   // ✓ Xero chip on the order
      { f: 60, s: 1.45, x: 1050, y: 540 },
      { f: 80, s: 1.6, x: 240, y: 500 },                   // order sidebar opens
      { f: 110, s: 1.7, x: 240, y: 700 },                  // scrolling to the bottom…
      { f: 165, s: 1.7, x: 240, y: 780 },                  // …full Schedule block in view
      { f: 245, s: 1.7, x: 240, y: 800 },
      { f: 262, s: 1.05, ry: -4 },                          // tab swap breathe
      { f: 285, s: 1.5, x: 150, y: 430, ry: 0 },           // priority steppers
      { f: 330, s: 1.25, x: 750, y: 460 },                 // calendar reflows
      { f: 400, s: 1.25, x: 780, y: 470 },
    ],
    'Auto-Schedule',
    [
      { at: 16, text: <>Invoice {B('synced to Xero')} — accounting handled.</> },
      { at: 120, text: <>Every order carries its own {B('schedule block')} — auto on, priority, hours, dates.</> },
      { at: 290, text: <>Bump a {B('priority')} — the calendar {B('reflows live')} around it.</> },
    ], 13),

  // ── quick hit ──
  clipShot('dash1', 56, 'dashboard-overview.mp4', 0, 1.9,
    [{ f: 0, s: 1.08, ry: -11 }, { f: 52, s: 1.22, ry: 4 }],
    'Dashboard',
    [{ at: 4, text: <>Your {B('whole business')} on one screen.</> }], 24),

  { key: 'outro', dur: 178, el: (d) => <AdOutro dur={d} /> },
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
