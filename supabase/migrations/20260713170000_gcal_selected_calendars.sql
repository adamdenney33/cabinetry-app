-- Calendar picker (GC.7): which of the user's Google calendars feed the
-- read-only overlay. NULL = default = primary only. Stored as a jsonb array
-- of { id, summary } objects (id 'primary' is normalised for the primary
-- calendar). Tasks/orders always reconcile against the primary calendar
-- regardless of this selection.
alter table public.gcal_connections
  add column if not exists selected_calendars jsonb;
