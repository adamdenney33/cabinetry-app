# ProCabinet.App — Build Plan

The single source of truth for what's pending, in progress, and done.
Companion docs: `SPEC.md` (refactor history), `SCHEMA.md` (DB schema),
`CLAUDE.md` (dev guidelines), `~/.claude/plans/item-2-cabinet-quote-unification.md`
(detailed architecture for Item 2).

---

## Status Snapshot

- **App is live** at [procabinet.app](https://procabinet.app) (Cloudflare Pages, auto-deploy on push to `main`)
- **Pre-launch refactor (SPEC.md Phases 0–7)** complete — modular files, TypeScript strict mode, schema normalised
- **Cabinet Builder unification** (Item 2): Phases 1 + 3 done, Phases 2 + 4 pending
- **Stripe payments**: not started

---

## Active Work

### Item 2 — Cabinet Builder ↔ Quote Unification

Goal: one editing surface for cabinet specs, one storage backend, clear flow from
exploring a design → formal quote → approved order. Detailed architecture
(Options A/B/C, decision rationale) lives in `~/.claude/plans/item-2-cabinet-quote-unification.md`.

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Move `cbLines` to DB (storage convergence, auth gate) | ✅ Done 2026-05-04 |
| 2 | UI unification (Edit + Duplicate buttons, project-required builder) | ⬜ Pending |
| 3 | `cbSettings` → `business_info` migration | ✅ Done 2026-05-05 |
| 4 | Cleanup (dead code, converters, catalog_items CRUD) | ⬜ Pending |

**Resolved decisions** (locked 2026-05-03):
1. Draft quotes tagged via `[CB_DRAFT]` prefix in `quotes.notes` (no schema change)
2. Cabinet Builder requires sign-in (no guest mode)
3. cbSettings fully moves to `business_info` (numeric/jsonb columns) and `catalog_items` (rows)
4. Quote editing: edit-in-place, with an explicit "Duplicate" button for forking

#### Phase 2 — UI Unification (1–2 sessions, low–medium risk)

Sub-steps:

- **2.1 — Project required for Cabinet Builder editing**
  Block edits in the Cabinet tab until a real `projects` row is selected. If the
  user types a name not in `projects`, prompt to create one (or auto-create on
  first edit). Today, the dual-write is a no-op when there's no `project_id` —
  this turns silent into explicit. Files: `src/cabinet.js` (selector flow,
  edit guards).

- **2.2 — "Edit" button on quote cards (in-place)**
  Add an Edit button to each quote card in `renderQuoteMain` that opens the
  Cabinet Builder pre-loaded with that quote's `quote_lines` (not the draft).
  Mutations write back to that quote, not to the draft. Implies: Cabinet
  Builder needs to know "I'm editing quote N" vs "I'm editing the draft for
  project P". Files: `src/quotes.js` (button), `src/cabinet.js` (active-quote
  state), `src/app.js` (load handoff).

- **2.3 — "Duplicate" button on quote cards**
  Clones a finalized quote into a new quote (status: draft, fresh date, copy
  of all `quote_lines`, fresh `id`). User then opens the duplicate via Edit
  to make changes — preserves the original snapshot. Files: `src/quotes.js`
  (`duplicateQuote` already exists; verify it copies `quote_lines` too).

- **2.4 — "Create Quote from cabinets" flow**
  In the Cabinet Builder, replace today's `cbAddToNewQuote` /
  `cbAddToExistingQuote` buttons with a single "Create Quote" button that
  freezes the current draft's lines into a new named quote (`status: draft`,
  no `[CB_DRAFT]` tag). The draft stays as the live workspace — the new quote
  is a snapshot. Files: `src/cabinet.js` (button + freeze logic).

- **2.5 — Verify**
  Smoke test on procabinet.app: edit a quote in place → reload → changes
  persist. Duplicate a quote → both versions exist → editing the duplicate
  doesn't touch the original. Create-quote-from-cabinets → new quote in
  Quotes tab with current cabinet lines copied.

#### Phase 4 — Cleanup (1 session, low risk)

Sub-steps:

- **4.1 — `catalog_items` CRUD wiring** *(carried over from Phase 3 out-of-scope)*
  My Rates panel inline-edits to materials/hardware/finishes write to
  in-memory `cbSettings.materials/hardware/finishes` only — no `catalog_items`
  table writes. Edits are lost on reload (the catalog overlay re-applies
  stale rows). Add insert/update/delete for catalog_items rows when these
  arrays mutate. Files: `src/cabinet.js` (rates panel onblur handlers),
  maybe `src/business.js` (a `_syncCatalogToDB` helper).

- **4.2 — Remove `cbSavedQuotes`**
  Legacy localStorage list of saved cabinet quotes — superseded by
  `quote_lines` + `quotes` table. Drop the array, its `loadCBSaved` /
  `saveCBSaved` / pill rendering, and the `pc_cq_saved` LS key. Files:
  `src/cabinet.js`.

- **4.3 — Remove `cbProjectLibrary`**
  Legacy localStorage list of saved cabinet projects — superseded by the
  `projects` table. Drop `cbProjectLibrary`, its load/save helpers, the
  `_cbSaveProjectByName` flow, and `pc_cq_projects` LS key (keep
  `pc_cq_project_name` / `pc_cq_client_name` as nav-state pointers — those
  are still used). Files: `src/cabinet.js`, `src/migrate.js`.

- **4.4 — Drop the converter pair**
  `_cbLineToRow` and `_quoteLineRowToCB` exist because the in-memory cabinet
  shape and the `quote_lines` row shape differ (e.g. `w` vs `w_mm`, `doors`
  vs `door_count`). Once cbLines and quote_lines share format directly (i.e.
  `cbLines = quote_lines` rows themselves), the converters are dead weight.
  Requires: changing all cabinet.js code to read DB column names. Files:
  `src/cabinet.js`, `src/migrate.js`.

- **4.5 — Optional: rename `src/cabinet.js` → `src/quote-builder.js`**
  At Phase 4's end, the cabinet file is really "the quote line editor."
  Renaming signals that the unification is structural, not just behavioural.
  Cosmetic; defer if not in the mood.

---

## Backlog

### Stripe + Subscriptions

Sub-steps when ready:

- **S.1** — Stripe Checkout for the upgrade-from-free-tier flow (paywall already
  exists at `index.html` line 29 for the cut-list 5-free-runs limit; needs a
  real payment endpoint instead of just "Sign In / Create Account")
- **S.2** — Subscription lifecycle: create/cancel/renewal webhooks → update a
  `subscriptions` table (new table — see SCHEMA.md for naming conventions)
- **S.3** — Feature gating: tie features (e.g. unlimited optimisations,
  PDF branding, multi-user) to subscription status
- **S.4** — Invoice/receipt views in the user account dropdown

### Small follow-ups (housekeeping)

- **H.1 — Derive Supabase auth-token localStorage key from URL**
  `src/db.js:23` currently hardcodes `sb-mhzneruvlfmhnsohfrdo-auth-token`.
  Derive it from `window._SBURL` (parse the project ref out of the host)
  so the codebase isn't tied to one Supabase project.

- **H.2 — Rotate Supabase password**
  *(User-side; only Adam can do this.)* Password leaked into chat transcripts
  during the 2026-05-04 dev test-signin setup when `.env.local` ended up
  containing literal `echo` commands and had to be debugged via file-read.
  Use the Supabase dashboard password reset, then update `.env.local`.

- **H.3 — Catalog edits collision audit**
  Once 4.1 lands, verify that materials/hardware/finishes edits don't race
  with `_applyCatalogFromDB` on auth refresh (same race-guard pattern that
  Phase 1.5 and Phase 3 needed for cbLines / cbSettings).

### Deferred (don't pick up unless something forces it)

- **`.js` → `.ts` file extension rename** — purely cosmetic. JSDoc +
  `checkJs:true` + `strict:true` already gives full type-safety coverage.
  The Vite dev server serves `.js` directly via classic-script tags;
  renaming would force a Vite-plugin to compile `.ts` for non-module loading.
- **Inline-handler migration to `addEventListener`** — 411 inline `onclick=` /
  `oninput=` attributes across rendered HTML. Only revisit if
  Content-Security-Policy enforcement, accessibility audit, or team-size
  increase forces it.

---

## Stack

| Layer | Choice | Status |
|-------|--------|--------|
| Frontend | Vite + plain HTML/CSS/JS (no framework) — 19 source files split by domain | ✅ Done |
| Type-checking | TypeScript strict mode via JSDoc + `checkJs:true` | ✅ Done |
| Auth + Database | Supabase (Postgres + RLS, project `mhzneruvlfmhnsohfrdo`) | ✅ Done |
| Hosting | Cloudflare Pages — auto-deploy via GitHub Actions on push to `main` (~40s build) | ✅ Done |
| Domain | procabinet.app (DNS via Cloudflare nameservers; Bot Fight + leaked-creds mitigation on) | ✅ Done |
| Payments | Stripe | ⬜ Not started |

---

## Monthly Cost

| Service | Cost |
|---------|------|
| Cloudflare Pages | Free |
| Supabase | Free tier |
| Stripe | Free (2.9% per transaction once integrated) |
| Domain | ~$1/mo |
| **Total** | **~$1/mo** |
