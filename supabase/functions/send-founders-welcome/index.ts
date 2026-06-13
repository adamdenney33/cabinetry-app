// ProCabinet — Founders' welcome email, auto-sent on seat purchase (Resend).
//
// Fired by DB trigger `trg_founders_welcome` on public.subscriptions
// (AFTER INSERT OR UPDATE OF plan, firing when plan transitions to
// 'founder') via pg_net — migration `founders_welcome_autosend`. Confirms
// permanent Pro, a 15-minute onboarding-call booking link, and the founders'
// WhatsApp group (the join QR is shown in the body).
//
// The email COPY now lives in a PUBLISHED Resend template (alias
// `founder-welcome`), visible and editable in the Resend dashboard
// (Templates) WITHOUT a code deploy. The template HTML embeds the WhatsApp
// QR by URL, pointing at the public `founders-qr` edge function (a hosted
// image renders reliably across mail clients, where inline cid: attachments
// do not). This function only decides WHO/WHEN and fires the template send.
//
// Auth: static `x-fw-key` header (verify_jwt off — pg_net carries no JWT;
// the key lives only in the trigger function and here).
// Never-twice guarantee:
//   1. Claim-then-send row in public.founders_welcome_sends (email PK,
//      ignore-duplicates insert); claim deleted if Resend fails.
//   2. Resend `Idempotency-Key: founders-welcome/<email>`.
// Test mode: { test: true } sends only to the own-address allowlist, with a
// "[TEST] " subject prefix, skipping the claim — previews the real thing
// through the production path.
//
// Request body:  { email: string, test?: boolean }
// Response:      { ok: true, id } | { ok: false, skipped } | { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!RESEND_API_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing env vars for send-founders-welcome');
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FW_KEY = 'fwk_cb6b24c4205c55bcd39ac2d936365d64';

// Test mode can only target the founder's own addresses.
const TEST_ALLOWLIST = new Set([
  'adamdenney33@googlemail.com',
  'adamdenney33@gmail.com',
  'adamdenney33@icloud.com',
  'adam@procabinet.app',
  'admin@bee9.co.uk',
  'studio@bee9.co.uk',
]);

const FROM = 'Adam at ProCabinet <adam@procabinet.app>';
const REPLY_TO = 'adam@procabinet.app';
// Subject lives in the template; kept here only to build the [TEST] prefix.
const SUBJECT = 'Your ProCabinet founder seat';
// Published Resend template — copy + QR embed live there, edit in dashboard.
const TEMPLATE_ID = 'founder-welcome';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** subjectOverride: pass a string to override the template subject (test
 * mode); pass null to let the published template own the subject. */
async function sendViaResend(to: string, subjectOverride: string | null, idemKey: string): Promise<Response> {
  return await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': idemKey,
    },
    body: JSON.stringify({
      from: FROM,
      to,
      reply_to: REPLY_TO,
      template: { id: TEMPLATE_ID },
      ...(subjectOverride ? { subject: subjectOverride } : {}),
    }),
  });
}


Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (req.headers.get('x-fw-key') !== FW_KEY) {
    return json({ error: 'Unauthorised' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const email = String(payload.email ?? '').trim().toLowerCase();
  const isTest = payload.test === true;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Invalid email' }, 400);
  }

  // Test mode: allowlisted recipients, [TEST] prefix, no claim recorded.
  if (isTest) {
    if (!TEST_ALLOWLIST.has(email)) {
      return json({ error: 'Test recipient not in allowlist' }, 403);
    }
    // Unique key per test send so corrected previews are never deduped.
    const res = await sendViaResend(email, `[TEST] ${SUBJECT}`, `founders-welcome-test/${crypto.randomUUID()}`);
    if (res.ok) {
      const data = await res.json();
      return json({ ok: true, id: data.id ?? null, test: true }, 200);
    }
    const detail = await res.text();
    console.error('[send-founders-welcome] test Resend error:', res.status, detail);
    return json({ error: `Resend responded ${res.status}` }, 502);
  }

  // Claim BEFORE sending (insert wins exactly once per email).
  const { data: claimed, error: claimError } = await admin
    .from('founders_welcome_sends')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true })
    .select('email');
  if (claimError) {
    console.error('[send-founders-welcome] claim failed:', claimError.message);
    return json({ error: 'Could not record send state' }, 500);
  }
  if (!claimed || claimed.length === 0) {
    return json({ ok: false, skipped: 'already sent' }, 200);
  }

  try {
    // Stable key for real sends — collapses concurrent duplicate triggers.
    const res = await sendViaResend(email, null, `founders-welcome/${email}`);
    if (res.ok) {
      const data = await res.json();
      await admin.from('founders_welcome_sends')
        .update({ resend_id: data.id ?? null })
        .eq('email', email);
      return json({ ok: true, id: data.id ?? null }, 200);
    }
    const detail = await res.text();
    console.error('[send-founders-welcome] Resend error:', res.status, detail);
    await admin.from('founders_welcome_sends').delete().eq('email', email);
    return json({ error: `Resend responded ${res.status}` }, 502);
  } catch (err) {
    console.error('[send-founders-welcome] Error:', (err as Error).message);
    await admin.from('founders_welcome_sends').delete().eq('email', email);
    return json({ error: (err as Error).message }, 500);
  }
});
