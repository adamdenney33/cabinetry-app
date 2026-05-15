import { defineConfig } from 'vite';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
        if (f.endsWith('.js')) copyFileSync(join(srcDir, f), join(outDir, f));
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: 3000,
    open: false,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
    emptyOutDir: true,
  },
  plugins: [
    copyClassicScriptsPlugin(),
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
  ],
});
