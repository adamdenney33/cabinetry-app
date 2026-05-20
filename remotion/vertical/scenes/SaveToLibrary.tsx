// Scene 5 / Save To Library (0:23 → 0:27, 120 frames).
// Two-beat scene:
//   (a) cursor moves to a "Save to Library" button and clicks (0..50)
//   (b) cross-fade reveals the library grid; a card flies in from outside,
//       lands in the grid, settles. (50..120)

import { AbsoluteFill, interpolate, spring, useVideoConfig } from 'remotion';
import { PhoneFrame } from '../PhoneFrame';
import { VerticalScreen } from '../VerticalScreen';
import { VerticalCursor } from '../VerticalCursor';
import { BigCaption } from '../BigCaption';
import { BRAND, PHONE_FRAME } from '../constants';

const SAVE_CLICK_FRAME = 44;
const REVEAL_AT = 52;

export const SaveToLibrary: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const { fps } = useVideoConfig();

  // Editor → Library cross-fade.
  const editorOpacity = interpolate(localFrame, [REVEAL_AT, REVEAL_AT + 10], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const libraryOpacity = interpolate(localFrame, [REVEAL_AT, REVEAL_AT + 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // "Flying card" — only visible after the reveal. Lands at frame ~95.
  const cardLocalFrame = localFrame - (REVEAL_AT + 4);
  const cardEnter = spring({
    frame: Math.max(0, cardLocalFrame),
    fps,
    config: { damping: 14, stiffness: 130, mass: 0.7 },
  });
  const cardX = interpolate(cardEnter, [0, 1], [320, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardY = interpolate(cardEnter, [0, 1], [-200, 0], {
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
      <PhoneFrame>
        {/* Editor underlay */}
        <div style={{ position: 'absolute', inset: 0, opacity: editorOpacity }}>
          <VerticalScreen
            src="03d-cabinet-editor.png"
            sourceW={2560}
            sourceH={1800}
            localFrame={localFrame}
            durationFrames={durationFrames}
            fit="width"
          />
          {/* Fake "Save to Library" button overlaid at the click spot so the
              click pulse has a believable target. */}
          <div
            style={{
              position: 'absolute',
              left: 240,
              top: 1180,
              width: 440,
              height: 80,
              borderRadius: 12,
              background: BRAND.accent,
              boxShadow: `0 8px 26px ${BRAND.accent}66, 0 2px 6px rgba(0,0,0,0.3)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#111',
              fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 0.2,
              opacity: editorOpacity,
            }}
          >
            Save to Library
          </div>
        </div>

        {/* Library reveal */}
        <div style={{ position: 'absolute', inset: 0, opacity: libraryOpacity }}>
          <VerticalScreen
            src="03b-cabinet-library.png"
            sourceW={2560}
            sourceH={1800}
            localFrame={localFrame}
            durationFrames={durationFrames}
            fit="width"
          />
          {/* Flying card lands in the library grid. */}
          <div
            style={{
              position: 'absolute',
              left: 200 + cardX,
              top: 480 + cardY,
              width: 240,
              height: 260,
              borderRadius: 14,
              background: '#ffffff',
              border: `3px solid ${BRAND.accent}`,
              boxShadow: `0 18px 50px rgba(0,0,0,0.35), 0 0 24px ${BRAND.accent}55`,
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
            <div style={{ fontSize: 22, fontWeight: 600, color: '#666' }}>NEW</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Base 600</div>
            <div style={{ fontSize: 20, color: '#444' }}>3 doors • $1,247</div>
          </div>
        </div>
      </PhoneFrame>

      {/* Cursor performs the save-click before the reveal. */}
      <VerticalCursor
        localFrame={localFrame}
        anim={{
          from: { x: 720, y: 980 },
          to: { x: 460, y: 1220 },
          startFrame: 4,
          endFrame: SAVE_CLICK_FRAME - 4,
          clickFrames: [SAVE_CLICK_FRAME],
        }}
        hidden={localFrame > REVEAL_AT + 2}
      />

      <BigCaption
        text="Save once. Drop into any quote."
        localFrame={localFrame}
        durationFrames={durationFrames}
        variant="pill"
        fadeIn={14}
        fadeOut={18}
      />
    </AbsoluteFill>
  );
};
