// Standalone render entry for the loom cuts. The composition declarations live
// in loomCompositions.tsx and are shared with remotion-ig/ReelRoot.tsx so they
// also show up in the IG reel studio (studio:ig-reel).
import React from 'react';
import { LoomCompositions } from './loomCompositions';

export const LoomRoot: React.FC = () => <LoomCompositions />;
