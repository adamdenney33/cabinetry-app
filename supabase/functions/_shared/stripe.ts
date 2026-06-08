// Shared Stripe client + Connect helpers for the customer-payment functions
// (connect-onboard / connect-status / quote-pay / quote-pay-webhook).
//
// Customers pay into the BUSINESS's connected account (Stripe Connect, destination
// charges) and ProCabinet takes an application fee — the "competitive market
// rate" the platform earns on each transaction. Mirrors the stripe@17 Deno
// setup the subscription functions use.

import Stripe from 'https://esm.sh/stripe@17?target=deno';

const KEY = Deno.env.get('STRIPE_SECRET_KEY');
if (!KEY) throw new Error('Missing STRIPE_SECRET_KEY');

export const stripe = new Stripe(KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

/** Platform publishable key — returned to the public page so Stripe.js can
 *  confirm the PaymentIntent (destination charges live on the platform). */
export const STRIPE_PUBLISHABLE_KEY = Deno.env.get('STRIPE_PUBLISHABLE_KEY') ?? '';

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://procabinet.app';

/** Platform fee in basis points (100 bps = 1%). Defaults to 1.5%. Set
 *  STRIPE_PLATFORM_FEE_BPS to the agreed competitive rate. */
export const PLATFORM_FEE_BPS = Number(Deno.env.get('STRIPE_PLATFORM_FEE_BPS') ?? '150');

/** ProCabinet's application fee on a charge, in the smallest currency unit. */
export function platformFee(amountMinor: number): number {
  return Math.max(0, Math.round(amountMinor * PLATFORM_FEE_BPS / 10000));
}

export { Stripe };
