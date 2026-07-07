/**
 * ReelWrap — 9:16 Instagram reel built from the finished landing ad:
 * the 16:9 render sits full-width in a branded vertical frame (same
 * technique as the loom reels), with wordmark + hook above and CTA below.
 * Audio comes from the source video (its music track).
 */
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { C, FONT, BRAND } from './theme';
import { clampOpts, EASE_OUT } from './primitives';

const W = 1080;
const H = 1920;
export const REEL_SPEED = 1.1;
// source: 1875 frames @30 → reel duration
export const REEL_DUR = Math.ceil(1875 / REEL_SPEED);

export const ReelWrap: React.FC = () => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [0, 14], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const cta = interpolate(frame, [24, 40], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const pulse = 1 + Math.sin(frame / 22) * 0.01;

  const vidW = W;
  const vidH = Math.round((vidW * 1080) / 1920); // 608

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT }}>
      {/* grid floor */}
      <div style={{ position: 'absolute', left: '-30%', right: '-30%', bottom: '-20%', height: '46%', backgroundImage: 'linear-gradient(rgba(232,168,56,0.08) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(232,168,56,0.08) 1.5px, transparent 1.5px)', backgroundSize: '80px 80px', backgroundPosition: `0px ${(frame * 0.7) % 80}px`, transform: 'perspective(800px) rotateX(62deg)', transformOrigin: 'center top', maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 35%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 35%, transparent 95%)' }} />

      {/* header */}
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: inT, transform: `translateY(${(1 - inT) * 20}px)` }}>
        <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>
          <span style={{ color: '#fff' }}>ProCabinet</span><span style={{ color: C.accent }}>.App</span>
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, color: '#fff', letterSpacing: -1, marginTop: 34, lineHeight: 1.2, padding: '0 60px' }}>
          Quote custom cabinetry <span style={{ color: C.accent }}>in minutes</span>
          <span style={{ color: 'rgba(255,255,255,0.45)' }}> ... not hours</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginTop: 18, letterSpacing: 2.5, textTransform: 'uppercase' }}>
          Full demo · real app
        </div>
      </div>

      {/* the film */}
      <div style={{ position: 'absolute', top: (H - vidH) / 2 + 40, left: 0, width: vidW, height: vidH, borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 110px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
        <OffthreadVideo src={staticFile('clips/landing-ad-full.mp4')} playbackRate={REEL_SPEED} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* CTA */}
      <div style={{ position: 'absolute', bottom: 210, left: 0, right: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, opacity: cta }}>
        <div style={{ background: C.accent, color: '#111', fontSize: 27, fontWeight: 800, padding: '17px 42px', borderRadius: 15, boxShadow: '0 14px 44px rgba(232,168,56,0.45)', transform: `scale(${pulse})` }}>
          Start free — link in bio
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 21, fontWeight: 600 }}>{BRAND.url}</div>
      </div>
    </AbsoluteFill>
  );
};
