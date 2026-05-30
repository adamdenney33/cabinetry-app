// ProCabinet — disconnect a QuickBooks/Xero connection.
//
// Authenticated. Body: { provider }. Revokes the token at the provider
// (best-effort) and deletes the local connection row. verify_jwt: true.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { loadConnection } from '../_shared/connection.ts';
import { decrypt } from '../_shared/crypto.ts';
import { revokeToken, type Provider } from '../_shared/providers.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const uid = auth.user.id;

  let provider: Provider;
  try {
    provider = (await req.json()).provider;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, cors);
  }
  if (provider !== 'quickbooks' && provider !== 'xero') {
    return jsonResponse({ error: 'Unknown provider' }, 400, cors);
  }

  try {
    const conn = await loadConnection(uid, provider);
    if (conn) {
      try {
        const refreshToken = await decrypt(conn.refresh_token_enc);
        await revokeToken(provider, refreshToken);
      } catch (_e) {
        // Best-effort revoke; still delete the local row below.
      }
      const { error } = await admin.from('accounting_connections').delete().eq('id', conn.id);
      if (error) throw new Error(error.message);
    }
    return jsonResponse({ ok: true }, 200, cors);
  } catch (err) {
    console.error('[accounting-disconnect]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
