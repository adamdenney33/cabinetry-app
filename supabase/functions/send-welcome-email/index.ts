// ProCabinet — One-time onboarding welcome email (Resend, template-backed).
//
// Called by the authenticated client (with a Supabase JWT) on the first
// signed-in load after signup — both auth paths land there: email signups
// right after the confirmation link, Google OAuth signups immediately.
// Sends to EVERY new account regardless of marketing opt-in: it is a
// transactional service email (welcome, first steps, free setup-call booking
// link), so it carries no promotional content. The opt-in mailing list stays
// separate (list-subscribe).
//
// The email COPY now lives in a PUBLISHED Resend template (alias
// `welcome-onboarding`), so it is visible and editable in the Resend
// dashboard (Templates → version history) WITHOUT a code deploy. This
// function only decides WHO gets it and WHEN, then fires a transactional
// template send. The single dynamic field is GREETING ("Hi <name>," or
// "Hello,"); everything else is owned by the template.
//
// Never-twice guarantee, in layers:
//   1. `app_metadata.welcome_email_sent_at` — the durable, authoritative
//      flag, written via service role BEFORE the send (claim-then-send: a
//      failed claim sends nothing and retries next login; a failed send
//      rolls the claim back). app_metadata, not user_metadata — the browser
//      can rewrite its own user_metadata, app_metadata is server-only.
//   2. Resend `Idempotency-Key: welcome-email/<user_id>` — collapses the
//      claim-check race (two tabs / devices hitting this concurrently);
//      Resend honours the key for ~24h, which covers exactly that window.
//   3. The client keeps a localStorage flag so it normally calls once per
//      device (src/auth.js _sendWelcomeEmailOnce).
// Existing accounts never get it here: users created before WELCOME_CUTOFF
// are skipped server-side (the one-off backfill handles them separately).
//
// Required env vars (set via `supabase secrets set`):
//   RESEND_API_KEY             — re_... (full access)
//   SUPABASE_URL               — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY  — auto-provided
//
// Request body: (none required — the recipient is the JWT's user)
// Response:     { ok: true }                    — sent
//               { ok: false, skipped: string }  — nothing to do
//               { error: string }               — failure
//
// Deploy WITHOUT --no-verify-jwt (the gateway must keep verifying JWTs).

import type { User } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY for send-welcome-email function');
}

// Accounts created before this instant never receive the welcome email here.
// Start of the ship day (UTC): every pre-existing account is older, and a
// same-day signup landing a few hours before the client deploy still gets
// its welcome on the next login — which is correct, they're genuinely new.
const WELCOME_CUTOFF = Date.parse('2026-06-12T00:00:00Z');

const FROM = 'Adam at ProCabinet <adam@procabinet.app>';
const REPLY_TO = 'adam@procabinet.app';
// Published Resend template — the copy + subject live there, edit in the
// dashboard. Sending references it by alias.
const TEMPLATE_ID = 'welcome-onboarding';

/** First name for the greeting, when signup collected one. */
function firstNameOf(user: User): string | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidates = [meta.first_name, meta.given_name, meta.full_name, meta.name];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const first = c.trim().split(/\s+/)[0];
      if (first && first.length <= 32) return first;
      return null;
    }
  }
  return null;
}

// GREETING is injected raw via triple-mustache ({{{GREETING}}}) in the
// template, so strip the HTML-structural characters a name could carry.
// Apostrophes/quotes are safe in both the HTML and plain-text bodies.
function sanitizeName(s: string): string {
  return s.replace(/[<>&]/g, '').trim();
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const user = auth.user;

  if (!user.email) {
    return jsonResponse({ error: 'User has no email address' }, 400, cors);
  }
  // Belt-and-braces: email signups can't even hold a session before
  // confirming, and OAuth emails arrive provider-confirmed. Skip WITHOUT
  // claiming so a later confirmed login still sends.
  if (!user.email_confirmed_at) {
    return jsonResponse({ ok: false, skipped: 'email not confirmed' }, 200, cors);
  }
  // Date-parse, not string-compare: created_at carries fractional seconds.
  const createdAt = Date.parse(user.created_at ?? '');
  if (!Number.isFinite(createdAt) || createdAt < WELCOME_CUTOFF) {
    return jsonResponse({ ok: false, skipped: 'pre-launch user' }, 200, cors);
  }
  if (user.app_metadata?.welcome_email_sent_at) {
    return jsonResponse({ ok: false, skipped: 'already sent' }, 200, cors);
  }

  // Claim BEFORE sending. updateUserById shallow-merges app_metadata, so
  // other keys survive. If this write fails nothing was sent and the next
  // login retries — the reverse order could double-send, which is the one
  // unrecoverable failure mode.
  const sentAt = new Date().toISOString();
  const { error: claimError } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { welcome_email_sent_at: sentAt },
  });
  if (claimError) {
    console.error('[send-welcome-email] claim failed:', claimError.message);
    return jsonResponse({ error: 'Could not record send state' }, 500, cors);
  }

  const rollbackClaim = async () => {
    try {
      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: { welcome_email_sent_at: null },
      });
    } catch (e) {
      console.error('[send-welcome-email] claim rollback failed:', (e as Error).message);
    }
  };

  try {
    const firstName = firstNameOf(user);
    const greeting = firstName ? `Hi ${sanitizeName(firstName)},` : 'Hello,';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
        // Collapses concurrent duplicate sends (two tabs/devices racing the
        // claim check) — Resend honours the key for ~24h.
        'idempotency-key': `welcome-email/${user.id}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: user.email,
        reply_to: REPLY_TO,
        // Subject + body come from the published template; GREETING is the
        // only per-send variable.
        template: { id: TEMPLATE_ID, variables: { GREETING: greeting } },
      }),
    });

    if (res.ok) {
      return jsonResponse({ ok: true }, 200, cors);
    }
    const detail = await res.text();
    console.error('[send-welcome-email] Resend error:', res.status, detail);
    await rollbackClaim();
    return jsonResponse({ error: `Resend responded ${res.status}` }, 502, cors);
  } catch (err) {
    console.error('[send-welcome-email] Error:', (err as Error).message);
    await rollbackClaim();
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
