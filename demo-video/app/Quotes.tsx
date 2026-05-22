import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { C, QUOTES } from '../theme';
import { SmartInput, SideLabel, ContentHeader, GhostBtn, Badge, statusTone } from './ui';
import { TabIcon } from '../icons';
import { PopIn, Reveal, EASE_OUT, clampOpts } from '../primitives';

const STAGES = ['Draft', 'Sent', 'Approved'];

const Pipeline: React.FC<{ stage: number; delay: number; converting?: boolean }> = ({ stage, delay, converting }) => {
  const frame = useCurrentFrame();
  // Animate the filled portion to the current stage (or one past, when converting).
  const target = converting ? interpolate(frame, [delay + 20, delay + 44], [stage, stage + 1], { ...clampOpts, easing: EASE_OUT }) : stage;
  const fill = interpolate(frame, [delay, delay + 22], [0, target], { ...clampOpts, easing: EASE_OUT });
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 4px 8px' }}>
      <div style={{ position: 'absolute', left: 8, right: 8, top: 5, height: 3, background: C.border, borderRadius: 2 }} />
      <div style={{ position: 'absolute', left: 8, top: 5, height: 3, width: `calc((100% - 16px) * ${fill / (STAGES.length - 1)})`, background: C.accent2, borderRadius: 2 }} />
      {STAGES.map((s, i) => {
        const done = fill >= i - 0.05;
        return (
          <div key={s} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: i === 0 ? 'flex-start' : i === STAGES.length - 1 ? 'flex-end' : 'center', flex: 1 }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: done ? C.accent2 : C.surface, border: `2.5px solid ${done ? C.accent2 : C.border}`, zIndex: 1 }} />
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5, color: done ? C.accent2 : C.muted, textTransform: 'uppercase', marginTop: 6 }}>{s}</span>
          </div>
        );
      })}
    </div>
  );
};

const note = (status: string) => {
  switch (status) {
    case 'Draft': return 'Draft — pricing in progress.';
    case 'Sent': return 'Sent — awaiting client sign-off.';
    case 'Approved': return 'Approved — ready to convert to an order.';
    default: return '';
  }
};

const QuoteCard: React.FC<{ q: (typeof QUOTES)[number]; delay: number; convert?: boolean }> = ({ q, delay, convert }) => (
  <PopIn delay={delay} from={0.98}>
    <div style={{ background: C.surface, border: `1px solid ${convert ? C.accent : C.border}`, borderRadius: 12, padding: '14px 18px', marginBottom: 13, boxShadow: convert ? `0 0 0 3px ${C.accentDim}` : '0 1px 4px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{q.no} · {q.client} · {q.project}</span>
          <Badge tone={statusTone(q.status)}>{q.status}</Badge>
        </div>
        <span style={{ fontSize: 19, fontWeight: 800, color: C.text }}>{q.price}</span>
      </div>
      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 5 }}>{note(q.status)}</div>
      <Pipeline stage={q.stage} delay={delay} converting={convert} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <GhostBtn>PDF</GhostBtn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: convert ? '#fff' : C.text2, background: convert ? C.accent : C.surface, border: `1px solid ${convert ? C.accent : C.border}`, borderRadius: 7, padding: '7px 12px' }}>Create Order</div>
          <GhostBtn>Duplicate</GhostBtn>
          <GhostBtn danger>Delete</GhostBtn>
        </div>
      </div>
    </div>
  </PopIn>
);

const FilterPill: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
  <div style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? '#fff' : C.text2, background: active ? C.accent : C.surface, border: `1px solid ${active ? C.accent : C.border}`, borderRadius: 20, padding: '6px 14px' }}>{children}</div>
);

export const Quotes: React.FC<{ convertApproved?: boolean }> = ({ convertApproved }) => {
  const clients = ['Westside Property Group', 'Daniel & Emma Cole', 'Priya Nair', 'James Whitfield', 'Sarah Mitchell'];
  // In the convert beat, show 3 cards so the Approved card sits clearly above the caption.
  const show = convertApproved ? [QUOTES[0], QUOTES[1], QUOTES[3]] : QUOTES.slice(0, 4);
  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ width: 320, flexShrink: 0, background: C.surface, borderRight: `1px solid ${C.border}`, padding: 22 }}>
        <div style={{ textAlign: 'center', marginTop: 6, marginBottom: 16 }}>
          <div style={{ color: C.muted, marginBottom: 8 }}><TabIcon tab="quotes" size={38} strokeWidth={1.4} /></div>
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Quotes</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Pick a client to start a new quote.</div>
        </div>
        <SmartInput placeholder="Search or add client..." />
        <SideLabel>Recent Clients</SideLabel>
        {clients.map((c) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 0', fontSize: 13, color: C.text2 }}>
            <span style={{ color: C.accent }}><TabIcon tab="clients" size={14} /></span>{c}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, background: C.bg, padding: '16px 22px', overflow: 'hidden' }}>
        <ContentHeader icon={<span style={{ color: C.accent }}><TabIcon tab="quotes" size={20} /></span>} title="Quotes" right={<div style={{ display: 'flex', gap: 7 }}><GhostBtn>Export</GhostBtn><GhostBtn>Import</GhostBtn></div>} />
        <Reveal style={{ display: 'flex', gap: 8, marginBottom: 16 }} delay={2}>
          <FilterPill active>All (5)</FilterPill><FilterPill>Draft (1)</FilterPill><FilterPill>Sent (2)</FilterPill><FilterPill>Approved (2)</FilterPill>
        </Reveal>
        {show.map((q, i) => (
          <QuoteCard key={q.no} q={q} delay={6 + i * 6} convert={convertApproved && i === show.length - 1} />
        ))}
      </div>
    </div>
  );
};
