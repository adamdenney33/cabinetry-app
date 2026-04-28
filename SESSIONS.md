# ProCabinet.App — Session Log

---

## Session 1 (approx. Mar 26 2026)

### Work done
- Rebrand to ProCabinet.App with monochrome UI and dark mode toggle
- Added Chrome-style tabs with SVG icons and settings dropdown
- Reordered tabs: Cut List first, circular saw blade icon
- Unified header buttons (same height, person icon for account)
- Metric/imperial switch that converts all cutlist dimensions
- Settings redesign: Dark/Light Mode, Units, Currency toggles
- Moved Pro Plan to account dropdown

---

## Session 2 (approx. Mar 26 2026)

### Work done
- Redesigned cutlist inputs as inline spreadsheet tables
- Added spreadsheet-style features:
  - Colour dot toggles part on/off
  - Eye icon toggles sheet panels on/off
  - Grain direction cycles (none → horizontal → vertical)
  - Stock panel dropdown per part row
  - Custom +/− quantity steppers
  - Alternating row shading
  - Tab/Enter keyboard nav, new row at end
  - Paste TSV data from spreadsheet apps
  - Fraction input (1 1/2) and math expressions (562+25)
  - CSV export/import + blank template download
  - Column visibility toggles for Grain and Material columns
- Layout view improvements:
  - Pastel printer-friendly colours
  - Grain lines matching grain direction
  - Zoom in/out/fit controls
  - Colour and grain line toggles
  - Font size A− / A+ buttons
  - Dimension lines with tick marks
  - PDF print button

---

## Session 3 (approx. Mar 26 2026)

### Work done
- Added missing cutlist features:
  - Drag handles on every row (⠿) — reorder parts/panels
  - Resizable left panel (drag divider)
  - Label column toggle pill
  - Rotate layout button (swaps sheet orientation 90°)
  - Pages per sheet select (1/2/4)
  - Grain lines and rotate use rotated piece coords correctly
- Settings bar redesign:
  - Units as compact in/mm pill toggle
  - Kerf input inline alongside units
  - CSV import/export as icon-only buttons
  - Grain column header uses SVG lines icon

---

## Session 4 (Mar 26–27 2026)

### Work done
- Added Dashboard tab (positioned after Orders, then moved to sit directly next to Orders)
- Dashboard renders:
  - KPI row: Pipeline value, Revenue, Quoted total, Stock value
  - Orders by Status breakdown (coloured dots + counts)
  - Active Orders card (top 5, with client/due/value/status badge)
  - Stock Alerts card (low stock items)
  - Recent Quotes card (last 3)
  - Production Pipeline progress bars

---

## Session 5 (Mar 27 2026)

### Work done
- Fixed dev server setup (preview tool sandbox can't access ~/Documents; server runs from /tmp/cabinetry_www with auto file watcher syncing changes)
- Fixed `--accent2` CSS variable missing — delivery status dot/step colour was invisible
- Added data persistence via localStorage — orders, quotes, and stock now survive page refresh
- Added "→ Order" button on quotes — converts a quote to a confirmed order in one click (marks quote as Approved, pre-fills order value from quote total)
- Dashboard moved to sit directly next to Orders in the nav bar

### Known issues / notes
- Dev server workaround: preview tool cannot access macOS ~/Documents folder due to sandbox restrictions. File watcher copies index.html to /tmp/cabinetry_www on every save.
- Run watcher manually each session: `python3 /tmp/cabinetry_watch.py &`

---

## Session 6 (Mar 28 2026)

### Work done
- **Printable quote**: `printQuote(id)` opens a formatted HTML document in a new tab and triggers print/PDF. Quote shows business name, phone, email from Settings.
- **Duplicate quote**: `⧉ Copy` button on each quote card.
- **Inline edit all quote fields**: project name, client, notes all contenteditable directly on the card. Actions moved to a footer row (Mark Sent, → Order, ⎙ Print, ⧉ Copy).
- **Business Info in Settings**: Business Name, Phone, Email — saved to `localStorage`, used in printed quote header.
- **Order notes visible**: notes field now saved when creating an order (was clearing but not saving). Shown on card as italic text, also inline-editable.
- **Overdue order detection**: orders with a past due date get a red left border + "Overdue" badge. Detected in both order cards and dashboard Active Orders list.
- **Order inline editing**: project name and client name now contenteditable on the order card (was only value/due before).
- **Relative due dates**: order cards show "in 3 days", "Tomorrow", "Today", or "5d overdue" in coloured text next to the due date.
- **Orders search**: search input above the filter tabs — filters by client or project name.
- **Bulk stock adjust**: Added `+5` and `+10` buttons to stock cards alongside the existing `−1` and `+1`.
- **Stock search**: search input on the stock tab filters items by name or SKU.
- **Cut list state persistence**: pieces/sheets/IDs saved to `localStorage` on every render; restored on page load. First visit still shows demo data.
- **Kerf saved to localStorage**: kerf value persists across sessions.
- **Cut list clear wipes localStorage**: `clearCutList()` also removes all saved cut list keys.
- **Material cost in results**: if sheet names match stock items, the total material cost is shown as a stat card in the results summary.
- **"Quote this Job" button**: appears in cut list results when material cost can be calculated; switches to Quote tab with materials cost pre-filled and the field highlighted.
- **Live quote total preview**: the sidebar form shows a live breakdown (Labour: Nh @ $X/hr = $Y, Materials, Total) that updates as you type, before creating the quote.
- **Quote Create button** changed to full-width primary style for clarity.
- **Dashboard quick actions**: `+ New Quote`, `+ New Order`, `⚙ Cut List` buttons at the top of the dashboard.
- **Dashboard overdue count**: a red badge shows count of overdue orders in the quick actions row.
- **Dashboard active orders**: overdue orders get a red left border + ⚠ indicator in the dashboard list.
- **Client autocomplete**: typing a client name in the quote form shows matching names from past quotes/orders.

---

## Session 7 (Mar 28 2026)

### Work done
- Replaced Supabase JS SDK calls with raw fetch helper (SDK was hanging with publishable keys)
- Added toast notifications and auth guards to all create operations
- Gated all auth-required functions and tab switches behind sign-in
- Added categories to stock items
- Redesigned all three PDF outputs for professional print quality
- Quote filters, notes persistence, new quote fields, Escape key handling
- Stock CSV export, client autocomplete on orders
- Cut list: duplicate pieces/sheets, inline project save

---

## Session 8 (Mar 29 2026)

### Work done
- Fixed PDF printing: replaced popup-based print with iframe approach, fixed `@media print` CSS
- Split print and PDF into separate buttons throughout the app
- Cut list export: landscape orientation, panel-left / list-right layout
- Cut list PDF: switched to real jsPDF generation, panel at 2/3 width
- Added Summary / Cut List toggles, combined end page, sheets-first order

---

## Session 9 (Mar 31 — Apr 1 2026)

### Work done
- UX polish: confirm dialogs, kerf display, zoom persistence, notes fix
- Fixed grain optimizer call site; allow tabs without login
- Six UX fixes: grain layout, column alignment, kerf per-panel, button labels, units in toolbar, column headers on init
- Auto-reoptimize on grain change; align columns between parts and panels

---

## Session 10 (Apr 1 2026) — Cabinet Quote Builder launched

### Work done
- **New Cabinet Quote Builder tab** with full pricing engine and line-item quoting
- Cabinet type presets, import from Cabinet Builder
- Expandable rows, drag-reorder, profit display
- Sheet requirements calculator, deposit / payment terms
- Copy-to-clipboard, dashboard integration
- Security and logic bug fixes (XSS in Quick Quote PDF)
- Quote duplication, room grouping, room autocomplete
- Finishing cost, edge banding, linear-run tracking
- Responsive CSS for smaller screens, table totals, send to Quick Quote
- Major UI overhaul: card-based collapsible cabinet sections
- Expand / collapse all, active section indicators
- Responsive layout, auto-expand new cabinets, scroll UX
- Renamed Settings to "My Rates", currency-prefix price inputs
- Quick stats bar at top of cabinet list, step-by-step empty state
- Cabinet Builder moved to its own tab, Quote tab restored
- Quote picker dropdown, stepper buttons, finish section, tab reorder

---

## Session 11 (Apr 2 2026) — Schedule + cabinet editor restructure

### Work done
- Major cabinet editor restructure: combined sections, live costs, extras
- PDF fixes, bigger buttons / text, toolbar pinned, finishes in rates
- Editable markup / tax on quotes, company logo upload
- Configurable rates for all components + cabinet library
- **New Schedule tab** with visual timeline of order due dates
- Cabinet names as line items in quotes, PDFs open in browser
- Real jsPDF quote PDFs that open in browser PDF viewer
- Constrain quotes / orders width to 800px to match cabinet builder
- Stock width constraint, schedule fix, date calendar, work order PDF
- Center all page content with equal margins
- Replaced schedule with **full Gantt calendar view**
- Prod start on orders, quote status dropdown, Apple-calendar style, UI fixes

---

## Session 12 (Apr 3 — Apr 4 2026) — Calendar + libraries proliferation

### Work done
- Calendar bars span days, distinct job colors, stock layout fix
- Apple-style calendar with sidebar
- My Rates moved to its own tab
- Stock card redesign: supplier visibility, edit, restock UX
- Dashboard: upcoming deadlines card, schedule button
- Visual audit fixes: fonts, overflow, dark mode, calendar bar spanning
- Calendar date parsing timezone fixes, `prodStart` stored as ISO consistently
- Cutlist headers renamed: W → L, H → W; Enter = copy, Tab navigation
- My Rates restructure: dropdowns, volume carcass, split shelves
- Cabinet library (CSV, Template button), Project library separate from Cabinet library
- Cabinet output: line item cards, edit mode
- Core / Labour rates as lists, markup + tax on each cabinet card
- Save Project button below project name, cutlist-style empty state
- Clients / Import / Export toolbar on Quotes and Orders
- **Stock libraries** (save / load multiple named stock sets)
- **Shared Client library + Quote / Order libraries**
- **Unified library UI across all 5 tabs** via `_renderLibUI`
- Pinned library bars at top of each sidebar
- Stock Panels library bar in cutlist; library bar position fixes across tabs

---

## Session 13 (Apr 5 2026) — Library UI polish, v0.9.1 → v0.9.6

### Work done
- Library bars styled as folder-style tabs matching main nav (many iterations)
- Inactive library tabs kept visible as folder tabs; Stock Panels defaults open
- Cleaner library tab transitions, fewer colour changes
- Removed tab styling from Import / Export buttons
- Nav tab width experiments — settled on 130px with 50px indent
- Project Name + Save Project added to Quote and Orders sidebars
- Project name input moved into library dropdowns
- QTY stepper and column width adjustments to fit double-digit qtys
- Cutlist row height + text size reductions
- Copy and delete buttons on single line
- Stock panels: wider Material column, compact buttons, removed eye / hide buttons
- Cutlist sidebar widened to 480px
- **Versioned v0.9.1 → v0.9.6**

---

## Session 14 (Apr 6 2026) — Projects & Clients tabs, v0.9.7

### Work done
- **New Projects & Clients tabs** with cross-tab interconnection
- Rationalised UI: reordered tabs, removed redundant libraries, added project fields
- Gracefully handle missing FK columns in Supabase schema
- Added `_dbInsertSafe` helper for robust schema compatibility
- Project status filter and card-layout bug fixes
- **Compact UI overhaul** across all tabs (v0.9.7)
- Stock inline qty editing, project autocomplete, schedule status improvements
- Restored Saved Projects library to Cut List sidebar

---

## Session 15 (Apr 7 2026) — UX polish, keyboard shortcuts, v0.9.8 → v0.10.0

### Work done
- Inline editing improvements, clickable KPIs, schedule "today" button (v0.9.8)
- Dashboard items clickable, quote preview breakdown, form reset fixes
- **Keyboard shortcuts** introduced; stock low badge; nav improvements
- Standardised sidebar libraries for consistency across all tabs (v0.9.9)
- Schedule bar scroll, clickable pipeline steps, filter consistency
- Order duplicate, sort dropdowns for quotes / orders
- **Keyboard shortcuts help modal**, Escape closes projects panel
- Shared Clients / Projects libraries to Quote & Orders sidebars; Getting Started updated
- **Cross-tab linking, quote-to-order tracking, work-order pipeline fixes (v0.10.0)**
- Sorting added to Clients and Projects tabs
- Stock card supplier visibility improvements, client auto-suggest fixes
- Supplier column in stock print and PDF output
- "Always show supplier and reorder" on stock cards, more keyboard shortcuts
- Dashboard: quick project action, advance orders from deadlines

---

## Session 16 (Apr 8 — Apr 10 2026) — Smart search migration, CLAUDE.md

### Work done
- **Cabinet Builder smart-search migration** — moved from collapsible library panels to the smart-input + popup pattern
- **Created `CLAUDE.md`** documenting the smart-input pattern as the project standard
- Unified stock library, Cut List UI overhaul, smart-search polish

### Notes
- This session established the "smart search input + popup" pattern documented in `CLAUDE.md` as the canonical entity-input UI. All future entity inputs follow this pattern.

---

## Session 17 (Apr 13 — Apr 16 2026) — Edge banding workflow + sidebar experiment

### Work done
- Cut List improvements: confirm dialogs, custom checkboxes, cabinet name sync
- **Edge banding workflow + layout view overhaul** — proper edge-band tracking with assignment to piece sides (L1 / W2 / L3 / W4)
- Experiment: removed sidebars, moved creation forms to popups, redesigned Cabinet tab
- **Reverted** the sidebars-removal experiment after one day

### Notes
- The sidebars-removal experiment (`cd62887`) was reverted (`3e9c0d5`) — kept here as a record so we don't try the same thing twice without new reasoning.

---

## Session 18 (Apr 17 — Apr 20 2026) — Cut List engine + edge banding stock type

### Work done
- **Cut List overhaul**: rip-first recursive guillotine algorithm, per-sheet cut list, toolbar reorganisation
- **Edge banding promoted to a stock type** — thickness, width, length, and glue fields added to stock items

---

## Session 19 (Apr 27 — Apr 28 2026) — Pre-launch refactor planning

**Not feature work — structural planning for the launch.**

### Work done
- Drafted **`SCHEMA.md`** — full database schema for the post-localStorage world (16 tables with DDL, RLS patterns, migration order, open questions)
- Drafted **`SPEC.md`** — pre-launch refactor spec (problem / goals / non-goals / scope / phases / failure modes / decisions log)
- Created **`Building Docs/Database_Visual_Guide.docx`** — plain-English schema explanation for non-technical reading; build script preserved at `/tmp/procabinet-docx/build.js`
- Decided **unified `catalog_items` table** (one table with `type` column) instead of separate `materials_catalog` / `handles_catalog` / `finishes_catalog` — captured in `SPEC.md § 13`
- Updated **`CLAUDE.md`** and **`PLAN.md`** with cross-references to `SPEC.md`, `SCHEMA.md`, and the visual guide
- Caught up `SESSIONS.md` after a month of unlogged activity (Sessions 7–18 above)
- Set up SessionEnd hook to auto-append commit log to `SESSIONS.md` going forward

### Notes
- Spec is Status: Draft — § 1, § 4, § 5 TODOs still need user's own one-sentence answers before refactor work begins.
- `SCHEMA.md § 6` has 6 open questions to resolve before writing migrations (soft delete, enum vs. check constraint, `updated_at` trigger vs. app-set, etc.)

---

## Pending / next steps

See `PLAN.md` for the full build plan and `SPEC.md` for the pre-launch refactor.

### Immediate (pre-launch refactor)
- Resolve open questions in `SPEC.md § 9` and `SCHEMA.md § 6`
- Fill in the TODO prompts in `SPEC.md` (§ 1, § 4, § 5 first)
- Begin Phase 0 (prep) per `SPEC.md § 10`

### After launch
- Step 3: Stripe payments / subscriptions
- Step 4: Netlify hosting

### Supabase details
- Project URL: https://mhzneruvlfmhnsohfrdo.supabase.co
- Current tables: `clients`, `projects`, `quotes`, `orders`, `stock_items` (all with RLS, scoped to `user_id`)
- Target schema after refactor: see `SCHEMA.md`
- Auth: email + password via Supabase Auth


<!-- last_commit: 278342f -->
