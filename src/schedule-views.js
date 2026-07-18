// ProCabinet — Schedule Day/Week time-grid views + view switcher + layer
// toggles (SV.3/SV.4/SV.6/SV.7). Google-Calendar interaction cues on the
// app's existing visual language. Loaded as a classic <script defer> after
// src/schedule-tasks.js and before src/schedule.js (which calls into these
// helpers from renderSchedule).
//
// Cross-file dependencies (globals): cbSettings, scheduleTasks, TASK_COLOR,
// _tasksBetween, _taskDateISO, _taskTimeStr, _openTaskPopup,
// _persistTaskTimes, _openSchedOrderPopup, _escHtml, renderSchedule.

// ── Constants ──
const SCHED_HOUR_PX = 48;               // 1 hour of grid height
const SCHED_VIEWBAR_H = 44;             // viewbar height (sticky offsets)

// ── View state ──
/** @returns {'day'|'5day'|'week'|'month'} */
function _schedGetView() {
  try {
    const v = localStorage.getItem('pc_sched_view');
    if (v === 'day' || v === '5day' || v === 'week' || v === 'month') return v;
  } catch (e) {}
  return 'month';
}
/** @param {string} v */
function _schedSetView(v) {
  try { localStorage.setItem('pc_sched_view', v); } catch (e) {}
  if (typeof renderSchedule === 'function') renderSchedule();
}

/** Anchor date for Day/Week views (local midnight). In-memory only —
 *  reopening the tab always lands on today. */
let _schedAnchor = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();

function _schedToday() {
  const d = new Date();
  _schedAnchor = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (_schedGetView() === 'month') {
    const t = document.getElementById('schedule-today-marker');
    if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  }
  if (typeof renderSchedule === 'function') renderSchedule();
}

/** ‹ › navigation. Month = continuous scroll, so arrows page the viewport;
 *  Day/Week move the anchor.
 *  @param {number} dir */
function _schedNav(dir) {
  const view = _schedGetView();
  if (view === 'month') {
    const el = document.getElementById('schedule-main');
    if (el) el.scrollBy({ top: dir * Math.round(el.clientHeight * 0.8), behavior: 'smooth' });
    return;
  }
  const step = view === 'day' ? 1 : 7; // 5-day pages by a full week too
  _schedAnchor = new Date(_schedAnchor.getFullYear(), _schedAnchor.getMonth(), _schedAnchor.getDate() + dir * step);
  if (typeof renderSchedule === 'function') renderSchedule();
}

/** Day-header click in the week grid → open that day. @param {string} iso */
function _schedOpenDay(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return;
  _schedAnchor = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  _schedSetView('day');
}

// ── Layer visibility (SV.7) — Orders / Tasks / Google ──
/** @type {{ orders: boolean, tasks: boolean, google: boolean }} */
let _schedLayers = (() => {
  try {
    const v = JSON.parse(localStorage.getItem('pc_sched_layers') || '{}');
    return { orders: v.orders !== false, tasks: v.tasks !== false, google: v.google !== false };
  } catch (e) { return { orders: true, tasks: true, google: true }; }
})();
/** @param {'orders'|'tasks'|'google'} key */
function _schedToggleLayer(key) {
  _schedLayers[key] = !_schedLayers[key];
  try { localStorage.setItem('pc_sched_layers', JSON.stringify(_schedLayers)); } catch (e) {}
  if (typeof renderSchedule === 'function') renderSchedule();
}
/** Sidebar rows — GCal-style coloured checkboxes, plus the Google Calendar
 *  connect/status block (src/gcal.js). */
function _schedLayersHTML() {
  const row = /** @param {'orders'|'tasks'|'google'} key @param {string} color @param {string} label */
    (key, color, label) => `<label class="sched-layer">
      <input type="checkbox" ${_schedLayers[key] ? 'checked' : ''} onchange="_schedToggleLayer('${key}')">
      <span class="sched-layer-dot" style="background:${color}"></span>${label}
    </label>`;
  const gcalConnected = typeof _gcalConn !== 'undefined' && _gcalConn.connected;
  return `<div class="sched-layers">
    ${row('orders', 'var(--accent)', 'Orders')}
    ${row('tasks', TASK_COLOR, 'Tasks')}
    ${gcalConnected ? row('google', GCAL_COLOR, 'Google Calendar') : ''}
    ${typeof _gcalSidebarHTML === 'function' ? _gcalSidebarHTML() : ''}
  </div>`;
}
/** Google-brand-ish blue for overlay events. */
const GCAL_COLOR = '#4c8df6';

// ── View bar (SV.3) ──
const _SCHED_CHEV_L = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;
const _SCHED_CHEV_R = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

const _SCHED_MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _SCHED_DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/** Monday of the week containing d. @param {Date} d */
function _schedWeekStart(d) {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  while (out.getDay() !== 1) out.setDate(out.getDate() - 1);
  return out;
}

function _schedRangeLabel() {
  const view = _schedGetView();
  const a = _schedAnchor;
  if (view === 'day') {
    return `${_SCHED_DAY_SHORT[(a.getDay() + 6) % 7]}, ${a.getDate()} ${_SCHED_MON_SHORT[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (view === 'week' || view === '5day') {
    const s = _schedWeekStart(a);
    const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + (view === '5day' ? 4 : 6));
    const sm = _SCHED_MON_SHORT[s.getMonth()], em = _SCHED_MON_SHORT[e.getMonth()];
    return s.getMonth() === e.getMonth()
      ? `${s.getDate()} – ${e.getDate()} ${em} ${e.getFullYear()}`
      : `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${e.getFullYear()}`;
  }
  return '';
}

function _schedViewBarHTML() {
  const view = _schedGetView();
  /** @param {string} v @param {string} label */
  const seg = (v, label) => `<button type="button" class="${view === v ? 'active' : ''}" onclick="_schedSetView('${v}')">${label}</button>`;
  return `<div class="sched-viewbar">
    <button type="button" class="btn btn-outline sched-vb-today" onclick="_schedToday()">Today</button>
    <button type="button" class="sched-vb-nav" aria-label="Back" onclick="_schedNav(-1)">${_SCHED_CHEV_L}</button>
    <button type="button" class="sched-vb-nav" aria-label="Forward" onclick="_schedNav(1)">${_SCHED_CHEV_R}</button>
    <div class="sched-vb-label">${_schedRangeLabel()}</div>
    <div style="flex:1"></div>
    <div class="sched-seg">${seg('day', 'Day')}${seg('5day', '5 Day')}${seg('week', 'Week')}${seg('month', 'Month')}</div>
    <button type="button" class="btn btn-primary sched-vb-add" onclick="_schedNewTaskFromBar()">+ Task</button>
  </div>`;
}

function _schedNewTaskFromBar() {
  const preset = new Date(_schedAnchor.getFullYear(), _schedAnchor.getMonth(), _schedAnchor.getDate(), 9, 0);
  if (typeof _openTaskPopup === 'function') _openTaskPopup(0, preset);
}

// ── Time grid (SV.4) ──
/** Parse cbSettings.workdayStart ('HH:MM') → minutes from midnight. */
function _schedWorkStartMin() {
  const m = String((typeof cbSettings !== 'undefined' && cbSettings.workdayStart) || '08:00').match(/^(\d{1,2}):(\d{2})$/);
  return m ? Math.min(23 * 60 + 59, parseInt(m[1]) * 60 + parseInt(m[2])) : 480;
}

/** Side-by-side overlap layout (GCal style). Mutates each block with
 *  _col/_cols. Blocks need startMin/endMin.
 *  @param {any[]} blocks */
function _schedLayoutOverlaps(blocks) {
  const sorted = blocks.slice().sort((x, y) => x.startMin - y.startMin || y.endMin - x.endMin);
  /** @type {any[][]} */
  const clusters = [];
  /** @type {any[]|null} */
  let cur = null;
  let curEnd = -1;
  for (const b of sorted) {
    if (!cur || b.startMin >= curEnd) { cur = []; clusters.push(cur); curEnd = b.endMin; }
    else curEnd = Math.max(curEnd, b.endMin);
    cur.push(b);
  }
  for (const cl of clusters) {
    /** @type {number[]} */
    const colEnds = [];
    for (const b of cl) {
      let ci = colEnds.findIndex(end => end <= b.startMin);
      if (ci === -1) { ci = colEnds.length; colEnds.push(0); }
      colEnds[ci] = b.endMin;
      b._col = ci;
    }
    for (const b of cl) b._cols = colEnds.length;
  }
}

/**
 * Render the Day / 5-Day / Week time grid.
 * @param {{ view: 'day'|'5day'|'week', events: any[], computed: Map<any, any>,
 *           dayHours: (d: Date) => number }} opts
 * @returns {string} HTML
 */
function _renderSchedTimeGrid(opts) {
  const days = opts.view === 'day' ? 1 : opts.view === '5day' ? 5 : 7;
  const start = opts.view === 'day'
    ? new Date(_schedAnchor.getFullYear(), _schedAnchor.getMonth(), _schedAnchor.getDate())
    : _schedWeekStart(_schedAnchor);
  const today = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); })();
  const workStart = _schedWorkStartMin();
  const showTasks = _schedLayers.tasks && typeof scheduleTasks !== 'undefined';

  // Per-event segment lookup: date → [{event, hours, offset, span}]. offset/span
  // are the slice's window within the working day (hours from the day's start).
  /** @type {Record<string, {e: any, hours: number, offset: number, span: number}[]>} */
  const segsByDate = {};
  if (_schedLayers.orders) {
    for (const e of opts.events) {
      const sched = opts.computed.get(e.id);
      if (!sched || !Array.isArray(sched.segments)) continue;
      for (const seg of sched.segments) {
        (segsByDate[seg.date] = segsByDate[seg.date] || []).push({ e, hours: seg.hours, offset: seg.offset, span: seg.span });
      }
    }
  }

  // Header row + all-day strip (multi-day grids scroll horizontally on phones)
  const weekCls = days >= 5 ? ' sched-grid-week' : '';
  let head = `<div class="sched-gridhead${weekCls}" style="top:${SCHED_VIEWBAR_H}px">`;
  head += `<div class="sgh-row" style="grid-template-columns:56px repeat(${days},1fr)"><div></div>`;
  /** @type {Date[]} */
  const dayList = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    dayList.push(d);
    const isToday = +d === +today;
    const iso = _taskDateISO(d);
    head += `<div class="sgh-day${isToday ? ' today' : ''}" ${days > 1 ? `onclick="_schedOpenDay('${iso}')" title="Open day view"` : ''}>
      <span class="sgh-dow">${_SCHED_DAY_SHORT[(d.getDay() + 6) % 7]}</span>
      <span class="sgh-num">${d.getDate()}</span>
    </div>`;
  }
  head += `</div>`;
  // All-day strip (all-day tasks + all-day Google events, like GCal's row)
  {
    let adCells = '';
    let anyAllDay = false;
    for (const d of dayList) {
      const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      let chips = '';
      if (showTasks) {
        chips += _tasksBetween(d, dEnd).filter(t => t.all_day).map(t =>
          `<span class="sched-ad-chip${t.done ? ' done' : ''}" onclick="event.stopPropagation();_openTaskPopup(${t.id})" title="${_escHtml(t.title)}">${_escHtml(t.title)}</span>`).join('');
      }
      if (typeof _gcalEventsBetween === 'function') {
        chips += _gcalEventsBetween(d, dEnd).filter(g => g.allDay).map(g =>
          `<span class="sched-ad-chip gcal" title="${_escHtml(g.title)} (${_escHtml(g.cal || 'Google Calendar')})">${_escHtml(g.title)}</span>`).join('');
      }
      if (chips) anyAllDay = true;
      adCells += `<div class="sgh-allday-cell">${chips}</div>`;
    }
    if (anyAllDay) {
      head += `<div class="sgh-allday" style="grid-template-columns:56px repeat(${days},1fr)"><div class="sgh-adlabel">all-day</div>${adCells}</div>`;
    }
  }
  head += `</div>`;

  // Body — hour gutter + day columns
  const bodyH = 24 * SCHED_HOUR_PX;
  let gutter = `<div class="sgb-gutter" style="height:${bodyH}px">`;
  for (let h = 1; h < 24; h++) {
    const label = `${String(h).padStart(2, '0')}:00`;
    gutter += `<div class="sgb-hour" style="top:${h * SCHED_HOUR_PX}px">${label}</div>`;
  }
  gutter += `</div>`;

  let cols = '';
  for (const d of dayList) {
    const iso = _taskDateISO(d);
    const isToday = +d === +today;
    const dh = opts.dayHours(d);
    const weekend = (d.getDay() + 6) % 7 >= 5;

    /** @type {any[]} */
    const blocks = [];
    // Order blocks from scheduler segments (SV.2). Each segment carries the
    // window it occupies within the working day (`offset`/`span`, in hours from
    // the day's start), so sequential jobs land back-to-back and concurrent
    // ones share a window — _schedLayoutOverlaps then splits those into
    // side-by-side columns, each labelled with its own (smaller) hours. Blocks
    // can't run past the end of the day because the scheduler never books more
    // than a day's capacity into it.
    // Sorted by the scheduler's placement order (start date, then priority with
    // 0 = unset last, then id) so column order is stable — segsByDate is built
    // from the sidebar's event list, whose order follows the chosen sort mode.
    const daySegs = (segsByDate[iso] || []).slice().sort((a, b) => {
      const sa = opts.computed.get(a.e.id), sb = opts.computed.get(b.e.id);
      const da = (sa && sa.startISO) || '', db = (sb && sb.startISO) || '';
      if (da !== db) return da < db ? -1 : 1;
      const pa = parseInt(String(a.e.priority || 0), 10) || 0;
      const pb = parseInt(String(b.e.priority || 0), 10) || 0;
      if (pa !== pb) {
        if (pa === 0) return 1;
        if (pb === 0) return -1;
        return pa - pb;
      }
      return (a.e.id || 0) - (b.e.id || 0);
    });
    for (const { e, hours, offset, span } of daySegs) {
      const startMin = workStart + (offset || 0) * 60;
      // Zero-hour placeholders still get a visible 0.5h block.
      const drawn = Math.max(0.5, span != null ? span : hours);
      const endMin = Math.min(24 * 60, startMin + drawn * 60);
      blocks.push({ kind: 'order', e, hours, startMin, endMin });
    }
    // Timed tasks. Tasks with "Allocate hours" on cost the day real capacity
    // (the scheduler has already shrunk the orders around them), so they earn a
    // column of their own. Tasks with it off cost the queue nothing — they'd be
    // lying to claim a column, so they're drawn as an overlay across the orders.
    /** @type {any[]} */
    const overlays = [];
    if (showTasks) {
      const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      for (const t of _tasksBetween(d, dEnd)) {
        if (t.all_day) continue;
        const s = new Date(t.start_at), en = new Date(t.end_at);
        const startMin = Math.max(0, (+s - +d) / 60000);
        const endMin = Math.min(24 * 60, Math.max(startMin + 15, (+en - +d) / 60000));
        const blk = { kind: 'task', t, startMin, endMin };
        if (/** @type {any} */ (t).allocate_hours === false) overlays.push(blk);
        else blocks.push(blk);
      }
    }
    // Google Calendar overlay (read-only)
    if (typeof _gcalEventsBetween === 'function') {
      const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      for (const g of _gcalEventsBetween(d, dEnd)) {
        if (g.allDay) continue;
        const s = new Date(g.start), en = new Date(g.end);
        const startMin = Math.max(0, (+s - +d) / 60000);
        const endMin = Math.min(24 * 60, Math.max(startMin + 15, (+en - +d) / 60000));
        blocks.push({ kind: 'gcal', g, startMin, endMin });
      }
    }
    _schedLayoutOverlaps(blocks);
    // Overlays sit outside the column layout — full width, on top (their CSS
    // z-index already beats the order blocks). Where one covers the TOP of an
    // order block it would hide that block's label, so record how far the label
    // has to drop to clear it.
    for (const ov of overlays) { ov._col = 0; ov._cols = 1; ov._overlay = true; }
    for (const b of blocks) {
      if (b.kind !== 'order') continue;
      let shift = 0;
      for (const ov of overlays) {
        if (ov.endMin <= b.startMin || ov.startMin >= b.endMin) continue;
        if (ov.startMin <= b.startMin) shift = Math.max(shift, ov.endMin - b.startMin);
      }
      if (shift > 0) b._labelShift = shift;
    }

    let colInner = '';
    // Non-working-time shading (before workday start / after capacity ends).
    const workEnd = dh > 0 ? Math.min(24 * 60, workStart + dh * 60) : workStart;
    if (dh > 0) {
      if (workStart > 0) colInner += `<div class="sgb-offhours" style="top:0;height:${workStart / 60 * SCHED_HOUR_PX}px"></div>`;
      if (workEnd < 24 * 60) colInner += `<div class="sgb-offhours" style="top:${workEnd / 60 * SCHED_HOUR_PX}px;height:${(24 * 60 - workEnd) / 60 * SCHED_HOUR_PX}px"></div>`;
    } else {
      colInner += `<div class="sgb-offhours sgb-holiday" style="top:0;height:${bodyH}px"></div>`;
    }

    // Overlays render after the columned blocks so they paint on top.
    for (const b of blocks.concat(overlays)) {
      const top = b.startMin / 60 * SCHED_HOUR_PX;
      const height = Math.max(20, (b.endMin - b.startMin) / 60 * SCHED_HOUR_PX - 2);
      const gap = 2;
      const wPct = 100 / (b._cols || 1);
      const leftPct = (b._col || 0) * wPct;
      if (b.kind === 'order') {
        const label = [b.e.numberLabel, b.e.client].filter(Boolean).map(_escHtml).join(' · ');
        const manual = b.e.isManual ? 'border:1px dashed rgba(255,255,255,0.55);' : '';
        const hrs = Math.round(b.hours * 10) / 10; // segment hours are raw floats
        // Drop the label clear of any overlay covering the block's top, but
        // never so far it pushes itself out of the block.
        const shiftPx = b._labelShift
          ? Math.min(b._labelShift / 60 * SCHED_HOUR_PX, Math.max(0, height - 20))
          : 0;
        const shift = shiftPx > 0 ? `padding-top:${Math.round(shiftPx)}px;` : '';
        colInner += `<div class="sched-ord-block" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + ${gap}px);width:calc(${wPct}% - ${gap * 2}px);background:${b.e.color};${shift}${manual}"
          onclick="event.stopPropagation();_openSchedOrderPopup(${b.e.id})" title="${label} — ${hrs}h">
          <span class="sob-title">${label}</span><span class="sob-time">${hrs}h</span>
        </div>`;
      } else if (b.kind === 'gcal') {
        const gTitle = (b.g.title || '').trim() || '(busy)';
        const gSrc = b.g.cal ? _escHtml(b.g.cal) : 'Google Calendar';
        const slim = height < 34 ? ' slim' : ''; // short events: one "title · time" line
        colInner += `<div class="sched-gcal-block${slim}" style="top:${top}px;height:${height}px;left:calc(${leftPct}% + ${gap}px);width:calc(${wPct}% - ${gap * 2}px)"
          onclick="event.stopPropagation()" title="${_escHtml(gTitle)} · ${_taskTimeStr(new Date(b.g.start))} – ${_taskTimeStr(new Date(b.g.end))} (${gSrc})">
          <span class="sgc-title">${_escHtml(gTitle)}</span>
          <span class="sgc-time">${_taskTimeStr(new Date(b.g.start))} – ${_taskTimeStr(new Date(b.g.end))}</span>
        </div>`;
      } else {
        const t = b.t;
        const slim = height < 34 ? ' slim' : '';
        const ovr = b._overlay ? ' overlay' : '';
        colInner += `<div class="sched-task-block${t.done ? ' done' : ''}${slim}${ovr}" data-task-id="${t.id}" data-date="${iso}"
          style="top:${top}px;height:${height}px;left:calc(${leftPct}% + ${gap}px);width:calc(${wPct}% - ${gap * 2}px)"
          onpointerdown="_taskPointerDown(event,${t.id},'move')">
          <span class="stb-title">${_escHtml(t.title)}</span>
          <span class="stb-time">${_taskTimeStr(new Date(t.start_at))} – ${_taskTimeStr(new Date(t.end_at))}</span>
          <div class="stb-resize" onpointerdown="_taskPointerDown(event,${t.id},'resize')"></div>
        </div>`;
      }
    }

    if (isToday) {
      const now = new Date();
      const nowTop = (now.getHours() * 60 + now.getMinutes()) / 60 * SCHED_HOUR_PX;
      colInner += `<div class="sched-nowline" style="top:${nowTop}px"><div class="sched-nowdot"></div></div>`;
    }

    cols += `<div class="sgb-col${weekend ? ' weekend' : ''}${isToday ? ' today' : ''}" data-date="${iso}" style="height:${bodyH}px" onclick="_schedGridSlotClick(event,'${iso}')">${colInner}</div>`;
  }

  return `${head}<div class="sched-gridbody${weekCls}" style="grid-template-columns:56px repeat(${days},1fr)">${gutter}${cols}</div>`;
}

/** Post-render: scroll the grid so the workday start sits near the top.
 *  Skipped on sidebar:false re-renders (working-hours edits). */
function _schedGridAutoScroll() {
  const main = document.getElementById('schedule-main');
  if (!main) return;
  const target = Math.max(0, _schedWorkStartMin() / 60 * SCHED_HOUR_PX - 60);
  main.scrollTop = target;
}

// Keep the now-line honest while the grid is open (re-position every minute;
// cheap DOM write, no re-render).
setInterval(() => {
  const lines = document.querySelectorAll('.sched-nowline');
  if (!lines.length) return;
  const now = new Date();
  const top = (now.getHours() * 60 + now.getMinutes()) / 60 * SCHED_HOUR_PX;
  lines.forEach(l => { /** @type {HTMLElement} */ (l).style.top = top + 'px'; });
}, 60000);

// ── Click empty slot → new task at that time (30-min snap) ──
/** @param {MouseEvent} ev @param {string} iso */
function _schedGridSlotClick(ev, iso) {
  const col = /** @type {HTMLElement} */ (ev.currentTarget);
  if (!col || ev.target !== col && !(/** @type {HTMLElement} */ (ev.target)).classList.contains('sgb-offhours')) return;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return;
  const rect = col.getBoundingClientRect();
  const y = ev.clientY - rect.top;
  const mins = Math.max(0, Math.min(23.5 * 60, Math.round((y / SCHED_HOUR_PX * 60) / 30) * 30));
  const preset = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), Math.floor(mins / 60), mins % 60);
  if (typeof _openTaskPopup === 'function') _openTaskPopup(0, preset);
}

// ── Task drag: move / resize with pointer capture (SV.6) ──
// Pointer events cover mouse + touch (blocks set touch-action:none in CSS).
// Movement < 5px = a tap → opens the edit popup instead.
/** @type {{ id: number, mode: string, startX: number, startY: number,
 *    origTop: number, origH: number, block: HTMLElement, colW: number,
 *    dates: string[], colIdx: number, moved: boolean } | null} */
let _taskDrag = null;

/** @param {PointerEvent} ev @param {number} id @param {'move'|'resize'} mode */
function _taskPointerDown(ev, id, mode) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  const target = /** @type {HTMLElement} */ (ev.target);
  const block = /** @type {HTMLElement | null} */ (target.closest('.sched-task-block'));
  if (!block) return;
  const cols = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.sgb-col')));
  if (!cols.length) return;
  const dates = cols.map(c => c.dataset.date || '');
  const colIdx = Math.max(0, dates.indexOf(block.dataset.date || ''));
  _taskDrag = {
    id, mode,
    startX: ev.clientX, startY: ev.clientY,
    origTop: parseFloat(block.style.top) || 0,
    origH: parseFloat(block.style.height) || 20,
    block,
    colW: cols[0].getBoundingClientRect().width,
    dates, colIdx,
    moved: false,
  };
  block.setPointerCapture(ev.pointerId);
  block.addEventListener('pointermove', _taskPointerMove);
  block.addEventListener('pointerup', _taskPointerUp);
  block.addEventListener('pointercancel', _taskPointerUp);
}

/** Snap a pixel offset to 15-minute steps. @param {number} px */
function _snapPx(px) {
  const stepPx = SCHED_HOUR_PX / 4; // 15 min
  return Math.round(px / stepPx) * stepPx;
}

/** @param {PointerEvent} ev */
function _taskPointerMove(ev) {
  const d = _taskDrag;
  if (!d) return;
  const dx = ev.clientX - d.startX;
  const dy = ev.clientY - d.startY;
  if (!d.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
  d.moved = true;
  d.block.classList.add('dragging');
  if (d.mode === 'resize') {
    const newH = Math.max(SCHED_HOUR_PX / 4, _snapPx(d.origH + dy));
    d.block.style.height = newH + 'px';
  } else {
    const maxTop = 24 * 60 / 60 * SCHED_HOUR_PX - d.origH;
    const newTop = Math.max(0, Math.min(maxTop, _snapPx(d.origTop + dy)));
    d.block.style.top = newTop + 'px';
    // Horizontal: whole-day steps in the week view.
    const dDays = d.dates.length > 1 ? Math.round(dx / d.colW) : 0;
    const clamped = Math.max(-d.colIdx, Math.min(d.dates.length - 1 - d.colIdx, dDays));
    d.block.style.transform = clamped ? `translateX(${clamped * 100}%)` : '';
    d.block.dataset.dayDelta = String(clamped);
  }
  // Live time label
  const t = typeof _taskById === 'function' ? _taskById(d.id) : null;
  if (t) {
    const top = parseFloat(d.block.style.top) || 0;
    const h = parseFloat(d.block.style.height) || 20;
    const sMin = Math.round(top / SCHED_HOUR_PX * 60);
    const eMin = Math.round((top + h) / SCHED_HOUR_PX * 60);
    const lbl = d.block.querySelector('.stb-time');
    if (lbl) lbl.textContent =
      `${String(Math.floor(sMin / 60)).padStart(2, '0')}:${String(sMin % 60).padStart(2, '0')} – ${String(Math.floor(eMin / 60)).padStart(2, '0')}:${String(eMin % 60).padStart(2, '0')}`;
  }
}

/** @param {PointerEvent} ev */
function _taskPointerUp(ev) {
  const d = _taskDrag;
  if (!d) return;
  _taskDrag = null;
  d.block.classList.remove('dragging');
  d.block.removeEventListener('pointermove', _taskPointerMove);
  d.block.removeEventListener('pointerup', _taskPointerUp);
  d.block.removeEventListener('pointercancel', _taskPointerUp);
  if (!d.moved) {
    // Tap, not drag → open the editor (resize-handle taps count too).
    if (typeof _openTaskPopup === 'function') _openTaskPopup(d.id);
    return;
  }
  const t = typeof _taskById === 'function' ? _taskById(d.id) : null;
  if (!t) return;
  const baseISO = d.block.dataset.date || '';
  const m = baseISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return;
  const dayDelta = parseInt(d.block.dataset.dayDelta || '0', 10) || 0;
  const day = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]) + dayDelta);
  const top = parseFloat(d.block.style.top) || 0;
  const h = parseFloat(d.block.style.height) || 20;
  const startMin = Math.round(top / SCHED_HOUR_PX * 60 / 15) * 15;
  const durMin = Math.max(15, Math.round(h / SCHED_HOUR_PX * 60 / 15) * 15);
  let newStart, newEnd;
  if (d.mode === 'resize') {
    newStart = new Date(t.start_at);
    const dayMid = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    newEnd = new Date(+dayMid + (startMin + durMin) * 60000);
    if (+newEnd <= +newStart) newEnd = new Date(+newStart + 15 * 60000);
  } else {
    const oldDur = Math.max(15 * 60000, +new Date(t.end_at) - +new Date(t.start_at));
    newStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(startMin / 60), startMin % 60);
    newEnd = new Date(+newStart + oldDur);
  }
  if (typeof _persistTaskTimes === 'function') _persistTaskTimes(d.id, newStart, newEnd);
  if (typeof renderSchedule === 'function') renderSchedule({ sidebar: false });
}

// ── Month-view task chips: HTML5 drag to another day (SV.6) ──
/** @type {number} */
let _taskChipDragId = 0;
/** @param {DragEvent} ev @param {number} id */
function _taskChipDragStart(ev, id) {
  _taskChipDragId = id;
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}
/** @param {DragEvent} ev */
function _taskChipDragOver(ev) {
  if (!_taskChipDragId) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
}
/** Drop a month-view chip on a day cell → same time, new date.
 *  @param {DragEvent} ev @param {string} iso */
function _taskChipDrop(ev, iso) {
  if (!_taskChipDragId) return;
  ev.preventDefault();
  const id = _taskChipDragId;
  _taskChipDragId = 0;
  const t = typeof _taskById === 'function' ? _taskById(id) : null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!t || !m) return;
  const s = new Date(t.start_at);
  const dur = Math.max(15 * 60000, +new Date(t.end_at) - +s);
  const newStart = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), s.getHours(), s.getMinutes());
  if (typeof _persistTaskTimes === 'function') _persistTaskTimes(id, newStart, new Date(+newStart + dur));
  if (typeof renderSchedule === 'function') renderSchedule({ sidebar: false });
}

/** Tasks on a month-view day (local date). Returns [] when hidden/none.
 *  @param {string} iso */
function _schedMonthTasks(iso) {
  if (!_schedLayers.tasks || typeof scheduleTasks === 'undefined') return [];
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const day = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return _tasksBetween(day, dayEnd);
}

/** Google overlay events on a month-view day. @param {string} iso */
function _schedMonthGcal(iso) {
  if (typeof _gcalEventsBetween !== 'function') return [];
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const day = new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return _gcalEventsBetween(day, new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1));
}

/** Chip-row count for a day cell (max 3 chips + "+N more"), used by the
 *  month renderer to size the week's cells. @param {string} iso */
function _schedMonthTaskCount(iso) {
  const n = _schedMonthTasks(iso).length + _schedMonthGcal(iso).length;
  return n > 3 ? 4 : n;
}

/** Task + Google chips for a month-view day cell, absolutely positioned
 *  below the order-bar zone. @param {string} iso @param {number} top */
function _schedMonthTaskChipsHTML(iso, top) {
  const tasks = _schedMonthTasks(iso);
  const gcal = _schedMonthGcal(iso);
  const total = tasks.length + gcal.length;
  if (!total) return '';
  let html = `<div class="sched-cell-tasks" style="top:${top}px">`;
  let shown = 0;
  for (const t of tasks) {
    if (shown >= 3) break;
    shown++;
    const time = t.all_day ? '' : `<span class="sct-time">${_taskTimeStr(new Date(t.start_at))}</span>`;
    html += `<div class="sched-task-chip${t.done ? ' done' : ''}" draggable="true"
      ondragstart="_taskChipDragStart(event,${t.id})"
      onclick="event.stopPropagation();_openTaskPopup(${t.id})" title="${_escHtml(t.title)}">${time}${_escHtml(t.title)}</div>`;
  }
  for (const g of gcal) {
    if (shown >= 3) break;
    shown++;
    const time = g.allDay ? '' : `<span class="sct-time">${_taskTimeStr(new Date(g.start))}</span>`;
    html += `<div class="sched-task-chip gcal" onclick="event.stopPropagation()" title="${_escHtml(g.title)} (${_escHtml(g.cal || 'Google Calendar')})">${time}${_escHtml(g.title)}</div>`;
  }
  if (total > shown) {
    html += `<div class="sched-task-chip more" onclick="event.stopPropagation();_schedOpenDay('${iso}')">+${total - shown} more</div>`;
  }
  html += '</div>';
  return html;
}
