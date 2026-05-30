// ProCabinet — push an order to QuickBooks/Xero as a DRAFT invoice.
//
// Authenticated. Body: { orderId, provider, lines:[{description,amount}], taxApplies }.
//
// The line amounts are computed on the client (the cabinet costing — calcCBLine —
// lives in the frontend, and the figures must match the Invoice PDF exactly).
// That's safe: it's the user's own data going into their own accounting system
// as a reviewable DRAFT — no different from typing it into QB/Xero directly. The
// server still RE-CHECKS that the order belongs to the caller (so the link row +
// reference are real) and sources the customer/contact from the DB, not the body.
// verify_jwt: true.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { loadConnection, getValidAccessToken } from '../_shared/connection.ts';
import {
  createDraftInvoice,
  findOrCreateContact,
  type InvoiceLineInput,
  type Provider,
} from '../_shared/providers.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const uid = auth.user.id;

  let orderId: number, provider: Provider, lines: InvoiceLineInput[], taxApplies: boolean;
  try {
    const b = await req.json();
    orderId = Number(b.orderId);
    provider = b.provider;
    lines = Array.isArray(b.lines) ? b.lines : [];
    taxApplies = !!b.taxApplies;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, cors);
  }
  if (!orderId || (provider !== 'quickbooks' && provider !== 'xero')) {
    return jsonResponse({ error: 'Missing orderId or provider' }, 400, cors);
  }
  // Sanitise lines: drop empties, clamp to numbers.
  const cleanLines: InvoiceLineInput[] = lines
    .map((l) => ({ description: String(l?.description ?? '').slice(0, 4000), amount: Number(l?.amount) }))
    .filter((l) => isFinite(l.amount));
  if (cleanLines.length === 0) {
    return jsonResponse({ error: 'No invoice lines to push' }, 400, cors);
  }

  try {
    const conn = await loadConnection(uid, provider);
    if (!conn || conn.status === 'revoked') {
      return jsonResponse({ error: `Not connected to ${provider}` }, 400, cors);
    }
    const accessToken = await getValidAccessToken(conn);

    // Re-check ownership + source the order facts server-side.
    const { data: order, error: oErr } = await admin
      .from('orders').select('id, user_id, client_id, order_number, due')
      .eq('id', orderId).eq('user_id', uid).maybeSingle();
    if (oErr) throw new Error(oErr.message);
    if (!order) return jsonResponse({ error: 'Order not found' }, 404, cors);

    // Customer/contact from the server's client record.
    let clientRow: { name: string; email: string | null; phone: string | null; address: string | null } | null = null;
    if (order.client_id) {
      const { data } = await admin
        .from('clients').select('name, email, phone, address')
        .eq('id', order.client_id).eq('user_id', uid).maybeSingle();
      clientRow = data as typeof clientRow;
    }
    if (!clientRow?.name) {
      return jsonResponse({ error: 'Order has no client — add one before invoicing' }, 400, cors);
    }

    const reference = order.order_number || `ORD-${String(order.id).padStart(4, '0')}`;
    const dueDate = toIsoDate(order.due);
    const taxCode = taxApplies ? (conn.default_tax_code ?? null) : null;

    const contactId = await findOrCreateContact(provider, conn, accessToken, clientRow);
    const created = await createDraftInvoice(provider, conn, accessToken, {
      contactId, reference, lines: cleanLines, taxCode, dueDate,
    });

    await admin.from('accounting_invoice_links').upsert({
      user_id: uid,
      order_id: orderId,
      provider,
      external_id: created.externalId,
      external_number: created.externalNumber,
      external_url: created.externalUrl,
      status: 'draft',
      pushed_at: new Date().toISOString(),
    }, { onConflict: 'user_id,order_id,provider' });

    return jsonResponse({
      ok: true,
      provider,
      external_number: created.externalNumber,
      external_url: created.externalUrl,
    }, 200, cors);
  } catch (err) {
    console.error('[accounting-push-invoice]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});

/** Order due → YYYY-MM-DD, or null for 'TBD'/blank/invalid. */
function toIsoDate(due: string | null | undefined): string | null {
  if (!due || due === 'TBD') return null;
  const d = new Date(due);
  return isNaN(+d) ? null : d.toISOString().slice(0, 10);
}
