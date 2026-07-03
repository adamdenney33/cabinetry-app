-- The Cabinet Builder now shows a Hardware line on every physical-component
-- card. Two new hardware scopes join the existing cabinet/door/drawer buckets:
-- shelf/partition hardware (shelf pins, brackets) and drawer-front hardware
-- (handles). Add matching jsonb columns to quote_lines + order_lines
-- (additive, default '[]') so _cbLineToRow / _cbRowToLine round-trip them and
-- both cost engines (client calcCBLine/calcCBSections + _shared/costing.ts)
-- price them. Mirrors the existing hardware / door_hardware / drawer_hardware
-- columns (added 2026-05-07 / order parity 2026-06-10).
alter table public.quote_lines
  add column if not exists shelf_hardware        jsonb default '[]'::jsonb,
  add column if not exists drawer_front_hardware jsonb default '[]'::jsonb;

alter table public.order_lines
  add column if not exists shelf_hardware        jsonb default '[]'::jsonb,
  add column if not exists drawer_front_hardware jsonb default '[]'::jsonb;
