-- Editor J redesign: introduces 'stock' as a 3rd line_kind (alongside cabinet
-- and item) plus a per-order/quote `stock_markup` column. Stock-kind lines are
-- added from the new stock smart-library in the editor sidebar; their
-- materials are summed and re-priced via stock_markup before order-level tax
-- and discount.
--
-- Schema changes:
--   * Relax the line_kind CHECK constraint on quote_lines + order_lines to
--     allow 'stock' (existing 'cabinet'/'item'/'labour' values still valid).
--   * Add stock_markup numeric column (default 0) to quotes + orders. Single
--     percentage applied to all stock-kind line materials at totals time.

-- 1) line_kind check constraints — DROP and re-CREATE with 'stock' added.
alter table public.quote_lines drop constraint if exists quote_lines_line_kind_check;
alter table public.quote_lines add constraint quote_lines_line_kind_check
  check (line_kind in ('cabinet','item','labour','stock'));

alter table public.order_lines drop constraint if exists order_lines_line_kind_check;
alter table public.order_lines add constraint order_lines_line_kind_check
  check (line_kind in ('cabinet','item','labour','stock'));

-- 2) stock_markup columns on quotes + orders (numeric percentage, default 0).
alter table public.quotes add column if not exists stock_markup numeric not null default 0;
alter table public.orders add column if not exists stock_markup numeric not null default 0;

comment on column public.quotes.stock_markup is 'Single percentage (0-100) applied to all line_kind=stock materials before order-level markup/tax/discount. Set in the editor sidebar below the stock smart-library.';
comment on column public.orders.stock_markup is 'Single percentage (0-100) applied to all line_kind=stock materials before order-level markup/tax/discount. Set in the editor sidebar below the stock smart-library.';
