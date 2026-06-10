// 9:16 reel #5 — quoting pain/speed. Conversion angle: the evening-spreadsheet
// pain every shop owner knows, resolved by rates → live price → quote sent in
// minutes. (The quoting angle had the account's best CTR.) Beats: hook (9pm)
// → set rates once → type the cabinet in → a whole kitchen prices itself →
// send it tonight → close (evenings back). Same kit / music as `reel`.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { C } from './theme';
import { numeric } from './fonts';
import { Amber, Dot, Rise, Pop, KICKER, H1, H1D, SUB, InkBG, LightBG, Pad, Wordmark, musicVolume } from './reel-kit';
import { IcoClock, IcoCheck, IcoArrowRight } from './icons';
import reelMusic from './assets/reel-music.mp3';

// ── Scene 1 — hook: it's 9pm ─────────────────────────────────────
const SHook: React.FC = () => {
  const frame = useCurrentFrame();
  const mins = 47 + Math.floor(interpolate(frame, [10, 80], [0, 9], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <InkBG>
      <Pad style={{ justifyContent: 'center' }}>
        <Rise delay={0}>
          <Wordmark light />
        </Rise>
        <Rise delay={8} style={{ marginTop: 60 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <IcoClock size={44} color={C.accent} />
            <span style={{ fontSize: 56, fontWeight: 900, color: C.accent, letterSpacing: '-1px', ...numeric }}>
              9:{mins} PM
            </span>
          </div>
        </Rise>
        <div style={{ marginTop: 26 }}>
          <Rise delay={14}>
            <div style={H1}>Still pricing</div>
          </Rise>
          <Rise delay={22}>
            <div style={H1}>
              jobs <Amber>at night?</Amber>
            </div>
          </Rise>
        </div>
        <Rise delay={34} style={{ marginTop: 28 }}>
          <div style={{ ...SUB, color: 'rgba(255,255,255,0.72)' }}>
            Ten hours in the shop, then two more on a spreadsheet.
          </div>
        </Rise>
      </Pad>
    </InkBG>
  );
};

// ── Scene 2 — set your rates once ────────────────────────────────
const SRates: React.FC = () => {
  const rows: [string, string][] = [
    ['Shop rate', '£45 /hr'],
    ['Markup', '35%'],
    ['18mm MFC sheet', '£52'],
    ['Hinges · soft-close', '£3.80'],
  ];
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Step 1 — once, ever</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            Set your rates <Amber>once</Amber>
            <Dot />
          </div>
        </Rise>
        <Pop delay={14} style={{ marginTop: 70, alignSelf: 'center' }}>
          <div
            style={{
              width: 780,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 24,
              boxShadow: '0 40px 100px rgba(17,17,17,0.18)',
              padding: 40,
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 800, color: C.ink }}>My Rates</div>
            <div style={{ marginTop: 16 }}>
              {rows.map(([l, v], i) => (
                <Rise key={l} delay={20 + i * 7}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '17px 0',
                      borderTop: i === 0 ? 'none' : `1px solid ${C.borderSoft}`,
                      fontSize: 28,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: C.text2 }}>{l}</span>
                    <span style={{ fontWeight: 800, color: C.ink, ...numeric }}>{v}</span>
                  </div>
                </Rise>
              ))}
            </div>
          </div>
        </Pop>
        <Rise delay={56} style={{ alignSelf: 'center', marginTop: 50 }}>
          <div style={{ ...SUB, color: C.text2 }}>
            Your labour, your materials, your margins — <Amber>not ours.</Amber>
          </div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── Scene 3 — type the cabinet in ────────────────────────────────
const SBuild: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fields: [string, string, number][] = [
    ['Width', '600', 16],
    ['Height', '720', 26],
    ['Depth', '560', 36],
  ];
  const price = spring({ frame: frame - 52, fps, config: { damping: 13, mass: 0.6 } });
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Step 2 — the cabinet</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            Type it in<Dot />
          </div>
        </Rise>
        <div style={{ display: 'flex', gap: 24, marginTop: 80, alignSelf: 'center' }}>
          {fields.map(([label, v, d]) => (
            <Pop key={label} delay={d}>
              <div
                style={{
                  width: 250,
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: 18,
                  padding: '22px 26px',
                  boxShadow: '0 18px 50px rgba(17,17,17,0.12)',
                }}
              >
                <div style={{ fontSize: 20, color: C.muted, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 52, fontWeight: 900, color: C.ink, marginTop: 6, ...numeric }}>
                  {v}
                  <span style={{ fontSize: 24, color: C.muted, fontWeight: 700 }}> mm</span>
                </div>
              </div>
            </Pop>
          ))}
        </div>
        <div style={{ alignSelf: 'center', marginTop: 60, opacity: Math.min(1, price + 0.0001), transform: `scale(${0.6 + price * 0.4})` }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 22,
              background: C.ink,
              borderRadius: 22,
              padding: '26px 40px',
              boxShadow: '0 30px 70px rgba(17,17,17,0.35)',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>Base Cabinet 600</span>
            <IcoArrowRight size={30} color={C.accent} />
            <span style={{ fontSize: 56, fontWeight: 900, color: C.accent, letterSpacing: '-1px', ...numeric }}>£187</span>
          </div>
        </div>
        <Rise delay={66} style={{ alignSelf: 'center', marginTop: 44 }}>
          <div style={{ ...SUB, color: C.text2 }}>Materials, labour, markup — priced as you type.</div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── Scene 4 — a whole kitchen in minutes ─────────────────────────
const SKitchen: React.FC = () => {
  const frame = useCurrentFrame();
  const lines: [string, string, string, number][] = [
    ['Base run', '× 8', '£2,992', 14],
    ['Wall run', '× 6', '£1,743', 22],
    ['Tall units', '× 2', '£2,250', 30],
    ['Island', '× 1', '£3,890', 38],
    ['Install & fit-off', '', '£1,600', 46],
  ];
  const total = Math.round(
    interpolate(frame, [50, 86], [0, 12475], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Step 3 — there is no step 3</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            A whole kitchen. <Amber>Minutes.</Amber>
          </div>
        </Rise>
        <Pop delay={12} style={{ marginTop: 60, alignSelf: 'center' }}>
          <div
            style={{
              width: 820,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 24,
              boxShadow: '0 40px 100px rgba(17,17,17,0.18)',
              padding: 38,
            }}
          >
            {lines.map(([name, qty, v, d], i) => (
              <Rise key={name} delay={d} y={26}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '15px 0',
                    borderTop: i === 0 ? 'none' : `1px solid ${C.borderSoft}`,
                    fontSize: 27,
                  }}
                >
                  <span style={{ flex: 1, fontWeight: 700, color: C.text }}>{name}</span>
                  <span style={{ width: 90, color: C.muted, ...numeric }}>{qty}</span>
                  <span style={{ fontWeight: 800, color: C.ink, ...numeric }}>{v}</span>
                </div>
              </Rise>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginTop: 16,
                paddingTop: 22,
                borderTop: `2px solid ${C.ink}`,
              }}
            >
              <span style={{ fontSize: 28, fontWeight: 800, color: C.text }}>TOTAL</span>
              <span style={{ fontSize: 72, fontWeight: 900, color: C.accent, letterSpacing: '-2px', ...numeric }}>
                £{total.toLocaleString()}
              </span>
            </div>
          </div>
        </Pop>
      </Pad>
    </LightBG>
  );
};

// ── Scene 5 — send it tonight ────────────────────────────────────
const SSend: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sent = spring({ frame: frame - 40, fps, config: { damping: 12, mass: 0.6 } });
  return (
    <LightBG>
      <Pad style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <Rise delay={0}>
          <div style={KICKER}>Same evening</div>
        </Rise>
        <Rise delay={6} style={{ marginTop: 14 }}>
          <div style={H1D}>
            Send it <Amber>tonight</Amber>
            <Dot />
          </div>
        </Rise>
        <Rise delay={12} style={{ marginTop: 16 }}>
          <div style={{ ...SUB, color: C.text2 }}>First quote in wins the job more often than the best quote in.</div>
        </Rise>
        <div style={{ alignSelf: 'center', marginTop: 110, position: 'relative' }}>
          <div
            style={{
              height: 96,
              borderRadius: 20,
              background: sent > 0.5 ? C.green : C.accent,
              color: sent > 0.5 ? '#fff' : '#1a1a1a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              fontSize: 36,
              fontWeight: 900,
              padding: '0 70px',
              boxShadow: sent > 0.5 ? '0 24px 60px rgba(61,153,112,0.45)' : '0 24px 60px rgba(232,168,56,0.45)',
              transform: `scale(${1 + Math.sin(Math.min(1, sent) * Math.PI) * 0.07})`,
            }}
          >
            {sent > 0.5 ? (
              <>
                <IcoCheck size={40} color="#fff" /> Quote sent — 7:42 PM
              </>
            ) : (
              'Send Quote'
            )}
          </div>
        </div>
        <Rise delay={64} style={{ alignSelf: 'center', marginTop: 64 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: C.ink,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 16,
              padding: '16px 30px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              boxShadow: '0 14px 40px rgba(17,17,17,0.10)',
            }}
          >
            <IcoClock size={30} color={C.accent} /> Measured at 4. Quoted by 8.
          </div>
        </Rise>
      </Pad>
    </LightBG>
  );
};

// ── Scene 6 — close ──────────────────────────────────────────────
const SClose: React.FC = () => (
  <InkBG>
    <Pad style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <Rise delay={0}>
        <div style={KICKER}>ProCabinet.App</div>
      </Rise>
      <Rise delay={8} style={{ marginTop: 22 }}>
        <div style={{ ...H1, fontSize: 88 }}>
          Get your
          <br />
          <Amber>evenings back</Amber>
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
export const SPEED_REEL_FPS = 30;
export const SPEED_REEL_DURATION = 690; // ~23s
const SCENES: { c: React.FC; from: number; dur: number }[] = [
  { c: SHook, from: 0, dur: 100 },
  { c: SRates, from: 100, dur: 96 },
  { c: SBuild, from: 196, dur: 108 },
  { c: SKitchen, from: 304, dur: 110 },
  { c: SSend, from: 414, dur: 96 },
  { c: SClose, from: 510, dur: 180 },
];

export const SpeedReel: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Audio src={reelMusic} volume={musicVolume(SPEED_REEL_DURATION)} />
    {SCENES.map(({ c: Comp, from, dur }, i) => (
      <Sequence key={i} from={from} durationInFrames={dur}>
        <Comp />
      </Sequence>
    ))}
  </AbsoluteFill>
);
