// ProCabinet — PUBLIC read of one shared quote by its share_token.
//
// UNAUTHENTICATED: the customer opens /q/<token> with no login. This function
// resolves the quote via the service-role `admin` client (bypasses RLS) using
// the opaque share_token — the customer never touches PostgREST directly, so no
// anon RLS is needed (mirrors the accounting/stripe service-role model).
//
// DEPLOY NOTE: this function must run with `verify_jwt = false` (it has no JWT).
// Set it in supabase/config.toml ([functions.quote-public-get] verify_jwt=false)
// or the dashboard. It only ever returns PUBLIC-safe columns — never tokens,
// internal ids beyond what the page needs, or other users' data.
//
// Body: { token: string }. Returns the quote, its lines (+ per-line customer
// flags), business branding, the client's name (greeting), line photos, and the
// share settings that gate what the customer may do.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  let token = '';
  try { token = String((await req.json()).token || ''); }
  catch { return jsonResponse({ error: 'Invalid request body' }, 400, cors); }
  if (!token || token.length < 8) return jsonResponse({ error: 'Missing token' }, 400, cors);

  try {
    // ── Resolve the quote by its share token ──
    const { data: quote, error: qErr } = await admin
      .from('quotes')
      .select('id, user_id, client_id, quote_number, date, status, markup, tax, discount, stock_markup, notes, share_settings, viewed_at, accepted_at')
      .eq('share_token', token)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);
    if (!quote) return jsonResponse({ error: 'not_found' }, 404, cors);

    const settings = (quote.share_settings ?? {}) as Record<string, unknown>;

    // Closed / expired guards.
    if (settings.expires_at && new Date(String(settings.expires_at)) < new Date()) {
      return jsonResponse({ error: 'expired' }, 410, cors);
    }
    if (quote.status === 'declined' || quote.status === 'expired') {
      return jsonResponse({ error: 'closed', status: quote.status }, 410, cors);
    }

    // ── Lines (public-safe spec + per-line customer flags) ──
    const { data: lines } = await admin
      .from('quote_lines')
      .select('id, position, line_kind, name, type, room, w_mm, h_mm, d_mm, qty, material, finish, door_finish, drawer_front_finish, construction, base_type, door_count, door_pct, door_handle, door_type, door_material, drawer_count, drawer_pct, drawer_front_material, drawer_front_type, fixed_shelves, adj_shelves, loose_shelves, partitions, end_panels, unit_price, labour_hours, extras, hardware, notes, optional, customer_editable, customer_included, customer_price, editable_specs')
      .eq('quote_id', quote.id)
      .order('position');

    // ── Business branding ──
    const { data: biz } = await admin
      .from('business_info')
      .select('name, email, phone, address, abn, bank_details, logo_url, default_currency')
      .eq('user_id', quote.user_id)
      .maybeSingle();

    // ── Allowed finishes for the in-page spec editor (names only, not sensitive) ──
    const { data: finRows } = await admin
      .from('catalog_items').select('name')
      .eq('user_id', quote.user_id).eq('type', 'finish');
    const finishes = Array.from(new Set([
      ...(finRows ?? []).map((f: { name: string }) => f.name),
      ...(lines ?? []).map((l: { finish: string | null }) => l.finish).filter(Boolean),
    ])) as string[];

    // ── Allowed materials for the in-page spec editor ──
    const { data: matRows } = await admin
      .from('catalog_items').select('name')
      .eq('user_id', quote.user_id).eq('type', 'material');
    const materials = Array.from(new Set([
      ...(matRows ?? []).map((m: { name: string }) => m.name),
      ...(lines ?? []).map((l: { material: string | null }) => l.material).filter(Boolean),
    ])) as string[];

    // ── Style / build option lists: the standard cabinetry sets merged with any
    //    values used on this quote's lines. Handles come from used values only
    //    (the hardware catalogue lives in the business's local settings). ──
    const ls = (lines ?? []) as Array<Record<string, unknown>>;
    const mergeOpts = (std: string[], col: string) =>
      Array.from(new Set([...std, ...(ls.map((l) => l[col]).filter(Boolean) as string[])]));
    const doorTypes = mergeOpts(['Slab', 'Shaker', 'Vinyl-Wrapped', 'Integrated Handle'], 'door_type');
    const drawerFrontTypes = mergeOpts(['Slab', 'Shaker'], 'drawer_front_type');
    const baseTypes = mergeOpts(['None', 'Plinth', 'Feet / Legs', 'Castors', 'Frame'], 'base_type');
    const constructions = mergeOpts(['Overlay', 'Inset', 'Face Frame'], 'construction');
    const handles = mergeOpts(['None'], 'door_handle');

    // ── Client name (greeting only) ──
    let client: { name: string } | null = null;
    if (quote.client_id) {
      const { data } = await admin.from('clients').select('name').eq('id', quote.client_id).maybeSingle();
      client = data as typeof client;
    }

    // ── Line photos → public URLs ──
    const lineIds = (lines ?? []).map((l: { id: number }) => l.id);
    let photoUrls: Array<{ line_id: number; url: string | null; caption: string | null }> = [];
    if (lineIds.length) {
      const { data: ph } = await admin
        .from('line_photos')
        .select('owner_id, storage_path, caption, position')
        .eq('owner_kind', 'quote_line')
        .in('owner_id', lineIds)
        .order('position');
      photoUrls = (ph ?? []).map((p: { owner_id: number; storage_path: string; caption: string | null }) => ({
        line_id: p.owner_id,
        url: admin.storage.from('business-assets').getPublicUrl(p.storage_path).data?.publicUrl ?? null,
        caption: p.caption,
      }));
    }

    // ── Mark viewed (best-effort, first open) ──
    let status = quote.status as string;
    if (!quote.viewed_at) {
      const patch: Record<string, unknown> = { viewed_at: new Date().toISOString() };
      if (status === 'sent') { patch.status = 'viewed'; status = 'viewed'; }
      await admin.from('quotes').update(patch).eq('id', quote.id);
    }

    return jsonResponse({
      quote: {
        number: quote.quote_number,
        date: quote.date,
        status,
        markup: Number(quote.markup) || 0,
        tax: Number(quote.tax) || 0,
        discount: Number(quote.discount) || 0,
        stock_markup: Number(quote.stock_markup) || 0,
        notes: quote.notes,
        accepted_at: quote.accepted_at,
      },
      settings: {
        allow_select: !!settings.allow_select,
        allow_edit: !!settings.allow_edit,
        accept_payment: !!settings.accept_payment,
        deposit_pct: Number(settings.deposit_pct) || 0,
        expires_at: settings.expires_at ?? null,
      },
      business: biz ?? null,
      client,
      lines: lines ?? [],
      photos: photoUrls,
      finishes,
      materials,
      doorTypes,
      drawerFrontTypes,
      baseTypes,
      constructions,
      handles,
    }, 200, cors);
  } catch (err) {
    console.error('[quote-public-get]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
