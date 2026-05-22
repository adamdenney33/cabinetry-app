// Inter is the closest web face to the app's system stack
// (-apple-system / Segoe UI). Loaded via @remotion/google-fonts so the still
// renderer waits for the font before painting.
import { loadFont } from '@remotion/google-fonts/Inter';

const loaded = loadFont('normal', {
  weights: ['400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
});

export const FONT = loaded.fontFamily;
export const fontsReady = loaded.waitUntilDone;

// shared text defaults
export const numeric = { fontVariantNumeric: 'tabular-nums' } as const;
