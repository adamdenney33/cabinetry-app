-- Per-spec customer editability for the live quote/order page.
-- ADDITIVE ONLY — a new jsonb column (safe default) on the line tables. Nothing
-- is dropped or back-filled destructively.
--
-- `editable_specs` is an array of spec keys the customer may request changes to
-- on the live /q page: 'dims' | 'finish' | 'material' | 'doors' | 'drawers'.
-- The business sets it per cabinet line in the sidebar "Live link" tab's per-line
-- controls (the editable-specs dropdown). `customer_editable` stays as the master
-- gate and is set true by the app when editable_specs is non-empty (back-compat
-- with the original single "Editable" flag + the quote-public-update edit guard).

alter table public.quote_lines add column if not exists editable_specs jsonb not null default '[]'::jsonb;
alter table public.order_lines add column if not exists editable_specs jsonb not null default '[]'::jsonb;

comment on column public.quote_lines.editable_specs is
  'Array of spec keys the customer may request changes to on the live page (dims|finish|material|doors|drawers). customer_editable = (length > 0).';
comment on column public.order_lines.editable_specs is
  'Array of spec keys the customer may request changes to on the live page (dims|finish|material|doors|drawers). customer_editable = (length > 0).';
