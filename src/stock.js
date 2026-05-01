// ProCabinet — Stock helpers (carved out of src/app.js in phase E carve 8)
//
// Loaded as a classic <script defer> BEFORE src/app.js. Declares the
// `stockLibraries` state binding which app.js's INIT block reads at
// load time (via loadStockLibraries()).
//
// Cross-file dependencies referenced from this file's functions:
// stockItems (state declared in app.js's STOCK section), sheets (app.js
// CUTLIST), setStockQty / addSheet (app.js), _toast / _confirm (ui.js
// / app.js), switchSection (app.js). When STOCK and CUTLIST are
// eventually carved into their own files, those bindings move with
// them — runtime resolution through global env stays intact.

// ══════════════════════════════════════════
// STOCK HELPERS
// ══════════════════════════════════════════
function removeUsedSheets() {
  if (typeof results === 'undefined' || !results || !results.layouts || !results.layouts.length) {
    _toast('Run an optimization first to see which sheets are used', 'error'); return;
  }
  const sheetsUsed = results.layouts.length;
  _confirm(`Remove ${sheetsUsed} used sheet${sheetsUsed!==1?'s':''} from stock?`, () => {
    // Find matching stock item and decrement
    const sheetName = sheets[0]?.material || '';
    const stockItem = stockItems.find(s => s.name.toLowerCase().includes(sheetName.toLowerCase().split(' ')[0]));
    if (stockItem) {
      const newQty = Math.max(0, stockItem.qty - sheetsUsed);
      setStockQty(stockItem.id, newQty);
      _toast(`Removed ${sheetsUsed} sheet${sheetsUsed!==1?'s':''} from "${stockItem.name}" (${stockItem.qty + sheetsUsed} → ${newQty})`, 'success');
    } else {
      _toast('No matching stock item found — update stock manually', 'info');
    }
  }, false);
}

function useStockInCutList(id) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  addSheet(item.name, item.w, item.h, Math.max(1, item.qty));
  _toast(`"${item.name}" added to cut list`, 'success');
  switchSection('cutlist');
}

// ── Stock Libraries ──
let stockLibraries = [];
function loadStockLibraries() { try { stockLibraries = JSON.parse(localStorage.getItem('pc_stock_libraries')||'[]'); } catch(e) { stockLibraries=[]; } }
function saveStockLibraries() { localStorage.setItem('pc_stock_libraries', JSON.stringify(stockLibraries)); }

function toggleStockLibraries() {}

function saveStockLibrary(nameArg) {
  const name = (nameArg || '').trim();
  if (!name) { _toast('Enter a library name', 'error'); return; }
  const lib = {
    id: Date.now(), name,
    date: new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
    items: JSON.parse(JSON.stringify(stockItems)),
    categories: JSON.parse(localStorage.getItem('pc_stock_cats')||'{}'),
    suppliers: JSON.parse(localStorage.getItem('pc_stock_suppliers')||'{}')
  };
  stockLibraries.unshift(lib);
  saveStockLibraries();
  _toast(`Library "${name}" saved`, 'success');
}

function loadStockLibrary(idx) {
  const lib = stockLibraries[idx];
  if (!lib) return;
  _confirm(`Load "${lib.name}"? This will replace current stock.`, () => {
    // Clear current and load
    stockItems.length = 0;
    (lib.items||[]).forEach(item => stockItems.push(item));
    if (lib.categories) localStorage.setItem('pc_stock_cats', JSON.stringify(lib.categories));
    if (lib.suppliers) localStorage.setItem('pc_stock_suppliers', JSON.stringify(lib.suppliers));
    renderStockMain();
    _updateStockBadge();
    _toast(`Loaded "${lib.name}"`, 'success');
  }, false);
}

function deleteStockLibrary(idx) {
  _confirm('Delete this library?', () => {
    stockLibraries.splice(idx, 1);
    saveStockLibraries();
  });
}



function exportStockLibrary() {
  if (!stockLibraries.length) { _toast('No libraries to export', 'error'); return; }
  const json = JSON.stringify(stockLibraries);
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([json],{type:'application/json'})), download: 'stock-libraries.json' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Libraries exported', 'success');
}

function importStockLibrary() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (Array.isArray(data)) { data.forEach(lib => { lib.id = Date.now() + Math.random(); stockLibraries.push(lib); }); saveStockLibraries(); _toast(data.length + ' libraries imported', 'success'); }
      else _toast('Invalid file', 'error');
    } catch(e) { _toast('Could not read file', 'error'); }
  };
  input.click();
}

function exportStockCSV() {
  const u = window.units === 'metric' ? 'mm' : 'in';
  const rows = [['Name','SKU','Category',`W (${u})`,`H (${u})`,'Qty','Low Alert','Cost/Sheet','Total Value','Status']];
  stockItems.forEach(i => {
    const cat = _scGet(i.id);
    const status = i.qty <= i.low ? 'Low Stock' : 'OK';
    rows.push([i.name, i.sku||'', cat, i.w, i.h, i.qty, i.low, i.cost.toFixed(2), (i.qty*i.cost).toFixed(2), status]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: `stock-inventory-${new Date().toISOString().slice(0,10)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Inventory exported to CSV', 'success');
}

function downloadStockTemplate() {
  const u = window.units === 'metric' ? 'mm' : 'in';
  const csv = `"Name","SKU","Category","W (${u})","H (${u})","Qty","Low Alert","Cost/Sheet"\n"18mm Birch Plywood","PLY-18-B","Sheet Goods",${u==='mm'?2440:96},${u==='mm'?1220:48},10,3,72.00`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download: 'stock-template.csv' });
  a.click(); URL.revokeObjectURL(a.href);
  _toast('Template downloaded', 'success');
}

function importStockCSV() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv';
  input.onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map(r => r.split(',').map(c => c.replace(/^"|"$/g,'').trim()));
    if (rows.length < 2) { _toast('CSV has no data rows', 'error'); return; }
    let imported = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]; if (r.length < 6) continue;
      const row = { user_id: _userId, name: r[0], sku: r[1]||'', w: parseFloat(r[3])||0, h: parseFloat(r[4])||0, qty: parseInt(r[5])||0, low: parseInt(r[6])||3, cost: parseFloat(r[7])||0 };
      if (!row.name) continue;
      if (_userId) {
        const { data } = await _db('stock_items').insert(row).select().single();
        if (data) { stockItems.push(data); if (r[2]) _scSet(data.id, r[2]); imported++; }
      }
    }
    _toast(imported + ' items imported', 'success');
    renderStockMain();
  };
  input.click();
}

function printStockList(mode='print') {
  if (mode === 'pdf') { _buildStockPDF(); return; }
  const cur = window.currency;
  const u = window.units === 'metric' ? 'mm' : 'in';
  const biz = getBizInfo();
  const usedCats = [...new Set(stockItems.map(i => _scGet(i.id)).filter(Boolean))].sort();
  const totalValue = stockItems.reduce((s,i) => s + i.qty*i.cost, 0);
  const totalSheets = stockItems.reduce((s,i) => s + i.qty, 0);
  const lowItems = stockItems.filter(i => i.qty <= i.low);

  // Group by category
  const grouped = {};
  stockItems.forEach(i => { const c = _scGet(i.id) || 'Uncategorised'; if (!grouped[c]) grouped[c] = []; grouped[c].push(i); });
  const catOrder = [...STOCK_CATS, ...Object.keys(grouped).filter(k => !STOCK_CATS.includes(k) && k !== 'Uncategorised'), 'Uncategorised'];

  const rows = catOrder.filter(c => grouped[c]).map(cat => `
    <tr><td colspan="7" style="background:#f5f5f5;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#888;padding:6px 10px">${cat}</td></tr>
    ${grouped[cat].map(i => {
      const isLow = i.qty <= i.low;
      const sup = _ssGet(i.id);
      return `<tr style="${isLow?'background:#fff5f5':''}">
        <td>${i.name}</td>
        <td>${i.sku||'—'}</td>
        <td>${i.w}×${i.h}${u}</td>
        <td style="font-size:10px;color:#666">${sup.supplier||''}</td>
        <td style="text-align:right;${isLow?'color:#c0392b;font-weight:700':''}">${i.qty}</td>
        <td style="text-align:right">${i.low}</td>
        <td style="text-align:right">${cur}${(i.qty*i.cost).toFixed(0)}</td>
      </tr>`;
    }).join('')}`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Inventory</title>
<style>
  @page { size:A4; margin:14mm 16mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#111; font-size:12px; }
  .hdr { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2.5px solid #111; padding-bottom:10px; margin-bottom:18px; }
  .biz { font-size:16px; font-weight:800; }
  .biz-sub { font-size:10px; color:#888; margin-top:2px; }
  .doc-right { text-align:right; }
  .doc-title { font-size:20px; font-weight:300; letter-spacing:3px; text-transform:uppercase; color:#333; }
  .doc-meta { font-size:10px; color:#999; margin-top:3px; }
  .summary { display:flex; gap:0; border:1px solid #e0e0e0; border-radius:6px; overflow:hidden; margin-bottom:20px; }
  .sstat { flex:1; padding:10px 14px; border-right:1px solid #e0e0e0; }
  .sstat:last-child { border-right:none; }
  .sstat-val { font-size:18px; font-weight:800; }
  .sstat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:#888; margin-top:1px; }
  table { width:100%; border-collapse:collapse; }
  thead tr { border-bottom:1.5px solid #111; }
  thead th { font-size:9px; text-transform:uppercase; letter-spacing:.5px; color:#999; padding:6px 10px; text-align:left; }
  thead th.r { text-align:right; }
  tbody td { padding:7px 10px; border-bottom:1px solid #f3f3f3; font-size:11px; }
  .footer { margin-top:24px; border-top:1px solid #eee; padding-top:8px; display:flex; justify-content:space-between; font-size:9px; color:#bbb; }
  .low-note { background:#fff5f5; border:1px solid #fca5a5; border-radius:4px; padding:6px 10px; margin-bottom:14px; font-size:11px; color:#c0392b; }
</style></head><body>
<div class="hdr">
  <div><div class="biz">${biz.name||'ProCabinet'}</div><div class="biz-sub">${[biz.phone,biz.email].filter(Boolean).join(' · ')||'Cabinetry'}</div></div>
  <div class="doc-right"><div class="doc-title">Stock Inventory</div><div class="doc-meta">${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div></div>
</div>
<div class="summary">
  <div class="sstat"><div class="sstat-val">${stockItems.length}</div><div class="sstat-lbl">Materials</div></div>
  <div class="sstat"><div class="sstat-val">${totalSheets}</div><div class="sstat-lbl">Total Sheets</div></div>
  <div class="sstat"><div class="sstat-val">${cur}${totalValue.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}</div><div class="sstat-lbl">Total Value</div></div>
  <div class="sstat"><div class="sstat-val" style="${lowItems.length?'color:#c0392b':''}">${lowItems.length}</div><div class="sstat-lbl">Low Stock</div></div>
</div>
${lowItems.length ? `<div class="low-note">⚠ Low stock: ${lowItems.map(i=>i.name).join(', ')}</div>` : ''}
<table>
  <thead><tr><th>Material</th><th>SKU</th><th>Size</th><th>Supplier</th><th class="r">Qty</th><th class="r">Alert</th><th class="r">Value</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer"><span>${biz.name||'ProCabinet'} — ProCabinet.App</span><span>Printed ${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</span></div>
</body></html>`;

  _saveAsPDF(html);
}

async function setStockQty(id, val) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const qty = Math.max(0, parseInt(val) || 0);
  await _db('stock_items').update({ qty }).eq('id', id);
  item.qty = qty;
  renderStockMain();
}

async function updateStockField(id, field, val) {
  const item = stockItems.find(s => s.id === id);
  if (!item) return;
  const numFields = ['w','h','qty','low','cost'];
  const v = numFields.includes(field) ? (parseFloat(val) || 0) : val;
  item[field] = v;
  await _db('stock_items').update({ [field]: v }).eq('id', id);
  renderStockMain();
}

function setStockCatInline(id, tagEl) {
  // Replace the tag with a small select to pick category
  const cur = _scGet(id);
  const opts = ['', ...STOCK_CATS].map(c => `<option value="${c}"${c===cur?' selected':''}>${c||'— None —'}</option>`).join('');
  const sel = document.createElement('select');
  sel.className = 'stock-cat-select';
  sel.innerHTML = opts;
  sel.onblur = sel.onchange = () => {
    const val = sel.value.trim();
    _scSet(id, val);
    renderStockMain();
  };
  tagEl.replaceWith(sel);
  sel.focus();
}
