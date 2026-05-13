// ProCabinet — Clients & projects CRUD/render (carved out of src/app.js
// in phase E carve 11 — the last functional section of app.js).
//
// Loaded as a classic <script defer> AFTER src/app.js. No state declarations
// here — `clients` and `projects` arrays live at the top of app.js's STOCK
// section and resolve through the global env at call time.
//
// Cross-file dependencies: `clients` / `projects` arrays (app.js STOCK),
// `_db` / Supabase RLS-bound table builders (src/db.js), `_userId` /
// `_toast` / `_requireAuth` / `_escHtml` / `_openPopup` / `_closePopup` /
// `_popupVal` / `switchSection` (app.js / ui.js), `renderDashboard` /
// `drawRevenueChart` (src/dashboard.js — must be loaded BEFORE this file
// since the trailing init block calls renderDashboard() at script-load
// time).
//
// Note: _dbInsertSafe / resolveClient / resolveProject are foundational
// helpers used app-wide (quotes.js, orders.js, projects.js, etc.). They
// live here historically; moving them to src/db.js or a shared lib is
// deferred to a future cleanup pass.

// ══════════════════════════════════════════
// CLIENTS & PROJECTS — CRUD + RENDER
// ══════════════════════════════════════════

// ── Safe insert — retries by stripping columns the schema doesn't have yet ──
/**
 * Insert a row, retrying with stripped columns if the schema rejects unknown
 * fields. Returns `data` typed as `any` because the table param is
 * polymorphic; callers narrow at the use site (the in-memory shape of each
 * collection includes ad-hoc fields beyond the DB row).
 *
 * @param {keyof import('./database.types').Database['public']['Tables']} table
 * @param {Record<string, any>} row
 * @returns {Promise<{data: any, error: any}>}
 */
async function _dbInsertSafe(table, row) {
  let { data, error } = await _db(table).insert(/** @type {any} */ (row)).select().single();
  while (error && error.message) {
    const m = error.message.match(/Could not find the '(\w+)' column/);
    if (!m) break;
    delete row[m[1]];
    ({ data, error } = await _db(table).insert(/** @type {any} */ (row)).select().single());
  }
  return { data, error };
}

// ── Resolve-or-create helpers ──
/** @param {string} name */
async function resolveClient(name) {
  if (!name) return null;
  const existing = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  // Auto-creating a new client — gate on free-tier cap.
  if (!_enforceFreeLimit('clients', clients.length)) return null;
  /** @type {any} */
  const row = { user_id: _userId, name };
  const { data, error } = await _db('clients').insert(row).select().single();
  if (error || !data) return null;
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  return data.id;
}

/** @param {string} name @param {number | null} [clientId] */
async function resolveProject(name, clientId) {
  if (!name) return null;
  const existing = projects.find(p => p.name.toLowerCase() === name.toLowerCase() && (p.client_id === clientId || !clientId));
  if (existing) return existing.id;
  // Auto-creating a new project — gate on free-tier cap.
  if (!_enforceFreeLimit('projects', projects.length)) return null;
  /** @type {any} */
  const row = { user_id: _userId, name, status: 'active' };
  if (clientId) row.client_id = clientId;
  const { data, error } = await _dbInsertSafe('projects', row);
  if (error || !data) return null;
  projects.unshift(data);
  return data.id;
}

/** @param {string} id */
const _clInput = id => /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */ (document.getElementById(id));

// ── Client CRUD ──
async function createClient() {
  const name = _clInput('cl-name')?.value.trim() || '';
  if (!name) { _toast('Enter a client name.', 'error'); return; }
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('clients', clients.length)) return;
  /** @type {any} */
  const row = {
    user_id: _userId, name,
    email: _clInput('cl-email')?.value.trim() || null,
    phone: _clInput('cl-phone')?.value.trim() || null,
    address: _clInput('cl-address')?.value.trim() || null,
    notes: _clInput('cl-notes')?.value.trim() || null,
  };
  const { data, error } = await _dbInsertSafe('clients', row);
  if (error || !data) { _toast('Could not save client — ' + (error?.message || JSON.stringify(error)), 'error'); return; }
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  _toast('Client added', 'success');
  for (const id of ['cl-name','cl-email','cl-phone','cl-address','cl-notes']) {
    const el = _clInput(id); if (el) el.value = '';
  }
  _clientsShowForm = false;
  renderClientsMain();
}

/** @param {number} id @param {string} field @param {any} value */
async function updateClient(id, field, value) {
  const c = clients.find(c => c.id === id);
  if (!c) return;
  /** @type {any} */ (c)[field] = value;
  await _db('clients').update(/** @type {any} */ ({ [field]: value })).eq('id', id);
}

/** @param {number} id */
async function removeClient(id) {
  if (!_requireAuth()) return;
  await _db('clients').delete().eq('id', id);
  clients = clients.filter(c => c.id !== id);
  renderClientsMain();
  _toast('Client removed', 'success');
}

/** @param {number} id */
async function duplicateClient(id) {
  if (!_requireAuth()) return;
  if (!_enforceFreeLimit('clients', clients.length)) return;
  const c = /** @type {any} */ (clients.find(c => c.id === id));
  if (!c) return;
  /** @type {any} */
  const row = {
    user_id: _userId,
    name: c.name + ' (copy)',
    email: c.email || null,
    phone: c.phone || null,
    address: c.address || null,
    notes: c.notes || null,
  };
  const { data, error } = await _dbInsertSafe('clients', row);
  if (error || !data) { _toast('Could not duplicate — ' + (error?.message || JSON.stringify(error)), 'error'); return; }
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  _toast('Client duplicated', 'success');
  renderClientsMain();
}

// ── Client edit (sidebar) ──
/** Populate the Clients sidebar form with an existing client and switch into
 *  edit mode. Mirrors the Stock pattern (editStockItem). @param {number} id */
function editClient(id) {
  const c = /** @type {any} */ (clients.find(x => x.id === id));
  if (!c) return;
  /** @type {any} */ (window)._editingClientId = id;
  _clientsShowForm = true;
  _renderClientsSidebarGate();
  const set = /** @param {string} elId @param {string} val */ (elId, val) => {
    const el = _clInput(elId); if (el) el.value = val;
  };
  set('cl-name', c.name || '');
  set('cl-email', c.email || '');
  set('cl-phone', c.phone || '');
  set('cl-address', c.address || '');
  set('cl-notes', c.notes || '');
  const sb = document.getElementById('cl-submit-btn');
  const ft = document.getElementById('cl-form-title-text');
  if (sb) /** @type {HTMLElement} */ (sb).style.display = 'none';
  if (ft) ft.textContent = 'Edit Client';
  _clSetSaveState('saved');
  const sidebar = document.querySelector('#panel-clients .sidebar-scroll');
  if (sidebar) /** @type {HTMLElement} */ (sidebar).scrollTop = 0;
}

async function saveClientEdit() {
  const id = /** @type {any} */ (window)._editingClientId;
  if (!id) { createClient(); return; }
  const c = /** @type {any} */ (clients.find(x => x.id === id));
  if (!c) return;
  const name = _clInput('cl-name')?.value.trim() || '';
  if (!name) { _toast('Enter a client name.', 'error'); return; }
  /** @type {any} */
  const updates = {
    name,
    email: _clInput('cl-email')?.value.trim() || null,
    phone: _clInput('cl-phone')?.value.trim() || null,
    address: _clInput('cl-address')?.value.trim() || null,
    notes: _clInput('cl-notes')?.value.trim() || null,
  };
  Object.assign(c, updates);
  const { error } = await _db('clients').update(/** @type {any} */ (updates)).eq('id', id);
  if (error) { _toast('Could not save client — ' + (error.message || JSON.stringify(error)), 'error'); return; }
  _toast('Client updated', 'success');
  cancelClientEdit();
}

function cancelClientEdit() {
  if (_clientsAutosaveTimer) { clearTimeout(_clientsAutosaveTimer); _clientsAutosaveTimer = null; }
  /** @type {any} */ (window)._editingClientId = null;
  for (const id of ['cl-name','cl-email','cl-phone','cl-address','cl-notes']) {
    const el = _clInput(id); if (el) el.value = '';
  }
  const sb = document.getElementById('cl-submit-btn');
  const ft = document.getElementById('cl-form-title-text');
  if (sb) { sb.textContent = '+ Add Client'; /** @type {HTMLElement} */ (sb).style.display = ''; }
  if (ft) ft.textContent = 'New Client';
  _clSetSaveState(null);
  _clientsShowForm = false;
  renderClientsMain();
}

/** @type {ReturnType<typeof setTimeout>|null} */
let _clientsAutosaveTimer = null;

/** @param {'saving'|'saved'|'error'|null} state */
function _clSetSaveState(state) {
  const el = document.getElementById('cl-save-indicator');
  if (!el) return;
  el.classList.remove('is-saving','is-saved','is-error');
  if (!state) { /** @type {HTMLElement} */ (el).style.display = 'none'; el.textContent = ''; return; }
  /** @type {HTMLElement} */ (el).style.display = '';
  if (state === 'saving') { el.textContent = 'Saving…'; el.classList.add('is-saving'); }
  else if (state === 'saved') { el.textContent = 'Saved'; el.classList.add('is-saved'); }
  else if (state === 'error') { el.textContent = 'Save failed'; el.classList.add('is-error'); }
}

function _clScheduleAutosave() {
  if (!(/** @type {any} */ (window)._editingClientId)) return;
  if (_clientsAutosaveTimer) clearTimeout(_clientsAutosaveTimer);
  _clSetSaveState('saving');
  _clientsAutosaveTimer = setTimeout(_clAutosaveRun, 500);
}
/** @type {any} */ (window)._clScheduleAutosave = _clScheduleAutosave;

async function _clAutosaveRun() {
  _clientsAutosaveTimer = null;
  const id = /** @type {any} */ (window)._editingClientId;
  if (!id) return;
  const c = /** @type {any} */ (clients.find(x => x.id === id));
  if (!c) return;
  const name = _clInput('cl-name')?.value.trim() || '';
  if (!name) { _clSetSaveState('error'); return; }
  /** @type {any} */
  const updates = {
    name,
    email: _clInput('cl-email')?.value.trim() || null,
    phone: _clInput('cl-phone')?.value.trim() || null,
    address: _clInput('cl-address')?.value.trim() || null,
    notes: _clInput('cl-notes')?.value.trim() || null,
  };
  Object.assign(c, updates);
  const { error } = await _db('clients').update(/** @type {any} */ (updates)).eq('id', id);
  if (error) { _clSetSaveState('error'); return; }
  _clSetSaveState('saved');
  renderClientsMain();
}

(function _wireClientsAutosave() {
  for (const id of ['cl-name','cl-email','cl-phone','cl-address','cl-notes']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _clScheduleAutosave);
  }
})();

// ── Project CRUD ──
/** @param {number} id @param {string} field @param {any} value */
async function updateProject(id, field, value) {
  const p = projects.find(p => p.id === id);
  if (!p) return;
  /** @type {any} */ (p)[field] = value;
  await _db('projects').update(/** @type {any} */ ({ [field]: value })).eq('id', id);
}

/** @param {number} id */
async function removeProject(id) {
  if (!_requireAuth()) return;
  await _db('projects').delete().eq('id', id);
  projects = projects.filter(p => p.id !== id);
  if (_pjCurrentProjectId === id) {
    _pjCurrentProjectId = null;
    _pjDirty = false;
    if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; }
    if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'clean');
    if (typeof _pjRenderProjectSubGate === 'function') _pjRenderProjectSubGate();
  }
  renderProjectsMain();
  _toast('Project removed', 'success');
}

// ── Client name helper ──
/** @param {number | null | undefined} id */
function _clientName(id) {
  if (id == null) return '';
  const c = clients.find(c => c.id === id);
  return c ? c.name : '';
}
/** @param {number | null | undefined} id */
function _projectName(id) {
  if (id == null) return '';
  const p = projects.find(p => p.id === id);
  return p ? p.name : '';
}

// ── Client suggest for Projects sidebar ──
/** @param {HTMLInputElement} input */
function _pjClientSuggest(input) {
  const val = input.value.toLowerCase().trim();
  const list = document.getElementById('pj-client-suggest');
  if (!list) return;
  _posSuggest(input, list);
  const matches = val ? clients.filter(c => c.name.toLowerCase().includes(val)).slice(0, 8) : clients.slice(0, 8);
  list.innerHTML = matches.map(c => `<div class="client-suggest-item" onmousedown="document.getElementById('pj-client').value='${_escHtml(c.name)}';document.getElementById('pj-client-suggest').style.display='none'">
    <span class="suggest-icon">${c.name.charAt(0).toUpperCase()}</span>
    <span>${_escHtml(c.name)}</span>
  </div>`).join('') + `<div class="client-suggest-add" onmousedown="_openNewClientPopup('pj-client')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new client</div>`;
  list.style.display = 'block';
  input.onblur = () => setTimeout(() => list.style.display = 'none', 150);
}

// ── Sidebar gates: simple icon + title + subtitle + button shown when the
//    list is empty and the user hasn't engaged. Once revealed, the drill
//    section replaces the gate (Projects tab) or the inline form replaces
//    the gate (Clients tab).
let _clientsShowForm = false;
/**
 * @type {number | null} The client the user is currently drilled INTO on the
 * Projects tab. Null = empty state (sidebar shows the client picker, main
 * panel shows a prompt). Set = sidebar shows drill header + smart library +
 * always-visible autosaving form.
 */
let _projectsActiveClientId = null;

// ── Projects autosave state ──
/** @type {number | null} Currently-loaded project (null = draft → INSERT on first save). */
let _pjCurrentProjectId = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let _pjAutosaveTimer = null;
/** True between user edit and successful save. */
let _pjDirty = false;

function _renderProjectsSidebarGate() {
  const gate = document.getElementById('projects-gate');
  const drill = document.getElementById('projects-drill-section');
  if (!gate || !drill) return;

  // STATE B: drilled into a client → drill section visible
  // Sub-state B1: no project open → sub-gate (+ Add Project + recent projects).
  // Sub-state B2: project open    → drill-in form with autosave indicator.
  if (_projectsActiveClientId) {
    gate.innerHTML = '';
    gate.style.display = 'none';
    /** @type {HTMLElement} */ (drill).style.display = '';
    _pjRenderDrillHeader();
    _pjRenderProjectSubGate();
    return;
  }

  // STATE A: no client picked → smart-input client picker + recent clients
  /** @type {HTMLElement} */ (drill).style.display = 'none';
  const recents = (clients || []).slice().sort(/** @param {any} a @param {any} b */ (a, b) => {
    const av = a.updated_at ? +new Date(a.updated_at) : (a.id || 0);
    const bv = b.updated_at ? +new Date(b.updated_at) : (b.id || 0);
    return bv - av;
  }).slice(0, 5);
  const recentHTML = recents.length
    ? `<div class="pe-recent-list">
        <div class="pe-recent-label">Recent clients</div>
        ${recents.map(/** @param {any} c */ c => {
          const count = projects.filter(/** @param {any} p */ p => p.client_id === c.id).length;
          return `<div class="pe-recent-item" onclick="_pickClientForProjects(${c.id})">
            <span class="pe-ri-icon">${_TYPE_ICON_CLIENT}</span>
            <span>${_escHtml(c.name)}</span>
            ${count ? `<span class="pe-ri-meta">${count} project${count!==1?'s':''}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`
    : '<div style="font-size:11px;color:var(--muted);padding:8px 0;text-align:left">No clients yet — use + to create one.</div>';

  gate.innerHTML = `<div class="project-empty">
    <svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
    <h3>Projects</h3>
    <p>Pick a client to see their projects.</p>
    <div style="position:relative;text-align:left">
      <div class="smart-input-wrap">
        <input type="text" id="projects-empty-picker" placeholder="Search or add client..." autocomplete="off"
          oninput="_smartProjectsClientSuggest(this,'projects-empty-suggest')"
          onfocus="_smartProjectsClientSuggest(this,'projects-empty-suggest')"
          onblur="setTimeout(()=>{const b=document.getElementById('projects-empty-suggest'); if(b)b.style.display='none'},150)">
        <div class="smart-input-add" onclick="_openNewClientPopup('projects-empty-picker')" title="New client">+</div>
      </div>
      <div id="projects-empty-suggest" class="client-suggest-list" style="display:none"></div>
    </div>
    ${recentHTML}
  </div>`;
  gate.style.display = '';
}

/** Drill into a client — set the active id, refresh sidebar + main panel. @param {number} id */
function _pickClientForProjects(id) {
  if (_projectsActiveClientId !== id) {
    _pjCurrentProjectId = null;
    _pjDirty = false;
    if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; }
  }
  _projectsActiveClientId = id;
  renderProjectsMain();
}
/** @type {any} */ (window)._pickClientForProjects = _pickClientForProjects;

/** Exit drill-in — clear active client, refresh both panels. */
function _exitClient_projects() {
  // Flush any pending autosave before tearing down state.
  if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; _pjRunAutosave(); }
  _pjCurrentProjectId = null;
  _pjDirty = false;
  _projectsActiveClientId = null;
  renderProjectsMain();
}
/** @type {any} */ (window)._exitClient_projects = _exitClient_projects;

/**
 * Smart-input dropdown for the projects-tab empty-state client picker.
 * Mirrors _smartCLEmptyProjectSuggest in cutlist.js, but for clients.
 * @param {HTMLInputElement} input
 * @param {string} boxId
 */
function _smartProjectsClientSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = document.getElementById(boxId);
  if (!box) return;
  if (typeof _posSuggest === 'function') _posSuggest(input, box);
  const matches = clients
    .filter(/** @param {any} c */ c => !val || c.name.toLowerCase().includes(val))
    .slice(0, 8);
  /** @param {string} s */
  const esc = s => _escHtml(s).replace(/'/g, '&#39;');
  let html = '';
  for (const c of matches) {
    const count = projects.filter(/** @param {any} p */ p => p.client_id === c.id).length;
    html += `<div class="client-suggest-item" onmousedown="_pickClientForProjects(${c.id})">
      <span class="suggest-icon">${_TYPE_ICON_CLIENT}</span>
      <span class="csi-name">${esc(c.name)}</span>
      ${count ? `<span class="csi-meta">${count} project${count!==1?'s':''}</span>` : ''}
    </div>`;
  }
  if (val && !matches.some(/** @param {any} c */ c => c.name.toLowerCase() === val)) {
    html += `<div class="client-suggest-item client-suggest-add" onmousedown="_openNewClientPopup('projects-empty-picker')">
      <span class="csi-icon">+</span>
      <span class="csi-name">Create client "${esc(input.value.trim())}"</span>
    </div>`;
  }
  if (!html) html = '<div class="client-suggest-empty" style="padding:8px 12px;font-size:12px;color:var(--muted)">No clients yet — click + to create one.</div>';
  box.innerHTML = html;
  box.style.display = 'block';
}
/** @type {any} */ (window)._smartProjectsClientSuggest = _smartProjectsClientSuggest;

/**
 * Force-set the active client (used by client-card project shortcuts).
 * Unlike a toggle, this never clears — exit is via the back arrow.
 * @param {number} id
 */
function _setProjectsActiveClient(id) {
  if (_projectsActiveClientId !== id) {
    _pjCurrentProjectId = null;
    _pjDirty = false;
    if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; }
  }
  _projectsActiveClientId = id;
  renderProjectsMain();
}
/** @type {any} */ (window)._setProjectsActiveClient = _setProjectsActiveClient;

/**
 * Jump from a Clients-tab project tag to the Projects tab: switch section,
 * drill into the client, and highlight the specific project card.
 * @param {number} projectId
 * @param {number} clientId
 */
function _gotoProjectFromClient(projectId, clientId) {
  _setProjectsActiveClient(clientId);
  switchSection('projects');
  _highlightProject(projectId);
}
/** @type {any} */ (window)._gotoProjectFromClient = _gotoProjectFromClient;

/** Backward-compat shim — used by client-card "+ new project" buttons to
 *  drop straight into a fresh project draft once the client is active. */
function _projectsRevealForm() {
  if (typeof _pjStartNewProject === 'function') _pjStartNewProject();
}
/** @type {any} */ (window)._projectsRevealForm = _projectsRevealForm;

/** No-op kept for backward compatibility with external callers. */
function _projectsMaybeResetFormFlag() { /* no-op after autosave refactor */ }
/** @type {any} */ (window)._projectsMaybeResetFormFlag = _projectsMaybeResetFormFlag;

// ── Projects sidebar drill helpers (Cutlist-parity autosave) ──

/** Render the drill header (back arrow + client name) into #pj-drill-header. */
function _pjRenderDrillHeader() {
  const host = document.getElementById('pj-drill-header');
  if (!host) return;
  const client = clients.find(/** @param {any} c */ c => c.id === _projectsActiveClientId);
  const cName = client ? client.name : 'Client';
  host.innerHTML = _renderProjectHeader('projects', {
    name: cName,
    exitFn: '_exitClient_projects',
    iconSvg: '<svg class="ph-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  });
}

/** Toggle between the sub-gate (recent projects) and the drill-in form,
 *  based on whether a project is currently loaded. */
function _pjRenderProjectSubGate() {
  const sub = document.getElementById('projects-sub-gate');
  const form = document.getElementById('projects-form-section');
  if (!sub || !form) return;
  if (_pjCurrentProjectId == null) {
    // Sub-gate: + Add Project + recent projects scoped to active client.
    /** @type {HTMLElement} */ (form).style.display = 'none';
    const recents = projects
      .filter(/** @param {any} p */ p => p.client_id === _projectsActiveClientId)
      .slice()
      .sort(/** @param {any} a @param {any} b */ (a, b) => {
        const av = a.updated_at ? +new Date(a.updated_at) : (a.id || 0);
        const bv = b.updated_at ? +new Date(b.updated_at) : (b.id || 0);
        return bv - av;
      })
      .slice(0, 5)
      .map(/** @param {any} p */ p => ({
        id: p.id,
        name: p.name,
        meta: p.status && p.status !== 'active' ? p.status : '',
        onClick: `_pjLoadProject(${p.id})`,
      }));
    sub.innerHTML = _renderListEmpty({
      iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
      title: 'Projects',
      subtitle: 'Add a project for this client. New projects autosave as you type.',
      btnLabel: '+ Add Project',
      btnOnclick: '_pjStartNewProject()',
      recentItems: recents,
      recentLabel: 'Recent',
      itemIconSvg: _TYPE_ICON_PROJECT,
    });
    sub.style.display = '';
    return;
  }
  // Drill-in: hide sub-gate, reveal form.
  sub.innerHTML = '';
  sub.style.display = 'none';
  /** @type {HTMLElement} */ (form).style.display = '';
}
/** @type {any} */ (window)._pjRenderProjectSubGate = _pjRenderProjectSubGate;

/** Compute the next sequential "Project N" name for the active client. */
function _pjNextProjectName() {
  let max = 0;
  for (const p of projects) {
    if (p.client_id !== _projectsActiveClientId) continue;
    const m = String(p.name || '').match(/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'Project ' + (max + 1);
}
/** @type {any} */ (window)._pjNextProjectName = _pjNextProjectName;

/** "+ Add Project" handler. Pre-populates the form with a sequential default
 *  name and marks dirty so the first autosave INSERTs the row immediately. */
function _pjStartNewProject() {
  if (!_projectsActiveClientId) { _toast('Pick a client first', 'error'); return; }
  if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; }
  _pjCurrentProjectId = null;
  _pjDirty = false;
  const defaultName = _pjNextProjectName();
  for (const id of ['pj-desc']) {
    const el = _clInput(id); if (el) /** @type {HTMLInputElement|HTMLTextAreaElement} */ (el).value = '';
  }
  const nameEl = /** @type {HTMLInputElement|null} */ (_clInput('pj-name'));
  if (nameEl) nameEl.value = defaultName;
  const titleEl = document.getElementById('pj-form-title-text');
  if (titleEl) titleEl.textContent = defaultName;
  const st = /** @type {HTMLSelectElement|null} */ (_clInput('pj-status')); if (st) st.value = 'active';
  // Reveal the form, hide the sub-gate.
  const sub = document.getElementById('projects-sub-gate');
  const form = document.getElementById('projects-form-section');
  if (sub) { sub.innerHTML = ''; sub.style.display = 'none'; }
  if (form) /** @type {HTMLElement} */ (form).style.display = '';
  // Mark dirty + schedule autosave so the row is INSERTed without further user input.
  _pjFormChanged();
  if (nameEl) nameEl.focus();
}
/** @type {any} */ (window)._pjStartNewProject = _pjStartNewProject;

/** Exit drill-in to the project sub-gate (without exiting the client). */
function _pjExitProject() {
  if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; _pjRunAutosave(); }
  _pjCurrentProjectId = null;
  _pjDirty = false;
  if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'clean');
  _pjRenderProjectSubGate();
}
/** @type {any} */ (window)._pjExitProject = _pjExitProject;

/** Wired to oninput/onchange on every form field. Marks dirty + schedules save. */
function _pjFormChanged() {
  if (!_projectsActiveClientId) return;
  _pjDirty = true;
  if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'dirty');
  _pjScheduleAutosave();
}
/** @type {any} */ (window)._pjFormChanged = _pjFormChanged;

/** Debounced 800ms autosave (matches Cutlist's _clScheduleAutosave). */
function _pjScheduleAutosave() {
  if (_pjAutosaveTimer) clearTimeout(_pjAutosaveTimer);
  _pjAutosaveTimer = setTimeout(() => { _pjAutosaveTimer = null; _pjRunAutosave(); }, 800);
}

/** Persist the current form state. INSERT on first save (with non-empty name),
 *  UPDATE thereafter. */
async function _pjRunAutosave() {
  if (!_userId || !_projectsActiveClientId) return;
  const name = _clInput('pj-name')?.value.trim() || '';
  if (!name && _pjCurrentProjectId == null) {
    _pjDirty = false;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'clean');
    return;
  }
  const desc = _clInput('pj-desc')?.value.trim() || null;
  const status = _clInput('pj-status')?.value || 'active';
  if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'saving');

  if (_pjCurrentProjectId == null) {
    if (!_enforceFreeLimit('projects', projects.length)) {
      if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'clean');
      return;
    }
    /** @type {any} */
    const row = { user_id: _userId, name, description: desc, status, client_id: _projectsActiveClientId };
    const { data, error } = await _dbInsertSafe('projects', row);
    if (error || !data) {
      if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'failed', { retry: _pjRunAutosave });
      return;
    }
    /** @type {any} */ (data).status = data.status || 'active';
    projects.unshift(/** @type {any} */ (data));
    _pjCurrentProjectId = data.id;
    _pjDirty = false;
    const titleNew = document.getElementById('pj-form-title-text');
    if (titleNew) titleNew.textContent = name;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'saved');
    renderProjectsMain();
  } else {
    const p = /** @type {any} */ (projects.find(x => x.id === _pjCurrentProjectId));
    if (!p) { _pjCurrentProjectId = null; return _pjRunAutosave(); }
    /** @type {any} */
    const updates = { name, description: desc, status };
    Object.assign(p, updates);
    const { error } = await _db('projects').update(/** @type {any} */ (updates)).eq('id', _pjCurrentProjectId);
    if (error) {
      if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'failed', { retry: _pjRunAutosave });
      return;
    }
    _pjDirty = false;
    const titleUpd = document.getElementById('pj-form-title-text');
    if (titleUpd) titleUpd.textContent = name;
    if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'saved');
    renderProjectsMain();
  }
}
/** @type {any} */ (window)._pjRunAutosave = _pjRunAutosave;

/** Load an existing project into the sidebar form for autosave editing.
 *  Flips the projects sidebar from sub-gate → drill-in.
 *  @param {number} id */
function _pjLoadProject(id) {
  if (_pjAutosaveTimer) { clearTimeout(_pjAutosaveTimer); _pjAutosaveTimer = null; _pjRunAutosave(); }
  const p = /** @type {any} */ (projects.find(x => x.id === id));
  if (!p) return;
  // If the project belongs to a different client, switch active client first.
  if (p.client_id && p.client_id !== _projectsActiveClientId) {
    _projectsActiveClientId = p.client_id;
  }
  _pjCurrentProjectId = id;
  _pjDirty = false;
  /** @param {string} elId @param {string} val */
  const set = (elId, val) => {
    const el = _clInput(elId); if (el) /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement} */ (el).value = val;
  };
  set('pj-name', p.name || '');
  set('pj-desc', p.description || '');
  set('pj-status', p.status || 'active');
  const titleEl = document.getElementById('pj-form-title-text');
  if (titleEl) titleEl.textContent = p.name || 'Project';
  if (typeof _setSaveStatus === 'function') _setSaveStatus('project', 'clean');
  _pjRenderProjectSubGate();
}
/** @type {any} */ (window)._pjLoadProject = _pjLoadProject;

function _renderClientsSidebarGate() {
  const gate = document.getElementById('clients-gate');
  const form = document.getElementById('clients-form-section');
  if (!gate || !form) return;
  if (!_clientsShowForm) {
    const recents = (clients || []).slice().sort(/** @param {any} a @param {any} b */ (a, b) => {
      const av = a.updated_at ? +new Date(a.updated_at) : (a.id || 0);
      const bv = b.updated_at ? +new Date(b.updated_at) : (b.id || 0);
      return bv - av;
    }).map(/** @param {any} c */ c => ({
      id: c.id,
      name: c.name,
      meta: c.email || c.phone || '',
      onClick: `_openClientPopup(${c.id})`,
    }));
    gate.innerHTML = _renderListEmpty({
      iconSvg: '<svg class="pe-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
      title: 'Clients',
      subtitle: 'Add clients to assign them to projects, quotes, and orders.',
      btnLabel: '+ Add Client',
      btnOnclick: '_clientsRevealForm()',
      recentItems: recents,
      itemIconSvg: _TYPE_ICON_CLIENT,
    });
    gate.style.display = '';
    form.style.display = 'none';
  } else {
    gate.innerHTML = '';
    gate.style.display = 'none';
    form.style.display = '';
  }
}
function _clientsRevealForm() {
  _clientsShowForm = true;
  _renderClientsSidebarGate();
  const first = document.getElementById('cl-name');
  if (first) /** @type {HTMLInputElement} */ (first).focus();
}
/** @type {any} */ (window)._clientsRevealForm = _clientsRevealForm;

/** Revert to gate on tab re-entry if the form was opened but never engaged. */
function _clientsMaybeResetFormFlag() {
  if (!_clientsShowForm) return;
  const nameInput = /** @type {HTMLInputElement|null} */ (document.getElementById('cl-name'));
  if (nameInput && nameInput.value.trim()) return;
  _clientsShowForm = false;
}
/** @type {any} */ (window)._clientsMaybeResetFormFlag = _clientsMaybeResetFormFlag;

// ── Render Clients Tab ──
function renderClientsMain() {
  _renderClientsSidebarGate();
  const el = document.getElementById('clients-main');
  if (!el) return;
  const cur = window.currency;

  /** @param {any} c */
  const clientCard = c => {
    const cQuotes = quotes.filter(q => q.client_id === c.id || (!q.client_id && quoteClient(q) === c.name));
    const cOrders = orders.filter(o => o.client_id === c.id || (!o.client_id && orderClient(o) === c.name));
    const cProjects = projects.filter(p => p.client_id === c.id);
    const totalValue = cOrders.reduce((s,o) => s + (o.value ?? 0), 0) + cQuotes.reduce((s,q) => s + quoteTotal(q), 0);
    /** @param {number} v */
    const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

    // F1 (2026-05-13): projects render inline within the Client card.
    // The old 1-cell "Projects" action strip is replaced by a per-project
    // list using the shared _renderProjectInlineCard component.
    const projectsForClient = projects.filter(/** @param {any} p */ p => p.client_id === c.id);
    const projectsBlock = projectsForClient.length
      ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border2)" onclick="event.stopPropagation()">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <span style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px">Projects (${projectsForClient.length})</span>
            <span style="flex:1"></span>
            <button class="btn btn-outline" style="font-size:10px;padding:3px 9px;width:auto" onclick="event.stopPropagation();_setProjectsActiveClient(${c.id});switchSection('projects');_projectsRevealForm()" title="New project">+ New project</button>
          </div>
          ${projectsForClient.map(/** @param {any} p */ p => _renderProjectInlineCard(p, { showClient: false })).join('')}
        </div>`
      : `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border2);display:flex;align-items:center;gap:8px" onclick="event.stopPropagation()">
          <span style="font-size:11px;color:var(--muted)">No projects yet</span>
          <span style="flex:1"></span>
          <button class="btn btn-outline" style="font-size:11px;padding:4px 10px;width:auto" onclick="event.stopPropagation();_setProjectsActiveClient(${c.id});switchSection('projects');_projectsRevealForm()" title="New project">+ New project</button>
        </div>`;

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;cursor:pointer;transition:box-shadow .15s" onclick="_openClientPopup(${c.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${c.name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(c.name)}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">
            ${c.email ? _escHtml(c.email) : ''}${c.email && c.phone ? ' · ' : ''}${c.phone ? _escHtml(c.phone) : ''}
            ${(c.email || c.phone) ? ' · ' : ''}${cProjects.length} project${cProjects.length!==1?'s':''} · ${cOrders.length} order${cOrders.length!==1?'s':''} · ${fmt(totalValue)}
          </div>
        </div>
      </div>
      ${projectsBlock}
      <div style="display:flex;align-items:center;gap:4px;margin-top:10px;padding-top:8px;border-top:1px solid var(--border2)" onclick="event.stopPropagation()">
        <span style="flex:1"></span>
        <button class="btn btn-outline" style="font-size:11px;padding:4px 8px;width:auto" onclick="duplicateClient(${c.id})">Duplicate</button>
        <button class="btn btn-outline" style="color:var(--danger);font-size:11px;padding:4px 8px;width:auto" onclick="_confirm('Delete <strong>${_escHtml(c.name)}</strong>?',()=>removeClient(${c.id}))">Delete</button>
      </div>
    </div>`;
  };

  const search = (window._clientSearch || '').toLowerCase();
  const sortBy = window._clientSort || 'name';
  let filtered = search ? clients.filter(c => c.name.toLowerCase().includes(search)) : [...clients];
  if (sortBy === 'value') filtered.sort((a,b) => {
    const va = orders.filter(o=>o.client_id===a.id||orderClient(o)===a.name).reduce((s,o)=>s+(o.value??0),0) + quotes.filter(q=>q.client_id===a.id||quoteClient(q)===a.name).reduce((s,q)=>s+quoteTotal(q),0);
    const vb = orders.filter(o=>o.client_id===b.id||orderClient(o)===b.name).reduce((s,o)=>s+(o.value??0),0) + quotes.filter(q=>q.client_id===b.id||quoteClient(q)===b.name).reduce((s,q)=>s+quoteTotal(q),0);
    return vb - va;
  });
  else if (sortBy === 'orders') filtered.sort((a,b) => orders.filter(o=>o.client_id===b.id||orderClient(o)===b.name).length - orders.filter(o=>o.client_id===a.id||orderClient(o)===a.name).length);
  else filtered.sort((a,b) => a.name.localeCompare(b.name));

  el.innerHTML = `<div style="padding:24px;max-width:900px">
    ${_renderContentHeader({ iconSvg: _CH_ICON_CLIENT, title: 'Clients' })}
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:16px;flex-wrap:wrap">
      <input type="text" placeholder="Search clients..." value="${_escHtml(window._clientSearch||'')}" oninput="window._clientSearch=this.value;renderClientsMain()" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;font-family:inherit">
      <span style="flex:1"></span>
      <button class="btn btn-outline" onclick="exportClientsCSV()" style="font-size:10px;padding:4px 8px;width:auto">Export</button>
      <button class="btn btn-outline" onclick="importClientsCSV()" style="font-size:10px;padding:4px 8px;width:auto">Import</button>
    </div>
    ${clients.length > 1 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer" onchange="window._clientSort=this.value;renderClientsMain()">
        <option value="name" ${sortBy==='name'?'selected':''}>Sort by name</option>
        <option value="value" ${sortBy==='value'?'selected':''}>Sort by value</option>
        <option value="orders" ${sortBy==='orders'?'selected':''}>Sort by orders</option>
      </select>
    </div>` : ''}
    ${filtered.length ? filtered.map(clientCard).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:var(--radius)">${search ? 'No clients match your search.' : 'No clients yet. Add one using the form on the left.'}</div>`}
  </div>`;
}

/** @param {number} id */
function _highlightProject(id) {
  setTimeout(() => {
    const el = document.getElementById('project-card-'+id);
    if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.outline='2px solid var(--accent)'; setTimeout(()=>el.style.outline='',2000); }
  }, 100);
}

// ── Shared project-card render (used by Projects tab AND inline in Client cards) ──
// F1 (2026-05-13): Projects no longer have their own nav tab — they render inline
// inside each Client card. Lifting projectCard to module scope so renderClientsMain
// can reuse the same component without duplicating the action-strip logic.

const _PROJ_ICON_CABINET = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`;
const _PROJ_ICON_CUTLIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.00 1.70 L12.90 3.45 L15.94 2.48 L16.10 4.44 L19.28 4.72 L18.68 6.59 L21.52 8.06 L20.25 9.56 L22.30 12.00 L20.55 12.90 L21.52 15.94 L19.56 16.10 L19.28 19.28 L17.41 18.68 L15.94 21.52 L14.44 20.25 L12.00 22.30 L11.10 20.55 L8.06 21.52 L7.90 19.56 L4.72 19.28 L5.32 17.41 L2.48 15.94 L3.75 14.44 L1.70 12.00 L3.45 11.10 L2.48 8.06 L4.44 7.90 L4.72 4.72 L6.59 5.32 L8.06 2.48 L9.56 3.75 Z"/><circle cx="12" cy="12" r="1.5"/></svg>`;
const _PROJ_ICON_QUOTE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;
const _PROJ_ICON_ORDER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>`;

/** Compact-money formatter for chip-sized labels: $42.8k, $1.2M, $850.
 * @param {number} v */
function _projFmtShort(v) {
  if (!v) return '';
  const cur = /** @type {any} */ (window).currency || '$';
  if (v >= 1_000_000) return cur + (v/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (v >= 1_000) return cur + (v/1_000).toFixed(1).replace(/\.0$/,'') + 'k';
  return cur + Math.round(v).toLocaleString('en-US');
}

/**
 * Render a single project as a card.
 * @param {any} p Project row
 * @param {{showClient?: boolean}} [opts] showClient defaults to true; pass false when rendering inside a Client card
 */
function _renderProjectInlineCard(p, opts) {
  const showClient = opts?.showClient !== false;
  const client = (showClient && p.client_id) ? clients.find(/** @param {any} c */ c => c.id === p.client_id) : null;
  // Per-project counts no longer derivable post-F5 (quotes/orders are keyed by
  // client, not project). The Projects panel is hidden by F1 and goes away in
  // F6 — these zeros keep the (invisible) cards rendering cleanly until then.
  /** @type {any[]} */ const pQuotes = [];
  /** @type {any[]} */ const pOrders = [];
  const orderValue = 0;
  const quoteValue = 0;
  const totalShown = 0;
  const cabinetCount = 0;
  const cutListCount = 0;

  const statusBadgeCls = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';
  const statusText = p.status==='complete'?'Complete':p.status==='on-hold'?'On Hold':'Active';
  const nameSafe = _escHtml(p.name);
  const nameJs = _escHtml(p.name).replace(/'/g, "\\'");

  /**
   * Render one of the 4 strip actions.
   * @param {string} label
   * @param {string} icon
   * @param {number|null} count
   * @param {string} moneyLabel
   * @param {string} drillCall
   * @param {string} createCall
   */
  const act = (label, icon, count, moneyLabel, drillCall, createCall) => {
    const isEmpty = count === 0;
    const showCount = count !== null;
    const drill = (showCount && !isEmpty) ? `event.stopPropagation();${drillCall}` : `event.stopPropagation();${createCall}`;
    return `<div class="proj-act${isEmpty?' empty':''}">
      <div class="proj-act-main" onclick="${drill}" title="${isEmpty?'Create first '+label.toLowerCase():'View '+label.toLowerCase()}">
        ${icon}
        <span class="proj-act-label">${label}</span>
        ${showCount ? `<span class="proj-act-count">${count}</span>` : ''}
        ${moneyLabel ? `<span class="proj-act-money">${moneyLabel}</span>` : ''}
      </div>
      <div class="proj-act-add" onclick="event.stopPropagation();${createCall}" title="New ${label.toLowerCase()}">+</div>
    </div>`;
  };

  return `<div class="proj-card" id="project-card-${p.id}" onclick="event.stopPropagation();_openProjectPopup(${p.id})">
    <div class="proj-card-top">
      <span class="proj-name" onclick="event.stopPropagation();_openProjectPopup(${p.id})">${nameSafe}</span>
      ${client ? `<span class="proj-client">${_escHtml(client.name)}</span>` : ''}
      <span class="badge ${statusBadgeCls}" style="font-size:9px;padding:1px 6px">${statusText}</span>
      ${p.description ? `<span class="proj-desc">${_escHtml(p.description)}</span>` : ''}
      ${totalShown ? `<span class="proj-total">${_projFmtShort(totalShown)}</span>` : ''}
    </div>
    <div class="proj-strip">
      ${act('Cabinets', _PROJ_ICON_CABINET, cabinetCount, '', `_newCabinetForProject(${p.id})`, `_newCabinetForProject(${p.id})`)}
      ${act('Cut Lists', _PROJ_ICON_CUTLIST, cutListCount, '', `_newCutListForProject(${p.id})`, `_newCutListForProject(${p.id})`)}
      ${act('Quotes', _PROJ_ICON_QUOTE, pQuotes.length, pQuotes.length ? _projFmtShort(quoteValue) : '', `_drillQuotesForProject(${p.id})`, `_newQuoteForProject(${p.id})`)}
      ${act('Orders', _PROJ_ICON_ORDER, pOrders.length, pOrders.length ? _projFmtShort(orderValue) : '', `_drillOrdersForProject(${p.id})`, `_newOrderForProject(${p.id})`)}
    </div>
    <div style="display:flex;align-items:center;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)" onclick="event.stopPropagation()">
      <span style="flex:1"></span>
      <button class="btn btn-outline" style="color:var(--danger);font-size:11px;padding:4px 8px;width:auto" onclick="event.stopPropagation();_confirm('Delete project <strong>${nameJs}</strong>? This will also delete its cabinets, cut lists, quotes, and orders.',()=>removeProject(${p.id}))">Delete</button>
    </div>
  </div>`;
}

// ── Render Projects Tab ──
function renderProjectsMain() {
  _renderProjectsSidebarGate();
  const el = document.getElementById('projects-main');
  if (!el) return;
  const cur = window.currency;

  /** @param {string} s */
  const statusBadge = s => {
    if (s === 'complete') return '<span class="badge badge-green">Complete</span>';
    if (s === 'on-hold') return '<span class="badge badge-gray">On Hold</span>';
    return '<span class="badge badge-blue">Active</span>';
  };

  /**
   * Compact-money formatter for chip-sized labels: $42.8k, $1.2M, $850.
   * @param {number} v
   */
  const fmtShort = v => {
    if (!v) return '';
    if (v >= 1_000_000) return cur + (v/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M';
    if (v >= 1_000) return cur + (v/1_000).toFixed(1).replace(/\.0$/,'') + 'k';
    return cur + Math.round(v).toLocaleString('en-US');
  };

  // F1 (2026-05-13): projectCard lifted to module-level _renderProjectInlineCard
  // so renderClientsMain can reuse it without duplicating the action-strip logic.
  // The arrow wrapper drops the extra `index` arg that Array.map passes.
  /** @param {any} p */
  const projectCard = (p) => _renderProjectInlineCard(p);

  const hasClient = !!_projectsActiveClientId;
  const filter = window._projFilter || 'all';
  const search = (window._projSearch || '').toLowerCase();
  const sortBy = window._projSort || 'newest';
  const activeClientName = hasClient ? (_clientName(_projectsActiveClientId) || '') : '';
  const scopedProjects = hasClient ? projects.filter(p => p.client_id === _projectsActiveClientId) : [...projects];
  let filtered = [...scopedProjects];
  if (filter !== 'all') filtered = filtered.filter(p => p.status === filter);
  if (search) filtered = filtered.filter(p => hasClient
    ? p.name.toLowerCase().includes(search)
    : (p.name.toLowerCase().includes(search) || (_clientName(p.client_id)||'').toLowerCase().includes(search)));
  if (sortBy === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name));
  else if (!hasClient && sortBy === 'client') filtered.sort((a,b) => (_clientName(a.client_id)||'').localeCompare(_clientName(b.client_id)||''));
  // 'value' sort dropped post-F5 — per-project order totals are not derivable
  // without project_id on orders. Selector still allows the option but it's a
  // no-op until F6 deletes this whole renderer.

  const activeCount = scopedProjects.filter(p => p.status === 'active').length;
  const holdCount = scopedProjects.filter(p => p.status === 'on-hold').length;
  const doneCount = scopedProjects.filter(p => p.status === 'complete').length;

  const headerOpts = hasClient
    ? { iconSvg: _CH_ICON_PROJECT, title: 'Projects', clientName: activeClientName }
    : { iconSvg: _CH_ICON_PROJECT, title: 'Projects' };
  const emptyMsg = (search || filter !== 'all')
    ? 'No projects match this filter.'
    : (hasClient
      ? `No projects yet for ${_escHtml(activeClientName)}. Use + New Project on the left to add one.`
      : 'No projects yet. Create one using the form on the left.');

  el.innerHTML = `<div style="padding:24px;max-width:900px">
    ${_renderContentHeader(headerOpts)}
    <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
      <input type="text" placeholder="Search projects..." value="${_escHtml(window._projSearch||'')}" oninput="window._projSearch=this.value;renderProjectsMain()" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;font-family:inherit">
      <span style="flex:1"></span>
      <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer" onchange="window._projSort=this.value;renderProjectsMain()">
        <option value="newest" ${sortBy==='newest'?'selected':''}>Newest first</option>
        <option value="name" ${sortBy==='name'?'selected':''}>Name</option>
        ${hasClient ? '' : `<option value="client" ${sortBy==='client'?'selected':''}>Client</option>`}
        <option value="value" ${sortBy==='value'?'selected':''}>Value</option>
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <button class="ofilter-tab ${filter==='all'?'active':''}" onclick="window._projFilter='all';renderProjectsMain()">All (${scopedProjects.length})</button>
      <button class="ofilter-tab ${filter==='active'?'active':''}" onclick="window._projFilter='active';renderProjectsMain()">Active (${activeCount})</button>
      <button class="ofilter-tab ${filter==='on-hold'?'active':''}" onclick="window._projFilter='on-hold';renderProjectsMain()">On Hold (${holdCount})</button>
      <button class="ofilter-tab ${filter==='complete'?'active':''}" onclick="window._projFilter='complete';renderProjectsMain()">Complete (${doneCount})</button>
    </div>
    ${filtered.length ? filtered.map(projectCard).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:var(--radius)">${emptyMsg}</div>`}
  </div>`;
}

// ── Project → Tab bridges (U.9) ──
// Each helper switches to a producing tab with the project preselected. For
// quotes/orders, "drill" filters the existing tab by project name; for
// cabinet/cut-list, "create" pre-fills the project smart-input so the user
// starts working in context.

/** @param {string} inputId @param {string} value */
function _prefillSmartInput(inputId, value) {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById(inputId));
  if (!inp) return;
  inp.value = value;
  // Hide the matching suggest dropdown so the prefill doesn't open it.
  const suggest = document.getElementById(inputId + '-suggest');
  if (suggest) suggest.style.display = 'none';
}

/** @param {number} projectId */
function _drillQuotesForProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  switchSection('quote');
  // Post-F5: drill to the project's CLIENT instead — projects no longer
  // scope quotes. Goes away with the project card itself in F6.
  if (p.client_id && typeof _qPickClient === 'function') _qPickClient(p.client_id);
}

/** @param {number} projectId */
function _drillOrdersForProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  switchSection('orders');
  if (p.client_id && typeof _oPickClient === 'function') _oPickClient(p.client_id);
}

/** @param {number} projectId */
function _newCabinetForProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  switchSection('cabinet');
  // Post-F5: cabinet builder is client-keyed. Pick the project's client.
  if (p.client_id && typeof _cbPickClient === 'function') _cbPickClient(p.client_id);
  _toast(`Cabinet builder opened for "${p.name}"'s client`, 'success');
}

/** @param {number} projectId */
function _newCutListForProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  const proceed = () => {
    _doClearAll();
    switchSection('cutlist');
    // Post-F5: no per-project cutlist load — cutlists are accessed via the
    // Cut List Library tab and edited in place. The project-link form below
    // is the last legacy affordance and will be removed in F6.
    _prefillSmartInput('cl-project', p.name);
    _clCurrentProjectId = p.id;
    _clCurrentProjectName = p.name;
    if (typeof _setClDirty === 'function') _setClDirty(false);
    _toast(`Project "${p.name}" loaded — add pieces and sheets`, 'success');
  };
  if (typeof _clConfirmDiscardIfDirty === 'function') {
    _clConfirmDiscardIfDirty(`open cut list for "${p.name}"`, proceed);
  } else {
    proceed();
  }
}

/** @param {number} projectId */
function _newQuoteForProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  switchSection('quote');
  _prefillSmartInput('q-project', p.name);
  if (p.client_id) {
    const client = clients.find(c => c.id === p.client_id);
    if (client) _prefillSmartInput('q-client', client.name);
  }
  setTimeout(() => { /** @type {HTMLTextAreaElement|null} */ (document.getElementById('q-notes'))?.focus(); }, 50);
  _toast(`Project & client filled — complete the quote and click Create`, 'success');
}

/** @param {number} projectId */
function _newOrderForProject(projectId) {
  const p = projects.find(x => x.id === projectId);
  if (!p) return;
  switchSection('orders');
  _prefillSmartInput('o-project', p.name);
  if (p.client_id) {
    const client = clients.find(c => c.id === p.client_id);
    if (client) _prefillSmartInput('o-client', client.name);
  }
  _toast(`Project & client filled — complete the order and click Add`, 'success');
}

// Default library panels to open
// (Old library init removed)
// Dashboard is the default landing tab
try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e) {}

// ── Clients CSV import / export ──
function exportClientsCSV() {
  const allClients = [...new Set([...quotes.map(q=>quoteClient(q)), ...orders.map(o=>orderClient(o))].filter(Boolean))].sort();
  if (!allClients.length) { _toast('No clients to export', 'error'); return; }
  /** @type {any[][]} */
  const rows = [['Client Name','Quotes','Orders','Total Value']];
  allClients.forEach(c => {
    const qCount = quotes.filter(q=>quoteClient(q)===c).length;
    const oCount = orders.filter(o=>orderClient(o)===c).length;
    const totalVal = quotes.filter(q=>quoteClient(q)===c).reduce((s,q)=>s+quoteTotal(q),0) + orders.filter(o=>orderClient(o)===c).reduce((s,o)=>s+(o.value??0),0);
    rows.push([c, qCount, oCount, totalVal.toFixed(2)]);
  });
  const csv = rows.map(r => r.map(/** @param {any} v */ v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `clients-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Clients exported', 'success');
}
function importClientsCSV() {
  _toast('Clients are created automatically from quotes and orders', 'info');
}
