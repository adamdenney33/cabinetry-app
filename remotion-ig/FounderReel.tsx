// 9:16 reel #6 — pricing / Founder-offer urgency. Conversion angle: cost
// anchoring (one wasted sheet vs a month of software) + the scarce Founder
// lifetime deal. Figures mirror landing.html exactly: Free $0 (no card,
// 14 days of Pro), Monthly $25 launch (was $35), Annual $15/mo (was $25),
// Founder $299 once — only 50 ever sold. Same kit / music as `reel`.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { C } from './theme';
import { numeric } from './fonts';
import { Amber, Dot, Rise, Pop, KICKER, H1, H1D, SUB, InkBG, LightBG, Pad, Wordmark, musicVolume } from './reel-kit';
import { IconStrip } from './chrome';
import { IcoCheck } from './icons';
import reelMusic from './assets/reel-music.mp3';

const Tick: React.FC<React.PropsWithChildren<{ light?: boolean; muted?: boolean }>> = ({ children, light, muted }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 24, fontWeight: 600, color: light ? 'rgba(255,255,255,0.85)' : muted ? C.muted : C.text2, padding: '7px 0' }}>
    <IcoCheck size={24} color={C.accent} /> <span>{children}</span>
  </div>
);

// ── Scene 1 — hook: the cost anchor ──────────────────────────────
const SHook: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center' }}>
      <Rise delay={0}>
        <Wordmark light />
      </Rise>
      <Rise delay={6} style={{ marginTop: 60 }}>
        <div style={KICKER}>Do the maths</div>
      </Rise>
      <div style={{ marginTop: 22 }}>
        <Rise delay={12}>
          <div style={H1}>One wasted sheet</div>
        </Rise>
        <Rise delay={20}>
          <div style={H1}>
            costs more than <Amber>this app</Amber>
            <Dot />
          </div>
        </Rise>
      </div>
      <Rise delay={34} style={{ marginTop: 28 }}>
        <div style={{ ...SUB, color: 'rgba(255,255,255,0.72)' }}>
          Mis-cut one £52 sheet a month and you've paid for it twice.
        </div>
      </Rise>
    </Pad>
  </InkBG>
);

// ── Scene 2 — what you get ───────────────────────────────────────
const SWhat: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>Everything, one place</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          Quotes. Cut lists.
          <br />
          Schedule. <Amber>Stock.</Amber>
        </div>
      </Rise>
      <Pop delay={18} style={{ marginTop: 80, alignSelf: 'center' }}>
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 24,
            padding: '38px 46px',
            boxShadow: '0 30px 80px rgba(17,17,17,0.14)',
          }}
        >
          <IconStrip size={46} />
        </div>
      </Pop>
      <Rise delay={34} style={{ alignSelf: 'center', marginTop: 56 }}>
        <div style={{ ...SUB, color: C.text2, textAlign: 'center' }}>
          Eight connected tabs — built <Amber>by a cabinet maker.</Amber>
        </div>
      </Rise>
    </Pad>
  </LightBG>
);

// ── Scene 3 — start free ─────────────────────────────────────────
const SFree: React.FC = () => (
  <LightBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
      <Rise delay={0}>
        <div style={KICKER}>Start free</div>
      </Rise>
      <Rise delay={6} style={{ marginTop: 14 }}>
        <div style={H1D}>
          <Amber>$0.</Amber> No card
          <Dot />
        </div>
      </Rise>
      <Pop delay={14} style={{ marginTop: 70, alignSelf: 'center' }}>
        <div
          style={{
            width: 760,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 26,
            padding: 44,
            boxShadow: '0 40px 100px rgba(17,17,17,0.16)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontSize: 84, fontWeight: 900, color: C.ink, letterSpacing: '-2px', ...numeric }}>$0</span>
            <span style={{ fontSize: 28, color: C.muted, fontWeight: 700 }}>/forever</span>
          </div>
          <div style={{ marginTop: 20 }}>
            <Rise delay={26}><Tick>14 days of Pro to start</Tick></Rise>
            <Rise delay={33}><Tick>Free use of all core functions</Tick></Rise>
            <Rise delay={40}><Tick>Unlimited stock items</Tick></Rise>
            <Rise delay={47}><Tick>No card needed</Tick></Rise>
          </div>
        </div>
      </Pop>
    </Pad>
  </LightBG>
);

// ── Scene 4 — launch pricing ─────────────────────────────────────
const SPlans: React.FC = () => {
  const card = (tier: string, now: string, was: string, note: string, d: number): React.ReactNode => (
    <Pop delay={d}>
      <div
        style={{
          width: 440,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 24,
          padding: 36,
          boxShadow: '0 30px 80px rgba(17,17,17,0.14)',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800, color: C.muted, letterSpacing: '1px', textTransform: 'uppercase' }}>
          {tier}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 10 }}>
          <span style={{ fontSize: 76, fontWeight: 900, color: C.ink, letterSpacing: '-2px', ...numeric }}>{now}</span>
          <span style={{ fontSize: 26, color: C.muted, fontWeight: 700 }}>/mo</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 24, color: C.muted, fontWeight: 600 }}>
          <s>{was}</s> · <span style={{ color: C.accent, fontWeight: 800 }}>launch price</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 20, color: C.text2, fontWeight: 600 }}>{note}</div>
      </div>
    </Pop>
  );
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Launch pricing</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            Less than <Amber>an hour's labour</Amber>
            <Dot />
          </div>
        </Rise>
        <div style={{ display: 'flex', gap: 28, marginTop: 80, alignSelf: 'center' }}>
          {card('Monthly', '$25', '$35/mo', 'First 6 months, then $35/mo', 16)}
          {card('Annual', '$15', '$25/mo', '$180 billed for year one', 24)}
        </div>
        <Rise delay={44} style={{ alignSelf: 'center', marginTop: 46 }}>
          <div style={{ fontSize: 21, color: C.muted, fontWeight: 600 }}>
            Prices in USD — checkout bills in your local currency.
          </div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── Scene 5 — the Founder deal (money shot) ──────────────────────
const SFounder: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flag = spring({ frame: frame - 34, fps, config: { damping: 11, mass: 0.6 } });
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Or never pay again</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            The <Amber>Founder</Amber> deal
            <Dot />
          </div>
        </Rise>
        <Pop delay={14} style={{ marginTop: 76, alignSelf: 'center' }}>
          <div
            style={{
              position: 'relative',
              width: 800,
              background: C.ink,
              borderRadius: 28,
              padding: 48,
              boxShadow: '0 50px 120px rgba(17,17,17,0.45)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: -30,
                right: 36,
                background: C.accent,
                color: '#1a1a1a',
                fontSize: 26,
                fontWeight: 900,
                borderRadius: 14,
                padding: '12px 24px',
                boxShadow: '0 16px 40px rgba(232,168,56,0.50)',
                transform: `scale(${flag}) rotate(${(1 - Math.min(1, flag)) * 6 + 2}deg)`,
              }}
            >
              Only 50 ever sold
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Founder
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 8 }}>
              <span style={{ fontSize: 110, fontWeight: 900, color: C.accent, letterSpacing: '-3px', ...numeric }}>$299</span>
              <span style={{ fontSize: 30, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>once · lifetime</span>
            </div>
            <div style={{ marginTop: 18 }}>
              <Rise delay={28}><Tick light>Pay once, use forever</Tick></Rise>
              <Rise delay={35}><Tick light>Everything in the paid plans</Tick></Rise>
              <Rise delay={42}><Tick light>Feature requests prioritised</Tick></Rise>
              <Rise delay={49}><Tick light>WhatsApp group with the founder</Tick></Rise>
            </div>
          </div>
        </Pop>
      </Pad>
    </LightBG>
  );
};

// ── Scene 6 — close ──────────────────────────────────────────────
const SClose: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Rise delay={0}>
        <div style={KICKER}>50 accounts. Ever.</div>
      </Rise>
      <Rise delay={8} style={{ marginTop: 22 }}>
        <div style={{ ...H1, fontSize: 84 }}>
          When they're gone,
          <br />
          <Amber>they're gone</Amber>
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
          <IcoCheck size={26} color={C.accent} /> Start free — upgrade if it earns it
        </div>
      </Rise>
    </Pad>
  </InkBG>
);

// ── timeline ─────────────────────────────────────────────────────
export const FOUNDER_REEL_FPS = 30;
export const FOUNDER_REEL_DURATION = 678; // ~22.6s
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 100 },
  { c: SWhat, from: 100, dur: 92 },
  { c: SFree, from: 192, dur: 100 },
  { c: SPlans, from: 292, dur: 100 },
  { c: SFounder, from: 392, dur: 116 },
  { c: SClose, from: 508, dur: 170 },
];

export const FounderReel: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio src={reelMusic} volume={musicVolume(FOUNDER_REEL_DURATION)} />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
