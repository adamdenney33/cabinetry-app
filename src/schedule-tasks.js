// ProCabinet — Schedule tasks (SV.5): standalone timed tasks on the Schedule
// tab. Non-order work (deliveries, site visits, admin) stored in
// public.schedule_tasks (SCHEMA.md § 3.29) and rendered alongside
// scheduler-placed order blocks in the Day/Week/Month views.
//
// Loaded as a classic <script defer> BEFORE src/schedule-views.js and
// src/schedule.js, which consume `scheduleTasks` + the helpers here.
// Cross-file dependencies (globals): _db, _userId, _requireAuth, _openPopup,
// _closePopup, _popupVal, _toast, _confirm, _escHtml, renderSchedule.

// Single task colour by design (2026-07-11): one task type, one colour.
const TASK_COLOR = '#0d9488';

/** In-memory mirror of public.schedule_tasks, sorted by start_at asc.
 *  @type {import('./database.types').Tables<'schedule_tasks'>[]} */
let scheduleTasks = [];

async function loadScheduleTasks() {
  if (!_userId) { scheduleTasks = []; return; }
  try {
    const { data, error } = await _db('schedule_tasks')
      .select('*')
      .order('start_at', { ascending: true });
    if (error) { console.warn('[schedule_tasks] load failed:', error.message); return; }
    scheduleTasks = data || [];
  } catch (e) {
    console.warn('[schedule_tasks] load exception:', (/** @type {any} */ (e)).message || e);
  }
}

/** @param {number} id */
function _taskById(id) { return scheduleTasks.find(t => t.id === id) || null; }

// ── Local-time helpers ──
// schedule_tasks stores timestamptz; everything below renders/edits in the
// browser's local time (matching how the scheduler treats dates).
/** @param {Date} d → 'YYYY-MM-DD' */
function _taskDateISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** @param {Date} d → 'HH:MM' */
function _taskTimeStr(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** Combine 'YYYY-MM-DD' + 'HH:MM' into a Date (local).
 *  @param {string} dateISO @param {string} time */
function _taskCombine(dateISO, time) {
  const dm = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = (time || '00:00').match(/^(\d{1,2}):(\d{2})$/);
  if (!dm) return null;
  return new Date(parseInt(dm[1]), parseInt(dm[2]) - 1, parseInt(dm[3]),
    tm ? parseInt(tm[1]) : 0, tm ? parseInt(tm[2]) : 0);
}
/** Short 'HH:MM' label for a task's start.
 *  @param {import('./database.types').Tables<'schedule_tasks'>} t */
function _taskStartLabel(t) {
  return t.all_day ? '' : _taskTimeStr(new Date(t.start_at));
}

/** Tasks overlapping [start, end) — both Date objects (local midnights).
 *  @param {Date} start @param {Date} end */
function _tasksBetween(start, end) {
  return scheduleTasks.filter(t => {
    const s = new Date(t.start_at), e = new Date(t.end_at);
    return e > start && s < end;
  });
}

// ── Order link (SCHEMA.md § 3.29 order_id) ──
// A task may belong to an order — deliveries, installs, site visits. The link is
// an attribute of the task; the task stays first-class (deleting the order sets
// order_id null). The helpers below are the one read/write surface reused by the
// popup picker and every drag-drop target (day/week block, month bar, sidebar).

/** The order a task belongs to, or null. @param {any} t @returns {any} */
function _taskOrder(t) {
  const oid = t && /** @type {any} */ (t).order_id;
  return (oid != null && typeof orders !== 'undefined') ? (orders.find(o => o.id === oid) || null) : null;
}

/** Tasks linked to an order, in start order (scheduleTasks is already sorted).
 *  @param {number} orderId */
function _orderTasks(orderId) {
  return scheduleTasks.filter(t => /** @type {any} */ (t).order_id === orderId);
}

/** Short display label for an order id — "0007 · Client" (mirrors the sidebar's
 *  numberLabel), or '' if the order is unknown. @param {number} orderId */
function _taskOrderLabelById(orderId) {
  const o = (typeof orders !== 'undefined') ? orders.find(x => x.id === orderId) : null;
  if (!o) return '';
  const num = o.order_number || ('ORD-' + String(o.id).padStart(4, '0'));
  const client = (typeof orderClient === 'function') ? (orderClient(o) || '') : '';
  return [num, client].filter(Boolean).join(' · ');
}

/** Link (orderId>0) or unlink (0/null) a task to an order — the single write
 *  path for the popup picker and every drag-drop target. Optimistic, then one DB
 *  update. order_id is app-internal and deliberately NOT synced to GCal.
 *  @param {number} taskId @param {number|null} orderId */
async function _assignTaskOrder(taskId, orderId) {
  const t = _taskById(taskId);
  if (!t) return;
  const next = orderId || null;
  if ((/** @type {any} */ (t).order_id ?? null) === next) return; // no-op — same order
  const now = new Date().toISOString();
  /** @type {any} */ (t).order_id = next;   // optimistic
  /** @type {any} */ (t).updated_at = now;
  if (typeof renderSchedule === 'function') renderSchedule();
  const { error } = await _db('schedule_tasks').update({ order_id: next, updated_at: now }).eq('id', taskId);
  if (error) { console.warn('[schedule_tasks] order link failed:', error.message); _toast('Save failed — check connection', 'error'); return; }
  const label = next ? _taskOrderLabelById(next) : '';
  _toast(next ? `Task linked to ${label || 'order'}` : 'Task unlinked from order', 'success');
}

// ── Create / edit popup ──
/** Open the task popup. id=0 → create. presetStart is an optional Date used
 *  by grid clicks ("new task at that slot") and +Task buttons. presetOrderId
 *  pre-links a new task to an order (e.g. the order popup's "+ Add task").
 *  @param {number} id @param {Date} [presetStart] @param {boolean} [presetAllDay] @param {number} [presetOrderId] */
function _openTaskPopup(id, presetStart, presetAllDay, presetOrderId) {
  if (!_requireAuth()) return;
  const t = id ? _taskById(id) : null;
  if (id && !t) return;
  const start = t ? new Date(t.start_at) : (presetStart || (() => { const d = new Date(); d.setMinutes(0, 0, 0); return new Date(+d + 3600000); })());
  const end = t ? new Date(t.end_at) : new Date(+start + 3600000);
  const allDay = t ? !!t.all_day : !!presetAllDay;
  // Defaults to on: a task is real committed time, so it should cost the
  // production queue hours unless the user says otherwise.
  const allocate = t ? /** @type {any} */ (t).allocate_hours !== false : true;
  // Auto = the production queue places this task by priority, like an order.
  // Only coherent alongside "Allocate hours" and only for timed (non-all-day)
  // tasks — an all-day task blocks the whole day rather than asking for a slice.
  const auto = t ? /** @type {any} */ (t).auto_schedule === true : false;
  const autoOk = allocate && !allDay;
  _tkEditingId = t ? t.id : 0;
  _tkOrderId = t ? (/** @type {any} */ (t).order_id || 0) : (presetOrderId || 0);
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">${t ? 'Edit Task' : 'New Task'}</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">TITLE</label><input class="pf-input pf-input-lg" id="ptk-title" value="${t ? _escHtml(t.title) : ''}" placeholder="e.g. Delivery — Oak St install"></div>
      <div class="pf"><label class="pf-label">ORDER</label>
        <div class="smart-input-wrap">
          <input class="pf-input" id="ptk-order" autocomplete="off" placeholder="Link to an order (optional)…"
            value="${_tkOrderId ? _escHtml(_taskOrderLabelById(_tkOrderId)) : ''}"
            oninput="_taskOrderSuggest(this,'ptk-order-suggest')"
            onfocus="_taskOrderSuggest(this,'ptk-order-suggest')"
            onblur="setTimeout(()=>_hideEl('ptk-order-suggest'),150)">
        </div>
        <div id="ptk-order-suggest" class="client-suggest-list" style="display:none"></div>
      </div>
      <div class="pf-row">
        <div class="pf" style="flex:1.3"><label class="pf-label">DATE<span class="sched-field-hint" id="ptk-date-hint"${auto ? '' : ' style="display:none"'}> (auto)</span></label><input class="pf-input" id="ptk-date" type="date" value="${_taskDateISO(start)}" ${auto ? 'disabled title="Auto-scheduled — toggle off to set the date manually"' : ''}></div>
        <div class="pf" style="flex:0.9${allDay || auto ? ';display:none' : ''}" id="ptk-start-wrap"><label class="pf-label">START</label><input class="pf-input" id="ptk-start" type="time" value="${_taskTimeStr(start)}" oninput="_taskStartChanged()"></div>
        <div class="pf" style="flex:0.7${allDay ? ';display:none' : ''}" id="ptk-hours-wrap"><label class="pf-label">HOURS</label><input class="pf-input" id="ptk-hours" type="number" min="0.25" step="0.25" value="${Math.round((+end - +start) / 36000) / 100}" oninput="_taskHoursChanged()"></div>
        <div class="pf" style="flex:0.9${allDay || auto ? ';display:none' : ''}" id="ptk-end-wrap"><label class="pf-label">END</label><input class="pf-input" id="ptk-end" type="time" value="${_taskTimeStr(end)}" oninput="_taskEndChanged()"></div>
      </div>
      <div class="pf" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ptk-allday" ${allDay ? 'checked' : ''} ${auto ? 'disabled' : ''} onchange="_taskToggleAllDay(this.checked)"> All day</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer" title="On: this task's time comes out of the day's order capacity. Off: it costs the production queue nothing and just overlays the orders."><input type="checkbox" id="ptk-allocate" ${allocate ? 'checked' : ''} onchange="_taskToggleAllocate(this.checked)"> Allocate hours</label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer" title="On: the production queue places this task by priority, like an order — you set the hours, it picks the day. Off: it stays on the date you set."><input type="checkbox" id="ptk-auto" ${auto ? 'checked' : ''} ${autoOk ? '' : 'disabled'} onchange="_taskToggleAuto(this.checked)"> Auto schedule</label>
        ${t ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ptk-done" ${t.done ? 'checked' : ''}> Done</label>` : ''}
      </div>
      <div class="pf" id="ptk-pri-wrap" style="${auto ? '' : 'display:none'}">
        <label class="pf-label">PRIORITY</label>
        ${_priorityStepperHTML('ptk-priority', (t && /** @type {any} */ (t).priority) || '', '')}
      </div>
      <div class="pf"><label class="pf-label">NOTES</label><textarea class="pf-textarea" id="ptk-notes" rows="2" placeholder="Optional notes...">${t && t.notes ? _escHtml(t.notes) : ''}</textarea></div>
    </div>
    <div class="popup-footer">
      ${t ? `<button class="btn btn-outline" style="color:#f87171;border-color:#f8717155" onclick="_deleteTaskFromPopup(${t.id})">Delete</button>
      <button class="btn btn-outline" style="margin-right:auto" onclick="_duplicateTaskFromPopup(${t.id})">Duplicate</button>` : ''}
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveTaskPopup(${t ? t.id : 0})">${t ? 'Save' : 'Add Task'}</button>
    </div>`;
  _openPopup(html, 'sm');
}

/** Task id backing the open popup (0 = creating), so the toggle handlers can
 *  reach the row's computed placement. Mirrors _psoOrderId in schedule.js. */
let _tkEditingId = 0;

/** Order the popup is currently linked to (0 = none). Set by _taskPickOrder,
 *  read by _saveTaskPopup — the input text is display only. */
let _tkOrderId = 0;

/** Order picker for the task popup — search-as-you-type over ALL orders (by
 *  number / client / project). Select-only, no create (mirrors _oOrderSuggest
 *  but not scoped to a client). @param {HTMLInputElement} input @param {string} boxId */
function _taskOrderSuggest(input, boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const all = (typeof orders !== 'undefined') ? orders.slice() : [];
  const q = input.value.trim().toLowerCase();
  // When an order is already linked its label sits in the box; don't let that
  // prefill filter the list down to one word — treat it as "no query".
  const linkedLabel = _tkOrderId ? _taskOrderLabelById(_tkOrderId).toLowerCase() : '';
  const eff = (q && q !== linkedLabel) ? q : '';
  const scored = all.map(o => {
    const num = String(o.order_number || ('ORD-' + String(o.id).padStart(4, '0')));
    const client = (typeof orderClient === 'function') ? (orderClient(o) || '') : '';
    const project = (typeof orderProject === 'function') ? (orderProject(o) || '') : '';
    return { o, hay: `${num} ${client} ${project}`.toLowerCase() };
  });
  const matches = (eff ? scored.filter(s => s.hay.includes(eff)) : scored)
    .sort((a, b) => (+new Date(b.o.updated_at || 0)) - (+new Date(a.o.updated_at || 0)));
  let html = '';
  matches.slice(0, 8).forEach(({ o }) => {
    const active = o.id === _tkOrderId;
    const st = o.status ? `<span class="csi-meta">${_escHtml(String(o.status))}</span>` : '';
    html += `<div class="client-suggest-item" onmousedown="_taskPickOrder(${o.id})">
      <span class="suggest-icon" style="background:var(--accent-dim);color:var(--accent)">#</span>
      <span class="csi-name">${_escHtml(_taskOrderLabelById(o.id))}${active ? ' <span style="font-weight:500;color:var(--accent);font-size:11px">· linked</span>' : ''}</span>
      ${st}
    </div>`;
  });
  if (!matches.length) html += `<div class="client-suggest-add" style="color:var(--muted)">No matching orders</div>`;
  // Clear row — always present so a task can be unlinked from here.
  html += `<div class="client-suggest-item client-suggest-add" onmousedown="_taskPickOrder(0)">
    <span class="csi-icon">&times;</span><span class="csi-name">No order${_tkOrderId ? ' (clear link)' : ''}</span>
  </div>`;
  box.innerHTML = html;
  box.style.display = 'block';
}

/** Set/clear the popup's order link (does not persist — _saveTaskPopup writes
 *  it). @param {number} id  0 = clear */
function _taskPickOrder(id) {
  _tkOrderId = id || 0;
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-order'));
  if (input) input.value = id ? _taskOrderLabelById(id) : '';
  _hideEl('ptk-order-suggest');
}

/** @param {boolean} allDay */
function _taskToggleAllDay(allDay) {
  const autoOn = _tkAutoChecked();
  for (const id of ['ptk-start-wrap', 'ptk-hours-wrap', 'ptk-end-wrap']) {
    const el = document.getElementById(id);
    if (!el) continue;
    // HOURS stays visible under auto (it's the input the queue needs); START and
    // END do not — the scheduler picks the time of day.
    const hiddenByAuto = autoOn && id !== 'ptk-hours-wrap';
    el.style.display = (allDay || hiddenByAuto) ? 'none' : '';
  }
  // All-day and auto are mutually exclusive: all-day blocks the whole day,
  // auto asks for a finite slice of one.
  _tkSetAutoEnabled(!allDay && _tkAllocateChecked());
}

/** @returns {boolean} */
function _tkAutoChecked() {
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-auto'));
  return !!(el && el.checked);
}
/** @returns {boolean} */
function _tkAllocateChecked() {
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-allocate'));
  return !el || el.checked;
}
/** Enable/disable the auto checkbox, force-unticking it when it becomes
 *  unavailable so an incoherent combination can't be saved.
 *  @param {boolean} ok */
function _tkSetAutoEnabled(ok) {
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-auto'));
  if (!el) return;
  el.disabled = !ok;
  if (!ok && el.checked) { el.checked = false; _taskToggleAuto(false); }
}

/** "Allocate hours" drives whether auto is even meaningful — a task that costs
 *  the queue nothing has no business being placed by it.
 *  @param {boolean} on */
function _taskToggleAllocate(on) {
  const allDayEl = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-allday'));
  _tkSetAutoEnabled(on && !(allDayEl && allDayEl.checked));
}

/** Auto-schedule toggle. The model flips from "when and how long" (pinned) to
 *  "how long and how urgent" (auto): DATE goes read-only, START/END disappear,
 *  HOURS becomes the primary input, and PRIORITY appears.
 *  @param {boolean} auto */
function _taskToggleAuto(auto) {
  for (const id of ['ptk-start-wrap', 'ptk-end-wrap']) {
    const el = document.getElementById(id);
    if (el) el.style.display = auto ? 'none' : '';
  }
  const pri = document.getElementById('ptk-pri-wrap');
  if (pri) pri.style.display = auto ? '' : 'none';
  const date = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-date'));
  if (date) {
    date.disabled = auto;
    date.title = auto ? 'Auto-scheduled — toggle off to set the date manually' : '';
  }
  const hint = document.getElementById('ptk-date-hint');
  if (hint) hint.style.display = auto ? '' : 'none';
  const allDayEl = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-allday'));
  if (allDayEl) allDayEl.disabled = auto;
  // Turning auto OFF: seed the pin from where the scheduler last placed it, so
  // the task doesn't teleport back to a stale date. Mirrors _psoAutoToggle.
  if (!auto && _tkEditingId && date) {
    const p = typeof _taskPlacement === 'function' ? _taskPlacement(_taskById(_tkEditingId)) : null;
    if (p && p.startISO) date.value = p.startISO;
  }
  // HOURS is the driver under auto — make sure it holds a usable number.
  const h = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-hours'));
  if (auto && h && !(parseFloat(h.value) > 0)) h.value = '1';
}

// ── Start / Hours / End are live-linked (GCal behaviour) ─────────────────────
// Hours → moves End; End → recalculates Hours; Start → keeps Hours, moves End.
/** 'HH:MM' field → minutes from midnight, or null. @param {string} id */
function _tkMin(id) {
  const m = _popupVal(id).match(/^(\d{1,2}):(\d{2})$/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null;
}
/** Write minutes-from-midnight into a time field (clamped to the day).
 *  @param {string} id @param {number} mins */
function _tkSetTime(id, mins) {
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
  if (!el) return;
  const v = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  el.value = `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}
function _taskHoursChanged() {
  const s = _tkMin('ptk-start');
  const h = parseFloat(_popupVal('ptk-hours'));
  if (s == null || !isFinite(h) || h <= 0) return;
  _tkSetTime('ptk-end', s + h * 60);
}
function _taskStartChanged() {
  const s = _tkMin('ptk-start');
  const h = parseFloat(_popupVal('ptk-hours'));
  if (s == null) return;
  if (isFinite(h) && h > 0) _tkSetTime('ptk-end', s + h * 60);
  else _taskEndChanged();
}
function _taskEndChanged() {
  const s = _tkMin('ptk-start'), e = _tkMin('ptk-end');
  const el = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-hours'));
  if (s == null || e == null || !el) return;
  if (e > s) el.value = String(Math.round((e - s) / 60 * 100) / 100);
}

/** @param {number} id  0 = create */
async function _saveTaskPopup(id) {
  if (!_requireAuth()) return;
  const title = _popupVal('ptk-title');
  if (!title) { _toast('Task title is required', 'error'); return; }
  const dateISO = _popupVal('ptk-date');
  if (!dateISO) { _toast('Pick a date', 'error'); return; }
  const allDayEl = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-allday'));
  const doneEl = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-done'));
  const allocateEl = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-allocate'));
  const allDay = !!(allDayEl && allDayEl.checked);
  // All-day tasks anchor at local NOON — midnight-anchored timestamps change
  // calendar date once converted to UTC (BST pushed them to Google a day
  // early, and pulled GCal all-day events bled into the next local day).
  let start = _taskCombine(dateISO, allDay ? '12:00' : _popupVal('ptk-start') || '08:00');
  if (!start) { _toast('Invalid date', 'error'); return; }
  let end = allDay
    ? _taskCombine(dateISO, '12:30')
    : _taskCombine(dateISO, _popupVal('ptk-end') || '');
  // Guard: end must follow start — silently default to +1h instead of nagging.
  if (!end || +end <= +start) end = new Date(+start + 3600000);

  const autoEl = /** @type {HTMLInputElement|null} */ (document.getElementById('ptk-auto'));
  const allocate = !allocateEl || allocateEl.checked;
  // Belt-and-braces: the UI disables auto in these states, but never persist a
  // combination _taskIsAutoPlaced would reject.
  const auto = !!(autoEl && autoEl.checked) && allocate && !allDay;
  if (auto) {
    // Under auto the scheduler picks the day and the time of day, so start_at /
    // end_at carry only the DURATION (plus a fallback pin for switching back).
    // Anchoring at 08:00 keeps the carrier canonical, so end_at − start_at reads
    // cleanly as the hours in the DB.
    const hrs = Math.max(0.25, parseFloat(_popupVal('ptk-hours')) || 1);
    start = _taskCombine(dateISO, '08:00') || start;
    end = new Date(+start + hrs * 3600000);
  }

  /** @type {any} */
  const body = {
    title,
    notes: _popupVal('ptk-notes') || null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: allDay,
    allocate_hours: allocate,
    auto_schedule: auto,
    priority: parseInt(_popupVal('ptk-priority'), 10) || 0,
    done: !!(doneEl && doneEl.checked),
    order_id: _tkOrderId || null,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const t = _taskById(id);
    if (t) Object.assign(t, body); // optimistic
    _closePopup();
    _sortScheduleTasks();
    renderSchedule();
    const { error } = await _db('schedule_tasks').update(body).eq('id', id);
    if (error) { console.warn('[schedule_tasks] update failed:', error.message); _toast('Save failed — check connection', 'error'); }
    else if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
  } else {
    body.user_id = _userId;
    _closePopup();
    const { data, error } = await _db('schedule_tasks').insert([body]).select().single();
    if (error || !data) {
      if (error) console.warn('[schedule_tasks] insert failed:', error.message);
      _toast('Save failed — check connection', 'error');
      return;
    }
    scheduleTasks.push(data);
    _sortScheduleTasks();
    renderSchedule();
    _toast('Task added', 'success');
    if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
  }
}

function _sortScheduleTasks() {
  scheduleTasks.sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
}

// ── Auto-scheduled tasks (placed by the queue, like an order) ───────────────
// A task is EITHER an input to the scheduler (a reservation that shrinks a
// day's capacity) OR an output of it (a placed queue item) — never both. That
// partition is what keeps `_schedTaskReservations` (an *argument to*
// computeSchedule) from depending on the result of the call it feeds:
//
//   allocate_hours = false  → neither: pure overlay, costs the queue nothing
//   allocate + pinned       → reserved: subtracts capacity on its pinned date
//   allocate + auto         → placed:   joins the priority queue like an order

/** A task the scheduler PLACES, rather than one the user pinned. Every surface
 *  that has to choose between "read start_at" and "read the computed
 *  placement" branches on THIS predicate — the partition above is only safe
 *  while both sides can't drift apart.
 *
 *  The three conjuncts beyond `auto_schedule` make each combination the UI
 *  can't produce degrade to today's pinned behaviour instead of to a blank
 *  placement: an all-day task reserves the whole day (incompatible with asking
 *  for an hours slice), a done task has no future placement to draw, and
 *  auto-without-allocate would let the queue stack unlimited free work into a
 *  day.
 *  @param {any} t */
function _taskIsAutoPlaced(t) {
  return !!t && t.auto_schedule === true
    && t.allocate_hours !== false
    && !t.all_day && !t.done;
}

/** Hours an auto task asks the queue for. start_at/end_at are the carrier —
 *  for an auto task only their DIFFERENCE is meaningful; the stored date is a
 *  fallback pin used if the user switches auto back off.
 *  @param {any} t */
function _taskDurationHours(t) {
  const h = (+new Date(t.end_at) - +new Date(t.start_at)) / 3600000;
  return Number.isFinite(h) && h > 0 ? h : 0;
}

/** Auto tasks shaped as pseudo-orders for computeSchedule. `hours_allocated`
 *  is read verbatim by orderHoursRequired(), so these need no `_lines`.
 *  The `task:<n>` id can never collide with a numeric order id, and order-side
 *  consumers only ever call `.get(numericId)`, so they never see these entries.
 *  @returns {any[]} */
function _schedAutoTaskOrders() {
  if (typeof scheduleTasks === 'undefined' || !Array.isArray(scheduleTasks)) return [];
  // Order-linked tasks are NOT independently queued — they pack inside their
  // order's bar (schedule-views.js). Only unlinked auto tasks become pseudo-orders.
  return scheduleTasks.filter(t => _taskIsAutoPlaced(t) && !(/** @type {any} */ (t).order_id)).map(t => ({
    id: 'task:' + t.id,
    // Numeric sort key — the scheduler's tie-break can't subtract string ids.
    // Offset so real orders win a priority tie.
    _schedTieBreak: 1e9 + t.id,
    _taskRow: t,
    priority: /** @type {any} */ (t).priority || 0,
    auto_schedule: true,
    status: 'active',            // must not be 'complete' — computeSchedule filters that
    hours_allocated: _taskDurationHours(t),
    run_over_hours: 0,
  }));
}

/** The list every computeSchedule call site passes: orders + auto tasks.
 *  @param {any[]} ordersList @returns {any[]} */
function _schedSchedulables(ordersList) {
  return (ordersList || []).concat(_schedAutoTaskOrders());
}

/** Guarded wrapper for call sites in files that load before this one — matches
 *  the existing `typeof _schedTaskReservations === 'function'` idiom.
 *  @param {any[]} ordersList @returns {any[]} */
function _schedList(ordersList) {
  return typeof _schedSchedulables === 'function' ? _schedSchedulables(ordersList) : ordersList;
}

// Hours each date owes to tasks, for computeSchedule to subtract from that
// day's order capacity. Only tasks with allocate_hours on are counted; the rest
// are pure overlay and cost the production queue nothing.
//
// All-day tasks reserve Infinity — they represent a day that isn't available
// for production at all, and the scheduler floors the remaining capacity at 0
// rather than trying to guess a partial figure. Timed tasks that straddle
// midnight are split across the dates they actually cover.
/** @returns {Record<string, number>} date (YYYY-MM-DD) → hours reserved */
function _schedTaskReservations() {
  /** @type {Record<string, number>} */
  const map = {};
  if (typeof scheduleTasks === 'undefined' || !Array.isArray(scheduleTasks)) return map;
  for (const t of scheduleTasks) {
    if (!t || /** @type {any} */ (t).allocate_hours === false) continue;
    // Order-linked tasks are drawn inside their order's bar and cost the queue
    // nothing on their own — they never reserve capacity.
    if (/** @type {any} */ (t).order_id) continue;
    // Auto tasks are PLACED by computeSchedule, not reserved from it. Counting
    // them here would both double-book their hours and make this map depend on
    // the result of the call it's an argument to.
    if (_taskIsAutoPlaced(t)) continue;
    const s = new Date(t.start_at), e = new Date(t.end_at);
    if (isNaN(+s) || isNaN(+e)) continue;
    if (t.all_day) { map[_taskDateISO(s)] = Infinity; continue; }
    if (+e <= +s) continue;
    // Walk the local days the task touches, adding only the overlapping slice
    // of each so a task running 23:00→01:00 bills both dates correctly.
    let day = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    let guard = 400;
    while (+day <= +e && guard-- > 0) {
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
      const from = Math.max(+s, +day), to = Math.min(+e, +dayEnd);
      if (to > from) {
        const iso = _taskDateISO(day);
        map[iso] = (map[iso] || 0) + (to - from) / 3600000;
      }
      day = dayEnd;
    }
  }
  return map;
}

/** Duplicate a task from its edit popup: insert a copy of the SAVED row
 *  (done reset to false), then open the copy for editing — the usual reason
 *  to duplicate is "same job, different day".
 *  @param {number} id */
async function _duplicateTaskFromPopup(id) {
  if (!_requireAuth()) return;
  const t = _taskById(id);
  if (!t) return;
  _closePopup();
  /** @type {any} */
  const body = {
    user_id: _userId,
    title: t.title,
    notes: t.notes,
    start_at: t.start_at,
    end_at: t.end_at,
    all_day: t.all_day,
    allocate_hours: /** @type {any} */ (t).allocate_hours !== false,
    auto_schedule: /** @type {any} */ (t).auto_schedule === true,
    priority: /** @type {any} */ (t).priority || 0,
    done: false,
    order_id: /** @type {any} */ (t).order_id || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await _db('schedule_tasks').insert([body]).select().single();
  if (error || !data) {
    if (error) console.warn('[schedule_tasks] duplicate failed:', error.message);
    _toast('Duplicate failed — check connection', 'error');
    return;
  }
  scheduleTasks.push(data);
  _sortScheduleTasks();
  renderSchedule();
  _toast('Task duplicated', 'success');
  if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
  _openTaskPopup(data.id);
}

/** @param {number} id */
function _deleteTaskFromPopup(id) {
  _confirm('Delete this task?', async () => {
    _closePopup();
    scheduleTasks = scheduleTasks.filter(t => t.id !== id);
    renderSchedule();
    const { error } = await _db('schedule_tasks').delete().eq('id', id);
    if (error) { console.warn('[schedule_tasks] delete failed:', error.message); _toast('Delete failed — check connection', 'error'); }
    else if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
  });
}

// ── Sidebar task list (SV.10) ──
// Collapsible to-do list in the Schedule sidebar: open tasks (checkbox to
// tick off, click to edit) + recently completed, with a + to create. Same
// <details> pattern as the Working Hours section (schedule.js).

/** Persist the Tasks section's open/closed state. Default open — it's the
 *  to-do list. @param {HTMLDetailsElement} el */
function _schedTasksToggle(el) {
  try { localStorage.setItem('pc_sched_tasks_open', String(el.open)); } catch (e) {}
}

const _TASK_MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Friendly one-line date label for a sidebar task row.
 *  @param {import('./database.types').Tables<'schedule_tasks'>} t */
function _schedTaskDayLabel(t) {
  // Order-linked tasks live inside their order's bar — report the order's
  // scheduled day (from the last computed queue), not the task's own time.
  const oid = /** @type {any} */ (t).order_id;
  if (oid) {
    const p = (typeof _schedLastComputed !== 'undefined' && _schedLastComputed && _schedLastComputed.get)
      ? _schedLastComputed.get(oid) : null;
    const iso = p && p.startISO;
    const m = iso && String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const y = parseInt(m[1]);
      return `In order · ${parseInt(m[3])} ${_TASK_MON_SHORT[parseInt(m[2]) - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
    }
    return 'In order';
  }
  // Auto tasks: report where the SCHEDULER put it, not the stored pin. No clock
  // time — the queue owns the day, not an hour of it.
  if (_taskIsAutoPlaced(t)) {
    const p = typeof _taskPlacement === 'function' ? _taskPlacement(t) : null;
    const iso = p && p.startISO;
    if (!iso) return 'Auto · unplaced';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 'Auto';
    const y = parseInt(m[1]);
    return `Auto · ${parseInt(m[3])} ${_TASK_MON_SHORT[parseInt(m[2]) - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
  }
  const s = new Date(t.start_at);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const diff = Math.round((+day - +today) / 86400000);
  let d;
  if (diff === 0) d = 'Today';
  else if (diff === 1) d = 'Tomorrow';
  else if (diff === -1) d = 'Yesterday';
  else d = `${s.getDate()} ${_TASK_MON_SHORT[s.getMonth()]}${s.getFullYear() !== today.getFullYear() ? ' ' + s.getFullYear() : ''}`;
  return t.all_day ? d : `${d} · ${_taskTimeStr(s)}`;
}

/** Checkbox tick in the sidebar list — optimistic done toggle, one DB write.
 *  @param {number} id @param {boolean} done */
async function _taskToggleDoneQuick(id, done) {
  const t = _taskById(id);
  if (!t) return;
  t.done = done;
  renderSchedule();
  const { error } = await _db('schedule_tasks')
    .update({ done, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.warn('[schedule_tasks] done toggle failed:', error.message); _toast('Save failed — check connection', 'error'); }
  else if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
}

/** One sidebar to-do row.
 *  @param {import('./database.types').Tables<'schedule_tasks'>} t @param {number} nowMs */
function _schedTaskRowHTML(t, nowMs) {
  // end_at is a stale duration carrier for an auto task, so comparing it to now
  // would mark every one of them permanently overdue.
  const overdue = !t.done && !_taskIsAutoPlaced(t) && +new Date(t.end_at) < nowMs;
  // Draggable so it can be dropped onto an order (sidebar row / month bar) to
  // link it — reuses the month-chip drag id in schedule-views.js.
  const linkedTag = /** @type {any} */ (t).order_id
    ? `<span class="stl-order" title="Linked to order">${_escHtml(_taskOrderLabelById(/** @type {any} */ (t).order_id) || 'Order')}</span>`
    : '';
  return `<div class="sched-task-row${t.done ? ' done' : ''}" draggable="true" ondragstart="_taskChipDragStart(event,${t.id})" ondragend="_taskChipDragEnd()" onclick="_openTaskPopup(${t.id})">
    <input type="checkbox" ${t.done ? 'checked' : ''} onclick="event.stopPropagation()" onchange="_taskToggleDoneQuick(${t.id},this.checked)" title="${t.done ? 'Mark as not done' : 'Mark as done'}">
    <div class="stl-main">
      <div class="stl-title">${_escHtml(t.title)}</div>
      <div class="stl-meta${overdue ? ' overdue' : ''}">${_schedTaskDayLabel(t)}${linkedTag}</div>
    </div>
  </div>`;
}

/** The collapsible Tasks <details> section for the Schedule sidebar (and the
 *  mobile agenda). Open tasks chronologically, then up to 6 recently
 *  completed, greyed. */
function _schedTaskListHTML() {
  const isOpen = localStorage.getItem('pc_sched_tasks_open') !== 'false';
  const open = scheduleTasks.filter(t => !t.done);
  const done = scheduleTasks.filter(t => t.done).slice(-6).reverse();
  const nowMs = Date.now();
  let rows = open.map(t => _schedTaskRowHTML(t, nowMs)).join('');
  rows += done.map(t => _schedTaskRowHTML(t, nowMs)).join('');
  if (!rows) rows = `<div style="font-size:12px;color:var(--muted)">No tasks yet — add one with +</div>`;
  return `<details class="sched sched-tasks-section" id="sched-tasks-details" ${isOpen ? 'open' : ''} ontoggle="_schedTasksToggle(this)">
    <summary>
      <span class="chev"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="sched-label">Tasks</span>
      <span class="sched-summary">${open.length ? `${open.length} open` : ''}</span>
      <button type="button" class="sched-tasks-add" title="Add task" aria-label="Add task" onclick="event.preventDefault();event.stopPropagation();_schedNewTaskFromBar()">+</button>
    </summary>
    <div class="sched-body">${rows}</div>
  </details>`;
}

// ── Drag persistence (SV.6) ──
// Optimistic in-memory move + debounced DB write, so a drag (or a burst of
// nudges) coalesces into one update — same pattern as the priority stepper.
/** @type {Map<number, ReturnType<typeof setTimeout>>} */
const _taskMoveTimers = new Map();

/** @param {number} id @param {Date} start @param {Date} end */
function _persistTaskTimes(id, start, end) {
  const t = _taskById(id);
  if (!t) return;
  // The scheduler owns an auto task's dates. The drag/resize/chip handlers are
  // no longer emitted for them, but this is the single write funnel — a stray
  // path here would corrupt the duration carrier.
  if (_taskIsAutoPlaced(t)) return;
  t.start_at = start.toISOString();
  t.end_at = end.toISOString();
  _sortScheduleTasks();
  if (!_userId) return;
  const prev = _taskMoveTimers.get(id);
  if (prev) clearTimeout(prev);
  _taskMoveTimers.set(id, setTimeout(async () => {
    _taskMoveTimers.delete(id);
    const latest = _taskById(id);
    if (!latest) return;
    const { error } = await _db('schedule_tasks')
      .update({ start_at: latest.start_at, end_at: latest.end_at, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { console.warn('[schedule_tasks] move failed:', error.message); _toast('Save failed — check connection', 'error'); }
    else if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
  }, 500));
}
