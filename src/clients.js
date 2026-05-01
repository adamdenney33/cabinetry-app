// @ts-nocheck
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
async function _dbInsertSafe(table, row) {
  let { data, error } = await _db(table).insert(row).select().single();
  while (error && error.message) {
    const m = error.message.match(/Could not find the '(\w+)' column/);
    if (!m) break;
    delete row[m[1]];
    ({ data, error } = await _db(table).insert(row).select().single());
  }
  return { data, error };
}

// ── Resolve-or-create helpers ──
async function resolveClient(name) {
  if (!name) return null;
  const existing = clients.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const row = { user_id: _userId, name };
  const { data, error } = await _db('clients').insert(row).select().single();
  if (error || !data) return null;
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  return data.id;
}

async function resolveProject(name, clientId) {
  if (!name) return null;
  const existing = projects.find(p => p.name.toLowerCase() === name.toLowerCase() && (p.client_id === clientId || !clientId));
  if (existing) return existing.id;
  const row = { user_id: _userId, name, status: 'active' };
  if (clientId) row.client_id = clientId;
  const { data, error } = await _dbInsertSafe('projects', row);
  if (error || !data) return null;
  projects.unshift(data);
  return data.id;
}

// ── Client CRUD ──
async function createClient() {
  const name = document.getElementById('cl-name').value.trim();
  if (!name) { _toast('Enter a client name.', 'error'); return; }
  if (!_requireAuth()) return;
  const row = {
    user_id: _userId, name,
    email: document.getElementById('cl-email').value.trim() || null,
    phone: document.getElementById('cl-phone').value.trim() || null,
    address: document.getElementById('cl-address').value.trim() || null,
    notes: document.getElementById('cl-notes').value.trim() || null,
  };
  const { data, error } = await _dbInsertSafe('clients', row);
  if (error) { _toast('Could not save client — ' + (error.message || JSON.stringify(error)), 'error'); return; }
  clients.push(data);
  clients.sort((a,b) => a.name.localeCompare(b.name));
  _toast('Client added', 'success');
  document.getElementById('cl-name').value = '';
  document.getElementById('cl-email').value = '';
  document.getElementById('cl-phone').value = '';
  document.getElementById('cl-address').value = '';
  document.getElementById('cl-notes').value = '';
  renderClientsMain();
}

async function updateClient(id, field, value) {
  const c = clients.find(c => c.id === id);
  if (!c) return;
  c[field] = value;
  await _db('clients').update({ [field]: value }).eq('id', id);
}

async function removeClient(id) {
  if (!_requireAuth()) return;
  await _db('clients').delete().eq('id', id);
  clients = clients.filter(c => c.id !== id);
  renderClientsMain();
  _toast('Client removed', 'success');
}

// ── Project CRUD ──
async function createProject() {
  const name = document.getElementById('pj-name').value.trim();
  if (!name) { _toast('Enter a project name.', 'error'); return; }
  if (!_requireAuth()) return;
  const clientName = document.getElementById('pj-client').value.trim();
  const clientId = clientName ? await resolveClient(clientName) : null;
  const row = {
    user_id: _userId, name,
    description: document.getElementById('pj-desc').value.trim() || null,
    status: document.getElementById('pj-status').value,
  };
  if (clientId) row.client_id = clientId;
  let { data, error } = await _dbInsertSafe('projects', row);
  if (error) { _toast('Could not save project — ' + (error.message || JSON.stringify(error)), 'error'); return; }
  data.status = data.status || 'active';
  projects.unshift(data);
  _toast('Project created', 'success');
  document.getElementById('pj-name').value = '';
  document.getElementById('pj-client').value = '';
  document.getElementById('pj-desc').value = '';
  document.getElementById('pj-status').value = 'active';
  renderProjectsMain();
  // Scroll to the newly created project
  setTimeout(() => _highlightProject(data.id), 100);
}

async function updateProject(id, field, value) {
  const p = projects.find(p => p.id === id);
  if (!p) return;
  p[field] = value;
  await _db('projects').update({ [field]: value }).eq('id', id);
}

async function removeProject(id) {
  if (!_requireAuth()) return;
  await _db('projects').delete().eq('id', id);
  projects = projects.filter(p => p.id !== id);
  renderProjectsMain();
  _toast('Project removed', 'success');
}

// ── Client name helper ──
function _clientName(id) {
  const c = clients.find(c => c.id === id);
  return c ? c.name : '';
}
function _projectName(id) {
  const p = projects.find(p => p.id === id);
  return p ? p.name : '';
}

// ── Client suggest for Projects sidebar ──
function _pjClientSuggest(input) {
  const val = input.value.toLowerCase().trim();
  const list = document.getElementById('pj-client-suggest');
  if (!list) return;
  _posSuggest(input, list);
  const matches = val ? clients.filter(c => c.name.toLowerCase().includes(val)).slice(0, 8) : clients.slice(0, 8);
  if (!matches.length && !val) { list.style.display = 'none'; return; }
  list.innerHTML = matches.map(c => `<div class="client-suggest-item" onmousedown="document.getElementById('pj-client').value='${_escHtml(c.name)}';document.getElementById('pj-client-suggest').style.display='none'">
    <span class="suggest-icon">${c.name.charAt(0).toUpperCase()}</span>
    <span>${_escHtml(c.name)}</span>
  </div>`).join('') + `<div class="client-suggest-add" onmousedown="_openNewClientPopup('pj-client')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new client</div>`;
  list.style.display = 'block';
  input.onblur = () => setTimeout(() => list.style.display = 'none', 150);
}

// ── Render Clients Tab ──
function renderClientsMain() {
  const el = document.getElementById('clients-main');
  if (!el) return;
  const cur = window.currency;

  const clientCard = c => {
    const cQuotes = quotes.filter(q => q.client_id === c.id || (!q.client_id && quoteClient(q) === c.name));
    const cOrders = orders.filter(o => o.client_id === c.id || (!o.client_id && orderClient(o) === c.name));
    const cProjects = projects.filter(p => p.client_id === c.id);
    const totalValue = cOrders.reduce((s,o) => s + o.value, 0) + cQuotes.reduce((s,q) => s + quoteTotal(q), 0);
    const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:6px;cursor:pointer;transition:box-shadow .15s" onclick="_openClientPopup(${c.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
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
      ${cProjects.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:6px">${cProjects.map(p => `<span class="badge ${p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue'}" style="font-size:9px;padding:1px 6px">${_escHtml(p.name)}</span>`).join('')}</div>` : ''}
    </div>`;
  };

  const search = (window._clientSearch || '').toLowerCase();
  const sortBy = window._clientSort || 'name';
  let filtered = search ? clients.filter(c => c.name.toLowerCase().includes(search)) : [...clients];
  if (sortBy === 'value') filtered.sort((a,b) => {
    const va = orders.filter(o=>o.client_id===a.id||orderClient(o)===a.name).reduce((s,o)=>s+o.value,0) + quotes.filter(q=>q.client_id===a.id||quoteClient(q)===a.name).reduce((s,q)=>s+quoteTotal(q),0);
    const vb = orders.filter(o=>o.client_id===b.id||orderClient(o)===b.name).reduce((s,o)=>s+o.value,0) + quotes.filter(q=>q.client_id===b.id||quoteClient(q)===b.name).reduce((s,q)=>s+quoteTotal(q),0);
    return vb - va;
  });
  else if (sortBy === 'orders') filtered.sort((a,b) => orders.filter(o=>o.client_id===b.id||orderClient(o)===b.name).length - orders.filter(o=>o.client_id===a.id||orderClient(o)===a.name).length);
  else filtered.sort((a,b) => a.name.localeCompare(b.name));

  const totalClientValue = clients.reduce((s,c) => s + orders.filter(o=>o.client_id===c.id||orderClient(o)===c.name).reduce((t,o)=>t+o.value,0), 0);
  const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

  el.innerHTML = `<div style="padding:24px;max-width:900px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-size:18px;font-weight:800;color:var(--text);flex:1">Clients <span style="font-size:13px;font-weight:400;color:var(--muted)">(${clients.length})</span></div>
      <input type="text" placeholder="Search clients..." value="${_escHtml(window._clientSearch||'')}" oninput="window._clientSearch=this.value;renderClientsMain()" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;font-family:inherit">
      <button class="btn" onclick="exportClientsCSV()" style="font-size:11px;padding:5px 10px">Export</button>
      <button class="btn" onclick="importClientsCSV()" style="font-size:11px;padding:5px 10px">Import</button>
    </div>
    ${clients.length > 1 ? `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer" onchange="window._clientSort=this.value;renderClientsMain()">
        <option value="name" ${sortBy==='name'?'selected':''}>Sort by name</option>
        <option value="value" ${sortBy==='value'?'selected':''}>Sort by value</option>
        <option value="orders" ${sortBy==='orders'?'selected':''}>Sort by orders</option>
      </select>
      <span style="font-size:11px;color:var(--muted);margin-left:auto">Total order value: <strong style="color:var(--text)">${fmt(totalClientValue)}</strong></span>
    </div>` : ''}
    ${filtered.length ? filtered.map(clientCard).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:var(--radius)">${search ? 'No clients match your search.' : 'No clients yet. Add one using the form on the left.'}</div>`}
  </div>`;
}

function _highlightProject(id) {
  setTimeout(() => {
    const el = document.getElementById('project-card-'+id);
    if (el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.outline='2px solid var(--accent)'; setTimeout(()=>el.style.outline='',2000); }
  }, 100);
}

// ── Render Projects Tab ──
function renderProjectsMain() {
  const el = document.getElementById('projects-main');
  if (!el) return;
  const cur = window.currency;

  const statusBadge = s => {
    if (s === 'complete') return '<span class="badge badge-green">Complete</span>';
    if (s === 'on-hold') return '<span class="badge badge-gray">On Hold</span>';
    return '<span class="badge badge-blue">Active</span>';
  };

  const projectCard = p => {
    const client = p.client_id ? clients.find(c => c.id === p.client_id) : null;
    const pQuotes = quotes.filter(q => q.project_id === p.id || (!q.project_id && quoteProject(q) === p.name));
    const pOrders = orders.filter(o => o.project_id === p.id || (!o.project_id && orderProject(o) === p.name));
    const totalValue = pOrders.reduce((s,o) => s + o.value, 0);
    const quoteValue = pQuotes.reduce((s,q) => s + quoteTotal(q), 0);
    const fmt = v => cur + v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
    const created = p.created_at ? new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '';

    const statusBadge = p.status==='complete'?'badge-green':p.status==='on-hold'?'badge-gray':'badge-blue';
    const statusText = p.status==='complete'?'Complete':p.status==='on-hold'?'On Hold':'Active';
    return `<div id="project-card-${p.id}" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;margin-bottom:6px;cursor:pointer;transition:box-shadow .15s" onclick="_openProjectPopup(${p.id})" onmouseover="this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.boxShadow=''">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <div style="font-size:14px;font-weight:700;color:var(--text)">${_escHtml(p.name)}</div>
        <span class="badge ${statusBadge}" style="font-size:9px;padding:1px 6px">${statusText}</span>
      </div>
      <div style="font-size:10px;color:var(--muted)">
        ${client ? _escHtml(client.name) + ' · ' : ''}${created} · ${pQuotes.length} quote${pQuotes.length!==1?'s':''} (${fmt(quoteValue)}) · ${pOrders.length} order${pOrders.length!==1?'s':''} (${fmt(totalValue)})
      </div>
      ${p.description ? `<div style="font-size:11px;color:var(--text2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(p.description)}</div>` : ''}
    </div>`;
  };

  const filter = window._projFilter || 'all';
  const search = (window._projSearch || '').toLowerCase();
  const sortBy = window._projSort || 'newest';
  let filtered = [...projects];
  if (filter !== 'all') filtered = filtered.filter(p => p.status === filter);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search) || (_clientName(p.client_id)||'').toLowerCase().includes(search));
  if (sortBy === 'name') filtered.sort((a,b) => a.name.localeCompare(b.name));
  else if (sortBy === 'client') filtered.sort((a,b) => (_clientName(a.client_id)||'').localeCompare(_clientName(b.client_id)||''));
  else if (sortBy === 'value') filtered.sort((a,b) => {
    const va = orders.filter(o=>o.project_id===a.id||orderProject(o)===a.name).reduce((s,o)=>s+o.value,0);
    const vb = orders.filter(o=>o.project_id===b.id||orderProject(o)===b.name).reduce((s,o)=>s+o.value,0);
    return vb - va;
  });

  const activeCount = projects.filter(p => p.status === 'active').length;
  const holdCount = projects.filter(p => p.status === 'on-hold').length;
  const doneCount = projects.filter(p => p.status === 'complete').length;

  el.innerHTML = `<div style="padding:24px;max-width:900px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div style="font-size:18px;font-weight:800;color:var(--text);flex:1">Projects <span style="font-size:13px;font-weight:400;color:var(--muted)">(${projects.length})</span></div>
      <input type="text" placeholder="Search projects..." value="${_escHtml(window._projSearch||'')}" oninput="window._projSearch=this.value;renderProjectsMain()" style="font-size:12px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);width:200px;font-family:inherit">
    </div>
    <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <button class="ofilter-tab ${filter==='all'?'active':''}" onclick="window._projFilter='all';renderProjectsMain()">All (${projects.length})</button>
      <button class="ofilter-tab ${filter==='active'?'active':''}" onclick="window._projFilter='active';renderProjectsMain()">Active (${activeCount})</button>
      <button class="ofilter-tab ${filter==='on-hold'?'active':''}" onclick="window._projFilter='on-hold';renderProjectsMain()">On Hold (${holdCount})</button>
      <button class="ofilter-tab ${filter==='complete'?'active':''}" onclick="window._projFilter='complete';renderProjectsMain()">Complete (${doneCount})</button>
      <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer;margin-left:auto" onchange="window._projSort=this.value;renderProjectsMain()">
        <option value="newest" ${sortBy==='newest'?'selected':''}>Newest first</option>
        <option value="name" ${sortBy==='name'?'selected':''}>Name</option>
        <option value="client" ${sortBy==='client'?'selected':''}>Client</option>
        <option value="value" ${sortBy==='value'?'selected':''}>Value</option>
      </select>
    </div>
    ${filtered.length ? filtered.map(projectCard).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:40px 20px;border:1px dashed var(--border);border-radius:var(--radius)">${(search || filter !== 'all') ? 'No projects match this filter.' : 'No projects yet. Create one using the form on the left.'}</div>`}
  </div>`;
}

// Default library panels to open
// (Old library init removed)
// Dashboard is the default landing tab
try { renderDashboard(); setTimeout(drawRevenueChart, 0); } catch(e) {}

// ── Clients CSV import / export ──
function exportClientsCSV() {
  const allClients = [...new Set([...quotes.map(q=>quoteClient(q)), ...orders.map(o=>orderClient(o))].filter(Boolean))].sort();
  if (!allClients.length) { _toast('No clients to export', 'error'); return; }
  const rows = [['Client Name','Quotes','Orders','Total Value']];
  allClients.forEach(c => {
    const qCount = quotes.filter(q=>quoteClient(q)===c).length;
    const oCount = orders.filter(o=>orderClient(o)===c).length;
    const totalVal = quotes.filter(q=>quoteClient(q)===c).reduce((s,q)=>s+quoteTotal(q),0) + orders.filter(o=>orderClient(o)===c).reduce((s,o)=>s+o.value,0);
    rows.push([c, qCount, oCount, totalVal.toFixed(2)]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `clients-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Clients exported', 'success');
}
function importClientsCSV() {
  _toast('Clients are created automatically from quotes and orders', 'info');
}
