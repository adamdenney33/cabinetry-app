// Editable brand props, surfaced in Remotion Studio's props panel via the zod
// schema on each Composition and threaded to components through context.
import React, { createContext, useContext } from 'react';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';

export const brandSchema = z.object({
  accent: zColor(),
  betaTag: z.string(),
  handle: z.string(),
});

export type Brand = z.infer<typeof brandSchema>;

export const BRAND_DEFAULT: Brand = {
  accent: '#e8a838',
  betaTag: 'BETA v0.12.0',
  handle: 'ProCabinet.App',
};

const Ctx = createContext<Brand>(BRAND_DEFAULT);
export const useBrand = () => useContext(Ctx);
export const BrandProvider = Ctx.Provider;
