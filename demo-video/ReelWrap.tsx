/**
 * ReelWrap — 9:16 Instagram reel built from the finished landing ad:
 * the 16:9 render sits full-width in a branded vertical frame (same
 * technique as the loom reels), with the affiliate hook above.
 * Audio comes from the source video (its music track). No footer logo.
 */
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { C, FONT } from './theme';
import { clampOpts, EASE_OUT } from './primitives';

const W = 1080;
const H = 1920;
export const REEL_SPEED = 1.1;
// source: 1800 frames @30 (v10 cut, v8 music) → reel duration
export const REEL_DUR = Math.ceil(1800 / REEL_SPEED);

export const ReelWrap: React.FC = () => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [0, 14], [0, 1], { ...clampOpts, easing: EASE_OUT });

  const vidW = W;
  const vidH = Math.round((vidW * 1080) / 1920); // 608

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT }}>
      {/* grid floor */}
      <div style={{ position: 'absolute', left: '-30%', right: '-30%', bottom: '-20%', height: '46%', backgroundImage: 'linear-gradient(rgba(232,168,56,0.08) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(232,168,56,0.08) 1.5px, transparent 1.5px)', backgroundSize: '80px 80px', backgroundPosition: `0px ${(frame * 0.7) % 80}px`, transform: 'perspective(800px) rotateX(62deg)', transformOrigin: 'center top', maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 35%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 35%, transparent 95%)' }} />

      {/* header — creator / affiliate hook */}
      <div style={{ position: 'absolute', top: 150, left: 0, right: 0, textAlign: 'center', opacity: inT, transform: `translateY(${(1 - inT) * 20}px)` }}>
        <div style={{ fontSize: 48, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>
          📣 CONTENT CREATORS
        </div>
        <div style={{ fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: -1, marginTop: 30, lineHeight: 1.22, padding: '0 70px' }}>
          Our affiliate program is <span style={{ color: C.accent }}>coming soon</span>
        </div>
        <div style={{ fontSize: 24, fontWeight: 600, color: 'rgba(255,255,255,0.62)', marginTop: 20, letterSpacing: 2, textTransform: 'uppercase' }}>
          details in caption
        </div>
      </div>

      {/* the film */}
      <div style={{ position: 'absolute', top: (H - vidH) / 2 + 40, left: 0, width: vidW, height: vidH, borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 110px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)' }}>
        <OffthreadVideo src={staticFile('clips/landing-ad-full.mp4')} playbackRate={REEL_SPEED} style={{ width: '100%', height: '100%' }} />
      </div>

    </AbsoluteFill>
  );
};
