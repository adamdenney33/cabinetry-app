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
            sub: 'No card. Free forever \n6 Libraries - save up 5 Items in each for free',
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
            title: 'Stop wasting *time*\nand *money*.',
            sub: 'List your parts once, pick your materials from your stock library, and let the optimiser nest them onto your sheets. Link parts to your cabinet library to drop them in to new cut lists.',
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
            sub: 'No card. Free forever \n6 Libraries - save up 5 Items in each for free',
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
            title: 'Production that\n*schedules itself*.',
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
            title: 'Always up to date \n and *on schedule*.',
            sub: 'No card. Free forever \n6 Libraries - save up 5 Items in each for free',
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
            title: 'One pipeline,\nstart to *finish*.',
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
            title: 'Your workshop *OS*.',
            sub: 'No card. Free forever \n6 Libraries - save up 5 Items in each for free',
          },
        ],
      }}
    />
  </>
);
