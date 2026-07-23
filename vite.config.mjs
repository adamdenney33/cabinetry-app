import { defineConfig, loadEnv } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';
import { sentryVitePlugin } from '@sentry/vite-plugin';
// Static imports (not dynamic) on purpose: Vite bundles the config + all its
// imports into a temp file and auto-restarts the dev server whenever any of
// them change, so blog/wiki template or guide-copy edits stay fresh in dev.
// Dynamic `import('...?t=')` cache-busting does NOT work here — non-literal
// specifiers can't resolve from inside the bundled config ("Module not found
// in bundle"). Blog .md content is re-read from disk per request regardless.
import * as blog from './scripts/blog.mjs';
import * as wiki from './scripts/build-wiki.mjs';
import { GUIDES } from './wiki/guides.mjs';
import { siteUrls } from './scripts/site-urls.mjs';

// IndexNow key file: proves ownership to the IndexNow API (scripts/indexnow.mjs,
// run from CI after each deploy — see .github/workflows/deploy.yml). Its content
// IS the key, so the filename is not a secret; regenerate both together if ever
// rotated (delete the old file, `node -e "console.log(crypto.randomUUID().replace(/-/g,''))"`,
// write the new one, update indexnow.mjs's INDEXNOW_KEY to match).
const INDEXNOW_KEY_FILE = '2ca9a129f6b24e39a121200ca7d45482.txt';

// Phase A: Vite is currently a thin shell around the existing vanilla codebase.
// index.html still uses classic <script src="src/*.js"> tags; Vite serves them
// as static assets in dev. For build, the plugin below copies src/*.js into
// dist/src/ so the classic <script> references resolve. ES module migration
// (and removal of this plugin) happens in phase C.
function copyClassicScriptsPlugin() {
  return {
    name: 'copy-classic-scripts',
    // The actual sourcemap-upload scan (inside @sentry/rollup-plugin, which
    // @sentry/vite-plugin wraps) runs in `writeBundle` — hardcoded to glob the
    // whole outDir at that instant — NOT in `closeBundle` as its own comments
    // suggest. writeBundle always completes, for every plugin regardless of
    // enforce tier, before any closeBundle hook starts, so this MUST also be a
    // writeBundle hook (closeBundle is too late — confirmed via a throwaway
    // diagnostic plugin: dist/src was still absent whenever it hooked
    // closeBundle, present once switched to writeBundle). enforce:'pre' plus
    // this plugin's earlier position in the `plugins` array then wins the
    // tie-break against sentryVitePlugin's own (also enforce:'pre') writeBundle.
    /** @type {'pre'} */
    enforce: 'pre',
    writeBundle() {
      const srcDir = 'src';
      const outDir = 'dist/src';
      if (!existsSync(srcDir)) return;
      mkdirSync(outDir, { recursive: true });
      for (const f of readdirSync(srcDir)) {
        if (!f.endsWith('.js')) continue;
        // Minify whitespace + syntax only — NOT identifiers. The classic
        // scripts share state through the global lexical environment, so
        // renaming top-level names would break cross-file references.
        // Emit an external source map + a sourceMappingURL comment pointing
        // at it. The comment is required, not cosmetic: sentry-cli's
        // `sourcemaps inject` (below) can only pair a .js with its .map — and
        // so inject a matching debug id into BOTH — by reading this comment;
        // without it, "sourcemaps inject" silently injects a debug id into
        // the .js alone and leaves the .map untouched, so Sentry's upload
        // scan can never associate the two and drops the file with "Could
        // not determine debug ID from bundle" (confirmed locally: identical
        // to what a stripped-down repro of Sentry's own upload path reported
        // for these files before this comment was added). The .map itself
        // still never reaches production — stripSourceMapsPlugin deletes it
        // after upload, so the comment just 404s harmlessly in devtools.
        const { code, map } = transformSync(readFileSync(join(srcDir, f), 'utf8'), {
          loader: 'js', target: 'es2020',
          minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
          sourcemap: 'external', sourcefile: f,
        });
        writeFileSync(join(outDir, f), code + `\n//# sourceMappingURL=${f}.map\n`);
        writeFileSync(join(outDir, f + '.map'), map);
      }
      // Rollup's own chunks get a debug id automatically (via @sentry/rollup-
      // plugin's renderChunk hook, which only sees files that go through
      // Rollup's module graph). These classic scripts are copied straight
      // from disk, bypassing that graph entirely, so nothing ever injects
      // their debug id — do it ourselves, using Sentry's own CLI so the id
      // format/matching logic stays authoritative rather than hand-rolled.
      // Purely local file rewriting, no network/auth needed (verified) — but
      // skip it when Sentry itself is disabled (no token) so a plain local
      // build doesn't pay for a step whose output nothing will ever read.
      if (process.env.SENTRY_AUTH_TOKEN) {
        try {
          execFileSync('node_modules/.bin/sentry-cli', ['sourcemaps', 'inject', outDir], { stdio: 'inherit' });
        } catch (e) {
          console.warn('[copy-classic-scripts] sentry-cli sourcemaps inject failed — classic scripts will upload without debug ids:', (/** @type {any} */ (e)).message || e);
        }
        // sentryVitePlugin's own upload only discovers these files via its
        // internal buildArtifactPaths glob, which (confirmed across 3 deploys
        // of debugging: 2026-07-05, JAVASCRIPT source-map investigation) never
        // ends up including dist/src even once the debug-id linkage above is
        // correct — an undocumented constraint somewhere in its shared
        // discovery path that isn't worth chasing further. Upload dist/src
        // ourselves instead, as a fully independent step: debug-id matching is
        // release-agnostic (the shared id embedded in the shipped script and
        // its map is what resolves a stack frame, not a release lookup), so no
        // --release/--org/--project flags are needed beyond what sentry-cli
        // already reads from the SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN
        // env vars set alongside this token.
        try {
          execFileSync('node_modules/.bin/sentry-cli', ['sourcemaps', 'upload', outDir], { stdio: 'inherit' });
        } catch (e) {
          console.warn('[copy-classic-scripts] sentry-cli sourcemaps upload failed — classic scripts will have no server-side source maps:', (/** @type {any} */ (e)).message || e);
        }
      }
    },
  };
}

// The Supabase auth email templates (supabase/templates/*.html) reference the
// logo by absolute URL — email clients strip SVG and inline data-URIs, so it
// must be a hosted PNG. Ship the brand logo at the dist/ root so it deploys to
// https://procabinet.app/logo-colour-on-dark.png.
function copyEmailLogoPlugin() {
  return {
    name: 'copy-email-logo',
    closeBundle() {
      const logo = 'brand/logo/logo-colour-on-dark.png';
      if (existsSync(logo)) copyFileSync(logo, 'dist/logo-colour-on-dark.png');
    },
  };
}

// Routing: the marketing landing is the home page (/) and the app lives at /os.
// Vite builds the app to dist/index.html; this plugin moves that to
// dist/os/index.html and installs landing.html as the new dist/index.html.
// The landing loads none of the app bundle (just landing.css + landing.js).
// publicDir is false, so the brand assets the landing references (icons,
// screenshots, logo) are copied explicitly into dist/brand/.
//
// landing.html is copied verbatim (it is NOT a Vite build input), so its inline
// analytics/ads snippets cannot read import.meta.env. Instead we inject the
// values from the build env here, swapping the __VITE_*__ placeholders for the
// PostHog key/host AND the paid-ads IDs (GA4, Google Ads, Meta Pixel) — ad clicks
// land on the landing page, so its pixels must fire there, mirroring src/main.js.
// `env` comes from loadEnv() below: .env.local locally, process.env on Cloudflare.
/** @param {Record<string, string>} env */
function copyLandingPlugin(env) {
  return {
    name: 'copy-landing',
    closeBundle() {
      // Move the built app to /os so the landing can own the home page.
      mkdirSync(join('dist', 'os'), { recursive: true });
      if (existsSync(join('dist', 'index.html'))) {
        copyFileSync(join('dist', 'index.html'), join('dist', 'os', 'index.html'));
      }
      // Landing becomes the home page (keep /landing.html too for back-compat).
      if (existsSync('landing.html')) {
        const landing = readFileSync('landing.html', 'utf8')
          .split('__VITE_POSTHOG_KEY__').join(env.VITE_POSTHOG_KEY || '')
          .split('__VITE_POSTHOG_HOST__').join(env.VITE_POSTHOG_HOST || '')
          .split('__VITE_GA4_ID__').join(env.VITE_GA4_ID || '')
          .split('__VITE_GOOGLE_ADS_ID__').join(env.VITE_GOOGLE_ADS_ID || '')
          .split('__VITE_META_PIXEL_ID__').join(env.VITE_META_PIXEL_ID || '')
          // Live Founder-seats counter (landing.js founderSeats): the anon key
          // is the publishable client key — safe to embed, same one the app ships.
          .split('__VITE_SUPABASE_URL__').join(env.VITE_SUPABASE_URL || '')
          .split('__VITE_SUPABASE_ANON_KEY__').join(env.VITE_SUPABASE_ANON_KEY || '');
        writeFileSync(join('dist', 'index.html'), landing);
        writeFileSync(join('dist', 'landing.html'), landing);
      }
      for (const f of ['landing.css', 'landing.js']) {
        if (existsSync(f)) copyFileSync(f, join('dist', f));
      }
      // Static legal/info pages — self-contained, no build-time injection needed.
      // Cloudflare Pages serves these extensionless (/privacy, /terms,
      // /payment-fees, /affiliates).
      for (const f of ['privacy.html', 'terms.html', 'payment-fees.html', 'affiliates.html']) {
        if (existsSync(f)) copyFileSync(f, join('dist', f));
      }
      // brand/blog holds the hand-drawn SVG diagrams the blog posts embed;
      // brand/videos holds the landing demo film + its poster.
      for (const dir of ['brand/icons', 'brand/screenshots', 'brand/logo', 'brand/blog', 'brand/videos']) {
        if (existsSync(dir)) cpSync(dir, join('dist', dir), { recursive: true });
      }
    },
  };
}

// Delete every source map from dist/ after the build. Maps are still
// generated (build.sourcemap: 'hidden') and uploaded to Sentry by
// sentryVitePlugin; closeBundle runs after that writeBundle upload, so
// removing the files here keeps Sentry stack traces working while never
// serving the maps publicly.
function stripSourceMapsPlugin() {
  return {
    name: 'strip-source-maps',
    closeBundle() {
      if (!existsSync('dist')) return;
      for (const f of readdirSync('dist', { recursive: true })) {
        if (typeof f === 'string' && f.endsWith('.map')) unlinkSync(join('dist', f));
      }
    },
  };
}

// Cache-busting for the unhashed scripts/styles that keep stable filenames
// across deploys: the app's classic <script src="/src/*.js"> tags AND the
// landing page's /landing.js + /landing.css. Cloudflare's 4-hour default
// browser cache (max-age=14400) kept serving stale copies of these after a
// deploy until the cache expired. (Symptom: new features invisible in a normal
// window but fine in a fresh/incognito profile; a Chrome-style hard refresh
// doesn't help on Safari, whose reload-from-origin is Cmd+Opt+R.)
//
// Fix: append ?v=<contenthash> to each reference so the URL changes whenever
// the file's contents change. Combined with the immutable cache header in
// _headers, files are cached forever yet refetched the instant they change, and
// every deploy self-busts on the next page load (the HTML itself always
// revalidates — see _headers). Runs after copyLandingPlugin, which moves the
// app HTML to dist/os/index.html and writes the landing HTML.
function versionClassicScriptsPlugin() {
  // 8-char content hash of a file inside dist/, for ?v= cache-busting.
  const tag = (/** @type {string} */ distRel) =>
    createHash('sha256').update(readFileSync(join('dist', distRel))).digest('hex').slice(0, 8);
  return {
    name: 'version-classic-scripts',
    closeBundle() {
      // App (/os): stamp every classic /src/*.js script tag. Anchored on the
      // closing quote so e.g. cabinet.js never matches inside cabinet-calc.js;
      // main.js is the bundled module (/assets/...), not a /src/ tag, so it
      // never matches here.
      const appHtml = join('dist', 'os', 'index.html');
      const srcDir = join('dist', 'src');
      if (existsSync(appHtml) && existsSync(srcDir)) {
        let html = readFileSync(appHtml, 'utf8');
        for (const f of readdirSync(srcDir)) {
          if (!f.endsWith('.js')) continue;
          html = html.split(`/src/${f}"`).join(`/src/${f}?v=${tag(join('src', f))}"`);
        }
        writeFileSync(appHtml, html);
      }
      // Landing (/ and the /landing.html back-compat alias): stamp the only
      // unhashed root assets, /landing.js and /landing.css. copyLandingPlugin
      // writes both HTML files verbatim, so each carries the same plain refs.
      for (const page of ['index.html', 'landing.html']) {
        const p = join('dist', page);
        if (!existsSync(p)) continue;
        let html = readFileSync(p, 'utf8');
        for (const asset of ['landing.js', 'landing.css']) {
          if (existsSync(join('dist', asset))) {
            html = html.split(`/${asset}"`).join(`/${asset}?v=${tag(asset)}"`);
          }
        }
        writeFileSync(p, html);
      }
    },
  };
}

// Blog: content/blog/*.md → static pages at /blog/<slug>/ plus the /blog
// index. Markdown is parsed at build time (marked — dev dependency, nothing
// ships to the client); the frontmatter loader + HTML templates live in
// scripts/blog.mjs so seoFilesPlugin can read the SAME post metadata (single
// source of truth — see loadPosts()). Pages are written straight into dist/
// during closeBundle — like landing.html they are NOT Vite build inputs, so
// analytics IDs are injected here from the build env, not import.meta.env.
// In dev, configureServer middleware renders the same templates per request,
// so /blog and /blog/<slug>/ preview live under `npm run dev` — edit the .md,
// refresh the browser, done (.md files are re-read per request; template
// edits restart the server via config-dependency watching — see the static
// imports at the top). Dev renders with an EMPTY env so analytics no-op and
// dev traffic stays out of prod numbers, mirroring how copyLandingPlugin
// simply doesn't run in dev.
/** @param {Record<string, string>} env */
function blogPlugin(env) {
  return {
    name: 'blog',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = (req.url || '').split('?')[0].match(/^\/blog(?:\/([\w-]+)\/?)?$/);
        if (!m) return next();
        try {
          const posts = blog.loadPosts();
          const post = m[1] ? posts.find((p) => p.slug === m[1]) : null;
          if (m[1] && !post) return next(); // unknown slug → Vite's own 404
          res.setHeader('Content-Type', 'text/html');
          res.end(post ? blog.renderPost(post, posts, {}, '') : blog.renderIndex(posts, {}, ''));
        } catch (e) {
          next(e);
        }
      });
    },
    closeBundle() {
      // blog.css first — its content hash stamps every page's <link> (?v=…),
      // same scheme as versionClassicScriptsPlugin; /blog.css is immutable in
      // _headers, so the stamp is what busts it.
      copyFileSync('blog.css', join('dist', 'blog.css'));
      const ver = createHash('sha256').update(readFileSync('blog.css')).digest('hex').slice(0, 8);
      const posts = blog.loadPosts();
      for (const post of posts) {
        mkdirSync(join('dist', 'blog', post.slug), { recursive: true });
        writeFileSync(join('dist', 'blog', post.slug, 'index.html'), blog.renderPost(post, posts, env, ver));
      }
      mkdirSync(join('dist', 'blog'), { recursive: true });
      writeFileSync(join('dist', 'blog', 'index.html'), blog.renderIndex(posts, env, ver));
    },
  };
}

// Wiki: wiki/guides.mjs → static how-to pages at /wiki/<slug> plus the /wiki/
// index (scripts/build-wiki.mjs owns the templates; workflow clips referenced
// from wiki/clips.json live in the public Supabase Storage bucket — video
// binaries stay out of git). Same shape as blogPlugin: pages written straight
// into dist/ during closeBundle with analytics IDs from the build env, dev
// middleware renders per request with an EMPTY env (guide-copy edits restart
// the server via config-dependency watching; clips.json is re-read per
// request). seoFilesPlugin appends the wiki URLs to sitemap.xml and llms.txt
// from the same GUIDES source.
/** @param {Record<string, string>} env */
function buildWikiPlugin(env) {
  return {
    name: 'build-wiki',
    /** @param {import('vite').ViteDevServer} server */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!/^\/wiki(\/|\.css|$)/.test(url.split('?')[0] || '')) return next();
        try {
          const hit = wiki.handleWikiRequest(url);
          if (!hit) return next(); // unknown slug → Vite's own 404
          res.setHeader('Content-Type', `${hit.type}; charset=utf-8`);
          res.end(hit.body);
        } catch (e) {
          next(e);
        }
      });
    },
    closeBundle() {
      wiki.buildWiki({ outDir: 'dist', env });
    },
  };
}

// SEO/AEO plumbing: copies the hand-written robots.txt and 404.html into
// dist/ (publicDir is false, so nothing ships implicitly), writes llms.txt
// with a Blog section appended from the live post list, then generates
// dist/sitemap.xml. The sitemap lists the public marketing pages by their
// canonical extensionless URLs plus every blog page from loadPosts() — the
// same source of truth blogPlugin renders from, so pages and sitemap can
// never disagree. /os, /q and /landing.html are noindexed and must NEVER
// appear here (GSC would flag "submitted URL marked noindex").
// NOTE: the mere presence of dist/404.html switches Cloudflare Pages from SPA
// fallback (unknown path → 200 + home page) to real 404s — deliberate, it
// closes the soft-404/duplicate-content hole.
function seoFilesPlugin() {
  const ORIGIN = 'https://procabinet.app';
  return {
    name: 'seo-files',
    closeBundle() {
      for (const f of ['robots.txt', '404.html', INDEXNOW_KEY_FILE]) {
        if (existsSync(f)) copyFileSync(f, join('dist', f));
      }
      const posts = blog.loadPosts();
      // Wiki guides (GUIDES import) share the sitemap/llms.txt treatment —
      // same source of truth buildWikiPlugin renders from (wiki/guides.mjs).
      // llms.txt: hand-written product facts + generated guide/post lists.
      if (existsSync('llms.txt')) {
        let llms = readFileSync('llms.txt', 'utf8');
        if (GUIDES.length) {
          llms += '\n## Guides\n\n'
            + GUIDES.map((g) => `- [${g.title}](${ORIGIN}/wiki/${g.slug}) — ${g.metaDescription}`).join('\n')
            + '\n';
        }
        if (posts.length) {
          llms += '\n## Blog\n\n'
            + posts.map((p) => `- [${p.title}](${ORIGIN}${p.url}) — ${p.description}`).join('\n')
            + '\n';
        }
        writeFileSync(join('dist', 'llms.txt'), llms);
      }
      // Sitemap: same URL list scripts/indexnow.mjs submits to IndexNow (see
      // scripts/site-urls.mjs) — no lastmod on the static pages, file mtimes
      // lie in CI; blog posts carry their real lastmod from frontmatter.
      const entries = siteUrls().map(({ url, lastmod }) =>
        lastmod ? `  <url><loc>${url}</loc><lastmod>${lastmod}</lastmod></url>` : `  <url><loc>${url}</loc></url>`);
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + entries.join('\n')
        + '\n</urlset>\n';
      writeFileSync(join('dist', 'sitemap.xml'), xml);
    },
  };
}

// Cloudflare Pages reads dist/_headers for per-path cache rules. publicDir is
// false, so the root _headers file must be copied into the build output
// explicitly. It marks the hashed /assets and the ?v=-stamped /src as immutable
// while keeping HTML on must-revalidate. See versionClassicScriptsPlugin.
function copyHeadersPlugin() {
  return {
    name: 'copy-headers',
    closeBundle() {
      if (existsSync('_headers')) copyFileSync('_headers', join('dist', '_headers'));
    },
  };
}

export default defineConfig(({ mode }) => {
  // VITE_-prefixed vars from .env files (.env.local locally) plus any matching
  // process.env vars (Cloudflare Pages build env). Used to inject the PostHog
  // key/host + GA4/Google Ads/Meta Pixel IDs into the verbatim-copied
  // landing.html — see copyLandingPlugin.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
  root: '.',
  publicDir: false,
  server: {
    // Honour a harness-assigned port when present (preview autoPort so multiple
    // sessions can run at once); otherwise the usual local 3000.
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
    open: false,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    // 'hidden' generates source maps (sentryVitePlugin uploads them) but adds
    // no sourceMappingURL comment to the bundles; stripSourceMapsPlugin then
    // removes the .map files so they are never served publicly.
    sourcemap: 'hidden',
    target: 'es2020',
    emptyOutDir: true,
    rollupOptions: {
      // index.html = the app (copyLandingPlugin moves it to /os). q.html = the
      // public live quote page (/q.html?t=<token>) bundled as its own module
      // entry (src/quote-public.js). HTML inputs keep their own dist filenames,
      // so this doesn't disturb the landing/os routing.
      input: { app: 'index.html', quote: 'q.html' },
    },
  },
  plugins: [
    copyClassicScriptsPlugin(),
    copyEmailLogoPlugin(),
    copyLandingPlugin(env),
    // Must run after copyLandingPlugin — it needs the app HTML in its final
    // home at dist/os/index.html before stamping the /src script URLs.
    versionClassicScriptsPlugin(),
    // Blog + wiki pages first, then the SEO files: seoFilesPlugin reads the
    // same loadPosts()/GUIDES sources, but keeping the order pages → sitemap
    // is tidy.
    blogPlugin(env),
    buildWikiPlugin(env),
    seoFilesPlugin(),
    copyHeadersPlugin(),
    // Source-map upload + release/commit grouping. Needs build.sourcemap (set
    // above). org/project/authToken come from the build env — see
    // .github/workflows/deploy.yml. `disable` makes the plugin a no-op when
    // SENTRY_AUTH_TOKEN is absent (local builds, or CI before the secret is
    // added), so `npm run build` never fails on a missing token.
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      // No `sourcemaps.assets` override needed: with build.outDir set (it is —
      // 'dist'), @sentry/rollup-plugin's writeBundle hook ignores that option
      // entirely and hardcodes a glob over the whole outDir, so dist/src/*.js
      // (the hand-copied classic scripts, not part of the Rollup bundle) is
      // picked up automatically as long as it already exists on disk by then
      // — which is what copyClassicScriptsPlugin's writeBundle+enforce:'pre'
      // guarantees (see that plugin's comment).
    }),
    // Must run after sentryVitePlugin so source maps are uploaded before
    // they are stripped from the deploy output.
    stripSourceMapsPlugin(),
  ],
  };
});
