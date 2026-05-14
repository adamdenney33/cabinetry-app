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
 * @param {'monthly' | 'annual'} cadence
 * @returns {Promise<void>}
 */
async function startCheckout(cadence) {
  if (cadence !== 'monthly' && cadence !== 'annual') {
    throw new Error('startCheckout: cadence must be "monthly" or "annual"');
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
    body: JSON.stringify({ cadence }),
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
    if (typeof _toast === 'function') _toast('Welcome to Pro! Your subscription is active.', 'success');
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

  el.innerHTML = `
    <div class="account-plan-row">
      <span class="account-plan-name">Free Plan</span>
      <span class="badge badge-orange">5/library</span>
    </div>
    <div style="padding:10px 16px;border-bottom:1px solid var(--border)">
      <button onclick="_handleUpgradeClick('annual')" style="width:100%;padding:8px;background:var(--accent);color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">
        Upgrade to Pro
      </button>
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:6px;color:var(--muted)">
        <span style="cursor:pointer" onclick="_handleUpgradeClick('annual')"><strong style="color:var(--text)">$299</strong> / yr · save 29%</span>
        <span style="cursor:pointer" onclick="_handleUpgradeClick('monthly')"><strong style="color:var(--text)">$35</strong> / mo</span>
      </div>
    </div>
  `;
}

/** @param {'monthly' | 'annual'} cadence */
function _handleUpgradeClick(cadence) {
  startCheckout(cadence).catch(err => {
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

/** @param {SubscriptionRow} sub */
function _openManagePopupActive(sub) {
  const isAnnual = sub.plan === 'pro_annual';
  const planLabel = isAnnual ? 'Pro Annual' : 'Pro Monthly';
  const priceLabel = isAnnual ? '$299/yr' : '$35/mo';
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
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:6px">${priceLabel}</div>
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
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('annual')"><strong style="color:var(--text)">$299</strong> / yr · save 29%</span>
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('monthly')"><strong style="color:var(--text)">$35</strong> / mo</span>
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
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('annual')"><strong style="color:var(--text)">$299</strong> / yr · save 29%</span>
        <span style="cursor:pointer" onclick="_closePopup();_handleUpgradeClick('monthly')"><strong style="color:var(--text)">$35</strong> / mo</span>
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
