// Render several 9:16 reels with a single bundle pass.
//   node scripts/render-reels-batch.mjs reel-v2 livelink-reel speed-reel founder-reel
// Output: out/instagram/<id>.mp4 (1080x1920, h264)
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = process.argv.slice(2).map((s) => s.toLowerCase());
if (ids.length === 0) {
  console.error('usage: node scripts/render-reels-batch.mjs <composition-id> [...]');
  process.exit(1);
}

console.log('▶ bundling reels…');
const serveUrl = await bundle({
  entryPoint: join(ROOT, 'remotion-ig', 'reel-entry.ts'),
  publicDir: join(ROOT, 'brand'),
});
const comps = await getCompositions(serveUrl);
mkdirSync(join(ROOT, 'out', 'instagram'), { recursive: true });

for (const id of ids) {
  const composition = comps.find((c) => c.id.toLowerCase() === id);
  if (!composition) {
    console.error(`✗ no composition "${id}" — available: ${comps.map((c) => c.id).join(', ')}`);
    continue;
  }
  const out = join(ROOT, 'out', 'instagram', `${composition.id}.mp4`);
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: out,
    onProgress: ({ progress }) => {
      const pct = Math.round(progress * 100);
      if (pct !== last) {
        last = pct;
        console.log(`${composition.id} ${pct}%`);
      }
    },
  });
  console.log(`✓ ${out}`);
}
console.log('ALLDONE');
process.exit(0);
