// ProCabinet — Refgrow affiliate dashboard.
//
// Loaded as a classic <script defer>. Owns the "Affiliate program" view
// (panel-affiliates in index.html), reached from the account menu →
// switchSection('affiliates') (wired in src/settings.js).
//
// The #refgrow div is Refgrow's widget mount point. page.js scans for it on
// execution and renders the affiliate's referral link, stats and payouts. We
// pre-authenticate the widget by stamping data-project-email with the
// signed-in user's email (window._userEmail, set in src/app.js) so the user
// lands straight on their own dashboard — no separate Refgrow login.
//
// page.js is loaded lazily, exactly once, the first time this view is opened:
// the mount div is persistent (it lives in the panel, hidden until shown), so
// the widget mounts once and survives subsequent open/close of the section
// without re-executing the third-party script.

/** Guard so page.js is injected at most once. */
let _refgrowPageLoaded = false;

/**
 * Render (mount) the Refgrow affiliate widget. Called by switchSection when the
 * user opens the "Affiliate program" view. Idempotent — safe to call on every
 * visit to the section.
 * @returns {void}
 */
function renderAffiliates() {
  const mount = document.getElementById('refgrow');
  if (!mount) return;

  // Keep the pre-auth email current (covers the case where the widget hasn't
  // mounted yet, and refreshes it if the account changed within the session).
  const email = (typeof window._userEmail === 'string') ? window._userEmail : '';
  if (email) mount.setAttribute('data-project-email', email);
  else mount.removeAttribute('data-project-email'); // fall back to Refgrow's own login

  if (_refgrowPageLoaded) return;
  _refgrowPageLoaded = true;

  const s = document.createElement('script');
  s.src = 'https://scripts.refgrowcdn.com/page.js';
  s.async = true;
  s.defer = true;
  s.onerror = () => {
    _refgrowPageLoaded = false; // allow a retry on the next open if it failed to load
    mount.innerHTML =
      '<div style="padding:24px;color:var(--muted);font-size:13px">' +
      'Couldn’t load the affiliate dashboard. Check your connection and reopen this page.' +
      '</div>';
  };
  document.body.appendChild(s);
}
