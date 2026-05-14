# ProCabinet.App — Build Plan

The single source of truth for what's pending, in progress, and done.
Companion docs: `SPEC.md` (refactor history), `SCHEMA.md` (DB schema),
`CLAUDE.md` (dev guidelines), `~/.claude/plans/item-2-cabinet-quote-unification.md`
(detailed architecture for Item 2). Source material for launch tasks lives in
`Building Docs/ProCabinet_ToDo_List.docx` and `ProCabinet_Outstanding_Features.docx`.

---

## Status Snapshot

- **App is live** at [procabinet.app](https://procabinet.app) (Cloudflare Pages, auto-deploy on push to `main`)
- **Pre-launch refactor (SPEC.md Phases 0–7)** complete — modular files, TypeScript strict mode, schema normalised
- **Cabinet Builder unification** (Item 2): all 4 phases done — pre-launch refactor closed
- **Stripe payments**: S.2–S.7 done in test mode (Checkout + Portal + Webhook + DB schema); S.8 verification + S.9 live-mode flip remain
- **Mobile / responsive**: not started
- **UI polish + design finalisation**: not started
- **Launch target:** mid-May 2026 (per Business Plan)

---

## Active Work

### Business Details popup + logos on PDFs + bank details + Pro/free branding ✅ Done 2026-05-14

Plan: `~/.claude/plans/i-want-the-business-rustling-aurora.md`.

- ✅ **Mockup** — `mockups/pdf-branding-options.html` shows the three branding intensities side-by-side (free vs Pro pairs). Variant 2 (footer band) chosen as default.
- ✅ **Migration** — `ALTER TABLE business_info ADD COLUMN IF NOT EXISTS bank_details text;` applied via Supabase MCP `apply_migration` on 2026-05-14 (migration name `add_bank_details_to_business_info`). `src/database.types.ts` regenerated; `business_info.bank_details: string | null` now visible in the generated Row/Insert/Update types. `get_advisors` clean (only pre-existing leaked-password-protection warning, unrelated).
- ✅ **Popup** — `_openBusinessDetailsPopup` in `src/business.js` replaces the inline form at `index.html:141-153`. Logo upload + name + address + phone/email row + ABN + bank-details textarea.
- ✅ **Logo on every PDF** — new `_drawBizHeader` helper at top of `src/cutlist.js` wires logo + reordered caption (name → address → phone → email) into all 5 PDF builders. Logo replaces the big bold business-name when present.
- ✅ **Bank details on quote + order PDFs** — `_buildOrderDocPDF` placeholder replaced with `biz.bank_details`; `_buildQuotePDF` gains a new PAYMENT DETAILS block between Validity and Acceptance.
- ✅ **Conditional ProCabinet branding** — `_drawPdfFooter` gates branding on `!isPro()`. Pro users get a clean footer; free users get the accent footer band. Variant flip lives in the `_PROCAB_FOOTER_VARIANT` module constant.
- ✅ **Boot hydration** — `_applyBizInfoFromDB` (`src/app.js`) extended to mirror `bank_details` into `pc_biz` localStorage so `getBizInfo()` returns it on subsequent reads.

### Remove Projects entity · adopt library-first / Cabinet-IS-Quote ✅ Done 2026-05-13

Foundational refactor toward the new architecture designed across
`mockups/option-d-flat-files-flow.html` (flat files, no project hub),
`mockups/option-e-cabinet-is-quote-flow.html` (Cabinet view = a view of Quote
with `status='designing'`), and `mockups/top-level-architecture-flow.html`
(library tier with 3 tables + tags; client tier; derived views). Client
groups everything; library items snapshot into quotes via attribution chip.

**Phases F1–F4 done (commits on `main`):**

- `69ff6d4` **F1** — Projects nav tab removed; projects render inline in
  Client cards. `_renderProjectInlineCard` lifted to module scope in
  `clients.js` so both the (now-hidden) Projects panel and the Clients tab
  share the same component. `settings.js` `switchSection` sections array
  updated. No schema change.
- `e77282a` **F2** — Schema additive: `quotes.name` + `orders.name` (backfilled
  from associated `projects.name`); `tags jsonb` + GIN indexes on
  `cabinet_templates` / `stock_items` / `cutlists`. Tags are a UX-layer
  filter convention; storage stays purpose-built per table (decided
  against unifying into one `library_items` table — different shapes,
  lifecycles, FK children). Migration applied via Supabase MCP; types
  regenerated.
- `b5d8990` **F3** — `[CB_DRAFT]` notes-tag → `quotes.status='designing'`.
  `_isDraftQuote()` now checks `status === 'designing'` first; legacy
  notes-prefix check kept as belt-and-braces fallback. `_findOrCreateDraftQuote`
  inserts with `status: 'designing'` instead of `notes: CB_DRAFT_TAG`. 1
  existing draft migrated.
- `8cb87cb` **F4** — Added `cutlists.quote_id` (nullable FK, `on delete set
  null`) as the per-quote bookmark for the new architecture. Pure bookmark
  — no part data copied (confirmed: cabinets don't export parts to cut
  lists). Existing `cutlist_cabinets` many-to-many join table unchanged.
  Originally specced as a rename of `cutlists.cabinet_id`, but the live
  schema never had that column — the relationship was always via the
  join table.

**Phase F7 done in a follow-up session:**

- **F7** — Cabinet Library sub-tab gets its own sidebar gate (`#cb-sidebar-library`) for a standalone, out-of-client template workflow. `#panel-cabinet` now hosts two sibling sidebar wrappers inside the same `<aside>`: `#cb-sidebar-builder` (existing client-picker + cabinet editor) and `#cb-sidebar-library` (new gate with Recent templates + "+ Add Template"). `switchCBMainView()` toggles between them and cleans up cross-sub-tab edit state (drops in-quote scratchpad on switch-to-library; drops template-edit scratchpad on switch-to-builder). `renderCBPanel`'s auto-flip-to-Library when no client (lines 211–213) removed — the Quote Builder sub-tab now correctly shows its existing "Pick a client" empty state. New file `src/cabinet-library-sidebar.js` mirrors the Clients/Stock gate pattern via `_renderListEmpty()`. `cbStartNewLibraryEntry()` creates a fresh template entry, drills into the existing cabinet editor (reusing `_cbScheduleAutosave`'s `cabEditingLibraryIdx >= 0` route to `cabinet_templates`), and back-fills `db_id` on first save. Import/Export buttons moved from the Quote Builder results header to the Library grid's filter bar per `CLAUDE.md` convention. `_saveCabinetToDB` / `_updateCabinetInDB` relaxed to write `entry.cabType || entry.type || 'base'` instead of hardcoding `'base'`. Verified end-to-end in the Vite dev preview: clean reload lands on Quote Builder (no auto-flip); Cabinet Library tab shows the new gate without requiring a client; "+ Add Template" creates a row in `cabinet_templates` (POST, not to `quote_lines`); switching sub-tabs mid-edit cleans up correctly and the sidebar context refreshes to the right empty state.

**Phases F5–F6 done in a single follow-up session:**

- `bb4e5b1` **F5** — All 94 `project_id` references stripped from
  `src/*.js`. Cabinet Builder workspace re-keyed from project_id to
  client_id with a "most recent designing-status quote per client"
  semantic via the rewritten `_findOrCreateDraftQuote(clientId)`. Quote
  and Order sidebar editors collapse `_qpState.projectId` /
  `_opState.projectId` into `clientId`; empty-state pickers swap to
  client smart-inputs with Recent Clients lists. Cut List middle tab
  ("Project Cut Lists") dropped per the locked decision — Cut List goes
  from 3 tabs to 2 (Cut Layout + Cabinet Library). `duplicateProject`
  flow deleted entirely per locked decision. `quoteProject` / `orderProject`
  helpers repurposed to read `quotes.name` / `orders.name` so the ~25
  cross-file display sites stay valid. Schema migration drops
  `project_id` from quotes, orders, cutlists, pieces, sheets, edge_bands,
  cabinets. `database.types.ts` regenerated. Browser smoke confirmed all
  tabs load with no console errors.
- `2b909c6` **F6** — `public.projects` table dropped. `renderProjectsMain`,
  `_renderProjectInlineCard`, the `_pj*` autosave/state machinery, the
  projects-tab gate (`_pickClientForProjects`, `_smartProjectsClientSuggest`,
  etc.), per-project drill helpers (`_drill*ForProject`, `_new*ForProject`),
  and the project CRUD all removed from `src/clients.js`. `#panel-projects`
  + the sidebar form deleted from `index.html`. `renderClientsMain`'s
  client card rewritten with three flat collapsible sections — Quotes /
  Orders / Cut Lists — clicking a row jumps into the entity's editor.
  New `window._cutListsByClient` cache + `_loadCutListsByClient` boot
  hydrator powers the Cut Lists section. `src/projects.js` collapsed to
  just the per-cutlist helpers (~165 lines, down from ~480). Dead chains
  removed: `_openNewProjectPopup` / `_saveNewProjectPopup` /
  `_setClLoadedProject` / `_setCbLoadedProject` (`src/quotes.js`),
  `_smartCLProjectSuggest` / `_smartCBProjectSuggest` (`src/cabinet-library.js`),
  `_clProjectCache` (`src/cabinet.js`), `_renderProjectEmpty` (`src/ui.js`),
  `_clSaveProject` / `_openSaveProjectPopup` / `_doSaveProject` /
  `_clPickProjectByIdSafe` / `_smartCLEmptyProjectSuggest` (`src/cutlist.js`),
  `_openProjectPopup` (`src/app.js`). Settings.js `switchSection`
  branches and migrate.js legacy LS migrations neutered. `database.types.ts`
  regenerated without `projects`. Typecheck clean, browser smoke confirms
  all 8 nav tabs load with no console errors.

**Migration files staged** (all applied to the dev project via MCP):
- `supabase/migrations/20260513120000_f2_add_name_and_tags_columns.sql`
- `supabase/migrations/20260513140000_f3_designing_status.sql`
- `supabase/migrations/20260513150000_f4_cutlists_quote_id.sql`
- `supabase/migrations/20260513160000_f5_drop_project_id.sql`
- `supabase/migrations/20260513170000_f6_drop_projects_table.sql`

---

### Quote / Order / Invoice number-format unification 🚧 In Progress 2026-05-12

Three-prefix unification: quotes `Q-NNNN` → `QUO-NNNN`, orders `NNNN` (no
prefix) → `ORD-NNNN`, order-PDF per-doc prefixes `OC` / `PF` → `ORC` / `PRO`
(Tax Invoice `INV` unchanged). All five PDF prefixes (`QUO`, `ORD`, `ORC`,
`PRO`, `INV`, plus `WO` on Work Order) are now 3-letter. Quote / Order /
Work Order PDFs now derive the digit portion from the stored `quote_number`
/ `order_number` instead of the raw DB row id, so screen and paper agree.

Code changes shipped: generation fns (`_nextQuoteNumber` / `_nextOrderNumber`),
3 PDF builders in `src/cutlist.js`, every fallback display site (`quotes.js`,
`orders.js`, `dashboard.js`, `schedule.js`, `cabinet-render.js`), the order
editor's strip-on-display / prepend-on-save pair (mirroring the existing
quote pattern), and `src/migrate.js`'s legacy LS normalization. Editor
input strip regex broadened to `/^(QUO|Q)-/i` so existing `Q-NNNN` rows show
just digits in the input through the transition. `npm run typecheck` clean.

**Sub-step pending: migration not yet applied.** Supabase MCP
`apply_migration` blocked by harness permissions. SQL staged at
`supabase/migrations/20260512175008_renumber_prefixes.sql` — one-shot
rewrite of stored values. Apply via the Supabase SQL editor before
existing cards/dashboards/PDFs flip over to the new prefixes. Code is
migration-tolerant — every save migrates that single row, and every new
entry uses the new format already.

**Remaining:**
- ✅ Migration `renumber_prefixes` applied via Supabase MCP (data was already
  in target format from the demo-data reset, so the UPDATE is a no-op; still
  registered in `schema_migrations` for parity).
- Browser smoke: existing cards display `QUO-NNNN` / `#ORD-NNNN` post-migration;
  new quote / new order use next sequential `QUO-` / `ORD-`; PDF spot-check
  (`#QUO-NNNN`, `#ORC-NNNN`, `#PRO-NNNN`, `#INV-NNNN`, `#WO-NNNN`).
- Mark ✅ once verified.

---

### Orders / Quotes editor — mockup-J port 🚧 In Progress 2026-05-11

Second-pass redesign on top of the 2026-05-10 mockup-B work. Implements the user's refined J mockup (`mockups/orders-redesign-J-column-toggles.html` + `mockups/quotes-redesign-J-column-toggles.html`) — new `.ed-head` header (back arrow + tab icon + editable order# prefix + project name + clickable status badge), column-toggle pills (Discount/Hours/Stock), split `+ Cabinet` / `+ Item` add buttons, stock smart-library + per-order `stock_markup` input, divider above Pricing, footer buttons dropped. Stock is a 3rd `line_kind` with the same per-line math as items; its materials get re-priced via `stock_markup` at totals time.

**Code changes (in this commit):**
- New `.ed-head` layout in both editors. Status moves to a `<select>` styled as a colored badge (`data-status` drives the bg). Order# is a small inline input prefixed by a `#` span; quote# similarly prefixed by `#Q-` (and re-prepended on save).
- Column-toggle pills (`.cl-col-pill`) above the line-items table; state persisted in localStorage. `.editor-li-table.hide-disc` / `.hide-hrs` hide columns via CSS.
- Description cells switched to auto-growing `<textarea class="cl-input desc">` with `_autoGrowTextarea` so long names wrap.
- Hrs column header + cells rendered in muted grey to telegraph PDF-hidden; cabinet rows seed with `calcCBLine().labourHrs × qty` and render italic via `.is-computed` until edited.
- Stock kind added: `_orderLineAdd('stock')` / `_lineAdd('stock')` accept the new kind; `_oAddStockLineFromLibrary` / `_qAddStockLineFromLibrary` push a stock row pre-filled from a picked stockItems entry. New `_stockSearchRender` (app.js) renders sectioned suggestions grouped by stock category.
- New `_oToggleColumn` / `_qToggleColumn` / `_oSetStatusBadge` / `_qSetStatusBadge` / `_oStockSearch` / `_qStockSearch` helpers.
- Stock smart-library `+` button calls the canonical `_openNewStockPopup()` (app.js). Resolved a long-standing shadow: `cabinet-library.js` had a function with the same name that actually opens a "New Finish" popup — renamed to `_openNewCBFinishPopup` and 3 legitimate finish-popup callers updated.
- Pricing chips reduced to Tax + Disc. Order-level `markup` column kept in DB for back-compat (existing non-zero values still apply); UI no longer surfaces it. Stock markup is the only user-facing markup field, applied to stock-line materials only.
- Totals math (`_renderOrderLineTotals` / `_renderQuoteLineTotals` / `quoteTotal`) split `stockMat` from non-stock materials and apply `stock_markup` before the legacy markup→tax→discount chain. `orderTotalsFromLines` / `quoteTotalsFromLines` extended to return `stockMat`.
- Editor footer (Delete / Work Order / Invoice / PDF / → Order) removed — these actions live on the order/quote CARD in the main list. Single `+ Create` button stays for the new-row flow.
- PDFs (HTML print + jspdf builders) gain a "Stock markup (N%)" row in the totals block when `stock_markup × stockMat > 0`. `_lineDisplay` handles stock kind same as item.

**Migration applied this session via Supabase MCP.** All four schema changes from `supabase/migrations/20260511015625_stock_kind_and_markup.sql` are live: `line_kind` CHECK constraints on `quote_lines` / `order_lines` now allow `'stock'`, and `stock_markup numeric default 0` columns are present on `quotes` + `orders`. Code paths against the new columns no longer rely on migration-tolerance.

**Remaining:**
- ✅ Migration `stock_kind_and_markup` applied via Supabase MCP.
- ✅ `database.types.ts` regenerated via Supabase MCP (includes `stock_markup` on quotes/orders, plus the discount / schedule_hours columns from the B-pass).
- Browser smoke per `~/.claude/plans/clean-up-orders-dapper-yao.md` Phase 2 Verification.
- Mark ✅ in this section + append final tick to SPEC.md § 13 entry.

---

### Orders / Quotes editor cleanup pass (mockup B) ✅ Done 2026-05-10

Four-point UI cleanup on the order + quote editor sidebars, ported from the user's `mockups/orders-redesign-B-zebra-cutlist.html` mockup. Plan at `~/.claude/plans/clean-up-orders-dapper-yao.md`. **Superseded by the 2026-05-11 mockup-J port above** — that pass replaced the line-items table renderer, dropped the order-level Markup chip, and added column-toggle pills + stock kind / library / per-order stock_markup. The B-mockup migration (`20260510233952_add_discount_columns.sql`) was applied alongside the J migration this session.

**Code changes (in this commit):**
- **Pricing chips** — `Markup · Tax · Disc` on one line via new `.rates-chips` / `.rate-chip` / `.chip-label` / `.chip-unit` CSS (replaces the stacked `.pf-row-inline` block). New `po-discount` + `pq-discount` inputs wired to totals re-render + dirty flag.
- **Schedule chevron** — chunky 28×28 SVG chevron prepended LEFT of the "Schedule" summary text (was a 9px `▾` glyph on the right). Hover `var(--accent-dim)`; `details[open]` rotates 180°.
- **Line items zebra-cutlist table** — `_renderOrderLines` / `_renderQuoteLines` and their row builders rewritten to emit a single `<table class="editor-li-table">` with columns: handle / kind-dot / Description / Qty / Price / Hrs / Disc% / Total / remove. Description cell wraps for long names; nth-child(even) zebra; hover overlays accent-dim. Cabinet rows show qty editable, Price + Hrs read-only (Hrs from `calcCBLine().labourHrs × qty`, cached). Item rows fully editable.
- **Per-line + whole-order discount** — new `discount` (numeric percentage) column on `quotes` / `orders` / `quote_lines` / `order_lines`, plus `schedule_hours` on `quote_lines` for Hrs-column parity. `_lineSubtotal` multiplies materials+labour by `(1 - discount/100)`. Order-level discount applied after tax, rendered as a red `Discount (N%)` row in totals (hidden when zero). PDFs gain a `Disc%` column only when at least one line has a discount, and the same discount totals row only when whole-order discount > 0.
- **Labour line type dropped from UI** — Labour add-tile removed from both editors (`editor-add-tiles` grid switched to `repeat(2, ...)`). Existing `line_kind='labour'` rows still render in-place as item-style; `_lineSubtotal`'s labour branch keeps the hours × rate math for back-compat. New rows are always `kind='item'`.
- CSV: Quote export adds `Discount %` column; importer reads `r[6]` as discount, shifts later columns. `updateQuoteField`'s `numFields` adds `discount`.
- `convertQuoteToOrder` copies `q.discount` into the new order's `discount` field. `orders.value` post-save now reflects the discounted total.

**Migration applied this session via Supabase MCP.** All 5 columns from `supabase/migrations/20260510233952_add_discount_columns.sql` are live: `discount numeric default 0` on `quotes` / `orders` / `quote_lines` / `order_lines`, plus `schedule_hours numeric default 0` on `quote_lines`. Save paths that include these fields now write successfully against the schema.

**Remaining:**
- ✅ Migration `add_discount_columns` applied via Supabase MCP.
- ✅ `database.types.ts` regenerated via Supabase MCP.
- Browser smoke per the plan's Verification section (9 steps).
- Mark ✅ in this section + append final tick to SPEC.md § 13 entry.

---

### Cutlists & Cabinets library-pattern refresh ✅ Done 2026-05-10

Eight-point overhaul of the Cutlist + Cabinet flows around a shared smart-library pattern. Plan at `~/.claude/plans/in-cutlists-and-cabinets-cheeky-glade.md`. SPEC.md § 13 entry covers the full scope. Highlights:

- **Auto-named entries** — `Cutlist N` / `Cabinet N` sequential per project (or per library). New `_clNextCutlistName(projectId)` + `_cbNextCabinetName(libraryMode)` helpers.
- **Scratchpad dropped + autosave** — Cabinet editor now mutates the active live row directly (no staged copy). 800 ms debounced sync via `_cbScheduleAutosave()` routes to project (`saveCBLines`) or library (`_updateCabinetInDB`/`_saveCabinetToDB`) automatically. `cbCommitToProject` / `cbCancelEdit` / `cbSaveLibraryChanges` / `cbCancelLibraryEdit` deleted along with their UI buttons. Cutlist autosave wired into `_setClDirty(true)`.
- **Header cleanup** — `_renderProjectHeader` strips the status-badge / parts-summary / save-pill metaRow plus the client line. New optional `iconSvg` param.
- **Cutlist tab-2 renamed `Project`** — single-project filter only; `View all projects` view, `+ New cut list` button, and viewer header all removed. `_clViewAllCutlists` / `_clNewCutlistFromHere` deleted.
- **Cut List Library tab (cutlist tab-3)** — replaces the old Cabinet Library shortcut. Backed by `cutlists` rows where `project_id IS NULL`. Per-row actions: Open / Link to Cabinet / Duplicate / Delete. New `Add to Library` button under Optimize. `+ Cut List` button on each Cabinet Library row creates a blank linked cutlist (FK only, no parts copy).
- **Import/Export** moved from cutlist sidebar to the Project viewer toolbar (mirroring cabinet builder).
- **Library editing headers** — `Cabinet Library` (cabinet icon) and `Cut List Library` (multi-pointed star icon) render as project-style headers when editing a library entry.

**Schema** — 2 migrations: `cutlists_library_support` (`cutlists.project_id` nullable + new `cabinet_id` FK with index) and `cutlist_children_project_nullable` (drop NOT NULL on `pieces.project_id` / `sheets.project_id` / `edge_bands.project_id`). RLS already keyed on `user_id` so library cutlists with NULL `project_id` work without policy changes. `database.types.ts` regenerated.

**Verified** in dev preview: tab labels correct, project header reduced to back+icon+name, autosave persists library cabinet edits to DB end-to-end, library headers render with the right icons, all old Save / Add / Cancel buttons gone from the cabinet sidebar except `Save to Library`.

---

### Orders / Quotes sidebar redesign 🚧 In Progress 2026-05-09

Eight-point overhaul of the order + quote editor sidebars: line-item inputs got proper labels, schedule became a single collapsible block driven by Production Start + a hours-allocated override, totals moved above the schedule, status/order# repetition removed from the project header. Detail in `~/.claude/plans/orders-quotes-sidebar-1-line-glimmering-kay.md`.

**Code changes (in this commit):**
- Line-item rows (`_orderLineRowHtml` / `_lineRowHtml` in `src/app.js`): two-line `.li-row-stacked` layout with labelled `Qty / Price / Hrs` (item) or `Hours / Rate /hr` (labour) fields. Cabinet rows unchanged.
- Pricing + Schedule meta switched to compact inline rows via new `.pf-row-inline` / `.pf-inline` / `.pf-input-compact` utilities in `styles.css`.
- Manual start/end date inputs deleted from the order editor; Production Start is the single editable date when auto-schedule is off. `saveOrderEditor` mirrors `production_start_date` into `manual_start_date` for back-compat.
- Scheduler manual-orders branch (`src/scheduler.js`) computes `endISO` by walking workdays consuming `hoursRequired` when `manual_end_date` is null.
- New "Override hours" checkbox + Allocated input inside the Schedule section. `orderHoursRequired()` and `_orderHoursBreakdown()` early-return the override value when set.
- Schedule section wrapped in `<details class="editor-section--collapsible">`, default collapsed, persists via `localStorage['pc_order_sched_open']`. Summary line shows `Auto · Start 12 May · 12.5 h`.
- Totals (`pf-totals`) moved from below Notes to between Pricing and Schedule (orders + quotes).
- `status` / `summary` fields dropped from the `_renderProjectHeader` calls in both editors — header is now project name + client only. Status select / Order# input / pipeline / overdue badge stay in the editor section below.
- `npm run typecheck` clean.

**Sub-step pending: `orders.hours_allocated` migration not yet applied.** Supabase MCP `apply_migration` was blocked by harness permissions. SQL staged in the plan file's "DB migration order" section. User to apply manually via Supabase SQL editor; once applied, regenerate `database.types.ts` and the override feature lights up. Without the migration, code paths still work — `o.hours_allocated` reads return `undefined`, override checkbox stays unchecked.

**Remaining:**
- Apply migration `add_orders_hours_allocated`.
- Regenerate `database.types.ts`.
- Browser smoke per the plan's Verification section (8 steps).
- Mark ✅ in this section + append SPEC.md § 13 entry once verified.

### Cut List multi-cutlist + 3-tab refactor 🚧 In Progress 2026-05-09

Adds support for **multiple named cutlists per project** (currently 1-per-project, overwritten on save) and reorganises the Cut List main view into 3 tabs: **Cut Layout / Project Cut Lists / Cabinet Library**.

**Code changes (committed):**
- New `cutlists` table planned: `id, user_id, project_id (FK), name, position, ui_prefs jsonb, created_at, updated_at`. RLS as Pattern A (4 policies). New nullable `cutlist_id` column on `sheets / pieces / edge_bands` with FK + index. Backfill creates a "Main" cutlist per project that has child rows.
- Sidebar: button label `Save Project` → `Save cut list to project`. Cabinet Library smart-search dropdown replaced by a single **"Save selected parts to cabinet library"** button (existing `_clSaveToCabinetLibrary()` requires the user to select pieces first via row checkboxes).
- Save flow: `_saveProjectScoped` now also find-or-creates a cutlist by `(project_id, lower(trim(name)))` via new `_findOrCreateCutlist()`. `_replaceCutListChildTables` rescoped to delete-and-replace by `cutlist_id` (other cutlists in the same project are untouched). Save popup gains a Cut List Name field (default "Main" or current).
- New helpers in `src/projects.js`: `_clLoadCutlist(id)`, `_clDuplicateCutlist(id)`, `_clDeleteCutlist(id)`, `_clRenameCutlist(id)`. `loadProject(id)` no longer auto-loads child rows — sets project state, clears in-memory arrays, and switches to Project Cut Lists tab; the user picks a cutlist to load.
- Main view: tab strip + 3 sibling containers in `index.html`. New `switchCLMainView(view)`, `renderCLCutListsView()`, `renderCLCabinetLibraryView()` in `src/cutlist.js`. Project Cut Lists tab shows ALL cutlists across projects when no project is loaded; filters to current project when one is. Cabinet Library tab is a card-grid view of `cbLibrary` (shared with Cabinet Builder); click loads parts via existing `_clLoadCabinetParts()` flow.
- Auto-tab-switching: `optimize()` switches to Cut Layout on success; `_confirmSaveCLToCabLib()` switches to Cabinet Library after saving.
- Removed orphaned `_smartCLCabinetSuggest()` (the deleted smart-search's only consumer).
- `database.types.ts` hand-updated to include `cutlists` table + `cutlist_id` columns. `npm run typecheck` passes clean.

**Sub-step pending: schema migration is not yet applied.** The Supabase MCP `apply_migration` was blocked by harness permissions. SQL is staged in `~/.claude/plans/currently-i-can-only-abstract-raccoon.md` (Phase 1, Migrations 1 & 2). User will apply manually via Supabase SQL editor; once applied, regenerate `database.types.ts` to verify the hand-written types match.

**Remaining:**
- Apply both migrations (`add_cutlists_table`, `backfill_cutlists_main`).
- Smoke check: `select count(*) from pieces where cutlist_id is null` → 0.
- RLS check: query `cutlists` as user A → no user B rows.
- Browser end-to-end: load project → pick cutlist → edit → save under new name → verify second cutlist row → optimize (auto-switch) → save selected parts (auto-switch) → load from library.
- Append entry to SPEC.md § 13 once smoke-tested.

### Orders auto-numbering ✅ Done 2026-05-09

Mirrors the existing `quote_number` affordance for orders. New nullable
`orders.order_number` column (plain 4-digit zero-padded `NNNN`, no prefix,
per user preference); existing orders backfilled per-user in id-ascending
order via the migration. New `_nextOrderNumber()` in `src/orders.js`
computes the next sequential value from the in-memory `orders` array (max
of trailing-digits of existing `order_number` and `id`). Order editor
gains an Order # input next to Status; create/save/quote→order convert
paths persist it. Quote→order conversion produces a fresh O-NNNN
(independent series from `quote_number`). Order cards prepend `#NNNN ·`
to the project/client title; editor header summary swaps `Order #<id>`
for `#<order_number>` when present. CSV export gains an `Order #`
column. Detail in SPEC.md § 13 (entry dated 2026-05-09).

### Cabinet Builder UX & Pricing Refactor (Batch 1) ✅ Done 2026-05-07

Eight tightly-scoped UX/pricing changes to the Cabinet Builder. Contingency
became a per-cabinet % of labour time (replaces the legacy global `contingencyHours`),
flowing through `calcCBLine` so it scales both labour hours AND price; per-order
contingency overrides removed from the Order popup and from the schedule breakdown
(now an "incl. N% contingency" tag on the Cabinet Labour line). Standalone
Finish + Hardware sections in the cabinet editor removed in favour of per-component
pickers — cabinet/doors/drawer-fronts/drawer-boxes each get their own finish;
cabinet/doors/drawer-boxes each get their own multi-item hardware list with
quantities. The hardcoded auto-hardware (2 hinges/door + 1 slide-pair/drawer)
is gone. Drawers section split into Drawer Fronts + Drawer Boxes for visual
parity with the Cabinet section (matching the existing per-type power-law math).
"Results" tab → "Project". Add to Library / Add to Project buttons now switch
the main view to the corresponding tab. Cabinet qty stepper removed from the
sidebar (qty already lives in the Project view's cabinet card). Packaging Time
moved from Core Rates to Other Labour Times. Migrations: 5 cols on `quote_lines`
(`door_finish` / `drawer_front_finish` / `drawer_box_finish` / `door_hardware`
/ `drawer_hardware`), 1 col on `orders` (`contingency_pct`, reserved for future
per-order override), 1 col on `business_info` (`default_contingency_pct`).
Detail in SPEC.md § 13 (entry dated 2026-05-07).

### Quotes & Orders — Real Line Items ✅ Done 2026-05-06

Quotes and orders previously edited a free-form notes textarea plus aggregate
Materials/Labour-Rate/Hours fields; the `quote_lines` schema was already
row-per-cabinet but the UI didn't show it. Both popups now render structured
line items with three kinds — `cabinet` (read-only, edited via the Cabinet
Builder), `item` (qty × unit_price), and `labour` (hours × rate). The legacy
aggregate inputs and the em-dash notes parsing in the PDF are gone; PDF and
print-HTML render real line items. Migration adds `line_kind` + `unit_price`
to `quote_lines` / `order_lines` and `markup` + `tax` to `orders` (resolves
the `orders.value` workaround tracked in the backlog). `_syncCBLinesToQuote`
filters its delete to `line_kind = 'cabinet'` so item/labour lines survive
builder edits. One-shot `_migrateManualStubLines` converts pre-rewrite
"Manual Quote" stubs into real Item + Labour rows.

### Multi-Unit Format System ✅ Done 2026-05-06

Added rich dimension formatting inspired by CutListOptimizer.com. New `src/units.js`
library provides `formatDim()` / `parseDim()` / `convertDim()` / `unitLabel()`.
Imperial modes: decimal (0.0), fractional (12 3/8), feet-inches (1' 3 3/8").
Metric modes: mm, cm. Configurable decimal places (0–1) and fraction precision
(1/4 through 1/64). Internal storage keeps full precision — formatting is
display-only, enabling lossless imperial↔metric round-trips. Settings UI added
to gear dropdown. Persisted to localStorage + `business_info.unit_format` (jsonb).
~40 dimension display points updated across cutlist, stock, cabinet, quotes.
DB migration applied: `unit_format jsonb` column on `business_info`.

### Item 2 — Cabinet Builder ↔ Quote Unification

Goal: one editing surface for cabinet specs, one storage backend, clear flow from
exploring a design → formal quote → approved order. Detailed architecture
(Options A/B/C, decision rationale) lives in `~/.claude/plans/item-2-cabinet-quote-unification.md`.

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Move `cbLines` to DB (storage convergence, auth gate) | ✅ Done 2026-05-04 |
| 2 | UI unification (Edit + Duplicate buttons, project-required builder) | ✅ Done 2026-05-05 |
| 3 | `cbSettings` → `business_info` migration | ✅ Done 2026-05-05 |
| 4 | Cleanup (dead code, converters, catalog_items CRUD) | ✅ Done 2026-05-05 |

**Resolved decisions** (locked 2026-05-03):
1. Draft quotes tagged via `[CB_DRAFT]` prefix in `quotes.notes` (no schema change)
2. Cabinet Builder requires sign-in (no guest mode)
3. cbSettings fully moves to `business_info` (numeric/jsonb columns) and `catalog_items` (rows)
4. Quote editing: edit-in-place, with an explicit "Duplicate" button for forking

#### Phase 2 — UI Unification ✅ Done 2026-05-05

Sub-steps:

- ✅ **2.1 — Project required for Cabinet Builder editing**
  `_ensureCBProject()` auto-creates the projects row on first cabinet add when
  the typed name isn't in `projects`. `_renderProjectStatus()` shows a hint
  under the project input when no project is resolved.

- ✅ **2.2 — "Edit" button on quote cards (in-place)**
  Edit button in `renderQuoteMain` calls `editQuoteInCB(id)`, which loads the
  quote's `quote_lines` into `cbLines`, sets `cbEditingQuoteId`, and switches
  to the cabinet tab. While `cbEditingQuoteId` is set, `_syncCBLinesToDB`
  routes through `_syncCBLinesToQuote(id)` instead of the project draft.
  Banner with Done/Discard appears in the cabinet view. The editing context
  persists across page refreshes via `pc_cb_editing_quote_id` localStorage.

- ✅ **2.3 — "Duplicate" button on quote cards**
  Already implemented: the existing "Copy" button calls `duplicateQuote(id)`,
  which copies the quote row and all `quote_lines` rows. No code change.

- ✅ **2.4 — "Create Quote from cabinets" flow**
  `cbCreateQuoteFromDraft()` snapshots the current cbLines into a brand-new
  customer-facing quote (no `[CB_DRAFT]` tag). The draft stays as the live
  workspace. Single "Create Quote" button replaces the old "Add to Existing"
  / "+ New Quote" pair. Legacy `cbAddToNewQuote` / `cbAddToExistingQuote`
  kept as thin stubs that delegate to the new function.

- ✅ **2.5 — Verify**
  Browser eval confirmed: function definitions present, Edit button renders
  on quote cards, "Create Quote" button replaces the two old buttons in
  normal mode, Done/Discard banner replaces "Create Quote" when editing,
  `_cb_project-status` indicator div in DOM. `npm run typecheck` clean.

#### Phase 4 — Cleanup ✅ Done 2026-05-05

Sub-steps:

- ✅ **4.1 — `catalog_items` CRUD wiring**
  New `_syncCatalogToDB()` in business.js — debounced 800ms REPLACE-semantics
  sync of `cbSettings.materials` / `cbSettings.hardware` / `cbSettings.finishes`
  into the `catalog_items` table. Wired into `saveCBSettings` so inline edits
  in the My Rates panel persist past reload. Race-guarded `_applyCatalogFromDB`
  to avoid TOKEN_REFRESHED clobbering pending edits. Added `.in()` method to
  `_DBBuilder` for the multi-type delete filter.

- ✅ **4.2 — Remove `cbSavedQuotes`**
  Removed: state vars (`cbSavedQuotes`, `cbActiveQuoteIdx`), helpers
  (`loadCBSaved`, `saveCBSaved`), CRUD functions (`saveCBQuote`, `loadCBQuote`,
  `newCBQuote`, `deleteCBQuote`, `dupCBSavedQuote`), and the `renderCBSavedShelf`
  pill UI. The migration helper that reads `pc_cq_saved` for one-time legacy
  migration is kept (read-only).

- ✅ **4.3 — Remove `cbProjectLibrary`**
  Removed: state var, load/save helpers, full CRUD (`cbSaveProject`,
  `cbLoadProject`, `cbDeleteProject`, `renderCBProjects`, `cbExportProjects`,
  `cbImportProjects`), and the `_cbSaveProjectByName` flow. `toggleCabPanel`
  simplified to handle only the cabinet-library panel. Projects now live
  exclusively in the `projects` table; the smart-input "+" popup is the
  creation entry point.

- ✅ **4.4 — Slim converters (not dropped)**
  Discovered the plan's "drop entirely" framing was overstated — the converters
  are load-bearing because of `backMat`/`doorMat` UI fields that have no matching
  schema columns, plus the `.w`/`.h`/`.d` rename would collide with `stockItems`
  accesses (~250 sites). Instead: kept the pair, tightened with explicit boundary
  docs flagging which fields don't round-trip (`id`, `backMat`, `doorMat`). The
  full rename is deferred — would need bundling with a `cb*` → `qb*` symbol pass.

- ✅ **4.5 — Skipped**
  File rename `src/cabinet.js` → `src/quote-builder.js` skipped: pure-cosmetic
  2,499-line rename diff, plus the internal symbols still all start with `cb*` —
  half-measure. Bundle with a future `cb*` → `qb*` symbol rename if the
  mental-model gain becomes worth the churn.

---

## Pre-Launch Sequence

Ordered path to soft launch. Each block can be picked up in order; nothing
below requires a previous block to be 100% complete except where called out.

### Stripe + Subscriptions

Blocks free-tier gating, blocks soft launch. Paywall already exists at
`index.html` line 29 for the cut-list 5-free-runs limit; needs a real payment
endpoint instead of just "Sign In / Create Account".

**Pricing model:** USD-only Prices + Stripe Adaptive Pricing for automatic
local-currency conversion at Checkout. Customer in NYC pays USD; customer
in Berlin sees EUR; customer in London sees GBP. Stripe handles all FX
(~2% spread). UK Stripe account settles in GBP regardless. No free trial —
free tier is the trial.

- **S.1 — Stripe account setup** *(user-side, ~30 min + bank verification)*
  - Sign up at dashboard.stripe.com/register (UK account)
  - Business details, bank account, tax info (VAT number if registered)
  - Stay in **Test mode** for full S.2–S.8 build; flip to live keys at launch
  - Capture from Developers → API keys: `pk_test_…` (publishable) +
    `sk_test_…` (secret — store in Supabase Edge Function env, never client)
  - **No free trial** (free tier IS the trial)

- **S.2 — Stripe products + Adaptive Pricing** ✅ Done 2026-05-06
  - Product: "ProCabinet.App"
  - Test-mode Price IDs:
    | Cadence | USD | Stripe Price ID |
    |---------|-----|-----------------|
    | Monthly | $35 | `price_1TTpOa91y9TVyA6ME8hBDoCL` |
    | Annual  | $299 | `price_1TTpPx91y9TVyA6Mh3OTz56x` |
  - Adaptive Pricing enabled in Stripe Dashboard — non-US customers see
    Checkout in their local currency, Stripe handles FX
  - Live-mode Prices to be recreated at launch (S.9) — same SKUs, live keys
  - Optional: Shop tier placeholder for May 2027 milestone

- **S.3 — Database schema for subscriptions** ✅ Done 2026-05-05
  - Migration `create_subscriptions_and_preferred_currency` applied
  - `subscriptions` table with SELECT-only RLS for owner; webhooks write via
    service role
  - `business_info.preferred_currency` (GBP/USD/EUR/AUD) added for Checkout
    flow
  - `src/database.types.ts` regenerated, `SCHEMA.md § 3.1 + § 3.17` updated
  - `npm run typecheck` clean

- **S.4 — Stripe Checkout integration** ✅ Done 2026-05-05
  - Edge Function `supabase/functions/stripe-checkout/index.ts` deployed —
    accepts a Supabase JWT + `cadence`, resolves/creates a Stripe Customer
    with `metadata: { user_id }`, creates a Checkout session, returns URL
  - Client `src/stripe.js` — `startCheckout(cadence)` posts to the Edge
    Function and redirects; `handleCheckoutReturn()` shows a toast on
    `?upgrade=success`/`?upgrade=cancelled` and refreshes subscription state
  - Upgrade UI in account dropdown (Free Plan badge + Upgrade button + plan
    split links). Init wired in `src/app.js`; script tag in `index.html`
  - Adaptive Pricing handles currency conversion in Stripe — no app-side
    geo detection
  - End-to-end verified: test card → Checkout → webhook → DB row → Pro UI

- **S.5 — Subscription management flows** ✅ Done 2026-05-06
  - Edge Function `supabase/functions/stripe-portal/index.ts` deployed —
    creates a Stripe Billing Portal session for the authenticated user
  - Client `openCustomerPortal()` + `_portalAction()` redirect helper
  - **State-aware Manage popup** (`_handleManageSubscription`) branches into
    four states with tailored copy + actions:
    - `_openManagePopupActive` — plan card, switch/update/invoices, Cancel button
    - `_openManagePopupCancelling` — period-end notice + Resume button
    - `_openManagePopupPastDue` — red Past Due badge + Update Payment CTA
    - `_openManagePopupFree` — fallback Upgrade flow if free user opens it
  - `handlePortalReturn()` toasts + reloads subscription on `?portal=returned`
  - Customer Portal configured in Stripe Dashboard (cancellation, payment
    method updates, plan switching, invoice history all enabled)

- **S.6 — Webhook handling (Supabase Edge Function)** ✅ Done 2026-05-05
  - `supabase/functions/stripe-webhook/index.ts` deployed; handles four events:
    - `checkout.session.completed` → upsert subscription row (re-fetches from Stripe)
    - `customer.subscription.updated` / `.deleted` → sync row from event payload
    - `invoice.payment_failed` → re-fetch + sync (status → past_due/unpaid)
  - Signature verified via `Stripe.webhooks.constructEventAsync`
  - Writes via service role (bypasses RLS); user→customer mapping via
    `customer.metadata.user_id` (set by stripe-checkout function)
  - Returns 5xx for transient errors so Stripe retries
  - Pinned to API version `2024-09-30.acacia` (matches stripe@17 SDK default)
  - Verified: test purchase produced active row in `subscriptions`

- **S.7 — Invoice / receipt views** ✅ Done 2026-05-06
  - Customer Portal surfaces invoice history natively; "View invoices" row
    in the active-state Manage popup routes there. No extra build.

- **S.8 — End-to-end manual test** *(partial — pre-launch smoke pass)*
  - ✅ Sign up → free tier → upgrade via Checkout → Pro features unlock
  - ⬜ Verify Adaptive Pricing — open Checkout from a non-US IP (Stripe test
    cards 4242… work in any currency) or use Stripe's test-mode locale override
  - ⬜ Cancel via Manage popup → portal → verify `cancel_at_period_end=true` in DB
  - ⬜ Resume from Cancelling state → verify back to active
  - ⬜ Trigger `invoice.payment_failed` from Stripe Dashboard test event →
    verify status flips to `past_due` and Manage popup shows the red branch

- **S.9 — Live-mode flip** *(pending — pre-launch only)*
  - Activate Stripe account (full business + bank details) to unlock live keys
  - Recreate the 2 Prices in live mode → capture `price_…` IDs
  - Set live secrets:
    - `supabase secrets set STRIPE_SECRET_KEY=sk_live_…`
    - `supabase secrets set STRIPE_PRICE_MONTHLY=price_…`
    - `supabase secrets set STRIPE_PRICE_ANNUAL=price_…`
  - Update `VITE_STRIPE_PUBLISHABLE_KEY=pk_live_…` in Cloudflare Pages env vars
  - Register live webhook endpoint (separate from test one) →
    `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_…`
  - Redeploy both functions to pick up the new secrets

### Free-Tier Limits

Depends on S.3 (subscription status readable).

**Model:** Full functionality on free tier — no feature gates. Only constraint
is a 5-item cap per library. All features (Schedule, PDF export, CSV import,
analytics widgets) available to all users.

- **F.1 — Limits module** ✅ Done 2026-05-05
  - `src/limits.js` ships `FREE_LIMITS` (frozen), `_subscription` state,
    `loadSubscription()`, `isPro()`, `getLimit()`, `isAtLimit()`,
    `isApproachingLimit()`. Wired into `loadAllData` + cleared on sign-out.
  - Returns false / cap = 5 until S.6 webhook starts populating subscription
    rows; harmless before Stripe is live.

- **F.2 — Enforce at write time (hard block)** ✅ Done 2026-05-06
  - `_enforceFreeLimit(library, count)` helper in `src/limits.js` returns
    false + opens upgrade modal when at cap; `_openLimitHitModal(library)`
    in `src/stripe.js` shows tailored copy per library
  - 13 gates wired across 6 libraries:
    - **clients** — `createClient`, `resolveClient` (auto-create from
      smart-input typing)
    - **projects** — `createProject`, `resolveProject` (same pattern)
    - **quotes** — `createQuote`, `duplicateQuote`, `cbCreateQuoteFromDraft`
      (count excludes `[CB_DRAFT]` quotes — those are auto-generated workspace
      drafts, not user-created)
    - **orders** — `addOrder`, `duplicateOrder`, `convertQuoteToOrder`
    - **stock** — `addStockItem`
    - **cabinet_templates** — `cbSaveToLibrary`, `_confirmSaveCLToCabLib`,
      `cbImportLibrary` CSV import (refuses bulk import that would bust cap)
  - Pro users skip every check (Infinity cap)
  - **Follow-up**: bulk CSV imports for clients / quotes / orders / stock
    bypass gates today. Low priority; users who CSV-import are typically Pro
    candidates anyway. Add gates if free abuse becomes a vector.

- **F.3 — Approaching-limit indicators**
  - Banner at the top of a section when at 4/5 (80%) of limit
  - Upgrade CTA in Settings → Subscription at all times for free users
  - Item count shown in section headers (e.g. "Clients (4/5)")

### Onboarding + Email

- **O.1 — Dashboard intro section**
  - Introductory content in the Dashboard for new/returning users
  - Design TBD — needs thought on what to include

- **O.2 — Step-by-step walkthrough popup**
  - Multi-step overlay walkthrough (like software update tours)
  - Shows every login until user explicitly dismisses
  - Re-trigger option in Settings or Help ("Take the tour")
  - Re-shows automatically when new features are added (version-gated)
  - Final step: CTA clearly showing free-tier limits vs Pro (unlimited)
  - Track walkthrough version + dismissed state in `business_info` jsonb
    or dedicated `onboarding_state` column

- **O.3 — Transactional email**
  - Customise Supabase auth email templates (signup confirmation, password reset)
  - Brand styling matches the app
  - Test deliverability — check spam scoring, SPF/DKIM/DMARC

### Production Ops

- **P.1 — Production Supabase env separate from dev**
  - Create second Supabase project for production
  - Run all migrations in production (re-apply from SCHEMA.md)
  - Update production env vars in Cloudflare Pages
  - Test signup against prod DB
  - Document the project ref change required in `db.js` (currently hardcoded)

- **P.2 — Automated DB backups**
  - Verify backup schedule on the Supabase plan
  - Document restore procedure in a new `Building Docs/ops-runbook.md`

- **P.3 — Error logging (Sentry)**
  - Sign up for Sentry free Developer plan (5k errors/mo, 30-day retention)
  - Install `@sentry/browser` + `@sentry/vite-plugin`
  - Wire client-side error capture in `src/main.js` (init early, before app code)
  - Configure source-map upload in GitHub Actions via `SENTRY_AUTH_TOKEN` secret
  - Disable Replay/Profiling integrations to keep bundle ~30 KB gz
  - Set up email alerts for new issues + error-rate spikes
  - Re-evaluate at ~500 users: stay on Team ($26/mo) or migrate to Better Stack

- **P.4 — Cross-browser smoke test**
  - Chrome, Safari, Firefox, Edge — desktop
  - iOS Safari, Android Chrome — mobile
  - Run after Stripe + free-tier limits land
  - Document rough edges in `SMOKE_TESTS.md`

- **P.5 — End-to-end signup → upgrade → cancel test**
  - Run after S.8 in production environment
  - Document in `SMOKE_TESTS.md`

### Pre-Launch Content

- **C.1 — Landing page placement** ✅ *(resolved: app stays at root)*
  - No routing change needed — `procabinet.app` remains the app
  - Marketing/landing content lives within the app shell (logged-out view or
    dashboard intro section)

- **C.2 — Landing page build**
  - Hero, features, pricing, CTA
  - Pricing comparison table (Free vs Pro)
  - Testimonials section (placeholder until beta feedback)
  - Email capture for waitlist

- **C.3 — Demo video (2 min)**
  - Script: client → project → quote → cut list → PDF
  - Record (Loom / Screen Studio / OBS)
  - Embed on landing page

- **C.4 — SEO blog posts (3 launch posts)**
  - "Best cut list software 2026"
  - "How to price cabinet jobs"
  - "Reduce plywood waste with smart nesting"
  - Decide hosting: separate `/blog` route, Notion, or Substack

- **C.5 — Analytics + Search Console (PostHog + Cloudflare Web Analytics)**
  - Sign up for PostHog Cloud (free tier: 1M events/mo, 5k replays/mo)
  - Install snippet in `index.html` (gated by env so dev doesn't pollute data)
  - Wire key events: signup, first project created, first quote created, first
    PDF export, hit-free-tier-limit, upgrade clicked
  - Build core funnels: signup → first quote → first PDF
  - Enable Cloudflare Web Analytics for marketing-site numbers (free, auto on Pages)
  - Verify Google Search Console + submit sitemap

- **C.6 — Beta outreach (10 cabinet makers)**
  - List candidates from existing network + targeted forums
  - Draft outreach template
  - Track responses in a spreadsheet

- **C.7 — Launch announcement copy**
  - Reddit (r/woodworking, r/cabinetmaking)
  - Product Hunt
  - Hacker News (Show HN)
  - IndieHackers
  - Email to waitlist

### Launch Week (5–14 May 2026)

- **L.1 — Soft launch to beta testers**
  - Enable beta access via a coupon / role flag
  - Collect feedback in a structured form

- **L.2 — Critical bug triage**
  - Daily standup with self / collaborators
  - Bug list with severity + ETA

- **L.3 — Public posts (sequenced over the week)**
  - r/woodworking and r/cabinetmaking
  - Facebook cabinet-making groups
  - SawmillCreek and WoodworkingTalk forums
  - Product Hunt submission (Tuesday for best traffic)
  - Show HN post (mid-week)
  - IndieHackers
  - Email to waitlist subscribers

- **L.4 — First-week dashboard**
  - Daily signup count
  - Activation rate (% who created a project)
  - Free → Pro conversion
  - Support response SLA

---

## Mobile + Responsive

From `Building Docs/ProCabinet_Outstanding_Features.docx`. Can run in parallel
with Stripe / Free-tier work; required before public launch.

- **M.1 — Per-module responsive layout pass**
  - Dashboard
  - Stock
  - Cabinet Builder *(hardest — sidebar + main panel layout)*
  - Quotes
  - Orders
  - Schedule
  - Clients
  - Cut list *(also hard — canvas resize)*

- **M.2 — Mobile navigation**
  - Decision: bottom tab bar vs drawer
  - Implement chosen pattern
  - Tap targets ≥44px throughout

- **M.3 — Popups, tables, filter bars on narrow screens**
  - Popups full-screen on mobile (already partially done — verify)
  - Tables scroll horizontally with sticky first column
  - Filter bars collapse to a "Filters" button

- **M.4 — PWA manifest + home-screen icon**
  - Generate icon set (192, 512, maskable)
  - `manifest.webmanifest` with app metadata
  - Service worker for offline shell *(optional)*

- **M.5 — Device testing**
  - iOS Safari (iPhone)
  - Android Chrome
  - iPad Safari (workshop tablet use case)

---

## UI Polish + Design Finalisation

From `Building Docs/ProCabinet_Outstanding_Features.docx`. Run before launch.

- **U.1 — Lock in design system**
  - Document colour palette (light + dark)
  - Document type scale + spacing tokens
  - Audit icons for consistency

- **U.2 — Consistent buttons / forms / popups across modules**
  - Audit pass: all primary actions same colour + size?
  - Form-input padding + border radius consistent?
  - Popup chrome consistent (header, close, footer pattern)?

- **U.3 — Empty / loading / error states**
  - Every list view: "no items yet" empty state with CTA
  - Every async action: loading indicator
  - Every catch: user-facing error toast (no silent swallow)

- **U.4 — Polish printable outputs**
  - Quote PDF: header, line breaks, page numbers
  - Order PDF: same
  - Cut list PDF: legend, scale indicator

- **U.5 — Settings page polish**
  - Group settings logically (Business / Defaults / Subscription / Account)
  - Inline help text per setting

- **U.6 — Accessibility pass**
  - Tab order makes sense in every popup
  - Visible focus states
  - Sufficient contrast (WCAG AA minimum)
  - All inputs have labels

- **U.7 — Final user test with 3–5 cabinet makers**
  - Recruit from beta outreach (C.6)
  - Watch them use the app cold
  - Capture friction points

- **U.8 — Stock library: card grid → grouped spreadsheet**
  Replace the current `.stock-grid`/`.stock-card` rendering in
  `renderStockMain()` (`src/stock.js:687`) with a single-table spreadsheet
  layout — collapsible category group rows, qty as a coloured pill (green =
  OK, red = low) with inline-editable input, hover-revealed icon actions
  (Edit / Cut List / Reorder).
  - Line weights match V2 mockup: outer `1px var(--border)`, header bottom
    `1px var(--border)` — same token as summary cards / inputs / pills, so
    other tabs unify when we redo them. (Mockups in `mockups/option-d1-*`.)
  - Themed via existing `var(--surface)` / `var(--border)` / `var(--text)` /
    `var(--success)` / `var(--danger)` so dark mode works automatically.
  - Per-user collapsed group state persisted to
    `localStorage['pc_stock_groups_collapsed_<userId>']`. (Local-only for
    now; promote to a `business_info.ui_prefs` jsonb column later if
    cross-device sync becomes desired.)
  - Scope: Stock tab only this round. Apply same line-weight/header
    treatment to Clients / Projects / Quotes / Orders / Cutlist in a
    follow-up.

- **U.9 — Projects tab: cross-tab action strip** ✅ Done 2026-05-06
  Replace the thin project card in `renderProjectsMain()` (`src/clients.js:274`)
  with a per-project always-visible 4-button action strip (Cabinets · Cut Lists
  · Quotes · Orders) so the project line connects outward to the producing
  tabs. Mockup approved: `mockups/option-3-row-action-strip.html`.
  - Each button: icon + label + count (when in-memory) + `+` segment.
  - `+` segment → `_newCabinetForProject` / `_newCutListForProject` /
    `_newQuoteForProject` / `_newOrderForProject` — each calls
    `switchSection()` and pre-fills the destination tab's project smart-input.
  - Body click on quote/order buttons drills into that tab via
    `window._quoteSearch` / `window._orderSearch` (same pattern already used in
    `_openProjectPopup` at `src/app.js:838`).
  - All 4 counts wired: Quotes/Orders from in-memory arrays; Cabinets from
    cached `q._lines` (populated by `_hydrateQuoteTotals`); Cut Lists from
    `_projectsWithCutLists` Set populated by a one-shot parallel query of
    `pieces` + `sheets` `project_id` columns in `_loadCutListProjectIds()`.
    Refreshed on every Projects-tab visit via `switchSection`.
  - CSS: new `.proj-card` / `.proj-strip` / `.proj-act` etc. classes added to
    `styles.css` using `var(--*)` tokens so dark mode works automatically.
    Replaces the inline-style template in `clients.js:299`.

---

## Backlog

### Small follow-ups (housekeeping)

- **H.1 — Derive Supabase auth-token localStorage key from URL**
  `src/db.js:23` currently hardcodes `sb-mhzneruvlfmhnsohfrdo-auth-token`.
  Derive it from `window._SBURL` (parse the project ref out of the host)
  so the codebase isn't tied to one Supabase project. Becomes blocking when
  P.1 (production Supabase env) lands.

- **H.2 — Rotate Supabase password**
  *(User-side; only Adam can do this.)* Password leaked into chat transcripts
  during the 2026-05-04 dev test-signin setup when `.env.local` ended up
  containing literal `echo` commands and had to be debugged via file-read.
  Use the Supabase dashboard password reset, then update `.env.local`.

- **H.3 — Catalog edits collision audit**
  Once 4.1 lands, verify that materials/hardware/finishes edits don't race
  with `_applyCatalogFromDB` on auth refresh (same race-guard pattern that
  Phase 1.5 and Phase 3 needed for cbLines / cbSettings).

- **H.4 — Bump GitHub Actions to Node 24 / actions@v5**
  Already opted into Node 24 (commit `e1ecd75`) and Dependabot enabled
  (commit `3417b7f`). Watch for the June 2026 deprecation deadline; likely
  no further action needed.

### Refactor backlog (deferred from SPEC.md)

Technical debt parked during the pre-launch refactor. Pick up opportunistically
or before specific features that touch these areas.

- **R.1 — Split `src/cabinet.js`** (currently 2,543 lines, SPEC § 7 target <1500)
  - Identify natural split points (settings UI, line CRUD, calc engine, render, library, quote conversion)
  - Extract `src/cabinet-calc.js` (the 14-step `calcCQLine` pipeline per Cabinet_Builder_Guide.docx)
  - Extract `src/cabinet-render.js` (the render functions)
  - Extract `src/cabinet-library.js` (save/load to `cabinet_templates`)
  - Smoke test after each carve
  - Phase 4 cleanup landed 2026-05-05 (cbSavedQuotes + cbProjectLibrary removed). File still ~2,500 lines after Phase 4 — carve work is now actionable when prioritised.

- **R.2 — Split `src/cutlist.js`** (currently 2,946 lines, SPEC § 7 target <1500)
  - Extract `src/cutlist-layout.js` (guillotine algorithm + canvas drawing)
  - Extract `src/cutlist-render.js` (sheet/piece tables)
  - Extract `src/cutlist-edge.js` (edge band UI + assignment)
  - Extract `src/cutlist-pdf.js` (PDF + print pipeline)
  - Smoke test after each carve

- **R.3 — Cut-list shadow-name unification (~30 sites)**
  - Replace `thickness` / `width` / `length` shadows with `thickness_mm` /
    `width_mm` / `length_m` everywhere
  - Drop the load-time hydration map in `app.js loadAllData`
  - Drop the intersection type in `stock.js`

- **R.4 — Relocate stragglers to conceptual homes**
  - `clients` array declaration → `clients.js` (currently in `stock.js`)
  - `projects` array declaration → `projects.js` (currently in `stock.js`)
  - `_clProjectCache` declaration → `clients.js` (currently in `cabinet.js`)
  - All cosmetic; do alongside R.1 / R.2 if convenient

### Deferred (don't pick up unless something forces it)

- **`.js` → `.ts` file extension rename** — purely cosmetic. JSDoc +
  `checkJs:true` + `strict:true` already gives full type-safety coverage.
  The Vite dev server serves `.js` directly via classic-script tags;
  renaming would force a Vite-plugin to compile `.ts` for non-module loading.

- **Inline-handler migration to `addEventListener`** — 411 inline `onclick=` /
  `oninput=` attributes across rendered HTML. Only revisit if
  Content-Security-Policy enforcement, accessibility audit, or team-size
  increase forces it.

- **`orders.value` workaround** ✅ *(resolved 2026-05-06 by line-items rewrite)*
  Added `markup` + `tax` columns to `orders`; `value` is now recomputed from
  `order_lines` on every save. Column kept as a denormalised snapshot for
  fast dashboard queries.

---

## Open Decisions

Decisions that block specific work below them.

- **D.1 — Free-tier enforcement style** ✅ *(resolved 2026-05-05)*
  Full functionality, 5-item cap per library, hard block + upgrade modal.
  No feature gates, no free trial. See F.1–F.3 above.

- **D.2 — Landing page placement** ✅ *(resolved 2026-05-05)*
  App stays at root. Onboarding handled via dashboard intro section +
  walkthrough popup. See O.1–O.2 above.

- **D.3 — Path C cabinet redesign** *(unblocked — Phase 4 landed 2026-05-05; decision now actionable)*
  The `cabinet_templates` DB table currently doubles as the saved-cabinet
  library. "Real" cabinet instances inside a project are written to
  `quote_lines`. This works but conflates two concepts.
  - Option A: keep current setup. No work. **Recommended unless a user-facing
    problem surfaces** — Phase 4 cleanup didn't expose pain here.
  - Option B: promote `cabinets` table to first-class instances (was created in Phase 1, currently unused).
  - Option C: unify — one `cabinet_designs` table with `is_template` flag and optional `project_id`.
  - Defer until a concrete user-facing need (e.g. "I want a cabinet template
    that's actually scoped to one project") makes the migration worth the cost.

- **D.4 — Analytics provider** ✅ *(resolved 2026-05-05: PostHog + Cloudflare Web Analytics)*
  PostHog free tier (1M events, funnels, retention, 5k session replays/mo) for
  in-app product analytics. Cloudflare Web Analytics (free, auto on Pages) for
  marketing-site numbers. No cookie banner needed for either. Re-evaluate at
  scale or migrate to Plausible ($9/mo) if simplicity becomes more valuable
  than depth. See C.5.

- **D.5 — Error logging provider** ✅ *(resolved 2026-05-05: Sentry)*
  Sentry free Developer plan (5k errors/mo, 30-day retention). Best Vite
  source-map automation via `@sentry/vite-plugin` + GitHub Actions. Disable
  Replay/Profiling to keep bundle ~30 KB gz. Re-evaluate at ~500 users
  whether to stay on Team ($26/mo) or migrate to Better Stack (best free tier
  in class: 100k exceptions + replay + uptime + status page). See P.3.

---

## Resolved / historical (no action)

Tracked here so PLAN.md remains the single source of truth. None of these
require work — they document deviations from SPEC.md and implicit
resolutions that closed during the pre-launch refactor. Full history in
`SPEC.md § 13`.

### SPEC § 7 success criteria — deviations accepted

- **File-size target (<1500 lines per file) — partially met.**
  `src/cabinet.js` (~2,543) and `src/cutlist.js` (~2,946) exceed the target.
  Tracked as actionable items R.1 + R.2 in the refactor backlog; the
  deviation itself is accepted indefinitely as zero-user-impact debt.
- **`<script type="module">` migration — deferred indefinitely.** Original
  SPEC called for ES modules in `index.html`; shipped instead with classic
  `<script defer>` tags loading the carved files. ES-module conversion
  would require ~80–100 `window.X` shims for inline event handlers across
  411 attributes — low-value churn vs zero user benefit. Decision in
  SPEC § 13 2026-04-28 ("Phase 6 PARTIAL").

### SPEC § 9 open questions — implicitly resolved

| SPEC § 9 question | Resolution |
|---|---|
| Cabinet systems unification (now or post-launch) | Done as **Item 2** — all 4 phases complete (2026-05-05). |
| Catalog storage (per-user tables vs jsonb) | **Unified `catalog_items` table** with `type` column (`material` / `handle` / `finish` / `hardware`). See `SCHEMA.md § 3.2`. |
| Logo storage | **Supabase Storage** at `business-assets/{user_id}/logo.{ext}` (Phase 3.3). |
| Quote sources (`cbSavedQuotes` LS or DB) | **DB sole source of truth.** `cbSavedQuotes` removed in Phase 4.2 (2026-05-05). |
| Vite (in scope or post-launch) | **In scope, shipped** (Item 3 phases A/B/D, 2026-04-30). |
| Types (JSDoc / TS / neither) | **JSDoc + `checkJs:true` + `strict:true`** across all 19 src files. Stayed `.js`; `.ts` rename in Backlog → Deferred. |
| Migration approach (big-bang or phased) | **Phased.** Schema → migration code → reads → CSS extract → JS extract → module split → cleanup. |
| Existing data preservation | **One-shot `migrateLocalToDB()`** in `src/migrate.js`, idempotent, exposed via Settings → Backup & Migration. |
| Smoke test list | **Written as `SMOKE_TESTS.md`.** Referenced from P.4 / P.5. |

### Other historical resolutions

- **Path B chosen for cabinet templates vs instances** (architecture-level).
  `cabinet_templates` table backs the saved-cabinet library; cabinet
  instances inside projects are written to `quote_lines`. Path C
  (full unification with `is_template` flag) tracked separately in **D.3**
  if a future user-facing problem makes it worth the migration.
- **`cq*` → `cb*` symbol-prefix rename — complete.** Verified by
  `grep -rE "\bcq[A-Z]" src/ index.html` returning zero matches
  (2026-05-05). Old `pc_cq_*` localStorage keys still referenced
  intentionally in `src/migrate.js` to read legacy data during migration;
  Phase 4.3 (2026-05-05) removed the runtime `cbProjectLibrary` consumer but
  kept the legacy-read helper in `migrate.js` for one-time migration.
- **GitHub Actions Node-24 deadline (June 2026).** Already opted in via
  `lts/*` (commit `3417b7f`) and explicit Node 24 (commit `e1ecd75`).
  Tracked in Backlog → Housekeeping H.4; no further action expected.

---

## Post-Launch Growth (Months 2–12)

From `Building Docs/ProCabinet_ToDo_List.docx`. Not actionable yet but tracked
for visibility.

- **G.1** — One SEO blog post per week
- **G.2** — One YouTube tutorial per month
- **G.3** — Weekly presence in woodworking subreddits and forums
- **G.4** — Outreach to plywood / sheet-goods suppliers for co-marketing
- **G.5** — Build referral programme (1 free month per converted referral)
- **G.6** — Monthly feature release with in-app announcement
- **G.7** — In-app NPS survey after 30 days of use
- **G.8** — Track KPIs (target ranges)
  - Signup → active: 60%
  - Free → Pro: 10–15%
  - Churn: <5%
  - CAC: <$15

---

## Milestones

| Date | Target |
|------|--------|
| May 2026 | 50 signups in first week |
| June 2026 | First 5 paying Pro subscribers ($145 MRR) |
| August 2026 | 200 free / 25 Pro ($725 MRR) |
| November 2026 | Production scheduling module live (Pro exclusive) |
| February 2027 | 1,000+ free / 140+ Pro ($4,000+ MRR) |
| May 2027 | Year 1 anniversary — Shop tier launched (multi-user) |

---

## Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Frontend | Vite + plain HTML/CSS/JS (no framework) — 19 source files split by domain | ✅ Done |
| Type-checking | TypeScript strict mode via JSDoc + `checkJs:true` | ✅ Done |
| Auth + Database | Supabase (Postgres + RLS, project `mhzneruvlfmhnsohfrdo`) | ✅ Done |
| Hosting | Cloudflare Pages — auto-deploy via GitHub Actions on push to `main` (~40s build) | ✅ Done |
| Domain | procabinet.app (DNS via Cloudflare nameservers; Bot Fight + leaked-creds mitigation on) | ✅ Done |
| Storage | Supabase Storage (`business-assets` bucket for logos) | ✅ Done |
| Payments | Stripe | ✅ Test mode shipped (S.2–S.7); live-mode flip pending (S.9) |
| Email | Supabase auth defaults | ⬜ Needs branding |
| Analytics | PostHog (in-app) + Cloudflare Web Analytics (marketing) | ⬜ Not started |
| Error logging | Sentry (free Developer plan) | ⬜ Not started |

---

## Monthly Cost

| Service | Cost |
|---------|------|
| Cloudflare Pages | Free |
| Supabase | Free tier (until ~10k MAU) |
| Stripe | Free (2.9% per transaction once integrated) |
| Domain | ~$1/mo |
| PostHog (free tier: 1M events, 5k replays) | Free |
| Cloudflare Web Analytics | Free |
| Sentry (free Developer plan: 5k errors/mo) | Free |
| **Total** | **~$1/mo until scale** |
