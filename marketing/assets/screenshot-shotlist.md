# Screenshots — what exists and what would be nice to add

> **TL;DR:** The 8 tab overview shots already exist in [`/brand/screenshots/`](../../../brand/screenshots/), captured at 1440×900 (2× retina) directly from the live app by `brand/_src/shoot.mjs`. Use those. Three optional detail captures would make a few specific posts hit harder; the script makes regeneration trivial.

## What's already in `/brand/screenshots/` (use these)

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

## Optional — 3 detail shots that would strengthen specific posts

These aren't in `/brand/screenshots/` yet. Add them by editing `brand/_src/shoot.mjs` to navigate to the right sub-view before capturing, or capture manually and drop alongside the existing files.

| Proposed filename | Why it matters | Marketing copy that wants it |
|---|---|---|
| `02b-cut-list-layout.png` | The optimised sheet layout with nested pieces, waste % visible. The "wow" frame for the cut list optimiser. | IG B1 (Cut list spotlight) · IG Story Set B frame 3 · FB/Reddit Option C |
| `03b-cabinet-editor.png` | A cabinet open in the editor showing carcass / doors / drawers / hardware spec + live pricing. The depth shot. | IG B3 slide 2 |
| `03c-cabinet-library.png` | The Cabinet → Library sub-tab showing template cards (Base 600, Wall 600, Drawer 800). | IG A3 slide 5 · IG B3 slide 1 |
| `03d-rates.png` | The My Rates panel — labour, markup, edge banding, contingency inputs. | LinkedIn B3 · IG Story Set B frame 6 ("Change a rate, every quote re-prices") |

To capture: extend `brand/_src/shoot.mjs` with steps that switch to the Cut Layout view (`switchCLMainView('layout')`), open a cabinet card, and switch to the Library / Rates sub-tabs before each capture. The hooks already exist in `walkthrough.js` for the same navigation.

## Why use the brand folder rather than duplicating into marketing

Single source of truth. If the UI changes, you re-run `node brand/_src/shoot.mjs` and every marketing post stays in sync with the live app automatically. Copying PNGs into `marketing/assets/screenshots/` would mean two folders to keep aligned.

## Cropping for socials

The brand shots are 1440×900 (16:10). For social platforms you'll want square (1:1) or vertical (9:16) crops:

- **Instagram grid (1:1):** crop to a square centred on the most informative panel (e.g. the Gantt portion of `08-schedule.png`, the alerts block of `01-dashboard.png`)
- **Instagram Reels / Stories / TikTok (9:16):** stack two screen crops on a black `#111111` background with the wordmark at the bottom — `assets/logo-square.svg` is the right asset for the bottom logo
- **LinkedIn (1.91:1 or 1:1):** the native shot works without cropping; LinkedIn will display the full 16:10

A 5-minute pass through Canva, Photopea or Photoshop is enough to generate all the crops from each master shot.

## After any UI change

1. `npm run dev`
2. `node brand/_src/shoot.mjs` — re-shoot all 8 tabs
3. (Optional) Re-crop social variants in Canva — they only change if the layout shifted significantly
