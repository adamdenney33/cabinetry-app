-- F6 (2026-05-13): drop the public.projects table entirely.
-- All child FKs (quotes/orders/cutlists/pieces/sheets/edge_bands/cabinets)
-- were dropped in F5 (20260513160000_f5_drop_project_id.sql). The Projects
-- panel + renderProjectsMain + #panel-projects were removed in the
-- accompanying F6 client commit.

drop table if exists public.projects;
