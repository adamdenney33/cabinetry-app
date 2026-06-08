/* ===================================================================
   ProCabinet — Quote/Order overhaul MOCKUPS · shared foundation
   One seed kitchen + money math + cabinet "photo" SVGs + the real app
   chrome + reusable components. Every mockup page builds on window.MOCK
   so all 18 stay pixel-consistent. NOT production code.
   =================================================================== */
(function () {
  'use strict';

  // ── Business + customer + quote meta ──────────────────────────────
  const biz = {
    name: 'Blackwood Joinery',
    tagline: 'Bespoke kitchens & cabinetry · Est. 2014',
    monogram: 'B',
    phone: '01453 555 218',
    email: 'studio@blackwoodjoinery.co.uk',
    web: 'blackwoodjoinery.co.uk',
    address: 'Unit 4, Frome Valley Workshops, Stroud GL5',
  };
  const client = {
    name: 'Sarah & Tom Whitfield',
    first: 'Sarah',
    project: 'Kitchen — Maple Shaker',
    email: 'sarah.whitfield@gmail.com',
    address: '12 Selsley Road, Stroud GL5 5NP',
  };
  const quote = {
    number: 'Q-0042',
    orderNumber: '0031',
    date: '31 May 2026',
    validUntil: '30 Jun 2026',
    depositPct: 40,
    vatPct: 20,
    currency: '£',
  };

  // ── Line items (the seed kitchen) ─────────────────────────────────
  // kind: 'cabinet' | 'item'.  optional → customer may exclude.
  // editable → customer may change finish/handle/size (reprices live).
  const lines = [
    { id: 'l1', kind: 'cabinet', art: 'drawers', name: 'Pan Drawer Base', detail: '600mm · 3 soft-close drawers',
      type: 'Base', w: 600, h: 720, d: 560, material: 'Maple Shaker', finish: 'Hand-painted Sage', qty: 1, unit: 680, optional: false, editable: true, included: true },
    { id: 'l2', kind: 'cabinet', art: 'base', name: 'Base Cabinet', detail: '800mm · door + adjustable shelf',
      type: 'Base', w: 800, h: 720, d: 560, material: 'Maple Shaker', finish: 'Hand-painted Sage', qty: 3, unit: 420, optional: false, editable: true, included: true },
    { id: 'l3', kind: 'cabinet', art: 'wall', name: 'Glazed Wall Unit', detail: '600mm · glass door',
      type: 'Wall', w: 600, h: 900, d: 330, material: 'Maple Shaker', finish: 'Hand-painted Sage', qty: 2, unit: 310, optional: false, editable: true, included: true },
    { id: 'l4', kind: 'cabinet', art: 'tall', name: 'Larder Pull-out', detail: '600mm · full-height pantry',
      type: 'Tall', w: 600, h: 2100, d: 560, material: 'Maple Shaker', finish: 'Hand-painted Sage', qty: 1, unit: 1240, optional: false, editable: true, included: true },
    { id: 'l5', kind: 'cabinet', art: 'island', name: 'Kitchen Island', detail: '1800mm · breakfast overhang',
      type: 'Island', w: 1800, h: 900, d: 1000, material: 'Solid Oak', finish: 'Natural Oiled', qty: 1, unit: 2150, optional: true, editable: true, included: true },
    { id: 'l6', kind: 'item', art: 'handle', name: 'Brushed Brass Handles', detail: 'Bar pull · 160mm × 14',
      qty: 14, unit: 18, optional: true, editable: false, included: true },
    { id: 'l7', kind: 'item', art: 'service', name: 'Delivery & Installation', detail: '2-day fit · waste removal',
      qty: 1, unit: 450, optional: false, editable: false, included: true },
  ];

  // Finish / handle option sets (for the customer spec-edit UI)
  const finishOptions = ['Hand-painted Sage', 'Hand-painted Stone', 'Hand-painted Inkwell', 'Natural Oiled', 'Walnut Veneer'];
  const handleOptions = [
    { name: 'Brushed Brass Bar', delta: 0 },
    { name: 'Matt Black Bar', delta: -2 },
    { name: 'Antique Bronze Cup', delta: 3 },
    { name: 'Knurled Knob', delta: 1 },
  ];

  // ── Money ─────────────────────────────────────────────────────────
  const cur = quote.currency;
  function fmt(n, dp) {
    if (dp == null) dp = (Math.round(n) === n) ? 0 : 2;
    return cur + Number(n).toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function lineTotal(l) { return (Number(l.unit) || 0) * (Number(l.qty) || 0); }
  function computeTotals(ls) {
    ls = ls || lines;
    let subtotal = 0, optionalSavings = 0;
    ls.forEach(l => {
      if (l.included) subtotal += lineTotal(l);
      if (l.optional && l.included) optionalSavings += lineTotal(l);
    });
    const vat = subtotal * quote.vatPct / 100;
    const total = subtotal + vat;
    const deposit = total * quote.depositPct / 100;
    const balance = total - deposit;
    return { subtotal, vat, total, deposit, balance, optionalSavings };
  }

  // ── Cabinet "photos" (self-contained SVG product shots) ───────────
  // Warm studio backdrop + a stylised cabinet. Recognisable per type,
  // no network dependency.
  function art(kind, opts) {
    opts = opts || {};
    // Drawing coordinates are authored against a FIXED 420×300 canvas; the SVG
    // then scales to whatever the container sizes it to (opts kept for call-site
    // compatibility but no longer alters the viewBox).
    const W = 420, H = 300;
    const id = 'g' + Math.random().toString(36).slice(2, 8);
    const wood = ['#c98a4b', '#b9783c']; // oak
    const sage = ['#9fae90', '#8a9b7a'];
    const isOak = kind === 'island';
    const body = isOak ? wood : sage;
    const bg = '#efe9e1';
    const floor = '#e2d8c9';
    const brass = '#d8a94e';
    function cab(inner) {
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${kind} cabinet">
        <defs>
          <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${floor}"/></linearGradient>
          <linearGradient id="${id}d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${body[0]}"/><stop offset="1" stop-color="${body[1]}"/></linearGradient>
        </defs>
        <rect width="${W}" height="${H}" fill="url(#${id}b)"/>
        <rect x="0" y="${H * 0.72}" width="${W}" height="${H * 0.28}" fill="${floor}"/>
        ${inner}
      </svg>`;
    }
    const door = (x, y, w, h, knobAt) => {
      let k = '';
      if (knobAt === 'tr') k = `<rect x="${x + w - 16}" y="${y + 14}" width="5" height="26" rx="2.5" fill="${brass}"/>`;
      if (knobAt === 'tl') k = `<rect x="${x + 11}" y="${y + 14}" width="5" height="26" rx="2.5" fill="${brass}"/>`;
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="url(#${id}d)" stroke="rgba(0,0,0,.14)"/>
              <rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="3" fill="none" stroke="rgba(255,255,255,.18)"/>${k}`;
    };
    const drawer = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="url(#${id}d)" stroke="rgba(0,0,0,.14)"/>
      <rect x="${x + w / 2 - 16}" y="${y + h / 2 - 2.5}" width="32" height="5" rx="2.5" fill="${brass}"/>`;

    switch (kind) {
      case 'base':
        return cab(`${door(150, 96, 120, 116, 'tr')}<rect x="146" y="212" width="128" height="10" fill="rgba(0,0,0,.08)"/><rect x="120" y="86" width="180" height="12" rx="3" fill="#cfc3b0"/>`);
      case 'drawers':
        return cab(`${drawer(150, 96, 120, 36)}${drawer(150, 138, 120, 36)}${drawer(150, 180, 120, 36)}<rect x="120" y="86" width="180" height="12" rx="3" fill="#cfc3b0"/>`);
      case 'wall':
        return cab(`<rect x="150" y="70" width="120" height="120" rx="5" fill="url(#${id}d)" stroke="rgba(0,0,0,.14)"/><rect x="162" y="82" width="96" height="96" rx="3" fill="rgba(180,205,215,.5)" stroke="rgba(255,255,255,.4)"/><line x1="210" y1="82" x2="210" y2="178" stroke="rgba(255,255,255,.35)"/><rect x="${262 - 6}" y="120" width="5" height="26" rx="2.5" fill="${brass}"/>`);
      case 'tall':
        return cab(`<rect x="165" y="40" width="90" height="180" rx="5" fill="url(#${id}d)" stroke="rgba(0,0,0,.14)"/>${''}<rect x="172" y="47" width="76" height="80" rx="3" fill="none" stroke="rgba(255,255,255,.18)"/><rect x="172" y="133" width="76" height="80" rx="3" fill="none" stroke="rgba(255,255,255,.18)"/><rect x="241" y="120" width="5" height="30" rx="2.5" fill="${brass}"/>`);
      case 'island':
        return cab(`<rect x="80" y="120" width="260" height="92" rx="5" fill="url(#${id}d)" stroke="rgba(0,0,0,.16)"/><rect x="66" y="104" width="288" height="18" rx="4" fill="#d9cdb8"/>${drawer(96, 138, 70, 30)}${drawer(96, 174, 70, 26)}${door(180, 138, 64, 62, 'tl')}${door(252, 138, 64, 62, 'tr')}`);
      case 'handle':
        return cab(`<rect x="120" y="120" width="180" height="60" rx="30" fill="none" stroke="${brass}" stroke-width="10"/><rect x="150" y="146" width="120" height="8" rx="4" fill="${brass}"/><circle cx="150" cy="150" r="9" fill="${brass}"/><circle cx="270" cy="150" r="9" fill="${brass}"/>`);
      case 'service':
        return cab(`<rect x="150" y="120" width="120" height="80" rx="6" fill="url(#${id}d)" stroke="rgba(0,0,0,.14)"/><path d="M150 150 h120" stroke="rgba(255,255,255,.4)"/><path d="M210 120 v80" stroke="rgba(255,255,255,.3)"/><path d="M170 96 l40 24 l40 -24" fill="none" stroke="#a98a5e" stroke-width="6" stroke-linejoin="round"/>`);
      default:
        return cab(`${door(150, 96, 120, 116, 'tr')}`);
    }
  }

  // ── escape ────────────────────────────────────────────────────────
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ── Real app chrome (header + nav-tabs) for BUSINESS pages ─────────
  const NAV = [
    ['dashboard', 'Dashboard', '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'],
    ['cutlist', 'Cut List', '<path d="M12 1.7 14 6 19.3 4.7 19.3 9.6 22.3 12 19.6 16.1 19.3 19.3 15.9 21.5 12 22.3 8.1 21.5 4.7 19.3 4.4 16.1 1.7 12 4.4 9.6 4.7 4.7 8.1 4.4Z"/><circle cx="12" cy="12" r="1.5"/>'],
    ['cabinet', 'Cabinet', '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>'],
    ['stock', 'Stock', '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'],
    ['orders', 'Orders', '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>'],
    ['quote', 'Quotes', '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>'],
    ['clients', 'Clients', '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'],
    ['schedule', 'Schedule', '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'],
  ];
  function iconBtn(svg) {
    return `<button style="width:32px;height:32px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#aaa">${svg}</button>`;
  }
  function appChrome(active, badges) {
    badges = badges || {};
    const tabs = NAV.map(([key, label, path]) => {
      const badge = badges[key] ? `<span class="tab-badge">${badges[key]}</span>` : '';
      return `<div class="nav-tab${key === active ? ' active' : ''}" title="${label}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${key === 'cutlist' ? 1.5 : 2}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>
        <span class="nav-tab-label">${label}</span>${badge}</div>`;
    }).join('');
    return `<header>
      <div class="logo"><div class="logo-text">ProCabinet.App</div><div class="logo-badge">BETA v0.13.0</div></div>
      <div class="header-right">
        ${iconBtn('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 12-8.5 8.5a2.12 2.12 0 1 1-3-3L12 9"/><path d="M17.64 15 22 10.64"/></svg>')}
        ${iconBtn('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>')}
        ${iconBtn('<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9z"/></svg>')}
        <div class="user-avatar" title="Account"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></div>
      </div>
    </header>
    <div class="nav-tabs-wrap"><div class="nav-tabs">${tabs}</div></div>`;
  }

  // ── Public (customer) page header — slim, branded, no app nav ──────
  function publicHeader(opts) {
    opts = opts || {};
    return `<div class="cust-top">
      <div class="cust-brand">
        <div class="cust-logo">${biz.monogram}</div>
        <div><div class="cust-bizname">${esc(biz.name)}</div><div class="cust-biztag">${esc(biz.tagline)}</div></div>
      </div>
      <div class="cust-top-right">
        ${opts.secure !== false ? '<span class="cust-secure"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>Secure quote</span>' : ''}
        ${opts.modeToggle ? modeToggle(opts.mode || 'full') : ''}
      </div>
    </div>`;
  }

  // ── Full ⇄ Smart Link presentation-mode toggle (customer pages) ───
  function modeToggle(mode) {
    return `<div class="seg" id="mode-seg" role="group" aria-label="View mode">
      <button class="seg-opt${mode === 'full' ? ' active' : ''}" data-mode="full" onclick="MOCK.setMode('full')">Full</button>
      <button class="seg-opt${mode === 'smart' ? ' active' : ''}" data-mode="smart" onclick="MOCK.setMode('smart')">Smart Link</button>
    </div>`;
  }
  function setMode(m) {
    document.querySelectorAll('#mode-seg .seg-opt').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    const full = document.getElementById('view-full'), smart = document.getElementById('view-smart');
    if (full) full.style.display = m === 'full' ? '' : 'none';
    if (smart) smart.style.display = m === 'smart' ? '' : 'none';
    if (typeof window._onModeChange === 'function') window._onModeChange(m);
  }

  // ── Status pipeline (the app's signature) ─────────────────────────
  const DEAL_STAGES = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Deposit Paid', 'Production', 'Delivery', 'Done'];
  const DEAL_COLORS = ['#94a3b8', '#1565c0', '#7c3aed', '#0d9488', '#3d9970', '#e8a838', '#0d9488', '#3d9970'];
  function pipeline(stages, curIdx, colors) {
    colors = colors || DEAL_COLORS;
    return `<div class="oc-pipeline">${stages.map((s, i) => {
      const done = i < curIdx, activeS = i === curIdx;
      const color = activeS ? colors[i] : done ? 'var(--success)' : 'var(--border)';
      return `<div class="pipe-step${activeS ? ' pipe-active' : ''}${done ? ' pipe-done' : ''}">
        <div class="pipe-dot" style="background:${color};border-color:${color}"></div>
        <div class="pipe-label">${s}</div>
      </div>${i < stages.length - 1 ? `<div class="pipe-line${done ? ' pipe-line-done' : ''}"></div>` : ''}`;
    }).join('')}</div>`;
  }

  // ── Mock Stripe-style payment sheet ───────────────────────────────
  function paymentSheet(amountLabel, sublabel) {
    let el = document.getElementById('pay-sheet');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'pay-sheet';
    el.className = 'pay-overlay';
    el.innerHTML = `<div class="pay-card">
      <div class="pay-head">
        <div class="pay-merchant"><div class="cust-logo" style="width:28px;height:28px;font-size:14px">${biz.monogram}</div><span>${esc(biz.name)}</span></div>
        <button class="popup-close" onclick="document.getElementById('pay-sheet').remove()">&times;</button>
      </div>
      <div class="pay-amount">${amountLabel}</div>
      <div class="pay-sub">${sublabel || ''}</div>
      <label class="pay-lbl">Card information</label>
      <div class="pay-field"><input placeholder="1234 1234 1234 1234" inputmode="numeric"><span class="pay-cards">VISA</span></div>
      <div class="pay-row"><div class="pay-field"><input placeholder="MM / YY"></div><div class="pay-field"><input placeholder="CVC"></div></div>
      <label class="pay-lbl">Name on card</label>
      <div class="pay-field"><input placeholder="Sarah Whitfield" value="Sarah Whitfield"></div>
      <button class="btn btn-primary btn-lg" style="margin-top:14px" onclick="MOCK.paySuccess()">Pay ${amountLabel.replace(/^.*?(£[\d,.]+).*$/, '$1')}</button>
      <div class="pay-powered"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> Payments secured by <strong>Stripe</strong> · Powered by ProCabinet</div>
    </div>`;
    document.body.appendChild(el);
  }
  function paySuccess() {
    const s = document.getElementById('pay-sheet');
    if (s) s.remove();
    if (typeof window._onPaid === 'function') window._onPaid();
    else { const t = computeTotals(); toast('Payment received · ' + fmt(t.deposit, 2) + ' deposit'); }
  }

  // ── Toast ─────────────────────────────────────────────────────────
  function toast(msg) {
    let c = document.getElementById('mock-toast');
    if (!c) { c = document.createElement('div'); c.id = 'mock-toast'; document.body.appendChild(c); }
    c.textContent = msg; c.className = 'show';
    clearTimeout(c._t); c._t = setTimeout(() => { c.className = ''; }, 2600);
  }

  // ── Customer <-> business CHAT (shared by the chat-integration mockups) ──
  const chatSeed = [
    { from: 'them', time: '9:24 AM', text: 'Hi Sarah 👋 here’s your full proposal — untick anything optional, or tap Edit and the total updates live. Any questions, just reply right here.' },
    { from: 'event', text: 'You opened this · 2h ago' },
    { from: 'me', time: '11:05 AM', text: 'Thank you! Love it. Quick one — is the oak island a big jump over having it painted to match the rest?' },
    { from: 'them', time: '11:09 AM', text: 'Good question! The oak island is £2,150; painted to match it’d be about £1,760. Happy to switch it if you’d like — no rush at all.' },
  ];
  function chatBubble(m) {
    if (m.from === 'event') return `<div class="thread-event">${esc(m.text)}</div>`;
    const side = m.from === 'me' ? 'me' : 'them';
    const who = m.from === 'them' ? esc(biz.name) + ' · ' : '';
    return `<div class="bubble ${side}"><div class="bub-body">${m.text}</div><div class="bub-time">${who}${m.time || ''}</div></div>`;
  }
  function chatThread(extra) { return chatSeed.concat(extra || []).map(chatBubble).join(''); }
  // Wire a composer: reads #inputId, appends a 'me' bubble, shows a typing
  // indicator, then a canned 'them' reply, autoscrolling the #threadId element.
  function chatSend(inputId, threadId, reply) {
    const inp = document.getElementById(inputId); if (!inp || !inp.value.trim()) return;
    const txt = esc(inp.value.trim()); inp.value = '';
    const thread = document.getElementById(threadId); if (!thread) return;
    thread.insertAdjacentHTML('beforeend', chatBubble({ from: 'me', time: 'just now', text: txt }));
    thread.scrollTop = thread.scrollHeight;
    const tid = 'typing-' + threadId;
    setTimeout(() => { thread.insertAdjacentHTML('beforeend', '<div class="thread-event" id="' + tid + '">Blackwood is typing…</div>'); thread.scrollTop = thread.scrollHeight; }, 500);
    setTimeout(() => {
      const t = document.getElementById(tid); if (t) t.remove();
      thread.insertAdjacentHTML('beforeend', chatBubble({ from: 'them', time: 'just now', text: reply || 'Thanks Sarah — I’ll get that updated on your proposal in a moment 👍' }));
      thread.scrollTop = thread.scrollHeight;
    }, 1600);
  }
  const chat = { seed: chatSeed, bubble: chatBubble, thread: chatThread, send: chatSend, unread: 1 };

  // ── Client roster for the in-app Clients-tab chat mockups ──
  const contacts = [
    { id: 'c1', name: 'Sarah & Tom Whitfield', initials: 'SW', project: 'Kitchen — Maple Shaker', ref: 'Q-0042', value: 7982.40, status: 'Viewed', badge: 'badge-blue', unread: 2, last: 'Thank you! Just deciding on the island…', who: 'them', time: '2h' },
    { id: 'c2', name: 'Marcus Lee', initials: 'ML', project: 'Utility room', ref: 'Order 0029', value: 3140, status: 'Deposit paid', badge: 'badge-green', unread: 0, last: 'You: receipt + order on its way 👍', who: 'me', time: '18 May' },
    { id: 'c3', name: 'The Old Rectory', initials: 'OR', project: 'Boot room + bench', ref: 'Q-0040', value: 5620, status: 'Accepted', badge: 'badge-teal', unread: 1, last: 'Looks great — sending the deposit shortly.', who: 'them', time: '22 May' },
    { id: 'c4', name: 'J. Okafor', initials: 'JO', project: 'Alcove units ×2', ref: 'Q-0039', value: 1880, status: 'Sent', badge: 'badge-blue', unread: 0, last: 'You: sent the quote — shout if any questions', who: 'me', time: '24 May' },
    { id: 'c5', name: 'Priya & Sam', initials: 'PS', project: 'Walk-in wardrobe', ref: 'New lead', value: 0, status: 'Lead', badge: 'badge-gray', unread: 1, last: 'Hi — could you quote a walk-in wardrobe for us?', who: 'them', time: '28 May' },
  ];
  // Sarah (c1) uses the full seeded chat; everyone else gets a short canned thread.
  function threadFor(c) {
    if (c.id === 'c1') return chatThread();
    const last = c.last.replace(/^You:\s*/, '');
    const fromMe = /^You:/.test(c.last);
    return [
      { from: 'them', time: '', text: 'Hi — about the ' + c.project.toLowerCase() + '.' },
      { from: fromMe ? 'me' : 'them', time: c.time, text: last },
    ].map(chatBubble).join('');
  }

  window.MOCK = {
    biz, client, quote, lines, finishOptions, handleOptions,
    cur, fmt, lineTotal, computeTotals, art, esc,
    appChrome, publicHeader, modeToggle, setMode, pipeline, paymentSheet, paySuccess, toast,
    DEAL_STAGES, DEAL_COLORS, chat, contacts, threadFor,
    // deep clone of lines so each page mutates its own copy
    freshLines() { return lines.map(l => Object.assign({}, l)); },
  };
})();
