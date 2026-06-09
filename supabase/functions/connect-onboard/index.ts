// ProCabinet — Stripe Connect onboarding for the business (Pro).
//
// Authenticated. Creates (or reuses) the business's Standard connected account and
// returns a Stripe-hosted onboarding URL. Once onboarding completes, customers
// can pay the business directly on the live quote page (with the platform fee).
//
// Env: STRIPE_SECRET_KEY, APP_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// verify_jwt: true.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { stripe, APP_URL } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const uid = auth.user.id;

  try {
    // Reuse an existing connected account if we have one.
    const { data: row } = await admin
      .from('stripe_accounts').select('stripe_account_id')
      .eq('user_id', uid).maybeSingle();

    let accountId = row?.stripe_account_id as string | undefined;
    if (!accountId) {
      // Standard account: the maker gets their own Stripe dashboard, is merchant
      // of record, and pays Stripe's processing fee (we take only the application
      // fee on direct charges). Standard accounts manage their own capabilities,
      // so we don't request them here. Account Links hosted onboarding is supported.
      const account = await stripe.accounts.create({
        type: 'standard',
        email: auth.user.email ?? undefined,
        metadata: { user_id: uid },
      });
      accountId = account.id;
      await admin.from('stripe_accounts').upsert({
        user_id: uid,
        stripe_account_id: accountId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    }

    // Fresh, single-use onboarding link.
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${APP_URL}/os?connect=refresh`,
      return_url: `${APP_URL}/os?connect=return`,
      type: 'account_onboarding',
    });

    return jsonResponse({ url: link.url, account_id: accountId }, 200, cors);
  } catch (err) {
    console.error('[connect-onboard]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
