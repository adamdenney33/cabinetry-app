// ProCabinet — public wiki generator (procabinet.app/wiki).
//
// Renders one static HTML page per guide in wiki/guides.mjs plus the /wiki/
// index. Invoked at build time by buildWikiPlugin in vite.config.mjs (so this
// file and wiki/guides.mjs are typechecked with the config), and per request
// in dev via handleWikiRequest(). Shares SITE identity + the analytics chrome
// with the blog (scripts/blog.mjs); sitemap.xml / robots.txt / llms.txt are
// owned by seoFilesPlugin, which appends the wiki URLs itself.
//
// Clip URLs come from wiki/clips.json, written by
// scripts/publish-wiki-clips.mjs after clips are recorded and uploaded to the
// public Supabase Storage bucket (video binaries stay out of git — see
// .gitignore). A guide with no manifest entry renders without a video block,
// so pages ship independently of recording.
//
// Cloudflare Pages serves dist/wiki/<slug>.html extensionless at
// /wiki/<slug> and dist/wiki/index.html at /wiki/ — the same mechanism that
// serves /privacy from dist/privacy.html.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { GUIDES } from '../wiki/guides.mjs';
import { SITE, analyticsScripts } from './blog.mjs';

/** @typedef {import('../wiki/guides.mjs').WikiGuide} WikiGuide */

/**
 * One entry per published clip in wiki/clips.json.
 * @typedef {Object} ClipMeta
 * @property {string} clip        Absolute mp4 URL (Supabase public bucket)
 * @property {string} poster      Absolute poster JPG URL
 * @property {number} durationSec
 * @property {number} width
 * @property {number} height
 * @property {string} uploadDate  YYYY-MM-DD (for VideoObject JSON-LD)
 */

/** @returns {Record<string, ClipMeta>} */
function loadClips() {
  if (!existsSync('wiki/clips.json')) return {};
  return /** @type {Record<string, ClipMeta>} */ (
    JSON.parse(readFileSync('wiki/clips.json', 'utf8'))
  );
}

/** Escape for HTML text and attribute contexts. @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Shared page chrome (mirrors scripts/blog.mjs page(), wiki nav flavour) ──

/** @param {{head: string, main: string, mainClass?: string, env: Record<string,string>, assetVer: string}} p */
function page({ head, main, mainClass = '', env, assetVer }) {
  const css = `/wiki.css${assetVer ? `?v=${assetVer}` : ''}`;
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
        <a class="nav-plain" href="/wiki/">Guides</a>
        <a class="nav-plain" href="/blog/">Blog</a>
        <a class="nav-plain" href="/#pricing">Pricing</a>
        <a class="btn-amber-sm" href="/os">Open the app →</a>
      </nav>
    </div>
  </header>

  <main${mainClass ? ` class="${mainClass}"` : ''}>
${main}
  </main>

  <footer class="foot">
    <div class="inner">
      <div>
        <a href="/">Home</a>
        <a href="/wiki/">Guides</a>
        <a href="/blog/">Blog</a>
        <a href="/#pricing">Pricing</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/os">Open the app</a>
      </div>
      <small>© 2026 ProCabinet.App — made by a cabinet maker</small>
    </div>
  </footer>
</body>
</html>
`;
}

/** Sign-up band shown on every wiki page. @param {string} campaign */
function ctaBand(campaign) {
  return `<div class="cta-band">
      <div class="cta-copy">
        <strong>Ready to try it on your own jobs?</strong>
        <span>Free to start — every account begins with 14 days of Pro, no card needed.</span>
      </div>
      <div class="cta-actions">
        <a class="btn-amber" href="/os?signup&utm_source=wiki&utm_medium=organic&utm_campaign=${encodeURIComponent(campaign)}">Start free</a>
        <a class="cta-secondary" href="/#pricing">See pricing</a>
      </div>
    </div>`;
}

// ── Guide page ──────────────────────────────────────────────────────────────

/**
 * BreadcrumbList + HowTo (+ VideoObject when a clip exists).
 * @param {WikiGuide} g @param {ClipMeta | undefined} clip @param {string} url
 */
function guideJsonLd(g, clip, url) {
  /** @type {Record<string, unknown>[]} */
  const graph = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Guides', item: `${SITE.origin}/wiki/` },
        { '@type': 'ListItem', position: 2, name: g.title, item: url },
      ],
    },
    {
      '@type': 'HowTo',
      name: g.title,
      description: g.metaDescription,
      step: g.steps.map((s, i) => ({
        '@type': 'HowToStep', position: i + 1, name: s.heading,
        text: s.body.replace(/<[^>]+>/g, ''), url: `${url}#step-${i + 1}`,
      })),
    },
  ];
  if (clip) {
    const m = Math.floor(clip.durationSec / 60);
    const s = Math.round(clip.durationSec % 60);
    graph.push({
      '@type': 'VideoObject',
      name: `${g.title} — ${SITE.name}`,
      description: g.metaDescription,
      thumbnailUrl: [clip.poster],
      uploadDate: clip.uploadDate,
      duration: `PT${m ? `${m}M` : ''}${s}S`,
      contentUrl: clip.clip,
      embedUrl: url,
      publisher: { '@id': `${SITE.origin}/#org` },
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }, null, 2);
}

/**
 * @param {WikiGuide} g
 * @param {WikiGuide[]} guides  full list, for related-card titles/icons
 * @param {Record<string, ClipMeta>} clips
 * @param {Record<string, string>} env  build env for analytics IDs ({} in dev)
 * @param {string} assetVer  content hash for /wiki.css?v= ('' in dev)
 */
export function renderGuide(g, guides, clips, env, assetVer) {
  const clip = clips[g.slug];
  const url = `${SITE.origin}/wiki/${g.slug}`;
  const video = clip
    ? `    <figure class="clip">
      <video controls muted playsinline loop preload="none"
        poster="${clip.poster}" width="${clip.width}" height="${clip.height}"
        style="aspect-ratio:${clip.width}/${clip.height}">
        <source src="${clip.clip}" type="video/mp4" />
        Your browser doesn't support embedded video —
        <a href="${clip.clip}">download the clip</a>.
      </video>
      <figcaption>Real screen recording from the app — ${Math.round(clip.durationSec)} seconds, silent.</figcaption>
    </figure>`
    : '';
  const steps = g.steps
    .map((s, i) => `      <li id="step-${i + 1}">
        <h3>${esc(s.heading)}</h3>
        <div class="step-body">${s.body}</div>
      </li>`)
    .join('\n');
  const related = g.related
    .map((slug) => {
      const r = guides.find((x) => x.slug === slug);
      if (!r) return '';
      return `      <a class="related-card" href="/wiki/${r.slug}">
        <img src="/brand/icons/individual/${r.icon}.svg" alt="" />
        <span>${esc(r.title)}</span>
      </a>`;
    })
    .join('\n');
  const byline = clip
    ? `${g.steps.length} steps · ${Math.round(clip.durationSec)}-second clip`
    : `${g.steps.length} steps`;

  const head = `  <title>${esc(g.title)} — ${SITE.name} Guides</title>
  <meta name="description" content="${esc(g.metaDescription)}" />
  <meta name="theme-color" content="#111111" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${SITE.name}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(g.title)} — ${SITE.name} Guides" />
  <meta property="og:description" content="${esc(g.metaDescription)}" />
  <meta property="og:image" content="${clip ? clip.poster : `${SITE.origin}/brand/screenshots/${g.screenshot}`}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">
${guideJsonLd(g, clip, url)}
  </script>`;

  const main = `    <nav class="crumbs"><a href="/wiki/">Guides</a> › ${esc(g.title)}</nav>
    <h1>${esc(g.title)}</h1>
    <p class="byline">${byline}</p>
    <p class="lede">${g.intro}</p>
${video}
    <ol class="steps">
${steps}
    </ol>
    <section class="related">
      <h2>Related guides</h2>
      <div class="related-grid">
${related}
      </div>
    </section>
    ${ctaBand(g.slug)}`;

  return page({ head, main, env, assetVer });
}

// ── Index page ──────────────────────────────────────────────────────────────

/**
 * @param {WikiGuide[]} guides
 * @param {Record<string, ClipMeta>} clips
 * @param {Record<string, string>} env
 * @param {string} assetVer
 */
export function renderIndex(guides, clips, env, assetVer) {
  const url = `${SITE.origin}/wiki/`;
  const description = 'Short how-to videos for cabinet makers: rates, cabinet pricing, quotes, cut lists, stock, scheduling and more — each workflow in under a minute.';
  const cards = guides
    .map((g) => {
      const clip = clips[g.slug];
      const thumb = clip
        ? `<img class="poster" src="${clip.poster}" alt="" loading="lazy" />
          <span class="duration">${Math.round(clip.durationSec)}s</span>`
        : `<img class="poster" src="/brand/screenshots/${g.screenshot}" alt="" loading="lazy" />`;
      return `    <a class="guide-card" href="/wiki/${g.slug}">
      <div class="guide-thumb">${thumb}</div>
      <div class="guide-card-body">
        <h2>${esc(g.title)}</h2>
        <p>${esc(g.metaDescription)}</p>
      </div>
    </a>`;
    })
    .join('\n');

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#guides`,
    url,
    name: `${SITE.name} Guides`,
    description,
    publisher: { '@id': `${SITE.origin}/#org` },
    hasPart: guides.map((g) => ({
      '@type': 'HowTo',
      name: g.title,
      url: `${SITE.origin}/wiki/${g.slug}`,
    })),
  }, null, 2);

  const head = `  <title>Guides — how to use ${SITE.name}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="theme-color" content="#111111" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${SITE.name}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="Guides — how to use ${SITE.name}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${SITE.defaultImage}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">
${ld}
  </script>`;

  const main = `    <div class="index-hero">
      <h1>How-to guides</h1>
      <p class="lede">Short, real screen recordings of every core workflow in ProCabinet —
      watch how each part works, then follow the steps.</p>
    </div>
    <div class="guide-grid">
${cards}
    </div>
    ${ctaBand('wiki-index')}`;

  return page({ head, main, mainClass: 'index', env, assetVer });
}

// ── Entry points ────────────────────────────────────────────────────────────

/**
 * Build the wiki into <outDir>: /wiki pages + the ?v=-stamped wiki.css.
 * Called from buildWikiPlugin's closeBundle in vite.config.mjs.
 * @param {{ outDir?: string, env?: Record<string, string> }} [opts]
 */
export function buildWiki({ outDir = 'dist', env = {} } = {}) {
  const clips = loadClips();
  mkdirSync(join(outDir, 'wiki'), { recursive: true });
  // wiki.css ships at the dist root like landing.css/blog.css, cached
  // immutable (see _headers) with a ?v= content hash — same scheme as
  // versionClassicScriptsPlugin, done here because this generator owns the
  // HTML that references it.
  const css = readFileSync('wiki/wiki.css');
  writeFileSync(join(outDir, 'wiki.css'), css);
  const ver = createHash('sha256').update(css).digest('hex').slice(0, 8);
  writeFileSync(join(outDir, 'wiki', 'index.html'), renderIndex(GUIDES, clips, env, ver));
  for (const g of GUIDES) {
    writeFileSync(join(outDir, 'wiki', `${g.slug}.html`), renderGuide(g, GUIDES, clips, env, ver));
  }
}

/**
 * Dev-server rendering for buildWikiPlugin's configureServer middleware:
 * returns the response for a /wiki* (or /wiki.css) request, or null to fall
 * through. Renders with an empty env (analytics no-op — dev traffic stays out
 * of prod numbers). Freshness in dev comes from Vite's config-dependency
 * watching: this module and wiki/guides.mjs are bundled with vite.config.mjs,
 * so editing either restarts the dev server; clips.json and wiki.css are
 * re-read from disk per request.
 * @param {string} urlPath  req.url including any query string
 * @returns {{ body: string, type: string } | null}
 */
export function handleWikiRequest(urlPath) {
  const path = (urlPath.split('?')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/wiki.css') {
    return { body: readFileSync('wiki/wiki.css', 'utf8'), type: 'text/css' };
  }
  const m = path.match(/^\/wiki(?:\/([\w-]+?)(?:\.html)?)?$/);
  if (!m) return null;
  if (!m[1] || m[1] === 'index') {
    return { body: renderIndex(GUIDES, loadClips(), {}, ''), type: 'text/html' };
  }
  const g = GUIDES.find((x) => x.slug === m[1]);
  if (!g) return null; // unknown slug → Vite's own 404
  return { body: renderGuide(g, GUIDES, loadClips(), {}, ''), type: 'text/html' };
}
