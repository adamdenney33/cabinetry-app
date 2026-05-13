-- F2 (2026-05-13): Schema prep for the library-first / Cabinet-IS-Quote architecture.
-- Additive only: adds `name` to quotes/orders and `tags jsonb` to library tables.
-- No drops, no renames. project_id columns are untouched (F5 removes them).
--
-- Applied 2026-05-13 via Supabase MCP. All 3 quotes and 1 order backfilled
-- with name from associated projects.

alter table public.quotes
  add column if not exists name text;

alter table public.orders
  add column if not exists name text;

update public.quotes q
  set name = p.name
  from public.projects p
  where q.project_id = p.id
    and q.name is null;

update public.orders o
  set name = p.name
  from public.projects p
  where o.project_id = p.id
    and o.name is null;

alter table public.cabinet_templates
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.stock_items
  add column if not exists tags jsonb not null default '[]'::jsonb;

alter table public.cutlists
  add column if not exists tags jsonb not null default '[]'::jsonb;

create index if not exists cabinet_templates_tags_gin_idx on public.cabinet_templates using gin (tags);
create index if not exists stock_items_tags_gin_idx       on public.stock_items       using gin (tags);
create index if not exists cutlists_tags_gin_idx          on public.cutlists          using gin (tags);
