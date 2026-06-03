// ProCabinet — Stripe Checkout + Customer Portal client.
//
// Loaded as a classic <script defer> after src/limits.js. Exposes
// `startCheckout(cadence)`, `openCustomerPortal()`, return handlers,
// and `renderSubscriptionSection()` for the account dropdown.
//
// Cross-file dependencies: _sb (src/db.js), _toast / _openPopup /
// _closePopup / _confirm (src/ui.js), _userId / _subscription / isPro
// (src/limits.js, src/app.js).

// ══════════════════════════════════════════
// CHECKOUT FLOW
// ══════════════════════════════════════════
/**
 * @param {'monthly' | 'annual' | 'founder'} plan
 * @returns {Promise<void>}
 */
async function startCheckout(plan) {
  if (plan !== 'monthly' && plan !== 'annual' && plan !== 'founder') {
    throw new Error('startCheckout: plan must be "monthly", "annual" or "founder"');
  }

  const { data: { session } } = await _sb.auth.getSession();
  if (!session) throw new Error('Sign in to upgrade to Pro');

  const url = `${window._SBURL}/functions/v1/stripe-checkout`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ plan }),
  });

  if (!res.ok) {
    /** @type {{error?: string}} */
    let payload = {};
    try { payload = await res.json(); } catch (_e) { /* response wasn't JSON */ }
    throw new Error(payload.error || `Checkout failed (${res.status})`);
  }

  /** @type {{url: string}} */
  const { url: checkoutUrl } = await res.json();
  window.location.href = checkoutUrl;
}

// ══════════════════════════════════════════
// CUSTOMER PORTAL
// ══════════════════════════════════════════
/**
 * Open a Stripe Customer Portal session for the current user. Redirects
 * the browser to Stripe's hosted portal where the subscriber can manage
 * payment methods, view invoices, cancel, or switch plans.
 *
 * @returns {Promise<void>}
 */
async function openCustomerPortal() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) throw new Error('Sign in to manage your subscription');

  const url = `${window._SBURL}/functions/v1/stripe-portal`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
  });

  if (!res.ok) {
    /** @type {{error?: string}} */
    let payload = {};
    try { payload = await res.json(); } catch (_e) { /* response wasn't JSON */ }
    throw new Error(payload.error || `Portal failed (${res.status})`);
  }

  /** @type {{url: string}} */
  const { url: portalUrl } = await res.json();
  window.location.href = portalUrl;
}

/**
 * Redirect to the Customer Portal with a catch-to-toast wrapper.
 * Called from the manage subscription popup action rows.
 */
function _portalAction() {
  _closePopup();
  openCustomerPortal().catch(err => {
    const msg = (err && err.message) || 'Failed to open billing portal';
    if (typeof _toast === 'function') _toast(msg, 'error');
  });
}

// ══════════════════════════════════════════
// RETURN-FROM-CHECKOUT HANDLER
// ══════════════════════════════════════════
/**
 * Show a toast on `?upgrade=success` / `?upgrade=cancelled` query params.
 * Called once on page load from app.js.
 */
function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const upgrade = params.get('upgrade');
  if (!upgrade) return;
  if (upgrade === 'success') {
    const _plan = params.get('plan') || 'unknown';
    // Monthly/annual now begin a 14-day card-upfront trial (no charge yet);
    // Founder is an immediate one-off lifetime purchase.
    const _isTrialPlan = _plan === 'monthly' || _plan === 'annual';
    const _days = (typeof TRIAL_DAYS !== 'undefined') ? TRIAL_DAYS : 14;
    if (typeof _toast === 'function') {
      _toast(_isTrialPlan ? `Your ${_days}-day free trial has started!` : 'Welcome to Pro! Your purchase is confirmed.', 'success');
    }
    // Product-analytics (PostHog). `trial_started` marks the start of the
    // 14-day trial (no charge yet); the real day-15 paid conversion is best
    // captured server-side from the webhook (recommended follow-up, see PLAN.md).
    if (typeof _track === 'function' && _isTrialPlan) _track('trial_started', { plan: _plan });
    // Ad-platform conversions (Meta / GA4 / Google Ads). NOTE: for trial plans
    // this fires at trial START ($0), not a sale — see _trackPurchaseConversion
    // and PLAN.md (recommended follow-up: server-side paid signal at day 15).
    if (typeof _trackPurchaseConversion === 'function') _trackPurchaseConversion(_plan);
    setTimeout(() => { if (typeof loadSubscription === 'function') loadSubscription(); }, 2000);
  } else if (upgrade === 'cancelled') {
    if (typeof _toast === 'function') _toast('Checkout cancelled — no charge made.', 'error');
  }
  params.delete('upgrade');
  const cleaned = params.toString();
  const newUrl = window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash;
  window.history.replaceState({}, '', newUrl);
}

// ══════════════════════════════════════════
// RETURN-FROM-PORTAL HANDLER
// ══════════════════════════════════════════
/**
 * Show a toast on `?portal=returned` and refresh subscription state.
 * Called once on page load from app.js.
 */
function handlePortalReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('portal') !== 'returned') return;
  if (typeof _toast === 'function') _toast('Subscription updated.', 'success');
  setTimeout(() => { if (typeof loadSubscription === 'function') loadSubscription(); }, 2000);
  params.delete('portal');
  const cleaned = params.toString();
  const newUrl = window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash;
  window.history.replaceState({}, '', newUrl);
}

// ══════════════════════════════════════════
// ACCOUNT DROPDOWN — SUBSCRIPTION SECTION
// ══════════════════════════════════════════
/**
 * Render the Subscription block inside the account dropdown.
 * Called on init, after loadSubscription(), and on sign-in/out.
 */
function renderSubscriptionSection() {
  const el = document.getElementById('account-subscription-content');
  if (!el) return;

  if (!_userId) {
    el.innerHTML = '';
    return;
  }

  if (typeof isPro === 'function' && isPro()) {
    const sub = _subscription;
    if (sub?.plan === 'founder') {
      el.innerHTML = `
      <div class="account-plan-row">
        <span class="account-plan-name">Founder</span>
        <span class="badge badge-green">Lifetime</span>
      </div>
      <div class="account-menu-item" style="color:var(--muted);font-size:11px;cursor:default;padding-bottom:4px">Lifetime access — thanks for backing ProCabinet.</div>
    `;
      return;
    }
    const planLabel = sub?.plan === 'pro_annual' ? 'Pro · Annual' : 'Pro · Monthly';
    const periodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString()
      : '';
    // Trial in progress — countdown + when billing begins.
    if (sub?.status === 'trialing') {
      const left = (typeof _trialDaysLeft === 'function') ? _trialDaysLeft() : null;
      const leftLabel = left != null ? `${left} day${left === 1 ? '' : 's'} left` : 'Trialing';
      const billLine = periodEnd
        ? (sub?.cancel_at_period_end
            ? `Ends ${periodEnd} — you won't be charged`
            : `Billing starts ${periodEnd}`)
        : '';
      el.innerHTML = `
      <div class="account-plan-row">
        <span class="account-plan-name">Free trial</span>
        <span class="badge badge-green">${leftLabel}</span>
      </div>
      ${billLine ? `<div class="account-menu-item" style="color:var(--muted);font-size:11px;cursor:default;padding-bottom:4px">${billLine}</div>` : ''}
      <div class="account-menu-item" onclick="_handleManageSubscription()" style="color:var(--accent);font-weight:600">Manage subscription</div>
    `;
      return;
    }
    const renewLine = sub?.cancel_at_period_end
      ? `Cancels ${periodEnd}`
      : periodEnd ? `Renews ${periodEnd}` : '';
    el.innerHTML = `
      <div class="account-plan-row">
        <span class="account-plan-name">${planLabel}</span>
        <span class="badge badge-green">Active</span>
      </div>
      ${renewLine ? `<div class="account-menu-item" style="color:var(--muted);font-size:11px;cursor:default;padding-bottom:4px">${renewLine}</div>` : ''}
      <div class="account-menu-item" onclick="_handleManageSubscription()" style="color:var(--accent);font-weight:600">Manage subscription</div>
    `;
    return;
  }

  // Grandfathered (legacy, pre-trial) user — old free tier: 5 items/library, no
  // read-only lock. Upgrade opens the trial/plan picker for unlimited.
  if (typeof isGrandfathered === 'function' && isGrandfathered()) {
    el.innerHTML = `
      <div class="account-plan-row">
        <span class="account-plan-name">Free (legacy)</span>
        <span class="badge badge-orange">5/library</span>
      </div>
      <div class="account-menu-item" style="color:var(--muted);font-size:11px;cursor:default;padding-bottom:4px">Early-user plan — 5 items per library. Upgrade any time for unlimited.</div>
      <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
        <button onclick="_wtStartCta()" style="width:100%;padding:8px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
          Upgrade to Pro
        </button>
      </div>
    `;
    return;
  }

  // Read-only — no active trial/subscription.
  //   past_due → fix the card via the Stripe portal (NOT a fresh checkout)
  //   lapsed   → resubscribe
  //   none     → start the 14-day trial via the walkthrough plan-picker CTA
  const _st = (typeof _subState === 'function') ? _subState() : 'none';
  const _days = (typeof TRIAL_DAYS !== 'undefined') ? TRIAL_DAYS : 14;
  let roName = 'Read-only', roBadge, roBtnLabel, roBtnAction;
  if (_st === 'past_due') {
    roName = 'Payment failed';
    roBadge = 'Past due';
    roBtnLabel = 'Update payment';
    roBtnAction = `_handleManageSubscription()`;
  } else if (_st === 'lapsed') {
    roBadge = 'No plan';
    roBtnLabel = 'Resubscribe';
    roBtnAction = `_openTrialModal({mode:'resubscribe'})`;
  } else {
    roBadge = `${_days}-day trial`;
    roBtnLabel = 'Start free trial';
    roBtnAction = `_wtStartCta()`;
  }
  el.innerHTML = `
    <div class="account-plan-row">
      <span class="account-plan-name">${roName}</span>
      <span class="badge badge-orange">${roBadge}</span>
    </div>
    <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
      <button onclick="${roBtnAction}" style="width:100%;padding:8px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
        ${roBtnLabel}
      </button>
    </div>
  `;
}

/** @param {'monthly' | 'annual' | 'founder'} plan */
function _handleUpgradeClick(plan) {
  if (typeof _track === 'function') _track('upgrade_clicked', { billing_cycle: plan });
  startCheckout(plan).catch(err => {
    const msg = (err && err.message) || 'Checkout failed';
    if (typeof _toast === 'function') _toast(msg, 'error');
    else alert(msg);
  });
}

// ══════════════════════════════════════════
// MANAGE SUBSCRIPTION POPUP
// ══════════════════════════════════════════
function _handleManageSubscription() {
  const sub = _subscription;
  const status = sub?.status ?? '';

  // Founder is a one-off lifetime purchase — nothing to renew or cancel.
  if (sub?.plan === 'founder') { _openManagePopupFounder(); return; }

  // past_due users still have a subscription row — show the payment-failure popup
  // before the isPro() check (which returns false for past_due).
  if (status === 'past_due') {
    _openManagePopupPastDue(/** @type {SubscriptionRow} */ (sub));
    return;
  }

  if (!(typeof isPro === 'function' && isPro())) {
    // Read-only — no active trial/subscription. Lapsed → resubscribe; never
    // subscribed → start the trial.
    _openTrialModal({ mode: (typeof _subState === 'function' && _subState() === 'lapsed') ? 'resubscribe' : 'trial' });
    return;
  }

  if (sub?.cancel_at_period_end) {
    _openManagePopupCancelling(/** @type {SubscriptionRow} */ (sub));
  } else {
    _openManagePopupActive(/** @type {SubscriptionRow} */ (sub));
  }
}

/**
 * Fetch the caller's live subscription pricing from Stripe via the
 * `stripe-subscription` edge function — current (possibly discounted) price,
 * standard price, and when a promo discount ends. Returns null on any failure
 * so callers can fall back to a static price label.
 *
 * @returns {Promise<{currency: string|null, interval: string|null, standardAmount: number|null, currentAmount: number|null, discountEnd: string|null} | null>}
 */
async function _loadSubscriptionPricing() {
  try {
    const { data: { session } } = await _sb.auth.getSession();
    if (!session) return null;
    const res = await fetch(`${window._SBURL}/functions/v1/stripe-subscription`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${session.access_token}`,
        'content-type': 'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_e) {
    return null;
  }
}

/**
 * Format an integer minor-unit amount as a price label, e.g.
 * (2500, 'usd', 'month') → "$25/mo". A whole-currency amount drops the ".00".
 *
 * @param {number} minorUnits
 * @param {string} currency  ISO currency code (Stripe returns it lowercased)
 * @param {string|null} interval  Stripe recurring interval ('month' | 'year' | …)
 * @returns {string}
 */
function _fmtSubscriptionPrice(minorUnits, currency, interval) {
  const major = minorUnits / 100;
  // Whole amounts show no decimals ("$25"); fractional amounts show exactly
  // two ("$35.50"). Force the en-US locale so USD renders as "$" (not "US$"),
  // matching the static price labels used everywhere else in the app.
  const fractionDigits = minorUnits % 100 === 0 ? 0 : 2;
  let amount;
  try {
    amount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(major);
  } catch (_e) {
    amount = `${currency.toUpperCase()} ${major}`;
  }
  const suffix = interval === 'year' ? '/yr'
    : interval === 'month' ? '/mo'
    : interval ? `/${interval}` : '';
  return `${amount}${suffix}`;
}

/**
 * Replace the Manage Subscription popup's "Loading…" price placeholder with
 * live figures: the discounted price the user pays now, plus — when a promo
 * is active — a line showing the standard price and the date it takes effect.
 * Falls back to the static plan price if the lookup fails or there is no
 * active discount.
 *
 * @param {string} fallbackPrice  static "$35/mo"-style label
 */
async function _fillManageSubscriptionPricing(fallbackPrice) {
  const data = await _loadSubscriptionPricing();
  const priceEl = document.getElementById('ms-price-line');
  if (!priceEl) return;  // popup was closed mid-fetch

  if (!data || data.currentAmount == null || !data.currency) {
    priceEl.textContent = fallbackPrice;
    return;
  }

  priceEl.textContent = _fmtSubscriptionPrice(data.currentAmount, data.currency, data.interval);

  // Announce a price increase only when the current price is genuinely below
  // standard AND Stripe gave us the date the discount ends.
  if (data.standardAmount != null
      && data.currentAmount < data.standardAmount
      && data.discountEnd) {
    const increaseEl = document.getElementById('ms-increase-line');
    if (increaseEl) {
      const standard = _fmtSubscriptionPrice(data.standardAmount, data.currency, data.interval);
      const date = new Date(data.discountEnd).toLocaleDateString();
      increaseEl.textContent = `Increases to ${standard} on ${date}`;
      increaseEl.style.display = '';
    }
  }
}

/** @param {SubscriptionRow} sub */
function _openManagePopupActive(sub) {
  const isAnnual = sub.plan === 'pro_annual';
  const planLabel = isAnnual ? 'Pro Annual' : 'Pro Monthly';
  // Static price shown while the live Stripe lookup is in flight, and the
  // fallback if it fails. _fillManageSubscriptionPricing swaps in the real
  // (possibly discounted) figure once stripe-subscription responds.
  const fallbackPrice = isAnnual ? '$300/yr' : '$35/mo';
  const switchLabel = isAnnual ? 'Switch to Monthly' : 'Switch to Annual';
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : '';
  const cancelMsg = periodEnd
    ? `Cancel your Pro subscription? You'll keep access until ${periodEnd}.`
    : 'Cancel your Pro subscription?';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Manage Subscription</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:700;color:var(--text)">${planLabel}</span>
          <span class="badge badge-green">Active</span>
        </div>
        <div id="ms-price-line" style="font-size:13px;font-weight:600;color:var(--text);margin-top:6px"><span style="color:var(--muted);font-weight:400">Loading…</span></div>
        <div id="ms-increase-line" style="font-size:11px;color:var(--muted);margin-top:4px;display:none"></div>
        ${periodEnd ? `<div style="font-size:11px;color:var(--muted);margin-top:4px">Renews ${periodEnd}</div>` : ''}
      </div>
      <div class="pf-divider"></div>
      <div onclick="_portalAction()" style="padding:8px 0;font-size:12px;color:var(--accent);cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${switchLabel}<span style="color:var(--muted);font-size:11px">&rsaquo;</span></div>
      <div onclick="_portalAction()" style="padding:8px 0;font-size:12px;color:var(--accent);cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">Update payment method<span style="color:var(--muted);font-size:11px">&rsaquo;</span></div>
      <div onclick="_portalAction()" style="padding:8px 0;font-size:12px;color:var(--accent);cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">View invoices<span style="color:var(--muted);font-size:11px">&rsaquo;</span></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-danger" onclick="_confirm('${cancelMsg.replace(/'/g, "\\'")}',()=>_portalAction())">Cancel subscription</button>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Close</button>
      </div>
    </div>
  `, 'sm');

  _fillManageSubscriptionPricing(fallbackPrice);
}

/** @param {SubscriptionRow} sub */
function _openManagePopupCancelling(sub) {
  const isAnnual = sub.plan === 'pro_annual';
  const planLabel = isAnnual ? 'Pro Annual' : 'Pro Monthly';
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString()
    : '';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Manage Subscription</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:700;color:var(--text)">${planLabel}</span>
          <span class="badge badge-orange">Cancelling</span>
        </div>
      </div>
      <div style="background:rgba(232,168,56,0.08);border:1px solid rgba(232,168,56,0.2);border-radius:8px;padding:10px 14px;margin-top:12px;font-size:12px;color:var(--text2);line-height:1.5">
        Your Pro access ends on <strong>${periodEnd}</strong>. After this date your account becomes read-only — you can still view and export your data, but you'll need to resubscribe to create or edit.
      </div>
      <div class="pf-divider"></div>
      <div onclick="_portalAction()" style="padding:8px 0;font-size:12px;color:var(--accent);cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">Update payment method<span style="color:var(--muted);font-size:11px">&rsaquo;</span></div>
      <div onclick="_portalAction()" style="padding:8px 0;font-size:12px;color:var(--accent);cursor:pointer;font-weight:600;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">View invoices<span style="color:var(--muted);font-size:11px">&rsaquo;</span></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-primary" onclick="_portalAction()">Resume subscription</button>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Close</button>
      </div>
    </div>
  `, 'sm');
}

/** @param {SubscriptionRow} sub */
function _openManagePopupPastDue(sub) {
  const isAnnual = sub.plan === 'pro_annual';
  const planLabel = isAnnual ? 'Pro Annual' : 'Pro Monthly';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Manage Subscription</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:700;color:var(--text)">${planLabel}</span>
          <span class="badge badge-red">Past Due</span>
        </div>
      </div>
      <div style="background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:10px 14px;margin-top:12px;font-size:12px;color:var(--text2);line-height:1.5">
        Your last payment failed. Update your payment method to avoid losing Pro access.
      </div>
      <div class="pf-divider"></div>
      <button class="btn btn-primary btn-lg" onclick="_portalAction()">Update payment method</button>
    </div>
    <div class="popup-footer">
      <div></div>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Close</button>
      </div>
    </div>
  `, 'sm');
}

/**
 * The trial / resubscribe modal — the single upgrade surface that replaces the
 * old free-tier "limit hit" and "Pro feature" modals. Shown when a read-only
 * user tries to create/edit/import, or from the account menu / trial banner.
 * Card is required at Stripe Checkout; cancelling before day 14 means no charge.
 *
 * @param {{ mode?: 'trial' | 'resubscribe' }} [opts] 'resubscribe' for a lapsed
 *   subscriber; 'trial' (default) for someone who has never subscribed.
 */
function _openTrialModal(opts) {
  const mode = (opts && opts.mode) || 'trial';
  const days = (typeof TRIAL_DAYS !== 'undefined') ? TRIAL_DAYS : 14;
  const title = mode === 'resubscribe' ? 'Resubscribe to keep editing' : `Start your ${days}-day free trial`;
  const lead = mode === 'resubscribe'
    ? 'Your account is read-only. Resubscribe to create and edit again — your data is safe and waiting, and you can still view or export it any time.'
    : `Get full access for ${days} days — quote, cut, schedule and bill from one place. Card required; cancel any time before day ${days} and you won't be charged.`;
  const primaryLabel = mode === 'resubscribe' ? 'Resubscribe — Annual' : 'Start free trial — Annual';

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">${title}</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:rgba(232,168,56,0.08);border:1px solid rgba(232,168,56,0.2);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--text);line-height:1.5">
        ${lead}
      </div>
      <div class="pf-divider"></div>
      <button class="btn btn-primary btn-lg" onclick="_closePopup();_handleUpgradeClick('annual')">${primaryLabel}</button>
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:8px;color:var(--muted)">
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('annual')"><strong style="color:var(--text)">$15</strong> / mo · billed yearly</span>
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('monthly')"><strong style="color:var(--text)">$25</strong> / mo</span>
      </div>
    </div>
    <div class="popup-footer">
      <div></div>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Maybe later</button>
      </div>
    </div>
  `, 'sm');
}

/**
 * Cap-hit modal — shown when a grandfathered (legacy free) user tries to create
 * past their FREE_LIMITS[library] cap. Upgrading (start a trial / subscribe)
 * lifts the cap. Post-cutoff read-only users hit _openTrialModal instead.
 *
 * @param {'clients'|'quotes'|'orders'|'cabinet_templates'|'stock'|'cutlists'} library
 */
function _openLimitHitModal(library) {
  /** @type {Record<string, {label: string, verb: string}>} */
  const labels = {
    clients:           { label: 'clients',           verb: 'manage' },
    quotes:            { label: 'quotes',            verb: 'send' },
    orders:            { label: 'orders',            verb: 'track' },
    cabinet_templates: { label: 'cabinet templates', verb: 'save' },
    stock:             { label: 'stock items',       verb: 'track' },
    cutlists:          { label: 'cut lists',         verb: 'track' },
  };
  const { label, verb } = labels[library] || { label: 'items', verb: 'add' };
  const cap = (typeof FREE_LIMITS !== 'undefined' && FREE_LIMITS[library]) || 5;

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Plan limit reached</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:rgba(232,168,56,0.08);border:1px solid rgba(232,168,56,0.2);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--text);line-height:1.5">
        You've used all <strong>${cap}</strong> of your legacy free ${label}. Upgrade to Pro for unlimited, or delete an existing one to ${verb} this new ${label.replace(/s$/, '')}.
      </div>
      <div class="pf-divider"></div>
      <button class="btn btn-primary btn-lg" onclick="_closePopup();_handleUpgradeClick('annual')">Upgrade to Pro</button>
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:8px;color:var(--muted)">
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('annual')"><strong style="color:var(--text)">$15</strong> / mo · billed yearly</span>
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('monthly')"><strong style="color:var(--text)">$25</strong> / mo</span>
      </div>
    </div>
    <div class="popup-footer">
      <div></div>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Close</button>
      </div>
    </div>
  `, 'sm');
}

/** Founder is lifetime — a one-off purchase with nothing to manage. */
function _openManagePopupFounder() {
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Subscription</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:700;color:var(--text)">Founder</span>
          <span class="badge badge-green">Lifetime</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4">Lifetime access — paid once. No renewal, nothing to manage. Thanks for backing ProCabinet.</div>
      </div>
    </div>
    <div class="popup-footer">
      <div></div>
      <div class="popup-footer-right">
        <button class="btn btn-outline" onclick="_closePopup()">Close</button>
      </div>
    </div>
  `, 'sm');
}

// _openManagePopupFree removed — there is no permanent free plan. A read-only
// (non-trial/non-subscriber) user is routed to _openTrialModal() instead.
