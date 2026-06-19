-- Debug audit C1. The Cabinet Builder lets a user pick a carcass type and a
-- drawer-box type (both drive labour estimates via cbSettings.carcassTypes /
-- drawerBoxTypes), but quote_lines / order_lines had no column to hold the
-- choice, so the _cbLineToRow / _quoteLineRowToCB converters dropped it. On
-- reload the type reset to null and labour fell back to the default ref-hours.
-- Add nullable text columns to both tables (additive, no backfill needed).
alter table public.quote_lines
  add column if not exists carcass_type   text,
  add column if not exists drawer_box_type text;

alter table public.order_lines
  add column if not exists carcass_type   text,
  add column if not exists drawer_box_type text;
