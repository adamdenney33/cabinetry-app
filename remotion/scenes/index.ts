// Single source of truth for video dimensions + per-scene timing.

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type SceneSpec = {
  id: string;
  /** Length in frames. */
  duration: number;
  /** Optional audio file under public/audio/. Plays for the full scene. */
  audio?: string;
};

// Per-scene durations tuned to Adam Denney's narration timings + ~1-1.5s tail.
// 6 scenes total; intro narration plays over the title card so the viewer
// starts hearing the voice immediately.
//
// Scenes 1 & 2 are "tall sidebar scroll" scenes — they need a bit more time
// to scroll smoothly through every input without feeling rushed.
export const SCENES: SceneSpec[] = [
  { id: 'intro',         duration: 215, audio: 'audio/00-intro.mp3' },  //  7.2s (6.03s audio)
  { id: '01-rates',      duration: 240, audio: 'audio/01-rates.mp3' },  //  8.0s (6.11s audio + scroll tail)
  { id: '02-builder',    duration: 240, audio: 'audio/02-builder.mp3' }, //  8.0s (6.27s audio + scroll tail)
  { id: '03-spec',       duration: 240, audio: 'audio/03-spec.mp3' },  //  8.0s (6.58s audio + typing animation)
  { id: '04-library',    duration: 195, audio: 'audio/04-library.mp3' }, //  6.5s (5.38s audio)
  { id: 'outro',         duration: 45 },                                //  1.5s
];

export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.duration, 0);

/** Start frame of a scene by id (offset from the beginning of the composition). */
export function sceneStart(id: string): number {
  let n = 0;
  for (const s of SCENES) {
    if (s.id === id) return n;
    n += s.duration;
  }
  throw new Error('Unknown scene: ' + id);
}

/** Brand palette pulled from the live app (var(--accent) / var(--bg) / etc.). */
export const BRAND = {
  accent: '#e8a838',
  ink: '#111111',
  paper: '#ffffff',
  surface: '#f6f6f6',
  muted: '#9a9a9a',
};
