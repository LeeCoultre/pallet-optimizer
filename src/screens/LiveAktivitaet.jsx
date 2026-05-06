/* Live-Aktivität — wer arbeitet jetzt + Feed der letzten Aktionen.

   Backend: /api/activity/live (Phase 1) liefert einen Snapshot mit
   `active_workers[]` und `events[]` plus `server_time`. Wir pollen
   alle 10 Sekunden über TanStack Query und tickern den Server-Zeit-
   anker lokal jede Sekunde, damit "vor 4 Sek" auch zwischen Polls
   richtig zählt.

   Layout:
     • OBEN — Aktive Operatoren als horizontale Karten-Reihe.
       Jede Karte: Avatar (Initiale), Name, FBA, Step-Pill, Pal-Counter,
       laufender Timer "X:YY läuft".
     • UNTEN — Feed als vertikale Timeline mit Action-Pill, Time-Ago,
       User-Name und Auftrags-Bezug. Action-Pill-Farbe codiert die Art:
         complete   → grün
         start      → akzent
         upload     → neutral
         cancel     → warn
         delete / role_change → danger / akzent
*/

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActivityLive } from '../marathonApi.js';
import {
  Page, Topbar, Card, Eyebrow, PageH1, Lead, EmptyState, T,
} from '../components/ui.jsx';

const POLL_MS = 10_000;

const STEP_META = {
  pruefen:   { label: 'Prüfen',    tone: T.accent.main },
  focus:     { label: 'Focus',     tone: T.status.warn.main },
  abschluss: { label: 'Abschluss', tone: T.status.success.main },
};

const ACTION_META = {
  upload:           { label: 'Upload',    tone: 'neutral' },
  start:            { label: 'Start',     tone: 'accent'  },
  complete:         { label: 'Fertig',    tone: 'success' },
  cancel:           { label: 'Abbruch',   tone: 'warn'    },
  delete:           { label: 'Gelöscht',  tone: 'danger'  },
  history_delete:   { label: 'Historie gelöscht', tone: 'danger' },
  user_role_change: { label: 'Rolle',     tone: 'accent'  },
};

export default function LiveAktivitaetScreen() {
  const liveQ = useQuery({
    queryKey: ['activity-live'],
    queryFn:  () => getActivityLive(50),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: POLL_MS / 2,
  });

  /* Local clock tick — drives "vor X Sek" labels and the worker
     timers between polls. We don't read the value, the re-render
     itself updates everything that calls relativeTime(). */
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const data = liveQ.data;
  const workers = data?.activeWorkers || [];
  const events = data?.events || [];
  const nowMs = Date.now();
  /* Use server_time when available — protects against client-clock skew
     so "vor X Sek" never shows negative or impossibly-large values. */
  const baseMs = data?.serverTime ? new Date(data.serverTime).getTime() : nowMs;
  const driftMs = nowMs - baseMs;

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Live-Aktivität' }]}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text.subtle }}>
            <PulseDot ok={!liveQ.isError} />
            {liveQ.isError ? 'Verbindung verloren' : liveQ.isFetching ? 'aktualisiert…' : `aktualisiert vor ${Math.round((nowMs - (liveQ.dataUpdatedAt || nowMs)) / 1000)}s`}
          </span>
        }
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 32px 80px' }}>
        <section style={{ marginBottom: 28 }}>
          <Eyebrow>Live</Eyebrow>
          <PageH1>Wer arbeitet jetzt</PageH1>
          <Lead>
            Aktive Operatoren oben, Feed unten — alle 10 Sekunden frisch.
            Hilft bei Schichtwechsel, um zu sehen, wer noch mitten in einem
            Auftrag ist.
          </Lead>
        </section>

        {/* Active workers */}
        <section style={{ marginBottom: 32 }}>
          <SectionLabel
            text="Aktive Operatoren"
            count={workers.length}
          />
          {workers.length === 0 ? (
            <Card padding={20} style={{ background: T.bg.surface2, border: `1px dashed ${T.border.strong}` }}>
              <span style={{ fontSize: 13, color: T.text.subtle }}>
                Niemand arbeitet gerade an einem Auftrag.
              </span>
            </Card>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}>
              {workers.map((w) => (
                <WorkerCard key={w.userId} worker={w} baseMs={baseMs} driftMs={driftMs} />
              ))}
            </div>
          )}
        </section>

        {/* Feed */}
        <section>
          <SectionLabel
            text="Feed (letzte 50 Aktionen)"
            count={events.length}
          />
          {liveQ.isLoading ? (
            <Card padding={20} style={{ textAlign: 'center', color: T.text.faint, fontSize: 13 }}>
              Lädt…
            </Card>
          ) : liveQ.isError ? (
            <Card padding={20} style={{ background: T.status.danger.bg, borderColor: T.status.danger.border }}>
              <span style={{ fontSize: 13, color: T.status.danger.text }}>
                Konnte Feed nicht laden: {liveQ.error?.message || 'Backend-Fehler'}
              </span>
            </Card>
          ) : events.length === 0 ? (
            <EmptyState
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12h3l3-7 4 14 3-7h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              title="Feed ist leer"
              description="Sobald jemand einen Auftrag hochlädt, startet oder abschließt, erscheint die Aktion hier."
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {events.map((e, i) => (
                <FeedRow
                  key={e.id}
                  event={e}
                  baseMs={baseMs}
                  driftMs={driftMs}
                  isLast={i === events.length - 1}
                />
              ))}
            </Card>
          )}
        </section>
      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function WorkerCard({ worker, baseMs, driftMs }) {
  const initial = (worker.userName || '·').trim().charAt(0).toUpperCase();
  const stepCfg = STEP_META[worker.step] || { label: worker.step || '—', tone: T.text.subtle };
  const startedMs = worker.startedAt ? new Date(worker.startedAt).getTime() : null;
  const elapsed = startedMs != null
    ? Math.max(0, Math.floor((baseMs + driftMs - startedMs) / 1000))
    : null;

  return (
    <div style={{
      padding: '14px 16px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderLeft: `3px solid ${stepCfg.tone}`,
      borderRadius: T.radius.md,
      boxShadow: T.shadow.card,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 28, height: 28,
          borderRadius: '50%',
          background: T.accent.main,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}>
          {initial}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: T.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {worker.userName}
          </div>
          <div style={{
            fontSize: 11,
            color: T.text.subtle,
            fontFamily: T.font.mono,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={worker.fbaCode || worker.fileName}>
            {worker.fbaCode || worker.fileName || '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          padding: '2px 8px',
          background: stepCfg.tone + '22',
          color: stepCfg.tone,
          borderRadius: T.radius.full,
          fontSize: 10.5,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {stepCfg.label}
        </span>
        <span style={{ fontSize: 11.5, color: T.text.subtle, fontVariantNumeric: 'tabular-nums' }}>
          Pal {(worker.currentPalletIdx ?? 0) + 1} / {worker.palletCount || '?'}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 11.5,
          color: T.text.secondary,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {elapsed != null ? formatDuration(elapsed) : '—'}
        </span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function FeedRow({ event, baseMs, driftMs, isLast }) {
  const cfg = ACTION_META[event.action] || { label: event.action, tone: 'neutral' };
  const ago = relativeTime(event.createdAt, baseMs, driftMs);
  const tonePalette = ({
    success: T.status.success,
    warn:    T.status.warn,
    danger:  T.status.danger,
    accent:  { bg: T.accent.bg, text: T.accent.text, border: T.accent.border },
    neutral: { bg: T.bg.surface3, text: T.text.secondary, border: T.border.primary },
  })[cfg.tone] || { bg: T.bg.surface3, text: T.text.secondary, border: T.border.primary };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 18px',
      borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
    }}>
      {/* Action pill */}
      <span style={{
        flex: '0 0 110px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 8px',
        background: tonePalette.bg,
        color: tonePalette.text,
        border: `1px solid ${tonePalette.border}`,
        borderRadius: T.radius.full,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}>
        {cfg.label}
      </span>

      {/* User */}
      <span style={{
        flex: '0 0 130px',
        fontSize: 13,
        fontWeight: 500,
        color: T.text.primary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {event.userName || '—'}
      </span>

      {/* Auftrag — fbaCode or file_name */}
      <span style={{
        flex: 1,
        minWidth: 0,
        fontFamily: T.font.mono,
        fontSize: 12.5,
        color: T.text.secondary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }} title={event.auftragFileName || ''}>
        {event.fbaCode || event.auftragFileName || extraMetaSnippet(event) || '—'}
      </span>

      {/* Time-ago */}
      <span style={{
        flex: '0 0 90px',
        textAlign: 'right',
        fontSize: 11.5,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }} title={new Date(event.createdAt).toLocaleString('de-DE')}>
        {ago}
      </span>
    </div>
  );
}

/* For events without an Auftrag (e.g. user_role_change), pull a useful
   string out of meta. */
function extraMetaSnippet(e) {
  const m = e.meta || {};
  if (e.action === 'user_role_change') {
    return `${m.target_email || '?'}: ${m.old_role || '?'} → ${m.new_role || '?'}`;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════ */
function SectionLabel({ text, count }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 10,
    }}>
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {text}
      </span>
      <span style={{
        fontSize: 11,
        color: T.text.faint,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {count}
      </span>
    </div>
  );
}

function PulseDot({ ok }) {
  return (
    <span style={{
      width: 7, height: 7,
      borderRadius: '50%',
      background: ok ? T.status.success.main : T.status.danger.main,
      animation: ok ? 'mp-live-ping 2.4s ease-out infinite' : 'none',
      boxShadow: ok ? `0 0 0 0 ${T.status.success.main}` : 'none',
    }}>
      <style>{`
        @keyframes mp-live-ping {
          0%   { box-shadow: 0 0 0 0 ${T.status.success.main}66; }
          70%  { box-shadow: 0 0 0 6px ${T.status.success.main}00; }
          100% { box-shadow: 0 0 0 0 ${T.status.success.main}00; }
        }
      `}</style>
    </span>
  );
}

/* ─── helpers ──────────────────────────────────────────────────────── */
function relativeTime(isoOrMs, baseMs, driftMs) {
  if (!isoOrMs) return '—';
  const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = (baseMs + driftMs) - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 5)   return 'jetzt';
  if (sec < 60)  return `vor ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60)  return `vor ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `vor ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7)     return `vor ${d} T`;
  return new Date(t).toLocaleDateString('de-DE');
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} läuft`;
  return `${m}:${String(s).padStart(2, '0')} läuft`;
}
