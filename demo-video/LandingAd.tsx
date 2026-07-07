/**
 * LandingAd v2 — high-energy landing-page ad cut from REAL app recordings
 * (wiki/recordings, re-recorded 2026-07-07 as "Pro Cabinet Co"), composited
 * on a 3D stage (Screen3D). Copy is lifted verbatim from landing.html.
 *
 * Clips are pre-encoded at 1.4× (postprocess-wiki-clips.mjs); the `speed`
 * prop here multiplies on top — quoted speeds below are the ON-TOP rate.
 * Weighting: QUOTING is the hero, then LIVE LINK + pipeline + SCHEDULING;
 * cut list is one fast montage beat.
 */
import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { C } from './theme';
import { clampOpts } from './primitives';
import { Screen3D } from './components/Screen3D';
import { AdIntro } from './scenes/AdIntro';
import { AdOutro } from './scenes/AdOutro';

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;

// ── scene durations (frames @30) ──
const D = {
  intro: 105,
  quote: 300,     // create-and-send: client → job → lines → totals
  builder: 170,   // build-and-price: cabinet dims → live re-price
  livelink: 135,  // tail of create clip: Live link tab + customer preview
  convert: 145,   // approved quote → order in one click
  schedule: 165,  // auto-schedule calendar
  mDash: 62,
  mStock: 58,
  mCut: 84,
  outro: 150,
};
const X = 6; // fast crossfade

const starts: Record<string, number> = { intro: 0 };
starts.quote = starts.intro + D.intro - X;
starts.builder = starts.quote + D.quote - X;
starts.livelink = starts.builder + D.builder - X;
starts.convert = starts.livelink + D.livelink - X;
starts.schedule = starts.convert + D.convert - X;
starts.mDash = starts.schedule + D.schedule - X;
starts.mStock = starts.mDash + D.mDash - X;
starts.mCut = starts.mStock + D.mStock - X;
starts.outro = starts.mCut + D.mCut - X;
export const AD_TOTAL = starts.outro + D.outro;

/** 3-frame white flash used as a section transition hit. */
const Flash: React.FC = () => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 2, 6], [0, 0.5, 0], clampOpts);
  return <AbsoluteFill style={{ background: '#fff', opacity: op, pointerEvents: 'none' }} />;
};

export const LandingAd: React.FC = () => (
  <AbsoluteFill style={{ background: '#0a0a0c' }}>
    <Audio src={staticFile('reel-music.mp3')} loop volume={0.4} />

    <Sequence from={starts.intro} durationInFrames={D.intro}>
      <AdIntro dur={D.intro} />
    </Sequence>

    {/* ── 01 · QUOTING — create & send a quote (hero) ── */}
    <Sequence from={starts.quote} durationInFrames={D.quote}>
      <Screen3D
        clip="create-and-send-a-quote.mp4"
        speed={1.5}
        dur={D.quote}
        fadeIn={X}
        seed={1}
        kicker={{ n: '01', label: 'Custom Cabinet Quote Builder' }}
        pose={[
          { f: 0, s: 0.98, rx: 6, ry: -10 },          // 3D entrance
          { f: 26, s: 1.02, rx: 2, ry: -3 },
          { f: 45, s: 1.5, x: 340, y: 300, rx: 0, ry: 0 },   // client smart-input
          { f: 95, s: 1.5, x: 340, y: 300 },
          { f: 125, s: 1.45, x: 760, y: 420, ry: 4 },  // lines table fills
          { f: 190, s: 1.45, x: 760, y: 420 },
          { f: 220, s: 1.6, x: 1080, y: 560, ry: -5 }, // totals recalc live
          { f: 268, s: 1.6, x: 1080, y: 560 },
          { f: 296, s: 1.05, rx: 2, ry: 2 },
        ]}
        lines={[
          { at: 10, text: <>Build bespoke cabinet quotes {B('in seconds')} — the builder does the maths.</> },
          { at: 150, text: <>Materials, labour, markup and tax — {B('priced live')} as you type.</> },
        ]}
      />
      <Flash />
    </Sequence>

    {/* ── 01b · the cabinet builder re-pricing live ── */}
    <Sequence from={starts.builder} durationInFrames={D.builder}>
      <Screen3D
        clip="build-and-price-a-cabinet.mp4"
        speed={1.4}
        dur={D.builder}
        fadeIn={X}
        seed={2}
        kicker={{ n: '01', label: 'Custom Cabinet Quote Builder' }}
        pose={[
          { f: 0, s: 1.0, rx: -5, ry: 9 },
          { f: 22, s: 1.35, x: 380, y: 420, rx: 0, ry: 0 },  // dims + materials sidebar
          { f: 90, s: 1.35, x: 380, y: 420 },
          { f: 120, s: 1.5, x: 1050, y: 380, ry: -4 },        // price re-computes
          { f: 166, s: 1.1, ry: 2 },
        ]}
        lines={[
          { at: 8, text: <>Set your rates and times {B('once')} — pull materials straight from {B('your stock library')}.</> },
        ]}
      />
      <Flash />
    </Sequence>

    {/* ── 02 · LIVE LINK — the customer-facing quote page ── */}
    <Sequence from={starts.livelink} durationInFrames={D.livelink}>
      <Screen3D
        clip="create-and-send-a-quote.mp4"
        trimSec={12.6}          // jump to the Live link beat of the same take
        speed={1.1}
        dur={D.livelink}
        fadeIn={X}
        seed={3}
        kicker={{ n: '02', label: 'The Live Link' }}
        pose={[
          { f: 0, s: 1.02, rx: 5, ry: 8 },
          { f: 24, s: 1.3, x: 900, y: 420, rx: 0, ry: 0 },   // customer preview pane
          { f: 90, s: 1.45, x: 900, y: 460, ry: -3 },
          { f: 131, s: 1.45, x: 900, y: 460 },
        ]}
        lines={[
          { at: 8, text: <>Send {B('a link, not a PDF')} — a live page where they sign off and {B('pay a deposit')}.</> },
          { at: 78, text: <>Two-way {B('chat baked into the quote')} — no email ping-pong.</> },
        ]}
      />
      <Flash />
    </Sequence>

    {/* ── 03 · QUOTE → ORDER ── */}
    <Sequence from={starts.convert} durationInFrames={D.convert}>
      <Screen3D
        clip="convert-a-quote-to-an-order.mp4"
        trimSec={3.6}           // this take kept its boot head — skip it
        speed={1.4}
        dur={D.convert}
        fadeIn={X}
        seed={4}
        kicker={{ n: '03', label: 'Quotes · Orders · Clients' }}
        pose={[
          { f: 0, s: 1.0, rx: -4, ry: -8 },
          { f: 22, s: 1.35, x: 1000, y: 620, rx: 0, ry: 0 }, // accepted card + Create Order
          { f: 70, s: 1.35, x: 1000, y: 620 },
          { f: 100, s: 1.3, x: 720, y: 350, ry: 4 },          // lands on Orders
          { f: 141, s: 1.05 },
        ]}
        lines={[
          { at: 8, text: <>Accepted? {B('Convert to an order')} in one click — from first quote to final invoice, {B('on one pipeline')}.</> },
        ]}
      />
      <Flash />
    </Sequence>

    {/* ── 04 · SCHEDULING ── */}
    <Sequence from={starts.schedule} durationInFrames={D.schedule}>
      <Screen3D
        clip="schedule-your-workshop.mp4"
        speed={1.4}
        dur={D.schedule}
        fadeIn={X}
        seed={5}
        kicker={{ n: '04', label: 'Auto-Schedule Production' }}
        pose={[
          { f: 0, s: 1.0, rx: 5, ry: 10 },
          { f: 24, s: 1.28, x: 800, y: 480, rx: 0, ry: 0 },
          { f: 100, s: 1.4, x: 700, y: 520, ry: -4 },
          { f: 161, s: 1.05 },
        ]}
        lines={[
          { at: 8, text: <>{B('Production that schedules itself')} — set your hours and a priority, work allocates automatically.</> },
        ]}
      />
      <Flash />
    </Sequence>

    {/* ── fast montage ── */}
    <Sequence from={starts.mDash} durationInFrames={D.mDash}>
      <Screen3D clip="dashboard-overview.mp4" speed={2} dur={D.mDash} fadeIn={X} seed={6}
        pose={[{ f: 0, s: 1.05, ry: -6 }, { f: D.mDash, s: 1.18, ry: 3 }]}
        lines={[{ at: 4, text: <>Your {B('whole business')} on one screen.</> }]} />
      <Flash />
    </Sequence>
    <Sequence from={starts.mStock} durationInFrames={D.mStock}>
      <Screen3D clip="stock-and-materials.mp4" trimSec={0.4} speed={2} dur={D.mStock} fadeIn={X} seed={7}
        pose={[{ f: 0, s: 1.05, ry: 6 }, { f: D.mStock, s: 1.18, ry: -3 }]}
        lines={[{ at: 4, text: <>Every material, {B('tracked')} — fed straight into quotes and cut lists.</> }]} />
      <Flash />
    </Sequence>
    <Sequence from={starts.mCut} durationInFrames={D.mCut}>
      <Screen3D clip="optimised-cut-list.mp4" trimSec={0.7} speed={1.7} dur={D.mCut} fadeIn={X} fadeOut={X} seed={8}
        pose={[{ f: 0, s: 1.02, rx: -4, ry: -7 }, { f: 26, s: 1.3, x: 780, y: 460, rx: 0, ry: 0 }, { f: 80, s: 1.4, x: 780, y: 460 }]}
        lines={[{ at: 4, text: <>And the {B('Cut List Optimiser')} — cut sheets that don't waste board.</> }]} />
      <Flash />
    </Sequence>

    <Sequence from={starts.outro} durationInFrames={D.outro}>
      <AdOutro dur={D.outro} />
    </Sequence>
  </AbsoluteFill>
);
