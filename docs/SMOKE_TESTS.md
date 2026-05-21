# Smoke Tests

> Per-phase verification checklist for the pre-launch refactor.
> Created as part of Phase 0 of the plan at `~/.claude/plans/lets-plan-the-refactor-wobbly-lighthouse.md`.

The Full Click-Through (§ 1) is the canonical "does everything still work?" test.
The Per-Phase Tests (§ 2) are the targeted checks for each phase.
Run the Full Click-Through before starting and at the end of each major phase.

---

## 1. Full Click-Through

A clean, end-to-end pass that exercises every major feature. Run from a logged-in account in a normal browser window. Take ~5 minutes.

### Auth
- [ ] Sign out, then sign back in — session persists
- [ ] Refresh page while signed in — stays signed in

### Clients
- [ ] Create new client via smart-input `+` popup
- [ ] Edit existing client (open card → edit fields → save)
- [ ] Delete a client (with confirm prompt)
- [ ] Smart-suggest dropdown filters as you type

### Projects
- [ ] Create new project linked to a client
- [ ] Open project → switch to Cut List tab → data loads
- [ ] Open project → switch to Cabinet Quote tab → data loads

### Stock
- [ ] Add new stock item via `+ New Stock` popup
- [ ] Edit category, supplier, supplier URL, variant fields on a stock item
- [ ] Mark a stock item low (qty < low threshold) — warning shows
- [ ] Sort stock list by different columns

### Cut List
- [ ] Add a sheet via `+ Add panel` button
- [ ] Add pieces via `+ Add part` button (3-4 pieces)
- [ ] Generate layout — pieces placed on sheets without overlap
- [ ] Add edge band via `+ Add edge band`
- [ ] Click piece edge → assign edge band to L1/W2/L3/W4
- [ ] Toggle dark mode, color, grain — render updates
- [ ] Import CSV of pieces — pieces added
- [ ] Export PDF — opens with sheets + pieces

### Cabinet Quote
- [ ] Add cabinet line via `+ Add cabinet`
- [ ] Edit cabinet (dims, doors, drawers, materials) in popup
- [ ] Duplicate a cabinet line
- [ ] Delete a cabinet line (with confirm)
- [ ] Save quote → appears in saved quotes shelf
- [ ] Load saved quote → fields restore correctly
- [ ] Apply quote to existing project (`_cqApplyToQuote`)

### Quotes & Orders
- [ ] Create a quote from scratch (Quote tab → `+`)
- [ ] Convert quote to order
- [ ] Order shows linked quote chip in popup
- [ ] Update order status (pipeline advances)
- [ ] Set production start date

### Settings
- [ ] Update business info (name, phone, address, ABN)
- [ ] Upload logo — appears on PDF export
- [ ] Toggle dark mode — persists across refresh
- [ ] Change units (mm ↔ inches) — defaults update
- [ ] Change currency — totals re-format

### Persistence
- [ ] Refresh page after every change above — everything persists
- [ ] Sign in on a second browser/device — same data appears (proves multi-device sync, only after Phase 3)

---

## 2. Per-Phase Tests

### Phase 0 — Prep

- [ ] Click "Export Local Backup" in Settings → JSON file downloads
- [ ] Re-import JSON into a fresh incognito browser → app renders identically
- [ ] `Building Docs/snapshots/2026-04-28-prelaunch.sql` exists in repo

### Phase 1 — Schema (additive only)

- [ ] In Supabase Studio: every new table from `SCHEMA.md § 3` appears
- [ ] `\d <new_table>` matches DDL in `SCHEMA.md § 3` for every new table
- [ ] `select relname from pg_class where relrowsecurity = true` includes every new table
- [ ] Insert test row into `pieces` as logged-in user → succeeds
- [ ] Try same insert as different user → fails with RLS error
- [ ] Existing tables (`quotes`, `orders`, `projects`) still readable; old columns intact
- [ ] App still loads and works (additive migrations should not break anything)

### Phase 1.5 — Unify dual project-save paths

- [ ] Create project named "TestProj-1.5" via Cut List tab
- [ ] Save project from Cabinet Quote tab using same name
- [ ] Supabase: `select count(*) from projects where name = 'TestProj-1.5'` returns 1 (not 2)
- [ ] Cut list child rows present: `select count(*) from sheets where project_id = ?`
- [ ] Quote child rows present: `select count(*) from quote_lines where ...`
- [ ] Both `_clSaveProjectByName` and `_cqSaveProjectByName` are now wrappers around `_saveProjectScoped`

### Phase 2 — `migrateLocalToDB()`

- [ ] Click "Run Migration" in Settings → confirm dialog appears
- [ ] Migration log shows 0 errors
- [ ] Row counts match for every key:
  - `JSON.parse(localStorage.getItem('pc_cl_pieces')).length` ↔ `select count(*) from pieces`
  - `JSON.parse(localStorage.getItem('pc_cl_sheets')).length` ↔ `select count(*) from sheets`
  - `JSON.parse(localStorage.getItem('pc_cl_edgebands')).length` ↔ `select count(*) from edge_bands`
  - `JSON.parse(localStorage.getItem('pc_cq_lines')).length` ↔ `select count(*) from quote_lines`
  - `JSON.parse(localStorage.getItem('pc_cq_saved')).length` of total lines ↔ `select count(*) from quote_lines for those quote IDs`
  - `pc_cab_items.length` ↔ `select count(*) from cabinet_templates`
  - `pc_cq_settings.materials.length + .handles.length + .finishes.length` ↔ `select count(*) from catalog_items`
- [ ] Spot-check: open most recent Cabinet Quote project; render; export PDF; compare visually to pre-migration PDF
- [ ] Logo: appears in business_info.logo_url; loads on PDF export
- [ ] Run migration twice → second run reports "0 new rows" with no errors (idempotent)
- [ ] `pc_stock_libraries` localStorage key is removed

### Phase 3 — Switch reads to DB (per feature)

For each of the 8 features (stock, catalogs, business info, cabinets, cut list, cabinet quote, quotes, orders), in order:

- [ ] Open the feature in browser with localStorage **cleared** → data still appears
- [ ] Edit a value → save → refresh → edit persists
- [ ] Sign in on a second browser → same data appears
- [ ] Console has no errors related to that feature

End of Phase 3:
- [ ] `grep -n "localStorage.getItem" index.html` shows only UI-prefs reads (`pcDark`, `pcUnits`, `pcCurrency`, `pc_zoom`, `pc_font_scale`, `pc_cut_order`, `pc_sheet_cutlist`, `pc_show_summary`, `pc_cl_colsVisible`)
- [ ] Full Click-Through (§ 1) passes
- [ ] Multi-device sync works for every feature

---

## 3. Failure Recovery

If a phase's verification fails:

1. **Don't proceed to the next phase.** Each phase = one commit; never merge a half-finished phase.
2. **Review the migration log** (Phase 2) or browser console (Phase 3) for the specific error.
3. **Roll back option:**
   - Phase 1: `drop table <name>` for any unwanted table; data was never moved yet so no loss.
   - Phase 1.5: `git revert` the unify commit; old paths still work.
   - Phase 2: localStorage was untouched (read-only); just don't switch reads in Phase 3.
   - Phase 3: per-feature rollback — `git revert` just that feature's commit. Other features unaffected because each is its own commit.
4. **Fix forward:** the dual-write pattern from Phase 3 means localStorage is always a fallback. Worst case, one feature stays on localStorage until the bug is fixed.

---

## 4. RLS Verification (one-time, after Phase 1)

Two-account test to prove RLS is enforced:

1. Create a second test account (`test2@example.com`)
2. As account 1, create a client named "RLSTest"
3. Sign out, sign in as account 2
4. Confirm: "RLSTest" client does NOT appear
5. From Supabase SQL editor (as service role), `select count(*) from clients where name = 'RLSTest'` should be 1 (it exists, but account 2 can't see it)
