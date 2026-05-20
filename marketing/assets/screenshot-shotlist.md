# Screenshots — what exists and what would be nice to add

> **TL;DR:** 17 captures exist in [`/brand/screenshots/`](../../../brand/screenshots/), at 1280×900 (2× retina) directly from the live app by `brand/_src/shoot.mjs`. 9 base tab/welcome shots + 8 "in use" sub-tab and sidebar-editor shots. Use those.

## What's already in `/brand/screenshots/` (use these)

### Base shots — one per nav tab + the guided-tour welcome

| File | What it shows | Best for |
|---|---|---|
| `01-dashboard.png` | Full dashboard: 6 active orders, 6 recent quotes, stock alerts (3 red flags), 7-day schedule preview, revenue chart, pipeline summary | **Hero shot.** Use in: IG A3 slide 1 · LinkedIn C1 · marketing plan opener · landing page above-the-fold |
| `02-cut-list.png` | Cut List **Library** view — 5 cut lists (Westside 12B, Nair Kitchen, Whitfield, Cole Study, Mitchell) with parts counts, link-to-cabinet badges | IG A3 slide 2 · "every job's cut list, one place" angle |
| `03-cabinet.png` | Cabinet **Quote Builder** — quote list with status badges (Draft / Sent / Approved) and cabinet counts | IG B3 slide 1 · "the cabinets come from your quotes" angle |
| `04-stock.png` | Stock list with low-stock items flagged | IG A3 slide 4 · IG Story Set B frame 5 |
| `05-orders.png` | Orders list with pipeline stages and values | LinkedIn B-set posts about production flow |
| `06-quotes.png` | Quotes tab — 5 quotes with status pipeline (Draft → Sent → Approved), PDF export, Create Order buttons | IG A3 slide 1 · "quote to order in one click" angle |
| `07-clients.png` | Clients list with quote counts and totals | IG / LinkedIn supporting shot |
| `08-schedule.png` | Full Gantt — orders auto-placed across April/May/June 2026, sidebar with active orders + priority steppers + working-hours panel | **The killer shot.** IG A3 slide 3 · IG B2 · LinkedIn C3 · FB/Reddit Option C |
| `tour-welcome.png` | Guided-tour welcome modal | Onboarding posts, "we made it dead simple" angle |

### Sub-tab + sidebar-editor "in use" shots — the depth shots

| File | What it shows | Best for |
|---|---|---|
| `02b-cut-layout.png` | **Cut Layout** sub-tab with an optimised cut list — packed sheets, door/drawer pieces nested, waste % shown, sidebar with the parts/panels editor and **Optimize Cut Layout** CTA | IG B1 (Cut list spotlight) · IG Story Set B frame 3 · FB/Reddit Option C · "wow" frame for the cut list optimiser |
| `03b-cabinet-library.png` | **Cabinet Library** sub-tab — 5 reusable templates (Base, Wall, Drawer, Tall, Corner) with dimensions, prices, Add to Quote / Link to Cutlist actions | IG A3 slide 5 · IG B3 slide 1 |
| `03c-cabinet-rates.png` | **My Rates** sub-tab — the rates editor in the sidebar with Core Rates, Carcass, Door, Drawer Front, Drawer Box sections + per-hour labour | LinkedIn B3 · IG Story Set B frame 6 ("Change a rate, every quote re-prices") |
| `03d-cabinet-editor.png` | Cabinet **editor in use** — QUO-1042 open with the carcass / doors / drawers / hardware spec form in the sidebar, 3 cabinets + prices in the main pane | IG B3 slide 2 · the depth shot of the Cabinet Builder |
| `04b-stock-editor.png` | **Stock sidebar editor in use** — editing 18mm Birch Plywood (qty/low/cost/supplier) with the active row highlighted in the table | IG / LinkedIn supporting shot |
| `05b-order-editor.png` | **Orders sidebar editor in use** — ORD-0312 open with line items, pricing, schedule section, and active order highlighted in the list | LinkedIn B-set, production-flow posts |
| `06b-quote-editor.png` | **Quotes sidebar editor in use** — QUO-1042 open with cabinet + labour line items, tax / discount controls, notes | IG A3 slide 1 alt · "quote to order" angle |
| `07b-client-editor.png` | **Clients sidebar editor in use** — Sarah Mitchell's contact + address + notes in the sidebar, related quotes / orders / cut lists in the main pane | Onboarding / "everything for one client in one place" angle |

## Filename mapping — what the marketing copy references vs. what to actually use

| Marketing copy file references… | Use this file from `/brand/screenshots/` |
|---|---|
| `01-dashboard.png` | `01-dashboard.png` ✅ matches |
| `02-cut-list-layout.png` | `02-cut-list.png` (note: shows Library view, not optimised layout) |
| `03-schedule-gantt.png` | `08-schedule.png` |
| `04-cabinet-editor.png` | `03-cabinet.png` (note: shows Quote Builder, not editor) |
| `05-rates.png` | *(not captured yet — see optional list below)* |
| `06-quote-sidebar.png` | `06-quotes.png` |
| `07-cabinet-library.png` | `03-cabinet.png` (or capture the Library sub-tab) |
| `08-stock-list.png` | `04-stock.png` ✅ same content |
| `09-orders-list.png` | `05-orders.png` ✅ same content |

The naming difference doesn't matter for the copy — the posts only describe what's *in* the picture, not the filename. When you upload, the filename is invisible to viewers.

> The previously-optional detail shots (cut layout, cabinet library, my rates, cabinet editor) are now part of the standard `shoot.mjs` run — see the "Sub-tab + sidebar-editor in use" table above.

## Why use the brand folder rather than duplicating into marketing

Single source of truth. If the UI changes, you re-run `node brand/_src/shoot.mjs` and every marketing post stays in sync with the live app automatically. Copying PNGs into `marketing/assets/screenshots/` would mean two folders to keep aligned.

## Cropping for socials

The brand shots are 1280×900 (≈16:11). For social platforms you'll want square (1:1) or vertical (9:16) crops:

- **Instagram grid (1:1):** crop to a square centred on the most informative panel (e.g. the Gantt portion of `08-schedule.png`, the alerts block of `01-dashboard.png`)
- **Instagram Reels / Stories / TikTok (9:16):** stack two screen crops on a black `#111111` background with the wordmark at the bottom — `assets/logo-square.svg` is the right asset for the bottom logo
- **LinkedIn (1.91:1 or 1:1):** the native shot works without cropping; LinkedIn will display the full 16:10

A 5-minute pass through Canva, Photopea or Photoshop is enough to generate all the crops from each master shot.

## After any UI change

1. `npm run dev`
2. `node brand/_src/shoot.mjs` — re-shoot all 17 captures
3. (Optional) Re-crop social variants in Canva — they only change if the layout shifted significantly
