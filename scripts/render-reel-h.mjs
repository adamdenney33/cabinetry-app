// Render orchestrator for the horizontal cabinet builder reel.
// Loops through the 6 standalone scenes and shells to `remotion render` for
// each, outputting one MP4 per scene under marketing/videos/reel/.
//
// Usage:
//   npm run render:reel-h
//
// Single-scene re-render:
//   npx remotion render remotion/index.ts h-spec-scroll marketing/videos/reel/03-spec-scroll.mp4

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Source of truth lives in remotion/reel-h/constants.ts. Mirrored here so
// this script stays plain Node (no TS / no bundle step needed to render).
const SCENES = [
  { compId: 'h-hook',         outFile: '01-hook.mp4',         label: 'Hook'         },
  { compId: 'h-open-builder', outFile: '02-open-builder.mp4', label: 'Open Builder' },
  { compId: 'h-spec-scroll',  outFile: '03-spec-scroll.mp4',  label: 'Spec Scroll'  },
  { compId: 'h-live-price',   outFile: '04-live-price.mp4',   label: 'Live Price'   },
  { compId: 'h-save-library', outFile: '05-save-library.mp4', label: 'Save Library' },
  { compId: 'h-close',        outFile: '06-close.mp4',        label: 'Close'        },
];

const OUT_DIR = resolve('marketing/videos/reel');
mkdirSync(OUT_DIR, { recursive: true });

console.log(`\nRendering ${SCENES.length} scenes → ${OUT_DIR}\n`);

let i = 0;
for (const s of SCENES) {
  i += 1;
  const outPath = resolve(OUT_DIR, s.outFile);
  console.log(`[${i}/${SCENES.length}] ${s.label} (${s.compId})`);
  console.log(`    → ${outPath}`);
  try {
    execSync(
      `npx remotion render remotion/index.ts ${s.compId} ${JSON.stringify(outPath)}`,
      { stdio: 'inherit' },
    );
  } catch (err) {
    console.error(`\nFailed rendering ${s.compId}.`);
    process.exitCode = 1;
    throw err;
  }
}

console.log(`\nDone. ${SCENES.length} files written to ${OUT_DIR}.`);
