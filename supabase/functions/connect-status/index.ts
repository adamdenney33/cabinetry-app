// ProCabinet — refresh + report the business's Stripe Connect status.
//
// Authenticated. Pulls the latest account state from Stripe, mirrors it to
// public.stripe_accounts, and returns whether the business can take card
// payments yet. Called after onboarding return and to render the settings card.
// verify_jwt: true.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { admin, authenticateCaller } from '../_shared/auth.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, cors);

  const auth = await authenticateCaller(req, cors);
  if ('error' in auth) return auth.error;
  const uid = auth.user.id;

  try {
    const { data: row } = await admin
      .from('stripe_accounts').select('stripe_account_id')
      .eq('user_id', uid).maybeSingle();
    if (!row?.stripe_account_id) {
      return jsonResponse({ connected: false, charges_enabled: false }, 200, cors);
    }

    const acct = await stripe.accounts.retrieve(row.stripe_account_id);
    const patch = {
      charges_enabled: !!acct.charges_enabled,
      payouts_enabled: !!acct.payouts_enabled,
      details_submitted: !!acct.details_submitted,
      country: acct.country ?? null,
      default_currency: acct.default_currency ?? null,
      updated_at: new Date().toISOString(),
    };
    await admin.from('stripe_accounts').update(patch).eq('user_id', uid);

    return jsonResponse({ connected: true, ...patch }, 200, cors);
  } catch (err) {
    console.error('[connect-status]', (err as Error).message);
    return jsonResponse({ error: (err as Error).message }, 500, cors);
  }
});
