-- Idempotency for quote-pay-webhook: at most one order per originating quote.
-- A concurrent second payment_intent.succeeded delivery would otherwise race the
-- "does an order already exist?" check and create a duplicate order. The webhook
-- now catches the resulting 23505 and reuses the existing order.
-- Partial (quote_id is not null) so manually-created orders (quote_id null) are
-- unaffected — multiple NULLs are allowed.
create unique index if not exists orders_quote_id_unique
  on public.orders (quote_id) where quote_id is not null;
