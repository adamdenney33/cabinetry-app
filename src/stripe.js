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

  // Read the bearer from the in-memory token (db.js `_dbAuthToken`), NOT
  // `_sb.auth.getSession()`, whose storage-based token goes stale on Safari /
  // in-app webviews → 401 "Invalid auth token" from the verify_jwt function.
  const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
  if (!token) throw new Error('Sign in to upgrade to Pro');

  const url = `${window._SBURL}/functions/v1/stripe-checkout`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'apikey': window._SBKEY,
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
  const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
  if (!token) throw new Error('Sign in to manage your subscription');

  const url = `${window._SBURL}/functions/v1/stripe-portal`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'apikey': window._SBKEY,
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
    if (typeof _toast === 'function') _toast('Welcome to Pro! Your subscription is active.', 'success');
    // Fire ad-platform purchase conversions (Meta / GA4 / Google Ads). The plan
    // arrives as ?plan=<monthly|annual|founder> from the Stripe success_url.
    if (typeof _trackPurchaseConversion === 'function') _trackPurchaseConversion(params.get('plan'));
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

  // Automatic 14-day Pro trial — unlimited access until it lapses, then this
  // falls through to the Free-plan block below. Same Upgrade CTA so a trial user
  // can convert before it ends.
  if (typeof _trialActive === 'function' && _trialActive()) {
    const daysLeft = typeof _trialDaysLeft === 'function' ? _trialDaysLeft() : 0;
    el.innerHTML = `
      <div class="account-plan-row">
        <span class="account-plan-name">Pro Trial</span>
        <span class="badge badge-orange">${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span>
      </div>
      <div class="account-menu-item" style="color:var(--muted);font-size:11px;cursor:default;padding-bottom:4px">Unlimited access during your trial — upgrade to keep it.</div>
      <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
        <button onclick="_wtStartCta()" style="width:100%;padding:8px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
          Upgrade to Pro
        </button>
      </div>
    `;
    return;
  }

  // Free plan — the Upgrade button opens the walkthrough's plan-picker CTA
  // (_wtStartCta) rather than jumping straight to Stripe checkout.
  el.innerHTML = `
    <div class="account-plan-row">
      <span class="account-plan-name">Free Plan</span>
      <span class="badge badge-orange">5/library</span>
    </div>
    <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
      <button onclick="_wtStartCta()" style="width:100%;padding:8px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
        Upgrade to Pro
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
    _openManagePopupFree();
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
    const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
    if (!token) return null;
    const res = await fetch(`${window._SBURL}/functions/v1/stripe-subscription`, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${token}`,
        'apikey': window._SBKEY,
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
        Your Pro access ends on <strong>${periodEnd}</strong>. After this date you'll revert to the free plan (5 items/library).
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
 * Modal shown when a free-tier user tries to create a 6th item in a capped
 * library. Tailored heading per library; reuses the upgrade CTAs.
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
  const { label, verb } = labels[library];
  const cap = FREE_LIMITS[library];

  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Free Plan Limit Reached</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:rgba(232,168,56,0.08);border:1px solid rgba(232,168,56,0.2);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--text);line-height:1.5">
        You've used all <strong>${cap}</strong> of your free ${label}. Upgrade to Pro for unlimited storage, or delete an existing one to ${verb} this new ${label.replace(/s$/, '')}.
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

/**
 * Modal shown when a signed-in free user clicks a Pro-only button. Lock icon +
 * the standard upgrade CTAs. Logged-out demo visitors never reach this —
 * `_enforceProFeature` lets them through. Defaults to the import/export + DXF
 * copy; pass `messageHtml` to tailor it for another feature (e.g. Live link).
 * @param {string} [messageHtml]
 */
function _openProFeatureModal(messageHtml) {
  const body = messageHtml ||
    'This is a <strong>Pro</strong> feature. Upgrade to import and export your libraries as CSV, and send your nested cut layouts to the CNC as DXF.';
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">A Pro Feature</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="text-align:center;font-size:34px;line-height:1;padding:4px 0 2px">&#128274;</div>
      <div style="background:rgba(232,168,56,0.08);border:1px solid rgba(232,168,56,0.2);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--text);line-height:1.5;text-align:center">
        ${body}
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

function _openManagePopupFree() {
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title">Subscription</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:14px 16px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;font-weight:700;color:var(--text)">Free Plan</span>
          <span class="badge badge-orange">5/library</span>
        </div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.4">Full access to all features, up to 5 items per library.</div>
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

// ══════════════════════════════════════════
// TRIAL-ENDING BANNER (F.2)
// ══════════════════════════════════════════
/** localStorage key — the days-left value the banner was last dismissed at. */
const _TRIAL_BANNER_KEY = 'pc_trial_banner_day';

/**
 * Slim dismissible banner under the header for the last 3 days of the 14-day
 * trial. The trial otherwise lapses silently — the countdown lives only in the
 * account dropdown — and days 12–14 are the highest-converting window to ask.
 * Dismissal is per remaining day: dismissing at "2 days left" keeps it away
 * until "1 day left". Idempotent — called after every subscription (re)load
 * from loadSubscription(); inserts, updates, or removes itself as needed.
 */
function _renderTrialBanner() {
  const existing = document.getElementById('trial-banner');
  const active = !!_userId && typeof _trialActive === 'function' && _trialActive();
  const daysLeft = typeof _trialDaysLeft === 'function' ? _trialDaysLeft() : 0;
  /** @type {string | null} */
  let dismissedAt = null;
  try { dismissedAt = localStorage.getItem(_TRIAL_BANNER_KEY); } catch (_e) { /* private mode */ }
  const show = active && daysLeft > 0 && daysLeft <= 3 && dismissedAt !== String(daysLeft);
  if (!show) { if (existing) existing.remove(); return; }

  const label = daysLeft === 1 ? 'Your Pro trial ends today' : `Your Pro trial ends in ${daysLeft} days`;
  let el = existing;
  if (!el) {
    el = document.createElement('div');
    el.id = 'trial-banner';
    el.style.cssText = 'display:flex;align-items:center;gap:12px;flex-shrink:0;padding:7px 16px;' +
      'background:rgba(232,168,56,0.10);border-bottom:1px solid rgba(232,168,56,0.25);' +
      'font-size:12.5px;line-height:1.4;color:var(--text)';
    // Body is a flex column (header has flex-shrink:0) — inserting directly
    // after the header pushes the app content down rather than overlapping it.
    const header = document.querySelector('header');
    if (header && header.parentElement) header.insertAdjacentElement('afterend', el);
    else document.body.prepend(el);
    if (typeof _track === 'function') _track('trial_banner_shown', { days_left: daysLeft });
  }
  el.innerHTML = `
    <span style="flex:1;min-width:0"><strong>${label}.</strong> Keep unlimited saved items, CSV import/export and CNC/DXF export — from $15/mo.</span>
    <button onclick="_trialBannerUpgrade()" style="flex-shrink:0;padding:5px 14px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer">See plans</button>
    <button onclick="_trialBannerDismiss()" title="Dismiss" style="flex-shrink:0;background:none;border:none;color:var(--muted);font-size:16px;line-height:1;cursor:pointer;padding:2px 4px">&times;</button>`;
}

/** Banner CTA → the standalone plan-picker overlay (same one the tour ends on). */
function _trialBannerUpgrade() {
  if (typeof _track === 'function') {
    _track('trial_banner_upgrade_clicked', { days_left: typeof _trialDaysLeft === 'function' ? _trialDaysLeft() : 0 });
  }
  const w = /** @type {any} */ (window);
  if (typeof w._wtStartCta === 'function') w._wtStartCta();
}

/** Dismiss for the current days-left value — it returns when the count drops. */
function _trialBannerDismiss() {
  try {
    localStorage.setItem(_TRIAL_BANNER_KEY, String(typeof _trialDaysLeft === 'function' ? _trialDaysLeft() : 0));
  } catch (_e) { /* private mode — banner just reappears next load */ }
  const el = document.getElementById('trial-banner');
  if (el) el.remove();
}
