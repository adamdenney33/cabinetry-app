// The four Instagram carousels. Each is a founder-style product walkthrough:
// a hook cover, demo screens built from the live UI components, and a CTA.
import React from 'react';
import { ScreenSlide, InkSlide, Amber } from './slide';
import { Window } from './ui';
import { C } from './theme';
import { FONT } from './fonts';
import { IconStrip } from './chrome';
import { IcoCheck } from './icons';
import { DashboardScreen } from './screens/Dashboard';
import { BuilderScreen, PriceMoneyShot, LibraryScreen } from './screens/Builder';
import { CutListScreen, NestingMoneyShot, DeductPanel } from './screens/CutList';
import { ScheduleScreen, ScheduleCalendar } from './screens/Schedule';
import { QuoteLinesPanel, QuotesScreen } from './screens/Quotes';
import { OrdersScreen } from './screens/Orders';
import { StockScreen } from './screens/Stock';

export type Carousel = { title: string; slides: React.ReactNode[] };

// ── shared slide content ─────────────────────────────────────────
const Cover: React.FC<{ index: number; count: number; kicker: string; title: React.ReactNode; sub: string }> = ({
  index,
  count,
  kicker,
  title,
  sub,
}) => (
  <InkSlide index={index} count={count}>
    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '2.6px', color: C.accent, textTransform: 'uppercase' }}>{kicker}</div>
    <div style={{ fontSize: 82, fontWeight: 900, letterSpacing: '-2.2px', lineHeight: 1.02, color: '#fff', marginTop: 18 }}>{title}</div>
    <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.72)', marginTop: 24, maxWidth: 800, lineHeight: 1.45 }}>{sub}</div>
    <div style={{ marginTop: 48 }}>
      <IconStrip light size={34} />
    </div>
  </InkSlide>
);

const Cta: React.FC<{ index: number; count: number; line: React.ReactNode }> = ({ index, count, line }) => (
  <InkSlide index={index} count={count} last>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '2.4px', color: C.accent, textTransform: 'uppercase' }}>Start free</div>
    <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.04, color: '#fff', marginTop: 16 }}>{line}</div>
    <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 22, lineHeight: 1.5 }}>
      No sign-up. No card. Free forever —<br />5 clients, 5 quotes, 5 orders.
    </div>
    <div style={{ fontSize: 52, fontWeight: 900, color: C.accent, letterSpacing: '-1px', marginTop: 34 }}>ProCabinet.App</div>
  </InkSlide>
);

const Tick: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, fontSize: 22, color: C.text, fontWeight: 600, lineHeight: 1.4 }}>
    <span style={{ flex: 'none', width: 32, height: 32, borderRadius: '50%', background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
      <IcoCheck size={18} color={C.accent} />
    </span>
    <span>{children}</span>
  </div>
);

const Panel: React.FC<React.PropsWithChildren<{ w?: number }>> = ({ children, w = 660 }) => (
  <div style={{ width: w, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: '0 24px 60px rgba(17,17,17,0.16)', padding: 34, fontFamily: FONT }}>{children}</div>
);

const BigStat: React.FC<{ value: string; label: string; color: string }> = ({ value, label, color }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <div style={{ fontSize: 72, fontWeight: 900, color, letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 17, color: C.muted, fontWeight: 600, marginTop: 2 }}>{label}</div>
  </div>
);

// ════════════════════════════════════════════════════════════════
export const CAROUSELS: Record<string, Carousel> = {
  // ── A · Flagship workflow ──────────────────────────────────────
  flagship: {
    title: 'Quote a kitchen in minutes',
    slides: (() => {
      const N = 8;
      return [
        <Cover index={0} count={N} kicker="Product demo" title={<>Quote a kitchen<br />in <Amber>minutes</Amber>.<br />Not hours.</>} sub="The exact workflow I use to price a full custom kitchen — live, in front of you." />,
        <ScreenSlide index={1} count={N} kicker="Dashboard" title={<>Your whole business, <Amber>one screen</Amber></>} sub="Live orders, open quotes and low-stock alerts the moment you log in.">
          <Window active="dashboard"><DashboardScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={2} count={N} kicker="Cabinet builder" title={<>Pick a cabinet. Set <Amber>W × H × D</Amber>.</>} sub="Pull materials, hardware and finishes straight from your stock library.">
          <Window active="cabinet"><BuilderScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={3} count={N} kicker="Live pricing" title={<>It does the maths. <Amber>Live.</Amber></>} sub="Set your rates and times once — every change reprices instantly.">
          <PriceMoneyShot />
        </ScreenSlide>,
        <ScreenSlide index={4} count={N} kicker="Cabinet library" title={<>Save it once. <Amber>Reuse it forever.</Amber></>} sub="Build a library of your go-to cabinets, cut-list parts linked and ready.">
          <Window active="cabinet"><LibraryScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={5} count={N} kicker="Quote" title={<>Every cabinet flows <Amber>into the quote</Amber></>} sub="Cabinets, line items and stock — totalled, taxed and ready to send.">
          <QuoteLinesPanel />
        </ScreenSlide>,
        <ScreenSlide index={6} count={N} kicker="Orders" title={<>One click → <Amber>order to invoice</Amber></>} sub="Convert to an order and track every stage to delivery.">
          <Window active="orders"><OrdersScreen /></Window>
        </ScreenSlide>,
        <Cta index={7} count={N} line={<>Try it <Amber>free</Amber>.</>} />,
      ];
    })(),
  },

  // ── B · Cut List Optimiser ─────────────────────────────────────
  cutlist: {
    title: "Cut sheets that don't waste board",
    slides: (() => {
      const N = 6;
      return [
        <Cover index={0} count={N} kicker="Cut list optimiser" title={<>Stop wasting <Amber>board</Amber>.</>} sub="List your parts once and let the optimiser nest them onto your sheets." />,
        <ScreenSlide index={1} count={N} kicker="Cut parts" title={<>List parts — set <Amber>grain & edges</Amber></>} sub="Pull panels and edge banding from stock, or save reusable parts for repeat cabinets.">
          <Window active="cutlist"><CutListScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={2} count={N} kicker="Optimised nest" title={<>One tap nests <Amber>every panel</Amber></>} sub="The optimiser packs your parts onto the fewest sheets possible.">
          <NestingMoneyShot />
        </ScreenSlide>,
        <ScreenSlide index={3} count={N} kicker="Efficiency" title={<>Less offcut. <Amber>More margin.</Amber></>}>
          <Panel w={680}>
            <div style={{ display: 'flex', gap: 20, marginBottom: 28 }}>
              <BigStat value="72%" label="Sheet 1 used" color={C.green} />
              <div style={{ width: 1, background: C.borderSoft }} />
              <BigStat value="57%" label="Sheet 2 used" color={C.accent} />
              <div style={{ width: 1, background: C.borderSoft }} />
              <BigStat value="2" label="sheets, not 4" color={C.text} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 26 }}>
              <Tick>Grain direction respected on every part</Tick>
              <Tick>Edge banding trimmed to each band's thickness</Tick>
              <Tick>Offcuts minimised — board pays for itself</Tick>
            </div>
          </Panel>
        </ScreenSlide>,
        <ScreenSlide index={4} count={N} kicker="Stock sync" title={<>Then <Amber>deduct from stock</Amber> in one click</>} sub="On-hand figures stay honest as you cut.">
          <DeductPanel />
        </ScreenSlide>,
        <Cta index={5} count={N} line={<>Cut <Amber>smarter</Amber>.</>} />,
      ];
    })(),
  },

  // ── C · Auto-Schedule ──────────────────────────────────────────
  schedule: {
    title: 'Production that schedules itself',
    slides: (() => {
      const N = 5;
      return [
        <Cover index={0} count={N} kicker="Auto-schedule" title={<>Production that<br /><Amber>schedules itself</Amber>.</>} sub="Set your hours and a priority per order — the workshop calendar fills itself in." />,
        <ScreenSlide index={1} count={N} kicker="Priorities" title={<>Set hours + a <Amber>priority</Amber> per job</>} sub="Work is allocated automatically, in line or concurrently.">
          <Window active="schedule"><ScheduleScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={2} count={N} kicker="Auto-allocated" title={<>Your week, <Amber>laid out for you</Amber></>} sub="Every order slotted across your real working hours.">
          <Panel w={760}><ScheduleCalendar /></Panel>
        </ScreenSlide>,
        <ScreenSlide index={3} count={N} kicker="Stay in control" title={<>Overrides + <Amber>overrun tracking</Amber></>}>
          <Panel w={680}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <Tick>Manual overrides for fixed start dates or set durations</Tick>
              <Tick>Auto-schedule works around anything you pin</Tick>
              <Tick>Add time when a job runs over — instantly</Tick>
              <Tick>See exactly where you're losing money</Tick>
            </div>
          </Panel>
        </ScreenSlide>,
        <Cta index={4} count={N} line={<>Never <Amber>double-book</Amber> again.</>} />,
      ];
    })(),
  },

  // ── D · Quote → Invoice pipeline ───────────────────────────────
  pipeline: {
    title: 'From quote to invoice, one pipeline',
    slides: (() => {
      const N = 6;
      return [
        <Cover index={0} count={N} kicker="Quote → invoice" title={<>One pipeline,<br />start to <Amber>finish</Amber>.</>} sub="From the first quote to the final invoice — every job on one connected pipeline." />,
        <ScreenSlide index={1} count={N} kicker="Quote" title={<>Build the quote from <Amber>your library</Amber></>} sub="Cabinets, standard items and stock — totalled and taxed automatically.">
          <QuoteLinesPanel />
        </ScreenSlide>,
        <ScreenSlide index={2} count={N} kicker="Convert" title={<>Approve → <Amber>convert to order</Amber></>} sub="Quotes flow into orders without re-typing a thing.">
          <Window active="quotes"><QuotesScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={3} count={N} kicker="Production" title={<>Track every order, <Amber>every stage</Amber></>} sub="Pro-forma, invoice and work orders — one click each.">
          <Window active="orders"><OrdersScreen /></Window>
        </ScreenSlide>,
        <ScreenSlide index={4} count={N} kicker="Stock" title={<>Backed by a <Amber>live stock library</Amber></>} sub="Every material valued — quotes, cut lists and orders all pull from here.">
          <Window active="stock"><StockScreen /></Window>
        </ScreenSlide>,
        <Cta index={5} count={N} line={<>Run the <Amber>whole job</Amber>.</>} />,
      ];
    })(),
  },
};
