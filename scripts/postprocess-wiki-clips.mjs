// Encode the recorded wiki clips: wiki/recordings/out/<slug>.webm →
// <slug>.mp4 (H.264, faststart — plays before fully downloaded) +
// <slug>-poster.jpg + duration probe. Head-trims each clip at the
// sceneStart point written by scripts/record-wiki-clips.mjs (app boot never
// appears on camera).
//
// ffmpeg/ffprobe: Remotion's bundled binaries (already in node_modules; they
// resolve their dylibs via DYLD_FALLBACK_LIBRARY_PATH — set below). Fallback:
// anything named ffmpeg/ffprobe on PATH (brew install ffmpeg).
//
// USAGE
//   node scripts/postprocess-wiki-clips.mjs                # every out/*.webm
//   node scripts/postprocess-wiki-clips.mjs <slug> [...]   # named clips only

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'wiki', 'recordings', 'out');

const REMOTION_BIN = join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64');
const useBundled = existsSync(join(REMOTION_BIN, 'ffmpeg'));
const FFMPEG = useBundled ? join(REMOTION_BIN, 'ffmpeg') : 'ffmpeg';
const FFPROBE = useBundled ? join(REMOTION_BIN, 'ffprobe') : 'ffprobe';
// The bundled binaries reference their dylibs by bare name.
const ENV = useBundled ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: REMOTION_BIN } : process.env;

/** @param {string} bin @param {string[]} args */
const run = (bin, args) => execFileSync(bin, args, { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });

const named = process.argv.slice(2);
const slugs = named.length
  ? named
  : readdirSync(OUT).filter((f) => f.endsWith('.webm')).map((f) => f.replace(/\.webm$/, ''));

if (!slugs.length) {
  console.error('No recordings in wiki/recordings/out/ — run: npm run wiki:record');
  process.exit(1);
}

for (const slug of slugs) {
  const webm = join(OUT, `${slug}.webm`);
  if (!existsSync(webm)) {
    console.error(`Missing ${webm} — record it first.`);
    process.exit(1);
  }
  const metaPath = join(OUT, `${slug}.meta.json`);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : { sceneStart: 0 };
  const trim = Math.max(0, (meta.sceneStart || 0) - 0.3); // keep a 0.3s breath

  const mp4 = join(OUT, `${slug}.mp4`);
  run(FFMPEG, [
    '-y', '-ss', String(trim), '-i', webm,
    '-an', // silent clips — no audio track at all
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23',
    '-pix_fmt', 'yuv420p', // maximum-compatibility H.264
    '-movflags', '+faststart', // moov atom up front → instant web playback
    mp4,
  ]);

  // Poster from ~1.5s in (past any initial paint). PNG intermediate sidesteps
  // the bundled mjpeg encoder's strict YUV-range check.
  const poster = join(OUT, `${slug}-poster.jpg`);
  run(FFMPEG, ['-y', '-ss', '1.5', '-i', mp4, '-frames:v', '1',
    '-strict', 'unofficial', '-q:v', '3', poster]);

  const duration = parseFloat(run(FFPROBE, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4,
  ]).toString());

  const mb = (statSync(mp4).size / 1024 / 1024).toFixed(1);
  console.log(`  ✓ ${slug}.mp4 — ${duration.toFixed(1)}s, ${mb} MB (+ poster)`);
  if (Number(mb) > 10) console.warn(`    ⚠ over 10 MB — consider tightening the drive script or bumping CRF`);
}
console.log('Done. Next: npm run wiki:publish');
