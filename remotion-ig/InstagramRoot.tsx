// Registers one Composition per carousel. Each slide is a still: durationIn
// Frames == slide count, fps 1, so frame N renders slide N.
//
// All editable content lives in each Composition's INLINE defaultProps (accent
// colour, BETA tag, CTA handle, and `copy` — one {kicker,title,sub} per slide).
// Inlined literals are required for Remotion Studio to make the props panel
// editable AND saveable. In title/sub, *asterisks* = accent-amber, Enter = line
// break. The visuals live in carousels.tsx (pure layout builders).
import React from 'react';
import { Composition, useCurrentFrame } from 'remotion';
import { W, H } from './theme';
import { CAROUSELS } from './carousels';
import { Brand, brandSchema, BrandProvider, EMPTY_SLOT } from './brand';

const Slides: React.FC<{ id: string } & Brand> = ({ id, accent, betaTag, handle, copy }) => {
  const frame = useCurrentFrame();
  const builders = CAROUSELS[id].builders;
  const i = Math.min(frame, builders.length - 1);
  const slot = copy[i] ?? EMPTY_SLOT;
  return (
    <BrandProvider value={{ accent, betaTag, handle, copy }}>
      {/* display:contents = no layout box; just cascades --pc-accent to the slide */}
      <div style={{ display: 'contents', ['--pc-accent' as string]: accent } as React.CSSProperties}>
        {builders[i](slot, i, builders.length)}
      </div>
    </BrandProvider>
  );
};

const Flagship: React.FC<Brand> = (p) => <Slides id="flagship" {...p} />;
const CutList: React.FC<Brand> = (p) => <Slides id="cutlist" {...p} />;
const Schedule: React.FC<Brand> = (p) => <Slides id="schedule" {...p} />;
const Pipeline: React.FC<Brand> = (p) => <Slides id="pipeline" {...p} />;
const EightTabs: React.FC<Brand> = (p) => <Slides id="eighttabs" {...p} />;
const Stock: React.FC<Brand> = (p) => <Slides id="stock" {...p} />;
const Rates: React.FC<Brand> = (p) => <Slides id="rates" {...p} />;
const Pricing: React.FC<Brand> = (p) => <Slides id="pricing" {...p} />;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="flagship"
      component={Flagship}
      schema={brandSchema}
      durationInFrames={CAROUSELS.flagship.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          {
            kicker: 'Product demo',
            title: 'Quote custom \n cabinetry *in minutes*\n... not hours',
            sub: 'The workflow you need to price a full custom cabinetry project - from quote to production',
          },
          {
            kicker: 'Cabinet builder',
            title: 'Pick a cabinet. Set *W × H × D*.',
            sub: 'Pull materials, hardware and finishes straight from your stock library.',
          },
          {
            kicker: 'Live pricing',
            title: 'It does the maths. *Live.*',
            sub: 'Set your rates and times once — every change reprices instantly.',
          },
          {
            kicker: 'Cabinet library',
            title: 'Save it once. *Reuse it forever.*',
            sub: 'Reusable cabinet templates — parts linked to the cut list, drop into any quote.',
          },
          {
            kicker: 'Quote',
            title: 'Every cabinet flows *into the quote*',
            sub: 'Cabinets, line items and stock — totalled, taxed and ready to send.',
          },
          {
            kicker: 'Orders',
            title: 'One click → *order to invoice*',
            sub: 'Convert to an order and track every stage to delivery.',
          },
          {
            kicker: 'Dashboard',
            title: 'Your whole business, *one screen*',
            sub: 'Live orders, open quotes and low-stock alerts — your whole shop at a glance.',
          },
          {
            kicker: 'Start free',
            title: 'Try it *free*.',
            sub: 'No card. Free forever \n8 connected tabs 6 smart libraries\nSave 5 Items in each library for free',
          },
        ],
      }}
    />
    <Composition
      id="cutlist"
      component={CutList}
      schema={brandSchema}
      durationInFrames={CAROUSELS.cutlist.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          {
            kicker: 'Cut list optimiser',
            title: 'Stop wasting *time*\nand *materials*.',
            sub: 'List your parts once, pick your materials from your stock library, and let the optimiser nest them onto your sheets. ',
          },
          {
            kicker: 'Cut parts',
            title: 'List parts with *grain + edge banding*',
            sub: 'Pull panels and edge banding from stock, or save reusable parts for repeat cabinets.',
          },
          {
            kicker: 'Optimised nest',
            title: 'One tap nests *every panel*',
            sub: 'The optimiser packs your parts onto the fewest sheets possible.',
          },
          { kicker: 'Efficiency', title: 'Less offcut. *More margin.*', sub: '' },
          {
            kicker: 'Stock sync',
            title: 'Then *deduct from stock* in one click',
            sub: 'On-hand figures stay honest as you cut.',
          },
          {
            kicker: 'Start free',
            title: 'Cut *smarter*.',
            sub: 'No card. Free forever \n8 connected tabs 6 smart libraries\nSave 5 Items in each library for free',
          },
        ],
      }}
    />
    <Composition
      id="schedule"
      component={Schedule}
      schema={brandSchema}
      durationInFrames={CAROUSELS.schedule.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          {
            kicker: 'Auto-schedule',
            title: 'Always up to date \n and *on schedule*.',
            sub: 'Set your hours and a priority per order — the workshop calendar fills itself in.',
          },
          {
            kicker: 'Priorities',
            title: 'Set hours + a *priority* per job',
            sub: 'Work is allocated automatically, in line or concurrently.',
          },
          {
            kicker: 'Auto-allocated',
            title: 'Your week, *laid out for you*',
            sub: 'Every order slotted across your real working hours.',
          },
          { kicker: 'Stay in control', title: 'Overrides + *overrun tracking*', sub: '' },
          {
            kicker: 'Start free',
            title: 'Production that\n*schedules itself*.',
            sub: 'No card. Free forever \n8 connected tabs 6 smart libraries\nSave 5 Items in each library for free',
          },
        ],
      }}
    />
    <Composition
      id="pipeline"
      component={Pipeline}
      schema={brandSchema}
      durationInFrames={CAROUSELS.pipeline.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          {
            kicker: 'Quote → invoice',
            title: 'Your workshop *OS*.',
            sub: 'From the first quote to the final invoice — every job on one connected pipeline.',
          },
          {
            kicker: 'Quote',
            title: 'Build the quote from *your library*',
            sub: 'Cabinets, standard items and stock — totalled and taxed automatically.',
          },
          {
            kicker: 'Convert',
            title: 'Approve → *convert to order*',
            sub: 'Quotes flow into orders without re-typing a thing.',
          },
          {
            kicker: 'Production',
            title: 'Track every order, *every stage*',
            sub: 'Pro-forma, invoice and work orders — one click each.',
          },
          {
            kicker: 'Stock',
            title: 'Backed by a *live stock library*',
            sub: 'Every material valued — quotes, cut lists and orders all pull from here.',
          },
          {
            kicker: 'Start free',
            title: 'One pipeline,\nstart to *finish*.',
            sub: 'No card. Free forever \n8 connected tabs 6 smart libraries\nSave 5 Items in each library for free',
          },
        ],
      }}
    />
    <Composition
      id="eighttabs"
      component={EightTabs}
      schema={brandSchema}
      durationInFrames={CAROUSELS.eighttabs.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          { kicker: 'The workshop OS', title: 'Eight tabs.\n*One workshop*.', sub: 'Quote, cut, schedule and bill — all one click apart.' },
          { kicker: 'One place for everything', title: 'The nav you use *every day*', sub: '8 connected tabs, 6 smart libraries, 1 place for everything.' },
          { kicker: 'Dashboard', title: 'Your whole business, *one screen*', sub: 'Orders, quotes and low-stock alerts the moment you log in.' },
          { kicker: 'One system', title: 'Replace your *spreadsheets & post-its*', sub: '' },
          { kicker: 'Start free', title: 'Your workshop *OS*.', sub: 'No card. Free forever — 5 of each, in every library.' },
        ],
      }}
    />
    <Composition
      id="stock"
      component={Stock}
      schema={brandSchema}
      durationInFrames={CAROUSELS.stock.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          { kicker: 'Stock', title: 'Every material, *tracked*.', sub: 'And fed straight into quotes, cut lists and orders.' },
          { kicker: 'Stock library', title: 'One library, *every material*', sub: 'Sheet goods, hardware, edge banding and finishes.' },
          { kicker: 'Reorder points', title: 'Never run out *mid-job*', sub: 'Set a low-stock alert quantity on each item.' },
          { kicker: 'Honest figures', title: 'Stock that *pays its way*', sub: '' },
          { kicker: 'Start free', title: 'Keep your numbers *honest*.', sub: 'No card. Free forever — 5 of each, in every library.' },
        ],
      }}
    />
    <Composition
      id="rates"
      component={Rates}
      schema={brandSchema}
      durationInFrames={CAROUSELS.rates.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          { kicker: 'My Rates', title: 'Set your rates *once*.', sub: 'Labour, markup, tax and times — entered one time.' },
          { kicker: 'My Rates', title: 'Your numbers, *in one place*', sub: 'Labour rate, material markup, tax and contingency.' },
          { kicker: 'Live pricing', title: 'Change a rate — *every quote re-prices*', sub: 'No spreadsheet formulas to maintain.' },
          { kicker: 'Delegate with confidence', title: 'Anyone can *quote it right*', sub: '' },
          { kicker: 'Start free', title: 'Quote in *minutes, not hours*.', sub: 'No card. Free forever — 5 of each, in every library.' },
        ],
      }}
    />
    <Composition
      id="pricing"
      component={Pricing}
      schema={brandSchema}
      durationInFrames={CAROUSELS.pricing.builders.length}
      fps={1}
      width={W}
      height={H}
      defaultProps={{
        accent: '#e8a838',
        betaTag: 'BETA v0.12.0',
        handle: 'ProCabinet.App',
        copy: [
          { kicker: 'Pricing', title: 'Pricing that fits\n*a small shop*.', sub: 'Start free. Go Pro when it pays its way.' },
          { kicker: 'Plans', title: 'Free, Pro, or *Founder*', sub: 'Free forever, or unlimited from $15/mo.' },
          { kicker: 'Free forever', title: 'Everything, *5 of each*', sub: '' },
          { kicker: "Founders' lifetime", title: 'Only *50 seats*. Ever.', sub: '' },
          { kicker: 'Start free', title: 'Built by a maker,\n*for makers*.', sub: 'No card needed. Try it free.' },
        ],
      }}
    />
  </>
);
