/**
 * SectionBreak — 3D interstitial between sections, styled like the app
 * itself: a white surface card with the tab icon on an accent-dim tile
 * (mirrors the app's card + badge language — no glow, no numbering).
 * The card flies in with real perspective depth and holds.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { FONT, C, TabId, RADIUS } from '../theme';
import { TabIcon } from '../icons';
import { EASE_OUT, clampOpts } from '../primitives';

export const SectionBreak: React.FC<{
  title: string;
  sub?: string;
  tab: TabId;
  dur: number;
}> = ({ title, sub, tab, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Deep 3D entrance: card starts far back and rotated, settles flat.
  const fly = spring({ frame: frame - 2, fps, config: { damping: 15, mass: 1.1, stiffness: 70 } });
  const ry = interpolate(fly, [0, 1], [58, 0]);
  const rx = interpolate(fly, [0, 1], [14, 0]);
  const tz = interpolate(fly, [0, 1], [-1150, 0]);
  const ttl = interpolate(frame, [16, 30], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const sb = interpolate(frame, [26, 40], [0, 1], { ...clampOpts, easing: EASE_OUT });
  // Slow residual drift so the hold never feels frozen.
  const drift = interpolate(frame, [30, dur], [0, -4], clampOpts);
  const out = interpolate(frame, [dur - 10, dur], [1, 0], clampOpts);

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      {/* subtle grid floor — same texture as the footage scenes, no glows */}
      <div style={{ position: 'absolute', left: '-30%', right: '-30%', bottom: '-42%', height: '80%', backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)', backgroundSize: '90px 90px', backgroundPosition: `0px ${(frame * 0.8) % 90}px`, transform: 'perspective(900px) rotateX(64deg)', transformOrigin: 'center top', maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 30%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.6) 30%, transparent 95%)' }} />

      <div style={{ perspective: 1400 }}>
        <div
          style={{
            transform: `translateZ(${tz}px) rotateY(${ry}deg) rotateX(${rx + drift * 0.2}deg) translateY(${drift}px)`,
            transformStyle: 'preserve-3d',
            background: '#ffffff',
            borderRadius: RADIUS + 6,
            border: `1px solid ${C.border}`,
            boxShadow: '0 40px 110px rgba(0,0,0,0.55)',
            padding: '46px 64px',
            display: 'flex',
            alignItems: 'center',
            gap: 44,
            minWidth: 900,
            opacity: interpolate(fly, [0, 0.25, 1], [0, 1, 1]),
          }}
        >
          {/* icon tile — app badge language: accent-dim tile, amber icon */}
          <div style={{ width: 150, height: 150, borderRadius: 28, background: C.accentDim, border: `1px solid ${C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, flexShrink: 0 }}>
            <TabIcon tab={tab} size={76} strokeWidth={1.7} />
          </div>
          <div>
            <div style={{ fontSize: 52, fontWeight: 800, color: C.text, letterSpacing: -1.4, opacity: ttl, transform: `translateY(${(1 - ttl) * 16}px)` }}>{title}</div>
            {sub && <div style={{ fontSize: 23, fontWeight: 500, color: C.text2, marginTop: 12, maxWidth: 720, lineHeight: 1.4, opacity: sb, transform: `translateY(${(1 - sb) * 12}px)` }}>{sub}</div>}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
