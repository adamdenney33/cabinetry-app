// 9:16 reel #4 — the Live link, start to finish from the customer's side.
// Conversion angle: the newest, most differentiated feature + a money payoff.
// Beats: hook (no more PDFs) → send one link → they open it on their phone
// (no login) → tick options, total updates live → chat → pay the deposit →
// you see it instantly → close. Same kit / music / no narration as `reel`.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { C } from './theme';
import { numeric } from './fonts';
import { Amber, Dot, Rise, Pop, KICKER, H1, H1D, SUB, InkBG, LightBG, Pad, Wordmark, musicVolume } from './reel-kit';
import { IcoCheck } from './icons';
import { PhoneShell, CustomerQuote, ChatThread, PaySheet, BusinessPaidCard, IcoLink } from './screens/LiveLink';
import reelMusic from './assets/reel-music.mp3';

// ── Scene 1 — hook ───────────────────────────────────────────────
const SHook: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center' }}>
      <Rise delay={0}>
        <Wordmark light />
      </Rise>
      <Rise delay={6} style={{ marginTop: 60 }}>
        <div style={KICKER}>The Live link</div>
      </Rise>
      <div style={{ marginTop: 22 }}>
        <Rise delay={12}>
          <div style={H1}>Your customer</div>
        </Rise>
        <Rise delay={20}>
          <div style={H1}>
            doesn't want <Amber>a PDF</Amber>
            <Dot />
          </div>
        </Rise>
      </div>
      <Rise delay={32} style={{ marginTop: 28 }}>
        <div style={{ ...SUB, color: 'rgba(255,255,255,0.72)' }}>Send a live quote they can act on instead.</div>
      </Rise>
    </Pad>
  </InkBG>
);

// ── Scene 2 — one link per job ───────────────────────────────────
const SSend: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copied = spring({ frame: frame - 46, fps, config: { damping: 12, mass: 0.6 } });
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>One link per job</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            Sent straight <Amber>from the quote</Amber>
            <Dot />
          </div>
        </Rise>
        <Pop delay={14} style={{ marginTop: 80, alignSelf: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 22,
              padding: '30px 36px',
              boxShadow: '0 30px 80px rgba(17,17,17,0.16)',
            }}
          >
            <IcoLink size={42} color={C.accent} />
            <span style={{ fontSize: 36, fontWeight: 700, color: C.text, ...numeric }}>procabinet.app/q/x7k2m9</span>
            <div
              style={{
                marginLeft: 18,
                background: copied > 0.5 ? C.green : C.accent,
                color: copied > 0.5 ? '#fff' : '#1a1a1a',
                fontSize: 24,
                fontWeight: 800,
                borderRadius: 12,
                padding: '14px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                transform: `scale(${1 + Math.sin(Math.min(1, copied) * Math.PI) * 0.08})`,
              }}
            >
              {copied > 0.5 ? (
                <>
                  <IcoCheck size={24} color="#fff" /> Copied
                </>
              ) : (
                'Copy live link'
              )}
            </div>
          </div>
        </Pop>
        <Rise delay={58} style={{ alignSelf: 'center', marginTop: 54 }}>
          <div style={{ ...SUB, color: C.text2, textAlign: 'center' }}>
            No portal. No login. <Amber>No app to download.</Amber>
          </div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── Scene 3 — they open it on their phone ────────────────────────
const SOpen: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>They open it anywhere</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          The whole quote, <Amber>live</Amber>
          <Dot />
        </div>
      </Rise>
      <Pop delay={14} style={{ marginTop: 48, alignSelf: 'center' }}>
        <PhoneShell w={620}>
          <CustomerQuote />
        </PhoneShell>
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 4 — options tick in/out, total updates ─────────────────
const SOptions: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>Optional items</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          They tick it in — <Amber>it re-prices</Amber>
          <Dot />
        </div>
      </Rise>
      <Pop delay={12} style={{ marginTop: 48, alignSelf: 'center' }}>
        <PhoneShell w={620}>
          <CustomerQuote toggleAt={34} />
        </PhoneShell>
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 5 — chat on the quote page ─────────────────────────────
const SChat: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>Built-in chat</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          Questions? <Amber>Answered there</Amber>
          <Dot />
        </div>
      </Rise>
      <div style={{ marginTop: 90, alignSelf: 'center', width: 800 }}>
        <ChatThread start={18} />
      </div>
    </Pad>
  </LightBG>
);

// ── Scene 6 — they pay the deposit ───────────────────────────────
const SPay: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>Card payments · Stripe</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          And they pay the <Amber>deposit</Amber>
          <Dot />
        </div>
      </Rise>
      <Rise delay={12} style={{ marginTop: 16 }}>
        <div style={{ ...SUB, color: C.text2 }}>Right there on the quote page. No chasing.</div>
      </Rise>
      <Pop delay={16} style={{ marginTop: 80, alignSelf: 'center' }}>
        <PaySheet paidAt={50} />
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 7 — you see it instantly ───────────────────────────────
const SSync: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>Back in your workshop</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          You see it <Amber>the second</Amber> it happens
          <Dot />
        </div>
      </Rise>
      <Pop delay={14} style={{ marginTop: 90, alignSelf: 'center' }}>
        <BusinessPaidCard paidAt={34} />
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 8 — close ──────────────────────────────────────────────
const SCloseScene: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Rise delay={0}>
        <div style={KICKER}>The Live link</div>
      </Rise>
      <Rise delay={8} style={{ marginTop: 22 }}>
        <div style={{ ...H1, fontSize: 84 }}>
          Quotes that
          <br />
          <Amber>close themselves</Amber>
          <Dot />
        </div>
      </Rise>
      <Rise delay={24} style={{ marginTop: 70 }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: '#fff', letterSpacing: '-1px' }}>
          ProCabinet<span style={{ color: C.accent }}>.App</span>
        </div>
        <div
          style={{
            fontSize: 30,
            color: 'rgba(255,255,255,0.72)',
            marginTop: 14,
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IcoCheck size={26} color={C.accent} /> Try it for free - no card required
        </div>
      </Rise>
    </Pad>
  </InkBG>
);

// ── timeline ─────────────────────────────────────────────────────
export const LIVELINK_REEL_FPS = 30;
export const LIVELINK_REEL_DURATION = 822; // ~27.4s
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 90 },
  { c: SSend, from: 90, dur: 96 },
  { c: SOpen, from: 186, dur: 104 },
  { c: SOptions, from: 290, dur: 104 },
  { c: SChat, from: 394, dur: 96 },
  { c: SPay, from: 490, dur: 104 },
  { c: SSync, from: 594, dur: 88 },
  { c: SCloseScene, from: 682, dur: 140 },
];

export const LiveLinkReel: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio src={reelMusic} volume={musicVolume(LIVELINK_REEL_DURATION)} />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
