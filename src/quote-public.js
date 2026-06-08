// ProCabinet — PUBLIC live quote page (/q/<token>). Standalone ES module entry
// for q.html — does NOT load the authed app. Reads only the publishable env,
// talks to the token-scoped edge functions (quote-public-get / -update), and
// renders the customer-facing proposal (Direction C layout). It only ever
// receives customer-safe figures (per-line `customer_price`), never the
// business's cost inputs.
//
// Phase 3 scope: view + photos + optional-item toggle (live reprice) + spec
// edit (stored; price re-confirmed by the business) + accept. Card payment is
// Phase 4 (Stripe Connect); the Pay action is a placeholder until then.

/** @type {string} */
const SBURL = import.meta.env.VITE_SUPABASE_URL;
/** @type {string} */
const SBKEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** @param {string} s */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));
/** @param {string} id @returns {HTMLElement} */
const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

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
/** @type {any} */ let D = null;        // full get() payload
/** @type {any[]} */ let lines = [];    // mutable line state
/** @type {Record<number, string[]>} */ let photosByLine = {};
let cur = '£';

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
    ? `<img src="${esc(b.logo_url)}" alt="">`
    : esc((name[0] || 'Q').toUpperCase());
  byId('qp-top').innerHTML = `
    <div class="qp-brand">
      <div class="qp-logo">${logo}</div>
      <div><div class="qp-bizname">${esc(name)}</div>${b.email ? `<div class="qp-biztag">${esc(b.email)}</div>` : ''}</div>
    </div>
    <span class="qp-secure"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>Secure quote</span>`;
}

// ── line row ─────────────────────────────────────────────────────────────────
/** @param {any} l */
function row(l) {
  const photos = photosByLine[l.id] || [];
  const photo = photos.length
    ? `<div class="qp-photo"><img src="${esc(photos[0])}" alt="" loading="lazy"></div>`
    : '';
  const chips = [];
  if (l.optional) chips.push('<span class="qp-chip opt">Optional</span>');
  if ((((l.editable_specs && l.editable_specs.length) || l.customer_editable)) && D?.settings?.allow_edit) chips.push(`<span class="qp-chip edit" onclick="__qp.toggleSpec(${l.id})">Edit ▾</span>`);
  if (l._pending) chips.push('<span class="qp-chip pending">Price to confirm</span>');
  const spec = l.line_kind === 'cabinet'
    ? `${l.w_mm || '—'}×${l.h_mm || '—'}×${l.d_mm || '—'}mm${l.finish ? ' · ' + esc(l.finish) : ''}`
    : esc(l.notes || l.type || '');
  const priceHtml = l._pending
    ? '<div class="qp-price" style="font-size:12px;color:var(--danger)">To confirm</div>'
    : (l.customer_price != null ? `<div class="qp-price">${money(l.customer_price)}</div>` : '<div class="qp-price" style="color:var(--muted)">—</div>');
  const toggle = (l.optional && D?.settings?.allow_select)
    ? `<button class="qp-toggle" aria-pressed="${!!l.customer_included}" onclick="__qp.toggle(${l.id})" title="Include / exclude"></button>`
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
  /** @param {string} label @param {any} val @param {number} min @param {number} max @param {string} setter @param {string} unit */
  const num = (label, val, min, max, setter, unit) =>
    `<div class="r"><label>${label}</label><input type="number" value="${val != null ? val : ''}" min="${min}" max="${max}" step="${unit ? 10 : 1}" style="width:${unit ? 84 : 64}px" onchange="${setter}">${unit ? ` <span style="font-size:11px;color:var(--muted)">${unit}</span>` : ''}</div>`;
  const rows = [];
  if (specs.includes('dims')) {
    rows.push(num('Width', l.w_mm, 100, 3600, `__qp.setWidth(${l.id},this.value)`, 'mm'));
    rows.push(num('Height', l.h_mm, 100, 3600, `__qp.setHeight(${l.id},this.value)`, 'mm'));
    rows.push(num('Depth', l.d_mm, 100, 1200, `__qp.setDepth(${l.id},this.value)`, 'mm'));
  }
  if (specs.includes('finish')) rows.push(`<div class="r"><label>Finish</label><select onchange="__qp.setFinish(${l.id},this.value)" style="flex:1">${optList(D?.finishes || [], l.finish)}</select></div>`);
  if (specs.includes('material')) rows.push(`<div class="r"><label>Material</label><select onchange="__qp.setMaterial(${l.id},this.value)" style="flex:1">${optList(D?.materials || [], l.material)}</select></div>`);
  if (specs.includes('doors')) rows.push(num('Doors', l.door_count, 0, 6, `__qp.setDoors(${l.id},this.value)`, ''));
  if (specs.includes('drawers')) rows.push(num('Drawers', l.drawer_count, 0, 12, `__qp.setDrawers(${l.id},this.value)`, ''));
  if (specs.includes('doorFinish')) rows.push(`<div class="r"><label>Door finish</label><select onchange="__qp.setField(${l.id},'door_finish',this.value)" style="flex:1">${optList(D?.finishes || [], l.door_finish)}</select></div>`);
  if (specs.includes('drawerMat')) rows.push(`<div class="r"><label>Drawer front material</label><select onchange="__qp.setField(${l.id},'drawer_front_material',this.value)" style="flex:1">${optList(D?.materials || [], l.drawer_front_material)}</select></div>`);
  if (specs.includes('drawerFinish')) rows.push(`<div class="r"><label>Drawer front finish</label><select onchange="__qp.setField(${l.id},'drawer_front_finish',this.value)" style="flex:1">${optList(D?.finishes || [], l.drawer_front_finish)}</select></div>`);
  if (specs.includes('shelves')) rows.push(num('Shelves', l.fixed_shelves, 0, 12, `__qp.setField(${l.id},'fixed_shelves',this.value)`, ''));
  if (!rows.length) rows.push(`<div class="r"><label>Finish</label><select onchange="__qp.setFinish(${l.id},this.value)" style="flex:1">${optList(D?.finishes || [], l.finish)}</select></div>`);
  return `<div class="qp-spec">${rows.join('')}
    <div style="font-size:11px;color:var(--muted)">Changes are sent to ${esc(D?.business?.name || 'us')}, who’ll confirm the updated price.</div>
  </div>`;
}

// ── rail ─────────────────────────────────────────────────────────────────────
function rail() {
  const t = totals();
  const accepted = !!D?.quote?.accepted_at;
  const cta = accepted
    ? `<div class="qp-chip" style="background:var(--success);color:#fff;display:block;text-align:center;padding:10px;font-size:12px">✓ Accepted — thank you</div>`
    : `<button class="btn btn-primary btn-lg" style="margin-top:14px" onclick="${D?.settings?.accept_payment ? '__qp.payDeposit()' : '__qp.accept()'}">${D?.settings?.accept_payment ? 'Accept &amp; Pay deposit' : 'Accept this quote'}</button>`;
  return `<h3>Your quote</h3>
    <div style="font-size:12px;color:var(--muted);margin-bottom:10px">${lines.filter((l) => l.customer_included).length} of ${lines.length} items included</div>
    <div class="qp-rl"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    ${t.taxPct ? `<div class="qp-rl"><span>VAT (${t.taxPct}%)</span><span>${money(t.tax)}</span></div>` : ''}
    <div class="qp-rl grand"><span>Total</span><span>${money(t.total)}${t.pending ? '+' : ''}</span></div>
    ${t.depPct ? `<div class="qp-dep"><div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-size:12px;font-weight:700;color:var(--text2)">Deposit (${t.depPct}%)</span><span class="amt">${money(t.deposit)}</span></div><div class="bal">Balance of ${money(t.balance)} on completion</div></div>` : ''}
    ${t.pending ? `<div style="font-size:11px;color:var(--danger);margin-top:10px">${t.pending} item${t.pending > 1 ? 's' : ''} awaiting a confirmed price after your spec change.</div>` : ''}
    ${cta}
    <div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:10.5px;color:var(--muted);margin-top:12px"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Secured · ${esc(D?.business?.name || '')}</div>`;
}

// ── full render ──────────────────────────────────────────────────────────────
function render() {
  const q = D.quote || {};
  const greetingName = (D.client?.name || '').split(/[ &]/)[0] || 'there';
  byId('qp-root').innerHTML = `
    <div class="qp-hero">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div><h1>Your quote${q.number ? ' · ' + esc(q.number) : ''}</h1><div class="sub">${q.date ? 'Issued ' + esc(q.date) : ''}</div></div>
        <span class="qp-chip" style="background:rgba(80,140,220,.15);color:#2962d9">${esc(q.accepted_at ? 'Accepted' : 'Awaiting your approval')}</span>
      </div>
      <div class="qp-greeting">Hi ${esc(greetingName)}, here's your quote${D.business?.name ? ' from <strong>' + esc(D.business.name) + '</strong>' : ''}. ${D.settings?.allow_select ? 'Toggle any optional items and the total updates as you go.' : ''} ${D.settings?.allow_edit ? 'Tap Edit on a line to request a spec change.' : ''}</div>
    </div>
    <div class="qp-two">
      <div class="card" style="overflow:hidden"><div class="card-header"><div class="card-title">Your items</div></div><div id="qp-lines"></div></div>
      <div class="qp-rail-wrap"><div class="qp-rail" id="qp-rail"></div></div>
    </div>
    <div style="font-size:11px;color:var(--muted);text-align:center;margin-top:18px">${q.notes ? esc(q.notes) + ' · ' : ''}Prices include VAT where shown.</div>`;
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
/** @param {string} amountLabel @param {() => void} onConfirm */
function openPaySheet(amountLabel, onConfirm) {
  closePaySheet();
  const el = document.createElement('div');
  el.className = 'qp-overlay'; el.id = 'qp-pay';
  el.innerHTML = `<div class="qp-sheet">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><strong style="font-size:15px">Pay your deposit</strong><button onclick="__qp.closePay()" style="border:none;background:none;font-size:20px;cursor:pointer;color:var(--muted)">×</button></div>
    <div style="font-size:26px;font-weight:800;margin-bottom:12px">${amountLabel}</div>
    <div id="qp-pay-el"></div>
    <div id="qp-pay-err" style="color:var(--danger);font-size:12px;margin-top:8px"></div>
    <button class="btn btn-primary btn-lg" id="qp-pay-btn" style="margin-top:12px">Pay ${amountLabel}</button>
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;font-size:10px;color:var(--muted);margin-top:8px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Secured by Stripe</div>
  </div>`;
  document.body.appendChild(el);
  byId('qp-pay-btn').addEventListener('click', onConfirm);
}
function closePaySheet() { const e = document.getElementById('qp-pay'); if (e) e.remove(); }
/** @param {any} pay */
function paidState(pay) {
  if (D.quote) D.quote.accepted_at = new Date().toISOString();
  byId('qp-root').innerHTML = `<div class="qp-state">
    <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1 style="font-size:22px;font-weight:800;color:var(--text)">Payment received 🎉</h1>
    <p style="font-size:14px;margin-top:8px;color:var(--text2)">Thanks — your ${money(pay.amount)} ${pay.kind === 'deposit' ? 'deposit' : 'payment'} is in and your order is confirmed.${D.business?.name ? ' ' + esc(D.business.name) + ' will be in touch.' : ''} A receipt is on its way.</p>
  </div>`;
}

// ── live chat widget ─────────────────────────────────────────────────────────
/** @type {Array<{sender:string,body:string}>} */ let _chatMsgs = [];
function mountChat() {
  if (!D || !D.business || document.getElementById('qp-chat-launcher')) return;
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
    catch (e) { l.customer_included = !l.customer_included; refreshLine(id); alert('Could not update — please try again.'); }
  },
  /** @param {number} id */
  toggleSpec(id) {
    const host = byId('qp-spec-' + id); const l = lines.find((x) => x.id === id);
    if (!host || !l) return;
    if (host.style.display === 'none') { host.innerHTML = specEditor(l); host.style.display = ''; }
    else host.style.display = 'none';
  },
  /** @param {number} id @param {string} v */
  async setFinish(id, v) { await applyEdit(id, { finish: v }); },
  /** @param {number} id @param {string} v */
  async setWidth(id, v) { await applyEdit(id, { w_mm: Number(v) }); },
  /** @param {number} id @param {string} v */
  async setHeight(id, v) { await applyEdit(id, { h_mm: Number(v) }); },
  /** @param {number} id @param {string} v */
  async setDepth(id, v) { await applyEdit(id, { d_mm: Number(v) }); },
  /** @param {number} id @param {string} v */
  async setMaterial(id, v) { await applyEdit(id, { material: v }); },
  /** @param {number} id @param {string} v */
  async setDoors(id, v) { await applyEdit(id, { door_count: Number(v) }); },
  /** @param {number} id @param {string} v */
  async setDrawers(id, v) { await applyEdit(id, { drawer_count: Number(v) }); },
  /** @param {number} id @param {string} col @param {string} v */
  async setField(id, col, v) { await applyEdit(id, { [col]: v }); },
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
    } catch (e) { alert('Could not record acceptance — please try again.'); }
  },
  async payDeposit() {
    if (D?.quote?.accepted_at) return;
    /** @type {any} */ let pay;
    try { pay = await fn('quote-pay', { token, kind: 'deposit' }); }
    catch (e) {
      const m = (/** @type {Error} */ (e)).message;
      if (m === 'payments_unavailable' || m === 'payments_disabled') { await handlers.accept(); return; }
      alert('Could not start payment: ' + m); return;
    }
    await recordAccept();
    const StripeCtor = await loadStripe();
    const stripe = StripeCtor(pay.publishable_key);
    const elements = stripe.elements({ clientSecret: pay.client_secret });
    openPaySheet(money(pay.amount), async () => {
      const errEl = byId('qp-pay-err'); const btn = byId('qp-pay-btn');
      btn.setAttribute('disabled', ''); btn.textContent = 'Processing…';
      const { error } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
      if (error) { errEl.textContent = error.message || 'Payment failed'; btn.removeAttribute('disabled'); btn.textContent = 'Pay ' + money(pay.amount); return; }
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
    l._pending = true;          // price needs re-confirming after a spec change
    const host = byId('qp-spec-' + id); if (host) host.style.display = 'none';
    refreshLine(id);
  } catch (e) {
    alert('Could not save that change: ' + (/** @type {Error} */(e)).message);
  }
}

/** @param {ReturnType<typeof totals>} t */
function successState(t) {
  D.quote.accepted_at = new Date().toISOString();
  byId('qp-root').innerHTML = `<div class="qp-state">
    <div class="check"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h1 style="font-size:22px;font-weight:800;color:var(--text)">Quote accepted 🎉</h1>
    <p style="font-size:14px;margin-top:8px;color:var(--text2)">Thanks — we've let ${esc(D.business?.name || 'your cabinetmaker')} know.${t.depPct ? ' They’ll be in touch about your ' + money(t.deposit) + ' deposit to book your slot.' : ''} You can reopen this link any time.</p>
  </div>`;
}

(/** @type {any} */ (window)).__qp = handlers;

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  if (!SBURL || !SBKEY) { byId('qp-root').innerHTML = `<div class="qp-state">Configuration error.</div>`; return; }
  if (!token) { byId('qp-root').innerHTML = `<div class="qp-state">This link is missing its quote reference.</div>`; return; }
  try {
    D = await fn('quote-public-get', { token });
    cur = (D.business && D.business.default_currency) || '£';
    lines = (D.lines || []).map(/** @param {any} l */(l) => ({ ...l }));
    photosByLine = {};
    for (const p of (D.photos || [])) { (photosByLine[p.line_id] = photosByLine[p.line_id] || []).push(p.url); }
    renderTop();
    render();
  } catch (e) {
    const msg = (/** @type {Error} */ (e)).message;
    const friendly = msg === 'not_found' ? 'This quote link is no longer valid.'
      : msg === 'expired' ? 'This quote has expired. Please ask for a fresh link.'
      : msg === 'closed' ? 'This quote is closed.'
      : 'Sorry — we couldn’t load this quote. Please check the link or try again.';
    byId('qp-root').innerHTML = `<div class="qp-state">${esc(friendly)}</div>`;
  }
}

boot();
