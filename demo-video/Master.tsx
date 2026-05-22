import React from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile } from 'remotion';
import { C } from './theme';
import { tabCenter } from './components/AppWindow';
import { WalkScene } from './scenes/WalkScene';
import { Intro } from './scenes/Intro';
import { Outro } from './scenes/Outro';
import { MyRates } from './app/MyRates';
import { CabinetBuilder } from './app/CabinetBuilder';
import { CutList } from './app/CutList';
import { Stock } from './app/Stock';
import { Quotes } from './app/Quotes';
import { Schedule } from './app/Schedule';
import { Dashboard } from './app/Dashboard';

// Per-scene voiceover clip lengths in frames (measured from the generated MP3s @30fps).
const VO = {
  intro: 201,
  rates: 251,
  cabinet: 325,
  cutlist: 252,
  stock: 225,
  quotes: 273,
  schedule: 268,
  dashboard: 259,
  outro: 273,
};

const VO_DELAY = 10; // VO starts this many frames into an app scene (lets the screen settle)
const TAIL = 12; // hold after the VO finishes
const OVERLAP = 12; // brand <-> app crossfade

// Scene durations sized to fit their narration.
export const D = {
  intro: VO.intro + 28,
  rates: VO.rates + VO_DELAY + TAIL,
  cabinet: VO.cabinet + VO_DELAY + TAIL,
  cutlist: VO.cutlist + VO_DELAY + TAIL,
  stock: VO.stock + VO_DELAY + TAIL,
  quotes: VO.quotes + VO_DELAY + TAIL,
  schedule: VO.schedule + VO_DELAY + TAIL,
  dashboard: VO.dashboard + VO_DELAY + TAIL,
  outro: VO.outro + 26,
};

const starts = {
  intro: 0,
  rates: D.intro - OVERLAP,
} as Record<string, number>;
starts.cabinet = starts.rates + D.rates;
starts.cutlist = starts.cabinet + D.cabinet;
starts.stock = starts.cutlist + D.cutlist;
starts.quotes = starts.stock + D.stock;
starts.schedule = starts.quotes + D.quotes;
starts.dashboard = starts.schedule + D.schedule;
starts.outro = starts.dashboard + D.dashboard - OVERLAP;

export const TOTAL = starts.outro + D.outro;

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;
const tab = (id: any) => tabCenter(id);

// Cursor keyframes glide from the just-clicked tab to the interaction, then drift
// gently through the rest of the (VO-length) hold so the pointer never freezes.
const cur = {
  rates: [
    { frame: 0, x: tab('cabinet').x, y: tab('cabinet').y },
    { frame: 6, x: tab('cabinet').x, y: tab('cabinet').y, click: true },
    { frame: 26, x: 384, y: 300 },
    { frame: 32, x: 384, y: 300, click: true },
    { frame: 110, x: 360, y: 430 },
    { frame: 200, x: 430, y: 520 },
    { frame: 265, x: 720, y: 360 },
  ],
  cabinet: [
    { frame: 0, x: tab('cabinet').x, y: tab('cabinet').y },
    { frame: 20, x: 360, y: 308 },
    { frame: 28, x: 360, y: 308, click: true },
    { frame: 80, x: 1480, y: 250 },
    { frame: 170, x: 1460, y: 470 },
    { frame: 260, x: 1300, y: 560 },
    { frame: 335, x: 900, y: 470 },
  ],
  cutlist: [
    { frame: 0, x: tab('cutlist').x, y: tab('cutlist').y },
    { frame: 6, x: tab('cutlist').x, y: tab('cutlist').y, click: true },
    { frame: 16, x: 190, y: 500 },
    { frame: 20, x: 190, y: 500, click: true },
    { frame: 70, x: 820, y: 360 },
    { frame: 160, x: 900, y: 430 },
    { frame: 255, x: 650, y: 480 },
  ],
  stock: [
    { frame: 0, x: tab('stock').x, y: tab('stock').y },
    { frame: 6, x: tab('stock').x, y: tab('stock').y, click: true },
    { frame: 28, x: 880, y: 470 },
    { frame: 34, x: 880, y: 470, click: true },
    { frame: 110, x: 980, y: 360 },
    { frame: 200, x: 760, y: 470 },
  ],
  quotes: [
    { frame: 0, x: tab('quotes').x, y: tab('quotes').y },
    { frame: 6, x: tab('quotes').x, y: tab('quotes').y, click: true },
    { frame: 26, x: 1390, y: 600 },
    { frame: 32, x: 1390, y: 600, click: true },
    { frame: 130, x: 1180, y: 560 },
    { frame: 220, x: 700, y: 400 },
    { frame: 285, x: 1100, y: 520 },
  ],
  schedule: [
    { frame: 0, x: tab('schedule').x, y: tab('schedule').y },
    { frame: 6, x: tab('schedule').x, y: tab('schedule').y, click: true },
    { frame: 34, x: 720, y: 540 },
    { frame: 130, x: 900, y: 470 },
    { frame: 220, x: 600, y: 360 },
    { frame: 280, x: 1000, y: 520 },
  ],
  dashboard: [
    { frame: 0, x: tab('dashboard').x, y: tab('dashboard').y },
    { frame: 6, x: tab('dashboard').x, y: tab('dashboard').y, click: true },
    { frame: 32, x: 520, y: 320 },
    { frame: 110, x: 1050, y: 600 },
    { frame: 200, x: 900, y: 420 },
    { frame: 270, x: 520, y: 520 },
  ],
};

const VoClip: React.FC<{ file: string; delay: number }> = ({ file, delay }) => (
  <Sequence from={delay} layout="none">
    <Audio src={staticFile(file)} />
  </Sequence>
);

export const Master: React.FC = () => (
  <AbsoluteFill style={{ background: '#0d0d0f' }}>
    {/* Music bed — low, looped to cover the full runtime */}
    <Audio src={staticFile('music.mp3')} loop volume={0.13} />

    <Sequence from={starts.intro} durationInFrames={D.intro}>
      <Intro dur={D.intro} />
      <VoClip file="vo/01-intro.mp3" delay={14} />
    </Sequence>

    <Sequence from={starts.rates} durationInFrames={D.rates}>
      <WalkScene activeTab="cabinet" dur={D.rates} fadeIn={14} captionDelay={VO_DELAY} cursor={cur.rates} caption={<>Set your labour rate, markups, tax and step times — {B('just once')}.</>}><MyRates /></WalkScene>
      <VoClip file="vo/02-rates.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.cabinet} durationInFrames={D.cabinet}>
      <WalkScene activeTab="cabinet" dur={D.cabinet} captionDelay={VO_DELAY} cursor={cur.cabinet} caption={<>Enter the dimensions, pick materials — every cabinet {B('prices itself live')}.</>}><CabinetBuilder /></WalkScene>
      <VoClip file="vo/03-cabinet.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.cutlist} durationInFrames={D.cutlist}>
      <WalkScene activeTab="cutlist" dur={D.cutlist} captionDelay={VO_DELAY} cursor={cur.cutlist} caption={<>One click nests the parts onto your sheets — {B('with no wasted board')}.</>}><CutList /></WalkScene>
      <VoClip file="vo/04-cutlist.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.stock} durationInFrames={D.stock}>
      <WalkScene activeTab="stock" dur={D.stock} captionDelay={VO_DELAY} cursor={cur.stock} caption={<>Every material is tracked, with {B('low-stock alerts')} to keep costs honest.</>}><Stock /></WalkScene>
      <VoClip file="vo/05-stock.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.quotes} durationInFrames={D.quotes}>
      <WalkScene activeTab="quotes" dur={D.quotes} captionDelay={VO_DELAY} cursor={cur.quotes} caption={<>Track quotes on a pipeline, then {B('convert to an order')} in one click.</>}><Quotes convertApproved /></WalkScene>
      <VoClip file="vo/06-quotes.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.schedule} durationInFrames={D.schedule}>
      <WalkScene activeTab="schedule" dur={D.schedule} captionDelay={VO_DELAY} cursor={cur.schedule} caption={<>Set your hours and priorities — the calendar {B('schedules production for you')}.</>}><Schedule /></WalkScene>
      <VoClip file="vo/07-schedule.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.dashboard} durationInFrames={D.dashboard}>
      <WalkScene activeTab="dashboard" dur={D.dashboard} fadeOut={14} captionDelay={VO_DELAY} cursor={cur.dashboard} caption={<>Orders, quotes, revenue and alerts — your {B('whole business on one screen')}.</>}><Dashboard /></WalkScene>
      <VoClip file="vo/08-dashboard.mp3" delay={VO_DELAY} />
    </Sequence>

    <Sequence from={starts.outro} durationInFrames={D.outro}>
      <Outro dur={D.outro} />
      <VoClip file="vo/09-outro.mp3" delay={10} />
    </Sequence>
  </AbsoluteFill>
);
