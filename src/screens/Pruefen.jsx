/* Pruefen — Schritt 02. Daten kontrollieren.
   Design System v3 (siehe DESIGN.md).

   v2 — SOP v1.1: 6-level hierarchy, PalletStackViz, OVERLOAD flags. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppState } from '../state.jsx';
import {
  pruefenView, distributeEinzelneSku, enrichItemDims,
  levelDistribution, sortItemsForPallet,
} from '../utils/auftragHelpers.js';
import { lookupSkuDimensions } from '../marathonApi.js';
import {
  Page, Topbar, StepperBar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Label, Badge, Button, Meta, Kpi,
  T,
} from '../components/ui.jsx';
import PreflightCard from '../components/PreflightCard.jsx';
import PalletStoryCard from '../components/PalletStoryCard.jsx';
import PalletMiniCard from '../components/PalletMiniCard.jsx';
import { analyzeAuftrag } from '../utils/preflightAnalyzer.js';
import { buildPalletStory, rankPallets } from '../utils/palletStory.js';

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

  const validation = current?.validation || { ok: true, errorCount: 0, warningCount: 0, issues: [] };
  const validView = {
    ok: validation.ok ?? (validation.errorCount === 0),
    errors: validation.errorCount || 0,
    warnings: validation.warningCount || 0,
  };
  const onStartFocus = () => {
    if (validView.errors === 0) goToStep('focus');
  };

  // Pre-flight briefing — single source of truth for "is this Auftrag ready?".
  // Aggregates parsing/structural/capacity/coverage flags into one card above
  // the pallet list. Pure function; recomputes only when its inputs change.
  const briefing = useMemo(
    () => analyzeAuftrag({
      parsed: current?.parsed,
      validation,
      distribution,
      enrichedPallets,
      enrichedEsku,
    }),
    [current?.parsed, validation, distribution, enrichedPallets, enrichedEsku],
  );

  // View-mode for the pallet section: 'story' (full hero cards, default)
  // or 'overview' (compact 3-up grid for fast scan). Stored in localStorage
  // so the operator's choice survives refresh.
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'story';
    return localStorage.getItem('pruefen.palletViewMode') === 'overview'
      ? 'overview' : 'story';
  });
  const switchViewMode = (mode) => {
    setViewMode(mode);
    try { localStorage.setItem('pruefen.palletViewMode', mode); } catch { /* ignore quota */ }
  };

  const handleJumpToPallet = (palletId) => {
    // From PreflightCard or MiniCard click — always land on the full Story
    // Card so the operator gets context, not just a thumbnail.
    if (viewMode !== 'story') switchViewMode('story');
    setTimeout(() => {
      const el = document.getElementById(`pallet-row-${palletId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  // One-shot superlative ranking ("Größte Palette" etc.) — pure function,
  // recomputes only when pallets/states change.
  const ranking = useMemo(
    () => rankPallets(view?.pallets || [], palletStates),
    [view?.pallets, palletStates],
  );

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

        {/* Pre-flight briefing — replaces parsing-validation + OVERLOAD banners
            with one unified card that aggregates everything the operator
            needs to know BEFORE diving into the pallet list. */}
        <div style={{ marginTop: 16, marginBottom: 32 }}>
          <PreflightCard briefing={briefing} onJumpToPallet={handleJumpToPallet} />
        </div>

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

        {/* Pallets — Story Cards (default) or Übersicht grid for quick scan. */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader
            title={`Paletten (${view.pallets.length})`}
            sub={
              viewMode === 'overview'
                ? 'Übersicht — alle Paletten als Mini-Karten für schnellen Vergleich. Klick öffnet die volle Story.'
                : (eskuItems.length > 0
                    ? `Story-Karten — Headline, Auslastung und Top-Artikel pro Palette. ${eskuItems.length} ESKU-Kartons sind verteilt.`
                    : 'Story-Karten — Headline, Auslastung und Top-Artikel pro Palette.')
            }
            right={
              <ViewModeToggle
                value={viewMode}
                onChange={switchViewMode}
              />
            }
          />
          {viewMode === 'overview' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}>
              {view.pallets.map((p, i) => {
                const raw = enrichedPallets.find((r) => r.id === p.id);
                const eskuAssigned = sortItemsForPallet(eskuDist[p.id] || []);
                const palletState = palletStates[p.id];
                const story = buildPalletStory({
                  pallet: p,
                  items: raw?.items || [],
                  eskuAssigned,
                  palletState,
                  ranking,
                });
                return (
                  <PalletMiniCard
                    key={p.id}
                    pallet={p}
                    index={i}
                    eskuAssigned={eskuAssigned}
                    palletState={palletState}
                    story={story}
                    onClick={() => handleJumpToPallet(p.id)}
                  />
                );
              })}
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}>
              {view.pallets.map((p, i) => {
                const raw = enrichedPallets.find((r) => r.id === p.id);
                const eskuAssigned = sortItemsForPallet(eskuDist[p.id] || []);
                const palletState = palletStates[p.id];
                const story = buildPalletStory({
                  pallet: p,
                  items: raw?.items || [],
                  eskuAssigned,
                  palletState,
                  ranking,
                });
                return (
                  <PalletStoryCard
                    key={p.id}
                    pallet={p}
                    index={i}
                    items={raw?.items || []}
                    eskuAssigned={eskuAssigned}
                    palletState={palletState}
                    story={story}
                  />
                );
              })}
            </div>
          )}
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
/* Segmented toggle for the Paletten section view-mode. Two pill buttons,
   the active one filled with surface, the other ghosted — matches the
   density-toggle pattern used elsewhere in the design system. */
function ViewModeToggle({ value, onChange }) {
  const options = [
    { id: 'story',    label: 'Story',     icon: <StoryIcon /> },
    { id: 'overview', label: 'Übersicht', icon: <GridIcon /> },
  ];
  return (
    <div style={{
      display: 'inline-flex',
      gap: 2,
      padding: 2,
      background: T.bg.surface3,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
    }}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={active}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              fontSize: 12,
              fontWeight: 500,
              color: active ? T.text.primary : T.text.subtle,
              background: active ? T.bg.surface : 'transparent',
              border: 0,
              borderRadius: T.radius.sm,
              cursor: 'pointer',
              fontFamily: T.font.ui,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              transition: 'background 150ms, color 150ms',
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StoryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="3" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
function GridIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

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
