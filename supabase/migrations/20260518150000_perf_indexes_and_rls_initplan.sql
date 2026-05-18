-- Performance: FK covering indexes + RLS initplan optimisation.
--
-- From the 2026-05-18 load review (items H + I):
--   H — 10 foreign-key columns lacked a covering index. Every RLS policy
--       filters by user_id, so an unindexed user_id forced a sequential scan
--       on every read; orders/quotes also FK client_id.
--   I — 61 RLS policies re-evaluated auth.uid() per row. Wrapping it in a
--       scalar subquery — (select auth.uid()) — lets Postgres evaluate it
--       once per query (the InitPlan) instead of once per row.
--
-- Both are pure performance changes: indexes are additive; the policy
-- rewrites are semantically identical (exactly the same rows allowed) — only
-- the query plan improves. No data change, no destructive change.
-- Applied 2026-05-18 via Supabase MCP.

-- ── Part A — 10 missing FK covering indexes ──────────────────────────────
create index if not exists cabinet_hardware_user_id_idx on public.cabinet_hardware(user_id);
create index if not exists clients_user_id_idx          on public.clients(user_id);
create index if not exists edge_bands_user_id_idx       on public.edge_bands(user_id);
create index if not exists order_lines_user_id_idx      on public.order_lines(user_id);
create index if not exists orders_client_id_idx         on public.orders(client_id);
create index if not exists pieces_user_id_idx           on public.pieces(user_id);
create index if not exists quote_lines_user_id_idx      on public.quote_lines(user_id);
create index if not exists quotes_client_id_idx         on public.quotes(client_id);
create index if not exists quotes_user_id_idx           on public.quotes(user_id);
create index if not exists sheets_user_id_idx           on public.sheets(user_id);

-- ── Part B — RLS InitPlan: auth.uid() -> (select auth.uid()) ─────────────
-- Every policy below is rewritten so auth.uid() is evaluated once per query.
-- feature_suggestions_select (qual: `true`) has no auth.uid() and is untouched.

-- business_info
alter policy "owner can delete business_info" on public.business_info using (user_id = (select auth.uid()));
alter policy "owner can insert business_info" on public.business_info with check (user_id = (select auth.uid()));
alter policy "owner can read business_info"   on public.business_info using (user_id = (select auth.uid()));
alter policy "owner can update business_info" on public.business_info using (user_id = (select auth.uid()));

-- cabinet_hardware
alter policy "owner can delete cabinet_hardware" on public.cabinet_hardware using (user_id = (select auth.uid()));
alter policy "owner can insert cabinet_hardware" on public.cabinet_hardware with check (user_id = (select auth.uid()));
alter policy "owner can read cabinet_hardware"   on public.cabinet_hardware using (user_id = (select auth.uid()));
alter policy "owner can update cabinet_hardware" on public.cabinet_hardware using (user_id = (select auth.uid()));

-- cabinet_templates
alter policy "owner can delete cabinet_templates" on public.cabinet_templates using (user_id = (select auth.uid()));
alter policy "owner can insert cabinet_templates" on public.cabinet_templates with check (user_id = (select auth.uid()));
alter policy "owner can read cabinet_templates"   on public.cabinet_templates using (user_id = (select auth.uid()));
alter policy "owner can update cabinet_templates" on public.cabinet_templates using (user_id = (select auth.uid()));

-- cabinets
alter policy "owner can delete cabinets" on public.cabinets using (user_id = (select auth.uid()));
alter policy "owner can insert cabinets" on public.cabinets with check (user_id = (select auth.uid()));
alter policy "owner can read cabinets"   on public.cabinets using (user_id = (select auth.uid()));
alter policy "owner can update cabinets" on public.cabinets using (user_id = (select auth.uid()));

-- catalog_items
alter policy "owner can delete catalog_items" on public.catalog_items using (user_id = (select auth.uid()));
alter policy "owner can insert catalog_items" on public.catalog_items with check (user_id = (select auth.uid()));
alter policy "owner can read catalog_items"   on public.catalog_items using (user_id = (select auth.uid()));
alter policy "owner can update catalog_items" on public.catalog_items using (user_id = (select auth.uid()));

-- clients
alter policy "Users manage own clients" on public.clients using ((select auth.uid()) = user_id);

-- cutlist_cabinets
alter policy "cutlist_cabinets_delete" on public.cutlist_cabinets using (user_id = (select auth.uid()));
alter policy "cutlist_cabinets_insert" on public.cutlist_cabinets with check (user_id = (select auth.uid()));
alter policy "cutlist_cabinets_select" on public.cutlist_cabinets using (user_id = (select auth.uid()));
alter policy "cutlist_cabinets_update" on public.cutlist_cabinets using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- cutlists
alter policy "cutlists_delete" on public.cutlists using (user_id = (select auth.uid()));
alter policy "cutlists_insert" on public.cutlists with check (user_id = (select auth.uid()));
alter policy "cutlists_select" on public.cutlists using (user_id = (select auth.uid()));
alter policy "cutlists_update" on public.cutlists using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- edge_bands
alter policy "owner can delete edge_bands" on public.edge_bands using (user_id = (select auth.uid()));
alter policy "owner can insert edge_bands" on public.edge_bands with check (user_id = (select auth.uid()));
alter policy "owner can read edge_bands"   on public.edge_bands using (user_id = (select auth.uid()));
alter policy "owner can update edge_bands" on public.edge_bands using (user_id = (select auth.uid()));

-- feature_suggestion_votes
alter policy "feature_suggestion_votes_delete" on public.feature_suggestion_votes using (user_id = (select auth.uid()));
alter policy "feature_suggestion_votes_insert" on public.feature_suggestion_votes with check (user_id = (select auth.uid()));
alter policy "feature_suggestion_votes_select" on public.feature_suggestion_votes using (user_id = (select auth.uid()));

-- order_lines
alter policy "owner can delete order_lines" on public.order_lines using (user_id = (select auth.uid()));
alter policy "owner can insert order_lines" on public.order_lines with check (user_id = (select auth.uid()));
alter policy "owner can read order_lines"   on public.order_lines using (user_id = (select auth.uid()));
alter policy "owner can update order_lines" on public.order_lines using (user_id = (select auth.uid()));

-- orders
alter policy "own orders" on public.orders using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- piece_edges
alter policy "owner via piece" on public.piece_edges using (piece_id in (select pieces.id from public.pieces where pieces.user_id = (select auth.uid())));

-- pieces
alter policy "owner can delete pieces" on public.pieces using (user_id = (select auth.uid()));
alter policy "owner can insert pieces" on public.pieces with check (user_id = (select auth.uid()));
alter policy "owner can read pieces"   on public.pieces using (user_id = (select auth.uid()));
alter policy "owner can update pieces" on public.pieces using (user_id = (select auth.uid()));

-- quote_lines
alter policy "owner can delete quote_lines" on public.quote_lines using (user_id = (select auth.uid()));
alter policy "owner can insert quote_lines" on public.quote_lines with check (user_id = (select auth.uid()));
alter policy "owner can read quote_lines"   on public.quote_lines using (user_id = (select auth.uid()));
alter policy "owner can update quote_lines" on public.quote_lines using (user_id = (select auth.uid()));

-- quotes
alter policy "own quotes" on public.quotes using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- schedule_day_overrides
alter policy "schedule_day_overrides_delete_own" on public.schedule_day_overrides using ((select auth.uid()) = user_id);
alter policy "schedule_day_overrides_insert_own" on public.schedule_day_overrides with check ((select auth.uid()) = user_id);
alter policy "schedule_day_overrides_select_own" on public.schedule_day_overrides using ((select auth.uid()) = user_id);
alter policy "schedule_day_overrides_update_own" on public.schedule_day_overrides using ((select auth.uid()) = user_id);

-- sheets
alter policy "owner can delete sheets" on public.sheets using (user_id = (select auth.uid()));
alter policy "owner can insert sheets" on public.sheets with check (user_id = (select auth.uid()));
alter policy "owner can read sheets"   on public.sheets using (user_id = (select auth.uid()));
alter policy "owner can update sheets" on public.sheets using (user_id = (select auth.uid()));

-- stock_items
alter policy "own stock" on public.stock_items using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- subscriptions
alter policy "owner can read own subscription" on public.subscriptions using (user_id = (select auth.uid()));
