-- Performance: cover the 2 remaining unindexed foreign keys flagged by the
-- Supabase performance advisor on 2026-06-09.
--
-- Background: Supabase emailed a "running out of Disk IO Budget" notice
-- (Nano-compute burst budget). The DB is 15 MB with 100% cache hit ratio,
-- so this is a write-side / advisor-hygiene pass, not a real read-IO fix.
-- The previous FK-coverage pass (20260518150000) handled 10 columns; the
-- `customer_messages` table was added later and still has 2 uncovered FKs.
--
-- Both indexes are additive and tiny on the current row count (1 live row),
-- so risk = none.

create index if not exists customer_messages_order_id_idx
  on public.customer_messages(order_id);

create index if not exists customer_messages_quote_id_idx
  on public.customer_messages(quote_id);
