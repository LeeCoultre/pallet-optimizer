/* Upload — Schritt 01.

   Design ethos: subdued accent, hairline borders, lighter type. The
   drop-zone is the hero; everything else (mini-stepper, recents,
   insights, hint) is light scaffolding. Same vocabulary as the new
   sidebar.

   Headline features:
     • Hero drop-zone with 5 visual states (idle / over / busy /
       success / error). All states share one border + one background
       — they morph in place via CSS transitions.
     • Page-wide drag overlay so the operator can drop ANYWHERE on
       the page, not just on the visible drop-zone.
     • ⌘V paste support (Cursor-style).
     • 3-second auto-start countdown after a successful single-file
       parse with empty queue. Esc / explicit "Stop" cancels.
     • Recent uploads list (last 5, localStorage). Click navigates
       into Historie / Warteschlange depending on the entry's status.
     • Smart insights row — 3 mini-KPI computed from local history.
       Hidden until there's data.
     • Mini-stepper (4 dots) lives in the Topbar instead of a heavy
       StepperBar.
     • Inline error state for parse failures — no modal, no toast.
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import { useApiHealth } from '../hooks/useApiHealth.js';
import { useRecentUploads } from '../hooks/useRecentUploads.js';
import { useGlobalDragOverlay } from '../hooks/useGlobalDragOverlay.js';
import { usePasteFile } from '../hooks/usePasteFile.js';
import { Page, Topbar, StepperBar, PageH1, T } from '../components/ui.jsx';

const COUNTDOWN_SEC = 3;

export default function UploadScreen({ onRoute }) {
  const { queue, history, current, addFiles, startEntry } = useAppState();
  const { items: recent, add: addRecent, remove: removeRecent } = useRecentUploads();
  const apiHealth = useApiHealth();
  const isOffline = apiHealth?.data?.status === 'offline';

  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);   // local drop-zone hover
  const [busyFiles, setBusyFiles] = useState([]);  // [{ name, status }]
  const [lastBuilt, setLastBuilt] = useState(null);  // [{ id, parsed, status, ... }]
  const [parseError, setParseError] = useState(null);
  const [countdown, setCountdown] = useState(null);

  const inputRef = useRef(null);

  const globalOver = useGlobalDragOverlay();

  /* ─── core file pipeline ─────────────────────────────────────── */
  const acceptFiles = useCallback(async (fl) => {
    const arr = Array.from(fl || []).filter((f) => /\.docx$/i.test(f.name));
    if (!arr.length) return;
    /* Hard-stop if the backend is unreachable — without this the upload
       silently swallows the network error (createMut.mutateAsync is
       wrapped in .catch(() => null) inside addFiles) and the user sees
       the busy spinner clear with no feedback. */
    if (isOffline) {
      setParseError('Server offline — Backend nicht erreichbar. Backend starten und erneut versuchen.');
      return;
    }
    setParseError(null);
    setBusyFiles(arr.map((f) => ({ name: f.name, status: 'pending' })));
    setBusy(true);
    try {
      const built = await addFiles(arr);
      setLastBuilt(built);

      /* Empty result = network error swallowed by addFiles. Surface it. */
      if (arr.length > 0 && built.length === 0) {
        setParseError('Server hat nicht geantwortet. Bitte Backend prüfen und erneut versuchen.');
        setBusyFiles([]);
        return;
      }

      /* Mark per-file status */
      setBusyFiles(built.map((b) => ({
        name: b.fileName,
        status: b.status === 'ready' ? 'done' : 'error',
      })));

      /* Recent log — only successful ones */
      built.filter((b) => b.status === 'ready').forEach((b) => {
        const meta = b.parsed?.meta || {};
        const palletCount = b.parsed?.pallets?.length || 0;
        const articleCount = (b.parsed?.pallets || [])
          .reduce((s, p) => s + (p.items?.length || 0), 0);
        addRecent({
          id: b.id,
          fileName: b.fileName,
          fbaCode: meta.sendungsnummer || meta.fbaCode || null,
          palletCount,
          articleCount,
        });
      });

      /* Auto-start countdown — only when:
         - exactly one file was parsed successfully
         - queue was empty before this batch
         - no current Auftrag is being worked on */
      const successes = built.filter((b) => b.status === 'ready');
      if (
        successes.length === 1
        && !current
        && queue.length === 0
      ) {
        startCountdown(successes[0].id);
      }

      /* If everything failed, surface the first error inline */
      if (built.length > 0 && successes.length === 0) {
        setParseError(built[0].errorMessage || 'Datei konnte nicht verarbeitet werden.');
      }
    } catch (e) {
      setParseError(e?.message || 'Upload fehlgeschlagen');
    } finally {
      setBusy(false);
      /* Clear busy-files display after a beat so the operator sees
         the final ✓/✗ row before it disappears. */
      setTimeout(() => setBusyFiles([]), 1200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addFiles, addRecent, current, queue.length, isOffline]);

  /* ─── countdown logic ────────────────────────────────────────── */
  const countdownTimer = useRef(null);
  const cancelCountdown = useCallback(() => {
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current);
      countdownTimer.current = null;
    }
    setCountdown(null);
  }, []);
  const startCountdown = (auftragId) => {
    let remaining = COUNTDOWN_SEC;
    setCountdown({ auftragId, remaining });
    countdownTimer.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimer.current);
        countdownTimer.current = null;
        setCountdown(null);
        startEntry(auftragId);
      } else {
        setCountdown({ auftragId, remaining });
      }
    }, 1000);
  };
  /* Cleanup on unmount + Esc-to-cancel */
  useEffect(() => () => cancelCountdown(), [cancelCountdown]);
  useEffect(() => {
    if (!countdown) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') cancelCountdown(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [countdown, cancelCountdown]);

  /* ─── paste support ──────────────────────────────────────────── */
  usePasteFile(acceptFiles);

  /* ─── render ─────────────────────────────────────────────────── */
  const lastSuccess = useMemo(() => {
    if (!lastBuilt) return null;
    return lastBuilt.find((b) => b.status === 'ready') || null;
  }, [lastBuilt]);

  return (
    <Page>
      <Topbar
        crumbs={[
          { label: 'Upload' },
        ]}
        right={
          queue.length > 0 ? (
            <StatusStrip
              count={queue.length}
              onOpen={() => onRoute && onRoute('warteschlange')}
            />
          ) : null
        }
      />

      <StepperBar active="upload" />

      <main style={{
        maxWidth: 1120,
        margin: '0 auto',
        padding: '72px 40px 96px',
        display: 'flex',
        flexDirection: 'column',
        gap: 80,
      }}>
        {/* Hero block — H1 + subtitle + drop-zone with breathing
            room so the focal drop-zone reads like a primary surface,
            not a wedged form field. */}
        <section style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 22,
        }}>
          <h1 style={{
            margin: 0,
            fontSize: 'clamp(36px, 2.8vw, 52px)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            color: T.text.primary,
            textAlign: 'center',
          }}>
            Auftrag laden
          </h1>

          <p style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 400,
            lineHeight: 1.5,
            color: T.text.subtle,
            textAlign: 'center',
            maxWidth: 520,
          }}>
            .docx-Datei ablegen — Marathon erkennt das Format automatisch.
          </p>

          <div style={{ width: '100%', maxWidth: 760, marginTop: 18 }}>
            <HeroDropZone
              over={over || globalOver}
              busy={busy}
              busyFiles={busyFiles}
              lastSuccess={lastSuccess}
              parseError={parseError}
              countdown={countdown}
              onPick={() => inputRef.current?.click()}
              onAccept={acceptFiles}
              onDragOverChange={setOver}
              onCancelCountdown={cancelCountdown}
              onStartNow={() => {
                /* Start whichever Auftrag is currently surfaced — the
                   active countdown takes priority, otherwise the last
                   successful upload shown in SuccessContent. */
                const idToStart = countdown?.auftragId || lastSuccess?.id;
                if (idToStart) {
                  cancelCountdown();
                  startEntry(idToStart);
                }
              }}
              onAttachInstead={() => {
                cancelCountdown();
                if (onRoute) onRoute('warteschlange');
              }}
              onClearError={() => { setParseError(null); setLastBuilt(null); }}
            />
            <input
              ref={inputRef}
              type="file"
              accept=".docx"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { acceptFiles(e.target.files); e.target.value = ''; }}
            />
          </div>
        </section>

        {/* Bottom row — recents and insights side-by-side, separated
            by a hairline. No cards: just labels + values, presentation
            mode. Either side hides when its data is empty; if both
            empty, the whole row vanishes. */}
        {(recent.length > 0 || history.length > 0) && (
          <PresentationRow>
            {recent.length > 0 && (
              <RecentColumn
                items={recent}
                onOpen={() => onRoute && onRoute('warteschlange')}
                onRemove={removeRecent}
              />
            )}
            {history.length > 0 && (
              <InsightsColumn history={history} />
            )}
          </PresentationRow>
        )}
      </main>

      {/* Page-wide drag overlay */}
      <GlobalDragOverlay
        visible={globalOver && !busy}
        onDrop={(e) => {
          e.preventDefault();
          acceptFiles(e.dataTransfer.files);
        }}
      />
    </Page>
  );
}

/* WorkflowSteps живёт jetzt im ui.jsx als StepperBar — wiederverwendet
   von Pruefen + Abschluss, damit der gesamte 4-Schritte-Flow visuell
   konsistent bleibt. */

/* ════════════════════════════════════════════════════════════════════════
   HERO DROP-ZONE — single block, 5 morphing states.
   ════════════════════════════════════════════════════════════════════════ */
function HeroDropZone({
  over, busy, busyFiles, lastSuccess, parseError, countdown,
  onPick, onAccept, onDragOverChange,
  onCancelCountdown, onStartNow, onAttachInstead, onClearError,
}) {
  const showCountdown = !!countdown;
  const showSuccess = !!lastSuccess && !showCountdown;
  const showError = !!parseError;
  const showBusy = busy && !showCountdown && !showSuccess && !showError;
  const showOver = over && !busy && !showCountdown && !showSuccess && !showError;
  const showIdle = !showCountdown && !showSuccess && !showError && !showBusy && !showOver;

  /* Border / bg morph based on state */
  const palette = (() => {
    if (showError)   return { border: T.status.danger.border, bg: T.status.danger.bg, dashed: false };
    if (showSuccess) return { border: T.status.success.border, bg: T.status.success.bg, dashed: false };
    if (showCountdown) return { border: T.accent.border, bg: T.accent.bg, dashed: false };
    if (showBusy)    return { border: T.accent.border, bg: T.accent.bg, dashed: false };
    if (showOver)    return { border: T.accent.main, bg: T.accent.bg, dashed: true };
    return { border: T.border.strong, bg: T.bg.surface, dashed: true };
  })();

  return (
    <div
      onClick={() => { if (showIdle) onPick(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOverChange(true); }}
      onDragLeave={() => onDragOverChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragOverChange(false);
        onAccept(e.dataTransfer.files);
      }}
      style={{
        minHeight: 240,
        padding: '44px 52px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: palette.bg,
        border: `1px ${palette.dashed ? 'dashed' : 'solid'} ${palette.border}`,
        borderRadius: 14,
        cursor: showIdle ? 'pointer' : 'default',
        boxShadow: showOver
          ? `0 8px 32px -8px ${T.accent.main}40, 0 2px 8px rgba(17,24,39,0.04)`
          : '0 1px 3px rgba(17,24,39,0.04), 0 8px 24px -12px rgba(17,24,39,0.06)',
        transition: 'background 240ms cubic-bezier(0.16, 1, 0.3, 1), border-color 240ms cubic-bezier(0.16, 1, 0.3, 1), transform 240ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        transform: showOver ? 'scale(1.008)' : 'scale(1)',
      }}
    >
      {showIdle    && <IdleContent onPick={onPick} />}
      {showOver    && <OverContent />}
      {showBusy    && <BusyContent files={busyFiles} />}
      {showSuccess && <SuccessContent
                        entry={lastSuccess}
                        onStart={() => onStartNow()}
                        onAttach={onAttachInstead}
                      />}
      {showError   && <ErrorContent message={parseError} onPick={onPick} onClear={onClearError} />}
      {showCountdown && <CountdownContent
                          countdown={countdown}
                          onCancel={onCancelCountdown}
                          onStartNow={onStartNow}
                        />}
    </div>
  );
}

function IdleContent({ onPick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <DropIcon />
      <div style={{ flex: 1, lineHeight: 1.5 }}>
        <div style={{
          fontSize: 17,
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.012em',
        }}>
          Datei hier ablegen
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: T.text.subtle, fontWeight: 400 }}>
          .docx · Drag &amp; Drop, klicken oder <Kbd>⌘V</Kbd> einfügen
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onPick(); }}
        style={{
          padding: '7px 14px',
          fontSize: 12.5,
          fontWeight: 500,
          color: T.text.secondary,
          background: T.bg.surface,
          border: `1px solid ${T.border.strong}`,
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: T.font.ui,
          transition: 'all 160ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = T.accent.main;
          e.currentTarget.style.color = T.accent.main;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = T.border.strong;
          e.currentTarget.style.color = T.text.secondary;
        }}
      >
        Datei wählen
      </button>
    </div>
  );
}

function OverContent() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <DropIcon accent />
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 18,
          fontWeight: 500,
          color: T.accent.text,
          letterSpacing: '-0.012em',
        }}>
          Jetzt loslassen
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: T.accent.text, opacity: 0.8 }}>
          Marathon erkennt das Format automatisch.
        </div>
      </div>
    </div>
  );
}

function BusyContent({ files }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        marginBottom: 4,
      }}>
        <Spinner size={18} color={T.accent.main} />
        <span style={{
          fontSize: 14,
          fontWeight: 500,
          color: T.accent.text,
          letterSpacing: '-0.005em',
        }}>
          Wird verarbeitet…
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {files.map((f, i) => <BusyRow key={i} file={f} />)}
      </div>
    </div>
  );
}

function BusyRow({ file }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '4px 0',
    }}>
      <span style={{
        fontFamily: T.font.mono,
        fontSize: 12,
        color: T.text.secondary,
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {file.name}
      </span>
      {file.status === 'pending' && <Spinner size={11} color={T.text.faint} />}
      {file.status === 'done' && (
        <span style={{ color: T.status.success.main, display: 'inline-flex' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      {file.status === 'error' && (
        <span style={{ color: T.status.danger.main, display: 'inline-flex' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </div>
  );
}

function SuccessContent({ entry, onStart, onAttach }) {
  const meta = entry.parsed?.meta || {};
  const fba = meta.sendungsnummer || meta.fbaCode || entry.fileName;
  const palletCount = entry.parsed?.pallets?.length || 0;
  const articleCount = (entry.parsed?.pallets || [])
    .reduce((s, p) => s + (p.items?.length || 0), 0);
  const validErrors = entry.validation?.errorCount || 0;
  const validWarns = entry.validation?.warningCount || 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <span style={{
        width: 36, height: 36,
        borderRadius: '50%',
        background: T.status.success.main,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 9l3 3 7-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 14,
          fontWeight: 500,
          color: T.text.primary,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {fba}
        </div>
        <div style={{
          marginTop: 4,
          display: 'flex',
          gap: 14,
          fontSize: 12,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <span>{palletCount} Pal · {articleCount} Art</span>
          {validErrors > 0 && (
            <span style={{ color: T.status.danger.text }}>{validErrors} Fehler</span>
          )}
          {validErrors === 0 && validWarns > 0 && (
            <span style={{ color: T.status.warn.text }}>{validWarns} Warnungen</span>
          )}
          {validErrors === 0 && validWarns === 0 && (
            <span style={{ color: T.status.success.text }}>Validiert</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onAttach}
          style={ghostButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = T.text.subtle;
            e.currentTarget.style.color = T.text.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = T.border.strong;
            e.currentTarget.style.color = T.text.secondary;
          }}
        >
          In Warteschlange
        </button>
        <button
          onClick={onStart}
          style={primaryButtonStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accent.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.accent.main; }}
        >
          Jetzt starten
          <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor">
            <path d="M2.5 1.5v9l8-4.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CountdownContent({ countdown, onCancel, onStartNow }) {
  const ratio = (COUNTDOWN_SEC - countdown.remaining + 1) / COUNTDOWN_SEC;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      {/* Ring countdown */}
      <span style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
        <svg width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" stroke={T.accent.border} strokeWidth="2" fill="none" />
          <circle
            cx="22" cy="22" r="18"
            stroke={T.accent.main}
            strokeWidth="2"
            fill="none"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - ratio)}`}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 1000ms linear' }}
          />
        </svg>
        <span style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: T.font.mono,
          fontSize: 16,
          fontWeight: 600,
          color: T.accent.text,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {countdown.remaining}
        </span>
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.accent.text, letterSpacing: '-0.005em' }}>
          Startet automatisch in {countdown.remaining}s
        </div>
        <div style={{ fontSize: 12, color: T.accent.text, opacity: 0.85, marginTop: 2 }}>
          Esc oder „Stop" hält den Auto-Start an.
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onCancel}
          style={ghostButtonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = T.status.danger.main;
            e.currentTarget.style.color = T.status.danger.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = T.border.strong;
            e.currentTarget.style.color = T.text.secondary;
          }}
        >
          Stop
        </button>
        <button
          onClick={onStartNow}
          style={primaryButtonStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = T.accent.hover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = T.accent.main; }}
        >
          Sofort starten
        </button>
      </div>
    </div>
  );
}

function ErrorContent({ message, onPick, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <span style={{
        width: 36, height: 36,
        borderRadius: '50%',
        background: T.status.danger.main,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 4v6m0 2.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.status.danger.text }}>
          Datei konnte nicht verarbeitet werden
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 12,
          color: T.status.danger.text,
          opacity: 0.85,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: 480,
        }} title={message}>
          {message}
        </div>
      </div>
      <button
        onClick={() => { onClear(); onPick(); }}
        style={primaryButtonStyle}
        onMouseEnter={(e) => { e.currentTarget.style.background = T.accent.hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = T.accent.main; }}
      >
        Andere Datei wählen
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   GLOBAL DRAG OVERLAY — page-wide capture.
   ════════════════════════════════════════════════════════════════════════ */
function GlobalDragOverlay({ visible, onDrop }) {
  if (!visible) return null;
  return (
    <div
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(17, 24, 39, 0.45)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <div style={{
        width: 'min(80vw, 560px)',
        padding: '64px 48px',
        background: T.bg.surface,
        border: `2px dashed ${T.accent.main}`,
        borderRadius: 16,
        textAlign: 'center',
        boxShadow: T.shadow.modal,
      }}>
        <DropIcon accent size={36} />
        <div style={{
          marginTop: 18,
          fontSize: 22,
          fontWeight: 500,
          color: T.accent.text,
          letterSpacing: '-0.018em',
        }}>
          Datei hier ablegen
        </div>
        <div style={{
          marginTop: 8,
          fontSize: 13,
          color: T.text.subtle,
        }}>
          .docx-Datei wird automatisch erkannt und in die Warteschlange gelegt.
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STATUS STRIP — paper-thin top ribbon. Sits ABOVE the hero block,
   not as a card but as a near-invisible accent line. The dot pulses
   subtly to draw the eye without shouting.
   ════════════════════════════════════════════════════════════════════════ */
function StatusStrip({ count, onOpen }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 11px',
        background: T.accent.bg,
        border: `1px solid ${T.accent.border}`,
        borderRadius: 999,
        cursor: 'pointer',
        fontFamily: T.font.ui,
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = T.accent.main;
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = T.accent.border;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <span style={{
        width: 5, height: 5,
        borderRadius: '50%',
        background: T.accent.main,
      }} />
      <span style={{
        fontSize: 11.5,
        fontWeight: 500,
        color: T.accent.text,
        letterSpacing: '-0.005em',
        whiteSpace: 'nowrap',
      }}>
        {count} in Warteschlange
      </span>
      <span style={{
        fontSize: 11,
        color: T.accent.text,
        opacity: 0.7,
      }}>
        →
      </span>
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PRESENTATION ROW — wrapper for naked side-by-side columns. No
   cards, no shaded backgrounds — just whitespace and a single
   hairline divider between children. Drops to a single column on
   narrow viewports (the 1080px max-width handles wide → narrow
   gracefully via the wrap below).
   ════════════════════════════════════════════════════════════════════════ */
function PresentationRow({ children }) {
  const arr = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <section style={{
      display: 'grid',
      gridTemplateColumns: arr.length === 2 ? '1fr 1fr' : '1fr',
      gap: 0,
      paddingTop: 32,
      borderTop: `1px solid ${T.border.primary}`,
    }}>
      {arr.map((child, i) => (
        <div
          key={i}
          style={{
            padding: arr.length === 2 ? `0 ${i === 0 ? 48 : 0}px 0 ${i === 0 ? 0 : 48}px` : 0,
            borderLeft: arr.length === 2 && i > 0 ? `1px solid ${T.border.primary}` : 'none',
          }}
        >
          {child}
        </div>
      ))}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   RECENT COLUMN — last 5 uploads as a naked stack of rows. No card,
   no surface. Each row is a single line; remove button only on hover.
   ════════════════════════════════════════════════════════════════════════ */
function RecentColumn({ items, onOpen, onRemove }) {
  return (
    <div>
      <SlideHeader num="01" label="Zuletzt geladen" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 18 }}>
        {items.map((it, i) => (
          <RecentRow
            key={it.id}
            entry={it}
            isLast={i === items.length - 1}
            onOpen={() => onOpen(it)}
            onRemove={() => onRemove(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

function RecentRow({ entry, isLast, onOpen, onRemove }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 12px',
        margin: '0 -12px',
        cursor: 'pointer',
        background: hover ? T.bg.surface2 : 'transparent',
        borderRadius: 8,
        borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
        transition: 'background 140ms',
      }}
    >
      <span style={{
        fontFamily: T.font.mono,
        fontSize: 13.5,
        fontWeight: 500,
        color: hover ? T.accent.text : T.text.primary,
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        letterSpacing: '-0.005em',
        transition: 'color 140ms',
      }}>
        {entry.fbaCode || entry.fileName}
      </span>
      <span style={{
        fontSize: 11,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
        fontFamily: T.font.mono,
      }}>
        {entry.palletCount} · {entry.articleCount}
      </span>
      <span style={{
        fontSize: 10.5,
        color: T.text.faint,
        fontFamily: T.font.mono,
        flex: '0 0 70px',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
      }}>
        {formatRelative(entry.ts)}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Aus Verlauf entfernen"
        style={{
          width: 18,
          height: 18,
          background: 'transparent',
          border: 0,
          color: hover ? T.text.faint : 'transparent',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          transition: 'color 120ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.status.danger.main; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.text.faint; }}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   INSIGHTS COLUMN — 3 mini-stats stacked vertically as naked rows.
   Big numbers, micro-labels, no card chrome.
   ════════════════════════════════════════════════════════════════════════ */
function InsightsColumn({ history }) {
  const stats = useMemo(() => {
    if (!history?.length) return null;
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayMs = +todayStart;
    let todayCount = 0;
    let totalSec = 0;
    let totalPal = 0;
    let n = 0;
    for (const h of history) {
      n += 1;
      totalSec += h.durationSec || 0;
      totalPal += h.palletCount || 0;
      if (h.finishedAt && h.finishedAt >= todayMs) todayCount += 1;
    }
    return {
      todayCount,
      avgSec: n > 0 ? totalSec / n : 0,
      avgPal: n > 0 ? totalPal / n : 0,
      n,
    };
  }, [history]);

  if (!stats || stats.n === 0) return null;

  return (
    <div>
      <SlideHeader num="02" label="Insights" />
      <div style={{
        marginTop: 18,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 32,
      }}>
        <BigStat label="Heute" value={stats.todayCount} />
        <BigStat label="Ø Dauer" value={formatMin(stats.avgSec)} />
        <BigStat label="Ø Pal" value={stats.avgPal.toFixed(1)} />
      </div>
    </div>
  );
}

function BigStat({ label, value }) {
  return (
    <div>
      <div style={{
        fontSize: 'clamp(32px, 3.4vw, 40px)',
        fontWeight: 500,
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{
        marginTop: 8,
        fontSize: 10,
        fontWeight: 600,
        color: T.text.faint,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        fontFamily: T.font.mono,
      }}>
        {label}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   ATOMS
   ════════════════════════════════════════════════════════════════════════ */

function SectionLabel({ children }) {
  return (
    <div style={{
      marginBottom: 8,
      fontSize: 10,
      fontWeight: 500,
      color: T.text.faint,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      fontFamily: T.font.mono,
    }}>
      {children}
    </div>
  );
}

/* SlideHeader — numbered eyebrow in the magazine-slide style of
   Pruefen. Two mono-caps: index + label, separated by an em-dash. */
function SlideHeader({ num, label }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{
        fontSize: 10.5,
        fontWeight: 600,
        fontFamily: T.font.mono,
        color: T.text.faint,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      }}>
        {num}
      </span>
      <span style={{
        fontSize: 10.5,
        fontWeight: 500,
        fontFamily: T.font.mono,
        color: T.text.subtle,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      }}>
        — {label}
      </span>
    </div>
  );
}

function Kbd({ children, style }) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      padding: '0 5px',
      height: 16,
      fontSize: 10,
      fontFamily: T.font.mono,
      fontWeight: 600,
      color: T.text.subtle,
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 3,
      letterSpacing: '0.04em',
      ...style,
    }}>
      {children}
    </span>
  );
}

function DropIcon({ accent, size = 28 }) {
  const color = accent ? T.accent.main : T.text.subtle;
  return (
    <span style={{
      width: size + 18,
      height: size + 18,
      borderRadius: 12,
      background: accent ? '#fff' : T.bg.surface3,
      border: `1px solid ${accent ? T.accent.border : T.border.primary}`,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      color,
      flexShrink: 0,
      transition: 'all 240ms',
    }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 8l-5-5-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 3v12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function Spinner({ size = 14, color }) {
  return (
    <span style={{
      width: size, height: size,
      border: `${Math.max(1, Math.round(size / 8))}px solid ${T.border.primary}`,
      borderTopColor: color || T.accent.main,
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'mp-up-spin 600ms linear infinite',
      flexShrink: 0,
    }}>
      <style>{`@keyframes mp-up-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

const primaryButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  color: '#fff',
  background: T.accent.main,
  border: 0,
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: T.font.ui,
  transition: 'background 160ms',
};

const ghostButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 14px',
  fontSize: 12.5,
  fontWeight: 500,
  color: T.text.secondary,
  background: T.bg.surface,
  border: `1px solid ${T.border.strong}`,
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: T.font.ui,
  transition: 'all 160ms',
};

/* ─── helpers ──────────────────────────────────────────────────────── */
function formatRelative(ts) {
  if (!ts) return '—';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60)   return 'jetzt';
  const min = Math.floor(diffSec / 60);
  if (min < 60)       return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)         return `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7)          return `vor ${d} T`;
  return new Date(ts).toLocaleDateString('de-DE');
}

function formatMin(sec) {
  if (sec === 0) return '0m';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h ${min % 60}m`;
}
