// ProCabinet — UI primitives (Phase 6 module split)
// Loaded BEFORE src/app.js. Defines globals: _toast, _confirm, _openPopup, _closePopup, _popupVal, _byId.
// These are foundational — every feature uses them.

/**
 * Typed shorthand for document.getElementById. Returns null when the id is
 * not in the DOM. Cast to `HTMLInputElement | null` so callers can read
 * `.value`/`.disabled`/`.checked`/`.files` directly after a null guard or
 * non-null assertion via JSDoc cast. The cast is a contained lie about the
 * concrete element subtype; null-handling is honest. Runtime semantics
 * unchanged — accessing a property on a missing-element result still throws
 * (now via the null check the call site adds, instead of pre-Phase-F's
 * implicit TypeError).
 *
 * @param {string} id
 * @returns {HTMLInputElement | null}
 */
function _byId(id) { return /** @type {HTMLInputElement | null} */ (document.getElementById(id)); }

/** @param {string} msg @param {string} [type] @param {number} [duration] */
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

/** @param {string} msg @param {() => void} onConfirm @param {boolean} [danger] */
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
  /** @type {HTMLElement} */ (document.getElementById(id + '_cancel')).onclick = close;
  /** @type {HTMLElement} */ (document.getElementById(id + '_ok')).onclick = () => { close(); onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// ══════════════════════════════════════════
// POPUP MODAL SYSTEM
// ══════════════════════════════════════════

/** @typedef {HTMLDivElement & { _escHandler?: (e: KeyboardEvent) => void, _mouseDownOnOverlay?: boolean }} PopupOverlay */

/** @param {string} html @param {string} [size] */
function _openPopup(html, size = 'sm') {
  _closePopup();
  /** @type {PopupOverlay} */
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';
  overlay.id = 'popup-overlay';
  // Only close on click when BOTH the mousedown started on the overlay AND the click
  // target is the overlay. Prevents text-selection drags ending outside the popup
  // (which fire `click` on the overlay) from closing it.
  overlay.onmousedown = e => { overlay._mouseDownOnOverlay = (e.target === overlay); };
  overlay.onclick = e => {
    if (e.target === overlay && overlay._mouseDownOnOverlay) _closePopup();
    overlay._mouseDownOnOverlay = false;
  };
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
/** @param {string} id */
function _popupVal(id) {
  const el = /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (document.getElementById(id));
  return el ? el.value.trim() : '';
}

// ══════════════════════════════════════════
// SAVE STATUS PILL — Strategy C
// ══════════════════════════════════════════
// Each domain (cabinet / cutlist / quote / order / business / settings) renders
// a `<span class="cl-unsaved-pill" data-save-pill="<domain>">` somewhere in its
// header. Call `_setSaveStatus('cabinet', 'saving')` to flip the pill through
// dirty / saving / saved / failed states. Pills not in the DOM are no-ops, so
// callers don't have to pre-check.

/** @type {Record<string, ReturnType<typeof setTimeout>>} */
const _savePillTimers = {};

/**
 * Update the save-status pill for a domain.
 * @param {string} domain  e.g. 'cabinet', 'cutlist', 'quote', 'order', 'business', 'settings'
 * @param {'dirty'|'saving'|'saved'|'failed'|'clean'} state
 * @param {{ retry?: () => void }} [opts]
 */
function _setSaveStatus(domain, state, opts) {
  const pill = /** @type {HTMLElement | null} */ (document.querySelector(`[data-save-pill="${domain}"]`));
  if (!pill) return;
  // clear any pending revert
  if (_savePillTimers[domain]) { clearTimeout(_savePillTimers[domain]); delete _savePillTimers[domain]; }
  pill.classList.remove('is-saving', 'is-saved', 'is-failed');
  pill.onclick = null;
  switch (state) {
    case 'clean':
      pill.style.display = 'none';
      pill.textContent = '';
      return;
    case 'dirty':
      pill.style.display = '';
      pill.textContent = 'unsaved';
      return;
    case 'saving':
      pill.style.display = '';
      pill.classList.add('is-saving');
      pill.textContent = 'Saving…';
      return;
    case 'saved':
      pill.style.display = '';
      pill.classList.add('is-saved');
      pill.textContent = 'Saved';
      // fade to clean after 2s
      _savePillTimers[domain] = setTimeout(() => {
        if (pill.classList.contains('is-saved')) {
          pill.style.display = 'none';
          pill.classList.remove('is-saved');
        }
      }, 2000);
      return;
    case 'failed':
      pill.style.display = '';
      pill.classList.add('is-failed');
      pill.textContent = 'Save failed · Retry';
      if (opts && typeof opts.retry === 'function') pill.onclick = opts.retry;
      return;
  }
}

// ══════════════════════════════════════════
// PROJECT CONTEXT (Strategy 2 + Idea 3)
// ══════════════════════════════════════════
// Each affected tab (Cabinet Builder, Cut List, Quotes, Orders) renders one of
// two views in its sidebar:
//   - empty state when no project is active (centered picker + recent list)
//   - project header (Idea 3: ← icon + title + meta) when one is active
// These two helpers produce the markup. Visibility / state is owned by each
// tab's own renderContext function; ui.js just hands back HTML.

/**
 * Render the Idea-3 project header.
 * @param {string} domain  matches `data-save-pill` slot ('cabinet'|'cutlist'|'quote'|'order')
 * @param {{ name: string, exitFn: string, status?: string, summary?: string, clientName?: string }} opts
 */
function _renderProjectHeader(domain, opts) {
  const { name, exitFn, status, summary, clientName } = opts;
  const statusBadge = status ? `<span class="ph-badge-active">${_escHtml(status)}</span>` : '';
  const summarySpan = summary ? `<span class="ph-meta">${_escHtml(summary)}</span>` : '';
  const metaRow = (statusBadge || summarySpan)
    ? `<div class="ph-meta-row">${statusBadge}${summarySpan}<span class="cl-unsaved-pill" data-save-pill="${domain}" style="display:none"></span></div>`
    : '';
  const clientLine = clientName ? `<div class="ph-client">Client: <b>${_escHtml(clientName)}</b></div>` : '';
  return `<div class="project-header">
    <div class="ph-row1">
      <button class="ph-back" onclick="${exitFn}()" title="Back to projects" aria-label="Back to projects">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      <span class="ph-title">${_escHtml(name)}</span>
    </div>
    ${metaRow}
    ${clientLine}
  </div>`;
}

/**
 * Render the "no project open" empty state — smart-input project picker + recent-projects list.
 * @param {{
 *   title: string,
 *   subtitle: string,
 *   pickFnName: string,
 *   pickerInputId: string,
 *   pickerSuggestId: string,
 *   pickerSuggestFn: string,
 *   recentProjects: Array<{id: number, name: string, updated_at?: string|null}>,
 *   iconSvg?: string,
 *   newPopupTargetId?: string,
 *   pickerPlaceholder?: string,
 *   emptyMessage?: string,
 * }} opts
 */
function _renderProjectEmpty(opts) {
  const { title, subtitle, pickFnName, pickerInputId, pickerSuggestId, pickerSuggestFn,
    recentProjects, iconSvg, newPopupTargetId, pickerPlaceholder, emptyMessage } = opts;
  const recents = (recentProjects || []).slice(0, 5);
  const noneMsg = emptyMessage || 'No projects yet.';
  const recentHTML = recents.length
    ? `<div class="pe-recent-list">
        <div class="pe-recent-label">Recent</div>
        ${recents.map(p => {
          const initial = (p.name || '?').trim().charAt(0).toUpperCase() || '?';
          const date = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '';
          const escName = _escHtml(p.name).replace(/'/g, '&#39;');
          return `<div class="pe-recent-item" onclick="${pickFnName}(${p.id},'${escName}')">
            <span class="pe-ri-icon">${_escHtml(initial)}</span>
            <span>${_escHtml(p.name)}</span>
            <span class="pe-ri-meta">${_escHtml(date)}</span>
          </div>`;
        }).join('')}
      </div>`
    : `<div style="font-size:11px;color:var(--muted);padding:8px 0">${_escHtml(noneMsg)}</div>`;
  const icon = iconSvg || `<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`;
  const popupTarget = newPopupTargetId || pickerInputId;
  const placeholder = pickerPlaceholder || 'Search or add project...';
  return `<div class="project-empty">
    ${icon}
    <h3>${_escHtml(title)}</h3>
    <p>${_escHtml(subtitle)}</p>
    <div style="position:relative;text-align:left">
      <div class="smart-input-wrap">
        <input type="text" id="${pickerInputId}" placeholder="${_escHtml(placeholder)}" autocomplete="off"
          oninput="${pickerSuggestFn}(this,'${pickerSuggestId}')"
          onfocus="${pickerSuggestFn}(this,'${pickerSuggestId}')"
          onblur="setTimeout(()=>{const b=document.getElementById('${pickerSuggestId}'); if(b)b.style.display='none'},150)">
        <div class="smart-input-add" onclick="_openNewProjectPopup('${popupTarget}')" title="New project">+</div>
      </div>
      <div id="${pickerSuggestId}" class="client-suggest-list" style="display:none"></div>
    </div>
    ${recentHTML}
  </div>`;
}

/**
 * Render a simple list-empty gated entry — icon + title + subtitle + primary
 * button, plus an optional Recent list. Used by Stock / Projects / Clients
 * sidebars when there's no active edit.
 * @param {{
 *   iconSvg: string,
 *   title: string,
 *   subtitle: string,
 *   btnLabel: string,
 *   btnOnclick: string,
 *   recentItems?: Array<{ id: number, name: string, meta?: string, onClick: string }>,
 *   recentLabel?: string,
 * }} opts
 */
function _renderListEmpty(opts) {
  const { iconSvg, title, subtitle, btnLabel, btnOnclick, recentItems, recentLabel } = opts;
  const recents = (recentItems || []).slice(0, 5);
  const recentHTML = recents.length
    ? `<div class="pe-recent-list">
        <div class="pe-recent-label">${_escHtml(recentLabel || 'Recent')}</div>
        ${recents.map(r => {
          const initial = (r.name || '?').trim().charAt(0).toUpperCase() || '?';
          return `<div class="pe-recent-item" onclick="${r.onClick}">
            <span class="pe-ri-icon">${_escHtml(initial)}</span>
            <span>${_escHtml(r.name)}</span>
            ${r.meta ? `<span class="pe-ri-meta">${_escHtml(r.meta)}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`
    : '';
  return `<div class="project-empty">
    ${iconSvg}
    <h3>${_escHtml(title)}</h3>
    <p>${_escHtml(subtitle)}</p>
    <button class="btn btn-primary" onclick="${btnOnclick}" style="width:100%;justify-content:center">${_escHtml(btnLabel)}</button>
    ${recentHTML}
  </div>`;
}
/** @type {any} */ (window)._renderListEmpty = _renderListEmpty;

/**
 * Normalise a URL so bare domains (e.g. `amazon.co.uk`) become absolute.
 * Display-time only — DB values are kept as the user typed them.
 * @param {string | null | undefined} u
 */
function _normalizeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  return 'https://' + s;
}

