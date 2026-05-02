/* Abschluss — Schritt 04. Auftrag abschließen, archivieren, weiter.
   Design System v3 (siehe DESIGN.md). */

import { useMemo } from 'react';
import { useAppState } from '../state.jsx';
import { pruefenView, palletTimingRows, categoryDistribution } from '../utils/auftragHelpers.js';
import { SIDEBAR_WIDTH } from '../components/Sidebar.jsx';
import {
  Page, Topbar, StepperBar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Badge, Button, Kpi, T,
} from '../components/ui.jsx';

const CAT = {
  THERMO:     { color: '#3B82F6', name: 'Thermorollen' },
  PRODUKTION: { color: '#10B981', name: 'Big Bags / Produktion' },
  HEIPA:      { color: '#06B6D4', name: 'Heipa' },
  VEIT:       { color: '#A855F7', name: 'Veit' },
  TACHO:      { color: '#F97316', name: 'Tachorollen' },
  SONSTIGE:   { color: '#71717A', name: 'Sonstige' },
};

/* ════════════════════════════════════════════════════════════════════════ */
export default function AbschlussScreen() {
  const { current, queue, completeAndAdvance, cancelCurrent } = useAppState();

  const data = useMemo(() => {
    if (!current?.parsed) return null;
    const view = pruefenView(current.parsed);
    const pallets = current.parsed.pallets || [];
    const durationSec = current.startedAt
      ? Math.round((Date.now() - current.startedAt) / 1000)
      : 0;
    return {
      fba:         view.fba,
      destination: view.destination,
      format:      view.format,
      finishedAt:  new Date(),
      stats: {
        durationSec,
        palletCount: view.stats.palletCount,
        articles:    view.stats.articles,
        units:       view.stats.units,
        cartons:     view.stats.cartons,
      },
      palletTimings:        palletTimingRows(pallets, current.palletTimings),
      categoryDistribution: categoryDistribution(pallets),
      queueRemaining:       queue.length,
    };
  }, [current, queue]);

  const onSaveAndNext = () => completeAndAdvance();
  const onExit        = () => cancelCurrent();

  if (!data) {
    return (
      <Page>
        <Topbar crumbs={[{ label: 'Workspace', muted: true }, { label: 'Abschluss' }]} />
        <main style={{ padding: '64px 32px', textAlign: 'center', color: T.text.subtle }}>
          Kein Auftrag im Abschluss.
        </main>
      </Page>
    );
  }

  return (
    <Page>
      <Topbar
        crumbs={[
          { label: 'Workspace', muted: true },
          { label: 'Workflow',  muted: true },
          { label: 'Abschluss' },
        ]}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="mr-pulse" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: T.status.success.main,
                boxShadow: `0 0 0 3px ${T.status.success.main}30`,
              }} />
              <span style={{ fontSize: 12, color: T.text.subtle }}>
                Automatisch gespeichert
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={onExit} title="Schließen (Esc)">
              Schließen
            </Button>
          </span>
        }
      />

      <StepperBar active="abschluss" />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 120px' }}>

        {/* Page intro */}
        <section style={{ marginBottom: 32 }}>
          <Eyebrow>Schritt 04 von 04</Eyebrow>
          <PageH1>Auftrag abgeschlossen</PageH1>
          <Lead>
            {data.stats.articles} Artikel über {data.stats.palletCount} Paletten — fertig in {formatDurationLong(data.stats.durationSec)}.
            Speichere den Auftrag und starte den nächsten oder kehre zur Übersicht zurück.
          </Lead>
        </section>

        {/* Success hero */}
        <SuccessCard data={data} />

        {/* KPI grid */}
        <section style={{ marginTop: 32, marginBottom: 32 }}>
          <SectionHeader title="Bilanz" sub="Was du in diesem Auftrag erledigt hast." />
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
            gap: 12,
          }}>
            <Kpi
              label="Bearbeitungszeit"
              value={formatDurationShort(data.stats.durationSec)}
              sub="reine Arbeitszeit"
              tone="success"
            />
            <Kpi label="Paletten"  value={data.stats.palletCount} sub="erledigt" />
            <Kpi label="Artikel"   value={data.stats.articles}    sub="abgehakt" />
            <Kpi
              label="Einheiten"
              value={data.stats.units.toLocaleString('de-DE')}
              sub={`${data.stats.cartons.toLocaleString('de-DE')} Kartons`}
            />
          </div>
        </section>

        {/* Palettenzeiten + Kategorien */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 12,
        }}>
          <PalletTimings timings={data.palletTimings} totalSec={data.stats.durationSec} />
          <Categories distribution={data.categoryDistribution} />
        </section>

      </main>

      <StickyBar
        queueRemaining={data.queueRemaining}
        onSaveAndNext={onSaveAndNext}
      />
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function SuccessCard({ data }) {
  return (
    <Card style={{
      padding: '24px 28px',
      background: T.status.success.bg,
      borderColor: T.status.success.border,
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 24,
        alignItems: 'center',
      }}>
        <span style={{
          width: 56, height: 56,
          borderRadius: '50%',
          background: T.status.success.main,
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l5 5 9-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: T.status.success.text,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 4,
          }}>
            Erfolgreich abgeschlossen
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: T.font.mono,
              fontSize: 22,
              fontWeight: 500,
              color: T.text.primary,
              letterSpacing: '-0.01em',
            }}>
              {data.fba}
            </span>
            <span style={{ fontSize: 13.5, color: T.status.success.text, opacity: 0.85 }}>
              {data.destination} · {data.format}-Format
            </span>
          </div>
        </div>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 6,
          flexShrink: 0,
        }}>
          <Badge tone="success">Abgeschlossen</Badge>
          <span style={{ fontSize: 11.5, color: T.status.success.text, opacity: 0.8 }}>
            {formatDateLong(data.finishedAt)}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function PalletTimings({ timings, totalSec }) {
  const maxSec = Math.max(...timings.map((t) => t.durSec), 1);
  const avgSec = timings.length ? Math.round(totalSec / timings.length) : 0;
  return (
    <Card style={{ padding: '20px 24px' }}>
      <SectionHeader
        title="Palettenzeiten"
        sub={`Wie lange jede Palette gedauert hat. Durchschnitt: ${formatDurationShort(avgSec)} pro Palette.`}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {timings.map((t, i) => {
          const pct = maxSec > 0 ? t.durSec / maxSec : 0;
          const color = (CAT[t.category] || CAT.SONSTIGE).color;
          return (
            <div key={t.id} style={{
              display: 'grid',
              gridTemplateColumns: '24px 80px 1fr 64px',
              gap: 12,
              alignItems: 'center',
            }}>
              <span style={{
                fontSize: 11.5,
                color: T.text.faint,
                fontVariantNumeric: 'tabular-nums',
                textAlign: 'right',
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{
                fontFamily: T.font.mono,
                fontSize: 13,
                fontWeight: 500,
                color: T.text.primary,
              }}>
                {t.id}
              </span>
              <div style={{
                position: 'relative',
                height: 8,
                background: T.bg.surface3,
                borderRadius: T.radius.full,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct * 100}%`,
                  height: '100%',
                  background: color,
                  transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
                  transitionDelay: `${i * 60}ms`,
                }} />
              </div>
              <span style={{
                fontFamily: T.font.mono,
                fontSize: 13,
                fontWeight: 500,
                color: T.text.primary,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {formatMmSs(t.durSec)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function Categories({ distribution }) {
  const total = distribution.reduce((s, d) => s + d.units, 0);
  return (
    <Card style={{ padding: '20px 24px' }}>
      <SectionHeader
        title="Kategorien"
        sub={`${total.toLocaleString('de-DE')} Einheiten verteilt auf ${distribution.length} Kategorien.`}
      />

      {/* Stacked bar */}
      <div style={{
        display: 'flex',
        height: 14,
        background: T.bg.surface3,
        borderRadius: T.radius.full,
        overflow: 'hidden',
        marginTop: 4,
        marginBottom: 12,
      }}>
        {distribution.map((d, i) => {
          const color = (CAT[d.cat] || CAT.SONSTIGE).color;
          return (
            <div
              key={d.cat}
              title={`${d.cat}: ${d.units.toLocaleString('de-DE')} (${Math.round(d.pct * 100)}%)`}
              style={{
                width: `${d.pct * 100}%`,
                background: color,
                borderRight: i < distribution.length - 1 ? `2px solid ${T.bg.surface}` : 'none',
                transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        {distribution.map((d) => {
          const meta = CAT[d.cat] || CAT.SONSTIGE;
          return (
            <div key={d.cat} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              background: T.bg.surface2,
              border: `1px solid ${T.border.primary}`,
              borderRadius: T.radius.md,
            }}>
              <span style={{
                width: 8, height: 8,
                background: meta.color,
                borderRadius: 2,
                flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: T.text.primary,
                }}>
                  {meta.name}
                </div>
                <div style={{ fontSize: 11, color: T.text.subtle, marginTop: 1 }}>
                  {d.cat}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: T.text.primary,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {d.units.toLocaleString('de-DE')}
                </div>
                <div style={{
                  fontSize: 11,
                  color: meta.color,
                  fontWeight: 600,
                  marginTop: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {Math.round(d.pct * 100)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function StickyBar({ queueRemaining, onSaveAndNext }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      padding: '14px 32px',
      background: 'rgba(255, 255, 255, 0.92)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: `1px solid ${T.border.primary}`,
      display: 'flex',
      marginLeft: 'var(--sidebar-width)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        maxWidth: 1180,
        margin: '0 auto',
        width: '100%',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="mr-pulse" style={{
            width: 8, height: 8, borderRadius: '50%',
            background: T.status.success.main,
            boxShadow: `0 0 0 4px ${T.status.success.main}30`,
          }} />
          <span style={{ fontSize: 13, color: T.text.secondary, fontWeight: 500 }}>
            In Historie gespeichert
          </span>
        </span>
        <span style={{ flex: 1 }} />
        {queueRemaining > 0 && (
          <span style={{ fontSize: 12.5, color: T.text.subtle }}>
            <span style={{ color: T.accent.main, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {queueRemaining}
            </span>{' '}
            {queueRemaining === 1 ? 'weiterer Auftrag' : 'weitere Aufträge'} in der Warteschlange
          </span>
        )}
        <Button variant="primary" onClick={onSaveAndNext}>
          {queueRemaining > 0 ? 'Nächster Auftrag' : 'Zum Workspace'}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────────────── */
function formatMmSs(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
function formatDurationShort(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function formatDurationLong(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}
function formatDateLong(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} · ${h}:${m}`;
}
