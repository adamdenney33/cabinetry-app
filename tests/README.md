# Smoke tests

These are **smoke tests** — fast checks that the app boots and the critical
screens render without crashing. They are *not* exhaustive feature tests. Their
job is to catch the most common and most painful class of regression — "I
changed something and a whole flow silently broke" — **before it deploys to
customers**, instead of finding out when a customer emails you.

They run automatically in CI on every push to `main` (see
`.github/workflows/deploy.yml`). **If a smoke test fails, the deploy is blocked.**

## Running them

```bash
npm run test:e2e        # full suite (boot checks + logged-in screens)
npm run test:e2e:ui     # same, but watch it click through in a real browser
npm run test:smoke      # logged-out boot checks only — exactly what CI runs
```

You don't need a dev server running first — Playwright starts one itself and
shuts it down after. If `npm run dev` is already running, it reuses it.

**Run `npm run test:e2e` before you push anything risky.** Green = the app still
boots and every main screen still renders.

## What's covered

### `smoke.public.spec.js` — logged-out (no account needed)
Runs everywhere, including CI. Catches the "app is completely broken" bugs:
- The app boots and the login screen renders.
- **Every classic script (`src/*.js`) actually loads** — a renamed/missing/
  broken script 404s and the test goes red, naming the file.
- No uncaught JavaScript error on boot (one of these blanks the screen for users).
- The sign-in / create-account toggle and empty-field validation work.

### `smoke.app.spec.js` — logged-in (read-only)
Signs in via the built-in `window._signInForTesting()` dev helper, then checks
that each screen renders:
- Dashboard loads after sign-in.
- All 8 sections open without throwing (dashboard, cut list, stock, cabinet,
  quotes, orders, clients, schedule).
- The quote editor and order editor forms open.

**These are deliberately read-only.** The test account is a real account with
real data, and Stripe is in live mode, so the tests never create a quote/order
or trigger a payment — they only open screens and confirm nothing crashes.

These tests **auto-skip** when the sign-in helper is absent — which is the case
in production builds and in CI (no test credentials there) — so they never fail
for a missing-by-design reason. They run locally because `VITE_TEST_EMAIL` /
`VITE_TEST_PASSWORD` in `.env.local` enable the helper in dev mode.

## Why CI only runs the logged-out tests

The logged-in tests sign into a **real account**. Running them in CI would mean
storing that password as a GitHub secret and having CI read live production data
on every push. The clean way to enable logged-in coverage in CI is a **dedicated
throwaway test account** (not your personal one). Once that exists:

1. Add its email/password as GitHub Actions secrets.
2. Point `VITE_TEST_EMAIL` / `VITE_TEST_PASSWORD` at it.
3. Switch the CI step from `npm run test:smoke` to `npm run test:e2e`.

Until then, the logged-in tests are your **pre-push** check, and the logged-out
tests are the **automatic deploy gate**.

## Adding a test

When you fix a customer-reported bug, that's the best moment to add a test for
it — so it can never silently come back. Copy the closest existing test, point
it at the screen/flow that broke, and keep it **read-only** (open things and
assert they render; don't save/submit/pay). If you're unsure, ask Claude to add
the test for the bug you just fixed.
```bash
npm run test:e2e   # confirm your new test is green
```
