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
let quotes = [];
let quoteNextId = 1;

// FK-resolving display helpers. After Phase 7 the legacy text columns are gone,
// so an unresolved FK simply returns ''.
function quoteClient(q) {
  if (!q || !q.client_id) return '';
  const c = clients.find(x => x.id === q.client_id);
  return c ? c.name : '';
}
function quoteProject(q) {
  if (!q || !q.project_id) return '';
  const p = projects.find(x => x.id === q.project_id);
  return p ? p.name : '';
}
function orderClient(o) {
  if (!o || !o.client_id) return '';
  const c = clients.find(x => x.id === o.client_id);
  return c ? c.name : '';
}
function orderProject(o) {
  if (!o || !o.project_id) return '';
  const p = projects.find(x => x.id === o.project_id);
  return p ? p.name : '';
}

// Aggregate materials/labour for a quote from its `quote_lines` rows.
// Returns null if no lines exist; callers should treat null as zero totals.
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

async function _refreshQuoteTotals(quoteId) {
  const q = quotes.find(x => x.id === quoteId);
  if (!q) return;
  delete q._totals;
  const t = await quoteTotalsFromLines(quoteId);
  if (t) q._totals = t;
}

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
function orderTotal(o) {
  return o ? (o.value || 0) : 0;
}

async function createQuote() {
  const client = document.getElementById('q-client').value.trim();
  const project = document.getElementById('q-project').value.trim();
  if (!client || !project) { _toast('Enter client name and project.', 'error'); return; }
  if (!_requireAuth()) return;
  const hours = parseFloat(document.getElementById('q-hours').value) || 0;
  const materials = parseFloat(document.getElementById('q-materials').value) || 0;
  const clientId = await resolveClient(client);
  const projectId = await resolveProject(project, clientId);
  const row = {
    user_id: _userId,
    markup: parseFloat(document.getElementById('q-markup').value) || 20,
    tax: parseFloat(document.getElementById('q-tax').value) || 13,
    status: 'draft', date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'}),
    notes: document.getElementById('q-notes').value.trim(),
  };
  if (clientId) row.client_id = clientId;
  if (projectId) row.project_id = projectId;
  const { data, error } = await _dbInsertSafe('quotes', row);
  if (error) { _toast('Could not save quote — ' + (error.message || JSON.stringify(error)), 'error'); console.error(error); return; }
  quotes.unshift(data);
  // Manual-totals quote: stash entered materials/hours on a quote_lines stub so quoteTotal aggregates correctly
  if (materials > 0 || hours > 0) {
    await _writeManualTotalsLine(data.id, materials, hours);
    await _refreshQuoteTotals(data.id);
  }
  _toast('Quote created', 'success');
  document.getElementById('q-client').value = '';
  document.getElementById('q-project').value = '';
  document.getElementById('q-notes').value = '';
  document.getElementById('q-materials').value = '';
  renderQuoteMain();
}

async function removeQuote(id) {
  if (!_requireAuth()) return;
  await _db('quotes').delete().eq('id', id);
  quotes = quotes.filter(q => q.id !== id);
  renderQuoteMain();
}

async function convertQuoteToOrder(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  const { error: qErr } = await _db('quotes').update({ status: 'approved' }).eq('id', id);
  if (qErr) { _toast('Could not update quote — ' + (qErr.message || JSON.stringify(qErr)), 'error'); console.error(qErr); return; }
  q.status = 'approved';
  const orderRow = { user_id: _userId, value: Math.round(quoteTotal(q)), status: 'confirmed', due: 'TBD' };
  if (q.client_id) orderRow.client_id = q.client_id;
  if (q.project_id) orderRow.project_id = q.project_id;
  const { data, error: oErr } = await _dbInsertSafe('orders', orderRow);
  if (oErr) { _toast('Could not create order — ' + (oErr.message || JSON.stringify(oErr)), 'error'); console.error(oErr); return; }
  // Carry quote notes to order notes & store quote reference
  if (q.notes && data) { data.notes = q.notes; _onSet(data.id, q.notes); }
  if (data) { _oqSet(data.id, q.id); }
  // Copy the quote's line items to order_lines so the order has its own snapshot
  if (data) {
    try {
      const { data: qlines } = await _db('quote_lines').select('*').eq('quote_id', q.id);
      if (qlines && qlines.length) {
        const olines = qlines.map(l => {
          const nl = { ...l, order_id: data.id };
          delete nl.id; delete nl.quote_id;
          return nl;
        });
        await _db('order_lines').insert(olines);
      }
    } catch(e) { console.warn('[convertQuoteToOrder] copy lines failed:', e.message || e); }
  }
  orders.unshift(data);
  document.getElementById('orders-badge').textContent = orders.filter(o => o.status !== 'complete').length;
  _toast(`Order created for ${quoteClient(q)} — ${quoteProject(q)}`, 'success');
  renderQuoteMain();
  switchSection('orders');
}

async function approveQuote(id) {
  if (!_requireAuth()) return;
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  await _db('quotes').update({ status: 'approved' }).eq('id', id);
  q.status = 'approved';
  _toast('Quote marked as approved', 'success');
  renderQuoteMain();
}

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
  const el = document.getElementById('quote-main');
  if (!el) return;
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  const totalValue = quotes.reduce((s,q) => s + quoteTotal(q), 0);
  const approved = quotes.filter(q => q.status === 'approved').length;
  const sent = quotes.filter(q => q.status === 'sent').length;
  const draft = quotes.filter(q => q.status === 'draft').length;

  const statusBadge = s => {
    if (s === 'approved') return '<span class="badge badge-green">Approved</span>';
    if (s === 'sent') return '<span class="badge badge-blue">Sent</span>';
    return '<span class="badge badge-gray">Draft</span>';
  };

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
        ${q.notes.split(/\r?\n/).filter(Boolean).slice(0,3).map(line => {
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
  else if (qSort === 'client') filteredQ.sort((a,b) => (a.client||'').localeCompare(b.client||''));

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


