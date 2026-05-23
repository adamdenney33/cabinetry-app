import { defineConfig, loadEnv } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, existsSync, readFileSync, writeFileSync, unlinkSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
          .split('__VITE_META_PIXEL_ID__').join(env.VITE_META_PIXEL_ID || '');
        writeFileSync(join('dist', 'index.html'), landing);
        writeFileSync(join('dist', 'landing.html'), landing);
      }
      for (const f of ['landing.css', 'landing.js']) {
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
  },
  plugins: [
    copyClassicScriptsPlugin(),
    copyEmailLogoPlugin(),
    copyLandingPlugin(env),
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
