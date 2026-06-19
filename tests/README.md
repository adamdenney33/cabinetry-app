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

These tests **auto-skip** when the sign-in helper is absent — production builds,
or CI without the test-account secrets — so they never fail for a
missing-by-design reason. The helper is enabled by `VITE_TEST_EMAIL` /
`VITE_TEST_PASSWORD` in `.env.local` (locally) and by GitHub secrets (in CI).

## The test account

Both layers run in CI on every push. The logged-in tests sign into a **dedicated
throwaway account** (`adamdenney33+e2e@googlemail.com`) — NOT your personal
account and NOT any customer — created read-only-safe for exactly this purpose.
They never write data or trigger a payment.

- **Locally:** `.env.local` holds the account's email + password (gitignored).
- **In CI:** the same values live as GitHub Actions secrets `TEST_EMAIL` /
  `TEST_PASSWORD`, passed to the test step in `.github/workflows/deploy.yml`.

If you ever need to recreate or rotate it: sign the account up through Supabase,
confirm its email, then update both `.env.local` and the two GitHub secrets
(`gh secret set TEST_EMAIL` / `gh secret set TEST_PASSWORD`).

## Adding a test

When you fix a customer-reported bug, that's the best moment to add a test for
it — so it can never silently come back. Copy the closest existing test, point
it at the screen/flow that broke, and keep it **read-only** (open things and
assert they render; don't save/submit/pay). If you're unsure, ask Claude to add
the test for the bug you just fixed.
```bash
npm run test:e2e   # confirm your new test is green
```
