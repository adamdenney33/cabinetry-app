import { defineConfig, loadEnv } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// Phase A: Vite is currently a thin shell around the existing vanilla codebase.
// index.html still uses classic <script src="src/*.js"> tags; Vite serves them
// as static assets in dev. For build, the plugin below copies src/*.js into
// dist/src/ so the classic <script> references resolve. ES module migration
// (and removal of this plugin) happens in phase C.
function copyClassicScriptsPlugin() {
  return {
    name: 'copy-classic-scripts',
    closeBundle() {
      const srcDir = 'src';
      const outDir = 'dist/src';
      if (!existsSync(srcDir)) return;
      mkdirSync(outDir, { recursive: true });
      for (const f of readdirSync(srcDir)) {
        if (!f.endsWith('.js')) continue;
        // Minify whitespace + syntax only — NOT identifiers. The classic
        // scripts share state through the global lexical environment, so
        // renaming top-level names would break cross-file references.
        const { code } = transformSync(readFileSync(join(srcDir, f), 'utf8'), {
          loader: 'js', target: 'es2020',
          minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
        });
        writeFileSync(join(outDir, f), code);
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
      // Cloudflare Pages serves these extensionless (/privacy, /terms, /payment-fees).
      for (const f of ['privacy.html', 'terms.html', 'payment-fees.html']) {
        if (existsSync(f)) copyFileSync(f, join('dist', f));
      }
      for (const dir of ['brand/icons', 'brand/screenshots', 'brand/logo']) {
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
    port: 3000,
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
    }),
    // Must run after sentryVitePlugin so source maps are uploaded before
    // they are stripped from the deploy output.
    stripSourceMapsPlugin(),
  ],
  };
});
