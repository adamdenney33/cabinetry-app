-- Per-stock-item live-link visibility. When true, the item's name is offered as
-- a selectable material in the customer's spec editor on the public live link
-- (merged into the `materials` list by the quote-public-get edge function).
-- Defaults to false so existing stock stays private until explicitly shared.
alter table public.stock_items
  add column if not exists customer_visible boolean not null default false;
