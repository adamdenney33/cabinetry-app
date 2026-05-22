/**
 * Persistent app chrome: browser frame + black ink header + 8-tab strip.
 * Every screen renders inside this so the demo reads as one continuous app session.
 * Pixel values mirror styles.css (header 56px, tab strip #e2e2e2, etc).
 */
import React from 'react';
import { C, WIN, BRAND, TABS, TabId } from '../theme';
import { TabIcon } from '../icons';

// Geometry helpers so the cursor can target chrome elements in window-local px.
const TAB_PAD = 50;
const TAB_AREA = WIN.width - TAB_PAD * 2;
const TAB_W = TAB_AREA / TABS.length;
export const tabCenter = (id: TabId): { x: number; y: number } => {
  const i = Math.max(0, TABS.findIndex((t) => t.id === id));
  return { x: TAB_PAD + TAB_W * (i + 0.5), y: 40 + WIN.headerH + 23 };
};
/** Y of the content area's top edge, in window-local px. */
export const CONTENT_TOP = 40 + WIN.headerH + WIN.tabH;

const HeaderBtn: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      width: 32,
      height: 32,
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 7,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#aaa',
    }}
  >
    {children}
  </div>
);

const ic = (children: React.ReactNode, sw = 2) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export const AppWindow: React.FC<{ activeTab: TabId; children: React.ReactNode; overlay?: React.ReactNode }> = ({ activeTab, children, overlay }) => {
  return (
    <div
      style={{
        width: WIN.width,
        height: WIN.height,
        background: C.surface,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'inherit',
      }}
    >
      {/* Browser bar */}
      <div style={{ height: 40, background: '#e6e6e8', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, flexShrink: 0, borderBottom: '1px solid #d4d4d6' }}>
        <span style={{ display: 'flex', gap: 8 }}>
          <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
          <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
          <i style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
        </span>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 8, height: 26, minWidth: 360, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, color: '#666', fontSize: 13, fontWeight: 500, border: '1px solid #dcdcde' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3d9970" strokeWidth="2.2"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
            {BRAND.url}
          </div>
        </div>
        <span style={{ width: 60 }} />
      </div>

      {/* App header (black ink bar) */}
      <div style={{ height: WIN.headerH, background: C.headerBg, color: C.headerFg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0, boxShadow: '0 1px 0 rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.5, color: '#fff' }}>{BRAND.name}</div>
          <div style={{ fontSize: 9, fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', padding: '2px 6px', borderRadius: 4, letterSpacing: 0.8, textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.12)' }}>{BRAND.badge}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HeaderBtn>{ic(<><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /></>)}</HeaderBtn>
          <HeaderBtn>{ic(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>)}</HeaderBtn>
          <HeaderBtn>{ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" /></>)}</HeaderBtn>
          <HeaderBtn>{ic(<><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>)}</HeaderBtn>
        </div>
      </div>

      {/* Tab strip */}
      <div style={{ background: C.tabbar, flexShrink: 0, position: 'relative', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 50px 0 50px', gap: 2 }}>
          {TABS.map((t) => {
            const active = t.id === activeTab;
            return (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  padding: '9px 0 11px',
                  flex: '1 1 0',
                  minWidth: 0,
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  color: active ? C.text : C.muted,
                  background: active ? C.surface : 'transparent',
                  border: active ? `1px solid ${C.border}` : '1px solid transparent',
                  borderBottomColor: active ? C.surface : 'transparent',
                  borderRadius: '8px 8px 0 0',
                  marginBottom: -1,
                  position: 'relative',
                }}
              >
                <TabIcon tab={t.id} size={15} />
                <span>{t.label}</span>
                {t.badge && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: t.badgeColor ?? C.accent, color: '#fff', padding: '1px 6px', borderRadius: 10, marginLeft: 1 }}>{t.badge}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, background: C.bg, overflow: 'hidden', position: 'relative' }}>{children}</div>

      {/* Full-window overlay (cursor lives here so it can point at chrome too) */}
      {overlay && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{overlay}</div>}
    </div>
  );
};
