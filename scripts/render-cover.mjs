// Render a static reel cover/poster to a PNG thumbnail (for LinkedIn / Meta).
//   node scripts/render-cover.mjs                     # cabinet-reel-cover
//   node scripts/render-cover.mjs cabinet-reel-cover  # by composition id
// Output: out/instagram/<id>.png (1080x1920)
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2] || 'cabinet-reel-cover';

console.log('▶ bundling…');
const serveUrl = await bundle({
  entryPoint: join(ROOT, 'remotion-ig', 'reel-entry.ts'),
  publicDir: join(ROOT, 'brand'),
});
const composition = await selectComposition({ serveUrl, id });
mkdirSync(join(ROOT, 'out', 'instagram'), { recursive: true });
const out = join(ROOT, 'out', 'instagram', `${id}.png`);
await renderStill({ serveUrl, composition, frame: 0, output: out, imageFormat: 'png' });
console.log('✓', out);
process.exit(0);
