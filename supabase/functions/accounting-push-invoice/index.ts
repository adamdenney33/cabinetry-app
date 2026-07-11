// ProCabinet — push an ORDER or QUOTE to QuickBooks/Xero.
//
//   • order → DRAFT invoice   (QBO Invoice / Xero ACCREC invoice)
//   • quote → DRAFT estimate  (QBO Estimate / Xero Quote — the pre-sale doc)
//
// Authenticated. Body: { docType?: 'order'|'quote', id?, orderId?, quoteId?,
// provider, lines:[{description,amount}], taxApplies }. `orderId` is still
// accepted for backward compatibility with older clients (docType defaults to
// 'order').
//
// The line amounts are computed on the client (the cabinet costing — calcCBLine —
// lives in the frontend, and the figures must match the PDF exactly). That's
// safe: it's the user's own data going into their own accounting system as a
// reviewable DRAFT — no different from typing it into QB/Xero directly. The
// server still RE-CHECKS that the order/quote belongs to the caller and sources
// the customer/contact from the DB, not the body. verify_jwt: true.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { loadConnection, getValidAccessToken } from '../_shared/connection.ts';
import {
  createDraftEstimate,
  createDraftInvoice,
  findOrCreateContact,
  type InvoiceLineInput,
  type Provider,
} from '../_shared/providers.ts';

type DocType = 'order' | 'quote';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const uid = auth.user.id;

  let docType: DocType, docId: number, provider: Provider, lines: InvoiceLineInput[], taxApplies: boolean;
  try {
    const b = await req.json();
    docType = b.docType === 'quote' ? 'quote' : 'order';
    docId = Number(b.id ?? b.quoteId ?? b.orderId);
    provider = b.provider;
    lines = Array.isArray(b.lines) ? b.lines : [];
    taxApplies = !!b.taxApplies;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400, cors);
  }
  if (!docId || (provider !== 'quickbooks' && provider !== 'xero')) {
    return jsonResponse({ error: 'Missing document id or provider' }, 400, cors);
  }
  // Sanitise lines: drop empties, clamp to numbers.
  const cleanLines: InvoiceLineInput[] = lines
    .map((l) => ({ description: String(l?.description ?? '').slice(0, 4000), amount: Number(l?.amount) }))
    .filter((l) => isFinite(l.amount));
  if (cleanLines.length === 0) {
    return jsonResponse({ error: 'No line items to push' }, 400, cors);
  }

  try {
    const conn = await loadConnection(uid, provider);
    if (!conn || conn.status === 'revoked') {
      return jsonResponse({ error: `Not connected to ${provider}` }, 400, cors);
    }
    const accessToken = await getValidAccessToken(conn);

    // Re-check ownership + source the doc facts server-side.
    const table = docType === 'quote' ? 'quotes' : 'orders';
    const numberCol = docType === 'quote' ? 'quote_number' : 'order_number';
    const { data: doc, error: dErr } = await admin
      .from(table)
      .select(docType === 'quote' ? 'id, user_id, client_id, quote_number' : 'id, user_id, client_id, order_number, due')
      .eq('id', docId).eq('user_id', uid).maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!doc) return jsonResponse({ error: `${docType === 'quote' ? 'Quote' : 'Order'} not found` }, 404, cors);

    // Customer/contact from the server's client record.
    let clientRow: { name: string; email: string | null; phone: string | null; address: string | null } | null = null;
    const docAny = doc as Record<string, unknown>;
    if (docAny.client_id) {
      const { data } = await admin
        .from('clients').select('name, email, phone, address')
        .eq('id', docAny.client_id).eq('user_id', uid).maybeSingle();
      clientRow = data as typeof clientRow;
    }
    if (!clientRow?.name) {
      return jsonResponse({ error: `${docType === 'quote' ? 'Quote' : 'Order'} has no client — add one before sending` }, 400, cors);
    }

    const prefix = docType === 'quote' ? 'QUO' : 'ORD';
    const reference = (docAny[numberCol] as string | null) || `${prefix}-${String(docId).padStart(4, '0')}`;
    // Orders carry a due date (invoice DueDate); quotes have no due date (the
    // estimate/quote expiry is left blank).
    const dueDate = docType === 'order' ? toIsoDate(docAny.due as string | null | undefined) : null;
    const taxCode = taxApplies ? (conn.default_tax_code ?? null) : null;

    const contactId = await findOrCreateContact(provider, conn, accessToken, clientRow);
    const invInput = { contactId, reference, lines: cleanLines, taxCode, dueDate };
    const created = docType === 'quote'
      ? await createDraftEstimate(provider, conn, accessToken, invInput)
      : await createDraftInvoice(provider, conn, accessToken, invInput);

    await admin.from('accounting_invoice_links').upsert({
      user_id: uid,
      order_id: docType === 'order' ? docId : null,
      quote_id: docType === 'quote' ? docId : null,
      doc_type: docType === 'quote' ? 'estimate' : 'invoice',
      provider,
      external_id: created.externalId,
      external_number: created.externalNumber,
      external_url: created.externalUrl,
      status: 'draft',
      pushed_at: new Date().toISOString(),
    }, { onConflict: docType === 'quote' ? 'user_id,quote_id,provider' : 'user_id,order_id,provider' });

    return jsonResponse({
      ok: true,
      provider,
      doc_type: docType === 'quote' ? 'estimate' : 'invoice',
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
