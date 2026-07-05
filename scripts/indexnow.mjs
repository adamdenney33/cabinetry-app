#!/usr/bin/env node
// Pings IndexNow (Bing, Yandex, Seznam, Naver...) with every public URL after
// a deploy, so those engines can crawl changes in minutes instead of waiting
// on their own discovery schedule. Google does not participate in IndexNow —
// GSC sitemap submission covers that engine separately (see docs/SEO.md).
//
// Run from CI only (.github/workflows/deploy.yml, after the Cloudflare Pages
// deploy step) — never wired into the Vite build, so a local `npm run build`
// never pings production indexing from someone's laptop.
//
// The key is a public ownership proof, not a secret: IndexNow checks that
// https://procabinet.app/<key>.txt exists and contains this exact string
// before accepting a submission (see vite.config.mjs INDEXNOW_KEY_FILE /
// seoFilesPlugin, which copies that file into dist/). If the key is ever
// rotated, update both places together.

import { siteUrls, ORIGIN } from './site-urls.mjs';

const INDEXNOW_KEY = '2ca9a129f6b24e39a121200ca7d45482';

async function main() {
  const urlList = siteUrls().map((u) => u.url);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(ORIGIN).host,
      key: INDEXNOW_KEY,
      keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });
  // IndexNow returns 200 or 202 on success; treat anything else as failure.
  if (res.status !== 200 && res.status !== 202) {
    const body = await res.text().catch(() => '');
    throw new Error(`IndexNow submission failed: ${res.status} ${res.statusText} ${body}`);
  }
  console.log(`IndexNow: submitted ${urlList.length} URLs (HTTP ${res.status})`);
}

main().catch((e) => {
  // Best-effort ping to a third-party indexing service — the Cloudflare
  // deploy has already succeeded by the time this runs, so a hiccup here
  // must not fail the whole workflow.
  console.warn('[indexnow] submission failed (non-fatal):', e.message);
});
