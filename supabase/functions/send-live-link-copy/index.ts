// ProCabinet — emails the signed-in business owner a COPY of a live-link
// message they just sent a customer via "Send via messages" (livelink.js).
//
// Flow: the business opens the Live link tab → "Send via messages" → ticks
// "Send me a copy". The client first posts the chat message (the
// customer_messages → messages-notify bridge emails THAT to the customer), then
// calls this function so the same text also lands in the BUSINESS's own inbox.
// The customer email is handled by the bridge — this function only does the copy.
//
// Safe by construction: the recipient is ALWAYS the authenticated caller's own
// business email (business_info.email, fallback auth email) — never an address
// taken from the request body — so it can't be used as an open relay.
//
// Auth: Supabase JWT (deploy WITHOUT --no-verify-jwt; the client sends the
// user's access token, same as the connect-* / accounting-* functions).
// Request body: { body: string, customerName?: string, ref?: string }
// Response:     { ok:true, id } | { ok:true, skipped } | { error }

import { admin, authenticateCaller } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY for send-live-link-copy');

const FROM_ADDR = 'messages@procabinet.app';

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Strip characters that would break an RFC 5322 display name, then quote it. */
function fromHeader(name: string): string {
  const clean = (name || '').replace(/[\r\n"\\]/g, ' ').trim().slice(0, 80) || 'ProCabinet';
  return `"${clean} via ProCabinet" <${FROM_ADDR}>`;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const userId = auth.user.id;

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400, cors); }

  const messageBody = String(payload.body ?? '').trim().slice(0, 5000);
  if (!messageBody) return jsonResponse({ error: 'Empty body' }, 400, cors);
  const customerName = String(payload.customerName ?? '').trim().slice(0, 120);
  const refLabel = String(payload.ref ?? '').trim().slice(0, 60);

  // Recipient = the caller's OWN business email (never from the request body).
  const { data: biz } = await admin.from('business_info').select('name, email').eq('user_id', userId).maybeSingle();
  let to = (biz?.email || '').trim();
  if (!to) to = (auth.user.email || '').trim();
  if (!to) return jsonResponse({ ok: true, skipped: 'no_business_email' }, 200, cors);

  const who = customerName ? ` to ${customerName}` : '';
  const subject = refLabel ? `Copy: live link sent${who} (${refLabel})` : `Copy: live link you sent${who}`;
  const intro = customerName
    ? `This is your copy of the live link message sent to ${customerName}. They received it on their live page and by email.`
    : `This is your copy of the live link message you just sent. The customer received it on their live page and by email.`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">`
    + `<p style="color:#9aa0a6;font-size:12px;margin:0 0 12px">${escHtml(intro)}</p>`
    + `<div style="white-space:pre-wrap;font-size:15px;line-height:1.55;color:#111">${escHtml(messageBody)}</div>`
    + `</div>`;
  const text = `${intro}\n\n${messageBody}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: fromHeader(biz?.name || ''), to, subject, html, text }),
    });
    if (res.ok) {
      const data = await res.json();
      return jsonResponse({ ok: true, id: data.id ?? null }, 200, cors);
    }
    const detail = await res.text();
    console.error('[send-live-link-copy] Resend error:', res.status, detail);
    return jsonResponse({ error: `Resend responded ${res.status}` }, 502, cors);
  } catch (err) {
    console.error('[send-live-link-copy]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
