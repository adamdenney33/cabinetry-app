// ProCabinet — authenticated image upload doorman.
//
// WHY THIS EXISTS: this project's Storage service does not honor user JWTs —
// every direct upload (raw fetch OR supabase-js SDK, with any apikey, any
// signing-key style) lands as anonymous, so the owner-folder RLS policy on
// storage.objects rejects it ("new row violates row-level security policy").
// PostgREST verifies the same tokens fine, so the database works. Until that
// platform issue is resolved, this function is the upload path: it verifies
// the caller's JWT itself, then writes via the service-role client so the RLS
// check is bypassed entirely.
//
// The bucket is `business-assets` (public). The function ALWAYS writes objects
// under `{userId}/...` so we keep the same per-user namespace the RLS policy
// would have enforced — a malicious caller cannot upload into another user's
// folder because the path is derived server-side from the verified user id.
//
// DEPLOY NOTE: verify_jwt = true (we also call authenticateCaller as defense
// in depth — same pattern as the accounting-* / stripe-* functions).
//
// Body: multipart/form-data with
//   file        : the image File              (required)
//   prefix      : 'logo' | 'line_photo'       (required — controls path layout)
//   owner_kind  : 'quote_line' | 'order_line' | 'cabinet_template'   (line_photo)
//   owner_id    : number                                              (line_photo)
//
// Returns: { path: string, url: string } on success.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';

const BUCKET = 'business-assets';
const MAX_BYTES = 16_000_000; // 16MB hard cap (logo is 500KB client-side, line photos 15MB)
const ALLOWED_OWNER_KINDS = new Set(['quote_line', 'order_line', 'cabinet_template']);

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const userId = auth.user.id;

  let form: FormData;
  try { form = await req.formData(); }
  catch { return jsonResponse({ error: 'Invalid form data' }, 400, cors); }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonResponse({ error: 'Missing file' }, 400, cors);
  if (!file.type.startsWith('image/')) return jsonResponse({ error: 'Not an image' }, 400, cors);
  if (file.size === 0) return jsonResponse({ error: 'Empty file' }, 400, cors);
  if (file.size > MAX_BYTES) return jsonResponse({ error: 'File too large' }, 413, cors);

  const prefix = String(form.get('prefix') || '');
  // Map MIME -> file extension. `image/svg+xml` -> `svg`, `image/jpeg` -> `jpg`.
  const ext = (file.type.split('/')[1] || 'jpg').replace('+xml', '').replace('jpeg', 'jpg');
  const rand = Math.random().toString(36).slice(2, 8);

  let path: string;
  if (prefix === 'logo') {
    // Match the existing logo path so business_info.logo_url stays consistent
    // (one canonical `<uid>/logo.<ext>`, upserted on each replace).
    path = `${userId}/logo.${ext}`;
  } else if (prefix === 'line_photo') {
    const ownerKind = String(form.get('owner_kind') || '');
    const ownerId = Number(form.get('owner_id') || 0);
    if (!ALLOWED_OWNER_KINDS.has(ownerKind)) return jsonResponse({ error: 'Bad owner_kind' }, 400, cors);
    if (!ownerId || !Number.isFinite(ownerId)) return jsonResponse({ error: 'Bad owner_id' }, 400, cors);
    path = `${userId}/lines/${ownerKind}/${ownerId}/${Date.now()}-${rand}.${ext}`;
  } else {
    return jsonResponse({ error: 'Bad prefix' }, 400, cors);
  }

  // Service-role upload — bypasses the storage.objects RLS the platform isn't
  // resolving auth.uid() for. The path is built server-side from the verified
  // user id, so a caller can never write outside their own `{uid}/...` folder.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) {
    console.error('[image-upload]', upErr.message);
    return jsonResponse({ error: upErr.message }, 500, cors);
  }
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return jsonResponse({ path, url: pub?.publicUrl ?? null }, 200, cors);
});
