// Entry for the IG Content Studio compositions (studio-still / studio-reel).
// Used by scripts/render-social-studio.mjs and `npm run studio:social`.
import { registerRoot } from 'remotion';
import { RemotionRoot } from './StudioRoot';

registerRoot(RemotionRoot);
