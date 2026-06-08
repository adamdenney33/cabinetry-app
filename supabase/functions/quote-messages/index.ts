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
    // Resolve the token against quotes first, then orders. Both share the
    // client-scoped conversation; tag the customer's row with whichever posted.
    let dealKind: 'quote' | 'order' = 'quote';
    let deal = (await admin
      .from('quotes').select('id, user_id, client_id').eq('share_token', token).maybeSingle()).data as
      { id: number; user_id: string; client_id: number | null } | null;
    if (!deal) {
      const { data: o } = await admin
        .from('orders').select('id, user_id, client_id').eq('share_token', token).maybeSingle();
      if (o) { deal = o; dealKind = 'order'; }
    }
    if (!deal) return jsonResponse({ error: 'not_found' }, 404, cors);
    if (!deal.client_id) return jsonResponse({ messages: [], disabled: true }, 200, cors);

    if (action === 'send') {
      const text = body.slice(0, 4000).trim();
      if (!text) return jsonResponse({ error: 'empty' }, 400, cors);
      const row: Record<string, unknown> = {
        user_id: deal.user_id, client_id: deal.client_id, sender: 'customer', body: text,
      };
      if (dealKind === 'order') row.order_id = deal.id; else row.quote_id = deal.id;
      await admin.from('customer_messages').insert(row);
      return jsonResponse({ ok: true }, 200, cors);
    }

    // default: list this client's conversation
    const { data: msgs } = await admin
      .from('customer_messages')
      .select('sender, body, created_at')
      .eq('client_id', deal.client_id)
      .order('created_at', { ascending: true });
    // Mark business messages as read by the customer (best-effort).
    await admin.from('customer_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('client_id', deal.client_id).eq('sender', 'business').is('read_at', null);

    return jsonResponse({ messages: msgs ?? [] }, 200, cors);
  } catch (err) {
    console.error('[quote-messages]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
