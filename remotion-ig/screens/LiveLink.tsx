// Live link — the customer-facing quote page (procabinet.app/q/…) rebuilt from
// the same tokens as the app, plus the payment sheet and the business-side
// "deposit paid" card. All pieces self-animate off useCurrentFrame with frame
// delays so scenes can stage them (tick an option, pay, etc.).
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { Badge, Stepper } from '../ui';
import { IcoCheck } from '../icons';

// ── local glyphs (chat bubble, bank card, padlock) ────────────────
const Glyph: React.FC<{ size?: number; color?: string; sw?: number; children: React.ReactNode }> = ({
  size = 24,
  color = '#111',
  sw = 2,
  children,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={sw}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: 'block', stroke: color }}
  >
    {children}
  </svg>
);
export const IcoChat: React.FC<{ size?: number; color?: string }> = (p) => (
  <Glyph {...p}>
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </Glyph>
);
export const IcoCard: React.FC<{ size?: number; color?: string }> = (p) => (
  <Glyph {...p}>
    <rect x="1" y="4" width="22" height="16" rx="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </Glyph>
);
export const IcoLock: React.FC<{ size?: number; color?: string }> = (p) => (
  <Glyph {...p}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </Glyph>
);
export const IcoLink: React.FC<{ size?: number; color?: string }> = (p) => (
  <Glyph {...p}>
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </Glyph>
);

// ── phone shell (the customer opens the link on their phone) ──────
export const PhoneShell: React.FC<React.PropsWithChildren<{ w?: number; url?: string }>> = ({
  children,
  w = 600,
  url = 'procabinet.app/q/x7k2m9',
}) => (
  <div
    style={{
      width: w,
      borderRadius: 54,
      background: '#0d0d0d',
      padding: 16,
      boxShadow: '0 50px 120px rgba(17,17,17,0.38)',
      fontFamily: FONT,
    }}
  >
    <div style={{ borderRadius: 40, overflow: 'hidden', background: C.bg }}>
      <div
        style={{
          height: 64,
          background: C.surface2,
          borderBottom: `1px solid ${C.borderSoft}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            height: 38,
            borderRadius: 19,
            background: '#ececec',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 20px',
            fontSize: 19,
            color: C.text2,
            fontWeight: 600,
          }}
        >
          <IcoLock size={17} color={C.green} /> {url}
        </div>
      </div>
      {children}
    </div>
  </div>
);

// ── the live quote page itself ────────────────────────────────────
// toggleAt  — frame at which the customer ticks the optional item in
// payAt     — frame at which the deposit button gets pressed (pulse)
export const CustomerQuote: React.FC<{
  toggleAt?: number;
  payAt?: number;
  showChatFab?: boolean;
}> = ({ toggleAt = -1, payAt = -1, showChatFab = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const on = toggleAt >= 0 ? spring({ frame: frame - toggleAt, fps, config: { damping: 16 } }) : 0;
  const ripple =
    toggleAt >= 0
      ? interpolate(frame, [toggleAt, toggleAt + 18], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 0;
  const total = Math.round(
    toggleAt >= 0
      ? interpolate(frame, [toggleAt + 6, toggleAt + 26], [1874, 1970], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
      : 1874,
  );
  const press =
    payAt >= 0 ? spring({ frame: frame - payAt, fps, config: { damping: 12, mass: 0.5 } }) : 0;

  const row = (name: string, meta: string, price: string): React.ReactNode => (
    <div
      key={name}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '15px 0',
        borderTop: `1px solid ${C.borderSoft}`,
        fontSize: 21,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: C.text }}>{name}</div>
        <div style={{ fontSize: 16, color: C.muted, marginTop: 2, ...numeric }}>{meta}</div>
      </div>
      <div style={{ fontWeight: 800, color: C.text, ...numeric }}>{price}</div>
    </div>
  );

  return (
    <div style={{ position: 'relative', padding: '26px 28px 30px', fontFamily: FONT, background: C.bg }}>
      {/* header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 27, fontWeight: 800, color: C.text }}>Kitchen Renovation</div>
          <div style={{ fontSize: 17, color: C.muted, marginTop: 3 }}>Quote QUO-1042 · for Sarah Mitchell</div>
        </div>
        <Badge tone="approved">Live</Badge>
      </div>

      {/* lines */}
      <div
        style={{
          marginTop: 20,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: '6px 22px',
        }}
      >
        {row('Base Cabinet 600', '× 4', '£748')}
        {row('Wall Cabinet 600', '× 3', '£581')}
        {row('Drawer Base 800', '× 1', '£375')}

        {/* optional line with toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '15px 0 17px',
            borderTop: `1px solid ${C.borderSoft}`,
            fontSize: 21,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: C.text }}>
              Soft-close upgrade{' '}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: '0.6px',
                  color: C.accent,
                  background: C.accentDim,
                  borderRadius: 6,
                  padding: '3px 8px',
                  verticalAlign: 'middle',
                }}
              >
                OPTIONAL
              </span>
            </div>
            <div style={{ fontSize: 16, color: C.muted, marginTop: 2 }}>Tick it in — the total updates live</div>
          </div>
          <div style={{ fontWeight: 800, color: on > 0.5 ? C.text : C.faint, marginRight: 16, ...numeric }}>
            +£96
          </div>
          {/* toggle */}
          <div style={{ position: 'relative' }}>
            {toggleAt >= 0 && ripple > 0 && ripple < 1 && (
              <div
                style={{
                  position: 'absolute',
                  inset: -14,
                  borderRadius: 40,
                  border: `3px solid ${C.accent}`,
                  opacity: 1 - ripple,
                  transform: `scale(${0.7 + ripple * 0.7})`,
                }}
              />
            )}
            <div
              style={{
                width: 66,
                height: 38,
                borderRadius: 19,
                background: on > 0.5 ? C.accent : '#d9d9d9',
                position: 'relative',
                transition: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4 + on * 28,
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#fff',
                  boxShadow: '0 2px 6px rgba(17,17,17,0.25)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* total + pay */}
      <div
        style={{
          marginTop: 18,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 18,
          padding: '20px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 21, fontWeight: 800, color: C.text }}>Total inc. tax</span>
          <span style={{ fontSize: 46, fontWeight: 900, color: C.accent, letterSpacing: '-1px', ...numeric }}>
            £{total.toLocaleString()}
          </span>
        </div>
        <div
          style={{
            marginTop: 14,
            height: 66,
            borderRadius: 14,
            background: C.accent,
            color: '#1a1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontSize: 24,
            fontWeight: 800,
            boxShadow: '0 12px 32px rgba(232,168,56,0.40)',
            transform: payAt >= 0 ? `scale(${1 - Math.sin(Math.min(1, press) * Math.PI) * 0.06})` : undefined,
          }}
        >
          <IcoCard size={26} color="#1a1a1a" /> Approve & pay deposit · £492
        </div>
        <div
          style={{
            marginTop: 10,
            fontSize: 15,
            color: C.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
          }}
        >
          <IcoLock size={15} color={C.muted} /> Card payment via Stripe — no login, no app
        </div>
      </div>

      {/* chat fab */}
      {showChatFab && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 24,
            width: 74,
            height: 74,
            borderRadius: '50%',
            background: C.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 14px 34px rgba(17,17,17,0.35)',
          }}
        >
          <IcoChat size={32} color="#fff" />
        </div>
      )}
    </div>
  );
};

// ── chat thread (customer asks, you answer) ───────────────────────
export const ChatThread: React.FC<{ start?: number }> = ({ start = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = (d: number) => spring({ frame: frame - d, fps, config: { damping: 13, mass: 0.55 } });
  const bubble = (
    text: string,
    mine: boolean,
    d: number,
    meta: string,
  ): React.ReactNode => {
    const s = pop(d);
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: mine ? 'flex-end' : 'flex-start',
          opacity: Math.min(1, s + 0.0001),
          transform: `scale(${0.7 + s * 0.3}) translateY(${(1 - s) * 18}px)`,
          transformOrigin: mine ? 'bottom right' : 'bottom left',
        }}
      >
        <div style={{ maxWidth: 560 }}>
          <div
            style={{
              background: mine ? C.ink : C.surface,
              color: mine ? '#fff' : C.text,
              border: mine ? 'none' : `1px solid ${C.border}`,
              borderRadius: mine ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
              padding: '18px 24px',
              fontSize: 25,
              fontWeight: 600,
              lineHeight: 1.35,
              boxShadow: '0 10px 28px rgba(17,17,17,0.10)',
            }}
          >
            {text}
          </div>
          <div
            style={{
              fontSize: 15,
              color: C.muted,
              marginTop: 7,
              textAlign: mine ? 'right' : 'left',
              fontWeight: 600,
            }}
          >
            {meta}
          </div>
        </div>
      </div>
    );
  };
  // typing dots between the two messages
  const tIn = start + 26;
  const tOut = start + 58;
  const typing = frame >= tIn && frame < tOut;
  const dotPulse = (i: number) => 0.35 + 0.65 * Math.abs(Math.sin((frame - tIn) / 6 + i * 0.9));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, fontFamily: FONT }}>
      {bubble('Could we make the island 100mm deeper?', false, start, 'Sarah · on the quote page')}
      {typing && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div
            style={{
              background: C.ink,
              borderRadius: '20px 20px 6px 20px',
              padding: '20px 26px',
              display: 'flex',
              gap: 9,
            }}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff', opacity: dotPulse(i) }}
              />
            ))}
          </div>
        </div>
      )}
      {frame >= tOut &&
        bubble('Yes — updating the spec now. New price in a sec.', true, tOut, 'You · from the workshop')}
    </div>
  );
};

// ── payment sheet → paid state ────────────────────────────────────
export const PaySheet: React.FC<{ paidAt?: number }> = ({ paidAt = 40 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const paid = spring({ frame: frame - paidAt, fps, config: { damping: 13, mass: 0.6 } });
  const isPaid = frame >= paidAt;
  return (
    <div
      style={{
        position: 'relative',
        width: 700,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 24,
        boxShadow: '0 40px 100px rgba(17,17,17,0.20)',
        padding: 36,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: C.text }}>Deposit (25%)</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: C.text, letterSpacing: '-1px', ...numeric }}>£492</div>
      </div>
      <div
        style={{
          marginTop: 22,
          height: 64,
          border: `1px solid ${C.border}`,
          borderRadius: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 20px',
          fontSize: 23,
          color: C.text2,
          fontWeight: 600,
          ...numeric,
        }}
      >
        <IcoCard size={26} color={C.muted} /> •••• •••• •••• 4242
        <span style={{ marginLeft: 'auto', color: C.muted, fontSize: 19 }}>09/28</span>
      </div>
      <div
        style={{
          marginTop: 18,
          height: 68,
          borderRadius: 14,
          background: isPaid ? C.green : C.accent,
          color: isPaid ? '#fff' : '#1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          fontSize: 25,
          fontWeight: 800,
          boxShadow: isPaid ? '0 12px 32px rgba(61,153,112,0.45)' : '0 12px 32px rgba(232,168,56,0.40)',
        }}
      >
        {isPaid ? (
          <>
            <IcoCheck size={28} color="#fff" /> Deposit received
          </>
        ) : (
          <>
            <IcoLock size={24} color="#1a1a1a" /> Pay £492
          </>
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 16, color: C.muted, textAlign: 'center' }}>
        Powered by Stripe · receipt emailed automatically
      </div>

      {/* big green tick overlay */}
      <div
        style={{
          position: 'absolute',
          top: -54,
          right: -42,
          width: 130,
          height: 130,
          borderRadius: '50%',
          background: C.green,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 22px 52px rgba(61,153,112,0.50)',
          transform: `scale(${paid})`,
        }}
      >
        <IcoCheck size={64} color="#fff" />
      </div>
    </div>
  );
};

// ── business side — the card updates the second it happens ───────
export const BusinessPaidCard: React.FC<{ paidAt?: number }> = ({ paidAt = 26 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - paidAt, fps, config: { damping: 13, mass: 0.6 } });
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(frame / 11));
  return (
    <div
      style={{
        width: 760,
        background: C.surface,
        border: `1px solid ${C.accent}`,
        borderRadius: 18,
        padding: 30,
        boxShadow: '0 30px 80px rgba(17,17,17,0.16)',
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 26, fontWeight: 800, color: C.text }}>QUO-1042</span>
            <Badge tone="approved">Approved</Badge>
          </div>
          <div style={{ fontSize: 18, color: C.muted, marginTop: 5 }}>Sarah Mitchell · Kitchen Renovation</div>
        </div>
        <div style={{ fontSize: 38, fontWeight: 900, color: C.text, ...numeric }}>£1,970</div>
      </div>
      <div style={{ margin: '24px 0 18px' }}>
        <Stepper steps={['DRAFT', 'SENT', 'APPROVED']} active={2} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: C.greenDim,
          border: `1px solid rgba(61,153,112,0.35)`,
          borderRadius: 12,
          padding: '14px 18px',
          opacity: Math.min(1, s + 0.0001),
          transform: `translateY(${(1 - s) * 22}px)`,
        }}
      >
        <span style={{ width: 13, height: 13, borderRadius: '50%', background: C.green, opacity: pulse }} />
        <span style={{ fontSize: 21, fontWeight: 800, color: C.green }}>Deposit paid · £492</span>
        <span style={{ fontSize: 17, color: C.muted, marginLeft: 'auto', fontWeight: 600 }}>just now</span>
      </div>
    </div>
  );
};
