/**
 * Live Link scene — the customer's side of the story. Mirrors the real /q page
 * (src/quote-public.js): business brand header, line items with photos + spec
 * "Edit" chips, live prices, the two-way chat launcher, and the
 * "Accept & pay deposit" flow ending in an approved state.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { BACKDROP, FONT, C } from '../theme';
import { EASE_OUT, clampOpts, PopIn, fmtMoney, useCount } from '../primitives';
import { AdCaption } from '../components/AdStage';

const BIZ = 'Denney Cabinetry';

// ── timeline beats (frames within the scene) ──
const T = {
  pageIn: 0,
  chatOpen: 96,
  bub1: 116,
  bub2: 152,
  chatClose: 208,
  edit: 224, // customer bumps a spec → price ticks
  accept: 300, // click accept
  approved: 316,
};

const Row: React.FC<{ name: string; meta: string; price: string; delay: number; edited?: boolean; editedAt?: number }> = ({ name, meta, price, delay, edited, editedAt = 0 }) => {
  const frame = useCurrentFrame();
  const showEdited = edited && frame >= editedAt;
  return (
    <PopIn delay={delay} from={0.98}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', background: '#fff', border: `1px solid ${showEdited ? C.accent : '#e4e4e4'}`, borderRadius: 11, marginBottom: 10, boxShadow: showEdited ? `0 0 0 3px ${C.accentDim}` : '0 1px 3px rgba(0,0,0,0.05)' }}>
        {/* photo thumb */}
        <div style={{ width: 46, height: 46, borderRadius: 8, background: 'linear-gradient(135deg,#d8c49a,#b9975f)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7a5f33" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="1.5" /><line x1="12" y1="4" x2="12" y2="20" /><circle cx="9.4" cy="12" r="0.9" fill="#7a5f33" /><circle cx="14.6" cy="12" r="0.9" fill="#7a5f33" /></svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: '#111' }}>{name}</div>
          <div style={{ fontSize: 11.5, color: '#888', marginTop: 2 }}>{meta}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#555', border: '1px solid #ddd', borderRadius: 12, padding: '3px 10px' }}>Edit</span>
        {showEdited && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.accent, background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 12, padding: '3px 9px' }}>Edited</span>
        )}
        <span style={{ fontSize: 16, fontWeight: 800, color: '#111', width: 74, textAlign: 'right' }}>{price}</span>
      </div>
    </PopIn>
  );
};

const Bubble: React.FC<{ me?: boolean; at: number; children: React.ReactNode }> = ({ me, at, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 15, mass: 0.6, stiffness: 160 } });
  if (frame < at) return null;
  return (
    <div style={{ display: 'flex', justifyContent: me ? 'flex-end' : 'flex-start', marginBottom: 8, opacity: interpolate(s, [0, 1], [0, 1]), transform: `scale(${interpolate(s, [0, 1], [0.85, 1])})`, transformOrigin: me ? 'bottom right' : 'bottom left' }}>
      <div style={{ maxWidth: 230, fontSize: 12.5, lineHeight: 1.4, padding: '8px 12px', borderRadius: me ? '13px 13px 3px 13px' : '13px 13px 13px 3px', background: me ? C.accent : '#f0f0f0', color: me ? '#fff' : '#222', fontWeight: 500 }}>{children}</div>
    </div>
  );
};

export const LiveLink: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pageIn = spring({ frame, fps, config: { damping: 15, mass: 0.9, stiffness: 100 } });
  const total = useCount(8450, 8560, T.edit + 6, 20); // customer edit nudges the live total
  const approved = frame >= T.approved;
  const appSpring = spring({ frame: frame - T.approved, fps, config: { damping: 12, mass: 0.7, stiffness: 130 } });
  const chatVisible = frame >= T.chatOpen && frame < T.chatClose + 14;
  const chatOut = interpolate(frame, [T.chatClose, T.chatClose + 12], [1, 0], clampOpts);
  const chatIn = spring({ frame: frame - T.chatOpen, fps, config: { damping: 14, mass: 0.7, stiffness: 140 } });
  const out = interpolate(frame, [dur - 14, dur], [1, 0], clampOpts);
  const camS = interpolate(frame, [0, dur], [1, 1.045], clampOpts);

  // click ripple on accept button
  const clickAge = frame - T.accept;

  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, opacity: out }}>
      <AbsoluteFill style={{ background: `radial-gradient(50% 40% at 50% 45%, rgba(232,168,56,0.12) 0%, rgba(232,168,56,0) 70%)` }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 54, transform: `scale(${camS})` }}>
          {/* ── customer browser card ── */}
          <div style={{ width: 760, borderRadius: 16, overflow: 'hidden', background: '#f6f6f6', boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)', opacity: interpolate(pageIn, [0, 1], [0, 1]), transform: `translateY(${interpolate(pageIn, [0, 1], [40, 0])}px)`, position: 'relative' }}>
            {/* browser bar */}
            <div style={{ height: 38, background: '#e6e6e8', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8, borderBottom: '1px solid #d4d4d6' }}>
              <span style={{ display: 'flex', gap: 7 }}>
                <i style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
                <i style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
                <i style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
              </span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 7, height: 24, minWidth: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#666', fontSize: 12, fontWeight: 500, border: '1px solid #dcdcde' }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3d9970" strokeWidth="2.2"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                  procabinet.app/q/xK92f7
                </div>
              </div>
              <span style={{ width: 48 }} />
            </div>

            {/* page body */}
            <div style={{ padding: '22px 30px 26px', position: 'relative' }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#111', letterSpacing: -0.4 }}>{BIZ}</div>
                <div style={{ fontSize: 12.5, color: '#888', marginTop: 3 }}>Quote QUO-1042 · Mitchell Kitchen Renovation</div>
              </div>

              <Row name="Base Cabinet 600 × 4" meta="600 × 720 × 560 mm · Birch ply · 2 doors" price="£748" delay={14} />
              <Row name="Wall Cabinet 600 × 3" meta="600 × 720 × 320 mm · Birch ply · 2 shelves" price="£581" delay={20} edited editedAt={T.edit + 8} />
              <Row name="Drawer Base 800" meta="800 × 720 × 560 mm · 4 drawers, soft-close" price="£190" delay={26} />

              <PopIn delay={34} from={0.98}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 16px', background: '#111', borderRadius: 11, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Amount to approve <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6, fontSize: 11.5 }}>· updates live as you edit</span></span>
                  <span style={{ fontSize: 21, fontWeight: 800, color: '#fff' }}>{fmtMoney(total)}</span>
                </div>
              </PopIn>

              <PopIn delay={42} from={0.97}>
                <div style={{ position: 'relative', marginTop: 12 }}>
                  <div style={{ background: approved ? C.success : C.accent, color: '#fff', borderRadius: 11, padding: '14px 0', textAlign: 'center', fontSize: 16.5, fontWeight: 800, boxShadow: approved ? '0 10px 30px rgba(61,153,112,0.45)' : '0 10px 30px rgba(232,168,56,0.45)' }}>
                    {approved ? '✓ Quote approved — deposit paid' : 'Accept & pay 25% deposit'}
                  </div>
                  {clickAge >= 0 && clickAge <= 16 && (
                    <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, borderRadius: '50%', border: '2.5px solid rgba(255,255,255,0.95)', transform: `translate(-50%,-50%) scale(${interpolate(clickAge, [0, 16], [1, 9], clampOpts)})`, opacity: interpolate(clickAge, [0, 16], [0.7, 0], clampOpts) }} />
                  )}
                </div>
              </PopIn>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 10 }}>Secure payment · No account needed · Questions? Use the chat ↘</div>

              {/* chat pop */}
              {chatVisible && (
                <div style={{ position: 'absolute', right: 22, bottom: 64, width: 272, background: '#fff', borderRadius: 14, border: '1px solid #e2e2e2', boxShadow: '0 18px 50px rgba(0,0,0,0.25)', overflow: 'hidden', opacity: Math.min(interpolate(chatIn, [0, 1], [0, 1]), chatOut), transform: `translateY(${interpolate(chatIn, [0, 1], [16, 0])}px) scale(${interpolate(chatIn, [0, 1], [0.92, 1])})`, transformOrigin: 'bottom right' }}>
                  <div style={{ background: '#111', color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '9px 14px' }}>{BIZ}</div>
                  <div style={{ padding: '12px 12px 6px' }}>
                    <Bubble at={T.bub1} me>Can the wall cabinets be 320 deep?</Bubble>
                    <Bubble at={T.bub2}>Of course — edit it right on the quote and the price updates instantly 👍</Bubble>
                  </div>
                </div>
              )}

              {/* chat launcher */}
              <div style={{ position: 'absolute', right: 22, bottom: 14, width: 40, height: 40, borderRadius: '50%', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.3)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" /></svg>
              </div>
            </div>
          </div>

          {/* ── side rail: what the business sees ── */}
          <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <PopIn delay={30} from={0.95}>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: C.accent, textTransform: 'uppercase', marginBottom: 10 }}>Your live-link controls</div>
                {[
                  ['Show prices', true],
                  ['Let the client edit specs', true],
                  ['Auto-accept on approval', true],
                  ['Collect a 25% deposit', true],
                ].map(([label, on], i) => (
                  <div key={String(label)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                    <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>{label}</span>
                    <span style={{ width: 34, height: 19, borderRadius: 12, background: on ? C.accent : 'rgba(255,255,255,0.15)', position: 'relative' }}>
                      <i style={{ position: 'absolute', top: 2.5, right: on ? 2.5 : 'auto', left: on ? 'auto' : 2.5, width: 14, height: 14, borderRadius: '50%', background: '#fff' }} />
                    </span>
                  </div>
                ))}
              </div>
            </PopIn>

            {/* approval toast on the business side */}
            {approved && (
              <div style={{ opacity: interpolate(appSpring, [0, 1], [0, 1]), transform: `translateY(${interpolate(appSpring, [0, 1], [18, 0])}px) scale(${interpolate(appSpring, [0, 1], [0.94, 1])})` }}>
                <div style={{ background: 'rgba(61,153,112,0.14)', border: `1px solid ${C.success}`, borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: '#fff' }}>Sarah approved QUO-1042</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>£2,140 deposit paid · order created</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>

      {/* kicker */}
      <div style={{ position: 'absolute', top: 40, left: 56, display: 'flex', alignItems: 'center', gap: 14, opacity: interpolate(frame, [6, 22], [0, 1], { ...clampOpts, easing: EASE_OUT }), background: 'rgba(12,12,14,0.72)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, padding: '10px 20px' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.accent, letterSpacing: 1 }}>02</span>
        <span style={{ width: 34, height: 2, background: C.accent }} />
        <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: 4, textTransform: 'uppercase' }}>The Live Link</span>
      </div>

      <AdCaption
        dur={dur}
        lines={[
          { at: 8, text: <>Send one <b style={{ color: C.accent }}>live link</b> — no PDFs, no email ping-pong.</> },
          { at: T.chatOpen + 8, text: <>Clients chat, tweak specs, and watch the price <b style={{ color: C.accent }}>update live</b>.</> },
          { at: T.accept - 6, text: <>Then they approve and <b style={{ color: C.accent }}>pay the deposit</b> — while you're in the workshop.</> },
        ]}
      />
    </AbsoluteFill>
  );
};
