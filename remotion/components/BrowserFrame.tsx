// Mac-style browser chrome wrapper. Renders a window with traffic-light
// buttons, a URL bar showing procabinet.app, a faint divider, and a drop
// shadow. Children (a Screen) are clipped to the inside of the window.
//
// Layout: a 1480 × 920 frame centered on the 1920 × 1080 canvas. Inside the
// chrome (44px title bar) the content area is 1480 × 876 → close to the
// 16:10 aspect of our 1280×800 native screenshot logical size.

import { AbsoluteFill } from 'remotion';
import { BRAND } from '../scenes';

export const BROWSER_FRAME = {
  outerW: 1480,
  outerH: 920,
  titleBarH: 44,
  innerW: 1480,
  innerH: 876,
  /** Top-left of the chrome relative to the canvas. */
  offsetX: (1920 - 1480) / 2,
  offsetY: (1080 - 920) / 2,
  /** Top-left of the content area inside the chrome. */
  contentX: (1920 - 1480) / 2,
  contentY: (1080 - 920) / 2 + 44,
};

export const BrowserFrame: React.FC<{ children: React.ReactNode; url?: string }> = ({
  children,
  url = 'procabinet.app',
}) => {
  return (
    <AbsoluteFill style={{ background: BRAND.ink }}>
      <div
        style={{
          position: 'absolute',
          left: BROWSER_FRAME.offsetX,
          top: BROWSER_FRAME.offsetY,
          width: BROWSER_FRAME.outerW,
          height: BROWSER_FRAME.outerH,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#1c1c1e',
          boxShadow:
            '0 30px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            position: 'relative',
            height: BROWSER_FRAME.titleBarH,
            background: 'linear-gradient(180deg, #2a2a2c 0%, #1f1f21 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 16,
            paddingRight: 16,
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: 'flex', gap: 8 }}>
            <Dot color="#ff5f57" />
            <Dot color="#febc2e" />
            <Dot color="#28c840" />
          </div>
          {/* URL pill — centered */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              minWidth: 320,
              padding: '5px 14px',
              borderRadius: 6,
              background: '#2f2f31',
              color: '#cfcfd1',
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: 0.2,
              fontFamily: 'system-ui, -apple-system, "SF Pro Text", sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: '1px solid rgba(255,255,255,0.04)',
            }}
          >
            <LockIcon />
            <span>{url}</span>
          </div>
        </div>
        {/* Content area — children render here */}
        <div style={{ position: 'relative', width: BROWSER_FRAME.innerW, height: BROWSER_FRAME.innerH, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      width: 13,
      height: 13,
      borderRadius: '50%',
      background: color,
      boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.25)',
    }}
  />
);

const LockIcon: React.FC = () => (
  <svg width="11" height="13" viewBox="0 0 24 28" fill="none" stroke="#9a9a9a" strokeWidth="3">
    <rect x="4" y="13" width="16" height="12" rx="2" />
    <path d="M8 13V8a4 4 0 1 1 8 0v5" />
  </svg>
);
