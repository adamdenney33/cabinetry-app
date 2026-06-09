// Shared Stripe client + Connect helpers for the customer-payment functions
// (connect-onboard / connect-status / quote-pay / quote-pay-webhook).
//
// Customers pay the BUSINESS's connected account directly (Stripe Connect, DIRECT
// charges — the connected account is merchant of record and pays Stripe's
// processing fee) and ProCabinet takes an application fee on top. Mirrors the
// stripe@17 Deno setup the subscription functions use.

import Stripe from 'https://esm.sh/stripe@17?target=deno';

// Connect runs on its OWN Stripe key, decoupled from the (live) subscription key.
// The subscription functions read STRIPE_SECRET_KEY directly and never import this
// file, so they're unaffected. Decoupling lets customer-payments run in test mode /
// a sandbox while live billing keeps running on STRIPE_SECRET_KEY. Falls back to the
// shared key when STRIPE_CONNECT_SECRET_KEY isn't set (i.e. once payments goes live too).
const KEY = Deno.env.get('STRIPE_CONNECT_SECRET_KEY') ?? Deno.env.get('STRIPE_SECRET_KEY');
if (!KEY) throw new Error('Missing STRIPE_CONNECT_SECRET_KEY / STRIPE_SECRET_KEY');

export const stripe = new Stripe(KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

/** Publishable key for the Connect environment — returned to the public page so
 *  Stripe.js can confirm the connected-account PaymentIntent (direct charges). MUST
 *  match STRIPE_CONNECT_SECRET_KEY's mode; falls back to STRIPE_PUBLISHABLE_KEY. */
export const STRIPE_PUBLISHABLE_KEY =
  Deno.env.get('STRIPE_CONNECT_PUBLISHABLE_KEY') ?? Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '';

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://procabinet.app';

/** Platform fee in basis points (100 bps = 1%). Defaults to 0.7% — the agreed
 *  ProCabinet rate. Override with STRIPE_PLATFORM_FEE_BPS (70 = 0.7%). */
export const PLATFORM_FEE_BPS = Number(Deno.env.get('STRIPE_PLATFORM_FEE_BPS') ?? '70');

/** Per-payment fee cap in the smallest currency unit (≈ $100 USD-equivalent).
 *  Keeps the fee fair on big-ticket jobs — a $30k kitchen is capped, not 0.7%. */
const FEE_CAP_MINOR: Record<string, number> = {
  usd: 10000, gbp: 8000, eur: 9000, cad: 13500, aud: 15000, nzd: 16500,
};

/** ProCabinet's application fee on a charge, in the smallest currency unit:
 *  PLATFORM_FEE_BPS (0.7%) capped at ~$100-equivalent for the charge currency. */
export function platformFee(amountMinor: number, currency: string): number {
  const pct = Math.round(amountMinor * PLATFORM_FEE_BPS / 10000);
  const cap = FEE_CAP_MINOR[(currency || '').toLowerCase()] ?? 10000;
  return Math.max(0, Math.min(pct, cap));
}

export { Stripe };
