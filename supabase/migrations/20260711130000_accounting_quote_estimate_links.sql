-- Accounting integration: extend the invoice-link table to also record a QUOTE
-- pushed to QuickBooks/Xero as an ESTIMATE (QBO) / QUOTE (Xero).
--
-- The original table (migration 20260530120000) mapped one ORDER → one external
-- invoice. Quotes push to a *different* external document type (a pre-sale
-- estimate, not a receivable), so we reuse the same link table for both:
--   • add a nullable quote_id FK (mutually exclusive with order_id),
--   • relax order_id NOT NULL,
--   • add doc_type to record which external doc was created ('invoice'|'estimate'),
--   • add a second full unique constraint for quote links so re-push updates in
--     place (NULLs are distinct in a unique constraint, so order rows — quote_id
--     NULL — never collide on the quote key, and quote rows — order_id NULL —
--     never collide on the order key; both PostgREST upserts stay conflict-safe).
--
-- Additive / backward-compatible: existing order rows keep order_id and default
-- to doc_type='invoice'. No OAuth scope change is needed — QBO's existing
-- accounting scope covers Estimate, and Xero's accounting.invoices scope already
-- covers Quotes.

-- order_id becomes optional (a row is now either an order link OR a quote link).
alter table public.accounting_invoice_links
  alter column order_id drop not null;

-- New quote link column.
alter table public.accounting_invoice_links
  add column if not exists quote_id bigint references public.quotes(id) on delete cascade;

-- Which external document this row represents. Existing rows backfill to 'invoice'.
alter table public.accounting_invoice_links
  add column if not exists doc_type text not null default 'invoice'
    check (doc_type in ('invoice','estimate'));

-- Exactly one of order_id / quote_id must be set.
alter table public.accounting_invoice_links
  add constraint accounting_invoice_links_one_owner
    check ((order_id is not null) <> (quote_id is not null));

-- One link per quote per provider (mirrors the existing order unique key). The
-- order key unique (user_id, order_id, provider) stays as-is from 20260530120000.
alter table public.accounting_invoice_links
  add constraint accounting_invoice_links_user_quote_provider_key
    unique (user_id, quote_id, provider);

create index if not exists accounting_invoice_links_quote_id_idx
  on public.accounting_invoice_links(quote_id);

comment on column public.accounting_invoice_links.quote_id is
  'When set, this link is a QUOTE pushed as an estimate (QBO) / quote (Xero); mutually exclusive with order_id.';
comment on column public.accounting_invoice_links.doc_type is
  'External document type created: invoice (from an order) or estimate (from a quote).';
