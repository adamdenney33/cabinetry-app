// Shared auth + service-role client for the accounting-* edge functions.
//
// `admin` is the service-role Supabase client (bypasses RLS) used to read/write
// the encrypted token rows and to load order/line/client data server-side.
// `authenticateCaller` verifies the caller's Supabase JWT from the
// Authorization header — the same block the Stripe functions inline.

import {
  createClient,
  type SupabaseClient,
  type User,
} from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from './cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
}

// Service-role client — bypasses RLS. Never expose this key to the client.
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Verify the caller's Supabase JWT. Returns `{ user }` on success, or a ready
 * 401 `Response` (CORS-merged) to return directly.
 */
export async function authenticateCaller(
  req: Request,
  cors: Record<string, string>,
): Promise<{ user: User } | { error: Response }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return { error: jsonResponse({ error: 'Not authenticated' }, 401, cors) };
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    return { error: jsonResponse({ error: 'Invalid auth token' }, 401, cors) };
  }
  return { user };
}
