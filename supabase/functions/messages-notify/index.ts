// ProCabinet — outbound half of the email ↔ messages bridge.
//
// Fired by the DB trigger `trg_message_notify` on public.customer_messages
// (AFTER INSERT, via pg_net) — migration `email_message_bridge`. For each new
// chat row it emails the OPPOSITE party via Resend, with a reply-to that routes
// their reply back to this client's thread:
//   • sender='business' → email the client  (reply_to c-<token>@reply.procabinet.app)
//   • sender='customer' → email the owner   (reply_to b-<token>@reply.procabinet.app)
// where <token> = clients.reply_token (dashes stripped). The c-/b- prefix tells
// messages-inbound which sender a reply belongs to.
//
// Auth: static `x-msg-key` header (pg_net carries no JWT; the key lives only in
// the trigger function and here). DEPLOY NOTE: verify_jwt = false.
// Idempotency: claim-flip customer_messages.outbound_status null→'sending'
// (only one caller wins) + Resend `Idempotency-Key: msg-out/<id>`.
//
// Request body: { message_id: number }
// Response:     { ok:true, id } | { ok:true, skipped } | { error }

import { admin } from '../_shared/auth.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY for messages-notify');

const MSG_KEY = 'msgk_6556e754c6a6e6714b1091a794cd8e37';
const REPLY_DOMAIN = 'reply.procabinet.app';
const FROM_ADDR = 'messages@procabinet.app';
// Distinctive marker placed at the TOP of every outbound email. When the other
// party replies, their client quotes our whole email below their new text;
// messages-inbound cuts everything from this line down. Keep in sync there.
const REPLY_MARKER = '--- Please reply above this line ---';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function escHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Strip characters that would break an RFC 5322 display name, then quote it. */
function fromHeader(name: string): string {
  const clean = (name || '').replace(/[\r\n"\\]/g, ' ').trim().slice(0, 80) || 'ProCabinet';
  return `"${clean} via ProCabinet" <${FROM_ADDR}>`;
}

async function setStatus(id: number, status: string, emailId?: string): Promise<void> {
  const patch: Record<string, unknown> = { outbound_status: status };
  if (emailId) patch.outbound_email_id = emailId;
  await admin.from('customer_messages').update(patch).eq('id', id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (req.headers.get('x-msg-key') !== MSG_KEY) return json({ error: 'Unauthorised' }, 401);

  let messageId = 0;
  try { messageId = Number((await req.json()).message_id); } catch { return json({ error: 'Invalid JSON body' }, 400); }
  if (!messageId) return json({ error: 'Missing message_id' }, 400);

  try {
    const { data: msg } = await admin
      .from('customer_messages')
      .select('id, user_id, client_id, sender, body, via, outbound_status')
      .eq('id', messageId).maybeSingle();
    if (!msg) return json({ ok: true, skipped: 'not_found' }, 200);
    if (msg.via === 'email') return json({ ok: true, skipped: 'inbound_row' }, 200);

    // Claim: only the caller that flips null→'sending' proceeds (collapses
    // duplicate trigger fires; a second concurrent call gets zero rows).
    const { data: claimed } = await admin.from('customer_messages')
      .update({ outbound_status: 'sending' })
      .eq('id', messageId).is('outbound_status', null)
      .select('id');
    if (!claimed || claimed.length === 0) return json({ ok: true, skipped: 'already_handled' }, 200);

    // Resolve the two parties.
    const { data: client } = await admin.from('clients')
      .select('name, email, reply_token').eq('id', msg.client_id).maybeSingle();
    const { data: biz } = await admin.from('business_info')
      .select('name, email').eq('user_id', msg.user_id).maybeSingle();

    let to = '';
    let role: 'c' | 'b';
    let fromName: string;
    if (msg.sender === 'business') {
      // Notify the customer; they reply as the customer.
      to = (client?.email || '').trim();
      role = 'c';
      fromName = biz?.name || 'Your cabinetmaker';
    } else {
      // Notify the business owner; they reply as the business.
      to = (biz?.email || '').trim();
      if (!to) {
        const { data } = await admin.auth.admin.getUserById(msg.user_id);
        to = (data.user?.email || '').trim();
      }
      role = 'b';
      fromName = client?.name || 'Your customer';
    }

    if (!to) { await setStatus(messageId, 'skipped'); return json({ ok: true, skipped: 'no_recipient' }, 200); }

    const token = String(client?.reply_token || '').replace(/-/g, '');
    if (!token) { await setStatus(messageId, 'skipped'); return json({ ok: true, skipped: 'no_token' }, 200); }
    const replyTo = `${role}-${token}@${REPLY_DOMAIN}`;
    // Stable per-thread reference so inboxes group the conversation.
    const threadRef = `<pcb-thread-${msg.client_id}@procabinet.app>`;
    const subject = `New message from ${fromName}`;
    const bodyText = String(msg.body || '');

    const html =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px 4px">`
      + `<p style="color:#9aa0a6;font-size:12px;margin:0 0 12px">${REPLY_MARKER}</p>`
      + `<div style="white-space:pre-wrap;font-size:15px;line-height:1.55;color:#111">${escHtml(bodyText)}</div>`
      + `<hr style="border:none;border-top:1px solid #e6e6e6;margin:20px 0">`
      + `<p style="color:#9aa0a6;font-size:12px;margin:0">Reply directly to this email to respond — your message goes straight to ${escHtml(fromName)} in <a href="https://procabinet.app" style="color:#9aa0a6">ProCabinet</a>.</p>`
      + `</div>`;
    const text = `${REPLY_MARKER}\n\n${bodyText}\n\n—\nReply directly to this email to respond. Sent via ProCabinet.`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
        'idempotency-key': `msg-out/${messageId}`,
      },
      body: JSON.stringify({
        from: fromHeader(fromName),
        to,
        reply_to: replyTo,
        subject,
        html,
        text,
        headers: { 'References': threadRef, 'In-Reply-To': threadRef },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      await setStatus(messageId, 'sent', data.id ?? undefined);
      return json({ ok: true, id: data.id ?? null }, 200);
    }
    const detail = await res.text();
    console.error('[messages-notify] Resend error:', res.status, detail);
    await setStatus(messageId, 'failed');
    return json({ error: `Resend responded ${res.status}` }, 502);
  } catch (err) {
    console.error('[messages-notify]', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
