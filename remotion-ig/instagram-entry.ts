// Remotion entry for the Instagram carousels. Separate from remotion/index.ts.
// Named `*-entry` (and the root `InstagramRoot.tsx`) so Remotion Studio can
// statically locate the Root file and save edited defaultProps back to code.
import { registerRoot } from 'remotion';
import { RemotionRoot } from './InstagramRoot';

registerRoot(RemotionRoot);
