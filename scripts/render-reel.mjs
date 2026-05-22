// Render the 9:16 product reel to MP4.
//   node scripts/render-reel.mjs
// Output: out/instagram/reel.mp4 (1080x1920, h264)
import { bundle } from '@remotion/bundler';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'out', 'instagram', 'reel.mp4');

console.log('▶ bundling reel…');
const serveUrl = await bundle({
  entryPoint: join(ROOT, 'remotion-ig', 'reel-entry.ts'),
  publicDir: join(ROOT, 'brand'),
});
const composition = await selectComposition({ serveUrl, id: 'reel' });
mkdirSync(join(ROOT, 'out', 'instagram'), { recursive: true });

await renderMedia({
  serveUrl,
  composition,
  codec: 'h264',
  outputLocation: OUT,
  onProgress: ({ progress }) => process.stdout.write(`\r  rendering ${Math.round(progress * 100)}%   `),
});
console.log(`\nDone — ${OUT}`);
process.exit(0);
