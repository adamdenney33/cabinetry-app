-- Live-link server-side re-pricing (PLAN.md → "Live link — auto-accept edits").
--
-- Snapshot of the maker's RESOLVED cabinet rate card, stored per-quote so the
-- quote-public-update edge function can re-price a customer's spec edit on the
-- public /q page EXACTLY as the maker's browser would — without ever shipping
-- the maker's cost inputs to the customer.
--
-- The maker's browser writes this (under their own JWT / RLS) whenever the live
-- link is generated or refreshed (src/share.js _buildRateCard, called from
-- _generateShareLink + livelink.js _llSyncCustomerPrices). It is read ONLY by
-- the quote-public-update edge function via the service role.
--
-- SECURITY: this column holds cost data. It must NEVER be returned to the public
-- page — quote-public-get selects an explicit column list that excludes it, and
-- the customer has no anon RLS read on `quotes`. Keep it server-only.
alter table public.quotes
  add column if not exists rate_card jsonb;

comment on column public.quotes.rate_card is
  'Resolved cabinet rate snapshot (matPerM2 / hwUnit / finishPerM2 lookups + labour/markup scalars + type arrays + quote markup/discount/stock_markup) written by the maker''s browser when the live link is generated/refreshed. Read only by the quote-public-update edge function (service role) to re-price customer spec edits when share_settings.auto_accept_edits is on. Never selected by quote-public-get — must stay server-only.';
