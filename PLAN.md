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
- **Stripe payments (subscriptions)**: S.2–S.7 built in test mode; **S.9 live-mode flip done** — verified 2026-06-11 via secret digests (`STRIPE_SECRET_KEY` = the verified-live Connect key; price secrets ≠ the S.2 test IDs; `STRIPE_PRICE_FOUNDER` present). Outstanding: S.8's remaining live smoke checks + decide on the 3 test-mode `subscriptions` rows
- **Stripe Connect (customer payments on live quote/order pages)**: built + deployed (connect-onboard/connect-status/quote-pay/quote-pay-webhook + `src/connect.js` + `q.html`); charge model **Standard + direct charges + 0.7%/$100-cap fee** (2026-06-09, commit `6711b61`); **LIVE mode since 2026-06-10** (live keys + live Connect webhook — real money). Bank transfers + `/payment-fees` page added 2026-06-10
- **Accounting integration (QuickBooks Online + Xero invoice push)**: built 2026-05-30 (4 edge fns, encrypted token store, Pro-gated order-card "Sync ▾"); **QuickBooks went LIVE + verified end-to-end 2026-06-19** — production keys + redirect URI + 5 Supabase secrets set (`QBO_ENVIRONMENT=production`), connected to the real company "Pro Cabinet", pushed ORD-0001 → draft invoice with line items in production QBO. Xero also connected. **Open follow-up:** the connection's `default_tax_code` is null, so pushes are **VAT-free** until a tax code is set (set up VAT in QBO + reconnect, or add a tax-code picker). Detail: SPEC.md § 13 (2026-06-19)
- **Mobile / responsive**: ✅ comprehensive mobile-native pass done 2026-05-23 (7 phases; see Active Work / SPEC.md § 13); guided walkthrough runs on phones since 2026-06-11
- **UI polish + design finalisation**: progressing in passes (PDF cleanup 2026-05-24 · unified filter bars + mobile pass 2026-05-23 · card status unification 2026-06-10); no formal design-system lock (U.1) yet
- **Launched:** live since 2026-05-02 — soft launch, no public-posts push; growth runs through the paid-ads + founders track. Auth emails on Resend SMTP since 2026-05-17; signup-confirmation UX hardened 2026-06-11

---

## Active Work

### Cut List Library — "Add to Cut List" card action (2026-07-11) ✅ Built + typechecked — ⬜ browser-verify

**Goal.** Restore a missing bridge: from a **Cut List Library** card, push that
saved cut list **into the currently-open cut list** (rather than only Open /
Duplicate / Link / Delete, which all replace or clone rather than combine).
This is what lets a maker assemble one job's cut list from several saved
library lists (e.g. pull in "Base Carcass" + "Wall Unit" + "Drawer Bank").

- ✅ **New `_clAddLibraryToCurrent(id)`** in `src/cutlist-render.js`. Fetches the
  library list's `pieces` + `sheets`, then **merges** them into the in-memory
  `pieces` / `sheets` arrays rather than blindly appending.
- ✅ **Merge semantics (locked with Adam 2026-07-11):** a row whose merge key
  already exists gets its **qty bumped**; anything new is appended.
  Piece key = `label + w + h + material + grain` (material/grain are in the key
  on purpose — a 720×560 "Side" in 18mm MDF is not the same part as one in oak
  ply). Sheet key = `name + w + h + grain`; **kerf is excluded** from the key
  because it's a property of the saw, not the stock, so the open cut list's
  kerf always wins.
- ✅ **Edge bands not carried across** — neither `_clDoOpenLibraryCutlist` nor
  `_clAddToCutlistLibrary` round-trips `edge_bands`, so there is nothing
  reliable to merge from. Consistent with the existing open/save paths.
- ✅ **Persistence rides the existing autosave** — `_setClDirty(true)` schedules
  the 800 ms `_clRunAutosave`, which re-syncs children onto
  `_clCurrentCutlistId`. No new DB writes, no new migration, no schema change.
- ✅ **Stale layout invalidated** — `results = null` after a merge, so the
  optimiser must re-run rather than showing a layout that predates the added
  parts.
- ✅ **Guards** — no-op with an explanatory toast when no cut list is open, or
  when the card *is* the open cut list. The button is hidden on the card that's
  currently being edited (already marked "· editing").
- ⬜ **Browser-verify** with Adam: merge two library lists into one open list,
  confirm qty bumps on shared parts, sheet dedupe, and that the optimiser
  re-runs against the combined list.

- ✅ **Dead "Add to Library" path removed.** `_clAddToCutlistLibrary` was still
  defined + window-exposed in `src/cutlist-render.js` with **zero callers**.
  Not a regression: `_clStartNewCutlist` inserts the `cutlists` row up front and
  autosave keeps it in sync, so **every cut list already IS a library cut list
  from creation** — an explicit "save to library" step would only fork a
  duplicate row. Function deleted (comment left in its place explaining why);
  the two stale empty-states that still pointed at the missing button rewritten:
  the Cut List Library tab (`cutlist-render.js`) and the cabinet builder's
  cut-list picker (`cabinet-library.js`).

### Accounting — push QUOTES as estimates (QBO Estimate / Xero Quote) (2026-07-11) ✅ Built + typechecked — ⬜ deploy (migration + fn) + verify

**Goal.** Mirror the existing order→invoice accounting sync on the **quote** side:
a Pro-gated **Sync ▾** on each quote card pushes the quote into the connected
accounting system as a DRAFT **estimate** (QuickBooks) / **quote** (Xero) — the
pre-sale document type, not a draft invoice. Full rationale: SPEC § 13 (2026-07-11).

**Key finding.** No OAuth scope change / no reconnect needed — QBO's accounting
scope already covers the Estimate entity; Xero's granular `accounting.invoices`
scope already covers the Quotes endpoint. So the correct mapping has zero
migration cost for connected users.

**Built.**
- ✅ **A.1 — migration** (`20260711130000_accounting_quote_estimate_links.sql`):
  `accounting_invoice_links` gains nullable `quote_id` FK + `doc_type`
  (`invoice`|`estimate`), `order_id` relaxed to nullable, mutually-exclusive
  check, second unique key `(user_id, quote_id, provider)` + quote_id index.
  SCHEMA § 3.22 updated. Type regen deferred to deploy.
- ✅ **A.2 — providers.ts** `createDraftEstimate`: QBO `/estimate` (ItemRef +
  estimate deep link), Xero `/Quotes` (DRAFT + issue Date + quote deep link);
  same normalised `InvoiceInput` (dueDate → estimate/quote expiry).
- ✅ **A.3 — edge fn** `accounting-push-invoice` generalised: `docType`
  (`order` default, still accepts legacy `orderId`), sources the quote/order
  row + client server-side, branches invoice/estimate, upserts the right link.
- ✅ **A.4 — frontend**: `accounting.js` generalised (`_accountingPush`,
  `_accountingCardFooter`, quote link map, `quote_id` added to the early-boot
  select in `main.js`); `quotes.js` quote-card footer gets the Sync button;
  `globals.d.ts` declarations. Popup copy updated (order→invoice, quote→estimate).
- ✅ **A.5 — typecheck** clean on all touched `src/` + `supabase/` files (the
  only tsc errors are the pre-existing `scripts/blog.mjs` ones).
- ⬜ **A.6 — deploy** (needs the user; **migration-first**): apply
  `20260711130000` + regen types → deploy `accounting-push-invoice`
  (`verify_jwt` on) → push frontend to `main`. Post-deploy smoke: connect QB/Xero,
  open a quote with lines, Sync ▾ → confirm a DRAFT estimate/quote appears in the
  provider with matching line totals + a "✓ Synced" chip deep-links to it.

### Schedule — day/week views, tasks, drag + Google Calendar 2-way (2026-07-11) ✅ SHIPPED — live + end-to-end verified 2026-07-13 (⬜ GC.6 before customer rollout)

**Goal.** Grow the Schedule tab from the single continuous month Gantt into a
Google-Calendar-style surface: Day / Week / Month view switcher, standalone
timed **tasks** (non-order work) creatable in every view, drag-to-adjust
times, per-layer visibility toggles, and (phase 2) 2-way Google Calendar
sync. Minimal UI — GCal interaction cues, existing app styling.

**Decisions (2026-07-11, user-confirmed).**
- GCal sync: **tasks 2-way, orders push-only** (all-day events; the
  auto-scheduler owns order dates). Other GCal events = read-only overlay.
- **Single task type** — visibility toggles are per layer: Orders / Tasks /
  Google. No task-type management UI.
- Orders in day/week grids get **real hour slots**: `computeSchedule` walk
  already consumes `min(dayHours, remaining)` per day → emit per-day
  `{date, hours}` segments, anchored at a new **workday start time**
  setting. Same-priority orders run in parallel → side-by-side overlap
  layout (GCal style). Auto-scheduler algorithm itself unchanged.
- Google Cloud OAuth client not set up yet → **phase 2 is blocked on
  user-side setup** (checklist below); phase 1 ships standalone.

**Phase 1 — views + tasks (no Google).**
- ✅ **SV.1 — migration** (`20260711120000_schedule_tasks`, applied to
  prod): `schedule_tasks` (RLS Pattern A; gcal_event_id/gcal_synced_at
  phase-2 ready) + `business_info.workday_start_time` (text 'HH:MM',
  default '08:00'). SCHEMA.md § 3.29; types hand-edited into
  `database.types.ts` (deterministic additions).
- ✅ **SV.2 — scheduler segments + workday start**: `computeSchedule`
  returns `segments: {date, hours}[]` per order (auto + manual walks;
  legacy pinned manual_end_date spans spread capacity-capped);
  `cbSettings.workdayStart` ↔ `workday_start_time`, editable in Working
  Hours ("Workday start time").
- ✅ **SV.3 — view switcher**: sticky 44px view bar — Today, ‹ ›, range
  label, Day|Week|Month segmented, "+ Task"; `pc_sched_view` persisted,
  Day/Week anchor in-memory (always lands on today). Month = existing
  Gantt (day-name header re-stuck at top:44px; ‹ › page the scroll).
- ✅ **SV.4 — time-grid renderer** (`src/schedule-views.js`): shared
  day/week grid — 24h hour rows @48px, auto-scroll to workday start,
  60s-refreshed now-line, off-hours shading + holiday hatch, order
  blocks from segments (side-by-side overlap clusters), task blocks,
  all-day strip, click-empty-slot → new task (30-min snap), week day
  headers → Day view.
- ✅ **SV.5 — tasks CRUD** (`src/schedule-tasks.js`): `scheduleTasks`
  mirror + `loadAllData` hydrate; popup (title/date/start/end/all-day/
  done/notes/delete), optimistic writes; month-cell chips (max 3 +
  "+N more" → Day view, cells grow per week); demo seed added.
- ✅ **SV.6 — drag**: pointer-capture move (15-min snap; week view
  crosses days) + bottom-handle resize with live time label; <5px = tap
  → edit popup; month chips HTML5-DnD between days; 500ms debounced
  writes.
- ✅ **SV.7 — visibility toggles**: Orders/Tasks coloured checkboxes atop
  the sidebar (`pc_sched_layers`); filter calendar surfaces only — the
  sidebar job queue always lists orders. Google row lands in phase 2.
- ✅ **SV.8 — mobile**: pointer events + touch-action cover touch drag;
  Day fits phones, week grid scrolls horizontally (min-width 640px);
  mobile Calendar sub-tab hosts the view bar + selected view.
- ✅ **SV.9 — verify + docs**: typecheck src-clean; Playwright smoke 9/9;
  scripted headless pass (Month/Week/Day, popup task-create → correct
  block, overlap layout, layer toggle, zero page errors; test rows
  SQL-cleaned). ⚠️ Order hour-blocks not visually exercised (e2e account
  has no orders) — eyeball on real data. SPEC § 13 entry written.

**Phase 2 — Google Calendar 2-way (GC) ✅ built + deployed 2026-07-11 — ⬜ end-to-end test (needs user's Google consent) + push.**
- ✅ **GC.0 — user-side setup**: Google Cloud project + Calendar API +
  external consent screen (`calendar.events` scope; Testing mode, user
  added as test user) + Web OAuth client done by the user 2026-07-11.
  Redirect URIs: `/auth/v1/callback` (Google sign-in) + the `gcal-oauth`
  fn URL. ⬜ Confirm `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` edge
  secrets set + Google provider enabled in Supabase Auth (sign-in
  activation rides the same client).
- ✅ **GC.1 — `gcal_connections`** (migration `20260711150000`, applied):
  encrypted token row (AES-GCM via shared ACCOUNTING_TOKEN_KEY), owner
  SELECT only, service-role writes. SCHEMA § 3.30; types hand-edited.
- ✅ **GC.2 — `gcal-oauth`** (deployed v1, verify_jwt=false): POST start
  (manual JWT auth → consent URL with HMAC state), GET callback (state
  verify → code exchange → encrypted upsert → 302 `/os?gcal=…`), POST
  disconnect (revoke + row delete). Smoke: bogus state → `gcal=error`.
- ✅ **GC.3 — `gcal-sync`** (deployed v1, verify_jwt=true): **wide-window
  reconcile (today −30d…+180d), no syncToken/webhooks** — simpler than
  the planned webhook design; GCal-side edits land on the next sync
  (≤5 min while Schedule is open). Tasks 2-way LWW vs `gcal_synced_at`
  (deletes propagate both ways via tag-matching + events.get
  disambiguation); orders push-only all-day events rebuilt from the
  client's computed placements (`transparency:transparent`, demo rows
  skipped); untagged events → read-only overlay (never stored).
- ✅ **GC.4 — app wiring** (`src/gcal.js` + hooks): Connect/Reconnect
  button + connected status row (sync-now ⟳ / disconnect ✕) under the
  sidebar layer toggles; Google layer checkbox (blue) appears when
  connected; `?gcal=` return handler; sync triggers = boot, 4s-debounced
  after task create/edit/delete/drag, 5-min interval while Schedule
  open, manual. Overlay renders as blue read-only blocks + all-day chips
  (Day/Week) and month chips. Placements computed via `computeSchedule`
  directly (pure fn, no render coupling).
- ✅ **GC.5 — verify + docs**: typecheck clean; smoke 9/9 (one transient
  auth blip re-ran green); endpoints smoke-tested. **End-to-end verified
  live 2026-07-13**: user connected on procabinet.app (after fixing a
  redirect_uri_mismatch — the gcal-oauth URI wasn't registered on the
  client at first), user confirms it works; server row shows
  status=connected, repeated syncs, and a task carrying a
  gcal_event_id (push leg proven). `google_email` label came back null
  (calendars.get denied under the events-only scope — UI falls back to
  "Google Calendar connected"; cosmetic). Pushed to `main` 2026-07-13.
- 🚧 **GC.6 — customer rollout: published + branding path (2026-07-13).**
  App published to Production (unverified: warning screen + 100-user cap
  until verification). Verification attempt #1 rejected → root causes +
  the no-custom-domain fix are in SPEC § 13 (2026-07-13 later):
  `functions/api/gcal-callback.js` Pages proxy so the calendar redirect
  URI lives on procabinet.app, and GIS + `signInWithIdToken` sign-in so
  the consent popup shows procabinet.app (legacy redirect button kept as
  fallback). ⬜ push (deploys the proxy + GIS button — new calendar
  connects are DOWN until then) → verify both flows → GSC-verify
  procabinet.app → resubmit brand verification ("I have fixed the
  issues"). Consider Pro-gating the connect button later.

### Cabinet Builder "edit in place" UI rework (2026-07-03) ✅ built + verified — ⬜ push

**Goal.** Reduce scroll + click cost in the Cabinet Builder (user-picked
"Variant 2" from three mockups). UI-only — no schema, autosave, or costing
changes. Full plan: `~/.claude/plans/i-want-to-improve-delegated-swing.md`.
Detail: SPEC.md § 13 (2026-07-03).

**v2 (same day, `09d8f0a`):** the Part A editor was superseded after user
feedback — collapsed sections hid the spec. Now a 2-col grid of ALWAYS-OPEN
cards (My Rates box styling, original section groupings, real controls,
hardware chips + tap-to-expand editor). Whole spec visible without scroll.
Part B results table unchanged. Detail: SPEC.md § 13 (2026-07-03 later).

**v2 follow-ups (same day):** ×qty suffix removed from editor totals
(`2547544`); card reorder shelves·doors·fronts·boxes (`8b0f06c`); coverage
sliders show an editable number field + 5% steps (`610575f`, `a739b1f`);
hardware reverted to an inline list line with header+dropdown on one row and
a "+ add" row button (`cf993b7`, `5fc450b`); **hardware added to Shelves &
Partitions + Drawer Fronts — 2 new priced buckets, cross-stack + prod
migration applied (`536e0b1`)**. ⬜ Deploy: redeploy quote-pay edge fns
(server costing) before the frontend push — SPEC.md § 13 (2026-07-03 later).

**Sub-steps.**
- ✅ Part A — editor sidebar (`e2d4e32`): pinned header (name + W/H/D/Qty +
  live total), 6 section rows with inline header controls (steppers, type
  pills, carcass smart input, interior chips), sections start collapsed,
  sticky action footer. `renderCBEditor` + `_refreshCBLiveCosts` rewrite;
  new `.cb-ed-*`/`.cb-sec-*`/`.cb-chip` CSS.
- ✅ Part B — results panel (`525a73b`): quote-editor-style line table
  (`.cb-li-table`), right-aligned totals (parity math verbatim), pinned
  footer bar (`#cb-results-footer`) with quote total + context action.
  Selector fixes: walkthrough preClickCard, `_cbRevealSelectedCabinet`.
- ✅ Cleanup — dead CSS purged; typecheck clean, e2e smoke 4/4, desktop +
  375px mobile verified in preview.
- ⬜ Follow-up (non-blocking): re-record cabinet-builder wiki clips
  (`wiki/recordings/build-and-price-a-cabinet.mjs` + `set-up-your-rates.mjs`
  reference `.cb-cab-card` → `.cb-li-row`).

### Public wiki + workflow clips (2026-07-03) ✅ Built + verified — ⬜ commit/push (tree shared with blog work)

**Goal.** Public how-to wiki at `/wiki` — one guide page per main function, each
with a short non-interactive screen-recording clip of the real workflow
(walkthrough-style, watch-only) + numbered steps. SEO-facing (sitemap/robots/
JSON-LD, currently absent site-wide) + an in-app Help-menu entry.
Full plan: `~/.claude/plans/i-want-to-create-kind-bachman.md`.

**Key constraints.** Video binaries stay out of git (existing .gitignore
policy) → clips live in a new public Supabase Storage bucket `wiki-clips`;
only the text manifest `wiki/clips.json` is committed. Pages render without
clips, so the wiki ships independently of recording.

**Sub-steps.**
- ✅ Phase 1 — pages: `wiki/guides.mjs` (9 guides, copy seeded from
  walkthrough) + `wiki/wiki.css` + `scripts/build-wiki.mjs` generator
  (pages + sitemap.xml + robots.txt) + `buildWikiPlugin` in vite.config.mjs +
  `_headers` entries + landing "Guides" links + Help-menu "Guides & Videos"
  (`_openGuides()` in src/help.js, per-tab deep link).
- ✅ Phase 2 — recording pipeline: dedicated `+wiki@` account (auto-created),
  `scripts/reset-wiki-account.mjs` (wipe + seed from seed_demo.sql shapes +
  onboarding suppression + permanent Pro grant), Playwright recorder with
  synthetic cursor (`wiki/recordings/_driver.mjs` + 9 drive scripts),
  ffmpeg post-process via Remotion's bundled binaries (webm → faststart mp4
  + poster), npm scripts `wiki:reset/record/encode/publish/clips`.
- ✅ Phase 3 — publish: `scripts/publish-wiki-clips.mjs` (bucket upload +
  manifest merge), all 9 clips recorded/encoded/published + pages verified
  with embedded video (Range 206 from the bucket confirmed). Storage gotcha:
  user-JWT uploads need a SELECT policy too (API uses INSERT … RETURNING) —
  see SPEC.md § 13 2026-07-03.

### Meta CAPI — lift signup + purchase match quality (2026-06-25) ✅ Built + typechecked — ⬜ deploy (3 fns) + verify in Events Manager

**Goal.** Close the two Events Manager recommendations on the Signups pixel
(weak event-match-quality + "add web-only CAPI") and lift the Purchase CAPI too.

**Discovery (corrected a wrong premise).** The signup server CAPI was NOT
missing — it already exists in prod: trigger `trg_meta_capi_signup` on
`auth.users` → `notify_meta_capi_signup()` → pg_net POST `{user_id}` →
deployed `meta-capi-signup` fn (v11). It fires for **every** signup incl.
Google OAuth, with a 1-hour freshness guard, matching on hashed email + an
`fbc` reconstructed from the stored `fbclid`. The repo just never had the
source. So the gap was only the higher-quality match signals a DB trigger
can't see (real `_fbc`/`_fbp` cookies + client IP/UA).

**Built (merge, not rebuild).**
- `supabase/functions/meta-capi-signup/index.ts` — brought the deployed v11
  into the repo and **extended** it: still serves the trigger's `{user_id}`
  call (email + reconstructed fbc, OAuth coverage, freshness guard, UUID
  validation all preserved), now **also** accepts `{fbc,fbp,event_source_url}`
  from a browser caller and reads client IP/UA from headers → richer
  `user_data` for email signups. Same `event_id signup-<user_id>` dedupes all
  three events (browser pixel + both server callers).
- `src/analytics.js` — `_trackSignupConversion()` now also POSTs the function
  (fire-and-forget, `keepalive`) with the real `_fbc`/`_fbp`; new `_readCookie`
  helper. Comments corrected to describe the dual server path.
- **Purchase CAPI** (`stripe-webhook`) matched email only — now the client
  (`src/stripe.js`) forwards `_fbc`/`_fbp` through `stripe-checkout` (stamped
  into the Checkout session metadata) into `sendMetaPurchase`'s `user_data`.
- `META_CAPI_ACCESS_TOKEN` confirmed set in prod.

**Remaining.**
1. Deploy 3 fns, all `--no-verify-jwt` (preserve current settings — `meta-capi-signup`
   is hit by pg_net; `stripe-checkout`/`stripe-webhook` both already false):
   `meta-capi-signup`, `stripe-checkout`, `stripe-webhook`.
2. Push client (Cloudflare) for the analytics.js + stripe.js wiring.
3. Verify in Events Manager: deduped CompleteRegistration with a Processed
   server event + rising EMQ; Purchase event carries fbc/fbp.

### Live link — customer-facing redesign + PDF download (2026-06-22) ✅ Built + verified (mock) — ⬜ verify against a live token after deploy

**Goal.** Make the customer live link (`/q/<token>`) look professional and
**consistent with the PDF the app generates** (`_buildOrderDocPDF`), and let the
customer **download a PDF** of their quote/order from the page.

**Design (approved via `livelink-redesign-mockups.html`).** One document identity
matched to the PDF: Helvetica, heavy `#111` rule under the header, `PREPARED FOR`
block, grouped line-item table (`CABINETS`/`LABOUR`), black total pill, red
discounts. Two responsive treatments of the same skin: desktop = document sheet +
sticky monochrome checkout rail; mobile = same document edge-to-edge with a sticky
bottom pay bar. The existing **floating Message launcher** is kept (restyled).

**Sub-steps.**
- ✅ `q.html` — reskinned to the document palette (forces light/paper via `body.qp` var overrides, ignores dark mode); kept overlays restyled (pay sheet, spec editor, photo viewer, chat launcher→dark pill, toast, states).
- ✅ `quote-public.js` — `render()`/`row()`/`rail()` rewritten to grouped-table document + sticky rail (desktop) / sticky action bar (mobile); new `docTotals()`/`ctaState()`/`actionBar()`/`updateSummaries()`; every handler kept (toggle, spec edit, accept/pay, chat, photo viewer). `renderTop()` removed (brand now lives in the document header; success states carry a `stateBrand()` line).
- ✅ Customer PDF — lazy `import('jspdf')` on `__qp.downloadPdf()`; `buildQuotePdf()` (async) mirrors `_buildOrderDocPDF` from the public payload (PREPARED FOR = client name; reuses the page discount logic). jsPDF stays code-split (not in the first-paint bundle).
- ✅ Logo — shown on the page header (`<img business.logo_url>`) and embedded in the PDF via a crossOrigin `<canvas>`→data-URL (`loadImageDataUrl`), caption-mode header (logo over small name + contact). Graceful name-banner fallback if the canvas is CORS-tainted (Supabase public buckets send permissive CORS, so it normally embeds).
- ✅ Decision logged: **no "Made with ProCabinet.app" branding** on the customer page/PDF (public payload has no tier flag — don't stamp paying makers; revisit if a tier signal is added). Footer = business name + date + Stripe-secured trust line.
- ✅ Verified via dev mock (`/q.html?mock=1`): desktop + mobile layouts, optional-toggle summary sync, spec-edit mode, chat, and a valid 9.6 KB PDF generated. `npm run typecheck` + `npm run build` clean.
- ⬜ Verify against a **live token** after deploy (mock can't exercise the edge-fn round-trips: toggle/edit persistence, real photos, Stripe pay sheet, the redirect-payment outcome states).

### Live link — auto-accept edits + server-side re-pricing (2026-06-21) ✅ Code done + parity-verified — ⬜ needs deploy

**Goal.** Add a Live-link toggle "Auto-accept customer changes". When ON, a
customer spec edit (dims/material/doors/etc.) on `/q` is **priced instantly
server-side** from the maker's rates and shown live — no "Price to confirm", no
maker confirmation. When OFF, current behaviour is unchanged (price cleared →
maker re-prices on Live-tab open).

**Why it's a real build (not a toggle).** The public page never receives the
maker's cost inputs by design (`quote-public.js` header), and the costing engine
(`calcCBLine`, ~440 lines) runs only in the maker's browser. Worse, it isn't pure
over `cbSettings` — `mp()`/`hwp()` do a **stock-first lookup** into the maker's
stock library (`stockItems` + `_scGet` category overrides), then fall back to the
`cbSettings` catalogue. So the server needs a faithful **resolved-rate snapshot**,
not a reload of `business_info`.

**Approach (chosen 2026-06-21): resolved-rate snapshot + thin Deno port.**
Resolve all price lookups in the browser (where stock-first logic already lives)
into a flat rate table, snapshot it onto the quote, and port only the geometry→
cost math to Deno. Price resolution stays single-sourced; only the math is
duplicated, guarded by a golden-parity test. We do **not** refactor the live
calculator into a shared core now (too risky on money-critical, working code).

- ✅ **LR.1 — migration** (`20260621160000_quote_rate_card.sql`): `quotes.rate_card
  jsonb`, `add column if not exists`, with a column comment. Service-role only;
  **never** selected by `quote-public-get`. `share_settings.auto_accept_edits`
  lives in the existing jsonb (no DDL). SCHEMA.md § 3.13 documented. Type regen
  deferred to deploy (LR.8).
- ✅ **LR.2 — snapshot builder** (`share.js` `_buildRateCard`): resolves
  `matPerM2` / `hwUnit` / `finishPerM2` for the full catalogue + stock + line-
  referenced names via the SAME `_matPricePerM2` / `_hwUnitPrice` /
  `_finishPricePerM2` (extracted to module scope in `cabinet-calc.js` so the
  stock-first logic isn't duplicated), plus the scalars/arrays + quote
  markup/discount/stock_markup. Written in `_generateShareLink` (resilient: falls
  back if the column isn't migrated yet) and refreshed in `_llSyncCustomerPrices`.
- ✅ **LR.3 — shared costing core** (`supabase/functions/_shared/costing.ts`):
  statement-order-faithful port of `calcCBLine` + `_extraPanelTotals` /
  `_typeRefHours` / contingency / constants, taking an explicit `rateCard`. Ports
  `quoteLineRowToCB` + the `_shareLineCustomerPrice` wrapper. `priceCabinetLine`
  also returns null when the snapshot doesn't cover a referenced rate (anti-
  under-charge guard).
- ✅ **LR.4 — parity test** (`costing.test.mjs`, `npm run test:costing`): golden
  fixture captured from the LIVE browser engine against a real rate card — Deno
  port matches all 6 prices **to the penny**; also asserts non-cabinet → null and
  missing-rate → null. Correctness backstop (these prices drive real charges).
- ✅ **LR.5 — edge fn** (`quote-public-update`, action `edit`): selects the line
  with `*` + the quote's `markup/discount/stock_markup/rate_card`; if
  `auto_accept_edits` && `rate_card` && cabinet → applies patch, prices via the
  core (quote-level wrapper taken fresh from the row), sets
  `patch.customer_price = newPrice`, posts an "auto-priced" chat note, returns
  `{ ok, customer_price }`. Any failure → null + "to confirm" (never a guess).
- ✅ **LR.6 — customer page** (`quote-public.js` `applyEdit` + `sendEdits`): uses
  the echoed `customer_price` (skips `_pending`) so price + rail update live;
  single summary toast worded per auto-priced vs awaiting-confirmation. Also
  fixed `applyEdit`'s missing success return (buffer cleanup now runs).
- ✅ **LR.7 — toggle UI** (`livelink.js`): "Auto-accept changes" row under
  "Let customers request changes", `data-needs="edit"` (shows/hides with the edit
  master), Pro-gated, default off, live caption swap (`_llAutoAcceptTgl`);
  persisted in `share_settings` via `_generateShareLink`. Render + handler
  verified in preview.
- ⬜ **LR.8 — deploy** (needs the user): **apply the migration FIRST**
  (`20260621160000_quote_rate_card.sql`) + regen types, **then** deploy
  `quote-public-update` (`verify_jwt=false`) — the function selects `rate_card`,
  so the column must exist first. The frontend is deploy-order-safe (the snapshot
  write falls back if the column is missing). Then push to `main`. Post-deploy
  smoke: share a quote with a cabinet line, unlock dims + turn Auto-accept on,
  edit dims on `/q`, confirm the price + total update without a confirm step.

### Email ↔ in-app messages bridge (2026-06-19) ✅ Code done — ⬜ needs deploy + DNS

Make the client-scoped chat (`customer_messages`) reachable by email both ways:
business/customer get an email when a message is posted, and either party can
reply straight from their inbox — the reply lands back in the same thread with a
"via email" badge + "View original". Full design + decisions:
`~/.claude/plans/i-would-like-messages-reactive-eagle.md`.

- ✅ **M.1 — migration** (`20260619150000_email_message_bridge.sql`): `clients.reply_token`
  (uuid, unique); `customer_messages.via / email_verified / inbound_email_id /
  outbound_email_id / outbound_status`; new `inbound_emails` table (idempotency +
  raw-HTML store) with owner-read RLS; `business_info.email_bridge_enabled`;
  `customer_messages` added to `supabase_realtime`; `notify_message_posted()` +
  `trg_message_notify` (founders-welcome pattern — security definer, exception-
  guarded, `pg_net` → messages-notify, skips `via='email'` for loop safety).
- ✅ **M.2 — messages-notify edge fn** (outbound): static `x-msg-key` auth,
  reloads the row, claim-flips `outbound_status`, Resend send to the opposite
  party with role-prefixed `reply_to` (`c-`/`b-<token>@reply.procabinet.app`),
  `Idempotency-Key`, thread headers.
- ✅ **M.3 — messages-inbound edge fn** (inbound webhook): Svix-verified
  `email.received` → fetch body via Resend received-email API → parse token →
  attribute sender (accept unverified, flag it) → strip quoted text → insert
  `via='email'`; also folds `email.delivered/bounced/complained` → `outbound_status`.
- ✅ **M.4 — frontend** (`clients-chat.js` + `app.js`): "via email" / "unverified"
  badge + "View original" (sandboxed iframe), email-bridge columns in every
  thread select, realtime `customer_messages` subscription. Typecheck clean;
  render verified in preview.
- ✅ **M.5 — docs**: PLAN / SPEC §13 / SCHEMA updated.
- ⬜ **M.6 — deploy + infra** (needs the user): apply the migration + regen types;
  deploy messages-notify & messages-inbound (`verify_jwt=false`); set
  `RESEND_WEBHOOK_SECRET` secret (`MSG_BRIDGE_KEY` is inlined like `x-fw-key`);
  add MX on `reply.procabinet.app` + enable Resend Receiving; register the Resend
  webhook (`email.received` + delivery events) → messages-inbound URL; verify DMARC.
- ⬜ **M.7 — fast-follow**: settings UI toggle for `email_bridge_enabled` (column
  already defaults true); per-burst email coalescing if multi-message spam shows up.

### Smoke-test suite + CI deploy gate (2026-06-19)

First automated tests in the project. Playwright smoke suite in `tests/e2e/`
(`tests/README.md` documents it). Goal: catch "an edit broke a whole flow"
before it deploys, instead of via customers.

- ✅ **T.1 — Playwright setup**: `@playwright/test` + chromium, `playwright.config.js`
  (auto-starts the Vite dev server, serial, single worker), npm scripts
  `test:e2e` / `test:e2e:ui` / `test:smoke`, gitignore for artifacts.
- ✅ **T.2 — logged-out boot tests** (`smoke.public.spec.js`): app boots, every
  classic `src/*.js` script loads (404 → red), no uncaught error on boot,
  auth toggle + empty-field validation. No account/secrets — runs in CI.
- ✅ **T.3 — logged-in render tests** (`smoke.app.spec.js`): sign in via the
  built-in `window._signInForTesting()` helper, assert dashboard + all 8
  sections + quote/order editor forms render without throwing. **Read-only**
  (real account + live Stripe — never writes/charges). Auto-skips where the
  helper is absent (prod build / CI without creds).
- ✅ **T.4 — verified**: full suite green (7 tests); confirmed the boot test
  catches a real break (hid `src/auth.js` → red naming the file → restored).
- ✅ **T.5 — CI deploy gate**: `deploy.yml` runs the suite after typecheck,
  before build/deploy — a failing test blocks the production deploy. Playwright
  webServer uses the hook-free `dev:test` script, not `dev` (whose `predev`
  `pkill` SIGTERMs the CI-managed server → exit 143; fixed in `374c1fd`).
- ✅ **T.6 — logged-in coverage in CI** (`4749b11`): dedicated throwaway test
  account `adamdenney33+e2e@googlemail.com` (created + email-confirmed via SQL,
  NOT a personal/customer account); creds as GitHub secrets
  `TEST_EMAIL`/`TEST_PASSWORD`; CI runs the full `npm run test:e2e` (logged-out
  + logged-in). Verified green in CI (7 passed, logged-in tests ran not skipped).

  **Ongoing habit:** add a read-only test for each customer-reported bug as
  it's fixed, so it can't silently return.

### Production email sends — welcome v2 + founders' welcome automation (2026-06-13)

Founder-approved copy synced from the Cowork email-plan artifact
(`cowork_email_plan_state`, SCHEMA.md § 3.27). Scope: the two ticked
one-offs only — the 8-topic drip series stays in the artifact, unticked,
for later. Founders receive only the founders' welcome (they're existing
accounts, so the signup welcome never targets them anyway).

- ✅ **E.1 — `send-welcome-email` v2**: copy replaced with the founder's
  chosen variant 2 ("Your ProCabinet account", reply-first body, mission
  line, feedback ask, sig wordmark linking to procabinet.app); greeting
  personalisation/claim-then-send/idempotency untouched; deployed v2;
  `marketing/welcome-email-2026-06-12.md` updated.
- ✅ **E.2 — `send-founders-welcome` (new)**: founder-approved copy (booking
  link, WhatsApp invite + inline QR via cid attachment, sig wordmark).
  Static `x-fw-key` auth (verify_jwt off), claim-then-send via
  `founders_welcome_sends` (email PK), Resend Idempotency-Key, guarded
  `[TEST]`-prefixed test mode to the own-address allowlist. Deployed v1.
- ✅ **E.3 — auto-send trigger**: `trg_founders_welcome` AFTER INSERT OR
  UPDATE OF plan on `subscriptions`, fires when plan → `'founder'` →
  security-definer `notify_founder_purchase()` resolves the buyer's email
  from `auth.users` and `net.http_post`s E.2; exception-guarded so it can
  never abort the Stripe webhook's write; EXECUTE revoked from anon/auth.
  Stripe webhook code untouched.
- ✅ **E.4 — verify + tests**: both deployed; [TEST] sends of both finals
  delivered to the founder via the production path (Resend 200s); security
  advisor clean (trigger fn EXECUTE revoked); SCHEMA.md § 3.27/§ 3.28 +
  SPEC § 13 updated.

  **Outstanding (not blocking):** the welcome v2 client hook reaches prod
  users on the next push to `main`; the founders' auto-send is live now
  (trigger + function deployed) but unproven on a real purchase — first
  real seat sale is the live test.

### CSV import/export — all fields available ✅ Done 2026-06-12

Every CSV surface (clients, stock, orders, quotes, cabinet library, cut
list) exported a subset of fields and several importers were broken or
lossy: clients import was a stub, orders import read columns in a
different order than its own export wrote them, quotes import inserted
`materials`/`labour` columns that no longer exist on the table (every row
400s), and cut-list import silently dropped Material (pieces) and Grain
(sheets). Upgrade all six to full-field, header-mapped round-trips.

- ✅ **CSV.1 — Shared helpers** (`src/ui.js`): `_csvParse` (quoted-field
  RFC-4180 parser — current `split(',')` corrupts notes/addresses with
  commas) + `_csvCol` header-to-index mapping with per-column aliases and
  positional fallback for headerless files.
- ✅ **CSV.2 — Clients**: export real fields (Name, Email, Phone, Address,
  Notes) from the `clients` array + derived stats; real importer
  (dedupe by name, free-cap gated) replacing the info-toast stub.
- ✅ **CSV.3 — Stock**: export/import Variant, Thickness (mm), Supplier,
  Reorder URL, Glue, EB Width (mm), EB Length (m), Coverage (m²/L)
  alongside the existing columns; category inserted as the real column;
  template updated.
- ✅ **CSV.4 — Orders**: header-mapped import (fixes the export↔import
  column mismatch); Order #, Markup %, Tax %, Discount %, Stock Markup %,
  Priority, Production Start, Notes in both directions; `order_number`
  auto-assigned when blank.
- ✅ **CSV.5 — Quotes**: insert only live columns (fixes the broken
  import); Materials/Labour £ preserved as `quote_lines` rows (item +
  labour); export gains Quote #, Stock Markup %, Total.
- ✅ **CSV.6 — Cabinet library**: full builder field set (type, room,
  carcass/door/drawer types + finishes, labour hrs/override, cost
  override, hardware ×3, extras, notes); legacy 22-col positional
  fallback kept.
- ✅ **CSV.7 — Cut list**: pieces import keeps Material; sheets import
  keeps Grain; pieces gain Notes + per-side edge bands (band name,
  `|trim` suffix); templates updated.
- ✅ **CSV.8 — Verify**: typecheck + browser round-trip pass on all six
  surfaces.

### Persistent demo data + dashboard "Remove demo data" ✅ Done 2026-06-12

The demo seed (src/demo.js) used to exist only inside the guided
walkthrough — the moment the tour closed, a new account landed in an empty
app. Now the seed stays visible as a read-only **overlay** merged into
normal signed-in reads until the user removes it via a dashboard button
(button disappears with the data). Client-side only: demo rows are never
written to Supabase; their ids are re-keyed negative so they can't collide
with real rows, and removal is an `onboarding_state` flag flip.

- ✅ **D.1 — Seed re-key**: negate all demo `id`/FK values in
  `_demoBuildDataset` (`id < 0` ⇒ demo row everywhere).
- ✅ **D.2 — Overlay engine** (demo.js + db.js): merge demo rows into
  `_db()` selects on content tables (skip `user_id` filter for demo rows);
  writes pass through to Supabase; writes targeting demo rows (negative id
  in where/payload) blocked with a debounced explainer toast.
- ✅ **D.3 — Activation + persistence**: `onboarding_state.demo_data`
  (`'active'`/`'removed'`) in business_info; first boot decides — empty
  account ⇒ active, account with data ⇒ removed (existing users never see
  it). LS mirror via `_wtPersistState` + a session removal latch.
- ✅ **D.4 — loadAllData merge**: decide overlay before hydrates; merge
  demo rows into orders/quotes/stockItems/clients boot arrays (early-boot
  fetches bypass `_db()`); keep next-id counters positive.
- ✅ **D.5 — Caps + numbering**: demo rows don't count toward free-tier
  caps (`_realCount` at call sites) and don't advance QUO-/ORD- numbering.
- ✅ **D.6 — Dashboard banner**: sample-data banner + "Remove demo data"
  button (gated on overlay flag); removal = flag flip + reload-in-place.
- ✅ **D.7 — Verify**: typecheck + browser pass (overlay on, real rows
  alongside, blocked demo writes, removal, post-removal boot all green).

### Onboarding welcome email for all new sign-ups ✅ Code done + verified 2026-06-12 — ⬜ activates on next push

One-time founder-voiced welcome email, sent automatically to every new
sign-up (email + Google OAuth), with a Google Calendar appointment-schedule
link to book a free 15-min setup call. Transactional/service email → all
signups, regardless of marketing opt-in; content stays non-promotional.
Plan: `~/.claude/plans/help-me-create-an-federated-axolotl.md`.

- ✅ **E.1 — Booking link**: Google Calendar appointment schedule
  ("ProCabinet Setup Call", 15 min, Meet, Mon–Fri 9–5 UK) →
  `https://calendar.app.google/3KU7rrEd8mnUu7599`. Title typed by the
  founder 2026-06-12 (Google's title field rejects synthetic input);
  public booking page verified complete.
- ✅ **E.2 — Copy doc**: `marketing/welcome-email-2026-06-12.md`, register of
  the founders' welcome email.
- ✅ **E.3 — Edge function** `send-welcome-email` (deployed v1, verify_jwt
  ON): gates (confirmed email · `WELCOME_CUTOFF` 2026-06-12T00:00Z ·
  `app_metadata.welcome_email_sent_at` claim), claim-then-send via Resend
  with `Idempotency-Key: welcome-email/<uid>`, claim rollback on send
  failure.
- ✅ **E.4 — Client trigger**: `_sendWelcomeEmailOnce(session)` in
  `src/auth.js` + fire-and-forget call beside `_syncMailingList` in
  `src/app.js` `onAuthStateChange`. **Prod users get the email once this
  ships via push to `main`** — the deployed function is inert until then.
- ✅ **E.5 — Deploy + verify** (all via throwaway
  `adamdenney33+pcwelcome1@googlemail.com`, since deleted? see cleanup):
  typecheck clean; `procabinet.app` verified in Resend; happy path = exactly
  one "Welcome to ProCabinet" delivered (Resend `c544b827…`, claim stamped
  12:54:14Z); idempotency = flag wipe + re-login → server skip, still one
  send; old-user skip = real account (created 05-17) booted the new client
  with no invocation. ⬜ Cleanup: delete the throwaway user in Supabase
  dashboard → Authentication → Users.

### Guided walkthrough on phones ✅ Done 2026-06-11

The onboarding tour was desktop-only by design (touch devices got the static
"Optimised for mobile" notice instead). Now it runs on every device:

- ✅ **W.1 — Touch gate removed** (`_wtStart`); Help → User Guide works on
  phones too.
- ✅ **W.2 — Per-step mobile pane** (`step.mv: 'list'|'editor'`): each step
  lands on the `body[data-mv]` pane holding its target, applied after the
  pre-click (card handlers flip to editor; `switchSection` resets to list).
- ✅ **W.3 — Sheet tooltip ≤760px**: pinned to the bottom screen edge
  (side-anchoring can't fit beside full-width targets; originally flipped
  top/bottom, but a top sheet covered pane headers — always-bottom since
  2026-06-12 user feedback).
- ✅ **W.4 — Touch affordances**: fingertip tap-dot replaces the arrow cursor
  on touch devices; swipe left/right steps the tour; device-aware copy
  (`bodyTouch`/`bodyNarrow` overrides — keyboard hint → swipe hint, gantt
  bars → agenda description).
- ✅ **W.5 — Async-safe pre-clicks**: `preClickCard` now waits for the card
  (like spotlight targets) instead of clicking blindly; the Cut List step
  pre-opens a demo cut list from the library (`#cl-lib-grid > div[onclick]`
  skips the "Loading…" placeholder) so the spotlit pane shows real
  sheet/piece data on desktop too, not the empty gate.
- ✅ **W.6 — Mobile notice demoted**: `_wtMaybeAutoStart` shows it only when
  the full tour is NOT auto-starting; CTA plan picker stacks to one column
  ≤480px; tour buttons get ≥42px tap targets.

### App load performance pass ✅ Done 2026-06-11

The /os app boot is a strict waterfall: 1.24 MB module bundle (Supabase +
Sentry + PostHog + jsPDF eager) → 40 classic defer scripts (~1.8 MB) →
DOMContentLoaded → INITIAL_SESSION → *then* ~9 render-gating data queries.
Goal: cut the critical-path JS and overlap data latency with script loading.
**Result: boot bundle 1.24 MB → 652 KB; all nine early-fetch slots consumed
on a signed-in reload (verified in dev preview).**

- ✅ **P.1 — Lazy jsPDF (main.js + cutlist.js):** drop the eager
  `jspdf`/`jspdf-autotable` imports; `window._ensureJsPDF()` dynamic-imports
  both on first use (warmed post-`load`). The five PDF builders await it;
  existing `!window.jspdf` guards stay as fallback.
- ✅ **P.2 — Lazy PostHog (main.js + analytics.js):** dynamic-import + init
  after `load` so the SDK parse, recorder fetch, and recording CPU leave the
  boot path. `_identifyUser` stashes `window._pendingIdentify` for the
  init handler to replay; pageview still captured at init.
- ✅ **P.3 — Defer gtag/Meta pixel script injection to `load` (main.js):**
  stubs stay eager (queued conversions still flush) — only the external
  script downloads move out of the boot window.
- ✅ **P.4 — Early boot fetch (main.js + db.js + app.js + limits.js +
  accounting.js):** main.js reads the stored Supabase session and fires the
  nine render-gating REST queries immediately (`window._earlyBoot`),
  overlapping data latency with classic-script download/parse.
  `_earlyBootOr()` consumes each result once (user-id-guarded) and falls
  back to the normal `_db()` query on any miss/error/expiry.
- ✅ **P.5 — Supabase preconnect (index.html + q.html):** `%VITE_SUPABASE_URL%`
  preconnect hint so auth/REST/realtime skip DNS+TLS setup.
- ✅ **P.6 — Right-sized favicons:** 512px/137KB PNG served for both icon
  rels → 64px favicon + 180px apple-touch variants.
- ✅ **P.7 — One boot load per user (app.js):** production waterfall showed
  every boot query running TWICE — supabase-js emits INITIAL_SESSION then
  SIGNED_IN for the same stored session on every page load (and SIGNED_IN on
  tab refocus, TOKEN_REFRESHED hourly), and the auth handler ran the full
  `loadAllData()` on each, serialized. `_bootLoadedUserId` guard: full load
  only when the signed-in user changes; repeat events just update the bearer
  token. 38 boot REST requests → 18.

### Conversion funnel — P0 fixes from full-funnel review ✅ Done 2026-06-09

From a landing-page / conversion-flow / pricing / onboarding review (2026-06-09).
The four leaks below are fixed; the rest of the review lives in
"Conversion funnel — review backlog" below. Summary in SPEC.md § 13.

- ✅ **F.1 — Pending-plan persistence (app.js):** the landing `?plan=` deep-link
  is stashed only on `window._pendingPlan`, so it dies during the signup →
  email-confirm round trip (a fresh page load). Persist to localStorage
  (`pc_pending_plan`, 48 h TTL), consume on the first authenticated auth event,
  and skip the walkthrough auto-start on that load (the page is redirecting to
  Stripe Checkout; the tour shows on return).
- ✅ **F.2 — Trial-ending banner (stripe.js + limits.js):** the 14-day trial
  currently lapses silently (countdown only in the account dropdown). Slim
  dismissible banner under the header for the last 3 trial days, re-shown once
  per remaining day, "See plans" → `_wtStartCta()`. PostHog events
  `trial_banner_shown` / `trial_banner_upgrade_clicked`.
- ✅ **F.3 — Plan picker on tour skip (walkthrough.js):** `_wtSkip` closed the
  tour without ever surfacing the plan picker — only completers of the 26-step
  tour saw pricing. Skipping the auto-run first tour now ends on the standalone
  CTA. Guarded: auto-run tours only (not the Help re-trigger), not Pro users,
  not when already on the pricing step, never from the CTA-only overlay.
- ✅ **F.4 — Getting Started card (dashboard.js + walkthrough.js):** completing
  the tour set `pc_hide_guide`, hiding the only call-to-action card exactly for
  the users with an empty app — stop setting it. Card copy still referenced the
  removed Projects entity; rewrite steps to the aha path (set rates → add stock
  → build a cabinet → first quote) with deep-links.

### Conversion funnel — review backlog 🚧 P1–P3 batch done 2026-06-10

Findings from the same review, roughly priority-ordered. The 2026-06-10 batch
cleared most of it (see SPEC.md § 13); remaining ⬜ items are blocked on
user-side config or policy decisions.

- ⬜ **Mobile pricing path:** the tour is desktop-only and returns *before*
  persisting dismissal on touch, so `_wtMaybeShowSessionCta` is never reached —
  mobile-only users never auto-see the plan picker. Add a mobile-friendly
  pricing surface on first run (or at least persist dismissal on touch).
- ⬜ **Trial-end emails:** email-flow-plan.html covers Day 0–13 but nothing is
  implemented (only `list-subscribe` exists). Minimum: Day-12 "trial ending"
  and Day-14 "what changes now" sends via Resend.
- ⬜ **Pre-signup product proof:** guest demo mode was removed and there's no
  video — every landing CTA hits the auth wall ("Open the app →" over-promises
  for cold visitors). Add a 60–90 s hero demo video (remotion pipeline exists)
  or revive a read-only `/os?demo` marketing surface.
  *(Update 2026-06-11: the ~65 s founder demo film is rendered in
  `demo-video/` — embedding it on the landing is the remaining step.)*
- ⬜ **Landing social proof:** promote "Made by a cabinet maker" from the footer
  to a founder-story section; pull quotes from Creator Lifetime users near the
  hero CTA and pricing.
- ✅ **Landing FAQ + schema** (2026-06-10): 6-question `<details>` FAQ section
  after pricing (trial end, cancel, currency, DXF/CAM, units, customer live
  link) + matching FAQPage JSON-LD in `<head>` + footer link.
- ✅ **Currency clarity on pricing cards** (2026-06-10): `.price-currency` line
  under the pricing header — "Prices in USD — checkout bills in your local
  currency."
- 🚧 **Signup friction:** ✅ first/last-name fields removed (index.html +
  app.js: no validation, no user_metadata names — downstream already tolerates
  nameless accounts) and post-signup copy fixed ("the confirmation link signs
  you in automatically"). ✅ Google OAuth **code** shipped 2026-06-10
  ("Continue with Google" button, OAuth redirect-error surfacing, marketing
  opt-in recovery — § 13); ⬜ activation still needs the Google Cloud OAuth
  client + enabling the provider + redirect URLs in the Supabase dashboard
  (user-side). ✅ Confirmation-flow dead ends fixed 2026-06-11: check-your-inbox
  panel (resend w/ 60 s cooldown, spam hint), already-exists detection routes
  to sign-in, `email_not_confirmed` errors route to the panel, forgot-password
  flow added, `mailer_otp_exp` raised 1 h → 24 h (§ 13).
- ✅ **Tour length** (2026-06-10): 26 → 10 steps (cut Clients ×2, Quote list,
  Orders ×2, Stock ×2, Cabinet Library, Cut List Library/Layout, Schedule
  queue, Dashboard quick-actions, Toolbar ×4). `WT_VERSION` deliberately NOT
  bumped — nothing new to teach. Post-tour checklist = Getting Started card
  with progress ticks (see dashboard.js).
- ✅ **Session CTA cadence** (2026-06-10): standalone plan picker now skips
  trial users entirely (trial banner owns days 12–14) and fires at most once
  per 7 days for free users (`pc_wt_cta_last`, also stamped on tour close).
  Limit-hit / Pro-feature modals stay intent-triggered.
- ✅ **$299 vs $300 annual** (2026-06-10): unified at **$299/yr** — landing
  annual card, walkthrough CTA, stripe.js manage-popup fallback, analytics
  purchase-conversion value. Stripe Price was already $299.
- ⬜ **Launch-offer end checklist** — when the 6-month launch pricing ends,
  update every hardcoded price string: `landing.html` Monthly/Annual cards
  (amounts, `<s>` strikethroughs, "First 6 months…"/"$180 billed…" bullets),
  `src/walkthrough.js` `_wtCtaHTML` (same four tiers), `src/stripe.js`
  `_openLimitHitModal` / `_openProFeatureModal` / `_openManagePopupFree`
  ($15/$25 footer splits), trial banner copy ("from $15/mo") in
  `_renderTrialBanner`. The Manage Subscription popup is already live via
  `stripe-subscription`; everything else is static copy.
- 🚧 **Founder card:** ✅ live `founder_seats_taken` counter wired on landing
  (Supabase URL + publishable anon key injected as `window.__PC_SB` by
  `copyLandingPlugin`; `landing.js founderSeats()` swaps the flag for
  "N of 50 left", handles sold-out by disabling the CTA; dev = clean no-op)
  and "ever **sold**" phrasing everywhere (Creator Lifetime gifts exist).
  ⬜ 30-day money-back line on the Founder card — needs a refund-policy
  decision first.
- ⬜ **Free-tier copy:** "Limited access to new features" is vague — specify or
  cut.
- ✅ **Stock uncapped on free tier** (2026-06-10): `stock` removed from
  `FREE_LIMITS`; both create guards in stock.js dropped; "Load defaults"
  inserts the full set; copy updated everywhere (landing free card + FAQ +
  JSON-LD, walkthrough CTA, manage-subscription popups). Stock is the
  setup-investment library that feeds quotes/cut lists/orders — capping it
  blocked the core loop without adding upgrade intent. Quotes/orders/cabinets/
  cut lists/clients caps unchanged.

### Growth: paid-acquisition tracking + founders push ✅ Code done 2026-06-10 — ⬜ user-side config to activate

Full-stack pass from a Meta Ads × PostHog × Supabase funnel review (30d: ~£305
spend → 845 LPVs → 20 signups (1.29%) → 4 upgrade clicks → 0 real sales,
because Stripe is still test-mode). Goal: make Meta optimise for signups
instead of landing-page views, make purchases measurable, and surface the
founders' offer. Details in SPEC.md § 13 (2026-06-10 growth entry).

- ✅ **G.1 — Server-side signup conversions:** new `meta-capi-signup` edge
  function (CAPI `CompleteRegistration`, event_id `signup-<user_id>`, hashed
  email + fbc from signup attribution) + `trg_meta_capi_signup` AFTER INSERT
  trigger on auth.users via pg_net (migration `meta_capi_signup_trigger`).
  Covers OAuth signups and pixel-blocked browsers; dedupes with the browser
  pixel, which now passes the same eventID (`analytics.js` / `app.js`).
- ✅ **G.2 — Purchase conversions + analytics:** stripe-webhook v22 fires Meta
  CAPI `Subscribe`/`Purchase` (exact `amount_total`, hashed email, fbc) and
  PostHog `subscription_started` after the DB write on
  `checkout.session.completed`; both env-gated no-ops until secrets are set,
  never able to 500 the webhook. Browser-side Meta purchase pixel removed from
  `_trackPurchaseConversion` (CAPI is canonical; GA4/Google Ads unchanged).
- ✅ **G.3 — Founders offer above the fold:** hero `.micro-founder` line on
  landing.html ("$299 once, yours forever · only N of 50 seats left" →
  #pricing), live count via the existing `founderSeats()` IIFE
  (#founder-hero-left; hides itself when sold out).
- ✅ **G.4 — Meta campaigns (created PAUSED via API):** campaign
  `52550164607114` "Signups (pixel CompleteRegistration)" (OUTCOME_LEADS) with
  ad set `52550164945314` (£15/day, OFFSITE_CONVERSIONS on
  COMPLETE_REGISTRATION, same interests/geo as the winning traffic ad set) and
  the proven Overview reel creative; campaign shell `52550164627114`
  "Founders Retargeting (warm)" (OUTCOME_SALES) awaiting custom audiences.
- ⬜ **G.5 — User-side activation (blocking):**
  1. ✅ **S.9 Stripe live-mode flip** — done (verified via secret digests
     2026-06-11; see the Stripe section). Still open: decide whether to purge
     the 3 test-mode `subscriptions` rows (they grant Pro + inflate the
     founder counter) and run one live Checkout as a smoke test.
  2. ✅ CAPI token set (user, 2026-06-11) — `META_CAPI_ACCESS_TOKEN` digest
     verified via `supabase secrets list`; `meta-capi-signup` v3 ACTIVE,
     `trg_meta_capi_signup` enabled on auth.users. Secret-set restarts the
     function instances, so no redeploy needed. Live confirmation = next real
     signup (fn logs show `CAPI failed` if the token is bad; Events Manager
     should show the event arriving on the Server channel, deduped against
     the browser pixel via `signup-<user_id>`). `POSTHOG_KEY` (optional, for
     stripe-webhook `subscription_started`) still unset.
  3. In Ads Manager create two custom audiences: "Video viewers 25% — 180d"
     (the Overview reel) and "Website visitors — 30d" (pixel) — then the
     retargeting ad set + founders ad can be built into `52550164627114`.
  4. ✅ Enable the Signups campaign + pause the LPV traffic campaign once
     CompleteRegistration events flow — done by 2026-06-11: Signups ACTIVE
     (£25/day), traffic campaign PAUSED; **8 registrations attributed
     2026-06-11 on £36.81 (~£4.60/signup)** vs ~£15/signup implied by the
     traffic test.
  5. Send the founders email — `marketing/founders-email-2026-06-10.md`
     (original two-item copy unchanged; stale S.9 warning cleared 2026-06-12
     — the Claim link is live). **Ready to send.** When a seat sells,
     deliver the WhatsApp-group perk with the new
     `marketing/founders-welcome-email-2026-06-12.md` (buyers-only invite
     link + QR at `marketing/assets/founders-whatsapp-qr.png`).

- ✅ **G.6 — Phase C: Advantage+ audience expansion (2026-06-11, built
  PAUSED):** with conversion signal flowing (G.5.4), added ad set
  `52552921435714` "Advantage+ audience — EN — optimise for signups" to the
  Signups campaign — £15/day, OFFSITE_CONVERSIONS on COMPLETE_REGISTRATION,
  lowest-cost, same 5-country EN geo, `advantage_audience: 1` — plus ad
  `52552921521714` reusing the proven Overview-reel creative
  (`2649365965481144`). A/Bs Meta's AI audience against the interest stack;
  completes the original Meta plan's Phase C (conversions + Advantage+).
  **PAUSED awaiting explicit enable** (per guardrails, no spend without
  confirmation).

### Orders → cabinet line editing UX pass ✅ Done 2026-06-10

Closed the Orders→Builder round trip and fixed latent order-context bugs.

- ✅ **Targeted edit:** the row icon / new double-click on an order's cabinet
  line opens the Builder with THAT cabinet pre-selected (`editOrderInCB`/
  `editQuoteInCB` take an optional `lineId`; `_cbRevealSelectedCabinet()`
  scrolls form + card into view). Dbl-click guard so selecting text in
  inputs no longer jumps into the Builder (quotes had this bug too).
- ✅ **Round trip closed:** banner always shows (was hidden on zero-cabinet
  orders = dead end), leads with the ORD-number, and "← Back to order"
  (was "Done") returns to the order editor. New `discardOrderEdits()`
  restores the entry snapshot (parity with quotes).
- ✅ **Data-risk fixes:** `_exitClient_cabinet`/`_cbNewClient` now detach
  `cbEditingOrderId` (stale id routed later standalone autosaves into the
  order, wiping its cabinet lines); reload mid-edit now restores the
  order-editing session (`pc_cb_editing_order_id` was write-only); quote
  restore now filters `line_kind='cabinet'`.

Detail: SPEC.md § 13 (2026-06-10).

### Customer payments + live quote/order pages (Stripe Connect) ✅ LIVE 2026-06-10

Public `/q?t=<share_token>` live pages (`q.html` + `src/quote-public.js`) where a
customer views a quote/order, edits unlocked specs, accepts, chats (two-way), and
**pays a deposit/balance by card** into the business's own Stripe — ProCabinet takes
a **0.7% (capped ~$100)** application fee. Built across the quote/order overhaul
(migrations `20260604120000`+; edge functions `quote-public-get`/`-update`,
`quote-messages`, `quote-pay`, `quote-pay-webhook`, `connect-onboard`,
`connect-status`; `src/livelink.js`/`share.js`/`connect.js`). Schema:
`stripe_accounts`, `payments`, `customer_messages`, `line_photos` + quote/order
`share_token`/`share_settings` (SCHEMA.md § 3.23–3.26).

- ✅ **Charge model corrected to the agreed design (`6711b61`).** Was Express +
  destination charges (platform paid Stripe's fee → net loss; cross-region limits),
  no cap, 1.5% default. Now **Standard accounts + direct charges**, **0.7% capped
  ~$100/currency**; `quote-pay` returns `account_id`; `quote-public.js` confirms with
  `{ stripeAccount }`.
- ✅ **Auth-token fix (`112972c`).** Connect calls used `_sb.auth.getSession()` (stale
  on Safari → 401 "Invalid auth token"); switched to the in-memory `_dbAuthToken()`.
  Same latent bug flagged for stripe.js checkout/portal + accounting.js (separate task).
- ✅ **Connect key decoupled (`cb84b66`).** Payments read `STRIPE_CONNECT_SECRET_KEY` /
  `STRIPE_CONNECT_PUBLISHABLE_KEY` (fallback to the live subscription key), so they run
  in a **test sandbox** while live billing keeps running untouched.
- ✅ **customer_price stale-£0 fix (`57d6bb4`) + perf (`1ae213b`).** Recompute each
  line's `customer_price` on every Live-link-tab open (the snapshot drifted when a line
  was edited or shared while still £0); per-line writes parallelised. Stale "deleted
  from project" delete-confirm copy fixed (`de83d48`).
- ✅ **Webhook order-number fix.** `createOrderFromQuote` now numbers orders `ORD-####`
  to match the app's `_nextOrderNumber` (was emitting `0001`).
- ✅ **Connect enabled (sandbox) + Connect webhook configured; `STRIPE_PLATFORM_FEE_BPS=70`.**
- ✅ **End-to-end test PASSED (test/sandbox, 2026-06-09).** Onboarded a Standard account
  → paid a 40% deposit on `/q` (£692.39) with a test card → `payments` row `succeeded`,
  **fee £4.85 (0.7%)**, `quote-pay-webhook` 200, quote → `deposit_paid`, order auto-created.
- ✅ **Bank transfers + fees page (2026-06-10).** Per-quote "Accept bank transfer" toggle
  (`share_settings.allow_bank_transfer`, livelink.js/share.js); `quote-pay` attaches a
  connected-account Customer + `payment_method_options.customer_balance`
  (gb/us/eu/jp/mx funding types, EU needs `stripe_accounts.country`, card-only fallback
  on Stripe rejection) while keeping `automatic_payment_methods` so Pay by bank still
  surfaces from the maker's dashboard. `quote-public.js`: `return_url` on confirm,
  bank-pending + processing states, redirect-return handling in `boot()`. New static
  `/payment-fees` page (privacy.html pattern, copied in `vite.config.mjs`) linked from
  the Live link panel, share popup, and Connect popup. Webhook unchanged (async
  `payment_intent.succeeded` already books the order).
- ✅ **Live-mode flip (go-live) — 2026-06-10.** `STRIPE_CONNECT_SECRET_KEY` now matches the
  live `STRIPE_SECRET_KEY` (same secret digest) and `STRIPE_CONNECT_WEBHOOK_SECRET` is set
  (live Connect webhook); `STRIPE_PLATFORM_FEE_BPS` unset → code default 70 bps (0.7%).
  Customer payments are REAL MONEY from here — no test-dashboard funding simulations.

Detail: SPEC.md § 13 (2026-06-09).

### Quote/order cards — one status language, live link optional ✅ Done 2026-06-10

The cards mixed three status displays (badge, pipeline, live stamp) in two
vocabularies, and a critical bug wiped statuses on every editor autosave.

- ✅ **Status-wipe bug (critical):** `saveQuoteEditor`/`saveOrderEditor` read
  the long-removed `#pq-status`/`#po-status` selects → wrote `status: ''` on
  every 600 ms autosave, destroying live-link statuses (accepted/deposit_paid →
  card showed "Draft"). Editors now preserve the row's status (it's owned by
  the card pipeline + live-link events). Repaired 4 quotes + 5 orders in prod
  via SQL (status inferred from accepted_at/viewed_at/share_token).
- ✅ **Quote card:** one status display — badge carries the granular state +
  date ("Accepted · 2 Jun"); duplicate meta stamp removed; pipeline renamed
  Draft → Sent → **Accepted** (one vocabulary; 'approved' is a read alias) and
  its active step shows the same granular word (Viewed / Deposit paid / Paid);
  muted "Link live · not viewed yet" hint only when a link exists. Without a
  live link the card is purely the manual pipeline — nothing extra shows.
- ✅ **Pipeline guard:** clicking an earlier stage on a customer-driven status
  (viewed/accepted/deposit_paid/paid) asks for confirmation with what the
  customer actually did; same-stage clicks keep the richer truth (no silent
  viewed→sent downgrades). Manual-only flows behave exactly as before.
- ✅ **Order card:** payment is its own dimension — the second look-alike badge
  is replaced by an outline pill in the meta row ("✓ Deposit paid · balance
  due" / "✓ Paid in full" / "Link live"); production badge + pipeline untouched.
- ✅ **Dashboard:** Recent Quotes rows use `_quoteStatusMeta` (its own ternary
  showed "Draft" for viewed/accepted/paid quotes).

Detail: SPEC.md § 13 (2026-06-10).

### Live link + cabinet quote — UX/UI review pass 2 ✅ Done 2026-06-09

Full re-review of both workflows (business + customer sides); 14 fixes landed.

- ✅ **Spec-change requests now persist + notify** — `quote-public-update` 'edit'
  nulls `customer_price` (page shows "Price to confirm" across reloads) and
  auto-inserts a `customer_messages` row describing the change (unread badge +
  audit trail); `quote-pay` returns `price_pending` instead of silently
  charging stale/skipped prices (both redeployed, v13). Customer CTA disables
  while pending; the Live-link tab force-refreshes `quote_lines`, reprices, and
  shows an amber "customer requested changes" banner.
- ✅ **Pricing consistency** — quote/order editor totals now show the stored
  `markup` row (was omitted → editor disagreed with card/live page/PDF/order
  value); order editor also no longer drops stock materials from its subtotal;
  `renderCBResults` uses the open quote/order's markup/tax/discount instead of
  `cbSettings` (label says "(est.)" only when standalone).
- ✅ **Customer page UX** — include/exclude knob direction fixed (right = on);
  accepted quotes render read-only; "Your discount (N%) — you save £X" row;
  richer cabinet spec line (material/doors/drawers); styled toasts replace
  alert(); confirm sheet before non-payment accept; spec-editor range hints +
  friendly range/option errors; Edit chip is a real button (keyboard a11y).
- ✅ **Business panel** — `_llAutoSave` takes an explicit kind (was inferring
  from leftover tab state → could save settings onto the wrong record); stale
  "then Generate" copy removed; settings saves reload just the preview iframe
  (no flash).

Detail: SPEC.md § 13 (2026-06-09).

### Live-link workflow — clarity & trust pass ✅ Done 2026-06-09

Full review of the business + customer live-link flow; fixed the verified issues.

- ✅ **Security (deployed):** stopped `quote-public-get` leaking cost inputs
  (`unit_price`/`labour_hours`) + `abn`/`bank_details` to anyone with a link;
  `quote-pay` expiry guard; `quote-public-update` snapshot validation;
  `quote-messages` rate limit; `quote-pay-webhook` idempotent under the
  duplicate-order race (`orders_quote_id_unique`). 5 functions redeployed.
- ✅ **Customer page:** phone+email contact, friendly errors, loading spinner,
  order banner, deposit/balance breakdown, "what happens next" confirmation,
  VAT clarity, a11y + mobile fixes.
- ✅ **Business panel:** live status row, Stripe-not-connected payment guard,
  plain-language toggle relabels, fee transparency, empty-quote guard.

Detail: SPEC.md § 13 (2026-06-09).

### Quote/Order cards sync with live-link status ✅ Done 2026-06-09

Quote & order cards now reflect the live-link lifecycle the backend already
records, and update in **realtime** without a reload.

- ✅ **Status vocabulary reconciled** — `QUOTE_STATUS_META` + `_quoteStatusMeta(s)`
  in `src/quotes.js` map the richer edge-function statuses (`viewed`/`accepted`/
  `deposit_paid`/`paid`) onto the existing Draft→Sent→Approved pipeline via
  `stage`, with granular `label`/`badge`. Replaced the duplicated 3-value ternary
  at all 6 render sites (quotes card/sidebar/counts/filter, `clients.js`,
  `cabinet-render.js`). Fixes customer-driven statuses silently showing "Draft".
- ✅ **Live-link stamps/chips** — quote cards show "👁 Viewed"/"✓ Accepted" dates;
  order cards show "Link live" / "Deposit paid" / "Paid" (derived from the linked
  quote; no "viewed" for orders; production pipeline untouched).
- ✅ **Supabase realtime** — `_subscribeLiveStatus()` in `src/app.js` subscribes
  to `quotes`/`orders` `postgres_changes` (per-user), merges in place + re-renders.
  Migration `enable_realtime_quotes_orders` adds both tables to the publication.

Detail: SPEC.md § 13 (2026-06-09).

### Cut type toggle — panel saw (guillotine) vs CNC router (nested) ✅ Done 2026-05-25

The optimiser was guillotine-only (edge-to-edge cuts for a panel saw). Added a
**Cut for: Panel saw / CNC router** toggle by the Optimize button. CNC-router
mode uses a non-guillotine packer (parts placed freely, denser packing); the
per-sheet kerf doubles as the router-bit gap.

- ✅ `src/cutlist.js` — `cutMethod` state (persists to `localStorage.pc_cut_method`),
  `packSheetNested` (MaxRects-BSSF + rotation/grain, gap baked into footprint) +
  `_pruneFreeRects`, `setCutMethod`/`_syncCutMethodToggle`, and `optimize()` picks
  the packer. Output shape identical to the guillotine packer, so layout/PDF/DXF
  consume it unchanged.
- ✅ `index.html` — segmented toggle in `#cl-action-bar`; `styles.css` — `.cut-method*`
  styles; `src/app.js` — init sync.
- ✅ Verified in the dev preview: nested = 0 overlaps / 0 out-of-bounds / 0 gap
  violations and denser (94% vs 92% on a real layout); toggle re-optimises and
  persists. `npm run typecheck` clean. **Detail in SPEC.md § 13.**

### DXF / CNC export of the nested cut layout ✅ Done 2026-05-25

A new **DXF** button in the Cut Layout toolbar (beside PDF) exports the
optimiser's nested layout as a single DXF for import into CAM / CNC nesting
software — every unique sheet packing tiled left-to-right into one drawing,
parts pre-placed at their cut positions. Pro-only (mirrors the CSV export
gating). G-code is deliberately out of scope: the correct handoff is a DXF the
user drops into their own CAM, which posts G-code for their specific machine.

- ✅ `src/cutlist.js` — `exportLayoutDXF()` (Pro-gated, one combined download
  `<name>-nested.dxf`) + R12/AC1009 DXF builders `_buildLayoutDXF` (tiles the
  unique layouts) / `_dxfSheetBlock` (one sheet at an offset, with caption) /
  `_dxfRect` / `_dxfText` / `_dxfTextLeft` / `_dxfNum` / `_dxfFilenameSafe`.
  Sheet outline / parts / labels on separate layers; top-left→bottom-left
  origin flip; cut (edge-band-trimmed) sizes; `$INSUNITS` from `window.units`.
- ✅ `index.html` — `DXF` button in `#layout-toolbar-top`.
- ✅ Verified in the dev preview (metric + imperial, real `optimize()` run);
  `npm run typecheck` clean. **Detail in SPEC.md § 13.**

### Paid-ads tracking — landing-page coverage fix ✅ Done 2026-05-23

The 2026-05-19 attribution foundation only fired on the app (`/os`), but paid-ad
clicks land on the marketing landing page (`landing.html` at `/`), which loaded
PostHog only — so GA4, the Meta Pixel, and the first-touch attribution capture
never ran where the click actually arrives. Every paid signup looked organic;
Google Ads / Meta couldn't attribute conversions. Fixed by firing the same
tracking on the landing page.

- ✅ `landing.html` — inline tracking block mirroring `src/main.js`: `pc_attribution`
  first-touch snapshot + GA4/Google Ads gtag loader + Meta Pixel init/PageView,
  placed after the auth/Stripe redirect so pass-throughs don't fire stray events.
- ✅ `vite.config.mjs` — `copyLandingPlugin` now injects `__VITE_GA4_ID__` /
  `__VITE_GOOGLE_ADS_ID__` / `__VITE_META_PIXEL_ID__` at build time (same
  placeholder mechanism already used for the PostHog key/host).
- ✅ `landing.js` — forwards utm_*/gclid/fbclid onto every `/os` link
  (belt-and-braces; the same-origin cookies + localStorage already carry over).
- Env-gated like `main.js` — no IDs set → `val('')` → no-op, zero network calls.

**Detail in SPEC.md § 13.**

### Mobile-native responsive pass ✅ Done 2026-05-23

Comprehensive portrait-phone redesign. Replaces the old horizontal-scroll hack
with true single-column "one pane at a time" stacking, touch sizing, and reworks
the hard surfaces. Full plan: `~/.claude/plans/swirling-knitting-thompson.md`.
Breakpoints: `@media (max-width:760px)` = single-column; `@media (pointer:coarse)`
= touch targets (independent).

- ✅ **Phase 1 — Single-column layout + drill-in** (2026-05-23). `body[data-mv]`
  ("list" | "editor") + `.mv-pane-editor`/`.mv-pane-list` marker classes on every
  section's two panes + new `src/mobile-nav.js` (`_mvSet`/`_mvIsMobile`/
  `_mvShowEditor`/`_mvShowList` + a global "← Back to list" bar). The 760px block
  in `styles.css` stacks the panels and shows one pane at a time; the old
  `min-width:840px` portrait hack is gone. Drill-in wired into the existing
  card→editor / back→list fns (quotes/orders/stock/clients + cabinet/cut-list
  openers); `switchSection` resets to list. `_renderProjectHeader`'s back button
  also returns to list. Cabinet/Cut-List creation lives in the sidebar, so
  `.mv-only` "+ Add" / "Open builder" buttons were added to those list panes so
  the sidebar is reachable on a phone. Verified at 390px (Clients/Quotes/Cabinet)
  + desktop regression (two-pane intact). typecheck clean.
- ✅ **Phase 2 — Touch sizing**. One `@media (pointer:coarse), (max-width:760px)`
  block: 16px form fields (kills iOS focus-zoom) + 42px min-height, ≥44px buttons,
  taller nav tabs/pills/steppers/suggest rows, 40px back-bar. OR query so it's
  verifiable in a desktop preview window; dense `.cl-input` table cells excluded.
- ✅ **Phase 3 — Header & nav**. Header padding 24→12px + tighter gap, BETA badge
  hidden <420px (fixes the 4px account-button overflow); dropdowns capped to
  `calc(100vw-16px)`. Nav already icon-only ≤1240px → 8 icons share the width.
- ✅ **Phase 4 — Line-items → cards**. `.editor-li-table` collapses to one card
  per line on ≤760px (description on top, "Label → value" rows, bold total, ✕ in
  corner). Pure CSS via `::before` on the column classes; hide-hrs/hide-disc still
  work; desktop keeps the table.
- ✅ **Phase 5 — Canvas pinch-zoom/pan**. `_clAttachCanvasGestures` (pointer
  events, phones/coarse only) transforms the cut-layout canvas via CSS (bitmap
  pristine → PDF unaffected): pinch 1×–6×, drag-pan when zoomed, double-tap
  zoom/reset; `touch-action` flips to none only while zoomed. `optimize()` reveals
  the list pane on mobile.
- ✅ **Phase 6 — Schedule agenda**. `renderSchedule` branches on `_mvIsMobile()`
  to a stacked agenda (`_renderScheduleAgenda`) reusing `sortedEvents` — job cards
  with dates/status/slack/priority, sort+filter+hours relocated into the header;
  re-renders on a matchMedia change. Desktop keeps the 7-col grid + sidebar.
- ✅ **Phase 7 — Notice reframe + polish**. Reframed the once-per-session
  touch-device notice from "Best viewed on a computer" to a positive "Optimised
  for mobile" welcome (with tap-to-open / Back / pinch-zoom tips). Fixed two
  pre-existing bugs: `input[type="tel"]` missing from the base field rule (phone
  field was narrow) and `.oc-info` lacking `min-width:0` (long card titles pushed
  the value off-screen).

Verified end-to-end at 360/390px (Dashboard, Clients, Quotes, Orders, Stock,
Cabinet, Cut List, Schedule) with desktop regression at 1440px; `npm run
typecheck` + `npm run build` clean. **Detail in SPEC.md § 13.**

**Follow-up — header refinements ✅ 2026-05-23** (from on-device testing): per-tab
"+" create button in each content header (mobile-only, via `_renderContentHeader`);
Quote-Builder + Quote/Order drill-down back arrows; Cut-Layout back-to-editor bar;
removed the global "Back to list" bar (editors have their own header back arrows);
line-item cards reworked to a wrapping column grid; fixed order-schedule steppers
overflowing. Create fns hardened to always start fresh. Round 3: Schedule
"Orders/Calendar" sub-tabs (the calendar was unreachable on mobile); cut layouts
default to portrait on a phone; cut-layout header restyled to match the others.
Detail in SPEC.md § 13.

**Known follow-ups (not blocking):** cut-list `.cl-table` inline inputs still
sub-16px (iOS may zoom on focus) — a full mobile redesign of those dense tables
is deferred; the manual drag-reorder ("Sort: Manual") isn't wired in the mobile
agenda.

### Cabinet Builder reel — vertical + horizontal-split ✅ Done 2026-05-21

Two parallel productions of the same 30-second narrative (Hook → Open
Builder → Spec Scroll → Live Price → Save to Library → Close), shipped
silent so they autoplay on social. Full spec at
`marketing/specs/cabinet-builder-reel-spec.md`.

- ✅ **Vertical master** (`CabinetBuilderReel`, 1080×1920, 900 frames) —
  music-driven IG Reels / TikTok / Shorts cut. Output at
  `marketing/videos/cabinet-builder-reel.mp4`.
- ✅ **Horizontal split** (`h-hook`, `h-open-builder`, `h-spec-scroll`,
  `h-live-price`, `h-save-library`, `h-close`) — each scene rendered as
  its own 1920×1080 MP4 in `marketing/videos/reel/{01..06}-*.mp4` via
  `npm run render:reel-h`.
- ✅ **Narration-demo split** (`w-intro`, `w-rates`, `w-builder`, `w-spec`,
  `w-library`, `w-outro`) — the existing horizontal `CabinetWorkflow` demo
  also split into per-section files with narration audio baked in. Render
  via `npm run render:scenes` → `marketing/videos/scenes/{1..6}-*.mp4`.
- ✅ `remotion/vertical/` + `remotion/reel-h/` — parallel scene directories
  sharing the BRAND palette and reusable primitives (BrowserFrame/Screen/
  Cursor/Caption for horizontal, PhoneFrame/VerticalScreen/VerticalCursor/
  BigCaption for vertical; Counter shared)
- ✅ `remotion/Root.tsx` — registers all four productions (master + three
  split sets) plus 6 vertical per-scene debug comps for fast iteration
- ✅ Audio: silent v1 across the board. Drop a music track at
  `marketing/audio/reel-music.mp3` and flip `INCLUDE_AUDIO` in
  `vertical/constants.ts` to layer it under the vertical reel.

### Paid-ads tracking + first-touch attribution ✅ Done 2026-05-19

Paid-ads foundation laid before any spend. Three pixels plus a UTM-capture
layer that survives across the email-confirm gap, so signups carry permanent
ad-campaign attribution all the way through to revenue (via Stripe `client_reference_id`
later). Everything env-gated — with no IDs set, nothing loads, no requests fire.

- ✅ `src/main.js` — first-touch attribution: on landing, if `utm_*`/`gclid`/`fbclid`
  are in the URL, snapshot the params + referrer + landing path + timestamp into
  `localStorage.pc_attribution`. First-touch wins (industry-standard for SaaS:
  the campaign that first introduced the user gets credit, not the last click).
  `window._getAttribution()` returns the blob (`{}` for organic).
- ✅ `src/main.js` — GA4 + Google Ads via gtag.js (`VITE_GA4_ID`,
  `VITE_GOOGLE_ADS_ID`), Meta Pixel (`VITE_META_PIXEL_ID`). Each independently
  env-gated; no env, no network. Pixels fire PageView on load.
- ✅ `src/app.js` — `authSubmit()` signup branch pulls the attribution blob and
  passes it into `_sb.auth.signUp({ data: { …, attribution } })` so it lands in
  `auth.users.raw_user_meta_data` permanently. Queryable later via
  `select raw_user_meta_data->'attribution' from auth.users`.
- ✅ `src/app.js` — on successful signup, fires `_trackSignupConversion()` which
  pings Meta Pixel `CompleteRegistration`, GA4 `sign_up`, and Google Ads
  `conversion` (the latter needs `VITE_GOOGLE_ADS_CONVERSION_SEND_TO` — without
  it the GA4 event still fires but Google Ads can't attribute).
- ✅ `src/analytics.js` — `_trackSignupConversion()` added; `_identifyUser()`
  enriched to lift `user_metadata.attribution` into PostHog person properties as
  `initial_utm_source`/etc., so PostHog funnels break down by ad campaign.
- ✅ `.env.example` — documented `VITE_GA4_ID`, `VITE_GOOGLE_ADS_ID`,
  `VITE_GOOGLE_ADS_CONVERSION_SEND_TO`, `VITE_META_PIXEL_ID` with where to find
  each ID and what each enables.
- ✅ `src/globals.d.ts` — declared `window.gtag`/`fbq`/`dataLayer`/`_GADS_CONV`/
  `_getAttribution` plus the analytics function globals for strict TS.

**No migration** — `auth.users.raw_user_meta_data` is a JSONB column already, so
attribution lands there without DDL. A SQL view to flatten it can be added
later once we have campaigns to query.

**Detail in SPEC.md § 13.**

### Guided tour — desktop-only on mobile ✅ Done 2026-05-18

The guided spotlight tour is now skipped entirely on phones/tablets — adapting
it for mobile (the "mobile landscape support" entry below) proved more trouble
than it was worth. The mobile advisory notice already steers touch users to a
desktop, so the tour simply doesn't run there. Detail in SPEC.md § 13.

- ✅ `src/walkthrough.js` — `_wtStart()` early-returns when
  `window._pcIsTouchDevice()` is true, so the tour never runs on a touch
  device (auto-start or Help re-trigger). The standalone Pro CTA still works.
- ✅ Removed the now-dead mobile-tour scaffolding: the `_wtDrawRotatePrompt`
  rotate prompt, `_wtIsPortraitBlocked`, the `_wtRender` portrait branch, the
  `_wtOverlayClick` tap-to-navigate, the `orientationchange` listeners, and
  the device-aware welcome copy. The `.wt-center` modal scroll fix stays (the
  Pro CTA can still appear on a short viewport).
- ✅ `src/mobile-notice.js` — dropped the "rotate to landscape" line from the
  "Best viewed on a computer" notice.

### Landscape chrome auto-collapse on scroll ✅ Done 2026-05-18

On a short landscape phone the header + demo banner + nav-tab bar ate ~35% of
the viewport. The top header and demo banner now slide away when a content
pane is scrolled down and return on scroll up, handing ~90px back to the
content area. The nav-tab bar stays put so section navigation is always
available. Detail in SPEC.md § 13.

- ✅ `styles.css` — `header` + `#demo-banner` get a `max-height` / `padding` /
  `opacity` transition; `body.chrome-collapsed` collapses both to 0 and
  `.app-body` (flex:1) reclaims the space. The nav-tab bar is untouched.
- ✅ `src/ui.js` — `_initChromeCollapse()` registers one capture-phase scroll
  listener that toggles `body.chrome-collapsed` by scroll direction. Gated to
  short viewports (`max-height: 540px`) and suspended during the guided tour;
  tall/desktop viewports unaffected. (Re-gated from `(pointer: coarse)` + rAF
  dropped — see SPEC.md § 13 — so it is reliable and verifiable.)

### Guided walkthrough — mobile landscape support ✅ Done 2026-05-18 (superseded — tour is now desktop-only, see above)

The desktop spotlight tour broke on phones: the 336px tooltip had no room to
sit beside its target in portrait, and the centred welcome / pricing modals
overflowed a short viewport (`overflow:hidden`, no `max-height`), clipping the
pricing CTA's "Continue free" exit button off-screen (no arrow keys on touch →
the user could get stuck). Fix keeps the desktop visuals; on a phone the tour
runs in landscape only. Detail in SPEC.md § 13.

- ✅ **Landscape gate** — `src/walkthrough.js` adds `_wtIsPortraitBlocked()`
  (`(orientation:portrait) and (max-width:767px) and (pointer:coarse)`) and
  `_wtDrawRotatePrompt()`; `_wtRender` shows a "Rotate your device" prompt in
  portrait instead of a broken step (`_wtCurrent` preserved). Re-renders on the
  new `orientationchange` / existing `resize` listeners. The standalone session
  CTA is exempt.
- ✅ **Centred modals scroll** — `styles.css` `.wt-center` swaps
  `overflow:hidden` for `overflow:hidden auto` + `max-height:calc(100dvh-24px)`,
  so the welcome and pricing modals cap to the viewport and scroll instead of
  clipping their exit button off-screen.
- ✅ **Touch navigation** — `_wtOverlayClick` adds tap-to-step on coarse
  pointers: a tap on the right half of the dimmed backdrop advances, the left
  half goes back (phones have no arrow keys). Desktop is unaffected.
- ✅ **Device-aware copy** — the welcome step's keyboard hint is swapped for a
  tap-zone hint on touch devices.

### Mobile/tablet opening notice ✅ Done 2026-05-18

A one-time advisory shown to touch-device visitors on app load: the app is
desktop-first, so use a computer for the full experience; limited use is
possible in landscape. Informational and dismissible — not a hard block.

- ✅ New `src/mobile-notice.js` — `_pcIsTouchDevice()`
  (`(hover:none) and (pointer:coarse)` → phones + tablets) +
  `_pcMaybeShowMobileNotice()` (once-per-session `sessionStorage` gate, builds
  an inline-styled overlay modelled on `_confirm()`, z-index 10000).
- ✅ Hook `_pcMaybeShowMobileNotice()` into `_wtMaybeAutoStart()`
  (`src/walkthrough.js`) — notice layers above the guided tour, which still runs
  underneath and is revealed on dismiss.
- ✅ Register the script in `index.html`; declare the two globals in
  `src/globals.d.ts`. Detail in SPEC.md § 13.

### Landscape-usability fixes — pane scroll + touch resize ✅ Done 2026-05-18

A targeted pass to make the existing layout usable on a phone/tablet in
landscape, with no visual redesign (precursor to the full M.1 responsive pass).

- ✅ **Flex scroll chain fixed** — `styles.css` now sets `min-height:0` /
  `min-width:0` on the pane chain (`.app-body`, `.section-panel`, `.sidebar`,
  `.main-content`, the scroll containers, plus the inline-styled `#cab-*` /
  `#schedule-main` wrappers). Flex items default to `min-height:auto`, so on a
  short landscape viewport the inner `overflow:auto` panes expanded instead of
  scrolling and the bottom was clipped. Invisible when content fits. Verification
  also caught the Cabinet Builder empty-state picker (`#cb-context`) clipping
  outside any scroller — `#cb-sidebar-builder` switched to `overflow-y:auto` so
  the wrapper scrolls it. Follow-up: `100vh` → `100dvh` on the app shell +
  dropdown/popup height caps so they fit the visible viewport rather than
  sitting behind the mobile URL bar.
- ✅ **Resize handle works on touch** — dropped the `@media (max-width:768px)`
  rule that hid `.resize-handle`, added `touch-action:none` so a touch-drag
  resizes instead of panning, and widened the invisible `::after` hit area
  under `@media (pointer:coarse)`. The handler (`_initSidebarResize`,
  `src/ui.js`) already used pointer events; `pointermove` now also clamps the
  max width to `innerWidth − 140` so the sidebar can't hide the main viewer.

### Security + load review — performance, privacy & build fixes ✅ Done 2026-05-18

A security + load review surfaced 12 issues; five were actioned. The other
seven (XSS escaping, CSP / security headers, list pagination, DB-side row IDs,
server-side free-tier enforcement) are deferred. Plan:
`~/.claude/plans/do-1-2-5-only-mask-lovely-snail.md`.

- ✅ **#1 — N+1 line loading batched** — `_hydrateQuoteTotals` /
  `_hydrateOrderLines` (`src/quotes.js`) now issue one batched `.in()` query
  each instead of one fetch per quote/order on every boot. Dev-preview
  verified: a 4-order account makes one `order_lines` request (was four).
- ✅ **#2 — DB indexes + RLS InitPlan** — migration
  `20260518150000_perf_indexes_and_rls_initplan.sql` (applied via Supabase MCP)
  adds 10 missing FK covering indexes and rewrites all 61 RLS policies to
  `(select auth.uid())`. `get_advisors` `auth_rls_initplan` /
  `unindexed_foreign_keys` lints cleared. SCHEMA.md § 4 updated.
- ✅ **#5 — PostHog masks Business Info** — `src/main.js` masks the six `biz-*`
  fields (company name / phone / email / address / ABN / bank details) in
  session replays. Client data and pricing are not masked (user scope choice).
- ✅ **#10 — production code minified, source maps not published** —
  `vite.config.mjs` minifies the classic `src/*.js` (whitespace + syntax only,
  identifiers preserved for the global lexical env) and a new
  `stripSourceMapsPlugin` removes every `.map` from `dist/`.
- ⏳ **#6 — leaked-password protection** — *manual, pending*: enable in the
  Supabase dashboard → Authentication → password settings. No MCP/API tool
  exposes this; cannot be scripted.

`npm run typecheck` + `npm run build` clean; built app smoke-tested via
`npm run preview` (all tabs, zero console errors). Detail in SPEC.md § 13.

---

### Manage Subscription popup shows the live offer price + increase date ✅ Done 2026-05-18

The Manage Subscription popup hard-coded `$35/mo` / `$300/yr`
(`stripe.js` `_openManagePopupActive`), so subscribers on the launch coupon
($25/mo for the first 6 months, then $35/mo — applied via
`STRIPE_COUPON_MONTHLY_LAUNCH` in `stripe-checkout`) saw the standard price,
not what they actually pay. The discount lives only in Stripe — the
`subscriptions` table mirrors plan/status/period, never the coupon — so the
popup now reads it live (Option B: fetch-on-open, no DB migration, no cache to
go stale, accurate for existing subscribers immediately).

- ✅ **`stripe-subscription` edge function** — `supabase/functions/stripe-subscription/`
  authenticates the caller's Supabase JWT, looks up their
  `stripe_subscription_id`, retrieves the Stripe subscription with
  `expand: ['discounts']`, and returns
  `{ currency, interval, standardAmount, currentAmount, discountEnd }` (amounts
  in minor units; `currentAmount` = standard minus the active coupon). Mirrors
  the `stripe-portal` auth/CORS conventions; needs no new secrets.
- ✅ **Popup reads it live** — `_openManagePopupActive` opens with a "Loading…"
  price placeholder and fires `_fillManageSubscriptionPricing`, which calls the
  function and renders the discounted price plus an "Increases to $35/mo on
  &lt;date&gt;" line. Falls back to the static plan price when the lookup fails
  or there's no active discount. New helpers `_loadSubscriptionPricing` /
  `_fmtSubscriptionPrice`.
- ✅ **Deployed** — `stripe-subscription` is live on the Supabase project
  (version 1, `verify_jwt: true`, no new secrets, no DB migration); OPTIONS
  preflight (204 + CORS) and an unauthenticated POST (401) smoke-tested against
  the live URL. The popup reads real pricing once the frontend ships (push to
  `main`); until then it falls back to the static price.

No schema change. `npm run typecheck` clean; the client formatter, fallback,
and discount / no-discount rendering verified in the dev preview.

---

### New signups can opt into a marketing mailing list ✅ Done 2026-05-17

New users can tick an opt-in checkbox at signup; once they confirm their email
and land in the app, a server-side edge function adds them to a Resend
audience. Provider is Resend Audiences; consent is explicit opt-in (GDPR-safe);
the list write happens only after email confirmation.

- ✅ **Opt-in checkbox** — `index.html` adds `#auth-marketing` to the auth card
  (hidden in sign-in mode, shown in signup mode by `toggleAuthMode`, unchecked
  by default). `authSubmit` passes `data: { marketing_opt_in }` to
  `_sb.auth.signUp`, persisting the choice to `auth.users.user_metadata`.
- ✅ **Confirmed-user sync** — new `_syncMailingList(session)` in `src/auth.js`,
  called fire-and-forget from `onAuthStateChange`. Invokes the `list-subscribe`
  edge function once per user per device (a `pc_mailing_synced_<id>`
  localStorage flag suppresses repeats) when the user opted in and their email
  is confirmed. Skips demo mode.
- ✅ **`list-subscribe` edge function** — `supabase/functions/list-subscribe/`
  authenticates the caller's Supabase JWT, re-checks opt-in + confirmation
  server-side, then POSTs the user to the Resend audience. Holds the Resend
  API key; treats an already-subscribed contact as success. Mirrors the
  `stripe-portal` function's auth conventions.
- ✅ **Deployed + verified** — `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` set as
  Supabase secrets; `list-subscribe` deployed to the live project. CORS
  `allow-headers` widened past `stripe-portal`'s set to cover the `apikey` /
  `x-client-info` headers `supabase-js` `functions.invoke` sends. An
  authenticated invoke from a non-opted-in user correctly returns
  `{ ok: false, skipped: 'no marketing opt-in' }`.

No schema migration (opt-in + synced state live in `user_metadata` /
localStorage). `npm run typecheck` clean; checkbox + function verified in the
dev preview. The opt-in checkbox reaches users on the next push of `main`
(Cloudflare frontend deploy).

### Returning free users see the Pro CTA once per browser session ✅ Done 2026-05-17

A signed-in free user who has already completed the first-run guided tour now
gets just the final Pro CTA — not the whole tour — once per browser session.
The full tour stays first-login-only.

- ✅ **Standalone CTA path** — new `_wtStartCta()` (`src/walkthrough.js`) opens
  the overlay directly on the final `showPricing` step. A new `_wtCtaOnly`
  module flag marks the mode: `_wtApplyContext` skips the tab switch + sidebar
  gating, `_wtClose` skips the dismissal persistence and the "land on
  Dashboard" `switchSection`, and `_wtNext`/`_wtBack` collapse to single-step
  so Back / ← can't escape into the middle of the tour. Unlike `_wtRunStart`
  it never borrows demo mode — the CTA is a centred modal over the user's own
  live data.
- ✅ **Once-per-session gate** — new `_wtMaybeShowSessionCta()` shows the CTA
  unless the user is Pro or `sessionStorage['pc_wt_session_cta']` is already
  set. `_wtMaybeAutoStart`'s "already onboarded at the current version" branch
  calls it instead of no-opping. A completed full tour also sets the flag, so
  the CTA never doubles up on a same-session reload; the flag clears when the
  browser session ends, so it returns next session.
- ✅ **"Upgrade to Pro" opens the CTA** — the account-dropdown subscription
  block (`renderSubscriptionSection`, `src/stripe.js`) now calls `_wtStartCta()`
  instead of jumping straight to annual checkout, and the two price caption
  links below the button ($15 / $25) are removed — the CTA's own tier buttons
  drive plan choice. `_wtStartCta` added to the walkthrough's public surface.

First-run tour, the `WT_VERSION` re-show and the logged-out-demo every-reload
replay are unchanged. No schema migration. `npm run typecheck` clean; verified
in the dev preview.

### Free-plan import/export lock + tour-skip CTA + demo tour-on-reload ✅ Done 2026-05-17

Plan: `~/.claude/plans/remove-all-import-replicated-quokka.md`.

Three monetisation / funnel changes.

- ✅ **Import/export is Pro-only** — new `_enforceProFeature()` in `src/limits.js`
  (passes for the logged-out demo and Pro users; blocks signed-in free users)
  guards all 10 CSV import/export entry points (`export/importClientsCSV`,
  `export/importQuotesCSV`, `export/importOrdersCSV`, `export/importStockCSV`,
  `cbExportLibrary`/`cbImportLibrary`). A blocked click opens
  `_openProFeatureModal()` (`src/stripe.js`) — a lock-icon popup with the upgrade
  CTAs. PDF generation (quote / cut-list / stock) stays free — scope is CSV data
  import/export only.
- ✅ **Skip shows the CTA** — new `_wtSkip()` (`src/walkthrough.js`): a free or
  demo user who skips the tour jumps to its existing final Pro CTA step instead
  of closing; a Pro user still exits immediately. Both skip call sites (overlay
  click + Escape) reroute through it.
- ✅ **Demo replays the tour every reload** — `_wtMaybeAutoStart()` bypasses the
  `pc_wt_state` dismissal gate when `!_userId`, so a logged-out visitor gets the
  full tour + CTA on every page load. Signed-in users keep the once-only gate.

No schema migration. `npm run typecheck` clean; verified in the dev preview.

### Features menu — suggest-by-email + upvotable leaderboard ✅ Done 2026-05-17

Plan: `~/.claude/plans/add-a-new-features-vectorized-breeze.md`.

A new Features button in the top toolbar (left of Help) opens a popup with a
"Suggest a feature" button and an upvotable leaderboard of owner-curated
feature ideas. "Make a Suggestion" was removed from the Help dropdown.

- ✅ **Migration** — `20260517120000_feature_suggestions.sql` applied via
  Supabase MCP: `feature_suggestions` (shared/global, no `user_id`, select-only
  RLS — owner curates rows in the Supabase dashboard) + `feature_suggestion_votes`
  (Pattern A, one row per user per upvote) + a `SECURITY DEFINER` trigger that
  maintains `feature_suggestions.vote_count`. `EXECUTE` on the function revoked
  from `public`/`anon`/`authenticated` (advisor fix). `database.types.ts`
  regenerated; `get_advisors` clean bar the pre-existing leaked-password warning.
- ✅ **`src/features.js`** (new) — `_openFeaturesBoard()` popup; optimistic
  `_featureToggleVote()`; status badges (planned / in_progress / shipped).
  Signed-out / demo visitors get a sign-in prompt and no DB calls.
- ✅ **Suggest relocated** — `_openSuggestion` (mailto:) moved from `src/help.js`
  to `src/features.js`; the Help dropdown drops to three items. `_helpContext` /
  `_mailtoHref` / `SUPPORT_EMAIL` stay in `help.js`, shared across both.
- ✅ **`index.html` / `styles.css`** — `.features-btn` in the header, `.feat-*`
  leaderboard styles, `src/features.js` script tag.

`npm run typecheck` clean. SCHEMA.md § 3.19–3.20 added.

### Read-only demo mode (no-login experience) + walkthrough rebuild ✅ Done 2026-05-16

Plan: `~/.claude/plans/the-walkthrough-is-still-composed-floyd.md`.

A logged-out visitor's first experience is now a fully-explorable, pre-seeded
demo; saving anything prompts sign-in. The guided walkthrough was hardened.

- ✅ **Demo data layer** — new `src/demo.js`: a static seed dataset (5 clients /
  quotes / orders / cutlists / cabinet templates, 10 stock items) + `_demoSelect`
  (resolves a `_DBBuilder` against the seed) + `_demoBlockWrite`. `src/db.js`'s
  `_DBBuilder.then()` branches on `window._demoMode` — reads come from the seed,
  writes are blocked.
- ✅ **Guest boot** — `onAuthStateChange`'s no-session branch sets `_demoMode=true`
  and runs the full `loadAllData` path so every panel renders populated. Waits
  for `DOMContentLoaded` first (fixes a boot race against late-loading globals).
- ✅ **Cabinet un-gated** — `_renderCBAuthGate` + the `if(!_userId)` read-loaders
  honour `_demoMode`. Supersedes Item-2 locked decision #2 (see below).
- ✅ **Write gate** — explicit save/create actions route through `_requireAuth()`
  (sign-in modal); a `_db()`-level block backstops anything missed.
- ✅ **Demo banner** — slim "exploring a live demo — sign in to save" bar,
  toggled by auth state.
- ✅ **Optimizer paywall removed** — the `#paywall-modal` / `pcOptCount` gate is
  gone; the 5-item library cap is the only free-tier limit.
- ✅ **Walkthrough hardened** (`src/walkthrough.js`) — DB seeder deleted; the tour
  always runs over the demo seed (a signed-in user's run flips `_demoMode` on
  temporarily). Target resolution rebuilt as one `requestAnimationFrame` waiter
  with pre-flight skip of unreachable steps; dismissal persists to
  `localStorage['pc_wt_state']`; guests get the tour on first visit.

No schema migration. `npm run typecheck` clean.

### Business Details popup + logos on PDFs + bank details + Pro/free branding ✅ Done 2026-05-14

Plan: `~/.claude/plans/i-want-the-business-rustling-aurora.md`.

- ✅ **Mockup** — `mockups/pdf/pdf-branding-options.html` shows the three branding intensities side-by-side (free vs Pro pairs). Variant 2 (footer band) chosen as default.
- ✅ **Migration** — `ALTER TABLE business_info ADD COLUMN IF NOT EXISTS bank_details text;` applied via Supabase MCP `apply_migration` on 2026-05-14 (migration name `add_bank_details_to_business_info`). `src/database.types.ts` regenerated; `business_info.bank_details: string | null` now visible in the generated Row/Insert/Update types. `get_advisors` clean (only pre-existing leaked-password-protection warning, unrelated).
- ✅ **Popup** — `_openBusinessDetailsPopup` in `src/business.js` replaces the inline form at `index.html:141-153`. Logo upload + name + address + phone/email row + ABN + bank-details textarea.
- ✅ **Logo on every PDF** — new `_drawBizHeader` helper at top of `src/cutlist.js` wires logo + reordered caption (name → address → phone → email) into all 5 PDF builders. Logo replaces the big bold business-name when present.
- ✅ **Bank details on quote + order PDFs** — `_buildOrderDocPDF` placeholder replaced with `biz.bank_details`; `_buildQuotePDF` gains a new PAYMENT DETAILS block between Validity and Acceptance.
- ✅ **Conditional ProCabinet branding** — `_drawPdfFooter` gates branding on `!isPro()`. Pro users get a clean footer; free users get the accent footer band. Variant flip lives in the `_PROCAB_FOOTER_VARIANT` module constant.
- ✅ **Boot hydration** — `_applyBizInfoFromDB` (`src/app.js`) extended to mirror `bank_details` into `pc_biz` localStorage so `getBizInfo()` returns it on subsequent reads.

### Remove Projects entity · adopt library-first / Cabinet-IS-Quote ✅ Done 2026-05-13

Foundational refactor toward the new architecture designed across
`mockups/architecture/option-d-flat-files-flow.html` (flat files, no project hub),
`mockups/architecture/option-e-cabinet-is-quote-flow.html` (Cabinet view = a view of Quote
with `status='designing'`), and `mockups/architecture/top-level-architecture-flow.html`
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

### Quote / Order / Invoice number-format unification ✅ Done 2026-05-12

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

**Closed out (status reconciled 2026-06-11):** migration `renumber_prefixes`
applied via Supabase MCP (no-op rewrite — data was already in target format);
the new prefixes have been live in production for a month — cards, dashboards,
PDFs, and the 2026-06-09 webhook order-number parity fix all run on
`QUO-`/`ORD-` numbering.

---

### Orders / Quotes editor — mockup-J port ✅ Done 2026-05-11

Second-pass redesign on top of the 2026-05-10 mockup-B work. Implements the user's refined J mockup (`mockups/orders/orders-redesign-J-column-toggles.html` + `mockups/quotes/quotes-redesign-J-column-toggles.html`) — new `.ed-head` header (back arrow + tab icon + editable order# prefix + project name + clickable status badge), column-toggle pills (Discount/Hours/Stock), split `+ Cabinet` / `+ Item` add buttons, stock smart-library + per-order `stock_markup` input, divider above Pricing, footer buttons dropped. Stock is a 3rd `line_kind` with the same per-line math as items; its materials get re-priced via `stock_markup` at totals time.

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

**Closed out (status reconciled 2026-06-11):** migration `stock_kind_and_markup`
applied + `database.types.ts` regenerated (2026-05-11); SPEC.md § 13 entry
exists (2026-05-11). The editor has since been reworked on top of this pass
repeatedly (live-link sidebar tab 2026-06-06, pricing-consistency fixes
2026-06-09, status-wipe fix 2026-06-10) — the formal browser-smoke step is moot.

---

### Orders / Quotes editor cleanup pass (mockup B) ✅ Done 2026-05-10

Four-point UI cleanup on the order + quote editor sidebars, ported from the user's `mockups/orders/orders-redesign-B-zebra-cutlist.html` mockup. Plan at `~/.claude/plans/clean-up-orders-dapper-yao.md`. **Superseded by the 2026-05-11 mockup-J port above** — that pass replaced the line-items table renderer, dropped the order-level Markup chip, and added column-toggle pills + stock kind / library / per-order stock_markup. The B-mockup migration (`20260510233952_add_discount_columns.sql`) was applied alongside the J migration this session.

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

### Orders / Quotes sidebar redesign ✅ Done 2026-05-09

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

**Closed out (status reconciled 2026-06-11):** `orders.hours_allocated` is live
in the production schema (verified via `information_schema`), so the override
feature is active; `database.types.ts` includes it. The sidebar itself was
superseded twice within days (mockup-B 2026-05-10, mockup-J 2026-05-11) and
again by the June live-link tab work. SPEC.md § 13 entry exists (2026-05-09).

### Cut List multi-cutlist + 3-tab refactor ✅ Done 2026-05-09

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

**Closed out (status reconciled 2026-06-11):** the `cutlists` schema is live in
production (30 rows at the 2026-06-11 check) and later migrations built on it
(`cutlists.cabinet_id` FK retarget + `cutlist_cabinets` M:N join 2026-05-12;
`cutlists.quote_id` in F4 2026-05-13). SPEC.md § 13 entry exists (2026-05-09).
The 3-tab main view was later reshaped: F5 dropped the Project Cut Lists tab
(3 → 2 tabs) and the 2026-05-10 library-pattern refresh reworked the rest.

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
2. ~~Cabinet Builder requires sign-in (no guest mode)~~ — **superseded 2026-05-16**:
   read-only demo mode lets logged-out visitors use the Cabinet Builder (and the
   whole app) over a pre-seeded dataset; saving prompts sign-in. See the
   "Read-only demo mode" entry under Active Work.
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

- **S.1 — Stripe account setup** ✅ Done *(UK account active; live keys in production use since the S.9 flip)*
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

- **S.9 — Live-mode flip** ✅ Done (~2026-06-09/10; verified 2026-06-11)
  - Verified via `supabase secrets list` digests: `STRIPE_SECRET_KEY` is the
    same key as the verified-live `STRIPE_CONNECT_SECRET_KEY` (Connect go-live
    2026-06-10); `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL` no longer
    match the S.2 test Price IDs (sha256 comparison) and a `STRIPE_PRICE_FOUNDER`
    secret exists; `STRIPE_WEBHOOK_SECRET` is distinct from the Connect
    webhook secret (separate endpoints, as designed). Launch coupons set
    (`STRIPE_COUPON_MONTHLY_LAUNCH` / `_ANNUAL_LAUNCH`).
  - ⬜ Residual: confirm `VITE_STRIPE_PUBLISHABLE_KEY` in Cloudflare Pages is
    the `pk_live_…` key (client-side; the redirect Checkout flow doesn't use
    it, so low stakes); run one real live Checkout (S.8 / P.5); decide on the
    3 test-mode `subscriptions` rows (G.5).

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

- ✅ **O.1 — Dashboard intro section** — shipped as the Getting Started card:
  aha-path steps (set rates → add stock → build a cabinet → first quote) with
  deep links + live progress ticks; shows until the first quote exists
  (F.4 rewrite 2026-06-09, progress ticks 2026-06-07).

- ✅ **O.2 — Step-by-step walkthrough popup**
  - Multi-step overlay walkthrough (like software update tours)
  - Shows every login until user explicitly dismisses
  - Re-trigger option in Settings or Help ("Take the tour")
  - Re-shows automatically when new features are added (version-gated)
  - Final step: CTA clearly showing free-tier limits vs Pro (unlimited)
  - Track walkthrough version + dismissed state in `business_info` jsonb
    or dedicated `onboarding_state` column

- ✅ **O.3 — Transactional email** — live end-to-end since 2026-05-17: branded templates + Resend SMTP custom sender. SPEC.md § 13 has the detail.
  - ✅ Four branded HTML auth-email templates in `supabase/templates/` (`confirmation`, `recovery`, `magic-link`, `email-change`) — dark `#111111` header with the `logo-colour-on-dark` wordmark, amber CTA, British-English trade voice
  - ✅ Logo hosting — `vite.config.mjs` `copyEmailLogoPlugin` ships `brand/logo/logo-colour-on-dark.png` into `dist/` → served at `https://procabinet.app/logo-colour-on-dark.png`
  - ✅ `signUp` passes `emailRedirectTo: window.location.origin` (`src/app.js`)
  - ✅ Resend account + `procabinet.app` domain verified (API key lives in `supabase/.env`)
  - ✅ Supabase custom SMTP live — sender `noreply@procabinet.app`; `smtp_max_frequency` 60 s; `mailer_otp_exp` raised 1 h → 24 h (2026-06-11)
  - ✅ Templates + subjects live in Supabase Auth — branded emails confirmed arriving
  - ✅ Deliverability proven via Resend delivery logs during the 2026-06-11 signup diagnosis (4/4 delivered to a real customer; one user's spam placement suspected → spam hint added to the confirm panel)

### Production Ops

- **P.1 — Production Supabase env separate from dev** *(overtaken by events —
  the app launched on the single project `mhzneruvlfmhnsohfrdo`, which IS
  production. Revisit only if a separate staging env becomes worth the
  overhead; H.1 — deriving the hardcoded project ref — is the prerequisite.)*

- **P.2 — Automated DB backups**
  - Verify backup schedule on the Supabase plan
  - Document restore procedure in a new `Building Docs/ops-runbook.md`

- **P.3 — Error logging (Sentry)** — ✅ live: code wired 2026-05-15, account active with prod triage in routine use; ⬜ alert rules still to configure
  - ✅ Sentry account live — real prod issues triaged from it (JAVASCRIPT-2/-5/-6 debug sweep 2026-06-10; JWT-expiry / upsert-race / Outlook-noise triage 2026-06-11)
  - ✅ Install `@sentry/browser` + `@sentry/vite-plugin`
  - ✅ Wire client-side error capture in `src/main.js` (init early, before app code) — DSN-gated `Sentry.init`, exposed as `window.Sentry`; user context (id + email) set in the `src/app.js` auth listener
  - ✅ Configure source-map upload via `@sentry/vite-plugin` in `vite.config.mjs`; build-env scaffold (commented) in `.github/workflows/deploy.yml`, `SENTRY_AUTH_TOKEN` to be added as a GitHub Actions secret
  - ✅ Disable Replay/Profiling integrations to keep bundle ~30 KB gz — error-only init, no extra integrations added
  - ⬜ Set up email alerts for new issues + error-rate spikes
  - ⬜ Re-evaluate at ~500 users: stay on Team ($26/mo) or migrate to Better Stack

- **P.4 — Cross-browser smoke test**
  - Chrome, Safari, Firefox, Edge — desktop
  - iOS Safari, Android Chrome — mobile
  - Run after Stripe + free-tier limits land
  - Document rough edges in `docs/SMOKE_TESTS.md`

- **P.5 — End-to-end signup → upgrade → cancel test**
  - Run after S.8 in production environment
  - Document in `docs/SMOKE_TESTS.md`

### Pre-Launch Content

- **C.1 — Landing page placement** ✅ *(resolved, then superseded 2026-05-19/23:
  a dedicated `landing.html` now serves at `/` and the app moved to `/os`.
  The original "app stays at root" call was reversed when paid ads needed a
  real marketing surface; the logged-out guest demo was later removed
  entirely on 2026-06-07.)*

- ✅ **C.2 — Landing page build** — shipped as `landing.html` and iterated
  continuously: hero (+ live founders-seats line), features, 4-tier pricing
  cards, FAQ + FAQPage JSON-LD, founder counter, full ads/analytics tracking.
  Waitlist email capture superseded by direct signup + the marketing opt-in
  (`list-subscribe`).

- 🚧 **C.3 — Demo video** — ✅ ~65 s founder product demo produced in Remotion
  (`demo-video/`, VO + music), superseding the screen-record plan;
  ⬜ embed on the landing page (same gap as the funnel backlog's
  "pre-signup product proof" item).

- ✅ **C.4 — SEO blog posts** (2026-07-03 — expanded into the full SEO/AEO build; see SPEC.md § 13)
  - ✅ Hosting decided: `/blog` on procabinet.app — markdown in `content/blog/` → static HTML at build time (`scripts/blog.mjs` + `blogPlugin` in vite.config.mjs)
  - ✅ FIVE launch posts (the 3 planned + 2): best cut list software · how to price cabinet jobs · reduce plywood waste · how I stopped underpricing my work · software vs spreadsheets
  - ✅ Technical SEO/AEO alongside: robots.txt, generated sitemap.xml, llms.txt, 404.html (kills the soft-404 fallback), canonicals + absolute OG everywhere, Organization/WebSite/SoftwareApplication JSON-LD, noindex on `/os` + `/q`
  - ⬜ Manual dashboard steps remain (Cloudflare AI-crawler unblock + managed-robots.txt off, GSC, Bing) — ordered checklist in `docs/SEO.md`

- **C.5 — Analytics + Search Console (PostHog + Cloudflare Web Analytics)**
  - ✅ PostHog Cloud account live — events, session replays, and funnel reviews in routine prod use (2026-06-10 growth review; 2026-06-11 walkthrough diagnosis via replay + autocapture)
  - ✅ Wire PostHog into the app — npm `posthog-js` via the `src/main.js` bridge,
    key-gated so a dev `.env.local` without `VITE_POSTHOG_KEY` never pollutes prod
    data. See SPEC.md § 13 (2026-05-15).
  - ✅ Wire key events: signup, login, `library_item_created` (any client / quote /
    order / cut list / stock item / cabinet template), `pdf_created` (any PDF type),
    `free_tier_limit_hit`, `upgrade_clicked`, `section_viewed`. Generic events carry
    `library` / `type` / `source` properties so funnels stay flexible.
  - ✅ Build core funnels in PostHog — acquisition funnel "Landing → App → Signup → Pro" saved + pinned to dashboard 683581 (insight `e1bs6UMd`, 2026-05-31); added `pro_subscription_started` (`src/stripe.js`, on Stripe-success return) so it ends on a real paid conversion, not `upgrade_clicked` intent. See SPEC.md § 13 (2026-05-31). ⬜ remaining: activation funnel (signup → library item created → PDF created); localhost test-account filter (manual — MCP can't write it).
  - ⬜ Enable Cloudflare Web Analytics for marketing-site numbers (free, auto on Pages)
  - ⬜ Verify Google Search Console + submit sitemap (sitemap now generated at build — step-by-step in `docs/SEO.md`)

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

### Launch Week (5–14 May 2026) — *window passed; kept as a future checklist*

> Launch went soft on 2026-05-02 with no public-posts push; the growth motion
> moved to paid ads + the founders offer (see "Growth" under Active Work).
> L.1–L.4 remain usable for a deliberate public-launch moment later.

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

> ✅ Substantially delivered by the 2026-05-23 mobile-native pass (7 phases:
> single-column drill-in, touch sizing, header/nav, line-item cards, canvas
> pinch-zoom, schedule agenda, notice reframe) plus the 2026-05-18 landscape
> work — see Active Work / SPEC.md § 13. Per-item state below.

- ✅ **M.1 — Per-module responsive layout pass** — done 2026-05-23 across all
  8 modules (Cabinet Builder via sidebar drill-in; Cut List canvas got
  pinch-zoom/pan; Schedule got the stacked agenda). Known residue: dense
  `.cl-table` inline inputs are still sub-16px (iOS may focus-zoom) — full
  redesign of those tables deferred.

- ✅ **M.2 — Mobile navigation** — resolved as icon nav-tabs + list⇄editor
  drill-in with per-editor back arrows (no bottom bar / drawer needed);
  ≥44px touch targets shipped in the touch-sizing phase.

- ✅ **M.3 — Popups, tables, filter bars on narrow screens** — line-item
  tables collapse to one card per line (phase 4); filter bars unified on the
  Cabinet Library pattern (2026-05-23); popups cap to `calc(100vw - 32px)`
  with 480px adjustments. (Sticky-first-column scroll wasn't needed once
  tables collapsed to cards.)

- **M.4 — PWA manifest + home-screen icon**
  - Generate icon set (192, 512, maskable)
  - `manifest.webmanifest` with app metadata
  - Service worker for offline shell *(optional)*

- ✅ **M.5 — Device testing** — three rounds of on-device feedback drove the
  2026-05-23 refinement batches; verified at 360/390px with 1440px desktop
  regression. (Note for analytics: iPadOS requests desktop sites, so iPads
  report as "Desktop Mac" — discovered 2026-06-11.)

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

- ✅ **U.4 — Polish printable outputs** — logos/branding + bank details on all
  PDFs (2026-05-14), then a spacing/layout cleanup across all 5 jsPDF builders
  with an offline QA harness (`scripts/render-pdf-samples.mjs`, 2026-05-24).

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
    other tabs unify when we redo them. (Mockups in `mockups/library/layouts/option-d1-*`.)
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
  tabs. Mockup approved: `mockups/library/row-interactions/option-3-row-action-strip.html`.
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
  `src/db.js:68` hardcodes `sb-mhzneruvlfmhnsohfrdo-auth-token`, and the
  2026-06-11 early-boot fetch (`src/main.js`) reads the same key — both
  sites need covering. Derive it from `window._SBURL` (parse the project
  ref out of the host) so the codebase isn't tied to one Supabase project.
  Only matters if a second Supabase project ever exists (P.1, currently OBE).

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

- ✅ **R.1 — Split `src/cabinet.js`** — done: `cabinet-calc.js`,
  `cabinet-render.js`, `cabinet-library.js` (+ `cabinet-library-sidebar.js`)
  all exist as separate carved files (in place by the 2026-05-07 UX/pricing
  batch). `cabinet.js` itself is 1,825 lines (2026-06-11) — still above the
  1,500 target; residual accepted.

- ✅ **R.2 — Split `src/cutlist.js`** — done 2026-07-03 (part of the R.6
  file-size completion pass below). `cutlist.js` 5,233 → **923**, carved into:
  - ✅ `src/cutlist-pdf.js` (~1,285) — print/PDF pipeline + the 5 document builders
  - ✅ `src/cutlist-layout.js` (~1,405) — guillotine + nested packers, canvas drawing
  - ✅ `src/cutlist-edge.js` (~490) — edge-band UI + column visibility
  - ✅ `src/cutlist-render.js` (~1,190) — sheet/piece table CRUD, keyboard nav, CSV, library view
  - Residual keeps module state, state machine, DXF export, CRUD orchestration.
  - Typecheck + build + smoke green after each carve.

- ✅ **R.6 — File-size completion pass** — done 2026-07-03. Brought every source
  file over the SPEC § 7 <1,500-line target back under it (except `cabinet.js`,
  residual accepted in R.1). 12 mechanical carve commits, each bisectable:
  R.2 above (cutlist ×4); `app.js` 2,274 → **348** (line editors → `src/line-editor.js`;
  auth → `auth.js`; realtime → `livelink.js`; `_applyBizInfoFromDB` → `business.js`;
  pipeline hover + `trunc` → `ui.js`; pending-plan → `stripe.js`; dead `hexRgba` dropped);
  `quotes.js` 1,939 → **787** (sidebar editor → `src/quote-editor.js`); `stock.js`
  1,554 → **1,399** (persistence maps → `src/stock-persist.js`) + R.4 below. Detail: SPEC.md § 13 (2026-07-03).

- ✅ **R.3 — Cut-list shadow-name unification** — done 2026-07-03. The "~30
  sites" estimate was stale: dimension consumers had already migrated to the
  `_mm`/`_m` columns via `_svGet`/`_svSet`; the short-name shadow
  (`thickness`/`width`/`length`) was a redundant parallel copy. Removed both
  hydration maps (`app.js loadAllData` + the demo-overlay twin), the shadow
  intersection type in `stock.js`, and every shadow read/write (edit-populate,
  stock-list display, cabinet-library edge picker, seed/duplicate/add/save
  paths). Dropping the type made any missed read a typecheck error (none
  surfaced); edge-band dims verified end-to-end in a headless browser. `thick`
  was already dead. Detail: SPEC.md § 13 (2026-07-03).

- ✅ **R.4 — Relocate stragglers to conceptual homes** — done 2026-07-03
  - ✅ `clients` array declaration → `clients.js` (was `stock.js:279`; moved with
    header/TDZ audit — see SPEC.md § 13)
  - ~~`projects` array~~ / ~~`_clProjectCache`~~ — moot: removed with the
    Projects entity (F5/F6, 2026-05-13); `projects` stays in `stock.js` (legacy)

- ✅ **R.5 — Retire the deprecated `catalog_items` table** — done 2026-06-24
  - **Context.** `stock_items` is the single source of truth for
    material/hardware/finish prices. The client-side catalog code was deleted
    2026-06-24 (commit `efe651a`: `_applyCatalogFromDB` / `_syncCatalogToDB` /
    `_catalogSyncTimer` + the early-boot prefetch in `app.js`/`main.js`). The
    **table itself can't be dropped yet** — the public live-link edge functions
    still fall back to it.
  - **Blocker — the edge-fn fallback.** `quote-public-get` (`index.ts:115,129`)
    and `quote-public-update` (`index.ts:103`) read `catalog_items` when a quote
    has no `rate_card` snapshot. `rate_card` is only written on share /
    live-link enable (`livelink.js:107`, `share.js:233`), so **pre-`rate_card`
    quotes** (and any never re-shared since the column landed) rely on the
    fallback for the customer spec-editor dropdowns + auto-pricing.
  - **✅ Audit done (2026-06-24) — blocker is moot, no backfill needed.** Prod
    counts: `catalog_items` has **0 rows** across **0 makers**; of 38 quotes, 14
    are shared and 12 of those have no `rate_card`. But since the table is empty,
    the edge-fn fallback already returns nothing every time — it's a no-op.
    Customer dropdowns for those 12 quotes already come from customer-visible
    stock, not `catalog_items`. So no `rate_card` backfill is required; the
    remaining work is pure dead-code/table removal.
  - **Done (2026-06-24).** Removed the `catalog_items` fallback branches from
    both edge functions and redeployed (`quote-public-get` v31, `quote-public-update`
    v27, both `--no-verify-jwt`); smoke-tested (bogus token → clean 404, no 500).
    Removed `_migrateCatalog` + its orchestrator entry from `migrate.js` and the
    `catalog_items: []` demo seed from `demo.js`. Re-confirmed 0 rows / 0 FKs /
    0 dependent views, then dropped the table (migration
    `20260624130000_drop_deprecated_catalog_items.sql`) and regenerated
    `database.types.ts`. `npm run typecheck` + `npm run build` clean.

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
| Smoke test list | **Written as `docs/SMOKE_TESTS.md`.** Referenced from P.4 / P.5. |

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
| Frontend | Vite + plain HTML/CSS/JS (no framework) — 42 source files split by domain | ✅ Done |
| Type-checking | TypeScript strict mode via JSDoc + `checkJs:true` | ✅ Done |
| Auth + Database | Supabase (Postgres + RLS, project `mhzneruvlfmhnsohfrdo`) | ✅ Done |
| Hosting | Cloudflare Pages — auto-deploy via GitHub Actions on push to `main` (~40s build) | ✅ Done |
| Domain | procabinet.app (DNS via Cloudflare nameservers; Bot Fight + leaked-creds mitigation on) | ✅ Done |
| Storage | Supabase Storage (`business-assets` bucket for logos) | ✅ Done |
| Payments | Stripe — subscriptions + Connect customer payments | ✅ LIVE — subscriptions live-keyed (S.9, verified 2026-06-11); Connect customer payments live 2026-06-10 |
| Email | Resend SMTP via Supabase Auth (`noreply@procabinet.app`) + branded templates | ✅ Live since 2026-05-17 |
| Analytics | PostHog (app + landing) + Cloudflare Web Analytics (marketing) | ✅ PostHog live (replays + funnel reviews in use); ⬜ Cloudflare WA + Search Console pending |
| Error logging | Sentry (free Developer plan) | ✅ Live — prod issues triaged 2026-06-10/11; ⬜ alert rules |

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
