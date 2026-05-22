import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
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

export const D = {
  intro: 116,
  rates: 96,
  cabinet: 230,
  cutlist: 175,
  stock: 140,
  quotes: 180,
  schedule: 140,
  dashboard: 160,
  outro: 130,
};

const OVERLAP = 12;
const F = {
  intro: 0,
  rates: D.intro - OVERLAP,
};
const after = (from: number, dur: number) => from + dur;
const starts = {
  intro: F.intro,
  rates: F.rates,
  cabinet: after(F.rates, D.rates),
  cutlist: 0,
  stock: 0,
  quotes: 0,
  schedule: 0,
  dashboard: 0,
  outro: 0,
};
starts.cutlist = after(starts.cabinet, D.cabinet);
starts.stock = after(starts.cutlist, D.cutlist);
starts.quotes = after(starts.stock, D.stock);
starts.schedule = after(starts.quotes, D.quotes);
starts.dashboard = after(starts.schedule, D.schedule);
starts.outro = after(starts.dashboard, D.dashboard) - OVERLAP;

export const TOTAL = after(starts.outro, D.outro);

const B = (n: React.ReactNode) => <b style={{ color: C.accent }}>{n}</b>;

// Cursor: appear on the just-clicked tab, then glide to the in-screen interaction.
const tab = (id: any) => tabCenter(id);
const cur = {
  rates: [
    { frame: 0, x: tab('cabinet').x, y: tab('cabinet').y },
    { frame: 6, x: tab('cabinet').x, y: tab('cabinet').y, click: true },
    { frame: 24, x: 384, y: 300 },
    { frame: 30, x: 384, y: 300, click: true },
    { frame: 70, x: 420, y: 360 },
  ],
  cabinet: [
    { frame: 0, x: tab('cabinet').x, y: tab('cabinet').y },
    { frame: 18, x: 360, y: 308 },
    { frame: 26, x: 360, y: 308, click: true },
    { frame: 70, x: 1480, y: 250 },
    { frame: 150, x: 1460, y: 470 },
    { frame: 215, x: 1300, y: 560 },
  ],
  cutlist: [
    { frame: 0, x: tab('cutlist').x, y: tab('cutlist').y },
    { frame: 6, x: tab('cutlist').x, y: tab('cutlist').y, click: true },
    { frame: 14, x: 190, y: 500 },
    { frame: 18, x: 190, y: 500, click: true },
    { frame: 60, x: 820, y: 360 },
    { frame: 150, x: 900, y: 420 },
  ],
  stock: [
    { frame: 0, x: tab('stock').x, y: tab('stock').y },
    { frame: 6, x: tab('stock').x, y: tab('stock').y, click: true },
    { frame: 26, x: 880, y: 470 },
    { frame: 32, x: 880, y: 470, click: true },
    { frame: 90, x: 980, y: 360 },
  ],
  quotes: [
    { frame: 0, x: tab('quotes').x, y: tab('quotes').y },
    { frame: 6, x: tab('quotes').x, y: tab('quotes').y, click: true },
    { frame: 24, x: 1390, y: 600 },
    { frame: 30, x: 1390, y: 600, click: true },
    { frame: 120, x: 1200, y: 560 },
  ],
  schedule: [
    { frame: 0, x: tab('schedule').x, y: tab('schedule').y },
    { frame: 6, x: tab('schedule').x, y: tab('schedule').y, click: true },
    { frame: 30, x: 720, y: 540 },
    { frame: 110, x: 900, y: 480 },
  ],
  dashboard: [
    { frame: 0, x: tab('dashboard').x, y: tab('dashboard').y },
    { frame: 6, x: tab('dashboard').x, y: tab('dashboard').y, click: true },
    { frame: 30, x: 520, y: 320 },
    { frame: 90, x: 1050, y: 600 },
    { frame: 150, x: 900, y: 420 },
  ],
};

export const Master: React.FC = () => (
  <AbsoluteFill style={{ background: '#0d0d0f' }}>
    <Sequence from={starts.intro} durationInFrames={D.intro}><Intro dur={D.intro} /></Sequence>

    <Sequence from={starts.rates} durationInFrames={D.rates}>
      <WalkScene activeTab="cabinet" dur={D.rates} fadeIn={14} cursor={cur.rates} caption={<>I set my rates and times {B('once')}.</>}><MyRates /></WalkScene>
    </Sequence>

    <Sequence from={starts.cabinet} durationInFrames={D.cabinet}>
      <WalkScene activeTab="cabinet" dur={D.cabinet} cursor={cur.cabinet} caption={<>Then the builder prices each cabinet {B('live')}.</>}><CabinetBuilder /></WalkScene>
    </Sequence>

    <Sequence from={starts.cutlist} durationInFrames={D.cutlist}>
      <WalkScene activeTab="cutlist" dur={D.cutlist} cursor={cur.cutlist} caption={<>One click nests the parts — {B('no wasted board')}.</>}><CutList /></WalkScene>
    </Sequence>

    <Sequence from={starts.stock} durationInFrames={D.stock}>
      <WalkScene activeTab="stock" dur={D.stock} cursor={cur.stock} caption={<>And it all pulls from my {B('stock')}.</>}><Stock /></WalkScene>
    </Sequence>

    <Sequence from={starts.quotes} durationInFrames={D.quotes}>
      <WalkScene activeTab="quotes" dur={D.quotes} cursor={cur.quotes} caption={<>Quote to order to invoice — {B('one pipeline')}.</>}><Quotes convertApproved /></WalkScene>
    </Sequence>

    <Sequence from={starts.schedule} durationInFrames={D.schedule}>
      <WalkScene activeTab="schedule" dur={D.schedule} cursor={cur.schedule} caption={<>Production that {B('schedules itself')}.</>}><Schedule /></WalkScene>
    </Sequence>

    <Sequence from={starts.dashboard} durationInFrames={D.dashboard}>
      <WalkScene activeTab="dashboard" dur={D.dashboard} fadeOut={14} cursor={cur.dashboard} caption={<>My whole business, {B('one screen')}.</>}><Dashboard /></WalkScene>
    </Sequence>

    <Sequence from={starts.outro} durationInFrames={D.outro}><Outro dur={D.outro} /></Sequence>
  </AbsoluteFill>
);
