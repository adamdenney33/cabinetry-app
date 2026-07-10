// ProCabinet.App — IG Content Studio compositions (still + reel).
// Fully prop-driven versions of the SocialTemplate look so the Cowork
// "IG Content Studio" artifact can render any post type without new visual
// code: any aspect ratio, N carousel slides, or an animated reel of any
// length. Backgrounds come either from a code variant (SocialTemplate's
// exported VARIANT map — single source of truth) or, for template PNGs
// dropped into out/instagram/social-templates/ with no matching code
// variant, from a `bgData` data-URL (scripts/render-social-studio.mjs
// inlines the file). Slide images likewise arrive as data-URLs in props, so
// no publicDir gymnastics are needed for stills.
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { z } from 'zod';
import { zTextarea } from '@remotion/zod-types';
import { C } from './theme';
import { FONT } from './fonts';
import { renderRich } from './slide';
import { VARIANT, QuoteCard, SocialVariant, SOCIAL_VARIANTS } from './SocialTemplate';
import { IconStrip } from './chrome';
import { Rise, Pop, Wordmark, musicVolume } from './reel-kit';

// ── ratios (the standard IG set) ─────────────────────────────────
export const STUDIO_RATIOS = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
  '1.91:1': { width: 1200, height: 628 },
} as const;
export type StudioRatio = keyof typeof STUDIO_RATIOS;

// ── schema ───────────────────────────────────────────────────────
const slideSchema = z.object({
  kicker: zTextarea().default(''),
  title: zTextarea(), // *word* = accent highlight, Enter = line break (renderRich)
  sub: zTextarea().default(''),
  imageData: z.string().default(''), // data URL (screenshot / upload), inlined by the render script
  builtin: z.enum(['none', 'quote-card', 'icon-strip']).default('none'),
});
export type StudioSlide = z.infer<typeof slideSchema>;

export const studioSchema = z.object({
  ratio: z.enum(['1:1', '4:5', '9:16', '1.91:1']).default('4:5'),
  variant: z.string().default('flat-ink'), // code variant id, or a template PNG stem when bgData is set
  bgData: z.string().default(''), // data URL background for folder-only templates
  slides: z.array(slideSchema).min(1),
  cta: z.boolean().default(false), // style the last slide as the follow/CTA card
  handle: z.string().default('ProCabinet.App'),
  // reel-only
  seconds: z.number().min(3).max(90).default(12),
  audioFile: z.string().default(''), // filename under marketing/audio (publicDir when rendering reels)
});
export type StudioProps = z.infer<typeof studioSchema>;

// one uniform text size per ratio (SocialTemplate's deliberate single-size rule)
const TITLE_SIZE: Record<StudioRatio, number> = { '1:1': 76, '4:5': 84, '9:16': 88, '1.91:1': 54 };
const PAD: Record<StudioRatio, string> = {
  '1:1': '0 72px',
  '4:5': '0 76px',
  '9:16': '0 80px',
  '1.91:1': '0 64px',
};

const isCodeVariant = (v: string): v is SocialVariant => (SOCIAL_VARIANTS as readonly string[]).includes(v);

// ── background (code variant or template PNG) ────────────────────
const Bg: React.FC<React.PropsWithChildren<{ variant: string; bgData: string }>> = ({ variant, bgData, children }) => {
  if (bgData && !isCodeVariant(variant)) {
    return (
      <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
        <Img src={bgData} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        {children}
      </AbsoluteFill>
    );
  }
  const v = VARIANT[isCodeVariant(variant) ? variant : 'flat-ink'];
  return <AbsoluteFill style={{ ...v.bg, fontFamily: FONT }}>{children}</AbsoluteFill>;
};

const useInverted = (variant: string, bgData: string): boolean =>
  !bgData && isCodeVariant(variant) ? Boolean(VARIANT[variant].inverted) : false;

// static app-window card (Framed without the Ken Burns drift — stills stay crisp)
const Shot: React.FC<{ src: string }> = ({ src }) => (
  <div
    style={{
      borderRadius: 24,
      overflow: 'hidden',
      border: `1px solid ${C.border}`,
      boxShadow: '0 40px 100px rgba(0,0,0,0.45)',
      background: C.surface,
    }}
  >
    <div
      style={{
        height: 44,
        background: C.surface2,
        borderBottom: `1px solid ${C.borderSoft}`,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 18px',
      }}
    >
      {['#ff5f57', '#febc2e', '#28c840'].map((d) => (
        <span key={d} style={{ width: 13, height: 13, borderRadius: '50%', background: d }} />
      ))}
    </div>
    <Img src={src} style={{ width: '100%', display: 'block' }} />
  </div>
);

// carousel position dots (only rendered when count > 1)
const Dots: React.FC<{ index: number; count: number; inverted: boolean }> = ({ index, count, inverted }) => (
  <div style={{ position: 'absolute', bottom: 54, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12 }}>
    {Array.from({ length: count }, (_, i) => (
      <span
        key={i}
        style={{
          width: i === index ? 30 : 11,
          height: 11,
          borderRadius: 6,
          background:
            i === index ? (inverted ? C.ink : C.accent) : inverted ? 'rgba(17,17,17,0.28)' : 'rgba(255,255,255,0.25)',
        }}
      />
    ))}
  </div>
);

// ── one slide (shared by still + reel; reel wraps pieces in Rise/Pop) ──
const SlideBody: React.FC<{
  s: StudioSlide;
  p: StudioProps;
  index: number;
  count: number;
  animate?: boolean;
}> = ({ s, p, index, count, animate }) => {
  const ratio = p.ratio as StudioRatio;
  const inverted = useInverted(p.variant, p.bgData);
  const size = TITLE_SIZE[ratio];
  const baseText = inverted ? C.ink : '#ffffff';
  const kickerColor = inverted ? C.ink : '#e8a838';
  const accentVarOverride = inverted ? { ['--pc-accent' as string]: '#ffffff' } : {};
  const isCta = p.cta && index === count - 1 && count > 1;
  const TEXT: React.CSSProperties = {
    fontSize: size,
    fontWeight: 800,
    letterSpacing: '-1.5px',
    textTransform: 'uppercase',
    lineHeight: 1.08,
  };
  const W = ({ children, delay = 0 }: React.PropsWithChildren<{ delay?: number }>) =>
    animate ? <Rise delay={delay}>{children}</Rise> : <>{children}</>;
  const hasVisual = Boolean(s.imageData) || s.builtin !== 'none';
  // 4:5/1:1 crops have less vertical room than 9:16 — shrink the visual, not the text
  const imgZoom = ratio === '9:16' ? 0.92 : ratio === '1.91:1' ? 0.42 : 0.68;

  return (
    <AbsoluteFill
      style={{
        padding: PAD[ratio],
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: isCta ? 'center' : 'flex-start',
        textAlign: isCta ? 'center' : 'left',
        ...accentVarOverride,
      }}
    >
      {s.kicker ? (
        <W>
          <div style={{ ...TEXT, color: kickerColor }}>{s.kicker}</div>
        </W>
      ) : null}
      <W delay={8}>
        <div style={{ ...TEXT, color: baseText, marginTop: s.kicker ? 28 : 0 }}>{renderRich(s.title)}</div>
      </W>
      {s.sub ? (
        <W delay={16}>
          <div
            style={{
              fontSize: Math.round(size * 0.36),
              fontWeight: 500,
              lineHeight: 1.45,
              color: inverted ? 'rgba(17,17,17,0.75)' : 'rgba(255,255,255,0.72)',
              marginTop: 30,
              maxWidth: 820,
              textTransform: 'none',
              letterSpacing: '0px',
            }}
          >
            {renderRich(s.sub)}
          </div>
        </W>
      ) : null}
      {hasVisual ? (
        <div style={{ marginTop: 52, width: '100%', zoom: imgZoom } as React.CSSProperties}>
          {animate ? (
            <Pop delay={26}>
              {s.imageData ? <Shot src={s.imageData} /> : s.builtin === 'quote-card' ? <QuoteCard /> : <IconStrip light={!inverted} size={46} />}
            </Pop>
          ) : s.imageData ? (
            <Shot src={s.imageData} />
          ) : s.builtin === 'quote-card' ? (
            <QuoteCard />
          ) : (
            <IconStrip light={!inverted} size={46} />
          )}
        </div>
      ) : null}
      {isCta ? (
        <W delay={20}>
          <div style={{ marginTop: 48 }}>
            <Wordmark light={!inverted} />
          </div>
        </W>
      ) : null}
    </AbsoluteFill>
  );
};

// ── still (single image + carousels: fps 1, frame N = slide N) ──────
export const SocialStudioStill: React.FC<StudioProps> = (p) => {
  const frame = useCurrentFrame();
  const i = Math.min(frame, p.slides.length - 1);
  const inverted = useInverted(p.variant, p.bgData);
  return (
    <Bg variant={p.variant} bgData={p.bgData}>
      <SlideBody s={p.slides[i]} p={p} index={i} count={p.slides.length} />
      {p.slides.length > 1 ? <Dots index={i} count={p.slides.length} inverted={inverted} /> : null}
    </Bg>
  );
};

// ── reel (30fps; slides become evenly-timed animated beats) ─────────
export const REEL_STUDIO_FPS = 30;

export const SocialStudioReel: React.FC<StudioProps> = (p) => {
  const { durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const beat = Math.max(1, Math.floor(durationInFrames / p.slides.length));
  // gentle global fade-out over the last 15 frames
  const fade = Math.min(1, Math.max(0, (durationInFrames - frame) / 15));
  return (
    <Bg variant={p.variant} bgData={p.bgData}>
      <AbsoluteFill style={{ opacity: fade }}>
        {p.slides.map((s, i) => (
          <Sequence
            key={i}
            from={i * beat}
            durationInFrames={i === p.slides.length - 1 ? durationInFrames - i * beat : beat}
          >
            <SlideBody s={s} p={p} index={i} count={p.slides.length} animate />
          </Sequence>
        ))}
      </AbsoluteFill>
      {p.audioFile ? <Audio src={staticFile(p.audioFile)} volume={musicVolume(durationInFrames)} /> : null}
    </Bg>
  );
};
