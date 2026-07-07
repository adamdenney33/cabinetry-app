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
  clipShot('cabinet', 466, 'cabinet-tour.mp4', 0.8, 1.25,
    [
      { f: 0, s: 1.15, rx: 6, ry: 16 },
      { f: 28, s: 1.75, x: 250, y: 330, rx: 0, ry: 0 },   // My Rates fields
      { f: 120, s: 1.75, x: 250, y: 360 },
      { f: 150, s: 1.5, x: 1050, y: 300, ry: 5 },          // list re-prices
      { f: 185, s: 1.75, x: 245, y: 380, ry: 0 },          // builder spec editor
      { f: 280, s: 1.75, x: 245, y: 430 },
      { f: 302, s: 1.3, x: 800, y: 400, ry: -6 },          // stock library
      { f: 345, s: 1.7, x: 260, y: 400, ry: 0 },           // stock editor
      { f: 440, s: 1.7, x: 260, y: 430 },
      { f: 462, s: 1.4, x: 500, y: 400 },
    ],
    'Cabinet Builder',
    [
      { at: 26, text: <>Your labour rate and {B('per-step times')} — set once.</> },
      { at: 148, text: <>Every cabinet {B('re-prices instantly')} from your numbers.</> },
      { at: 190, text: <>Dimensions, carcass, doors, drawers — {B('every spec, one editor')}.</> },
      { at: 305, text: <>Your {B('stock library')} feeds it all — costs and {B('low-stock alerts')} included.</> },
    ], 11),

  // ── LIVE LINK — one continuous take ──
  { key: 'br2', dur: 90, el: (d) => <SectionBreak tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },
  clipShot('livelink', 417, 'live-link-tour.mp4', 1.8, 1.25,
    [
      { f: 0, s: 1.15, rx: 6, ry: -16 },
      { f: 26, s: 1.7, x: 250, y: 340, rx: 0, ry: 0 },     // quote sidebar editor
      { f: 100, s: 1.7, x: 250, y: 480 },
      { f: 128, s: 1.7, x: 240, y: 400, ry: 4 },           // live-link controls
      { f: 215, s: 1.7, x: 240, y: 460, ry: 0 },
      { f: 242, s: 1.05 },                                  // breathe: page swap
      { f: 272, s: 1.5, x: 720, y: 400 },                  // the customer page
      { f: 330, s: 1.6, x: 620, y: 500 },
      { f: 413, s: 1.6, x: 660, y: 520 },
    ],
    'The Live Link',
    [
      { at: 24, text: <>Cabinets drop onto the quote — {B('lines, pricing, totals')} in one sidebar.</> },
      { at: 132, text: <>Choose what customers can do — {B('optional items')}, {B('editable specs')}, deposits.</> },
      { at: 276, text: <>Then they open a {B('live page')}: tick options, {B('edit unlocked specs')}, {B('pay the deposit')}.</> },
    ], 12),

  // ── AUTO-SCHEDULE — one continuous take ──
  { key: 'br3', dur: 90, el: (d) => <SectionBreak tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  clipShot('schedule', 353, 'schedule-tour.mp4', 0.6, 1.2,
    [
      { f: 0, s: 1.15, rx: -6, ry: 15 },
      { f: 25, s: 1.75, x: 240, y: 760, rx: 0, ry: 0 },    // order's Schedule block
      { f: 165, s: 1.75, x: 240, y: 790 },
      { f: 195, s: 1.05, ry: -4 },                          // tab swap breathe
      { f: 228, s: 1.5, x: 150, y: 430, ry: 0 },           // priority steppers
      { f: 300, s: 1.25, x: 750, y: 460 },                 // calendar reflows
      { f: 349, s: 1.25, x: 780, y: 470 },
    ],
    'Auto-Schedule',
    [
      { at: 24, text: <>Every order carries its own {B('schedule block')} — auto on, priority, hours.</> },
      { at: 215, text: <>Bump a {B('priority')} — the calendar {B('reflows live')} around it.</> },
    ], 13),

  // ── quick hits ──
  clipShot('cut1', 72, 'optimised-cut-list.mp4', 4.9, 1.15,
    [{ f: 0, s: 1.15, rx: -5, ry: -13 }, { f: 14, s: 1.4, x: 720, y: 440, rx: 0, ry: 0 }, { f: 68, s: 1.55, x: 750, y: 480 }],
    'Cut List Optimiser',
    [{ at: 4, text: <>Parts {B('nested onto your sheets')} — no wasted board.</> }], 23),
  clipShot('dash1', 56, 'dashboard-overview.mp4', 0, 1.9,
    [{ f: 0, s: 1.08, ry: -11 }, { f: 52, s: 1.22, ry: 4 }],
    'Dashboard',
    [{ at: 4, text: <>Your {B('whole business')} on one screen.</> }], 24),

  { key: 'outro', dur: 140, el: (d) => <AdOutro dur={d} /> },
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
