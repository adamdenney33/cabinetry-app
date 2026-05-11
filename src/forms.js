// ProCabinet — Quote-form defaults + date helpers (carved out of src/app.js
// in phase E carve 10).
//
// Loaded as a classic <script defer> BEFORE src/orders.js (and therefore
// before src/app.js). The Supabase initial-session microtask fires between
// app.js and the defer scripts that follow it, so `_relativeDate` and
// `_orderDateToISO` must already be defined when loadAllData → renderOrdersMain
// runs from that callback.
//
// The legacy aggregate quote-form preview (Materials Cost / Labour Rate /
// Hours fed `_updateQuotePreview`) was removed in the line-items rewrite.
// Itemisation now happens entirely in the quote popup; the sidebar form is
// just client / project / notes / markup / tax.

(function() {
  // Persist markup + tax defaults across sessions so each new user keeps
  // their preferred values.
  const defs = { 'q-markup': 20, 'q-tax': 13 };
  Object.entries(defs).forEach(([id, fallback]) => {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    if (!el) return;
    const saved = localStorage.getItem('pc_' + id);
    if (saved !== null) el.value = saved;
    el.addEventListener('change', () => { localStorage.setItem('pc_' + id, el.value); });
  });
})();

/** @param {string} str */
function _orderDateToISO(str) {
  if (!str || str === 'TBD') return '';
  const p = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (p) {
    /** @type {Record<string, string>} */
    const m = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const mo = m[p[2].toLowerCase().substring(0,3)];
    if (mo) return p[3]+'-'+mo+'-'+p[1].padStart(2,'0');
  }
  try { const d = new Date(str); return !isNaN(+d) ? d.toISOString().split('T')[0] : ''; } catch(e) { return ''; }
}

/** @param {string} dateStr */
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
