import React from 'react';
import { Stage } from '../components/Stage';
import { DemoCursor, CursorKey } from '../components/DemoCursor';
import { TabId } from '../theme';

export const WalkScene: React.FC<{
  activeTab: TabId;
  dur: number;
  caption: React.ReactNode;
  captionDelay?: number;
  cursor: CursorKey[];
  children: React.ReactNode;
  fadeIn?: number;
  fadeOut?: number;
}> = ({ activeTab, dur, caption, captionDelay, cursor, children, fadeIn, fadeOut }) => (
  <Stage
    activeTab={activeTab}
    caption={caption}
    captionDur={dur}
    captionDelay={captionDelay}
    dur={dur}
    fadeIn={fadeIn}
    fadeOut={fadeOut}
    overlay={<DemoCursor keys={cursor} />}
  >
    {children}
  </Stage>
);
