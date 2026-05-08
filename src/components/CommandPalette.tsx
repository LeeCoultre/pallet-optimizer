/* Command Palette — Linear/Raycast-style ⌘K overlay.

   Two stacked sections:
     1. Aktionen — instant route + workflow shortcuts (no debounce).
     2. Aufträge — globale Suche via /api/search (debounced 200ms).

   Filtered by the typed query: Aktionen via simple substring on label,
   Aufträge via the backend (matches FNSKU/SKU/EAN/Sendungsnummer/file).

   Keyboard:
     ↑/↓     navigate selection
     Enter   activate
     Esc     close (also handled in App.jsx as a fallback)
     ⌘K      toggle (handled in App.jsx)

   We mount only when `open` so the listener and debounce timer are
   inactive otherwise — important for performance during heavy
   Pruefen/Focus work. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '@/state.jsx';
import { useMe } from '@/hooks/useMe.js';
import { searchAuftraege } from '@/marathonApi.js';
import type { SearchHit } from '@/types/api';
import { T } from './ui.jsx';

const PALETTE_WIDTH = 640;

export function CommandPalette({ open, onClose, onRoute }) {
  if (!open) return null;
  return <PaletteImpl onClose={onClose} onRoute={onRoute} />;
}

function PaletteImpl({ onClose, onRoute }) {
  const { current, queue, startEntry } = useAppState();
  const me = useMe().data;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* Focus the input on mount so the user can type immediately. */
  useEffect(() => { inputRef.current?.focus(); }, []);

  /* Debounced backend search — only fires when there are 2+ chars.
     Cancel via cleanup so a fast typist doesn't pile up requests. */
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const data = await searchAuftraege({ q: trimmed, limit: 8 });
        setResults(data?.items || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [query]);

  /* ─── Action list — derived from current state.
     Filtered by `query` substring (case-insensitive) so typing
     "his" pre-selects "Historie". */
  const actions = useMemo(() => {
    type Action = { id: string; label: string; sub?: string; kind: string; target: string; icon: React.ReactNode; disabled?: boolean };
    const all: Action[] = ([
      { id: 'go-workspace', label: current ? 'Zum Workflow' : 'Zum Upload',
        sub: current ? 'Aktiver Auftrag' : 'Datei laden',
        kind: 'route', target: 'workspace', icon: <IconUpload /> },
      { id: 'go-warteschlange', label: 'Warteschlange',
        sub: queue.length > 0
          ? `${queue.length} ${queue.length === 1 ? 'Auftrag' : 'Aufträge'} bereit`
          : 'Reihenfolge verwalten',
        kind: 'route', target: 'warteschlange', icon: <IconQueue /> },
      { id: 'go-suche', label: 'Suche öffnen',
        sub: 'FNSKU · SKU · EAN · Sendungsnr.',
        kind: 'route', target: 'suche', icon: <IconSearch /> },
      { id: 'go-historie', label: 'Historie',
        sub: 'Abgeschlossene Aufträge',
        kind: 'route', target: 'historie', icon: <IconHistory /> },
      { id: 'go-live', label: 'Live-Aktivität',
        sub: 'Wer arbeitet jetzt',
        kind: 'route', target: 'live', icon: <IconPulse /> },
      { id: 'go-berichte', label: 'Berichte',
        sub: 'xlsx-Export',
        kind: 'route', target: 'berichte', icon: <IconReport /> },
      { id: 'go-einstellungen', label: 'Einstellungen',
        sub: 'Akzent · Experimente',
        kind: 'route', target: 'einstellungen', icon: <IconSettings /> },
      me?.role === 'admin' && { id: 'go-admin', label: 'Admin',
        sub: 'Übersicht & Benutzer',
        kind: 'route', target: 'admin', icon: <IconAdmin /> },
      ...queue.slice(0, 3).map((entry) => ({
        id: `start-${entry.id}`,
        label: `Auftrag starten — ${entry.parsed?.meta?.sendungsnummer || entry.fileName}`,
        sub: `${entry.parsed?.pallets?.length || 0} Pal · in Warteschlange`,
        kind: 'start', target: entry.id, icon: <IconPlay />,
        disabled: !!current,
      })),
    ] as (Action | false)[]).filter((a): a is Action => Boolean(a));

    if (!query.trim()) return all;
    const needle = query.trim().toLowerCase();
    return all.filter((a) =>
      a.label.toLowerCase().includes(needle) ||
      (a.sub || '').toLowerCase().includes(needle),
    );
  }, [current, queue, me, query]);

  /* Combined list flatten — selection cycles through actions THEN
     search results, so ↓-arrow keeps working after the action list ends. */
  const flat = useMemo(() => {
    type Entry = { kind: 'action'; payload: typeof actions[number] } | { kind: 'hit'; payload: typeof results[number] };
    const arr: Entry[] = [];
    actions.forEach((a) => arr.push({ kind: 'action', payload: a }));
    results.forEach((r) => arr.push({ kind: 'hit', payload: r }));
    return arr;
  }, [actions, results]);

  /* Reset selection whenever the candidate set changes — out-of-bounds
     would cause the highlight to vanish. */
  useEffect(() => { setSelected(0); }, [query, results.length]);

  const activate = (entry) => {
    if (!entry) return;
    if (entry.kind === 'action') {
      const a = entry.payload;
      if (a.disabled) return;
      if (a.kind === 'route') onRoute(a.target);
      else if (a.kind === 'start') {
        startEntry(a.target);
        onRoute('workspace');
        onClose();
      }
    } else if (entry.kind === 'hit') {
      /* Send the user to Suche with the same query pre-filled. The
         matched value (FNSKU/SKU/etc.) is more specific than what
         they typed, so prefer it — but fall back to the typed query
         when matched_value isn't unique enough. */
      const hit = entry.payload;
      const seedQuery = hit.matchedValue || query.trim();
      onRoute('suche', { query: seedQuery });
      onClose();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      activate(flat[selected]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(17, 24, 39, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 'min(20vh, 160px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(92vw, ' + PALETTE_WIDTH + 'px)',
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: 14,
          boxShadow: T.shadow.modal,
          overflow: 'hidden',
          fontFamily: T.font.ui,
        }}
      >
        {/* Search input row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: `1px solid ${T.border.primary}`,
        }}>
          <span style={{ color: T.text.faint, display: 'inline-flex' }}>
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Aktion suchen oder FNSKU / SKU / EAN / Sendungsnr eingeben…"
            style={{
              flex: 1,
              border: 0,
              outline: 0,
              fontSize: 15,
              fontWeight: 500,
              color: T.text.primary,
              background: 'transparent',
              fontFamily: T.font.ui,
            }}
          />
          {loading && <Spinner />}
          <Kbd>esc</Kbd>
        </div>

        {/* Body */}
        <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
          {actions.length > 0 && (
            <Section title="Aktionen">
              {actions.map((a: { id: string; label: string; sub?: string; kind: string; target: string; icon: React.ReactNode; disabled?: boolean }, i) => {
                const flatIdx = i;
                return (
                  <Row
                    key={a.id}
                    selected={selected === flatIdx}
                    disabled={a.disabled}
                    onMouseEnter={() => setSelected(flatIdx)}
                    onClick={() => activate({ kind: 'action', payload: a })}
                    icon={a.icon}
                    label={a.label}
                    sub={a.sub}
                    rightHint={a.kind === 'start' ? 'Starten' : 'Öffnen'}
                  />
                );
              })}
            </Section>
          )}

          {query.trim().length >= 2 && (
            <Section title={results.length ? `Aufträge · ${results.length}` : 'Aufträge'}>
              {results.length === 0 && !loading && (
                <div style={{ padding: '12px 18px', fontSize: 13, color: T.text.faint }}>
                  Keine Treffer für „{query.trim()}".
                </div>
              )}
              {results.map((hit, i) => {
                const flatIdx = actions.length + i;
                return (
                  <Row
                    key={hit.id}
                    selected={selected === flatIdx}
                    onMouseEnter={() => setSelected(flatIdx)}
                    onClick={() => activate({ kind: 'hit', payload: hit })}
                    icon={<MatchBadge field={hit.matchedField} />}
                    label={hit.fbaCode || hit.fileName}
                    sub={[
                      hit.matchedValue && hit.matchedValue !== (hit.fbaCode || hit.fileName)
                        ? `${hit.matchedField}: ${hit.matchedValue}`
                        : null,
                      `${hit.palletCount} Pal · ${hit.articleCount} Art`,
                      hit.assignedToUserName,
                    ].filter(Boolean).join(' · ')}
                    rightHint={statusLabel(hit.status)}
                    rightHintTone={statusTone(hit.status)}
                    mono
                  />
                );
              })}
            </Section>
          )}

          {!query.trim() && actions.length === 0 && (
            <div style={{ padding: '24px', fontSize: 13, color: T.text.subtle, textAlign: 'center' }}>
              Tippen, um zu suchen.
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 18px',
          borderTop: `1px solid ${T.border.primary}`,
          fontSize: 11,
          color: T.text.subtle,
          background: T.bg.surface2,
        }}>
          <Hint kbd="↑↓" label="Navigieren" />
          <Hint kbd="↵" label="Öffnen" />
          <Hint kbd="esc" label="Schließen" />
          <span style={{ flex: 1 }} />
          <span style={{ color: T.text.faint }}>Marathon Command</span>
        </div>
      </div>
    </div>
  );
}

/* ─── presentation ──────────────────────────────────────────────── */

function Section({ title, children }) {
  return (
    <div>
      <div style={{
        padding: '10px 18px 6px',
        fontSize: 10.5,
        fontWeight: 600,
        color: T.text.faint,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}>
        {title}
      </div>
      <div style={{ paddingBottom: 6 }}>
        {children}
      </div>
    </div>
  );
}

function Row({
  selected, disabled,
  onMouseEnter, onClick,
  icon, label, sub, rightHint, rightHintTone, mono,
}: { selected?: boolean; disabled?: boolean; onMouseEnter?: () => void; onClick?: () => void; icon?: React.ReactNode; label?: React.ReactNode; sub?: React.ReactNode; rightHint?: React.ReactNode; rightHintTone?: 'success' | 'warn' | 'danger' | 'neutral'; mono?: boolean }) {
  return (
    <button
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        padding: '8px 18px',
        background: selected ? T.accent.bg : 'transparent',
        border: 0,
        borderLeft: `3px solid ${selected ? T.accent.main : 'transparent'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        opacity: disabled ? 0.5 : 1,
        transition: 'background 80ms',
      }}
    >
      <span style={{
        width: 24, height: 24,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: selected ? T.accent.main : T.text.subtle,
        flexShrink: 0,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: T.text.primary,
          fontFamily: mono ? T.font.mono : T.font.ui,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </div>
        {sub && (
          <div style={{
            fontSize: 11.5,
            color: T.text.subtle,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {sub}
          </div>
        )}
      </div>
      {rightHint && (
        <span style={{
          fontSize: 10.5,
          fontWeight: 600,
          padding: '2px 8px',
          borderRadius: T.radius.full,
          background: rightHintTone === 'success' ? T.status.success.bg
            : rightHintTone === 'warn' ? T.status.warn.bg
            : T.bg.surface3,
          color: rightHintTone === 'success' ? T.status.success.text
            : rightHintTone === 'warn' ? T.status.warn.text
            : T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}>
          {rightHint}
        </span>
      )}
    </button>
  );
}

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 22,
      height: 20,
      padding: '0 6px',
      fontSize: 10.5,
      fontWeight: 600,
      color: T.text.subtle,
      background: T.bg.surface2,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 4,
      fontFamily: T.font.mono,
      letterSpacing: '0.02em',
    }}>
      {children}
    </span>
  );
}

function Hint({ kbd, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <Kbd>{kbd}</Kbd>
      <span>{label}</span>
    </span>
  );
}

function MatchBadge({ field }) {
  const map = {
    fnsku: 'FNSKU', sku: 'SKU', ean: 'EAN',
    sendungsnummer: 'SN', file_name: 'FILE',
  };
  const label = map[field] || '·';
  return (
    <span style={{
      width: 28, height: 18,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.04em',
      color: T.accent.text,
      background: T.accent.bg,
      border: `1px solid ${T.accent.border}`,
      borderRadius: 4,
      fontFamily: T.font.mono,
    }}>
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 14, height: 14,
      border: `2px solid ${T.border.primary}`,
      borderTopColor: T.accent.main,
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'mp-spin 600ms linear infinite',
    }}>
      <style>{`@keyframes mp-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

function statusLabel(s) {
  return ({ queued: 'Queue', in_progress: 'Aktiv', completed: 'Fertig', error: 'Fehler' })[s] || s;
}
function statusTone(s) {
  return ({ completed: 'success', error: 'danger', in_progress: 'warn' })[s] || 'neutral';
}

/* ─── Icons ─────────────────────────────────────────────────────── */

function IconSearch() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.6" />
    <path d="M12 12l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}
function IconUpload() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M15 11v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3M12 6L9 3 6 6M9 3v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconHistory() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M3 9a6 6 0 1 0 1.6-4.1M3 3v3h3M9 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconPulse() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M2 9h2.5l2-5 3 10 2-5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconReport() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M5 2h7l3 3v11H5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M11 2v4h4M7 11v3M9 9v5M11 12v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}
function IconSettings() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="2.2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M9 1.5v2M9 14.5v2M3.5 3.5l1.4 1.4M13.1 13.1l1.4 1.4M1.5 9h2M14.5 9h2M3.5 14.5l1.4-1.4M13.1 4.9l1.4-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}
function IconAdmin() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M9 2L3 4.5v3.7c0 3.4 2.5 6.7 6 7.8 3.5-1.1 6-4.4 6-7.8V4.5L9 2zM6.5 9l1.7 1.7L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function IconPlay() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <path d="M5 3v12l10-6z" fill="currentColor" />
  </svg>;
}
function IconQueue() {
  return <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
    <rect x="3" y="3"  width="12" height="2.4" rx="1" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="7.8" width="12" height="2.4" rx="1" stroke="currentColor" strokeWidth="1.6" />
    <rect x="3" y="12.6" width="12" height="2.4" rx="1" stroke="currentColor" strokeWidth="1.6" />
  </svg>;
}