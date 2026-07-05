// Single source of truth for every public, indexable URL on procabinet.app —
// used by seoFilesPlugin (sitemap.xml, in vite.config.mjs) AND indexnow.mjs
// (the IndexNow push notification, run from CI after each deploy). Keeping
// one list means a new blog post or wiki guide reaches both automatically.
//
// /os, /q and /landing.html must NEVER be added here — they're noindexed,
// and submitting a noindexed URL to IndexNow or a sitemap sends a mixed
// signal search engines explicitly warn about.

import { loadPosts } from './blog.mjs';
import { GUIDES } from '../wiki/guides.mjs';

export const ORIGIN = 'https://procabinet.app';

/** @returns {{ url: string, lastmod?: string }[]} every public page, absolute URL, lastmod where known */
export function siteUrls() {
  /** @type {{ url: string, lastmod?: string }[]} */
  const urls = [
    { url: `${ORIGIN}/` },
    { url: `${ORIGIN}/privacy` },
    { url: `${ORIGIN}/terms` },
    { url: `${ORIGIN}/payment-fees` },
  ];
  if (GUIDES.length) {
    urls.push({ url: `${ORIGIN}/wiki/` });
    for (const g of GUIDES) urls.push({ url: `${ORIGIN}/wiki/${g.slug}` });
  }
  const posts = loadPosts();
  if (posts.length) {
    urls.push({ url: `${ORIGIN}/blog/` });
    for (const p of posts) urls.push({ url: `${ORIGIN}${p.url}`, lastmod: p.updated });
  }
  return urls;
}
