// IG Content Studio render runner — consumed by the Cowork "IG Content
// Studio" artifact (via scripts/ig-studio-helper.mjs `render`, which launches
// this detached and tails the log), but also runnable by hand:
//
//   node scripts/render-social-studio.mjs <job.json>
//
// Job file shape (all paths absolute or repo-relative):
//   {
//     "type": "single" | "carousel" | "reel",
//     "slug": "affiliate-launch",            // output folder name
//     "ratio": "1:1" | "4:5" | "9:16" | "1.91:1",
//     "variant": "flat-ink",                 // code variant OR a PNG stem in out/instagram/social-templates/
//     "slides": [{ "kicker": "", "title": "…", "sub": "", "image": "", "builtin": "none" }],
//     "seconds": 12,                          // reel only
//     "audio": "music_… .mp3",                // reel only, filename under marketing/audio
//     "cta": false                            // last slide styled as CTA card
//   }
//
// Output: out/instagram/studio/<slug>/  (<slug>.png | slide-NN.png | <slug>.mp4)
// Last line printed is always `DONE <dir>` or `ERROR: <message>` — the
// artifact polls the log for exactly those markers.
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill, renderMedia, openBrowser } from '@remotion/renderer';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES_DIR = join(ROOT, 'out', 'instagram', 'social-templates');
// keep in sync with SOCIAL_VARIANTS in remotion-ig/SocialTemplate.tsx — any
// variant NOT in this list is resolved as a PNG in the templates folder
const CODE_VARIANTS = ['flat-ink', 'amber-block', 'dot-grid', 'blueprint-grid', 'diagonal-pinstripes', 'fine-grain'];

const die = (msg) => {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
};

const jobPath = process.argv[2];
if (!jobPath) die('usage: node scripts/render-social-studio.mjs <job.json>');
let job;
try {
  job = JSON.parse(readFileSync(jobPath, 'utf8'));
} catch (e) {
  die(`cannot read job file: ${e.message}`);
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const toDataUrl = (p) => {
  const abs = isAbsolute(p) ? p : join(ROOT, p);
  if (!existsSync(abs)) die(`image not found: ${abs}`);
  const mime = MIME[extname(abs).toLowerCase()] || 'image/png';
  return `data:${mime};base64,${readFileSync(abs).toString('base64')}`;
};

// ── job → props ──────────────────────────────────────────────────
const variant = job.variant || 'flat-ink';
let bgData = '';
if (!CODE_VARIANTS.includes(variant)) {
  const png = join(TEMPLATES_DIR, `${variant}.png`);
  const jpg = join(TEMPLATES_DIR, `${variant}.jpg`);
  if (existsSync(png)) bgData = toDataUrl(png);
  else if (existsSync(jpg)) bgData = toDataUrl(jpg);
  else die(`variant "${variant}" is not a code variant and no matching file exists in ${TEMPLATES_DIR}`);
}

const slides = (job.slides || []).map((s) => ({
  kicker: s.kicker || '',
  title: s.title || '',
  sub: s.sub || '',
  imageData: s.image ? toDataUrl(s.image) : '',
  builtin: s.builtin || 'none',
}));
if (!slides.length) die('job has no slides');

const type = job.type || 'single';
const inputProps = {
  ratio: type === 'reel' ? '9:16' : job.ratio || '4:5',
  variant,
  bgData,
  slides: type === 'single' ? slides.slice(0, 1) : slides,
  cta: Boolean(job.cta),
  handle: 'ProCabinet.App',
  seconds: Number(job.seconds) || 12,
  audioFile: job.audio || '',
};

const slug = (job.slug || 'post').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
const outDir = join(ROOT, 'out', 'instagram', 'studio', slug);
mkdirSync(outDir, { recursive: true });

// ── render ───────────────────────────────────────────────────────
console.log(`▶ job: ${type} · ${inputProps.ratio} · ${variant} · ${slides.length} slide(s) → ${outDir}`);

// Bundle cache in /tmp — OUTSIDE the Cowork-synced project folder. Bundling
// reads thousands of node_modules files through the sync layer, which can
// transiently wedge (blocking read() forever — see SPEC.md § 13 2026-07-11);
// a cached bundle sidesteps that exposure and makes every render ~3-5x
// faster. Cache key = every file under remotion-ig/ + marketing/audio/.
const BUNDLE_DIR = '/tmp/procabinet-ig-studio-bundle';
const HASH_FILE = `${BUNDLE_DIR}.hash`;
const bundleHash = () => {
  const h = createHash('sha1');
  const walk = (dir) => {
    for (const f of readdirSync(dir).sort()) {
      const p = join(dir, f);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else h.update(`${p}:${s.size}:${s.mtimeMs};`);
    }
  };
  for (const dir of [join(ROOT, 'remotion-ig'), join(ROOT, 'marketing', 'audio')]) {
    if (existsSync(dir)) walk(dir);
  }
  return h.digest('hex');
};
const hash = bundleHash();
let serveUrl;
if (existsSync(BUNDLE_DIR) && existsSync(HASH_FILE) && readFileSync(HASH_FILE, 'utf8') === hash) {
  serveUrl = BUNDLE_DIR;
  console.log('▶ using cached bundle');
} else {
  console.log('▶ bundling…');
  serveUrl = await bundle({
    entryPoint: join(ROOT, 'remotion-ig', 'studio-entry.ts'),
    outDir: BUNDLE_DIR,
    // audio tracks resolve via staticFile() — only needed for reels but harmless otherwise
    publicDir: join(ROOT, 'marketing', 'audio'),
  });
  writeFileSync(HASH_FILE, hash);
}

const compId = type === 'reel' ? 'studio-reel' : 'studio-still';
const composition = await selectComposition({ serveUrl, id: compId, inputProps });

if (type === 'reel') {
  const out = join(outDir, `${slug}.mp4`);
  console.log(`▶ rendering reel (${inputProps.seconds}s)…`);
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    outputLocation: out,
    inputProps,
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100);
      if (pct >= last + 10) {
        last = pct;
        console.log(`  … ${pct}%`);
      }
    },
  });
  console.log('✓', out);
  // cover still for the library feed + IG cover upload (frame ~0.8s in, after
  // the first beat's Rise animations have landed)
  const coverOut = join(outDir, `${slug}-cover.png`);
  await renderStill({ serveUrl, composition, frame: Math.min(24, composition.durationInFrames - 1), output: coverOut, imageFormat: 'png', inputProps, overwrite: true });
  console.log('✓', coverOut);
} else {
  const browser = await openBrowser('chrome');
  const n = type === 'single' ? 1 : slides.length;
  for (let f = 0; f < n; f++) {
    const out = n === 1 ? join(outDir, `${slug}.png`) : join(outDir, `slide-${String(f + 1).padStart(2, '0')}.png`);
    await renderStill({ serveUrl, composition, frame: f, output: out, imageFormat: 'png', inputProps, puppeteerInstance: browser, overwrite: true });
    console.log('✓', out);
  }
  await browser.close({ silent: true });
}

// post.json — the library's source of truth for this post. Re-renders keep
// the existing usedAt/caption unless the job supplies a fresh caption.
const postPath = join(outDir, 'post.json');
let prev = {};
try { prev = JSON.parse(readFileSync(postPath, 'utf8')); } catch {}
writeFileSync(postPath, JSON.stringify({
  slug,
  type,
  ratio: inputProps.ratio,
  variant,
  slides: job.slides,
  seconds: type === 'reel' ? inputProps.seconds : undefined,
  audio: job.audio || undefined,
  cta: inputProps.cta,
  caption: job.caption || prev.caption || '',
  createdAt: prev.createdAt || Date.now(),
  renderedAt: Date.now(),
  usedAt: prev.usedAt || null,
}, null, 2));

console.log(`DONE ${outDir}`);
process.exit(0);
