// Render every Instagram carousel slide to a PNG.
//   node scripts/render-ig.mjs              # all carousels
//   node scripts/render-ig.mjs flagship     # one carousel by id
// Output: out/instagram/<carousel-id>/slide-NN.png  (1080x1350)

import { bundle } from '@remotion/bundler';
import { getCompositions, renderStill, openBrowser } from '@remotion/renderer';
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'remotion-ig', 'index.ts');
const OUT = join(ROOT, 'out', 'instagram');
const only = process.argv[2]?.toLowerCase() || null;

console.log('▶ bundling remotion-ig…');
const serveUrl = await bundle({
  entryPoint: ENTRY,
  // brand/ is exposed as the public dir in case a slide ever needs staticFile()
  publicDir: join(ROOT, 'brand'),
});

const comps = await getCompositions(serveUrl);
const targets = only ? comps.filter((c) => c.id.toLowerCase() === only) : comps;
if (!targets.length) {
  console.error(`No composition matched "${only}". Available:`, comps.map((c) => c.id).join(', '));
  process.exit(1);
}

const browser = await openBrowser('chrome');
let total = 0;
for (const comp of targets) {
  const dir = join(OUT, comp.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < comp.durationInFrames; f++) {
    const output = join(dir, `slide-${String(f + 1).padStart(2, '0')}.png`);
    await renderStill({
      serveUrl,
      composition: comp,
      frame: f,
      output,
      imageFormat: 'png',
      scale: 1,
      puppeteerInstance: browser,
      overwrite: true,
    });
    total++;
    process.stdout.write(`  ✓ ${comp.id}/slide-${String(f + 1).padStart(2, '0')}.png\n`);
  }
}
await browser.close({ silent: true });
console.log(`\nDone — ${total} slide(s) → ${OUT}/`);
process.exit(0);
