// SpecScroll (11s, 330 frames, 1920×1080).
//
// Centered narrow sidebar column — width matches the apparent width of the
// sidebar when the full app screenshot (03d-cabinet-editor.png, 2560×1800)
// is rendered inside the OpenBuilder scene's BrowserFrame. The top band
// (Cabinet Builder | My Rates tabs + breadcrumb + NAME field) is pinned
// in place — like the app — while the form sections below scroll top-to-
// bottom. No BrowserFrame chrome in this scene; the sidebar is the subject
// and the dark canvas frames it.
//
// Geometry:
//   sidebar-editor.png  : 880 × 3950 source px
//   COL_W (rendered)    : 880 × (1480 / 2560) ≈ 509 — same width as in 03d
//                         scaled into the 1480-wide BrowserFrame
//   FIXED_HEADER_SRC_H  : top 200 source px (tabs + breadcrumb + NAME).
//                         At SCALE ≈ 0.578 that's ≈ 116 rendered px pinned
//                         to the top of the column.

import { AbsoluteFill, Img, interpolate, staticFile } from 'remotion';
import { Caption } from '../../components/Caption';
import { BRAND } from '../constants';

const SRC_W = 880;
// Actual image dimensions: 880 × 7802. The form ends at src y=4439; the
// remaining ~3360 rows are pure-white trailing whitespace from the capture.
// We render the full image (so natural aspect is preserved) but stop the
// scroll at SRC_H_CONTENT so the last frame lands on the last content row
// rather than in dead whitespace.
const SRC_H = 7802;
const SRC_H_CONTENT = 4439;
// Pin only the tabs + breadcrumb (Cabinet Builder | My Rates with amber
// underline ends at src y≈131). Cut in the middle of the 55-row solid-
// white gap that follows (y=135..189), so the NAME field belongs to the
// scrollable content below.
const FIXED_HEADER_SRC_H = 160;

const CANVAS_W = 1920;
const CANVAS_H = 1080;
const COL_W = 509;
const COL_LEFT = (CANVAS_W - COL_W) / 2;
const SCALE = COL_W / SRC_W;                          // ≈ 0.578
const HEADER_H = FIXED_HEADER_SRC_H * SCALE;          // ≈ 92.5
const FULL_H = SRC_H * SCALE;                         // ≈ 4510 (rendered image height)
const CONTENT_END_Y = SRC_H_CONTENT * SCALE;          // ≈ 2567 (rendered y of last content row)
// Scroll until the last content row lands at canvas bottom — not all the
// way to the actual image bottom, which would scroll through ~1944 px of
// trailing whitespace.
const OVERFLOW_H = Math.max(0, CONTENT_END_Y - CANVAS_H); // ≈ 1487

const SECTIONS: { text: string; from: number; to: number }[] = [
  { text: 'Width & height',        from:   0, to:  82 },
  { text: 'Doors & drawer fronts', from:  82, to: 165 },
  { text: 'Drawer boxes',          from: 165, to: 248 },
  { text: 'Hardware & extras',     from: 248, to: 330 },
];

export const SpecScroll: React.FC<{
  localFrame: number;
  durationFrames: number;
}> = ({ localFrame, durationFrames }) => {
  const scrollStart = 10;
  const scrollEnd = durationFrames - 10;
  const t = interpolate(localFrame, [scrollStart, scrollEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scrollY = -OVERFLOW_H * t;

  return (
    <AbsoluteFill style={{ background: BRAND.ink }}>
      {/* Centered sidebar column — white panel against the dark canvas. */}
      <div
        style={{
          position: 'absolute',
          left: COL_LEFT,
          top: 0,
          width: COL_W,
          height: CANVAS_H,
          background: '#ffffff',
          overflow: 'hidden',
          boxShadow:
            '0 30px 80px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(0,0,0,0.06)',
        }}
      >
        {/* Body layer — the entire sidebar image translates upward over time. */}
        <Img
          src={staticFile('screenshots/sidebar-editor.png')}
          style={{
            position: 'absolute',
            left: 0,
            top: scrollY,
            width: COL_W,
            height: FULL_H,
            display: 'block',
          }}
        />

        {/* Pinned header band — same image, clipped to HEADER_H and drawn on
            top so it occludes the body image's header region as the body
            slides under. The subtle bottom shadow sells the "stuck on top"
            feel as content begins to scroll beneath it. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: COL_W,
            height: HEADER_H,
            overflow: 'hidden',
            background: '#ffffff',
            boxShadow: '0 6px 14px rgba(0,0,0,0.08)',
          }}
        >
          <Img
            src={staticFile('screenshots/sidebar-editor.png')}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: COL_W,
              height: FULL_H,
              display: 'block',
            }}
          />
        </div>
      </div>

      {SECTIONS.map((s) => {
        if (localFrame < s.from || localFrame >= s.to) return null;
        return (
          <Caption
            key={s.text}
            text={s.text}
            localFrame={localFrame - s.from}
            durationFrames={s.to - s.from}
            fadeIn={10}
            fadeOut={14}
          />
        );
      })}
    </AbsoluteFill>
  );
};
