-- F5 (2026-05-13): drop project_id columns from every child table.
-- Code paths that wrote/read these columns were removed in the F5b sweep.
-- The projects table itself is dropped separately in the F6 migration.

alter table public.quotes     drop column if exists project_id;
alter table public.orders     drop column if exists project_id;
alter table public.cutlists   drop column if exists project_id;
alter table public.pieces     drop column if exists project_id;
alter table public.sheets     drop column if exists project_id;
alter table public.edge_bands drop column if exists project_id;
alter table public.cabinets   drop column if exists project_id;
