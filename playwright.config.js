// Playwright config for ProCabinet smoke tests.
//
// These are SMOKE tests: they verify the app boots, the critical screens
// render, and nothing throws — not exhaustive feature tests. The goal is to
// catch "I changed something and a whole flow broke" before it reaches
// customers, by running automatically in CI before every production deploy.
//
// Two layers of tests live in tests/e2e/:
//   • smoke.public.spec.js — runs logged-OUT. No credentials needed. Verifies
//     the app boots, every classic script loads, and the auth screen works.
//     These run everywhere, including CI.
//   • smoke.app.spec.js — runs logged-IN via the built-in window._signInForTesting()
//     dev helper (which only exists when VITE_TEST_EMAIL/PASSWORD are set and
//     the app is in dev mode). These tests auto-SKIP when that helper is absent
//     — e.g. in CI without test credentials — so the suite never falsely fails.
//
// Run locally:  npm run test:e2e        (full suite incl. logged-in screens)
//               npm run test:e2e:ui     (interactive, watch it click through)
//               npm run test:smoke      (logged-out boot tests only — what CI runs)

const { defineConfig, devices } = require('@playwright/test');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  // Serial: one dev server, and the logged-in tests share a single real
  // account session — parallel workers would race on shared app state.
  fullyParallel: false,
  workers: 1,
  // A flaky retry in CI absorbs transient network blips against Supabase; locally
  // we want failures to surface immediately.
  retries: process.env.CI ? 1 : 0,
  // Fail the build if someone leaves a test.only in committed code.
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: BASE_URL,
    headless: true,
    // Artifacts only when something breaks — keeps local runs clean.
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Playwright starts the Vite dev server itself, waits for it, and tears it
  // down after. Reuses an already-running dev server locally so it doesn't
  // fight `npm run dev`; always starts fresh in CI.
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
