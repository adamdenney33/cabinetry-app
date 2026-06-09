// Static planning preview: the 9-post series laid into a 3-wide Instagram grid,
// each tile an on-brand mini-cover reflecting that post's cover type (A image /
// B text / C icon) and background (ink / light). Built to judge contrast +
// cohesion at a glance, NOT a final asset. Register id="series-grid".
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from './theme';
import { FONT, numeric } from './fonts';
import { IconStrip } from './chrome';
import { TAB_ICONS, IcoCheck, IcoArrowRight } from './icons';

export const GRID_FPS = 30;
export const GRID_DURATION = 1; // static still

export const GRID_W = 1080;
const PAD = 40;
const GAP = 22;
const TILE_W = (GRID_W - PAD * 2 - GAP * 2) / 3;
const TILE_H = TILE_W * 1.25; // 4:5
const HEADER_H = 92;
export const GRID_H = Math.round(PAD * 2 + HEADER_H + 18 + TILE_H * 3 + GAP * 2);

const Amber: React.FC<React.PropsWithChildren> = ({ children }) => <span style={{ color: C.accent }}>{children}</span>;
const Dot: React.FC = () => <span style={{ color: C.accent }}>.</span>;

type Tile = {
  n: number;
  pillar: string;
  format: string;
  type: 'A' | 'B' | 'C';
  bg: 'ink' | 'light';
  title: React.ReactNode;
  art: React.ReactNode;
};

const inkBg: React.CSSProperties = {
  background:
    'radial-gradient(220px 170px at 84% 6%, rgba(232,168,56,0.30), transparent 60%), radial-gradient(200px 170px at 6% 102%, rgba(13,148,136,0.20), transparent 60%), ' +
    C.ink,
};
const lightBg: React.CSSProperties = {
  background: 'radial-gradient(260px 180px at 10% -8%, rgba(232,168,56,0.16), transparent 62%), ' + C.bg,
};

// ── small art primitives for the A (image) tiles ─────────────────
const MiniWin: React.FC<React.PropsWithChildren<{ pad?: number }>> = ({ children, pad = 9 }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden', boxShadow: '0 10px 22px rgba(17,17,17,0.16)' }}>
    <div style={{ height: 15, background: C.surface2, borderBottom: `1px solid ${C.borderSoft}`, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((d) => (<span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: d }} />))}
    </div>
    <div style={{ padding: pad }}>{children}</div>
  </div>
);

const Row: React.FC<{ l: string; v: string; strong?: boolean }> = ({ l, v, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 11, color: strong ? C.ink : C.text2, fontWeight: strong ? 800 : 500 }}>
    <span>{l}</span><span style={{ ...numeric, fontWeight: strong ? 800 : 600, color: C.ink }}>{v}</span>
  </div>
);

const ArtCutList: React.FC = () => (
  <MiniWin>
    {[
      { pct: '72%', segs: [['#d7ecda', '#a8d2ac'], ['#d7ecda', '#a8d2ac'], ['#f0d6ec', '#d6a9ce']] },
      { pct: '57%', segs: [['#d7ecda', '#a8d2ac'], ['#f0d6ec', '#d6a9ce']] },
    ].map((s, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: i === 0 ? 7 : 0 }}>
        <div style={{ flex: 1, height: 28, border: `1px solid ${C.faint}`, borderRadius: 3, background: '#fff', display: 'flex', gap: 3, padding: 3 }}>
          {s.segs.map(([bg, bd], j) => (<div key={j} style={{ flex: 1, background: bg, border: `1px solid ${bd}`, borderRadius: 2 }} />))}
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.green, width: 26, textAlign: 'right', ...numeric }}>{s.pct}</span>
      </div>
    ))}
    <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>29 parts · 2 sheets</div>
  </MiniWin>
);

const ArtCabinet: React.FC = () => (
  <MiniWin>
    <Row l="Materials" v="£420" />
    <Row l="Labour · 9.6 hrs" v="£575" />
    <div style={{ borderTop: `1px solid ${C.borderSoft}`, marginTop: 5, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>9.6 hrs</span>
      <span style={{ fontSize: 23, fontWeight: 900, color: C.accent, letterSpacing: '-0.5px', ...numeric }}>£1,111</span>
    </div>
  </MiniWin>
);

const ArtSchedule: React.FC = () => (
  <MiniWin pad={8}>
    <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
      {['M', 'T', 'W', 'T', 'F'].map((d, i) => (<div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 8.5, fontWeight: 700, color: C.muted }}>{d}</div>))}
    </div>
    {[[0, 3, C.accent], [2, 4, C.teal]].map(([s, e, col], r) => (
      <div key={r} style={{ display: 'flex', gap: 3, marginBottom: 4, height: 16 }}>
        {[0, 1, 2, 3, 4].map((c) => (
          <div key={c} style={{ flex: 1, borderRadius: 3, background: c >= (s as number) && c < (e as number) ? (col as string) : C.surface2, border: `1px solid ${c >= (s as number) && c < (e as number) ? 'transparent' : C.borderSoft}` }} />
        ))}
      </div>
    ))}
  </MiniWin>
);

const ArtPipeline: React.FC = () => (
  <MiniWin pad={8}>
    <div style={{ display: 'flex', gap: 5 }}>
      {[['Quote', false], ['Order', true], ['Invoice', false]].map(([l, on]) => (
        <div key={l as string} style={{ flex: 1 }}>
          <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.3px', color: on ? C.accent : C.muted, marginBottom: 3, textAlign: 'center' }}>{(l as string).toUpperCase()}</div>
          <div style={{ height: 40, borderRadius: 5, border: `1px solid ${on ? C.accent : C.border}`, background: on ? 'rgba(232,168,56,0.10)' : C.surface2, display: 'flex', flexDirection: 'column', gap: 3, padding: 4 }}>
            <div style={{ height: 5, borderRadius: 2, background: on ? C.accent : C.borderSoft }} />
            <div style={{ height: 5, borderRadius: 2, background: C.borderSoft, width: '70%' }} />
          </div>
        </div>
      ))}
    </div>
  </MiniWin>
);

const ArtDashboard: React.FC = () => (
  <MiniWin pad={8}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
      {[['Quotes', '12'], ['Revenue', '£38k'], ['Next 7d', '5'], ['Low stock', '2']].map(([l, v], i) => (
        <div key={i} style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 5, padding: '4px 6px' }}>
          <div style={{ fontSize: 7.5, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{l}</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: i === 3 ? C.red : C.ink, ...numeric }}>{v}</div>
        </div>
      ))}
    </div>
  </MiniWin>
);

const POSTS: Tile[] = [
  { n: 1, pillar: 'Cut List', format: 'Reel', type: 'A', bg: 'ink', title: <>Still drawing cut lists by <Amber>hand?</Amber></>, art: <ArtCutList /> },
  { n: 2, pillar: 'My Rates', format: 'Single', type: 'B', bg: 'light', title: <>Set your rates <Amber>once</Amber><Dot /></>, art: null },
  { n: 3, pillar: 'Cabinet', format: 'Reel', type: 'A', bg: 'ink', title: <>Price a cabinet to the <Amber>penny</Amber><Dot /></>, art: <ArtCabinet /> },
  { n: 4, pillar: 'Auto-Schedule', format: 'Carousel', type: 'A', bg: 'light', title: <>Production that <Amber>schedules itself</Amber><Dot /></>, art: <ArtSchedule /> },
  { n: 5, pillar: 'Eight tabs', format: 'Single', type: 'C', bg: 'ink', title: <>Eight tabs. <Amber>One workshop</Amber><Dot /></>, art: null },
  { n: 6, pillar: 'Pipeline', format: 'Carousel', type: 'A', bg: 'light', title: <>One job, one <Amber>pipeline</Amber><Dot /></>, art: <ArtPipeline /> },
  { n: 7, pillar: 'Dashboard', format: 'Single', type: 'A', bg: 'ink', title: <>Your whole shop on <Amber>one screen</Amber><Dot /></>, art: <ArtDashboard /> },
  { n: 8, pillar: 'Stock', format: 'Single', type: 'B', bg: 'light', title: <>Stock that stays <Amber>honest</Amber><Dot /></>, art: null },
  { n: 9, pillar: 'Free to start', format: 'Single', type: 'C', bg: 'light', title: <>Free to start. <Amber>No card</Amber><Dot /></>, art: null },
];

const Wordmark: React.FC<{ light?: boolean; size?: number }> = ({ light, size = 13 }) => (
  <div style={{ fontSize: size, fontWeight: 800, letterSpacing: '-0.3px', color: light ? '#fff' : C.ink }}>
    ProCabinet<span style={{ color: C.accent }}>.App</span>
  </div>
);

const TypeTag: React.FC<{ t: 'A' | 'B' | 'C'; light?: boolean }> = ({ t, light }) => {
  const label = t === 'A' ? 'A · image' : t === 'B' ? 'B · text' : 'C · icon';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', color: light ? 'rgba(255,255,255,0.6)' : C.muted, border: `1px solid ${light ? 'rgba(255,255,255,0.2)' : C.border}`, borderRadius: 5, padding: '2px 6px', textTransform: 'uppercase' }}>{label}</span>
  );
};

const TileCard: React.FC<{ t: Tile }> = ({ t }) => {
  const ink = t.bg === 'ink';
  const Ico = (TAB_ICONS as Record<string, React.FC<{ size?: number; color?: string }>>)[
    t.pillar === 'Cut List' ? 'cutlist' : t.pillar === 'Cabinet' ? 'cabinet' : t.pillar === 'Auto-Schedule' ? 'schedule' : t.pillar === 'Pipeline' ? 'orders' : t.pillar === 'Dashboard' ? 'dashboard' : t.pillar === 'My Rates' ? 'cabinet' : t.pillar === 'Stock' ? 'stock' : 'dashboard'
  ];
  const titleSize = t.type === 'B' ? 30 : 23;
  return (
    <div style={{ width: TILE_W, height: TILE_H, borderRadius: 16, overflow: 'hidden', border: `1px solid ${ink ? 'rgba(255,255,255,0.10)' : C.border}`, position: 'relative', ...(ink ? inkBg : lightBg) }}>
      <div style={{ position: 'absolute', inset: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
        {/* top */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark light={ink} />
          <TypeTag t={t.type} light={ink} />
        </div>

        {/* body by type */}
        {t.type === 'B' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: titleSize, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.6px', color: ink ? '#fff' : C.ink }}>{t.title}</div>
            <div style={{ fontSize: 12, fontWeight: 500, color: ink ? 'rgba(255,255,255,0.62)' : C.text2, marginTop: 10 }}>
              {t.pillar === 'My Rates' ? 'labour · hours · markup · tax' : 'valued and deducted as you cut'}
            </div>
          </div>
        )}

        {t.type === 'A' && (
          <>
            <div style={{ marginTop: 12, fontSize: titleSize, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.5px', color: ink ? '#fff' : C.ink }}>{t.title}</div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', marginTop: 10 }}>
              <div style={{ width: '100%' }}>{t.art}</div>
            </div>
          </>
        )}

        {t.type === 'C' && t.pillar === 'Eight tabs' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
            <div style={{ transform: 'scale(0.9)', transformOrigin: 'left center' }}>
              <IconStrip light size={18} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.5px', color: '#fff' }}>{t.title}</div>
          </div>
        )}

        {t.type === 'C' && t.pillar === 'Free to start' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Wordmark size={30} />
            <div style={{ fontSize: 19, fontWeight: 800, color: C.ink, marginTop: 8 }}>Free to start. <Amber>No card</Amber><Dot /></div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text2, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoCheck size={13} color={C.accent} /> 5 of each · built by a maker
            </div>
          </div>
        )}

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: ink ? 'rgba(255,255,255,0.66)' : C.muted, fontSize: 11.5, fontWeight: 600 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ico size={14} color={t.bg === 'ink' ? C.accent : C.accent} />
            <span style={{ color: ink ? 'rgba(255,255,255,0.82)' : C.text }}>{t.n} · {t.pillar}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t.format}{t.format === 'Reel' && <IcoArrowRight size={12} color={ink ? 'rgba(255,255,255,0.66)' : C.muted} />}</span>
        </div>
      </div>
    </div>
  );
};

export const SeriesGrid: React.FC = () => (
  <AbsoluteFill style={{ background: '#e9e9e9', fontFamily: FONT }}>
    <div style={{ padding: PAD }}>
      <div style={{ height: HEADER_H, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '2px', textTransform: 'uppercase', color: C.accent }}>Next series · 9 posts</div>
        <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-1px', color: C.ink, marginTop: 4 }}>One full grid<span style={{ color: C.accent }}>.</span> <span style={{ fontSize: 20, fontWeight: 600, color: C.muted, letterSpacing: 0 }}>image / text / icon, one design language</span></div>
      </div>
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: `repeat(3, ${TILE_W}px)`, gap: GAP }}>
        {POSTS.map((t) => (<TileCard key={t.n} t={t} />))}
      </div>
    </div>
  </AbsoluteFill>
);
