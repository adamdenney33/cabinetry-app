// ProCabinet — Stripe subscription pricing reader.
//
// Receives a request from the authenticated client (with a Supabase JWT) and
// returns the caller's current subscription pricing: what they pay now, the
// standard price once any promo discount ends, and when that increase lands.
// Stripe is the source of truth — the `subscriptions` table mirrors only
// plan/status/period, never the coupon — so the Manage Subscription popup
// reads this live instead of guessing from a static price.
//
// Required env vars (set via `supabase secrets set`):
//   STRIPE_SECRET_KEY          — sk_test_... / sk_live_...
//   SUPABASE_URL               — auto-provided
//   SUPABASE_SERVICE_ROLE_KEY  — auto-provided
//
// Request body: (none required)
// Response:     { currency, interval, standardAmount, currentAmount, discountEnd }
//                 — amounts are integer minor units (cents); discountEnd is an
//                   ISO string or null; every field is null when there is no
//                   live Stripe subscription to read (founder / free).
//                 OR
//               { error: string }  — display in UI

import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required env vars for stripe-subscription function');
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-09-30.acacia',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

// Resolve the single active discount on a subscription, tolerating both the
// `discounts` array (Stripe API 2024-09-30+) and the legacy singular
// `discount`. Returns null when neither is present or expanded.
function firstDiscount(sub: Stripe.Subscription): Stripe.Discount | null {
  const anySub = sub as unknown as {
    discounts?: Array<string | Stripe.Discount> | null;
    discount?: Stripe.Discount | null;
  };
  for (const d of anySub.discounts ?? []) {
    if (d && typeof d === 'object') return d;
  }
  return anySub.discount ?? null;
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
  // asking, so we know which subscription to read.
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return json({ error: 'Not authenticated' }, 401);
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Invalid auth token' }, 401);

  const { data: row } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', user.id)
    .maybeSingle();

  // Founder (one-off purchase, no Stripe Subscription) or free → nothing to
  // price. Return an all-null shape so the client falls back cleanly.
  const empty = {
    currency: null,
    interval: null,
    standardAmount: null,
    currentAmount: null,
    discountEnd: null,
  };
  if (!row?.stripe_subscription_id) return json(empty, 200);

  try {
    const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id, {
      expand: ['discounts'],
    });

    const price = sub.items.data[0]?.price;
    if (!price || price.unit_amount == null) {
      return json({ error: 'Subscription item has no fixed price' }, 502);
    }

    const standardAmount = price.unit_amount;
    let currentAmount = standardAmount;
    let discountEnd: string | null = null;

    const discount = firstDiscount(sub);
    const coupon = discount?.coupon;
    if (coupon) {
      if (typeof coupon.percent_off === 'number') {
        currentAmount = Math.round(standardAmount * (1 - coupon.percent_off / 100));
      } else if (typeof coupon.amount_off === 'number') {
        currentAmount = Math.max(0, standardAmount - coupon.amount_off);
      }
      // `discount.end` is the moment the coupon stops applying — i.e. the
      // first full-price renewal. Null for `forever` coupons (no increase).
      discountEnd = discount?.end ? new Date(discount.end * 1000).toISOString() : null;
    }

    return json({
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
      standardAmount,
      currentAmount,
      discountEnd,
    }, 200);
  } catch (err) {
    console.error('[stripe-subscription] Error:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
