# Series plan — 9 posts (one full grid)

A full grid screen (3 wide) covering the feature pillars from the landing page.
Built for strong visual contrast (image / text-only / icon covers) on one cohesive
design language. Instagram + LinkedIn. Post in number order, top-left first.

## Cover-type key

- **A — image / product cover.** Rich UI, a screenshot, or a money-shot card. Carries most posts.
- **B — text-only headline.** Big type on a plain field. Breaks up runs of busy image covers.
- **C — logo / icon cover.** Wordmark or the 8-tab icon strip. Clean palette block, used to punctuate.

Cohesion held constant on every post: Inter type, amber (#e8a838) accent on the one
key word + the amber full stop, wordmark placement, the same margins and tokens.

## The grid

```
 1 Cut List        2 My Rates        3 Cabinet
   A · ink            B · light         A · ink

 4 Auto-Schedule   5 Eight tabs      6 Pipeline
   A · light          C · ink           A · light

 7 Dashboard       8 Stock           9 Free to start
   A · ink            B · light         C · light
```

## The posts

| # | Pillar | Format | Cover | BG | Hook (on-cover) |
|---|--------|--------|-------|----|-----------------|
| 1 | Cut List | **Reel** (master) | A | ink | Still drawing cut lists by hand? |
| 2 | My Rates | Single (text) | B | light | Set your rates once. |
| 3 | Cabinet Builder | Reel (have it) | A | ink | Price a cabinet to the penny. |
| 4 | Auto-Schedule | Carousel | A | light | Production that schedules itself. |
| 5 | The eight tabs | Single / Reel (have it) | C | ink | Eight tabs. One workshop. |
| 6 | Quote → Order → Invoice | Carousel | A | light | One job, one pipeline. |
| 7 | Dashboard | Single | A | ink | Your whole shop on one screen. |
| 8 | Stock | Single (stat) | B | light | Stock that stays honest. |
| 9 | Free tier | Single (CTA) | C | light | Free to start. 5 of each. No card. |

### Per-post detail

**1 · Cut List — reel (the one we build first).** Lead with time saved. The USP is that
it is connected to your stock library and saved cabinets, most shops already own a
cut-list tool. Beats: pull your parts from the library, nest the sheets in seconds,
real result (29 parts, 2 sheets, 72% / 57% used), deduct from stock in one click.
Derives: thumbnail, a 6-slide carousel, 2 single images (a stat card + the nested-sheet
still), IG caption, LinkedIn repost.

**2 · My Rates — single, text-only.** "Set your rates once." Sub: then every quote prices
itself, labour, hours, markup and tax. Plain type, no UI, lets the busy covers either side
breathe.

**3 · Cabinet Builder — reel (already built: `cabinet-reel` + `cabinet-reel-cover`).**
"Price a cabinet to the penny." 9.6 hrs and £1,111, hours as well as cost. Slots straight
into the grid, nothing new to build.

**4 · Auto-Schedule — carousel.** Landing line: production that schedules itself. Set your
hours and a priority, it books the work in, in line or concurrently. Add time when a job
runs over and see where you are losing money.

**5 · The eight tabs — single (or reuse `reel`).** "Eight tabs. One workshop." The icon
strip as the hero. Quote, cut, schedule and bill from one place. The cleanest tile in the
grid, a deliberate palette break in the centre.

**6 · Quote → Order → Invoice — carousel.** One job on one pipeline, nothing re-typed.
Build a quote from cabinets and stock, convert to an order, track every stage, export the
PDF. (Existing `pipeline` carousel can seed this.)

**7 · Dashboard — single.** Your whole shop on one screen: quotes, orders, revenue, the
next 7 days, low-stock alerts. A real screenshot with one short headline.

**8 · Stock — single, stat.** "Stock that stays honest." It values every material and
deducts as you cut, so on-hand figures and your year-end numbers stay current.

**9 · Free to start — single, CTA closer.** "Free to start. 5 of each. No card." Built by
a cabinet maker, for cabinet makers. Wordmark-forward, the sign-off tile, points at
procabinet.app.

## Why this order reads well on the grid

No two touching tiles (including diagonals) share the same cover type and background, so
the feed never reads as one block. The mix is 5 image, 2 text, 2 icon (about 56 / 22 / 22).

- **Row 1** goes image-ink, text-light, image-ink, so it alternates straight away.
- **Row 2** puts the clean icon cover (eight tabs) dead centre as the anchor, with a light
  image either side.
- **Row 3** lands image-ink, text-light, icon-light, so it doesn't echo row 1.
- Ink and light tiles interleave in a loose checkerboard, never two darks side by side.
- Text-only posts (2, 8) sit on opposite corners, so the quiet tiles are spread out.
- The two icon covers (5, 9) are far apart and on different backgrounds.

Every tile still maps to a real feature, nothing is a graphic with nothing to say.
Existing assets cover posts 3, 5 and 6, so only 1, 2, 4, 7, 8, 9 are new builds.
