-- Email ↔ in-app messages bridge (PLAN.md, 2026-06-19).
--
-- Makes the client-scoped chat (customer_messages) reachable by email in both
-- directions:
--   • OUTBOUND — an AFTER-INSERT trigger fires the messages-notify edge function
--     (via pg_net) for every NEW chat row, emailing the OPPOSITE party. Mirrors
--     the founders-welcome trigger: security definer, search_path='', exception-
--     guarded so a Resend/pg_net hiccup can never abort a chat insert.
--   • INBOUND — the messages-inbound edge function (Resend email.received
--     webhook) parses replies sent to c-<token>@ / b-<token>@reply.procabinet.app
--     and inserts them back with via='email'. The trigger SKIPS via='email' rows
--     so an emailed reply is never re-emailed (loop break).
--
-- Schema additions are all additive (nullable / defaulted) — no backfill.

-- ── 1. Per-client reply-routing token ───────────────────────────────────────
-- One opaque token per client (the conversation is client-scoped). Used as the
-- local-part of the reply-to address. gen_random_uuid() backfills every existing
-- and future client row automatically; ~122 bits, unique-indexed, not enumerable.
alter table public.clients
  add column if not exists reply_token uuid not null default gen_random_uuid();
create unique index if not exists clients_reply_token_key on public.clients(reply_token);

comment on column public.clients.reply_token is
  'Opaque per-client token used in the email-bridge reply-to address (c-<token>@ / b-<token>@reply.procabinet.app). Routes inbound replies to this client''s conversation.';

-- ── 2. customer_messages: provenance + verification + delivery status ────────
alter table public.customer_messages
  add column if not exists via              text not null default 'app'
    check (via in ('app','email')),                 -- how the message entered the thread
  add column if not exists email_verified   boolean,  -- via='email' only: sender From matched the address on file
  add column if not exists inbound_email_id  text,     -- inbound_emails.message_id (for "View original")
  add column if not exists outbound_email_id text,     -- Resend id of the notification we sent for this row
  add column if not exists outbound_status   text;     -- null|sending|sent|delivered|bounced|complained|skipped|failed

comment on column public.customer_messages.via is
  '''app'' = posted in-app/live-page; ''email'' = arrived via an email reply (messages-inbound). The notify trigger skips ''email'' rows to avoid re-emailing.';

-- ── 3. Inbound-email log: idempotency + raw storage for "View original" ──────
-- One row per received email. message_id (RFC822 Message-ID) is the idempotency
-- key — messages-inbound claims it before doing work, so Resend webhook retries
-- are absorbed. Service-role writes; owner may read for the "View original" UI.
create table if not exists public.inbound_emails (
  message_id          text primary key,                  -- RFC822 Message-ID (fallback: resend email_id)
  resend_email_id     text,                              -- Resend received-email id (to fetch body)
  user_id             uuid   references auth.users(id)  on delete cascade,
  client_id           bigint references public.clients(id) on delete cascade,
  role                text,                              -- 'business' | 'customer' (from the address prefix)
  from_addr           text,
  verified            boolean,                           -- From matched the party on file
  status              text not null default 'received',  -- received|inserted|dropped_*|rejected_*
  customer_message_id bigint references public.customer_messages(id) on delete set null,
  raw_html            text,                              -- stored for accepted/flagged rows; powers "View original"
  created_at          timestamptz not null default now()
);

comment on table public.inbound_emails is
  'Log of inbound email replies received by the messages-inbound webhook. PK message_id gives webhook idempotency; raw_html powers the in-app "View original". Service-role only except owner SELECT.';

create index if not exists inbound_emails_client_id_idx on public.inbound_emails(client_id);

alter table public.inbound_emails enable row level security;

-- Owner may read their own inbound emails (for "View original"); writes are
-- service-role only (messages-inbound). InitPlan-optimised auth.uid() form.
drop policy if exists "owner can read inbound emails" on public.inbound_emails;
create policy "owner can read inbound emails"
  on public.inbound_emails for select using (user_id = (select auth.uid()));

grant all on public.inbound_emails to service_role;

-- ── 4. Owner mute toggle for notification emails ─────────────────────────────
-- When false, customer→business notification emails are suppressed (the owner
-- doesn't want email pings); business→customer still works so customers stay
-- reachable.
alter table public.business_info
  add column if not exists email_bridge_enabled boolean not null default true;

-- ── 5. Realtime: let emailed (and live-page) replies surface without reopening ─
-- Add customer_messages to the realtime publication (RLS already scopes delivery
-- to the owner). Idempotent — only adds if not already published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_messages'
  ) then
    alter publication supabase_realtime add table public.customer_messages;
  end if;
end $$;

-- ── 6. Outbound notify trigger (founders-welcome pattern) ────────────────────
-- Resolves the recipient of the OPPOSITE party and fires messages-notify via
-- pg_net. Cheap guards here (loop break, mute, no-email) avoid needless HTTP;
-- the function reloads the row authoritatively and does the Resend send.
create or replace function public.notify_message_posted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_email text;
  bridge_enabled  boolean := true;
begin
  -- Loop break: a message that ARRIVED by email is never re-emailed.
  if new.via = 'email' then
    return new;
  end if;

  if new.sender = 'business' then
    -- Notify the customer.
    select c.email into recipient_email
      from public.clients c
      where c.id = new.client_id;
  else
    -- Notify the business owner (respect their mute toggle).
    select coalesce(nullif(btrim(bi.email), ''), u.email),
           coalesce(bi.email_bridge_enabled, true)
      into recipient_email, bridge_enabled
      from auth.users u
      left join public.business_info bi on bi.user_id = u.id
      where u.id = new.user_id;
    if bridge_enabled is not true then
      return new;
    end if;
  end if;

  -- Nobody to email — leave the in-app message as-is.
  if recipient_email is null or btrim(recipient_email) = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://mhzneruvlfmhnsohfrdo.supabase.co/functions/v1/messages-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-msg-key', 'msgk_6556e754c6a6e6714b1091a794cd8e37'
    ),
    body := jsonb_build_object('message_id', new.id)
  );
  return new;
exception when others then
  -- Never let email plumbing break a chat insert.
  raise warning 'notify_message_posted failed: %', sqlerrm;
  return new;
end;
$$;

comment on function public.notify_message_posted() is
  'Fires the messages-notify edge function (via pg_net) on each customer_messages insert, emailing the opposite party. Skips via=''email'' (loop break) and muted owners. Exception-guarded: never aborts the triggering insert.';

drop trigger if exists trg_message_notify on public.customer_messages;
create trigger trg_message_notify
  after insert on public.customer_messages
  for each row execute function public.notify_message_posted();

-- The trigger runs as table owner; no one should call it directly over the REST
-- API (security advisor 0028/0029), matching trg_founders_welcome.
revoke execute on function public.notify_message_posted() from anon, authenticated, public;
