-- Door/drawer STYLE fields + door material on the line tables (full-parity P2).
-- The Cabinet Builder carries doorType / drawerFrontType / doorMat, but the
-- quote/order line previously dropped them (only finishes + carcass material
-- survived the conversion). Storing them per line lets the customer request
-- changes to door style, drawer-front style, and door material on the live page.
--
-- ADDITIVE ONLY — new nullable text columns. `_cbLineToRow` is updated to
-- populate them; quote-public-get/-update expose + validate them.
alter table public.quote_lines add column if not exists door_type         text;
alter table public.quote_lines add column if not exists drawer_front_type text;
alter table public.quote_lines add column if not exists door_material      text;
alter table public.order_lines add column if not exists door_type         text;
alter table public.order_lines add column if not exists drawer_front_type text;
alter table public.order_lines add column if not exists door_material      text;

comment on column public.quote_lines.door_type is 'Door style (Slab/Shaker/…) — customer-editable on the live page when unlocked.';
comment on column public.quote_lines.drawer_front_type is 'Drawer-front style — customer-editable on the live page when unlocked.';
comment on column public.quote_lines.door_material is 'Door material when it differs from the carcass material.';
