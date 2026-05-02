/* Sidebar — left navigation rail. Design System v3 (siehe DESIGN.md). */

import { useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import { useMe } from '../hooks/useMe.js';
import { Mark } from './Logo.jsx';
import { T, Badge } from './ui.jsx';
import { UserSwitcher } from './UserSwitcher.jsx';

export const SIDEBAR_WIDTH = 224;

export function Sidebar({ route, onRoute }) {
  const { queue, history, current } = useAppState();
  const me = useMe().data;

  const items = [
    {
      id: 'workspace',
      label: current ? 'Workflow' : 'Upload',
      sub:   current ? 'Auftrag bearbeiten' : 'Datei laden',
      counter: queue.length > 0 ? queue.length : null,
      icon: <IconUpload />,
    },
    {
      id: 'historie',
      label: 'Historie',
      sub: 'Abgeschlossene Aufträge',
      counter: history.length > 0 ? history.length : null,
      icon: <IconHistory />,
    },
    {
      id: 'einstellungen',
      label: 'Einstellungen',
      sub: 'System & Defaults',
      icon: <IconSettings />,
    },
    /* Admin nav — only when /api/me reports role=admin. */
    me?.role === 'admin' && {
      id: 'admin',
      label: 'Admin',
      sub: 'Übersicht & Benutzer',
      icon: <IconAdmin />,
    },
  ].filter(Boolean);

  return (
    <aside style={{
      width: SIDEBAR_WIDTH,
      height: '100vh',
      position: 'sticky',
      top: 0,
      background: T.bg.surface,
      borderRight: `1px solid ${T.border.primary}`,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      zIndex: 20,
      fontFamily: T.font.ui,
    }}>
      {/* Brand */}
      <div style={{
        padding: '20px 18px',
        borderBottom: `1px solid ${T.border.primary}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Mark size={28} color={T.text.primary} />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{
            fontSize: 14,
            fontWeight: 600,
            color: T.text.primary,
            letterSpacing: '-0.01em',
          }}>
            Marathon
          </span>
          <span style={{
            fontSize: 11.5,
            color: T.text.subtle,
            fontWeight: 500,
          }}>
            Lager
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        padding: '12px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        {items.map((it) => (
          <NavItem
            key={it.id}
            item={it}
            active={route === it.id}
            onClick={() => onRoute(it.id)}
          />
        ))}
      </nav>

      {/* Queue — always visible */}
      <QueueSection />

      {/* User identity / switcher */}
      <UserSwitcher />

      {/* Build label */}
      <div style={{
        padding: '4px 18px 14px',
        fontSize: 10.5,
        color: T.text.faint,
      }}>
        Marathon · v 2.0.0
      </div>
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function QueueSection() {
  const { queue, current, addFiles, removeFromQueue, startEntry } = useAppState();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const arr = Array.from(files || []).filter((f) => /\.docx$/i.test(f.name));
    if (!arr.length) return;
    setBusy(true);
    try {
      const built = await addFiles(arr);
      // если нет активного workflow — auto-start первого добавленного
      if (!current && built[0]?.status === 'ready') {
        setTimeout(() => startEntry(built[0].id), 80);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      borderTop: `1px solid ${T.border.primary}`,
      padding: '12px 12px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 4px',
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 500,
          color: T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          Warteschlange
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontSize: 11,
          color: queue.length > 0 ? T.text.secondary : T.text.faint,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {queue.length}
        </span>
      </div>

      {/* Drop / pick */}
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handleFiles(e.dataTransfer.files); }}
        disabled={busy}
        style={{
          padding: '10px 8px',
          background: over ? T.accent.bg : T.bg.surface2,
          border: `1px dashed ${over ? T.accent.main : T.border.strong}`,
          borderRadius: T.radius.md,
          cursor: busy ? 'wait' : 'pointer',
          transition: 'background 150ms, border-color 150ms',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          fontFamily: T.font.ui,
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".docx"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
        />
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke={over ? T.accent.main : T.text.subtle} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <span style={{
          fontSize: 12,
          fontWeight: 500,
          color: over ? T.accent.text : T.text.secondary,
        }}>
          {busy ? 'Wird verarbeitet…' : 'Datei hinzufügen'}
        </span>
        <span style={{ fontSize: 10.5, color: T.text.faint }}>
          .docx · klick oder drop
        </span>
      </button>

      {/* List */}
      {queue.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflowY: 'auto',
          minHeight: 0,
          marginRight: -4,
          paddingRight: 4,
        }}>
          {queue.map((entry, i) => (
            <QueueRow
              key={entry.id}
              entry={entry}
              isFirst={i === 0 && !current}
              onRemove={() => removeFromQueue(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({ entry, isFirst, onRemove }) {
  const fba = entry.parsed?.meta?.sendungsnummer || entry.parsed?.meta?.fbaCode || entry.fileName;
  const isError = entry.status === 'error';
  const palletCount = entry.parsed?.pallets?.length || 0;
  const articleCount = (entry.parsed?.pallets || []).reduce((s, p) => s + p.items.length, 0);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 8px',
      background: isError ? T.status.danger.bg
        : isFirst ? T.accent.bg
        : T.bg.surface2,
      border: `1px solid ${isError ? T.status.danger.border
        : isFirst ? T.accent.border
        : T.border.primary}`,
      borderRadius: T.radius.sm,
      minWidth: 0,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 11.5,
          fontWeight: 500,
          color: isError ? T.status.danger.text : T.text.primary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }} title={fba}>
          {fba}
        </div>
        <div style={{
          fontSize: 10.5,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
          marginTop: 1,
        }}>
          {isError ? 'Parse-Fehler' : `${palletCount} Pal · ${articleCount} Art`}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Aus Warteschlange entfernen"
        style={{
          width: 20, height: 20,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 0,
          borderRadius: T.radius.sm,
          color: T.text.faint,
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'background 150ms, color 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = T.status.danger.bg;
          e.currentTarget.style.color = T.status.danger.main;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = T.text.faint;
        }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function NavItem({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        background: active ? T.accent.bg : 'transparent',
        border: 0,
        borderRadius: T.radius.md,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 150ms',
        fontFamily: T.font.ui,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = T.bg.surface2;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span style={{
        display: 'inline-flex',
        width: 18,
        height: 18,
        flexShrink: 0,
        color: active ? T.accent.main : T.text.subtle,
      }}>
        {item.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5,
          fontWeight: active ? 600 : 500,
          color: active ? T.accent.text : T.text.primary,
          letterSpacing: '-0.005em',
          lineHeight: 1.2,
        }}>
          {item.label}
        </div>
        <div style={{
          fontSize: 11.5,
          color: T.text.subtle,
          marginTop: 2,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {item.sub}
        </div>
      </div>
      {item.counter != null && (
        <span style={{
          minWidth: 20,
          height: 20,
          padding: '0 6px',
          background: active ? T.accent.main : T.bg.surface3,
          color: active ? '#fff' : T.text.secondary,
          fontSize: 11,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: T.radius.full,
          letterSpacing: '0.01em',
        }}>
          {item.counter}
        </span>
      )}
      {item.tag && <Badge tone="accent">{item.tag}</Badge>}
    </button>
  );
}

/* ─── Icons (outline · stroke 1.6 · currentColor) ────────────────────── */
function IconUpload() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M15 11v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 6L9 3 6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M9 3v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
function IconHistory() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 9a6 6 0 1 0 1.6-4.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 3v3h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 1.5v2M9 14.5v2M3.5 3.5l1.4 1.4M13.1 13.1l1.4 1.4M1.5 9h2M14.5 9h2M3.5 14.5l1.4-1.4M13.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconAdmin() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L3 4.5v3.7c0 3.4 2.5 6.7 6 7.8 3.5-1.1 6-4.4 6-7.8V4.5L9 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
      <path d="M6.5 9l1.7 1.7L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
