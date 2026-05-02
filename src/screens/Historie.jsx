/* Historie — abgeschlossene Aufträge.
   Design System v3 (siehe DESIGN.md). */

import { useMemo, useState } from 'react';
import { useAppState } from '../state.jsx';
import {
  Page, Topbar,
  Card, SectionHeader, Eyebrow, PageH1, Lead,
  Button, Kpi, EmptyState, T,
} from '../components/ui.jsx';

export default function HistorieScreen() {
  const { history, removeHistoryEntry, clearHistory } = useAppState();
  const [openId, setOpenId] = useState(null);

  const totals = useMemo(() => {
    return history.reduce((acc, h) => ({
      orders:   acc.orders + 1,
      pallets:  acc.pallets + (h.palletCount || 0),
      articles: acc.articles + (h.articleCount || 0),
      seconds:  acc.seconds + (h.durationSec || 0),
    }), { orders: 0, pallets: 0, articles: 0, seconds: 0 });
  }, [history]);

  return (
    <Page>
      <Topbar
        crumbs={[
          { label: 'Workspace', muted: true },
          { label: 'Historie' },
        ]}
        right={
          history.length > 0 && (
            <span style={{ fontSize: 12, color: T.text.subtle }}>
              {history.length} {history.length === 1 ? 'Eintrag' : 'Einträge'} · lokal gespeichert
            </span>
          )
        }
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 32px 80px' }}>

        {/* Page intro */}
        <section style={{ marginBottom: 32 }}>
          <Eyebrow>Workspace · Historie</Eyebrow>
          <PageH1>Abgeschlossene Aufträge</PageH1>
          <Lead>
            Alle erledigten Lagerauftrag-Sitzungen mit Dauer, Palettenzeiten und
            Artikelübersicht. Die Daten liegen lokal im Browser — kein Backend.
          </Lead>
        </section>

        {/* Totals KPI */}
        {history.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionHeader title="Gesamt" sub="Alles, was du bisher geschafft hast." />
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
            }}>
              <Kpi label="Aufträge"   value={totals.orders} />
              <Kpi label="Paletten"   value={totals.pallets} />
              <Kpi label="Artikel"    value={totals.articles} />
              <Kpi label="Gesamtzeit" value={formatDurationLong(totals.seconds)} sub="kumuliert" />
            </div>
          </section>
        )}

        {/* Entries list */}
        <section>
          <SectionHeader
            title={`Einträge${history.length > 0 ? ` (${history.length})` : ''}`}
            sub="Klick auf einen Eintrag öffnet Palettenzeiten und alle Artikel."
            right={history.length > 0 && (
              <Button variant="subtle" onClick={clearHistory}>
                Alle löschen
              </Button>
            )}
          />

          {history.length === 0 ? (
            <EmptyState
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                  <path d="M3 12a9 9 0 1 0 2.4-6.15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M3 4v4.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              title="Noch keine Aufträge abgeschlossen"
              description="Sobald du den ersten Lagerauftrag durchgearbeitet und gespeichert hast, erscheint er hier mit allen Details."
            />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <div style={tableHeader}>
                <span style={{ flex: '0 0 40px' }}>#</span>
                <span style={{ flex: '1 1 280px' }}>FBA / Datei</span>
                <span style={{ flex: '0 0 90px' }}>Paletten</span>
                <span style={{ flex: '0 0 90px' }}>Artikel</span>
                <span style={{ flex: '0 0 110px' }}>Dauer</span>
                <span style={{ flex: '0 0 160px' }}>Abgeschlossen</span>
                <span style={{ flex: '0 0 36px' }} />
              </div>
              {history.map((h, i) => (
                <Row
                  key={h.id}
                  entry={h}
                  index={i}
                  isLast={i === history.length - 1}
                  isOpen={openId === h.id}
                  onToggle={() => setOpenId(openId === h.id ? null : h.id)}
                  onRemove={() => removeHistoryEntry(h.id)}
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
function Row({ entry, index, isLast, isOpen, onToggle, onRemove }) {
  return (
    <>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: !isOpen && !isLast ? `1px solid ${T.border.subtle}` : 'none',
          cursor: 'pointer',
          background: isOpen ? T.bg.surface2 : T.bg.surface,
          transition: 'background 150ms',
        }}
        onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = T.bg.surface2; }}
        onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = T.bg.surface; }}
      >
        <span style={{
          flex: '0 0 40px',
          fontSize: 12,
          color: T.text.faint,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>

        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{
            fontFamily: T.font.mono,
            fontSize: 13.5,
            fontWeight: 500,
            color: T.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {entry.fbaCode}
          </div>
          <div style={{
            fontSize: 11.5,
            color: T.text.subtle,
            marginTop: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {entry.fileName}
          </div>
        </div>

        <span style={{
          flex: '0 0 90px',
          fontSize: 13.5,
          color: T.text.secondary,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {entry.palletCount}
        </span>
        <span style={{
          flex: '0 0 90px',
          fontSize: 13.5,
          color: T.text.secondary,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {entry.articleCount}
        </span>
        <span style={{
          flex: '0 0 110px',
          fontFamily: T.font.mono,
          fontSize: 13,
          color: T.accent.main,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatDurationShort(entry.durationSec)}
        </span>
        <span style={{
          flex: '0 0 160px',
          fontSize: 12.5,
          color: T.text.subtle,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {formatTimestamp(entry.finishedAt)}
        </span>

        <div style={{ flex: '0 0 36px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Eintrag entfernen"
            style={{
              width: 28, height: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 0,
              borderRadius: T.radius.sm,
              color: T.text.faint,
              cursor: 'pointer',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = T.status.danger.bg;
              e.currentTarget.style.color = T.status.danger.main;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = T.text.faint;
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '14px 20px 20px 60px',
            background: T.bg.surface2,
            borderBottom: !isLast ? `1px solid ${T.border.subtle}` : 'none',
            cursor: 'default',
          }}
        >
          {/* Pallet timings */}
          <div style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 10,
          }}>
            Palettenzeiten ({Object.keys(entry.palletTimings || {}).length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {Object.entries(entry.palletTimings || {}).map(([id, t]) => {
              const dur = t.startedAt && t.finishedAt
                ? Math.round((t.finishedAt - t.startedAt) / 1000) : null;
              return (
                <span key={id} style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  background: T.bg.surface,
                  border: `1px solid ${T.border.primary}`,
                  borderRadius: T.radius.md,
                  fontFamily: T.font.mono,
                  fontSize: 11.5,
                  color: T.text.secondary,
                }}>
                  <span style={{ color: T.text.primary, fontWeight: 500 }}>{id}</span>
                  <span style={{ color: T.text.faint }}>·</span>
                  <span style={{ color: T.accent.main, fontWeight: 500 }}>
                    {dur != null ? formatMmSs(dur) : '—'}
                  </span>
                </span>
              );
            })}
            {Object.keys(entry.palletTimings || {}).length === 0 && (
              <span style={{ fontSize: 12.5, color: T.text.faint }}>
                Keine Palettenzeiten erfasst.
              </span>
            )}
          </div>

          {/* Articles */}
          <div style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: T.text.subtle,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 10,
          }}>
            Artikel ({entry.articles?.length || 0})
          </div>
          <div style={{
            border: `1px solid ${T.border.primary}`,
            background: T.bg.surface,
            borderRadius: T.radius.md,
            overflow: 'hidden',
            maxHeight: 320,
            overflowY: 'auto',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '70px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
              padding: '8px 14px',
              background: T.bg.surface2,
              borderBottom: `1px solid ${T.border.primary}`,
              fontSize: 11,
              fontWeight: 500,
              color: T.text.subtle,
              position: 'sticky',
              top: 0,
            }}>
              <span>Palette</span>
              <span>Name</span>
              <span>Code</span>
              <span>Use-Item</span>
              <span style={{ textAlign: 'right' }}>Menge</span>
            </div>
            {(entry.articles || []).slice(0, 200).map((a, j) => (
              <div key={j} style={{
                display: 'grid',
                gridTemplateColumns: '70px minmax(0, 2.4fr) 1.2fr 1.2fr 70px',
                padding: '8px 14px',
                borderBottom: j < (entry.articles?.length || 0) - 1 ? `1px solid ${T.border.subtle}` : 'none',
                fontSize: 12.5,
                color: T.text.secondary,
                alignItems: 'center',
              }}>
                <span style={{
                  fontFamily: T.font.mono,
                  fontSize: 11.5,
                  color: T.text.faint,
                }}>
                  {a.palletId}
                </span>
                <span style={{
                  color: T.text.primary,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.title}
                </span>
                <span style={{
                  fontFamily: T.font.mono,
                  fontSize: 11.5,
                  color: T.text.muted,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.fnsku || a.sku || '—'}
                </span>
                <span style={{
                  fontFamily: T.font.mono,
                  fontSize: 11.5,
                  color: T.text.subtle,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {a.useItem || '—'}
                </span>
                <span style={{
                  fontWeight: 600,
                  color: T.text.primary,
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {a.units || 0}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
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
};

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
function formatTimestamp(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy}, ${h}:${m}`;
}
