// Record the /wiki workflow clips by driving the real app in headless
// Chromium (Playwright) with a synthetic cursor overlay — see
// wiki/recordings/_driver.mjs. One webm per guide lands in
// wiki/recordings/out/<slug>.webm (+ <slug>.meta.json with the head-trim
// point); scripts/postprocess-wiki-clips.mjs turns those into faststart MP4s.
//
// PRECONDITIONS
//   1. `npm run dev` running on port 3000 (this script refuses to spawn Vite
//      itself — see the predev note in playwright.config.js).
//   2. The recording account reset: scripts/seed_wiki_account.sql (run via
//      the Supabase SQL editor / MCP). Drive scripts create real rows.
//   3. WIKI_REC_EMAIL / WIKI_REC_PASSWORD in .env.local.
//
// USAGE
//   node scripts/record-wiki-clips.mjs                 # all guides
//   node scripts/record-wiki-clips.mjs <slug> [...]    # named guides only

import { renameSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { REGISTRY } from '../wiki/recordings/index.mjs';
import { loadEnv, signInAndSaveState, makeClipContext, BASE_URL, OUT_DIR, VIEWPORT } from '../wiki/recordings/_driver.mjs';

const slugs = process.argv.slice(2);
const targets = slugs.length ? slugs : Object.keys(REGISTRY);
for (const slug of targets) {
  if (!REGISTRY[slug]) {
    console.error(`Unknown slug "${slug}". Known: ${Object.keys(REGISTRY).join(', ')}`);
    process.exit(1);
  }
}

// Dev server must already be up.
try {
  await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
} catch {
  console.error(`Dev server not reachable at ${BASE_URL} — start it with: npm run dev`);
  process.exit(1);
}

const env = loadEnv();
const browser = await chromium.launch({ headless: true });
try {
  console.log(`Signing in as ${env.WIKI_REC_EMAIL}…`);
  await signInAndSaveState(browser, env);

  for (const slug of targets) {
    console.log(`Recording ${slug}…`);
    const { context, page, meta } = await makeClipContext(browser, slug);
    const video = page.video();
    let failed = null;
    try {
      await REGISTRY[slug].record(page, meta);
    } catch (e) {
      failed = e;
    } finally {
      await context.close(); // finalizes the video file
    }
    const tmpPath = video ? await video.path() : null;
    if (failed) {
      if (tmpPath && existsSync(tmpPath)) rmSync(tmpPath);
      throw new Error(`Drive script "${slug}" failed: ${failed.message || failed}`);
    }
    if (!tmpPath) throw new Error(`No video captured for ${slug}`);
    const dest = join(OUT_DIR, `${slug}.webm`);
    renameSync(tmpPath, dest);
    writeFileSync(join(OUT_DIR, `${slug}.meta.json`), JSON.stringify({
      slug,
      sceneStart: meta.sceneStart,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
    }, null, 2));
    console.log(`  ✓ ${dest} (trim head at ${meta.sceneStart.toFixed(1)}s)`);
  }
} finally {
  await browser.close();
}
console.log('Done. Next: npm run wiki:encode');
