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

// ── header ───────────────────────────────────────────────────────────────────
function renderTop() {
  const b = D?.business || {};
  const name = b.name || 'Your cabinetmaker';
  const logo = b.logo_url
    ? `<img src="${esc(b.logo_url)}" alt="${esc(name)} logo">`
    : esc((name[0] || 'Q').toUpperCase());
  // Show whatever contact the maker has on file — more ways to reach a real
  // person is the single biggest trust signal on a page asking for money.
  const contact = [b.email, b.phone].filter(Boolean).map(esc).join(' · ');
  byId('qp-top').innerHTML = `
    <div class="qp-brand">
      <div class="qp-logo">${logo}</div>
      <div><div class="qp-bizname">${esc(name)}</div>${contact ? `<div class="qp-biztag">${contact}</div>` : ''}</div>
    </div>
    <span class="qp-secure" title="This page is encrypted (HTTPS). Card payments are handled securely by Stripe."><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>Secure &amp; encrypted</span>`;
}

// ── line row ─────────────────────────────────────────────────────────────────
/** @param {any} l */
function row(l) {
  const accepted = !!D?.quote?.accepted_at;
  const photos = photosByLine[l.id] || [];
  const photo = photos.length
    ? `<div class="qp-photo"><img src="${esc(photos[0])}" alt="" loading="lazy"></div>`
    : '';
  const chips = [];
  if (l.optional && !accepted) chips.push('<span class="qp-chip opt">Optional</span>');
  // Once accepted, the quote is locked server-side — don't render controls
  // that would only error with "already accepted".
  if (!accepted && (((l.editable_specs && l.editable_specs.length) || l.customer_editable)) && D?.settings?.allow_edit) chips.push(`<button class="qp-chip edit" onclick="__qp.toggleSpec(${l.id})">Edit ▾</button>`);
  if (l._pending) chips.push('<span class="qp-chip pending">Price to confirm</span>');
  // Richer cabinet description — mirrors what the PDF shows (dims, material,
  // finish, fronts) so the page reads like a real spec, not a mystery box.
  let spec = '';
  if (l.line_kind === 'cabinet') {
    const parts = [];
    if (l.w_mm || l.h_mm || l.d_mm) parts.push(`${l.w_mm || '—'}×${l.h_mm || '—'}×${l.d_mm || '—'}mm`);
    if (l.material) parts.push(esc(l.material));
    if (l.finish && l.finish !== 'None') parts.push(esc(l.finish));
    if ((l.door_count || 0) > 0) parts.push(`${l.door_count} door${l.door_count !== 1 ? 's' : ''}`);
    if ((l.drawer_count || 0) > 0) parts.push(`${l.drawer_count} drawer${l.drawer_count !== 1 ? 's' : ''}`);
    spec = parts.join(' · ');
  } else {
    spec = esc(l.notes || l.type || '');
  }
  const priceHtml = l._pending
    ? '<div class="qp-price" style="font-size:12px;color:var(--danger)">To confirm</div>'
    : (l.customer_price != null ? `<div class="qp-price">${money(l.customer_price)}</div>` : '<div class="qp-price" style="color:var(--muted)">—</div>');
  const toggle = (l.optional && D?.settings?.allow_select && !accepted)
    ? `<button class="qp-toggle" aria-pressed="${!!l.customer_included}" aria-label="Include ${esc(l.name || 'this item')} in your ${D?.kind === 'order' ? 'order' : 'quote'}" onclick="__qp.toggle(${l.id})" title="Include / exclude"></button>`
    : '';
  return `<div class="qp-row${l.customer_included ? '' : ' excluded'}" id="qp-row-${l.id}">
    <div style="display:flex;gap:14px;width:100%;align-items:flex-start">
      ${photo}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-weight:700;font-size:14px">${esc(l.name || 'Item')}</span>${chips.join('')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">${spec}${l.qty > 1 ? ' · Qty ' + l.qty : ''}</div>
        <div id="qp-spec-${l.id}" style="display:none"></div>
      </div>
      <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:7px">
        ${priceHtml}${toggle}
      </div>
    </div>
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
  /** @param {string} label @param {string[]} opts @param {string} cur @param {string} col */
  const sel = (label, opts, cur, col) =>
    `<div class="r"><label>${label}</label><select onchange="__qp.setField(${l.id},'${col}',this.value)" style="flex:1">${optList(opts, cur)}</select></div>`;
  /** @type {Array<{t:string, rows:string[]}>} */
  const sections = [];
  if (specs.includes('dims')) sections.push({ t: 'Dimensions', rows: [
    num('Width', l.w_mm, 100, 3600, 'w_mm', 'mm'),
    num('Height', l.h_mm, 100, 3600, 'h_mm', 'mm'),
    num('Depth', l.d_mm, 100, 1200, 'd_mm', 'mm'),
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
  if (specs.includes('shelves')) storage.push(num('Shelves', l.fixed_shelves, 0, 12, 'fixed_shelves', ''));
  if (storage.length) sections.push({ t: 'Shelves', rows: storage });
  if (!sections.length) sections.push({ t: '', rows: [sel('Finish', D?.finishes || [], l.finish, 'finish')] });
  const body = sections.map(s => `${s.t ? `<div class="qp-spec-head">${s.t}</div>` : ''}${s.rows.join('')}`).join('');
  return `<div class="qp-spec">${body}
    <div style="font-size:11px;color:var(--muted);line-height:1.5;margin-top:10px">When you send your edits, ${esc(D?.business?.name || 'your maker')} will confirm the updated price before anything is charged. The item shows \"Price to confirm\" until then.</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-primary" style="flex:1;padding:9px 12px;font-size:13px" onclick="__qp.sendEdits(${l.id})">Send edits</button>
      <button class="btn" style="background:none;border:1px solid var(--border);color:var(--text2);padding:9px 14px;font-size:13px" onclick="__qp.cancelEdits(${l.id})">Cancel</button>
    </div>
  </div>`;
}

// ── rail ─────────────────────────────────────────────────────────────────────
function rail() {
  const t = totals();
  const isOrder = D?.kind === 'order';
  const accepted = !!D?.quote?.accepted_at;
  // Orders are confirmed — no accept / pay CTA on the live page.
  const payMode = !!D?.settings?.accept_payment;
  const btnLabel = payMode
    ? (t.depPct ? `Accept &amp; pay ${money(t.deposit)} deposit` : `Accept &amp; pay ${money(t.total)}`)
    : 'Accept this quote';
  // One line under the button so the customer knows exactly what the click does.
  const hasPending = t.pending > 0;
  const ctaHint = hasPending
    ? `Accepting unlocks once ${esc(D?.business?.name || 'your maker')} confirms the updated price${t.pending > 1 ? 's' : ''}.`
    : payMode
      ? (t.depPct
        ? `Pay a ${t.depPct}% deposit now to confirm — the ${money(t.balance)} balance is due on completion.`
        : `Pay in full to confirm your ${isOrder ? 'order' : 'quote'}.`)
      : 'Confirms you’re happy to go ahead — your maker will be in touch about next steps and payment.';
  const cta = isOrder
    ? ''
    : (accepted
      ? `<div class="qp-chip" style="background:var(--success);color:#fff;display:block;text-align:center;padding:14px 16px;font-size:12px;margin-top:16px;line-height:1.2">✓ Accepted — thank you</div>`
      : `<button class="btn btn-primary btn-lg" style="margin-top:16px${hasPending ? ';opacity:.55;cursor:not-allowed' : ''}"${hasPending ? ' disabled' : ''} onclick="${payMode ? '__qp.payDeposit()' : '__qp.confirmAccept()'}">${btnLabel}</button>
       <div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4;text-align:center">${ctaHint}</div>`);
  // The customer's discount is baked into each line price — surface it so they
  // can see what they're saving (and the subtotal reads pre-discount).
  const discPct = Number(D?.quote?.discount) || 0;
  const preDiscount = discPct > 0 && discPct < 100 ? t.subtotal / (1 - discPct / 100) : t.subtotal;
  const saving = preDiscount - t.subtotal;
  const discRows = discPct > 0
    ? `<div class="qp-rl"><span>Subtotal</span><span>${money(preDiscount)}</span></div>
       <div class="qp-rl" style="color:var(--success);font-weight:600"><span>Your discount (${discPct}%)</span><span>−${money(saving)}</span></div>`
    : `<div class="qp-rl"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>`;
  return `<h3>Your ${isOrder ? 'order' : 'quote'}</h3>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${lines.filter((l) => l.customer_included).length} of ${lines.length} items included</div>
    ${discRows}
    ${t.taxPct ? `<div class="qp-rl"><span>VAT (${t.taxPct}%)</span><span>${money(t.tax)}</span></div>` : ''}
    <div class="qp-rl grand"><span>Total</span><span>${money(t.total)}${t.pending ? '+' : ''}</span></div>
    ${t.depPct ? `<div class="qp-dep"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:12px;font-weight:700;color:var(--text2)">Deposit (${t.depPct}%)</span><span class="amt">${money(t.deposit)}</span></div><div class="bal">Balance of ${money(t.balance)} on completion</div></div>` : ''}
    ${t.pending ? `<div style="font-size:11px;color:var(--danger);margin-top:10px">${t.pending} item${t.pending > 1 ? 's' : ''} awaiting a confirmed price after your spec change — we’ll update this page.</div>` : ''}
    ${cta}
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:10.5px;color:var(--muted);margin-top:14px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Secured · ${esc(D?.business?.name || '')}</div>`;
}

// ── full render ──────────────────────────────────────────────────────────────
function render() {
  const q = D.quote || {};
  const isOrder = D.kind === 'order';
  const noun = isOrder ? 'order' : 'quote';
  const statusChip = isOrder
    ? esc(String(q.status || 'order').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
    : esc(q.accepted_at ? 'Accepted' : 'Awaiting your approval');
  const greetingName = (D.client?.name || '').split(/[ &]/)[0] || 'there';
  // Orders are already confirmed — a banner removes any "do I need to do
  // something?" doubt that a quote-style page would otherwise create.
  const orderBanner = isOrder
    ? `<div class="qp-banner"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg><div>This is your confirmed order — no action needed. You can review the details below or message us any time.</div></div>`
    : '';
  byId('qp-root').innerHTML = `
    ${orderBanner}
    <div class="qp-hero">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><h1>Your ${noun}${q.number ? ' · ' + esc(q.number) : ''}</h1><div class="sub">${q.date ? (isOrder ? 'Created ' : 'Issued ') + esc(q.date) : ''}</div></div>
        <span class="qp-chip" style="background:rgba(80,140,220,.15);color:#2962d9">${statusChip}</span>
      </div>
      <div class="qp-greeting">Hi ${esc(greetingName)}, here's your ${noun}${D.business?.name ? ' from <strong>' + esc(D.business.name) + '</strong>' : ''}. ${(D.settings?.allow_select && lines.filter((l) => l.optional).length >= 2) ? 'Toggle any optional items and the total updates as you go.' : ''} ${D.settings?.allow_edit ? 'Tap Edit on a line to request a spec change.' : ''}</div>
    </div>
    <div class="qp-two">
      <div class="card" style="overflow:hidden"><div class="card-header"><div class="card-title">Your items</div></div><div id="qp-lines"></div></div>
      <div class="qp-rail-wrap"><div class="qp-rail" id="qp-rail"></div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:18px">${q.notes ? esc(q.notes) + ' · ' : ''}${Number(q.tax) > 0 ? 'Total includes VAT (' + Number(q.tax) + '%).' : 'No VAT applies to this ' + noun + '.'}</div>`;
  byId('qp-lines').innerHTML = lines.map(row).join('');
  byId('qp-rail').innerHTML = rail();
  mountChat();
}

/** @param {number} id */
function refreshLine(id) {
  const l = lines.find((x) => x.id === id);
  const el = byId('qp-row-' + id);
  if (l && el) el.outerHTML = row(l);
  byId('qp-rail').innerHTML = rail();
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
  byId('qp-root').innerHTML = `<div class="qp-state">
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

// ── interactions (attached to window for inline handlers) ────────────────────
const handlers = {
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
        fixed_shelves: l.fixed_shelves };
      pendingEdits[id] = {};
      host.innerHTML = specEditor(l); host.style.display = '';
    } else {
      handlers.cancelEdits(id);
    }
  },
  /** @param {number} id @param {string} col @param {string} v */
  setField(id, col, v) {
    pendingEdits[id] = pendingEdits[id] || {};
    pendingEdits[id][col] = v;
  },
  /** Send all buffered edits for a line in one request.
   * @param {number} id */
  async sendEdits(id) {
    const patch = pendingEdits[id];
    if (!patch || !Object.keys(patch).length) { handlers.cancelEdits(id); return; }
    await applyEdit(id, patch);
    delete pendingEdits[id];
    delete originalValues[id];
  },
  /** Discard buffered edits and close the spec editor.
   * @param {number} id */
  cancelEdits(id) {
    const orig = originalValues[id];
    if (orig) { const l = lines.find((x) => x.id === id); if (l) Object.assign(l, orig); }
    delete pendingEdits[id];
    delete originalValues[id];
    const host = byId('qp-spec-' + id); if (host) host.style.display = 'none';
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
    await recordAccept();
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
      const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
      if (error) { errEl.textContent = error.message || 'Payment could not be completed — please check your card details.'; btn.removeAttribute('disabled'); btn.textContent = 'Pay ' + money(pay.amount); return; }
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
};

/** @param {number} id @param {Record<string, unknown>} patch */
async function applyEdit(id, patch) {
  const l = lines.find((x) => x.id === id); if (!l) return;
  try {
    await fn('quote-public-update', { token, action: 'edit', line_id: id, ...patch });
    Object.assign(l, patch);
    // Mirror the server: the old price no longer applies, so the line is
    // pending a re-confirmed price (persists across reloads now).
    l.customer_price = null;
    l._pending = true;
    const host = byId('qp-spec-' + id); if (host) host.style.display = 'none';
    refreshLine(id);
    toast(`Change sent — ${(D?.business?.name || 'your maker')} will confirm the updated price.`, false);
  } catch (e) {
    toast(friendlyError(e, 'Could not save that change — please try again.'));
  }
}

/** @param {ReturnType<typeof totals>} t */
function successState(t) {
  D.quote.accepted_at = new Date().toISOString();
  byId('qp-root').innerHTML = `<div class="qp-state">
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

(/** @type {any} */ (window)).__qp = handlers;

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  if (!SBURL || !SBKEY) { byId('qp-root').innerHTML = `<div class="qp-state">Configuration error.</div>`; return; }
  if (!token) { byId('qp-root').innerHTML = `<div class="qp-state">This link is missing its quote reference.</div>`; return; }
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
    lines = (D.lines || []).map(/** @param {any} l */(l) => ({ ...l }));
    // A null customer_price on a quote line = a spec change awaiting the
    // business's re-priced confirmation (the edit endpoint clears it). Restore
    // the "Price to confirm" state across reloads instead of a bare "—".
    if (D.kind !== 'order') {
      for (const l of lines) { if (l.customer_included && l.customer_price == null) l._pending = true; }
    }
    photosByLine = {};
    for (const p of (D.photos || [])) { (photosByLine[p.line_id] = photosByLine[p.line_id] || []).push(p.url); }
    renderTop();
    render();
  } catch (e) {
    clearTimeout(slow);
    byId('qp-root').innerHTML = `<div class="qp-state">${esc(friendlyError(e, 'Sorry — we couldn’t load this. Please check the link or try again.'))}</div>`;
  }
}

boot();
