-- Finishing stock items (paint/oil/lacquer) are measured in litres, not unit
-- counts, so qty must hold decimals (e.g. 2.5 L). coverage_sqm is the m² covered
-- per litre, used to price a finish by surface area when added to a quote/order
-- (unit_price = cost-per-litre ÷ coverage_sqm = £/m²).
alter table public.stock_items
  alter column qty type numeric using qty::numeric,
  add column if not exists coverage_sqm numeric;
