# Pre-Launch Refactor Spec

> **Status:** Implemented (2026-04-29)
> **Author:** [you]
> **Date:** [today]
> **Decision deadline:** [pick a date — forces you to stop discussing and start]

This spec covers the structural work to be done **before launch**: moving app
data off localStorage into Postgres, splitting the god file into modules, and
optionally adding a build step. It does not cover post-launch features.

Companion docs:
- `PLAN.md` — launch-level plan (stack, hosting, payments)
- `SCHEMA.md` — detailed database schema (to be drafted)
- `index.html` — current app (god file, ~11,400 lines)

---

## 1. Problem

ProCabinet works as a prototype but is structured for throwaway code, not for
launch:

- **Data is split between Supabase and localStorage**, with most app data
  (sheets, pieces, edge bands, cabinets, quote lines, catalogs, biz info) in
  localStorage. This means: no multi-device sync, no backups, no real reports,
  no path to teams.
- **The codebase is one 11,430-line `index.html`** with 408 functions, 369
  inline event handlers, and ~30 top-level mutable globals. Every change
  touches the same file; every typo can break unrelated features.
- **Two parallel subsystems exist** (Cabinet Builder + Cabinet Quote) with
  overlapping schemas — clarity debt that will only compound.

> **TODO:** In your own words, what's the *one sentence* you'd say to describe
> why this needs to happen now? Write it here. If you can't, you're not ready
> to start.

---

## 2. Why now

- **Pre-launch is the only free window for schema changes.** Once real users
  have real data, every column rename is a migration with risk.
- **The god file's pain compounds per feature.** Every new feature added now
  is one more thing to detangle later.
- **AI-assisted iteration is materially faster on modular code** — the
  workflow you already use benefits directly from this refactor.

> **TODO:** What's the *deadline* or *trigger* that makes "now" the right
> time? (First customer demo? End of month? Just want it done?)

---

## 3. Goals (in priority order)

1. **All app data persists in Postgres** — zero functional data in
   localStorage (UI prefs only).
2. **Code is split into feature modules** under ~1000 lines each, no god file.
3. **A new feature can be prototyped in one file** without touching the rest
   of the app.
4. **The app supports cross-project queries** ("most-used cabinet sizes",
   "edge banding consumed YTD") via real SQL.
5. **Deployment works end-to-end** on a real domain with auth, with no manual
   localStorage seeding.

> **TODO:** Reorder these. Cross out any you don't actually care about. Add
> anything missing.

---

## 4. Non-goals (explicit)

These are tempting but **out of scope**:

- Switching to React / Vue / Svelte (vanilla JS stays)
- Adding new features during the refactor
- Writing tests retroactively (smoke testing only)
- Multi-user / team support (single-user-per-account stays)
- Mobile native app
- Rewriting cut-list optimization algorithm
- Public API or third-party integrations
- Perfect code — "good enough to launch" is the bar

> **TODO:** Anything to add? The point of this section is to give you
> ammunition when you're tempted mid-refactor to "just also fix X."

---

## 5. Constraints

| Constraint | Value |
|---|---|
| Time budget | [days/hours you'll allow] |
| Tech stack | Vanilla JS, Supabase Postgres, no framework |
| Build step | [allowed: yes/no — affects whether Vite is in scope] |
| Downtime tolerance | [pre-launch = unlimited; otherwise specify] |
| Solo or assisted | Solo + AI-assisted |
| Browser support | [modern only? mobile Safari? IE?] |
| Hosting | [Netlify per PLAN.md? Other?] |

> **TODO:** Be honest about the time budget. If you can't commit to N days,
> scope down — don't optimistically plan and then bail halfway.

---

## 6. Scope

### In scope

- [ ] Database schema redesign (per `SCHEMA.md`)
- [ ] Migrate all localStorage data to Postgres tables
- [ ] Extract CSS to `styles.css`
- [ ] Split JS into ES modules under `src/`
- [ ] Add `window.X` exports for inline event handlers
- [ ] Convert global mutable state to a shared `state` object
- [ ] Smoke test every feature
- [ ] Deploy to production domain

### Optional / stretch

- [ ] Add Vite (build step, HMR, optional TypeScript)
- [ ] Generate Supabase types and adopt JSDoc/TS for type-checking
- [ ] Move logo from base64 to Supabase Storage
- [ ] Unify Cabinet Builder + Cabinet Quote into one system

### Explicitly deferred

- Tests (deferred until after launch)
- Performance optimization (deferred unless something is unusable)
- Real-time collaboration (deferred indefinitely)

> **TODO:** Move items between in/optional/deferred based on your time
> budget. Be ruthless — anything in "in scope" must actually ship.

---

## 7. Success criteria

The refactor is done when **all of these are true**:

- [ ] `grep -r "localStorage.setItem" src/` returns only UI-pref keys
- [ ] `index.html` contains no `<script>` block (only `<script type="module" src="...">`)
- [ ] `index.html` contains no `<style>` block (only `<link rel="stylesheet">`)
- [ ] No single source file exceeds 1500 lines
- [ ] Manual smoke test passes (see § 11)
- [ ] A fresh browser (incognito) can sign up, create a client, project, cut
      list, edge band, quote, and order — and refreshing preserves everything
- [ ] Opening the app on a second device shows the same data
- [ ] At least one cross-project SQL query (e.g. "all edge bands used this
      month") runs successfully in Supabase SQL editor
- [ ] Production deploy is reachable at the public URL with HTTPS

> **TODO:** Add measurable criteria specific to your launch goals. Avoid
> vague ones like "code is cleaner" — they can't be ticked off.

---

## 8. Failure modes

What could go wrong, and how you'd know:

| Failure mode | Signal | Mitigation |
|---|---|---|
| Scope creep — refactor becomes a rewrite | More than 2× over time budget | Re-read § 4; cut features |
| Data loss migrating localStorage to DB | Smoke test reveals missing data | Export-to-JSON tool first; keep localStorage as fallback for one release |
| Module split breaks inline handlers silently | Buttons do nothing in production | Smoke test every clickable element; grep `onclick=` and verify each function is on `window` |
| State migration introduces stale-reference bugs | UI shows old data after edits | Audit reads of mutated state; rely on render-after-write pattern |
| Half-done state — half migrated, app inconsistent | App works in dev, breaks under real use | Land each phase as its own commit; never merge a half-finished phase |
| Hidden cross-feature coupling discovered mid-refactor | Module A fails because of Module B | Keep `app.js` checkpoint commit so you can bail to single-file if needed |
| Vite setup eats a day | Build won't deploy | Time-box Vite to 4 hours; if not working, defer |
| Burnout / abandonment | You stop after phase 1 | Front-load DB normalization (the irreversible one); accept that "modules later" is a valid stop |
| Schema design has gaps revealed by code | Need to add columns mid-build | Keep migrations additive; never destructive until every feature uses the new shape |
| Logo / image data too large for jsonb | Insert fails or quota errors | Move to Supabase Storage from day one |

> **TODO:** Add modes specific to your situation. The point isn't to prevent
> every failure — it's to recognize one when it happens, instead of pushing
> through.

---

## 9. Open questions (resolve before starting)

- [ ] **Cabinet systems**: Unify `cabItems` + `cqLines` now, or after launch?
- [x] **Catalog storage**: ~~Per-user tables (`materials_catalog`) or single
      jsonb column on `business_info`?~~ **Resolved** — single unified
      `catalog_items` table with a `type` column (`material` | `handle` |
      `finish` | `hardware`). Type-specific extras live in a `specs jsonb`
      field on the row. See `SCHEMA.md` § 3.2.
- [ ] **Logo**: Supabase Storage now, or leave as base64 in `business_info`?
- [ ] **Quote sources**: Drop `cqSavedQuotes` localStorage entirely, or keep
      as offline cache?
- [ ] **Vite**: In scope, or post-launch?
- [ ] **Types**: JSDoc comments, full TypeScript, or neither?
- [ ] **Migration approach**: Big-bang (one PR, one deploy) or phased (data
      layer first, code layer second)?
- [ ] **Existing data**: Is there any localStorage data in your current
      browser worth preserving? Export it before starting.
- [ ] **Smoke test list**: What's the minimum click-through that proves
      everything works? (Write this list before phase 1 — see § 11.)

> **TODO:** Don't start until every box is either ticked or explicitly marked
> "decide later." Open questions during a refactor become mid-refactor
> decisions, which become bugs.

---

## 10. Phases

High-level only — granular task list goes in `PLAN.md` or a new `REFACTOR_PLAN.md`.

| # | Phase | Estimate | Description |
|---|---|---|---|
| 0 | Prep | ~2 hr | Export current localStorage to JSON. Snapshot the DB. Write the smoke test list. |
| 1 | Schema | ~1 day | Apply migrations for new tables. RLS policies. Verify in Supabase SQL editor. |
| 2 | Data migration code | ~1 day | Write `migrateLocalToDB()` one-shot in current `index.html`. Run it; verify all data lands in tables. |
| 3 | Code reads from DB | ~1 day | Replace localStorage reads with Supabase queries throughout. App still in one file. Smoke test. |
| 4 | CSS extraction | ~1–2 hr | Pull all `<style>` blocks into `styles.css`. |
| 5 | JS extraction | ~30 min | Pull `<script>` content to `src/app.js`. Verify. |
| 6 | Module split | ~1 day | Split `app.js` into feature modules with imports/exports and `window.X` bindings. Smoke test. |
| 7 | Cleanup | ~2 hr | Delete dead code surfaced by the split. |
| 8 | Optional | varies | Vite, types, etc. — only if Phases 1–7 stayed under budget. |
| 9 | Launch | varies | Production deploy. Real-domain click-through. Done. |

> **TODO:** Each phase = one commit minimum. Never start a phase before the
> previous one is committed and smoke-tested.

---

## 11. Smoke test checklist

Write this **before** starting Phase 1. It's how you'll verify each phase. A
starter:

- [ ] Sign up new user, sign in, sign out
- [ ] Create / edit / delete a client
- [ ] Create / edit / delete a project
- [ ] Add stock items; edit category, supplier, variant
- [ ] Cut list: add panels, add pieces, generate layout
- [ ] Add edge bands; assign to piece sides
- [ ] Cabinet Quote: add cabinet line, edit dimensions/materials, save quote
- [ ] Convert quote to order
- [ ] Update business info; upload logo; verify on PDF export
- [ ] Export PDF, export CSV, import CSV
- [ ] Toggle dark mode, change units, change currency
- [ ] Refresh page → all data persists
- [ ] Sign in on a second browser → same data appears

> **TODO:** Add anything specific to your workflow. Keep it minimal — this is
> a per-phase test, not a full QA pass.

---

## 12. Definition of done

- [ ] All success criteria (§ 7) ticked
- [ ] All in-scope items (§ 6) shipped
- [ ] No regressions found in smoke test (§ 11)
- [ ] Production URL works
- [ ] `SPEC.md` updated with anything learned, marked **Status: Implemented**
- [ ] Outstanding bugs filed as separate issues, not blockers

---

## 13. Decisions log

Append a one-line entry here every time you make a non-obvious decision
mid-refactor. Future-you will thank present-you.

- 2026-04-27 — **Catalog design**: unified `catalog_items` table with `type` column instead of separate `materials_catalog` / `handles_catalog` / `finishes_catalog` tables. Rationale: identical row shape across types; one place to manage prices; new categories become rows, not tables. See `SCHEMA.md` § 3.2.
- 2026-04-27 — **`SCHEMA.md` drafted** — full schema with DDL, RLS patterns, migration order. Marked Status: Draft pending review.
- 2026-04-28 — **Refactor scoped to Phases 0-3** (data layer only). Phases 4-7 (CSS/JS extraction, module split, destructive migrations, deploy) deferred to a follow-up refactor session, with prototyping in between. Plan at `~/.claude/plans/lets-plan-the-refactor-wobbly-lighthouse.md`.
- 2026-04-28 — **Vite deferred** — vanilla ES modules with no build step remain the target for the eventual module split.
- 2026-04-28 — **Cabinet systems unification deferred** to post-launch. `cqLines` migrates to `quote_lines`; `cabItems` migrates to `cabinet_templates`. Both subsystems coexist during refactor.
- 2026-04-28 — **Logo storage**: Supabase Storage bucket `business-assets/`, URL on `business_info.logo_url`. Replaces base64 in `pc_biz_logo`.
- 2026-04-28 — **Migration approach**: phased per-feature (not big-bang). Dual writes (DB + localStorage) maintained through Phase 3 and during prototyping pause as safety net.
- 2026-04-28 — **Orphan localStorage keys resolved**: `pc_stock_libraries` dropped (no migration target — `stock_items` is source of truth); `pc_order_prodstarts` → new `orders.production_start_date` column; `pc_cq_settings` rates → new columns on `business_info`; `pc_cq_projects` → migrate to `projects` + `quote_lines` rows.
- 2026-04-28 — **Phase 0 (Prep) complete**: `SMOKE_TESTS.md` created at project root; Supabase JSON snapshot at `Building Docs/snapshots/2026-04-28-prelaunch.json` (28 rows across 5 tables); `_exportLocal()` button added to Settings panel (`index.html` lines 1233-1241, function at line 3028).
- 2026-04-28 — **Phase 1 (Schema additive) complete**: 9 migrations applied to Supabase project `mhzneruvlfmhnsohfrdo`. Created 11 new tables (`business_info`, `catalog_items`, `cabinet_templates`, `cabinets`, `cabinet_hardware`, `sheets`, `edge_bands`, `pieces`, `piece_edges`, `quote_lines`, `order_lines`); added 9 columns to `stock_items`, 4 to `orders`, 2 to `quotes`. All new tables have RLS enabled with full owner CRUD policies (4 policies each), except `piece_edges` which uses chained-ownership Pattern B (1 ALL policy). All 28 existing rows across the original 5 tables verified intact post-migration. No security advisor warnings related to the new schema.
- 2026-04-28 — **Phase 1.5 (Unify project-save) complete**: new `_saveProjectScoped({ name, scope, payload })` at `index.html` line 8087 ensures one canonical `projects` row per `(user_id, name)`. Both `_clSaveProjectByName` (line 8119) and `cqSaveProject` (line 9039) now call it — Cut List with `scope: 'cutlist'`, Cabinet Quote with `scope: 'quote'`. Scope payload is merged into `projects.data` jsonb under `data.cutlist` / `data.quote` for now (Phase 3 will switch to writing into child tables). cqSaveProject still ALSO writes to `pc_cq_projects` localStorage for backward compatibility through the prototyping window.
- 2026-04-28 — **Phase 2 (Migration) complete**: Storage bucket `business-assets` created (public, 512KB max, image MIME types only) with owner-folder RLS policies on `storage.objects`. New `migrateLocalToDB()` orchestrator at `index.html` line 3475 runs 9 idempotent subroutines: `_migrateBizInfo`, `_migrateCatalog`, `_migrateStock`, `_migrateCabinets`, `_migrateCutListProjects`, `_migrateCQProjects`, `_migrateSavedQuotes`, `_migrateOrderRefs`, `_dropStockLibraries`. Idempotency via tag-based notes (`[CQMIG:id]`, `[SAVEDMIG:id]`) on `quotes` and check-then-insert pattern on `catalog_items` / `cabinet_templates`. Logo upload migrates `pc_biz_logo` base64 → Supabase Storage `business-assets/{user_id}/logo.{ext}`. UI: "Run Migration to Database" button in Settings → Backup & Migration; results shown in `_showMigrationLog()` modal with summary line and per-subroutine status. JS parses cleanly (519KB, 12,030 lines total).
- 2026-04-28 — **Phase 3 (all 8 features) complete** with **fallback-safe pattern**: each helper checks DB column / array first, falls back to localStorage if empty. Safe to land before/regardless of when migration runs. Done: **3.1 Stock metadata** — `_scGet/_ssGet/_svGet` prefer `stockItems[i].category/supplier/...` over localStorage maps; setters dual-write via new `_stockUpdateCols(id, updates, lsKey, lsValue)` helper. **3.2 Catalogs** — `loadAllData` extended to load `catalog_items` and `business_info` in parallel; new `_applyCatalogFromDB(rows)` overlays material/handle/finish arrays onto `cabSettings`/`cqSettings`. **3.3 Business info** — `_applyBizInfoFromDB(rows)` updates form inputs and rate defaults from DB; `saveBizInfo` now triggers debounced `_syncBizInfoToDB(payload)` (800ms); `handleLogoUpload` uploads to Storage `business-assets/{user_id}/logo.{ext}` and writes URL to `business_info.logo_url`. **3.4 Cabinets** — new `_loadCabItemsFromDB()` overlays `cabinet_templates` rows into `cabItems` on auth; `saveCabItems` triggers debounced `_syncCabItemsToDB()` (800ms) which INSERTs new and UPDATEs existing (tracked by `cab.db_id` field); `removeCabinetItem` also DELETEs the corresponding `cabinet_templates` row. **3.5 Cut list** — `loadProject(id)` queries `sheets`/`pieces`/`edge_bands` tables for the project; falls back to `projects.data` jsonb if DB child rows are empty; `_saveProjectScoped` for `scope: 'cutlist'` now calls `_replaceCutListChildTables(projectId, payload)` (REPLACE semantics). `_clSaveProjectByName` payload extended to include `edgeBands`. **3.6 Cabinet Quote** — `_saveProjectScoped` for `scope: 'quote'` calls `_replaceQuoteLinesChildTable(projectId, payload)`; finds-or-creates a tagged `[CQ_DEFAULT]` quote per project, deletes old `quote_lines` and inserts current `cqLines` via shared `_cqLineToRow()` helper. **3.7 Quotes UI** — Quote popup now has a "Quote Number" input (`pq-quote-number`); `_saveQuotePopup` writes `quote_number` to the `quotes` table. **3.8 Order helpers** — `_oqGet/_oqSet`, `_onGet/_onSet`, `setOrderProdStart`, `_restoreProdStarts` all prefer `orders.quote_id`/`notes`/`production_start_date` columns; setters dual-write to DB. JS parses cleanly throughout.
- 2026-04-28 — **Phase 4 (CSS extraction) complete**: 1,125-line stylesheet extracted from `index.html` `<style>` block to `styles.css`. HTML now references via `<link rel="stylesheet" href="styles.css">`. Five other `<style>` tags in the file are intentionally left in place — they live inside JS template literals for PDF/print output, not part of the page CSS.
- 2026-04-28 — **Phase 5 (JS extraction) complete**: entire `<script>` block (10,500+ lines) extracted from `index.html` to `src/app.js`. HTML now references via `<script src="src/app.js"></script>`. `index.html` shrunk from 12,467 → 798 lines (pure HTML markup). `src/app.js` parses cleanly.
- 2026-04-28 — **Phase 6 (PARTIAL — module split): migrate code extracted to `src/migrate.js`**. The 489-line migration block (`_migReadLS`, `_migLog`, 9 subroutines, `migrateLocalToDB`, `_runMigration`, `_showMigrationLog`, `_cqLineToRow`) was lifted out of `app.js` and loaded via a second classic `<script>` tag after `app.js`. Both files share the global namespace, so no `window.X` exports needed for inline handlers. **Deeper ES-module split deferred** — switching to `<script type="module">` would require explicit `window.X = X` for ~80–100 functions called from 369 inline event handlers, plus per-feature state-object refactor; this is best done as a focused session with manual click-testing after each module is extracted. File state at end: `index.html` 798 lines · `styles.css` 1,126 lines · `src/app.js` 10,057 lines · `src/migrate.js` 494 lines.
- 2026-04-28 — **Phase 7 (destructive migrations) deferred**: dropping legacy columns (`quotes.client/project/materials/labour`, `orders.client/project/value`) and renaming `projects.data → ui_prefs` requires that no code path still reads them. Today the Quote popup still writes/reads `materials` and `labour` (the legacy totals fields), and the legacy text columns are still used as fallbacks where `client_id`/`project_id` FKs are null. Deferred until: (a) Quote totals are derived from `quote_lines` aggregation, and (b) all `client`/`project` text fallbacks are replaced with FK lookups.
- 2026-04-29 — **Phase 7 (destructive cleanup) complete**, in seven committed steps. (1) Added FK-resolving helpers `quoteClient/quoteProject/orderClient/orderProject` and a `quoteTotalsFromLines` aggregator that fills `q._totals = {materials, labour}` for every quote on load; `quoteTotal()` reads the cache. (2) Mechanical perl swap of every bare `q.client`/`q.project`/`o.client`/`o.project` for the helpers across `src/app.js`, plus dropping the same keys from row inserts in `convertQuoteToOrder`, `_saveQuotePopup`, `_saveOrderPopup`, `createQuote`, `duplicateQuote`, `duplicateOrder`, the CSV importers, and migrate.js. (3) Manual-totals quote UX writes a single `quote_lines` row (`name='Manual Quote'`, `material_cost_override` + `labour_hours` + `labour_override=true`); the popup's per-quote "Rate /hr" input is gone — labour now uses the global `cqSettings.labourRate`. Backfilled all 12 surviving quotes via `_writeManualTotalsLine(q.id, materials, labour/rate)`. (4) `convertQuoteToOrder` copies `quote_lines → order_lines`; `duplicateOrder` does the same. (5) `_saveProjectScoped` no longer merges scope payloads into the projects row — child tables (sheets/pieces/edge_bands/quote_lines) are the source of truth; `loadProject`'s `else { /* legacy data jsonb */ }` block deleted. (6) Snapshot saved at `Building Docs/snapshots/2026-04-29-pre-phase7.json`; orphan rows deleted (11 quotes + 3 orders, all with NULL FKs and prototyping garbage like "njcncsd"/"sdcsdv"); destructive migrations applied in three commits (`phase7_quotes_drop_legacy_columns`, `phase7_orders_drop_legacy_text_columns`, `phase7_projects_rename_data_to_ui_prefs`). (7) Status flipped above. **Deviation from SCHEMA.md § 3.15:** kept `orders.value`. Reason: `order_lines` aggregation produces materials+labour only; the customer-paid total snapshotted at quote→order conversion includes markup+tax that cannot be reconstructed from lines alone (orders have no markup/tax columns and the parent quote may be edited or deleted later). Adding markup/tax to orders was out of scope. The plain-English schema doc and code comment in `orderTotal()` flag this.
- 2026-04-30 — **Dead-code sweep complete**: deleted v0.11 library-system stub functions (`_renderLibUI`, `renderCLLibraries`, `renderCabLibraries`, `renderStockLibrariesUI`, `toggleProjectsPanel`) and ~10 no-op call sites across `switchSection`, `saveStockLibrary`/`loadStockLibrary`/`deleteStockLibrary`/`importStockLibrary`, `_clLoadProjectList`, `deleteProject`, and the auth-state-change handler; removed the 49-line `_renderLibUI_OLD` commented-out block; dropped the unused `saveData()` no-op; simplified Phase 7 transition fallbacks in `_openQuotePopup` (the `q.materials || 0` branches were unreachable post-step-6 since the columns are gone) and reworded the `quoteTotalsFromLines` docstring. Also refreshed `CLAUDE.md` Stack section to reflect the post-Phase-5/6 file layout (`index.html` shell + `styles.css` + `src/app.js` + `src/{db,ui,migrate}.js`). Net: `src/app.js` 10,090 → 10,022 lines; six commits, no behavior change, no schema/DB changes.
- 2026-04-30 — **Cabinet Builder ghost removal + cloud library** (Path B of post-launch item 2). Deleted 564 lines of orphan parallel cabinet code that had no UI surface but was syncing to `cabinet_templates` on every sign-in: state (`cabItems`, `cabSettings`, `cabActiveIdx`, `_cabId`), constants (`CAB_DEFAULT_MATERIALS`, `CAB_DEFAULT_HANDLES`, `SHEET_AREA`), localStorage keys (`pc_cab_items`, `pc_cab_settings`), every `cab*`/`_cab*` function (`defaultCabinet`, `addCabinetItem`, `removeCabinetItem`, `duplicateCabinetItem`, `selectCabinet`, `matPrice`, `handlePrice`, `pricePerM2`, `calcCabinet`, `populateCabDropdowns`, `loadCabForm`, `renderCabMaterialsList`, `renderCabHandlesList`, `renderCabItemsList`, `renderCabResults`, `renderCabinetQuote`, `loadCabItems`, `saveCabItems`, `loadCabSettings`, `saveCabSettings`, `_loadCabItemsFromDB`, `_syncCabItemsToDB`, `importCabBuilderToCQ`), the ghost auth-time call in `loadAllData`, and the `cabSettings` branches in `_applyCatalogFromDB` (kept `cqSettings`). The render targets it expected (`#cab-results`, `#cab-cab-list`, `cab-name`/`cab-w`/`cab-h`/`cab-d`) never existed in `index.html`. Repurposed the now-unused `cabinet_templates` DB table to back the saved-cabinet library (`cqLibrary`), which previously lived only in `pc_cq_library` localStorage. New helpers `_saveCabinetToDB`/`_deleteCabinetFromDB`/`_loadCabinetTemplatesFromDB`; auth handler loads from DB after `loadAllData`. Repointed `migrate.js`'s `_migrateCabinets` from the dead `pc_cab_items` to the live `pc_cq_library`. Dropped `loadCQLibrary`/`saveCQLibrary` and 6 callers — DB is sole source of truth for the library. Net: `src/app.js` 10,022 → 9,498 lines (≈−524); five commits; no schema changes (table was already in place from Phase 1); the `cqLines`/`cqSettings`/`cq*` symbol surface stays — renaming deferred to item 3's module split. Path C (templates-vs-instances product redesign) parked as a separate roadmap item.
- 2026-04-30 — **Item 3 phases A/B/D landed** (Vite scaffold + npm deps + TS toolchain), reversing the earlier 2026-04-28 Vite-deferred decision. (A) `package.json` + `vite.config.mjs` add Vite as dev server (`npm run dev`, port 3000) and build tool (`npm run build` → `dist/`). A `copy-classic-scripts` plugin in vite config copies `src/*.js` into `dist/src/` so the existing classic `<script src="src/*.js">` tags resolve from the build output without any source-file changes. `.claude/launch.json` adds a "Vite dev" config alongside the existing npx-serve config. (B) Replaced the three CDN `<script>` tags (`@supabase/supabase-js`, `jspdf`, `jspdf-autotable`) with npm packages bundled by Vite. The actual swap uses a tiny module bridge (`src/main.js`) that imports the npm packages and re-exposes them on `window` under the same names the CDN scripts provided (`window.supabase.createClient`, `window.jspdf.jsPDF`); this lets `db.js`/`app.js`/`migrate.js` stay as classic scripts unchanged. The four classic source `<script>` tags got `defer` added so they execute after the deferred-by-default module bridge sets up the globals. (D) Added `typescript` + `@types/node` devDeps and a permissive `tsconfig.json` (`allowJs:true`, `checkJs:false`, `strict:false`, `noEmit:true`); `npm run typecheck` passes clean. **Deviated from plan #3:** skipped what the plan called phase C (bulk `<script type="module">` swap with a 150-name window-shim) — the bridge module already lets npm packages flow into classic source files, so the bulk conversion brings little value before phase E (module split) actually needs it. Phase E will introduce ESM into source files incrementally as functions get carved out, rather than as a big-bang conversion. Phases E (module split, 8–12 commits), F (`.ts` everywhere), G (strict mode + DB types), and H (deploy cutover) remain TODO.
- 2026-04-30 — **Item 3 phase E partial** (3 carves landed). Began carving `src/app.js`'s functional sections into separate files using a **classic-script split** pattern rather than ES module conversion: each new file is a `<script defer>` and top-level `function`/`let`/`const` declarations stay globally accessible via classic-script semantics. Cross-file references (e.g. `orders` array, `_escHtml`, `_db`) work through the global lexical environment, no `window.X` shim required. (1) `src/schedule.js` (157 lines) — `renderSchedule`, `_scrollToSchedBar`, `setOrderProdStart`, `_restoreProdStarts`. (2) `src/dashboard.js` (307 lines) — `renderDashboard` + `drawRevenueChart`. (3) `src/orders.js` (216 lines) — `orders` state array + `orderNextId`/`ORDER_STATUSES`/`STATUS_LABELS`/`STATUS_COLORS`/`STATUS_BADGES` constants + `addOrder`/`removeOrder`/`duplicateOrder`/`advanceOrder`/`renderOrdersMain`. State-bearing carves like `orders.js` need to load BEFORE `app.js` (so the bindings exist when app.js's body references them); script tag ordering in index.html follows that constraint. Net: `src/app.js` 9,495 → 8,841 lines (≈−654); 3 commits. ES module syntax (import/export) deferred to a later pass — the classic-script split pattern is decoupling the file structure without forcing rewrites. Phase E continues with QUOTES, QUOTE HELPERS, STOCK, CUTLIST, CABINET BUILDER, and others when work resumes.
- 2026-04-30 — **Item 3 phase E continued** (4 more carves + 1 dissolve, 8 commits). Continued the classic-script split with: (4) `src/quotes.js` 328 lines — `quotes`/`quoteNextId` state + FK resolvers (`quoteClient`/`quoteProject`/`orderClient`/`orderProject`) + totals (`quoteTotalsFromLines`/`_hydrateQuoteTotals`/`_refreshQuoteTotals`/`quoteTotal`/`orderTotal`) + mutations (`createQuote`/`removeQuote`/`convertQuoteToOrder`/`approveQuote`/`revertQuoteToDraft`) + `renderQuoteMain` + `exportQuotesCSV`/`importQuotesCSV` (the CSV pair was moved here in a follow-on commit, see below). (5) `src/backup.js` 48 lines — `_exportLocal` (carved out of LOCAL BACKUP). (6) `src/auth.js` 94 lines — `dismissAuth`/`showAuthFromPaywall`/`_showShortcutsHelp` plus two top-level `document.addEventListener('keydown')` blocks for keyboard shortcuts (Ctrl/Cmd+1–9 / N / / / Escape) and Escape-overlay-close. (7) `src/business.js` 116 lines — `saveBizInfo`/`_syncBizInfoToDB`/`loadBizInfo`/`handleLogoUpload`/`removeLogo`/`loadLogoPreview`/`getBizLogo`/`getBizInfo` + `_bizInfoSyncTimer` debounce state. **Dissolved ORDER HELPERS** (4 commits): the section was named misleadingly — its contents were a mix of order helpers, CSV import/export for three entity types, and dead stubs. Investigation showed each function had one obvious home, so instead of creating a new "csv.js" or "order-helpers.js" file: deleted 4 dead functions (`updateOrderField`/`_noOp`/`renderQuoteLibraries`/`renderOrderLibraries` — all 0 callers or empty stub-only callers, plus the dangling `try/catch` calls in switchSection); moved 6 functions to their carved-file callers (`exportQuotesCSV`/`importQuotesCSV` → quotes.js; `setOrderFilter`/`setOrderStatus`/`exportOrdersCSV`/`importOrdersCSV` → orders.js); left `exportClientsCSV`/`importClientsCSV` in app.js with a TODO (will move to clients.js when CLIENTS section is carved); removed the now-empty section banner. Net for the whole batch: `src/app.js` 8,841 → 8,237 lines (≈−604); 12 commits. After every commit: `switchSection` iterated over all 7 nav tabs without errors; for the auth carve specifically, dispatched a synthetic Cmd+1 keydown to confirm the side-effect listener still attached. Phase E continues with QUOTE HELPERS (542 lines, the smart-suggest helpers), STOCK HELPERS (255), STOCK (478, state), PROJECTS PANEL (261), CABINET BUILDER (~2,200, biggest), CUTLIST (~2,780, biggest), plus a settings-cluster batch (THEME/UNITS/CURRENCY/SETTINGS/SECTION-NAV ~150 lines combined) and tail sections (FORM DEFAULTS, INIT, CLIENTS & PROJECTS).

---

## How to use this spec

**This spec is for:**
1. **Pre-commitment.** Filling it in forces you to make hard scope and budget
   calls *before* you're knee-deep in code.
2. **Mid-refactor anchor.** When tempted to add "just one more thing," § 4
   (Non-goals) and § 9 (Open questions) are the document you re-read.
3. **Done-test.** § 7 + § 12 = the contract for "this is finished." Without
   them, refactors don't end — they fade.

**This spec is not:**
- The implementation plan. That's `PLAN.md` or a new `REFACTOR_PLAN.md`.
- Once-and-done. Update § 13 (Decisions) and the Status field as you go.

**Suggested order to fill it in:**

1. § 1 (Problem) and § 2 (Why now) — the "do I really care enough" check
2. § 4 (Non-goals) — write these *before* goals; easier to know what you
   don't want
3. § 3 (Goals), § 6 (Scope), § 7 (Success criteria) — the contract with
   yourself
4. § 9 (Open questions) — resolve every one before starting
5. § 8 (Failure modes), § 11 (Smoke test) — the safety net
6. § 5 (Constraints), § 10 (Phases), § 12 (DoD), § 13 (Decisions) — fill as
   you go
