// ProCabinet — mobile/tablet advisory notice.
// Shown once per browser session to touch-device users on app load: the app is
// desktop-first, so this points them at a computer for the full experience.
// Layered above the guided walkthrough (z-index) so it's the first thing seen;
// the walkthrough is revealed underneath once this is dismissed.

/** True for phones and tablets — a touch-primary device with no hover. */
function _pcIsTouchDevice() {
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Show the advisory once per session. No-op on desktop or if already shown. */
function _pcMaybeShowMobileNotice() {
  if (!_pcIsTouchDevice()) return;
  try {
    if (sessionStorage.getItem('pc_mobile_notice_seen')) return;
    sessionStorage.setItem('pc_mobile_notice_seen', '1');
  } catch (e) { void e; }
  if (document.getElementById('pc-mobile-notice')) return;

  const overlay = document.createElement('div');
  overlay.id = 'pc-mobile-notice';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:20px;animation:popupFadeIn .15s ease;transform:translateZ(0)';
  overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:22px 24px;box-shadow:0 16px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.04);max-width:380px;width:calc(100vw - 32px);color:var(--text);animation:popupSlideIn .2s ease">
    <div style="font-size:16px;font-weight:800;margin-bottom:10px">Best viewed on a computer</div>
    <div style="font-size:13px;line-height:1.6;color:var(--text2)">
      ProCabinet isn't fully optimised for mobile yet. For the full experience, open it on a desktop or laptop.
      <br><br>
      You can still use it with limited functionality on a phone or tablet.
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:18px">
      <button id="pc-mobile-notice-ok" style="padding:9px 20px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit">Continue anyway</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  /** @type {HTMLElement} */ (document.getElementById('pc-mobile-notice-ok')).onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

window._pcIsTouchDevice = _pcIsTouchDevice;
window._pcMaybeShowMobileNotice = _pcMaybeShowMobileNotice;
