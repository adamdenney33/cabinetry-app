// Cabinet Builder tab — the editor sidebar (dimensions/materials), the live
// price cards with full cost breakdown, and the reusable cabinet library grid.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { Field, Btn } from '../ui';
import { IcoPlus, IcoChevronDown, IcoArrowRight, IcoCabinet } from '../icons';

// ── sidebar pieces ───────────────────────────────────────────────
const SectionHead: React.FC<{ title: string; price?: string; note?: string }> = ({ title, price, note }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      padding: '14px 0 10px',
      borderTop: `1px solid ${C.borderSoft}`,
    }}
  >
    <span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{title}</span>
    <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      {price && <span style={{ fontSize: 16, fontWeight: 800, color: C.accent, ...numeric }}>{price}</span>}
      {note && <span style={{ fontSize: 13, color: C.muted }}>{note}</span>}
    </span>
  </div>
);

const AddRow: React.FC<{ label: string }> = ({ label }) => (
  <div>
    <div style={{ fontSize: 13.5, color: C.text2, fontWeight: 600, margin: '10px 0 6px' }}>{label}</div>
    <div
      style={{
        height: 46,
        border: `1px dashed ${C.border}`,
        borderRadius: 9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 8px 0 14px',
        color: C.muted,
        fontSize: 15,
      }}
    >
      <span>Search…</span>
      <span style={{ width: 30, height: 30, borderRadius: 7, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IcoPlus size={17} color="#1a1a1a" />
      </span>
    </div>
  </div>
);

const SelectRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 13.5, color: C.text2, fontWeight: 600, margin: '10px 0 6px' }}>{label}</div>
    <div
      style={{
        height: 46,
        border: `1px solid ${C.border}`,
        borderRadius: 9,
        background: C.surface,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 14px',
        fontSize: 16,
        fontWeight: 600,
        color: C.text,
      }}
    >
      {value}
      <IcoChevronDown size={18} color={C.muted} />
    </div>
  </div>
);

const Stepper2: React.FC<{ n: number }> = ({ n }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: `1px solid ${C.border}`, borderRadius: 9, overflow: 'hidden', width: 120 }}>
    <div style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: C.muted }}>−</div>
    <div style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, borderLeft: `1px solid ${C.borderSoft}`, borderRight: `1px solid ${C.borderSoft}` }}>{n}</div>
    <div style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: C.accent }}>+</div>
  </div>
);

export const BuilderSidebar: React.FC = () => (
  <div style={{ width: 330, background: C.surface, borderRight: `1px solid ${C.border}`, padding: '18px 18px 22px', fontFamily: FONT }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: C.text2 }}>← QUO-1042</span>
      <span style={{ color: C.green, fontSize: 13, fontWeight: 800, letterSpacing: '0.6px' }}>SAVED</span>
    </div>

    <div style={{ fontSize: 13.5, color: C.text2, fontWeight: 600, marginBottom: 6 }}>NAME</div>
    <div style={{ height: 48, border: `1px solid ${C.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
      Base Cabinet 600
    </div>

    <SectionHead title="Cabinet" price="£112" note="600×720×560" />
    <div style={{ display: 'flex', gap: 10 }}>
      <Field label="Width" value="600" />
      <Field label="Height" value="720" />
      <Field label="Depth" value="560" />
    </div>
    <AddRow label="Carcass Material" />
    <SelectRow label="Carcass Type" value="Standard" />
    <SelectRow label="Finish" value="None" />

    <SectionHead title="Doors" price="£51" note="2 doors" />
    <div style={{ fontSize: 13.5, color: C.text2, fontWeight: 600, margin: '6px 0 6px' }}>Count</div>
    <Stepper2 n={2} />
    <AddRow label="Door Material" />
  </div>
);

// ── live price card ──────────────────────────────────────────────
export type CabinetData = {
  name: string;
  dims: string;
  price: string;
  materials: string;
  labour: string;
  labourNote: string;
  hardware: string;
  unitCost: string;
  units: number;
  unitsTotal: string;
  markupPct: string;
  markupVal: string;
  taxPct: string;
  taxVal: string;
  meta: string;
};

export const CabinetCard: React.FC<{ d: CabinetData; big?: boolean; actions?: boolean; compact?: boolean }> = ({ d, big, actions = true, compact }) => {
  const fs = big ? 1.18 : 1;
  if (compact) {
    return (
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 1px 3px rgba(17,17,17,0.05)', padding: 18, fontFamily: FONT, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{d.name}</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 3, ...numeric }}>{d.dims} mm · {d.meta}</div>
        </div>
        <div style={{ fontSize: 32, fontWeight: 900, color: C.accent, ...numeric }}>{d.price}</div>
      </div>
    );
  }
  return (
    <div
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        boxShadow: big ? '0 24px 60px rgba(17,17,17,0.16)' : '0 1px 3px rgba(17,17,17,0.05)',
        padding: big ? 28 : 18,
        fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 22 * fs, fontWeight: 800, color: C.text }}>{d.name}</div>
          <div style={{ fontSize: 14.5 * fs, color: C.muted, marginTop: 4, ...numeric }}>{d.dims} mm</div>
        </div>
        <div style={{ fontSize: 40 * fs, fontWeight: 900, color: C.accent, letterSpacing: '-1px', ...numeric }}>{d.price}</div>
      </div>

      <div style={{ marginTop: big ? 20 : 14, borderTop: `1px solid ${C.borderSoft}`, paddingTop: big ? 14 : 10 }}>
        {[
          ['Materials', d.materials],
          [`Labour  (${d.labourNote})`, d.labour],
          ['Contingency (5%)', 'incl.'],
          ['Hardware', d.hardware],
        ].map(([l, v]) => (
          <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: `${big ? 6 : 4.5}px 0`, fontSize: 16 * fs, color: C.text2 }}>
            <span>{l}</span>
            <span style={{ ...numeric, fontWeight: 600, color: C.text }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: big ? 14 : 10, borderTop: `1px solid ${C.borderSoft}`, paddingTop: big ? 14 : 10 }}>
        {[
          ['Unit Cost', d.unitCost, false],
          [`× ${d.units} units`, d.unitsTotal, true],
          [`Markup (${d.markupPct})`, d.markupVal, false],
          [`Tax (${d.taxPct})`, d.taxVal, false],
        ].map(([l, v, strong]) => (
          <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: `${big ? 6 : 4.5}px 0`, fontSize: 16 * fs, color: strong ? C.text : C.text2, fontWeight: strong ? 800 : 500 }}>
            <span>{l}</span>
            <span style={{ ...numeric, fontWeight: strong ? 800 : 600, color: C.text }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: big ? 16 : 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14.5 * fs, color: C.muted }}>{d.meta}</span>
        {actions && (
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn>Add to Library</Btn>
            <Btn variant="link">Duplicate</Btn>
          </div>
        )}
      </div>
    </div>
  );
};

export const BASE_CAB: CabinetData = {
  name: 'Base Cabinet 600',
  dims: '600 × 720 × 560',
  price: '£1,111',
  materials: '£7.83',
  labour: '£179.22',
  labourNote: '2.4 hrs @ £75/hr',
  hardware: '£0',
  unitCost: '£187',
  units: 4,
  unitsTotal: '£748',
  markupPct: '35%',
  markupVal: '+£262',
  taxPct: '10%',
  taxVal: '+£101',
  meta: '2 doors · 1 shelf',
};

const WALL_CAB: CabinetData = {
  name: 'Wall Cabinet 600',
  dims: '600 × 720 × 320',
  price: '£862',
  materials: '£9.24',
  labour: '£184.35',
  labourNote: '2.5 hrs @ £75/hr',
  hardware: '£0',
  unitCost: '£194',
  units: 3,
  unitsTotal: '£581',
  markupPct: '35%',
  markupVal: '+£203',
  taxPct: '10%',
  taxVal: '+£78',
  meta: '2 doors · 2 shelves',
};

// full builder screen: editor sidebar + main quote-builder column
export const BuilderScreen: React.FC = () => (
  <div style={{ display: 'flex', minHeight: 560, fontFamily: FONT }}>
    <BuilderSidebar />
    <div style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, color: C.muted, fontWeight: 600 }}>3 cabinets · 8 units</span>
        <Btn>
          Go to Quote <IcoArrowRight size={17} color={C.text} />
        </Btn>
      </div>
      <CabinetCard d={BASE_CAB} />
      <CabinetCard d={WALL_CAB} compact />
      <CabinetCard d={{ ...BASE_CAB, name: 'Drawer Base 800', dims: '800 × 720 × 560', price: '£557' }} compact />
    </div>
  </div>
);

// money shot: one big live price card
export const PriceMoneyShot: React.FC = () => (
  <div style={{ width: 660 }}>
    <CabinetCard d={BASE_CAB} big actions={false} />
  </div>
);

// ── cabinet library grid ─────────────────────────────────────────
const LibItem: React.FC<{ name: string; dims: string; price: string; units: string }> = ({ name, dims, price, units }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(17,17,17,0.05)' }}>
    <div style={{ width: 46, height: 46, borderRadius: 10, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
      <IcoCabinet size={26} color={C.accent} />
    </div>
    <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{name}</div>
    <div style={{ fontSize: 14, color: C.muted, marginTop: 4, ...numeric }}>{dims} mm</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, borderTop: `1px solid ${C.borderSoft}`, paddingTop: 12 }}>
      <span style={{ fontSize: 13.5, color: C.muted }}>{units}</span>
      <span style={{ fontSize: 22, fontWeight: 900, color: C.accent, ...numeric }}>{price}</span>
    </div>
  </div>
);

export const LibraryScreen: React.FC = () => (
  <div style={{ padding: 22, fontFamily: FONT }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Cabinet Library</span>
      <span style={{ fontSize: 15, color: C.muted, fontWeight: 600 }}>12 reusable cabinets</span>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      <LibItem name="Base Cabinet 600" dims="600 × 720 × 560" price="£1,111" units="2 doors · 1 shelf" />
      <LibItem name="Wall Cabinet 600" dims="600 × 720 × 320" price="£862" units="2 doors · 2 shelves" />
      <LibItem name="Drawer Base 800" dims="800 × 720 × 560" price="£557" units="3 drawers" />
      <LibItem name="Pantry Tower 600" dims="600 × 2100 × 560" price="£1,640" units="2 doors · 5 shelves" />
      <LibItem name="Corner Base 900" dims="900 × 720 × 900" price="£980" units="1 door · carousel" />
      <LibItem name="Open Shelf 1200" dims="1200 × 300 × 250" price="£312" units="floating" />
    </div>
  </div>
);
