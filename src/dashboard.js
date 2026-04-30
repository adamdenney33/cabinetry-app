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

  const activeOrders  = orders.filter(o => o.status !== 'complete');
  const doneOrders    = orders.filter(o => o.status === 'complete');
  const overdueOrders = activeOrders.filter(o => { if (!o.due || o.due === 'TBD') return false; const d = new Date(o.due); return !isNaN(d) && d < new Date(); });
  const pipeline      = activeOrders.reduce((s,o) => s+o.value, 0);
  const revenue       = doneOrders.reduce((s,o) => s+o.value, 0);
  const approvedQ     = quotes.filter(q => q.status === 'approved').length;
  const quoteValue    = quotes.reduce((s,q) => s+quoteTotal(q), 0);
  const lowStock      = stockItems.filter(i => i.qty <= i.low);
  const stockValue    = stockItems.reduce((s,i) => s+i.qty*i.cost, 0);
  const totalSheets   = stockItems.reduce((s,i) => s+i.qty, 0);
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const totalClients   = clients.length;

  const fmt = v => v.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});

  const statusBar = (label, pct, color) => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:3px">
        <span>${label}</span><span>${pct.toFixed(0)}%</span>
      </div>
      <div class="progress-bg" style="height:6px">
        <div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${color}"></div>
      </div>
    </div>`;

  const ordersByStatus = ORDER_STATUSES.map(s => ({
    status: s, label: STATUS_LABELS[s], count: orders.filter(o=>o.status===s).length,
    color: STATUS_COLORS[s], badge: STATUS_BADGES[s]
  }));

  el.innerHTML = `
    <div style="padding:24px;max-width:1200px">

      <!-- Quick actions -->
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-primary" onclick="switchSection('quote');setTimeout(()=>document.getElementById('q-client')?.focus(),100)" style="font-size:11px;padding:6px 12px">+ Quote</button>
        <button class="btn btn-outline" onclick="switchSection('orders');setTimeout(()=>document.getElementById('o-client')?.focus(),100)" style="font-size:11px;padding:6px 12px;width:auto">+ Order</button>
        <button class="btn btn-outline" onclick="switchSection('projects');setTimeout(()=>document.getElementById('pj-name')?.focus(),100)" style="font-size:11px;padding:6px 12px;width:auto">+ Project</button>
        <button class="btn btn-outline" onclick="switchSection('cabinet')" style="font-size:11px;padding:6px 12px;width:auto">+ Cabinet</button>
        <button class="btn btn-outline" onclick="switchSection('cutlist')" style="font-size:11px;padding:6px 12px;width:auto">Cut List</button>
        <button class="btn btn-outline" onclick="switchSection('schedule')" style="font-size:11px;padding:6px 12px;width:auto">Schedule</button>
        ${overdueOrders.length ? `<span class="badge badge-red" style="font-size:11px;padding:5px 10px;margin-left:4px;cursor:pointer" onclick="switchSection('orders');window._orderFilter='active';renderOrdersMain()">${overdueOrders.length} overdue</span>` : ''}
      </div>

      <!-- Getting started guide — only when everything is empty -->
      ${orders.length === 0 && quotes.length === 0 && stockItems.length === 0 && !localStorage.getItem('pc_hide_guide') ? `
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

      <!-- KPI Row -->
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:18px;gap:10px">
        <div class="stat-card accent" style="padding:10px 14px;cursor:pointer" onclick="switchSection('orders');window._orderFilter='active';renderOrdersMain()">
          <div class="stat-label">Pipeline</div>
          <div class="stat-value">${cur}${fmt(pipeline)}</div>
          <div class="stat-sub">${activeOrders.length} active</div>
        </div>
        <div class="stat-card success" style="padding:10px 14px;cursor:pointer" onclick="switchSection('orders');window._orderFilter='complete';renderOrdersMain()">
          <div class="stat-label">Revenue</div>
          <div class="stat-value">${cur}${fmt(revenue)}</div>
          <div class="stat-sub">${doneOrders.length} completed</div>
        </div>
        <div class="stat-card warn" style="padding:10px 14px;cursor:pointer" onclick="switchSection('quote')">
          <div class="stat-label">Quoted</div>
          <div class="stat-value">${cur}${fmt(quoteValue)}</div>
          <div class="stat-sub">${approvedQ} approved</div>
        </div>
        <div class="stat-card ${lowStock.length ? 'danger' : 'success'}" style="padding:10px 14px;cursor:pointer" onclick="switchSection('stock')">
          <div class="stat-label">Stock</div>
          <div class="stat-value">${cur}${fmt(stockValue)}</div>
          <div class="stat-sub">${lowStock.length ? lowStock.length+' low' : totalSheets+' sheets'}</div>
        </div>
        <div class="stat-card" style="padding:10px 14px;cursor:pointer" onclick="switchSection('projects')">
          <div class="stat-label">Projects</div>
          <div class="stat-value">${activeProjects}</div>
          <div class="stat-sub">${projects.length} total</div>
        </div>
        <div class="stat-card" style="padding:10px 14px;cursor:pointer" onclick="switchSection('clients')">
          <div class="stat-label">Clients</div>
          <div class="stat-value">${totalClients}</div>
          <div class="stat-sub">${orders.length ? [...new Set(orders.map(o=>orderClient(o)))].length + ' with orders' : ''}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:14px">

        <!-- Orders by status -->
        <div class="card">
          <div class="card-header"><span class="card-title">Orders by Status</span></div>
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

        <!-- Active Orders -->
        <div class="card">
          <div class="card-header" style="justify-content:space-between">
            <span class="card-title">Active Orders</span>
            <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('orders')">View all</button>
          </div>
          <div class="card-body" style="padding:0">
            ${activeOrders.length === 0
              ? `<div style="padding:20px;text-align:center;color:var(--muted);font-size:13px">No active orders</div>`
              : activeOrders.slice(0,5).map(o => {
                const isOD = o.due && o.due !== 'TBD' && !isNaN(new Date(o.due)) && new Date(o.due) < new Date();
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid var(--border2);cursor:pointer;${isOD?'border-left:3px solid var(--danger);':''}" onclick="_openOrderPopup(${o.id})">
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${orderProject(o)}</div>
                  <div style="font-size:11px;color:${isOD?'var(--danger)':'var(--muted)'}">${orderClient(o)} · Due ${o.due}${isOD?' ⚠':''}
                  </div>
                </div>
                <div style="text-align:right;margin-left:12px;flex-shrink:0">
                  <div style="font-size:13px;font-weight:700">${cur}${fmt(o.value)}</div>
                  <span class="badge ${STATUS_BADGES[o.status] || 'badge-gray'}" style="font-size:9px">${STATUS_LABELS[o.status] || o.status || 'Unknown'}</span>
                </div>
              </div>`;}).join('')}
          </div>
        </div>

        <!-- Stock Alerts + Quotes -->
        <div style="display:flex;flex-direction:column;gap:18px">
          <div class="card" style="flex:1">
            <div class="card-header" style="justify-content:space-between">
              <span class="card-title">Stock Alerts</span>
              <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('stock')">View stock</button>
            </div>
            <div class="card-body" style="padding:0">
              ${lowStock.length === 0
                ? `<div style="padding:16px;text-align:center;color:var(--muted);font-size:13px">All materials well stocked</div>`
                : lowStock.slice(0,4).map(i => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 18px;border-bottom:1px solid var(--border2);cursor:pointer" onclick="_openStockPopup(${i.id})">
                  <div>
                    <div style="font-size:12px;font-weight:600;color:var(--text)">${i.name}</div>
                    <div style="font-size:11px;color:var(--danger)">${i.qty} left · reorder at ${i.low}</div>
                  </div>
                  <span class="badge badge-red">Low</span>
                </div>`).join('')}
            </div>
          </div>
          <div class="card" style="flex:1">
            <div class="card-header" style="justify-content:space-between">
              <span class="card-title">Recent Quotes</span>
              <button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('quote')">View all</button>
            </div>
            <div class="card-body" style="padding:0">
              ${quotes.slice(0,3).map(q => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 18px;border-bottom:1px solid var(--border2);cursor:pointer" onclick="_openQuotePopup(${q.id})">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${quoteProject(q)}</div>
                    <div style="font-size:11px;color:var(--muted)">${quoteClient(q)}</div>
                  </div>
                  <div style="text-align:right;margin-left:8px;flex-shrink:0">
                    <div style="font-size:12px;font-weight:700">${cur}${fmt(quoteTotal(q))}</div>
                    <div style="font-size:10px;color:var(--muted)">${q.date}</div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>

      </div>

      <!-- Upcoming Deadlines -->
      ${(() => {
        const upcoming = activeOrders.filter(o => o.due && o.due !== 'TBD').map(o => {
          const d = new Date(o.due); if (isNaN(d)) return null; d.setHours(0,0,0,0);
          return {...o, _due: d, _days: Math.round((d - new Date().setHours(0,0,0,0)) / 86400000)};
        }).filter(Boolean).sort((a,b) => a._due - b._due).slice(0, 5);
        if (!upcoming.length) return '';
        return `<div class="card" style="margin-bottom:18px">
          <div class="card-header" style="justify-content:space-between"><span class="card-title">Upcoming Deadlines</span><button class="btn btn-outline" style="padding:3px 10px;font-size:11px" onclick="switchSection('schedule')">Schedule</button></div>
          <div class="card-body" style="padding:0">
            ${upcoming.map(o => {
              const urgent = o._days <= 3; const overdue = o._days < 0;
              return `<div style="display:flex;align-items:center;gap:12px;padding:8px 18px;border-bottom:1px solid var(--border2);cursor:pointer" onclick="_openOrderPopup(${o.id})">
                <div style="width:36px;height:36px;border-radius:8px;background:${overdue?'var(--danger)':urgent?'var(--accent)':'var(--surface2)'};color:${overdue||urgent?'#fff':'var(--text)'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;flex-shrink:0">${Math.abs(o._days)}</div>
                <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text)">${orderProject(o)}</div><div style="font-size:11px;color:var(--muted)">${orderClient(o)} · ${overdue?'overdue':'day'+(o._days!==1?'s':'')+' left'}</div></div>
                <span class="badge ${STATUS_BADGES[o.status]||'badge-gray'}" style="font-size:10px">${STATUS_LABELS[o.status]||o.status}</span>
                ${o.status !== 'complete' ? `<button class="btn btn-outline" onclick="event.stopPropagation();advanceOrder(${o.id});renderDashboard();setTimeout(drawRevenueChart,0)" style="font-size:10px;padding:3px 8px;width:auto;flex-shrink:0">Next →</button>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>`;
      })()}

      <!-- Revenue chart + Pipeline -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px;margin-bottom:0">
        <div class="card">
          <div class="card-header"><span class="card-title">Monthly Revenue</span><span style="font-size:11px;color:var(--muted)">completed orders</span></div>
          <div class="card-body" style="padding:12px 18px">
            <canvas id="revenue-chart" height="120" style="width:100%;display:block"></canvas>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Pipeline</span></div>
          <div class="card-body" style="padding:14px 18px">
            ${ordersByStatus.filter(s=>s.status!=='complete').map(s =>
              statusBar(s.label + (s.count ? ` (${s.count})` : ''), orders.length ? s.count/orders.length*100 : 0, s.color)
            ).join('')}
            ${orders.length === 0 ? `<div style="color:var(--muted);font-size:13px;text-align:center;padding:8px">No orders yet</div>` : ''}
          </div>
        </div>
      </div>

    </div>`;
}

function drawRevenueChart() {
  const canvas = document.getElementById('revenue-chart');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 400;
  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
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
    if (slot) slot.revenue += o.value;
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
