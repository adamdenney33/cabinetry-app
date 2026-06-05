// ProCabinet — customer<->business chat for a shared quote (PUBLIC, token-scoped).
//
// UNAUTHENTICATED. The live-page chat widget lists + posts messages via the
// quote's share_token; the business reads/replies from the Clients tab (RLS).
// Messages are client-scoped (a conversation spans all the client's quotes), so
// we resolve client_id from the quote server-side. Service role; no anon RLS.
//
// DEPLOY NOTE: verify_jwt = false.
// Body: { token, action: 'list' } | { token, action: 'send', body }

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  let token = '', action = 'list', body = '';
  try { const b = await req.json(); token = String(b.token || ''); action = String(b.action || 'list'); body = String(b.body || ''); }
  catch { return jsonResponse({ error: 'Invalid request body' }, 400, cors); }
  if (!token || token.length < 8) return jsonResponse({ error: 'Missing token' }, 400, cors);

  try {
    const { data: quote } = await admin
      .from('quotes').select('id, user_id, client_id').eq('share_token', token).maybeSingle();
    if (!quote) return jsonResponse({ error: 'not_found' }, 404, cors);
    if (!quote.client_id) return jsonResponse({ messages: [], disabled: true }, 200, cors);

    if (action === 'send') {
      const text = body.slice(0, 4000).trim();
      if (!text) return jsonResponse({ error: 'empty' }, 400, cors);
      await admin.from('customer_messages').insert({
        user_id: quote.user_id, client_id: quote.client_id, quote_id: quote.id,
        sender: 'customer', body: text,
      });
      return jsonResponse({ ok: true }, 200, cors);
    }

    // default: list this client's conversation
    const { data: msgs } = await admin
      .from('customer_messages')
      .select('sender, body, created_at')
      .eq('client_id', quote.client_id)
      .order('created_at', { ascending: true });
    // Mark business messages as read by the customer (best-effort).
    await admin.from('customer_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('client_id', quote.client_id).eq('sender', 'business').is('read_at', null);

    return jsonResponse({ messages: msgs ?? [] }, 200, cors);
  } catch (err) {
    console.error('[quote-messages]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
