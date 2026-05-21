// Constants for the horizontal split reel — 1920×1080 versions of the 6
// scenes from the vertical reel, rendered as standalone files (no master).
// Mirrors the vertical timing exactly so the two formats stay in sync.

import { BRAND } from '../scenes';

export const REEL_H = {
  width: 1920,
  height: 1080,
  fps: 30,
} as const;

export type ReelHSceneSpec = {
  /** Internal id. */
  id: string;
  /** Composition id registered in Root.tsx. */
  compId: string;
  /** Output filename under marketing/videos/reel/. */
  outFile: string;
  /** Length in frames. */
  duration: number;
  /** Human-readable label. */
  label: string;
};

export const REEL_H_SCENES: ReelHSceneSpec[] = [
  { id: 'hook',        compId: 'h-hook',         outFile: '01-hook.mp4',         duration:  90, label: 'Hook'           },
  { id: 'openBuilder', compId: 'h-open-builder', outFile: '02-open-builder.mp4', duration: 120, label: 'Open Builder'   },
  { id: 'specScroll',  compId: 'h-spec-scroll',  outFile: '03-spec-scroll.mp4',  duration: 330, label: 'Spec Scroll'    },
  { id: 'livePrice',   compId: 'h-live-price',   outFile: '04-live-price.mp4',   duration: 150, label: 'Live Price'     },
  { id: 'saveLibrary', compId: 'h-save-library', outFile: '05-save-library.mp4', duration: 120, label: 'Save Library'   },
  { id: 'close',       compId: 'h-close',        outFile: '06-close.mp4',        duration:  90, label: 'Close'          },
];

export { BRAND };
