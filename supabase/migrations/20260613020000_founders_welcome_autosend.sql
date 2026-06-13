-- Founders' welcome auto-send (PLAN.md E.2/E.3, 2026-06-13).
--
-- 1. founders_welcome_sends — claim-then-send log keyed by email; the
--    send-founders-welcome edge function inserts (ignore-duplicates) before
--    sending, so each founder gets the welcome exactly once. RLS enabled
--    with no policies: service-role/postgres only.
-- 2. notify_founder_purchase() + trg_founders_welcome — when a
--    subscriptions row lands with plan='founder' (Stripe webhook upsert on
--    seat purchase), resolve the buyer's email from auth.users and call the
--    edge function via pg_net. Wrapped in an exception guard so a sending
--    hiccup can NEVER abort the Stripe webhook's subscription write.

create table if not exists public.founders_welcome_sends (
  email      text primary key,
  resend_id  text,
  sent_at    timestamptz not null default now()
);

comment on table public.founders_welcome_sends is
  'Claim-then-send log for the automated founders'' welcome email (send-founders-welcome edge function). Service-role only; RLS on, no policies.';

alter table public.founders_welcome_sends enable row level security;

create or replace function public.notify_founder_purchase()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer_email text;
begin
  if new.plan = 'founder' and (tg_op = 'INSERT' or old.plan is distinct from 'founder') then
    select u.email into buyer_email from auth.users u where u.id = new.user_id;
    if buyer_email is not null then
      perform net.http_post(
        url := 'https://mhzneruvlfmhnsohfrdo.supabase.co/functions/v1/send-founders-welcome',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-fw-key', 'fwk_cb6b24c4205c55bcd39ac2d936365d64'
        ),
        body := jsonb_build_object('email', buyer_email)
      );
    end if;
  end if;
  return new;
exception when others then
  -- Never let welcome-email plumbing break the payment path.
  raise warning 'notify_founder_purchase failed: %', sqlerrm;
  return new;
end;
$$;

comment on function public.notify_founder_purchase() is
  'Fires the send-founders-welcome edge function (via pg_net) when a subscription transitions to plan=founder. Exception-guarded: never aborts the triggering write.';

drop trigger if exists trg_founders_welcome on public.subscriptions;
create trigger trg_founders_welcome
  after insert or update of plan on public.subscriptions
  for each row execute function public.notify_founder_purchase();

-- The trigger runs as table owner; no one should be able to call this
-- trigger function directly over the REST API (security advisor 0028/0029).
revoke execute on function public.notify_founder_purchase() from anon, authenticated, public;
