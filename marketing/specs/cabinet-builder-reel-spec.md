# Cabinet Builder vertical reel — design spec

30-second 9:16 vertical reel focused on the cabinet builder. Sister piece to
the existing horizontal `CabinetWorkflow` (39s, 16:9). This reel zooms in on
the builder + library narrative for Instagram Reels, TikTok, and YouTube Shorts.

## Constants

- **Aspect**: 9:16 (1080 × 1920)
- **fps**: 30
- **Duration**: 30s = 900 frames
- **Composition id**: `CabinetBuilderReel`
- **Source-of-truth horizontal**: `CabinetWorkflow` (16:9, 1175 frames)

## Visual style — carries forward from horizontal

- Background: `BRAND.ink` (#111111) bleed
- Accent: `BRAND.accent` (#e8a838) — used for clicks, counter, logo `.App` suffix
- App screenshots inside a Mac-style chrome (vertical-resized: `PhoneFrame`)
- Cursor: amber click pulses
- Captions: rounded dark pill, accent dot, bottom-center
- Display type: system-ui at large sizes for cards; consistent with existing scenes

## Scene-by-scene

| # | Scene | Frames | Time | Asset(s) | Movement |
|---|---|---|---|---|---|
| 1 | **Hook** | 0–90 | 0:00–0:03 | none (text only) | Wordmark + tagline title card. `Quote a cabinet without spreadsheets.` |
| 2 | **OpenBuilder** | 90–210 | 0:03–0:07 | `03d-cabinet-editor.png` | Phone-frame snap-in (spring), cursor enters from outside-right, lands on the form |
| 3 | **SpecScroll** | 210–540 | 0:07–0:18 | `sidebar-editor.png` (880×3950) | Smooth top-to-bottom scroll. Section captions ride the scroll: Width → Doors → Drawers → Hardware |
| 4 | **LivePrice** | 540–690 | 0:18–0:23 | none (UI synthesised) | Pull-back to centered price chip. Counter ticks $0 → $1,247. Subtitle: *Priced from your rates.* |
| 5 | **SaveToLibrary** | 690–810 | 0:23–0:27 | `03b-cabinet-library.png` | Save button click pulse → card flies into a 3-card library grid |
| 6 | **Close** | 810–900 | 0:27–0:30 | `logo/logo-primary-white.png` | Logo + tagline + CTA. *Quote, cut, schedule and bill from one place.* |

Total: 900 frames @ 30 fps = 30.0s exactly.

## Copy (locked)

| Slot | Copy |
|---|---|
| Hook title | `Quote a cabinet` *(line 1)* / `without spreadsheets.` *(line 2)* |
| Scene 2 caption | `Open the Cabinet Builder` |
| Scene 3 section captions | `Width & height` → `Doors & drawer fronts` → `Drawer boxes` → `Hardware & extras` |
| Scene 4 headline | `Priced from your rates.` |
| Scene 4 subtitle | `Change a rate, every quote re-prices.` |
| Scene 5 caption | `Save once. Drop into any quote.` |
| Close tagline | `Quote, cut, schedule and bill from one place.` |
| Close URL | `procabinet.app` |

Voice rules from `marketing/specs/brand-voice.md` honoured:
- British English (no curly quotes / em-dashes; uses straight `'` and `.`)
- Concrete (mm, $ amounts, "in any quote")
- No "revolutionary", "streamline", "AI-powered" phrasing
- Sounds like a tradesperson, not a SaaS marketing team

## Audio

**Phase 1 (this scaffold)**: silent. Render outputs visual-only MP4.

**Phase 2 (when user provides)**: drop a track at `marketing/audio/reel-music.mp3`
and flip the `INCLUDE_AUDIO` constant in `remotion/vertical/constants.ts`.
The composition guards the `<Audio>` import behind that flag so missing-file
errors never block a render.

**Beat-sync**: deferred. With no soundtrack, scene boundaries are placed on
narrative beats (hook, reveal, scroll, climax, payoff, close) rather than
musical hits. When music lands, run `scripts/detect-beats.py` from the skill
to align scene cuts to snares; the timing constants in `constants.ts` are
the single source of truth — adjust there and every scene re-flows.

## File layout

```
remotion/
├── Root.tsx                  ← register CabinetBuilderReel + debug comps
├── index.ts                  ← unchanged
├── (existing horizontal files left alone)
└── vertical/
    ├── constants.ts          ← REEL dims, scene timings, BRAND alias, INCLUDE_AUDIO
    ├── PhoneFrame.tsx        ← portrait Mac-style chrome (920×1500, content 920×1444)
    ├── VerticalScreen.tsx    ← Screen.tsx ported to PhoneFrame coords
    ├── VerticalCursor.tsx    ← Cursor.tsx ported to PhoneFrame coords
    ├── Counter.tsx           ← $0 → $1,247 odometer for LivePrice
    ├── BigCaption.tsx        ← large-format caption pill for vertical
    ├── Composition.tsx       ← master that sequences the 6 scenes
    └── scenes/
        ├── Hook.tsx
        ├── OpenBuilder.tsx
        ├── SpecScroll.tsx
        ├── LivePrice.tsx
        ├── SaveToLibrary.tsx
        └── Close.tsx
```

## Public-dir mapping

`remotion/public/` symlinks:
- `screenshots/` → `brand/screenshots/`
- `audio/` → `marketing/audio/`
- `logo/` → `brand/logo/` *(added with this work)*

## Render

```bash
# Studio (live preview)
npm run studio:video
# Then pick CabinetBuilderReel from the composition dropdown.

# Final render
npm run render:reel
# → marketing/videos/cabinet-builder-reel.mp4 (1080×1920, h264, CRF 18)
```

## Horizontal split (1920×1080, one file per section)

A parallel deliverable to the vertical master: each of the 6 scenes rendered
as its own 1920×1080 MP4. Useful for landing-page section cards, ad creative
variants per beat, or feeding individual scenes into a non-linear editor.

### Files

```
remotion/reel-h/
├── constants.ts                    # REEL_H (1920×1080) + scene specs
└── scenes/{Hook,OpenBuilder,SpecScroll,LivePrice,SaveToLibrary,Close}.tsx
```

Each scene reuses the existing horizontal primitives (`BrowserFrame`,
`Screen`, `Cursor`, `Caption` from `remotion/components/`) plus the
`Counter` from `remotion/vertical/`.

### Compositions

Registered in `remotion/Root.tsx` as six standalone (no master):

| Composition id | Duration | Output |
|---|---|---|
| `h-hook` | 90 f / 3 s | `01-hook.mp4` |
| `h-open-builder` | 120 f / 4 s | `02-open-builder.mp4` |
| `h-spec-scroll` | 330 f / 11 s | `03-spec-scroll.mp4` |
| `h-live-price` | 150 f / 5 s | `04-live-price.mp4` |
| `h-save-library` | 120 f / 4 s | `05-save-library.mp4` |
| `h-close` | 90 f / 3 s | `06-close.mp4` |

### Render

```bash
# All 6 in one command (loops through h-* and writes to marketing/videos/reel/)
npm run render:reel-h

# Re-render a single scene
npx remotion render remotion/index.ts h-spec-scroll \
  marketing/videos/reel/03-spec-scroll.mp4
```

Output lands at `marketing/videos/reel/{01..06}-*.mp4`.

### Related: per-scene split of the narration demo

The existing `CabinetWorkflow` (horizontal narration-driven demo) is also
split into per-section files via `w-intro` / `w-rates` / `w-builder` /
`w-spec` / `w-library` / `w-outro` compositions — each with its narration
audio baked in. Render with:

```bash
npm run render:scenes
# → marketing/videos/scenes/{1..6}-*.mp4
```

## Out of scope for this pass

- Beat-sync (deferred until soundtrack chosen)
- VO recording / re-cloning (the existing 02-builder + 03-spec narration is
  reusable but pacing is built for horizontal; vertical version would need
  fresh takes)
- Horizontal sync of any visual fixes that originate here (only relevant when
  the user iterates on shared primitives like Cursor / Caption)

## Acceptance criteria

- [x] Scene-by-scene timing locked in `constants.ts`; total = 900 frames
- [ ] `npm run typecheck` clean on all new files
- [ ] `npm run studio:video` shows `CabinetBuilderReel` + 6 debug comps
  (`reel-hook`, `reel-open-builder`, …)
- [ ] `npm run render:reel` produces a watchable MP4 at 1080×1920
- [ ] Each scene reads cleanly with sound off (the IG/TikTok autoplay reality)
