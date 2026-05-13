-- F4 (2026-05-13): Add cutlists.quote_id as the direct-bookmark FK to the
-- source Quote. Per the design: cabinets don't "export parts" to cut lists —
-- the link is just a bookmark. cutlists.quote_id points the cut list back at
-- the Quote whose cabinet designs prompted it.
--
-- The existing cutlist_cabinets join table is unchanged — it's a separate
-- many-to-many between cut lists and library cabinet_templates.
--
-- nullable: cut lists can exist standalone (not derived from any quote).
--
-- Applied 2026-05-13 via Supabase MCP.

alter table public.cutlists
  add column if not exists quote_id bigint
    references public.quotes(id) on delete set null;

create index if not exists cutlists_quote_id_idx on public.cutlists(quote_id);
