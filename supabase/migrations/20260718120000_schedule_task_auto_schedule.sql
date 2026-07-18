-- Auto-schedulable tasks: an allocating task can be placed by the production
-- queue like an order, instead of being pinned to a date by the user.
--
-- Defaults to FALSE deliberately: every existing task stays exactly where the
-- user put it, so applying this migration moves nothing.
alter table public.schedule_tasks
  add column if not exists auto_schedule boolean not null default false,
  add column if not exists priority      integer not null default 0;

comment on column public.schedule_tasks.auto_schedule is
  'When true (and allocate_hours is true), the production scheduler places this task in the priority queue like an order. start_at/end_at then carry only the task''s DURATION and a fallback pin — the computed placement is never written back. Defaults false so existing tasks stay pinned.';

comment on column public.schedule_tasks.priority is
  'Queue priority for auto-scheduled tasks. 1 = highest, 0 = unset (sorted last). Mirrors orders.priority so tasks and orders share one grouping pass.';
