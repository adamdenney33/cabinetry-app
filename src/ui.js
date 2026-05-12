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
// TARGET-PICKER POPUP — shared list pattern
// ══════════════════════════════════════════
// Used by Send to Quote, Send to Order, Link to Cabinet. Keeps row markup,
// search behaviour, and empty-state consistent. CSS lives under .picker-* in
// styles.css.

/**
 * @typedef {Object} PickerItem
 * @property {string} title
 * @property {string} onPick    Inline JS executed on row click (onmousedown).
 * @property {string} [icon]    SVG markup or inline HTML (rendered inside .picker-item-icon).
 * @property {string} [metaText]  Optional secondary line text (e.g. dimensions, due date).
 * @property {Array<{label:string,tone?:string}>} [metaPills]  Status pills (.picker-item-pill).
 * @property {string} [searchKey]  Override searchable string (defaults to title + metaText).
 */

/**
 * Render a target-picker popup.
 *
 * @param {Object} cfg
 * @param {string} cfg.title
 * @param {string} [cfg.hint]            Muted text above the list.
 * @param {Array<PickerItem>} cfg.items
 * @param {string} [cfg.emptyText]       Shown inside .picker-empty when items is empty.
 * @param {string} [cfg.createLabel]     Renders dashed "Create new" footer card.
 * @param {string} [cfg.onCreate]        Inline JS for the create CTA (onmousedown).
 * @param {string} [cfg.createClass]     Extra class on `.picker-create` (e.g. 'subtle').
 * @param {'sm'|'md'|'lg'} [cfg.size]    Defaults to 'md'.
 * @param {number} [cfg.searchThreshold] Show search input when items.length >= this. Default 6.
 */
function _openPickerPopup(cfg) {
  const size = cfg.size || 'md';
  const items = cfg.items || [];
  const threshold = cfg.searchThreshold == null ? 6 : cfg.searchThreshold;
  const showSearch = items.length >= threshold;

  const rowsHtml = items.map((it, i) => {
    const searchKey = (it.searchKey != null ? it.searchKey : `${it.title} ${it.metaText || ''}`)
      .toLowerCase();
    const pills = (it.metaPills || []).map(p =>
      `<span class="picker-item-pill tone-${_escHtml(String(p.tone || 'default'))}">${_escHtml(p.label)}</span>`
    ).join('');
    const metaHtml = (pills || it.metaText)
      ? `<div class="picker-item-meta">${pills}${it.metaText ? `<span>${_escHtml(it.metaText)}</span>` : ''}</div>`
      : '';
    const iconHtml = it.icon ? `<div class="picker-item-icon">${it.icon}</div>` : '';
    return `<div class="picker-item" data-search="${_escHtml(searchKey)}" data-idx="${i}" onmousedown="${it.onPick}">
      ${iconHtml}
      <div class="picker-item-body">
        <div class="picker-item-title">${_escHtml(it.title)}</div>
        ${metaHtml}
      </div>
      <div class="picker-item-arrow">&rarr;</div>
    </div>`;
  }).join('');

  const listOrEmpty = items.length
    ? `<div class="picker-list" id="_picker-list">${rowsHtml}</div>`
    : `<div class="picker-empty">${cfg.emptyText || 'Nothing here yet.'}</div>`;

  const searchHtml = (showSearch && items.length)
    ? `<input type="text" class="picker-search" id="_picker-search" placeholder="Filter…" autocomplete="off" oninput="_pickerFilter(this)">`
    : '';

  const createHtml = cfg.createLabel
    ? `<div class="picker-create${cfg.createClass ? ' ' + _escHtml(cfg.createClass) : ''}" onmousedown="${cfg.onCreate || ''}">${_escHtml(cfg.createLabel)}</div>`
    : '';

  const html = `
    <div class="popup-header">
      <div class="popup-title">${_escHtml(cfg.title)}</div>
      <button class="popup-close" onclick="_closePopup()">&times;</button>
    </div>
    <div class="popup-body">
      ${cfg.hint ? `<div class="picker-hint">${cfg.hint}</div>` : ''}
      ${searchHtml}
      ${listOrEmpty}
      ${createHtml}
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
    </div>
  `;
  _openPopup(html, size);
  // Auto-focus search input when present.
  if (showSearch) {
    setTimeout(() => { const s = document.getElementById('_picker-search'); if (s) /** @type {HTMLInputElement} */ (s).focus(); }, 60);
  }
}
/** @type {any} */ (window)._openPickerPopup = _openPickerPopup;

/** Live-filter picker rows by their data-search attribute.
 *  @param {HTMLInputElement} input */
function _pickerFilter(input) {
  const q = (input.value || '').toLowerCase().trim();
  const list = document.getElementById('_picker-list');
  if (!list) return;
  const rows = /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll('.picker-item'));
  rows.forEach(r => {
    const key = r.getAttribute('data-search') || '';
    r.style.display = (!q || key.indexOf(q) !== -1) ? '' : 'none';
  });
}
/** @type {any} */ (window)._pickerFilter = _pickerFilter;

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

// Content-area section header icons (20×20) — match the nav-tab SVG paths in
// index.html so each section header echoes its top-level tab icon.
const _CH_ICON_CABINET = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>';
const _CH_ICON_PROJECT = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>';
const _CH_ICON_CUTLIST = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>';
const _CH_ICON_STOCK = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
const _CH_ICON_QUOTE = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
const _CH_ICON_ORDER = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
const _CH_ICON_CLIENT = '<svg class="ch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
/** @type {any} */ (window)._CH_ICON_CABINET = _CH_ICON_CABINET;
/** @type {any} */ (window)._CH_ICON_PROJECT = _CH_ICON_PROJECT;
/** @type {any} */ (window)._CH_ICON_CUTLIST = _CH_ICON_CUTLIST;
/** @type {any} */ (window)._CH_ICON_STOCK = _CH_ICON_STOCK;
/** @type {any} */ (window)._CH_ICON_QUOTE = _CH_ICON_QUOTE;
/** @type {any} */ (window)._CH_ICON_ORDER = _CH_ICON_ORDER;
/** @type {any} */ (window)._CH_ICON_CLIENT = _CH_ICON_CLIENT;

/**
 * Content-area section header: icon + bold title, optional " — client" suffix.
 * @param {{ iconSvg: string, title: string, clientName?: string }} opts
 * @returns {string}
 */
function _renderContentHeader(opts) {
  const { iconSvg, title, clientName } = opts;
  const clientHtml = clientName
    ? ` <span class="ch-client">— ${_escHtml(clientName)}</span>`
    : '';
  return `<div class="content-header">${iconSvg}<h2 class="ch-title">${_escHtml(title)}${clientHtml}</h2></div>`;
}
/** @type {any} */ (window)._renderContentHeader = _renderContentHeader;

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
          const display = cName ? `${p.name} · ${cName}` : p.name;
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
 *   activeId?: number | null,
 * }} opts
 */
function _renderListEmpty(opts) {
  const { iconSvg, title, subtitle, btnLabel, btnOnclick, recentItems, recentLabel, itemIconSvg, activeId } = opts;
  const recents = (recentItems || []).slice(0, 5);
  const recentHTML = recents.length
    ? `<div class="pe-recent-list">
        <div class="pe-recent-label">${_escHtml(recentLabel || 'Recent')}</div>
        ${recents.map(r => {
          const badge = itemIconSvg
            ? itemIconSvg
            : _escHtml((r.name || '?').trim().charAt(0).toUpperCase() || '?');
          const isActive = activeId != null && r.id === activeId;
          return `<div class="pe-recent-item${isActive?' active':''}" onclick="${r.onClick}">
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

