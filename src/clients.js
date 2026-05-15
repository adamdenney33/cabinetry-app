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
// F6 (2026-05-13): resolveProject removed alongside the projects entity.

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
  if (typeof /** @type {any} */ (window)._pcSaveOpenClientId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenClientId(id);
  }
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
  if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'clean');
  const sidebar = document.querySelector('#panel-clients .sidebar-scroll');
  if (sidebar) /** @type {HTMLElement} */ (sidebar).scrollTop = 0;
  renderClientsMain();
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
  if (typeof /** @type {any} */ (window)._pcSaveOpenClientId === 'function') {
    /** @type {any} */ (window)._pcSaveOpenClientId(null);
  }
  for (const id of ['cl-name','cl-email','cl-phone','cl-address','cl-notes']) {
    const el = _clInput(id); if (el) el.value = '';
  }
  const sb = document.getElementById('cl-submit-btn');
  const ft = document.getElementById('cl-form-title-text');
  if (sb) { sb.textContent = '+ Add Client'; /** @type {HTMLElement} */ (sb).style.display = ''; }
  if (ft) ft.textContent = 'New Client';
  if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'clean');
  _clientsShowForm = false;
  renderClientsMain();
}

/** @type {ReturnType<typeof setTimeout>|null} */
let _clientsAutosaveTimer = null;

function _clientsScheduleAutosave() {
  if (!(/** @type {any} */ (window)._editingClientId)) return;
  if (_clientsAutosaveTimer) clearTimeout(_clientsAutosaveTimer);
  if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'dirty');
  _clientsAutosaveTimer = setTimeout(_clAutosaveRun, 500);
}
/** @type {any} */ (window)._clientsScheduleAutosave = _clientsScheduleAutosave;

async function _clAutosaveRun() {
  _clientsAutosaveTimer = null;
  const id = /** @type {any} */ (window)._editingClientId;
  if (!id) return;
  const c = /** @type {any} */ (clients.find(x => x.id === id));
  if (!c) return;
  const name = _clInput('cl-name')?.value.trim() || '';
  if (!name) {
    if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'failed', { retry: _clAutosaveRun });
    return;
  }
  /** @type {any} */
  const updates = {
    name,
    email: _clInput('cl-email')?.value.trim() || null,
    phone: _clInput('cl-phone')?.value.trim() || null,
    address: _clInput('cl-address')?.value.trim() || null,
    notes: _clInput('cl-notes')?.value.trim() || null,
  };
  Object.assign(c, updates);
  if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'saving');
  const { error } = await _db('clients').update(/** @type {any} */ (updates)).eq('id', id);
  if (error) {
    if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'failed', { retry: _clAutosaveRun });
    return;
  }
  if (typeof _setSaveStatus === 'function') _setSaveStatus('client', 'saved');
  renderClientsMain();
}

(function _wireClientsAutosave() {
  for (const id of ['cl-name','cl-email','cl-phone','cl-address','cl-notes']) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _clientsScheduleAutosave);
  }
})();

// ── Client name helper ──
/** @param {number | null | undefined} id */
function _clientName(id) {
  if (id == null) return '';
  const c = clients.find(c => c.id === id);
  return c ? c.name : '';
}
// F6 (2026-05-13): _projectName, _pjClientSuggest, updateProject, removeProject removed.

// ── Sidebar gates: simple icon + title + subtitle + button shown when the
//    list is empty and the user hasn't engaged. Once revealed, the drill
//    section replaces the gate (Projects tab) or the inline form replaces
//    the gate (Clients tab).
let _clientsShowForm = false;
// F6 (2026-05-13): _projectsActiveClientId and _pj* autosave state removed
// alongside the projects entity.


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
    const cQuotes = quotes.filter(q => q.client_id === c.id && !_isDraftQuote(q));
    const cOrders = orders.filter(o => o.client_id === c.id);
    const cCutLists = /** @type {any[]} */ ((/** @type {any} */ (window))._cutListsByClient?.[c.id] || []);
    const totalValue = cOrders.reduce((s,o) => s + (o.value ?? 0), 0) + cQuotes.reduce((s,q) => s + quoteTotal(q), 0);
    /** @param {number} v */
    const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

    // F6 (2026-05-13): inline project cards replaced with three flat sections —
    // Quotes / Orders / Cut Lists — rendered directly under the client.
    /** @param {string} label @param {any[]} items @param {(it:any)=>string} rowFn */
    const section = (label, items, rowFn) => items.length
      ? `<div class="cc-section" style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border2)" onclick="event.stopPropagation()">
          <div style="font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px">${label} (${items.length})</div>
          ${items.map(rowFn).join('')}
        </div>`
      : '';

    const quoteRows = section('Quotes', cQuotes, /** @param {any} q */ q => {
      const label = _quoteLabel(q, { client: false });
      const qBadgeCls = q.status === 'approved' ? 'badge-green' : q.status === 'sent' ? 'badge-blue' : 'badge-gray';
      const qLabel = q.status === 'approved' ? 'Approved' : q.status === 'sent' ? 'Sent' : 'Draft';
      const statusPill = `<span class="badge ${qBadgeCls}" style="font-size:9px;padding:1px 6px;margin-left:6px">${qLabel}</span>`;
      const money = quoteTotal(q) ? ` · ${fmt(quoteTotal(q))}` : '';
      return `<div style="font-size:11.5px;padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:0" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'"
        onclick="event.stopPropagation();switchSection('quote');loadQuoteIntoSidebar(${q.id})">
        <span>${_escHtml(label)}${money}</span>${statusPill}
      </div>`;
    });
    const orderRows = section('Orders', cOrders, /** @param {any} o */ o => {
      const label = _orderLabel(o, { client: false });
      const oBadgeCls = (/** @type {Record<string,string>} */ (STATUS_BADGES))[o.status] || 'badge-gray';
      const oLabel = (/** @type {Record<string,string>} */ (STATUS_LABELS))[o.status] || o.status || 'Unknown';
      const statusPill = o.status ? `<span class="badge ${oBadgeCls}" style="font-size:9px;padding:1px 6px;margin-left:6px">${_escHtml(oLabel)}</span>` : '';
      const money = o.value ? ` · ${fmt(o.value)}` : '';
      return `<div style="font-size:11.5px;padding:4px 6px;border-radius:4px;cursor:pointer;display:flex;align-items:center;flex-wrap:wrap;gap:0" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'"
        onclick="event.stopPropagation();switchSection('orders');loadOrderIntoSidebar(${o.id})">
        <span>${_escHtml(label)}${money}</span>${statusPill}
      </div>`;
    });
    const cutListRows = section('Cut Lists', cCutLists, /** @param {any} cl */ cl => {
      return `<div style="font-size:11.5px;padding:4px 6px;border-radius:4px;cursor:pointer" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'"
        onclick="event.stopPropagation();switchSection('cutlist');_clLoadCutlist(${cl.id})">
        ${_escHtml(cl.name || '(untitled)')}
      </div>`;
    });

    const isEditing = c.id === /** @type {any} */ (window)._editingClientId;
    return `<div style="background:var(--surface);border:1px solid ${isEditing ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;cursor:pointer;transition:box-shadow .15s" onclick="_openClientPopup(${c.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:30px;height:30px;border-radius:50%;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">${c.name.charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(c.name)}${isEditing ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· editing</span>' : ''}</div>
          <div style="font-size:10px;color:var(--muted);margin-top:1px">
            ${c.email ? _escHtml(c.email) : ''}${c.email && c.phone ? ' · ' : ''}${c.phone ? _escHtml(c.phone) : ''}
            ${(c.email || c.phone) ? ' · ' : ''}${cQuotes.length} quote${cQuotes.length!==1?'s':''} · ${cOrders.length} order${cOrders.length!==1?'s':''} · ${fmt(totalValue)}
          </div>
        </div>
      </div>
      ${quoteRows}
      ${orderRows}
      ${cutListRows}
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

// ── Cut lists by client cache (F6) ──
// Client cards show a flat list of the client's cutlists. Cutlists aren't
// loaded into memory like quotes/orders, so we fetch a slim id/name/client_id
// projection at boot and group by client_id.
/** @type {any} */ (window)._cutListsByClient = {};
async function _loadCutListsByClient() {
  if (typeof _userId === 'undefined' || !_userId) return;
  try {
    const { data } = await _db('cutlists').select('id, name, client_id, updated_at').order('updated_at', { ascending: false });
    /** @type {Record<number, any[]>} */
    const map = {};
    for (const r of (data || [])) {
      const cid = /** @type {any} */ (r).client_id;
      if (cid == null) continue;
      (map[cid] = map[cid] || []).push(r);
    }
    /** @type {any} */ (window)._cutListsByClient = map;
    try { renderClientsMain(); } catch (e) {}
  } catch (e) {
    console.warn('[cutlists by client] load:', /** @type {any} */ (e).message || e);
  }
}
/** @type {any} */ (window)._loadCutListsByClient = _loadCutListsByClient;

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
