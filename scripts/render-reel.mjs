// Render the 9:16 reel(s) to MP4.
//   node scripts/render-reel.mjs                # all reels
//   node scripts/render-reel.mjs cabinet-reel   # one by id
// Output: out/instagram/<id>.mp4 (1080x1920, h264)
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2]?.toLowerCase() || null;

console.log('▶ bundling reels…');
const serveUrl = await bundle({
  entryPoint: join(ROOT, 'remotion-ig', 'reel-entry.ts'),
  publicDir: join(ROOT, 'brand'),
});
const comps = await getCompositions(serveUrl);
const targets = only ? comps.filter((c) => c.id.toLowerCase() === only) : comps;
mkdirSync(join(ROOT, 'out', 'instagram'), { recursive: true });

for (const composition of targets) {
  const out = join(ROOT, 'out', 'instagram', `${composition.id}.mp4`);
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: out,
    onProgress: ({ progress }) => process.stdout.write(`\r  ${composition.id} ${Math.round(progress * 100)}%   `),
  });
  console.log(`\n  ✓ ${out}`);
}
console.log('Done.');
process.exit(0);
