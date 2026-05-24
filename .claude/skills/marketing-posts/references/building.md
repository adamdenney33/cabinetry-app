# Building assets in `remotion-ig/`

Everything is a fresh, self-contained Remotion project under `remotion-ig/`. It shares nothing
with the old `remotion/` folder — never touch that one for marketing.

## File map

```
remotion-ig/
  instagram-entry.ts   registerRoot(InstagramRoot)   — carousels entry  (4:5)
  reel-entry.ts        registerRoot(ReelRoot)         — reels + covers entry (9:16)
  InstagramRoot.tsx    8 carousel <Composition>s, each with inline editable defaultProps
  ReelRoot.tsx         reel + cabinet-reel + cabinet-reel-cover <Composition>s
  carousels.tsx        layout builders for every carousel (Cover, Cta, Tick, Panel, BigStat, Shot…)
  Reel.tsx             9:16 product-overview reel (scenes + timeline)
  CabinetReel.tsx      9:16 Cabinet-tab deep-dive reel
  CabinetReelCover.tsx static 9:16 cover/poster (the thumbnail pattern)
  slide.tsx            the carousel <Slides> frame (sets --pc-accent, BrandProvider)
  brand.tsx            zod schema + BrandProvider/useBrand (accent, betaTag, handle, copy[])
  theme.ts             design tokens (C, W, H, RADIUS, SHADOW)
  fonts.ts             Inter via @remotion/google-fonts; `numeric` tabular-nums style
  chrome.tsx           AppHeader, TabBar (8 nav tabs), IconStrip
  icons.tsx            TAB_ICONS + Ico* line icons (match the app)
  ui.tsx               shared primitives
  screens/             pixel replicas: Builder, CutList, Dashboard, Orders, Quotes, Schedule, Stock
  assets/              real app screenshots (cut-layout, cabinet-sidebar, …) + reel-music.mp3
```

## Design tokens (`theme.ts`)

- **Accent:** `C.accent` = `var(--pc-accent, #e8a838)` (amber). It reads a CSS var so it can be
  retuned live per composition; falls back to `#e8a838` in reels (which don't set the var).
- **Ink/dark:** `C.ink` `#111`. **Light:** `C.bg` `#f2f2f2`, `C.surface` `#fff`,
  `C.border` `#e3e3e3`, `C.tabbar` `#e2e2e2`.
- **Text:** `C.text` `#111`, `C.text2` `#444`, `C.muted` `#8a8a8a`.
- **Semantic:** `C.red` `#e05252`, `C.teal` `#0d9488`, `C.green`, `C.blue`.
- **Geometry:** carousels `W=1080 H=1350` (4:5). Reels/covers `1080×1920` (9:16).
  `RADIUS` (sm/md/lg/xl/window), `SHADOW` (card/window/lift/amber).
- **Type:** Inter (`FONT`). Use `numeric` for any figures so columns align.

## Editable props in Studio (important gotchas)

Studio lets the founder edit on-screen text live, but it's fragile. To keep props editable:

- **`defaultProps` must be inline literals** in `InstagramRoot.tsx` (no `.map()`, no variables,
  no spread). Studio saves edits back to source only when it can statically read the literal.
- **Entry basename must end in `-entry`** (`reel-entry.ts`, `instagram-entry.ts`) so Studio's
  `getRootFileFromEntryPoint` resolves the right Root (otherwise it falls back to the old
  `remotion/Root.tsx`).
- **Use `zTextarea()`** (from `@remotion/zod-types`) for editable strings. Plain `z.string()`
  renders read-only in this build. The schema lives in `brand.tsx`:
  `{ accent: zColor(), betaTag, handle, copy: [{ kicker, title, sub }] }`.
- Studio **auto-saves on field blur** (no Save button). The "render" button is not save.
- Render helpers in copy: `*word*` → amber span; `\n` → line break; `<Dot/>` → amber full stop.

## Build a reel (9:16) — the master

Reels are the master format. Pattern (see `Reel.tsx` / `CabinetReel.tsx`):

- Compose 5–6 `Sequence`s on a timeline: `SHook` → feature beats → `SBreak` (proof/numbers) →
  `SClose` (CTA). Export `<ID>_FPS = 30` and `<ID>_DURATION` (frames).
- **Backgrounds:** `InkBG` (dark, with radial amber/teal glows like the landing page) for
  hook/close; `LightBG` for product scenes. `Pad` for consistent margins. `Wordmark` top.
- **Motion (responsive, landing-page feel):** `Rise` (spring slide-up), `Pop` (spring scale),
  `interpolate` count-ups (e.g. £ and hrs ticking up), `VPan` (slow vertical pan over a tall
  screenshot in a browser frame). Keep pans slow enough to read (e.g. viewH ~1300, pan over
  200+ frames).
- **App fidelity:** use `chrome.tsx` (`TabBar`, `AppHeader`), `screens/*`, `icons.tsx`
  (`TAB_ICONS`) and the real screenshots in `assets/` so it looks exactly like the product.
  When you need a tab area, render the real `TabBar`/sub-tabs (app uses `flex:1`, 13px tabs,
  2px accent underline) rather than approximating.
- **Audio:** `<Audio src={reelMusic}>` with a `volume` fade in/out via `interpolate`. **No
  narration.**
- **Headlines:** 2 short lines, one amber word, amber `<Dot/>`. Sub-line = one plain sentence.
- **Register** in `ReelRoot.tsx`: `<Composition id="…" durationInFrames width={1080} height={1920} fps={30} />`.
- **Preview:** `REEL_ID=<id> node scripts/reel-stills.mjs <frames…>` → `/tmp/reel-<f>.png`,
  then `Read` the PNG. Iterate on stills before rendering video.
- **Studio:** `npm run studio:ig-reel`, then `open -a Safari http://localhost:3000`.
- **Render (only when told):** `node scripts/render-reel.mjs <id>` → `out/instagram/<id>.mp4`.

## Build a carousel (4:5)

- Add a builder in `carousels.tsx` (compose `Cover`, screen panels, `Cta`, etc.). Reuse the
  real `screens/*` and screenshot assets.
- Register a `<Composition>` in `InstagramRoot.tsx` with **inline literal** `defaultProps`
  (`accent`, `betaTag`, `handle`, and a `copy[]` of `{kicker,title,sub}` per slide).
- The number of slides = `durationInFrames` (one frame per slide; the still renderer treats
  frames as slides).
- **Studio:** `npm run studio:ig`. **Render:** `node scripts/render-ig.mjs <id>` →
  `out/instagram/<id>/slide-NN.png` (omit `<id>` to render all). **PDF:** `npm run pdf:ig` →
  `out/instagram/<id>.pdf` (auto-discovers every rendered carousel folder).

## Build a thumbnail / cover (9:16 still)

- Copy the `CabinetReelCover.tsx` pattern: a static component pairing the hook with the
  "money-shot" (e.g. the price breakdown card, numbers matching the reel via `BASE_CAB`),
  wordmark top, footer with the URL. Export `COVER_FPS=30`, `COVER_DURATION=1`.
- Register in `ReelRoot.tsx` as `id="<reel>-cover"`.
- **Render:** `node scripts/render-cover.mjs <id>` → `out/instagram/<id>.png`.
- Leave platform play-buttons off (LinkedIn and Meta overlay their own).

## Build a single image (4:5 or 1:1)

Single posts are static stills. Four styles (the founder approved all four):

1. **Stat / number card** — one metric as hero (e.g. `9.6 hrs · £1,111`). Big `numeric` figure,
   amber accent, one supporting line.
2. **Quote / principle line** — one punchy copy line on `InkBG` or `LightBG`, wordmark, that's it.
3. **App screenshot + caption** — a real `screens/*` panel or screenshot with a short headline.
4. **Reel still reused** — pull a strong frame from a reel (or the cover) as a standalone post.

Implement as a static `<Composition>` (durationInFrames 1) in `ReelRoot.tsx` (for 9:16/1:1) or
`InstagramRoot.tsx` (for 4:5). Render with `render-cover.mjs <id>` (any 9:16/1:1 still) or
`render-ig.mjs <id>` (4:5). For 1:1 use width/height `1080×1080`.

## Standing constraints

- **Safari only** for Studio (default browser may be Arc, which throws a picker). Launch with
  `--no-open`, then `open -a Safari`. One Studio per port 3000 — kill the old one first.
- **Hold final renders** until the user says go. Use stills to preview.
- `out/instagram/` is **gitignored**; commit source only.
- Skip local artifacts when staging (`supabase/.temp/`, `dist/`, `.env*`, stray `marketing/audio/*`).
