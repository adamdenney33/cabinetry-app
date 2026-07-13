// Render every `cover-*` social-template still to out/instagram/covers/.
//   node scripts/render-social-covers.mjs            # all 48
//   node scripts/render-social-covers.mjs <filter>   # ids containing <filter>
import { bundle } from '@remotion/bundler';
import { getCompositions, renderStill } from '@remotion/renderer';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const filter = process.argv[2] || '';

console.log('▶ bundling…');
const serveUrl = await bundle({
  entryPoint: join(ROOT, 'remotion-ig', 'reel-entry.ts'),
  publicDir: join(ROOT, 'brand'),
});
const comps = (await getCompositions(serveUrl)).filter(
  (c) => c.id.startsWith('cover-') && c.id.includes(filter),
);
console.log(`▶ rendering ${comps.length} stills…`);
for (const composition of comps) {
  // id = cover-<post>-<variant>-<ratio> → covers/<post>/<ratio>/<variant>.png
  const rest = composition.id.replace(/^cover-/, '');
  const ratio = rest.slice(rest.lastIndexOf('-') + 1);
  const post = rest.slice(0, rest.indexOf('-'));
  const variant = rest.slice(rest.indexOf('-') + 1, rest.lastIndexOf('-'));
  const outDir = join(ROOT, 'out', 'instagram', 'covers', post, ratio);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${variant}.png`);
  await renderStill({ serveUrl, composition, frame: 0, output: out, imageFormat: 'png' });
  console.log('✓', composition.id);
}
process.exit(0);
