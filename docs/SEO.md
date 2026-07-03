# SEO / AEO — operations & checklist

State as shipped 2026-07-03 (see SPEC.md § 13). Code side: robots.txt, llms.txt,
sitemap.xml (generated), 404.html, canonicals + OG + JSON-LD on all public pages,
noindex on `/os` + `/q`, `/blog` static pipeline. This file tracks the parts that
live OUTSIDE the repo (dashboards) and the rules that keep the repo side honest.

## One-time dashboard steps (in order, after the deploy is live)

### 1. Cloudflare — allow AI crawlers  ⬜
Decision (2026-07-03): allow **everything** — answer engines AND training bots.
Until this is done, GPTBot/ClaudeBot/PerplexityBot/ChatGPT-User/Claude-User get
403s and the site cannot appear in AI answers.

1. dash.cloudflare.com → procabinet.app zone → **AI Crawl Control** → Crawlers
   tab → set every listed crawler to **Allow**.
2. Zone → **Security → Settings** (classic dashboard: Security → Bots →
   Configure): set **"Block AI bots" → Do not block**. Ensure **AI Labyrinth**
   is Off.
3. Sanity-check Security → WAF → Custom rules for any hand-made bot rule (none
   expected).

### 2. Cloudflare — turn off managed robots.txt  ⬜
Its `Content-Signal: ai-train=no` contradicts the policy above, and it prepends
onto our real robots.txt.

1. Zone → **AI Crawl Control → Settings** → toggle **"Manage robots.txt"**
   (Content Signals Policy) **Off**.
2. Caching → Configuration → **Purge Cache → Custom** →
   `https://procabinet.app/robots.txt`.
3. Verify: `curl -s https://procabinet.app/robots.txt` is byte-identical to the
   repo file (no prepended block).

### 3. Google Search Console  ⬜
1. search.google.com/search-console → Add property → **Domain** → `procabinet.app`.
2. Copy the TXT value → Cloudflare zone → DNS → Add record: Type `TXT`, Name
   `@`, Content = the value. (Permanent — deleting it un-verifies.)
3. GSC → Verify → **Indexing → Sitemaps** → submit
   `https://procabinet.app/sitemap.xml`.
4. URL Inspection → `https://procabinet.app/` → Request indexing.

### 4. Bing Webmaster Tools  ⬜
bing.com/webmasters → Add site → **Import from Google Search Console** (needs
step 3). Confirm the sitemap imported.

### 5. Post-change verification  ⬜
```sh
for ua in GPTBot ClaudeBot PerplexityBot "ChatGPT-User" "Claude-User"; do
  curl -s -o /dev/null -w "$ua %{http_code}\n" -A "$ua" https://procabinet.app/; done
```
Expect 200s. Caveat: Cloudflare verifies real crawlers by IP, so a spoofed-UA
curl is not authoritative — the real check is AI Crawl Control → Metrics
showing 200s for genuine crawler traffic over the following days. Also run the
Rich Results Test (search.google.com/test/rich-results) on `/` and one blog
post, and Meta's Sharing Debugger → Scrape Again (absolute og:image now).

## Standing rules (repo side)

- **Pricing changes**: the SoftwareApplication JSON-LD offers in landing.html
  and any prices quoted in blog posts must be updated in the SAME commit as the
  pricing cards. llms.txt too.
- **robots.txt must NOT Disallow `/os` or `/q`** — crawlers have to fetch them
  to see the noindex. Blocking them would leave leaked quote URLs indexable as
  URL-only entries.
- **`/os`, `/q`, `/landing.html` never go in the sitemap** (seoFilesPlugin's
  static list guarantees this; don't add them).
- **New blog post** = drop a markdown file in `content/blog/` (frontmatter spec
  in scripts/blog.mjs) → build regenerates pages, sitemap and llms.txt together.
  Malformed frontmatter fails the build on purpose.
- **Comparison posts** (best-cut-list-software) carry "as of July 2026"-style
  dates on competitor claims — review quarterly, bump `updated:` in frontmatter.
- **Founder bio claim** is canonically "ran his own cabinetry workshop for over
  10 years" (decision 2026-07-03) — scripts/blog.mjs SITE.author.bio is the
  source of truth; brand-voice.md matches.
- **No fabricated schema**: never add aggregateRating/review markup — no
  ratings exist.
- **If /q ever moves to path-style URLs** (`/q/<token>`, as the LiveLink
  mockups show): add a `_redirects` rule (`/q/* /q.html 200`) or those links
  404 (404.html disabled the SPA fallback that would have masked it).
- **Re-enabling paid ads**: all Google + Meta campaigns were paused at audit
  time (2026-07-03); the one Google ad's final URL is `https://procabinet.app/`
  (fine). Meta creatives are "existing post" attachments whose destination the
  API token can't read — eyeball each ad's destination URL in Ads Manager
  before re-enabling, now that unknown paths 404 instead of soft-landing on `/`.

## Where things stand (fill in as dashboard steps complete)

| Step | Done | Date |
|------|------|------|
| Deploy (code) | ⬜ | |
| Cloudflare AI crawlers allowed | ⬜ | |
| Managed robots.txt off | ⬜ | |
| GSC verified + sitemap submitted | ⬜ | |
| Bing imported | ⬜ | |
| AI-crawler 200s confirmed in metrics | ⬜ | |
