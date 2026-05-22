// The four Instagram carousels — pure LAYOUT now. Each carousel is a list of
// slide "builders": a builder receives the editable copy slot ({kicker,title,
// sub}) for that slide and renders the fixed visual (cover, an app screen, or
// the CTA). The actual text lives in each composition's defaultProps in
// InstagramRoot.tsx, so it's editable + saveable in Remotion Studio.
import React from 'react';
import { Img } from 'remotion';
import { ScreenSlide, InkSlide, renderRich } from './slide';
import { Window } from './ui';
import { C } from './theme';
import { FONT } from './fonts';
import { IconStrip } from './chrome';
import { useBrand, Slot } from './brand';
import { IcoCheck } from './icons';
import { DashboardScreen } from './screens/Dashboard';
import { BuilderScreen, PriceMoneyShot } from './screens/Builder';
import { DeductPanel } from './screens/CutList';
// real app screenshots for the cut-list layout (full screen + cropped nest)
import cutLayoutImg from './assets/cut-layout.png';
import cutNestImg from './assets/cut-nest.png';
// real app screenshot of the redesigned cabinet library (template grid)
import cabLibraryImg from './assets/cabinet-library.png';
import cabinetRatesImg from './assets/cabinet-rates.png';
import stockEditorImg from './assets/stock-editor.png';
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

// A real app screenshot in a browser frame (used for the cut-list layout, which
// is shown as the actual app capture rather than a React replica).
const Shot: React.FC<{ src: string; w?: number | string }> = ({ src, w = '100%' }) => (
  <div style={{ width: w, borderRadius: 18, overflow: 'hidden', border: `1px solid ${C.border}`, boxShadow: '0 30px 80px rgba(17,17,17,0.22)', background: C.surface }}>
    <div style={{ height: 38, background: C.surface2, borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((d) => (
        <span key={d} style={{ width: 12, height: 12, borderRadius: '50%', background: d }} />
      ))}
    </div>
    <Img src={src} style={{ width: '100%', display: 'block' }} />
  </div>
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

// "Eight tabs. One workshop." — the landing-page OS showcase
const tabShowcase = (
  <Panel w={800}>
    <IconStrip size={46} />
    <div style={{ display: 'flex', gap: 16, marginTop: 30 }}>
      <BigStat value="8" label="connected tabs" color={C.accent} />
      <div style={{ width: 1, background: C.borderSoft }} />
      <BigStat value="6" label="smart libraries" color={C.accent} />
      <div style={{ width: 1, background: C.borderSoft }} />
      <BigStat value="1" label="place for everything" color={C.accent} />
    </div>
  </Panel>
);

const replaceStack = (
  <Panel w={690}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Tick>Quote, cut, schedule and bill — one place</Tick>
      <Tick>Smart libraries: clients, cabinets, stock &amp; parts</Tick>
      <Tick>The same repeatable system on every job</Tick>
      <Tick>Delegate the admin with confidence</Tick>
    </div>
  </Panel>
);

const stockValue = (
  <Panel w={690}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Tick>Deducts from stock as you build and cut</Tick>
      <Tick>Low-stock alerts surface on the dashboard</Tick>
      <Tick>Total stock value for year-end accounts</Tick>
      <Tick>Feeds quotes, cut lists and orders</Tick>
    </div>
  </Panel>
);

const ratesDelegate = (
  <Panel w={690}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Tick>One source of truth for every price</Tick>
      <Tick>Change a rate — every quote re-prices</Tick>
      <Tick>Hand quoting to an assistant, keep your margins</Tick>
    </div>
  </Panel>
);

const PriceCard: React.FC<{ tier: string; price: string; per: string; sub: string; feats: string[]; flag?: string; hero?: boolean }> = ({ tier, price, per, sub, feats, flag, hero }) => (
  <div style={{ position: 'relative', background: C.surface, border: `1px solid ${hero ? C.accent : C.border}`, borderRadius: 14, padding: '22px 20px', boxShadow: '0 2px 8px rgba(17,17,17,0.06)', display: 'flex', flexDirection: 'column' }}>
    {flag && (
      <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: C.accent, color: '#1a1a1a', fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>{flag}</div>
    )}
    <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: C.muted }}>{tier}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
      <span style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-1px', color: C.text }}>{price}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: C.muted }}>{per}</span>
    </div>
    <div style={{ fontSize: 13, color: C.text2, minHeight: 18, marginTop: 2 }}>{sub}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
      {feats.map((f) => (
        <div key={f} style={{ display: 'flex', gap: 9, fontSize: 14, color: C.text2, lineHeight: 1.35 }}>
          <span style={{ flex: 'none', width: 6, height: 6, borderRadius: '50%', background: C.accent, marginTop: 7 }} />
          {f}
        </div>
      ))}
    </div>
  </div>
);

const pricingCards = (
  <div style={{ width: 840, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, fontFamily: FONT }}>
    <PriceCard tier="Free" price="$0" per="/forever" sub="No card needed" feats={['All core functions', '5 saved items per library', 'ProCabinet branding on PDFs']} />
    <PriceCard tier="Monthly" price="$25" per="/mo" sub="launch price · then $35" feats={['Unlimited saved items', 'Import / export libraries', 'Branding removed from PDFs']} />
    <PriceCard tier="Annual" price="$15" per="/mo" sub="$180 year one · then $300" feats={['Everything in Monthly', 'Best everyday value', 'Priority email support']} />
    <PriceCard tier="Founder" price="$299" per="/once" sub="lifetime access" feats={['Pay once, use forever', 'Everything in the paid plans', 'WhatsApp group with the founder']} flag="Only 50 ever" hero />
  </div>
);

const freeTier = (
  <Panel w={690}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Tick>Free forever — no card needed</Tick>
      <Tick>Every core feature, fully usable</Tick>
      <Tick>5 saved items in each of your 6 libraries</Tick>
      <Tick>Upgrade only when it's paying its way</Tick>
    </div>
  </Panel>
);

const founderHook = (
  <Panel w={620}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: C.accent }}>Founders' lifetime</div>
      <div style={{ fontSize: 120, fontWeight: 900, color: C.accent, letterSpacing: '-4px', lineHeight: 1, marginTop: 10 }}>50</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>seats. Ever.</div>
      <div style={{ fontSize: 36, fontWeight: 900, color: C.text, marginTop: 22 }}>$299 <span style={{ fontSize: 17, color: C.muted, fontWeight: 600 }}>once</span></div>
      <div style={{ fontSize: 16, color: C.text2, marginTop: 6 }}>Same price as one year — used forever.</div>
    </div>
  </Panel>
);

// ════════════════════════════════════════════════════════════════
export const CAROUSELS: Record<string, Carousel> = {
  flagship: {
    title: 'Quote a kitchen in minutes',
    builders: [
      coverB,
      screenB(<Window active="cabinet"><BuilderScreen /></Window>),
      screenB(<PriceMoneyShot />),
      screenB(<Shot src={cabLibraryImg} />),
      screenB(<QuoteLinesPanel />),
      screenB(<Window active="orders"><OrdersScreen /></Window>),
      screenB(<Window active="dashboard"><DashboardScreen /></Window>),
      ctaB,
    ],
  },
  cutlist: {
    title: "Cut sheets that don't waste board",
    builders: [
      coverB,
      screenB(<Shot src={cutLayoutImg} />),
      screenB(<Shot src={cutNestImg} w={700} />),
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
  eighttabs: {
    title: 'Eight tabs. One workshop.',
    builders: [
      coverB,
      screenB(tabShowcase),
      screenB(<Window active="dashboard"><DashboardScreen /></Window>),
      screenB(replaceStack),
      ctaB,
    ],
  },
  stock: {
    title: 'Every material, tracked',
    builders: [
      coverB,
      screenB(<Window active="stock"><StockScreen /></Window>),
      screenB(<Shot src={stockEditorImg} />),
      screenB(stockValue),
      ctaB,
    ],
  },
  rates: {
    title: 'Set your rates once',
    builders: [
      coverB,
      screenB(<Shot src={cabinetRatesImg} />),
      screenB(<PriceMoneyShot />),
      screenB(ratesDelegate),
      ctaB,
    ],
  },
  pricing: {
    title: 'Pricing that fits a small shop',
    builders: [
      coverB,
      screenB(pricingCards),
      screenB(freeTier),
      screenB(founderHook),
      ctaB,
    ],
  },
};
