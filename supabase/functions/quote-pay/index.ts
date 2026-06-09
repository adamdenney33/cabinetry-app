// ProCabinet — create a PaymentIntent for a shared quote (PUBLIC, token-scoped).
//
// UNAUTHENTICATED (the customer is anon). Resolves the quote by share_token,
// computes the amount SERVER-SIDE from the snapshotted customer_price (the
// customer can't dictate what they pay), and creates a DIRECT charge on the
// business's connected account with ProCabinet's application fee. Returns a
// client_secret + publishable key + connected account_id for Stripe.js to confirm.
//
// DEPLOY NOTE: verify_jwt = false.
// Env: STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_PLATFORM_FEE_BPS.
//
// Body: { token, kind: 'deposit' | 'full' }

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin } from '../_shared/auth.ts';
import { stripe, STRIPE_PUBLISHABLE_KEY, platformFee } from '../_shared/stripe.ts';

const CUR_MAP: Record<string, string> = { '£': 'gbp', '$': 'usd', '€': 'eur', 'A$': 'aud' };

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  let token = '', kind = 'deposit';
  try { const b = await req.json(); token = String(b.token || ''); kind = b.kind === 'full' ? 'full' : 'deposit'; }
  catch { return jsonResponse({ error: 'Invalid request body' }, 400, cors); }
  if (!token || token.length < 8) return jsonResponse({ error: 'Missing token' }, 400, cors);

  try {
    // ── Resolve quote + gate ──
    const { data: quote, error: qErr } = await admin
      .from('quotes').select('id, user_id, tax, share_settings, accepted_at')
      .eq('share_token', token).maybeSingle();
    if (qErr) throw new Error(qErr.message);
    if (!quote) return jsonResponse({ error: 'not_found' }, 404, cors);

    const settings = (quote.share_settings ?? {}) as Record<string, unknown>;
    if (!settings.accept_payment) return jsonResponse({ error: 'payments_disabled' }, 403, cors);
    // Don't take money on an expired link (quote-public-get / -update already
    // block view + accept past expiry; this closes the same gap for payment).
    if (settings.expires_at && new Date(String(settings.expires_at)) < new Date()) {
      return jsonResponse({ error: 'expired' }, 410, cors);
    }

    // ── Business's connected account must be able to take charges ──
    const { data: acct } = await admin
      .from('stripe_accounts')
      .select('stripe_account_id, charges_enabled, default_currency')
      .eq('user_id', quote.user_id).maybeSingle();
    if (!acct?.stripe_account_id || !acct.charges_enabled) {
      return jsonResponse({ error: 'payments_unavailable' }, 400, cors);
    }

    // ── Authoritative amount, computed server-side ──
    const { data: lines } = await admin
      .from('quote_lines').select('customer_included, customer_price')
      .eq('quote_id', quote.id);
    let subtotal = 0;
    for (const l of (lines ?? [])) {
      if (!l.customer_included) continue;
      // An included line with no price = a spec change awaiting re-pricing.
      // Refuse to charge rather than silently under-collecting.
      if (l.customer_price == null) return jsonResponse({ error: 'price_pending' }, 409, cors);
      subtotal += Number(l.customer_price) || 0;
    }
    const tax = subtotal * (Number(quote.tax) || 0) / 100;
    const total = subtotal + tax;
    const depPct = Number(settings.deposit_pct) || 0;
    const amount = kind === 'deposit' && depPct > 0 ? total * depPct / 100 : total;
    if (!(amount > 0)) return jsonResponse({ error: 'nothing_to_pay' }, 400, cors);

    // ── Currency: connected account default, else the business's symbol ──
    let currency = (acct.default_currency as string | null) || '';
    if (!currency) {
      const { data: biz } = await admin
        .from('business_info').select('default_currency').eq('user_id', quote.user_id).maybeSingle();
      currency = CUR_MAP[(biz?.default_currency as string) || '£'] || 'gbp';
    }
    const amountMinor = Math.round(amount * 100);
    const fee = platformFee(amountMinor, currency);

    // DIRECT charge: the PaymentIntent is created ON the connected account (via the
    // stripeAccount option), so the maker is merchant of record and pays Stripe's
    // processing fee; application_fee_amount is transferred to the ProCabinet platform.
    const pi = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency,
      application_fee_amount: fee,
      automatic_payment_methods: { enabled: true },
      metadata: { quote_id: String(quote.id), user_id: quote.user_id, kind },
    }, { stripeAccount: acct.stripe_account_id });

    await admin.from('payments').upsert({
      user_id: quote.user_id,
      quote_id: quote.id,
      stripe_payment_intent: pi.id,
      kind,
      amount,
      application_fee: fee / 100,
      currency,
      status: 'pending',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_payment_intent' });

    return jsonResponse({
      client_secret: pi.client_secret,
      publishable_key: STRIPE_PUBLISHABLE_KEY,
      account_id: acct.stripe_account_id,   // direct charge → Stripe.js must init with { stripeAccount }
      amount, currency, kind,
    }, 200, cors);
  } catch (err) {
    console.error('[quote-pay]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
