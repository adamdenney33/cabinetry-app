/* ProCabinet.App — landing page interactions.
   Vanilla, dependency-free, progressive enhancement. Everything degrades:
   without this file the page is fully visible and all links work. All motion is
   suppressed when the visitor prefers reduced motion. */
(function () {
  'use strict';

  var mqReduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = !!(mqReduce && mqReduce.matches);
  var canHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
  var slice = function (n) { return Array.prototype.slice.call(n); };

  /* ── Forward ad params (utm_*, gclid, fbclid) to the /os app ───────────
     Ad clicks land on this page; the app lives at /os. The pixels in <head>
     already set the _gcl/_fbc cookies and write the attribution blob to
     localStorage (all same-origin, so /os reads them). This carries the params
     across in the URL too, so the app's own GA4/Meta tags and the attribution
     capture in src/main.js see them directly — belt-and-braces. */
  (function forwardAdParams() {
    var inbound = new URLSearchParams(window.location.search);
    var KEEP = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid'];
    var fwd = new URLSearchParams();
    KEEP.forEach(function (k) { if (inbound.has(k)) fwd.set(k, inbound.get(k)); });
    var qs = fwd.toString();
    if (!qs) return;
    slice(document.querySelectorAll('a[href^="/os"]')).forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href) return;
      a.setAttribute('href', href + (href.indexOf('?') === -1 ? '?' : '&') + qs);
    });
  })();

  /* ── Reveal-on-scroll ─────────────────────────────────────────────── */
  var reveals = slice(document.querySelectorAll('[data-reveal]'));
  if (!reduce && 'IntersectionObserver' in window) {
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); revObs.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { revObs.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ── Scroll-spy: light the tab(s) for the section in view ──────────── */
  var tabs = slice(document.querySelectorAll('.tab'));
  function setActiveKeys(keys) {
    tabs.forEach(function (t) {
      t.classList.toggle('active', keys.indexOf(t.getAttribute('data-tab')) !== -1);
    });
  }
  var spySections = slice(document.querySelectorAll('[data-spy]'));
  if (spySections.length && 'IntersectionObserver' in window) {
    var spyObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var keys = (e.target.getAttribute('data-spy') || '').split(/\s+/).filter(Boolean);
        if (keys.length) setActiveKeys(keys);
      });
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
    spySections.forEach(function (s) { spyObs.observe(s); });
  }

  /* ── Count-up numbers ─────────────────────────────────────────────── */
  function runCount(el) {
    var target = parseInt(el.getAttribute('data-countup'), 10) || 0;
    if (reduce) { el.textContent = String(target); return; }
    var dur = 1100, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step); else el.textContent = String(target);
    }
    requestAnimationFrame(step);
  }
  var counts = slice(document.querySelectorAll('[data-countup]'));
  if ('IntersectionObserver' in window) {
    var cObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { runCount(e.target); cObs.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counts.forEach(function (el) { cObs.observe(el); });
  } else {
    counts.forEach(runCount);
  }

  /* ── Pointer tilt + zoom on screenshots (hover devices) ── */
  if (!reduce && canHover) {
    var TILT_SCALE = 1.2;
    slice(document.querySelectorAll('[data-tilt]')).forEach(function (el) {
      el.addEventListener('pointerenter', function () {
        el.style.zIndex = '40';
        el.style.transform = 'perspective(1000px) scale(' + TILT_SCALE + ')';
      });
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        var px = (ev.clientX - r.left) / r.width - 0.5;
        var py = (ev.clientY - r.top) / r.height - 0.5;
        var max = 6;
        el.style.transform = 'perspective(1000px) rotateY(' + (px * max).toFixed(2) +
          'deg) rotateX(' + (-py * max).toFixed(2) + 'deg) scale(' + TILT_SCALE + ')';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; el.style.zIndex = ''; });
    });
  }

  /* ── Scroll-driven: progress bar, condensing nav, hero parallax ───── */
  var tabbar = document.getElementById('tabbar');
  var progress = document.getElementById('progress');
  var parallax = slice(document.querySelectorAll('[data-parallax]'));
  var scroll3d = slice(document.querySelectorAll('[data-scroll3d]'));
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (tabbar) tabbar.classList.toggle('condensed', y > 80);
      if (progress && !reduce) {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
      }
      if (!reduce) {
        var vh = window.innerHeight;
        parallax.forEach(function (el) {
          var rect = el.getBoundingClientRect();
          var offset = (rect.top + rect.height / 2 - vh / 2) * -0.05;
          el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
        });
        // Scroll-driven grow: scales up as it rises into view, settling at full size.
        scroll3d.forEach(function (el) {
          var rect = el.getBoundingClientRect();
          var t = (vh - (rect.top + rect.height / 2)) / vh;
          var k = Math.min(Math.max(t / 0.55, 0), 1);
          el.style.transform = 'scale(' + (0.72 + k * 0.18).toFixed(3) + ')';
        });
      }
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();

  /* ── Founder seats live counter ──────────────────────────────────────
     Scarcity that ticks: swap the static "Only 50 ever sold" flag for the
     live "N of 50 left" count via the public founder_seats_taken RPC. The
     Supabase URL + publishable anon key arrive via window.__PC_SB, injected
     into landing.html at build time — absent in dev, so this no-ops and the
     static flag stays. Best-effort: any failure leaves the flag untouched. */
  (function founderSeats() {
    var cfg = window.__PC_SB;
    var flag = document.getElementById('founder-flag');
    if (!cfg || !cfg.url || !cfg.key || !flag) return;
    fetch(cfg.url + '/rest/v1/rpc/founder_seats_taken', {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: '{}'
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (taken) {
        if (typeof taken !== 'number') return;
        var left = Math.max(0, 50 - taken);
        var heroLeft = document.getElementById('founder-hero-left');
        if (left > 0) {
          flag.innerHTML = '<strong>' + left + '</strong> of 50 left';
          if (heroLeft) heroLeft.innerHTML = 'only <strong>' + left + '</strong> of 50 seats left';
          return;
        }
        if (heroLeft && heroLeft.parentElement && heroLeft.parentElement.parentElement) {
          heroLeft.parentElement.parentElement.style.display = 'none'; // hide hero line when sold out
        }
        // Sold out: flip the flag and disable the card's CTA.
        flag.textContent = 'Sold out';
        var btn = document.querySelector('.price-card.hero-card a.btn');
        if (btn) {
          btn.textContent = 'Sold out';
          btn.setAttribute('aria-disabled', 'true');
          btn.style.pointerEvents = 'none';
          btn.style.opacity = '0.55';
        }
      })
      .catch(function () { /* static flag remains */ });
  })();
})();
