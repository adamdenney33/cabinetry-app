/**
 * AdStage — cinematic stage for the landing-page ad. Like Stage, but with a
 * keyframed camera (zoom + pan on the app window), a section kicker label,
 * and a bolder caption treatment. Dynamic camera moves are what make the ad
 * read as "premium SaaS" instead of a flat screen recording.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { BACKDROP, WIN, FONT, C, TabId } from '../theme';
import { AppWindow } from './AppWindow';
import { clampOpts, EASE_OUT } from '../primitives';

const MARGIN_X = 100;
const MARGIN_Y = 96;
export const BASE_SCALE = Math.min((1920 - MARGIN_X) / WIN.width, (1080 - MARGIN_Y) / WIN.height);

const CAM_EASE = Easing.bezier(0.45, 0, 0.15, 1);

/** Camera keyframe: zoom `s` (1 = fit-to-frame) panned so window-local point (x,y) drifts toward centre. */
export type CamKey = { f: number; s: number; x?: number; y?: number };

const useCam = (keys: CamKey[]) => {
  const frame = useCurrentFrame();
  if (!keys || keys.length === 0) return { s: 1, x: WIN.width / 2, y: WIN.height / 2 };
  const fs = keys.map((k) => k.f);
  const opt = { ...clampOpts, easing: CAM_EASE };
  const s = interpolate(frame, fs, keys.map((k) => k.s), opt);
  const x = interpolate(frame, fs, keys.map((k) => k.x ?? WIN.width / 2), opt);
  const y = interpolate(frame, fs, keys.map((k) => k.y ?? WIN.height / 2), opt);
  return { s, x, y };
};

/** Section kicker — "01 · QUOTING" style label, top-left. */
const Kicker: React.FC<{ n: string; label: string; dur: number }> = ({ n, label, dur }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [6, 22], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const out = interpolate(frame, [dur - 12, dur - 2], [1, 0], clampOpts);
  return (
    <div style={{ position: 'absolute', top: 40, left: 56, display: 'flex', alignItems: 'center', gap: 14, opacity: Math.min(t, out), transform: `translateX(${(1 - t) * -18}px)`, background: 'rgba(12,12,14,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>{n}</span>
      <span style={{ width: 34, height: 2, background: C.accent, opacity: 0.9 }} />
      <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: 4, textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
};

/** Bold lower-third ad caption. Optionally swaps text mid-scene via `lines`. */
export const AdCaption: React.FC<{ lines: { at: number; text: React.ReactNode }[]; dur: number }> = ({ lines, dur }) => {
  const frame = useCurrentFrame();
  // Which line is live?
  let idx = -1;
  for (let i = 0; i < lines.length; i++) if (frame >= lines[i].at) idx = i;
  if (idx === -1) return null;
  const start = lines[idx].at;
  const end = idx + 1 < lines.length ? lines[idx + 1].at : dur;
  const inT = interpolate(frame, [start, start + 12], [0, 1], { ...clampOpts, easing: EASE_OUT });
  const outT = interpolate(frame, [end - 10, end - 2], [1, 0], clampOpts);
  const op = Math.min(inT, outT);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 52, display: 'flex', justifyContent: 'center', opacity: op, transform: `translateY(${(1 - inT) * 18}px)`, fontFamily: FONT }}>
      <div style={{ maxWidth: 1400, background: 'rgba(12,12,14,0.78)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 18, padding: '17px 34px', boxShadow: '0 16px 50px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: C.accent, flexShrink: 0, boxShadow: `0 0 16px ${C.accent}` }} />
        <span style={{ color: '#fff', fontSize: 32, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1.28, textAlign: 'center' }}>{lines[idx].text}</span>
      </div>
    </div>
  );
};

export const AdStage: React.FC<{
  activeTab: TabId;
  children: React.ReactNode;
  overlay?: React.ReactNode;
  cam?: CamKey[];
  kicker?: { n: string; label: string };
  lines?: { at: number; text: React.ReactNode }[];
  dur: number;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ activeTab, children, overlay, cam, kicker, lines, dur, fadeIn = 0, fadeOut = 0 }) => {
  const frame = useCurrentFrame();
  const { s, x, y } = useCam(cam ?? []);
  const inOp = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clampOpts) : 1;
  const outOp = fadeOut ? interpolate(frame, [dur - fadeOut, dur], [1, 0], clampOpts) : 1;
  // Pan: shift so the target window point moves toward frame centre as we zoom.
  const dx = (WIN.width / 2 - x) * BASE_SCALE * s;
  const dy = (WIN.height / 2 - y) * BASE_SCALE * s;
  const opacity = Math.min(inOp, outOp);
  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, opacity }}>
      {/* soft accent glow behind the window */}
      <AbsoluteFill style={{ background: `radial-gradient(52% 42% at 50% 46%, rgba(232,168,56,0.10) 0%, rgba(232,168,56,0) 70%)` }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `translate(${dx}px, ${dy}px) scale(${BASE_SCALE * s})`, transformOrigin: 'center center' }}>
          <AppWindow activeTab={activeTab} overlay={overlay}>{children}</AppWindow>
        </div>
      </AbsoluteFill>
      {kicker && <Kicker n={kicker.n} label={kicker.label} dur={dur} />}
      {lines && <AdCaption lines={lines} dur={dur} />}
    </AbsoluteFill>
  );
};
