// Reusable social-post template — a flat, non-gradient background variant +
// one uniform text size for every line (no kicker-vs-headline size jump).
// Six approved background variants, chosen from a 10-direction moodboard:
// flat-ink, amber-block, dot-grid, blueprint-grid, diagonal-pinstripes,
// fine-grain. All patterns use hard colour stops (dots/lines/stripes) — no
// smooth gradient blends anywhere.
//
// To reuse for a future post: register a new <Composition> with a different
// variant/emoji/kicker/title (see ReelRoot.tsx `social-*` entries) — no new
// visual code needed. Props are zod-schema'd so they're editable live in
// Remotion Studio.
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { zTextarea } from '@remotion/zod-types';
import { C } from './theme';
import { FONT, numeric } from './fonts';
import { renderRich } from './slide';
import { IconStrip } from './chrome';
import { BASE_CAB } from './screens/Builder';

export const SOCIAL_VARIANTS = [
  'flat-ink',
  'amber-block',
  'dot-grid',
  'blueprint-grid',
  'diagonal-pinstripes',
  'fine-grain',
] as const;
export type SocialVariant = (typeof SOCIAL_VARIANTS)[number];

export const SOCIAL_IMAGES = ['none', 'quote-card', 'icon-strip'] as const;
export type SocialImage = (typeof SOCIAL_IMAGES)[number];

export const socialTemplateSchema = z.object({
  variant: z.enum(SOCIAL_VARIANTS),
  emoji: zTextarea(),
  kicker: zTextarea(),
  title: zTextarea(), // *word* = accent highlight, Enter = line break (renderRich)
  image: z.enum(SOCIAL_IMAGES).default('none'), // optional visual below the headline
});
export type SocialTemplateProps = z.infer<typeof socialTemplateSchema>;

const AMBER = '#e8a838';
const TEAL = '#0d9488';

// hard-stop patterns only — every gradient() call below has 0%→50%/hard
// colour stops or tiles a small repeating dot/line unit, never a soft blend
// (exported so SocialStudio.tsx reuses the exact same backgrounds — single
// source of truth for the template looks)
export const VARIANT: Record<SocialVariant, { bg: React.CSSProperties; inverted?: boolean }> = {
  'flat-ink': { bg: { background: C.ink } },
  'amber-block': { bg: { background: AMBER }, inverted: true },
  'dot-grid': {
    bg: {
      background: C.ink,
      backgroundImage: `radial-gradient(${AMBER} 2px, transparent 2px)`,
      backgroundSize: '34px 34px',
    },
  },
  'blueprint-grid': {
    bg: {
      background: C.ink,
      backgroundImage:
        'linear-gradient(rgba(232,168,56,0.35) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(232,168,56,0.35) 1.5px, transparent 1.5px)',
      backgroundSize: '40px 40px',
    },
  },
  'diagonal-pinstripes': {
    bg: {
      background: C.ink,
      backgroundImage: 'repeating-linear-gradient(45deg, #1c1c1c 0px, #1c1c1c 22px, #111111 22px, #111111 44px)',
    },
  },
  'fine-grain': {
    bg: {
      background: C.ink,
      // sized to match the moodboard preview's dot density at full 1080px
      // resolution (the preview card rendered ~6x smaller, so a proportionally
      // small tile there looked much coarser than the same tile does at
      // full size — scaled up here to match)
      backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 3px, transparent 3px)',
      backgroundSize: '28px 28px',
    },
  },
};

// one size for every line — the deliberate fix from the previous pass, where
// the kicker (30px) and headline (96px) read as two very different weights.
// Sized to match the brand's H1 scale (was previously too small at 50px).
const TEXT: React.CSSProperties = {
  fontSize: 88,
  fontWeight: 800,
  letterSpacing: '-1.5px',
  textTransform: 'uppercase',
  lineHeight: 1.08,
};

// Condensed version of the CabinetReelCover "money shot" — numbers mirror BASE_CAB.
// (exported for SocialStudio.tsx's per-slide `builtin: 'quote-card'` option)
export const QuoteCard: React.FC = () => {
  const d = BASE_CAB;
  const rows: [string, string][] = [
    ['Materials', d.materials],
    [`Labour · ${d.labourNote}`, d.labour],
    [`× ${d.units} units`, d.unitsTotal],
    [`Markup (${d.markupPct})`, d.markupVal],
    [`Tax (${d.taxPct})`, d.taxVal],
  ];
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 30, boxShadow: '0 50px 130px rgba(0,0,0,0.5)', padding: 44 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: C.ink }}>{d.name}</div>
        <div style={{ fontSize: 26, color: C.muted, ...numeric }}>{d.dims}</div>
      </div>
      <div style={{ marginTop: 20, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
        {rows.map(([l, v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 27, color: C.text2 }}>
            <span>{l}</span><span style={{ ...numeric, fontWeight: 600, color: C.ink }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16, paddingTop: 20, borderTop: `2px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '0.5px', color: C.muted }}>TIME</div>
          <div style={{ fontSize: 64, fontWeight: 900, color: C.ink, letterSpacing: '-1.5px', ...numeric }}>9.6 <span style={{ fontSize: 30, fontWeight: 700, color: C.muted }}>hrs</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: '0.5px', color: C.muted }}>TOTAL</div>
          <div style={{ fontSize: 70, fontWeight: 900, color: AMBER, letterSpacing: '-2px', ...numeric }}>{d.price}</div>
        </div>
      </div>
    </div>
  );
};

export const SocialTemplate: React.FC<SocialTemplateProps> = ({ variant, emoji, kicker, title, image = 'none' }) => {
  const v = VARIANT[variant];
  const { height } = useVideoConfig();
  // 4:5 feed crops have less vertical room than 9:16 — shrink the visual, not the text
  const imgZoom = height < 1600 ? 0.68 : 0.92;
  const baseText = v.inverted ? C.ink : '#ffffff';
  const kickerColor = v.inverted ? C.ink : AMBER;
  // renderRich colours *word* via a CSS var (falls back to amber) — on the
  // amber-block variant we override that var to white so the highlight still
  // contrasts against the amber fill instead of disappearing into it
  const accentVarOverride = v.inverted ? { ['--pc-accent' as string]: '#ffffff' } : {};

  return (
    <AbsoluteFill style={{ ...v.bg, fontFamily: FONT }}>
      <AbsoluteFill
        style={{
          padding: '0 80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          ...accentVarOverride,
        }}
      >
        {emoji || kicker ? (
          <div style={{ ...TEXT, color: kickerColor }}>
            {emoji ? `${emoji} ` : ''}
            {kicker}
          </div>
        ) : null}
        <div style={{ ...TEXT, color: baseText, marginTop: emoji || kicker ? 32 : 0 }}>{renderRich(title)}</div>
        {image !== 'none' ? (
          <div style={{ marginTop: 56, zoom: imgZoom } as React.CSSProperties}>
            {image === 'quote-card' ? <QuoteCard /> : <IconStrip light={!v.inverted} size={46} />}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
