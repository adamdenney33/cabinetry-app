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

// ── Create / edit popup ──
/** Open the task popup. id=0 → create. presetStart is an optional Date used
 *  by grid clicks ("new task at that slot") and +Task buttons.
 *  @param {number} id @param {Date} [presetStart] @param {boolean} [presetAllDay] */
function _openTaskPopup(id, presetStart, presetAllDay) {
  if (!_requireAuth()) return;
  const t = id ? _taskById(id) : null;
  if (id && !t) return;
  const start = t ? new Date(t.start_at) : (presetStart || (() => { const d = new Date(); d.setMinutes(0, 0, 0); return new Date(+d + 3600000); })());
  const end = t ? new Date(t.end_at) : new Date(+start + 3600000);
  const allDay = t ? !!t.all_day : !!presetAllDay;
  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">${t ? 'Edit Task' : 'New Task'}</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pf"><label class="pf-label">TITLE</label><input class="pf-input pf-input-lg" id="ptk-title" value="${t ? _escHtml(t.title) : ''}" placeholder="e.g. Delivery — Oak St install"></div>
      <div class="pf-row">
        <div class="pf" style="flex:1.3"><label class="pf-label">DATE</label><input class="pf-input" id="ptk-date" type="date" value="${_taskDateISO(start)}"></div>
        <div class="pf" style="flex:0.9${allDay ? ';display:none' : ''}" id="ptk-start-wrap"><label class="pf-label">START</label><input class="pf-input" id="ptk-start" type="time" value="${_taskTimeStr(start)}" oninput="_taskStartChanged()"></div>
        <div class="pf" style="flex:0.7${allDay ? ';display:none' : ''}" id="ptk-hours-wrap"><label class="pf-label">HOURS</label><input class="pf-input" id="ptk-hours" type="number" min="0.25" step="0.25" value="${Math.round((+end - +start) / 36000) / 100}" oninput="_taskHoursChanged()"></div>
        <div class="pf" style="flex:0.9${allDay ? ';display:none' : ''}" id="ptk-end-wrap"><label class="pf-label">END</label><input class="pf-input" id="ptk-end" type="time" value="${_taskTimeStr(end)}" oninput="_taskEndChanged()"></div>
      </div>
      <div class="pf" style="display:flex;align-items:center;gap:14px">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ptk-allday" ${allDay ? 'checked' : ''} onchange="_taskToggleAllDay(this.checked)"> All day</label>
        ${t ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text2);cursor:pointer"><input type="checkbox" id="ptk-done" ${t.done ? 'checked' : ''}> Done</label>` : ''}
      </div>
      <div class="pf"><label class="pf-label">NOTES</label><textarea class="pf-textarea" id="ptk-notes" rows="2" placeholder="Optional notes...">${t && t.notes ? _escHtml(t.notes) : ''}</textarea></div>
    </div>
    <div class="popup-footer">
      ${t ? `<button class="btn btn-outline" style="color:#f87171;border-color:#f8717155;margin-right:auto" onclick="_deleteTaskFromPopup(${t.id})">Delete</button>` : ''}
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveTaskPopup(${t ? t.id : 0})">${t ? 'Save' : 'Add Task'}</button>
    </div>`;
  _openPopup(html, 'sm');
}

/** @param {boolean} allDay */
function _taskToggleAllDay(allDay) {
  for (const id of ['ptk-start-wrap', 'ptk-hours-wrap', 'ptk-end-wrap']) {
    const el = document.getElementById(id);
    if (el) el.style.display = allDay ? 'none' : '';
  }
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
  /** @type {any} */
  const body = {
    title,
    notes: _popupVal('ptk-notes') || null,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: allDay,
    done: !!(doneEl && doneEl.checked),
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
  const overdue = !t.done && +new Date(t.end_at) < nowMs;
  return `<div class="sched-task-row${t.done ? ' done' : ''}" onclick="_openTaskPopup(${t.id})">
    <input type="checkbox" ${t.done ? 'checked' : ''} onclick="event.stopPropagation()" onchange="_taskToggleDoneQuick(${t.id},this.checked)" title="${t.done ? 'Mark as not done' : 'Mark as done'}">
    <div class="stl-main">
      <div class="stl-title">${_escHtml(t.title)}</div>
      <div class="stl-meta${overdue ? ' overdue' : ''}">${_schedTaskDayLabel(t)}</div>
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
