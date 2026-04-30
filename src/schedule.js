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

  function parseDate(str) {
    if (!str || str === 'TBD') return null;
    const p = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (p) { const m={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}; const mo=m[p[2].toLowerCase().substring(0,3)]; if(mo!==undefined) return new Date(parseInt(p[3]),mo,parseInt(p[1])); }
    const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(parseInt(iso[1]),parseInt(iso[2])-1,parseInt(iso[3]));
    const d = new Date(str); return isNaN(d)?null:new Date(d.getFullYear(),d.getMonth(),d.getDate());
  }
  function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
  function dayIdx(d){return Math.round((d-calStart)/86400000);}

  const events = orders.filter(o=>o.status!=='complete').map((o,idx)=>{
    const due=parseDate(o.due), start=parseDate(o.prodStart);
    if(!due&&!start)return null;
    return{id:o.id,project:orderProject(o),client:orderClient(o),start,due,color:palette[idx%palette.length]};
  }).filter(Boolean);

  const weeks = [];
  let ws = new Date(calStart);
  while(ws<=calEnd){const w=[];for(let d=0;d<7;d++){const day=new Date(ws);day.setDate(day.getDate()+d);w.push(day);}weeks.push(w);ws.setDate(ws.getDate()+7);}

  // Sidebar
  // Sidebar: job list (rendered into separate sidebar element)
  let sidebarHTML = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="font-size:14px;font-weight:800;color:var(--text)">Jobs</div>
    <button class="btn btn-outline" onclick="document.getElementById('schedule-today-marker')?.scrollIntoView({behavior:'smooth',block:'center'})" style="font-size:10px;padding:3px 8px;width:auto">Today</button>
  </div>`;
  events.forEach(e=>{const o=orders.find(x=>x.id===e.id);const st=o?STATUS_LABELS[o.status]||o.status:'';sidebarHTML+=`<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;margin-bottom:2px;border-radius:6px;cursor:pointer" onclick="_scrollToSchedBar(${e.id})" ondblclick="_openOrderPopup(${e.id})" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''"><div style="width:8px;height:8px;border-radius:2px;background:${e.color};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(e.project)}</div><div style="font-size:9px;color:var(--muted)">${_escHtml(e.client)}${st?' · '+st:''}</div></div><div onclick="event.stopPropagation();_openOrderPopup(${e.id})" style="color:var(--muted);font-size:10px;opacity:0.5;padding:2px 4px" title="Edit order">✎</div></div>`;});
  if(!events.length)sidebarHTML+=`<div style="font-size:12px;color:var(--muted)">No active orders</div>`;
  const sidebarEl = document.getElementById('schedule-sidebar');
  if (sidebarEl) sidebarEl.innerHTML = sidebarHTML;

  // Calendar using CSS grid per week
  // Calendar (rendered into main area)
  let cal = `<div style="position:sticky;top:0;z-index:5;background:var(--surface);display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--border)">
    ${dayNames.map((d,i)=>`<div style="padding:8px 4px;font-size:11px;font-weight:600;color:${i>=5?'var(--muted)':'var(--text2)'};text-align:center">${d}</div>`).join('')}
  </div>`;

  let prevMonth = -1;
  weeks.forEach(week => {
    const wm = week[0].getMonth();
    if (wm !== prevMonth) {
      prevMonth = wm;
      cal += `<div style="padding:16px 8px 4px;font-size:18px;font-weight:800;color:var(--text)">${monthNames[wm]} ${week[0].getFullYear()}</div>`;
    }

    // Week container with grid overlay
    cal += `<div style="position:relative;display:grid;grid-template-columns:repeat(7,1fr);min-height:90px">`;

    // Day cells (background grid)
    week.forEach((day,di) => {
      const td = sameDay(day,today);
      const we = di>=5;
      const bg = td?'rgba(232,168,56,0.06)':we?'rgba(255,255,255,0.015)':'';
      cal += `<div style="border:1px solid var(--border2);padding:3px;${bg?'background:'+bg:''}"${td?' id="schedule-today-marker"':''}>
        <div style="font-size:${td?'12':'11'}px;font-weight:${td?'800':'500'};color:${td?'#fff':we?'var(--muted)':'var(--text2)'};${td?'background:var(--accent);border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center':'padding:1px 3px'}">${day.getDate()}</div>
      </div>`;
    });

    // Event bars overlaid using absolute positioning
    const weekStart = week[0], weekEnd = week[6];
    const weekEvents = events.filter(e => {
      const s = e.start||e.due, d = e.due||e.start;
      return d >= weekStart && s <= weekEnd;
    });

    let barTop = 28; // below day numbers
    weekEvents.forEach(e => {
      const s = e.start||e.due, d = e.due||e.start;
      const startInWeek = s < weekStart ? 0 : s.getDay() === 0 ? 6 : s.getDay() - 1; // Mon=0
      const endInWeek = d > weekEnd ? 6 : d.getDay() === 0 ? 6 : d.getDay() - 1;
      const left = (startInWeek / 7 * 100).toFixed(2);
      const width = ((endInWeek - startInWeek + 1) / 7 * 100).toFixed(2);
      const isRealStart = e.start && s >= weekStart && s <= weekEnd;
      const isRealEnd = e.due && d >= weekStart && d <= weekEnd;
      const radius = (isRealStart&&isRealEnd)?'4px':isRealStart?'4px 0 0 4px':isRealEnd?'0 4px 4px 0':'0';

      cal += `<div class="sched-bar-${e.id}" style="position:absolute;top:${barTop}px;left:${left}%;width:${width}%;height:18px;padding:0 2px;z-index:2;pointer-events:auto" onclick="_openOrderPopup(${e.id})">
        <div style="background:${e.color};color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:${radius};height:16px;line-height:16px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer" title="${_escHtml(e.project)} — ${_escHtml(e.client)}">${isRealStart||startInWeek===0?_escHtml(e.project):''}</div>
      </div>`;
      barTop += 20;
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

function _scrollToSchedBar(orderId) {
  const bar = document.querySelector('.sched-bar-' + orderId);
  if (bar) {
    bar.scrollIntoView({behavior:'smooth',block:'center'});
    const inner = bar.firstElementChild;
    if (inner) { inner.style.outline = '2px solid #fff'; inner.style.boxShadow = '0 0 8px rgba(255,255,255,0.5)'; setTimeout(() => { inner.style.outline = ''; inner.style.boxShadow = ''; }, 1500); }
  }
}

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
function _restoreProdStarts(ordersList) {
  try {
    const stored = JSON.parse(localStorage.getItem('pc_order_prodstarts') || '{}');
    ordersList.forEach(o => {
      // Phase 3.8: orders.production_start_date is now the source of truth
      if (o.production_start_date) { o.prodStart = o.production_start_date; return; }
      const val = stored[String(o.id)] || stored[o.id];
      if (val) o.prodStart = val;
    });
  } catch(e) {}
}
