// ProCabinet — Google Calendar OAuth (GC.2). One function, three routes:
//
//   POST {action:'start'}      (authed)  → { url } — Google's consent URL with
//                                          a signed HMAC `state`.
//   GET  ?code=&state=         (public)  → the OAuth redirect URI: verifies
//                                          state, exchanges the code, stores
//                                          encrypted tokens, 302 → /os?gcal=…
//   POST {action:'disconnect'} (authed)  → best-effort token revoke + row delete.
//
// MUST be deployed with verify_jwt = false (the GET callback carries no JWT);
// the POST routes authenticate manually via authenticateCaller — the same
// treatment as accounting-oauth-callback.
//
// Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ACCOUNTING_TOKEN_KEY,
// ACCOUNTING_STATE_SECRET (shared crypto keys), APP_URL,
// SUPABASE_URL/SERVICE_ROLE_KEY.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { decrypt, encrypt, signState, verifyState } from '../_shared/crypto.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'https://procabinet.app';
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
// The registered redirect URI is a Cloudflare Pages Function on the app's own
// domain (functions/api/gcal-callback.js) that proxies the callback here —
// Google shows (and brand verification requires ownership of) the redirect
// URI's domain, and *.supabase.co can't be claimed in Search Console. Must
// match the Google client's Authorised redirect URIs exactly, in both the
// consent URL and the code exchange.
const REDIRECT_URI = Deno.env.get('GCAL_REDIRECT_URI') ?? `${APP_URL}/api/gcal-callback`;
// calendar.events    — read/write events (sync core)
// calendarlist.readonly — list the user's calendars for the overlay picker
//   (GC.7). Grants added to the consent screen's Data access config too.
const SCOPE = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const STATE_MAX_AGE_MS = 15 * 60 * 1000;

function back(status: 'connected' | 'error'): Response {
  return new Response(null, {
    status: 302,
    headers: { location: `${APP_URL}/os?gcal=${status}` },
  });
}

async function handleCallback(qp: URLSearchParams): Promise<Response> {
  if (qp.get('error')) return back('error'); // user denied consent
  const code = qp.get('code');
  const stateRaw = qp.get('state');
  if (!code || !stateRaw) return back('error');

  const state = await verifyState(stateRaw);
  if (!state) return back('error');
  const uid = state.uid as string;
  const startedAt = Number(state.t) || 0;
  if (!uid || Date.now() - startedAt > STATE_MAX_AGE_MS) return back('error');

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tok = await res.json();
    if (!res.ok || !tok.access_token) {
      console.error('[gcal-oauth] code exchange failed:', JSON.stringify(tok));
      return back('error');
    }

    // Best-effort display label: the primary calendar's id is the account
    // email. calendar.events scope usually permits calendars.get on events'
    // parents; if Google says no, the label just stays null.
    let email: string | null = null;
    try {
      const cal = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
        headers: { authorization: `Bearer ${tok.access_token}` },
      });
      if (cal.ok) email = (await cal.json()).id ?? null;
    } catch (_e) { /* non-fatal */ }

    // Google only returns refresh_token on the first consent (we force it with
    // prompt=consent, but keep the existing one if a re-connect omits it).
    const patch: Record<string, unknown> = {
      user_id: uid,
      calendar_id: 'primary',
      google_email: email,
      access_token_enc: await encrypt(tok.access_token),
      expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (tok.refresh_token) patch.refresh_token_enc = await encrypt(tok.refresh_token);

    const { error } = await admin.from('gcal_connections').upsert(patch, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    return back('connected');
  } catch (err) {
    console.error('[gcal-oauth]', (err as Error).message);
    return back('error');
  }
}

/** Fresh access token for the caller's connection (refreshing + persisting
 *  when <2 min of life left). Throws 'not_connected' / 'refresh_failed:…'. */
async function freshAccessToken(uid: string): Promise<string> {
  const { data: conn } = await admin.from('gcal_connections')
    .select('access_token_enc,refresh_token_enc,expires_at,status')
    .eq('user_id', uid).maybeSingle();
  if (!conn || conn.status !== 'connected' || !conn.refresh_token_enc) throw new Error('not_connected');
  const expMs = conn.expires_at ? Date.parse(conn.expires_at) || 0 : 0;
  if (conn.access_token_enc && expMs - Date.now() > 120_000) {
    return await decrypt(conn.access_token_enc);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: await decrypt(conn.refresh_token_enc),
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.access_token) throw new Error(`refresh_failed:${tok.error ?? res.status}`);
  await admin.from('gcal_connections').update({
    access_token_enc: await encrypt(tok.access_token),
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', uid);
  return tok.access_token as string;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') return handleCallback(url.searchParams);

  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;

  let body: any = {};
  try { body = await req.json(); } catch { /* fall through */ }
  const action = body.action ?? '';

  if (action === 'start') {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      return jsonResponse({ error: 'Google Calendar integration is not configured' }, 503, cors);
    }
    const state = await signState({ uid: auth.user.id, t: Date.now() });
    const q = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return jsonResponse({ url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` }, 200, cors);
  }

  // GC.7 — list the user's calendars for the overlay picker.
  if (action === 'calendars') {
    try {
      const token = await freshAccessToken(auth.user.id);
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=100',
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (res.status === 403) {
        // Grant predates the calendarlist.readonly scope → user must reconnect.
        return jsonResponse({ needsReconnect: true }, 200, cors);
      }
      if (!res.ok) throw new Error(`calendarlist_failed:${res.status}`);
      const body = await res.json();
      const calendars = (body.items ?? [])
        .filter((c: any) => c && c.id && !c.deleted)
        .map((c: any) => ({
          // Normalise the primary calendar's id to the literal 'primary' so the
          // sync never double-reads it under its email id.
          id: c.primary ? 'primary' : String(c.id),
          summary: String(c.summaryOverride || c.summary || c.id),
          primary: !!c.primary,
          color: c.backgroundColor || null,
        }));
      const { data: conn } = await admin.from('gcal_connections')
        .select('selected_calendars').eq('user_id', auth.user.id).maybeSingle();
      const selected = Array.isArray(conn?.selected_calendars)
        ? (conn!.selected_calendars as { id: string }[]).map((s) => s.id)
        : ['primary'];
      return jsonResponse({ calendars, selected }, 200, cors);
    } catch (err) {
      const msg = (err as Error).message;
      console.error('[gcal-oauth] calendars:', msg);
      if (msg === 'not_connected') return jsonResponse({ connected: false }, 200, cors);
      if (msg.startsWith('refresh_failed:invalid_grant')) return jsonResponse({ needsReconnect: true }, 200, cors);
      return jsonResponse({ error: msg }, 500, cors);
    }
  }

  // GC.7 — persist the picker selection ([{id, summary}], max 25).
  if (action === 'set-calendars') {
    try {
      const list: unknown = body.calendars;
      if (!Array.isArray(list)) return jsonResponse({ error: 'calendars must be an array' }, 400, cors);
      const clean = list.slice(0, 25)
        .filter((c: any) => c && typeof c.id === 'string' && c.id.length < 256)
        .map((c: any) => ({ id: c.id, summary: String(c.summary ?? '').slice(0, 120) }));
      const { error } = await admin.from('gcal_connections')
        .update({ selected_calendars: clean, updated_at: new Date().toISOString() })
        .eq('user_id', auth.user.id);
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true, selected: clean.map((c) => c.id) }, 200, cors);
    } catch (err) {
      console.error('[gcal-oauth] set-calendars:', (err as Error).message);
      return jsonResponse({ error: (err as Error).message }, 500, cors);
    }
  }

  if (action === 'disconnect') {
    try {
      const { data: row } = await admin.from('gcal_connections')
        .select('refresh_token_enc').eq('user_id', auth.user.id).maybeSingle();
      if (row?.refresh_token_enc) {
        // Best-effort revoke; the row delete is what matters.
        try {
          const rt = await decrypt(row.refresh_token_enc);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, { method: 'POST' });
        } catch (_e) { /* non-fatal */ }
      }
      const { error } = await admin.from('gcal_connections').delete().eq('user_id', auth.user.id);
      if (error) throw new Error(error.message);
      return jsonResponse({ ok: true }, 200, cors);
    } catch (err) {
      console.error('[gcal-oauth] disconnect:', (err as Error).message);
      return jsonResponse({ error: (err as Error).message }, 500, cors);
    }
  }

  return jsonResponse({ error: 'Unknown action' }, 400, cors);
});
