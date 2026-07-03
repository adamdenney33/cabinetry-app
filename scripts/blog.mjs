// Blog build module — the single source of truth for blog posts.
//
// content/blog/*.md (flat `key: value` frontmatter + markdown body) is turned
// into full static HTML pages by renderPost()/renderIndex(). Both blogPlugin
// and seoFilesPlugin in vite.config.mjs import loadPosts() from here, so the
// pages, the sitemap and llms.txt can never disagree about which posts exist.
//
// Runs at build/dev time only (marked is a devDependency) — nothing here ships
// to the client. Markdown is authored in-repo by the founder, so raw HTML in
// posts is trusted; never point this parser at user-supplied content.
//
// Fail-loud: a post with missing frontmatter keys, a bad date, or a duplicate
// slug throws and kills the build — a malformed post must never deploy.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { marked } from 'marked';

marked.use({ gfm: true });

// Body images become real <figure>s: lazy-loaded (the hero is the only eager
// image on a post), with the markdown "title" (![alt](src "title")) rendered
// as a visible <figcaption>. All post images are our own product screenshots
// (/brand/screenshots/) or hand-drawn SVG diagrams (/brand/blog/) — no stock.
marked.use({
  renderer: {
    image({ href, title, text }) {
      const img = `<img src="${esc(href || '')}" alt="${esc(text || '')}" loading="lazy" decoding="async">`;
      return title
        ? `<figure>${img}<figcaption>${esc(title)}</figcaption></figure>`
        : `<figure>${img}</figure>`;
    },
  },
});

// Shared site identity — also read by seoFilesPlugin (sitemap/llms.txt) and
// kept in sync with the Organization JSON-LD in landing.html.
export const SITE = {
  origin: 'https://procabinet.app',
  name: 'ProCabinet.App',
  logo: 'https://procabinet.app/brand/logo/logo-colour-on-dark-square.png',
  defaultImage: 'https://procabinet.app/brand/screenshots/01-dashboard.png',
  email: 'adam@procabinet.app',
  author: {
    name: 'Adam Denney',
    // Canonical founder claim (decision 2026-07-03) — must match the byline,
    // the Person schema and marketing/specs/brand-voice.md.
    bio: 'Cabinet maker, founder of ProCabinet.App. Ran his own cabinetry workshop for over 10 years.',
  },
};

const CONTENT_DIR = 'content/blog';
const REQUIRED = ['title', 'description', 'slug', 'date', 'author'];

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "2026-07-06" -> "6 July 2026" (British format, matches the legal pages).
 * @param {string} iso */
function niceDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) throw new Error(`blog: bad date "${iso}" (want YYYY-MM-DD)`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Flat `key: value` frontmatter between --- fences. Deliberately not YAML —
// no nesting, no quoting rules, nothing to get wrong. tags/itemlist are
// comma-separated lists.
/** @param {string} raw @param {string} file */
function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`blog: ${file} has no frontmatter (--- fences)`);
  /** @type {Record<string, string>} */
  const fm = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i === -1) throw new Error(`blog: ${file} bad frontmatter line "${line}"`);
    fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  for (const k of REQUIRED) {
    if (!fm[k]) throw new Error(`blog: ${file} missing frontmatter key "${k}"`);
  }
  return { fm, body: m[2] };
}

// Pull the `## Common questions` section into [{q, a}] for FAQPage JSON-LD.
// Same philosophy as landing.html's FAQPage block: the schema mirrors the
// visible section verbatim — questions are the H3s, answers the paragraphs
// under each, as plain text.
/** @param {string} body */
function extractFaq(body) {
  const tokens = marked.lexer(body);
  /** @type {{q: string, a: string}[]} */
  const faq = [];
  let inFaq = false;
  let current = null;
  for (const t of tokens) {
    if (t.type === 'heading' && t.depth <= 2) {
      inFaq = t.depth === 2 && /common questions|faq/i.test(t.text);
      current = null;
      continue;
    }
    if (!inFaq) continue;
    if (t.type === 'heading' && t.depth === 3) {
      current = { q: t.text, a: '' };
      faq.push(current);
    } else if (current && t.type === 'paragraph') {
      // marked returns string | Promise<string> in its types (async mode);
      // we never enable async, so these are always strings.
      const text = /** @type {string} */ (marked.parseInline(t.text)).replace(/<[^>]+>/g, '');
      current.a += (current.a ? ' ' : '') + text;
    }
  }
  return faq.filter((f) => f.a);
}

/**
 * Load every post, validated and sorted newest-first.
 * Contract (relied on by seoFilesPlugin): slug, url (trailing slash), title,
 * description, date, updated, tags, hero.
 */
export function loadPosts() {
  if (!existsSync(CONTENT_DIR)) return [];
  const posts = [];
  const seen = new Set();
  for (const f of readdirSync(CONTENT_DIR).sort()) {
    if (!f.endsWith('.md')) continue;
    const { fm, body } = parseFrontmatter(readFileSync(join(CONTENT_DIR, f), 'utf8'), f);
    if (seen.has(fm.slug)) throw new Error(`blog: duplicate slug "${fm.slug}"`);
    seen.add(fm.slug);
    niceDate(fm.date); // validates
    if (fm.updated) niceDate(fm.updated);
    posts.push({
      slug: fm.slug,
      url: `/blog/${fm.slug}/`,
      title: fm.title,
      description: fm.description,
      date: fm.date,
      updated: fm.updated || fm.date,
      author: fm.author,
      tags: fm.tags ? fm.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      hero: fm.hero || '',
      heroAlt: fm.heroAlt || '',
      itemlist: fm.itemlist ? fm.itemlist.split(',').map((t) => t.trim()).filter(Boolean) : [],
      html: /** @type {string} */ (marked.parse(body)),
      faq: extractFaq(body),
    });
  }
  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return posts;
}

// ── Shared page chrome ──────────────────────────────────────────────────────

// Same PostHog + GA4/Google Ads + Meta Pixel wiring as landing.html (which is
// the reference copy — see its comments for the full reasoning). IDs are
// injected from the build env at render time; in dev we render with an empty
// env so every block cleanly no-ops and dev traffic stays out of prod
// analytics. The attribution snapshot uses the same localStorage key as
// landing/os, so a blog-first visitor's campaign params survive to signup.
// Exported: scripts/build-wiki.mjs reuses this verbatim for the /wiki pages.
/** @param {Record<string, string>} env */
export function analyticsScripts(env) {
  const v = (/** @type {string | undefined} */ x) => x || '';
  return `
  <script>
    (function () {
      var k = '${v(env.VITE_POSTHOG_KEY)}';
      if (!k) return;
      var h = '${v(env.VITE_POSTHOG_HOST)}' || 'https://eu.i.posthog.com';
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init(k, { api_host: h, person_profiles: 'identified_only', capture_pageview: true, autocapture: true, disable_session_recording: false });
    })();
  </script>
  <script>
    (function () {
      try {
        var KEY = 'pc_attribution';
        if (!localStorage.getItem(KEY)) {
          var qp = new URLSearchParams(window.location.search);
          var get = function (k) { return qp.get(k) || ''; };
          if (qp.has('utm_source') || qp.has('utm_medium') || qp.has('utm_campaign') || qp.has('gclid') || qp.has('fbclid')) {
            localStorage.setItem(KEY, JSON.stringify({
              utm_source: get('utm_source'), utm_medium: get('utm_medium'),
              utm_campaign: get('utm_campaign'), utm_term: get('utm_term'),
              utm_content: get('utm_content'), gclid: get('gclid'), fbclid: get('fbclid'),
              referrer: document.referrer || '',
              landing_path: window.location.pathname + window.location.search,
              first_seen_at: new Date().toISOString()
            }));
          }
        }
      } catch (e) {}
      var ga4 = '${v(env.VITE_GA4_ID)}', ads = '${v(env.VITE_GOOGLE_ADS_ID)}';
      if (ga4 || ads) {
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + (ga4 || ads);
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        if (ga4) window.gtag('config', ga4, { send_page_view: true });
        if (ads) window.gtag('config', ads);
      }
      var pixel = '${v(env.VITE_META_PIXEL_ID)}';
      if (pixel) {
        !function (f, b, e, v, n, t, s) {
          if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
          if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
          n.queue = []; t = b.createElement(e); t.async = !0;
          t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
        }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', pixel);
        window.fbq('track', 'PageView');
      }
    })();
  </script>`;
}

/** @param {{head: string, main: string, env: Record<string,string>, assetVer: string}} p */
function page({ head, main, env, assetVer }) {
  const css = `/blog.css${assetVer ? `?v=${assetVer}` : ''}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${head}
  <link rel="icon" type="image/png" sizes="64x64" href="/brand/icons/procabinet-favicon-64.png" />
  <link rel="stylesheet" href="${css}" />${analyticsScripts(env)}
</head>
<body>
  <header class="bar">
    <div class="inner">
      <a class="brand" href="/">ProCabinet<span class="accent">.App</span></a>
      <nav>
        <a href="/blog/">Blog</a>
        <a href="/wiki/">Guides</a>
        <a href="/#pricing">Pricing</a>
        <a href="/os">Open the app</a>
      </nav>
    </div>
  </header>

  <main>
${main}
  </main>

  <footer class="foot">
    <div class="inner">
      <span>© 2026 ProCabinet.App — made by a cabinet maker</span>
      <nav>
        <a href="/">Home</a>
        <a href="/blog/">Blog</a>
        <a href="/wiki/">Guides</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
    </div>
  </footer>
</body>
</html>
`;
}

// ── Post page ───────────────────────────────────────────────────────────────

/** @param {ReturnType<typeof loadPosts>[0]} post @param {ReturnType<typeof loadPosts>} allPosts */
function relatedPosts(post, allPosts) {
  const overlap = (/** @type {ReturnType<typeof loadPosts>[0]} */ p) =>
    p.tags.filter((t) => post.tags.includes(t)).length;
  return allPosts
    .filter((p) => p.slug !== post.slug)
    .sort((a, b) => overlap(b) - overlap(a))
    .slice(0, 3);
}

/** @param {ReturnType<typeof loadPosts>[0]} post @param {ReturnType<typeof loadPosts>} allPosts */
function jsonLd(post, allPosts) {
  const image = post.hero ? SITE.origin + post.hero : SITE.defaultImage;
  /** @type {any[]} */
  const graph = [{
    '@type': 'BlogPosting',
    '@id': `${SITE.origin}${post.url}#post`,
    headline: post.title,
    description: post.description,
    image,
    datePublished: post.date,
    dateModified: post.updated,
    author: {
      '@type': 'Person',
      name: SITE.author.name,
      description: SITE.author.bio,
      url: `${SITE.origin}/`,
    },
    publisher: { '@id': `${SITE.origin}/#org` },
    mainEntityOfPage: `${SITE.origin}${post.url}`,
  }];
  if (post.faq.length) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: post.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  if (post.itemlist.length) {
    graph.push({
      '@type': 'ItemList',
      itemListElement: post.itemlist.map((name, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name,
      })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

/**
 * Render one post to a full HTML page.
 * @param {ReturnType<typeof loadPosts>[0]} post
 * @param {ReturnType<typeof loadPosts>} allPosts
 * @param {Record<string, string>} env  build env for analytics IDs ({} in dev)
 * @param {string} assetVer  content hash for /blog.css?v= ('' in dev)
 */
export function renderPost(post, allPosts, env, assetVer) {
  const url = `${SITE.origin}${post.url}`;
  const image = post.hero ? SITE.origin + post.hero : SITE.defaultImage;
  const updatedLine = post.updated !== post.date
    ? `Published ${niceDate(post.date)} · Updated ${niceDate(post.updated)}`
    : `Published ${niceDate(post.date)}`;

  const head = `  <title>${esc(post.title)} — ProCabinet.App</title>
  <meta name="description" content="${esc(post.description)}" />
  <meta name="theme-color" content="#111111" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${SITE.name}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(post.title)}" />
  <meta property="og:description" content="${esc(post.description)}" />
  <meta property="og:image" content="${image}" />
  <meta property="article:published_time" content="${post.date}" />
  <meta property="article:modified_time" content="${post.updated}" />
  <meta property="article:author" content="${esc(SITE.author.name)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">
${jsonLd(post, allPosts)}
  </script>`;

  // First paragraph is the direct answer — give it the .lead treatment.
  const body = post.html
    .replace('<p>', '<p class="lead">')
    // A standalone markdown image renders as a <figure> (see the marked
    // renderer above) but arrives wrapped in the paragraph marked made for
    // the inline token — unwrap for valid block-level HTML.
    .replace(/<p>(<figure>[\s\S]*?<\/figure>)<\/p>/g, '$1');

  const related = relatedPosts(post, allPosts);
  const relatedHtml = related.length
    ? `
    <aside class="related">
      <h2>Related reading</h2>
      <ul>
${related.map((p) => `        <li><a href="${p.url}">${esc(p.title)}</a></li>`).join('\n')}
      </ul>
    </aside>`
    : '';

  // Hero (frontmatter `hero:`) is the one eager image — it doubles as the
  // post's og:image, so it should be a PNG screenshot, not an SVG diagram
  // (social scrapers don't render SVG). heroAlt frontmatter is its alt text.
  const heroHtml = post.hero
    ? `      <figure class="hero-fig"><img src="${esc(post.hero)}" alt="${esc(post.heroAlt || post.title)}" fetchpriority="high" decoding="async"></figure>\n`
    : '';

  const main = `    <article>
      <p class="crumbs"><a href="/blog/">← Blog</a></p>
      <h1>${esc(post.title)}</h1>
      <div class="byline">
        <p class="byline-author">${esc(SITE.author.name)} — ${esc(SITE.author.bio)}</p>
        <p class="byline-dates">${updatedLine}</p>
      </div>
${heroHtml}${body}
      <div class="cta">
        <p><strong>Try ProCabinet free.</strong> Every account starts with 14 days of Pro — no card needed. Set your rates once, then quote, cut, schedule and bill from one place.</p>
        <a class="btn" href="/os?signup&utm_source=blog&utm_medium=organic&utm_campaign=${encodeURIComponent(post.slug)}">Start free</a>
      </div>
${relatedHtml}
    </article>`;

  return page({ head, main, env, assetVer });
}

// ── Index page ──────────────────────────────────────────────────────────────

/**
 * @param {ReturnType<typeof loadPosts>} posts
 * @param {Record<string, string>} env
 * @param {string} assetVer
 */
export function renderIndex(posts, env, assetVer) {
  const url = `${SITE.origin}/blog/`;
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${url}#blog`,
    url,
    name: `${SITE.name} Blog`,
    description: 'Notes on quoting, cut lists and running a small cabinet shop, from a cabinet maker.',
    publisher: { '@id': `${SITE.origin}/#org` },
    blogPost: posts.map((p) => ({
      '@type': 'BlogPosting',
      '@id': `${SITE.origin}${p.url}#post`,
      headline: p.title,
      url: `${SITE.origin}${p.url}`,
      datePublished: p.date,
    })),
  }, null, 2);

  const head = `  <title>Blog — ProCabinet.App</title>
  <meta name="description" content="Notes on quoting, cut lists and running a small cabinet shop, from a cabinet maker. Practical pricing methods, sheet-nesting tips and honest software comparisons." />
  <meta name="theme-color" content="#111111" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE.name}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="Blog — ProCabinet.App" />
  <meta property="og:description" content="Notes on quoting, cut lists and running a small cabinet shop, from a cabinet maker." />
  <meta property="og:image" content="${SITE.defaultImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">
${ld}
  </script>`;

  const list = posts.map((p) => `      <li class="post-item">
        <a href="${p.url}">
          <span class="post-thumb"><img src="${esc(p.hero || '/brand/screenshots/01-dashboard.png')}" alt="" loading="lazy" decoding="async"></span>
          <span class="post-body">
            <h2>${esc(p.title)}</h2>
            <p class="post-date">${niceDate(p.date)}</p>
            <p>${esc(p.description)}</p>
          </span>
        </a>
      </li>`).join('\n');

  const main = `    <h1>Workshop notes</h1>
    <p class="lead">Quoting, cut lists and the business side of cabinet making, written by
      ${esc(SITE.author.name)}, who ran his own cabinetry workshop for over 10 years before
      building ProCabinet.</p>
    <ul class="post-list">
${list}
    </ul>`;

  return page({ head, main, env, assetVer });
}
