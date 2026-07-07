/**
 * SectionBreak — 3D interstitial between sections: a large glowing tab icon
 * flies in with perspective, with the section number + feature title.
 * Gives each feature a clear chapter marker (and buys energy between cuts).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Easing } from 'remotion';
import { FONT, C, TabId } from '../theme';
import { TabIcon } from '../icons';
import { EASE_OUT, clampOpts } from '../primitives';

export const SectionBreak: React.FC<{
  n: string;
  title: string;
  sub?: string;
  tab: TabId;
  dur: number;
}> = ({ n, title, sub, tab, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const icon = spring({ frame: frame - 2, fps, config: { damping: 12, mass: 0.7, stiffness: 130 } });
  const ry = interpolate(icon, [0, 1], [78, 0]); // flies in rotated on Y
  const tz = interpolate(icon, [0, 1], [-500, 0]);
  const num = interpolate(frame, [8, 18], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const ttl = interpolate(frame, [12, 24], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const sb = interpolate(frame, [20, 32], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const out = interpolate(frame, [dur - 8, dur], [1, 0], clampOpts);
  const push = 1 + interpolate(frame, [0, dur], [0, 0.05], clampOpts);
  // sweep line
  const sweep = interpolate(frame, [4, dur], [-30, 110], { ...clampOpts, easing: Easing.linear });

  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)', fontFamily: FONT, alignItems: 'center', justifyContent: 'center', opacity: out }}>
      {/* grid floor */}
      <div style={{ position: 'absolute', left: '-30%', right: '-30%', bottom: '-42%', height: '80%', backgroundImage: 'linear-gradient(rgba(232,168,56,0.10) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(232,168,56,0.10) 1.5px, transparent 1.5px)', backgroundSize: '90px 90px', backgroundPosition: `0px ${(frame * 0.8) % 90}px`, transform: 'perspective(900px) rotateX(64deg)', transformOrigin: 'center top', maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 30%, transparent 95%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 30%, transparent 95%)' }} />
      {/* diagonal light sweep */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${sweep}%`, width: 260, background: 'linear-gradient(100deg, rgba(232,168,56,0) 0%, rgba(232,168,56,0.08) 50%, rgba(232,168,56,0) 100%)', transform: 'skewX(-14deg)' }} />

      <div style={{ transform: `scale(${push})`, display: 'flex', alignItems: 'center', gap: 60, perspective: 1100 }}>
        {/* big glowing tab icon */}
        <div
          style={{
            width: 210, height: 210, borderRadius: 42,
            background: 'linear-gradient(150deg, rgba(232,168,56,0.20) 0%, rgba(232,168,56,0.06) 100%)',
            border: '1.5px solid rgba(232,168,56,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C.accent,
            boxShadow: '0 30px 90px rgba(0,0,0,0.6), 0 0 90px rgba(232,168,56,0.28), inset 0 1px 0 rgba(255,255,255,0.12)',
            transform: `rotateY(${ry}deg) translateZ(${tz}px)`,
            opacity: interpolate(icon, [0, 0.3, 1], [0, 1, 1]),
          }}
        >
          <TabIcon tab={tab} size={104} strokeWidth={1.6} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: num, transform: `translateX(${(1 - num) * -24}px)` }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: C.accent, letterSpacing: 2 }}>{n}</span>
            <span style={{ width: 46, height: 2.5, background: C.accent }} />
          </div>
          <div style={{ fontSize: 68, fontWeight: 800, color: '#fff', letterSpacing: -1.8, marginTop: 10, opacity: ttl, transform: `translateY(${(1 - ttl) * 22}px)` }}>{title}</div>
          {sub && <div style={{ fontSize: 25, fontWeight: 600, color: 'rgba(255,255,255,0.62)', marginTop: 12, maxWidth: 760, lineHeight: 1.35, opacity: sb, transform: `translateY(${(1 - sb) * 16}px)` }}>{sub}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
};
