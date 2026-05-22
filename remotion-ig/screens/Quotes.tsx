// Quotes tab — the line-items + totals panel (money shot) and the client's
// quote cards with the Draft→Sent→Approved pipeline.
import React from 'react';
import { C } from '../theme';
import { FONT, numeric } from '../fonts';
import { Badge, Btn, Stepper } from '../ui';
import { IcoPlus, IcoArrowRight } from '../icons';

const LINES: [string, string, string][] = [
  ['Base Cabinet 600', '× 4', '£748'],
  ['Wall Cabinet 600', '× 3', '£581'],
  ['Drawer Base 800', '× 1', '£375'],
  ['Install & fit-off', '× 1', '£0'],
];

export const QuoteLinesPanel: React.FC<{ big?: boolean }> = ({ big = true }) => (
  <div
    style={{
      width: big ? 640 : '100%',
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      boxShadow: big ? '0 24px 60px rgba(17,17,17,0.16)' : '0 1px 3px rgba(17,17,17,0.05)',
      padding: 28,
      fontFamily: FONT,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>QUO-1042</div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 3 }}>Mitchell Kitchen Renovation</div>
      </div>
      <Badge tone="approved">Approved</Badge>
    </div>

    <div style={{ marginTop: 18, borderTop: `1px solid ${C.borderSoft}` }}>
      <div style={{ display: 'flex', padding: '10px 0 8px', fontSize: 12.5, fontWeight: 700, letterSpacing: '0.4px', color: C.muted }}>
        <span style={{ flex: 3 }}>DESCRIPTION</span>
        <span style={{ flex: 1, textAlign: 'center' }}>QTY</span>
        <span style={{ flex: 1, textAlign: 'right' }}>TOTAL</span>
      </div>
      {LINES.map((l) => (
        <div key={l[0]} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.borderSoft}`, fontSize: 17 }}>
          <span style={{ flex: 3, fontWeight: 600, color: C.text }}>{l[0]}</span>
          <span style={{ flex: 1, textAlign: 'center', color: C.muted, ...numeric }}>{l[1]}</span>
          <span style={{ flex: 1, textAlign: 'right', fontWeight: 800, color: C.text, ...numeric }}>{l[2]}</span>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      {['Cabinet', 'Item', 'Stock'].map((t) => (
        <div key={t} style={{ flex: 1, height: 42, border: `1px dashed ${C.border}`, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14.5, fontWeight: 700, color: C.text2 }}>
          <IcoPlus size={16} color={C.accent} /> {t}
        </div>
      ))}
    </div>

    <div style={{ marginTop: 18, background: C.surface2, borderRadius: 12, padding: '16px 18px' }}>
      {[
        ['Subtotal', '£1,704', false],
        ['Tax (10%)', '+£170', false],
      ].map(([l, v]) => (
        <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 16, color: C.text2 }}>
          <span>{l}</span>
          <span style={{ ...numeric, fontWeight: 600, color: C.text }}>{v}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 20, fontWeight: 800, color: C.text }}>TOTAL</span>
        <span style={{ fontSize: 38, fontWeight: 900, color: C.accent, letterSpacing: '-1px', ...numeric }}>£1,874</span>
      </div>
    </div>
  </div>
);

// quote cards column (client view) with pipeline
const QuoteCard: React.FC<{
  code: string;
  project: string;
  price: string;
  tone: 'draft' | 'approved';
  stage: number;
  note: string;
  primary: string;
}> = ({ code, project, price, tone, stage, note, primary }) => (
  <div style={{ background: C.surface, border: `1px solid ${tone === 'approved' ? C.accent : C.border}`, borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(17,17,17,0.05)', fontFamily: FONT }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{code}</span>
          <Badge tone={tone}>{tone === 'approved' ? 'Approved' : 'Draft'}</Badge>
        </div>
        <div style={{ fontSize: 14.5, color: C.muted, marginTop: 4 }}>{project}</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, color: C.text, ...numeric }}>{price}</div>
    </div>
    <div style={{ margin: '18px 0 14px' }}>
      <Stepper steps={['DRAFT', 'SENT', 'APPROVED']} active={stage} />
    </div>
    <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 14 }}>{note}</div>
    <div style={{ display: 'flex', gap: 8 }}>
      <Btn variant="amber">{primary}</Btn>
      <Btn>PDF</Btn>
      <Btn variant="link">Duplicate</Btn>
    </div>
  </div>
);

export const QuotesScreen: React.FC = () => (
  <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, fontFamily: FONT }}>
    <div style={{ display: 'flex', gap: 8 }}>
      {[['All', 2, true], ['Draft', 1, false], ['Sent', 0, false], ['Approved', 1, false]].map((f) => (
        <div key={f[0] as string} style={{ padding: '8px 16px', borderRadius: 20, fontSize: 14, fontWeight: 700, background: f[2] ? C.accent : C.surface, color: f[2] ? '#1a1a1a' : C.text2, border: `1px solid ${f[2] ? 'transparent' : C.border}` }}>
          {f[0]} ({f[1] as number})
        </div>
      ))}
    </div>
    <QuoteCard code="QUO-1044" project="Sarah Mitchell · Walk-in Robe" price="£2,891" tone="draft" stage={0} note="Draft — pricing in progress." primary="Send Quote" />
    <QuoteCard code="QUO-1042" project="Sarah Mitchell · Kitchen Renovation" price="£2,530" tone="approved" stage={2} note="Approved — ready to convert to an order." primary="Create Order" />
  </div>
);
