# ProCabinet.App — Brand colours

Pulled from `styles.css` so the marketing assets, ad creative and screenshots all stay consistent with the live app.

## Core palette

| Role | Hex | Use |
|---|---|---|
| **Primary accent** (amber) | `#e8a838` | Logo `.App`, CTAs, highlights, brand pop in graphics |
| **Header / hero black** | `#111111` | Logo plate, dark backgrounds, hero panels |
| **Secondary accent** (teal) | `#0d9488` | Charts, secondary CTAs, success-adjacent elements |
| **Success green** | `#3d9970` | Success badges, "approved" states |
| **Danger red** | `#e05252` | Errors, warnings, low-stock alerts |
| **Warn amber** | `#e8a838` | Same as primary — used for warnings too |

## Surface / text (light mode)

| Token | Hex |
|---|---|
| Body bg | `#f2f2f2` |
| Card surface | `#ffffff` |
| Subtle surface | `#f7f7f7` |
| Border | `#e0e0e0` |
| Text | `#111111` |
| Muted text | `#888888` |

## Surface / text (dark mode)

| Token | Hex |
|---|---|
| Body bg | `#141414` |
| Card surface | `#1e1e1e` |
| Border | `#2e2e2e` |
| Text | `#f0f0f0` |
| Muted text | `#666666` |

## Brand pairings (when designing for socials)

- **Hero / impact:** amber `#e8a838` on near-black `#111111`. Use for any "stop the scroll" graphic.
- **Trustworthy / pro:** white `#ffffff` background, black text, amber accent line. Use for stats, testimonials.
- **Workshop / earthy:** off-white `#f5ecd9` warm cream background, black text, walnut `#7a4a1f` accent. Use for founder-story posts.

## Typography

- **System stack:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`
- **Display alternative for marketing:** "Iowan Old Style", "Palatino Linotype", Georgia, serif — gives a classic-trade feel for hero text on social
- **Mono for code/specs:** ui-monospace, SFMono-Regular, Menlo, Consolas, monospace

## Logo files

The full brand kit — logo, the 8 tab icons and the navigation bar — lives in
[`/brand`](../../brand/), generated directly from the live app. The three files
here are the social-ready cuts of the text wordmark:

- `logo.svg` — text wordmark on the dark `#111111` plate (default for posts, presentations)
- `logo-light.svg` — text wordmark on transparent, amber `.App` (use over photos / pale backgrounds)
- `logo-square.svg` — 1024×1024 stacked-wordmark avatar (Instagram profile pic, app icon)
