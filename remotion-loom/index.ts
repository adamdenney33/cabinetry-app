// Remotion entry for the loom-based customer/IG cuts. Separate root + public
// dir from remotion/ and remotion-ig/ so render scripts never cross-wire.
import { registerRoot } from 'remotion';
import { LoomRoot } from './Root';

registerRoot(LoomRoot);
