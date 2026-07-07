/**
 * LandingAd v5 — cabinet-tab-first cut.
 *
 * v5 notes: bare white text on dark (no pills/cards), flat oversized break
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

  // ── CABINET BUILDER ──
  { key: 'br1', dur: 90, el: (d) => <SectionBreak tab="cabinet" title="Custom Cabinet Quote Builder" sub="Set your rates and times once — then let the builder do the maths." dur={d} /> },

  // My Rates editor — long dwell on the actual rate fields (no gate)
  clipShot('rates1', 120, 'set-up-your-rates.mp4', 4.4, 0.95,
    [{ f: 0, s: 1.6, x: 270, y: 310, ry: -16, rx: 5 }, { f: 20, s: 1.8, x: 250, y: 330, ry: 0, rx: 0 }, { f: 70, s: 1.8, x: 250, y: 380 }, { f: 95, s: 1.5, x: 700, y: 350, ry: 4 }, { f: 116, s: 1.5, x: 800, y: 320 }],
    'My Rates',
    [
      { at: 8, text: <>Your labour rate and {B('per-step times')} — set once.</> },
      { at: 78, text: <>Every price is built from {B('your numbers')}.</> },
    ], 11),

  // Builder sidebar — the spec being built, long dwell
  clipShot('build1', 110, 'build-and-price-a-cabinet.mp4', 3.0, 0.95,
    [{ f: 0, s: 1.65, x: 250, y: 280, ry: -16, rx: 6 }, { f: 20, s: 1.85, x: 235, y: 290, ry: 0, rx: 0 }, { f: 105, s: 1.85, x: 235, y: 340 }],
    'Cabinet Builder',
    [{ at: 8, text: <>Type the {B('dimensions')}, pick the {B('carcass material')} — right in the sidebar.</> }], 13),
  clipShot('build2', 92, 'build-and-price-a-cabinet.mp4', 4.6, 0.95,
    [{ f: 0, s: 1.85, x: 235, y: 590, ry: 13 }, { f: 16, s: 1.85, x: 235, y: 540, ry: 0 }, { f: 88, s: 1.85, x: 235, y: 480 }],
    'Cabinet Builder',
    [{ at: 6, text: <>Doors, panels, drawer fronts — {B('every spec')}, one editor.</> }], 14),
  clipShot('build3', 90, 'build-and-price-a-cabinet.mp4', 5.7, 1.0,
    [{ f: 0, s: 1.5, x: 1020, y: 320, ry: -13 }, { f: 18, s: 1.6, x: 1050, y: 390, ry: 0 }, { f: 86, s: 1.6, x: 1050, y: 430 }],
    'Cabinet Builder',
    [{ at: 6, text: <>Materials, labour, markup, tax — {B('priced live')} as you build.</> }], 15),

  // Stock feeds the builder
  clipShot('stock1', 66, 'stock-and-materials.mp4', 2.2, 1.25,
    [{ f: 0, s: 1.55, x: 280, y: 350, ry: -14 }, { f: 14, s: 1.65, x: 260, y: 390, ry: 0 }, { f: 62, s: 1.65, x: 260, y: 410 }],
    'Stock Library',
    [{ at: 5, text: <>Your {B('stock library')} feeds it all — sheet goods, hardware, edge banding.</> }], 16),
  clipShot('stock2', 54, 'stock-and-materials.mp4', 4.7, 1.25,
    [{ f: 0, s: 1.65, x: 260, y: 430 }, { f: 50, s: 1.65, x: 280, y: 440, ry: 8 }],
    'Stock Library',
    [{ at: 4, text: <>Costs and {B('low-stock alerts')}, straight into every quote.</> }], 17),

  // ── LIVE LINK ──
  { key: 'br2', dur: 90, el: (d) => <SectionBreak tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },

  // the quote sidebar editor: line items + totals
  clipShot('liveSide', 96, 'live-link-tour.mp4', 2.2, 1.0,
    [{ f: 0, s: 1.55, x: 260, y: 320, ry: -15, rx: 5 }, { f: 18, s: 1.75, x: 245, y: 340, ry: 0, rx: 0 }, { f: 60, s: 1.75, x: 245, y: 480 }, { f: 92, s: 1.75, x: 245, y: 520 }],
    'Quote Editor',
    [{ at: 6, text: <>Cabinets drop onto the quote — {B('lines, pricing, totals')} in one sidebar.</> }], 18),
  // live-link controls: toggles, optional lines, editable specs
  clipShot('liveCtl', 84, 'live-link-tour.mp4', 7.0, 1.05,
    [{ f: 0, s: 1.6, x: 250, y: 350, ry: 12 }, { f: 16, s: 1.7, x: 240, y: 400, ry: 0 }, { f: 80, s: 1.7, x: 240, y: 460 }],
    'Live Link Controls',
    [{ at: 6, text: <>Choose what customers can do — {B('optional items')}, {B('editable specs')}, deposits.</> }], 19),
  // the ACTUAL customer page: quote, Optional + Edit chips, spec editor
  clipShot('liveCust', 156, 'live-link-tour.mp4', 12.8, 0.85,
    [{ f: 0, s: 1.1, rx: 6, ry: 15 }, { f: 22, s: 1.35, x: 720, y: 380, rx: 0, ry: 0 }, { f: 80, s: 1.55, x: 620, y: 470 }, { f: 130, s: 1.55, x: 620, y: 520 }, { f: 152, s: 1.5, x: 700, y: 520 }],
    'What the customer sees',
    [
      { at: 8, text: <>Your customer opens a {B('live page')} — the full quote, on their phone.</> },
      { at: 80, text: <>They tick options, {B('edit specs you unlock')}, and {B('pay the deposit')}.</> },
    ], 20),

  // ── AUTO-SCHEDULE ──
  { key: 'br3', dur: 90, el: (d) => <SectionBreak tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  clipShot('schedOrder', 100, 'order-auto-schedule.mp4', 3.2, 1.05,
    [{ f: 0, s: 1.55, x: 260, y: 700, ry: -15, rx: 5 }, { f: 18, s: 1.75, x: 240, y: 780, ry: 0, rx: 0 }, { f: 96, s: 1.75, x: 240, y: 800 }],
    'Order · Schedule',
    [{ at: 6, text: <>Every order carries its own {B('schedule block')} — auto on, priority, hours.</> }], 21),
  // priority change → calendar reflows live
  clipShot('schedPri', 130, 'schedule-priority.mp4', 2.2, 0.95,
    [{ f: 0, s: 1.35, x: 180, y: 400, ry: 13, rx: 4 }, { f: 18, s: 1.55, x: 140, y: 420, ry: 0, rx: 0 }, { f: 70, s: 1.55, x: 150, y: 440 }, { f: 95, s: 1.25, x: 750, y: 460 }, { f: 126, s: 1.25, x: 780, y: 480 }],
    'Auto-Schedule',
    [
      { at: 6, text: <>Bump a job's {B('priority')}…</> },
      { at: 70, text: <>…and the calendar {B('reflows live')} around it.</> },
    ], 22),

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
