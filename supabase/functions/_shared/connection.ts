// Load a connection (service role) and hand back a valid access token,
// refreshing + persisting the rotated refresh token when expired.

import { admin } from './auth.ts';
import { decrypt, encrypt } from './crypto.ts';
import { refreshTokens, type Conn, type Provider } from './providers.ts';

export interface FullConn extends Conn {
  id: number;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string | null;
  org_name: string | null;
  status: string;
}

export async function loadConnection(uid: string, provider: Provider): Promise<FullConn | null> {
  const { data, error } = await admin
    .from('accounting_connections')
    .select('*')
    .eq('user_id', uid)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FullConn | null) ?? null;
}

/**
 * Valid access token for the connection. If the access token is within 60s of
 * expiry (or expired), refresh and persist the rotated tokens — Xero rotates
 * its refresh token on every refresh, so we MUST store the new one.
 */
export async function getValidAccessToken(conn: FullConn): Promise<string> {
  const exp = conn.expires_at ? new Date(conn.expires_at).getTime() : 0;
  if (exp - Date.now() > 60_000) {
    return await decrypt(conn.access_token_enc);
  }
  const refreshToken = await decrypt(conn.refresh_token_enc);
  const tok = await refreshTokens(conn.provider, refreshToken);
  const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
  const { error } = await admin.from('accounting_connections').update({
    access_token_enc: await encrypt(tok.access_token),
    refresh_token_enc: await encrypt(tok.refresh_token ?? refreshToken),
    expires_at: expiresAt,
    status: 'connected',
    updated_at: new Date().toISOString(),
  }).eq('id', conn.id);
  if (error) throw new Error(error.message);
  return tok.access_token;
}
