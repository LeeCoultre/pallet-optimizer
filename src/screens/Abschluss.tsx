/* Abschluss — Schritt 04. Auftrag-Bilanz mit drei kopierbaren Schlüsselzahlen.

   Visual ethos shared with Upload + Pruefen + Focus:
     • Topbar (breadcrumb + status pulse + Schließen)
     • StepperBar at top with active=abschluss
     • main maxWidth 1180, padding 40 32 120, gap 32
     • Plain bordered cards (T.bg.surface, 1px hairline, soft shadow)
     • Subtle accent halo on the hero card

   Hero exposes the three facts the worker needs after wrap-up:
     1. FBA-Code        — paste into shipping system / driver paperwork
     2. Gewicht gesamt  — paste onto the load list
     3. Summe (EUR)     — invoicing / accounting
   All three are click-to-copy with a subtle "Kopiert" flash. Below
   the hero, an Aufschlüsselung breakdown explains where the sum
   comes from (per-level: count × price/Pal).

   Pricing model (from the warehouse clipboard):
     • L1 Thermorollen / L6 Tachorollen → 1.500 EUR / Pal (Rollen)
     • All other levels                  →   500 EUR / Pal
*/

import React, { useMemo, useState } from 'react';
import { useAppState } from '../state.jsx';
import {
  pruefenView, palletTimingRows, levelDistribution,
  primaryLevel, itemTotalWeightKg, LEVEL_META,
} from '../utils/auftragHelpers.js';
import {
  Page, Topbar, StepperBar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Badge, Button, Kpi, T,
} from '../components/ui.jsx';

/* Per-pallet pricing by primary level (mirrors the warehouse clipboard).
   Tacho-Rollen (L6) are also "Rollen" — same rate as Thermo. */
const PRICE_BY_LEVEL = {
  1: 1500, // Thermorollen
  2: 500,  // Produktion
  3: 500,  // Heipa
  4: 500,  // Veit
  5: 500,  // Kernöl
  6: 1500, // Tachorollen
};

/* ════════════════════════════════════════════════════════════════════════ */
export default function AbschlussScreen() {
  const { current, queue, completeAndAdvance, cancelCurrent, goToStep } = useAppState();

  const data = useMemo(() => {
    if (!current?.parsed) return null;
    const view = pruefenView(current.parsed);
    const pallets = current.parsed.pallets || [];
    const durationSec = current.startedAt
      ? Math.round((Date.now() - current.startedAt) / 1000)
      : 0;
    const bilanz = computeBilanz(pallets);
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
      bilanz,
      palletTimings:     palletTimingRows(pallets, current.palletTimings),
      levelDistribution: levelDistribution(pallets),
      queueRemaining:    queue.length,
    };
  }, [current, queue]);

  const onSaveAndNext = () => completeAndAdvance();
  const onExit        = () => cancelCurrent();

  if (!data) {
    return (
      <Page>
        <Topbar crumbs={[{ label: 'Abschluss' }]} />
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
          { label: 'Prüfen', muted: true,
            onClick: () => goToStep('pruefen'),
            title: 'Zurück zu Prüfen' },
          { label: 'Focus', muted: true,
            onClick: () => goToStep('focus'),
            title: 'Zurück zu Focus' },
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
            <Button variant="ghost" size="sm" onClick={onExit} title="Schließen">
              Schließen
            </Button>
          </span>
        }
      />

      <StepperBar active="abschluss" />

      <main style={{
        maxWidth: 1180,
        margin: '0 auto',
        padding: '40px 32px 140px',
        display: 'flex',
        flexDirection: 'column',
        gap: 32,
      }}>
        {/* Intro */}
        <section>
          <Eyebrow>Schritt 04 von 04</Eyebrow>
          <PageH1>Auftrag abgeschlossen</PageH1>
          <Lead>
            {data.stats.articles} Artikel über {data.stats.palletCount} Paletten —
            fertig in {formatDurationLong(data.stats.durationSec)}.
            Die drei wichtigsten Werte stehen unten zum Kopieren bereit.
          </Lead>
        </section>

        {/* HERO — FBA + Weight + Sum (all copyable) */}
        <HeroCard data={data} />

        {/* Per-level breakdown */}
        <Aufschluesselung bilanz={data.bilanz} />

        {/* KPI bilanz */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

        {/* Palette timings + level distribution */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 12,
        }}>
          <PalletTimings timings={data.palletTimings} totalSec={data.stats.durationSec} />
          <Levels distribution={data.levelDistribution} />
        </section>
      </main>

      <StickyBar
        queueRemaining={data.queueRemaining}
        onSaveAndNext={onSaveAndNext}
      />
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   HERO CARD — FBA + Weight + Sum.
   Mirrors HeroFBA from Pruefen: subtle accent halo, bordered card,
   two-region body separated by a hairline. Each big value is a
   <CopyableValue> that flashes "Kopiert" on click.
   ════════════════════════════════════════════════════════════════════════ */
function HeroCard({ data }) {
  const { fba, destination, format, finishedAt, stats, bilanz } = data;

  return (
    <div style={{
      position: 'relative',
      padding: '28px 32px',
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: 20,
      boxShadow: '0 1px 3px rgba(17,24,39,0.03), 0 16px 40px -22px rgba(17,24,39,0.08)',
      overflow: 'hidden',
    }}>
      {/* Soft success halo top-right */}
      <div aria-hidden style={{
        position: 'absolute',
        top: -100, right: -100,
        width: 260, height: 260,
        background: `radial-gradient(circle, ${T.status.success.main}10 0%, transparent 65%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        {/* Top row: status badge + finishedAt timestamp */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 18,
        }}>
          <Badge tone="success">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2.2"
                      strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Erfolgreich abgeschlossen
            </span>
          </Badge>
          <span style={{ flex: 1 }} />
          <span style={{
            fontSize: 12,
            color: T.text.subtle,
            fontFamily: T.font.mono,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: '0.02em',
          }}>
            {formatDateLong(finishedAt)}
          </span>
        </div>

        {/* Identity row — FBA-Code (primary) + Ziel-Code (peer, copyable).
            Both sit on the same row above the hairline, before the
            Weight/Sum block. Grid 1.5fr/1fr so FBA dominates while RLG1
            still has its own copy zone. */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: destination ? '1.5fr 1fr' : '1fr',
          gap: 28,
          alignItems: 'flex-start',
        }}>
          <CopyableValue
            label="FBA-Code"
            value={fba}
            variant="primary"
            mono
          />
          {destination && (
            <CopyableValue
              label="Ziel-Code"
              value={destination}
              variant="primary"
              mono
            />
          )}
        </div>

        {/* Meta line — Format + Pal/Art + duration. Destination is now
            its own copyable block above, so we drop it from this caption. */}
        <div style={{
          marginTop: 10,
          fontSize: 12.5,
          color: T.text.subtle,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
        }}>
          {format && (
            <span>{format}-Format</span>
          )}
          {format && <Bullet />}
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>
            {stats.palletCount} Pal · {stats.articles} Art
          </span>
          <Bullet />
          <span style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
            {formatDurationShort(stats.durationSec)}
          </span>
        </div>

        {/* Hairline divider */}
        <div style={{
          margin: '24px 0',
          height: 1,
          background: T.border.primary,
        }} />

        {/* Two big copyable secondary values: Weight + Sum */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1px 1fr',
          gap: 28,
          alignItems: 'stretch',
        }}>
          <CopyableValue
            label="Gewicht gesamt"
            value={formatKg(bilanz.totalWeight)}
            rawValue={String(Math.round(bilanz.totalWeight))}
            sublabel={`→ ${(bilanz.totalWeight / 1000).toFixed(2).replace('.', ',')} t`}
            mono
          />
          <span style={{ background: T.border.primary, alignSelf: 'stretch' }} />
          <CopyableValue
            label="Summe"
            value={formatEur(bilanz.totalSum)}
            rawValue={String(bilanz.totalSum)}
            sublabel={describeMix(bilanz.breakdown)}
            mono
          />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   AUFSCHLÜSSELUNG — per-level breakdown table.
   Each row: level chip · count · "× rate" · subtotal · weight.
   Footer: total row in bold.
   ════════════════════════════════════════════════════════════════════════ */
function Aufschluesselung({ bilanz }) {
  if (!bilanz.breakdown.length) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHeader
        title="Aufschlüsselung pro Level"
        sub="Wie sich die Summe und das Gesamtgewicht aus den Paletten zusammensetzen."
      />
      <Card style={{ padding: '20px 24px' }}>
        {/* Header row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1.5fr) 70px 110px 130px 110px',
          gap: 12,
          padding: '0 0 8px 0',
          borderBottom: `1px solid ${T.border.primary}`,
          fontSize: 10.5,
          fontFamily: T.font.mono,
          fontWeight: 600,
          color: T.text.subtle,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          <span>Level</span>
          <span style={{ textAlign: 'right' }}>Paletten</span>
          <span style={{ textAlign: 'right' }}>Pro Pal</span>
          <span style={{ textAlign: 'right' }}>Subtotal</span>
          <span style={{ textAlign: 'right' }}>Gewicht</span>
        </div>

        {/* Body rows */}
        {bilanz.breakdown.map((row) => (
          <BreakdownRow key={row.level} row={row} />
        ))}

        {/* Total row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 1.5fr) 70px 110px 130px 110px',
          gap: 12,
          padding: '14px 0 0 0',
          marginTop: 4,
          borderTop: `1px solid ${T.border.primary}`,
          alignItems: 'baseline',
        }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: T.text.primary,
            fontFamily: T.font.ui,
            letterSpacing: '-0.005em',
          }}>
            Summe
          </span>
          <span style={{ ...numCell, fontWeight: 600 }}>
            {bilanz.totalCount}
          </span>
          <span style={{ ...numCell, color: T.text.faint }}>—</span>
          <span style={{
            ...numCell,
            fontFamily: T.font.mono,
            fontSize: 16,
            fontWeight: 700,
            color: T.text.primary,
            letterSpacing: '-0.012em',
          }}>
            {formatEur(bilanz.totalSum)}
          </span>
          <span style={{
            ...numCell,
            fontFamily: T.font.mono,
            fontSize: 14,
            fontWeight: 600,
            color: T.text.primary,
          }}>
            {formatKg(bilanz.totalWeight)}
          </span>
        </div>
      </Card>
    </section>
  );
}

const numCell: React.CSSProperties = {
  textAlign: 'right',
  fontFamily: T.font.mono,
  fontSize: 13,
  color: T.text.primary,
  fontVariantNumeric: 'tabular-nums',
};

function BreakdownRow({ row }: { row: any }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(180px, 1.5fr) 70px 110px 130px 110px',
      gap: 12,
      padding: '12px 0',
      borderBottom: `1px solid ${T.border.subtle}`,
      alignItems: 'center',
    }}>
      <LevelLabel level={row.level} meta={row.meta} />
      <span style={{ ...numCell, fontWeight: 600 }}>
        {row.count}
      </span>
      <span style={{ ...numCell, color: T.text.subtle }}>
        × {formatEur(row.pricePerPallet)}
      </span>
      <span style={{
        ...numCell,
        fontSize: 14.5,
        fontWeight: 600,
        color: T.text.primary,
        letterSpacing: '-0.008em',
      }}>
        {formatEur(row.sum)}
      </span>
      <span style={{ ...numCell, color: T.text.subtle }}>
        {formatKg(row.weight)}
      </span>
    </div>
  );
}

function LevelLabel({ level, meta }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22, height: 22,
        background: meta.color,
        borderRadius: 5,
        color: '#fff',
        fontSize: 10.5,
        fontWeight: 700,
        fontFamily: T.font.mono,
      }}>
        L{level}
      </span>
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: T.text.primary,
        letterSpacing: '-0.005em',
      }}>
        {meta.name}
      </span>
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   COPYABLE VALUE — big mono text, click to copy, brief flash on success.
   ════════════════════════════════════════════════════════════════════════ */
function CopyableValue({ label, value, rawValue, sublabel, variant, mono }: any) {
  const [copied, setCopied] = useState(false);
  const isPrimary = variant === 'primary';
  const handleCopy = (e) => {
    e.stopPropagation();
    copyToClipboard(rawValue ?? String(value));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { handleCopy(e); e.currentTarget.blur(); }}
      title="Klick zum Kopieren"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isPrimary ? 6 : 8,
        padding: '8px 10px',
        margin: '-8px -10px',
        background: copied ? T.status.success.bg : 'transparent',
        border: `1.5px solid ${copied ? T.status.success.main : 'transparent'}`,
        borderRadius: 12,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: T.font.ui,
        transition: 'background 220ms ease, border-color 220ms ease',
      }}
    >
      {/* Label row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          fontSize: 10.5,
          fontWeight: 600,
          fontFamily: T.font.mono,
          color: copied ? T.status.success.text : T.text.subtle,
          textTransform: 'uppercase',
          letterSpacing: '0.16em',
        }}>
          {label}
        </span>
        <span style={{ flex: 1 }} />
        {copied ? (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10.5,
            fontFamily: T.font.mono,
            fontWeight: 600,
            color: T.status.success.text,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
          }}>
            <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Kopiert
          </span>
        ) : (
          <span style={{
            fontSize: 10.5,
            fontFamily: T.font.mono,
            color: T.text.faint,
            letterSpacing: '0.04em',
          }}>
            klick zum Kopieren
          </span>
        )}
      </div>

      {/* Value */}
      <div style={{
        fontFamily: mono ? T.font.mono : T.font.ui,
        fontSize: isPrimary
          ? 'clamp(28px, 3.8vw, 44px)'
          : 'clamp(24px, 3vw, 34px)',
        fontWeight: isPrimary ? 500 : 600,
        color: copied ? T.status.success.text : T.text.primary,
        letterSpacing: isPrimary ? '-0.025em' : '-0.018em',
        lineHeight: 1.05,
        wordBreak: 'break-word',
        transition: 'color 200ms ease',
      }}>
        {value}
      </div>

      {/* Sublabel */}
      {sublabel && (
        <div style={{
          fontSize: 12,
          fontFamily: T.font.mono,
          color: T.text.subtle,
          letterSpacing: '0.01em',
        }}>
          {sublabel}
        </div>
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   PALLET TIMINGS — kept from previous design.
   ════════════════════════════════════════════════════════════════════════ */
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
          const color = (LEVEL_META[t.level] || LEVEL_META[1]).color;
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

/* ════════════════════════════════════════════════════════════════════════
   LEVELS — kept from previous design.
   ════════════════════════════════════════════════════════════════════════ */
function Levels({ distribution }) {
  const total = distribution.reduce((s, d) => s + d.units, 0);
  return (
    <Card style={{ padding: '20px 24px' }}>
      <SectionHeader
        title="Levels"
        sub={`${total.toLocaleString('de-DE')} Einheiten auf ${distribution.length} ${distribution.length === 1 ? 'Level' : 'Levels'}.`}
      />

      <div style={{
        display: 'flex',
        height: 14,
        background: T.bg.surface3,
        borderRadius: T.radius.full,
        overflow: 'hidden',
        marginTop: 4,
        marginBottom: 12,
      }}>
        {distribution.map((d, i) => (
          <div
            key={d.level}
            title={`L${d.level} ${d.meta.name}: ${d.units.toLocaleString('de-DE')} (${Math.round(d.pct * 100)}%)`}
            style={{
              width: `${d.pct * 100}%`,
              background: d.meta.color,
              borderRight: i < distribution.length - 1 ? `2px solid ${T.bg.surface}` : 'none',
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {distribution.map((d) => (
          <div key={d.level} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: T.bg.surface2,
            border: `1px solid ${T.border.primary}`,
            borderRadius: T.radius.md,
          }}>
            <span style={{
              width: 22, height: 22,
              background: d.meta.color,
              borderRadius: T.radius.sm,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {d.level}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: T.text.primary,
              }}>
                {d.meta.name}
              </div>
              <div style={{ fontSize: 11, color: T.text.subtle, marginTop: 1 }}>
                Level {d.level}
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
                color: d.meta.color,
                fontWeight: 600,
                marginTop: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {Math.round(d.pct * 100)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   STICKY BAR
   ════════════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════════════════ */

/* computeBilanz — sum + weight + per-level breakdown.
   Each pallet's primary level (most-items winner) → fixed price/Pal
   from PRICE_BY_LEVEL. Weight is the actual sum of itemTotalWeightKg
   for every item on the pallet (real, not the clipboard's 700kg
   shorthand). */
function computeBilanz(pallets) {
  const buckets = {};   // level → { count, sum, weight, meta, pricePerPallet }
  let totalSum = 0;
  let totalWeight = 0;
  let totalCount = 0;

  for (const p of pallets) {
    const lvl = primaryLevel(p.items) || 1;
    const meta = LEVEL_META[lvl] || LEVEL_META[1];
    const price = PRICE_BY_LEVEL[lvl] ?? 500;
    const weight = (p.items || []).reduce(
      (s, it) => s + (itemTotalWeightKg(it) || 0), 0,
    );

    if (!buckets[lvl]) {
      buckets[lvl] = {
        level: lvl, meta, count: 0, sum: 0, weight: 0,
        pricePerPallet: price,
      };
    }
    buckets[lvl].count += 1;
    buckets[lvl].sum += price;
    buckets[lvl].weight += weight;

    totalSum += price;
    totalWeight += weight;
    totalCount += 1;
  }

  const breakdown = (Object.values(buckets) as any[]).sort((a: any, b: any) => a.level - b.level);
  return { totalSum, totalWeight, totalCount, breakdown };
}

function describeMix(breakdown) {
  if (!breakdown.length) return '';
  return breakdown
    .map((b) => `${b.count}× ${b.meta.shortName || b.meta.name}`)
    .join(' · ');
}

function formatEur(amount) {
  const n = Math.round(amount);
  return `${n.toLocaleString('de-DE')} EUR`;
}

function formatKg(kg) {
  const n = Math.round(kg);
  return `${n.toLocaleString('de-DE')} kg`;
}

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

function Bullet() {
  return (
    <span style={{
      width: 3, height: 3, borderRadius: '50%',
      background: 'rgba(15, 23, 42, 0.20)',
    }} />
  );
}

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    /* ignore */
  }
}