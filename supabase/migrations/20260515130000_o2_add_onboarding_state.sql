-- O.2 (2026-05-15): Persist guided-walkthrough (onboarding tour) state per user.
--
-- A single jsonb column on business_info. Shape:
-- {
--   "version":       1,                          -- walkthrough version last seen
--   "dismissed_at":  "2026-05-15T...Z" | null,    -- set when finished or skipped
--   "completed":     false,                       -- true = reached the final CTA
--   "sample_seeded": true,                        -- a sample project was seeded
--   "sample_ids": {                               -- exact rows for "clear sample data"
--     "clients": [..], "cabinet_templates": [..], "stock_items": [..],
--     "quotes": [..], "orders": [..], "cutlists": [..]
--   }
-- }
-- {} (the default) = a brand-new user who has never seen the tour.
--
-- Additive, non-destructive: ADD COLUMN with a constant default is a
-- metadata-only operation in Postgres 11+ — no table rewrite, no lock risk.
--
-- Applied 2026-05-15 via Supabase MCP.

alter table public.business_info
  add column if not exists onboarding_state jsonb not null default '{}'::jsonb;

comment on column public.business_info.onboarding_state is
  'Guided-walkthrough (O.2) state: version seen, dismissed_at, completed flag, and IDs of seeded sample rows for clean removal. {} = never onboarded.';
