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
 * @param {string} _domain  retained for back-compat (was the data-save-pill slot)
 * @param {{ name: string, exitFn: string, status?: string, summary?: string, clientName?: string, iconSvg?: string }} opts
 */
function _renderProjectHeader(_domain, opts) {
  const { name, exitFn, iconSvg } = opts;
  const defaultIcon = '<svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
  return `<div class="project-header">
    <div class="ph-row1">
      <button class="ph-back" onclick="${exitFn}()" title="Back" aria-label="Back">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
      </button>
      ${iconSvg || defaultIcon}
      <span class="ph-title">${_escHtml(name)}</span>
    </div>
  </div>`;
}

// Type icons used inside .pe-ri-icon badges in gated-sidebar Recent lists.
// Same SVG paths as the gate hero icons (folder / person / box) — kept here
// so all callers point at one source of truth. CSS sizes them to 14×14 inside
// the 22×22 accent-tinted square; stroke colour is inherited via currentColor.
const _TYPE_ICON_PROJECT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
const _TYPE_ICON_CLIENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
const _TYPE_ICON_STOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
/** @type {any} */ (window)._TYPE_ICON_PROJECT = _TYPE_ICON_PROJECT;
/** @type {any} */ (window)._TYPE_ICON_CLIENT = _TYPE_ICON_CLIENT;
/** @type {any} */ (window)._TYPE_ICON_STOCK = _TYPE_ICON_STOCK;

/**
 * Render the "no project open" empty state — smart-input project picker + recent-projects list.
 * @param {{
 *   title: string,
 *   subtitle: string,
 *   pickFnName: string,
 *   pickerInputId: string,
 *   pickerSuggestId: string,
 *   pickerSuggestFn: string,
 *   recentProjects: Array<{id: number, name: string, client_id?: number|null, updated_at?: string|null}>,
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
          const date = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '';
          const escName = _escHtml(p.name).replace(/'/g, '&#39;');
          const cName = (typeof clients !== 'undefined' && p.client_id)
            ? (/** @type {any} */ (clients.find(/** @param {any} c */ c => c.id === p.client_id)) || {}).name || ''
            : '';
          const display = cName ? `${p.name} - ${cName}` : p.name;
          return `<div class="pe-recent-item" onclick="${pickFnName}(${p.id},'${escName}')">
            <span class="pe-ri-icon">${_TYPE_ICON_PROJECT}</span>
            <span>${_escHtml(display)}</span>
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
 *
 * `itemIconSvg` controls what's rendered inside each Recent row's badge. If
 * provided (e.g. `_TYPE_ICON_PROJECT`), the SVG is shown; otherwise we fall
 * back to a single-letter initial so legacy callers keep working.
 *
 * @param {{
 *   iconSvg: string,
 *   title: string,
 *   subtitle: string,
 *   btnLabel: string,
 *   btnOnclick: string,
 *   recentItems?: Array<{ id: number, name: string, meta?: string, onClick: string }>,
 *   recentLabel?: string,
 *   itemIconSvg?: string,
 * }} opts
 */
function _renderListEmpty(opts) {
  const { iconSvg, title, subtitle, btnLabel, btnOnclick, recentItems, recentLabel, itemIconSvg } = opts;
  const recents = (recentItems || []).slice(0, 5);
  const recentHTML = recents.length
    ? `<div class="pe-recent-list">
        <div class="pe-recent-label">${_escHtml(recentLabel || 'Recent')}</div>
        ${recents.map(r => {
          const badge = itemIconSvg
            ? itemIconSvg
            : _escHtml((r.name || '?').trim().charAt(0).toUpperCase() || '?');
          return `<div class="pe-recent-item" onclick="${r.onClick}">
            <span class="pe-ri-icon">${badge}</span>
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

// ══════════════════════════════════════════
// SIDEBAR RESIZE — shared draggable boundary
// ══════════════════════════════════════════
// Wires every `[data-sidebar-resize]` handle in the DOM. Each handle resizes
// its previous sibling (the sidebar), clamps the width to [data-min, data-max],
// and persists to localStorage under `procab.sidebar.<key>`. Idempotent.
//
// Markup contract (per panel):
//   <div class="sidebar">…</div>
//   <div class="resize-handle"
//        data-sidebar-resize="<key>"
//        data-min="260"
//        data-max="520"></div>
//   <div class="main-content">…</div>
function _initSidebarResize() {
  document.querySelectorAll('[data-sidebar-resize]').forEach(/** @param {Element} h */ h => {
    const handle = /** @type {HTMLElement} */ (h);
    if (handle.dataset.sidebarResizeWired) return;
    handle.dataset.sidebarResizeWired = '1';
    const sidebar = /** @type {HTMLElement | null} */ (handle.previousElementSibling);
    if (!sidebar) return;
    const minW = Number(handle.dataset.min) || 200;
    const maxW = Number(handle.dataset.max) || 720;
    const key  = handle.dataset.sidebarResize ? `procab.sidebar.${handle.dataset.sidebarResize}` : '';
    if (key) {
      const saved = Number(localStorage.getItem(key));
      if (saved >= minW && saved <= maxW) sidebar.style.width = saved + 'px';
    }
    let dragging = false;
    /** @type {number} */ let startX = 0;
    /** @type {number} */ let startW = 0;
    handle.addEventListener('pointerdown', /** @param {PointerEvent} e */ e => {
      dragging = true; startX = e.clientX; startW = sidebar.offsetWidth;
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    handle.addEventListener('pointermove', /** @param {PointerEvent} e */ e => {
      if (!dragging) return;
      sidebar.style.width = Math.max(minW, Math.min(maxW, startW + e.clientX - startX)) + 'px';
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.userSelect = '';
      if (key) localStorage.setItem(key, String(Math.max(minW, Math.min(maxW, sidebar.offsetWidth))));
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initSidebarResize);
else _initSidebarResize();

