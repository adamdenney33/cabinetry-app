// Portrait Mac-style chrome — the vertical equivalent of BrowserFrame.
// Same traffic lights + URL pill, resized to fit inside 1080×1920 with
// breathing room above for a hero caption and below for a pill caption.

import { AbsoluteFill } from 'remotion';
import { BRAND, PHONE_FRAME } from './constants';

export const PhoneFrame: React.FC<{ children: React.ReactNode; url?: string }> = ({
  children,
  url = 'procabinet.app',
}) => {
  return (
    <AbsoluteFill style={{ background: BRAND.ink }}>
      <div
        style={{
          position: 'absolute',
          left: PHONE_FRAME.offsetX,
          top: PHONE_FRAME.offsetY,
          width: PHONE_FRAME.outerW,
          height: PHONE_FRAME.outerH,
          borderRadius: 22,
          overflow: 'hidden',
          background: '#1c1c1e',
          boxShadow:
            '0 40px 100px rgba(0,0,0,0.55), 0 10px 30px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      >
        {/* Title bar */}
        <div
          style={{
            position: 'relative',
            height: PHONE_FRAME.titleBarH,
            background: 'linear-gradient(180deg, #2a2a2c 0%, #1f1f21 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 18,
            paddingRight: 18,
          }}
        >
          {/* Traffic lights */}
          <div style={{ display: 'flex', gap: 10 }}>
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
              minWidth: 280,
              padding: '7px 16px',
              borderRadius: 7,
              background: '#2f2f31',
              color: '#cfcfd1',
              fontSize: 16,
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
        <div
          style={{
            position: 'relative',
            width: PHONE_FRAME.innerW,
            height: PHONE_FRAME.innerH,
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Dot: React.FC<{ color: string }> = ({ color }) => (
  <div
    style={{
      width: 16,
      height: 16,
      borderRadius: '50%',
      background: color,
      boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.25)',
    }}
  />
);

const LockIcon: React.FC = () => (
  <svg width="13" height="15" viewBox="0 0 24 28" fill="none" stroke="#9a9a9a" strokeWidth="3">
    <rect x="4" y="13" width="16" height="12" rx="2" />
    <path d="M8 13V8a4 4 0 1 1 8 0v5" />
  </svg>
);
