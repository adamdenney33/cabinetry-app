/**
 * LandingAd v4 — cabinet-tab-first cut, app-styled chrome.
 *
 * Priorities: 1) Cabinet Builder (sidebar spec editing, My Rates, stock)
 * 2) Live Link customer page 3) Auto-schedule via the ORDER sidebar's
 * Schedule section + calendar. Cut list = layout view only.
 *
 * Jump cuts land directly on inputs (no workflow gates / mouse travel).
 * SectionBreaks are app-styled white cards with deep 3D entrances.
 * Music: single generated 48s track (demo-video/public/ad-music.mp3),
 * no loop — the timeline is sized to finish with it (~47.9s).
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

// Clip-local coords: sidebar ≈ x 0–460, main pane ≈ x 850–1250 (clips 1440×900).
const SHOTS: Shot[] = [
  { key: 'intro', dur: 90, el: (d) => <AdIntro dur={d} /> },

  // ── CABINET BUILDER ──
  { key: 'br1', dur: 90, el: (d) => <SectionBreak tab="cabinet" title="Custom Cabinet Quote Builder" sub="Set your rates and times once — then let the builder do the maths." dur={d} /> },

  // My Rates: past the gate, straight onto the rate fields + re-price
  clipShot('rates1', 84, 'set-up-your-rates.mp4', 4.2, 1.15,
    [{ f: 0, s: 1.55, x: 270, y: 320, ry: -14, rx: 4 }, { f: 18, s: 1.75, x: 250, y: 330, ry: 0, rx: 0 }, { f: 80, s: 1.75, x: 250, y: 360 }],
    'My Rates',
    [{ at: 6, text: <>Your labour rate and {B('per-step times')} — set once.</> }], 11),
  clipShot('rates2', 64, 'set-up-your-rates.mp4', 6.3, 1.15,
    [{ f: 0, s: 1.55, x: 1080, y: 240, ry: 12 }, { f: 14, s: 1.6, x: 1080, y: 280, ry: 0 }, { f: 60, s: 1.6, x: 1080, y: 310 }],
    'My Rates',
    [{ at: 4, text: <>Change a rate — {B('every cabinet re-prices')} instantly.</> }], 12),

  // Builder sidebar: spec being built (starts after the add-cabinet gate)
  clipShot('build1', 92, 'build-and-price-a-cabinet.mp4', 3.0, 1.0,
    [{ f: 0, s: 1.6, x: 250, y: 280, ry: -15, rx: 5 }, { f: 18, s: 1.8, x: 235, y: 290, ry: 0, rx: 0 }, { f: 88, s: 1.8, x: 235, y: 330 }],
    'Cabinet Builder',
    [{ at: 6, text: <>Type the {B('dimensions')}, pick the {B('carcass material')} — right in the sidebar.</> }], 13),
  clipShot('build2', 78, 'build-and-price-a-cabinet.mp4', 4.5, 1.0,
    [{ f: 0, s: 1.8, x: 235, y: 580, ry: 12 }, { f: 14, s: 1.8, x: 235, y: 530, ry: 0 }, { f: 74, s: 1.8, x: 235, y: 480 }],
    'Cabinet Builder',
    [{ at: 5, text: <>Doors, panels, drawer fronts — {B('every spec')}, one editor.</> }], 14),
  clipShot('build3', 86, 'build-and-price-a-cabinet.mp4', 5.6, 1.0,
    [{ f: 0, s: 1.45, x: 1020, y: 320, ry: -12 }, { f: 16, s: 1.6, x: 1050, y: 390, ry: 0 }, { f: 82, s: 1.6, x: 1050, y: 430 }],
    'Cabinet Builder',
    [{ at: 5, text: <>Materials, labour, markup, tax — {B('priced live')} as you build.</> }], 15),

  // Stock feeds the builder — straight into the material editor
  clipShot('stock1', 70, 'stock-and-materials.mp4', 2.2, 1.2,
    [{ f: 0, s: 1.5, x: 280, y: 350, ry: -13 }, { f: 14, s: 1.65, x: 260, y: 390, ry: 0 }, { f: 66, s: 1.65, x: 260, y: 410 }],
    'Stock Library',
    [{ at: 5, text: <>Your {B('stock library')} feeds it all — sheet goods, hardware, edge banding.</> }], 16),
  clipShot('stock2', 56, 'stock-and-materials.mp4', 4.7, 1.2,
    [{ f: 0, s: 1.65, x: 260, y: 430 }, { f: 52, s: 1.65, x: 280, y: 440, ry: 8 }],
    'Stock Library',
    [{ at: 4, text: <>Costs and {B('low-stock alerts')}, straight into every quote.</> }], 17),

  // ── LIVE LINK ──
  { key: 'br2', dur: 90, el: (d) => <SectionBreak tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },
  // full-frame on the customer-facing page (right pane of the live preview)
  clipShot('live1', 150, 'create-and-send-a-quote.mp4', 14.2, 0.7,
    [{ f: 0, s: 1.15, rx: 6, ry: 14 }, { f: 22, s: 1.7, x: 1010, y: 380, rx: 0, ry: 0 }, { f: 90, s: 1.9, x: 1010, y: 470 }, { f: 146, s: 1.9, x: 1010, y: 500 }],
    'What the customer sees',
    [
      { at: 8, text: <>The quote becomes a {B('live page')} your customer opens on their phone.</> },
      { at: 84, text: <>They tweak options, {B('sign off and pay a deposit')} — with {B('chat')} built in.</> },
    ], 18),

  // ── AUTO-SCHEDULE ──
  { key: 'br3', dur: 90, el: (d) => <SectionBreak tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  // the Schedule section inside the ORDER sidebar: toggle, priority, hours
  clipShot('sched1', 120, 'order-auto-schedule.mp4', 3.2, 1.05,
    [{ f: 0, s: 1.5, x: 260, y: 700, ry: -14, rx: 4 }, { f: 18, s: 1.75, x: 240, y: 780, ry: 0, rx: 0 }, { f: 116, s: 1.75, x: 240, y: 800 }],
    'Order · Schedule',
    [
      { at: 6, text: <>Every order carries its own {B('schedule block')} — auto on, priority, hours.</> },
      { at: 70, text: <>Bump the {B('priority')} — the calendar reflows around it.</> },
    ], 19),
  clipShot('sched2', 88, 'schedule-your-workshop.mp4', 1.2, 1.5,
    [{ f: 0, s: 1.05, rx: 6, ry: 12 }, { f: 18, s: 1.3, x: 800, y: 460, rx: 0, ry: 0 }, { f: 84, s: 1.42, x: 720, y: 500 }],
    'Auto-Schedule',
    [{ at: 5, text: <>{B('Production that schedules itself')} — every deadline visible.</> }], 20),

  // ── quick hits ──
  clipShot('cut1', 72, 'optimised-cut-list.mp4', 4.9, 1.15,
    [{ f: 0, s: 1.15, rx: -5, ry: -12 }, { f: 14, s: 1.4, x: 720, y: 440, rx: 0, ry: 0 }, { f: 68, s: 1.55, x: 750, y: 480 }],
    'Cut List Optimiser',
    [{ at: 4, text: <>Parts {B('nested onto your sheets')} — no wasted board.</> }], 21),
  clipShot('dash1', 56, 'dashboard-overview.mp4', 0, 1.9,
    [{ f: 0, s: 1.08, ry: -10 }, { f: 52, s: 1.22, ry: 4 }],
    'Dashboard',
    [{ at: 4, text: <>Your {B('whole business')} on one screen.</> }], 22),

  { key: 'outro', dur: 140, el: (d) => <AdOutro dur={d} /> },
];

const X = 5;
let acc = 0;
const timeline = SHOTS.map((s) => {
  const from = acc;
  acc += s.dur - X;
  return { ...s, from };
});
export const AD_TOTAL = timeline[timeline.length - 1].from + SHOTS[SHOTS.length - 1].dur; // ≈1436f ≈ 47.9s

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
