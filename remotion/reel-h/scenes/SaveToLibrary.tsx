// SaveToLibrary (4s, 120 frames, 1920×1080). Two-beat scene:
//   (a) cursor moves to a "Save to Library" button overlaid on the editor,
//       click pulse at frame ~44
//   (b) cross-fade reveals the library grid; a card flies in from off-screen
//       and lands in the grid

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { BrowserFrame } from '../../components/BrowserFrame';
import { Screen } from '../../components/Screen';
import { Cursor } from '../../components/Cursor';
import { Caption } from '../../components/Caption';
import { BRAND } from '../constants';

const SAVE_CLICK_FRAME = 44;
const REVEAL_AT = 52;

export const SaveToLibrary: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  const editorOpacity = interpolate(localFrame, [REVEAL_AT, REVEAL_AT + 10], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const libraryOpacity = interpolate(localFrame, [REVEAL_AT, REVEAL_AT + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardLocalFrame = localFrame - (REVEAL_AT + 4);
  const cardEnter = spring({
    frame: Math.max(0, cardLocalFrame),
    fps,
    config: { damping: 14, stiffness: 130, mass: 0.7 },
  });
  const cardX = interpolate(cardEnter, [0, 1], [380, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardY = interpolate(cardEnter, [0, 1], [-220, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardScale = 0.7 + cardEnter * 0.3;
  const cardOpacity = interpolate(cardLocalFrame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      <BrowserFrame>
        {/* Editor underlay with overlaid Save button */}
        <div style={{ position: 'absolute', inset: 0, opacity: editorOpacity }}>
          <Screen
            src="03d-cabinet-editor.png"
            sourceW={2560}
            sourceH={1800}
            localFrame={localFrame}
            durationFrames={durationFrames}
            fit="width"
          />
          <div
            style={{
              position: 'absolute',
              left: 460,
              top: 720,
              width: 460,
              height: 80,
              borderRadius: 12,
              background: BRAND.accent,
              boxShadow: `0 10px 30px ${BRAND.accent}66, 0 2px 6px rgba(0,0,0,0.3)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111',
              fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 0.2,
            }}
          >
            Save to Library
          </div>
        </div>

        {/* Library reveal with flying card */}
        <div style={{ position: 'absolute', inset: 0, opacity: libraryOpacity }}>
          <Screen
            src="03b-cabinet-library.png"
            sourceW={2560}
            sourceH={1800}
            localFrame={localFrame}
            durationFrames={durationFrames}
            fit="width"
          />
          <div
            style={{
              position: 'absolute',
              left: 380 + cardX,
              top: 320 + cardY,
              width: 250,
              height: 270,
              borderRadius: 14,
              background: '#ffffff',
              border: `3px solid ${BRAND.accent}`,
              boxShadow: `0 20px 56px rgba(0,0,0,0.35), 0 0 28px ${BRAND.accent}55`,
              transform: `scale(${cardScale})`,
              opacity: cardOpacity,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
              color: '#111',
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 600, color: '#666' }}>NEW</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Base 600</div>
            <div style={{ fontSize: 20, color: '#444' }}>3 doors • $1,247</div>
          </div>
        </div>
      </BrowserFrame>

      {/* Cursor: moves to save button, clicks at SAVE_CLICK_FRAME, then hides. */}
      <Cursor
        localFrame={localFrame}
        anim={{
          from: { x: 1180, y: 540 },
          to: { x: 690, y: 760 },
          startFrame: 4,
          endFrame: SAVE_CLICK_FRAME - 4,
          clickFrames: [SAVE_CLICK_FRAME],
        }}
        hidden={localFrame > REVEAL_AT + 2}
      />

      <Caption
        text="Save once. Drop into any quote."
        localFrame={localFrame}
        durationFrames={durationFrames}
        fadeIn={14}
        fadeOut={18}
      />
    </AbsoluteFill>
  );
};
