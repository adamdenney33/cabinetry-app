-- Repoint cutlists.cabinet_id FK from cabinets(id) to cabinet_templates(id).
--
-- The link-to-cabinet picker (`_clLinkToCabinet` in src/cutlist.js) and the
-- pill count reader (`_cbApplyCutListCounts` in src/cabinet-library.js) both
-- treat `cutlists.cabinet_id` as referring to a `cabinet_templates.id` (that's
-- what `_saveCabinetToDB` persists and what `cbLibrary` is loaded from). The
-- original FK pointed at the per-project `cabinets` table, so every link
-- attempt failed with 23503 ("Key is not present in table 'cabinets'.").
--
-- No data migration: `cabinet_id` was nullable and NULL on every row.

alter table public.cutlists
  drop constraint cutlists_cabinet_id_fkey,
  add  constraint cutlists_cabinet_id_fkey
    foreign key (cabinet_id) references public.cabinet_templates(id) on delete cascade;
