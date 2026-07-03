// ProCabinet — Help menu actions.
// Backs the three entries in the toolbar Help dropdown (markup in index.html
// next to .settings-wrap, toggle handler `toggleHelp()` in src/settings.js).
//
// User Guide launches the guided walkthrough. Bug Report and Support open the
// user's mail client via mailto: — no DB writes, no forms. "Suggest a feature"
// moved to the Features menu (src/features.js); _helpContext / _mailtoHref /
// SUPPORT_EMAIL stay here and are shared with it.

const SUPPORT_EMAIL = 'adam@procabinet.app';

/** @returns {string} */
function _helpContext() {
  const tab = document.querySelector('.nav-tab.active')?.getAttribute('title') || 'unknown';
  const ua = navigator.userAgent;
  const ver = document.querySelector('.logo-badge')?.textContent?.trim() || '';
  return `\n\n---\nApp: ProCabinet ${ver}\nTab: ${tab}\nBrowser: ${ua}\n`;
}

/** @param {string} subject @param {string} body */
function _mailtoHref(subject, body) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// "User Guide" in the Help dropdown launches the guided walkthrough (O.2).
// `force` bypasses the first-run gate so a re-trigger always starts at step 0;
// it does NOT seed sample data — the seeder is exclusive to first-run auto-start.
function _openUserGuide() {
  document.getElementById('help-dropdown')?.classList.remove('open');
  const w = /** @type {any} */ (window);
  if (typeof w._wtStart === 'function') {
    w._wtStart({ force: true });
  } else if (typeof _toast === 'function') {
    _toast('Walkthrough unavailable', 'error');
  }
}

// "Guides & Videos" opens the public wiki (procabinet.app/wiki) in a new tab,
// deep-linked to the guide for the active tab when one exists. The tab is read
// the same way _helpContext reads it (.nav-tab.active title). The slug map
// duplicates wiki/guides.mjs (appSection ↔ slug) — this is a classic script
// and cannot import the module; keep both sides in sync.
/** @type {Record<string, string>} */
const _WIKI_GUIDE_BY_TAB = {
  'Dashboard': 'dashboard-overview',
  'Cut List': 'optimised-cut-list',
  'Stock': 'stock-and-materials',
  'Cabinet': 'build-and-price-a-cabinet',
  'Quotes': 'create-and-send-a-quote',
  'Orders': 'convert-a-quote-to-an-order',
  'Clients': 'manage-clients',
  'Schedule': 'schedule-your-workshop',
};

function _openGuides() {
  document.getElementById('help-dropdown')?.classList.remove('open');
  const tab = document.querySelector('.nav-tab.active')?.getAttribute('title') || '';
  const slug = _WIKI_GUIDE_BY_TAB[tab];
  window.open(slug ? `/wiki/${slug}` : '/wiki/', '_blank', 'noopener');
}

function _openBugReport() {
  document.getElementById('help-dropdown')?.classList.remove('open');
  const body = `Steps to reproduce:\n1.\n2.\n3.\n\nExpected:\n\nActual:\n${_helpContext()}`;
  const href = _mailtoHref('[Bug] ', body);
  const html = `
    <div class="popup-header">
      <div class="popup-title">Report a Bug</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <p style="margin:0 0 12px;color:var(--text2);font-size:13px">
        Thanks for helping make the app better. Please include:
      </p>
      <ul style="margin:0 0 12px 18px;padding:0;color:var(--text2);font-size:13px;line-height:1.7">
        <li>Steps to reproduce</li>
        <li>What you expected to happen</li>
        <li>What actually happened</li>
        <li>A screenshot, if possible</li>
      </ul>
      <p style="margin:0;color:var(--muted);font-size:12px">
        Clicking below opens your email client with the current tab and browser pre-filled.
      </p>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <a class="btn btn-primary" href="${href}" onclick="_closePopup()">Open Email</a>
    </div>
  `;
  /** @type {any} */ (window)._openPopup(html, 'sm');
}

function _openSupport() {
  document.getElementById('help-dropdown')?.classList.remove('open');
  const body = `Hi,\n\n${_helpContext()}`;
  const href = _mailtoHref('Support request', body);
  const html = `
    <div class="popup-header">
      <div class="popup-title">Contact Support</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      <p style="margin:0 0 12px;color:var(--text2);font-size:13px">
        Need a hand? Email us and we'll get back to you as soon as we can.
      </p>
      <p style="margin:0 0 12px;font-size:13px">
        <strong>Email:</strong> <a href="${_mailtoHref('Support request', body)}" style="color:var(--accent)">${SUPPORT_EMAIL}</a>
      </p>
      <p style="margin:0;color:var(--muted);font-size:12px">
        Clicking below opens your email client with the current tab and browser pre-filled.
      </p>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <a class="btn btn-primary" href="${href}" onclick="_closePopup()">Open Email</a>
    </div>
  `;
  /** @type {any} */ (window)._openPopup(html, 'sm');
}
