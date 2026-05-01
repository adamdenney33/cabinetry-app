// ProCabinet — Quote-form defaults + date helpers (carved out of src/app.js
// in phase E carve 10).
//
// Loaded as a classic <script defer> AFTER src/app.js. The top-level IIFE
// wires up localStorage persistence + input listeners on the quote-form
// inputs (#q-labour-rate, #q-hours, #q-markup, #q-tax) and calls
// _updateQuotePreview once at load time — it returns early because
// #quote-form-preview is not in the DOM until the Quote tab renders.
//
// Cross-file dependencies: _updateQuotePreview (defined in this file —
// classic-script hoisting handles the IIFE-then-function order),
// window.currency (assigned by app.js's GLOBALS section).

// ══════════════════════════════════════════
// FORM DEFAULTS (persist across sessions)
// ══════════════════════════════════════════
(function() {
  const defs = { 'q-labour-rate': 65, 'q-hours': 8, 'q-markup': 20, 'q-tax': 13 };
  Object.entries(defs).forEach(([id, fallback]) => {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    if (!el) return;
    const saved = localStorage.getItem('pc_' + id);
    if (saved !== null) el.value = saved;
    el.addEventListener('change', () => { localStorage.setItem('pc_' + id, el.value); _updateQuotePreview(); });
  });
  // Also update preview on input to these fields
  ['q-labour-rate','q-hours','q-materials','q-markup','q-tax'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', _updateQuotePreview);
  });
  _updateQuotePreview();
})();

function _orderDateToISO(str) {
  if (!str || str === 'TBD') return '';
  const p = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (p) {
    const m = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const mo = m[p[2].toLowerCase().substring(0,3)];
    if (mo) return p[3]+'-'+mo+'-'+p[1].padStart(2,'0');
  }
  try { const d = new Date(str); return !isNaN(+d) ? d.toISOString().split('T')[0] : ''; } catch(e) { return ''; }
}

function _relativeDate(dateStr) {
  if (!dateStr || dateStr === 'TBD') return null;
  const d = new Date(dateStr);
  if (isNaN(+d)) return null;
  const today = new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
  const diff = Math.round((+d - +today) / 86400000);
  if (diff === 0) return { label: 'Today', color: 'var(--warn)' };
  if (diff === 1) return { label: 'Tomorrow', color: 'var(--success)' };
  if (diff > 1 && diff <= 7) return { label: `in ${diff} days`, color: 'var(--success)' };
  if (diff > 7 && diff <= 30) return { label: `in ${diff} days`, color: 'var(--text2)' };
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, color: 'var(--danger)' };
  return null;
}

function _updateQuotePreview() {
  const cur = window.currency;
  const fmt = v => cur + v.toLocaleString('en-US', {minimumFractionDigits:0, maximumFractionDigits:0});
  /** @param {string} id */
  const inputVal = id => /** @type {HTMLInputElement | null} */ (document.getElementById(id))?.value;
  const rate = parseFloat(inputVal('q-labour-rate')) || 0;
  const hrs  = parseFloat(inputVal('q-hours'))       || 0;
  const mat  = parseFloat(inputVal('q-materials'))   || 0;
  const mkp  = parseFloat(inputVal('q-markup'))      || 0;
  const tax  = parseFloat(inputVal('q-tax'))         || 0;
  const labour = rate * hrs;
  const sub    = labour + mat;
  const total  = sub * (1 + mkp/100) * (1 + tax/100);
  const prev   = document.getElementById('quote-form-preview');
  if (!prev) return;
  if (sub === 0) { prev.style.display = 'none'; return; }
  prev.style.display = '';
  const markupAmt = sub * mkp / 100;
  const afterMarkup = sub + markupAmt;
  const taxAmt = afterMarkup * tax / 100;
  document.getElementById('qfp-labour').textContent    = `${hrs}h @ ${cur}${rate}/hr = ${fmt(labour)}`;
  document.getElementById('qfp-materials').textContent = fmt(mat);
  document.getElementById('qfp-markup-label').textContent = `Markup (${mkp}%)`;
  document.getElementById('qfp-markup').textContent = `+${fmt(markupAmt)}`;
  document.getElementById('qfp-tax-label').textContent = `Tax (${tax}%)`;
  document.getElementById('qfp-tax').textContent = `+${fmt(taxAmt)}`;
  document.getElementById('qfp-total').textContent     = fmt(afterMarkup + taxAmt);
}

