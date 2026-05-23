// ProCabinet — Auth helpers + keyboard shortcuts (carved out of src/app.js
// in phase E carve 6).
//
// Loaded as a classic <script defer> AFTER src/app.js. No state declarations
// here, but the file contains two top-level `document.addEventListener`
// calls that attach global keyboard handlers at script-load time. Those
// handlers reference globals defined in app.js (switchSection, _showAuth)
// at fire time, so the load-order constraint is "must run after the DOM
// has parsed" (the `defer` attribute guarantees that), not "after a
// specific other script."
//
// Cross-file dependencies referenced from this file: switchSection,
// _showAuth — defined in app.js.

// ══════════════════════════════════════════
// AUTH HELPERS
// ══════════════════════════════════════════
function dismissAuth() {
  /** @type {HTMLElement} */ (document.getElementById('auth-screen')).classList.add('hidden');
}

/**
 * Add a freshly-confirmed, opted-in user to the marketing mailing list.
 *
 * Called fire-and-forget from onAuthStateChange. The actual list write runs
 * server-side in the `list-subscribe` edge function (which holds the Resend
 * API key) — this only decides whether to invoke it:
 *   - the user ticked the opt-in box at signup (user_metadata.marketing_opt_in)
 *   - their email is confirmed (no Supabase session exists before that anyway)
 *   - they haven't already been synced on this device
 * A localStorage flag suppresses repeat calls; the edge function is also
 * idempotent, so a redundant call (e.g. a second device) is harmless.
 *
 * @param {import('@supabase/supabase-js').Session} session
 */
async function _syncMailingList(session) {
  const user = session?.user;
  if (!user || window._demoMode) return;
  const meta = user.user_metadata || {};
  if (meta.marketing_opt_in !== true) return;
  if (!user.email_confirmed_at) return;
  const flagKey = `pc_mailing_synced_${user.id}`;
  if (localStorage.getItem(flagKey)) return;
  const { error } = await _sb.functions.invoke('list-subscribe');
  if (error) throw error;
  localStorage.setItem(flagKey, '1');
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  // Ctrl/Cmd + number: switch tabs
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    /** @type {Record<string, string>} */
    const tabMap = {'1':'dashboard','2':'cutlist','3':'stock','4':'cabinet','5':'quote','6':'orders','7':'clients','8':'schedule'};
    if (tabMap[e.key]) { e.preventDefault(); switchSection(tabMap[e.key]); return; }
  }
  // ? key shows keyboard shortcuts (when not typing in an input)
  const ae = /** @type {HTMLElement | null} */ (document.activeElement);
  const typing = ['INPUT','TEXTAREA','SELECT'].includes(ae?.tagName ?? '') || ae?.contentEditable?.toString()?.includes('true');
  if (e.key === '?' && !typing) {
    _showShortcutsHelp();
  }
  // N key: new item for current tab (when not typing)
  if (e.key === 'n' && !typing && !e.ctrlKey && !e.metaKey) {
    const active = document.querySelector('.section-panel.active')?.id;
    if (active === 'panel-quote') { document.getElementById('q-client')?.focus(); e.preventDefault(); }
    else if (active === 'panel-orders') { document.getElementById('o-client')?.focus(); e.preventDefault(); }
    else if (active === 'panel-stock') { document.getElementById('stock-name')?.focus(); e.preventDefault(); }
    else if (active === 'panel-clients') { document.getElementById('cl-name')?.focus(); e.preventDefault(); }
    else if (active === 'panel-projects') { document.getElementById('pj-name')?.focus(); e.preventDefault(); }
  }
  // / key: focus search (when not typing)
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
    const search = /** @type {HTMLElement | null} */ (document.querySelector('.section-panel.active .lib-filter-input, .section-panel.active input[type="search"], .section-panel.active input[placeholder*="Search"]'));
    if (search) { search.focus(); e.preventDefault(); }
  }
});
function _showShortcutsHelp() {
  const existing = document.getElementById('shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const m = document.createElement('div');
  m.id = 'shortcuts-modal';
  m.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px)';
  m.onclick = e => { if (e.target === m) m.remove(); };
  const shortcuts = [
    ['Ctrl/Cmd + 1–9', 'Switch tabs'],
    ['N', 'New item (focus sidebar form)'],
    ['/', 'Focus search'],
    ['Escape', 'Close dialogs / overlays'],
    ['?', 'Toggle this help']
  ];
  m.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:15px;font-weight:800;color:var(--text)">Keyboard Shortcuts</div>
      <button onclick="this.closest('#shortcuts-modal').remove()" style="background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;padding:0 4px">×</button>
    </div>
    ${shortcuts.map(([key,desc]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border2)">
      <span style="font-size:12px;color:var(--text2)">${desc}</span>
      <kbd style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:var(--surface2);color:var(--muted);font-family:inherit">${key}</kbd>
    </div>`).join('')}
  </div>`;
  document.body.appendChild(m);
}
// Escape key closes overlays
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const auth = document.getElementById('auth-screen');
  if (auth && !auth.classList.contains('hidden')) { dismissAuth(); return; }
  const acct = document.getElementById('account-panel');
  if (acct && acct.classList.contains('open')) { acct.classList.remove('open'); return; }
  const proj = document.getElementById('projects-panel');
  if (proj && proj.classList.contains('open')) { proj.classList.remove('open'); return; }
  // Close any open confirm dialogs
  const confirms = document.querySelectorAll('[id^="_confirm_"]');
  if (confirms.length) { confirms.forEach(c => c.remove()); return; }
});

