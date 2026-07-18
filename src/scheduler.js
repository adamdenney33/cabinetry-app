// ProCabinet — Production scheduler core (S.4)
//
// Pure layout algorithm: takes orders + working-hours config + today,
// returns each order's start/end/lane on the calendar. No DB, no DOM.
// Loaded as a classic <script defer> BEFORE src/schedule.js, which
// consumes computeSchedule() in its render path.
//
// Cross-file dependencies (all globals defined in earlier scripts):
//   cbSettings (cabinet.js) — workdayHours, weekdayHours, packagingHours,
//                              contingencyPct, queueStartDate
//   dayOverrides (business.js) — global per-date hours overrides
//   _quoteLineRowToCB (migrate.js) — converts cabinet-kind lines back into
//                                     cabinet objects for calcCBLine()
//   calcCBLine (cabinet-calc.js) — computes cabinet labour hours

// ══════════════════════════════════════════
// HELPERS — date math (local time, DST-safe)
// ══════════════════════════════════════════
/** @param {Date} d */
function _schedNextDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
/** @param {Date} d */
function _schedISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
/** @param {string} iso  YYYY-MM-DD */
function _schedFromISO(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}
/** Date.getDay() returns 0=Sun..6=Sat; we want 0=Mon..6=Sun. */
/** @param {Date} d */
function _schedWeekdayIdx(d) {
  return (d.getDay() + 6) % 7;
}

// ══════════════════════════════════════════
// WORKING HOURS
// ══════════════════════════════════════════
// Precedence: date override → weekday default → workday fallback. Hours already
// reserved by tasks on that date (see _schedTaskReservations) come off the top,
// floored at 0 — a day booked solid with tasks has no capacity for orders.
/** @param {Date} d
 *  @param {number[]} weekdayDefaults
 *  @param {Record<string, number>} overrideMap
 *  @param {{ workdayHours?: number }} biz
 *  @param {Record<string, number>} [reservedMap] */
function getWorkdayHours(d, weekdayDefaults, overrideMap, biz, reservedMap) {
  const iso = _schedISO(d);
  let hours;
  if (overrideMap && Object.prototype.hasOwnProperty.call(overrideMap, iso)) {
    hours = parseFloat(String(overrideMap[iso])) || 0;
  } else {
    hours = parseFloat(String(biz?.workdayHours)) || 8;
    if (Array.isArray(weekdayDefaults) && weekdayDefaults.length === 7) {
      const w = parseFloat(String(weekdayDefaults[_schedWeekdayIdx(d)]));
      if (isFinite(w)) hours = w;
    }
  }
  if (reservedMap && hours > 0) {
    const reserved = reservedMap[iso];
    if (reserved) hours = Math.max(0, hours - reserved);
  }
  return hours;
}

// Build the override map once per render to avoid linear scans inside the
// inner loop.
/** @param {Array<{date: string, hours: number}>} list */
function buildOverrideMap(list) {
  /** @type {Record<string, number>} */
  const m = {};
  for (const o of list || []) {
    if (o && o.date) m[o.date] = parseFloat(String(o.hours)) || 0;
  }
  return m;
}

// ══════════════════════════════════════════
// HOURS REQUIRED
// ══════════════════════════════════════════
// Mirror of _orderHoursBreakdown's formula, returns only the total.
// Used by the scheduler when laying out bars. Reads o._lines (cached on
// the order object by _hydrateOrderLines or _openOrderPopup).
/** @param {any} o
 *  @param {{ packagingHours?: number }} biz */
function orderHoursRequired(o, biz) {
  if (!o) return 0;
  // Manual override: bypasses line-item computation. NULL = use auto sum.
  if (o.hours_allocated != null) {
    const v = parseFloat(String(o.hours_allocated));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }
  const lines = Array.isArray(o._lines) ? o._lines : [];
  let cabinetHrs = 0, labourHrs = 0, itemHrs = 0;
  for (const r of lines) {
    const kind = r.line_kind || 'cabinet';
    if (kind === 'cabinet') {
      let hrs = r._hrs;
      if (typeof hrs !== 'number') {
        try {
          // _quoteLineRowToCB and calcCBLine are globals from earlier-loaded scripts.
          // calcCBLine bakes both contingency (cbSettings.contingencyPct) and
          // packaging (cbSettings.packagingHours, per cabinet) into labour hours,
          // so we don't add separate contingency/packaging blocks here. Packaging
          // therefore only counts for cabinet lines; the old per-order
          // orders.packaging_hours override is no longer applied.
          const cb = _quoteLineRowToCB(r);
          const c = calcCBLine(cb);
          hrs = c.labourHrs || 0;
          Object.defineProperty(r, '_hrs', { value: hrs, writable: true, enumerable: false, configurable: true });
        } catch (e) { hrs = 0; }
      }
      cabinetHrs += hrs * (parseFloat(r.qty) || 1);
    } else if (kind === 'labour') {
      labourHrs += parseFloat(r.labour_hours) || 0;
    } else if (kind === 'item') {
      itemHrs += (parseFloat(r.schedule_hours) || 0) * (parseFloat(r.qty) || 1);
    }
  }
  const over = parseFloat(o.run_over_hours) || 0;
  return cabinetHrs + labourHrs + itemHrs + over;
}

// Split one day's capacity between orders running concurrently (same priority).
// Max-min fair: everyone gets an equal share, and anyone needing less than
// their share hands the surplus back to the rest — so two 4h jobs in an 8h day
// both finish that day, and a 2h job beside a 30h job doesn't strand 2h of
// unused capacity. Returns hours allocated, parallel to `actives`.
/** @param {{ remaining: number }[]} actives
 *  @param {number} capacity
 *  @returns {number[]} */
function _schedShareDay(actives, capacity) {
  const alloc = actives.map(() => 0);
  let cap = capacity;
  let pool = actives.map((_, i) => i).filter(i => actives[i].remaining > 1e-9);
  // Each pass either exhausts the capacity or retires at least one order.
  let guard = actives.length + 2;
  while (cap > 1e-9 && pool.length > 0 && guard-- > 0) {
    const share = cap / pool.length;
    let used = 0;
    /** @type {number[]} */
    const next = [];
    for (const i of pool) {
      const want = actives[i].remaining - alloc[i];
      const give = Math.min(share, want);
      alloc[i] += give;
      used += give;
      if (want - give > 1e-9) next.push(i);
    }
    cap -= used;
    if (used <= 1e-9) break;
    pool = next;
  }
  return alloc;
}

// ══════════════════════════════════════════
// LAYOUT — computeSchedule
// ══════════════════════════════════════════
// A segment is one order's slice of one day. `hours` is the work actually done
// (what the block labels); `offset`/`span` describe the wall-clock window that
// slice occupies within the working day, measured in hours from the day's start.
// Orders running concurrently share an identical offset/span — same window,
// smaller `hours` each — which is what lets the Day/Week grid draw them
// side-by-side instead of stacking them past the end of the workday.
/** @typedef {{ date: string, hours: number, offset: number, span: number }} SchedSegment */
/** @typedef {{ id: any, startISO: string, endISO: string, lane: number, hoursRequired: number, isManual: boolean, isMissingDates?: boolean, segments: SchedSegment[] }} ScheduledOrder */

// Walk the calendar forward from `startCursor`, consuming working-hour capacity
// until `required` hours are placed. `startDayUsed` is the hours already
// consumed on `startCursor` by an earlier order in the queue — passing it lets
// the next order continue filling a partially-used final day instead of jumping
// to the next working day (the fix for jobs never packing onto the same day a
// predecessor finishes). `endDayUsed` in the return is the running total of
// hours consumed on the `end` day, ready to be threaded into the next order.
/** @param {Date} startCursor
 *  @param {number} startDayUsed
 *  @param {number} required
 *  @param {number[]} weekdayDefaults
 *  @param {Record<string, number>} overrideMap
 *  @param {{ workdayHours?: number }} biz
 *  @param {Record<string, number>} [reservedMap]
 *  @returns {{ start: Date, end: Date, segments: SchedSegment[], endDayUsed: number }} */
function _schedForwardPlace(startCursor, startDayUsed, required, weekdayDefaults, overrideMap, biz, reservedMap) {
  if (required <= 0) {
    // Zero-hour order — single-day placeholder at the cursor; consumes nothing,
    // so the start day's used-hours tally is unchanged.
    return { start: startCursor, end: startCursor, segments: [{ date: _schedISO(startCursor), hours: 0, offset: startDayUsed, span: 0 }], endDayUsed: startDayUsed };
  }
  /** @type {SchedSegment[]} */
  const segments = [];
  let cursor = startCursor;
  let dayUsed = startDayUsed;
  /** @type {Date|null} */
  let start = null;
  let end = startCursor;
  let endDayUsed = 0;
  let remaining = required;
  // Cap at 5y to guarantee termination.
  let safety = 365 * 5;
  while (remaining > 0 && safety-- > 0) {
    const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz, reservedMap);
    const avail = h - dayUsed;
    if (avail > 0) {
      if (start === null) start = cursor;
      const consume = Math.min(avail, remaining);
      const offset = dayUsed;
      remaining -= consume;
      dayUsed += consume;
      end = cursor;
      endDayUsed = dayUsed;
      segments.push({ date: _schedISO(cursor), hours: consume, offset, span: consume });
      if (remaining > 0 || dayUsed >= h) { cursor = _schedNextDay(cursor); dayUsed = 0; }
    } else {
      cursor = _schedNextDay(cursor);
      dayUsed = 0;
    }
  }
  if (start === null) start = cursor; // defensive
  return { start, end, segments, endDayUsed };
}

/** @param {any[]} ordersList  orders, plus auto-scheduled tasks shaped as
 *         pseudo-orders by _schedAutoTaskOrders() (id `task:<n>`, hours in
 *         `hours_allocated`) — they queue and fair-share exactly like orders
 *  @param {{ workdayHours?: number, weekdayHours?: number[], packagingHours?: number, contingencyPct?: number, queueStartDate?: string|null }} biz
 *  @param {Array<{ date: string, hours: number }>} overrides
 *  @param {Date} today
 *  @param {Record<string, number>} [reservedMap]  date → hours already taken by
 *         tasks (see _schedTaskReservations); deducted from that day's capacity
 *  @returns {Map<any, ScheduledOrder>} */
function computeSchedule(ordersList, biz, overrides, today, reservedMap) {
  /** @type {Map<any, ScheduledOrder>} */
  const out = new Map();
  if (!Array.isArray(ordersList) || ordersList.length === 0) return out;
  const overrideMap = buildOverrideMap(overrides);
  const weekdayDefaults = Array.isArray(biz?.weekdayHours) && biz.weekdayHours.length === 7
    ? biz.weekdayHours.map(h => parseFloat(String(h)) || 0)
    : [8, 8, 8, 8, 8, 0, 0];

  // Filter out completed orders. Manual orders use their own dates; auto
  // orders are placed by the algorithm.
  const live = ordersList.filter(o => o && o.status !== 'complete');
  /** @type {any[]} */
  const manualOrders = live.filter(o => o.auto_schedule === false);
  /** @type {any[]} */
  const autoOrders = live.filter(o => o.auto_schedule !== false);

  // Sort auto orders by priority asc (1 = highest), with 0 meaning "no
  // priority" (sorted to end). Ties broken by id asc for determinism.
  autoOrders.sort((a, b) => {
    const pa = parseInt(String(a.priority || 0), 10);
    const pb = parseInt(String(b.priority || 0), 10);
    // 0 means unset → goes after all explicit priorities.
    if (pa === 0 && pb !== 0) return 1;
    if (pb === 0 && pa !== 0) return -1;
    if (pa !== pb) return pa - pb;
    // Auto-scheduled tasks enter this list as pseudo-orders with a STRING id
    // ('task:<n>'), which would make `a.id - b.id` NaN and the sort
    // non-deterministic. They carry a numeric `_schedTieBreak` instead,
    // offset so real orders win the tie.
    const ka = a._schedTieBreak ?? a.id ?? 0;
    const kb = b._schedTieBreak ?? b.id ?? 0;
    return ka - kb;
  });

  const queueStart = biz?.queueStartDate ? _schedFromISO(biz.queueStartDate) : null;
  const anchor = queueStart && +queueStart > +today ? queueStart : today;

  /** @type {{ id: any, startISO: string, endISO: string, hoursRequired: number, isManual: boolean, segments: SchedSegment[] }[]} */
  const placements = [];

  // Orders sharing a priority form a group that runs CONCURRENTLY: they split
  // each day's capacity between them rather than each consuming it in full
  // (which booked N× the shop's real hours and pushed work past the end of the
  // day). Groups themselves are sequential — a lower priority only starts once
  // the group above it is done, picking up mid-day if that group left capacity.
  /** @type {any[][]} */
  const groups = [];
  for (const o of autoOrders) {
    const p = parseInt(String(o.priority || 0), 10);
    const last = groups[groups.length - 1];
    if (last && parseInt(String(last[0].priority || 0), 10) === p) last.push(o);
    else groups.push([o]);
  }

  // Running position of the queue: the day being filled, and how much of that
  // day is already spoken for.
  let cursor = anchor;
  let cursorDayUsed = 0;

  for (const group of groups) {
    const groupStart = cursor;
    /** @type {{ o: any, required: number, remaining: number, segments: SchedSegment[], start: Date|null, end: Date }[]} */
    const states = group.map(o => {
      const required = orderHoursRequired(o, biz);
      return { o, required, remaining: required, segments: [], start: null, end: groupStart };
    });

    // Zero-hour orders — placeholders at the group's start; consume nothing and
    // don't hold up the orders they sit beside.
    for (const s of states) {
      if (s.required > 0) continue;
      s.start = groupStart;
      s.end = groupStart;
      s.segments.push({ date: _schedISO(groupStart), hours: 0, offset: cursorDayUsed, span: 0 });
    }

    // Day-by-day simulation: fill each working day, splitting it between
    // whichever orders in the group still have work outstanding.
    const working = states.filter(s => s.required > 0);
    let safety = 365 * 5;
    while (working.some(s => s.remaining > 1e-9) && safety-- > 0) {
      const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz, reservedMap);
      const avail = h - cursorDayUsed;
      if (avail <= 1e-9) { cursor = _schedNextDay(cursor); cursorDayUsed = 0; continue; }

      const actives = working.filter(s => s.remaining > 1e-9);
      const alloc = _schedShareDay(actives, avail);
      const total = alloc.reduce((a, b) => a + b, 0);
      if (total <= 1e-9) { cursor = _schedNextDay(cursor); cursorDayUsed = 0; continue; } // defensive

      // Everyone working today shares one window: it opens where the day was
      // already filled to and runs for the total hours booked into it.
      const offset = cursorDayUsed;
      for (let i = 0; i < actives.length; i++) {
        const hrs = alloc[i];
        if (hrs <= 1e-9) continue;
        const s = actives[i];
        if (s.start === null) s.start = cursor;
        s.end = cursor;
        s.segments.push({ date: _schedISO(cursor), hours: hrs, offset, span: total });
        s.remaining -= hrs;
      }
      cursorDayUsed += total;
      // Day full → roll over. Otherwise hold position so the next group (or the
      // next day's pass) continues from the partially-filled day.
      if (cursorDayUsed >= h - 1e-9) { cursor = _schedNextDay(cursor); cursorDayUsed = 0; }
    }

    for (const s of states) {
      const start = s.start || groupStart;
      placements.push({ id: s.o.id, startISO: _schedISO(start), endISO: _schedISO(s.end || start), hoursRequired: s.required, isManual: false, segments: s.segments });
    }
  }

  // Manual orders: user pins start; end is computed from hoursRequired by
  // walking the calendar (same algo as auto orders). When a legacy explicit
  // manual_end_date is present, it's still honoured for backwards compat.
  for (const o of manualOrders) {
    const required = orderHoursRequired(o, biz);
    const startISO = o.manual_start_date || o.production_start_date || '';
    if (!startISO) {
      out.set(o.id, { id: o.id, startISO: '', endISO: '', lane: 0, hoursRequired: required, isManual: true, isMissingDates: true, segments: [] });
      continue;
    }
    /** @type {SchedSegment[]} */
    const segments = [];
    let endISO;
    if (o.manual_end_date) {
      endISO = o.manual_end_date;
      // Legacy explicit end: spread hours across the pinned span's working
      // days (capacity-capped) so Day/Week still gets sensible blocks.
      const s = _schedFromISO(startISO), e = _schedFromISO(endISO);
      if (s && e && +e >= +s) {
        let cursor = s;
        let remaining = required;
        let safety = 365 * 5;
        while (+cursor <= +e && safety-- > 0) {
          const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz, reservedMap);
          if (h > 0) {
            const consume = remaining > 0 ? Math.min(h, remaining) : h;
            remaining -= consume;
            // Pinned span owns its days outright, so each slice opens the day.
            segments.push({ date: _schedISO(cursor), hours: consume, offset: 0, span: consume });
          }
          cursor = _schedNextDay(cursor);
        }
      }
    } else {
      // Walk forward from the pinned start consuming workday capacity until
      // hours are exhausted (dayUsed starts at 0 — a pinned start owns its day).
      const startDate = _schedFromISO(startISO);
      if (!startDate) {
        endISO = startISO;
      } else {
        const placed = _schedForwardPlace(startDate, 0, required, weekdayDefaults, overrideMap, biz, reservedMap);
        for (const s of placed.segments) segments.push(s);
        endISO = _schedISO(placed.end);
      }
    }
    placements.push({ id: o.id, startISO, endISO: endISO || startISO, hoursRequired: required, isManual: true, segments });
  }

  // Lane assignment — first-fit Gantt layout. An order keeps its lane across
  // week boundaries because lanes are computed once per render, not per week.
  /** @type {{ start: Date, end: Date }[][]} */
  const lanes = [];
  for (const p of placements) {
    const s = _schedFromISO(p.startISO) || new Date();
    const e = _schedFromISO(p.endISO) || s;
    let assigned = -1;
    for (let li = 0; li < lanes.length; li++) {
      const lane = lanes[li];
      let conflict = false;
      for (const span of lane) {
        if (+s <= +span.end && +e >= +span.start) { conflict = true; break; }
      }
      if (!conflict) { lane.push({ start: s, end: e }); assigned = li; break; }
    }
    if (assigned === -1) {
      lanes.push([{ start: s, end: e }]);
      assigned = lanes.length - 1;
    }
    out.set(p.id, { id: p.id, startISO: p.startISO, endISO: p.endISO, lane: assigned, hoursRequired: p.hoursRequired, isManual: p.isManual, segments: p.segments });
  }

  return out;
}

// ══════════════════════════════════════════
// SLACK — working-day distance from scheduled end to due date
// ══════════════════════════════════════════
// Counts working days strictly between the two dates (exclusive of the start,
// inclusive of the end). Positive = slack remaining; negative = late.
//
// Returns null when due is missing or unparsable (caller should hide chip).
/** @param {string} scheduledEndISO
 *  @param {string|null|undefined} dueISO  YYYY-MM-DD
 *  @param {number[]} weekdayDefaults
 *  @param {Record<string, number>} overrideMap
 *  @param {{ workdayHours?: number }} biz
 *  @param {Record<string, number>} [reservedMap]  a day booked solid by tasks
 *         has no capacity left, so it isn't slack either */
function slackDays(scheduledEndISO, dueISO, weekdayDefaults, overrideMap, biz, reservedMap) {
  if (!dueISO) return null;
  const start = _schedFromISO(scheduledEndISO);
  const due = _schedFromISO(dueISO);
  if (!start || !due) return null;
  if (+start === +due) return 0;
  const forward = +due > +start;
  let cursor = forward ? _schedNextDay(start) : _schedNextDay(due);
  const limit = forward ? due : start;
  let count = 0;
  let safety = 365 * 5;
  while (+cursor <= +limit && safety-- > 0) {
    const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz, reservedMap);
    if (h > 0) count++;
    cursor = _schedNextDay(cursor);
  }
  return forward ? count : -count;
}

// Format a non-negative day count as "Xw Yd" (omitting zero parts).
/** @param {number} days */
function fmtSchedDays(days) {
  const w = Math.floor(days / 7);
  const d = days % 7;
  if (w === 0) return `${d}d`;
  if (d === 0) return `${w}w`;
  return `${w}w ${d}d`;
}

// Render a slack chip given a working-day delta. Returns HTML or '' if null.
/** @param {number|null} slack */
function slackChipHTML(slack) {
  if (slack == null) return '';
  let cls = 'sched-due-amber';
  let text = '';
  if (slack >= 2) { cls = 'sched-due-green'; text = `Due ${fmtSchedDays(slack)}`; }
  else if (slack >= 0) { cls = 'sched-due-amber'; text = slack === 0 ? 'on time' : `Due ${fmtSchedDays(slack)}`; }
  else { cls = 'sched-due-red'; text = `${fmtSchedDays(Math.abs(slack))} late`; }
  return `<span class="sched-due-chip ${cls}">${text}</span>`;
}

// Expose to globals (classic-script convention) — not strictly necessary but
// makes intent explicit and aids testing from the console.
/** @type {any} */ (window).computeSchedule = computeSchedule;
/** @type {any} */ (window).orderHoursRequired = orderHoursRequired;
/** @type {any} */ (window).getWorkdayHours = getWorkdayHours;
/** @type {any} */ (window).slackDays = slackDays;
