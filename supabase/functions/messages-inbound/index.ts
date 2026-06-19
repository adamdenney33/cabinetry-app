// ProCabinet — inbound half of the email ↔ messages bridge (Resend webhook).
//
// Receives Resend webhook events on the catch-all subdomain reply.procabinet.app:
//   • email.received  → a reply to c-<token>@ / b-<token>@reply.procabinet.app.
//       Parse it, attribute the sender, strip the quoted history, and insert it
//       back into customer_messages with via='email' (so it shows in-app and the
//       notify trigger SKIPS it → no loop).
//   • email.delivered / bounced / complained → update the matching outbound
//       customer_messages.outbound_status (delivery tracking).
//
// The webhook payload is METADATA ONLY — the body/headers are fetched from
// Resend's received-email API (GET /emails/receiving/{email_id}).
//
// Auth: Svix signature verification on the RAW body vs RESEND_WEBHOOK_SECRET.
// DEPLOY NOTE: verify_jwt = false. Returns 200 on every drop/skip so Resend
// stops retrying; non-2xx only for signature failure or a transient fetch error.
//
// Sender attribution: the c-/b- prefix sets the sender role; the From address is
// then matched against the party on file — a match marks email_verified=true,
// a mismatch is still ACCEPTED but flagged email_verified=false (per product
// decision: the reply-to token is a delivered secret, so the reply is almost
// certainly legitimate; the match just upgrades trust).

import { admin } from '../_shared/auth.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const WEBHOOK_SECRET = Deno.env.get('RESEND_WEBHOOK_SECRET');
if (!RESEND_API_KEY) throw new Error('Missing RESEND_API_KEY for messages-inbound');

const REPLY_DOMAIN = 'reply.procabinet.app';
const TOKEN_RE = new RegExp(`^([cb])-([0-9a-f]{32})@${REPLY_DOMAIN.replace(/\./g, '\\.')}$`, 'i');
const MAX_BODY = 4000;
const RATE_MAX = 12;          // inbound emails per client per window
const RATE_WINDOW_MS = 60_000;

// ── helpers ──────────────────────────────────────────────────────────────────
function text200(msg: string): Response { return new Response(msg, { status: 200 }); }

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a Svix-signed webhook (Resend uses Svix). */
async function verifySvix(rawBody: string, headers: Headers): Promise<boolean> {
  if (!WEBHOOK_SECRET) return false;
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;
  const secret = WEBHOOK_SECRET.startsWith('whsec_') ? WEBHOOK_SECRET.slice(6) : WEBHOOK_SECRET;
  const key = await crypto.subtle.importKey('raw', b64decode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`)));
  const expected = b64encode(sig);
  // Header is a space-separated list of "v1,<base64sig>".
  return sigHeader.split(' ').some((part) => {
    const comma = part.indexOf(',');
    const val = comma >= 0 ? part.slice(comma + 1) : part;
    return timingSafeEqual(val, expected);
  });
}

function parseAddr(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object') {
    const o = raw as { address?: string; email?: string };
    raw = o.address || o.email || '';
  }
  const s = String(raw);
  const m = s.match(/<([^>]+)>/);          // "Name <addr>" → addr
  return (m ? m[1] : s).trim().toLowerCase();
}
/** Flatten to/cc/bcc which may be a string or array of strings/objects. */
function addrList(v: unknown): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v]).map(parseAddr).filter(Boolean);
}
function hexToUuid(h: string): string {
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Lowercase header map from Resend's headers field (object or [{name,value}]). */
function headerMap(h: unknown): Record<string, string> {
  const map: Record<string, string> = {};
  if (Array.isArray(h)) {
    for (const e of h) { const k = (e?.name ?? '').toLowerCase(); if (k) map[k] = String(e?.value ?? ''); }
  } else if (h && typeof h === 'object') {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) map[k.toLowerCase()] = String(v ?? '');
  }
  return map;
}
function isAutoReply(hdr: Record<string, string>, fromAddr: string): boolean {
  const as = (hdr['auto-submitted'] || '').toLowerCase();
  if (as && as !== 'no') return true;
  const prec = (hdr['precedence'] || '').toLowerCase();
  if (['bulk', 'junk', 'list', 'auto_reply'].includes(prec)) return true;
  if (hdr['list-id'] || hdr['list-unsubscribe']) return true;
  if (hdr['x-autoreply'] || hdr['x-autorespond'] || hdr['x-auto-response-suppress']) return true;
  if (!fromAddr || /^(mailer-daemon|postmaster|no-?reply)@/i.test(fromAddr)) return true;
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')   // drop quoted history
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
/** Keep only the new reply — cut at the first quote/signature delimiter. */
function stripQuoted(input: string): string {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const delims = [
    /please reply above this line/i,         // our own outbound marker (most reliable)
    /^\s*on\b.+\bwrote:\s*$/i,
    /^\s*le\b.+\ba écrit\s*:\s*$/i,
    /^\s*am\b.+\bschrieb:\s*$/i,
    /^\s*-----\s*original message\s*-----/i,
    /^_{10,}\s*$/,                            // Outlook underscore rule
    /^\s*--\s*$/,                             // signature delimiter
    /^\s*sent from my /i,
  ];
  const out: string[] = [];
  for (const line of lines) { if (delims.some((re) => re.test(line))) break; out.push(line); }
  return out.join('\n').replace(/\n>[^\n]*(\n>[^\n]*)*\s*$/, '').replace(/\n{3,}/g, '\n\n').trim();
}

async function ownerEmail(userId: string, bizEmail?: string | null): Promise<string> {
  const e = (bizEmail || '').trim();
  if (e) return e.toLowerCase();
  const { data } = await admin.auth.admin.getUserById(userId);
  return (data.user?.email || '').trim().toLowerCase();
}

async function recordDrop(messageId: string, resendId: string | null, status: string): Promise<void> {
  await admin.from('inbound_emails')
    .upsert({ message_id: messageId, resend_email_id: resendId, status }, { onConflict: 'message_id', ignoreDuplicates: true });
}

// ── handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const raw = await req.text();
  if (!(await verifySvix(raw, req.headers))) return new Response('Bad signature', { status: 401 });

  let event: { type?: string; data?: Record<string, unknown> };
  try { event = JSON.parse(raw); } catch { return text200('bad json'); }
  const type = event.type || '';
  const data = event.data || {};

  try {
    // ── Delivery tracking for our outbound notifications ──
    if (type === 'email.delivered' || type === 'email.bounced' || type === 'email.complained') {
      const emailId = String(data.email_id || '');
      const status = type.split('.')[1]; // delivered | bounced | complained
      if (emailId) {
        await admin.from('customer_messages').update({ outbound_status: status }).eq('outbound_email_id', emailId);
      }
      return text200('ok');
    }

    if (type !== 'email.received') return text200('ignored');

    // ── Inbound reply ──
    const emailId = String(data.email_id || '');
    const messageId = String(data.message_id || emailId || '');
    if (!messageId || !emailId) return text200('no ids');

    // Cheap retry short-circuit: anything we've already seen is done.
    const { data: seen } = await admin.from('inbound_emails').select('status').eq('message_id', messageId).maybeSingle();
    if (seen) return text200('dup');

    // Fetch the full email (body + headers are NOT in the webhook payload).
    const fres = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { 'authorization': `Bearer ${RESEND_API_KEY}` },
    });
    if (!fres.ok) {
      console.error('[messages-inbound] fetch received email failed:', fres.status);
      return new Response('fetch failed', { status: 502 }); // transient — let Resend retry (not yet claimed)
    }
    const mail = await fres.json();

    // Find our reply-to token address among all recipients.
    const recipients = [
      ...addrList(data.to), ...addrList(data.cc), ...addrList(data.bcc),
      ...addrList(mail.to), ...addrList(mail.cc), ...addrList(mail.bcc),
    ];
    let role = '', tokenHex = '';
    for (const addr of recipients) {
      const m = addr.match(TOKEN_RE);
      if (m) { role = m[1].toLowerCase(); tokenHex = m[2].toLowerCase(); break; }
    }
    if (!role || !tokenHex) { await recordDrop(messageId, emailId, 'dropped_no_token'); return text200('no token'); }

    // Resolve the client thread from the token.
    const { data: client } = await admin.from('clients')
      .select('id, user_id, name, email').eq('reply_token', hexToUuid(tokenHex)).maybeSingle();
    if (!client) { await recordDrop(messageId, emailId, 'dropped_unknown_token'); return text200('unknown token'); }

    const fromAddr = parseAddr(mail.from ?? data.from);
    const hdr = headerMap(mail.headers);
    if (isAutoReply(hdr, fromAddr)) { await recordDrop(messageId, emailId, 'dropped_autoreply'); return text200('auto-reply'); }

    // Attribution: role sets the sender; From-match upgrades to verified.
    const sender = role === 'c' ? 'customer' : 'business';
    let expected = '';
    if (role === 'c') {
      expected = (client.email || '').trim().toLowerCase();
    } else {
      const { data: biz } = await admin.from('business_info').select('email').eq('user_id', client.user_id).maybeSingle();
      expected = await ownerEmail(client.user_id, biz?.email);
    }
    const verified = !!expected && fromAddr === expected;

    // Body: prefer plain text; fall back to stripped HTML. Then cut quoted history.
    const rawText = String(mail.text || '') || htmlToText(String(mail.html || ''));
    const body = stripQuoted(rawText).slice(0, MAX_BODY);
    if (!body) { await recordDrop(messageId, emailId, 'dropped_empty'); return text200('empty'); }

    // Per-client inbound rate limit.
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count } = await admin.from('customer_messages')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id).eq('via', 'email').gte('created_at', since);
    if ((count ?? 0) >= RATE_MAX) { await recordDrop(messageId, emailId, 'dropped_rate'); return text200('rate limited'); }

    // Claim (idempotency) — only the first writer of this message_id proceeds.
    const { data: claimed } = await admin.from('inbound_emails').upsert({
      message_id: messageId, resend_email_id: emailId, user_id: client.user_id, client_id: client.id,
      role: sender, from_addr: fromAddr, verified, status: 'received', raw_html: String(mail.html || '') || null,
    }, { onConflict: 'message_id', ignoreDuplicates: true }).select('message_id');
    if (!claimed || claimed.length === 0) return text200('raced');

    // Insert into the thread. via='email' makes the notify trigger skip it (loop break).
    const { data: inserted, error } = await admin.from('customer_messages').insert({
      user_id: client.user_id, client_id: client.id, sender, body,
      via: 'email', email_verified: verified, inbound_email_id: messageId,
    }).select('id').single();
    if (error || !inserted) {
      console.error('[messages-inbound] insert failed:', error?.message);
      await admin.from('inbound_emails').update({ status: 'rejected_insert' }).eq('message_id', messageId);
      return text200('insert failed');
    }

    await admin.from('inbound_emails')
      .update({ status: 'inserted', customer_message_id: inserted.id }).eq('message_id', messageId);
    return text200('ok');
  } catch (err) {
    console.error('[messages-inbound]', (err as Error).message);
    return text200('error'); // swallow — a 500 would make Resend retry a poison message
  }
});
