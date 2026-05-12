-- Switch cutlists ↔ cabinets from 1:N to M:N.
--
-- Replaces the single nullable `cutlists.cabinet_id` column with a join table
-- so one library cut list can be linked to many saved cabinet templates.
--
-- Backfill: any existing non-null `cutlists.cabinet_id` row is copied into the
-- new table before the column is dropped.

-- 1. Join table.
create table public.cutlist_cabinets (
  cutlist_id bigint not null references public.cutlists(id) on delete cascade,
  cabinet_id bigint not null references public.cabinet_templates(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (cutlist_id, cabinet_id)
);

create index cutlist_cabinets_cabinet_id_idx on public.cutlist_cabinets(cabinet_id);
create index cutlist_cabinets_user_id_idx    on public.cutlist_cabinets(user_id);

alter table public.cutlist_cabinets enable row level security;

create policy cutlist_cabinets_select on public.cutlist_cabinets
  for select using (user_id = auth.uid());
create policy cutlist_cabinets_insert on public.cutlist_cabinets
  for insert with check (user_id = auth.uid());
create policy cutlist_cabinets_update on public.cutlist_cabinets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cutlist_cabinets_delete on public.cutlist_cabinets
  for delete using (user_id = auth.uid());

-- 2. Backfill from the existing column.
insert into public.cutlist_cabinets (cutlist_id, cabinet_id, user_id)
select id, cabinet_id, user_id
from public.cutlists
where cabinet_id is not null
on conflict (cutlist_id, cabinet_id) do nothing;

-- 3. Drop the single-link column (its FK goes with it).
alter table public.cutlists drop column cabinet_id;
