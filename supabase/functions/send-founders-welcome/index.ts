// ProCabinet — Founders' welcome email, auto-sent on seat purchase (Resend).
//
// Fired by DB trigger `trg_founders_welcome` on public.subscriptions
// (AFTER INSERT OR UPDATE OF plan, firing when plan transitions to
// 'founder') via pg_net — migration `founders_welcome_autosend`. Sends the
// founder-approved welcome (copy synced from the Cowork email-plan
// artifact, 2026-06-13): permanent-Pro confirmation, 15-minute
// onboarding-call booking link, WhatsApp group invite with the QR shown
// in the body.
//
// The QR is shown in the body via a normal <img src> pointing at the
// public `founders-qr` edge function (which serves the PNG). A hosted
// image renders reliably across mail clients, where inline cid:
// attachments do not (Apple Mail/Gmail).
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
const SUBJECT = 'Your ProCabinet founder seat';
const BOOKING_URL = 'https://calendar.app.google/3KU7rrEd8mnUu7599';
const WHATSAPP_URL = 'https://chat.whatsapp.com/H8QI9EHNtJAE1WAlnj2dT0';
// The founders-qr edge function serves the QR PNG; the email embeds it by URL.
const QR_URL = 'https://mhzneruvlfmhnsohfrdo.supabase.co/functions/v1/founders-qr';


// ---- copy (founder-approved 2026-06-13; no merge fields by design) ----

function buildText(): string {
  return [
    'Hello,',
    "Thank you for buying a ProCabinet founder seat. I'm Adam, the builder of the app, and I wanted to welcome you personally.",
    'Your account is now on the Pro plan permanently. Nothing renews and there is nothing to cancel. The $299 is the only payment ProCabinet will ever take from you.',
    'It would be great to meet properly, and also explain the workflow in more detail as well as some of the new features. It would be great to hear about your experience so far and how you plan to use the app. Pick a time here to book in a fifteen-minute call:',
    BOOKING_URL,
    "The seat also includes the founders' WhatsApp group. It's a small group, just me and the other founders, and it has a real say in what gets built next. If the app is missing something your workshop needs, that is the place to tell me. You can join here:",
    WHATSAPP_URL,
    'Thank you again for backing the app this early. It makes a real difference.',
    'Kind regards,\nAdam\nFounder, ProCabinet',
    'ProCabinet.App',
  ].join('\n\n') + '\n';
}

function buildHtml(): string {
  const p = (s: string) => `<p style="margin:0 0 16px">${s}</p>`;
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222;max-width:560px">' +
    p('Hello,') +
    p("Thank you for buying a ProCabinet founder seat. I&#39;m Adam, the builder of the app, and I wanted to welcome you personally.") +
    p('Your account is now on the Pro plan permanently. Nothing renews and there is nothing to cancel. The $299 is the only payment ProCabinet will ever take from you.') +
    p('It would be great to meet properly, and also explain the workflow in more detail as well as some of the new features. It would be great to hear about your experience so far and how you plan to use the app. Pick a time here to book in a fifteen-minute call:') +
    p(`<a href="${BOOKING_URL}">${BOOKING_URL}</a>`) +
    p("The seat also includes the founders&#39; WhatsApp group. It&#39;s a small group, just me and the other founders, and it has a real say in what gets built next. If the app is missing something your workshop needs, that is the place to tell me. You can join here:") +
    p(`<a href="${WHATSAPP_URL}">${WHATSAPP_URL}</a>`) +
    p('Or scan this code with your phone:') +
    p(`<img src="${QR_URL}" alt="Founders WhatsApp group QR code" width="160" height="160" style="width:160px;height:160px;border:1px solid #e4e3df;border-radius:8px">`) +
    p('Thank you again for backing the app this early. It makes a real difference.') +
    '<p style="margin:18px 0 0">Kind regards,<br><b>Adam</b><br><span style="color:#6b6f76;font-size:14px">Founder, ProCabinet</span></p>' +
    '<p style="margin:22px 0 0;font-weight:800;font-size:22px;letter-spacing:-0.5px;line-height:1.2"><a href="https://procabinet.app" style="color:#111111;text-decoration:none">ProCabinet<span style="color:#e8a838">.App</span></a></p>' +
    '</div>';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function sendViaResend(to: string, subject: string, idemKey: string): Promise<Response> {
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
      subject,
      text: buildText(),
      html: buildHtml(),
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
    const res = await sendViaResend(email, SUBJECT, `founders-welcome/${email}`);
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
