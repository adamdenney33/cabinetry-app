// Drives all three deliverables off one component: the raw loom plays via
// OffthreadVideo, with the digital Timer (top-left) and SRT Captions overlaid.
// - landscape: full-bleed 16:9 for the customer email, real-time, audio on.
// - reel (9:16) / portrait (4:5): the 16:9 loom sits in a branded ProCabinet
//   frame, sped up, muted (IG autoplays silent — the captions carry it).
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile } from 'remotion';
import { z } from 'zod';
import { C } from '../remotion-ig/theme';
import { Timer } from './Timer';
import { Captions } from './Captions';

export const loomSchema = z.object({
  layout: z.enum(['landscape', 'reel', 'portrait']),
  speed: z.number(),
  muted: z.boolean(),
});
export type LoomProps = z.infer<typeof loomSchema>;

const FONT =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <span style={{ fontSize: size, fontWeight: 900, letterSpacing: -0.5, color: '#fff' }}>
    ProCabinet<span style={{ color: C.accent }}>.App</span>
  </span>
);

// ── full-bleed video with overlays (used by every layout) ──────────────
const Stage: React.FC<{ speed: number; muted: boolean }> = ({ speed, muted }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <OffthreadVideo
      src={staticFile('loom.mp4')}
      playbackRate={speed}
      muted={muted}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  </AbsoluteFill>
);

export const LoomComposition: React.FC<LoomProps> = ({ layout, speed, muted }) => {
  // ── landscape (email) — full-bleed, overlays straight on the footage ──
  if (layout === 'landscape') {
    return (
      <AbsoluteFill style={{ fontFamily: FONT, background: '#000' }}>
        <Stage speed={speed} muted={muted} />
        <div style={{ position: 'absolute', top: 44, left: 44 }}>
          <Timer speed={speed} scale={1} />
        </div>
        <Captions speed={speed} scale={1.05} maxWidth={1480} bottom={56} />
      </AbsoluteFill>
    );
  }

  // ── vertical layouts (reel 9:16 / portrait 4:5) — branded frame ───────
  const reel = layout === 'reel';
  const VW = 1080;
  const VH = reel ? 1920 : 1350;
  const boxMargin = 24;
  const boxW = VW - boxMargin * 2;
  const boxH = Math.round((boxW * 9) / 16);
  const videoTop = reel ? 640 : 372;
  const timerScale = reel ? 0.94 : 0.9;
  const capScale = reel ? 1.18 : 1.04;
  const capBottom = reel ? 248 : 168;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, background: '#0e1116', color: '#fff' }}>
      {/* soft amber glow top-left for depth */}
      <div
        style={{
          position: 'absolute',
          top: -260,
          left: -160,
          width: 720,
          height: 720,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(232,168,56,0.20), transparent 68%)',
        }}
      />

      {/* header */}
      <div style={{ position: 'absolute', top: reel ? 64 : 44, left: 48, right: 48 }}>
        <Wordmark size={reel ? 40 : 36} />
        <div
          style={{
            marginTop: reel ? 34 : 22,
            fontSize: reel ? 66 : 54,
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: -1.5,
          }}
        >
          A full custom cabinet quote,
          <br />
          <span style={{ color: C.accent }}>built &amp; sent</span> in minutes.
        </div>
      </div>

      {/* video box */}
      <div
        style={{
          position: 'absolute',
          top: videoTop,
          left: boxMargin,
          width: boxW,
          height: boxH,
          borderRadius: 22,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
        }}
      >
        <OffthreadVideo
          src={staticFile('loom.mp4')}
          playbackRate={speed}
          muted={muted}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>

      {/* timer — anchored to the video's top-left corner */}
      <div style={{ position: 'absolute', top: videoTop - 30, left: boxMargin + 20 }}>
        <Timer speed={speed} scale={timerScale} />
      </div>

      {/* captions — in the open space below the video */}
      <Captions speed={speed} scale={capScale} maxWidth={boxW - 40} bottom={capBottom} />

      {/* footer CTA */}
      <div
        style={{
          position: 'absolute',
          bottom: reel ? 70 : 46,
          left: 48,
          right: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.72)' }}>
          ProCabinet<span style={{ color: C.accent }}>.App</span>
        </span>
        <span
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: '#0e1116',
            background: C.accent,
            padding: '16px 30px',
            borderRadius: 999,
          }}
        >
          Start free →
        </span>
      </div>
    </AbsoluteFill>
  );
};
