// ProCabinet — Test-email sender for the Cowork email-plan artifact (Resend).
//
// Lets the email-planning artifact deliver real test sends of draft marketing
// emails so they can be reviewed in an actual inbox, sent from the production
// sender (adam@procabinet.app via Resend) for true rendering/DKIM fidelity.
//
// Call path: artifact button → Supabase MCP execute_sql → pg_net
// net.http_post → this function → Resend. pg_net is used because the artifact
// sandbox has no direct network access; the database does.
//
// Deployed with --no-verify-jwt (the artifact's pg_net call carries no user
// JWT). The function implements its own auth + hard scoping instead:
//   1. `x-test-key` header must match TEST_KEY (static token shared with the
//      artifact — rotate by editing both sides).
//   2. Recipient must be on ALLOWED_RECIPIENTS — Adam's own addresses only,
//      so the worst possible abuse is sending Adam test emails.
//   3. Subject is forced to start with "[TEST]".
//   4. Single recipient, capped body size.
//
// Required env vars: RESEND_API_KEY (already set for send-welcome-email).
//
// Request body:  { to: string, subject: string, html?: string, text?: string,
//                  attachments?: [{ filename, content (base64), contentType,
//                                   contentId? }] }
//                contentId makes an attachment inline (cid: reference in the
//                html) — used for the founders' welcome QR code, since Gmail
//                strips data: URI images. Images only, 3 max, ~110KB each.
// Response:      { ok: true, id: string }   — sent (Resend email id)
//                { error: string }          — rejected / failed

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
if (!RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY for send-test-email function');
}

// Static guard shared with the email-plan artifact (not a user secret — it
// only gates [TEST] sends to the allowlist below).
const TEST_KEY = 'pct_ddb5f52dc92ab643c900e350fd14b52b';

// Adam's own addresses — the only place test emails can go.
const ALLOWED_RECIPIENTS = new Set([
  'adamdenney33@googlemail.com',
  'adamdenney33@gmail.com', // googlemail alias
  'adamdenney33@icloud.com',
  'adam@procabinet.app',
  'admin@bee9.co.uk',
  'studio@bee9.co.uk',
]);

const FROM = 'Adam at ProCabinet <adam@procabinet.app>';
const REPLY_TO = 'adam@procabinet.app';
const MAX_BODY = 200_000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_B64 = 150_000;
const ALLOWED_ATTACHMENT_TYPES = new Set(['image/png', 'image/jpeg']);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (req.headers.get('x-test-key') !== TEST_KEY) {
    return json({ error: 'Unauthorised' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const to = String(payload.to ?? '').trim().toLowerCase();
  const subjectRaw = String(payload.subject ?? '').trim().slice(0, 200);
  const html = typeof payload.html === 'string' ? payload.html : '';
  const text = typeof payload.text === 'string' ? payload.text : '';

  if (!ALLOWED_RECIPIENTS.has(to)) {
    return json({ error: 'Recipient not in the test allowlist' }, 403);
  }
  if (!html && !text) {
    return json({ error: 'Empty body' }, 400);
  }
  if (html.length > MAX_BODY || text.length > MAX_BODY) {
    return json({ error: 'Body too large' }, 413);
  }

  const subject = subjectRaw.startsWith('[TEST]')
    ? subjectRaw
    : `[TEST] ${subjectRaw || 'ProCabinet test email'}`;

  // Optional inline/regular image attachments (e.g. the founders QR code).
  const rawAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (rawAttachments.length > MAX_ATTACHMENTS) {
    return json({ error: 'Too many attachments' }, 413);
  }
  const attachments: Record<string, string>[] = [];
  for (const raw of rawAttachments) {
    const rec = (raw ?? {}) as Record<string, unknown>;
    const content = String(rec.content ?? '');
    const contentType = String(rec.contentType ?? 'image/png');
    if (!content || content.length > MAX_ATTACHMENT_B64) {
      return json({ error: 'Attachment missing or too large' }, 413);
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(content)) {
      return json({ error: 'Attachment must be base64' }, 400);
    }
    if (!ALLOWED_ATTACHMENT_TYPES.has(contentType)) {
      return json({ error: 'Attachment type not allowed' }, 400);
    }
    attachments.push({
      filename: String(rec.filename ?? 'attachment.png').slice(0, 64),
      content,
      content_type: contentType,
      ...(rec.contentId ? { content_id: String(rec.contentId).slice(0, 32) } : {}),
    });
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to,
        reply_to: REPLY_TO,
        subject,
        ...(text ? { text } : {}),
        ...(html ? { html } : {}),
        ...(attachments.length ? { attachments } : {}),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return json({ ok: true, id: data.id ?? null }, 200);
    }
    const detail = await res.text();
    console.error('[send-test-email] Resend error:', res.status, detail);
    return json({ error: `Resend responded ${res.status}` }, 502);
  } catch (err) {
    console.error('[send-test-email] Error:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
