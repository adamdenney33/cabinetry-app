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

/** @type {Record<number, Array<any>>} */
let _clientMessages = {};

/** Hydrate every client's conversation on boot (best-effort, owner-scoped). */
async function loadAllClientMessages() {
  _clientMessages = {};
  if (!_userId) return;
  try {
    const { data } = await _cmTable().select('id, client_id, sender, body, created_at, read_at').order('created_at');
    /** @type {Record<number, any[]>} */ const map = {};
    (data || []).forEach(/** @param {any} m */ m => { (map[m.client_id] = map[m.client_id] || []).push(m); });
    _clientMessages = map;
    try { renderClientsMain(); } catch (e) { /* tab not mounted */ }
  } catch (e) { /* table not present yet — stay empty */ }
}

/** Unread = customer messages the business hasn't opened. @param {number} clientId */
function _clientUnreadCount(clientId) {
  return (_clientMessages[clientId] || []).filter(/** @param {any} m */ m => m.sender === 'customer' && !m.read_at).length;
}

/** @param {number} clientId */
async function _openClientChat(clientId) {
  if (!_requireAuth()) return;
  const c = /** @type {any} */ (clients.find(x => x.id === clientId));
  const name = c ? c.name : 'Client';
  try {
    const { data } = await _cmTable().select('id, client_id, sender, body, created_at, read_at').eq('client_id', clientId).order('created_at');
    _clientMessages[clientId] = data || [];
  } catch (e) { /* offline / not applied */ }
  _openPopup(_clientChatHtml(clientId, name), 'md');
  const body = document.getElementById('cc-body'); if (body) body.scrollTop = body.scrollHeight;
  // Mark the customer's messages read (clears the unread badge).
  try {
    await _cmTable().update({ read_at: new Date().toISOString() }).eq('client_id', clientId).eq('sender', 'customer').is('read_at', null);
    (_clientMessages[clientId] || []).forEach(/** @param {any} m */ m => { if (m.sender === 'customer' && !m.read_at) m.read_at = new Date().toISOString(); });
    try { renderClientsMain(); } catch (e) { /* tab not mounted */ }
  } catch (e) { /* ignore */ }
}

/** @param {number} clientId @param {string} name @returns {string} */
function _clientChatHtml(clientId, name) {
  const msgs = _clientMessages[clientId] || [];
  const bubble = (/** @type {any} */ m) => {
    const me = m.sender === 'business';
    return `<div style="max-width:84%;align-self:${me ? 'flex-end' : 'flex-start'};padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;${me ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px' : 'background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px'}">${_escHtml(m.body)}</div>`;
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
  return `<div style="max-width:84%;align-self:${me ? 'flex-end' : 'flex-start'};padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.45;${me ? 'background:var(--accent);color:#fff;border-bottom-right-radius:4px' : 'background:var(--surface2);border:1px solid var(--border);border-bottom-left-radius:4px'}">${_escHtml(m.body)}</div>`;
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
    const { data } = await _cmTable().select('id, client_id, sender, body, created_at, read_at').eq('client_id', clientId).order('created_at');
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
    /** @type {any} */ (orders).filter(/** @param {any} x */ x => x.client_id === clientId).forEach(/** @param {any} x */ x => {
      document.querySelectorAll(`[data-order-unread="${x.id}"]`).forEach(el => { el.textContent = ''; });
    });
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

Object.assign(window, { loadAllClientMessages, _clientUnreadCount, _openClientChat, _sendClientMessage, _toggleOrderThread, _orderThreadInner, _sendOrderMessage });
