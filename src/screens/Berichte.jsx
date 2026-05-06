/* Berichte / Export — xlsx-Download für die Buchhaltung.

   Backend: /api/exports/auftraege.xlsx (Phase 1) — generiert ein
   openpyxl-Workbook mit Spalten Datum/Operator/Sendungsnr/Datei/Pal/
   Artikel/Dauer/Status. Header `X-Row-Count` meldet die Anzahl, die
   wir nach dem Download als Toast zeigen.

   Vorschau (KPI-Strip oben) zählt Treffer im aktuellen Zeitraum, ohne
   den xlsx zu generieren. Da es kein dediziertes Backend-Endpoint für
   einen schnellen "count" gibt, holen wir die ersten 200 Treffer aus
   /api/admin/auftraege?status=completed&limit=200 — das geht aber nur
   für Admins. Für regulären User zeigen wir stattdessen die letzten
   50 aus /api/history. So oder so wird der xlsx-Export selber von
   ALLEN gestartet, nicht nur Admins.

   Bewusst ohne Recharts hier — die Seite ist "ein Knopf", nicht ein
   Dashboard. Wer Charts will, geht zu Admin.
*/

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { downloadAuftraegeXlsx, getHistory } from '../marathonApi.js';
import {
  Page, Topbar, Card, Eyebrow, PageH1, Lead,
  Button, EmptyState, T,
} from '../components/ui.jsx';

export default function BerichteScreen() {
  const today = new Date();
  const todayIso = isoDate(today);
  const monthStartIso = isoDate(startOfMonth(today));
  const weekStartIso = isoDate(startOfWeek(today));

  /* Default: this month so the user lands on a useful preview. */
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIso);

  const [status, setStatus] = useState(null);
  /* status shape: { kind: 'success' | 'error' | 'pending', message: string } */

  /* Preview — count completed Aufträge that fall in the range.
     Uses /api/history (all users), filters client-side by finishedAt.
     For volume bigger than 200 we'd add a dedicated /api/exports/count
     endpoint, but at 5 operators × ~10 Aufträge/day we're nowhere
     near that ceiling. */
  const historyQ = useQuery({
    queryKey: ['history', 200, 0],
    queryFn:  () => getHistory(200, 0),
    staleTime: 60_000,
  });

  const summary = useMemo(() => {
    const items = historyQ.data?.items || [];
    if (!from && !to) return summarize(items);
    const fromMs = from ? new Date(from + 'T00:00:00').getTime() : -Infinity;
    /* End of `to` day, inclusive */
    const toMs = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
    const filtered = items.filter((h) => {
      const ms = h.finishedAt;
      return ms != null && ms >= fromMs && ms <= toMs;
    });
    return summarize(filtered);
  }, [historyQ.data, from, to]);

  const presets = [
    { id: 'today', label: 'Heute',
      apply: () => { setFrom(todayIso); setTo(todayIso); } },
    { id: 'week',  label: 'Diese Woche',
      apply: () => { setFrom(weekStartIso); setTo(todayIso); } },
    { id: 'month', label: 'Diesen Monat',
      apply: () => { setFrom(monthStartIso); setTo(todayIso); } },
    { id: 'all',   label: 'Alles',
      apply: () => { setFrom(''); setTo(''); } },
  ];

  const activePreset = matchPreset({ from, to, todayIso, weekStartIso, monthStartIso });

  const onDownload = async () => {
    setStatus({ kind: 'pending', message: 'xlsx wird erstellt…' });
    try {
      const res = await downloadAuftraegeXlsx({
        from: from || undefined,
        to:   to   || undefined,
      });
      setStatus({
        kind: 'success',
        message: res.rowCount === 0
          ? 'Datei ist leer — keine Aufträge im Bereich.'
          : `${res.rowCount} ${res.rowCount === 1 ? 'Zeile' : 'Zeilen'} exportiert.`,
      });
    } catch (e) {
      setStatus({ kind: 'error', message: e?.message || 'Download fehlgeschlagen' });
    }
  };

  return (
    <Page>
      <Topbar crumbs={[{ label: 'Berichte' }]} />

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '32px 32px 80px' }}>
        <section style={{ marginBottom: 28 }}>
          <Eyebrow>Export</Eyebrow>
          <PageH1>Berichte</PageH1>
          <Lead>
            Lade alle abgeschlossenen Aufträge im gewählten Zeitraum als xlsx
            herunter — Datei mit Spalten Datum, Operator, Sendungsnummer, Datei,
            Paletten, Artikel, Dauer und Status.
          </Lead>
        </section>

        {/* Form card */}
        <Card padding={24} style={{ marginBottom: 16 }}>
          {/* Presets */}
          <div style={{ marginBottom: 18 }}>
            <Label>Zeitraum-Voreinstellung</Label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {presets.map((p) => (
                <PresetButton
                  key={p.id}
                  active={activePreset === p.id}
                  onClick={p.apply}
                >
                  {p.label}
                </PresetButton>
              ))}
            </div>
          </div>

          {/* Date inputs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
            marginBottom: 20,
          }}>
            <DateField label="Von" value={from} onChange={setFrom} />
            <DateField label="Bis" value={to} onChange={setTo} max={todayIso} />
          </div>

          {/* Preview KPI */}
          <div style={{
            padding: '14px 16px',
            background: T.bg.surface2,
            border: `1px solid ${T.border.primary}`,
            borderRadius: T.radius.md,
            marginBottom: 16,
          }}>
            <Label>Vorschau (basierend auf Historie)</Label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginTop: 10,
            }}>
              <PreviewKpi label="Aufträge"  value={summary.orders} />
              <PreviewKpi label="Paletten"  value={summary.pallets} />
              <PreviewKpi label="Artikel"   value={summary.articles} />
              <PreviewKpi label="Dauer Σ"   value={formatHours(summary.seconds)} />
            </div>
            {historyQ.isLoading && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: T.text.faint }}>
                Lädt Historie…
              </div>
            )}
            {historyQ.isError && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: T.status.danger.text }}>
                Konnte Historie nicht laden — die Vorschau ist evtl. unvollständig.
              </div>
            )}
            {!historyQ.isLoading && !historyQ.isError && historyQ.data?.total > 200 && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: T.text.faint }}>
                Hinweis: Vorschau berücksichtigt die letzten 200 Aufträge. Der
                xlsx-Export selbst exportiert ALLE im Zeitraum.
              </div>
            )}
          </div>

          {/* CTA + status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              variant="primary"
              onClick={onDownload}
              disabled={status?.kind === 'pending'}
            >
              {status?.kind === 'pending' ? 'Wird erstellt…' : 'xlsx herunterladen'}
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none">
                <path d="M9 2v9m0 0l-3-3m3 3l3-3M3 14h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Button>
            {status && (
              <span style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: status.kind === 'error' ? T.status.danger.text
                  : status.kind === 'success' ? T.status.success.text
                  : T.text.subtle,
              }}>
                {status.message}
              </span>
            )}
          </div>
        </Card>

        {/* Help blurb */}
        <div style={{
          padding: '14px 18px',
          background: T.accent.bg,
          border: `1px solid ${T.accent.border}`,
          borderRadius: T.radius.md,
          fontSize: 12.5,
          color: T.accent.text,
          lineHeight: 1.5,
        }}>
          <strong>Tipp:</strong> Der Export enthält nur abgeschlossene Aufträge.
          Lass „Bis" leer, um alles bis heute einzuschließen — leere „Von" für
          den gesamten Zeitraum.
        </div>
      </main>
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function DateField({ label, value, onChange, max }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Label>{label}</Label>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 36,
          padding: '0 10px',
          fontSize: 13.5,
          fontFamily: T.font.ui,
          color: T.text.primary,
          background: T.bg.surface,
          border: `1px solid ${T.border.primary}`,
          borderRadius: T.radius.md,
          outline: 'none',
        }}
      />
    </label>
  );
}

function PresetButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        color: active ? T.accent.text : T.text.secondary,
        background: active ? T.accent.bg : T.bg.surface,
        border: `1px solid ${active ? T.accent.border : T.border.primary}`,
        borderRadius: T.radius.full,
        cursor: 'pointer',
        fontFamily: T.font.ui,
        transition: 'all 120ms',
      }}
    >
      {children}
    </button>
  );
}

function PreviewKpi({ label, value }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 500,
        color: T.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 22,
        fontWeight: 600,
        color: T.text.primary,
        fontVariantNumeric: 'tabular-nums',
        marginTop: 4,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
    </div>
  );
}

function Label({ children }) {
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 500,
      color: T.text.subtle,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {children}
    </span>
  );
}

/* ─── helpers ──────────────────────────────────────────────────────── */

function summarize(items) {
  return items.reduce((acc, h) => ({
    orders:   acc.orders + 1,
    pallets:  acc.pallets + (h.palletCount || 0),
    articles: acc.articles + (h.articleCount || 0),
    seconds:  acc.seconds + (h.durationSec || 0),
  }), { orders: 0, pallets: 0, articles: 0, seconds: 0 });
}

function isoDate(d) {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek(d) {
  /* ISO week: Monday-based. JS Sunday is 0 → shift back by 6, others
     shift back by (day-1). */
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const out = new Date(d);
  out.setDate(out.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}

function matchPreset({ from, to, todayIso, weekStartIso, monthStartIso }) {
  if (from === '' && to === '') return 'all';
  if (from === todayIso && to === todayIso) return 'today';
  if (from === weekStartIso && to === todayIso) return 'week';
  if (from === monthStartIso && to === todayIso) return 'month';
  return null;
}

function formatHours(sec) {
  if (sec === 0) return '0h';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
