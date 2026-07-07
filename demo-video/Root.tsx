import './fonts';
import React from 'react';
import { Composition } from 'remotion';
import { FPS } from './theme';
import { Stage } from './components/Stage';
import { Dashboard } from './app/Dashboard';
import { MyRates } from './app/MyRates';
import { CabinetBuilder } from './app/CabinetBuilder';
import { CutList } from './app/CutList';
import { Stock } from './app/Stock';
import { Quotes } from './app/Quotes';
import { Schedule } from './app/Schedule';
import { Master, TOTAL } from './Master';
import { LandingAd, AD_TOTAL } from './LandingAd';
import { LiveLink } from './scenes/LiveLink';
import { Intro } from './scenes/Intro';
import { Outro } from './scenes/Outro';

const A = '#e8a838';
const dbg = (tab: any, caption: React.ReactNode, content: React.ReactNode): React.FC => () => (
  <Stage activeTab={tab} caption={caption} captionDur={120}>{content}</Stage>
);

const DbgDashboard = dbg('dashboard', <>Your whole business on <b style={{ color: A }}>one screen</b>.</>, <Dashboard />);
const DbgRates = dbg('cabinet', <>Set your rates and times <b style={{ color: A }}>once</b>.</>, <MyRates />);
const DbgCabinet = dbg('cabinet', <>The builder does the <b style={{ color: A }}>maths</b>.</>, <CabinetBuilder />);
const DbgCutList = dbg('cutlist', <>Cut sheets that don't <b style={{ color: A }}>waste board</b>.</>, <CutList />);
const DbgStock = dbg('stock', <>Every material <b style={{ color: A }}>tracked</b>.</>, <Stock />);
const DbgQuotes = dbg('quotes', <>From first quote to final invoice, <b style={{ color: A }}>one pipeline</b>.</>, <Quotes />);
const DbgQuotesConvert = dbg('quotes', <>Convert a quote to an <b style={{ color: A }}>order</b> in one click.</>, <Quotes convertApproved />);
const DbgSchedule = dbg('schedule', <>Production that <b style={{ color: A }}>schedules itself</b>.</>, <Schedule />);

const comp = (id: string, c: React.FC) => <Composition id={id} component={c} durationInFrames={120} fps={FPS} width={1920} height={1080} />;

const IntroDbg: React.FC = () => <Intro dur={180} />;
const DbgLiveLink: React.FC = () => <LiveLink dur={380} />;
const OutroDbg: React.FC = () => <Outro dur={209} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="ProCabinetDemo" component={Master} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="LandingAd" component={LandingAd} durationInFrames={AD_TOTAL} fps={FPS} width={1920} height={1080} />
    <Composition id="Dbg-LiveLink" component={DbgLiveLink} durationInFrames={380} fps={FPS} width={1920} height={1080} />
    <Composition id="Dbg-Intro" component={IntroDbg} durationInFrames={180} fps={FPS} width={1920} height={1080} />
    <Composition id="Dbg-Outro" component={OutroDbg} durationInFrames={209} fps={FPS} width={1920} height={1080} />
    {comp('Dbg-Dashboard', DbgDashboard)}
    {comp('Dbg-Rates', DbgRates)}
    {comp('Dbg-Cabinet', DbgCabinet)}
    {comp('Dbg-CutList', DbgCutList)}
    {comp('Dbg-Stock', DbgStock)}
    {comp('Dbg-Quotes', DbgQuotes)}
    {comp('Dbg-QuotesConvert', DbgQuotesConvert)}
    {comp('Dbg-Schedule', DbgSchedule)}
  </>
);
