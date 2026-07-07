/**
 * Screen3D — the v2 ad's core stage: REAL app footage (OffthreadVideo) inside
 * a browser frame floating in 3D space. Keyframed camera (zoom/pan) + 3D pose
 * (rotateX/rotateY tilt), speed-ramped playback, animated glow/grid backdrop
 * and parallax accent shards. This is what makes the real recordings read as
 * "high-tech SaaS" rather than a flat screen capture.
 */
import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, interpolate, Easing } from 'remotion';
import { C, FONT } from '../theme';
import { clampOpts, EASE_OUT } from '../primitives';

const CAM_EASE = Easing.bezier(0.5, 0, 0.15, 1);

// Source clips are 1440×900 (wiki recording viewport).
export const CLIP_W = 1440;
export const CLIP_H = 900;

/** Pose keyframe: s = scale, x/y = clip-local focus point (px), rx/ry = 3D tilt (deg). */
export type PoseKey = { f: number; s: number; x?: number; y?: number; rx?: number; ry?: number };

const usePose = (keys: PoseKey[]) => {
  const frame = useCurrentFrame();
  const fs = keys.map((k) => k.f);
  const opt = { ...clampOpts, easing: CAM_EASE };
  return {
    s: interpolate(frame, fs, keys.map((k) => k.s), opt),
    x: interpolate(frame, fs, keys.map((k) => k.x ?? CLIP_W / 2), opt),
    y: interpolate(frame, fs, keys.map((k) => k.y ?? CLIP_H / 2), opt),
    rx: interpolate(frame, fs, keys.map((k) => k.rx ?? 0), opt),
    ry: interpolate(frame, fs, keys.map((k) => k.ry ?? 0), opt),
  };
};

/** Animated tech backdrop: perspective grid + drifting accent glows. */
const TechBackdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = (frame * 0.35) % 90;
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 120% at 50% 0%, #1c1c20 0%, #121214 55%, #0a0a0c 100%)' }}>
      {/* floor grid, perspective-tilted */}
      <div
        style={{
          position: 'absolute', left: '-30%', right: '-30%', bottom: '-42%', height: '85%',
          backgroundImage: `linear-gradient(rgba(232,168,56,0.10) 1.5px, transparent 1.5px), linear-gradient(90deg, rgba(232,168,56,0.10) 1.5px, transparent 1.5px)`,
          backgroundSize: '90px 90px',
          backgroundPosition: `0px ${drift}px`,
          transform: 'perspective(900px) rotateX(64deg)',
          transformOrigin: 'center top',
          maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 30%, transparent 95%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.7) 30%, transparent 95%)',
        }}
      />
      {/* drifting glows */}
      <div style={{ position: 'absolute', width: 900, height: 900, borderRadius: '50%', left: 1920 * 0.6 + Math.sin(frame / 55) * 80 - 450, top: -260, background: 'radial-gradient(circle, rgba(232,168,56,0.14) 0%, rgba(232,168,56,0) 62%)' }} />
      <div style={{ position: 'absolute', width: 760, height: 760, borderRadius: '50%', left: 1920 * 0.16 + Math.cos(frame / 70) * 60 - 380, top: 420, background: 'radial-gradient(circle, rgba(13,148,136,0.10) 0%, rgba(13,148,136,0) 60%)' }} />
    </AbsoluteFill>
  );
};

/** Parallax accent shards floating in front/behind the screen. */
const Shards: React.FC<{ seed?: number }> = ({ seed = 0 }) => {
  const frame = useCurrentFrame();
  const shards = [
    { x: 130, y: 200, w: 46, r: 18, sp: 0.35, o: 0.5 },
    { x: 1760, y: 160, w: 30, r: -12, sp: 0.5, o: 0.4 },
    { x: 1820, y: 760, w: 56, r: 30, sp: 0.28, o: 0.35 },
    { x: 90, y: 830, w: 26, r: -25, sp: 0.6, o: 0.45 },
  ];
  return (
    <>
      {shards.map((sh, i) => (
        <div
          key={i}
          style={{
            position: 'absolute', left: sh.x, top: sh.y + Math.sin((frame + seed * 37 + i * 60) / 34) * 14,
            width: sh.w, height: sh.w, opacity: sh.o,
            border: `2px solid ${i % 2 ? C.accent2 : C.accent}`,
            borderRadius: i % 2 ? '50%' : 6,
            transform: `rotate(${sh.r + frame * sh.sp * 0.4}deg)`,
            boxShadow: `0 0 22px ${i % 2 ? 'rgba(13,148,136,0.35)' : 'rgba(232,168,56,0.35)'}`,
          }}
        />
      ))}
    </>
  );
};

/** Section kicker pill. */
export const Kicker3D: React.FC<{ n: string; label: string; dur: number }> = ({ n, label, dur }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [4, 16], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const out = interpolate(frame, [dur - 10, dur - 2], [1, 0], clampOpts);
  return (
    <div style={{ position: 'absolute', top: 38, left: 52, display: 'flex', alignItems: 'center', gap: 13, opacity: Math.min(t, out), transform: `translateX(${(1 - t) * -20}px)`, background: 'rgba(10,10,12,0.78)', border: '1px solid rgba(232,168,56,0.35)', borderRadius: 11, padding: '9px 18px', boxShadow: '0 8px 28px rgba(0,0,0,0.4), 0 0 24px rgba(232,168,56,0.12)', fontFamily: FONT }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>{n}</span>
      <span style={{ width: 28, height: 2, background: C.accent }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.92)', letterSpacing: 3.5, textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
};

/** Fast lower-third caption, swappable mid-scene. */
export const Cap3D: React.FC<{ lines: { at: number; text: React.ReactNode }[]; dur: number }> = ({ lines, dur }) => {
  const frame = useCurrentFrame();
  let idx = -1;
  for (let i = 0; i < lines.length; i++) if (frame >= lines[i].at) idx = i;
  if (idx === -1) return null;
  const start = lines[idx].at;
  const end = idx + 1 < lines.length ? lines[idx + 1].at : dur;
  const inT = interpolate(frame, [start, start + 8], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const outT = interpolate(frame, [end - 7, end - 1], [1, 0], clampOpts);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 46, display: 'flex', justifyContent: 'center', opacity: Math.min(inT, outT), transform: `translateY(${(1 - inT) * 22}px)`, fontFamily: FONT }}>
      <div style={{ maxWidth: 1460, background: 'rgba(10,10,12,0.82)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 15, padding: '14px 30px', boxShadow: '0 14px 46px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 15 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.accent, flexShrink: 0, boxShadow: `0 0 16px ${C.accent}` }} />
        <span style={{ color: '#fff', fontSize: 30, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.25, textAlign: 'center' }}>{lines[idx].text}</span>
      </div>
    </div>
  );
};

export const Screen3D: React.FC<{
  clip: string;              // file under public/clips/
  trimSec?: number;          // head trim (meta sceneStart)
  speed?: number;            // playbackRate — the energy dial
  pose: PoseKey[];
  dur: number;
  fadeIn?: number;
  fadeOut?: number;
  kicker?: { n: string; label: string };
  lines?: { at: number; text: React.ReactNode }[];
  children?: React.ReactNode; // extra overlays (badges, callouts)
  seed?: number;
}> = ({ clip, trimSec = 0, speed = 1, pose, dur, fadeIn = 0, fadeOut = 0, kicker, lines, children, seed }) => {
  const frame = useCurrentFrame();
  const { s, x, y, rx, ry } = usePose(pose);
  const inOp = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clampOpts) : 1;
  const outOp = fadeOut ? interpolate(frame, [dur - fadeOut, dur], [1, 0], clampOpts) : 1;

  // Fit 1440×900 + chrome into 1920×1080 with margin, then apply camera.
  const BASE = Math.min(1760 / CLIP_W, 930 / (CLIP_H + 44));
  const dx = (CLIP_W / 2 - x) * BASE * s;
  const dy = (CLIP_H / 2 - y) * BASE * s;

  return (
    <AbsoluteFill style={{ fontFamily: FONT, opacity: Math.min(inOp, outOp) }}>
      <TechBackdrop />
      <Shards seed={seed} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', perspective: 1500 }}>
        <div
          style={{
            transform: `translate(${dx}px, ${dy}px) scale(${BASE * s}) rotateX(${rx}deg) rotateY(${ry}deg)`,
            transformStyle: 'preserve-3d',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 60px 140px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08), 0 0 80px rgba(232,168,56,0.10)',
            background: '#0f0f11',
          }}
        >
          {/* slim browser chrome */}
          <div style={{ height: 44, background: '#1a1a1d', display: 'flex', alignItems: 'center', padding: '0 18px', gap: 9, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ display: 'flex', gap: 8 }}>
              <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
              <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
              <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
            </span>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 8, height: 27, minWidth: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 500, border: '1px solid rgba(255,255,255,0.09)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3d9970" strokeWidth="2.2"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                procabinet.app
              </div>
            </div>
            <span style={{ width: 62 }} />
          </div>
          <OffthreadVideo
            src={staticFile(`clips/${clip}`)}
            trimBefore={Math.round(trimSec * 30)}
            playbackRate={speed}
            muted
            style={{ width: CLIP_W, height: CLIP_H, display: 'block' }}
          />
          {/* glass sheen */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 28%)' }} />
        </div>
      </AbsoluteFill>
      {/* speed badge — makes the speed-up an intentional flex */}
      {speed > 1.05 && (
        <div style={{ position: 'absolute', top: 40, right: 56, background: 'rgba(10,10,12,0.78)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 10, padding: '8px 15px', color: C.accent, fontSize: 15, fontWeight: 800, letterSpacing: 1, opacity: interpolate(frame, [6, 16], [0, 1], clampOpts) }}>
          {speed}× SPEED · REAL APP
        </div>
      )}
      {kicker && <Kicker3D n={kicker.n} label={kicker.label} dur={dur} />}
      {lines && <Cap3D lines={lines} dur={dur} />}
      {children}
    </AbsoluteFill>
  );
};
