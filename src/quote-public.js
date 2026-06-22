// ProCabinet — PUBLIC live quote page (/q/<token>). Standalone ES module entry
// for q.html — does NOT load the authed app. Reads only the publishable env,
// talks to the token-scoped edge functions (quote-public-get / -update), and
// renders the customer-facing proposal (Direction C layout). It only ever
// receives customer-safe figures (per-line `customer_price`), never the
// business's cost inputs.
//
// Scope: view + photos + optional-item toggle (live reprice) + spec edit
// (stored; price re-confirmed by the business) + accept + card deposit via
// Stripe Connect (direct charge on the maker's connected account).

/** @type {string} */
const SBURL = import.meta.env.VITE_SUPABASE_URL;
/** @type {string} */
const SBKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** @param {string} s */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
/** @param {string} id @returns {HTMLElement} */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Map a raw edge-function error code to a calm, customer-readable sentence.
 *  Customers should never see things like "HTTP 500" or "rate_limited".
 *  @param {unknown} e @param {string} [fallback] */
function friendlyError(e, fallback) {
  const m = (e && /** @type {any} */ (e).message) || String(e || '');
  const map = /** @type {Record<string,string>} */ ({
    not_found: 'This link is no longer valid — please ask for a fresh one.',
    expired: 'This quote has expired. Please ask for an updated link.',
    closed: 'This quote is closed.',
    already_accepted: 'This quote has already been accepted.',
    selection_disabled: "This quote's items can't be changed.",
    editing_disabled: "Spec changes aren't enabled on this quote.",
    line_locked: "That item can't be changed.",
    payments_disabled: 'Card payment is turned off for this quote.',
    payments_unavailable: 'Card payment is being set up — your maker will be in touch to take payment.',
    rate_limited: "You're sending messages a little fast — please wait a moment and try again.",
    nothing_to_pay: 'There’s nothing to pay on this quote.',
    price_pending: 'An updated price is being confirmed after your change — payment unlocks once it’s ready.',
  });
  if (map[m]) return map[m];
  if (/_out_of_range$/.test(m)) return 'That value is outside the allowed range — please try something closer to the original.';
  if (/_not_allowed$/.test(m)) return 'That option isn’t available — please pick one from the list.';
  return fallback || 'Something went wrong. Please refresh the page and try again.';
}

let _toastTimer = /** @type {any} */ (null);
/** Page-styled toast — replaces native alert() (jarring on a payment page).
 *  @param {string} msg @param {boolean} [isErr] */
function toast(msg, isErr = true) {
  let el = document.getElementById('qp-toast');
  if (!el) { el = document.createElement('div'); el.id = 'qp-toast'; document.body.appendChild(el); }
  el.className = 'qp-toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  // restart the transition
  requestAnimationFrame(() => el.classList.add('show'));
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 4600);
}

function getToken() {
  const u = new URL(location.href);
  const q = u.searchParams.get('t') || u.searchParams.get('token');
  if (q) return q;
  const m = u.pathname.match(/\/q\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

/** @param {string} name @param {Record<string, unknown>} body @returns {Promise<any>} */
async function fn(name, body) {
  const res = await fetch(`${SBURL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'apikey': SBKEY, 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  /** @type {any} */
  let payload = {};
  try { payload = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) throw new Error(payload.error || `HTTP ${res.status}`);
  return payload;
}

// ── state ────────────────────────────────────────────────────────────────────
const token = getToken();
// `?biz=1` = the business previewing the page inside the app. The customer's own
// chat widget is suppressed (the app overlays its own business-side launcher).
const isBiz = new URLSearchParams(location.search).get('biz') === '1';
/** @type {any} */ let D = null;        // full get() payload
/** @type {any[]} */ let lines = [];    // mutable line state
/** @type {Record<number, string[]>} */ let photosByLine = {};
let cur = '£';
// Dimension display follows the MAKER's unit preference (from the business
// profile), not the viewer's — so an imperial maker's live link reads in
// inches, matching their PDF. Self-contained here: the public page is a
// standalone module and deliberately does not load the authed app's units.js.
let unitSys = 'metric';
const unitFmt = { mode: 'mm', decimals: 0, denominator: 16 };
/** Buffered spec-editor changes, keyed by line id -- sent only on Send edits. */
/** @type {Record<number, Record<string, unknown>>} */ const pendingEdits = {};
/** Original line values saved when a spec editor opens, for cancel/revert. */
/** @type {Record<number, Record<string, unknown>>} */ const originalValues = {};

/** @param {number} n */
function money(n) {
  const v = Number(n) || 0;
  const dp = Math.round(v) === v ? 0 : 2;
  return cur + v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: 2 });
}

// ── dimensions: mm is the canonical store; render/parse in the maker's unit ───
/** @param {number} a @param {number} b @returns {number} */
function _gcd(a, b) { return b === 0 ? a : _gcd(b, a % b); }
/** @param {number} val @param {number} denom */
function _toFraction(val, denom) {
  const sign = val < 0 ? '-' : ''; val = Math.abs(val);
  const whole = Math.floor(val);
  let n = Math.round((val - whole) * denom);
  if (n === 0) return sign + String(whole || '0');
  if (n === denom) return sign + String(whole + 1);
  const g = _gcd(n, denom);
  return whole > 0 ? `${sign}${whole} ${n / g}/${denom / g}` : `${sign}${n / g}/${denom / g}`;
}
/** @param {number} val @param {number} denom */
function _toFeetInches(val, denom) {
  const sign = val < 0 ? '-' : ''; val = Math.abs(val);
  let feet = Math.floor(val / 12);
  let inchStr = _toFraction(val - feet * 12, denom);
  if (parseFloat(inchStr) >= 12) { feet++; inchStr = '0'; }
  return feet === 0 ? `${sign}${inchStr}"` : `${sign}${feet}' ${inchStr}"`;
}
/** Format an mm-stored dimension in the maker's unit (no unit suffix).
 *  @param {number|string|null|undefined} mm @returns {string} */
function fmtDim(mm) {
  if (mm == null || mm === '' || isNaN(Number(mm))) return '';
  let v = Number(mm);
  if (unitSys === 'imperial') {
    v = v / 25.4;
    if (unitFmt.mode === 'fractional') return _toFraction(v, unitFmt.denominator || 16);
    if (unitFmt.mode === 'feetInches') return _toFeetInches(v, unitFmt.denominator || 16);
    return v.toFixed(unitFmt.decimals || 0);
  }
  if (unitFmt.mode === 'cm') return (v / 10).toFixed(unitFmt.decimals || 0);
  if (unitFmt.mode === 'm') return (v / 1000).toFixed(unitFmt.decimals || 0);
  return v.toFixed(unitFmt.decimals || 0);
}
/** Active unit label for headings/suffixes. @returns {string} */
function unitLbl() {
  if (unitSys === 'imperial') return unitFmt.mode === 'feetInches' ? 'ft/in' : 'in';
  return unitFmt.mode === 'cm' ? 'cm' : unitFmt.mode === 'm' ? 'm' : 'mm';
}
/** "W × H × D <unit>" for mm-stored dims; blank dims dropped.
 *  @param {any} w @param {any} h @param {any} d @returns {string} */
function dimsLabel(w, h, d) {
  const p = [w, h, d].filter((v) => v != null && v !== '' && !isNaN(Number(v))).map(fmtDim);
  return p.length ? p.join(' × ') + ' ' + unitLbl() : '';
}
/** @param {string} s @returns {number} */
function _inchish(s) {
  const mixed = s.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseFloat(mixed[1]) + parseFloat(mixed[2]) / parseFloat(mixed[3]);
  const frac = s.match(/^(-?\d+)\/(\d+)$/);
  if (frac) return parseFloat(frac[1]) / parseFloat(frac[2]);
  return parseFloat(s) || 0;
}
/** Parse a maker-unit dimension string (incl. fractions / feet-inches) to mm.
 *  @param {string|number} str @returns {number} */
function parseDimToMm(str) {
  if (typeof str === 'number') return unitSys === 'imperial' ? str * 25.4 : str;
  let s = String(str).trim();
  if (!s) return 0;
  const ft = s.match(/^(\d+)[′'']\s*(.*)$/);
  if (ft) {
    const rest = ft[2].replace(/["″]/g, '').trim();
    return (parseFloat(ft[1]) * 12 + (rest ? _inchish(rest) : 0)) * 25.4;
  }
  s = s.replace(/["″]/g, '').replace(/\s*(?:mm|cm|in|m)$/i, '').trim();
  const v = _inchish(s);
  if (unitSys === 'imperial') return v * 25.4;
  if (unitFmt.mode === 'cm') return v * 10;
  if (unitFmt.mode === 'm') return v * 1000;
  return v;
}

function totals() {
  let subtotal = 0, pending = 0;
  for (const l of lines) {
    if (!l.customer_included) continue;
    if (l._pending || l.customer_price == null) { pending++; continue; }
    subtotal += Number(l.customer_price) || 0;
  }
  const taxPct = Number(D?.quote?.tax) || 0;
  const tax = subtotal * taxPct / 100;
  const total = subtotal + tax;
  const depPct = Number(D?.settings?.deposit_pct) || 0;
  const deposit = total * depPct / 100;
  return { subtotal, tax, taxPct, total, deposit, balance: total - deposit, depPct, pending };
}

// ── document building blocks (header / addressee / greeting / items) ──────────
/** @returns {string} */
function bizName() { return (D && D.business && D.business.name) || 'Your cabinetmaker'; }
/** Capitalise each word. @param {string} s */
function cap(s) { return String(s || '').replace(/\b\w/g, (c) => c.toUpperCase()); }
/** Format an ISO date (YYYY-MM-DD) as "18 June 2026"; pass other strings through.
 *  @param {string|null|undefined} s */
function niceDate(s) {
  const str = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(str)) return str;
  const d = new Date(str.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? str : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
/** Cabinet spec one-liner (dims · material · finish · doors · drawers), raw text.
 *  @param {any} l */
function cabinetSpecText(l) {
  const parts = [];
  if (l.w_mm || l.h_mm || l.d_mm) parts.push(dimsLabel(l.w_mm, l.h_mm, l.d_mm));
  if (l.material) parts.push(l.material);
  if (l.finish && l.finish !== 'None') parts.push(l.finish);
  if ((l.door_count || 0) > 0) parts.push(`${l.door_count} door${l.door_count !== 1 ? 's' : ''}`);
  if ((l.drawer_count || 0) > 0) parts.push(`${l.drawer_count} drawer${l.drawer_count !== 1 ? 's' : ''}`);
  return parts.join(' · ');
}
/** Status stamp (right of the document title / top of the rail). */
function stampHtml() {
  const isOrder = D?.kind === 'order';
  const q = D?.quote || {};
  const accepted = !!q.accepted_at;
  const txt = isOrder ? cap(String(q.status || 'order').replace(/_/g, ' ')) : (accepted ? 'Accepted' : 'Awaiting approval');
  return `<div class="qpd-stamp${accepted || isOrder ? ' ok' : ''}"><span class="dot"></span> ${esc(txt)}</div>`;
}
/** Document header: business banner (left) + title / ref / status (right). */
function docHead() {
  const b = D?.business || {};
  const isOrder = D?.kind === 'order';
  const q = D?.quote || {};
  // Every reachable contact is a trust signal on a page asking for money.
  const sub = [b.address, b.phone, b.email].filter(Boolean).map(esc).join('  ·  ');
  const meta = [q.number ? '#' + esc(q.number) : '', q.date ? esc(niceDate(q.date)) : ''].filter(Boolean).join('  ·  ');
  const logo = b.logo_url ? `<img class="qpd-logo" src="${esc(b.logo_url)}" alt="${esc(bizName())} logo">` : '';
  return `<div class="qpd-head">
      <div>${logo}<div class="qpd-bizname">${esc(bizName())}</div>${sub ? `<div class="qpd-bizsub">${sub}</div>` : ''}</div>
      <div class="qpd-titlewrap">
        <div class="qpd-title">${isOrder ? 'Order' : 'Quote'}</div>
        ${meta ? `<div class="qpd-meta">${meta}</div>` : ''}
        ${stampHtml()}
      </div>
    </div>`;
}
/** PREPARED FOR / ISSUED block. */
function addrBlock() {
  const isOrder = D?.kind === 'order';
  const q = D?.quote || {};
  const cn = D?.client?.name ? esc(D.client.name) : '—';
  const exp = D?.settings?.expires_at;
  return `<div class="qpd-addr">
      <div><div class="qpd-lab">Prepared for</div><div class="qpd-an">${cn}</div></div>
      <div><div class="qpd-lab">${isOrder ? 'Created' : 'Issued'}</div><div class="qpd-an sm">${esc(niceDate(q.date) || '—')}</div>${(!isOrder && exp) ? `<div class="qpd-aline">Valid until ${esc(niceDate(exp))}</div>` : ''}</div>
    </div>`;
}
/** Personalised greeting line. */
function greet() {
  if (D?.kind === 'order') return `<div class="qpd-greet">This is your confirmed order — no action needed. Review the details below, download a copy, or message us any time.</div>`;
  const name = (D?.client?.name || '').split(/[ &]/)[0] || 'there';
  const biz = D?.business?.name ? ` from <strong>${esc(D.business.name)}</strong>` : '';
  const optCount = lines.filter((l) => l.optional).length;
  const bits = [];
  if (D?.settings?.allow_select && optCount >= 1) bits.push('Tick any optional items to include them.');
  if (D?.settings?.allow_edit) bits.push('Tap Edit on a line to request a change.');
  return `<div class="qpd-greet">Hi ${esc(name)} — here's your quote${biz}. ${bits.join(' ')}</div>`;
}
/** Group label for a line kind. @param {string} k */
function grpLabel(k) { return k === 'cabinet' ? 'Cabinets' : k === 'labour' ? 'Labour' : k === 'stock' ? 'Materials' : 'Items'; }
/** Grouped line-item table (header row + group headings + rows). */
function itemsHtml() {
  let html = `<div class="qpd-ihead"><span class="lab">Description</span><span class="qpd-nums"><span class="qpd-num qty">Qty</span><span class="qpd-num price">Price</span><span class="qpd-num amt">Amount</span></span></div>`;
  let lastG = '';
  for (const l of lines) {
    const g = l.line_kind || 'item';
    if (g !== lastG) { html += `<div class="qpd-grp">${esc(grpLabel(g))}</div>`; lastG = g; }
    html += row(l);
  }
  html += `<div class="qpd-items-foot"></div>`;
  return html;
}
/** Notes + VAT closing line at the foot of the document body. */
function closingHtml() {
  const q = D?.quote || {};
  const noun = D?.kind === 'order' ? 'order' : 'quote';
  const vat = Number(q.tax) > 0 ? `Total includes VAT (${Number(q.tax)}%).` : `No VAT applies to this ${noun}.`;
  return `<div class="qpd-closing">${q.notes ? esc(q.notes) + ' · ' : ''}${vat}</div>`;
}
/** Brand line shown above the success / error state cards (was the top bar). */
function stateBrand() { return D?.business?.name ? `<div class="qp-statebrand">${esc(D.business.name)}</div>` : ''; }

// ── line row (document table row) ────────────────────────────────────────────
/** @param {any} l */
function row(l) {
  const accepted = !!D?.quote?.accepted_at;
  const photos = photosByLine[l.id] || [];
  const photo = photos.length
    ? `<button type="button" class="qp-photo" onclick="__qp.openPhotos(${l.id},0)" aria-label="View ${photos.length > 1 ? photos.length + ' photos' : 'photo'} of ${esc(l.name || 'this item')}"><img src="${esc(photos[0])}" alt="" loading="lazy">${photos.length > 1 ? `<span class="qp-photo-n">+${photos.length - 1}</span>` : ''}</button>`
    : '';
  const chips = [];
  if (l.optional && !accepted) chips.push('<span class="qpd-tag">Optional</span>');
  // Once accepted, the quote is locked server-side — don't render controls
  // that would only error with "already accepted".
  if (!accepted && (((l.editable_specs && l.editable_specs.length) || l.customer_editable)) && D?.settings?.allow_edit) chips.push(`<button class="qp-chip edit" onclick="__qp.toggleSpec(${l.id})">Edit</button>`);
  if (l._pending) chips.push('<span class="qp-chip pending">Price to confirm</span>');
  // Cabinet description mirrors the PDF (dims · material · finish · fronts).
  const spec = l.line_kind === 'cabinet' ? esc(cabinetSpecText(l)) : esc(l.notes || l.type || '');
  // Optional items get a document-style include checkbox (not a SaaS switch).
  const canSelect = l.optional && D?.settings?.allow_select && !accepted;
  const chk = canSelect
    ? `<button class="qpd-chk" aria-pressed="${!!l.customer_included}" aria-label="Include ${esc(l.name || 'this item')} in your ${D?.kind === 'order' ? 'order' : 'quote'}" onclick="__qp.toggle(${l.id})"><svg viewBox="0 0 12 12"><path d="M2 6l3 3 5-6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`
    : '';
  const qty = Number(l.qty) || 1;
  const total = l.customer_price;
  const unit = total != null ? Number(total) / (qty || 1) : null;
  const qtyCell = `<span class="qpd-num qty">${qty}</span>`;
  const priceCell = l._pending ? `<span class="qpd-num price">—</span>` : `<span class="qpd-num price">${unit != null ? money(unit) : '—'}</span>`;
  const amtCell = l._pending
    ? `<span class="qpd-num amt" style="color:var(--danger);font-size:11px">To confirm</span>`
    : `<span class="qpd-num amt">${total != null ? money(total) : '—'}</span>`;
  return `<div class="qpd-li${l.customer_included ? '' : ' off'}" id="qp-row-${l.id}">
      <div class="qpd-li-main">${chk}${photo}<div class="qpd-li-text">
        <div class="qpd-li-name">${esc(l.name || 'Item')}${chips.join('')}</div>
        <div class="qpd-li-spec">${spec}${qty > 1 ? ' · Qty ' + qty : ''}</div>
        <div id="qp-spec-${l.id}" style="display:none"></div>
      </div></div>
      <span class="qpd-li-nums">${qtyCell}${priceCell}${amtCell}</span>
    </div>`;
}

/** @param {any} l */
function specEditor(l) {
  const specs = (Array.isArray(l.editable_specs) && l.editable_specs.length)
    ? l.editable_specs
    : (l.customer_editable ? ['dims', 'finish'] : []);   // legacy lines: the old dims+finish editor
  /** @param {string[]} list @param {string} cur */
  const optList = (list, cur) => {
    const opts = (list && list.length ? list.slice() : []);
    if (cur && !opts.includes(cur)) opts.unshift(cur);
    return (opts.length ? opts : ['']).map((/** @type {string} */ o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('');
  };
  /** @param {string} label @param {any} val @param {number} min @param {number} max @param {string} col @param {string} unit */
  const num = (label, val, min, max, col, unit) =>
    `<div class="r"><label>${label}</label><input type="number" value="${val != null ? val : ''}" min="${min}" max="${max}" step="${unit === 'mm' ? 10 : 1}" style="width:${unit ? 84 : 64}px" onchange="__qp.setField(${l.id},'${col}',this.value)">${unit ? ` <span style="font-size:11px;color:var(--muted)">${unit}</span>` : ''}<span class="qp-range">${min}–${max}${unit ? unit : ''}</span></div>`;
  // Dimension row: shown + entered in the maker's unit (mm canonical underneath).
  // Text input so fractional inches are typable; setField converts back to mm.
  /** @param {string} label @param {any} mm @param {number} minMm @param {number} maxMm @param {string} col */
  const dimRow = (label, mm, minMm, maxMm, col) =>
    `<div class="r"><label>${label}</label><input type="text" inputmode="decimal" value="${fmtDim(mm)}" style="width:84px" onchange="__qp.setField(${l.id},'${col}',this.value)"> <span style="font-size:11px;color:var(--muted)">${unitLbl()}</span><span class="qp-range">${fmtDim(minMm)}–${fmtDim(maxMm)}${unitLbl()}</span></div>`;
  /** @param {string} label @param {string[]} opts @param {string} cur @param {string} col */
  const sel = (label, opts, cur, col) =>
    `<div class="r"><label>${label}</label><select onchange="__qp.setField(${l.id},'${col}',this.value)" style="flex:1">${optList(opts, cur)}</select></div>`;
  /** @type {Array<{t:string, rows:string[]}>} */
  const sections = [];
  if (specs.includes('dims')) sections.push({ t: 'Dimensions', rows: [
    dimRow('Width', l.w_mm, 100, 3600, 'w_mm'),
    dimRow('Height', l.h_mm, 100, 3600, 'h_mm'),
    dimRow('Depth', l.d_mm, 100, 1200, 'd_mm'),
  ] });
  const carcass = [];
  if (specs.includes('material')) carcass.push(sel('Material', D?.materials || [], l.material, 'material'));
  if (specs.includes('finish')) carcass.push(sel('Finish', D?.finishes || [], l.finish, 'finish'));
  if (specs.includes('construction')) carcass.push(sel('Construction', D?.constructions || [], l.construction, 'construction'));
  if (specs.includes('base')) carcass.push(sel('Base', D?.baseTypes || [], l.base_type, 'base_type'));
  if (carcass.length) sections.push({ t: 'Carcass', rows: carcass });
  const door = [];
  if (specs.includes('doors')) door.push(num('Count', l.door_count, 0, 6, 'door_count', ''));
  if (specs.includes('doorPct')) door.push(num('Area', l.door_pct, 0, 100, 'door_pct', '%'));
  if (specs.includes('doorType')) door.push(sel('Style', D?.doorTypes || [], l.door_type, 'door_type'));
  if (specs.includes('doorMat')) door.push(sel('Material', D?.materials || [], l.door_material, 'door_material'));
  if (specs.includes('doorFinish')) door.push(sel('Finish', D?.finishes || [], l.door_finish, 'door_finish'));
  if (specs.includes('handle')) door.push(sel('Handle', D?.handles || [], l.door_handle, 'door_handle'));
  if (door.length) sections.push({ t: 'Doors', rows: door });
  const drawer = [];
  if (specs.includes('drawers')) drawer.push(num('Count', l.drawer_count, 0, 12, 'drawer_count', ''));
  if (specs.includes('drawerPct')) drawer.push(num('Area', l.drawer_pct, 0, 100, 'drawer_pct', '%'));
  if (specs.includes('drawerType')) drawer.push(sel('Style', D?.drawerFrontTypes || [], l.drawer_front_type, 'drawer_front_type'));
  if (specs.includes('drawerMat')) drawer.push(sel('Material', D?.materials || [], l.drawer_front_material, 'drawer_front_material'));
  if (specs.includes('drawerFinish')) drawer.push(sel('Finish', D?.finishes || [], l.drawer_front_finish, 'drawer_front_finish'));
  if (drawer.length) sections.push({ t: 'Drawers', rows: drawer });
  const storage = [];
  if (specs.includes('shelves')) storage.push(num('Fixed shelves', l.fixed_shelves, 0, 12, 'fixed_shelves', ''));
  if (specs.includes('adjShelves')) storage.push(num('Adjustable shelves', l.adj_shelves, 0, 12, 'adj_shelves', ''));
  if (specs.includes('looseShelves')) storage.push(num('Loose shelves', l.loose_shelves, 0, 12, 'loose_shelves', ''));
  if (specs.includes('partitions')) storage.push(num('Partitions', l.partitions, 0, 12, 'partitions', ''));
  if (specs.includes('endPanels')) storage.push(num('End panels', l.end_panels, 0, 12, 'end_panels', ''));
  if (storage.length) sections.push({ t: 'Shelves & panels', rows: storage });
  if (!sections.length) sections.push({ t: '', rows: [sel('Finish', D?.finishes || [], l.finish, 'finish')] });
  const body = sections.map(s => `${s.t ? `<div class="qp-spec-head">${s.t}</div>` : ''}${s.rows.join('')}`).join('');
  return `<div class="qp-spec">${body}
    <div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:10px">Adjust anything above, then press <strong>Send edits</strong> in the summary to submit your changes.</div>
  </div>`;
}

// ── totals / rail / action bar ───────────────────────────────────────────────
/** Decide which CTA the page shows, shared by the rail + mobile action bar.
 *  @returns {{kind:string, t:ReturnType<typeof totals>, label?:string, shortLabel?:string, hint?:string, disabled?:boolean}} */
function ctaState() {
  const t = totals();
  const isOrder = D?.kind === 'order';
  const accepted = !!D?.quote?.accepted_at;
  const payMode = !!D?.settings?.accept_payment;
  const editing = Object.keys(originalValues).length > 0;
  const hasPending = t.pending > 0;
  if (editing) return { kind: 'edit', t };
  if (isOrder) return { kind: 'order', t };
  if (accepted) return { kind: 'accepted', t };
  const label = payMode ? (t.depPct ? `Accept &amp; pay ${money(t.deposit)} deposit` : `Accept &amp; pay ${money(t.total)}`) : 'Accept this quote';
  const shortLabel = payMode ? (t.depPct ? 'Accept &amp; pay deposit' : 'Accept &amp; pay') : 'Accept quote';
  const hint = hasPending
    ? `Accepting unlocks once ${esc(bizName())} confirms the updated price${t.pending > 1 ? 's' : ''}.`
    : payMode
      ? (t.depPct ? `Pay a ${t.depPct}% deposit now to confirm — the ${money(t.balance)} balance is due on completion.` : 'Pay in full to confirm your quote.')
      : 'Confirms you’re happy to go ahead — your maker will be in touch about next steps and payment.';
  return { kind: payMode ? 'pay' : 'accept', label, shortLabel, hint, disabled: hasPending, t };
}
/** Primary CTA button(s). @param {ReturnType<typeof ctaState>} cs @param {boolean} compact */
function ctaHtml(cs, compact) {
  if (cs.kind === 'edit') {
    return `<div style="display:flex;gap:8px;margin-top:9px">
        <button class="qpd-b dark" style="flex:1" onclick="__qp.sendEdits()">Send edits</button>
        <button class="qpd-b ghost sm" onclick="__qp.cancelEdits()">Cancel</button>
      </div>${compact ? '' : `<div class="qpd-cta-hint">Sends your changes to ${esc(bizName())} — the updated price is confirmed before anything is charged.</div>`}`;
  }
  if (cs.kind === 'order') return '';
  if (cs.kind === 'accepted') return `<div class="qpd-accepted">✓ Accepted — thank you</div>`;
  const label = compact ? cs.shortLabel : cs.label;
  return `<button class="qpd-b dark" style="margin-top:9px"${cs.disabled ? ' disabled' : ''} onclick="${cs.kind === 'pay' ? '__qp.payDeposit()' : '__qp.confirmAccept()'}">${label}</button>${compact ? '' : `<div class="qpd-cta-hint">${cs.hint}</div>`}`;
}
/** Totals + black pill + deposit block shown in the document body (id qp-doctot). */
function docTotals() {
  const t = totals();
  const isOrder = D?.kind === 'order';
  // The discount is baked into each line price; show it back so the subtotal
  // reads pre-discount and the customer sees what they're saving.
  const discPct = Number(D?.quote?.discount) || 0;
  const preDiscount = discPct > 0 && discPct < 100 ? t.subtotal / (1 - discPct / 100) : t.subtotal;
  const saving = preDiscount - t.subtotal;
  return `<div class="qpd-tot">
      <div class="qpd-tline"><span>Subtotal</span><span class="v">${money(discPct > 0 ? preDiscount : t.subtotal)}</span></div>
      ${discPct > 0 ? `<div class="qpd-tline disc"><span>Discount (${discPct}%)</span><span class="v">− ${money(saving)}</span></div>` : ''}
      ${t.taxPct ? `<div class="qpd-tline"><span>VAT (${t.taxPct}%)</span><span class="v">+ ${money(t.tax)}</span></div>` : ''}
    </div>
    <div class="qpd-pill"><span class="pl">${isOrder ? 'Order' : 'Quote'} total</span><span class="pa">${money(t.total)}${t.pending ? '+' : ''}</span></div>
    ${t.depPct ? `<div class="qpd-pay"><div class="qpd-pay-lab">Deposit to begin</div><div class="qpd-pay-amt">${money(t.deposit)}</div><div class="qpd-pay-bal">${t.depPct}% now · balance ${money(t.balance)} on completion</div></div>` : ''}
    ${t.pending ? `<div class="qpd-pendnote">${t.pending} item${t.pending > 1 ? 's' : ''} awaiting a confirmed price after your change — we’ll update this page.</div>` : ''}`;
}
/** Desktop checkout rail (hidden on mobile; the action bar takes over). */
function rail() {
  const cs = ctaState();
  const isOrder = D?.kind === 'order';
  return `${stampHtml()}
    <div class="rlab">${isOrder ? 'Order total' : 'Amount to approve'}</div>
    <div class="qpd-pill"><span class="pl">${isOrder ? 'Order' : 'Quote'} total</span><span class="pa">${money(cs.t.total)}${cs.t.pending ? '+' : ''}</span></div>
    ${cs.t.depPct ? `<div class="qpd-pay"><div class="qpd-pay-lab">Deposit to begin</div><div class="qpd-pay-amt">${money(cs.t.deposit)}</div><div class="qpd-pay-bal">${cs.t.depPct}% now · balance ${money(cs.t.balance)} on completion</div></div>` : ''}
    ${cs.t.pending ? `<div class="qpd-pendnote">${cs.t.pending} item${cs.t.pending > 1 ? 's' : ''} awaiting a confirmed price — we’ll update this page.</div>` : ''}
    ${ctaHtml(cs, false)}
    <button class="qpd-b ghost" onclick="__qp.downloadPdf()">↓ Download PDF</button>
    <div class="qpd-secure"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Payments secured by Stripe</div>`;
}
/** Mobile sticky action bar (hidden on desktop). */
function actionBar() {
  const cs = ctaState();
  if (cs.kind === 'edit') return `<button class="qpd-b dark" onclick="__qp.sendEdits()">Send edits</button><button class="qpd-b ghost" onclick="__qp.cancelEdits()">Cancel</button>`;
  if (cs.kind === 'accepted') return `<div class="qpd-accepted" style="flex:1;margin:0">✓ Accepted — thank you</div>`;
  if (cs.kind === 'order') return `<button class="qpd-b ghost" style="flex:1" onclick="__qp.downloadPdf()">↓ Download PDF</button>`;
  return `<button class="qpd-b ghost" onclick="__qp.downloadPdf()">↓ PDF</button><button class="qpd-b dark"${cs.disabled ? ' disabled' : ''} onclick="${cs.kind === 'pay' ? '__qp.payDeposit()' : '__qp.confirmAccept()'}">${cs.shortLabel}</button>`;
}
/** Re-render the three summary surfaces after a toggle / edit. */
function updateSummaries() {
  const dt = document.getElementById('qp-doctot'); if (dt) dt.innerHTML = docTotals();
  const r = document.getElementById('qp-rail'); if (r) r.innerHTML = rail();
  const a = document.getElementById('qp-actionbar'); if (a) a.innerHTML = actionBar();
}

// ── full render ──────────────────────────────────────────────────────────────
function render() {
  byId('qp-root').innerHTML = `
    <div class="qpd-desk"><div class="qpd-grid">
      <div class="qpd-paper">
        <div class="qpd-pad">
          ${docHead()}
          <div class="qpd-rule"></div>
          ${addrBlock()}
          ${greet()}
          <div class="qpd-items" id="qp-lines"></div>
          <div id="qp-doctot"></div>
          ${closingHtml()}
        </div>
        <div class="qpd-foot"><span>${esc(bizName())}${D?.quote?.date ? '  ·  ' + esc(niceDate(D.quote.date)) : ''}</span><span class="sec"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Secured by Stripe</span></div>
      </div>
      <div class="qpd-rail-wrap"><div class="qpd-rail" id="qp-rail"></div></div>
    </div></div>
    <div class="qpd-actionbar" id="qp-actionbar"></div>`;
  byId('qp-lines').innerHTML = itemsHtml();
  byId('qp-doctot').innerHTML = docTotals();
  byId('qp-rail').innerHTML = rail();
  byId('qp-actionbar').innerHTML = actionBar();
  mountChat();
}

/** @param {number} id */
function refreshLine(id) {
  const l = lines.find((x) => x.id === id);
  const el = byId('qp-row-' + id);
  if (l && el) el.outerHTML = row(l);
  updateSummaries();
}

// ── Stripe.js (loaded on demand for the pay flow) ────────────────────────────
async function loadStripe() {
  const w = /** @type {any} */ (window);
  if (w.Stripe) return w.Stripe;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3'; s.onload = () => resolve(null); s.onerror = reject;
    document.head.appendChild(s);
  });
  return w.Stripe;
}
async function recordAccept() {
  if (D?.quote?.accepted_at) return; // already recorded (server treats dupes as no-ops anyway)
  const t = totals();
  const snapshot = {
    lines: lines.filter((l) => l.customer_included).map((l) => ({ id: l.id, name: l.name, finish: l.finish, w_mm: l.w_mm, customer_price: l.customer_price })),
    totals: { subtotal: t.subtotal, tax: t.tax, total: t.total, deposit: t.deposit }, at: new Date().toISOString(),
  };
  try { await fn('quote-public-update', { token, action: 'accept', snapshot }); } catch (e) { /* best-effort */ }
}
/** @param {string} amountLabel @param {string} subline @param {() => void} onConfirm */
function openPaySheet(amountLabel, subline, onConfirm) {
  closePaySheet();
  const el = document.createElement('div');
  el.className = 'qp-overlay'; el.id = 'qp-pay';
  el.innerHTML = `<div class="qp-sheet">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong style="font-size:15px">Pay your deposit</strong><button onclick="__qp.closePay()" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted)">×</button></div>
    <div style="font-size:26px;font-weight:800;margin-bottom:2px">${amountLabel}</div>
    ${subline ? `<div style="font-size:12px;color:var(--muted);margin-bottom:12px">${subline}</div>` : '<div style="margin-bottom:12px"></div>'}
    <div id="qp-pay-el"></div>
    <div id="qp-pay-err" style="color:var(--danger);font-size:12px;margin-top:8px"></div>
    <button class="btn btn-primary btn-lg" id="qp-pay-btn" style="margin-top:12px">Pay ${amountLabel}</button>
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;color:var(--muted);margin-top:8px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Secured by Stripe</div>
  </div>`;
  document.body.appendChild(el);
  byId('qp-pay-btn').addEventListener('click', onConfirm);
}
function closePaySheet() { const e = document.getElementById('qp-pay'); if (e) e.remove(); }
/** Small "what happens next" panel shared by the accepted / paid states.
 *  @param {string[]} rows */
function nextStepsPanel(rows) {
  const biz = D.business || {};
  const contact = [biz.email, biz.phone].filter(Boolean).map(esc).join(' · ');
  return `<div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:16px;margin-top:20px;text-align:left;font-size:13px;color:var(--text2);line-height:1.5">
      <div style="font-weight:700;color:var(--text);margin-bottom:6px">What happens next</div>
      <ul style="margin:0;padding-left:18px">${rows.map((/** @type {string} */ r) => `<li>${r}</li>`).join('')}</ul>
    </div>
    ${contact ? `<div style="font-size:12px;color:var(--muted);margin-top:14px">Questions? Reach ${esc(biz.name || 'us')} at ${contact}, or message us on this page any time.</div>` : ''}`;
}
/** @param {any} pay */
function paidState(pay) {
  if (D.quote) D.quote.accepted_at = new Date().toISOString();
  const t = totals();
  const isDep = pay.kind === 'deposit';
  byId('qp-root').innerHTML = `${stateBrand()}<div class="qp-state">
    <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1 style="font-size:22px;font-weight:800;color:var(--text)">Payment received 🎉</h1>
    <p style="font-size:14px;margin-top:8px;color:var(--text2)">Your ${money(pay.amount)} ${isDep ? 'deposit' : 'payment'} is confirmed and your order is booked in.</p>
    ${nextStepsPanel([
      'A receipt is on its way to your email.',
      isDep && t.balance > 0 ? `The remaining ${money(t.balance)} balance is due on completion.` : 'This order is paid in full.',
      `${esc(D.business?.name || 'Your maker')} will be in touch to arrange the work.`,
    ])}
  </div>`;
}
/** Bank transfer chosen: the payment completes asynchronously when the funds
 *  land. Stripe has already shown the account-details modal — keep a way back
 *  to those details (hosted instructions) and say what happens next.
 *  @param {any} pay @param {any} pi */
function bankPendingState(pay, pi) {
  if (D.quote && !D.quote.accepted_at) D.quote.accepted_at = new Date().toISOString();
  const isDep = pay.kind === 'deposit';
  const url = (pi && pi.next_action && pi.next_action.display_bank_transfer_instructions
    && pi.next_action.display_bank_transfer_instructions.hosted_instructions_url) || '';
  byId('qp-root').innerHTML = `${stateBrand()}<div class="qp-state">
    <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V10"/><path d="M19 21V10"/><path d="M12 3L3 8h18l-9-5z"/><path d="M9 21v-7"/><path d="M15 21v-7"/></svg></div>
    <h1 style="font-size:22px;font-weight:800;color:var(--text)">One step left — send your bank transfer</h1>
    <p style="font-size:14px;margin-top:8px;color:var(--text2)">Transfer <strong>${money(pay.amount)}</strong> using the bank details from Stripe — your ${isDep ? 'deposit' : 'payment'} is confirmed automatically when it arrives.</p>
    ${url ? `<a class="btn btn-primary btn-lg" style="display:block;margin-top:16px;text-decoration:none;text-align:center" href="${esc(url)}" target="_blank" rel="noopener">View bank details ↗</a>` : ''}
    ${nextStepsPanel([
      'Send the exact amount shown, with the reference provided — that’s how the transfer is matched to your order.',
      'Transfers usually arrive within hours; your order is booked in automatically when the money lands.',
      `${esc(D.business?.name || 'Your maker')} will be in touch once the payment is confirmed.`,
    ])}
  </div>`;
}
/** Async payment still settling (e.g. Pay by bank) — the webhook confirms it.
 *  @param {any} pay */
function processingState(pay) {
  if (D.quote && !D.quote.accepted_at) D.quote.accepted_at = new Date().toISOString();
  const isDep = pay.kind === 'deposit';
  byId('qp-root').innerHTML = `${stateBrand()}<div class="qp-state">
    <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg></div>
    <h1 style="font-size:22px;font-weight:800;color:var(--text)">Payment processing</h1>
    <p style="font-size:14px;margin-top:8px;color:var(--text2)">Your ${money(pay.amount)} ${isDep ? 'deposit' : 'payment'} is on its way — your order is booked in as soon as it's confirmed.</p>
    ${nextStepsPanel([
      'This usually only takes a moment, but can take a little longer depending on your bank.',
      'You’ll get a receipt by email once the payment is confirmed.',
      `${esc(D.business?.name || 'Your maker')} will be in touch to arrange the work.`,
    ])}
  </div>`;
}

// ── live chat widget ─────────────────────────────────────────────────────────
/** @type {Array<{sender:string,body:string}>} */ let _chatMsgs = [];
function mountChat() {
  if (isBiz || !D || !D.business || document.getElementById('qp-chat-launcher')) return;
  const b = document.createElement('button');
  b.id = 'qp-chat-launcher'; b.className = 'qp-chat-launcher';
  b.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg> Message`;
  b.addEventListener('click', () => handlers.toggleChat());
  document.body.appendChild(b);
  const pop = document.createElement('div');
  pop.id = 'qp-chat-pop'; pop.className = 'qp-chat-pop';
  pop.innerHTML = `<div class="qp-chat-head"><span>${esc((D.business && D.business.name) || 'Message us')}</span><button onclick="__qp.toggleChat()" style="border:none;background:none;font-size:18px;cursor:pointer;color:var(--muted)">×</button></div>
    <div class="qp-chat-body" id="qp-chat-body"></div>
    <div class="qp-chat-foot"><input id="qp-chat-input" placeholder="Type a message…" onkeydown="if(event.key==='Enter')__qp.sendMsg()"><button class="btn btn-primary" style="width:auto;padding:8px 14px" onclick="__qp.sendMsg()">Send</button></div>`;
  document.body.appendChild(pop);
  renderMsgs();
}
function renderMsgs() {
  const body = document.getElementById('qp-chat-body'); if (!body) return;
  body.innerHTML = _chatMsgs.length
    ? _chatMsgs.map((m) => `<div class="qp-bub ${m.sender === 'customer' ? 'me' : 'them'}">${esc(m.body)}</div>`).join('')
    : `<div style="color:var(--muted);font-size:12px;text-align:center;margin:auto">Send ${esc((D.business && D.business.name) || 'us')} a message — replies appear here.</div>`;
  body.scrollTop = body.scrollHeight;
}

// ── photo viewer (lightbox) ──────────────────────────────────────────────────
// Opened by tapping a line's photo thumb. Shows every photo attached to that
// item with arrows / counter / thumb strip; Esc + arrow keys and touch swipe.
/** @type {string[]} */ let pvUrls = [];
let pvIdx = 0;

function pvRender() {
  const img = /** @type {HTMLImageElement|null} */ (document.getElementById('qp-pv-img'));
  if (!img) return;
  img.src = pvUrls[pvIdx] || '';
  const count = document.getElementById('qp-pv-count');
  if (count) count.textContent = (pvIdx + 1) + ' / ' + pvUrls.length;
  const thumbs = document.getElementById('qp-pv-thumbs');
  if (thumbs) [...thumbs.children].forEach((t, i) => t.classList.toggle('on', i === pvIdx));
  // Preload the neighbours so the arrows feel instant.
  [pvIdx + 1, pvIdx - 1].forEach((i) => {
    const u = pvUrls[(i + pvUrls.length) % pvUrls.length];
    if (u) { const pre = new Image(); pre.src = u; }
  });
}

/** @param {KeyboardEvent} e */
function pvKey(e) {
  if (e.key === 'Escape') handlers.closePhotos();
  else if (e.key === 'ArrowLeft') handlers.pvNav(-1);
  else if (e.key === 'ArrowRight') handlers.pvNav(1);
}

// ── interactions (attached to window for inline handlers) ────────────────────
const handlers = {
  /** Open the photo viewer on a line's photos. @param {number} lineId @param {number} [idx] */
  openPhotos(lineId, idx) {
    const photos = photosByLine[lineId] || [];
    if (!photos.length) return;
    handlers.closePhotos();
    const l = lines.find((x) => x.id === lineId);
    const name = (l && l.name) || 'Item';
    pvUrls = photos.slice();
    pvIdx = Math.min(Math.max(idx || 0, 0), pvUrls.length - 1);
    const multi = pvUrls.length > 1;
    const el = document.createElement('div');
    el.className = 'qp-pv'; el.id = 'qp-pv';
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', name + ' photos');
    el.innerHTML = `
      <div class="qp-pv-head"><span class="qp-pv-cap">${esc(name)}</span><button class="qp-pv-x" aria-label="Close photo viewer" onclick="__qp.closePhotos()">×</button></div>
      <div class="qp-pv-stage" id="qp-pv-stage">
        ${multi ? `<button class="qp-pv-arrow prev" aria-label="Previous photo" onclick="__qp.pvNav(-1)">‹</button>` : ''}
        <img id="qp-pv-img" alt="${esc(name)} photo">
        ${multi ? `<button class="qp-pv-arrow next" aria-label="Next photo" onclick="__qp.pvNav(1)">›</button>` : ''}
      </div>
      ${multi ? `<div class="qp-pv-foot"><div class="qp-pv-count" id="qp-pv-count"></div>
        <div class="qp-pv-thumbs" id="qp-pv-thumbs">${pvUrls.map((u, i) => `<img src="${esc(u)}" alt="Photo ${i + 1}" loading="lazy" onclick="__qp.pvGo(${i})">`).join('')}</div></div>`
      : '<div class="qp-pv-foot"></div>'}`;
    // Tapping the dark backdrop (not the image or controls) closes the viewer.
    el.addEventListener('click', (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t === el || t.id === 'qp-pv-stage' || t.classList.contains('qp-pv-foot')) handlers.closePhotos();
    });
    // Touch swipe left/right to move between photos.
    let x0 = 0, y0 = 0;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) handlers.pvNav(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.body.appendChild(el);
    document.addEventListener('keydown', pvKey);
    document.body.style.overflow = 'hidden';   // page shouldn't scroll behind the viewer
    pvRender();
    const x = el.querySelector('.qp-pv-x');
    if (x) /** @type {HTMLElement} */ (x).focus();
  },
  /** Step the open viewer forwards/backwards (wraps). @param {number} d */
  pvNav(d) {
    if (!pvUrls.length) return;
    pvIdx = (pvIdx + d + pvUrls.length) % pvUrls.length;
    pvRender();
  },
  /** Jump straight to a photo from the thumb strip. @param {number} i */
  pvGo(i) { if (i >= 0 && i < pvUrls.length) { pvIdx = i; pvRender(); } },
  closePhotos() {
    const el = document.getElementById('qp-pv');
    if (el) el.remove();
    document.removeEventListener('keydown', pvKey);
    document.body.style.overflow = '';
  },
  /** @param {number} id */
  async toggle(id) {
    const l = lines.find((x) => x.id === id); if (!l) return;
    l.customer_included = !l.customer_included;
    refreshLine(id);
    try { await fn('quote-public-update', { token, action: 'toggle', line_id: id, included: l.customer_included }); }
    catch (e) { l.customer_included = !l.customer_included; refreshLine(id); toast(friendlyError(e, 'Could not update that item — please try again.')); }
  },
  /** @param {number} id */
  toggleSpec(id) {
    const host = byId('qp-spec-' + id); const l = lines.find((x) => x.id === id);
    if (!host || !l) return;
    if (host.style.display === 'none') {
      originalValues[id] = { finish: l.finish, w_mm: l.w_mm, h_mm: l.h_mm, d_mm: l.d_mm,
        material: l.material, construction: l.construction, base_type: l.base_type,
        door_count: l.door_count, door_pct: l.door_pct, door_type: l.door_type,
        door_material: l.door_material, door_finish: l.door_finish, door_handle: l.door_handle,
        drawer_count: l.drawer_count, drawer_pct: l.drawer_pct, drawer_front_type: l.drawer_front_type,
        drawer_front_material: l.drawer_front_material, drawer_front_finish: l.drawer_front_finish,
        fixed_shelves: l.fixed_shelves, adj_shelves: l.adj_shelves, loose_shelves: l.loose_shelves,
        partitions: l.partitions, end_panels: l.end_panels };
      pendingEdits[id] = {};
      host.innerHTML = specEditor(l); host.style.display = '';
      updateSummaries();
    } else {
      handlers.cancelEdits(id);
    }
  },
  /** @param {number} id @param {string} col @param {string} v */
  setField(id, col, v) {
    pendingEdits[id] = pendingEdits[id] || {};
    // Dims are entered in the maker's unit but stored/sent canonically in mm.
    pendingEdits[id][col] = (col === 'w_mm' || col === 'h_mm' || col === 'd_mm')
      ? Math.round(parseDimToMm(v))
      : v;
  },
  /** Send every buffered edit (one request per changed line), then close
   *  the editors and restore the normal accept CTA. */
  async sendEdits() {
    const ids = Object.keys(pendingEdits).map(Number);
    let auto = 0, pend = 0;
    for (const id of ids) {
      const patch = pendingEdits[id];
      if (!patch || !Object.keys(patch).length) { handlers.cancelEdits(id); continue; }
      if (await applyEdit(id, patch)) {
        const l = lines.find((x) => x.id === id);
        if (l && !l._pending) auto++; else pend++;   // auto-priced vs awaiting confirmation
        delete pendingEdits[id]; delete originalValues[id];
      }
      // on failure the buffer and editor stay so the customer can retry
    }
    if (auto || pend) {
      const t = totals();
      const maker = D?.business?.name || 'your maker';
      if (auto && !pend) toast(`Updated — your new total is ${money(t.total)}${t.taxPct ? ' (incl. VAT)' : ''}.`, false);
      else if (pend && !auto) toast(`Change${pend > 1 ? 's' : ''} sent — ${maker} will confirm the updated price.`, false);
      else toast(`Changes sent — some prices updated; ${maker} will confirm the rest.`, false);
    }
    updateSummaries();
  },
  /** Discard buffered edits and close spec editors.
   * @param {number} [id] one line, or every open editor when omitted */
  cancelEdits(id) {
    const ids = id != null ? [id] : Object.keys(originalValues).map(Number);
    for (const lid of ids) {
      const orig = originalValues[lid];
      if (orig) { const l = lines.find((x) => x.id === lid); if (l) Object.assign(l, orig); }
      delete pendingEdits[lid];
      delete originalValues[lid];
      const host = byId('qp-spec-' + lid); if (host) host.style.display = 'none';
    }
    updateSummaries();
  },
  /** Confirmation sheet before the (irreversible) non-payment accept — one
   *  mis-click shouldn't lock the quote. The pay flow has the payment sheet
   *  as its natural confirm step, so it skips this. */
  confirmAccept() {
    if (D?.quote?.accepted_at) return;
    const t = totals();
    if (t.pending) { toast(friendlyError('price_pending')); return; }
    closePaySheet();
    const n = lines.filter((l) => l.customer_included).length;
    const el = document.createElement('div');
    el.className = 'qp-overlay'; el.id = 'qp-pay';
    el.innerHTML = `<div class="qp-sheet">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong style="font-size:15px">Accept this quote?</strong><button onclick="__qp.closePay()" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted)">×</button></div>
      <div style="font-size:13px;color:var(--text2);line-height:1.55;margin-bottom:6px">${n} item${n !== 1 ? 's' : ''} · <strong style="color:var(--text)">${money(t.total)}</strong> total${t.taxPct ? ' (incl. VAT)' : ''}.</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:14px">This confirms you’re happy to go ahead — ${esc(D?.business?.name || 'your maker')} will be notified and the quote is locked for changes.</div>
      <button class="btn btn-primary btn-lg" onclick="__qp.closePay();__qp.accept()">Yes — accept quote</button>
      <button class="btn" style="width:100%;margin-top:8px;background:none;border:1px solid var(--border);color:var(--text2)" onclick="__qp.closePay()">Go back</button>
    </div>`;
    document.body.appendChild(el);
  },
  async accept() {
    if (D?.quote?.accepted_at) return;
    const t = totals();
    const snapshot = {
      lines: lines.filter((l) => l.customer_included).map((l) => ({ id: l.id, name: l.name, finish: l.finish, w_mm: l.w_mm, customer_price: l.customer_price })),
      totals: { subtotal: t.subtotal, tax: t.tax, total: t.total, deposit: t.deposit },
      at: new Date().toISOString(),
    };
    try {
      await fn('quote-public-update', { token, action: 'accept', snapshot });
      successState(t);
    } catch (e) { toast(friendlyError(e, 'Could not record your acceptance — please try again.')); }
  },
  async payDeposit() {
    if (D?.quote?.accepted_at) return;
    /** @type {any} */ let pay;
    try { pay = await fn('quote-pay', { token, kind: 'deposit' }); }
    catch (e) {
      const m = (/** @type {Error} */ (e)).message;
      // No card set up yet → fall back to a plain accept so the customer isn't
      // blocked; the maker arranges payment separately.
      if (m === 'payments_unavailable' || m === 'payments_disabled') { await handlers.accept(); return; }
      toast(friendlyError(e, 'Could not start payment. Please try again.')); return;
    }
    const StripeCtor = await loadStripe();
    // Direct charge: the PaymentIntent lives on the connected account, so Stripe.js
    // must run in that account's context to confirm it.
    const stripe = StripeCtor(pay.publishable_key, { stripeAccount: pay.account_id });
    const elements = stripe.elements({ clientSecret: pay.client_secret });
    const t = totals();
    const subline = t.depPct
      ? `${t.depPct}% deposit · ${money(t.balance)} balance due on completion`
      : 'Full payment';
    openPaySheet(money(pay.amount), subline, async () => {
      const errEl = byId('qp-pay-err'); const btn = byId('qp-pay-btn');
      btn.setAttribute('disabled', ''); btn.textContent = 'Processing…';
      // return_url: redirect methods (e.g. Pay by bank) bounce via the bank and
      // land back here with ?redirect_status=… (picked up in boot()). Cards,
      // wallets and bank transfer resolve in place thanks to 'if_required'.
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements, redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      });
      if (error) { errEl.textContent = error.message || 'Payment could not be completed — please check your payment details.'; btn.removeAttribute('disabled'); btn.textContent = 'Pay ' + money(pay.amount); return; }
      // Only NOW does the quote count as accepted — the payment is confirmed,
      // settling, or (bank transfer) committed. Closing the sheet before this
      // point leaves the quote untouched. The webhook backfills accepted_at on
      // success too, so a closed tab can't lose it; duplicates are a no-op.
      await recordAccept();
      const na = paymentIntent && paymentIntent.next_action;
      if (paymentIntent && paymentIntent.status === 'requires_action' && na && na.type === 'display_bank_transfer_instructions') {
        // Bank transfer: Stripe has just shown the account-details modal; the
        // payment completes asynchronously when the funds land (webhook).
        closePaySheet(); bankPendingState(pay, paymentIntent); return;
      }
      if (paymentIntent && paymentIntent.status === 'processing') { closePaySheet(); processingState(pay); return; }
      closePaySheet(); paidState(pay);
    });
    elements.create('payment').mount('#qp-pay-el');
  },
  closePay() { closePaySheet(); },
  async toggleChat() {
    const pop = document.getElementById('qp-chat-pop'); if (!pop) return;
    const open = pop.classList.toggle('open');
    if (open) {
      try { const r = await fn('quote-messages', { token, action: 'list' }); _chatMsgs = r.messages || []; renderMsgs(); } catch (e) { /* offline */ }
      const inp = document.getElementById('qp-chat-input'); if (inp) inp.focus();
    }
  },
  async sendMsg() {
    const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('qp-chat-input'));
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim(); inp.value = '';
    _chatMsgs.push({ sender: 'customer', body: text }); renderMsgs();
    try { await fn('quote-messages', { token, action: 'send', body: text }); } catch (e) { /* keep optimistic */ }
  },
  /** Build + download a PDF copy of this quote/order. jsPDF is loaded on demand
   *  so it never weighs down the first paint of the customer page. */
  async downloadPdf() {
    if (!D) return;
    toast('Preparing your PDF…', false);
    try {
      const mod = /** @type {any} */ (await import('jspdf'));
      await buildQuotePdf(mod.jsPDF || mod.default);
    } catch (e) { toast('Could not generate the PDF — please try again.'); }
  },
};

/** Send one line's spec edit. Returns true on success (caller clears the buffer
 *  + composes the summary toast). The server echoes a re-priced `customer_price`
 *  when the maker has auto-accept on; otherwise it clears the price (null) and
 *  the line shows "Price to confirm" until the maker re-prices.
 *  @param {number} id @param {Record<string, unknown>} patch @returns {Promise<boolean>} */
async function applyEdit(id, patch) {
  const l = lines.find((x) => x.id === id); if (!l) return false;
  try {
    const resp = await fn('quote-public-update', { token, action: 'edit', line_id: id, ...patch });
    Object.assign(l, patch);
    if (resp && typeof resp.customer_price === 'number') {
      l.customer_price = resp.customer_price;   // auto-accepted: priced live
      l._pending = false;
    } else {
      l.customer_price = null;                  // maker re-confirms the price
      l._pending = true;
    }
    const host = byId('qp-spec-' + id); if (host) host.style.display = 'none';
    refreshLine(id);
    return true;
  } catch (e) {
    toast(friendlyError(e, 'Could not save that change — please try again.'));
    return false;
  }
}

/** @param {ReturnType<typeof totals>} t */
function successState(t) {
  D.quote.accepted_at = new Date().toISOString();
  byId('qp-root').innerHTML = `${stateBrand()}<div class="qp-state">
    <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1 style="font-size:22px;font-weight:800;color:var(--text)">Quote accepted 🎉</h1>
    <p style="font-size:14px;margin-top:8px;color:var(--text2)">Thanks — we've let ${esc(D.business?.name || 'your cabinetmaker')} know.</p>
    ${nextStepsPanel([
      `${esc(D.business?.name || 'Your maker')} will be in touch to confirm the details.`,
      t.depPct ? `They’ll arrange your ${money(t.deposit)} deposit (${t.depPct}%) to book your slot.` : 'They’ll let you know about payment and timing.',
      'You can reopen this link any time to review your items.',
    ])}
  </div>`;
}

/** Load a (possibly remote) image as a PNG data URL for jsPDF. Resolves null if it
 *  can't be read — a network error, or a CORS-tainted canvas (Supabase public
 *  buckets send permissive CORS, but a custom CDN might not) — so the PDF falls
 *  back to the name banner rather than failing. @param {string|null|undefined} url
 *  @returns {Promise<{dataUrl:string, w:number, h:number}|null>} */
function loadImageDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0);
        resolve({ dataUrl: c.toDataURL('image/png'), w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Render a PDF copy of the live quote/order, mirroring the maker's app-generated
 *  document (_buildOrderDocPDF): Helvetica, heavy header rule, grouped line items,
 *  black total pill, red discount. Drawn from the public payload; the business
 *  logo is embedded when it loads (CORS-permitting, else a name banner). No
 *  ProCabinet footer (the public page can't read the maker's tier).
 *  @param {any} JsPDF the jsPDF constructor (lazy-imported). */
async function buildQuotePdf(JsPDF) {
  const isOrder = D.kind === 'order';
  const biz = D.business || {};
  const q = D.quote || {};
  const t = totals();
  /** @param {number} v */
  const fmt = (v) => cur + (Number(v) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = 210, PH = 297, M = 18, W = PW - 2 * M;
  let y = M;
  const dateStr = niceDate(q.date) || '';
  const sub = [biz.address, biz.phone, biz.email].filter(Boolean).join('  ·  ');

  // ── Header: logo (or name banner) on the left + doc title / ref / date right ──
  let leftBottom;
  const logo = await loadImageDataUrl(biz.logo_url);
  if (logo) {
    // Caption mode: logo at top, small bold name + contact beneath (matches the app PDF).
    const maxW = 40, maxH = 18, ratio = logo.w / logo.h;
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = maxH * ratio; }
    try { pdf.addImage(logo.dataUrl, 'PNG', M, y, w, h); } catch (e) { /* skip a bad image */ }
    let by = y + h + 6;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(17);
    pdf.text(biz.name || 'Your cabinetmaker', M, by); by += 5;
    if (sub) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(120); pdf.text(sub, M, by); by += 4; }
    leftBottom = by;
  } else {
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(17);
    pdf.text(biz.name || 'Your cabinetmaker', M, y + 6);
    leftBottom = y + 6;
    if (sub) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(sub, M, y + 12); leftBottom = y + 12; }
  }
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(22); pdf.setTextColor(50);
  pdf.text(isOrder ? 'ORDER' : 'QUOTE', PW - M, y + 7, { align: 'right' });
  pdf.setFontSize(8); pdf.setTextColor(140);
  pdf.text([q.number ? '#' + q.number : '', dateStr].filter(Boolean).join('  ·  '), PW - M, y + 13.5, { align: 'right' });
  y = Math.max(leftBottom, y + 16) + 6;
  pdf.setDrawColor(17); pdf.setLineWidth(0.6); pdf.line(M, y, PW - M, y); y += 10;

  // ── Addressee ──
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(170);
  pdf.text('PREPARED FOR', M, y); pdf.text(isOrder ? 'CREATED' : 'ISSUED', M + 96, y);
  let ay = y + 5;
  pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
  pdf.text((D.client && D.client.name) || '—', M, ay);
  pdf.setFontSize(11); pdf.text(dateStr || '—', M + 96, ay);
  y = ay + 12;

  // ── Line items (only the customer's included selection) ──
  const colAmt = PW - M, colPrice = colAmt - 30, colQty = colPrice - 24;
  const descMaxW = (colQty - 12) - M;
  pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(140);
  pdf.text('DESCRIPTION', M, y);
  pdf.text('QTY', colQty, y, { align: 'right' });
  pdf.text('PRICE', colPrice, y, { align: 'right' });
  pdf.text('AMOUNT', colAmt, y, { align: 'right' });
  y += 2; pdf.setDrawColor(17); pdf.setLineWidth(0.4); pdf.line(M, y, PW - M, y); y += 6;
  let lastG = '';
  for (const l of lines) {
    if (!l.customer_included) continue;
    const g = l.line_kind || 'item';
    if (g !== lastG) { pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(160); pdf.text(grpLabel(g).toUpperCase(), M, y); y += 4; lastG = g; }
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
    const name = String(l.name || '—').replace(/\s+/g, ' ').trim() || '—';
    const nameLines = pdf.splitTextToSize(name, descMaxW);
    pdf.text(nameLines, M, y);
    const qty = Number(l.qty) || 1;
    const total = Number(l.customer_price) || 0;
    pdf.setFontSize(9.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(95);
    pdf.text(String(qty), colQty, y, { align: 'right' });
    pdf.text(l.customer_price != null ? fmt(total / (qty || 1)) : '—', colPrice, y, { align: 'right' });
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(17);
    pdf.text(l.customer_price != null ? fmt(total) : '—', colAmt, y, { align: 'right' });
    y += nameLines.length * 5;
    if (g === 'cabinet') {
      const spec = cabinetSpecText(l);
      if (spec) {
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130);
        pdf.splitTextToSize(spec, descMaxW).forEach(/** @param {string} dl */(dl) => { pdf.text(dl, M + 4, y); y += 4; });
      }
    }
    y += 3;
    if (y > PH - 60) { pdf.addPage(); y = M + 10; }
  }
  pdf.setDrawColor(210); pdf.setLineWidth(0.25); pdf.line(M, y, PW - M, y); y += 8;

  // ── Totals ──
  const discPct = Number(q.discount) || 0;
  const preDiscount = discPct > 0 && discPct < 100 ? t.subtotal / (1 - discPct / 100) : t.subtotal;
  const saving = preDiscount - t.subtotal;
  const lx = PW - M - 80, rx = PW - M;
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(140);
  pdf.text('Subtotal', lx, y); pdf.text(fmt(discPct > 0 ? preDiscount : t.subtotal), rx, y, { align: 'right' }); y += 6;
  if (discPct > 0) { pdf.setFontSize(8.5); pdf.setTextColor(196, 68, 68); pdf.text('Discount (' + discPct + '%)', lx, y); pdf.text('- ' + fmt(saving), rx, y, { align: 'right' }); pdf.setTextColor(140); y += 5; }
  if (t.taxPct) { pdf.setFontSize(8.5); pdf.setTextColor(140); pdf.text('VAT (' + t.taxPct + '%)', lx, y); pdf.text('+ ' + fmt(t.tax), rx, y, { align: 'right' }); y += 5; }
  y += 3;
  if (y > PH - 46) { pdf.addPage(); y = M + 10; }
  pdf.setFillColor(17, 17, 17); pdf.roundedRect(M, y, W, 14, 3, 3, 'F');
  pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(255);
  pdf.text((isOrder ? 'ORDER' : 'QUOTE') + ' TOTAL', M + 8, y + 9);
  pdf.setFontSize(18); pdf.text(fmt(t.total), PW - M - 8, y + 9.5, { align: 'right' }); y += 22;

  // ── Deposit + closing ──
  if (t.depPct) {
    pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(90);
    pdf.text('Deposit to begin: ' + fmt(t.deposit) + ' (' + t.depPct + '%) · balance ' + fmt(t.balance) + ' on completion.', M, y); y += 8;
  }
  if (q.notes) {
    pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(100); pdf.text('NOTES', M, y); y += 5;
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(40);
    pdf.splitTextToSize(String(q.notes), W).forEach(/** @param {string} n */(n) => { if (y > PH - 24) { pdf.addPage(); y = M + 10; } pdf.text(n, M, y); y += 5; });
    y += 4;
  }
  pdf.setFontSize(8.5); pdf.setFont('helvetica', 'italic'); pdf.setTextColor(120);
  const closing = isOrder ? 'Thank you for your order.' : 'This quote is valid for 30 days from issue.';
  pdf.text(pdf.splitTextToSize(closing, W), M, y);

  // ── Footer (business name + date; no ProCabinet branding) ──
  pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(150);
  if (biz.name) pdf.text(String(biz.name), M, PH - M);
  if (dateStr) pdf.text(dateStr, PW - M, PH - M, { align: 'right' });

  const fname = ((isOrder ? 'Order' : 'Quote') + (q.number ? '-' + String(q.number) : '')).replace(/[^\w-]+/g, '-') + '.pdf';
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: fname });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

(/** @type {any} */ (window)).__qp = handlers;

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  // Dev-only mock (`/q.html?mock=1` under `npm run dev`): renders the document
  // with sample data so the layout/PDF can be worked on without a live token.
  // Stripped from the production build (import.meta.env.DEV is false there).
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('mock')) {
    D = {
      kind: 'quote',
      quote: { number: 'Q-2048', date: '2026-06-18', status: 'sent', tax: 20, discount: 0, notes: '', accepted_at: null },
      settings: { allow_select: true, allow_edit: true, accept_payment: true, deposit_pct: 40, expires_at: '2026-07-18' },
      business: { name: 'Oakline Joinery', email: 'hello@oaklinejoinery.co.uk', phone: '01632 960 142', address: '14 Mill Lane, Bristol BS1 4QA', logo_url: '/brand/icons/procabinet-favicon-64.png', default_currency: '£' },
      client: { name: 'Sarah Whitfield' },
      lines: [
        { id: 1, line_kind: 'cabinet', name: 'Tall larder unit, 600mm', w_mm: 600, h_mm: 2150, d_mm: 580, material: 'Oak veneer', finish: 'Matt lacquer', door_count: 2, drawer_count: 0, qty: 1, customer_price: 1240, customer_included: true, optional: false, editable_specs: [] },
        { id: 2, line_kind: 'cabinet', name: 'Base cabinet, 800mm', w_mm: 800, h_mm: 720, d_mm: 580, material: 'Birch ply', finish: 'Painted, Sage green', door_count: 1, drawer_count: 1, qty: 1, customer_price: 680, customer_included: true, optional: false, editable_specs: [] },
        { id: 3, line_kind: 'cabinet', name: 'Drawer pack, 500mm', w_mm: 500, h_mm: 720, d_mm: 580, material: 'Birch ply', finish: 'Painted, Sage green', door_count: 0, drawer_count: 3, qty: 1, customer_price: 540, customer_included: true, optional: false, editable_specs: [] },
        { id: 4, line_kind: 'cabinet', name: 'Island unit, 1200mm', w_mm: 1200, h_mm: 900, d_mm: 700, material: 'American walnut', finish: 'Hardwax oil', door_count: 0, drawer_count: 4, qty: 1, customer_price: 2150, customer_included: false, optional: true, editable_specs: ['material', 'finish'] },
        { id: 5, line_kind: 'cabinet', name: 'Wall cabinet, 600mm', w_mm: 600, h_mm: 700, d_mm: 320, material: 'Oak veneer', finish: 'Matt lacquer', door_count: 2, drawer_count: 0, qty: 1, customer_price: 420, customer_included: true, optional: false, editable_specs: [] },
        { id: 6, line_kind: 'labour', name: 'Installation & fitting', qty: 1, customer_price: 480, customer_included: true, optional: false, editable_specs: [] },
      ],
      photos: [], finishes: ['Matt lacquer', 'Painted, Sage green', 'Hardwax oil'], materials: ['Oak veneer', 'Birch ply', 'American walnut'], doorTypes: [], drawerFrontTypes: [], baseTypes: [], constructions: [], handles: [],
    };
    cur = '£';
    lines = D.lines.map(/** @param {any} l */(l) => ({ ...l }));
    photosByLine = {};
    render();
    return;
  }
  if (!SBURL || !SBKEY) { byId('qp-root').innerHTML = `<div class="qp-state">Configuration error.</div>`; return; }
  if (!token) { byId('qp-root').innerHTML = `<div class="qp-state">This link is missing its quote reference.</div>`; return; }
  // Redirect-based payment methods (e.g. Pay by bank) bounce via the bank and
  // land back on this page with Stripe's params appended to the return_url.
  // Remember the outcome, then strip the params so reloads/shares stay clean.
  const ru = new URL(window.location.href);
  const redirectStatus = ru.searchParams.get('redirect_status');
  if (redirectStatus) {
    for (const k of ['payment_intent', 'payment_intent_client_secret', 'redirect_status', 'source_type']) ru.searchParams.delete(k);
    history.replaceState({}, '', ru.pathname + (ru.searchParams.toString() ? '?' + ru.searchParams.toString() : '') + ru.hash);
  }
  // If the network is slow, reassure rather than show a frozen spinner.
  const slow = setTimeout(() => {
    const root = byId('qp-root');
    if (root && root.querySelector('.qp-spin')) {
      root.innerHTML = `<div class="qp-state"><div class="qp-spin"></div>Still loading… this is taking a little longer than usual.</div>`;
    }
  }, 8000);
  try {
    D = await fn('quote-public-get', { token });
    clearTimeout(slow);
    cur = (D.business && D.business.default_currency) || '£';
    try {
      const uf = D.business && D.business.unit_format;
      if (uf) Object.assign(unitFmt, typeof uf === 'string' ? JSON.parse(uf) : uf);
    } catch (e) { /* keep mm defaults */ }
    // unit_format.mode is the reliable live signal for imperial vs metric —
    // business_info.default_units froze at the one-time migration and drifts
    // (e.g. mode:'decimal' under default_units:'mm'), so it's only a fallback.
    if (['decimal', 'fractional', 'feetInches'].includes(unitFmt.mode)) unitSys = 'imperial';
    else if (['mm', 'cm', 'm'].includes(unitFmt.mode)) unitSys = 'metric';
    else if (D.business && D.business.default_units === 'inches') unitSys = 'imperial';
    lines = (D.lines || []).map(/** @param {any} l */(l) => ({ ...l }));
    // A null customer_price on a quote line = a spec change awaiting the
    // business's re-priced confirmation (the edit endpoint clears it). Restore
    // the "Price to confirm" state across reloads instead of a bare "—".
    if (D.kind !== 'order') {
      for (const l of lines) { if (l.customer_included && l.customer_price == null) l._pending = true; }
    }
    photosByLine = {};
    for (const p of (D.photos || [])) { (photosByLine[p.line_id] = photosByLine[p.line_id] || []).push(p.url); }
    // Back from a redirect payment: show the outcome instead of the quote.
    // The amount mirrors the server's choice in quote-pay (deposit when a
    // deposit % is set, else the full total).
    if (redirectStatus === 'succeeded' || redirectStatus === 'processing' || redirectStatus === 'pending') {
      const t = totals();
      const payLike = { amount: t.depPct > 0 ? t.deposit : t.total, kind: t.depPct > 0 ? 'deposit' : 'full' };
      // Redirect methods never return from confirmPayment, so the in-sheet
      // recordAccept didn't run — stamp acceptance here instead (no-op if the
      // webhook beat us to it).
      await recordAccept();
      if (redirectStatus === 'succeeded') paidState(payLike); else processingState(payLike);
      mountChat();
      return;
    }
    render();
    if (redirectStatus === 'failed') toast('Payment didn’t complete — you can try again.');
  } catch (e) {
    clearTimeout(slow);
    byId('qp-root').innerHTML = `<div class="qp-state">${esc(friendlyError(e, 'Sorry — we couldn’t load this. Please check the link or try again.'))}</div>`;
  }
}

boot();
