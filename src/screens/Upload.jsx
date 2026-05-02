/* Upload — Schritt 01. Datei laden.
   Design System v3 (siehe DESIGN.md). */

import { useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import {
  Page, Topbar, StepperBar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Label, Badge, Button, Meta, T,
} from '../components/ui.jsx';

export default function UploadScreen() {
  const {
    queue, history,
    addFiles, removeFromQueue, reorderQueue, clearQueue,
    startEntry,
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
      if (built.length > 0 && queue.length === 0 && built[0].status === 'ready') {
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
        crumbs={[
          { label: 'Workspace', muted: true },
          { label: 'Upload' },
        ]}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {history.length > 0 && (
              <span style={{ fontSize: 12, color: T.text.subtle }}>
                {history.length} {history.length === 1 ? 'Auftrag' : 'Aufträge'} in Historie
              </span>
            )}
          </span>
        }
      />

      <StepperBar active="upload" />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 80px' }}>
        {/* Page intro */}
        <section style={{ marginBottom: 32 }}>
          <Eyebrow>Schritt 01 von 04</Eyebrow>
          <PageH1>Auftrag laden</PageH1>
          <Lead>
            Lade eine oder mehrere <code style={codeChip}>.docx</code>-Dateien deines
            Lagerauftrags. Marathon erkennt das Format automatisch und führt dich
            anschließend Schritt für Schritt durch jede Palette.
          </Lead>
        </section>

        {/* Drop zone */}
        <section style={{ marginBottom: 32 }}>
          <DropZone
            over={over}
            busy={busy}
            onDrop={(e) => { e.preventDefault(); setOver(false); acceptFiles(e.dataTransfer.files); }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onPick={() => inputRef.current?.click()}
            inputRef={inputRef}
            onChange={(e) => { acceptFiles(e.target.files); e.target.value = ''; }}
          />
        </section>

        {/* Queue */}
        {hasQueue && (
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title={`Warteschlange (${queue.length})`}
              sub="Der erste Auftrag startet automatisch. Reihenfolge per Pfeile anpassen."
              right={
                <Button variant="subtle" onClick={clearQueue}>
                  Alle entfernen
                </Button>
              }
            />
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {queue.map((entry, i) => (
                <QueueRow
                  key={entry.id}
                  entry={entry}
                  index={i}
                  isFirst={i === 0}
                  isLast={i === queue.length - 1}
                  onStart={() => startEntry(entry.id)}
                  onRemove={() => removeFromQueue(entry.id)}
                  onUp={i > 0 ? () => reorderQueue(i, i - 1) : null}
                  onDown={i < queue.length - 1 ? () => reorderQueue(i, i + 1) : null}
                />
              ))}
            </Card>
          </section>
        )}

        {/* Capability strip — empty state hint */}
        {!hasQueue && (
          <section>
            <SectionHeader
              title="So funktioniert es"
              sub="Drei kurze Hinweise, was Marathon beim Hochladen für dich übernimmt."
            />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
            }}>
              <Capability
                n="01"
                title="Mehrere Dateien"
                text="Lege beliebig viele .docx-Aufträge gleichzeitig in die Warteschlange."
              />
              <Capability
                n="02"
                title="Auto-Erkennung"
                text="Standard- und Schilder-Format werden ohne weitere Eingabe unterschieden."
              />
              <Capability
                n="03"
                title="Sequentiell"
                text="Nach Abschluss eines Auftrags startet der nächste automatisch."
              />
            </div>
          </section>
        )}
      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Drop zone                                                                */
function DropZone({ over, busy, onDrop, onDragOver, onDragLeave, onPick, inputRef, onChange }) {
  const borderColor = over ? T.accent.main : T.border.strong;
  const bgColor     = over ? T.accent.bg   : T.bg.surface;
  return (
    <div
      onClick={onPick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        position: 'relative',
        padding: '48px 32px',
        background: bgColor,
        border: `1px dashed ${borderColor}`,
        borderRadius: T.radius.lg,
        cursor: 'pointer',
        transition: 'background 200ms, border-color 200ms',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        multiple
        style={{ display: 'none' }}
        onChange={onChange}
      />

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        gap: 32,
      }}>
        {/* Icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: T.radius.lg,
          background: over ? '#fff' : T.bg.surface3,
          border: `1px solid ${over ? T.accent.border : T.border.primary}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: over ? T.accent.main : T.text.subtle,
          transition: 'all 200ms',
        }}>
          {busy ? (
            <Spinner />
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M17 8l-5-5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          )}
        </div>

        {/* Text */}
        <div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: T.text.primary,
            letterSpacing: '-0.01em',
          }}>
            {over ? 'Datei jetzt loslassen'
              : busy ? 'Wird verarbeitet…'
              : 'Datei hier ablegen oder auswählen'}
          </div>
          <div style={{
            marginTop: 6,
            fontSize: 13.5,
            color: T.text.subtle,
            lineHeight: 1.55,
          }}>
            Akzeptiert <code style={codeChip}>.docx</code> · Standard- und Schilder-Format
          </div>
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <Button
            variant="primary"
            onClick={(e) => { e.stopPropagation(); onPick(); }}
            disabled={busy}
          >
            Datei auswählen
          </Button>
          <span style={{ fontSize: 11.5, color: T.text.faint }}>
            oder per Drag &amp; Drop
          </span>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ animation: 'mr-spin 800ms linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.2-8.55" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
/* Queue row                                                                */
function QueueRow({ entry, index, isFirst, isLast, onStart, onRemove, onUp, onDown }) {
  const fba = entry.parsed?.meta?.sendungsnummer || entry.parsed?.meta?.fbaCode || entry.fileName;
  const palletCount = entry.parsed?.pallets?.length || 0;
  const articleCount = (entry.parsed?.pallets || []).reduce((s, p) => s + p.items.length, 0);
  const units = entry.parsed?.meta?.totalUnits || 0;
  const isError = entry.status === 'error';
  const validErrors = entry.validation?.errorCount || 0;
  const validWarns  = entry.validation?.warningCount || 0;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 20px',
        background: isFirst ? T.accent.bg : T.bg.surface,
        borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
        transition: 'background 150ms',
      }}
    >
      {/* Position */}
      <span style={{
        flex: '0 0 28px',
        fontSize: 12,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      {/* Identity */}
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
          {isError       ? <Badge tone="danger">Parse-Fehler</Badge>
           : validErrors > 0 ? <Badge tone="danger">{validErrors} Fehler</Badge>
           : validWarns  > 0 ? <Badge tone="warn">{validWarns} Warnungen</Badge>
           :                   <Badge tone="success">Validiert</Badge>}
          {isFirst && <Badge tone="accent">Nächster</Badge>}
        </div>
        <div style={{
          display: 'flex',
          gap: 16,
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <Stat label="Paletten"  value={palletCount} />
          <Stat label="Artikel"   value={articleCount} />
          <Stat label="Einheiten" value={units.toLocaleString('de-DE')} />
          <span style={{
            color: T.text.faint,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 220,
          }}>
            · {entry.fileName}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconBtn onClick={onUp}     disabled={!onUp}     title="Nach oben">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 9l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </IconBtn>
        <IconBtn onClick={onDown}   disabled={!onDown}   title="Nach unten">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </IconBtn>
        <IconBtn onClick={onRemove} title="Entfernen">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </IconBtn>
        <span style={{ width: 8 }} />
        <Button
          size="sm"
          variant={isFirst ? 'primary' : 'ghost'}
          onClick={onStart}
          disabled={isError}
        >
          {isFirst ? 'Starten' : 'Wählen'}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 6h6m0 0L6 3m3 3L6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
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

/* ════════════════════════════════════════════════════════════════════════ */
/* Capability card (3-col strip)                                            */
function Capability({ n, title, text }) {
  return (
    <Card style={{ padding: '20px 22px' }}>
      <div style={{
        fontSize: 11.5,
        fontWeight: 500,
        color: T.text.faint,
        letterSpacing: '0.04em',
        marginBottom: 8,
      }}>
        {n}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 600,
        color: T.text.primary,
        marginBottom: 6,
      }}>
        {title}
      </div>
      <p style={{
        margin: 0,
        fontSize: 13,
        color: T.text.subtle,
        lineHeight: 1.55,
      }}>
        {text}
      </p>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
const codeChip = {
  fontFamily: T.font.mono,
  fontSize: 13,
  background: T.bg.surface3,
  border: `1px solid ${T.border.primary}`,
  padding: '1px 6px',
  borderRadius: T.radius.sm,
  color: T.text.secondary,
};
