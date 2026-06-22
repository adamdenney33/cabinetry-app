// ProCabinet — emails the signed-in business owner a COPY of a live-link message
// they sent a customer via "Send via messages" (the "Send me a copy" box).
//
// The CUSTOMER email is handled by the customer_messages -> messages-notify
// bridge trigger (every business message emails the client). This function ONLY
// sends the business their own copy, on request — so the customer is never
// double-emailed.
//
// Safe by construction: the recipient is ALWAYS the caller's own business email
// (business_info.email, fallback auth email), resolved server-side from the JWT —
// never from the request body — so it can't be used as an open relay.
//
// Auth: Supabase JWT (deploy WITHOUT --no-verify-jwt).
// Body: { body: string, customerName?: string, ref?: string }
// Response: { ok:true, copy:'sent'|'skipped'|'failed' }

import { admin, authenticateCaller } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY for send-live-link');

const FROM_ADDR = 'messages@procabinet.app';

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escaped, link-ified message body in a simple email shell. */
function bodyHtml(text: string): string {
  const linked = escHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2962d9">$1</a>');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">`
    + `<div style="white-space:pre-wrap;font-size:15px;line-height:1.55;color:#111">${linked}</div></div>`;
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
  const { data: biz } = await admin.from('business_info')
    .select('name, email').eq('user_id', userId).maybeSingle();
  const bizName = (biz?.name || '').trim() || 'Your cabinetmaker';
  let to = (biz?.email || '').trim();
  if (!to) to = (auth.user.email || '').trim();
  if (!to) return jsonResponse({ ok: true, copy: 'skipped' }, 200, cors);

  const who = customerName ? ` to ${customerName}` : '';
  const subject = refLabel ? `Copy: live link sent${who} (${refLabel})` : `Copy: live link you sent${who}`;
  const intro = customerName
    ? `This is your copy of the live link sent to ${customerName}. They got it on their live page and by email.`
    : `This is your copy of the live link you just sent. The customer got it on their live page and by email.`;
  const text = `${intro}\n\n${messageBody}`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `"${bizName.replace(/[\r\n"\\]/g, ' ').slice(0, 80)} (copy) via ProCabinet" <${FROM_ADDR}>`,
        to,
        subject,
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px"><p style="color:#9aa0a6;font-size:12px;margin:0 0 12px">${escHtml(intro)}</p>${bodyHtml(messageBody)}</div>`,
        text,
      }),
    });
    if (res.ok) return jsonResponse({ ok: true, copy: 'sent' }, 200, cors);
    console.error('[send-live-link] Resend error:', res.status, await res.text());
    return jsonResponse({ ok: true, copy: 'failed' }, 200, cors);
  } catch (err) {
    console.error('[send-live-link]', (err as Error).message);
    return jsonResponse({ ok: true, copy: 'failed' }, 200, cors);
  }
});
