// ProCabinet — Settings cluster (carved out of src/app.js in phase E carve 12).
// Bundles 6 small adjacent sections that share the "non-domain plumbing" theme:
// GLOBALS (window.currency / window.units defaults), SETTINGS DROPDOWN,
// THEME TOGGLE (`let darkMode`), UNITS, CURRENCY, and SECTION NAVIGATION
// (`switchSection`).
//
// Loaded as a classic <script defer> BEFORE src/app.js. Reasons:
//   - State-bearing (`let darkMode`)
//   - Three top-level IIFEs run at script-load time (theme/units/currency
//     init from localStorage). They call setTheme/setUnits/setCurrency,
//     which call renderStockMain/renderQuoteMain/renderOrdersMain wrapped
//     in try/catch. Loading before app.js means those render calls
//     no-op at IIFE time (their bindings don't yet exist), so app.js's
//     INIT block does the single canonical render once it loads — the
//     try/catch was only there because of the race in the original
//     monolithic-file ordering.
//
// Cross-file dependencies referenced from this file's functions:
//   - sheets, pieces (state in app.js's CUTLIST section, used in setUnits
//     for unit conversion), renderSheets, renderPieces (app.js CUTLIST)
//   - renderStockMain (app.js STOCK), renderQuoteMain (src/quotes.js),
//     renderOrdersMain (src/orders.js), renderDashboard / drawRevenueChart
//     (src/dashboard.js), renderSchedule (src/schedule.js),
//     renderProjectsMain (src/projects.js), renderClientsMain
//     (src/clients.js), renderCBPanel (app.js CABINET BUILDER) — all
//     called only at runtime via switchSection or user-triggered settings
//     changes.

// ══════════════════════════════════════════
// GLOBALS
// ══════════════════════════════════════════
window.currency = '$';
window.units = 'imperial';

// ══════════════════════════════════════════
// SETTINGS DROPDOWN
// ══════════════════════════════════════════
function toggleSettings() {
  /** @type {HTMLElement} */ (document.getElementById('settings-dropdown')).classList.toggle('open');
  /** @type {HTMLElement} */ (document.getElementById('account-dropdown')).classList.remove('open');
}
function toggleAccount() {
  /** @type {HTMLElement} */ (document.getElementById('account-dropdown')).classList.toggle('open');
  /** @type {HTMLElement} */ (document.getElementById('settings-dropdown')).classList.remove('open');
}

document.addEventListener('click', function(e) {
  const target = /** @type {Node | null} */ (e.target);
  if (target && !document.querySelector('.settings-wrap')?.contains(target))
    document.getElementById('settings-dropdown')?.classList.remove('open');
  if (target && !document.querySelector('.account-wrap')?.contains(target))
    document.getElementById('account-dropdown')?.classList.remove('open');
});

// ══════════════════════════════════════════
// THEME TOGGLE
// ══════════════════════════════════════════
let darkMode = false;

/** @param {boolean} dark */
function setTheme(dark) {
  darkMode = dark;
  document.documentElement.classList.toggle('dark', darkMode);
  localStorage.setItem('pcDark', darkMode ? '1' : '0');
  const lbl = document.getElementById('sd-theme-label');
  if (lbl) lbl.textContent = darkMode ? 'Dark Mode' : 'Light Mode';
  const tl = document.getElementById('toggle-light'), td = document.getElementById('toggle-dark');
  if (tl) tl.classList.toggle('active', !darkMode);
  if (td) td.classList.toggle('active', darkMode);
}

function toggleTheme() {
  setTheme(!darkMode);
}

(function() {
  if (localStorage.getItem('pcDark') === '1') {
    setTheme(true);
  }
})();

// ══════════════════════════════════════════
// UNITS
// ══════════════════════════════════════════
/** @param {string} u */
function setUnits(u) {
  const prevUnits = window.units;
  window.units = u;
  localStorage.setItem('pcUnits', u);
  const uiEl = document.getElementById('unit-imperial'), umEl = document.getElementById('unit-metric');
  if (uiEl) uiEl.classList.toggle('active', u === 'imperial');
  if (umEl) umEl.classList.toggle('active', u === 'metric');

  const m = u === 'metric';

  // Reset format mode to match the new unit system
  if (prevUnits !== u) {
    const mode = window.unitFormat.mode;
    if (m && (mode === 'decimal' || mode === 'fractional' || mode === 'feetInches')) {
      window.unitFormat.mode = 'mm';
      _saveUnitFormat();
    } else if (!m && (mode === 'mm' || mode === 'cm' || mode === 'm')) {
      window.unitFormat.mode = 'decimal';
      _saveUnitFormat();
    }
  }

  // Sync unit pills (settings bar + layout toolbar)
  document.querySelectorAll('#cl-unit-in').forEach(el => el.classList.toggle('active', !m));
  document.querySelectorAll('#cl-unit-mm').forEach(el => el.classList.toggle('active', m));

  // Stock form defaults
  const stW = /** @type {HTMLInputElement | null} */ (document.getElementById('stock-w'));
  const stH = /** @type {HTMLInputElement | null} */ (document.getElementById('stock-h'));
  const stN = /** @type {HTMLInputElement | null} */ (document.getElementById('stock-name'));
  if (stW) stW.value = String(m ? 2440 : 96);
  if (stH) stH.value = String(m ? 1220 : 48);
  if (stN && !stN.value) stN.placeholder = m ? 'e.g. 18mm Birch Plywood' : 'e.g. 3/4" Birch Plywood';

  // Convert existing sheets and pieces only when actually changing unit
  if (prevUnits && prevUnits !== u) {
    try {
      sheets.forEach(s => {
        s.w = convertDim(s.w, prevUnits, u);
        s.h = convertDim(s.h, prevUnits, u);
      });
      renderSheets();
    } catch(e) {}
    try {
      pieces.forEach(p => {
        p.w = convertDim(p.w, prevUnits, u);
        p.h = convertDim(p.h, prevUnits, u);
      });
      renderPieces();
    } catch(e) {}
  }

  _syncUnitFormatUI();
  try { renderStockMain(); renderQuoteMain(); renderOrdersMain(); } catch(e) {}
}

(function() {
  const saved = localStorage.getItem('pcUnits');
  if (saved) {
    setUnits(saved);
  } else {
    const lang = navigator.language || 'en-US';
    const imperialLocales = ['en-US', 'en-CA', 'en-AU'];
    const isImperial = imperialLocales.some(l => lang.startsWith(l.split('-')[0]) && lang.includes(l.split('-')[1]));
    setUnits(isImperial ? 'imperial' : 'metric');
  }
})();

// ══════════════════════════════════════════
// UNIT FORMAT
// ══════════════════════════════════════════
/** @param {string} mode */
function setUnitFormat(mode) {
  window.unitFormat.mode = mode;
  _saveUnitFormat();
  _syncUnitFormatUI();
  _rerenderAll();
}
/** @param {number} n */
function setUnitDecimals(n) {
  window.unitFormat.decimals = n;
  _saveUnitFormat();
  _syncUnitFormatUI();
  _rerenderAll();
}
/** @param {number} d */
function setUnitDenom(d) {
  window.unitFormat.denominator = d;
  _saveUnitFormat();
  _syncUnitFormatUI();
  _rerenderAll();
}

function _saveUnitFormat() {
  localStorage.setItem('pcUnitFormat', JSON.stringify(window.unitFormat));
  try { saveBizInfo(); } catch(e) {}
}
function _loadUnitFormat() {
  try {
    const saved = JSON.parse(localStorage.getItem('pcUnitFormat') || '');
    if (saved) Object.assign(window.unitFormat, saved);
  } catch(e) {}
}
function _syncUnitFormatUI() {
  const sec = document.getElementById('unit-format-section');
  if (!sec) return;
  sec.style.display = '';

  const isMetric = window.units === 'metric';
  const mode = window.unitFormat.mode;

  const impRow = document.getElementById('uf-imperial-row');
  const metRow = document.getElementById('uf-metric-row');
  if (impRow) impRow.style.display = isMetric ? 'none' : '';
  if (metRow) metRow.style.display = isMetric ? '' : 'none';

  // Imperial format pills
  /** @type {Record<string, string>} */
  const impIds = { decimal: 'uf-decimal', fractional: 'uf-frac', feetInches: 'uf-ft' };
  Object.entries(impIds).forEach(([m, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', mode === m);
  });

  // Metric format pills
  /** @type {Record<string, string>} */
  const metIds = { mm: 'uf-mm', cm: 'uf-cm', m: 'uf-m' };
  Object.entries(metIds).forEach(([m, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', mode === m);
  });

  const showDecimals = mode === 'decimal' || mode === 'mm' || mode === 'cm' || mode === 'm';
  const dpRow = document.getElementById('uf-decimals-row');
  const dnRow = document.getElementById('uf-denom-row');
  if (dpRow) dpRow.style.display = showDecimals ? '' : 'none';
  if (dnRow) dnRow.style.display = showDecimals ? 'none' : '';

  [0, 1, 2].forEach(n => {
    const el = document.getElementById('uf-dp' + n);
    if (el) el.classList.toggle('active', window.unitFormat.decimals === n);
  });
  [4, 8, 16, 32, 64].forEach(d => {
    const el = document.getElementById('uf-d' + d);
    if (el) el.classList.toggle('active', window.unitFormat.denominator === d);
  });
}

function _rerenderAll() {
  try { renderSheets(); renderPieces(); } catch(e) {}
  try { renderStockMain(); renderQuoteMain(); renderOrdersMain(); } catch(e) {}
  try { renderCBPanel(); } catch(e) {}
}

(function() { _loadUnitFormat(); _syncUnitFormatUI(); })();

// ══════════════════════════════════════════
// CURRENCY
// ══════════════════════════════════════════
const EURO_LOCALES = ['de','fr','es','it','nl','pt','fi','el','cs','sk','sl','hr','bg','ro','hu','lv','lt','et','mt','ga'];

/** @param {string} c */
function setCurrency(c) {
  window.currency = c;
  localStorage.setItem('pcCurrency', c);
  const curMap = { '$': 'cur-usd', '£': 'cur-gbp', '€': 'cur-eur', 'A$': 'cur-aud' };
  Object.entries(curMap).forEach(([sym, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', c === sym);
  });
  try { renderStockMain(); renderQuoteMain(); renderOrdersMain(); } catch(e) {}
}

(function() {
  const saved = localStorage.getItem('pcCurrency');
  if (saved) {
    setCurrency(saved);
    return;
  }
  const lang = navigator.language || 'en-US';
  if (lang === 'en-GB' || lang.startsWith('en-GB')) {
    setCurrency('£');
  } else if (EURO_LOCALES.some(l => lang.startsWith(l))) {
    setCurrency('€');
  } else {
    setCurrency('$');
  }
})();

// ══════════════════════════════════════════
// SECTION NAVIGATION
// ══════════════════════════════════════════
/** @param {string} name */
function switchSection(name) {
  document.querySelectorAll('.nav-tab').forEach((t,i) => {
    const sections = ['dashboard','cutlist','stock','cabinet','quote','orders','schedule','projects','clients'];
    t.classList.toggle('active', sections[i] === name);
  });
  document.querySelectorAll('.section-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'panel-' + name);
  });
  if (name === 'cabinet') { try { renderCBPanel(); } catch(e) {} }
  if (name === 'stock') {
    if (typeof _stockMaybeResetFormFlag === 'function') _stockMaybeResetFormFlag();
    renderStockMain();
  }
  if (name === 'quote') { renderQuoteMain(); if (typeof renderQuoteEditor === 'function') renderQuoteEditor(); }
  if (name === 'orders') { renderOrdersMain(); if (typeof renderOrderEditor === 'function') renderOrderEditor(); }
  if (name === 'schedule') renderSchedule();
  if (name === 'dashboard') { renderDashboard(); setTimeout(drawRevenueChart, 0); }
  if (name === 'projects') {
    // U.9: refresh cut-list project membership so counts stay fresh after
    // saving/clearing a cut list elsewhere in the session.
    if (typeof _loadCutListProjectIds === 'function') _loadCutListProjectIds();
    if (typeof _projectsMaybeResetFormFlag === 'function') _projectsMaybeResetFormFlag();
    renderProjectsMain();
  }
  if (name === 'clients') {
    if (typeof _clientsMaybeResetFormFlag === 'function') _clientsMaybeResetFormFlag();
    renderClientsMain();
  }
}

