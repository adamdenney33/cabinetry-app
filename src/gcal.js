// ProCabinet — Google Calendar client wiring (GC.4).
//
// Connect/disconnect UI (Schedule sidebar), the ?gcal= OAuth return handler,
// and the sync driver for the gcal-sync edge function: tasks 2-way, orders
// push-only (computed placements travel with each call — the scheduler runs
// client-side), untagged Google events come back as a read-only overlay
// rendered behind the Google layer toggle.
//
// Loaded as a classic <script defer> after schedule-views.js. Cross-file
// deps (globals): _db, _dbAuthToken, _userId, _requireAuth, _toast, _confirm,
// _escHtml, renderSchedule, computeSchedule, orders, cbSettings, dayOverrides,
// orderClient, loadScheduleTasks, _schedLayers.

/** Connection status (non-secret columns of gcal_connections).
 *  @type {{ connected: boolean, email: string|null, status: string, reauth?: boolean }} */
let _gcalConn = { connected: false, email: null, status: '' };

/** Read-only overlay events from the user's Google Calendar (untagged ones).
 *  @type {{ id: string, title: string, start: string, end: string, allDay: boolean }[]} */
let gcalOverlayEvents = [];

async function loadGcalStatus() {
  if (!_userId) { _gcalConn = { connected: false, email: null, status: '' }; return; }
  try {
    const { data, error } = await _db('gcal_connections')
      .select('google_email,status,last_synced_at').eq('user_id', _userId).limit(1);
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) { _gcalConn = { connected: false, email: null, status: '' }; }
    else _gcalConn = { connected: row.status === 'connected', email: row.google_email, status: row.status };
  } catch (e) {
    console.warn('[gcal] status load:', (/** @type {any} */ (e)).message || e);
  }
  _gcalRenderMenuSection();
}

/** @param {string} action @param {any} [body] */
async function _gcalFn(action, body) {
  const token = (typeof _dbAuthToken === 'function' && _dbAuthToken()) || null;
  if (!token) throw new Error('Sign in first');
  const fn = action === 'sync' ? 'gcal-sync' : 'gcal-oauth';
  const res = await fetch(`${window._SBURL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'apikey': window._SBKEY, 'content-type': 'application/json' },
    body: JSON.stringify(action === 'sync' ? (body || {}) : { action, ...(body || {}) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// ── Connect / disconnect ─────────────────────────────────────────────────────
async function _gcalConnect() {
  if (!_requireAuth()) return;
  try {
    const { url } = await _gcalFn('start');
    window.location.href = url;
  } catch (e) {
    _toast((/** @type {any} */ (e)).message || 'Could not start Google sign-in', 'error');
  }
}

function _gcalDisconnect() {
  _confirm('Disconnect Google Calendar? Synced events stay on your calendar; they just stop updating.', async () => {
    try {
      await _gcalFn('disconnect');
      _gcalConn = { connected: false, email: null, status: '' };
      gcalOverlayEvents = [];
      _gcalRenderMenuSection();
      renderSchedule();
      _toast('Google Calendar disconnected', 'success');
    } catch (e) {
      _toast((/** @type {any} */ (e)).message || 'Disconnect failed', 'error');
    }
  });
}

/** Handle the ?gcal=connected / ?gcal=error redirect back from Google. */
function handleGcalReturn() {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('gcal');
  if (!state) return;
  params.delete('gcal');
  const rest = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''));
  if (state === 'connected') {
    _toast('Google Calendar connected — syncing…', 'success');
    // Status row + first sync once boot has a user id.
    const kick = () => { loadGcalStatus().then(() => { renderSchedule(); _gcalSyncNow('connect'); }); };
    if (_userId) kick(); else setTimeout(kick, 2500);
  } else {
    _toast('Google Calendar connection failed', 'error');
  }
}

// ── Sync driver ──────────────────────────────────────────────────────────────
/** Build the push-only order placements from the client-side scheduler —
 *  the same inputs renderSchedule feeds computeSchedule. */
function _gcalOrderPlacements() {
  if (typeof computeSchedule !== 'function' || typeof orders === 'undefined') return [];
  try {
    const today = new Date();
    const biz = {
      workdayHours: cbSettings.workdayHours,
      weekdayHours: cbSettings.weekdayHours,
      packagingHours: cbSettings.packagingHours,
      queueStartDate: cbSettings.queueStartDate,
    };
    const overrides = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides)) ? dayOverrides : [];
    const computed = computeSchedule(orders, biz, overrides,
      new Date(today.getFullYear(), today.getMonth(), today.getDate()));
    /** @type {{ id: number, label: string, startISO: string, endISO: string }[]} */
    const out = [];
    for (const o of orders) {
      if (!o || o.status === 'complete' || o.id < 0) continue; // skip demo rows
      const s = computed.get(o.id);
      if (!s || !s.startISO || !s.endISO) continue;
      const num = o.order_number || ('ORD-' + String(o.id).padStart(4, '0'));
      const client = (typeof orderClient === 'function' && orderClient(o)) || '';
      out.push({ id: o.id, label: [num, client].filter(Boolean).join(' · '), startISO: s.startISO, endISO: s.endISO });
    }
    return out;
  } catch (e) {
    console.warn('[gcal] placements:', (/** @type {any} */ (e)).message || e);
    return [];
  }
}

let _gcalSyncInFlight = false;
/** @param {string} [reason] */
async function _gcalSyncNow(reason) {
  if (!_userId || !_gcalConn.connected || _gcalSyncInFlight) return;
  _gcalSyncInFlight = true;
  _gcalSetSyncState('syncing');
  try {
    const res = await _gcalFn('sync', { orders: _gcalOrderPlacements(), reason: reason || 'manual' });
    if (!res.connected) {
      _gcalConn.connected = false;
      if (res.reauth) { _gcalConn.reauth = true; _toast('Google Calendar needs reconnecting', 'error'); }
      _gcalRenderMenuSection();
      renderSchedule();
      return;
    }
    gcalOverlayEvents = Array.isArray(res.overlay) ? res.overlay : [];
    if (res.email && !_gcalConn.email) { _gcalConn.email = res.email; _gcalRenderMenuSection(); }
    if (res.tasksChanged && typeof loadScheduleTasks === 'function') await loadScheduleTasks();
    renderSchedule();
  } catch (e) {
    console.warn('[gcal] sync failed:', (/** @type {any} */ (e)).message || e);
    _gcalSetSyncState('error');
    return;
  } finally {
    _gcalSyncInFlight = false;
  }
  _gcalSetSyncState('idle');
}

/** Debounced sync after local task edits (create/edit/delete/drag). */
/** @type {ReturnType<typeof setTimeout> | null} */
let _gcalQueueTimer = null;
function _gcalQueueSync() {
  if (!_gcalConn.connected) return;
  if (_gcalQueueTimer) clearTimeout(_gcalQueueTimer);
  _gcalQueueTimer = setTimeout(() => { _gcalQueueTimer = null; _gcalSyncNow('edit'); }, 4000);
}

// Periodic pull while the Schedule tab is open (Google-side edits land within
// ~5 min; there are no webhooks by design — see SCHEMA § 3.30).
setInterval(() => {
  const panel = document.getElementById('panel-schedule');
  if (panel && panel.classList.contains('active')) _gcalSyncNow('interval');
}, 5 * 60 * 1000);

/** Tiny status hint in the sidebar ('syncing' | 'idle' | 'error'). */
/** @param {string} state */
function _gcalSetSyncState(state) {
  const el = document.getElementById('gcal-sync-state');
  if (!el) return;
  el.textContent = state === 'syncing' ? 'Syncing…' : state === 'error' ? 'Sync failed' : '';
}

// ── Schedule-sidebar block (rendered under the layer toggles) ────────────────
// Connect/disconnect live in the account menu (top-right ≡ →
// _gcalRenderMenuSection); the sidebar keeps only a Sync button while
// connected.
function _gcalSidebarHTML() {
  if (!_userId || !_gcalConn.connected) return '';
  return `<div class="gcal-status-row">
    <button type="button" class="gcal-sync-btn" title="Sync with Google Calendar now" onclick="_gcalSyncNow('manual')">⟳ Sync</button>
    <span id="gcal-sync-state" class="gcal-sync-state"></span>
  </div>`;
}

// ── Account-menu section (top-right ≡ → "Calendar") ─────────────────────────
function _gcalRenderMenuSection() {
  const host = document.getElementById('account-gcal-body');
  if (!host) return;
  if (!_gcalConn.connected) {
    const label = _gcalConn.reauth || _gcalConn.status === 'error'
      ? 'Reconnect Google Calendar' : 'Connect Google Calendar';
    host.innerHTML = `<button class="btn btn-outline btn-sm" style="width:100%;justify-content:center"
      onclick="toggleAccount();_gcalConnect()">${label}</button>`;
    return;
  }
  host.innerHTML = `
    <div style="font-size:11px;color:var(--muted);margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
      Connected${_gcalConn.email ? ' · ' + _escHtml(_gcalConn.email) : ''}
    </div>
    <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center"
      onclick="toggleAccount();_gcalDisconnect()">Disconnect Google Calendar</button>`;
}

/** Google overlay events overlapping [start, end). @param {Date} start @param {Date} end */
function _gcalEventsBetween(start, end) {
  if (typeof _schedLayers !== 'undefined' && !_schedLayers.google) return [];
  if (!_gcalConn.connected || !gcalOverlayEvents.length) return [];
  return gcalOverlayEvents.filter(g => {
    const s = new Date(g.start), e = new Date(g.end);
    return e > start && s < end;
  });
}

Object.assign(window, {
  loadGcalStatus, handleGcalReturn, _gcalConnect, _gcalDisconnect,
  _gcalSyncNow, _gcalQueueSync, _gcalSidebarHTML, _gcalRenderMenuSection,
  _gcalEventsBetween,
});
