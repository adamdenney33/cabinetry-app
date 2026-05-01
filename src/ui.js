// ProCabinet — UI primitives (Phase 6 module split)
// Loaded BEFORE src/app.js. Defines globals: _toast, _confirm, _openPopup, _closePopup, _popupVal.
// These are foundational — every feature uses them.

function _toast(msg, type = 'info', duration = 3500) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => { requestAnimationFrame(() => t.classList.add('show')); });
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, duration);
}

function _confirm(msg, onConfirm, danger = true) {
  const id = '_confirm_' + Date.now();
  const overlay = document.createElement('div');
  overlay.id = id;
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;animation:popupFadeIn .15s ease;transform:translateZ(0)';
  const btnStyle = danger
    ? 'background:var(--danger);color:#fff;border:none'
    : 'background:var(--accent);color:#fff;border:none';
  overlay.innerHTML = `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:18px 20px;box-shadow:0 16px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(255,255,255,0.04);max-width:380px;width:calc(100vw - 32px);font-size:13px;color:var(--text);animation:popupSlideIn .2s ease">
    <div style="margin-bottom:16px;line-height:1.5">${msg}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="${id}_cancel" style="padding:7px 16px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-size:12px;font-family:inherit">Cancel</button>
      <button id="${id}_ok" style="padding:7px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit;${btnStyle}">Confirm</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  document.getElementById(id + '_cancel').onclick = close;
  document.getElementById(id + '_ok').onclick = () => { close(); onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// ══════════════════════════════════════════
// POPUP MODAL SYSTEM
// ══════════════════════════════════════════

/** @typedef {HTMLDivElement & { _escHandler?: (e: KeyboardEvent) => void }} PopupOverlay */

function _openPopup(html, size = 'sm') {
  _closePopup();
  /** @type {PopupOverlay} */
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.id = 'popup-overlay';
  overlay.onclick = e => { if (e.target === overlay) _closePopup(); };
  overlay.innerHTML = `<div class="popup-modal popup-${size}">${html}</div>`;
  document.body.appendChild(overlay);
  // Focus first input
  setTimeout(() => {
    const first = /** @type {HTMLElement | null} */ (overlay.querySelector('.pf-input, .pf-textarea, .pf-select'));
    if (first) first.focus();
  }, 50);
  // Escape key closes
  overlay._escHandler = e => { if (e.key === 'Escape') _closePopup(); };
  document.addEventListener('keydown', overlay._escHandler);
}
function _closePopup() {
  const el = /** @type {PopupOverlay | null} */ (document.getElementById('popup-overlay'));
  if (el) {
    if (el._escHandler) document.removeEventListener('keydown', el._escHandler);
    el.remove();
  }
}
function _popupVal(id) {
  const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (document.getElementById(id));
  return el ? el.value.trim() : '';
}

