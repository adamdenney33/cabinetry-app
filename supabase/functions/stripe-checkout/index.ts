// ProCabinet — Stripe Checkout session creator.
//
// Receives a request from the authenticated client (with a Supabase JWT) and
// returns a Stripe Checkout session URL the user can be redirected to. The
// secret key never leaves this function.
//
// Required env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY          — sk_test_... / sk_live_...
//   STRIPE_PRICE_MONTHLY       — price_... for monthly Pro ($35/mo)
//   STRIPE_PRICE_ANNUAL        — price_... for annual Pro ($300/yr)
//   APP_URL                    — https://procabinet.app (or http://localhost:3000 in dev)
//   SUPABASE_URL               — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY  — auto-provided
//
// Optional env vars (monthly/annual still work without them):
//   STRIPE_PRICE_FOUNDER          — price_... for the one-off $299 Founder plan
//   STRIPE_COUPON_MONTHLY_LAUNCH  — coupon_... auto-applied to monthly checkouts
//   STRIPE_COUPON_ANNUAL_LAUNCH   — coupon_... auto-applied to annual checkouts
//
// Request body: { plan: 'monthly' | 'annual' | 'founder' }
//   (legacy `{ cadence }` is still accepted)
// Response:     { url: string }    — redirect the user here
//                 OR
//               { error: string }  — display in UI

import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_MONTHLY');
const PRICE_ANNUAL = Deno.env.get('STRIPE_PRICE_ANNUAL');
const PRICE_FOUNDER = Deno.env.get('STRIPE_PRICE_FOUNDER');
const COUPON_MONTHLY = Deno.env.get('STRIPE_COUPON_MONTHLY_LAUNCH');
const COUPON_ANNUAL = Deno.env.get('STRIPE_COUPON_ANNUAL_LAUNCH');
const APP_URL = Deno.env.get('APP_URL') ?? 'https://procabinet.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Founder plan — total lifetime accounts ever sold. Mirrors FOUNDER_CAP in
// src/limits.js. Enforced here so the cap can't be bypassed client-side.
const FOUNDER_CAP = 50;

if (!STRIPE_SECRET_KEY || !PRICE_MONTHLY || !PRICE_ANNUAL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env vars for stripe-checkout function');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  // Matches the stripe@17 SDK's default. The webhook payload version
  // (account default in Stripe Dashboard) can differ — handler accommodates.
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// CORS for the client — the function is called from procabinet.app (and
// localhost in dev). Mirror the origin instead of '*' so cookies/credentials
// can travel if we ever need them.
const ALLOWED_ORIGINS = new Set([
  'https://procabinet.app',
  'http://localhost:3000',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://procabinet.app';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
}

// Resolve (or create) the Stripe Customer for this Supabase user. We store
// `user_id` in the customer's metadata so the webhook function can map back
// from a Stripe event to our auth.users.id.
async function getOrCreateCustomer(userId: string, email: string | null): Promise<string> {
  // Look up an existing subscription row first — fastest path.
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  // No row yet — search Stripe by metadata in case a customer was created
  // in a previous run that we never persisted.
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 1,
  });
  if (search.data[0]) return search.data[0].id;

  // Brand-new customer.
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { user_id: userId },
  });
  return customer.id;
}

// Count Founder accounts already sold. Enforces the 50-seat cap before a
// Founder Checkout session is created. (A brief race between two simultaneous
// buyers could let one extra through — acceptable for a launch promo.)
async function founderSeatsTaken(): Promise<number> {
  const { count } = await supabase
    .from('subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('plan', 'founder')
    .eq('status', 'active');
  return count ?? 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    });

  // Authenticate via the user's Supabase JWT — this proves which user is
  // requesting Checkout, so we know which Stripe Customer to use.
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Not authenticated' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Invalid auth token' }, 401);

  // Parse + validate the requested plan. `cadence` is the legacy field name.
  let plan: 'monthly' | 'annual' | 'founder';
  try {
    const body = await req.json();
    const raw = body.plan ?? body.cadence;
    if (raw !== 'monthly' && raw !== 'annual' && raw !== 'founder') {
      throw new Error('plan must be "monthly", "annual" or "founder"');
    }
    plan = raw;
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email ?? null);

    let session: Stripe.Checkout.Session;

    if (plan === 'founder') {
      if (!PRICE_FOUNDER) {
        return json({ error: 'The Founder plan is not available yet.' }, 400);
      }
      if ((await founderSeatsTaken()) >= FOUNDER_CAP) {
        return json({ error: 'Founder seats are sold out.' }, 409);
      }
      // One-off payment — no subscription. The webhook reads metadata.plan to
      // record a lifetime 'founder' subscription row.
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        line_items: [{ price: PRICE_FOUNDER, quantity: 1 }],
        metadata: { plan: 'founder', user_id: user.id },
        payment_intent_data: { metadata: { plan: 'founder', user_id: user.id } },
        success_url: `${APP_URL}/os?upgrade=success&plan=founder`,
        cancel_url: `${APP_URL}/os?upgrade=cancelled`,
      });
    } else {
      const priceId = plan === 'monthly' ? PRICE_MONTHLY! : PRICE_ANNUAL!;
      const coupon = plan === 'monthly' ? COUPON_MONTHLY : COUPON_ANNUAL;
      const params: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        // Adaptive Pricing handles local-currency conversion automatically
        // (must be enabled in Stripe Dashboard → Settings → Currency settings).
        success_url: `${APP_URL}/os?upgrade=success&plan=${plan}`,
        cancel_url: `${APP_URL}/os?upgrade=cancelled`,
      };
      // `discounts` and `allow_promotion_codes` are mutually exclusive. Apply
      // the launch coupon automatically when one is configured; otherwise let
      // the user enter a promo code at Checkout.
      if (coupon) {
        params.discounts = [{ coupon }];
      } else {
        params.allow_promotion_codes = true;
      }
      session = await stripe.checkout.sessions.create(params);
    }

    return json({ url: session.url }, 200);
  } catch (err) {
    console.error('[stripe-checkout] Error:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
