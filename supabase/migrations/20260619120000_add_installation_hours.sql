-- Per-cabinet installation time, mirroring default_packaging_hours.
-- Folded into cabinet labour by calcCBLine (src/cabinet-calc.js), subject to
-- the labour-time contingency multiplier, exactly like packaging.
alter table public.business_info
  add column if not exists default_installation_hours numeric not null default 0;
