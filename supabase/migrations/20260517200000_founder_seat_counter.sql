-- Founder seat counter.
--
-- The walkthrough's final CTA shows an "N of 50 left" counter for the limited
-- Founder plan. The walkthrough runs for guests (the `anon` role), and the
-- `subscriptions` table has SELECT-only RLS scoped to the row owner — so a
-- guest cannot count founder rows directly. This SECURITY DEFINER function
-- exposes ONLY the aggregate count (never any row data), readable by anon and
-- authenticated.

create or replace function public.founder_seats_taken()
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.subscriptions
  where plan = 'founder' and status = 'active';
$$;

grant execute on function public.founder_seats_taken() to anon, authenticated;
