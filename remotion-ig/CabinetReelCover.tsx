// Static 9:16 cover / poster for the cabinet-tab reel (1080×1920). Usable as the
// video thumbnail on LinkedIn and Meta (Reels): pairs the hook with the price
// breakdown "money shot" so the value reads in a single frame. Numbers mirror
// BASE_CAB so the cover matches the reel exactly.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from './theme';
import { FONT, numeric } from './fonts';
import { IcoCheck } from './icons';
import { BASE_CAB } from './screens/Builder';

export const COVER_FPS = 30;
export const COVER_DURATION = 1; // static still

const Amber: React.FC<React.PropsWithChildren> = ({ children }) => <span style={{ color: C.accent }}>{children}</span>;

export const CabinetReelCover: React.FC = () => {
  const d = BASE_CAB;
  const cost: [string, string][] = [
    ['Materials', d.materials],
    [`Labour · ${d.labourNote}`, d.labour],
    ['Contingency (5%)', 'incl.'],
    ['Hardware', d.hardware],
  ];
  const build: [string, string, boolean][] = [
    ['Unit cost', d.unitCost, false],
    [`× ${d.units} units`, d.unitsTotal, true],
    [`Markup (${d.markupPct})`, d.markupVal, false],
    [`Tax (${d.taxPct})`, d.taxVal, false],
  ];
  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: FONT }}>
      <AbsoluteFill style={{ background: 'radial-gradient(960px 760px at 82% 4%, rgba(232,168,56,0.26), transparent 55%), radial-gradient(820px 720px at 4% 100%, rgba(13,148,136,0.17), transparent 55%)' }} />
      <AbsoluteFill style={{ padding: '96px 84px', display: 'flex', flexDirection: 'column' }}>
        {/* brand row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-0.5px', color: '#fff' }}>
            ProCabinet<span style={{ color: C.accent }}>.App</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '1.5px', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, padding: '8px 15px', textTransform: 'uppercase' }}>
            Cabinet builder
          </div>
        </div>

        {/* headline */}
        <div style={{ marginTop: 66 }}>
          <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: '-3.5px', lineHeight: 0.98, color: '#fff' }}>What if quoting</div>
          <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: '-3.5px', lineHeight: 0.98, color: '#fff' }}>was this <Amber>easy?</Amber></div>
          <div style={{ fontSize: 35, fontWeight: 500, color: 'rgba(255,255,255,0.74)', marginTop: 28 }}>Spec the parts, get instant pricing and timings.</div>
        </div>

        {/* the money-shot card, vertically centred in the remaining space */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 30, boxShadow: '0 50px 130px rgba(0,0,0,0.5)', padding: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 42, fontWeight: 800, color: C.ink }}>{d.name}</div>
              <div style={{ fontSize: 27, color: C.muted, ...numeric }}>{d.dims}</div>
            </div>
            <div style={{ marginTop: 22, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 14 }}>
              {cost.map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 28, color: C.text2 }}>
                  <span>{l}</span><span style={{ ...numeric, fontWeight: 600, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 14 }}>
              {build.map(([l, v, strong]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', fontSize: 28, color: strong ? C.ink : C.text2, fontWeight: strong ? 800 : 500 }}>
                  <span>{l}</span><span style={{ ...numeric, fontWeight: strong ? 800 : 600, color: C.ink }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18, paddingTop: 22, borderTop: `2px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.5px', color: C.muted }}>TIME</div>
                <div style={{ fontSize: 70, fontWeight: 900, color: C.ink, letterSpacing: '-1.5px', ...numeric }}>9.6 <span style={{ fontSize: 32, fontWeight: 700, color: C.muted }}>hrs</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '0.5px', color: C.muted }}>TOTAL</div>
                <div style={{ fontSize: 76, fontWeight: 900, color: C.accent, letterSpacing: '-2px', ...numeric }}>{d.price}</div>
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'rgba(255,255,255,0.82)', fontSize: 31 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IcoCheck size={29} color={C.accent} /> Free to start, no card.
          </div>
          <div style={{ fontWeight: 800, color: C.accent }}>procabinet.app</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
