/**
 * LandingAd v3 — cabinet-tab-first cut.
 *
 * Priorities: 1) Cabinet Builder (sidebar spec editing, My Rates, stock
 * feeding in) 2) Live Link 3) Auto-Schedule. Cut list appears only as the
 * layout view. Quote-tab workflow removed.
 *
 * Style: JUMP CUTS between the key inputs (typing, clicks, re-prices) — no
 * mouse-travel filler — with 3D SectionBreak interstitials (big tab icon +
 * feature title) between chapters. Clips are real recordings pre-encoded at
 * 1.4×; `speed` here multiplies on top.
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

/** 3-frame white flash on hard cuts. */
const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 2, 6], [0, 0.45, 0], clampOpts);
  return <AbsoluteFill style={{ background: '#fff', opacity: op, pointerEvents: 'none' }} />;
};

// ── shot list (frames @30) ──────────────────────────────────────────────────
type Shot = {
  key: string;
  dur: number;
  kind: 'intro' | 'break' | 'clip' | 'outro';
  el?: React.ReactNode | ((dur: number) => React.ReactNode);
};

// Sidebar in the clips sits at x≈0–460 (clip is 1440×900); quote main ≈ x 850–1250.
const clipShot = (
  key: string, dur: number,
  clip: string, trimSec: number, speed: number,
  pose: PoseKey[],
  kicker: { n: string; label: string } | undefined,
  lines: { at: number; text: React.ReactNode }[] | undefined,
  seed: number,
): Shot => ({
  key, dur, kind: 'clip',
  el: (d: number) => (
    <>
      <Screen3D clip={clip} trimSec={trimSec} speed={speed} dur={d} pose={pose} kicker={kicker} lines={lines} seed={seed} />
      <Flash />
    </>
  ),
});

const SHOTS: Shot[] = [
  { key: 'intro', dur: 100, kind: 'intro' },

  // ── 01 · CABINET BUILDER ──
  { key: 'br1', dur: 72, kind: 'break', el: (d) => <SectionBreak n="01" tab="cabinet" title="Custom Cabinet Quote Builder" sub="Set your rates and times once — then let the builder do the maths." dur={d} /> },

  // My Rates: labour rate typed → everything re-prices
  clipShot('rates1', 82, 'set-up-your-rates.mp4', 3.4, 1.2,
    [{ f: 0, s: 1.45, x: 300, y: 330, ry: -6 }, { f: 16, s: 1.7, x: 260, y: 330, ry: 0 }, { f: 78, s: 1.7, x: 260, y: 360 }],
    { n: '01', label: 'My Rates' },
    [{ at: 6, text: <>Your labour rate and {B('per-step times')} — set once.</> }], 11),
  clipShot('rates2', 68, 'set-up-your-rates.mp4', 6.1, 1.2,
    [{ f: 0, s: 1.5, x: 1080, y: 220, ry: 5 }, { f: 14, s: 1.55, x: 1080, y: 260, ry: 0 }, { f: 64, s: 1.55, x: 1080, y: 300 }],
    { n: '01', label: 'My Rates' },
    [{ at: 4, text: <>Change a rate — {B('every cabinet re-prices')} instantly.</> }], 12),

  // Builder sidebar: the spec being built
  clipShot('build1', 92, 'build-and-price-a-cabinet.mp4', 2.35, 1.05,
    [{ f: 0, s: 1.5, x: 260, y: 280, ry: -7 }, { f: 16, s: 1.75, x: 235, y: 290, ry: 0 }, { f: 88, s: 1.75, x: 235, y: 320 }],
    { n: '01', label: 'Cabinet Builder' },
    [{ at: 6, text: <>Type the {B('dimensions')}, pick the {B('carcass material')} — right in the sidebar.</> }], 13),
  clipShot('build2', 78, 'build-and-price-a-cabinet.mp4', 4.35, 1.05,
    [{ f: 0, s: 1.75, x: 235, y: 560, ry: 6 }, { f: 14, s: 1.75, x: 235, y: 520, ry: 0 }, { f: 74, s: 1.75, x: 235, y: 480 }],
    { n: '01', label: 'Cabinet Builder' },
    [{ at: 5, text: <>Doors, panels, drawer fronts — {B('every spec')}, one editor.</> }], 14),
  clipShot('build3', 88, 'build-and-price-a-cabinet.mp4', 5.55, 1.05,
    [{ f: 0, s: 1.4, x: 1020, y: 300, ry: -5 }, { f: 16, s: 1.55, x: 1050, y: 380, ry: 0 }, { f: 84, s: 1.55, x: 1050, y: 420 }],
    { n: '01', label: 'Cabinet Builder' },
    [{ at: 5, text: <>Materials, labour, markup, tax — {B('priced live')} as you build.</> }], 15),

  // Stock feeds the builder
  clipShot('stock1', 74, 'stock-and-materials.mp4', 2.0, 1.25,
    [{ f: 0, s: 1.45, x: 280, y: 340, ry: -6 }, { f: 14, s: 1.6, x: 260, y: 380, ry: 0 }, { f: 70, s: 1.6, x: 260, y: 400 }],
    { n: '01', label: 'Stock Library' },
    [{ at: 5, text: <>Your {B('stock library')} feeds it all — sheet goods, hardware, edge banding.</> }], 16),
  clipShot('stock2', 60, 'stock-and-materials.mp4', 4.6, 1.25,
    [{ f: 0, s: 1.6, x: 260, y: 430 }, { f: 56, s: 1.6, x: 280, y: 430, ry: 4 }],
    { n: '01', label: 'Stock Library' },
    [{ at: 4, text: <>Costs and {B('low-stock alerts')}, straight into every quote.</> }], 17),

  // ── 02 · LIVE LINK ──
  { key: 'br2', dur: 72, kind: 'break', el: (d) => <SectionBreak n="02" tab="quotes" title="The Live Link" sub="Send a link, not a PDF — your customer signs off and pays a deposit." dur={d} /> },
  // trim past the preview iframe's loading state; slow-mo so the loaded
  // customer page holds on screen (clip ends ~17.7s — freeze covers the tail)
  clipShot('live1', 150, 'create-and-send-a-quote.mp4', 14.2, 0.7,
    [{ f: 0, s: 1.05, rx: 5, ry: 9 }, { f: 20, s: 1.32, x: 920, y: 420, rx: 0, ry: 0 }, { f: 85, s: 1.5, x: 950, y: 460, ry: -3 }, { f: 146, s: 1.5, x: 950, y: 460 }],
    { n: '02', label: 'The Live Link' },
    [
      { at: 8, text: <>One click — the quote becomes a {B('live page')} your customer opens on their phone.</> },
      { at: 84, text: <>They tweak options, {B('sign off and pay a deposit')} — with {B('chat')} built in.</> },
    ], 18),

  // ── 03 · AUTO-SCHEDULE ──
  { key: 'br3', dur: 72, kind: 'break', el: (d) => <SectionBreak n="03" tab="schedule" title="Auto-Schedule Production" sub="Set your hours and a priority — work allocates itself." dur={d} /> },
  clipShot('sched1', 150, 'schedule-your-workshop.mp4', 0, 1.5,
    [{ f: 0, s: 1.0, rx: 5, ry: 10 }, { f: 20, s: 1.28, x: 800, y: 460, rx: 0, ry: 0 }, { f: 90, s: 1.4, x: 700, y: 500, ry: -4 }, { f: 146, s: 1.1 }],
    { n: '03', label: 'Auto-Schedule' },
    [{ at: 8, text: <>{B('Production that schedules itself')} — every deadline visible at a glance.</> }], 19),

  // ── quick hits: cut layout + dashboard ──
  // layout view only — trim/dur sized so we never run past the clip's end
  clipShot('cut1', 78, 'optimised-cut-list.mp4', 4.9, 1.15,
    [{ f: 0, s: 1.1, rx: -4, ry: -8 }, { f: 14, s: 1.35, x: 720, y: 430, rx: 0, ry: 0 }, { f: 50, s: 1.5, x: 720, y: 470 }, { f: 74, s: 1.5, x: 760, y: 500 }],
    { n: '+', label: 'Cut List Optimiser' },
    [{ at: 5, text: <>Parts {B('nested onto your sheets')} — cut sheets that don't waste board.</> }], 20),
  clipShot('dash1', 64, 'dashboard-overview.mp4', 0, 1.9,
    [{ f: 0, s: 1.05, ry: -6 }, { f: 60, s: 1.2, ry: 3 }],
    { n: '+', label: 'Dashboard' },
    [{ at: 4, text: <>Your {B('whole business')} on one screen.</> }], 21),

  { key: 'outro', dur: 150, kind: 'outro' },
];

const X = 5; // overlap on soft joins (intro/breaks); clip→clip cuts are hard
let acc = 0;
const timeline = SHOTS.map((s) => {
  const from = acc;
  acc += s.dur - X;
  return { ...s, from };
});
export const AD_TOTAL = timeline[timeline.length - 1].from + SHOTS[SHOTS.length - 1].dur;

export const LandingAd: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0a0c' }}>
    <Audio src={staticFile('reel-music.mp3')} loop volume={0.4} />
    {timeline.map((s) => (
      <Sequence key={s.key} from={s.from} durationInFrames={s.dur}>
        {s.kind === 'intro' && <AdIntro dur={s.dur} />}
        {s.kind === 'outro' && <AdOutro dur={s.dur} />}
        {(s.kind === 'break' || s.kind === 'clip') && (typeof s.el === 'function' ? s.el(s.dur) : s.el)}
      </Sequence>
    ))}
  </AbsoluteFill>
);
