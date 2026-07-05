# SEO / AEO — operations & checklist

State as shipped 2026-07-03 (see SPEC.md § 13). Code side: robots.txt, llms.txt,
sitemap.xml (generated), 404.html, canonicals + OG + JSON-LD on all public pages,
noindex on `/os` + `/q`, `/blog` static pipeline. This file tracks the parts that
live OUTSIDE the repo (dashboards) and the rules that keep the repo side honest.

## One-time dashboard steps (in order, after the deploy is live)

### 1. Cloudflare — allow AI crawlers  ✅ done 2026-07-03
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

### 2. Cloudflare — turn off managed robots.txt  ✅ done 2026-07-03
Its `Content-Signal: ai-train=no` contradicts the policy above, and it prepends
onto our real robots.txt.

1. Zone → **AI Crawl Control → Settings** → toggle **"Manage robots.txt"**
   (Content Signals Policy) **Off**.
2. Caching → Configuration → **Purge Cache → Custom** →
   `https://procabinet.app/robots.txt`.
3. Verify: `curl -s https://procabinet.app/robots.txt` is byte-identical to the
   repo file (no prepended block).

### 3. Google Search Console  ✅ done 2026-07-03
1. search.google.com/search-console → Add property → **Domain** → `procabinet.app`.
2. Copy the TXT value → Cloudflare zone → DNS → Add record: Type `TXT`, Name
   `@`, Content = the value. (Permanent — deleting it un-verifies.)
3. GSC → Verify → **Indexing → Sitemaps** → submit
   `https://procabinet.app/sitemap.xml`.
4. URL Inspection → `https://procabinet.app/` → Request indexing.

### 4. Bing Webmaster Tools  ✅ done 2026-07-03
Verified: URL Inspection on `/` shows "Indexed successfully", 2 markup types
detected (JSON-LD, OpenGraph). One notice — "alt attribute for images is
missing" on 35 instances — is a false positive: every flagged image is a
decorative nav/feature icon (`brand/icons/individual/*.svg`) always paired
with a visible text label ("Dashboard", "Cut List", etc.), some inside a
parent with `role="img" aria-label="..."` already set. `alt=""` on a
decorative image next to its own text label is the WCAG-correct pattern —
adding real alt text there would double-announce on screen readers. No fix
needed; don't let a future audit "fix" this into a regression.

### 5. Post-change verification  ✅ done 2026-07-03
```sh
for ua in GPTBot ClaudeBot PerplexityBot "ChatGPT-User" "Claude-User" "OAI-SearchBot"; do
  curl -s -o /dev/null -w "$ua %{http_code}\n" -A "$ua" https://procabinet.app/; done
```
All six returned **200** (spoofed-UA curl, so indicative not authoritative —
Cloudflare verifies real crawlers by IP; confirm again via AI Crawl Control →
Metrics once genuine crawler traffic accrues). `robots.txt` confirmed
byte-identical to the repo file, no Cloudflare prepend. Still open: Rich
Results Test on `/` + one blog post, and Meta's Sharing Debugger → Scrape
Again (absolute og:image now).

### 6. IndexNow  ✅ code shipped 2026-07-03 — verify after next deploy
Pushes every public URL to Bing/Yandex/Seznam/Naver so they crawl changes in
minutes instead of on their own schedule. **Google does not participate** —
GSC sitemap submission (step 3) is what covers Google; this is purely
additive for the other engines.

- Key file `2ca9a129f6b24e39a121200ca7d45482.txt` at the repo root, content =
  the key itself (32 hex chars, no trailing newline). Copied into `dist/` by
  `seoFilesPlugin` (`INDEXNOW_KEY_FILE` in vite.config.mjs).
- `scripts/site-urls.mjs` is the single source of truth for "every public
  URL" — both `sitemap.xml` and the IndexNow submission read from it, so a
  new blog post or wiki guide reaches both automatically.
- `scripts/indexnow.mjs` POSTs the list to `api.indexnow.org/indexnow`. Runs
  as a step in `.github/workflows/deploy.yml`, **after** the Cloudflare
  deploy — so a failure there can never block or fail a deploy that already
  shipped (the script itself never throws; it warns and exits 0).
- **Not yet verified live**: IndexNow checks that the key file actually
  resolves at `https://procabinet.app/<key>.txt` before accepting a
  submission, so nothing can be tested until this ships. First real deploy
  after this change will run it automatically — check the Action log for
  "IndexNow: submitted 20 URLs (HTTP 200)" (or 202).
- To rotate the key: delete the old `<key>.txt`, generate a new one
  (`node -e "console.log(crypto.randomUUID().replace(/-/g,''))"`), write the
  new file, and update `INDEXNOW_KEY_FILE` (vite.config.mjs) and
  `INDEXNOW_KEY` (scripts/indexnow.mjs) together — they must always match.

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
| Deploy (code) | ✅ | 2026-07-03 |
| Cloudflare AI crawlers allowed | ✅ | 2026-07-03 |
| Managed robots.txt off | ✅ | 2026-07-03 |
| GSC verified + sitemap submitted | ✅ | 2026-07-03 |
| Bing imported | ✅ | 2026-07-03 |
| AI-crawler 200s confirmed (spoofed-UA curl) | ✅ | 2026-07-03 |
| AI-crawler 200s confirmed in AI Crawl Control → Metrics (real traffic) | ⬜ | |
| Rich Results Test on `/` + one blog post | ⬜ | |
| Meta Sharing Debugger → Scrape Again | ⬜ | |
