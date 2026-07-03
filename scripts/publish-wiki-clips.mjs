// Publish the encoded wiki clips: upload wiki/recordings/out/<slug>.mp4 +
// <slug>-poster.jpg to the PUBLIC Supabase Storage bucket `wiki-clips`, then
// merge the entries into wiki/clips.json — the committed manifest the wiki
// page generator (scripts/build-wiki.mjs) embeds. Video binaries never enter
// git (see .gitignore); this manifest is the only committed artifact.
//
// AUTH: signs in as the dedicated recording account (WIKI_REC_* in
// .env.local). storage.objects policies allow exactly that account to
// INSERT/UPDATE in wiki-clips — created alongside the bucket (see
// scripts/seed_wiki_account.sql header + SPEC.md § 13); no service-role key
// is kept on this machine. Overwrites are UPDATEs, so the storage
// protect_delete trigger is not in play.
//
// USAGE
//   node scripts/publish-wiki-clips.mjs                 # every out/*.mp4
//   node scripts/publish-wiki-clips.mjs <slug> [...]    # named clips only
// After publishing, rebuild (npm run build) so pages pick the clips up.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'wiki', 'recordings', 'out');
const MANIFEST = join(ROOT, 'wiki', 'clips.json');
const BUCKET = 'wiki-clips';
const WIDTH = 1440;
const HEIGHT = 900;

// .env.local loader (same pattern as wiki/recordings/_driver.mjs).
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'WIKI_REC_EMAIL', 'WIKI_REC_PASSWORD']) {
  if (!env[k]) { console.error(`Missing ${k} in .env.local`); process.exit(1); }
}

// ffprobe for durations — Remotion's bundled binary, PATH fallback.
const REMOTION_BIN = join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
const useBundled = existsSync(join(REMOTION_BIN, 'ffprobe'));
const FFPROBE = useBundled ? join(REMOTION_BIN, 'ffprobe') : 'ffprobe';
const PROBE_ENV = useBundled ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: REMOTION_BIN } : process.env;
/** @param {string} file */
const probeDuration = (file) => parseFloat(execFileSync(FFPROBE,
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
  { env: PROBE_ENV }).toString());

const named = process.argv.slice(2);
const slugs = named.length
  ? named
  : readdirSync(OUT).filter((f) => f.endsWith('.mp4')).map((f) => f.replace(/\.mp4$/, ''));
if (!slugs.length) {
  console.error('No encoded clips in wiki/recordings/out/ — run: npm run wiki:encode');
  process.exit(1);
}

const authClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: authData, error: authErr } = await authClient.auth.signInWithPassword({
  email: env.WIKI_REC_EMAIL,
  password: env.WIKI_REC_PASSWORD,
});
if (authErr || !authData.session) { console.error(`Sign-in failed: ${authErr?.message}`); process.exit(1); }
// Storage writes need the USER's JWT in the Authorization header, and the
// storage sub-client doesn't reliably pick up a session established after
// createClient (the same gotcha that forced business-assets uploads through
// an edge function). Pin the token explicitly on a fresh client.
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${authData.session.access_token}` } },
});

const base = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
const ver = Date.now(); // cache-bust: URLs are ?v=-stamped per publish

for (const slug of slugs) {
  const mp4 = join(OUT, `${slug}.mp4`);
  const poster = join(OUT, `${slug}-poster.jpg`);
  if (!existsSync(mp4) || !existsSync(poster)) {
    console.error(`Missing ${slug}.mp4 / ${slug}-poster.jpg — run: npm run wiki:encode`);
    process.exit(1);
  }
  for (const [file, name, type] of [
    [mp4, `${slug}.mp4`, 'video/mp4'],
    [poster, `${slug}-poster.jpg`, 'image/jpeg'],
  ]) {
    const { error } = await sb.storage.from(BUCKET).upload(name, readFileSync(file), {
      contentType: type,
      upsert: true, // re-publish = overwrite in place (UPDATE, not DELETE)
      cacheControl: '31536000',
    });
    if (error) { console.error(`Upload failed for ${name}: ${error.message}`); process.exit(1); }
  }
  manifest[slug] = {
    clip: `${base}/${slug}.mp4?v=${ver}`,
    poster: `${base}/${slug}-poster.jpg?v=${ver}`,
    durationSec: Math.round(probeDuration(mp4) * 10) / 10,
    width: WIDTH,
    height: HEIGHT,
    uploadDate: new Date().toISOString().slice(0, 10),
  };
  console.log(`  ✓ published ${slug} (${manifest[slug].durationSec}s)`);
}

// Merge-write so partial re-publishes never drop other slugs' entries.
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Manifest updated: wiki/clips.json (${Object.keys(manifest).length} clips). Rebuild to embed: npm run build`);
