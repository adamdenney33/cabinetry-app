// Render each section of the horizontal narration demo to its own MP4 file
// in marketing/videos/scenes/. Mirrors the per-scene compositions registered
// in remotion/Root.tsx (w-intro, w-rates, w-builder, w-spec, w-library, w-outro).
//
// Usage:  node remotion/_src/render-scenes.mjs
//         node remotion/_src/render-scenes.mjs intro rates       # subset
//
// Each render runs `npx remotion render` so the same Remotion CLI config
// (h264, CRF 20, etc. — see remotion.config.ts) applies to the per-scene
// outputs as to the master CabinetWorkflow render.

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, '..', '..');
const OUT_DIR = join(ROOT, 'marketing', 'videos', 'scenes');
const ENTRY = 'remotion/index.ts';

// Keep in sync with scenes/index.ts SCENES order — IDs match
// workflowSceneCompositionId() in Root.tsx (Remotion bans underscores in
// composition ids, so we use a `w-` prefix to mirror the `h-` reel scenes).
const SCENES = [
  { compId: 'w-intro',   out: '1-intro.mp4' },
  { compId: 'w-rates',   out: '2-rates.mp4' },
  { compId: 'w-builder', out: '3-builder.mp4' },
  { compId: 'w-spec',    out: '4-spec.mp4' },
  { compId: 'w-library', out: '5-library.mp4' },
  { compId: 'w-outro',   out: '6-outro.mp4' },
];

mkdirSync(OUT_DIR, { recursive: true });

const requested = process.argv.slice(2);
const filter = requested.length
  ? new Set(requested.map((r) => r.toLowerCase()))
  : null;

const matchesFilter = (scene) =>
  !filter ||
  filter.has(scene.compId.toLowerCase()) ||
  filter.has(scene.compId.replace(/^w-/i, '').toLowerCase()) ||
  filter.has(scene.out.replace(/\.mp4$/, '').toLowerCase());

const targets = SCENES.filter(matchesFilter);
if (filter && !targets.length) {
  console.error(
    'No scenes matched. Available:',
    SCENES.map((s) => s.compId.replace(/^w-/, '')).join(', '),
  );
  process.exit(1);
}

let failed = 0;
for (const scene of targets) {
  const outPath = join(OUT_DIR, scene.out);
  console.log(`\n▶  ${scene.compId}  →  ${outPath}`);
  const result = spawnSync(
    'npx',
    ['remotion', 'render', ENTRY, scene.compId, outPath],
    { cwd: ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    failed += 1;
    console.error(`✗  ${scene.compId} failed (exit ${result.status})`);
  } else if (existsSync(outPath)) {
    console.log(`✓  ${scene.out}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} render(s) failed.`);
  process.exit(1);
}
console.log(`\nDone — ${targets.length} scene(s) rendered to ${OUT_DIR}/`);
