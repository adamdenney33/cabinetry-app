// Editable props, surfaced in Remotion Studio's props panel via the zod schema
// on each Composition and threaded to components through context.
//
// `copy` is one {kicker,title,sub} per slide — edit any slide's text live in
// Studio. In `title`/`sub`, wrap a word in *asterisks* to make it accent-amber,
// and press Enter for a line break.
import React, { createContext, useContext } from 'react';
import { z } from 'zod';
import { zColor, zTextarea } from '@remotion/zod-types';

export const slotSchema = z.object({
  kicker: zTextarea(),
  title: zTextarea(),
  sub: zTextarea(),
});

export const brandSchema = z.object({
  accent: zColor(),
  betaTag: zTextarea(),
  handle: zTextarea(),
  copy: z.array(slotSchema),
});

export type Slot = z.infer<typeof slotSchema>;
export type Brand = z.infer<typeof brandSchema>;

export const EMPTY_SLOT: Slot = { kicker: '', title: '', sub: '' };

export const BRAND_DEFAULT: Brand = {
  accent: '#e8a838',
  betaTag: 'BETA v0.12.0',
  handle: 'ProCabinet.App',
  copy: [],
};

const Ctx = createContext<Brand>(BRAND_DEFAULT);
export const useBrand = () => useContext(Ctx);
export const BrandProvider = Ctx.Provider;
