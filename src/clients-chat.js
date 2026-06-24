// ProCabinet — business-side customer chat (Clients tab). Reads + replies to a
// client's conversation (customer_messages, owner RLS). The customer posts from
// the live-quote widget (quote-messages edge fn). New module + a one-line
// "Messages" button on the client card so the big clients.js is barely touched.
//
// Cross-file deps: _db / _userId (db.js/limits.js), _requireAuth (app.js),
// _toast / _openPopup / _closePopup / _escHtml (ui.js), clients /
// renderClientsMain (clients.js).

/** customer_messages isn't in database.types.ts until the migration is applied +
 *  types regenerated, so route its calls through an `any`-typed builder. */
function _cmTable() { return /** @type {any} */ (_db(/** @type {any} */ ('customer_messages'))); }

/** inbound_emails (raw stored reply) — also `any` until the migration types regen. */
function _ieTable() { return /** @type {any} */ (_db(/** @type {any} */ ('inbound_emails'))); }

/** Columns pulled for every thread load. Uses `*` deliberately: the email-bridge
 *  columns (via / email_verified / inbound_email_id / outbound_status) only exist
 *  once the `email_message_bridge` migration is applied — which it is NOT in prod.
 *  An explicit list naming them made every select 400 ("column ... does not exist"),
 *  which the callers swallow → the business saw an empty thread even with messages.
 *  `*` returns whatever columns exist (so it works pre- and post-migration); the
 *  bridge UI (`_ccEmailBadge`) already no-ops when `via` is absent. */
const _CM_COLS = '*';

/** @type {Record<number, Array<any>>} */
let _clientMessages = {};

/** Hydrate every client's conversation on boot (best-effort, owner-scoped). */
async function loadAllClientMessages() {
  _clientMessages = {};
  if (!_userId) return;
  try {
    const { data } = await _cmTable().select(_CM_COLS).order('created_at');
    /** @type {Record<number, any[]>} */ const map = {};
    (data || []).forEach(/** @param {any} m */ m => { (map[m.client_id] = map[m.client_id] || []).push(m); });
    _clientMessages = map;
    try { renderClientsMain(); } catch (e) { /* tab not mounted */ }
    _refreshMsgNav();
  } catch (e) { /* table not present yet — stay empty */ }
}

/** Unread = customer messages the business hasn't opened. @param {number} clientId */
function _clientUnreadCount(clientId) {
  return (_clientMessages[clientId] || []).filter(/** @param {any} m */ m => m.sender === 'customer' && !m.read_at).length;
}

/** Total unread customer messages across all clients (drives the nav badge). */
function _totalUnreadCount() {
  let n = 0;
  for (const cid in _clientMessages) n += _clientUnreadCount(Number(cid));
  return n;
}

/** Update the Clients nav-tab unread badge (hidden when zero). */
function _refreshMsgNav() {
  const el = document.getElementById('clients-badge');
  if (!el) return;
  const n = _totalUnreadCount();
  el.textContent = n ? String(n) : '';
  el.style.display = n ? '' : 'none';
}

/** Unread-message alert chip for a card / dashboard row — empty + hidden when the
 *  client has no unread messages. Keyed by client so `_applyUnreadUI` can toggle
 *  every instance at once on read / receive. @param {number} clientId */
function _msgChipHtml(clientId) {
  const n = (typeof _clientUnreadCount === 'function') ? _clientUnreadCount(clientId) : 0;
  return `<span class="msg-chip" data-msg-chip="${clientId}"${n ? '' : ' style="display:none"'}>💬 ${n} new</span>`;
}

/** The class list for a card's "Messages" button — adds `unread` (highlight)
 *  when the client has unread messages. Pair with data-msg-btn. @param {number} clientId */
function _msgBtnClass(clientId) {
  const n = (typeof _clientUnreadCount === 'function') ? _clientUnreadCount(clientId) : 0;
  return 'btn btn-outline' + (n > 0 ? ' unread' : '');
}

/** Sync ALL of a client's unread UI in place — count spans, alert chips, the
 *  Messages-button highlight, and the nav badge — to the current unread count.
 *  Replaces the scattered per-handler span clears so every surface stays in
 *  step on both read (→0) and a new inbound message (→N). @param {number} clientId */
function _applyUnreadUI(clientId) {
  const n = (typeof _clientUnreadCount === 'function') ? _clientUnreadCount(clientId) : 0;
  const countTxt = n ? `(${n})` : '';
  const dealSpans = /** @param {any} arr @param {string} attr */ (arr, attr) => {
    if (typeof arr === 'undefined' || !arr) return;
    arr.filter(/** @param {any} x */ x => x.client_id === clientId).forEach(/** @param {any} x */ x =>
      document.querySelectorAll(`[data-${attr}-unread="${x.id}"]`).forEach(el => { el.textContent = countTxt; }));
  };
  dealSpans(typeof quotes !== 'undefined' ? quotes : null, 'quote');
  dealSpans(typeof orders !== 'undefined' ? orders : null, 'order');
  document.querySelectorAll(`[data-client-unread="${clientId}"]`).forEach(el => { el.textContent = countTxt; });
  document.querySelectorAll(`[data-msg-btn="${clientId}"]`).forEach(el => { el.classList.toggle('unread', n > 0); });
  document.querySelectorAll(`[data-msg-chip="${clientId}"]`).forEach(el => {
    el.textContent = n ? `💬 ${n} new` : '';
    /** @type {HTMLElement} */ (el).style.display = n ? '' : 'none';
  });
  _refreshMsgNav();
}

/** @param {number} clientId */
async function _openClientChat(clientId) {
  if (!_requireAuth()) return;
  const c = /** @type {any} */ (clients.find(x => x.id === clientId));
  const name = c ? c.name : 'Client';
  try {
    const { data } = await _cmTable().select(_CM_COLS).eq('client_id', clientId).order('created_at');
    _clientMessages[clientId] = data || [];
  } catch (e) { /* offline / not applied */ }
  _openPopup(_clientChatHtml(clientId, name), 'md');
  const body = document.getElementById('cc-body'); if (body) body.scrollTop = body.scrollHeight;
  // Mark the customer's messages read (clears the unread badge).
  try {
    await _cmTable().update({ read_at: new Date().toISOString() }).eq('client_id', clientId).eq('sender', 'customer').is('read_at', null);
    (_clientMessages[clientId] || []).forEach(/** @param {any} m */ m => { if (m.sender === 'customer' && !m.read_at) m.read_at = new Date().toISOString(); });
    _applyUnreadUI(clientId);
    try { renderClientsMain(); } catch (e) { /* tab not mounted */ }
  } catch (e) { /* ignore */ }
}

/** @param {number} clientId @param {string} name @returns {string} */
function _clientChatHtml(clientId, name) {
  const msgs = _clientMessages[clientId] || [];
  const bubble = (/** @type {any} */ m) => {
    const me = m.sender === 'business';
    return `<div style="max-width:84%;align-self:${me ? 'flex-end' : 'flex-start'};padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;${me ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px' : 'background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px'}">${_escHtml(m.body)}${_ccEmailBadge(m)}</div>`;
  };
  const thread = msgs.length
    ? msgs.map(bubble).join('')
    : '<div style="color:var(--muted);font-size:12px;text-align:center;margin:auto">No messages yet. Send the first — it appears on their live quote.</div>';
  return `<div class="popup-header"><div class="popup-title">${_escHtml(name)}</div><button class="popup-close" onclick="_closePopup()">&times;</button></div>
    <div class="popup-body" id="cc-body" style="display:flex;flex-direction:column;gap:8px;min-height:280px;max-height:50vh;background:var(--bg)">${thread}</div>
    <div style="border-top:1px solid var(--border);padding:10px;display:flex;gap:6px">
      <input id="cc-input" placeholder="Reply to ${_escHtml(name)}…" autocomplete="off" style="flex:1;border:1px solid var(--border);border-radius:999px;padding:9px 14px;font-family:inherit;font-size:13px;background:var(--surface2);color:var(--text)" onkeydown="if(event.key==='Enter')_sendClientMessage(${clientId})">
      <button class="btn btn-primary" style="width:auto;padding:9px 16px" onclick="_sendClientMessage(${clientId})">Send</button>
    </div>`;
}

/** @param {number} clientId */
async function _sendClientMessage(clientId) {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('cc-input'));
  if (!inp || !inp.value.trim()) return;
  const text = inp.value.trim(); inp.value = '';
  (_clientMessages[clientId] = _clientMessages[clientId] || []).push({ sender: 'business', body: text, created_at: new Date().toISOString() });
  const body = document.getElementById('cc-body');
  if (body) {
    body.insertAdjacentHTML('beforeend', `<div style="max-width:84%;align-self:flex-end;padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;background:var(--accent);color:#fff;border-bottom-right-radius:4px">${_escHtml(text)}</div>`);
    body.scrollTop = body.scrollHeight;
  }
  try { await _cmTable().insert({ user_id: _userId, client_id: clientId, sender: 'business', body: text }); }
  catch (e) { _toast('Message not sent (is the schema migration applied?)', 'error'); }
}

// ── In-card order thread (Orders tab) ───────────────────────────────────────
// Same client-scoped conversation as the client-card chat, rendered INLINE in an
// order card instead of a popup (Option D). Several cards can be expanded at
// once, so element IDs are per-order. The customer keeps replying from their
// live page; messages sent here are tagged with order_id (context).

/** A chat bubble (matches _clientChatHtml). @param {any} m @returns {string} */
function _ccBubbleHtml(m) {
  const me = m.sender === 'business';
  return `<div style="max-width:84%;align-self:${me ? 'flex-end' : 'flex-start'};padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;${me ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px' : 'background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px'}">${_escHtml(m.body)}${_ccEmailBadge(m)}</div>`;
}

/** @param {number} orderId @param {number} clientId @returns {string} */
function _orderThreadInner(orderId, clientId) {
  const msgs = _clientMessages[clientId] || [];
  const thread = msgs.length
    ? msgs.map(_ccBubbleHtml).join('')
    : '<div style="color:var(--muted);font-size:12px;text-align:center;margin:auto;padding:18px 8px">No messages yet — the customer can reply from their live order page.</div>';
  return `<div id="oc-thread-body-${orderId}" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding:12px 14px;background:var(--bg)">${thread}</div>
    <div style="border-top:1px solid var(--border);padding:8px 10px;display:flex;gap:6px;background:var(--surface)">
      <input id="oc-thread-input-${orderId}" placeholder="Reply to the customer…" autocomplete="off" style="flex:1;border:1px solid var(--border);border-radius:999px;padding:8px 14px;font-family:inherit;font-size:13px;background:var(--surface2);color:var(--text)" onkeydown="if(event.key==='Enter')_sendOrderMessage(${orderId})">
      <button class="btn btn-primary" style="width:auto;padding:8px 16px" onclick="_sendOrderMessage(${orderId})">Send</button>
    </div>`;
}

/** Expand / collapse the in-card thread on an order card. @param {number} orderId */
async function _toggleOrderThread(orderId) {
  if (!_requireAuth()) return;
  const wrap = /** @type {HTMLElement|null} */ (document.querySelector(`[data-order-thread="${orderId}"]`));
  if (!wrap) return;
  if (wrap.style.display !== 'none') { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const o = /** @type {any} */ (orders).find(/** @param {any} x */ x => x.id === orderId);
  const clientId = o ? o.client_id : null;
  if (!clientId) { _toast('No client on this order', 'error'); return; }
  // Pull the latest conversation for this client (the customer may have replied).
  try {
    const { data } = await _cmTable().select(_CM_COLS).eq('client_id', clientId).order('created_at');
    _clientMessages[clientId] = data || [];
  } catch (e) { /* offline / not applied */ }
  wrap.innerHTML = _orderThreadInner(orderId, clientId);
  wrap.style.display = 'block';
  const body = document.getElementById(`oc-thread-body-${orderId}`); if (body) body.scrollTop = body.scrollHeight;
  // Mark the customer's messages read + clear badges in place (every order card
  // for this client, since the thread is client-scoped) without a full re-render.
  try {
    await _cmTable().update({ read_at: new Date().toISOString() }).eq('client_id', clientId).eq('sender', 'customer').is('read_at', null);
    (_clientMessages[clientId] || []).forEach(/** @param {any} m */ m => { if (m.sender === 'customer' && !m.read_at) m.read_at = new Date().toISOString(); });
    _applyUnreadUI(clientId);
    try { renderClientsMain(); } catch (e) { /* Clients tab not mounted */ }
  } catch (e) { /* ignore */ }
}

/** Send a business reply from an order card (tags order_id). @param {number} orderId */
async function _sendOrderMessage(orderId) {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById(`oc-thread-input-${orderId}`));
  if (!inp || !inp.value.trim()) return;
  const o = /** @type {any} */ (orders).find(/** @param {any} x */ x => x.id === orderId);
  const clientId = o ? o.client_id : null;
  if (!clientId) return;
  const text = inp.value.trim(); inp.value = '';
  (_clientMessages[clientId] = _clientMessages[clientId] || []).push({ sender: 'business', body: text, created_at: new Date().toISOString() });
  const body = document.getElementById(`oc-thread-body-${orderId}`);
  if (body) {
    // Re-render from cache (clears the "No messages yet" placeholder on first send).
    body.innerHTML = (_clientMessages[clientId] || []).map(_ccBubbleHtml).join('');
    body.scrollTop = body.scrollHeight;
  }
  try { await _cmTable().insert({ user_id: _userId, client_id: clientId, order_id: orderId, sender: 'business', body: text }); }
  catch (e) { _toast('Message not sent (is the schema migration applied?)', 'error'); }
}

// ── In-card quote thread (Quotes tab) ───────────────────────────────────────
// Same client-scoped conversation rendered INLINE in a quote card, matching the
// order-card pattern. Messages sent here are tagged with quote_id (context).

/** @param {number} quoteId @param {number} clientId @returns {string} */
function _quoteThreadInner(quoteId, clientId) {
  const msgs = _clientMessages[clientId] || [];
  const thread = msgs.length
    ? msgs.map(_ccBubbleHtml).join('')
    : '<div style="color:var(--muted);font-size:12px;text-align:center;margin:auto;padding:18px 8px">No messages yet — the customer can reply from their live quote page.</div>';
  return `<div id="qc-thread-body-${quoteId}" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding:12px 14px;background:var(--bg)">${thread}</div>
    <div style="border-top:1px solid var(--border);padding:8px 10px;display:flex;gap:6px;background:var(--surface)">
      <input id="qc-thread-input-${quoteId}" placeholder="Reply to the customer…" autocomplete="off" style="flex:1;border:1px solid var(--border);border-radius:999px;padding:8px 14px;font-family:inherit;font-size:13px;background:var(--surface2);color:var(--text)" onkeydown="if(event.key==='Enter')_sendQuoteMessage(${quoteId})">
      <button class="btn btn-primary" style="width:auto;padding:8px 16px" onclick="_sendQuoteMessage(${quoteId})">Send</button>
    </div>`;
}

/** Expand / collapse the in-card thread on a quote card. @param {number} quoteId */
async function _toggleQuoteThread(quoteId) {
  if (!_requireAuth()) return;
  const wrap = /** @type {HTMLElement|null} */ (document.querySelector(`[data-quote-thread="${quoteId}"]`));
  if (!wrap) return;
  if (wrap.style.display !== 'none') { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const q = /** @type {any} */ (typeof quotes !== 'undefined' ? quotes : []).find(/** @param {any} x */ x => x.id === quoteId);
  const clientId = q ? q.client_id : null;
  if (!clientId) { _toast('No client on this quote', 'error'); return; }
  // Pull the latest conversation for this client (the customer may have replied).
  try {
    const { data } = await _cmTable().select(_CM_COLS).eq('client_id', clientId).order('created_at');
    _clientMessages[clientId] = data || [];
  } catch (e) { /* offline / not applied */ }
  wrap.innerHTML = _quoteThreadInner(quoteId, clientId);
  wrap.style.display = 'block';
  const body = document.getElementById(`qc-thread-body-${quoteId}`); if (body) body.scrollTop = body.scrollHeight;
  // Mark the customer's messages read + clear badges in place (every quote/order
  // card for this client, since the thread is client-scoped) without a full re-render.
  try {
    await _cmTable().update({ read_at: new Date().toISOString() }).eq('client_id', clientId).eq('sender', 'customer').is('read_at', null);
    (_clientMessages[clientId] || []).forEach(/** @param {any} m */ m => { if (m.sender === 'customer' && !m.read_at) m.read_at = new Date().toISOString(); });
    _applyUnreadUI(clientId);
    try { renderClientsMain(); } catch (e) { /* Clients tab not mounted */ }
  } catch (e) { /* ignore */ }
}

/** Send a business reply from a quote card (tags quote_id). @param {number} quoteId */
async function _sendQuoteMessage(quoteId) {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById(`qc-thread-input-${quoteId}`));
  if (!inp || !inp.value.trim()) return;
  const q = /** @type {any} */ (typeof quotes !== 'undefined' ? quotes : []).find(/** @param {any} x */ x => x.id === quoteId);
  const clientId = q ? q.client_id : null;
  if (!clientId) return;
  const text = inp.value.trim(); inp.value = '';
  (_clientMessages[clientId] = _clientMessages[clientId] || []).push({ sender: 'business', body: text, created_at: new Date().toISOString() });
  const body = document.getElementById(`qc-thread-body-${quoteId}`);
  if (body) {
    body.innerHTML = (_clientMessages[clientId] || []).map(_ccBubbleHtml).join('');
    body.scrollTop = body.scrollHeight;
  }
  try { await _cmTable().insert({ user_id: _userId, client_id: clientId, quote_id: quoteId, sender: 'business', body: text }); }
  catch (e) { _toast('Message not sent (is the schema migration applied?)', 'error'); }
}

// ── In-card client thread (Clients tab) ─────────────────────────────────────
// Same client-scoped conversation rendered INLINE in a client card (matches the
// order-card pattern + the chosen mockup) instead of the _openClientChat popup.

/** Render the in-card client thread (bubbles + composer). @param {number} clientId @returns {string} */
function _clientThreadInner(clientId) {
  const msgs = _clientMessages[clientId] || [];
  const thread = msgs.length
    ? msgs.map(_ccBubbleHtml).join('')
    : '<div style="color:var(--muted);font-size:12px;text-align:center;margin:auto;padding:18px 8px">No messages yet — the customer can reply from their live link page.</div>';
  return `<div id="cc-thread-body-${clientId}" style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;padding:12px 14px;background:var(--bg)">${thread}</div>
    <div style="border-top:1px solid var(--border);padding:8px 10px;display:flex;gap:6px;background:var(--surface)">
      <input id="cc-thread-input-${clientId}" placeholder="Reply to the customer…" autocomplete="off" style="flex:1;border:1px solid var(--border);border-radius:999px;padding:8px 14px;font-family:inherit;font-size:13px;background:var(--surface2);color:var(--text)" onkeydown="if(event.key==='Enter')_sendClientThreadMessage(${clientId})">
      <button class="btn btn-primary" style="width:auto;padding:8px 16px" onclick="_sendClientThreadMessage(${clientId})">Send</button>
    </div>`;
}

/** Expand / collapse the in-card thread on a client card. @param {number} clientId */
async function _toggleClientThread(clientId) {
  if (!_requireAuth()) return;
  const wrap = /** @type {HTMLElement|null} */ (document.querySelector(`[data-client-thread="${clientId}"]`));
  if (!wrap) return;
  if (wrap.style.display !== 'none') { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  // Pull the latest conversation for this client (the customer may have replied).
  try {
    const { data } = await _cmTable().select(_CM_COLS).eq('client_id', clientId).order('created_at');
    _clientMessages[clientId] = data || [];
  } catch (e) { /* offline / not applied */ }
  wrap.innerHTML = _clientThreadInner(clientId);
  wrap.style.display = 'block';
  const body = document.getElementById(`cc-thread-body-${clientId}`); if (body) body.scrollTop = body.scrollHeight;
  // Mark the customer's messages read + clear the badges in place (no full
  // re-render — that would collapse the thread we just opened).
  try {
    await _cmTable().update({ read_at: new Date().toISOString() }).eq('client_id', clientId).eq('sender', 'customer').is('read_at', null);
    (_clientMessages[clientId] || []).forEach(/** @param {any} m */ m => { if (m.sender === 'customer' && !m.read_at) m.read_at = new Date().toISOString(); });
    _applyUnreadUI(clientId);
  } catch (e) { /* ignore */ }
}

/** Send a business reply from a client card. @param {number} clientId */
async function _sendClientThreadMessage(clientId) {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById(`cc-thread-input-${clientId}`));
  if (!inp || !inp.value.trim()) return;
  const text = inp.value.trim(); inp.value = '';
  (_clientMessages[clientId] = _clientMessages[clientId] || []).push({ sender: 'business', body: text, created_at: new Date().toISOString() });
  const body = document.getElementById(`cc-thread-body-${clientId}`);
  if (body) {
    body.innerHTML = (_clientMessages[clientId] || []).map(_ccBubbleHtml).join('');
    body.scrollTop = body.scrollHeight;
  }
  try { await _cmTable().insert({ user_id: _userId, client_id: clientId, sender: 'business', body: text }); }
  catch (e) { _toast('Message not sent (is the schema migration applied?)', 'error'); }
}

// ── Email-bridge UI ─────────────────────────────────────────────────────────
// Messages that arrived by email (via='email') get a small badge under the
// bubble; inbound ones link to the stored original. Outbound notifications keep
// via='app' (they originated in-app), so they show no badge.

/** Badge appended inside a bubble for email-origin messages. @param {any} m */
function _ccEmailBadge(m) {
  if (!m || m.via !== 'email') return '';
  const unverified = m.email_verified === false;
  const label = unverified ? '⚠ via email · unverified' : '✉ via email';
  const view = m.inbound_email_id
    ? ` · <a href="#" data-inbound="${_escHtml(String(m.inbound_email_id))}" onclick="event.preventDefault();event.stopPropagation();_viewOriginalEmail(this)" style="color:inherit;text-decoration:underline">View original</a>`
    : '';
  return `<div style="font-size:10px;margin-top:5px;opacity:.75;color:inherit">${label}${view}</div>`;
}

/** Open the stored raw email (owner RLS read) in a sandboxed iframe. @param {HTMLElement} el */
async function _viewOriginalEmail(el) {
  const id = el && el.dataset ? el.dataset.inbound : '';
  if (!id) return;
  let html = '';
  try {
    const { data } = await _ieTable().select('raw_html').eq('message_id', id).maybeSingle();
    html = (data && data.raw_html) || '';
  } catch (e) { /* not applied / offline */ }
  const srcdoc = _escHtml(html || '<p style="color:#777;font-family:sans-serif;padding:16px">Original email not available.</p>');
  _openPopup(`<div class="popup-header"><div class="popup-title">Original email</div><button class="popup-close" onclick="_closePopup()">&times;</button></div>
    <div class="popup-body" style="padding:0">
      <iframe sandbox style="width:100%;height:60vh;border:0;background:#fff" srcdoc="${srcdoc}"></iframe>
    </div>`, 'md');
}

// ── Realtime: surface live-page + emailed replies without reopening a thread ──

/** Merge a realtime customer_messages INSERT into the cache + refresh any open
 *  thread / unread badges for that client. @param {any} payload */
function _applyRealtimeMessage(payload) {
  const row = payload && payload.new;
  if (!row || row.id == null) return;
  const cid = row.client_id;
  const list = (_clientMessages[cid] = _clientMessages[cid] || []);
  const idx = list.findIndex(/** @param {any} m */ m => m.id === row.id);
  if (idx >= 0) { Object.assign(list[idx], row); }
  else {
    // Reconcile our own optimistic send (pushed without an id) instead of duplicating.
    const opt = list.findIndex(/** @param {any} m */ m => m.id == null && m.sender === row.sender && m.body === row.body);
    if (opt >= 0) Object.assign(list[opt], row); else list.push(row);
  }
  list.sort(/** @param {any} a @param {any} b */(a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  _refreshClientThreadUI(cid);
}

/** Re-render any visible thread bodies + unread badges for a client from cache.
 *  Avoids renderClientsMain() so it never collapses an open in-card thread.
 *  @param {number} clientId */
function _refreshClientThreadUI(clientId) {
  const bubbles = (_clientMessages[clientId] || []).map(_ccBubbleHtml).join('');
  const setBody = /** @param {string} id */ (id) => { const b = document.getElementById(id); if (b) { b.innerHTML = bubbles; b.scrollTop = b.scrollHeight; } };
  setBody(`cc-thread-body-${clientId}`);
  const refreshDeals = /** @param {any} arr @param {string} prefix */ (arr, prefix) => {
    if (typeof arr === 'undefined' || !arr) return;
    arr.filter(/** @param {any} x */ x => x.client_id === clientId).forEach(/** @param {any} x */ x => setBody(`${prefix}-thread-body-${x.id}`));
  };
  refreshDeals(typeof orders !== 'undefined' ? orders : null, 'oc');
  refreshDeals(typeof quotes !== 'undefined' ? quotes : null, 'qc');
  // Sync every unread surface (count spans, alert chips, button highlight, nav badge).
  _applyUnreadUI(clientId);
}

Object.assign(window, { loadAllClientMessages, _clientUnreadCount, _totalUnreadCount, _refreshMsgNav, _msgChipHtml, _msgBtnClass, _applyUnreadUI, _openClientChat, _sendClientMessage, _toggleOrderThread, _orderThreadInner, _sendOrderMessage, _quoteThreadInner, _toggleQuoteThread, _sendQuoteMessage, _clientThreadInner, _toggleClientThread, _sendClientThreadMessage, _ccEmailBadge, _viewOriginalEmail, _applyRealtimeMessage, _refreshClientThreadUI });
