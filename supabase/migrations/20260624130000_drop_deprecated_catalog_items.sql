-- R.5: retire the deprecated catalog_items table. stock_items is the single
-- source of truth for material/hardware/finish prices. Verified empty (0 rows,
-- 0 inbound FKs, 0 dependent views) before drop; the 4 RLS policies drop with
-- the table. Client + edge-fn references were removed first (2026-06-24).
drop table if exists public.catalog_items;
