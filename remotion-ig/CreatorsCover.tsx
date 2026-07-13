// Static 9:16 cover (1080×1920) — Instagram thumbnail for the content-creator
// reel variant. Deliberately the "clean" end of the brand's thumbnail range:
// kicker + a short two-line headline, no wordmark, no subtext caption,
// vertically centred in the frame (same InkBG/KICKER/H1 kit as reel-v2 and
// founder-reel, which are the other subtext-free covers in the set).
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FONT } from './fonts';
import { Amber, Dot, KICKER, H1, InkBG } from './reel-kit';

export const COVER_CREATORS_FPS = 30;
export const COVER_CREATORS_DURATION = 1; // static still

export const CreatorsCover: React.FC = () => (
  <InkBG>
    <AbsoluteFill
      style={{
        fontFamily: FONT,
        padding: '0 80px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div style={KICKER}>Content creators</div>
      <div style={{ marginTop: 22 }}>
        <div style={H1}>Our affiliate</div>
        <div style={H1}>
          program is <Amber>coming soon</Amber>
          <Dot />
        </div>
      </div>
    </AbsoluteFill>
  </InkBG>
);
