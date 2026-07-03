# ProCabinet.App — Development Guidelines

## Reference Docs

Read these before making structural decisions or schema changes:

- **`PLAN.md`** — **central planning doc.** All pending work, sub-steps, and status live here. Read first when starting a session.
- **`SPEC.md`** — historical pre-launch refactor spec + decisions log (`§ 13`). Append a one-line entry to `§ 13` for non-obvious mid-task decisions.
- **`SCHEMA.md`** — full database schema with DDL, RLS patterns, and migration order. Source of truth for all tables, columns, and FKs.
- **`~/.claude/plans/item-2-cabinet-quote-unification.md`** — detailed architecture and decision rationale for the in-progress Cabinet Builder/Quote unification (`PLAN.md` references this for sub-step context).
- **`Building Docs/Database_Visual_Guide.docx`** — plain-English version of the schema for non-technical reading.

When a sub-step from `PLAN.md` is completed, mark it ✅ in `PLAN.md` and append a brief summary to `SPEC.md § 13`. When introducing a new pending change, add it to `PLAN.md` with sub-steps before starting work.

## Stack
- `index.html` — markup shell (~800 lines), single `<script type="module" src="/src/main.js">` bridge entry plus ~47 classic `<script defer>` tags for the carved domain files (order matters only for parse-time refs — see the classic-script note below)
- `styles.css` — extracted in Phase 4
- `src/main.js` — ES module bridge: imports `@supabase/supabase-js` + `jspdf` + `jspdf-autotable` from npm and re-exposes them on `window`. Also reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` and stashes them on `window._SBURL` / `window._SBKEY`
- `src/app.js` — bootstrap/orchestration entry (~350 lines: `_requireAuth`, `_userId`, `loadAllData`, `onAuthStateChange`, boot block; was ~10k pre-Phase-E, ~2.3k before the 2026-07-03 file-size pass carved the line editors / auth / realtime / biz-apply out)
- `src/*.js` — ~48 domain files split by feature (Phase E + R.1 cabinet split + the 2026-07-03 completion pass: `line-editor`, `quote-editor`, `stock-persist`, `cutlist-{pdf,layout,edge,render}`). Every file is <1,500 lines (SPEC § 7 target; `cabinet.js` at 1,884 is the one accepted residual). All classic-script-loaded; cross-file references (top-level `let`/`const`/`function`) resolve through the shared global lexical environment. Adding a file = create `src/X.js` + one `<script defer>` tag (vite auto-discovers `src/*.js`)
- `src/database.types.ts` — Supabase row types, generated via the Supabase MCP `generate_typescript_types` tool. Regenerate after schema migrations
- `src/globals.d.ts` — ambient type declarations for `window.*` slots and cross-file globals
- Auth/DB: Supabase (PostgreSQL)
- No frameworks; no ESM in source files (the `main.js` bridge is the only module)
- TypeScript strict mode via `checkJs: true` + JSDoc; `npm run typecheck` is `tsc --noEmit`

## Build & deploy
- `npm run dev` — Vite dev server on port 3000 (auto-loads `.env.local`)
- `npm run build` — produces hashed bundles in `dist/`
- `npm run typecheck` — `tsc --noEmit` under `strict: true` (all 19 src files clean)
- Production hosted on Cloudflare Pages, auto-deploys on push to `main`. Env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) configured in the Cloudflare dashboard
- Local env: copy `.env.example` to `.env.local` (gitignored) and fill in Supabase URL + publishable key

## Session workflow — commits

**Pre-authorized:** create a git commit at the end of every plan's implementation, and another commit for each discrete feature/update completed afterward in the same session. No need to ask first — commits are local and safe.

- One logical change per commit; don't bundle unrelated work into a single commit.
- Use the existing message style: lowercase `type(scope):` prefix where it fits (`feat`, `fix`, `docs`, `refactor`), or `WIP preserve:` for mid-flight checkpoints.
- Always include the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.
- Skip local-only artifacts when staging: `supabase/.temp/`, `dist/`, `.env*`, editor caches. Stage explicit paths instead of `git add -A` when in doubt.
- **Never push without explicit confirmation in chat.** Push to `main` triggers a Cloudflare production deploy. Commits stay on the laptop until the user says "push".

## Library / Data Inputs Pattern

All entity inputs (clients, projects, stock materials) follow a **smart search input** pattern. Never use tabbed library panels, collapsible lists, or inline item lists.

### How it works:
1. **Search input with `+` button** — wrapped in `.smart-input-wrap`:
   - `<input>` with `oninput` calling a suggest function, `onfocus` to show on click, `onblur` to dismiss
   - `.smart-input-add` div (the `+` button) that opens the **full creation popup** for that entity type
2. **Dropdown suggest list** — uses `.client-suggest-list` class:
   - Shows matching items as the user types (search-as-you-type)
   - Each item is a `.client-suggest-item` with an icon, name, and optional metadata
   - Bottom row (`.client-suggest-add`) offers to create a new entry with the typed text
   - Positioned absolutely; use `.suggest-up` class when input is near the bottom of a scrollable container
3. **`+` button opens a full popup** — not a simple prompt, not a nav to another tab:
   - Clients → `_openNewClientPopup(targetInputId)`
   - Projects → `_openNewProjectPopup(targetInputId)`
   - Stock → `_openNewStockPopup()`
   - The popup includes all fields for that entity (same fields as the sidebar form / edit popup)

### Rules:
- No collapsible/accordion library sections
- No tabbed library panels pinned to sidebars
- No inline item lists — the dropdown is the only list, and it appears on focus/type
- The `+` button always opens a **full popup modal** with all fields, never navigates to another tab
- After creating via popup, the input is auto-filled with the new entry name
- Suggest functions: `_smartClientSuggest`, `_smartProjectSuggest`, `_smartCLProjectSuggest`, `_smartCLStockSuggest`

### Example HTML:
```html
<label>Client</label>
<div class="smart-input-wrap">
  <input type="text" id="q-client" placeholder="Search or add client..."
    autocomplete="off"
    oninput="_smartClientSuggest(this,'q-client-suggest')"
    onfocus="_smartClientSuggest(this,'q-client-suggest')"
    onblur="setTimeout(()=>document.getElementById('q-client-suggest').style.display='none',150)">
  <div class="smart-input-add" onclick="_openNewClientPopup('q-client')" title="Add new client">+</div>
</div>
<div id="q-client-suggest" class="client-suggest-list" style="display:none"></div>
```

## Popup Modal System

All entity editing/creation uses popup modals via `_openPopup(html, size)` / `_closePopup()`.

- Sizes: `'sm'`, `'md'`, `'lg'` (or omit for default)
- Read values with `_popupVal(id)` helper
- Structure: `.popup-header` > `.popup-title` + `.popup-close`, `.popup-body` with `.pf` form groups, `.popup-footer`
- GPU compositing: overlay uses `transform: translateZ(0)` for reliable rendering
- Responsive: `max-width: calc(100vw - 32px)` with mobile adjustments at 480px

## UI Conventions

- Cards are clickable (open popup on click), with `cursor: pointer` and hover border highlight
- Footer action buttons use `event.stopPropagation()` to prevent card click
- Toast notifications via `_toast(message, type)` — types: `'success'`, `'error'`
- Confirmation dialogs via `_confirm(message, callback)`
- Import/Export buttons belong in the main content area filter bars, not in sidebars
