/**
 * Cinematic stage: dark backdrop + the app window scaled & centered + optional caption.
 * Every walkthrough scene renders through here so the framing is identical frame-to-frame
 * (which is what makes the cuts feel like one continuous screen recording).
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { BACKDROP, WIN, FONT, TabId } from '../theme';
import { AppWindow } from './AppWindow';
import { Caption } from './Caption';
import { clampOpts } from '../primitives';

const MARGIN_X = 100;
const MARGIN_Y = 96;
const SCALE = Math.min((1920 - MARGIN_X) / WIN.width, (1080 - MARGIN_Y) / WIN.height);

export const Stage: React.FC<{
  activeTab: TabId;
  children: React.ReactNode;
  overlay?: React.ReactNode; // cursor, in window-local coords
  caption?: React.ReactNode;
  captionDur?: number;
  captionDelay?: number;
  fadeIn?: number; // frames
  fadeOut?: number; // frames (measured from `dur`)
  dur?: number;
}> = ({ activeTab, children, overlay, caption, captionDur, captionDelay, fadeIn = 0, fadeOut = 0, dur }) => {
  const frame = useCurrentFrame();
  const inOp = fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clampOpts) : 1;
  const outOp = fadeOut && dur ? interpolate(frame, [dur - fadeOut, dur], [1, 0], clampOpts) : 1;
  const opacity = Math.min(inOp, outOp);
  return (
    <AbsoluteFill style={{ background: BACKDROP, fontFamily: FONT, opacity }}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'center center' }}>
          <AppWindow activeTab={activeTab} overlay={overlay}>
            {children}
          </AppWindow>
        </div>
      </AbsoluteFill>
      {caption && captionDur != null && <Caption text={caption} dur={captionDur} delay={captionDelay} />}
    </AbsoluteFill>
  );
};
