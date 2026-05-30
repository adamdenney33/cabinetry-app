// ProCabinet — accounting OAuth callback (the provider redirect URI).
//
// Public endpoint — hit by QuickBooks/Xero on the browser redirect, with no
// Supabase JWT. Security comes from the HMAC-signed `state` (proves which user
// started the flow) + the one-time authorization `code`. MUST be deployed with
// verify_jwt = false (same treatment as stripe-webhook).
//
// Single redirect URI for both providers — disambiguated via `state`. Register
//   https://<ref>.supabase.co/functions/v1/accounting-oauth-callback
// in both the Intuit and Xero developer apps.
//
// Required env: ACCOUNTING_STATE_SECRET, ACCOUNTING_TOKEN_KEY, APP_URL,
//   QBO_CLIENT_ID/SECRET, XERO_CLIENT_ID/SECRET, SUPABASE_URL/SERVICE_ROLE_KEY.

import { admin } from '../_shared/auth.ts';
import { encrypt, verifyState } from '../_shared/crypto.ts';
import {
  exchangeCode,
  fetchQboCompanyName,
  fetchXeroConnections,
  pickDefaultTaxCode,
  type Conn,
  type Provider,
} from '../_shared/providers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const APP_URL = Deno.env.get('APP_URL') ?? 'https://procabinet.app';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/accounting-oauth-callback`;
const STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 min

function back(status: 'connected' | 'error', provider?: string): Response {
  const q = new URLSearchParams({ accounting: status });
  if (provider) q.set('provider', provider);
  return new Response(null, { status: 302, headers: { location: `${APP_URL}/os?${q.toString()}` } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const qp = url.searchParams;

  // User denied consent, or the provider returned an error.
  if (qp.get('error')) return back('error');

  const code = qp.get('code');
  const stateRaw = qp.get('state');
  if (!code || !stateRaw) return back('error');

  const state = await verifyState(stateRaw);
  if (!state) return back('error');
  const uid = state.uid as string;
  const provider = state.provider as Provider;
  const startedAt = Number(state.t) || 0;
  if (!uid || (provider !== 'quickbooks' && provider !== 'xero')) return back('error');
  if (Date.now() - startedAt > STATE_MAX_AGE_MS) return back('error', provider);

  try {
    const tok = await exchangeCode(provider, code, REDIRECT_URI);

    let realmId: string | null = null;
    let tenantId: string | null = null;
    let orgName: string | null = null;

    if (provider === 'xero') {
      const conns = await fetchXeroConnections(tok.access_token);
      if (conns.length === 0) return back('error', provider);
      tenantId = conns[0].tenantId;
      orgName = conns[0].tenantName ?? null;
    } else {
      realmId = qp.get('realmId');
      if (!realmId) return back('error', provider);
      orgName = await fetchQboCompanyName(tok.access_token, realmId);
    }

    const conn: Conn = { provider, realm_id: realmId, tenant_id: tenantId, default_tax_code: null };
    let defaultTaxCode: string | null = null;
    try {
      defaultTaxCode = await pickDefaultTaxCode(provider, conn, tok.access_token);
    } catch (_e) {
      // Non-fatal — the user can still push; tax defaults to no-tax until set.
    }

    const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

    const { error } = await admin.from('accounting_connections').upsert({
      user_id: uid,
      provider,
      access_token_enc: await encrypt(tok.access_token),
      refresh_token_enc: await encrypt(tok.refresh_token),
      expires_at: expiresAt,
      realm_id: realmId,
      tenant_id: tenantId,
      org_name: orgName,
      default_tax_code: defaultTaxCode,
      status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (error) throw new Error(error.message);

    return back('connected', provider);
  } catch (err) {
    console.error('[accounting-oauth-callback]', (err as Error).message);
    return back('error', provider);
  }
});
