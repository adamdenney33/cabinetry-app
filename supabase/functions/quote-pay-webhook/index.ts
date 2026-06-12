// ProCabinet — Stripe webhook for customer quote payments (Connect).
//
// On payment_intent.succeeded it: marks the payment row succeeded, advances the
// quote to deposit_paid / paid, auto-creates the order from the customer's
// accepted lines, and best-effort drafts an invoice in the business's connected
// Xero/QuickBooks (reusing the accounting providers). Stripe is the source of
// truth — this only mirrors + fans out.
//
// DEPLOY NOTE: verify_jwt = false (Stripe signs the request, not a Supabase JWT).
// Use a SEPARATE webhook endpoint/secret from the subscription webhook.
// Env: STRIPE_SECRET_KEY, STRIPE_CONNECT_WEBHOOK_SECRET (fallback STRIPE_WEBHOOK_SECRET).

import { stripe, Stripe } from '../_shared/stripe.ts';
import { admin } from '../_shared/auth.ts';
import { loadConnection, getValidAccessToken } from '../_shared/connection.ts';
import { createDraftInvoice, findOrCreateContact, type InvoiceLineInput, type Provider } from '../_shared/providers.ts';

const WEBHOOK_SECRET = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? Deno.env.get('STRIPE_WEBHOOK_SECRET');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const sig = req.headers.get('stripe-signature');
  if (!sig || !WEBHOOK_SECRET) return new Response('Missing signature/secret', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try { event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET); }
  catch (err) { return new Response(`Bad signature: ${(err as Error).message}`, { status: 400 }); }

  try {
    if (event.type === 'payment_intent.succeeded') {
      await handleSucceeded(event.data.object as Stripe.PaymentIntent);
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      await admin.from('payments').update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('stripe_payment_intent', pi.id);
    }
  } catch (err) {
    console.error('[quote-pay-webhook]', (err as Error).message);
    return new Response('handler error', { status: 500 }); // let Stripe retry
  }
  return new Response(JSON.stringify({ received: true }), { status: 200, headers: { 'content-type': 'application/json' } });
});

async function handleSucceeded(pi: Stripe.PaymentIntent) {
  const now = new Date().toISOString();
  await admin.from('payments').update({ status: 'succeeded', customer_email: pi.receipt_email ?? null, updated_at: now })
    .eq('stripe_payment_intent', pi.id);

  const quoteId = Number(pi.metadata?.quote_id);
  const kind = pi.metadata?.kind === 'full' ? 'full' : 'deposit';
  if (!quoteId) return;

  const { data: quote } = await admin
    .from('quotes')
    .select('id, user_id, client_id, markup, tax, discount, stock_markup, accepted_at')
    .eq('id', quoteId).maybeSingle();
  if (!quote) return;

  // Acceptance is normally stamped by the page right after confirmPayment;
  // backfill it here so a closed tab can't leave a paid quote unaccepted
  // (accepted_at is also what locks the public page against further edits).
  await admin.from('quotes').update({
    status: kind === 'full' ? 'paid' : 'deposit_paid',
    accepted_at: quote.accepted_at ?? now,
  }).eq('id', quoteId);

  // Create the order once (idempotent on quote_id).
  const { data: existing } = await admin.from('orders').select('id').eq('quote_id', quoteId).maybeSingle();
  let orderId = existing?.id as number | undefined;
  if (!orderId) orderId = await createOrderFromQuote(quote);

  if (orderId) {
    try { await maybeDraftInvoice(quote.user_id, orderId); }
    catch (e) { console.error('[quote-pay-webhook] invoice draft failed (non-fatal):', (e as Error).message); }
  }
}

/** Copy the customer's accepted (included) quote lines into a new order. */
async function createOrderFromQuote(quote: any): Promise<number | undefined> {
  const { data: qlines } = await admin.from('quote_lines').select('*').eq('quote_id', quote.id).order('position');
  const included = (qlines ?? []).filter((l: any) => l.customer_included);

  let subtotal = 0;
  for (const l of included) subtotal += Number(l.customer_price) || 0;
  const value = subtotal + subtotal * (Number(quote.tax) || 0) / 100;

  // Next per-user order number, matching the app's _nextOrderNumber (ORD-####):
  // parse the digits out of every existing order_number, take the max, +1. (A
  // plain Number() on 'ORD-0042' is NaN, which is why the old code emitted 0001.)
  const { data: existing } = await admin.from('orders')
    .select('order_number').eq('user_id', quote.user_id);
  let maxN = 0;
  for (const o of (existing ?? [])) {
    const m = String((o as any).order_number || '').match(/(\d+)/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  }
  const nextNum = 'ORD-' + String(maxN + 1).padStart(4, '0');

  const { data: order, error } = await admin.from('orders').insert({
    user_id: quote.user_id, client_id: quote.client_id, quote_id: quote.id,
    status: 'confirmed', value, order_number: nextNum,
    markup: quote.markup ?? 0, tax: quote.tax ?? 0, discount: quote.discount ?? 0, stock_markup: quote.stock_markup ?? 0,
    due: 'TBD',
  }).select('id').single();
  if (error || !order) {
    // A concurrent webhook delivery for the same payment may have created the
    // order first; the unique index on orders(quote_id) makes our insert fail
    // with 23505. Treat that as "already done" and reuse the existing order
    // rather than creating a duplicate.
    if ((error as { code?: string } | null)?.code === '23505') {
      const { data: dup } = await admin.from('orders').select('id').eq('quote_id', quote.id).maybeSingle();
      if (dup?.id) return dup.id as number;
    }
    console.error('[quote-pay-webhook] order insert:', error?.message);
    return undefined;
  }

  const rows = included.map((l: any) => {
    const { id, quote_id, created_at, updated_at, ...rest } = l;
    return { ...rest, order_id: order.id, user_id: quote.user_id };
  });
  if (rows.length) await admin.from('order_lines').insert(rows);
  return order.id;
}

/** Draft an invoice in the first connected accounting provider, if any. */
async function maybeDraftInvoice(uid: string, orderId: number) {
  const { data: conns } = await admin.from('accounting_connections')
    .select('provider').eq('user_id', uid).eq('status', 'connected');
  const provider = conns?.[0]?.provider as Provider | undefined;
  if (!provider) return;

  const conn = await loadConnection(uid, provider);
  if (!conn || conn.status === 'revoked') return;
  const accessToken = await getValidAccessToken(conn);

  const { data: order } = await admin.from('orders')
    .select('id, order_number, client_id').eq('id', orderId).maybeSingle();
  if (!order) return;

  let clientRow: { name: string; email: string | null; phone: string | null; address: string | null } | null = null;
  if (order.client_id) {
    const { data } = await admin.from('clients').select('name, email, phone, address').eq('id', order.client_id).maybeSingle();
    clientRow = data as typeof clientRow;
  }
  if (!clientRow?.name) return;

  const { data: olines } = await admin.from('order_lines')
    .select('name, customer_price').eq('order_id', orderId).order('position');
  const lines: InvoiceLineInput[] = (olines ?? [])
    .filter((l: any) => l.customer_price != null)
    .map((l: any) => ({ description: String(l.name || 'Item'), amount: Number(l.customer_price) || 0 }));
  if (!lines.length) return;

  const reference = order.order_number || `ORD-${String(orderId).padStart(4, '0')}`;
  const contactId = await findOrCreateContact(provider, conn, accessToken, clientRow);
  const created = await createDraftInvoice(provider, conn, accessToken, {
    contactId, reference, lines, taxCode: conn.default_tax_code ?? null, dueDate: null,
  });

  await admin.from('accounting_invoice_links').upsert({
    user_id: uid, order_id: orderId, provider,
    external_id: created.externalId, external_number: created.externalNumber,
    external_url: created.externalUrl, status: 'draft', pushed_at: new Date().toISOString(),
  }, { onConflict: 'user_id,order_id,provider' });
}
