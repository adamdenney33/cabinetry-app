// ProCabinet — accounting OAuth start.
//
// Authenticated. Body: { provider: 'quickbooks' | 'xero' }. Returns { url } —
// the provider's authorize URL with a signed `state`. The frontend redirects
// the browser there. The client secret never leaves the server.
//
// Required env: ACCOUNTING_STATE_SECRET, QBO_CLIENT_ID / XERO_CLIENT_ID (+ the
// matching secrets used later by the callback), SUPABASE_URL/SERVICE_ROLE_KEY.
// verify_jwt: true.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateCaller } from '../_shared/auth.ts';
import { signState } from '../_shared/crypto.ts';
import { buildAuthorizeUrl, CFG, type Provider } from '../_shared/providers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/accounting-oauth-callback`;

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;

  let provider: Provider;
  try {
    const body = await req.json();
    provider = body.provider;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, cors);
  }
  if (provider !== 'quickbooks' && provider !== 'xero') {
    return jsonResponse({ error: 'Unknown provider' }, 400, cors);
  }
  if (!CFG[provider].clientId()) {
    return jsonResponse({ error: `${provider} integration is not configured` }, 503, cors);
  }

  try {
    const state = await signState({ uid: auth.user.id, provider, t: Date.now() });
    const url = buildAuthorizeUrl(provider, REDIRECT_URI, state);
    return jsonResponse({ url }, 200, cors);
  } catch (err) {
    console.error('[accounting-oauth-start]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
