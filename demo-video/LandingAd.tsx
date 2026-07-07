/**
 * LandingAd — 60s premium landing-page ad. No voiceover (landing videos
 * autoplay muted): music bed + kinetic captions carry the story.
 *
 * Weighting per positioning: QUOTING is the hero, then the LIVE LINK and
 * SCHEDULING; cut list appears only as a fast montage beat at the end.
 */
import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile } from 'remotion';
import { C } from './theme';
import { AdStage } from './components/AdStage';
import { DemoCursor } from './components/DemoCursor';
import { tabCenter } from './components/AppWindow';
import { AdIntro } from './scenes/AdIntro';
import { AdOutro } from './scenes/AdOutro';
import { LiveLink } from './scenes/LiveLink';
import { CabinetBuilder } from './app/CabinetBuilder';
import { Quotes } from './app/Quotes';
import { Schedule } from './app/Schedule';
import { Dashboard } from './app/Dashboard';
import { Stock } from './app/Stock';
import { CutList } from './app/CutList';

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;

// ── scene durations ──
const D = {
  intro: 160,
  quote: 270,
  pipeline: 195,
  livelink: 380,
  schedule: 205,
  mDash: 90,
  mStock: 80,
  mCut: 95,
  outro: 175,
};
const X = 10; // crossfade overlap

const starts: Record<string, number> = { intro: 0 };
starts.quote = starts.intro + D.intro - X;
starts.pipeline = starts.quote + D.quote - X;
starts.livelink = starts.pipeline + D.pipeline - X;
starts.schedule = starts.livelink + D.livelink - X;
starts.mDash = starts.schedule + D.schedule - X;
starts.mStock = starts.mDash + D.mDash - X;
starts.mCut = starts.mStock + D.mStock - X;
starts.outro = starts.mCut + D.mCut - X;
export const AD_TOTAL = starts.outro + D.outro;

export const LandingAd: React.FC = () => (
  <AbsoluteFill style={{ background: '#0d0d0f' }}>
    <Audio src={staticFile('music.mp3')} loop volume={0.2} />

    <Sequence from={starts.intro} durationInFrames={D.intro}>
      <AdIntro dur={D.intro} />
    </Sequence>

    {/* ── 01 · QUOTING (hero) ── */}
    <Sequence from={starts.quote} durationInFrames={D.quote}>
      <AdStage
        activeTab="cabinet"
        dur={D.quote}
        fadeIn={X}
        kicker={{ n: '01', label: 'Quoting' }}
        cam={[
          { f: 0, s: 1 },
          { f: 30, s: 1 },
          { f: 70, s: 1.45, x: 340, y: 520 }, // into the dimension fields as "560" types
          { f: 130, s: 1.45, x: 340, y: 520 },
          { f: 175, s: 1.3, x: 900, y: 260 }, // pan to the live quote total
          { f: 215, s: 1.3, x: 900, y: 260 },
          { f: 255, s: 1 },
        ]}
        lines={[
          { at: 12, text: <>Type the sizes, pick the materials — every cabinet {B('prices itself, live')}.</> },
          { at: 150, text: <>Materials, labour, markup and tax — a {B('quote-ready price')} in seconds.</> },
        ]}
        overlay={<DemoCursor keys={[
          { frame: 10, x: 360, y: 308 },
          { frame: 24, x: 360, y: 308, click: true },
          { frame: 120, x: 380, y: 420 },
          { frame: 170, x: 980, y: 300 },
          { frame: 240, x: 1200, y: 420 },
        ]} />}
      >
        <CabinetBuilder />
      </AdStage>
    </Sequence>

    {/* ── 01b · quote pipeline → order ── */}
    <Sequence from={starts.pipeline} durationInFrames={D.pipeline}>
      <AdStage
        activeTab="quotes"
        dur={D.pipeline}
        fadeIn={X}
        kicker={{ n: '01', label: 'Quoting' }}
        cam={[
          { f: 0, s: 1 },
          { f: 40, s: 1.28, x: 980, y: 640 }, // approved card
          { f: 150, s: 1.28, x: 980, y: 640 },
          { f: 185, s: 1.05 },
        ]}
        lines={[
          { at: 10, text: <>Track every job from draft to approved — then {B('convert to an order')} in one click.</> },
        ]}
        overlay={<DemoCursor keys={[
          { frame: 0, x: tabCenter('quotes').x, y: tabCenter('quotes').y },
          { frame: 6, x: tabCenter('quotes').x, y: tabCenter('quotes').y, click: true },
          { frame: 50, x: 1390, y: 620 },
          { frame: 62, x: 1390, y: 620, click: true },
          { frame: 150, x: 1150, y: 560 },
        ]} />}
      >
        <Quotes convertApproved />
      </AdStage>
    </Sequence>

    {/* ── 02 · LIVE LINK ── */}
    <Sequence from={starts.livelink} durationInFrames={D.livelink}>
      <LiveLink dur={D.livelink} />
    </Sequence>

    {/* ── 03 · SCHEDULING ── */}
    <Sequence from={starts.schedule} durationInFrames={D.schedule}>
      <AdStage
        activeTab="schedule"
        dur={D.schedule}
        fadeIn={X}
        kicker={{ n: '03', label: 'Scheduling' }}
        cam={[
          { f: 0, s: 1 },
          { f: 45, s: 1.22, x: 760, y: 500 },
          { f: 150, s: 1.22, x: 760, y: 500 },
          { f: 195, s: 1 },
        ]}
        lines={[
          { at: 10, text: <>Approved work drops straight onto a calendar that {B('plans production for you')}.</> },
          { at: 120, text: <>Your hours, your priorities — {B('every deadline visible')} at a glance.</> },
        ]}
        overlay={<DemoCursor keys={[
          { frame: 0, x: tabCenter('schedule').x, y: tabCenter('schedule').y },
          { frame: 6, x: tabCenter('schedule').x, y: tabCenter('schedule').y, click: true },
          { frame: 60, x: 740, y: 520 },
          { frame: 150, x: 950, y: 440 },
        ]} />}
      >
        <Schedule />
      </AdStage>
    </Sequence>

    {/* ── fast montage: everything else ── */}
    <Sequence from={starts.mDash} durationInFrames={D.mDash}>
      <AdStage activeTab="dashboard" dur={D.mDash} fadeIn={X} cam={[{ f: 0, s: 1.06 }, { f: D.mDash, s: 1.12 }]}
        lines={[{ at: 6, text: <>Plus orders, clients and revenue — {B('one dashboard')}.</> }]}>
        <Dashboard />
      </AdStage>
    </Sequence>
    <Sequence from={starts.mStock} durationInFrames={D.mStock}>
      <AdStage activeTab="stock" dur={D.mStock} fadeIn={X} cam={[{ f: 0, s: 1.06 }, { f: D.mStock, s: 1.12 }]}
        lines={[{ at: 6, text: <>Stock tracked, with {B('low-stock alerts')}.</> }]}>
        <Stock />
      </AdStage>
    </Sequence>
    <Sequence from={starts.mCut} durationInFrames={D.mCut}>
      <AdStage activeTab="cutlist" dur={D.mCut} fadeIn={X} fadeOut={X} cam={[{ f: 0, s: 1.06 }, { f: D.mCut, s: 1.14 }]}
        lines={[{ at: 6, text: <>And yes — it does your {B('cut lists')} too, optimised in a click.</> }]}>
        <CutList />
      </AdStage>
    </Sequence>

    <Sequence from={starts.outro} durationInFrames={D.outro}>
      <AdOutro dur={D.outro} />
    </Sequence>
  </AbsoluteFill>
);
