// ProCabinet — Schedule view (carved out of src/app.js in phase E carve 1)
//
// Loaded as a classic <script defer> after src/app.js. Functions defined
// here are globals (top-level declarations in classic scripts go on
// window automatically), matching how app.js currently exposes its
// surface. Cross-file dependencies — `orders`, `_userId`, `_db`,
// `_escHtml`, `orderClient`, `orderProject`, `_openOrderPopup`,
// `_restoreProdStarts`, `STATUS_LABELS`, `renderOrdersMain` — are all
// globals defined in app.js / db.js, available at call time.

function renderSchedule() {
  const el = document.getElementById('schedule-main');
  if (!el) return;
  _restoreProdStarts(orders); // ensure prodStart dates loaded
  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const palette = ['#e8a838','#2563eb','#0d9488','#9333ea','#dc2626','#059669','#d97706','#6366f1','#ec4899','#14b8a6'];
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
  const computed = computeSchedule(orders, biz, overrides, today);

  /** @typedef {{id:any,project:string,client:string,start:Date|null,end:Date|null,color:string,lane:number,isManual:boolean,isMissingDates:boolean}} SchedEvent */
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
      ? slackDays(endISO, dueISO, cbSettings.weekdayHours || [8,8,8,8,8,0,0], overrideByDate, biz)
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
  const sortedEvents = _sortSchedEvents(events, sortMode);
  const isManualMode = sortMode === 'manual';
  /** @type {any} */ (window)._lastSchedSidebarEvents = sortedEvents;

  let sidebarHTML = '';
  // HEAD
  sidebarHTML += `<div class="sched-sidebar-head">
    <div style="font-size:14px;font-weight:800;color:var(--text)">Schedule</div>
  </div>`;
  // BODY
  sidebarHTML += `<div class="sched-sidebar-body">`;
  sidebarHTML += `<div class="sched-section-header" onclick="_toggleSchedSection('jobs', this)"><span class="sched-caret">▾</span> Jobs (${sortedEvents.length})</div>`;
  sidebarHTML += `<div id="sched-jobs-body">`;
  sidebarHTML += `<div class="sched-sort-row" title="Sort orders">
    <select onchange="_setSchedSortMode(this.value)">
      <option value="start" ${sortMode==='start'?'selected':''}>Start date</option>
      <option value="due" ${sortMode==='due'?'selected':''}>Due date</option>
      <option value="priority" ${sortMode==='priority'?'selected':''}>Priority</option>
      <option value="manual" ${sortMode==='manual'?'selected':''}>Manual</option>
      <option value="created" ${sortMode==='created'?'selected':''}>Order placed</option>
    </select>
  </div>`;
  sortedEvents.forEach((e, idx) => {
    const o = orders.find(x => x.id === e.id);
    const st = o ? (o.status ? (/** @type {Record<string,string>} */ (STATUS_LABELS))[o.status] || o.status : '') : '';
    const chip = slackChipHTML(/** @type {any} */ (e).slack);
    const dueText = (o && o.due && o.due !== 'TBD') ? `Due ${_escHtml(o.due)}` : '';
    const metaParts = [];
    if (e.isMissingDates) metaParts.push('<span style="color:#f87171;font-weight:600">Manual: no dates set</span>');
    else if (st) metaParts.push(_escHtml(st));
    if (dueText) metaParts.push(dueText);
    const meta = metaParts.join(' · ');
    const dragAttr = isManualMode
      ? ` draggable="true" ondragstart="_schedDragStart(event,${idx})" ondragover="_schedDragOver(event,this)" ondrop="_schedDrop(event,${idx})" ondragend="_schedDragEnd()"`
      : '';
    const dragHandle = isManualMode
      ? `<span class="cl-drag-handle" title="Drag to reorder" style="cursor:grab;color:var(--muted);display:inline-flex;align-items:center;flex-shrink:0">${SCHED_DRAG_HANDLE}</span>`
      : '';
    sidebarHTML += `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:2px;border-radius:6px;cursor:pointer"${dragAttr} onclick="_scrollToSchedBar(${e.id})" ondblclick="_openOrderPopup(${e.id})" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">${dragHandle}<div style="width:8px;height:8px;border-radius:2px;background:${e.color};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.isManual?'🔒 ':''}${_escHtml(e.project)} — ${_escHtml(e.client)}</div>${(meta||chip)?`<div style="font-size:9px;color:var(--muted);display:flex;align-items:center;gap:4px;margin-top:1px">${meta}${chip}</div>`:''}</div></div>`;
  });
  if(!sortedEvents.length)sidebarHTML+=`<div style="font-size:12px;color:var(--muted)">No active orders</div>`;
  sidebarHTML += `</div>`; // close sched-jobs-body
  sidebarHTML += `</div>`; // close sched-sidebar-body
  // FOOT
  sidebarHTML += `<div class="sched-sidebar-foot">
    <button class="btn btn-outline" onclick="_openScheduleSettingsPopup()" title="Working hours and holidays" style="font-size:10px;padding:4px 6px">⚙ Hours${overrideCount?` <span style="opacity:.7">(${overrideCount})</span>`:''}</button>
    <button class="btn btn-outline" onclick="document.getElementById('schedule-today-marker')?.scrollIntoView({behavior:'smooth',block:'center'})" style="font-size:10px;padding:4px 6px">Today</button>
  </div>`;
  const sidebarEl = document.getElementById('schedule-sidebar');
  if (sidebarEl) sidebarEl.innerHTML = sidebarHTML;

  // Calendar using CSS grid per week
  // Calendar (rendered into main area)
  let cal = `<div style="position:sticky;top:0;z-index:5;background:var(--surface);display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--border)">
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
    // bars at the normal 20px stride — no overlap.
    const weekStart = week[0], weekEnd = week[6];
    const weekEvents = events.filter(e => {
      // events array invariant: at least one of e.start / e.end is non-null
      const s = /** @type {Date} */ (e.start||e.end), d = /** @type {Date} */ (e.end||e.start);
      return d >= weekStart && s <= weekEnd;
    });
    const maxLane = weekEvents.length ? Math.max(0, ...weekEvents.map(e => e.lane)) : 0;
    const stride = 20;
    const cellMinHeight = Math.max(90, 28 + (maxLane + 1) * stride + 4);

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
      cal += `<div style="${styleParts.join(';')};position:relative;min-height:${cellMinHeight}px"${td?' id="schedule-today-marker"':''}>
        <div style="font-size:${td?'12':'11'}px;font-weight:${td?'800':'500'};color:${td?'#fff':we?'var(--muted)':'var(--text2)'};${td?'background:var(--accent);border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center':'padding:1px 3px'}">${day.getDate()}</div>
        ${hoursChip}
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

      const labelText = _escHtml(e.project) + ' — ' + _escHtml(e.client);
      const manualStyle = e.isManual ? 'border:1px dashed rgba(255,255,255,0.5);' : '';
      const lockIcon = e.isManual ? '🔒 ' : '';
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

        cal += `<div class="sched-bar sched-bar-${e.id}" style="position:absolute;top:${barTop}px;left:${left}%;width:${width}%;height:18px;padding:0 2px;z-index:2;pointer-events:auto;display:flex;align-items:center;gap:3px" onclick="_openOrderPopup(${e.id})">
          <div style="background:${e.color};${manualStyle}color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:${radius};height:16px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;flex:1;min-width:0" title="${labelText}${e.isManual?' (manual)':''}">${segShowLabel?lockIcon+labelText:''}</div>
          ${segChipHTML}
        </div>`;
      });
    });

    cal += `</div>`; // close week container
  });

  el.innerHTML = cal;
  // Auto-scroll to today on load
  setTimeout(() => {
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

function _getSchedSortMode() {
  try {
    const v = localStorage.getItem('pc_sched_sort');
    if (v === 'start' || v === 'due' || v === 'priority' || v === 'manual' || v === 'created') return v;
  } catch(e) {}
  return 'start';
}

/** @param {string} mode */
function _setSchedSortMode(mode) {
  try { localStorage.setItem('pc_sched_sort', mode); } catch(e) {}
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
      if (bp !== ap) return bp - ap;
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

// ── Schedule Settings Popup (working hours + holidays) ──
// Replaces the inline sidebar panels: a single ⚙ Hours button opens this.
// Packaging / Contingency live in Cabinet Builder Core Rates, not here.
function _openScheduleSettingsPopup() {
  if (typeof _openPopup !== 'function') return;
  _openPopup(_scheduleSettingsPopupHTML(), 'md');
}

function _scheduleSettingsPopupHTML() {
  const wd = Array.isArray(cbSettings.weekdayHours) && cbSettings.weekdayHours.length === 7
    ? cbSettings.weekdayHours
    : [8, 8, 8, 8, 8, 0, 0];
  const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dayNamesFull = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekdayInputs = wd.map(/** @param {number} h @param {number} i */ (h, i) => `<div class="sched-wd-cell">
    <div class="sched-wd-letter" title="${dayNamesFull[i]}">${dayLetters[i]}</div>
    <input type="number" min="0" max="24" step="0.5" value="${h}" class="sched-wd-input" oninput="_updateWeekdayHour(${i}, this.value)">
  </div>`).join('');

  return `<div class="popup-header">
  <div class="popup-title">Working Hours &amp; Holidays</div>
  <button class="popup-close" onclick="_closePopup()">×</button>
</div>
<div class="popup-body">
  <div class="pf"><label class="pf-label">Default workday hours</label>
    <input class="pf-input" type="number" min="0" max="24" step="0.5" value="${cbSettings.workdayHours ?? 8}" oninput="_updateSchedDefault('workdayHours', this.value)">
  </div>
  <div class="pf"><label class="pf-label">Hours per weekday</label>
    <div class="sched-wd-grid">${weekdayInputs}</div>
    <div style="font-size:10px;color:var(--muted);margin-top:4px">Mon–Sun. Set Sat/Sun to 0 for a 5-day workweek; reduce one day for a recurring half-day.</div>
  </div>
  <div class="pf"><label class="pf-label">Production queue start</label>
    <input class="pf-input" type="date" value="${cbSettings.queueStartDate || ''}" oninput="_updateSchedDefault('queueStartDate', this.value)">
    <div style="font-size:10px;color:var(--muted);margin-top:4px">Anchor for auto-scheduled orders. Leave blank to use today.</div>
  </div>
  <div class="pf-divider"></div>
  <div class="pf-label" style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">
    <span>Holidays &amp; one-off overrides</span>
    <button class="btn btn-outline" onclick="_holidayAdd()" style="font-size:11px;padding:3px 8px;width:auto">+ Add</button>
  </div>
  <div id="sched-holidays-list" class="sched-overrides-list">${_holidaysListHTML()}</div>
</div>
<div class="popup-footer">
  <div class="popup-footer-right"><button class="btn btn-primary" onclick="_closePopup()">Done</button></div>
</div>`;
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
  } else {
    const n = parseFloat(val);
    cbSettings[key] = isFinite(n) ? n : 0;
  }
  if (typeof _syncCBSettingsToDB === 'function') _syncCBSettingsToDB();
  renderSchedule();
}

/** @param {number} idx  @param {string} val */
function _updateWeekdayHour(idx, val) {
  if (!Array.isArray(cbSettings.weekdayHours) || cbSettings.weekdayHours.length !== 7) {
    cbSettings.weekdayHours = [8, 8, 8, 8, 8, 0, 0];
  }
  const n = parseFloat(val);
  cbSettings.weekdayHours[idx] = isFinite(n) ? n : 0;
  if (typeof _syncCBSettingsToDB === 'function') _syncCBSettingsToDB();
  renderSchedule();
}

async function _holidayAdd() {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  let target = iso;
  if (Array.isArray(dayOverrides) && dayOverrides.find(o => o.date === target)) {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    target = t.toISOString().slice(0, 10);
  }
  await upsertDayOverride(target, 0, '');
  _refreshHolidaysList();
  renderSchedule();
}
/** @param {number|null} id @param {string} val */
async function _holidayEditDate(id, val) {
  if (!val || !Array.isArray(dayOverrides)) return;
  const o = dayOverrides.find(x => x.id === id);
  if (!o) return;
  if (o.id != null) await deleteDayOverride(o.id);
  await upsertDayOverride(val, o.hours, o.label);
  _refreshHolidaysList();
  renderSchedule();
}
/** @param {number|null} id @param {string} val */
async function _holidayEditHours(id, val) {
  if (!Array.isArray(dayOverrides)) return;
  const o = dayOverrides.find(x => x.id === id);
  if (!o) return;
  await upsertDayOverride(o.date, parseFloat(val) || 0, o.label);
  _refreshHolidaysList();
  renderSchedule();
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
  renderSchedule();
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
