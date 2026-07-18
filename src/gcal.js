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

/** Read-only overlay events from the user's Google Calendar (untagged ones;
 *  `cal` names the source calendar for non-primary selections, GC.7).
 *  @type {{ id: string, title: string, start: string, end: string, allDay: boolean, cal?: string }[]} */
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
      new Date(today.getFullYear(), today.getMonth(), today.getDate()), (typeof _schedTaskReservations === 'function' ? _schedTaskReservations() : undefined));
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

/** First-sync-on-open guard. Boot no longer syncs Google (it added a slow
 *  1–13s edge call to every load); instead the first time the Schedule tab is
 *  opened this session we sync once, then the 5-min interval keeps it fresh.
 *  Only trips once connected — if status hasn't loaded yet the next open retries. */
let _gcalOpenSynced = false;
function _gcalSyncOnScheduleOpen() {
  if (_gcalOpenSynced || !_gcalConn.connected) return;
  _gcalOpenSynced = true;
  if (typeof _gcalSyncNow === 'function') _gcalSyncNow('open');
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
    <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center;margin-bottom:6px"
      onclick="toggleAccount();_gcalOpenCalendarsPopup()">Choose calendars…</button>
    <button class="btn btn-outline btn-sm" style="width:100%;justify-content:center"
      onclick="toggleAccount();_gcalDisconnect()">Disconnect Google Calendar</button>`;
}

// ── Calendar picker (GC.7) ───────────────────────────────────────────────────
// Which of the user's Google calendars feed the read-only overlay. Orders and
// tasks always sync with the primary calendar regardless of this selection.
async function _gcalOpenCalendarsPopup() {
  if (!_requireAuth() || !_gcalConn.connected) return;
  _openPopup(`
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">Google Calendars</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body" id="pgc-body">
      <div style="font-size:12px;color:var(--muted);padding:14px 0;text-align:center">Loading your calendars…</div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" id="pgc-save" onclick="_gcalSaveCalendars()" disabled>Save</button>
    </div>`, 'sm');
  const bodyEl = () => document.getElementById('pgc-body');
  try {
    const res = await _gcalFn('calendars');
    const body = bodyEl();
    if (!body) return; // popup closed while loading
    if (res.needsReconnect) {
      body.innerHTML = `<div style="font-size:12px;line-height:1.5;color:var(--text2)">
        Your Google connection predates calendar choosing — reconnect once to
        grant the (read-only) calendar list permission.</div>
        <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:10px"
          onclick="_closePopup();_gcalConnect()">Reconnect Google Calendar</button>`;
      return;
    }
    if (!Array.isArray(res.calendars) || !res.calendars.length) {
      body.innerHTML = `<div style="font-size:12px;color:var(--muted)">No calendars found.</div>`;
      return;
    }
    const selected = new Set(Array.isArray(res.selected) ? res.selected : ['primary']);
    body.innerHTML = `
      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;line-height:1.45">
        Ticked calendars show in your Schedule as read-only events. Orders and
        tasks always sync with your main calendar.</div>
      <div id="pgc-list" style="display:flex;flex-direction:column;gap:7px;max-height:300px;overflow-y:auto">
        ${res.calendars.map((/** @type {any} */ c) => `
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer">
            <input type="checkbox" class="pgc-cal" data-id="${_escHtml(c.id)}" data-summary="${_escHtml(c.summary)}"
              ${selected.has(c.id) ? 'checked' : ''} style="cursor:pointer">
            <span style="width:10px;height:10px;border-radius:3px;background:${c.color || '#4c8df6'};flex-shrink:0"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(c.summary)}${c.primary ? ' <span style="color:var(--muted);font-size:11px">(main)</span>' : ''}</span>
          </label>`).join('')}
      </div>`;
    const save = /** @type {HTMLButtonElement|null} */ (document.getElementById('pgc-save'));
    if (save) save.disabled = false;
  } catch (e) {
    const body = bodyEl();
    if (body) body.innerHTML = `<div style="font-size:12px;color:#f87171">Could not load calendars — ${_escHtml((/** @type {any} */ (e)).message || 'try again')}</div>`;
  }
}

async function _gcalSaveCalendars() {
  const boxes = /** @type {HTMLInputElement[]} */ (Array.from(document.querySelectorAll('.pgc-cal')));
  const calendars = boxes.filter(b => b.checked).map(b => ({ id: b.dataset.id, summary: b.dataset.summary }));
  const save = /** @type {HTMLButtonElement|null} */ (document.getElementById('pgc-save'));
  if (save) { save.disabled = true; save.textContent = 'Saving…'; }
  try {
    await _gcalFn('set-calendars', { calendars });
    _closePopup();
    _toast('Calendar selection saved — syncing…', 'success');
    _gcalSyncNow('calendars');
  } catch (e) {
    if (save) { save.disabled = false; save.textContent = 'Save'; }
    _toast((/** @type {any} */ (e)).message || 'Save failed', 'error');
  }
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
  _gcalEventsBetween, _gcalOpenCalendarsPopup, _gcalSaveCalendars,
  _gcalSyncOnScheduleOpen,
});
