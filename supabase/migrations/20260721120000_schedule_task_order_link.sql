-- Link a schedule task to an order (optional). A task stays first-class: the
-- link is an attribute of the task, not the other way round. Deleting the order
-- UNLINKS its tasks (they survive on the calendar as standalone tasks) rather
-- than deleting them — hence ON DELETE SET NULL.
alter table public.schedule_tasks
  add column order_id bigint references public.orders(id) on delete set null;

create index schedule_tasks_order_idx
  on public.schedule_tasks (order_id);

comment on column public.schedule_tasks.order_id is
  'Optional link to the order this task belongs to. NULL = standalone task. ON DELETE SET NULL — a task outlives its order, just loses the link.';
