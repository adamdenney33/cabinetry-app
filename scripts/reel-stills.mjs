// Dev helper: render representative reel frames as stills to /tmp for quick
// visual review without a full video render.
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill, openBrowser } from '@remotion/renderer';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const serveUrl = await bundle({ entryPoint: join(ROOT, 'remotion-ig', 'reel-entry.ts'), publicDir: join(ROOT, 'brand') });
const composition = await selectComposition({ serveUrl, id: process.env.REEL_ID || 'reel' });
const browser = await openBrowser('chrome');
const frames = process.argv.slice(2).map(Number);
const list = frames.length ? frames : [50, 150, 280, 365, 475, 575, 710];
for (const f of list) {
  await renderStill({ serveUrl, composition, frame: f, output: `/tmp/reel-${f}.png`, imageFormat: 'png', puppeteerInstance: browser });
  console.log('frame', f);
}
await browser.close({ silent: true });
process.exit(0);
