// The four Instagram carousels — pure LAYOUT now. Each carousel is a list of
// slide "builders": a builder receives the editable copy slot ({kicker,title,
// sub}) for that slide and renders the fixed visual (cover, an app screen, or
// the CTA). The actual text lives in each composition's defaultProps in
// InstagramRoot.tsx, so it's editable + saveable in Remotion Studio.
import React from 'react';
import { ScreenSlide, InkSlide, renderRich } from './slide';
import { Window } from './ui';
import { C } from './theme';
import { FONT } from './fonts';
import { IconStrip } from './chrome';
import { useBrand, Slot } from './brand';
import { IcoCheck } from './icons';
import { DashboardScreen } from './screens/Dashboard';
import { BuilderScreen, PriceMoneyShot, LibraryScreen } from './screens/Builder';
import { CutListScreen, NestingMoneyShot, DeductPanel } from './screens/CutList';
import { ScheduleScreen, ScheduleCalendar } from './screens/Schedule';
import { QuoteLinesPanel, QuotesScreen } from './screens/Quotes';
import { OrdersScreen } from './screens/Orders';
import { StockScreen } from './screens/Stock';

export type Builder = (s: Slot, index: number, count: number) => React.ReactNode;
export type Carousel = { title: string; builders: Builder[] };

// ── slide layouts (text comes from the copy slot) ────────────────
const Cover: React.FC<{ index: number; count: number } & Slot> = ({ index, count, kicker, title, sub }) => (
  <InkSlide index={index} count={count}>
    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '2.6px', color: C.accent, textTransform: 'uppercase' }}>{kicker}</div>
    <div style={{ fontSize: 82, fontWeight: 900, letterSpacing: '-2.2px', lineHeight: 1.02, color: '#fff', marginTop: 18 }}>{renderRich(title)}</div>
    <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.72)', marginTop: 24, maxWidth: 800, lineHeight: 1.45 }}>{renderRich(sub)}</div>
    <div style={{ marginTop: 48 }}>
      <IconStrip light size={34} />
    </div>
  </InkSlide>
);

const Cta: React.FC<{ index: number; count: number } & Slot> = ({ index, count, kicker, title, sub }) => {
  const { handle } = useBrand();
  return (
    <InkSlide index={index} count={count} last>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '2.4px', color: C.accent, textTransform: 'uppercase' }}>{kicker}</div>
      <div style={{ fontSize: 76, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.04, color: '#fff', marginTop: 16 }}>{renderRich(title)}</div>
      <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 22, lineHeight: 1.5 }}>{renderRich(sub)}</div>
      <div style={{ fontSize: 52, fontWeight: 900, color: C.accent, letterSpacing: '-1px', marginTop: 34 }}>{handle}</div>
    </InkSlide>
  );
};

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

// builder helpers
const coverB: Builder = (s, i, n) => <Cover index={i} count={n} {...s} />;
const ctaB: Builder = (s, i, n) => <Cta index={i} count={n} {...s} />;
const screenB =
  (visual: React.ReactNode): Builder =>
  (s, i, n) => (
    <ScreenSlide index={i} count={n} kicker={s.kicker} title={renderRich(s.title)} sub={renderRich(s.sub)}>
      {visual}
    </ScreenSlide>
  );

// fixed feature panels (their bullet copy stays in code)
const cutEfficiency = (
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
);

const scheduleFeatures = (
  <Panel w={680}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <Tick>Manual overrides for fixed start dates or set durations</Tick>
      <Tick>Auto-schedule works around anything you pin</Tick>
      <Tick>Add time when a job runs over — instantly</Tick>
      <Tick>See exactly where you're losing money</Tick>
    </div>
  </Panel>
);

// ════════════════════════════════════════════════════════════════
export const CAROUSELS: Record<string, Carousel> = {
  flagship: {
    title: 'Quote a kitchen in minutes',
    builders: [
      coverB,
      screenB(<Window active="dashboard"><DashboardScreen /></Window>),
      screenB(<Window active="cabinet"><BuilderScreen /></Window>),
      screenB(<PriceMoneyShot />),
      screenB(<Window active="cabinet"><LibraryScreen /></Window>),
      screenB(<QuoteLinesPanel />),
      screenB(<Window active="orders"><OrdersScreen /></Window>),
      ctaB,
    ],
  },
  cutlist: {
    title: "Cut sheets that don't waste board",
    builders: [
      coverB,
      screenB(<Window active="cutlist"><CutListScreen /></Window>),
      screenB(<NestingMoneyShot />),
      screenB(cutEfficiency),
      screenB(<DeductPanel />),
      ctaB,
    ],
  },
  schedule: {
    title: 'Production that schedules itself',
    builders: [
      coverB,
      screenB(<Window active="schedule"><ScheduleScreen /></Window>),
      screenB(<Panel w={760}><ScheduleCalendar /></Panel>),
      screenB(scheduleFeatures),
      ctaB,
    ],
  },
  pipeline: {
    title: 'From quote to invoice, one pipeline',
    builders: [
      coverB,
      screenB(<QuoteLinesPanel />),
      screenB(<Window active="quotes"><QuotesScreen /></Window>),
      screenB(<Window active="orders"><OrdersScreen /></Window>),
      screenB(<Window active="stock"><StockScreen /></Window>),
      ctaB,
    ],
  },
};
