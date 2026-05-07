// ProCabinet — Stripe webhook handler.
//
// Receives signed webhook events from Stripe and syncs subscription state
// to the `subscriptions` table via the Supabase service role key (which
// bypasses RLS). Stripe is the source of truth — this function only mirrors
// state, never originates it.
//
// Required env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY          — sk_test_... / sk_live_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... (per webhook endpoint, from Stripe dashboard)
//   STRIPE_PRICE_MONTHLY       — price_... for the monthly Pro plan
//   STRIPE_PRICE_ANNUAL        — price_... for the annual Pro plan
//   SUPABASE_URL               — auto-provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY  — auto-provided by Supabase
//
// Local dev: forward live Stripe events to the running function with
//   stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
// then trigger events from the Stripe Dashboard or with `stripe trigger ...`.

import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_MONTHLY');
const PRICE_ANNUAL = Deno.env.get('STRIPE_PRICE_ANNUAL');

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env vars for stripe-webhook function');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // Pin the API version explicitly so account-default upgrades don't
  // silently change webhook payload shapes. Matches the stripe@17 SDK's
  // default. Bump intentionally after testing.
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── helpers ────────────────────────────────────────────────────────────

function planFromPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  if (priceId === PRICE_MONTHLY) return 'pro_monthly';
  if (priceId === PRICE_ANNUAL) return 'pro_annual';
  return null;
}

function tsFromUnix(unix: number | null | undefined): string | null {
  if (!unix) return null;
  return new Date(unix * 1000).toISOString();
}

// The user_id is stored on the Stripe Customer's metadata when we create
// the Customer in the Checkout Edge Function. This is the link between
// our auth.users.id and Stripe's customer object.
async function getUserIdForCustomer(customerId: string): Promise<string | null> {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  return customer.metadata?.user_id ?? null;
}

interface SubscriptionUpsertPayload {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  updated_at: string;
}

async function upsertSubscription(payload: SubscriptionUpsertPayload) {
  const { error } = await supabase
    .from('subscriptions')
    .upsert(payload, { onConflict: 'user_id' });
  if (error) throw new Error(`Subscription upsert failed: ${error.message}`);
}

// Build the subscriptions-table row from a Stripe Subscription. Used by
// every event type that has subscription state (created/updated/deleted/payment_failed).
async function syncFromStripeSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  const userId = await getUserIdForCustomer(customerId);
  if (!userId) {
    console.warn(`[stripe-webhook] No user_id metadata on customer ${customerId} — skipping`);
    return;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;
  // Stripe API 2025-09-30+: current_period_* lives on the subscription item,
  // not the subscription. Fall back for older API versions.
  const periodStart =
    (item as Stripe.SubscriptionItem & { current_period_start?: number })?.current_period_start ??
    (subscription as unknown as { current_period_start?: number }).current_period_start;
  const periodEnd =
    (item as Stripe.SubscriptionItem & { current_period_end?: number })?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end;

  await upsertSubscription({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan: planFromPriceId(priceId),
    status: subscription.status,
    current_period_start: tsFromUnix(periodStart),
    current_period_end: tsFromUnix(periodEnd),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: tsFromUnix(subscription.canceled_at),
    updated_at: new Date().toISOString(),
  });
}

// ── handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', (err as Error).message);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    switch (event.type) {
      // Initial subscription creation. Fires when Checkout completes
      // successfully. We re-fetch the subscription so we get the full,
      // current shape (Checkout sessions include only a subset).
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.subscription) break;
        const subId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subId);
        await syncFromStripeSubscription(subscription);
        break;
      }

      // Plan changes, status changes (active → past_due → canceled), etc.
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncFromStripeSubscription(subscription);
        break;
      }

      // Card declined or other payment failure. Status will already be
      // 'past_due' or 'unpaid' on the subscription object — re-sync from it.
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription };
        if (!invoice.subscription) break;
        const subId =
          typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id;
        const subscription = await stripe.subscriptions.retrieve(subId);
        await syncFromStripeSubscription(subscription);
        break;
      }

      // All other events are intentionally ignored. Stripe sends ~50 event
      // types; only the four above mutate subscription state we care about.
      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    // Returning 5xx tells Stripe to retry (up to 3 days, with backoff).
    // 4xx tells Stripe to give up. We use 500 because most failures here
    // (network blips, transient DB errors) are worth retrying.
    console.error(`[stripe-webhook] Error handling ${event.type}:`, (err as Error).message);
    return new Response(`Error: ${(err as Error).message}`, { status: 500 });
  }
});
