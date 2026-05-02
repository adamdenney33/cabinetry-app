// ProCabinet — Quotes state + view (carved out of src/app.js in phase E carve 4)
//
// Loaded as a classic <script defer> BEFORE src/app.js (state declarations
// here — `quotes`, `quoteNextId` — are referenced from app.js at load
// time inside function bodies, but the bindings need to exist when those
// functions are eventually called).
//
// Cross-file dependencies referenced from this file's functions: clients,
// projects, orders, _db, _dbInsertSafe, _userId, _requireAuth, _toast,
// _escHtml, _onSet, _oqSet, resolveClient, resolveProject, _openQuotePopup,
// _writeManualTotalsLine, _quoteLineRowToCQ, calcCQLine, markQuoteSent,
// duplicateQuote, printQuote, exportQuotesCSV, importQuotesCSV,
// renderOrdersMain, switchSection — all globals defined in app.js,
// src/orders.js, or src/db.js.

// ══════════════════════════════════════════
// QUOTES
// ══════════════════════════════════════════
// In-memory shadow fields beyond the DB schema: `_totals` (materials/labour
// derived from quote_lines aggregation, cached on load), plus a few legacy
// pre-Phase-7 fields retained for fallback rendering.
/** @type {(import('./database.types').Tables<'quotes'> & {
 *    _totals?: {materials: number, labour: number},
 *    client?: string, project?: string,
 *    materials?: number, labour?: number
 * })[]} */
let quotes = [];
let quoteNextId = 1;

// FK-resolving display helpers. After Phase 7 the legacy text columns are gone,
// so an unresolved FK simply returns ''.
/** @param {any} q */
function quoteClient(q) {
  if (!q || !q.client_id) return '';
  const c = clients.find(x => x.id === q.client_id);
  return c ? c.name : '';
}
/** @param {any} q */
function quoteProject(q) {
  if (!q || !q.project_id) return '';
  const p = projects.find(x => x.id === q.project_id);
  return p ? p.name : '';
}
/** @param {any} o */
function orderClient(o) {
  if (!o || !o.client_id) return '';
  const c = clients.find(x => x.id === o.client_id);
  return c ? c.name : '';
}
/** @param {any} o */
function orderProject(o) {
  if (!o || !o.project_id) return '';
  const p = projects.find(x => x.id === o.project_id);
  return p ? p.name : '';
}

// Aggregate materials/labour for a quote from its `quote_lines` rows.
// Returns null if no lines exist; callers should treat null as zero totals.
/** @param {number} quoteId */
async function quoteTotalsFromLines(quoteId) {
  if (!quoteId) return null;
  const { data: lines, error } = await _db('quote_lines').select('*').eq('quote_id', quoteId);
  if (error || !lines || lines.length === 0) return null;
  let materials = 0, labour = 0;
  for (const row of lines) {
    const cq = _quoteLineRowToCQ(row);
    const c = calcCQLine(cq);
    const qty = cq.qty || 1;
    materials += (c.matCost + c.hwCost) * qty;
    labour += c.labourCost * qty;
  }
  return { materials, labour };
}

async function _hydrateQuoteTotals() {
  for (const q of quotes) {
    if (q._totals) continue;
    try {
      const t = await quoteTotalsFromLines(q.id);
      if (t) q._totals = t;
    } catch (e) {
      console.warn('[quote totals] hydrate failed for', q.id, e.message || e);
    }
  }
}

/** @param {number} quoteId */
async function _refreshQuoteTotals(quoteId) {
  const q = quotes.find(x => x.id === quoteId);
  if (!q) return;
  delete q._totals;
  const t = await quoteTotalsFromLines(quoteId);
  if (t) q._totals = t;
}

/** @param {any} q */
function quoteTotal(q) {
  const mat = q._totals ? q._totals.materials : (q.materials || 0);
  const lab = q._totals ? q._totals.labour    : (q.labour    || 0);
  const sub = mat + lab;
  const marked = sub * (1 + (q.markup || 0) / 100);
  return marked * (1 + (q.tax || 0) / 100);
}

// orders.value is the customer-paid snapshot at conversion time (post-markup,
// post-tax). order_lines exist for itemisation but do not drive the dashboard
// total — see SPEC.md § 13 (2026-04-29) for why we kept the column.
/** @param {any} o */
function orderTotal(o) {
  return o ? (o.value || 0) : 0;
}

async function createQuote() {
  /** @param {string} id */
  const inp = id => /** @type {HTMLInputElement} */ (_byId(id));
  const client = inp('q-client').value.trim();
  const project = inp('q-project').value.trim();
  if (!client || !project) { _toast('Enter client name and project.', 'error'); return; }
  if (!_requireAuth()) return;
  const hours = parseFloat(inp('q-hours').value) || 0;
  const materials = parseFloat(inp('q-materials').value) || 0;
  const clientId = await resolveClient(client);
  const projectId = await resolveProject(project, clientId);
  /** @type {any} */
  const row = {
    user_id: _userId,
    markup: parseFloat(inp('q-markup').value) || 20,
    tax: parseFloat(inp('q-tax').value) || 13,
    status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
    notes: inp('q-notes').value.trim(),
  };
  if (clientId) row.client_id = clientId;
  if (projectId) row.project_id = projectId;
  const { data, error } = await _dbInsertSafe('quotes', row);
  if (error || !data) { _toast('Could not save quote — ' + (error?.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  quotes.unshift(data);
  // Manual-totals quote: stash entered materials/hours on a quote_lines stub so quoteTotal aggregates correctly
  if (materials > 0 || hours > 0) {
    await _writeManualTotalsLine(data.id, materials, hours);
    await _refreshQuoteTotals(data.id);
  }
  _toast('Quote created', 'success');
  inp('q-client').value = '';
  inp('q-project').value = '';
  inp('q-notes').value = '';
  inp('q-materials').value = '';
  renderQuoteMain();
}

/** @param {number} id */
async function removeQuote(id) {
  if (!_requireAuth()) return;
  await _db('quotes').delete().eq('id', id);
  quotes = quotes.filter(q => q.id !== id);
  renderQuoteMain();
}

/** @param {number} id */
async function convertQuoteToOrder(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const { error: qErr } = await _db('quotes').update({ status: 'approved' }).eq('id', id);
  if (qErr) { _toast('Could not update quote — ' + (qErr.message || JSON.stringify(qErr)), 'error'); console.error(qErr); return; }
  q.status = 'approved';
  /** @type {any} */
  const orderRow = { user_id: _userId, value: Math.round(quoteTotal(q)), status: 'confirmed', due: 'TBD' };
  if (q.client_id) orderRow.client_id = q.client_id;
  if (q.project_id) orderRow.project_id = q.project_id;
  const { data, error: oErr } = await _dbInsertSafe('orders', orderRow);
  if (oErr || !data) { _toast('Could not create order — ' + (oErr?.message || JSON.stringify(oErr)), 'error'); console.error(oErr); return; }
  // Carry quote notes to order notes & store quote reference
  if (q.notes && data) { data.notes = q.notes; _onSet(data.id, q.notes); }
  if (data) { _oqSet(data.id, q.id); }
  // Copy the quote's line items to order_lines so the order has its own snapshot
  if (data) {
    try {
      const { data: qlines } = await _db('quote_lines').select('*').eq('quote_id', q.id);
      if (qlines && qlines.length) {
        const olines = qlines.map(l => {
          // Cast: quote_lines Row has id+quote_id (required); order_lines Insert needs
          // them stripped (delete operator forbids non-optional fields under strict).
          const nl = /** @type {any} */ ({ ...l, order_id: data.id });
          delete nl.id; delete nl.quote_id;
          return nl;
        });
        await _db('order_lines').insert(olines);
      }
    } catch(e) { console.warn('[convertQuoteToOrder] copy lines failed:', e.message || e); }
  }
  orders.unshift(data);
  /** @type {HTMLElement} */ (_byId('orders-badge')).textContent = String(orders.filter(o => o.status !== 'complete').length);
  _toast(`Order created for ${quoteClient(q)} — ${quoteProject(q)}`, 'success');
  renderQuoteMain();
  switchSection('orders');
}

/** @param {number} id */
async function approveQuote(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'approved' }).eq('id', id);
  q.status = 'approved';
  _toast('Quote marked as approved', 'success');
  renderQuoteMain();
}

/** @param {number} id */
async function revertQuoteToDraft(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'draft' }).eq('id', id);
  q.status = 'draft';
  renderQuoteMain();
}

function renderQuoteMain() {
  const cur = window.currency;
  const el = _byId('quote-main');
  if (!el) return;
  /** @param {number} v */
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const totalValue = quotes.reduce((s,q) => s + quoteTotal(q), 0);
  const approved = quotes.filter(q => q.status === 'approved').length;
  const sent = quotes.filter(q => q.status === 'sent').length;
  const draft = quotes.filter(q => q.status === 'draft').length;

  /** @param {string} s */
  const statusBadge = s => {
    if (s === 'approved') return '<span class="badge badge-green">Approved</span>';
    if (s === 'sent') return '<span class="badge badge-blue">Sent</span>';
    return '<span class="badge badge-gray">Draft</span>';
  };

  /** @param {any} q */
  const qCard = q => {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    const sub = matVal + labVal;
    const markupAmt = sub * q.markup / 100;
    const afterMarkup = sub + markupAmt;
    const taxAmt = afterMarkup * q.tax / 100;
    const total = afterMarkup + taxAmt;
    const statusBadge = q.status === 'approved' ? 'badge-green' : q.status === 'sent' ? 'badge-blue' : 'badge-gray';
    const statusText = q.status === 'approved' ? 'Approved' : q.status === 'sent' ? 'Sent' : 'Draft';
    return `
    <div class="quote-card" style="cursor:pointer" onclick="_openQuotePopup(${q.id})">
      <div class="qc-header">
        <div style="flex:1;min-width:0;overflow:hidden">
          <div class="qc-title">${quoteProject(q)}</div>
          <div class="qc-meta">${quoteClient(q)} &nbsp;·&nbsp; ${q.date} &nbsp;·&nbsp; <span class="badge ${statusBadge}" style="font-size:9px;padding:1px 6px">${statusText}</span></div>
        </div>
      </div>
      ${q.notes ? `<div style="border-top:1px solid var(--border2);padding:8px 16px;background:var(--surface)">
        ${q.notes.split(/\r?\n/).filter(Boolean).slice(0,3).map(/** @param {string} line */ line => {
          if (line.includes('\u2014') || line.includes('—')) {
            const parts = line.split(/\u2014|—/);
            return '<div style="font-size:11px;color:var(--text2);margin-bottom:2px"><strong>' + _escHtml(parts[0].trim()) + '</strong></div>';
          }
          return '<div style="font-size:11px;color:var(--text2);margin-bottom:2px">' + _escHtml(line) + '</div>';
        }).join('')}
        ${q.notes.split(/\r?\n/).filter(Boolean).length > 3 ? '<div style="font-size:10px;color:var(--muted)">…</div>' : ''}
      </div>` : ''}
      <div class="qc-breakdown">
        <div class="qb-row qb-total"><span>Total</span><span>${fmt(total)}</span></div>
      </div>
      <div class="qc-footer" onclick="event.stopPropagation()">
        ${q.status === 'draft' ? `<button class="btn btn-outline" onclick="markQuoteSent(${q.id})">Mark Sent</button>` : ''}
        ${q.status === 'sent' ? `<button class="btn btn-success" onclick="approveQuote(${q.id})">Approve</button>` : ''}
        ${q.status !== 'draft' ? `<button class="btn btn-outline" onclick="revertQuoteToDraft(${q.id})" style="color:var(--muted)">↩ Draft</button>` : ''}
        ${(() => { const hasOrder = q.client_id && q.project_id && orders.some(o => o.client_id === q.client_id && o.project_id === q.project_id); return hasOrder ? `<button class="btn btn-outline" onclick="switchSection('orders');window._orderSearch='${_escHtml(quoteProject(q))}';renderOrdersMain()" style="color:var(--success)">✓ View Order</button>` : `<button class="btn btn-outline" onclick="convertQuoteToOrder(${q.id})">→ Order</button>`; })()}
        <span style="flex:1"></span>
        <button class="btn btn-outline" onclick="duplicateQuote(${q.id})">Copy</button>
        <button class="btn btn-outline" onclick="printQuote(${q.id},'print')">Print</button>
        <button class="btn btn-outline" onclick="printQuote(${q.id},'pdf')">PDF</button>
      </div>
    </div>`;
  };

  const emptyState = `<div class="empty-state">
    <div class="empty-icon" style="opacity:.18"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
    <h3>No quotes yet</h3><p>Fill in the form on the left to create your first quote.</p></div>`;

  const qFilter = window._quoteFilter || 'all';
  const qSearch = (window._quoteSearch || '').toLowerCase().trim();
  const qSort = window._quoteSort || 'newest';
  let filteredQ = [...quotes];
  if (qFilter !== 'all') filteredQ = filteredQ.filter(q => q.status === qFilter);
  if (qSearch) filteredQ = filteredQ.filter(q => (quoteClient(q) + ' ' + quoteProject(q)).toLowerCase().includes(qSearch));
  if (qSort === 'value') filteredQ.sort((a,b) => quoteTotal(b) - quoteTotal(a));
  else if (qSort === 'client') filteredQ.sort((a,b) => (quoteClient(a)||'').localeCompare(quoteClient(b)||''));

  const filterBar = `<div class="order-filter-tabs" style="align-items:center">
    <input class="order-search-input" type="search" placeholder="Search client or project…" value="${window._quoteSearch||''}" oninput="window._quoteSearch=this.value;renderQuoteMain()">
    <button class="ofilter-tab ${qFilter==='all'?'active':''}" onclick="window._quoteFilter='all';renderQuoteMain()">All (${quotes.length})</button>
    <button class="ofilter-tab ${qFilter==='draft'?'active':''}" onclick="window._quoteFilter='draft';renderQuoteMain()">Draft (${draft})</button>
    <button class="ofilter-tab ${qFilter==='sent'?'active':''}" onclick="window._quoteFilter='sent';renderQuoteMain()">Sent (${sent})</button>
    <button class="ofilter-tab ${qFilter==='approved'?'active':''}" onclick="window._quoteFilter='approved';renderQuoteMain()">Approved (${approved})</button>
    <select style="font-size:11px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface2);color:var(--muted);font-family:inherit;cursor:pointer;margin-left:auto" onchange="window._quoteSort=this.value;renderQuoteMain()">
      <option value="newest" ${qSort==='newest'?'selected':''}>Newest first</option>
      <option value="value" ${qSort==='value'?'selected':''}>Value</option>
      <option value="client" ${qSort==='client'?'selected':''}>Client</option>
    </select>
    <button class="btn btn-outline" onclick="event.stopPropagation();exportQuotesCSV()" style="font-size:10px;padding:4px 8px;width:auto">Export</button>
    <button class="btn btn-outline" onclick="event.stopPropagation();importQuotesCSV()" style="font-size:10px;padding:4px 8px;width:auto">Import</button>
  </div>`;

  el.innerHTML = `<div style="max-width:800px;margin:0 auto">
    <div class="stats-grid">
      <div class="stat-card accent"><div class="stat-label">Total Quotes</div><div class="stat-value">${quotes.length}</div><div class="stat-sub">${draft} draft · ${sent} sent</div></div>
      <div class="stat-card success"><div class="stat-label">Approved</div><div class="stat-value">${approved}</div><div class="stat-sub">ready to start</div></div>
      <div class="stat-card warn"><div class="stat-label">Pipeline Value</div><div class="stat-value">${fmt(totalValue)}</div><div class="stat-sub">total quoted</div></div>
    </div>
    ${quotes.length === 0 ? emptyState : filterBar + `<div class="quote-list">${filteredQ.map(qCard).join('')}${filteredQ.length === 0 ? '<div class="empty-state" style="padding:40px 0"><p style="color:var(--muted)">No quotes match this filter.</p></div>' : ''}</div>`}
  </div>`;
}


// ── CSV import / export ──
function exportQuotesCSV() {
  if (!quotes.length) { _toast('No quotes to export', 'error'); return; }
  const cur = window.currency;
  /** @type {any[][]} */
  const rows = [['Client','Project','Materials','Labour','Markup %','Tax %','Status','Date','Notes']];
  quotes.forEach(q => {
    const matVal = q._totals ? q._totals.materials : (q.materials || 0);
    const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
    rows.push([quoteClient(q),quoteProject(q),matVal,labVal,q.markup,q.tax,q.status,q.date,q.notes||'']);
  });
  const csv = rows.map(r => r.map(/** @param {any} v */ v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `quotes-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Quotes exported', 'success');
}
function importQuotesCSV() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('No data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 4 || !r[0]) continue;
      const client_id = r[0] ? await resolveClient(r[0]) : null;
      const project_id = r[1] ? await resolveProject(r[1], client_id) : null;
      /** @type {any} */
      const row = { user_id: _userId, materials: parseFloat(r[2])||0, labour: parseFloat(r[3])||0, markup: parseFloat(r[4])||20, tax: parseFloat(r[5])||13, status: r[6]||'draft', date: r[7]||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}), notes: r[8]||'' };
      if (client_id) row.client_id = client_id;
      if (project_id) row.project_id = project_id;
      if (_userId) { const{data}=await _db('quotes').insert(row).select().single(); if(data){quotes.unshift(data);imported++;} }
    }
    _toast(imported+' quotes imported','success'); renderQuoteMain();
  };
  input.click();
}


// ══════════════════════════════════════════
// QUOTE HELPERS (smart-input, popups, printing — formerly section in app.js,
// pulled in during phase E carve 14)
// ══════════════════════════════════════════
// ── Smart Suggest System ──
/** @param {HTMLInputElement} input @param {string} boxId */
function _smartClientSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const allClients = [...new Set([...clients.map(c => c.name), ...quotes.map(q => quoteClient(q)), ...orders.map(o => orderClient(o))].filter(Boolean))];
  const matches = val ? allClients.filter(c => c.toLowerCase().includes(val) && c.toLowerCase() !== val) : allClients;
  if (!matches.length && !val) { box.style.display = 'none'; return; }
  const inputId = input.id;
  let html = matches.slice(0,8).map(c => {
    const initial = c.charAt(0).toUpperCase();
    return `<div class="client-suggest-item" onmousedown="_byId('${inputId}').value='${c.replace(/'/g,'&#39;')}';_byId('${boxId}').style.display='none'">
      <span class="suggest-icon">${initial}</span>
      <span>${_escHtml(c)}</span>
    </div>`;
  }).join('');
  html += `<div class="client-suggest-add" onmousedown="_openNewClientPopup('${inputId}')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new client</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

/** @param {HTMLInputElement} input @param {string} boxId */
function _smartProjectSuggest(input, boxId) {
  const val = input.value.toLowerCase().trim();
  const box = _byId(boxId);
  if (!box) return;
  _posSuggest(input, box);
  const allProjects = [...new Set([...projects.map(p => p.name), ...quotes.map(q => quoteProject(q)), ...orders.map(o => orderProject(o))].filter(Boolean))];
  const matches = val ? allProjects.filter(p => p.toLowerCase().includes(val) && p.toLowerCase() !== val) : allProjects;
  if (!matches.length && !val) { box.style.display = 'none'; return; }
  const inputId = input.id;
  let html = matches.slice(0,8).map(p => {
    const proj = /** @type {any} */ (projects.find(px => px.name === p));
    const clientName = proj ? proj.client : '';
    return `<div class="client-suggest-item" onmousedown="_byId('${inputId}').value='${p.replace(/'/g,'&#39;')}';_byId('${boxId}').style.display='none';_autoFillClientFromProject('${p.replace(/'/g,'&#39;')}','${inputId}')">
      <span class="suggest-icon">P</span>
      <span style="flex:1">${_escHtml(p)}</span>
      ${clientName ? `<span style="font-size:11px;color:var(--muted)">${_escHtml(clientName)}</span>` : ''}
    </div>`;
  }).join('');
  html += `<div class="client-suggest-add" onmousedown="_openNewProjectPopup('${inputId}')">+ Add${val ? ' "'+_escHtml(input.value.trim())+'" as' : ''} new project</div>`;
  box.innerHTML = html;
  box.style.display = '';
}

// Auto-fill client when selecting a project that has a known client
/** @param {string} projName @param {string} projInputId */
function _autoFillClientFromProject(projName, projInputId) {
  const proj = /** @type {any} */ (projects.find(p => p.name === projName));
  if (!proj || !proj.client) return;
  // Determine which client input to fill based on the project input
  const clientInputId = projInputId.replace('-project', '-client');
  const clientInput = _byId(clientInputId);
  if (clientInput && !clientInput.value) clientInput.value = proj.client;
}

// ── New Client/Project Popup (inline creation) ──
/** @param {string} targetInputId */
function _openNewClientPopup(targetInputId) {
  // Close any suggest dropdowns
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => b.style.display = 'none');
  // Pre-fill with what user typed
  const existing = _byId(targetInputId)?.value || '';
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">New Client</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">NAME</label><input class="pf-input pf-input-lg" id="pnc-name" value="${_escHtml(existing)}"></div>
      <div class="pf-row">
        <div class="pf" style="flex:1"><label class="pf-label">EMAIL</label><input class="pf-input" id="pnc-email" type="email" placeholder="email@example.com"></div>
        <div class="pf" style="flex:1"><label class="pf-label">PHONE</label><input class="pf-input" id="pnc-phone" placeholder="+44 ..."></div>
      </div>
      <div class="pf"><label class="pf-label">ADDRESS</label><input class="pf-input" id="pnc-address" placeholder="Street, City..."></div>
      <div class="pf"><label class="pf-label">NOTES</label><textarea class="pf-textarea" id="pnc-notes" rows="2" placeholder="Optional notes..."></textarea></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewClientPopup('${targetInputId}')">Add Client</button>
    </div>`;
  _openPopup(html, 'sm');
}

/** @param {string} targetInputId */
async function _saveNewClientPopup(targetInputId) {
  const name = _popupVal('pnc-name');
  if (!name) { _toast('Client name is required', 'error'); return; }
  // Check for duplicate
  if (clients.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    // Just set the input and close
    /** @type {HTMLInputElement} */ (_byId(targetInputId)).value = name;
    _closePopup();
    _toast('Client already exists — selected', 'info');
    return;
  }
  /** @type {any} */
  const newClient = {
    id: Date.now(),
    name,
    email: _popupVal('pnc-email') || '',
    phone: _popupVal('pnc-phone') || '',
    address: _popupVal('pnc-address') || '',
    notes: _popupVal('pnc-notes') || '',
    user_id: _userId
  };
  clients.push(newClient);
  // TODO(schema-divergence): newClient.id is a Date.now() local id; the DB has a serial
  // id and silently overrides. Removing client-side IDs needs callsite audit.
  try { await _db('clients').insert(/** @type {any} */ (newClient)); } catch(e) { console.warn('Client insert failed', e); }
  /** @type {HTMLInputElement} */ (_byId(targetInputId)).value = name;
  _closePopup();
  renderClientsMain();
  _toast(`Client "${name}" added`, 'success');
}

/** @param {string} targetInputId */
function _openNewProjectPopup(targetInputId) {
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(b => b.style.display = 'none');
  const existing = _byId(targetInputId)?.value || '';
  // Get client from the corresponding client input
  const clientInputId = targetInputId.replace('-project', '-client');
  const clientVal = _byId(clientInputId)?.value || '';
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">New Project</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">PROJECT NAME</label><input class="pf-input pf-input-lg" id="pnp-name" value="${_escHtml(existing)}"></div>
      <div class="pf" style="position:relative"><label class="pf-label">CLIENT</label>
        <div class="smart-input-wrap"><input class="pf-input" id="pnp-client" value="${_escHtml(clientVal)}" placeholder="Search or add client..." autocomplete="off" oninput="_smartClientSuggest(this,'pnp-client-suggest')" onfocus="_smartClientSuggest(this,'pnp-client-suggest')" onblur="setTimeout(()=>_byId('pnp-client-suggest').style.display='none',150)"><div class="smart-input-add" onclick="_openNewClientPopup('pnp-client')" title="Add new client">+</div></div>
        <div id="pnp-client-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      <div class="pf"><label class="pf-label">DESCRIPTION</label><textarea class="pf-textarea" id="pnp-desc" rows="2" placeholder="Project details..."></textarea></div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-accent" onclick="_saveNewProjectPopup('${targetInputId}')">Add Project</button>
    </div>`;
  _openPopup(html, 'sm');
}

/** @param {string} targetInputId */
async function _saveNewProjectPopup(targetInputId) {
  const name = _popupVal('pnp-name');
  if (!name) { _toast('Project name is required', 'error'); return; }
  const clientName = _popupVal('pnp-client') || '';
  // Check for duplicate
  if (projects.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    /** @type {HTMLInputElement} */ (_byId(targetInputId)).value = name;
    const clientInputId = targetInputId.replace('-project', '-client');
    const ci = _byId(clientInputId);
    if (ci && clientName && !ci.value) ci.value = clientName;
    _closePopup();
    _toast('Project already exists — selected', 'info');
    return;
  }
  /** @type {any} */
  const newProject = {
    id: Date.now(),
    name,
    client: clientName,
    desc: _popupVal('pnp-desc') || '',
    status: 'active',
    user_id: _userId
  };
  projects.push(newProject);
  // TODO(schema-divergence): newProject has Date.now() id, plus extra `client`/`desc`/
  // `status` fields not in projects schema (DB silently drops them).
  try { await _db('projects').insert(/** @type {any} */ (newProject)); } catch(e) { console.warn('Project insert failed', e); }
  /** @type {HTMLInputElement} */ (_byId(targetInputId)).value = name;
  // Also fill client input
  const clientInputId = targetInputId.replace('-project', '-client');
  const ci = _byId(clientInputId);
  if (ci && clientName && !ci.value) ci.value = clientName;
  _closePopup();
  renderProjectsMain();
  _toast(`Project "${name}" added`, 'success');
}

// Close suggest on blur
document.addEventListener('click', e => {
  const target = /** @type {Node | null} */ (e.target);
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.client-suggest-list')).forEach(box => {
    if (target && !box.contains(target) && !(/** @type {Element} */ (target)).closest('.smart-input-wrap')) box.style.display = 'none';
  });
});

/** @param {number} id @param {string} [mode] */
function printWorkOrder(id, mode='print') {
  const o = orders.find(o => o.id === id);
  if (!o) return;
  if (mode === 'pdf') { _buildWorkOrderPDF(o); return; }
  const biz = getBizInfo();
  const cur = window.currency;
  const rel = _relativeDate(o.due || '');
  /** @type {Record<string, string>} */
  const statusColMap = { quote:'#6b7280', confirmed:'#2563eb', production:'#d97706', delivery:'#0891b2', complete:'#16a34a' };
  const statusCol = statusColMap[o.status || ''] || '#6b7280';
  const stageLabels = ['Quote Sent','Confirmed','In Production','Ready for Delivery','Complete'];
  const stageKeys   = ['quote','confirmed','production','delivery','complete'];
  const currentIdx  = stageKeys.indexOf(o.status || '');

  const stageRows = stageKeys.map((s, i) => {
    const done = i < currentIdx;
    const active = i === currentIdx;
    return `<tr style="background:${active ? '#fffbeb' : 'transparent'}">
      <td style="width:22px;padding:8px 6px 8px 12px">
        <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${done?statusCol:active?statusCol:'#ddd'};background:${done?statusCol:'transparent'};display:flex;align-items:center;justify-content:center">
          ${done ? '<span style="color:#fff;font-size:11px;font-weight:700">✓</span>' : active ? '<div style="width:8px;height:8px;border-radius:50%;background:'+statusCol+'"></div>' : ''}
        </div>
      </td>
      <td style="padding:8px 12px;font-size:14px;font-weight:${active?700:400};color:${active?'#111':'#555'}">${stageLabels[i]}</td>
      <td style="padding:8px 12px;width:140px;border-bottom:1px solid #e8e8e8"></td>
      <td style="padding:8px 12px;width:100px;border-bottom:1px solid #e8e8e8;font-size:11px;color:#bbb">Initials</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Work Order #WO-${String(o.id).padStart(4,'0')}</title>
<style>
  @page { size:A4; margin:12mm 14mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; background:#fff; font-size:13px; }
  /* Top bar */
  .top-bar { background:${statusCol}; color:#fff; display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-radius:6px 6px 0 0; }
  .top-bar-left { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1px; opacity:.9; }
  .top-bar-right { font-size:13px; font-weight:800; letter-spacing:.5px; }
  /* Header */
  .hdr { border:1.5px solid #ddd; border-top:none; padding:16px; border-radius:0 0 6px 6px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:flex-start; }
  .biz-name { font-size:14px; font-weight:800; }
  .biz-contact { font-size:10px; color:#888; margin-top:3px; line-height:1.7; }
  .wo-ref { text-align:right; }
  .wo-ref-num { font-size:28px; font-weight:800; letter-spacing:-1px; color:#111; }
  .wo-date { font-size:10px; color:#aaa; margin-top:3px; }
  /* Job details */
  .job-block { margin-bottom:18px; }
  .job-client { font-size:26px; font-weight:800; letter-spacing:-.5px; line-height:1.1; }
  .job-project { font-size:16px; color:#444; margin-top:4px; font-weight:400; }
  /* Info strip */
  .info-strip { display:grid; grid-template-columns:repeat(3,1fr); border:1.5px solid #e0e0e0; border-radius:6px; overflow:hidden; margin-bottom:18px; }
  .info-cell { padding:12px 14px; border-right:1px solid #e0e0e0; }
  .info-cell:last-child { border-right:none; }
  .info-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#aaa; margin-bottom:4px; }
  .info-val { font-size:17px; font-weight:800; }
  .info-sub { font-size:10px; color:#888; margin-top:1px; }
  /* Notes */
  .section-label { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#aaa; margin-bottom:6px; margin-top:16px; }
  .notes-content { border:1.5px solid #e0e0e0; border-radius:6px; padding:14px; font-size:14px; color:#222; line-height:1.75; min-height:60px; }
  /* Production checklist */
  .stages-table { width:100%; border-collapse:collapse; border:1.5px solid #e0e0e0; border-radius:6px; overflow:hidden; margin-top:6px; }
  .stages-table td { border-bottom:1px solid #eee; vertical-align:middle; }
  .stages-table tr:last-child td { border-bottom:none; }
  .col-hdr { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#bbb; padding:6px 12px; background:#f8f8f8; border-bottom:1.5px solid #e0e0e0; }
  /* Production notes lines */
  .note-line { border-bottom:1px solid #e0e0e0; height:28px; margin-bottom:2px; }
  /* Sign-off */
  .signoff { display:grid; grid-template-columns:1fr 1fr 1fr; gap:20px; margin-top:6px; }
  .signoff-field { border-top:1.5px solid #555; padding-top:6px; }
  .signoff-label { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; }
  .footer { margin-top:24px; border-top:1px solid #eee; padding-top:8px; display:flex; justify-content:space-between; font-size:9px; color:#ccc; }
</style></head><body>

<div class="top-bar">
  <div class="top-bar-left">Work Order &nbsp;&bull;&nbsp; ${(/** @type {Record<string,string>} */(STATUS_LABELS))[o.status||''] || o.status}</div>
  <div class="top-bar-right">#WO-${String(o.id).padStart(4,'0')}</div>
</div>
<div class="hdr">
  <div>
    <div class="biz-name">${biz.name || 'ProCabinet'}</div>
    <div class="biz-contact">${[biz.phone, biz.email, biz.address, biz.abn ? 'ABN: ' + biz.abn : ''].filter(Boolean).join('<br>')}</div>
  </div>
  <div class="wo-ref">
    <div class="wo-ref-num">#WO-${String(o.id).padStart(4,'0')}</div>
    <div class="wo-date">Issued ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</div>
  </div>
</div>

<div class="job-block">
  <div class="job-client">${orderClient(o)}</div>
  <div class="job-project">${orderProject(o)}</div>
</div>

<div class="info-strip">
  <div class="info-cell">
    <div class="info-lbl">Due Date</div>
    <div class="info-val" style="font-size:15px">${o.due || 'TBD'}</div>
    ${rel ? `<div class="info-sub" style="color:${rel.color}">${rel.label}</div>` : ''}
  </div>
  <div class="info-cell">
    <div class="info-lbl">Job Value</div>
    <div class="info-val">${cur}${(o.value||0).toLocaleString('en-US',{minimumFractionDigits:0})}</div>
  </div>
  <div class="info-cell">
    <div class="info-lbl">Stage</div>
    <div class="info-val" style="font-size:14px;color:${statusCol}">${(/** @type {Record<string,string>} */(STATUS_LABELS))[o.status||''] || o.status}</div>
  </div>
</div>

${o.notes ? `<div class="section-label">Job Notes &amp; Instructions</div><div class="notes-content">${(o.notes||'').replace(/\n/g,'<br>')}</div>` : ''}

<div class="section-label" style="margin-top:18px">Production Stages</div>
<table class="stages-table">
  <thead><tr>
    <td class="col-hdr" style="width:32px"></td>
    <td class="col-hdr">Stage</td>
    <td class="col-hdr">Completed (date)</td>
    <td class="col-hdr">Sign off</td>
  </tr></thead>
  <tbody>${stageRows}</tbody>
</table>

<div class="section-label" style="margin-top:18px">Production Notes</div>
${[1,2,3,4,5].map(() => `<div class="note-line"></div>`).join('')}

<div class="section-label" style="margin-top:18px">Sign-off</div>
<div class="signoff">
  <div class="signoff-field"><div class="signoff-label">Prepared by</div></div>
  <div class="signoff-field"><div class="signoff-label">Date started</div></div>
  <div class="signoff-field"><div class="signoff-label">Date completed</div></div>
</div>

<div class="footer">
  <span>${biz.name || 'ProCabinet'} — ProCabinet.App</span>
  <span>Printed ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
</div>
</body></html>`;

  _saveAsPDF(html);
}

async function deductStockFromCutList() {
  if (!window.results || !window.results.layouts) { _toast('Run optimization first.', 'error'); return; }
  if (!_requireAuth()) return;
  // Count sheets used by name
  /** @type {Record<string, number>} */
  const usage = {};
  window.results.layouts.forEach(/** @param {any} l */ l => {
    const name = l.sheet.label || l.sheet.name || '';
    usage[name] = (usage[name] || 0) + 1;
  });
  let deducted = 0;
  for (const [name, count] of Object.entries(usage)) {
    const stock = stockItems.find(s => s.name === name);
    if (!stock) continue;
    const newQty = Math.max(0, (stock.qty ?? 0) - count);
    await _db('stock_items').update({ qty: newQty }).eq('id', stock.id);
    stock.qty = newQty;
    deducted += count;
  }
  if (deducted) {
    _toast(deducted + ' sheet' + (deducted !== 1 ? 's' : '') + ' deducted from stock', 'success');
    renderStockMain();
  } else {
    _toast('No matching stock items found to deduct', 'info');
  }
}

/** @param {number} matCost */
function quoteFromCutList(matCost) {
  switchSection('quote');
  const el = _byId('q-materials');
  if (el) { el.value = matCost.toFixed(2); el.focus(); }
  const pn = _byId('q-project');
  if (pn && !pn.value) pn.value = 'Untitled Job';
  // Subtle flash to draw attention to the pre-filled field
  if (el) { el.style.background = 'rgba(232,168,56,0.2)'; setTimeout(() => el.style.background = '', 1200); }
}

/** @param {number} id */
async function markQuoteSent(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'sent' }).eq('id', id);
  q.status = 'sent';
  renderQuoteMain();
}

/** @param {number} id @param {string} [mode] */
function printQuote(id, mode='print') {
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  if (mode === 'pdf') { _buildQuotePDF(q); return; }
  const cur = window.currency;
  /** @param {any} v */
  const fmt  = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  /** @param {any} v */
  const fmt0 = v => cur + Number(v).toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const logo = getBizLogo();
  const matVal = q._totals ? q._totals.materials : (q.materials || 0);
  const labVal = q._totals ? q._totals.labour    : (q.labour    || 0);
  const sub = matVal + labVal;
  const markupAmt = sub * (q.markup ?? 0) / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * (q.tax ?? 0) / 100;
  const total = afterMarkup + taxAmt;
  const biz = getBizInfo();
  /** @type {Record<string, string>} */
  const statusColMap = { draft:'#888', sent:'#2563eb', approved:'#16a34a' };
  /** @type {Record<string, string>} */
  const statusTxtMap = { draft:'Draft', sent:'Sent', approved:'Approved' };
  const statusCol = statusColMap[q.status||''] || '#888';
  const statusTxt = statusTxtMap[q.status||''] || q.status;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quote #Q-${String(q.id).padStart(4,'0')} — ${quoteProject(q)}</title>
<style>
  @page { size:A4; margin:15mm 18mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; background:#fff; font-size:13px; line-height:1.5; }
  /* Header */
  .hdr { display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:14px; border-bottom:3px solid #111; margin-bottom:28px; }
  .biz-name { font-size:20px; font-weight:800; letter-spacing:-.4px; }
  .biz-contact { font-size:11px; color:#777; margin-top:4px; line-height:1.7; }
  .doc-right { text-align:right; }
  .doc-word { font-size:30px; font-weight:200; letter-spacing:4px; text-transform:uppercase; color:#222; }
  .doc-num { font-size:12px; color:#888; margin-top:6px; }
  .status-dot { display:inline-block; width:8px; height:8px; border-radius:50%; background:${statusCol}; margin-right:4px; }
  /* Bill-to / project */
  .bill-row { display:flex; gap:48px; margin-bottom:28px; }
  .bill-block label { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#bbb; display:block; margin-bottom:5px; border-bottom:1px solid #eee; padding-bottom:4px; }
  .bill-block .name { font-size:17px; font-weight:700; }
  .bill-block .sub  { font-size:13px; color:#555; margin-top:2px; }
  /* Line items */
  table { width:100%; border-collapse:collapse; margin-bottom:2px; }
  thead tr { border-bottom:1.5px solid #111; }
  thead th { font-size:10px; text-transform:uppercase; letter-spacing:.6px; color:#888; padding:8px 10px; text-align:left; }
  thead th.r { text-align:right; }
  tbody td { padding:11px 10px; border-bottom:1px solid #f0f0f0; font-size:13px; }
  tbody td.r { text-align:right; font-variant-numeric:tabular-nums; }
  tr.subtotal td { color:#777; font-size:12px; padding:6px 10px; border-bottom:none; }
  tr.subtotal td.r { color:#777; }
  /* Total box */
  .total-box { display:flex; justify-content:space-between; align-items:center; background:#111; color:#fff; padding:14px 18px; border-radius:6px; margin-top:10px; }
  .total-label { font-size:11px; text-transform:uppercase; letter-spacing:1.5px; font-weight:600; opacity:.7; }
  .total-amount { font-size:26px; font-weight:800; letter-spacing:-.5px; }
  /* Notes */
  .notes-box { margin-top:24px; background:#f8f8f8; border-radius:6px; padding:16px 18px; }
  .notes-box label { font-size:9px; text-transform:uppercase; letter-spacing:.8px; color:#aaa; display:block; margin-bottom:8px; }
  .notes-box p { font-size:13px; color:#333; line-height:1.65; }
  /* Validity */
  .validity { margin-top:20px; font-size:11px; color:#aaa; }
  /* Acceptance */
  .acceptance { margin-top:32px; padding-top:20px; border-top:1px solid #e0e0e0; }
  .acceptance-title { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:#555; margin-bottom:12px; }
  .acceptance-text { font-size:12px; color:#777; margin-bottom:22px; line-height:1.6; }
  .sig-grid { display:grid; grid-template-columns:2fr 1fr; gap:32px; margin-top:4px; }
  .sig-field { border-bottom:1.5px solid #ccc; padding-bottom:0; padding-top:32px; }
  .sig-label { font-size:9px; text-transform:uppercase; letter-spacing:.6px; color:#bbb; margin-top:5px; }
  /* Footer */
  .footer { margin-top:36px; display:flex; justify-content:space-between; font-size:9px; color:#ccc; border-top:1px solid #f0f0f0; padding-top:10px; }
  @media print { .acceptance { break-inside:avoid; } }
</style></head><body>

<div class="hdr">
  <div style="display:flex;align-items:center;gap:12px">
    ${logo ? `<img src="${logo}" style="max-height:48px;max-width:120px;object-fit:contain">` : ''}
    <div>
      <div class="biz-name">${biz.name || 'Your Business'}</div>
      <div class="biz-contact">${[biz.phone, biz.email, biz.address, biz.abn ? 'ABN: ' + biz.abn : ''].filter(Boolean).join('<br>')}</div>
    </div>
  </div>
  <div class="doc-right">
    <div class="doc-word">Quotation</div>
    <div class="doc-num">#Q-${String(q.id).padStart(4,'0')} &nbsp;&bull;&nbsp; ${q.date} &nbsp;&bull;&nbsp; <span class="status-dot"></span>${statusTxt}</div>
  </div>
</div>

<div class="bill-row">
  <div class="bill-block">
    <label>Prepared for</label>
    <div class="name">${_escHtml(quoteClient(q))}</div>
  </div>
  <div class="bill-block">
    <label>Project</label>
    <div class="name" style="font-size:15px">${_escHtml(quoteProject(q))}</div>
  </div>
</div>

<table>
  <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
  <tbody>
    ${(q.notes||'').split(/\r?\n/).filter(l => l.includes('\u2014') || l.includes('—')).map(cl => {
      const parts = cl.split(/\u2014|—/).map(s=>s.trim());
      return '<tr><td style="padding:10px"><strong style="font-size:14px">'+_escHtml(parts[0])+'</strong><br><span style="font-size:11px;color:#888;padding-left:14px">'+_escHtml(parts.slice(1).join(' — ').trim())+'</span></td><td class="r"></td></tr>';
    }).join('')}
    ${(q.notes||'').split(/\r?\n/).some(l => l.includes('\u2014') || l.includes('—')) ? '<tr><td colspan="2" style="border-bottom:1.5px solid #ddd;padding:0"></td></tr>' : ''}
    ${(q.markup ?? 0) > 0 || (q.tax ?? 0) > 0 ? `<tr class="subtotal"><td style="color:#aaa">Subtotal</td><td class="r">${fmt(sub)}</td></tr>` : ''}
    ${(q.markup ?? 0) > 0 ? `<tr class="subtotal"><td style="padding-left:20px">Markup &nbsp;<span style="color:#bbb">(${q.markup}%)</span></td><td class="r">+ ${fmt(markupAmt)}</td></tr>` : ''}
    ${(q.tax ?? 0) > 0 ? `<tr class="subtotal"><td style="padding-left:20px">Tax &nbsp;<span style="color:#bbb">(${q.tax}%)</span></td><td class="r">+ ${fmt(taxAmt)}</td></tr>` : ''}
  </tbody>
</table>
<div class="total-box">
  <div class="total-label">Total Amount Due</div>
  <div class="total-amount">${fmt0(total)}</div>
</div>

${(() => {
  const noteLines = (q.notes||'').split(/\r?\n/).filter(Boolean);
  const plainNotes = noteLines.filter(l => !l.includes('\u2014') && !l.includes('—')).join('<br>');
  return plainNotes ? '<div class="notes-box"><label>Notes</label><p>'+_escHtml(plainNotes)+'</p></div>' : '';
})()}

<div class="validity">This quote is valid for 30 days from the date of issue. Prices are subject to change after this period.</div>

<div class="acceptance">
  <div class="acceptance-title">Acceptance</div>
  <div class="acceptance-text">To accept this quotation, please sign below and return a copy to ${biz.name || 'us'}${biz.email ? ' at ' + biz.email : ''}. Work will commence upon receipt of a signed copy and any agreed deposit.</div>
  <div class="sig-grid">
    <div>
      <div class="sig-field"></div>
      <div class="sig-label">Client Signature</div>
    </div>
    <div>
      <div class="sig-field"></div>
      <div class="sig-label">Date</div>
    </div>
  </div>
</div>

<div class="footer">
  <span>${biz.name || 'ProCabinet'} &mdash; Generated by ProCabinet.App</span>
  <span>${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span>
</div>
</body></html>`;

  _printInFrame(html);
}

/** @param {number} id */
async function duplicateQuote(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  /** @type {any} */
  const row = { user_id: _userId, markup: q.markup, tax: q.tax, status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}), notes: q.notes || '' };
  if (q.client_id) row.client_id = q.client_id;
  if (q.project_id) row.project_id = q.project_id;
  const { data, error } = await _db('quotes').insert(row).select().single();
  if (error || !data) { _toast('Could not duplicate quote — ' + (error?.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  quotes.unshift(data);
  // Copy any existing quote_lines so the duplicate has matching totals
  try {
    const { data: oldLines } = await _db('quote_lines').select('*').eq('quote_id', q.id);
    if (oldLines && oldLines.length) {
      const newLines = oldLines.map(l => { const nl = /** @type {any} */ ({ ...l, quote_id: data.id }); delete nl.id; return nl; });
      await _db('quote_lines').insert(newLines);
      await _refreshQuoteTotals(data.id);
    }
  } catch(e) { console.warn('[duplicateQuote] copy lines failed:', e.message || e); }
  _toast('Quote duplicated', 'success');
  renderQuoteMain();
}

/** @param {number} id @param {string} field @param {any} val */
async function updateQuoteField(id, field, val) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const numFields = ['materials','labour','markup','tax'];
  const v = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  /** @type {any} */ (q)[field] = v;
  await _db('quotes').update(/** @type {any} */ ({ [field]: v })).eq('id', id);
  renderQuoteMain();
}
