-- Rewrite stored quote_number / order_number to use 3-letter prefixes for
-- visual consistency with the PDF prefixes (ORC, PRO, INV).
--
-- Quote:  Q-NNNN  →  QUO-NNNN
-- Order:  NNNN (no prefix)  →  ORD-NNNN
--
-- Both columns are nullable text. Only the prefix changes; the digit portion
-- stays identical so any FK/cross-reference that happens to text-compare these
-- values (none today) is unaffected. Idempotent — re-running is a no-op.

UPDATE quotes
SET quote_number = 'QUO-' || regexp_replace(quote_number, '^Q-', '', 'i')
WHERE quote_number ~* '^Q-';

UPDATE orders
SET order_number = 'ORD-' || order_number
WHERE order_number IS NOT NULL
  AND order_number !~* '^ORD-';
