// ProCabinet — server-side Meta CAPI 'CompleteRegistration' (signup).
//
// Two callers, one deduped event (event_id `signup-<user_id>` — also shared
// with the browser pixel in src/analytics.js, so Meta counts the signup once):
//
//   1. The `trg_meta_capi_signup` trigger on auth.users → notify_meta_capi_signup()
//      → pg_net POST { user_id }. The reliability backstop: fires for EVERY
//      signup, including Google OAuth (which skips the email form) and when ad
//      blockers / iOS kill the browser pixel. It only has the user_id, so it
//      matches on hashed email + an fbc reconstructed from the stored fbclid.
//
//   2. _trackSignupConversion() (src/analytics.js) → POST { user_id, fbc, fbp,
//      event_source_url }. Fires for the email/password signup form and lifts
//      match quality with the real _fbc/_fbp cookies + client IP + user-agent
//      (the last two read from request headers below — a DB trigger can't see
//      any of these). When present they override / augment the trigger's data.
//
// Auth model: verify_jwt=false (pg_net can't mint a JWT). Safe because the
// user_id must be a real auth.users UUID (unguessable), the user is looked up
// server-side, and a 1-hour freshness guard makes replays inert.
//
// Env (set via `supabase secrets set`):
//   META_CAPI_ACCESS_TOKEN — Events Manager → pixel → Settings → CAPI token.
//                            Absent → the function no-ops with 200 {skipped}.
//   META_PIXEL_ID          — optional, defaults to the ProCabinet pixel.
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const META_CAPI_ACCESS_TOKEN = Deno.env.get('META_CAPI_ACCESS_TOKEN');
const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') ?? '1913344152250764';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars for meta-capi-signup');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Self-contained CORS (this function is also hit by pg_net, which ignores it):
// allow the app origins so the browser caller's preflight passes.
const ALLOWED_ORIGINS = new Set(['https://procabinet.app', 'http://localhost:3000']);
function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://procabinet.app';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// The end-user IP for CAPI client_ip_address matching. Present on the browser
// caller; null on the pg_net trigger call.
function clientIp(req: Request): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim() || null;
  return req.headers.get('x-real-ip');
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  const json = (status: number, body: Record<string, unknown>): Response =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!META_CAPI_ACCESS_TOKEN) return json(200, { skipped: 'META_CAPI_ACCESS_TOKEN not set' });

  let body: { user_id?: unknown; fbc?: unknown; fbp?: unknown; event_source_url?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }
  const userId = typeof body.user_id === 'string' ? body.user_id : '';
  if (!userId || !UUID_RE.test(userId)) return json(400, { error: 'user_id (uuid) required' });

  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return json(404, { error: 'No such user' });
  const user = data.user;

  // Freshness guard: this endpoint only reports signups, and signups are new.
  const createdMs = user.created_at ? Date.parse(user.created_at) : 0;
  if (!createdMs || Date.now() - createdMs > 60 * 60 * 1000) {
    return json(200, { skipped: 'account older than 1h — not a fresh signup' });
  }

  // First-touch attribution captured by src/main.js → auth.users metadata.
  // Keys (see _ATTR_KEY blob): utm_*, gclid, fbclid, referrer, landing_path.
  const attribution = (user.user_metadata?.attribution ?? {}) as Record<string, unknown>;
  const fbclid = typeof attribution.fbclid === 'string' && attribution.fbclid ? attribution.fbclid : null;
  const landingPath = typeof attribution.landing_path === 'string' && attribution.landing_path
    ? attribution.landing_path
    : '/os';

  // Client-supplied (browser caller) vs reconstructed (trigger caller).
  const clientFbc = typeof body.fbc === 'string' && body.fbc ? body.fbc : null;
  const clientFbp = typeof body.fbp === 'string' && body.fbp ? body.fbp : null;

  const userData: Record<string, unknown> = {};
  if (user.email) userData.em = [await sha256Hex(user.email)];
  // Prefer the real _fbc cookie when the browser sent it; else reconstruct from
  // the stored fbclid (fbc cookie format: fb.1.<creation_time_ms>.<fbclid>).
  if (clientFbc) userData.fbc = clientFbc;
  else if (fbclid) userData.fbc = `fb.1.${createdMs}.${fbclid}`;
  if (clientFbp) userData.fbp = clientFbp;
  const ip = clientIp(req);
  if (ip) userData.client_ip_address = ip;
  const ua = req.headers.get('user-agent');
  if (ua) userData.client_user_agent = ua;
  if (!userData.em && !userData.fbc) return json(200, { skipped: 'no matchable user_data' });

  const eventSourceUrl = typeof body.event_source_url === 'string' && body.event_source_url
    ? body.event_source_url
    : `https://procabinet.app${landingPath.startsWith('/') ? '' : '/'}${landingPath}`;

  const payload = {
    data: [
      {
        event_name: 'CompleteRegistration',
        event_time: Math.floor(createdMs / 1000),
        event_id: `signup-${user.id}`, // dedupes the browser pixel + the two callers
        action_source: 'website',
        event_source_url: eventSourceUrl,
        user_data: userData,
      },
    ],
  };

  const res = await fetch(
    `https://graph.facebook.com/v23.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_ACCESS_TOKEN}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) },
  );
  const out = await res.text();
  if (!res.ok) {
    console.warn(`[meta-capi-signup] CAPI failed: ${res.status} ${out}`);
    return json(502, { error: 'CAPI rejected event' });
  }
  return json(200, { ok: true });
});
