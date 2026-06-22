// ProCabinet — PUBLIC mutation of one shared quote by its share_token.
//
// UNAUTHENTICATED, service-role. The customer (no login) toggles optional items,
// edits unlocked specs, or accepts — always gated server-side by the quote's
// share_settings and each line's per-line flags, so a crafted request can't do
// more than the business allowed. Mirrors quote-public-get's token model.
//
// DEPLOY NOTE: verify_jwt = false (no JWT). The Smart Link mode was dropped, so
// there is no present_mode here.
//
// Body: { token, action, ... }
//   action 'toggle' : { line_id, included }                — needs allow_select + line.optional
//   action 'edit'   : { line_id, finish?, w_mm? }          — needs allow_edit + line.customer_editable
//   action 'accept' : { snapshot }                          — records the accepted state

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin } from '../_shared/auth.ts';
import { priceCabinetLine, type RateCard } from '../_shared/costing.ts';

const MAX_SNAPSHOT_BYTES = 200_000;

// Human-readable labels for the change-request message dropped into the
// business's client chat when a customer edits a spec.
const SPEC_LABELS: Record<string, string> = {
  w_mm: 'Width (mm)', h_mm: 'Height (mm)', d_mm: 'Depth (mm)',
  finish: 'Finish', material: 'Material', construction: 'Construction',
  base_type: 'Base', door_count: 'Doors', door_pct: 'Door area %',
  door_type: 'Door style', door_material: 'Door material',
  door_finish: 'Door finish', door_handle: 'Handles',
  drawer_count: 'Drawers', drawer_pct: 'Drawer area %',
  drawer_front_type: 'Drawer front style', drawer_front_material: 'Drawer front material',
  drawer_front_finish: 'Drawer front finish', fixed_shelves: 'Fixed shelves',
  adj_shelves: 'Adjustable shelves', loose_shelves: 'Loose shelves',
  partitions: 'Partitions', end_panels: 'End panels',
};

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: 'Invalid request body' }, 400, cors); }

  const token = String(body.token || '');
  const action = String(body.action || '');
  if (!token || token.length < 8) return jsonResponse({ error: 'Missing token' }, 400, cors);

  try {
    // ── Resolve the quote + its gate state ──
    const { data: quote, error: qErr } = await admin
      .from('quotes')
      .select('id, user_id, client_id, status, share_settings, accepted_at, markup, discount, stock_markup, rate_card')
      .eq('share_token', token)
      .maybeSingle();
    if (qErr) throw new Error(qErr.message);
    if (!quote) return jsonResponse({ error: 'not_found' }, 404, cors);

    const settings = (quote.share_settings ?? {}) as Record<string, unknown>;
    if (settings.expires_at && new Date(String(settings.expires_at)) < new Date()) {
      return jsonResponse({ error: 'expired' }, 410, cors);
    }
    // Once accepted, the quote is locked (changes would desync the snapshot).
    if (quote.accepted_at && action !== 'accept') {
      return jsonResponse({ error: 'already_accepted' }, 409, cors);
    }

    // ── toggle an optional item in / out ──
    if (action === 'toggle') {
      if (!settings.allow_select) return jsonResponse({ error: 'selection_disabled' }, 403, cors);
      const lineId = Number(body.line_id);
      const included = !!body.included;
      const { data: line } = await admin
        .from('quote_lines').select('id, quote_id, optional')
        .eq('id', lineId).maybeSingle();
      if (!line || line.quote_id !== quote.id) return jsonResponse({ error: 'line_not_found' }, 404, cors);
      if (!line.optional) return jsonResponse({ error: 'line_not_optional' }, 403, cors);
      await admin.from('quote_lines').update({ customer_included: included }).eq('id', lineId);
      return jsonResponse({ ok: true }, 200, cors);
    }

    // ── edit unlocked specs (dims / finish / material / doors / drawers) ──
    if (action === 'edit') {
      if (!settings.allow_edit) return jsonResponse({ error: 'editing_disabled' }, 403, cors);
      const lineId = Number(body.line_id);
      // select('*') — server-only (service role). We need every pricing column for
      // the auto-accept re-price below, and this row never reaches the customer.
      const { data: line } = await admin
        .from('quote_lines')
        .select('*')
        .eq('id', lineId).maybeSingle();
      if (!line || line.quote_id !== quote.id) return jsonResponse({ error: 'line_not_found' }, 404, cors);
      if (!line.customer_editable) return jsonResponse({ error: 'line_locked' }, 403, cors);
      // Only accept fields the business actually unlocked. Empty editable_specs =
      // legacy "all editable" (a line shared before the per-spec migration).
      const specs: string[] = Array.isArray(line.editable_specs) ? line.editable_specs : [];
      const allows = (k: string) => specs.length === 0 || specs.includes(k);

      const patch: Record<string, unknown> = {};
      // Finish / material must be one of the maker's catalogued names (prevents
      // arbitrary strings); only when that spec is unlocked. Source of truth is
      // the quote's `rate_card` snapshot — the SAME set quote-public-get offers
      // the customer, and guaranteed priceable (a key in the cost maps) so an
      // accepted edit can always be auto-priced. (`catalog_items` is no longer
      // populated; we fall back to the snapshot's cost-map keys for older
      // snapshots that predate the typed name lists, then to catalog_items for
      // pre-rate_card quotes.)
      const rateCard = (quote.rate_card ?? null) as RateCard | null;
      const allowedNames = async (kind: 'material' | 'finish'): Promise<Set<string>> => {
        if (rateCard) {
          const typed = kind === 'material' ? rateCard.materialNames : rateCard.finishNames;
          if (Array.isArray(typed) && typed.length) return new Set(typed);
          const maps = kind === 'material' ? rateCard.matPerM2 : rateCard.finishPerM2;
          if (maps && Object.keys(maps).length) return new Set(Object.keys(maps));
        }
        const { data: cat } = await admin
          .from('catalog_items').select('name')
          .eq('user_id', quote.user_id).eq('type', kind);
        return new Set((cat ?? []).map((c: { name: string }) => c.name));
      };
      if (typeof body.finish === 'string' && allows('finish')) {
        const finish = body.finish.slice(0, 80);
        if (!(await allowedNames('finish')).has(finish)) return jsonResponse({ error: 'finish_not_allowed' }, 422, cors);
        patch.finish = finish;
      }
      if (typeof body.material === 'string' && allows('material')) {
        const material = body.material.slice(0, 80);
        if (!(await allowedNames('material')).has(material)) return jsonResponse({ error: 'material_not_allowed' }, 422, cors);
        patch.material = material;
      }
      // Dimensions / counts clamped to sane ranges.
      const clamp = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return (isFinite(n) && n >= lo && n <= hi) ? n : null; };
      if (body.w_mm != null && allows('dims')) { const w = clamp(body.w_mm, 100, 3600); if (w === null) return jsonResponse({ error: 'width_out_of_range' }, 422, cors); patch.w_mm = w; }
      if (body.h_mm != null && allows('dims')) { const h = clamp(body.h_mm, 100, 3600); if (h === null) return jsonResponse({ error: 'height_out_of_range' }, 422, cors); patch.h_mm = h; }
      if (body.d_mm != null && allows('dims')) { const d = clamp(body.d_mm, 100, 1200); if (d === null) return jsonResponse({ error: 'depth_out_of_range' }, 422, cors); patch.d_mm = d; }
      if (body.door_count != null && allows('doors')) { const n = clamp(body.door_count, 0, 6); if (n === null) return jsonResponse({ error: 'doors_out_of_range' }, 422, cors); patch.door_count = n; }
      if (body.drawer_count != null && allows('drawers')) { const n = clamp(body.drawer_count, 0, 12); if (n === null) return jsonResponse({ error: 'drawers_out_of_range' }, 422, cors); patch.drawer_count = n; }
      // Door / drawer share of the front face (% — clamped 0–100).
      if (body.door_pct != null && allows('doorPct')) { const n = clamp(body.door_pct, 0, 100); if (n === null) return jsonResponse({ error: 'door_pct_out_of_range' }, 422, cors); patch.door_pct = n; }
      if (body.drawer_pct != null && allows('drawerPct')) { const n = clamp(body.drawer_pct, 0, 100); if (n === null) return jsonResponse({ error: 'drawer_pct_out_of_range' }, 422, cors); patch.drawer_pct = n; }
      // Per-component finishes / drawer-front material — catalogued names only.
      if (typeof body.door_finish === 'string' && allows('doorFinish')) {
        const f = body.door_finish.slice(0, 80);
        if (!(await allowedNames('finish')).has(f)) return jsonResponse({ error: 'door_finish_not_allowed' }, 422, cors);
        patch.door_finish = f;
      }
      if (typeof body.drawer_front_finish === 'string' && allows('drawerFinish')) {
        const f = body.drawer_front_finish.slice(0, 80);
        if (!(await allowedNames('finish')).has(f)) return jsonResponse({ error: 'drawer_front_finish_not_allowed' }, 422, cors);
        patch.drawer_front_finish = f;
      }
      if (typeof body.drawer_front_material === 'string' && allows('drawerMat')) {
        const m = body.drawer_front_material.slice(0, 80);
        if (!(await allowedNames('material')).has(m)) return jsonResponse({ error: 'drawer_front_material_not_allowed' }, 422, cors);
        patch.drawer_front_material = m;
      }
      if (body.fixed_shelves != null && allows('shelves')) { const n = clamp(body.fixed_shelves, 0, 12); if (n === null) return jsonResponse({ error: 'shelves_out_of_range' }, 422, cors); patch.fixed_shelves = n; }
      if (body.adj_shelves != null && allows('adjShelves')) { const n = clamp(body.adj_shelves, 0, 12); if (n === null) return jsonResponse({ error: 'adj_shelves_out_of_range' }, 422, cors); patch.adj_shelves = n; }
      if (body.loose_shelves != null && allows('looseShelves')) { const n = clamp(body.loose_shelves, 0, 12); if (n === null) return jsonResponse({ error: 'loose_shelves_out_of_range' }, 422, cors); patch.loose_shelves = n; }
      if (body.partitions != null && allows('partitions')) { const n = clamp(body.partitions, 0, 12); if (n === null) return jsonResponse({ error: 'partitions_out_of_range' }, 422, cors); patch.partitions = n; }
      if (body.end_panels != null && allows('endPanels')) { const n = clamp(body.end_panels, 0, 12); if (n === null) return jsonResponse({ error: 'end_panels_out_of_range' }, 422, cors); patch.end_panels = n; }
      // Style / build fields — door & drawer style, base, construction, handle:
      // free text (the customer picks from a dropdown client-side; the value is
      // reviewed by the business). Door material is validated like other materials.
      const str = (v: unknown) => String(v).slice(0, 80);
      if (typeof body.door_type === 'string' && allows('doorType')) patch.door_type = str(body.door_type);
      if (typeof body.drawer_front_type === 'string' && allows('drawerType')) patch.drawer_front_type = str(body.drawer_front_type);
      if (typeof body.base_type === 'string' && allows('base')) patch.base_type = str(body.base_type);
      if (typeof body.construction === 'string' && allows('construction')) patch.construction = str(body.construction);
      if (typeof body.door_handle === 'string' && allows('handle')) patch.door_handle = str(body.door_handle);
      if (typeof body.door_material === 'string' && allows('doorMat')) {
        const m = body.door_material.slice(0, 80);
        if (!(await allowedNames('material')).has(m)) return jsonResponse({ error: 'door_material_not_allowed' }, 422, cors);
        patch.door_material = m;
      }
      if (!Object.keys(patch).length) return jsonResponse({ error: 'nothing_to_update' }, 400, cors);
      // Human-readable diff for the chat note — computed from the OLD line values
      // before we touch customer_price (which isn't a spec).
      const changes = Object.keys(patch)
        .map((k) => {
          const label = SPEC_LABELS[k] || k;
          const oldVal = (line as Record<string, unknown>)[k];
          const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
          return `${label}: ${fmt(oldVal)} → ${fmt(patch[k])}`;
        });

      // Auto-accept: when the maker has switched it on AND we hold a rate snapshot,
      // re-price the line server-side from the maker's rates so the customer sees
      // the new price immediately and can proceed — no manual re-confirmation.
      // Otherwise (off, no snapshot, non-cabinet, or any failure) we CLEAR the
      // price → the page shows "Price to confirm" and quote-pay refuses to charge
      // until the maker re-prices (its line sum treats null as pending).
      let autoPrice: number | null = null;
      if (settings.auto_accept_edits && rateCard && ((line.line_kind ?? 'cabinet') === 'cabinet')) {
        try {
          // Catalogue rates come from the snapshot; the quote-level wrapper
          // (markup / discount) is taken fresh from the quotes row.
          const rc: RateCard = {
            ...rateCard,
            markup: Number(quote.markup) || 0,
            discount: Number(quote.discount) || 0,
            stock_markup: Number(quote.stock_markup) || 0,
          };
          const merged = { ...line, ...patch }; // apply the edit before pricing
          const p = priceCabinetLine(merged, rc);
          if (typeof p === 'number' && isFinite(p) && p >= 0) autoPrice = Math.round(p * 100) / 100;
        } catch (_e) { autoPrice = null; } // never charge a guessed price — fall back
      }

      patch.customer_price = autoPrice; // number when auto-priced, else null ("to confirm")
      await admin.from('quote_lines').update(patch).eq('id', lineId);
      // Drop a note into the existing client chat thread so the business sees the
      // change (unread badge on the quote/client cards) and keeps an audit trail.
      // Best-effort — the edit itself has already succeeded.
      if (quote.client_id) {
        const body = autoPrice != null
          ? `Changed “${line.name || 'Item'}” — ${changes.join(', ')}. Auto-priced at your current rates (auto-accept is on). (Sent from the quote page.)`
          : `Requested a change to “${line.name || 'Item'}” — ${changes.join(', ')}. (Sent from the quote page; price to be re-confirmed.)`;
        try {
          await admin.from('customer_messages').insert({
            user_id: quote.user_id,
            client_id: quote.client_id,
            quote_id: quote.id,
            sender: 'customer',
            body,
          });
        } catch (_e) { /* chat table missing / RLS issue — edit still recorded */ }
      }
      // Return the new price (null = "to confirm") so the page can update live.
      return jsonResponse({ ok: true, customer_price: autoPrice }, 200, cors);
    }

    // ── accept: record the customer's accepted state ──
    // Payment + order creation happen in Phase 4 (quote-pay + webhook). Here we
    // freeze what the customer agreed to. The snapshot is computed client-side
    // (cabinet costing lives in the frontend) and reviewed by the business.
    if (action === 'accept') {
      if (quote.accepted_at) return jsonResponse({ error: 'already_accepted' }, 409, cors);
      const snapshot = body.snapshot ?? null;
      if (snapshot && JSON.stringify(snapshot).length > MAX_SNAPSHOT_BYTES) {
        return jsonResponse({ error: 'snapshot_too_large' }, 413, cors);
      }
      // The snapshot is an informational record of what the customer agreed to —
      // money is never derived from it (the order is rebuilt server-side from
      // `customer_price`). Still, reject a malformed shape so downstream readers
      // (PDF, accounting) can trust `totals.total` exists.
      if (snapshot && (typeof snapshot !== 'object'
        || typeof (snapshot as Record<string, any>).totals?.total !== 'number')) {
        return jsonResponse({ error: 'invalid_snapshot' }, 400, cors);
      }
      await admin.from('quotes').update({
        accepted_at: new Date().toISOString(),
        // The pay webhook can land before the page's accept call — never
        // downgrade a paid status back to 'accepted'.
        status: quote.status === 'deposit_paid' || quote.status === 'paid' ? quote.status : 'accepted',
        accepted_snapshot: snapshot,
      }).eq('id', quote.id);
      return jsonResponse({ ok: true, accepted: true }, 200, cors);
    }

    return jsonResponse({ error: 'unknown_action' }, 400, cors);
  } catch (err) {
    console.error('[quote-public-update]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
