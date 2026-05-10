-- Add per-line and whole-order discount columns + parity schedule_hours on quote_lines.
--
-- Editor UI redesign (orders/quotes sidebar) introduces:
--   * whole-order discount % on `quotes` and `orders`
--   * per-line discount % on `quote_lines` and `order_lines`
--   * unified Hrs column in line items, requires `schedule_hours` to exist on quote_lines
--     (was previously order_lines only — see SCHEMA.md note "scheduling is order-only";
--     we now expose hours at the quote stage too so they survive quote→order conversion)

alter table public.quotes      add column if not exists discount numeric not null default 0;
alter table public.orders      add column if not exists discount numeric not null default 0;
alter table public.quote_lines add column if not exists discount numeric not null default 0;
alter table public.order_lines add column if not exists discount numeric not null default 0;
alter table public.quote_lines add column if not exists schedule_hours numeric not null default 0;

comment on column public.quotes.discount             is 'Whole-quote discount percentage (0-100). Applied after markup and tax.';
comment on column public.orders.discount             is 'Whole-order discount percentage (0-100). Applied after markup and tax.';
comment on column public.quote_lines.discount        is 'Per-line discount percentage (0-100). Applied to materials+labour before order-level markup/tax/discount.';
comment on column public.order_lines.discount        is 'Per-line discount percentage (0-100). Applied to materials+labour before order-level markup/tax/discount.';
comment on column public.quote_lines.schedule_hours  is 'Workshop time for this line. Scheduler input only, never on PDFs. Mirrors order_lines.schedule_hours.';
