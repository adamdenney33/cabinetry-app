// ProCabinet — Stripe Checkout session creator.
//
// Receives a request from the authenticated client (with a Supabase JWT) and
// returns a Stripe Checkout session URL the user can be redirected to. The
// secret key never leaves this function.
//
// Required env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY          — sk_test_... / sk_live_...
//   STRIPE_PRICE_MONTHLY       — price_... for monthly Pro
//   STRIPE_PRICE_ANNUAL        — price_... for annual Pro
//   APP_URL                    — https://procabinet.app (or http://localhost:3000 in dev)
//   SUPABASE_URL               — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY  — auto-provided
//
// Request body: { cadence: 'monthly' | 'annual' }
// Response:     { url: string }    — redirect the user here
//                 OR
//               { error: string }  — display in UI

import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_MONTHLY');
const PRICE_ANNUAL = Deno.env.get('STRIPE_PRICE_ANNUAL');
const APP_URL = Deno.env.get('APP_URL') ?? 'https://procabinet.app';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    'access-control-allow-headers': 'authorization, content-type',
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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: cors });
  }

  // Authenticate via the user's Supabase JWT — this proves which user is
  // requesting Checkout, so we know which Stripe Customer to use.
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
      status: 401,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  // Parse + validate the cadence.
  let cadence: 'monthly' | 'annual';
  try {
    const body = await req.json();
    if (body.cadence !== 'monthly' && body.cadence !== 'annual') {
      throw new Error('cadence must be "monthly" or "annual"');
    }
    cadence = body.cadence;
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const priceId = cadence === 'monthly' ? PRICE_MONTHLY! : PRICE_ANNUAL!;

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email ?? null);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Adaptive Pricing handles local-currency conversion automatically
      // (must be enabled in Stripe Dashboard → Settings → Currency settings).
      success_url: `${APP_URL}/?upgrade=success`,
      cancel_url: `${APP_URL}/?upgrade=cancelled`,
      // Allow promo codes at checkout — easy lever for early-user discounts.
      allow_promotion_codes: true,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[stripe-checkout] Error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...cors, 'content-type': 'application/json' },
    });
  }
});
