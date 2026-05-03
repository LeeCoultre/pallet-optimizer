/* Pruefen — Schritt 02. Daten kontrollieren.
   Design System v3 (siehe DESIGN.md).

   v2 — SOP v1.1: 6-level hierarchy, PalletStackViz, OVERLOAD flags. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../state.jsx';
import {
  pruefenView, distributeEinzelneSku, enrichItemDims,
  levelDistribution, sortItemsForPallet, formatItemTitle, LEVEL_META,
} from '../utils/auftragHelpers.js';
import { lookupSkuDimensions } from '../marathonApi.js';
import {
  Page, Topbar, StepperBar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Label, Badge, Button, Meta, Kpi, ValidationBanner,
  T,
} from '../components/ui.jsx';
import PalletStackViz from '../components/PalletStackViz.jsx';

/* ════════════════════════════════════════════════════════════════════════ */
export default function PruefenScreen() {
  const { current, goToStep, cancelCurrent } = useAppState();
  const rawPallets = current?.parsed?.pallets || [];
  const eskuItems  = current?.parsed?.einzelneSkuItems || [];

  // Async dim/weight enrichment (cached forever per Auftrag — these don't change)
  const allItems = useMemo(() => [
    ...rawPallets.flatMap((p) => p.items || []),
    ...eskuItems,
  ], [rawPallets, eskuItems]);

  const dimsQ = useQuery({
    queryKey: ['sku-dims', current?.id],
    queryFn: () => enrichItemDims(allItems, lookupSkuDimensions),
    enabled: !!current?.id && allItems.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Build pallets/esku with enriched items overlaid by POSITION, not by
  // FNSKU. The same FNSKU can appear on multiple pallets with different
  // `units` / `useItem` / etc. — keying enrichment by FNSKU caused one
  // pallet's row to silently overwrite the other's quantity (the
  // FBA15LKWFFTR bug where X0011CI9FH on P1-B2 inherited the units
  // value from P1-B1). enrichItemDims preserves input order, so we walk
  // the same sequence we passed in (allItems = pallets flat → ESKU).
  const enrichedPallets = useMemo(() => {
    const enriched = dimsQ.data || null;
    let cursor = 0;
    const base = rawPallets.map((p) => ({
      ...p,
      items: (p.items || []).map((origIt) => {
        const fromDims = enriched ? enriched[cursor] : null;
        cursor += 1;
        return fromDims || origIt;
      }),
    }));
    return base.map((p) => ({ ...p, items: sortItemsForPallet(p.items || []) }));
  }, [rawPallets, dimsQ.data]);

  const enrichedEsku = useMemo(() => {
    if (!dimsQ.data) return eskuItems;
    const palletItemsCount = rawPallets.reduce((n, p) => n + (p.items?.length || 0), 0);
    return eskuItems.map((it, i) => dimsQ.data[palletItemsCount + i] || it);
  }, [eskuItems, rawPallets, dimsQ.data]);

  const view = useMemo(() => pruefenView({ ...current?.parsed, pallets: enrichedPallets }), [current?.parsed, enrichedPallets]);
  const distribution = useMemo(
    () => distributeEinzelneSku(enrichedPallets, enrichedEsku),
    [enrichedPallets, enrichedEsku],
  );
  const eskuDist = distribution.byPalletId;
  const palletStates = distribution.palletStates;

  const validation = current?.validation || { ok: true, errorCount: 0, warningCount: 0 };
  const validView = {
    ok: validation.ok ?? (validation.errorCount === 0),
    errors: validation.errorCount || 0,
    warnings: validation.warningCount || 0,
  };
  const onStartFocus = () => {
    if (validView.errors === 0) goToStep('focus');
  };

  const [expandedId, setExpandedId] = useState(null);

  if (!view) {
    return (
      <Page>
        <Topbar crumbs={[{ label: 'Workspace', muted: true }, { label: 'Auftrag prüfen' }]} />
        <main style={{ padding: '64px 32px', textAlign: 'center', color: T.text.subtle }}>
          Kein Auftrag geladen.
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
          { label: 'Auftrag prüfen' },
        ]}
        right={
          <Button variant="ghost" size="sm" onClick={cancelCurrent} title="Auftrag abbrechen, zurück zur Warteschlange">
            Verlassen
          </Button>
        }
      />

      <StepperBar active="pruefen" />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 120px' }}>

        {/* Page intro */}
        <section style={{ marginBottom: 32 }}>
          <Eyebrow>Schritt 02 von 04</Eyebrow>
          <PageH1>Auftrag prüfen</PageH1>
          <Lead>
            Hier siehst du den kompletten Überblick deines Lagerauftrags.
            Stimmen die Zahlen und die Validierung, kannst du mit dem Focus-Modus beginnen.
          </Lead>
        </section>

        {/* Identity card */}
        <IdentityCard view={view} />

        {/* Validation banner */}
        <div style={{ marginTop: 16, marginBottom: 32 }}>
          <ValidationBanner
            tone={validView.ok ? 'success' : (validView.errors > 0 ? 'warn' : 'warn')}
            title={validView.ok ? 'Alles in Ordnung' : 'Mit Auffälligkeiten'}
            sub={validView.ok
              ? `Alle ${view.stats.palletCount} Paletten und ${view.stats.articles} Artikel wurden ohne Fehler geparst.`
              : `${validView.errors} Fehler · ${validView.warnings} Warnungen festgestellt.`}
            action={<Badge tone={validView.ok ? 'success' : 'warn'}>{validView.ok ? 'Validiert' : 'Prüfen'}</Badge>}
          />
        </div>

        {/* OVERLOAD / NO_VALID_PLACEMENT escalation banner */}
        {(distribution.overloadCount > 0 || distribution.noValidCount > 0) && (
          <div style={{ marginBottom: 32 }}>
            <ValidationBanner
              tone={distribution.noValidCount > 0 ? 'warn' : 'warn'}
              title={
                distribution.noValidCount > 0
                  ? `🚨 ${distribution.noValidCount} ESKU-Karton(s) ohne gültige Platzierung`
                  : `⚠ ${distribution.overloadCount} OVERLOAD-Flag(s) gesetzt`
              }
              sub={
                distribution.noValidCount > 0
                  ? 'Hard-Constraints H1-H7 verletzt — Bridge-Eskalation erforderlich.'
                  : 'Soft-Limits 700 kg / 1.59 m³ überschritten — Bridge informieren.'
              }
              action={<Badge tone="warn">Eskalation</Badge>}
            />
          </div>
        )}

        {/* KPI grid */}
        <section style={{ marginBottom: 32 }}>
          <SectionHeader title="Übersicht" sub="Wichtige Kennzahlen auf einen Blick." />
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
          }}>
            <Kpi label="Paletten" value={view.stats.palletCount} sub="physisch" />
            <Kpi label="Artikel" value={view.stats.articles} sub="verschieden" />
            <Kpi label="Kartons" value={view.stats.cartons.toLocaleString('de-DE')} sub="gesamt" />
            <Kpi label="Gewicht"
                 value={view.stats.weightKg.toLocaleString('de-DE')}
                 sub="kg geschätzt" />
            <Kpi label="Geschätzte Dauer"
                 value={formatDur(view.stats.durationSec)}
                 sub="bis Abschluss" />
          </div>
        </section>

        {/* Auslastung + Levels */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
          gap: 12,
          marginBottom: 32,
        }}>
          <AuslastungCard pct={view.stats.fillPct} />
          <LevelsCard pallets={enrichedPallets} />
        </section>

        {/* Validation checklist */}
        <section style={{ marginBottom: 32 }}>
          <SectionHeader
            title="Prüfungen"
            sub="Vier automatische Prüfungen wurden ausgeführt."
          />
          <Card style={{ padding: '20px 24px' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '12px 32px',
            }}>
              <CheckRow ok label="Format erkannt"      detail="Standard- oder Schilder-Layout" />
              <CheckRow ok label="Paletten konsistent" detail="Alle IDs eindeutig zugeordnet" />
              <CheckRow ok label="Codes vorhanden"     detail="FNSKU/SKU für jeden Artikel" />
              <CheckRow ok label="Mengen plausibel"    detail="Einheiten innerhalb des Erwarteten" />
            </div>
          </Card>
        </section>

        {/* Pallets table — with PalletStackViz */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader
            title={`Paletten (${view.pallets.length})`}
            sub={
              eskuItems.length > 0
                ? `Stack-Pyramide zeigt die physische Ladung pro Palette (Level 1 unten → 6 oben). Klick öffnet Details inkl. ${eskuItems.length} verteilte ESKU-Kartons.`
                : 'Stack-Pyramide zeigt die physische Ladung pro Palette (Level 1 unten → 6 oben). Klick öffnet Artikel-Liste.'
            }
          />
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={tableHeader}>
              <span style={{ width: 40 }}>#</span>
              <span style={{ flex: '0 0 90px' }}>Pallet-ID</span>
              <span style={{ flex: '0 0 70px' }}>Stack</span>
              <span style={{ flex: '0 0 100px' }}>Top-Level</span>
              <span style={{ flex: '0 0 80px' }}>Artikel</span>
              <span style={{ flex: '0 0 90px' }}>Einheiten</span>
              <span style={{ flex: 1 }}>Formate</span>
              <span style={{ flex: '0 0 24px' }} />
            </div>
            {view.pallets.map((p, i) => {
              const raw = enrichedPallets.find((r) => r.id === p.id);
              const eskuAssigned = sortItemsForPallet(eskuDist[p.id] || []);
              const palletState = palletStates[p.id];
              return (
                <PalletRow
                  key={p.id}
                  pallet={p}
                  index={i}
                  items={raw?.items || []}
                  eskuAssigned={eskuAssigned}
                  palletState={palletState}
                  isExpanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  isLast={i === view.pallets.length - 1}
                />
              );
            })}
          </Card>
        </section>

      </main>

      {/* Sticky action bar */}
      <StickyBar
        validated={validView.ok}
        stats={view.stats}
        overloadCount={distribution.overloadCount}
        noValidCount={distribution.noValidCount}
        onStartFocus={onStartFocus}
      />
    </Page>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function IdentityCard({ view }) {
  return (
    <Card style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Label>Auftrag-Nummer (FBA)</Label>
        <Badge tone="success">Erkannt</Badge>
      </div>
      <div style={{
        fontFamily: T.font.mono,
        fontSize: 32,
        fontWeight: 500,
        color: T.text.primary,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
        wordBreak: 'break-all',
      }}>
        {view.fba}
      </div>
      <div style={{
        marginTop: 20,
        paddingTop: 18,
        borderTop: `1px solid ${T.border.primary}`,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, auto) 1fr',
        gap: 32,
        alignItems: 'flex-start',
      }}>
        <Meta label="Ziellager"   value={view.destination} mono />
        <Meta label="Format"      value={`${view.format}-Format`} />
        <Meta label="Erstellt am" value={view.createdDate ? `${view.createdDate} · ${view.createdTime}` : '—'} mono />
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function AuslastungCard({ pct }) {
  const animated = useAnimatedNumber(pct, 1100);
  const value = Math.round(animated * 100);
  const stroke = 12;
  const radius = 56;
  const circ = 2 * Math.PI * radius;
  const dash = animated * circ;

  const color = pct > 1 ? T.status.danger.main
    : pct >= 0.92 ? T.status.warn.main
    : T.accent.main;
  const tone = pct > 1 ? 'danger' : pct >= 0.92 ? 'warn' : 'accent';

  return (
    <Card style={{ padding: '20px 24px' }}>
      <SectionHeader
        title="Auslastung"
        sub="Volumen relativ zur EU-Palette."
        right={<Badge tone={tone}>
          {pct > 1 ? 'Überfüllt' : pct >= 0.92 ? 'Knapp' : pct >= 0.5 ? 'Optimal' : 'Niedrig'}
        </Badge>}
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '160px 1fr',
        gap: 24,
        alignItems: 'center',
        marginTop: 8,
      }}>
        <div style={{ position: 'relative', width: 160, height: 160 }}>
          <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="80" cy="80" r={radius} stroke={T.bg.surface3} strokeWidth={stroke} fill="none" />
            <circle
              cx="80" cy="80" r={radius}
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ - dash}`}
              fill="none"
              style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              fontSize: 32,
              fontWeight: 600,
              color: T.text.primary,
              letterSpacing: '-0.025em',
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {value}<span style={{ fontSize: 18, color: T.text.subtle, marginLeft: 1 }}>%</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Meta label="Ø Volumen / Palette" value={`${(pct * 1.59).toFixed(2)} m³`} mono />
          <Meta label="Soft-Limit"          value="1,59 m³" mono />
          <Meta label="Gewicht-Limit"       value="700 kg (soft)" mono />
        </div>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function LevelsCard({ pallets }) {
  const distribution = useMemo(() => levelDistribution(pallets), [pallets]);
  const grand = distribution.reduce((s, d) => s + d.units, 0);

  return (
    <Card style={{ padding: '20px 24px' }}>
      <SectionHeader
        title="Levels"
        sub={`Verteilung über ${grand.toLocaleString('de-DE')} Einheiten · Stapelreihenfolge unten → oben.`}
      />

      {/* Stacked bar */}
      <div style={{
        display: 'flex',
        height: 14,
        background: T.bg.surface3,
        borderRadius: T.radius.full,
        overflow: 'hidden',
        marginTop: 4,
        marginBottom: 16,
      }}>
        {distribution.map((s, i) => (
          <div
            key={s.level}
            title={`L${s.level} ${s.meta.name}: ${s.units.toLocaleString('de-DE')} (${Math.round(s.pct * 100)}%)`}
            style={{
              width: `${s.pct * 100}%`,
              background: s.meta.color,
              borderRight: i < distribution.length - 1 ? `2px solid ${T.bg.surface}` : 'none',
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        ))}
      </div>

      {/* Legend — 2 columns of pills */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
      }}>
        {distribution.map((s) => (
          <div key={s.level} style={{
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
              background: s.meta.color,
              borderRadius: T.radius.sm,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {s.level}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: T.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {s.meta.name}
              </div>
              <div style={{ fontSize: 11, color: T.text.subtle, marginTop: 1 }}>
                Level {s.level}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: T.text.primary,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {s.units.toLocaleString('de-DE')}
              </div>
              <div style={{
                fontSize: 11,
                color: s.meta.color,
                fontWeight: 600,
                marginTop: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {Math.round(s.pct * 100)}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function CheckRow({ ok, label, detail }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
    }}>
      <span style={{
        width: 18, height: 18,
        borderRadius: '50%',
        background: ok ? T.status.success.bg : T.bg.surface3,
        color: ok ? T.status.success.main : T.text.faint,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginTop: 1,
      }}>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.5l2 2 5-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: T.text.primary }}>
          {label}
        </div>
        {detail && (
          <div style={{ fontSize: 12, color: T.text.subtle, marginTop: 1 }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function PalletRow({ pallet, index, items, eskuAssigned, palletState, isExpanded, onToggle, isLast }) {
  const meta = LEVEL_META[pallet.level] || LEVEL_META[1];
  return (
    <>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 20px',
          borderBottom: !isLast && !isExpanded ? `1px solid ${T.border.subtle}` : 'none',
          background: isExpanded ? T.bg.surface2 : T.bg.surface,
          cursor: 'pointer',
          transition: 'background 150ms',
          gap: 0,
        }}
        onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = T.bg.surface2; }}
        onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = T.bg.surface; }}
      >
        <span style={{ width: 40, fontSize: 12, color: T.text.faint, fontVariantNumeric: 'tabular-nums' }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <span style={{
          flex: '0 0 90px',
          fontFamily: T.font.mono,
          fontSize: 13,
          fontWeight: 500,
          color: T.text.primary,
        }}>
          {pallet.id}
        </span>

        {/* Mini stack-pyramid */}
        <span style={{ flex: '0 0 70px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <PalletStackViz palletState={palletState} size="row" />
        </span>

        {/* Top-level badge */}
        <span style={{ flex: '0 0 100px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge color={meta.color} bg={meta.bg} text={meta.text}>
            L{pallet.level} {meta.shortName}
          </Badge>
          {pallet.isSingleSku && (
            <Badge tone="warn">Single</Badge>
          )}
          {eskuAssigned.length > 0 && (
            <Badge tone="accent">+{eskuAssigned.length}</Badge>
          )}
        </span>

        <span style={{ flex: '0 0 80px', fontSize: 13.5, color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {pallet.articles}
        </span>
        <span style={{ flex: '0 0 90px', fontSize: 13.5, color: T.text.secondary, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {pallet.units.toLocaleString('de-DE')}
        </span>
        <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {pallet.formats.slice(0, 3).map((f) => (
            <span key={f} style={fmtTag}>{f}</span>
          ))}
          {pallet.formats.length > 3 && (
            <span style={fmtTag}>+{pallet.formats.length - 3}</span>
          )}
        </span>
        <span style={{
          flex: '0 0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          color: T.text.faint,
          transition: 'transform 200ms',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>

      {isExpanded && (
        <ExpandedPallet
          items={items}
          eskuAssigned={eskuAssigned}
          palletState={palletState}
          isLast={isLast}
        />
      )}
    </>
  );
}

function ExpandedPallet({ items, eskuAssigned, palletState, isLast }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        padding: '24px 20px 28px 60px',
        background: T.bg.surface2,
        borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
        cursor: 'default',
        display: 'grid',
        gridTemplateColumns: '360px 1fr',
        gap: 32,
        alignItems: 'flex-start',
      }}
    >
      <PalletStackViz palletState={palletState} size="card" />

      <div>
        <ItemTable items={items} title="Mixed-Inhalt (Phase 1)" />
        {eskuAssigned.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{
              fontSize: 11.5,
              fontWeight: 600,
              color: T.accent.main,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Einzelne SKU · {eskuAssigned.length} zugewiesen (Phase 2)
            </div>
            <ItemTable items={eskuAssigned} accent showLevel showFlags />
          </div>
        )}
      </div>
    </div>
  );
}

function ItemTable({ items, accent, showLevel, showFlags, title }) {
  return (
    <div>
      {title && (
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: T.text.secondary,
          marginBottom: 12,
          letterSpacing: '-0.005em',
        }}>
          {title}
          <span style={{
            color: T.text.faint,
            fontWeight: 500,
            marginLeft: 8,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
          }}>
            · {items.length}
          </span>
        </div>
      )}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {items.map((it, i) => {
          const lvl = (it.placementMeta || showLevel) ? (it.level || 1) : null;
          const meta = lvl ? LEVEL_META[lvl] : null;
          const flags = it.placementMeta?.flags || [];
          const menge = it.placementMeta
            ? (it.placementMeta.cartonsHere ?? it.einzelneSku?.cartonsCount ?? '—')
            : (it.units ?? '—');
          const mengeUnit = it.placementMeta ? (menge === 1 ? 'Karton' : 'Kartons') : 'Stk';
          const code = it.fnsku || it.sku || '—';
          const useItem = it.useItem || null;
          return (
            <ItemRow
              key={i}
              index={i + 1}
              title={formatItemTitle(it.title)}
              fullTitle={it.title}
              code={code}
              useItem={useItem}
              menge={menge}
              mengeUnit={mengeUnit}
              levelMeta={meta}
              levelNumber={lvl}
              flags={flags}
              accent={accent}
              placementMeta={it.placementMeta}
            />
          );
        })}
      </div>
    </div>
  );
}

function ItemRow({ index, title, fullTitle, code, useItem, menge, mengeUnit, levelMeta, levelNumber, flags, accent, placementMeta }) {
  const danger = flags.includes('NO_VALID_PLACEMENT');
  const warn = flags.some((f) => f.startsWith('OVERLOAD-'));
  return (
    <div
      title={fullTitle}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'flex-start',
        gap: 14,
        padding: '14px 16px',
        background: accent ? T.accent.bg : T.bg.surface,
        border: `1px solid ${accent ? T.accent.border : T.border.primary}`,
        borderRadius: T.radius.lg,
        boxShadow: T.shadow.card,
        transition: 'border-color 160ms ease, box-shadow 160ms ease',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent ? T.accent.main : T.border.strong;
        e.currentTarget.style.boxShadow = T.shadow.raised;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = accent ? T.accent.border : T.border.primary;
        e.currentTarget.style.boxShadow = T.shadow.card;
      }}
    >
      {/* Index + level badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 56, paddingTop: 2 }}>
        <span style={{
          fontFamily: T.font.mono,
          fontSize: 11,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
        }}>
          {String(index).padStart(2, '0')}
        </span>
        {levelMeta && (
          <span title={`L${levelNumber} · ${levelMeta.name}`} style={{
            display: 'inline-flex',
            width: 26, height: 26,
            borderRadius: T.radius.sm,
            background: levelMeta.color,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            L{levelNumber}
          </span>
        )}
      </div>

      {/* Title block */}
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          color: T.text.primary,
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: '-0.005em',
          lineHeight: 1.4,
          wordBreak: 'break-word',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 6,
          flexWrap: 'wrap',
        }}>
          <span>{title}</span>
          {placementMeta && (
            <ScoreBreakdown breakdown={placementMeta.breakdown} score={placementMeta.score} />
          )}
        </div>
        <div style={{
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          fontSize: 11.5,
          color: T.text.faint,
          fontFamily: T.font.mono,
          letterSpacing: '0.005em',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 500, color: T.text.muted }}>{code}</span>
          {useItem && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
                {useItem}
              </span>
            </>
          )}
          {flags.length > 0 && (
            <>
              <span style={{ opacity: 0.4 }}>·</span>
              {flags.map((f, j) => (
                <span key={j} title={f} style={{
                  fontFamily: T.font.ui,
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: danger && f === 'NO_VALID_PLACEMENT'
                    ? 'rgba(239,68,68,0.12)'
                    : 'rgba(245,158,11,0.12)',
                  color: danger && f === 'NO_VALID_PLACEMENT'
                    ? T.status.danger.text
                    : T.status.warn.text,
                  letterSpacing: '0.01em',
                }}>
                  {f.replace('OVERLOAD-', '').replace('NO_VALID_PLACEMENT', 'No fit')}
                </span>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Menge — large on the right */}
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontFamily: 'Montserrat, Inter, system-ui, sans-serif',
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.025em',
          color: danger ? T.status.danger.text : warn ? T.status.warn.text : T.text.primary,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
        }}>
          {typeof menge === 'number' ? menge.toLocaleString('de-DE') : menge}
        </div>
        <div style={{
          marginTop: 2,
          fontSize: 11,
          color: T.text.faint,
          fontWeight: 500,
        }}>
          {mengeUnit}
        </div>
      </div>
    </div>
  );
}

function ScoreBreakdown({ breakdown, score }) {
  const [open, setOpen] = useState(false);
  const reasons = [];
  if (breakdown.useItemMatch)        reasons.push(['useItem-Match', '+50000']);
  if (breakdown.formatMatch)         reasons.push(['Format-Match', '+10000']);
  if (breakdown.brandMatch)          reasons.push(['Brand-Match', '+3000']);
  if (breakdown.fnskuMatch)          reasons.push(['Same FNSKU on pallet', '+1000']);
  if (breakdown.levelMatch)          reasons.push(['Same Level on pallet', '+500']);
  if (breakdown.monoLevelConflict)   reasons.push(['Mono-Level conflict', '−10000']);
  if (breakdown.multiLevelMismatch)  reasons.push(['Multi-Level mismatch', '−200']);
  if (breakdown.fillScore)           reasons.push([`Sweet-Spot 85% (fill score)`, `+${breakdown.fillScore}`]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          width: 14, height: 14,
          borderRadius: '50%',
          background: T.bg.surface3,
          border: 'none',
          color: T.text.subtle,
          fontSize: 9,
          cursor: 'help',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title="Score breakdown"
      >
        ℹ
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          left: 18, top: -6,
          zIndex: 60,
          background: T.bg.surface,
          border: `1px solid ${T.border.strong}`,
          borderRadius: T.radius.sm,
          boxShadow: T.shadow.raised,
          padding: '8px 10px',
          fontSize: 11,
          minWidth: 220,
          color: T.text.primary,
          fontFamily: T.font.ui,
          pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            Score: {score === -Infinity ? '−∞ (kein Match)' : score}
          </div>
          {reasons.length === 0 && (
            <div style={{ color: T.text.subtle }}>Nur Geometrie (Sweet-Spot).</div>
          )}
          {reasons.map(([label, val], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: val.startsWith('−') ? T.status.danger.text : T.text.secondary }}>
                {label}
              </span>
              <span style={{
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                color: val.startsWith('−') ? T.status.danger.text : T.text.primary,
              }}>
                {val}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function StickyBar({ validated, stats, overloadCount, noValidCount, onStartFocus }) {
  const hasFlags = overloadCount > 0 || noValidCount > 0;
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
            background: validated ? T.status.success.main : T.status.warn.main,
            boxShadow: `0 0 0 4px ${validated ? T.status.success.main + '30' : T.status.warn.main + '30'}`,
          }} />
          <span style={{ fontSize: 13, color: T.text.secondary, fontWeight: 500 }}>
            {validated
              ? `Auftrag bereit — ${stats.palletCount} Paletten, ${stats.articles} Artikel`
              : 'Validierung erforderlich'}
          </span>
        </span>
        {hasFlags && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: T.status.warn.text,
            fontWeight: 600,
            padding: '4px 10px',
            background: T.status.warn.bg,
            borderRadius: T.radius.sm,
            border: `1px solid ${T.status.warn.border}`,
          }}>
            ⚠ {overloadCount > 0 && `${overloadCount} OVERLOAD`}
            {overloadCount > 0 && noValidCount > 0 && ' · '}
            {noValidCount > 0 && `${noValidCount} NO_VALID`}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12.5, color: T.text.subtle }}>
          Geschätzt {formatDur(stats.durationSec)}
        </span>
        <Button
          variant="primary"
          onClick={onStartFocus}
          disabled={!validated}
        >
          Focus-Modus starten
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </Button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
const tableHeader = {
  display: 'flex',
  alignItems: 'center',
  padding: '10px 20px',
  background: T.bg.surface2,
  borderBottom: `1px solid ${T.border.primary}`,
  fontSize: 11,
  fontWeight: 500,
  color: T.text.subtle,
  letterSpacing: '0.02em',
  gap: 0,
};

const fmtTag = {
  fontFamily: T.font.mono,
  fontSize: 11,
  padding: '2px 6px',
  background: T.bg.surface3,
  color: T.text.muted,
  borderRadius: T.radius.sm,
};

/* ── helpers ─────────────────────────────────────────────────────────── */
function formatDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function useAnimatedNumber(target, duration = 800) {
  const [value, setValue] = useState(0);
  const start = useRef(null);
  const from = useRef(0);

  useEffect(() => {
    from.current = value;
    start.current = null;
    let raf;
    const step = (ts) => {
      if (start.current == null) start.current = ts;
      const t = Math.min(1, (ts - start.current) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from.current + (target - from.current) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
