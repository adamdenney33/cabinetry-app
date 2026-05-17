// ProCabinet — Mailing-list subscribe (Resend Audiences).
//
// Called by the authenticated client (with a Supabase JWT) the first time a
// user lands in the app after confirming their email. Adds the user to the
// configured Resend audience — but only if they ticked the marketing opt-in
// checkbox at signup, recorded in their Supabase user_metadata as
// `marketing_opt_in`.
//
// The Resend API key lives only here; it is never shipped to the browser.
// The client writes a localStorage flag so it normally calls this once per
// user — but the endpoint is safe to call repeatedly: a contact already in
// the audience is treated as success.
//
// Required env vars (set via `supabase secrets set`):
//   RESEND_API_KEY             — re_...
//   RESEND_AUDIENCE_ID         — the Resend Audience id (UUID)
//   SUPABASE_URL               — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY  — auto-provided
//
// Request body: (none required)
// Response:     { ok: true }                    — added, or already a member
//               { ok: false, skipped: string }  — nothing to do (no opt-in etc.)
//               { error: string }               — failure

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_AUDIENCE_ID = Deno.env.get('RESEND_AUDIENCE_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!RESEND_API_KEY || !RESEND_AUDIENCE_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env vars for list-subscribe function');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ALLOWED_ORIGINS = new Set([
  'https://procabinet.app',
  'http://localhost:3000',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://procabinet.app';
  return {
    'access-control-allow-origin': allowed,
    // supabase-js functions.invoke() sends apikey + x-client-info too — all
    // four must be allowed or the browser blocks the preflight.
    'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return json({ error: 'Not authenticated' }, 401);
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid auth token' }, 401);
  }

  // The server is the authority on consent — never add someone who did not
  // opt in, even if a client somehow calls this endpoint directly.
  if (!user.email) {
    return json({ error: 'User has no email address' }, 400);
  }
  if (!user.email_confirmed_at) {
    return json({ ok: false, skipped: 'email not confirmed' }, 200);
  }
  if (user.user_metadata?.marketing_opt_in !== true) {
    return json({ ok: false, skipped: 'no marketing opt-in' }, 200);
  }

  try {
    const res = await fetch(
      `https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`,
      {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email: user.email, unsubscribed: false }),
      },
    );

    if (res.ok) {
      return json({ ok: true }, 200);
    }

    // A contact already in the audience is a success for our purposes.
    const detail = await res.text();
    if (/already|exists|duplicate/i.test(detail)) {
      return json({ ok: true, note: 'already subscribed' }, 200);
    }
    console.error('[list-subscribe] Resend error:', res.status, detail);
    return json({ error: `Resend responded ${res.status}` }, 502);
  } catch (err) {
    console.error('[list-subscribe] Error:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
