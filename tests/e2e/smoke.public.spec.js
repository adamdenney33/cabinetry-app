// Logged-OUT smoke tests — no credentials required, run everywhere (incl. CI).
//
// What these protect against, in plain terms:
//   • A syntax error or bad edit in ANY classic script (db.js, app.js, ui.js…)
//     takes the whole bundle down — the app shows a blank screen. One uncaught
//     exception on boot = these fail loudly.
//   • A renamed/moved/missing script file 404s and a feature silently dies.
//   • The login screen — the front door for every customer — stops rendering
//     or the sign-in / create-account toggle breaks.
//
// These are the cheapest, highest-leverage tests in the suite: they need no
// account, no data, and catch the "app is completely broken" class of bug.

const { test, expect } = require('@playwright/test');

// Attach console-error + uncaught-exception + failed-request collectors to a
// page. Uncaught exceptions ("pageerror") and failed app-origin script loads
// are unambiguous bugs, so we assert on those. Console.errors are collected for
// visibility but not asserted (third-party scripts log noise we don't control).
function watchForErrors(page) {
  const pageErrors = [];
  const failedRequests = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    // Only care about our own JS/CSS failing to load, not third-party beacons.
    const url = req.url();
    if (/localhost:3000/.test(url) && /\.(js|css|mjs)(\?|$)/.test(url)) {
      failedRequests.push(`${url} — ${req.failure()?.errorText || 'failed'}`);
    }
  });
  page.on('response', (res) => {
    const url = res.url();
    if (/localhost:3000/.test(url) && /\.(js|css|mjs)(\?|$)/.test(url) && res.status() >= 400) {
      failedRequests.push(`${url} — HTTP ${res.status()}`);
    }
  });
  return { pageErrors, failedRequests };
}

test('app boots and shows the sign-in screen with no uncaught errors', async ({ page }) => {
  const { pageErrors, failedRequests } = watchForErrors(page);

  await page.goto('/');

  // The auth screen is the boot destination for a logged-out visitor. Waiting
  // for the email field proves the app booted far enough to render the front door.
  await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#auth-btn')).toBeVisible();

  // No classic script failed to load — the whole app depends on every one of them.
  expect(failedRequests, `Scripts/styles failed to load:\n${failedRequests.join('\n')}`).toEqual([]);
  // No uncaught exception during boot — one of these blanks the screen for users.
  expect(pageErrors, `Uncaught errors on boot:\n${pageErrors.join('\n')}`).toEqual([]);
});

test('sign-in / create-account toggle switches modes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#auth-email')).toBeVisible({ timeout: 15_000 });

  // Default mode is "create account".
  await expect(page.locator('#auth-heading')).toHaveText(/create your account/i);
  await expect(page.locator('#auth-btn')).toHaveText(/create account/i);

  // Toggle → sign in.
  await page.locator('#auth-toggle span').click();
  await expect(page.locator('#auth-heading')).toHaveText(/sign in/i);
  await expect(page.locator('#auth-btn')).toHaveText(/sign in/i);

  // Toggle back → create account.
  await page.locator('#auth-toggle span').click();
  await expect(page.locator('#auth-heading')).toHaveText(/create your account/i);
});

test('submitting empty credentials shows a validation message', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#auth-btn')).toBeVisible({ timeout: 15_000 });

  // Click submit with both fields empty.
  await page.locator('#auth-btn').click();

  await expect(page.locator('#auth-msg')).toContainText(/email and password required/i);
});
