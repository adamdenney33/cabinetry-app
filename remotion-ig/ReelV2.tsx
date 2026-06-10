// 9:16 overview reel v2 — the performing "workshop OS" reel with the two
// features shipped since it went live: the customer Live link (send a link,
// not a PDF) and card payments on the quote page. Scenes 1–6 + close are
// reused verbatim from Reel.tsx so the winning pacing/look is untouched;
// the two new scenes slot in between pipeline and close.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, spring } from 'remotion';
import { C } from './theme';
import { SHook, STabs, SPrice, SCut, SSchedule, SPipeline, SClose } from './Reel';
import { Rise, Pop, KICKER, H1D, SUB, LightBG, Pad, musicVolume } from './reel-kit';
import { PhoneShell, CustomerQuote, PaySheet } from './screens/LiveLink';
import reelMusic from './assets/reel-music.mp3';

const Amber: React.FC<React.PropsWithChildren> = ({ children }) => <span style={{ color: C.accent }}>{children}</span>;
const Dot: React.FC = () => <span style={{ color: C.accent }}>.</span>;

// ── NEW Scene 7 — Live link (customer page) ──────────────────────
const SLiveLink: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>New — Live link</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          Send a link, <Amber>not a PDF</Amber>
          <Dot />
        </div>
      </Rise>
      <Rise delay={12} style={{ marginTop: 16 }}>
        <div style={{ ...SUB, color: C.text2 }}>Customers tick options in or out — the total updates live.</div>
      </Rise>
      <Pop delay={16} style={{ marginTop: 44, alignSelf: 'center' }}>
        <PhoneShell w={620}>
          <CustomerQuote toggleAt={40} />
        </PhoneShell>
      </Pop>
    </Pad>
  </LightBG>
);

// ── NEW Scene 8 — get paid on the quote page ─────────────────────
const SPaid: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const badge = spring({ frame: frame - 56, fps, config: { damping: 12 } });
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Get paid</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            Approved. <Amber>Paid.</Amber> Done
            <Dot />
          </div>
        </Rise>
        <Rise delay={12} style={{ marginTop: 16 }}>
          <div style={{ ...SUB, color: C.text2 }}>They sign off and pay the deposit by card — right on the quote.</div>
        </Rise>
        <Pop delay={16} style={{ marginTop: 70, alignSelf: 'center' }}>
          <PaySheet paidAt={48} />
        </Pop>
        <Rise delay={62} style={{ alignSelf: 'center', marginTop: 56, opacity: badge }}>
          <div
            style={{
              fontSize: 27,
              fontWeight: 800,
              color: C.green,
              background: C.greenDim,
              border: '1px solid rgba(61,153,112,0.35)',
              borderRadius: 14,
              padding: '14px 26px',
            }}
          >
            Your quote card updates the second it happens
          </div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── timeline — winning pacing + 2 new beats ──────────────────────
export const REEL_V2_FPS = 30;
export const REEL_V2_DURATION = 978; // ~32.6s
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 96 },
  { c: STabs, from: 96, dur: 104 },
  { c: SPrice, from: 200, dur: 116 },
  { c: SCut, from: 316, dur: 104 },
  { c: SSchedule, from: 420, dur: 104 },
  { c: SPipeline, from: 524, dur: 100 },
  { c: SLiveLink, from: 624, dur: 110 },
  { c: SPaid, from: 734, dur: 104 },
  { c: SClose, from: 838, dur: 140 },
];

export const ReelV2: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio src={reelMusic} volume={musicVolume(REEL_V2_DURATION)} />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
