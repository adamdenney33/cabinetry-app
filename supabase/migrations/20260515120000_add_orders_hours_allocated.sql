-- Add the manual hours-allocated override column to orders.
--
-- SCHEMA.md § 3.15 documents this column as "added 2026-05-09", but the
-- migration was never written or applied — only `order_number` from the same
-- date made it into the DB. saveOrderEditor() in src/orders.js always sends
-- `hours_allocated` in its update payload, so without the column every order
-- save failed with PostgREST error PGRST204 ("Could not find the
-- 'hours_allocated' column of 'orders' in the schema cache").
--
-- NULL     = scheduler uses orderHoursRequired() (sum of cabinet + labour +
--            item + packaging + run-over hours from order_lines).
-- non-NULL = scheduler reserves exactly this many hours on the calendar.
-- Toggled via the "Override hours" checkbox in the order editor.

alter table public.orders add column if not exists hours_allocated numeric;

comment on column public.orders.hours_allocated is 'Optional manual override of the auto-computed hours-required total. NULL = use scheduler computation; non-null = fixed hours value the scheduler reserves on the calendar.';
