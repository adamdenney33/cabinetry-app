---
name: marketing-posts
description: >-
  Create, repurpose and plan on-brand ProCabinet.App social content — Instagram/Facebook
  (Meta) reels (9:16), carousels (4:5), single-image posts, video thumbnails/covers, and
  LinkedIn reposts — built in Remotion from the app's own UI. Use whenever the user wants to
  make, repurpose or plan social posts/reels/carousels/thumbnails for the app: e.g. "make a
  reel", "new carousel", "post about <feature>", "turn this reel into a carousel", "single
  image post", "thumbnail for the video", "write the caption / LinkedIn repost", or "plan a
  series of posts for the grid".
metadata:
  tags: marketing, instagram, linkedin, meta, reels, carousels, thumbnails, remotion, copywriting, social
---

# Marketing posts & reels

End-to-end workflow for ProCabinet.App social marketing: reels, carousels, single images,
thumbnails, captions and LinkedIn reposts — plus repurposing between formats and planning a
series for the Instagram grid. Everything is built in `remotion-ig/` from faithful React
replicas of the app's own UI, so the marketing looks exactly like the product.

**Platforms:** Instagram + Facebook (Meta) and LinkedIn. (TikTok / YT Shorts / X are out of
scope unless asked. Canva is out of scope — the user exports and posts elsewhere.)

## When to use

- Making any post asset: a 9:16 reel, a 4:5 carousel, a single image, or a video thumbnail.
- Writing or revising a caption, or a LinkedIn repost of the same content.
- Repurposing existing content between formats (reel ↔ carousel ↔ single image).
- Planning a batch/series of posts that reads well as an Instagram grid.

## Golden rules (read every time)

These encode the founder's standing preferences. Break them only when the user says so.

1. **Voice is plainspoken, personal and professional — never "AI-sounding."** No em dashes
   (use a comma or full stop), no aphorisms, no rule-of-three filler, no hashtag stuffing.
   British English. Real numbers, no hype. Full detail in `references/voice-and-copy.md`.
2. **Build from the app's real UI.** Use the React replicas and chrome in `remotion-ig/`,
   pixel-faithful to the live app (`index.html` / `styles.css`). **Never reuse the old
   `remotion/` work — only `remotion-ig/`.**
3. **Lean on the landing page.** Take the feature priorities, phrasing and tone from the
   landing page. Reels use dynamic, responsive-feeling motion (spring entrances, live
   count-ups, Ken-Burns / vertical pans) that echo the landing page. **Reels have no
   narration** — music only.
4. **Founder-as-demo framing.** Show what the founder would actually show a customer.
5. **Free tier is the truth:** free to start, **5 of each** library item, no card. Full
   functionality, hard cap. Don't invent feature gates.
6. **Quotes give hours as well as cost.** Always surface time (hrs) alongside price — it's a
   core differentiator.
7. **Brand motif:** amber (`#e8a838`) accent on the one key word per headline, plus the amber
   full stop ("Dot"). Square off corners where the design calls for a cropped-window look.
8. **Cut List angle specifically:** lead with time saved. The USP is that it's connected to
   the stock library and saved cabinets (most shops already own a cut-list tool).
9. **Show, then render.** Build in Studio, verify with stills, and **only render the final
   MP4/PNG when the user says so.** Hold renders otherwise.
10. **Never push to `main` without an explicit OK** (it deploys). Commits are pre-authorised.

## Working style

The founder iterates. Default to producing a strong first draft, show it (a still or the
Studio), then refine. When copy is subjective (titles, hooks, captions), offer 3–4 distinct
options rather than one. Don't over-ask, but do confirm direction at genuine forks.

## The asset types

| Asset | Ratio | Size | Built by | Output |
|---|---|---|---|---|
| Reel (master) | 9:16 | 1080×1920 | `remotion-ig/*Reel.tsx` | `out/instagram/<id>.mp4` |
| Carousel | 4:5 | 1080×1350 | `remotion-ig/carousels.tsx` + `InstagramRoot.tsx` | `out/instagram/<id>/slide-NN.png` + `<id>.pdf` |
| Single image | 4:5 or 1:1 | 1080×1350 / 1080×1080 | a still composition | `out/instagram/<id>.png` |
| Thumbnail / cover | 9:16 | 1080×1920 | `remotion-ig/CabinetReelCover.tsx` pattern | `out/instagram/<id>.png` |

## Reel-first workflow (the master model)

The **reel is the master**. Build it first, then derive the other formats from its scenes.

1. **Brief.** Pick the feature/message (landing-page pillars). Lock: the hook (a question or
   a sharp claim), 4–6 beats, the proof (real numbers, incl. hours), and the CTA.
2. **Build the reel** (9:16) in `remotion-ig/`. See `references/building.md` → Reels.
3. **Derive, in this order:**
   - **Thumbnail/cover** — a 9:16 still pairing the hook with the money-shot (see Building →
     Thumbnails). Doubles as the LinkedIn video thumbnail and the Meta reel cover.
   - **Carousel** — map scenes → slides: hook scene → cover slide, each beat → one slide,
     close → CTA slide. See `references/repurposing-and-series.md`.
   - **Single image(s)** — pull the strongest beat as a stat card, quote line, screenshot, or
     reused reel still.
4. **Captions** — write the IG caption and the LinkedIn repost (`references/voice-and-copy.md`).
5. **Plan the grid** — slot the new covers into the series for contrast + cohesion
   (`references/repurposing-and-series.md` → Series planning).

If the user starts from a carousel or a single idea instead, the same pieces apply — just
convert in whatever direction they ask.

## Commands

Remotion Studio always opens in **Safari** (launched with `--no-open`, then
`open -a Safari http://localhost:3000`). Never Chrome. Only one Studio per port 3000.

```bash
# Studios (edit text/props live; auto-saves on field blur)
npm run studio:ig-reel        # reels + covers   → localhost:3000  (entry: reel-entry.ts)
npm run studio:ig             # carousels        → localhost:3000  (entry: instagram-entry.ts)

# Fast visual checks (no full render)
REEL_ID=<id> node scripts/reel-stills.mjs <frame...>   # → /tmp/reel-<frame>.png

# Final renders (HOLD until the user approves)
node scripts/render-reel.mjs <id>     # one reel  → out/instagram/<id>.mp4   (omit id = all)
node scripts/render-cover.mjs <id>    # thumbnail → out/instagram/<id>.png   (default: cabinet-reel-cover)
node scripts/render-ig.mjs <id>       # one carousel slides → out/instagram/<id>/slide-NN.png (omit id = all)
npm run pdf:ig                         # carousel PDFs → out/instagram/<id>.pdf
```

Renders land in `out/instagram/` which is **gitignored** — assets stay local for the user to
upload. Commit the source (`.tsx` / scripts / captions), never the renders.

## Current inventory

- **Reels:** `reel` (8-tab product overview), `cabinet-reel` (Cabinet-tab deep dive),
  `cabinet-reel-cover` (its thumbnail).
- **Carousels:** `flagship`, `cutlist`, `schedule`, `pipeline`, `eighttabs`, `stock`,
  `rates`, `pricing`.
- **Captions:** `marketing/posts/08-instagram-carousel-captions.md` (IG + LinkedIn, per asset).

## References

- `references/voice-and-copy.md` — tone, caption anatomy, hooks, hashtags, LinkedIn reposts,
  the full do/don't list, landing-page phrasing.
- `references/building.md` — `remotion-ig/` file map, design tokens, editable props, and how
  to build each asset type (reel, carousel, single image, thumbnail) with the exact commands.
- `references/repurposing-and-series.md` — reel → carousel → single derivation, and planning a
  series that looks good on the Instagram grid (contrast + cohesion).
