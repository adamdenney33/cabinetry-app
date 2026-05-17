# ProCabinet.App — Brand Assets

The canonical brand kit. Every file here is generated **directly from the live
app** (`index.html` / `styles.css`), so the kit always matches what ships.

Each asset comes as an **`.svg`** master (scalable, recolourable) and a
high-resolution **`.png`** export (drop-in ready, transparent background where
applicable). The PNGs are rasterised from the same SVGs, so they're pixel-consistent.

## Contents

```
brand/
├── logo/                             The ProCabinet.App wordmark, 4 cuts
│   ├── logo-primary-black            mono #111111 — for light backgrounds
│   ├── logo-primary-white            mono #ffffff — for dark backgrounds
│   ├── logo-colour-on-light          black + amber .App — for light backgrounds
│   └── logo-colour-on-dark           white + amber .App — for dark backgrounds (the in-app look)
├── icons/
│   ├── individual/                   the 8 nav-tab icons, one file each
│   ├── icons-only-sheet              all 8 icons on one card  (version 1 — just icons)
│   ├── labelled/                     the 8 icons paired with their tab label
│   ├── icons-labelled-sheet          all 8 labelled lockups on one card  (version 2 — icons with text)
│   └── tab-bar/
│       └── tab-bar-dashboard-active  the full navigation bar, Dashboard active  (version 3)
└── _src/
    └── build.mjs                     generator — regenerates the whole kit
```

## Logo

The app's top-left logo is a **text wordmark** — `ProCabinet.App`, weight 800,
`-0.5px` tracking, system sans-serif. No graphic mark.

| Use | File |
|---|---|
| **Primary** — black & white | `logo-primary-black` (light bg) · `logo-primary-white` (dark bg) |
| Colour — `.App` accented | `logo-colour-on-light` (light bg) · `logo-colour-on-dark` (dark bg) |

The colour cuts render `ProCabinet` in the neutral ink and `.App` in brand amber
`#e8a838` — `logo-colour-on-dark` is exactly how the logo appears in the app header.

## Tab icons — 3 versions

The app has **8 navigation tabs**: Dashboard, Cut List, Cabinet, Stock, Orders,
Quotes, Clients, Schedule.

1. **Just icons** — `icons/individual/*` (8 files) + `icons/icons-only-sheet`.
2. **Icons with text** — `icons/labelled/*` (8 files) + `icons/icons-labelled-sheet`.
3. **Full tab bar** — `icons/tab-bar/tab-bar-dashboard-active`, the complete bar
   in the light theme with the Dashboard tab active.

Icon SVGs ship in `#111111`; recolour by editing the `stroke` attribute.

## Colour & type reference

| Token | Hex | Role |
|---|---|---|
| Ink | `#111111` | Wordmark, icons, text |
| White | `#ffffff` | Reverse ink, active-tab surface |
| Amber (accent) | `#e8a838` | `.App`, badges, highlights |
| Muted | `#888888` | Inactive tab icon/label |
| Tab-bar | `#e2e2e2` | Nav-bar background |
| Border | `#e0e0e0` | Hairlines, active-tab edge |

**Typeface:** system stack — `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`. Wordmark weight 800; tab labels 13px (500 inactive / 700 active).

## Regenerating

If the app's logo or tab bar changes, re-run the generator:

```sh
node brand/_src/build.mjs
```

It rewrites every SVG and PNG here, and refreshes the social-cut logos in
`marketing/assets/`. Requires Google Chrome (used headless to rasterise the PNGs).
