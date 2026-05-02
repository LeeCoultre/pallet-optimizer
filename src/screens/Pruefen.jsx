/* Pruefen — Schritt 02. Daten kontrollieren.
   Design System v3 (siehe DESIGN.md). */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../state.jsx';
import { pruefenView, distributeEinzelneSku } from '../utils/auftragHelpers.js';
import { SIDEBAR_WIDTH } from '../components/Sidebar.jsx';
import {
  Page, Topbar, StepperBar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Label, Badge, Button, Meta, Kpi, ValidationBanner,
  T,
} from '../components/ui.jsx';

const CAT = {
  THERMO:     { color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8', name: 'Thermorollen' },
  PRODUKTION: { color: '#10B981', bg: '#ECFDF5', text: '#047857', name: 'Big Bags / Produktion' },
  HEIPA:      { color: '#06B6D4', bg: '#ECFEFF', text: '#0E7490', name: 'Heipa' },
  VEIT:       { color: '#A855F7', bg: '#FAF5FF', text: '#7E22CE', name: 'Veit' },
  TACHO:      { color: '#F97316', bg: '#FFF7ED', text: '#C2410C', name: 'Tachorollen' },
  SONSTIGE:   { color: '#71717A', bg: '#FAFAFA', text: '#3F3F46', name: 'Sonstige' },
};

/* ════════════════════════════════════════════════════════════════════════ */
export default function PruefenScreen() {
  const { current, goToStep, cancelCurrent } = useAppState();
  const view = useMemo(() => pruefenView(current?.parsed), [current?.parsed]);
  const rawPallets = current?.parsed?.pallets || [];
  const eskuItems  = current?.parsed?.einzelneSkuItems || [];
  const eskuResult = useMemo(() => distributeEinzelneSku(rawPallets, eskuItems), [rawPallets, eskuItems]);
  const eskuDist   = eskuResult.byPalletId;

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

        {/* Auslastung + Kategorien */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)',
          gap: 12,
          marginBottom: 32,
        }}>
          <AuslastungCard pct={view.stats.fillPct} />
          <CategoriesCard pallets={view.pallets} />
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

        {/* Pallets table */}
        <section style={{ marginBottom: 40 }}>
          <SectionHeader
            title={`Paletten (${view.pallets.length})`}
            sub={`Klick auf eine Palette zeigt alle Artikel${eskuItems.length > 0 ? ' inkl. der zugewiesenen Einzelne-SKU-Items' : ''}. Reihenfolge: leichteste zuerst, Tachorollen zum Schluss.`}
          />
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={tableHeader}>
              <span style={{ width: 40 }}>#</span>
              <span style={{ flex: '0 0 90px' }}>Pallet-ID</span>
              <span style={{ flex: '0 0 160px' }}>Kategorie</span>
              <span style={{ flex: '0 0 90px' }}>Artikel</span>
              <span style={{ flex: '0 0 110px' }}>Einheiten</span>
              <span style={{ flex: '0 0 130px' }}>Auslastung</span>
              <span style={{ flex: 1 }}>Formate</span>
              <span style={{ flex: '0 0 24px' }} />
            </div>
            {view.pallets.map((p, i) => {
              const raw = rawPallets.find((r) => r.id === p.id);
              const eskuAssigned = eskuDist[p.id] || [];
              return (
                <PalletRow
                  key={p.id}
                  pallet={p}
                  index={i}
                  items={raw?.items || []}
                  eskuAssigned={eskuAssigned}
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
          <Meta label="Volumen"       value={`${(pct * 7.92).toFixed(2)} m³`} mono />
          <Meta label="Kapazität"     value="7,92 m³" mono />
          <Meta label="Maximalhöhe"   value="1.650 mm" mono />
        </div>
      </div>
    </Card>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function CategoriesCard({ pallets }) {
  const totals = {};
  let grand = 0;
  pallets.forEach((p) => {
    totals[p.category] = (totals[p.category] || 0) + p.units;
    grand += p.units;
  });
  const segments = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, units]) => ({
      cat,
      units,
      pct: units / grand,
      meta: CAT[cat] || CAT.SONSTIGE,
    }));

  return (
    <Card style={{ padding: '20px 24px' }}>
      <SectionHeader
        title="Kategorien"
        sub={`Verteilung über ${grand.toLocaleString('de-DE')} Einheiten.`}
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
        {segments.map((s, i) => (
          <div
            key={s.cat}
            title={`${s.meta.name}: ${s.units.toLocaleString('de-DE')} (${Math.round(s.pct * 100)}%)`}
            style={{
              width: `${s.pct * 100}%`,
              background: s.meta.color,
              borderRight: i < segments.length - 1 ? `2px solid ${T.bg.surface}` : 'none',
              transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
      }}>
        {segments.map((s) => (
          <div key={s.cat} style={{
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
              background: s.meta.color,
              borderRadius: 2,
              flexShrink: 0,
            }} />
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
                {s.cat}
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
function PalletRow({ pallet, index, items, eskuAssigned, isExpanded, onToggle, isLast }) {
  const cat = CAT[pallet.category] || CAT.SONSTIGE;
  const fill = Math.round(pallet.fillPct * 100);
  return (
    <>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: !isLast && !isExpanded ? `1px solid ${T.border.subtle}` : 'none',
          background: isExpanded ? T.bg.surface2 : T.bg.surface,
          cursor: 'pointer',
          transition: 'background 150ms',
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
        <span style={{ flex: '0 0 160px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <Badge color={cat.color} bg={cat.bg} text={cat.text}>
            {pallet.category}
          </Badge>
          {eskuAssigned.length > 0 && (
            <Badge tone="accent">+{eskuAssigned.length} ESKU</Badge>
          )}
        </span>
        <span style={{ flex: '0 0 90px', fontSize: 13.5, color: T.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {pallet.articles}
        </span>
        <span style={{ flex: '0 0 110px', fontSize: 13.5, color: T.text.secondary, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {pallet.units.toLocaleString('de-DE')}
        </span>
        <span style={{ flex: '0 0 130px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 60,
            height: 6,
            background: T.bg.surface3,
            borderRadius: T.radius.full,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.min(100, fill)}%`,
              height: '100%',
              background: cat.color,
            }} />
          </div>
          <span style={{ fontSize: 12, color: T.text.subtle, fontVariantNumeric: 'tabular-nums' }}>
            {fill}%
          </span>
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
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '8px 20px 20px 60px',
            background: T.bg.surface2,
            borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
            cursor: 'default',
          }}
        >
          <ItemTable items={items} />
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
                Einzelne SKU · {eskuAssigned.length} zugewiesen
              </div>
              <ItemTable items={eskuAssigned} accent />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ItemTable({ items, accent }) {
  return (
    <div style={{
      background: T.bg.surface,
      border: `1px solid ${T.border.primary}`,
      borderRadius: T.radius.md,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 2.4fr) 1.2fr 1.2fr 80px',
        padding: '8px 14px',
        background: T.bg.surface2,
        borderBottom: `1px solid ${T.border.primary}`,
        fontSize: 11,
        fontWeight: 500,
        color: T.text.subtle,
      }}>
        <span>#</span>
        <span>Name</span>
        <span>Code</span>
        <span>Use-Item</span>
        <span style={{ textAlign: 'right' }}>Menge</span>
      </div>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: '40px minmax(0, 2.4fr) 1.2fr 1.2fr 80px',
          padding: '8px 14px',
          borderBottom: i < items.length - 1 ? `1px solid ${T.border.subtle}` : 'none',
          alignItems: 'center',
          fontSize: 13,
          color: T.text.secondary,
          background: accent ? T.accent.bg : T.bg.surface,
        }}>
          <span style={{ fontSize: 11, color: T.text.faint, fontVariantNumeric: 'tabular-nums' }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <span style={{
            color: T.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }} title={it.title}>
            {(it.title || '').length > 50 ? (it.title || '').slice(0, 47) + '…' : (it.title || '—')}
          </span>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 12,
            color: T.text.muted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {it.fnsku || it.sku || '—'}
          </span>
          <span style={{
            fontFamily: T.font.mono,
            fontSize: 12,
            color: T.text.subtle,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {it.useItem || '—'}
          </span>
          <span style={{
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            textAlign: 'right',
            color: T.text.primary,
          }}>
            {it.units || 0}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════ */
function StickyBar({ validated, stats, onStartFocus }) {
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
      marginLeft: SIDEBAR_WIDTH,
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
