/**
 * CreatorsOverlay — persistent top banner for the content-creator cut of the
 * portrait reel. Sits on top of the normal LandingAdPortrait video (does not
 * replace or shift any of it) with a translucent dark backdrop so the three
 * lines stay legible over whatever's playing underneath, including the
 * bright white app screenshots.
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { C, FONT } from '../theme';
import { clampOpts, EASE_OUT } from '../primitives';

export const CreatorsOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  const inT = interpolate(frame, [0, 16], [0, 1], { ...clampOpts, easing: EASE_OUT });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '46px 56px 28px',
          textAlign: 'center',
          fontFamily: FONT,
          opacity: inT,
          transform: `translateY(${(1 - inT) * -14}px)`,
          background:
            'linear-gradient(to bottom, rgba(10,10,12,0.80) 0%, rgba(10,10,12,0.80) 60%, rgba(10,10,12,0) 100%)',
        }}
      >
        <div style={{ fontSize: 25, fontWeight: 800, color: C.accent, letterSpacing: 2.5, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          📣 CONTENT CREATORS
        </div>
        <div style={{ fontSize: 27, fontWeight: 800, color: '#fff', letterSpacing: -0.4, marginTop: 10, lineHeight: 1.25, textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
          Our affiliate program is <span style={{ color: C.accent }}>coming soon</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.72)', marginTop: 10, letterSpacing: 2, textTransform: 'uppercase', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
          details in the caption
        </div>
      </div>
    </AbsoluteFill>
  );
};
