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
// Precedence: date override → weekday default → workday fallback.
/** @param {Date} d
 *  @param {number[]} weekdayDefaults
 *  @param {Record<string, number>} overrideMap
 *  @param {{ workdayHours?: number }} biz */
function getWorkdayHours(d, weekdayDefaults, overrideMap, biz) {
  const iso = _schedISO(d);
  if (overrideMap && Object.prototype.hasOwnProperty.call(overrideMap, iso)) {
    return parseFloat(String(overrideMap[iso])) || 0;
  }
  if (Array.isArray(weekdayDefaults) && weekdayDefaults.length === 7) {
    const w = parseFloat(String(weekdayDefaults[_schedWeekdayIdx(d)]));
    if (isFinite(w)) return w;
  }
  return parseFloat(String(biz?.workdayHours)) || 8;
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
          // calcCBLine bakes contingency (cbSettings.contingencyPct) into labour
          // hours, so we don't add a separate contingency block here.
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
  // Order-level packaging override falls back to business default.
  const pack = (o.packaging_hours != null) ? parseFloat(o.packaging_hours) : (biz?.packagingHours ?? 0);
  const over = parseFloat(o.run_over_hours) || 0;
  return cabinetHrs + labourHrs + itemHrs + pack + over;
}

// ══════════════════════════════════════════
// LAYOUT — computeSchedule
// ══════════════════════════════════════════
/** @typedef {{ id: any, startISO: string, endISO: string, lane: number, hoursRequired: number, isManual: boolean, isMissingDates?: boolean }} ScheduledOrder */

/** @param {any[]} ordersList
 *  @param {{ workdayHours?: number, weekdayHours?: number[], packagingHours?: number, contingencyPct?: number, queueStartDate?: string|null }} biz
 *  @param {Array<{ date: string, hours: number }>} overrides
 *  @param {Date} today
 *  @returns {Map<any, ScheduledOrder>} */
function computeSchedule(ordersList, biz, overrides, today) {
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
    return (a.id || 0) - (b.id || 0);
  });

  const queueStart = biz?.queueStartDate ? _schedFromISO(biz.queueStartDate) : null;
  const anchor = queueStart && +queueStart > +today ? queueStart : today;

  /** @type {{ id: any, startISO: string, endISO: string, hoursRequired: number, isManual: boolean }[]} */
  const placements = [];

  let pointer = anchor;
  let groupPriority = autoOrders[0] ? parseInt(String(autoOrders[0].priority || 0), 10) : 0;
  /** @type {Date | null} */
  let groupMaxEnd = null;

  for (const o of autoOrders) {
    const p = parseInt(String(o.priority || 0), 10);
    if (p !== groupPriority) {
      // New priority group: advance the pointer past the longest end of the
      // previous group, so lower priorities only start after higher ones finish.
      if (groupMaxEnd) pointer = _schedNextDay(groupMaxEnd);
      groupPriority = p;
      groupMaxEnd = null;
    }
    const required = orderHoursRequired(o, biz);
    /** @type {Date} */
    let cursor = pointer;
    /** @type {Date|null} */
    let start = null;
    /** @type {Date} */
    let end = pointer;
    let remaining = required;

    if (remaining <= 0) {
      // Zero-hour order — single-day placeholder at the pointer; doesn't
      // consume capacity and doesn't push the group end.
      start = cursor;
      end = cursor;
    } else {
      // Walk forward consuming capacity. Cap at 5y to guarantee termination.
      let safety = 365 * 5;
      while (remaining > 0 && safety-- > 0) {
        const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz);
        if (h > 0) {
          if (start === null) start = cursor;
          const consume = Math.min(h, remaining);
          remaining -= consume;
          end = cursor;
          if (remaining > 0 || consume === h) cursor = _schedNextDay(cursor);
        } else {
          cursor = _schedNextDay(cursor);
        }
      }
      if (start === null) start = cursor; // defensive
    }

    placements.push({ id: o.id, startISO: _schedISO(start), endISO: _schedISO(end), hoursRequired: required, isManual: false });
    if (required > 0 && (!groupMaxEnd || +end > +groupMaxEnd)) groupMaxEnd = end;
  }

  // Manual orders: user pins start; end is computed from hoursRequired by
  // walking the calendar (same algo as auto orders). When a legacy explicit
  // manual_end_date is present, it's still honoured for backwards compat.
  for (const o of manualOrders) {
    const required = orderHoursRequired(o, biz);
    const startISO = o.manual_start_date || o.production_start_date || '';
    if (!startISO) {
      out.set(o.id, { id: o.id, startISO: '', endISO: '', lane: 0, hoursRequired: required, isManual: true, isMissingDates: true });
      continue;
    }
    let endISO;
    if (o.manual_end_date) {
      endISO = o.manual_end_date;
    } else {
      // Walk forward consuming workday capacity until hours are exhausted.
      const startDate = _schedFromISO(startISO);
      if (!startDate) {
        endISO = startISO;
      } else {
        let cursor = startDate;
        let end = startDate;
        let remaining = required;
        if (remaining > 0) {
          let safety = 365 * 5;
          while (remaining > 0 && safety-- > 0) {
            const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz);
            if (h > 0) {
              const consume = Math.min(h, remaining);
              remaining -= consume;
              end = cursor;
              if (remaining > 0 || consume === h) cursor = _schedNextDay(cursor);
            } else {
              cursor = _schedNextDay(cursor);
            }
          }
        }
        endISO = _schedISO(end);
      }
    }
    placements.push({ id: o.id, startISO, endISO: endISO || startISO, hoursRequired: required, isManual: true });
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
    out.set(p.id, { id: p.id, startISO: p.startISO, endISO: p.endISO, lane: assigned, hoursRequired: p.hoursRequired, isManual: p.isManual });
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
 *  @param {{ workdayHours?: number }} biz */
function slackDays(scheduledEndISO, dueISO, weekdayDefaults, overrideMap, biz) {
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
    const h = getWorkdayHours(cursor, weekdayDefaults, overrideMap, biz);
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
