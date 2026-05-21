// Single source of truth for the vertical reel's editable content.
//
// Why this exists
// ----------------
// Pre-refactor, every scene component (`scenes/Hook.tsx` et al.) hardcoded
// its own copy and accent colors inside JSX. That meant any tweak — "change
// the hook line", "try a different accent" — required a code edit on the
// component itself, and Remotion Studio couldn't surface the values in its
// sidebar.
//
// Now each scene has a zod-typed prop schema exported from here, the scene
// components read those props at runtime, and `Root.tsx` registers each
// standalone Composition with `schema={...}` + `defaultProps={...}`. The
// effect inside Remotion Studio: every editable value shows up as an input
// in the right-side Props panel (text inputs for strings, color picker for
// colors). Edit live → preview re-renders → "Save default" persists the
// value back into this file's REEL_CONTENT object.
//
// Status: Hook scene is wired up (proof-of-concept). The other five scenes
// will follow the same pattern in a follow-up commit.

import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { BRAND } from '../scenes';

// ---------------------------------------------------------------------------
// Scene: Hook
// ---------------------------------------------------------------------------

export const HookSchema = z.object({
  /** First headline line (lands at frame 0 with a spring entrance). */
  line1: z.string(),
  /** Second headline line (slides in around frame 14, gets the underline). */
  line2: z.string(),
  /** Color of the under-mark beneath line2. Defaults to brand amber. */
  accentColor: zColor(),
});

export type HookProps = z.infer<typeof HookSchema>;

// ---------------------------------------------------------------------------
// Reel-wide content
// ---------------------------------------------------------------------------
//
// One object per scene. Keep this in sync with REEL_SCENES in `constants.ts`
// (same ids → same scene). When a scene is wired up to a schema, its entry
// here is what Remotion Studio shows in the Props panel and what the master
// `CabinetBuilderReel` composition passes into the scene component.

export const REEL_CONTENT = {
  hook: {
    line1: 'Quote a cabinet',
    line2: 'without spreadsheets.',
    accentColor: BRAND.accent,
  } satisfies HookProps,
} as const;
