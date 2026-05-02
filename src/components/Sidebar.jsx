/* Sidebar — left navigation rail.

   Five Sprint-3 polish features layered on top of the original v3 design:
     1. Collapse toggle (icon-only mode), persisted in localStorage,
        exposes width via --sidebar-width so floating bars in
        Pruefen/Focus/Abschluss reposition automatically.
     2. Active-workflow mini-progress block (stepper + counter).
     3. Quick "Start" button on queue rows, visible on hover.
     4. Native HTML5 drag-and-drop reordering of queue items.
     5. "Heute" stats line aggregated from history. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import { useMe } from '../hooks/useMe.js';
import { Mark } from './Logo.jsx';
import { T, Badge } from './ui.jsx';
import { UserSwitcher } from './UserSwitcher.jsx';

/* ─── Sidebar width: legacy export retained but prefer var(--sidebar-width)
   in screens. The CSS var is updated by useCollapsedSidebar() below. */
export const SIDEBAR_WIDTH = 224;

const W_EXPANDED  = 224;
const W_COLLAPSED = 64;
const COLLAPSED_KEY = 'marathon.sidebar.collapsed.v1';

function useCollapsedSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
    document.documentElement.style.setProperty(
      '--sidebar-width', `${collapsed ? W_COLLAPSED : W_EXPANDED}px`,
    );
  }, [collapsed]);
  return [collapsed, setCollapsed];
}

/* ════════════════════════════════════════════════════════════════════════ */

export function Sidebar({ route, onRoute }) {
  const { queue, history, current } = useAppState();
  const me = useMe().data;
  const [collapsed, setCollapsed] = useCollapsedSidebar();

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
    me?.role === 'admin' && {
      id: 'admin',
      label: 'Admin',
      sub: 'Übersicht & Benutzer',
      icon: <IconAdmin />,
    },
  ].filter(Boolean);

  return (
    <aside style={{
      width: collapsed ? W_COLLAPSED : W_EXPANDED,
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
      transition: 'width 220ms cubic-bezier(0.16, 1, 0.3, 1)',
      overflow: 'hidden',
    }}>
      <Brand collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />

      <nav style={{
        padding: collapsed ? '12px 8px' : '12px 10px',
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
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* QueueSection has flex:1 internally — let it fill all remaining
          space so long queues actually scroll inside their container.
          When collapsed we render a plain spacer instead, otherwise
          UserSwitcher would float to the top. */}
      {!collapsed
        ? <QueueSection />
        : <div style={{ flex: 1, minHeight: 0 }} />}

      {current && !collapsed && (
        <CurrentProgress current={current} onClick={() => onRoute('workspace')} />
      )}

      <UserSwitcher collapsed={collapsed} />

      {!collapsed && <TodayStats history={history} />}

      {!collapsed && (
        <div style={{
          padding: '4px 18px 14px',
          fontSize: 10.5,
          color: T.text.faint,
        }}>
          Marathon · v 2.1.0
        </div>
      )}
    </aside>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   BRAND + COLLAPSE TOGGLE
   ════════════════════════════════════════════════════════════════════════ */

function Brand({ collapsed, onToggle }) {
  return (
    <div style={{
      padding: collapsed ? '20px 0' : '20px 18px',
      borderBottom: `1px solid ${T.border.primary}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: collapsed ? 'center' : 'flex-start',
      gap: 10,
      position: 'relative',
    }}>
      <Mark size={collapsed ? 32 : 28} />
      {!collapsed && (
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
      )}

      {/* Collapse toggle — chevron rotates with state */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
        style={{
          position: 'absolute',
          right: collapsed ? 'auto' : 8,
          left:  collapsed ? '50%' : 'auto',
          bottom: collapsed ? -12 : 'auto',
          top:    collapsed ? 'auto' : '50%',
          transform: collapsed
            ? 'translateX(-50%)'
            : 'translateY(-50%)',
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: T.bg.surface,
          border: `1px solid ${T.border.strong}`,
          borderRadius: '50%',
          color: T.text.subtle,
          cursor: 'pointer',
          padding: 0,
          transition: 'background 120ms, color 120ms',
          zIndex: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = T.accent.bg;
          e.currentTarget.style.color = T.accent.main;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = T.bg.surface;
          e.currentTarget.style.color = T.text.subtle;
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" style={{
          transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
          transition: 'transform 200ms',
        }}>
          <path d="M3 2l3 3-3 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   NAV ITEM (collapse-aware)
   ════════════════════════════════════════════════════════════════════════ */

function NavItem({ item, active, onClick, collapsed }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? `${item.label} — ${item.sub}` : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10,
        width: '100%',
        padding: collapsed ? '10px 0' : '8px 10px',
        background: active ? T.accent.bg : 'transparent',
        border: 0,
        borderRadius: T.radius.md,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 150ms',
        fontFamily: T.font.ui,
        position: 'relative',
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

      {!collapsed && (
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
      )}

      {item.counter != null && !collapsed && (
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

      {/* Collapsed mode: tiny dot replaces full counter */}
      {item.counter != null && collapsed && (
        <span style={{
          position: 'absolute',
          top: 6,
          right: 8,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: T.accent.main,
          border: `1.5px solid ${T.bg.surface}`,
        }} />
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   QUEUE SECTION (drop zone + DnD list + quick start)
   ════════════════════════════════════════════════════════════════════════ */

function QueueSection() {
  const { queue, current, addFiles, removeFromQueue, startEntry, reorderQueue } = useAppState();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropIdx, setDropIdx] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    const arr = Array.from(files || []).filter((f) => /\.docx$/i.test(f.name));
    if (!arr.length) return;
    setBusy(true);
    try {
      const built = await addFiles(arr);
      if (!current && built[0]?.status === 'ready') {
        setTimeout(() => startEntry(built[0].id), 80);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDropRow = (toIdx) => {
    if (dragIdx == null || dragIdx === toIdx) {
      setDragIdx(null); setDropIdx(null);
      return;
    }
    reorderQueue(dragIdx, toIdx);
    setDragIdx(null); setDropIdx(null);
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
              idx={i}
              isFirst={i === 0 && !current}
              hasCurrent={!!current}
              isDragging={dragIdx === i}
              isDropTarget={dropIdx === i && dragIdx !== i}
              onRemove={() => removeFromQueue(entry.id)}
              onStart={() => startEntry(entry.id)}
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => { setDragIdx(null); setDropIdx(null); }}
              onDragOver={(e) => {
                if (dragIdx == null) return;
                e.preventDefault();
                if (dropIdx !== i) setDropIdx(i);
              }}
              onDrop={() => onDropRow(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QueueRow({
  entry, idx, isFirst, hasCurrent,
  isDragging, isDropTarget,
  onRemove, onStart,
  onDragStart, onDragEnd, onDragOver, onDrop,
}) {
  const [hover, setHover] = useState(false);
  const fba = entry.parsed?.meta?.sendungsnummer || entry.parsed?.meta?.fbaCode || entry.fileName;
  const isError = entry.status === 'error';
  const palletCount = entry.parsed?.pallets?.length || 0;
  const articleCount = (entry.parsed?.pallets || []).reduce((s, p) => s + p.items.length, 0);

  const baseBg = isError ? T.status.danger.bg
    : isFirst ? T.accent.bg
    : T.bg.surface2;
  const baseBorder = isError ? T.status.danger.border
    : isFirst ? T.accent.border
    : T.border.primary;

  return (
    <div
      draggable={!isError}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        background: isDropTarget ? T.accent.bg : baseBg,
        border: `1px solid ${isDropTarget ? T.accent.main : baseBorder}`,
        borderRadius: T.radius.sm,
        minWidth: 0,
        cursor: isError ? 'default' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        transition: 'background 120ms, border-color 120ms, opacity 120ms',
        position: 'relative',
      }}
    >
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

      {/* Quick start (hover, only when nothing is in progress for me) */}
      {!isError && hover && !hasCurrent && (
        <button
          onClick={(e) => { e.stopPropagation(); onStart(); }}
          title="Starten"
          style={{
            width: 22, height: 22,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: T.accent.main,
            border: 0,
            borderRadius: T.radius.sm,
            color: '#fff',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
            <path d="M2 1.5v7l6.5-3.5z" />
          </svg>
        </button>
      )}

      {/* Remove */}
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

/* ════════════════════════════════════════════════════════════════════════
   CURRENT WORKFLOW MINI-PROGRESS
   ════════════════════════════════════════════════════════════════════════ */

const STEPS = ['pruefen', 'focus', 'abschluss'];
const STEP_LABEL = { pruefen: 'Prüfen', focus: 'Focus', abschluss: 'Abschluss' };

function CurrentProgress({ current, onClick }) {
  const totals = useMemo(() => {
    const pallets = current?.parsed?.pallets || [];
    const totalArticles = pallets.reduce((s, p) => s + p.items.length, 0);
    let doneArticles = 0;
    for (let i = 0; i < current.currentPalletIdx; i++) {
      doneArticles += pallets[i]?.items?.length || 0;
    }
    doneArticles += current.currentItemIdx ?? 0;
    return {
      totalArticles,
      doneArticles,
      palletCount: pallets.length,
      currentPallet: (current.currentPalletIdx ?? 0) + 1,
    };
  }, [current]);

  const stepIdx = STEPS.indexOf(current.step || 'pruefen');
  const fba = current.fbaCode || current.fileName;

  return (
    <button
      onClick={onClick}
      title="Zum aktiven Auftrag"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '10px 12px',
        margin: '0 12px 8px',
        background: T.bg.surface2,
        border: `1px solid ${T.accent.border}`,
        borderRadius: T.radius.md,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        transition: 'background 120ms, border-color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = T.accent.bg;
        e.currentTarget.style.borderColor = T.accent.main;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = T.bg.surface2;
        e.currentTarget.style.borderColor = T.accent.border;
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 500,
          color: T.accent.text,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          Aktiv
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 10.5,
          color: T.text.subtle,
          maxWidth: 110,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {fba}
        </span>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {STEPS.map((s, i) => {
          const isActive = i === stepIdx;
          const isDone = i < stepIdx;
          const dot = (
            <span style={{
              width: isActive ? 9 : 6,
              height: isActive ? 9 : 6,
              borderRadius: '50%',
              background: (isActive || isDone) ? T.accent.main : T.bg.surface3,
              border: isActive ? `2px solid ${T.accent.bg}` : 'none',
              boxShadow: isActive ? `0 0 0 2px ${T.accent.main}` : 'none',
              transition: 'all 200ms',
            }} />
          );
          return (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: i < STEPS.length - 1 ? 1 : 0 }}>
              {dot}
              {i < STEPS.length - 1 && (
                <span style={{
                  flex: 1,
                  height: 1,
                  background: isDone ? T.accent.main : T.border.strong,
                }} />
              )}
            </span>
          );
        })}
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 6,
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: T.text.primary,
          letterSpacing: '-0.005em',
        }}>
          {STEP_LABEL[current.step] || 'Prüfen'}
        </span>
        <span style={{
          fontSize: 11,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {totals.doneArticles}/{totals.totalArticles} Art · Pal {totals.currentPallet}/{totals.palletCount}
        </span>
      </div>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   TODAY STATS
   ════════════════════════════════════════════════════════════════════════ */

function TodayStats({ history }) {
  const stats = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = +start;
    let count = 0;
    let totalSec = 0;
    for (const h of history) {
      if (h.finishedAt && h.finishedAt >= startMs) {
        count += 1;
        totalSec += h.durationSec || 0;
      }
    }
    return { count, totalSec };
  }, [history]);

  return (
    <div style={{
      padding: '6px 18px 4px',
      display: 'flex',
      alignItems: 'baseline',
      gap: 6,
      fontFamily: T.font.ui,
    }}>
      <span style={{
        fontSize: 10.5,
        fontWeight: 500,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        Heute
      </span>
      <span style={{
        fontSize: 12,
        fontWeight: 600,
        color: stats.count > 0 ? T.text.primary : T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {stats.count} fertig
      </span>
      {stats.totalSec > 0 && (
        <>
          <span style={{ fontSize: 11, color: T.text.faint }}>·</span>
          <span style={{
            fontSize: 11,
            color: T.text.subtle,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatHM(stats.totalSec)}
          </span>
        </>
      )}
    </div>
  );
}

function formatHM(sec) {
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
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
