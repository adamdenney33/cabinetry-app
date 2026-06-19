// Logged-IN smoke tests — sign in via the built-in window._signInForTesting()
// dev helper, then verify every main screen RENDERS without throwing.
//
// These are READ-ONLY by design. The test account is a real account with real
// production data, and Stripe runs in live mode, so these tests deliberately
// never create quotes/orders or trigger a payment — they only open screens and
// editor forms and check nothing blows up. That still catches the most common
// regression for this app: "I edited X and now the Quotes (or Orders, or
// Cabinet…) tab throws and shows a blank panel."
//
// They auto-SKIP when window._signInForTesting is absent — which is the case in
// any production build or in CI without test credentials — so the suite stays
// green there instead of failing for a missing-by-design reason.

const { test, expect } = require('@playwright/test');

// Every main nav section, plus the in-DOM panel id each one activates.
const SECTIONS = [
  { name: 'dashboard', panel: '#panel-dashboard' },
  { name: 'cutlist', panel: '#panel-cutlist' },
  { name: 'stock', panel: '#panel-stock' },
  { name: 'cabinet', panel: '#panel-cabinet' },
  { name: 'quote', panel: '#panel-quote' },
  { name: 'orders', panel: '#panel-orders' },
  { name: 'clients', panel: '#panel-clients' },
  { name: 'schedule', panel: '#panel-schedule' },
];

// Per-test collector for uncaught exceptions — a render function that throws
// while switching sections lands here.
function watchPageErrors(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

// Sign in through the real Supabase auth path the same way a user does, then
// wait for the app shell to take over from the auth screen.
async function signIn(page) {
  await page.goto('/');
  const hasHelper = await page.evaluate(
    () => typeof (/** @type {any} */ (window))._signInForTesting === 'function'
  );
  test.skip(
    !hasHelper,
    'Logged-in smoke tests need dev mode + VITE_TEST_EMAIL/PASSWORD (skipped in CI / prod builds).'
  );

  const res = await page.evaluate(() => (/** @type {any} */ (window))._signInForTesting());
  expect(res && res.ok, `test sign-in failed: ${res && res.error}`).toBeTruthy();

  // onAuthStateChange(SIGNED_IN) hides the auth screen and loads data.
  await expect(page.locator('#auth-screen')).toHaveClass(/hidden/, { timeout: 20_000 });
  await expect(page.locator('.nav-tab').first()).toBeVisible();
}

test.describe('logged-in screens render', () => {
  test('dashboard loads after sign-in', async ({ page }) => {
    const errors = watchPageErrors(page);
    await signIn(page);

    await page.evaluate(() => (/** @type {any} */ (window)).switchSection('dashboard'));
    await expect(page.locator('#panel-dashboard')).toHaveClass(/active/);
    // The panel actually rendered content, not an empty shell.
    await expect(page.locator('#panel-dashboard')).not.toBeEmpty();

    expect(errors, `Uncaught errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('every main section opens without throwing', async ({ page }) => {
    const errors = watchPageErrors(page);
    await signIn(page);

    for (const section of SECTIONS) {
      await page.evaluate((name) => (/** @type {any} */ (window)).switchSection(name), section.name);
      // The correct panel became active…
      await expect(
        page.locator(section.panel),
        `${section.name} panel did not activate`
      ).toHaveClass(/active/);
      // …and rendered something into it.
      await expect(
        page.locator(section.panel),
        `${section.name} panel rendered empty`
      ).not.toBeEmpty();
    }

    expect(errors, `Uncaught errors while switching sections:\n${errors.join('\n')}`).toEqual([]);
  });

  test('quote editor form opens (no quote is created)', async ({ page }) => {
    const errors = watchPageErrors(page);
    await signIn(page);

    await page.evaluate(() => (/** @type {any} */ (window)).switchSection('quote'));
    await expect(page.locator('#panel-quote')).toHaveClass(/active/);
    // The new-quote editor exposes a client picker and a Create button — proving
    // the quote-builder form rendered. We never click Create (that would write).
    await expect(page.locator('#qe-client-picker')).toBeVisible({ timeout: 10_000 });

    expect(errors, `Uncaught errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('order editor form opens (no order is created)', async ({ page }) => {
    const errors = watchPageErrors(page);
    await signIn(page);

    await page.evaluate(() => (/** @type {any} */ (window)).switchSection('orders'));
    await expect(page.locator('#panel-orders')).toHaveClass(/active/);
    await expect(page.locator('#oe-client-picker')).toBeVisible({ timeout: 10_000 });

    expect(errors, `Uncaught errors:\n${errors.join('\n')}`).toEqual([]);
  });
});
