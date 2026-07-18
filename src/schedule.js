// ProCabinet — Schedule view (carved out of src/app.js in phase E carve 1)
//
// Loaded as a classic <script defer> after src/app.js. Functions defined
// here are globals (top-level declarations in classic scripts go on
// window automatically), matching how app.js currently exposes its
// surface. Cross-file dependencies — `orders`, `_userId`, `_db`,
// `_escHtml`, `orderClient`, `orderProject`, `_openOrderPopup`,
// `_restoreProdStarts`, `STATUS_LABELS`, `renderOrdersMain` — are all
// globals defined in app.js / db.js, available at call time.

/** Mobile-only stacked agenda for the Schedule tab — the 7-column week grid is
 *  unreadable on a phone, so render a vertical list of job cards instead, reusing
 *  the same sorted/filtered events. The sort + filter selects and Working-Hours
 *  controls (normally in the now-hidden sidebar) move into the agenda header.
 *  @param {any[]} sortedEvents @param {string} sortMode @param {string} filterStatus @param {number} overrideCount */
function _renderScheduleAgenda(sortedEvents, sortMode, filterStatus, overrideCount) {
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  /** @param {Date|null} d */
  const fmtD = d => d ? `${d.getDate()} ${MON[d.getMonth()]}` : '';

  const controls = `<div class="sched-agenda-controls">
    <select onchange="_setSchedSortMode(this.value)">
      <option value="start" ${sortMode==='start'?'selected':''}>Sort: Start date</option>
      <option value="due" ${sortMode==='due'?'selected':''}>Sort: Due date</option>
      <option value="priority" ${sortMode==='priority'?'selected':''}>Sort: Priority</option>
      <option value="manual" ${sortMode==='manual'?'selected':''}>Sort: Manual</option>
      <option value="created" ${sortMode==='created'?'selected':''}>Sort: Order placed</option>
    </select>
    <select onchange="_setSchedFilterStatus(this.value)">
      <option value="all" ${filterStatus==='all'?'selected':''}>All</option>
      <option value="quote" ${filterStatus==='quote'?'selected':''}>Quote Sent</option>
      <option value="confirmed" ${filterStatus==='confirmed'?'selected':''}>Confirmed</option>
      <option value="production" ${filterStatus==='production'?'selected':''}>In Production</option>
      <option value="delivery" ${filterStatus==='delivery'?'selected':''}>Ready for Delivery</option>
    </select>
  </div>`;

  let cards = '';
  sortedEvents.forEach(e => {
    const o = orders.find(x => x.id === e.id);
    const st = o && o.status ? ((/** @type {Record<string,string>} */ (STATUS_LABELS))[o.status] || o.status) : '';
    const pri = (o && /** @type {any} */ (o).priority) || 0;
    const priLabel = pri > 0 ? pri : '—';
    const dates = e.isMissingDates
      ? '<span style="color:#f87171;font-weight:600">No dates set</span>'
      : [fmtD(e.start), fmtD(e.end)].filter(Boolean).join(' → ');
    const due = (o && o.due && o.due !== 'TBD') ? `Due ${_escHtml(String(o.due).slice(0,10))}` : '';
    const slack = slackChipHTML(/** @type {any} */ (e).slack);
    const priStepper = `<div class="sched-pri" title="Priority — 1 = highest" onclick="event.stopPropagation()"><span class="sched-pri-num${pri>0?' has-priority':''}">${priLabel}</span><span class="sched-pri-arrows"><button type="button" class="sched-pri-btn" aria-label="Raise priority" ${pri===1?'disabled':''} onclick="event.stopPropagation();_schedStepPriority(${e.id},1)">${SCHED_CHEV_UP}</button><button type="button" class="sched-pri-btn" aria-label="Lower priority" onclick="event.stopPropagation();_schedStepPriority(${e.id},-1)">${SCHED_CHEV_DOWN}</button></span></div>`;
    cards += `<div class="sched-agenda-card" onclick="_openSchedOrderPopup(${e.id})">
      <div class="sa-dot" style="background:${e.color}"></div>
      <div class="sa-main">
        <div class="sa-title">${e.isManual?SCHED_LOCK_ICON:''}${[e.numberLabel,e.client,e.project].filter(Boolean).map(_escHtml).join(' · ')}</div>
        <div class="sa-meta">${[dates, st && _escHtml(st), due].filter(Boolean).join(' · ')}${slack?(' '+slack):''}</div>
      </div>
      ${priStepper}
    </div>`;
  });
  if (!sortedEvents.length) cards = `<div style="font-size:13px;color:var(--muted);text-align:center;padding:30px">No active orders</div>`;

  const hoursOpen = localStorage.getItem('pc_sched_hours_open') === 'true';
  const hoursSummary = `${cbSettings.workdayHours ?? 8}h/day`
    + (overrideCount ? ` · ${overrideCount} day${overrideCount === 1 ? '' : 's'} off` : '');
  const hours = `<details class="sched sched-hours-section" id="sched-hours-details" ${hoursOpen ? 'open' : ''} ontoggle="_schedHoursToggle(this)">
    <summary><span class="chev"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="sched-label">Working Hours</span><span class="sched-summary">${hoursSummary}</span></summary>
    <div class="sched-body">${_schedHoursSectionHTML()}</div>
  </details>`;

  return `<div class="sched-agenda">
    ${controls}
    <div class="sched-agenda-list">${cards}</div>
    ${typeof _schedTaskListHTML === 'function' ? _schedTaskListHTML() : ''}
    ${hours}
  </div>`;
}

/** Mobile schedule sub-view: 'orders' (agenda) | 'calendar' (week grid). */
let _schedMobileView = (typeof localStorage !== 'undefined' && localStorage.getItem('pc_sched_mobile_view')) || 'orders';
/** @param {string} v */
function _setSchedMobileView(v) {
  _schedMobileView = (v === 'calendar') ? 'calendar' : 'orders';
  try { localStorage.setItem('pc_sched_mobile_view', _schedMobileView); } catch (e) { /* ignore */ }
  if (typeof renderSchedule === 'function') renderSchedule();
}
/** @type {any} */ (window)._setSchedMobileView = _setSchedMobileView;

// Re-render the schedule when crossing the mobile breakpoint (grid ⇄ agenda).
(function () {
  if (!window.matchMedia) return;
  try {
    window.matchMedia('(max-width: 760px)').addEventListener('change', function () {
      if (typeof renderSchedule === 'function') renderSchedule();
    });
  } catch (e) { /* older browsers: ignore */ }
})();

/** @param {{sidebar?: boolean}} [opts] */
function renderSchedule(opts) {
  const el = document.getElementById('schedule-main');
  if (!el) return;
  // sidebar:false re-renders only the calendar — used by the inline Working
  // Hours section so editing its inputs doesn't rebuild (and destroy) them.
  const renderSidebar = !opts || opts.sidebar !== false;
  _restoreProdStarts(orders); // ensure prodStart dates loaded
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  // Per-order bar colours. Deliberately NO teals (tasks own #0d9488) and no
  // mid-blues (the Google Calendar overlay owns #4c8df6) so an order can never
  // impersonate another layer. Mirrored in dashboard.js mini-gantt.
  const palette = ['#e8a838','#9333ea','#dc2626','#16a34a','#d97706','#7c3aed','#ec4899','#b45309','#f43f5e','#64748b'];
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const calStart = new Date(today); calStart.setDate(calStart.getDate() - 14);
  while (calStart.getDay() !== 1) calStart.setDate(calStart.getDate() - 1);
  const calEnd = new Date(today); calEnd.setDate(calEnd.getDate() + 84);

  /** @param {string | null | undefined} str */
  function parseDate(str) {
    if (!str || str === 'TBD') return null;
    const p = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (p) {
      /** @type {Record<string, number>} */
      const m = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
      const mo = m[p[2].toLowerCase().substring(0,3)];
      if(mo!==undefined) return new Date(parseInt(p[3]),mo,parseInt(p[1]));
    }
    const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1]),parseInt(iso[2])-1,parseInt(iso[3]));
    const d = new Date(str); return isNaN(+d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());
  }
  /** @param {Date} a @param {Date} b */
  function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}

  // S.4: Run the auto-scheduler. Manual orders use their pinned dates;
  // auto orders are placed by priority + working-hours config.
  const biz = {
    workdayHours: cbSettings.workdayHours,
    weekdayHours: cbSettings.weekdayHours,
    packagingHours: cbSettings.packagingHours,
    contingencyHours: cbSettings.contingencyHours,
    queueStartDate: cbSettings.queueStartDate,
  };
  const overrides = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides)) ? dayOverrides : [];
  const computed = computeSchedule(_schedList(orders), biz, overrides, today, (typeof _schedTaskReservations === 'function' ? _schedTaskReservations() : undefined));
  // Publish for the surfaces built below that don't receive `computed` directly
  // (month chips, sidebar task list). Must be assigned BEFORE the month build,
  // or first-render cells size off an empty map.
  _schedLastComputed = computed;

  /** @typedef {{id:any,numberLabel:string,project:string,client:string,start:Date|null,end:Date|null,color:string,lane:number,isManual:boolean,isMissingDates:boolean}} SchedEvent */
  /** @type {SchedEvent[]} */
  const events = /** @type {any} */ (orders.filter(o=>o.status!=='complete').map((o,idx)=>{
    const sched = computed.get(o.id);
    let start = null, end = null;
    if (sched && sched.startISO) {
      start = parseDate(sched.startISO);
      end = parseDate(sched.endISO) || start;
    }
    // Fall back to legacy due/prodStart for orders the scheduler couldn't place
    // (e.g. manual orders with no dates or status=complete escapees).
    if (!start && !end) {
      const due = parseDate(o.due), prod = parseDate(o.prodStart);
      if (!due && !prod) return null;
      start = prod || due;
      end = due || prod;
    }
    return {
      id: o.id,
      numberLabel: o.order_number || ('ORD-' + String(o.id).padStart(4,'0')),
      project: orderProject(o),
      client: orderClient(o),
      start, end,
      color: palette[idx % palette.length],
      lane: sched ? sched.lane : 0,
      isManual: o.auto_schedule === false,
      isMissingDates: !!(sched && sched.isMissingDates),
    };
  }).filter(Boolean));

  // Build override map for cell tinting (avoid linear scans inside the day loop).
  /** @type {Record<string, number>} */
  const overrideByDate = {};
  for (const ov of overrides) overrideByDate[ov.date] = ov.hours;

  // Per-event slack (working days from scheduled end → due). Stored on the
  // event so both the sidebar entry and the calendar bar can render the same
  // chip without recomputing. Suppressed for missing-dates manual orders
  // (no scheduled end to compare against).
  for (const e of events) {
    const o = orders.find(x => x.id === e.id);
    const dueISO = o ? _orderDateToISO(o.due || '') : '';
    const endISO = (!e.isMissingDates && e.end) ? `${e.end.getFullYear()}-${String(e.end.getMonth()+1).padStart(2,'0')}-${String(e.end.getDate()).padStart(2,'0')}` : '';
    /** @type {any} */ (e).slack = (endISO && dueISO)
      ? slackDays(endISO, dueISO, cbSettings.weekdayHours || [8,8,8,8,8,0,0], overrideByDate, biz, (typeof _schedTaskReservations === 'function' ? _schedTaskReservations() : undefined))
      : null;
  }
  /** @param {Date} d */
  const dayHours = d => {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const iso = `${d.getFullYear()}-${m}-${dd}`;
    if (Object.prototype.hasOwnProperty.call(overrideByDate, iso)) return overrideByDate[iso];
    const wd = (d.getDay() + 6) % 7; // Mon=0..Sun=6
    if (Array.isArray(cbSettings.weekdayHours) && cbSettings.weekdayHours.length === 7) {
      return parseFloat(cbSettings.weekdayHours[wd]) || 0;
    }
    return parseFloat(cbSettings.workdayHours) || 8;
  };
  const defaultDayHours = parseFloat(cbSettings.workdayHours) || 8;

  const weeks = [];
  let ws = new Date(calStart);
  while(ws<=calEnd){const w=[];for(let d=0;d<7;d++){const day=new Date(ws);day.setDate(day.getDate()+d);w.push(day);}weeks.push(w);ws.setDate(ws.getDate()+7);}

  // Sidebar: head + scrollable body (sort + jobs) + fixed footer (actions).
  const overrideCount = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides)) ? dayOverrides.length : 0;
  const sortMode = _getSchedSortMode();
  const filterStatus = _getSchedFilterStatus();
  const visibleEvents = filterStatus === 'all'
    ? events
    : events.filter(e => {
        const o = orders.find(x => x.id === e.id);
        return !!(o && o.status === filterStatus);
      });
  const sortedEvents = _sortSchedEvents(visibleEvents, sortMode);
  const isManualMode = sortMode === 'manual';
  /** @type {any} */ (window)._lastSchedSidebarEvents = sortedEvents;

  // SV.3/SV.7 — view switcher + layer toggles. The sidebar job queue always
  // lists orders; the layer checkboxes control the CALENDAR surfaces only.
  const schedView = (typeof _schedGetView === 'function') ? _schedGetView() : 'month';
  const viewBar = (typeof _schedViewBarHTML === 'function') ? _schedViewBarHTML() : '';
  const calEvents = (typeof _schedLayers === 'undefined' || _schedLayers.orders) ? visibleEvents : [];

  let sidebarHTML = '';
  // HEAD
  sidebarHTML += `<div class="sched-sidebar-head">
    <div style="display:flex;align-items:center;gap:8px;font-size:18px;font-weight:800;color:var(--text)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <span>Schedule</span>
    </div>
  </div>`;
  // BODY
  sidebarHTML += `<div class="sched-sidebar-body">`;
  // SV.7 — layer visibility toggles (Orders / Tasks; Google in phase 2)
  if (typeof _schedLayersHTML === 'function') sidebarHTML += _schedLayersHTML();
  sidebarHTML += `<div class="sched-sort-row" title="Sort orders">
    <select onchange="_setSchedSortMode(this.value)">
      <option value="start" ${sortMode==='start'?'selected':''}>Sort by: Start date</option>
      <option value="due" ${sortMode==='due'?'selected':''}>Sort by: Due date</option>
      <option value="priority" ${sortMode==='priority'?'selected':''}>Sort by: Priority</option>
      <option value="manual" ${sortMode==='manual'?'selected':''}>Sort by: Manual</option>
      <option value="created" ${sortMode==='created'?'selected':''}>Sort by: Order placed</option>
    </select>
  </div>`;
  sidebarHTML += `<div class="sched-sort-row" title="Filter orders by status">
    <select onchange="_setSchedFilterStatus(this.value)">
      <option value="all" ${filterStatus==='all'?'selected':''}>Filter by: All</option>
      <option value="quote" ${filterStatus==='quote'?'selected':''}>Filter by: Quote Sent</option>
      <option value="confirmed" ${filterStatus==='confirmed'?'selected':''}>Filter by: Confirmed</option>
      <option value="production" ${filterStatus==='production'?'selected':''}>Filter by: In Production</option>
      <option value="delivery" ${filterStatus==='delivery'?'selected':''}>Filter by: Ready for Delivery</option>
    </select>
  </div>`;
  sortedEvents.forEach((e, idx) => {
    const o = orders.find(x => x.id === e.id);
    const st = o ? (o.status ? (/** @type {Record<string,string>} */ (STATUS_LABELS))[o.status] || o.status : '') : '';
    const dueText = (o && o.due && o.due !== 'TBD') ? `Due ${_escHtml(String(o.due).slice(0, 10))}` : '';
    const metaParts = [];
    if (e.isMissingDates) metaParts.push('<span style="color:#f87171;font-weight:600">Manual: no dates set</span>');
    else if (st) metaParts.push(_escHtml(st));
    const meta = metaParts.join(' · ');
    const dragAttr = isManualMode
      ? ` draggable="true" ondragstart="_schedDragStart(event,${idx})" ondragover="_schedDragOver(event,this)" ondrop="_schedDrop(event,${idx})" ondragend="_schedDragEnd()"`
      : '';
    const dragHandle = isManualMode
      ? `<span class="cl-drag-handle" title="Drag to reorder" style="cursor:grab;color:var(--muted);display:inline-flex;align-items:center;flex-shrink:0">${SCHED_DRAG_HANDLE}</span>`
      : '';
    const pri = (o && /** @type {any} */ (o).priority) || 0;
    const priLabel = pri > 0 ? pri : '—';
    const priStepper = `<div class="sched-pri" title="Priority — 1 = highest. Dash = none." draggable="false" onmousedown="event.stopPropagation()" ondblclick="event.stopPropagation()"><span class="sched-pri-num${pri > 0 ? ' has-priority' : ''}">${priLabel}</span><span class="sched-pri-arrows"><button type="button" class="sched-pri-btn" aria-label="Raise priority" ${pri === 1 ? 'disabled' : ''} onclick="event.stopPropagation();_schedStepPriority(${e.id},1)">${SCHED_CHEV_UP}</button><button type="button" class="sched-pri-btn" aria-label="Lower priority" onclick="event.stopPropagation();_schedStepPriority(${e.id},-1)">${SCHED_CHEV_DOWN}</button></span></div>`;
    sidebarHTML += `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:2px;border-radius:6px;cursor:pointer;background:var(--surface2)"${dragAttr} onclick="_scrollToSchedBar(${e.id})" ondblclick="_openSchedOrderPopup(${e.id})" onmouseover="this.style.background='${e.color}33'" onmouseout="this.style.background='var(--surface2)'">${dragHandle}<div style="width:9px;height:9px;border-radius:50%;background:${e.color};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.isManual?SCHED_LOCK_ICON:''}${[e.numberLabel, e.client, e.project].filter(Boolean).map(_escHtml).join(' · ')}</div>${meta?`<div style="font-size:9px;color:var(--muted);display:flex;align-items:center;gap:4px;margin-top:1px">${meta}</div>`:''}${dueText?`<div style="font-size:9px;color:var(--muted);margin-top:1px">${dueText}</div>`:''}</div>${priStepper}</div>`;
  });
  if(!sortedEvents.length)sidebarHTML+=`<div style="font-size:12px;color:var(--muted)">No active orders</div>`;
  // Tasks — collapsible to-do list (SV.10, src/schedule-tasks.js).
  if (typeof _schedTaskListHTML === 'function') sidebarHTML += _schedTaskListHTML();
  // Working Hours — collapsible section at the bottom of the body (replaces
  // the old ⚙ Hours footer button + popup).
  const hoursOpen = localStorage.getItem('pc_sched_hours_open') === 'true';
  const hoursSummary = `${cbSettings.workdayHours ?? 8}h/day`
    + (overrideCount ? ` · ${overrideCount} day${overrideCount === 1 ? '' : 's'} off` : '');
  sidebarHTML += `<details class="sched sched-hours-section" id="sched-hours-details" ${hoursOpen ? 'open' : ''} ontoggle="_schedHoursToggle(this)">
    <summary>
      <span class="chev"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 5l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      <span class="sched-label">Working Hours</span>
      <span class="sched-summary">${hoursSummary}</span>
    </summary>
    <div class="sched-body">${_schedHoursSectionHTML()}</div>
  </details>`;
  sidebarHTML += `</div>`; // close sched-sidebar-body
  // FOOT
  sidebarHTML += `<div class="sched-sidebar-foot">
    <button class="btn btn-outline" onclick="document.getElementById('schedule-today-marker')?.scrollIntoView({behavior:'smooth',block:'center'})" style="font-size:10px;padding:4px 6px">Today</button>
  </div>`;
  const sidebarEl = document.getElementById('schedule-sidebar');
  if (renderSidebar && sidebarEl) sidebarEl.innerHTML = sidebarHTML;

  // Calendar using CSS grid per week
  // Calendar (rendered into main area). Only built for the Month view —
  // Day/Week render through _renderSchedTimeGrid (src/schedule-views.js).
  let cal = '';
  if (schedView === 'month') {
  cal = `<div style="position:sticky;top:44px;z-index:5;background:var(--surface);display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--border)">
    ${dayNames.map((d,i)=>`<div style="padding:8px 4px;font-size:11px;font-weight:600;color:${i>=5?'var(--muted)':'var(--text2)'};text-align:center">${d}</div>`).join('')}
  </div>`;

  let prevMonth = -1;
  weeks.forEach((week, weekIdx) => {
    const wm = week[0].getMonth();
    if (wm !== prevMonth) {
      prevMonth = wm;
      cal += `<div style="padding:16px 8px 4px;font-size:18px;font-weight:800;color:var(--text)">${monthNames[wm]} ${week[0].getFullYear()}</div>`;
    }

    // Compute lane layout for the week. Cells always grow to fit all stacked
    // bars at the normal 20px stride — no overlap. Task chips (SV.5) render
    // below the bar zone, so their max count also grows the cells.
    const weekStart = week[0], weekEnd = week[6];
    const weekEvents = calEvents.filter(e => {
      // events array invariant: at least one of e.start / e.end is non-null
      const s = /** @type {Date} */ (e.start||e.end), d = /** @type {Date} */ (e.end||e.start);
      return d >= weekStart && s <= weekEnd;
    });
    const maxLane = weekEvents.length ? Math.max(0, ...weekEvents.map(e => e.lane)) : 0;
    const stride = 20;
    const chipTop = 28 + (maxLane + 1) * stride;
    const maxChips = (typeof _schedMonthTaskCount === 'function')
      ? Math.max(0, ...week.map(day => _schedMonthTaskCount(`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`)))
      : 0;
    const cellMinHeight = Math.max(90, chipTop + 4 + maxChips * 17);

    // Week container with grid overlay
    cal += `<div data-week-idx="${weekIdx}" style="position:relative;display:grid;grid-template-columns:repeat(7,1fr);min-height:${cellMinHeight}px">`;

    // Day cells (background grid). Tinting: today > holiday > partial > weekend.
    week.forEach((day,di) => {
      const td = sameDay(day,today);
      const we = di>=5;
      const dh = dayHours(day);
      const isHoliday = dh === 0;
      const isPartial = dh > 0 && dh < defaultDayHours;
      const dayISO = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
      const hasOverride = Object.prototype.hasOwnProperty.call(overrideByDate, dayISO);
      let cellBg = '';
      let cellExtra = '';
      if (td) {
        cellBg = 'rgba(232,168,56,0.06)';
      } else if (isHoliday) {
        cellBg = 'var(--surface2)';
        cellExtra = 'background-image:repeating-linear-gradient(-45deg,transparent 0 6px,rgba(255,255,255,0.04) 6px 12px)';
      } else if (isPartial) {
        cellBg = 'rgba(232,168,56,0.05)';
      } else if (we) {
        cellBg = 'rgba(255,255,255,0.015)';
      }
      const styleParts = ['border:1px solid var(--border2)','padding:3px'];
      if (cellBg) styleParts.push('background:' + cellBg);
      if (cellExtra) styleParts.push(cellExtra);
      // Hours chip — visible on every cell next to the date, clickable to override.
      const chipColor = hasOverride ? 'var(--accent)' : (isHoliday ? '#f87171' : (isPartial ? '#fbbf24' : 'var(--muted)'));
      const chipBg = hasOverride ? 'rgba(232,168,56,0.18)' : 'rgba(255,255,255,0.04)';
      const hoursChip = `<div class="sched-day-hours" onclick="event.stopPropagation();_quickOverrideDate('${dayISO}')" title="Click to override hours for this date" style="position:absolute;top:3px;right:3px;font-size:9px;font-weight:700;color:${chipColor};background:${chipBg};padding:1px 4px;border-radius:3px;cursor:pointer;pointer-events:auto;z-index:3">${dh}h</div>`;
      const taskChips = (typeof _schedMonthTaskChipsHTML === 'function') ? _schedMonthTaskChipsHTML(dayISO, chipTop) : '';
      cal += `<div style="${styleParts.join(';')};position:relative;min-height:${cellMinHeight}px"${td?' id="schedule-today-marker"':''} ondragover="_taskChipDragOver(event)" ondrop="_taskChipDrop(event,'${dayISO}')">
        <div style="font-size:${td?'12':'11'}px;font-weight:${td?'800':'500'};color:${td?'#fff':we?'var(--muted)':'var(--text2)'};${td?'background:var(--accent);border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center':'padding:1px 3px'}">${day.getDate()}</div>
        ${hoursChip}
        ${taskChips}
      </div>`;
    });

    // Event bars overlaid using absolute positioning. Each event is sliced into
    // runs of consecutive working days so holidays / 0-hour days leave a gap.
    weekEvents.forEach(e => {
      const s = /** @type {Date} */ (e.start||e.end), d = /** @type {Date} */ (e.end||e.start);
      const startInWeek = s < weekStart ? 0 : s.getDay() === 0 ? 6 : s.getDay() - 1; // Mon=0
      const endInWeek = d > weekEnd ? 6 : d.getDay() === 0 ? 6 : d.getDay() - 1;
      const isRealStart = !!e.start && s >= weekStart && s <= weekEnd;
      const isRealEnd = !!e.end && d >= weekStart && d <= weekEnd;

      // Build runs of consecutive working days within [startInWeek..endInWeek]
      /** @type {[number, number][]} */
      const runs = [];
      let runStart = -1;
      for (let di = startInWeek; di <= endInWeek; di++) {
        const isWorking = dayHours(week[di]) > 0;
        if (isWorking && runStart === -1) runStart = di;
        else if (!isWorking && runStart !== -1) { runs.push([runStart, di - 1]); runStart = -1; }
      }
      if (runStart !== -1) runs.push([runStart, endInWeek]);
      if (!runs.length) return; // entire span lands on holidays

      const labelText = [e.numberLabel, e.client, e.project].filter(Boolean).map(_escHtml).join(' · ');
      const manualStyle = e.isManual ? 'border:1px dashed rgba(255,255,255,0.5);' : '';
      const lockIcon = e.isManual ? SCHED_LOCK_ICON : '';
      const barTop = 28 + e.lane * stride;

      runs.forEach((run, runIdx) => {
        const rs = run[0], re = run[1];
        const isFirstRun = runIdx === 0;
        const isLastRun = runIdx === runs.length - 1;
        const segIsRealStart = isFirstRun && isRealStart;
        const segIsRealEnd = isLastRun && isRealEnd;
        const radius = (segIsRealStart && segIsRealEnd) ? '4px' :
                       segIsRealStart ? '4px 0 0 4px' :
                       segIsRealEnd ? '0 4px 4px 0' : '0';
        const left = (rs / 7 * 100).toFixed(2);
        const width = ((re - rs + 1) / 7 * 100).toFixed(2);
        const segShowLabel = isFirstRun && (isRealStart || startInWeek === 0);
        const segChipHTML = segIsRealEnd ? slackChipHTML(/** @type {any} */ (e).slack) : '';

        cal += `<div class="sched-bar sched-bar-${e.id}" style="position:absolute;top:${barTop}px;left:${left}%;width:${width}%;height:18px;padding:0 2px;z-index:2;pointer-events:auto;display:flex;align-items:center;gap:3px" onclick="_openSchedOrderPopup(${e.id})">
          <div style="background:${e.color};${manualStyle}color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:${radius};height:16px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;flex:1;min-width:0" title="${labelText}${e.isManual?' (manual)':''}">${segShowLabel?lockIcon+labelText:''}</div>
          ${segChipHTML}
        </div>`;
      });
    });

    cal += `</div>`; // close week container
  });
  } // end month build (schedView === 'month')

  // SV.4 — Day / 5-Day / Week render through the time grid.
  const gridHTML = (schedView === 'day' || schedView === '5day' || schedView === 'week')
    ? _renderSchedTimeGrid({ view: schedView, events: calEvents, computed, dayHours })
    : '';

  // Mobile: sub-tabs in the (always-visible) list pane — "Orders" (stacked
  // agenda) and "Calendar" (the selected Day/Week/Month view, horizontally
  // scrollable where needed). Sort/filter/hours move into the agenda.
  if (typeof window._mvIsMobile === 'function' && window._mvIsMobile()) {
    const mv = _schedMobileView;
    const tabs = `<div class="sched-mobile-tabs">
      <button type="button" class="sched-mtab${mv !== 'calendar' ? ' active' : ''}" onclick="_setSchedMobileView('orders')">Orders</button>
      <button type="button" class="sched-mtab${mv === 'calendar' ? ' active' : ''}" onclick="_setSchedMobileView('calendar')">Calendar</button>
    </div>`;
    el.innerHTML = tabs + (mv === 'calendar'
      ? viewBar + `<div class="sched-mobile-cal">${gridHTML || cal}</div>`
      : _renderScheduleAgenda(sortedEvents, sortMode, filterStatus, overrideCount));
    if (renderSidebar && mv === 'calendar') {
      if (gridHTML) _schedGridAutoScroll();
      else setTimeout(() => {
        const t = document.getElementById('schedule-today-marker');
        if (t) t.scrollIntoView({ block: 'center' });
      }, 100);
    }
    return;
  }

  if (gridHTML) {
    el.innerHTML = viewBar + gridHTML;
    if (renderSidebar) _schedGridAutoScroll();
    return;
  }
  el.innerHTML = viewBar + cal;
  // Auto-scroll to today on load — skipped for sidebar:false re-renders so
  // editing the Working Hours inputs doesn't yank the calendar viewport.
  if (renderSidebar) setTimeout(() => {
    const todayEl = document.getElementById('schedule-today-marker');
    if (todayEl) todayEl.scrollIntoView({behavior:'smooth',block:'center'});
  }, 100);
}

/** @param {number} orderId */
function _scrollToSchedBar(orderId) {
  const bar = document.querySelector('.sched-bar-' + orderId);
  if (bar) {
    bar.scrollIntoView({behavior:'smooth',block:'center'});
    const inner = /** @type {HTMLElement | null} */ (bar.firstElementChild);
    if (inner) { inner.style.outline = '2px solid #fff'; inner.style.boxShadow = '0 0 8px rgba(255,255,255,0.5)'; setTimeout(() => { inner.style.outline = ''; inner.style.boxShadow = ''; }, 1500); }
  }
}

// ── Sidebar sort: persisted sort mode + drag-reorder for manual mode ──
const SCHED_DRAG_HANDLE = `<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2.5" r="1.2"/><circle cx="7" cy="2.5" r="1.2"/><circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/><circle cx="3" cy="11.5" r="1.2"/><circle cx="7" cy="11.5" r="1.2"/></svg>`;
const SCHED_LOCK_ICON = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:2px;flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`;
const SCHED_CHEV_UP = `<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 5l3-3 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SCHED_CHEV_DOWN = `<svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 1l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function _getSchedSortMode() {
  try {
    const v = localStorage.getItem('pc_sched_sort');
    if (v === 'start' || v === 'due' || v === 'priority' || v === 'manual' || v === 'created') return v;
  } catch(e) {}
  return 'created';
}

/** @param {string} mode */
function _setSchedSortMode(mode) {
  try { localStorage.setItem('pc_sched_sort', mode); } catch(e) {}
  if (typeof renderSchedule === 'function') renderSchedule();
}

function _getSchedFilterStatus() {
  try {
    const v = localStorage.getItem('pc_sched_filter');
    if (v === 'all' || v === 'quote' || v === 'confirmed' || v === 'production' || v === 'delivery') return v;
  } catch(e) {}
  return 'all';
}

/** @param {string} status */
function _setSchedFilterStatus(status) {
  try { localStorage.setItem('pc_sched_filter', status); } catch(e) {}
  if (typeof renderSchedule === 'function') renderSchedule();
}

/** @param {any[]} events @param {string} mode */
function _sortSchedEvents(events, mode) {
  const arr = events.slice();
  if (mode === 'start') {
    arr.sort((a, b) => {
      const av = a.start ? +a.start : Infinity;
      const bv = b.start ? +b.start : Infinity;
      return av - bv;
    });
  } else if (mode === 'due') {
    arr.sort((a, b) => {
      const ao = orders.find(x => x.id === a.id);
      const bo = orders.find(x => x.id === b.id);
      const ad = (ao && _orderDateToISO(ao.due || '')) || '9999-12-31';
      const bd = (bo && _orderDateToISO(bo.due || '')) || '9999-12-31';
      return ad.localeCompare(bd);
    });
  } else if (mode === 'priority') {
    arr.sort((a, b) => {
      const ao = orders.find(x => x.id === a.id);
      const bo = orders.find(x => x.id === b.id);
      const ap = (ao && /** @type {any} */ (ao).priority) || 0;
      const bp = (bo && /** @type {any} */ (bo).priority) || 0;
      // 0 = no priority → sorts last; explicit priorities ascending (1 = top).
      if (ap === 0 && bp !== 0) return 1;
      if (bp === 0 && ap !== 0) return -1;
      if (ap !== bp) return ap - bp;
      const av = a.start ? +a.start : Infinity;
      const bv = b.start ? +b.start : Infinity;
      return av - bv;
    });
  } else if (mode === 'manual') {
    arr.sort((a, b) => {
      const ao = orders.find(x => x.id === a.id);
      const bo = orders.find(x => x.id === b.id);
      const ai = (ao && /** @type {any} */ (ao).sidebar_order_index) || 0;
      const bi = (bo && /** @type {any} */ (bo).sidebar_order_index) || 0;
      return ai - bi;
    });
  } else if (mode === 'created') {
    arr.sort((a, b) => {
      const ao = orders.find(x => x.id === a.id);
      const bo = orders.find(x => x.id === b.id);
      const ac = (ao && ao.created_at) || '';
      const bc = (bo && bo.created_at) || '';
      return ac.localeCompare(bc);
    });
  }
  return arr;
}

/** @type {number} */
let _schedDragSrcIdx = -1;

/** @param {DragEvent} ev @param {number} idx */
function _schedDragStart(ev, idx) {
  _schedDragSrcIdx = idx;
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}

/** @param {DragEvent} ev @param {HTMLElement} row */
function _schedDragOver(ev, row) {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  row.classList.add('cl-drag-over');
}

/** @param {DragEvent} ev @param {number} idx */
async function _schedDrop(ev, idx) {
  ev.preventDefault();
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
  if (_schedDragSrcIdx === -1 || _schedDragSrcIdx === idx) return;
  const sortMode = _getSchedSortMode();
  if (sortMode !== 'manual') return;
  // Re-sort events client-side then persist new sidebar_order_index for each.
  /** @type {any[]} */
  const events = (/** @type {any} */ (window))._lastSchedSidebarEvents || [];
  if (!events.length) return;
  const moved = events.splice(_schedDragSrcIdx, 1)[0];
  events.splice(idx, 0, moved);
  _schedDragSrcIdx = -1;
  // Apply gap-spaced indices and persist
  const updates = events.map((e, i) => {
    const o = orders.find(x => x.id === e.id);
    const newIdx = i * 10;
    if (o) /** @type {any} */ (o).sidebar_order_index = newIdx;
    return _userId ? _db('orders').update({ sidebar_order_index: newIdx }).eq('id', e.id) : null;
  }).filter(Boolean);
  if (typeof renderSchedule === 'function') renderSchedule();
  try { await Promise.all(updates); } catch(err) { console.warn('[schedule] manual reorder save failed:', err); }
}

function _schedDragEnd() {
  _schedDragSrcIdx = -1;
  document.querySelectorAll('.cl-drag-over').forEach(r => r.classList.remove('cl-drag-over'));
}

/** @param {number} id @param {string} val */
function setOrderProdStart(id, val) {
  const o = orders.find(o => o.id === id);
  if (!o) return;
  // Store as ISO date string for reliable parsing
  o.prodStart = val || '';
  o.production_start_date = val || null;  // mirror to DB column name
  const stored = JSON.parse(localStorage.getItem('pc_order_prodstarts') || '{}');
  stored[String(id)] = o.prodStart;
  localStorage.setItem('pc_order_prodstarts', JSON.stringify(stored));
  // Phase 3.8: dual-write to orders.production_start_date
  if (_userId) {
    _db('orders').update({ production_start_date: val || null, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => {
      if (error) console.warn('[orders] production_start_date sync failed:', error.message);
    });
  }
  renderSchedule();
  renderOrdersMain();
}

/** Pending priority DB writes, keyed by order id, so a burst of rapid clicks
 *  debounces into a single update (see _schedStepPriority).
 *  @type {Map<number, ReturnType<typeof setTimeout>>} */
const _schedPriTimers = new Map();

/** Step an order's priority from the Schedule sidebar. Priority 1 = highest, so
 *  dir>0 RAISES priority by moving toward 1 (a LOWER number) and dir<0 lowers it
 *  (a higher number). Floored at 1; an unset priority (0) becomes 1. The in-
 *  memory value updates and the view re-renders immediately (re-running
 *  computeSchedule so the calendar re-lays-out), but the DB write is debounced:
 *  firing an independent update per click let rapid clicks reach Postgres out of
 *  order and persist a stale priority, so we coalesce a burst into one write
 *  carrying the final value.
 *  @param {number} orderId @param {number} dir */
function _schedStepPriority(orderId, dir) {
  const o = orders.find(x => x.id === orderId);
  if (!o) return;
  const cur = parseInt(String(/** @type {any} */ (o).priority || 0), 10) || 0;
  const next = dir > 0 ? (cur <= 1 ? 1 : cur - 1) : (cur < 1 ? 1 : cur + 1);
  if (next === cur) return;
  /** @type {any} */ (o).priority = next;
  renderSchedule();
  if (!_userId) return;
  const prev = _schedPriTimers.get(orderId);
  if (prev) clearTimeout(prev);
  _schedPriTimers.set(orderId, setTimeout(() => {
    _schedPriTimers.delete(orderId);
    const latest = orders.find(x => x.id === orderId);
    const val = latest ? (parseInt(String(/** @type {any} */ (latest).priority || 0), 10) || 0) : next;
    _db('orders').update({ priority: val, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .then(({ error }) => { if (error) console.warn('[orders] priority sync failed:', error.message); });
    // An order's priority now also moves auto-scheduled TASK placements, which
    // are pushed to Google — so re-sync, not just re-render.
    if (typeof _gcalQueueSync === 'function') _gcalQueueSync();
  }, 400));
}

// ── Order popup (Schedule tab) ──
// Clicking an order anywhere on the Schedule tab opens this compact popup —
// order summary + the schedule-relevant settings — instead of yanking the
// user off to the Orders tab. "Open in Orders" does the old jump into the
// Orders sidebar editor (via the _openOrderPopup routing alias).

/** Order id backing the open popup, so the live handlers can reach its cached
 *  lines without re-querying. Null when no schedule popup is open. */
let _psoOrderId = /** @type {number|null} */ (null);

/** 'YYYY-MM-DD' → '16 Jul' (with year when not current). @param {string} iso */
function _psoFmtISO(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const y = parseInt(m[1]);
  return `${parseInt(m[3])} ${MON[parseInt(m[2]) - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`;
}

/** @param {number} id */
function _openSchedOrderPopup(id) {
  const o = /** @type {any} */ (orders.find(x => x.id === id));
  if (!o) { _openOrderPopup(id); return; }
  _psoOrderId = id;
  const auto = o.auto_schedule !== false;
  const st = o.status ? ((/** @type {Record<string,string>} */ (STATUS_LABELS))[o.status] || o.status) : '';
  const numberLabel = o.order_number || ('ORD-' + String(o.id).padStart(4, '0'));
  // Hours override mirrors the Orders editor: NULL = auto sum, non-null = pinned.
  const hoursOverride = o.hours_allocated != null;
  const hoursAllocVal = hoursOverride ? Number(o.hours_allocated).toFixed(1) : '';
  const lineCount = Array.isArray(o._lines) ? o._lines.length : 0;

  const placement = _psoPlacementHTML(id, null);

  const cur = typeof cbSettings !== 'undefined' && cbSettings.currency ? cbSettings.currency : '£';
  const valueTxt = (o.value != null && o.value !== '') ? cur + Number(o.value).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
  /** @param {string} label @param {string} value */
  const infoRow = (label, value) => `<div class="pso-row"><span class="pso-label">${label}</span><span class="pso-value">${value}</span></div>`;

  const html = `
    <div class="popup-header">
      <div class="popup-title"><div style="font-size:16px;font-weight:700">${_escHtml(numberLabel)}</div></div>
      <span class="popup-close" onclick="_closePopup()">&times;</span>
    </div>
    <div class="popup-body">
      <div class="pso-info">
        ${infoRow('Client', _escHtml(orderClient(o) || '—'))}
        ${infoRow('Project', _escHtml(orderProject(o) || '—'))}
        ${infoRow('Status', _escHtml(st || '—'))}
        ${infoRow('Value', valueTxt)}
        <div class="pso-row"><span class="pso-label">Scheduled</span><span class="pso-value" id="pso-placement">${placement}</span></div>
      </div>
      <div class="editor-section-title" style="margin:12px 0 6px">Line items${lineCount ? ` <span class="pso-lines-count">${lineCount}</span>` : ''}</div>
      ${_psoLinesHTML(o)}
      <div class="editor-section-title" style="margin:12px 0 6px">Schedule</div>
      <div class="sched-body" style="padding:0">
        <div class="sched-toggles">
          <label><input type="checkbox" id="pso-auto" ${auto ? 'checked' : ''} onchange="_psoAutoToggle(this.checked)">Auto schedule</label>
          <label><input type="checkbox" id="pso-hours-override" ${hoursOverride ? 'checked' : ''} onchange="_psoHoursOverrideToggle(this.checked);_psoRefresh()">Override hours</label>
        </div>
        <div class="sched-fields">
          <label class="sched-field">
            <span class="sched-field-label">Priority</span>
            ${_priorityStepperHTML('pso-priority', o.priority || '', '_psoRefresh()')}
          </label>
          <label class="sched-field" id="pso-hours-alloc-wrap" style="${hoursOverride ? '' : 'display:none'}">
            <span class="sched-field-label">Allocated</span>
            <div class="sched-stepper">
              <button type="button" class="step-btn" onclick="_oStep('pso-hours-allocated',-1)" tabindex="-1" aria-label="Decrease">−</button>
              <input class="pf-input-compact" type="number" min="0" step="0.5" id="pso-hours-allocated" value="${hoursAllocVal}" oninput="_psoRefresh()">
              <span class="step-unit">h</span>
              <button type="button" class="step-btn" onclick="_oStep('pso-hours-allocated',1)" tabindex="-1" aria-label="Increase">+</button>
            </div>
          </label>
          <label class="sched-field">
            <span class="sched-field-label">Run-over</span>
            <div class="sched-stepper">
              <button type="button" class="step-btn" onclick="_oStep('pso-run-over',-1)" tabindex="-1" aria-label="Decrease">−</button>
              <input class="pf-input-compact" type="number" min="0" step="0.5" id="pso-run-over" value="${o.run_over_hours ?? 0}" oninput="_psoRefresh()">
              <span class="step-unit">h</span>
              <button type="button" class="step-btn" onclick="_oStep('pso-run-over',1)" tabindex="-1" aria-label="Increase">+</button>
            </div>
          </label>
        </div>
        <div class="pf-hours-readout" id="pso-hours-breakdown" style="${hoursOverride ? 'display:none' : ''}"></div>
        <div class="sched-fields is-dates">
          <label class="sched-field">
            <span class="sched-field-label">Production Start<span class="sched-field-hint" id="pso-start-hint"${auto ? '' : ' style="display:none"'}> (auto)</span></span>
            <input class="pf-input-compact" type="date" id="pso-start" value="${_orderDateToISO(o.prodStart || '')}" ${auto ? 'disabled title="Auto-scheduled — toggle off to set manually"' : ''} oninput="_psoRefresh()">
          </label>
          <label class="sched-field">
            <span class="sched-field-label">Due</span>
            <input class="pf-input-compact" type="date" id="pso-due" value="${_orderDateToISO(o.due || '')}">
          </label>
        </div>
      </div>
    </div>
    <div class="popup-footer">
      <button class="btn btn-outline" style="margin-right:auto" onclick="_closePopup();_openOrderPopup(${id})">Open in Orders</button>
      <button class="btn btn-outline" onclick="_closePopup()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveSchedOrderPopup(${id})">Save</button>
    </div>`;
  _openPopup(html, 'sm');
  _psoRenderHoursBreakdown();
}

/** Auto-schedule toggle inside the popup: manual → enable the start date.
 *  @param {boolean} auto */
function _psoAutoToggle(auto) {
  const start = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-start'));
  if (start) { start.disabled = auto; start.title = auto ? 'Auto-scheduled — toggle off to set manually' : ''; }
  const hint = document.getElementById('pso-start-hint');
  if (hint) hint.style.display = auto ? '' : 'none';
  _psoRefresh();
}

/** Hours-override toggle inside the popup — mirrors _orderHoursOverrideToggle:
 *  reveal the Allocated field, hide the auto breakdown, and seed the input with
 *  the computed total so the user adjusts from a real number.
 *  @param {boolean} on */
function _psoHoursOverrideToggle(on) {
  const wrap = document.getElementById('pso-hours-alloc-wrap');
  if (wrap) wrap.style.display = on ? '' : 'none';
  const breakdown = document.getElementById('pso-hours-breakdown');
  if (breakdown) breakdown.style.display = on ? 'none' : '';
  if (!on) return;
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-hours-allocated'));
  if (!input || input.value) return;
  const o = /** @type {any} */ (orders.find(x => x.id === _psoOrderId));
  const b = _orderHoursBreakdown(o ? o._lines : [], {});
  if (b) input.value = (b.total || 0).toFixed(1);
}

/** Hours readout for the popup. Same markup as the Orders editor, but computed
 *  from the order's own cached lines rather than the open editor's _opState. */
function _psoRenderHoursBreakdown() {
  const el = document.getElementById('pso-hours-breakdown');
  if (!el) return;
  const overrideEl = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-hours-override'));
  if (overrideEl && overrideEl.checked) { el.innerHTML = ''; return; }
  const o = /** @type {any} */ (orders.find(x => x.id === _psoOrderId));
  const runOver = parseFloat(_popupVal('pso-run-over'));
  el.innerHTML = _orderHoursBreakdownHTML(_orderHoursBreakdown(o ? o._lines : [], {
    runOverHours: Number.isFinite(runOver) ? runOver : undefined,
  }));
}

/** The unsaved edits currently in the popup, shaped like an orders row so the
 *  scheduler can be re-run against them. */
function _psoPendingRow() {
  const autoEl = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-auto'));
  const overrideEl = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-hours-override'));
  const auto_schedule = autoEl ? autoEl.checked : true;
  const startISO = _popupVal('pso-start');
  return {
    priority: parseInt(_popupVal('pso-priority'), 10) || 0,
    auto_schedule,
    manual_start_date: auto_schedule ? null : (startISO || null),
    manual_end_date: null,
    production_start_date: startISO || null,
    run_over_hours: parseFloat(_popupVal('pso-run-over')) || 0,
    hours_allocated: (overrideEl && overrideEl.checked)
      ? (parseFloat(_popupVal('pso-hours-allocated')) || 0)
      : null,
  };
}

/** Build the "Scheduled" row. `pending` (optional) overlays unsaved popup edits
 *  onto the order before scheduling, so the dates react as the user types.
 *  The whole queue is re-run, not just this order — changing its priority or
 *  hours moves the orders scheduled around it too.
 *  @param {number} id @param {any} pending @returns {string} */
function _psoPlacementHTML(id, pending) {
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const biz = {
    workdayHours: cbSettings.workdayHours,
    weekdayHours: cbSettings.weekdayHours,
    packagingHours: cbSettings.packagingHours,
    contingencyHours: cbSettings.contingencyHours,
    queueStartDate: cbSettings.queueStartDate,
  };
  const overrides = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides)) ? dayOverrides : [];
  const list = pending
    ? orders.map(x => x.id === id ? Object.assign({}, x, pending) : x)
    : orders;
  const sched = computeSchedule(_schedList(list), biz, overrides, today, (typeof _schedTaskReservations === 'function' ? _schedTaskReservations() : undefined)).get(id);
  const hrs = sched ? Math.round(sched.hoursRequired * 10) / 10 : 0;
  if (sched && sched.isMissingDates) return '<span style="color:#f87171;font-weight:600">No dates set</span>';
  if (sched && sched.startISO) return `${_psoFmtISO(sched.startISO)} → ${_psoFmtISO(sched.endISO)} · ${hrs}h`;
  return '—';
}

/** Read-only line-item list for the popup. Hours come from the same
 *  `_lineScheduleHours` the breakdown uses, so the rows sum to the "Hours
 *  required" figure shown below them. Editing stays in the Orders tab — the
 *  footer's "Open in Orders" is one click away.
 *  @param {any} o @returns {string} */
function _psoLinesHTML(o) {
  /** @type {any[]} */
  const lines = Array.isArray(o && o._lines) ? o._lines.slice() : [];
  if (!lines.length) return '<div class="pso-lines-empty">No line items on this order.</div>';
  lines.sort((/** @type {any} */ a, /** @type {any} */ b) => (a.position ?? 0) - (b.position ?? 0));
  /** @type {Record<string, string>} */
  const fallback = { cabinet: 'Cabinet', stock: 'Stock item', labour: 'Labour', item: 'Item' };
  const rows = lines.map((/** @type {any} */ r) => {
    const { kind, hours } = _lineScheduleHours(r);
    const qty = parseFloat(r.qty) || 1;
    const name = String(r.name || '').trim() || fallback[kind] || 'Item';
    return `<div class="pso-line">
        <span class="pso-line-dot ${_escHtml(kind)}"></span>
        <span class="pso-line-desc" title="${_escHtml(name)}">${_escHtml(name)}</span>
        <span class="pso-line-qty">${qty > 1 ? '&times;' + qty : ''}</span>
        <span class="pso-line-hrs">${hours > 0 ? hours.toFixed(1) + 'h' : '—'}</span>
      </div>`;
  }).join('');
  return `<div class="pso-lines">${rows}</div>`;
}

/** Re-run the placement + hours readout against the popup's unsaved values. */
function _psoRefresh() {
  if (_psoOrderId == null) return;
  const el = document.getElementById('pso-placement');
  if (el) el.innerHTML = _psoPlacementHTML(_psoOrderId, _psoPendingRow());
  _psoRenderHoursBreakdown();
}

/** Save the schedule settings — mirrors saveOrderFromEditor's semantics for
 *  these fields (manual_start_date doubles production_start_date when auto is
 *  off; manual_end_date cleared; due stored in the display format).
 *  @param {number} id */
async function _saveSchedOrderPopup(id) {
  if (!_requireAuth()) return;
  const o = /** @type {any} */ (orders.find(x => x.id === id));
  if (!o) return;
  const autoEl = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-auto'));
  const overrideEl = /** @type {HTMLInputElement|null} */ (document.getElementById('pso-hours-override'));
  const auto_schedule = autoEl ? autoEl.checked : true;
  const priority = parseInt(_popupVal('pso-priority'), 10) || 0;
  const startISO = _popupVal('pso-start');
  const dueISO = _popupVal('pso-due');
  /** @type {any} */
  const update = {
    priority,
    auto_schedule,
    manual_start_date: auto_schedule ? null : (startISO || null),
    manual_end_date: null,
    run_over_hours: parseFloat(_popupVal('pso-run-over')) || 0,
    // NULL = use the computed line sum; non-null = pinned manual override.
    hours_allocated: (overrideEl && overrideEl.checked)
      ? (parseFloat(_popupVal('pso-hours-allocated')) || 0)
      : null,
    updated_at: new Date().toISOString(),
  };
  if (startISO) update.production_start_date = startISO;
  if (dueISO) update.due = new Date(dueISO + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  Object.assign(o, update); // optimistic
  if (startISO) {
    o.prodStart = startISO;
    try {
      const ps = JSON.parse(localStorage.getItem('pc_order_prodstarts') || '{}');
      ps[String(id)] = startISO;
      localStorage.setItem('pc_order_prodstarts', JSON.stringify(ps));
    } catch (e) {}
  }
  _closePopup();
  renderSchedule();
  const { error } = await _db('orders').update(update).eq('id', id);
  if (error) { console.warn('[orders] schedule popup save failed:', error.message); _toast('Save failed — check connection', 'error'); }
  else if (typeof _gcalQueueSync === 'function') _gcalQueueSync(); // may have moved auto-task placements
}

// ── Restore prodStart: prefer DB column, fall back to localStorage ──
/** @param {(import('./database.types').Tables<'orders'> & { prodStart?: string })[]} ordersList */
function _restoreProdStarts(ordersList) {
  try {
    /** @type {Record<string, string>} */
    const stored = JSON.parse(localStorage.getItem('pc_order_prodstarts') || '{}');
    ordersList.forEach(o => {
      // Phase 3.8: orders.production_start_date is now the source of truth
      if (o.production_start_date) { o.prodStart = o.production_start_date; return; }
      const val = stored[String(o.id)] || stored[o.id];
      if (val) o.prodStart = val;
    });
  } catch(e) {}
}

// ══════════════════════════════════════════
// SCHEDULE SIDEBAR — Defaults + Day Overrides (S.2)
// ══════════════════════════════════════════
// State: collapsed/expanded sections persist across re-renders via localStorage.
/** @type {Record<string, boolean>} */
let _schedSectionState = (function(){
  try { return JSON.parse(localStorage.getItem('pc_sched_sections') || '{}'); } catch(e) { return {}; }
})();
function _persistSchedSections() {
  try { localStorage.setItem('pc_sched_sections', JSON.stringify(_schedSectionState)); } catch(e) {}
}
/** @param {string} key  @param {HTMLElement} headerEl */
function _toggleSchedSection(key, headerEl) {
  const collapsed = !_schedSectionState[key];
  _schedSectionState[key] = collapsed;
  _persistSchedSections();
  const body = document.getElementById('sched-' + key + '-body');
  if (body) body.style.display = collapsed ? 'none' : '';
  const caret = headerEl.querySelector('.sched-caret');
  if (caret) caret.textContent = collapsed ? '▸' : '▾';
}
/** @param {string} key */
function _isSchedCollapsed(key) { return !!_schedSectionState[key]; }

// ── Working Hours sidebar section (working hours + holidays) ──
// Rendered inline as a collapsible <details> at the bottom of the Schedule
// sidebar. Packaging / Contingency live in Cabinet Builder Core Rates.
/** Persist the Working Hours section's open/closed state.
 *  @param {HTMLDetailsElement} el */
function _schedHoursToggle(el) {
  try { localStorage.setItem('pc_sched_hours_open', String(el.open)); } catch (e) {}
}

/** Body of the collapsible Working Hours section: default workday hours, the
 *  per-weekday grid, the queue-start anchor, and the holidays/overrides list. */
function _schedHoursSectionHTML() {
  const wd = Array.isArray(cbSettings.weekdayHours) && cbSettings.weekdayHours.length === 7
    ? cbSettings.weekdayHours
    : [8, 8, 8, 8, 8, 0, 0];
  const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dayNamesFull = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdayInputs = wd.map(/** @param {number} h @param {number} i */ (h, i) => `<div class="sched-wd-cell">
    <div class="sched-wd-letter" title="${dayNamesFull[i]}">${dayLetters[i]}</div>
    <input type="number" min="0" max="24" step="0.5" value="${h}" class="sched-wd-input" onchange="_updateWeekdayHour(${i}, this.value)">
  </div>`).join('');

  return `<div class="pf"><label class="pf-label">Default workday hours</label>
    <input class="pf-input" type="number" min="0" max="24" step="0.5" value="${cbSettings.workdayHours ?? 8}" onchange="_updateSchedDefault('workdayHours', this.value)">
  </div>
  <div class="pf"><label class="pf-label">Workday start time</label>
    <input class="pf-input" type="time" value="${cbSettings.workdayStart || '08:00'}" onchange="_updateSchedDefault('workdayStart', this.value)">
    <div style="font-size:10px;color:var(--muted);margin-top:4px">When order blocks begin in the Day &amp; Week views.</div>
  </div>
  <div class="pf"><label class="pf-label">Hours per weekday</label>
    <div class="sched-wd-grid">${weekdayInputs}</div>
    <div style="font-size:10px;color:var(--muted);margin-top:4px">Mon–Sun. Set Sat/Sun to 0 for a 5-day workweek; reduce one day for a recurring half-day.</div>
  </div>
  <div class="pf"><label class="pf-label">Production queue start</label>
    <input class="pf-input" type="date" value="${cbSettings.queueStartDate || ''}" onchange="_updateSchedDefault('queueStartDate', this.value)">
    <div style="font-size:10px;color:var(--muted);margin-top:4px">Anchor for auto-scheduled orders. Leave blank to use today.</div>
  </div>
  <div class="pf-divider"></div>
  <div class="pf-label" style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
    <span>Holidays &amp; one-off overrides</span>
    <button class="btn btn-outline" onclick="_holidayAdd()" style="font-size:11px;padding:3px 8px;width:auto">+ Add</button>
  </div>
  <div id="sched-holidays-list" class="sched-overrides-list">${_holidaysListHTML()}</div>
  <div style="font-size:10px;color:var(--muted);text-align:center;margin-top:10px">Changes save automatically.</div>`;
}

function _holidaysListHTML() {
  const list = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides)) ? dayOverrides : [];
  if (!list.length) return `<div style="font-size:11px;color:var(--muted);padding:8px 0">No holidays set. Add a date or click any date in the calendar to override its hours.</div>`;
  return list.map(o => {
    const idAttr = o.id != null ? String(o.id) : 'null';
    return `<div class="sched-override-row" data-id="${o.id || ''}">
  <input type="date" value="${o.date}" onchange="_holidayEditDate(${idAttr}, this.value)" class="sched-override-date">
  <input type="number" min="0" max="24" step="0.5" value="${o.hours}" onchange="_holidayEditHours(${idAttr}, this.value)" class="sched-override-hours" title="Hours (0 = full day off)">
  <input type="text" value="${(o.label || '').replace(/"/g,'&quot;')}" placeholder="Label" onchange="_holidayEditLabel(${idAttr}, this.value)" class="sched-override-label">
  <button onclick="_holidayDelete(${idAttr})" class="sched-override-x" title="Remove">✕</button>
</div>`;
  }).join('');
}

function _refreshHolidaysList() {
  const host = document.getElementById('sched-holidays-list');
  if (host) host.innerHTML = _holidaysListHTML();
}

/** @param {string} key  @param {string} val */
function _updateSchedDefault(key, val) {
  if (key === 'queueStartDate') {
    cbSettings.queueStartDate = val || null;
  } else if (key === 'workdayStart') {
    cbSettings.workdayStart = /^\d{2}:\d{2}$/.test(val) ? val : '08:00';
  } else {
    const n = parseFloat(val);
    cbSettings[key] = isFinite(n) ? n : 0;
  }
  if (typeof _syncCBSettingsToDB === 'function') _syncCBSettingsToDB();
  renderSchedule({ sidebar: false });
}

/** @param {number} idx  @param {string} val */
function _updateWeekdayHour(idx, val) {
  if (!Array.isArray(cbSettings.weekdayHours) || cbSettings.weekdayHours.length !== 7) {
    cbSettings.weekdayHours = [8, 8, 8, 8, 8, 0, 0];
  }
  const n = parseFloat(val);
  cbSettings.weekdayHours[idx] = isFinite(n) ? n : 0;
  if (typeof _syncCBSettingsToDB === 'function') _syncCBSettingsToDB();
  renderSchedule({ sidebar: false });
}

async function _holidayAdd() {
  // First date from today with no override yet, so every click adds a
  // distinct row. (The old code bumped a single day and then collided —
  // upsert would silently UPDATE the taken date instead of adding a row.)
  const base = new Date();
  let target = '';
  for (let i = 0; i < 730; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!dayOverrides.some(o => o.date === iso)) { target = iso; break; }
  }
  if (!target) return;
  // Optimistic: show the row immediately so the add isn't gated on the DB
  // round-trip. The placeholder has no id; upsertDayOverride therefore takes
  // the INSERT path and pushes the real (id-bearing) row.
  const placeholder = { id: /** @type {number|null} */ (null), date: target, hours: 0, label: '' };
  dayOverrides.push(placeholder);
  dayOverrides.sort((a, b) => a.date.localeCompare(b.date));
  _refreshHolidaysList();
  renderSchedule({ sidebar: false });
  const saved = await upsertDayOverride(target, 0, '');
  // Drop the placeholder either way: on success the real row was pushed; on
  // failure nothing was inserted, so the row correctly disappears.
  const pi = dayOverrides.indexOf(placeholder);
  if (pi >= 0) dayOverrides.splice(pi, 1);
  _refreshHolidaysList();
  if (!saved) renderSchedule({ sidebar: false });
}
/** @param {number|null} id @param {string} val */
async function _holidayEditDate(id, val) {
  if (!val || !Array.isArray(dayOverrides)) return;
  const o = dayOverrides.find(x => x.id === id);
  if (!o) return;
  if (o.id != null) await deleteDayOverride(o.id);
  await upsertDayOverride(val, o.hours, o.label);
  _refreshHolidaysList();
  renderSchedule({ sidebar: false });
}
/** @param {number|null} id @param {string} val */
async function _holidayEditHours(id, val) {
  if (!Array.isArray(dayOverrides)) return;
  const o = dayOverrides.find(x => x.id === id);
  if (!o) return;
  await upsertDayOverride(o.date, parseFloat(val) || 0, o.label);
  _refreshHolidaysList();
  renderSchedule({ sidebar: false });
}
/** @param {number|null} id @param {string} val */
async function _holidayEditLabel(id, val) {
  if (!Array.isArray(dayOverrides)) return;
  const o = dayOverrides.find(x => x.id === id);
  if (!o) return;
  await upsertDayOverride(o.date, o.hours, val || null);
  _refreshHolidaysList();
}
/** @param {number|null} id */
async function _holidayDelete(id) {
  if (id == null) return;
  await deleteDayOverride(id);
  _refreshHolidaysList();
  renderSchedule({ sidebar: false });
}

// Quick-override flow from clicking a calendar cell's hours indicator.
// Prompts for a new hour value; saves as a same-date override (creates one
// if missing, updates if existing).
/** @param {string} iso  YYYY-MM-DD */
async function _quickOverrideDate(iso) {
  if (!iso) return;
  const existing = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides))
    ? dayOverrides.find(o => o.date === iso) : null;
  const cur = existing ? String(existing.hours) : '';
  const v = prompt('Hours for ' + iso + ' (0 = holiday, leave blank to clear)', cur);
  if (v === null) return;
  const trimmed = v.trim();
  if (trimmed === '') {
    if (existing && existing.id) await deleteDayOverride(existing.id);
    renderSchedule();
    return;
  }
  const n = parseFloat(trimmed);
  if (!isFinite(n) || n < 0) return;
  await upsertDayOverride(iso, n, existing ? existing.label : null);
  renderSchedule();
}
