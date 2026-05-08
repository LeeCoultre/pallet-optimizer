/* Live-Aktivität v2 — «Schicht-Puls».

   Magazine-spread design (matches Upload / Pruefen / Focus / Warteschlange):
     • Eyebrow `Live · 14:32 Uhr` + clamp(36–52) H1 «Schicht-Puls» + Lead
     • Hero KPI strip — Aktiv / Heute fertig / Online / Ältester Lauf / Ø Dauer
     • Stundenpuls — last-8h sparkline of activity by hour
     • Step-Lane — distribution of active workers across Pruefen/Focus/Abschluss
     • SelfBanner — when YOU are the active worker, dedicated hero
     • WorkerCard v2 — 40px avatar, mono-22 elapsed timer, 3-segment
       workflow indicator, pallet progress bar, idle-warning ring
       (>5 min since last audit event)
     • Timeline-Feed — vertical line + colored dots, grouped by hour
     • Filter chips — Alle / Upload / Start / Fertig / Abbruch / Admin
     • Pause-poll toggle — freeze refetch to read calmly

   Backend unchanged (uses /api/activity/live).
*/

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getActivityLive } from '@/marathonApi.js';
import { useMe } from '@/hooks/useMe.js';
import {
  Page, Topbar, Card, Eyebrow, Lead, EmptyState, Button, T,
} from '@/components/ui.jsx';

const POLL_MS = 10_000;
const IDLE_THRESHOLD_SEC = 5 * 60;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const HOURLY_WINDOW = 8;

const STEP_ORDER = ['pruefen', 'focus', 'abschluss'];
const STEP_META = {
  pruefen:   { label: 'Prüfen',    color: 'var(--accent)',          tone: T.accent },
  focus:     { label: 'Focus',     color: T.status.warn.main,        tone: T.status.warn },
  abschluss: { label: 'Abschluss', color: T.status.success.main,     tone: T.status.success },
};

const ACTION_META = {
  upload:           { label: 'Upload',   tone: 'neutral' },
  start:            { label: 'Start',    tone: 'accent'  },
  complete:         { label: 'Fertig',   tone: 'success' },
  cancel:           { label: 'Abbruch',  tone: 'warn'    },
  delete:           { label: 'Gelöscht', tone: 'danger'  },
  history_delete:   { label: 'Historie gelöscht', tone: 'danger' },
  user_role_change: { label: 'Rolle',    tone: 'accent'  },
};

const FILTERS = [
  { id: 'all',      label: 'Alle' },
  { id: 'upload',   label: 'Upload' },
  { id: 'start',    label: 'Start' },
  { id: 'complete', label: 'Fertig' },
  { id: 'cancel',   label: 'Abbruch' },
  { id: 'admin',    label: 'Admin' },
];

const TONE_TO_PALETTE = {
  success: T.status.success,
  warn:    T.status.warn,
  danger:  T.status.danger,
  accent:  { main: 'var(--accent)', bg: T.accent.bg, text: T.accent.text, border: T.accent.border },
  neutral: { main: T.text.faint,    bg: T.bg.surface3, text: T.text.secondary, border: T.border.primary },
};

/* ════════════════════════════════════════════════════════════════════════ */
export default function LiveAktivitaetScreen({ onRoute }: { onRoute?: (route: string) => void }) {
  const meQ = useMe();
  const me = meQ.data;

  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState('all');

  const liveQ = useQuery({
    queryKey: ['activity-live'],
    queryFn:  () => getActivityLive(50),
    refetchInterval: paused ? false : POLL_MS,
    refetchOnWindowFocus: !paused,
    staleTime: POLL_MS / 2,
  });

  /* Local clock tick so timers and "vor Xs" labels update each second
     between server polls. We don't read the value — the re-render wakes
     all callers of (baseMs + driftMs). */
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const data    = liveQ.data;
  const workers = data?.activeWorkers || [];
  const events  = data?.events || [];
  const nowMs   = Date.now();
  const baseMs  = data?.serverTime ? new Date(data.serverTime).getTime() : nowMs;
  const driftMs = nowMs - baseMs;
  const liveNow = baseMs + driftMs;

  /* Last audit event per user → idle detection on WorkerCard. */
  const lastActionByUser = useMemo(() => {
    const m = {};
    for (const e of events) {
      const t = new Date(e.createdAt).getTime();
      if (Number.isNaN(t)) continue;
      if (!m[e.userId] || m[e.userId] < t) m[e.userId] = t;
    }
    return m;
  }, [events]);

  /* Hero KPIs */
  const kpis = useMemo(
    () => computeKpis({ workers, events, liveNow }),
    [workers, events, liveNow],
  );

  /* Hourly puls — last 8 hours of events bucketed */
  const hourly = useMemo(
    () => buildHourly(events, liveNow, HOURLY_WINDOW),
    [events, liveNow],
  );

  /* Step distribution across active workers */
  const stepLane = useMemo(() => {
    const c = { pruefen: 0, focus: 0, abschluss: 0 };
    for (const w of workers) if (c[w.step] !== undefined) c[w.step] += 1;
    return c;
  }, [workers]);

  const selfWorker = useMemo(
    () => workers.find((w) => w.userId === me?.id) || null,
    [workers, me?.id],
  );

  /* Filtered + grouped feed */
  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'admin') {
      return events.filter((e) => /role|delete|history_delete/i.test(e.action || ''));
    }
    return events.filter((e) => e.action === filter);
  }, [events, filter]);

  const feedGroups = useMemo(() => groupByHour(visibleEvents), [visibleEvents]);

  return (
    <Page>
      <Topbar
        crumbs={[{ label: 'Live-Aktivität' }]}
        right={
          <TopbarRight
            liveQ={liveQ}
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            now={nowMs}
          />
        }
      />

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 40px 96px' }}>
        {/* HEADER */}
        <header style={{ marginBottom: 40 }}>
          <Eyebrow>
            Live · {new Date(liveNow).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
          </Eyebrow>
          <h1 style={{
            fontFamily: T.font.ui,
            fontSize: 'clamp(36px, 2.8vw, 52px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            color: T.text.primary,
            margin: 0,
          }}>
            Schicht-Puls
          </h1>
          <Lead style={{ marginTop: 16, maxWidth: 720, fontSize: 16 }}>
            Wer arbeitet woran, wer ist online, was lief gerade. Alle 10
            Sekunden frisch — pausierbar, wenn du in Ruhe lesen willst.
          </Lead>
        </header>

        {/* SELF BANNER — when I'm one of the active workers */}
        {selfWorker && (
          <SelfBanner
            worker={selfWorker}
            liveNow={liveNow}
            onRoute={onRoute}
          />
        )}

        {/* KPI STRIP */}
        <KpiStrip kpis={kpis} />

        {/* STUNDEN-PULS + STEP-LANE */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)',
          gap: 16,
          marginBottom: 40,
        }}>
          <StundenpulsCard hourly={hourly} />
          <StepLaneCard counts={stepLane} totalActive={workers.length} />
        </div>

        {/* ACTIVE OPERATORS */}
        <section style={{ marginBottom: 48 }}>
          <SectionHeader title="Aktive Operatoren" count={workers.length} />
          {workers.length === 0 ? (
            <Card padding={28} style={{ background: T.bg.surface2, border: `1px dashed ${T.border.strong}`, textAlign: 'center' }}>
              <span style={{ fontSize: 14, color: T.text.subtle }}>
                Niemand arbeitet gerade an einem Auftrag.
              </span>
            </Card>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 14,
            }}>
              {workers.map((w) => (
                <WorkerCard
                  key={w.userId}
                  worker={w}
                  liveNow={liveNow}
                  lastActionMs={lastActionByUser[w.userId]}
                  isMe={w.userId === me?.id}
                />
              ))}
            </div>
          )}
        </section>

        {/* FEED */}
        <section>
          <FeedToolbar
            filter={filter}
            onFilter={setFilter}
            totalCount={events.length}
            visibleCount={visibleEvents.length}
          />
          {liveQ.isLoading ? (
            <Card padding={32} style={{ textAlign: 'center', color: T.text.faint, fontSize: 13 }}>
              Lädt…
            </Card>
          ) : liveQ.isError ? (
            <Card padding={20} style={{ background: T.status.danger.bg, borderColor: T.status.danger.border }}>
              <span style={{ fontSize: 13, color: T.status.danger.text }}>
                Konnte Feed nicht laden: {liveQ.error?.message || 'Backend-Fehler'}
              </span>
            </Card>
          ) : visibleEvents.length === 0 ? (
            <EmptyState
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12h3l3-7 4 14 3-7h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              title={filter === 'all' ? 'Feed ist leer' : 'Keine Treffer für diesen Filter'}
              description={filter === 'all'
                ? 'Sobald jemand einen Auftrag hochlädt, startet oder abschließt, erscheint die Aktion hier.'
                : 'Wechsle den Filter auf „Alle“ oder warte auf eine passende Aktion.'}
              action={filter !== 'all' ? (
                <Button variant="ghost" size="sm" onClick={() => setFilter('all')}>
                  Filter zurücksetzen
                </Button>
              ) : null}
            />
          ) : (
            <TimelineFeed groups={feedGroups} liveNow={liveNow} />
          )}
        </section>
      </main>

      <style>{`
        @keyframes mp-live-ping {
          0%   { box-shadow: 0 0 0 0 ${T.status.success.main}66; }
          70%  { box-shadow: 0 0 0 6px ${T.status.success.main}00; }
          100% { box-shadow: 0 0 0 0 ${T.status.success.main}00; }
        }
        @keyframes mp-idle-pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${T.status.warn.main}55; }
          50%      { box-shadow: 0 0 0 5px ${T.status.warn.main}00; }
        }
        @keyframes mp-self-glow {
          0%, 100% { box-shadow: 0 1px 3px rgba(17,24,39,0.04), 0 12px 32px -16px rgba(99,102,241,0.18); }
          50%      { box-shadow: 0 1px 3px rgba(17,24,39,0.04), 0 16px 40px -14px rgba(99,102,241,0.30); }
        }
      `}</style>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Helpers — KPIs, hourly bucketing, group-by-hour
   ════════════════════════════════════════════════════════════════════════ */

function computeKpis({ workers, events, liveNow }) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const onlineCutoff = liveNow - ONLINE_WINDOW_MS;

  let completedToday = 0;
  const onlineUsers = new Set();
  for (const e of events) {
    const t = new Date(e.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    if (e.action === 'complete' && t >= todayMs) completedToday += 1;
    if (t >= onlineCutoff && e.userId) onlineUsers.add(e.userId);
  }
  /* Currently-active workers count as online by definition. */
  for (const w of workers) onlineUsers.add(w.userId);

  const elapsedSecs = workers
    .filter((w) => w.startedAt)
    .map((w) => Math.max(0, Math.floor((liveNow - new Date(w.startedAt).getTime()) / 1000)));
  const oldestSec   = elapsedSecs.length ? Math.max(...elapsedSecs) : 0;
  const avgActiveSec = elapsedSecs.length
    ? Math.round(elapsedSecs.reduce((a, b) => a + b, 0) / elapsedSecs.length)
    : 0;

  return {
    active: workers.length,
    completedToday,
    online: onlineUsers.size,
    oldestSec,
    avgActiveSec,
  };
}

function buildHourly(events, liveNow, hours) {
  const buckets = [];
  const now = new Date(liveNow);
  /* Round DOWN to current hour, then walk back. */
  const cur = new Date(now);
  cur.setMinutes(0, 0, 0);
  for (let i = hours - 1; i >= 0; i--) {
    const start = new Date(cur);
    start.setHours(cur.getHours() - i);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    buckets.push({
      startMs: start.getTime(),
      endMs:   end.getTime(),
      label:   String(start.getHours()).padStart(2, '0'),
      counts:  { upload: 0, start: 0, complete: 0, cancel: 0, other: 0 },
      total:   0,
    });
  }
  const minStart = buckets[0].startMs;
  const maxEnd   = buckets[buckets.length - 1].endMs;
  for (const e of events) {
    const t = new Date(e.createdAt).getTime();
    if (Number.isNaN(t) || t < minStart || t >= maxEnd) continue;
    const idx = Math.floor((t - minStart) / (60 * 60 * 1000));
    const b = buckets[idx];
    if (!b) continue;
    const a = e.action;
    if (a === 'upload' || a === 'start' || a === 'complete' || a === 'cancel') b.counts[a] += 1;
    else b.counts.other += 1;
    b.total += 1;
  }
  return buckets;
}

function groupByHour(events) {
  /* Returns [{hourMs, label, events: [...]}] in incoming (newest-first) order. */
  const map = new Map();
  const order = [];
  for (const e of events) {
    const t = new Date(e.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    const d = new Date(t);
    d.setMinutes(0, 0, 0);
    const key = d.getTime();
    if (!map.has(key)) {
      const label = `${String(d.getHours()).padStart(2, '0')}:00`;
      map.set(key, { hourMs: key, label, events: [] });
      order.push(key);
    }
    map.get(key).events.push(e);
  }
  return order.map((k) => map.get(k));
}

/* Date-aware label: today shows "HH:00", yesterday "Gestern HH:00", earlier full date. */
function hourLabel(hourMs, liveNow) {
  const d = new Date(hourMs);
  const today = new Date(liveNow); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const hh = String(d.getHours()).padStart(2, '0');
  if (d >= today) return `${hh}:00 · heute`;
  if (d >= yesterday) return `${hh}:00 · gestern`;
  return `${hh}:00 · ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;
}

function fmtElapsed(sec) {
  if (sec == null || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDurationShort(sec) {
  if (!sec || sec < 60) return '< 1 min';
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${String(r).padStart(2, '0')} min` : `${h}h`;
}

function relativeTime(isoOrMs, liveNow) {
  if (!isoOrMs) return '—';
  const t = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (Number.isNaN(t)) return '—';
  const sec = Math.max(0, Math.floor((liveNow - t) / 1000));
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

/* ════════════════════════════════════════════════════════════════════════
   Topbar right: freshness + pause toggle
   ════════════════════════════════════════════════════════════════════════ */
function TopbarRight({ liveQ, paused, onTogglePause, now }) {
  const ago = liveQ.dataUpdatedAt
    ? Math.round((now - liveQ.dataUpdatedAt) / 1000)
    : null;
  const status = liveQ.isError
    ? { text: 'Verbindung verloren', ok: false }
    : paused
    ? { text: ago != null ? `pausiert · ${ago}s alt` : 'pausiert', ok: false, paused: true }
    : liveQ.isFetching
    ? { text: 'aktualisiert…', ok: true }
    : { text: ago != null ? `aktualisiert vor ${ago}s` : 'live', ok: true };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.text.subtle }}>
        <PulseDot ok={status.ok} paused={status.paused} />
        {status.text}
      </span>
      <button
        type="button"
        onClick={onTogglePause}
        title={paused ? 'Live-Updates fortsetzen' : 'Live-Updates pausieren'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 10px',
          fontSize: 11.5,
          fontFamily: T.font.mono,
          color: paused ? T.accent.text : T.text.subtle,
          background: paused ? T.accent.bg : 'transparent',
          border: `1px solid ${paused ? T.accent.border : T.border.primary}`,
          borderRadius: T.radius.full,
          cursor: 'pointer',
          letterSpacing: '0.04em',
          transition: 'all 150ms',
        }}
      >
        {paused ? '▶ Fortsetzen' : '⏸ Pausieren'}
      </button>
    </div>
  );
}

function PulseDot({ ok, paused }) {
  const color = paused ? T.text.faint
    : ok ? T.status.success.main
    : T.status.danger.main;
  return (
    <span style={{
      width: 7, height: 7,
      borderRadius: '50%',
      background: color,
      animation: ok && !paused ? 'mp-live-ping 2.4s ease-out infinite' : 'none',
    }} />
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Self-banner — when I am one of the active workers
   ════════════════════════════════════════════════════════════════════════ */
function SelfBanner({ worker, liveNow, onRoute }) {
  const startedMs = worker.startedAt ? new Date(worker.startedAt).getTime() : null;
  const elapsed = startedMs != null ? Math.max(0, Math.floor((liveNow - startedMs) / 1000)) : null;
  const fba = worker.fbaCode || worker.fileName || '—';
  const stepCfg = STEP_META[worker.step] || STEP_META.pruefen;
  const palCur = (worker.currentPalletIdx ?? 0) + 1;
  const palTotal = worker.palletCount || 0;
  const pct = palTotal ? Math.min(100, Math.round(((worker.currentPalletIdx ?? 0) / palTotal) * 100)) : 0;

  return (
    <div
      style={{
        marginBottom: 36,
        padding: '24px 28px',
        background: T.bg.surface,
        border: `1px solid ${T.accent.border}`,
        borderRadius: T.radius.lg,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 24,
        position: 'relative',
        overflow: 'hidden',
        animation: 'mp-self-glow 4s ease-in-out infinite',
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0, left: 0,
        height: 2,
        width: `${pct}%`,
        background: T.accent.main,
        transition: 'width 280ms cubic-bezier(0.16, 1, 0.3, 1)',
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 600,
          fontFamily: T.font.mono,
          color: T.accent.text,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 8,
        }}>
          <span style={{
            width: 6, height: 6,
            borderRadius: '50%',
            background: T.accent.main,
          }} />
          Du bist gerade aktiv
        </div>
        <div style={{
          fontFamily: T.font.mono,
          fontSize: 22,
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.01em',
          marginBottom: 6,
        }}>
          {fba}
        </div>
        <div style={{
          fontSize: 13,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 14,
        }}>
          <span>Schritt: <strong style={{ color: stepCfg.tone.text }}>{stepCfg.label}</strong></span>
          <span style={{ color: T.border.strong }}>·</span>
          <span>Palette {palCur} von {palTotal}</span>
          <span style={{ color: T.border.strong }}>·</span>
          <span style={{ fontFamily: T.font.mono }}>{fmtElapsed(elapsed)}</span>
        </div>
      </div>
      <Button variant="primary" onClick={() => onRoute && onRoute('workspace')}>
        Fortsetzen
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 6h6m0 0L6 3m3 3L6 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   KPI strip — Aktiv / Heute fertig / Online / Ältester / Ø
   ════════════════════════════════════════════════════════════════════════ */
function KpiStrip({ kpis }) {
  return (
    <div style={{
      marginBottom: 16,
      padding: '24px 28px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.lg,
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 8,
    }}>
      <Kpi label="Aktiv"          value={kpis.active}          accent={kpis.active > 0} />
      <Kpi label="Heute fertig"   value={kpis.completedToday}  success={kpis.completedToday > 0} />
      <Kpi label="Online"         value={kpis.online} />
      <Kpi label="Ältester Lauf"  value={kpis.oldestSec ? fmtDurationShort(kpis.oldestSec) : '—'} />
      <Kpi label="Ø Lauf"         value={kpis.avgActiveSec ? fmtDurationShort(kpis.avgActiveSec) : '—'} />
    </div>
  );
}

function Kpi({ label, value, accent, success }: { label?: any; value?: any; accent?: boolean; success?: boolean }) {
  const color = accent ? T.accent.text : success ? T.status.success.text : T.text.primary;
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.font.ui,
        fontSize: 26,
        fontWeight: 500,
        letterSpacing: '-0.02em',
        color,
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Stundenpuls — last-8h sparkline of activity by hour
   ════════════════════════════════════════════════════════════════════════ */
function StundenpulsCard({ hourly }) {
  const max = Math.max(1, ...hourly.map((b) => b.total));
  const total = hourly.reduce((s, b) => s + b.total, 0);

  return (
    <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabelInline title="Stundenpuls" sub="letzte 8 Stunden" />
        <span style={{
          fontSize: 12,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: T.font.mono,
        }}>
          {total} Aktion{total === 1 ? '' : 'en'}
        </span>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${hourly.length}, 1fr)`,
        gap: 6,
        height: 76,
        alignItems: 'end',
      }}>
        {hourly.map((b) => {
          const h = b.total ? Math.max(4, Math.round((b.total / max) * 64)) : 2;
          return (
            <HourBar key={b.startMs} bucket={b} max={max} barHeight={h} />
          );
        })}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${hourly.length}, 1fr)`,
        gap: 6,
        fontSize: 10.5,
        fontFamily: T.font.mono,
        color: T.text.faint,
        textAlign: 'center',
      }}>
        {hourly.map((b) => (
          <span key={b.startMs}>{b.label}</span>
        ))}
      </div>
    </Card>
  );
}

function HourBar({ bucket, barHeight }: any) {
  const [hover, setHover] = useState(false);
  /* Stack segments by action color, proportional to count */
  const stacked = STACK_ORDER
    .map((k) => ({ k, count: bucket.counts[k] || 0 }))
    .filter((s) => s.count > 0);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        cursor: 'default',
      }}
      title={`${bucket.label}:00 — ${bucket.total} Aktion${bucket.total === 1 ? '' : 'en'}`}
    >
      <div style={{
        height: barHeight,
        borderRadius: 3,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column-reverse',
        background: bucket.total ? 'transparent' : T.border.subtle,
        transition: 'opacity 200ms',
        opacity: hover ? 0.85 : 1,
      }}>
        {stacked.map((s) => (
          <span
            key={s.k}
            style={{
              flex: s.count,
              background: STACK_COLOR[s.k],
              transition: 'flex 200ms',
            }}
          />
        ))}
      </div>
      {hover && bucket.total > 0 && (
        <div style={{
          position: 'absolute',
          bottom: barHeight + 6,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '4px 8px',
          fontSize: 10.5,
          fontFamily: T.font.mono,
          color: T.text.primary,
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.sm,
          whiteSpace: 'nowrap',
          boxShadow: T.shadow.card,
          pointerEvents: 'none',
          zIndex: 4,
        }}>
          {bucket.total}× {bucket.label}:00
        </div>
      )}
    </div>
  );
}

const STACK_ORDER = ['complete', 'start', 'upload', 'cancel', 'other'];
const STACK_COLOR = {
  complete: T.status.success.main,
  start:    'var(--accent)',
  upload:   T.text.faint,
  cancel:   T.status.warn.main,
  other:    T.border.strong,
};

/* ════════════════════════════════════════════════════════════════════════
   Step-Lane — distribution of active workers across workflow steps
   ════════════════════════════════════════════════════════════════════════ */
function StepLaneCard({ counts, totalActive }) {
  return (
    <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <SectionLabelInline title="Step-Lane" sub="aktive Schritte" />
        <span style={{
          fontSize: 12,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: T.font.mono,
        }}>
          {totalActive} aktiv
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {STEP_ORDER.map((step) => {
          const meta = STEP_META[step];
          const c = counts[step] || 0;
          const pct = totalActive ? c / totalActive : 0;
          return (
            <div key={step}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 4,
              }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: T.text.primary,
                  fontFamily: T.font.ui,
                }}>
                  {meta.label}
                </span>
                <span style={{
                  fontSize: 11,
                  fontFamily: T.font.mono,
                  color: c > 0 ? meta.tone.text : T.text.faint,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {c}
                </span>
              </div>
              <div style={{
                height: 6,
                background: T.bg.surface3,
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct * 100}%`,
                  height: '100%',
                  background: meta.color,
                  transition: 'width 240ms cubic-bezier(0.16, 1, 0.3, 1)',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   WorkerCard v2 — avatar + elapsed timer + step indicator + pallet bar +
                   idle ring (>5 min since last audit event)
   ════════════════════════════════════════════════════════════════════════ */
function WorkerCard({ worker, liveNow, lastActionMs, isMe }) {
  const startedMs = worker.startedAt ? new Date(worker.startedAt).getTime() : null;
  const elapsed = startedMs != null
    ? Math.max(0, Math.floor((liveNow - startedMs) / 1000))
    : null;
  const stepCfg = STEP_META[worker.step] || STEP_META.pruefen;
  const palCur   = (worker.currentPalletIdx ?? 0) + 1;
  const palTotal = worker.palletCount || 0;
  const palPct   = palTotal ? Math.min(1, palCur / palTotal) : 0;

  const lastSec = lastActionMs ? Math.max(0, Math.floor((liveNow - lastActionMs) / 1000)) : null;
  const isIdle = lastSec != null && lastSec >= IDLE_THRESHOLD_SEC;

  const initial = (worker.userName || '·').trim().charAt(0).toUpperCase();
  const fba = worker.fbaCode || worker.fileName || '—';

  return (
    <div style={{
      padding: '18px 18px 16px',
      background: T.bg.surface,
      border: `1px solid ${isMe ? T.accent.border : T.border.primary}`,
      borderRadius: T.radius.lg,
      boxShadow: T.shadow.card,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      {/* Header: avatar + name + timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          position: 'relative',
          width: 40, height: 40,
          flexShrink: 0,
          borderRadius: '50%',
          background: isMe ? T.accent.main : T.text.primary,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 600,
          fontFamily: T.font.ui,
          letterSpacing: '-0.01em',
          animation: isIdle ? 'mp-idle-pulse 1800ms ease-in-out infinite' : 'none',
        }}>
          {initial}
          {isIdle && (
            <span
              title="Inaktiv seit > 5 Min"
              style={{
                position: 'absolute',
                bottom: -2, right: -2,
                width: 14, height: 14,
                borderRadius: '50%',
                background: T.status.warn.main,
                border: `2px solid ${T.bg.surface}`,
              }}
            />
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 2,
          }}>
            <span style={{
              fontSize: 14,
              fontWeight: 600,
              color: T.text.primary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {worker.userName || '—'}
            </span>
            {isMe && (
              <span style={{
                padding: '1px 6px',
                fontSize: 9.5,
                fontWeight: 700,
                fontFamily: T.font.mono,
                color: T.accent.text,
                background: T.accent.bg,
                border: `1px solid ${T.accent.border}`,
                borderRadius: T.radius.full,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                Du
              </span>
            )}
          </div>
          <div style={{
            fontSize: 11.5,
            fontFamily: T.font.mono,
            color: T.text.subtle,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={fba}>
            {fba}
          </div>
        </div>
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 22,
          fontWeight: 500,
          color: T.text.primary,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          flexShrink: 0,
        }}>
          {fmtElapsed(elapsed)}
        </span>
      </div>

      {/* Step indicator: 3 segments */}
      <StepIndicator currentStep={worker.step} />

      {/* Pallet progress bar */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 10.5,
          fontFamily: T.font.mono,
          color: T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}>
          <span>Palette</span>
          <span style={{ color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
            {palCur} / {palTotal || '?'}
          </span>
        </div>
        <div style={{
          height: 5,
          background: T.bg.surface3,
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            width: `${palPct * 100}%`,
            height: '100%',
            background: stepCfg.color,
            transition: 'width 280ms cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>
      </div>

      {/* Last action footer */}
      <div style={{
        fontSize: 11,
        color: isIdle ? T.status.warn.text : T.text.faint,
        fontFamily: T.font.mono,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        {isIdle && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        )}
        Letzte Aktion {lastActionMs ? relativeTime(lastActionMs, liveNow) : 'unbekannt'}
      </div>
    </div>
  );
}

function StepIndicator({ currentStep }) {
  const idx = STEP_ORDER.indexOf(currentStep);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 6,
    }}>
      {STEP_ORDER.map((step, i) => {
        const meta = STEP_META[step];
        const state = i < idx ? 'done' : i === idx ? 'current' : 'todo';
        const segBg = state === 'done'    ? T.status.success.main
                    : state === 'current' ? meta.color
                    : T.bg.surface3;
        const labelColor = state === 'todo' ? T.text.faint
                         : state === 'done' ? T.status.success.text
                         : meta.tone.text;
        return (
          <div key={step} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{
              height: 4,
              borderRadius: 2,
              background: segBg,
              transition: 'background 200ms',
            }} />
            <span style={{
              fontSize: 10,
              fontFamily: T.font.mono,
              fontWeight: 600,
              color: labelColor,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textAlign: 'center',
            }}>
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Feed toolbar — filter chips + visible/total counter
   ════════════════════════════════════════════════════════════════════════ */
function FeedToolbar({ filter, onFilter, totalCount, visibleCount }) {
  return (
    <div style={{
      marginBottom: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
    }}>
      <SectionLabelInline title="Feed" sub={
        filter === 'all'
          ? `${totalCount} Aktion${totalCount === 1 ? '' : 'en'}`
          : `${visibleCount} von ${totalCount}`
      } />
      <span style={{ flex: 1 }} />
      {FILTERS.map((f) => (
        <FilterChip
          key={f.id}
          active={filter === f.id}
          onClick={() => onFilter(f.id)}
        >
          {f.label}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({ children, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 28,
        padding: '0 12px',
        fontSize: 12,
        fontWeight: 500,
        fontFamily: T.font.ui,
        background: active ? T.accent.bg : (hover ? T.bg.surface3 : T.bg.surface),
        border: `1px solid ${active ? T.accent.border : T.border.primary}`,
        color: active ? T.accent.text : T.text.secondary,
        borderRadius: T.radius.full,
        cursor: 'pointer',
        transition: 'all 150ms ease',
      }}
    >
      {children}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Timeline-Feed — vertical line + colored dots, grouped by hour
   ════════════════════════════════════════════════════════════════════════ */
function TimelineFeed({ groups, liveNow }) {
  return (
    <div style={{
      position: 'relative',
      paddingLeft: 28,
    }}>
      {/* Vertical line */}
      <div style={{
        position: 'absolute',
        left: 8,
        top: 12,
        bottom: 8,
        width: 1,
        background: T.border.primary,
      }} />

      {groups.map((g) => (
        <div key={g.hourMs} style={{ marginBottom: 18 }}>
          <div style={{
            position: 'relative',
            marginLeft: -28,
            paddingLeft: 28,
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}>
            <span style={{
              position: 'absolute',
              left: 1,
              width: 14, height: 14,
              borderRadius: '50%',
              background: T.bg.surface,
              border: `2px solid ${T.border.strong}`,
            }} />
            <span style={{
              fontSize: 11,
              fontFamily: T.font.mono,
              fontWeight: 600,
              color: T.text.subtle,
              textTransform: 'uppercase',
              letterSpacing: '0.10em',
            }}>
              {hourLabel(g.hourMs, liveNow)}
            </span>
            <span style={{
              flex: 1,
              height: 1,
              background: T.border.subtle,
            }} />
            <span style={{
              fontSize: 11,
              fontFamily: T.font.mono,
              color: T.text.faint,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {g.events.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {g.events.map((e) => (
              <FeedRow key={e.id} event={e} liveNow={liveNow} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedRow({ event, liveNow }) {
  const cfg = ACTION_META[event.action] || { label: event.action, tone: 'neutral' };
  const palette = TONE_TO_PALETTE[cfg.tone] || TONE_TO_PALETTE.neutral;
  const ago = relativeTime(event.createdAt, liveNow);

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 0',
    }}>
      {/* Dot */}
      <span style={{
        position: 'absolute',
        left: -24,
        top: '50%',
        transform: 'translateY(-50%)',
        width: 10, height: 10,
        borderRadius: '50%',
        background: palette.main,
        border: `2px solid ${T.bg.page}`,
      }} />

      {/* Action pill */}
      <span style={{
        flex: '0 0 auto',
        minWidth: 84,
        textAlign: 'center',
        padding: '3px 10px',
        background: palette.bg,
        color: palette.text,
        border: `1px solid ${palette.border}`,
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

      {/* Auftrag */}
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
        fontFamily: T.font.mono,
        fontVariantNumeric: 'tabular-nums',
      }} title={new Date(event.createdAt).toLocaleString('de-DE')}>
        {ago}
      </span>
    </div>
  );
}

function extraMetaSnippet(e) {
  const m = e.meta || {};
  if (e.action === 'user_role_change') {
    return `${m.target_email || '?'}: ${m.old_role || '?'} → ${m.new_role || '?'}`;
  }
  return null;
}

/* ════════════════════════════════════════════════════════════════════════
   Mini section header (used inside Cards/Toolbars)
   ════════════════════════════════════════════════════════════════════════ */
function SectionHeader({ title, count }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 10,
      marginBottom: 14,
    }}>
      <h2 style={{
        margin: 0,
        fontFamily: T.font.ui,
        fontSize: 18,
        fontWeight: 500,
        letterSpacing: '-0.015em',
        color: T.text.primary,
      }}>
        {title}
      </h2>
      <span style={{
        fontSize: 12,
        color: T.text.faint,
        fontFamily: T.font.mono,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {count}
      </span>
    </div>
  );
}

function SectionLabelInline({ title, sub }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5,
        fontFamily: T.font.mono,
        fontWeight: 600,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
      }}>
        {title}
      </div>
      {sub && (
        <div style={{
          fontSize: 12,
          color: T.text.faint,
          marginTop: 2,
          fontFamily: T.font.ui,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}