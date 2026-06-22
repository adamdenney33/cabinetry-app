// ProCabinet — server-side sender for the Live link "Send via messages" flow.
//
// "Send via messages" (livelink.js) emails the customer their live link directly.
// The email↔messages bridge (customer_messages.via / outbound_status + the
// trg_message_notify trigger) is NOT applied in production, so posting a chat
// row alone never emails anyone. The chat row is still inserted client-side so
// the link also appears on the customer's live page (quote-messages list); THIS
// function does the actual email(s):
//   • always: email the customer (the client's email), reply-to the business
//   • optional: a copy to the business ("Send me a copy")
//
// Safe by construction: recipients are resolved SERVER-SIDE — the customer must
// be one of the caller's OWN clients (clients.user_id = caller) and the copy
// goes to the caller's OWN business email. Nothing is taken from arbitrary
// address fields in the body, so it can't be used as an open relay.
//
// Auth: Supabase JWT (deploy WITHOUT --no-verify-jwt; the client sends the
// user's access token, like the connect-* / accounting-* functions).
// Body: { client_id: number, body: string, ref?: string, copyToBusiness?: boolean }
// Response: { ok:true, customer:'sent'|'skipped'|'failed', copy?:'sent'|'skipped'|'failed' }

import { admin, authenticateCaller } from '../_shared/auth.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY for send-live-link');

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

/** Escaped, link-ified message in a simple email shell. URLs become anchors so
 *  the customer can click straight through (auto-linkify isn't universal). */
function bodyHtml(text: string): string {
  const linked = escHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2962d9">$1</a>');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">`
    + `<div style="white-space:pre-wrap;font-size:15px;line-height:1.55;color:#111">${linked}</div></div>`;
}

async function sendEmail(opts: { to: string; fromName: string; replyTo?: string; subject: string; text: string }): Promise<'sent' | 'failed'> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'authorization': `Bearer ${RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: fromHeader(opts.fromName),
      to: opts.to,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      subject: opts.subject,
      html: bodyHtml(opts.text),
      text: opts.text,
    }),
  });
  if (res.ok) return 'sent';
  console.error('[send-live-link] Resend error:', res.status, await res.text());
  return 'failed';
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

  const clientId = Number(payload.client_id);
  const messageBody = String(payload.body ?? '').trim().slice(0, 5000);
  const refLabel = String(payload.ref ?? '').trim().slice(0, 60);
  const copyToBusiness = payload.copyToBusiness === true;
  if (!clientId || !messageBody) return jsonResponse({ error: 'Missing client_id or body' }, 400, cors);

  // Resolve recipients server-side. The client MUST belong to the caller.
  const { data: client } = await admin.from('clients')
    .select('name, email').eq('id', clientId).eq('user_id', userId).maybeSingle();
  if (!client) return jsonResponse({ error: 'Client not found' }, 404, cors);
  const { data: biz } = await admin.from('business_info')
    .select('name, email').eq('user_id', userId).maybeSingle();
  const bizName = (biz?.name || '').trim() || 'Your cabinetmaker';
  const bizEmail = ((biz?.email || '').trim() || (auth.user.email || '').trim());

  const subject = refLabel ? `Your ${refLabel} from ${bizName}` : `A message from ${bizName}`;

  // 1) Customer email — reply-to the business so replies reach them directly.
  const custEmail = (client.email || '').trim();
  const customer = !custEmail
    ? 'skipped'
    : await sendEmail({ to: custEmail, fromName: bizName, replyTo: bizEmail || undefined, subject, text: messageBody });

  // 2) Optional copy to the business's own inbox.
  let copy: string | undefined;
  if (copyToBusiness) {
    if (!bizEmail) copy = 'skipped';
    else {
      const who = client.name ? ` to ${client.name}` : '';
      const intro = client.name
        ? `This is your copy of the live link sent to ${client.name}.`
        : `This is your copy of the live link you sent.`;
      copy = await sendEmail({
        to: bizEmail,
        fromName: `${bizName} (copy)`,
        subject: refLabel ? `Copy: live link sent${who} (${refLabel})` : `Copy: live link you sent${who}`,
        text: `${intro}\n\n${messageBody}`,
      });
    }
  }

  return jsonResponse({ ok: true, customer, ...(copy ? { copy } : {}) }, 200, cors);
});
