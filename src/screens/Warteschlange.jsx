/* Warteschlange — eigene Vollansicht der Queue.

   Bis Phase 2 lebte die Queue in der Sidebar (QueueSection). Sie hat
   den CurrentProgress-Block und Footer-Bereiche überlappt, sobald die
   Liste länger wurde. Jetzt ist sie ein eigener Tab — die Sidebar
   zeigt nur noch den Counter im NavItem, und der CurrentProgress
   bleibt immer sichtbar.

   Funktionen:
     • Drop-Zone fügt weitere .docx-Dateien an
     • Reihenfolge per ↑/↓ Pfeil-Buttons
     • Status-Badge (Validiert / Warnungen / Fehler / Parse-Fehler)
     • Hover → Quick-Start
     • "Alle entfernen" wenn ≥ 2 Aufträge
*/

import { useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import {
  Page, Topbar, Card, SectionHeader, Eyebrow, PageH1, Lead,
  Badge, Button, EmptyState, T,
} from '../components/ui.jsx';

export default function WarteschlangeScreen({ onRoute }) {
  const {
    queue, current,
    addFiles, startEntry,
    removeFromQueue, reorderQueue, clearQueue,
  } = useAppState();

  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const acceptFiles = async (fl) => {
    const arr = Array.from(fl || []).filter((f) => /\.docx$/i.test(f.name));
    if (!arr.length) return;
    setBusy(true);
    try {
      const built = await addFiles(arr);
      if (!current && queue.length === 0 && built[0]?.status === 'ready') {
        setTimeout(() => startEntry(built[0].id), 100);
      }
    } finally {
      setBusy(false);
    }
  };

  const hasQueue = queue.length > 0;

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Warteschlange' }]}
        right={
          <span style={{ fontSize: 12, color: T.text.subtle, fontVariantNumeric: 'tabular-nums' }}>
            {hasQueue ? `${queue.length} ${queue.length === 1 ? 'Auftrag' : 'Aufträge'}` : 'Leer'}
          </span>
        }
      />

      <main style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 32px 80px' }}>
        <section style={{ marginBottom: 28 }}>
          <Eyebrow>Übersicht</Eyebrow>
          <PageH1>Warteschlange</PageH1>
          <Lead>
            Alle hochgeladenen Aufträge in Reihenfolge. Der erste startet
            automatisch, sobald nichts anderes aktiv ist. Dateien per Drag &amp;
            Drop oder Klick anhängen.
          </Lead>
        </section>

        {/* Drop zone — compact since the screen exists primarily to manage,
            not to upload first time. */}
        <section style={{ marginBottom: 24 }}>
          <DropStrip
            over={over}
            busy={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); acceptFiles(e.dataTransfer.files); }}
          />
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => { acceptFiles(e.target.files); e.target.value = ''; }}
          />
        </section>

        {hasQueue ? (
          <section>
            <SectionHeader
              title="In Reihenfolge"
              sub={hasQueue ? 'Pfeile verschieben · ✕ entfernt · Starten beginnt sofort.' : null}
              right={queue.length >= 2 && (
                <Button variant="subtle" onClick={clearQueue}>
                  Alle entfernen
                </Button>
              )}
            />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {queue.map((entry, i) => (
                <Row
                  key={entry.id}
                  entry={entry}
                  index={i}
                  isFirst={i === 0 && !current}
                  isLast={i === queue.length - 1}
                  hasCurrent={!!current}
                  onStart={() => {
                    startEntry(entry.id);
                    if (onRoute) onRoute('workspace');
                  }}
                  onRemove={() => removeFromQueue(entry.id)}
                  onUp={i > 0 ? () => reorderQueue(i, i - 1) : null}
                  onDown={i < queue.length - 1 ? () => reorderQueue(i, i + 1) : null}
                />
              ))}
            </Card>
          </section>
        ) : (
          <EmptyState
            icon={
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Warteschlange ist leer"
            description={'Lege oben eine .docx-Datei ab oder klicke „Datei auswählen“. Mehrere Aufträge werden sequentiell abgearbeitet.'}
            action={
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                Datei auswählen
              </Button>
            }
          />
        )}
      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function DropStrip({ over, busy, onClick, onDragOver, onDragLeave, onDrop }) {
  const borderColor = over ? T.accent.main : T.border.strong;
  const bgColor = over ? T.accent.bg : T.bg.surface;
  return (
    <div
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px 22px',
        background: bgColor,
        border: `1px dashed ${borderColor}`,
        borderRadius: T.radius.lg,
        cursor: busy ? 'wait' : 'pointer',
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <span style={{
        width: 40, height: 40,
        borderRadius: T.radius.md,
        background: over ? '#fff' : T.bg.surface3,
        border: `1px solid ${over ? T.accent.border : T.border.primary}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: over ? T.accent.main : T.text.subtle,
        flexShrink: 0,
        transition: 'all 200ms',
      }}>
        {busy ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'mr-spin 800ms linear infinite' }}>
            <path d="M21 12a9 9 0 1 1-6.2-8.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: T.text.primary }}>
          {over ? 'Datei jetzt loslassen' : busy ? 'Wird verarbeitet…' : 'Datei anhängen'}
        </div>
        <div style={{ fontSize: 12.5, color: T.text.subtle, marginTop: 2 }}>
          .docx · Drag &amp; Drop oder klicken
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        disabled={busy}
      >
        Datei auswählen
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function Row({
  entry, index, isFirst, isLast, hasCurrent,
  onStart, onRemove, onUp, onDown,
}) {
  const fba = entry.parsed?.meta?.sendungsnummer || entry.parsed?.meta?.fbaCode || entry.fileName;
  const palletCount = entry.parsed?.pallets?.length || 0;
  const articleCount = (entry.parsed?.pallets || []).reduce((s, p) => s + p.items.length, 0);
  const units = entry.parsed?.meta?.totalUnits || 0;
  const isError = entry.status === 'error';
  const validErrors = entry.validation?.errorCount || 0;
  const validWarns  = entry.validation?.warningCount || 0;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      padding: '14px 20px',
      background: isFirst ? T.accent.bg : T.bg.surface,
      borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
      transition: 'background 150ms',
    }}>
      <span style={{
        flex: '0 0 28px',
        fontSize: 12,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 14,
            fontWeight: 500,
            color: T.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 280,
          }}>
            {fba}
          </span>
          {isError ? <Badge tone="danger">Parse-Fehler</Badge>
            : validErrors > 0 ? <Badge tone="danger">{validErrors} Fehler</Badge>
            : validWarns > 0 ? <Badge tone="warn">{validWarns} Warnungen</Badge>
            : <Badge tone="success">Validiert</Badge>}
          {isFirst && <Badge tone="accent">Nächster</Badge>}
        </div>
        <div style={{
          display: 'flex',
          gap: 16,
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <Stat label="Paletten" value={palletCount} />
          <Stat label="Artikel" value={articleCount} />
          <Stat label="Einheiten" value={units.toLocaleString('de-DE')} />
          <span style={{
            color: T.text.faint,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }} title={entry.fileName}>
            · {entry.fileName}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconBtn onClick={onUp} disabled={!onUp} title="Nach oben">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 9l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onDown} disabled={!onDown} title="Nach unten">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </IconBtn>
        <IconBtn onClick={onRemove} title="Entfernen">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </IconBtn>
        <span style={{ width: 8 }} />
        <Button
          size="sm"
          variant={isFirst && !hasCurrent ? 'primary' : 'ghost'}
          onClick={onStart}
          disabled={isError || hasCurrent}
          title={hasCurrent ? 'Aktiver Auftrag noch nicht abgeschlossen' : null}
        >
          {isFirst && !hasCurrent ? 'Starten' : 'Wählen'}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 6h6m0 0L6 3m3 3L6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span style={{ color: T.text.faint }}>{label}</span>
      <span style={{ color: T.text.secondary, fontWeight: 500 }}>{value}</span>
    </span>
  );
}

function IconBtn({ onClick, disabled, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 28, height: 28,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: '1px solid transparent',
        borderRadius: T.radius.sm,
        color: T.text.subtle,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        transition: 'background 150ms, color 150ms',
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = T.bg.surface3;
        e.currentTarget.style.color = T.text.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = T.text.subtle;
      }}
    >
      {children}
    </button>
  );
}
