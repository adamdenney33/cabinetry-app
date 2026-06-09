// ProCabinet — Stripe Connect payouts (business side, Pro). Lets the business
// connect their own Stripe account so customers can pay a deposit/balance on the
// live quote page; ProCabinet takes a small platform fee. Mirrors the
// accounting.js connect/return/popup pattern.
//
// Loaded as a classic <script defer> after stripe.js / ui.js. Defines globals:
//   loadConnectStatus, startConnectOnboarding, handleConnectReturn,
//   _openConnectPopup.
//
// Cross-file deps: _sb (db.js), _userId (limits.js/app.js), _requireAuth (app.js),
// _enforceProFeature (limits.js), _toast / _openPopup / _closePopup / _escHtml (ui.js).

/** @type {{ connected: boolean, charges_enabled?: boolean, payouts_enabled?: boolean, details_submitted?: boolean } | null} */
let _connectStatus = null;

/** @param {string} name @param {any} body @returns {Promise<any>} */
async function _connectFn(name, body) {
  // Use the in-memory access token (db.js `_dbAuthToken`), NOT `_sb.auth.getSession()`:
  // the storage-based session goes stale/partitioned (Safari ITP, in-app webviews), so
  // getSession() can hand back an expired JWT — which the verify_jwt edge functions
  // reject as 401 "Invalid auth token". The in-memory token is kept fresh by
  // onAuthStateChange / TOKEN_REFRESHED (see db.js § _accessToken).
  const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
  if (!token) throw new Error('Sign in to set up payments');
  const res = await fetch(`${window._SBURL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'apikey': window._SBKEY, 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  /** @type {any} */ let payload = {};
  try { payload = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
  return payload;
}

/** Hydrate the business's Connect status on boot (best-effort). */
async function loadConnectStatus() {
  _connectStatus = null;
  if (!_userId) return;
  try { _connectStatus = await _connectFn('connect-status', {}); }
  catch (e) { /* not connected / offline — stay null */ }
}

/** Kick off (or resume) Stripe Express onboarding — redirects to Stripe. */
async function startConnectOnboarding() {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  try {
    _toast('Opening Stripe…', 'info', 6000);
    const { url } = await _connectFn('connect-onboard', {});
    if (!url) throw new Error('No onboarding URL returned');
    window.location.href = url;
  } catch (e) {
    _toast((/** @type {Error} */ (e)).message || 'Could not start Stripe onboarding', 'error');
  }
}

/** Handle the ?connect=return / ?connect=refresh redirect back from Stripe. */
function handleConnectReturn() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('connect');
  if (!state) return;
  if (state === 'return') {
    _toast('Finishing your Stripe setup…', 'info');
    setTimeout(() => { loadConnectStatus().then(() => { try { _openConnectPopup(); } catch (e) { /* popup optional */ } }); }, 800);
  }
  params.delete('connect');
  const cleaned = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash);
}

/** The "Card payments" settings card (connect / connected state). */
function _connectPopupHtml() {
  const s = _connectStatus;
  const live = !!(s && s.connected && s.charges_enabled);
  const pending = !!(s && s.connected && !s.charges_enabled);
  const head = `<div style="display:flex;align-items:center;gap:10px;min-width:0">
    <div style="width:34px;height:34px;border-radius:8px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-weight:800;color:#635bff;flex:none">S</div>
    <div style="min-width:0"><div style="font-weight:600;font-size:13px">Stripe payouts</div>
      <div style="font-size:11px;color:var(--muted)">${live ? 'Connected — customers can pay you' : pending ? 'Setup not finished' : 'Not connected'}</div></div></div>`;
  const action = live
    ? `<button class="btn btn-outline btn-sm" style="flex:none" onclick="startConnectOnboarding()">Manage</button>`
    : `<button class="btn btn-primary btn-sm" style="flex:none" onclick="startConnectOnboarding()">${pending ? 'Finish setup' : 'Connect'}</button>`;
  return `<div class="popup-header"><div class="popup-title">Card payments</div><button class="popup-close" onclick="_closePopup()">&times;</button></div>
    <div class="popup-body">
      <p style="font-size:12px;color:var(--muted);margin:0 0 14px">Let customers pay a deposit or balance by card straight from their live quote. Funds go to your Stripe account; a small platform fee applies per payment.</p>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--border);border-radius:10px;padding:12px">${head}${action}</div>
      ${live ? '<div style="font-size:11px;color:var(--success);margin-top:10px">✓ Ready — turn on “Accept card payment” when sharing a quote.</div>' : ''}
    </div>`;
}

function _openConnectPopup() {
  if (!_requireAuth()) return;
  if (!_enforceProFeature()) return;
  _openPopup(_connectPopupHtml(), 'md');
}

Object.assign(window, { loadConnectStatus, startConnectOnboarding, handleConnectReturn, _openConnectPopup });
