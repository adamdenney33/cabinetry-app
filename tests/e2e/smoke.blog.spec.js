// Blog smoke tests — no credentials required, run everywhere (incl. CI).
//
// What these protect against, in plain terms:
//   • A malformed post (bad frontmatter, broken template) breaking the blog
//     middleware in dev — which is the same loadPosts()/renderPost() code the
//     build uses, so a failure here means the deploy would ship broken pages.
//   • The /blog index or a post page rendering blank or without its byline
//     (the byline is the E-E-A-T anchor every article depends on).
//
// Read-only by design: the blog has no inputs, so these just load and look.

const { test, expect } = require('@playwright/test');

function watchForErrors(page) {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  return { pageErrors };
}

test('blog index renders with posts and no uncaught errors', async ({ page }) => {
  const { pageErrors } = watchForErrors(page);

  await page.goto('/blog');

  await expect(page.locator('h1')).toHaveText(/workshop notes/i);
  // At least one post card, each with a title and a date.
  const firstPost = page.locator('.post-item a').first();
  await expect(firstPost).toBeVisible();
  await expect(firstPost.locator('h2')).not.toBeEmpty();

  expect(pageErrors, `Uncaught errors on /blog:\n${pageErrors.join('\n')}`).toEqual([]);
});

test('a post page renders title, byline and FAQ with no uncaught errors', async ({ page }) => {
  const { pageErrors } = watchForErrors(page);

  // Follow the first post from the index so the test never hard-codes a slug.
  await page.goto('/blog');
  const href = await page.locator('.post-item a').first().getAttribute('href');
  expect(href, 'blog index has no posts').toMatch(/^\/blog\/[\w-]+\/$/);

  await page.goto(href);

  await expect(page.locator('article h1')).not.toBeEmpty();
  // The byline box carries the author + dates on every post.
  await expect(page.locator('.byline-author')).toContainText(/Adam Denney/);
  await expect(page.locator('.byline-dates')).toContainText(/published/i);
  // Every launch article ends with a Common questions section.
  await expect(page.locator('article h2').last()).toHaveText(/common questions|related reading/i);

  expect(pageErrors, `Uncaught errors on ${href}:\n${pageErrors.join('\n')}`).toEqual([]);
});
