// Carousel slide scaffolding: the consistent outer frame (brand row, headline,
// stage area, page dots, swipe cue) shared by every slide so the set reads as
// one cohesive post.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, W, H } from './theme';
import { FONT } from './fonts';
import { IcoArrowRight } from './icons';

export const Amber: React.FC<React.PropsWithChildren> = ({ children }) => (
  <span style={{ color: C.accent }}>{children}</span>
);

// Render editable copy: *word* → accent-amber, newlines → <br/>.
export const renderRich = (text: string): React.ReactNode => {
  if (!text) return null;
  return text.split('\n').map((line, li) => (
    <React.Fragment key={li}>
      {li > 0 ? <br /> : null}
      {line.split(/(\*[^*]+\*)/g).map((part, pi) =>
        part.length > 1 && part.startsWith('*') && part.endsWith('*') ? (
          <Amber key={pi}>{part.slice(1, -1)}</Amber>
        ) : (
          <React.Fragment key={pi}>{part}</React.Fragment>
        ),
      )}
    </React.Fragment>
  ));
};

const Wordmark: React.FC<{ light?: boolean; size?: number }> = ({ light, size = 22 }) => (
  <span style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.5px', color: light ? '#fff' : C.ink }}>
    ProCabinet<span style={{ color: C.accent }}>.App</span>
  </span>
);

const Dots: React.FC<{ index: number; count: number; light?: boolean }> = ({ index, count, light }) => (
  <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
    {Array.from({ length: count }).map((_, i) => (
      <span
        key={i}
        style={{
          width: i === index ? 30 : 9,
          height: 9,
          borderRadius: 9,
          background: i === index ? C.accent : light ? 'rgba(255,255,255,0.28)' : '#cfcfcf',
        }}
      />
    ))}
  </div>
);

const SwipeHint: React.FC<{ light?: boolean }> = ({ light }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      fontSize: 17,
      fontWeight: 700,
      color: light ? 'rgba(255,255,255,0.7)' : C.muted,
    }}
  >
    Swipe
    <IcoArrowRight size={20} color={C.accent} />
  </div>
);

// Standard "demo screen" slide: headline on top, a visual (usually the app
// window) filling the stage, page dots + swipe cue at the bottom.
export const ScreenSlide: React.FC<{
  index: number;
  count: number;
  kicker?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children: React.ReactNode; // the stage visual
  last?: boolean;
}> = ({ index, count, kicker, title, sub, children, last }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: FONT }}>
    {/* warm wash top-left for depth */}
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(1200px 600px at 12% -8%, rgba(232,168,56,0.10), rgba(232,168,56,0) 60%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '54px 56px 48px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* brand row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark />
        <span style={{ fontSize: 16, fontWeight: 700, color: C.muted, letterSpacing: '0.5px' }}>
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>

      {/* headline */}
      <div style={{ marginTop: 30 }}>
        {kicker && (
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: '2.4px',
              textTransform: 'uppercase',
              color: C.accent,
              marginBottom: 12,
            }}
          >
            {kicker}
          </div>
        )}
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-1.1px', lineHeight: 1.07, color: C.ink }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 23, fontWeight: 500, color: C.text2, marginTop: 14, lineHeight: 1.4, maxWidth: 880 }}>
            {sub}
          </div>
        )}
      </div>

      {/* stage */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, marginTop: 26 }}>
        {children}
      </div>

      {/* footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Dots index={index} count={count} />
        {!last && <SwipeHint />}
        {last && (
          <span style={{ fontSize: 17, fontWeight: 800, color: C.ink }}>ProCabinet<span style={{ color: C.accent }}>.App</span></span>
        )}
      </div>
    </div>
  </AbsoluteFill>
);

// Dark hook / CTA slide
export const InkSlide: React.FC<{
  index: number;
  count: number;
  children: React.ReactNode;
  last?: boolean;
}> = ({ index, count, children, last }) => (
  <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(1100px 700px at 78% 8%, rgba(232,168,56,0.22), rgba(232,168,56,0) 55%), radial-gradient(900px 700px at 10% 100%, rgba(13,148,136,0.16), rgba(13,148,136,0) 55%)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        padding: '64px 64px 52px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Wordmark light />
        <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.5px' }}>
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
        {children}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Dots index={index} count={count} light />
        {!last && <SwipeHint light />}
      </div>
    </div>
  </AbsoluteFill>
);

export { Wordmark };
export const PAGE = { W, H };
