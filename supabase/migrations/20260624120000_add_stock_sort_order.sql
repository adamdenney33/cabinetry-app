-- Manual drag-and-drop ordering for the Stock Library.
-- Nullable: NULL means "no manual position" and the UI falls back to id /
-- insertion order. Items are sorted within their category group by this value.
alter table public.stock_items
  add column if not exists sort_order integer;
