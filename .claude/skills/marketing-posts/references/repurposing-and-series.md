# Repurposing & series planning

## Reel-first repurposing

The reel is the master. One reel yields a thumbnail, a carousel, and several single images.
The reel's scenes already are the storyboard — reuse them, don't reinvent.

### Reel scene → other formats (mapping)

| Reel scene | Carousel slide | Single image | Thumbnail |
|---|---|---|---|
| Hook (SHook) | Cover slide (same hook) | Quote/principle line | Headline half of the cover |
| Each feature beat | One content slide each | Screenshot + caption | — |
| Proof/breakdown (SBreak) | A "how it adds up" slide | **Stat/number card** (hero) | Money-shot half of the cover |
| Close (SClose) | CTA slide | — | Footer (URL + free-to-start) |

**Worked example — the Cabinet-tab reel** (`cabinet-reel`, scenes: Hook → sub-tabs → My Rates
→ Cabinet Builder → breakdown → close) derives:

- **Thumbnail:** `cabinet-reel-cover` — "What if quoting was this easy?" + the £1,111 / 9.6 hrs
  breakdown card. (Already built.)
- **Carousel (6 slides):** cover (hook) · "one tab, four sub-tabs" · "set rates + times once"
  · "customise every part" · "see how it adds up (9.6 hrs / £1,111)" · CTA.
- **Singles:** stat card (`9.6 hrs · £1,111` to quote a cabinet) · quote line ("Set rates
  once, build, quote, repeat.") · screenshot (Cabinet Builder sidebar) · reel still (the
  sub-tabs frame).

### How to derive each

- **Thumbnail:** copy the `CabinetReelCover.tsx` pattern; pull the same numbers (`BASE_CAB`) so
  it matches the reel. Render with `render-cover.mjs`.
- **Carousel:** add a builder in `carousels.tsx` mirroring the scene copy; register in
  `InstagramRoot.tsx` with inline `copy[]`. The cover slide reuses the hook; each content slide
  reuses one beat's kicker/title/sub; last slide is the CTA. Render + PDF.
- **Single image:** add a static `<Composition>` reusing one scene's hero element (the stat,
  the line, a screen panel, or a reel still). Render with `render-cover.mjs` (9:16/1:1) or
  `render-ig.mjs` (4:5).

### Reverse / sideways

If the user starts from a **carousel**, treat its cover as the reel hook and its slides as the
beats, then build the reel. From a **single idea**, draft the brief first (hook, beats, proof,
CTA) and proceed reel-first. Always keep the copy identical across formats so a viewer sees one
coherent message.

## Series planning for the Instagram grid

Goal (founder's brief): **no rigid repeating pattern. Maximise visual contrast so the feed
isn't one big block, while keeping one cohesive design language.** Rich image covers carry the
contrast; text-only and logo/icon graphics break things up.

### Cohesion (keep constant across every post)

Same brand tokens (`theme.ts`), Inter type, the single-amber-word + amber-`Dot` motif, wordmark
placement, and margins. Every cover should be unmistakably the same brand.

### Contrast (vary these so adjacent tiles differ)

1. **Background:** ink/dark vs light.
2. **Cover type** (rotate these three — this is the main lever):
   - **A — Image/product cover:** rich UI, a screenshot, or a money-shot card (e.g. the reel
     cover). High detail. Carries most posts.
   - **B — Text-only headline graphic:** big type on a plain ink/light field. Minimal, breaks
     up runs of busy image covers.
   - **C — Logo/icon graphic:** wordmark-forward, or the 8-tab `IconStrip` motif. Very clean,
     strong palette block. Use sparingly to punctuate the grid.
3. **Density:** busy (breakdown card) vs clean (one line).

### The planning rule of thumb

Instagram shows 3 per row. Lay the planned posts into a 3-wide grid and check:

- No two **adjacent** tiles (including diagonals) share the same cover type **and** background.
- No full row, and no 2×2 block, is all type-A or all-dark — drop in a B or C to break it.
- Aim for roughly **~60% A / ~25% B / ~15% C** over a run, placed for contrast, not on a fixed
  cycle.
- Each post still maps to a real feature (don't make a graphic with nothing to say).

### Feature pillars (source of truth for "key features")

Pull from the landing page; cover these across a series:

- **Cabinet Builder** — spec a cabinet, it prices live (hours **and** cost).
- **My Rates** — set rates and times once; every quote re-prices.
- **Quote → Order → Invoice pipeline** — one job, one pipeline, nothing re-typed.
- **Cut List** — connected to stock + saved cabinets; **lead with time saved**.
- **Auto-Schedule** — production that schedules itself by priority and due date.
- **Stock** — live library that values materials and deducts as you cut.
- **The OS view** — "Eight connected tabs. One workshop." (Dashboard / Orders / Clients).

### Planner output

Produce a short plan the founder can act on — a table plus a 3-wide "grid preview". For each
post: order, feature/pillar, format (reel / carousel / single), cover type (A/B/C), background
(ink/light), hook line, and which derived assets to make. End with a one-line contrast
rationale ("row 2 alternates dark image, light text, icon graphic so it doesn't read as a
block"). Save it under `marketing/posts/` (e.g. `NN-series-plan.md`) if the user wants it kept.

Don't schedule dates unless asked; the founder posts manually. Cadence/series length is an
input the user provides.
