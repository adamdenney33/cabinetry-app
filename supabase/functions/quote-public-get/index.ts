// ProCabinet — PUBLIC read of one shared quote OR order by its share_token.
//
// UNAUTHENTICATED: the customer opens /q/<token> with no login. This function
// resolves the deal via the service-role `admin` client (bypasses RLS) using
// the opaque share_token — the customer never touches PostgREST directly, so no
// anon RLS is needed (mirrors the accounting/stripe service-role model).
//
// The token resolves against `quotes` first, then `orders` — an order gets its
// OWN shareable page (its own line items), independent of any origin quote. The
// response shape is identical for both; `kind` flags which one ('quote'|'order')
// so the page can relabel. Order pages are view-only (no spec edit / selection /
// accept) — those settings simply aren't set on orders.
//
// DEPLOY NOTE: this function must run with `verify_jwt = false` (it has no JWT).
// It only ever returns PUBLIC-safe columns — never tokens, internal ids beyond
// what the page needs, or other users' data.
//
// Body: { token: string }.

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
    // ── Resolve the share token: quotes first, then orders ──
    let kind: 'quote' | 'order' = 'quote';
    const { data: q, error: qErr } = await admin
      .from('quotes')
      .select('id, user_id, client_id, quote_number, date, status, markup, tax, discount, stock_markup, notes, share_settings, viewed_at, accepted_at')
      .eq('share_token', token)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);

    // deno-lint-ignore no-explicit-any
    let entity: Record<string, any> | null = q;
    if (!entity) {
      const { data: o, error: oErr } = await admin
        .from('orders')
        .select('id, user_id, client_id, order_number, created_at, status, markup, tax, discount, stock_markup, notes, share_settings, viewed_at')
        .eq('share_token', token)
        .maybeSingle();
      if (oErr) throw new Error(oErr.message);
      if (o) { entity = o; kind = 'order'; }
    }
    if (!entity) return jsonResponse({ error: 'not_found' }, 404, cors);

    const settings = (entity.share_settings ?? {}) as Record<string, unknown>;

    // Closed / expired guards.
    if (settings.expires_at && new Date(String(settings.expires_at)) < new Date()) {
      return jsonResponse({ error: 'expired' }, 410, cors);
    }
    if (entity.status === 'declined' || entity.status === 'expired') {
      return jsonResponse({ error: 'closed', status: entity.status }, 410, cors);
    }

    // ── Lines (public-safe spec + per-line customer flags) ──
    // order_lines lacks the quote-only finish/hardware fields; select per kind.
    // SECURITY: never select the business's cost inputs (`unit_price`,
    // `labour_hours`) or any cost-bearing free text (`extras`, `hardware`) — the
    // customer only ever needs `customer_price` (the marked-up, public figure).
    // Returning cost columns to an unauthenticated visitor leaks margin/pricing.
    const { data: lines } = kind === 'quote'
      ? await admin
        .from('quote_lines')
        .select('id, position, line_kind, name, type, room, w_mm, h_mm, d_mm, qty, material, finish, door_finish, drawer_front_finish, construction, base_type, door_count, door_pct, door_handle, door_type, door_material, drawer_count, drawer_pct, drawer_front_material, drawer_front_type, fixed_shelves, adj_shelves, loose_shelves, partitions, end_panels, notes, optional, customer_editable, customer_included, customer_price, editable_specs')
        .eq('quote_id', entity.id)
        .order('position')
      : await admin
        .from('order_lines')
        .select('id, position, line_kind, name, type, room, w_mm, h_mm, d_mm, qty, material, finish, construction, base_type, door_count, door_pct, door_handle, door_type, door_material, drawer_count, drawer_pct, drawer_front_material, drawer_front_type, fixed_shelves, adj_shelves, loose_shelves, partitions, end_panels, notes, optional, customer_editable, customer_included, customer_price, editable_specs')
        .eq('order_id', entity.id)
        .order('position');

    // ── Business branding ──
    // SECURITY: only public-safe contact fields. `abn` and especially
    // `bank_details` must NOT reach an unauthenticated visitor — they're never
    // rendered on the customer page and would expose sensitive business data to
    // anyone holding (or guessing) a share link.
    // default_units / unit_format drive the customer-facing dimension display
    // (so an imperial maker's live link reads in inches, matching the PDF). Both
    // are presentation preferences — safe to expose, unlike abn/bank_details.
    const { data: biz } = await admin
      .from('business_info')
      .select('name, email, phone, address, logo_url, default_currency, default_units, unit_format')
      .eq('user_id', entity.user_id)
      .maybeSingle();

    // ── Allowed finishes for the in-page spec editor (names only, not sensitive) ──
    const { data: finRows } = await admin
      .from('catalog_items').select('name')
      .eq('user_id', entity.user_id).eq('type', 'finish');
    const finishes = Array.from(new Set([
      ...(finRows ?? []).map((f: { name: string }) => f.name),
      ...(lines ?? []).map((l: { finish: string | null }) => l.finish).filter(Boolean),
    ])) as string[];

    // ── Allowed materials for the in-page spec editor ──
    // Two sources merge here: legacy catalog_items (type='material') and the
    // stock items the business has flagged customer_visible — stock_items is the
    // current source of truth for materials, so flagging a sheet good offers it
    // as a selectable carcass/door/drawer material on the live page.
    const { data: matRows } = await admin
      .from('catalog_items').select('name')
      .eq('user_id', entity.user_id).eq('type', 'material');
    const { data: stockMatRows } = await admin
      .from('stock_items').select('name')
      .eq('user_id', entity.user_id).eq('customer_visible', true);
    const materials = Array.from(new Set([
      ...(matRows ?? []).map((m: { name: string }) => m.name),
      ...(stockMatRows ?? []).map((m: { name: string }) => m.name),
      ...(lines ?? []).map((l: { material: string | null }) => l.material).filter(Boolean),
    ])) as string[];

    // ── Style / build option lists: standard cabinetry sets merged with used values. ──
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
    if (entity.client_id) {
      const { data } = await admin.from('clients').select('name').eq('id', entity.client_id).maybeSingle();
      client = data as typeof client;
    }

    // ── Line photos → public URLs ──
    const lineIds = (lines ?? []).map((l: { id: number }) => l.id);
    let photoUrls: Array<{ line_id: number; url: string | null; caption: string | null }> = [];
    if (lineIds.length) {
      const { data: ph } = await admin
        .from('line_photos')
        .select('owner_id, storage_path, caption, position')
        .eq('owner_kind', kind === 'quote' ? 'quote_line' : 'order_line')
        .in('owner_id', lineIds)
        .order('position');
      photoUrls = (ph ?? []).map((p: { owner_id: number; storage_path: string; caption: string | null }) => ({
        line_id: p.owner_id,
        url: admin.storage.from('business-assets').getPublicUrl(p.storage_path).data?.publicUrl ?? null,
        caption: p.caption,
      }));
    }

    // ── Mark viewed (best-effort, first open) ──
    let status = entity.status as string;
    if (!entity.viewed_at) {
      const patch: Record<string, unknown> = { viewed_at: new Date().toISOString() };
      // Quote-only status transition; an order keeps its production status.
      if (kind === 'quote' && status === 'sent') { patch.status = 'viewed'; status = 'viewed'; }
      if (kind === 'quote') await admin.from('quotes').update(patch).eq('id', entity.id);
      else await admin.from('orders').update(patch).eq('id', entity.id);
    }

    return jsonResponse({
      kind,
      quote: {
        number: kind === 'quote' ? entity.quote_number : entity.order_number,
        date: kind === 'quote'
          ? entity.date
          : (entity.created_at ? String(entity.created_at).slice(0, 10) : null),
        status,
        markup: Number(entity.markup) || 0,
        tax: Number(entity.tax) || 0,
        discount: Number(entity.discount) || 0,
        stock_markup: Number(entity.stock_markup) || 0,
        notes: entity.notes,
        accepted_at: entity.accepted_at ?? null,
      },
      settings: {
        allow_select: !!settings.allow_select,
        allow_edit: !!settings.allow_edit,
        accept_payment: !!settings.accept_payment,
        deposit_pct: settings.take_deposit === false ? 0 : Number(settings.deposit_pct) || 0,
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
