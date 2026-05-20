// Single source of truth for the 30s vertical cabinet builder reel.
// Mirrors the role of `remotion/scenes/index.ts` for the horizontal video:
// every scene reads its start frame + duration from here, so retiming the
// whole reel is one edit.

import { BRAND } from '../scenes';

export const REEL = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** 30s @ 30fps. */
  totalFrames: 900,
} as const;

/** Per-scene timing. Sum of durations must equal REEL.totalFrames. */
export type ReelSceneSpec = {
  id: string;
  /** Local label used by Sequence + debug composition ids. */
  label: string;
  /** Start frame within the master composition. */
  start: number;
  /** Length in frames. */
  duration: number;
};

export const REEL_SCENES: ReelSceneSpec[] = [
  { id: 'hook',        label: 'reel-hook',         start:   0, duration:  90 }, // 0:00 → 0:03
  { id: 'openBuilder', label: 'reel-open-builder', start:  90, duration: 120 }, // 0:03 → 0:07
  { id: 'specScroll',  label: 'reel-spec-scroll',  start: 210, duration: 330 }, // 0:07 → 0:18
  { id: 'livePrice',   label: 'reel-live-price',   start: 540, duration: 150 }, // 0:18 → 0:23
  { id: 'saveLibrary', label: 'reel-save-library', start: 690, duration: 120 }, // 0:23 → 0:27
  { id: 'close',       label: 'reel-close',        start: 810, duration:  90 }, // 0:27 → 0:30
];

/** Toggle: when true the master composition mounts an <Audio> with the
 *  reel-music track. Default false so the render works before a soundtrack
 *  exists at remotion/public/audio/reel-music.mp3. */
export const INCLUDE_AUDIO = false;
export const REEL_AUDIO_SRC = 'audio/reel-music.mp3';

/** PhoneFrame geometry — portrait equivalent of BrowserFrame. The content
 *  area sits inside a Mac-style chrome resized for 1080×1920. All vertical
 *  scenes that show app screenshots use these coords. */
export const PHONE_FRAME = {
  outerW: 920,
  outerH: 1500,
  titleBarH: 56,
  /** Top-left of the chrome relative to the 1080×1920 canvas. */
  offsetX: (1080 - 920) / 2,   // 80
  offsetY: 200,                 // generous top room for a hero caption
  /** Content area dims (under the title bar). */
  innerW: 920,
  innerH: 1500 - 56,            // 1444
  /** Top-left of the content area in canvas coords. */
  contentX: (1080 - 920) / 2,   // 80
  contentY: 200 + 56,           // 256
} as const;

/** Re-export so vertical scenes can import everything from one place. */
export { BRAND };
