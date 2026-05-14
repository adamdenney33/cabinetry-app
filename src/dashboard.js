// ProCabinet — Dashboard view (carved out of src/app.js in phase E carve 2)
//
// Loaded as a classic <script defer> after src/app.js. Top-level functions
// are globals via classic-script semantics. Cross-file dependencies — orders,
// quotes, stockItems, projects, clients, _escHtml, ORDER_STATUSES,
// STATUS_LABELS, STATUS_COLORS, STATUS_BADGES, _openOrderPopup,
// _openStockPopup, _openQuotePopup, advanceOrder, switchSection, quoteTotal,
// quoteClient, quoteProject, orderClient, orderProject, renderOrdersMain —
// are all globals defined elsewhere.

function renderDashboard() {
  const cur = window.currency;
  const el = document.getElementById('dashboard-main');
  if (!el) return;

  const _dueRank = (/** @type {any} */ o) => {
    if (!o.due || o.due === 'TBD') return Infinity;
    const t = +new Date(o.due);
    return isNaN(t) ? Infinity : t;
  };
  const activeOrders = orders
    .filter(o => o.status !== 'complete')
    .sort((a, b) => _dueRank(a) - _dueRank(b));
  const overdueOrders = activeOrders.filter(o => { if (!o.due || o.due === 'TBD') return false; const d = new Date(o.due); return !isNaN(+d) && d < new Date(); });
  const customerQuotes = quotes.filter(q => !_isDraftQuote(q));
  const lowStock      = stockItems.filter(i => (i.qty ?? 0) <= (i.low ?? 0));
  const DASH_CARD_ROWS = 5;

  // Schedule data — mirror the Schedule tab so the dashboard "this week" card
  // shows the same events as the calendar. See src/schedule.js:43-80.
  if (typeof _restoreProdStarts === 'function') _restoreProdStarts(orders);
  const _schedBiz = {
    workdayHours: cbSettings.workdayHours,
    weekdayHours: cbSettings.weekdayHours,
    packagingHours: cbSettings.packagingHours,
    contingencyHours: cbSettings.contingencyHours,
    queueStartDate: cbSettings.queueStartDate,
  };
  const _schedOverrides = (typeof dayOverrides !== 'undefined' && Array.isArray(dayOverrides)) ? dayOverrides : [];
  const _schedToday = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const _schedComputed = (typeof computeSchedule === 'function')
    ? computeSchedule(orders, _schedBiz, _schedOverrides, _schedToday)
    : new Map();

  /** @param {number} v */
  const fmt = v => v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

  // Pipeline window: last 90 days including today (today + 89 prior days)
  const _pipelineCutoff = new Date();
  _pipelineCutoff.setHours(0, 0, 0, 0);
  _pipelineCutoff.setDate(_pipelineCutoff.getDate() - 89);
  const _pipelineOrders = orders.filter(o => {
    if (!o.created_at) return false;
    const d = new Date(o.created_at);
    return !isNaN(+d) && d >= _pipelineCutoff;
  });

  const ordersByStatus = ORDER_STATUSES.map(s => ({
    status: s, label: (/** @type {Record<string,string>} */(STATUS_LABELS))[s], count: _pipelineOrders.filter(o=>o.status===s).length,
    color: (/** @type {Record<string,string>} */(STATUS_COLORS))[s], badge: (/** @type {Record<string,string>} */(STATUS_BADGES))[s]
  }));

  el.innerHTML = `
    <div style="padding:24px;max-width:1200px">

      <!-- Quick actions -->
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary" onclick="switchSection('schedule')" style="font-size:11px;padding:6px 12px;width:auto">Schedule</button>
        <button class="btn btn-outline" onclick="switchSection('cutlist')" style="font-size:11px;padding:6px 12px;width:auto">+ Cut List</button>
        <button class="btn btn-outline" onclick="switchSection('stock');setTimeout(()=>document.getElementById('stock-name')?.focus(),100)" style="font-size:11px;padding:6px 12px;width:auto">+ Stock</button>
        <button class="btn btn-outline" onclick="switchSection('cabinet')" style="font-size:11px;padding:6px 12px;width:auto">+ Cabinet</button>
        <button class="btn btn-outline" onclick="switchSection('quote');setTimeout(()=>document.getElementById('q-client')?.focus(),100)" style="font-size:11px;padding:6px 12px;width:auto">+ Quote</button>
        <button class="btn btn-outline" onclick="switchSection('orders');setTimeout(()=>document.getElementById('o-client')?.focus(),100)" style="font-size:11px;padding:6px 12px;width:auto">+ Order</button>
        <button class="btn btn-outline" onclick="switchSection('clients');setTimeout(()=>document.getElementById('cl-name')?.focus(),100)" style="font-size:11px;padding:6px 12px;width:auto">+ Client</button>
        ${overdueOrders.length ? `<span class="badge badge-red" style="font-size:11px;padding:5px 10px;margin-left:4px;cursor:pointer" onclick="switchSection('orders');window._orderFilter='active';renderOrdersMain()">${overdueOrders.length} overdue</span>` : ''}
      </div>

      <!-- Getting started guide — only when everything is empty -->
      ${orders.length === 0 && customerQuotes.length === 0 && stockItems.length === 0 && !localStorage.getItem('pc_hide_guide') ? `
      <div id="getting-started-guide" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px 24px;margin-bottom:20px;position:relative">
        <button onclick="localStorage.setItem('pc_hide_guide','1');this.parentElement.remove()" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:16px;padding:4px 8px;border-radius:4px" title="Dismiss">&times;</button>
        <div style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text)">Getting Started</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
          <div style="display:flex;gap:12px;align-items:flex-start;cursor:pointer" onclick="switchSection('clients')">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">1</div>
            <div><div style="font-size:13px;font-weight:600;color:var(--accent)">Add clients &amp; projects</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Create clients and projects — they appear in shared libraries across all tabs</div></div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;cursor:pointer" onclick="switchSection('stock')">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);color:var(--muted);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">2</div>
            <div><div style="font-size:13px;font-weight:600;color:var(--text2)">Add stock materials</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Enter your sheet materials — they flow into the Cut List as Stock Panels</div></div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;cursor:pointer" onclick="switchSection('quote')">
            <div style="width:28px;height:28px;border-radius:50%;background:var(--surface2);color:var(--muted);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">3</div>
            <div><div style="font-size:13px;font-weight:600;color:var(--text2)">Quote &amp; build</div><div style="font-size:11px;color:var(--muted);margin-top:2px">Create quotes, optimize cut lists, build cabinets — convert quotes to orders when ready</div></div>
          </div>
        </div>
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border2);font-size:11px;color:var(--muted)">
          <strong style="color:var(--text2)">Shared Data:</strong> Clients and Projects are shared across tabs. Use the search inputs in each sidebar to find existing entries, or tap <strong>+</strong> to create new ones inline.
        </div>
      </div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:14px">

        <!-- Active Orders -->
        <div class="card">
          <div class="card-header" style="justify-content:space-between">
            <span class="card-title">Active Orders</span>
            <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('orders')">View all</button>
          </div>
          <div class="card-body" style="padding:0">
            ${activeOrders.length === 0
              ? `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No active orders</div>`
              : activeOrders.slice(0, DASH_CARD_ROWS).map(o => {
                const isOD = o.due && o.due !== 'TBD' && !isNaN(+new Date(o.due)) && new Date(o.due) < new Date();
                const oNum = o.order_number || ('ORD-' + String(o.id).padStart(4,'0'));
                const oCli = orderClient(o);
                const oProj = orderProject(o);
                const oTopLine = [oNum, oCli].filter(Boolean).join(' · ');
                const oCaption = [oProj, o.due ? `Due ${String(o.due).slice(0, 10)}${isOD ? ' ⚠' : ''}` : null].filter(Boolean).join(' · ');
                return `<div class="dash-row${isOD ? ' is-overdue' : ''}" onclick="_openOrderPopup(${o.id})">
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(oTopLine)}</div>
                  <div style="font-size:11px;color:${isOD?'var(--danger)':'var(--muted)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(oCaption)}</div>
                </div>
                <div style="text-align:right;margin-left:12px;flex-shrink:0">
                  <div style="font-size:12px;font-weight:700">${cur}${fmt(o.value ?? 0)}</div>
                  <span class="badge ${(/** @type {Record<string,string>} */(STATUS_BADGES))[o.status||''] || 'badge-gray'}" style="font-size:9px">${(/** @type {Record<string,string>} */(STATUS_LABELS))[o.status||''] || o.status || 'Unknown'}</span>
                </div>
              </div>`;}).join('')}
          </div>
        </div>

        <!-- Recent Quotes -->
        <div class="card">
          <div class="card-header" style="justify-content:space-between">
            <span class="card-title">Recent Quotes</span>
            <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('quote')">View all</button>
          </div>
          <div class="card-body" style="padding:0">
            ${quotes.slice(0, DASH_CARD_ROWS).map(q => {
              const qNum = q.quote_number || ('QUO-' + String(q.id).padStart(4, '0'));
              const qCli = quoteClient(q);
              const qProj = quoteProject(q);
              const qTopLine = [qNum, qCli].filter(Boolean).join(' · ');
              const qStatus = q.status || 'draft';
              const qStatusBadge = qStatus === 'approved' ? 'badge-green' : qStatus === 'sent' ? 'badge-blue' : 'badge-gray';
              const qStatusText = qStatus === 'approved' ? 'Approved' : qStatus === 'sent' ? 'Sent' : 'Draft';
              return `
              <div class="dash-row" onclick="_openQuotePopup(${q.id})">
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_escHtml(qTopLine)}</div>
                  ${qProj ? `<div style="font-size:11px;color:var(--muted)">${_escHtml(qProj)}</div>` : ''}
                </div>
                <div style="text-align:right;margin-left:8px;flex-shrink:0">
                  <div style="font-size:12px;font-weight:700">${cur}${fmt(quoteTotal(q))}</div>
                  <span class="badge ${qStatusBadge}" style="font-size:9px">${qStatusText}</span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Stock Alerts -->
        <div class="card">
          <div class="card-header" style="justify-content:space-between">
            <span class="card-title">Stock Alerts</span>
            <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('stock')">View stock</button>
          </div>
          <div class="card-body" style="padding:0">
            ${lowStock.length === 0
              ? `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">All materials well stocked</div>`
              : lowStock.slice(0, DASH_CARD_ROWS).map(i => `
              <div class="dash-row" onclick="_openStockPopup(${i.id})">
                <div>
                  <div style="font-size:12px;font-weight:600;color:var(--text)">${i.name}</div>
                  <div style="font-size:11px;color:var(--danger)">${i.qty} left · reorder at ${i.low}</div>
                </div>
                <span class="badge badge-red">Low</span>
              </div>`).join('')}
          </div>
        </div>

      </div>

      <!-- Schedule (next 7 days) — mini-calendar slice mirroring the Schedule tab -->
      ${(() => {
        /** @param {string | null | undefined} str */
        const parseDate = (str) => {
          if (!str || str === 'TBD') return null;
          const p = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
          if (p) {
            /** @type {Record<string, number>} */
            const m = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
            const mo = m[p[2].toLowerCase().substring(0,3)];
            if (mo !== undefined) return new Date(parseInt(p[3]), mo, parseInt(p[1]));
          }
          const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
          if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
          const d = new Date(str); return isNaN(+d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
        };
        const palette = ['#e8a838','#2563eb','#0d9488','#9333ea','#dc2626','#059669','#d97706','#6366f1','#ec4899','#14b8a6'];
        const dayShort = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const today = _schedToday;

        /** @type {Date[]} */
        const days = [];
        for (let i = 0; i < 7; i++) { const d = new Date(today); d.setDate(today.getDate() + i); days.push(d); }
        const winStart = days[0];
        const winEnd = new Date(days[6]); winEnd.setHours(23,59,59,999);

        /** @type {Record<string, number>} */
        const overrideByDate = {};
        for (const ov of _schedOverrides) overrideByDate[ov.date] = ov.hours;
        const defaultDayHours = parseFloat(cbSettings.workdayHours) || 8;
        /** @param {Date} d */
        const dayHours = (d) => {
          const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (Object.prototype.hasOwnProperty.call(overrideByDate, iso)) return overrideByDate[iso];
          const wd = (d.getDay() + 6) % 7;
          if (Array.isArray(cbSettings.weekdayHours) && cbSettings.weekdayHours.length === 7) {
            return parseFloat(cbSettings.weekdayHours[wd]) || 0;
          }
          return parseFloat(cbSettings.workdayHours) || 8;
        };

        // Build events with the same shape and palette indexing as src/schedule.js
        /** @typedef {{id:any,numberLabel:string,project:string,client:string,start:Date,end:Date,color:string,lane:number,isManual:boolean}} CalEvent */
        /** @type {CalEvent[]} */
        const events = [];
        const allActive = orders.filter(o => o.status !== 'complete');
        allActive.forEach((o, idx) => {
          const sched = _schedComputed.get(o.id);
          if (sched && sched.isMissingDates) return;
          let start = null, end = null;
          if (sched && sched.startISO) {
            start = parseDate(sched.startISO);
            end = parseDate(sched.endISO) || start;
          }
          if (!start && !end) {
            const due = parseDate(o.due), prod = parseDate(o.prodStart);
            if (!due && !prod) return;
            start = prod || due;
            end = due || prod;
          }
          if (!start || !end) return;
          events.push({
            id: o.id,
            numberLabel: o.order_number || ('ORD-' + String(o.id).padStart(4,'0')),
            project: orderProject(o),
            client: orderClient(o),
            start, end,
            color: palette[idx % palette.length],
            lane: sched ? sched.lane : 0,
            isManual: o.auto_schedule === false,
          });
        });

        // Per-event slack (working days from scheduled end → due) — mirrors
        // src/schedule.js so the dashboard shows the same end-of-bar chip
        // ("1w 1d", "Late", etc.) as the full Schedule tab.
        for (const e of events) {
          const o = orders.find(x => x.id === e.id);
          const dueISO = o ? _orderDateToISO(o.due || '') : '';
          const endISO = e.end ? `${e.end.getFullYear()}-${String(e.end.getMonth()+1).padStart(2,'0')}-${String(e.end.getDate()).padStart(2,'0')}` : '';
          /** @type {any} */ (e).slack = (endISO && dueISO)
            ? slackDays(endISO, dueISO, cbSettings.weekdayHours || [8,8,8,8,8,0,0], overrideByDate, _schedBiz)
            : null;
        }

        const winEvents = events.filter(e => e.end >= winStart && e.start <= winEnd);
        const maxLane = winEvents.length ? Math.max(0, ...winEvents.map(e => e.lane)) : 0;
        const stride = 20;
        const cellMinHeight = Math.max(80, 28 + (maxLane + 1) * stride + 4);

        // Header row: weekday names matching the actual 7-day window
        const header = `<div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--border)">
          ${days.map(d => {
            const we = d.getDay() === 0 || d.getDay() === 6;
            return `<div style="padding:6px 4px;font-size:11px;font-weight:600;color:${we?'var(--muted)':'var(--text2)'};text-align:center">${dayShort[d.getDay()]}</div>`;
          }).join('')}
        </div>`;

        // Day cells
        let row = `<div style="position:relative;display:grid;grid-template-columns:repeat(7,1fr);min-height:${cellMinHeight}px">`;
        days.forEach((day) => {
          const td = +day === +today;
          const we = day.getDay() === 0 || day.getDay() === 6;
          const dh = dayHours(day);
          const isHoliday = dh === 0;
          const isPartial = dh > 0 && dh < defaultDayHours;
          const dayISO = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
          const hasOverride = Object.prototype.hasOwnProperty.call(overrideByDate, dayISO);
          let cellBg = '';
          let cellExtra = '';
          if (td) cellBg = 'rgba(232,168,56,0.06)';
          else if (isHoliday) { cellBg = 'var(--surface2)'; cellExtra = 'background-image:repeating-linear-gradient(-45deg,transparent 0 6px,rgba(255,255,255,0.04) 6px 12px)'; }
          else if (isPartial) cellBg = 'rgba(232,168,56,0.05)';
          else if (we) cellBg = 'rgba(255,255,255,0.015)';
          const styleParts = ['border:1px solid var(--border2)','padding:3px'];
          if (cellBg) styleParts.push('background:' + cellBg);
          if (cellExtra) styleParts.push(cellExtra);
          const chipColor = hasOverride ? 'var(--accent)' : (isHoliday ? '#f87171' : (isPartial ? '#fbbf24' : 'var(--muted)'));
          const chipBg = hasOverride ? 'rgba(232,168,56,0.18)' : 'rgba(255,255,255,0.04)';
          const hoursChip = `<div style="position:absolute;top:3px;right:3px;font-size:9px;font-weight:700;color:${chipColor};background:${chipBg};padding:1px 4px;border-radius:3px">${dh}h</div>`;
          row += `<div style="${styleParts.join(';')};position:relative;min-height:${cellMinHeight}px">
            <div style="font-size:${td?'12':'11'}px;font-weight:${td?'800':'500'};color:${td?'#fff':we?'var(--muted)':'var(--text2)'};${td?'background:var(--accent);border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center':'padding:1px 3px'}">${day.getDate()}</div>
            ${hoursChip}
          </div>`;
        });

        // Bars overlaid (clipped to the 7-day window; sliced around 0-hour days)
        winEvents.forEach(e => {
          const startIdx = e.start < winStart ? 0 : Math.round((+e.start - +winStart) / 86400000);
          const endIdx = e.end > winEnd ? 6 : Math.round((+e.end - +winStart) / 86400000);
          const isRealStart = e.start >= winStart && e.start <= winEnd;
          const isRealEnd = e.end >= winStart && e.end <= winEnd;
          /** @type {[number, number][]} */
          const runs = [];
          let runStart = -1;
          for (let di = startIdx; di <= endIdx; di++) {
            const isWorking = dayHours(days[di]) > 0;
            if (isWorking && runStart === -1) runStart = di;
            else if (!isWorking && runStart !== -1) { runs.push([runStart, di - 1]); runStart = -1; }
          }
          if (runStart !== -1) runs.push([runStart, endIdx]);
          if (!runs.length) return;
          const labelText = [e.numberLabel, e.project, e.client].filter(Boolean).map(_escHtml).join(' · ');
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
            const segShowLabel = isFirstRun && (isRealStart || startIdx === 0);
            const segChipHTML = segIsRealEnd ? slackChipHTML(/** @type {any} */ (e).slack) : '';
            const barText = segShowLabel ? lockIcon + labelText : '';
            row += `<div class="dash-event-bar" style="position:absolute;top:${barTop}px;left:${left}%;width:${width}%;height:18px;padding:0 2px;z-index:2;display:flex;align-items:center;gap:3px;cursor:pointer" onclick="_openOrderPopup(${e.id})">
              <div style="background:${e.color};${manualStyle}color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:${radius};height:16px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1;min-width:0" title="${labelText}${e.isManual?' (manual)':''}">${barText}</div>
              ${segChipHTML}
            </div>`;
          });
        });
        row += `</div>`;

        return `<div class="card" style="margin-bottom:18px">
          <div class="card-header" style="justify-content:space-between"><span class="card-title">Schedule <span style="font-weight:400;color:var(--muted);margin-left:4px">next 7 days</span></span><button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('schedule')">Open</button></div>
          ${header}
          ${row}
          ${winEvents.length === 0 ? `<div style="padding:10px;text-align:center;color:var(--muted);font-size:11px;border-top:1px solid var(--border2)">Nothing scheduled in the next 7 days</div>` : ''}
        </div>`;
      })()}

      <!-- Revenue chart + Pipeline -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-bottom:0">
        <div class="card">
          <div class="card-header"><span class="card-title">Monthly Revenue <span style="font-weight:400;color:var(--muted);margin-left:4px">completed orders</span></span></div>
          <div class="card-body" style="padding:12px 18px">
            <canvas id="revenue-chart" height="120" style="width:100%;display:block"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Pipeline <span style="font-weight:400;color:var(--muted);margin-left:4px">last 90 days</span></span></div>
          <div class="card-body" style="padding:14px 18px">
            ${ordersByStatus.map(s => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border2)">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block;flex-shrink:0"></span>
                  <span style="font-size:13px;color:var(--text)">${s.label}</span>
                </div>
                <span style="font-size:13px;font-weight:700;color:var(--text)">${s.count}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

    </div>`;
}

function drawRevenueChart() {
  const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('revenue-chart'));
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 400;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dark = document.documentElement.classList.contains('dark');
  const gridCol = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelCol = dark ? '#64748b' : '#94a3b8';
  const barCol = dark ? '#4caf50' : '#4caf50';
  const emptyCol = dark ? '#334155' : '#e2e8f0';

  const now = new Date();
  const months = Array.from({length: 6}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: d.toLocaleDateString('en-US', {month:'short'}), y: d.getFullYear(), m: d.getMonth(), revenue: 0 };
  });

  for (const o of orders.filter(o => o.status === 'complete')) {
    const d = new Date(o.created_at || Date.now());
    const slot = months.find(s => s.y === d.getFullYear() && s.m === d.getMonth());
    if (slot) slot.revenue += (o.value ?? 0);
  }

  const maxRev = Math.max(...months.map(m => m.revenue), 1);
  const PAD = { t: 8, b: 24, l: 44, r: 8 };
  const cW = W - PAD.l - PAD.r, cH = H - PAD.t - PAD.b;
  const barW = cW / months.length;

  ctx.clearRect(0, 0, W, H);

  // Gridlines + Y labels
  ctx.font = '10px -apple-system,sans-serif'; ctx.fillStyle = labelCol; ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const y = PAD.t + cH - (i / 3) * cH;
    ctx.strokeStyle = gridCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(W - PAD.r, y); ctx.stroke();
    if (i > 0) {
      const v = (maxRev * i / 3);
      ctx.fillText(v >= 1000 ? (v/1000).toFixed(0)+'k' : v.toFixed(0), PAD.l - 4, y + 4);
    }
  }

  // Bars
  months.forEach((m, i) => {
    const barH = Math.max(2, (m.revenue / maxRev) * cH);
    const x = PAD.l + i * barW + barW * 0.18;
    const bw = barW * 0.64;
    const y = PAD.t + cH - barH;
    ctx.fillStyle = m.revenue > 0 ? barCol : emptyCol;
    ctx.beginPath();
    ctx.moveTo(x + 3, y); ctx.lineTo(x + bw - 3, y);
    ctx.arcTo(x + bw, y, x + bw, y + 3, 3); ctx.lineTo(x + bw, y + barH);
    ctx.lineTo(x, y + barH); ctx.arcTo(x, y, x + 3, y, 3);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = labelCol; ctx.textAlign = 'center';
    ctx.fillText(m.label, PAD.l + i * barW + barW / 2, H - 6);
  });
}
