// Shared CORS helper for the accounting-* edge functions.
// Mirrors the per-origin allowlist used by the Stripe functions
// (supabase/functions/stripe-portal/index.ts) but widens allow-headers to the
// set supabase-js `functions.invoke` sends (apikey, x-client-info), like
// list-subscribe needed.

const ALLOWED_ORIGINS = new Set([
  'https://procabinet.app',
  'http://localhost:3000',
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://procabinet.app';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}

/** JSON Response with CORS + content-type merged in. */
export function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}
